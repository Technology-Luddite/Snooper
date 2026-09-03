/********************************************************************
 * Privacy DNR rules — referrer strip + tracker block + custom domains
 ********************************************************************/

const REFERRER_RULE_ID = 100;
const TRACKER_RULE_START = 101;
const TRACKER_RULE_END = 150;
const CUSTOM_BLOCK_START = 151;
const CUSTOM_BLOCK_END = 200;

const PRIVACY_REMOVE_IDS = [REFERRER_RULE_ID];
for (let i = TRACKER_RULE_START; i <= TRACKER_RULE_END; i++) PRIVACY_REMOVE_IDS.push(i);
for (let i = CUSTOM_BLOCK_START; i <= CUSTOM_BLOCK_END; i++) PRIVACY_REMOVE_IDS.push(i);

let trackerDomainsCache = null;

async function loadTrackerDomains() {
    if (typeof JsonConfigStore !== "undefined") {
        return JsonConfigStore.load("trackers.json");
    }
    if (trackerDomainsCache) return trackerDomainsCache;
    try {
        const url = chrome.runtime.getURL("sidepanel/modules/fingerprint-data/trackers.json");
        const res = await fetch(url);
        trackerDomainsCache = await res.json();
    } catch (e) {
        trackerDomainsCache = [];
    }
    return trackerDomainsCache;
}

async function buildPrivacyRules(options = {}) {
    const stripReferrer = options.stripReferrer === true;
    const blockTrackers = options.blockTrackers === true;
    const rules = [];

    if (stripReferrer) {
        rules.push({
            id: REFERRER_RULE_ID,
            priority: 2,
            action: {
                type: "modifyHeaders",
                requestHeaders: [{ header: "Referer", operation: "remove" }]
            },
            condition: {
                urlFilter: "*",
                resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "other"]
            }
        });
    }

    if (blockTrackers) {
        const domains = await loadTrackerDomains();
        const chunkSize = 10;
        let ruleId = TRACKER_RULE_START;
        for (let i = 0; i < domains.length && ruleId <= TRACKER_RULE_END; i += chunkSize) {
            const chunk = domains.slice(i, i + chunkSize);
            rules.push({
                id: ruleId++,
                priority: 2,
                action: { type: "block" },
                condition: {
                    requestDomains: chunk,
                    resourceTypes: ["script", "xmlhttprequest", "image", "sub_frame", "other", "fetch"]
                }
            });
        }
    }

    if (typeof NetworkBlockStore !== "undefined") {
        const custom = await NetworkBlockStore.get();
        let ruleId = CUSTOM_BLOCK_START;
        for (const domain of custom) {
            if (ruleId > CUSTOM_BLOCK_END) break;
            rules.push({
                id: ruleId++,
                priority: 3,
                action: { type: "block" },
                condition: {
                    requestDomains: [domain],
                    resourceTypes: [
                        "main_frame", "script", "xmlhttprequest", "image",
                        "sub_frame", "other", "fetch", "stylesheet", "media", "font"
                    ]
                }
            });
        }
    }

    return rules;
}

async function applyPrivacyRules(options = {}) {
    if (!chrome.declarativeNetRequest) {
        return { ok: false, reason: "DNR unavailable" };
    }

    const rules = await buildPrivacyRules(options);

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: PRIVACY_REMOVE_IDS,
        addRules: rules
    });

    return {
        ok: true,
        ruleCount: rules.length,
        stripReferrer: options.stripReferrer === true,
        blockTrackers: options.blockTrackers === true
    };
}

async function clearPrivacyRules() {
    if (!chrome.declarativeNetRequest) return;
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: PRIVACY_REMOVE_IDS,
        addRules: []
    });
}
