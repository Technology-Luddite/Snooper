/********************************************************************
 * Per-tab DNR block stats (requires declarativeNetRequestFeedback)
 ********************************************************************/

const NetworkStats = (() => {

    const byTab = new Map();

    function record(tabId, info) {
        if (tabId == null || tabId < 0) return;
        let rec = byTab.get(tabId);
        if (!rec) {
            rec = { count: 0, recent: [] };
            byTab.set(tabId, rec);
        }
        rec.count += 1;
        rec.recent.unshift({
            url: info.request?.url || "",
            ruleId: info.rule?.ruleId,
            ts: Date.now()
        });
        if (rec.recent.length > 25) rec.recent.length = 25;
    }

    function initListeners() {
        if (chrome.declarativeNetRequest?.onRuleMatchedDebug) {
            chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
                record(info.request?.tabId, info);
            });
        }
        chrome.tabs.onRemoved.addListener((tabId) => byTab.delete(tabId));
    }

    function getForTab(tabId) {
        return byTab.get(tabId) || { count: 0, recent: [] };
    }

    function resetTab(tabId) {
        byTab.delete(tabId);
    }

    return { initListeners, getForTab, resetTab };

})();
