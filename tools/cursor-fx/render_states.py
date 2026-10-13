#!/usr/bin/env python3
"""校验并渲染 cursor-fx 的元素状态:可点击(粘稠)/ 不可点击(四散)/ 文本(两颗球 + 一丝)/ 一条线(拖动缩放)。

和 render_frames.py 用同一套 goo 复现(直接 import),所以「校验脚本画的」
和「浏览器里看到的」是同一个东西,不存在这边绿那边不绿。

这边要验的事,全部对着用户的原话:
  可点击  —— 「像粘稠液体般化开,但依然在中心聚拢,只是边缘不规则蠕动」
              → 中心必须始终被盖住;渲染出来必须**只有一坨**;边缘在动且不圆。
  不可点击 —— 「中心一定要空白,向外四散成很多小液滴,到外层又被拽住」
              → 中心必须**始终空着**;渲染出来必须是**很多块**;外沿有界、还在呼吸。
  文本    —— 老口径是「还是像液体一样,化成液体但是被力聚合为一个竖线」,它就是
              「一条线」的 90° 那一格。2026-09-18 用户改了口径:
              「文字的修改一下,改成两个小球,中间有些距离,中间有液体藕断丝连」,
              再说一句「球离的更开一点」。
              → 两句话各验一半,少一半都分不开:
                两**颗**球 —— 沿竖轴的宽度剖面必须**两头粗、中间细**。这条只能由
                  剖面来说:外接矩形分不出「腰鼓」和「同高同宽的直棒」(两条一模一样),
                  而「一根棒子」正是这次要否掉的东西。
                **一丝连着** —— 渲染出来必须是一**块**(断成两块就是两颗球,
                  不是「藕断丝连」),而且腰得**比链子地板粗**(理由见下)。
              量化的那一套是 axis_profile:两头(上下各 1/5)最粗 12.25–12.50px
              (球宽 26px,也就是 0.48 球)、腰(中间 ±1/10)最细 5.00–5.50px、
              细/粗 0.40–0.44。判据怎么把这些数变成四道门,见「=== 判据 ===」
              里 beam 那一段的开头(那一段里还并排放着「一颗球 / 一根直棒 / 两球断开」
              在同一个尺子下的数,说明每道门槛各拦谁)。
              为什么它**不能**用「每团都画得出来」那条:min_visible_r 量的是
              「一枚**孤零零**的圆盘糊完之后还剩多大」= 3.63px,而这一格那 15 团丝
              是**串成一条**的,链子的地板实测只有 2.25px(独立于链长)。丝最细的
              那一团设计上是 2.565px,正落在两条地板**之间** —— 拿孤球那把尺子量它,
              报出来是「有球画不出来」(这一格确实只数得出 2/17),而实际发生的只是
              尺子拿错了:渲染块数恒为 1,那一丝在屏幕上是连着的。所以这一格在那条
              判据上豁免,「连着」改由 comps == 1 和剖面的腰下界来验。
              这个豁免是**有代价**的,写下来:豁免之后「这一格有没有球漏掉」就没人答了
              —— 换来的答案更准,因为「漏没漏」在这一格上问的是「糊完之后还连着吗」,
              而 comps 和腰回答的正是它。
  一条线  —— 拖动缩放:「跟着缩放轴走,含对角」—— 同一次挤压、同一份材料,只是转到
              各自的轴上,所以判据**一套到底**(循环跑,不按名字分岔);往
              RESIZE_AXIS 里加一个方向,这一段自动多验一格。
              从「文本 + 拖动缩放是同一条线」变成「只有拖动缩放是线」这一刀是
              2026-09-18 切的,而分岔靠的是**数据**(文本的帧不再报 deg),不是名单:
              这里、test_hover、dump_states 都没有一处写着「beam 不是线」。
              每条线的长短边都在**它自己的坐标系**里量(bbox_frame):45° 的线用
              轴对齐的框量出来是 27.6 x 27.6,和 26px 的球几乎一样,什么都验不到。
              「太粗太长」那一版被用户否掉之后:面积守恒下 长·短 ≈ 常数,「又细又短」
              光靠挤挤不出来,所以它还得**少带材料**(LINE_MASS);判据里那几条尺寸
              上界就是按改小之后的实测值定的,旧尺寸回来立刻报。
  点击特效 —— 前后换过三版。第一版做成了**侧视**的样子:核摆在一只扁椭圆上
              (横半轴 ≫ 竖半轴)、整摊比指针低 6px。用户看过说「现在是扁扁的形状,
              这不对,应该是圆形的,因为是俯视角度,液体摊开的效果」—— 「扁」和
              「低」都是侧视才有的东西,俯视看下去按下就是**一摊圆的、以指针为中心
              摊开**的液体,所以两条一起拿掉。第二版圆了,但外圈溅着一圈小液滴;
              用户又说不:「去掉那些小液滴,并且摊开的轮廓再放大一点」。
              → 现在验的是四件事:
                  那一摊必须是**圆的**(二阶矩椭圆率;宽高比不算话 —— 上一版外圈
                    那几颗溅出去的液滴会把外接矩形撑满,量出来是「液滴摆没摆齐」);
                  必须**比球大**(轮廓最短方向 + 整体外沿,两个都记);
                  中心一直盖着、整摊坐在指针上(重心没有系统性偏移);
                  **就一整片**(渲染块数恒为 1、球数恒等于核 + 外缘那一圈)。
              四条一起才分得开:只查「中心实」的话,可点击那一坨也过;只查「圆」的话,
              一颗没摊开的球也过;只查「大」的话,不可点击那一圈也过。
              注意最后一条是**反过来的**:上一版这里验的是「外面有 ≥3 颗断开的液滴、
              颗数还在变」,现在验的是「谁也不许散开」。
  放大缩小 —— 「黑球从中心有液体球散开、四周有液体球像中心球聚拢,中心球要比
              默认球小」,而且是**持续的**散射/聚拢(「而不是散射一下就定型了」)
              → 一半是几何:离原点最近的那颗球必须**比 R0 小**(默认球)、就在原点上、
                而且是 q 的单调不增函数(材料只让出去,不收回来)。
                另一半是「一直在动」,这一半才是挨骂那条:光栅上**外沿几乎不动**
                (有滴出生、有滴化掉,最远那颗永远在最远处),所以外沿这个数在这里
                等于什么都没说。真正说话的是**颗数会变**(有生有死;摆成一圈就是
                恒定的一个数)和**同一时刻这几颗散在多宽一条带上**(摆成一圈则全挤在
                同一个半径上)。方向(往外 / 往里)在光栅上分不出来 —— 液滴两端半径
                都是 0,两个方向在任一时刻的滴距集合互为镜像(见下面那段的推导)——
                所以方向交给引擎级判据,这边不假装能量它。
  全部    —— 「结束状态都是重新向内聚拢成黑球」
              → q=0 时必须精确是一颗 R0 的球,和普通光标逐像素一致。

面积守恒仍然按解析算(union_area_exact):光栅化数像素会把小球算胖,
四散状态全是小球,拿它当基准等于自己骗自己。
"""
import json
import math
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from render_frames import goo_mask, union_area_exact, min_visible_r

# 联络表放大倍数。状态本身比环小(外沿最多 31px),所以放大倍数比 render_frames
# 保守一点:5 倍时窗口只有 26.4px,四散状态的液滴会被切在格子外面,看不出全貌。
S = 4
CELL = 288
COLS = 6
BG = (241, 235, 230)
INK = (20, 20, 22)

CHK = 220             # 时间线检查用的窗口
CHK_Z = 4.0


def blob_list(mask):
    """四连通的每一块,返回每块的像素坐标列表(按面积从大到小)。

    components() 和 largest_component() 都要这个结果,而这一趟 BFS 不便宜
    (220×220 的窗口、纯 Python),一帧里跑两遍就白花一倍时间 —— 所以先算一次,
    两件事都从它派生。调用方绝大多数就是 measure(),它在同一帧里两样都要。
    """
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or seen[y0, x0]:
                continue
            q = deque([(y0, x0)])
            seen[y0, x0] = True
            cells = [(y0, x0)]
            while q:
                y, x = q.popleft()
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        q.append((yy, xx))
                        cells.append((yy, xx))
            out.append(cells)
    out.sort(key=len, reverse=True)
    return out


def components(mask, min_px=4):
    """四连通的连通块数量 —— 「很多小液滴」这句话的唯一硬证据。

    小到几个像素的碎屑不算:那是抗锯齿的毛边,不是液滴。
    """
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    n = 0
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or seen[y0, x0]:
                continue
            q = deque([(y0, x0)])
            seen[y0, x0] = True
            size = 0
            while q:
                y, x = q.popleft()
                size += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        q.append((yy, xx))
            if size >= min_px:
                n += 1
    return n


def hole_radius(mask, size, zoom, probe=8):
    """从中心往外走,量到第一圈有黑的地方为止 —— 中心那块空白的半径。

    量的是**渲染结果**不是几何:goo 会把边界往里收,几何上的空 3px
    在屏幕上可能只剩 1px 的可视空白。
    """
    c = size // 2
    free = 0.0
    while free * zoom < size / 2 - 1:
        r = free + 0.5 / zoom
        n = max(8, int(2 * math.pi * r * zoom / 2))
        hit = False
        for i in range(n):
            a = 2 * math.pi * i / n
            x = int(round(c + r * zoom * math.cos(a)))
            y = int(round(c + r * zoom * math.sin(a)))
            if 0 <= x < size and 0 <= y < size and mask[y, x]:
                hit = True
                break
        if hit:
            break
        free = r
    return free


def rim_profile(mask, size, zoom, n=72):
    """沿 72 个方向量最外圈的黑 —— 轮廓的形状。

    这是「边缘不规则蠕动」的量化:同一时刻各方向的半径散开(不圆),
    同一方向在不同时刻又变(在动)。
    """
    c = size // 2
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        ca, sa = math.cos(a), math.sin(a)
        r = 0.0
        last = 0.0
        while r * zoom < size / 2 - 1:
            x = int(round(c + r * zoom * ca))
            y = int(round(c + r * zoom * sa))
            if not (0 <= x < size and 0 <= y < size):
                break
            if mask[y, x]:
                last = r
            r += 0.5 / zoom
        out.append(last)
    return out


def extent(mask, size, zoom):
    ys, xs = np.nonzero(mask)
    c = size / 2
    d = np.hypot(xs - c, ys - c)
    return float(d.max()) / zoom


def bbox(mask, size, zoom):
    """渲染结果的外接矩形,单位 px —— 「一条线」这句话只能由宽高比来判。

    extent 是「最远的那个点离中心多远」,对付一圈一圈的形状够用(所以四散和
    可点击都只用它),但它分不出竖线和横线:两条线的 extent 完全一样。线的状态
    要说的恰恰是「长边 ≫ 短边、而且短边比球还窄」,就得分开量两个方向。
    """
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return 0.0, 0.0
    return float(xs.max() - xs.min() + 1) / zoom, float(ys.max() - ys.min() + 1) / zoom


def moments_ellip(cells, size, zoom):
    """一组像素的二阶矩椭圆率 —— 「圆不圆」这条判据只信它(≈1.00 = 正圆)。

    cells 是**哪一块**的像素坐标(见 blob_list):量的是那一摊本身,不是整张图。

    为什么不看宽高比:上一版那一摊的外沿还甩着几颗溅出去的液滴,液滴一出现就把
    外接矩形撑到极限,宽高比于是变成「液滴摆没摆齐」,不是「那一摊圆不圆」。
    二阶矩对**小**附加量不敏感,但没那么不敏感 —— 一颗 4px 的珠子挂在 1.6 倍
    半径上,实测能把 1.02 顶到 1.31,所以量之前得先挑出那一摊(blob_list 的第 0 块)。
    (液滴后来被用户删掉了,可这套"先挑出那一摊再量"的规矩留着 —— 它就是
    「量的必须是那一摊自己」这句话,和有没有液滴无关。)

    旧那版**扁椭圆**(横半轴 ≫ 竖半轴)在它上面是 1.8 上下 —— 一量就分得开。

    顺带一个好处:那一摊哪天哪一团被 goo 吃掉、或者边上散出碎块,椭圆率立刻涨
    —— 「形状破了」这件事在圆度这条判据上自己就报了。
    """
    if len(cells) < 8:
        return 0.0
    xs = np.array([x for _, x in cells], dtype=float)
    ys = np.array([y for y, _ in cells], dtype=float)
    c = size / 2.0
    x = (xs - c) / zoom
    y = (ys - c) / zoom
    x = x - x.mean()
    y = y - y.mean()
    cxx = float((x * x).mean())
    cyy = float((y * y).mean())
    cxy = float((x * y).mean())
    tr = cxx + cyy
    disc = max(0.0, tr * tr / 4 - (cxx * cyy - cxy * cxy))
    l1 = tr / 2 + math.sqrt(disc)
    l2 = tr / 2 - math.sqrt(disc)
    if l2 <= 1e-12:
        return 0.0
    return math.sqrt(l1 / l2)


def bbox_frame(mask, size, zoom, deg):
    """把光栅坐标**转回线自己的坐标系**再量长短边。

    为什么不能用上面那个:线转到 45° 之后,它的轴对齐外接矩形边长是
    (L + W)/√2 上下 —— 长 30、宽 9 的线在 45° 量出来是 27.6 × 27.6,和一颗
    26px 的球几乎一样。也就是说,判据「长边够长、短边够窄」在 45° 那格会
    变成「≈ 正方形」,什么都验不到 —— 而 45° 恰恰是最该验的那一格。
    所以按 −deg 把每个黑像素的坐标转一下(只转动坐标,不重采样图像,
    于是没有插值带来的模糊),再取轴向范围。deg=90 时和上面那个逐位一致,
    只是长短边对调了名字。
    """
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return 0.0, 0.0
    c = size / 2.0
    a = math.radians(-deg)
    ca, sa = math.cos(a), math.sin(a)
    x = xs - c
    y = ys - c
    u = x * ca - y * sa          # 沿线方向
    v = x * sa + y * ca          # 垂直线的方向
    return (float(u.max() - u.min()) + 1) / zoom, (float(v.max() - v.min()) + 1) / zoom



def axis_profile(mask, zoom):
    """沿**竖轴**取宽度剖面:每一行的墨迹有多宽 —— 「两头粗、中间细」唯一能量出来的形式。

    外接矩形分不出「腰鼓」和「同高同宽的直棒」:两条的外接矩形一模一样,宽度剖面上
    却是 14/5/14 和 14/14/14。所以「两头粗、中间细」这句话只能沿轴走一遍来验。

    这份量测是**文本那一格的主数**,和 bbox_frame 是「线」那一族的主数一样 ——
    两把尺子回答两个不同的问题(那边问「比球窄、比球长」,这边问「两头粗、中间细」),
    互不替代:一根直径 5px、长 38px 的细棒在 bbox_frame 下完美,剖面却是一根直线。

    返回 (每一行的宽度, 轴上的总高),单位 px。空图退回 ([], 0)。
    """
    w = mask.sum(axis=1) / zoom
    rows = np.nonzero(w > 0)[0]
    if len(rows) == 0:
        return [], 0.0
    prof = [float(v) for v in w[rows[0]:rows[-1] + 1]]
    return prof, (rows[-1] - rows[0] + 1) / zoom


def measure(frame, r0, blur, sharp, cut, r_min, profile=False):
    balls = frame["balls"]
    m = np.asarray(goo_mask(balls, r0, CHK, CHK_Z, blur, sharp, cut)) > 127
    radii = [r0 * b["scale"] for b in balls]
    w, h = bbox(m, CHK, CHK_Z)
    deg = frame.get("deg")
    # 线的长短边在**它自己的坐标系**里量;不是线(deg 缺省)就退回轴对齐那对
    if deg is None:
        fl, fs = 0.0, 0.0
    else:
        fl, fs = bbox_frame(m, CHK, CHK_Z, deg)
    # 「中心球」在光栅上问不出来 —— 它和四周那圈可能连成一坨,连通块分不开「中间那颗」
    # 和「旁边那几颗」。但几何上问得出来:每颗球的坐标和半径都在帧里。取离原点最近的
    # 那一颗,它就是中心球(所有状态的中心球都在原点)。
    core = min(balls, key=lambda b: math.hypot(b["x"], b["y"]))
    # 「画得出来的那几颗液滴」离中心多远 —— 放大缩小那两格主要靠这几列说话。
    #
    # 这一族现在是**九颗各走各的一生**(方位由 i 定、死都不动;谁先谁后由相位表定)。
    # 于是任何一帧里画得出来的都是「刚出生的 + 飞到半路的 + 快化掉的」混在一起,
    # 同刻的圆心距天然摊开成一条带宽(实测 3.9–6.8px),而且**颗数也在变**。
    # 带宽多宽是那张相位表定的 —— 看得见的那几颗正好是表上连续的一小段。
    #
    # 上一版是九颗**同相位**:任何一帧只能看见「同一批」,带宽恒为 0,靠的是那颗
    # 公共半径在一整轮里从最内扫到最外;再上一版是摆在固定半径上的一圈(带宽 0、
    # 公共半径也不动)。三版用这一列就能分开 —— 第一版那次量出来 zoomIn 和 zoomOut
    # 的 span 一模一样、还都等于 dmax,那个巧合就是 bug 的样子。
    #
    # **中心球不算在里面** —— 它就在原点上,不排掉的话 min 恒为 0,span 直接变成
    # 「最远那颗到多远」,自己把自己抵消掉了。
    vis_d = [math.hypot(b["x"], b["y"]) for b in balls
             if b is not core and r0 * b["scale"] >= r_min]
    # 连通块只数一次:块数(「外面有独立液滴」的证据)和最大那一块(「那一摊圆不圆」)
    # 都从它来。分两趟 BFS 白花一倍时间
    blobs = blob_list(m)
    comps = sum(1 for b in blobs if len(b) >= 4)
    cells = len(blobs[0]) if blobs else 0
    ys, xs = np.nonzero(m)
    rim = rim_profile(m, CHK, CHK_Z)
    # 墨迹重心。原来是给「掉下去」那句话用的(整摊压在指针下方)。那一版已经拿掉,
    # 但重心这两个数留着 —— 「整摊坐在指针上、没有系统性偏移」要靠它验,而且
    # 液滴甩得不均匀时它会把「甩偏了」照出来。没有像素时退回 0
    if len(xs):
        cenx = float(xs.mean() - CHK / 2) / CHK_Z
        ceny = float(ys.mean() - CHK / 2) / CHK_Z
    else:
        cenx = ceny = 0.0
    out = {
        "deg": deg,
        "fl": fl,
        "fs": fs,
        "cen_r": r0 * core["scale"],
        "cen_d": math.hypot(core["x"], core["y"]),
        "cenx": cenx,
        "ceny": ceny,
        "t": frame["t"],
        "q": frame["q"],
        # 这一帧该是 πR0² 的多少倍。不随 q 变少的状态就是 1;会收材料的那些(线那一族
        # 的 lineMass、文本的 textMass)从引擎来 —— dump_states 已经算好了带出来,
        # 这边不重写那条曲线
        "mass": frame.get("mass", 1.0),
        "area": union_area_exact(balls, r0),
        "n": len(balls),
        "n_vis": sum(1 for r in radii if r >= r_min),
        "n_drop": len(vis_d),
        "vis_span": (max(vis_d) - min(vis_d)) if len(vis_d) > 1 else 0.0,
        "vis_dmax": max(vis_d) if vis_d else 0.0,
        "vis_dmin": min(vis_d) if vis_d else 0.0,
        # 那几颗的圆心距均值。这一版它几乎是个常数(看得见的总是「半路」的那几颗),
        # 所以它**不再是判据** —— 留着只为对照:上一版这条一整轮扫过 9.8px,
        # 这一版 15px 上下不动。要看的「在动」搬到了 vis_span 和颗数上。
        "vis_dmean": (sum(vis_d) / len(vis_d)) if vis_d else 0.0,
        "r_min": min(radii),
        "cover": min(math.hypot(b["x"], b["y"]) - r0 * b["scale"] for b in balls),
        "comps": comps,
        "hole": hole_radius(m, CHK, CHK_Z),
        "extent": extent(m, CHK, CHK_Z),
        "w": w,
        "h": h,
        "rim": rim,
        # 那一摊(最大那块)的**等效面积直径**:把它所有的墨迹摊成一个正圆,那圆多大。
        # 「摊开之后这一摊多大」这句话就该由它回答 ——
        #   rmin 说的是"最窄的那个方向",要被边的凹凸牵着走;
        #   外接矩形上一版被溅出去的珠子撑着,更不算话;
        #   而面积是那一摊本身占了多少地方,和球(2×R0)一比就是"大几倍"。
        # 顺带它还是和用户要的"1.6 倍 / 42px"唯一能直接对照的数。
        "pad": (2 * math.sqrt(cells / (CHK_Z * CHK_Z) / math.pi)) if cells else 0.0,
        # 二阶矩椭圆率 ≈1 = 圆。量的是**最大那一块**(那一摊本身),不是整张图 ——
        # 宽高比和「所有墨迹的矩」在上一版上都被外圈液滴绑架了(见 moments_ellip)
        "ell": moments_ellip(blobs[0] if blobs else [], CHK, CHK_Z),
        # 轮廓上**最短**的那个方向。散在外面的东西只会往外加墨,所以这个数读的是那一摊
        # 自己的边(哪条方向没被顶起来):圆的一摊 ≈0.9×R0,旧那版扁椭圆
        # 的上下两个极点是 0.74×R0 —— 光这 4px 就把两版分开了
        "rmin": min(rim) if rim else 0.0,
        "s": frame["s"],
    }
    # 「两头粗、中间细」那一组数**只给文本那一格算**。别的状态是圆的 / 一环 / 一摊,
    # 「腰」在那里不是一个概念:fat 和 waist 会由边上的凹凸决定,量出来是噪声,而噪声
    # 一旦进了判据就会开始出假警报。开关放在调用方(profile=name == "beam"),
    # 所以「谁需要剖面」这句话在代码里只有一处。
    if profile:
        prof, ph = axis_profile(m, CHK_Z)
        nn = len(prof)
        k = max(1, nn // 5)
        mid = nn // 2
        band = max(1, nn // 10)
        fat = max(max(prof[:k]), max(prof[-k:])) if nn else 0.0
        waist = min(prof[mid - band:mid + band + 1]) if nn else 0.0
        out["prof_fat"] = fat
        out["prof_waist"] = waist
        out["prof_ratio"] = (waist / fat) if fat > 0 else 1.0
        out["prof_h"] = ph
    return out


def main():
    data = json.load(open(sys.argv[1]))
    rep = data["report"]
    cfg = rep["cfg"]
    r0 = rep["r0"]
    blur, sharp, cut = cfg["GOO_BLUR"], cfg["GOO_SHARP"], cfg["GOO_CUT"]
    target = rep["target"]

    r_min = min_visible_r(CHK, CHK_Z, blur, sharp, cut, r0)

    # 哪些状态「是一条线」不在这边写死 —— 引擎自己在帧上报了 deg(线朝哪儿),
    # 报了的才算线。往 RESIZE_AXIS 加一个方向,这里自动多一格,不用回来改名单。
    #
    # 文本那一格 2026-09-18 之后**不在名单里**,而这件事不需要谁去删一个名字:
    # sampleBeam 的帧不再报 deg,这一行算式自己就把它排除了。这正是当初把「是不是线」
    # 放进数据(而不是放进这里的名单)的用处 —— 「文本不是线了」这句话在引擎里
    # 只有一处表达(不报 deg),这边、test_hover、render_frames 全都自动跟着走。
    LINES = tuple(n for n, st in data["states"].items() if st["frames"][0].get("deg") is not None)

    print("=== 参数 ===")
    print(f"R0 {r0}px  目标面积 πR0² {target:.1f}px²")
    print(f"进出时间常数 τ:进去 {cfg['STATE_IN_TAU']}ms  出来 {cfg['STATE_OUT_TAU']}ms")
    print(f"可点击:核 {cfg['VIS_CORE']} + {cfg['VIS_COUNT']} 瓣,瓣心距 {cfg['VIS_D']}(±{cfg['VIS_SWING_D']})"
          f"  瓣半径 {cfg['VIS_R']}(±{cfg['VIS_SWING_R']})")
    print(f"不可点击: {cfg['BURST_COUNT']} 滴,滴心距 {cfg['BURST_D']}(呼吸 ±{cfg['BURST_BREATH']})")
    print(f"文本: 两颗球(半径 {cfg['TEXT_BALL_R']}px、心距 {cfg['TEXT_BALL_D']}px"
          f" → 球面之间空 {cfg['TEXT_BALL_D'] - 2*cfg['TEXT_BALL_R']:.1f}px)"
          f",中间一丝把两颗连起来({cfg['TEXT_NECK_R']} × {cfg['TEXT_NECK_N']} 团,"
          f"两端插进球里 {cfg['TEXT_NECK_IN']}px)")
    print(f"      材料随 q 收到 {cfg['TEXT_MASS']} 倍(曲线是 q 的二次,见 textMass)")
    print(f"      2026-09-18 之前这一格是「一条竖线」,现在是「两颗球 + 一丝」—— 从这一版起"
          f"它**不算线**(帧上不报 deg),所以下面「一条线」那一套判据套不到它身上,"
          f"它有自己的剖面判据(见「=== 判据 ===」里 beam 那一段)")
    print(f"拖动缩放: 一条线 —— {cfg['LINE_COUNT']} 团摞成一列,间距 {cfg['LINE_SPACING']}"
          f"(< 团半径 {cfg['LINE_R']},否则串成糖葫芦)")
    print(f"          材料随 q 收到 {cfg['LINE_MASS']} 倍(曲线是 q 的二次,见 lineMass)"
          f" —— 两个方向都变小,靠的就是它")
    degs = sorted({st["frames"][0]["deg"] for n, st in data["states"].items()
                   if st["frames"][0].get("deg") is not None})
    print(f"          同一根线转到各自的轴上 —— 同一个采样函数,「团落在哪根轴上」"
          f"退化成一个角度参数,所以上面这几个数值一个字都不改")
    print(f"          这一趟量了 {len(degs)} 个方向: {', '.join(f'{d:g}°' for d in degs)}"
          f" —— 长短边一律转回线自己的坐标系里量(见 bbox_frame)")
    print(f"点击特效: 核 {cfg['SPLAT_CORE']} + 外缘 {cfg['SPLAT_RIM']} 团摆在**一圈**上"
          f"(半径 {cfg['SPLAT_RING']},每团 {cfg['SPLAT_RIM_R']} —— 不是椭圆:「扁」和「低」都是侧视才有的东西)")
    print(f"          外面什么都没有 —— 曾经有过 {9} 颗溅出去的小液滴,用户的口径是"
          f"「去掉那些小液滴,并且摊开的轮廓再放大一点」,整段连同 CFG 一起删了")
    print(f"          材料这一摊是**多**出来的(mass 曲线 q²,满状态 {cfg['SPLAT_MASS']} 倍):"
          f"俯视按下,一摊摊开本来就比原来那颗球占地方")
    # 外圈液滴删掉之后,「整体」就是那一摊自己:上界 = 那一摊在某一方向的边(鼓出来的
    # 那几团)+ 那几团自己的半径。设计单位 → 屏幕要乘 fitArea 那个比例,那一步在这儿
    # 算不出来(得问引擎),所以这个数只当量级看 —— 真数在下面「=== splat ===」那一格
    span_floor = 2 * (cfg['SPLAT_RING'] * (1 + cfg['SPLAT_SWING_D'])
                      + cfg['SPLAT_RIM_R'] * (1 + cfg['SPLAT_SWING_R']))
    print(f"          整体直径(几何上界):那一摊自己的边 × 2 = {span_floor:.1f} 设计单位"
          f"(球 {2*r0:.0f}px;设计单位要再乘 fitArea 的比例才是屏幕像素,真数看下面那一格)")
    print(f"          等效面积直径 = 2·R0·√{cfg['SPLAT_MASS']:.2f} = "
          f"{2 * r0 * math.sqrt(cfg['SPLAT_MASS']):.1f}px = {math.sqrt(cfg['SPLAT_MASS']):.2f}× 球"
          f" —— 用户点名的「约 1.6 倍(42px)」")
    print(f"          这一格按的是另一对时间常数: τ 进 {cfg['PRESS_IN_TAU']}ms / 出 {cfg['PRESS_OUT_TAU']}ms"
          f"(元素状态那对是 {cfg['STATE_IN_TAU']}/{cfg['STATE_OUT_TAU']})")
    zpeak = r0 * math.sqrt(2 * (1 - cfg["ZOOM_CORE"] ** 2) / cfg["ZOOM_COUNT"])
    print(f"放大缩小: 中心球 {cfg['ZOOM_CORE']}×R0 = {cfg['ZOOM_CORE']*r0:.2f}px"
          f" + 四周 {cfg['ZOOM_COUNT']} 个方位,每个方位一颗液滴(各走各的一生)")
    print(f"          一颗的一生 {cfg['ZOOM_TRAVEL_MS']}ms:在母球身上长出来"
          f"(圆心离原点 {cfg['ZOOM_CORE']*r0:.2f}px、半径 0)→ 飞到 {cfg['ZOOM_D']}px 化掉"
          f"(半径又回 0);半路最胖 {zpeak:.2f}px")
    print(f"          「方位」只由 i 定 —— 一个随时间前进的项都没有(「不转圈」在代码里就这一句);"
          f"「谁先谁后」来自 ZOOM_PHASE_ORDER 那张打乱过的表 {cfg['ZOOM_PHASE_ORDER']}")
    print(f"          两张表分开,「持续」和「不转圈」才第一次同时成立:相位跟着方位走 = 转圈的喷头"
          f"(第二版被否),相位全同 = 一条环在一起胀缩(第三版被否)。")
    print(f"          材料那笔账:相位表是等分格子 {{0, 1/N, …, (N−1)/N}} 的一个排列,于是"
          f" Σ(半径²) 恒等于 {r0*r0*(1-cfg['ZOOM_CORE']**2):.0f}px²(峰值 {zpeak:.2f}px、与相位无关),"
          f"加上中心球的 {r0*r0*cfg['ZOOM_CORE']**2:.0f}px² 正好是 {r0*r0:.0f}px² = πR0²")
    print(f"          所以中心球稳稳停在 {cfg['ZOOM_CORE']*r0:.2f}px 不跟着呼吸,"
          f"而九颗一直在出生、往外飞、化掉 —— 「一直在动」和「中心不动」靠的就是这一条")
    print(f"          缩小 = 放大的**倒放**:w 用取负的时间,于是 缩小(t) 和 放大(T−t)"
          f" 逐颗逐帧是同一张画(第 15 节对了一遍,不是「看着差不多」)")
    print(f"goo: 模糊 {blur}  阈值 {cut}  斜率 {sharp}   →  画得出来的最小半径 {r_min:.2f}px")

    # ---- 收回去的那一帧必须就是普通光标 ----
    print(f"\n=== q=0:{len(rep['atRest'])} 个状态的「收拢完成」帧 ===")
    rest_ok = True
    for name, a in rep["atRest"].items():
        # 这里不能要求「只有一个球」—— 可点击那套天生是 1 核 + 5 瓣,放大缩小是
        # 1 核 + 9 滴,q=0 时所有球全部重合在原点、半径全等于 R0,画出来同样是
        # 那一颗球。该查的是**并集**:形状和面积都对上,才叫精确一致。
        off = a["maxOffset"]
        flat = max(abs(s - 1.0) for s in a["scales"])
        ua = union_area_exact(a["balls"], r0)
        err = (ua / target - 1) * 100
        ok = off < 1e-9 and flat < 1e-9 and abs(err) < 1e-6
        rest_ok = rest_ok and ok
        print(f"  {name:8s} 球数 {a['n']}(全部重合)  离原点 {off:.2e}px  缩放偏差 {flat:.2e}"
              f"  并集 {ua:.4f}px² 偏差 {err:+.2e}%   {'✓ 一颗 R0 的球' if ok else '✗ 不是普通光标'}")
    print("  → 交回 #latex-ball 不需要交叉淡入:两者同一帧逐像素一致。")

    # ---- 逐帧 ----
    reports = {}
    for name, st in data["states"].items():
        # 剖面只给文本那一格量 —— 理由见 measure() 里最后那一段
        reports[name] = [measure(f, r0, blur, sharp, cut, r_min, profile=(name == "beam"))
                         for f in st["frames"][::3]]

    # 「边在动」这类判据得用 q≈1 那一批帧,不能用 q>0.95 的。
    #
    # 0.95 那一批里含着还在长出来的那几帧:q 从 0.95 涨到 1,形状本身在变大,
    # 于是宽度天然就有一个零点几 px 的跨度。拿它当「在蠕动」的证据等于自己骗自己 ——
    # 实测把三个摆动全部调成 0(形状完全静止),这批帧的宽高照样抖 0.5/1.5px,
    # 断言一声不吭。换成 q>0.999,剩下的变化就只可能来自那四个摆动频率。
    full = {k: [m for m in v if m["q"] > 0.999] for k, v in reports.items()}

    for name, st in data["states"].items():
        ms = reports[name]
        hold_lo, hold_hi = rep["enterMs"], rep["enterMs"] + st["hold"]
        held = full[name]
        # 分母是**每一帧自己该有的量**:可点击和不可点击始终是 πR0²,会收材料的那些
        # (线那一族 lineMass、文本 textMass)随 q 减少。用 πR0² 当分母的话,文本满状态
        # 会一路显示 −31%,像坏了。
        area_err = [abs(m["area"] / (target * m["mass"]) - 1) * 100 for m in ms]
        # 「守恒」还是「对各自该有的量」**按数据念**,不按名字:全程 mass 恒为 1 的状态
        # 才配念「面积守恒」。原来这里写的是 `name not in LINES` —— 那时「会收材料的」
        # 正好等于线那一族;文本 2026-09-18 换成两颗球之后退出了 LINES,那句话会对着
        # 一个只带 68.9% 材料的状态念「面积守恒」,把一个设计决定念成一句假话。
        conserved = all(abs(m["mass"] - 1.0) < 1e-9 for m in ms)
        print(f"\n=== {name} ===")
        print(f"  帧数 {len(ms)}(全 {len(st['frames'])})  停留段 {hold_lo:.0f}–{hold_hi:.0f}ms"
              f"  共 {len(held)} 个满状态帧")
        print(f"  面积{'守恒' if conserved else '(对各自该有的量)'}:最大偏差 {max(area_err):.3f}%")
        if held:
            print(f"  满状态:中心遮盖 {'是' if min(h['cover'] for h in held) < 0 else '否'}"
                  f"(最靠内的材料边界 {min(h['cover'] for h in held):+.2f}px)"
                  f"  可视空白半径 {min(h['hole'] for h in held):.2f}–{max(h['hole'] for h in held):.2f}px")
            print(f"         外沿半径 {min(h['extent'] for h in held):.2f}–{max(h['extent'] for h in held):.2f}px"
                  f"  渲染块数 {min(h['comps'] for h in held)}–{max(h['comps'] for h in held)}"
                  f"  画得出来的球 {min(h['n_vis'] for h in held)}–{max(h['n_vis'] for h in held)}/{held[0]['n']}")
        # 边缘在动的证据
        if name == "viscous" and len(held) > 2:
            prof = np.array([h["rim"] for h in held])
            spread = (prof.max(axis=1) - prof.min(axis=1))
            # 每个方向自己的时间抖动
            jit = (prof.max(axis=0) - prof.min(axis=0))
            print(f"  轮廓:同一时刻各方向半径相差 {spread.min():.2f}–{spread.max():.2f}px(不圆)")
            print(f"        同一方向随时间抖 {jit.min():.2f}–{jit.max():.2f}px"
                  f"  平均 {jit.mean():.2f}px(在动)")
        # 点击特效:四列,回答四个问题 ——
        #   圆不圆 → ell(二阶矩)。宽高比不算话:那一摊的边是 10 团摞出来的花瓣形,
        #            外接矩形量的是「花瓣顶得齐不齐」,不是「圆不圆」
        #   那一摊多大 → pad(等效面积直径,主数)和 rmin(轮廓上最短的那个方向)
        #   坐没坐在指针上 → 重心两列。旧那版「掉下去」在 y 上是 +5.9px,现在该是 0 上下
        #   是不是**一整片** → comps(块数)。外圈液滴删掉之后这一条是 1——
        #            它现在是「不许再有杂块」的看门人(当时是「必须≥3 块」,整个反过来)
        if name == "splat" and held:
            print(f"  那一摊:{min(h['pad'] for h in held):.2f}–{max(h['pad'] for h in held):.2f}px 等效直径"
                  f" = {min(h['pad'] for h in held)/(2*r0):.2f}–{max(h['pad'] for h in held)/(2*r0):.2f}× 球"
                  f"({2*r0:.0f}px;把那一摊的墨迹摊成一个正圆的直径,「摊开之后这一摊多大」就是它)")
            print(f"          椭圆率(二阶矩) {min(h['ell'] for h in held):.2f}–{max(h['ell'] for h in held):.2f}"
                  f"(1.00 = 正圆;旧那版扁椭圆是 1.8 上下)")
            print(f"          轮廓最短方向 {min(h['rmin'] for h in held):.2f}–{max(h['rmin'] for h in held):.2f}px"
                  f" = {min(h['rmin'] for h in held)/r0:.2f}–{max(h['rmin'] for h in held)/r0:.2f}×R0"
                  f"(10 团外缘最薄的那个地方;7 团时这里只有 0.94×R0)")
            print(f"          整体外沿 {min(h['extent'] for h in held):.2f}–{max(h['extent'] for h in held):.2f}px"
                  f" = {min(h['extent'] for h in held)/r0:.2f}–{max(h['extent'] for h in held)/r0:.2f}×R0"
                  f"  宽 {min(h['w'] for h in held):.2f}–{max(h['w'] for h in held):.2f}"
                  f"  高 {min(h['h'] for h in held):.2f}–{max(h['h'] for h in held):.2f}px")
            print(f"          重心 x {min(h['cenx'] for h in held):+.2f}–{max(h['cenx'] for h in held):+.2f}"
                  f"  y {min(h['ceny'] for h in held):+.2f}–{max(h['ceny'] for h in held):+.2f}px"
                  f"(指针在 0;旧那版 y 是 +5.9,「掉下去」)")
            print(f"          渲染块数 {min(h['comps'] for h in held)}–{max(h['comps'] for h in held)}"
                  f"  画得出来的球 {min(h['n_vis'] for h in held)}–{max(h['n_vis'] for h in held)}/{held[0]['n']}"
                  f"(外圈液滴删掉之后,这里该永远是 1 块:只有那一摊自己)")
        # 放大缩小:中心球是定海神针,九颗是四面八方一直在走的一生。分成两组数看 ——
        # 中心球那两个数是「不许动」(半径停在 ZOOM_CORE·R0、一直在原点);
        # 九滴那几列是「一直在动」,而且是**各动各的**:同刻那几颗的圆心距摊开成
        # 多宽的一条带宽、颗数在 3~6 之间变(有人出生、有人化掉)、外沿一直比默认球大
        # 而且稳、连通块在 1 和 3 之间变。这三样一起才叫「持续往所有方向散射/聚拢」,
        # 少了带宽和颗数这两条,「一起胀缩」也能全绿 —— 极性翻过两次,见下面 zoom 那段。
        if name in ("zoomIn", "zoomOut") and held:
            print(f"  中心球(停稳) {min(h['cen_r'] for h in held):.2f}–{max(h['cen_r'] for h in held):.2f}px"
                  f"(目标 {cfg['ZOOM_CORE']*r0:.2f}px,默认球 {r0:.0f}px)"
                  f"  离原点 {max(h['cen_d'] for h in held):.3f}px")
            print(f"  九滴(停稳):画得出来 {min(h['n_drop'] for h in held)}–{max(h['n_drop'] for h in held)} 颗"
                  f"  离中心 {min(h['vis_dmin'] for h in held):.1f}–{max(h['vis_dmax'] for h in held):.1f}px"
                  f"  同刻摊开成 {min(h['vis_span'] for h in held):.2f}–{max(h['vis_span'] for h in held):.2f}px"
                  f" 的一条带宽(九颗各走各的一生)")
            print(f"          外沿 {min(h['extent'] for h in held):.2f}–{max(h['extent'] for h in held):.2f}px"
                  f"  连通块 {min(h['comps'] for h in held)}–{max(h['comps'] for h in held)}"
                  f"  —— 并起来是一团、散开是中心球加几颗还在半路的液滴")
        # 文本:两颗球 + 中间一丝。这一格的主数**不是**宽高 —— 外接矩形说不出
        # 「两头粗、中间细」(一枚腰鼓和一根同高同宽的直棒在它下面一模一样),
        # 所以量的是沿轴的宽度剖面:两头(上下各 1/5)最粗多粗、中间那一小段(±1/10)
        # 最细多细、细/粗是多少,以及整条在轴上多高。
        if name == "beam" and held:
            fa = [h["prof_fat"] for h in held]
            wa = [h["prof_waist"] for h in held]
            ra = [h["prof_ratio"] for h in held]
            ph = [h["prof_h"] for h in held]
            print(f"  剖面:两头 {min(fa):.2f}–{max(fa):.2f}px 宽(球是 {2*r0:.0f}px)"
                  f"  腰 {min(wa):.2f}–{max(wa):.2f}px"
                  f"  细/粗 {min(ra):.2f}–{max(ra):.2f}")
            print(f"        高 {min(ph):.2f}–{max(ph):.2f}px = {min(ph)/(2*r0):.2f}–{max(ph)/(2*r0):.2f}× 球"
                  f"(默认球 {2*r0:.0f}px;两颗球心距 {cfg['TEXT_BALL_D']}px + 球半径"
                  f" → 几何上 {cfg['TEXT_BALL_D'] + 2*cfg['TEXT_BALL_R']}px)")
            print(f"        宽 {min(h['w'] for h in held):.2f}–{max(h['w'] for h in held):.2f}px"
                  f"  渲染块数 {min(h['comps'] for h in held)}–{max(h['comps'] for h in held)}"
                  f"(必须是 1:断成两块就是「两颗球」,不是「一丝连着」)")
            print(f"        轮廓在动:两头抖 {max(fa)-min(fa):.2f}px  腰抖 {max(wa)-min(wa):.2f}px"
                  f"  —— 「像液体一样」落在这一条上")
        # 一条线的证据:宽、高,以及它们各自的抖动。
        # 竖的横的量的是同两组数,只是把「长边」和「短边」换个名字 —— 这也是这两格
        # 唯一该有的差别,所以放在同一段里,靠 name 决定哪根轴叫长边
        if name in LINES and len(held) > 2:
            # 几根线量的是同一组数(自己坐标系里的长边和短边),差别只在朝哪儿 ——
            # 所以放在同一段里,角度只是个标注。长边/短边都按 bbox_frame 转回
            # 线自己的坐标系量,0° 和 45° 才可比
            lo = np.array([h["fl"] for h in held])
            sh = np.array([h["fs"] for h in held])
            print(f"  {held[0]['deg']:g}° 线:长边 {lo.min():.2f}–{lo.max():.2f}px"
                  f"  短边 {sh.min():.2f}–{sh.max():.2f}px(球是 {2*r0:.0f}px 宽)"
                  f"  长/短 {(lo/sh).min():.2f}–{(lo/sh).max():.2f}")
            print(f"          长边随时间抖 {lo.max()-lo.min():.2f}px"
                  f"  短边随时间抖 {sh.max()-sh.min():.2f}px(边在蠕动)")

    # ---- 时间线(采样打印,看过程)----
    print("\n=== 时间线 ===")
    for name, ms in reports.items():
        # 线的状态多两列:它自己的坐标系里的长短边。轴对齐的宽高对 45° 那格是
        # 废数(26.5 x 26.5,和球分不出来),所以线只看这两列。
        # 文本那一格多两列剖面(两头 / 腰):它那颗「中间细」在外接矩形上是看不见的,
        # 只有沿轴走一遍才有 —— 见 measure() 里的 axis_profile
        is_line = name in LINES
        is_prof = name == "beam"
        if is_line:
            head = "长 x 短(自己坐标系)"
        elif is_prof:
            head = "宽 x 高        两头 / 腰"
        else:
            head = "宽 x 高"
        print(f"  {name}   t      q     面积%   中心   空半径  外沿   块数  球数    {head}")
        pick = ms[:: max(1, len(ms) // 14)]
        for m in pick:
            # 面积百分比是**对它自己那一帧该有的量**:会收材料的那些全程在减少材料,
            # 拿 πR0² 当分母的话,满状态会一路显示 −31%,看着像坏了
            err = (m["area"] / (target * m["mass"]) - 1) * 100
            cen = "实" if m["cover"] < 0 else "空"
            if is_line:
                shape = f"{m['fl']:5.2f} x {m['fs']:5.2f}          {m['deg']:g}°"
            elif is_prof:
                shape = (f"{m['w']:5.2f} x {m['h']:5.2f}   "
                         f"{m['prof_fat']:5.2f} / {m['prof_waist']:5.2f}")
            else:
                shape = f"{m['w']:5.2f} x {m['h']:5.2f}"
            print(f"          {m['t']:6.0f} {m['q']:5.2f}  {err:+6.2f}  {cen:4s}"
                  f"  {m['hole']:6.2f}  {m['extent']:5.1f}  {m['comps']:4d}  {m['n_vis']:2d}/{m['n']}"
                  f"   {shape}")

    # ---- 判据 ----
    print("\n=== 判据 ===")
    bad = []
    if not rest_ok:
        bad.append("q=0 不是一颗 R0 的球 —— 交回普通光标会有一道缝")
    # 面积:可点击和不可点击全程守着 πR0²;会收材料的那些(线那一族的 lineMass、
    # 文本的 textMass)是**有意**把自己收掉的(见 cursor-fx.js 里那段),所以拿它们
    # 去比别人的标准只会得到 −31% / −50% 的假警报。
    # 比的是它自己那条意图曲线 —— 每一帧该有多少材料都由引擎给出,比一个常数更严:
    # 收早了、收晚了、收多了,都会露出来。
    #
    # 注意 want 是**逐帧读进来的**(m["mass"]),不是这边拿 q 再算一遍:曲线在
    # 引擎里,改一次只改一个地方,这边只管量。
    for name, ms in reports.items():
        held = [m for m in ms if m["q"] > 0.95]
        for m in ms:
            want = target * m["mass"]
            if abs(m["area"] / want - 1) > 0.01:
                bad.append(f"{name} @{m['t']:.0f}ms 面积偏差 {(m['area']/want-1)*100:+.3f}%"
                           f"(该是 πR0² 的 {want/target*100:.1f}%)")
                break
        if not held:
            bad.append(f"{name} 没有满状态帧")
            continue
        # 「一个球都不能小到画不出来」对别的状态都成立,对**一直在生生死死的那一格**
        # 恰恰反过来:放大的那几颗,一生就是半径从 0 涨起来、再落回 0(见 sampleZoom),
        # 两头本来就画不出来 —— 那是「出生」和「化掉」,不是「有个球漏了」。
        # 点击特效**曾经也在这张豁免名单上**(外面那一圈液滴是从核里长出来、再缩回 0
        # 死掉的),用户的「去掉那些小液滴」把那一整段删了 —— 现在那 11 团全程都是
        # 十几个 px,门槛底下没有一颗,所以这里把它从名单上摘掉,改回普通判据。
        #
        # 文本是**第二种**豁免,理由和第 1 条完全不同,别混:
        #   min_visible_r 量的是「一枚**孤零零**的圆盘,**单独**糊完之后还剩多大」——
        #   本文件那一行打印出来是 3.63px。可文本那 15 团丝是**串在一起**的:每一团
        #   都和邻团重叠,模糊之后是「一整条带子」在撑着自己,而条带的地板低得多 ——
        #   同一套 bisection 实测半径 2.25px(链子上的),只有孤球地板的 63% 上下,
        #   而且和链子多长无关。
        #   丝最细的那一团设计上是 2.85×(1−0.10) = 2.565px,正落在两个地板**之间**:
        #   它过得了链子那条(所以画出来是连着的,「一丝连着」成立),过不了孤球那条
        #   (所以这一格在光栅上只数得出 2/17 团「画得出来」—— 那是尺子拿错了,
        #   不是丝断了:渲染块数恒为 1,腰实测 5.00px,那一丝在屏幕上清清楚楚)。
        #   这一格的「连着」因此改由 comps == 1 和剖面的腰下界来验,量的是
        #   **糊完之后**的样子,比拿一颗孤立圆盘去比半径准得多。
        if name not in ("zoomIn", "zoomOut", "beam") and min(m["n_vis"] for m in held) < held[0]["n"]:
            bad.append(f"{name} 有球小到画不出来(最少 {min(m['n_vis'] for m in held)}/{held[0]['n']})")
    vh = [m for m in reports["viscous"] if m["q"] > 0.95]
    bh = [m for m in reports["burst"] if m["q"] > 0.95]
    if vh:
        if max(m["comps"] for m in vh) != 1:
            bad.append(f"可点击渲染成了 {max(m['comps'] for m in vh)} 块 —— 应该是黏在一起的一坨")
        if max(m["cover"] for m in vh) >= 0:
            bad.append(f"可点击的中心漏了(材料边界到了 {max(m['cover'] for m in vh):+.2f}px)")
    if bh:
        if min(m["comps"] for m in bh) < 6:
            bad.append(f"不可点击最少时只渲染出 {min(m['comps'] for m in bh)} 块 —— 不够「很多小液滴」")
        if min(m["cover"] for m in bh) < 0:
            bad.append(f"不可点击的中心被盖住了(最靠内 {min(m['cover'] for m in bh):+.2f}px)—— 应该空白")
        if min(m["hole"] for m in bh) < 4:
            bad.append(f"不可点击的可视空白只有 {min(m['hole'] for m in bh):.2f}px —— 屏幕上等于没空")
        ex = [m["extent"] for m in full["burst"]]
        if max(ex) - min(ex) < 0.5:
            bad.append("不可点击的外沿一动不动 —— 没有「推出去又被拽回来」那口气")
        # 「圈多大」这一句原来没有上界,34px 也能过 —— 用户看了说圈太大,环半径收到 18
        # 之后这里跟着写死。数值得和 test_hover.js 那条对齐:那边量的是几何外沿(25.09,
        # 上界 26),这边量的是**渲染**外沿 —— goo 会把边界往里啃掉 1.5px 上下,所以
        # 同一个环半径在这里是 23.5,上界也跟着低一档(24.5):环半径只要回到 19,
        # 几何那边 26.1、渲染这边 24.6,两边一起报。
        if max(ex) > 24.5:
            bad.append(f"不可点击的圈太大了(外沿 {max(ex):.1f}px)—— 环半径放回去了")
    # 一条线的那些状态(拖动缩放的各个方向)。判据只有**一套** ——
    # 它们本来就是同一次挤压、同一份材料,差别只在朝哪儿。所以按引擎报出来的
    # deg 循环,不按名字分岔:往 RESIZE_AXIS 里加一个方向,这里自动多验一格。
    #
    # 这一段原来收着**文本**那一格(它那时就是 90° 的那条线),2026-09-18 文本换成
    # 两颗球之后它退出了 LINES,于是这一段自动只管拖动缩放族 —— 一个名字都没改,
    # 详见上面 LINES 那几行。文本自己那一套判据在下面 beam 那一段。
    #
    # 为什么在光栅这边量,而不是只靠 test_hover.js 里那条「逐球等于旋转 deg−90°」:
    # 那条比的是**球的坐标**,量不到 goo 之后的样子。goo 是各向同性的模糊 + 阈值,
    # 按说转了角度也该是转角度,但那是推理,不是测量 —— 真正会坏掉的地方(比如
    # 以后给某根轴单独加一条只在 x 上生效的形变)正好不在那条判据里,而在
    # 这一段的宽高比里。
    line_states = [n for n in LINES if full[n]]
    for n in line_states:
        ms = full[n]
        deg = ms[0]["deg"]
        who = f"{deg:g}° 线"
        if max(m["comps"] for m in ms) != 1:
            bad.append(f"{who}渲染出了 {max(m['comps'] for m in ms)} 块 —— 是虚线/糖葫芦,不是一条线"
                       "(多半是 LINE_SPACING 没小于 LINE_R)")
        if max(m["cover"] for m in ms) >= 0:
            bad.append(f"{who}的中心漏了(材料边界到了 {max(m['cover'] for m in ms):+.2f}px)—— 线上不该有空")
        # 「被力聚合」= 横向被压掉、纵向长回来。两头都要查,只查一头的话
        # 把 LINE_R 调大就能骗过去 —— 那样它只是变胖,并没有变成线。
        #
        # 上界比原来紧一档:用户看过第一版说「太粗太长」,所以「比球窄」这种说法
        # 不够了 —— 粗 13、长 49 的旧尺寸也过得了它。这里直接把当时定下的尺寸
        # 写成上界(0.45 个球宽、1.35 个球长),旧尺寸回来就报。这几个数和方向无关:
        # 转着量出来的长短边,90° 和 45° 是同一把尺子。
        if max(m["fs"] for m in ms) >= 2 * r0 * 0.45:
            bad.append(f"{who}的短边 {max(m['fs'] for m in ms):.2f}px,没比球({2*r0:.0f}px)窄多少 —— 没被挤压")
        # 1.05 而不是 1.15:改小之后光栅量出来的最短是 28.25px(球 26px),
        # 卡在 1.15(=29.9)下面会一直报「没被抻长」—— 那是阈值没跟上新尺寸,
        # 不是形状错了。1.05 留 1px 余量,同时旧尺寸(长 45+)照样过它,靠下面
        # 那条「又长回去了」的上界去挡。
        if min(m["fl"] for m in ms) <= 2 * r0 * 1.05:
            bad.append(f"{who}的长边 {min(m['fl'] for m in ms):.2f}px,"
                       f"没比球({2*r0:.0f}px)长多少 —— 没被抻长")
        if max(m["fl"] for m in ms) >= 2 * r0 * 1.35:
            bad.append(f"{who}的长边 {max(m['fl'] for m in ms):.2f}px,又长回去了"
                       "(用户嫌太长的就是这个方向)")
        ratio = min(m["fl"] / m["fs"] for m in ms)
        if ratio <= 2.5:
            bad.append(f"{who}的长短比只有 {ratio:.2f} —— 不够「细长」")
        # 液体两字落在「边在蠕动」上:纹丝不动的话,画出来是一条死线,不是液体
        los = [m["fl"] for m in ms]
        shs = [m["fs"] for m in ms]
        if max(los) - min(los) < 0.3 and max(shs) - min(shs) < 0.5:
            bad.append(f"{who}的轮廓一动不动 —— 是一条死线,不是液体")
    # 文本:两颗球 + 中间一丝。用户的两句话就是下面这几条 ——
    #   「两个小球,中间有些距离」(再补一句「球离的更开一点」)
    #       → 剖面**两头粗、中间细**:两头约半个球宽、细/粗 < 0.55
    #   「中间有液体藕断丝连」
    #       → 渲染出来是**一块**(断成两块就成了「两个小球」),而且腰比链子地板粗
    # 两条一起才分得开,少一条都有形状能骗过去:
    #   只查「一整块」—— 一颗 R0 的球、一根直棒、原来那根竖线,全都过;
    #   只查「两头粗中间细」—— 中间断成两截的形状也过,而那正是用户**不要**的那个:
    #     「藕断丝连」的意思是断而**没断**,不是两个球摆在那儿。
    #
    # 剖面这几条阈值凭什么立得住 —— 四个形状在**同一套 goo、同一个 axis_profile**
    # 底下量出来的数(probe_prof.py 量的,不是想出来的):
    #                      两头             腰        细/粗    高
    #   一颗 R0 的球       19.75px(0.76球)  24.50px   1.24    25.25px(0.97球)
    #   一根直棒           11.50px(0.44球)  11.50px   1.00    42.00px(1.62球)
    #   两球断开(没有丝)   12.50px(0.48球)   0.00px   0.00    40.50px(1.56球)
    #   这一格(设计几何)   12.50px(0.48球)   5.00px   0.40    36.50px(1.40球)
    # 照着这张表读阈值:
    #   两头 < 0.70 球 —— 球是 0.76,过不去;这一格 0.48,留着 0.22 球。
    #   细/粗 < 0.55 —— 球 1.24、直棒 1.00,都过不去;这一格 0.40。
    #   高 1.15–1.50 球 —— 球是 0.97(矮过下界);这一格 1.40。
    #   腰 > 4.50px —— **这一条抓的是「断开」**,值得单说:两球断开那一版的腰精确是
    #     0.00px(裂口那几行一个字都没有),可它的**细/粗也是 0.00** —— 也就是说
    #     「中间细」这一半光看比例是抓不住断开的(越断越「细」),必须有一个**绝对**
    #     下界兜着,4.50px 就是它。同一时刻 comps 会变成 2,两条一起把「断了」钉死。
    #
    # 腰的下界**必须用链子地板(2.25px 半径 → 4.5px 宽),不能用孤球地板**:见上面
    # 「每一团都画得出来」那段豁免里的推导。孤球地板 3.63px 半径在屏幕上量出来是
    # 7.26px 宽的一条,拿它当腰的下界等于要求「腰比一颗孤零零的球还粗」—— 那不是这一格
    # 的形状。真正会坏掉的样子是**被糊断**(丝细到 goo 把它切开、comps 变成 2),
    # 而切开的那条线就是链子地板:所以下界取 4.5px,实测 5.00px。这两条(**腰在
    # 链子地板上面 + 渲染块数恒为 1**)是一件事的两面,一起写下来。
    bf = full.get("beam") or []
    if not bf:
        bad.append("文本没有满状态帧")
    else:
        if "beam" in LINES:
            bad.append("文本那一格又在帧上报 deg 了 —— 它会重新被当成「一条线」,"
                       "而这一版的形状是两颗球。这一处分岔**只有这一条**在守,见文件头")
        comps_hi_b = max(m["comps"] for m in bf)
        if comps_hi_b != 1:
            bad.append(f"文本渲染成了 {min(m['comps'] for m in bf)}–{comps_hi_b} 块 —— 断了。"
                       "「藕断丝连」要的正是一丝连着;断成两截就只是「两个小球」")
        if max(m["cover"] for m in bf) >= 0:
            bad.append(f"文本的中心漏了(材料边界到了 {max(m['cover'] for m in bf):+.2f}px)"
                       "—— 两球之间那一丝该把中间填实")
        fat_hi_b = max(m["prof_fat"] for m in bf)
        fat_lo_b = min(m["prof_fat"] for m in bf)
        if fat_lo_b <= 0.35 * 2 * r0:
            bad.append(f"文本两头只有 {fat_lo_b:.2f}px 宽 —— 太瘦了,那不是「两个小球」,是两根线头")
        if fat_hi_b >= 0.70 * 2 * r0:
            bad.append(f"文本两头宽到 {fat_hi_b:.2f}px = {fat_hi_b/(2*r0):.2f}× 球"
                       f"({2*r0:.0f}px)—— 又变回一颗球 / 一根粗棒子了"
                       "(一颗球在这个量上实测 0.76 倍)")
        ratio_hi_b = max(m["prof_ratio"] for m in bf)
        if ratio_hi_b >= 0.55:
            bad.append(f"文本中间不够细(细/粗 最大 {ratio_hi_b:.2f})—— 没有腰,"
                       "就是一根棒子(球实测 1.24、直棒 1.00、这一格 0.40–0.44)")
        waist_lo_b = min(m["prof_waist"] for m in bf)
        if waist_lo_b <= 2 * 2.25:
            bad.append(f"文本的腰只有 {waist_lo_b:.2f}px 宽 —— 到了链子地板(4.50px)以下,"
                       "goo 会把它糊断;「一丝连着」这一半靠的就是它在地板上面")
        ph_lo_b = min(m["prof_h"] for m in bf)
        ph_hi_b = max(m["prof_h"] for m in bf)
        # 高:下界挡住「就是一颗球」(球是 1.00 倍高),上界挡住「又细又长」那版回头
        # (用户当时的口径是「太粗太长」)。上界 1.5 比 test_hover 那边(1.6)紧一档,
        # 和不可点击那个圈同样的道理:那边量的是几何(球心距 + 半径 = 38px),这边量的是
        # **糊完之后**的样子 —— goo 把两头的尖啃掉 1px 上下,同一个形状在这儿是 36.0–37.25
        if ph_hi_b >= 1.5 * 2 * r0:
            bad.append(f"文本高到 {ph_hi_b:.2f}px = {ph_hi_b/(2*r0):.2f}× 球 —— 又长回去了"
                       "(用户嫌「太长」的就是这个方向;test_hover 那边的几何上界是 1.6)")
        if ph_lo_b <= 1.15 * 2 * r0:
            bad.append(f"文本只有 {ph_lo_b:.2f}px 高 = {ph_lo_b/(2*r0):.2f}× 球 —— "
                       "两颗球还没分开,看着就是一颗球")
        # 液体两字落在「边在蠕动」上。静止的形状这里精确是 0(同一个形状反复渲染,
        # 每一行宽度都一样),所以门槛只要高过光栅那 0.25px 一格。
        wa_jit = max(m["prof_waist"] for m in bf) - waist_lo_b
        if wa_jit < 0.25:
            bad.append(f"文本的腰一动不动(整段只抖 {wa_jit:.2f}px)—— 那是两根死球加一根死线,"
                       "不是液体")
    # 点击特效:四条,少一条都能被别的形状骗过去 ——
    #   只查「中心实」→ 可点击那一坨也过;只查「圆」→ 一颗没摊开的球也过;
    #   只查「大」→ 不可点击那一圈也过。
    #
    # 「扁」和「低」这两条是**反着**写的(旧那版正是靠它们过的):椭圆率必须接近 1、
    # 重心必须落在指针上。用户否掉旧版的那句话就是冲着这两个数来的,所以它们不是
    # 「顺便也量一下」,而是这一段的重点 —— 旧参数填回去,这两条立刻报。
    # 名字带 f 别叫 sp:下面放大缩小那一段原本有个局部变量也叫 sp(同刻带宽的序列),
    # 会把这一格盖掉 —— 真发生过一次,报出来是「float 不能下标」,查半天
    spf = full.get("splat") or []
    if not spf:
        bad.append("点击特效没有满状态帧")
    else:
        if max(m["cover"] for m in spf) >= 0:
            bad.append(f"点击特效的中心漏了(材料边界到了 {max(m['cover'] for m in spf):+.2f}px)"
                       "—— 那是不可点击那圈的样子的起点")
        # 圆。阈值 1.15:旧那版扁椭圆(横半轴 ≫ 竖半轴)是 1.8 上下,现在这一版
        # 实测 1.00–1.02 —— 1.15 留得下「边在蠕动」那点量,又容不下任何「压扁一点」
        # 的回头。下面的阈值都是这么定的:量出来多少,就贴着它上面留一层
        ell_max = max(m["ell"] for m in spf)
        if ell_max > 1.15:
            bad.append(f"点击特效的椭圆率到了 {ell_max:.2f} —— 又不圆了"
                       "(用户的口径:俯视看下去按下,是一摊圆的液体)")
        # 比球大 —— 这一格的**主数**。用的量是**等效面积直径**(pad),因为
        # 「摊开之后这一摊多大」问的就是这个;它和外接矩形、轮廓最短方向都不一样,
        # 后两个都被边的凹凸牵着走。
        # 阈值 1.45 倍球:用户点名的数是 1.6 倍(42px),实测 1.60,所以卡在 1.45 ——
        # 留一点微调的余地,但容不下「退回球那么大」(旧那版面积恒等于 πR0² → 1.00,
        # 可点击那一坨也是 1.00,真退回去两格就分不出来了)
        pad_min = min(m["pad"] for m in spf)
        if pad_min <= 1.45 * 2 * r0:
            bad.append(f"点击特效那一摊的等效直径只有 {pad_min:.2f}px = {pad_min/(2*r0):.2f}× 球"
                       f"({2*r0:.0f}px) —— 没摊开(用户要的是 1.6 倍)")
        # 那条边:轮廓最短的方向也得铺得开,不能只是「某个方向探出去很远」。
        # pad 说的是「总共占多少地方」,这一条说的是「哪个方向都没缩回去」——
        # 两个一起才叫一摊圆的铺开。实测 1.48×R0(这条是 10 团外缘换来的:7 团时
        # 只有 0.94×R0,量出来是朵花),阈值 1.2×R0
        rmin_min = min(m["rmin"] for m in spf)
        if rmin_min <= 1.2 * r0:
            bad.append(f"点击特效轮廓最短方向只有 {rmin_min:.2f}px = {rmin_min/r0:.2f}×R0 —— "
                       "没比球铺得开,边上是花瓣")
        # 整体外沿:整摊铺到了多远。现在是那一摊自己铺出来的(外圈液滴已经删了),
        # 所以它和 pad 差得不多 —— 实测 1.67–1.68×R0 对 1.60× 的等效直径。阈值 1.5×R0
        ext_min = min(m["extent"] for m in spf)
        if ext_min <= 1.5 * r0:
            bad.append(f"点击特效整体外沿只有 {ext_min:.2f}px = {ext_min/r0:.2f}×R0 —— 没铺开")
        # 坐在指针上。旧那版是 +5.9px(「掉下去」),现在该是 0 上下 ——
        # 实测最远 0.9px;2px 挡住了旧版的 5.9,又容得下边上蠕动带来的那点偏心
        cy, cx = min(m["ceny"] for m in spf), min(m["cenx"] for m in spf)
        cy2, cx2 = max(m["ceny"] for m in spf), max(m["cenx"] for m in spf)
        if max(abs(cy), abs(cy2)) > 2:
            bad.append(f"点击特效的重心 y 在 {cy:+.2f}–{cy2:+.2f}px —— 整摊离开了指针"
                       "(旧那版「掉下去」就是这个症状)")
        if max(abs(cx), abs(cx2)) > 2:
            bad.append(f"点击特效的重心 x 在 {cx:+.2f}–{cx2:+.2f}px —— 整摊横着挪了地方")
        # 是**一整片**。渲染块数:外圈那几颗液滴删掉之后这里该**永远是 1**。
        # 这一条是**整组反过来**的看门人 —— 上一版写的是「必须 ≥3 块,而且块数还得变」
        # (那是在验「外围有独立的小液滴」)。现在它就守着一件事:谁也不许把液滴加回来,
        # 也不许把那一摊自己拉散(比如把 SPLAT_RING 调大、放大之后边上裂开)。
        comps_hi = max(m["comps"] for m in spf)
        comps_lo = min(m["comps"] for m in spf)
        if comps_hi != 1:
            bad.append(f"点击特效有 {comps_lo}–{comps_hi} 块 —— 该是 1 块(只有那一摊自己)。"
                       "多出来的是散开的碎块或者被加回来的液滴(用户的口径:「去掉那些小液滴」)")
    # 放大缩小:用户点名的那个数(中心球小一圈)是一半,另一半是**挨过骂的那三条**。
    #
    # 这个形状前后做了四版,后三版的评语就是下面这几组判据的来由 ——
    #   第一版 一圈摆在固定半径上的球       →「散射一下就定型了」
    #   第二版 相位跟着方位走的喷流         →「是从四面八方同时散射和聚拢,不是转着圈的」
    #   第三版 几颗同相位的呼吸             →「持续向所有方向散射/聚拢小液滴,不是现在这样」
    # 四版在光栅上量出来的数(不是想出来的):
    #                 同刻带宽(中位)  可见颗数   环半径均值整轮扫过    外沿
    #   第一版(摆好)  1.8 / 1.2px     6 固定     0(冻在固定半径上)   几乎不动
    #   第二版(错相)  5.5px           3~6        ≈0(轮着占位)        几乎不动
    #   第三版(同相)  ≤1.2px(抖动)    6 固定      ≈整段行程 9.8px      16→27px(1.6 倍)
    #   第四版(这一版)3.9~6.8px       4~5        恒定(≈15px)         18.9→20.3px(1.07 倍)
    #
    # 外沿这一列在第四版比引擎那边报的小 2px 左右(引擎的 outline 是几何上的
    # max(圆心距 + 半径),量到 21.7~22.9px)。差的是 goo 那把刀:最外面那颗
    # 已经快化掉了,半径小,模糊+陡阈值把它啃掉的比例就大(光栅上 13px 的母球
    # 也只剩 12.6px)。两处量的不是一回事,别拿两边对不上的数当矛盾 —— 所以
    # 下面那条阈值的余量按**光栅**这一列留。
    #
    # **读法在第三版和这一版之间又倒了一次,两次都得记住**,不然下次会照着旧的改回去:
    #   带宽那一列 —— 第一、二版要大,第三版要 ≈0,这一版又要大。但这一版的「大」
    #   跟第一、二版不是一回事:第一版是同刻同半径(带宽全靠抖动撑出来)、第二版是
    #   「同一批滴散在一条带上」,这一版是**不同生命阶段的滴同时在飞**(有人刚出生、
    #   有人飞到半路、有人快化掉)。判据只能问「带宽够不够大」,所以注释得写清楚它
    #   为什么大 —— 否则下一个人会以为这是第二版又回来了。
    #   外沿那一列 —— 第三版要「跟着胀缩(≥1.25 倍)」,那是同相位的产物;这一版是
    #   持续射流,外沿本来就该**稳稳的**(1.07 倍),所以那条断言在这一版必须删掉,
    #   换成「一直比默认球大、而且稳」。
    #   第三版的另一条锚「环半径均值整轮扫过 9.8px」同样删掉了:九颗相位错开之后,
    #   任何一帧看得见的都是「走到半路的那几颗」,均值本来就恒在 ≈15px 上 ——
    #   那条断言问的是「一起胀缩」,这一版正是**不要**一起胀缩。
    #
    # 「转着圈的」光栅这边**看不到**,得说清楚:这套形状是九重对称的,整圈一起转 40°
    # 和没转长得一模一样。所以那一半只能靠引擎级判据 —— test_hover.js 第 15 节逐帧量
    # 每颗的角度(偏离自己那条基准 ≤ ±4°)、出场次序的步长(不能恒定、不能连跑)、
    # 以及同刻可见的那几颗的最大空档(≤128°)。方向上的「往外 / 往里」同理:两个方向
    # 形状一模一样,差别只在时间取不取负,也交给第 15 节(那边量的是镜像恒等式)。
    z = ((("放大", full.get("zoomIn") or [])), (("缩小", full.get("zoomOut") or [])))
    if not z[0][1] or not z[1][1]:
        bad.append("放大缩小少了满状态帧")
    else:
        want_core = cfg["ZOOM_CORE"] * r0
        # 一颗液滴的圆心从原点走到最外要走多远(抖动只乘在这一段的后半截上,见引擎)
        travel = cfg["ZOOM_D"] - want_core
        for n, ms in z:
            # ── 一半:中心球。四句话 —— 比默认球小、停在 ZOOM_CORE·R0、在原点、一路只变小 ──
            if max(m["cen_r"] for m in ms) >= 0.75 * r0:
                bad.append(f"{n}的中心球半径到了 {max(m['cen_r'] for m in ms):.2f}px —— "
                           f"没比默认球({r0:.0f}px)小(该是 ZOOM_CORE 倍的它)")
            off = max(abs(m["cen_r"] - want_core) for m in ms)
            if off > 0.2:
                bad.append(f"{n}停稳之后中心球是 "
                           f"{min(m['cen_r'] for m in ms):.2f}–{max(m['cen_r'] for m in ms):.2f}px,"
                           f"用户点名的 {want_core:.2f}px 差了 {off:.2f}px")
            if max(m["cen_d"] for m in ms) > 0.5:
                bad.append(f"{n}的中心球不在原点(偏了 {max(m['cen_d'] for m in ms):.2f}px)"
                           " —— 「中心球」就不成立了")
            # 一路只变小、不回弹。这一族全程在往外送材料,中心球要是先瘦下去再胖回来,
            # 那就是「材料被抽走了又还回来」—— 材料守恒那套没落到实处。
            # 判据是「中心球半径是 q 的单调不增函数」,所以**按 q 排**,不是按时间排:
            # 时间轴上有进去(q:0→1)和出去(q:1→0)两段,退出时中心球本来就该长回 R0
            # (那是收拢,不是回弹)。按时间排的话,那一整段都会被当成「胖回去」。
            seq = sorted(((m["q"], m["cen_r"]) for m in reports["zoomIn" if n == "放大" else "zoomOut"]))
            rs = [r for _, r in seq]
            rise = max((b - a) for a, b in zip(rs, rs[1:])) if len(rs) > 1 else 0.0
            if rise > 0.05:
                bad.append(f"{n}的中心球中途胖回去过 {rise:.2f}px —— 材料被抽走又还回来了")
            if max(m["cen_r"] for m in ms) - min(m["cen_r"] for m in ms) > 0.3:
                bad.append(f"{n}停稳之后中心球自己在呼吸:"
                           f"{min(m['cen_r'] for m in ms):.2f}–{max(m['cen_r'] for m in ms):.2f}px"
                           " —— 材料在 q 到 ZOOM_FADE 之前就转完了,之后它该一动不动")
            # ── 另一半:九颗。**同刻必须散开** + 颗数真的在变 + 每个方向各走各的 ──
            #
            # 带宽(同一时刻看得见的那几颗,离原点多远的最大差)。这一版要它**大**:
            # 实测一轮里最挤的一帧 3.9px、最松的一帧 6.8px,而第三版同相位恒等于 0、
            # 第一版摆好的那圈只有 1.2~1.8px(全靠抖动)。所以这一条一箭三雕。
            # 变量名别用 sp —— 那是点击特效那格的量测表(上面 673 行),盖掉过一次
            spans = [m["vis_span"] for m in ms]
            if min(spans) < 3.0:
                bad.append(f"{n}有一帧看得见的几颗只散在 {min(spans):.2f}px 上"
                           " —— 那是「一起出去、一起回来」(同相位),不是持续散射")
            if max(spans) - min(spans) < 1.5:
                bad.append(f"{n}一轮里同刻的带宽一直卡在 {min(spans):.2f}–{max(spans):.2f}px"
                           " —— 没有换过一批滴(该有人刚出生、有人快化掉)")
            # 颗数。第三版是「六颗一直画得出来」;这一版**必须变** —— 颗数会变正是
            # 「有滴在出生、有滴在化掉」在像素上的样子(半径 <3.63px 的那两小段看不见)。
            nv = [m["n_drop"] for m in ms]
            if min(nv) < 3:
                bad.append(f"{n}有一帧看得见的液滴只剩 {min(nv)} 颗 —— 天上太空了")
            if max(nv) > 7:
                bad.append(f"{n}有一帧看得见 {max(nv)} 颗 —— 那不是液滴,是一圈摆开的球")
            if min(nv) == max(nv):
                bad.append(f"{n}一整轮里看得见的液滴一直是 {min(nv)} 颗 —— "
                           "没有滴在出生、也没有滴在化掉,那就是「一起胀缩」")
            # 同一时刻**不同方向**的半径差(rim 剖面 72 个方向的起伏)。这一条问的是
            # 「四面八方是不是各有各的阶段」:同相位时所有方向一样远,起伏只有液滴半径
            # 那一份(≈4px);这一版最近的在母球身上、最远的已经飞出去,实测十几 px。
            rp = [max(m["rim"]) - min(m["rim"]) for m in ms]
            if min(rp) < 8.0:
                bad.append(f"{n}有一帧各方向半径只差 {min(rp):.2f}px —— "
                           "九个方向挤在同一个阶段上,不是「四面八方同时散射」")
            # 外沿:一直比默认球大(**不是**跟着胀缩 —— 极性翻过了,见上面那段)。
            # 实测 18.9~20.3px(默认球是 13,直径 26 / 40 是 1.4 倍),所以 1.4·R0
            # 这条线余量只有 0.7px —— 够用,但别以为它松。
            ex = [m["extent"] for m in ms]
            if min(ex) < 1.4 * r0:
                bad.append(f"{n}外沿最小只有 {min(ex):.2f}px —— 没比默认球({r0:.0f}px)铺得开,"
                           "看着像什么都没发生")
            if max(ex) / min(ex) > 1.20:
                bad.append(f"{n}外沿一整轮在 {min(ex):.2f}–{max(ex):.2f}px 之间"
                           f"({max(ex)/min(ex):.2f} 倍)—— 这是「一起胀缩」,不是持续射流")
            # 连通块:既要有散开的时候,也要有并拢的时候(液滴在母球身上出生/化掉
            # 那两小段是并着的)。两头都卡,才拦得住「一圈摆开的球」和「一直一坨」。
            cp = [m["comps"] for m in ms]
            if max(cp) < 3:
                bad.append(f"{n}一轮里最多只有 {max(cp)} 块 —— 液滴从来没真正散开过")
            if min(cp) > 2:
                bad.append(f"{n}一轮里最少也有 {min(cp)} 块 —— 液滴从来没并进母球里,"
                           "「出生」和「化掉」就不是长出来、散掉了")
    # 几个方向必须真的是**同一根线**:同一批帧上,长短边彼此相等(在各自的坐标系里)。
    # 上面那一大段是「这根线像不像线」,这一句才是「它们是不是同一条线」——
    # 光栅这边能问到的最接近「同一份材料」的东西。
    if len(line_states) > 1:
        ref = line_states[0]
        # 逐帧对参考的那份差,最深的一对留在 same_worst 里 —— 成功那一行要把**实测的
        # 差**印出来(只印「对上了」的话,下一次收紧或放松就没人知道余量还剩多少)
        same_worst = (0.0, 0.0, "")
        for n in line_states[1:]:
            if len(full[n]) != len(full[ref]):
                # 逐帧比的前提是帧数一样。几格是同一批时刻抽出来的,不等就说明
                # dump_states 里那几格的停留时长/抽帧被人改得不一样了 —— 那种改动
                # 不该悄悄退化成一个「比了前面几帧」的通过
                bad.append(f"{n} 和 {ref} 的帧数不一样({len(full[n])} vs {len(full[ref])})"
                           " —— dump_states 里那几格本该只有角度不同")
                continue
            pairs = list(zip(full[n], full[ref]))
            dl = max(abs(a["fl"] - b["fl"]) for a, b in pairs)
            ds = max(abs(a["fs"] - b["fs"]) for a, b in pairs)
            if max(dl, ds) > max(same_worst[0], same_worst[1]):
                same_worst = (dl, ds, f"{full[n][0]['deg']:g}°")
            if max(dl, ds) > 1.0:
                bad.append(f"{full[n][0]['deg']:g}° 和 {full[ref][0]['deg']:g}° 对不上"
                           f"(长边差 {dl:.2f}px、短边差 {ds:.2f}px)"
                           f" —— 「同一根线转到各自的轴上」不成立")
    if bad:
        print("  ⚠ 有问题:")
        for s in bad:
            print(f"    - {s}")
    else:
        print("  可点击:一坨、中心实、边缘在动。不可点击:多滴、中心空、外沿有界且在呼吸。")
        deglist = ", ".join(f"{full[n][0]['deg']:g}°" for n in line_states)
        print(f"  一条线({deglist}):中心实、比球窄、比球长、整条在蠕动"
              " —— 而且各方向量出来是同一条线。")
        if len(line_states) > 1:
            print(f"          逐帧对 {full[line_states[0]][0]['deg']:g}° 那根,最深的一对是 "
                  f"{same_worst[2]} 的长边差 {same_worst[0]:.2f}px、短边差 {same_worst[1]:.2f}px"
                  f"(上界 1.00 —— 差的多半是像素网格和 goo 对边缘的取舍,不是形状)")
        print(f"  文本:两颗球(两头 {min(m['prof_fat'] for m in bf):.1f}–"
              f"{max(m['prof_fat'] for m in bf):.1f}px 宽 = "
              f"{min(m['prof_fat'] for m in bf)/(2*r0):.2f}× 球)由中间一丝连着"
              f"(腰 {waist_lo_b:.1f}px、细/粗 最大 {ratio_hi_b:.2f}),整条 "
              f"{ph_lo_b:.1f}–{ph_hi_b:.1f}px 高"
              " —— 一块、连着、两头是球,不是两粒摆在那儿的球。")
        print(f"  点击特效:那一摊是个圆(椭圆率 {max(m['ell'] for m in spf):.2f})、"
              f"比球大一圈(等效直径 {min(m['pad'] for m in spf):.1f}px,球 {2*r0:.0f}px)、"
              f"中心实而整摊坐在指针上(重心偏不到 1px)、而且**就一整片**"
              f"(任何一帧都是 {min(m['comps'] for m in spf)} 块,没有碎块、没有液滴)"
              " —— 俯视看下去按下,一摊液体摊开。")
        dz = [m["n_drop"] for m in z[0][1]]
        print(f"  放大缩小:中心球比默认球小、停在 ZOOM_CORE·R0、就在原点上、一路只变小;"
              f"{cfg['ZOOM_COUNT']} 颗各走各的一生 —— 任一时刻看得见的 {min(dz)}～{max(dz)} 颗"
              f"散在不同距离上(有人刚出生、有人半路、有人快化掉),"
              "外沿一直比默认球大而且稳(持续射流,不是一起胀缩)。")
        print(f"  {len(data['states'])} 种 q=0 都精确回收成一颗 R0 的球。")

    # ---- 联络表:每个状态各一行,进场 / 停留 / 收场 ----
    shots = data["shots"]
    per_state = max(len(data["states"][k]["frames"]) for k in data["states"])
    rows = (len(shots) + COLS - 1) // COLS
    W, H = COLS * CELL, rows * (CELL + 18)
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
    except Exception:
        font = ImageFont.load_default()

    for i, f in enumerate(shots):
        cx = (i % COLS) * CELL
        cy = (i // COLS) * (CELL + 18)
        mask = goo_mask(f["balls"], r0, CELL, S, blur, sharp, cut)
        tile = Image.new("RGB", (CELL, CELL), BG)
        tile.paste(Image.new("RGB", (CELL, CELL), INK), (0, 0), mask)
        sheet.paste(tile, (cx, cy))
        d.rectangle([cx, cy, cx + CELL - 1, cy + CELL - 1], outline=(214, 205, 198))
        d.text((cx + 4, cy + CELL + 3),
               f'{f["state"]} {f["t"]:.0f}ms q={f["q"]:.2f}', fill=(90, 85, 80), font=font)

    sheet.save(sys.argv[2])
    print("\nwrote", sys.argv[2], sheet.size)


if __name__ == "__main__":
    main()
