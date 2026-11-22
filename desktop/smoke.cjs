"use strict";

const assert = require("node:assert/strict");
const { mkdtemp, realpath, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron, expect } = require("@playwright/test");
const { APP_URL } = require("./policy.cjs");

async function main() {
    const executablePath = process.env.CIVICGUARD_EXECUTABLE_PATH;
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), "civicguard-smoke-"));
    const launchOptions = {
        ...(executablePath ? { executablePath } : {}),
        args: [
            ...(executablePath ? [] : [path.join(__dirname, "..")]),
            `--user-data-dir=${userDataDir}`,
            "--host-resolver-rules=MAP * ~NOTFOUND",
        ],
        timeout: 30000,
    };
    let electronApp;
    try {
        electronApp = await electron.launch(launchOptions);
        const actualUserData = await electronApp.evaluate(({ app }) => app.getPath("userData"));
        assert.equal(await realpath(actualUserData), await realpath(userDataDir), "Smoke tests must use an isolated profile");
        if (executablePath) {
            const bundle = await electronApp.evaluate(({ app }) => ({ packaged: app.isPackaged, appPath: app.getAppPath() }));
            assert.equal(bundle.packaged, true, "The supplied executable must be a packaged app");
            assert.match(bundle.appPath, /app\.asar$/, "Packaged assets must load from the ASAR bundle");
        }
        let page = await electronApp.firstWindow();
        await page.waitForURL(APP_URL, { waitUntil: "load" });
        // Reload with all remote requests blocked: packaged UI and sample data must work offline.
        await electronApp.context().route("https://**/*", (route) => route.abort("internetdisconnected"));
        await page.reload();
        await expect(page.locator("h1")).toHaveText("Palisades Fire Simulation");
        await expect(page.locator("#lastUpdated")).toContainText("Offline exercise ready");
        await expect(page.locator("#perimeterSource")).toContainText("Sample");
        await expect(page.locator("#roadSource")).toContainText("Sample");
        await expect(page.locator("#careSource")).toContainText("Sample");
        await expect(page.locator("#map .leaflet-control-zoom")).toBeVisible();
        // Exercise the compact desktop layout as well as the wider console.
        // Map panes must never cover the composer or its controls.
        for (const width of [1280, 1024, 800]) {
            await electronApp.evaluate(({ BrowserWindow }, contentWidth) => {
                BrowserWindow.getAllWindows()[0].setContentSize(contentWidth, 768);
            }, width);
            await expect.poll(() => page.locator("#releasePanel").evaluate((panel) => {
                const rect = panel.getBoundingClientRect();
                const covered = [];
                for (const xRatio of [0.1, 0.3, 0.5, 0.7, 0.9]) {
                    for (const yRatio of [0.1, 0.3, 0.5, 0.7, 0.9]) {
                        const x = rect.left + rect.width * xRatio;
                        const y = rect.top + rect.height * yRatio;
                        if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) continue;
                        if (!panel.contains(document.elementFromPoint(x, y))) covered.push([xRatio, yRatio]);
                    }
                }
                return covered;
            })).toEqual([]);
            const draft = `Desktop ${width}px draft — preserved across language switches`;
            await page.locator("#alertText").fill(draft);
            await page.locator('[data-lang="zh"]').click();
            await page.locator('[data-lang="en"]').click();
            await expect(page.locator("#alertText")).toHaveValue(draft);
            await page.locator("#approveButton").click();
            await expect(page.locator("#releaseState")).toContainText("No public alerts have been sent");
        }
        await expect(page.locator("#draftSaveStatus")).toHaveText("Saved on this device.");
        await page.reload();
        await expect(page.locator("#alertText")).toHaveValue("Desktop 800px draft — preserved across language switches");
        await expect(page.locator("#approvalStatus")).toHaveText("Pending simulation review");
        await expect(page.locator("#approveButton")).toHaveText("Approve Simulation");
        await expect(page.locator("#approveButton")).toBeEnabled();
        // A fresh process must recover disk-backed drafts, without carrying an
        // approval forward from the previous app session.
        await page.locator("#approveButton").click();
        await expect(page.locator("#approvalStatus")).toHaveText("Approved in simulation");
        await electronApp.close();
        electronApp = undefined;
        electronApp = await electron.launch(launchOptions);
        page = await electronApp.firstWindow();
        await page.waitForURL(APP_URL, { waitUntil: "load" });
        await expect(page.locator("#alertText")).toHaveValue("Desktop 800px draft — preserved across language switches");
        await expect(page.locator("#approvalStatus")).toHaveText("Pending simulation review");
        await expect(page.locator("#approveButton")).toHaveText("Approve Simulation");
        await expect(page.locator("#approveButton")).toBeEnabled();
        await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 768));
        assert.deepEqual(await page.evaluate(() => ({ node: typeof require, process: typeof process })), { node: "undefined", process: "undefined" });
        const preferences = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
        assert.equal(preferences.sandbox, true);
        assert.equal(preferences.contextIsolation, true);
        assert.equal(preferences.nodeIntegration, false);
        assert.equal(preferences.webSecurity, true);
        assert.equal(await page.evaluate(async () => (await fetch("/package.json")).status), 404);
        assert.equal(await page.evaluate(async () => (await fetch("/script.js", { method: "POST" })).status), 405);
        assert.equal(await page.evaluate(() => Notification.permission), "denied");
        await page.evaluate(() => window.open("https://example.com/"));
        assert.equal(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
        await page.evaluate(() => { window.location.href = "https://example.com/"; });
        // Read the renderer's committed URL: a canceled navigation can leave
        // Playwright's URL matcher waiting on an intentionally aborted load.
        await expect.poll(() => page.evaluate(() => window.location.href)).toBe(APP_URL);
        const screenshot = executablePath ? "desktop-packaged-smoke.png" : "desktop-smoke.png";
        await page.screenshot({ path: path.join(__dirname, "..", "output", screenshot), fullPage: true });
        console.log("Desktop smoke passed: offline console, responsive controls, draft persistence through reload and full restart, approval reset and security boundaries.");
    } catch (error) {
        const page = electronApp?.windows()[0];
        if (page && !page.isClosed()) {
            await page.screenshot({ path: path.join(__dirname, "..", "output", "desktop-smoke-failure.png"), fullPage: true }).catch(() => {});
        }
        throw error;
    } finally {
        try {
            if (electronApp) await electronApp.close();
        } finally {
            await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
