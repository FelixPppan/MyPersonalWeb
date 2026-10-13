#!/usr/bin/env python3
"""把「从半路的形状按下去 / 松手」这一趟画出来,现在和以前对着看。

为什么要这张图:用户的原话是「如果点击的时候鼠标状态不是普通状态,不要先变成普通状态
再点击,而是直接过渡到点击状态」—— 这话本身就是眼睛提出来的。test_hover.js 第 14 节把
它量成了数(最像一颗普通球的那一帧:以前 3.60px²,现在 126.65px²),但「126px²」长什么
样,不看一眼是不知道的;万一度错了东西(比如量的是面积而不是样子),数再漂亮也没用。

上面两行是**沙盒里真实画到**的帧(HANDOFF_DUMP=... node test_hover.js 吐出来的),
下面两行是算的 —— 旧行为已经不在代码里了,只能按它当时的样子重演:先把那一格按 35ms
收成一颗球(收到 EPS),再从一颗球长起来。

goo 的复现直接 import render_frames,所以这张图和浏览器里看到的是同一个东西。

    HANDOFF_DUMP=/tmp/handoff.json node test_hover.js
    python3 render_handoff.py /tmp/handoff.json handoff.png
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

from render_frames import goo_mask

S = 4                       # 放大倍数:一帧最大 44px(那一摊),4 倍刚好不切边
CELL = 288                  # 和 render_states.py 同尺寸,两张图能直接摞着看
BG = (241, 235, 230)
INK = (20, 20, 22)

# 这张图的字是中文,上面两个 render 用的 DejaVu 里没有汉字 —— 直接拿来画会画成一排
# 豆腐块(试过,整张图的说明和行名全是方框,数对了但读不出来)。挑字体的顺序:先找
# 带汉字的,找不到才退回 DejaVu,免得在没有 CJK 字体的机器上直接崩。
CJK_FONTS = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]


def pick_font(size):
    for path in CJK_FONTS:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def main():
    data = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    r0 = data["r0"]
    goo = data["goo"]
    rows = data["rows"]
    cols = max(len(r["shots"]) for r in rows)
    gutter = 132               # 左边留给「这是哪一行」

    sheet = Image.new("RGB", (gutter + cols * CELL, len(rows) * (CELL + 20) + 26), BG)
    d = ImageDraw.Draw(sheet)
    font = pick_font(12)

    d.text((6, 6), "按下 / 松手都落在「可点击」那一坨上 —— 中间那几格是实的还是空的,"
                   "就是「有没有先变回普通光标」", fill=(90, 85, 80), font=font)

    for r, row in enumerate(rows):
        y = 26 + r * (CELL + 20)
        for c, shot in enumerate(row["shots"]):
            x = gutter + c * CELL
            mask = goo_mask(shot["balls"], r0, CELL, S, goo["blur"], goo["sharp"], goo["cut"])
            tile = Image.new("RGB", (CELL, CELL), BG)
            tile.paste(Image.new("RGB", (CELL, CELL), INK), (0, 0), mask)
            sheet.paste(tile, (x, y))
            d.rectangle([x, y, x + CELL - 1, y + CELL - 1], outline=(214, 205, 198))
            q = f' q={shot["q"]:.2f}' if "q" in shot else ""
            o = f' 退场:{shot["out"]}' if shot.get("out") else ""
            d.text((x + 4, y + CELL + 3), f'{shot["t"]:.0f}ms{q}{o}',
                   fill=(90, 85, 80), font=font)
        # 行名换行画(名字比 gutter 长):「现在 / 以前」各一行
        name = row["name"]
        head, tail = (name.split("(", 1) + [""])[:2] if "(" in name else (name, "")
        d.text((6, y + CELL // 2 - 18), head, fill=(40, 38, 36), font=font)
        d.text((6, y + CELL // 2 - 4), "(" + tail if tail else "", fill=(120, 112, 106), font=font)

    sheet.save(out)
    print("wrote", out, sheet.size)


if __name__ == "__main__":
    main()
