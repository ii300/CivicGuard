(function (root) {
    "use strict";

    const KEY = "civicguard.palisades-drafts.v1";
    const VERSION = 1;
    const SCENARIO = "palisades-2025";
    const LANGUAGES = ["en", "es", "zh"];
    const CHANNELS = ["WEA", "EAS", "SMS", "Social"];
    const MAX_DRAFT_LENGTH = 20000;
    const MAX_SERIALIZED_BYTES = 200 * 1024;

    function hasExactKeys(value, keys) {
        return value !== null && typeof value === "object" && !Array.isArray(value) &&
            Object.keys(value).length === keys.length &&
            keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
    }

    function copySnapshot(value) {
        if (!hasExactKeys(value, ["drafts", "language", "channels"])) return null;
        const { drafts, language, channels } = value;
        if (!hasExactKeys(drafts, LANGUAGES) || !LANGUAGES.includes(language) ||
            !Array.isArray(channels) || channels.length > CHANNELS.length) return null;

        const copiedDrafts = {};
        for (const language of LANGUAGES) {
            const draft = drafts[language];
            if (typeof draft !== "string" || draft.length > MAX_DRAFT_LENGTH) return null;
            copiedDrafts[language] = draft;
        }
        const copiedChannels = [];
        for (const channel of channels) {
            if (!CHANNELS.includes(channel) || copiedChannels.includes(channel)) return null;
            copiedChannels.push(channel);
        }
        return { drafts: copiedDrafts, language, channels: copiedChannels };
    }

    function withinSizeLimit(value) {
        return value.length <= MAX_SERIALIZED_BYTES &&
            new TextEncoder().encode(value).byteLength <= MAX_SERIALIZED_BYTES;
    }

    function createStore(backend) {
        let tail = Promise.resolve();

        function enqueue(operation) {
            const result = tail.then(operation);
            // A failed operation must not prevent a later save or reset.
            tail = result.catch(() => {});
            return result;
        }

        function load() {
            return enqueue(async () => {
                let serialized;
                try {
                    serialized = await backend.getItem(KEY);
                } catch {
                    return { status: "unavailable" };
                }
                if (serialized === null) return { status: "empty" };
                try {
                    if (typeof serialized !== "string" || !withinSizeLimit(serialized)) {
                        return { status: "invalid" };
                    }
                    const envelope = JSON.parse(serialized);
                    if (!hasExactKeys(envelope, ["version", "scenario", "drafts", "language", "channels"]) ||
                        envelope.version !== VERSION || envelope.scenario !== SCENARIO) {
                        return { status: "invalid" };
                    }
                    const snapshot = copySnapshot({
                        drafts: envelope.drafts,
                        language: envelope.language,
                        channels: envelope.channels,
                    });
                    return snapshot ? { status: "restored", snapshot } : { status: "invalid" };
                } catch {
                    return { status: "invalid" };
                }
            });
        }

        function save(value) {
            let serialized;
            try {
                // Copy before entering the queue, while this invocation's values are current.
                const snapshot = copySnapshot(value);
                if (!snapshot) return Promise.resolve({ status: "invalid" });
                serialized = JSON.stringify({ version: VERSION, scenario: SCENARIO, ...snapshot });
                if (!withinSizeLimit(serialized)) return Promise.resolve({ status: "invalid" });
            } catch {
                return Promise.resolve({ status: "invalid" });
            }
            return enqueue(async () => {
                try {
                    await backend.setItem(KEY, serialized);
                    return { status: "saved" };
                } catch {
                    return { status: "unavailable" };
                }
            });
        }

        function clear() {
            return enqueue(async () => {
                try {
                    await backend.removeItem(KEY);
                    return { status: "cleared" };
                } catch {
                    return { status: "unavailable" };
                }
            });
        }

        return { load, save, clear };
    }

    const api = { KEY, createStore };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.CivicGuardDraftStore = api;
})(globalThis);
