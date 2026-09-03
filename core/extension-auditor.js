/********************************************************************
 * Extension Auditor — permission analysis & capability risk scoring
 * Based on declared permissions only (not observed behavior).
 ********************************************************************/

const ExtensionAuditor = (() => {

    const PERMISSION_INFO = {
        cookies: {
            label: "Cookies",
            collect: "Read and modify cookies on sites you visit",
            store: null,
            send: "Could attach cookie data to outbound requests from the extension"
        },
        tabs: {
            label: "Tabs",
            collect: "See URLs, titles, and metadata of open tabs",
            store: null,
            send: "Could report browsing activity to remote servers"
        },
        webNavigation: {
            label: "Web navigation",
            collect: "Monitor page loads, redirects, and navigation timing",
            store: null,
            send: "Could log every site you visit"
        },
        history: {
            label: "History",
            collect: "Read your browsing history",
            store: null,
            send: "Could exfiltrate history entries"
        },
        browsingData: {
            label: "Browsing data",
            collect: "Read or clear caches, cookies, history, and related data",
            store: null,
            send: null
        },
        storage: {
            label: "Extension storage",
            collect: null,
            store: "Persist settings and collected data in extension storage",
            send: "Stored data could be uploaded later by the extension"
        },
        unlimitedStorage: {
            label: "Unlimited storage",
            collect: null,
            store: "Store large amounts of data without normal quota limits",
            send: "Large offline datasets could be synced or uploaded later"
        },
        scripting: {
            label: "Script injection",
            collect: "Inject JavaScript into web pages you open",
            store: null,
            send: "Injected scripts can read page content and relay it outward"
        },
        activeTab: {
            label: "Active tab",
            collect: "Access the currently active tab when you invoke the extension",
            store: null,
            send: null
        },
        declarativeNetRequest: {
            label: "Network rules (DNR)",
            collect: null,
            store: null,
            send: "Can block or modify requests (headers, redirects)"
        },
        declarativeNetRequestFeedback: {
            label: "DNR feedback",
            collect: "See which network rules matched (debug/telemetry)",
            store: null,
            send: null
        },
        webRequest: {
            label: "Web request (legacy)",
            collect: "Observe request URLs and headers",
            store: null,
            send: "Could inspect or modify all matching traffic"
        },
        debugger: {
            label: "Debugger",
            collect: "Attach debugger — full page/script inspection",
            store: null,
            send: "Near-total visibility into page behavior"
        },
        clipboardRead: {
            label: "Clipboard read",
            collect: "Read clipboard contents",
            store: null,
            send: "Could transmit clipboard data"
        },
        clipboardWrite: {
            label: "Clipboard write",
            collect: null,
            store: null,
            send: null
        },
        identity: {
            label: "Identity",
            collect: "OAuth profile tokens via Chrome identity API",
            store: "May cache auth tokens",
            send: "Could use tokens for authenticated API calls"
        },
        nativeMessaging: {
            label: "Native messaging",
            collect: "Talk to installed native applications",
            store: null,
            send: "Could pass browser data to desktop software"
        },
        proxy: {
            label: "Proxy",
            collect: "Route browser traffic through a proxy",
            store: null,
            send: "Could intercept all proxied traffic"
        },
        pageCapture: {
            label: "Page capture",
            collect: "Capture visible tab as image/PDF",
            store: "May save captures locally",
            send: "Could upload screenshots of pages"
        },
        tabCapture: {
            label: "Tab capture",
            collect: "Capture tab audio/video stream",
            store: null,
            send: "Could stream tab media externally"
        },
        desktopCapture: {
            label: "Desktop capture",
            collect: "Capture screen or window contents",
            store: null,
            send: "Could stream screen content externally"
        },
        downloads: {
            label: "Downloads",
            collect: "Manage and observe downloaded files",
            store: null,
            send: null
        },
        bookmarks: {
            label: "Bookmarks",
            collect: "Read and modify bookmarks",
            store: null,
            send: "Could exfiltrate bookmark lists"
        },
        topSites: {
            label: "Top sites",
            collect: "Read most-visited sites",
            store: null,
            send: null
        },
        sessions: {
            label: "Sessions",
            collect: "Restore and inspect browser sessions",
            store: null,
            send: null
        },
        privacy: {
            label: "Privacy API",
            collect: null,
            store: null,
            send: "Can change browser privacy settings (WebRTC, etc.)"
        },
        notifications: {
            label: "Notifications",
            collect: null,
            store: null,
            send: null
        },
        management: {
            label: "Extension management",
            collect: "List other installed extensions and their permissions",
            store: null,
            send: null
        },
        sidePanel: {
            label: "Side panel",
            collect: null,
            store: null,
            send: null
        },
        alarms: { label: "Alarms", collect: null, store: null, send: null },
        contextMenus: { label: "Context menus", collect: null, store: null, send: null }
    };

    const BROAD_HOST_PATTERNS = [
        "<all_urls>",
        "*://*/*",
        "http://*/*",
        "https://*/*",
        "*://*/*"
    ];

    function esc(str) {
        return String(str ?? "");
    }

    function isBroadHost(host) {
        if (!host) return false;
        const h = host.toLowerCase();
        if (BROAD_HOST_PATTERNS.includes(h)) return true;
        if (h.includes("*") && (h.includes("://*") || h === "<all_urls>")) return true;
        return false;
    }

    function hostMatchesUrl(hostPattern, url) {
        if (!hostPattern || !url) return false;
        if (isBroadHost(hostPattern)) {
            try {
                const u = new URL(url);
                return u.protocol === "http:" || u.protocol === "https:";
            } catch (e) {
                return false;
            }
        }
        try {
            const u = new URL(url);
            const host = u.hostname;
            let pattern = hostPattern
                .replace(/^\*:\/\//, "")
                .replace(/^https?:\/\//, "")
                .replace(/\/\*$/, "")
                .replace(/^\*\./, "");
            if (hostPattern.startsWith("*.")) {
                const suffix = hostPattern.slice(2).split("/")[0];
                return host === suffix || host.endsWith("." + suffix);
            }
            if (pattern.includes("*")) {
                const re = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
                return re.test(host);
            }
            return host === pattern || host.endsWith("." + pattern);
        } catch (e) {
            return false;
        }
    }

    function summarizeHosts(hostPermissions) {
        const hosts = hostPermissions || [];
        const broad = hosts.some(isBroadHost);
        return {
            broad,
            count: hosts.length,
            summary: broad
                ? "All websites (broad host access)"
                : hosts.length
                    ? `${hosts.length} specific host pattern(s)`
                    : "No host access declared"
        };
    }

    function scoreExtension(info) {
        let score = 0;
        const flags = [];
        const perms = new Set([...(info.permissions || []), ...(info.optionalPermissions || [])]);
        const hosts = info.hostPermissions || [];
        const hostInfo = summarizeHosts(hosts);

        if (hostInfo.broad) {
            score += 40;
            flags.push("broad-host");
        } else if (hosts.length > 10) {
            score += 15;
            flags.push("many-hosts");
        }

        if (perms.has("cookies")) { score += 25; flags.push("cookies"); }
        if (perms.has("history")) { score += 30; flags.push("history"); }
        if (perms.has("debugger")) { score += 50; flags.push("debugger"); }
        if (perms.has("webRequest") || perms.has("webRequestBlocking")) {
            score += 25;
            flags.push("webRequest");
        }
        if (perms.has("tabs")) { score += 12; flags.push("tabs"); }
        if (perms.has("webNavigation")) { score += 12; flags.push("webNavigation"); }
        if (perms.has("scripting")) {
            score += hostInfo.broad ? 20 : 8;
            flags.push("scripting");
        }
        if (perms.has("browsingData")) { score += 10; flags.push("browsingData"); }
        if (perms.has("clipboardRead")) { score += 15; flags.push("clipboardRead"); }
        if (perms.has("nativeMessaging")) { score += 18; flags.push("nativeMessaging"); }
        if (perms.has("proxy")) { score += 35; flags.push("proxy"); }
        if (perms.has("pageCapture") || perms.has("tabCapture")) {
            score += 20;
            flags.push("capture");
        }
        if (perms.has("desktopCapture")) { score += 25; flags.push("desktopCapture"); }
        if (perms.has("bookmarks")) { score += 10; flags.push("bookmarks"); }
        if (perms.has("identity")) { score += 8; flags.push("identity"); }

        if (hostInfo.broad && (perms.has("scripting") || perms.has("cookies"))) {
            score += 10;
            flags.push("broad-plus-sensitive");
        }

        if (info.installType === "development") {
            flags.push("unpacked");
        }

        let tier = "low";
        if (score >= 75) tier = "critical";
        else if (score >= 50) tier = "high";
        else if (score >= 25) tier = "medium";

        return { score, tier, flags, hostInfo };
    }

    function buildCapabilities(info, risk) {
        const collect = [];
        const store = [];
        const send = [];
        const seen = { c: new Set(), s: new Set(), e: new Set() };

        function add(target, set, text) {
            if (!text || set.has(text)) return;
            set.add(text);
            target.push(text);
        }

        if (risk.hostInfo.broad) {
            add(collect, seen.c, "Run on most websites you visit (broad host access)");
            add(collect, seen.c, "Read and interact with page DOM where permitted");
            add(send, seen.e, "Could read page content and transmit it from the extension background");
        } else if (risk.hostInfo.count) {
            add(collect, seen.c, `Access specific sites matching ${risk.hostInfo.count} host pattern(s)`);
        }

        for (const perm of info.permissions || []) {
            const meta = PERMISSION_INFO[perm];
            if (!meta) {
                add(collect, seen.c, `Uses permission: ${perm}`);
                continue;
            }
            add(collect, seen.c, meta.collect);
            add(store, seen.s, meta.store);
            add(send, seen.e, meta.send);
        }

        if (!store.length) {
            add(store, seen.s, "May use extension storage (contents not visible to other extensions)");
        }

        if (!send.length) {
            add(send, seen.e, "Could send collected data over the network (not observable by Snooper)");
        }

        return { collect, store, send };
    }

    function analyzeExtension(info, context = {}) {
        const risk = scoreExtension(info);
        const caps = buildCapabilities(info, risk);
        const affectsTab = context.tabUrl
            ? (info.hostPermissions || []).some((h) => hostMatchesUrl(h, context.tabUrl))
            : null;

        return {
            id: info.id,
            name: info.name || info.shortName || info.id,
            version: info.version || "—",
            enabled: info.enabled !== false,
            installType: info.installType || "normal",
            type: info.type || "extension",
            description: info.description || "",
            permissions: info.permissions || [],
            hostPermissions: info.hostPermissions || [],
            optionalPermissions: info.optionalPermissions || [],
            isSelf: info.id === context.selfId,
            risk,
            capabilities: caps,
            affectsCurrentTab: affectsTab,
            chromeUrl: `chrome://extensions/?id=${info.id}`
        };
    }

    function analyzeAll(extensions, context = {}) {
        return extensions
            .filter((e) => e.type === "extension" || e.type === "legacy_packaged_app")
            .map((e) => analyzeExtension(e, context))
            .sort((a, b) => b.risk.score - a.risk.score || a.name.localeCompare(b.name));
    }

    function tierLabel(tier) {
        return { low: "Low", medium: "Medium", high: "High", critical: "Critical" }[tier] || tier;
    }

    function tierClass(tier) {
        return `ext-tier-${tier}`;
    }

    return {
        PERMISSION_INFO,
        analyzeExtension,
        analyzeAll,
        summarizeHosts,
        hostMatchesUrl,
        tierLabel,
        tierClass
    };

})();
