/*
 * 把库拼出来。
 *
 *     node cursor-lib/build.js
 *
 * 出两个文件：cursor-embed.js 和 cursor-embed.css。
 *
 * ── 为什么不把引擎抄一份进来 ──
 *
 * 形状是这套东西唯一真正值钱的部分,而它已经在站上被几百条断言盯着。抄一份进来
 * 就等于从今天起有两个实现,改一处忘一处 —— 而「预览和实际不一样」正是最不该
 * 出现在一个要卖出去的包里的毛病。
 *
 * 所以这里不复制,只**拼接**:引擎用站上那份原文,一个字节都不动;
 * 新的东西只有运行时(src/runtime.js)。也就是说光标长什么样,库里和站上
 * 永远逐像素相同,因为跑的就是同一份代码。
 *
 * CSS 同理:球和液体的观感从 cursor-fx.css 里抽那一段,只做「把写死的颜色
 * 换成可配的 CSS 变量」这一件事。每一条替换都断言它真的命中了 —— 改不动就
 * 报错退出,而不是悄悄出一个颜色对不上的包。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");           // MyPersonalWeb
const SRC = path.join(__dirname, "src");
const ENGINE_JS = path.join(ROOT, "cursor-fx.js");
const ENGINE_CSS = path.join(ROOT, "cursor-fx.css");

const VERSION = "1.0.0";

let problems = 0;
function ok(msg) { console.log("  ✓ " + msg); }
function bad(msg) { problems++; console.log("  !! " + msg); }

// ─────────────────────────── JS ───────────────────────────

function buildJS() {
    const engine = fs.readFileSync(ENGINE_JS, "utf8");
    const runtime = fs.readFileSync(path.join(SRC, "runtime.js"), "utf8");

    const banner = `/*!
 * cursor-embed v${VERSION}
 * 一个会按元素变形状的液体光标。零依赖,一个文件。
 *
 * 这个文件由 cursor-lib/build.js 生成,请不要直接改。
 * 上面那一段是引擎(cursor-fx.js 的原文),下面那一段是对外运行时。
 *
 * 生成的日期会变,代码不会 —— 想改光标长什么样,改引擎;
 * 想改「什么时候变、怎么读意图」,改 src/runtime.js,然后重新跑一次 build.js。
 */`;

    // 引擎自己就是个 IIFE,直接接在后面即可。中间空两行,免得两段注释粘在一起。
    return banner + "\n" + engine.replace(/\s*$/, "") + "\n\n" + runtime.replace(/\s*$/, "") + "\n";
}

// ─────────────────────────── CSS ───────────────────────────

// 展示页版式从这里开始,和光标本身无关,不打包
const SHOWCASE_MARKER = "/* ===== 展示页版式 ===== */";

/*
 * 把写死的颜色换成 CSS 变量。默认值就是原来那个颜色,
 * 所以不配任何东西时,出来的和站上**一模一样**。
 */
const SWAPS = [
    [
        `        #5a5a5a 0%,
        #1a1a1a 42%,
        #050505 78%,
        #000 100%`,
        `        var(--cfx-hi, #5a5a5a) 0%,
        var(--cfx-mid, #1a1a1a) 42%,
        var(--cfx-lo, #050505) 78%,
        var(--cfx-ink, #000) 100%`,
    ],
    [
        `.cfx-shadow .cfx-ball {
    background: #000;
}`,
        `.cfx-shadow .cfx-ball {
    background: var(--cfx-shadow-ink, #000);
}`,
    ],
];

function buildCSS() {
    const raw = fs.readFileSync(ENGINE_CSS, "utf8");

    const cut = raw.indexOf(SHOWCASE_MARKER);
    if (cut < 0) { bad("cursor-fx.css 里找不到展示页版式那条分隔注释,不敢猜边界"); return null; }
    let css = raw.slice(0, cut);

    /*
     * 深色配色那几条挂的是 `html.theme-black` —— 那是本站皮肤系统的类名,
     * 买家那边不存在。库里改配色走配置项,不留这套规则。
     */
    const themed = css.match(/html\.theme-black[^{]*\{[^}]*\}/g) || [];
    css = css.replace(/html\.theme-black[^{]*\{[^}]*\}\s*/g, "");
    if (themed.length === 0) bad("没有匹配到任何 html.theme-black 规则 —— 是不是本站改了写法?");
    else ok("剥掉 " + themed.length + " 条 theme-black 规则(本站皮肤专属,库里改走配置项)");
    if (/html\.theme-black/.test(css)) bad("还残留 theme-black 规则");

    for (const [needle, rep] of SWAPS) {
        if (css.indexOf(needle) < 0) { bad("CSS 替换没命中:" + JSON.stringify(needle.slice(0, 40))); continue; }
        css = css.replace(needle, rep);
    }
    if (!/var\(--cfx-hi/.test(css)) bad("球的主色没换成变量");

    const runtimeCss = fs.readFileSync(path.join(SRC, "runtime.css"), "utf8");
    return css.replace(/\s*$/, "") + "\n\n" + runtimeCss.replace(/^\s*/, "");
}

// ─────────────────────────── 写盘 ───────────────────────────

// 大小按**字节**算,不是按字符数 —— 注释里全是中文,一个字符三个字节,
// 用 js.length 报出来的数会比盘上那个文件小三分之一,而「多大」是买家要看的数
function kb(s) { return (Buffer.byteLength(s, "utf8") / 1024).toFixed(1) + " KB"; }

const js = buildJS();
fs.writeFileSync(path.join(__dirname, "cursor-embed.js"), js);
ok("cursor-embed.js  " + kb(js));

const css = buildCSS();
if (css) {
    fs.writeFileSync(path.join(__dirname, "cursor-embed.css"), css);
    ok("cursor-embed.css  " + kb(css));
}

console.log("");
if (problems) {
    console.error("有 " + problems + " 处没对上,包没出全。");
    process.exit(1);
}
console.log("出好了。");
