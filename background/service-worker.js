/********************************************************************
 * Snooper Service Worker v3 — persistent spoof across browser restarts
 ********************************************************************/

importScripts("request-rules.js", "spoof-fn.js", "settings-store.js", "privacy-network.js", "../core/json-config-store.js", "../core/profile-builder.js", "../core/rotation-engine.js", "../core/cookie-settings-store.js", "../core/network-block-store.js", "privacy-rules.js", "network-stats.js", "cookie-manager.js");

const PROFILE_KEY = "snooper_active_profile";
const tabProfileCache = new Map();

function log(...args) {
    console.log("[Snooper SW]", ...args);
}

async function openPanel(tabId) {
    try {
        if (!tabId || !chrome.sidePanel) return;
        await chrome.sidePanel.open({ tabId });
    } catch (err) {
        console.error("[Snooper SW] openPanel error:", err);
    }
}

async function isPerSiteRotationEnabled() {
    const settings = await SettingsStore.get();
    return settings.perSiteRotation === true;
}

async function getStaticProfile() {
    const enabled = await SettingsStore.isSpoofEnabled();
    if (!enabled) return null;
    const data = await chrome.storage.local.get(PROFILE_KEY);
    return data?.[PROFILE_KEY] || null;
}

async function getProfile() {
    if (await isPerSiteRotationEnabled()) return null;
    return getStaticProfile();
}

async function getDefaultRotationLanguage() {
    const data = await chrome.storage.local.get([
        "snooper_fingerprint_profile",
        PROFILE_KEY
    ]);
    return data?.snooper_fingerprint_profile?.language
        || data?.[PROFILE_KEY]?.language
        || "en-US";
}

async function resolveTabProfile(url, options = {}) {
    const enabled = await SettingsStore.isSpoofEnabled();
    if (!enabled) return null;

    if (await isPerSiteRotationEnabled()) {
        const settings = await SettingsStore.get();
        const languageMode = settings.rotationLanguageMode === "random" ? "random" : "default";
        const defaultLanguage = await getDefaultRotationLanguage();
        return RotationEngine.getProfileForUrl(url, {
            ...options,
            languageMode,
            defaultLanguage
        });
    }
    return getStaticProfile();
}

async function registerMainWorldBootstrap() {
    const scriptId = "snooper-spoof-bootstrap";
    try {
        await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
    } catch (e) {}

    try {
        await chrome.scripting.registerContentScripts([{
            id: scriptId,
            matches: ["<all_urls>"],
            js: ["background/spoof-fn.js", "content/spoof-main-bootstrap.js"],
            runAt: "document_start",
            world: "MAIN",
            allFrames: true
        }]);
    } catch (err) {
        log("registerMainWorldBootstrap error:", err);
    }
}

async function applyTabSpoof(tabId, url, frameIds, options = {}) {
    const enabled = await SettingsStore.isSpoofEnabled();
    if (!enabled || !tabId || !url?.startsWith("http")) return null;

    const profile = await resolveTabProfile(url, options);
    if (!profile?.userAgent) {
        tabProfileCache.delete(tabId);
        return null;
    }

    tabProfileCache.set(tabId, { url, profile, ts: Date.now() });
    await injectSpoof(tabId, profile, frameIds);

    const mainFrame = !Array.isArray(frameIds) || frameIds.length === 0 || frameIds[0] === 0;
    if (mainFrame && await isPerSiteRotationEnabled()) {
        await applyProfileRules(profile);
        await applyWebRtcPolicy(!!profile.blockWebRTC);
    }

    return profile;
}

async function injectSpoof(tabId, profile, frameIds) {
    if (!profile?.userAgent || !tabId) return null;

    const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true };
    const opts = {
        target,
        world: "MAIN",
        func: applySnooperProfile,
        args: [profile]
    };

    try {
        opts.injectImmediately = true;
        const results = await chrome.scripting.executeScript(opts);
        return results?.[0]?.result || null;
    } catch (err) {
        if (String(err?.message || err).includes("injectImmediately")) {
            delete opts.injectImmediately;
            try {
                const results = await chrome.scripting.executeScript(opts);
                return results?.[0]?.result || null;
            } catch (err2) {
                log("injectSpoof retry error:", tabId, err2);
                return null;
            }
        }
        log("injectSpoof error:", tabId, err);
        return null;
    }
}

async function injectProfileAllTabs(profile) {
    if (!profile?.userAgent) return;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (!tab.id || !tab.url?.startsWith("http")) continue;
        await injectSpoof(tab.id, profile);
    }
}

async function injectRotationAllTabs() {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (!tab.id || !tab.url?.startsWith("http")) continue;
        const profile = await resolveTabProfile(tab.url);
        if (profile?.userAgent) await injectSpoof(tab.id, profile);
    }
}

async function clearSpoof() {
    await applyProfileRules(null);
    await applyWebRtcPolicy(false);
    log("Spoof cleared (disabled or no profile)");
}

async function syncPrivacyRules() {
    const settings = await SettingsStore.get();
    return applyPrivacyRules({
        stripReferrer: settings.stripReferrer === true,
        blockTrackers: settings.blockTrackers === true
    });
}

function profileHasEffect(p) {
    if (!p) return false;
    return !!(
        p.userAgent
        || p.blockWebRTC
        || p.privacy?.globalPrivacyControl
        || p.privacy?.doNotTrack === "1"
    );
}

async function syncProfile(profile) {
    const enabled = await SettingsStore.isSpoofEnabled();
    if (!enabled) {
        await clearSpoof();
        await syncPrivacyRules();
        return { ok: true, enabled: false };
    }

    const rotationOn = await isPerSiteRotationEnabled();

    if (rotationOn) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeUrl = tabs[0]?.url;
        const activeProfile = activeUrl?.startsWith("http")
            ? await resolveTabProfile(activeUrl)
            : null;

        if (activeProfile && profileHasEffect(activeProfile)) {
            await applyProfileRules(activeProfile);
            await applyWebRtcPolicy(!!activeProfile.blockWebRTC);
        } else {
            await applyProfileRules(null);
            await applyWebRtcPolicy(true);
        }

        await syncPrivacyRules();
        await injectRotationAllTabs();
        await SettingsStore.markApplied({ rotationMode: true });
        log("Rotation mode synced:", RotationEngine.getStats());
        return { ok: true, enabled: true, rotation: true };
    }

    const p = profile || (await chrome.storage.local.get(PROFILE_KEY))?.[PROFILE_KEY];
    if (!profileHasEffect(p)) {
        await clearSpoof();
        return { ok: true, enabled: true, profile: false };
    }

    await applyProfileRules(p);
    const webrtcResult = await applyWebRtcPolicy(!!p.blockWebRTC);
    await syncPrivacyRules();

    if (p.userAgent) {
        await injectProfileAllTabs(p);
    }

    await SettingsStore.markApplied();

    // #region agent log
    fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
        body: JSON.stringify({
            sessionId: "6573a3",
            location: "background/service-worker.js:syncProfile",
            message: "Profile synced",
            data: {
                blockWebRTC: !!p.blockWebRTC,
                gpc: p.privacy?.globalPrivacyControl,
                hasUA: !!p.userAgent,
                webrtcOk: webrtcResult?.ok,
                webrtcPolicy: webrtcResult?.policy,
                webrtcError: webrtcResult?.reason
            },
            timestamp: Date.now(),
            hypothesisId: "SYNC",
            runId: "privacy-v2"
        })
    }).catch(() => {});
    // #endregion

    log("Profile synced:", {
        ua: p.userAgent?.slice(0, 40),
        blockWebRTC: p.blockWebRTC,
        gpc: p.privacy?.globalPrivacyControl
    });
    return { ok: true, enabled: true, profile: true, webrtc: webrtcResult };
}

async function boot(reason) {
    log("Boot:", reason);
    RotationEngine.initSession();
    const settings = await SettingsStore.get();
    const manifest = chrome.runtime.getManifest();

    if (!settings.installedVersion) {
        await SettingsStore.set({
            installedVersion: manifest.version,
            spoofEnabled: true,
            autoApplyOnStartup: true
        });
    }

    await syncPrivacyRules();
    await registerMainWorldBootstrap();

    if (typeof NetworkBlockStore !== "undefined") {
        await NetworkBlockStore.get();
    }

    if (settings.autoApplyOnStartup !== false) {
        await syncProfile();
    }
}

chrome.runtime.onStartup.addListener(() => boot("browser-startup"));
chrome.runtime.onInstalled.addListener(() => boot("installed"));

chrome.action.onClicked.addListener(async (tab) => {
    if (tab?.id) await openPanel(tab.id);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    if (msg?.type === "JSON_CONFIG_UPDATED") {
        (async () => {
            if (msg.fileId === "trackers.json") {
                await syncPrivacyRules();
            }
            sendResponse({ ok: true });
        })();
        return true;
    }

    if (msg?.type === "ADD_CUSTOM_BLOCK") {
        (async () => {
            const domain = NetworkBlockStore.normalize(msg.domain);
            if (!domain) {
                sendResponse({ ok: false, reason: "invalid-domain" });
                return;
            }
            const list = await NetworkBlockStore.add(domain);
            await syncPrivacyRules();
            sendResponse({ ok: true, domains: list });
        })();
        return true;
    }

    if (msg?.type === "REMOVE_CUSTOM_BLOCK") {
        (async () => {
            const list = await NetworkBlockStore.remove(msg.domain);
            await syncPrivacyRules();
            sendResponse({ ok: true, domains: list });
        })();
        return true;
    }

    if (msg?.type === "SET_CUSTOM_BLOCKS") {
        (async () => {
            const list = await NetworkBlockStore.set(msg.domains || []);
            await syncPrivacyRules();
            sendResponse({ ok: true, domains: list });
        })();
        return true;
    }

    if (msg?.type === "GET_NETWORK_CONTEXT") {
        (async () => {
            const settings = await SettingsStore.get();
            const [trackers, customBlocks, profileData] = await Promise.all([
                loadTrackerDomains?.() || [],
                NetworkBlockStore.get(),
                chrome.storage.local.get(["snooper_active_profile", "snooper_fingerprint_profile"])
            ]);
            const tabId = msg.tabId;
            const stats = tabId != null ? NetworkStats.getForTab(tabId) : { count: 0, recent: [] };
            sendResponse({
                settings,
                trackers,
                customBlocks,
                blockStats: stats,
                activeProfile: profileData?.snooper_active_profile || null,
                uiProfile: profileData?.snooper_fingerprint_profile || null,
                feedbackAvailable: !!chrome.declarativeNetRequest?.onRuleMatchedDebug
            });
        })();
        return true;
    }

    if (msg?.type === "GET_SETTINGS") {
        SettingsStore.get().then(sendResponse);
        return true;
    }

    if (msg?.type === "SET_SETTINGS") {
        (async () => {
            const prev = await SettingsStore.get();
            const next = await SettingsStore.set(msg.settings || {});
            if (prev.rotationLanguageMode !== next.rotationLanguageMode
                || prev.perSiteRotation !== next.perSiteRotation) {
                RotationEngine.clearCache();
            }
            await syncPrivacyRules();
            if (next.spoofEnabled === false) await clearSpoof();
            else await syncProfile();
            sendResponse({ ok: true, settings: next });
        })();
        return true;
    }

    if (msg?.type === "APPLY_PROFILE" || msg?.type === "PROFILE_UPDATED") {
        (async () => {
            if (msg.profile) {
                await chrome.storage.local.set({ [PROFILE_KEY]: msg.profile });
            }
            const incoming = msg.profile || (await chrome.storage.local.get(PROFILE_KEY))?.[PROFILE_KEY];
            // #region agent log
            fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
                body: JSON.stringify({
                    sessionId: "6573a3",
                    location: "background/service-worker.js:PROFILE_UPDATED",
                    message: "Received profile update",
                    data: {
                        blockWebRTC: !!incoming?.blockWebRTC,
                        gpc: incoming?.privacy?.globalPrivacyControl,
                        stealthMode: !!incoming?.stealthMode
                    },
                    timestamp: Date.now(),
                    hypothesisId: "MSG",
                    runId: "privacy-v2"
                })
            }).catch(() => {});
            // #endregion
            if (await isPerSiteRotationEnabled()) {
                RotationEngine.clearCache();
            }
            const result = await syncProfile(incoming || null);
            sendResponse(result);
        })();
        return true;
    }

    if (msg?.type === "REQUEST_SPOOF" && sender?.tab?.id) {
        (async () => {
            let profile = null;
            if (sender.tab?.url?.startsWith("http")) {
                profile = await resolveTabProfile(sender.tab.url);
            }
            if (!profile) profile = await getProfile();
            const result = profile
                ? await injectSpoof(sender.tab.id, profile, [sender.frameId ?? 0])
                : null;
            sendResponse({ ok: !!result, result });
        })();
        return true;
    }

    if (msg?.type === "GET_SPOOF_PROFILE") {
        (async () => {
            const tabId = sender?.tab?.id;
            const url = msg.url || sender?.tab?.url || sender?.url;
            const cached = tabId != null ? tabProfileCache.get(tabId) : null;
            let profile = cached?.profile || null;

            if (!profile && url?.startsWith("http")) {
                profile = await resolveTabProfile(url);
            }
            if (!profile) profile = await getProfile();

            if (profile && tabId != null) {
                tabProfileCache.set(tabId, { url: url || cached?.url, profile, ts: Date.now() });
            }

            sendResponse({ profile: profile || null });
        })();
        return true;
    }

    if (msg?.type === "GET_PERSISTENCE_STATUS") {
        (async () => {
            const [settings, profileData] = await Promise.all([
                SettingsStore.get(),
                chrome.storage.local.get([PROFILE_KEY, "snooper_fingerprint_profile"])
            ]);
            sendResponse({
                settings,
                hasActiveProfile: !!profileData?.[PROFILE_KEY]?.userAgent,
                hasUiState: !!profileData?.snooper_fingerprint_profile,
                rotation: settings.perSiteRotation === true ? RotationEngine.getStats() : null,
                profileSummary: profileData?.[PROFILE_KEY]
                    ? {
                        userAgent: profileData[PROFILE_KEY].userAgent?.slice(0, 60),
                        platform: profileData[PROFILE_KEY].platform,
                        language: profileData[PROFILE_KEY].language
                    }
                    : null
            });
        })();
        return true;
    }

    if (msg?.type === "GET_COOKIE_SETTINGS") {
        CookieManager.getSettings().then(sendResponse);
        return true;
    }

    if (msg?.type === "SET_COOKIE_SETTINGS") {
        CookieManager.setSettings(msg.settings || {}).then(sendResponse);
        return true;
    }

    if (msg?.type === "CLEAR_COOKIES") {
        (async () => {
            const { origin, mode } = msg;
            const hostname = CookieManager.parseHostname(origin);
            const result = await CookieManager.clearCookies(origin, {
                sessionOnly: mode === "session",
                persistentOnly: mode === "persistent",
                thirdPartyOnly: mode === "thirdparty",
                firstPartyOnly: mode === "firstparty"
            });
            sendResponse(result);
        })();
        return true;
    }

    if (msg?.action === "open_panel" && sender?.tab?.id) {
        openPanel(sender.tab.id);
    }

    return true;
});

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;
    await applyTabSpoof(details.tabId, details.url, [0], { newLoad: false });
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (!details.url?.startsWith("http")) return;
    const isReload = details.transitionType === "reload";
    await applyTabSpoof(details.tabId, details.url, [details.frameId], { newLoad: isReload });
});

chrome.tabs.onRemoved.addListener((tabId) => {
    tabProfileCache.delete(tabId);
});

chrome.webNavigation.onCompleted.addListener((details) => {
    if (!details.url?.startsWith("http")) return;
    try {
        chrome.runtime.sendMessage({
            type: "TAB_NAV_COMPLETE",
            tabId: details.tabId,
            url: details.url
        }).catch(() => {});
    } catch (e) {}
});

boot("service-worker-load");
NetworkStats.initListeners();
CookieManager.initListeners();

chrome.tabs.query({}, (tabs) => {
    tabs.forEach((t) => {
        if (t.id && t.url) CookieManager.trackTab(t.id, t.url);
    });
});
