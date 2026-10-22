const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { KEY, createStore } = require("../draft-store.js");

function snapshot(text = "English simulation draft") {
    return {
        drafts: { en: text, es: "Borrador de simulación", zh: "模拟草稿" },
        language: "en",
        channels: ["WEA", "SMS"],
    };
}

function envelope(value = snapshot()) {
    return { version: 1, scenario: "palisades-2025", ...value };
}

function memoryBackend(initial = null) {
    let value = initial;
    const calls = [];
    return {
        calls,
        get value() { return value; },
        async getItem(key) {
            calls.push(["getItem", key]);
            return value;
        },
        async setItem(key, next) {
            calls.push(["setItem", key, next]);
            value = next;
        },
        async removeItem(key) {
            calls.push(["removeItem", key]);
            value = null;
        },
    };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

test("the same store API is available as a browser global and CommonJS module", () => {
    const context = { TextEncoder };
    vm.runInNewContext(fs.readFileSync(require.resolve("../draft-store.js"), "utf8"), context);
    assert.equal(KEY, "civicguard.palisades-drafts.v1");
    assert.equal(context.CivicGuardDraftStore.KEY, KEY);
    assert.equal(typeof context.CivicGuardDraftStore.createStore, "function");
});

test("loading an absent draft is read-only and does not save defaults", async () => {
    const backend = memoryBackend();
    assert.deepEqual(await createStore(backend).load(), { status: "empty" });
    assert.deepEqual(backend.calls, [["getItem", KEY]]);
    assert.equal(backend.value, null);
});

test("a draft round trip uses a versioned scenario envelope and restores only draft state", async () => {
    const backend = memoryBackend();
    const store = createStore(backend);
    const original = snapshot();
    original.language = "zh";
    original.channels = ["WEA", "EAS", "SMS", "Social"];
    assert.deepEqual(await store.save(original), { status: "saved" });
    assert.deepEqual(JSON.parse(backend.value), envelope(original));
    assert.deepEqual(await store.load(), { status: "restored", snapshot: original });
    assert.equal(backend.calls.filter(([name]) => name === "setItem").length, 1);
    assert.ok(backend.calls.every(([, key]) => key === KEY));
});

test("intentionally empty drafts and channel selections survive storage", async () => {
    const backend = memoryBackend();
    const store = createStore(backend);
    const empty = { drafts: { en: "", es: "", zh: "" }, language: "es", channels: [] };
    assert.deepEqual(await store.save(empty), { status: "saved" });
    assert.deepEqual(await store.load(), { status: "restored", snapshot: empty });
});

test("corrupt, unsupported and wrongly typed stored data are preserved without overwriting", async (t) => {
    const malformed = {
        "empty string": "",
        "broken JSON": "{not json",
        "JSON null": "null",
        "JSON array": "[]",
        "non-string backend value": envelope(),
        "undefined backend value": undefined,
        "future version": JSON.stringify({ ...envelope(), version: 2 }),
        "string version": JSON.stringify({ ...envelope(), version: "1" }),
        "wrong scenario": JSON.stringify({ ...envelope(), scenario: "another-incident" }),
        "missing language": JSON.stringify({ version: 1, scenario: "palisades-2025", drafts: snapshot().drafts, channels: [] }),
        "unknown language": JSON.stringify(envelope({ ...snapshot(), language: "fr" })),
        "null drafts": JSON.stringify(envelope({ ...snapshot(), drafts: null })),
        "missing translation": JSON.stringify(envelope({ ...snapshot(), drafts: { en: "draft", es: "borrador" } })),
        "numeric translation": JSON.stringify(envelope({ ...snapshot(), drafts: { ...snapshot().drafts, zh: 5 } })),
        "extra translation": JSON.stringify(envelope({ ...snapshot(), drafts: { ...snapshot().drafts, fr: "draft" } })),
        "channel string": JSON.stringify(envelope({ ...snapshot(), channels: "WEA" })),
        "unknown channel": JSON.stringify(envelope({ ...snapshot(), channels: ["Email"] })),
        "duplicate channel": JSON.stringify(envelope({ ...snapshot(), channels: ["WEA", "WEA"] })),
        "null channel": JSON.stringify(envelope({ ...snapshot(), channels: [null] })),
        "approval state": JSON.stringify({ ...envelope(), approved: true }),
        "oversized translation": JSON.stringify(envelope({ ...snapshot(), drafts: { ...snapshot().drafts, en: "x".repeat(20001) } })),
        "oversized serialized value": " ".repeat(200 * 1024) + JSON.stringify(envelope()),
        "oversized UTF-8 value": JSON.stringify(envelope({
            ...snapshot(),
            drafts: Object.fromEntries(["en", "es", "zh"].map((language) => [language, "\0".repeat(8000) + "中".repeat(12000)])),
        })),
    };
    for (const [name, serialized] of Object.entries(malformed)) {
        await t.test(name, async () => {
            const backend = memoryBackend();
            backend.getItem = async (key) => {
                backend.calls.push(["getItem", key]);
                return serialized;
            };
            assert.deepEqual(await createStore(backend).load(), { status: "invalid" });
            assert.deepEqual(backend.calls, [["getItem", KEY]]);
        });
    }
});

test("invalid saves cannot replace an existing valid record or persist approval state", async (t) => {
    const invalidSnapshots = {
        "null": null,
        "array": [],
        "missing drafts": { language: "en", channels: [] },
        "unsupported language": { ...snapshot(), language: "EN" },
        "non-string draft": { ...snapshot(), drafts: { ...snapshot().drafts, en: false } },
        "unknown channel": { ...snapshot(), channels: ["email"] },
        "duplicated channel": { ...snapshot(), channels: ["SMS", "SMS"] },
        "sparse channel array": { ...snapshot(), channels: new Array(1) },
        "approval field": { ...snapshot(), approved: true },
        "extra snapshot field": { ...snapshot(), arbitrary: "data" },
        "extra language field": { ...snapshot(), drafts: { ...snapshot().drafts, fr: "draft" } },
        "oversized draft": { ...snapshot(), drafts: { ...snapshot().drafts, en: "x".repeat(20001) } },
        "oversized escaped envelope": {
            ...snapshot(), drafts: { en: "\0".repeat(20000), es: "\0".repeat(20000), zh: "\0".repeat(20000) },
        },
        "UTF-8 bytes exceed limit while code units do not": {
            ...snapshot(),
            drafts: Object.fromEntries(["en", "es", "zh"].map((language) => [language, "\0".repeat(8000) + "中".repeat(12000)])),
        },
    };
    for (const [name, value] of Object.entries(invalidSnapshots)) {
        await t.test(name, async () => {
            const serialized = JSON.stringify(envelope());
            const backend = memoryBackend(serialized);
            assert.deepEqual(await createStore(backend).save(value), { status: "invalid" });
            assert.equal(backend.value, serialized);
            assert.deepEqual(backend.calls, []);
        });
    }
});

test("maximum length multilingual strings are accepted without truncation", async () => {
    const backend = memoryBackend();
    const store = createStore(backend);
    const value = { drafts: { en: "x".repeat(20000), es: "á".repeat(20000), zh: "中".repeat(20000) }, language: "zh", channels: [] };
    assert.deepEqual(await store.save(value), { status: "saved" });
    assert.deepEqual(await store.load(), { status: "restored", snapshot: value });
});

test("storage security, quota and removal failures return unavailable without rejecting", async () => {
    const store = createStore({
        getItem() { throw new Error("Storage access denied"); },
        async setItem() { throw new Error("Quota exceeded"); },
        async removeItem() { throw new Error("Storage access denied"); },
    });
    assert.deepEqual(await store.load(), { status: "unavailable" });
    assert.deepEqual(await store.save(snapshot()), { status: "unavailable" });
    assert.deepEqual(await store.clear(), { status: "unavailable" });
});

test("a missing storage backend reports unavailable", async () => {
    const store = createStore(undefined);
    assert.deepEqual(await store.load(), { status: "unavailable" });
    assert.deepEqual(await store.save(snapshot()), { status: "unavailable" });
    assert.deepEqual(await store.clear(), { status: "unavailable" });
});

test("a failed write does not poison a later successful write or reset", async () => {
    const backend = memoryBackend();
    const persist = backend.setItem;
    let writes = 0;
    backend.setItem = async (key, value) => {
        if (++writes === 1) throw new Error("Quota exceeded");
        return persist(key, value);
    };
    const store = createStore(backend);
    const first = store.save(snapshot("First"));
    const second = store.save(snapshot("Second"));
    assert.deepEqual(await first, { status: "unavailable" });
    assert.deepEqual(await second, { status: "saved" });
    assert.equal(JSON.parse(backend.value).drafts.en, "Second");
    assert.deepEqual(await store.clear(), { status: "cleared" });
    assert.equal(backend.value, null);
});

test("a failed reset does not block a subsequent save", async () => {
    const backend = memoryBackend();
    backend.removeItem = async () => { throw new Error("Removal failed"); };
    const store = createStore(backend);
    const reset = store.clear();
    const save = store.save(snapshot("After failed reset"));
    assert.deepEqual(await reset, { status: "unavailable" });
    assert.deepEqual(await save, { status: "saved" });
    assert.equal(JSON.parse(backend.value).drafts.en, "After failed reset");
});

test("slow writes finish in invocation order and a queued reset cannot resurrect old drafts", async () => {
    const started = deferred();
    const releaseFirst = deferred();
    const backend = memoryBackend();
    const persist = backend.setItem;
    const operations = [];
    backend.setItem = async (key, value) => {
        const text = JSON.parse(value).drafts.en;
        operations.push(`start ${text}`);
        if (text === "First") {
            started.resolve();
            await releaseFirst.promise;
        }
        await persist(key, value);
        operations.push(`finish ${text}`);
    };
    const remove = backend.removeItem;
    backend.removeItem = async (key) => {
        operations.push("clear");
        await remove(key);
    };
    const store = createStore(backend);
    const first = store.save(snapshot("First"));
    const second = store.save(snapshot("Second"));
    const reset = store.clear();
    const load = store.load();
    await started.promise;
    assert.deepEqual(operations, ["start First"]);
    releaseFirst.resolve();
    assert.deepEqual(await Promise.all([first, second, reset, load]), [
        { status: "saved" }, { status: "saved" }, { status: "cleared" }, { status: "empty" },
    ]);
    assert.deepEqual(operations, ["start First", "finish First", "start Second", "finish Second", "clear"]);
    assert.equal(backend.value, null);
    assert.deepEqual(await store.save(snapshot("New draft")), { status: "saved" });
    assert.equal(JSON.parse(backend.value).drafts.en, "New draft");
});

test("a save snapshots nested values at invocation even while another write is pending", async () => {
    const releaseFirst = deferred();
    const started = deferred();
    const backend = memoryBackend();
    const persist = backend.setItem;
    let writes = 0;
    backend.setItem = async (key, value) => {
        if (++writes === 1) {
            started.resolve();
            await releaseFirst.promise;
        }
        await persist(key, value);
    };
    const store = createStore(backend);
    const first = store.save(snapshot("First"));
    await started.promise;
    const value = snapshot("Original queued draft");
    const saved = store.save(value);
    value.drafts.en = "Changed after save";
    value.channels.push("Social");
    value.language = "zh";
    releaseFirst.resolve();
    await Promise.all([first, saved]);
    assert.deepEqual(JSON.parse(backend.value), envelope(snapshot("Original queued draft")));
});

test("a load queued after save observes the completed write and returns independent data", async () => {
    const backend = memoryBackend();
    const store = createStore(backend);
    const saved = store.save(snapshot("Queued"));
    const loaded = store.load();
    assert.deepEqual(await saved, { status: "saved" });
    const result = await loaded;
    assert.deepEqual(result, { status: "restored", snapshot: snapshot("Queued") });
    result.snapshot.drafts.en = "Mutated restored draft";
    result.snapshot.channels.length = 0;
    assert.deepEqual(await store.load(), { status: "restored", snapshot: snapshot("Queued") });
});
