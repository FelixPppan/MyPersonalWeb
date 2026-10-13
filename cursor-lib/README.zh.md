# cursor-embed

一颗会按元素变形状的液体光标。零依赖,两个文件,不写一行 JS。

v1.0.0 · 124 KB(js + css,gzip 后 47 KB)· 现代浏览器 · 商用许可

[English](README.md) · 中文说明(这份)

## 装进去

```html
<link rel="stylesheet" href="cursor-embed.css">
<script src="cursor-embed.js"></script>
```

放 `<head>` 里,或者 `</body>` 前面,哪儿都行。指针划过什么,它就长成什么 —— 按钮上摊成一坨、
输入框里牵成一丝、拖拽把手上拉成一条。**你现有的 CSS 一个字都不用改。**

想先看效果:直接打开 `demo.html`。那一页自己就在用它。

## 它怎么知道该变成什么

四条通道,从上往下,先说话的那条赢:

1. **`data-cursor="pointer"`** —— 写在 HTML 里,不用碰 CSS。
2. **`--cursor: pointer`** —— 是个 CSS 变量,会继承。适合「这个区块里都是我自己的控件」。
3. **元素自己的 `cursor`** —— 你本来就在写的那套,直接拿来用。
4. **元素本身是什么** —— `<button>` `<a href>` `<select>` `<input type=checkbox>` 认作可点击,
   `<input>` `<textarea>` `<option>` 里的文本类,和 `[contenteditable]`,认作文本。

第 ④ 条不是多余的:浏览器**根本不给 `<button>` 一个 `cursor: pointer`**。只看第 ③ 条的话,
一段什么都没改的 HTML 划过按钮会毫无反应 —— 那样它看起来就是坏的。

想关掉某一块的推断,写 `data-cursor="auto"` 或者 `--cursor: auto`。这两个值是明确的
「我不提要求」,不是「没写」。

## 形状

标准光标关键字里,24 个有画法:

| 值 | 画出来是什么 |
| --- | --- |
| `pointer` | 一坨向指针聚拢的液体 |
| `grab` | 和 `pointer` **同一个形状**(所以两族之间来回换不会白收拢一次) |
| `not-allowed` · `no-drop` | 一圈散开的环,中间是空的 |
| `text` | 两颗球,中间牵着一丝 |
| `zoom-in` · `zoom-out` | 九个方位,一茬一茬地散开 / 聚拢 |
| `col-resize` `e-resize` `w-resize` `ew-resize` | 横着一条 |
| `row-resize` `n-resize` `s-resize` `ns-resize` | 竖着一条 |
| `nwse-resize` `nw-resize` `se-resize` | 斜着 45° |
| `nesw-resize` `ne-resize` `sw-resize` | 斜着 −45° |
| `grabbing` · `move` · `all-scroll` | 按住不放时摊开的那一片 |

**按住不放**是一个独立的状态:在任何可点的地方按下去,它摊开成一片;松手时从摊开**直接**收回
原来那个形状,中间不经过一颗普通球 —— 从 q=0 收回去会闪一下普通光标,那正是要避免的。

剩下 9 个没有画法 —— `crosshair` `help` `wait` `progress` `cell` `alias` `copy`
`context-menu` `vertical-text`。要了这些值的地方,**系统光标原样留着**,球还在,只是不变形。
把原装的那个藏掉却不给替代,是最坏的结果,所以这里宁可什么都不做。

## 配置

```js
CursorEmbed.init({
  size: 34,
  color: "#b3253a"
});
```

改配置就是再调一次 `init()`:旧的连同它写下的行内 `cursor` 一起收拾干净,新的原地接上 ——
**球不会闪掉**,因为它记着指针在哪。调多少次都不会在页面上留下垃圾。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `size` | `26` | 球的直径(px)。形状按它等比缩放,调大了整坨一起变大 |
| `color` | `""` | `""` = 出厂那颗带高光的黑球;字符串 = 纯色;`{ hi, mid, lo, ink }` = 自己定四个渐变停靠点 |
| `press` | `0.14` | 按下时缩掉的比例。`0` 就是不缩 |
| `speed` | `1` | 形状进出的快慢倍率。`2` 是两倍快 |
| `shadow` | `true` | 要不要投影 |
| `zIndex` | `9999` | 壳所在的层。你的东西压在它上面就调大它 |
| `hideNative` | `true` | 藏系统光标。关掉就是球和箭头并存 |

除此之外的都不往外放 —— 环的半径、液滴的个数、各处摆动、时间常数。**那些是形状本身**,
动它们不是「调一下」,是改设计。

## 接口

不用管它的时候,它自己起来、自己判断,一行 JS 都不用写。想插手的时候有这几个口子:

| 调用 | 作用 |
| --- | --- |
| `CursorEmbed.init(opts?)` | 起一份实例并返回它。**改配置也走这里** |
| `CursorEmbed.instance()` | 拿到当前那一份,没有就是 `null` |
| `CursorEmbed.destroy()` | 收走。给元素补过的每一条行内 `cursor` 都按原值、连原来的 `!important` 一起还回去 |
| `CursorEmbed.boot()` | 加了 `data-manual` 之后,用它手动起 |
| `inst.set(value)` | 手动指定形状,压过自动判断。传 `null` 交还给自动。给了不认识的值返回 `false` 而且**什么都不动** |
| `inst.setWaiting(true)` | 你自己的等待态:收成一颗普通球,但球留着不消失。事情完了传 `false` |
| `inst.refresh(el?)` | 元素的样式是后来改的,叫它重读一次。不传 `el` 就是清空全部缓存重来 |
| `inst.destroy()` | 只收这一份 |

### 自己接管起步时机

```html
<script src="cursor-embed.js" data-manual></script>
<script>
  CursorEmbed.init({ size: 34 });
</script>
```

`data-manual` 是在**脚本求值的那一刻**读的 —— 那时候 `document.currentScript` 还答得上
「是哪个 script 起的我」。所以这个属性得写在那个标签上,不能事后再加。

## 放进真项目里

**性能。** 指针停下、形状也收干净之后,它会把动画帧停掉。跟手本身不占帧 —— 位置是直接写在
`transform` 上的,不经过帧。还有帧在跑只有两种情况:指针正停在一个形状上(那一坨本身一直在动),
或者有东西正在进、出。用户切去别的窗口时它不烧 CPU。

**框架。** 它只认 DOM,不关心是谁渲染的。React、Vue、Svelte 都能用,不需要包装成组件。
唯一要记的是:框架把节点换成新的之后,新那个还没被读过 —— 换完叫一次 `inst.refresh(el)`。
整块重渲染就叫 `inst.refresh()`,清空重来。两个都只走它自己读过的那些元素,不是遍历整页。

## 遇到问题

发邮件到 **panguoxipgx@gmail.com**。把页面或者一段能打开的最简 HTML 一起带上,一个链接比
一段描述管用得多。买之前想问清楚什么,也发这里。

## 装之前该知道的

- **触屏不启用。** 那里没有系统光标可藏,手指底下也没有「划到某块元素上」这件事,
  接上去只是白占一层 DOM。这一条是默认行为,不用配。
- **每个元素第一次被划到时,可能闪一帧系统光标。** 因为必须先读到它自己的 `cursor` 值,
  才知道该藏不该藏。之后就进缓存了,不再读也不再闪。
- **一次只有一份。** 再调 `init()` 是换掉上一只,不是并存两只。
- **减弱动效打开时不形变也不缩**,只剩一颗跟着指针走的球。这是读系统的
  `prefers-reduced-motion`,不是你配的。
- **指针离开窗口、窗口失焦,它都会收起来。**
- **靠 SVG 的 goo 滤镜成形**,所以是现代浏览器的东西。老引擎上球还在,形状不会出现。
- **单页应用里,它记着每一个划过的元素。** 元素被移出 DOM 之后,这一条记录要等到你叫
  `inst.refresh()` 或 `destroy()` 才清掉。记录很小,但一个开一整天的后台页面会一直攒 ——
  在自己的路由切换处叫一次 `refresh()` 就行。

## 许可

商用许可,不是开源许可。**一句话版:买回去,随便用在多少个项目里都行,商业的也行,
改也行,不用署名;但不能把它本身(或它的实质部分)当库、模板、主题再分发出去。**

完整的条款在 `LICENSE.txt`(英文为准,附中文译文)。这份许可是照着常见做法写的,
**不是律师意见** —— 真要较真,拿去给律师过一眼。

© 2026 Guoxi Pan。

## 包里有什么

```
cursor-embed.js     光标本体 + 运行时(引擎原文 + 那层运行时,一个文件)
cursor-embed.css    球和液体的观感,外加藏系统光标那几条
demo.html           能直接打开的一页,里面每条都在跑
README.md           English(主文档)
README.zh.md        这份
LICENSE.txt         商用许可
package.json        清单
```
