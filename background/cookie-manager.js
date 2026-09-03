/********************************************************************
 * Cookie Manager (service worker) — auto-clear on tab close / startup
 ********************************************************************/

const CookieManager = (() => {

    const tabOrigins = new Map();

    function log(...args) {
        console.log("[CookieManager]", ...args);
    }

    function parseOrigin(url) {
        try {
            const u = new URL(url);
            if (!u.protocol.startsWith("http")) return null;
            return u.origin;
        } catch (e) {
            return null;
        }
    }

    function parseHostname(url) {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return null;
        }
    }

    function cookieUrl(c) {
        const scheme = c.secure ? "https:" : "http:";

        const host = (c.domain || "").startsWith(".") ? c.domain.slice(1) : c.domain;

        return `${scheme}//${host}${c.path || "/"}`;

    }



    function isThirdParty(cookie, pageHost) {

        if (!pageHost || !cookie.domain) return false;

        const cd = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;

        return pageHost !== cd && !pageHost.endsWith("." + cd);

    }



    async function getSettings() {

        return CookieSettingsStore.getAll();

    }



    async function setSettings(partial) {

        if (partial.root) {

            return CookieSettingsStore.saveRoot(partial.root);

        }

        return CookieSettingsStore.saveAll(partial);

    }



    async function removeCookie(c) {

        return new Promise((resolve) => {

            chrome.cookies.remove({

                url: cookieUrl(c),

                name: c.name,

                storeId: c.storeId

            }, (details) => {

                resolve(!!details && !chrome.runtime.lastError);

            });

        });

    }



    async function getCookiesForOrigin(origin) {

        return new Promise((resolve) => {

            chrome.cookies.getAll({ url: origin }, (cookies) => {

                resolve(cookies || []);

            });

        });

    }



    async function clearCookies(origin, options = {}) {

        const pageHost = parseHostname(origin);

        const cookies = await getCookiesForOrigin(origin);

        let removed = 0;



        for (const c of cookies) {

            if (options.sessionOnly && !c.session) continue;

            if (options.persistentOnly && c.session) continue;

            if (options.thirdPartyOnly && !isThirdParty(c, pageHost)) continue;

            if (options.firstPartyOnly && isThirdParty(c, pageHost)) continue;

            if (options.name && c.name !== options.name) continue;



            if (await removeCookie(c)) removed++;

        }



        return { removed, total: cookies.length };

    }



    async function clearDomainOnStartup(domain) {

        const schemes = ["https", "http"];

        let removed = 0;

        for (const scheme of schemes) {

            const origin = `${scheme}://${domain}`;

            const r = await clearCookies(origin);

            removed += r.removed;

        }

        const dotted = await new Promise((resolve) => {

            chrome.cookies.getAll({ domain }, (cookies) => resolve(cookies || []));

        });

        for (const c of dotted) {

            if (await removeCookie(c)) removed++;

        }

        return { removed };

    }



    async function runStartupClear() {

        const root = await CookieSettingsStore.getRoot();

        if (!root.clearOnBrowserStartup || !root.startupDomains?.length) {

            return { ok: true, removed: 0 };

        }

        let removed = 0;

        for (const domain of root.startupDomains) {

            const r = await clearDomainOnStartup(domain);

            removed += r.removed;

        }

        log("Startup clear removed", removed);

        return { ok: true, removed };

    }



    async function handleTabClosed(tabId) {

        const origin = tabOrigins.get(tabId);

        tabOrigins.delete(tabId);

        if (!origin) return { ok: true, skipped: true };



        const hostname = parseHostname(origin);

        const settings = await CookieSettingsStore.resolve(hostname);

        let removed = 0;



        if (settings.clearOnTabClose) {

            const r = await clearCookies(origin);

            removed += r.removed;

        }

        if (settings.clearSessionOnTabClose) {

            const r = await clearCookies(origin, { sessionOnly: true });

            removed += r.removed;

        }

        if (settings.clearThirdPartyOnTabClose) {

            const r = await clearCookies(origin, { thirdPartyOnly: true });

            removed += r.removed;

        }



        // #region agent log

        fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {

            method: "POST",

            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },

            body: JSON.stringify({

                sessionId: "6573a3",

                location: "background/cookie-manager.js:handleTabClosed",

                message: "Tab close cookie clear",

                data: {

                    hostname,

                    scope: settings._scope,

                    removed,

                    clearOnTabClose: settings.clearOnTabClose,

                    clearSession: settings.clearSessionOnTabClose,

                    clear3p: settings.clearThirdPartyOnTabClose

                },

                timestamp: Date.now(),

                hypothesisId: "COOKIE-ROOT",

                runId: "v3.6.2"

            })

        }).catch(() => {});

        // #endregion



        if (removed) log("Tab close clear:", hostname, settings._scope, removed);

        return { ok: true, removed, origin, scope: settings._scope };

    }



    function trackTab(tabId, url) {

        const origin = parseOrigin(url);

        if (origin) tabOrigins.set(tabId, origin);

    }



    function initListeners() {

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {

            if (tab?.url) trackTab(tabId, tab.url);

        });



        chrome.tabs.onRemoved.addListener((tabId) => {

            handleTabClosed(tabId).catch(err => log("tab close error", err));

        });



        chrome.runtime.onStartup.addListener(() => {

            runStartupClear().catch(err => log("startup clear error", err));

        });



        chrome.runtime.onInstalled.addListener(() => {

            runStartupClear().catch(err => log("install startup clear error", err));

        });

    }



    return {

        getSettings,

        setSettings,

        clearCookies,

        clearDomainOnStartup,

        runStartupClear,

        handleTabClosed,

        trackTab,

        parseOrigin,

        parseHostname,

        isThirdParty,

        cookieUrl,

        initListeners

    };



})();

