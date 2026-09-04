/********************************************************************
 * DNR request header rules — UA, language, Client Hints, privacy signals
 ********************************************************************/

function buildSecChUa(brands) {
    if (!brands?.length) return null;
    return brands.map(b => `"${b.brand}";v="${b.version}"`).join(", ");
}

function buildSecChUaFullVersionList(brands) {
    if (!brands?.length) return null;
    return brands.map(b => `"${b.brand}";v="${b.version}.0.0.0"`).join(", ");
}

const CLIENT_HINT_HEADERS = [
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-ch-ua-platform-version",
    "sec-ch-ua-arch",
    "sec-ch-ua-bitness",
    "sec-ch-ua-model",
    "sec-ch-ua-full-version",
    "sec-ch-ua-full-version-list"
];

function addRemoveHeaderRules(rules, nextIdRef, condition, headers) {
    for (const header of headers) {
        rules.push({
            id: nextIdRef.value++,
            priority: 2,
            action: {
                type: "modifyHeaders",
                requestHeaders: [{ header, operation: "remove" }]
            },
            condition
        });
    }
}

async function applyProfileRules(profile) {
    if (!chrome.declarativeNetRequest) {
        return { ok: false, ruleCount: 0 };
    }

    const removeRuleIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    const rules = [];
    const nextIdRef = { value: 1 };

    const resourceTypes = ["main_frame", "sub_frame", "xmlhttprequest", "other"];
    const condition = { urlFilter: "*", resourceTypes };

    const hasPrivacy = profile?.privacy?.globalPrivacyControl === true
        || profile?.privacy?.doNotTrack === "1";

    const hasAny = profile?.userAgent || profile?.language || profile?.sendClientHints || hasPrivacy;

    if (!hasAny) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [] });
        return { ok: true, ruleCount: 0 };
    }

    function addHeader(header, value) {
        if (value === undefined || value === null || value === "") return;
        rules.push({
            id: nextIdRef.value++,
            priority: 1,
            action: {
                type: "modifyHeaders",
                requestHeaders: [{ header, operation: "set", value: String(value) }]
            },
            condition
        });
    }

    const spoofClientHints = !!(profile?.sendClientHints && profile?.userAgentData);

    if (profile?.userAgent && !spoofClientHints) {
        addRemoveHeaderRules(rules, nextIdRef, condition, CLIENT_HINT_HEADERS);
    }

    if (profile?.userAgent) addHeader("User-Agent", profile.userAgent);

    if (profile?.language) {
        const acceptLang = Array.isArray(profile.languages)
            ? profile.languages.join(",")
            : profile.language;
        addHeader("Accept-Language", acceptLang);
    }

    if (profile?.privacy?.globalPrivacyControl === true) {
        addHeader("Sec-GPC", "1");
    }

    if (profile?.privacy?.doNotTrack === "1") {
        addHeader("DNT", "1");
    }

    if (spoofClientHints) {
        const uad = profile.userAgentData;
        addHeader("sec-ch-ua", buildSecChUa(uad.brands));
        addHeader("sec-ch-ua-mobile", uad.mobile ? "?1" : "?0");
        if (uad.platform) addHeader("sec-ch-ua-platform", `"${uad.platform}"`);
        if (uad.platformVersion) addHeader("sec-ch-ua-platform-version", `"${uad.platformVersion}"`);
        if (uad.architecture) addHeader("sec-ch-ua-arch", `"${uad.architecture}"`);
        if (uad.bitness) addHeader("sec-ch-ua-bitness", `"${uad.bitness}"`);
        if (uad.model) addHeader("sec-ch-ua-model", `"${uad.model}"`);
        if (uad.uaFullVersion) addHeader("sec-ch-ua-full-version", `"${uad.uaFullVersion}"`);
        const fvl = buildSecChUaFullVersionList(uad.brands);
        if (fvl) addHeader("sec-ch-ua-full-version-list", fvl);
    }

    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: rules });

    // #region agent log
    fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
        body: JSON.stringify({
            sessionId: "6573a3",
            location: "background/request-rules.js:applyProfileRules",
            message: "DNR privacy headers applied",
            data: {
                ruleCount: rules.length,
                gpc: profile?.privacy?.globalPrivacyControl,
                dnt: profile?.privacy?.doNotTrack,
                headers: rules.map(r => r.action.requestHeaders[0].header)
            },
            timestamp: Date.now(),
            hypothesisId: "GPC-HDR",
            runId: "gpc-fix"
        })
    }).catch(() => {});
    // #endregion

    return { ok: true, ruleCount: rules.length };
}
