/**
 * 元素状态 —— 指针压在某块元素上时,黑球该变成什么形状。
 *
 * 认领的值一共七族:可点击(粘稠化开)、不可点击(四散)、文本(两颗小球、中间一丝连着)、
 * 拖动缩放(同一条线,朝缩放轴的方向,含对角)、可抓取(和可点击同形)、
 * 抓取中 / 移动(和点击特效同形)、放大缩小(中心一颗小球 + 四周一圈液体球,
 * 放大往外散、缩小往内聚)。
 *
 * 还有一样不是「值」、而是「动作」的:**按住**(用户叫它「点击特效」)。指针一按下,
 * 不管底下是什么,形状就换成一摊摊开的液体 —— 见下面那一节。
 *
 * ── 意图从哪来 ──
 *
 * 「这块能不能点」不能猜,只能问元素。问法本该是读计算样式里的 cursor,但
 * skin-ui.css 里那条 `html.has-pointer * { cursor: none !important }` 把所有元素的
 * cursor 全压成了 none,读出来永远是 none,什么也问不到。为了读一个值去临时摘掉
 * !important 更糟:指针每划过一块元素就要改一次全局样式、强制重排一遍。
 *
 * 所以另开一条通道:自定义属性 --cursor。它正常继承、不参与绘制,可以写在控件自己
 * 那一段样式旁边,离它的样式最近。取值语义和 cursor 一样(pointer / not-allowed /
 * text / ew-resize ...),没写的地方落到 auto。
 *
 * 万一引用方的页面没接这条通道(--cursor 算出来是空的),回落到真的 cursor:
 * 只要它不是 none,就说明那个页面没有藏光标,那边给出的就是真答案。
 *
 * ── 认领哪些值,以及认不到的那些怎么办 ──
 *
 * 认领表就是下面那张 INTENT,一行一个值。拖动缩放那一族不是手写进来的,是从引擎
 * 的 RESIZE_AXIS 长出来的 —— 「哪几个值属于这一族、各自朝哪儿」只有那一处定义。
 *
 * 认不到的值分两种,处理方式**不一样**:
 *
 *   - 元素压根没提要求(auto / default / 空的):球保持原样。这是这台主题的默认
 *     样子,原版鼠标照旧藏着 —— 我们确实有东西要画(那颗球)。
 *   - 元素**明确要了一个我们画不出来的光标**(crosshair / help / zoom-in ...):
 *     原版鼠标露出来。这是用户定的规矩:「除非该状态没有对应鼠标效果,否则自动
 *     隐藏原版鼠标」—— 反过来说就是,**画不出来就把位置让回去**。让位是加一个类
 *     (html.show-real-cursor)加一个自定义属性 --real-cursor,不逐元素改样式。
 *
 * 球在让位的时候**留着**(用户选的):原版鼠标出现,球也还在。同一时刻两个光标
 * 是这里明知而故意要的效果,不是没处理干净。
 *
 * 这条规矩接的正是清单上「不认领 crosshair / help / zoom」那几行:以前不认领等于
 * 「什么都不做」,指针看着像能点、点下去却是另一回事;现在不认领是「让原来的光标
 * 出来说话」—— 不撒谎了。
 *
 * ── 形变 ──
 *
 * 引擎的 sampleViscous / sampleBurst / sampleBeam / sampleResize / sampleSplat /
 * sampleZoomIn / sampleZoomOut 都吃一个「在场程度」q ∈ [0,1],q=0 时全都还原成
 * 一颗 R0 的黑球,和 #latex-ball 逐像素一样。于是进出、被加载态插队、半路改主意,全都只是把这个 q 的目标改一下:
 * 形状从当前帧接着走,没有淡入淡出,也没有接缝。这是几个状态能共用一套进出逻辑
 * 的原因,也是加下一个状态时唯一必须守住的约定。
 *
 * 从一种形状移到另一种会**先收拢到 q≈0 再换形**。两个状态在 q=1 时长得完全不同
 * (一坨 vs 一圈 vs 一条线),直接换会硬跳一下;而 q=0 那一帧它们都是同一颗球,
 * 只有那一帧换不跳。
 *
 * 所以**方向不同也算不同的形状**:一条横线和一条竖线虽然在同一个状态名下(都叫
 * resize),但它们不能直接互换,得先收拢。表里每一格有一个 key,key 才是这层
 * 判据认的东西 —— resize:0 和 resize:90 是两个 key,resize:0 和 col-resize
 * 是同一个 key(值不同、方向相同,形状一模一样,换了不该收)。
 *
 * 唯一不收拢的一处是**换形的两头里有一头是点击特效**(见下面「点击特效」那一节)。
 * 用户的话是「如果点击的时候鼠标状态不是普通状态,不要先变成普通状态再点击,而是
 * 直接过渡到点击状态」—— 「先变成普通状态」说的正是上面那条规矩在按下这一刻的
 * 后果:指针底下是一坨可点击的液体时按下去,得先缩回**一颗球**(那正是普通状态,
 * 也正是 q=0 那一帧),再摊开。那一下把「按」演成了两下。
 *
 * ── 拖动缩放:一个会「按住不放」的状态 ──
 *
 * 这一族说的是**拖动一个窗口/面板的边缘把它改尺寸**,不是网页里某个能拖的元素。
 * 用户对这条纠正过两次,别再把理解倒回去:先是「我的拖拽不是指这个,而是窗口拖动
 * 变形的动作」,再问时是「拖拽窗口的时候。因为这套光标可能不止在浏览器用」。
 * 后来又把「拖动」说全了:**拖动缩放** —— 所以线要跟着缩放轴走,含对角。
 *
 * 别的状态都只看「指针此刻压在哪块元素上」,这一个多一层:**按住之后形状盖过一切**
 * (清单的优先级第 1 条):拖到一半划过按钮、正文,形状不该跟着变 —— 那会儿决定
 * 形状的已经不是「指针底下是什么」,而是「手上正按着什么」。判据只认一件事:
 * 这一按**是不是落在缩放边/角上开始的**。
 *
 * 按下时记的是**那一格**(连同它的方向),不是一个布尔 —— 按住左右边(0°)和按住
 * 上下边(90°)是两个不同的形状,只记「按住了」的话,松开前形状会按新的方向重画。
 *
 * ── 点击特效:按下这一下自己有形状 ──
 *
 * 以前按下只是把当前那个形状缩掉一点(球的 scale 0.86),那是个**缩放**、不是形状。
 * 用户要的是一条真的形状 —— 所以现在是引擎里的一格(splat),和别的状态平级,只是
 * 触发它的不是「指针底下是什么」,而是「手按没按下去」。
 *
 * 这一格的形状改过两版:第一版是**侧视**(一摊扁的、比指针低),用户否了 ——
 * **「现在是扁扁的形状,这不对,应该是圆形的,因为是俯视角度,液体摊开的效果」**;
 * 第二版是俯视的圆 + 外面一圈溅出去的小液滴,用户又否了 ——
 * **「去掉那些小液滴,并且摊开的轮廓再放大一点」**。现在画的是俯视的一整片:
 * 一摊圆的液体摊在指针上,比球大 1.6 倍,11 团一直叠着,谁都不许散开。
 * 形状本身全在 sampleSplat 里,这边只管什么时候切过去。
 *
 * 用户把抓取那一族也交给它了:「抓取中(grabbing)也用这个」。所以 grabbing /
 * move / all-scroll 三个值直接映射到同一格,按下和声明的值走的是同一条路。
 *
 * 进出这一格**都不收拢** —— 它是文件头那条「换形先收拢」的唯一例外,理由见那一节。
 * 收拢放到这一格上尤其没道理:按下不是「一个新形状长出来」,是眼前这摊东西被按散,
 * 先缩回一颗球再摊开,等于把按下的那一下演成了两下。所以走的是**直接交接**:
 *
 *   按下 —— 指针底下那一格(可点击那一坨、放大缩小那一圈……)**留在画面上接着收**,
 *           只是把自己的 q 收到 0;点击特效这一格**同时**从一颗球长起来。
 *   松开 —— 反过来:这一摊收着,底下的那一格同时长回来。
 *
 * 两头都是「一圈圆、坐在指针中心」,所以合起来看就是同一摊液体在里面换个排布,
 * 外沿从头到尾只有一个动作(按下往外摊、松手往里聚),中间不会先缩成一颗球 ——
 * 那正是用户说的「先变成普通状态」。合成这一步不需要引擎配合:图层吃的就是一串球
 * (cursor-fx.js 的 paint(frame) 按帧长自己扩池子),两帧的球接起来交过去就行。
 *
 * 判定里「有没有一头是这一格」用的是**对象**,不是 key:它只可能是 PRESS 这一个
 * 对象(手按着,或者声明的值是 grabbing / move / all-scroll),没有第二格叫 splat。
 *
 * 按下的判定是**全局**的 —— 指针压在哪儿都算,包括压在根本没声明光标的空白上。
 * 但有三族除外,它们的按下本來就是另一回事,不该被这一格盖掉:
 *
 *   文本(text)           —— 按下是**开始拖选**,松手才结束;盖掉的话选一整段字
 *                           的全过程都看不见那两颗球和中间那一丝了。
 *   不可点击(not-allowed / no-drop) —— 按下什么都不会发生。这里给它一摊「点到了」
 *                           的液体,等于替这个元素撒了个谎 —— 而正是为了不撒这种谎
 *                           才有「让位」那条规矩。
 *   拖动缩放(resize 那一族) —— 按下本来就是它,hold 已经把它锁住了。
 *
 * 这三族在表里标 noPress,判据就在 wantNow() 那一处,别的什么都不用改。
 *
 * 时间常数另给一组(见引擎的 PRESS_IN_TAU / PRESS_OUT_TAU):按一下是很短的一件事,
 * 用状态那一组的 90/130,一次点击从头到尾都还在「收拢成球」,根本看不到那摊液体。
 *
 * ── 浏览器之外:这个状态为什么会有一个显式入口 ──
 *
 * 浏览器里根本没有「正在拖窗口边缘」这件事可看。窗口被缩放时,是**窗口系统**在动
 * 窗口,网页收不到任何事件 —— 那会儿指针可能压在窗口边上,也可能压在页面里任何
 * 一块上,甚至压在浏览器窗口外面。所以浏览器这一侧只能做一半:认领那一族值,
 * 让页面自己标注「这块是缩放边」(缩放的过程中靠按下的那一格锁住形状)。
 *
 * 另外一半留给宿主:setResize(值名)。窗口系统、Electron 外壳、桌面环境这类知道
 * 「此刻正在缩放哪条边」的地方,可以直接把状态打开,不必伪造一个 DOM 事件,也不必
 * 为了这个状态去改页面。这是「这套光标不止在浏览器用」这句话在代码里的落点 ——
 * 引擎本身没有依赖过任何 DOM 语义(形状是纯几何,图层是自带的 SVG),唯一和宿主
 * 有关的就是「谁来决定此刻是什么状态」,那就把入口开出来。
 *
 * 传的是**值名**(ew-resize / nwse-resize / ...),不是布尔:宿主本来就知道正在
 * 缩放哪条边,而「哪条边 -> 哪个方向」两边都不该自己发明一套 —— 这里直接用 CSS
 * 那套光标名字,宿主那边是从窗口系统读来的,多半本来就是这几个词。
 *
 * 两条路通向同一族状态,而且**同一套优先级**:外部打开的和手上按着的一样,
 * 都排在「问指针底下是什么」前面。
 *
 * ── 和加载态的关系 ──
 *
 * 加载态优先。它在等的时候这边让开,而且是**收回去让开**:直接藏掉会留下一帧断层,
 * 等它自己收完又要 400ms,所以给了一条更短的时间常数(YIELD_TAU),趁加载态那
 * 140ms 的宽限期先把自己收成一个球。
 *
 * ── #latex-ball 什么时候交回 ──
 *
 * 开着状态时那颗球必须藏起来:可点击那坨虽然中心是实的,但边缘有时比球还窄;
 * 不可点击更是在正中间空着一个洞,球会从洞里露出来。
 *
 * 交回的时机是 q 落到 GIVE_Q 以下,不是等状态结束 —— 球本身带着 120ms 的
 * opacity 过渡(那是给指针离开文档用的),等到最后才放开,会看见它半透明地淡进来。
 * 在 q<GIVE_Q 放手,那会儿液体已经盖住中心了,球就在它底下淡回来,看不出过程。
 *
 * 直接交接那一段要**两格一起看**(q 和 qOut):刚开始时新的那一格 q 还在 0 附近,
 * 按它一个算就是「可以交回了」,可那一刻旧的那一格正盖在中心上 —— 球在这中间露一下
 * 头,比不交接还难看。
 */
(function () {
    "use strict";

    const CFG = {
        /*
         * q 小到这个程度就当状态结束了。不能取 0:一阶滤波只会无限逼近,永远到不了。
         *
         * 取这么小是因为它**同时**决定了交回 #latex-ball 那一下差多少:q=0.015 时
         * 形状还比球胖 0.15px,q=0.03 时已经胖 0.3px。多等的那 100ms 看不出来,
         * 交接时那 0.15px 也看不出来 —— 但少一点总归好一点。
         */
        EPS: 0.015,
        // 低于这个 q 就把 #latex-ball 放开(见文件头)。这个数是从形状上定的:
        // 不可点击在 q≈0.4 中心才合上,留足余量。
        GIVE_Q: 0.28,
        // 被加载态插队时的收拢时间常数。要短:加载态 140ms 后就亮相了。
        YIELD_TAU: 50,
        /*
         * 直接交接里,退场那一格 q 落到这里就摘掉(见 tick 里那段)。
         *
         * 为什么不是等到 EPS:退场那一格按**自己**的速度收(元素状态 130ms),收到 EPS
         * 要 545ms —— 后面三百多毫秒它只是几颗球叠在原点,早被新的那一格盖住了,画面上
         * 一点不差,帧里却还挂着它。而每种形状在 q≤0.2 上都缩回了一颗球的样子(外沿最多
         * 比球大 3px:可点击那一坨 13→17.6、缩放 13→22.7、那一摊 13→21.9)。
         *
         * 摘的那一下看不看得出来,量的是「它还给画面添了多少」= 整帧和只有新那一帧的
         * 差集(test_hover 里那两把尺子会把这个数印出来):
         *
         *   按下这一趟:qOut=0.21 时 0.7px² —— 摘掉等于没摘。
         *   松手这一趟:78px² —— 这一头大得多,原因在**新的那一格有凹口**:可点击那一坨
         *   是六个球攒的,轮廓最浅处才 8.07px,而旧的那一摊收到球线以下时还是一整颗
         *   13px 的球,把那几个凹口填着,摘掉就是凹口露出来。
         *
         * 要把松手这 78px² 也弄成 0,只有让旧的那一格**缩着**化掉、不是原地消失。试过,
         * 两条路都不好:缩得快,那一帧自己就跳 400px²/帧(比要消的 78px² 还大);缩得慢,
         * 它就在画面上多挂一百多毫秒。而这一下落在松手那 508px²/帧 的收拢之后 50ms ——
         * 那会儿本来就在动,先记在这儿。
         *
         * 别取太大:q 还在 0.5 上的时候旧那一格的边是**露在**新的外面的(新的那一刻才长了
         * 一半),摘早了就是硬切。
         */
        OUT_DROP_Q: 0.2,
    };

    /*
     * 意图 -> 一格(形状 + 方向 + 画法)。一张表说完。
     *
     * 以前是分两处的:一张映射表,画的时候再用一个二路三元表达式挑采样函数。
     * 加第三种状态时那个表达式就是个陷阱 —— 它只有「是 burst」和「不是 burst」
     * 两条路,新状态会被**静默地**按 viscous 画出来,还没有任何报错:指针照样
     * 跟着动、照样变形,只是形状不是它该有的那个。值和画法本来就绑在一起,
     * 分成两处迟早漂,所以并成一张 —— 加一行就必须同时交出这两样。
     *
     * 每一格有五样东西:
     *   key     状态机认的**身份**。形状一样就该相等(not-allowed = no-drop;
     *           ew-resize = col-resize;grab = pointer),方向不同就不相等
     *           (resize:0 ≠ resize:90)。相等 = 换过去不跳、不收拢;
     *           不等 = 先收拢到 q≈0 再换形。
     *   name    对外报的名字,也是清单上那一行的名字。
     *   axis    线的方向(度),null 表示这一格不是线。按下时靠它认「按的是哪条边」。
     *   hold    按下能锁住形状(只有拖动缩放那一族)。
     *   noPress 按下时**不换**成点击特效(见上面那一节,只有那三族)。
     *   fast    进出用它自己那一组更短的时间常数(只有点击特效那一格)。
     *   draw    拿什么画。
     *
     * 拖动缩放那一族不在这里手写:值是引擎的 RESIZE_AXIS 里的,逐个长出来。
     * 「哪几个值属于这一族、各自朝哪儿」只有那一处定义 —— 在这里再抄一份的话,
     * 以后往那边加一个值(比如 n-resize),这边就会**静默地不认它**。
     */
    const INTENT = {
        pointer: { key: "viscous", name: "viscous", axis: null, draw: (fx, te, q) => fx.sampleViscous(te, q) },
        // 可抓取 = 可点击同一个形状。用户的原话是「可抓取的效果用可点击特效」——
        // 所以连 key 都用同一个:两族之间来回换(可点击的块挨着可拖的块)不该收拢
        grab: { key: "viscous", name: "viscous", axis: null, draw: (fx, te, q) => fx.sampleViscous(te, q) },
        "not-allowed": { key: "burst", name: "burst", axis: null, noPress: true, draw: (fx, te, q) => fx.sampleBurst(te, q) },
        "no-drop": { key: "burst", name: "burst", axis: null, noPress: true, draw: (fx, te, q) => fx.sampleBurst(te, q) },
        // 文本那条也是线,但方向不由值决定(只有竖的一种),所以不留 axis ——
        // axis 的含义是「按下这条边能锁住方向」,文本不该进那套逻辑
        text: { key: "beam", name: "beam", axis: null, noPress: true, draw: (fx, te, q) => fx.sampleBeam(te, q) },
        // 放大缩小:和拖动缩放那条线一样,一族一个名字、方向进 key ——
        // 所以从 zoom-in 划到 zoom-out 要先收拢一次再长出来(散开的一圈和收拢的
        // 一圈在 q=1 时确实不是一个样子),而值和值之间同一方向就直接换、不收。
        "zoom-in": { key: "zoom:in", name: "zoom", axis: null, draw: (fx, te, q) => fx.sampleZoom(te, q, "in") },
        "zoom-out": { key: "zoom:out", name: "zoom", axis: null, draw: (fx, te, q) => fx.sampleZoom(te, q, "out") },
    };

    /*
     * 按下时的形状 —— 引擎里叫 splat(俯视:一摊圆的液体摊开,就一整片)。
     *
     * 单独提出来当一个常量,是因为它有**两个来源**:一个是「手按着」(全局,和指针
     * 底下是什么无关),一个是三个声明的值(grabbing / move / all-scroll)。两个来源
     * 该落到**同一个对象**上 —— 落在两个对象上就得靠 key 相等去认,而这里连 key 都
     * 不必比:同一个对象,stateE === wanted,换形逻辑一步都不会触发。
     */
    const PRESS = {
        key: "splat", name: "splat", axis: null, fast: true,
        draw: (fx, te, q) => fx.sampleSplat(te, q),
    };
    INTENT.grabbing = PRESS;
    INTENT.move = PRESS;
    INTENT["all-scroll"] = PRESS;

    /*
     * 拖动缩放那一族。值 -> 度数从引擎读;认不到引擎(这一页根本没装主题)就一格
     * 都不认 —— 于是那几块会落到「画不出来就让位」那条路上去,原版鼠标出来,
     * 这恰好是引擎不在时该有的样子。
     */
    const RESIZE_AXIS = (window.CursorFX && window.CursorFX.RESIZE_AXIS) || {};
    for (const v of Object.keys(RESIZE_AXIS)) {
        const deg = RESIZE_AXIS[v];
        INTENT[v] = {
            key: "resize:" + deg,
            name: "resize",
            axis: deg,
            value: v,
            // 按住能锁住形状的只有这一族 —— 文本也是线,但不该按一下就锁住
            hold: true,
            draw: (fx, te, q) => fx.sampleResize(te, q, deg),
        };
    }

    /*
     * 给外面看的那份映射(值 -> 状态名),从上面那张表推出来,不另写一份。
     * 还要一张「哪些值在哪条轴上」—— 校验脚本要能一条一条对着验方向。
     */
    const MAP = {};
    const AXIS = {};
    for (const k of Object.keys(INTENT)) {
        MAP[k] = INTENT[k].name;
        if (INTENT[k].hold) AXIS[k] = INTENT[k].axis;
    }

    function entryFor(value) {
        return (value && INTENT[value]) || null;
    }

    /*
     * CSS 的光标关键字全表。它回答的是**「这是不是一个标准光标关键字」**,不是
     * 「我们画不画得出来」—— 后者由上面那张 INTENT 回答(认领了就不让位)。
     * 两个问题分开之后,往 INTENT 里加一个值(比如这次的 grab / zoom-in)就不用
     * 回来动这张表;这张表只随 CSS 规范变。
     *
     * 写全是为了**可判定**:只列我们自己想到的那几个的话,一个没列到的值会被当成
     * 「元素没提要求」,于是原版鼠标不出来,而我们又没画 —— 那正是让位这条规矩要
     * 消灭的情况。
     *
     * auto / default / none 不在表里:它们的意思是「随大流」,不是「要一个箭头」。
     * 这台主题的默认样子就是那颗球,所以遇到它们照旧藏原版鼠标。
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

    const root = document.documentElement;
    const reduceMotion = typeof matchMedia === "function"
        && matchMedia("(prefers-reduced-motion: reduce)").matches;

    let want = null;        // 指针底下此刻想要的那一格(INTENT 里的一行);null = 没有
    let hoverEl = null;     // 指针底下那块元素(按下时也在更新,只是那时我不看它)
    let hoverValue = "";    // 那块元素声明的 --cursor 原文(让位那条规矩要靠它,靠的是值不是状态)
    let heldEntry = null;   // 手上正按着的那一格 —— 连同它的方向,不是「按住了」这四个字
    /*
     * 宿主从外面把缩放打开(见文件头的「浏览器之外」)。
     *
     * 为什么记的是**一格**而不是一个布尔:方向上,横着按和竖着按是两个形状,
     * 只记「开着」的话就没法知道该画哪条。宿主报的是值名(ew-resize ...),
     * 这里换成同一张表里的那一格,于是外面进来和里面按下的走的是同一条路。
     */
    let externalEntry = null;
    let pressing = false;   // 手此刻按着没有(点在哪块上不影响:按下的形状是全局的)
    let realCursorValue = ""; // 此刻让位给原版鼠标的那个值("" = 没让位)
    let stateE = null;      // 正在演的那一格(收拢到 EPS 之前一直记着)
    let q = 0;              // 在场程度
    /*
     * 直接交接时**正在退场**的那一格,连同它的在场程度。
     *
     * 只在「换形的两头里有一头是点击特效」那一小段里非空(见文件头),而且它是一个
     * 单槽:同一瞬间只可能有一格在退场。交接又叠上交接(按下、松开、再按下)时旧的
     * 那一格直接让位给新的 —— 它那点残形早就被新的这一摊盖住了,留着反而要同时画
     * 三帧。收干净(qOut ≤ EPS)就置回 null,和 stateE 是两回事:stateE 是「现在是哪
     * 一格」,outE 是「刚才那一格还没散完」。
     */
    let outE = null;
    let qOut = 0;
    let te = 0;             // 液体自己的时间(只用来喂蠕动/呼吸的相位)
    let layer = null;
    let layerUp = false;    // 图层此刻是不是显示着
    let holdsBall = false;  // 此刻 #latex-ball 是不是被我们藏起来了
    let raf = 0;
    let lastNow = 0;

    /*
     * 已经交还过系统光标了(见 ball.js 里的 handBack 和下面的 handBack)。
     * 两种来路:别处出错、ball.js 运行中叫停;或者交还发生在**这个文件加载之前**,
     * 根上已经挂着 cursor-off —— 那会儿没人叫得着我,自己看一眼就别接手。
     */
    let dead = root.classList.contains("cursor-off");

    /*
     * 时间常数两问两答,别合并 —— 这两个问题不是一回事。
     *
     * 一、**这一趟**用哪一组(taus,算 base 用):进来的那一格得在同一个瞬间长起来。
     * 按下和松手都是一下撞击,新的形状要跟上这一趟里最快的那一格 —— 所以「在场的、
     * 要来的、正在退场的」三头里只要有一头是点击特效,这一趟就用短的那组。这一条从
     * 点击特效做出来那天就是这样,一步没改过:同一件事(按下去再松开)在空白处和在
     * 一块可点的元素上,点击特效那一格的速度是同一个。
     *
     * 二、**退场那一格自己**收得多快(taus 只传它一格,算 outE 用):不跟这一趟,
     * 跟自己 —— 它是在被吸收,不是在退场(见文件头「直接交接」那一段)。
     *
     * 第二条改过一次,记下来免得倒回去。以前退场的也跟这一趟,于是「按下」这一格
     * 的 35ms 把底下那一坨也拽着一起急收,画面上就是「那一坨先缩一下、再摊开」——
     * 正是用户不要的那一下。让它按自己的 130ms 收,实测按下这一趟:单帧翻黑量是空白处
     * 按下的 1.02 倍(两头都用短的那组是 1.20 倍 —— 交接反倒比不交接更跳,那显然错了),
     * 全程离「一颗普通球」也更远(最近 127px² vs 99px²)。慢一点收反而更看不出来,
     * 因为新的那一摊已经把它盖住了。
     */
    function taus(entryA, entryB, entryC) {
        const c = window.CursorFX && window.CursorFX.CFG;
        if ((entryA && entryA.fast) || (entryB && entryB.fast) || (entryC && entryC.fast)) {
            return {
                in: c ? c.PRESS_IN_TAU : 45,
                out: c ? c.PRESS_OUT_TAU : 35,
            };
        }
        return {
            in: c ? c.STATE_IN_TAU : 90,
            out: c ? c.STATE_OUT_TAU : 130,
        };
    }

    function loadingBusy() {
        const lw = window.LoadingWatch;
        return !!(lw && typeof lw.busy === "function" && lw.busy());
    }

    function setBallHidden(v) {
        if (v === holdsBall) return;
        holdsBall = v;
        root.classList.toggle("is-hover-state", v);
    }

    /*
     * 问一个元素声明了哪种光标 —— 报的是**原文**,不是状态。
     *
     * 报原文是因为「认不认这个值」有两个用处:一是挑哪一格去画,二是决定要不要
     * 把原版鼠标让出来。后者要的正是原文(哪个值),光有「认不到」这一个布尔
     * 是不够的:认不到的时候得知道该把哪个光标放出来。
     *
     * 先看 --cursor,空了或者还是 auto 再回落到真的 cursor —— 后者在藏了光标的页面上
     * 必然是 none,于是自然得到「这个元素没要求」。
     */
    function rawIntent(el) {
        if (!el || el.nodeType !== 1 || typeof getComputedStyle !== "function") return "";
        try {
            const cs = getComputedStyle(el);
            let v = (cs.getPropertyValue("--cursor") || "").trim();
            if (!v || v === "auto") {
                const c = cs.cursor;
                v = c && c !== "auto" && c !== "none" ? c : "";
            }
            /*
             * 只认标准关键字。别的字符串(引用方自己编的值、写错的拼法)当作
             * 「没提要求」:认领表里每一个值本身就都是标准关键字,所以这一条
             * 不会把该画的值挡掉,只会把说不清的东西挡在外面。
             */
            return REAL_CURSORS.has(v) ? v : "";
        } catch (err) {
            return "";
        }
    }

    /*
     * 此刻想要哪一格。按顺序问三件事:
     *   1. 手上按着缩放边没有(自己按下的,或者宿主从外面打开的)—— 按着就是
     *      拖动缩放,指针底下是什么都不看(这一格是**锁住**的,所以排第一);
     *   2. 手按着没有 —— 按着就是点击特效,同样不看指针底下是谁;
     *   3. 否则看指针底下那块元素声明了什么。
     *
     * 第 2 步要看一眼 hovering 那一格是不是 noPress:文本、不可点击、拖动缩放
     * 这三族「按下」本来就另有含义,不该被点击特效盖掉(理由是文件头那一节)。
     *
     * 「算」和「比」分成两步,是因为这几个输入(指针在哪、按没按)各自独立地变,
     * 而循环只在结果真的变了的时候才需要被叫起来。
     */
    function wantNow() {
        if (reduceMotion) return null;
        const hovering = entryFor(hoverValue);
        if (heldEntry) return heldEntry;
        if (externalEntry) return externalEntry;
        if (pressing && !(hovering && hovering.noPress)) return PRESS;
        return hovering;
    }

    /*
     * 原版鼠标该不该露面。
     *
     * 判据只看一件事:此刻**有没有形状要画**。有(不管是按着的、宿主开的,还是
     * 指针底下这块要的)就继续藏着;没有、而元素又明确要了一个我们画不出来的
     * 标准光标,就把那个光标放出来 —— 让位。
     *
     * 点击特效不参与这一条:按下的形状是**动作**不是声明,元素要的那个光标并没有
     * 因为被按了一下就变了。所以按在一块 crosshair 上,原版十字照旧露着,底下多
     * 一摊化开的液体 —— 和「球留着」那件事是同一个取舍(用户选的那一个)。
     *
     * 注意用的不是「认不到」,而是「认不到**而且**它要的是一个真光标」:
     * 一块没提要求的元素(auto / 空的)照旧藏原版鼠标,因为那种情况下我们有东西
     * 要画(那颗球)。这两件事以前是一回事,现在分开了。
     */
    function handOverValue() {
        if (reduceMotion) return "";
        if (heldEntry || externalEntry) return "";
        if (entryFor(hoverValue)) return "";
        return REAL_CURSORS.has(hoverValue) ? hoverValue : "";
    }

    /*
     * 把上面那个结论落到 DOM 上。让位靠一个类 + 一个自定义属性,不是逐元素改
     * 样式:类挂一次,以后指针怎么动都不用再碰样式表(见 skin-ui.css 那条规则)。
     */
    function setRealCursor(v) {
        if (v === realCursorValue) return;
        realCursorValue = v;
        /*
         * 让位结束的时候要把属性**摘掉**,不能只把类撤了:留着的话 documentElement
         * 上就挂着一个过期的 --real-cursor,任何以后想读这个属性的东西(调试、
         * 宿主、截图脚本)都会看到一个「刚才那个值」。类才是开关,但属性是事实 ——
         * 不用的东西就别留在 DOM 上。
         */
        if (v) root.style.setProperty("--real-cursor", v);
        else root.style.removeProperty("--real-cursor");
        root.classList.toggle("show-real-cursor", !!v);
    }

    function applyRealCursor() {
        // 交还之后这一条也得跟着关:指针离开文档、或者还有一格没收干净的时候,
        // 它会再把「让位」那个类挂回去 —— 那会儿我们已经在往回还指针了,
        // 不能再由这边往根上加东西
        if (dead) { setRealCursor(""); return; }
        setRealCursor(handOverValue());
    }

    function syncWant() {
        const next = wantNow();
        /*
         * 让位每次都要重算,不能只在 want 变了的时候算:它同时还取决于
         * hoverValue,而 hoverValue 可以在 want 一点都不变的情况下变(从一个
         * help 元素移到一块没提要求的元素上,null → null)。
         */
        applyRealCursor();
        if (next === want) return;
        want = next;
        start();
    }

    function setWant(el) {
        if (dead) return;
        hoverEl = el;
        hoverValue = rawIntent(el);
        syncWant();
    }

    function ensureLayer() {
        if (layer) return layer;
        if (!window.CursorFX || !window.CursorFX.createLayer) return null;
        layer = window.CursorFX.createLayer();
        layerUp = false;
        return layer;
    }

    function showLayer(v) {
        if (!layer || layerUp === v) return;
        layerUp = v;
        layer.shown(v);
        layer.fx.setVisible(v);
    }

    function start() {
        if (dead || raf) return;
        lastNow = 0;
        raf = requestAnimationFrame(tick);
    }

    function stop() {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        lastNow = 0;
        stateE = null;
        q = 0;
        // 退场的那一格和当前这一格一起清 —— 下一趟从零开始,不许带着上一趟的残形
        outE = null;
        qOut = 0;
        setBallHidden(false);
        showLayer(false);
    }

    /*
     * 把系统光标还回去 —— 见 ball.js 里那段长注释(为什么要还、边界在哪)。
     * 这一层要做的是「把自己从页面上抹掉」:停状态机、放开球、撤销让位、把图层拆了。
     * dead 之后 syncWant / setWant / tick / refresh / 两个宿主入口全都不接手,
     * 所以下一个 pointerover 也点不着它。
     *
     * 用 stop() 而不是重写一遍:那件事(收形、放球、藏图层)已经有一份,
     * 差别只在「还回原版鼠标」和「拆图层」这两步 —— 交还之后不会再有人给它写位置,
     * 留着一个固定不动的壳挂在 DOM 上没意义。
     */
    function handBack() {
        if (dead) return false;
        dead = true;
        stop();
        setRealCursor("");
        if (layer) { layer.destroy(); layer = null; layerUp = false; }
        return true;
    }

    function tick(now) {
        if (dead) { raf = 0; return; }
        const dt = lastNow ? Math.min(64, now - lastNow) : 16.7;
        lastNow = now;
        te += dt;

        // 指针还没出现过就没有地方可画;加载态在等的时候这边让位
        const c = window.cursorState;
        const busy = loadingBusy();
        const wanted = (busy || !c || !c.visible) ? null : want;

        /*
         * 换形只能在 q≈0 那一帧做 —— 那一帧什么状态都是同一颗球。
         *
         * 判据是 **key**,不是这两个对象本身。同一格身份下的两个值(ew-resize 与
         * col-resize、not-allowed 与 no-drop)形状一模一样,只是声明它的那个值换了
         * 名字 —— 按对象比会判成「换了形」,于是白收拢一次再长回来,而那一闪没有任何
         * 理由。key 就是为这件事定的(见 INTENT 上面那段),这里必须按它比。
         */
        const sameShape = !!stateE && !!wanted && stateE.key === wanted.key;
        /*
         * 直接交接:换形的两头里有一头是点击特效(见文件头「点击特效」那一节)。
         *
         * 这时**当场换**,不等 q≈0 —— 而旧的那一格不许扔,记进 outE 里接着往下画。
         * q 交回 0 是给新那一格用的:每一格进出都是「从一颗球长起来」这条路线,它不
         * 例外。旧的那一格从它**此刻**的 q 开始收,于是画面上那一摊是接着刚才那一帧
         * 往下走的:旧的在散、新的在摊,中间没有一颗普通球。
         */
        const direct = !sameShape && !!stateE && !!wanted
            && (stateE === PRESS || wanted === PRESS);
        if (sameShape) {
            // 同一格身份:直接换上新的那份(画法等价),q 一动不动
            stateE = wanted;
        } else if (direct) {
            outE = stateE;
            qOut = q;
            stateE = wanted;
            q = 0;
        } else if (q <= CFG.EPS && wanted) {
            stateE = wanted;
        }

        /*
         * 这一趟用哪一组:在场的、要来的、正在退场的那一格,谁带 fast 就算谁的
         * (见上面 taus 那段)。outE 也要传 —— 松手那一刻它才是「点击特效那一格」,
         * 不传的话这一趟会被当成普通形变,新形状要用 90ms 才长回来。
         */
        const tau = taus(stateE, wanted, outE);
        let target;
        let base;
        if (stateE && wanted && stateE.key !== wanted.key) {
            target = 0;                 // 换形:先收拢,收完下一帧再长出来
            base = tau.out;
        } else if (wanted) {
            target = 1;
            base = tau.in;
        } else {
            target = 0;
            base = busy ? CFG.YIELD_TAU : tau.out;
        }
        q += (target - q) * (1 - Math.exp(-dt / base));
        /*
         * 退场那一格走同一套一阶滤波,只是目标是 0,速度是**它自己**收场那个速度
         * (只传它一格,不跟这一趟)。所以交接只是把「先收完再换」压成「一边收一边换」,
         * 没有加快任何一步 —— 反倒让它在被盖住的时候慢慢化掉,而不是急收。
         *
         * 摘掉的线不是 CFG.EPS:按自己的 130ms 收,收到 EPS 要 545ms,后面那三百多
         * 毫秒里它只是几颗球叠在原点 —— 早被新的那一格盖住了,画面上一点不差,帧里
         * 却还挂着它。收到 OUT_DROP_Q 就摘(那个数怎么定的见 CFG)。
         */
        if (outE) {
            qOut += (0 - qOut) * (1 - Math.exp(-dt / taus(outE).out));
            if (qOut <= CFG.OUT_DROP_Q) { qOut = 0; outE = null; }
        }

        /*
         * 加载态的图层已经接管指针了(is-loading 是它在挂的)。
         *
         * 这一刻必须立刻停手:位置上是同一个点,两层液体同时画就是两块黑影叠在一起。
         * 球的归属不用管 —— is-loading 那条规则自己会把 #latex-ball 藏起来。
         * 这边只是把 q 继续往 0 推,推到头就自然收工;加载态收完会回调 refresh() 把它接回来。
         */
        const handedOver = root.classList.contains("is-loading");
        const live = q > CFG.EPS || qOut > CFG.EPS;
        if (live && !handedOver) {
            const l = ensureLayer();
            if (l && c) {
                l.place();
                showLayer(true);
                l.fx.setPressed(c.press > 0.5);
                /*
                 * stateE 一定带画法 —— 它只可能是 INTENT 里的一格(或者 null)。
                 * 真要是漏了,宁可这一帧不画,也不要随便挑一个形状糊上去:
                 * 画错的形状比不画更难发现。
                 */
                if (stateE && stateE.draw) {
                    const f = stateE.draw(window.CursorFX, te, q);
                    /*
                     * 直接交接:两帧的球接成一帧交出去。谁先谁后无所谓(画出来是并集,
                     * 池子里的槽只是序号),退场那格放前面是因为它先存在。
                     *
                     * 图层只吃 `.balls` 这一栏(cursor-fx.js 的 setLiquid → paint),
                     * 所以这里不必先问引擎要一个「两摊东西」的帧类型 —— 引擎那边
                     * 一个字的改动都不用。
                     */
                    l.fx.setLiquid(outE
                        ? { balls: outE.draw(window.CursorFX, te, qOut).balls.concat(f.balls) }
                        : f);
                }
            }
        } else if (handedOver) {
            showLayer(false);
        }

        /*
         * 球什么时候可以露面:意图没了、而且已经收得差不多了。
         *
         * 注意这里不是「有没有在画」—— 换形途中 q 会落到 EPS 以下(那一刻两个状态
         * 是同一颗球,才好在那一帧换),那一帧按「有没有在画」算就会把球放开,
         * 下一帧又藏回去,白闪一下。判据得只看意图:意图还在,球就一直归液体管。
         *
         * 退场的那一格也算在里面:直接交接的头几帧新的那一格 q 还在 0 附近,只看它
         * 的话这一帧就算「收得差不多了」,而那一刻旧的那一格正盖在中心上 —— 球一露头
         * 就是一下白闪(还要再藏回去)。它散完之前球都归液体管。
         */
        setBallHidden(!!wanted || q > CFG.GIVE_Q || qOut > CFG.GIVE_Q);

        if (!live && !wanted) { stop(); return; }
        raf = requestAnimationFrame(tick);
    }

    /*
     * 指针落在哪一块上,靠 pointerover / pointerout 判定,不在 pointermove 里每帧问
     * (那要每帧一次 getComputedStyle)。out 的时候用 relatedTarget —— 那是「正要去的那块」,
     * 比再查一次 elementFromPoint 准,也省一次命中测试。
     */
    document.addEventListener("pointerover", (e) => setWant(e.target), { passive: true, capture: true });
    document.addEventListener("pointerout", (e) => setWant(e.relatedTarget), { passive: true, capture: true });

    /*
     * 拖动缩放的按下/松开。
     *
     * 判据是「这一按**落在缩放边/角上开始的**」,不是「指针现在是按下态」——
     * 后者会把选字、按按钮也当成拖动,而它们各自该有自己的样子。所以只在按下
     * 那一下问一次,认准了才记下那一格;之后指针划过谁都不管,直到松手。
     *
     * 记的是那一格而不是「按住了」:左右边是 0°、上下边是 90°,同一族但形状不同。
     *
     * 松手时用事件自带的 e.target,而不是 elementFromPoint 再问一次:松手那一下
     * 指针在哪,事件里就有,省一次命中测试,用的也和 pointerover/pointerout
     * 是同一份素材。
     */
    document.addEventListener("pointerdown", (e) => {
        /*
         * 按下去同时发生两件事,互不相干:
         *   1. 点击特效 —— 只要按了就换形状,和按在哪一块上无关(例外见 wantNow);
         *   2. 落在缩放边/角上才开始的那一格 —— 认准了才记,记的是**哪一格**
         *      (左右边 0° 和上下边 90° 是两个形状)。
         * 就算认不出第 2 件,第 1 件照样成立。
         */
        pressing = true;
        const entry = entryFor(rawIntent(e.target));
        if (entry && entry.hold) heldEntry = entry;
        syncWant();
    }, { passive: true, capture: true });

    document.addEventListener("pointerup", (e) => {
        if (!pressing && !heldEntry) return;
        pressing = false;
        heldEntry = null;
        setWant(e.target);
    }, { passive: true, capture: true });

    // 指针被系统抢走(触屏滚动手势、右键菜单之类)时也得松手,
    // 否则光标会一直按着,而且再也不会自己放开
    document.addEventListener("pointercancel", () => {
        if (!pressing && !heldEntry) return;
        pressing = false;
        heldEntry = null;
        syncWant();
    }, { passive: true, capture: true });

    /*
     * 换页之后补一次。
     *
     * pointerover 只在指针**动**的时候才发:如果换页把一块可点的元素正好推到静止的指针底下,
     * 一个事件都不会来,状态就永远不出现。main.js 每次 renderPage 之后会调一下这个,
     * 用 elementFromPoint 问一次指针底下现在是谁。
     */
    function refresh() {
        const c = window.cursorState;
        if (!c || !c.visible || typeof document.elementFromPoint !== "function") return;
        // 先把 want 清掉,强制重新解一次 —— 元素多半没变,但中间可能被加载态打断过,
        // 那会儿 want 一直被记着,不强制的话 setWant 会以为「还是老样子」而不肯重新开始
        want = null;
        setWant(document.elementFromPoint(c.x, c.y));
    }

    // 指针移出文档:球本来就会淡出,液体也得跟着走,不然窗口边上留着一坨在动。
    // 人也算出文档了,所以这一按不再算数 —— 不然拖到窗口外松手,回来还按着
    root.addEventListener("pointerleave", () => {
        hoverEl = null;
        hoverValue = "";
        heldEntry = null;
        // 按着不放拖出文档也算松手:外面那一下松手收不到事件,不清的话
        // 回来还是一摊按着的液体,再也弹不回来(和 heldEntry 同一个理由)
        pressing = false;
        /*
         * 宿主说「正在缩放」的时候不算数 —— 缩放窗口本来就会把指针带出页面,
         * 甚至带出浏览器窗口,那正是这个状态该在的时候。整站那条「离开文档就
         * 当作什么都没发生」的约定在这儿让位:这种情况下不是没人管,是换了个
         * 更知道情况的人来管。
         */
        if (externalEntry) { syncWant(); return; }
        want = null;
        applyRealCursor();
        if (raf) stop();
    });

    /*
     * 宿主从外面开关缩放的那道口子。见文件头「浏览器之外」。
     *
     * 语义只有一句:开着的时候,形状就是拖动缩放(朝宿主说的那条边),指针底下
     * 是什么都不看,和手上按着完全同级 —— 关掉之后当作没这回事,指针底下是谁,
     * 形状就是谁。
     *
     * 认不出来的值**不改动现状**(宁可不动,也不要按一个猜的方向画):报回此刻
     * 真正在用的那个值,宿主自己不放心就对着看一眼。传 falsy 表示关掉。
     *
     * 它**不碰 heldEntry**:那是「这一按落在缩放边上开始的」,由指针事件自己维护。
     * 两个各管各的,合起来在 wantNow() 里判一次 —— 外面开的和手里按着的不该互相
     * 把对方清掉(缩放窗口时松手,不该顺手放开手里按着的那条边)。
     */
    function setResize(v) {
        if (dead) return false;
        const next = v ? entryFor(String(v)) : null;
        if (v && !(next && next.hold)) {
            return externalEntry ? externalEntry.value : false;
        }
        if (next === externalEntry) return next ? next.value : false;
        externalEntry = next;
        syncWant();
        return next ? next.value : false;
    }

    window.HoverWatch = {
        CFG,
        MAP,
        // 值 -> 度数。校验脚本按它逐个验方向,展示页按它列「现在支持哪几种」
        AXIS,
        // 认领表整张报出去:测试要能查「每一格都真的有画法」,两件事都不该各抄一份值列表
        INTENT,
        // 标准光标整表也报出去:让位那条规矩要能验 —— 展示页上「画不出来」的那几块,
        // 声明的值必须真的在表里(否则它们根本不会让位,而是被当成「没提要求」);
        // 而表里必须**没有** auto / default / none(它们是「随大流」,不是「要个箭头」)
        REAL_CURSORS,
        refresh,
        setResize,
        /*
         * 把系统光标还回去(整套退场,不再接手)。两个来路:
         *   - ball.js 的 handBack():脚本抛错了,它负责叫停这台主题上所有模块;
         *   - 宿主自己叫:主题跑到浏览器之外去的时候,宿主知道什么时候该关掉
         *     (见 cursor-beyond-browser 那条)。
         */
        handBack,
        // 给测试用。te 也报出去:校验脚本要能不靠猜地重算当前这一帧
        // (帧必须是引擎的输出,不能是这边另画的一份)
        _debug: () => ({
            want: want ? want.name : "", wantKey: want ? want.key : "",
            state: stateE ? stateE.name : "", stateKey: stateE ? stateE.key : "",
            axis: stateE ? stateE.axis : null,
            hoverValue, held: !!heldEntry, heldKey: heldEntry ? heldEntry.key : "",
            pressing,
            externalResize: externalEntry ? externalEntry.value : "",
            realCursor: realCursorValue,
            q, te, holdsBall,
            // 正在退场的那一格(直接交接,只有点击特效那一趟会非空)
            out: outE ? outE.name : "", outKey: outE ? outE.key : "", qOut,
            raf, layer: !!layer, skipped: reduceMotion, dead,
        }),
        _setWant: setWant,
    };
})();
