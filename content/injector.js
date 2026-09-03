(function () {

    function requestSpoof() {
        chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (settings) => {
            if (settings?.spoofEnabled === false) return;
            chrome.runtime.sendMessage({ type: "REQUEST_SPOOF" });
        });
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === "SNOOPER_PROFILE") requestSpoof();
    });

    chrome.storage.local.get(["snooper_active_profile", "snooper_settings"], (res) => {
        if (res?.snooper_settings?.spoofEnabled === false) return;
        if (res?.snooper_active_profile?.userAgent) requestSpoof();
    });

})();
