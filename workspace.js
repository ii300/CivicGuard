/* Private draft storage. Session cookies are HttpOnly; no credentials in localStorage. */
(function () {
    "use strict";
    const save = document.getElementById("saveDraftButton");
    if (!save) return;

    const title = document.getElementById("draftTitle");
    const select = document.getElementById("savedDraftSelect");
    const open = document.getElementById("openDraftButton");
    const remove = document.getElementById("deleteDraftButton");
    const fresh = document.getElementById("newDraftButton");
    const refresh = document.getElementById("refreshDraftsButton");
    const saveCopy = document.getElementById("saveCopyButton");
    const exportDraft = document.getElementById("exportDraftButton");
    const status = document.getElementById("saveStatus");
    let currentId = null;
    let currentVersion = null;
    let busy = false;
    let dirty = false;

    function snapshot() {
        return { title: title.value.trim(), ...CivicGuard.composer.snapshot() };
    }
    let savedSnapshot = JSON.stringify(snapshot());

    function updateControls() {
        [save, saveCopy, fresh, refresh, select].forEach((control) => { control.disabled = busy; });
        open.disabled = remove.disabled = busy || !select.value;
        save.textContent = currentId ? "Save changes" : "Save draft";
    }

    function markChanges() {
        dirty = JSON.stringify(snapshot()) !== savedSnapshot;
        if (dirty && !busy) status.textContent = "Unsaved changes. Save to keep your work.";
    }

    async function api(url, options = {}) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(url, {
                credentials: "same-origin",
                ...options,
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": document.querySelector('meta[name="csrf-token"]').content,
                },
            });
            if (response.status === 204) return null;
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Your request could not be completed.");
            return data;
        } catch (error) {
            if (error.name === "AbortError") {
                throw new Error("Request timed out. Your edits are still here. Refresh the saved list before retrying.");
            }
            if (error instanceof SyntaxError) throw new Error("The server returned an unexpected response. Your edits are still here.");
            throw error;
        } finally {
            window.clearTimeout(timeout);
        }
    }

    async function loadList(preferredId = currentId) {
        const { drafts } = await api("/api/drafts");
        select.replaceChildren(new Option(drafts.length ? "Choose a saved draft" : "No saved drafts yet", ""));
        drafts.forEach((draft) => {
            const date = new Date(draft.updated_at).toLocaleDateString();
            // Option text is always text, including user-provided draft titles.
            select.add(new Option(`${draft.title} · ${date}`, String(draft.id)));
        });
        select.value = preferredId == null ? "" : String(preferredId);
        updateControls();
    }

    async function run(action) {
        if (busy) return;
        busy = true;
        updateControls();
        try {
            await action();
        } catch (error) {
            status.textContent = error instanceof TypeError
                ? "Connection failed. Your edits are still here; try again."
                : error.message;
        } finally {
            busy = false;
            updateControls();
        }
    }

    function saveCurrent(asNew = false) { return run(async () => {
        const payload = snapshot();
        if (!payload.title) throw new Error("Enter a draft title before saving.");
        status.textContent = "Saving…";
        const update = currentId && !asNew;
        const { draft } = await api(update ? `/api/drafts/${currentId}` : "/api/drafts", {
            method: update ? "PUT" : "POST", body: JSON.stringify({ ...payload, version: currentVersion }),
        });
        currentId = draft.id;
        currentVersion = draft.version;
        savedSnapshot = JSON.stringify(payload);
        dirty = JSON.stringify(snapshot()) !== savedSnapshot;
        status.textContent = dirty ? "Saved. You have newer edits to save." : "Saved to your account.";
        try {
            await loadList();
        } catch {
            status.textContent += " The saved list could not refresh; use Refresh list.";
        }
    }); }
    save.addEventListener("click", () => saveCurrent());
    saveCopy.addEventListener("click", () => saveCurrent(true));
    exportDraft.addEventListener("click", () => {
        const blob = new Blob([JSON.stringify({ ...snapshot(), simulation: true }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "civicguard-simulation-draft.json";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = "Exported a copy to this device. Your account save status is unchanged.";
    });

    open.addEventListener("click", () => run(async () => {
        if (dirty && !window.confirm("Open this draft and discard your unsaved edits?")) return;
        const openingSnapshot = JSON.stringify(snapshot());
        status.textContent = "Opening…";
        const { draft } = await api(`/api/drafts/${select.value}`);
        if (JSON.stringify(snapshot()) !== openingSnapshot &&
            !window.confirm("You edited while this draft was loading. Discard those new edits and open it?")) {
            status.textContent = "Kept your unsaved edits.";
            return;
        }
        title.value = draft.title;
        currentId = draft.id;
        currentVersion = draft.version;
        CivicGuard.composer.load(draft);
        savedSnapshot = JSON.stringify(snapshot());
        dirty = false;
        status.textContent = "Draft opened. Simulation approval must be reviewed again.";
    }));

    remove.addEventListener("click", () => run(async () => {
        if (!window.confirm("Delete this saved draft from your account? This cannot be undone.")) return;
        const deletedId = Number(select.value);
        await api(`/api/drafts/${deletedId}`, { method: "DELETE" });
        if (deletedId === currentId) {
            currentId = null;
            currentVersion = null;
            dirty = true;
        }
        status.textContent = "Saved draft deleted. Text in the editor is unchanged.";
        await loadList();
    }));

    fresh.addEventListener("click", () => {
        if (dirty && !window.confirm("Start a new draft and discard your unsaved edits?")) return;
        currentId = null;
        currentVersion = null;
        title.value = "Palisades simulation";
        CivicGuard.composer.load();
        savedSnapshot = JSON.stringify(snapshot());
        dirty = false;
        select.value = "";
        status.textContent = "New draft. Save it when you are ready.";
        updateControls();
    });

    refresh.addEventListener("click", () => run(async () => {
        await loadList();
        status.textContent = dirty ? "List refreshed. You have unsaved edits." : "Saved list refreshed.";
    }));
    select.addEventListener("change", updateControls);
    title.addEventListener("input", markChanges);
    document.addEventListener("composerchange", markChanges);
    window.addEventListener("beforeunload", (event) => {
        if (!dirty) return;
        event.preventDefault();
        event.returnValue = "";
    });
    run(() => loadList());
})();
