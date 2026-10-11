const { test, expect } = require("@playwright/test");

const emptyCollection = { type: "FeatureCollection", features: [] };
const serviceNames = {
    perimeter: "Eaton_and_Palisades_Dissolved_Fire_Perimeters",
    roads: "Road_Closures_Feb2025_Activation_view",
    care: "City_of_LA_Mass_Care_Locations",
};
const sourceIds = ["perimeterSource", "roadSource", "careSource"];
const pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
    const errors = [];
    pageErrors.set(page, errors);
    page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
    expect(pageErrors.get(page), "the console must not throw uncaught browser errors").toEqual([]);
});

async function mockNetwork(page, { failSources = false, blockLeaflet = false, data = {} } = {}) {
    // No test depends on a public service or CDN being reachable.
    await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
            await route.continue();
        } else {
            await route.abort();
        }
    });
    await page.route("https://unpkg.com/leaflet@1.9.4/dist/**", async (route) => {
        const filename = new URL(route.request().url()).pathname.split("/").pop();
        if (blockLeaflet || !["leaflet.js", "leaflet.css"].includes(filename)) {
            await route.abort();
            return;
        }
        await route.fulfill({
            path: require.resolve(`leaflet/dist/${filename}`),
            contentType: filename.endsWith(".js") ? "application/javascript" : "text/css",
            headers: { "access-control-allow-origin": "*" },
        });
    });
    await page.route("**/FeatureServer/0/query?**", async (route) => {
        const url = route.request().url();
        const entry = Object.entries(serviceNames).find(([, name]) => url.includes(name));
        if (!entry) {
            await route.abort();
            return;
        }
        const [key] = entry;
        await route.fulfill({
            status: failSources ? 503 : 200,
            contentType: "application/json",
            headers: { "access-control-allow-origin": "*" },
            body: JSON.stringify(failSources ? { error: "Test service unavailable" } : data[key] || emptyCollection),
        });
    });
}

async function openConsole(page, options) {
    await mockNetwork(page, options);
    await page.goto("/");
    await expect(page.getByRole("textbox", { name: "Alert text", exact: true })).not.toHaveValue("");
    for (const id of sourceIds) {
        await expect(page.locator(`#${id}`)).not.toContainText("Loading");
    }
}

test("empty remote services show zero records without substituting sample incidents", async ({ page }) => {
    await openConsole(page);
    await expect(page.locator("#closureCount")).toHaveText("0 (remote)");
    for (const id of sourceIds) {
        await expect(page.locator(`#${id}`)).toContainText("Remote · 0 records");
        await expect(page.locator(`#${id}`)).not.toContainText("Sample");
    }
    await expect(page.locator(".closure-marker, .care-marker")).toHaveCount(0);
    await expect(page.locator("#basemapStatus")).toHaveText("Basemap unavailable; scenario layers only");
});

test("failed services clearly label fallback records as samples", async ({ page }) => {
    await openConsole(page, { failSources: true });
    for (const id of sourceIds) {
        await expect(page.locator(`#${id}`)).toContainText("Sample ·");
        await expect(page.locator(`#${id}`)).toContainText("HTTP 503");
    }
    await expect(page.locator("#closureCount")).toHaveText("5 (sample)");
    await expect(page.locator("#roadStatus")).toHaveText("Sample · 5 records");
    await expect(page.locator(".closure-marker")).toHaveCount(5);
    await expect(page.locator("#approvalStatus")).toHaveText("Pending simulation review");
});

test("a remote road marker is clickable and external popup text cannot create HTML", async ({ page }) => {
    const maliciousTitle = `<img src=x onerror="window.popupInjection=true"> Main & Side`;
    const maliciousDirections = `<svg onload="window.popupInjection=true"></svg>`;
    await openConsole(page, {
        data: {
            roads: {
                type: "FeatureCollection",
                features: [{
                    type: "Feature",
                    geometry: { type: "Point", coordinates: [-118.65, 34.12] },
                    properties: {
                        Road_Closure: maliciousTitle,
                        Type_Of_Closure: "Hard Closure",
                        Directions: maliciousDirections,
                    },
                }],
            },
        },
    });
    await expect(page.locator("#closureCount")).toHaveText("1 (remote)");
    await page.locator(".closure-marker").click();
    const popup = page.locator(".leaflet-popup-content");
    await expect(popup).toBeVisible();
    await expect(popup.locator("strong")).toHaveText(maliciousTitle);
    await expect(popup).toContainText(maliciousDirections);
    await expect(popup.locator("img, svg, script")).toHaveCount(0);
    expect(await page.evaluate(() => window.popupInjection)).toBeUndefined();
});

test("edited English and Spanish drafts survive language switches", async ({ page }) => {
    await openConsole(page);
    const editor = page.getByRole("textbox", { name: "Alert text", exact: true });
    await editor.fill("English draft reviewed by the operator.");
    await page.getByRole("tab", { name: "ES", exact: true }).click();
    await expect(editor).toHaveValue(/^BORRADOR DE SIMULACIÓN:/);
    await expect(editor).toHaveAttribute("lang", "es");
    await editor.fill("Borrador revisado en español.");
    await page.getByRole("tab", { name: "EN", exact: true }).click();
    await expect(editor).toHaveValue("English draft reviewed by the operator.");
    await expect(page.locator("#charCount")).toHaveText("39 chars");
    await page.getByRole("tab", { name: "ES", exact: true }).click();
    await expect(editor).toHaveValue("Borrador revisado en español.");
});

test("editing an approved draft requires another simulation review", async ({ page }) => {
    await openConsole(page);
    const approve = page.locator("#approveButton");
    await approve.click();
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveText("Simulation Approved");
    await expect(page.locator("#approvalStatus")).toHaveText("Approved in simulation");
    await expect(page.locator("#releaseState")).toContainText("No public alerts have been sent");
    await page.getByRole("textbox", { name: "Alert text", exact: true }).fill("A newly revised draft.");
    await expect(approve).toBeEnabled();
    await expect(approve).toHaveText("Approve Simulation");
    await expect(page.locator("#approvalStatus")).toHaveText("Pending simulation review");
    await expect(page.locator("#releaseState")).toContainText("Draft changed");
});

test("channel changes reset approval and selecting no channels blocks approval", async ({ page }) => {
    await openConsole(page);
    const approve = page.locator("#approveButton");
    await approve.click();
    const wea = page.getByRole("button", { name: "WEA", exact: true });
    await wea.click();
    await expect(wea).toHaveAttribute("aria-pressed", "false");
    await expect(approve).toBeEnabled();
    await expect(page.locator("#approvalStatus")).toHaveText("Pending simulation review");
    await page.getByRole("button", { name: "EAS", exact: true }).click();
    await page.getByRole("button", { name: "SMS", exact: true }).click();
    await expect(approve).toBeDisabled();
    await expect(page.locator("#releaseState")).toHaveText("Select at least one simulated channel.");
    const social = page.getByRole("button", { name: "Social", exact: true });
    await social.click();
    await expect(social).toHaveAttribute("aria-pressed", "true");
    await expect(approve).toBeEnabled();
});

test("blank or whitespace-only drafts cannot be approved", async ({ page }) => {
    await openConsole(page);
    const editor = page.getByRole("textbox", { name: "Alert text", exact: true });
    for (const value of ["", "   \n  "]) {
        await editor.fill(value);
        await expect(page.locator("#approveButton")).toBeDisabled();
        await expect(page.locator("#releaseState")).toHaveText("Enter alert text before approving the simulation.");
    }
    await editor.fill("Ready for simulation review.");
    await expect(page.locator("#approveButton")).toBeEnabled();
});

test("language tabs support arrow navigation, wrapping, Home and End", async ({ page }) => {
    await openConsole(page);
    const en = page.getByRole("tab", { name: "EN", exact: true });
    const es = page.getByRole("tab", { name: "ES", exact: true });
    const zh = page.getByRole("tab", { name: "中文", exact: true });
    await en.focus();
    await page.keyboard.press("ArrowRight");
    await expect(es).toBeFocused();
    await expect(es).toHaveAttribute("aria-selected", "true");
    await expect(en).toHaveAttribute("tabindex", "-1");
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "tab-es");
    await page.keyboard.press("End");
    await expect(zh).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(en).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(zh).toBeFocused();
    await page.keyboard.press("Home");
    await expect(en).toBeFocused();
    await expect(en).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("textbox", { name: "Alert text", exact: true })).toHaveAttribute("lang", "en");
});

test("a blocked map library leaves a working composer and disables map controls", async ({ page }) => {
    await openConsole(page, { blockLeaflet: true });
    await expect(page.locator("#lastUpdated")).toContainText("Map library unavailable");
    await expect(page.locator("#fitAllButton")).toBeDisabled();
    for (const layer of ["perimeter", "evacuation", "closures", "care"]) {
        await expect(page.locator(`[data-layer="${layer}"]`)).toBeDisabled();
    }
    await expect(page.locator("#roadSource")).toContainText("Unavailable");
    await page.getByRole("textbox", { name: "Alert text", exact: true }).fill("Composer remains usable without the map.");
    await page.locator("#approveButton").click();
    await expect(page.locator("#approvalStatus")).toHaveText("Approved in simulation");
    await page.getByRole("button", { name: "Review Alert Text", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Alert text", exact: true })).toBeFocused();
    await expect(page.locator("#approveButton")).toBeEnabled();
});

test("the narrow layout remains within the viewport and the composer is usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openConsole(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole("textbox", { name: "Alert text", exact: true }).fill("Mobile simulation draft.");
    await page.locator("#approveButton").click();
    await expect(page.locator("#approvalStatus")).toHaveText("Approved in simulation");
});
