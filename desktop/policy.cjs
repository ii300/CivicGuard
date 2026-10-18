"use strict";

const APP_URL = "civicguard://app/index.html";
const APP_PARTITION = "persist:civicguard";

// Only these public build outputs may ever cross the custom protocol boundary.
// Do not replace this with a project-directory or arbitrary filesystem handler.
const ASSETS = Object.freeze({
    "/index.html": "text/html; charset=utf-8",
    "/styles.css": "text/css; charset=utf-8",
    "/script.js": "text/javascript; charset=utf-8",
    "/console-core.js": "text/javascript; charset=utf-8",
    "/draft-store.js": "text/javascript; charset=utf-8",
    "/platform-storage.js": "text/javascript; charset=utf-8",
    "/vendor/capacitor/capacitor.js": "text/javascript; charset=utf-8",
    "/vendor/leaflet/leaflet.js": "text/javascript; charset=utf-8",
    "/vendor/leaflet/leaflet.css": "text/css; charset=utf-8",
    "/vendor/leaflet/images/layers.png": "image/png",
    "/vendor/leaflet/images/layers-2x.png": "image/png",
    "/vendor/leaflet/images/marker-icon.png": "image/png",
    "/vendor/leaflet/images/marker-icon-2x.png": "image/png",
    "/vendor/leaflet/images/marker-shadow.png": "image/png",
});

const CONTENT_SECURITY_POLICY = [
    "default-src 'none'",
    "script-src 'self'",
    // Leaflet positions map layers with inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://server.arcgisonline.com",
    "connect-src 'self' https://services.arcgis.com https://services5.arcgis.com https://services7.arcgis.com",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
].join("; ");

const EXTERNAL_URLS = new Set([
    "https://experience.arcgis.com/experience/fedf0447f6c9485e804d1ac9b993632e/",
    "https://leafletjs.com/",
]);

function parseUrl(value) {
    if (typeof value !== "string") return null;
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function assetForUrl(value) {
    const url = parseUrl(value);
    if (!url || url.protocol !== "civicguard:" || url.hostname !== "app" ||
        url.port || url.username || url.password || url.search || url.hash ||
        !Object.hasOwn(ASSETS, url.pathname)) return null;
    return { relativePath: url.pathname.slice(1), contentType: ASSETS[url.pathname] };
}

function isAppNavigation(value) {
    const url = parseUrl(value);
    if (!url) return false;
    // Fragment-only links are harmless and are used by Leaflet controls.
    url.hash = "";
    return url.href === APP_URL;
}

function trustedExternalUrl(value) {
    const url = parseUrl(value);
    if (!url || url.protocol !== "https:" || url.username || url.password ||
        url.port || !EXTERNAL_URLS.has(url.href)) return null;
    return url.href;
}

module.exports = {
    APP_URL,
    APP_PARTITION,
    ASSETS,
    CONTENT_SECURITY_POLICY,
    assetForUrl,
    isAppNavigation,
    trustedExternalUrl,
};
