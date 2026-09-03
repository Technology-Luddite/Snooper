/********************************************************************
 * Custom domain blocklist — unified store (replaces legacy Network/ page)
 ********************************************************************/

const NetworkBlockStore = (() => {

    const KEY = "snooper_custom_blocked_domains";
    const LEGACY = "snooper_blocked_domains";

    function normalize(domain) {
        return String(domain || "").trim().toLowerCase().replace(/^\.+/, "");
    }

    async function migrateLegacy() {
        const data = await chrome.storage.local.get([KEY, LEGACY]);
        if (Array.isArray(data[KEY]) && data[KEY].length) return data[KEY];
        const legacy = Array.isArray(data[LEGACY]) ? data[LEGACY] : [];
        const normalized = [...new Set(legacy.map(normalize).filter(Boolean))];
        if (normalized.length) {
            await chrome.storage.local.set({ [KEY]: normalized });
        }
        return normalized;
    }

    async function get() {
        const data = await chrome.storage.local.get(KEY);
        if (Array.isArray(data[KEY])) return data[KEY];
        return migrateLegacy();
    }

    async function set(domains) {
        const clean = [...new Set(domains.map(normalize).filter(Boolean))];
        await chrome.storage.local.set({ [KEY]: clean });
        return clean;
    }

    async function add(domain) {
        const d = normalize(domain);
        if (!d) return get();
        const list = await get();
        if (list.includes(d)) return list;
        return set([...list, d]);
    }

    async function remove(domain) {
        const d = normalize(domain);
        return set((await get()).filter((x) => x !== d));
    }

    return { KEY, get, set, add, remove, normalize };

})();
