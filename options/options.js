const view = document.getElementById("view");

function render(tab) {
    if (!view) return;

    view.innerHTML = `
        <h2>${tab.toUpperCase()}</h2>
        <p>Core system active - module placeholder</p>
    `;
}

async function loadTab(tab) {
    try {
        await SnooperCore.route(tab);
        render(tab);
    } catch (err) {
        console.error("[Options] loadTab error:", err);
    }
}

function bindButtons() {
    document.querySelectorAll("button[data-tab]").forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            if (!tab) return;
            loadTab(tab);
        });
    });
}

async function restore() {
    try {
        const state = await SnooperCore.getState();
        render(state.lastTab || "hub");
    } catch (err) {
        console.error("[Options] restore error:", err);
    }
}

(function init() {
    bindButtons();
    restore();
})();