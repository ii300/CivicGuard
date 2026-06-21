const SOURCES = {
    palisadesPerimeter:
        "https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/Eaton_and_Palisades_Dissolved_Fire_Perimeters/FeatureServer/0/query?where=FireName%3D%27Palisades%20Fire%27&outFields=*&returnGeometry=true&f=geojson&outSR=4326",
    roadClosures:
        "https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Road_Closures_Feb2025_Activation_view/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson&outSR=4326",
    massCare:
        "https://services7.arcgis.com/DSSF7DFVxfZsz379/arcgis/rest/services/City_of_LA_Mass_Care_Locations/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson&outSR=4326",
};

const MESSAGES = {
    en: "EVACUATION ORDER: Leave now from the red Topanga / Palisades Highlands wildland-interface zone. Use open eastbound routes such as Sunset Blvd or Temescal Canyon only if officials confirm them. Avoid Topanga Canyon, Mulholland, and posted closures. Take people, pets, medications, documents, and phones.",
    es: "ORDEN DE EVACUACION: Salga ahora de la zona roja de interfaz silvestre Topanga / Palisades Highlands. Use rutas abiertas hacia el este como Sunset Blvd o Temescal Canyon solo si las autoridades las confirman. Evite Topanga Canyon, Mulholland y los cierres publicados. Lleve personas, mascotas, medicinas, documentos y telefonos.",
    zh: "疏散命令：请立即离开红色标示的 Topanga / Palisades Highlands 山火-城市交界区域。仅在官方确认开放时使用 Sunset Blvd 或 Temescal Canyon 等东向路线。避开 Topanga Canyon、Mulholland 以及已公布封路。请携带人员、宠物、药物、证件和手机。",
};

const fallbackPerimeter = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: {
                name: "Palisades Fire (01-2025)",
                FireName: "Palisades Fire",
                type: "Heat Perimeter",
            },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [-118.638, 34.095],
                        [-118.615, 34.08],
                        [-118.574, 34.081],
                        [-118.536, 34.095],
                        [-118.528, 34.118],
                        [-118.553, 34.139],
                        [-118.594, 34.139],
                        [-118.63, 34.121],
                        [-118.648, 34.104],
                        [-118.638, 34.095],
                    ],
                ],
            },
        },
    ],
};

const evacuationAreas = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: {
                zone: "PAL-ORDER-01",
                status: "Evacuation Order",
                label: "Topanga / Palisades Highlands WUI",
            },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [-118.63, 34.088],
                        [-118.593, 34.078],
                        [-118.555, 34.084],
                        [-118.529, 34.099],
                        [-118.528, 34.123],
                        [-118.55, 34.143],
                        [-118.586, 34.146],
                        [-118.619, 34.131],
                        [-118.644, 34.107],
                        [-118.63, 34.088],
                    ],
                ],
            },
        },
        {
            type: "Feature",
            properties: {
                zone: "PAL-WARN-02",
                status: "Evacuation Warning",
                label: "Mandeville / Brentwood Hills Interface",
            },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [-118.536, 34.087],
                        [-118.496, 34.087],
                        [-118.461, 34.102],
                        [-118.455, 34.128],
                        [-118.486, 34.149],
                        [-118.526, 34.147],
                        [-118.555, 34.126],
                        [-118.536, 34.087],
                    ],
                ],
            },
        },
        {
            type: "Feature",
            properties: {
                zone: "PAL-WARN-03",
                status: "Evacuation Warning",
                label: "Topanga Canyon / Calabasas Foothills",
            },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [-118.706, 34.103],
                        [-118.67, 34.087],
                        [-118.631, 34.09],
                        [-118.624, 34.124],
                        [-118.653, 34.16],
                        [-118.704, 34.166],
                        [-118.74, 34.139],
                        [-118.738, 34.113],
                        [-118.706, 34.103],
                    ],
                ],
            },
        },
    ],
};

const fallbackRoadClosures = {
    type: "FeatureCollection",
    features: [
        pointFeature([-118.547, 34.082], {
            Road_Closure: "Palisades Dr & Chastain Pkwy",
            Type_Of_Closure: "Soft Closure",
            Date_Of_Closure: "01/08/2025",
            Directions: "Controlled eastbound movement toward Sunset",
        }),
        pointFeature([-118.595, 34.091], {
            Road_Closure: "Topanga Canyon Blvd & Entrada Rd",
            Type_Of_Closure: "Hard Closure",
            Date_Of_Closure: "01/08/2025",
            Directions: "Canyon access closed to non-emergency traffic",
        }),
        pointFeature([-118.492, 34.088], {
            Road_Closure: "Mandeville Canyon Rd & Westridge Rd",
            Type_Of_Closure: "Soft Closure",
            Date_Of_Closure: "01/08/2025",
            Directions: "Checkpoint with law enforcement presence",
        }),
        pointFeature([-118.606, 34.128], {
            Road_Closure: "Mulholland Dr & Topanga Canyon Blvd",
            Type_Of_Closure: "Hard Closure",
            Date_Of_Closure: "01/08/2025",
            Directions: "Ridge road closed near active fire perimeter",
        }),
        pointFeature([-118.475, 34.128], {
            Road_Closure: "Mulholland Dr & Sepulveda Pass",
            Type_Of_Closure: "Soft Closure",
            Date_Of_Closure: "01/08/2025",
            Directions: "East-side traffic control point",
        }),
    ],
};

const fallbackCare = {
    type: "FeatureCollection",
    features: [
        pointFeature([-118.4455, 34.0701], {
            NAME: "Westwood Recreation Center",
            ADDRESS: "1350 S Sepulveda Blvd",
            STATUS: "Mass care support",
        }),
        pointFeature([-118.5764, 34.1848], {
            NAME: "Pierce College Support Site",
            ADDRESS: "Woodland Hills",
            STATUS: "Large-animal and community care support",
        }),
        pointFeature([-118.6217, 34.1714], {
            NAME: "El Camino Real Charter Support Site",
            ADDRESS: "Woodland Hills",
            STATUS: "Community care support",
        }),
    ],
};

const SCENARIO_VIEW = [34.108, -118.588];
const SCENARIO_BOUNDS = {
    west: -118.75,
    south: 34.075,
    east: -118.43,
    north: 34.19,
};

function pointFeature(coordinates, properties) {
    return {
        type: "Feature",
        geometry: {
            type: "Point",
            coordinates,
        },
        properties,
    };
}

const map = L.map("map", {
    zoomControl: false,
}).setView(SCENARIO_VIEW, 11);

L.control.zoom({ position: "bottomleft" }).addTo(map);

[
    ["basemapPane", 100],
    ["evacuationPane", 560],
    ["perimeterPane", 570],
    ["closurePane", 620],
    ["carePane", 630],
    ["labelPane", 640],
].forEach(([name, zIndex]) => {
    map.createPane(name);
    map.getPane(name).style.zIndex = zIndex;
});

map.attributionControl.addAttribution(
    "Basemap &copy; Esri, HERE, Garmin, USGS, EPA, NPS",
);

let basemapOverlay;
let basemapRequestId = 0;
let basemapTimer;
const BASEMAP_PADDING_RATIO = 0.45;
const BASEMAP_MAX_DIMENSION = 2048;

function basemapImageSize() {
    const size = map.getSize();
    const scale = 1 + BASEMAP_PADDING_RATIO * 2;

    return {
        x: Math.min(
            BASEMAP_MAX_DIMENSION,
            Math.max(480, Math.round(size.x * scale)),
        ),
        y: Math.min(
            BASEMAP_MAX_DIMENSION,
            Math.max(480, Math.round(size.y * scale)),
        ),
    };
}

function paddedBasemapBounds() {
    return map.getBounds().pad(BASEMAP_PADDING_RATIO);
}

function basemapUrl(bounds) {
    const size = basemapImageSize();
    const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
    ]
        .map((value) => value.toFixed(6))
        .join(",");

    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${size.x},${size.y}&format=png32&transparent=false&f=image`;
}

function refreshBasemap() {
    map.invalidateSize();
    const bounds = paddedBasemapBounds();
    if (!bounds.isValid()) return;

    const requestId = ++basemapRequestId;
    const nextOverlay = L.imageOverlay(basemapUrl(bounds), bounds, {
        pane: "basemapPane",
        interactive: false,
        opacity: 1,
    });

    nextOverlay.once("load", () => {
        if (requestId !== basemapRequestId) {
            map.removeLayer(nextOverlay);
            return;
        }
        const previousOverlay = basemapOverlay;
        basemapOverlay = nextOverlay;
        if (previousOverlay) {
            map.removeLayer(previousOverlay);
        }
    });

    nextOverlay.once("error", () => {
        map.removeLayer(nextOverlay);
    });

    nextOverlay.addTo(map);
}

function scheduleBasemapRefresh(delay = 120) {
    window.clearTimeout(basemapTimer);
    basemapTimer = window.setTimeout(refreshBasemap, delay);
}

const layers = {
    perimeter: L.layerGroup().addTo(map),
    evacuation: L.layerGroup().addTo(map),
    closures: L.layerGroup().addTo(map),
    care: L.layerGroup().addTo(map),
};

let loadedBounds = L.latLngBounds([]);
let perimeterData = null;
let roadClosureData = null;
let careSiteData = null;
let overlayFrame = null;

function statusColor(status) {
    if (status === "Evacuation Order") return "#d14a3d";
    if (status === "Evacuation Warning") return "#d8aa2d";
    return "#2d6194";
}

function addBounds(layer) {
    if (layer.getBounds) {
        loadedBounds.extend(layer.getBounds());
    } else if (layer.getLatLng) {
        loadedBounds.extend(layer.getLatLng());
    }
}

function popupTable(title, rows) {
    const safeRows = rows
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
        .join("");
    return `<div class="popup"><strong>${title}</strong><dl>${safeRows}</dl></div>`;
}

function isLayerVisible(key) {
    return document.querySelector(`[data-layer="${key}"]`)?.checked !== false;
}

function projectCoord(coord) {
    const point = map.latLngToContainerPoint([coord[1], coord[0]]);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
}

function ringPath(ring) {
    if (!ring || ring.length === 0) return "";
    return `M${ring.map(projectCoord).join("L")}Z`;
}

function geometryPath(geometry) {
    if (!geometry) return "";
    if (geometry.type === "Polygon") {
        return geometry.coordinates.map(ringPath).join("");
    }
    if (geometry.type === "MultiPolygon") {
        return geometry.coordinates
            .map((polygon) => polygon.map(ringPath).join(""))
            .join("");
    }
    return "";
}

function featureCenter(feature) {
    const coords = [];

    function collect(value) {
        if (!Array.isArray(value)) return;
        if (typeof value[0] === "number" && typeof value[1] === "number") {
            coords.push(value);
            return;
        }
        value.forEach(collect);
    }

    collect(feature.geometry?.coordinates);
    if (!coords.length) return null;

    const lngs = coords.map((coord) => coord[0]);
    const lats = coords.map((coord) => coord[1]);
    return [
        (Math.min(...lngs) + Math.max(...lngs)) / 2,
        (Math.min(...lats) + Math.max(...lats)) / 2,
    ];
}

function renderGeoOverlay() {
    const svg = document.getElementById("geoOverlay");
    if (!svg) return;

    const size = map.getSize();
    svg.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);
    const parts = [];

    if (isLayerVisible("evacuation")) {
        evacuationAreas.features.forEach((feature) => {
            const status = feature.properties.status;
            const className =
                status === "Evacuation Order" ? "geo-order" : "geo-warning";
            const path = geometryPath(feature.geometry);
            if (path) {
                parts.push(`<path class="geo-zone ${className}" d="${path}" />`);
            }

            const center = featureCenter(feature);
            if (center) {
                const point = map.latLngToContainerPoint([center[1], center[0]]);
                const label = status === "Evacuation Order" ? "ORDER" : "WARNING";
                parts.push(
                    `<text class="geo-label" x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}" text-anchor="middle">${label}</text>`,
                );
            }
        });
    }

    if (isLayerVisible("perimeter")) {
        (perimeterData || fallbackPerimeter).features.forEach((feature) => {
            const path = geometryPath(feature.geometry);
            if (path) {
                parts.push(`<path class="geo-fire" d="${path}" />`);
            }
        });
    }

    if (isLayerVisible("closures")) {
        (roadClosureData || fallbackRoadClosures).features.forEach((feature) => {
            if (feature.geometry?.type !== "Point") return;
            const point = map.latLngToContainerPoint([
                feature.geometry.coordinates[1],
                feature.geometry.coordinates[0],
            ]);
            parts.push(
                `<circle class="geo-pin closure" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="8" />`,
            );
        });
    }

    if (isLayerVisible("care")) {
        (careSiteData || fallbackCare).features.forEach((feature) => {
            if (feature.geometry?.type !== "Point") return;
            const point = map.latLngToContainerPoint([
                feature.geometry.coordinates[1],
                feature.geometry.coordinates[0],
            ]);
            parts.push(
                `<circle class="geo-pin care" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="8" />`,
            );
        });
    }

    svg.innerHTML = parts.join("");
}

function scheduleGeoOverlayRender() {
    if (overlayFrame !== null) return;
    overlayFrame = window.requestAnimationFrame(() => {
        overlayFrame = null;
        renderGeoOverlay();
    });
}

function drawEvacuationAreas() {
    layers.evacuation.clearLayers();

    const geo = L.geoJSON(evacuationAreas, {
        pane: "evacuationPane",
        style: (feature) => ({
            color: statusColor(feature.properties.status),
            fillColor: statusColor(feature.properties.status),
            fillOpacity: feature.properties.status === "Evacuation Order" ? 0.42 : 0.34,
            weight: 3,
            dashArray:
                feature.properties.status === "Evacuation Warning" ? "7 6" : "",
        }),
        onEachFeature: (feature, layer) => {
            layer.bindPopup(
                popupTable(feature.properties.status, [
                    ["Zone", feature.properties.zone],
                    ["Area", feature.properties.label],
                    ["Note", "Scenario overlay constrained to Santa Monica Mountains wildfire terrain."],
                ]),
            );
            addBounds(layer);
        },
    }).addTo(layers.evacuation);

    geo.eachLayer((layer) => {
        const props = layer.feature?.properties || {};
        if (!layer.getBounds) return;
        L.marker(layer.getBounds().getCenter(), {
            pane: "labelPane",
            interactive: false,
            icon: zoneLabelIcon(props.status),
        }).addTo(layers.evacuation);
    });

    return geo;
}

async function fetchGeoJson(url, fallback) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    if (!data.features || data.features.length === 0) return fallback;
    return data;
}

function pointInsideScenario(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return false;
    const [lng, lat] = coordinates;
    return (
        lng >= SCENARIO_BOUNDS.west &&
        lng <= SCENARIO_BOUNDS.east &&
        lat >= SCENARIO_BOUNDS.south &&
        lat <= SCENARIO_BOUNDS.north
    );
}

function featureInsideScenario(feature) {
    if (feature.geometry?.type === "Point") {
        return pointInsideScenario(feature.geometry.coordinates);
    }

    let inside = false;
    function collect(coords) {
        if (inside || !Array.isArray(coords)) return;
        if (typeof coords[0] === "number") {
            inside = pointInsideScenario(coords);
            return;
        }
        coords.forEach(collect);
    }

    collect(feature.geometry?.coordinates);
    return inside;
}

function featureMinimumLatitude(feature) {
    let minLat = Infinity;

    function collect(coords) {
        if (!Array.isArray(coords)) return;
        if (typeof coords[0] === "number") {
            minLat = Math.min(minLat, coords[1]);
            return;
        }
        coords.forEach(collect);
    }

    collect(feature.geometry?.coordinates);
    return minLat;
}

function closureIcon() {
    return L.divIcon({
        className: "",
        html: '<span class="closure-marker">!</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
    });
}

function careIcon() {
    return L.divIcon({
        className: "",
        html: '<span class="care-marker">+</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
    });
}

function zoneLabelIcon(status) {
    const label = status === "Evacuation Order" ? "ORDER" : "WARNING";
    return L.divIcon({
        className: "",
        html: `<span class="zone-label">${label}</span>`,
        iconSize: [88, 24],
        iconAnchor: [44, 12],
    });
}

async function loadPerimeter() {
    const sourceData = await fetchGeoJson(SOURCES.palisadesPerimeter, fallbackPerimeter);
    const hasOffshoreVisualRisk = sourceData.features.some(
        (feature) => featureMinimumLatitude(feature) < SCENARIO_BOUNDS.south,
    );
    const data = hasOffshoreVisualRisk ? fallbackPerimeter : sourceData;
    perimeterData = data;
    layers.perimeter.clearLayers();
    L.geoJSON(data, {
        pane: "perimeterPane",
        style: {
            color: "#7f2f25",
            fillColor: "#7f2f25",
            fillOpacity: 0.28,
            weight: 4,
        },
        onEachFeature: (feature, layer) => {
            const props = feature.properties || {};
            layer.bindPopup(
                popupTable(props.name || "Palisades Fire perimeter", [
                    ["Fire", props.FireName],
                    ["Type", props.type],
                    ["Area", props.Shape__Area ? `${props.Shape__Area.toFixed(4)} square degrees` : ""],
                    [
                        "Source",
                        hasOffshoreVisualRisk
                            ? "Land-constrained WUI planning perimeter"
                            : "ArcGIS public wildfire perimeter service",
                    ],
                ]),
            );
            addBounds(layer);
        },
    }).addTo(layers.perimeter);

    document.getElementById("perimeterStatus").textContent = hasOffshoreVisualRisk
        ? "Constrained"
        : "Loaded";
    renderGeoOverlay();
}

async function loadRoadClosures() {
    const data = await fetchGeoJson(SOURCES.roadClosures, fallbackRoadClosures);
    const filteredFeatures = data.features.filter(featureInsideScenario);
    roadClosureData = {
        ...data,
        features: filteredFeatures.length
            ? filteredFeatures
            : fallbackRoadClosures.features,
    };
    layers.closures.clearLayers();

    const closureLayer = L.geoJSON(roadClosureData, {
        pointToLayer: (feature, latlng) =>
            L.marker(latlng, { icon: closureIcon(), pane: "closurePane" }),
        onEachFeature: (feature, layer) => {
            const props = feature.properties || {};
            layer.bindPopup(
                popupTable(props.Road_Closure || "Road closure", [
                    ["Type", props.Type_Of_Closure],
                    ["Date", props.Date_Of_Closure],
                    ["Directions", props.Directions],
                ]),
            );
            addBounds(layer);
        },
    }).addTo(layers.closures);

    document.getElementById("closureCount").textContent =
        closureLayer.getLayers().length.toString();
    renderGeoOverlay();
}

async function loadCareSites() {
    let data;
    try {
        data = await fetchGeoJson(SOURCES.massCare, fallbackCare);
    } catch {
        data = fallbackCare;
    }
    const filteredFeatures =
        data === fallbackCare
            ? data.features
            : data.features.filter((feature) => {
                  const text = JSON.stringify(feature.properties || {}).toLowerCase();
                  return (
                      featureInsideScenario(feature) &&
                      (text.includes("westwood") ||
                          text.includes("woodland") ||
                          text.includes("calabasas") ||
                          text.includes("pierce") ||
                          text.includes("el camino") ||
                          text.includes("support"))
                  );
              });
    careSiteData = {
        ...data,
        features: filteredFeatures.length ? filteredFeatures : fallbackCare.features,
    };

    layers.care.clearLayers();
    L.geoJSON(careSiteData, {
        pointToLayer: (feature, latlng) =>
            L.marker(latlng, { icon: careIcon(), pane: "carePane" }),
        onEachFeature: (feature, layer) => {
            const props = feature.properties || {};
            layer.bindPopup(
                popupTable(props.NAME || props.Name || "Mass care site", [
                    ["Address", props.ADDRESS || props.Address],
                    ["Status", props.STATUS || props.Status || "Open for support"],
                ]),
            );
            addBounds(layer);
        },
    }).addTo(layers.care);
    renderGeoOverlay();
}

function fitAll() {
    map.invalidateSize();
    if (loadedBounds.isValid()) {
        map.fitBounds(loadedBounds.pad(0.08), {
            animate: true,
            duration: 0.6,
        });
    } else {
        map.setView(SCENARIO_VIEW, 11);
    }
}

function setupControls() {
    document.querySelectorAll("[data-layer]").forEach((checkbox) => {
        checkbox.addEventListener("change", (event) => {
            const key = event.target.dataset.layer;
            if (event.target.checked) {
                layers[key].addTo(map);
            } else {
                map.removeLayer(layers[key]);
            }
            renderGeoOverlay();
        });
    });

    document.getElementById("fitAllButton").addEventListener("click", fitAll);
    map.on("zoom move", scheduleGeoOverlayRender);
    map.on("zoomend moveend", () => {
        scheduleBasemapRefresh(80);
        renderGeoOverlay();
    });
    window.addEventListener("resize", () => {
        scheduleBasemapRefresh(120);
        window.setTimeout(renderGeoOverlay, 120);
    });
}

function setupMessageComposer() {
    const textarea = document.getElementById("alertText");
    const charCount = document.getElementById("charCount");

    function setText(lang) {
        textarea.value = MESSAGES[lang];
        updateCount();
    }

    function updateCount() {
        charCount.textContent = `${textarea.value.length} chars`;
    }

    document.querySelectorAll(".tab").forEach((button) => {
        button.addEventListener("click", () => {
            document
                .querySelectorAll(".tab")
                .forEach((tab) => tab.classList.remove("active"));
            button.classList.add("active");
            setText(button.dataset.lang);
        });
    });

    textarea.addEventListener("input", updateCount);
    setText("en");
}

function setupReleaseActions() {
    const state = document.getElementById("releaseState");
    const approve = document.getElementById("approveButton");
    const revise = document.getElementById("reviseButton");

    approve.addEventListener("click", () => {
        state.textContent =
            "Approved in simulation. A real system would now require authenticated county authority and CAP/WEA gateway confirmation.";
        approve.textContent = "Release Approved";
        approve.disabled = true;
    });

    revise.addEventListener("click", () => {
        state.textContent =
            "Revision mode: warning area expanded toward canyon communities. Review the yellow polygons before approval.";
        const warningLayer = layers.evacuation.getLayers()[0];
        if (warningLayer) {
            warningLayer.eachLayer((layer) => {
                const props = layer.feature?.properties || {};
                if (props.status === "Evacuation Warning") {
                    layer.setStyle({ fillOpacity: 0.38, weight: 3 });
                    layer.openPopup();
                }
            });
        }
    });
}

async function boot() {
    setupControls();
    setupMessageComposer();
    setupReleaseActions();
    refreshBasemap();
    drawEvacuationAreas();
    renderGeoOverlay();

    const updates = [
        loadPerimeter().catch(() => {
            document.getElementById("perimeterStatus").textContent = "Fallback";
            perimeterData = fallbackPerimeter;
            L.geoJSON(fallbackPerimeter, {
                pane: "perimeterPane",
                style: {
                    color: "#7f2f25",
                    fillColor: "#7f2f25",
                    fillOpacity: 0.28,
                    weight: 4,
                },
                onEachFeature: (_, layer) => addBounds(layer),
            }).addTo(layers.perimeter);
            renderGeoOverlay();
        }),
        loadRoadClosures().catch(() => {
            document.getElementById("closureCount").textContent =
                fallbackRoadClosures.features.length.toString();
            roadClosureData = fallbackRoadClosures;
            L.geoJSON(fallbackRoadClosures, {
                pointToLayer: (feature, latlng) =>
                    L.marker(latlng, { icon: closureIcon(), pane: "closurePane" }),
                onEachFeature: (_, layer) => addBounds(layer),
            }).addTo(layers.closures);
            renderGeoOverlay();
        }),
        loadCareSites(),
    ];

    await Promise.allSettled(updates);
    fitAll();
    window.setTimeout(fitAll, 500);
    window.setTimeout(refreshBasemap, 900);
    window.setTimeout(renderGeoOverlay, 950);

    document.getElementById("lastUpdated").textContent =
        "Sources: LA County January 2025 wildfire context, ArcGIS public services, and a land-constrained Santa Monica Mountains WUI planning overlay.";
}

boot();
