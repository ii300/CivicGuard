"use strict";

const { app, BrowserWindow, dialog, Menu, protocol, session, shell } = require("electron");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const {
    APP_URL,
    APP_PARTITION,
    CONTENT_SECURITY_POLICY,
    assetForUrl,
    isAppNavigation,
    trustedExternalUrl,
} = require("./policy.cjs");

app.enableSandbox();
protocol.registerSchemesAsPrivileged([{
    scheme: "civicguard",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

function openTrustedExternal(value) {
    const url = trustedExternalUrl(value);
    if (!url) return;
    // Pass only the validated, canonical URL to the OS, never renderer input.
    shell.openExternal(url).catch(() => {
        dialog.showErrorBox("Could not open link", "Open the official map in your browser and try again.");
    });
}

app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("will-frame-navigate", (event) => {
        if (!event.isMainFrame || !isAppNavigation(event.url)) {
            event.preventDefault();
            if (event.isMainFrame) openTrustedExternal(event.url);
        }
    });
    contents.on("will-redirect", (event) => {
        if (!isAppNavigation(event.url)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
        openTrustedExternal(url);
        return { action: "deny" };
    });
});

function configureSession() {
    const appSession = session.fromPartition(APP_PARTITION);
    appSession.setPermissionCheckHandler(() => false);
    appSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    appSession.setDevicePermissionHandler(() => false);
    appSession.on("will-download", (event) => event.preventDefault());
    appSession.protocol.handle("civicguard", async (request) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
        }
        const asset = assetForUrl(request.url);
        if (!asset) return new Response("Not found", { status: 404 });
        try {
            const body = await readFile(path.join(app.getAppPath(), "dist", "web", asset.relativePath));
            return new Response(request.method === "HEAD" ? null : body, {
                headers: {
                    "Content-Type": asset.contentType,
                    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
                    "X-Content-Type-Options": "nosniff",
                    "Referrer-Policy": "no-referrer",
                },
            });
        } catch {
            return new Response("Bundled resource missing. Rebuild the web assets.", { status: 404 });
        }
    });
}

async function createWindow() {
    const window = new BrowserWindow({
        title: "CivicGuard Simulation",
        width: 1440,
        height: 960,
        minWidth: 740,
        minHeight: 560,
        backgroundColor: "#f2f0e8",
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            partition: APP_PARTITION,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,
            devTools: !app.isPackaged,
        },
    });
    window.once("ready-to-show", () => window.show());
    try {
        await window.loadURL(APP_URL);
    } catch (error) {
        // A user reload can cancel the initial load while remote map images are
        // pending. That is not a startup failure and must not close the app.
        if (error.code === "ERR_ABORTED" || error.errno === -3 || window.isDestroyed()) return;
        if (!window.isDestroyed()) window.destroy();
        dialog.showErrorBox("CivicGuard could not start", "The bundled console could not be loaded. Reinstall the app, or run npm run build:web before starting a development copy.");
        app.quit();
    }
}

app.whenReady().then(async () => {
    app.setAppUserModelId("io.github.ii300.civicguard");
    configureSession();
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
        { role: "editMenu" },
        { label: "View", submenu: [{ role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }] },
        { role: "windowMenu" },
        { label: "Help", submenu: [{ label: "Official LA County map", click: () => openTrustedExternal("https://experience.arcgis.com/experience/fedf0447f6c9485e804d1ac9b993632e/") }] },
    ]));
    await createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
}).catch((error) => {
    console.error("CivicGuard startup failed:", error.message);
    app.quit();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
