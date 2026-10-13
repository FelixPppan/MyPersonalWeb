/*
 * 把整站压成一个自包含的 HTML —— 双击就能看，不用终端、不用起服务器。
 *
 * 直接读真实源文件内联，所以预览不可能和站点跑偏；改完源码重跑一次即可：
 *     node tools/cursor-fx/build_preview.js
 *
 * 只收默认外观（乳胶）那套。软/玻璃的样式表和脚本不收，因为它们的 CSS 是靠
 * <link disabled> 互相排斥的，压成一个文件后没有 <link> 可禁用，三个一起生效
 * 会糊成一片。光标本身三个外观共用，所以看光标这件事不受影响。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "preview.html");

// 压不进来的：非默认外观的样式表 / 脚本，以及它们的切换器
const DROP_CSS = ["skins/soft/style.css", "skins/glass/style.css"];
const DROP_JS = ["skins/soft/soft.js", "skins/glass/glass.js"];

function read(p) {
    return fs.readFileSync(path.join(ROOT, p), "utf8").trim();
}

function exists(p) {
    return fs.existsSync(path.join(ROOT, p));
}

const inlinedCss = [];
const inlinedJs = [];

function inlineCss(html) {
    return html.replace(/^[ \t]*<link\b[^>]*>[ \t]*$/gim, (tag) => {
        const href = (tag.match(/href="([^"]+)"/i) || [])[1];
        if (!href) return tag; // 字体之类的 <link rel="preconnect"> 没有 href 目标就原样留着
        if (/^https?:/i.test(href)) return tag; // 外部字体留着，断网时自然回退
        const file = href.split("?")[0];
        const id = (tag.match(/id="([^"]+)"/i) || [])[1];

        if (DROP_CSS.includes(file)) return ""; // 整行删掉
        if (!exists(file)) return tag;

        inlinedCss.push(file);
        return `<style${id ? ` id="${id}"` : ""} data-from="${file}">\n${read(file)}\n</style>`;
    });
}

function inlineJs(html) {
    return html.replace(/^[ \t]*<script\b[^>]*src="([^"]+)"[^>]*>\s*<\/script>[ \t]*$/gim, (tag, src) => {
        const file = src.split("?")[0];
        if (DROP_JS.includes(file)) return "";
        if (!exists(file)) return tag;
        inlinedJs.push(file);
        return `<script data-from="${file}">\n${read(file)}\n</script>`;
    });
}

/*
 * 预览专用的一小段，站点里没有。放 <head> 最前面，早于所有会读 localStorage 的代码。
 *
 * 三件事：
 * 1) 双击打开时落在光标状态页；
 * 2) 固定用默认外观（乳胶）—— 这个文件里只内联了乳胶那份样式表，万一
 *    localStorage 里存着「亲肤」，skin.js 会把唯一的样式表也禁掉，页面就白了；
 * 3) 站点会把外观写回 localStorage（setSiteSkin 里那一行），预览不该留下痕迹，
 *    所以跑完把它还回去。
 *
 * 第 2 件走两条独立的路：先补 ?skin=latex（skin.js 读查询串优先于 localStorage），
 * 再在 load 之后兜一道底。个别浏览器不许 file:// 改 URL，那条路会失败，兜底那条不会。
 */
const PREVIEW_BOOT = `
<script>
// —— 以下是生成预览时加的，真站点里没有 ——
if (!location.hash) location.hash = "#/cursor";
var __cfxSaved = null, __cfxHad = false;
try {
    __cfxSaved = localStorage.getItem("site-skin");
    __cfxHad = __cfxSaved !== null;
} catch (e) {}
if (!/[?&]skin=/.test(location.search)) {
    try {
        history.replaceState(null, "", location.pathname + "?skin=latex" + location.hash);
    } catch (e) {}
}
addEventListener("load", function () {
    setTimeout(function () {
        // 兜底：确保乳胶那份是活的（只有它是内联进来的）
        var el = document.getElementById("skin-css-latex");
        if (el && el.disabled) {
            el.disabled = false;
            document.documentElement.dataset.skin = "latex";
        }
        // 预览不留痕
        try {
            if (__cfxHad) localStorage.setItem("site-skin", __cfxSaved);
            else localStorage.removeItem("site-skin");
        } catch (e) {}
    }, 0);
});
</script>
`;

function main() {
    let html = read("index.html");

    // 皮肤切换器：预览里三个外观只剩一个，留着会点了没反应
    html = html.replace(/[ \t]*<div id="skin-switcher"[\s\S]*?<\/div>\s*\n/, "");

    html = inlineCss(html);
    html = inlineJs(html);

    // 预览启动脚本插在 <head> 最前面，早于所有会读 localStorage 的代码
    html = html.replace(/(<head>\s*\n)/i, `$1${PREVIEW_BOOT}`);

    html = html.replace(
        /(<!DOCTYPE html>\s*\n)/i,
        `$1<!--\n` +
        `  这是自动生成的单文件预览，不要直接改这个文件。\n` +
        `  改源码后重跑：node tools/cursor-fx/build_preview.js\n` +
        `  内联了 CSS ${inlinedCss.length} 个、JS ${inlinedJs.length} 个，只含默认外观（乳胶）。\n` +
        `-->\n`
    );

    fs.writeFileSync(OUT, html);

    const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
    console.log(`写出 ${path.relative(ROOT, OUT)}  ${kb} KB`);
    console.log(`  CSS: ${inlinedCss.join(", ")}`);
    console.log(`  JS : ${inlinedJs.join(", ")}`);
}

main();
