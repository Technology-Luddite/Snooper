
/********************************************************************
 * Snooper Popup - Side Panel Launcher (FIXED)
 ********************************************************************/

function log(...args) {
    console.log("[Popup]", ...args);
}

/**
 * Open Side Panel correctly (Chrome requires this pattern)
 */
async function openSidePanel() {
    try {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        if (!tab?.id) {
            console.error("[Popup] No active tab found");
            return;
        }

        if (!chrome.sidePanel) {
            console.error("[Popup] sidePanel API not available");
            return;
        }

        await chrome.sidePanel.open({ tabId: tab.id });

        log("Side panel opened for tab:", tab.id);

    } catch (err) {
        console.error("[Popup] openSidePanel error:", err);
    }
}

/**
 * Bind button safely
 */
function bind() {
    const btn = document.getElementById("open");

    if (!btn) {
        console.error("[Popup] Button not found");
        return;
    }

    btn.addEventListener("click", () => {
        log("Opening side panel...");
        openSidePanel();
    });
}

/**
 * Boot
 */
document.addEventListener("DOMContentLoaded", () => {
    bind();
});