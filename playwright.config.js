const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./tests",
    testMatch: "browser.spec.js",
    use: {
        baseURL: "http://127.0.0.1:5055",
        viewport: { width: 1440, height: 1000 },
        trace: "retain-on-failure",
    },
    webServer: {
        command: "python3 -m flask --app app run --host 127.0.0.1 --port 5055",
        url: "http://127.0.0.1:5055",
        reuseExistingServer: !process.env.CI,
    },
});
