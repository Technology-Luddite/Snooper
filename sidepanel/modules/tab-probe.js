/********************************************************************
 * Tab Probe — read fingerprint surface from active tab (MAIN world)
 ********************************************************************/

const TabProbe = (() => {

    async function collectSnapshotWithGeo() {
        const nav = navigator;
        const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
        let webglVendor = "n/a";
        let webglRenderer = "n/a";
        try {
            const c = document.createElement("canvas");
            const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
            if (gl) {
                const dbg = gl.getExtension("WEBGL_debug_renderer_info");
                if (dbg) {
                    webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
                    webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
                }
            }
        } catch (e) {}

        const uad = nav.userAgentData;

        let geolocation = { status: "not probed" };
        if (nav.geolocation) {
            geolocation = await new Promise((resolve) => {
                nav.geolocation.getCurrentPosition(
                    (pos) => resolve({
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                        altitude: pos.coords.altitude
                    }),
                    (err) => resolve({ error: err.message, code: err.code }),
                    { timeout: 4000, maximumAge: 0 }
                );
            });
        } else {
            geolocation = { error: "geolocation API unavailable" };
        }

        return {
            userAgent: nav.userAgent,
            platform: nav.platform,
            vendor: nav.vendor,
            language: nav.language,
            languages: Array.from(nav.languages || []),
            hardwareConcurrency: nav.hardwareConcurrency,
            deviceMemory: nav.deviceMemory,
            maxTouchPoints: nav.maxTouchPoints,
            webdriver: nav.webdriver,
            userAgentData: uad ? {
                brands: uad.brands,
                mobile: uad.mobile,
                platform: uad.platform
            } : null,
            screen: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth
            },
            window: {
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
                outerWidth: window.outerWidth,
                outerHeight: window.outerHeight,
                devicePixelRatio: window.devicePixelRatio
            },
            intl: {
                locale: Intl.DateTimeFormat().resolvedOptions().locale,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            },
            geolocation,
            connection: conn ? {
                effectiveType: conn.effectiveType,
                downlink: conn.downlink,
                rtt: conn.rtt
            } : null,
            webgl: { vendor: webglVendor, renderer: webglRenderer },
            globalPrivacyControl: nav.globalPrivacyControl,
            doNotTrack: nav.doNotTrack
        };
    }

    async function readActiveTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return { error: "No active tab" };
            if (!tab.url?.startsWith("http")) {
                return { error: "Active tab is not a web page", url: tab.url };
            }
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                func: collectSnapshotWithGeo
            });
            return result?.result || { error: "Probe returned empty" };
        } catch (err) {
            return { error: String(err) };
        }
    }

    return { readActiveTab, collectSnapshotWithGeo };

})();
