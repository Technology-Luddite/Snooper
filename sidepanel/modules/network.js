/********************************************************************
 * Snooper Network Inspector v2
 * Resource timing, privacy classification, connection spoof context
 ********************************************************************/

const NetworkModule = (() => {

    let filterType = "all";
    let filterParty = "all";
    let sortBy = "start-desc";
    let searchQuery = "";
    let autoRefresh = false;
    let lastTabId = null;
    let lastStatus = null;
    let listenersBound = false;

    function log(...args) {
        console.log("[Snooper Network]", ...args);
    }

    function esc(str) {
        return String(str ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function formatBytes(n) {
        const v = Number(n) || 0;
        if (v === 0) return "0 B";
        if (v < 1024) return `${v} B`;
        if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
        return `${(v / (1024 * 1024)).toFixed(2)} MB`;
    }

    function formatMs(n) {
        const v = Number(n) || 0;
        if (v < 1) return "<1 ms";
        if (v < 1000) return `${Math.round(v)} ms`;
        return `${(v / 1000).toFixed(2)} s`;
    }

    function hostnameFromUrl(url) {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return "";
        }
    }

    function hostMatchesDomain(host, domain) {
        if (!host || !domain) return false;
        const h = host.toLowerCase();
        const d = domain.toLowerCase();
        return h === d || h.endsWith("." + d);
    }

    function isThirdPartyHost(host, pageHost) {
        if (!host || !pageHost) return false;
        return !hostMatchesDomain(host, pageHost) && host !== pageHost;
    }

    function findTrackerMatch(host, trackers) {
        if (!host || !trackers?.length) return null;
        for (const t of trackers) {
            if (hostMatchesDomain(host, t)) return t;
        }
        return null;
    }

    function findCustomBlock(host, customBlocks) {
        if (!host || !customBlocks?.length) return null;
        for (const d of customBlocks) {
            if (hostMatchesDomain(host, d)) return d;
        }
        return null;
    }

    function classifyEntry(entry, pageHost, trackers, customBlocks, settings) {
        const host = hostnameFromUrl(entry.name);
        const tracker = findTrackerMatch(host, trackers);
        const custom = findCustomBlock(host, customBlocks);
        const thirdParty = isThirdPartyHost(host, pageHost);
        const wouldBlockTracker = settings.blockTrackers && !!tracker;
        const wouldBlockCustom = !!custom;
        const cached = entry.transferSize === 0 && (entry.decodedBodySize || 0) > 0;

        let party = "first";
        if (thirdParty) party = "third";
        if (tracker) party = "tracker";

        return { host, tracker, custom, thirdParty, wouldBlockTracker, wouldBlockCustom, cached, party };
    }

    async function getActiveTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return tab || null;
        } catch (err) {
            console.error("[Network] tab error:", err);
            return null;
        }
    }

    function probePageNetwork() {
        const navEntry = performance.getEntriesByType("navigation")[0];
        const resources = performance.getEntriesByType("resource").map((e) => ({
            name: e.name,
            initiatorType: e.initiatorType || "",
            duration: e.duration,
            transferSize: e.transferSize || 0,
            encodedBodySize: e.encodedBodySize || 0,
            decodedBodySize: e.decodedBodySize || 0,
            startTime: e.startTime,
            nextHopProtocol: e.nextHopProtocol || "",
            domainLookupStart: e.domainLookupStart,
            domainLookupEnd: e.domainLookupEnd,
            connectStart: e.connectStart,
            connectEnd: e.connectEnd,
            secureConnectionStart: e.secureConnectionStart,
            requestStart: e.requestStart,
            responseStart: e.responseStart,
            responseEnd: e.responseEnd,
            workerStart: e.workerStart,
            fetchStart: e.fetchStart
        }));

        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const connection = conn ? {
            effectiveType: conn.effectiveType,
            downlink: conn.downlink,
            rtt: conn.rtt,
            saveData: conn.saveData
        } : null;

        let navigation = null;
        if (navEntry) {
            navigation = {
                name: navEntry.name,
                type: navEntry.type,
                duration: navEntry.duration,
                transferSize: navEntry.transferSize || 0,
                domContentLoaded: navEntry.domContentLoadedEventEnd - navEntry.fetchStart,
                loadEvent: navEntry.loadEventEnd - navEntry.fetchStart,
                ttfb: navEntry.responseStart - navEntry.requestStart,
                dns: navEntry.domainLookupEnd - navEntry.domainLookupStart,
                tcp: navEntry.connectEnd - navEntry.connectStart,
                tls: navEntry.secureConnectionStart > 0
                    ? navEntry.connectEnd - navEntry.secureConnectionStart : 0,
                protocol: navEntry.nextHopProtocol || ""
            };
        }

        return {
            pageHost: location.hostname,
            resources,
            connection,
            navigation
        };
    }

    async function getPageNetworkData(tabId) {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId },
                func: probePageNetwork
            });
            return results?.[0]?.result || null;
        } catch (err) {
            console.error("[Network] inject error:", err);
            return null;
        }
    }

    async function fetchContext(tabId) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "GET_NETWORK_CONTEXT", tabId }, (res) => {
                resolve(res || {});
            });
        });
    }

    function timingSegments(entry) {
        const start = entry.fetchStart ?? entry.startTime ?? 0;
        const end = entry.responseEnd ?? (start + entry.duration);
        const total = Math.max(end - start, 1);

        function seg(a, b) {
            if (a == null || b == null || b <= a) return 0;
            return Math.max(0, ((b - a) / total) * 100);
        }

        const dns = seg(entry.domainLookupStart, entry.domainLookupEnd);
        const tcp = seg(entry.connectStart, entry.connectEnd);
        const tlsStart = entry.secureConnectionStart > 0 ? entry.secureConnectionStart : entry.connectStart;
        const tls = entry.secureConnectionStart > 0 ? seg(tlsStart, entry.connectEnd) : 0;
        const wait = seg(entry.connectEnd || entry.domainLookupEnd || start, entry.responseStart);
        const download = seg(entry.responseStart, entry.responseEnd);

        return { dns, tcp, tls, wait, download, total: entry.duration };
    }

    function renderTimingBar(entry) {
        const s = timingSegments(entry);
        return `
            <div class="net-timing-bar" title="DNS ${Math.round(s.dns)}% · Connect ${Math.round(s.tcp)}% · Wait ${Math.round(s.wait)}% · Download ${Math.round(s.download)}%">
                <span class="net-timing-dns" style="width:${s.dns}%"></span>
                <span class="net-timing-tcp" style="width:${s.tcp}%"></span>
                <span class="net-timing-wait" style="width:${s.wait}%"></span>
                <span class="net-timing-dl" style="width:${s.download}%"></span>
            </div>`;
    }

    function badgeClass(cls, label) {
        return `<span class="net-badge net-badge-${cls}">${esc(label)}</span>`;
    }

    function renderBadges(cls) {
        const parts = [];
        if (cls.tracker) parts.push(badgeClass("tracker", "Tracker"));
        else if (cls.thirdParty) parts.push(badgeClass("third", "3rd-party"));
        else parts.push(badgeClass("first", "1st-party"));
        if (cls.cached) parts.push(badgeClass("cache", "Cached"));
        if (cls.wouldBlockCustom) parts.push(badgeClass("blocked", "Custom block"));
        else if (cls.wouldBlockTracker) parts.push(badgeClass("blocked", "Would block"));
        return parts.join(" ");
    }

    function filterAndSort(entries, pageHost, ctx) {
        let list = entries.map((e) => ({
            ...e,
            _cls: classifyEntry(e, pageHost, ctx.trackers, ctx.customBlocks, ctx.settings)
        }));

        if (filterType !== "all") {
            list = list.filter((e) => (e.initiatorType || "other") === filterType);
        }
        if (filterParty === "first") {
            list = list.filter((e) => !e._cls.thirdParty && !e._cls.tracker);
        } else if (filterParty === "third") {
            list = list.filter((e) => e._cls.thirdParty && !e._cls.tracker);
        } else if (filterParty === "tracker") {
            list = list.filter((e) => e._cls.tracker);
        } else if (filterParty === "blocked") {
            list = list.filter((e) => e._cls.wouldBlockTracker || e._cls.wouldBlockCustom);
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter((e) =>
                e.name.toLowerCase().includes(q) || e._cls.host.toLowerCase().includes(q));
        }

        const cmp = {
            "start-desc": (a, b) => b.startTime - a.startTime,
            "start-asc": (a, b) => a.startTime - b.startTime,
            "size-desc": (a, b) => b.transferSize - a.transferSize,
            "size-asc": (a, b) => a.transferSize - b.transferSize,
            "duration-desc": (a, b) => b.duration - a.duration,
            "duration-asc": (a, b) => a.duration - b.duration,
            "domain-asc": (a, b) => a._cls.host.localeCompare(b._cls.host)
        }[sortBy] || ((a, b) => b.startTime - a.startTime);

        list.sort(cmp);
        return list;
    }

    function computeSummary(entries, pageHost, ctx) {
        let totalBytes = 0;
        let trackerCount = 0;
        let thirdCount = 0;
        let blockable = 0;
        let slowest = null;

        for (const e of entries) {
            totalBytes += e.transferSize || 0;
            const cls = classifyEntry(e, pageHost, ctx.trackers, ctx.customBlocks, ctx.settings);
            if (cls.tracker) trackerCount++;
            if (cls.thirdParty) thirdCount++;
            if (cls.wouldBlockTracker || cls.wouldBlockCustom) blockable++;
            if (!slowest || e.duration > slowest.duration) slowest = e;
        }

        return { totalBytes, trackerCount, thirdCount, blockable, slowest, count: entries.length };
    }

    function renderSummary(summary, blockStats) {
        return `
            <div class="net-summary">
                <div class="net-stat"><span class="net-stat-val">${summary.count}</span><span class="net-stat-lbl">Requests</span></div>
                <div class="net-stat"><span class="net-stat-val">${formatBytes(summary.totalBytes)}</span><span class="net-stat-lbl">Transferred</span></div>
                <div class="net-stat"><span class="net-stat-val">${summary.trackerCount}</span><span class="net-stat-lbl">Trackers</span></div>
                <div class="net-stat"><span class="net-stat-val">${summary.thirdCount}</span><span class="net-stat-lbl">3rd-party</span></div>
                <div class="net-stat"><span class="net-stat-val">${summary.blockable}</span><span class="net-stat-lbl">Blockable</span></div>
                <div class="net-stat"><span class="net-stat-val">${blockStats?.count || 0}</span><span class="net-stat-lbl">DNR blocked</span></div>
            </div>`;
    }

    function renderNavigation(nav) {
        if (!nav) return "";
        return `
            <div class="panel panel-info mt-sm">
                <h3>Page load timing</h3>
                <div class="net-nav-grid">
                    <div><span class="text-dim">TTFB</span> ${formatMs(nav.ttfb)}</div>
                    <div><span class="text-dim">DOM ready</span> ${formatMs(nav.domContentLoaded)}</div>
                    <div><span class="text-dim">Load</span> ${formatMs(nav.loadEvent)}</div>
                    <div><span class="text-dim">DNS</span> ${formatMs(nav.dns)}</div>
                    <div><span class="text-dim">TCP</span> ${formatMs(nav.tcp)}</div>
                    <div><span class="text-dim">TLS</span> ${nav.tls ? formatMs(nav.tls) : "—"}</div>
                    <div><span class="text-dim">Protocol</span> ${esc(nav.protocol || "—")}</div>
                    <div><span class="text-dim">Doc size</span> ${formatBytes(nav.transferSize)}</div>
                </div>
            </div>`;
    }

    function renderConnection(pageConn, activeProfile, uiProfile) {
        const spoofed = activeProfile?.connection;
        const spoofEnabled = activeProfile?.spoof?.connection !== false && !!spoofed;
        const label = uiProfile?.connection || "—";

        function row(name, pageVal, profileVal) {
            const match = profileVal != null && String(pageVal) === String(profileVal);
            return `
                <tr>
                    <td>${esc(name)}</td>
                    <td class="text-mono">${esc(pageVal ?? "—")}</td>
                    <td class="text-mono">${esc(profileVal ?? "—")}</td>
                    <td>${profileVal == null ? "—" : match ? badgeClass("first", "Match") : badgeClass("tracker", "Mismatch")}</td>
                </tr>`;
        }

        return `
            <div class="panel panel-info mt-sm">
                <h3>NetworkInformation (navigator.connection)</h3>
                <p class="text-sm text-dim">Profile preset: <strong>${esc(label)}</strong>
                    · Spoof ${spoofEnabled ? "ON" : "OFF"}
                    <button type="button" class="btn-sm" data-net-action="jump-fingerprint" data-net-target="connection">Edit in Fingerprint ↑</button>
                    <button type="button" class="btn-sm" data-net-action="jump-fingerprint" data-net-target="blockWebRTC">WebRTC leak ↑</button>
                </p>
                <table class="net-table net-conn-table">
                    <thead><tr><th>Field</th><th>Page sees</th><th>Profile</th><th></th></tr></thead>
                    <tbody>
                        ${row("effectiveType", pageConn?.effectiveType, spoofed?.effectiveType)}
                        ${row("downlink (Mbps)", pageConn?.downlink, spoofed?.downlink)}
                        ${row("rtt (ms)", pageConn?.rtt, spoofed?.rtt)}
                        ${row("saveData", pageConn?.saveData, spoofed?.saveData ?? false)}
                    </tbody>
                </table>
            </div>`;
    }

    function renderPrivacyPanel(settings, customBlocks, blockStats, feedbackAvailable) {
        return `
            <div class="net-controls panel">
                <h3>Privacy &amp; blocking</h3>
                <label class="checkbox-inline">
                    <input type="checkbox" id="network-strip-referrer" ${settings.stripReferrer ? "checked" : ""}>
                    Strip Referer header (DNR)
                </label>
                <label class="checkbox-inline">
                    <input type="checkbox" id="network-block-trackers" ${settings.blockTrackers ? "checked" : ""}>
                    Block known trackers (<code>trackers.json</code>)
                </label>
                <label class="checkbox-inline">
                    <input type="checkbox" id="network-auto-refresh" ${autoRefresh ? "checked" : ""}>
                    Auto-refresh when tab finishes loading
                </label>
                <div class="row mt-sm">
                    <button type="button" id="network-refresh" class="success">↻ Refresh</button>
                    <button type="button" id="network-open-settings" class="btn-sm">Open Settings</button>
                </div>
                ${customBlocks.length ? `
                    <div class="mt-sm text-sm">
                        <span class="text-dim">Custom blocked domains (${customBlocks.length}):</span>
                        ${customBlocks.map((d) => `
                            <span class="tag">${esc(d)}
                                <button type="button" class="btn-sm" data-net-action="unblock" data-net-domain="${esc(d)}">×</button>
                            </span>`).join("")}
                    </div>` : ""}
                <div class="notice mt-sm">
                    Requests blocked by Snooper DNR never appear in Performance API.
                    ${feedbackAvailable
                        ? ` Block counter uses rule-match debug (${blockStats?.count || 0} this tab).`
                        : " Enable <code>declarativeNetRequestFeedback</code> (unpacked) for live block counts."}
                </div>
            </div>`;
    }

    function renderBlockLog(blockStats) {
        if (!blockStats?.recent?.length) return "";
        return `
            <details class="panel mt-sm">
                <summary class="text-sm text-accent">Recent DNR blocks (${blockStats.recent.length})</summary>
                <ul class="list-plain mt-sm">
                    ${blockStats.recent.map((r) => `
                        <li class="text-xs word-break">
                            <span class="text-faint">${new Date(r.ts).toLocaleTimeString()}</span>
                            rule #${r.ruleId} — ${esc(r.url)}
                        </li>`).join("")}
                </ul>
            </details>`;
    }

    function renderFilters(typeOptions) {
        return `
            <div class="filter-bar mt-sm">
                <input type="search" id="network-search" placeholder="Search URL or domain…" value="${esc(searchQuery)}">
                <select id="network-type-filter" class="select">
                    <option value="all" ${filterType === "all" ? "selected" : ""}>All types</option>
                    ${typeOptions.map((t) => `
                        <option value="${esc(t)}" ${filterType === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
                </select>
                <select id="network-party-filter" class="select">
                    <option value="all" ${filterParty === "all" ? "selected" : ""}>All parties</option>
                    <option value="first" ${filterParty === "first" ? "selected" : ""}>1st-party</option>
                    <option value="third" ${filterParty === "third" ? "selected" : ""}>3rd-party</option>
                    <option value="tracker" ${filterParty === "tracker" ? "selected" : ""}>Trackers</option>
                    <option value="blocked" ${filterParty === "blocked" ? "selected" : ""}>Blockable</option>
                </select>
                <select id="network-sort" class="select">
                    <option value="start-desc" ${sortBy === "start-desc" ? "selected" : ""}>Newest first</option>
                    <option value="start-asc" ${sortBy === "start-asc" ? "selected" : ""}>Oldest first</option>
                    <option value="size-desc" ${sortBy === "size-desc" ? "selected" : ""}>Largest</option>
                    <option value="size-asc" ${sortBy === "size-asc" ? "selected" : ""}>Smallest</option>
                    <option value="duration-desc" ${sortBy === "duration-desc" ? "selected" : ""}>Slowest</option>
                    <option value="duration-asc" ${sortBy === "duration-asc" ? "selected" : ""}>Fastest</option>
                    <option value="domain-asc" ${sortBy === "domain-asc" ? "selected" : ""}>Domain A–Z</option>
                </select>
            </div>`;
    }

    function renderEntryRow(e, idx) {
        const cls = e._cls;
        const shortUrl = e.name.length > 90 ? e.name.slice(0, 90) + "…" : e.name;
        const segs = timingSegments(e);

        return `
            <tr class="net-row ${cls.tracker ? "net-row-tracker" : cls.thirdParty ? "net-row-third" : ""}">
                <td class="net-col-domain">
                    <div class="font-bold">${esc(cls.host || "—")}</div>
                    <div class="text-xs text-dim word-break" title="${esc(e.name)}">${esc(shortUrl)}</div>
                    <div class="mt-xs">${renderBadges(cls)}</div>
                </td>
                <td>${esc(e.initiatorType || "—")}</td>
                <td>${esc(e.nextHopProtocol || "—")}</td>
                <td class="text-mono">${formatBytes(e.transferSize)}${cls.cached ? " <span class='text-faint'>(cache)</span>" : ""}</td>
                <td class="text-mono">${formatMs(e.duration)}</td>
                <td class="net-col-timing">
                    ${renderTimingBar(e)}
                    <div class="text-xs text-faint">DNS ${formatMs(segs.dns ? e.domainLookupEnd - e.domainLookupStart : 0)} · TTFB ${formatMs(Math.max(0, (e.responseStart || 0) - (e.requestStart || 0)))}</div>
                </td>
                <td class="net-col-actions">
                    <button type="button" class="btn-sm" data-net-action="copy" data-net-url="${esc(e.name)}" title="Copy URL">⎘</button>
                    <button type="button" class="btn-sm" data-net-action="open" data-net-url="${esc(e.name)}" title="Open">↗</button>
                    <button type="button" class="btn-sm btn-warn" data-net-action="block" data-net-domain="${esc(cls.host)}" title="Block domain">⊘</button>
                    <button type="button" class="btn-sm" data-net-action="jump-cookies" data-net-domain="${esc(cls.host)}" title="Cookies">🍪</button>
                </td>
            </tr>`;
    }

    function renderStatus() {
        if (!lastStatus) return "";
        const cls = lastStatus.ok ? "status ok" : "status err";
        return `<div class="${cls}">${esc(lastStatus.message)}</div>`;
    }

    function bindRuntimeListeners() {
        if (listenersBound) return;
        listenersBound = true;
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg?.type === "TAB_NAV_COMPLETE" && autoRefresh && msg.tabId === lastTabId) {
                window.render?.("network");
            }
        });
    }

    async function applyPrivacyToggles(partial) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, async (current) => {
                const next = { ...current, ...partial };
                chrome.runtime.sendMessage({ type: "SET_SETTINGS", settings: next }, resolve);
            });
        });
    }

    async function rerender() {
        if (typeof window.render === "function") await window.render("network");
    }

    async function handleAction(id, event) {
        const btn = event.target?.closest?.("button");
        const action = btn?.dataset?.netAction;

        if (action) {
            const url = btn.dataset.netUrl;
            const domain = btn.dataset.netDomain;
            const target = btn.dataset.netTarget;

            switch (action) {
                case "copy":
                    if (url) {
                        await navigator.clipboard.writeText(url);
                        lastStatus = { ok: true, message: "URL copied." };
                        await rerender();
                    }
                    return;
                case "open":
                    if (url) chrome.tabs.create({ url });
                    return;
                case "block":
                    if (domain) {
                        chrome.runtime.sendMessage({ type: "ADD_CUSTOM_BLOCK", domain }, async (res) => {
                            lastStatus = res?.ok
                                ? { ok: true, message: `Blocked ${domain}` }
                                : { ok: false, message: "Could not block domain." };
                            await rerender();
                        });
                    }
                    return;
                case "unblock":
                    if (domain) {
                        chrome.runtime.sendMessage({ type: "REMOVE_CUSTOM_BLOCK", domain }, async () => {
                            lastStatus = { ok: true, message: `Removed ${domain} from blocklist.` };
                            await rerender();
                        });
                    }
                    return;
                case "jump-cookies":
                    if (typeof CookiesModule?.setPrefillSearch === "function") {
                        CookiesModule.setPrefillSearch(domain || "");
                    }
                    window.render?.("cookies");
                    return;
                case "jump-fingerprint":
                    window.render?.("fingerprint");
                    setTimeout(() => {
                        const el = document.getElementById(target) || document.querySelector(`[name="${target}"]`);
                        el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
                        el?.classList?.add("leak-highlight");
                        setTimeout(() => el?.classList?.remove("leak-highlight"), 2000);
                    }, 150);
                    return;
                default:
                    break;
            }
        }

        switch (id) {
            case "network-refresh":
                await rerender();
                return;
            case "network-open-settings":
                window.render?.("settings");
                return;
            case "network-strip-referrer":
            case "network-block-trackers":
                await applyPrivacyToggles({
                    stripReferrer: document.getElementById("network-strip-referrer")?.checked ?? false,
                    blockTrackers: document.getElementById("network-block-trackers")?.checked ?? false
                });
                lastStatus = { ok: true, message: "Privacy rules updated." };
                await rerender();
                return;
            case "network-type-filter":
                filterType = event.target?.value || "all";
                await rerender();
                return;
            case "network-party-filter":
                filterParty = event.target?.value || "all";
                await rerender();
                return;
            case "network-sort":
                sortBy = event.target?.value || "start-desc";
                await rerender();
                return;
            case "network-auto-refresh":
                autoRefresh = event.target?.checked ?? false;
                await rerender();
                return;
            case "network-search":
                searchQuery = event.target?.value || "";
                await rerender();
                return;
            case "network-save-blocks": {
                const text = document.getElementById("network-custom-blocks")?.value || "";
                const domains = text.split("\n").map((d) => d.trim()).filter(Boolean);
                chrome.runtime.sendMessage({ type: "SET_CUSTOM_BLOCKS", domains }, async (res) => {
                    lastStatus = res?.ok
                        ? { ok: true, message: `Saved ${res.domains?.length || 0} custom block domains.` }
                        : { ok: false, message: "Save failed." };
                    await rerender();
                });
                return;
            }
            default:
                break;
        }
    }

    async function render() {
        bindRuntimeListeners();

        try {
            const tab = await getActiveTab();
            if (!tab?.id || !tab.url?.startsWith("http")) {
                return `
                    <h2>🌐 Network Inspector</h2>
                    <p class="text-dim">Open an http(s) tab to inspect resources.</p>`;
            }

            lastTabId = tab.id;
            const [pageData, ctx] = await Promise.all([
                getPageNetworkData(tab.id),
                fetchContext(tab.id)
            ]);

            if (!pageData) {
                return `
                    <h2>🌐 Network Inspector</h2>
                    <p class="error-state">Could not read page — try reloading the tab or check extension permissions.</p>
                    <button type="button" id="network-refresh">↻ Retry</button>`;
            }

            const entries = pageData.resources || [];
            const filtered = filterAndSort(entries, pageData.pageHost, ctx);
            const display = filtered.slice(0, 200);
            const summary = computeSummary(entries, pageData.pageHost, ctx);
            const typeOptions = [...new Set(entries.map((e) => e.initiatorType || "other"))].sort();

            log("Network entries:", entries.length, "filtered:", filtered.length);

            // #region agent log
            fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
                body: JSON.stringify({
                    sessionId: "6573a3",
                    location: "sidepanel/modules/network.js:render",
                    message: "Network inspector rendered",
                    data: {
                        entryCount: entries.length,
                        filteredCount: filtered.length,
                        trackerCount: summary.trackerCount,
                        blockStats: ctx.blockStats?.count || 0,
                        stripReferrer: ctx.settings?.stripReferrer,
                        blockTrackers: ctx.settings?.blockTrackers
                    },
                    timestamp: Date.now(),
                    hypothesisId: "NET-V2",
                    runId: "post-fix"
                })
            }).catch(() => {});
            // #endregion

            return `
                <h2>🌐 Network Inspector <span class="text-xs text-faint">v3.7</span></h2>
                ${renderStatus()}

                <div class="panel panel-dark text-sm word-break">
                    <strong>Active tab:</strong> ${esc(tab.title || tab.url)}
                    <div class="text-dim">${esc(tab.url)}</div>
                </div>

                ${renderPrivacyPanel(ctx.settings || {}, ctx.customBlocks || [], ctx.blockStats, ctx.feedbackAvailable)}
                ${renderSummary(summary, ctx.blockStats)}
                ${renderNavigation(pageData.navigation)}
                ${renderConnection(pageData.connection, ctx.activeProfile, ctx.uiProfile)}
                ${renderBlockLog(ctx.blockStats)}

                ${renderFilters(typeOptions)}

                <div class="panel mt-sm">
                    <h3>Resources <span class="text-dim text-sm">(${display.length}${filtered.length > display.length ? ` of ${filtered.length}` : ""}${entries.length !== filtered.length ? ` · ${entries.length} total` : ""})</span></h3>
                    ${display.length ? `
                        <table class="net-table">
                            <thead>
                                <tr>
                                    <th>Domain / URL</th>
                                    <th>Type</th>
                                    <th>Protocol</th>
                                    <th>Size</th>
                                    <th>Time</th>
                                    <th>Timing</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${display.map((e, i) => renderEntryRow(e, i)).join("")}
                            </tbody>
                        </table>` : `
                        <div class="empty-state">No resources match filters. Try refreshing the page.</div>`}
                    ${filtered.length > 200 ? `<p class="notice">Showing first 200 of ${filtered.length} matches.</p>` : ""}
                </div>

                <details class="panel mt-sm">
                    <summary class="text-sm text-accent">Custom block list (advanced)</summary>
                    <p class="text-xs text-dim">One domain per line — blocks all resource types via DNR.</p>
                    <textarea id="network-custom-blocks" class="json-field-textarea mt-sm" rows="4">${(ctx.customBlocks || []).join("\n")}</textarea>
                    <button type="button" id="network-save-blocks" class="success mt-sm">Save custom blocks</button>
                </details>

                <p class="notice-block">
                    Classification uses <code>trackers.json</code> and your custom block list.
                    WebRTC / IP leaks are mitigated separately —
                    <button type="button" class="btn-sm" data-net-action="jump-fingerprint" data-net-target="blockWebRTC">check Fingerprint ↑</button>
                </p>`;

        } catch (err) {
            console.error("[Network] render crash:", err);
            return `
                <h2>🌐 Network Inspector</h2>
                <p class="error-state">Failed to load network data</p>`;
        }
    }

    return { render, handleAction };

})();
