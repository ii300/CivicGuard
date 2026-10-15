const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    testMatch: 'packaged.spec.js',
    use: { baseURL: 'http://127.0.0.1:5056', trace: 'retain-on-failure' },
    projects: [
        { name: 'android-webview-layout', use: { ...devices['Pixel 7'] } },
        { name: 'ios-webview-layout', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
    ],
    webServer: {
        command: 'npm run build:web && npm run preview:web',
        url: 'http://127.0.0.1:5056',
        reuseExistingServer: !process.env.CI,
    },
});
