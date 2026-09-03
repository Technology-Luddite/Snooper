/********************************************************************
 * Snooper Dashboard Module
 * Displays system status, modules, and settings snapshot
 ********************************************************************/

async function loadSettings() {
    return await chrome.runtime.sendMessage({
        type: "GET_SETTINGS"
    });
}

function renderModules(modules) {
    const container = document.getElementById("modules");
    container.innerHTML = "";

    for (const [name, enabled] of Object.entries(modules)) {
        const row = document.createElement("div");

        row.textContent = `${name.toUpperCase()} : ${enabled ? "ON" : "OFF"}`;
        row.style.color = enabled ? "#4caf50" : "#ff5252";

        container.appendChild(row);
    }
}

async function init() {
    const response = await loadSettings();

    const statusEl = document.getElementById("status");
    const settingsEl = document.getElementById("settings");

    if (!response || !response.data) {
        statusEl.textContent = "❌ Failed to load settings";
        return;
    }

    const settings = response.data;

    statusEl.textContent = "✔ Snooper is running";

    renderModules(settings.modules);

    settingsEl.textContent = JSON.stringify(settings, null, 2);
}

init();