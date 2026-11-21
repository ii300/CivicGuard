const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
    // Exercise the entire account/storage flow without external services or AI.
    await page.route("**/*", (route) => {
        const host = new URL(route.request().url()).hostname;
        return ["127.0.0.1", "localhost"].includes(host) ? route.continue() : route.abort();
    });
});

async function register(page) {
    const email = `browser-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    await page.goto("/register");
    await page.getByLabel("Name", { exact: true }).fill("Community Planner");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("a browser test passphrase");
    await page.getByLabel("Confirm password").fill("a browser test passphrase");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/\/verify-email$/);
    await page.getByRole("link", { name: "Open email preview" }).click();
    await page.getByRole("link", { name: "Open account link" }).click();
    await page.getByRole("button", { name: "Verify email", exact: true }).click();
    await expect(page).toHaveURL(/\/console$/);
    await expect(page.locator("#saveDraftButton")).toBeEnabled();
    return email;
}

test("register, save multilingual draft, reload, update, sign out, sign in, and delete", async ({ page }) => {
    const email = await register(page);
    const editor = page.getByRole("textbox", { name: "Alert text", exact: true });
    await page.getByLabel("Draft title", { exact: true }).fill("Community exercise");
    await editor.fill("English exercise draft.");
    await page.getByRole("tab", { name: "中文", exact: true }).click();
    await editor.fill("社区演练草稿。");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.locator("#saveStatus")).toHaveText("Saved to your account.");
    await page.reload();
    const selected = page.locator("#savedDraftSelect");
    await expect(selected.locator("option")).toHaveCount(2);
    await selected.selectOption({ index: 1 });
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(editor).toHaveValue("社区演练草稿。");
    await page.getByRole("tab", { name: "EN", exact: true }).click();
    await expect(editor).toHaveValue("English exercise draft.");
    await editor.fill("Revised English exercise draft.");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.locator("#saveStatus")).toHaveText("Saved to your account.");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/console");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("a browser test passphrase");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(selected.locator("option")).toHaveCount(2);
    await selected.selectOption({ index: 1 });
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(editor).toHaveValue("Revised English exercise draft.");
    await expect(page.locator("#approvalStatus")).toHaveText("Pending simulation review");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(selected.locator("option")).toHaveCount(1);
    await expect(selected).toContainText("No saved drafts yet");
});

test("registration displays mismatch errors and mobile pages do not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/", "/register", "/login", "/forgot-password", "/help", "/privacy"]) {
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }
    await page.goto("/register");
    await page.getByLabel("Name", { exact: true }).fill("Test Person");
    await page.getByLabel("Email address").fill("mismatch@example.com");
    await page.getByLabel("Password", { exact: true }).fill("a long first password");
    await page.getByLabel("Confirm password").fill("a long second password");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("The passwords do not match.");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});

test("a second browser reads the same account, stale edits cannot overwrite, and reset signs it out", async ({ page, browser }) => {
    const email = await register(page);
    await page.getByLabel("Draft title", { exact: true }).fill("Shared across my devices");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.locator("#saveStatus")).toHaveText("Saved to your account.");
    const device = await browser.newContext();
    const other = await device.newPage();
    try {
        await other.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
        await other.goto("http://127.0.0.1:5055/login");
        await other.getByLabel("Email address").fill(email);
        await other.getByLabel("Password", { exact: true }).fill("a browser test passphrase");
        await other.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(other.locator("#savedDraftSelect option")).toHaveCount(2);
        await other.locator("#savedDraftSelect").selectOption({ index: 1 });
        await other.getByRole("button", { name: "Open", exact: true }).click();
        await expect(other.getByLabel("Draft title", { exact: true })).toHaveValue("Shared across my devices");
        await page.getByLabel("Draft title", { exact: true }).fill("Updated on the first device");
        await page.getByRole("button", { name: "Save changes", exact: true }).click();
        await expect(page.locator("#saveStatus")).toHaveText("Saved to your account.");
        await other.getByLabel("Draft title", { exact: true }).fill("An older copy");
        await other.getByRole("button", { name: "Save changes", exact: true }).click();
        await expect(other.locator("#saveStatus")).toContainText("another tab or device");
        await other.getByRole("button", { name: "Save as new", exact: true }).click();
        await expect(other.locator("#saveStatus")).toHaveText("Saved to your account.");
        await page.goto("/forgot-password");
        await page.getByLabel("Email address").fill(email);
        await page.getByRole("button", { name: "Send reset link" }).click();
        await page.goto("/dev/email-preview");
        await page.getByRole("link", { name: "Open account link" }).click();
        await page.getByLabel("New password", { exact: true }).fill("my replacement test passphrase");
        await page.getByLabel("Confirm new password").fill("my replacement test passphrase");
        await page.getByRole("button", { name: "Reset password", exact: true }).click();
        await expect(page).toHaveURL(/\/login$/);
        await other.goto("http://127.0.0.1:5055/console");
        await expect(other).toHaveURL(/\/login$/);
        await page.getByLabel("Email address").fill(email);
        await page.getByLabel("Password", { exact: true }).fill("my replacement test passphrase");
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await page.setViewportSize({ width: 390, height: 844 });
        for (const path of ["/console", "/account"]) {
            await page.goto(path);
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        }
    } finally {
        await device.close();
    }
});
