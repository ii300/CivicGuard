const { defineConfig } = require("@playwright/test");
const port = Number(process.env.CIVICGUARD_TEST_PORT || 5055);

module.exports = defineConfig({
    testDir: "./tests",
    testMatch: "browser.spec.js",
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        viewport: { width: 1440, height: 1000 },
        trace: "retain-on-failure",
    },
    webServer: {
        command: `python3 -m flask --app app run --host 127.0.0.1 --port ${port}`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !process.env.CI,
    },
});
