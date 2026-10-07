// AE 2022 没有 app.fonts（2024 起才有）：直接读系统字体文件 name 表，拿到 AE 文本需要的 PostScript 名
"use strict";
const fs = require("fs");
const path = require("path");

function readAt(fd, pos, len) { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos); return b; }

function nameTable(fd, base) {
  const head = readAt(fd, base, 12), numTables = head.readUInt16BE(4);
  const dir = readAt(fd, base + 12, numTables * 16);
  for (let i = 0; i < numTables; i++) {
    if (dir.toString("ascii", i * 16, i * 16 + 4) !== "name") continue;
    const off = dir.readUInt32BE(i * 16 + 8), len = dir.readUInt32BE(i * 16 + 12);
    const t = readAt(fd, off, len), count = t.readUInt16BE(2), strOff = t.readUInt16BE(4);
    const best = {};
    for (let r = 0; r < count; r++) {
      const o = 6 + r * 12, plat = t.readUInt16BE(o), enc = t.readUInt16BE(o + 2), lang = t.readUInt16BE(o + 4), id = t.readUInt16BE(o + 6), l = t.readUInt16BE(o + 8), so = t.readUInt16BE(o + 10);
      if (![1, 2, 4, 6, 16, 17].includes(id)) continue;
      const raw = t.subarray(strOff + so, strOff + so + l);
      let s, score;
      if (plat === 3 && (enc === 1 || enc === 10)) { if (l % 2) continue; s = Buffer.from(raw).swap16().toString("utf16le"); score = lang === 0x409 ? 3 : 2; }
      else if (plat === 1 && enc === 0) { s = raw.toString("latin1"); score = 1; }
      else continue;
      if (!best[id] || best[id].score < score) best[id] = { s, score };
    }
    const g = id => (best[id] ? best[id].s : undefined);
    return { family: g(16) || g(1), style: g(17) || g(2), full: g(4), postScriptName: g(6) };
  }
  return null;
}

function parseFile(file) {
  const out = [];
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const tag = readAt(fd, 0, 12);
    if (tag.toString("ascii", 0, 4) === "ttcf") {
      const n = tag.readUInt32BE(8), offs = readAt(fd, 12, n * 4);
      for (let i = 0; i < n; i++) { const r = nameTable(fd, offs.readUInt32BE(i * 4)); if (r) out.push(r); }
    } else {
      const r = nameTable(fd, 0); if (r) out.push(r);
    }
  } catch (e) { /* 损坏或加密字体跳过 */ }
  finally { if (fd !== undefined) fs.closeSync(fd); }
  return out;
}

function fontDirs() {
  const dirs = [path.join(process.env.WINDIR || "C:\\Windows", "Fonts")];
  if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts"));
  return dirs;
}

// 带缓存（按文件 mtime），首次全量扫描约数秒
function scan(cacheFile) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch (e) {}
  const next = {}, fonts = [];
  for (const d of fontDirs()) {
    let names = [];
    try { names = fs.readdirSync(d); } catch (e) { continue; }
    for (const n of names) {
      if (!/\.(ttf|otf|ttc)$/i.test(n)) continue;
      const f = path.join(d, n);
      let m; try { m = fs.statSync(f).mtimeMs; } catch (e) { continue; }
      const hit = cache[f] && cache[f].m === m ? cache[f].r : parseFile(f);
      next[f] = { m, r: hit };
      for (const r of hit) if (r.postScriptName) fonts.push({ family: r.family, style: r.style, postScriptName: r.postScriptName, file: n });
    }
  }
  try { fs.writeFileSync(cacheFile, JSON.stringify(next)); } catch (e) {}
  return fonts;
}

module.exports = { scan };
