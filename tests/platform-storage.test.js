"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createStorageBackend } = require("../platform-storage.js");

const capacitorRuntime = fs.readFileSync(path.join(path.dirname(require.resolve("@capacitor/core/package.json")), "dist/capacitor.js"), "utf8");

function browserStorage() {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
    };
}

function nativeEnvironment(platform, { available = true, nativePromise } = {}) {
    const values = new Map();
    const calls = [];
    const environment = {
        console,
        Capacitor: {
            Plugins: {},
            PluginHeaders: available ? [{ name: "Preferences", methods: ["get", "set", "remove"].map((name) => ({ name, rtype: "promise" })) }] : [],
            nativePromise: nativePromise || (async (plugin, method, options) => {
                calls.push({ plugin, method, options });
                if (method === "get") return { value: values.get(options.key) ?? null };
                if (method === "set") values.set(options.key, options.value);
                if (method === "remove") values.delete(options.key);
                return {};
            }),
        },
    };
    if (platform === "android") environment.androidBridge = { postMessage() {} };
    else environment.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
    Object.defineProperty(environment, "localStorage", {
        get() { throw new Error("Native storage must never fall back to localStorage"); },
    });
    // Exercise the same official runtime shipped in the app, including native
    // platform detection, plugin headers, proxy registration and promise calls.
    vm.runInNewContext(capacitorRuntime, environment);
    return { environment, calls };
}

test("browser operations are asynchronous and preserve string storage semantics", async () => {
    const storage = browserStorage();
    let accesses = 0;
    const environment = { get localStorage() { accesses += 1; return storage; } };
    const backend = createStorageBackend(environment);
    assert.equal(accesses, 0);
    assert.equal(await backend.getItem("missing"), null);
    assert.equal(await backend.setItem("draft", "疏散草稿 🏠"), undefined);
    assert.equal(await backend.getItem("draft"), "疏散草稿 🏠");
    await backend.setItem(12, 42);
    assert.equal(await backend.getItem("12"), "42");
    assert.equal(await backend.removeItem("draft"), undefined);
    assert.equal(await backend.getItem("draft"), null);
    assert.ok(accesses > 0);
});

test("a blocked browser storage getter rejects operations without breaking initialization", async () => {
    const denied = new DOMException("Blocked by browser policy", "SecurityError");
    const backend = createStorageBackend({ get localStorage() { throw denied; } });
    for (const operation of [() => backend.getItem("draft"), () => backend.setItem("draft", "text"), () => backend.removeItem("draft")]) {
        await assert.rejects(operation, (error) => error === denied);
    }
});

test("browser quota failures propagate and do not erase the existing draft", async () => {
    const storage = browserStorage();
    storage.setItem("draft", "saved text");
    const full = new DOMException("Storage full", "QuotaExceededError");
    storage.setItem = () => { throw full; };
    const backend = createStorageBackend({ localStorage: storage });
    await assert.rejects(backend.setItem("draft", "new text"), (error) => error === full);
    assert.equal(await backend.getItem("draft"), "saved text");
});

for (const platform of ["android", "ios"]) {
    test(`${platform} uses the installed Capacitor runtime to call native Preferences`, async () => {
        const { environment, calls } = nativeEnvironment(platform);
        assert.equal(environment.Capacitor.getPlatform(), platform);
        const backend = createStorageBackend(environment);
        assert.equal(await backend.getItem("draft"), null);
        assert.equal(await backend.setItem("draft", "疏散草稿"), undefined);
        assert.equal(await backend.getItem("draft"), "疏散草稿");
        assert.equal(await backend.removeItem("draft"), undefined);
        assert.equal(await backend.getItem("draft"), null);
        assert.deepEqual(calls.map(({ plugin, method }) => [plugin, method]), [
            ["Preferences", "get"], ["Preferences", "set"], ["Preferences", "get"], ["Preferences", "remove"], ["Preferences", "get"],
        ]);
        assert.deepEqual(calls[1].options, { key: "draft", value: "疏散草稿" });
    });
}

test("a missing native Preferences plugin rejects every operation without web fallback", async () => {
    const { environment, calls } = nativeEnvironment("ios", { available: false });
    const backend = createStorageBackend(environment);
    for (const operation of [() => backend.getItem("draft"), () => backend.setItem("draft", "text"), () => backend.removeItem("draft")]) {
        await assert.rejects(operation, { code: "NATIVE_STORAGE_UNAVAILABLE" });
    }
    assert.deepEqual(calls, []);
});

test("a native bridge without the JS registration runtime does not silently use localStorage", async () => {
    const environment = {
        androidBridge: {},
        Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true },
        get localStorage() { throw new Error("Unexpected fallback"); },
    };
    await assert.rejects(createStorageBackend(environment).getItem("draft"), { code: "NATIVE_STORAGE_UNAVAILABLE" });
    delete environment.Capacitor;
    await assert.rejects(createStorageBackend(environment).getItem("draft"), { code: "NATIVE_STORAGE_UNAVAILABLE" });
});

test("native read, write and removal failures preserve the rejection from Preferences", async () => {
    const failure = new Error("Native persistence failed");
    const { environment } = nativeEnvironment("android", { nativePromise: async () => { throw failure; } });
    const backend = createStorageBackend(environment);
    for (const operation of [() => backend.getItem("draft"), () => backend.setItem("draft", "text"), () => backend.removeItem("draft")]) {
        await assert.rejects(operation, (error) => error === failure);
    }
});

test("an invalid native response is an error rather than an empty saved draft", async () => {
    const { environment } = nativeEnvironment("ios", { nativePromise: async () => ({}) });
    await assert.rejects(createStorageBackend(environment).getItem("draft"), /invalid value/);
});

test("the browser script exposes the platform API without CommonJS or a bundler", async () => {
    const environment = { localStorage: browserStorage() };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../platform-storage.js"), "utf8"), environment);
    const backend = environment.CivicGuardPlatform.createStorageBackend();
    await backend.setItem("draft", "plain script");
    assert.equal(await backend.getItem("draft"), "plain script");
});
