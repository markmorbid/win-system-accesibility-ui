(function() {
"use strict";

// ─── Unified TSRangeSlider Constructor Engine ──────────────────────
class TSRangeSlider {
    constructor(element, options) {
        if (!element) return null;

        // Prevent duplicate initialization on same element
        if (element._tsSliderInstance) {
            return element._tsSliderInstance;
        }

        options = options || {};
        this.element = element;
        this.isNativeInput = (element.tagName.toLowerCase() === "input" && element.type === "range");
        this.isCustomElement = (element.tagName.toLowerCase() === "ts-range-slider");

        this.init(options);

        element._tsSliderInstance = this;
        if (this.input) {
            this.input._tsSliderInstance = this;
            this.input.dataset.enhanced = "true";
            this.input.setAttribute("data-enhanced", "true");
        }
        if (this.scaffold) {
            this.scaffold._tsSliderInstance = this;
            this.scaffold.dataset.enhanced = "true";
        }
    }

    init(options) {
        var el = this.element;
        var parentField = (typeof el.closest === "function") ? el.closest(".ts-lv-field, fieldset, .ts-range-container, .ts-range-field") : null;

        var min = options.min || el.getAttribute("min") || el.getAttribute("data-min") || "0";
        var max = options.max || el.getAttribute("max") || el.getAttribute("data-max") || "100";
        var val = (typeof options.value !== "undefined") ? options.value : (el.value || el.getAttribute("value") || el.getAttribute("data-value") || "50");
        // Suffix precedence: option → attr → data-attr → parent data-attr → extracted from output target text
        var suffix = (typeof options.suffix !== "undefined") ? options.suffix : (el.getAttribute("suffix") || el.getAttribute("data-suffix") || "");
        // (parent fallback applied below; output-target extraction applied after buildDOM in _resolveSuffix)
        var size = options.size || el.getAttribute("size") || el.getAttribute("data-size") || "md";
        var layout = options.layout || el.getAttribute("layout") || el.getAttribute("data-layout") || "stack";
        var key = options.key || el.getAttribute("data-key") || "";

        if (parentField) {
            if (!options.layout && parentField.getAttribute("data-layout")) layout = parentField.getAttribute("data-layout");
            if (!options.size && parentField.getAttribute("data-size")) size = parentField.getAttribute("data-size");
            if (!suffix && parentField.getAttribute("data-suffix")) suffix = parentField.getAttribute("data-suffix");
        }

        var label = options.label || el.getAttribute("label") || el.getAttribute("data-label") || el.getAttribute("aria-label") || el.getAttribute("title") || "";
        if (!label && parentField) {
            var parentLeg = parentField.querySelector("legend, label");
            if (parentLeg) {
                var clone = parentLeg.cloneNode(true);
                clone.querySelectorAll(".ts-lv-val, [data-key-out], .ts-range-val, .ts-range-value").forEach(function(item) { item.remove(); });
                label = clone.textContent.trim();
            }
        }

        this.min = min;
        this.max = max;
        this.value = val;
        this.suffix = suffix;
        this.size = size;
        this.layout = layout;
        this.label = label;
        this.key = key;

        this.buildDOM();
        this._resolveSuffix(); // 5th fallback: extract unit from existing output targets
        this.bindEvents();
        this.sync();
    }

    buildDOM() {
        var el = this.element;
        var scaffold, header, labelSpan, body, track, progressWrapper, progress, customThumb, input, valueSpan;

        if (this.isNativeInput) {
            // Native Input Enhancement: wrap native input in scaffold
            input = el;
            if (!input.classList.contains("ts-range")) input.classList.add("ts-range");
            input.min = this.min;
            input.max = this.max;
            input.value = this.value;
            input._tsInitialVal = this.value;

            scaffold = document.createElement("div");
            scaffold.className = "ts-range-scaffold ts-range-" + this.layout + " ts-range-" + this.size;

            header = document.createElement("div");
            header.className = "ts-range-header";

            labelSpan = document.createElement("span");
            labelSpan.className = "ts-range-label";
            labelSpan.textContent = this.label;
            header.appendChild(labelSpan);

            body = document.createElement("div");
            body.className = "ts-range-body";

            track = document.createElement("div");
            track.className = "ts-range-track";

            progressWrapper = document.createElement("div");
            progressWrapper.className = "ts-range-progress-wrapper";

            progress = document.createElement("div");
            progress.className = "ts-range-progress";
            progressWrapper.appendChild(progress);

            customThumb = document.createElement("div");
            customThumb.className = "ts-range-thumb-custom";

            // Track child order: 1. progressWrapper, 2. customThumb, 3. input
            track.appendChild(progressWrapper);
            track.appendChild(customThumb);

            if (input.parentNode) {
                input.parentNode.insertBefore(scaffold, input);
            }
            track.appendChild(input);

            valueSpan = document.createElement("span");
            valueSpan.className = "ts-range-value";
            valueSpan.textContent = this.value + this.suffix;

            if (this.layout === "stack") {
                header.appendChild(valueSpan);
            } else {
                body.appendChild(valueSpan);
            }

            body.appendChild(track);
            scaffold.appendChild(header);
            scaffold.appendChild(body);

        } else {
            // Custom Element / Fallback Container / Schema Container
            scaffold = el;
            scaffold.className = "ts-range-scaffold ts-range-" + this.layout + " ts-range-" + this.size;

            var existingInput = scaffold.querySelector(".ts-range-track > input.ts-range");
            if (existingInput) {
                input = existingInput;
                track = scaffold.querySelector(".ts-range-track");
                progress = scaffold.querySelector(".ts-range-progress");
                customThumb = scaffold.querySelector(".ts-range-thumb-custom");
                valueSpan = scaffold.querySelector(".ts-range-value");
                labelSpan = scaffold.querySelector(".ts-range-label");
            } else {
                scaffold.innerHTML = "";

                header = document.createElement("div");
                header.className = "ts-range-header";

                labelSpan = document.createElement("span");
                labelSpan.className = "ts-range-label";
                labelSpan.textContent = this.label;
                header.appendChild(labelSpan);

                body = document.createElement("div");
                body.className = "ts-range-body";

                track = document.createElement("div");
                track.className = "ts-range-track";

                progressWrapper = document.createElement("div");
                progressWrapper.className = "ts-range-progress-wrapper";

                progress = document.createElement("div");
                progress.className = "ts-range-progress";
                progressWrapper.appendChild(progress);

                customThumb = document.createElement("div");
                customThumb.className = "ts-range-thumb-custom";

                input = document.createElement("input");
                input.type = "range";
                input.className = "ts-range";
                input.min = this.min;
                input.max = this.max;
                input.value = this.value;
                input._tsInitialVal = this.value;
                if (this.key) input.setAttribute("data-key", this.key);

                track.appendChild(progressWrapper);
                track.appendChild(customThumb);
                track.appendChild(input);

                valueSpan = document.createElement("span");
                valueSpan.className = "ts-range-value";
                valueSpan.textContent = this.value + this.suffix;

                if (this.layout === "stack") {
                    header.appendChild(valueSpan);
                } else {
                    body.appendChild(valueSpan);
                }

                body.appendChild(track);
                scaffold.appendChild(header);
                scaffold.appendChild(body);
            }
        }

        scaffold.dataset.min = this.min;
        scaffold.dataset.max = this.max;
        scaffold.dataset.value = this.value;
        scaffold.dataset.size = this.size;
        scaffold.dataset.layout = this.layout;
        if (this.suffix) scaffold.dataset.suffix = this.suffix;
        if (this.label) scaffold.dataset.label = this.label;

        this.scaffold = scaffold;
        this.track = track;
        this.progress = progress;
        this.customThumb = customThumb;
        this.input = input;
        this.valueSpan = valueSpan;
        this.labelSpan = labelSpan;
    }

    _resolveSuffix() {
        // 5th precedence: extract trailing unit from initial text content of bound output targets
        if (this.suffix) return; // already resolved from higher priority
        var key = this.key || (this.input && this.input.getAttribute("data-key")) || "";
        if (!key) return;
        var out = document.querySelector('[data-key-out="' + key + '"]');
        if (!out) return;
        var txt = out.textContent.trim();
        var m = txt.match(/(px|em|rem|%|ms|s|deg|vh|vw)$/i);
        if (m) this.suffix = m[0];
    }

    destroy() {
        if (this._syncHandler && this.input) {
            this.input.removeEventListener("input", this._syncHandler);
            this.input.removeEventListener("change", this._syncHandler);
        }
        if (this._trackClickHandler && this.track) {
            this.track.removeEventListener("click", this._trackClickHandler);
        }
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
        }
        // Detach scaffold if we created it (native input enhancement)
        if (this.isNativeInput && this.scaffold && this.scaffold.parentNode) {
            this.scaffold.parentNode.insertBefore(this.input, this.scaffold);
            this.scaffold.parentNode.removeChild(this.scaffold);
        }
        if (this.element) delete this.element._tsSliderInstance;
        if (this.input) delete this.input._tsSliderInstance;
        if (this.scaffold) delete this.scaffold._tsSliderInstance;
    }

    bindEvents() {
        var self = this;
        var input = this.input;
        var track = this.track;

        this._syncHandler = function() {
            self.sync();
        };

        input.addEventListener("input", this._syncHandler);
        input.addEventListener("change", this._syncHandler);

        this._trackClickHandler = function(e) {
            if (e.target === input) return;
            var rect = track.getBoundingClientRect();
            if (self.layout === "vertical") {
                if (rect.height === 0) return;
                var y = e.clientY - rect.top;
                var percent = Math.min(100, Math.max(0, (1 - y / rect.height) * 100));
                var range = parseFloat(input.max) - parseFloat(input.min);
                input.value = parseFloat(input.min) + (percent / 100) * range;
            } else {
                if (rect.width === 0) return;
                var x = e.clientX - rect.left;
                var percent = Math.min(100, Math.max(0, (x / rect.width) * 100));
                var range = parseFloat(input.max) - parseFloat(input.min);
                input.value = parseFloat(input.min) + (percent / 100) * range;
            }
            self.sync();
            input.dispatchEvent(new Event("input", { bubbles: true }));
        };

        track.addEventListener("click", this._trackClickHandler);

        var origSet = input.setAttribute.bind(input);
        input.setAttribute = function(name, val) {
            origSet(name, val);
            if (name === "value") {
                self.sync();
            }
        };
    }

    sync() {
        var input = this.input;
        if (!input) return;

        // Snapshot values synchronously (safe; no layout read)
        var v = parseFloat(input.value);
        if (isNaN(v)) v = 0;
        var mn = parseFloat(input.min) || 0;
        var mx = parseFloat(input.max) || 100;
        if (mx === mn) mx = mn + 1;

        var pct = Math.min(100, Math.max(0, ((v - mn) / (mx - mn)) * 100));
        var pctStr = pct + "%";

        // Cancel any pending frame to avoid stacking
        if (this._rafId) cancelAnimationFrame(this._rafId);

        var self = this;
        this._rafId = requestAnimationFrame(function() {
            self._rafId = null;

            if (self.track) {
                self.track.style.setProperty("--ts-range-percent", pctStr);
            }
            if (self.scaffold) {
                self.scaffold.dataset.value = v;
            }
            if (self.valueSpan) {
                self.valueSpan.textContent = v + self.suffix;
            }

            var key = self.key || input.getAttribute("data-key");
            if (key) {
                var outs = document.querySelectorAll('[data-key-out="' + key + '"]');
                var suffix = self.suffix;
                outs.forEach(function(out) {
                    out.textContent = v + suffix;
                });
            }
        });
    }

    setValue(val) {
        if (this.input) {
            this.input.value = val;
            this.sync();
            this.input.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }

    getValue() {
        return this.input ? parseFloat(this.input.value) : 0;
    }

    refresh() {
        this.sync();
    }
}

// ─── ToolskinCSSParser — Dynamic CSS Token & Style Extractor ───────
class ToolskinCSSParser {
    constructor() {
        this._cache = null;           // { tokens, gradientClasses, timestamp }
        this._cacheMap = new Map();   // per-call computed token cache
    }

    /**
     * Parse all accessible stylesheets, skipping cross-origin sheets
     * that would throw a DOMException on cssRules access.
     * @returns {CSSRule[]} flat array of all readable CSSRules
     */
    _getRules() {
        var rules = [];
        var sheets = document.styleSheets;
        for (var i = 0; i < sheets.length; i++) {
            try {
                var cssRules = sheets[i].cssRules || sheets[i].rules || [];
                for (var j = 0; j < cssRules.length; j++) {
                    rules.push(cssRules[j]);
                }
            } catch (e) {
                // Cross-origin stylesheet — skip silently (DOMException: SecurityError)
                if (!(e instanceof DOMException)) {
                    console.warn("[ToolskinCSSParser] Unexpected error reading sheet:", e);
                }
            }
        }
        return rules;
    }

    /**
     * Returns all CSS custom properties matching the given prefix.
     * Values are trimmed and normalized.
     * Uses an internal cache; call refresh() to invalidate.
     * @param {string} [prefix='--ts-']
     * @returns {Object} { '--ts-token-name': 'value', ... }
     */
    getTokens(prefix) {
        prefix = (typeof prefix === "string") ? prefix : "--ts-";
        if (this._cache && this._cache.tokens) {
            return this._filterTokens(this._cache.tokens, prefix);
        }

        var tokens = {};
        var rules = this._getRules();

        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            // CSSStyleRule — check selectorText for :root / * / html
            if (rule.type === 1 && rule.style) {
                var isRootRule = (
                    rule.selectorText === ":root" ||
                    rule.selectorText === "*" ||
                    rule.selectorText === "html"
                );
                if (isRootRule) {
                    this._extractCustomProps(rule.style, prefix, tokens);
                }
            }
        }

        // Also pull computed values from document root for any tokens defined
        // via @property or inline :root declarations that may not appear in cssRules
        try {
            var computed = window.getComputedStyle(document.documentElement);
            var names = computed.length ? Array.from(computed) : [];
            names.forEach(function(name) {
                if (name.trim().startsWith(prefix)) {
                    var val = computed.getPropertyValue(name).trim();
                    if (val && !tokens[name.trim()]) {
                        tokens[name.trim()] = val;
                    }
                }
            });
        } catch (e) {
            // getComputedStyle not available in this context
        }

        this._cache = this._cache || {};
        this._cache.tokens = tokens;
        return this._filterTokens(tokens, prefix);
    }

    _filterTokens(tokens, prefix) {
        if (prefix === "--ts-") return tokens; // already filtered at parse time
        var out = {};
        Object.keys(tokens).forEach(function(k) {
            if (k.startsWith(prefix)) out[k] = tokens[k];
        });
        return out;
    }

    _extractCustomProps(style, prefix, out) {
        // CSSStyleDeclaration iteration
        for (var i = 0; i < style.length; i++) {
            var name = style[i].trim();
            if (name.startsWith(prefix)) {
                out[name] = style.getPropertyValue(name).trim();
            }
        }
    }

    /**
     * Returns unique array of gradient utility class names (without leading dot)
     * that match the given prefix in any stylesheet selector.
     * @param {string} [prefix='ts-grad-']
     * @returns {string[]}
     */
    getGradientClasses(prefix) {
        prefix = (typeof prefix === "string") ? prefix : "ts-grad-";
        if (this._cache && this._cache.gradientClasses) {
            var cached = this._cache.gradientClasses;
            return cached.filter(function(cls) { return cls.startsWith(prefix); });
        }

        var found = new Set();
        var rules = this._getRules();
        var dotPrefix = "." + prefix;

        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            if (!rule.selectorText) continue;

            // selectorText may contain comma-separated selectors
            var selectors = rule.selectorText.split(",");
            for (var j = 0; j < selectors.length; j++) {
                var sel = selectors[j].trim();
                // Match .ts-grad-* at selector start or after whitespace/combinator
                var re = /(?:^|[\s>+~])\.([a-zA-Z0-9_-]+)/g;
                var match;
                while ((match = re.exec(sel)) !== null) {
                    if (match[1].startsWith(prefix)) {
                        found.add(match[1]);
                    }
                }
            }
        }

        var arr = Array.from(found).sort();
        this._cache = this._cache || {};
        this._cache.gradientClasses = arr;
        return arr.filter(function(cls) { return cls.startsWith(prefix); });
    }

    /**
     * Fallback: read a CSS custom property via getComputedStyle when
     * cssRules is unavailable (cross-origin sheets, dynamic props, etc).
     * @param {Element} element
     * @param {string} propertyName  e.g. '--ts-accent'
     * @returns {string} trimmed value, or empty string
     */
    getComputedToken(element, propertyName) {
        if (!element || !propertyName) return "";
        var cacheKey = propertyName + "|" + (element.id || element.className || "?");
        if (this._cacheMap.has(cacheKey)) return this._cacheMap.get(cacheKey);
        var val = "";
        try {
            val = window.getComputedStyle(element).getPropertyValue(propertyName).trim();
        } catch (e) {
            // getComputedStyle may fail (detached element, JSDOM, etc.)
        }
        this._cacheMap.set(cacheKey, val);
        return val;
    }

    /**
     * Invalidate all caches so next call re-parses stylesheets.
     * Call after dynamic stylesheet injection or theme switches.
     */
    refresh() {
        this._cache = null;
        this._cacheMap.clear();
    }
}

// Expose constructor globally
window.ToolskinCSSParser = ToolskinCSSParser;

// Expose constructor globally
window.TSRangeSlider = TSRangeSlider;

// ─── Entry Point Bridge Functions ──────────────────────────────────
function tsCompileRange(container, cfg) {
    return new TSRangeSlider(container, cfg);
}
window.tsCompileRange = tsCompileRange;

function tsEnhanceNativeInput(input) {
    return new TSRangeSlider(input);
}

// ─── Register Custom Element ──────────────────────────────────────
if (window.customElements && !customElements.get("ts-range-slider")) {
    var CustomTSRangeSlider = function() {
        return Reflect.construct(HTMLElement, [], CustomTSRangeSlider);
    };
    CustomTSRangeSlider.prototype = Object.create(HTMLElement.prototype);
    CustomTSRangeSlider.prototype.connectedCallback = function() {
        new TSRangeSlider(this, {
            label: this.getAttribute("label"),
            min: this.getAttribute("min"),
            max: this.getAttribute("max"),
            value: this.getAttribute("value"),
            suffix: this.getAttribute("suffix"),
            size: this.getAttribute("size"),
            layout: this.getAttribute("layout")
        });
    };
    customElements.define("ts-range-slider", CustomTSRangeSlider);
}

// ─── Scanner Functions ─────────────────────────────────────────────
function tsScanFallbacks() {
    document.querySelectorAll(".ts-range-fallback:not([data-enhanced])").forEach(function(el) {
        new TSRangeSlider(el, {
            label: el.getAttribute("data-label"),
            min: el.getAttribute("data-min"),
            max: el.getAttribute("data-max"),
            value: el.getAttribute("data-value"),
            suffix: el.getAttribute("data-suffix"),
            size: el.getAttribute("data-size"),
            layout: el.getAttribute("data-layout")
        });
    });
}

// Schema registry
window.TSRangeSchema = window.TSRangeSchema || {};
Object.assign(window.TSRangeSchema, {
    "hold-control": {
        label: "Hold Time",
        min: "0",
        max: "5000",
        value: "2800",
        suffix: "ms",
        size: "md",
        layout: "row"
    },
    "volume-control": {
        label: "Volume",
        min: "0",
        max: "200",
        value: "120",
        suffix: "",
        size: "md",
        layout: "stack"
    },
    "zoom-control": {
        label: "Zoom Level",
        min: "50",
        max: "400",
        value: "180",
        suffix: "%",
        size: "lg",
        layout: "row"
    }
});

function tsScanSchemas() {
    document.querySelectorAll("[ts-range-schema]:not([data-enhanced])").forEach(function(el) {
        var key = el.getAttribute("ts-range-schema");
        var cfg = window.TSRangeSchema && window.TSRangeSchema[key];
        if (cfg) {
            new TSRangeSlider(el, cfg);
        } else {
            new TSRangeSlider(el, {
                label: key.replace(/-/g, " ").replace(/\b\w/g, function(c) { return c.toUpperCase(); }),
                min: "0",
                max: "100",
                value: "50",
                suffix: "",
                size: "md",
                layout: "stack"
            });
        }
    });
}

function tsScanNativeInputs() {
    document.querySelectorAll('input[type="range"].ts-range:not([data-enhanced]), input[type="range"][data-key]:not([data-enhanced]), input[type="range"]:not([data-enhanced])').forEach(function(input) {
        if (input.closest(".ts-range-track")) return;
        new TSRangeSlider(input);
    });
}

function tsSetupResets() {
    document.querySelectorAll("[data-reset]").forEach(function(btn) {
        if (btn._tsResetBound) return;
        btn._tsResetBound = true;

        btn.addEventListener("click", function(e) {
            e.preventDefault();
            var key = btn.getAttribute("data-reset");
            if (!key) return;

            var targetInput = document.querySelector('input[data-key="' + key + '"]');
            if (targetInput) {
                if (typeof targetInput._tsInitialVal !== "undefined") {
                    targetInput.value = targetInput._tsInitialVal;
                } else if (targetInput.hasAttribute("value")) {
                    targetInput.value = targetInput.getAttribute("value");
                } else {
                    targetInput.value = targetInput.min || "0";
                }

                targetInput.dispatchEvent(new Event("input", { bubbles: true }));
                targetInput.dispatchEvent(new Event("change", { bubbles: true }));

                if (targetInput._tsDefaultText) {
                    var outs = document.querySelectorAll('[data-key-out="' + key + '"]');
                    outs.forEach(function(out) {
                        out.textContent = targetInput._tsDefaultText;
                    });
                }
            }
        });
    });
}

function scanAll() {
    tsScanFallbacks();
    tsScanSchemas();
    tsScanNativeInputs();
    tsSetupResets();
}

document.addEventListener("DOMContentLoaded", scanAll);
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() { setTimeout(scanAll, 20); });
} else {
    setTimeout(scanAll, 20);
}

window.tsRangeRefresh = scanAll;

var observer = new MutationObserver(function() {
    clearTimeout(observer._timer);
    observer._timer = setTimeout(scanAll, 30);
});
observer.observe(document.documentElement, {
    childList: true,
    subtree: true
});

console.log("✦ Range Slider Engine v6.1.0 · ToolskinCSSParser + rAF sync + destroy()");
})();

