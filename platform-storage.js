(function (root) {
    "use strict";

    function createStorageBackend(environment = root) {
        const capacitor = environment.Capacitor;
        const nativeBridge = Boolean(environment.androidBridge || environment.webkit?.messageHandlers?.bridge);
        const isNative = nativeBridge || Boolean(capacitor?.isNativePlatform?.());

        if (!isNative) {
            // Access can throw SecurityError in restricted browser contexts. Defer it
            // until an operation so the draft store can report the failure to the UI.
            return {
                async getItem(key) { return environment.localStorage.getItem(String(key)); },
                async setItem(key, value) { environment.localStorage.setItem(String(key), String(value)); },
                async removeItem(key) { environment.localStorage.removeItem(String(key)); },
            };
        }

        let preferences;
        function nativePreferences() {
            if (!preferences) {
                if (typeof capacitor?.isPluginAvailable !== "function" ||
                    !capacitor.isPluginAvailable("Preferences") ||
                    typeof capacitor.registerPlugin !== "function") {
                    const error = new Error("Native draft storage is unavailable. The Preferences plugin must be included in this app build.");
                    error.code = "NATIVE_STORAGE_UNAVAILABLE";
                    throw error;
                }
                // The packaged official Capacitor runtime registers the native proxy.
                // Never fall back to WebView localStorage when native storage fails.
                preferences = capacitor.registerPlugin("Preferences");
            }
            return preferences;
        }

        return {
            async getItem(key) {
                const result = await nativePreferences().get({ key: String(key) });
                if (!result || (result.value !== null && typeof result.value !== "string")) {
                    throw new Error("Native draft storage returned an invalid value.");
                }
                return result.value;
            },
            async setItem(key, value) {
                await nativePreferences().set({ key: String(key), value: String(value) });
            },
            async removeItem(key) {
                await nativePreferences().remove({ key: String(key) });
            },
        };
    }

    const api = { createStorageBackend };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.CivicGuardPlatform = api;
})(globalThis);
