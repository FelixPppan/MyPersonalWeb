/**
 * Appearance switcher: 亲肤 (soft / dent-press-7) ↔ 乳胶 (current slime latex)
 */
(function () {
    const SOFT = "soft";
    const LATEX = "latex";
    const GLASS = "glass";
    const KEY = "site-skin";
    const THEME_KEY = "site-theme";

    let destroyFn = null;
    let currentTheme = "white";

    function $(id) {
        return document.getElementById(id);
    }

    function setButtons(skin) {
        document.querySelectorAll("#skin-switcher [data-skin]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.skin === skin);
        });
    }

    function setStylesheets(skin) {
        const soft = $("skin-css-soft");
        const latex = $("skin-css-latex");
        const glass = $("skin-css-glass");
        if (soft) soft.disabled = skin !== SOFT;
        if (latex) latex.disabled = skin !== LATEX;
        if (glass) glass.disabled = skin !== GLASS;
    }

    function teardown() {
        if (typeof destroyFn === "function") {
            try {
                destroyFn();
            } catch (e) {
                console.warn(e);
            }
        }
        destroyFn = null;
        document.documentElement.classList.remove("has-pointer", "is-pressing");
    }

    function boot(skin) {
        teardown();
        if (skin === SOFT) {
            if (typeof window.initSoftMembrane === "function") {
                destroyFn = window.initSoftMembrane() || null;
            }
        } else if (skin === GLASS) {
            if (typeof window.initGlassMembrane === "function") {
                destroyFn = window.initGlassMembrane() || null;
            }
        } else if (typeof window.initLatexMembrane === "function") {
            destroyFn = window.initLatexMembrane() || null;
        }
        if (typeof window.__skinTheme === "function") {
            window.__skinTheme(currentTheme);
        }
        if (typeof window.latexRefreshLayout === "function") {
            requestAnimationFrame(() => window.latexRefreshLayout());
        }
    }

    window.setSiteSkin = function setSiteSkin(skin) {
        const next = skin === SOFT ? SOFT : skin === GLASS ? GLASS : LATEX;
        document.documentElement.dataset.skin = next;
        try {
            localStorage.setItem(KEY, next);
        } catch (_) {}
        setStylesheets(next);
        setButtons(next);
        // Allow CSS to apply before measuring blisters / GL resize
        requestAnimationFrame(() => boot(next));
    };

    window.setSiteTheme = function setSiteTheme(key) {
        currentTheme = ["white", "black", "blue", "orange"].includes(key) ? key : "white";
        try {
            localStorage.setItem(THEME_KEY, currentTheme);
        } catch (_) {}
        if (typeof window.__skinTheme === "function") window.__skinTheme(currentTheme);
    };

    function initialSkin() {
        try {
            const q = new URLSearchParams(location.search).get("skin");
            if (q === SOFT || q === LATEX || q === GLASS) return q;
        } catch (_) {}
        try {
            const saved = localStorage.getItem(KEY);
            if (saved === SOFT || saved === LATEX || saved === GLASS) return saved;
        } catch (_) {}
        return LATEX; // default appearance: glossy latex
    }

    function initialTheme() {
        try {
            const q = new URLSearchParams(location.search).get("theme");
            if (["white", "black", "blue", "orange"].includes(q)) return q;
        } catch (_) {}
        try {
            const saved = localStorage.getItem(THEME_KEY);
            if (["white", "black", "blue", "orange"].includes(saved)) return saved;
        } catch (_) {}
        return "white";
    }

    function wire() {
        document.querySelectorAll("#skin-switcher [data-skin]").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.setSiteSkin(btn.dataset.skin);
            });
        });
        // 色板只在这里绑一次，三个外观共用
        document.querySelectorAll(".color-swatch").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.setSiteTheme(btn.dataset.theme);
            });
        });
    }

    window.initSiteSkin = function initSiteSkin() {
        currentTheme = initialTheme();
        // 皮肤的 JS 在初始化时读这个值应用配色
        window.__currentTheme = currentTheme;
        wire();
        // 黑球光标是三个外观共用的，只启动一次
        if (typeof window.initBallCursor === "function") {
            window.initBallCursor();
        }
        window.setSiteSkin(initialSkin());
    };
})();
