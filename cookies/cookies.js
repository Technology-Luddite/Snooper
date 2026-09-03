
/********************************************************************
 * Snooper Cookies Module
 * Production-ready module (standalone)
 * - No dependency on panel.js changes
 * - Safe Chrome cookies API handling
 * - Read + filter + refresh ready structure
 ********************************************************************/

const CookiesModule = (() => {

    function log(...args) {
        console.log("[Snooper Cookies]", ...args);
    }

    /**
     * Get active tab URL
     */
    async function getActiveTabUrl() {
        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

            return tab?.url || null;

        } catch (err) {
            console.error("[Cookies] tab error:", err);
            return null;
        }
    }

    /**
     * Safe cookie fetch
     */
    function fetchCookies(url) {
    return new Promise((resolve) => {
        try {
            if (!chrome?.cookies?.getAll) {
                console.error("[Cookies] API not available");
                resolve([]);
                return;
            }

            let query = url;

            try {
                const parsed = new URL(url);
                query = parsed.origin;
            } catch (e) {
                query = url;
            }

            chrome.cookies.getAll({ url: query }, (cookies) => {
                if (chrome.runtime.lastError) {
                    console.error("[Cookies] error:", chrome.runtime.lastError);
                    resolve([]);
                    return;
                }

                resolve(cookies || []);
            });

        } catch (err) {
            console.error("[Cookies] exception:", err);
            resolve([]);
        }
    });
}

    /**
     * Format cookie display
     */
    function renderCookieList(cookies) {
        if (!cookies.length) {
            return `
                <div style="padding:10px;color:#aaa;">
                    No cookies found for this site
                </div>
            `;
        }

        let html = `<div style="margin-top:10px;">`;

        for (const c of cookies) {
            html += `
                <div style="
                    margin:8px;
                    padding:10px;
                    background:#1a1a1a;
                    border-radius:6px;
                    font-size:12px;
                ">
                    <div style="font-weight:bold;">${escapeHtml(c.name)}</div>
                    <div style="color:#888;font-size:11px;">
                        ${escapeHtml(c.domain)}
                    </div>
                    <div style="
                        margin-top:5px;
                        word-break:break-all;
                        color:#ddd;
                    ">
                        ${escapeHtml(c.value)}
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        return html;
    }

    /**
     * Basic HTML escape (prevents UI breakage)
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
     * This is what panel.js will call
     */
    async function render() {
        try {
            const url = await getActiveTabUrl();

            if (!url) {
                return `
                    <h2>🍪 Cookies</h2>
                    <p>No active tab detected</p>
                `;
            }

            const cookies = await fetchCookies(url);

            log("Loaded cookies:", cookies.length);

            return `
                <h2>🍪 Cookies</h2>

                <div style="
                    margin-top:10px;
                    padding:10px;
                    background:#111;
                    border-radius:6px;
                    color:#aaa;
                    font-size:12px;
                ">
                    Site: ${url}
                </div>

                <div style="margin-top:10px;">
                    <strong>Total:</strong> ${cookies.length}
                </div>

                ${renderCookieList(cookies)}
            `;

        } catch (err) {
            console.error("[Cookies] render crash:", err);

            return `
                <h2>🍪 Cookies</h2>
                <p style="color:red;">Error loading cookies</p>
            `;
        }
    }

    return {
        render
    };

})();