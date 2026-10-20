const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

async function openOfflineConsole(page) {
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('#lastUpdated')).toContainText('Offline exercise ready');
}

async function openDraftSection(page) {
    await page.getByRole('navigation', { name: 'Console sections' })
        .getByRole('link', { name: 'Draft', exact: true }).tap();
}

test('packaged mobile UI works offline with local map assets and reachable touch controls', async ({ page }, testInfo) => {
    const errors = [];
    const dependencies = [];
    const externalRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
        if (['script', 'stylesheet'].includes(request.resourceType())) dependencies.push(request.url());
        if (!request.url().startsWith('http://127.0.0.1:5056/')) externalRequests.push(request.url());
    });
    await page.route('https://**/*', (route) => route.abort());
    await page.addInitScript(() => {
        window.cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => window.cspViolations.push(event.violatedDirective));
    });
    await page.goto('/');
    await expect(page.locator('#lastUpdated')).toContainText('Offline exercise ready');
    await expect(page.locator('#basemapStatus')).toHaveText('Offline exercise map');
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
    expect(await page.evaluate(() => {
        const safeAreaCover = getComputedStyle(document.body, '::before');
        return { height: safeAreaCover.height, position: safeAreaCover.position };
    })).toEqual({ height: '44px', position: 'fixed' });
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
    expect(externalRequests, 'The packaged app must not contact any external service automatically').toEqual([]);
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

test('sharing downloads all three language drafts as a clearly labeled exercise text file', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    });
    await openOfflineConsole(page);
    await openDraftSection(page);
    const editor = page.getByRole('textbox', { name: 'Alert text', exact: true });
    const drafts = {
        en: 'Practice English draft.\nA & B < C <script>exercise</script>',
        es: 'Borrador de práctica en español.',
        zh: '本设备的中文演练草稿 🏠。',
    };
    await editor.fill(drafts.en);
    await page.getByRole('tab', { name: 'ES', exact: true }).tap();
    await editor.fill(drafts.es);
    await page.getByRole('tab', { name: '中文', exact: true }).tap();
    await editor.fill(drafts.zh);
    for (const name of ['WEA', 'EAS', 'SMS', 'Social']) {
        const channel = page.getByRole('button', { name, exact: true });
        if ((await channel.getAttribute('aria-pressed') === 'true') !== (name === 'SMS')) await channel.tap();
    }
    await page.getByRole('button', { name: 'Approve Simulation', exact: true }).tap();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Share exercise summary', exact: true }).tap();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('CivicGuard-exercise-summary.txt');
    const text = await fs.readFile(await download.path(), 'utf8');
    expect(text.split('\n')[0]).toBe('SIMULATION ONLY — NOT AN OFFICIAL ALERT');
    for (const draft of Object.values(drafts)) expect(text).toContain(draft);
    expect(text).toContain('Current language: Chinese (zh)');
    expect(text).toContain('Selected exercise channels: SMS');
    expect(text).toContain('Current-language session review (Chinese, zh): Reviewed in this session');
    expect(text).toContain('Other language drafts are not claimed reviewed');
    expect(text).toContain('historical Palisades wildfire, January 2025');
    expect(text).toContain('illustrative training material');
    await expect(page.locator('#shareStatus')).toHaveText('Exercise summary downloaded as a text file.');
    await expect(editor).toHaveValue(drafts.zh);
    await expect(page.getByRole('button', { name: 'Share exercise summary', exact: true })).toBeEnabled();
});

test('a user tap invokes Web Share with the current exercise and reports completion', async ({ page }) => {
    await page.addInitScript(() => {
        window.exerciseShares = [];
        Object.defineProperty(navigator, 'canShare', { configurable: true, value() { throw new Error('canShare must not precede the gesture-bound share'); } });
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            async value(payload) {
                window.exerciseShares.push({ ...payload, activeGesture: navigator.userActivation?.isActive ?? null });
            },
        });
    });
    await openOfflineConsole(page);
    await openDraftSection(page);
    await page.getByRole('textbox', { name: 'Alert text', exact: true }).fill('User-selected exercise recipient.');
    await page.getByRole('button', { name: 'Share exercise summary', exact: true }).tap();
    await expect(page.locator('#shareStatus')).toHaveText('Exercise summary shared using your chosen app.');
    const shares = await page.evaluate(() => window.exerciseShares);
    expect(shares).toHaveLength(1);
    expect(shares[0].title).toBe('CivicGuard exercise summary');
    expect(shares[0].text.split('\n')[0]).toBe('SIMULATION ONLY — NOT AN OFFICIAL ALERT');
    expect(shares[0].text).toContain('User-selected exercise recipient.');
    if (shares[0].activeGesture !== null) expect(shares[0].activeGesture).toBe(true);
    await expect(page.locator('#shareExerciseButton')).toBeEnabled();
});

test('cancelling the share sheet reports cancellation and leaves the editor usable', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            async value() { throw new DOMException('User dismissed the share sheet', 'AbortError'); },
        });
    });
    await openOfflineConsole(page);
    await openDraftSection(page);
    const editor = page.getByRole('textbox', { name: 'Alert text', exact: true });
    await editor.fill('Keep this exercise draft after cancellation.');
    await page.getByRole('button', { name: 'Share exercise summary', exact: true }).tap();
    await expect(page.locator('#shareStatus')).toHaveText('Sharing cancelled. Your drafts are unchanged.');
    await expect(editor).toHaveValue('Keep this exercise draft after cancellation.');
    await expect(editor).toBeEnabled();
    await expect(page.locator('#shareExerciseButton')).toBeEnabled();
    await editor.fill('Editing still works after cancelling a share.');
    await expect(page.locator('#draftSaveStatus')).toHaveText('Saved on this device.');
    await page.getByRole('button', { name: 'Approve Simulation', exact: true }).tap();
    await expect(page.locator('#approvalStatus')).toHaveText('Approved in simulation');
});

test('map zoom and viewport changes keep the exercise entirely local', async ({ page }) => {
    const externalRequests = [];
    page.on('request', (request) => {
        if (!request.url().startsWith('http://127.0.0.1:5056/')) externalRequests.push(request.url());
    });
    await openOfflineConsole(page);
    const navigation = page.getByRole('navigation', { name: 'Console sections' });
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        await navigation.getByRole('link', { name: 'Map', exact: true }).tap();
        await page.locator('#map .leaflet-control-zoom-in').tap();
        await page.locator('#map .leaflet-control-zoom-out').tap();
        await expect(page.locator('#basemapStatus')).toHaveText('Offline exercise map');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    }
    expect(externalRequests).toEqual([]);
});

test('about, privacy, support and license information are available locally while offline', async ({ page }) => {
    const externalRequests = [];
    page.on('request', (request) => {
        if (!request.url().startsWith('http://127.0.0.1:5056/')) externalRequests.push(request.url());
    });
    await openOfflineConsole(page);
    const info = page.getByRole('region', { name: 'About, privacy and support', exact: true });
    await info.locator('summary').getByText('About, privacy & support', { exact: true }).tap();
    await expect(info.getByRole('heading', { name: 'CivicGuard Exercise', exact: true })).toBeVisible();
    await expect(info).toContainText('cannot send public alerts');
    await info.locator('summary').getByText('Privacy policy', { exact: true }).tap();
    const privacy = page.locator('#appPrivacyPolicy');
    await expect(privacy).toHaveAttribute('open', '');
    await expect(privacy).toContainText('It makes no automatic external network requests');
    await expect(privacy).toContainText('no advertising, analytics or tracking');
    await expect(privacy).toContainText('The summary includes all three drafts and selected channels');
    await expect(privacy).toContainText('Submitting a GitHub issue makes what you write public');
    await expect(privacy).toContainText('Reset all drafts');
    const support = info.getByRole('link', { name: 'Contact support on GitHub (opens browser)', exact: true });
    await expect(support).toHaveAttribute('href', 'https://github.com/ii300/CivicGuard/issues');
    await expect(support).toHaveAttribute('target', '_blank');
    await info.locator('summary').getByText('Open-source acknowledgements', { exact: true }).tap();
    for (const [label, copyright] of [
        ['Leaflet — BSD 2-Clause', 'Copyright (c) 2010-2023, Volodymyr Agafonkin'],
        ['Capacitor — MIT', 'Copyright (c) 2017-present Drifty Co.'],
        ['Capacitor Preferences and Share plugins — MIT', 'Copyright 2020-present Ionic'],
    ]) {
        const disclosure = info.locator('details').filter({ has: page.locator('summary').getByText(label, { exact: true }) }).last();
        await disclosure.locator('summary').tap();
        await expect(disclosure.locator('pre')).toBeVisible();
        await expect(disclosure.locator('pre')).toContainText(copyright);
        await disclosure.locator('summary').tap();
    }
    expect(externalRequests).toEqual([]);
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
