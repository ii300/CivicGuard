const { test, expect } = require('@playwright/test');

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

    // Exercise Capacitor's fallback safe-area properties in both browser engines.
    await page.addStyleTag({ content: ':root { --safe-area-inset-top: 44px; --safe-area-inset-bottom: 34px; }' });
    const navigation = page.getByRole('navigation', { name: 'Console sections' });
    await expect(navigation).toBeVisible();
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
