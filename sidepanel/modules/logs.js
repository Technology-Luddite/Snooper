
/********************************************************************
 * Snooper Logs Module
 * Production-ready internal event logger
 * - Captures runtime events per module
 * - In-memory log buffer (no storage dependency)
 * - Safe, lightweight, no permissions required
 ********************************************************************/

const LogsModule = (() => {

    const MAX_LOGS = 200;
    const logs = [];

    function log(...args) {
        console.log("[Snooper Logs]", ...args);
    }

    /**
     * Add log entry
     */
    function add(type, message, data = null) {
        const entry = {
            time: new Date().toISOString(),
            type,
            message,
            data
        };

        logs.unshift(entry);

        if (logs.length > MAX_LOGS) {
            logs.pop();
        }
    }

    /**
     * Capture global errors
     */
    function attachGlobalHandlers() {
        try {
            window.addEventListener("error", (e) => {
                add("error", e.message || "Unknown error", {
                    file: e.filename,
                    line: e.lineno,
                    col: e.colno
                });
            });

            window.addEventListener("unhandledrejection", (e) => {
                add("promise", "Unhandled Promise Rejection", String(e.reason));
            });

        } catch (err) {
            console.error("[Logs] handler attach failed:", err);
        }
    }

    /**
     * Format log entry
     */
    function renderEntry(entry) {
        return `
            <div style="
                margin:6px;
                padding:8px;
                background:#1a1a1a;
                border-radius:6px;
                font-size:12px;
            ">
                <div style="color:#888;font-size:11px;">
                    ${entry.time} | ${entry.type}
                </div>

                <div style="margin-top:4px;color:#ddd;">
                    ${escapeHtml(entry.message)}
                </div>

                ${entry.data ? `
                    <div style="margin-top:4px;color:#888;font-size:11px;word-break:break-all;">
                        ${escapeHtml(JSON.stringify(entry.data))}
                    </div>
                ` : ""}
            </div>
        `;
    }

    /**
     * Escape HTML safely
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
     * MAIN RENDER
     */
    async function render() {
        try {
            log("Rendering logs module");

            if (!logs.length) {
                return `
                    <h2>📜 Logs</h2>
                    <p style="color:#aaa;">No logs captured yet</p>
                `;
            }

            let html = `
                <h2>📜 Logs</h2>

                <div style="
                    margin-top:10px;
                    padding:10px;
                    background:#111;
                    border-radius:6px;
                    color:#aaa;
                    font-size:12px;
                ">
                    In-memory runtime log stream (latest first)
                </div>
            `;

            for (const entry of logs) {
                html += renderEntry(entry);
            }

            return html;

        } catch (err) {
            console.error("[Logs] render crash:", err);

            return `
                <h2>📜 Logs</h2>
                <p style="color:red;">Error loading logs</p>
            `;
        }
    }

    /**
     * Public API
     */
    return {
        render,
        add,
        attachGlobalHandlers
    };

})();