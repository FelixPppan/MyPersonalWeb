/*
 * 采样 cursor-fx.js 的元素状态:可点击(sampleViscous)/ 不可点击(sampleBurst)/
 * 文本(sampleBeam,两颗球 + 中间一丝)/ 拖动缩放(sampleResize,一根线转到各自的
 * 轴上)/ 点击特效(sampleSplat,俯视看下去的一摊)/ 放大缩小(sampleZoom,中心小球
 * + 四周那圈)。
 *
 * 和 dump_frames.js 分开写:那边是液体分裂那一套(固定三个球、有阶段表、要验
 * 里程碑角度),这边是元素状态(球数不定、时间轴只有「化开 → 待着 → 收回去」)。
 * 硬塞进一个脚本,两边的判据会互相碍事。渲染仍然是同一套 —— render_states.py
 * 直接 import render_frames 的 goo_mask,所以两个校验脚本画出来的东西一定一致。
 *
 * q 的推法和真站点完全一样(一阶滤波,τ 从引擎 CFG 读),不是另写一条缓动 ——
 * 否则「校验的是真实现」这句话就不成立了。
 *
 * 输出 {report, shots} 的格式和 dump_frames.js 对齐,好让校验脚本读同一套字段。
 */
const path = require("path");
const target = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "../../cursor-fx.js");
const fx = require(target);

const CFG = fx.CFG;
const R0 = CFG.R0;
const DT = 1000 / 60;

// 演一遍:化开 → 待着 → 收回去。
const ENTER_MS = 260;
const EXIT_MS = 520;

/*
 * 「有哪些元素状态、各自演多久、看哪几帧」只列在这里一次。
 *
 * 以前采样和 q=0 边界检查是两个分开的循环,各自把状态名列了一遍 —— 加状态时
 * 只改了其中一处,就会静默地少验一半(采样验了,边界条件没验,退出码照样是 0)。
 * 名字、采样函数、停留时长、抽哪几帧,这几件事天生绑在一起,就该写在一起。
 *
 * 停留时长按状态定:不可点击要够长才看得到「被推出去又被拽回来」那口气;
 * 可点击和文本都是在慢慢蠕动(频率最低的那个只有 0.13Hz,一个来回七秒多),
 * 给短了就看不出它在动。
 */
const STATES = [
    {
        name: "viscous",
        draw: fx.sampleViscous,
        hold: 1600,
        shots: [40, 110, 200, 260, 500, 900, 1300, 1700, 1820, 1960, 2130, 2360],
    },
    {
        name: "burst",
        draw: fx.sampleBurst,
        hold: 2600,
        shots: [40, 110, 200, 260, 500, 1000, 1500, 2000, 2400, 2700, 2900, 3200],
    },
    {
        name: "beam",
        draw: fx.sampleBeam,
        hold: 2200,
        /*
         * 文本这一格的面积不守 πR0²(它带走的材料随 q 变,和下面线那一族同理),
         * 所以校验脚本光知道 q 还不够,得知道**这一帧该有多少材料**。曲线从引擎里要,
         * 不在这里重写 —— 那就成了第三份公式。
         *
         * 它和下面两根线**不再是同一条曲线**了(2026-09-18 拆的):文本是
         * textMass(TEXT_MASS 0.689),线是 lineMass(LINE_MASS 0.50)。
         */
        mass: fx.textMass,
        // 「化开」那 260ms 里形状变得最快:一颗 R0 的球要**裂成两颗**(每颗半径从 13
        // 收到 7、同时沿轴拉开到心距 24),中间还得把那 15 团丝挤出来。参数调坏了
        // (两球没拉开、丝没连上、腰细到被 goo 糊断)最先在这几帧露出马脚
        shots: [40, 110, 200, 260, 500, 900, 1300, 1700, 2100, 2400, 2700, 2960],
    },
    /*
     * 拖动缩放。这**两根之间**是同一次挤压、同一份材料,只是转到了各自的轴上 ——
     * 所以材料曲线、停留时长、连抽帧的时刻一个字都不改。
     *
     * ⚠️ 上面文本那一格**不再**属于这一族了(2026-09-18):它现在是「两颗球 +
     * 中间一丝」,连材料曲线都换成了 textMass。所以下面这两行的 mass 跟它不同,
     * 这不是抄漏了。渲染那边的判据也分了家 —— 有 deg 的按「线」验,文本按
     * 「剖面两头粗中间细」验。
     *
     * 抽三根:0° 和 90° 是两根光轴(横的、竖的),45° 是**两端都沾**的 ——
     * 横竖互换那一套在 45° 彻底失效(旋转 45° 出来的外接矩形几乎是正方形),
     * 只有真的按角度转着量才验得出来。所以 45° 这一格是判据的照妖镜:
     * 采样函数哪天退化成「只认 0/90 两根轴」,那两格照样绿,这格立刻报。
     *
     * 90° 那一格是 2026-09-18 补的。在那之前这一格**没有**:竖的那根线借的是
     * 「文本」那一格(文本那时就是这条竖线转 90°),而 45° 那格是照妖镜,两头就够了。
     * 文本换成两颗球之后竖线在光栅上彻底没了出处 —— 而 ns-resize / row-resize 这一族
     * 是窗口上下边最常用的一档,展示页和对照图上都不该缺席,所以补一格。
     * (几何上的「任意角度 = 竖线转过去」一直由 test_hover 第 16 节按 90° 验着,
     * 光栅这边多这一格是补「goo 之后还转得开」那一半,不是补几何。)
     */
    {
        name: "resize0",
        draw: (te, q) => fx.sampleResize(te, q, 0),
        hold: 2200,
        mass: fx.lineMass,
        shots: [40, 110, 200, 260, 500, 900, 1300, 1700, 2100, 2400, 2700, 2960],
    },
    {
        name: "resize90",
        draw: (te, q) => fx.sampleResize(te, q, 90),
        hold: 2200,
        mass: fx.lineMass,
        shots: [40, 110, 200, 260, 500, 900, 1300, 1700, 2100, 2400, 2700, 2960],
    },
    {
        name: "resize45",
        draw: (te, q) => fx.sampleResize(te, q, 45),
        hold: 2200,
        mass: fx.lineMass,
        shots: [40, 110, 200, 260, 500, 900, 1300, 1700, 2100, 2400, 2700, 2960],
    },
    /*
     * 点击特效。这一格的 q 不走上面那对时间常数 —— 按下和松手本来就是另一套
     * (PRESS_IN_TAU 45 / PRESS_OUT_TAU 35),所以这里显式把引擎里那两个数带出来,
     * 不在这边重写:推 q 的曲线只有一条,改了就两边一起改。
     *
     * 停留给 1600ms:用户的口径是「按住一直摊着,松手聚拢」,所以「摊着」这一段
     * 必须够长才看得见它是不是真的**一直摊着**(边缘蠕动的频率最低那一档也要一个来回)。
     * 抽帧多给几发在开头那 200ms:这一摊变得最快的就在那儿。
     */
    {
        name: "splat",
        draw: fx.sampleSplat,
        hold: 1600,
        tauIn: CFG.PRESS_IN_TAU,
        tauOut: CFG.PRESS_OUT_TAU,
        // 这一摊是**唯一一个多带材料**的状态(俯视按下,一摊摊开本来就比原来那颗球
        // 占地方);会收材料的那些全是**少**带 —— 线那一族是 lineMass、
        // 文本是 textMass(见上面两格)。所以和它们一样得把材料曲线带出来,
        // 不在这里重写那条公式
        mass: fx.splatMass,
        shots: [20, 40, 70, 110, 160, 260, 400, 800, 1200, 1650, 1820, 1960],
    },
    /*
     * 放大缩小。两个方向是**同一个采样函数**,差别只在 mode —— 所以下面两格
     * 除了 mode 一个字都不该不一样(和 resize0 / resize45 同一个写法、同一个理由)。
     *
     * 这一格抽帧和别格不一样:它要看的不是「停稳之后长什么样」,而是**一直在动**。
     * 动的不是一个整体,是**九颗各走各的一生**:每一颗从母球身上长出来(半径 0)
     * → 飞到 ZOOM_D、半路最胖 → 在最外化掉 —— 九颗的相位错开(表见引擎 CFG),
     * 所以**任何一帧里天上都同时有刚出生的、飞到半路的、快化掉的**。
     *
     * 停留段那八发按**一整轮**铺开(一颗的一生 ZOOM_TRAVEL_MS = 1300ms):
     *   390 585 780 910 1040 1235 1300 1560
     * 相邻两发隔 150ms 上下 ≈ 一生的 11%,所以一列看下来既能看见「同一批滴又往前
     * 走了一截」,也能看见「换了一批」—— 但**真正的证据在每一发里面**:那一发里
     * 四到五颗液滴的圆心距散在 11~19px 上(第四、五节量的就是这件事),这就是
     * 「持续散射」和第一版那条「摆好就不动的一圈」的分水岭。
     *
     * 上一版(同相位)这里是「六颗一起出去、一起回来」,一格一格的差别只是那一圈
     * 的整体半径;再上一版(相位差跟方位绑在一起)是转着圈的喷头。三版都能在这张
     * 图上分出来:看**一发里面**那几颗散不散、以及**连着几发**看它们是不是朝一个
     * 方向挪。这两种看法都不需要新的格,看同一张图就行。
     *
     * 进场段那四发(40/110/200/260)看的是另一半:中心球一路收到 ZOOM_CORE、
     * 而九颗从贴着母球(半径 0,和母球并成一颗)开始长出来、往外让开。
     */
    {
        name: "zoomIn",
        draw: (te, q) => fx.sampleZoom(te, q, "in"),
        hold: 2200,
        shots: [40, 110, 200, 260, 390, 585, 780, 910, 1040, 1235, 1300, 1560],
    },
    {
        name: "zoomOut",
        draw: (te, q) => fx.sampleZoom(te, q, "out"),
        hold: 2200,
        shots: [40, 110, 200, 260, 390, 585, 780, 910, 1040, 1235, 1300, 1560],
    },
];

function run(state, fn) {
    const hold = state.hold;
    // 这一格用哪对时间常数。默认是元素状态那一对;点击特效有自己的(按得快、松得也快),
    // 所以按状态覆盖 —— 不在这里再写一份「按下用哪个数」的名单,那两个数还是从引擎读的。
    const tauIn = state.tauIn || CFG.STATE_IN_TAU;
    const tauOut = state.tauOut || CFG.STATE_OUT_TAU;
    const end = ENTER_MS + hold + EXIT_MS;
    const frames = [];
    let q = 0;
    for (let t = 0; t <= end; t += DT) {
        if (t > 0) {
            const want = t < ENTER_MS + hold ? 1 : 0;
            const tau = want ? tauIn : tauOut;
            q += (want - q) * (1 - Math.exp(-DT / tau));
        }
        const s = fn(t, q);
        // mass = 这一帧该是 πR0² 的多少倍(不随 q 变少的状态就是 1)
        const mass = state.mass ? state.mass(s.q) : 1;
        // deg 是「这根线朝哪儿」,由引擎报出来(dump 不重算)。渲染那边要拿它把
        // 光栅坐标转回线自己的坐标系里量 —— 45° 的线用轴对齐的框量,宽和高
        // 都是 26.5px 上下,和一颗球(26px)几乎分不出来
        frames.push({ t, q: s.q, phase: s.phase, p: s.p, s: s.s, mass, deg: s.deg, balls: s.balls });
    }
    return { frames, hold, end };
}

const states = {};
for (const st of STATES) states[st.name] = run(st, st.draw);

const shots = [];
for (const st of STATES) {
    const { frames } = states[st.name];
    for (const want of st.shots) {
        // 取最接近的目标时刻,免得 shots 和 frames 的采样格点错开
        let best = frames[0];
        for (const f of frames) {
            if (Math.abs(f.t - want) < Math.abs(best.t - want)) best = f;
        }
        shots.push({
            state: st.name, t: best.t, q: best.q, phase: best.phase, p: best.p,
            mass: best.mass, deg: best.deg, balls: best.balls,
        });
    }
}

// q=0 必须精确是一颗 R0 的球 —— 每个状态「收回去」的那一帧就是普通光标,
// 这条不成立的话,交回 #latex-ball 的时候会有一道缝。
const atRest = {};
for (const st of STATES) {
    const s = st.draw(1234.5, 0);
    atRest[st.name] = {
        n: s.balls.length,
        balls: s.balls,
        maxOffset: Math.max(...s.balls.map((b) => Math.hypot(b.x, b.y))),
        scales: s.balls.map((b) => +b.scale.toFixed(6)),
        s: s.s,
    };
}

const report = {
    r0: R0,
    cfg: CFG,
    dt: DT,
    enterMs: ENTER_MS,
    exitMs: EXIT_MS,
    holdMs: Object.fromEntries(STATES.map((s) => [s.name, s.hold])),
    target: Math.PI * R0 * R0,
    atRest,
};

console.log(JSON.stringify({ report, states, shots }, null, 1));
