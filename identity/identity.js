/********************************************************************
 * Snooper Identity Module
 * Spoofs browser identity signals (best-effort layer)
 ********************************************************************/

const STORAGE_KEY = "snooper_identity";

/**
 * Safe storage read
 */
async function loadSettings() {
    try {
        const data = await chrome.storage.local.get(STORAGE_KEY);
        return data[STORAGE_KEY] || {};
    } catch (err) {
        console.error("[Identity] Failed to load settings", err);
        return {};
    }
}

/**
 * Safe storage save
 */
async function saveSettings(settings) {
    try {
        await chrome.storage.local.set({
            [STORAGE_KEY]: settings
        });
    } catch (err) {
        console.error("[Identity] Failed to save settings", err);
    }
}

/**
 * Apply identity spoofing (limited to JS-accessible overrides)
 */
function applyIdentity(settings) {
    try {
        if (!settings) return;

        if (settings.language) {
            Object.defineProperty(navigator, "language", {
                get: () => settings.language
            });

            Object.defineProperty(navigator, "languages", {
                get: () => [settings.language]
            });
        }

        if (settings.ua) {
            Object.defineProperty(navigator, "userAgent", {
                get: () => settings.ua
            });
        }

        document.getElementById("status").textContent =
            "Identity spoofing active";

    } catch (err) {
        console.error("[Identity] Apply failed", err);
        document.getElementById("status").textContent =
            "Error applying identity settings";
    }
}

/**
 * Init UI
 */
async function init() {
    const settings = await loadSettings();

    document.getElementById("language").value = settings.language || "";
    document.getElementById("timezone").value = settings.timezone || "";
    document.getElementById("ua").value = settings.ua || "";

    applyIdentity(settings);
}

/**
 * Save UI
 */
async function save() {
    const settings = {
        language: document.getElementById("language").value.trim(),
        timezone: document.getElementById("timezone").value.trim(),
        ua: document.getElementById("ua").value.trim()
    };

    await saveSettings(settings);
    applyIdentity(settings);
}

/**
 * Events
 */
document.getElementById("save").addEventListener("click", save);

init();