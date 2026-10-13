/*
 * 驱动加载态（loading.js）的状态机。
 *
 * 这里验的是「看图看不出来、但错了就很难受」的那些东西:
 *   - 短等待不该闪一下 —— 缓存命中的图不该让光标跳一段液体动画
 *   - 真在等的时候要亮,而且亮够 MIN_SHOW_MS 才收
 *   - 收尾的最后一帧必须和普通光标逐像素一样,否则交回 #latex-ball 会有一道缝
 *   - 长等待里绝对不能出现「并回一个」—— 那个动作在这套语言里就是「好了」
 *   - 元素永远不 load 的时候要有超时兜底,光标不能一直被钉住
 *   - 换页时上一页没加载完的元素不能把状态机拖住
 *   - 指针移出文档就收
 *   - prefers-reduced-motion 下根本不进这个状态
 *
 * 每个场景一个独立的 vm 沙盒(各自一套 document + 一个虚拟时钟),互不干扰。
 * 不用 jsdom —— 沙盒里 npm 拿不到,而且这里真正需要的是**可控的时间**:
 * 要验的超时兜底是 15 秒、总兜底是 45 秒,真等一遍没法测。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SITE = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../..");

const FX_SRC = fs.readFileSync(path.join(SITE, "cursor-fx.js"), "utf8");
const LOADING_SRC = fs.readFileSync(path.join(SITE, "loading.js"), "utf8");

let bad = 0;
let total = 0;
function check(name, cond, detail) {
    total++;
    if (!cond) bad++;
    console.log(`  ${cond ? "✓" : "!!"} ${name}${detail ? "  — " + detail : ""}`);
}
function section(title) { console.log(`\n=== ${title} ===`); }

// ---------- DOM 桩 ----------

function makeEl(tag) {
    const listeners = {};
    const e = {
        tagName: String(tag).toUpperCase(),
        className: "",
        style: {},
        children: [],
        parent: null,
        isConnected: true,
        dataset: {},
        _attr: {},
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
        fire(type) { (listeners[type] || []).slice().forEach((f) => f()); },
        querySelectorAll(sel) { return descendants(this).filter((x) => x.isConnected && matches(sel, x)); },
        // scan(root) 会问 root 自己是不是媒体,真元素有 matches,桩也得有
        matches(sel) { return matches(sel, this); },
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
    const tags = sel.split(",").map((s) => s.trim().toUpperCase());
    return tags.indexOf(el.tagName) >= 0;
}

/*
 * 一个沙盒 = 一套 document + 一个虚拟时钟 + 一份跑起来的 loading.js。
 * 虚拟时钟是自己实现的 setTimeout / rAF,`advance(ms)` 把两者一起推。
 */
function sandbox(opts) {
    const o = opts || {};
    let now = 0;
    let timerSeq = 0;
    const timers = new Map();
    let rafSeq = 0;
    const rafs = new Map();

    const content = makeEl("div");
    const body = makeEl("body");
    const documentElement = makeEl("html");
    const winListeners = {};
    const docListeners = {};
    let filterMade = false;

    const doc = {
        body,
        documentElement,
        readyState: "loading",
        getElementById(id) {
            if (id === "content") return content;
            // 引擎的 ensureGoo 拿这个判断滤镜注入过没有
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
        querySelectorAll(sel) { return descendants(body).filter((x) => x.isConnected && matches(sel, x)); },
    };

    function timer(fn, ms) {
        const id = ++timerSeq;
        timers.set(id, { at: now + (ms || 0), fn });
        return id;
    }
    const untimer = (id) => timers.delete(id);

    const win = {
        document: doc,
        performance: { now: () => now },
        requestAnimationFrame(fn) { const id = ++rafSeq; rafs.set(id, fn); return id; },
        cancelAnimationFrame(id) { rafs.delete(id); },
        addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
        removeEventListener() {},
        matchMedia: () => ({ matches: !!o.reduce, addEventListener() {} }),
        location: { hash: "" },
        cursorState: { x: 400, y: 300, press: 0, targetPress: 0, visible: true },
    };

    const sandboxObj = {
        window: win,
        document: doc,
        performance: win.performance,
        requestAnimationFrame: win.requestAnimationFrame,
        cancelAnimationFrame: win.cancelAnimationFrame,
        setTimeout: timer,
        clearTimeout: untimer,
        matchMedia: win.matchMedia,
        console: { log: () => {}, error: () => {} },
    };
    sandboxObj.globalThis = sandboxObj;
    sandboxObj.self = sandboxObj;
    vm.createContext(sandboxObj);

    vm.runInContext(FX_SRC, sandboxObj, { filename: "cursor-fx.js" });
    vm.runInContext(LOADING_SRC, sandboxObj, { filename: "loading.js" });

    // ---------- 媒体元素 ----------
    function media(tag) {
        const e = makeEl(tag);
        if (tag === "img") e.complete = false;
        if (tag === "video") e.readyState = 0;
        content.appendChild(e);
        return e;
    }
    const imgOk = (el) => { el.complete = true; el.fire("load"); };

    // ---------- 驱动 ----------
    const STEP = 1000 / 60;
    let lastFrames = null;

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

    function paint() {
        const w = wrap();
        if (!w || !w.children[0]) { lastFrames = null; return; }
        const goo = w.children[0].children[1];
        lastFrames = goo.children.map((b) => {
            const t = b.style.transform || "";
            const m = t.match(/translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\) scale\(([\d.]+)\)/);
            return m
                ? { x: +m[1], y: +m[2], s: +m[3] }
                : { x: NaN, y: NaN, s: NaN };
        });
    }

    function step() {
        now += STEP;
        drainTimers();
        const q = Array.from(rafs.values());
        rafs.clear();
        for (const fn of q) fn(now);
        paint();
    }

    function advance(ms) {
        const end = now + ms;
        while (now < end - 1e-9) step();
        return now;
    }

    function wrap() {
        return descendants(body).find((e) => e.className === "cfx-fixed") || null;
    }

    function pointer(x, y) {
        win.cursorState.x = x;
        win.cursorState.y = y;
        win.cursorState.visible = true;
        (docListeners.pointermove || []).slice().forEach((fn) => fn({}));
    }

    return {
        win, doc, content, body, documentElement,
        media, imgOk, advance, step, wrap, pointer,
        leaveDoc: () => documentElement.fire("pointerleave"),
        movePointer: pointer,
        setPress: (v) => { win.cursorState.press = v; },
        fireLoad: () => (winListeners.load || []).slice().forEach((fn) => fn()),
        now: () => now,
        state: () => win.LoadingWatch._debug().state,
        pending: () => win.LoadingWatch._debug().pending,
        busy: () => documentElement.classList.contains("is-loading"),
        rafCount: () => rafs.size,
        frames: () => lastFrames,
        CFG: () => win.LoadingWatch.CFG,        // loading.js 自己的配置(宽限期/超时)
        FX: () => win.CursorFX.CFG,             // 引擎的配置(R0 / RING_D / 时长)
        PHASE: () => win.CursorFX.PHASE_START,
        scan: (root) => win.LoadingWatch.scan(root),
    };
}

const GRACE = 140;
const MIN_SHOW = 420;
const MERGE = 440;

// 屏幕上真正看得见的那部分质量(scale≈0 的球等于没画)
const visible = (fr) => fr.filter((b) => b.s > 0.01);

function runTests() {
    // =====================================================================
    section("1. 短暂等待不该亮");
    {
        const sb = sandbox();
        const im = sb.media("img");
        sb.scan();
        sb.fireLoad();          // index.html 的兜底路径:再扫一遍不该有副作用
        check("重复 scan 不会把状态搞乱", sb.pending() === 1, String(sb.pending()));

        sb.advance(GRACE - 30);
        check("还没到宽限期时不进入加载态", !sb.busy());

        sb.imgOk(im);
        sb.advance(1200);
        check("宽限期内就好了 → 从头到尾没亮过", !sb.busy());
        check("也没留下在跑的 rAF", sb.rafCount() === 0, `raf=${sb.rafCount()}`);
        check("状态回到 idle", sb.state() === "idle", sb.state());
        check("连壳都没建", sb.wrap() === null);
    }

    // =====================================================================
    section("2. 真在等 → 亮 → 亮够 → 收尾交回");
    {
        const sb = sandbox();
        const ims = [sb.media("img"), sb.media("img"), sb.media("img")];
        sb.scan();
        check("三张待加载的图都数上了", sb.pending() === 3, String(sb.pending()));

        sb.advance(GRACE + 20);
        check("过了宽限期就亮", sb.busy(), `state=${sb.state()}`);
        const w = sb.wrap();
        check("壳被建出来并挂在 body 下", w !== null && w.parent === sb.body);
        check("壳落在指针位置上",
            /translate3d\(400\.0px, 300\.0px, 0\) scale\(1\.0000\)/.test(w.style.transform || ""),
            w.style.transform);

        // 第一帧必须就是普通光标那一颗球 —— 交接看不出来靠的就是这个
        const f0 = sb.frames();
        const v0 = visible(f0);
        check("第 0 帧 = 指针原点上的一颗整球",
            v0.length === 1 && v0[0].x === 0 && v0[0].y === 0 && Math.abs(v0[0].s - 1) < 1e-6,
            JSON.stringify(f0.map((b) => [b.x, b.y, b.s])));

        // 只好了两张,还得继续转(此刻才过了 ~17ms,离 min_show 还远)
        sb.imgOk(ims[0]);
        sb.imgOk(ims[1]);
        sb.advance(100);
        check("还剩一张就不收", sb.state() === "show", sb.state());

        sb.imgOk(ims[2]);
        sb.advance(150);
        check("最后一张好了也还继续演够 min_show", sb.busy() && sb.state() === "show", sb.state());

        sb.advance(200);
        check("进入收尾", sb.state() === "end", sb.state());
        check("收尾期间普通球已经交还", !sb.busy());

        sb.advance(MERGE + 100);
        check("收完回到 idle", sb.state() === "idle", sb.state());
        check("壳藏起来了", sb.wrap().style.display === "none");
        check("rAF 停了", sb.rafCount() === 0, `raf=${sb.rafCount()}`);

        const fl = sb.frames();
        check("最后一帧 = 原点上一颗整球(和普通光标逐像素一致)",
            fl.every((b) => b.x === 0 && b.y === 0 && Math.abs(b.s - 1) < 1e-3),
            JSON.stringify(fl.map((b) => [b.x, b.y, b.s])));
    }

    // =====================================================================
    section("3. 长等待:演完一遍之后只循环环转,绝不提前「并回去」");
    {
        const sb = sandbox();
        sb.media("img");
        sb.scan();
        sb.advance(GRACE + 20);

        const FX = sb.FX();
        const RING = FX.RING_D;
        const FINAL = 1 / Math.sqrt(3);       // 环转时三球等大,都是这个尺寸
        const PAIR = RING * Math.sqrt(3);     // 三等分 120° 时两两之间的距离
        const t0 = sb.now();
        const storyEnd = sb.PHASE().merge;       // 故事演到这里就该改走环转循环了

        let nan = 0;
        let steady = 0;
        let minPair = Infinity;
        let scaleErr = 0;
        let offRing = 0;

        // 一路推到元素自己的超时之前,全程盯着几何
        while (sb.now() < sb.CFG().TIMEOUT.img - 500) {
            const fr = sb.frames();
            if (fr) {
                if (fr.some((b) => !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.s))) nan++;
                // 故事段(出生/分裂)三球本来就不等大,不参与这段断言
                if (sb.now() - t0 > storyEnd + 200) {
                    steady++;
                    const vis = fr.filter((b) => b.s > 0.3);
                    if (vis.length !== 3) {
                        nan++;   // 少一颗 = 并回去了,直接算不合格
                    } else {
                        for (let i = 0; i < 3; i++) {
                            // 环心在局部坐标 (0, RING_D),半径恒为 RING_D
                            offRing = Math.max(offRing, Math.abs(Math.hypot(vis[i].x, vis[i].y - RING) - RING));
                            scaleErr = Math.max(scaleErr, Math.abs(vis[i].s - FINAL));
                        }
                        for (const [i, j] of [[0, 1], [1, 2], [0, 2]]) {
                            minPair = Math.min(minPair, Math.hypot(vis[i].x - vis[j].x, vis[i].y - vis[j].y));
                        }
                    }
                }
            }
            sb.advance(50);
        }

        check("推了十几秒,环转段采样足够多", steady > 100, `${steady} 帧`);
        check("全程没有 NaN/非法帧", nan === 0, `${nan} 帧`);
        check("三个球始终在环上(证明在绕环心)", offRing < 0.05, `最大偏差 ${offRing.toFixed(4)}px`);
        check("三个球始终等大(没有谁在长大或收拢)", scaleErr < 0.02, `最大偏差 ${scaleErr.toFixed(4)}`);
        check("两两距离始终是三等分的弦长(没有并回去)",
            minPair > PAIR - 0.3, `最小 ${minPair.toFixed(2)}px,应为 ${PAIR.toFixed(2)}px`);
        check("状态一直是 show(中间没有偷偷收过尾)", sb.state() === "show", sb.state());

        // 到点之后正常收
        sb.advance(sb.CFG().TIMEOUT.img);
        check("元素超时后收尾", sb.state() !== "show", sb.state());
        sb.advance(MERGE + 200);
        const fl = sb.frames();
        check("收尾最后一帧仍是一颗整球",
            fl.every((b) => b.x === 0 && b.y === 0 && Math.abs(b.s - 1) < 1e-3));
    }

    // =====================================================================
    section("4. 收尾从任意一帧出发都不跳");
    {
        /*
         * 两个分开的判据,因为「跳」有两种:
         *   接缝 —— 打断那一帧应该几乎不动(收尾是从 k≈1 起步的,不是跳到合并段)
         *   爆速 —— 整段收尾每帧的位移不能超过**同一段收尾自然播完**时的峰值
         *
         * 峰值本身有几 px(缓动在 p≈0.5 附近就是这个速度,不是缺陷),
         * 所以不能拿绝对阈值卡:同一段收尾,起点不同峰值也不同(实测 3.05~3.34)。
         * 只能拿它自己和比自己 —— 这正是要证的那句话:打断不引入任何额外位移。
         */
        function naturalPeak(FX, from) {
            const STEP = 1000 / 60;
            let peak = 0;
            let prev = from;
            for (let i = 1; i <= 32; i++) {
                const p = Math.min(1, (i * STEP) / FX.CFG.MERGE_MS);
                const cur = FX.sampleCollapse(from, p).balls;
                for (let k = 0; k < 3; k++) {
                    peak = Math.max(peak, Math.hypot(cur[k].x - prev[k].x, cur[k].y - prev[k].y));
                }
                prev = cur;
            }
            return peak;
        }

        for (const at of [150, 760, 1400, 1700, 2100, 2400, 3700, 6000, 12000]) {
            const sb = sandbox();
            sb.media("img");
            sb.scan();
            sb.advance(GRACE + at);
            const before = sb.frames();
            const ref = naturalPeak(sb.win.CursorFX, before);
            sb.imgOk(sb.content.children[0]);

            sb.step();
            const first = sb.frames();
            let seam = 0;
            for (let k = 0; k < 3; k++) {
                seam = Math.max(seam, Math.hypot(first[k].x - before[k].x, first[k].y - before[k].y));
            }

            // 再逐帧量完整个收尾
            let maxStep = 0;
            let prev = first;
            for (let i = 0; i < 50; i++) {
                sb.step();
                const cur = sb.frames();
                for (let k = 0; k < 3; k++) {
                    maxStep = Math.max(maxStep, Math.hypot(cur[k].x - prev[k].x, cur[k].y - prev[k].y));
                }
                prev = cur;
            }
            check(`在第 ${at}ms 打断:接缝位移 < 0.1px`, seam < 0.1, `${seam.toFixed(4)}px`);
            check(`在第 ${at}ms 打断:不比自然播完更快`,
                maxStep <= ref * 1.05 + 0.05, `${maxStep.toFixed(3)} vs 自然 ${ref.toFixed(3)} px/帧`);
        }
    }

    // =====================================================================
    section("5. 元素超时兜底");
    {
        const sb = sandbox();
        sb.media("img");
        const C = sb.CFG();
        sb.scan();
        sb.advance(GRACE + 50);
        check("在等", sb.state() === "show");

        sb.advance(C.TIMEOUT.img - 400);
        check("差一点到元素超时,仍在等", sb.state() === "show", `${sb.now().toFixed(0)}ms`);

        sb.advance(800);
        check("过了元素超时自己放行", sb.state() !== "show", sb.state());
        sb.advance(MERGE + 100);
        check("最终回到 idle(光标没被钉住)", sb.state() === "idle", sb.state());

        sb.imgOk(sb.content.children[0]);   // 迟到的 load
        sb.advance(300);
        check("迟到的 load 不会复活加载态", sb.state() === "idle", sb.state());
    }

    // =====================================================================
    section("6. 总兜底(元素自己的超时被绕过时)");
    {
        const sb = sandbox();
        sb.media("img");
        const C = sb.CFG();
        const realImg = C.TIMEOUT.img;
        C.TIMEOUT.img = 300000;         // 假装这个元素永远不超时
        sb.scan();
        sb.advance(GRACE + 50);
        check("在等", sb.state() === "show");

        sb.advance(C.CAP_MS - 2000);
        check("还没到总兜底", sb.state() === "show", `${sb.now().toFixed(0)}ms`);

        sb.advance(2600);
        check("到总兜底后放行", sb.state() === "end" || sb.state() === "idle", sb.state());
        sb.advance(MERGE + 200);
        check("回到 idle", sb.state() === "idle", sb.state());
        check("pending 被清空", sb.pending() === 0, String(sb.pending()));
        C.TIMEOUT.img = realImg;
    }

    // =====================================================================
    section("7. 换页:上一页没加载完的元素不能拖住状态机");
    {
        const sb = sandbox();
        const im = sb.media("img");
        sb.scan();
        sb.advance(GRACE + 50);
        check("在等", sb.state() === "show");

        im.remove();            // 换页:#content 被整体替换
        sb.scan();              // main.js 在 renderPage 的 rAF 里会再扫一遍
        sb.advance(MIN_SHOW + 60);
        check("脱离文档的元素被摘掉,状态机继续走", sb.state() === "end" || sb.state() === "idle", sb.state());
        sb.advance(MERGE + 200);
        check("回到 idle", sb.state() === "idle", sb.state());

        sb.media("img");
        sb.scan();
        sb.advance(GRACE + 50);
        check("新页面又挂了一张还在加载的图 → 重新亮", sb.state() === "show", sb.state());
    }

    // =====================================================================
    section("8. video:元数据 + 播放中缓冲");
    {
        const sb = sandbox();
        const v = sb.media("video");
        sb.scan();
        sb.advance(GRACE + 50);
        check("readyState<1 时在等", sb.state() === "show");

        v.readyState = 1;
        v.fire("loadedmetadata");
        sb.advance(MIN_SHOW + MERGE + 300);
        check("元数据到了就收", sb.state() === "idle", sb.state());

        v.readyState = 4;
        v.fire("waiting");
        sb.advance(GRACE + 50);
        check("waiting 之后重新进入加载态", sb.state() === "show", sb.state());

        sb.advance(MIN_SHOW + 40);
        v.fire("playing");
        sb.advance(MERGE + 300);
        check("playing 之后收", sb.state() === "idle", sb.state());
    }

    // =====================================================================
    section("9. iframe 的 load 与超时");
    {
        const sb = sandbox();
        sb.media("iframe");
        const C = sb.CFG();
        sb.scan();
        sb.advance(GRACE + 50);
        check("没 load 过就在等", sb.state() === "show");

        sb.advance(C.TIMEOUT.iframe - 400);
        check("差一点到 iframe 超时,仍在等", sb.state() === "show", `${sb.now().toFixed(0)}ms`);
        sb.advance(800);
        check("iframe 超时后放行", sb.state() === "end" || sb.state() === "idle", sb.state());
    }
    {
        const sb = sandbox();
        const fr = sb.media("iframe");
        sb.scan();
        fr.fire("load");        // load 在 scan 之后到
        sb.advance(GRACE + 80);
        check("已经 load 的 iframe 不会触发加载态", !sb.busy(), sb.state());
    }

    // =====================================================================
    section("10. 指针移出文档就收");
    {
        const sb = sandbox();
        sb.media("img");
        sb.scan();
        sb.advance(GRACE + 800);
        check("在等", sb.state() === "show");

        sb.leaveDoc();
        check("移出文档立刻收", sb.state() === "idle", sb.state());
        check("类也摘了", !sb.busy());
        check("rAF 停了", sb.rafCount() === 0, `raf=${sb.rafCount()}`);
    }

    // =====================================================================
    section("11. 位置跟随与按下缩放(交接时不能跳)");
    {
        const sb = sandbox();
        sb.media("img");
        sb.scan();
        sb.advance(GRACE + 50);

        sb.movePointer(123, 456);
        check("壳跟着指针走",
            /translate3d\(123\.0px, 456\.0px, 0\)/.test(sb.wrap().style.transform || ""),
            sb.wrap().style.transform);

        sb.setPress(1);
        sb.advance(50);
        check("按下时整体缩到 0.86(和 #latex-ball 同一个系数)",
            /scale\(0\.8600\)/.test(sb.wrap().style.transform || ""), sb.wrap().style.transform);

        sb.imgOk(sb.content.children[0]);
        sb.advance(MIN_SHOW + MERGE + 300);
        check("按住时收尾也不会跳:壳的缩放就是球的缩放",
            sb.state() === "idle" && /scale\(0\.8600\)/.test(sb.wrap().style.transform || ""),
            sb.wrap().style.transform);
    }

    // =====================================================================
    section("12. prefers-reduced-motion:根本不该有液体");
    {
        const sb = sandbox({ reduce: true });
        sb.media("img");
        sb.scan();
        sb.advance(GRACE + 3000);
        check("不进加载态", !sb.busy(), sb.state());
        check("状态一直是 idle", sb.state() === "idle", sb.state());
        check("没建壳", sb.wrap() === null);
        check("没有 rAF 在跑", sb.rafCount() === 0, `raf=${sb.rafCount()}`);
    }

    // =====================================================================
    section("13. 指针还没出现过时不进(锚点会落在 -9999,-9999)");
    {
        const sb = sandbox();
        sb.win.cursorState.visible = false;
        sb.media("img");
        sb.scan();
        sb.advance(GRACE + 300);
        check("没进加载态", !sb.busy(), sb.state());

        sb.movePointer(50, 50);
        sb.advance(GRACE + 80);
        check("指针一出现就补上", sb.state() === "show", sb.state());
    }

    // =====================================================================
    section("14. error:失败也是「等完了」,但换过地址就还得接着等");
    {
        // (a) 没有兜底地址 —— 失败了就是等完了,不能一直转
        const sb = sandbox();
        const im = sb.media("img");
        sb.scan();
        sb.advance(GRACE + 20);
        check("先亮起来", sb.busy(), sb.state());

        im.complete = true;         // 浏览器对一张取失败了的图,complete 就是真
        im.fire("error");
        sb.advance(MIN_SHOW + MERGE + 400);
        check("失败之后能收场,不会一直转", sb.state() === "idle", sb.state());
        check("留下的 rAF 也停了", sb.rafCount() === 0, `raf=${sb.rafCount()}`);
    }
    {
        /*
         * (b) 站点上真正的情况:缩略图缺失,内联 onerror 把 src 换成 picsum 的远端地址。
         *
         * 那一刻起「在等的东西」变了 —— 换地址之后那次请求才刚开始,而这跟刚才那次
         * 失败的请求是两回事。所以两种挂载顺序都跑一遍:内联处理器是解析时挂上的,
         * 排在我们前面;但顺序不是我们说了算的(picture / JS 插入的元素就反着来),
         * 而**结论不能取决于顺序**。这正是把判断推到下一个 tick 的理由 ——
         * 不是「等一下更稳」,是「不等的话,有一种顺序会读错」。
         *
         * 注意这两种顺序都发生在**同一次 error 事件里**:浏览器派的是一次事件,
         * 两个处理器在这一次里按顺序跑完。所以这里靠挂载先后区分,不是靠先 fire 再换。
         */
        const cases = [
            ["内联 onerror,排在我们前面", "before"],
            ["换地址的处理器排在我们后面", "after"],
        ];
        for (const [label, when] of cases) {
            const sb = sandbox();
            const im = sb.media("img");
            const swap = () => { im.src = "https://picsum.photos/800/450"; im.complete = false; };

            if (when === "before") im.addEventListener("error", swap);
            sb.scan();                                      // 我们的监听挂在这一刻
            if (when === "after") im.addEventListener("error", swap);

            im.complete = true;                             // 事件触发时,失败已经是事实
            im.fire("error");                               // 一次事件,两个处理器
            sb.advance(1);                                  // 让推迟的那次重新判断跑掉

            check(`${label} → 仍然算在等`, sb.pending() === 1, `pending=${sb.pending()}`);
        }
    }
    {
        /*
         * (c) 推迟那一 tick 里页面被换掉 —— 而且这一 tick 里地址刚好又换过一次。
         *
         * 这一点必须凑齐,否则测不到东西:单纯的「元素没了」本来就该 settle,加不加
         * 那句守卫结果都是 0。只有当重新判断**本来会把它算回等待**时,守卫才有作用 ——
         * 也就是地址刚被换掉、complete 又变回假的那一刻。少了守卫,这个已经脱离文档的
         * 元素会被重新按上 15 秒的超时,光标就一直转着。
         */
        const sb = sandbox();
        const im = sb.media("img");
        im.addEventListener("error", () => { im.src = "https://picsum.photos/800/450"; im.complete = false; });
        sb.scan();
        check("先算上了", sb.pending() === 1, String(sb.pending()));

        im.complete = true;
        im.fire("error");       // 推迟;此刻 complete 已经被那个处理器改回假了
        im.remove();            // 还没轮到那次重新判断,页面就换掉了
        sb.advance(50);

        check("不会把一个已经脱离文档的元素重新算回等待", sb.pending() === 0, String(sb.pending()));
    }

    // =====================================================================
    section("15. scan 传进来的根本身就是媒体,也得算上");
    {
        const sb = sandbox();
        const im = sb.media("img");
        sb.scan(im);        // querySelectorAll 只找后代,不算 root 自己 —— 以前会漏掉它
        check("root 自己是 <img> 时算一处等待", sb.pending() === 1, String(sb.pending()));
    }
    {
        const sb = sandbox();
        check("导出了 MEDIA_SEL(逐页审那个脚本靠它定义「什么算媒体」)",
            typeof sb.win.LoadingWatch.MEDIA_SEL === "string", String(sb.win.LoadingWatch.MEDIA_SEL));
    }
}

runTests();
console.log(bad === 0 ? `\n全部通过(${total} 项)` : `\n${bad} / ${total} 项不合格`);
process.exit(bad === 0 ? 0 : 1);
