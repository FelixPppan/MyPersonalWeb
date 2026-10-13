/*
 * 采样 cursor-fx.js 的 sampleLiquid。
 *
 * 直接 require 站点里的那个文件,校验的就是真实实现本身。
 * 输出两份:frames 是密集均匀采样(只做几何连续性分析),
 * shots 是人工挑出来的关键帧(只用于渲染看图)。
 *
 * 阶段表和起点一律问引擎要(fx.PHASES / fx.PHASE_START),不在这边再抄一份 ——
 * 两边各写一份时间轴,改了一处忘了另一处,这种坑不踩第二次。
 */
const path = require("path");
// 不给参数时按脚本自身的位置回到站点根目录,从哪跑都一样
const target = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "../../cursor-fx.js");
const fx = require(target);

const TOTAL = fx.TOTAL_MS;
const R0 = fx.CFG.R0;

// ---- 密集采样:只做分析 ----
const N = 600;
const frames = [];
for (let i = 0; i < N; i++) {
    const t = (TOTAL * i) / N;
    const s = fx.sampleLiquid(t);
    frames.push({ t, phase: s.phase, p: s.p, balls: s.balls });
}

// ---- 关键帧:只用于渲染 ----
const shots = [];
function shot(t) {
    const s = fx.sampleLiquid(t);
    shots.push({ t, phase: s.phase, p: s.p, balls: s.balls });
}

// 每个阶段取哪几个进度点(用不着逐段都密采)。
// 分裂段前半个进程里芽还没长过「画得出来」的阈值,取那么早只是白占格子,
// 所以从上一次那套(0.12/0.3/0.5)改成从能看见的 0.55 起取。
const DENSITY = {
    rest: [0],
    split1: [0.3, 0.55, 0.7, 0.85, 0.95, 1],
    spin1: [0, 0.25, 0.5, 0.75, 1],
    split2: [0.3, 0.55, 0.7, 0.85, 1],
    join: [0.15, 0.35, 0.55, 0.75, 1],
    orbit: [0.15, 0.4, 0.65, 0.9],
    merge: [0.2, 0.45, 0.7, 0.9, 1],
    settle: [0.15, 0.35, 0.55, 0.75, 1],
};
const start = {};
for (const [name, dur] of fx.PHASES) {
    start[name] = { t: fx.PHASE_START[name], dur };
    for (const p of DENSITY[name] || [0, 0.5, 1]) {
        shot(start[name].t + dur * p);
    }
}

// ---- 几何连续性 ----
/*
 * 只统计「看得见的球」。球的半径是随时间从 0 长起来的,出生那一瞬间它只是一个
 * 数学上的点,摆在母球表面的哪儿都行 —— 位置记在哪不影响画面。把它算进来,
 * 会得到一个 13px 的假跳变,而屏幕上什么都没动(轮廓半径一直是 13)。
 * 判据取两帧里只要有一帧可见就算数,免得真跳变被漏掉。
 */
const VISIBLE = 0.01;
let maxJump = 0, maxJumpAt = 0;
for (let i = 1; i < frames.length; i++) {
    for (let b = 0; b < 3; b++) {
        const a = frames[i - 1].balls[b], c = frames[i].balls[b];
        if (Math.max(a.scale, c.scale) < VISIBLE) continue;
        const j = Math.hypot(c.x - a.x, c.y - a.y) + Math.abs(c.scale - a.scale) * R0;
        if (j > maxJump) { maxJump = j; maxJumpAt = frames[i].t; }
    }
}

// 每帧的峰值速度换算成 px/s,用来判断「快」是不是「断」
const dt = TOTAL / N / 1000;
const peakSpeed = maxJump / dt;

// ---- 关键状态断言 ----
function at(name, p) {
    return fx.sampleLiquid(start[name].t + start[name].dur * p);
}
const RING_D = fx.RING_D;
const split1End = at("split1", 1);
const split2End = at("split2", 1);
const joinEnd = at("join", 1);
const orbitMid = at("orbit", 0.5);
const mergeStart = at("merge", 0);
const mergeEnd = at("merge", 1);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angOf = (b) => Math.atan2(b.y, b.x);
// 两个方位角的差,规范到 [0,360)
const angDiff = (a, b) => (((a - b) * 180) / Math.PI % 360 + 360) % 360;
// 球相对于环心的方位角(环心在 (0, RING_D)),三球的等分关系从这里量
const ringAng = (b) => angOf({ x: b.x, y: b.y - RING_D });
const ringDist = (b) => Math.hypot(b.x, b.y - RING_D);

/*
 * 环心必须在球的**下方** —— 用户明确要求「旋转中心在第一个球下方」。
 * 顺带验一下三球确实都在以它为心、半径 RING_D 的圆上(而不是各转各的)。
 */
const ringCentre = {
    y: RING_D,
    belowBall: RING_D > 0,
    radiusError: Math.max(...joinEnd.balls.map((b) => Math.abs(ringDist(b) - RING_D))),
    // 母球静止时正好坐在环顶:它到环心的距离就该是 RING_D
    parentOnRing: +ringDist(split1End.balls[0]).toFixed(4),
};

/*
 * 「母球不动」—— 这一版的核心要求。从开场到 ring 撑齐之前(Δ<240°),
 * 母球坐标必须严格是 (0,0);orbit 一开始它才走。
 */
let stillDrift = 0;
{
    const steps = 400;
    const t1 = start.orbit.t;
    for (let i = 0; i <= steps; i++) {
        const b = fx.sampleLiquid((t1 * i) / steps).balls[0];
        stillDrift = Math.max(stillDrift, Math.hypot(b.x, b.y));
    }
}

/*
 * 第二个球绕的是**环心**,不是母球 —— 这是用户点名的那个 bug。
 * 「绕母球转」和「绕环心转」在数据上的区别:前者到原点的距离会变,
 * 后者到 (0, RING_D) 的距离恒定。所以直接量半径的抖动。
 */
let parentOrbitErr = 0;
{
    const steps = 400;
    for (let i = 0; i <= steps; i++) {
        const t = start.spin1.t + (start.spin1.dur * i) / steps;
        parentOrbitErr = Math.max(parentOrbitErr, Math.abs(ringDist(fx.sampleLiquid(t).balls[1]) - RING_D));
    }
}

/*
 * 转了多少度:把方位角解开缠绕就知道了。「第二个球转、母球不动」只有这里能验。
 */
function sweepOf(idx, name, steps) {
    let prev = null, unwrapped = 0, backSteps = 0;
    const n = steps || 240;
    for (let i = 0; i <= n; i++) {
        const t = start[name].t + (start[name].dur * i) / n;
        const b = fx.sampleLiquid(t).balls[idx];
        if (b.scale < 1e-6) continue;
        const a = ringAng(b);
        if (prev !== null) {
            let d = a - prev;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            if (d < -1e-9) backSteps++;
            unwrapped += d;
        }
        prev = a;
    }
    return { deg: +Math.abs((unwrapped * 180) / Math.PI).toFixed(2), backSteps };
}
const spin1Sweep = sweepOf(1, "spin1");
const split2Sweep = sweepOf(2, "split2");

// 整段旋转窗口里第二个球一共转了多少度(应当等于 TOTAL_DEG)
let totalSweepB = 0;
{
    let prev = null;
    const steps = 900;
    for (let i = 0; i <= steps; i++) {
        const t = (start.orbit.t + start.orbit.dur - 1) * i / steps;
        const b = fx.sampleLiquid(t).balls[1];
        const a = ringAng(b);
        if (prev !== null) {
            let d = a - prev;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            totalSweepB += d;
        }
        prev = a;
    }
    totalSweepB = +Math.abs((totalSweepB * 180) / Math.PI).toFixed(2);
}

/*
 * 三个里程碑 —— 用户的节奏要求全在这三个数里:
 *   LAND_DEG:第二个球长到最终大小、脱离母球表面的那一刻
 *   120:第三个球出生的那一刻(= 第二个球走到 1/3 圈)
 *   240:母球起步的那一刻(= 第三个球走到 1/3 圈)
 * 出生这里用「份额从 0 变正」判定,不看到场时间 —— 那才是「分出来」的本义。
 */
function birthDeg(idx) {
    const steps = 2000;
    for (let i = 1; i <= steps; i++) {
        const t = (start.orbit.t * i) / steps;
        if (fx.sampleLiquid(t).balls[idx].scale > 1e-6) {
            return +fx.spinDeg(t).toFixed(3);
        }
    }
    return null;
}
/*
 * 母球起步的角度。不能用「份额变正」判 —— 它一开始就在场(份额 1),
 * 要判的是它**第一次离开原地**。
 */
function startDeg(idx) {
    const steps = 4000;
    // 采样要越过 orbit 的起点 —— 母球恰好**在**那一刻起步,只采到起点为止会一个都取不到
    const span = start.orbit.t + start.orbit.dur * 0.02;
    for (let i = 1; i <= steps; i++) {
        const t = (span * i) / steps;
        const b = fx.sampleLiquid(t).balls[idx];
        if (Math.hypot(b.x, b.y) > 1e-6) return +fx.spinDeg(t).toFixed(3);
    }
    return null;
}
const milestones = {
    landDeg: +fx.LAND_DEG.toFixed(2),
    cBirthDeg: birthDeg(2),
    aStartDeg: startDeg(0),
    // 出生瞬间新生球离母球多远(应当为 0:新球就长在母球身上)
    cBirthOffset: (() => {
        const steps = 4000;
        for (let i = 1; i <= steps; i++) {
            const t = (start.orbit.t * i) / steps;
            const s = fx.sampleLiquid(t);
            if (s.balls[2].scale > 1e-6) return +dist(s.balls[0], s.balls[2]).toFixed(3);
        }
        return null;
    })(),
};

/*
 * 分出去的两个球「脱离母球表面」的那个角,必须就是 LAND_DEG ——
 * 也就是说:新球一离开母球,两者正好相切(圆心距 = 半径和)。
 * 比这早,两个圆还重叠;比这晚,中间会空出一条缝(看着像已经断了)。
 */
function tangencyDeg(idx, bornAt) {
    const steps = 4000;
    let lastOverlap = null;
    for (let i = 1; i <= steps; i++) {
        const t = (start.orbit.t * i) / steps;
        const s = fx.sampleLiquid(t);
        if (s.balls[idx].scale < 1e-6) continue;
        const d = dist(s.balls[0], s.balls[idx]);
        const rs = (s.balls[0].scale + s.balls[idx].scale) * R0;
        if (d < rs) lastOverlap = fx.spinDeg(t);
        else if (lastOverlap !== null) return +fx.spinDeg(t).toFixed(2);
    }
    return null;
}
const separation = {
    b: tangencyDeg(1),
    c: tangencyDeg(2),
};

// 环上三球是不是均分 120°,而且正好在 join 走完时才均分
const ringGaps = [
    +angDiff(ringAng(joinEnd.balls[1]), ringAng(joinEnd.balls[2])).toFixed(3),
    +angDiff(ringAng(joinEnd.balls[0]), ringAng(joinEnd.balls[1])).toFixed(3),
    +angDiff(ringAng(joinEnd.balls[2]), ringAng(joinEnd.balls[0])).toFixed(3),
];
// orbit 期间三球是否始终 120° 等分(撑齐之后就锁死了)
let ringHolds = true;
{
    for (let i = 0; i <= 200; i++) {
        const s = fx.sampleLiquid(start.orbit.t + (start.orbit.dur * i) / 200);
        const g = [
            angDiff(ringAng(s.balls[1]), ringAng(s.balls[2])),
            angDiff(ringAng(s.balls[0]), ringAng(s.balls[1])),
            angDiff(ringAng(s.balls[2]), ringAng(s.balls[0])),
        ];
        if (g.some((v) => Math.abs(v - 120) > 0.5)) ringHolds = false;
    }
}

/*
 * 份额 → 半径的分配:第二个球离开母球时就已经是最终大小(√(1/3)),
 * 而母球缩到 √(2/3) —— 比最终大小大。「第二个球是最终大小、第一个球更大」
 * 是用户的原话,在这里量。
 */
const shareAtLand = split1End.balls.map((b) => +b.scale.toFixed(4));

/*
 * 合并:三球按面积守恒反解半径,结束时精确并回 (0,0) 上的一颗整球。
 */
let mergeCentreErr = 0;
for (const b of mergeEnd.balls) mergeCentreErr = Math.max(mergeCentreErr, Math.hypot(b.x, b.y));

const report = {
    total: TOTAL,
    r0: R0,
    totDeg: fx.TOTAL_DEG,
    cfg: fx.CFG,
    phases: fx.PHASES,
    maxJumpPx: maxJump,
    maxJumpAt,
    peakSpeed,
    frameDtMs: dt * 1000,
    ringCentre,
    parentStill: {
        maxDriftPx: +stillDrift.toFixed(6),
        untilMs: start.orbit.t,
    },
    orbitsParent: {
        maxRadiusErrPx: +parentOrbitErr.toFixed(4),
        targetPx: RING_D,
    },
    spin: {
        spin1SweepDeg: spin1Sweep.deg,
        split2SweepDeg: split2Sweep.deg,
        totalSweepDeg: totalSweepB,
        monotonic: spin1Sweep.backSteps === 0 && split2Sweep.backSteps === 0,
        milestoneDegs: milestones,
        separationDeg: separation,
    },
    splits: {
        // 新生球出生时离母球多远(应当几乎为 0)
        cBirthOffset: milestones.cBirthOffset,
        // LAND 那一刻三球各自的缩放
        shareAtLand,
        // LAND 那一刻 母球/第二球 的圆心距(应当等于两者半径和)
        landDistPx: +dist(split1End.balls[0], split1End.balls[1]).toFixed(3),
        landRadiusSumPx: +((split1End.balls[0].scale + split1End.balls[1].scale) * R0).toFixed(3),
        // split1 结束时第二球到环心的距离(应当 = RING_D)
        bRadiusAfterSplit: +ringDist(split1End.balls[1]).toFixed(3),
        // split1 结束时第二球相对环心的方位角(应当 = LAND_DEG)
        bAngleAfterSplit: +(((ringAng(split1End.balls[1]) * 180) / Math.PI + 90) % 360).toFixed(2),
        split2EndGapDeg: +angDiff(ringAng(split2End.balls[1]), ringAng(split2End.balls[2])).toFixed(2),
    },
    ring: {
        gapsDeg: ringGaps,
        holds: ringHolds,
        scales: joinEnd.balls.map((b) => +b.scale.toFixed(4)),
        radii: joinEnd.balls.map((b) => +ringDist(b).toFixed(3)),
        centroid: joinEnd.balls
            .reduce((a, b) => [a[0] + b.x / 3, a[1] + b.y / 3], [0, 0])
            .map((v) => +v.toFixed(4)),
        midGapsDeg: [
            +angDiff(ringAng(orbitMid.balls[1]), ringAng(orbitMid.balls[2])).toFixed(3),
            +angDiff(ringAng(orbitMid.balls[0]), ringAng(orbitMid.balls[1])).toFixed(3),
        ],
    },
    mergeStart: {
        scales: mergeStart.balls.map((b) => +b.scale.toFixed(4)),
        spread: +Math.max(...mergeStart.balls.map((b) => ringDist(b))).toFixed(3),
    },
    mergeEnd: {
        scales: mergeEnd.balls.map((b) => +b.scale.toFixed(4)),
        centreErrPx: +mergeCentreErr.toFixed(4),
    },
};

console.log(JSON.stringify({ report, frames, shots }, null, 1));
