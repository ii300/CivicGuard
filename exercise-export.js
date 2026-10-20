(function (root) {
    "use strict";

    const NOTICE = "SIMULATION ONLY — NOT AN OFFICIAL ALERT";
    const TITLE = "CivicGuard exercise summary";
    const LANGUAGES = { en: "English", es: "Spanish", zh: "Chinese" };
    const CHANNELS = ["WEA", "EAS", "SMS", "Social"];
    const MAX_DRAFT_LENGTH = 20000;
    const MAX_BYTES = 200 * 1024;

    function hasExactKeys(value, keys) {
        return value !== null && typeof value === "object" && !Array.isArray(value) &&
            Object.keys(value).length === keys.length &&
            keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
    }

    function withinSizeLimit(value) {
        return value.length <= MAX_BYTES && new TextEncoder().encode(value).byteLength <= MAX_BYTES;
    }

    function createSummary(state) {
        // Match the draft store's bounds. Its public API intentionally exposes no
        // synchronous validator, and export must remain inside the user gesture.
        if (!hasExactKeys(state, ["drafts", "language", "channels", "reviewed"]) ||
            !hasExactKeys(state.drafts, Object.keys(LANGUAGES)) ||
            !Object.prototype.hasOwnProperty.call(LANGUAGES, state.language) ||
            typeof state.reviewed !== "boolean" || !Array.isArray(state.channels) ||
            state.channels.length > CHANNELS.length) {
            throw new TypeError("Invalid exercise summary state.");
        }
        for (const language of Object.keys(LANGUAGES)) {
            if (typeof state.drafts[language] !== "string" || state.drafts[language].length > MAX_DRAFT_LENGTH) {
                throw new TypeError("Invalid exercise draft.");
            }
        }
        const seen = new Set();
        for (const channel of state.channels) {
            if (!CHANNELS.includes(channel) || seen.has(channel)) {
                throw new TypeError("Invalid exercise channels.");
            }
            seen.add(channel);
        }
        const storedState = JSON.stringify({
            version: 1,
            scenario: "palisades-2025",
            drafts: state.drafts,
            language: state.language,
            channels: state.channels,
        });
        if (!withinSizeLimit(storedState)) throw new TypeError("Exercise drafts exceed the storage limit.");

        const lines = [
            NOTICE,
            "",
            TITLE,
            "Scenario: historical Palisades wildfire, January 2025.",
            "The map and scenario values are illustrative training material, not live conditions or evacuation guidance.",
            `Current language: ${LANGUAGES[state.language]} (${state.language})`,
            `Selected exercise channels: ${state.channels.length ? state.channels.join(", ") : "None"}`,
            `Current-language session review (${LANGUAGES[state.language]}, ${state.language}): ${state.reviewed ? "Reviewed in this session" : "Review pending in this session"}.`,
            "This review status applies only to the current language. Other language drafts are not claimed reviewed.",
            "Session review is an exercise step and does not confer official authority or authorize sending an alert.",
        ];
        for (const [language, label] of Object.entries(LANGUAGES)) {
            lines.push("", `${label} draft (${language}):`, state.drafts[language] === "" ? "[Intentionally blank]" : state.drafts[language]);
        }
        const text = lines.join("\n");
        if (!withinSizeLimit(text)) throw new TypeError("Exercise summary exceeds the export limit.");
        return text;
    }

    function wasCancelled(error) {
        // Web Share uses AbortError. Capacitor Share's native implementations
        // reject with this exact message; an empty resolved activityType is valid.
        return error?.name === "AbortError" || error?.message === "Share canceled";
    }

    function downloadSummary(text, environment) {
        const document = environment.document;
        const urlApi = environment.URL;
        if (typeof environment.Blob !== "function" || typeof urlApi?.createObjectURL !== "function" ||
            typeof urlApi?.revokeObjectURL !== "function" || typeof document?.createElement !== "function" ||
            typeof document.body?.appendChild !== "function") {
            return { status: "unavailable" };
        }
        let url;
        let anchor;
        try {
            url = urlApi.createObjectURL(new environment.Blob([text], { type: "text/plain;charset=utf-8" }));
            anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "CivicGuard-exercise-summary.txt";
            anchor.hidden = true;
            document.body.appendChild(anchor);
            anchor.click();
            return { status: "downloaded" };
        } finally {
            try { anchor?.remove(); } finally {
                if (url) {
                    const release = () => urlApi.revokeObjectURL(url);
                    // Give the download time to consume the Blob, then release it.
                    try {
                        if (typeof environment.setTimeout === "function") environment.setTimeout(release, 1000);
                        else release();
                    } catch { release(); }
                }
            }
        }
    }

    async function shareSummary(options = {}) {
        try {
            const { text, environment = root } = options;
            if (typeof text !== "string" || !text.startsWith(`${NOTICE}\n`) || !withinSizeLimit(text)) {
                return { status: "unavailable" };
            }
            const capacitor = environment.Capacitor;
            const nativeBridge = Boolean(environment.androidBridge || environment.webkit?.messageHandlers?.bridge);
            const isNative = nativeBridge || Boolean(capacitor?.isNativePlatform?.());
            if (isNative) {
                if (typeof capacitor?.isPluginAvailable !== "function" || !capacitor.isPluginAvailable("Share") ||
                    typeof capacitor.registerPlugin !== "function") return { status: "unavailable" };
                const share = capacitor.registerPlugin("Share");
                if (typeof share?.share !== "function") return { status: "unavailable" };
                await share.share({ title: TITLE, text, dialogTitle: "Share exercise summary" });
                return { status: "shared" };
            }
            if (typeof environment.navigator?.share === "function") {
                // Do not await canShare or another operation before this call:
                // browsers require the original button click's transient activation.
                await environment.navigator.share({ title: TITLE, text });
                return { status: "shared" };
            }
            // The desktop app intentionally cancels downloads at the session
            // boundary. Do not report a file saved when that policy will block it.
            if (/\bElectron\//i.test(environment.navigator?.userAgent || "")) {
                return { status: "unavailable" };
            }
            return downloadSummary(text, environment);
        } catch (error) {
            return { status: wasCancelled(error) ? "cancelled" : "unavailable" };
        }
    }

    const api = { createSummary, shareSummary };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.CivicGuardExport = api;
})(globalThis);
