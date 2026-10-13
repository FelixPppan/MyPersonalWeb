/*
 * cursor-embed —— 对外的那一层。
 *
 * 上面是引擎(cursor-fx.js 的原文,一个字节没改),负责「长什么样」;
 * 这里负责「什么时候长成什么样」,以及一件引擎不该管的事:**怎么把系统光标藏掉而不把自己弄瞎**。
 *
 * ── 藏光标这件事,本站的做法不能照搬 ──
 *
 * 本站皮肤里那条 `html.has-pointer * { cursor: none !important }` 有个副作用:
 * 它把**所有**元素的 cursor 都压成了 none,于是 getComputedStyle(el).cursor 什么也问不出来
 * ——「这块该不该变形」的唯一可靠来源被自己掐掉了。本站绕开的办法是另开一条 --cursor 通道,
 * 让每个控件自己声明。
 *
 * 这条通道对**自己写的站**成立,对**别人买回去嵌的站**不成立:买家凭什么给自己的
 * <button> 一条条补声明?不补,球就永远是一颗普通球,他会觉得这东西坏了。
 *
 * 于是「读得到」和「藏得住」第一次能同时成立:元素**声明过**才需要藏,而它声明的是什么,
 * 恰好就是藏之前能读到的那个值。指针划到它身上时,我们再给它补一条行内
 * `cursor: none !important`(行内 !important 压过样式表 !important),并记下原值,销毁时还回去。
 *
 * 但还有一层:浏览器**根本不给 <button> 一个 cursor:pointer**。所以「读元素自己的
 * cursor」对一段什么都没改的 HTML 来说是读不出东西的 —— 指针划过按钮会什么都不发生,
 * 买家会以为买回来的东西是坏的。所以三条通道(属性 / --cursor / cursor)都没说话时,
 * 再按**标签**认一次:button、a[href]、input[type=checkbox] 是可点的,input 和 textarea
 * 是文本。这一步排在最后,页面自己写过的永远赢,见 readIntent() 末尾和 impliedIntent()。
 *
 * 所以这里换一个藏法,关键在于**不要用 `*`**:
 *
 *     html.cfx-embed-on, html.cfx-embed-on body { cursor: none !important }
 *
 * 只压在 html 和 body 上。cursor 是**继承**属性,所以：
 *
 *   · 自己没声明过 cursor 的元素 —— 继承到 none,系统光标被藏掉(这正是绝大多数元素);
 *   · 自己声明过的元素(<a> 的 pointer、<input> 的 text、拖拽把手的 grab…) ——
 *     它自己的声明赢过继承来的值,系统光标**照常显示**,而 getComputedStyle 读到的
 *     也是它自己那个真值。
 *
 * 于是「读得到」和「藏得住」第一次能同时成立:元素**声明过**才需要藏,而它声明的是什么,
 * 恰好就是藏之前能读到的那个值。指针划到它身上时,我们再给它补一条行内
 * `cursor: none !important`(行内 !important 压过样式表 !important),并记下原值,销毁时还回去。
 *
 * 这条修法的代价只有一个,而且很小:每个元素**第一次**被划到的那一帧,可能会闪一下系统光标。
 * 之后它进缓存,不再读也不再闪。用一个 WeakMap 换掉一次全文档重排,值得。
 *
 * ── 「画不出来就让位」在库里的样子 ──
 *
 * 本站是这个规矩:元素要了一个我们没有画法的标准光标(crosshair / help / wait…),
 * 就把系统光标让回去,球留着。
 *
 * 库里要让位反而更省事:让位靠的就是**没藏过**。所以藏的条件不止「它自己声明过」,
 * 还要加一条「这个值我们画得出来」—— 画不出来的那些,系统光标从来就还在,
 * 让位于是从「做一件事」变成了「不做一件事」。
 *
 * ── 藏了一个祖先,它的后代怎么办 ──
 *
 * 藏 = 往那个元素上写一条行内 `cursor: none`。cursor 是继承属性,于是这个元素**底下所有
 * 没自己声明过的后代**也一起变成了 none —— 包括那些还没来得及判过的。等指针划到它们身上,
 * 读出来的「none」已经分不清是「我们藏的」还是「页面本来就没打算给光标」。
 *
 * 所以读不到值时往上找:祖先身上存着它当时的判断,拿它的用。找不到就当这块没提要求。
 * 这条只在「祖先已经被藏过」时才起作用 —— 没藏过的话,后代继承到的就是那个真值,
 * 读一次就够了。
 */
(function () {
    "use strict";

    const ENGINE = typeof window !== "undefined" ? window.CursorFX : null;
    if (!ENGINE) {
        throw new Error("[cursor-embed] 找不到引擎:请先加载 cursor-fx.js(或使用打包好的 cursor-embed.js)");
    }

    const BALL_D = 26;          // 引擎基准球的直径 px,「大小」这一项就是按它折算的
    const EPS = 0.015;          // q 小到这里当状态结束。不能取 0:一阶滤波只无限逼近
    const OUT_DROP_Q = 0.2;     // 退场那一格 q 落到这里就摘掉(理由同本站 hover.js)
    const HIDE_CLASS = "cfx-embed-on";

    /*
     * 可配的东西就这几个,其余(环半径、液滴数、各处摆动、时间常数)是形状本身,
     * 动它们就不是「调一下」而是改设计了,所以不往外放。
     *
     * 注意这里**没有** auto:「要不要自动起步」不是这一份光标的参数,是 script 标签
     * 上的事(见文件末尾那段)。两者混在一个对象里,买家会以为 init({auto:false})
     * 和 <script data-manual> 是两件事,而它们其实是同一件。
     */
    const DEFAULTS = {
        size: BALL_D,       // 球的直径 px
        color: "",          // "" = 出厂的黑球;给字符串 = 纯色;给对象 = {hi, mid, lo, ink}
        press: 0.14,        // 按下时缩小的比例(0 = 按下不缩)
        speed: 1,           // 形状进出速度倍率,大 = 快
        shadow: true,       // 是否带投影
        zIndex: 9999,
        hideNative: true,   // 藏系统光标;关掉它等于「球和箭头并存」
    };

    /* ===== 意图表:标准光标关键字 -> 形状 =====
     *
     * 和本站 hover.js 是同一张表,一处一处对着抄的。两边**故意**分开:
     * 库要能独立演进(比如这里支持 data-cursor 属性),站也要能独立演进。
     * 形状本身不分家 —— 两边调的是同一个引擎的同一个函数,所以不会出现
     * 「站上好看、卖出去的那份不一样」。
     */
    const INTENT = {
        pointer: { key: "viscous", name: "viscous", draw: (fx, te, q) => fx.sampleViscous(te, q) },
        // 可抓取 = 可点击同一个形状,所以 key 也同一个:两族之间来回换不该收拢
        grab: { key: "viscous", name: "viscous", draw: (fx, te, q) => fx.sampleViscous(te, q) },
        "not-allowed": { key: "burst", name: "burst", noPress: true, draw: (fx, te, q) => fx.sampleBurst(te, q) },
        "no-drop": { key: "burst", name: "burst", noPress: true, draw: (fx, te, q) => fx.sampleBurst(te, q) },
        // 文本 = 两颗球中间一丝。是「线」但不进缩放那套方向逻辑,所以没有 axis
        text: { key: "beam", name: "beam", noPress: true, draw: (fx, te, q) => fx.sampleBeam(te, q) },
        "zoom-in": { key: "zoom:in", name: "zoom", draw: (fx, te, q) => fx.sampleZoom(te, q, "in") },
        "zoom-out": { key: "zoom:out", name: "zoom", draw: (fx, te, q) => fx.sampleZoom(te, q, "out") },
    };

    /*
     * 按下时的形状。三个声明值(grabbing / move / all-scroll)和「手按着」落到**同一个对象**上,
     * 于是两者之间切换时 state === want,一步换形都不触发。
     */
    const PRESS = {
        key: "splat", name: "splat", fast: true,
        draw: (fx, te, q) => fx.sampleSplat(te, q),
    };
    INTENT.grabbing = PRESS;
    INTENT.move = PRESS;
    INTENT["all-scroll"] = PRESS;

    // 拖动缩放那一族:值 -> 度数只有引擎那一处定义,这里不另抄一张
    const RESIZE_AXIS = ENGINE.RESIZE_AXIS || {};
    for (const v of Object.keys(RESIZE_AXIS)) {
        const deg = RESIZE_AXIS[v];
        INTENT[v] = {
            key: "resize:" + deg,
            name: "resize",
            axis: deg,
            value: v,
            hold: true,
            draw: (fx, te, q) => fx.sampleResize(te, q, deg),
        };
    }

    // 值 -> 状态名。从上面那张表推出来,不另写一份
    const MAP = {};
    for (const k of Object.keys(INTENT)) MAP[k] = INTENT[k].name;

    /*
     * 标准光标关键字全表。它回答的是「这是不是一个标准关键字」,不是「我们画不画得出来」
     * —— 后者由 INTENT 回答。两个问题分开,加一个认领值就不必动这张表。
     * 表里**没有** auto / default / none:它们是「随大流」,不是「要个箭头」。
     */
    const REAL_CURSORS = new Set([
        "context-menu", "help", "pointer", "progress", "wait", "cell", "crosshair",
        "text", "vertical-text", "alias", "copy", "move", "no-drop", "not-allowed",
        "grab", "grabbing", "all-scroll", "col-resize", "row-resize",
        "n-resize", "e-resize", "s-resize", "w-resize",
        "ne-resize", "nw-resize", "se-resize", "sw-resize",
        "ew-resize", "ns-resize", "nesw-resize", "nwse-resize",
        "zoom-in", "zoom-out",
    ]);

    /*
     * 这一趟用哪一组时间常数:在场的、要来的、正在退场的那一格,谁带 fast 就算谁的。
     * 三个都要传 —— 松手那一刻「退场」的才是按下那一摊,不传的话这一趟会被当成普通
     * 形变,新形状要 90ms 才长回来,手上感觉是「松手之后愣了一下」。
     */
    function taus(a, b, c2) {
        const c = ENGINE.CFG;
        if ((a && a.fast) || (b && b.fast) || (c2 && c2.fast)) {
            return { in: c.PRESS_IN_TAU, out: c.PRESS_OUT_TAU };
        }
        return { in: c.STATE_IN_TAU, out: c.STATE_OUT_TAU };
    }

    function assign(target) {
        for (let i = 1; i < arguments.length; i++) {
            const src = arguments[i];
            if (!src) continue;
            for (const k of Object.keys(src)) if (src[k] !== undefined) target[k] = src[k];
        }
        return target;
    }

    /*
     * 读一块元素「想要什么」。
     *
     * 三条通道,按优先级:
     *   1. data-cursor="pointer"  —— 最省事的一条,买家的 HTML 里直接写,不用碰 CSS;
     *   2. --cursor               —— 会继承,适合「这个区块里都是我自己的控件」;
     *   3. 真的 cursor            —— 画得出来就用它,画不出来见 decide()。
     *
     * 第 2 条一旦有值就以它为准,**不再往下落**:`--cursor: auto` 是一条明确的
     * 「我不提要求」,而不是「没写」。混为一谈的话,买家就没法关掉某一块的继承 ——
     * 而继承恰恰是这条通道最好用的地方。
     */
    function readIntent(el) {
        const out = { value: "", cursor: "", blinded: false };
        const cs = getComputedStyle(el);
        out.cursor = (cs.cursor || "").trim();

        const attr = el.getAttribute ? el.getAttribute("data-cursor") : null;
        if (attr && String(attr).trim()) {
            const a = String(attr).trim();
            out.value = a === "auto" ? "" : a;
            return out;
        }

        const v = (cs.getPropertyValue("--cursor") || "").trim();
        if (v) {
            out.value = (v === "auto" || v === "default") ? "" : v;
            return out;
        }

        /*
         * 三条通道都没说话,再看这个元素**本身是什么**。
         *
         * 为什么非有这一步不可:浏览器根本不会给 <button> 一个 cursor:pointer。
         * 默认的 <button>、<a href>、<input type=checkbox> 算出来的 cursor 是
         * 「default」或者继承来的「auto」—— 也就是说,买家把那行 <script> 贴进页面、
         * 一个字不改的话,指针划过按钮会**什么都不发生**。买回来第一眼就以为东西是坏的。
         *
         * 所以这里按标签认:它天生就是可点的就是可点,天生是打字的就打字。
         * 优先级排在三条通道**之后** —— 页面自己写过的永远赢,包括写 cursor:default
         * (那是「照平台默认来」,不是一个关于我们这颗球的意见,所以照旧当没说过)。
         *
         * 想关掉某一块的这个推断,仍然有明确写法:data-cursor="auto" 或 --cursor: auto。
         * 那两条通道读在前面,一旦有值就直接返回,轮不到这里。
         */
        const c = out.cursor;
        if (c && c !== "none" && c !== "auto" && c !== "default") { out.value = c; return out; }
        out.value = impliedIntent(el);
        // 只在自己确实被压成了 none、而且连标签也说不出要什么的时候,才去问祖先
        if (!out.value && c === "none") out.blinded = true;
        return out;
    }

    /*
     * 这个元素**自己是什么** -> 想要什么形状。
     *
     * 表里写的是 HTML 各自的「可交互模样」,不是风格偏好:checkbox 是拿鼠标点的,
     * 所以是可点;text 输入框是要落光标的,所以是文本。
     */
    const TEXTY = new Set([
        "text", "search", "email", "url", "tel", "password", "number",
        "date", "datetime-local", "month", "week", "time",
    ]);
    const CLICKY = new Set(["checkbox", "radio", "submit", "reset", "button", "file", "color", "range"]);
    const ROLES = new Set(["button", "link", "tab", "menuitem", "menuitemcheckbox",
        "menuitemradio", "option", "checkbox", "radio", "switch", "treeitem"]);

    function impliedIntent(el) {
        const t = el.tagName ? el.tagName.toLowerCase() : "";
        const attr = (k) => (el.getAttribute ? el.getAttribute(k) : null);

        if (t === "a" || t === "area") return attr("href") != null ? "pointer" : "";
        if (t === "button" || t === "summary" || t === "label" || t === "select") return "pointer";
        if (t === "textarea") return "text";
        if (t === "input") {
            const ty = (attr("type") || "text").toLowerCase();
            if (TEXTY.has(ty)) return "text";
            if (CLICKY.has(ty)) return "pointer";
            return "";
        }
        // contenteditable:自己是一块可编辑的文本面
        const ce = attr("contenteditable");
        if (ce != null && ce !== "false") return "text";

        const role = attr("role");
        if (role && ROLES.has(role.toLowerCase())) return "pointer";
        return "";
    }

    // 一块「什么也没提要求」的元素。不是 null —— null 会让调用方漏掉「清掉上一块的状态」
    function blankRec(cursor) {
        return {
            value: "", cursor: cursor || "", entry: null, handover: false,
            hidden: false, prev: "", prevPrio: "",
        };
    }

    function create(opts) {
        const o = assign({}, DEFAULTS, opts);
        const reduceMotion = typeof matchMedia === "function"
            && matchMedia("(prefers-reduced-motion: reduce)").matches;

        const root = document.documentElement;

        // ===== DOM:一个固定在视口原点的壳,由 JS 平移到指针上 =====
        const host = document.createElement("div");
        host.className = "cfx-embed";
        host.setAttribute("aria-hidden", "true");
        host.style.zIndex = String(o.zIndex);
        document.body.appendChild(host);

        const fx = ENGINE.create(host, {});
        fx.setVisible(false);
        host.style.display = "none";

        if (o.color) applyColor(o.color);
        if (!o.shadow) host.classList.add("cfx-embed-no-shadow");

        function applyColor(c) {
            if (typeof c === "string") {
                // 纯色:四个停靠点都写同一个值,渐变就成了平的
                host.style.setProperty("--cfx-hi", c);
                host.style.setProperty("--cfx-mid", c);
                host.style.setProperty("--cfx-lo", c);
                host.style.setProperty("--cfx-ink", c);
                return;
            }
            if (c && typeof c === "object") {
                for (const k of ["hi", "mid", "lo", "ink"]) {
                    if (c[k]) host.style.setProperty("--cfx-" + k, c[k]);
                }
            }
        }

        // ===== 指针位置。不做弹簧跟随:指针在哪球就在哪 =====
        /*
         * 位置从 resume 接过来,不从原点开始。
         *
         * 改配置只能整只重建(见 API 的 init),而重建之后指针并没有动过 —— 所以新那
         * 一份接手旧那一份记下的位置,球就停在原地,调大小调颜色时不会闪一下没了。
         */
        let x = resume.x;
        let y = resume.y;
        let inside = resume.on;

        if (inside) {
            // 上一份是亮着的,这一份直接亮着接上,不用等第一次 pointermove
            host.style.display = "";
            fx.setVisible(true);
        }

        // ===== 状态机 =====
        let want = null;        // 这一帧想要的那一格;null = 没有(画回一颗普通球)
        let state = null;       // 正在长出来的那一格
        let q = 0;              // 它的在场程度
        let out = null;         // 正在退场的那一格(只有交接那一趟非空)
        let qOut = 0;
        let press = 0;          // 0..1,按下缩放的行程
        let pressing = false;

        let hoverEntry = null;  // 指针底下那块元素对应的那一格
        let hoverValue = "";    // 它声明的原文(让位靠的是值,不是状态)
        let handover = false;   // 这块元素我们画不出来,系统光标留着
        let forced = null;      // 手动接管时压过一切的那一格
        let waiting = false;

        let raf = 0;
        let last = 0;
        let lastT = "";
        let dead = false;
        let running = false;    // 循环在不在跑。静止了就停,输入再叫醒

        const cache = new Map();   // 元素 -> 决定过的那一条。要能遍历,所以不是 WeakMap

        // ===== 藏光标 / 还回去 =====

        function hideEl(el, rec) {
            rec.prev = el.style.getPropertyValue("cursor") || "";
            rec.prevPrio = el.style.getPropertyPriority ? el.style.getPropertyPriority("cursor") : "";
            el.style.setProperty("cursor", "none", "important");
            rec.hidden = true;
        }

        function showEl(el, rec) {
            if (!rec.hidden) return;
            if (rec.prev) el.style.setProperty("cursor", rec.prev, rec.prevPrio || "");
            else el.style.removeProperty("cursor");
            rec.hidden = false;
        }

        /*
         * 决定一块元素,并顺手把它该藏的藏掉。
         *
         * 藏的三个条件缺一不可:
         *   · 它**自己声明过** cursor —— 系统光标是被 body 那条规则继承着藏掉的,
         *     没声明过的不用我们动第二遍(它们压根不显示自己的光标);
         *   · 这个值**不是** none —— 页面自己藏起来的,我们不抢功也不多写一笔;
         *   · 这个值我们**画得出来** —— 画不出来的(crosshair / help / wait…)要的是让位,
         *     让位就是「不藏」,所以这条一排除,系统光标自然还在。
         */
        function decide(el) {
            if (!el || el.nodeType !== 1) return null;
            const hit = cache.get(el);
            if (hit) return hit;

            const r = readIntent(el);
            let rec;

            if (!r.value && r.blinded) {
                /*
                 * 读不到,而且被压成了 none —— 那多半是**我们**把某个祖先藏了,
                 * 顺带把这个后代也压掉了(继承)。往上找最近一个说得出话的祖先,
                 * 拿它的判断用;都说不出来就是这一块没提要求。
                 */
                const p = el.parentNode;
                const pr = p && p.nodeType === 1 ? decide(p) : null;
                rec = blankRec(r.cursor);
                if (pr) {
                    rec.value = pr.value;
                    rec.entry = pr.entry;
                    rec.handover = pr.handover;
                }
            } else {
                rec = blankRec(r.cursor);
                rec.value = r.value;
                rec.entry = (r.value && INTENT[r.value]) || null;
                // 「是标准关键字但我们没画法」= 让位。空值不算,空值是「没提要求」
                rec.handover = !rec.entry && !!r.value && REAL_CURSORS.has(r.value);
                if (o.hideNative && r.cursor && r.cursor !== "none" && !rec.handover) hideEl(el, rec);
            }

            cache.set(el, rec);
            return rec;
        }

        function useElement(el) {
            const rec = decide(el);
            if (!rec) return;
            hoverValue = rec.value;
            hoverEntry = rec.entry;
            handover = rec.handover;
        }

        // ===== 事件 =====

        /*
         * 叫醒循环。
         *
         * 静止时循环是停着的(见 step 的收工那一段),所以任何会改变画面的输入都得
         * 自己叫一声。已经在跑就直接返回 —— 一次输入一帧,不是一次输入一个循环,
         * 否则快速划过一串元素会叠出好几条 rAF 链,每一帧算好几遍。
         *
         * last 重新对一次表:停下来的那段时间没有帧,不复位的话第一帧的 dt 会是
         * 整段静止的时长(几百毫秒),那一帧的形状会瞬移过去。
         */
        function wake() {
            if (dead || running) return;
            running = true;
            last = performance.now();
            raf = requestAnimationFrame(step);
        }

        function onMove(e) {
            x = e.clientX;
            y = e.clientY;
            resume.x = x; resume.y = y; resume.on = true;
            if (!inside) {
                inside = true;
                host.style.display = "";
                fx.setVisible(true);
            }
            place();
        }

        function onOver(e) {
            useElement(e.target);
            wake();
        }

        function onDown(e) {
            useElement(e.target);
            pressing = true;
            wake();
        }

        function onUp() {
            pressing = false;
            wake();
        }

        function onLeave() {
            inside = false;
            pressing = false;
            resume.on = false;
            fx.setVisible(false);
            host.style.display = "none";
            wake();
        }

        function onBlur() { onUp(); }

        function bind(on) {
            const m = on ? "addEventListener" : "removeEventListener";
            window[m]("pointermove", onMove, { passive: true });
            window[m]("pointerdown", onDown, true);
            window[m]("pointerup", onUp, true);
            window[m]("pointercancel", onUp, true);
            window[m]("blur", onBlur);
            document[m]("pointerover", onOver, true);
            document[m]("pointerleave", onLeave);
            document[m]("pointerout", onOut, true);
        }

        // 指针离开文档时 pointerleave 不一定来(out 到别的窗口),补一道
        function onOut(e) {
            if (e.relatedTarget === null && !e.toElement) onLeave();
        }

        // ===== 逐帧 =====

        function wantNow() {
            if (forced) return forced;
            /*
             * 减弱动效下**一个形状都不画**:只剩位置跟随(和站上 ball.js 一致 ——
             * 那边连 rAF 都不跑,缩放系数归零)。
             *
             * 这里有个容易搞反的地方:「状态切换」本身不是动效,但它必然带一段形状的
             * 生长,而那正是要减掉的东西。所以整个 want 直接归空,而不是「换个不动的
             * 形状」。手动 set() 仍然有效 —— 那是调用方明确要求的,不算动效。
             */
            if (waiting || reduceMotion) return null;
            if (pressing && hoverEntry && hoverEntry.noPress) return hoverEntry;
            if (pressing) return PRESS;
            return hoverEntry;
        }

        function place() {
            const k = reduceMotion ? 0 : o.press;
            const s = (o.size / BALL_D) * (1 - press * k);
            const t = "translate3d(" + x.toFixed(1) + "px, " + y.toFixed(1) + "px, 0) scale(" + s.toFixed(4) + ")";
            if (t === lastT) return;
            lastT = t;
            host.style.transform = t;
        }

        // 最后一帧也留一份:校验要能对着「引擎真的收到的那一帧」断言,而不是另算一遍
        let lastBalls = [];

        function draw(te) {
            /*
             * 注意这里给的是**模块**(ENGINE)不是实例(fx):sampleViscous 那批采样函数是
             * 纯函数,挂在引擎模块上,不在某个实例上 —— 实例只管往容器里画。
             * 传错的话是「打开了页面什么也没有、控制台报 fx.sampleViscous is not a function」。
             */
            const a = state ? state.draw(ENGINE, te, q) : null;
            const b = out ? out.draw(ENGINE, te, qOut) : null;
            if (!a && !b) {
                // q=0 的那一颗球。和本站一致:退到没有状态时必须是精确的一颗 R0
                lastBalls = [{ x: 0, y: 0, scale: 1, on: true }];
                fx.setBall(0, 0, 1);
                return;
            }
            // 两层合成一帧再交给引擎:同一个 goo 里画,交接的两坨才会像一摊液体,而不是两层贴纸
            let balls = a ? a.balls.slice() : [];
            if (b) balls = balls.concat(b.balls);
            lastBalls = balls;
            fx.setLiquid({ balls: balls });
        }

        function countHidden() {
            let n = 0;
            for (const rec of cache.values()) if (rec.hidden) n++;
            return n;
        }

        function step(now) {
            if (dead) return;
            const dt = Math.min(48, now - last);
            last = now;
            const sp = o.speed > 0 ? o.speed : 1;

            want = wantNow();

            /*
             * 换形只能在 q≈0 那一帧做 —— 那一帧什么状态都是同一颗球。
             *
             * 判据是 **key**,不是这两个对象本身。grab 和 pointer 是两格**不同的写法、
             * 同一个形状**(ew-resize 和 col-resize 同理):按对象比就会判成「换了形」,
             * 于是白收拢一次再长回来,而那一闪没有任何理由。key 就是为这件事定的。
             */
            const sameShape = !!state && !!want && state.key === want.key;
            /*
             * 直接交接:换形的两头里有一头是「按下那一摊」。
             *
             * 这时**当场换**,不等 q≈0 —— 而旧的那一格不许扔,记进 out 里接着往下画。
             * q 交回 0 是给新那一格用的(每一格进出都是「从一颗球长起来」,它不例外);
             * 旧的那一格从它**此刻**的 q 开始收,于是画面上那一摊是接着刚才那一帧往下
             * 走的:旧的在散、新的在摊,中间没有一颗普通球。
             */
            const direct = !sameShape && !!state && !!want && (state.fast || want.fast);
            if (sameShape) {
                // 同一格身份:直接换上新的那份(画法等价),q 一动不动
                state = want;
            } else if (direct) {
                out = state;
                qOut = q;
                state = want;
                q = 0;
            } else if (q <= EPS && want) {
                state = want;
            }

            /*
             * 这一趟往哪儿走、多快。
             *
             * 注意「换形」和「生长」是**同一帧里连着算**的,不是等下一帧 —— 直接交接的
             * 第一帧新形状就已经长起来一截了。分成两帧的话,那一帧里新的还停在 q=0、
             * 而 q=0 正是**一颗普通球**;它会把旧的缩下去留下的凹口填得严严实实,
             * 画面上就真的是「先回一颗球、再摊开」—— 少了这一帧,实测离普通球最近的
             * 那一帧从 126px² 掉到 74px²,正好把这条规矩想要的东西丢掉一半。
             */
            const tau = taus(state, want, out);
            let target, base;
            if (state && want && state.key !== want.key) {
                target = 0;             // 换形:先收拢,收完下一帧再长出来
                base = tau.out / sp;
            } else if (want) {
                target = 1;
                base = tau.in / sp;
            } else {
                target = 0;
                base = tau.out / sp;
            }
            q += (target - q) * (1 - Math.exp(-dt / base));
            if (q > 1) q = 1;
            // 收干净就是「没有状态」—— 那一帧画回精确的一颗球
            if (target === 0 && q <= EPS) { q = 0; state = null; }

            /*
             * 退场那一格走同一套一阶滤波,只是目标是 0,速度是**它自己**收场那个速度
             * (只传它一格,不跟这一趟)。所以交接只是把「先收完再换」压成「一边收一边换」,
             * 没有加快任何一步 —— 反倒让它在被盖住的时候慢慢化掉,而不是急收。
             */
            if (out) {
                qOut += (0 - qOut) * (1 - Math.exp(-dt / (taus(out).out / sp)));
                if (qOut <= OUT_DROP_Q) { out = null; qOut = 0; }
            }

            const pt = (pressing && !reduceMotion ? 1 : 0);
            const ptTau = (pt ? ENGINE.CFG.PRESS_IN_TAU : ENGINE.CFG.PRESS_OUT_TAU) / sp;
            press += (pt - press) * (1 - Math.exp(-dt / ptTau));
            if (press < 0.001) press = 0;
            fx.setPressed(press > 0.5);

            draw(now);
            place();

            /*
             * 没事干了就收工。
             *
             * 一套光标控件不该在买家的页面上永远占着每一帧 —— 静止时(没有形状、没有
             * 正在退场的、也没按着)这里把 rAF 停掉,下一次输入再叫醒。注意 place() 不在
             * 这条路上:指针移动是直接调它,不靠循环。
             */
            if (!want && !out && !pressing && q === 0 && press === 0) { running = false; return; }
            raf = requestAnimationFrame(step);
        }

        // ===== 起步 =====

        if (o.hideNative) root.classList.add(HIDE_CLASS);
        bind(true);
        last = performance.now();
        // 先画一帧:那一颗球得在第一次 pointermove 之前就摆在原点上,
        // 否则 setVisible(true) 亮出来的是一个还没被 paint 过的空壳
        draw(last);
        place();

        const inst = {
            opts: o,

            /*
             * 手动指定形状(传 INTENT 里的值名);传 null / "" 交还给自动判断。
             * 给了个不认识的值返回 false 且**什么都不动** —— 猜一个近似的反而是更坏的行为:
             * 调用方拼错一个名字,画面上却照常出现某种形状,他会以为是自己别的地方写错了。
             */
            set(value) {
                if (!value) { forced = null; wake(); return true; }
                const e = INTENT[value];
                if (!e) return false;
                forced = e;
                wake();
                return true;
            },

            // 宿主自己的「等一等」:收成一颗球,球留着
            setWaiting(v) { waiting = !!v; wake(); },

            // 动态改了元素的样式之后叫一声,让它重新读一次
            refresh(el) {
                if (el) {
                    const rec = cache.get(el);
                    if (rec) { showEl(el, rec); cache.delete(el); }
                    return;
                }
                for (const [node, rec] of cache) showEl(node, rec);
                cache.clear();
            },

            destroy() {
                if (dead) return;
                dead = true;
                running = false;
                cancelAnimationFrame(raf);
                bind(false);
                for (const [node, rec] of cache) showEl(node, rec);
                cache.clear();
                fx.destroy();
                host.remove();
                root.classList.remove(HIDE_CLASS);
                // 明着 destroy 就是「不要了」,不留位置给下一份
                resume = { x: -9999, y: -9999, on: false };
            },

            _debug: () => ({
                x, y, inside, want: want ? want.name : "", state: state ? state.name : "",
                q, out: out ? out.name : "", qOut, press, pressing,
                hoverValue, handover, hover: hoverEntry ? hoverEntry.name : "",
                hiddenCount: countHidden(), reduceMotion, dead,
                balls: lastBalls,
            }),
        };

        return inst;
    }

    // ===== 对外 =====
    let inst = null;
    // 最后一次指针在哪、亮着没有。只为了「重建之后别看丢」这一件事
    let resume = { x: -9999, y: -9999, on: false };

    const api = {
        VERSION: "1.0.0",
        DEFAULTS, INTENT, PRESS, MAP, REAL_CURSORS, BALL_D, EPS, OUT_DROP_Q,
        HIDE_CLASS,

        /*
         * 起一份新的实例(改配置走这里:整只重建)。
         *
         * 底下的 destroy 会把位置清掉 —— 那是给「明着 destroy」用的语义,不是这里要的。
         * 所以先把它抄出来再放回去:这是**换一只**,不是**关掉**,指针没动,球不该动。
         */
        init(opts) {
            if (inst) {
                const keep = resume;
                inst.destroy();
                resume = keep;
            }
            inst = create(opts);
            return inst;
        },
        destroy() {
            if (inst) { inst.destroy(); inst = null; }
        },
        instance() { return inst; },
        // 手动起步:把自动那个开关关掉、DOM 也备好了的时候,自己叫一声
        boot() { if (!inst) inst = create(); return inst; },
    };

    if (typeof window !== "undefined") window.CursorEmbed = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;

    /*
     * ── 自动起步 ──
     *
     * 买家只写一个 <script>,不该还要再写一行 JS 才看得到东西 —— 所以默认自己起。
     * 三种情况不起:
     *
     *   · <script src="cursor-embed.js" data-manual></script>  —— 我要自己接管
     *   · window.CursorEmbedManual = true(写在脚本**之前**的那段内联 JS 里)
     *   · 这台设备的主指针不是「能悬停的精细指针」—— 触屏上没有系统光标可藏,
     *     手指底下也永远没有「指针划到某块元素上」这件事,接上去只是白占一层 DOM。
     *     (这就是「触摸设备不启用」那条在库里的样子。)
     *
     * data-manual 必须在**脚本求值的那一刻**读:等到 DOMContentLoaded 再读,
     * document.currentScript 已经是 null 了,那时候「是哪个 script 起的我」谁也答不上来。
     */
    function shouldAutoBoot() {
        if (typeof window === "undefined" || typeof document === "undefined") return false;
        if (window.CursorEmbedManual) return false;
        if (typeof matchMedia === "function"
            && !matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
        const cs = document.currentScript;
        if (cs && cs.getAttribute && cs.getAttribute("data-manual") !== null) return false;
        return true;
    }

    if (shouldAutoBoot()) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => api.boot(), { once: true });
        } else {
            api.boot();
        }
    }
})();
