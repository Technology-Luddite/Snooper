/********************************************************************
 * Profile Builder v4 — merges UI + JSON into anti-detection active profile
 ********************************************************************/

const ProfileBuilder = (() => {

    const FONT_MAP = {
        "Win32": "Win32",
        "MacIntel": "MacIntel",
        "Linux x86_64": "Linux x86_64",
        "Linux armv8l": "Linux armv8l"
    };

    const LEGACY_SCREEN_LABELS = {
        "HD Desktop": "1920x1080",
        "Laptop": "1366x768",
        "MacBook": "1440x900",
        "Small Laptop": "1280x800",
        "4K": "3840x2160",
        "Mobile Large": "430x932",
        "Mobile Small": "360x800"
    };

    const LEGACY_DEVICE_CONNECTION = {
        "High End Desktop": "4g-excellent",
        "Mid Desktop": "4g-good",
        "Low Desktop": "4g-fair",
        "Tablet": "4g-good",
        "Mobile High End": "4g-mobile-fast",
        "Mobile Low End": "3g-slow"
    };

    function resolveFonts(platform, fontProfiles) {
        const key = FONT_MAP[platform] || platform;
        return fontProfiles?.[key] || fontProfiles?.["Win32"] || [];
    }

    function parseIntOr(v, fallback) {
        if (v == null || v === "") return fallback;
        const n = parseInt(String(v), 10);
        return Number.isFinite(n) ? n : fallback;
    }

    function isChromiumBrowser(browserP) {
        const ua = browserP?.userAgent || "";
        return /Chrome|Chromium|Edg\//.test(ua) && !/Firefox/i.test(ua);
    }

    function resolveScreen(state, screenList, real) {
        let key = state.screen;
        if (key && LEGACY_SCREEN_LABELS[key]) key = LEGACY_SCREEN_LABELS[key];
        const screenP = screenList.find(p => p.label === key);
        const sw = screenP?.width ?? real.screen?.width;
        const sh = screenP?.height ?? real.screen?.height;
        const chromeH = screenP?.chromeHeight ?? 90;
        const isMobile = screenP?.mobile ?? false;
        const dpr = screenP?.devicePixelRatio ?? 1;
        const taskbarH = isMobile ? 0 : 40;

        return {
            screenP,
            sw,
            sh,
            chromeH,
            isMobile,
            dpr,
            taskbarH,
            screen: {
                width: sw,
                height: sh,
                colorDepth: screenP?.colorDepth ?? real.screen?.colorDepth,
                mobile: isMobile,
                availWidth: sw,
                availHeight: Math.max(0, sh - taskbarH),
                availLeft: 0,
                availTop: 0
            }
        };
    }

    function resolveHardware(state, connectionList, real) {
        let connKey = state.connection;
        if (!connKey && state.device && LEGACY_DEVICE_CONNECTION[state.device]) {
            connKey = LEGACY_DEVICE_CONNECTION[state.device];
        }
        const connP = connKey
            ? connectionList.find(c => c.label === connKey)
            : null;

        return {
            hardwareConcurrency: parseIntOr(state.hardwareConcurrency, real.hardwareConcurrency),
            deviceMemory: parseIntOr(state.deviceMemory, real.deviceMemory),
            maxTouchPoints: parseIntOr(state.maxTouchPoints, real.maxTouchPoints ?? 0),
            connection: connP
                ? { effectiveType: connP.effectiveType, downlink: connP.downlink, rtt: connP.rtt }
                : null
        };
    }

    function migrateState(state, legacyDeviceBundles = []) {
        const s = { ...state };
        if (s.screen && LEGACY_SCREEN_LABELS[s.screen]) {
            s.screen = LEGACY_SCREEN_LABELS[s.screen];
        }
        if (s.device && (s.hardwareConcurrency == null || s.hardwareConcurrency === "")) {
            const d = legacyDeviceBundles.find(x => x.label === s.device);
            if (d) {
                s.hardwareConcurrency = String(d.hardwareConcurrency);
                s.deviceMemory = String(d.deviceMemory);
                s.maxTouchPoints = String(d.maxTouchPoints);
                if (!s.connection && LEGACY_DEVICE_CONNECTION[s.device]) {
                    s.connection = LEGACY_DEVICE_CONNECTION[s.device];
                }
            }
        }
        return s;
    }

    function build(state, profiles, real, fontProfiles = {}) {
        const migrated = migrateState(state, profiles.legacyDevice || []);
        const tzP = profiles.timezone.find(p => p.label === migrated.timezone);
        const browserP = profiles.browser.find(p => p.label === migrated.browser);
        const geoP = profiles.geolocation.find(p => p.label === migrated.geolocation);
        const webglP = profiles.webgl.find(p => p.label === migrated.webgl);

        const {
            sw, sh, chromeH, isMobile, dpr, screen
        } = resolveScreen(migrated, profiles.screen, real);

        const {
            hardwareConcurrency,
            deviceMemory,
            maxTouchPoints,
            connection
        } = resolveHardware(migrated, profiles.connection || [], real);

        const language = migrated.language || browserP?.language || real.language;
        const langBase = language ? language.split("-")[0] : null;
        const languages = langBase && langBase !== language
            ? [language, langBase]
            : [language];

        const platform = migrated.platform || browserP?.platform || real.platform;

        const innerW = sw;
        const innerH = isMobile ? sh : Math.max(400, sh - chromeH);
        const outerW = isMobile ? sw : innerW;
        const outerH = isMobile ? sh : sh;

        const sendClientHints = isChromiumBrowser(browserP) && browserP?.sendClientHints !== false;
        const stealth = migrated.stealthMode === true;

        return {
            userAgent: browserP?.userAgent || real.userAgent,
            platform,
            language,
            locale: language,
            languages,

            vendor: browserP?.vendor ?? "",
            productSub: browserP?.productSub ?? "20030107",
            oscpu: browserP?.oscpu ?? null,
            pdfViewerEnabled: browserP?.pdfViewerEnabled ?? true,

            hardwareConcurrency,
            deviceMemory,
            maxTouchPoints,
            connection,

            screen,
            timezone: tzP?.timezone || geoP?.timezone || real.timezone,
            utcOffsetMinutes: tzP?.utcOffsetMinutes ?? geoP?.utcOffsetMinutes ?? null,

            geolocation: geoP ? {
                city: geoP.label,
                latitude: geoP.latitude,
                longitude: geoP.longitude,
                accuracy: geoP.accuracy ?? 25,
                altitude: geoP.altitude ?? null,
                altitudeAccuracy: geoP.altitudeAccuracy ?? null
            } : null,

            innerWidth: innerW,
            innerHeight: innerH,
            outerWidth: outerW,
            outerHeight: outerH,
            screenX: 0,
            screenY: 0,
            devicePixelRatio: dpr,

            userAgentData: sendClientHints ? (browserP?.userAgentData || null) : null,
            sendClientHints,

            webgl: webglP ? {
                vendor: webglP.vendor,
                renderer: webglP.renderer,
                vendorStandard: webglP.vendorStandard || "WebKit",
                rendererStandard: webglP.rendererStandard || "WebKit WebGL",
                extensions: webglP.extensions || []
            } : null,

            fonts: migrated.spoofFonts !== false ? resolveFonts(platform, fontProfiles) : null,

            matchMedia: {
                mobile: isMobile,
                pointerCoarse: isMobile,
                hoverNone: isMobile,
                portrait: isMobile ? (sh >= sw) : false,
                devicePixelRatio: dpr
            },

            privacy: {
                doNotTrack: migrated.doNotTrack != null && migrated.doNotTrack !== ""
                    ? migrated.doNotTrack
                    : null,
                globalPrivacyControl: migrated.globalPrivacyControl === true
            },

            blockWebRTC: migrated.blockWebRTC === true || stealth,

            stealthMode: stealth,

            spoof: {
                canvas: migrated.spoofCanvas !== false,
                webgl: migrated.spoofWebgl !== false,
                audio: migrated.spoofAudio !== false || stealth,
                matchMedia: migrated.spoofMatchMedia !== false,
                connection: migrated.spoofConnection !== false,
                geolocation: migrated.spoofGeolocation !== false,
                privacy: migrated.spoofPrivacy !== false,
                fonts: migrated.spoofFonts !== false || stealth,
                workers: migrated.spoofWorkers !== false || stealth,
                webdriver: true
            }
        };
    }

    return { build, migrateState };

})();
