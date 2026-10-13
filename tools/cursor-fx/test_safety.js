/*
 * 「不会伤到人」那三件事。
 *
 * 光标主题是把系统鼠标**换掉**的:一旦它自己出问题,用户不是「看到一个坏样式」,
 * 是「指针没了」。所以这一套验的东西和别的校验不一样 —— 别的验的是「画得像不像」,
 * 这里验的是**三个承诺有没有被字面做到**:
 *
 *   1. 减弱动效(prefers-reduced-motion: reduce)—— 只保留位置跟随,去掉形变。
 *      这个开关散在四个地方:ball.js(按下缩放 + rAF)、skin-ui.css(球的淡入淡出)、
 *      hover.js 和 loading.js(液体整套不进)、cursor-fx.css(液体的过渡)。
 *      少接一处不会报错,只会安静地半做 —— 液体不分裂了、球还在缩,那种最难查。
 *
 *   2. 键盘导航(Tab 聚焦)—— 球不参与,焦点环独立可见。
 *
 *   3. 脚本失败(JS 报错或未加载)—— 立刻恢复系统光标。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SITE = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../..");
const BALL_SRC = fs.readFileSync(path.join(SITE, "ball.js"), "utf8");
const FX_SRC = fs.readFileSync(path.join(SITE, "cursor-fx.js"), "utf8");
const SKIN_CSS = fs.readFileSync(path.join(SITE, "skin-ui.css"), "utf8");
const FX_CSS = fs.readFileSync(path.join(SITE, "cursor-fx.css"), "utf8");

let bad = 0;
let total = 0;
function check(name, cond, detail) {
    total++;
    if (!cond) bad++;
    console.log(`  ${cond ? "✓" : "!!"} ${name}${detail ? "  — " + detail : ""}`);
}
function section(title) { console.log(`\n=== ${title} ===`); }

// ---------- DOM 桩 ----------
/*
 * 比 test_hover.js 那套小得多:这里只要「ball.js 能跑起来 + rAF 数得出来」就够。
 * 故意不共用:那一套的桩是照着 hover.js 的需要长的(样式继承、elementFromPoint、
 * 计时器队列),这里一个都用不上,搬过来只会让人以为这一套也验那些东西。
 */
function makeEl(tag) {
    const listeners = {};
    const e = {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        className: "",
        style: {
            setProperty(k, v) { this[k] = v; },
            removeProperty(k) { delete this[k]; },
            getPropertyValue(k) { return this[k] || ""; },
        },
        children: [],
        parent: null,
        isConnected: true,
        classList: {
            _s: new Set(),
            add(...c) { c.forEach((x) => this._s.add(x)); },
            remove(...c) { c.forEach((x) => this._s.delete(x)); },
            contains(c) { return this._s.has(c); },
        },
        setAttribute() {},
        appendChild(c) { c.parent = this; this.children.push(c); return c; },
        remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); },
        // loading.js 的 scan() 会问一遍容器里有没有媒体。桩里没有媒体,报空就行
        querySelectorAll: () => [],
        matches: () => false,
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        removeEventListener(type, fn) {
            if (listeners[type]) listeners[type] = listeners[type].filter((f) => f !== fn);
        },
        fire(type, ev) { (listeners[type] || []).slice().forEach((f) => f(ev || {})); },
    };
    e.__listeners = listeners;
    return e;
}

function sandbox(opts) {
    const o = opts || {};
    let now = 0;
    const docListeners = {};
    const rafs = new Map();
    let rafSeq = 0;

    const documentElement = makeEl("html");
    const body = makeEl("body");
    const ball = makeEl("div");

    /*
     * 「交还发生在这些文件加载之前」这条路要真能模拟出来:loading.js / hover.js 是在
     * **模块顶层**读这个类的(不像 ball.js 那样等 init),所以类必须在它们跑起来之前
     * 就挂上 —— 事后再 add 是模拟不出这一条的,只能验出「读得太早」。
     */
    if (o.preOff) documentElement.classList.add("cursor-off");

    const doc = {
        body,
        documentElement,
        readyState: "complete",
        getElementById(id) {
            if (id === "latex-ball") return o.noBall ? null : ball;
            return null;
        },
        createElement: (t) => makeEl(t),
        createElementNS: (_ns, t) => makeEl(t),
        addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
        removeEventListener(type, fn) {
            if (docListeners[type]) docListeners[type] = docListeners[type].filter((f) => f !== fn);
        },
        fire(type, ev) { (docListeners[type] || []).slice().forEach((f) => f(ev || {})); },
        querySelectorAll: () => [],
    };

    /*
     * 这个桩的全部意义就在这一行:三个文件里读的是同一个写法,桩这里也必须只有
     * 一处定义 —— 要验的正是「三处读的是同一个开关」,桩要是每处给不同的答案,
     * 这个验法自己就废了。浏览器里 matchMedia 挂在 window 上,所以两处挂的是
     * 同一个函数引用。
     */
    const mq = () => ({ matches: !!o.reduce, addEventListener() {} });

    const winListeners = {};
    const win = {
        document: doc,
        performance: { now: () => now },
        requestAnimationFrame(fn) { const id = ++rafSeq; rafs.set(id, fn); return id; },
        cancelAnimationFrame(id) { rafs.delete(id); },
        /*
         * 第 3 节要往 window 上**派**事件(error / unhandledrejection),所以这里
         * 不能像原来那样写成空函数。第三个参数(capture)也收着:ball.js 是用
         * `addEventListener("error", …, true)` 挂的,桩把它吞掉的话,验出来的东西
         * 就跟真实浏览器不是一回事了。
         */
        addEventListener(type, fn, opts) {
            const capture = opts === true || !!(opts && opts.capture);
            (winListeners[type] = winListeners[type] || []).push({ fn, capture });
        },
        removeEventListener(type, fn) {
            if (winListeners[type]) winListeners[type] = winListeners[type].filter((r) => r.fn !== fn);
        },
        location: { hash: "" },
        matchMedia: mq,
    };

    const sb = {
        window: win,
        document: doc,
        performance: win.performance,
        requestAnimationFrame: win.requestAnimationFrame,
        cancelAnimationFrame: win.cancelAnimationFrame,
        setTimeout: (fn) => { fn(); return 0; },
        clearTimeout: () => {},
        matchMedia: mq,
        getComputedStyle: () => ({ getPropertyValue: () => "" }),
        console: { log: () => {}, error: () => {} },
    };
    sb.globalThis = sb;
    sb.self = sb;
    vm.createContext(sb);

    vm.runInContext(FX_SRC, sb, { filename: "cursor-fx.js" });
    vm.runInContext(BALL_SRC, sb, { filename: "ball.js" });
    /*
     * loading.js 只在第 3 节要用的那几个桩里跑。它是三个模块里唯一能塞进这个
     * 小桩的(只碰 document / matchMedia / 定时器,不碰 getComputedStyle 和
     * elementFromPoint),而第 3 节正需要它:**退场是跨模块的**,只验 ball.js
     * 自己那半边,验不到「另外两个模块有没有一起停」。
     * hover.js 塞不进来(它要的那套 DOM 是 test_hover.js 整桩的规模),那一半只能按源码核。
     */
    if (o.loading) vm.runInContext(fs.readFileSync(path.join(SITE, "loading.js"), "utf8"), sb, { filename: "loading.js" });

    /*
     * 走一帧。ball.js 每帧最后都会再排一帧,所以这里只从队列里取「这一轮已经排好的」
     * 那些,不许无限跟下去(跟下去就成死循环了,而 rAF 数要单独数)。
     */
    function frame(dt) {
        now += (dt === undefined ? 16.7 : dt);
        const due = Array.from(rafs.entries());
        rafs.clear();
        due.forEach(([, fn]) => fn(now));
    }

    return {
        win,
        doc,
        ball,
        root: documentElement,
        frame,
        rafCount: () => rafs.size,
        /*
         * 挂在 document 上的事件类型。第 2 节要断言「这套主题只监听指针事件」——
         * 它一旦开始监听键盘/焦点,就说明它跑进键盘导航那条路上去了。
         *
         * 只报**还挂着**监听的那些(数组非空):桩里事件名是一挂就留着的键,
         * 直接 Object.keys 的话,摘干净了也照样列出来 —— 第 3 节要验的正是「摘干净」,
         * 那么报法必须能表达「摘干净了」。
         */
        docEvents: () => Object.keys(docListeners).filter((t) => docListeners[t].length),
        init: () => win.initBallCursor(),
        // 球此刻的 transform 原文(ball.js 是直接赋值 style.transform 的)
        tf: () => String(ball.style.transform || ""),
        scaleOf: () => {
            const m = /scale\(([\d.]+)\)/.exec(String(ball.style.transform || ""));
            return m ? Number(m[1]) : null;
        },
        move: (x, y) => doc.fire("pointermove", { clientX: x, clientY: y }),
        down: (x, y) => doc.fire("pointerdown", { clientX: x, clientY: y }),
        up: () => doc.fire("pointerup", {}),
        leave: () => documentElement.fire("pointerleave", {}),
        // 往 window 上派事件(第 3 节的 error / unhandledrejection 走这条)
        fireWin: (type, ev) => (winListeners[type] || []).slice().forEach((r) => r.fn(ev || {})),
        winEvents: () => Object.keys(winListeners),
    };
}

// =====================================================================
section("0. 桩自己是对的");
{
    const a = sandbox({ reduce: true });
    const b = sandbox({ reduce: false });
    check("开关只由 matchMedia 决定,同一个桩给同一个答案",
        a.win.matchMedia("(prefers-reduced-motion: reduce)").matches === true
        && b.win.matchMedia("(prefers-reduced-motion: reduce)").matches === false);

    // 下面每一节都靠「指针一动、球就写了一次 transform」来读结果,所以这一条先站住:
    // 要是桩压根没接上球元素,后面全是假绿。
    const destroy = a.init();
    check("init 返回销毁函数", typeof destroy === "function");
    a.move(10, 10);
    const before = a.tf();
    check("桩接上了球:指针一动就写出了 transform", before.indexOf("translate3d(10px, 10px, 0)") >= 0, before);
    destroy();
    a.move(30, 30);
    check("销毁之后指针再动,球一动不动(监听真的摘掉了)", a.tf() === before, a.tf());

    check("页面里没有球元素时是空操作,不抛错",
        typeof sandbox({ reduce: false, noBall: true }).init() === "function");
}

// =====================================================================
section("1. 减弱动效:只保留位置跟随");
{
    /*
     * 承诺的原话是「只保留位置跟随,去掉形变」。所以这一节分两半验:
     *   去掉的那一半 —— 按下不再缩、一帧动画都不跑、样式表里的过渡收掉;
     *   保留的那一半 —— 指针一动,球还得在那。
     * 只验前一半的话,「什么都不做」也能过。
     */
    const sb = sandbox({ reduce: true });
    sb.init();

    check("球的按下缩放系数报成 0(接力的那一层也要跟着不缩)",
        sb.win.cursorState.pressScale === 0, `${sb.win.cursorState.pressScale}`);
    check("一条 rAF 都不排(没有任何一帧是被需要的)", sb.rafCount() === 0,
        `${sb.rafCount()} 条`);

    // 位置跟随还在,而且是直接在 pointermove 里写的(不靠那个已经停掉的循环)
    sb.move(120, 45);
    check("指针一动球就到位,不靠动画循环",
        sb.tf().indexOf("translate3d(120px, 45px, 0)") >= 0, sb.tf());
    check("位置到了,缩放是原尺寸", sb.scaleOf() === 1, sb.tf());

    // 按下:换样子(阴影那一下由各外观的 CSS 管),但**不许缩**
    sb.down(120, 45);
    sb.frame();
    sb.frame();
    check("按下时根上挂了 is-pressing(按下总得有点反馈,那是瞬时换样子)",
        sb.root.classList.contains("is-pressing"));
    check("按下不缩:跑了十帧还是 scale(1)", (() => {
        for (let i = 0; i < 10; i++) sb.frame();
        return sb.scaleOf() === 1;
    })(), sb.tf());
    check("按下也不起 rAF(没有任何东西要看时间)", sb.rafCount() === 0, `${sb.rafCount()} 条`);

    sb.up();
    check("松手就把 is-pressing 摘掉", !sb.root.classList.contains("is-pressing"));

    sb.leave();
    check("移出文档还是老一套:球淡出、类摘干净",
        sb.ball.style.opacity === "0"
        && !sb.root.classList.contains("has-pointer")
        && !sb.win.cursorState.visible);
}

section("1b. 对照:没有减弱动效时,那两半都还在");
{
    /*
     * 上一条要是「ball.js 根本没写按下缩放」也能全过。所以必须有这个对照:
     * 同一个桩、只把开关翻过来,缩放和 rAF 都得回来。
     */
    const sb = sandbox({ reduce: false });
    sb.init();

    check("按下缩放系数是 0.14", sb.win.cursorState.pressScale === 0.14);
    check("rAF 跑起来了", sb.rafCount() === 1, `${sb.rafCount()} 条`);

    sb.move(120, 45);
    sb.down(120, 45);
    let s = null;
    for (let i = 0; i < 40; i++) { sb.frame(); s = sb.scaleOf(); }
    check("按住一会儿球缩到 0.86 附近(1 − 1×0.14)", s !== null && Math.abs(s - 0.86) < 0.005, `scale=${s}`);

    sb.up();
    for (let i = 0; i < 40; i++) { sb.frame(); s = sb.scaleOf(); }
    check("松手又长回 1", s !== null && Math.abs(s - 1) < 0.005, `scale=${s}`);
}

section("1c. 接力的那一层用的是同一个系数");
{
    /*
     * 交接的那一帧 #latex-ball 和液体是同一颗球,缩放系数必须逐像素一致。
     * 这里验的是**0 这个值走得通**:createLayer 里曾经写成 `c.pressScale || 0.14`,
     * 于是减弱动效下球不缩、壳照缩 —— 两边各按各的,交接就抖一下。
     * 0 在这条通道上是个有意义的值,不是「没填」。
     */
    const sb = sandbox({ reduce: false });
    sb.init();
    const layer = sb.win.CursorFX.createLayer();

    sb.win.cursorState.press = 1;
    sb.win.cursorState.pressScale = 0.14;
    layer.place();
    check("系数 0.14 → 壳缩到 0.8600", layer.wrap.style.transform.indexOf("scale(0.8600)") >= 0,
        layer.wrap.style.transform);

    sb.win.cursorState.pressScale = 0;
    layer.place();
    check("系数 0(减弱动效)→ 壳不缩,不是偷偷回落到 0.14",
        layer.wrap.style.transform.indexOf("scale(1.0000)") >= 0, layer.wrap.style.transform);
}

section("1d. 样式表那一半:过渡收掉了,而且只有该收的收了");
{
    /*
     * JS 那一半管「形变」,CSS 这一半管「过渡」,是两件事 —— 所以得分两处验。
     * 断言写成从 CSS 原文里抠规则,而不是「包含某段字符串」:后者改个空格就假绿。
     */
    const mediaBlocks = [];
    const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g;
    let m;
    while ((m = re.exec(SKIN_CSS))) mediaBlocks.push(m[1]);
    check("skin-ui.css 里有减弱动效那条媒体查询", mediaBlocks.length === 1,
        `${mediaBlocks.length} 段`);

    const inside = mediaBlocks[0] || "";
    check("球在里面:管的是 #latex-ball", /#latex-ball/.test(inside));
    check("收的是 transition", /transition:\s*none/.test(inside));
    check("**不许碰 transform**(那是 ball.js 独占的,样式表一插进来两边就抢)",
        !/transform/.test(inside), inside.trim().split("\n")[0]);

    // 液体的过渡:全域的 .cfx,不是只覆盖展示页那一小块
    const fxBlocks = (FX_CSS.match(re) || []).length;
    const fxMedia = new RegExp(re.source).exec(FX_CSS);
    check("cursor-fx.css 里也有那条媒体查询", fxBlocks >= 1);
    check("液体的过渡是全域收的(不是只收展示页里的 .cx-stage .cfx)",
        !!fxMedia && /(^|\s)\.cfx\s*\{/.test(fxMedia[1]) && !/\.cx-stage\s*\.cfx/.test(fxMedia[1]));

    /*
     * 反向:不许把整个站点的过渡都收掉。这条不是洁癖 —— 减弱动效要收的是
     * 「会动的形状」(位移、缩放、淡入淡出),不是「所有 CSS 过渡」。
     * 顺手 `* { transition: none }` 是最省事的写法,也是把整站换肤弄坏的那一种。
     */
    check("没有顺手写成 `* { transition: none }`",
        !/\*\s*\{[^}]*transition:\s*none/.test(SKIN_CSS) && !/\*\s*\{[^}]*transition:\s*none/.test(FX_CSS));
}

// =====================================================================
section("2. 键盘导航:球不参与,焦点环独立可见");
{
    /*
     * 这一行以前的状态是「碰巧没坏」:全站没有一条 `outline: none`,球也确实不参与
     * —— 但两件事都没有人看着,谁哪天顺手写一句就没了。
     *
     * 现在拆成三段验,对应承诺里的三个词:
     *   「球不参与」     —— 它只监听指针事件,而且永远不会成为焦点目标
     *   「焦点环可见」   —— 全站没有任何一处把它按掉(这条最容易被动摇)
     *   「够得着」       —— 可点的东西得真在 Tab 顺序里,不然前两条都是空话
     * 第三段是补这一节的时候才发现的:`<a onclick>` 没有 href **不在 Tab 顺序里**,
     * 而全站唯一的导航当时就是那么写的 —— 键盘用户根本走不到别的页面。
     */
    const cssFiles = [
        "skin-ui.css", "cursor-fx.css", "style.css",
        "skins/latex/style.css", "skins/glass/style.css", "skins/soft/style.css",
    ];
    const srcFiles = [
        "index.html", "main.js", "ball.js", "hover.js", "loading.js", "cursor-fx.js",
        "cursor-fx.css", "skin.js", "latex.js",
        "pages/home.js", "pages/blog.js", "pages/portfolio.js", "pages/project.js",
        "pages/cursor.js", "pages/about.js",
        "skins/latex/latex.js", "skins/glass/glass.js", "skins/soft/soft.js",
    ].concat(cssFiles);
    const readAll = (list) => list.map((f) => [f, fs.readFileSync(path.join(SITE, f), "utf8")]);

    // ---- (一)球不参与 ----
    const sb = sandbox({ reduce: false });
    sb.init();
    check("球只监听指针事件,一点键盘/焦点的边都不沾",
        sb.docEvents().sort().join(",") === "pointercancel,pointerdown,pointermove,pointerup",
        sb.docEvents().join(","));
    check("没碰过指针 -> 不挂 has-pointer(只用键盘的人,系统光标一直是原版那个)",
        !sb.root.classList.contains("has-pointer"));
    check("球上的 aria-hidden=\"true\"(它是个纯装饰的空 div)",
        /<div id="latex-ball"[^>]*aria-hidden="true"/.test(
            fs.readFileSync(path.join(SITE, "index.html"), "utf8")));
    const ballBlock = /#latex-ball\s*\{[\s\S]*?\}/.exec(SKIN_CSS);
    check("#latex-ball 是 pointer-events: none(点不到、也当不成焦点目标)",
        !!ballBlock && /pointer-events:\s*none/.test(ballBlock[0]));

    // ---- (二)焦点环可见 ----
    /*
     * 扫的是「把焦点环按掉」的那几种写法,不是「出现过 outline 这个词」。
     * 以后谁正大光明地给某个控件加一条自定义焦点环,不应该被这一条拦住。
     */
    const KILLS = /outline\s*:\s*(none|0(px|rem|em)?\s*(none)?)\s*[;}]|outline\s*:\s*transparent|outline-width\s*:\s*0/;
    const kills = [];
    readAll(srcFiles).forEach(([f, src]) => {
        if (KILLS.test(src)) kills.push(f);
    });
    check("全站没有一处把焦点环按掉(outline: none / 0 / transparent)", kills.length === 0,
        kills.join(",") || "0 处");

    // ---- (三)够得着:可点的东西得在 Tab 顺序里 ----
    const navSrc = fs.readFileSync(path.join(SITE, "main.js"), "utf8");
    check("导航是带 href 的链接(没有 href 的 `<a>` 不在 Tab 顺序里)",
        /<a href="#\/\$\{n\.page\}"/.test(navSrc));
    check("作品集卡片也是带 href 的链接(以前是 `<div onclick>`,键盘点不进去)",
        /<a class="portfolio-item" href="#\/project\?id=\$\{p\.id\}"/.test(
            fs.readFileSync(path.join(SITE, "pages/portfolio.js"), "utf8")));
    /*
     * 当链接用是要付代价的:UA 样式表会给带 href 的链接加下划线。卡片里包着标题,
     * 所以要有一条把它补掉 —— 补在三个外观共用的那张表里,不是各写三遍。
     */
    const itemBlock = /\.portfolio-item\s*\{[\s\S]*?\}/.exec(SKIN_CSS);
    check("卡片补掉了链接的下划线(不然标题会带下划线,而且三个外观都要写)",
        !!itemBlock && /text-decoration:\s*none/.test(itemBlock[0]));

    /*
     * 通用那条:`onclick=` 只许长在**天生就能聚焦**的标签上,否则必须自带 tabindex。
     * 这一条是这次真正想留下的东西 —— 上面两条钉的是「此刻这两处是对的」,
     * 这一条钉的是「以后新加的也逃不掉」。
     */
    const NATIVE = ["a", "button", "input", "select", "textarea", "summary", "details", "label"];
    const offenders = [];
    let onclicks = 0;
    readAll(srcFiles.filter((f) => !f.endsWith(".css"))).forEach(([f, src]) => {
        const re = /<([a-zA-Z][\w-]*)([^<>]*\bonclick\s*=[^<>]*)>/g;
        let m;
        while ((m = re.exec(src))) {
            onclicks++;
            const tag = m[1].toLowerCase();
            const attrs = m[2];
            const focusable = NATIVE.indexOf(tag) >= 0 || /\btabindex\s*=/.test(attrs);
            // 天生聚焦的标签里,`<a>` 还得真带 href
            const linked = tag !== "a" || /\bhref\s*=/.test(attrs);
            if (!focusable || !linked) offenders.push(`${f}: <${tag}${attrs.slice(0, 40)}…>`);
        }
    });
    check("每一个 onclick 都长在天生可聚焦的标签上(或自带 tabindex)",
        offenders.length === 0, offenders.join(" / ") || `查了 ${onclicks} 处`);
    check("这一条不是空转:站上确实有 onclick 要查", onclicks > 0, `${onclicks} 处`);
}

// =====================================================================
section("3. 脚本失败:把系统光标还回去");
{
    /*
     * 这一行原来的状态是「加载失败那一半是安全的」:JS 根本没加载,就没人挂 has-pointer,
     * 系统光标一直好好的。危险的是另一半 —— 脚本**已经跑起来之后**才出错:那会儿
     * 系统光标早被 `cursor:none` 藏了,球又不再跟手,用户手里就什么都没有了。
     *
     * 承诺是「立刻恢复系统光标」,拆成四段验:
     *   a. 只认脚本错误 —— 图片 404 之类不算(不然网一慢光标主题就自己关了)
     *   b. 认出来就还干净 —— 类、球、共享状态、监听、循环,一样不留
     *   c. 还完不回头 —— 后来的指针事件一律无效,这套主题不再接手
     *   d. 两半都要在 —— JS 那一半(运行时)和 CSS 那一半(样式表里的顺序)
     * 另外还得验一件事:**这套东西自己出问题的时候,不能反手把还回去这件事也带崩**
     * (handBack 里那两个 try/catch)。
     */
    const HTML = fs.readFileSync(path.join(SITE, "index.html"), "utf8");

    // ---- (a) 只认脚本错误 ----
    {
        const sb = sandbox({ reduce: false });
        sb.init();
        sb.move(50, 60);
        check("前提:指针动过之后根上确实挂着 has-pointer(不然下面验的是空的)",
            sb.root.classList.contains("has-pointer"));

        /*
         * 资源加载失败:真实浏览器里它是挂在 <img> 上的 error 事件,没有 message。
         * 这不是假设 —— 站上缩略图缺失时的兜底就是内联 onerror,天天在用。
         */
        const img = makeEl("img");
        sb.fireWin("error", { target: img });
        check("图片挂了(资源错误,没有 message)不算脚本出错,主题不退场",
            !sb.root.classList.contains("cursor-off") && sb.win.BallWatch._debug().dead === false);

        // 反过来的那一半:有 message 但 target 不是 window,也不认(两道判据都要过)
        sb.fireWin("error", { message: "x", target: img });
        check("有 message 但 target 不是 window 的 error 也不认(资源错误可能长这样)",
            !sb.root.classList.contains("cursor-off"));

        check("前提:退场之前 window.cursorState 还在(下面要验它被收走)",
            !!sb.win.cursorState && sb.win.cursorState.visible === true);
    }

    // ---- (b) 认出来就还干净 ----
    {
        const sb = sandbox({ reduce: false });
        sb.init();
        sb.move(50, 60);
        sb.down(50, 60);
        // 先把「本该被摘掉的东西」全挂上,否则「摘干净了」这句是空转
        sb.root.classList.add("is-loading", "is-hover-state", "show-real-cursor");
        const before = sb.tf();
        check("前提:退场前五个类都在", ["has-pointer", "is-pressing", "is-loading", "is-hover-state", "show-real-cursor"]
            .every((c) => sb.root.classList.contains(c)));

        sb.fireWin("error", { message: "boom", target: sb.win });

        check("脚本错误 -> 根上挂出 cursor-off(CSS 那一半靠它)",
            sb.root.classList.contains("cursor-off"));
        const leftover = ["has-pointer", "is-pressing", "is-loading", "is-hover-state", "show-real-cursor"]
            .filter((c) => sb.root.classList.contains(c));
        check("藏光标那五个类全摘掉", leftover.length === 0, leftover.join(",") || "0 个");
        check("球藏起来(opacity 归 0)", sb.ball.style.opacity === "0", String(sb.ball.style.opacity));
        check("共享状态收走:cursorState 不再存在(没人会再去读一个错的坐标)",
            !("cursorState" in sb.win));
        check("动画循环停了", sb.rafCount() === 0, `${sb.rafCount()} 条`);
        check("监听全拆掉(退场之后一个 pointer 事件都不再收)",
            sb.docEvents().length === 0, sb.docEvents().join(",") || "0 个");
        check("报得出为什么退的场", sb.win.BallWatch._debug().reason === "error",
            sb.win.BallWatch._debug().reason);
        check("前提:退场前球是跟手的(不然上面那条「球藏起来」证明不了什么)",
            before.indexOf("translate3d(50px, 60px, 0)") >= 0, before);
    }

    // ---- (c) 还完不回头 ----
    {
        const sb = sandbox({ reduce: false });
        sb.init();
        sb.move(50, 60);
        sb.fireWin("error", { message: "boom", target: sb.win });
        const frozen = sb.tf();

        sb.move(300, 400);
        sb.down(300, 400);
        sb.frame();
        sb.frame();
        check("退场之后指针再动,球一动不动(不会「回来一半」)",
            sb.tf() === frozen, `${frozen} -> ${sb.tf()}`);
        check("退场之后的按下也不会把类加回来",
            !sb.root.classList.contains("has-pointer") && !sb.root.classList.contains("is-pressing"));
        check("球一直是藏的,不会闪回来", sb.ball.style.opacity === "0");

        // 第二次叫停是空操作 —— 退场只该发生一次
        check("已经退场过,再叫一次 handBack() 报 false(不重复做事)",
            sb.win.BallWatch.handBack() === false);
        check("宿主自己叫也不会把 cursor-off 弄丢(它是唯一那条保险)",
            sb.root.classList.contains("cursor-off"));
    }

    // ---- (c2) 别的模块报错 / 根本不在,都不影响退场 ----
    {
        const sb = sandbox({ reduce: false });
        sb.init();
        sb.move(50, 60);
        /*
         * 另两个模块的 handBack 故意写成会抛错。ball.js 里那两个 try/catch 就是为这个:
         * 退场是**最后一道**动作,要是被别人的异常打断在半路,类摘了一半、球还挂着,
         * 用户看到的是比不退场更糟的样子。
         */
        sb.win.LoadingWatch = { handBack() { throw new Error("loading 坏在里面"); } };
        sb.win.HoverWatch = { handBack() { throw new Error("hover 坏在里面"); } };
        sb.fireWin("error", { message: "boom", target: sb.win });
        check("另两个模块的 handBack 抛错,退场照样走完",
            sb.root.classList.contains("cursor-off")
            && !sb.root.classList.contains("has-pointer")
            && sb.ball.style.opacity === "0");
        check("重复卸载不会连锁报错(再叫一次还是干净的 false)",
            sb.win.BallWatch.handBack() === false);

        // 另一种常见情况:那两个模块压根没加载(脚本 404)。退场也不该抛错
        const sb2 = sandbox({ reduce: false });
        sb2.init();
        sb2.move(10, 10);
        check("两个模块都不存在时,handBack 照常工作(不抛错、返回 true)",
            sb2.win.BallWatch.handBack("host") === true
            && sb2.root.classList.contains("cursor-off")
            && sb2.win.BallWatch._debug().reason === "host");
    }

    // ---- (d) 没被叫到也不接手:根上已经挂着 cursor-off ----
    {
        const sb = sandbox({ reduce: false });
        sb.root.classList.add("cursor-off");   // 「交还发生在这个文件加载之前」
        sb.init();
        sb.move(50, 60);
        check("初始化时根上已有 cursor-off -> 不接手(dead 从类里读出来)",
            sb.win.BallWatch._debug().dead === true
            && sb.win.BallWatch._debug().reason === "before-init");
        check("不接手就是真的不动:不写 transform、不挂类、不排帧",
            sb.tf() === "" && !sb.root.classList.contains("has-pointer") && sb.rafCount() === 0,
            sb.tf() || "(空)");
    }

    // ---- (d2) 退场是跨模块的:loading.js 也得跟着停手 ----
    {
        /*
         * 这一段是这一节里唯一真的把两个模块连起来跑的地方。前面那些验的都是
         * 「ball.js 自己还干净了」,可用户看到的是**整台主题** —— 加载态那个图层
         * 要是还在自己转,球藏了、系统光标回来了,指针旁边照样挂着一坨液体。
         */
        const sb = sandbox({ reduce: false, loading: true });
        sb.init();
        sb.move(20, 30);
        check("loading.js 起来了,而且还没退场", !!sb.win.LoadingWatch
            && sb.win.LoadingWatch._debug().dead === false);
        check("loading.js 报得出自己的状态机(它确实跑到了,不是空壳)",
            typeof sb.win.LoadingWatch._debug().state === "string",
            sb.win.LoadingWatch._debug().state);

        sb.fireWin("error", { message: "boom", target: sb.win });
        check("ball.js 退场时把 loading.js 也叫停了(dead 传过去)",
            sb.win.LoadingWatch._debug().dead === true);
        check("loading.js 的循环停了", sb.rafCount() === 0, `${sb.rafCount()} 条`);
        check("loading.js 不会再接手:退场后 handBack() 报 false",
            sb.win.LoadingWatch.handBack() === false);

        /*
         * 反方向:交还发生在**这两个文件加载之前**(根上先挂着 cursor-off),
         * 那它们谁都不该接手。走的是另外两个文件,和 ball.js 那边同一个道理。
         */
        const sb2 = sandbox({ reduce: false, loading: true, preOff: true });
        sb2.init();
        check("根上先有 cursor-off 时,后来的 loading.js 自己就不接手",
            sb2.win.LoadingWatch._debug().dead === true);
        check("同一个桩里 ball.js 也不接手(它读的也是同一个类)",
            sb2.win.BallWatch._debug().dead === true
            && sb2.win.BallWatch._debug().reason === "before-init");
        check("不接手时一条帧都不排,一个监听都不挂",
            sb2.rafCount() === 0 && sb2.docEvents().length === 0,
            `${sb2.rafCount()} 条 / ${sb2.docEvents().length} 个监听`);
    }

    // ---- (d3) hover.js 那一半:桩里跑不动,但出口按源码核 ----
    {
        const hv = fs.readFileSync(path.join(SITE, "hover.js"), "utf8");
        const ld = fs.readFileSync(path.join(SITE, "loading.js"), "utf8");
        // 出口上得有这个名字,否则 ball.js 那个 try/catch 就只是在掩盖「没人停手」
        check("HoverWatch 出口上有 handBack", /window\.HoverWatch\s*=\s*\{[\s\S]*?\bhandBack\b/.test(hv));
        check("LoadingWatch 出口上有 handBack", /window\.LoadingWatch\s*=\s*\{[\s\S]*?\bhandBack\b/.test(ld));
        check("两个模块都从根上的 cursor-off 开局(来晚了就别接手)",
            /classList\.contains\("cursor-off"\)/.test(hv) && /classList\.contains\("cursor-off"\)/.test(ld));
        // ball.js 那两处必须包在 try/catch 里 —— 交还自己不能因为别人坏了而半路停
        check("ball.js 是在 try/catch 里叫的这两个模块(它俩坏了也得退场)",
            (BALL_SRC.match(/try\s*\{\s*if \(window\.(LoadingWatch|HoverWatch)[\s\S]{0,120}?catch/g) || []).length === 2);
    }

    // ---- (e) 承诺里另外那半:JS 根本没加载时是安全的 ----
    {
        /*
         * 「脚本未加载」这条路的安全性不靠代码,靠的是**没有人先动手**:
         * 藏光标的类只由 JS 往根上加,标记里一个都不写死。所以 JS 全挂掉时,
         * 页面就是普通页面,系统光标原样还在。
         * 这一条钉的是「这条性质没有被写死到标记里」—— 它一旦被写死,
         * 「没加载」就从安全变成最危险(藏了光标又没人画球)。
         */
        check("index.html 的标记里没有写死 has-pointer / cursor-off",
            !/has-pointer|cursor-off/.test(HTML));
        check("index.html 里确实没有球以外的东西在藏光标(三条 cursor:none 都只在样式表里)",
            (HTML.match(/cursor\s*:\s*none/g) || []).length === 0);

        /*
         * 往根上加这两个类的**只有 ball.js**。这一条不是洁癖:多一个地方会加 has-pointer,
         * 就意味着「摘掉它」这件事要多一个地方记得做,而 CSS 那条保险只认 cursor-off。
         * 它要是亮了,说明该去核对一遍新加的那处有没有跟着退场的路径。
         */
        const liveScripts = (HTML.match(/<script[^>]*\ssrc="([^"?]+)/g) || [])
            .map((t) => (/src="([^"?]+)/.exec(t) || [])[1])
            .filter((f) => f && fs.existsSync(path.join(SITE, f)));
        const adders = liveScripts.filter((f) => /classList\.add\([^)]*"has-pointer"/.test(
            fs.readFileSync(path.join(SITE, f), "utf8")));
        check("站上往根上加 has-pointer 的只有 ball.js 一处", adders.length === 1 && adders[0] === "ball.js",
            adders.join(",") || "0 处");
        check("这条不是空转:确实读到 index.html 里那一串脚本",
            liveScripts.length >= 10, `${liveScripts.length} 个`);

        // 认的是**加**这个类,不是提到它 —— hover.js / loading.js 里也写了 "cursor-off",
        // 但那是开局读一眼「我是不是来晚了」(contains),不是去点亮保险
        const offAdders = liveScripts.filter((f) => /classList\.add\([^)]*"cursor-off"/.test(
            fs.readFileSync(path.join(SITE, f), "utf8")));
        check("点亮 cursor-off 的也只有 ball.js(CSS 那条保险只有一处会动它)",
            offAdders.length === 1 && offAdders[0] === "ball.js", offAdders.join(",") || "0 处");
        const offSeers = liveScripts.filter((f) => /classList\.contains\("cursor-off"\)/.test(
            fs.readFileSync(path.join(SITE, f), "utf8")));
        check("另外两个模块确实在开局看这个类(交还发生在它们加载之前时也得认)",
            offSeers.length === 3, offSeers.join(",") || "0 处");
    }

    // ---- (f) CSS 那一半:在,而且排在所有藏光标的规则后面 ----
    {
        /*
         * 这一条验的是**顺序**,不是「有没有写」。CSS 里同特异性的规则靠书写顺序决胜,
         * 所以把这段挪到文件前面,样子完全一样、效果完全相反,而且不会报错 ——
         * 正是那种只有靠断言才拦得住的改动。
         */
        const beltRe = /html\.cursor-off\s*,\s*html\.cursor-off\s*\*?\s*\{[^}]*\}/;
        const belt = beltRe.exec(SKIN_CSS);
        check("skin-ui.css 里有那条保险(html.cursor-off … 交还后每个元素退回自己的光标)",
            !!belt && /cursor:\s*auto\s*!important/.test(belt[0]), belt ? belt[0].replace(/\s+/g, " ") : "没找到");

        const hideRe = /html\.has-pointer\s*,\s*html\.has-pointer\s*\*\s*\{[^}]*cursor:\s*none[^}]*\}/;
        const hide = hideRe.exec(SKIN_CSS);
        check("前提:同文件里那条藏光标的规则也在(不然顺序无从谈起)", !!hide);
        check("保险排在藏光标那条**后面**(同特异性,顺序就是胜负)",
            !!belt && !!hide && belt.index > hide.index,
            belt && hide ? `藏光标@${hide.index} 保险@${belt.index}` : "");

        /*
         * 别的样式表里也各有一份藏光标的规则(skin-ui.css 不是唯一一处)。
         * 它们要是排在后面,这条保险就压不住 —— 所以按 index.html 里真实的加载顺序核一遍,
         * 而不是只看文件内容。
         */
        const linkOrder = (HTML.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"?]+)/g) || [])
            .map((t) => (/href="([^"?]+)/.exec(t) || [])[1])
            .filter(Boolean);
        const uiAt = linkOrder.indexOf("skin-ui.css");
        check("前提:skin-ui.css 确实在 index.html 里被引到", uiAt >= 0, `第 ${uiAt} 个`);
        const hiders = linkOrder.filter((f) => f !== "skin-ui.css"
            && fs.existsSync(path.join(SITE, f))
            && /html\.has-pointer[^{]*\{[^}]*cursor:\s*none/.test(fs.readFileSync(path.join(SITE, f), "utf8")));
        const after = hiders.filter((f) => linkOrder.indexOf(f) > uiAt);
        check("带藏光标规则的样式表都排在 skin-ui.css 之前(跨文件也是这条保险赢)",
            after.length === 0, after.join(",") || `${hiders.length} 张都在前面`);
        check("这条不是空转:确实有别的样式表也藏着光标", hiders.length > 0, hiders.join(","));
        /*
         * 比上面那条更宽的一条:**排在 skin-ui.css 之后的样式表里不许有任何 `cursor: none`**,
         * 不管它长什么样。上面那条按 `html.has-pointer` 这个形状找,以后有人把藏光标的
         * 规则换个写法(比如挂到 `body.has-pointer` 上),它就找不到了 —— 而那份规则照样
         * 排在后面、照样压过保险。所以这里问的是结果(有没有 `cursor: none`),不是形状。
         */
        const lateHide = linkOrder.slice(uiAt + 1).filter((f) => fs.existsSync(path.join(SITE, f))
            && /cursor\s*:\s*none/.test(fs.readFileSync(path.join(SITE, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));
        check("排在 skin-ui.css 之后的样式表里没有 `cursor: none`(有的话它就压过保险)",
            lateHide.length === 0, lateHide.join(",") || `skin-ui.css 之后还有 ${linkOrder.length - uiAt - 1} 张`);

        check("保险只有一条(全站只有 skin-ui.css 里这一处 cursor-off 规则)",
            (fs.readFileSync(path.join(SITE, "skin-ui.css"), "utf8").match(/html\.cursor-off/g) || []).length === 2,
            "html.cursor-off ×2(选择器写了两个)");

        /*
         * preview.html 是把三张样式表**拼成一整块**再内联的(顺序和 index.html 一致),
         * 而拼起来之后谁在谁后面就只剩这一处顺序说了算。它是交付给用户双击打开的那份,
         * 来源和主站不同,所以单独核一遍:保险必须排在**每一处** `cursor: none` 之后。
         */
        const prevPath = path.join(SITE, "preview.html");
        if (fs.existsSync(prevPath)) {
            const prev = fs.readFileSync(prevPath, "utf8");
            // 只在 <style> 里找:脚本里也会提到这串字(hover.js 的文件头就写着
            // 「skin-ui.css 里那条 html.has-pointer * { cursor: none !important }」),
            // 不限定范围的话,那句注释会被当成一条规则,位置还排在后面
            const cssText = (prev.match(/<style[^>]*>[\s\S]*?<\/style>/g) || [])
                .map((s) => s.replace(/^<style[^>]*>/, "").replace(/<\/style>$/, "")).join("\n");
            const beltAt = cssText.indexOf("html.cursor-off");
            const lastHide = cssText.lastIndexOf("cursor: none");
            check("preview.html(拼成一整块的那份)里,保险排在最后一处 `cursor: none` 之后",
                beltAt > 0 && beltAt > lastHide,
                beltAt < 0 ? "preview.html 里没有保险" : `藏光标@${lastHide} 保险@${beltAt}`);
            check("这条不是空转:preview.html 的 CSS 里确实有藏光标的规则",
                lastHide > 0, `最后一处 @${lastHide}`);
        }
    }
}

// =====================================================================
console.log(`\n${bad === 0 ? "全部通过" : bad + " 项失败"}  (${total} 项)`);
process.exit(bad === 0 ? 0 : 1);
