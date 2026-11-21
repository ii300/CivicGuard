const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./tests",
    testMatch: /(?:browser|accounts)\.spec\.js/,
    use: {
        baseURL: "http://127.0.0.1:5055",
        viewport: { width: 1440, height: 1000 },
        trace: "retain-on-failure",
    },
    webServer: {
        command: `${process.env.PYTHON || "python3"} -m flask --app app db upgrade && ${process.env.PYTHON || "python3"} -m flask --app app run --host 127.0.0.1 --port 5055`,
        url: "http://127.0.0.1:5055",
        reuseExistingServer: false,
        env: {
            APP_ENV: "development",
            DATABASE_URL: `sqlite:///${require("node:os").tmpdir()}/civicguard-browser-${process.pid}.db`,
            SECRET_KEY: "browser-tests-only-not-for-production",
            RATELIMIT_ENABLED: "0",
            TRUST_PROXY: "0",
            TRUSTED_HOSTS: "localhost,127.0.0.1",
            PUBLIC_BASE_URL: "http://127.0.0.1:5055",
            MAIL_BACKEND: "file",
        },
    },
});
