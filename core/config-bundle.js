/********************************************************************
 * Config Bundle — signed backup export / validated import (v2)
 ********************************************************************/

const ConfigBundle = (() => {

    const SCHEMA_VERSION = 2;
    const BACKUP_FORMAT = "snooper-backup-v1";
    const SIGN_KEY_MATERIAL = "SnooperBackupHmac-v1";

    const PROFILE_KEY = "snooper_saved_profiles";
    const ACTIVE_ID_KEY = "snooper_active_profile_id";
    const UI_STATE_KEY = "snooper_fingerprint_profile";
    const ACTIVE_PROFILE_KEY = "snooper_active_profile";
    const SETTINGS_KEY = "snooper_settings";
    const COOKIE_SETTINGS_KEY = "snooper_cookie_settings";
    const JSON_OVERRIDE_KEY = "snooper_json_overrides";
    const CUSTOM_BLOCKS_KEY = "snooper_custom_blocked_domains";

    const SETTINGS_SKIP_ON_IMPORT = new Set(["installedVersion"]);

    const STATE_BOOLS = [
        "spoofCanvas", "spoofWebgl", "spoofAudio", "spoofMatchMedia",
        "spoofConnection", "spoofGeolocation", "spoofPrivacy", "spoofFonts",
        "spoofWorkers", "blockWebRTC", "globalPrivacyControl", "stealthMode"
    ];

    const STATE_STRINGS = [
        "screen", "device", "timezone", "browser", "webgl", "geolocation",
        "language", "platform", "doNotTrack",
        "hardwareConcurrency", "deviceMemory", "maxTouchPoints", "connection"
    ];

    let signKeyPromise = null;

    function canonicalStringify(value) {
        if (value === null || typeof value !== "object") {
            return JSON.stringify(value);
        }
        if (Array.isArray(value)) {
            return `[${value.map(canonicalStringify).join(",")}]`;
        }
        const keys = Object.keys(value).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(",")}}`;
    }

    async function getSignKey() {
        if (!signKeyPromise) {
            signKeyPromise = crypto.subtle.importKey(
                "raw",
                new TextEncoder().encode(SIGN_KEY_MATERIAL),
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["sign", "verify"]
            );
        }
        return signKeyPromise;
    }

    async function signPayload(payload) {
        const key = await getSignKey();
        const data = new TextEncoder().encode(canonicalStringify(payload));
        const sig = await crypto.subtle.sign("HMAC", key, data);
        return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    async function verifySignature(payload, signatureHex) {
        if (!signatureHex || typeof signatureHex !== "string") return false;
        try {
            const key = await getSignKey();
            const data = new TextEncoder().encode(canonicalStringify(payload));
            const sigBytes = new Uint8Array(signatureHex.match(/.{1,2}/g).map((h) => parseInt(h, 16)));
            return crypto.subtle.verify("HMAC", key, sigBytes, data);
        } catch (e) {
            return false;
        }
    }

    function validateProfileState(state, path) {
        const errors = [];
        if (!state || typeof state !== "object" || Array.isArray(state)) {
            errors.push(`${path}: state must be an object`);
            return errors;
        }
        for (const key of Object.keys(state)) {
            if (!STATE_BOOLS.includes(key) && !STATE_STRINGS.includes(key)) {
                errors.push(`${path}: unknown state key "${key}"`);
            }
        }
        for (const k of STATE_BOOLS) {
            if (k in state && typeof state[k] !== "boolean") {
                errors.push(`${path}.${k}: must be boolean`);
            }
        }
        for (const k of STATE_STRINGS) {
            if (k in state && state[k] !== null && typeof state[k] !== "string") {
                errors.push(`${path}.${k}: must be string or null`);
            }
        }
        return errors;
    }

    function validateProfile(entry, index) {
        const path = `profiles[${index}]`;
        const errors = [];
        if (!entry || typeof entry !== "object") {
            return [`${path}: must be an object`];
        }
        if (!entry.name || typeof entry.name !== "string") {
            errors.push(`${path}.name: required string`);
        }
        if (!entry.state) {
            errors.push(`${path}.state: required`);
        } else {
            errors.push(...validateProfileState(entry.state, `${path}.state`));
        }
        return errors;
    }

    function validateJsonOverrides(overrides) {
        const errors = [];
        if (overrides == null) return errors;
        if (typeof overrides !== "object" || Array.isArray(overrides)) {
            errors.push("jsonOverrides must be an object");
            return errors;
        }
        for (const [fileId, data] of Object.entries(overrides)) {
            if (typeof JsonConfigStore !== "undefined" && JsonConfigStore.isEditable
                && !JsonConfigStore.isEditable(fileId)) {
                errors.push(`jsonOverrides.${fileId}: not allowed in backup`);
                continue;
            }
            if (fileId === "about.json") {
                errors.push("jsonOverrides.about.json: not allowed in backup");
                continue;
            }
            if (typeof JsonConfigStore !== "undefined") {
                const check = JsonConfigStore.validateFile(fileId, data);
                if (!check.ok) errors.push(...check.errors.map((e) => `jsonOverrides.${fileId}: ${e}`));
            }
        }
        return errors;
    }

    function validatePayload(payload) {
        const errors = [];
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            return { ok: false, errors: ["payload must be an object"] };
        }
        if (payload.schemaVersion !== SCHEMA_VERSION) {
            errors.push(`payload.schemaVersion must be ${SCHEMA_VERSION}`);
        }
        if (payload.profiles != null) {
            if (!Array.isArray(payload.profiles)) {
                errors.push("profiles must be an array");
            } else {
                payload.profiles.forEach((p, i) => errors.push(...validateProfile(p, i)));
            }
        }
        if (payload.settings != null && typeof payload.settings !== "object") {
            errors.push("settings must be an object");
        }
        if (payload.cookieSettings != null && typeof payload.cookieSettings !== "object") {
            errors.push("cookieSettings must be an object");
        }
        if (payload.customBlockedDomains != null) {
            if (!Array.isArray(payload.customBlockedDomains)) {
                errors.push("customBlockedDomains must be an array");
            } else {
                payload.customBlockedDomains.forEach((d, i) => {
                    if (typeof d !== "string" || !d.trim()) {
                        errors.push(`customBlockedDomains[${i}]: invalid domain`);
                    }
                });
            }
        }
        errors.push(...validateJsonOverrides(payload.jsonOverrides));
        return { ok: errors.length === 0, errors };
    }

    /** @deprecated use validatePayload — kept for raw JSON import */
    function validate(data) {
        return validatePayload(data);
    }

    function sanitizeJsonOverrides(overrides) {
        if (!overrides || typeof overrides !== "object") return {};
        const out = {};
        for (const [fileId, data] of Object.entries(overrides)) {
            if (fileId === "about.json") continue;
            if (typeof JsonConfigStore !== "undefined" && JsonConfigStore.isEditable
                && !JsonConfigStore.isEditable(fileId)) continue;
            out[fileId] = data;
        }
        return out;
    }

    async function collectPayload() {
        const keys = [
            PROFILE_KEY, ACTIVE_ID_KEY, UI_STATE_KEY,
            ACTIVE_PROFILE_KEY, SETTINGS_KEY, COOKIE_SETTINGS_KEY,
            JSON_OVERRIDE_KEY, CUSTOM_BLOCKS_KEY
        ];
        const data = await chrome.storage.local.get(keys);
        const { profiles, activeId } = await ProfileStore.list();

        return {
            schemaVersion: SCHEMA_VERSION,
            profiles: profiles.map((p) => ({
                id: p.id,
                name: p.name,
                state: p.state,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
            })),
            activeProfileId: activeId,
            uiState: data[UI_STATE_KEY] || null,
            activeProfile: data[ACTIVE_PROFILE_KEY] || null,
            settings: data[SETTINGS_KEY] || null,
            cookieSettings: data[COOKIE_SETTINGS_KEY] || null,
            jsonOverrides: sanitizeJsonOverrides(data[JSON_OVERRIDE_KEY]),
            customBlockedDomains: Array.isArray(data[CUSTOM_BLOCKS_KEY]) ? data[CUSTOM_BLOCKS_KEY] : []
        };
    }

    async function exportSignedBackup() {
        const payload = await collectPayload();
        const signature = await signPayload(payload);
        return {
            format: BACKUP_FORMAT,
            exportedAt: new Date().toISOString(),
            extensionVersion: chrome.runtime.getManifest().version,
            payload,
            signature
        };
    }

    /** @deprecated */
    async function exportAll() {
        const payload = await collectPayload();
        return {
            ...payload,
            exportedAt: new Date().toISOString(),
            extensionVersion: chrome.runtime.getManifest().version
        };
    }

    async function parseBackupText(text) {
        const parsed = parseJsonText(text);
        if (!parsed.ok) return parsed;

        const bundle = parsed.data;
        if (!bundle || typeof bundle !== "object") {
            return { ok: false, errors: ["Backup must be a JSON object"] };
        }

        if (bundle.format !== BACKUP_FORMAT) {
            return { ok: false, errors: [`Unknown backup format (expected ${BACKUP_FORMAT})`] };
        }
        if (!bundle.payload || typeof bundle.payload !== "object") {
            return { ok: false, errors: ["Missing or invalid payload"] };
        }
        if (!bundle.signature) {
            return { ok: false, errors: ["Missing signature — backup may have been edited"] };
        }

        const sigOk = await verifySignature(bundle.payload, bundle.signature);
        if (!sigOk) {
            return { ok: false, errors: ["Invalid signature — backup was modified or corrupted"] };
        }

        const check = validatePayload(bundle.payload);
        if (!check.ok) {
            return { ok: false, errors: check.errors, tampered: true };
        }

        return {
            ok: true,
            bundle,
            summary: summarizePayload(bundle.payload)
        };
    }

    function summarizePayload(payload) {
        return {
            profileCount: payload.profiles?.length || 0,
            activeProfileId: payload.activeProfileId || null,
            hasSettings: !!payload.settings,
            hasCookieSettings: !!payload.cookieSettings,
            jsonOverrideCount: Object.keys(payload.jsonOverrides || {}).length,
            customBlockCount: payload.customBlockedDomains?.length || 0
        };
    }

    async function applySignedImport(bundle, mode = "merge") {
        const parsed = await parseBackupText(JSON.stringify(bundle));
        if (!parsed.ok) return { ok: false, errors: parsed.errors };

        return applyPayload(parsed.bundle.payload, mode);
    }

    async function applyPayload(data, mode = "merge") {
        const check = validatePayload(data);
        if (!check.ok) return { ok: false, errors: check.errors };

        if (mode === "replace") {
            await chrome.storage.local.clear();
        }

        const toSet = {};

        if (Array.isArray(data.profiles) && data.profiles.length) {
            const now = new Date().toISOString();
            const profiles = data.profiles.map((p) => ({
                id: p.id || `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: String(p.name).trim() || "Imported",
                state: { ...ProfileStore.defaultState(), ...p.state },
                createdAt: p.createdAt || now,
                updatedAt: now
            }));
            toSet[PROFILE_KEY] = profiles;
            toSet[ACTIVE_ID_KEY] = data.activeProfileId && profiles.find((p) => p.id === data.activeProfileId)
                ? data.activeProfileId
                : profiles[0].id;
            const active = profiles.find((p) => p.id === toSet[ACTIVE_ID_KEY]);
            if (active) toSet[UI_STATE_KEY] = active.state;
        }

        if (data.uiState) toSet[UI_STATE_KEY] = { ...ProfileStore.defaultState(), ...data.uiState };
        if (data.activeProfile) toSet[ACTIVE_PROFILE_KEY] = data.activeProfile;

        if (data.settings) {
            const cleaned = { ...data.settings };
            SETTINGS_SKIP_ON_IMPORT.forEach((k) => delete cleaned[k]);
            const cur = await SettingsStore.get();
            toSet[SETTINGS_KEY] = mode === "replace"
                ? { ...SettingsStore.DEFAULTS, ...cleaned }
                : { ...cur, ...cleaned };
        }

        if (data.cookieSettings) toSet[COOKIE_SETTINGS_KEY] = data.cookieSettings;

        if (data.jsonOverrides && typeof data.jsonOverrides === "object") {
            toSet[JSON_OVERRIDE_KEY] = sanitizeJsonOverrides(data.jsonOverrides);
        }

        if (Array.isArray(data.customBlockedDomains)) {
            toSet[CUSTOM_BLOCKS_KEY] = [...new Set(data.customBlockedDomains.map((d) => String(d).trim().toLowerCase()).filter(Boolean))];
        }

        await chrome.storage.local.set(toSet);

        if (toSet[SETTINGS_KEY]) {
            await new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: "SET_SETTINGS", settings: toSet[SETTINGS_KEY] }, resolve);
            });
        }

        if (toSet[CUSTOM_BLOCKS_KEY]) {
            await new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: "SET_CUSTOM_BLOCKS", domains: toSet[CUSTOM_BLOCKS_KEY] }, resolve);
            });
        }

        if (toSet[JSON_OVERRIDE_KEY]) {
            for (const fileId of Object.keys(toSet[JSON_OVERRIDE_KEY])) {
                chrome.runtime.sendMessage({ type: "JSON_CONFIG_UPDATED", fileId }).catch(() => {});
            }
        }

        if (toSet[ACTIVE_PROFILE_KEY] || data.profiles?.length) {
            await new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: "PROFILE_UPDATED" }, resolve);
            });
        }

        return { ok: true, applied: Object.keys(toSet), summary: summarizePayload(data) };
    }

    /** @deprecated */
    async function applyImport(data, mode = "merge") {
        if (data?.format === BACKUP_FORMAT) {
            return applySignedImport(data, mode);
        }
        const check = validatePayload(data);
        if (!check.ok) return { ok: false, errors: check.errors };
        return applyPayload(data, mode);
    }

    async function resetAll() {
        await chrome.storage.local.clear();
        const fresh = await ProfileStore.create("Default", ProfileStore.defaultState());
        await ProfileStore.activate(fresh.id);
        await SettingsStore.set({ ...SettingsStore.DEFAULTS });
        await chrome.storage.local.set({
            [COOKIE_SETTINGS_KEY]: CookieSettingsStore.migrate(null)
        });
        await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "PROFILE_UPDATED" }, resolve);
        });
        return { ok: true };
    }

    function parseJsonText(text) {
        try {
            return { ok: true, data: JSON.parse(text) };
        } catch (e) {
            return { ok: false, errors: [`Invalid JSON: ${e.message}`] };
        }
    }

    function downloadBackupFile(bundle) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `snooper-backup-${stamp}.snooper-backup.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    return {
        SCHEMA_VERSION,
        BACKUP_FORMAT,
        validate,
        validatePayload,
        parseBackupText,
        exportSignedBackup,
        exportAll,
        applySignedImport,
        applyImport,
        applyPayload,
        resetAll,
        parseJsonText,
        downloadBackupFile,
        summarizePayload
    };

})();
