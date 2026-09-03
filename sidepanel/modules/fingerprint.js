/********************************************************************
 * Snooper Fingerprint Module v7
 * Multi-profile CRUD + full spoof control + tab-live probe
 ********************************************************************/

const FingerprintModule = (() => {

    const STORAGE_KEY = "snooper_fingerprint_profile";

    let lastStatus = null;

    let state = ProfileStore.defaultState();
    let savedProfiles = [];
    let activeProfileId = null;
    let selectedProfileId = null;
    let fontProfiles = {};

    let profiles = {
        screen: [],
        timezone: [],
        browser: [],
        webgl: [],
        geolocation: [],
        connection: [],
        legacyDevice: []
    };

    let hardwareOptions = {
        cpuCores: [],
        deviceMemoryGb: [],
        touchPoints: []
    };

    let raw = { languages: [], platforms: [] };
    let limits = [];

    function log(...args) {
        console.log("[Fingerprint]", ...args);
    }

    function esc(s) {
        return String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function isToggleActive(toggleId, st) {
        if (!toggleId) return null;
        switch (toggleId) {
            case "blockWebRTC": return st.blockWebRTC === true;
            case "spoofFonts": return st.spoofFonts !== false;
            case "spoofWorkers": return st.spoofWorkers !== false;
            case "spoofWebgl": return st.spoofWebgl !== false;
            case "spoofMatchMedia": return st.spoofMatchMedia !== false;
            default: return false;
        }
    }

    function renderLeakCoverage(st) {
        if (!limits?.length) return "";

        const rows = limits.map(l => {
            const active = l.toggle ? isToggleActive(l.toggle, st) : null;
            let badge = "";
            let control = "";

            if (l.status === "impossible") {
                badge = `<span class="leak-badge leak-no">Not spoofable</span>`;
                control = l.workaround
                    ? `<span class="text-xs text-dim">${esc(l.workaround)}</span>`
                    : "";
            } else if (l.status === "mitigated") {
                badge = active
                    ? `<span class="leak-badge leak-yes">Mitigated</span>`
                    : `<span class="leak-badge leak-off">Off</span>`;
                if (l.toggle) {
                    control = `<button type="button" class="btn-sm" data-leak-jump="${esc(l.toggle)}" data-leak-enable="${active ? "0" : "1"}">${active ? "Jump to control ↑" : "Enable ↑"}</button>`;
                }
            } else {
                badge = active
                    ? `<span class="leak-badge leak-part">Partial (on)</span>`
                    : `<span class="leak-badge leak-off">Partial (off)</span>`;
                const parts = [];
                if (l.preset && st[l.preset]) {
                    parts.push(`<span class="text-xs text-success">Preset: ${esc(st[l.preset])}</span>`);
                }
                if (l.preset && !st[l.preset]) {
                    parts.push(`<button type="button" class="btn-sm" data-leak-jump="${esc(l.preset)}">Pick preset ↑</button>`);
                }
                if (l.toggle) {
                    parts.push(`<button type="button" class="btn-sm" data-leak-jump="${esc(l.toggle)}" data-leak-enable="${active ? "0" : "1"}">${active ? "Toggle ↑" : "Enable ↑"}</button>`);
                }
                control = parts.join(" ");
            }

            if (l.workaround && l.status !== "impossible") {
                control += `<div class="text-xs text-dim mt-xs">${esc(l.workaround)}</div>`;
            }

            return `
                <tr>
                    <td><strong>${esc(l.label)}</strong><br><span class="text-xs text-dim">${esc(l.reason)}</span></td>
                    <td>${badge}</td>
                    <td class="leak-control">${control}</td>
                </tr>`;
        }).join("");

        return `
            <div class="panel panel-dark mt-sm leak-coverage-panel">
                <h3>🛡 Leak coverage &amp; limits</h3>
                <p class="text-xs text-dim mb-sm">
                    Five of seven “cannot spoof” vectors have mitigations on this page.
                    Only <strong>IP geolocation</strong> and <strong>TLS/JA3</strong> are truly out of scope for extensions.
                </p>
                <table class="leak-table">
                    <thead><tr><th>Vector</th><th>Status</th><th>Control</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    async function loadAll() {
        [
            profiles.screen,
            profiles.timezone,
            profiles.browser,
            profiles.webgl,
            profiles.geolocation,
            profiles.connection,
            profiles.legacyDevice,
            raw.languages,
            raw.platforms,
            fontProfiles,
            limits,
            hardwareOptions.cpuCores,
            hardwareOptions.deviceMemoryGb,
            hardwareOptions.touchPoints
        ] = await Promise.all([
            JsonConfigStore.load("screenProfiles.json"),
            JsonConfigStore.load("timezoneProfiles.json"),
            JsonConfigStore.load("browserProfiles.json"),
            JsonConfigStore.load("webglProfiles.json"),
            JsonConfigStore.load("geolocationProfiles.json"),
            JsonConfigStore.load("connectionProfiles.json"),
            JsonConfigStore.load("deviceProfiles.json"),
            JsonConfigStore.load("languages.json"),
            JsonConfigStore.load("platforms.json"),
            JsonConfigStore.load("fontProfiles.json"),
            JsonConfigStore.load("limits.json"),
            JsonConfigStore.load("cpuCores.json"),
            JsonConfigStore.load("deviceMemoryGb.json"),
            JsonConfigStore.load("touchPoints.json")
        ]);
    }

    async function loadProfiles() {
        const { profiles: list, activeId } = await ProfileStore.list();
        savedProfiles = list;
        activeProfileId = activeId;

        if (!selectedProfileId || !list.find(p => p.id === selectedProfileId)) {
            selectedProfileId = activeId || list[0]?.id || null;
        }

        const viewId = selectedProfileId || activeProfileId;
        const entry = list.find(p => p.id === viewId);
        if (entry?.state) {
            state = ProfileBuilder.migrateState(
                { ...ProfileStore.defaultState(), ...entry.state },
                profiles.legacyDevice
            );
        } else {
            await new Promise((resolve) => {
                chrome.storage.local.get(STORAGE_KEY, (res) => {
                    state = ProfileBuilder.migrateState(
                        { ...ProfileStore.defaultState(), ...(res?.[STORAGE_KEY] || {}) },
                        profiles.legacyDevice
                    );
                    resolve();
                });
            });
        }

        // #region agent log
        fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
            body: JSON.stringify({
                sessionId: "6573a3",
                location: "sidepanel/modules/fingerprint.js:loadProfiles",
                message: "State loaded from storage",
                data: {
                    viewId,
                    activeProfileId,
                    selectedProfileId,
                    blockWebRTC: state.blockWebRTC,
                    globalPrivacyControl: state.globalPrivacyControl
                },
                timestamp: Date.now(),
                hypothesisId: "LOAD",
                runId: "privacy-v2"
            })
        }).catch(() => {});
        // #endregion
    }

    function renderStatusBanner() {
        if (!lastStatus) return "";
        const s = lastStatus;
        const ok = s.blockWebRTC && s.gpc;
        const cls = ok ? "status ok" : "status warn";
        return `
            <div class="${cls} text-sm">
                Last apply: WebRTC block=${s.blockWebRTC ? "ON" : "OFF"},
                GPC=${s.gpc ? "ON" : "OFF"},
                Stealth=${s.stealthMode ? "ON" : "OFF"}
                ${s.sw?.webrtc?.ok === false ? `<br>WebRTC policy error: ${s.sw.webrtc.reason || "unknown"}` : ""}
            </div>`;
    }

    async function handleAction(id, event) {
        try {
            switch (id) {
                case "profile-select-change": {
                    selectedProfileId = event.target.value;
                    const entry = savedProfiles.find(p => p.id === selectedProfileId);
                    if (entry?.state) {
                        state = { ...ProfileStore.defaultState(), ...entry.state };
                        await rerender();
                    }
                    break;
                }
                case "profile-switch":
                    if (selectedProfileId) {
                        await switchToProfile(selectedProfileId);
                        await rerender();
                    }
                    break;
                case "profile-new": {
                    const name = prompt("Profile name:", "New profile");
                    if (!name) break;
                    await persistAndApply(readFormState());
                    const created = await ProfileStore.create(name, state);
                    await switchToProfile(created.id);
                    await rerender();
                    break;
                }
                case "profile-rename": {
                    if (!selectedProfileId) break;
                    const entry = savedProfiles.find(p => p.id === selectedProfileId);
                    const name = prompt("Rename profile:", entry?.name || "");
                    if (!name) break;
                    await ProfileStore.update(selectedProfileId, { name });
                    await rerender();
                    break;
                }
                case "profile-duplicate": {
                    if (!selectedProfileId) break;
                    const entry = savedProfiles.find(p => p.id === selectedProfileId);
                    const name = prompt("Duplicate as:", `${entry?.name || "Profile"} copy`);
                    if (!name) break;
                    await ProfileStore.create(name, entry?.state || readFormState());
                    await rerender();
                    break;
                }
                case "profile-delete": {
                    if (!selectedProfileId) break;
                    const entry = savedProfiles.find(p => p.id === selectedProfileId);
                    if (!confirm(`Delete profile "${entry?.name}"?`)) break;
                    const result = await ProfileStore.remove(selectedProfileId);
                    selectedProfileId = result.activeId;
                    activeProfileId = result.activeId;
                    const active = result.profiles.find(p => p.id === result.activeId);
                    if (active) state = { ...ProfileStore.defaultState(), ...active.state };
                    await applyActiveProfile();
                    await rerender();
                    break;
                }
                case "save":
                    await persistAndApply(readFormState());
                    await rerender();
                    break;
                case "reset":
                    state = ProfileStore.defaultState();
                    saveState();
                    await rerender();
                    break;
                case "stealth-preset":
                    await persistAndApply(applyStealthToState(readFormState()));
                    await rerender();
                    break;
                case "refresh-probe":
                    await rerender();
                    break;
                case "leak-jump": {
                    const targetId = event.target?.dataset?.leakJump;
                    const shouldEnable = event.target?.dataset?.leakEnable === "1";
                    const el = document.getElementById(targetId);
                    if (!el) break;
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    const wrap = el.closest("label") || el.closest(".field-group") || el;
                    wrap.classList.add("leak-highlight");
                    setTimeout(() => wrap.classList.remove("leak-highlight"), 2500);
                    if (shouldEnable && el.type === "checkbox" && !el.checked) {
                        el.checked = true;
                        await rerender();
                    }
                    return;
                }
            }
        } catch (err) {
            lastStatus = { ok: false, error: String(err) };
            console.error("[Fingerprint] action error:", id, err);
            await rerender();
        }
    }

    function getRealFallback() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory,
            screen: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }

    function saveState() {
        chrome.storage.local.set({ [STORAGE_KEY]: state });
    }

    function readFormState() {
        const get = id => document.getElementById(id);
        return {
            screen: get("screen")?.value || null,
            hardwareConcurrency: get("hardwareConcurrency")?.value || null,
            deviceMemory: get("deviceMemory")?.value || null,
            maxTouchPoints: get("maxTouchPoints")?.value || null,
            connection: get("connection")?.value || null,
            device: null,
            timezone: get("timezone")?.value || null,
            browser: get("browser")?.value || null,
            webgl: get("webgl")?.value || null,
            geolocation: get("geolocation")?.value || null,
            language: get("language")?.value || null,
            platform: get("platform")?.value || null,
            spoofCanvas: get("spoofCanvas")?.checked ?? true,
            spoofWebgl: get("spoofWebgl")?.checked ?? true,
            spoofAudio: get("spoofAudio")?.checked ?? false,
            spoofMatchMedia: get("spoofMatchMedia")?.checked ?? true,
            spoofConnection: get("spoofConnection")?.checked ?? true,
            spoofGeolocation: get("spoofGeolocation")?.checked ?? true,
            spoofPrivacy: get("spoofPrivacy")?.checked ?? true,
            spoofFonts: get("spoofFonts")?.checked ?? true,
            spoofWorkers: get("spoofWorkers")?.checked ?? true,
            blockWebRTC: get("blockWebRTC")?.checked ?? false,
            globalPrivacyControl: get("globalPrivacyControl")?.checked === true,
            doNotTrack: (() => {
                const dnt = get("doNotTrack")?.value;
                return dnt === "" ? null : dnt;
            })(),
            stealthMode: get("stealthMode")?.value === "1" || get("stealthMode")?.checked === true
        };
    }

    async function applyActiveProfile() {
        const built = ProfileBuilder.build(state, profiles, getRealFallback(), fontProfiles);
        await ProfileEngine.save(built);
        await ProfileStore.saveActiveState(state);
        await SettingsStore.markApplied({
            lastBrowserLabel: state.browser || "custom",
            activeProfileName: savedProfiles.find(p => p.id === activeProfileId)?.name
        });

        const swResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "PROFILE_UPDATED", profile: built }, (res) => {
                resolve(res || { error: chrome.runtime.lastError?.message });
            });
        });

        lastStatus = {
            ok: true,
            blockWebRTC: !!built.blockWebRTC,
            gpc: !!built.privacy?.globalPrivacyControl,
            stealthMode: !!built.stealthMode,
            sw: swResult
        };

        log("Profile applied", built, swResult);
        return built;
    }

    async function persistAndApply(formState) {
        state = formState;
        const profileId = selectedProfileId || activeProfileId;
        if (profileId) {
            await ProfileStore.update(profileId, { state });
            await ProfileStore.activate(profileId);
            activeProfileId = profileId;
            selectedProfileId = profileId;
        }
        saveState();
        await applyActiveProfile();

        // #region agent log
        fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
            body: JSON.stringify({
                sessionId: "6573a3",
                location: "sidepanel/modules/fingerprint.js:persistAndApply",
                message: "Saved privacy toggles",
                data: {
                    profileId,
                    screen: state.screen,
                    hardwareConcurrency: state.hardwareConcurrency,
                    deviceMemory: state.deviceMemory,
                    connection: state.connection,
                    blockWebRTC: state.blockWebRTC,
                    globalPrivacyControl: state.globalPrivacyControl,
                    stealthMode: state.stealthMode,
                    builtBlockWebRTC: ProfileBuilder.build(state, profiles, getRealFallback(), fontProfiles).blockWebRTC,
                    builtGpc: ProfileBuilder.build(state, profiles, getRealFallback(), fontProfiles).privacy?.globalPrivacyControl
                },
                timestamp: Date.now(),
                hypothesisId: "SAVE",
                runId: "privacy-v2"
            })
        }).catch(() => {});
        // #endregion
    }

    async function rerender() {
        if (typeof window.render === "function") {
            await window.render("fingerprint");
        }
    }

    async function switchToProfile(id) {
        const entry = await ProfileStore.activate(id);
        if (!entry) return;
        activeProfileId = id;
        selectedProfileId = id;
        state = { ...ProfileStore.defaultState(), ...entry.state };
        saveState();
        await applyActiveProfile();
    }

    function applyStealthToState(s) {
        return {
            ...s,
            spoofCanvas: true,
            spoofWebgl: true,
            spoofAudio: true,
            spoofMatchMedia: true,
            spoofConnection: true,
            spoofGeolocation: true,
            spoofPrivacy: true,
            spoofFonts: true,
            spoofWorkers: true,
            blockWebRTC: true,
            globalPrivacyControl: true,
            doNotTrack: "1",
            stealthMode: true
        };
    }

    function screenOptionLabel(p) {
        return `${p.width} × ${p.height} · ${p.colorDepth}-bit · ${p.devicePixelRatio}× DPR · ${p.mobile ? "Mobile" : "Desktop"}`;
    }

    function connectionOptionLabel(c) {
        return `${String(c.effectiveType).toUpperCase()} — ${c.downlink} Mbps · ${c.rtt} ms RTT`;
    }

    function selectScreen(id, label, items, value) {
        return `
            <div class="field-group mb-sm">
                <label class="field-label" for="${id}">${label}</label>
                <select id="${id}" class="select">
                    <option value="">— real screen —</option>
                    ${items.map(p => `<option value="${p.label}" ${p.label === value ? "selected" : ""}>${screenOptionLabel(p)}</option>`).join("")}
                </select>
            </div>`;
    }

    function selectNumberOption(id, label, items, value, unit = "") {
        return `
            <div class="field-group mb-sm">
                <label class="field-label" for="${id}">${label}</label>
                <select id="${id}" class="select">
                    <option value="">— default —</option>
                    ${items.map(v => `<option value="${v}" ${String(v) === String(value ?? "") ? "selected" : ""}>${v}${unit}</option>`).join("")}
                </select>
            </div>`;
    }

    function selectConnection(id, label, items, value) {
        return `
            <div class="field-group mb-sm">
                <label class="field-label" for="${id}">${label}</label>
                <select id="${id}" class="select">
                    <option value="">— default —</option>
                    ${items.map(c => `<option value="${c.label}" ${c.label === value ? "selected" : ""}>${connectionOptionLabel(c)}</option>`).join("")}
                </select>
            </div>`;
    }

    function select(id, label, items, value) {
        return `
            <div class="field-group mb-sm">
                <label class="field-label" for="${id}">${label}</label>
                <select id="${id}" class="select">
                    <option value="">-- default --</option>
                    ${items.map(v => `<option value="${v}" ${v === value ? "selected" : ""}>${v}</option>`).join("")}
                </select>
            </div>`;
    }

    function selectObj(id, label, items, selected) {
        return `
            <div class="field-group mb-sm">
                <label class="field-label" for="${id}">${label}</label>
                <select id="${id}" class="select">
                    <option value="">-- default --</option>
                    ${items.map(p => `<option value="${p.label}" ${p.label === selected ? "selected" : ""}>${p.label}</option>`).join("")}
                </select>
            </div>`;
    }

    function checkbox(id, label, checked) {
        return `
            <label class="checkbox-inline" for="${id}">
                <input type="checkbox" id="${id}" ${checked ? "checked" : ""}>${label}
            </label>`;
    }

    function renderProfileManager() {
        const activeEntry = savedProfiles.find(p => p.id === activeProfileId);
        const options = savedProfiles.map(p => {
            const active = p.id === activeProfileId ? " ● ACTIVE" : "";
            const sel = p.id === selectedProfileId ? "selected" : "";
            return `<option value="${p.id}" ${sel}>${p.name}${active}</option>`;
        }).join("");

        return `
            <div class="profile-manager">
                <h3>📁 Saved Profiles</h3>
                <div class="text-xs text-dim mb-sm">
                    Create named presets and switch instantly. Only one profile is active at a time.
                </div>
                <select id="profile-select" class="select mb-sm">
                    ${options || '<option value="">No profiles</option>'}
                </select>
                <div class="row mb-sm">
                    <button id="profile-switch" type="button" title="Switch to selected profile">Switch & Apply</button>
                    <button id="profile-new" type="button">+ New</button>
                    <button id="profile-rename" type="button">Rename</button>
                    <button id="profile-duplicate" type="button">Duplicate</button>
                    <button id="profile-delete" type="button" class="danger">Delete</button>
                </div>
                ${activeEntry ? `<div class="text-sm text-success">Active: <strong>${activeEntry.name}</strong></div>` : ""}
            </div>`;
    }

    function renderUI() {
        return `
            ${renderProfileManager()}
            <div class="panel">
                <h3>🛠 Fingerprint Control Panel</h3>

                ${selectScreen("screen", "Screen resolution", profiles.screen, state.screen)}

                <div class="text-xs text-dim mb-sm mt-sm">System hardware (navigator)</div>
                ${selectNumberOption("hardwareConcurrency", "CPU cores (hardwareConcurrency)", hardwareOptions.cpuCores, state.hardwareConcurrency, " cores")}
                ${selectNumberOption("deviceMemory", "Device memory (deviceMemory)", hardwareOptions.deviceMemoryGb, state.deviceMemory, " GB")}
                ${selectNumberOption("maxTouchPoints", "Touch points (maxTouchPoints)", hardwareOptions.touchPoints, state.maxTouchPoints, " points")}
                ${selectConnection("connection", "Network connection (NetworkInformation)", profiles.connection, state.connection)}

                ${selectObj("timezone", "Timezone", profiles.timezone, state.timezone)}
                ${selectObj("browser", "Browser", profiles.browser, state.browser)}
                ${selectObj("webgl", "WebGL GPU", profiles.webgl, state.webgl)}
                ${selectObj("geolocation", "📍 Browser location (GPS)", profiles.geolocation, state.geolocation)}

                <hr>
                ${select("language", "Language", raw.languages, state.language)}
                ${select("platform", "Platform override", raw.platforms, state.platform)}

                <hr>
                <div class="text-xs text-dim mb-sm">Anti-detection layers</div>
                ${checkbox("spoofCanvas", "Canvas + getImageData noise", state.spoofCanvas !== false)}
                ${checkbox("spoofWebgl", "WebGL vendor/renderer — mitigates GPU string probes (partial)", state.spoofWebgl !== false)}
                ${checkbox("spoofAudio", "AudioContext noise", !!state.spoofAudio)}
                ${checkbox("spoofMatchMedia", "matchMedia + viewport alignment — mitigates screen/window mismatch (partial)", state.spoofMatchMedia !== false)}
                ${checkbox("spoofConnection", "NetworkInformation (effectiveType/downlink/rtt)", state.spoofConnection !== false)}
                ${checkbox("spoofGeolocation", "Geolocation API (navigator.geolocation)", state.spoofGeolocation !== false)}
                ${checkbox("spoofFonts", "Font enumeration — mitigates layout font probes (partial)", state.spoofFonts !== false)}
                ${checkbox("spoofWorkers", "Worker navigator bootstrap — same-origin dedicated workers (partial)", state.spoofWorkers !== false)}
                ${checkbox("blockWebRTC", "Block WebRTC local IP leak — full mitigation via chrome.privacy", state.blockWebRTC === true)}
                ${checkbox("globalPrivacyControl", "Global Privacy Control (GPC + Sec-GPC header)", state.globalPrivacyControl === true)}

                <div class="field-group mt-sm">
                    <label class="field-label" for="doNotTrack">Do Not Track</label>
                    <select id="doNotTrack" class="select">
                        <option value="" ${state.doNotTrack == null || state.doNotTrack === "" ? "selected" : ""}>unspecified</option>
                        <option value="1" ${state.doNotTrack === "1" ? "selected" : ""}>1 (enabled)</option>
                        <option value="0" ${state.doNotTrack === "0" ? "selected" : ""}>0 (disabled)</option>
                    </select>
                </div>

                <div class="stealth-panel">
                    <div class="text-sm text-warn font-bold mb-sm">🛡 Ultimate Stealth</div>
                    <div class="text-xs text-dim mb-sm">All layers + GPC + DNT + WebRTC block + fonts + workers</div>
                    <button id="stealth-preset" type="button" class="btn-warn">Apply Ultimate Stealth Preset</button>
                    ${state.stealthMode ? '<span class="text-sm text-success ml-sm">Stealth active</span>' : ''}
                    <input type="hidden" id="stealthMode" value="${state.stealthMode ? "1" : "0"}">
                </div>

                <div class="row mt-sm">
                    <button id="save" type="button">Save & Apply</button>
                    <button id="reset" type="button">Reset form</button>
                    <button id="refresh-probe" type="button">Refresh Tab Probe</button>
                </div>
                ${renderStatusBanner()}
            </div>
            ${renderLeakCoverage(state)}`;
    }

    async function render() {
        await loadAll();
        await loadProfiles();

        const built = ProfileBuilder.build(state, profiles, getRealFallback(), fontProfiles);
        const tabLive = typeof TabProbe !== "undefined"
            ? await TabProbe.readActiveTab()
            : { error: "TabProbe not loaded" };

        return `
            <h2>🧬 Fingerprint Engine v7</h2>
            ${renderUI()}
            <div class="stack">
                <pre class="pre-live">🌐 TAB LIVE (active tab — what sites see)
${JSON.stringify(tabLive, null, 2)}</pre>
                <pre class="pre-profile">🧪 ACTIVE PROFILE (stored — applied on navigation)
${JSON.stringify(built, null, 2)}</pre>
            </div>
            <p class="notice-block">
                Saved profiles persist across browser restarts. See <strong>Leak coverage</strong> above for what is / isn't spoofable.
                IP geo and TLS require external tools (VPN/proxy).
            </p>`;
    }

    return { render, handleAction };

})();
