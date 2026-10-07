// 零依赖 PNG 工具：解码（8/16 位，灰度/RGB/RGBA/调色板，非隔行）→ 垫底色 → 缩放 → 拼图 → 编码 RGB PNG
"use strict";
const zlib = require("zlib");

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  let pos = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (interlace) throw new Error("interlaced PNG not supported");
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!ch) throw new Error("unsupported PNG color type " + ctype);
  const bitsPP = ch * depth, bpp = Math.max(1, bitsPP >> 3), stride = Math.ceil((w * bitsPP) / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[i] = v & 255;
    }
    prev = out;
  }
  // → RGBA8
  const rgba = Buffer.alloc(w * h * 4);
  const sample = (row, idx) => {               // 取第 idx 个通道样本（8 位）
    if (depth === 16) return row[idx * 2];
    if (depth === 8) return row[idx];
    const per = 8 / depth, byte = row[Math.floor(idx / per)], shift = 8 - depth * (1 + (idx % per));
    const v = (byte >> shift) & ((1 << depth) - 1);
    return ctype === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < h; y++) {
    const row = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ctype === 6) { rgba[o] = sample(row, x * 4); rgba[o + 1] = sample(row, x * 4 + 1); rgba[o + 2] = sample(row, x * 4 + 2); rgba[o + 3] = sample(row, x * 4 + 3); }
      else if (ctype === 2) { rgba[o] = sample(row, x * 3); rgba[o + 1] = sample(row, x * 3 + 1); rgba[o + 2] = sample(row, x * 3 + 2); rgba[o + 3] = 255; }
      else if (ctype === 0) { const g = sample(row, x); rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = 255; }
      else if (ctype === 4) { const g = sample(row, x * 2); rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = sample(row, x * 2 + 1); }
      else { const i = sample(row, x); rgba[o] = palette[i * 3]; rgba[o + 1] = palette[i * 3 + 1]; rgba[o + 2] = palette[i * 3 + 2]; rgba[o + 3] = trns && i < trns.length ? trns[i] : 255; }
    }
  }
  return { w, h, rgba };
}

// RGBA → RGB：垫纯色（[r,g,b] 0–1）或棋盘格
function flatten(img, bg) {
  const { w, h, rgba } = img, rgb = Buffer.alloc(w * h * 3);
  const checker = bg === "checker";
  const solid = checker ? null : (bg || [0, 0, 0]).map(v => Math.round(Math.max(0, Math.min(1, v)) * 255));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x), a = rgba[i * 4 + 3] / 255;
    const base = checker ? ((((x >> 4) + (y >> 4)) & 1) ? [204, 204, 204] : [153, 153, 153]) : solid;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(rgba[i * 4 + c] * a + base[c] * (1 - a));
  }
  return { w, h, rgb };
}

// 面积平均缩小（只缩不放）
function scale(img, maxW) {
  if (img.w <= maxW) return img;
  const W = maxW, H = Math.max(1, Math.round((img.h * maxW) / img.w)), out = Buffer.alloc(W * H * 3);
  const sx = img.w / W, sy = img.h / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < img.h; yy++) for (let xx = x0; xx < x1 && xx < img.w; xx++) { const i = (yy * img.w + xx) * 3; r += img.rgb[i]; g += img.rgb[i + 1]; b += img.rgb[i + 2]; n++; }
      const o = (y * W + x) * 3; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return { w: W, h: H, rgb: out };
}

function tile(imgs, cols, gap) {
  gap = gap === undefined ? 6 : gap;
  const cw = imgs[0].w, chh = imgs[0].h, rows = Math.ceil(imgs.length / cols);
  const W = cols * cw + (cols + 1) * gap, H = rows * chh + (rows + 1) * gap, out = Buffer.alloc(W * H * 3, 24);
  imgs.forEach((im, n) => {
    const ox = gap + (n % cols) * (cw + gap), oy = gap + Math.floor(n / cols) * (chh + gap);
    for (let y = 0; y < im.h && y < chh; y++) im.rgb.copy(out, ((oy + y) * W + ox) * 3, y * im.w * 3, y * im.w * 3 + Math.min(im.w, cw) * 3);
  });
  return { w: W, h: H, rgb: out };
}

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encode(img) {
  const { w, h, rgb } = img, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

module.exports = { decode, flatten, scale, tile, encode };
