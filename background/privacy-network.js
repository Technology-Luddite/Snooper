/********************************************************************
 * Network privacy policies — WebRTC IP leak mitigation
 ********************************************************************/

async function applyWebRtcPolicy(block) {
    if (!chrome.privacy?.network?.webRTCIPHandlingPolicy) {
        // #region agent log
        fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
            body: JSON.stringify({
                sessionId: "6573a3",
                location: "background/privacy-network.js:applyWebRtcPolicy",
                message: "WebRTC API unavailable",
                data: { block },
                timestamp: Date.now(),
                hypothesisId: "WEBRTC-API",
                runId: "privacy-save-fix"
            })
        }).catch(() => {});
        // #endregion
        return { ok: false, reason: "privacy API unavailable" };
    }

    const policyValue = block ? "disable_non_proxied_udp" : "default";

    try {
        await new Promise((resolve, reject) => {
            chrome.privacy.network.webRTCIPHandlingPolicy.set(
                { value: policyValue, scope: "regular" },
                () => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else resolve();
                }
            );
        });

        // #region agent log
        fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
            body: JSON.stringify({
                sessionId: "6573a3",
                location: "background/privacy-network.js:applyWebRtcPolicy",
                message: "WebRTC policy applied",
                data: { block, policy: policyValue },
                timestamp: Date.now(),
                hypothesisId: "WEBRTC-API",
                runId: "privacy-save-fix"
            })
        }).catch(() => {});
        // #endregion
        return { ok: true, policy: policyValue };
    } catch (err) {
        // #region agent log
        fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
            body: JSON.stringify({
                sessionId: "6573a3",
                location: "background/privacy-network.js:applyWebRtcPolicy",
                message: "WebRTC policy FAILED",
                data: { block, error: String(err) },
                timestamp: Date.now(),
                hypothesisId: "WEBRTC-API",
                runId: "privacy-save-fix"
            })
        }).catch(() => {});
        // #endregion
        return { ok: false, reason: String(err) };
    }
}
