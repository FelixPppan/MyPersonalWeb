/*
 * 用最小的 DOM 桩跑一遍展示页的逻辑。
 *
 * 这里不验样式(那要看图),验的是那些看图看不出来的东西:
 *   - renderCursor 到底生成了几格、id 对不对
 *   - 逐帧驱动的循环有没有 NaN、有没有球跑出格子
 *   - 每一格是不是真的「演一段 → 停一段 → 再演」,而不是一直演或一直停
 *   - 按下那格有没有摊成一摊俯视的圆(圆的、比球大 1.6 倍、就一整片,而不是缩成一个球)
 *   - 换页(节点失联)之后 rAF 有没有自己停掉
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// 不给参数时按脚本自身的位置回到站点根目录，从哪跑都一样
const SITE = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../..");
const OUT = process.argv[3] || ".";

// ---------- DOM 桩 ----------
let gooCreated = 0;

function makeEl(tag) {
    const el = {
        tagName: tag,
        className: "",
        style: {},
        children: [],
        parent: null,
        isConnected: true,
        dataset: {},
        classList: {
            _s: new Set(),
            add(...c) { c.forEach((x) => this._s.add(x)); },
            remove(...c) { c.forEach((x) => this._s.delete(x)); },
            contains(c) { return this._s.has(c); },
            toggle(c, on) {
                const want = on === undefined ? !this._s.has(c) : !!on;
                if (want) this._s.add(c); else this._s.delete(c);
                return want;
            },
        },
        setAttribute(k, v) { this["attr_" + k] = v; },
        getAttribute(k) { return this["attr_" + k]; },
        // hover.js 加载时会在 documentElement 上挂 pointerleave
        addEventListener() {},
        removeEventListener() {},
        appendChild(c) { c.parent = this; this.children.push(c); return c; },
        remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); },
        querySelectorAll() { return []; },
        // 这套 stub 里没有真的 DOM 树(页面是当字符串生成的),所以任何按选择器
        // 找单个元素的调用都只能得到 null —— 展示页里 mountWindowResize 会因此
        // 直接返回早退。这是对的:这一页查的是「标记 / 样式 / 意图」这条链子
        // 接上没有,缩放的行为由 test_hover.js 盯着。
        querySelector() { return null; },
    };
    return el;
}

const stages = [];
const contentEl = makeEl("div");
let html = "";

const document = {
    body: makeEl("body"),
    documentElement: makeEl("html"),
    getElementById(id) {
        if (id === "content") return contentEl;
        if (id === "cfx-goo") return gooCreated ? { __goo: true } : null;
        return null;
    },
    createElement: makeEl,
    createElementNS(_ns, tag) {
        const el = makeEl(tag);
        if (tag === "filter") gooCreated++;
        return el;
    },
    querySelectorAll() { return stages; },
    // 同上:页面是字符串,没有树可查。试玩区那个小窗口因此在这套 stub 里找不到,
    // mountWindowResize 早退 —— 缩放逻辑不在这里验
    querySelector() { return null; },
    addEventListener() {},
    removeEventListener() {},
};

Object.defineProperty(contentEl, "innerHTML", {
    get() { return html; },
    set(v) { html = v; },
});

let now = 0;
let rafQueue = [];
let rafId = 0;

const win = {
    document,
    performance: { now: () => now },
    requestAnimationFrame(fn) { rafQueue.push(fn); return ++rafId; },
    cancelAnimationFrame() { rafQueue = []; },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {},
    location: { hash: "#/cursor" },
};

global.window = win;
global.document = document;
global.performance = win.performance;
global.requestAnimationFrame = win.requestAnimationFrame;
global.cancelAnimationFrame = win.cancelAnimationFrame;
global.matchMedia = win.matchMedia;

// ---------- 载入被测代码 ----------
const fx = require(path.join(SITE, "cursor-fx.js"));
win.CursorFX = fx;

const pageSrc = fs.readFileSync(path.join(SITE, "pages", "cursor.js"), "utf8");
vm.runInThisContext(pageSrc, { filename: "pages/cursor.js" });

if (typeof win.renderCursor !== "function") throw new Error("renderCursor 没挂到 window 上");

// ---------- 跑 ----------
win.renderCursor();

const grid = html.match(/class="cx-stage" data-cx="([a-z]+)"/g) || [];
const ids = grid.map((m) => m.match(/data-cx="([a-z]+)"/)[1]);
console.log("renderCursor 生成的格子:", ids.join(", "));
if (!ids.length) throw new Error("没有生成任何格子");

// ---------- 页面上的承诺必须兑现 ----------
/*
 * 这一页和 cursor-states.md 是一对:清单说有什么,这里给出能看的证据。
 * 但「一对」这件事没有任何机制保证 —— 清单翻成 [x] 而展示页还挂着旧文字、或者
 * 反过来把已经做完的仍列在「还没做的」里,两边都不会报错,只会慢慢漂开。
 * 所以下面这组检查专门盯这个,它比逐帧那组更早发现「文档和代码不一致」。
 */
let contractBad = 0;
function must(ok, msg) {
    if (!ok) contractBad++;
    console.log(`  ${ok ? "✓" : "!!"} ${msg}`);
}

/*
 * 先把注释去掉再解析。
 * 不去掉的话,`[^{}]*\{` 会把注释一并当成选择器的一部分 —— 注释里的逗号还好,
 * 中文顿号不行:上面那段注释写着「原生 disabled、aria-disabled」,里面的 `[disabled]`
 * 于是和注释粘成一块,`heads.includes("[disabled]")` 永远为假。这不是假想,是第一次
 * 跑就踩到的 —— 检查本身报了个假警。
 */
const cssSrc = fs.readFileSync(path.join(SITE, "skin-ui.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const playStart = html.indexOf('<div class="card cx-play">');
const pendStart = html.indexOf('<div class="cx-pending">');
if (playStart < 0 || pendStart <= playStart) throw new Error("找不到试玩区或「还没做的」区块");
const playHTML = html.slice(playStart, pendStart);
const pendHTML = html.slice(pendStart);

/*
 * 试玩区里那几块之所以会变形,是三样东西连起来的:
 *   页面里真有那个元素  →  skin-ui.css 给它声明了 --cursor  →  hover.js 认领那个值,
 *   并且引擎有对应的采样函数。
 * 少任何一环,那个元素就只是个摆设 —— 而且不会报错,看上去一切正常。
 * 所以三环都查。这一页没有任何「演示模式」,查的必须是真链路。
 */
const LINK = [
    // [这条链路的说法, 样式表里为谁声明, --cursor 值, 试玩区里必须出现的记号]
    ["可点击 / 普通按钮", "button", "pointer", /<button type="button" class="btn cx-play-item">/],
    ["可点击 / 链接", "a[href]", "pointer", /<a href="#\/cursor" class="btn cx-play-item">/],
    ["不可点击 / 原生 disabled", "[disabled]", "not-allowed", /class="btn cx-play-item" disabled>/],
    ["不可点击 / 手动标注", ".cursor-not-allowed", "not-allowed", /class="cx-play-item cx-play-plain cursor-not-allowed"/],
    ["文本 / 段落", "p", "text", /<p class="cx-play-text cx-play-item">/],
    ["文本 / 输入框", 'input[type="text"]', "text", /<input type="text" class="cx-play-input cx-play-item"/],
    /*
     * 缩放那一组要四行,不是一个「拖动缩放」总称:取值说的是**拖的是哪条边/哪个角**,
     * 四条边/角各声明一个光标名、各画一个方向。合成一行的话,「把 nw 的选择器写成了
     * 45° 那条轴」这种错会溜过去 —— 而方向正是这一族唯一的变量。
     */
    ["拖动缩放 / 右边", '[data-resize="e"]', "ew-resize", /class="cx-grip cx-grip-e" data-resize="e"/],
    ["拖动缩放 / 下边", '[data-resize="s"]', "ns-resize", /class="cx-grip cx-grip-s" data-resize="s"/],
    ["拖动缩放 / 右下角", '[data-resize="se"]', "nwse-resize", /class="cx-grip cx-grip-se" data-resize="se"/],
    ["拖动缩放 / 左上角", '[data-resize="nw"]', "nesw-resize", /class="cx-grip cx-grip-nw" data-resize="nw"/],
    /*
     * 抓取和放大缩小。取值同样不是光标名本身,而是「这块东西是什么」——
     * 所以四行各自盯一个 data-* 值。移动那一行的宿主是窗口的标题栏,
     * 它同时也是缩放把手的落脚点(左上角压在上面),两个值同框是设计好的。
     */
    ["抓取 / 能拖的东西", '[data-drag="grab"]', "grab",
     /class="cx-drag cx-play-item" data-drag="grab"/],
    ["抓取 / 搬窗口的把手", '[data-drag="move"]', "move",
     /class="cx-win-bar" data-drag="move"/],
    ["放大缩小 / 推近", '[data-zoom="in"]', "zoom-in",
     /class="cx-zoom cx-play-item" data-zoom="in"/],
    ["放大缩小 / 拉远", '[data-zoom="out"]', "zoom-out",
     /class="cx-zoom cx-play-item" data-zoom="out"/],
];

// 样式表里所有规则,拆成「选择器部分」和「本体部分」
const CSS_BLOCKS = cssSrc.match(/[^{}]*\{[^{}]*\}/g) || [];
function selectorHead(block) { return block.slice(0, block.indexOf("{")); }
function bodyOf(block) { return block.slice(block.indexOf("{")); }
function selectorsOf(block) {
    return selectorHead(block).split(",").map((s) => s.trim()).filter(Boolean);
}
function blocksDeclaring(val) {
    const re = new RegExp("--cursor\\s*:\\s*" + val + "(\\s*!important)?");
    return CSS_BLOCKS.filter((b) => re.test(bodyOf(b)));
}

/*
 * 「这个元素会不会拿到这个 --cursor 值」——不能只比选择器字面相等。
 *
 * 文本那条规则的选择器是 `:where(h1, …, p, …):not(…)`:里面既没有一条正好等于 `p`
 * 的条目,又挂着十几条 :not()。所以先把 :not() 的内容**整段删掉**,剩下的才是
 * 「这条规则正面提到了谁」,再在剩下的里面按整词找。
 *
 * 不删 :not() 的话这个检查会变成假的:那条规则里就有 `:not(a[href] *)`,不删的话
 * 「a[href] 会拿到 text」也会算成立 —— 而它恰恰是最不该成立的那一条。
 * (删之前必须先把整条选择器拼回来再删:直接按逗号切会让 :not(...) 被切散,
 * 半截的 `:not(a[href] *` 匹配不上右括号,内容就删不掉了。)
 */
function positive(sel) {
    return sel.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, " ");
}
function mentions(sel, want) {
    const esc = want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(?<![\\w-])" + esc + "(?![\\w-])").test(sel);
}
function declaresFor(el, val) {
    return blocksDeclaring(val).some((b) =>
        positive(selectorHead(b)).split(",").some((s) => mentions(s.trim(), el)));
}

// --cursor 的值 -> 引擎要画哪种形状。取自 hover.js 自己那份映射,不在这里重写一份。
require(path.join(SITE, "hover.js"));
const MAP = win.HoverWatch && win.HoverWatch.MAP;

console.log("\n=== 试玩区:每一块是不是真的会变形 ===");
must(!!MAP, "hover.js 挂出了 HoverWatch.MAP");
for (const [label, sel, val, mark] of LINK) {
    const declared = declaresFor(sel, val);
    const present = mark.test(playHTML);
    const state = MAP && MAP[val];
    // 「viscous」-> sampleViscous。引擎里必须真有这个采样函数,否则映射就是在许愿。
    const fnName = state ? "sample" + state[0].toUpperCase() + state.slice(1) : "";
    const drawable = state && typeof fx[fnName] === "function";
    must(
        present && declared && drawable,
        `${label}:页面里${present ? "有" : "**没有**"}这个元素,` +
        `skin-ui.css${declared ? "声明了" : "**没声明**"} --cursor:${val},` +
        `hover.js 映射到${drawable ? ` ${state}(引擎有 ${fnName})` : "**没有可画的形状**"}`
    );
}

/*
 * ── 反过来的一组:我们画不出来,于是把原版鼠标让回来 ──
 *
 * 规矩是用户定的:「除非该状态没有对应鼠标效果,否则自动隐藏原版鼠标」。
 * 所以这一组块声明的值必须**真的在标准光标表里**:不在表里的话,rawIntent 会把
 * 它当成「没提要求」(和 auto 等价),原版鼠标不会出来,而我们也没画 —— 指针看着
 * 像能点、点下去却是另一回事,正是这条规矩要消灭的那种状态。
 * 同时它们必须**不在**认领表里:哪天谁给 crosshair 做了个形状,这一页的文案
 * (「我们画不出来,所以让位」)就在撒谎,这一节会红。
 */
console.log("\n=== 试玩区:「画不出来」的那几块是不是真的在让位 ===");
const REAL = win.HoverWatch && win.HoverWatch.REAL_CURSORS;
must(!!REAL && REAL.size > 0, `hover.js 报出了标准光标整表(${REAL ? REAL.size : 0} 个)`);
must(REAL && !["auto", "default", "none"].some((v) => REAL.has(v)),
    "整表里没有 auto / default / none —— 它们是「随大流」,不是「要个箭头」");
// 这一组不在 skin-ui.css 里,而在 cursor-fx.css 里 —— 意图和它那块元素的样式
// 放在一起,而这几块是展示页自己的东西(和 .cx-play-text 那些一样)。
const fxCSS = fs.readFileSync(path.join(SITE, "cursor-fx.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
const FX_BLOCKS = fxCSS.match(/[^{}]*\{[^{}]*\}/g) || [];
const handBlocks = FX_BLOCKS.filter(
    (b) => /\.cx-hand/.test(selectorHead(b)) && /--cursor\s*:/.test(bodyOf(b)));
must(handBlocks.length >= 3, `样式表里有 ${handBlocks.length} 块「让位」宿主`);
for (const b of handBlocks) {
    const sel = selectorHead(b).trim();
    const val = (bodyOf(b).match(/--cursor\s*:\s*([a-z-]+)/) || [])[1] || "";
    const mark = new RegExp('class="[^"]*' + sel.replace(/^\./, "") + '[ "]');
    const inPlay = mark.test(playHTML);
    must(!!val && !!REAL && REAL.has(val) && !MAP[val] && inPlay,
        `${sel} → --cursor:${val}:在标准表里${REAL && REAL.has(val) ? "✓" : "**没在**"},` +
        `我们没有形状${!MAP[val] ? "✓" : "**其实有**(那这块不该在这里)"},` +
        `试玩区里${inPlay ? "有" : "**没有**"}这一块`);
}

/*
 * ── 文本那条规则的两个坑,各有一句守着 ──
 *
 * 一、选择器里不能出现「括号外面的空白」。
 *     CSS 里空白是后代组合符。`:where(p) :not(.x *)` 的意思是「.x 的后代里、
 *     又位于某个 p 里面的元素」—— p 套 p,页面上根本不存在,于是整条规则**一处
 *     都不生效,而且不报错**。文本规则的第一版正是这么写坏的(:where(...) 和
 *     :not(...) 之间断了个行)。长选择器只能断在括号内部。
 *
 * 二、:not() 排除链必须和「声明 pointer / not-allowed 的那几组」同步。
 *     --cursor 会继承,所以「链接里面的正文」只能从选择器层面排掉。以后谁往那几组
 *     加一个能包住正文的选择器、却忘了加进这里,包在里面的段落就会悄悄变回 I 形。
 *     这条把它变成会红的。input 是空元素,装不下别的东西,给它加排除项是死条款,
 *     所以那一类不要求出现 —— 不是漏网,是没意义。
 */
console.log("\n=== 文本规则:换行没换错地方(换错就是静默失效)===");
/*
 * 把所有括号里的内容都塌成 (),于是只剩顶层结构:再按逗号切开,每一段都应当
 * 是一个**单个复合选择器**,内部没有空白。有空白就是后代组合符 —— 那不是排版,
 * 是换了意思。
 *
 * 顺序不能反:先按逗号切再塌括号是错的 —— :not(...) 和 :where(...) 里面的逗号
 * 会被切开,` button *` 这种片段本来就有(故意的)空白,检查会满屏假警。
 * 括号里面允许换行,也不该被管;只有括号外面才不许。
 */
function bareParens(sel) {
    let s = sel, prev;
    do { prev = s; s = s.replace(/\([^()]*\)/g, "()"); } while (s !== prev);
    return s;
}
const textBlocks = blocksDeclaring("text");
must(textBlocks.length > 0, "skin-ui.css 里有规则声明 --cursor: text");
for (const b of textBlocks) {
    const parts = bareParens(selectorHead(b)).split(",").map((s) => s.trim());
    const bad = parts.filter((p) => /\s/.test(p));
    must(bad.length === 0,
        `「${selectorHead(b).trim().split("\n")[0].slice(0, 40)}…」的 ${parts.length} 个条目都是单个复合选择器` +
        `${bad.length ? `  ← 这几段里有游离的空白「${bad[0]}」,空白是后代组合符,整条会静默失效` : ""}`);
}

console.log("\n=== 文本规则:排除链和 pointer/not-allowed/resize 那几组同步 ===");
const textProse = textBlocks.filter((b) => /:not\(/.test(selectorHead(b)))[0];
must(!!textProse, "文本那条规则带着 :not() 排除链");
const excl = new Set(
    ((textProse ? selectorHead(textProse) : "").match(/:not\(([^)]*)\)/g) || [])
        .flatMap((m) => m.slice(5, -1).split(",").map((s) => s.trim()).filter(Boolean))
);
console.log(`  排除链里有 ${excl.size} 项: ${[...excl].join(" | ")}`);

/*
 * 「谁声明了意图,而且我们画得出来」——这几组都要收进来。
 * 少收一组不会报错,只会让那一组**免检**:链里缺了它的后代排除项也照样绿。
 *
 * 那份名单改成从认领表(MAP)自己长出来了,不再手抄。以前这里是一个手写的
 * RESIZE_VALUES 数组,加缩放那一族的时候正是靠它才想起「缩放边里面的正文也得排掉」,
 * 可也正是它会被忘掉:新加一组宿主、却忘了往这儿抄一笔,那一组当场免检,而且绿着。
 * 现在「声明了意图的宿主」= 认领表里每一个值去样式表里找它声明给谁 —— 加值的时候
 * 两边一起动,漏不掉。
 *
 * 只排掉两个:
 *   auto —— 「随大流」不是意图,它谁也不认领;
 *   text —— 它**就是**上面那条正文规则自己,拿它去要求「它的后代也被排除」等于
 *           自己要求自己。
 *
 * 交还原版鼠标的那一组(下面单独查)**不在**这里:它们的取值我们画不出来,
 * 那片元素根本不进状态机,也就谈不上「它的后代被声明成文本会把它的意图顶掉」。
 */
const hostSelectors = [...new Set(
    Object.keys(MAP || {})
        .filter((v) => v !== "text" && v !== "auto")
        .flatMap((v) => blocksDeclaring(v).flatMap(selectorsOf))
)];
for (const s of hostSelectors) {
    // html.has-pointer 是那条规则自己的前提(只在藏了光标时才生效),和「谁声明了意图」无关
    const norm = s.replace(/^html\.has-pointer\s+/, "").trim();
    if (/^input\b/.test(norm)) continue;      // 空元素,包不住别的东西
    const need = norm.endsWith("*") ? norm : norm + " *";
    must(excl.has(need), `${norm} 的后代被排除了(链里有 ${need})`);
}

console.log("\n=== 文本规则:input 的两张名单不重叠 ===");
/*
 * 「可点击的控件」和「文字类控件」是两条各写各的正面名单,谁也不知道对方写了什么。
 * 一旦重叠,同一个元素就同时被声明 pointer 和 text,结果只取决于两条规则谁写在后面
 * —— 「靠行序才对」正是这套代码一直在躲的东西。
 *
 * 顺带挡住另一种写法:裸 `input` 或者 `input:not([type="hidden"])` 这种一把全抓的
 * 选择器 —— 它抓不出一份确切名单,一写就把对方那张表整张抢过来(文本规则的第一版
 * 就是这么写的)。所以这里不只比名单,还要求两边都不许出现「全抓」。
 */
function inputClaims(sel) {
    if (!/^input\b/.test(sel)) return null;
    const types = [...sel.matchAll(/\[type="([^"]*)"\]/g)].map((m) => m[1]);
    const nots = [...sel.matchAll(/:not\(([^)]*)\)/g)].map((m) => m[1].trim());
    // 只有 `:not([type])` 这一种是「说得清」的:它指的是不写 type 的那些
    const noType = nots.length === 1 && nots[0] === "[type]";
    return { types, catchAll: !noType && nots.length === 0 && types.length === 0, noType };
}
function claimsOf(blocks) {
    const out = { types: new Set(), catchAll: [], noType: 0 };
    for (const s of blocks.flatMap(selectorsOf)) {
        const c = inputClaims(s);
        if (!c) continue;
        if (c.catchAll) out.catchAll.push(s);
        if (c.noType) out.noType++;
        for (const t of c.types) out.types.add(t);
    }
    return out;
}
const ptrIn = claimsOf(blocksDeclaring("pointer"));
const txtIn = claimsOf(textBlocks);
const both = [...txtIn.types].filter((t) => ptrIn.types.has(t));
must([...txtIn.catchAll, ...ptrIn.catchAll].length === 0,
    `两边都没有「一把全抓」的 input 选择器` +
    `${[...txtIn.catchAll, ...ptrIn.catchAll].length
        ? `  ← ${[...txtIn.catchAll, ...ptrIn.catchAll].join(" / ")} 会把对方那张表抢过来,` +
          "同一个元素同时被声明两种意图,谁赢只看行序"
        : ""}`);
must(both.length === 0,
    `可点击的 ${ptrIn.types.size} 种 input 和文字的 ${txtIn.types.size} 种没有重叠` +
    `${both.length ? `  ← ${both.join(" / ")} 两边都认` : ""}`);
must(txtIn.noType === 1 && ptrIn.noType === 0,
    `「不写 type 的 input」只被文字那边认一次` +
    `${txtIn.noType === 1 && ptrIn.noType === 0 ? "" : `  ← 文字 ${txtIn.noType} 次、可点击 ${ptrIn.noType} 次`}`);

/*
 * 「还没做的」区块不能列出已经做完的。
 * 用前缀匹配而不是包含:清单里的条目写成「文本 text」「可抓取 grab / 抓取中 grabbing」这种
 * 「中文 + 取值」的格式,所以「做完了」应当表现为「没有任何条目以这个名字开头」。
 * 反过来用包含会误伤 —— 「不可点击」里就含「可点击」。
 */
console.log("\n=== 「还没做的」不能列出已经做完的 ===");
const gridNames = (html.match(/<span class="cx-name">([^<]+)<\/span>/g) || [])
    .map((m) => m.replace(/<[^>]+>/g, ""));
const pendCodes = (pendHTML.match(/<code>([^<]*)<\/code>/g) || [])
    .map((m) => m.replace(/<\/?code>/g, "").trim());

must(gridNames.length === ids.length, `${ids.length} 格都有名字(页面里的名字数 = 格子数)`);
must(pendCodes.length > 0, `「还没做的」里有 ${pendCodes.length} 条 —— 是空的这条检查就白做了`);
for (const n of gridNames) {
    const clash = pendCodes.find((p) => p.startsWith(n));
    must(!clash, `${n} 已经在上面演着了${clash ? `,不该还挂在「还没做的」里(撞上「${clash}」)` : ""}`);
}

// 每一格都得有角标,否则「自己会演的」和「元素触发的」这两种格子会混在一起
const chips = (html.match(/<span class="cx-chip is-live">([^<]*)<\/span>/g) || [])
    .map((m) => m.replace(/<[^>]+>/g, ""));
console.log(`\n格子角标: ${chips.join(" / ")}`);
must(chips.length === ids.length && chips.every((c) => c.trim()),
    "每一格都有角标(元素触发的几格不能和会自己演的混在一起)");

// 根据生成出来的 id 建假 stage,再跑一次 mount(renderCursor 内部已经调过一次,
// 那次因为没有 stage 会直接返回,所以这里补上)
for (const id of ids) {
    const st = makeEl("div");
    st.className = "cx-stage";
    st.dataset.cx = id;
    stages.push(st);
}
win.CursorFX.ensureGoo();
now = 0;
rafQueue = [];
vm.runInThisContext("mountCursorGallery()", { filename: "mount-call" });

console.log("goo 滤镜注入次数:", gooCreated, "(应当只注一次)");

// 逐帧推进,记录每格的轨迹
const R0 = fx.CFG.R0;
const MAX_ACT = Math.max(...ids.map(() => fx.TOTAL_MS)) + 3000;
const STEP = 1000 / 60;

const seen = {};
ids.forEach((id) => {
    seen[id] = { run: 0, pause: 0, xmin: 1e9, xmax: -1e9, ymin: 1e9, ymax: -1e9, sMin: 1e9, sMax: -1e9, steps: 0, nan: 0,
        // 画出来的外接盒(把半径也算进去),以及「最宽那一帧有多扁」——
        // 上面那组只记球心,量不出「一摊」和「一颗」的区别。
        dxmin: 1e9, dxmax: -1e9, dymin: 1e9, dymax: -1e9, wMax: -1e9, wAspect: 1 };
});

function framesOf(stage) {
    // 从 stage 里揪出 .cfx 上的 3 个球对应的 transform
    const anchor = stage.children[0];
    const goo = anchor.children[1];
    return goo.children.map((b) => {
        const t = b.style.transform || "translate3d(0px, 0px, 0) scale(1)";
        const m = t.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) scale\(([\d.]+)\)/);
        return { x: +m[1], y: +m[2], s: +m[3], op: b.style.opacity };
    });
}

let t = 0;
const pressFrames = [];
while (t < MAX_ACT) {
    now = t;
    const q = rafQueue;
    rafQueue = [];
    for (const fn of q) fn(now);

    ids.forEach((id, i) => {
        const st = stages[i];
        const s = seen[id];
        const bs = framesOf(st);
        if (id === "press" && st.children[0].style.opacity !== "0") pressFrames.push(bs);
        const visible = st.children[0].style.opacity !== "0";
        if (visible) s.run++; else s.pause++;
        s.steps++;
        for (const b of bs) {
            if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.s)) s.nan++;
            s.xmin = Math.min(s.xmin, b.x); s.xmax = Math.max(s.xmax, b.x);
            s.ymin = Math.min(s.ymin, b.y); s.ymax = Math.max(s.ymax, b.y);
            s.sMin = Math.min(s.sMin, b.s); s.sMax = Math.max(s.sMax, b.s);
        }
        if (visible) {
            // 画出来的外接盒:每个球的半径是 b.s·R0
            const w = Math.max(...bs.map((b) => b.x + b.s * R0)) - Math.min(...bs.map((b) => b.x - b.s * R0));
            const h = Math.max(...bs.map((b) => b.y + b.s * R0)) - Math.min(...bs.map((b) => b.y - b.s * R0));
            s.dxmin = Math.min(s.dxmin, Math.min(...bs.map((b) => b.x - b.s * R0)));
            s.dxmax = Math.max(s.dxmax, Math.max(...bs.map((b) => b.x + b.s * R0)));
            s.dymin = Math.min(s.dymin, Math.min(...bs.map((b) => b.y - b.s * R0)));
            s.dymax = Math.max(s.dymax, Math.max(...bs.map((b) => b.y + b.s * R0)));
            if (w > s.wMax) { s.wMax = w; s.wAspect = h / w; }
        }
    });
    t += STEP;
}

// ---------- 判定 ----------
const STAGE_H = 168, STAGE_HALF_W = 103;   // 236 宽格子的内部半宽(保守取 103)
let bad = 0;

console.log("\n=== 逐格 ===");
for (const id of ids) {
    const s = seen[id];
    const pad = R0;   // 球心至少离边一个半径
    const inX = s.xmin >= -STAGE_HALF_W + pad && s.xmax <= STAGE_HALF_W - pad;
    const inY = s.ymin >= -STAGE_H / 2 + pad && s.ymax <= STAGE_H / 2 - pad;
    const loops = s.run / s.steps;
    const ok = s.nan === 0 && inX && inY && loops > 0.2 && loops < 0.98;
    if (!ok) bad++;
    console.log(
        `  ${id.padEnd(8)} 演出占比 ${(loops * 100).toFixed(0)}%  缩放 ${s.sMin.toFixed(3)}~${s.sMax.toFixed(3)}` +
        `  x ${s.xmin.toFixed(1)}~${s.xmax.toFixed(1)}  y ${s.ymin.toFixed(1)}~${s.ymax.toFixed(1)}` +
        `  NaN ${s.nan}  ${ok ? "OK" : "!! 越界/异常"}`
    );
}

/*
 * 按下那格必须真的摊成一摊 —— 而且这一摊是**俯视**的:一摊圆的液体,就一整片。
 *
 * 这条判据换过三次,每一次都是用户把上一版的形状否了:
 *
 *   第一版  「最小缩放 = 0.86」—— 那是「球缩小一点沉下去」,正是要换掉的形状。
 *   第二版  「最宽处 > 2.2·R0 而且宽高比 < 0.75」(扁)。用户把整个否了:
 *           **「现在是扁扁的形状,这不对,应该是圆形的,因为是俯视角度,液体摊开的
 *           效果」** —— 俯视看下去,「扁」在画面上根本不存在。
 *   第三版  「圆的一摊 + 外面溅出去的几颗小液滴」。用户又否了:
 *           **「去掉那些小液滴,并且摊开的轮廓再放大一点」**
 *           —— 外圈删掉,那一摊自己从 1.17 倍放到 1.60 倍。
 *
 * 第三版那一套数(喝一口几颗断开的液滴、按实测桥接门槛判「断没断」)连同
 * supAlong / needGap 两个帮手一起删了。现在量的是俯视口径下的四件事:
 *
 *   比球大    等效面积直径 > 1.45 倍(用户点名 1.6 倍)
 *   是圆的    轮廓 72 个方向的最外沿,最大/最小 < 1.25
 *   一整片    球和球之间**几何上还叠着**(最小间隙是负数)。比「按门槛判断开」硬:
 *             叠着就意味着并集是一整片,和 goo 怎么调都没关系
 *   不多不少  画出来的球数就是核 + 外缘那一圈
 *
 * 这几个数都是**渲染之前**算的:test_page 拿到的是 DOM 里的 transform,量不出 goo
 * 糊完的样子,所以「一整片」不看渲染结果,直接看几何。
 */
{
    const nMain = 1 + fx.CFG.SPLAT_RIM;

    // 沿 N 个方向量并集的最外沿
    function rimOf(list, n) {
        const N = n || 72;
        const out = [];
        for (let i = 0; i < N; i++) {
            const a = 2 * Math.PI * i / N, ca = Math.cos(a), sa = Math.sin(a);
            let r = 0;
            for (const b of list) {
                const rad = R0 * b.s, c = b.x * ca + b.y * sa, pp = -b.x * sa + b.y * ca;
                const d = rad * rad - pp * pp;
                if (d <= 0) continue;
                r = Math.max(r, c + Math.sqrt(d));
            }
            out.push(r);
        }
        return out;
    }
    // 并集的面积(极坐标区间归并),用来算「等效直径」
    function areaOf(list) {
        const N = 720, tp = 2 * Math.PI;
        let acc = 0;
        for (let i = 0; i < N; i++) {
            const phi = (i + 0.5) * tp / N, cp = Math.cos(phi), sp = Math.sin(phi), iv = [];
            for (const b of list) {
                const r = R0 * b.s, c = b.x * cp + b.y * sp, pp = -b.x * sp + b.y * cp;
                const d = r * r - pp * pp;
                if (d <= 0) continue;
                const h = Math.sqrt(d);
                if (c + h <= 0) continue;
                iv.push([Math.max(0, c - h), c + h]);
            }
            if (!iv.length) continue;
            iv.sort((a, b) => a[0] - b[0]);
            let cur = iv[0];
            for (const seg of iv.slice(1)) {
                if (seg[0] <= cur[1]) { if (seg[1] > cur[1]) cur = [cur[0], seg[1]]; }
                else { acc += cur[1] ** 2 - cur[0] ** 2; cur = seg; }
            }
            acc += cur[1] ** 2 - cur[0] ** 2;
        }
        return 0.5 * tp / N * acc;
    }
    function pressed(bs) {
        const vis = bs.filter((b) => b.op !== "0");
        const rl = rimOf(vis);
        const w = Math.max(...vis.map((b) => b.x + b.s * R0)) - Math.min(...vis.map((b) => b.x - b.s * R0));
        const h = Math.max(...vis.map((b) => b.y + b.s * R0)) - Math.min(...vis.map((b) => b.y - b.s * R0));
        /*
         * 一整片的硬证据:球和球之间**几何上还叠着**。这一条是上一版 supAlong/needGap
         * (按实测的 goo 桥接门槛判「断没断」)替下来的 —— 叠着就意味着并集必然是一整片,
         * 不需要知道 goo 参数是多少,也不会因为门槛表过时而失准。
         */
        let minGap = Infinity;
        for (let i = 0; i < vis.length; i++) {
            for (let j = i + 1; j < vis.length; j++) {
                const g = Math.hypot(vis[i].x - vis[j].x, vis[i].y - vis[j].y) - R0 * (vis[i].s + vis[j].s);
                if (g < minGap) minGap = g;
            }
        }
        return {
            w, ratio: h / w, round: Math.max(...rl) / Math.min(...rl),
            pad: 2 * Math.sqrt(areaOf(vis) / Math.PI),
            balls: vis.length, minGap,
            reach: 2 * Math.max(...vis.map((b) => Math.hypot(b.x, b.y) + R0 * b.s)),
        };
    }

    const p = seen.press;
    const all = pressFrames.map(pressed);
    /*
     * 「满状态」= 那一摊长到头的那几帧。
     *
     * 不能拿整段跑下来的极值:按下的前 210ms 里外缘那一圈还**收在核里面**
     * (半径从核里插值出来,位置又乘着 g),那时候整组比摊开时小得多 —— 那是
     * 「摊开」的过程本身,不是形状。判据卡在那一摊自己的等效直径上(它才是
     * 「长到头」的凭据),留 5% 的余量。
     */
    const padMax = Math.max(...all.map((m) => m.pad));
    const full = all.filter((m) => m.pad >= 0.95 * padMax);
    const lo = (k) => Math.min(...full.map((m) => m[k]));
    const hi = (k) => Math.max(...full.map((m) => m[k]));

    console.log("\n=== 按下那一摊是俯视的圆,而且就一整片 ===");
    must(full.length > all.length / 4,
        `按下那格有 ${full.length}/${all.length} 帧是「摊到头」的(太少说明那一摊根本没长起来)`);
    // 那一摊比球大。等效面积直径,实测 41.5~41.6px = 1.60×,球是 26px
    must(lo("pad") > 1.45 * 2 * R0,
        `那一摊的等效直径 ${lo("pad").toFixed(1)}~${hi("pad").toFixed(1)}px` +
        ` = 球的 ${(lo("pad") / (2 * R0)).toFixed(2)}×~(要 > 1.45,用户点名 1.6 倍)`);
    /*
     * 圆不圆,两个口径一起量。
     *
     * 高/宽和第二版**正好相反**:那时要「明显是扁的」(高/宽 < 0.75),现在要
     * 「接近 1」,上下都得卡住 —— 只卡下限的话,一个竖着的椭圆照样通过。
     * 光看这个还不够:高/宽只在两个方向上量,圆周上的一圈锯齿它看不见,
     * 所以下面再用 72 个方向的轮廓量一次圆度。
     */
    must(lo("ratio") > 0.85 && hi("ratio") < 1.18,
        `每一帧的高/宽 ${lo("ratio").toFixed(2)}~${hi("ratio").toFixed(2)}(要落在 0.85~1.18)` +
        `  ← 俯视看下去是圆的,不是压扁的(旧那版是 0.50)`);
    // 那一摊是圆的(轮廓 72 个方向),实测 1.13 上下;旧那版扁椭圆 1.8
    must(hi("round") < 1.25,
        `那一摊的圆度 ${lo("round").toFixed(3)}~${hi("round").toFixed(3)}(要 < 1.25,正圆 1.00)`);
    /*
     * 就一整片,而且是「不多不少」的一整片。
     *
     * 上一版这里数的是外面断开的液滴有几颗;液滴删掉之后,这一条整个**反过来**:
     * 球数必须就是核 + 外缘那一圈,而且它们几何上还叠着 —— 叠着就意味着并集是
     * 一整片,**和 goo 怎么调都没关系**(上一版得先知道 goo 的桥接门槛才能判「断没断」)。
     * 它顺带守住了「放大不许把外缘拉裂」:10 团外缘本来就叠得很重,真裂了这里立刻是正的。
     */
    must(hi("balls") === nMain,
        `画出来的球数 ${lo("balls")}~${hi("balls")} 颗(该恒等于 ${nMain} = 核 + ${fx.CFG.SPLAT_RIM} 团外缘)` +
        `  ← 多出来的就是散开的碎块或者被加回来的液滴`);
    must(hi("minGap") < -2,
        `最松那一帧最小的边到边间隙 ${hi("minGap").toFixed(1)}px(要 < -2,负数 = 还叠着)` +
        `  ← 一旦是正的,那一摊就裂成几块了`);
    // 「整体和等效圆差不多大」:没有散在远处的碎块,也不是某个方向探出去很远的星形
    must(hi("reach") < lo("pad") * 1.15,
        `整体外沿 ${lo("reach").toFixed(1)}~${hi("reach").toFixed(1)}px vs 等效直径 ${lo("pad").toFixed(1)}px`);
}

// 加载中那格必须出现三个不同的球
{
    const st = stages[ids.indexOf("loading")];
    const bs = framesOf(st);
    const spread = Math.max(...bs.map((b) => Math.hypot(b.x, b.y)));
    console.log(`加载中最后一帧三球最远距中心 ${spread.toFixed(2)}px(静止时应回到 0)`);
}

// 换页:节点失联后 rAF 应当自己停掉
for (const st of stages) st.isConnected = false;
now = t + STEP;
const q = rafQueue; rafQueue = [];
for (const fn of q) fn(now);
console.log(`换页后是否自停: ${rafQueue.length === 0 ? "是 ✓" : "否 !! 仍在排队"}`);
if (rafQueue.length) bad++;

const fail = bad + contractBad;
console.log(fail === 0 ? "\n全部通过" : `\n${fail} 项不合格`);
process.exit(fail === 0 ? 0 : 1);
