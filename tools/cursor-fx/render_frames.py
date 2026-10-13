#!/usr/bin/env python3
"""校验并渲染 cursor-fx 的液体动画。

goo 的模糊半径和阈值从 dump 里读,和 cursor-fx.js 的 CFG 同源,
不会出现「校验脚本和实现参数不一致」这种假绿灯。

1. 面积守恒 —— 光栅化数像素,量的是眼睛真正看到的那块黑色面积。
   基准不用 πr²(那会被光栅化本身的偏差污染),而用同一个光栅器画出来的静止单球。
   判据是并集:球分开时并集 = 单球,重叠时并集必然小于份额之和。
2. 联络表 —— 如实复现 alpha 模糊 + 陡峭阈值,图上看到的颈缩就是浏览器里会出现的。
"""
import json
import math
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 3                 # 渲染放大倍数
# 3 倍下可视半宽 44px。环心在指针下方 RING_D,所以图形整体是往下坠的:
# 环转最宽时球形外沿到指针 15.5+15.5+7.51 ≈ 38.5px,留够余量不裁边。
CELL = 264
COLS = 6

BG = (241, 235, 230)
INK = (20, 20, 22)
RASTER = 320          # 面积检查的光栅化边长


def union_area(balls, r0):
    """三个圆的并集面积(像素²)。"""
    img = Image.new("1", (RASTER, RASTER), 0)
    d = ImageDraw.Draw(img)
    for b in balls:
        r = r0 * b["scale"]
        cx = RASTER / 2 + b["x"]
        cy = RASTER / 2 + b["y"]
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=1)
    return int(np.count_nonzero(np.asarray(img)))


def union_area_exact(balls, r0, n=1440):
    """任意摆位的三个圆的并集面积,解析算。

    极坐标沿每个方向 φ 求出被圆盖住的区间,合并后积 ½Σ(b²−a²)。
    区间合并让「原点落在所有圆外面」这种情形也自然成立 —— 因为这里的三个球
    摆位是任意的(不像引擎里那样固定 120°),只取最远边界会算错。
    """
    two_pi = 2 * math.pi
    acc = 0.0
    for i in range(n):
        phi = (i + 0.5) * two_pi / n
        cos_p, sin_p = math.cos(phi), math.sin(phi)
        iv = []
        for b in balls:
            r = r0 * b["scale"]
            if r <= 0:
                continue
            # 圆心在 (px,py),射线上最近点的参数 c、半弦 h
            c = b["x"] * cos_p + b["y"] * sin_p
            perp = -b["x"] * sin_p + b["y"] * cos_p
            disc = r * r - perp * perp
            if disc <= 0:
                continue
            h = math.sqrt(disc)
            if c + h <= 0:
                continue
            iv.append((max(0.0, c - h), c + h))
        if not iv:
            continue
        iv.sort()
        cur = iv[0]
        for lo, hi in iv[1:]:
            if lo <= cur[1]:
                if hi > cur[1]:
                    cur = (cur[0], hi)
            else:
                acc += cur[1] ** 2 - cur[0] ** 2
                cur = (lo, hi)
        acc += cur[1] ** 2 - cur[0] ** 2
    return 0.5 * two_pi / n * acc


def min_visible_r(size, zoom, blur, sharp, cut, r0):
    """模糊 + 阈值之后还画得出来的最小半径。

    比这更小的球,中心的高斯 alpha 都到不了 0.5,直接被吃掉 —— 它在几何里存在,
    在屏幕上不存在。判断「两个球连不连」时必须先把它排除,否则会量到一条
    根本看不见的「连接」(分裂刚开始时那个种子球就属于这一类)。
    用二分找,不用公式近似。
    """
    lo, hi = 0.0, r0
    for _ in range(24):
        mid = (lo + hi) / 2
        m = goo_mask([{"x": 0, "y": 0, "scale": mid / r0}], r0, size, zoom, blur, sharp, cut)
        if int(np.count_nonzero(np.asarray(m))) == 0:
            lo = mid
        else:
            hi = mid
    return hi


def goo_bool(balls, r0, size, zoom, blur, sharp, cut):
    """goo 之后的二值掩膜,用来量颈缩。"""
    return np.asarray(goo_mask(balls, r0, size, zoom, blur, sharp, cut)) > 127


def pair_state(mask, size, zoom, p, q, rp, rq):
    """这一对球在渲染里是连着还是断开;连着的话顺带量一下颈有多宽。

    判据是「两球边界之间那段缝的中点有没有前景」—— 缝的中点是颈最细的地方。
    取两球中心的中点会错:一大一小时它落在大的那个球里面,量到的是球的宽度,
    和颈毫无关系(这个坑踩过一次)。返回 (是否相连, 颈宽或 None)。
    """
    dx, dy = q[0] - p[0], q[1] - p[1]
    L = math.hypot(dx, dy)
    if L < 1e-9:
        return True, None
    if L - rp - rq <= 0:
        return True, None               # 几何上就叠着,必然连
    ux, uy = dx / L, dy / L
    a = (p[0] + ux * rp, p[1] + uy * rp)
    b = (q[0] - ux * rq, q[1] - uy * rq)
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    vx, vy = -uy, ux
    step = 0.5 / zoom

    def on(t):
        x = int(round(size / 2 + (mx + vx * t) * zoom))
        y = int(round(size / 2 + (my + vy * t) * zoom))
        return 0 <= x < size and 0 <= y < size and mask[y, x]

    if not on(0.0):
        return False, None
    total = 0.0
    for s in (1.0, -1.0):
        t = 0.0
        while abs(t) < 2 * max(rp, rq) and on(t + s * step):
            t += s * step
        total += abs(t)
    return True, total


def goo_mask(balls, r0, size, zoom, blur, sharp, cut):
    """alpha 掩膜 -> 高斯模糊 -> 陡峭阈值,得到液体轮廓。

    zoom 是放大倍数:**坐标和半径一起放大**,σ 也跟着放大,所以图里球与球的比例
    和浏览器 1:1 时逐像素一致,只是看得清楚些。这一条必须成对 —— 只放大半径不放大
    坐标,三个球会被凭空糊成一坨,看着像液体,其实浏览器里根本不那样。
    """
    hi = size * 2                 # 先按两倍画再缩回去,当抗锯齿用
    img = Image.new("L", (hi, hi), 0)
    d = ImageDraw.Draw(img)
    for b in balls:
        r = r0 * b["scale"] * zoom * 2
        if r <= 0.25:
            continue
        cx = hi / 2 + b["x"] * zoom * 2
        cy = hi / 2 + b["y"] * zoom * 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    img = img.filter(ImageFilter.GaussianBlur(blur * zoom * 2))
    a = np.asarray(img).astype(np.float32) / 255.0
    out = np.clip(sharp * a - sharp * cut, 0.0, 1.0)
    return Image.fromarray((out * 255).astype(np.uint8), "L").resize((size, size), Image.LANCZOS)


def main():
    data = json.load(open(sys.argv[1]))
    rep = data["report"]
    cfg = rep["cfg"]
    r0 = rep["r0"]
    blur, sharp, cut = cfg["GOO_BLUR"], cfg["GOO_SHARP"], cfg["GOO_CUT"]

    print("=== 几何 ===")
    print(f"总时长 {rep['total']}ms,采样间隔 {rep['frameDtMs']:.2f}ms"
          f"  旋转总角 {rep['totDeg']}°")
    print(f"阶段: " + "  ".join(f"{n}:{d:.0f}" for n, d in rep["phases"]))
    print(f"最大帧间位移 {rep['maxJumpPx']:.3f}px @ {rep['maxJumpAt']:.0f}ms"
          f"  →  峰值速度 {rep['peakSpeed']:.0f} px/s")

    rc = rep["ringCentre"]
    print(f"环心: 在指针下方 {rc['y']}px(球也在它上方 —— 旋转中心在球下方 "
          f"{rc['belowBall']})")
    print(f"      三球到环心的距离误差 {rc['radiusError']:.2e}px  母球静止时到环心 "
          f"{rc['parentOnRing']}px")
    ps = rep["parentStill"]
    print(f"母球不动: 从 0 到 {ps['untilMs']:.0f}ms 最大漂移 {ps['maxDriftPx']:.6f}px"
          f"(环撑齐才离开原位)")
    op = rep["orbitsParent"]
    print(f"第二个球绕的是环心不是母球: spin1 全程到环心距离偏差 "
          f"{op['maxRadiusErrPx']:.4f}px(目标 {op['targetPx']}px)")

    sp = rep["spin"]
    ms = sp["milestoneDegs"]
    print(f"旋转: 全程第二个球转过 {sp['totalSweepDeg']}°  单调 {sp['monotonic']}"
          f"  (spin1 段 {sp['spin1SweepDeg']}°, split2 段 {sp['split2SweepDeg']}°)")
    print(f"里程碑: 芽脱离母球表面 Δ={ms['landDeg']}°"
          f"  第三个球出生 Δ={ms['cBirthDeg']}°(应 =120°)"
          f"  母球起步 Δ={ms['aStartDeg']}°(应 =240°)")
    sep = sp["separationDeg"]
    print(f"脱离表面: 第二个球 Δ={sep['b']}°(应 ≈ {ms['landDeg']}°: 一离开就正好相切)"
          f"  第三个球 Δ={sep['c']}°")

    sl = rep["splits"]
    print(f"分裂: 新生球出生时离母球 {sl['cBirthOffset']:.3f}px(几乎重合)")
    print(f"      Δ={ms['landDeg']}° 时缩放 {sl['shareAtLand']}"
          f"  —— 第二个球已经是最终大小 √(1/3)=0.5774,母球 √(2/3)=0.8165 更大")
    print(f"      那一刻圆心距 {sl['landDistPx']}px = 半径和 {sl['landRadiusSumPx']}px(正好相切)")
    print(f"      第二个球落点: 到环心 {sl['bRadiusAfterSplit']}px"
          f"  相对环心 {sl['bAngleAfterSplit']}°")

    r = rep["ring"]
    print(f"环成型: 间距 {r['gapsDeg']}°  缩放 {r['scales']}"
          f"  到环心 {r['radii']}  重心 {r['centroid']}")
    print(f"        orbit 全程保持 120° 等分: {r['holds']}(中途抽检 {r['midGapsDeg']}°)")
    print(f"合并起: 缩放 {rep['mergeStart']['scales']}  最远 {rep['mergeStart']['spread']}px"
          f"   合并终: 缩放 {rep['mergeEnd']['scales']}"
          f"  离指针 {rep['mergeEnd']['centreErrPx']:.3f}px")
    print(f"goo: 模糊 {blur}  阈值 {cut}  斜率 {sharp}")

    # 基准:同一个光栅器画的静止单球
    rest_balls = data["frames"][0]["balls"]
    baseline = union_area(rest_balls, r0)
    print(f"\n=== 并集面积守恒(基准 = 静止单球 {baseline}px²)===")
    byphase = {}
    worst = None
    for f in data["frames"]:
        a = union_area(f["balls"], r0)
        err = (a - baseline) / baseline * 100
        byphase.setdefault(f["phase"], []).append(err)
        if worst is None or abs(err) > abs(worst[0]):
            worst = (err, f["t"], f["phase"])
    # 逐阶段的顺序直接取引擎给的时间轴,这边不再抄一份
    for ph, _ in rep["phases"]:
        if ph in byphase:
            e = byphase[ph]
            bar = "#" * max(1, int(abs(max(e, key=abs)) / 2))
            print(f"  {ph:7s} {min(e):+6.1f}% ~ {max(e):+6.1f}%  {bar}")
    print(f"最大偏差 {worst[0]:+.1f}% @ {worst[1]:.0f}ms ({worst[2]})")
    print("  注:光栅器数像素对小球偏胖(周长/面积更大),分裂段的小球多,数字偏正。")

    # 光栅化的偏差有多大,量一下才知道 —— 解析基准 πR0² 才是真正的几何真相
    exact_base = math.pi * r0 * r0
    print(f"\n=== 同上,但解析计算(基准 πR0² = {exact_base:.1f}px²)===")
    byphase2 = {}
    worst2 = None
    for f in data["frames"]:
        a = union_area_exact(f["balls"], r0)
        err = (a - exact_base) / exact_base * 100
        byphase2.setdefault(f["phase"], []).append(err)
        if worst2 is None or abs(err) > abs(worst2[0]):
            worst2 = (err, f["t"], f["phase"])
    for ph, _ in rep["phases"]:
        if ph in byphase2:
            e = byphase2[ph]
            bar = "#" * max(1, int(abs(max(e, key=abs)) / 2))
            print(f"  {ph:7s} {min(e):+6.1f}% ~ {max(e):+6.1f}%  {bar}")
    print(f"最大偏差 {worst2[0]:+.1f}% @ {worst2[1]:.0f}ms ({worst2[2]})")

    # ---- 颈缩:眼睛看到的到底是「分开了」还是「还连着」----
    # 几何上的边界缝说明不了问题 —— 缝 2.6px 的时候 goo 仍然留着一条可观的颈,
    # 缝 8px 的时候才彻底断。这一栏量的就是那条颈本身。
    # 探针网格要罩得住整个环 —— 环心在指针下方,图形是往下坠的(最远约 38.5px),
    # 而且 pair_state 还要从缝的中点再往外走 2·max(r),所以半宽得给到 60px。
    PROBE, PZ = 480, 4.0
    print(f"\n=== goo 颈缩(模糊 {blur} / 阈值 {cut} / 斜率 {sharp})===")
    # 先看静止单球经过 goo 之后还剩多大 —— 阈值会把轮廓往里收,屏幕上的球未必正好 26px
    rest_ball = [{"x": 0, "y": 0, "scale": 1.0}]
    rm = goo_bool(rest_ball, r0, PROBE, PZ, blur, sharp, cut)
    r_eff = math.sqrt(int(np.count_nonzero(rm)) / math.pi) / PZ
    r_min = min_visible_r(PROBE, PZ, blur, sharp, cut, r0)
    print(f"  静止单球:几何半径 {r0:.2f}px → goo 之后 {r_eff:.2f}px(直径 {2*r_eff:.1f}px)")
    print(f"  画得出来的最小半径 {r_min:.2f}px —— 比这更小的球在屏幕上不存在,判定时按「没有」处理")
    print("  阶段      进度   球对     边界缝      颈宽(渲染)")
    for f in data["shots"]:
        bs = f["balls"]
        m = goo_bool(bs, r0, PROBE, PZ, blur, sharp, cut)
        rows = []
        for i, j in ((0, 1), (1, 2), (0, 2)):
            if r0 * bs[i]["scale"] < r_min or r0 * bs[j]["scale"] < r_min:
                continue                       # 小到画不出来的球不参与判定
            ri, rj = r0 * bs[i]["scale"], r0 * bs[j]["scale"]
            dij = math.hypot(bs[i]["x"] - bs[j]["x"], bs[i]["y"] - bs[j]["y"])
            con, nw = pair_state(m, PROBE, PZ, (bs[i]["x"], bs[i]["y"]),
                                 (bs[j]["x"], bs[j]["y"]), ri, rj)
            rows.append((f"{i}-{j}", dij - ri - rj, nw, con))
        for k, (pair, gap, nw, con) in enumerate(rows):
            head = f"  {f['phase']:7s} {f['p']:5.2f}  {pair}" if k == 0 else " " * 18 + pair
            if not con:
                nws = "   断开 "
            elif nw is None:
                nws = "  一片  "
            else:
                nws = f"{nw:6.2f}px"
            print(f"{head:24s} {gap:+7.2f}px  {nws}")

    # ---- 连线随时间的通断:闪断(断开又接回去)必须一眼看得出来 ----
    # 采样点从 frames 里取,不另外造时间轴。同一对球上「连-断-连」出现两段以上短促的
    # 连或断,就是渲染在闪,不是设计。
    print(f"\n=== 通断时间线(每 {int(round(len(data['frames']) / 200))} 帧取一帧)===")
    step_i = max(1, len(data["frames"]) // 200)
    # 三种取值:1 连着 · 0 断开 · 2 球还没画出来(几何上存在,屏幕上没有)。
    # 第三种必须单独记 —— 把它并进「断开」会让人以为分裂一开始就断了,
    # 其实那会儿芽还在母球肚子里、根本没到画得出来的大小。
    series = [[], [], []]
    times = []
    first_seen = [None, None, None]             # 每个球第一次画得出来的时刻
    born_attached = [None, None, None]
    for f in data["frames"][::step_i]:
        bs = f["balls"]
        m = goo_bool(bs, r0, PROBE, PZ, blur, sharp, cut)
        times.append(f["t"])
        vis = [r0 * b["scale"] >= r_min for b in bs]
        for bi in range(3):
            if vis[bi] and first_seen[bi] is None:
                first_seen[bi] = f["t"]
                born_attached[bi] = False
        for idx, (i, j) in enumerate(((0, 1), (1, 2), (0, 2))):
            if not (vis[i] and vis[j]):
                series[idx].append(2)
                continue
            ri, rj = r0 * bs[i]["scale"], r0 * bs[j]["scale"]
            con, _ = pair_state(m, PROBE, PZ, (bs[i]["x"], bs[i]["y"]),
                                (bs[j]["x"], bs[j]["y"]), ri, rj)
            series[idx].append(1 if con else 0)
            if con:
                for bi in (i, j):
                    if first_seen[bi] == f["t"]:
                        born_attached[bi] = True

    problems = []
    LABEL = {0: "断", 1: "连", 2: "未成形"}

    # 判据一:每个球第一次出现在屏幕上时,必须是长在已有的一坨上的。
    # 一出场就是孤零零一个小球 = 凭空冒出来,液体不会那样。
    # 开场就在的那个球不算 —— 它就是母球,没有「之前」可言。
    for bi in range(3):
        if first_seen[bi] is None:
            problems.append(f"球{bi} 从头到尾没出现过")
        elif first_seen[bi] > times[0] and not born_attached[bi]:
            problems.append(f"球{bi} 在 {first_seen[bi]:.0f}ms 一出现就是孤立的(应该先连在母球上)")

    for idx, (i, j) in enumerate(((0, 1), (1, 2), (0, 2))):
        seq = series[idx]
        runs = []
        s0 = 0
        for k in range(1, len(seq) + 1):
            if k == len(seq) or seq[k] != seq[s0]:
                runs.append((seq[s0], times[s0], times[min(k, len(times) - 1)]))
                s0 = k
        seg = "  ".join(f"{LABEL[v]} {a:.0f}–{b:.0f}ms" for v, a, b in runs)
        print(f"  球{i}-球{j}: {seg}")
        # 判据二:一对球最多只能连起来两次 —— 出生时连着、最后合并时再连。
        # 超过两次就说明中间断开了又接回去,那是闪,不是设计。
        episodes = [r for r in runs if r[0] == 1]
        if len(episodes) > 2:
            det = ", ".join(f"{a:.0f}–{b:.0f}ms" for _, a, b in episodes)
            problems.append(f"球{i}-球{j} 连上了 {len(episodes)} 次({det})—— 断了又接回去")

    if problems:
        print("\n  ⚠ 有问题:")
        for s in problems:
            print(f"    - {s}")
    else:
        print("\n  每个球都是长在母球上出生的;每一对最多只连两次(出生一次、合并一次)。")

    # ---- 联络表 ----
    shots = data["shots"]
    rows = (len(shots) + COLS - 1) // COLS
    W, H = COLS * CELL, rows * (CELL + 16)
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
    except Exception:
        font = ImageFont.load_default()

    for i, f in enumerate(shots):
        cx = (i % COLS) * CELL
        cy = (i // COLS) * (CELL + 16)
        mask = goo_mask(f["balls"], r0, CELL, S, blur, sharp, cut)
        tile = Image.new("RGB", (CELL, CELL), BG)
        tile.paste(Image.new("RGB", (CELL, CELL), INK), (0, 0), mask)
        sheet.paste(tile, (cx, cy))
        d.rectangle([cx, cy, cx + CELL - 1, cy + CELL - 1], outline=(214, 205, 198))
        d.text((cx + 4, cy + CELL + 2),
               f'{f["t"]:.0f} {f["phase"]} {f["p"]:.2f}',
               fill=(90, 85, 80), font=font)

    sheet.save(sys.argv[2])
    print("\nwrote", sys.argv[2], sheet.size)


if __name__ == "__main__":
    main()
