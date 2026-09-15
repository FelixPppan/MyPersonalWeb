/**
 * 黑球光标：直接替换鼠标指针，三个外观共用。
 *
 * 位置不做弹簧跟随 —— pointermove 里直接写 transform，光标在哪球就在哪。
 * 只有「按下时的缩放」在 rAF 里做过渡，那是形变，不是跟随。
 */
window.initBallCursor = function initBallCursor() {
    const root = document.documentElement;
    const ball = document.getElementById("latex-ball");
    if (!ball) return function () {};

    let x = -9999;
    let y = -9999;
    let hasPointer = false;
    let press = 0;
    let targetPress = 0;
    let raf = 0;
    let last = performance.now();

    function place() {
        const s = (1 - press * 0.14).toFixed(3);
        ball.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    }

    function onMove(e) {
        const t = e.touches ? e.touches[0] : e;
        if (!t) return;
        x = t.clientX;
        y = t.clientY;
        hasPointer = true;
        root.classList.add("has-pointer");
        ball.style.opacity = "1";
        place();
    }

    function onDown(e) {
        targetPress = 1;
        root.classList.add("is-pressing", "has-pointer");
        const t = e.touches ? e.touches[0] : e;
        if (t) {
            x = t.clientX;
            y = t.clientY;
            hasPointer = true;
            ball.style.opacity = "1";
            place();
        }
    }

    function onUp() {
        targetPress = 0;
        root.classList.remove("is-pressing");
    }

    function onLeave() {
        hasPointer = false;
        targetPress = 0;
        root.classList.remove("has-pointer", "is-pressing");
        ball.style.opacity = "0";
    }

    document.addEventListener("pointermove", onMove, { passive: true, capture: true });
    document.addEventListener("pointerdown", onDown, { passive: true, capture: true });
    document.addEventListener("pointerup", onUp, { passive: true, capture: true });
    document.addEventListener("pointercancel", onUp, { passive: true, capture: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    function tick(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const next = press + (targetPress - press) * (1 - Math.exp(-14 * dt));
        if (Math.abs(next - press) > 0.0005) {
            press = next;
            place();
        }
        raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return function destroyBall() {
        cancelAnimationFrame(raf);
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerdown", onDown, true);
        document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("pointercancel", onUp, true);
        document.documentElement.removeEventListener("pointerleave", onLeave);
    };
};
