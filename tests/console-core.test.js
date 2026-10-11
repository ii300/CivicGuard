const test = require("node:test");
const assert = require("node:assert/strict");
const { escapeHtml, loadSource } = require("../console-core.js");

const SOURCE_URL = "https://example.invalid/observations.geojson";
const ALLOWED_TYPES = ["Point", "Polygon", "MultiPolygon"];

function feature(geometry, properties = {}) {
    return { type: "Feature", properties, geometry };
}

function collection(...features) {
    return { type: "FeatureCollection", features };
}

const fallback = collection(feature({ type: "Point", coordinates: [-118.5, 34.1] }, {
    name: "Explicit sample data",
}));

function responseWith(data) {
    return { ok: true, status: 200, json: async () => data };
}

async function loadData(data, allowedTypes = ALLOWED_TYPES) {
    return loadSource(SOURCE_URL, fallback, allowedTypes, {
        fetchImpl: async () => responseWith(data),
        timeoutMs: 1000,
    });
}

function assertSample(result) {
    assert.equal(result.provenance, "sample");
    assert.deepEqual(result.data, fallback);
    assert.equal(typeof result.detail, "string");
    assert.ok(result.detail.trim(), "fallback must explain why remote data was unavailable");
}

test("escapeHtml makes external text safe in HTML text and quoted attributes", () => {
    const unsafe = `<img src="x" onerror='alert(1)'>&`;
    const escaped = escapeHtml(unsafe);
    assert.ok(!/[<>"']/.test(escaped));
    assert.ok(escaped.includes("&lt;img"));
    assert.ok(escaped.includes("&quot;x&quot;"));
    assert.ok(escaped.endsWith("&amp;"));
    assert.equal(escapeHtml(0), "0");
    assert.equal(escapeHtml("Ordinary road name"), "Ordinary road name");
});

test("a valid empty remote collection stays empty rather than inventing sample incidents", async () => {
    const data = collection();
    const result = await loadData(data);
    assert.equal(result.provenance, "remote");
    assert.strictEqual(result.data, data);
    assert.deepEqual(result.data.features, []);
});

test("valid remote coordinates are preserved even south of the former scenario cutoff", async () => {
    const data = collection(feature({
        type: "Point",
        coordinates: [-118.4455, 34.0701],
    }, { NAME: "Support site south of the scenario" }));
    const before = JSON.stringify(data);
    const result = await loadData(data, ["Point"]);
    assert.equal(result.provenance, "remote");
    assert.strictEqual(result.data, data);
    assert.equal(JSON.stringify(result.data), before);
});

test("valid polygon holes and multipolygon coordinates are preserved", async () => {
    const outer = [[-118.7, 34], [-118.4, 34], [-118.4, 34.3], [-118.7, 34]];
    const hole = [[-118.6, 34.1], [-118.5, 34.1], [-118.5, 34.2], [-118.6, 34.1]];
    const data = collection(
        feature({ type: "Polygon", coordinates: [outer, hole] }),
        feature({ type: "MultiPolygon", coordinates: [[outer], [outer, hole]] }),
    );
    const before = JSON.stringify(data);
    const result = await loadData(data, ["Polygon", "MultiPolygon"]);
    assert.equal(result.provenance, "remote");
    assert.strictEqual(result.data, data);
    assert.equal(JSON.stringify(result.data), before);
});

test("unavailable, invalid JSON, and HTTP error responses explicitly use sample data", async (t) => {
    const failures = {
        "network rejection": async () => { throw new Error("Network unavailable"); },
        "HTTP failure": async () => ({ ok: false, status: 503, json: async () => collection() }),
        "invalid JSON": async () => ({ ok: true, status: 200, json: async () => {
            throw new SyntaxError("Invalid JSON");
        } }),
    };
    for (const [name, fetchImpl] of Object.entries(failures)) {
        await t.test(name, async () => {
            assertSample(await loadSource(SOURCE_URL, fallback, ALLOWED_TYPES, {
                fetchImpl,
                timeoutMs: 1000,
            }));
        });
    }
});

test("HTTP 200 API errors and truncated datasets are not accepted as complete remote data", async (t) => {
    for (const [name, data] of [
        ["ArcGIS error payload", { error: { code: 400, message: "Invalid query", details: [] } }],
        ["transfer limit exceeded", { ...fallback, exceededTransferLimit: true }],
        ["transfer limit in collection properties", { ...fallback, properties: { exceededTransferLimit: true } }],
    ]) {
        await t.test(name, async () => assertSample(await loadData(data)));
    }
});

test("malformed collections and geometries explicitly use sample data", async (t) => {
    const malformed = {
        "missing features": { type: "FeatureCollection" },
        "features is not an array": { type: "FeatureCollection", features: {} },
        "wrong collection type": { type: "Feature", features: [] },
        "null feature": collection(null),
        "missing geometry": collection({ type: "Feature", properties: {} }),
        "null geometry": collection(feature(null)),
        "unsupported geometry": collection(feature({ type: "LineString", coordinates: [[0, 0], [1, 1]] })),
        "point missing latitude": collection(feature({ type: "Point", coordinates: [-118.5] })),
        "point string coordinate": collection(feature({ type: "Point", coordinates: ["-118.5", 34] })),
        "point infinite coordinate": collection(feature({ type: "Point", coordinates: [Infinity, 34] })),
        "point NaN coordinate": collection(feature({ type: "Point", coordinates: [-118.5, NaN] })),
        "point longitude out of range": collection(feature({ type: "Point", coordinates: [181, 34] })),
        "point latitude out of range": collection(feature({ type: "Point", coordinates: [-118.5, -91] })),
        "empty polygon": collection(feature({ type: "Polygon", coordinates: [] })),
        "polygon short ring": collection(feature({ type: "Polygon", coordinates: [[[0, 0], [1, 1], [0, 0]]] })),
        "polygon open ring": collection(feature({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })),
        "polygon invalid coordinate": collection(feature({ type: "Polygon", coordinates: [[[0, 0], [181, 0], [1, 1], [0, 0]]] })),
        "empty multipolygon": collection(feature({ type: "MultiPolygon", coordinates: [] })),
        "multipolygon empty polygon": collection(feature({ type: "MultiPolygon", coordinates: [[]] })),
    };
    for (const [name, data] of Object.entries(malformed)) {
        await t.test(name, async () => assertSample(await loadData(data)));
    }
});

test("a geometry valid for another layer is rejected by the layer's allowed types", async () => {
    const data = collection(feature({ type: "Point", coordinates: [-118.5, 34] }));
    assertSample(await loadData(data, ["Polygon", "MultiPolygon"]));
});

test("a stalled request is aborted after the timeout and returns explicit sample data", async () => {
    let requestSignal;
    const result = await loadSource(SOURCE_URL, fallback, ALLOWED_TYPES, {
        timeoutMs: 15,
        fetchImpl: (_url, { signal }) => {
            requestSignal = signal;
            return new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => {
                    const error = new Error("Request aborted");
                    error.name = "AbortError";
                    reject(error);
                }, { once: true });
            });
        },
    });
    assertSample(result);
    assert.ok(requestSignal.aborted, "timed out fetch should release its request");
});

test("the timeout also covers a stalled response body after HTTP headers arrive", async () => {
    let requestSignal;
    let readBody = false;
    const result = await loadSource(SOURCE_URL, fallback, ALLOWED_TYPES, {
        timeoutMs: 15,
        fetchImpl: async (_url, { signal }) => {
            requestSignal = signal;
            return {
                ok: true,
                status: 200,
                json: () => {
                    readBody = true;
                    return new Promise(() => {});
                },
            };
        },
    });
    assert.ok(readBody, "HTTP response must have arrived before timeout");
    assertSample(result);
    assert.ok(requestSignal.aborted);
});
