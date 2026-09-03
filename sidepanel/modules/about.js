/********************************************************************
 * About — extension info from about.json + manifest version
 ********************************************************************/

const AboutModule = (() => {

    function esc(s) {
        return String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    async function loadAbout() {
        return JsonConfigStore.load("about.json");
    }

    async function render() {
        const about = await loadAbout();
        const manifest = chrome.runtime.getManifest();
        const name = about.extensionName || manifest.name;
        const version = manifest.version;
        const author = about.author || "";
        const email = (about.email || "").trim();
        const website = (about.website || "").trim();
        const text = about.about || manifest.description || "";

        return `
            <h2>ℹ️ About</h2>
            <div class="about-card panel panel-info">
                <div class="about-title">${esc(name)}</div>
                <div class="about-version text-sm text-dim">Version ${esc(version)}</div>
                ${author ? `<div class="about-meta mt-sm"><span class="text-dim">Author</span><br>${esc(author)}</div>` : ""}
                ${email ? `<div class="about-meta mt-sm"><span class="text-dim">Email</span><br><a href="mailto:${esc(email)}">${esc(email)}</a></div>` : ""}
                ${website ? `<div class="about-meta mt-sm"><span class="text-dim">Website</span><br><a href="${esc(website)}" target="_blank" rel="noopener">${esc(website)}</a></div>` : ""}
            </div>
            ${text ? `
                <div class="panel mt-sm">
                    <h3>About this extension</h3>
                    <p class="about-text">${esc(text)}</p>
                </div>` : ""}
            <p class="notice-block">Edit extension info in <strong>Settings → about.json</strong> (validated form fields).</p>`;
    }

    return { render };

})();
