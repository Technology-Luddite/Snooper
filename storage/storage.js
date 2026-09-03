/********************************************************************
 * Snooper Storage Module
 * Handles site storage inspection and cleanup
 ********************************************************************/

let currentOrigin = "";

/**
 * Get current active tab URL origin
 */
async function getOrigin() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url;

    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

/**
 * Scan storage types available on current site
 */
async function scanStorage() {
    currentOrigin = await getOrigin();

    if (!currentOrigin) {
        document.getElementById("output").textContent = "No valid site detected";
        return;
    }

    const results = [];

    // localStorage
    try {
        const ls = localStorage.length;
        results.push({ type: "localStorage", items: ls });
    } catch {
        results.push({ type: "localStorage", items: "blocked" });
    }

    // sessionStorage
    try {
        const ss = sessionStorage.length;
        results.push({ type: "sessionStorage", items: ss });
    } catch {
        results.push({ type: "sessionStorage", items: "blocked" });
    }

    // IndexedDB (approx detection only)
    let indexedDBStatus = "unknown";
    try {
        indexedDBStatus = indexedDB ? "available" : "unavailable";
    } catch {
        indexedDBStatus = "blocked";
    }

    results.push({ type: "indexedDB", items: indexedDBStatus });

    // Cache API check
    let cacheStatus = "unknown";
    try {
        cacheStatus = "available";
    } catch {
        cacheStatus = "blocked";
    }

    results.push({ type: "cacheStorage", items: cacheStatus });

    render(results);
}

/**
 * Render results UI
 */
function render(data) {
    const out = document.getElementById("output");
    out.innerHTML = "";

    data.forEach(item => {
        const div = document.createElement("div");
        div.className = "item";
        div.textContent = `${item.type}: ${item.items}`;
        out.appendChild(div);
    });
}

/**
 * Clear all site storage (best-effort)
 */
async function clearAllStorage() {
    const origin = await getOrigin();

    if (!origin) return;

    // localStorage
    try {
        localStorage.clear();
    } catch {}

    // sessionStorage
    try {
        sessionStorage.clear();
    } catch {}

    // IndexedDB
    try {
        if (indexedDB && indexedDB.databases) {
            const dbs = await indexedDB.databases();
            dbs.forEach(db => {
                if (db.name) indexedDB.deleteDatabase(db.name);
            });
        }
    } catch {}

    // Cache Storage
    try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
    } catch {}

    document.getElementById("output").textContent =
        "✔ Storage cleared for current site";
}

/**
 * Event bindings
 */
document.getElementById("scan").addEventListener("click", scanStorage);
document.getElementById("clearAll").addEventListener("click", clearAllStorage);