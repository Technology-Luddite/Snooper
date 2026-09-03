/********************************************************************
 * Theme — light/dark mode (persisted in snooper_settings.theme)
 ********************************************************************/

const Theme = (() => {

    const DEFAULT = "dark";

    function apply(theme) {
        const t = theme === "light" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", t);
        return t;
    }

    async function init() {
        if (typeof SettingsStore === "undefined") {
            apply(DEFAULT);
            return DEFAULT;
        }
        const s = await SettingsStore.get();
        return apply(s.theme || DEFAULT);
    }

    async function set(theme) {
        const t = theme === "light" ? "light" : "dark";
        apply(t);
        if (typeof SettingsStore !== "undefined") {
            await SettingsStore.set({ theme: t });
        }
        return t;
    }

    return { apply, init, set, DEFAULT };

})();
