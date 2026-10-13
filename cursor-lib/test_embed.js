/*
 * cursor-embed 的校验。
 *
 *     node cursor-lib/test_embed.js
 *
 * 这个环境里没有浏览器,「打开看一眼」这条路不存在。能替代它的只有一件事:把 DOM 桩
 * 做得够真,然后对着**运行时真的算出来的东西**断言 —— 尤其是那些看一眼也看不出来的
 * 地方:意图解成了什么、藏光标碰了谁、销毁有没有还干净、按下那一刻画面上有没有闪出
 * 一颗普通球。
 *
 * 最后一节是这份文件里最要紧的一节:把包**故意改坏**几处,确认上面那些断言真的会红。
 * 一条永远不会红的断言等于没写,而且比没写更坏 —— 它让人以为那件事被验住了。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const BUNDLE = fs.readFileSync(path.join(__dirname, "cursor-embed.js"), "utf8");
const ENGINE_ONLY = fs.readFileSync(path.join(ROOT, "cursor-fx.js"), "utf8");

let bad = 0;
let total = 0;
function check(name, cond, detail) {
    total++;
    if (!cond) bad++;
    console.log(`  ${cond ? "✓" : "!!"} ${name}${detail ? "  — " + detail : ""}`);
}
function section(t) { console.log(`\n=== ${t} ===`); }
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps);

/* ───────────────────────── 几何:量「这一帧离一颗普通球有多远」 ───────────────────────── */

/*
 * 从原点出发的射线积分求圆的并集面积。搬的是 tools/cursor-fx/test_hover.js 里那一份
 * (那边的输出被几百条断言对着),连它注释里那条坑一起搬:
 * 差集面积必须写成 2|A∪B| − |A| − |B|,不能写成 |A|+|B|−2|A∩B| —— 后者符号一反,
 * 不管两帧差多少都恒等于 0,就成了一条永远通过的假测试。
 */
const R0 = 13;
const BALL_AREA = Math.PI * R0 * R0;                       // 531px²,下面所有阈值都以它当尺子
const REST_FRAME = [{ x: 0, y: 0, s: 1, on: true }];       // 静止时的光标:一颗 R0 的球
/*
 * 引擎内部用 scale,渲染那边叫 s —— 两个名字指的是同一件东西。量几何的一律先过这里,
 * 免得「面积算出 NaN」被当成形状坏了。on:false 的槽是关掉的球(池子只长不缩),不算数。
 */
function visible(fr) {
    const out = [];
    for (const b of fr || []) {
        if (!b || b.on === false) continue;
        out.push({ x: b.x, y: b.y, s: b.scale === undefined ? b.s : b.scale, on: true });
    }
    return out;
}
const asFrame = (balls) => visible(balls);
function area(fr, rays) {
    const n = rays || 720, two_pi = 2 * Math.PI;
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
function frameDiff(a, b) {
    const va = visible(a), vb = visible(b);
    return Math.max(0, 2 * area(va.concat(vb)) - area(va) - area(vb));
}
// 这一帧有多不像「一颗普通球」
const ballLike = (fr) => frameDiff(fr, REST_FRAME);

/* ───────────────────────── DOM 桩 ───────────────────────── */

/*
 * 桩里唯一需要「像真的」的地方是 CSS 继承,因为整个藏光标的修法就架在它上面:
 *   · 自己声明过 cursor 的元素 -> 用自己的值(于是读得到,也显示得出来)
 *   · 没声明过的 -> 从父级继承,一路到根上是 none(隐藏类挂在 html 上)
 * 桩里把这个模型明明白白写出来,而不是「假装 getComputedStyle 会返回什么」——
 * 后者等于把要验的东西直接写进桩里,那就什么都没验。
 */
function makeDOM(o0) {
    const o = o0 || {};
    const doc = {
        readyState: "complete",
        listeners: {},
        currentScript: null,
    };

    function makeStyle() {
        const decl = {}, prio = {};
        return {
            setProperty(k, v, p) { decl[k] = String(v); prio[k] = p || ""; },
            getPropertyValue(k) { return decl[k] === undefined ? "" : decl[k]; },
            getPropertyPriority(k) { return prio[k] || ""; },
            removeProperty(k) { const v = decl[k] || ""; delete decl[k]; delete prio[k]; return v; },
        };
    }

    function makeEl(tag) {
        const el = {
            nodeType: 1,
            tagName: String(tag).toUpperCase(),
            style: makeStyle(),
            _own: {},          // 它在样式表里声明了什么
            _attrs: {},
            _cls: new Set(),
            children: [],
            parentNode: null,
            classList: {
                add(c) { el._cls.add(c); },
                remove(c) { el._cls.delete(c); },
                contains(c) { return el._cls.has(c); },
                toggle(c, v) { if (v) el._cls.add(c); else el._cls.delete(c); },
            },
            getAttribute(k) { return el._attrs[k] === undefined ? null : el._attrs[k]; },
            setAttribute(k, v) { el._attrs[k] = String(v); },
            removeAttribute(k) { delete el._attrs[k]; },
            appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
            remove() {
                if (!el.parentNode) return;
                const i = el.parentNode.children.indexOf(el);
                if (i >= 0) el.parentNode.children.splice(i, 1);
                el.parentNode = null;
            },
            addEventListener(t, fn) { (el.listeners = el.listeners || {})[t] = fn; },
            removeEventListener() {},
        };
        Object.defineProperty(el, "className", {
            get() { return Array.from(el._cls).join(" "); },
            set(v) { el._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
        });
        return el;
    }

    const html = makeEl("html");
    const body = makeEl("body");
    html.appendChild(body);
    doc.documentElement = html;
    doc.body = body;

    function computed(el, prop) {
        if (prop === "cursor") {
            const inl = el.style.getPropertyValue("cursor");
            if (inl) return inl;
            if (el._own.cursor) return el._own.cursor;
            if (el.parentNode && el.parentNode.nodeType === 1) return computed(el.parentNode, prop);
            return html._cls.has("cfx-embed-on") ? "none" : "auto";
        }
        if (el._own[prop] !== undefined) return el._own[prop];
        const inl = el.style.getPropertyValue(prop);
        if (inl) return inl;
        if (el.parentNode && el.parentNode.nodeType === 1) return computed(el.parentNode, prop);
        return "";
    }

    doc.createElement = (t) => makeEl(t);
    doc.createElementNS = (ns, t) => makeEl(t);
    doc.getElementById = () => null;
    doc.addEventListener = (t, fn) => { doc.listeners[t] = fn; };
    doc.removeEventListener = () => {};

    let NOW = 1000;
    const frames = [];
    const win = {
        document: doc,
        listeners: {},
        addEventListener(t, fn) { win.listeners[t] = fn; },
        removeEventListener() {},
        // 默认:桌面。悬停得了、主指针是精细指针、没开减弱动效 —— 一台普通电脑的样子
        matchMedia(q) {
            const v = (o.media || {})[q];
            return { matches: v === undefined ? (q !== "(prefers-reduced-motion: reduce)") : !!v, media: q };
        },
        performance: { now: () => NOW },
        requestAnimationFrame(cb) { frames.push(cb); return frames.length; },
        cancelAnimationFrame() {},
        setTimeout() { return 0; },
    };
    win.window = win;
    win.getComputedStyle = (el) => ({
        cursor: computed(el, "cursor"),
        getPropertyValue: (k) => computed(el, k),
    });

    return {
        win, doc, html, body,
        frame(dt) {
            NOW += dt;
            const q = frames.splice(0, frames.length);
            q.forEach((cb) => cb(NOW));
        },
        // 还有几帧排在队里。空闲时循环会自己停,这一条就是「它真的停了」唯一看得见的证据
        pending() { return frames.length; },
    };
}

function sandbox(src, opts) {
    const o = opts || {};
    const dom = makeDOM(o);
    // manual 就是「买家在 script 标签上写了 data-manual」:自动起步别发生
    if (o.manual) dom.win.CursorEmbedManual = true;
    const ctx = vm.createContext(dom.win);
    ctx.console = console;
    vm.runInContext(src, ctx, { filename: "cursor-embed.js" });
    return dom;
}

function el(dom, tag, own, attrs, parent) {
    const e = dom.doc.createElement(tag);
    Object.assign(e._own, own || {});
    Object.assign(e._attrs, attrs || {});
    (parent || dom.body).appendChild(e);
    return e;
}
const over = (dom, e) => dom.doc.listeners.pointerover({ target: e, relatedTarget: null });
const moveTo = (dom, x, y) => dom.win.listeners.pointermove({ clientX: x, clientY: y });
function settle(dom, n) { for (let i = 0; i < (n || 60); i++) dom.frame(16); }

// 球那一层。别拿 body.children 数:测试元素也挂在 body 上
const hosts = (dom) => dom.body.children.filter((c) => c._cls && c._cls.has("cfx-embed"));
const host = (dom) => hosts(dom)[0] || null;

/* ═════════════════════════ 1. 同源 ═════════════════════════ */

section("1. 引擎同源:库里跑的和站上跑的是同一份");

{
    const a = sandbox(BUNDLE, { manual: true });
    const b = sandbox(ENGINE_ONLY, { manual: true });
    const EA = a.win.CursorFX, EB = b.win.CursorFX;
    const cases = [[0, 0], [900, 0.2], [1500, 0.55], [2600, 1], [4200, 0.8]];
    let worst = 0, worstAt = "";
    for (const s of ["sampleViscous", "sampleBurst", "sampleBeam", "sampleSplat"]) {
        for (const [te, q] of cases) {
            const ra = asFrame(EA[s](te, q).balls), rb = asFrame(EB[s](te, q).balls);
            if (ra.length !== rb.length) { worst = Infinity; worstAt = s + " 球数"; continue; }
            for (let i = 0; i < ra.length; i++) {
                const d = Math.max(Math.abs(ra[i].x - rb[i].x), Math.abs(ra[i].y - rb[i].y), Math.abs(ra[i].s - rb[i].s));
                if (d > worst) { worst = d; worstAt = `${s} te=${te} q=${q} #${i}`; }
            }
        }
    }
    check("四个形状 × 五个时刻,库里和站上逐球完全相等", worst === 0, `最大差 ${worst}(${worstAt})`);

    let zoomWorst = 0;
    for (const m of ["in", "out"]) {
        for (const [te, q] of cases) {
            const ra = asFrame(EA.sampleZoom(te, q, m).balls), rb = asFrame(EB.sampleZoom(te, q, m).balls);
            if (ra.length !== rb.length) { zoomWorst = Infinity; continue; }
            for (let i = 0; i < ra.length; i++) {
                zoomWorst = Math.max(zoomWorst, Math.abs(ra[i].x - rb[i].x), Math.abs(ra[i].y - rb[i].y), Math.abs(ra[i].s - rb[i].s));
            }
        }
    }
    check("放大/缩小两向逐球完全相等", zoomWorst === 0, String(zoomWorst));

    let resizeOk = true, resizeN = 0;
    for (const v of Object.keys(EB.RESIZE_AXIS)) {
        resizeN++;
        const ra = JSON.stringify(asFrame(EA.sampleResize(1234, 0.7, EA.RESIZE_AXIS[v]).balls));
        const rb = JSON.stringify(asFrame(EB.sampleResize(1234, 0.7, EB.RESIZE_AXIS[v]).balls));
        if (ra !== rb) resizeOk = false;
    }
    check(`缩放族 ${resizeN} 个值逐个相等`, resizeOk && resizeN === 14, resizeN + " 个值");

    check("包里是引擎的原文,不是精简或改写过的另一份",
        BUNDLE.indexOf(ENGINE_ONLY.replace(/\s*$/, "")) >= 0);
}

/* ═════════════════════════ 2. 意图 ═════════════════════════ */

section("2. 意图:三条通道的优先级");

{
    const dom = sandbox(BUNDLE, { manual: true });
    const inst = dom.win.CursorEmbed.init();
    const val = () => inst._debug().hoverValue;

    const link = el(dom, "a", { cursor: "pointer" });
    const txt = el(dom, "p", { cursor: "text" });
    const plain = el(dom, "div", {});
    const attr = el(dom, "span", { cursor: "pointer" }, { "data-cursor": "not-allowed" });
    const chan = el(dom, "div", { "--cursor": "zoom-in" });
    const offc = el(dom, "div", { "--cursor": "auto", cursor: "pointer" });
    const offd = el(dom, "div", { "--cursor": "default", cursor: "pointer" });
    const outer = el(dom, "div", { "--cursor": "pointer" });
    const inner = el(dom, "div", { "--cursor": "text" }, {}, outer);

    over(dom, link); check("没写别的时回落到真的 cursor:<a> 解出 pointer", val() === "pointer", val());
    over(dom, txt); check("正文解出 text", val() === "text", val());
    over(dom, plain); check("什么都没声明的解出空(不提要求)", val() === "", JSON.stringify(val()));
    over(dom, attr); check("data-cursor 压过真 cursor", val() === "not-allowed", val());
    over(dom, chan); check("--cursor 压过真 cursor", val() === "zoom-in", val());
    over(dom, offc); check("--cursor: auto 是「明确不提要求」,不再往下落到 cursor 上",
        val() === "", JSON.stringify(val()));
    over(dom, offd); check("--cursor: default 同上", val() === "", JSON.stringify(val()));
    over(dom, inner); check("--cursor 会继承,子级写得比父级更近就用子级的",
        val() === "text", val());
    const heir = el(dom, "div", {}, {}, outer);
    over(dom, heir); check("--cursor 会继承:子级没写就用父级的", val() === "pointer", val());
}

/* ═════════════════════════ 3. 藏光标 ═════════════════════════ */

section("3. 藏光标:只碰自己声明过 cursor 的元素");

{
    const dom = sandbox(BUNDLE, { manual: true });
    const E = dom.win.CursorEmbed;
    const inst = E.init();

    check("隐藏类挂在 html 上", dom.html._cls.has(E.HIDE_CLASS));

    const link = el(dom, "a", { cursor: "pointer" });
    const plain = el(dom, "div", {});
    const help = el(dom, "div", { cursor: "help" });
    const xhair = el(dom, "div", { cursor: "crosshair" });

    over(dom, link);
    check("声明过 pointer 的被补了行内 none",
        link.style.getPropertyValue("cursor") === "none"
        && link.style.getPropertyPriority("cursor") === "important");

    over(dom, plain);
    check("没声明过的**不动它**(系统光标早被继承来的 none 藏掉了)",
        plain.style.getPropertyValue("cursor") === "");

    // 修法的核心:藏过一块之后,别的元素仍然读得出自己的真值。本站那条 `*` 做不到
    check("藏过 link 之后,help 那块仍然读得出 cursor:help",
        dom.win.getComputedStyle(help).cursor === "help");
    over(dom, help);
    check("画不出来的值不让位:help 那块没被补行内 none",
        help.style.getPropertyValue("cursor") === "");
    check("而且它被判定成让位", inst._debug().handover === true);

    over(dom, xhair);
    check("让位的那块一直读得到(让位靠的是「没藏过」,不是「藏了又还」)",
        dom.win.getComputedStyle(xhair).cursor === "crosshair"
        && xhair.style.getPropertyValue("cursor") === "");

    const nested = el(dom, "a", { cursor: "crosshair" }, {}, link);
    over(dom, nested);
    check("被藏过的元素的后代,只要自己声明了就还读得到",
        inst._debug().hoverValue === "crosshair", inst._debug().hoverValue);

    const n0 = inst._debug().hiddenCount;
    over(dom, link); over(dom, link);
    check("同一块再来一遍不会重复藏(记过的不再读)", inst._debug().hiddenCount === n0,
        `${n0} -> ${inst._debug().hiddenCount}`);
    inst.destroy();
}

/*
 * 藏一个祖先 = 往它身上写一条行内 cursor:none = 它**底下所有没自己声明过的后代**
 * 也一起变成 none(继承)。这是这套修法唯一的副作用,而它恰恰会打在最常见的那种
 * 结构上:<button><span>保存</span></button>。
 *
 * 三条路一起验:后代自己声明的、直接划到后代上时继承来的、祖先已经被藏过之后
 * 才划过去的。
 */
{
    const dom = sandbox(BUNDLE, { manual: true });
    const inst = dom.win.CursorEmbed.init();
    const val = () => inst._debug().hoverValue;

    const b1 = el(dom, "button", { cursor: "pointer" });
    const s1 = el(dom, "span", {}, {}, b1);
    over(dom, s1);
    check("直接划到没声明的后代上:继承来的 pointer 读得到", val() === "pointer", val());

    const b2 = el(dom, "button", { cursor: "pointer" });
    const s2 = el(dom, "span", {}, {}, b2);
    over(dom, b2);                       // 先把祖先判了、藏了
    over(dom, s2);
    check("祖先已经被藏过之后,后代仍然解得出 pointer(往上找回来)",
        val() === "pointer", val());

    const b3 = el(dom, "button", { cursor: "pointer" });
    const s3 = el(dom, "span", { cursor: "grab" }, {}, b3);
    over(dom, b3);
    over(dom, s3);
    check("后代自己声明过就以它为准,不被祖先盖掉", val() === "grab", val());

    const b4 = el(dom, "button", { cursor: "pointer" });
    const s4 = el(dom, "span", { cursor: "auto" }, {}, b4);
    over(dom, b4);
    over(dom, s4);
    check("后代写 cursor:auto 就是明确不提要求,不会往上捡到祖先的",
        val() === "", JSON.stringify(val()));

    const b5 = el(dom, "button", { cursor: "help" });   // 让位的那一族
    const s5 = el(dom, "span", {}, {}, b5);
    over(dom, s5);
    check("祖先让位时后代也跟着让位,而且系统光标本来就没被藏",
        val() === "help" && inst._debug().handover === true && b5.style.getPropertyValue("cursor") === "",
        val() + " / " + JSON.stringify(b5.style.getPropertyValue("cursor")));
    inst.destroy();
}

/*
 * 浏览器不替我们表态的那些元素。
 *
 * 一段**一个字都没改**的 HTML 贴进来,指针划过 <button> 得有反应 —— 这是「买回来
 * 就能用」和「买回来像坏的」之间的分界。而浏览器恰恰不给 button 一个 cursor:pointer,
 * 所以这一条只能靠按标签认。
 */
{
    const dom = sandbox(BUNDLE, { manual: true });
    const inst = dom.win.CursorEmbed.init();
    const shapeOf = (node) => { over(dom, node); return inst._debug().hover; };
    const plain = (tag, attrs) => shapeOf(el(dom, tag, {}, attrs || {}));

    check("<button> 不改一个字就是可点击",
        plain("button") === "viscous", plain("button"));
    check("<a href> 是", plain("a", { href: "#" }) === "viscous");
    check("<a> 没有 href 就不是(它真的点不动)", plain("a") === "", plain("a"));
    check("<input> 默认是文本", plain("input") === "beam", plain("input"));
    check("<input type=email> 也是文本", plain("input", { type: "email" }) === "beam");
    check("<input type=checkbox> 是拿鼠标点的,所以可点击",
        plain("input", { type: "checkbox" }) === "viscous");
    check("<input type=range> 同理", plain("input", { type: "range" }) === "viscous");
    check("<textarea> 是文本", plain("textarea") === "beam");
    check("<select> 可点击", plain("select") === "viscous");
    check("<label> 可点击", plain("label") === "viscous");
    check("<summary> 可点击", plain("summary") === "viscous");
    check('<div role="button"> 可点击', plain("div", { role: "button" }) === "viscous");
    check("<div contenteditable> 是一块可编辑的文本面",
        plain("div", { contenteditable: "" }) === "beam");
    check("<div> 还是什么都不做 —— 推断没有把普通元素也卷进来",
        plain("div") === "", JSON.stringify(plain("div")));

    // 推断排在三条通道之后:页面自己写过的永远赢
    check("按钮上明写 cursor:help 就是让位,推断不许把它盖成可点击",
        (() => { const b = el(dom, "button", { cursor: "help" }); over(dom, b);
            return inst._debug().hover === "" && inst._debug().handover === true; })(),
        shapeOf(el(dom, "button", { cursor: "help" })));
    check("按钮上写 cursor:default 仍然是可点击(default 是「照平台来」,不是意见)",
        (() => { const b = el(dom, "button", { cursor: "default" }); over(dom, b);
            return inst._debug().hover === "viscous"; })());
    check('data-cursor="auto" 是明确的开关,关掉推断',
        plain("button", { "data-cursor": "auto" }) === "", plain("button", { "data-cursor": "auto" }));
    check("--cursor: auto 同样关得掉",
        (() => { const b = el(dom, "button", { "--cursor": "auto" }); over(dom, b);
            return inst._debug().hover === ""; })());

    // 祖先被藏过之后,后代身上的「我是按钮」也得留着(祖先那条路会把它捡回来)
    const bb = el(dom, "button");
    const ss = el(dom, "span", {}, {}, bb);
    over(dom, bb);
    over(dom, ss);
    check("被藏过的按钮里面的 span 仍然解得出可点击", inst._debug().hover === "viscous",
        inst._debug().hover);
    inst.destroy();
}

/* ═════════════════════════ 4. destroy ═════════════════════════ */

section("4. destroy:藏过的全部还回去,自己留下的全部收走");

{
    const dom = sandbox(BUNDLE, { manual: true });
    const E = dom.win.CursorEmbed;
    const inst = E.init();

    const a = el(dom, "a", { cursor: "pointer" });
    const b = el(dom, "button", { cursor: "pointer" });
    const c = el(dom, "div", { cursor: "grab" });
    a.style.setProperty("cursor", "zoom-in", "important");   // 页面自己写过的行内值,要原样还回去
    [a, b, c].forEach((e) => over(dom, e));
    check("三块都被藏了", inst._debug().hiddenCount === 3, String(inst._debug().hiddenCount));
    check("壳进了 DOM(否则「收走」这一条没意义)", hosts(dom).length === 1);

    inst.destroy();
    check("a 还回页面自己那个行内值,连 !important 一起",
        a.style.getPropertyValue("cursor") === "zoom-in" && a.style.getPropertyPriority("cursor") === "important",
        a.style.getPropertyValue("cursor") + " / " + a.style.getPropertyPriority("cursor"));
    check("b 原本没有行内值,还回去之后也没有", b.style.getPropertyValue("cursor") === "");
    check("c 的行内 none 被摘掉", c.style.getPropertyValue("cursor") === "");
    check("隐藏类摘掉了", !dom.html._cls.has(E.HIDE_CLASS));
    check("壳从 DOM 里移走了", hosts(dom).length === 0 && host(dom) === null, String(hosts(dom).length));
    inst.destroy();
    check("再 destroy 一次不出事", inst._debug().dead === true);
}

/* ═════════════════════════ 5. 状态机 ═════════════════════════ */

section("5. 状态机:一颗球、进形状、先收拢再换形、按下直接交接");

{
    const dom = sandbox(BUNDLE, { manual: true });
    const inst = dom.win.CursorEmbed.init();
    const plain = el(dom, "div", {});
    const link = el(dom, "a", { cursor: "pointer" });
    const bad1 = el(dom, "div", { cursor: "not-allowed" });

    moveTo(dom, 300, 200);
    settle(dom, 10);
    check("什么都不在上面时,和那颗静止球逐像素一致(差集 0px²)",
        ballLike(inst._debug().balls) === 0, ballLike(inst._debug().balls).toFixed(3) + "px²");

    over(dom, plain);
    settle(dom, 20);
    check("划到没提要求的元素上,还是那颗球",
        inst._debug().state === "" && ballLike(inst._debug().balls) === 0);

    over(dom, link);
    settle(dom, 60);
    let d = inst._debug();
    check("划到可点击的块上,进的是 viscous、q 到 1",
        d.state === "viscous" && near(d.q, 1, 1e-3), JSON.stringify({ state: d.state, q: d.q }));
    // 量出来的:那一坨离一颗普通球 127px²,而那颗球自己离自己 0px²。
    // 门槛压在 100,是留一截余量给浮点,同时仍然能把「其实还是那颗球」挡在外面。
    check("形状确实是一坨(不是一颗球)", ballLike(d.balls) > 100, ballLike(d.balls).toFixed(1) + "px²");
    check("帧里不留废球(留了池子会越长越大)", d.balls.every((b) => b.on !== false));

    // 可点击 -> 不可点击:换的是形状,所以**应该**先收拢成一颗球
    over(dom, bad1);
    let minLike = Infinity;
    for (let i = 0; i < 60; i++) { dom.frame(16); minLike = Math.min(minLike, ballLike(inst._debug().balls)); }
    check("换形状(可点击 -> 不可点击)中间确实经过一颗普通球 —— 这是对的",
        minLike < 1, minLike.toFixed(3) + "px²");
    check("最终停在 burst 上", inst._debug().state === "burst", inst._debug().state);

    // 按下:两头有「那一摊」时,全程不许出现一颗普通球
    over(dom, link);
    settle(dom, 60);
    dom.win.listeners.pointerdown({ target: link });
    let pressMin = Infinity, pressMaxJump = 0, prev = inst._debug().balls, outFrames = 0, together = 0;
    for (let i = 0; i < 60; i++) {
        dom.frame(16);
        const dd = inst._debug();
        pressMin = Math.min(pressMin, ballLike(dd.balls));
        pressMaxJump = Math.max(pressMaxJump, frameDiff(prev, dd.balls));
        if (dd.out) { outFrames++; if (dd.q > 0.25) together++; }
        prev = dd.balls;
    }
    check("按下时全程离那颗普通球都在 50px² 以上(直接交接,不经过 q=0)",
        pressMin > 50, `最像球的一帧 ${pressMin.toFixed(2)}px²(门槛 50,普通球本身是 0)`);
    check("交接的两格确实同时在画面里(不是旧的先消失、新的才开始)",
        outFrames >= 3 && together >= 1, `退场格在场 ${outFrames} 帧,其中 ${together} 帧两边都还在`);
    check("交接不许变成一次跳(单帧翻转量在 531px² 的一倍半以内)",
        pressMaxJump < BALL_AREA * 1.5, pressMaxJump.toFixed(1) + "px²");

    dom.win.listeners.pointerup({ target: link });
    settle(dom, 60);
    d = inst._debug();
    check("松手回到 viscous", d.state === "viscous", d.state);
    check("松手之后退场那一格被摘掉了", d.out === "", d.out);
}

/* ═════════════════════════ 6. 减弱动效 ═════════════════════════ */

section("6. 减弱动效:只跟手,不形变不缩");

{
    const dom = sandbox(BUNDLE, { manual: true, media: { "(prefers-reduced-motion: reduce)": true } });
    const inst = dom.win.CursorEmbed.init();
    check("读到了这个偏好", inst._debug().reduceMotion === true);

    const link = el(dom, "a", { cursor: "pointer" });
    over(dom, link);
    settle(dom, 40);
    check("指针底下是可点击,但根本不进状态", inst._debug().state === "", JSON.stringify(inst._debug().state));
    check("画的还是一颗球", ballLike(inst._debug().balls) === 0);

    dom.win.listeners.pointerdown({ target: link });
    settle(dom, 40);
    check("按下也不缩(press 保持 0)", inst._debug().press === 0, String(inst._debug().press));
    check("按下也不换成那一摊", inst._debug().state === "", JSON.stringify(inst._debug().state));
}

/* ═════════════════════════ 7. 配置项 ═════════════════════════ */

section("7. 配置项真的生效");

{
    const dom = sandbox(BUNDLE, { manual: true });
    const E = dom.win.CursorEmbed;
    const inst = E.init({ size: 39, color: "#c0392b", shadow: false, zIndex: 4242, hideNative: false });
    const h = host(dom);
    check("zIndex 写到了壳上", h.style.zIndex === "4242", h.style.zIndex);
    moveTo(dom, 10, 20);
    check("size 折算成 39/26 的缩放进了 transform",
        /scale\(1\.5000\)/.test(h.style.transform), h.style.transform);
    check("字符串颜色铺成四个停靠点(于是渐变是平的)",
        ["hi", "mid", "lo", "ink"].every((k) => h.style.getPropertyValue("--cfx-" + k) === "#c0392b"),
        h.style.getPropertyValue("--cfx-hi"));
    check("shadow:false 挂上了那个类", h._cls.has("cfx-embed-no-shadow"));
    check("hideNative:false 就不挂隐藏类", !dom.html._cls.has(E.HIDE_CLASS));

    const link = el(dom, "a", { cursor: "pointer" });
    over(dom, link);
    check("hideNative:false 时连声明过的元素也不碰", link.style.getPropertyValue("cursor") === "");
    inst.destroy();
}

{
    const dom = sandbox(BUNDLE, { manual: true });
    const inst = dom.win.CursorEmbed.init({ color: { hi: "#fff", ink: "#000" } });
    const h2 = host(dom);
    check("对象颜色只改点到的那些,其余留给出厂值",
        h2.style.getPropertyValue("--cfx-hi") === "#fff"
        && h2.style.getPropertyValue("--cfx-ink") === "#000"
        && h2.style.getPropertyValue("--cfx-mid") === "",
        JSON.stringify(h2.style.getPropertyValue("--cfx-mid")));
    inst.destroy();
}

/* ═════════════════════════ 8. 自动起步 ═════════════════════════ */

section("8. 自动起步:默认自己起,三种情况不起");

{
    const dom = sandbox(BUNDLE, {});        // 什么都不写,只是把脚本引进来
    check("页面还没动过,球已经在了", hosts(dom).length === 1);
    check("隐藏类已经挂上", dom.html._cls.has("cfx-embed-on"));
    moveTo(dom, 5, 6);
    check("指针一动就亮起来", host(dom).style.display === "");
    dom.win.CursorEmbed.destroy();
}

{
    const dom = sandbox(BUNDLE, { manual: true });
    check("window.CursorEmbedManual = true 时不起", hosts(dom).length === 0);
    check("但 API 还在,随时能自己 init()", typeof dom.win.CursorEmbed.init === "function");
}

{
    const dom = sandbox(BUNDLE, { media: { "(hover: hover) and (pointer: fine)": false } });
    check("触屏(主指针不是精细指针,悬停不了)时不起", hosts(dom).length === 0);
}

{
    // data-manual 是读 document.currentScript 的,必须同步读到 —— 桩里放一个进去
    const dom = makeDOM({});
    dom.doc.currentScript = { getAttribute: (k) => (k === "data-manual" ? "" : null) };
    const ctx = vm.createContext(dom.win);
    ctx.console = console;
    vm.runInContext(BUNDLE, ctx, { filename: "cursor-embed.js" });
    check("<script data-manual> 时不起", hosts(dom).length === 0);
    const inst = dom.win.CursorEmbed.init();
    check("自己 init() 一下照样能用", hosts(dom).length === 1);
    check("返回的实例上四个口子都在",
        typeof inst.set === "function" && typeof inst.setWaiting === "function"
        && typeof inst.refresh === "function" && typeof inst.destroy === "function");
    inst.destroy();
}

{
    const dom = makeDOM({});
    dom.doc.readyState = "loading";     // 脚本在 <head> 里,body 还不存在
    const ctx = vm.createContext(dom.win);
    ctx.console = console;
    vm.runInContext(BUNDLE, ctx, { filename: "cursor-embed.js" });
    check("DOM 还没备好时先不建(那会儿 body 都没有)", hosts(dom).length === 0);
    check("它排在了 DOMContentLoaded 上", typeof dom.doc.listeners.DOMContentLoaded === "function");
    dom.doc.listeners.DOMContentLoaded();
    check("DOM 备好之后自己起了", hosts(dom).length === 1);
}

/* ═════════════════════════ 9. 手动接管 ═════════════════════════ */

section("9. 手动接管与「等一等」");

{
    const dom = sandbox(BUNDLE, { manual: true });
    const inst = dom.win.CursorEmbed.init();
    const link = el(dom, "a", { cursor: "pointer" });
    over(dom, link);
    settle(dom, 60);
    check("自动判到了 viscous", inst._debug().state === "viscous");

    inst.set("not-allowed");
    settle(dom, 60);
    check("手动压过自动,变成 burst", inst._debug().state === "burst", inst._debug().state);
    check("手动指定不改变意图的读法(hoverValue 仍是 pointer)",
        inst._debug().hoverValue === "pointer", inst._debug().hoverValue);

    check("给了不认识的值返回 false", inst.set("不存在的值") === false);
    settle(dom, 60);
    check("而且什么都不动(不会悄悄退回自动)", inst._debug().state === "burst", inst._debug().state);

    inst.set(null);
    settle(dom, 60);
    check("交还给自动之后回到 viscous", inst._debug().state === "viscous", inst._debug().state);

    inst.setWaiting(true);
    settle(dom, 60);
    check("等一等:收成一颗球", ballLike(inst._debug().balls) === 0);
    inst.setWaiting(false);
    settle(dom, 60);
    check("等完了自己长回来", inst._debug().state === "viscous", inst._debug().state);

    const grabbed = el(dom, "div", { cursor: "grab" });
    over(dom, grabbed);
    settle(dom, 60);
    check("grab 和 pointer 是同一格(两族之间来回换不该收拢)",
        inst._debug().state === "viscous", inst._debug().state);
    dom.win.listeners.pointerdown({ target: grabbed });
    settle(dom, 60);
    check("按下去换成那一摊", inst._debug().state === "splat", inst._debug().state);
    dom.win.listeners.pointerup({ target: grabbed });
    settle(dom, 60);

    dom.win.listeners.blur();
    settle(dom, 5);
    check("窗口失焦当成松手", inst._debug().pressing === false);

    dom.doc.listeners.pointerleave({});
    check("指针离开文档时藏起来", host(dom).style.display === "none");

    moveTo(dom, 7, 8);
    dom.doc.listeners.pointerout({ relatedTarget: el(dom, "div", {}) });
    check("只是移到别的元素上(relatedTarget 有值)不当成离开文档",
        inst._debug().inside === true && host(dom).style.display === "");

    dom.doc.listeners.pointerout({ relatedTarget: null });
    check("指针出到别的窗口(relatedTarget 是 null)才当成离开",
        inst._debug().inside === false && host(dom).style.display === "none");
    inst.destroy();
}

/*
 * 改配置只能整只重建,而重建之后指针并没有动过 ——
 * 所以球得留在原地。少了这一条,调大小/调颜色的每一格都会把球闪没。
 */
section("9b. 改配置是「换一只」,不是「关掉」");
{
    const dom = sandbox(BUNDLE, { manual: true });
    const E = dom.win.CursorEmbed;
    let inst = E.init();
    moveTo(dom, 420, 310);
    settle(dom, 4);
    check("先得是亮着的,不然下面两条没意义", inst._debug().inside === true);

    inst = E.init({ size: 40 });
    let d = inst._debug();
    check("重建之后球还在指针那儿(没回原点、也没藏着)",
        d.inside === true && d.x === 420 && d.y === 310,
        JSON.stringify({ on: d.inside, x: d.x, y: d.y }));
    check("而且配置真的换了", inst.opts.size === 40 && inst.opts.size !== E.DEFAULTS.size);
    check("旧那只收干净了(同时只留一只壳)", hosts(dom).length === 1, String(hosts(dom).length));

    inst.destroy();
    inst = E.init();
    d = inst._debug();
    check("明着 destroy 之后再起,就是重新开始,不从旧位置接着画",
        d.inside === false && d.x < 0, JSON.stringify({ on: d.inside, x: d.x }));
    inst.destroy();
}

/* ═════════════════════════ 9c. 没人动的时候别空转 ═════════════════════════ */

section("9c. 指针停下之后就自己停,再动一下自己醒");

{
    const dom = sandbox(BUNDLE, { manual: true });
    const inst = dom.win.CursorEmbed.init();
    const link = el(dom, "a", { cursor: "pointer" });
    const plain = el(dom, "div", {});

    over(dom, plain);
    moveTo(dom, 300, 200);
    check("刚动过的时候确实有帧在排", dom.pending() > 0, dom.pending() + " 帧");

    // 指针不动也不按,该收的收干净后队列应该空掉 —— 一个鼠标动效在用户看别的窗口时
    // 还在每秒烧 60 帧,是会被抱怨的
    settle(dom, 240);
    check("指针不动、形状收干净之后,rAF 队列空了(不再空转)",
        dom.pending() === 0, dom.pending() + " 帧还排着");

    // 干等五秒:队列是空的,所以这五秒里什么都不会跑
    dom.frame(5000);
    check("空转停掉之后,干等五秒也不会自己醒过来", dom.pending() === 0);

    /*
     * 睡着的状态下在**同一个元素里**继续挪:不该醒。
     * 一条 pointermove 只要不跨元素,就没有任何随时间变化的东西 —— 形状是 0、没按、
     * 也没有退场格。跟手这件事根本不用帧:place() 是直接写 transform 的。
     * 所以这里既要求它别醒,又要求它照样跟得上 —— 少了后半句,「一直不醒」也能通过。
     */
    moveTo(dom, 480, 360);
    check("睡着的状态下在同一块里挪,不用醒(没有东西要随时间变)",
        dom.pending() === 0, dom.pending() + " 帧");
    check("但它照样跟得上(位置是直接写在 transform 上的,不经帧)",
        inst._debug().x === 480 && inst._debug().y === 360 && /translate3d\(480/.test(host(dom).style.transform),
        String(host(dom).style.transform));

    // 现在碰一下。它会醒,而且**不能**把刚才那五秒当成一帧的 dt 一次吃掉 ——
    // 那会让形状瞬间弹到位。这一条盯的就是 wake() 里那句 last = performance.now()
    over(dom, link);
    check("一碰就醒", dom.pending() > 0);
    dom.frame(16);
    const q1 = inst._debug().q;
    check("醒来第一帧没有把干等那五秒当 dt 吃掉(q 还是一小步,不是一步到位)",
        q1 > 0 && q1 < 0.5, "第一帧 q=" + q1.toFixed(3));

    settle(dom, 240);
    check("停在可点击的块上时不睡(那一坨本身一直在动,停了就不动了)",
        dom.pending() > 0, dom.pending() + " 帧");

    over(dom, plain);
    settle(dom, 240);
    check("挪开、收干净之后重新睡下", dom.pending() === 0, dom.pending() + " 帧还排着");

    inst.destroy();
}

/* ═════════════════════════ 10. 这些断言真的会红吗 ═════════════════════════ */

section("10. 把包故意改坏,确认上面那些断言真的会红");

/*
 * 一个探针量一件事,返回一个数。同一个探针在「好的包」和「改坏的包」上各跑一遍:
 * 好的那头是上面已经断言过的阈值,坏的那头必须越过它。越不过去,说明那条断言根本
 * 没在盯着它以为自己在盯着的东西。
 */
const PROBES = {
    // 按下那一刻,画面上最像一颗普通球的一帧
    pressHandoffMin(dom) {
        const inst = dom.win.CursorEmbed.init();
        const link = el(dom, "a", { cursor: "pointer" });
        over(dom, link); settle(dom, 60);
        dom.win.listeners.pointerdown({ target: link });
        let m = Infinity;
        for (let i = 0; i < 60; i++) { dom.frame(16); m = Math.min(m, ballLike(inst._debug().balls)); }
        inst.destroy();
        return m;
    },
    // 一块「没声明过 cursor」的元素,被补行内值了吗
    plainTouched(dom) {
        const inst = dom.win.CursorEmbed.init();
        const plain = el(dom, "div", {});
        over(dom, plain);
        const touched = plain.style.getPropertyValue("cursor") !== "";
        inst.destroy();
        return touched ? 1 : 0;
    },
    // --cursor: auto 之后还往不往下落到真 cursor 上
    autoChanFallsThrough(dom) {
        const inst = dom.win.CursorEmbed.init();
        const e = el(dom, "div", { "--cursor": "auto", cursor: "pointer" });
        over(dom, e);
        const fell = inst._debug().hoverValue === "pointer";
        inst.destroy();
        return fell ? 1 : 0;
    },
    // 一个没声明过 cursor 的 <button> 认得出来吗(1 = 认不出来)
    impliedClickable(dom) {
        const inst = dom.win.CursorEmbed.init();
        const b = el(dom, "button");
        over(dom, b);
        const got = inst._debug().hover === "viscous";
        inst.destroy();
        return got ? 0 : 1;
    },
    /*
     * 睡了一大觉之后被叫醒,第一帧的 q 是多少。
     * 正常应该是一小步(16ms / 90ms ≈ 0.16);如果 wake() 忘了把 last 复位,这一帧的
     * dt 就是整段静止时长,指数一下子吃满,q 直接到 1 —— 形状会瞬移到位。
     */
    wakeFirstQ(dom) {
        const inst = dom.win.CursorEmbed.init();
        const link = el(dom, "a", { cursor: "pointer" });
        const plain = el(dom, "div", {});
        over(dom, plain);
        moveTo(dom, 300, 200);
        settle(dom, 240);          // 先睡下
        dom.frame(5000);           // 干等五秒(队列空着,什么都不会跑)
        over(dom, link);           // 碰一下,叫醒
        dom.frame(16);
        const q = inst._debug().q;
        inst.destroy();
        return q;
    },
    // destroy 之后,被藏过的元素还回原样了吗(1 = 没还干净)
    leftDirty(dom) {
        const inst = dom.win.CursorEmbed.init();
        const a = el(dom, "a", { cursor: "pointer" });
        // 注意用**画得出来**的值:用 cursor:help 的话这块元素进的是「让位」那一支,
        // 从头到尾就没被藏过,destroy 无事可还 —— 这条断言会永远绿,连故意改坏了都绿。
        a.style.setProperty("cursor", "zoom-in", "important");
        over(dom, a);
        inst.destroy();
        return (a.style.getPropertyValue("cursor") === "zoom-in"
            && a.style.getPropertyPriority("cursor") === "important"
            && hosts(dom).length === 0
            && !dom.html._cls.has("cfx-embed-on")) ? 0 : 1;
    },
};

// 探针只吃一个已经备好的沙盒,好让同一段代码既能跑好的包也能跑改坏的
function probe(src, name, opts) {
    const o = opts || {};
    const dom = makeDOM(o);
    dom.win.CursorEmbedManual = true;
    const ctx = vm.createContext(dom.win);
    ctx.console = console;
    vm.runInContext(src, ctx, { filename: "cursor-embed-under-test.js" });
    return PROBES[name](dom);
}

function broken(find, rep) {
    // 一次改一处,也可以给一串 [找什么, 换成什么];任何一处找不到就报出来,
    // 而不是悄悄跳过一个改坏点、然后拿着「没改到」的包去证明断言会红
    const pairs = Array.isArray(find) ? find : [[find, rep]];
    let out = BUNDLE;
    for (const [f, r] of pairs) {
        if (out.indexOf(f) < 0) {
            check("找得到要改坏的那一段:" + JSON.stringify(f.slice(0, 46)), false);
            return null;
        }
        out = out.replace(f, r);
    }
    return out;
}

{
    const good = probe(BUNDLE, "pressHandoffMin");
    check("好的包:按下全程离普通球 ≥ 50px²", good > 50, good.toFixed(2) + "px²");

    // 拆掉「直接交接」,退回「先收拢再换形」—— 也就是用户当初看见的那一下
    const b = broken(
        "const direct = !sameShape && !!state && !!want && (state.fast || want.fast);",
        "const direct = false;");
    if (b) {
        let v;
        try { v = probe(b, "pressHandoffMin"); } catch (e) { v = -1; }
        check("去掉直接交接之后,同一条断言会红(中途退化成一颗普通球)",
            v < 50, v === -1 ? "探针抛错(也算红)" : Number(v).toFixed(2) + "px²");
    }
}

{
    check("好的包:没声明过 cursor 的元素一点没碰", probe(BUNDLE, "plainTouched") === 0);
    /*
     * 拆掉「只碰自己声明过的」,换成一个天真实现的写法:指针划到谁就藏谁。
     *
     * 要改**两处**才改得动 —— 这不是啰嗦,是这条断言实际上由两道闸门守着,
     * 只拆一道仍然是绿的:
     *   · 一块没声明过 cursor 的元素,在我们的隐藏类挂上之后算出来就是 none,
     *     于是它进的是「往上找祖先」那一条支路,根本不走下面那行 hideEl;
     *   · 就算把它推进下面那条支路,`r.cursor !== "none"` 那一截也还拦着。
     * 这也说明一件事:如果只拆第二道,这道探针会**躺着不动地绿下去** ——
     * 那样的「验住了」是假的,所以这里两道一起拆。
     */
    const b = broken([
        ["if (!r.value && r.blinded) {", "if (false) {"],
        ['if (o.hideNative && r.cursor && r.cursor !== "none" && !rec.handover) hideEl(el, rec);',
            "if (o.hideNative) hideEl(el, rec);"],
    ]);
    if (b) check("改成「谁碰谁藏」之后,同一条断言会红", probe(b, "plainTouched") === 1);
}

{
    check("好的包:没声明过 cursor 的 <button> 也认得出来",
        probe(BUNDLE, "impliedClickable") === 0);
    // 拆掉按标签推断那一句:于是只有页面**明写**过 cursor 的元素才有形状
    const b = broken("out.value = impliedIntent(el);", 'out.value = "";');
    if (b) check("拆掉按标签推断之后,同一条断言会红", probe(b, "impliedClickable") === 1);
}

{
    check("好的包:--cursor:auto 不往下落", probe(BUNDLE, "autoChanFallsThrough") === 0);
    const b = broken(
        'if (v) {\n            out.value = (v === "auto" || v === "default") ? "" : v;\n            return out;\n        }',
        'if (v && v !== "auto" && v !== "default") {\n            out.value = v;\n            return out;\n        }');
    if (b) check("把 auto 当成「没写」之后,同一条断言会红", probe(b, "autoChanFallsThrough") === 1);
}

{
    /*
     * 「睡醒第一帧不吃掉整段静止时长」这件事,由**两道**闸门守着:
     *   · wake() 里的 last = performance.now()   —— 把表重新对一次
     *   · step() 里的 dt = Math.min(48, now - last) —— 夹住单帧时长
     *
     * 只拆第一道:dt 被夹在 48ms,q = 0.413 —— 是一小步(0.163)的两倍半,变快了,
     * 但**没有**到 1。阈值要是定在 0.5,它就是绿的:一条躺在那里绿下去的假测试。
     * 所以阈值压到 0.25,并且两道各拆一次,把两个数都摆出来。
     */
    const good = probe(BUNDLE, "wakeFirstQ");
    check("好的包:睡醒第一帧的 q 是一小步", good > 0 && good < 0.25, good.toFixed(3));

    const noReset = broken("            running = true;\n            last = performance.now();", "            running = true;");
    if (noReset) {
        let v;
        try { v = probe(noReset, "wakeFirstQ"); } catch (e) { v = 1; }
        check("只拆掉 last 复位(夹子还在),同一条断言就会红",
            v >= 0.25, "第一帧 q=" + Number(v).toFixed(3) + "(好的包是 " + good.toFixed(3) + ")");
    }

    // 两道一起拆:这才是「真的把整段静止时长当成一帧」的样子
    const both = broken([
        ["            running = true;\n            last = performance.now();", "            running = true;"],
        ["const dt = Math.min(48, now - last);", "const dt = now - last;"],
    ]);
    if (both) {
        let v;
        try { v = probe(both, "wakeFirstQ"); } catch (e) { v = 1; }
        check("两道一起拆:第一帧几乎一步到位(形状会瞬移过去)",
            v > 0.99, "第一帧 q=" + Number(v).toFixed(3));
    }
}

{
    check("好的包:destroy 之后还得很干净", probe(BUNDLE, "leftDirty") === 0);
    const b = broken(
        "for (const [node, rec] of cache) showEl(node, rec);\n                cache.clear();\n                fx.destroy();",
        "cache.clear();\n                fx.destroy();");
    if (b) check("不还回去之后,同一条断言会红", probe(b, "leftDirty") === 1);
}

/*
 * ═════════════════════════ 11. 演示页 ═════════════════════════
 *
 * 演示页是买家打开的第一个文件。它自己那段脚本(旋钮、色块、恢复出厂)坏在哪一行,
 * 只有真按一遍才发现得了 —— 所以这里把 demo.html 里那段原样抠出来,配几个假控件
 * 跑一遍,然后看库那边有没有被弄坏。
 *
 * 检查的是**两头**:显示的读数对不对,以及真正起作用的 opts 对不对。
 * 只验前者会放过「读数对、配置没生效」这种最像坏了的毛病。
 */

section("11. 把演示页自己那段脚本,对着真库跑一遍");

{
    const fs = require("fs");
    const path = require("path");
    const html = fs.readFileSync(path.join(__dirname, "demo.html"), "utf8");
    const src = (html.match(/<script(?![^>]*\bsrc)[^>]*>([\s\S]*?)<\/script>/) || [])[1];
    check("从 demo.html 里抠到了那段脚本", typeof src === "string" && src.length > 400,
        src ? src.length + " 字符" : "没抠到");

    // 几个假控件:有 value / checked / dataset / addEventListener,和真 DOM 用得上的一样
    function node(id, init) {
        const n = Object.assign({
            id, textContent: "", value: "", checked: false, dataset: {}, _h: {}, _attrs: {},
            addEventListener(t, fn) { n._h[t] = fn; },
            removeEventListener() {},
            setAttribute(k, v) { n._attrs[k] = String(v); },
            getAttribute(k) { return n._attrs[k] === undefined ? null : n._attrs[k]; },
        }, init || {});
        n.fire = (t) => { if (n._h[t]) n._h[t].call(n, { type: t }); };
        return n;
    }
    const ui = {
        "r-size": node("r-size"), "r-press": node("r-press"), "r-speed": node("r-speed"),
        "r-color": node("r-color"), "tune-code": node("tune-code"),
        "k-size": node("k-size", { value: "26" }),
        "k-press": node("k-press", { value: "0.14" }),
        "k-speed": node("k-speed", { value: "1" }),
        "k-shadow": node("k-shadow", { checked: true }),
        "k-hide": node("k-hide", { checked: true }),
        "k-color": node("k-color", { value: "#2f3bd0" }),
        reset: node("reset"), "copy-install": node("copy-install"),
        "install-code": node("install-code"),
    };
    const sws = ["", "#2f3bd0", "#b3253a", "#1f6b52", "#3a3a3c"].map((c, i) =>
        node("sw" + i, { dataset: { color: c } }));

    const dom = sandbox(BUNDLE, { manual: true });
    dom.doc.querySelector = (s) => (s.charAt(0) === "#" ? ui[s.slice(1)] || null : null);
    dom.doc.querySelectorAll = (s) => (s === ".sw" ? sws : []);
    dom.win.navigator = {};
    // 真页面上是自动起步。这里手动替它起一下,不然「旋钮之前就已经有球」这件事测不到
    dom.win.CursorEmbed.boot();

    let threw = null;
    try {
        vm.runInContext(src, vm.createContext(dom.win), { filename: "demo.html 里那段" });
    } catch (e) { threw = e; }
    check("那段脚本在真库上跑得起来", threw === null, threw ? threw.message : "");

    const E = dom.win.CursorEmbed;
    const inst = () => E.instance();
    const code = () => ui["tune-code"].textContent;

    check("开页面时就已经有球了(自动起步那一条)", !!inst());
    check("还没动旋钮,右边写的是「出厂设置」", /出厂设置/.test(code()), JSON.stringify(code().slice(0, 24)));
    check("读数也是出厂的", ui["r-size"].textContent === "26px", ui["r-size"].textContent);
    check("一个旋钮都没动过,库没被重建", !!inst() && inst().opts.size === E.DEFAULTS.size);

    // ── 拖一下「球的直径」 ──
    ui["k-size"].value = "34";
    ui["k-size"].fire("input");
    check("读数跟着变", ui["r-size"].textContent === "34px", ui["r-size"].textContent);
    check("配置真的生效了(不是只改了读数)", inst().opts.size === 34, String(inst().opts.size));
    check("右边那段代码只写改过的那一项", /size: 34/.test(code()) && !/color:/.test(code()),
        JSON.stringify(code()));

    // ── 点一个色块 ──
    sws[1].fire("click");
    check("球的颜色真的换了", inst().opts.color === "#2f3bd0", String(inst().opts.color));
    check("色块选中态跟着走", sws[1]._attrs["aria-pressed"] === "true" && sws[0]._attrs["aria-pressed"] === "false");
    check("这一页的记号色也跟着球走(整页只有这一处彩色)",
        dom.html.style.getPropertyValue("--accent") === "#2f3bd0",
        String(dom.html.style.getPropertyValue("--accent")));
    check("代码里出现了颜色", /color: "#2f3bd0"/.test(code()), JSON.stringify(code()));

    // ── 关掉「藏系统光标」 ──
    ui["k-hide"].checked = false;
    ui["k-hide"].fire("change");
    check("关掉之后配置里是 false", inst().opts.hideNative === false, String(inst().opts.hideNative));
    check("隐藏类也摘了(球和箭头并存)", !dom.html._cls.has(E.HIDE_CLASS));
    ui["k-hide"].checked = true;
    ui["k-hide"].fire("change");
    check("再打开就挂回来", inst().opts.hideNative === true && dom.html._cls.has(E.HIDE_CLASS));

    // ── 恢复出厂 ──
    ui.reset.fire("click");
    check("读数回到出厂", ui["r-size"].textContent === "26px" && ui["r-color"].textContent === "出厂",
        ui["r-size"].textContent + " / " + ui["r-color"].textContent);
    check("配置回到出厂", inst().opts.size === E.DEFAULTS.size && inst().opts.color === E.DEFAULTS.color);
    check("色块回到出厂那一颗", sws[0]._attrs["aria-pressed"] === "true" && sws[1]._attrs["aria-pressed"] === "false");
    check("记号色回到墨黑", dom.html.style.getPropertyValue("--accent") === "#141414",
        String(dom.html.style.getPropertyValue("--accent")));
    check("右边又写回「出厂设置」", /出厂设置/.test(code()));

    // ── 折腾了这么多轮之后,页面上不该留下垃圾 ──
    check("起起落落这么多回,同时只有一只壳", hosts(dom).length === 1, String(hosts(dom).length));
    check("而且它还是活的", inst() !== null && inst()._debug().dead === false);

    E.destroy();
    check("最后收走:壳没了,隐藏类也摘了",
        hosts(dom).length === 0 && !dom.html._cls.has(E.HIDE_CLASS));
}

console.log("");
console.log(bad ? `!! ${total} 项里 ${bad} 项没过` : `全部通过:${total} 项`);
process.exit(bad ? 1 : 0);
