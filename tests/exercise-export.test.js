"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createSummary, shareSummary } = require("../exercise-export.js");

const NOTICE = "SIMULATION ONLY — NOT AN OFFICIAL ALERT";
function state(overrides = {}) {
    return { drafts: { en: "Practice English draft", es: "Borrador de práctica", zh: "演练草稿 🏠" }, language: "zh", channels: ["SMS", "Social"], reviewed: false, ...overrides };
}

function downloadEnvironment({ clickError, timer = true } = {}) {
    const events = [];
    let blob;
    let cleanup;
    const anchor = {
        click() { events.push("click"); if (clickError) throw clickError; },
        remove() { events.push("remove"); },
    };
    const environment = {
        Blob,
        URL: {
            createObjectURL(value) { blob = value; events.push("create-url"); return "blob:exercise-summary"; },
            revokeObjectURL(value) { assert.equal(value, "blob:exercise-summary"); events.push("revoke-url"); },
        },
        document: {
            createElement(tag) { assert.equal(tag, "a"); return anchor; },
            body: { appendChild(value) { assert.equal(value, anchor); events.push("append"); } },
        },
    };
    if (timer) environment.setTimeout = (callback, delay) => {
        assert.equal(delay, 1000);
        cleanup = callback;
        events.push("schedule-cleanup");
    };
    return { environment, events, anchor, blob: () => blob, cleanup: () => cleanup() };
}

function nativeEnvironment(platform, { available = true, share } = {}) {
    const calls = [];
    const environment = {
        Capacitor: {
            isNativePlatform: () => true,
            isPluginAvailable(name) { assert.equal(name, "Share"); return available; },
            registerPlugin(name) {
                assert.equal(name, "Share");
                return { share: share || (async (options) => { calls.push(options); return { activityType: "" }; }) };
            },
        },
        get navigator() { throw new Error("A native share must never use browser fallback"); },
        get document() { throw new Error("A native share must never download fallback"); },
    };
    if (platform === "android") environment.androidBridge = {};
    else environment.webkit = { messageHandlers: { bridge: {} } };
    return { environment, calls };
}

test("summary starts with the simulation notice and includes all drafts and exercise context", () => {
    const text = createSummary(state());
    assert.equal(text.split("\n")[0], NOTICE);
    assert.match(text, /historical Palisades wildfire, January 2025/);
    assert.match(text, /map and scenario values are illustrative training material/);
    assert.match(text, /Current language: Chinese \(zh\)/);
    assert.match(text, /Selected exercise channels: SMS, Social/);
    assert.match(text, /Review pending in this session/);
    assert.match(text, /does not confer official authority/);
    for (const draft of Object.values(state().drafts)) assert.ok(text.includes(draft));
});

test("blank drafts, no channels and session review are represented without inserting defaults", () => {
    const text = createSummary(state({ drafts: { en: "", es: "", zh: "" }, channels: [], language: "es", reviewed: true }));
    assert.equal(text.match(/\[Intentionally blank\]/g).length, 3);
    assert.match(text, /Current language: Spanish \(es\)/);
    assert.match(text, /Selected exercise channels: None/);
    assert.match(text, /Reviewed in this session/);
    assert.match(text, /Current-language session review \(Spanish, es\): Reviewed in this session/);
    assert.match(text, /Other language drafts are not claimed reviewed/);
    assert.match(text, /does not confer official authority or authorize sending an alert/);
});

test("export preserves multiline Unicode and literal text without interpreting HTML", () => {
    const draft = '<script>alert("practice")</script>\nA & B < C\n疏散演练 🏠';
    const input = state({ drafts: { en: draft, es: "", zh: "" } });
    const before = JSON.stringify(input);
    const text = createSummary(input);
    assert.ok(text.includes(draft));
    assert.ok(!text.includes("&lt;script&gt;"));
    assert.equal(JSON.stringify(input), before);
    assert.equal(createSummary(input), text);
});

test("maximum-length drafts remain bounded and are never silently truncated", () => {
    const draft = "演".repeat(20000);
    const text = createSummary(state({ drafts: { en: draft, es: draft, zh: draft } }));
    assert.equal(text.split(draft).length, 4);
    assert.ok(new TextEncoder().encode(text).byteLength <= 200 * 1024);
});

test("invalid exercise states cannot be exported as apparently valid summaries", async (t) => {
    const sparse = new Array(1);
    const invalid = [
        null, {}, [], state({ extra: true }), state({ reviewed: "true" }),
        state({ language: "fr" }), state({ language: "toString" }),
        state({ channels: ["SMS", "SMS"] }), state({ channels: ["Email"] }), state({ channels: sparse }),
        state({ channels: "SMS" }), state({ drafts: { en: "a", es: "b" } }),
        state({ drafts: { en: "a", es: "b", zh: "c", fr: "d" } }),
        state({ drafts: { en: 12, es: "", zh: "" } }),
        state({ drafts: { en: "a".repeat(20001), es: "", zh: "" } }),
        state({ drafts: { en: "\u0000".repeat(20000), es: "\u0000".repeat(20000), zh: "\u0000".repeat(20000) } }),
    ];
    for (const [index, input] of invalid.entries()) {
        await t.test(`invalid input ${index + 1}`, () => assert.throws(() => createSummary(input), TypeError));
    }
});

for (const platform of ["ios", "android"]) {
    test(`${platform} invokes the native Share plugin with the simulation text`, async () => {
        const { environment, calls } = nativeEnvironment(platform);
        const text = createSummary(state());
        assert.deepEqual(await shareSummary({ text, environment }), { status: "shared" });
        assert.deepEqual(calls, [{ title: "CivicGuard exercise summary", text, dialogTitle: "Share exercise summary" }]);
    });
}

test("missing or broken native plugin reports unavailable without browser fallback", async () => {
    const text = createSummary(state());
    for (const environment of [
        nativeEnvironment("ios", { available: false }).environment,
        { androidBridge: {} },
        { webkit: { messageHandlers: { bridge: {} } }, Capacitor: { isPluginAvailable: () => true } },
        { Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true, registerPlugin: () => ({}) } },
        nativeEnvironment("ios", { share: async () => { throw new Error("Share failed"); } }).environment,
    ]) assert.deepEqual(await shareSummary({ text, environment }), { status: "unavailable" });
});

test("native cancellation differs from failure, and resolved empty activityType is a completed share", async () => {
    const text = createSummary(state());
    const { environment } = nativeEnvironment("ios", { share: async () => { throw new Error("Share canceled"); } });
    assert.deepEqual(await shareSummary({ text, environment }), { status: "cancelled" });
    assert.deepEqual(await shareSummary({ text, environment: nativeEnvironment("ios").environment }), { status: "shared" });
});

test("Web Share is called synchronously during the original gesture without canShare", async () => {
    const calls = [];
    const text = createSummary(state());
    const environment = {
        navigator: {
            canShare() { throw new Error("Do not spend transient activation checking support"); },
            share(options) { calls.push(options); return Promise.resolve(); },
        },
        get document() { throw new Error("No download should happen after Web Share"); },
    };
    const result = shareSummary({ text, environment });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { title: "CivicGuard exercise summary", text });
    assert.deepEqual(await result, { status: "shared" });
});

test("web cancellation does not trigger a download and other Web Share errors remain visible", async () => {
    const text = createSummary(state());
    const makeEnvironment = (error) => ({
        navigator: { async share() { throw error; } },
        get document() { throw new Error("Unexpected download fallback"); },
    });
    assert.deepEqual(await shareSummary({ text, environment: makeEnvironment(new DOMException("User cancelled", "AbortError")) }), { status: "cancelled" });
    assert.deepEqual(await shareSummary({ text, environment: makeEnvironment(new DOMException("Blocked by policy", "NotAllowedError")) }), { status: "unavailable" });
});

test("Electron's blocked download fallback reports unavailable without pretending to save a file", async () => {
    const environment = {
        navigator: { userAgent: "Mozilla/5.0 Chrome/150.0.0.0 Electron/44.7.0 Safari/537.36" },
        get document() { throw new Error("Electron must not attempt a blocked download"); },
    };
    assert.deepEqual(await shareSummary({ text: createSummary(state()), environment }), { status: "unavailable" });
});

test("a supported Web Share remains usable in Electron without reaching the blocked download path", async () => {
    const calls = [];
    const environment = {
        navigator: {
            userAgent: "Mozilla/5.0 Electron/44.7.0",
            async share(options) { calls.push(options); },
        },
        get document() { throw new Error("No download should happen after Web Share"); },
    };
    const text = createSummary(state());
    assert.deepEqual(await shareSummary({ text, environment }), { status: "shared" });
    assert.deepEqual(calls, [{ title: "CivicGuard exercise summary", text }]);
});

test("browser fallback downloads a plain text file and releases its URL after a bounded delay", async () => {
    const text = createSummary(state());
    const download = downloadEnvironment();
    assert.deepEqual(await shareSummary({ text, environment: download.environment }), { status: "downloaded" });
    assert.equal(download.anchor.href, "blob:exercise-summary");
    assert.equal(download.anchor.download, "CivicGuard-exercise-summary.txt");
    assert.equal(download.anchor.hidden, true);
    assert.equal(download.blob().type, "text/plain;charset=utf-8");
    assert.equal(await download.blob().text(), text);
    assert.deepEqual(download.events, ["create-url", "append", "click", "remove", "schedule-cleanup"]);
    download.cleanup();
    assert.equal(download.events.at(-1), "revoke-url");
});

test("a failed download still removes the anchor and releases its object URL", async () => {
    const download = downloadEnvironment({ clickError: new Error("Download denied") });
    assert.deepEqual(await shareSummary({ text: createSummary(state()), environment: download.environment }), { status: "unavailable" });
    assert.ok(download.events.includes("remove"));
    download.cleanup();
    assert.equal(download.events.at(-1), "revoke-url");
});

test("download releases the URL immediately when a timer is unavailable", async () => {
    const download = downloadEnvironment({ timer: false });
    assert.deepEqual(await shareSummary({ text: createSummary(state()), environment: download.environment }), { status: "downloaded" });
    assert.equal(download.events.at(-1), "revoke-url");
});

test("invalid, unlabelled or oversized export text never reaches a share or download target", async () => {
    const environment = { get navigator() { throw new Error("Invalid text must not reach a share target"); } };
    for (const text of [null, undefined, "Official evacuation alert", `prefix\n${NOTICE}\nbody`, `${NOTICE}\n${"x".repeat(200 * 1024)}`]) {
        assert.deepEqual(await shareSummary({ text, environment }), { status: "unavailable" });
    }
    assert.deepEqual(await shareSummary({ text: createSummary(state()), environment: {} }), { status: "unavailable" });
    assert.deepEqual(await shareSummary(null), { status: "unavailable" });
});

test("the browser script exposes both functions without CommonJS or a bundler", async () => {
    const environment = { TextEncoder, navigator: { async share() {} } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../exercise-export.js"), "utf8"), environment);
    const text = environment.CivicGuardExport.createSummary(state());
    assert.equal(text.split("\n")[0], NOTICE);
    const result = await environment.CivicGuardExport.shareSummary({ text });
    assert.equal(result.status, "shared");
});
