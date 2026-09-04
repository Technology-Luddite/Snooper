/********************************************************************
 * Rotation Engine — per-site session fingerprint personas (50 pool)
 ********************************************************************/

const RotationEngine = (() => {

    let sessionId = null;
    const domainGeneration = new Map();
    const builtCache = new Map();
    let rotationList = null;
    let presetBundle = null;

    const REAL_FALLBACK = {
        userAgent: "",
        platform: "Win32",
        language: "en-US",
        hardwareConcurrency: 4,
        deviceMemory: 8,
        screen: { width: 1920, height: 1080, colorDepth: 24 },
        timezone: "UTC"
    };

    function initSession() {
        sessionId = crypto.randomUUID?.() || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        domainGeneration.clear();
        builtCache.clear();
    }

    function getRegistrableDomain(url) {
        try {
            const host = new URL(url).hostname.toLowerCase();
            if (!host || host === "localhost") return host || null;
            const parts = host.split(".");
            if (parts.length <= 2) return host;
            return parts.slice(-2).join(".");
        } catch (e) {
            return null;
        }
    }

    function hashToIndex(domain, generation) {
        const str = `${sessionId}:${domain}:${generation}`;
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return Math.abs(h >>> 0) % rotationList.length;
    }

    async function loadPresets() {
        if (presetBundle) return presetBundle;

        const [
            rotation,
            screen,
            timezone,
            browser,
            webgl,
            geolocation,
            connection,
            fontProfiles
        ] = await Promise.all([
            JsonConfigStore.load("rotationProfiles.json"),
            JsonConfigStore.load("screenProfiles.json"),
            JsonConfigStore.load("timezoneProfiles.json"),
            JsonConfigStore.load("browserProfiles.json"),
            JsonConfigStore.load("webglProfiles.json"),
            JsonConfigStore.load("geolocationProfiles.json"),
            JsonConfigStore.load("connectionProfiles.json"),
            JsonConfigStore.load("fontProfiles.json")
        ]);

        rotationList = Array.isArray(rotation) ? rotation : [];
        presetBundle = {
            screen,
            timezone,
            browser,
            webgl,
            geolocation,
            connection,
            fontProfiles
        };
        return presetBundle;
    }

    function applyDefaultLanguage(profile, language) {
        if (!profile || !language) return profile;
        const langBase = language.split("-")[0];
        profile.language = language;
        profile.locale = language;
        profile.languages = langBase && langBase !== language
            ? [language, langBase]
            : [language];
        return profile;
    }

    function clearCache() {
        builtCache.clear();
    }

    function entryToState(entry, languageMode, defaultLanguage) {
        const lang = languageMode === "random"
            ? entry.language
            : (defaultLanguage || REAL_FALLBACK.language);

        return {
            screen: entry.screen,
            browser: entry.browser,
            platform: entry.platform || null,
            language: lang,
            timezone: entry.timezone,
            geolocation: entry.geolocation,
            webgl: entry.webgl,
            hardwareConcurrency: String(entry.hardwareConcurrency),
            deviceMemory: String(entry.deviceMemory),
            maxTouchPoints: String(entry.maxTouchPoints ?? 0),
            connection: entry.connection,
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

    async function getProfileForDomain(domain, options = {}) {
        if (!domain) return null;

        const newLoad = options.newLoad === true;
        const languageMode = options.languageMode === "random" ? "random" : "default";

        await loadPresets();
        if (!rotationList.length) return null;

        let generation = domainGeneration.get(domain) || 0;
        if (newLoad || generation === 0) {
            generation += 1;
            domainGeneration.set(domain, generation);
        }

        const cacheKey = `${domain}:${generation}:${languageMode}:${options.defaultLanguage || ""}`;
        if (builtCache.has(cacheKey)) return builtCache.get(cacheKey);

        const idx = hashToIndex(domain, generation);
        const entry = rotationList[idx];
        if (!entry) return null;

        const built = ProfileBuilder.build(
            entryToState(entry, languageMode, options.defaultLanguage),
            {
                screen: presetBundle.screen,
                timezone: presetBundle.timezone,
                browser: presetBundle.browser,
                webgl: presetBundle.webgl,
                geolocation: presetBundle.geolocation,
                connection: presetBundle.connection,
                legacyDevice: []
            },
            REAL_FALLBACK,
            presetBundle.fontProfiles
        );

        if (languageMode === "default") {
            applyDefaultLanguage(built, options.defaultLanguage || REAL_FALLBACK.language);
        }

        built.rotationMeta = {
            domain,
            index: idx,
            generation,
            label: entry.label,
            sessionId,
            languageMode
        };

        builtCache.set(cacheKey, built);
        return built;
    }

    async function getProfileForUrl(url, options = {}) {
        return getProfileForDomain(getRegistrableDomain(url), options);
    }

    function getStats() {
        let totalLoads = 0;
        domainGeneration.forEach((gen) => { totalLoads += gen; });
        return {
            sessionId,
            assignedDomains: domainGeneration.size,
            totalLoads,
            poolSize: rotationList?.length || 0
        };
    }

    return {
        initSession,
        clearCache,
        getRegistrableDomain,
        getProfileForDomain,
        getProfileForUrl,
        getStats
    };

})();
