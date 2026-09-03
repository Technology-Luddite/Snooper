/********************************************************************
 * Snooper Logs Module
 * Internal inspector for debugging extension behavior
 ********************************************************************/

const STORAGE_KEY = "snooper_logs";

/**
 * Safe log storage read
 */
async function loadLogs() {
    try {
        const data = await chrome.storage.local.get(STORAGE_KEY);
        return data[STORAGE_KEY] || [];
    } catch (err) {
        console.error("[Logs] Failed to load logs", err);
        return [];
    }
}

/**
 * Save logs safely
 */
async function saveLogs(logs) {
    try {
        await chrome.storage.local.set({
            [STORAGE_KEY]: logs
        });
    } catch (err) {
        console.error("[Logs] Failed to save logs", err);
    }
}

/**
 * Render logs
 */
function render(logs) {
    const view = document.getElementById("logView");
    view.innerHTML = "";

    if (!logs.length) {
        view.textContent = "No logs available";
        return;
    }

    logs.slice().reverse().forEach(log => {
        const div = document.createElement("div");
        div.className = "log";
        div.textContent = `[${log.time}] [${log.module}] ${log.message}`;
        view.appendChild(div);
    });
}

/**
 * Add log entry
 */
async function addLog(module, message) {
    try {
        const logs = await loadLogs();

        logs.push({
            module,
            message,
            time: new Date().toISOString().split("T")[1].split(".")[0]
        });

        await saveLogs(logs.slice(-200)); // limit memory
    } catch (err) {
        console.error("[Logs] Failed to add log", err);
    }
}

/**
 * Init view
 */
async function init() {
    const logs = await loadLogs();
    render(logs);
}

/**
 * Clear logs
 */
async function clearLogs() {
    try {
        await saveLogs([]);
        render([]);
    } catch (err) {
        console.error("[Logs] Clear failed", err);
    }
}

/**
 * Wire buttons
 */
document.getElementById("refresh").addEventListener("click", init);
document.getElementById("clear").addEventListener("click", clearLogs);

init();

/**
 * Expose logger hook for future modules
 */
window.SnooperLog = addLog;