/********************************************************************
 * JSON Config Store — bundled presets + validated user overrides
 ********************************************************************/

const JsonConfigStore = (() => {

    const OVERRIDE_KEY = "snooper_json_overrides";
    const BASE = "sidepanel/modules/fingerprint-data/";

    const FILES = [
        { id: "screenProfiles.json", title: "Screen resolutions", group: "Fingerprint" },
        { id: "cpuCores.json", title: "CPU cores (options)", group: "Fingerprint" },
        { id: "deviceMemoryGb.json", title: "Device memory GB (options)", group: "Fingerprint" },
        { id: "touchPoints.json", title: "Touch points (options)", group: "Fingerprint" },
        { id: "connectionProfiles.json", title: "Network connection presets", group: "Fingerprint" },
        { id: "deviceProfiles.json", title: "Legacy device bundles (deprecated)", group: "Fingerprint" },
        { id: "timezoneProfiles.json", title: "Timezones", group: "Fingerprint" },
        { id: "browserProfiles.json", title: "Browser / UA", group: "Fingerprint" },
        { id: "webglProfiles.json", title: "WebGL GPU", group: "Fingerprint" },
        { id: "geolocationProfiles.json", title: "Geolocation", group: "Fingerprint" },
        { id: "languages.json", title: "Languages", group: "Lists" },
        { id: "platforms.json", title: "Platforms", group: "Lists" },
        { id: "fontProfiles.json", title: "Font lists (by platform)", group: "Lists" },
        { id: "trackers.json", title: "Tracker blocklist", group: "Privacy" },
        { id: "limits.json", title: "Spoof limits (info)", group: "Reference" },
        { id: "about.json", title: "About / extension info", group: "Reference", hidden: true }
    ];

    const NON_EDITABLE = new Set(["about.json"]);

    const SCHEMAS = {
        "screenProfiles.json": {
            kind: "records",
            keyField: "label",
            fields: [
                { key: "label", label: "Label", type: "string", required: true },
                { key: "width", label: "Width", type: "integer", min: 1, required: true },
                { key: "height", label: "Height", type: "integer", min: 1, required: true },
                { key: "colorDepth", label: "Color depth", type: "integer", min: 1, required: true },
                { key: "devicePixelRatio", label: "Device pixel ratio", type: "number", min: 0.5, required: true },
                { key: "chromeHeight", label: "Chrome height", type: "integer", min: 0, required: true },
                { key: "mobile", label: "Mobile", type: "boolean", required: true }
            ]
        },
        "deviceProfiles.json": {
            kind: "records",
            keyField: "label",
            fields: [
                { key: "label", label: "Label", type: "string", required: true },
                { key: "hardwareConcurrency", label: "CPU cores", type: "integer", min: 1, required: true },
                { key: "deviceMemory", label: "Memory GB", type: "integer", min: 1, required: true },
                { key: "maxTouchPoints", label: "Touch points", type: "integer", min: 0, required: true },
                { key: "connection.effectiveType", label: "Connection type", type: "enum", options: ["slow-2g", "2g", "3g", "4g"], required: true },
                { key: "connection.downlink", label: "Downlink (Mbps)", type: "number", min: 0, required: true },
                { key: "connection.rtt", label: "RTT (ms)", type: "integer", min: 0, required: true }
            ],
            buildRecord(values) {
                return {
                    label: values.label,
                    hardwareConcurrency: values.hardwareConcurrency,
                    deviceMemory: values.deviceMemory,
                    maxTouchPoints: values.maxTouchPoints,
                    connection: {
                        effectiveType: values["connection.effectiveType"],
                        downlink: values["connection.downlink"],
                        rtt: values["connection.rtt"]
                    }
                };
            },
            flattenRecord(rec) {
                return {
                    label: rec.label,
                    hardwareConcurrency: rec.hardwareConcurrency,
                    deviceMemory: rec.deviceMemory,
                    maxTouchPoints: rec.maxTouchPoints,
                    "connection.effectiveType": rec.connection?.effectiveType,
                    "connection.downlink": rec.connection?.downlink,
                    "connection.rtt": rec.connection?.rtt
                };
            }
        },
        "cpuCores.json": { kind: "stringList", itemLabel: "CPU cores" },
        "deviceMemoryGb.json": { kind: "stringList", itemLabel: "Memory (GB)" },
        "touchPoints.json": { kind: "stringList", itemLabel: "Touch points" },
        "connectionProfiles.json": {
            kind: "records",
            keyField: "label",
            fields: [
                { key: "label", label: "ID", type: "string", required: true },
                { key: "effectiveType", label: "Effective type", type: "enum", options: ["slow-2g", "2g", "3g", "4g"], required: true },
                { key: "downlink", label: "Downlink (Mbps)", type: "number", min: 0, required: true },
                { key: "rtt", label: "RTT (ms)", type: "integer", min: 0, required: true }
            ]
        },
        "timezoneProfiles.json": {
            kind: "records",
            keyField: "label",
            fields: [
                { key: "label", label: "Label", type: "string", required: true },
                { key: "timezone", label: "IANA timezone", type: "string", required: true },
                { key: "utcOffsetMinutes", label: "UTC offset (minutes)", type: "integer", required: true }
            ]
        },
        "webglProfiles.json": {
            kind: "records",
            keyField: "label",
            fields: [
                { key: "label", label: "Label", type: "string", required: true },
                { key: "vendor", label: "Vendor", type: "string", required: true },
                { key: "renderer", label: "Renderer", type: "string", required: true },
                { key: "vendorStandard", label: "Vendor (standard)", type: "string", required: true },
                { key: "rendererStandard", label: "Renderer (standard)", type: "string", required: true },
                { key: "extensions", label: "Extensions (comma-separated)", type: "stringList", required: true }
            ],
            buildRecord(values) {
                return {
                    label: values.label,
                    vendor: values.vendor,
                    renderer: values.renderer,
                    vendorStandard: values.vendorStandard,
                    rendererStandard: values.rendererStandard,
                    extensions: values.extensions
                };
            },
            flattenRecord(rec) {
                return {
                    label: rec.label,
                    vendor: rec.vendor,
                    renderer: rec.renderer,
                    vendorStandard: rec.vendorStandard,
                    rendererStandard: rec.rendererStandard,
                    extensions: Array.isArray(rec.extensions) ? rec.extensions : []
                };
            }
        },
        "geolocationProfiles.json": {
            kind: "records",
            keyField: "label",
            fields: [
                { key: "label", label: "Label", type: "string", required: true },
                { key: "latitude", label: "Latitude", type: "number", min: -90, max: 90, required: true },
                { key: "longitude", label: "Longitude", type: "number", min: -180, max: 180, required: true },
                { key: "accuracy", label: "Accuracy (m)", type: "number", min: 1, required: true },
                { key: "timezone", label: "IANA timezone", type: "string", required: true },
                { key: "utcOffsetMinutes", label: "UTC offset (minutes)", type: "integer", required: true }
            ]
        },
        "browserProfiles.json": {
            kind: "records",
            keyField: "label",
            fields: [
                { key: "label", label: "Label", type: "string", required: true },
                { key: "userAgent", label: "User-Agent", type: "string", required: true },
                { key: "platform", label: "Platform", type: "string", required: true },
                { key: "language", label: "Language", type: "string", required: true },
                { key: "vendor", label: "Vendor", type: "string", required: true },
                { key: "productSub", label: "Product sub", type: "string", required: true },
                { key: "oscpu", label: "oscpu (optional)", type: "string", required: false },
                { key: "pdfViewerEnabled", label: "PDF viewer enabled", type: "boolean", required: true },
                { key: "sendClientHints", label: "Send client hints", type: "boolean", required: true },
                { key: "userAgentData.brands", label: "CH brands (Brand:Version, comma-separated)", type: "brandList", required: false },
                { key: "userAgentData.mobile", label: "CH mobile", type: "boolean", required: false },
                { key: "userAgentData.platform", label: "CH platform", type: "string", required: false },
                { key: "userAgentData.platformVersion", label: "CH platform version", type: "string", required: false },
                { key: "userAgentData.architecture", label: "CH architecture", type: "string", required: false },
                { key: "userAgentData.bitness", label: "CH bitness", type: "string", required: false },
                { key: "userAgentData.uaFullVersion", label: "CH full UA version", type: "string", required: false }
            ],
            buildRecord(values) {
                const rec = {
                    label: values.label,
                    userAgent: values.userAgent,
                    platform: values.platform,
                    language: values.language,
                    vendor: values.vendor,
                    productSub: values.productSub,
                    oscpu: values.oscpu || null,
                    pdfViewerEnabled: values.pdfViewerEnabled,
                    sendClientHints: values.sendClientHints
                };
                const brands = values["userAgentData.brands"];
                const hasCh = values.sendClientHints && (
                    brands?.length || values["userAgentData.platform"]
                );
                if (hasCh) {
                    rec.userAgentData = {
                        brands: brands || [],
                        mobile: !!values["userAgentData.mobile"],
                        platform: values["userAgentData.platform"] || "",
                        platformVersion: values["userAgentData.platformVersion"] || "",
                        architecture: values["userAgentData.architecture"] || "",
                        bitness: values["userAgentData.bitness"] || "",
                        uaFullVersion: values["userAgentData.uaFullVersion"] || ""
                    };
                }
                return rec;
            },
            flattenRecord(rec) {
                const flat = {
                    label: rec.label,
                    userAgent: rec.userAgent,
                    platform: rec.platform,
                    language: rec.language,
                    vendor: rec.vendor,
                    productSub: rec.productSub,
                    oscpu: rec.oscpu || "",
                    pdfViewerEnabled: rec.pdfViewerEnabled !== false,
                    sendClientHints: !!rec.sendClientHints,
                    "userAgentData.brands": rec.userAgentData?.brands || [],
                    "userAgentData.mobile": !!rec.userAgentData?.mobile,
                    "userAgentData.platform": rec.userAgentData?.platform || "",
                    "userAgentData.platformVersion": rec.userAgentData?.platformVersion || "",
                    "userAgentData.architecture": rec.userAgentData?.architecture || "",
                    "userAgentData.bitness": rec.userAgentData?.bitness || "",
                    "userAgentData.uaFullVersion": rec.userAgentData?.uaFullVersion || ""
                };
                return flat;
            }
        },
        "languages.json": { kind: "stringList" },
        "platforms.json": { kind: "stringList" },
        "trackers.json": { kind: "stringList", itemLabel: "Domain" },
        "limits.json": {
            kind: "records",
            keyField: "id",
            fields: [
                { key: "id", label: "ID", type: "string", required: true },
                { key: "label", label: "Label", type: "string", required: true },
                { key: "reason", label: "Reason", type: "string", required: true },
                { key: "status", label: "Status (impossible/partial/mitigated)", type: "enum", options: ["impossible", "partial", "mitigated"], required: false },
                { key: "toggle", label: "Linked toggle id", type: "string", required: false },
                { key: "preset", label: "Linked preset field", type: "string", required: false },
                { key: "workaround", label: "Workaround text", type: "string", required: false }
            ]
        },
        "fontProfiles.json": {
            kind: "fontMap",
            platformField: { key: "platform", label: "Platform key", type: "string", required: true },
            fontsField: { key: "fonts", label: "Fonts (one per line)", type: "multilineStrings", required: true }
        },
        "about.json": {
            kind: "object",
            fields: [
                { key: "extensionName", label: "Extension name", type: "string", required: true },
                { key: "author", label: "Author (full name)", type: "string", required: false },
                { key: "email", label: "Email", type: "email", required: false },
                { key: "website", label: "Website URL", type: "url", required: false },
                { key: "about", label: "About text", type: "multiline", required: false }
            ]
        }
    };

    const bundledCache = {};

    function listFiles() {
        return FILES.slice();
    }

    function listEditableFiles() {
        return FILES.filter((f) => !f.hidden && !NON_EDITABLE.has(f.id));
    }

    function isEditable(fileId) {
        return !NON_EDITABLE.has(fileId);
    }

    function getSchema(fileId) {
        return SCHEMAS[fileId] || null;
    }

    async function getOverrides() {
        const res = await chrome.storage.local.get(OVERRIDE_KEY);
        const overrides = res?.[OVERRIDE_KEY] || {};
        if (overrides["about.json"]) {
            delete overrides["about.json"];
            await chrome.storage.local.set({ [OVERRIDE_KEY]: overrides });
        }
        return overrides;
    }

    async function loadBundled(fileId) {
        if (bundledCache[fileId]) return structuredClone(bundledCache[fileId]);
        const res = await fetch(chrome.runtime.getURL(BASE + fileId));
        const data = await res.json();
        bundledCache[fileId] = data;
        return structuredClone(data);
    }

    async function load(fileId) {
        if (NON_EDITABLE.has(fileId)) {
            return loadBundled(fileId);
        }
        const overrides = await getOverrides();
        if (Object.prototype.hasOwnProperty.call(overrides, fileId)) {
            return structuredClone(overrides[fileId]);
        }
        return loadBundled(fileId);
    }

    async function hasOverride(fileId) {
        if (NON_EDITABLE.has(fileId)) return false;
        const overrides = await getOverrides();
        return Object.prototype.hasOwnProperty.call(overrides, fileId);
    }

    async function save(fileId, data) {
        if (NON_EDITABLE.has(fileId)) {
            return { ok: false, errors: [`${fileId} cannot be modified`] };
        }
        const check = validateFile(fileId, data);
        if (!check.ok) return check;
        const overrides = await getOverrides();
        overrides[fileId] = structuredClone(data);
        await chrome.storage.local.set({ [OVERRIDE_KEY]: overrides });
        chrome.runtime.sendMessage({ type: "JSON_CONFIG_UPDATED", fileId }).catch(() => {});
        return { ok: true };
    }

    async function resetFile(fileId) {
        if (NON_EDITABLE.has(fileId)) {
            return { ok: false, errors: [`${fileId} cannot be reset`] };
        }
        const overrides = await getOverrides();
        delete overrides[fileId];
        await chrome.storage.local.set({ [OVERRIDE_KEY]: overrides });
        chrome.runtime.sendMessage({ type: "JSON_CONFIG_UPDATED", fileId }).catch(() => {});
        return { ok: true };
    }

    function parseFieldValue(field, raw) {
        if (field.type === "boolean") return !!raw;
        if (field.type === "integer") {
            const n = parseInt(String(raw).trim(), 10);
            return Number.isFinite(n) ? n : NaN;
        }
        if (field.type === "number") {
            const n = parseFloat(String(raw).trim());
            return Number.isFinite(n) ? n : NaN;
        }
        if (field.type === "stringList") {
            return String(raw || "")
                .split(",")
                .map(s => s.trim())
                .filter(Boolean);
        }
        if (field.type === "brandList") {
            return String(raw || "")
                .split(",")
                .map(s => s.trim())
                .filter(Boolean)
                .map(pair => {
                    const idx = pair.indexOf(":");
                    if (idx < 1) return null;
                    return { brand: pair.slice(0, idx).trim(), version: pair.slice(idx + 1).trim() };
                })
                .filter(Boolean);
        }
        if (field.type === "multilineStrings") {
            return String(raw || "")
                .split("\n")
                .map(s => s.trim())
                .filter(Boolean);
        }
        return String(raw ?? "").trim();
    }

    function formatFieldValue(field, value) {
        if (field.type === "boolean") return value ? "true" : "false";
        if (field.type === "stringList") return Array.isArray(value) ? value.join(", ") : "";
        if (field.type === "brandList") {
            return Array.isArray(value)
                ? value.map(b => `${b.brand}:${b.version}`).join(", ")
                : "";
        }
        if (field.type === "multilineStrings") {
            return Array.isArray(value) ? value.join("\n") : "";
        }
        if (value == null) return "";
        return String(value);
    }

    function validateField(field, value, path) {
        const errors = [];
        const empty = value === "" || value == null || (Array.isArray(value) && !value.length);

        if (field.required && empty) {
            errors.push(`${path}: required`);
            return errors;
        }
        if (empty && !field.required) return errors;

        if (field.type === "email" && value) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(`${path}: invalid email`);
        }
        if (field.type === "url" && value) {
            try { new URL(value); } catch (e) { errors.push(`${path}: invalid URL`); }
        }
        if (field.type === "integer" || field.type === "number") {
            if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${path}: must be a number`);
            else {
                if (field.min != null && value < field.min) errors.push(`${path}: min ${field.min}`);
                if (field.max != null && value > field.max) errors.push(`${path}: max ${field.max}`);
            }
        }
        if (field.type === "enum" && !field.options.includes(value)) {
            errors.push(`${path}: must be one of ${field.options.join(", ")}`);
        }
        if (field.type === "string" && field.required && !String(value).trim()) {
            errors.push(`${path}: required string`);
        }
        if (field.type === "stringList" && field.required && (!Array.isArray(value) || !value.length)) {
            errors.push(`${path}: at least one item required`);
        }
        if (field.type === "brandList" && value?.length) {
            value.forEach((b, i) => {
                if (!b.brand || !b.version) errors.push(`${path}[${i}]: brand and version required`);
            });
        }
        return errors;
    }

    function validateRecord(schema, record, index, allRecords, editIndex) {
        const path = `record[${index ?? "new"}]`;
        const errors = [];
        const values = schema.flattenRecord ? schema.flattenRecord(record) : record;

        for (const field of schema.fields) {
            const v = values[field.key];
            errors.push(...validateField(field, v, `${path}.${field.key}`));
        }

        const keyField = schema.keyField;
        if (keyField && record[keyField]) {
            const dup = allRecords.findIndex((r, i) => i !== editIndex && r[keyField] === record[keyField]);
            if (dup >= 0) errors.push(`${path}.${keyField}: duplicate "${record[keyField]}"`);
        }

        return errors;
    }

    function validateFile(fileId, data) {
        const schema = SCHEMAS[fileId];
        if (!schema) return { ok: false, errors: [`Unknown file: ${fileId}`] };
        const errors = [];

        if (schema.kind === "stringList") {
            if (!Array.isArray(data)) errors.push("Must be an array of strings");
            else data.forEach((item, i) => {
                if (typeof item !== "string" || !item.trim()) errors.push(`item[${i}]: non-empty string required`);
            });
        } else if (schema.kind === "records") {
            if (!Array.isArray(data)) errors.push("Must be an array of records");
            else data.forEach((rec, i) => errors.push(...validateRecord(schema, rec, i, data, -1)));
        } else if (schema.kind === "object") {
            if (!data || typeof data !== "object" || Array.isArray(data)) errors.push("Must be an object");
            else {
                for (const field of schema.fields) {
                    errors.push(...validateField(field, data[field.key], field.key));
                }
            }
        } else if (schema.kind === "fontMap") {
            if (!data || typeof data !== "object" || Array.isArray(data)) errors.push("Must be an object map");
            else {
                for (const [platform, fonts] of Object.entries(data)) {
                    if (!platform.trim()) errors.push("Platform key cannot be empty");
                    if (!Array.isArray(fonts) || !fonts.length) errors.push(`${platform}: fonts array required`);
                    else fonts.forEach((f, i) => {
                        if (typeof f !== "string" || !f.trim()) errors.push(`${platform}[${i}]: invalid font name`);
                    });
                }
            }
        }

        return { ok: errors.length === 0, errors };
    }

    function readFormValues(schema, prefix = "json-field-") {
        const values = {};
        const fields = schema.fields || [];
        for (const field of fields) {
            const el = document.getElementById(`${prefix}${field.key.replace(/\./g, "-")}`);
            if (field.type === "boolean") values[field.key] = el?.checked ?? false;
            else if (field.type === "multiline") values[field.key] = el?.value ?? "";
            else values[field.key] = parseFieldValue(field, el?.value);
        }
        return values;
    }

    function buildRecordFromForm(schema, prefix) {
        const values = readFormValues(schema, prefix);
        if (schema.buildRecord) return schema.buildRecord(values);
        const rec = {};
        for (const field of schema.fields) rec[field.key] = values[field.key];
        return rec;
    }

    function validateFormRecord(schema, record, allRecords, editIndex) {
        return validateRecord(schema, record, editIndex ?? "new", allRecords, editIndex ?? -1);
    }

    async function upsertRecord(fileId, record, editIndex) {
        const schema = SCHEMAS[fileId];
        const data = await load(fileId);
        const list = Array.isArray(data) ? [...data] : [];
        const errors = validateRecord(schema, record, editIndex ?? "new", list, editIndex ?? -1);
        if (errors.length) return { ok: false, errors };

        if (editIndex != null && editIndex >= 0) list[editIndex] = record;
        else list.push(record);

        return save(fileId, list);
    }

    async function deleteRecord(fileId, index) {
        const data = await load(fileId);
        if (!Array.isArray(data) || index < 0 || index >= data.length) {
            return { ok: false, errors: ["Invalid record index"] };
        }
        const list = data.filter((_, i) => i !== index);
        return save(fileId, list);
    }

    async function upsertStringListItem(fileId, value, editIndex) {
        const data = await load(fileId);
        const list = Array.isArray(data) ? [...data] : [];
        const trimmed = String(value || "").trim();
        if (!trimmed) return { ok: false, errors: ["Value cannot be empty"] };
        const dup = list.findIndex((s, i) => i !== editIndex && s === trimmed);
        if (dup >= 0) return { ok: false, errors: [`Duplicate: "${trimmed}"`] };

        if (editIndex != null && editIndex >= 0) list[editIndex] = trimmed;
        else list.push(trimmed);

        return save(fileId, list);
    }

    async function deleteStringListItem(fileId, index) {
        return deleteRecord(fileId, index);
    }

    async function saveObject(fileId, obj) {
        return save(fileId, obj);
    }

    async function upsertFontPlatform(fileId, platform, fonts, editPlatform) {
        const data = await load(fileId);
        const map = { ...(typeof data === "object" && !Array.isArray(data) ? data : {}) };
        const key = String(platform || "").trim();
        if (!key) return { ok: false, errors: ["Platform key required"] };
        if (editPlatform && editPlatform !== key && map[key]) {
            return { ok: false, errors: [`Platform "${key}" already exists`] };
        }
        if (editPlatform && editPlatform !== key) delete map[editPlatform];

        const fontList = String(fonts || "").split("\n").map(s => s.trim()).filter(Boolean);
        if (!fontList.length) return { ok: false, errors: ["At least one font required"] };

        map[key] = fontList;
        return save(fileId, map);
    }

    async function deleteFontPlatform(fileId, platform) {
        const data = await load(fileId);
        const map = { ...(typeof data === "object" ? data : {}) };
        delete map[platform];
        return save(fileId, map);
    }

    function recordSummary(fileId, record) {
        const schema = SCHEMAS[fileId];
        if (!schema) return String(record);
        if (schema.kind === "stringList") return record;
        if (schema.keyField && record[schema.keyField]) return record[schema.keyField];
        if (schema.kind === "object") return record.extensionName || "about";
        return JSON.stringify(record).slice(0, 60);
    }

    return {
        OVERRIDE_KEY,
        BASE,
        listFiles,
        listEditableFiles,
        isEditable,
        getSchema,
        load,
        loadBundled,
        hasOverride,
        save,
        resetFile,
        validateFile,
        readFormValues,
        buildRecordFromForm,
        validateFormRecord,
        upsertRecord,
        deleteRecord,
        upsertStringListItem,
        deleteStringListItem,
        saveObject,
        upsertFontPlatform,
        deleteFontPlatform,
        formatFieldValue,
        recordSummary
    };

})();
