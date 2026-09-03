/********************************************************************
 * Snooper Fingerprint Module
 * Reduces browser fingerprint entropy (best-effort overrides)
 ********************************************************************/

const STORAGE_KEY = "snooper_fingerprint";

/**
 * Safe load settings
 */
async function loadSettings() {
    try {
        const data = await chrome.storage.local.get(STORAGE_KEY);
        return data[STORAGE_KEY] || {};
    } catch (err) {
        console.error("[Fingerprint] Load error", err);
        return {};
    }
}

/**
 * Safe save settings
 */
async function saveSettings(settings) {
    try {
        await chrome.storage.local.set({
            [STORAGE_KEY]: settings
        });
    } catch (err) {
        console.error("[Fingerprint] Save error", err);
    }
}

/**
 * Apply fingerprint protections (limited by browser security model)
 */
function applyFingerprint(settings) {
    try {
        if (!settings) return;

        // Canvas spoof (basic noise injection)
        if (settings.canvas) {
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

            HTMLCanvasElement.prototype.toDataURL = function () {
                try {
                    const context = this.getContext("2d");
                    if (context) {
                        context.fillStyle = "rgba(0,0,0,0.01)";
                        context.fillRect(0, 0, 1, 1);
                    }
                } catch {}

                return originalToDataURL.apply(this, arguments);
            };
        }

        // WebGL spoof (light override)
        if (settings.webgl) {
            const getParameter = WebGLRenderingContext.prototype.getParameter;

            WebGLRenderingContext.prototype.getParameter = function (param) {
                const debugInfo = this.getExtension("WEBGL_debug_renderer_info");

                if (param === debugInfo?.UNMASKED_VENDOR_WEBGL) {
                    return "Intel Inc.";
                }

                if (param === debugInfo?.UNMASKED_RENDERER_WEBGL) {
                    return "Intel Iris OpenGL Engine";
                }

                return getParameter.call(this, param);
            };
        }

        // Navigator normalization
        if (settings.navigator) {
            Object.defineProperty(navigator, "hardwareConcurrency", {
                get: () => 4
            });

            Object.defineProperty(navigator, "deviceMemory", {
                get: () => 4
            });
        }

        // Screen normalization
        if (settings.screen) {
            Object.defineProperty(screen, "width", { get: () => 1920 });
            Object.defineProperty(screen, "height", { get: () => 1080 });
            Object.defineProperty(screen, "colorDepth", { get: () => 24 });
        }

        document.getElementById("status").textContent =
            "Fingerprint protection active";

    } catch (err) {
        console.error("[Fingerprint] Apply error", err);
        document.getElementById("status").textContent =
            "Error applying fingerprint protection";
    }
}

/**
 * Init UI
 */
async function init() {
    const settings = await loadSettings();

    document.getElementById("canvas").checked = settings.canvas || false;
    document.getElementById("webgl").checked = settings.webgl || false;
    document.getElementById("audio").checked = settings.audio || false;
    document.getElementById("navigator").checked = settings.navigator || false;
    document.getElementById("screen").checked = settings.screen || false;

    applyFingerprint(settings);
}

/**
 * Save UI
 */
async function save() {
    const settings = {
        canvas: document.getElementById("canvas").checked,
        webgl: document.getElementById("webgl").checked,
        audio: document.getElementById("audio").checked,
        navigator: document.getElementById("navigator").checked,
        screen: document.getElementById("screen").checked
    };

    await saveSettings(settings);
    applyFingerprint(settings);
}

/**
 * Buttons
 */
document.getElementById("enable").addEventListener("click", save);
document.getElementById("disable").addEventListener("click", async () => {
    await saveSettings({});
    document.getElementById("status").textContent = "Disabled";
});

init();