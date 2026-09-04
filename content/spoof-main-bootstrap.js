(function () {
    if (window.__snooperSpoofApplied || window.__snooperSpoofPending) return;
    window.__snooperSpoofPending = true;

    try {
        chrome.runtime.sendMessage({ type: "GET_SPOOF_PROFILE", url: location.href }, (res) => {
            window.__snooperSpoofPending = false;
            if (chrome.runtime.lastError || !res?.profile) return;
            if (typeof applySnooperProfile !== "function") return;
            applySnooperProfile(res.profile);
            window.__snooperSpoofApplied = true;
        });
    } catch (e) {
        window.__snooperSpoofPending = false;
    }
})();
