/*
 * 打包。
 *
 *     node cursor-lib/pack.js
 *
 * 产出 dist/cursor-embed-<版本>.zip —— 买家下载到的就是这一个文件。
 *
 * 装什么由 package.json 的 files 说了算,不另立一份清单:清单有两份就一定会有一份过期,
 * 而过期的那份通常正是打进去的那份。作者侧的东西(build.js、test_embed.js、check_demo.js、
 * src/)不在 files 里,所以不会进包。
 *
 * 两个刻意的选择:
 *
 *   · **不依赖系统上的 zip 命令。** 压缩用 zlib,容器(本地头、中央目录、EOCD)是自己拼的。
 *     买家或你自己在什么机器上跑都不用先装东西。代价是这段拼接得自己负责,所以下面
 *     写完会**读回来逐个解压对一遍** —— 不过那是自己验自己,真正独立的那一次是
 *     `unzip -t`(有就跑)。两边都过才算数。
 *
 *   · **时间戳写死。** 同一个输入永远打出同一个字节序列,于是 sha256 是个有意义的量:
 *     可以贴到商品页上让买家核对,也可以用来确认「这一版就是我验过的那一版」。
 *     用真实时间的话,同样的内容重打一次哈希就变了。
 *
 * 包里是一个顶层文件夹 `cursor-embed-<版本>/`,解压出来是一整坨,不会散进下载目录。
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const HERE = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
const ROOT = pkg.name + "-" + pkg.version;
const OUT = path.join(HERE, "dist", ROOT + ".zip");

let problems = 0;
function ok(msg) { console.log("  ✓ " + msg); }
function bad(msg) { problems++; console.log("  !! " + msg); }

/* ───────────────────────── CRC32 ───────────────────────── */

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

/* ───────────────────────── 装什么 ───────────────────────── */

console.log("\n打包 " + ROOT + "\n");

const entries = [];
for (const f of pkg.files) {
    const full = path.join(HERE, f);
    if (!fs.existsSync(full)) { bad("清单里写了不存在的文件:" + f); continue; }
    entries.push({ name: ROOT + "/" + f, data: fs.readFileSync(full) });
}
if (problems) { console.error("\n有 " + problems + " 处对不上。\n"); process.exit(1); }
ok("要装 " + entries.length + " 个文件,全部来自 package.json 的 files");

// 作者侧的东西一个都不许溜进去
const LEAK = ["build.js", "pack.js", "test_embed.js", "check_demo.js", "src/runtime.js", "src/runtime.css"];
const leaked = entries.filter((e) => LEAK.some((l) => e.name.endsWith("/" + l)));
if (leaked.length) bad("作者侧的文件进了包:" + leaked.map((e) => e.name).join(", "));
else ok("作者侧的脚本和源码没进包");

/* ───────────────────────── 拼 zip ───────────────────────── */

// DOS 时间/日期:写死 2026-01-01 00:00,让输出可复现
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const local = [];
const central = [];
let offset = 0;

for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const comp = zlib.deflateRawSync(e.data, { level: 9 });

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);         // 至少 2.0 才解得开
    lfh.writeUInt16LE(0x0800, 6);     // 名字是 UTF-8
    lfh.writeUInt16LE(8, 8);          // deflate
    lfh.writeUInt16LE(DOS_TIME, 10);
    lfh.writeUInt16LE(DOS_DATE, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(comp.length, 18);
    lfh.writeUInt32LE(e.data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);         // 没有 extra

    local.push(lfh, nameBuf, comp);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(0x031e, 4);     // 由 unix 上的 3.0 打的
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0x0800, 8);
    cdh.writeUInt16LE(8, 10);
    cdh.writeUInt16LE(DOS_TIME, 12);
    cdh.writeUInt16LE(DOS_DATE, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(comp.length, 20);
    cdh.writeUInt32LE(e.data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    // 权限写在外部属性高 16 位。**必须补 >>> 0**:JS 的 << 是带符号 32 位,
    // 0o100644 << 16 溢出成负数,writeUInt32LE 直接抛
    cdh.writeUInt32LE((0o100644 << 16) >>> 0, 38);   // 普通文件 644
    cdh.writeUInt32LE(offset, 42);

    central.push(cdh, nameBuf);
    offset += lfh.length + nameBuf.length + comp.length;
}

const cd = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(entries.length, 8);
eocd.writeUInt16LE(entries.length, 10);
eocd.writeUInt32LE(cd.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

const zip = Buffer.concat([...local, cd, eocd]);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, zip);
ok("写好了 " + path.relative(HERE, OUT) + "(" + (zip.length / 1024).toFixed(1) + " KB)");

/* ───────────────────────── 读回来对一遍 ───────────────────────── */

/*
 * 从 EOCD 往回走,照着中央目录逐个把数据解出来,和盘上原文件比。
 * 这一步能抓住的:偏移算错、长度写错、压缩流没写完整、EOCD 指错地方。
 * 抓不住的:我把格式理解错了但自洽 —— 那种只有另一个实现看得出来,见下面的 unzip -t。
 */
function readBack(buf) {
    const e = buf.length - 22;
    if (e < 0 || buf.readUInt32LE(e) !== 0x06054b50) throw new Error("找不到 EOCD");
    const count = buf.readUInt16LE(e + 10);
    const cdSize = buf.readUInt32LE(e + 12);
    const cdOff = buf.readUInt32LE(e + 16);
    if (cdOff + cdSize !== e) throw new Error("中央目录的位置或长度对不上");

    const out = [];
    let p = cdOff;
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("第 " + i + " 条中央目录头不对");
        const method = buf.readUInt16LE(p + 10);
        const crc = buf.readUInt32LE(p + 16);
        const csize = buf.readUInt32LE(p + 20);
        const usize = buf.readUInt32LE(p + 24);
        const fnlen = buf.readUInt16LE(p + 28);
        const extlen = buf.readUInt16LE(p + 30);
        const cmtlen = buf.readUInt16LE(p + 32);
        const lho = buf.readUInt32LE(p + 42);
        const name = buf.toString("utf8", p + 46, p + 46 + fnlen);

        if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error(name + " 的本地头不对");
        const lfn = buf.readUInt16LE(lho + 26);
        const lex = buf.readUInt16LE(lho + 28);
        const start = lho + 30 + lfn + lex;
        const raw = buf.slice(start, start + csize);
        const data = method === 0 ? raw : zlib.inflateRawSync(raw);

        if (data.length !== usize) throw new Error(name + " 解出来的长度不对");
        if (crc32(data) !== crc) throw new Error(name + " 的 CRC 对不上");
        out.push({ name, data });
        p += 46 + fnlen + extlen + cmtlen;
    }
    return out;
}

let back;
try { back = readBack(zip); } catch (err) { bad("读回来失败:" + err.message); back = null; }

if (back) {
    const same = back.length === entries.length &&
        back.every((b, i) => b.name === entries[i].name && b.data.equals(entries[i].data));
    if (!same) bad("读回来的内容和打进去的不一致");
    else ok("读回来 " + back.length + " 个文件,逐个解压和盘上原文件逐字节相同");
}

// 独立实现的那一次
let unzipOk = false;
try {
    execFileSync("unzip", ["-t", OUT], { stdio: "pipe" });
    unzipOk = true;
    ok("unzip -t 也说没问题(另一个实现验的)");
} catch (err) {
    const msg = (err.stdout || err.stderr || "").toString().trim().split("\n").pop();
    bad("unzip -t 没过:" + (msg || err.message));
}

console.log("\n  " + entries.map((e) => e.name.replace(ROOT + "/", "")).join("\n  "));
console.log("\n  sha256  " + crypto.createHash("sha256").update(zip).digest("hex"));

if (problems) { console.error("\n有 " + problems + " 处对不上。\n"); process.exit(1); }
console.log("\n打包好了。\n");
