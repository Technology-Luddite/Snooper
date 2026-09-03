/********************************************************************
 * Profile Store — named saved profiles (CRUD + activate)
 ********************************************************************/

const ProfileStore = (() => {

    const PROFILES_KEY = "snooper_saved_profiles";
    const ACTIVE_ID_KEY = "snooper_active_profile_id";
    const UI_STATE_KEY = "snooper_fingerprint_profile";

    function defaultState() {
        return {
            screen: null,
            device: null,
            hardwareConcurrency: null,
            deviceMemory: null,
            maxTouchPoints: null,
            connection: null,
            timezone: null,
            browser: null,
            webgl: null,
            geolocation: null,
            language: null,
            platform: null,
            spoofCanvas: true,
            spoofWebgl: true,
            spoofAudio: false,
            spoofMatchMedia: true,
            spoofConnection: true,
            spoofGeolocation: true,
            spoofPrivacy: true,
            spoofFonts: true,
            spoofWorkers: true,
            blockWebRTC: false,
            doNotTrack: null,
            globalPrivacyControl: false,
            stealthMode: false
        };
    }

    function uid() {
        return crypto.randomUUID?.() || `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }

    async function loadRaw() {
        const res = await chrome.storage.local.get([PROFILES_KEY, ACTIVE_ID_KEY]);
        return {
            profiles: Array.isArray(res[PROFILES_KEY]) ? res[PROFILES_KEY] : [],
            activeId: res[ACTIVE_ID_KEY] || null
        };
    }

    async function saveRaw(profiles, activeId) {
        const data = { [PROFILES_KEY]: profiles };
        if (activeId !== undefined) data[ACTIVE_ID_KEY] = activeId;
        await chrome.storage.local.set(data);
    }

    async function migrateLegacy() {
        const { profiles, activeId } = await loadRaw();
        if (profiles.length) return { profiles, activeId };

        const legacy = await chrome.storage.local.get(UI_STATE_KEY);
        const state = { ...defaultState(), ...(legacy[UI_STATE_KEY] || {}) };
        const id = uid();
        const now = new Date().toISOString();
        const entry = { id, name: "Default", state, createdAt: now, updatedAt: now };
        await saveRaw([entry], id);
        await chrome.storage.local.set({ [UI_STATE_KEY]: state });
        return { profiles: [entry], activeId: id };
    }

    async function list() {
        const { profiles, activeId } = await migrateLegacy();
        return { profiles, activeId };
    }

    async function getActive() {
        const { profiles, activeId } = await list();
        return profiles.find(p => p.id === activeId) || profiles[0] || null;
    }

    async function getById(id) {
        const { profiles } = await list();
        return profiles.find(p => p.id === id) || null;
    }

    async function create(name, state) {
        const { profiles } = await list();
        const now = new Date().toISOString();
        const entry = {
            id: uid(),
            name: (name || "New profile").trim() || "New profile",
            state: { ...defaultState(), ...state },
            createdAt: now,
            updatedAt: now
        };
        profiles.push(entry);
        await saveRaw(profiles);
        return entry;
    }

    async function update(id, { name, state } = {}) {
        const { profiles } = await list();
        const idx = profiles.findIndex(p => p.id === id);
        if (idx < 0) return null;

        const entry = profiles[idx];
        if (name != null) entry.name = String(name).trim() || entry.name;
        if (state != null) entry.state = { ...defaultState(), ...state };
        entry.updatedAt = new Date().toISOString();
        profiles[idx] = entry;
        await saveRaw(profiles);
        return entry;
    }

    async function remove(id) {
        let { profiles, activeId } = await list();
        profiles = profiles.filter(p => p.id !== id);
        if (!profiles.length) {
            const fresh = await create("Default", defaultState());
            activeId = fresh.id;
        } else if (activeId === id) {
            activeId = profiles[0].id;
        }
        await saveRaw(profiles, activeId);
        if (activeId) {
            const active = profiles.find(p => p.id === activeId);
            if (active) await chrome.storage.local.set({ [UI_STATE_KEY]: active.state });
        }
        return { profiles, activeId };
    }

    async function activate(id) {
        const { profiles } = await list();
        const entry = profiles.find(p => p.id === id);
        if (!entry) return null;

        await saveRaw(profiles, id);
        await chrome.storage.local.set({ [UI_STATE_KEY]: entry.state });
        return entry;
    }

    async function saveActiveState(state) {
        const { activeId } = await list();
        if (!activeId) {
            const created = await create("Default", state);
            await activate(created.id);
            return created;
        }
        return update(activeId, { state });
    }

    return {
        defaultState,
        list,
        getActive,
        getById,
        create,
        update,
        remove,
        activate,
        saveActiveState,
        UI_STATE_KEY
    };

})();
