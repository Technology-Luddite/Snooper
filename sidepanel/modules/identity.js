/********************************************************************
 * Snooper Identity Module v2 — reads active TAB (not side panel)
 ********************************************************************/

const IdentityModule = (() => {

    function escapeHtml(str) {
        return String(str ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function row(label, value) {
        const display = typeof value === "object"
            ? JSON.stringify(value, null, 2)
            : String(value ?? "n/a");
        return `
            <div style="margin:8px;padding:10px;background:#1a1a1a;border-radius:6px;font-size:12px;">
                <div style="color:#888;font-size:11px;">${escapeHtml(label)}</div>
                <div style="color:#ddd;margin-top:4px;word-break:break-word;white-space:pre-wrap;font-family:monospace;font-size:11px;">${escapeHtml(display)}</div>
            </div>`;
    }

    async function render() {
        try {
            const data = typeof TabProbe !== "undefined"
                ? await TabProbe.readActiveTab()
                : { error: "TabProbe not loaded" };

            if (data?.error) {
                return `
                    <h2>🆔 Identity Inspector</h2>
                    <p style="color:#f90;padding:10px;">${escapeHtml(data.error)}</p>
                    <p style="font-size:11px;color:#888;">Open an http(s) page in the active tab, then revisit this panel.</p>`;
            }

            return `
                <h2>🆔 Identity Inspector</h2>
                <div style="margin:10px 0;padding:8px;background:#111;border-radius:6px;color:#8f8;font-size:11px;">
                    Reading from active tab (MAIN world) — matches what fingerprint sites see
                </div>

                <h3 style="color:#aaa;font-size:13px;margin:12px 0 6px;">Navigator</h3>
                ${row("User Agent", data.userAgent)}
                ${row("Platform", data.platform)}
                ${row("Vendor", data.vendor)}
                ${row("productSub", data.productSub)}
                ${row("oscpu", data.oscpu)}
                ${row("Language", data.language)}
                ${row("Languages", data.languages)}
                ${row("CPU Cores", data.hardwareConcurrency)}
                ${row("Device Memory (GB)", data.deviceMemory)}
                ${row("Touch Points", data.maxTouchPoints)}
                ${row("webdriver", data.webdriver)}
                ${row("userAgentData", data.userAgentData)}
                ${row("Connection", data.connection)}

                <h3 style="color:#aaa;font-size:13px;margin:12px 0 6px;">Screen & Window</h3>
                ${row("Screen", data.screen)}
                ${row("Window", data.window)}

                <h3 style="color:#aaa;font-size:13px;margin:12px 0 6px;">Locale & Time</h3>
                ${row("Intl", data.intl)}
                ${row("docLang", data.docLang)}
                ${row("Timezone offset (min)", data.timezoneOffset)}

                <h3 style="color:#aaa;font-size:13px;margin:12px 0 6px;">Geolocation (GPS)</h3>
                ${row("navigator.geolocation", data.geolocation)}

                <h3 style="color:#aaa;font-size:13px;margin:12px 0 6px;">WebGL</h3>
                ${row("GPU", data.webgl)}

                <h3 style="color:#aaa;font-size:13px;margin:12px 0 6px;">Privacy</h3>
                ${row("globalPrivacyControl (GPC)", data.globalPrivacyControl)}
                ${row("doNotTrack", data.doNotTrack)}
                ${row("cookieEnabled", data.cookieEnabled)}
                ${row("pdfViewerEnabled", data.pdfViewerEnabled)}
                <p style="font-size:10px;color:#666;margin-top:6px;">Sec-GPC HTTP header is set via DNR — check DevTools → Network → request headers on reload.</p>`;
        } catch (err) {
            return `<h2>🆔 Identity</h2><p style="color:red;">${escapeHtml(String(err))}</p>`;
        }
    }

    return { render };

})();
