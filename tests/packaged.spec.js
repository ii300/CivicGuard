const { test, expect } = require('@playwright/test');

async function openOfflineConsole(page) {
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('#lastUpdated')).toContainText('Source requests completed');
}

async function openDraftSection(page) {
    await page.getByRole('navigation', { name: 'Console sections' })
        .getByRole('link', { name: 'Draft', exact: true }).tap();
}

test('packaged mobile UI works offline with local map assets and reachable touch controls', async ({ page }, testInfo) => {
    const errors = [];
    const dependencies = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
        if (['script', 'stylesheet'].includes(request.resourceType())) dependencies.push(request.url());
    });
    await page.route('https://**/*', (route) => route.abort());
    await page.addInitScript(() => {
        window.cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => window.cspViolations.push(event.violatedDirective));
    });
    await page.goto('/');
    await expect(page.locator('#lastUpdated')).toContainText('Source requests completed');
    await expect(page.locator('#closureCount')).toHaveText('5 (sample)');
    await expect(page.locator('#map .leaflet-control-zoom')).toBeAttached();
    expect(dependencies.every((url) => url.startsWith('http://127.0.0.1:5056/'))).toBeTruthy();

    // Match Capacitor's custom properties without waiting for an inline style load event.
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--safe-area-inset-top', '44px');
        document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px');
    });
    const navigation = page.getByRole('navigation', { name: 'Console sections' });
    await expect(navigation).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('padding-top', '44px');
    await expect(page.locator('body')).toHaveCSS('padding-bottom', '102px');
    await expect(navigation).toHaveCSS('padding-bottom', '40px');
    await navigation.getByRole('link', { name: 'Draft', exact: true }).tap();
    const editor = page.getByRole('textbox', { name: 'Alert text', exact: true });
    await editor.fill('Mobile offline simulation draft.');
    await page.getByRole('tab', { name: '中文', exact: true }).tap();
    await page.getByRole('tab', { name: 'EN', exact: true }).tap();
    await expect(editor).toHaveValue('Mobile offline simulation draft.');
    await page.getByRole('button', { name: 'Approve Simulation', exact: true }).tap();
    await expect(page.locator('#approvalStatus')).toHaveText('Approved in simulation');
    await expect(page.locator('#releaseState')).toContainText('No public alerts have been sent');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('mobile-draft.png'), fullPage: false });
});

test('offline drafts, language and channels survive reload but approval does not', async ({ page }) => {
    await openOfflineConsole(page);
    await openDraftSection(page);
    const editor = page.getByRole('textbox', { name: 'Alert text', exact: true });
    await editor.fill('Offline English draft saved on this device.');
    await page.getByRole('tab', { name: '中文', exact: true }).tap();
    await editor.fill('保存在本设备的离线中文演练草稿。');
    await page.getByRole('button', { name: 'WEA', exact: true }).tap();
    await page.getByRole('button', { name: 'Social', exact: true }).tap();
    await page.getByRole('button', { name: 'Approve Simulation', exact: true }).tap();
    await expect(page.locator('#approvalStatus')).toHaveText('Approved in simulation');
    await expect(page.locator('#draftSaveStatus')).toHaveText('Saved on this device.');

    await page.reload();
    await openDraftSection(page);
    await expect(editor).toHaveValue('保存在本设备的离线中文演练草稿。');
    await expect(page.getByRole('tab', { name: '中文', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'WEA', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Social', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#approvalStatus')).toHaveText('Pending simulation review');
    await expect(page.getByRole('button', { name: 'Approve Simulation', exact: true })).toBeEnabled();
    await page.getByRole('tab', { name: 'EN', exact: true }).tap();
    await expect(editor).toHaveValue('Offline English draft saved on this device.');
});

test('resetting saved drafts requires confirmation and persists after reload', async ({ page }) => {
    await openOfflineConsole(page);
    await openDraftSection(page);
    const editor = page.getByRole('textbox', { name: 'Alert text', exact: true });
    const initialDraft = await editor.inputValue();
    await editor.fill('A saved draft that should only be cleared after confirmation.');
    await expect(page.locator('#draftSaveStatus')).toHaveText('Saved on this device.');
    await page.locator('#resetDraftsButton').tap();
    await expect(page.locator('#resetDraftsConfirm')).toBeVisible();
    await page.locator('#cancelResetDraftsButton').tap();
    await expect(page.locator('#resetDraftsConfirm')).toBeHidden();
    await expect(editor).toHaveValue('A saved draft that should only be cleared after confirmation.');
    await page.locator('#resetDraftsButton').tap();
    await page.locator('#confirmResetDraftsButton').tap();
    await expect(editor).toHaveValue(initialDraft);
    await page.reload();
    await expect(editor).toHaveValue(initialDraft);
    await expect(page.locator('#approvalStatus')).toHaveText('Pending simulation review');
});

for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 280 }]) {
    test(`sections and editing remain reachable in a ${viewport.width}×${viewport.height} viewport`, async ({ page }, testInfo) => {
        // These are browser viewport checks; native keyboards require device testing.
        await page.setViewportSize(viewport);
        await openOfflineConsole(page);
        await page.evaluate((landscape) => {
            const root = document.documentElement;
            root.style.setProperty('--safe-area-inset-top', '8px');
            root.style.setProperty('--safe-area-inset-bottom', '20px');
            root.style.setProperty('--safe-area-inset-left', landscape ? '44px' : '0px');
            root.style.setProperty('--safe-area-inset-right', landscape ? '44px' : '0px');
        }, viewport.width > viewport.height);
        const navigation = page.getByRole('navigation', { name: 'Console sections' });
        await expect(navigation).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        await navigation.getByRole('link', { name: 'Map', exact: true }).tap();
        await page.locator('#map .leaflet-control-zoom-in').tap();
        await navigation.getByRole('link', { name: 'Draft', exact: true }).tap();
        await page.getByRole('textbox', { name: 'Alert text', exact: true }).fill('Reachable short-viewport draft.');
        await page.getByRole('tab', { name: '中文', exact: true }).tap();
        await page.getByRole('tab', { name: 'EN', exact: true }).tap();
        await expect(page.locator('#alertText')).toHaveValue('Reachable short-viewport draft.');
        await page.locator('#resetDraftsButton').tap();
        await page.locator('#cancelResetDraftsButton').scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath('short-reset-confirmation.png'), fullPage: false });
        await page.locator('#cancelResetDraftsButton').tap();
        await expect(page.locator('#alertText')).toHaveValue('Reachable short-viewport draft.');
        await page.locator('#resetDraftsButton').tap();
        await page.locator('#confirmResetDraftsButton').tap();
        await page.getByRole('textbox', { name: 'Alert text', exact: true }).fill('Reachable short-viewport draft.');
        await page.getByRole('button', { name: 'Approve Simulation', exact: true }).tap();
        await expect(page.locator('#releaseState')).toContainText('No public alerts have been sent');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        await page.screenshot({ path: testInfo.outputPath('short-viewport.png'), fullPage: false });
    });
}
