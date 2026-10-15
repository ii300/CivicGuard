"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { APP_URL, assetForUrl, isAppNavigation, trustedExternalUrl } = require("../desktop/policy.cjs");

test("desktop protocol serves the console and local Leaflet assets", () => {
    assert.deepEqual(assetForUrl(APP_URL), { relativePath: "index.html", contentType: "text/html; charset=utf-8" });
    assert.equal(assetForUrl("civicguard://app/vendor/leaflet/leaflet.js").relativePath, "vendor/leaflet/leaflet.js");
    assert.equal(assetForUrl("civicguard://app/vendor/leaflet/images/marker-icon.png").contentType, "image/png");
});

test("desktop protocol cannot expose project files, credentials or arbitrary paths", () => {
    for (const value of [
        "civicguard://app/.env", "civicguard://app/package.json", "civicguard://app/app.py",
        "civicguard://app/../.env", "civicguard://app/%2e%2e/.env",
        "civicguard://app/%2e%2e%2f.env", "civicguard://app/vendor/leaflet/../../.env",
        "civicguard://app/index.html/../../.env", "civicguard://app/vendor/leaflet/LICENSE",
        "civicguard://app/toString", "civicguard://app/__proto__", "civicguard://app/index.html%00",
        "civicguard://app/index.html?file=../../.env", "civicguard://app/index.html#fragment",
        "civicguard://other/index.html", "civicguard://app.evil.test/index.html",
        "civicguard://user:password@app/index.html", "civicguard://app:4321/index.html",
        "https://app/index.html", "file:///etc/passwd", "data:text/html,hello", "invalid", null,
    ]) assert.equal(assetForUrl(value), null, String(value));
});

test("navigation is confined to the bundled page and its fragments", () => {
    assert.equal(isAppNavigation(APP_URL), true);
    assert.equal(isAppNavigation(`${APP_URL}#map`), true);
    for (const value of [
        "https://example.com", "civicguard://app/script.js", "civicguard://app/index.html?redirect=1",
        "civicguard://app.evil.test/index.html", "file:///tmp/index.html", "javascript:alert(1)", null,
    ]) assert.equal(isAppNavigation(value), false, String(value));
});

test("only the fixed HTTPS official map and attribution can reach the OS browser", () => {
    const official = "https://experience.arcgis.com/experience/fedf0447f6c9485e804d1ac9b993632e/";
    assert.equal(trustedExternalUrl(official), official);
    assert.equal(trustedExternalUrl("https://leafletjs.com"), "https://leafletjs.com/");
    for (const value of [
        "http://leafletjs.com/", "https://leafletjs.com.evil.test/", "https://leafletjs.com@evil.test/",
        "https://user:password@leafletjs.com/", "https://leafletjs.com:8443/",
        "https://leafletjs.com/redirect?url=https://evil.test", "https://leafletjs.com/?redirect=1",
        "https://experience.arcgis.com/experience/another-map/", `${official}?redirect=1`,
        "https://example.com/", "file:///Applications/Calculator.app", "javascript:alert(1)",
        "ms-settings:privacy", "mailto:test@example.com", "invalid", null,
    ]) assert.equal(trustedExternalUrl(value), null, String(value));
});
