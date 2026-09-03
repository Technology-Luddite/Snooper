/********************************************************************
 * Snooper Side Panel v8 — stable view delegation
 ********************************************************************/

function log(...args) {
    console.log("[Snooper Panel]", ...args);
}

function runModuleAction(module, id, event) {
    if (typeof module?.handleAction !== "function") return false;
    void module.handleAction(id, event).catch((err) => {
        console.error("[Panel] action error:", id, err);
    });
    return true;
}

async function render(tab) {
    try {
        const view = document.getElementById("view");
        if (!view) {
            console.error("[Panel] view missing");
            LogsModule?.add?.("error", "View missing in render");
            return;
        }

        const moduleFn = Modules[tab];
        if (!moduleFn) {
            LogsModule?.add?.("warn", "Unknown module: " + tab);
            view.innerHTML = `<h2>Unknown Module</h2><p>${tab}</p>`;
            return;
        }

        const result = await Promise.resolve(moduleFn());
        view.innerHTML = result;
        log("Rendered:", tab);
    } catch (err) {
        console.error("[Panel] render error:", err);
        LogsModule?.add?.("error", "Render crash: " + tab, String(err));
    }
}

function bindNavigation() {
    document.querySelectorAll("button[data-tab]").forEach(btn => {
        btn.addEventListener("click", () => {
            render(btn.getAttribute("data-tab"));
        });
    });
}

function bindViewDelegation() {
    const view = document.getElementById("view");
    if (!view || view.__snooperDelegation) return;
    view.__snooperDelegation = true;

    view.addEventListener("click", (e) => {
        const btn = e.target?.closest?.("button");
        const jsonEl = e.target?.closest?.("[data-json-action]");
        if (btn?.dataset?.leakJump) {
            runModuleAction(FingerprintModule, "leak-jump", e);
            return;
        }
        if (jsonEl) {
            runModuleAction(SettingsModule, "settings-json-action", e);
            return;
        }
        if (btn?.dataset?.cookieIndex != null || btn?.dataset?.cookieRemoveDomain
            || btn?.dataset?.cookieEditSite || btn?.dataset?.cookieDeleteSite) {
            runModuleAction(CookiesModule, "cookie-row-action", e);
            return;
        }
        if (btn?.dataset?.extAction) {
            runModuleAction(ExtensionsModule, btn.id || "ext-row-action", e);
            return;
        }
        if (btn?.dataset?.netAction) {
            runModuleAction(NetworkModule, btn.id || "net-row-action", e);
            return;
        }
        if (!btn?.id) return;

        if (btn.id.startsWith("extensions-")) {
            runModuleAction(ExtensionsModule, btn.id, e);
            return;
        }
        if (btn.id.startsWith("network-")) {
            runModuleAction(NetworkModule, btn.id, e);
            return;
        }
        if (btn.id.startsWith("cookie-")) {
            runModuleAction(CookiesModule, btn.id, e);
            return;
        }
        if (btn.id.startsWith("admin-")) {
            runModuleAction(HubModule, btn.id, e);
            return;
        }
        if (btn.id.startsWith("settings-")) {
            runModuleAction(SettingsModule, btn.id, e);
            return;
        }
        runModuleAction(FingerprintModule, btn.id, e);
    });

    view.addEventListener("change", (e) => {
        if (e.target?.name === "cookie-site-mode") {
            runModuleAction(CookiesModule, "cookie-site-mode-change", e);
            return;
        }

        const id = e.target?.id;
        if (!id) return;

        if (id === "profile-select") {
            runModuleAction(FingerprintModule, "profile-select-change", e);
            return;
        }
        if (id === "cookie-filter") {
            runModuleAction(CookiesModule, id, e);
            return;
        }
        if (id.startsWith("cookie-clear-")) {
            runModuleAction(CookiesModule, "cookie-save-rules", e);
            return;
        }
        if (id === "settings-json-file") {
            runModuleAction(SettingsModule, id, e);
            return;
        }
        if (id === "settings-strip-referrer" || id === "settings-block-trackers") {
            runModuleAction(SettingsModule, id, e);
            return;
        }
        if (id === "settings-import-backup-file") {
            runModuleAction(SettingsModule, id, e);
            return;
        }
        if (id === "extensions-tier-filter" || id === "extensions-scope-filter" || id === "extensions-show-disabled") {
            runModuleAction(ExtensionsModule, id, e);
            return;
        }
        if (id === "network-strip-referrer" || id === "network-block-trackers" || id === "network-auto-refresh") {
            runModuleAction(NetworkModule, id, e);
            return;
        }
        if (id === "network-type-filter" || id === "network-party-filter" || id === "network-sort") {
            runModuleAction(NetworkModule, id, e);
            return;
        }
        if (id === "theme-light") {
            runModuleAction(HubModule, "theme-toggle", e);
        }
    });

    view.addEventListener("input", (e) => {
        if (e.target?.id === "cookie-search") {
            clearTimeout(view.__cookieSearchTimer);
            view.__cookieSearchTimer = setTimeout(() => {
                runModuleAction(CookiesModule, "cookie-search", e);
                window.render?.("cookies");
            }, 300);
        }
        if (e.target?.id === "network-search") {
            clearTimeout(view.__netSearchTimer);
            view.__netSearchTimer = setTimeout(() => {
                runModuleAction(NetworkModule, "network-search", e);
                window.render?.("network");
            }, 300);
        }
        if (e.target?.id === "extensions-search") {
            clearTimeout(view.__extSearchTimer);
            view.__extSearchTimer = setTimeout(() => {
                runModuleAction(ExtensionsModule, "extensions-search", e);
                window.render?.("extensions");
            }, 300);
        }
    });
}

const Modules = {
    hub() {
        return HubModule?.render?.() || `<h2>Admin</h2><p>Hub module missing</p>`;
    },

    async cookies() {
        if (typeof CookiesModule?.render !== "function") {
            return `<h2>🍪 Cookies</h2><p style="color:red;">Cookie module failed to load — reload extension.</p>`;
        }
        return CookiesModule.render();
    },

    fingerprint() {
        return FingerprintModule?.render?.() || `<p>Fingerprint module missing</p>`;
    },

    extensions() {
        return ExtensionsModule?.render?.() || `<p>Extensions module missing</p>`;
    },

    storage() {
        return StorageModule?.render?.() || `<p>Storage module missing</p>`;
    },

    network() {
        return NetworkModule?.render?.() || `<p>Network module missing</p>`;
    },

    identity() {
        return IdentityModule?.render?.() || `<p>Identity module missing</p>`;
    },

    logs() {
        return LogsModule?.render?.() || `<p>Logs module missing</p>`;
    },

    async settings() {
        if (typeof SettingsModule?.render !== "function") {
            return `<p>Settings module missing</p>`;
        }
        return SettingsModule.render();
    },

    async about() {
        if (typeof AboutModule?.render !== "function") {
            return `<p>About module missing</p>`;
        }
        return AboutModule.render();
    }
};

document.addEventListener("DOMContentLoaded", () => {
    log("Booting Snooper Panel v9...");

    Instrumentation.init();

    if (!render.__wrapped) {
        render = Instrumentation.wrapRender(render);
        render.__wrapped = true;
    }

    if (!bindNavigation.__wrapped) {
        bindNavigation = Instrumentation.wrapNavigation(bindNavigation);
        bindNavigation.__wrapped = true;
    }

    window.render = render;

    bindNavigation();
    bindViewDelegation();

    void Theme.init().then(() => render("hub"));
});
