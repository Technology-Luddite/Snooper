/********************************************************************
 * Snooper Admin Hub — persistence, toggles, status, limits
 ********************************************************************/

const HubModule = (() => {

    let limits = [];

    function esc(s) {
        return String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    }

    function row(label, value) {
        return `
            <div class="kv-row">
                <div class="kv-label">${esc(label)}</div>
                <div class="kv-value">${esc(value)}</div>
            </div>`;
    }

    async function loadLimits() {
        try {
            limits = await JsonConfigStore.load("limits.json");
        } catch (e) {
            limits = [];
        }
    }

    function getStatus() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "GET_PERSISTENCE_STATUS" }, (res) => {
                resolve(res || { error: chrome.runtime.lastError?.message });
            });
        });
    }

    function renderThemeToggle(theme) {
        const isLight = theme === "light";
        return `
            <div class="theme-row">
                <div class="theme-row-label">
                    <strong>Appearance</strong>
                    <span class="theme-row-hint">Light or dark UI — saved automatically</span>
                </div>
                <div class="theme-switch-wrap">
                    <span class="theme-mode-label ${!isLight ? "active" : ""}">Dark</span>
                    <label class="theme-switch" title="Toggle light/dark mode">
                        <input type="checkbox" id="theme-light" ${isLight ? "checked" : ""}>
                        <span class="theme-slider"></span>
                    </label>
                    <span class="theme-mode-label ${isLight ? "active" : ""}">Light</span>
                </div>
            </div>`;
    }

    function renderUI(status, tabProbe) {
        const s = status?.settings || {};
        const on = s.spoofEnabled !== false;
        const rotationOn = s.perSiteRotation === true;
        const rotationControlsOn = on && rotationOn;
        const langMode = s.rotationLanguageMode === "random" ? "random" : "default";
        const hasProfile = status?.hasActiveProfile;
        const theme = s.theme === "light" ? "light" : "dark";

        return `
            <h2>⚙️ Admin</h2>
            <p class="text-sm text-dim mb-sm">
                Profiles persist in <code>chrome.storage.local</code> — survives browser close and reboot.
            </p>

            <div class="panel panel-dark">
                <h3>Global controls</h3>

                ${renderThemeToggle(theme)}

                <label class="checkbox-inline">
                    <input type="checkbox" id="spoofEnabled" ${on ? "checked" : ""}>
                    <span><strong>Spoofing enabled</strong> (master switch)</span>
                </label>

                <label class="checkbox-inline ${on ? "" : "is-disabled"}" id="perSiteRotation-label">
                    <input type="checkbox" id="perSiteRotation" ${rotationOn ? "checked" : ""} ${on ? "" : "disabled"}>
                    <span>
                        <strong>Per-site session rotation</strong>
                        <span class="text-xs text-dim block">Each domain gets a unique fingerprint from a pool of personas. Refreshing picks a new one; in-site links keep the current one.</span>
                    </span>
                </label>

                <div class="rotation-lang-row ${rotationControlsOn ? "" : "is-disabled"}" id="rotationLanguageMode-row">
                    <label class="rotation-lang-label" for="rotationLanguageMode">Rotation language</label>
                    <select id="rotationLanguageMode" class="select-sm" ${rotationControlsOn ? "" : "disabled"}>
                        <option value="default" ${langMode !== "random" ? "selected" : ""}>Default (from Fingerprint profile)</option>
                        <option value="random" ${langMode === "random" ? "selected" : ""}>Randomize per persona</option>
                    </select>
                    <span class="text-xs text-dim">Default keeps sites in your chosen language; random matches each persona locale.</span>
                </div>

                <label class="checkbox-inline">
                    <input type="checkbox" id="autoApplyOnStartup" ${s.autoApplyOnStartup !== false ? "checked" : ""}>
                    <span>Auto-apply saved profile on browser startup</span>
                </label>

                <div class="admin-actions">
                    <button id="admin-save" type="button">Save settings</button>
                    <button id="admin-reapply" type="button">Re-apply profile now</button>
                </div>
            </div>

            <div class="panel">
                <h3 class="text-success">Persistence status</h3>
                ${row("Extension version", chrome.runtime.getManifest().version)}
                ${row("UI theme", theme === "light" ? "Light" : "Dark")}
                ${row("Spoofing", on ? "🟢 ON" : "🔴 OFF")}
                ${rotationControlsOn ? row("Rotation language", langMode === "random" ? "Random per persona" : `Default (${status?.profileSummary?.language || "en-US"})`) : ""}
                ${rotationControlsOn ? row("Rotation mode", `🔄 ON — ${status?.rotation?.poolSize || 0} personas, ${status?.rotation?.assignedDomains ?? 0} domains this session`) : ""}
                ${row("Saved profile on disk", hasProfile ? "Yes" : "No — configure Fingerprint tab and Save")}
                ${row("Last applied", s.lastAppliedAt || "Never")}
                ${row("Last browser preset", s.lastBrowserLabel || "—")}
                ${row("Active saved profile", s.activeProfileName || "—")}
                ${status?.profileSummary ? row("Active UA", status.profileSummary.userAgent) : ""}
                ${status?.profileSummary ? row("Active platform", status.profileSummary.platform) : ""}
                ${status?.profileSummary ? row("Active language", status.profileSummary.language) : ""}
            </div>

            <div class="panel">
                <h3>Active tab snapshot</h3>
                <pre class="pre-compact">${esc(JSON.stringify(tabProbe, null, 2))}</pre>
            </div>

            <div class="panel panel-error">
                <h3 class="text-error">Truly cannot be spoofed (extension scope)</h3>
                <ul class="list-plain">
                    ${limits.filter(l => l.status === "impossible").map(l => `<li><strong>${esc(l.label)}</strong> — ${esc(l.workaround || l.reason)}</li>`).join("")}
                </ul>
            </div>

            <div class="panel panel-warn">
                <h3 class="text-warn">Partially mitigated — controls on Fingerprint tab</h3>
                <ul class="list-plain">
                    ${limits.filter(l => l.status === "partial" || l.status === "mitigated").map(l => `<li><strong>${esc(l.label)}</strong> — ${esc(l.reason)}</li>`).join("")}
                </ul>
            </div>

            <div class="panel panel-success">
                <h3 class="text-success">Implemented spoof surface</h3>
                <p class="text-sm text-muted" style="margin:0;line-height:1.6;">
                    Navigator (UA, platform, vendor, productSub, oscpu, language, languages, memory, cores, touch, webdriver, pdfViewer, DNT, GPC, userAgentData),
                    HTTP headers (UA, Accept-Language, sec-ch-ua*, Sec-GPC, DNT), Screen & Window (incl. screenX/Y, visualViewport, DPR),
                    Intl locale & timezone, Date offset, matchMedia, NetworkInformation, Canvas, WebGL, AudioContext,
                    Geolocation API, WebRTC IP block (privacy policy), Font enumeration (document.fonts),
                    Worker navigator bootstrap (same-origin dedicated workers).
                </p>
            </div>`;
    }

    async function handleAction(id, event) {
        if (id === "theme-light" || id === "theme-toggle") {
            const isLight = event.target?.checked === true;
            await Theme.set(isLight ? "light" : "dark");
            if (typeof window.render === "function") await window.render("hub");
            return;
        }

        if (id === "admin-save") {
            const spoofOn = document.getElementById("spoofEnabled")?.checked ?? true;
            const rotationOn = spoofOn && (document.getElementById("perSiteRotation")?.checked === true);
            const settings = {
                spoofEnabled: spoofOn,
                autoApplyOnStartup: document.getElementById("autoApplyOnStartup")?.checked ?? true,
                perSiteRotation: rotationOn,
                rotationLanguageMode: rotationOn
                    ? (document.getElementById("rotationLanguageMode")?.value || "default")
                    : "default"
            };
            await new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: "SET_SETTINGS", settings }, resolve);
            });
            if (typeof window.render === "function") await window.render("hub");
            return;
        }

        if (id === "admin-reapply") {
            await new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: "PROFILE_UPDATED" }, resolve);
            });
            if (typeof window.render === "function") await window.render("hub");
        }
    }

    async function render() {
        await loadLimits();
        const [status, tabProbe] = await Promise.all([
            getStatus(),
            typeof TabProbe !== "undefined" ? TabProbe.readActiveTab() : { note: "Open an http tab" }
        ]);
        return renderUI(status, tabProbe);
    }

    return { render, handleAction };

})();
