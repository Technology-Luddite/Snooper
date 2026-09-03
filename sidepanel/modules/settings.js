/********************************************************************
 * Settings — JSON preset editor + privacy toggles
 ********************************************************************/

const SettingsModule = (() => {

    let lastStatus = null;

    let selectedFile = "screenProfiles.json";
    let editingIndex = null;
    let editingFontPlatform = null;

    function esc(s) {
        return String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function jsonRowActions(kind, key) {
        if (kind === "font") {
            return `
                <button type="button" class="btn-sm" data-json-action="edit-font" data-json-key="${esc(key)}">Edit</button>
                <button type="button" class="btn-sm danger" data-json-action="delete-font" data-json-key="${esc(key)}">Delete</button>`;
        }
        return `
            <button type="button" class="btn-sm" data-json-action="edit" data-json-index="${key}">Edit</button>
            <button type="button" class="btn-sm danger" data-json-action="delete" data-json-index="${key}">Delete</button>`;
    }

    function renderStatus() {
        if (!lastStatus) return "";
        const cls = lastStatus.ok ? "status ok" : "status err";
        const detail = lastStatus.errors?.length
            ? `<ul class="list-plain">${lastStatus.errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul>`
            : "";
        return `<div class="${cls}">${esc(lastStatus.message)}${detail}</div>`;
    }

    function fieldId(key) {
        return `json-field-${key.replace(/\./g, "-")}`;
    }

    function renderField(field, value) {
        const id = fieldId(field.key);
        const val = JsonConfigStore.formatFieldValue(field, value);

        if (field.type === "boolean") {
            return `
                <label class="checkbox-inline" for="${id}">
                    <input type="checkbox" id="${id}" ${value ? "checked" : ""}> ${esc(field.label)}
                </label>`;
        }
        if (field.type === "multiline" || field.type === "multilineStrings") {
            return `
                <div class="field-group">
                    <label class="field-label" for="${id}">${esc(field.label)}</label>
                    <textarea id="${id}" class="input json-field-textarea">${esc(val)}</textarea>
                </div>`;
        }
        if (field.type === "enum") {
            return `
                <div class="field-group">
                    <label class="field-label" for="${id}">${esc(field.label)}</label>
                    <select id="${id}" class="select">
                        ${field.options.map(o => `<option value="${esc(o)}" ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}
                    </select>
                </div>`;
        }
        const inputType = field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "integer" || field.type === "number" ? "number" : "text";
        return `
            <div class="field-group">
                <label class="field-label" for="${id}">${esc(field.label)}</label>
                <input type="${inputType}" id="${id}" class="input" value="${esc(val)}"
                    ${field.min != null ? `min="${field.min}"` : ""} ${field.max != null ? `max="${field.max}"` : ""}>
            </div>`;
    }

    function renderRecordForm(schema, record) {
        const flat = schema.flattenRecord ? schema.flattenRecord(record) : record;
        return schema.fields.map(f => renderField(f, flat[f.key])).join("");
    }

    async function renderJsonEditor() {
        const schema = JsonConfigStore.getSchema(selectedFile);
        const data = await JsonConfigStore.load(selectedFile);
        const overridden = await JsonConfigStore.hasOverride(selectedFile);
        const files = JsonConfigStore.listEditableFiles();

        const fileOptions = files.map(f => {
            const sel = f.id === selectedFile ? "selected" : "";
            return `<option value="${esc(f.id)}" ${sel}>${esc(f.title)} (${esc(f.id)})</option>`;
        }).join("");

        let recordsPanel = "";
        let editPanel = "";

        if (schema?.kind === "records") {
            const rows = (Array.isArray(data) ? data : []).map((rec, i) => `
                <tr>
                    <td>${esc(JsonConfigStore.recordSummary(selectedFile, rec))}</td>
                    <td class="json-actions">${jsonRowActions("record", i)}</td>
                </tr>`).join("");

            recordsPanel = `
                <table class="json-table">
                    <thead><tr><th>Record</th><th>Actions</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="2" class="text-dim">No records yet.</td></tr>`}</tbody>
                </table>
                <button id="settings-json-add" type="button" class="mt-sm">+ Add record</button>`;

            if (editingIndex !== null) {
                const rec = editingIndex >= 0 ? data[editingIndex] : {};
                const flat = schema.flattenRecord ? schema.flattenRecord(rec) : rec;
                const defaults = {};
                schema.fields.forEach(f => { defaults[f.key] = flat[f.key]; });
                editPanel = `
                    <div class="panel panel-warn mt-sm json-edit-form">
                        <h3>${editingIndex >= 0 ? "Edit record" : "New record"}</h3>
                        ${renderRecordForm(schema, defaults)}
                        <div class="row mt-sm">
                            <button id="settings-json-save-record" type="button" class="success">Save record</button>
                            <button id="settings-json-cancel-edit" type="button">Cancel</button>
                        </div>
                    </div>`;
            }
        } else if (schema?.kind === "stringList") {
            const label = schema.itemLabel || "Value";
            const rows = (Array.isArray(data) ? data : []).map((item, i) => `
                <tr>
                    <td class="text-mono">${esc(item)}</td>
                    <td class="json-actions">${jsonRowActions("record", i)}</td>
                </tr>`).join("");

            recordsPanel = `
                <table class="json-table">
                    <thead><tr><th>${esc(label)}</th><th>Actions</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="2" class="text-dim">No entries yet.</td></tr>`}</tbody>
                </table>
                <button id="settings-json-add" type="button" class="mt-sm">+ Add ${esc(label.toLowerCase())}</button>`;

            if (editingIndex !== null) {
                const val = editingIndex >= 0 ? data[editingIndex] : "";
                editPanel = `
                    <div class="panel panel-warn mt-sm json-edit-form">
                        <h3>${editingIndex >= 0 ? "Edit entry" : "New entry"}</h3>
                        <div class="field-group">
                            <label class="field-label" for="json-string-value">${esc(label)}</label>
                            <input type="text" id="json-string-value" class="input" value="${esc(val)}">
                        </div>
                        <div class="row mt-sm">
                            <button id="settings-json-save-string" type="button" class="success">Save</button>
                            <button id="settings-json-cancel-edit" type="button">Cancel</button>
                        </div>
                    </div>`;
            }
        } else if (schema?.kind === "fontMap") {
            const entries = Object.entries(typeof data === "object" && data ? data : {});
            const rows = entries.map(([platform, fonts]) => `
                <tr>
                    <td><strong>${esc(platform)}</strong></td>
                    <td class="text-dim">${fonts.length} font(s)</td>
                    <td class="json-actions">${jsonRowActions("font", platform)}</td>
                </tr>`).join("");

            recordsPanel = `
                <table class="json-table">
                    <thead><tr><th>Platform</th><th>Count</th><th>Actions</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="3" class="text-dim">No platforms yet.</td></tr>`}</tbody>
                </table>
                <button id="settings-json-add-font" type="button" class="mt-sm">+ Add platform</button>`;

            if (editingFontPlatform !== null) {
                const fonts = editingFontPlatform ? (data[editingFontPlatform] || []) : [];
                editPanel = `
                    <div class="panel panel-warn mt-sm json-edit-form">
                        <h3>${editingFontPlatform ? `Edit ${esc(editingFontPlatform)}` : "New platform"}</h3>
                        <div class="field-group">
                            <label class="field-label" for="json-font-platform">Platform key</label>
                            <input type="text" id="json-font-platform" class="input" value="${esc(editingFontPlatform === "" ? "" : editingFontPlatform || "")}"
                                ${editingFontPlatform ? `data-original-platform="${esc(editingFontPlatform)}"` : ""}>
                        </div>
                        <div class="field-group">
                            <label class="field-label" for="json-font-list">Fonts (one per line)</label>
                            <textarea id="json-font-list" class="input json-field-textarea">${esc(fonts.join("\n"))}</textarea>
                        </div>
                        <div class="row mt-sm">
                            <button id="settings-json-save-font" type="button" class="success">Save platform</button>
                            <button id="settings-json-cancel-edit" type="button">Cancel</button>
                        </div>
                    </div>`;
            }
        } else if (schema?.kind === "object") {
            recordsPanel = `<p class="text-sm text-dim">Single config object — edit fields below and save.</p>`;
            editPanel = `
                <div class="panel panel-warn json-edit-form">
                    ${schema.fields.map(f => renderField(f, data?.[f.key])).join("")}
                    <div class="row mt-sm">
                        <button id="settings-json-save-object" type="button" class="success">Save about info</button>
                    </div>
                </div>`;
        }

        return `
            <div class="panel panel-info">
                <h3>JSON preset files</h3>
                <p class="text-sm text-dim">Select a bundled JSON file, then add / edit / delete validated records. Changes are saved to extension storage and used immediately.</p>
                <div class="field-group">
                    <label class="field-label" for="settings-json-file">Config file</label>
                    <select id="settings-json-file" class="select">${fileOptions}</select>
                </div>
                <div class="row mb-sm">
                    <span class="text-sm ${overridden ? "text-warn" : "text-dim"}">
                        ${overridden ? "● Customized (override active)" : "○ Using bundled defaults"}
                    </span>
                    <button id="settings-json-reset-file" type="button" class="danger">Reset to bundled</button>
                </div>
                ${recordsPanel}
                ${editPanel}
            </div>`;
    }

    async function renderBackupPanel() {
        return `
            <div class="panel panel-info mt-sm">
                <h3>Backup &amp; restore</h3>
                <p class="text-sm text-dim">
                    Export all profiles, settings, cookie rules, JSON preset overrides, and custom network blocks
                    to a signed file. The signature prevents casual editing — invalid or tampered files are rejected on import.
                </p>
                <div class="row mt-sm">
                    <button type="button" id="settings-export-backup" class="success">Export signed backup</button>
                    <button type="button" id="settings-import-backup-btn">Import backup…</button>
                    <input type="file" id="settings-import-backup-file" accept=".json,.snooper-backup.json,application/json" hidden>
                </div>
                <p class="notice text-xs">Use on another browser with Snooper installed. Does not include About page text (fixed per extension).</p>
            </div>`;
    }

    async function render() {
        const settings = await SettingsStore.get();
        const jsonEditor = await renderJsonEditor();
        const backupPanel = await renderBackupPanel();

        return `
            <h2>⚙️ Settings</h2>
            ${renderStatus()}
            ${backupPanel}
            ${jsonEditor}

            <div class="panel panel-info mt-sm">
                <h3>Network privacy (DNR)</h3>
                <label class="checkbox-inline">
                    <input type="checkbox" id="settings-strip-referrer" ${settings.stripReferrer ? "checked" : ""}>
                    Strip Referer header on outgoing requests
                </label>
                <label class="checkbox-inline">
                    <input type="checkbox" id="settings-block-trackers" ${settings.blockTrackers ? "checked" : ""}>
                    Block known tracker domains (edit list in <code>trackers.json</code> above).
                    Custom per-domain blocks are managed in the <strong>Network</strong> tab.
                </label>
            </div>

            <div class="panel panel-error mt-sm">
                <h3>Reset extension data</h3>
                <p class="text-sm text-dim">Clears saved profiles and settings — not JSON preset overrides.</p>
                <button id="settings-reset" type="button" class="danger">Reset profiles &amp; settings</button>
            </div>`;
    }

    async function applyPrivacyToggles(partial) {
        const next = await SettingsStore.set(partial);
        await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "SET_SETTINGS", settings: next }, resolve);
        });
    }

    async function rerender() {
        if (typeof window.render === "function") await window.render("settings");
    }

    async function handleJsonAction(action, event) {
        const btn = event.target?.closest?.("[data-json-action]");
        const index = btn?.dataset?.jsonIndex != null ? parseInt(btn.dataset.jsonIndex, 10) : null;
        const key = btn?.dataset?.jsonKey ?? null;

        // #region agent log
        fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
            body: JSON.stringify({
                sessionId: "6573a3",
                location: "settings.js:handleJsonAction",
                message: "JSON preset action",
                data: { action, index, key, file: selectedFile },
                timestamp: Date.now(),
                hypothesisId: "JSON-CRUD-FIX",
                runId: "v3.6.4"
            })
        }).catch(() => {});
        // #endregion

        if (action === "edit") {
            editingIndex = index;
            editingFontPlatform = null;
            await rerender();
            return;
        }
        if (action === "delete") {
            if (!confirm("Delete this record?")) return;
            const result = await JsonConfigStore.deleteRecord(selectedFile, index);
            lastStatus = result.ok
                ? { ok: true, message: "Record deleted." }
                : { ok: false, message: "Delete failed", errors: result.errors };
            editingIndex = null;
            await rerender();
            return;
        }
        if (action === "edit-font") {
            editingFontPlatform = key;
            editingIndex = null;
            await rerender();
            return;
        }
        if (action === "delete-font") {
            if (!confirm(`Delete font list for "${key}"?`)) return;
            const result = await JsonConfigStore.deleteFontPlatform(selectedFile, key);
            lastStatus = result.ok
                ? { ok: true, message: "Platform deleted." }
                : { ok: false, message: "Delete failed", errors: result.errors };
            await rerender();
        }
    }

    async function handleAction(id, event) {
        try {
            const jsonBtn = event.target?.closest?.("[data-json-action]");
            if (jsonBtn?.dataset?.jsonAction) {
                await handleJsonAction(jsonBtn.dataset.jsonAction, event);
                return;
            }

            if (id === "settings-json-file") {
                selectedFile = event.target.value;
                if (typeof JsonConfigStore.isEditable === "function" && !JsonConfigStore.isEditable(selectedFile)) {
                    selectedFile = "screenProfiles.json";
                }
                editingIndex = null;
                editingFontPlatform = null;
                await rerender();
                return;
            }

            if (id === "settings-export-backup") {
                const bundle = await ConfigBundle.exportSignedBackup();
                ConfigBundle.downloadBackupFile(bundle);
                lastStatus = {
                    ok: true,
                    message: `Backup exported (${bundle.payload.profiles?.length || 0} profiles, signed).`
                };
                // #region agent log
                fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
                    body: JSON.stringify({
                        sessionId: "6573a3",
                        location: "settings.js:settings-export-backup",
                        message: "Signed backup exported",
                        data: { profileCount: bundle.payload.profiles?.length || 0 },
                        timestamp: Date.now(),
                        hypothesisId: "BACKUP",
                        runId: "v3.7.1"
                    })
                }).catch(() => {});
                // #endregion
                await rerender();
                return;
            }

            if (id === "settings-import-backup-btn") {
                document.getElementById("settings-import-backup-file")?.click();
                return;
            }

            if (id === "settings-import-backup-file") {
                const file = event.target?.files?.[0];
                if (!file) return;
                const text = await file.text();
                event.target.value = "";

                const parsed = await ConfigBundle.parseBackupText(text);
                if (!parsed.ok) {
                    lastStatus = { ok: false, message: "Import rejected", errors: parsed.errors };
                    await rerender();
                    return;
                }

                const s = parsed.summary;
                const msg = [
                    "Import this signed backup?",
                    `${s.profileCount} profile(s)`,
                    s.jsonOverrideCount ? `${s.jsonOverrideCount} JSON override file(s)` : null,
                    s.customBlockCount ? `${s.customBlockCount} custom block domain(s)` : null,
                    "Existing data will be merged (profiles replaced if IDs match)."
                ].filter(Boolean).join("\n");

                if (!confirm(msg)) return;

                const result = await ConfigBundle.applySignedImport(parsed.bundle, "merge");
                lastStatus = result.ok
                    ? { ok: true, message: `Backup imported (${result.summary?.profileCount || 0} profiles). Reload active tab if needed.` }
                    : { ok: false, message: "Import failed", errors: result.errors };
                // #region agent log
                fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
                    body: JSON.stringify({
                        sessionId: "6573a3",
                        location: "settings.js:settings-import-backup",
                        message: "Signed backup import",
                        data: { ok: result.ok, summary: result.summary },
                        timestamp: Date.now(),
                        hypothesisId: "BACKUP",
                        runId: "v3.7.1"
                    })
                }).catch(() => {});
                // #endregion
                await rerender();
                return;
            }

            switch (id) {
                case "settings-json-add":
                    editingIndex = -1;
                    editingFontPlatform = null;
                    await rerender();
                    return;
                case "settings-json-add-font":
                    editingFontPlatform = "";
                    editingIndex = null;
                    await rerender();
                    return;
                case "settings-json-cancel-edit":
                    editingIndex = null;
                    editingFontPlatform = null;
                    await rerender();
                    return;
                case "settings-json-save-record": {
                    const schema = JsonConfigStore.getSchema(selectedFile);
                    const data = await JsonConfigStore.load(selectedFile);
                    const list = Array.isArray(data) ? data : [];
                    const record = JsonConfigStore.buildRecordFromForm(schema);
                    const idx = editingIndex >= 0 ? editingIndex : null;
                    const errors = JsonConfigStore.validateFormRecord(schema, record, list, idx ?? -1);
                    if (errors.length) {
                        lastStatus = { ok: false, message: "Validation failed", errors };
                        break;
                    }
                    const result = await JsonConfigStore.upsertRecord(selectedFile, record, idx);
                    lastStatus = result.ok
                        ? { ok: true, message: "Record saved." }
                        : { ok: false, message: "Save failed", errors: result.errors };
                    if (result.ok) {
                        editingIndex = null;
                        // #region agent log
                        fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
                            body: JSON.stringify({
                                sessionId: "6573a3",
                                location: "settings.js:settings-json-save-record",
                                message: "JSON record saved",
                                data: { file: selectedFile, key: record[schema.keyField] },
                                timestamp: Date.now(),
                                hypothesisId: "JSON-CRUD",
                                runId: "v3.6.1"
                            })
                        }).catch(() => {});
                        // #endregion
                    }
                    break;
                }
                case "settings-json-save-string": {
                    const val = document.getElementById("json-string-value")?.value;
                    const idx = editingIndex >= 0 ? editingIndex : null;
                    const result = await JsonConfigStore.upsertStringListItem(selectedFile, val, idx);
                    lastStatus = result.ok
                        ? { ok: true, message: "Entry saved." }
                        : { ok: false, message: "Save failed", errors: result.errors };
                    if (result.ok) editingIndex = null;
                    break;
                }
                case "settings-json-save-font": {
                    const platformEl = document.getElementById("json-font-platform");
                    const platform = platformEl?.value;
                    const original = platformEl?.dataset?.originalPlatform || editingFontPlatform;
                    const fonts = document.getElementById("json-font-list")?.value;
                    const result = await JsonConfigStore.upsertFontPlatform(
                        selectedFile, platform, fonts, original || null
                    );
                    lastStatus = result.ok
                        ? { ok: true, message: "Font platform saved." }
                        : { ok: false, message: "Save failed", errors: result.errors };
                    if (result.ok) editingFontPlatform = null;
                    break;
                }
                case "settings-json-save-object": {
                    const schema = JsonConfigStore.getSchema(selectedFile);
                    const obj = {};
                    for (const field of schema.fields) {
                        obj[field.key] = JsonConfigStore.readFormValues(schema)[field.key];
                    }
                    const check = JsonConfigStore.validateFile(selectedFile, obj);
                    if (!check.ok) {
                        lastStatus = { ok: false, message: "Validation failed", errors: check.errors };
                        break;
                    }
                    const result = await JsonConfigStore.saveObject(selectedFile, obj);
                    lastStatus = result.ok
                        ? { ok: true, message: "Saved." }
                        : { ok: false, message: "Save failed", errors: result.errors };
                    break;
                }
                case "settings-json-reset-file": {
                    if (!confirm(`Reset ${selectedFile} to bundled defaults?`)) return;
                    await JsonConfigStore.resetFile(selectedFile);
                    editingIndex = null;
                    editingFontPlatform = null;
                    lastStatus = { ok: true, message: `${selectedFile} reset to bundled.` };
                    break;
                }
                case "settings-reset": {
                    if (!confirm("Reset profiles and settings? JSON preset overrides are kept.")) return;
                    await ConfigBundle.resetAll();
                    lastStatus = { ok: true, message: "Profiles and settings reset." };
                    break;
                }
                case "settings-strip-referrer":
                case "settings-block-trackers":
                    await applyPrivacyToggles({
                        stripReferrer: document.getElementById("settings-strip-referrer")?.checked ?? false,
                        blockTrackers: document.getElementById("settings-block-trackers")?.checked ?? false
                    });
                    lastStatus = { ok: true, message: "Privacy rules updated." };
                    break;
            }
            await rerender();
        } catch (err) {
            lastStatus = { ok: false, message: String(err) };
            await rerender();
        }
    }

    return { render, handleAction };

})();
