(function (root) {
    "use strict";

    function escapeHtml(value) {
        const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return String(value).replace(/[&<>"']/g, (character) => entities[character]);
    }

    function validPosition(position) {
        return Array.isArray(position) && position.length >= 2 &&
            position.every(Number.isFinite) &&
            Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90;
    }

    function validRing(ring) {
        return Array.isArray(ring) && ring.length >= 4 && ring.every(validPosition) &&
            ring[0][0] === ring[ring.length - 1][0] &&
            ring[0][1] === ring[ring.length - 1][1];
    }

    function validPolygon(polygon) {
        return Array.isArray(polygon) && polygon.length > 0 && polygon.every(validRing);
    }

    function validGeometry(geometry, allowedTypes) {
        if (!geometry || !allowedTypes.includes(geometry.type)) return false;
        if (geometry.type === "Point") return validPosition(geometry.coordinates);
        if (geometry.type === "Polygon") return validPolygon(geometry.coordinates);
        return geometry.type === "MultiPolygon" &&
            Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 &&
            geometry.coordinates.every(validPolygon);
    }

    async function loadSource(url, fallback, allowedTypes, options = {}) {
        const fetchImpl = options.fetchImpl || fetch;
        const controller = new AbortController();
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error("Request timed out"));
                controller.abort();
            }, options.timeoutMs ?? 10000);
        });
        try {
            const request = (async () => {
                const response = await fetchImpl(url, { signal: controller.signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (data?.type !== "FeatureCollection" || !Array.isArray(data.features) ||
                    data.error || data.exceededTransferLimit || data.properties?.exceededTransferLimit ||
                    !data.features.every((feature) => feature?.type === "Feature" &&
                        (feature.properties === null || (typeof feature.properties === "object" &&
                            !Array.isArray(feature.properties))) &&
                        validGeometry(feature.geometry, allowedTypes))) {
                    throw new Error("Invalid or incomplete source data");
                }
                return data;
            })();
            return { data: await Promise.race([request, timeout]), provenance: "remote", detail: "Public service response; currency unverified" };
        } catch (error) {
            return { data: fallback, provenance: "sample", detail: error.message || "Source unavailable" };
        } finally {
            clearTimeout(timer);
        }
    }

    const api = { escapeHtml, loadSource };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.CivicGuard = api;
})(globalThis);
