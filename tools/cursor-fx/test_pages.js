/*
 * 逐页审:这个站上「到底会等什么」。
 *
 * 加载态整套判据的地基是一句话 —— 「在等 = 媒体真的还没到」。这句话不是自明的,
 * 它要三件事同时成立,而这个脚本就是把三件事对着真源码挨个查一遍:
 *
 *   1) 页面上真的会出现还没到的媒体。否则整套加载态是死代码,写了也看不见。
 *   2) 引用的本地文件真的在磁盘上。缺文件时 img 的 onerror 会把 src 换成远端地址
 *      (缩略图缺失的兜底),「在等什么」当场就换了对象。
 *   3) 每一次把媒体塞进 DOM 的地方,之后都有人数一遍。漏一处,那处的媒体就永远不被监听。
 *
 * 第 3 条是这里唯一查不出「未来」的一条 —— 它只能验已知的注入点。所以判断写成
 * 「注入之后 scan 的次数必须增加」,而不是去猜哪个函数算注入点。
 *
 * 跑法:node tools/cursor-fx/test_pages.js [站点根目录]
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SITE = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../..");

// ---------- 最小 DOM 桩 ----------
// 页面脚本只做一件事:往 #content(或 #blog-content)里写一段 HTML 字符串。
// 所以这里不需要真的解析,只需要把字符串接住。
function makeEl(tag) {
    return {
        tagName: tag.toUpperCase(),
        style: {},
        dataset: {},
        children: [],
        innerHTML: "",
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener() {},
        removeEventListener() {},
        // scan() 会拿容器当根去找媒体,所以桩元素也得有这两个 —— 真元素本来就有
        querySelectorAll() { return []; },
        matches() { return false; },
        isConnected: true,
    };
}

const contentEl = makeEl("div");
const blogContentEl = makeEl("div");

const windowListeners = {};
const win = {
    document: null,
    location: { hash: "#/home" },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener(t) { (windowListeners[t] = windowListeners[t] || []).push(1); },
    removeEventListener() {},
    setTimeout: () => 0,
    clearTimeout: () => {},
};

/*
 * 标签页按钮的桩。
 *
 * 它们本来就在 #content 里,只是这个桩不解析 HTML —— 所以从刚写进去的那段字符串里
 * 按 tab 名字抠出来,做成能记住 class 的假元素。存在的理由:换标签页时「哪个该高亮」
 * 那段逻辑刚改过(原来读的是 onclick 里的隐式全局 event),没有这个就没人验它。
 * 建一次就留着,因为 class 的状态得跨调用累积。
 */
let btnCache = null;
function blogButtons() {
    if (btnCache) return btnCache;
    btnCache = [];
    for (const m of contentEl.innerHTML.matchAll(/class="blog-tab-btn[^"]*"[^>]*data-tab="([^"]*)"/g)) {
        const cls = new Set();
        btnCache.push({
            dataset: { tab: m[1] },
            classList: {
                add: (c) => cls.add(c),
                remove: (c) => cls.delete(c),
                toggle(c, on) { if (on) cls.add(c); else cls.delete(c); return !!on; },
                contains: (c) => cls.has(c),
            },
        });
    }
    return btnCache;
}

const documentStub = {
    readyState: "loading",          // 别让 loading.js 自己在载入时扫一遍,这次由我们来调
    documentElement: makeEl("html"),
    body: makeEl("body"),
    getElementById(id) {
        if (id === "content") return contentEl;
        if (id === "blog-content") return blogContentEl;
        return null;
    },
    querySelectorAll(sel) {
        if (sel === ".blog-tab-btn") return blogButtons();
        return [];                   // 桩里没有真元素,scan 扫不到东西(也不该扫到)
    },
    // 展示页生成完之后会去找那个小窗口(试玩区的拖动宿主)。桩里没有真 DOM 树,
    // 找到 null 是对的 —— 这一页查的是「每一页会等什么」,和拖动无关
    querySelector() { return null; },
    createElement: makeEl,
    createElementNS: (_ns, tag) => makeEl(tag),
    addEventListener() {},
    removeEventListener() {},
};
win.document = documentStub;

global.window = win;
global.document = documentStub;
global.location = win.location;
global.performance = win.performance;
global.matchMedia = win.matchMedia;
global.requestAnimationFrame = win.requestAnimationFrame;
global.cancelAnimationFrame = win.cancelAnimationFrame;
global.setTimeout = win.setTimeout;
global.clearTimeout = win.clearTimeout;

// ---------- 载入真源码 ----------
// loading.js 是唯一说得出「哪些标签算媒体」的地方,所以那个选择器从它那里读,
// 不在这里再抄一份 —— 抄一份的话,以后它加一种标签,这边查不出来。
vm.runInThisContext(fs.readFileSync(path.join(SITE, "loading.js"), "utf8"), { filename: "loading.js" });
const LoadingWatch = win.LoadingWatch;
if (!LoadingWatch) throw new Error("loading.js 没有挂出 LoadingWatch");

let scans = 0;
const realScan = LoadingWatch.scan;
LoadingWatch.scan = function (...args) { scans++; return realScan.apply(this, args); };

const MEDIA_SEL = LoadingWatch.MEDIA_SEL;
if (typeof MEDIA_SEL !== "string") throw new Error("loading.js 应当导出 MEDIA_SEL,这个脚本靠它定义「什么算媒体」");
const covered = MEDIA_SEL.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

for (const f of fs.readdirSync(path.join(SITE, "pages"))) {
    if (f.endsWith(".js")) vm.runInThisContext(fs.readFileSync(path.join(SITE, "pages", f), "utf8"), { filename: "pages/" + f });
}

// ---------- 抽出媒体 ----------
/*
 * 这里有两份名单,必须分清,否则第 2 节那句断言是空的:
 *   MEDIA_SEL  —— loading.js 要不要盯它。唯一真相,从 loading.js 读。
 *   CANDIDATES —— 浏览器会不会为它去取字节。抄自 HTML 规范的 embedded content。
 *
 * 断言是「页面上用到的 CANDIDATES ⊆ MEDIA_SEL」。所以 CANDIDATES 必须写得**比**
 * MEDIA_SEL 宽 —— 只列 MEDIA_SEL 那三种的话,这个断言永远不可能失败,等于没写。
 * (第一版就是这样:首页塞一个 <audio>,查不出来。)
 *
 * 残留的局限,说清楚:<source>/<track> 不列在里面,因为它们只作为子元素出现在
 * video/audio/picture 内部,父元素已经被盯上了,单列出来只会误报。除此之外,
 * 一份手写的名单总有漏 —— 真要上新标签,它是靠这行断言提醒的,不是靠它自己知道。
 */
const CANDIDATES = ["audio", "video", "img", "iframe", "embed", "object", "picture"];
const SRC_ATTR = { object: "data" };    // object 不用 src,用 data

function mediaIn(html) {
    const out = [];
    for (const m of html.matchAll(new RegExp(`<(${CANDIDATES.join("|")})\\b([^>]*)>`, "gi"))) {
        const kind = m[1].toLowerCase();
        const want = SRC_ATTR[kind] || "src";
        const a = m[2].match(new RegExp(`\\b${want}\\s*=\\s*"([^"]*)"`));
        if (a) { out.push({ kind, src: a[1] }); continue; }
        // 自己没有地址:地址在子元素里(video/picture 用 <source>)
        const rest = html.slice(m.index + m[0].length);
        const end = rest.search(new RegExp(`</${kind}\\s*>`, "i"));
        const inner = end >= 0 ? rest.slice(0, end) : "";
        for (const s of inner.matchAll(/<source\b[^>]*?\bsrc\s*=\s*"([^"]*)"[^>]*>/gi)) {
            out.push({ kind, src: s[1] });
        }
    }
    return out;
}

function localFile(src) {
    return path.join(SITE, decodeURIComponent(src.split("?")[0].split("#")[0]));
}

let bad = 0;        // 接线 / 代码问题 —— 这些是这次能改的,决定退出码
let gaps = 0;       // 内容缺口 —— 图没画、文件没放,得由人补,改代码补不出来
function must(ok, msg) {
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "!!"} ${msg}`);
}
/*
 * 内容缺口单独计数,是因为它和「接线错了」不是一回事:接线错了看一眼就知道该改哪,
 * 而缺一张图只能等它被画出来。混在一个退出码里的话,这个套件会长期红着,
 * 而红久了就没人看了 —— 那还不如把两件事分开说清楚。
 * 它照样是 `!!` 打头、照样逐条列出来,只是不冒充「代码坏了」。
 */
function gap(ok, msg) {
    if (!ok) gaps++;
    console.log(`  ${ok ? "✓" : "!!"} ${msg}`);
}

function capture(fn) {
    contentEl.innerHTML = "";
    blogContentEl.innerHTML = "";
    fn();
    return contentEl.innerHTML + blogContentEl.innerHTML;
}

// ---------- 一页一页过 ----------
const pages = [
    ["首页", () => win.renderHome()],
    ["博客", () => win.renderBlog()],
    ["作品集", () => win.renderPortfolio()],
    ["关于", () => win.renderAbout()],
    ["光标", () => win.renderCursor()],
];
for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    pages.push([`项目 ${id}`, () => { win.location.hash = `#/project?id=${id}`; win.renderProject(); }]);
}

console.log("=== 每一页会等什么 ===");
const perPage = [];
const allFiles = new Map();     // 本地文件 -> 被哪些页面引用

for (const [name, run] of pages) {
    const media = mediaIn(capture(run));
    const local = media.filter((m) => !/^https?:/i.test(m.src));
    const remote = media.filter((m) => /^https?:/i.test(m.src));

    for (const m of local) {
        const p = localFile(m.src);
        const rel = path.relative(SITE, p);
        if (!allFiles.has(rel)) allFiles.set(rel, []);
        allFiles.get(rel).push(name);
    }
    perPage.push({ name, media, local, remote });

    const kinds = [...new Set(media.map((m) => m.kind))].join("+") || "——";
    const desc = media.length
        ? `${media.length} 个(${kinds}),其中 ${remote.length} 个要过网络`
        : "没有媒体";
    console.log(`  ${name.padEnd(9)} ${desc}`);
}

console.log("\n=== 1. 本地引用的文件真的在吗 ===");
// 缺文件的后果不只是「图裂了」:onerror 会把 src 换成远端地址,于是「等什么」变了 ——
// 那张图从此每次都要过网络,而且换成了一个随机图
for (const [rel, where] of allFiles) {
    const ok = fs.existsSync(path.join(SITE, rel));
    gap(ok, `${rel}${ok ? "" : `  ← ${where.join(" / ")} 引用了它,但文件不在` +
        "(会走 onerror 兜底,换成一张远端随机图)"}`);
}

console.log("\n=== 2. 页面上会取字节的东西,loading.js 都认吗 ===");
// 这条是这一节真正的断言:漏一种,那种媒体加载时加载态是看不见的 —— 而且是静默的
const kindsOnSite = new Set();
for (const p of perPage) for (const m of p.media) kindsOnSite.add(m.kind);
for (const k of [...kindsOnSite].sort()) {
    must(covered.includes(k),
        `<${k}> 在 MEDIA_SEL(${MEDIA_SEL})里` +
        `${covered.includes(k) ? "" : "  ← 它会取字节,但加载态看不见它"}`);
}
console.log(`  (站上出现的种类:${[...kindsOnSite].sort().join(", ") || "无"};候选名单:${CANDIDATES.join(", ")})`);

console.log("\n=== 3. 站上真的存在「慢到看得见」的等待吗 ===");
// 全本地、全缓存命中的话,GRACE_MS 会把每一次等待都滤掉 —— 那加载态就是死代码。
// 所以要有一个非本地的、真的要走网络的宿主。
const slowHosts = perPage.filter((p) => p.remote.length > 0);
const iframeHosts = perPage.filter((p) => p.media.some((m) => m.kind === "iframe"));
must(slowHosts.length > 0,
    `站上有 ${slowHosts.length} 页会等远端资源(${slowHosts.map((p) => p.name).join(" / ") || "一个都没有"})`);
must(iframeHosts.length > 0,
    `其中 ${iframeHosts.length} 页是跨域 iframe(${iframeHosts.map((p) => p.name).join(" / ") || "没有"})` +
    "  —— 跨域 iframe 拿不到内部状态,是唯一「确定会等一会儿」的那种");

console.log("\n=== 4. 每一次把媒体塞进 DOM,之后都数过一遍吗 ===");
// 换页那一路由 main.js 的 renderPage 统一收口(它拼完页面会调 scan)。
// 这里只验**渲染之后、用户动手才注入**的那一路 —— 那一路没有任何统一收口点。
{
    win.renderBlog();
    const before = scans;
    win.switchBlogTab("dh2323");            // 这个标签页没有媒体,但换页动作本身就是一次注入
    const afterFirst = scans;
    win.switchBlogTab("dh2650");            // 这个带着那个 93MB 的 demo
    const injected = mediaIn(blogContentEl.innerHTML);
    must(afterFirst > before && injected.length > 0,
        `换博客标签页之后有人重新数了一遍(停下时注入的媒体 ${injected.length} 个,` +
        `scan 次数 ${before} → ${afterFirst} → ${scans})` +
        `${afterFirst > before ? "" : "  ← 这一路没有收口点,新注入的媒体永远不会被监听"}`);

    // 激活态认的是 data-tab,不再读 onclick 里那个隐式全局 event —— 那个在 Firefox 里
    // 根本不存在,函数会在写内容之前就抛掉,标签页整个点不动
    const btns = documentStub.querySelectorAll(".blog-tab-btn");
    const at = (t) => btns.find((b) => b.dataset.tab === t);
    must(btns.length === 2, `两个标签按钮都带上了 data-tab(${btns.length} 个)`);
    must(at("dh2650") && at("dh2650").classList.contains("active"), "切到 dh2650 后它是高亮的");
    must(at("dh2323") && !at("dh2323").classList.contains("active"), "同时 dh2323 不再是高亮的");
    win.switchBlogTab("dh2323");
    must(at("dh2323").classList.contains("active") && !at("dh2650").classList.contains("active"),
        "切回去也对调过来了");
}

console.log("\n=== 汇总:加载态在这个站上的宿主 ===");
const hostCount = perPage.filter((p) => p.media.length > 0).length;
console.log(`  ${pages.length} 页里有 ${hostCount} 页会出现媒体;`);
for (const p of perPage) {
    if (!p.media.length) continue;
    const kinds = [...new Set(p.media.map((m) => m.kind))].join("/");
    console.log(`    ${p.name.padEnd(9)} ${String(p.media.length).padStart(2)} 个 ${kinds}`);
}

console.log("");
if (bad === 0) console.log("接线全部通过");
else console.log(`${bad} 项接错了`);
if (gaps > 0) console.log(`另有 ${gaps} 处内容缺口(见上面第 1 节,不是代码问题,要补文件)`);
process.exit(bad === 0 ? 0 : 1);
