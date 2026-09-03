
/********************************************************************
 * Snooper Auto-Instrumentation Layer
 * Production system-wide event tracking
 * - Automatically logs navigation + renders + clicks
 * - No manual LogsModule.add calls required
 * - Safe wrappers around existing functions
 ********************************************************************/

const Instrumentation = (() => {

    function log(...args) {
        console.log("[Snooper Instrumentation]", ...args);
    }

    /**
     * Wrap render function
     */
    function wrapRender(renderFn) {
        return async function(tab) {
            try {
                LogsModule?.add?.("render", "Rendering " + tab);

                const result = await renderFn(tab);

                LogsModule?.add?.("render", "Rendered " + tab);

                return result;

            } catch (err) {
                LogsModule?.add?.("error", "Render failed: " + tab, String(err));
                throw err;
            }
        };
    }

    /**
     * Wrap navigation clicks
     */
    function wrapNavigation(bindFn) {
        return function() {
            const original = bindFn();

            const buttons = document.querySelectorAll("button[data-tab]");

            buttons.forEach(btn => {
                btn.addEventListener("click", () => {
                    const tab = btn.getAttribute("data-tab");

                    LogsModule?.add?.("nav", "Clicked " + tab);
                });
            });

            return original;
        };
    }

    /**
     * Wrap module execution
     */
    function wrapModules(modules) {
        const wrapped = {};

        for (const key in modules) {
            const fn = modules[key];

            if (typeof fn !== "function") continue;

            wrapped[key] = async function(...args) {
                try {
                    LogsModule?.add?.("module", "Enter " + key);

                    const result = await fn.apply(this, args);

                    LogsModule?.add?.("module", "Exit " + key);

                    return result;

                } catch (err) {
                    LogsModule?.add?.("error", "Module crash " + key, String(err));
                    throw err;
                }
            };
        }

        return wrapped;
    }

    /**
     * Boot instrumentation layer
     */
    function init() {
        log("Instrumentation active");
    }

    return {
        init,
        wrapRender,
        wrapNavigation,
        wrapModules
    };

})();