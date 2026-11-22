const { defineConfig } = require("@playwright/test");
const port = Number(process.env.CIVICGUARD_TEST_PORT || 5055);

module.exports = defineConfig({
    testDir: "./tests",
    testMatch: /(?:browser|accounts)\.spec\.js/,
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        viewport: { width: 1440, height: 1000 },
        trace: "retain-on-failure",
    },
    webServer: {
        command: `${process.env.PYTHON || "python3"} -m flask --app app db upgrade && ${process.env.PYTHON || "python3"} -m flask --app app run --host 127.0.0.1 --port ${port}`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: false,
        env: {
            APP_ENV: "development",
            DATABASE_URL: `sqlite:///${require("node:os").tmpdir()}/civicguard-browser-${process.pid}.db`,
            SECRET_KEY: "browser-tests-only-not-for-production",
            RATELIMIT_ENABLED: "0",
            TRUST_PROXY: "0",
            TRUSTED_HOSTS: "localhost,127.0.0.1",
            PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
            MAIL_BACKEND: "file",
        },
    },
});
