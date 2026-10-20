const PACKAGED_EXERCISE = document.querySelector('meta[name="civicguard-distribution"]')?.content === "packaged";

const SOURCES = {
    palisadesPerimeter:
        "https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/Eaton_and_Palisades_Dissolved_Fire_Perimeters/FeatureServer/0/query?where=FireName%3D%27Palisades%20Fire%27&outFields=*&returnGeometry=true&f=geojson&outSR=4326",
    roadClosures:
        "https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Road_Closures_Feb2025_Activation_view/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson&outSR=4326",
    massCare:
        "https://services7.arcgis.com/DSSF7DFVxfZsz379/arcgis/rest/services/City_of_LA_Mass_Care_Locations/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson&outSR=4326",
};

const MESSAGES = {
    en: "SIMULATION DRAFT: In this exercise, residents in the red scenario zone prepare to evacuate. Follow verified local authority instructions for evacuation boundaries, routes, and shelter locations. Include people, pets, medications, documents, and phones in your plan.",
    es: "BORRADOR DE SIMULACIÓN: En este ejercicio, los residentes de la zona roja se preparan para evacuar. Siga las instrucciones verificadas de las autoridades locales sobre zonas, rutas y refugios. Incluya personas, mascotas, medicamentos, documentos y teléfonos en su plan.",
    zh: "模拟草稿：在本次演练中，红色示意区域的居民准备疏散。疏散范围、路线和安置地点须以当地主管部门核实发布的信息为准。请在演练计划中考虑人员、宠物、药物、证件和手机。",
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
            Road_Closure: "Exercise checkpoint A",
            Type_Of_Closure: "Illustrative checkpoint",
            Date_Of_Closure: "01/08/2025",
            Directions: "Fictional exercise point; no real access or route information",
        }),
        pointFeature([-118.595, 34.091], {
            Road_Closure: "Exercise checkpoint B",
            Type_Of_Closure: "Illustrative checkpoint",
            Date_Of_Closure: "01/08/2025",
            Directions: "Fictional exercise point; no real access or route information",
        }),
        pointFeature([-118.492, 34.088], {
            Road_Closure: "Exercise checkpoint C",
            Type_Of_Closure: "Illustrative checkpoint",
            Date_Of_Closure: "01/08/2025",
            Directions: "Fictional exercise point; no real access or route information",
        }),
        pointFeature([-118.606, 34.128], {
            Road_Closure: "Exercise checkpoint D",
            Type_Of_Closure: "Illustrative checkpoint",
            Date_Of_Closure: "01/08/2025",
            Directions: "Fictional exercise point; no real access or route information",
        }),
        pointFeature([-118.475, 34.128], {
            Road_Closure: "Exercise checkpoint E",
            Type_Of_Closure: "Illustrative checkpoint",
            Date_Of_Closure: "01/08/2025",
            Directions: "Fictional exercise point; no real access or route information",
        }),
    ],
};

const fallbackCare = {
    type: "FeatureCollection",
    features: [
        pointFeature([-118.4455, 34.0701], {
            NAME: "Exercise care site A",
            ADDRESS: "Fictional exercise location",
            STATUS: "Practice only; not an operating shelter",
        }),
        pointFeature([-118.5764, 34.1848], {
            NAME: "Exercise care site B",
            ADDRESS: "Fictional exercise location",
            STATUS: "Practice only; not an operating shelter",
        }),
        pointFeature([-118.6217, 34.1714], {
            NAME: "Exercise care site C",
            ADDRESS: "Fictional exercise location",
            STATUS: "Practice only; not an operating shelter",
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

async function setupMap() {
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

    if (!PACKAGED_EXERCISE) map.attributionControl.addAttribution(
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
        if (PACKAGED_EXERCISE) {
            document.getElementById("basemapStatus").textContent = "Offline exercise map";
            return;
        }
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
            document.getElementById("basemapStatus").textContent = "Basemap loaded";
            if (previousOverlay) {
                map.removeLayer(previousOverlay);
            }
        });

        nextOverlay.once("error", () => {
            if (requestId === basemapRequestId) {
                document.getElementById("basemapStatus").textContent = basemapOverlay ? "Basemap refresh failed; showing previous image" : "Basemap unavailable; scenario layers only";
            }
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
            .map(([label, value]) => `<dt>${CivicGuard.escapeHtml(label)}</dt><dd>${CivicGuard.escapeHtml(value)}</dd>`)
            .join("");
        return `<div class="popup"><strong>${CivicGuard.escapeHtml(title)}</strong><dl>${safeRows}</dl></div>`;
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
                        ["Note", "Illustrative simulation zone, not an official evacuation boundary."],
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
                keyboard: false,
                icon: zoneLabelIcon(props.status),
            }).addTo(layers.evacuation);
        });

        return geo;
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

    function reportSource(key, result, count) {
        const label = result.provenance === "sample" ? "Sample" : "Remote";
        document.getElementById(`${key}Source`).textContent =
            `${label} · ${count} records. ${result.detail}.`;
        if (key === "perimeter") {
            document.getElementById("perimeterStatus").textContent = `${label} · ${count} records`;
        }
        if (key === "road") {
            document.getElementById("roadStatus").textContent = `${label} · ${count} records`;
            document.getElementById("closureCount").textContent = `${count} (${label.toLowerCase()})`;
        }
    }

    async function loadExerciseSource(url, fallback, geometries) {
        if (PACKAGED_EXERCISE) return {
            data: fallback, provenance: "sample",
            detail: "Built-in exercise data; not real incident information",
        };
        return CivicGuard.loadSource(url, fallback, geometries);
    }

    async function loadPerimeter() {
        const result = await loadExerciseSource(SOURCES.palisadesPerimeter, fallbackPerimeter, ["Polygon", "MultiPolygon"]);
        layers.perimeter.clearLayers();
        L.geoJSON(result.data, {
            pane: "perimeterPane",
            style: { color: "#7f2f25", fillColor: "#7f2f25", fillOpacity: 0.28, weight: 4 },
            onEachFeature: (feature, layer) => {
                const props = feature.properties || {};
                layer.bindPopup(popupTable(props.name || "Palisades Fire perimeter", [
                    ["Fire", props.FireName],
                    ["Type", props.type],
                    ["Source", result.provenance === "sample" ? "Illustrative sample geometry" : "Public perimeter service; currency unverified"],
                ]));
                addBounds(layer);
            },
        }).addTo(layers.perimeter);
        reportSource("perimeter", result, result.data.features.length);
    }

    async function loadRoadClosures() {
        const result = await loadExerciseSource(SOURCES.roadClosures, fallbackRoadClosures, ["Point"]);
        const data = { ...result.data, features: result.data.features.filter((feature) => pointInsideScenario(feature.geometry.coordinates)) };
        layers.closures.clearLayers();
        L.geoJSON(data, {
            pointToLayer: (feature, latlng) => L.marker(latlng, { icon: closureIcon(), pane: "closurePane", title: String(feature.properties?.Road_Closure || "Road closure") }),
            onEachFeature: (feature, layer) => {
                const props = feature.properties || {};
                layer.bindPopup(popupTable(props.Road_Closure || "Road closure", [
                    ["Type", props.Type_Of_Closure],
                    ["Date", props.Date_Of_Closure],
                    ["Directions", props.Directions],
                    ["Source", result.provenance === "sample" ? "Illustrative sample" : "Public service; currency unverified"],
                ]));
                addBounds(layer);
            },
        }).addTo(layers.closures);
        reportSource("road", result, data.features.length);
    }

    async function loadCareSites() {
        const result = await loadExerciseSource(SOURCES.massCare, fallbackCare, ["Point"]);
        const data = { ...result.data, features: result.data.features.filter((feature) => pointInsideScenario(feature.geometry.coordinates)) };
        layers.care.clearLayers();
        L.geoJSON(data, {
            pointToLayer: (feature, latlng) => L.marker(latlng, { icon: careIcon(), pane: "carePane", title: String(feature.properties?.NAME || feature.properties?.Name || "Mass care site") }),
            onEachFeature: (feature, layer) => {
                const props = feature.properties || {};
                layer.bindPopup(popupTable(props.NAME || props.Name || "Mass care site", [
                    ["Address", props.ADDRESS || props.Address],
                    ["Status", props.STATUS || props.Status || "Not supplied"],
                    ["Source", result.provenance === "sample" ? "Illustrative sample" : "Public service; currency unverified"],
                ]));
                addBounds(layer);
            },
        }).addTo(layers.care);
        reportSource("care", result, data.features.length);
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
            });
        });

        document.getElementById("fitAllButton").addEventListener("click", fitAll);
        map.on("zoomend moveend", () => {
            scheduleBasemapRefresh(80);
        });
        window.addEventListener("resize", () => {
            scheduleBasemapRefresh(120);
        });
    }

    setupControls();
    refreshBasemap();
    drawEvacuationAreas();
    const results = await Promise.allSettled([loadPerimeter(), loadRoadClosures(), loadCareSites()]);
    fitAll();
    document.getElementById("lastUpdated").textContent = results.some((result) => result.status === "rejected")
        ? "Some map layers could not be rendered. Review source status before continuing."
        : PACKAGED_EXERCISE ? "Offline exercise ready. All map layers are illustrative. Not for emergency use."
            : "Source requests completed. Remote data may be historical; sample data is illustrative. No live incident status is verified.";
    document.getElementById("sourceSummary").textContent = PACKAGED_EXERCISE ? "Built-in / offline" : "Mixed / see below";
}

async function setupMessageComposer() {
    const textarea = document.getElementById("alertText");
    const charCount = document.getElementById("charCount");
    const state = document.getElementById("releaseState");
    const approve = document.getElementById("approveButton");
    const authority = document.getElementById("approvalStatus");
    const tabs = [...document.querySelectorAll(".tab")];
    const channels = [...document.querySelectorAll(".channel")];
    const saveStatus = document.getElementById("draftSaveStatus");
    const reset = document.getElementById("resetDraftsButton");
    const confirmation = document.getElementById("resetDraftsConfirm");
    const confirmReset = document.getElementById("confirmResetDraftsButton");
    const cancelReset = document.getElementById("cancelResetDraftsButton");
    const revise = document.getElementById("reviseButton");
    const share = document.getElementById("shareExerciseButton");
    const shareStatus = document.getElementById("shareStatus");
    const defaultChannels = channels.filter((button) => button.getAttribute("aria-pressed") === "true")
        .map((button) => button.textContent.trim());
    const drafts = { ...MESSAGES };
    let language = "en";
    let approved = false;
    let busy = true;
    let saveRevision = 0;
    let preserveUnreadDrafts = false;
    let store;

    function setSaveStatus(status, message) {
        saveStatus.dataset.state = status;
        saveStatus.textContent = message;
    }

    function setBusy(value) {
        busy = value;
        [textarea, ...tabs, ...channels, reset, revise, share, confirmReset, cancelReset].forEach((control) => {
            control.disabled = value;
        });
        updateState();
    }

    function snapshot() {
        return {
            drafts: { ...drafts }, language,
            channels: channels.filter((button) => button.getAttribute("aria-pressed") === "true")
                .map((button) => button.textContent.trim()),
        };
    }

    function renderLanguage() {
        textarea.value = drafts[language];
        textarea.lang = language;
        tabs.forEach((tab) => {
            const selected = tab.dataset.lang === language;
            tab.classList.toggle("active", selected);
            tab.setAttribute("aria-selected", String(selected));
            tab.tabIndex = selected ? 0 : -1;
            if (selected) document.getElementById("messagePanel").setAttribute("aria-labelledby", tab.id);
        });
    }

    function restore(snapshot) {
        Object.assign(drafts, snapshot.drafts);
        language = snapshot.language;
        channels.forEach((button) => {
            const active = snapshot.channels.includes(button.textContent.trim());
            button.setAttribute("aria-pressed", String(active));
            button.classList.toggle("active", active);
        });
        approved = false;
        renderLanguage();
    }

    async function saveDrafts() {
        const revision = ++saveRevision;
        if (!store) {
            setSaveStatus("error", "Autosave is unavailable. Keep this window open to retain your edits.");
            return;
        }
        setSaveStatus("saving", "Saving… wait before closing.");
        const result = await store.save(snapshot());
        if (revision !== saveRevision) return;
        if (result.status === "saved") setSaveStatus("saved", "Saved on this device.");
        else if (result.status === "invalid") setSaveStatus("error", "Could not save: drafts exceed the per-language or total storage limit. Shorten the text and try again.");
        else setSaveStatus("error", "Could not save on this device. Keep this window open to retain your edits; editing again will retry.");
    }

    function updateState(reason) {
        if (reason) approved = false;
        const hasText = Boolean(textarea.value.trim());
        const hasChannel = channels.some((button) => button.getAttribute("aria-pressed") === "true");
        charCount.textContent = `${Array.from(textarea.value).length} chars`;
        approve.disabled = busy || approved || !hasText || !hasChannel;
        approve.textContent = approved ? "Simulation Approved" : "Approve Simulation";
        authority.textContent = approved ? "Approved in simulation" : "Pending simulation review";
        state.textContent = !hasText ? "Enter alert text before approving the simulation."
            : !hasChannel ? "Select at least one simulated channel."
            : approved ? "Approved in simulation. No public alerts have been sent."
            : reason || "Simulation only. Review each language draft separately; no public alerts are sent.";
    }

    function selectLanguage(button) {
        if (busy) return;
        const nextLanguage = button.dataset.lang;
        if (nextLanguage === language) return;
        drafts[language] = textarea.value;
        language = nextLanguage;
        renderLanguage();
        updateState("Language changed. Review this draft before approving the simulation.");
        if (!preserveUnreadDrafts) void saveDrafts();
    }

    tabs.forEach((button, index) => {
        button.addEventListener("click", () => selectLanguage(button));
        button.addEventListener("keydown", (event) => {
            let next;
            if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
            if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = tabs.length - 1;
            if (next === undefined) return;
            event.preventDefault();
            tabs[next].focus();
            selectLanguage(tabs[next]);
        });
    });

    textarea.addEventListener("input", () => {
        if (busy) return;
        drafts[language] = textarea.value;
        preserveUnreadDrafts = false;
        updateState("Draft changed. Review again before approving the simulation.");
        void saveDrafts();
    });
    channels.forEach((button) => button.addEventListener("click", () => {
        if (busy) return;
        const active = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", String(active));
        button.classList.toggle("active", active);
        preserveUnreadDrafts = false;
        updateState("Channels changed. Review again before approving the simulation.");
        void saveDrafts();
    }));
    approve.addEventListener("click", () => {
        if (approve.disabled) return;
        approved = true;
        updateState();
    });
    revise.addEventListener("click", () => {
        updateState("Review mode: edit the current language draft, then approve again.");
        textarea.focus();
    });
    let sharing = false;
    share.addEventListener("click", async () => {
        if (busy || sharing) return;
        sharing = true;
        share.disabled = true;
        try {
            // Capture the current state synchronously, while the user gesture is active.
            const text = CivicGuardExport.createSummary({ ...snapshot(), reviewed: approved });
            const result = await CivicGuardExport.shareSummary({ text });
            shareStatus.textContent = result.status === "shared" ? "Exercise summary shared using your chosen app."
                : result.status === "downloaded" ? "Exercise summary downloaded as a text file."
                    : result.status === "cancelled" ? "Sharing cancelled. Your drafts are unchanged."
                        : "Sharing is unavailable. Your drafts remain on this device; copy important text before uninstalling.";
        } catch {
            shareStatus.textContent = "Could not create the exercise summary. Keep each language under 20,000 characters and try again.";
        } finally {
            sharing = false;
            share.disabled = busy;
        }
    });
    function closeConfirmation() {
        confirmation.hidden = true;
        reset.setAttribute("aria-expanded", "false");
        reset.focus();
    }
    reset.addEventListener("click", () => {
        confirmation.hidden = false;
        reset.setAttribute("aria-expanded", "true");
        cancelReset.focus();
    });
    cancelReset.addEventListener("click", closeConfirmation);
    confirmation.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !busy) {
            event.preventDefault();
            closeConfirmation();
        }
    });
    confirmReset.addEventListener("click", async () => {
        ++saveRevision;
        setBusy(true);
        const result = store ? await store.clear() : { status: "unavailable" };
        if (result.status === "cleared") {
            preserveUnreadDrafts = false;
            restore({ drafts: { ...MESSAGES }, language: "en", channels: defaultChannels });
            setSaveStatus("empty", "Saved drafts cleared. New edits will save on this device.");
        } else {
            setSaveStatus("error", "Could not clear saved drafts. Your current edits are unchanged.");
        }
        setBusy(false);
        closeConfirmation();
    });

    // Keep the editor locked until restoration completes so a late read cannot
    // replace edits made while native storage is still loading.
    setBusy(true);
    let loaded = { status: "unavailable" };
    try {
        store = CivicGuardDraftStore.createStore(CivicGuardPlatform.createStorageBackend());
        loaded = await store.load();
    } catch {
        // A missing or denied storage backend must not disable the composer.
    }
    preserveUnreadDrafts = loaded.status === "invalid" || loaded.status === "unavailable";
    if (loaded.status === "restored") {
        restore(loaded.snapshot);
        setSaveStatus("saved", "Drafts restored from this device. Review before approving.");
    } else {
        renderLanguage();
        if (loaded.status === "empty") setSaveStatus("empty", "Drafts save on this device as you edit.");
        else if (loaded.status === "invalid") setSaveStatus("error", "Saved drafts could not be read. Original scenario text is shown; new edits will replace the saved copy.");
        else setSaveStatus("error", "Autosave is unavailable. Keep this window open to retain your edits.");
    }
    setBusy(false);
}

setupMessageComposer();
if (typeof L === "undefined") {
    document.getElementById("lastUpdated").textContent = "Map library unavailable. Reload to retry; the message composer remains available.";
    ["perimeterStatus", "roadStatus", "closureCount", "perimeterSource", "roadSource", "careSource", "basemapStatus"].forEach((id) => {
        document.getElementById(id).textContent = "Unavailable — map library failed to load";
    });
    document.getElementById("fitAllButton").disabled = true;
    document.querySelectorAll("[data-layer]").forEach((input) => { input.disabled = true; });
} else {
    setupMap().catch(() => {
        document.getElementById("lastUpdated").textContent = "Map initialization failed. Reload to retry; the message composer remains available.";
    });
}
