
/********************************************************************
 * Snooper Storage Module
 * Production-ready standalone module
 * - localStorage + sessionStorage viewer
 * - Safe per-tab isolation
 * - No dependency on panel.js changes
 ********************************************************************/

const StorageModule = (() => {

    function log(...args) {
        console.log("[Snooper Storage]", ...args);
    }

    /**
     * Get active tab origin (scope storage correctly)
     */
    async function getActiveTabOrigin() {
        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

            if (!tab?.url) return null;

            return new URL(tab.url).origin;

        } catch (err) {
            console.error("[Storage] tab error:", err);
            return null;
        }
    }

    /**
     * Safe read localStorage (via injected script)
     */
    async function getLocalStorage() {
        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

            if (!tab?.id) return {};

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const data = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        data[key] = localStorage.getItem(key);
                    }
                    return data;
                }
            });

            return results?.[0]?.result || {};

        } catch (err) {
            console.error("[Storage] localStorage error:", err);
            return {};
        }
    }

    /**
     * Safe read sessionStorage (via injected script)
     */
    async function getSessionStorage() {
        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

            if (!tab?.id) return {};

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const data = {};
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const key = sessionStorage.key(i);
                        data[key] = sessionStorage.getItem(key);
                    }
                    return data;
                }
            });

            return results?.[0]?.result || {};

        } catch (err) {
            console.error("[Storage] sessionStorage error:", err);
            return {};
        }
    }

    /**
     * Format storage display
     */
    function renderSection(title, data) {
        const keys = Object.keys(data || {});

        if (!keys.length) {
            return `
                <div style="margin-top:10px;">
                    <h3>${title}</h3>
                    <p style="color:#aaa;">No data found</p>
                </div>
            `;
        }

        let html = `
            <div style="margin-top:10px;">
                <h3>${title} (${keys.length})</h3>
        `;

        for (const key of keys) {
            html += `
                <div style="
                    margin:8px;
                    padding:10px;
                    background:#1a1a1a;
                    border-radius:6px;
                    font-size:12px;
                ">
                    <div style="font-weight:bold;">${escapeHtml(key)}</div>
                    <div style="margin-top:5px;word-break:break-all;color:#ccc;">
                        ${escapeHtml(String(data[key]))}
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        return html;
    }

    /**
     * HTML escape safety
     */
    function escapeHtml(str) {
        return String(str)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    /**
     * MAIN RENDER ENTRY
     */
    async function render() {
        try {
            const [local, session] = await Promise.all([
                getLocalStorage(),
                getSessionStorage()
            ]);

            log("Loaded localStorage keys:", Object.keys(local).length);
            log("Loaded sessionStorage keys:", Object.keys(session).length);

            return `
                <h2>💾 Storage Inspector</h2>

                <div style="
                    margin-top:10px;
                    padding:10px;
                    background:#111;
                    border-radius:6px;
                    color:#aaa;
                    font-size:12px;
                ">
                    Reads localStorage + sessionStorage from active tab
                </div>

                ${renderSection("localStorage", local)}
                ${renderSection("sessionStorage", session)}
            `;

        } catch (err) {
            console.error("[Storage] render crash:", err);

            return `
                <h2>💾 Storage Inspector</h2>
                <p style="color:red;">Error loading storage</p>
            `;
        }
    }

    return {
        render
    };

})();