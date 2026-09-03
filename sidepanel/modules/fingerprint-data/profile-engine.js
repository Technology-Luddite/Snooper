/********************************************************************
 * Snooper Profile Engine v3
 * Single active profile (global state + reactive updates)
 ********************************************************************/

const ProfileEngine = (() => {

    const STORAGE_KEY = "snooper_active_profile";

    let activeProfile = null;
    let listeners = [];

    function log(...args) {
        console.log("[ProfileEngine]", ...args);
    }

    function notify() {
        listeners.forEach(fn => {
            try { fn(activeProfile); } catch (e) {}
        });
    }

    function subscribe(fn) {
        listeners.push(fn);
        return () => {
            listeners = listeners.filter(l => l !== fn);
        };
    }

    async function load() {
        const res = await chrome.storage.local.get(STORAGE_KEY);
        activeProfile = res?.[STORAGE_KEY] || null;
        log("Loaded profile", activeProfile);
        notify();
        return activeProfile;
    }

    async function save(profile = {}) {
        activeProfile = profile;

        const data = {};
        data[STORAGE_KEY] = activeProfile;

        await chrome.storage.local.set(data);

        log("Saved profile", activeProfile);
        notify();

        return activeProfile;
    }

    async function reset() {
        activeProfile = null;
        await chrome.storage.local.remove(STORAGE_KEY);
        log("Reset profile");
        notify();
        return null;
    }

    function get() {
        return activeProfile;
    }

    function setActive(profile) {
        return save(profile);
    }

    return {
        load,
        save,
        reset,
        get,
        setActive,
        subscribe
    };

})();
