/********************************************************************
 * Settings Store — persisted in chrome.storage.local (survives reboots)
 ********************************************************************/

const SettingsStore = (() => {

    const KEY = "snooper_settings";

    const DEFAULTS = {
        spoofEnabled: true,
        autoApplyOnStartup: true,
        installedVersion: null,
        lastAppliedAt: null,
        lastBrowserLabel: null,
        activeProfileName: null,
        theme: "dark",
        stripReferrer: false,
        blockTrackers: false,
        perSiteRotation: false,
        rotationLanguageMode: "default"
    };

    async function get() {
        const res = await chrome.storage.local.get(KEY);
        return { ...DEFAULTS, ...(res?.[KEY] || {}) };
    }

    async function set(partial) {
        const current = await get();
        const next = { ...current, ...partial };
        await chrome.storage.local.set({ [KEY]: next });
        return next;
    }

    async function isSpoofEnabled() {
        const s = await get();
        return s.spoofEnabled !== false;
    }

    async function markApplied(meta = {}) {
        return set({
            lastAppliedAt: new Date().toISOString(),
            ...meta
        });
    }

    return {
        KEY,
        DEFAULTS,
        get,
        set,
        isSpoofEnabled,
        markApplied
    };

})();
