# cursor-embed

A liquid cursor that changes shape to match whatever it is over. No dependencies, two files,
not one line of JavaScript to write.

v1.0.0 · 124 KB (js + css, 47 KB gzipped) · modern browsers · commercial license

English · [中文说明](README.zh.md)

## Install

```html
<link rel="stylesheet" href="cursor-embed.css">
<script src="cursor-embed.js"></script>
```

Put it in `<head>` or just before `</body>` — either works. The ball pools into a blob over a
button, stretches into a thread inside a text field, pulls into a bar on a drag handle.
**You do not have to change a single line of your existing CSS.**

To see it first, open `demo.html`. That page is using it.

## How it decides what to become

Four channels, top to bottom. The first one with something to say wins:

1. **`data-cursor="pointer"`** — written in your HTML, no CSS involved.
2. **`--cursor: pointer`** — a CSS custom property, so it inherits. Good for "everything inside
   this panel is my own control".
3. **The element's own `cursor`** — whatever you already write. It is read as-is.
4. **What the element *is*** — `<button>`, `<a href>`, `<select>`, `<input type=checkbox>` are
   read as clickable; text-ish `<input>` types, `<textarea>`, `<option>` and `[contenteditable]`
   are read as text.

Channel 4 is not redundant: **browsers do not give `<button>` a `cursor: pointer`.** Relying on
channel 3 alone, a page you have not touched would do nothing at all when you sweep over a button —
and it would look broken.

To switch the inference off for one element, write `data-cursor="auto"` or `--cursor: auto`.
Those two mean "no request", which is not the same as "nothing written".

## Shapes

24 standard cursor keywords have a shape:

| Value | What it draws |
| --- | --- |
| `pointer` | A blob that pools toward the pointer |
| `grab` | **The same shape as `pointer`** — so moving between the two never wastes a retract |
| `not-allowed` · `no-drop` | A ring scattered outward, hollow in the middle |
| `text` | Two balls with a thread drawn between them |
| `zoom-in` · `zoom-out` | Nine bearings, scattering / gathering one life at a time |
| `col-resize` `e-resize` `w-resize` `ew-resize` | A horizontal bar |
| `row-resize` `n-resize` `s-resize` `ns-resize` | A vertical bar |
| `nwse-resize` `nw-resize` `se-resize` | A bar at 45° |
| `nesw-resize` `ne-resize` `sw-resize` | A bar at −45° |
| `grabbing` · `move` · `all-scroll` | The pool it flattens into while you hold the button down |

**Holding the button down** is its own state. Press anywhere clickable and it flattens out; let go
and it retracts **directly** into the shape underneath, without passing through a plain ball on the
way. Retracting through q=0 would flash the ordinary cursor for a frame, which is exactly what this
rule exists to avoid.

The remaining 9 have no shape — `crosshair` `help` `wait` `progress` `cell` `alias` `copy`
`context-menu` `vertical-text`. Where those are asked for, **the system cursor simply stays**, and
the ball keeps following the pointer without deforming. Hiding the original and putting nothing in
its place is the worst possible outcome, so here it does nothing instead.

## Configuration

```js
CursorEmbed.init({
  size: 34,
  color: "#b3253a"
});
```

Changing the configuration means calling `init()` again. The previous instance is taken down along
with every inline `cursor` it wrote, and the new one picks up in place — **the ball does not blink
out**, because the instance remembers where the pointer is. Call it as often as you like; it leaves
nothing behind in the page.

| Key | Default | Meaning |
| --- | --- | --- |
| `size` | `26` | Diameter of the ball in px. Shapes scale with it. |
| `color` | `""` | `""` is the factory ball — black with a highlight. A string is a flat colour. `{ hi, mid, lo, ink }` sets the four gradient stops yourself. |
| `press` | `0.14` | How much it shrinks on press. `0` is no shrink. |
| `speed` | `1` | Multiplier on how fast shapes grow in and out. |
| `shadow` | `true` | Drop shadow. |
| `zIndex` | `9999` | Layer of the host element. Raise it if your own UI sits above. |
| `hideNative` | `true` | Hide the system cursor. Off means the ball and the arrow coexist. |

Nothing else is exposed — ring radii, droplet counts, wobble, time constants. **Those are the shape
itself.** Changing them is not tuning, it is redesigning.

## API

Left alone it boots itself, reads intent by itself, and needs no JavaScript from you. When you want
a hand on it:

| Call | Effect |
| --- | --- |
| `CursorEmbed.init(opts?)` | Create an instance and return it. **This is also how you change configuration.** |
| `CursorEmbed.instance()` | The current instance, or `null`. |
| `CursorEmbed.destroy()` | Tear down. Every inline `cursor` it added is restored to its previous value, `!important` and all. |
| `CursorEmbed.boot()` | Manual boot, after using `data-manual`. |
| `inst.set(value)` | Force a shape, overriding the automatic read. Pass `null` to hand it back. An unrecognised value returns `false` and **changes nothing**. |
| `inst.setWaiting(true)` | Your own loading state: settles into a plain ball but the ball stays. Pass `false` when you are done. |
| `inst.refresh(el?)` | Re-read an element whose styles changed later. With no argument, drop the whole cache. |
| `inst.destroy()` | Tear down this instance only. |

### Booting on your own schedule

```html
<script src="cursor-embed.js" data-manual></script>
<script>
  CursorEmbed.init({ size: 34 });
</script>
```

`data-manual` is read at the moment the script is evaluated, which is the only time
`document.currentScript` can still answer "which script booted me". It has to be on that tag; adding
it later does nothing.

## Putting it in a real project

**Performance.** Once the pointer stops and the shapes have finished retracting, it stops the
animation frame. Following the pointer costs no frames at all — the position is written straight to
`transform`. Frames keep running in exactly two cases: the pointer is resting on a shape (that blob
is itself always moving), or something is growing or retracting. It burns no CPU while the user is
in another window.

**Frameworks.** It only sees the DOM and does not care who rendered it. React, Vue and Svelte all
work, with no component wrapper. The one thing to remember: when your framework replaces a node, the
new one has not been read yet — call `inst.refresh(el)` once afterwards. For a whole re-render, call
`inst.refresh()` to drop everything and start over. Both only walk over the elements it has already
read, never the whole page.

## Getting help

Email **panguoxipgx@gmail.com**. Include your page, or a minimal HTML file that opens on its own — a
link is worth far more than a description. Questions before you buy go to the same address.

## Before you install it

- **Not enabled on touch devices.** There is no system cursor to hide and no "pointer over an
  element" for a finger, so attaching it would just cost a layer of DOM. This is the default; there
  is nothing to configure.
- **An element may flash the system cursor the first time the pointer reaches it**, because its own
  `cursor` value has to be read before there is anything to decide. After that it is cached — no
  more reads, no more flashes.
- **One instance at a time.** Calling `init()` replaces the previous one rather than running two.
- **Under `prefers-reduced-motion`, it neither deforms nor shrinks** — just a ball following the
  pointer. That reads the system preference, not your configuration.
- **Leaving the window or blurring it puts it away.**
- **Shapes come from an SVG goo filter**, so this is a modern-browser thing. On older engines the
  ball is there; the shapes simply never appear.
- **In a single-page app it remembers every element you have swept over.** Once an element leaves
  the DOM, its entry stays until you call `inst.refresh()` or `destroy()`. Each entry is tiny, but a
  dashboard left open all day will keep accumulating them — one `refresh()` at your route change is
  enough.

## License

Commercial, not open source. **The one-line version: buy it, use it in as many projects as you like
— commercial ones included — modify it, no attribution required; but do not redistribute it, or any
substantial part of it, as a library, template, theme or starter kit.**

The full terms are in `LICENSE.txt` (English is authoritative, with a Chinese translation
alongside). It follows common practice and **is not legal advice** — have a lawyer read it if it
matters.

© 2026 Guoxi Pan.

## What is in the box

```
cursor-embed.js     The cursor itself, plus the runtime
cursor-embed.css    How the ball and the liquid look, plus the cursor-hiding rules
demo.html           A page you can open directly, with every feature running
README.md           This file
README.zh.md        中文说明
LICENSE.txt         Commercial license
package.json        Manifest
```
