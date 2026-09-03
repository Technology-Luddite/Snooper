/********************************************************************
 * Snooper Control Hub
 * Central monitoring and control screen
 ********************************************************************/

const STATUS = {
    ok: "✔ Running",
    error: "❌ Error",
    loading: "⏳ Loading..."
};

/**
 * Safe message to background
 */
async function getSettings() {
    try {
        return await chrome.runtime.sendMessage({
            type: "GET_SETTINGS"
        });
    } catch (err) {
        console.error("[Hub] Failed to get settings", err);
        return null;
    }
}

/**
 * Render modules list
 */
function renderModules(modules) {
    const el = document.getElementById("modules");
    el.innerHTML = "";

    if (!modules) {
        el.textContent = "No module data";
        return;
    }

    for (const [key, value] of Object.entries(modules)) {
        const div = document.createElement("div");
        div.textContent = `${key}: ${value ? "ON" : "OFF"}`;
        div.style.color = value ? "#4caf50" : "#ff5252";
        el.appendChild(div);
    }
}

/**
 * Load system info
 */
function renderInfo(settings) {
    const info = {
        version: settings?.version || "unknown",
        modules: Object.keys(settings?.modules || {}).length,
        timestamp: new Date().toISOString()
    };

    document.getElementById("info").textContent =
        JSON.stringify(info, null, 2);
}

/**
 * Main init
 */
async function init() {
    const statusEl = document.getElementById("status");

    statusEl.textContent = STATUS.loading;

    const res = await getSettings();

    if (!res || !res.data) {
        statusEl.textContent = STATUS.error;
        return;
    }

    const settings = res.data;

    statusEl.textContent = STATUS.ok;

    renderModules(settings.modules);
    renderInfo(settings);
}

/**
 * Buttons
 */
document.getElementById("reload").addEventListener("click", init);

document.getElementById("clearLogs").addEventListener("click", () => {
    console.clear();
    alert("Console logs cleared (UI only)");
});

init();