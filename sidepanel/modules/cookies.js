/********************************************************************
 * Snooper Cookies Module v3 — ROOT defaults + per-site overrides
 ********************************************************************/

const CookiesModule = (() => {

    let lastStatus = null;
    let filterMode = "all";
    let searchQuery = "";
    let ruleScope = "site";
    let draftSiteMode = null;
    let selectedSiteHostname = null;

    function esc(str) {
        return String(str ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    async function getActiveTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab || null;
    }

    function parseOrigin(url) {
        try {
            const u = new URL(url);
            if (!u.protocol.startsWith("http")) return null;
            return { origin: u.origin, hostname: u.hostname, url: u.href };
        } catch (e) {
            return null;
        }
    }

    function isThirdParty(cookie, pageHost) {
        if (!pageHost || !cookie.domain) return false;
        const cd = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
        return pageHost !== cd && !pageHost.endsWith("." + cd);
    }

    function fetchCookies(origin) {
        return new Promise((resolve) => {
            chrome.cookies.getAll({ url: origin }, (cookies) => {
                resolve(cookies || []);
            });
        });
    }

    function removeCookie(c) {
        const scheme = c.secure ? "https:" : "http:";
        const host = (c.domain || "").startsWith(".") ? c.domain.slice(1) : c.domain;
        const url = `${scheme}//${host}${c.path || "/"}`;
        return new Promise((resolve) => {
            chrome.cookies.remove({ url, name: c.name, storeId: c.storeId }, () => {
                resolve(!chrome.runtime.lastError);
            });
        });
    }

    async function clearFiltered(origin, hostname, mode) {
        const cookies = await fetchCookies(origin);
        let removed = 0;
        for (const c of cookies) {
            if (mode === "session" && !c.session) continue;
            if (mode === "persistent" && c.session) continue;
            if (mode === "thirdparty" && !isThirdParty(c, hostname)) continue;
            if (mode === "firstparty" && isThirdParty(c, hostname)) continue;
            if (await removeCookie(c)) removed++;
        }
        return { removed, total: cookies.length };
    }

    function formatExpiry(c) {
        if (c.session) return "Session";
        if (!c.expirationDate) return "—";
        return new Date(c.expirationDate * 1000).toLocaleString();
    }

    function filterCookies(cookies, hostname) {
        return cookies.filter(c => {
            if (filterMode === "session" && !c.session) return false;
            if (filterMode === "persistent" && c.session) return false;
            if (filterMode === "thirdparty" && !isThirdParty(c, hostname)) return false;
            if (filterMode === "firstparty" && isThirdParty(c, hostname)) return false;
            if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())
                && !(c.domain || "").toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        });
    }

    function readTabRulesFromForm() {
        const get = id => document.getElementById(id);
        return {
            clearOnTabClose: get("cookie-clear-on-tab-close")?.checked ?? false,
            clearSessionOnTabClose: get("cookie-clear-session-on-tab-close")?.checked ?? false,
            clearThirdPartyOnTabClose: get("cookie-clear-3p-on-tab-close")?.checked ?? false
        };
    }

    function readRootStartupFromForm() {
        return {
            clearOnBrowserStartup: document.getElementById("cookie-clear-on-startup")?.checked ?? false
        };
    }

    function isCustomSite(siteConfig) {
        return siteConfig?.mode === "custom";
    }

    function renderScopeBar(site, all) {
        const rootActive = ruleScope === "root" ? "active" : "";
        const siteActive = ruleScope === "site" ? "active" : "";
        const customSites = CookieSettingsStore.listCustomSites(all);

        return `
            <div class="cookie-scope-bar panel panel-info">
                <div class="text-xs text-dim mb-sm">Auto-clear rule scope — ROOT applies to all sites unless a site has custom rules</div>
                <div class="row">
                    <button id="cookie-scope-root" type="button" class="cookie-scope-btn ${rootActive}">🌐 ROOT (all sites)</button>
                    <button id="cookie-scope-site" type="button" class="cookie-scope-btn ${siteActive}" ${site ? "" : "disabled"}>
                        📍 ${site ? esc(site.hostname) : "No site tab"}
                    </button>
                </div>
                ${customSites.length ? `
                    <div class="mt-sm text-sm text-muted">
                        Sites with custom rules:
                        ${customSites.map(s => `
                            <span class="tag">${esc(s.hostname)}</span>`).join("")}
                    </div>` : ""}
            </div>`;
    }

    function renderRootRules(root, all) {
        const customSites = CookieSettingsStore.listCustomSites(all);

        return `
            <div class="cookie-controls">
                <h3>⚙️ ROOT — global auto-clear (all sites)</h3>
                <p class="text-sm text-dim">Default tab-close behavior for every site. Individual sites can override below.</p>

                <div class="text-sm text-accent mb-sm font-bold">On tab close (default for all sites)</div>
                <label><input type="checkbox" id="cookie-clear-on-tab-close" ${root.clearOnTabClose ? "checked" : ""}> Clear all site cookies when tab closes</label>
                <label><input type="checkbox" id="cookie-clear-session-on-tab-close" ${root.clearSessionOnTabClose ? "checked" : ""}> Clear session cookies when tab closes</label>
                <label><input type="checkbox" id="cookie-clear-3p-on-tab-close" ${root.clearThirdPartyOnTabClose ? "checked" : ""}> Clear third-party cookies when tab closes</label>

                <div class="text-sm text-accent mb-sm mt-sm font-bold">On browser startup (ROOT only)</div>
                <label><input type="checkbox" id="cookie-clear-on-startup" ${root.clearOnBrowserStartup ? "checked" : ""}> Clear watched domains on browser startup</label>
                <div class="row mt-sm">
                    <button id="cookie-add-startup-domain" type="button" class="success">+ Add domain to startup watch list</button>
                    <button id="cookie-save-rules" type="button" class="success">💾 Save ROOT rules</button>
                </div>
                ${root.startupDomains?.length ? `
                    <div class="mt-sm text-sm text-muted">
                        Startup watch list:
                        ${root.startupDomains.map(d => `
                            <span class="tag">
                                ${esc(d)}
                                <button type="button" class="btn-sm" data-cookie-remove-domain="${esc(d)}">×</button>
                            </span>`).join("")}
                    </div>` : ""}

                ${customSites.length ? `
                    <div class="mt-sm">
                        <div class="text-sm text-warn font-bold">Per-site overrides (${customSites.length})</div>
                        <ul class="list-plain">
                            ${customSites.map(s => `
                                <li>
                                    <strong>${esc(s.hostname)}</strong>
                                    — all=${s.rules.clearOnTabClose ? "ON" : "off"},
                                    session=${s.rules.clearSessionOnTabClose ? "ON" : "off"},
                                    3p=${s.rules.clearThirdPartyOnTabClose ? "ON" : "off"}
                                    <button type="button" class="btn-sm" data-cookie-edit-site="${esc(s.hostname)}">Edit</button>
                                    <button type="button" class="btn-sm danger" data-cookie-delete-site="${esc(s.hostname)}">Remove</button>
                                </li>`).join("")}
                        </ul>
                    </div>` : ""}
            </div>`;
    }

    function renderSiteRules(site, all, siteConfig, effective) {
        const custom = draftSiteMode
            ? draftSiteMode === "custom"
            : isCustomSite(siteConfig);
        const root = all.root;
        const rules = custom ? (siteConfig?.rules || root) : root;

        return `
            <div class="cookie-controls">
                <h3>⚙️ ${esc(site.hostname)} — site rules</h3>
                <p class="text-sm text-dim">
                    Effective:
                    <span class="text-success">${effective._scope === "site" ? "custom override" : "inheriting ROOT"}</span>
                </p>

                <div class="field-group mt-sm">
                    <label class="checkbox-inline">
                        <input type="radio" name="cookie-site-mode" value="inherit" ${!custom ? "checked" : ""}>
                        Inherit ROOT defaults
                    </label>
                    <label class="checkbox-inline">
                        <input type="radio" name="cookie-site-mode" value="custom" ${custom ? "checked" : ""}>
                        Custom rules for this site only
                    </label>
                </div>

                ${!custom ? `
                    <div class="panel panel-dark mt-sm text-sm">
                        <div class="text-dim mb-sm">Using ROOT values:</div>
                        <div>Clear all on tab close: <strong>${root.clearOnTabClose ? "ON" : "off"}</strong></div>
                        <div>Clear session on tab close: <strong>${root.clearSessionOnTabClose ? "ON" : "off"}</strong></div>
                        <div>Clear 3rd-party on tab close: <strong>${root.clearThirdPartyOnTabClose ? "ON" : "off"}</strong></div>
                    </div>
                    <button id="cookie-save-rules" type="button" class="success mt-sm">💾 Save (inherit ROOT)</button>
                ` : `
                    <div class="text-sm text-accent mb-sm mt-sm font-bold">Custom tab-close rules</div>
                    <label><input type="checkbox" id="cookie-clear-on-tab-close" ${rules.clearOnTabClose ? "checked" : ""}> Clear all site cookies when tab closes</label>
                    <label><input type="checkbox" id="cookie-clear-session-on-tab-close" ${rules.clearSessionOnTabClose ? "checked" : ""}> Clear session cookies when tab closes</label>
                    <label><input type="checkbox" id="cookie-clear-3p-on-tab-close" ${rules.clearThirdPartyOnTabClose ? "checked" : ""}> Clear third-party cookies when tab closes</label>
                    <div class="row mt-sm">
                        <button id="cookie-save-rules" type="button" class="success">💾 Save site rules</button>
                        <button id="cookie-reset-site" type="button">Revert to ROOT</button>
                    </div>
                `}

                <hr class="mt-sm">
                <div class="row">
                    <button id="cookie-delete-all" type="button" class="danger">🗑 Delete all (this site)</button>
                    <button id="cookie-delete-session" type="button" class="danger">Delete session</button>
                    <button id="cookie-delete-thirdparty" type="button" class="danger">Delete 3rd-party</button>
                    <button id="cookie-delete-firstparty" type="button" class="danger">Delete 1st-party</button>
                    <button id="cookie-refresh" type="button">↻ Refresh</button>
                </div>
            </div>`;
    }

    function renderFilters() {
        return `
            <div class="filter-bar">
                <select id="cookie-filter" class="select">
                    <option value="all" ${filterMode === "all" ? "selected" : ""}>All cookies</option>
                    <option value="session" ${filterMode === "session" ? "selected" : ""}>Session only</option>
                    <option value="persistent" ${filterMode === "persistent" ? "selected" : ""}>Persistent only</option>
                    <option value="firstparty" ${filterMode === "firstparty" ? "selected" : ""}>First-party</option>
                    <option value="thirdparty" ${filterMode === "thirdparty" ? "selected" : ""}>Third-party</option>
                </select>
                <input id="cookie-search" type="search" class="input" placeholder="Search by name or domain…" value="${esc(searchQuery)}">
            </div>`;
    }

    function renderStatus() {
        if (!lastStatus) return "";
        const cls = lastStatus.ok ? "cookie-status ok" : "cookie-status err";
        return `<div class="${cls}">${esc(lastStatus.message)}</div>`;
    }

    let lastRenderedCookies = [];

    function renderCookieList(cookies, hostname) {
        lastRenderedCookies = cookies;
        if (!cookies.length) {
            return `<div class="empty-state">No cookies match the current filter.</div>`;
        }

        return cookies.map((c, idx) => {
            const third = isThirdParty(c, hostname);
            const flags = [
                c.secure ? "Secure" : null,
                c.httpOnly ? "HttpOnly" : null,
                c.sameSite || null,
                c.session ? "Session" : "Persistent",
                third ? "3rd-party" : "1st-party"
            ].filter(Boolean).join(" · ");

            return `
                <div class="cookie-item ${third ? "third-party" : ""}">
                    <div class="cookie-item-header">
                        <div>
                            <div class="cookie-item-name">${esc(c.name)}</div>
                            <div class="cookie-item-meta">${esc(c.domain)} · ${esc(c.path)}</div>
                            <div class="cookie-item-meta text-faint">${esc(flags)} · Expires: ${esc(formatExpiry(c))}</div>
                        </div>
                        <button type="button" class="danger btn-sm" data-cookie-index="${idx}">Delete</button>
                    </div>
                    <div class="cookie-item-value">${esc(c.value?.length > 120 ? c.value.slice(0, 120) + "…" : c.value)}</div>
                </div>`;
        }).join("");
    }

    async function rerender() {
        if (typeof window.render === "function") await window.render("cookies");
    }

    function readSiteMode() {
        const checked = document.querySelector('input[name="cookie-site-mode"]:checked');
        return checked?.value === "custom" ? "custom" : "inherit";
    }

    async function handleAction(id, event) {
        // #region agent log
        fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
            body: JSON.stringify({
                sessionId: "6573a3",
                location: "sidepanel/modules/cookies.js:handleAction",
                message: "Cookie action",
                data: { id, ruleScope, target: event?.target?.id || event?.target?.tagName },
                timestamp: Date.now(),
                hypothesisId: "COOKIE-ROOT",
                runId: "v3.6.2"
            })
        }).catch(() => {});
        // #endregion

        const tab = await getActiveTab();
        const site = tab?.url ? parseOrigin(tab.url) : null;

        const rootOnly = [
            "cookie-scope-root", "cookie-save-rules", "cookie-add-startup-domain",
            "cookie-row-action"
        ];
        const needsSite = !rootOnly.includes(id)
            && id !== "cookie-refresh"
            && !id.startsWith("cookie-save")
            && event?.target?.dataset?.cookieRemoveDomain == null
            && event?.target?.dataset?.cookieDeleteSite == null
            && event?.target?.dataset?.cookieEditSite == null;

        if (!site && needsSite && ruleScope === "site") {
            if (id === "cookie-scope-site") {
                lastStatus = { ok: false, message: "Open an http(s) tab to edit site rules." };
                await rerender();
                return;
            }
            lastStatus = { ok: false, message: "No active http(s) tab." };
            await rerender();
            return;
        }

        try {
            if (id === "cookie-filter") {
                filterMode = event.target.value;
                await rerender();
                return;
            }
            if (id === "cookie-site-mode-change") {
                draftSiteMode = event.target.value;
                await rerender();
                return;
            }
            if (id === "cookie-search") {
                searchQuery = event.target.value || "";
                return;
            }
            if (id === "cookie-scope-root") {
                ruleScope = "root";
                selectedSiteHostname = null;
                await rerender();
                return;
            }
            if (id === "cookie-scope-site") {
                ruleScope = "site";
                selectedSiteHostname = null;
                await rerender();
                return;
            }
            if (event.target?.dataset?.cookieEditSite) {
                selectedSiteHostname = event.target.dataset.cookieEditSite;
                ruleScope = "site";
                draftSiteMode = "custom";
                await rerender();
                return;
            }
            if (event.target?.dataset?.cookieDeleteSite) {
                const hostname = event.target.dataset.cookieDeleteSite;
                if (!confirm(`Remove custom rules for ${hostname} and revert to ROOT?`)) return;
                await CookieSettingsStore.deleteSite(hostname);
                lastStatus = { ok: true, message: `${hostname} now inherits ROOT.` };
                await rerender();
                return;
            }
            if (event.target?.dataset?.cookieIndex != null) {
                const idx = parseInt(event.target.dataset.cookieIndex, 10);
                const c = lastRenderedCookies[idx];
                if (c && await removeCookie(c)) {
                    lastStatus = { ok: true, message: `Deleted cookie "${c.name}".` };
                } else {
                    lastStatus = { ok: false, message: "Failed to delete cookie." };
                }
                await rerender();
                return;
            }
            if (event.target?.dataset?.cookieRemoveDomain) {
                const domain = event.target.dataset.cookieRemoveDomain;
                const root = await CookieSettingsStore.getRoot();
                const startupDomains = (root.startupDomains || []).filter(d => d !== domain);
                await CookieSettingsStore.saveRoot({ startupDomains });
                lastStatus = { ok: true, message: `Removed ${domain} from startup watch list.` };
                await rerender();
                return;
            }

            switch (id) {
                case "cookie-delete-all": {
                    const r = await clearFiltered(site.origin, site.hostname, "all");
                    lastStatus = { ok: true, message: `Deleted ${r.removed} cookie(s) for this site.` };
                    break;
                }
                case "cookie-delete-session": {
                    const r = await clearFiltered(site.origin, site.hostname, "session");
                    lastStatus = { ok: true, message: `Deleted ${r.removed} session cookie(s).` };
                    break;
                }
                case "cookie-delete-thirdparty": {
                    const r = await clearFiltered(site.origin, site.hostname, "thirdparty");
                    lastStatus = { ok: true, message: `Deleted ${r.removed} third-party cookie(s).` };
                    break;
                }
                case "cookie-delete-firstparty": {
                    const r = await clearFiltered(site.origin, site.hostname, "firstparty");
                    lastStatus = { ok: true, message: `Deleted ${r.removed} first-party cookie(s).` };
                    break;
                }
                case "cookie-add-startup-domain": {
                    const domain = ruleScope === "root"
                        ? prompt("Domain to clear on browser startup:", site?.hostname || "example.com")
                        : site?.hostname;
                    if (!domain?.trim()) break;
                    const root = await CookieSettingsStore.getRoot();
                    const list = new Set(root.startupDomains || []);
                    list.add(domain.trim());
                    await CookieSettingsStore.saveRoot({
                        ...readTabRulesFromForm(),
                        ...readRootStartupFromForm(),
                        startupDomains: [...list]
                    });
                    lastStatus = { ok: true, message: `Added ${domain.trim()} to startup watch list.` };
                    break;
                }
                case "cookie-reset-site": {
                    const host = site?.hostname || selectedSiteHostname;
                    if (!host) break;
                    await CookieSettingsStore.deleteSite(host);
                    draftSiteMode = null;
                    lastStatus = { ok: true, message: `${host} reverted to ROOT defaults.` };
                    break;
                }
                case "cookie-save-rules": {
                    if (ruleScope === "root") {
                        const root = await CookieSettingsStore.getRoot();
                        await CookieSettingsStore.saveRoot({
                            ...readTabRulesFromForm(),
                            ...readRootStartupFromForm(),
                            startupDomains: root.startupDomains || []
                        });
                        lastStatus = { ok: true, message: "ROOT rules saved (applies to all inheriting sites)." };
                    } else {
                        const host = site?.hostname || selectedSiteHostname;
                        if (!host) break;
                        const mode = readSiteMode();
                        if (mode === "inherit") {
                            await CookieSettingsStore.deleteSite(host);
                            lastStatus = { ok: true, message: `${host} inherits ROOT.` };
                        } else {
                            await CookieSettingsStore.saveSite(host, {
                                mode: "custom",
                                rules: readTabRulesFromForm()
                            });
                            lastStatus = { ok: true, message: `Custom rules saved for ${host}.` };
                        }
                        draftSiteMode = null;
                    }
                    break;
                }
                case "cookie-refresh":
                    lastStatus = { ok: true, message: "Refreshed." };
                    break;
            }
            await rerender();
        } catch (err) {
            lastStatus = { ok: false, message: String(err) };
            await rerender();
        }
    }

    async function render() {
        const tab = await getActiveTab();
        const site = tab?.url ? parseOrigin(tab.url) : null;

        const all = await CookieSettingsStore.getAll();
        const ruleHost = ruleScope === "site" ? (site?.hostname || selectedSiteHostname) : null;
        const ruleSite = ruleHost ? { hostname: ruleHost, origin: site?.hostname === ruleHost ? site.origin : `https://${ruleHost}` } : null;
        const siteConfig = ruleHost ? await CookieSettingsStore.getSite(ruleHost) : null;
        const effective = ruleHost
            ? CookieSettingsStore.resolveForHost(all, ruleHost)
            : CookieSettingsStore.resolveForHost(all, null);

        const scopeBar = renderScopeBar(site, all);
        const rulesPanel = ruleScope === "root"
            ? renderRootRules(all.root, all)
            : ruleSite
                ? renderSiteRules(ruleSite, all, siteConfig, effective)
                : `<div class="cookie-controls"><p class="text-dim">Open an http(s) tab to edit per-site rules, or pick a site under ROOT overrides.</p></div>`;

        let cookieSection = "";
        if (site) {
            const cookies = await fetchCookies(site.origin);
            const filtered = filterCookies(cookies, site.hostname);
            const sessionCount = cookies.filter(c => c.session).length;
            const thirdCount = cookies.filter(c => isThirdParty(c, site.hostname)).length;

            cookieSection = `
                ${renderFilters()}
                <div class="text-sm text-dim mb-sm">Cookies for ${esc(site.hostname)} (${filtered.length} shown)</div>
                <div id="cookie-list">${renderCookieList(filtered, site.hostname)}</div>
                <div class="text-sm text-muted mt-sm">
                    ${esc(tab.title || site.hostname)} · Total: <strong>${cookies.length}</strong> · Session: <strong>${sessionCount}</strong> · 3rd-party: <strong>${thirdCount}</strong>
                </div>`;
        } else if (!tab?.url) {
            cookieSection = `<p class="text-dim mt-sm">No active tab — ROOT rules still editable above.</p>`;
        } else {
            cookieSection = `<p class="text-dim mt-sm">Active tab is not a web page.</p>`;
        }

        return `
            <h2>🍪 Cookie Manager <span class="text-xs text-faint">v3.6.2</span></h2>
            ${renderStatus()}
            ${scopeBar}
            ${rulesPanel}
            ${cookieSection}
            <p class="notice-block">
                ROOT sets defaults for every site. Switch to a site tab to override with custom tab-close rules.
                Startup watch list is ROOT-only.
            </p>`;
    }

    function setPrefillSearch(q) {
        searchQuery = q || "";
    }

    return { render, handleAction, setPrefillSearch };

})();
