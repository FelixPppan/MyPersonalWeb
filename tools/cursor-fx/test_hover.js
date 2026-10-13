/*
 * 驱动元素状态（hover.js）。
 *
 * 这里验的是「看图看不出来、但错了就很难受」的那些东西:
 *   - --cursor 这条意图通道到底解出了什么(尤其是本站把 cursor 全压成 none 之后,
 *     回落那条路还走不走得通)
 *   - 清单上没做的值(crosshair / help / zoom)绝不能认领
 *   - 满状态必须真的是引擎的输出,不能是这边另画一份
 *   - 可点击的中心要实、不可点击的中心要空、文本是「两颗球 + 中间一丝」、三者面积都守恒
 *   - 认领表自己说的状态和它画的形状必须是一件东西(加第三个状态时真踩过的坑)
 *   - 退出时球什么时候放开(#latex-ball 带着 120ms 的淡入,放早了看得见)
 *   - 从可点击移到不可点击要**先收拢再换形**,而且换形途中球不能松手
 *   - 加载态插队时这边要先收成一个球让位,收完再让加载态亮相
 *   - 半路改主意不许跳一下
 *   - 拖动缩放那一族:14 个值各自在哪个角度上、同一根线转到各个角度都逐球相等
 *     (最强的那个等式,见第 12 节)、按住不放、同一角度换值不重画而换角度要重画
 *   - 宿主入口 setResize():定义是「开着的时候指针底下是什么都不看」,以及它和
 *     「手里按着」互不清算
 *   - 画不出来的标准光标要把原版鼠标让回来,而且球留着(用户定的规矩,第 13 节)
 *   - prefers-reduced-motion 下根本不进这个状态、也不让位
 *
 * 沙盒里同时装 cursor-fx.js + loading.js + hover.js:让位那一条必须对着真的加载态验,
 * 用一个假 busy() 糊过去就等于没验。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SITE = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../..");
/*
 * 要出第 14 节那趟交接的对照图时才留帧:
 *     HANDOFF_DUMP=/tmp/handoff.json node test_hover.js
 * 留下的就是**沙盒里真实画到的那几帧**(不另算缓动),render_handoff.py 拿去画。
 */
const HANDOFF_DUMP = process.env.HANDOFF_DUMP || "";
const FX_SRC = fs.readFileSync(path.join(SITE, "cursor-fx.js"), "utf8");
const LOADING_SRC = fs.readFileSync(path.join(SITE, "loading.js"), "utf8");
const HOVER_SRC = fs.readFileSync(path.join(SITE, "hover.js"), "utf8");

let bad = 0;
let total = 0;
function check(name, cond, detail) {
    total++;
    if (!cond) bad++;
    console.log(`  ${cond ? "✓" : "!!"} ${name}${detail ? "  — " + detail : ""}`);
}
function section(title) { console.log(`\n=== ${title} ===`); }
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 1e-6 : eps);
const fmt = (v, n) => Number(v).toFixed(n === undefined ? 2 : n);

// ---------- DOM 桩 ----------

function makeEl(tag) {
    const listeners = {};
    const e = {
        nodeType: 1,                    // hover.js 用它挡掉非元素(比如文本节点)
        tagName: String(tag).toUpperCase(),
        className: "",
        // hover.js 让位的时候往 documentElement 上写 --real-cursor,所以这套桩
        // 得有个最小的 style:能 setProperty / getPropertyValue 就行。
        // 别的写法(style.transform = …)照样直接赋值,不受影响
        style: {
            setProperty(k, v) { this[k] = v; },
            removeProperty(k) { delete this[k]; },
            getPropertyValue(k) { return this[k] || ""; },
        },
        children: [],
        parent: null,
        isConnected: true,
        dataset: {},
        _attr: {},
        __css: null,                    // 这个元素**自己**声明了哪些属性(继承在 getComputedStyle 里做)
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
        setAttribute(k, v) { this._attr[k] = v; },
        getAttribute(k) { return this._attr[k]; },
        appendChild(c) { c.parent = this; this.children.push(c); return c; },
        remove() {
            this.isConnected = false;
            if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
        },
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        removeEventListener(type, fn) {
            if (listeners[type]) listeners[type] = listeners[type].filter((f) => f !== fn);
        },
        fire(type, ev) { (listeners[type] || []).slice().forEach((f) => f(ev || {})); },
        querySelectorAll(sel) { return descendants(this).filter((x) => x.isConnected && matches(sel, x)); },
    };
    return e;
}

function descendants(root) {
    const out = [];
    const walk = (n) => { for (const c of n.children) { out.push(c); walk(c); } };
    walk(root);
    return out;
}

function matches(sel, el) {
    return sel.split(",").map((s) => s.trim().toUpperCase()).indexOf(el.tagName) >= 0;
}

/*
 * 样式解析的模型:自定义属性和 cursor 都是**继承**属性,所以一层层往上找,
 * 谁都声明过就用谁的。没找到时 --cursor 是 auto、cursor 是 UA 默认的 default。
 * 站点那条 `html.has-pointer * { cursor: none !important }` 就是把 documentElement
 * 声明成 cursor:none,让全页继承到 —— 模型里照这么写。
 */
function declOf(el, prop) {
    let n = el;
    while (n) {
        if (n.__css && Object.prototype.hasOwnProperty.call(n.__css, prop)) return n.__css[prop];
        n = n.parent;
    }
    return null;
}

function sandbox(opts) {
    const o = opts || {};
    let now = 0;
    let timerSeq = 0;
    const timers = new Map();
    let rafSeq = 0;
    const rafs = new Map();

    const body = makeEl("body");
    const content = makeEl("div");
    const documentElement = makeEl("html");
    const docListeners = {};
    let filterMade = false;
    let hitEl = null;

    body.appendChild(content);

    const doc = {
        body,
        documentElement,
        readyState: "loading",
        getElementById(id) {
            if (id === "content") return content;
            if (id === "cfx-goo") return filterMade ? { __goo: true } : null;
            return null;
        },
        createElement: (t) => makeEl(t),
        createElementNS(_ns, t) {
            if (t === "filter") filterMade = true;
            return makeEl(t);
        },
        addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
        removeEventListener() {},
        elementFromPoint: () => hitEl,
        querySelectorAll(sel) { return descendants(body).filter((x) => x.isConnected && matches(sel, x)); },
    };

    function timer(fn, ms) {
        const id = ++timerSeq;
        timers.set(id, { at: now + (ms || 0), fn });
        return id;
    }

    const win = {
        document: doc,
        performance: { now: () => now },
        requestAnimationFrame(fn) { const id = ++rafSeq; rafs.set(id, fn); return id; },
        cancelAnimationFrame(id) { rafs.delete(id); },
        addEventListener() {},
        removeEventListener() {},
        location: { hash: "" },
        cursorState: { x: 400, y: 300, press: 0, targetPress: 0, visible: true, pressScale: 0.14 },
    };

    const sb = {
        window: win,
        document: doc,
        performance: win.performance,
        requestAnimationFrame: win.requestAnimationFrame,
        cancelAnimationFrame: win.cancelAnimationFrame,
        setTimeout: timer,
        clearTimeout: (id) => timers.delete(id),
        matchMedia: () => ({ matches: !!o.reduce, addEventListener() {} }),
        getComputedStyle: (el) => ({
            getPropertyValue: (k) => {
                const v = declOf(el, k);
                return v == null ? "" : v;
            },
            get cursor() {
                const v = declOf(el, "cursor");
                return v == null ? "default" : v;
            },
        }),
        console: { log: () => {}, error: () => {} },
    };
    sb.globalThis = sb;
    sb.self = sb;
    vm.createContext(sb);

    vm.runInContext(FX_SRC, sb, { filename: "cursor-fx.js" });
    vm.runInContext(LOADING_SRC, sb, { filename: "loading.js" });
    vm.runInContext(HOVER_SRC, sb, { filename: "hover.js" });

    // 本站:藏掉系统光标(所有元素继承到 cursor:none)
    documentElement.__css = { cursor: "none" };

    // ---------- 驱动 ----------
    const STEP = 1000 / 60;

    function drainTimers() {
        for (;;) {
            let dueId = null;
            let dueAt = Infinity;
            for (const [id, t] of timers) {
                if (t.at <= now && t.at < dueAt) { dueAt = t.at; dueId = id; }
            }
            if (dueId === null) return;
            const t = timers.get(dueId);
            timers.delete(dueId);
            t.fn();
        }
    }

    function step() {
        now += STEP;
        drainTimers();
        const q = Array.from(rafs.values());
        rafs.clear();
        for (const fn of q) fn(now);
    }

    function advance(ms) {
        const end = now + ms;
        while (now < end - 1e-9) step();
        return now;
    }

    function wraps() {
        return descendants(body).filter((e) => e.className === "cfx-fixed");
    }

    /*
     * 第 idx 层壳里当前挂着的球(读的是 DOM 里真实的 transform 字符串)。
     *
     * 亮/灭要一起读回来:引擎关掉一颗球时只把 opacity 写成 0,**不**动它的 transform,
     * 那颗球的坐标于是留在原地。光看缩放的话,一颗早就该消失的水滴会变成一个
     * 停在原处的幽灵,量出来的形状根本不是画出来的那个。
     */
    function frames(idx) {
        const w = wraps()[idx === undefined ? 0 : idx];
        if (!w || !w.children[0] || !w.children[0].children[1]) return null;
        return w.children[0].children[1].children.map((b) => {
            const on = b.style.opacity !== "0";
            const t = b.style.transform || "";
            const m = t.match(/translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\) scale\(([\d.]+)\)/);
            return m ? { x: +m[1], y: +m[2], s: +m[3], on } : { x: NaN, y: NaN, s: NaN, on };
        });
    }

    function hover(el) {
        (docListeners.pointerover || []).slice().forEach((fn) => fn({ target: el }));
    }
    function unhover(from) {
        (docListeners.pointerout || []).slice().forEach((fn) => fn({ target: from, relatedTarget: null }));
    }
    function down(el) {
        (docListeners.pointerdown || []).slice().forEach((fn) => fn({ target: el }));
    }
    function up(el) {
        (docListeners.pointerup || []).slice().forEach((fn) => fn({ target: el }));
    }
    function cancel() {
        (docListeners.pointercancel || []).slice().forEach((fn) => fn({ target: null }));
    }

    return {
        win, doc, body, content, documentElement,
        advance, step, wraps, frames, hover, unhover, down, up, cancel,
        setHit: (el) => { hitEl = el; },
        refresh: () => win.HoverWatch.refresh(),
        leaveDoc: () => documentElement.fire("pointerleave"),
        setPress: (v) => { win.cursorState.press = v; },
        noPointer: () => { win.cursorState.visible = false; },
        now: () => now,
        D: () => win.HoverWatch._debug(),
        state: () => win.HoverWatch._debug().state,
        q: () => win.HoverWatch._debug().q,
        ballHidden: () => documentElement.classList.contains("is-hover-state"),
        rafCount: () => rafs.size,
        FX: () => win.CursorFX,
        loadingState: () => win.LoadingWatch._debug().state,
        addMedia: (tag) => {
            const e = makeEl(tag);
            if (tag === "img") e.complete = false;
            content.appendChild(e);
            return e;
        },
        scan: () => win.LoadingWatch.scan(),
        // 站上真的能点的元素:button / a[href] / 带标记的块
        btn(decl) {
            const e = makeEl("button");
            e.__css = decl || { "--cursor": "pointer" };
            body.appendChild(e);
            return e;
        },
        block(decl) {
            const e = makeEl("div");
            e.__css = decl || {};
            body.appendChild(e);
            return e;
        },
    };
}

// 屏幕上真正画得出来的球:引擎关掉的(on=false)和缩到 0 的都等于没画
const visible = (fr) => (fr || []).filter((b) => b.on !== false && b.s > 0.01);

/*
 * 引擎的采样输出 → 帧。
 *
 * 两边的字段名不一样,而且**差在一个字母上**:引擎的圆写的是 scale(相对 R0 的
 * 倍数),从 DOM 读回来的帧写的是 s。上面那些量形状的帮手一律按 s 读,直接拿
 * 引擎的输出喂进去不会报错 —— 每一颗的 s 都是 undefined,于是 visible() 把**整帧**
 * 滤没了,量出来是 0。所以引擎那一路要先过这里。
 */
const asFrame = (bs) => (bs || []).map((b) => ({ x: b.x, y: b.y, s: b.scale, on: true }));

// 一帧里最外沿伸到多远(相对指针原点)
function reach(fr, R0) {
    return Math.max(...visible(fr).map((b) => Math.hypot(b.x, b.y) + R0 * b.s));
}

// 中心到最近材料边界的距离:正数 = 中心空着,负数 = 中心被盖住
function cover(fr, R0) {
    return Math.min(...visible(fr).map((b) => Math.hypot(b.x, b.y) - R0 * b.s));
}

/*
 * 外接矩形,单位 px。
 *
 * reach 量的是「最远那个点离中心多远」,对付一圈一圈的形状够用,但它分不出竖线和
 * 横线:两条线的 reach 完全一样。要分开量两个方向的,都得用这个。
 *
 * 它回答不了的两句话分别是别人的活:一条线转到某个角度 → lineAxes(转回线自己的
 * 坐标系再量);「两头粗、中间细」这种**沿着轴走一遍**的剖面 → axisWidths
 * (外接矩形只知道最长那一行和最短那一列,腰鼓和同高同宽的直棒它分不出来)。
 */
function bbox(fr, R0) {
    const v = visible(fr);
    if (!v.length) return [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    return [
        { x: Math.min(...v.map((b) => b.x - R0 * b.s)), y: Math.min(...v.map((b) => b.y - R0 * b.s)) },
        { x: Math.max(...v.map((b) => b.x + R0 * b.s)), y: Math.max(...v.map((b) => b.y + R0 * b.s)) },
    ];
}

/*
 * 面积加权的重心(px,相对指针原点)。屏幕 y 朝下,所以 y 为正 = 比指针低。
 *
 * 「掉下去化开」里的「掉下去」没法用外接框验:一摊对称的东西摊在原点四周,框一样
 * 是宽的、一样掉在下边 —— 重心才分得出「摊在指针那儿」和「摊在指针下面」。
 *
 * 权重用 r²(每团自己的面积)而不是球数:中间那团比外缘大一圈,按球数平摊会被
 * 七颗小的把重心往上拖,量出来的位置比真正画出来的高一大截。
 *
 * 不带 R0 参数:算的是球心位置的平均,乘不乘 R0 会约掉(权重里的 s² 同理)。
 */
function centroid(fr) {
    const v = visible(fr);
    if (!v.length) return { x: 0, y: 0 };
    let wx = 0, wy = 0, w = 0;
    for (const b of v) {
        const a = b.s * b.s;
        wx += b.x * a; wy += b.y * a; w += a;
    }
    return { x: wx / w, y: wy / w };
}

/*
 * 竖直方向相邻两团之间最大的缝(正数 = 断开)。
 *
 * 一条线(以及文本那一格)是一整笔,不是一串珠子:相邻两团必须**重叠**,缝得是负的。间距一旦大过半径,
 * 两团就只在一线相切甚至分开,轮廓会串成糖葫芦 —— 而 goo 只会把相切的那一点糊圆,
 * 糊不出一条连续的线来。这条判据量的就是这个。
 */
function maxNeighborGap(fr, R0) {
    const v = visible(fr).slice().sort((a, b) => a.y - b.y);
    let worst = -1e9;
    for (let i = 1; i < v.length; i++) {
        worst = Math.max(worst, (v[i].y - R0 * v[i].s) - (v[i - 1].y + R0 * v[i - 1].s));
    }
    return worst;
}

/*
 * 把一帧里所有球**转回线自己的坐标系**再量长短边和缝 —— 「拖动缩放」那一族必须
 * 这么量,不能量轴对齐的宽高。
 *
 * 45° 的线用轴对齐的框量出来近似正方形(29.5 长的斜线量成 27x27,和 26px 的球
 * 几乎一样大),于是「长 ≫ 短」这句判据在 45° 那格会变成「两条边差不多」——
 * 方向错得再离谱也量不出来。转回自己的坐标系之后,四个角度量的是同一组数,
 * 阈值一个字都不用改。
 *
 * deg 是引擎报出来的屏幕角度(0° = +x 轴,顺时针为正,因为屏幕 y 朝下)。
 * 转到线的坐标系就是反向转 deg。
 */
function lineAxes(fr, R0, deg) {
    const a = -deg * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const p = visible(fr).map((b) => {
        const u = b.x * ca - b.y * sa;      // 沿线方向
        const v = b.x * sa + b.y * ca;      // 垂直于线
        return { u, v, r: R0 * b.s };
    });
    if (!p.length) return { long: 0, short: 0, gap: -1e9 };
    const long = Math.max(...p.map((b) => b.u + b.r)) - Math.min(...p.map((b) => b.u - b.r));
    const short = Math.max(...p.map((b) => b.v + b.r)) - Math.min(...p.map((b) => b.v - b.r));
    // 相邻两团沿**线自己**的方向必须重叠(连成一笔,不是一串珠子)
    const s = p.slice().sort((x, y) => x.u - y.u);
    let gap = -1e9;
    for (let i = 1; i < s.length; i++) gap = Math.max(gap, (s[i].u - s[i].r) - (s[i - 1].u + s[i - 1].r));
    return { long, short, gap };
}

/*
 * 沿轴取宽度剖面:在帧的上下范围内均匀取 n 个位置,每个位置量「那一行的液体有多宽」。
 *
 * 为什么光有外接矩形不够:「两头粗、中间细」这句话它一个字也说不出 —— 一枚腰鼓和
 * 一根同高同宽的直棒,外接矩形一模一样。要分出来只能**沿着轴走一遍**看每一行的宽度。
 * (文本那一格就是靠它验的:2026-09-18 用户的口径是「两个小球,中间有些距离,中间有
 * 液体藕断丝连」——「粗细剖面」正是这句话唯一能量出来的形式。)
 *
 * 取 max 而不是求和:这一族的圆都绕着轴铺开(每团横向偏移最多零点几像素),
 * 所以一行的并集宽度就是最宽那一团撑起来的。
 */
function axisWidths(fr, R0, n) {
    const v = visible(fr);
    if (!v.length) return [];
    const lo = Math.min(...v.map((b) => b.y - R0 * b.s));
    const hi = Math.max(...v.map((b) => b.y + R0 * b.s));
    const out = [];
    for (let j = 0; j < n; j++) {
        const y = lo + (hi - lo) * (j + 0.5) / n;
        let half = 0;
        for (const b of v) {
            const r = R0 * b.s;
            const d2 = r * r - (y - b.y) * (y - b.y);
            if (d2 > 0) half = Math.max(half, Math.sqrt(d2));
        }
        out.push(2 * half);
    }
    return out;
}

/* 屏幕角度上的旋转。屏幕 y 朝下,但这不改变公式的形状:转 θ 就是
 * (x·cosθ − y·sinθ, x·sinθ + y·cosθ)。引擎里那条等式是 ballset(deg) =
 * R(deg − 90°)·ballset(90°)(见 cursor-fx.js 的 CFG 注释),这里照它算。 */
function rot(x, y, deg) {
    const a = deg * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);
    return { x: x * c - y * s, y: x * s + y * c };
}

function area(fr, R0, rays) {
    const n = rays || 720;
    const two_pi = 2 * Math.PI;
    let acc = 0;
    for (let i = 0; i < n; i++) {
        const phi = (i + 0.5) * two_pi / n;
        const cp = Math.cos(phi), sp = Math.sin(phi);
        const iv = [];
        for (const b of visible(fr)) {
            const r = R0 * b.s;
            const c = b.x * cp + b.y * sp;
            const perp = -b.x * sp + b.y * cp;
            const disc = r * r - perp * perp;
            if (disc <= 0) continue;
            const h = Math.sqrt(disc);
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
    return 0.5 * two_pi / n * acc;
}

/*
 * 轮廓:沿 N 个方向量并集最外沿到原点的距离。只用在「必须是一颗球」那种形状上
 * (收拢的最后一帧),绝不能拿来量「不可点击」的帧间变化 —— 那一圈中间是空的,
 * 一条从原点出发的射线要么打中水滴(外沿 28px 上下),要么从水滴之间的缝里穿出去
 * (0px):外沿沿角度本身就是断的。用它量帧间变化,量到的是缝扫过采样方向的时机,
 * 不是画面在跳。
 *
 * 分两层是为了点击特效:那一摊要量的是**主体**(核 + 外缘那一圈)的轮廓,外面溅出去
 * 的那几颗不能算进来 —— 算进来的话,射线打中一颗液滴就报一个大数,量出来的「圆不圆」
 * 是液滴摆在哪儿,不是那一摊自己圆不圆。
 */
function rimOf(list, R0, n) {
    const N = n || 72;
    const out = [];
    for (let i = 0; i < N; i++) {
        const a = 2 * Math.PI * i / N;
        const ca = Math.cos(a), sa = Math.sin(a);
        let r = 0;
        for (const b of list) {
            const rad = R0 * b.s;
            const c = b.x * ca + b.y * sa;
            const perp = -b.x * sa + b.y * ca;
            const disc = rad * rad - perp * perp;
            if (disc <= 0) continue;
            const far = c + Math.sqrt(disc);
            if (far > r) r = far;
        }
        out.push(r);
    }
    return out;
}
function profile(fr, R0, n) { return rimOf(visible(fr), R0, n); }

/*
 * ── 点击特效那一摊专用:几个只有俯视口径才量得出的数 ──
 *
 * 这一格的形状被用户推翻过两次,两次都把判据里量什么改了。现在这一版:
 *
 *   第一次  **「现在是扁扁的形状,这不对,应该是圆形的,因为是俯视角度,液体摊开的
 *           效果」** —— 原来那三条判据(宽 > 球、宽/高 ≥ 1.5、质心比指针低 5.9px)
 *           全是**侧视**的口径:球从侧面看被压扁、还往下掉。俯视看下去,「扁」和
 *           「低」在画面上根本不存在,它们只是侧视的错觉。
 *   第二次  **「去掉那些小液滴,并且摊开的轮廓再放大一点」** —— 外围那一圈溅出去的
 *           液滴整段删掉,尺寸也从 1.17 倍放到 1.60 倍(那个 42px 就是因为外圈才
 *           装不下的,见引擎 CFG 里那一段)。
 *
 * 于是要量的数变成四个:
 *
 *   圆度      轮廓 72 个方向的最外沿,最大/最小。正圆 1.00,旧那版扁椭圆 1.8 上下。
 *   摊开多大  **等效面积直径**(把那点墨迹摊成一个正圆的直径)。这才是「按下去」和
 *             「悬停」真正的分界:可点击那一坨的面积恒等于 πR0²,也就是和球一样大。
 *   一整片     球和球之间**几何上还叠着**(最小间隙是个负数)。这一条是外圈液滴删掉
 *             之后新加的、也是**反过来**的:上一版这里验的是「外面有几颗断开的小
 *             液滴」,现在验的是「谁也不许散开」。它顺带守住了「放大不许把外缘拉裂」
 *             —— 10 团外缘本来就叠得很重,真裂了这里立刻是正的。
 *   材料      面积该是 πR0² 乘上 splatMass(q),不是 πR0²。
 */

/*
 * 把一帧点击特效量成一组数。要在「按住」的这段时间里反复量 —— 量形状,也量它在动。
 *
 * mass 是这一帧的**材料倍数**(引擎的 splatMass(q)):那一摊的面积该是 πR0² 乘上它。
 * 不传的话面积那一项会恒报错。
 */
function splatShape(fr, R0, CFG, mass) {
    const balls = (fr || []).filter((b) => b.on !== false && b.s > 0.01);
    const rl = rimOf(balls, R0, 72);
    const lo = Math.min(...rl), hi = Math.max(...rl);
    // 球和球之间最小的边到边间隙(负数 = 叠着)。全部叠着 ⇒ 并集必然是一整片,
    // 和 goo 怎么调都没关系 —— 比「按门槛判断开」硬得多
    let minGap = Infinity;
    for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
            const gap = Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y)
                - R0 * balls[i].s - R0 * balls[j].s;
            if (gap < minGap) minGap = gap;
        }
    }
    const want = Math.PI * R0 * R0 * (mass || 1);
    return {
        round: lo > 0 ? hi / lo : Infinity,
        pad: 2 * Math.sqrt(area(balls, R0) / Math.PI),
        balls: balls.length, minGap,
        reach: 2 * Math.max(...balls.map((b) => Math.hypot(b.x, b.y) + R0 * b.s)),
        cen: centroid(fr),
        cover: cover(fr, R0),
        areaErr: Math.abs(area(fr, R0) / want - 1),
        minR: Math.min(...balls.map((b) => R0 * b.s)),
    };
}

/*
 * 跳不跳,量的是「这一帧到下一帧有多少 px² 的黑白翻了过来」。
 *
 * 不能比两个形状之间的距离:球数会变(6 → 8),中间还可能空着一个洞,任何逐球、
 * 逐方向的比法都会在换形那一帧报出一个假的无穷大。差集面积不吃这一套 —— 它只问
 * 画面上哪块黑了、哪块没黑,对球的个数、排布、洞里洞外都无所谓。
 * 参考尺:一颗 R0 的球面积是 πR0² ≈ 531px²。
 */
function frameDiff(a, b, R0) {
    const va = visible(a), vb = visible(b);
    const ua = area(va, R0), ub = area(vb, R0);
    const uab = area(va.concat(vb), R0);
    // 交给面积的是并集,所以不能用「|A|+|B|−2·交」那一版:两帧的面积各自都是 πR0²,
    // 套错了符号会得到负数,再被 max(0,·) 一夹,不管两帧差多少都恒等于 0 —— 一条永远
    // 通过的假测试。由 |A∪B| = |A|+|B|−|A∩B| 推回交,再展开:|A△B| = 2|A∪B| − |A| − |B|
    return Math.max(0, 2 * uab - ua - ub);
}

/*
 * 逐球比对「屏幕上画的」和「引擎算的」。
 *
 * 两边的球数**可能不一样** —— 形状换错了、某一帧少画了一颗,这些都是要报的错。
 * 但报错的方式很重要:按较长的那个数组遍历,并且把「那边没有这颗球」当成无穷大的
 * 差异。照最短的那个遍历会**把脚本直接弄崩**(读不存在的球的 x),崩了的话后面几节
 * 一条都不跑,而且报出来的是「Cannot read properties of undefined」——
 * 看的人得先猜出是哪一节、哪一件事,才知道自己改坏了什么。
 */
function ballDiff(want, got) {
    // 一边根本没画(状态压根没起来),就是「对不上」,不是「差 0」
    if (!want || !got || !want.length || !got.length) return Infinity;
    const n = Math.max(want.length, got.length);
    let d = 0;
    for (let i = 0; i < n; i++) {
        const a = want[i], b = got[i];
        if (!a || !b) return Infinity;
        d = Math.max(d, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }
    return d;
}

/*
 * 此刻真正画在屏幕上的液体层。
 *
 * 不能只看「壳存不存在」:图层建出来之后会一直留在 DOM 里备用(stop() 只是把它
 * display:none),再建一次图层就是白花钱。也不能只看 display:建出来但还没轮到它
 * 亮相的那一帧,display 是空的、而 .cfx 的 opacity 是 0 —— 那时候它什么也没画。
 */
function layersOn(sb) {
    return sb.wraps().filter((w) => w.style.display !== "none"
        && w.children[0] && w.children[0].style.opacity !== "0");
}

function maxDiffDuring(sb, ms, R0, from) {
    let prev = sb.frames() || from || null;
    let m = 0;
    const end = sb.now() + ms;
    while (sb.now() < end) {
        sb.step();
        const fr = sb.frames();
        if (prev && fr) m = Math.max(m, frameDiff(prev, fr, R0));
        if (fr) prev = fr;
    }
    return m;
}

/*
 * 静止时的光标:一颗 scale=1、圆心在原点的球。
 *
 * 页面上那是 #latex-ball,不在液体层里,所以 sb.frames() 看不见它 ——
 * 但**观众看得见**。冷启动时从这颗球到状态第一帧的那一下,是真实发生的一帧变化。
 */
const REST_FRAME = [{ x: 0, y: 0, s: 1, on: true }];

function runTests() {
    const R0 = 13;      // 引擎里的 R0;下面用 FX().CFG.R0 核对一次

    // =====================================================================
    section("1. 意图通道 --cursor:解出什么");
    {
        const sb = sandbox();
        check("引擎的 R0 还是 13", sb.FX().CFG.R0 === R0, String(sb.FX().CFG.R0));

        const cases = [
            ["pointer", "viscous", "可点击"],
            ["not-allowed", "burst", "不可点击"],
            ["no-drop", "burst", "不许放"],
            ["text", "beam", "文本"],
        ];
        for (const [val, want, label] of cases) {
            const el = sb.block({ "--cursor": val });
            sb.hover(el);
            sb.advance(30);
            check(`--cursor:${val} → ${label}(${want})`, sb.D().want === want, sb.D().want);
            sb.unhover(el);
            sb.advance(700);
        }

        /*
         * 拖动缩放那一族:**每一个值**都要认领,而且要落在它该在的那条轴上。
         *
         * 只查「认成 resize 了」是不够的 —— 14 个值全画成 0° 也照样通过,而方向
         * 恰恰是这一族唯一的变量(用户的原话:「跟着缩放轴,含对角」)。所以每个值
         * 都比一次引擎 RESIZE_AXIS 里那条度数,而且**从引擎那份表里逐个生成用例**:
         * 往表里加一个值(n-resize 之类),这里自动多一条。
         *
         * 换轴会触发一次收拢再换形(角度不同 = 形状不同 = 状态机的 key 不同),
         * 所以每个值之间要把 q 放干净再上下一个。
         */
        const RESIZE_AXIS = sb.FX().RESIZE_AXIS;
        const axisValues = Object.keys(RESIZE_AXIS);
        check("引擎里那张方向表有 14 个值、4 个角度",
            axisValues.length === 14 && new Set(Object.values(RESIZE_AXIS)).size === 4,
            `${axisValues.length} 个值 / ${[...new Set(Object.values(RESIZE_AXIS))].sort((a, b) => a - b)}°`);
        for (const val of axisValues) {
            const el = sb.block({ "--cursor": val });
            sb.hover(el);
            sb.advance(600);
            const d = sb.D();
            check(`--cursor:${val} → 认领,而且画在 ${RESIZE_AXIS[val]}° 那条轴上`,
                d.want === "resize" && d.state === "resize" && d.axis === RESIZE_AXIS[val],
                `want=${d.want} state=${d.state} axis=${d.axis}`);
            sb.unhover(el);
            sb.advance(800);
        }

        /*
         * 抓取那一族**要回来了** —— 这是对上一次「撤掉,交还原版鼠标」的推翻。
         *
         * 用户的原话是「抓取中也用这个,可抓取的效果用可点击特效」,所以四个值分成
         * 两半,落在两格上:
         *   grab                      → 可点击(viscous),和 pointer 同一格;
         *   grabbing / move / all-scroll → 点击特效(splat),和「按住」同一格。
         *
         * 这一节只验认领。形状对不对、按下去是不是同一格,后面各节按形状验。
         */
        {
            const e2 = sb.block({ "--cursor": "grab" });
            sb.hover(e2);
            sb.advance(30);
            check("--cursor:grab 认领,而且就是可点击那一格", sb.D().want === "viscous", sb.D().want);
            sb.unhover(e2);
            sb.advance(800);
        }
        for (const v of ["grabbing", "move", "all-scroll"]) {
            const e2 = sb.block({ "--cursor": v });
            sb.hover(e2);
            sb.advance(30);
            check(`--cursor:${v} 认领,而且就是点击特效那一格`, sb.D().want === "splat", sb.D().want);
            sb.unhover(e2);
            sb.advance(800);
        }

        /*
         * 放大缩小:一族两个方向。名字是同一个(zoom),方向进 key ——
         * 和拖动缩放那条线同一套写法(那边的方向是角度,这边的方向是 in/out)。
         */
        for (const [v, key] of [["zoom-in", "zoom:in"], ["zoom-out", "zoom:out"]]) {
            const e2 = sb.block({ "--cursor": v });
            sb.hover(e2);
            sb.advance(30);
            const d = sb.D();
            check(`--cursor:${v} 认领成 zoom,方向 ${key}`,
                d.want === "zoom" && d.wantKey === key, `want=${d.want} key=${d.wantKey}`);
            sb.unhover(e2);
            sb.advance(800);
        }

        // 清单上没做的值,一个都不许认领
        for (const v of ["crosshair", "help", "wait", "context-menu"]) {
            const e2 = sb.block({ "--cursor": v });
            sb.hover(e2);
            sb.advance(30);
            check(`没做过的 ${v} 不认领`, sb.D().want === "", sb.D().want);
            sb.unhover(e2);
            sb.advance(30);
        }

        // 继承:子元素自己没声明,跟着父元素走
        const parent = sb.block({ "--cursor": "pointer" });
        const child = makeEl("span");
        parent.appendChild(child);
        sb.hover(child);
        sb.advance(30);
        check("自己的 --cursor 空着时跟父元素走", sb.D().want === "viscous", sb.D().want);
        sb.unhover(child);
        sb.advance(800);

        // 回落:一个没有 --cursor 通道的页面(cursor 不是 none),真的 cursor 就是答案
        const plain = sb.block({ cursor: "pointer" });
        sb.hover(plain);
        sb.advance(30);
        check("没接通道时回落到真的 cursor", sb.D().want === "viscous", sb.D().want);
        sb.unhover(plain);
        sb.advance(800);

        // 本站:没有 --cursor、cursor 又是 none → 什么也不知道,不认领
        const bare = sb.block({});
        sb.hover(bare);
        sb.advance(30);
        check("本站没标 --cursor 的地方不认领(cursor 是 none)", sb.D().want === "", sb.D().want);
        sb.unhover(bare);
        sb.advance(60);

        // 走完这一节,图层已经建出来了(上面有几个真的认领过的状态)—— 建了就留着备用,
        // 这里要断言的是它收干净了、循环停了,不是它没存在过
        check("没状态时屏幕上没有液体、rAF 也停了",
            layersOn(sb).length === 0 && sb.rafCount() === 0 && sb.q() === 0,
            `可见 ${layersOn(sb).length} 层 raf=${sb.rafCount()} q=${fmt(sb.q(), 4)}`);
    }

    // =====================================================================
    section("2. 可点击:一坨、中心实、边缘在动");
    {
        const sb = sandbox();
        const el = sb.btn();
        sb.hover(el);
        sb.advance(420);

        const d = sb.D();
        check("状态是 viscous", d.state === "viscous", d.state);
        check("q 已经到 1", near(d.q, 1, 0.01), fmt(d.q, 4));
        check("球被藏起来了", sb.ballHidden());
        check("图层建出来了并显示着", sb.wraps().length === 1 && sb.wraps()[0].style.display !== "none");

        // 帧必须**就是引擎的输出** —— 不是这边另画的一份
        const want = sb.FX().sampleViscous(d.te, d.q).balls;
        const diff = ballDiff(want, sb.frames());
        check("屏幕上的球和引擎 sampleViscous 逐球一致", near(diff, 0, 0.01), `最大差 ${fmt(diff, 4)}px`);

        // 满状态扫一圈:面积守恒 + 中心始终是实的
        let maxAreaErr = 0, maxCover = -1e9, minReach = 1e9, maxReach = 0;
        let ballCount = 0;
        for (let t = 0; t < 2400; t += 60) {
            sb.advance(60);
            const fr = sb.frames();
            const a = area(fr, R0);
            maxAreaErr = Math.max(maxAreaErr, Math.abs(a / (Math.PI * R0 * R0) - 1) * 100);
            maxCover = Math.max(maxCover, cover(fr, R0));
            minReach = Math.min(minReach, reach(fr, R0));
            maxReach = Math.max(maxReach, reach(fr, R0));
            ballCount = Math.max(ballCount, visible(fr).length);
        }
        check("面积守 πR0²(偏差 < 0.5%)", maxAreaErr < 0.5, `${fmt(maxAreaErr, 3)}%`);
        check("中心始终被盖住(材料边界没到过原点外侧)", maxCover < 0, `最靠内 ${fmt(maxCover)}px`);
        check("外沿有起伏(边缘在动,不是死圆)", maxReach - minReach > 1.0,
            `${fmt(minReach)}–${fmt(maxReach)}px`);
        check("六颗球(1 核 + 5 瓣)都画得出来", ballCount === 6, String(ballCount));
    }

    // =====================================================================
    section("3. 不可点击:多滴、中心空、外沿有界");
    {
        const sb = sandbox();
        const el = sb.block({ "--cursor": "not-allowed" });
        sb.hover(el);
        sb.advance(420);

        const d = sb.D();
        check("状态是 burst", d.state === "burst", d.state);
        check("球被藏起来了", sb.ballHidden());

        const want = sb.FX().sampleBurst(d.te, d.q).balls;
        const diff = ballDiff(want, sb.frames());
        check("屏幕上的球和引擎 sampleBurst 逐球一致", near(diff, 0, 0.01), `最大差 ${fmt(diff, 4)}px`);

        let maxAreaErr = 0, minCover = 1e9, minReach = 1e9, maxReach = 0, minBalls = 99;
        for (let t = 0; t < 3000; t += 60) {
            sb.advance(60);
            const fr = sb.frames();
            const a = area(fr, R0);
            maxAreaErr = Math.max(maxAreaErr, Math.abs(a / (Math.PI * R0 * R0) - 1) * 100);
            minCover = Math.min(minCover, cover(fr, R0));
            minReach = Math.min(minReach, reach(fr, R0));
            maxReach = Math.max(maxReach, reach(fr, R0));
            minBalls = Math.min(minBalls, visible(fr).length);
        }
        check("面积守 πR0²(偏差 < 0.5%)", maxAreaErr < 0.5, `${fmt(maxAreaErr, 3)}%`);
        check("中心一定是空的", minCover > 0, `最靠内 ${fmt(minCover)}px`);
        check("液滴是分开的很多颗", minBalls >= 8, String(minBalls));
        /*
         * 外沿的上界就是「圈有多大」这句话 —— 原来放到 34,是因为那时环半径 23;
         * 用户说圈太大之后环半径收到 18,上界得跟着收,不然参数放回去也没人管。
         * 27 太松了:那个数是从旧呼吸量(2.4)下量到的 29.55 减出来的,而呼吸量
         * 一起收到 1.6 之后,同一个环半径 23 只量到 30.3 —— 却正好从 27 底下
         * 溜过去了(配 2.4 的呼吸量)。现在写 26,量到的是 25.09:环半径每加 1px,
         * 外沿就加 ~1.05px,所以这一条能卡住**环半径 19 以上**的任何回退。
         *
         * 下界那半句是反着的毛病:液滴要是全挤在中心,「四散」就没了,所以也给它一条底线。
         */
        check("外沿被拽住(有界,不无限扩散)", maxReach - minReach > 1 && maxReach < 26,
            `${fmt(minReach)}–${fmt(maxReach)}px`);
        check("液滴确实散出去了(没缩回中心)", minReach > 15, `最靠内 ${fmt(minReach)}px`);
    }

    // =====================================================================
    section("4. 文本:两颗小球、中间留一段、一丝连着");
    {
        const sb = sandbox();
        const el = sb.block({ "--cursor": "text" });
        sb.hover(el);
        sb.advance(420);

        const d = sb.D();
        check("状态是 beam", d.state === "beam", d.state);
        check("球被藏起来了", sb.ballHidden());

        // 帧必须**就是引擎的输出** —— 和上面两个状态同一条要求
        const want = sb.FX().sampleBeam(d.te, d.q).balls;
        const diff = ballDiff(want, sb.frames());
        check("屏幕上的球和引擎 sampleBeam 逐球一致", near(diff, 0, 0.01), `最大差 ${fmt(diff, 4)}px`);

        const fx = sb.FX();
        const CFG = fx.CFG;
        const ball = 2 * R0;

        /*
         * ── 先说「它不再是什么」 ──
         *
         * 这一格原来是「一摊液体被挤成一条竖线」,和拖动缩放那一族**是同一个形状**
         * (同一次挤压、同一份材料,只是转到各自的轴上)。2026-09-18 用户把它改成
         * 「两个小球,中间有些距离,中间有液体藕断丝连」之后,这句话就不成立了。
         *
         * 拆家的**机制**就是下面这一个字段:引擎在文本这一格上不报 deg,拖动缩放那一族
         * 报。dump_states.js / render_states.py 都按「这一帧有没有 deg」决定拿哪一套判据
         * 去量 —— 所以这两条不是修辞,是那两张表分岔的依据。少了它,渲染那边会拿
         * 「比球窄 / 高宽比 ≥ 2.5」去量两颗球,然后一路红。
         */
        const q1 = fx.sampleBeam(0, 1);
        check("文本不报 deg(不再属于「一条线」那一族)",
            q1.deg === undefined && q1.phase === "beam", `deg=${q1.deg} phase=${q1.phase}`);
        check("拖动缩放那一族照样报 deg(拆家没拆到它头上)",
            fx.sampleResize(0, 1, 0).deg === 0 && fx.sampleResize(0, 1, 45).deg === 45
            && fx.sampleResize(0, 1, 90).deg === 90,
            [0, 45, 90].map((g) => `${fx.sampleResize(0, 1, g).deg}°`).join(" / "));
        check(`文本和线不再是同一个形状(团数就不一样:${q1.balls.length} vs ${CFG.LINE_COUNT})`,
            q1.balls.length !== fx.sampleResize(0, 1, 90).balls.length,
            `${q1.balls.length} vs ${fx.sampleResize(0, 1, 90).balls.length}`);

        let maxAreaErr = 0, maxCover = -1e9, minBalls = 99, maxGap = -1e9;
        let minFat = 1e9, maxFat = 0, minWaist = 1e9, maxWaist = 0, minH = 1e9, maxH = 0;
        let minSpan = 1e9, maxSpan = 0, minRatio = 1e9, maxRatio = 0;
        let worstRatio = 9, worstAt = 0;
        const MASS = CFG.TEXT_MASS;
        for (let t = 0; t < 2400; t += 60) {
            sb.advance(60);
            const fr = sb.frames();
            /*
             * 文本是三个元素状态里唯一不守「面积恒等于 πR0²」的:它随 q 把自己收到
             * TEXT_MASS 倍 —— 满状态时两颗球加一丝本来就没占满一颗球的地方(理由见
             * CFG 里 TEXT_* 那一段)。所以这里比的不是 πR0²,而是**那条意图曲线**:
             * 每一帧该有多少材料都是能算出来的,比一个固定值严 —— 少收、多收、
             * 收错时候,都会在这一条上露出来。
             *
             * 曲线本身从引擎里要(textMass),不在这里重写一遍:这里写死的话,哪天
             * 引擎把曲线改一改,脚本就会一直拿旧公式去量新形状,量出个「偏差 9%」
             * 还以为是引擎坏了。
             */
            const need = Math.PI * R0 * R0 * fx.textMass(sb.q());
            maxAreaErr = Math.max(maxAreaErr, Math.abs(area(fr, R0) / need - 1) * 100);
            maxCover = Math.max(maxCover, cover(fr, R0));
            minBalls = Math.min(minBalls, visible(fr).length);
            maxGap = Math.max(maxGap, maxNeighborGap(fr, R0));

            /*
             * 前两团就是那两颗头球 —— sampleBeam 先摆球、再摆丝,fitArea 不重排顺序。
             * 第 3 团是第一团丝(丝是奇数团、u 从 −1 到 +1 铺开,所以顺序就是沿轴)。
             */
            const v = visible(fr);
            const span = Math.abs(v[1].y - v[0].y);
            minSpan = Math.min(minSpan, span);
            maxSpan = Math.max(maxSpan, span);
            const rr = (R0 * v[0].s) / (R0 * v[2].s);
            minRatio = Math.min(minRatio, rr);
            maxRatio = Math.max(maxRatio, rr);

            /*
             * 一行一行地量宽度,取两头最粗的一行和正中 1/5 段里最细的一行。
             *
             * 两头要避开尖儿(贴着头量到的是圆角,宽度已经收下去了),中间只取一行又会
             * 量到两团丝之间的缝(那是丝自己的抖动,不是腰)—— 所以两头取最外那 1/5 段、
             * 中间取正中那 1/5 段。实测两头 12.5px、腰 5.0px,和设计尺寸(球 14 / 丝 5.7)
             * 对得上 —— 差的那点是 goo 把边啃掉的。
             */
            const prof = axisWidths(fr, R0, 64);
            const k = Math.max(1, Math.round(prof.length * 0.2));
            const fat = Math.max(...prof.slice(0, k), ...prof.slice(-k));
            const mid = Math.floor(prof.length / 2);
            const band = Math.max(1, Math.round(prof.length * 0.1));
            const waist = Math.min(...prof.slice(mid - band, mid + band + 1));
            minFat = Math.min(minFat, fat); maxFat = Math.max(maxFat, fat);
            minWaist = Math.min(minWaist, waist); maxWaist = Math.max(maxWaist, waist);
            const [lo, hi] = bbox(fr, R0);
            minH = Math.min(minH, hi.y - lo.y);
            maxH = Math.max(maxH, hi.y - lo.y);
            if (waist / fat < worstRatio) { worstRatio = waist / fat; worstAt = t; }
        }
        check(`面积按 q 从 πR0² 收到 ${MASS} 倍(偏差 < 0.5%)`, maxAreaErr < 0.5, `${fmt(maxAreaErr, 3)}%`);
        check("中心是实的(和不可点击正相反)", maxCover < 0, `最靠内 ${fmt(maxCover)}px`);
        check(`帧里 ${CFG.TEXT_NECK_N + 2} 团一个不少(2 球 + ${CFG.TEXT_NECK_N} 丝)`,
            minBalls === CFG.TEXT_NECK_N + 2, String(minBalls));
        /*
         * 整条必须连成一笔 —— 这也是「藕断丝连」里那个「连」字。相邻两团一旦分开,
         * 轮廓就是糖葫芦(或者三段互不相干的东西),而 goo 只把相切的那一点糊圆,
         * 糊不出一条连续的丝来。
         */
        check("沿轴相邻两团始终重叠(连成一笔,不是一串珠子)", maxGap < 0, `最大的缝 ${fmt(maxGap)}px`);

        /*
         * ── 剖面:「两头粗、中间细」 ──
         *
         * 这是这一格的主判据,因为用户那句话只有这一种量法。外接矩形量不出它(腰鼓和
         * 同高同宽的直棒,外接矩形一模一样),reach 更量不出(一圈和一条线的 reach 一样)。
         */
        check("两头粗:每头都粗过半个球(两头是**球**,不是把整条长胖了)",
            minFat > ball * 0.45 && maxFat < ball * 0.75,
            `${fmt(minFat)}–${fmt(maxFat)}px(球 ${ball}px;整条长胖顶破的是上面那条上界)`);
        check("中间细:最细处不到最粗处的一半(不是一根棒子)",
            worstRatio < 0.5, `${fmt(worstRatio)} @${fmt(worstAt, 0)}ms`);
        /*
         * 腰还得**画得出来**才叫「藕断丝连」。这条阈值不是随手定的,是量出来的:
         *
         *   goo 是「模糊 3px + 陡阈值」,一团圆糊完之后还剩不剩,取决于它是孤零零一颗
         *   还是**串在链子上** —— 两样都二分过:
         *     孤球地板 半径 3.58px(直径 7.17px)
         *     链子地板 半径 2.25px(直径 4.50px)—— 是孤球的 63%,而且**与链子多长无关**
         *     (10px 和 40px 两条链量出来都是 2.25)。解析上对得上:无穷长的条被 σ=3 糊过
         *     之后 w ≈ 4.05px 还活得下来(erf(w/2σ√2) ≥ 0.5)。
         *
         *   中间那一丝半径只有 2.85px(最细时 2.565px)—— **故意**压在孤球地板底下,靠的
         *   就是它串在链子上。所以这一格**不能**套「每一团都画得出来」那条判据:拿孤球
         *   地板去量,17 团里只有 2 团过得了,报出来是「有球画不出来」,而屏幕上明明
         *   是一整笔。该量的是**画出来的那一行有多宽**。
         */
        check("腰比链子地板粗(不然那一丝会被 goo 糊断)",
            minWaist > 2 * 2.25, `最细 ${fmt(minWaist)}px(链子地板 4.50px 宽;孤球地板 7.17px)`);
        check(`丝最细的那一团(半径 ${fmt(CFG.TEXT_NECK_R * (1 - CFG.TEXT_SWING_R), 3)}px)也在链子地板 2.25px 上面`,
            CFG.TEXT_NECK_R * (1 - CFG.TEXT_SWING_R) > 2.25,
            `${fmt(CFG.TEXT_NECK_R * (1 - CFG.TEXT_SWING_R), 3)}px`);

        /*
         * ── 尺寸:两个**小球**、中间**有些距离** ──
         *
         * 两头的粗细和整体缩放无关的那一句:同帧相比,「头 / 丝」这个比例恒等于设计里的
         * TEXT_BALL_R / TEXT_NECK_R(整体缩放两边一起缩,约掉了),而丝的半径自己带着 ±10%
         * 的摆动,所以区间留到 2.0–3.0 之间。
         */
        const design = CFG.TEXT_BALL_R / CFG.TEXT_NECK_R;
        check(`两头就是设计里那个比例(球/丝 = ${fmt(design)},不随整体缩放变)`,
            minRatio > 2.0 && maxRatio < 3.0, `${fmt(minRatio)}–${fmt(maxRatio)}`);
        check(`球心距 ≈ TEXT_BALL_D(${CFG.TEXT_BALL_D}px ±呼吸)`,
            minSpan > CFG.TEXT_BALL_D * 0.85 && maxSpan < CFG.TEXT_BALL_D * 1.15,
            `${fmt(minSpan)}–${fmt(maxSpan)}px`);
        check("两个球面之间真的留着空档(「中间有些距离」)",
            minSpan - 2 * CFG.TEXT_BALL_R > ball * 0.2,
            `最窄时空档 ${fmt(minSpan - 2 * CFG.TEXT_BALL_R)}px`);
        check("整条比一颗球高得多(是「两个 + 一段」,不是一颗球)",
            minH > ball * 1.15, `最矮 ${fmt(minH)}px > ${fmt(ball * 1.15)}px`);
        /*
         * 上界:设计上最坏的一帧(球距摆到 +10%、整体缩放也偏大)是 40.3px = 1.55 个球,
         * 所以这里写 1.6。**渲染**那边量到的比这低一档(goo 把两头啃圆,实测 36.0–37.5px
         * = 1.44 个球),所以那边的上界写在 1.5 —— 两个数不是矛盾,量的不是一回事,
         * 和不可点击那一圈的内外两个上界是同一个道理。
         */
        check("整条压在 1.6 个球高以内(用户「和现在差不多高」,再开就回去了)",
            maxH < ball * 1.6, `最高 ${fmt(maxH)}px < ${fmt(ball * 1.6)}px`);

        /* 液体两字同样落在「边在蠕动」上:冻住的话就是一块画好的图案 */
        check("轮廓在动(球距和腰都不是常数)",
            maxSpan - minSpan > 0.5 || maxWaist - minWaist > 0.3,
            `球距抖 ${fmt(maxSpan - minSpan)}px  腰抖 ${fmt(maxWaist - minWaist)}px`);

        /*
         * 交回普通光标的那一帧:q=0 必须**精确**退化成一颗 R0 的球。这一格有 17 团,
         * 退化的含义是 17 团全部重合在原点、半径全等于 R0 —— 所以交回 #latex-ball 时
         * 两帧逐像素一致,不需要交叉淡入。
         */
        const q0 = fx.sampleBeam(1234.5, 0);
        const off0 = Math.max(...q0.balls.map((b) => Math.hypot(b.x, b.y)));
        const flat0 = Math.max(...q0.balls.map((b) => Math.abs(b.scale - 1)));
        check(`q=0 精确退回一颗 R0 的球(${q0.balls.length} 团重合在原点、半径都是 R0)`,
            off0 < 1e-9 && flat0 < 1e-9,
            `最大离原点 ${off0.toExponential(1)}px  缩放偏差 ${flat0.toExponential(1)}`);
    }

    // =====================================================================
    section("5. 退出:先放开球、再收图层,球不淡进");
    {
        const sb = sandbox();
        const el = sb.btn();
        sb.hover(el);
        sb.advance(500);
        check("进入后球是藏着的", sb.ballHidden());

        sb.unhover(el);

        // 找「球被放开」和「图层收掉」各发生在哪一帧,顺序必须对
        let giveAt = -1, stopAt = -1;
        let prevHidden = true;
        let coverAtGive = null;
        for (let i = 0; i < 240 && (giveAt < 0 || stopAt < 0); i++) {
            sb.step();
            if (prevHidden && !sb.ballHidden()) {
                giveAt = sb.now();
                coverAtGive = cover(sb.frames(), R0);
            }
            prevHidden = sb.ballHidden();
            if (giveAt >= 0 && sb.wraps()[0] && sb.wraps()[0].style.display === "none") {
                stopAt = sb.now();
            }
        }
        check("球在状态结束前就被放开了", giveAt > 0, `${fmt(giveAt, 0)}ms`);
        check("放开时中心已经被盖住(球不会从洞里露出来)", coverAtGive !== null && coverAtGive < 0,
            coverAtGive === null ? "没采到" : `材料边界 ${fmt(coverAtGive)}px`);
        check("图层在球放开之后才收掉(顺序:先放球,后收液体)",
            stopAt > giveAt, `give=${fmt(giveAt, 0)}ms stop=${fmt(stopAt, 0)}ms`);
        check("收完 rAF 停了", sb.rafCount() === 0, String(sb.rafCount()));
        check("状态清空了", sb.state() === "" && sb.q() === 0, `state=${sb.state()} q=${fmt(sb.q(), 4)}`);
        check("收完球是露着的", !sb.ballHidden());

        /*
         * 收拢的最后一帧必须回到一颗整球 —— 交回 #latex-ball 不能有缝。
         *
         * 判据得是**轮廓**,不能是「每颗球的球心和缩放」:引擎的退出帧是按面积
         * 重新分配的,5 个瓣最后都落在原点但缩放未必正好齐平,逐球比会误报。
         * 真正要紧的是屏幕上那一坨的形状:处处都在 R0 上。
         */
        const sb2 = sandbox();
        const e2 = sb2.btn();
        sb2.hover(e2);
        sb2.advance(500);
        sb2.unhover(e2);
        let prev = sb2.frames();
        for (let i = 0; i < 240 && sb2.rafCount() > 0; i++) {
            sb2.step();
            const fr = sb2.frames();
            if (fr) prev = fr;
        }
        const prof = profile(prev, R0);
        const pMin = Math.min(...prof), pMax = Math.max(...prof);
        check("最后一帧收敛到一颗整球(轮廓处处贴合 R0)",
            cover(prev, R0) < 0 && Math.abs(pMin - R0) <= 0.3 && Math.abs(pMax - R0) <= 0.3,
            `外沿 ${fmt(pMin, 3)}–${fmt(pMax, 3)}px(R0=${R0},最差差 ` +
            `${fmt(Math.max(Math.abs(pMin - R0), Math.abs(pMax - R0)), 3)}px)`);

        // 退出全程用的必须是同一个状态收拢(中途换形会跳)
        const sb3 = sandbox();
        const e3 = sb3.block({ "--cursor": "not-allowed" });
        sb3.hover(e3);
        sb3.advance(600);
        sb3.unhover(e3);
        const seen = new Set();
        for (let i = 0; i < 240 && sb3.rafCount() > 0; i++) {
            sb3.step();
            // 收工那一帧 state 会被清空,那是「演完了」不是「换了形」,不算
            if (sb3.rafCount() > 0) seen.add(sb3.state());
        }
        check("退出全程都在用同一个状态收拢", seen.size === 1 && seen.has("burst"),
            Array.from(seen).join(","));
    }

    // =====================================================================
    section("6. 从可点击移到不可点击:先收拢,再换形");
    {
        const sb = sandbox();
        const a = sb.btn();
        const b = sb.block({ "--cursor": "not-allowed" });
        sb.hover(a);
        sb.advance(500);
        check("先在 viscous 上", sb.state() === "viscous", sb.state());

        sb.unhover(a);
        sb.hover(b);

        let minQ = 1, switchedAtQ = null, prev = sb.state();
        let ballEverShown = false;
        for (let i = 0; i < 300 && sb.rafCount() > 0; i++) {
            // 换形判据读的是**这一帧开始时**的 q(tick 里换完才推进 q),
            // 所以要在 step 之前采 —— step 之后再读,读到的是已经长起来的那一帧
            const qBefore = sb.q();
            sb.step();
            minQ = Math.min(minQ, sb.q());
            if (!sb.ballHidden()) ballEverShown = true;
            if (sb.state() !== prev) { switchedAtQ = qBefore; prev = sb.state(); }
        }
        check("换形前真的收拢到了 q≈0", minQ <= 0.05, `min q=${fmt(minQ, 4)}`);
        const EPS = sb.win.HoverWatch.CFG.EPS;
        check("换形发生在 q≈0 那一帧", switchedAtQ !== null && switchedAtQ <= EPS,
            switchedAtQ === null ? "没换" : `q=${fmt(switchedAtQ, 4)} ≤ EPS=${fmt(EPS, 3)}`);
        check("换成 burst 并长到了满状态", sb.state() === "burst" && near(sb.q(), 1, 0.01),
            `${sb.state()} q=${fmt(sb.q(), 4)}`);
        check("换形途中球一次都没松手(不会白闪)", !ballEverShown);
    }

    // =====================================================================
    section("7. 加载态插队:先收成一个球让位");
    {
        const sb = sandbox();
        const el = sb.btn();
        // 指针就在按钮上。之后全程不会再动它 —— 回来那一步必须自己发生
        sb.setHit(el);
        sb.hover(el);
        sb.advance(500);
        check("元素状态先起来了", sb.state() === "viscous" && near(sb.q(), 1, 0.01),
            `${sb.state()} q=${fmt(sb.q(), 4)}`);

        const im = sb.addMedia("img");
        sb.scan();
        sb.advance(20);
        check("加载态确实占住了光标", sb.win.LoadingWatch.busy() === true);

        // 宽限期(140ms)过完加载态才亮相,这段就是元素状态收成一个球的时间
        sb.advance(160);
        check("加载态已经亮相了", sb.loadingState() === "show", sb.loadingState());
        check("亮相前元素状态已经收到接近 0", sb.q() < 0.25, `q=${fmt(sb.q(), 4)}`);
        check("让位用的是更短的时间常数(比正常收拢快)",
            sb.q() < Math.exp(-160 / 130),
            `q=${fmt(sb.q(), 4)} vs 正常收拢 ${fmt(Math.exp(-160 / 130), 4)}`);

        // 场上只能有一层画出来的液体,两个同时画就是两块黑影叠在一起
        check("同一时刻只有一层液体在画", layersOn(sb).length === 1, `${layersOn(sb).length} 层`);
        check("那一层是加载态的(元素状态让开了)", layersOn(sb)[0] === sb.wraps()[1],
            layersOn(sb)[0] === sb.wraps()[0] ? "元素状态的还在画" : "");

        // 让位之后元素状态的循环自己也该收工(q 还在往 0 走,但已经什么都不画了)
        sb.advance(200);
        check("元素状态的循环收工了(不再空转)", sb.state() === "" && !sb.D().raf && sb.q() === 0,
            `state=${sb.state()} q=${fmt(sb.q(), 4)} raf=${sb.D().raf}`);

        // 图好了、加载态收完 → 指针一直没动过,元素状态得自己回来
        im.complete = true;
        im.fire("load");
        sb.advance(1400);
        check("加载态收干净了", sb.loadingState() === "idle", sb.loadingState());
        check("加载态收工时把元素状态接回来了(指针一下都没动)",
            sb.state() === "viscous" && near(sb.q(), 1, 0.05),
            `${sb.state()} q=${fmt(sb.q(), 4)}`);
        check("接回来之后又只有一层液体了", layersOn(sb).length === 1, `${layersOn(sb).length} 层`);
    }

    // =====================================================================
    section("8. 半路改主意不许跳一下");
    {
        // 基线:几种「自然」过程的单帧黑白翻转量。限值取其中最猛的一种 ——
        // 别的动作只要不比它更猛,就说明没有额外的硬切
        const base = (run) => {
            const sb = sandbox();
            return run(sb);
        };
        /*
         * 「起」这一组要从**静止的那颗球**量起(REST_FRAME),不能从液体层的第一帧量起。
         *
         * 这里踩过一次坑:冷启动时 sb.frames() 是空的(球画在 #latex-ball 上,
         * 不在液体层里),所以旧写法把「球 → 第一帧」那一下**整个漏掉了**,
         * 直接从第一帧开始逐帧比。而下面那些「满状态换成 X」的用例是从液体层
         * 已有帧开始的,那一下照样算进去 —— 两边量的根本不是同一段过程,
         * 结果就是换形用例天然比基线多挨一记(球→第一帧,实测 71px²),
         * 却天天报「你跳了」。同一件事基线算了、用例算了,才谈得上比大小。
         */
        const risePeak = base((sb) => { const e = sb.btn(); sb.hover(e); return maxDiffDuring(sb, 500, R0, REST_FRAME); });
        const fallPeak = base((sb) => { const e = sb.btn(); sb.hover(e); sb.advance(500); sb.unhover(e); return maxDiffDuring(sb, 700, R0); });
        const swayPeak = base((sb) => { const e = sb.btn(); sb.hover(e); sb.advance(600); return maxDiffDuring(sb, 2000, R0); });
        const yieldPeak = base((sb) => {
            const e = sb.btn();
            sb.hover(e);
            sb.advance(500);
            sb.addMedia("img"); sb.scan();
            return maxDiffDuring(sb, 300, R0);
        });
        /*
         * 换成不可点击那条路里含一整段 burst,所以它自己也有一套基线 ——
         * 而且比可点击那族猛得多:水滴退出时第一帧就被拽回来 5.7px(半径对 q 的
         * 曲线在 q=1 处最陡,再乘上指数衰减的头一拍),单帧翻九百多 px²。
         *
         * 门槛分两组,各自跟自己同类比。合成一个全局最大值的话,可点击那几条
         * (单帧几十 px²)就形同虚设了 —— 一个几百 px² 的硬切都能混过去。
         */
        const burstUp = base((sb) => { const e = sb.block({ "--cursor": "not-allowed" }); sb.hover(e); return maxDiffDuring(sb, 600, R0, REST_FRAME); });
        const burstDown = base((sb) => { const e = sb.block({ "--cursor": "not-allowed" }); sb.hover(e); sb.advance(600); sb.unhover(e); return maxDiffDuring(sb, 700, R0); });
        /*
         * 文本那条路也有自己的一套基线,理由一样:一摊液体被挤成竖线的过程中,
         * 外沿在纵向一路往外长,单帧翻黑量天然比可点击那族大。拿可点击的门槛去卡它
         * 只会天天报警,拿它去卡可点击又形同虚设。
         */
        const beamUp = base((sb) => { const e = sb.block({ "--cursor": "text" }); sb.hover(e); return maxDiffDuring(sb, 600, R0, REST_FRAME); });
        const beamDown = base((sb) => { const e = sb.block({ "--cursor": "text" }); sb.hover(e); sb.advance(600); sb.unhover(e); return maxDiffDuring(sb, 700, R0); });
        /*
         * 门槛 = 自然峰值 × 1.02 + 余量。那个余量不是「松一点好过」,是被量出来的:
         *
         * 换形那一帧的代价**不是一个定值**,它随「第一帧落在 q 的哪里」连续变。
         * 实测文本这条路:静止球 → 第一帧,q=0.15 时 41.7px²,q=0.20 时 56.6px² ——
         * 1/4 帧的差别就是 15px²。而冷启动落在 q=0.169(那里 47.3),「满状态换成
         * 文本」落在 q=0.181(那里 50.9,还要再叠上换形那一下的残形 —— 那一趟整段
         * 量到 52.1):换形时 q **不是从 0 起**,是从交回来的那个 epsilon 接着涨,
         * 于是第一帧天然比冷启动多走一格。那不是跳,是 q 多走了一格 —— 拿只走冷启动
         * 那条路的基线去卡它,天天误报。
         *
         * 所以余量取 15px²(一颗球面积的 3%),刚好盖住这一格。它为什么不能更大,
         * 下面那条参考代价顶住了:真正要拦的是「不收回、直接换形」——
         * 满状态可点击 → 文本第一帧是 161px²,→ 满状态文本 366px²,
         * 不可点击那一族 978px²。门槛必须远在最小的那个下面,否则这道门就是摆设。
         */
        const MARGIN = 15;
        const limitOf = (v) => v * 1.02 + MARGIN;
        const vLimit = limitOf(Math.max(risePeak, fallPeak, swayPeak, yieldPeak));
        /*
         * 别的路拿可点击那三种当底,但**不带让位那一段**:让位是加载态插队的机制
         * (更短的时间常数,天生更急),换形用例根本不经过它 —— 把它算进文本那条路
         * 的门槛,等于凭空给 17px² 的余量,尺子就被顶穿了(实测那样会到 100.9,
         * 而「不收回直接换形」才 160)。
         */
        const vCore = Math.max(risePeak, fallPeak, swayPeak);
        const bLimit = limitOf(Math.max(vCore, burstUp, burstDown));
        const tLimit = limitOf(Math.max(vCore, beamUp, beamDown));
        console.log(`  基线单帧翻黑量峰值(一颗 R0 的球面积 ≈ ${fmt(Math.PI * R0 * R0, 0)}px²,` +
            `翻黑量就是这一帧和上一帧差了多少 px² 的黑):` +
            `\n    可点击 起 ${fmt(risePeak, 1)}  收 ${fmt(fallPeak, 1)}  蠕动 ${fmt(swayPeak, 1)}  让位 ${fmt(yieldPeak, 1)}  → 门槛 ${fmt(vLimit, 1)}` +
            `\n    不可点击 起 ${fmt(burstUp, 1)}  收 ${fmt(burstDown, 1)}  → 门槛 ${fmt(bLimit, 1)}` +
            `\n    文本 起 ${fmt(beamUp, 1)}  收 ${fmt(beamDown, 1)}  → 门槛 ${fmt(tLimit, 1)}(自然峰值 + ${MARGIN}px² 余量)`);

        /*
         * 把「这道门要拦的东西」量出来当尺子 —— 门槛离它有多远,是这道门还剩多少
         * 本事的唯一凭据。
         */
        const refFx = sandbox().FX();
        const cutRef = frameDiff(
            asFrame(refFx.sampleViscous(0, 1).balls),
            asFrame(refFx.sampleBeam(16.7, 0.181).balls), R0);
        console.log(`    尺子:不收回直接换成文本要 ${fmt(cutRef, 1)}px²(满状态对满状态 366,`
            + `不可点击那一族 978)`);
        /*
         * 这一条是**给这道门自己把关**的:门槛要是高到比硬切还高,这一整节就白验了。
         *
         * 0.75 是 2026-09-18 跟着形状一起改的。旧的 0.6 是在「竖线」上定的 ——
         * 那会儿文本退场的自然峰值只有 70 上下,门槛落在硬切的 0.54。换成两颗球之后
         * (见第 4 节)这一格**自己的退场**翻了 93.4:轮廓大了,同一帧里动的像素就多
         * (退场第一帧 q 从 1 一步走到 0.879,两颗球连同中间那一丝一起往中间挪),
         * 于是门槛涨到 110.3,和硬切 161 的比成了 0.685。
         *
         * 这不是判据松了,是它跟着一个更大的形状走 —— 而且仍然是**比隔壁那条路还紧**
         * 的一档:不可点击那一路的门槛 779.4 是它自己硬切代价(978)的 0.80,一直如此。
         *
         * 0.75 就是 120.75,离实测的 110.3 只留 9.5px² —— 自然峰值再涨 9% 就报。
         */
        check("门槛压在「不收回直接换形」的四分之三以下(不然这道门拦不住硬切)",
            tLimit < cutRef * 0.75, `${fmt(tLimit, 1)} < ${fmt(cutRef * 0.75, 1)}`);

        // 在上升途中的几个时刻改意图,量接下来的单帧变化
        for (const at of [20, 60, 120, 200]) {
            const sb = sandbox();
            const e = sb.btn();
            sb.hover(e);
            sb.advance(at);
            const qHere = sb.q();
            sb.unhover(e);
            const jump = maxDiffDuring(sb, 500, R0);
            check(`上升 ${at}ms(此刻 q=${fmt(qHere, 2)})时收手不跳`, jump <= vLimit,
                `峰值 ${fmt(jump, 1)}px²/帧 ≤ ${fmt(vLimit, 1)}`);
        }

        // 满状态中途换成另一个状态,也不许跳
        for (const at of [200, 800, 2000]) {
            const sb = sandbox();
            const a = sb.btn();
            const b = sb.block({ "--cursor": "not-allowed" });
            sb.hover(a);
            sb.advance(at);
            sb.unhover(a);
            sb.hover(b);
            const jump = maxDiffDuring(sb, 900, R0);
            check(`满状态 ${at}ms 时换成不可点击不跳`, jump <= bLimit,
                `峰值 ${fmt(jump, 1)}px²/帧 ≤ ${fmt(bLimit, 1)}(该路上最猛的自然一帧是 ${fmt(Math.max(burstUp, burstDown), 1)})`);
        }

        // 换成文本也一样 —— 这条路是「一坨」到「一条」,形状跨得最远,更得盯住
        for (const at of [200, 800, 2000]) {
            const sb = sandbox();
            const a = sb.btn();
            const b = sb.block({ "--cursor": "text" });
            sb.hover(a);
            sb.advance(at);
            sb.unhover(a);
            sb.hover(b);
            const jump = maxDiffDuring(sb, 900, R0);
            check(`满状态 ${at}ms 时换成文本不跳`, jump <= tLimit,
                `峰值 ${fmt(jump, 1)}px²/帧 ≤ ${fmt(tLimit, 1)}(该路上最猛的自然一帧是 ${fmt(Math.max(beamUp, beamDown), 1)})`);
        }

        // 指针还没出现过的时候,来事件也不该乱动
        const sb = sandbox();
        sb.noPointer();
        const e = sb.btn();
        sb.hover(e);
        sb.advance(200);
        check("指针没出现过就不进状态", sb.state() === "" && sb.q() === 0 && sb.rafCount() === 0,
            `state=${sb.state()} q=${fmt(sb.q(), 4)} raf=${sb.rafCount()}`);

        // 移出文档直接收,不收尾
        const sb2 = sandbox();
        const e2 = sb2.btn();
        sb2.hover(e2);
        sb2.advance(500);
        sb2.leaveDoc();
        sb2.advance(20);
        check("指针移出文档立刻收干净", sb2.rafCount() === 0 && sb2.state() === "" && !sb2.ballHidden(),
            `raf=${sb2.rafCount()} state=${sb2.state()}`);
        sb2.hover(e2);
        sb2.advance(300);
        check("移回来还能重新起来", sb2.state() === "viscous", sb2.state());
    }

    // =====================================================================
    section("9. 换页之后指针底下那块元素");
    {
        const sb = sandbox();
        const el = sb.btn();
        sb.setHit(el);
        // 指针没动过,一个 pointerover 都不会来 —— 只能靠 refresh 主动问一次
        sb.refresh();
        sb.advance(300);
        check("refresh 能把静止指针底下那块认出来", sb.state() === "viscous", sb.state());

        sb.unhover(el);
        sb.advance(700);

        // 元素被移出文档了,指针还停在原地 —— 意图要跟着消失
        sb.setHit(null);
        sb.refresh();
        sb.advance(20);
        check("指针底下空了就没有状态", sb.D().want === "", sb.D().want);

        // 按下时位置和缩放跟着 press 走(壳的缩放系数和 #latex-ball 是同一个)
        const e3 = sb.btn();
        sb.setHit(e3);
        sb.refresh();
        sb.advance(300);
        sb.setPress(1);
        sb.step();
        const t = sb.wraps()[0].style.transform || "";
        check("壳的缩放和按下的系数一致(1 − press·0.14)",
            /scale\(0\.8600\)/.test(t), t);
        sb.setPress(0);
    }

    // =====================================================================
    section("10. prefers-reduced-motion 下根本不进这个状态");
    {
        const sb = sandbox({ reduce: true });
        check("自己知道被跳过了", sb.D().skipped === true);
        const el = sb.btn();
        sb.hover(el);
        sb.advance(400);
        check("可点击也不起状态", sb.state() === "" && sb.q() === 0, `state=${sb.state()}`);
        check("不建图层、不起 rAF", sb.wraps().length === 0 && sb.rafCount() === 0,
            `layers=${sb.wraps().length} raf=${sb.rafCount()}`);
        check("球一直没被藏起来", !sb.ballHidden());

        /*
         * 让位那条规矩也得跟着停。
         *
         * 减少动效的时候这台主题整个不接手 —— 那就不该由它来决定「原版鼠标该不该
         * 出来」。两边各按各的走会很难查:这一页上什么都没画,却有一只手在改
         * documentElement 上的类和属性。
         */
        const h = sb.block({ "--cursor": "help" });
        sb.hover(h);
        sb.advance(200);
        check("减少动效时不让位(它本来就什么也不接手)",
            sb.D().realCursor === "" && !sb.documentElement.classList.contains("show-real-cursor"),
            `realCursor=${sb.D().realCursor}`);
    }

    // =====================================================================
    section("13. 画不出来的标准光标:原版鼠标让回来,球留着");
    {
        /*
         * 用户定的规矩,原话:「除非该状态没有对应鼠标效果,否则自动隐藏原版鼠标」。
         * 反过来读就是这一节:**画不出来,就把位置让回去**。
         *
         * 这条规矩接的正是清单上「不认领 crosshair / help / zoom」那几行。以前不认领
         * 等于「什么都不做」:原版鼠标被 skin-ui.css 那条 !important 藏着,我们也没画,
         * 指针那会儿看着像能点、点下去却是另一回事 —— 撒谎。现在不认领是「让原来的
         * 光标出来说话」。
         *
         * 让位要验的**结果**只有三件,而且缺一不可:
         *   1. documentElement 上挂出了 show-real-cursor(那条 !important 的规矩靠它
         *      才被打赢 —— skin-ui.css 里那一句 specificity 比藏光标那句高);
         *   2. --real-cursor 报的是**那个元素要的那个值**(不是「随便一个箭头」);
         *   3. 球**留着**(用户选的)—— 让位的时候我们什么都没收走,两个光标同时在场。
         *
         * 第 3 件最容易被写「干净」:顺手把球藏掉看着更讲究,但那就成了「我们替他
         * 做决定」。用户明确说要留着。
         */
        const sb = sandbox();
        const root = sb.documentElement;
        const realOn = () => root.classList.contains("show-real-cursor");
        const realVal = () => root.style.getPropertyValue("--real-cursor");

        check("hover.js 报出了标准光标整表(让位那条规矩要能一条条验)",
            sb.win.HoverWatch.REAL_CURSORS.size >= 30,
            `${sb.win.HoverWatch.REAL_CURSORS.size} 个`);

        // 一块没提要求的元素:照旧藏原版鼠标 —— 我们确实有东西要画(那颗球)
        const plain = sb.block({});
        sb.hover(plain);
        sb.advance(60);
        check("没提要求的元素不让位(默认样子就是那颗球)",
            !realOn() && realVal() === "", `realCursor=${sb.D().realCursor}`);

        // 画不出来的标准光标 → 让位,而且球留着
        for (const val of ["crosshair", "help", "context-menu", "wait"]) {
            const e = sb.block({ "--cursor": val });
            sb.hover(e);
            sb.advance(60);
            check(`--cursor:${val} → 原版鼠标让回来,而且报的就是这个值`,
                sb.D().realCursor === val && realOn() && realVal() === val,
                `realCursor=${sb.D().realCursor} 类=${realOn()} 属性=${realVal()}`);
            check(`--cursor:${val} → 球留着(不是把我们的光标收走)`, !sb.ballHidden());
            check(`--cursor:${val} → 我们确实什么都没画`,
                sb.D().want === "" && sb.rafCount() === 0, `want="${sb.D().want}" raf=${sb.rafCount()}`);
            sb.unhover(e);
            sb.advance(60);
        }

        /*
         * 抓取那一族现在**不让位了** —— 它们有自己的形状了(用户把上一次「撤掉」
         * 推翻了,见第 1 节)。所以它们从「让位那一队」挪到了下面就那一队里。
         * 这里留一条反向断言:整表在、但认得出来的那些值一个都不该让位。
         */
        for (const val of ["move", "grab", "grabbing", "all-scroll", "zoom-in", "zoom-out"]) {
            const e = sb.block({ "--cursor": val });
            sb.hover(e);
            sb.advance(60);
            check(`${val} 有形状了,不再让位(${sb.win.HoverWatch.MAP[val]})`,
                !realOn() && sb.D().realCursor === "",
                `realCursor=${sb.D().realCursor}`);
            sb.unhover(e);
            sb.advance(900);
        }

        // 让位是**此刻**的判断,不是一次性的:换一块没提要求的元素就收回去
        const x = sb.block({ "--cursor": "crosshair" });
        sb.hover(x);
        sb.advance(60);
        check("先让位了", realOn() && realVal() === "crosshair");
        sb.hover(plain);
        sb.advance(60);
        check("换到没提要求的元素上,原版鼠标收回去(球自己说得清)",
            !realOn() && realVal() === "", `realCursor=${sb.D().realCursor}`);

        // 有形状要画的值一个都不让位 —— 每一条都得真的画出东西来
        for (const val of ["pointer", "not-allowed", "no-drop", "text", "ew-resize", "nwse-resize"]) {
            const e = sb.block({ "--cursor": val });
            sb.hover(e);
            sb.advance(500);
            check(`--cursor:${val} 有自己的形状,不让位`,
                !realOn() && sb.D().realCursor === "", `realCursor=${sb.D().realCursor}`);
            check(`--cursor:${val} 确实画了东西`, sb.D().want !== "" && sb.rafCount() > 0,
                `want=${sb.D().want} raf=${sb.rafCount()}`);
            sb.unhover(e);
            sb.advance(900);
        }

        /*
         * 让位的判据是「此刻**有没有形状要画**」,不是「指针底下那块能不能画」。
         *
         * 所以宿主从外面开着缩放的时候,指针即使划过一个 help 元素,也不该让位 ——
         * 那会儿我们有形状要画(那条正在缩放的边),让位会让两只光标同时在动。
         */
        const sb2 = sandbox();
        const h2 = sb2.block({ "--cursor": "help" });
        sb2.hover(h2);
        sb2.advance(60);
        check("指针底下是 help:先让位了", sb2.documentElement.classList.contains("show-real-cursor"));
        sb2.win.HoverWatch.setResize("ew-resize");
        sb2.advance(60);
        check("宿主说在缩放:形状要画,原版鼠标收回",
            !sb2.documentElement.classList.contains("show-real-cursor") && sb2.D().realCursor === "",
            `realCursor=${sb2.D().realCursor} ${sb2.D().axis}°`);
        sb2.win.HoverWatch.setResize(null);
        sb2.advance(60);
        check("关掉之后又让位(指针底下还是 help)",
            sb2.documentElement.classList.contains("show-real-cursor") && sb2.D().realCursor === "help",
            `realCursor=${sb2.D().realCursor}`);

        // 手里按着一条边的时候同理
        const sb3 = sandbox();
        const grip3 = sb3.block({ "--cursor": "ns-resize" });
        const help3 = sb3.block({ "--cursor": "help" });
        sb3.hover(grip3);
        sb3.down(grip3);
        sb3.advance(300);
        sb3.hover(help3);
        sb3.advance(120);
        check("手里按着一条边时划过 help 也不让位(那会儿有形状要画)",
            sb3.D().held === true && !sb3.documentElement.classList.contains("show-real-cursor")
            && sb3.D().realCursor === "",
            `held=${sb3.D().held} realCursor=${sb3.D().realCursor}`);
        sb3.up(help3);
        sb3.advance(120);
        check("松手之后立刻让位(指针底下是 help)",
            sb3.documentElement.classList.contains("show-real-cursor") && sb3.D().realCursor === "help",
            `realCursor=${sb3.D().realCursor}`);
    }

    // =====================================================================
    section("11. 认领表:自己说是什么状态,画的时候就得是那个");
    {
        /*
         * 这是加第三个状态时**真的踩到过**的那个坑:映射表和画法分在两处,加一行
         * 只改了映射、没改画法,于是新状态被静默地按旧形状画出来 —— 指针照样跟着动、
         * 照样变形,只是形状不是它该有的那个,而且不报错、不崩、测试全绿。
         *
         * 现在两样合并成一张 INTENT 表了,但「合并」这件事本身没人盯着:照样能写出
         * `{ state: "beam", draw: (fx,te,q) => fx.sampleViscous(te,q) }` 这种自相矛盾
         * 的一行。所以这里不看表怎么写的,直接**让它画一次**,看它到底调了哪个采样函数。
         */
        const sb = sandbox();
        const INTENT = sb.win.HoverWatch.INTENT;
        const FX = sb.FX();
        const names = Object.keys(INTENT);
        check("认领表不是空的", names.length > 0, `${names.length} 个值`);

        /*
         * 探针必须把引擎里**每一个**采样函数都摆上,而且这份名单是从引擎自己
         * 列出来的,不是手抄的。
         *
         * 手抄的代价上次真的付过一次:加放大缩小时漏摆了 sampleZoom,那一格的 draw
         * 于是去调一个不存在的函数 —— 而报出来的错是「fx.sampleZoomIn is not a
         * function」,崩在 hover.js 里,看着像引擎缺函数,其实是这张探针表没跟上。
         * 从引擎列就没有「漏摆」这回事:引擎加了新采样函数,这里自动多一个探针,
         * 认领表里谁没对着它画,当场报,而不是崩。
         */
        const SAMPLERS = Object.keys(FX).filter((k) => /^sample[A-Z]/.test(k));
        check("引擎的采样函数都摆上了探针", SAMPLERS.length >= 6, `${SAMPLERS.length} 个`);
        for (const val of names) {
            const def = INTENT[val];
            const called = [];
            const probe = {};
            for (const m of SAMPLERS) probe[m] = () => { called.push(m); return { balls: [] }; };
            def.draw(probe, 0, 1);
            const want = "sample" + def.name[0].toUpperCase() + def.name.slice(1);
            check(`意图 ${val} 说自己是 ${def.name},画的也真是 ${want}`,
                called.length === 1 && called[0] === want,
                called.length ? called.join(",") : "一个采样函数都没调");
        }

        // 状态名反过来也得在引擎里真的存在,不然那张名字表指向空气
        for (const s of new Set(names.map((k) => INTENT[k].name))) {
            const m = "sample" + s[0].toUpperCase() + s.slice(1);
            check(`引擎里真有 ${m}`, typeof FX[m] === "function", typeof FX[m]);
        }

        // 外面看的那份 MAP 必须就是这张表推出来的,不能是另抄的一份
        const MAP = sb.win.HoverWatch.MAP;
        const drifted = names.filter((k) => MAP[k] !== INTENT[k].name);
        check("HoverWatch.MAP 和 INTENT 没有漂开", drifted.length === 0,
            drifted.length ? drifted.join(",") : `${names.length} 个都对得上`);

        /*
         * 每一格的「是不是线、朝哪儿」也要和引擎那份表对上。
         *
         * 这是加了方向之后**新长出来**的一类错:方向和画法分在两处 —— 表里写着
         * axis: 90,画法却闭包着 0°,两样都不报错,只有把指针放上去才看得见
         * 「按上下边出来一条横线」。所以逐个比:能按住的那一族(hold),axis 必须
         * 等于引擎 RESIZE_AXIS 里那个值说的度数;别的状态一律不许有 axis。
         *
         * axis 的含义是「按下这条边能锁住方向」。文本按下去是开始拖选、不该锁住方向,
         * 所以它不留 axis —— 这一条同时把「text 偷偷混进缩放族」也挡住了。
         * (它原来也是「一条线」,2026-09-18 改成两颗球之后连形状都不同族了 —— 见第 4 节。
         *  这一条判据本身一个字不用改:它从来只问「带不带 axis」。)
         */
        const RESIZE_AXIS = FX.RESIZE_AXIS;
        const held = names.filter((k) => INTENT[k].hold);
        const stray = names.filter((k) => !!INTENT[k].hold !== (INTENT[k].axis !== null));
        check("只有能按住的那一族带 axis,别的都不带(文本也不带)", stray.length === 0,
            stray.length ? stray.join(",") : `${held.length} 格带 axis`);
        const wrongAxis = held.filter((k) => INTENT[k].axis !== RESIZE_AXIS[k]);
        check("每一格的 axis,就是引擎 RESIZE_AXIS 说的那个度数", wrongAxis.length === 0,
            wrongAxis.length
                ? wrongAxis.map((k) => `${k}:${INTENT[k].axis}≠${RESIZE_AXIS[k]}`).join(",")
                : `${held.length} 格都对得上`);
        check("能按住的那一族就是引擎那张表的全部(一个不多、一个不少)",
            held.length === Object.keys(RESIZE_AXIS).length,
            `${held.length} vs 引擎 ${Object.keys(RESIZE_AXIS).length}`);
        const degs = new Set(held.map((k) => INTENT[k].axis));
        check("四个角度都有(横 / 竖 / 两个对角)",
            degs.size === 4 && degs.has(0) && degs.has(90) && degs.has(45) && degs.has(-45),
            [...degs].sort((a, b) => a - b).join("°, ") + "°");

        /*
         * 同一格身份(key)的规矩,一句正、一句反:
         *   - 形状一样就得**相等**(ew-resize = col-resize)—— 相等才不收拢,不然
         *     同一根线白收一次再长回来;
         *   - 方向不同就不能相等(resize:0 ≠ resize:90)—— 不等才会先收拢,而那个
         *     收拢正是「换轴不硬跳」的全部机制。
         */
        check("同一角度的两个值共用同一个 key(换了不收拢)",
            INTENT["ew-resize"].key === INTENT["col-resize"].key,
            `${INTENT["ew-resize"].key} / ${INTENT["col-resize"].key}`);
        check("不同角度的 key 各不相同(换了要先收拢)",
            new Set(["ew-resize", "ns-resize", "nwse-resize", "nesw-resize"].map((v) => INTENT[v].key)).size === 4,
            ["ew-resize", "ns-resize", "nwse-resize", "nesw-resize"].map((v) => INTENT[v].key).join(" / "));
        check("一坨 / 一圈 / 两颗球 三个身份互不相同,而且都不带 axis",
            INTENT.pointer.key === "viscous" && INTENT["not-allowed"].key === "burst"
            && INTENT.text.key === "beam"
            && new Set([INTENT.pointer.key, INTENT["not-allowed"].key, INTENT.text.key]).size === 3
            && !INTENT.pointer.axis && !INTENT.text.axis,
            `${INTENT.pointer.key} / ${INTENT["not-allowed"].key} / ${INTENT.text.key}`);

        /*
         * 抓取那一族「要回来」在表里留下的痕迹。用户的原话是「抓取中也用这个,
         * 可抓取的效果用可点击特效」,于是四个值分两半:
         *   grab                        → 和 pointer **同一个 key**(viscous);
         *   grabbing / move / all-scroll → 和「按住」是**同一个对象**。
         * 后半句比 key 更强:同一个对象的话,状态机连 key 都不用比。
         */
        check("grab 和 pointer 是同一格(同一个形状,换过去不收拢)",
            INTENT.grab.key === INTENT.pointer.key && INTENT.grab.name === "viscous",
            `${INTENT.grab.key} / ${INTENT.grab.name}`);
        check("grabbing / move / all-scroll 就是「按住」那一格本身(连对象都同一个)",
            INTENT.grabbing === INTENT.move && INTENT.move === INTENT["all-scroll"]
            && INTENT.grabbing.key === "splat" && INTENT.grabbing.fast === true,
            `${INTENT.grabbing.key} fast=${INTENT.grabbing.fast} 同一个=${INTENT.grabbing === INTENT.move}`);

        // 放大缩小:一族一个名字,方向进 key —— 和拖动缩放那条线同一套写法
        check("zoom-in / zoom-out 名字相同、key 不同(是同族两个方向,不是一个状态两个字)",
            INTENT["zoom-in"].name === "zoom" && INTENT["zoom-out"].name === "zoom"
            && INTENT["zoom-in"].key === "zoom:in" && INTENT["zoom-out"].key === "zoom:out",
            `${INTENT["zoom-in"].name}:${INTENT["zoom-in"].key} / ${INTENT["zoom-out"].key}`);

        /*
         * 「按下不换形状」的那三族在表里标 noPress:文本(按下是开始拖选)、
         * 不可点击(按下去什么都不会发生)。
         *
         * 拖动缩放**不在**这一列:它靠的是 hold + heldEntry 排在最前面(按下就锁住了),
         * 不需要再标一次 —— 标了反而多一条能漂开的判据。别的值一个都不许带:
         * 带了就等于「按下去没反应」。
         */
        const noPress = names.filter((k) => INTENT[k].noPress).sort();
        check("标了 noPress 的就是文本和不可点击那几个",
            noPress.join(",") === "no-drop,not-allowed,text", `${noPress.length} 个:${noPress.join(",")}`);

        const REAL = sb.win.HoverWatch.REAL_CURSORS;
        check("认领表里每一个值都在标准光标整表里(没有「认领了却让位不了」的值)",
            names.every((k) => REAL.has(k)),
            names.filter((k) => !REAL.has(k)).join(",") || `${names.length} 个都在`);
        check("标准光标整表里没有 auto / default / none(它们是「随大流」,不是「要个箭头」)",
            !["auto", "default", "none"].some((v) => REAL.has(v)));
    }

    // =====================================================================
    section("12. 拖动缩放:同一根线转到各自的轴上,按住不放,而且宿主可以从外面打开它");
    {
        /*
         * 用户对这一条纠正过两次,最后说全了:**拖动缩放** —— 不是网页里某个能拖的
         * 元素,是**拖窗口/面板的边缘改尺寸**;而且「跟着缩放轴,含对角」。
         * 还有一件事留在这一族里:**这套光标可能不止在浏览器用**。
         *
         * 所以这一节验四样东西,验法各不相同:
         *
         *   方向  → 不是「看着挺像」,是**逐球相等**:把 90° 那一帧按 (deg−90°) 转
         *           过去,必须等于 deg 那一帧。同一组参数、同一条材料曲线、同一个
         *           采样函数,只有角度不同 —— 差一个像素都说明这句话不成立。
         *           (转的是 **90° 那条线**,不是文本那一格:2026-09-18 起文本是两颗球,
         *            不再和这一族共用一个形状 —— 见第 4 节。)
         *   角度覆盖 → 从引擎那张 RESIZE_AXIS 逐条生成,4 个角度都真的量一遍
         *           (只验「认成 resize 了」的话,14 个值全画成 0° 也照样通过)。
         *   尺寸  → 线那几句判据照抄到每一个角度上,但**在线自己的坐标系里量**:
         *           长 ≫ 短、窄过球、长短比 ≥ 2.5、沿线连成一笔。这几句是可以直接读的
         *           规格,谁把轴写错了一看就知道是哪一句红的。
         *   按住  → 按下的那一格锁住形状(划过别的元素、划过别的轴都不许动),
         *           松手才交给指针底下那块。
         *
         * 「方向」和「尺寸」两组都得留着,因为各自都能单独抓到东西(拿站点副本试过):
         *   - 忘了换轴(复制粘贴时最常犯的错):逐球相等那一条会红。
         *   - 轴对了、却给另一条轴另开一套参数(半径偏 2%):尺寸那几句照样可能全绿
         *     —— 它只是一根稍微胖点的线 —— 只有逐球相等会红。
         *
         * 最后一样是「不止在浏览器用」留下的东西:setResize(值名)。它没有形状可言,
         * 所以验的不是画出来什么样,而是**这个开关的定义** —— 见下面那一小段。
         *
         * 量长短边必须转回**线自己的坐标系**(lineAxes),不能量轴对齐的宽高:
         * 45° 那条线用轴对齐的框量出来近似正方形(和 26px 的球差不多大),
         * 「长 ≫ 短」在那一格会变成「两条边差不多」,方向错得再离谱也量不出来。
         */
        const sb = sandbox();
        const el = sb.block({ "--cursor": "ew-resize" });
        sb.hover(el);
        sb.advance(420);

        const d = sb.D();
        check("状态是 resize", d.state === "resize", d.state);
        check("方向报的是 0°(左右那条边)", d.axis === 0, String(d.axis));
        check("球被藏起来了", sb.ballHidden());

        // 和上面几个状态同一条要求:帧必须**就是引擎的输出**
        const want = sb.FX().sampleResize(d.te, d.q, 0).balls;
        const diff = ballDiff(want, sb.frames());
        check("屏幕上的球和引擎 sampleResize(…, 0) 逐球一致", near(diff, 0, 0.01),
            `最大差 ${fmt(diff, 4)}px`);

        // ── 尺寸 + 材料,在**线自己的坐标系**里量 ──
        let maxAreaErr = 0, maxCover = -1e9, minBalls = 99, maxGap = -1e9;
        let minLong = 1e9, maxLong = 0, minShort = 1e9;
        for (let t = 0; t < 2400; t += 60) {
            sb.advance(60);
            const fr = sb.frames();
            // 材料曲线问引擎要,不在这里重抄一遍(理由同第 4 节)
            const w = Math.PI * R0 * R0 * sb.FX().lineMass(sb.q());
            maxAreaErr = Math.max(maxAreaErr, Math.abs(area(fr, R0) / w - 1) * 100);
            maxCover = Math.max(maxCover, cover(fr, R0));
            minBalls = Math.min(minBalls, visible(fr).length);
            const m = lineAxes(fr, R0, 0);
            minLong = Math.min(minLong, m.long);
            maxLong = Math.max(maxLong, m.long);
            minShort = Math.min(minShort, m.short);
            maxGap = Math.max(maxGap, m.gap);
        }
        // 线这一族走的是**自己那条**材料曲线(lineMass 0.50),不再是文本那条
        // (textMass 0.689)—— 2026-09-18 拆的家,两边各一条,见 CFG 里 LINE_* / TEXT_*
        check("面积走的是线那一族自己的曲线(lineMass,偏差 < 0.5%)", maxAreaErr < 0.5,
            `${fmt(maxAreaErr, 3)}%`);
        check("中心是实的", maxCover < 0, `最靠内 ${fmt(maxCover)}px`);
        check(`${sb.FX().CFG.LINE_COUNT} 团都画得出来`, minBalls === sb.FX().CFG.LINE_COUNT, String(minBalls));

        // 判据是**同一把尺子**量在所有角度上,只是各自转回自己的坐标系里(阈值一个字不改)
        const ball = 2 * R0;
        check("沿线够长(比球长)", minLong > ball * 1.15, `最短 ${fmt(minLong)}px > ${fmt(ball * 1.15)}px`);
        check("垂直轴够窄(比球窄)", minShort < ball * 0.45, `最宽 ${fmt(minShort)}px < ${fmt(ball * 0.45)}px`);
        check("长短比够「线」(≥ 2.5)", maxLong / minShort >= 2.5,
            `${fmt(maxLong)}/${fmt(minShort)} = ${fmt(maxLong / minShort)}`);
        check("整条压在 1.35 x 0.45 个球以内(和 90° 那条线同一把尺子,转到 0° 上量)",
            maxLong < ball * 1.35 && minShort < ball * 0.45,
            `${fmt(maxLong)} x ${fmt(minShort)}px  (球 ${ball}px)`);
        check("沿线方向相邻两团始终重叠(连成一笔,不是一串珠子)", maxGap < 0, `最大的缝 ${fmt(maxGap)}px`);

        /*
         * ── 逐球相等:deg 那条线 = 90° 那条线整体转 (deg−90°) ──
         *
         * 引擎里那条等式是精确的(见 cursor-fx.js 的 sampleLine 注释):
         *   ballset(deg) = R(deg−90°) · ballset(90°)
         *
         * 转的**只有坐标**,别的什么都不动 —— 半径、缩放、团数、顺序全都不许变。
         * 为什么不写成「45° 的长边等于 90° 那条线的高」那种两两比较:那只盯着外接
         * 矩形,中间任何一团跑到别处都发现不了。逐球比才对得上「同一次挤压」这句话。
         *
         * 参照系是 **90° 那条线**,不是文本那一格:2026-09-18 之前这两个是同一个形状
         * (所以那时拿 sampleBeam 当参照是合法的),现在文本是两颗球,拿它当参照这条
         * 判据会整条红 —— 而红的原因是判据自己没跟上,不是形状坏了。
         *
         * 除了表里那四个角度,再随手挑两个**表里没有**的角度(30° / −70°):认领表
         * 只有四个值,但形状是连续的 —— 只验那四个,一条「先把角度取整到 45 的倍数」
         * 的偷懒实现照样全绿。
         *
         * 容差取 1e-6px:两边走的是同一段代码、同一组浮点运算,差别只可能来自
         * fitArea 里按射线累加时的求和顺序,量级在 1e-13 以下。真要是方向写反、
         * 角度算错或参数漂了,差的是好几个像素,中间没有灰色地带。
         */
        const fx = sb.FX();
        const angles = [90, 0, 45, -45, 30, -70];
        let worst = 0, cases = 0, worstAt = "";
        for (let t = 0; t < 2400; t += 120) {
            for (const q of [0.08, 0.13, 0.29, 0.4, 0.62, 0.85, 0.94, 1]) {
                const ref = fx.sampleResize(t, q, 90).balls;
                for (const deg of angles) {
                    const g = fx.sampleResize(t, q, deg).balls;
                    cases++;
                    if (g.length !== ref.length) { worst = Infinity; worstAt = `${deg}° 团数对不上`; continue; }
                    for (let i = 0; i < ref.length; i++) {
                        const r = rot(ref[i].x, ref[i].y, deg - 90);
                        const e = Math.max(Math.abs(g[i].x - r.x), Math.abs(g[i].y - r.y),
                            Math.abs(g[i].scale - ref[i].scale));
                        if (e > worst) { worst = e; worstAt = `${deg}° @ te=${t} q=${q}`; }
                    }
                }
            }
        }
        check(`任何角度都逐球等于 90° 那条线转过去(${angles.length} 个角度 × ${cases / angles.length} 组 te/q)`,
            worst <= 1e-6, `最大差 ${worst}${worstAt ? `  (${worstAt})` : ""}`);

        /*
         * 45° 那一格还得单独量一次:它是「含对角」这句话的照妖镜。
         *
         * 轴对齐的框量不出它 —— 45° 的长边在 x 和 y 上都投一份,量出来近似正方形。
         * 这里用 lineAxes(…, 45) 转回去量,于是「长 33 / 窄 10.7」那一组数在 45° 上
         * 也必须成立。一个只会画 0/90 的实现(或者「把角度四舍五入到最近的直角」)
         * 在这里当场红。
         */
        const sb45 = sandbox();
        const el45 = sb45.block({ "--cursor": "nwse-resize" });
        sb45.hover(el45);
        sb45.advance(420);
        check("--cursor:nwse-resize 认下来是 45°", sb45.D().axis === 45, String(sb45.D().axis));
        let m45 = { long: 1e9, short: 1e9, gap: -1e9 }, m45max = 0;
        for (let t = 0; t < 2400; t += 60) {
            sb45.advance(60);
            const m = lineAxes(sb45.frames(), R0, 45);
            m45 = { long: Math.min(m45.long, m.long), short: Math.min(m45.short, m.short),
                gap: Math.max(m45.gap, m.gap) };
            m45max = Math.max(m45max, m.long);
        }
        check("45° 上和 0° 同一组数:比球长、比球窄、连成一笔、压在 1.35 x 0.45 个球以内",
            m45.long > ball * 1.15 && m45.short < ball * 0.45 && m45.gap < 0
            && m45max < ball * 1.35 && m45max / m45.short >= 2.5,
            `长 ${fmt(m45.long)}–${fmt(m45max)} 窄 ${fmt(m45.short)} 缝 ${fmt(m45.gap)}px`);
        check("轴对齐的框量不出这条线(所以非转回自己的坐标系不可)",
            (() => {
                const [lo, hi] = bbox(sb45.frames(), R0);
                const w = hi.x - lo.x, h = hi.y - lo.y;
                // 45° 的那条线,轴对齐量出来是个近似的方 —— 和 26px 的球差不多大,
                // 拿它判「长 ≫ 短」会得出「两条边差不多」,方向错了也量不出来
                return Math.abs(w - h) < ball * 0.15 && Math.min(w, h) < ball * 1.1;
            })(), (() => {
                const [lo, hi] = bbox(sb45.frames(), R0);
                return `${fmt(hi.x - lo.x)} x ${fmt(hi.y - lo.y)}px`;
            })());

        /*
         * ── 按住不放 ──
         *
         * 这一条要连着好几步才看得出:停在一条边上 → 按下 → 把指针划到**别的元素**上
         * (形状不许动)→ 再划到**另一条轴**的边上(还是不许动)→ 在别处松手(这时才
         * 换成那块该有的形状)。
         *
         * 「划到按钮上不许动」判决的是清单的优先级第 1 条(缩放中盖过一切):那一刻
         * 决定形状的已经不是「指针底下是什么」,而是「手上正按着哪条边」。
         * 「划到另一条轴上也不许动」是这条规矩更狠的一面:连**同一族里方向不同**的
         * 那一格都不许顶替,不然拖到一半会看见线自己转过去。
         */
        const sb2 = sandbox();
        const gripE = sb2.block({ "--cursor": "ew-resize" });
        const gripS = sb2.block({ "--cursor": "ns-resize" });
        const btnEl = sb2.btn();
        const textEl = sb2.block({ "--cursor": "text" });

        sb2.hover(gripE);
        sb2.advance(420);
        check("停在右边那条边上:resize、0°、q 到位",
            sb2.state() === "resize" && sb2.D().axis === 0 && near(sb2.q(), 1, 0.02),
            `${sb2.state()} ${sb2.D().axis}° q=${fmt(sb2.q(), 3)}`);
        check("没按下时不算「按着一条边」", sb2.D().held === false);

        sb2.down(gripE);
        sb2.advance(200);
        check("按下去还是同一个形状(没有收拢再长出来)",
            sb2.state() === "resize" && sb2.D().axis === 0 && near(sb2.q(), 1, 0.02),
            `${sb2.state()} ${sb2.D().axis}° q=${fmt(sb2.q(), 3)}`);
        check("自己知道手上按着一条边(而且是哪一条)", sb2.D().held === true && sb2.D().heldKey === "resize:0",
            `held=${sb2.D().held} key=${sb2.D().heldKey}`);

        // 按着的时候划过按钮、正文,再划过另一条轴上的边,形状一个都不许变
        let minQ = 1;
        for (const other of [btnEl, textEl, gripS]) {
            sb2.hover(other);
            for (let t = 0; t < 600; t += 60) {
                sb2.advance(60);
                minQ = Math.min(minQ, sb2.q());
                if (sb2.state() !== "resize" || sb2.D().axis !== 0) break;
            }
        }
        check("按着 0° 那条边的时候划过按钮 / 正文 / 90° 那条边,形状一直是 0°",
            sb2.state() === "resize" && sb2.D().axis === 0,
            `${sb2.state()} ${sb2.D().axis}°`);
        check("中途 q 一点没掉(不是收拢了才没跳)", minQ > 0.98, `最低 q=${fmt(minQ, 4)}`);
        check("按着时画出来的还是那条 0° 的线", (() => {
            const dd = sb2.D();
            return near(ballDiff(sb2.FX().sampleResize(dd.te, dd.q, 0).balls, sb2.frames()), 0, 0.01);
        })());

        // 松手:指针停在 90° 那条边上,那就换成竖的 —— 而这一次**该**收拢再换
        sb2.up(gripS);
        sb2.advance(120);
        check("松手以后 held 清掉了", sb2.D().held === false);
        check("松手以后形状才改主意", sb2.D().axis !== 0 || sb2.q() < 0.98,
            `${sb2.state()} ${sb2.D().axis}° q=${fmt(sb2.q(), 3)}`);
        sb2.advance(1600);
        check("最后落到指针底下那条边该有的方向(90°)",
            sb2.state() === "resize" && sb2.D().axis === 90 && near(sb2.q(), 1, 0.02),
            `${sb2.state()} ${sb2.D().axis}° q=${fmt(sb2.q(), 3)}`);

        /*
         * ── 同一角度换个值:不许重画 ──
         *
         * ew-resize / col-resize / e-resize / w-resize 四个值说的是同一条边,形状
         * 一模一样。状态机认的是 key(resize:0),所以从 ew-resize 挪到 col-resize
         * **不该收拢再长出来** —— 那一下白闪没有任何理由。
         *
         * 同一件事的反面在下一段(换角度必须收拢),两句合起来才把「key 怎么定」
         * 这件事钉住:同轴相等、异轴不等。
         */
        const sb3 = sandbox();
        const v1 = sb3.block({ "--cursor": "ew-resize" });
        const v2 = sb3.block({ "--cursor": "col-resize" });
        sb3.hover(v1);
        sb3.advance(500);
        let minQ3 = 1;
        sb3.hover(v2);
        for (let t = 0; t < 600; t += 60) { sb3.advance(60); minQ3 = Math.min(minQ3, sb3.q()); }
        check("同一角度换个值(ew-resize → col-resize)不重画", minQ3 > 0.98, `最低 q=${fmt(minQ3, 4)}`);
        check("角度还是那个角度", sb3.D().axis === 0 && sb3.state() === "resize", `${sb3.D().axis}°`);

        // ── 换成另一条轴:必须先收拢到 q≈0,再在那一帧换形 ──
        const sb4 = sandbox();
        const a4 = sb4.block({ "--cursor": "ew-resize" });
        const b4 = sb4.block({ "--cursor": "ns-resize" });
        sb4.hover(a4);
        sb4.advance(500);
        check("先在 0° 上", sb4.D().axis === 0 && near(sb4.q(), 1, 0.02), `${sb4.D().axis}°`);
        sb4.unhover(a4);
        sb4.hover(b4);
        let minQ4 = 1, axisAtSwitch = null, prevAxis = 0;
        for (let i = 0; i < 400 && sb4.rafCount() > 0; i++) {
            const qBefore = sb4.q();
            sb4.step();
            minQ4 = Math.min(minQ4, sb4.q());
            if (sb4.D().axis !== prevAxis) { axisAtSwitch = qBefore; prevAxis = sb4.D().axis; }
        }
        const EPS = sb4.win.HoverWatch.CFG.EPS;
        check("换轴前真的收拢到了 q≈0", minQ4 <= 0.05, `min q=${fmt(minQ4, 4)}`);
        check("换轴发生在 q≈0 那一帧(不是硬切) ", axisAtSwitch !== null && axisAtSwitch <= EPS,
            axisAtSwitch === null ? "没换" : `q=${fmt(axisAtSwitch, 4)} ≤ EPS=${fmt(EPS, 3)}`);
        check("换完是 90° 那条线,并长到了满状态",
            sb4.D().axis === 90 && sb4.state() === "resize" && near(sb4.q(), 1, 0.02),
            `${sb4.D().axis}° ${sb4.state()} q=${fmt(sb4.q(), 3)}`);

        /*
         * ── 宿主从外面打开这个状态:setResize(值名) ──
         *
         * 这一小段是「这套光标可能不止在浏览器用」那句话在代码里的落点。
         *
         * 为什么非要有它:浏览器里根本没有「正在拖窗口边缘」这件事可看。窗口是
         * 窗口系统在动的,网页收不到任何事件 —— 那会儿指针可能压在页面里任何一块上,
         * 也可能压根不在浏览器窗口里。所以浏览器这一侧只能做到「页面自己声明」,
         * 实情只有宿主知道,那就把开关开给宿主。
         *
         * 传的是**值名**而不是布尔:宿主本来就知道正在缩放哪条边,而「哪条边 ->
         * 哪个方向」两边都不该自己发明一套 —— 这里直接用 CSS 那套光标名字。
         *
         * 要验五件事,每一件都是这个开关的**定义**,不是形状:
         *   1. 打开就是那个形状,而且**不需要**指针底下有什么。
         *   2. 认不出来的值**不动现状**,只把此刻真正在用的那个值报回来(宁可不动,
         *      也不要按一个猜的方向画)。非缩放族的名字(pointer)也不认。
         *   3. 它和 held 是两个开关,互不清算(缩放窗口时松手,不该顺手放开手里
         *      按着的那条边)。
         *   4. 开着的时候划过别的元素,形状不许变 —— 和 held 同一条优先级。
         *   5. 指针离开文档**不算完**:缩放窗口本来就会把指针带出页面。这是整站
         *      「离开文档就当作什么都没发生」唯一的例外(理由写在 hover.js 里)——
         *      这会儿不是没人管,是换了个更知道情况的人来管。
         */
        const sb6 = sandbox();
        const setResize = sb6.win.HoverWatch.setResize;
        const btn6 = sb6.btn();
        const edge6 = sb6.block({ "--cursor": "ew-resize" });
        const txt6 = sb6.block({ "--cursor": "text" });

        check("HoverWatch 上有 setResize 这个入口", typeof setResize === "function", typeof setResize);

        sb6.hover(btn6);
        sb6.advance(420);
        check("先是一块普通可点的东西", sb6.state() === "viscous", sb6.state());

        check("setResize('nwse-resize') 把正在用的那个值报回来",
            setResize("nwse-resize") === "nwse-resize");
        sb6.advance(1400);
        check("宿主说在缩右下角:形状是 45° 那条线,哪怕指针底下是块可点的东西",
            sb6.state() === "resize" && sb6.D().axis === 45 && near(sb6.q(), 1, 0.02),
            `${sb6.state()} ${sb6.D().axis}° q=${fmt(sb6.q(), 3)}`);
        check("外面开的和「手里按着」是两回事(held 没被动过)",
            sb6.D().held === false && sb6.D().externalResize === "nwse-resize",
            `held=${sb6.D().held} externalResize=${sb6.D().externalResize}`);

        // 认不出来的值:不动现状,只把在用的那个报回来
        check("认不出来的值不改动现状,只把在用的那个报回来",
            setResize("spin-around") === "nwse-resize" && sb6.D().axis === 45,
            `${sb6.D().axis}° 报回 ${setResize("spin-around")}`);
        check("不是缩放族的名字也不认(pointer 有它自己的形状)",
            setResize("pointer") === "nwse-resize" && sb6.D().axis === 45,
            `${sb6.D().axis}° 报回 ${setResize("pointer")}`);

        // 开着的时候划过别的元素,形状一个都不许变
        let minQ6 = 1;
        for (const other of [edge6, txt6, btn6]) {
            sb6.hover(other);
            for (let t = 0; t < 600; t += 60) sb6.advance(60);
            minQ6 = Math.min(minQ6, sb6.q());
        }
        check("开着的时候划过缩放边 / 正文 / 按钮,状态一直是 resize 45°",
            sb6.state() === "resize" && sb6.D().axis === 45, `${sb6.state()} ${sb6.D().axis}°`);
        check("中途 q 一点没掉", minQ6 > 0.98, `最低 q=${fmt(minQ6, 4)}`);

        // 离开文档:缩放本来就会把指针带出去,这一条不能跟着收工
        sb6.leaveDoc();
        sb6.advance(300);
        check("指针离开文档也不算完(缩放时指针本来就会出去)",
            sb6.state() === "resize" && near(sb6.q(), 1, 0.02),
            `${sb6.state()} q=${fmt(sb6.q(), 3)}`);

        check("setResize(null) 把关掉的状态报回来", setResize(null) === false);
        sb6.advance(1400);
        check("关掉之后回到指针底下那块该有的样子(刚离开文档,所以是空的)",
            sb6.state() === "" && sb6.q() < 0.02,
            `state="${sb6.state()}" q=${fmt(sb6.q(), 3)}`);

        // 两个开关互不清算:手里按着一条边的时候,外面关掉不该把它放开
        sb6.hover(edge6);
        sb6.advance(1400);
        check("先把指针停回一条边上", sb6.D().axis === 0, `${sb6.D().axis}°`);
        sb6.down(edge6);
        sb6.advance(200);
        check("按上这条边", sb6.D().held === true && sb6.state() === "resize");
        setResize("ns-resize");
        setResize(null);
        sb6.advance(200);
        check("外面开了又关,手里按着的那条边还在(而且方向没被带跑)",
            sb6.D().held === true && sb6.state() === "resize" && sb6.D().axis === 0,
            `held=${sb6.D().held} ${sb6.D().axis}°`);

        // 按在按钮 / 正文上不该算缩放 —— 判据是「这一按落在缩放边上开始的」,
        // 不是「现在是按下态」。选字、点按钮各自该有自己的样子
        const sb7 = sandbox();
        const b7 = sb7.btn();
        const t7 = sb7.block({ "--cursor": "text" });
        sb7.hover(b7);
        sb7.advance(420);
        sb7.down(b7);
        sb7.advance(200);
        // 按钮上按下不算缩放,但**算点击特效**(按住那一格盖过可点击,见第 14 节)
        check("按在按钮上不算缩放,是点击特效", sb7.D().held === false && sb7.state() === "splat",
            `held=${sb7.D().held} ${sb7.state()}`);
        sb7.up(b7);
        sb7.hover(t7);
        sb7.advance(80);        // 从「可点击」换到「文本」得先收拢,别拿换形途中的状态去量
        sb7.down(t7);
        check("在正文上按住选字也不算缩放", sb7.D().held === false, `held=${sb7.D().held}`);
        sb7.advance(1400);
        check("按着不放也没改变形状,还是文本那一格(beam)",
            sb7.D().held === false && sb7.state() === "beam" && near(sb7.q(), 1, 0.02),
            `held=${sb7.D().held} ${sb7.state()} q=${fmt(sb7.q(), 3)}`);

        // 指针被系统抢走(触屏滚动之类),必须自己松手,不然会一直按着
        const sb8 = sandbox();
        const d8 = sb8.block({ "--cursor": "se-resize" });
        sb8.hover(d8);
        sb8.down(d8);
        sb8.advance(300);
        check("先按上了(45° 那条边)", sb8.D().held === true && sb8.D().axis === 45,
            `${sb8.D().axis}°`);
        sb8.cancel();
        sb8.advance(120);
        check("pointercancel 之后自己松手(不会一直按着)",
            sb8.D().held === false && sb8.state() === "resize",
            `held=${sb8.D().held} ${sb8.state()}`);

        /*
         * 缩放中途拖出窗口。这里记的是**本站的约定**:整站的规矩是「指针离开文档
         * 就当作什么都没发生」(#latex-ball 淡出、液体收工),所以页面自己按下的这一按
         * 也随之失效。
         *
         * 清单上「缩放时指针离开视口」那一行要的却是「保持按下的状态、回来接着缩」——
         * 那是另一条约定,现在没做,所以清单里它还是空的。这一条验的不是那个行为,
         * 是**现在实际会怎样**,免得两边对不上还都以为自己是对的。
         *
         * 注意这一条只管**页面自己按下**的那条路。上面 setResize 那一小段已经验过:
         * 宿主从外面打开的缩放,指针出文档不算完 —— 那不算破例,因为那种情况下
         * 本来就不是页面在管。两边的差别正是清单上这一行为什么还空着:要把它填上,
         * 得先想清楚「页面自己按下的缩放」和「宿主在缩窗口」在离开文档时该不该
         * 分开对待,那是约定层面的改动,不该夹在这一轮里做。
         */
        const sb9 = sandbox();
        const d9 = sb9.block({ "--cursor": "ew-resize" });
        sb9.hover(d9);
        sb9.down(d9);
        sb9.advance(300);
        sb9.leaveDoc();
        check("拖出窗口:按下的状态跟着一起清掉(本站约定,清单里那行还没做)",
            sb9.D().held === false && sb9.state() === "" && sb9.q() === 0,
            `held=${sb9.D().held} state="${sb9.state()}" q=${fmt(sb9.q(), 3)}`);
    }

    // =====================================================================
    section("14. 点击特效:俯视看下去一摊圆液体摊开(比球大 1.6 倍、就一整片),松手再聚回来");
    {
        /*
         * 原来「按下」只是把球缩一下(scale 0.86)—— 那是**缩放**,不是形状,也没
         * 有一点「按下去」的意思:看着像球被按瘪了一点,不像这一下落在了什么地方。
         * 用户要的是「液体摊开」,并且定了时序:「按住一直摊着,松手聚拢」。
         *
         * ---- 形状改过两版,三版的量法完全不同 ----
         *
         * 第一版按的是**侧视**:一摊扁的(宽/高 ≈ 2)液体,中间连着,整摊比指针低
         * 6px(「掉下去化开」)。用户的原话把这一版整个否掉了:
         *   **「现在是扁扁的形状,这不对,应该是圆形的,因为是俯视角度,液体摊开的
         *   效果」** —— 俯视看下去,「扁」和「低」在画面上根本不存在,那两条只是侧视
         * 的错觉。用户另外还点了名:边是「圆 + 外围溅出的小液滴」,「掉下去」那一项
         * 直接「去掉」。
         *
         * 第二版是**俯视的圆 + 外围溅出去的几颗小液滴**,判据量的是「圆度 + 等效面积
         * 直径 + 外面断开液滴的颗数」。外圈那一圈只活了一天,用户又说:
         *   **「去掉那些小液滴,并且摊开的轮廓再放大一点」**
         * 于是有了现在这一版:**只有一摊,没有外圈**,尺寸从 1.17 倍放到 1.60 倍
         * (那个 42px 之所以做不出来,正是因为「整体 = 摊子 + 2×缝 + 4×液滴半径」
         * 装不下 —— 外圈一删,式子整条作废,见引擎 CFG)。
         *
         * 量法跟着换(rimOf / splatShape,见文件头上那几个帮手):
         *   圆度 + 等效面积直径 + **球和球之间还叠着**(一整片)+ 重心得在 0 上下。
         * 前两版的判据一条都不留 —— 「外面有断开的液滴」这一条**整个反过来**了:
         * 现在验的是「谁也不许散开」。留着旧的话,圆的一整摊反而过不了。
         *
         * 这一节验的其实是两件事,而且它们必须同时成立:
         *   时序还是原来那套 —— 按下摊开、按住不动就摊着、松手聚回来;
         *   形状是俯视的那一摊 —— 圆、比球大 1.6 倍、就一整片、坐在指针上。
         * 只验时序(状态机接对了)会漏掉「画的还是原来那个形状」;只验形状会漏掉
         * 「按一下闪一下就没了」。
         *
         * 还有一条容易想错的:这一下是**指针自己的**,不是某个元素的一下 —— 按在
         * 按钮上、按在空白处、按在拖拽把手上,都是同一摊。下面的主路就按在空白处。
         */
        const a = sandbox();
        const CFG = a.FX().CFG;
        const blank = a.block({});
        a.setHit(blank);
        a.down(blank);
        a.advance(400);

        const da = a.D();
        check("按住不放,进的是点击特效(不是原来那个缩一下)",
            a.state() === "splat" && da.pressing === true,
            `state="${a.state()}" pressing=${da.pressing}`);
        check("摊开的时候球让位了(不然两个球一起画)", a.ballHidden() === true);
        check("q 已经到 1", near(a.q(), 1, 0.01), fmt(a.q(), 4));

        // 帧必须**就是引擎的输出** —— 和别的状态同一条要求
        const wantSplat = a.FX().sampleSplat(da.te, da.q).balls;
        const dSplat = ballDiff(wantSplat, a.frames());
        check("屏幕上的球和引擎 sampleSplat 逐球一致", near(dSplat, 0, 0.01),
            `最大差 ${fmt(dSplat, 4)}px`);

        // ---- 形状:俯视看下去,一摊圆的液体摊开了,而且就一整片 ----
        const spread = a.frames();
        const mass = a.FX().splatMass(da.q);
        const sh = splatShape(spread, R0, CFG, mass);
        check("摊开是一个圆(不是压扁的椭圆)",
            sh.round < 1.25, `圆度 ${fmt(sh.round, 3)}(正圆 1.00,旧那版 1.8)`);
        /*
         * 「比球大」这一条的阈值 1.45 是**照着用户点名的数**定的:他要 1.6 倍(42px),
         * 实测 1.60,所以卡在 1.45 —— 留一点微调的余地,但容不下「退回球那么大」。
         * 可点击那一坨的面积恒等于 πR0²,也就是 1.00,所以这一条就是这一格和它的分界。
         */
        check("比默认球大一圈 —— 用户点名的是 1.6 倍",
            sh.pad > R0 * 2 * 1.45,
            `等效直径 ${fmt(sh.pad)}px = 球的 ${fmt(sh.pad / (R0 * 2), 2)}×(${fmt(R0 * 2)}px)`);
        check("中心是实的(摊开的中央还连着一块,不是一圈)",
            sh.cover < 0, `中心到最近边界 ${fmt(sh.cover)}px`);
        /*
         * 「掉下去」这一条只有重心量得出来:一摊对称地摊在指针四周,外接框照样又宽
         * 又低。旧那版的重心是 y +5.9px,用户对它的处理是**「去掉」**。
         * 两轴一起量、都卡在 2px:12 团摞在一起蠕动的时候重心本来就会偏一点,
         * 那是「摊开」本身,不是「整摊挪了地方」。
         */
        check("整摊坐在指针上,没有掉到指针下面去(也没有横着挪)",
            Math.abs(sh.cen.y) < 2 && Math.abs(sh.cen.x) < 2,
            `重心 (${fmt(sh.cen.x)}, ${fmt(sh.cen.y)})`);
        /*
         * ---- 一整片:外圈液滴删掉之后,这一条是**反过来**的 ----
         *
         * 上一版这里验的是「外面有 ≥3 颗和那一摊断开的小液滴」,连 goo 的桥接门槛都
         * 拿渲染管线量了一遍。现在用户的口气是**「去掉那些小液滴」**,所以判据换成
         * 「谁也不许散开」:
         *   球数必须就是核 + 外缘那一圈(一颗不多、一颗不少);
         *   而且它们**几何上还叠着** —— 最小间隙是个很大的负数。
         * 后一条比「按门槛判断开」硬得多:叠着就意味着并集是一整片,**和 goo 怎么调
         * 都没关系**。它顺带守住了「放大不许把外缘拉裂」(10 团本来叠得极重,真裂了
         * 这里立刻变成正的)。
         */
        check("就一整片:核 + 外缘那一圈,一颗不多一颗不少",
            sh.balls === 1 + CFG.SPLAT_RIM,
            `${sh.balls} 颗(该是 1 + ${CFG.SPLAT_RIM} = ${1 + CFG.SPLAT_RIM})`);
        check("整片是连着的 —— 球和球之间还叠着(不是靠 fitArea 硬撑到一起的)",
            sh.minGap < -2,
            `最小的边到边间隙 ${fmt(sh.minGap)}px(负数=叠着)`);
        /*
         * 再加一条「整体和等效圆差不多大」:一整摊的墨迹摊成一个正圆是 pad,而它真正
         * 铺到的地方是 reach。两个数离得近,说明外沿就是那一摊自己铺出来的 ——
         * 既没有散在外面的碎块,也不是「某个方向探出去很远」的星形。
         */
        check("整体和等效圆差不多大(没有散在远处的碎块)",
            sh.reach < sh.pad * 1.15,
            `整体 ${fmt(sh.reach)}px vs 等效直径 ${fmt(sh.pad)}px`);
        /*
         * 面积对的是 πR0² **乘材料倍数**,不是 πR0²:这一版故意不守恒材料(摊开本来就
         * 该变多),倍数由 splatMass(q) 说了算。旧那版恒等于一颗球,那是「把球摊平」。
         */
        check("摊开后材料是多的,而且正好是 splatMass 说的那个数",
            sh.areaErr < 0.01,
            `面积 ${fmt(area(spread, R0) / (Math.PI * R0 * R0), 3)} 颗球,该是 ${fmt(mass, 3)} 颗`);
        /*
         * 外圈液滴删掉之后,这里**可以**要求「每一颗都画得出来」了 —— 上一版不行,因为
         * 液滴是从半径 0 生出来、又缩回 0 死掉的,按住的那几帧里总有几颗正在生死之间。
         * 现在这 11 颗全程都是十几个 px,门槛底下没有一颗。render_states 那边同步把
         * splat 从可见性检查的豁免名单里去掉了。
         */
        check("每一颗都画得出来(没有一颗缩在 goo 那道 3.63px 的坎底下)",
            sh.minR >= 3.63, `最小的球半径 ${fmt(sh.minR)}px`);

        // ---- 按住不动:一直摊着,外面那几颗还在生生死死 ----
        a.advance(1000);
        const held = a.frames();
        check("按住不动就一直摊着,不会自己收回去",
            a.state() === "splat" && a.q() > 0.99, `state="${a.state()}" q=${fmt(a.q(), 3)}`);
        check("一直摊着的时候还在自己动(不是一张定格图)",
            frameDiff(spread, held, R0) > 20,
            `1 秒里翻了 ${fmt(frameDiff(spread, held, R0), 0)}px²`);

        /*
         * 按住不动的这一整秒,逐帧量一遍。
         *
         * 「液体摊开」是个**一直动着**的画面,抽一两帧量会漏掉三件事:某一帧外缘被拉开
         * 了缝(那一摊裂成几块),某一帧的摆动把整摊甩偏了,或者「放大」其实是靠一个
         * 忽大忽小的轮廓撑出来的(看着像在呼吸)。这三件事都只在时间上看得见 ——
         * 任意一帧单看都很正常。
         *
         * 上一版这里数的是液滴的生死(`welds` / `drops`),那两个量随着液滴一起删了。
         * 换成时间上量:最小间隙(不许有一帧松到裂开)、重心、以及等效直径的波动幅度。
         */
        let hRound = 0, hGap = -Infinity, hCen = 0, hPadLo = Infinity, hPadHi = 0, hBalls = 0;
        for (let i = 0; i < 60; i++) {
            a.step();
            const f = a.frames();
            if (!f) continue;
            const s2 = splatShape(f, R0, CFG, a.FX().splatMass(a.q()));
            hRound = Math.max(hRound, s2.round);
            hGap = Math.max(hGap, s2.minGap);
            hCen = Math.max(hCen, Math.abs(s2.cen.y), Math.abs(s2.cen.x));
            hPadLo = Math.min(hPadLo, s2.pad); hPadHi = Math.max(hPadHi, s2.pad);
            hBalls = Math.max(hBalls, s2.balls);
        }
        check("整整一秒里那一摊都是圆的、都坐在指针上",
            hRound < 1.25 && hCen < 2,
            `最不圆的一帧 ${fmt(hRound, 3)},重心最偏的一帧 ${fmt(hCen)}px`);
        check("整整一秒里都是连着的(没有一帧被摆动拉开缝)",
            hGap < -2, `最难的一帧最小间隙 ${fmt(hGap)}px(负数=还叠着)`);
        check("整整一秒里颗数不变(外缘是固定的那一圈,不是随机冒出来的)",
            hBalls === 1 + CFG.SPLAT_RIM, `最多的一帧 ${hBalls} 颗`);
        /*
         * 「放大」不是靠轮廓忽大忽小。等效直径这一秒里的波动卡在 10% —— 实测远小于
         * 这个数(摆动只在外缘加个位数百分比的抖动);真让轮廓呼吸起来,这里立刻抓到。
         */
        check("一秒里那一摊大小是稳的(不是在呼吸)",
            hPadHi < hPadLo * 1.10,
            `等效直径 ${fmt(hPadLo)}~${fmt(hPadHi)}px(波动 ${fmt((hPadHi / hPadLo - 1) * 100)}%)`);

        /*
         * ---- 按在哪儿都算 ----
         *
         * 先把指针放到一个「可点击」的元素上:那时形状是那一坨。再从它身上按下去,
         * 形状必须换成这一摊 —— 这验的是「按下压过悬停」,不是「按下和悬停一样」。
         * 然后拿它和按空白处那一摊对着比:同一套数、同一个形状。
         */
        const p2 = sandbox();
        const pbtn = p2.btn({ "--cursor": "pointer" });
        p2.setHit(pbtn);
        p2.hover(pbtn);
        p2.advance(420);
        check("悬停在按钮上时是「可点击」那一坨", p2.state() === "viscous", p2.state());
        p2.down(pbtn);
        p2.advance(420);
        check("按下去之后换成点击特效(这一下压过悬停的形状)",
            p2.state() === "splat", p2.state());
        const d2 = p2.D();
        /*
         * 比的是**看得见的那几颗**,不是池子里的槽数。
         *
         * 池子只长不缩(cursor-fx.js 的 ensurePool),而这一路是从可点击那一坨按下去的:
         * 直接交接那几帧要把两格接成一帧(见下面那一段),池子因此被撑到 15 颗,散完之后
         * 后面四颗只是被 opacity 关掉 —— 它们还占着槽。逐球比对读帧**全部**槽的话,
         * 比的是「池子多大」,不是「画了几颗」。
         */
        const shown2 = visible(p2.frames());
        check("按在按钮上摊出来的,和引擎那一帧逐球一致",
            near(ballDiff(p2.FX().sampleSplat(d2.te, d2.q).balls, shown2), 0, 0.01),
            `最大差 ${fmt(ballDiff(p2.FX().sampleSplat(d2.te, d2.q).balls, shown2), 4)}px`);
        const sh2 = splatShape(p2.frames(), R0, CFG, p2.FX().splatMass(d2.q));
        /*
         * 两摊是在两个不同的时刻量到的,而让这摊「活着」的摆动本来就是按时间走的,
         * 所以不能逐球比(那样比的是摆动相位,不是形状)。能比的是形状本身的数:
         * 那一摊多大、多圆、几颗球 —— 摆动只在这几个数上加个位数百分比的抖动。
         */
        check("按在按钮上和按在空白处是同一摊(一样大的圆、一样多的球)",
            Math.abs(sh2.pad - sh.pad) < 2 && sh2.round < 1.25
            && visible(p2.frames()).length === visible(spread).length,
            `等效直径 ${fmt(sh2.pad)} vs ${fmt(sh.pad)},圆度 ${fmt(sh2.round, 3)},` +
            `球数 ${visible(p2.frames()).length} vs ${visible(spread).length}`);

        /*
         * ---- 按下的时候**不许先变成普通状态** ----
         *
         * 用户的原话:「如果点击的时候鼠标状态不是普通状态,不要先变成普通状态再点击,
         * 而是直接过渡到点击状态」。
         *
         * 「普通状态」在这套东西里是**可以精确量出来的**:一颗 R0 的球(26px、面积
         * πR0²=531px²)。q≈0 那一帧每一格都退化成一模一样的那颗球 —— 这正是「换形
         * 只能在那一帧做」的根据,也正是用户看见的那一下:指针底下是一坨可点击的液体
         * 时按下去,先缩回 26px,再重新摊开。
         *
         * 所以这里量的是「这一帧有多不像那颗球」= 和静止帧的差集面积。旧行为那一趟最像
         * 的一帧只差几个 px²(等于就是那颗球),这条要求全程都在 50px² 以上。
         */
        const ballLike = (fr) => frameDiff(fr, REST_FRAME, R0);
        const p3 = sandbox();
        const p3btn = p3.btn({ "--cursor": "pointer" });
        p3.setHit(p3btn);
        p3.hover(p3btn);
        p3.advance(500);
        const before3 = p3.frames();
        p3.down(p3btn);
        let minLike = Infinity, jumpBtn = 0, prev3 = before3;
        let outFrames = 0, together = 0, outName = "";
        let resid = 0, dropQ = 0;               // 摘掉退场那一格那一刻,它还占着多少画面
        const dumpIn = [];                      // 逐帧留一份,给对照图用(见本节末尾)
        for (let i = 0; i < 40; i++) {          // 660ms:交接早就完了,后面是按住不动
            p3.step();
            const d3 = p3.D();
            if (HANDOFF_DUMP) {
                // 沙盒读出来的球是 {x,y,s,on},引擎给的是 {x,y,scale} —— 这里就用引擎那套
                // 名字记下来,省得渲染那边要认两种
                dumpIn.push({ t: +((i + 1) * 1000 / 60).toFixed(2), q: d3.q, out: d3.out || "",
                    balls: visible(p3.frames()).map((b) => ({ x: b.x, y: b.y, scale: b.s })) });
            }
            if (d3.out) {
                outFrames++;
                if (!outName) outName = d3.out;
                // 旧的还没散完、新的已经长起来一截 ⇒ 两件事是**同时**在走的,
                // 不是「旧的先收干净,新的才开始」
                if (d3.q > 0.25) together++;
                /*
                 * 退场那一格在被摘掉之前,到底还给画面添了多少东西。
                 *
                 * 帧 = 退场那一格 + 新的那一格(直接交接就是把两格接成一帧,见 hover.js),
                 * 而新的那一格就是引擎那一帧本身。所以「多出来的那块」=
                 * frameDiff(整帧, 只有新的那一帧)—— 拿它当「摘掉看不看得出来」的尺子。
                 */
                resid = frameDiff(p3.frames(), asFrame(p3.FX().sampleSplat(d3.te, d3.q).balls), R0);
                dropQ = d3.qOut;
            }
            const fr = p3.frames();
            if (!fr) continue;
            minLike = Math.min(minLike, ballLike(fr));
            jumpBtn = Math.max(jumpBtn, frameDiff(prev3, fr, R0));
            prev3 = fr;
        }
        /*
         * 空白处按下的同一趟:同一摊东西、同一个速度,只是没有前一格要交接。
         * 它是这一条的尺子 —— 从非普通状态按下去不该比它更跳。
         */
        const p4 = sandbox();
        const p4el = p4.block({});
        p4.setHit(p4el);
        p4.down(p4el);
        const jumpBlank = maxDiffDuring(p4, 700, R0, REST_FRAME);
        /*
         * 再把**旧行为**那一趟最像普通球的一帧算出来当尺子:收 35ms 到 EPS,再从一颗球
         * 长 45ms。这条门要拦的就是它 —— 门槛离它有多远,是这条门还剩多少本事的凭据。
         */
        const rfx = p3.FX();
        const EPS = p3.win.HoverWatch.CFG.EPS;
        const tRetract = CFG.PRESS_OUT_TAU * Math.log(1 / EPS);
        let oldMinLike = Infinity;
        for (let t = 1000 / 60; t <= 700; t += 1000 / 60) {
            const fr = t <= tRetract
                ? asFrame(rfx.sampleViscous(t, Math.exp(-t / CFG.PRESS_OUT_TAU)).balls)
                : asFrame(rfx.sampleSplat(t - tRetract, 1 - Math.exp(-(t - tRetract) / CFG.PRESS_IN_TAU)).balls);
            oldMinLike = Math.min(oldMinLike, ballLike(fr));
        }
        console.log(`    尺子:这一趟里最像一颗普通球的那一帧 —— 旧行为 ${fmt(oldMinLike)}px²` +
            `(等于就是那颗球),新行为 ${fmt(minLike)}px²`);
        check("按下之前那一格确实不是普通状态(这一条的前提)",
            ballLike(before3) > 100, `和一颗球的差集 ${fmt(ballLike(before3))}px²`);
        check("从非普通状态按下去:全程没有一帧长得像那颗普通球",
            minLike > 50, `最像的一帧 ${fmt(minLike)}px²(门槛 50,旧行为 ${fmt(oldMinLike)}px²)`);
        check("旧那一格是**留着收**的,不是被扔掉硬切",
            outFrames > 0 && outName === "viscous",
            `退场的是「${outName || "空"}」,画了 ${outFrames} 帧`);
        check("两件事同时在走(旧的还没散完,新的已经长起来一截)",
            together >= 3, `两个同时在的帧 ${together} 帧`);
        check("这一趟不比在空白处按下去更跳(同一摊东西、同一个速度)",
            jumpBtn <= jumpBlank * 1.15,
            `峰值 ${fmt(jumpBtn)}px²/帧 vs 空白处 ${fmt(jumpBlank)}px²/帧`);
        console.log(`    尺子:摘掉退场那一格那一刻它还留着 q=${fmt(dropQ, 3)},` +
            `在画面上多出来的那块 ${fmt(resid)}px²`);
        check("摘掉退场那一格的时候,它已经一点画面都不占了(摘 = 看不出来)",
            resid <= 2, `摘下时 q=${fmt(dropQ, 3)},多出来 ${fmt(resid)}px²(门槛 2)`);

        /*
         * ---- 松手也一样:不许先缩成一颗球,再长回原来那一格 ----
         *
         * 松开时指针还停在这块可点击的元素上,所以收场该是「这一摊散掉、那一坨长回来」,
         * 中间同样不许出现那颗球。量法和上面一模一样,只是把 down / up 调个个儿。
         */
        const p5 = sandbox();
        const p5btn = p5.btn({ "--cursor": "pointer" });
        p5.setHit(p5btn);
        p5.hover(p5btn);
        p5.advance(500);
        p5.down(p5btn);
        p5.advance(500);
        p5.up(p5btn);
        let minLike5 = Infinity, out5 = "", resid5 = 0, dropQ5 = 0;
        const dumpOut = [];
        for (let i = 0; i < 40; i++) {
            p5.step();
            const d5 = p5.D();
            if (HANDOFF_DUMP) {
                dumpOut.push({ t: +((i + 1) * 1000 / 60).toFixed(2), q: d5.q, out: d5.out || "",
                    balls: visible(p5.frames()).map((b) => ({ x: b.x, y: b.y, scale: b.s })) });
            }
            if (d5.out) {
                if (!out5) out5 = d5.out;
                // 和上面同一把尺子:这一帧里退场的那一摊多占了多少(新的那一格 = 可点击那一坨)
                resid5 = frameDiff(p5.frames(),
                    asFrame(p5.FX().sampleViscous(d5.te, d5.q).balls), R0);
                dropQ5 = d5.qOut;
            }
            const fr = p5.frames();
            if (fr) minLike5 = Math.min(minLike5, ballLike(fr));
        }
        check("松手聚回来这一趟也没有一帧长得像那颗普通球",
            minLike5 > 50 && out5 === "splat",
            `最像的一帧 ${fmt(minLike5)}px²,退场的是「${out5 || "空"}」`);
        /*
         * 这一头比按下那一头糙,量出来就知道糙在哪儿:旧的那一摊收到球线以下时还是一整颗
         * 13px 的球,而新的那一格(可点击那一坨,六个球攒的)轮廓最浅处才 8.07px —— 那颗球
         * 把那几个凹口填着,摘掉就是凹口露出来。要它变 0 只有让旧的缩着化掉,而两条路都
         * 试过更糟(缩快了自己跳 400px²/帧,缩慢了多挂一百多毫秒),所以这里量的是**另一件事**:
         * 摘的时候旧那一格已经收到球线以下了,不是**硬切在满状态上**(那才是要拦的,978px² 那
         * 个量级)。78px² 落在松手那 508px²/帧 的收拢之后 50ms,那会儿本来就在动。
         * 门槛 100 = 拦「什么时候摘」,不拦这个形状事实。
         */
        console.log(`    尺子:松手这一趟摘下时 q=${fmt(dropQ5, 3)},` +
            `在画面上多出来的那块 ${fmt(resid5)}px²`);
        check("松手这一趟也是收到球线以下才摘的(不是硬切在满状态上)",
            resid5 <= 100 && dropQ5 <= p5.win.HoverWatch.CFG.OUT_DROP_Q + 0.2,
            `摘下时 q=${fmt(dropQ5, 3)},多出来 ${fmt(resid5)}px²(门槛 100;` +
            `硬切是 978 那个量级)`);

        /*
         * ---- 把这两趟画出来(只在要出对照图的时候)----
         *
         * 这一条要求本来就是**眼睛**提出来的(「不要先变成普通状态再点击」),上面那些数
         * 是把眼睛看到的东西量出来,但最后还得看一眼数的是不是那件事 —— 尤其「最像的一帧
         * 126px²」这种话,不看图不知道它长什么样。
         *
         * 新行为那两行是上面两轮里**真实画到**的帧,一颗球都没重算;旧行为那两行是算的
         * —— 它已经不在代码里了,只能说清它长什么样:先按 35ms 收成一颗球(收到 EPS),
         * 再从一颗球按 45ms / 90ms 长起来。
         */
        if (HANDOFF_DUMP) {
            const grid = [17, 33, 50, 67, 100, 150, 200, 300];
            const closest = (arr, t) => arr.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
            const tRetract = CFG.PRESS_OUT_TAU * Math.log(1 / EPS);
            const oldPress = (t) => (t <= tRetract
                ? rfx.sampleViscous(t, Math.exp(-t / CFG.PRESS_OUT_TAU)).balls
                : rfx.sampleSplat(t - tRetract, 1 - Math.exp(-(t - tRetract) / CFG.PRESS_IN_TAU)).balls);
            const oldUp = (t) => (t <= tRetract
                ? rfx.sampleSplat(t, Math.exp(-t / CFG.PRESS_OUT_TAU)).balls
                : rfx.sampleViscous(t - tRetract, 1 - Math.exp(-(t - tRetract) / CFG.STATE_IN_TAU)).balls);
            const slim = (bs) => bs.map((b) => ({ x: +b.x.toFixed(3), y: +b.y.toFixed(3), scale: +b.scale.toFixed(4) }));
            const row = (name, pick) => ({ name, shots: grid.map((t) => pick(t)) });
            fs.writeFileSync(HANDOFF_DUMP, JSON.stringify({
                r0: R0,
                // goo 的三个数从引擎的 CFG 里带过去,渲染那边不另写一份:写错了画出来
                // 是一张糊的图,而糊的图看着「差不多」,最容易骗过人
                goo: { blur: CFG.GOO_BLUR, sharp: CFG.GOO_SHARP, cut: CFG.GOO_CUT },
                rows: [
                    row("现在:按下去(直接交接)", (t) => {
                        const f = closest(dumpIn, t);
                        return { t: f.t, q: f.q, out: f.out, balls: slim(f.balls) };
                    }),
                    row("以前:按下去(先收成一颗球再换)", (t) => ({ t, balls: slim(oldPress(t)) })),
                    row("现在:松手(直接交接)", (t) => {
                        const f = closest(dumpOut, t);
                        return { t: f.t, q: f.q, out: f.out, balls: slim(f.balls) };
                    }),
                    row("以前:松手(先收成一颗球再换)", (t) => ({ t, balls: slim(oldUp(t)) })),
                ],
            }, null, 1));
            console.log(`    (对照图那四行已经写到 ${HANDOFF_DUMP})`);
        }

        /*
         * ---- 这三族按下去本来就不该有反应 ----
         *
         * 文本(按下是开始拖选)、不可点击 / 不许放(按下去什么都不会发生)。在这一族
         * 上摊开是不老实的:那等于告诉用户「这一下落在了什么东西上」,而它没有。
         * 注意断言里 pressing 一栏仍然是 true —— 手确实按着,只是形状不跟着换。
         */
        for (const [val, want] of [["text", "beam"], ["not-allowed", "burst"], ["no-drop", "burst"]]) {
            const s = sandbox();
            const el = s.block({ "--cursor": val });
            s.setHit(el);
            s.hover(el);
            s.advance(500);
            s.down(el);
            s.advance(400);
            check(`按在 ${val} 上不摊开(按下去本来就没反应,摊开是骗人)`,
                s.state() === want && s.D().pressing === true,
                `state="${s.state()}" pressing=${s.D().pressing}`);
        }

        /*
         * ---- 这一下必须快 ----
         *
         * 通用的状态时间常数(收 90ms / 放 130ms)是给「形变」用的:形状慢慢长出来,
         * 跟着指针走。按下不是形变,是一下撞击 —— 用那套常数会摊成一次慢动作。所以
         * 按下这一格自己带一套短得多的时间常数(45 / 35),这里既验数也验行为:
         * 数字上必须是另一个量级,行为上到摊开和收回都得在 160ms 以内。
         */
        check("按下这一下有自己的一套时间常数,和别的状态不是一个量级",
            CFG.PRESS_IN_TAU <= CFG.STATE_IN_TAU / 2 && CFG.PRESS_OUT_TAU <= CFG.STATE_OUT_TAU / 2,
            `按下 ${CFG.PRESS_IN_TAU}/${CFG.PRESS_OUT_TAU}ms vs 状态 ` +
            `${CFG.STATE_IN_TAU}/${CFG.STATE_OUT_TAU}ms`);
        const t2 = sandbox();
        const t2el = t2.block({});
        t2.setHit(t2el);
        t2.down(t2el);
        const t2t0 = t2.now();
        let tIn = 0;
        while (t2.q() < 0.9 && t2.now() - t2t0 < 2000) { t2.step(); tIn = t2.now() - t2t0; }
        check("按下到摊开只用一瞬", tIn > 0 && tIn < 160, `${fmt(tIn)}ms`);
        const tInEnd = t2.now();
        t2.up(t2el);
        let tOut = 0;
        while (t2.q() > 0.05 && t2.now() - tInEnd < 2000) { t2.step(); tOut = t2.now() - tInEnd; }
        check("松手之后很快就聚回来", tOut > 0 && tOut < 160, `${fmt(tOut)}ms`);
        t2.advance(400);
        check("松手聚回来之后球是露着的(交回原来那颗)",
            t2.state() === "" && t2.q() === 0 && t2.ballHidden() === false,
            `state="${t2.state()}" q=${fmt(t2.q(), 3)} hidden=${t2.ballHidden()}`);

        // ---- 松开、离开文档、被系统取消:三种收场都要清干净 ----
        for (const [how, act] of [
            ["松开", (s, el) => s.up(el)],
            ["指针离开文档", (s) => s.leaveDoc()],
            ["系统取消(pointercancel)", (s) => s.cancel()],
        ]) {
            const s = sandbox();
            const el = s.block({});
            s.setHit(el);
            s.hover(el);
            s.down(el);
            s.advance(300);
            check(`${how}之前手是按着的、摊着`, s.state() === "splat", s.state());
            act(s, el);
            s.advance(500);
            check(`${how}之后清干净了(不会卡在那儿摊着)`,
                s.D().pressing === false && s.state() === "" && s.q() === 0,
                `pressing=${s.D().pressing} state="${s.state()}" q=${fmt(s.q(), 3)}`);
        }

        /*
         * ---- 抓取那一族:用户说「抓取中也用这个,可抓取的效果用可点击特效」----
         *
         * 四个值分两半:grab 是可点击(viscous),grabbing / move / all-scroll 就是
         * 这一摊。认领本身在第 1、11 节验过了,这里验的是**画出来的样子** ——
         * 这四个值的宿主都是真的能上手的东西,形状错了用户一眼就看得出来。
         */
        const mv = sandbox();
        const mvEl = mv.block({ "--cursor": "move" });
        mv.hover(mvEl);
        mv.advance(500);
        const dm = mv.D();
        check("「移动中」(move)不用按就已经是这一摊", mv.state() === "splat", mv.state());
        check("它摊出来的就是引擎那一帧(和手动按下走同一条画法)",
            near(ballDiff(mv.FX().sampleSplat(dm.te, dm.q).balls, mv.frames()), 0, 0.01),
            `最大差 ${fmt(ballDiff(mv.FX().sampleSplat(dm.te, dm.q).balls, mv.frames()), 4)}px`);
        const msh = splatShape(mv.frames(), R0, CFG, mv.FX().splatMass(dm.q));
        check("「移动中」这一摊也是圆的、中心实的、坐在指针上、比球大、一整片",
            msh.round < 1.25 && msh.cover < 0 && Math.abs(msh.cen.y) < 2
            && msh.pad > R0 * 2 * 1.45 && msh.minGap < -2,
            `圆度 ${fmt(msh.round, 3)},中心 ${fmt(msh.cover)}px,` +
            `重心y ${fmt(msh.cen.y)},等效直径 ${fmt(msh.pad)}px(${fmt(msh.pad / (R0 * 2), 2)}×),` +
            `最小间隙 ${fmt(msh.minGap)}px`);

        for (const val of ["grabbing", "all-scroll"]) {
            const s = sandbox();
            const el = s.block({ "--cursor": val });
            s.hover(el);
            s.advance(500);
            check(`--cursor:${val} 不用按就是这一摊`, s.state() === "splat", s.state());
        }
        const gr = sandbox();
        const grEl = gr.block({ "--cursor": "grab" });
        gr.hover(grEl);
        gr.advance(500);
        check("--cursor:grab 用的是可点击那一坨(用户点名的两半之一)",
            gr.state() === "viscous", gr.state());
    }

    // =====================================================================
    section("15. 放大缩小:中心球小一圈,四面八方的液滴一直往外流、往里收");
    {
        /*
         * 用户的原话:「放大缩小特效我想做黑球从中心有液体球散开、四周有液体球像中心
         * 球聚拢的特效,中心球要比默认球小」。方向定成「放大=往外散,缩小=往内聚」。
         *
         * ---- 这个形状前后做了四版,前三版的评语都得留着 ----
         *
         * 第一版:把「散开」做成了**一圈摆在固定半径上的球** —— 外圈半径只是 q 的
         *   函数,q 一停那一圈就停在那儿,只剩 ±6% 的抖动。评语
         *   **「小球应该持续向外散射,持续向内聚拢,而不是散射一下就定型了」**。
         *
         * 第二版:改成「喷流」—— 每颗液滴自己出生、自己飞到外面化掉、半径从 0
         *   涨到峰值再回 0,几颗的相位错开 1/N 圈。**思路是对的**(评语
         *   **「这回对一点了」**),但它把「相位」和「方位」绑在同一个 i 上,外加拿一条
         *   慢转,于是「最新出生的那一颗」的方位随时间一路往前挪,一眼看上去是个
         *   **绕着圈转的喷头**。评语 **「是从四面八方同时散射和聚拢,不是转着圈的」**。
         *
         * 第三版:反过来把错开的相位**全删掉** —— 几颗同相位,一起出去、一起回来。
         *   不转圈了,可也不像「散射」了:那是**一条环在一起胀缩**,天上没有刚出生的
         *   滴、也没有正在化掉的滴。评语
         *   **「持续向所有方向散射/聚拢小液滴,不是现在这样」**。
         *
         * 第四版(现在这一版):用户点的名是**「以上个版本为基础」** —— 于是第二版的
         *   「一颗一颗各有各的一生」整个搬回来,只留第三版那个对的地方:方位一刻都不挪。
         *   两版各取一半,「持续」和「不转圈」这才第一次同时成立。
         *
         * ---- 这一版的两张表(前三版的教训只剩这一句)----
         *
         * **「谁先谁后」不能跟「在哪个方向」绑在一起,但几颗的相位也绝不能全部相同。**
         *   方位 = i×360/N —— 只由 i 定,一个随时间前进的项都没有(第三版对的地方);
         *   相位 = ZOOM_PHASE_ORDER 这张打乱的对照表(第二版对的地方)。
         * 第二版错在前半句(相位跟着方位走,波形绕着圆周跑),第三版错在后半句
         * (相位全同,散开变成了胀缩)。所以下面这两条判据是**这一节的核心**,而且它们
         * 的极性都翻过:第三版要的是「同刻几颗离原点一样远」,这一版要的**正好相反** ——
         * 「同刻几颗必须离原点**不一样**远」(有人刚出生、有人飞到半路、有人快化掉)。
         * 谁把相位再改回同相,这一条立刻报。
         *
         * ---- 面积守恒:相位打乱是免费的 ----
         *
         * 相位表是等分格子 {0, 1/N, …, (N−1)/N} 的一个**排列**,所以任何时刻天上 N 颗的
         * 相位恰好是这个格子,而 Σsin²(π(x+j/N)) ≡ N/2 对任何 x 成立 —— 于是
         *   Σ(液滴半径²) = N·peakR²/2 = R0² − coreR²      (与时间**完全**无关)
         * 加上中心球那一份正好 πR0²。排列只是换个方位去接这些相位,不改变这个和,所以
         * 「打乱」不花钱。实测 Σr²+core² 与 R0² 的差 ≤0.06%,s 在 1 的 ±0.05% 以内,
         * 中心球稳稳停在 0.62R0 = 8.06px。下面第 6 条盯的就是这笔账。
         *
         * ---- 「散得开」和「不转圈」是对立的,这张表是穷举出来的 ----
         *
         * 看得见 = 半径过了 goo 画得出的 3.63px = 相位落在一生的中段;所以任何时刻看得见
         * 的那几颗,恰好是相位表里**相邻的一小段**(滑过一轮会遍历到所有长 4、长 5 的
         * 连续片段,共 18 种)。判据于是写成:这 18 段里每一段那几个方位在圆周上的最大
         * 空档要尽量小。穷举 9! 张表,最小值 = **120°**(实测加抖动 ≤128°)。
         *
         * 而「步长恒定」的表(新滴每次固定往前挪几格)取到的正是最整齐的那个解 ——
         * 但步长恒定就是**转圈**,正是第二版被否掉的东西。N=8 时在不转圈的前提下空档的
         * 下限是 180°(135° 只能靠转圈买),所以 N 取 9。第 8 条验出场步长不恒定,
         * 第 9 条验可见的那几颗不挤在一边 —— 两条一起才等于「四面八方 + 不转圈」。
         *
         * ---- 还有一条别的形状没有的性质 ----
         *
         * q=0 时中心球是 R0、q 满时是 0.62R0,但**中心球大小不随 q 之外的任何东西变**
         * (材料在 q 到 ZOOM_FADE 之前就转完了)。所以下面分别验「q 停住之后中心球一动不动」
         * 和「全场一直在动」,这两件事不冲突。
         */
        const zfx = sandbox().FX();
        const Z = zfx.CFG;
        const NZ = Z.ZOOM_COUNT;
        // 一颗液滴从出生到化掉走完一生的周期
        const CYCLE = Z.ZOOM_TRAVEL_MS;
        // goo 吃得掉的最小半径(第 8 节量出来的那 3.63px)。比这小的球画出来是空的
        const DRAWN = 3.63;
        // 中心球自己那份半径、每颗液滴最胖时那份(面积守恒,见引擎 sampleZoom)
        const CORE_R = Z.ZOOM_CORE * R0;
        const PEAK_R = R0 * Math.sqrt(2 * (1 - Z.ZOOM_CORE * Z.ZOOM_CORE) / NZ);
        // 圆心从原点一路往前走多远(抖动只乘在这一段的后半截上)
        const TRAVEL = Z.ZOOM_D - CORE_R;

        // 中心球 = 离原点最近的那一颗(它一路上都在原点上,不参与摆动)
        const coreOf = (fr) => fr
            .slice().sort((x, y) => Math.hypot(x.x, x.y) - Math.hypot(y.x, y.y))[0];
        /*
         * 一帧里的 NZ 颗液滴 = 除了中心球之外的全部。
         *
         * 帧里的顺序就是引擎里 circles 的顺序(fitArea 只做关于原点的等比缩放,toFrame
         * 原样搬),所以第 i 颗就是角度基准 i·360/N 的那一颗 —— 「不转圈」必须按**同一颗**
         * 跟着时间看,顺序一错位,量出来的就是「角度漂移」,那是假的。
         */
        const dropsOf = (fr) => { const c = coreOf(fr); return fr.filter((b) => b !== c); };
        const distOf = (b) => Math.hypot(b.x, b.y);
        const angOf = (b) => Math.atan2(b.y, b.x) * 180 / Math.PI;
        // 差角折进 (−180, 180] —— 好让 0°/360° 两边的抖动不假装成「转了半圈」
        const devOf = (a) => {
            let v = a % 360;
            if (v > 180) v -= 360;
            if (v < -180) v += 360;
            return v;
        };

        // ---- 起手:q=0 就是一颗默认球(交回 #latex-ball 不能有缝)----
        for (const mode of ["in", "out"]) {
            const f0 = asFrame(zfx.sampleZoom(0, 0, mode).balls);
            const prof = profile(f0, R0);
            const pMin = Math.min(...prof), pMax = Math.max(...prof);
            check(`放大缩小的起手就是一颗默认球(${mode})`,
                cover(f0, R0) < 0 && Math.abs(pMin - R0) <= 0.3 && Math.abs(pMax - R0) <= 0.3,
                `外沿 ${fmt(pMin, 3)}–${fmt(pMax, 3)}px(R0=${R0})`);
        }

        // ---- 走整段 q:面积、几何上的球数、中心球的变化(形状那一半)----
        const walks = {};
        for (const [mode, label] of [["in", "放大"], ["out", "缩小"]]) {
            const rows = [];
            let maxAreaErr = 0, coreRise = 0, coreEnd = 0, nBalls = 0;
            let prevCore = Infinity;
            for (let i = 0; i <= 20; i++) {
                const q = i / 20;
                const fr = asFrame(zfx.sampleZoom(0, q, mode).balls);
                const core = coreOf(fr);
                const corePx = R0 * core.s;
                rows.push({ q, corePx, coreOff: Math.hypot(core.x, core.y) });
                nBalls = Math.max(nBalls, fr.length);
                if (q > 0) {
                    maxAreaErr = Math.max(maxAreaErr, Math.abs(area(fr, R0) / (Math.PI * R0 * R0) - 1));
                    coreRise = Math.max(coreRise, corePx - prevCore);
                }
                coreEnd = corePx;
                prevCore = corePx;
            }
            walks[mode] = { rows, maxAreaErr, coreRise, coreEnd };

            /*
             * 球数这一条问的是**几何上的**球数:1 个中心 + N 颗液滴,谁都不许被偷偷
             * 删掉。不按「画得出来几颗」问,是因为这一族里「看不见」是**正常状态**:
             * 一颗液滴刚冒头和快化掉的那两小段半径都接近 0(见下面「一整轮」第 3 条),
             * 本来就画不出来。它的出生和化掉是**自己长出来、自己散掉**,不是被谁删掉。
             */
            check(`${label}:几何上永远是 1 中心 + ${NZ} 颗液滴(谁都没被偷偷删掉)`,
                nBalls === NZ + 1, `${nBalls} 颗`);
            check(`${label}:面积全程守 πR0²(偏差 < 0.5%)`, maxAreaErr < 0.005,
                `${fmt(maxAreaErr * 100, 3)}%`);
            /*
             * 中心球一路上只许变小,不许回弹。这一条是这一族最容易做坏的地方:并集
             * 面积中途冲过 πR0² 的时候(fitArea 按**并集**反解),整组会被一起压小,
             * 中心球于是先小后大再小 —— 肉眼是「中心那颗抖了一下」,逐帧看是一个 5px
             * 到 8px 的回升。所以要按走过的每一段量,不能只看首尾。
             *
             * 额度给 0.02px:材料是在 q 到 ZOOM_FADE 之前**一次转让**完的(半径先走完、
             * 位置慢慢张,见引擎),所以这一路上没有材料多出来的机会;实测最大的那一次
             * 回升是 0.001px —— 那是抖动把并集面积挪了一点点、s 跟着动了万分之一,
             * 不是形状的呼吸(这一版中心球从 13.00px 一路收到 8.06px,全程单调)。
             */
            check(`${label}:中心球一路只变小、不回弹`, coreRise <= 0.02,
                `最大回升 ${fmt(coreRise, 3)}px(0 就是一路只小)`);
            check(`${label}:中心球最后落在 ZOOM_CORE·R0(用户点名的那个数)`,
                Math.abs(coreEnd - Z.ZOOM_CORE * R0) < 0.05,
                `${fmt(coreEnd)}px,该是 ${fmt(Z.ZOOM_CORE * R0)}px(${Z.ZOOM_CORE}×R0)`);
            check(`${label}:中心球从头到尾都比默认球小(最多也就和它一样大)`,
                Math.max(...rows.map((r) => r.corePx)) <= R0 + 0.05,
                `最大 ${fmt(Math.max(...rows.map((r) => r.corePx)))}px`);
            check(`${label}:中心球一直在原点上(它不参与往外散)`,
                Math.max(...rows.map((r) => r.coreOff)) < 0.01, "始终在原点");
        }

        /*
         * ---- 一整轮:q 钉死在 1,让时间走满一圈(这一节真正的核心)----
         *
         * 「一直在动」「四面八方」「不转圈」这三句话全是 q 停住**之后**的事,所以
         * 这一段的自变量是**时间**:q 钉死,te 走满一整轮 CYCLE,右端点不取(那一帧
         * 就是下一轮的 k=0)。
         *
         * 抽 120 帧,一步 10.8ms。这么密是为了下面那几条「有没有哪一步停住了」「同刻
         * 几颗差多少」—— 那种话只能一帧一帧地问,不能只看首尾。
         */
        const STEPS = 120;
        const sweep = (mode) => {
            const rows = [];
            for (let k = 0; k < STEPS; k++) {
                const te = (k * CYCLE) / STEPS;
                const rep = zfx.sampleZoom(te, 1, mode);
                const fr = asFrame(rep.balls);
                const core = coreOf(fr);
                const drops = dropsOf(fr);
                // 看得见的那几颗 = 半径过了 goo 那道 3.63px 的线
                const vis = drops.filter((b) => R0 * b.s >= DRAWN);
                const visAng = vis.map((b) => (angOf(b) + 360) % 360).sort((a, b) => a - b);
                rows.push({
                    d: drops.map(distOf),
                    r: drops.map((b) => R0 * b.s),
                    // 每颗相对**自己那条基准方位**偏了多少度 —— 「不转圈」看的就是它
                    dev: drops.map((b, i) => devOf(angOf(b) - (i * 360) / NZ)),
                    core: R0 * core.s,
                    coreOff: Math.hypot(core.x, core.y),
                    s: rep.s,
                    visN: vis.length,
                    // 同刻看得见的那几颗,圆心距的**跨度** —— 「有人刚出生、有人飞到半路、
                    // 有人快化掉」的可观测量(第三版这里恒等于 0)
                    visBand: vis.length
                        ? Math.max(...vis.map(distOf)) - Math.min(...vis.map(distOf)) : 0,
                    // 同刻看得见的那几颗,在圆周上最大的一个空档 —— 「四面八方」的尺子
                    visGap: visAng.length > 1
                        ? Math.max(...visAng.map((a, j) => ((visAng[(j + 1) % visAng.length]
                            - a) % 360 + 360) % 360)) : 360,
                    // 轮廓 = 最外那一点离原点多远(整组里最大的 d + r)
                    edge: Math.max(...fr.map((b) => distOf(b) + R0 * b.s)),
                    sumR2: drops.reduce((a, b) => a + (R0 * b.s) ** 2, 0) + (R0 * core.s) ** 2,
                });
            }
            return rows;
        };

        const sweeps = { in: sweep("in"), out: sweep("out") };
        for (const [mode, label] of [["in", "放大"], ["out", "缩小"]]) {
            const rows = sweeps[mode];

            /*
             * 1. **同刻看得见的那几颗必须不在同一个距离上。**
             *
             * 这一条是这一节的核心,而且它的极性前后翻过两次:第一版是一圈钉在固定
             * 半径上的球(同刻的距离差 ≈ 0,但那一圈根本不动),第三版是六颗同相位
             * (同刻的距离差**恒等于** 0,一起出去一起回来)。这一版要的正好相反 ——
             * 天上永远同时有刚出生的、飞到半路的、快化掉的,所以同刻那几颗的距离
             * **必须散开**。
             *
             * 尺子用「可见那几颗的距离跨度」:实测一轮里最挤的一帧也有 3.98px,最松的
             * 一帧 6.82px(9 颗的圆心距排布在 8.06–22.7px 上)。地板给到 3.5px —— 那
             * 已经是一颗液滴 Visible 那一段长度(≈7px)的一半,谁把相位差抹平(改回
             * 同相)这一条当场报。
             */
            const band = rows.map((x) => x.visBand);
            check(`${label}:同刻看得见的那几颗**距离各不相同**(有人刚出生、有人飞到半路、有人快化掉)`,
                Math.min(...band) >= 3.5,
                `最挤的一帧跨度 ${fmt(Math.min(...band), 2)}px(最松 ${fmt(Math.max(...band), 2)}px)`);
            check(`${label}:看得见的颗数一直是 3~6 颗(不是空场,也不是全挤出来)`,
                Math.min(...rows.map((x) => x.visN)) >= 3 && Math.max(...rows.map((x) => x.visN)) <= 6,
                `一轮里 ${Math.min(...rows.map((x) => x.visN))}–${Math.max(...rows.map((x) => x.visN))} 颗`);

            /*
             * 2. 不转圈 —— 每颗的角度不随时间前进。
             *
             * 量的是「相对自己那条基准方位偏了多少」,不是「这一轮一共转了多少度」。
             * 第二版的毛病正是基准本身在移:那颗滴的角度一路往 360° 的方向爬,于是
             * 哪怕只走小半圈,这里也会报出一百多度。这一版的额度就是抖动幅度
             * ZOOM_SWING_A —— 角度那一项里除了 i·360/N 和它之外一无所有。折角是必须的:
             * i=0 那一颗的基准是 0°,抖到 −3° 不折的话会写成 357°,假装成「转了 357°」。
             */
            const maxDev = Math.max(...rows.flatMap((x) => x.dev.map(Math.abs)));
            check(`${label}:每颗的角度一整轮里**不往前挪**(不转圈,只剩 ±${Z.ZOOM_SWING_A}° 抖动)`,
                maxDev <= Z.ZOOM_SWING_A + 0.5,
                `最大偏离基准方位 ${fmt(maxDev, 2)}°(真转起来的话一圈是 360°)`);

            /*
             * 3. 每一颗自己走完一生:半径 0(刚冒头)→ 峰值(半路)→ 0(自己化掉)。
             *
             * 这一条是「持续」两个字里「有滴在出生、有滴在化掉」的那一半,第三版正是
             * 把这条曲线压成常数才被否掉的(评语「不是现在这样」)。所以它必须是一条
             * **扫过整段**的曲线:最小接近 0、最大顶到 PEAK_R,而且峰值对得上材料那笔账
             * (PEAK_R = R0·√(2(1−ZOOM_CORE²)/N),见引擎)。
             */
            const rMin = Math.min(...rows.flatMap((x) => x.r));
            const rMax = Math.max(...rows.flatMap((x) => x.r));
            check(`${label}:每颗的半径从 0 扫到峰值再回 0(出生和化掉都是自己长出来的)`,
                rMin < 0.15 && Math.abs(rMax - PEAK_R) < 0.05,
                `整轮里半径扫过 ${fmt(rMin, 3)}–${fmt(rMax, 3)}px(该是 0 → ${fmt(PEAK_R)}px)`);
            const eachSpan = Math.min(...rows[0].r.map((_, i) => {
                const rs = rows.map((x) => x.r[i]);
                return Math.max(...rs) - Math.min(...rs);
            }));
            check(`${label}:九颗**都**走完了这一生(不是只有一颗在动)`,
                eachSpan >= PEAK_R * 0.95, `最懒的一颗也只扫了 ${fmt(eachSpan)}px`);

            /*
             * 4. 圆心一路只往它该去的方向走,整整一轮只在一处掉头 —— 掉头那一处正是
             *    「化掉 → 新生」,而那一帧的半径是 0(所以看不见)。
             *
             * 这一条接的是第一版的评语「散射一下就定型了」的反面:往外散的液体不许回头
             * (缩小就是同一趟路倒着走,所以它一路只许**往内**,掉头那一帧是从最外重新
             * 冒出来)。第二版是从中心球**边上**起算距离的,液滴临到最外、半径缩回 0 的
             * 时候圆心会往回退一段(看上去像被谁拽回来),这一版把「贴边」和「飞多远」
             * 彻底分开之后就没有这一退了 —— 逐颗量下来,一整轮里只有一帧是逆着走的:
             * 那一帧是它化掉之后在母球边上重新出生(新的圆心离原点更近),而那一帧半径
             * ≈0,画面上是「一颗没了、另一颗在母球身上长出来」。谁把距离改回挂上半径
             * 那一项,这里会报出几十帧逆着走。
             *
             * 有一颗(方位序号 0 那颗)量出来是 0 而不是 1:它的生日正好落在抽样的起点
             * te=0 上,而右端点不取(那一帧就是下一轮的 k=0)—— 它的那一次掉头掉在窗口
             * 外面了。所以这里卡的是「每颗 ≤1 次,而且至少有 N−1 颗正好 1 次」。
             */
            const flow = mode === "in" ? 1 : -1;   // 放大一路往外,缩小一路往内
            const backFrames = [];
            for (let i = 0; i < NZ; i++) {
                let back = 0, backR = 0;
                for (let k = 1; k < STEPS; k++) {
                    if (flow * (rows[k].d[i] - rows[k - 1].d[i]) < 0) {
                        back++; backR = rows[k].r[i];
                    }
                }
                backFrames.push([back, backR]);
            }
            check(`${label}:圆心一路只往一个方向走,一整轮只掉头一次(那一次半径≈0,看不见)`,
                backFrames.every(([n, r]) => n <= 1 && r < 0.3)
                && backFrames.filter(([n]) => n === 1).length >= NZ - 1,
                `每颗掉头 ${backFrames.map(([n]) => n).join(",")} 次,` +
                `掉头那帧的半径最大 ${fmt(Math.max(...backFrames.map(([, r]) => r)), 3)}px`);

            /*
             * 5. 一整轮里没有一帧是停住的(不是定型的一圈)。
             *
             * 上一条管方向,这条管「有没有卡住」。第一版的毛病就是卡在最外那一点上
             * 不动,所以得一步一步量:除掉头那一帧之外,每颗每帧的圆心距都要往前走
             * 一点点(实测一步 10.8ms 走 ≈0.12px,放大缩小一样 —— 时间取负不改变步长)。
             * 下限比实测松,上限卡在「一步不许超过 2px」——那不是快,那是跳。
             */
            const stepsOf = (i) => {
                const out = [];
                for (let k = 1; k < STEPS; k++) out.push(flow * (rows[k].d[i] - rows[k - 1].d[i]));
                return out;
            };
            const fwd = [];
            for (let i = 0; i < NZ; i++) fwd.push(...stepsOf(i).filter((v) => v > 0));
            check(`${label}:一整轮里没有一步是停住的(不是定型的一圈)`,
                Math.min(...fwd) > 0.02 && Math.max(...fwd) < 2,
                `往前走的步长 ${fmt(Math.min(...fwd), 3)}–${fmt(Math.max(...fwd), 3)}px/帧`);

            /*
             * 6. 中心球:整轮一动不动、一直在原点,fitArea 一次都没动手。
             *
             * 这三条是「相位表是等分格子的一个排列」买来的**精确**结论(见上面那段
             * Σ(半径²) = R0² − coreR²):满开之后天上那 N 颗的半径平方和与时间**无关**,
             * 于是并集面积就是 πR0²,fitArea 的 s 恒为 1,中心球稳稳停在 0.62R0。
             * 谁把相位表改坏(不再是排列)、或者把半径改回不按 |sin| 分档(那会让平方和
             * 随时间荡,中心球跟着呼吸),这里当场报。
             */
            check(`${label}:飞了一整轮,中心球一动不动、一直在原点上`,
                Math.max(...rows.map((x) => x.core)) - Math.min(...rows.map((x) => x.core)) < 0.05
                && Math.max(...rows.map((x) => x.coreOff)) < 0.01,
                `整轮里 ${fmt(Math.min(...rows.map((x) => x.core)))}–` +
                `${fmt(Math.max(...rows.map((x) => x.core)))}px,最大离心距 ` +
                `${fmt(Math.max(...rows.map((x) => x.coreOff)), 6)}px`);
            const sErr = Math.max(...rows.map((x) => Math.abs(x.s - 1)));
            check(`${label}:s 全程是 1(fitArea 一次都没动手 —— 面积精确等于 πR0²)`,
                sErr < 0.002, `最大偏差 ${fmt(sErr * 100, 3)}%`);
            const sumErr = Math.max(...rows.map((x) => Math.abs(x.sumR2 - R0 * R0)));
            check(`${label}:天上那 N 颗的半径平方和 + 中心球 = R0²(材料一笔不多一笔不少)`,
                sumErr / (R0 * R0) < 0.005,
                `最大差 ${fmt(sumErr, 4)}px²(${fmt(sumErr / (R0 * R0) * 100, 3)}%)`);

            /*
             * 7. 轮廓比默认球大,而且一整轮**稳稳地**比它大。
             *
             * 这里原来挂的是第三版那条「一轮里明显地胀缩(≥1.3 倍)」—— 那条**已经删了**,
             * 因为它是同相位的产物:六颗一起出去又一起回来,外沿才会一胀一缩。这一版
             * 是**持续的射流**,外沿本来就该是稳的(每时每刻都有别的滴在同一个位置化掉);
             * 实测 21.7–22.9px,1.03~1.05 倍。站稳不等于定型 —— 「在动」由上面第 1、3、
             * 4、5 条逐颗逐帧管着,这里只管「不会缩回去像什么都没发生」。
             */
            const edge = rows.map((x) => x.edge);
            check(`${label}:轮廓一直比默认球大(不会缩回去像什么都没发生)`,
                Math.min(...edge) > R0 * 1.4,
                `最小时的外沿 ${fmt(Math.min(...edge))}px(默认球 ${R0}px)`);
            check(`${label}:轮廓一整轮稳稳的(持续射流,不是一起胀缩)`,
                Math.max(...edge) / Math.min(...edge) <= 1.15,
                `${fmt(Math.min(...edge))}–${fmt(Math.max(...edge))}px` +
                `(${fmt(Math.max(...edge) / Math.min(...edge), 2)} 倍)`);
        }

        /*
         * ---- 那张相位表:排得对不对,以及「不转圈」在表上是什么样子 ----
         *
         * 这两条是**结构**上的判据,和上面按帧量的那几条互补:上面量的是「这一刻画出来
         * 的样子对不对」,这里量的是「这张表本身有没有变回转圈/同相」。表是穷举出来挑的
         * (见引擎 CFG 那段:9! 张表里空档最小值 = 120°,能取到的有 180 张,再挑连跑最短
         * 的那张),所以这两条也是**防止有人手贱改表**的那道闸。
         */
        {
            const order = Z.ZOOM_PHASE_ORDER;
            const sorted = order.slice().sort((a, b) => a - b);
            check("相位表是等分格子 {0, 1/N, …, (N−1)/N} 的一个排列(面积守恒全靠这一条)",
                order.length === NZ && sorted.every((v, i) => v === i),
                `表里是 ${order.join(",")}(${NZ} 个方位)`);

            /*
             * 出场次序 = 按相位先后排出来的方位序号。步长(相邻两次出场隔几个方位)
             * **恒定**的表空档最整齐(N=9 时差 4 或 7 格也是 120°),但步长恒定就是
             * 「新滴出现的位置每次往前走固定几格」—— 那正是第二版被否掉的转圈。
             * 所以这里卡两头:步长至少三种取值(不是常数),而且没有一段连跑超过 3 格
             * (连跑 = 连着几次往同一个方向挪,眼睛就跟得上了)。
             */
            const appear = order.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p)
                .map((o) => o.i);
            const aSteps = appear.map((v, j) => ((appear[(j + 1) % NZ] - v) + NZ) % NZ);
            const distinct = new Set(aSteps).size;
            let run = 1, runMax = 1;
            for (let j = 1; j < 2 * NZ; j++) {
                run = aSteps[j % NZ] === aSteps[(j - 1) % NZ] ? run + 1 : 1;
                runMax = Math.max(runMax, run);
            }
            check("出场的方位差不是常数(常数步长 = 转圈,第二版就是这么错的)",
                distinct >= 3, `步长 ${aSteps.join(",")}(${distinct} 种)`);
            check("出场的方位差没有 4 格以上的连跑(连跑 = 新滴朝着一个方向挪,就是转圈)",
                runMax <= 3, `最长连跑 ${runMax} 格`);

            /*
             * 空档:同刻看得见的那几颗在圆周上最大的一个空档。
             *
             * 看得见的那几颗 = 相位表里**相邻的一小段**,所以这一条量的其实就是那张表
             * 的挑选指标(18 个窗口里每个的最大空档 ≤120°)。实测加进各自的 ±ZOOM_SWING_A
             * 抖动之后最大 126.2°,尺子给到 128°。180° 是「三颗里有两颗正好对着」那种
             * 最坏摆法,谁改表改成那样,这里报。
             */
            const gap = sweeps.in.map((x) => x.visGap).concat(sweeps.out.map((x) => x.visGap));
            check("同刻看得见的那几颗,方位散得开(最大空档 ≤128° —— 「四面八方」的尺子)",
                Math.max(...gap) <= 128,
                `最大空档 ${fmt(Math.max(...gap), 1)}°`);
        }

        /*
         * ---- 放大和缩小:同一趟路的两个方向 ----
         *
         * 这两个方向在这套语言里不是两个形状(见引擎:一个入口、方向当参数),这一版
         * 把「同一件事」做得比上一版更硬:缩小用的是**取负的时间**(w = frac(−te/T)),
         * 于是 缩小(t) 和 放大(T−t) 逐颗逐帧就是同一张画 —— 半径一模一样,位置只差各自
         * 的抖动。校验可以对一遍,而不是「看着差不多」。
         *
         * 上一版这里挂的是「两个方向走同一趟路的两头」(d_in + d_out 是常数)和一条
         * ZOOM_OUT_LEG 的节奏断言,那两条在这一版**都不再成立**(两个方向都要出去再回来,
         * 也没有腿了),所以换成了这一条镜像恒等式。
         */
        {
            let rDiff = 0, dDiff = 0;
            const allow = 2 * Z.ZOOM_SWING_D * TRAVEL + 0.05;
            for (let k = 1; k < STEPS; k++) {
                const te = (k * CYCLE) / STEPS;
                const a = asFrame(zfx.sampleZoom(te, 1, "out").balls);
                const b = asFrame(zfx.sampleZoom(CYCLE - te, 1, "in").balls);
                const da = dropsOf(a), db = dropsOf(b);
                for (let i = 0; i < NZ; i++) {
                    rDiff = Math.max(rDiff, Math.abs(R0 * da[i].s - R0 * db[i].s));
                    dDiff = Math.max(dDiff, Math.abs(distOf(da[i]) - distOf(db[i])));
                }
            }
            check("缩小(t) 和 放大(T−t) 是同一张画:逐颗半径一模一样",
                rDiff < 0.01, `半径最大差 ${fmt(rDiff, 5)}px`);
            check("缩小(t) 和 放大(T−t) 是同一张画:逐颗圆心距只差各自的抖动",
                dDiff <= allow,
                `圆心距最大差 ${fmt(dDiff, 3)}px(抖动的额度 ${fmt(allow, 3)}px)`);

            const far = (rows) => Math.max(...rows.flatMap((x) => x.d));
            const near = (rows) => Math.min(...rows.flatMap((x) => x.d));
            const peakOf = (rows) => Math.max(...rows.flatMap((x) => x.r));
            check("两个方向的形状是同一份(最内、最外、半径谱、中心球都对得上)",
                Math.abs(far(sweeps.in) - far(sweeps.out)) <= allow
                && Math.abs(near(sweeps.in) - near(sweeps.out)) < 0.05
                && Math.abs(peakOf(sweeps.in) - peakOf(sweeps.out)) < 0.01
                && Math.abs(sweeps.in[0].core - sweeps.out[0].core) < 0.01,
                `最外 ${fmt(far(sweeps.in))} / ${fmt(far(sweeps.out))}px,` +
                `最内 ${fmt(near(sweeps.in))} / ${fmt(near(sweeps.out))}px,` +
                `峰值半径 ${fmt(peakOf(sweeps.in))} / ${fmt(peakOf(sweeps.out))}px,` +
                `中心球 ${fmt(sweeps.in[0].core)} / ${fmt(sweeps.out[0].core)}px`);
        }

        /*
         * ---- 冷启动那一帧不许弹开 ----
         *
         * 这一条是这一族**真正的坑**,而且只有从静止起步才看得见:状态机的 q 是第一
         * 帧就跳到 0.169 的(一阶滤波,见第 8 节那把尺子),所以「q 还很小的时候
         * 形状已经长到哪儿了」决定了进入这个状态的第一帧会不会啪地弹开。
         *
         * 峰值原来取在 0.32,缩小那一格在 q=0.169 处 D 已经甩到 13px —— 第一帧就是
         * 「中心小球 + 一圈甩开 13px 的液滴」,单帧翻黑 296px²;而别的状态冷启动
         * 那一帧只有 47.4px²。峰值挪到 0.7 之后这个数变成 0。这条判据量的就是这个,
         * 谁把峰值挪回去,这里当场报。
         *
         * 尺子直接用第 8 节量出来的那个基线(文本那一路的起手帧 47.4px²),给到 70。
         * (这个数 2026-09-18 跟着文本的形状从 61.5 换成了 47.4:两颗球在 q≈0.17 处
         *  比原来那条竖线更接近一颗球。门槛 70 两边都够,不用动。)
         */
        for (const [val, label] of [["zoom-in", "放大"], ["zoom-out", "缩小"]]) {
            const s = sandbox();
            const el = s.block({ "--cursor": val });
            const before = REST_FRAME;      // 起步时屏幕上那颗静止球(不在液体层里)
            s.hover(el);
            s.step();
            const first = frameDiff(before, s.frames(), R0);
            check(`进入${label}的第一帧不弹开`, first < 70,
                `第一帧翻黑 ${fmt(first, 1)}px²(基线 47.4px²)`);
            s.unhover(el);
            s.advance(800);
        }

        // ---- 认到哪一格、画的时候是不是就画那一格 ----
        const zi = sandbox();
        const ziEl = zi.block({ "--cursor": "zoom-in" });
        zi.hover(ziEl);
        zi.advance(500);
        let dIn = zi.D();
        check("悬停 zoom-in:进的是放大那一格(名字相同,方向进 key)",
            zi.state() === "zoom" && dIn.wantKey === "zoom:in" && dIn.stateKey === "zoom:in",
            `state="${zi.state()}" wantKey=${dIn.wantKey} stateKey=${dIn.stateKey}`);
        check("屏幕上的球和引擎的放大那一帧逐球一致",
            near(ballDiff(zi.FX().sampleZoom(dIn.te, dIn.q, "in").balls, zi.frames()), 0, 0.01),
            `最大差 ${fmt(ballDiff(zi.FX().sampleZoom(dIn.te, dIn.q, "in").balls, zi.frames()), 4)}px`);

        const zo = sandbox();
        const zoEl = zo.block({ "--cursor": "zoom-out" });
        zo.hover(zoEl);
        zo.advance(500);
        const dOut = zo.D();
        check("悬停 zoom-out:进的是缩小那一格(同一个名字,另一条 key)",
            zo.state() === "zoom" && dOut.wantKey === "zoom:out" && dOut.stateKey === "zoom:out",
            `state="${zo.state()}" wantKey=${dOut.wantKey} stateKey=${dOut.stateKey}`);
        check("屏幕上的球和引擎的缩小那一帧逐球一致",
            near(ballDiff(zo.FX().sampleZoom(dOut.te, dOut.q, "out").balls, zo.frames()), 0, 0.01),
            `最大差 ${fmt(ballDiff(zo.FX().sampleZoom(dOut.te, dOut.q, "out").balls, zo.frames()), 4)}px`);
        check("两个方向画的是两条不同的路径(不是一个形状两个名字)",
            frameDiff(zi.frames(), zo.frames(), R0) > 40,
            `两个方向之间差 ${fmt(frameDiff(zi.frames(), zo.frames(), R0), 0)}px²`);

        // ---- 从放大换到缩小:先收拢再换(同一族两个方向,key 不同)----
        {
            const s = sandbox();
            const el = s.block({ "--cursor": "zoom-in" });
            s.hover(el);
            s.advance(600);
            check("先稳稳地在放大那一格上", s.state() === "zoom" && s.D().stateKey === "zoom:in");
            const other = s.block({ "--cursor": "zoom-out" });
            s.unhover(el);
            s.hover(other);
            /*
             * 换方向这一下「不许硬切」。
             *
             * 判据不能写成「一路上单帧翻黑量都小」—— 这一族的球本来就要走 20 多 px,
             * 全速那几帧的单帧翻黑量有一两百 px²,那是**快**,不是跳,写成「都小」
             * 会把快的部分一起判死。真正要问的是「换的那一帧在两格形状里的哪一处
             * 换的」,所以量的是换 key 那一刻的 q:得先收拢回到一颗球(q≈0)才许换,
             * 这样换的时候两边都还是同一颗球,换的是「接下来往哪儿长」而不是形状
             * 本身。这和上面「拖动缩放」换轴用的是同一把尺子。
             *
             * 顺带把「换的那一帧」本身的翻黑量也量一下:换在 q≈0,就该接近 0。
             */
            let minQ = 1, flipQ = null, flipJump = 0;
            let prev = s.frames();
            for (let i = 0; i < 200 && (flipQ === null || s.rafCount() > 0); i++) {
                s.step();
                const fr = s.frames();
                if (flipQ === null) {
                    minQ = Math.min(minQ, s.q());
                    if (s.D().stateKey === "zoom:out") {
                        flipQ = s.q();
                        flipJump = frameDiff(prev, fr, R0);
                    }
                }
                if (fr) prev = fr;
            }
            check("换之前真的收拢到了一颗球(不是半路硬切过去)",
                minQ <= 0.02, `最小 q=${fmt(minQ, 4)}`);
            /*
             * 换完之后 q 才是从 0.0145 往上长的,而一阶滤波第一帧就能把它推到 0.18,
             * 所以这里读到的 0.18 是「换完长了一帧」,不是「换在半空中」。真正的凭据
             * 是下面那一帧的翻黑量:两边都还是一颗球,换的只是接下来往哪儿长。
             */
            check("换的那一帧 q 还在一颗球的量级上(才长了一帧)", flipQ !== null && flipQ <= 0.25,
                `换后第一帧 q=${fmt(flipQ, 4)}`);
            check("换的那一帧没跳", flipJump < 70,
                `翻黑 ${fmt(flipJump, 1)}px²(别的状态冷启动那一帧是 47.4px²)`);
            check("换完落在缩小那一格上", s.D().stateKey === "zoom:out", s.D().stateKey);
        }
    }

    console.log(`\n${total - bad}/${total} 通过` + (bad ? `  —— ${bad} 条没过` : ""));
    process.exit(bad ? 1 : 0);
}

runTests();
