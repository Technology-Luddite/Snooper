/********************************************************************
 * MAIN-world spoof v3 — prototype + instance, anti-detection layers
 ********************************************************************/

function applySnooperProfile(p) {
    if (!p || typeof p !== "object") return { ok: false, reason: "no-profile" };

    function patch(proto, instance, prop, value) {
        if (value === undefined) return;
        const desc = { get: () => value, configurable: true };
        try { Object.defineProperty(proto, prop, desc); } catch (e) {}
        if (instance) {
            try { Object.defineProperty(instance, prop, desc); } catch (e) {}
        }
    }

    function hideProperty(proto, instance, prop) {
        const desc = { get: () => undefined, configurable: true };
        try { Object.defineProperty(proto, prop, desc); } catch (e) {}
        if (instance) {
            try { Object.defineProperty(instance, prop, desc); } catch (e) {}
        }
    }

    function isChromiumUA(ua) {
        return /Chrome|Chromium|Edg\//.test(ua || "") && !/Firefox/i.test(ua || "");
    }

    const locale = p.language || (Array.isArray(p.languages) ? p.languages[0] : null);
    const nav = navigator;
    const win = window;

    /* ---- navigator core ---- */
    if (p.userAgent) patch(Navigator.prototype, nav, "userAgent", p.userAgent);
    if (p.platform) patch(Navigator.prototype, nav, "platform", p.platform);
    if (locale) patch(Navigator.prototype, nav, "language", locale);
    if (p.languages) {
        const langs = Object.freeze(Array.isArray(p.languages) ? [...p.languages] : [p.languages]);
        patch(Navigator.prototype, nav, "languages", langs);
    }
    if (p.vendor !== undefined) patch(Navigator.prototype, nav, "vendor", p.vendor);
    if (p.productSub) patch(Navigator.prototype, nav, "productSub", p.productSub);
    if (p.oscpu) patch(Navigator.prototype, nav, "oscpu", p.oscpu);
    if (p.pdfViewerEnabled !== undefined) {
        patch(Navigator.prototype, nav, "pdfViewerEnabled", p.pdfViewerEnabled);
    }
    if (p.hardwareConcurrency != null) {
        patch(Navigator.prototype, nav, "hardwareConcurrency", p.hardwareConcurrency);
    }
    if (p.deviceMemory != null) patch(Navigator.prototype, nav, "deviceMemory", p.deviceMemory);
    if (p.maxTouchPoints != null) patch(Navigator.prototype, nav, "maxTouchPoints", p.maxTouchPoints);

    if (p.userAgent) {
        patch(Navigator.prototype, nav, "appVersion", p.userAgent.replace(/^Mozilla\//, ""));
    }

    if (p.spoof?.webdriver !== false) patch(Navigator.prototype, nav, "webdriver", false);

    /* ---- privacy signals (GPC + DNT) — JS + HTTP via DNR ---- */
    if (p.privacy && p.spoof?.privacy !== false) {
        if ("globalPrivacyControl" in p.privacy) {
            patch(Navigator.prototype, nav, "globalPrivacyControl", p.privacy.globalPrivacyControl);
            try {
                Object.defineProperty(window, "globalPrivacyControl", {
                    get: () => p.privacy.globalPrivacyControl,
                    configurable: true
                });
            } catch (e) {}
        }
        if (p.privacy.doNotTrack != null && p.privacy.doNotTrack !== "") {
            patch(Navigator.prototype, nav, "doNotTrack", p.privacy.doNotTrack);
        }
        // #region agent log
        fetch("http://127.0.0.1:7931/ingest/a9524cea-8d74-4e9b-be4b-b311cfb98f1c", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6573a3" },
            body: JSON.stringify({
                sessionId: "6573a3",
                location: "background/spoof-fn.js:privacy",
                message: "GPC/DNT JS patch applied",
                data: {
                    gpc: p.privacy.globalPrivacyControl,
                    dnt: p.privacy.doNotTrack,
                    navGpc: nav.globalPrivacyControl,
                    stealthMode: !!p.stealthMode
                },
                timestamp: Date.now(),
                hypothesisId: "GPC-JS",
                runId: "gpc-fix"
            })
        }).catch(() => {});
        // #endregion
    }

    /* ---- permissions API — deny sensors when stealth mode ---- */
    if (p.stealthMode && nav.permissions?.query) {
        const origPermQuery = nav.permissions.query.bind(nav.permissions);
        nav.permissions.query = function (desc) {
            const sensitive = ["geolocation", "camera", "microphone", "notifications"];
            if (desc?.name && sensitive.includes(desc.name) && !p.geolocation) {
                return Promise.resolve({ state: "denied", onchange: null });
            }
            return origPermQuery(desc);
        };
    }

    /* ---- userAgentData ---- */
    if (p.userAgentData) {
        const uad = p.userAgentData;
        const fakeUAD = {
            brands: uad.brands || [],
            mobile: !!uad.mobile,
            platform: uad.platform || "",
            getHighEntropyValues: async (hints) => {
                const out = {};
                if (!hints) return out;
                for (const h of hints) {
                    if (h === "platform") out.platform = uad.platform || "";
                    if (h === "platformVersion") out.platformVersion = uad.platformVersion || "";
                    if (h === "architecture") out.architecture = uad.architecture || "";
                    if (h === "bitness") out.bitness = uad.bitness || "";
                    if (h === "model") out.model = uad.model || "";
                    if (h === "uaFullVersion") out.uaFullVersion = uad.uaFullVersion || "";
                    if (h === "fullVersionList") out.fullVersionList = uad.brands || [];
                }
                return out;
            },
            toJSON: () => ({
                brands: uad.brands || [],
                mobile: !!uad.mobile,
                platform: uad.platform || ""
            })
        };
        patch(Navigator.prototype, nav, "userAgentData", fakeUAD);
    } else {
        hideProperty(Navigator.prototype, nav, "userAgentData");
    }

    if (p.userAgent && !isChromiumUA(p.userAgent)) {
        try {
            Object.defineProperty(window, "chrome", {
                get: () => undefined,
                configurable: true
            });
        } catch (e) {}
    }

    /* ---- network information ---- */
    if (p.spoof?.connection !== false && p.connection) {
        const c = p.connection;
        const fakeConn = {
            effectiveType: c.effectiveType || "4g",
            downlink: c.downlink ?? 10,
            rtt: c.rtt ?? 50,
            saveData: false,
            addEventListener: () => {},
            removeEventListener: () => {}
        };
        patch(Navigator.prototype, nav, "connection", fakeConn);
    }

    /* ---- document lang ---- */
    function setDocLang() {
        if (!locale || !document.documentElement) return;
        try { document.documentElement.setAttribute("lang", locale); } catch (e) {}
    }
    setDocLang();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setDocLang, { once: true });
    }

    /* ---- Intl locale + timezone ---- */
    if (locale || p.timezone) {
        const tz = p.timezone;
        function wrapResolved(inst) {
            const orig = inst.resolvedOptions.bind(inst);
            inst.resolvedOptions = function () {
                const o = orig();
                if (locale) o.locale = locale;
                if (tz) o.timeZone = tz;
                return o;
            };
            return inst;
        }
        function patchIntlCtor(OrigCtor) {
            if (!OrigCtor) return OrigCtor;
            const Patched = function (locales, options, ...rest) {
                let loc = locales;
                if (loc === undefined || loc === null) loc = locale;
                else if (Array.isArray(loc) && loc.length === 0 && locale) loc = [locale];
                return wrapResolved(new OrigCtor(loc, options, ...rest));
            };
            Patched.prototype = OrigCtor.prototype;
            if (OrigCtor.supportedLocalesOf) Patched.supportedLocalesOf = OrigCtor.supportedLocalesOf;
            return Patched;
        }
        Intl.DateTimeFormat = patchIntlCtor(Intl.DateTimeFormat);
        if (Intl.NumberFormat) Intl.NumberFormat = patchIntlCtor(Intl.NumberFormat);
        if (Intl.Collator) Intl.Collator = patchIntlCtor(Intl.Collator);
        if (Intl.PluralRules) Intl.PluralRules = patchIntlCtor(Intl.PluralRules);
        if (Intl.ListFormat) Intl.ListFormat = patchIntlCtor(Intl.ListFormat);
        if (Intl.RelativeTimeFormat) Intl.RelativeTimeFormat = patchIntlCtor(Intl.RelativeTimeFormat);
        if (Intl.DisplayNames) Intl.DisplayNames = patchIntlCtor(Intl.DisplayNames);
    }

    if (p.utcOffsetMinutes != null) {
        const offset = p.utcOffsetMinutes;
        const OrigDate = Date;
        const PatchedDate = function (...args) {
            if (args.length === 0) return new OrigDate();
            return new OrigDate(...args);
        };
        PatchedDate.prototype = OrigDate.prototype;
        PatchedDate.now = OrigDate.now;
        PatchedDate.parse = OrigDate.parse;
        PatchedDate.UTC = OrigDate.UTC;
        PatchedDate.prototype.getTimezoneOffset = function () { return offset; };
        window.Date = PatchedDate;
    }

    /* ---- screen ---- */
    if (p.screen) {
        const s = p.screen;
        if (s.width != null) patch(Screen.prototype, screen, "width", s.width);
        if (s.height != null) patch(Screen.prototype, screen, "height", s.height);
        if (s.colorDepth != null) {
            patch(Screen.prototype, screen, "colorDepth", s.colorDepth);
            patch(Screen.prototype, screen, "pixelDepth", s.colorDepth);
        }
        if (s.width != null) patch(Screen.prototype, screen, "availWidth", s.availWidth ?? s.width);
        if (s.height != null) {
            patch(Screen.prototype, screen, "availHeight", s.availHeight ?? Math.max(0, s.height - (s.mobile ? 0 : 40)));
        }
        if (s.availLeft != null) patch(Screen.prototype, screen, "availLeft", s.availLeft);
        if (s.availTop != null) patch(Screen.prototype, screen, "availTop", s.availTop);
        if (s.mobile && s.width && s.height) {
            const type = s.height >= s.width ? "portrait-primary" : "landscape-primary";
            const fakeOrientation = {
                type,
                angle: type.startsWith("portrait") ? 0 : 90,
                addEventListener: () => {},
                removeEventListener: () => {}
            };
            patch(Screen.prototype, screen, "orientation", fakeOrientation);
        }
    }

    /* ---- window dimensions + DPR ---- */
    if (p.innerWidth != null) patch(Window.prototype, win, "innerWidth", p.innerWidth);
    if (p.innerHeight != null) patch(Window.prototype, win, "innerHeight", p.innerHeight);
    if (p.outerWidth != null) patch(Window.prototype, win, "outerWidth", p.outerWidth);
    if (p.outerHeight != null) patch(Window.prototype, win, "outerHeight", p.outerHeight);
    if (p.screenX != null) patch(Window.prototype, win, "screenX", p.screenX);
    if (p.screenY != null) patch(Window.prototype, win, "screenY", p.screenY);
    if (p.devicePixelRatio != null) patch(Window.prototype, win, "devicePixelRatio", p.devicePixelRatio);

    /* ---- visualViewport ---- */
    if (win.visualViewport && p.innerWidth != null && p.innerHeight != null) {
        const vv = win.visualViewport;
        patch(Object.getPrototypeOf(vv), vv, "width", p.innerWidth);
        patch(Object.getPrototypeOf(vv), vv, "height", p.innerHeight);
        patch(Object.getPrototypeOf(vv), vv, "scale", 1);
    }

    /* ---- matchMedia consistency ---- */
    if (p.spoof?.matchMedia !== false && p.matchMedia) {
        const mm = p.matchMedia;
        const origMatchMedia = win.matchMedia.bind(win);
        win.matchMedia = function (query) {
            const q = String(query).toLowerCase();
            const fakeMatch = (matches) => ({
                matches,
                media: query,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                onchange: null,
                dispatchEvent: () => true
            });

            if (q.includes("pointer: coarse") && mm.pointerCoarse != null) {
                return fakeMatch(!!mm.pointerCoarse);
            }
            if (q.includes("pointer: fine") && mm.pointerCoarse != null) {
                return fakeMatch(!mm.pointerCoarse);
            }
            if (q.includes("hover: hover") && mm.hoverNone != null) {
                return fakeMatch(!mm.hoverNone);
            }
            if (q.includes("hover: none") && mm.hoverNone != null) {
                return fakeMatch(!!mm.hoverNone);
            }
            if (q.includes("orientation: portrait") && mm.portrait != null) {
                return fakeMatch(!!mm.portrait);
            }
            if (q.includes("orientation: landscape") && mm.portrait != null) {
                return fakeMatch(!mm.portrait);
            }
            if (mm.devicePixelRatio != null) {
                const dppx = q.match(/(-webkit-device-pixel-ratio|device-pixel-ratio|resolution):\s*([\d.]+)/);
                if (dppx) {
                    const expected = parseFloat(dppx[2]);
                    return fakeMatch(Math.abs(mm.devicePixelRatio - expected) < 0.01);
                }
            }
            return origMatchMedia(query);
        };
    }

    /* ---- canvas ---- */
    if (p.spoof?.canvas !== false) {
        window.__snooperCanvasProfile = p;

        if (!window.__snooperCanvasHooksInstalled) {
        window.__snooperCanvasHooksInstalled = true;

        function profileCanvasSeed() {
            const cp = window.__snooperCanvasProfile || {};
            const seedStr = [
                cp.userAgent || "",
                cp.platform || "",
                cp.rotationMeta?.generation ?? "",
                cp.rotationMeta?.sessionId ?? "",
                cp.webgl?.renderer || ""
            ].join("|");
            let canvasSeed = 2166136261;
            for (let i = 0; i < seedStr.length; i++) {
                canvasSeed ^= seedStr.charCodeAt(i);
                canvasSeed = Math.imul(canvasSeed, 16777619);
            }
            return canvasSeed >>> 0;
        }

        function mulberry32(a) {
            return function () {
                a |= 0;
                a = (a + 0x6D2B79F5) | 0;
                let t = Math.imul(a ^ (a >>> 15), 1 | a);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }

        function noisePixelBuffer(data) {
            if (!data?.length) return;
            const canvasRand = mulberry32(profileCanvasSeed());
            const pixelCount = Math.floor(data.length / 4);
            if (!pixelCount) return;
            const touches = Math.min(pixelCount, Math.max(64, Math.floor(pixelCount * 0.025)));
            for (let t = 0; t < touches; t++) {
                const px = Math.floor(canvasRand() * pixelCount);
                const i = px * 4;
                const delta = (Math.floor(canvasRand() * 5) - 2) || 1;
                data[i] = (data[i] + delta + 256) & 255;
                data[i + 1] = (data[i + 1] + ((delta + 1) % 3) + 256) & 255;
                data[i + 2] = (data[i + 2] + ((delta + 2) % 5) + 256) & 255;
            }
        }

        function noiseImageData(img) {
            try { noisePixelBuffer(img.data); } catch (e) {}
            return img;
        }

        function noiseCanvasElement(canvas) {
            try {
                const w = canvas.width || 0;
                const h = canvas.height || 0;
                if (w < 1 || h < 1) return;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                if (ctx) {
                    const img = ctx.getImageData(0, 0, Math.min(w, 32), Math.min(h, 32));
                    noiseImageData(img);
                    ctx.putImageData(img, 0, 0);
                    return;
                }
                const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
                if (gl) {
                    const pixels = new Uint8Array(Math.min(w, 32) * Math.min(h, 32) * 4);
                    gl.readPixels(0, 0, Math.min(w, 32), Math.min(h, 32), gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    noisePixelBuffer(pixels);
                }
            } catch (e) {}
        }

        function patchCanvasExport(CanvasProto) {
            if (!CanvasProto?.prototype) return;
            const origToDataURL = CanvasProto.prototype.toDataURL;
            if (origToDataURL) {
                CanvasProto.prototype.toDataURL = function (...args) {
                    noiseCanvasElement(this);
                    return origToDataURL.apply(this, args);
                };
            }
            const origToBlob = CanvasProto.prototype.toBlob;
            if (origToBlob) {
                CanvasProto.prototype.toBlob = function (...args) {
                    noiseCanvasElement(this);
                    return origToBlob.apply(this, args);
                };
            }
        }

        patchCanvasExport(HTMLCanvasElement);
        if (typeof OffscreenCanvas !== "undefined") patchCanvasExport(OffscreenCanvas);

        const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function (...args) {
            return noiseImageData(origGetImageData.apply(this, args));
        };

        function patchGLReadPixels(proto) {
            if (!proto?.readPixels) return;
            const origReadPixels = proto.readPixels;
            proto.readPixels = function (...args) {
                origReadPixels.apply(this, args);
                const pixels = args[6];
                if (pixels?.length) noisePixelBuffer(pixels);
            };
        }
        patchGLReadPixels(WebGLRenderingContext?.prototype);
        patchGLReadPixels(WebGL2RenderingContext?.prototype);
        }
    }

    /* ---- WebGL ---- */
    if (p.spoof?.webgl !== false && p.webgl) {
        const wg = p.webgl;
        function patchGLProto(proto) {
            if (!proto) return;
            const origGetParam = proto.getParameter;
            const origGetExtensions = proto.getSupportedExtensions;
            proto.getParameter = function (param) {
                const dbg = this.getExtension("WEBGL_debug_renderer_info");
                if (dbg) {
                    if (param === dbg.UNMASKED_VENDOR_WEBGL) return wg.vendor;
                    if (param === dbg.UNMASKED_RENDERER_WEBGL) return wg.renderer;
                }
                if (param === 0x1F00) return wg.vendorStandard || wg.vendor;
                if (param === 0x1F01) return wg.rendererStandard || wg.renderer;
                return origGetParam.call(this, param);
            };
            if (origGetExtensions && wg.extensions?.length) {
                proto.getSupportedExtensions = function () {
                    return wg.extensions.slice();
                };
            }
        }
        patchGLProto(WebGLRenderingContext?.prototype);
        patchGLProto(WebGL2RenderingContext?.prototype);
    }

    /* ---- audio ---- */
    if (p.spoof?.audio) {
        const patchAC = (OrigAC) => {
            if (!OrigAC) return OrigAC;
            const Patched = function (...args) {
                const ctx = new OrigAC(...args);
                const origCreate = ctx.createOscillator.bind(ctx);
                ctx.createOscillator = function () {
                    const osc = origCreate();
                    const origConnect = osc.connect.bind(osc);
                    osc.connect = function (...cArgs) {
                        try { osc.frequency.value += 0.0001; } catch (e) {}
                        return origConnect(...cArgs);
                    };
                    return osc;
                };
                return ctx;
            };
            Patched.prototype = OrigAC.prototype;
            return Patched;
        };
        if (window.AudioContext) window.AudioContext = patchAC(window.AudioContext);
        if (window.webkitAudioContext) window.webkitAudioContext = patchAC(window.webkitAudioContext);
        if (window.OfflineAudioContext) window.OfflineAudioContext = patchAC(window.OfflineAudioContext);
        if (window.webkitOfflineAudioContext) {
            window.webkitOfflineAudioContext = patchAC(window.webkitOfflineAudioContext);
        }
    }

    /* ---- speech voices (locale consistency) ---- */
    if (locale && window.speechSynthesis) {
        const fakeVoices = [{
            name: "Default",
            lang: locale,
            default: true,
            localService: true,
            voiceURI: "default"
        }];
        speechSynthesis.getVoices = () => fakeVoices;
        const origAdd = speechSynthesis.addEventListener?.bind(speechSynthesis);
        if (origAdd) {
            speechSynthesis.addEventListener = function (type, fn) {
                if (type === "voiceschanged") setTimeout(() => fn(), 0);
                return origAdd(type, fn);
            };
        }
    }

    /* ---- font enumeration (platform-aligned list) ---- */
    if (p.spoof?.fonts !== false && p.fonts?.length && document.fonts) {
        const allowed = p.fonts;
        const allowedSet = new Set(allowed.map(f => f.toLowerCase()));
        const origCheck = document.fonts.check?.bind(document.fonts);
        if (origCheck) {
            document.fonts.check = function (font, text) {
                const fam = String(font).split(",")[0].trim().replace(/['"]/g, "").toLowerCase();
                if (!allowedSet.has(fam)) return false;
                return origCheck(font, text);
            };
        }
        document.fonts.forEach = function (cb) {
            allowed.forEach((family, i) => {
                cb({ family, status: "loaded", style: "normal", weight: "400" }, i, document.fonts);
            });
        };
    }

    /* ---- Worker context bootstrap (partial — same-origin dedicated workers) ---- */
    if (p.spoof?.workers !== false && typeof Worker !== "undefined") {
        const workerProfile = JSON.stringify({
            userAgent: p.userAgent,
            platform: p.platform,
            language: locale,
            languages: p.languages,
            hardwareConcurrency: p.hardwareConcurrency,
            deviceMemory: p.deviceMemory,
            maxTouchPoints: p.maxTouchPoints
        });
        const bootstrap = `(function(){var p=${workerProfile};function patch(o,k,v){try{Object.defineProperty(o,k,{get:function(){return v},configurable:true});}catch(e){}}var nav=self.navigator;if(!nav)return;if(p.userAgent)patch(Navigator.prototype,nav,"userAgent",p.userAgent);if(p.platform)patch(Navigator.prototype,nav,"platform",p.platform);if(p.language)patch(Navigator.prototype,nav,"language",p.language);if(p.languages)patch(Navigator.prototype,nav,"languages",Object.freeze(p.languages.slice()));if(p.hardwareConcurrency!=null)patch(Navigator.prototype,nav,"hardwareConcurrency",p.hardwareConcurrency);if(p.deviceMemory!=null)patch(Navigator.prototype,nav,"deviceMemory",p.deviceMemory);if(p.maxTouchPoints!=null)patch(Navigator.prototype,nav,"maxTouchPoints",p.maxTouchPoints);patch(Navigator.prototype,nav,"webdriver",false);})();`;
        const OrigWorker = window.Worker;
        window.Worker = function (scriptURL, options) {
            if (options?.type === "module") return new OrigWorker(scriptURL, options);
            try {
                const url = String(scriptURL instanceof URL ? scriptURL.href : scriptURL);
                if (url.startsWith("blob:") || url.startsWith("data:")) {
                    return new OrigWorker(scriptURL, options);
                }
                const blob = new Blob([bootstrap, `importScripts(${JSON.stringify(url)});`], {
                    type: "application/javascript"
                });
                return new OrigWorker(URL.createObjectURL(blob), options);
            } catch (e) {
                return new OrigWorker(scriptURL, options);
            }
        };
        window.Worker.prototype = OrigWorker.prototype;
    }

    /* ---- geolocation (GPS coordinates for website queries) ---- */
    if (p.spoof?.geolocation !== false && p.geolocation) {
        const g = p.geolocation;

        function buildPosition() {
            return {
                coords: {
                    latitude: g.latitude,
                    longitude: g.longitude,
                    accuracy: g.accuracy ?? 25,
                    altitude: g.altitude ?? null,
                    altitudeAccuracy: g.altitudeAccuracy ?? null,
                    heading: null,
                    speed: null
                },
                timestamp: Date.now()
            };
        }

        const fakeGeolocation = {
            getCurrentPosition(success, error, options) {
                if (typeof success === "function") {
                    setTimeout(() => success(buildPosition()), 1);
                }
            },
            watchPosition(success, error, options) {
                const watchId = Math.floor(Math.random() * 1e9);
                if (typeof success === "function") {
                    setTimeout(() => success(buildPosition()), 1);
                }
                return watchId;
            },
            clearWatch() {}
        };

        patch(Navigator.prototype, nav, "geolocation", fakeGeolocation);

        if (nav.permissions?.query) {
            const origPermQuery = nav.permissions.query.bind(nav.permissions);
            nav.permissions.query = function (desc) {
                if (desc && desc.name === "geolocation") {
                    return Promise.resolve({
                        state: "granted",
                        onchange: null
                    });
                }
                return origPermQuery(desc);
            };
        }
    }

    return {
        ok: true,
        userAgent: nav.userAgent,
        vendor: nav.vendor,
        platform: nav.platform,
        language: nav.language,
        languages: Array.from(nav.languages || []),
        innerWidth: win.innerWidth,
        outerWidth: win.outerWidth,
        devicePixelRatio: win.devicePixelRatio,
        intlLocale: Intl.DateTimeFormat().resolvedOptions().locale,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        hasUserAgentData: nav.userAgentData != null,
        geolocation: p.geolocation || null,
        globalPrivacyControl: nav.globalPrivacyControl,
        doNotTrack: nav.doNotTrack
    };
}
