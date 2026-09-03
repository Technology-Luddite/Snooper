/********************************************************************
 * Extensions Module — installed extension privacy capability audit
 ********************************************************************/

const ExtensionsModule = (() => {

    let filterTier = "all";
    let filterScope = "all";
    let searchQuery = "";
    let showDisabled = true;
    let expandedId = null;

    function esc(str) {
        return String(str ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    async function getActiveTabUrl() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return tab?.url?.startsWith("http") ? tab.url : null;
        } catch (e) {
            return null;
        }
    }

    async function loadExtensions() {
        if (!chrome.management?.getAll) {
            return { ok: false, error: "management API unavailable — reload extension after granting permission." };
        }
        return new Promise((resolve) => {
            chrome.management.getAll((items) => {
                if (chrome.runtime.lastError) {
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                resolve({ ok: true, items: items || [] });
            });
        });
    }

    function filterList(analyzed) {
        return analyzed.filter((ext) => {
            if (!showDisabled && !ext.enabled) return false;
            if (filterTier !== "all" && ext.risk.tier !== filterTier) return false;
            if (filterScope === "tab" && ext.affectsCurrentTab !== true) return false;
            if (filterScope === "high" && !["high", "critical"].includes(ext.risk.tier)) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const hay = [
                    ext.name, ext.id, ext.description,
                    ...ext.permissions, ...ext.hostPermissions
                ].join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }

    function renderSummary(all, filtered, tabUrl) {
        const enabled = all.filter((e) => e.enabled).length;
        const critical = all.filter((e) => e.risk.tier === "critical").length;
        const high = all.filter((e) => e.risk.tier === "high").length;
        const onTab = tabUrl ? all.filter((e) => e.affectsCurrentTab).length : null;

        return `
            <div class="net-summary">
                <div class="net-stat"><span class="net-stat-val">${all.length}</span><span class="net-stat-lbl">Extensions</span></div>
                <div class="net-stat"><span class="net-stat-val">${enabled}</span><span class="net-stat-lbl">Enabled</span></div>
                <div class="net-stat"><span class="net-stat-val">${high + critical}</span><span class="net-stat-lbl">High+ risk</span></div>
                ${onTab != null ? `<div class="net-stat"><span class="net-stat-val">${onTab}</span><span class="net-stat-lbl">Can affect tab</span></div>` : ""}
                <div class="net-stat"><span class="net-stat-val">${filtered.length}</span><span class="net-stat-lbl">Shown</span></div>
            </div>`;
    }

    function capList(title, items, cls) {
        if (!items?.length) return "";
        return `
            <div class="ext-cap-block">
                <div class="ext-cap-title ${cls}">${esc(title)}</div>
                <ul class="list-plain">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
            </div>`;
    }

    function renderExtensionCard(ext) {
        const expanded = expandedId === ext.id;
        const tier = ext.risk.tier;
        const tierCls = ExtensionAuditor.tierClass(tier);
        const selfBadge = ext.isSelf ? `<span class="net-badge net-badge-first">This extension</span>` : "";
        const enabledBadge = ext.enabled
            ? `<span class="net-badge net-badge-first">Enabled</span>`
            : `<span class="net-badge net-badge-cache">Disabled</span>`;
        const tabBadge = ext.affectsCurrentTab === true
            ? `<span class="net-badge net-badge-tracker">Affects current tab</span>`
            : ext.affectsCurrentTab === false
                ? `<span class="net-badge net-badge-cache">Not on this tab</span>`
                : "";

        const installNote = ext.installType === "development"
            ? `<span class="net-badge net-badge-blocked">Unpacked / dev</span>`
            : ext.installType === "sideload"
                ? `<span class="net-badge net-badge-blocked">Sideloaded</span>`
                : "";

        const permTags = ext.permissions.slice(0, 8).map((p) =>
            `<span class="tag text-xs">${esc(p)}</span>`).join("");
        const morePerms = ext.permissions.length > 8
            ? `<span class="text-faint text-xs">+${ext.permissions.length - 8} more</span>` : "";

        const hostLine = esc(ext.risk.hostInfo.summary);
        const details = expanded ? `
            <div class="ext-details mt-sm">
                ${capList("Can collect / observe", ext.capabilities.collect, "text-warn")}
                ${capList("Can store", ext.capabilities.store, "text-accent")}
                ${capList("Could potentially send / exfiltrate", ext.capabilities.send, "text-error")}
                <div class="ext-cap-block">
                    <div class="ext-cap-title text-dim">Host access</div>
                    ${ext.hostPermissions.length ? `
                        <ul class="list-plain text-xs text-mono">
                            ${ext.hostPermissions.slice(0, 12).map((h) => `<li>${esc(h)}</li>`).join("")}
                            ${ext.hostPermissions.length > 12 ? `<li class="text-faint">… +${ext.hostPermissions.length - 12} more</li>` : ""}
                        </ul>` : `<p class="text-sm text-dim">No host permissions declared.</p>`}
                </div>
                <div class="row mt-sm">
                    <button type="button" class="btn-sm" data-ext-action="open-chrome" data-ext-id="${esc(ext.id)}">Open in Chrome extensions</button>
                </div>
            </div>` : "";

        return `
            <div class="ext-card ${tierCls} ${ext.isSelf ? "ext-card-self" : ""}">
                <div class="ext-card-header">
                    <div>
                        <div class="font-bold">${esc(ext.name)} <span class="text-faint text-xs">v${esc(ext.version)}</span></div>
                        <div class="text-xs text-dim text-mono">${esc(ext.id)}</div>
                        <div class="mt-xs">
                            <span class="ext-tier-badge ${tierCls}">${esc(ExtensionAuditor.tierLabel(tier))} risk</span>
                            ${selfBadge} ${enabledBadge} ${tabBadge} ${installNote}
                        </div>
                    </div>
                    <div class="ext-score text-mono" title="Capability score (higher = broader access)">${ext.risk.score}</div>
                </div>
                ${ext.description ? `<p class="text-sm text-muted mt-xs">${esc(ext.description.slice(0, 200))}${ext.description.length > 200 ? "…" : ""}</p>` : ""}
                <div class="text-xs text-dim mt-xs">${hostLine}</div>
                <div class="mt-xs flex flex-wrap gap-sm">${permTags}${morePerms}</div>
                <button type="button" class="btn-sm mt-sm" data-ext-action="toggle" data-ext-id="${esc(ext.id)}">
                    ${expanded ? "Hide details" : "Show capabilities"}
                </button>
                ${details}
            </div>`;
    }

    async function rerender() {
        if (typeof window.render === "function") await window.render("extensions");
    }

    async function handleAction(id, event) {
        const btn = event.target?.closest?.("button");
        const action = btn?.dataset?.extAction;
        const extId = btn?.dataset?.extId;

        if (action === "toggle" && extId) {
            expandedId = expandedId === extId ? null : extId;
            await rerender();
            return;
        }
        if (action === "open-chrome" && extId) {
            chrome.tabs.create({ url: `chrome://extensions/?id=${extId}` });
            return;
        }

        switch (id) {
            case "extensions-refresh":
                await rerender();
                return;
            case "extensions-tier-filter":
                filterTier = event.target?.value || "all";
                await rerender();
                return;
            case "extensions-scope-filter":
                filterScope = event.target?.value || "all";
                await rerender();
                return;
            case "extensions-show-disabled":
                showDisabled = event.target?.checked ?? true;
                await rerender();
                return;
            case "extensions-search":
                searchQuery = event.target?.value || "";
                await rerender();
                return;
            default:
                break;
        }
    }

    async function render() {
        try {
            const tabUrl = await getActiveTabUrl();
            const loaded = await loadExtensions();

            if (!loaded.ok) {
                return `
                    <h2>🧩 Extensions</h2>
                    <p class="error-state">${esc(loaded.error)}</p>
                    <button type="button" id="extensions-refresh">↻ Retry</button>`;
            }

            const analyzed = ExtensionAuditor.analyzeAll(loaded.items, {
                tabUrl,
                selfId: chrome.runtime.id
            });
            const filtered = filterList(analyzed);

            // #region agent log
            fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
                body: JSON.stringify({
                    sessionId: "6573a3",
                    location: "extensions.js:render",
                    message: "Extension audit rendered",
                    data: {
                        total: analyzed.length,
                        filtered: filtered.length,
                        highPlus: analyzed.filter((e) => ["high", "critical"].includes(e.risk.tier)).length,
                        tabUrl: tabUrl ? "yes" : "no"
                    },
                    timestamp: Date.now(),
                    hypothesisId: "EXT-AUDIT",
                    runId: "v3.8.0"
                })
            }).catch(() => {});
            // #endregion

            return `
                <h2>🧩 Extension privacy audit <span class="text-xs text-faint">v3.8</span></h2>

                <div class="panel panel-warn">
                    <p class="text-sm mb-sm"><strong>Capability audit only</strong> — shows what Chrome authorized each extension to do, not live spying or network activity.</p>
                    ${tabUrl ? `<p class="text-xs text-dim">Current tab: ${esc(tabUrl)}</p>` : `<p class="text-xs text-dim">Open an http(s) tab to see which extensions can affect it.</p>`}
                </div>

                ${renderSummary(analyzed, filtered, tabUrl)}

                <div class="filter-bar mt-sm">
                    <input type="search" id="extensions-search" placeholder="Search name, permission…" value="${esc(searchQuery)}">
                    <select id="extensions-tier-filter" class="select">
                        <option value="all" ${filterTier === "all" ? "selected" : ""}>All risk levels</option>
                        <option value="critical" ${filterTier === "critical" ? "selected" : ""}>Critical</option>
                        <option value="high" ${filterTier === "high" ? "selected" : ""}>High</option>
                        <option value="medium" ${filterTier === "medium" ? "selected" : ""}>Medium</option>
                        <option value="low" ${filterTier === "low" ? "selected" : ""}>Low</option>
                    </select>
                    <select id="extensions-scope-filter" class="select">
                        <option value="all" ${filterScope === "all" ? "selected" : ""}>All extensions</option>
                        <option value="high" ${filterScope === "high" ? "selected" : ""}>High+ risk only</option>
                        <option value="tab" ${filterScope === "tab" ? "selected" : ""}>Affects current tab</option>
                    </select>
                    <button type="button" id="extensions-refresh" class="success">↻ Refresh</button>
                </div>
                <label class="checkbox-inline text-sm">
                    <input type="checkbox" id="extensions-show-disabled" ${showDisabled ? "checked" : ""}>
                    Show disabled extensions
                </label>

                <div class="ext-list mt-sm">
                    ${filtered.length
                        ? filtered.map(renderExtensionCard).join("")
                        : `<div class="empty-state">No extensions match filters.</div>`}
                </div>

                <p class="notice-block">
                    Risk score is computed from host access breadth and sensitive permissions (cookies, history, debugger, etc.).
                    Disable suspicious extensions via Chrome’s extension page.
                </p>`;

        } catch (err) {
            console.error("[Extensions] render crash:", err);
            return `
                <h2>🧩 Extensions</h2>
                <p class="error-state">Failed to load extension audit</p>`;
        }
    }

    return { render, handleAction };

})();
