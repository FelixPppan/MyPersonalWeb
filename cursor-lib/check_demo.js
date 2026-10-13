/*
 * 演示页的静态检查。
 *
 *     node cursor-lib/check_demo.js
 *
 * 这里没有浏览器,所以「打开看看」这件事做不了。能做的、也真的能抓住东西的,是这几条:
 *
 *   · 页里每一段内联脚本能不能过语法 —— 演示页是买家第一个打开的文件,
 *     它自己报错就全毁了;
 *   · 页里用到的 CursorEmbed.* 是不是真的存在 —— 名字打错一个字母,
 *     只有运行到那一行才会发现,而那多半是在调颜色的时候;
 *   · 配置项的名字是不是真的在 DEFAULTS 里 —— 库里不认识的键会被安静地吞掉,
 *     演示页会表现成「这个旋钮没用」;
 *   · 每一格写的 cursor 值是不是库里真认得的 —— 认不出的值等于那一格是死的,
 *     而演示页说不清楚这件事;
 *   · 每一处 class / id 引用在页里真的定义过 —— 纯手写 HTML 最容易错的就是这里。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const HERE = __dirname;
const HTML = path.join(HERE, "demo.html");
const BUNDLE = path.join(HERE, "cursor-embed.js");
const CSSFILE = path.join(HERE, "cursor-embed.css");

let problems = 0;
function ok(msg) { console.log("  ✓ " + msg); }
function bad(msg) { problems++; console.log("  !! " + msg); }

const html = fs.readFileSync(HTML, "utf8");
const bundle = fs.readFileSync(BUNDLE, "utf8");
const shipped = bundle + "\n" + fs.readFileSync(CSSFILE, "utf8");

// ───────────────── 1. 引用的文件在不在 ─────────────────

{
    const refs = [];
    html.replace(/(?:href|src)="([^"#][^"]*)"/g, (m, u) => { refs.push(u); return m; });
    const uniq = [...new Set(refs)];
    const missing = uniq.filter((u) => !/^https?:|^data:/.test(u) && !fs.existsSync(path.join(HERE, u)));
    if (missing.length) bad("引用了不存在的文件:" + missing.join(", "));
    else ok("引用的 " + uniq.length + " 个文件都在:" + uniq.join(", "));
}

// ───────────────── 2. 内联脚本过语法 ─────────────────

const scripts = [];
html.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g, (m, body) => { scripts.push(body); return m; });

{
    let n = 0;
    for (const s of scripts) {
        n++;
        try { new vm.Script(s, { filename: "demo-inline-" + n + ".js" }); }
        catch (e) { bad("第 " + n + " 段内联脚本过不了语法:" + e.message); }
    }
    if (n) ok(n + " 段内联脚本都能编译");
    else bad("一段内联脚本都没找到 —— 正则是不是错了?");
}

// ───────────────── 3. 库里到底有什么 ─────────────────

// DEFAULTS / INTENT / REAL_CURSORS 直接从产物里抠出来求值。
// 产物是个 IIFE,在 node 里 require 不了(它要 window),所以只取那一段字面量。
function literal(name) {
    const i = bundle.indexOf("const " + name + " = ");
    if (i < 0) { bad("产物里找不到 " + name); return null; }
    const start = bundle.indexOf("{", i);
    // 配平地扫括号,别指望正则
    let depth = 0, j = start;
    for (; j < bundle.length; j++) {
        if (bundle[j] === "{") depth++;
        else if (bundle[j] === "}") { depth--; if (!depth) break; }
    }
    const src = bundle.slice(start, j + 1);
    // BALL_D 是另一个常量,补进来 —— 顺便也就把它的值对了一遍
    try { return vm.runInNewContext("(" + src + ")", { BALL_D: 26 }); }
    catch (e) { bad("求值 " + name + " 出错:" + e.message); return null; }
}

// 配平地找一对括号中间那段
function blockFrom(text, from) {
    const start = text.indexOf("{", from);
    let depth = 0, j = start;
    for (; j < text.length; j++) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") { depth--; if (!depth) break; }
    }
    return { src: text.slice(start, j + 1), end: j };
}

const DEFAULTS = literal("DEFAULTS") || {};
const REAL_CURSORS = (() => {
    const i = bundle.indexOf("const REAL_CURSORS = new Set([");
    if (i < 0) { bad("找不到 REAL_CURSORS"); return null; }
    const j = bundle.indexOf("]);", i);
    return vm.runInNewContext("new Set(" + bundle.slice(bundle.indexOf("[", i), j + 1) + ")");
})();
// 有画法的键:INTENT 那张表加按下那一族。按名字扫,不重新求值(它有函数)
const INTENT_KEYS = (() => {
    const i = bundle.indexOf("const INTENT = {");
    const j = bundle.indexOf("\n    };", i);
    const keys = [];
    bundle.slice(i, j).replace(/^\s{8}([A-Za-z"][^:]*?):\s*\{/gm, (m, k) => { keys.push(k.replace(/"/g, "")); return m; });
    // grabbing / move / all-scroll 是后面挂上去的。all-scroll 带横线,所以走的是中括号写法
    bundle.replace(/INTENT(?:\.([A-Za-z-]+)|\["([^"]+)"\]) = PRESS/g, (m, a, b2) => {
        keys.push(a || b2);
        return m;
    });
    // 拖动缩放那一族是循环挂的
    for (const v of Object.keys((() => {
        const a = bundle.indexOf("const RESIZE_AXIS = {");
        const b = bundle.indexOf("};", a);
        return vm.runInNewContext("(" + bundle.slice(bundle.indexOf("{", a), b + 1) + ")");
    })())) keys.push(v);
    return new Set(keys);
})();

if (DEFAULTS && REAL_CURSORS && INTENT_KEYS.size) {
    ok("从产物里读到了 " + Object.keys(DEFAULTS).length + " 个配置项、" +
        INTENT_KEYS.size + " 个有画法的值、" + REAL_CURSORS.size + " 个标准关键字");

    /*
     * 演示页上「24 个有画法、剩下 9 个让位」是写在文案里的数字 ——
     * 文案会过期,产物不会。这里拿产物去校它。
     */
    const handed = [...REAL_CURSORS].filter((v) => !INTENT_KEYS.has(v));
    const extra = [...INTENT_KEYS].filter((v) => !REAL_CURSORS.has(v));
    if (extra.length) bad("有画法的值却不在标准关键字表里:" + extra.join(", "));
    else if (INTENT_KEYS.size !== 24 || handed.length !== 9) {
        bad("产物现在是 " + INTENT_KEYS.size + " 个有画法 / " + handed.length + " 个让位,演示页文案还写着 24 / 9");
    } else {
        ok("24 有画法 + 9 让位 = " + REAL_CURSORS.size + " 个标准关键字,和演示页文案一致");
        for (const [n, re] of [[24, /(\d+) 个有画法/], [9, /剩下 (\d+) 个/]]) {
            const m = html.match(re);
            if (!m || Number(m[1]) !== n) bad("演示页文案里的数字不是 " + n + ":" + (m ? m[0] : "没找到"));
        }
    }
}

// ───────────────── 4. 用到的方法都真的在 ─────────────────

{
    const used = new Set();
    for (const s of scripts) s.replace(/CursorEmbed\.([A-Za-z_$][\w$]*)/g, (m, k) => { used.add(k); return m; });

    // 从产物里取对外那张表上的键。注意用 lastIndexOf ——
    // 引擎自己末尾也有一张叫 api 的表,indexOf 会先撞上它,然后什么都验不到
    const i = bundle.lastIndexOf("const api = {");
    const keys = new Set();
    blockFrom(bundle, i).src.replace(/^\s{8}([A-Za-z_$][\w$]*)\s*[(:]/gm, (m, k) => { keys.add(k); return m; });

    const miss = [...used].filter((k) => !keys.has(k));
    if (miss.length) bad("演示页调了产物上不存在的方法:" + miss.join(", "));
    else if (used.size) ok("用到的 " + used.size + " 个对外方法都在:" + [...used].sort().join(", "));
    else bad("一段 CursorEmbed.* 都没用到 —— 演示页是不是没接上?");
}

// ───────────────── 5. 配置项名字对得上 ─────────────────

{
    const D = { size: 26, color: "", press: 0.14, speed: 1, shadow: true, hideNative: true };
    const d = scripts.join("\n").match(/var D = \{([^}]*)\}/);
    if (!d) bad("找不到演示页自己那份 DEFAULTS");
    else {
        const names = d[1].split(",").map((s) => s.split(":")[0].trim()).filter(Boolean);
        const miss = names.filter((k) => !(k in DEFAULTS));
        if (miss.length) bad("演示页用了库里没有的配置项:" + miss.join(", "));
        else ok("演示页那 " + names.length + " 个配置项库里都认得:" + names.join(", "));

        // 值也要对得上,不然「恢复出厂」会恢复到一个不一样的地方
        for (const k of names) {
            const v = vm.runInNewContext("(" + d[1].split(k + ":")[1].split(",")[0] + ")");
            if (v !== DEFAULTS[k]) bad("配置项 " + k + " 的出厂值对不上:页里是 " + JSON.stringify(v)
                + ",库里是 " + JSON.stringify(DEFAULTS[k]));
        }
    }
}

// ───────────────── 6. 每一格写的 cursor 值都认得 ─────────────────

{
    const vals = [];
    html.replace(/cursor:\s*([A-Za-z-]+)/g, (m, v) => { vals.push(v); return m; });
    html.replace(/data-cursor="([^"]+)"/g, (m, v) => { vals.push(v); return m; });

    const junk = [...new Set(vals)].filter((v) => v !== "auto" && !REAL_CURSORS.has(v));
    if (junk.length) bad("演示页写了库不认识的光标值:" + junk.join(", "));
    else ok("用到的 " + new Set(vals).size + " 个光标值库里都认得");
}

// ───────────────── 7. class / id / 锚点都对得上 ─────────────────

{
    const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
    const defined = new Set();
    style.replace(/\.([A-Za-z][\w-]*)/g, (m, c) => { defined.add(c); return m; });

    const used = new Set();
    html.replace(/class="([^"]*)"/g, (m, c) => {
        c.split(/\s+/).filter(Boolean).forEach((x) => used.add(x));
        return m;
    });
    // 库自己的类不算:那是 cursor-embed.css 的事
    const ours = ["cfx", "cfx-embed", "cfx-ball", "cfx-embed-on", "cfx-embed-no-shadow", "cfx-shadow", "mermaid"];
    const miss = [...used].filter((c) => !defined.has(c) && !ours.includes(c));
    if (miss.length) bad("用了但没定义的 class:" + miss.join(", "));
    else ok("用到的 " + used.size + " 个 class 页里都定义了");

    const ids = new Set();
    html.replace(/id="([^"]*)"/g, (m, i) => { ids.add(i); return m; });
    const anchors = [...new Set([...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))];
    const dead = anchors.filter((a) => !ids.has(a));
    if (dead.length) bad("锚点指向不存在的 id:" + dead.join(", "));
    else ok("页内 " + anchors.length + " 个锚点都落得到");
}

// ───────────────── 8. 内联 JS 引用的 id 真的在 HTML 里 ─────────────────

{
    const ids = new Set();
    html.replace(/id="([^"]*)"/g, (m, i) => { ids.add(i); return m; });
    const wanted = new Set();
    scripts.join("\n").replace(/\$\("#([\w-]+)"\)/g, (m, i) => { wanted.add(i); return m; });
    const miss = [...wanted].filter((i) => !ids.has(i));
    if (miss.length) bad("脚本要的 id 页里没有:" + miss.join(", "));
    else ok("脚本点名的 " + wanted.size + " 个 id 都在");
}

// ───────────────── 9. 样式表本身 ─────────────────

{
    const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";

    // 括号配平:少一个 `}` 会把后面整段吃掉,而浏览器不会报错,只会画错
    let depth = 0, line = 1, brokeAt = 0;
    for (const ch of style) {
        if (ch === "\n") line++;
        else if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth < 0 && !brokeAt) brokeAt = line; }
    }
    if (depth !== 0 || brokeAt) bad("样式的花括号不配平(多出来/少掉的在第 " + (brokeAt || line) + " 行附近)");
    else ok("样式里的花括号配平");

    /*
     * 同一个选择器写两遍 —— 这一条不是洁癖,是这一页真的踩过的坑:
     * `.hero .wrap` 写了两遍,后写的那条把 `.band .wrap` 一起吃掉(特异度相同,
     * 谁在后面谁赢),试玩带的内边距就悄没声地变了。浏览器不报错,只有眼睛看得出来。
     */
    const seen = new Map();
    const dup = [];
    // 只看顶层规则(不看 @media 里面),够用了
    const top = style.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    top.replace(/([^{}]+)\{/g, (m, sel) => {
        const s = sel.trim().replace(/\/\*[\s\S]*?\*\//g, "").trim();
        if (!s || s.startsWith("@")) return m;
        if (seen.has(s)) dup.push(s + "(第 " + seen.get(s) + " 行和第 " + (top.slice(0, m.index).split("\n").length + 1) + " 行)");
        else seen.set(s, top.slice(0, m.index).split("\n").length + 1);
        return m;
    });
    if (dup.length) bad("同一个选择器写了两遍,后一条会盖掉前一条:" + dup.join(" / "));
    else ok(seen.size + " 条规则,没有重复的选择器");
}

// ───────────────── 10. 两份 README 和清单 ─────────────────

/*
 * 文档会过期,产物不会。这一节把 README 里那些**可以被验的数字和名字**拿去和产物对:
 * 配置表列的是不是真的那几项、接口表列的是不是真的那几个、包里那份清单是不是真的在,
 * 「包里有什么」写的那几个文件在不在盘上。
 *
 * 写不进去的是文字本身对不对 —— 那种只能靠人读。
 */
{
    const D = DEFAULTS || {};
    // 清单先读进来:下面核 README 的包内清单要用它当标准答案
    const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
    const pkgFiles = pkg.files;

    // 从产物里抠一张表上的键。api 那份在文件末尾,实例那份在 create() 里 ——
    // 两者缩进不一样(api 顶格、inst 嵌在 create 里),按各自那一行的缩进推成员缩进
    const keysOf = (needle) => {
        const i = needle === "const api = {" ? bundle.lastIndexOf(needle) : bundle.indexOf(needle);
        const lineStart = bundle.lastIndexOf("\n", i) + 1;
        const pad = bundle.slice(lineStart, bundle.indexOf("\n", i)).match(/^\s*/)[0].length + 4;
        const keys = new Set();
        blockFrom(bundle, i).src.replace(
            new RegExp("^ {" + pad + "}([A-Za-z_$][\\w$]*)\\s*[(:]", "gm"),
            (m, k) => { keys.add(k); return m; });
        return keys;
    };
    const apiKeys = keysOf("const api = {");
    const instKeys = keysOf("const inst = {");
    const allKeys = new Set([...apiKeys, ...instKeys]);

    // 把某一节切出来。不切的话,形状表里那些 `| \`pointer\` |` 会被当成配置项
    function sectionOf(md, heading) {
        const m = md.match(new RegExp("^##\\s*(?:" + heading + ")\\s*$", "m"));
        if (!m) return null;
        const rest = md.slice(m.index + m[0].length);
        const end = rest.search(/^##\s/m);
        return end < 0 ? rest : rest.slice(0, end);
    }

    for (const name of ["README.md", "README.zh.md"]) {
        const md = fs.readFileSync(path.join(HERE, name), "utf8");

        // ── 配置表,只在「配置」那一节里看 ──
        const cfgSec = sectionOf(md, "配置|Configuration");
        if (!cfgSec) bad(name + " 里找不到「配置」那一节");
        else {
            const cfg = new Set();
            cfgSec.replace(/^\|\s*`([A-Za-z_$][\w$]*)`\s*\|/gm, (m, k) => { cfg.add(k); return m; });
            const cfgMiss = Object.keys(D).filter((k) => !cfg.has(k));
            const cfgExtra = [...cfg].filter((k) => !(k in D));
            if (cfgMiss.length) bad(name + " 的配置表漏了:" + cfgMiss.join(", "));
            else if (cfgExtra.length) bad(name + " 的配置表多写了库里没有的:" + cfgExtra.join(", "));
            else ok(name + " 的配置表正好是那 " + Object.keys(D).length + " 项");
        }

        // ── 接口表,只在「接口」那一节里看 ──
        const apiSec = sectionOf(md, "接口|API");
        if (!apiSec) bad(name + " 里找不到「接口」那一节");
        else {
            const api = new Set();
            apiSec.replace(/^\|\s*`(?:CursorEmbed\.|inst\.)([\w$]+)\(/gm, (m, k) => { api.add(k); return m; });
            const want = [...apiKeys, ...instKeys].filter((k) => k !== "VERSION" && k !== "opts" && k !== "_debug");
            const apiMiss = want.filter((k) => !api.has(k));
            const apiExtra = [...api].filter((k) => !allKeys.has(k));
            if (apiMiss.length) bad(name + " 的接口表漏了:" + apiMiss.join(", "));
            else if (apiExtra.length) bad(name + " 的接口表多写了库里没有的:" + apiExtra.join(", "));
            else ok(name + " 的接口表覆盖了 " + api.size + " 个口子,一个不多一个不少");
        }

        /*
         * 「包里有什么」那一段。这里不只查「写的文件在不在盘上」——那一头是弱的,
         * 写少一个文件它照样绿。真正要核的是**清单和清单一致**:README 告诉买家他拿到
         * 什么,pack.js 又照着 package.json 的 files 装什么。两份清单只要对不上,
         * 买家拿到的就和你承诺的不是一包东西。
         *
         * 这一段曾经真的对不上:两份 README 都写了 package.json,而 files 里没有它
         * (npm 默认会带上,所以写 files 的时候很容易漏),zip 里于是只有 6 个。
         */
        const fenced = md.split("```").filter((s) => s.indexOf("cursor-embed.js") >= 0);
        const listBlock = fenced[fenced.length - 1] || "";
        const named = [...new Set(
            [...listBlock.matchAll(/^([\w.-]+\.(?:js|css|html|md|txt|json))\s/gm)].map((m) => m[1]))];
        if (!named.length) {
            bad(name + " 里没找到「包里有什么」那份清单");
        } else {
            const gone = named.filter((f) => !fs.existsSync(path.join(HERE, f)));
            const want = new Set(pkgFiles);
            const extra = named.filter((f) => !want.has(f));
            const missing = [...want].filter((f) => !named.includes(f));
            if (gone.length) bad(name + " 的包内清单里写了盘上没有的文件:" + gone.join(", "));
            else if (extra.length) bad(name + " 的包内清单多写了不在 files 里的:" + extra.join(", "));
            else if (missing.length) bad(name + " 的包内清单漏了 files 里的:" + missing.join(", "));
            else ok(name + " 的包内清单和 package.json 的 files 一个不差(" + named.length + " 个)");
        }

        // 大小那句话。买家真正下到手的是 js + css 两个文件,两个都算
        const kb = (Buffer.byteLength(shipped, "utf8") / 1024).toFixed(0);
        const gz = (zlib.gzipSync(Buffer.from(shipped, "utf8"), { level: 9 }).length / 1024).toFixed(0);
        const miss2 = [];
        if (!new RegExp("(?<!\\d)" + kb + "\\s*KB").test(md)) miss2.push("原始 " + kb + " KB");
        // 「47 KB gzipped」和「gzip 后 47 KB」两种语序都认
        const gzRe = new RegExp(
            gz + "\\s*KB[^\\n]{0,10}(?:gzip|gzipped)" +
            "|(?:gzip|gzipped)[^\\d\\n]{0,12}" + gz + "\\s*KB");
        if (!gzRe.test(md)) miss2.push("gzip " + gz + " KB");
        if (miss2.length) bad(name + " 里写的体积对不上(产物是 " + miss2.join("、") + ")");
        else ok(name + " 里写的体积对得上(" + kb + " KB / gzip " + gz + " KB)");
    }

    // package.json 里那份 files 就是真正会被发出去的东西 —— 每一个都得在
    const miss = pkg.files.filter((f) => !fs.existsSync(path.join(HERE, f)));
    if (miss.length) bad("package.json 的 files 里有不存在的文件:" + miss.join(", "));
    else ok("package.json 的 files 那 " + pkg.files.length + " 个都在");

    if (pkg.version !== "1.0.0") bad("package.json 的版本不是 1.0.0");
    if (pkg.main !== "cursor-embed.js") bad("package.json 的 main 指向 " + pkg.main);
    // 这是要卖的包,别一个 npm publish 就白送出去
    if (pkg.private !== true) bad("package.json 没有 private:true —— 一个 npm publish 就把它白送出去了");
    else ok("package.json 标了 private,不会误发到 npm");

    // ───────────────── 11. 署名、版本、联系方式 ─────────────────

    /*
     * 这一节盯的是「填过但填错了」和「忘了填」两种。版权行留个 [COPYRIGHT HOLDER]
     * 或者邮箱留个 example.com,是很难自己发现的 —— 打开的时候你看见的是你写的那个
     * 名字(因为脑子里已经替换过了),发出去买家看见的才是占位符。
     */
    const NAME = "Guoxi Pan";
    const MAIL = "panguoxipgx@gmail.com";

    const lic = fs.readFileSync(path.join(HERE, "LICENSE.txt"), "utf8");
    const held = lic.match(/Copyright \(c\) (\d{4}) (.+?)\. All rights reserved\./);
    if (!held) bad("LICENSE.txt 里找不到「Copyright (c) 年份 名字」那一行");
    else if (/[[\]<>]|\bHOLDER\b|\bNAME\b/i.test(held[2])) bad("LICENSE.txt 的版权行还是占位符:" + held[2]);
    else if (held[2] !== NAME) bad("LICENSE.txt 的版权人是「" + held[2] + "」,不是「" + NAME + "」");
    else ok("LICENSE.txt 的版权人:" + held[2] + "(c " + held[1] + ")");

    if (pkg.author !== NAME + " <" + MAIL + ">") {
        bad("package.json 的 author 是 " + JSON.stringify(pkg.author) + ",和 " + NAME + " <" + MAIL + "> 对不上");
    } else ok("package.json 的 author 对得上");

    // 版本号对不对得上:清单里那个数、产物里的 VERSION、两份 README 第一行
    const VERSION = (bundle.match(/VERSION:\s*"([^"]+)"/) || [])[1];
    if (VERSION !== pkg.version) bad("产物里的 VERSION(" + VERSION + ")和 package.json(" + pkg.version + ")对不上");
    else ok("产物 VERSION 和 package.json 都是 " + pkg.version);

    // 文档之间互相指的链接。改文件名最容易漏的就是这里 —— 页面还能打开,
    // 只有那个链接悄悄变成 404
    for (const name of ["README.md", "README.zh.md"]) {
        const md = fs.readFileSync(path.join(HERE, name), "utf8");
        const targets = [...md.matchAll(/\]\(([^)#][^)]*)\)/g)]
            .map((m) => m[1])
            .filter((u) => !/^https?:|^mailto:|^data:/.test(u));
        const dead = [...new Set(targets)].filter((u) => !fs.existsSync(path.join(HERE, u.split("#")[0])));
        if (dead.length) bad(name + " 里有指不到的文件链接:" + dead.join(", "));
        else ok(name + " 里的 " + new Set(targets).size + " 个链接都落得到");
    }

    for (const name of ["README.md", "README.zh.md", "LICENSE.txt"]) {
        const md = fs.readFileSync(path.join(HERE, name), "utf8");
        const miss3 = [];
        if (md.indexOf(NAME) < 0) miss3.push("没有作者名");
        if (md.indexOf(MAIL) < 0) miss3.push("没有邮箱");
        // 常见的假邮箱和占位符写法,一个都不许留下
        if (/TODO|FIXME|待填|待补|xxx|example\.(com|org)|your-?email|\[EMAIL\]|\[NAME\]/i.test(md)) {
            miss3.push("还留着占位符");
        }
        if (name !== "LICENSE.txt" && md.indexOf("v" + pkg.version) < 0) miss3.push("版本号没写");
        if (miss3.length) bad(name + ":" + miss3.join("、"));
        else ok(name + " 的署名、版本、联系方式都在");
    }
}

console.log("");
if (problems) {
    console.error("有 " + problems + " 处对不上。");
    process.exit(1);
}
console.log("演示页与文档检查通过。");
