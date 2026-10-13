/**
 * 等待态 —— 「什么时候算加载中」这件事的全部定义。
 *
 * 分两半:前半是这个站点上**什么算在等**,后半是光标在等的时候长什么样。
 * 两半刻意写在一起:判据和表现分开放在两个文件里,以后改判据就一定会忘了改表现。
 *
 * ── 什么算在等 ──
 *
 * 这个站没有请求、没有接口,页面是同步拼出来的,所以「加载中」只能是**媒体还没到**:
 * 作品集一次挂 10 张缩略图、项目页挂一张大图、4 个项目页嵌 B 站播放器、
 * 《Beavering Away》那个本地 demo 有 93MB。这些都是真的在等,不是装出来的。
 *
 * 判据一律问浏览器自己的状态,不猜:
 *   img    —— `complete` 为假(缓存命中时它一开始就是真的,所以不会白闪)
 *   video  —— 元数据还没到(`readyState < 1`),或者播放中在缓冲(`waiting` 之后没等到 `playing`)
 *   iframe —— 还没触发过 `load`。跨域拿不到里面的状态,只能到这个粒度
 *
 * 每个元素都有超时兜底。光标卡在加载态出不来,比没有加载态糟糕得多。
 *
 * ── 什么时候亮相 ──
 *
 * 直接跟着「有没有在等」走是不行的:缓存命中的图 3ms 就完了,亮一下反而是故障。
 * 所以中间垫了两道闸:
 *   GRACE_MS   等够这么久还没好,才把液体亮出来 —— 短于它的等待根本不显示
 *   MIN_SHOW_MS 亮出来之后至少演这么久 —— 免得 200ms 的等待闪一下就没
 *
 * ── 怎么收场 ──
 *
 * 等的东西好了,不会正好落在动画的分段上。直接把时间跳到合并段会硬切一下,
 * 所以收尾走 `sampleCollapse`:它从**任意一帧**出发都能连续地收成一个球,
 * 而且最后一帧和普通光标逐像素一样,交回 #latex-ball 时看不出接缝。
 * 代价是固定的 440ms —— 这段时间里液体在聚拢,顺便把普通球淡回来。
 */
(function () {
    "use strict";

    const CFG = {
        GRACE_MS: 140,          // 等够这么久还没好才亮相
        MIN_SHOW_MS: 420,       // 亮相之后至少演这么久
        CAP_MS: 45000,          // 兜底:一次等待最多亮这么久,再久就当它不会好了
        // 每个元素自己的兜底(元素可能永远不发 load,比如被墙掉的 iframe)
        TIMEOUT: { img: 15000, video: 30000, iframe: 6000 },
    };

    // 「什么算媒体」只在这一个地方定义。站上出现了别的标签(picture/audio/embed…)
    // 得先在这里认它,否则它永远不参与等待判断,而且是静默的。
    const MEDIA_SEL = "img, video, iframe";

    /*
     * 每种元素「现在还在不在等」的判断,以及会让答案改变的事件。
     * 判断写成函数而不是一次性布尔,是因为 video 会反复进出等待态(缓冲),
     * 而且事件顺序不保证 —— 每次都重新问一遍最不容易出错。
     */
    const RULES = {
        img: {
            pending: (el) => !el.complete,
            events: ["load", "error"],
        },
        video: {
            pending: (el) => el.readyState < 1 || el.__cfxBuffering === true,
            events: ["loadedmetadata", "error", "waiting", "playing", "canplay", "seeked", "emptied"],
            on: (el, type) => {
                // 播放中缓冲:waiting 起、playing/canplay 止
                if (type === "waiting") el.__cfxBuffering = true;
                else if (type === "playing" || type === "canplay" || type === "seeked" || type === "error") {
                    el.__cfxBuffering = false;
                }
            },
        },
        iframe: {
            pending: (el) => el.__cfxLoaded !== true,
            events: ["load"],
            on: (el, type) => {
                if (type === "load") el.__cfxLoaded = true;
            },
        },
    };

    const reduceMotion = typeof matchMedia === "function"
        && matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- 等待集合 ----
    const pending = new Set();      // 当前还没好的元素
    const watched = new Set();      // 已经挂了监听的元素
    const timers = new Map();       // 元素 -> 兜底定时器

    function settle(el) {
        const t = timers.get(el);
        if (t) { clearTimeout(t); timers.delete(el); }
        if (pending.delete(el)) onChange();
    }

    function hold(el) {
        if (dead) return;
        if (pending.has(el)) return;
        pending.add(el);
        const kind = el.__cfxKind;
        timers.set(el, setTimeout(() => settle(el), CFG.TIMEOUT[kind] || 15000));
        onChange();
    }

    function recheck(el) {
        const rule = RULES[el.__cfxKind];
        if (!rule) return;
        if (rule.pending(el)) hold(el);
        else settle(el);
    }

    function watch(el, kind) {
        el.__cfxKind = kind;
        watched.add(el);
        for (const type of RULES[kind].events) {
            el.addEventListener(type, () => {
                if (RULES[kind].on) RULES[kind].on(el, type);
                if (type !== "error") { recheck(el); return; }
                /*
                 * error 要推到下一个 tick 再问。
                 *
                 * 站点上缩略图缺失时的兜底是内联的 onerror="this.src='…远端…'"。
                 * 内联处理器是解析时挂上的,比我们早,所以轮到我们时地址已经换过了 ——
                 * 但这依赖挂载顺序,而顺序不是我们说了算(picture/JS 插入的元素就不是这样)。
                 * 换地址之后那次请求刚刚开始,此刻问「好了吗」问的是新地址,答案才作数。
                 * 等一个 tick,顺序就无关了。
                 */
                setTimeout(() => {
                    // 这一 tick 里页面可能已经换掉了。脱离文档的元素不该再占着 pending
                    // (换页时 scan() 的清理扫的正是这个,但那要等到下一次 scan 才发生,
                    // 中间光标就一直转着)
                    if (!el.isConnected) { settle(el); return; }
                    recheck(el);
                }, 0);
            });
        }
        recheck(el);
    }

    /*
     * 扫一遍容器,把新出现的媒体挂上监听,把已经不在了的摘掉。
     * 每次换页 #content 是整体替换的,旧元素全都脱离文档,它们的监听也就没用了 ——
     * 不清掉的话,上一个页面的 pending 会把光标永久钉在加载态。
     */
    function scan(root) {
        const scope = root || document.getElementById("content") || document.body;

        for (const el of watched) {
            if (!el.isConnected) {
                settle(el);
                watched.delete(el);
            }
        }

        /*
         * querySelectorAll 只找后代,传进来的 root 自己不算。所以当 root 本身就是
         * 一个 <img>/<video>/<iframe>(比如「这块图换了,重看它一个」)时,原来会漏掉它。
         * matches 在 document 上也有,但 root 可能是 document 或 body —— 它们没有
         * tagName 可匹配,matches(MEDIA_SEL) 自然是假,所以直接问就行,不用分支。
         */
        const found = typeof scope.matches === "function" && scope.matches(MEDIA_SEL)
            ? [scope].concat(Array.from(scope.querySelectorAll(MEDIA_SEL)))
            : scope.querySelectorAll(MEDIA_SEL);

        for (const el of found) {
            if (watched.has(el)) continue;
            const kind = el.tagName.toLowerCase();
            if (RULES[kind]) watch(el, kind);
        }
    }

    // ---- 光标侧的状态机 ----
    // idle: 没有等待,普通光标
    // grace: 在等了,但还没亮出来
    // show:  液体在转
    // end:   在收尾,收完交回普通球
    let state = "idle";
    let graceAt = 0;
    let waitAt = 0;
    let showAt = 0;
    let liquidT = 0;
    let endT = 0;
    let fromBalls = null;
    let lastSample = null;      // 上一步真正画出去的那一帧
    let raf = 0;
    let lastNow = 0;
    let layer = null;

    /*
     * 已经交还过系统光标了(见 ball.js 里的 handBack)。两种来路:
     *   - 别处出错,ball.js 叫了 handBack() —— 那是运行中叫停;
     *   - 根上已经挂着 cursor-off —— 说明交还发生在**这个文件加载之前**,
     *     不会有人来叫我,自己看一眼就别接手了。
     */
    let dead = document.documentElement.classList.contains("cursor-off");

    function onChange() {
        if (dead) return;
        if (state === "idle" && pending.size > 0) {
            if (reduceMotion) return;             // 减弱动效:只保留位置跟随,不做形变
            if (!window.cursorState || !window.cursorState.visible) return;  // 指针还没出现过,没有地方可画
            state = "grace";
            graceAt = performance.now();
            waitAt = graceAt;
            start();
        }
    }

    /*
     * 图层交给引擎的 createLayer()。
     *
     * 这里以前自己写了一遍「固定壳 + 搬到指针上」,元素状态(hover.js)也需要那一套。
     * 而壳的缩放系数必须和 #latex-ball 逐像素一致(位置和按下缩放都在 ball.js 手里,
     * 系数从 cursorState.pressScale 读),抄成两份,迟早有一份忘了跟着改 —— 那一刻
     * 交接就会跳一下。所以两处都用引擎里那一处。
     */
    function build() {
        if (layer) return;
        layer = window.CursorFX.createLayer();
        // .cfx-fixed .cfx 在样式里是 opacity:0,得显式打开
        layer.fx.setVisible(true);
    }

    // 兼容旧的写法:壳就是 layer.wrap
    function placeWrap() {
        if (layer) layer.place();
    }

    /*
     * 指针位置每动一下就同步一次。
     *
     * 这个监听是**常驻**的,不是进加载态才挂 —— 挂在入口处会踩到一个顺序问题:
     * 首次移动时 ball.js 的处理器和我这个谁先跑是不确定的,先跑的那次读到的
     * `visible` 还是假的,于是这一次等待就永远不亮。常驻之后下一动就自己纠正了。
     * 空闲时它只花一个 if。
     */
    function sync() {
        if (dead) return;
        const c = window.cursorState;
        if (state === "idle") {
            if (c && c.visible && pending.size > 0) onChange();
            return;
        }
        placeWrap();
        if (layer && c) layer.fx.setPressed(c.press > 0.5);
    }

    // 开局就知道自己不该接手的(根上已经有 cursor-off),监听也别挂 —— sync 进门
    // 第一句就是 `if (dead) return`,挂上只是三个常年空转的监听(和 ball.js 同一个理由)
    if (!dead) {
        document.addEventListener("pointermove", sync, { passive: true, capture: true });
        document.addEventListener("pointerdown", sync, { passive: true, capture: true });
        document.addEventListener("pointerup", sync, { passive: true, capture: true });
    }

    function start() {
        if (dead) return;
        lastNow = performance.now();
        if (!raf) raf = requestAnimationFrame(tick);
    }

    /*
     * 把系统光标还回去 —— ball.js 的 handBack() 叫到这里,或者宿主自己叫。
     * 做的事就是「整套退场」:等待集合清空、状态回 idle、类摘掉、图层拆掉、
     * 循环停掉。dead 一旦为真,后面 sync/onChange/tick 全都不再接手,
     * 所以这件事只发生一次,也不会被下一个 pointermove 重新点着。
     */
    function handBack() {
        if (dead) return false;
        dead = true;
        for (const t of timers.values()) clearTimeout(t);
        timers.clear();
        pending.clear();
        watched.clear();
        state = "idle";
        document.documentElement.classList.remove("is-loading");
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        // 图层整个拆掉,不只是藏起来:交还之后不会再有人给它写位置,
        // 留着就是一个固定不动的透明壳挂在 DOM 上
        if (layer) { layer.shown(false); layer.destroy(); layer = null; }
        return true;
    }

    function finish() {
        state = "idle";
        document.documentElement.classList.remove("is-loading");
        if (layer) layer.shown(false);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        // 让位的人负责把位置还回去:刚才元素状态为了腾地方把自己收掉了,
        // 现在指针还停在原来那块元素上,得让它重新认一次(它不会自己发现 ——
        // 指针没动过就没有 pointerover)。
        if (window.HoverWatch) window.HoverWatch.refresh();
    }

    /*
     * 收尾:从当前这一帧接着往下走,不跳时间。
     * 该等的东西好在哪一拍是不受控的,直接切到合并段会看到一下硬跳。
     */
    function beginEnd() {
        // 起点取**上一步真正画出去的那一帧**,不是按当前时间重算一帧 ——
        // 收尾的第一帧必须和刚才那一帧接得上,差一帧就是一次可见的跳
        fromBalls = (lastSample || window.CursorFX.sampleLoading(liquidT)).balls;
        endT = 0;
        state = "end";
        // 现在就把普通球交还:收尾过程中液体在往指针聚拢,
        // 底下那颗球正好被「露」出来,而不是等收完了才突然出现
        document.documentElement.classList.remove("is-loading");
    }

    // 指针移出文档:球本来就会淡出隐藏,液体也得跟着走,不然窗口边上留一坨在转。
    // 这里直接切,不收尾 —— 两者都是「用户已经不看这里了」,收尾反而多演了 440ms 的戏。
    document.documentElement.addEventListener("pointerleave", () => {
        if (state === "idle") return;
        if (layer) layer.shown(false);
        finish();
    });

    function tick(now) {
        if (dead) { raf = 0; return; }
        const dt = Math.min(64, now - lastNow);
        lastNow = now;

        // 兜底:等太久了就当它不会好了,免得光标一直转
        if (pending.size > 0 && now - waitAt > CFG.CAP_MS) {
            for (const el of Array.from(pending)) settle(el);
        }

        if (state === "grace") {
            if (pending.size === 0) { raf = 0; state = "idle"; return; }
            if (now - graceAt >= CFG.GRACE_MS) {
                build();
                layer.shown(true);
                sync();
                // 液体第 0 帧就是指针上的一颗整球,和普通光标逐像素一样,
                // 所以直接出现就行,不用淡入 —— 淡入反而会在交叠的那几帧里透出底下
                layer.fx.setVisible(true);
                document.documentElement.classList.add("is-loading");
                state = "show";
                showAt = now;
                liquidT = 0;
            }
        }

        if (state === "show") {
            liquidT += dt;
            if (pending.size === 0 && now - showAt >= CFG.MIN_SHOW_MS) beginEnd();
        }

        // 按下的缩放是逐帧插值的,所以壳也得逐帧搬,不能只靠 pointermove
        placeWrap();

        if (state === "show") {
            lastSample = window.CursorFX.sampleLoading(liquidT);
            layer.fx.setLiquid(lastSample);
        } else if (state === "end") {
            endT += dt;
            const p = endT / window.CursorFX.CFG.MERGE_MS;
            if (p >= 1) { finish(); return; }
            layer.fx.setLiquid(window.CursorFX.sampleCollapse(fromBalls, p));
        }

        raf = requestAnimationFrame(tick);
    }

    window.LoadingWatch = {
        scan,
        CFG,
        // 「什么算媒体」的唯一定义。测试也读这个,免得那边另抄一份、这边加了标签那边不知道。
        MEDIA_SEL,
        /*
         * 光标此刻是不是被加载态占着 —— 元素状态(hover.js)靠这个让位。
         * 报的是「非 idle」而不是「正在显示」:grace 段还没亮相,但这边已经在
         * 往加载态上走了;end 段液体还在收尾,也一样不能被插队。
         */
        busy: () => state !== "idle",
        /*
         * 把系统光标还回去(整套退场,不再接手)。两个来路:
         *   - ball.js 的 handBack():脚本抛错了,它负责叫停这台主题上所有模块;
         *   - 宿主自己叫:主题跑到浏览器之外去的时候,宿主知道什么时候该关掉
         *     (见 cursor-beyond-browser 那条)。
         */
        handBack,
        // 给测试用:看看此刻在等什么
        _debug: () => ({ state, pending: pending.size, ended: reduceMotion, dead }),
        // 手动点亮,给「我知道接下来会慢」的地方用(目前没人调,但接口留着)
        hold: (el) => hold(el),
    };

    // 首屏:index.html 的 window.onload 会调 renderPage,那里会 scan 一次。
    // 这里再兜一次,防止某个页面没走 renderPage 就把媒体放进来了。
    if (document.readyState === "complete") scan();
    else window.addEventListener("load", () => scan());
})();
