"use strict";

/** @type {import('electron-builder').Configuration} */
module.exports = {
    appId: "io.github.ii300.civicguard",
    productName: "CivicGuard",
    icon: "resources/icon.png",
    artifactName: "CivicGuard-${version}-${os}-${arch}.${ext}",
    directories: { output: "release/desktop" },
    asar: true,
    npmRebuild: false,
    files: [
        "desktop/main.cjs",
        "desktop/policy.cjs",
        "dist/web/**/*",
        "package.json",
        "!node_modules/**/*",
    ],
    mac: {
        category: "public.app-category.education",
        // CI builds each architecture separately using --arm64 / --x64.
        target: ["dmg", "zip"],
    },
    dmg: { title: "CivicGuard ${version}" },
    win: { target: [{ target: "nsis", arch: ["x64"] }] },
    nsis: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: false,
        createStartMenuShortcut: true,
    },
};
