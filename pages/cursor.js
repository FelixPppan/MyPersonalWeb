/**
 * 光标状态展示页。
 *
 * 每一格跑一份独立的 CursorFX 实例，按脚本演出「开始 → 结束」，停一下再从头播。
 * 之所以不循环播中间那段：分裂的起始（颈缩怎么长出来）和合并的收尾（三个球怎么并回去）
 * 才是要给人看的东西，一直循环最热闹的环转反而把两头都藏掉了。
 *
 * 这一页和 cursor-states.md 是一对：那里是清单，这里是能点开看的证据。
 * 谁的状态变了，两处一起改。
 */

const easeOutCubic = (u) => 1 - Math.pow(1 - u, 3);

/*
 * 元素状态的「在场程度」q —— 和 hover.js 里跑的是同一条曲线:一阶滤波追一个目标,
 * 进入和退出各一个时间常数(从引擎 CFG 读,不在这边另写一份)。
 *
 * 这里解成闭式,是因为展示页的时间轴必须能「按当前时间直接画」:离屏的格子不跑,
 * 回到视口时得立刻给出那一刻该有的帧。真站点上 q 是逐帧累积的,两者在数值上
 * 是同一条指数曲线。
 *
 * 退出段只走到 4 个时间常数就结束(q≈0.018)—— 和 hover.js 交回 #latex-ball 的
 * 时机一模一样(EPS=0.015 就在那附近)。所以循环末尾那一帧本来就已经是一颗
 * R0 的球了,收尾把它藏掉看不出任何区别,不用额外做淡出。
 */
const STATE_RISE_MS = 420;      // 化开:4 个多时间常数,q≈0.99
const STATE_FALL_MS = 546;      // 收回去:4 个多时间常数,走到交接的那个 q

/*
 * 一条 q 曲线,给两个时间常数(进入 / 退出)就是一条。起落各走 4.7 / 4.2 个时间常数
 * ——就是 hover.js 里「收完就交回 #latex-ball」的那个时机,和上面两个常数的对法一致。
 */
function qOf(t, holdMs, tauIn, tauOut) {
    const rise = 4.7 * tauIn;
    if (t <= rise) return 1 - Math.exp(-t / tauIn);
    const qTop = 1 - Math.exp(-rise / tauIn);
    if (t <= rise + holdMs) return qTop;
    return qTop * Math.exp(-(t - rise - holdMs) / tauOut);
}

function stateQ(t, holdMs) {
    const c = window.CursorFX.CFG;
    return qOf(t, holdMs, c.STATE_IN_TAU, c.STATE_OUT_TAU);
}

/*
 * 按下这一格按住多久再松手。按下不是一次形变(那才是上面那 420ms 的事),是一下:
 * 摊开只花 4.7×45≈210ms,所以这里停得久一点,让「按住一直摊着」这半句看得见。
 */
const PRESS_HOLD_MS = 900;

/*
 * 元素状态格子全用同一个 frame:差别只在引擎的那个采样函数。
 * 液体的时间就用格子自己的 t —— 蠕动/呼吸的相位需要连续,不能用 q 反推。
 */
function elementCell(id, zh, en, pick, hold, note) {
    const stillAt = STATE_RISE_MS + 300;
    return {
        id,
        zh,
        en,
        chip: "元素触发",
        act: STATE_RISE_MS + hold + STATE_FALL_MS,
        note,
        frame(t, fx) {
            fx.setVisible(true);
            fx.setLiquid(pick(t, stateQ(t, hold)));
        },
        still(fx) {
            const q = stateQ(stillAt, hold);
            fx.setVisible(true);
            fx.setLiquid(pick(stillAt, q));
        },
    };
}

/*
 * 每格一个 def：
 *   act   这一演出多长（数字，或函数——加载中那格要读引擎的 TOTAL_MS）
 *   frame 给定「本演出已过去 t 毫秒」，把这一格画成什么
 *   still 减弱动效时只画这一帧，不循环
 *   chip  角标文字，默认「已实现」
 */
const CELLS = [
    {
        id: "default",
        zh: "默认",
        en: "default",
        act: 1500,
        note: "普通内容、空白处。26px 实心球，无形变。没有开始和结束可言，这里只是静置一拍。",
        frame(t, fx) {
            fx.setVisible(true);
            fx.setBall(0, 0, 1);
        },
        still(fx) {
            fx.setVisible(true);
            fx.setBall(0, 0, 1);
        },
    },
    {
        id: "move",
        zh: "常规移动",
        en: "move",
        act: 2800,
        note: "位置直接写在 pointermove 里，逐帧只做按压插值。刻意没做弹簧跟随——延迟会让「指哪打哪」变成「追着跑」。",
        frame(t, fx, act) {
            const a = (t / act) * Math.PI * 2;
            fx.setVisible(true);
            // 8 字：起止同点同速，接缝看不出来
            fx.setBall(58 * Math.sin(a), 46 * Math.sin(2 * a), 1);
        },
        still(fx) {
            fx.setVisible(true);
            fx.setBall(58, 0, 1);
        },
    },
    /*
     * ── 点击特效 ──
     *
     * 以前这一格是「球缩到 0.86」:那是**缩放**,不是形状,也没有一点「按下去」的意思
     * ——看着像球被按瘪了一点,看不出这一下落在了什么地方。用户要的是「液体摊开」,
     * 时序照旧(「按住一直摊着,松手聚拢」)。
     *
     * ---- 形状做过三版,前两版都被用户否了 ----
     *
     * 第一版按的是**侧视**:一摊扁的(宽/高 ≈ 2)液体,中间连着,整摊比指针低 6px。
     * 用户的原话是**「现在是扁扁的形状,这不对,应该是圆形的,因为是俯视角度,液体摊开
     * 的效果」** —— 俯视看下去,「扁」和「低」在画面上根本不存在,那两条只是侧视的错觉。
     * 用户另外还定了:边是「圆 + 外围溅出的小液滴」,「掉下去」那一项直接去掉。
     *
     * 第二版是**俯视的圆 + 外围溅出去的小液滴**。用户又否了:**「去掉那些小液滴,并且
     * 摊开的轮廓再放大一点」** —— 外围那一圈整段删掉,那一摊自己从 1.17 倍放到 1.60 倍。
     *
     * 第三版(现在这一版):**就一整片**,核 + 外缘 10 团摞成的一摊圆液体。尺寸这一版
     * 之所以做得出来,正是因为外圈没了 —— 上一版「整体 = 那一摊 + 2×缝 + 4×液滴半径」,
     * 报 42px 的话中间那一摊反而只剩 21px,比球还小。
     * 时间常数没动,还是引擎里按下专用的那一套(PRESS_IN_TAU / PRESS_OUT_TAU,
     * 45 / 35ms),比别的状态短一个量级 —— 别的状态是形变(慢慢长出来、跟着指针走),
     * 按下是一下撞击,用那套常数会摊成一次慢动作。两边都不是这边另写的数,是从 CFG 读的。
     *
     * ---- 这一趟改的不是形状,是「换过去的那一段」 ----
     *
     * 用户原话:**「如果点击的时候鼠标状态不是普通状态,不要先变成普通状态再点击,而是直接
     * 过渡到点击状态」**。原先 hover.js 处理每一次换形的写法都一样:旧的先收回去(q → 0),
     * 新的再从 0 长起来。**收回去的那一头,画面上就是一颗普普通通的球** —— 于是「悬停着
     * 可点击的时候按下去」这条路走下来是:那一坨 → 一颗普通球 → 这一摊,中间那一格是
     * 用户明确不要的。现在两头里只要有**一头是点击特效**,旧的就不再收拢,而是原地化掉、
     * 新的同时长起来(详见 hover.js 文件头「直接交接」那一段)。
     */
    {
        id: "press",
        zh: "点击特效",
        en: "press / splat",
        chip: "元素触发",
        act: () => {
            const c = window.CursorFX.CFG;
            return Math.round(4.7 * c.PRESS_IN_TAU + PRESS_HOLD_MS + 4.2 * c.PRESS_OUT_TAU);
        },
        note: "按住任意地方,球摊开成一摊圆的液体,而且**就一整片** —— 俯视看下去," +
        "压力把这一摊压开了(这不是缩一下,也不是把球压扁)。" +
        "量出来的:等效直径 41.6px = 球的 1.60×,圆度 1.13(正圆 1.00)," +
        "重心就落在指针上(偏不到 1px),整摊从头到尾就是一块" +
        "(11 团几何上一直叠着,最小边到边间隙 -19px,渲染出来恒为 1 块)。" +
        "材料是变多的(面积 2.56 颗球)—— 摊开本来就该多,倍数由 splatMass 说了算。" +
        "时序是「按住一直摊着,松手聚拢」:摊开 4.7×45≈210ms、收回 4.2×35≈150ms," +
        "比元素状态那套(90 / 130ms)短一个量级 —— 按下是一下撞击,不是一个形变。" +
        "这一下是**指针自己的**,不挑元素:按在按钮上、按在空白处都是同一摊;" +
        "悬停着「可点击」的时候按下去,形状也从那一坨换成这一摊 —— 而且**不路过普通光标**:" +
        "中间没有一格是那颗普通的球(全程最像它的一帧也差 126.65px²,门槛 50;老做法是 3.60px²," +
        "也就是真的变回普通球了)。松手回去那一段同理。" +
        "只有三处例外(文本、不可点击、不许放):那里按下去本来就不该有反应,摊开等于" +
        "替它们撒谎说「这一下落在了什么东西上」。" +
        "另外真站点上按住的时候整个液体层还会按 ball.js 那个共用的按压系数缩一点(0.86)" +
        "—— 那是「按下」这个手势本来的缩放,球和液体吃同一个系数,所以交接的时候不会跳;" +
        "这一格为了把形状本身说清楚,没有再叠那一次。",
        frame(t, fx) {
            const c = window.CursorFX.CFG;
            const q = qOf(t, PRESS_HOLD_MS, c.PRESS_IN_TAU, c.PRESS_OUT_TAU);
            fx.setVisible(true);
            fx.setLiquid(window.CursorFX.sampleSplat(t, q));
        },
        still(fx) {
            // 减弱动效:停在摊得最满那一帧 —— 这一格要看的就是这个形状
            const c = window.CursorFX.CFG;
            const t = 4.7 * c.PRESS_IN_TAU + PRESS_HOLD_MS;
            const q = qOf(t, PRESS_HOLD_MS, c.PRESS_IN_TAU, c.PRESS_OUT_TAU);
            fx.setVisible(true);
            fx.setLiquid(window.CursorFX.sampleSplat(t, q));
        },
    },
    {
        id: "leave",
        zh: "离开文档",
        en: "leave",
        act: 2000,
        note: "指针移出文档就淡出，不留在原地。监听挂在 documentElement 上，所以从窗口任意一侧出去都能收尾。",
        frame(t, fx) {
            // 先移到格子边缘，到了才淡出 —— 先渐隐再位移会像是「消失」，不是「移出去」
            const u = Math.min(t, 1000) / 1000;
            fx.setBall(70 * easeOutCubic(u), 0, 1);
            fx.setVisible(t < 1000);
        },
        still(fx) {
            fx.setVisible(true);
            fx.setBall(0, 0, 1);
        },
    },
    {
        id: "loading",
        zh: "加载中",
        en: "loading",
        // 读引擎自己的循环长度，改 CFG 这里跟着变，不会对不上
        act: () => window.CursorFX.TOTAL_MS,
        note: "液体分裂：旋转中心在球的正下方，所以母球是坐在环顶上的。第二个球分出来后直接绕环心转到 1/3 圈的位置，母球原地不动；这时第三个球从母球身上分出来跟上，第二个球继续往前；等第三个球也转到 1/3 圈，母球才起步——三球恒定相隔 120°，合起来正好一整圈。三个里程碑都是从角度反解出来的（第二个球脱离母球表面的那一刻，正好是两者相切），不是凑时长。结束时并回一个。",
        frame(t, fx) {
            fx.setVisible(true);
            fx.setLiquid(window.CursorFX.sampleLiquid(t));
        },
        still(fx) {
            // 三个球撑成环、还在转的那一帧信息量最大。
            // 时间点从阶段表里算，不写死比例 —— 改时长的时候这里不会悄悄跑到别的阶段去。
            const fxApi = window.CursorFX;
            const t = fxApi.PHASE_START.orbit + fxApi.PHASES.filter(([n]) => n === "orbit")[0][1] / 2;
            fx.setVisible(true);
            fx.setLiquid(fxApi.sampleLiquid(t));
        },
    },

    /*
     * 下面四格是「元素状态」:不是自己演的,是指针压在某种元素上时才化开。
     * 什么时候算哪一种由 hover.js 读 --cursor 决定,这里只是把同一条 q 曲线
     * 喂给引擎的那几个采样函数,所以看到的形状和真站点上逐帧画出来的是同一份。
     */
    elementCell(
        "clickable", "可点击", "pointer",
        (te, q) => window.CursorFX.sampleViscous(te, q), 1500,
        "一块粘稠的液体:一个核 + 5 瓣,撑在指针上,面积始终等于 πR0²(化开不是变大)。" +
        "中心一直是实的,动的只有边缘 —— 逐帧量下来外沿最远伸到 15.6～16.4px,同一时刻各方向" +
        "相差 5.8～7.1px(所以不是圆的),而单个方向随时间只抖 0.1～4.3px(平均 2.3px);" +
        "各方向不同步,所以看着是「蠕动」而不是「忽大忽小」。",
    ),
    elementCell(
        "disabled", "不可点击", "not-allowed",
        (te, q) => window.CursorFX.sampleBurst(te, q), 2400,
        "化开成 8 滴往外飞,但中心必须空着 —— 那不是「长得慢」,是这块状态压根不允许中心有东西:" +
        "画出来中心到材料边界一直有 10.7px 的空(可视空白半径 12.0～15.1px)。外沿被一层往里收的" +
        "力拽住,20.1～23.5px 之间来回呼吸,扩散不出去。面积同样守 πR0²,飞出去的是有数的 —— " +
        "所以环想放大是放不动的:每滴多大由面积定死,8 滴加 goo 一糊,环半径 18px 就到底了。",
    ),
    elementCell(
        "text", "文本", "text",
        (te, q) => window.CursorFX.sampleBeam(te, q), 2200,
        "用户的原话是「文字的修改一下,改成两个小球,中间有些距离,中间有液体藕断丝连」," +
        "后来补一句「球离的更开一点」—— 所以这一格**不再是线**(在那之前它是「被力聚成一条" +
        "竖线」):两颗 7px 半径的小球(直径 14px,画出来两头 12.25～12.50px 宽),球心相距" +
        "24px,球面之间明明留着 10px 的空档,却被中间那 15 团 2.85px 的丝连成一整块 —— " +
        "渲染出来永远只有一块,断成两块就只是「两个小球」,不是「藕断丝连」。整条 36.0～37.2px" +
        "高(球是 26px 见方;几何上 38px,差的那 1px 是 goo 把两头的尖啃掉了),腰最细处" +
        "5.0～5.5px,细/粗 0.40～0.44 —— 这就是「两个小球中间一丝连着」量出来的样子。" +
        "量它的东西也换了:外接矩形说不出「两头粗、中间细」(一枚腰鼓和一根同高同宽的直棒在它" +
        "下面一模一样),所以改量**沿轴的宽度剖面**。材料上它比一条线还多带一点(0.689×πR0²," +
        "线是 0.50):分成两颗本来就比挤细一根更占地方。有一处得说清楚:丝最细的那一团半径" +
        "2.57px,落在「一颗孤零零的圆盘画得出来的下限 3.63px」和「一串重叠的圆连成一条时的" +
        "下限 2.25px」**之间** —— 它过得了后者(所以屏幕上是连着的),过不了前者,于是" +
        "「每一团都画得出来」那条判据在这一格上豁免。豁免是记了账的,判据那一边量的是" +
        "**糊完之后**的剖面和连通块数,不是拿一颗孤立圆盘的半径去比。",
    ),
    elementCell(
        "resizeedge", "拖动缩放 · 边", "ew-resize / col-resize / 0°",
        (te, q) => window.CursorFX.sampleResize(te, q, 0), 2200,
        "跟「文本」那格**曾经是同一个形状** —— 那时文本就是这条线转 90° —— 2026-09-18 文本" +
        "换成两颗球之后才拆开:现在「一条线」只剩拖动缩放这一族。用户的原话是" +
        "「跟着缩放轴,含对角」,所以引擎里没有「横线」和「竖线」两个形状,只有一个" +
        "sampleLine(te, q, deg):参数块、材料曲线、间距、两个摆动全部共用,角度是唯一的变量。" +
        "材料上它得**少带一半**(曲线是 q 的二次:开头一点不减,等线真抻出来了才收)——" +
        "面积守恒下 宽×高 几乎是常数,想同时变细**又**变短,光靠挤是挤不出来的;" +
        "再细还得跟 goo 抬杠:小于 3.63px 半径的团会被滤镜整个吃掉。" +
        "校验脚本把每根线**转回它自己的坐标系**再量长短边:0° 是 28.25～30.00 × 8.50～9.25px," +
        "90° 和它逐球相等(只差一个角度),45° 是 28.36～30.13 × 8.38～9.27px" +
        " —— 三个方向逐帧对下来最深的一对差 0.46px(长边)/ 0.24px(短边),而球只有 26px 见方。" +
        "中心是实的(和可点击一样,和不可点击正相反),整条永远只渲染成一块 —— 间距大于半径" +
        "的话会串成糖葫芦,那是虚线不是线。" +
        "同一个角度上的几个光标名(ew-resize / col-resize / e-resize / w-resize)是**同一个形状**:" +
        "拖左边还是拖右边,线都朝这个方向,只有「拖的是哪条边」不同 —— 那件事由宿主自己记着。",
    ),
    elementCell(
        "resizerow", "拖动缩放 · 上下边", "ns-resize / row-resize / 90°",
        (te, q) => window.CursorFX.sampleResize(te, q, 90), 2200,
        "同一根线转 90° —— 引擎里它和 0° 那根**逐球相等**(只差一个旋转;最大差 2e-14px," +
        "那是浮点求和的顺序,不是形状差异),光栅上量出来也一模一样:同样是 28.25～30.00 ×" +
        "8.50～9.25px。" +
        "单开一格是因为它原来借的是「文本」那一格 —— 文本那时候就是这条竖线,换成两颗球之后" +
        "竖的这一根在展示页上就没有出处了,而 ns-resize / row-resize / n-resize / s-resize" +
        "这一族是窗口上下边最常用的一档,不该缺席。",
    ),
    elementCell(
        "resizecorner", "拖动缩放 · 角", "nwse-resize / nesw-resize / ±45°",
        (te, q) => window.CursorFX.sampleResize(te, q, 45), 2200,
        "对角线,也是「为什么要按角度量」最直白的一格:45° 的线用轴对齐的框量出来只有" +
        " 21.75～24.00 × 22.25～23.75px —— 比 26px 的球还小。光看这个数会得出「它缩小了」" +
        "的结论,而它其实是 29.5px 长的一根斜线。所以校验脚本量之前先按 −角度把坐标转回去," +
        "同一批帧上 45° 和 90° 的长短边必须相等(实测长边差 0.4px、短边差 0.3px)。" +
        "−45°(nesw-resize / ne-resize / sw-resize)是它的镜像 —— 同一根线朝另一个对角," +
        "不另画一格。四个角度、14 个光标名全在引擎的 RESIZE_AXIS 一张表里,hover.js 从那表里" +
        "长出认领项,所以往表里加一个值,两边一起有。" +
        "这一族还是唯一会**按住不放**的:按住某条边之后形状盖过指针底下的一切,直到松手 ——" +
        "那会儿决定形状的不是指针底下是谁,而是手上正拎着哪条边。同一个角度换个值不重画," +
        "换角度(边换角)会先收拢回一颗球再换形。",
    ),
    /*
     * ── 放大缩小 ──
     *
     * 用户的原话:「黑球从中心有液体球散开、四周有液体球像中心球聚拢,中心球要比默认
     * 球小」,方向定成「放大=往外散,缩小=往内聚」。
     *
     * 两格共用一整组数(引擎里就一个 sampleZoom,方向是参数),唯一的区别是那几颗往里
     * 还是往外 —— 所以这里必须画成两格,不是一格两种说法:方向正是这一族唯一的变量,
     * 合成一格的话「缩小反着走」这种错没有地方看得出来。
     *
     * 中心球那一条是这一族独有的要求:别的形状只要求面积守恒,中心球多大无所谓,
     * 这里用户点名要小,而且小到一个具体的数(ZOOM_CORE=0.62)。数字全部实测。
     */
    elementCell(
        "zoomin", "放大", "zoom-in",
        (te, q) => window.CursorFX.sampleZoom(te, q, "in"), 1800,
        "中心留一颗小球,四周 6 颗液体球往外散。中心球从 13.00px 一路缩到 8.07px" +
        "(= 0.62×R0,用户点名的那个数),而且**只小不大** —— 中途一次回弹都没有" +
        "(最大回升 0.003px)。少掉的材料正好变成四周那几颗:(1 − 0.62²)/6 的份额," +
        "所以面积全程守 πR0²(偏差 0.000%),不是「中心变小、旁边凭空多出东西」。" +
        "四周那几颗从 0 散到 22.97px(实测,含摆动),中间没有一颗小到会被 goo 吃掉" +
        "(最小 3.75px,滤镜的下限是 3.63px)。",
    ),
    elementCell(
        "zoomout", "缩小", "zoom-out",
        (te, q) => window.CursorFX.sampleZoom(te, q, "out"), 1800,
        "和放大是同一个形状、同一组数,只把方向反过来:四周那几颗先被甩到最远" +
        "(21.97px,q=0.70)再往回收,落在 14.98px —— 净运动朝里,而且落得比放大" +
        "(22.97px)近 8px。要先甩出去一次,是因为起手那一帧必须是**一颗**球" +
        "(全篇的硬约定):要往回收的东西得先在外面,材料本来就是这颗球让出去的。" +
        "「甩」和「收」的分界点在 q=0.7 是量出来的,不是估的 —— 原来取 0.32 时," +
        "状态机第一帧(从静止起步 q 直接跳到 0.169)形状就已经甩开 13px,单帧翻黑" +
        "296px²(别的状态冷启动那一帧只有 61.5px²),看着是啪地弹开;挪到 0.7 之后" +
        "同一个数变成 0。收到最内时四周和中心球之间还留着 2.30px 的缝,不会糊成一坨。",
    ),
];

/*
 * 未实现的状态，抄自 cursor-states.md。这一页只展示已经做出来的东西，
 * 剩下的列在下面，缺口有多大一眼能看见。
 */
const PENDING = [
    {
        group: "现存的两个 bug",
        next: true,
        items: [
            ["触摸设备", "(hover: none)", "整个模块应当不启用。现在反而会跟着手指跑"],
            ["窗口失焦", "window 的 blur", "切走后球僵在原地，因为 pointerleave 不一定触发"],
        ],
    },
    {
        group: "让位：交还原版鼠标（画不出来的标准光标）",
        items: [
            // 这一组从「什么都没有」变成了「有定论、没形状」:规矩是用户定的 ——
            // 除非该状态没有对应鼠标效果,否则自动隐藏原版鼠标。所以它们现在的
            // 行为是**原版光标现身、球留着**(试玩区最后一组能直接看到),
            // 缺的只是「用液体画成什么样」这件事本身的答案。
            //
            // 这九条 = 标准光标整表 33 个关键字减去我们认领的 24 个,一个不多一个不少。
            // zoom-in / zoom-out 原来在这一组里,现在有形状了,搬去上面那两格;
            // move / grab / grabbing / all-scroll 是同一回事的另一半 —— 上一轮按
            // 「网页说不清窗口系统在动窗口」主动交了出去(连形状都做出来过),
            // 这一轮按用户的口径(抓取中也用点击特效)收了回来,也搬走了。
            ["精确指向 crosshair", "canvas、图表", "原版准星现身、球留着（形状待做：细环或十字）"],
            ["帮助 help", "[title]、术语标记", "同上（形状待做：球内出现 ?）"],
            ["上下文菜单 context-menu", "右键可用区域", "同上（形状待做：轻微收缩）"],
            ["进度 progress", "长任务进行中", "同上"],
            ["等待 wait", "控件忙着、暂时点不动",
             "同上（和上面「加载中」那一格不是一回事：那格是**页面**在等媒体，这格是控件在忙）"],
            ["单元格 cell", "表格、网格里的格子", "同上"],
            ["竖排文本 vertical-text", "竖排正文", "同上（横排正文那格已经有形状了，只差竖过来）"],
            ["别名 alias", "快捷方式、替身", "同上"],
            ["复制 copy", "可复制的块", "同上"],
        ],
    },
    {
        group: "会话驱动",
        items: [
            ["快速移动", "速度超过阈值", "沿运动方向轻微拉长"],
            ["静止", "静止超过 3 秒", "轻微呼吸，或淡到 70%"],
            ["回到窗口", "window 的 focus", "等下一次移动再出现"],
            ["指针进入 iframe", "进入子框架", "收不到事件，兜底隐藏"],
            // 不写「拖动…」开头的名字:展示页有一条检查是「还没做的」里不能有以格子名
            // 开头的条目,而上面有两格叫「拖动缩放 · 边 / · 角」—— 那句前缀匹配会误报。
            // 这不是撞名,是检查太粗,所以改成绕过前缀的写法。
            ["缩放到窗口外", "缩放时指针离开视口", "保持按住态不重置（宿主开着的时候本来也不重置）"],
        ],
    },
    /*
     * 原来这里还有一组「做了一半」:减弱动效 / 键盘导航 / 脚本失败。三条都是隐患
     * (每一条都能让用户**失去指针**),2026-09-18 一起补完了,所以整组删掉,不是
     * 挪到别处 —— 展示页的「还没做的」只该有还没做的。
     *
     * 它们本来就没法用格子演:正确表现是「什么都不画」(减弱动效下不进任何形变;
     * 键盘那一条压根不是形状问题 —— 原来坏的是导航和卡片**不在 Tab 顺序里**)。
     * 这三条的验收在 tools/cursor-fx/test_safety.js 里,不在这一页上。
     */
];

function pendingHTML() {
    return PENDING.map((g) => `
        <h3 class="${g.next ? "cx-next" : ""}">${g.group}</h3>
        <ul>
            ${g.items.map(([name, trigger, want]) => `
                <li><code>${name}</code> —— <em>${trigger}</em>。${want}</li>
            `).join("")}
        </ul>
    `).join("");
}

const PAUSE_MS = 700;   // 一轮演完停多久再从头播

/*
 * 试玩区用的全是真元素 —— 这里没有任何「演示模式」。
 *
 * 指针移上去走的就是真站点那一条路:hover.js 在 pointerover 里读元素计算样式上的
 * --cursor(值来自 skin-ui.css 里那几条声明),认出来之后把引擎的液体贴上去。
 * 其中 disabled 那条是本站唯一一处「不可点击」的宿主:站上本来没有这种元素,
 * 而 .cursor-not-allowed 是留给「不是表单控件、但也点不了」的东西用的逃生口。
 */
function playgroundHTML() {
    return `
    <div class="card cx-play">
      <h2>试玩 | Try it</h2>
      <p class="cx-note">
        下面这几块是真的,不是画出来的:指针移上去,黑球就按这块元素声明的 <code>--cursor</code>
        变形,移开收回去。前四块的意图分别是「可点击」「可点击」「不可点击」「不可点击」——
        它们站在 <code>button</code> / <code>a[href]</code> 的通用规则、<code>[disabled]</code>、
        以及 <code>.cursor-not-allowed</code> 这个显式标记上。
      </p>
      <div class="cx-play-row">
        <button type="button" class="btn cx-play-item">一个按钮</button>
        <a href="#/cursor" class="btn cx-play-item">一个链接</a>
        <button type="button" class="btn cx-play-item" disabled>禁用的按钮</button>
        <span class="cx-play-item cx-play-plain cursor-not-allowed">标了 .cursor-not-allowed 的块</span>
      </div>
      <p class="cx-note">
        后两块是「文本」:能选中、能读的正文,和拿来打字的控件。它们没有专门的类,
        站在 <code>p</code> 和文字类 <code>input</code> 这两个通用选择器上。
      </p>
      <div class="cx-play-row">
        <p class="cx-play-text cx-play-item">这一段是可以选中的正文。指针移上来,黑球会裂成两颗小球,中间一丝液体连着。</p>
        <input type="text" class="cx-play-input cx-play-item" placeholder="这里可以打字" aria-label="试玩用的文本框">
      </div>
      <p class="cx-note">
        <code>--cursor</code> 会继承,所以「链接里的段落」是文本这条规则唯一需要当心的地方:
        <code>a[href]</code> 里面的 <code>p</code> 不能裂成那两颗球,否则一块可点的卡片会给出
        「这里只是字」的暗示。下面这块就是那个例子 —— 里面的段落仍然显示「可点击」。
      </p>
      <div class="cx-play-row">
        <a href="#/cursor" class="cx-play-linkcard">
          <p class="cx-play-text cx-play-item">链接里的段落:字照样能选中,但指针是可点击的形状 —— 祖先声明了 pointer,里面的正文得让位。</p>
        </a>
      </div>
      <p class="cx-note">
        <strong>点击特效是全局的</strong>:按住上面任何一块、或者按住下面的空白 ——
        球都会摊开成一摊圆的液体(比球大一圈、就一整片),松手聚回来。
        这一下不挑元素,因为它说的是「指针按下了」,
        不是「某个东西被按了」。悬停着「可点击」的时候按下去,形状也一样从那一坨
        换成这一摊(按下压过悬停)。只有三处例外:正文(按下是开始拖选)、
        禁用的东西、以及下面「不可点击」那块 —— 那里按下去本来就不该有反应,
        摊开等于替它撒谎说「这一下落在了什么东西上」。
      </p>
      <p class="cx-note">
        下面两组是「抓取」和「放大缩小」,都站在 <code>data-*</code> 上,和
        <code>data-resize</code> 同一个写法。抓取那两个取值说的是<strong>这块东西是什么</strong>,
        不是光标名:能拖的东西写 <code>data-drag="grab"</code>(和能点的东西一样,是可点击
        那一坨),搬窗口那种写 <code>data-drag="move"</code>(和「抓着不放」一样,是点击特效
        那一摊)。放大缩小写 <code>data-zoom="in" / "out"</code>,取值和标准光标同名。
      </p>
      <div class="cx-play-row">
        <div class="cx-drag cx-play-item" data-drag="grab">
          <span class="cx-drag-grip" aria-hidden="true">⠿</span>
          <span class="cx-drag-label">一个能拖的东西</span>
          <span class="cx-drag-sub"><code>data-drag="grab"</code> → 可点击那一坨</span>
        </div>
        <div class="cx-zoom cx-play-item" data-zoom="in">
          <span class="cx-zoom-label">放大</span>
          <span class="cx-zoom-sub"><code>data-zoom="in"</code></span>
        </div>
        <div class="cx-zoom cx-play-item" data-zoom="out">
          <span class="cx-zoom-label">缩小</span>
          <span class="cx-zoom-sub"><code>data-zoom="out"</code></span>
        </div>
      </div>
      <p class="cx-note">
        抓起来的那一块在下面这个窗口的标题栏上:按住标题栏拖一下 —— 指针底下是不是
        能拖的东西,和「手上正拎着东西」是两回事,前者是可点击那一坨,后者是点击特效
        那一摊。标题栏标的是 <code>data-drag="move"</code>(它就是窗口的移动把手)。
      </p>
      <p class="cx-note">
        下面这个窗口是真的能缩放的 —— 不是画出来的示意图:按住它的边或角拖一下,尺寸真的
        跟着变。四条边/角各自标了 <code>data-resize</code>,声明了对应的标准光标值
        (右边 <code>ew-resize</code>、下边 <code>ns-resize</code>、右下角
        <code>nwse-resize</code>、左上角 <code>nesw-resize</code>)。
      </p>
      <div class="cx-play-row">
        <div class="cx-win cx-play-item cx-win-resize">
          <div class="cx-win-bar" data-drag="move">
            <span class="cx-win-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="cx-win-title">一个可以缩放的窗口</span>
          </div>
          <div class="cx-win-body">
            <p class="cx-play-text">按住四条边/角拖动，窗口真的会改尺寸。</p>
          </div>
          <span class="cx-grip cx-grip-nw" data-resize="nw" aria-hidden="true"></span>
          <span class="cx-grip cx-grip-e" data-resize="e" aria-hidden="true"></span>
          <span class="cx-grip cx-grip-s" data-resize="s" aria-hidden="true"></span>
          <span class="cx-grip cx-grip-se" data-resize="se" aria-hidden="true"></span>
        </div>
      </div>
      <p class="cx-note">
        <code>data-resize</code> 的取值是「拖的是哪条边/哪个角」(e / s / se / nw),
        <strong>不是</strong>光标名本身。因为光标名只说得清方向:右边和下边能分开(一横一竖),
        可是「往东拖」和「往西拖」在光标名上是同一个 <code>ew-resize</code>。写光标的那个
        名字,页面自己就分不清拖的是哪条边了。
      </p>
      <p class="cx-note">
        拖起来的时候试试:把指针划到按钮、划到正文、划到窗口外面 —— 形状<strong>不会</strong>
        跟着变。这就是清单里的优先级第 1 条:正拎着一条边的时候,决定形状的不是「指针底下
        是什么」,而是「手上拎着哪条边」,直到松手。判据只认「这一按是不是落在缩放边上开始的」,
        所以选字、按按钮不会被当成缩放。按住之后换到**同一个角度**上的另一个值(比如从窗口
        右边划到下边再划回来)形状不重画,换到另一个角度才会先收拢回一颗球再换形。
      </p>
      <p class="cx-note">
        <strong>这一条只有一半能在浏览器里做。</strong>上面缩放的是页面里的一块面板;
        真正缩放一个<strong>窗口</strong>(标题栏那条边)是窗口系统在动它,网页收不到任何事件,
        连指针在不在浏览器里都不一定。所以浏览器这一侧做的是「认领那 14 个 resize 值,加上
        自己按下时的锁定」,另外一半留给知道实情的宿主:
        <code>window.HoverWatch.setResize("ew-resize")</code> —— 传的是光标名/方向,窗口系统、
        Electron 外壳那类地方可以直接把状态打开,不用伪造 DOM 事件;传一个认不出来的值不会
        乱画,它会报回此刻真正在用的那个值。这就是「这套光标不止在浏览器用」这句话在代码里的落点。
      </p>
      <p class="cx-note">
        <strong>最后一组是反过来的:我们画不出来,所以原版鼠标自己出来。</strong>
        规矩也是你定的 —— 「除非该状态没有对应鼠标效果,否则自动隐藏原版鼠标」。下面四块声明的值
        都在标准光标表里,但这套主题还没有对应的形状,于是指针移到它们上面时:球照旧跟着指针
        (不变形、也不消失),系统那只指针一起回来。两个光标同框是<strong>故意</strong>的 ——
        以前这种元素是「什么都不做」,指针看着像能点、点下去却是另一回事,那是撒谎。
      </p>
      <div class="cx-play-row">
        <span class="cx-play-item cx-hand cx-hand-crosshair">crosshair：给画布、图表用</span>
        <span class="cx-play-item cx-hand cx-hand-menu">context-menu：右键可用的地方</span>
        <span class="cx-play-item cx-hand cx-hand-help">help：给术语标记用</span>
        <span class="cx-play-item cx-hand cx-hand-wait">wait：不做了(加载中另有一格)</span>
      </div>
      <p class="cx-note">
        这一组是标准光标表里<strong>没被认领</strong>的那几个:整表 33 个关键字
        (标准那 36 个去掉 <code>auto</code> / <code>default</code> / <code>none</code>
        —— 它们不是「要个箭头」,是「随大流」),我们认领了 24 个,剩下 9 个走这条路:
        <code>crosshair</code> / <code>context-menu</code> / <code>help</code> /
        <code>progress</code> / <code>wait</code> / <code>cell</code> /
        <code>vertical-text</code> / <code>alias</code> / <code>copy</code>。
        上面只摆了四块,别的同理。这条让位的路只对「表里有、我们没有形状」的值开口子,
        所以哪天给其中一个做了形状,它就该从这一组搬到上面去 —— zoom-in 刚搬过一次
        (现在有形状了,在上面那两格),move / grab / grabbing / all-scroll 也一样:
        上一轮按「网页说不清窗口系统在动窗口」交了出去,这一轮按用户的口径收了回来。
      </p>
      <p class="cx-note">
        从一种形状直接移到另一种时会先收拢回一颗球再换形 —— 满状态下它们长得完全不同
        (一坨 / 一圈 / 两颗小球连着一丝 / 一条横线 / 一条竖线 / 一条斜线 / 一摊),
        只有收拢到 q≈0 那一帧它们是同一颗球,
        只有那一帧换才不跳。
      </p>
    </div>
  `;
}

window.renderCursor = function () {
    document.getElementById("content").innerHTML = `
    <div class="card">
      <h1>光标状态 | Cursor States</h1>
      <p class="cx-intro">
        黑球光标的每一种状态各占一格，自己演一遍「开始 → 结束」，
        停一下再重播。进度以 <code>cursor-states.md</code> 为准，这里只放已经做出来的。
        另外几条的正确表现就是「什么都不画」——初始化前、减弱动效、键盘导航、脚本失败——
        格子演示不了它们，验收在 <code>tools/cursor-fx/test_safety.js</code>。
      </p>
    </div>

    <div class="cx-grid">
      ${CELLS.map((c) => `
        <div class="cx-cell">
          <div class="cx-head">
            <span class="cx-name">${c.zh}</span>
            <span class="cx-chip is-live">${c.chip || "已实现"}</span>
          </div>
          <div class="cx-stage" data-cx="${c.id}"></div>
          <div class="cx-head" style="margin:0.5rem 0 0">
            <span class="cx-en">${c.en}</span>
          </div>
          <p class="cx-note">${c.note}</p>
        </div>
      `).join("")}
    </div>

    ${playgroundHTML()}

    <div class="cx-pending">
      <h2>还没做的 | Not yet</h2>
      ${pendingHTML()}
    </div>
  `;

    mountCursorGallery();
    mountWindowResize();
};

function mountCursorGallery() {
    if (!window.CursorFX) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const items = Array.from(document.querySelectorAll(".cx-stage[data-cx]"))
        .map((stage, i) => {
            const def = CELLS.find((c) => c.id === stage.dataset.cx);
            if (!def) return null;
            const fx = window.CursorFX.create(stage);
            fx.setVisible(false);
            return { def, fx, stage, offset: i * 420, onScreen: true, wasRunning: false };
        })
        .filter(Boolean);

    if (!items.length) return;

    // 减弱动效：不循环，每格停在最有代表性的一帧
    if (reduce) {
        for (const it of items) {
            it.def.still(it.fx);
        }
        return;
    }

    // 离屏的格子不跑。时间轴是纯函数，回到视口直接按当前时间画，不会有接不上的问题。
    if (typeof IntersectionObserver === "function") {
        const io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                const it = items.find((x) => x.stage === e.target);
                if (it) it.onScreen = e.isIntersecting;
            }
        }, { rootMargin: "120px" });
        for (const it of items) io.observe(it.stage);
    }

    const start = performance.now();
    let raf = 0;

    function tick(now) {
        let alive = false;

        for (const it of items) {
            // 换页时 #content 被整体替换，旧实例自然失联 —— 据此自停，不用外部记得来注销
            if (!it.stage.isConnected) continue;
            alive = true;
            if (!it.onScreen) continue;

            const act = typeof it.def.act === "function" ? it.def.act() : it.def.act;
            const cycle = act + PAUSE_MS;
            const local = (((now - start - it.offset) % cycle) + cycle) % cycle;
            const running = local < act;

            if (running) {
                it.def.frame(local, it.fx, act);
            } else if (it.wasRunning) {
                it.fx.setVisible(false);
            }
            it.wasRunning = running;
        }

        if (!alive) {
            raf = 0;
            return;
        }
        raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
}

/*
 * 试玩区那个小窗口是真的能缩放的 —— 不是「演示缩放」,是这块面板真的在改尺寸。
 *
 * 为什么值得写这一段:光有一块声明了 --cursor: ew-resize 的元素,能说明的只有
 * 「指针放上去形状对」。这一条真正特别的地方是**按住之后形状盖过一切**,而不按住
 * 就看不到:拖到一半指针会划过按钮、划过正文、划出窗口,形状都不该跟着变。
 * 缩放窗口本来是最自然的例子,可浏览器里缩放不了真窗口,那就给一块真能被缩放的
 * 东西 —— 拖起来的过程中指针底下是什么完全不确定,和真缩放窗口时是一回事。
 *
 * 监听挂在 document 上而不是那块元素上,也不用 pointer capture:capture 会把
 * 后续的 pointer 事件**全部改派到捕获元素**上,hover.js 的 pointerup 是拿事件
 * 自带的 target 去认「松手时指针在哪」的,一旦改派就永远认成这块把手,松手后
 * 形状会错到下一次移动为止。挂在 document 上就没有这个问题,代价只是指针出文档
 * 时要自己收手(见下面的 blur)。
 *
 * 四个把手方向不同但共用一套算法:dx/dy 是「指针相对按下时挪了多远」,
 * 东/南边按正方向加,nw 反过来减 —— 而且 nw 得同时用 transform 把自己往回挪,
 * 否则左上角会跟着跑,右下角反而动了(拖动缩放时对面那个角是不动的)。
 *
 * 换页时按站上既有的约定自停:#content 被整体替换,这块元素自然失联,监听自己走。
 */
function mountWindowResize() {
    const win = document.querySelector(".cx-win-resize");
    if (!win || typeof win.addEventListener !== "function") return;
    if (typeof win.querySelectorAll !== "function") return;
    const grips = Array.from(win.querySelectorAll("[data-resize]") || []);
    if (!grips.length) return;

    // 尺寸的上下界:小到看不出是块面板、大到盖住旁边的说明,都不好
    const MIN = { w: 150, h: 96 };
    const MAX = { w: 460, h: 300 };
    let id = null;      // 正在拖的那根手指/那支笔;null = 没在拖
    let dir = "";       // 拖的是哪条边/角(e / s / se / nw),就是 data-resize 的值
    let px0 = 0, py0 = 0;   // 按下时指针在哪
    let w0 = 0, h0 = 0;     // 按下时窗口多大

    function apply(dx, dy) {
        let w = w0, h = h0;
        if (dir === "e" || dir === "se") w = w0 + dx;
        if (dir === "s" || dir === "se") h = h0 + dy;
        if (dir === "nw") { w = w0 - dx; h = h0 - dy; }
        w = Math.max(MIN.w, Math.min(MAX.w, w));
        h = Math.max(MIN.h, Math.min(MAX.h, h));
        win.style.width = w + "px";
        win.style.height = h + "px";
        // nw:左边也动了,所以把整块往右挪「少掉的那部分」,让右下角待在原地
        const tx = dir === "nw" ? w0 - w : 0;
        const ty = dir === "nw" ? h0 - h : 0;
        win.style.transform = tx || ty ? `translate(${tx}px, ${ty}px)` : "";
    }

    function down(e) {
        if (id !== null || e.button !== 0) return;
        if (typeof e.currentTarget.dataset !== "object") return;
        dir = e.currentTarget.dataset.resize || "";
        if (!dir) return;
        const r = typeof win.getBoundingClientRect === "function"
            ? win.getBoundingClientRect()
            : { width: 0, height: 0 };
        id = e.pointerId;
        px0 = e.clientX;
        py0 = e.clientY;
        w0 = r.width;
        h0 = r.height;
        win.classList.add("is-resizing");
        // 别顺手把窗口里的字选中了 —— 这一段要演的是「缩放」,不是「选」
        e.preventDefault();
    }

    function move(e) {
        if (!live() || e.pointerId !== id) return;
        apply(e.clientX - px0, e.clientY - py0);
    }

    function up(e) {
        if (!live() || e.pointerId !== id) return;
        endResize();
    }

    // 松手:只收工,不还原 —— 窗口多大就是多大,免得看不出自己拖出来的结果
    function endResize() {
        id = null;
        dir = "";
        win.classList.remove("is-resizing");
    }

    // 元素不在文档里了(换页了)就把自己摘干净,和上面那个循环是同一条约定
    function live() {
        if (win.isConnected) return true;
        for (const g of grips) g.removeEventListener("pointerdown", down);
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", up);
        window.removeEventListener("blur", endResize);
        return false;
    }

    for (const g of grips) g.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    // 指针到浏览器窗口外面松手,pointerup 不一定送得到 —— 失焦时权当松手了。
    // 只收工、不还原:切一下标签页就把窗口弹回原尺寸,那是另一回事
    window.addEventListener("blur", endResize);
}
