/**
 * 黑球光标：直接替换鼠标指针，三个外观共用。
 *
 * 位置不做弹簧跟随 —— pointermove 里直接写 transform，光标在哪球就在哪。
 * 只有「按下时的缩放」在 rAF 里做过渡，那是形变，不是跟随。
 *
 * 减弱动效（prefers-reduced-motion）下**只剩位置跟随**：缩放系数归零、rAF 整条不跑，
 * 于是这个文件变成纯事件驱动的 —— 没有一帧是为动画跑的。按下的反馈还在，
 * 但换成了「阴影收紧」那一下瞬时切换（各外观的 style.css 里本来就有），
 * 那不是动效，是换了个样子。同一个开关 hover.js / loading.js 也读，
 * 而且和这里一样只在初始化时读一次（见 cursor-states.md 那一行的已知界限）。
 *
 * 除了画球，这里还是**指针位置的唯一来源**：同时把状态发布到 window.cursorState，
 * 别的效果（加载态的液体光标）读它就行，不用再挂一份 pointermove 自己跟一遍。
 * 两个人各跟一遍，迟早会有一个慢半帧，看上去就是两层光标在打架。
 *
 * 还管着**什么时候把系统光标还回去**：脚本抛错就整台主题退场（handBack），
 * 因为这套东西顶替的是指针本身，坏掉的代价不是「样式难看」而是「没有鼠标」。
 */
window.initBallCursor = function initBallCursor() {
    const root = document.documentElement;
    const ball = document.getElementById("latex-ball");
    if (!ball) return function () {};

    // 和 hover.js / loading.js 里那份一模一样的读法，故意抄一遍：这三个文件谁都不依赖谁，
    // 读法要是不一样（比如这里读成 addEventListener 的实时值），减不动效就会半路分叉
    // ——液体不分裂了、球还在缩，比两边都做还难查。
    const reduceMotion = typeof matchMedia === "function"
        && matchMedia("(prefers-reduced-motion: reduce)").matches;

    let x = -9999;
    let y = -9999;
    let hasPointer = false;
    let press = 0;
    let targetPress = 0;
    let raf = 0;
    let last = performance.now();

    // 对外的共享状态。press 是滤波之后的值，targetPress 是目标的——加载态用前者的瞬时值。
    // pressScale 也放进来：接力的那一层（cursor-fx 的 createLayer）必须用**同一个系数**，
    // 否则按下时交回球的那一帧会跳一下。
    //
    // 0 是个有意义的值（减弱动效），读它的地方不能写成 `|| 0.14` —— 那样恰恰会把
    // 唯一一个该关掉的场景又打开。createLayer 那边就踩过这一脚。
    const shared = {
        x,
        y,
        press: 0,
        targetPress: 0,
        visible: false,
        pressScale: reduceMotion ? 0 : 0.14,
    };
    window.cursorState = shared;

    // 已经交还过系统光标了（见下面的 handBack）。也可能是**这个文件还没跑之前**
    // 就交还过 —— 别的模块先出错，根上已经挂上了 cursor-off，那就别再接手。
    let dead = root.classList.contains("cursor-off");
    let handBackReason = dead ? "before-init" : "";

    function place() {
        if (dead) return;
        const s = (1 - press * shared.pressScale).toFixed(3);
        ball.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    }

    function onMove(e) {
        if (dead) return;
        const t = e.touches ? e.touches[0] : e;
        if (!t) return;
        x = t.clientX;
        y = t.clientY;
        hasPointer = true;
        root.classList.add("has-pointer");
        ball.style.opacity = "1";
        shared.x = x;
        shared.y = y;
        shared.visible = true;
        place();
    }

    function onDown(e) {
        if (dead) return;
        targetPress = 1;
        shared.targetPress = 1;
        root.classList.add("is-pressing", "has-pointer");
        const t = e.touches ? e.touches[0] : e;
        if (t) {
            x = t.clientX;
            y = t.clientY;
            hasPointer = true;
            ball.style.opacity = "1";
            shared.x = x;
            shared.y = y;
            shared.visible = true;
            place();
        }
    }

    function onUp() {
        if (dead) return;
        targetPress = 0;
        shared.targetPress = 0;
        root.classList.remove("is-pressing");
    }

    function onLeave() {
        if (dead) return;
        hasPointer = false;
        targetPress = 0;
        root.classList.remove("has-pointer", "is-pressing");
        ball.style.opacity = "0";
        shared.visible = false;
        shared.targetPress = 0;
    }

    /*
     * 已经交还过了就别再挂监听 —— 那几个处理器进门第一句都是 `if (dead) return`，
     * 挂上也确实什么都不做，但那是四条常年空转的监听。更糟的是它会让人以为
     * 「这套东西还在跑」：排查的时候看到 pointermove 上挂着东西，就得读一遍才知道
     * 是死的。不接手的模块不该在事件上留下痕迹。
     */
    if (!dead) {
        document.addEventListener("pointermove", onMove, { passive: true, capture: true });
        document.addEventListener("pointerdown", onDown, { passive: true, capture: true });
        document.addEventListener("pointerup", onUp, { passive: true, capture: true });
        document.addEventListener("pointercancel", onUp, { passive: true, capture: true });
        document.documentElement.addEventListener("pointerleave", onLeave);
    }

    function tick(now) {
        if (dead) { raf = 0; return; }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const next = press + (targetPress - press) * (1 - Math.exp(-14 * dt));
        if (Math.abs(next - press) > 0.0005) {
            press = next;
            shared.press = press;
            place();
        }
        raf = requestAnimationFrame(tick);
    }
    // 减弱动效下这条循环整个不跑：位置在 onMove 里就写完了，press 恒为 0，
    // 没有任何一帧是被需要的。留着空转的话，一个「不动画」的模式还在每帧醒一次。
    if (!reduceMotion && !dead) raf = requestAnimationFrame(tick);

    function destroyBall() {
        cancelAnimationFrame(raf);
        raf = 0;
        if (window.cursorState === shared) delete window.cursorState;
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerdown", onDown, true);
        document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("pointercancel", onUp, true);
        document.documentElement.removeEventListener("pointerleave", onLeave);
    }

    /*
     * ===== 把系统光标还回去 =====
     *
     * 这套主题是**顶替**系统指针的：`html.has-pointer *` 把 cursor 全压成 none，
     * 位置全靠这颗球。所以它自己一旦坏掉，用户失去的不是「一个好看的样式」，
     * 是**指针本身** —— 看不见、也点不准。装饰可以少一个，指针不能少。
     *
     * 触发条件是「脚本抛错」。宽严的分寸在这里：
     *
     *   - 只认**脚本**自己的错。资源加载失败（图片 404、视频、iframe）也会以 error
     *     事件报到 window，可那是页面里天天发生的事，而且站上的图片本来就有
     *     「挂了就换一张」的兜底 —— 拿它把光标主题关掉，等于「网不好的时候鼠标就没样式了」。
     *     实测的判据：脚本错误是 ErrorEvent（有 message），资源错误没有；
     *     脚本错误的 target 是 window，资源错误的 target 是那个元素。两条都要过。
     *   - 认出来就**一次还到底，不回头**。出了错之后这套主题处在什么状态已经说不清了，
     *     让它半路自己回来只会变成更难看的样子（球回来了、位置是错的）。
     *     想看效果刷新一下页面就有了。
     *
     * 交还分两半，缺一不可：
     *
     *   JS 这一半（这里）—— 停掉三个模块的循环、摘掉类、藏起球、把监听全拆掉。
     *   CSS 那一半（skin-ui.css 末尾那条 `html.cursor-off`）—— **谁都没跑成**时的保险。
     *
     * 为什么光有 JS 这一半不够：它本身也在「这套代码」里。error 监听要等
     * initBallCursor() 被叫到才装上（skin.js 的 initSiteSkin 里那一行），而这中间
     * 任何一步抛错，装监听这件事自己就轮不到了；真到那一步，root 上可能已经挂着
     * has-pointer，却没有任何人负责摘掉它。CSS 那条不依赖任何一段 JS 跑对 ——
     * 只要根上有 cursor-off，藏光标那几条规则整片失效。
     *
     * 所以这一半要能被**外面**挂上：宿主自己知道该关的时候直接加 cursor-off 就行，
     * 不必先跟这套主题说上话（见 cursor-beyond-browser 那条）。
     */
    function handBack(reason) {
        if (dead) return false;
        dead = true;
        handBackReason = reason || "manual";
        // 先让另外两个模块自己停（各自会摘掉自己挂的类、拆掉自己的图层）
        try { if (window.LoadingWatch && window.LoadingWatch.handBack) window.LoadingWatch.handBack(); } catch (e) {}
        try { if (window.HoverWatch && window.HoverWatch.handBack) window.HoverWatch.handBack(); } catch (e) {}
        root.classList.remove("has-pointer", "is-pressing", "is-loading", "is-hover-state", "show-real-cursor");
        if (root.style && root.style.removeProperty) root.style.removeProperty("--real-cursor");
        // 这一条是给 CSS 看的：它一挂上，藏光标那几条规则就整片失效
        root.classList.add("cursor-off");
        shared.press = 0;
        shared.targetPress = 0;
        shared.visible = false;
        ball.style.opacity = "0";
        destroyBall();
        return true;
    }

    /*
     * 监听错误本身也要小心：这个处理器自己再抛一次，就没人兜了。
     * 所以两个回调都短，绝不读可能不存在的东西。
     */
    function onError(e) {
        // 资源加载失败（"error" 事件的 target 是 <img>/<video>/<script> 本身，
        // 而且没有 message）不算 —— 见上面 handBack 那段
        if (!e || !e.message) return;
        if (e.target && e.target !== window) return;
        handBack("error");
    }
    function onRejection() {
        handBack("rejection");
    }
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);

    /*
     * 报出去给宿主和校验脚本用。名字跟 LoadingWatch / HoverWatch 一致。
     * handBack() 同时也是**宿主的口子**：主题跑到浏览器之外去的时候（见
     * cursor-beyond-browser 那条），宿主自己知道什么时候该把它关掉，不该等它出错。
     */
    window.BallWatch = {
        handBack: (reason) => handBack(reason || "host"),
        _debug: () => ({
            dead,
            reason: handBackReason,
            reduceMotion,
            pressScale: shared.pressScale,
            press,
            visible: shared.visible,
            raf,
        }),
    };

    return destroyBall;
};
