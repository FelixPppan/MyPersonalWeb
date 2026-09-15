/**
 * 玻璃外观 —— 只负责颜色主题（液态玻璃的面板效果全在 CSS 里）。
 *
 * 曲面由 index.html 里的 SVG 光照滤镜（#latex-lit-*）生成，
 * 黑球光标由 ball.js 统一负责，这里都不碰。
 */
window.initGlassMembrane = function initGlassMembrane() {
    const root = document.documentElement;

    const THEMES = {
        white: true,
        black: true,
        blue: true,
        orange: true,
    };

    // 主题由 skin.js 统一调度：三个外观共用色板，切换外观时保留已选颜色
    window.__skinTheme = function (key) {
        const themeKey = THEMES[key] ? key : "white";
        root.dataset.theme = themeKey;
        root.classList.remove("theme-white", "theme-black", "theme-blue", "theme-orange");
        root.classList.add(`theme-${themeKey}`);
        document.querySelectorAll(".color-swatch").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.theme === themeKey);
        });
    };

    window.latexRefreshLayout = function () {};

    // ?theme=black|white|blue|orange 便于直接预览某套配色
    let initialTheme = window.__currentTheme || "white";
    try {
        const q = new URLSearchParams(location.search).get("theme");
        if (THEMES[q]) initialTheme = q;
    } catch (_) {}
    window.__skinTheme(initialTheme);

    return function destroy() {};
};
