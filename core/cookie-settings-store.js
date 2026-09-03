/********************************************************************
 * Cookie Settings Store — ROOT defaults + per-site overrides
 ********************************************************************/

const CookieSettingsStore = (() => {

    const KEY = "snooper_cookie_settings";
    const ROOT_ID = "__ROOT__";

    const TAB_RULE_KEYS = [
        "clearOnTabClose",
        "clearSessionOnTabClose",
        "clearThirdPartyOnTabClose"
    ];

    const DEFAULT_RULES = {
        clearOnTabClose: false,
        clearSessionOnTabClose: false,
        clearThirdPartyOnTabClose: false,
        clearOnBrowserStartup: false,
        startupDomains: []
    };

    function emptyRules() {
        return { ...DEFAULT_RULES, startupDomains: [] };
    }

    function migrate(raw) {
        if (!raw || typeof raw !== "object") {
            return { root: emptyRules(), sites: {} };
        }
        if (!raw.root && !raw.sites) {
            return {
                root: { ...emptyRules(), ...raw },
                sites: {}
            };
        }
        return {
            root: { ...emptyRules(), ...(raw.root || {}) },
            sites: { ...(raw.sites || {}) }
        };
    }

    async function getAll() {
        const res = await chrome.storage.local.get(KEY);
        return migrate(res?.[KEY]);
    }

    async function saveAll(data) {
        const next = migrate(data);
        await chrome.storage.local.set({ [KEY]: next });
        return next;
    }

    async function getRoot() {
        return (await getAll()).root;
    }

    async function saveRoot(partial) {
        const all = await getAll();
        all.root = { ...all.root, ...partial };
        if (partial.startupDomains) {
            all.root.startupDomains = [...partial.startupDomains];
        }
        return saveAll(all);
    }

    async function getSite(hostname) {
        if (!hostname) return null;
        return (await getAll()).sites[hostname] || { mode: "inherit", rules: {} };
    }

    async function saveSite(hostname, config) {
        const all = await getAll();
        if (!config || config.mode === "inherit") {
            delete all.sites[hostname];
        } else {
            all.sites[hostname] = {
                mode: "custom",
                rules: {
                    clearOnTabClose: !!config.rules?.clearOnTabClose,
                    clearSessionOnTabClose: !!config.rules?.clearSessionOnTabClose,
                    clearThirdPartyOnTabClose: !!config.rules?.clearThirdPartyOnTabClose
                }
            };
        }
        return saveAll(all);
    }

    async function deleteSite(hostname) {
        const all = await getAll();
        delete all.sites[hostname];
        return saveAll(all);
    }

    function resolveForHost(all, hostname) {
        const root = all.root;
        const site = hostname ? all.sites[hostname] : null;

        if (!site || site.mode !== "custom") {
            return {
                clearOnTabClose: root.clearOnTabClose,
                clearSessionOnTabClose: root.clearSessionOnTabClose,
                clearThirdPartyOnTabClose: root.clearThirdPartyOnTabClose,
                clearOnBrowserStartup: root.clearOnBrowserStartup,
                startupDomains: root.startupDomains || [],
                _scope: "root",
                _hostname: hostname || null
            };
        }

        return {
            clearOnTabClose: site.rules.clearOnTabClose,
            clearSessionOnTabClose: site.rules.clearSessionOnTabClose,
            clearThirdPartyOnTabClose: site.rules.clearThirdPartyOnTabClose,
            clearOnBrowserStartup: root.clearOnBrowserStartup,
            startupDomains: root.startupDomains || [],
            _scope: "site",
            _hostname: hostname
        };
    }

    async function resolve(hostname) {
        return resolveForHost(await getAll(), hostname);
    }

    function listCustomSites(all) {
        return Object.entries(all.sites || {})
            .filter(([, cfg]) => cfg?.mode === "custom")
            .map(([hostname, cfg]) => ({ hostname, rules: cfg.rules }));
    }

    return {
        KEY,
        ROOT_ID,
        TAB_RULE_KEYS,
        DEFAULT_RULES,
        getAll,
        saveAll,
        getRoot,
        saveRoot,
        getSite,
        saveSite,
        deleteSite,
        resolve,
        resolveForHost,
        listCustomSites,
        migrate
    };

})();
