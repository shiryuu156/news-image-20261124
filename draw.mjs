// draw.mjs — renders the news-image-20261124 front page, 1024x1024 PNG.
// Written from scratch in this session. Node 22 standard library only:
// a tiny raster canvas, a hand-built 5x7 bitmap font, and a hand-rolled
// PNG encoder (zlib deflate + CRC32). No network, no clock, no randomness,
// so every run writes byte-identical output.
//
// The day: Tuesday 24 November 2026.
//   Lead: reports say Russia may launch a nuclear-armed satellite
//     (Sputnik-S) within 60 days; NATO vows to defend space.
//   Gaza: Israeli strikes kill Hamas internal security chief Naeem Abu Nahel.
//   Ukraine: Russian overnight strike on Zaporizhzhia kills 2, wounds dozens.
//   Business: Sanofi buys US biotech Insmed for $41 billion.
//   Justice: UK sanctions five Myanmar generals after the ICJ genocide ruling.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 3);

// ---------------------------------------------------------------- palette
const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];
const PAPER = hex("#f7f1e2");
const INK = hex("#1b1b1b");
const NAVY = hex("#152a4e");
const RED = hex("#b3231b");
const BLUE = hex("#1e4d7a");
const SKY = hex("#7fb2d9");
const SEA = hex("#2e6da4");
const GREEN = hex("#2e7d32");
const GOLD = hex("#c99700");
const GREY = hex("#6b6b6b");
const LGREY = hex("#d8d0bd");
const ORANGE = hex("#e07b00");
const WHITE = hex("#ffffff");
const BLACK = hex("#000000");

// ---------------------------------------------------------------- canvas
function fillAll(c) {
  for (let i = 0; i < W * H; i++) {
    buf[i * 3] = c[0];
    buf[i * 3 + 1] = c[1];
    buf[i * 3 + 2] = c[2];
  }
}
function px(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}
function rect(x, y, w, h, c) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(i, j, c);
}
function hline(x, y, w, c) {
  rect(x, y, w, 1, c);
}
function vline(x, y, h, c) {
  rect(x, y, 1, h, c);
}
function box(x, y, w, h, c, t = 1) {
  rect(x, y, w, t, c);
  rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c);
  rect(x + w - t, y, t, h, c);
}
function line(x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) {
      e += dy;
      x += sx;
    }
    if (e2 <= dx) {
      e += dx;
      y += sy;
    }
  }
}
function thickLine(x0, y0, x1, y1, w, c) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const r = Math.floor(w / 2);
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps);
    const y = Math.round(y0 + ((y1 - y0) * s) / steps);
    disc(x, y, r, c);
  }
}
function disc(cx, cy, r, c) {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) px(cx + x, cy + y, c);
  }
}
function ring(cx, cy, r, c, t = 1) {
  for (let a = 0; a < 360; a++) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      px(Math.round(cx + (r + k) * Math.cos(rad)), Math.round(cy + (r + k) * Math.sin(rad)), c);
    }
  }
}
function ellipse(cx, cy, rx, ry, c, t = 1) {
  for (let a = 0; a < 360; a++) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      px(Math.round(cx + (rx + k) * Math.cos(rad)), Math.round(cy + (ry + k) * Math.sin(rad)), c);
    }
  }
}
function arc(cx, cy, r, a0, a1, c) {
  for (let a = a0; a <= a1; a += 1) {
    const rad = (a * Math.PI) / 180;
    px(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
  }
}
function poly(points, c) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    line(a[0], a[1], b[0], b[1], c);
  }
}
function fillPoly(points, c) {
  // Scanline fill of a simple polygon.
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) px(x, y, c);
    }
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows, each a 5-bit number (bit 4 = leftmost column).
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  "-": [0, 0, 0, 31, 0, 0, 0],
  "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 10, 0, 0, 0, 0],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  "/": [1, 1, 2, 4, 8, 16, 16],
  "%": [24, 25, 2, 4, 8, 19, 18],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "&": [12, 18, 20, 8, 21, 18, 13],
  "=": [0, 0, 31, 0, 31, 0, 0],
  "*": [0, 4, 21, 14, 21, 4, 0],
  "#": [10, 10, 31, 10, 31, 10, 10],
  $: [4, 15, 20, 14, 5, 30, 4],
  "@": [14, 17, 23, 21, 23, 16, 14],
  "[": [14, 8, 8, 8, 8, 8, 14],
  "]": [14, 2, 2, 2, 2, 2, 14],
  _: [0, 0, 0, 0, 0, 0, 31],
  ">": [8, 4, 2, 1, 2, 4, 8],
  "<": [2, 4, 8, 16, 8, 4, 2],
  "\u2022": [0, 0, 4, 14, 14, 4, 0],
};
function glyph(ch) {
  return FONT[ch] ?? FONT["?"];
}
function textWidth(str, s) {
  return str.length * 6 * s - s;
}
function drawText(str, x, y, s, c) {
  // The bitmap font carries capitals only; render everything in caps.
  str = str.toUpperCase();
  let cx = x;
  for (const ch of str) {
    const g = glyph(ch);
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r] & (16 >> col)) rect(cx + col * s, y + r * s, s, s, c);
      }
    }
    cx += 6 * s;
  }
  return cx;
}
function centerText(str, cx, y, s, c) {
  drawText(str, Math.round(cx - textWidth(str, s) / 2), y, s, c);
}
function wrap(str, s, maxW) {
  const words = str.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textWidth(trial, s) <= maxW) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
function para(str, x, y, s, c, maxW, lh) {
  const lines = wrap(str, s, maxW);
  lines.forEach((ln, i) => drawText(ln, x, y + i * lh, s, c));
  return y + lines.length * lh;
}

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG() {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- page
function drawPage() {
  fillAll(PAPER);
  // Double outer frame.
  box(10, 10, W - 20, H - 20, NAVY, 3);
  box(18, 18, W - 36, H - 36, NAVY, 1);

  // ---- masthead
  rect(18, 18, W - 36, 108, NAVY);
  centerText("THE WORLD", W / 2, 30, 8, WHITE);
  hline(48, 100, W - 96, GOLD);
  centerText("TUESDAY 24 NOVEMBER 2026", W / 2, 106, 2, GOLD);
  drawText("ONE DAY", 44, 106, 2, hex("#9fb4d8"));
  const rightTag = "ONE IMAGE";
  drawText(rightTag, W - 44 - textWidth(rightTag, 2), 106, 2, hex("#9fb4d8"));

  // ---- lead story: Russia's nuclear satellite (y 140..436)
  const ly = 140;
  box(28, ly, 968, 296, INK, 2);
  rect(28, ly, 968, 34, RED);
  centerText("NATO WARNS OVER SPACE THREAT", W / 2, ly + 10, 2, WHITE);
  drawText("RUSSIA'S", 52, ly + 52, 6, INK);
  drawText("NUCLEAR SATELLITE", 52, ly + 100, 5, INK);
  drawText("MAY FLY WITHIN 60 DAYS", 52, ly + 152, 2, RED);
  para(
    "Reports say Russia may launch a nuclear-armed satellite, dubbed Sputnik-S, within 60 days. NATO chief Mark Rutte vows the alliance will defend every inch of its territory, including in space. Moscow dismisses the reports.",
    52, ly + 184, 2, INK, 540, 20
  );
  // Earth with an orbit ring, a satellite and a warning triangle.
  const gx = 800;
  const gy = ly + 152;
  ellipse(gx, gy, 128, 66, hex("#9fc6e8"), 2);
  disc(gx, gy, 88, BLUE);
  disc(gx - 30, gy - 26, 24, GREEN);
  disc(gx + 28, gy + 24, 28, GREEN);
  disc(gx + 38, gy - 40, 14, GREEN);
  arc(gx, gy, 88, 0, 359, hex("#9fc6e8"));
  arc(gx, gy, 56, 0, 359, hex("#9fc6e8"));
  vline(gx, gy - 88, 176, hex("#9fc6e8"));
  hline(gx - 88, gy, 176, hex("#9fc6e8"));
  // Satellite riding the orbit ring, upper right of the globe.
  const sx = gx + 104;
  const sy = gy - 38;
  thickLine(sx - 26, sy + 10, sx + 26, sy - 10, 3, INK);
  rect(sx - 30, sy + 4, 14, 6, NAVY);
  rect(sx + 16, sy - 10, 14, 6, NAVY);
  rect(sx - 7, sy - 7, 14, 14, GOLD);
  disc(sx, sy, 3, RED);
  vline(sx + 4, sy - 16, 9, INK);
  disc(sx + 4, sy - 18, 2, RED);
  // Red warning triangle with an exclamation mark, upper left of the globe.
  const tx = gx - 128;
  const ty = ly + 52;
  fillPoly([[tx, ty], [tx + 34, ty], [tx + 17, ty + 30]], RED);
  drawText("!", tx + 12, ty + 10, 2, WHITE);
  // Red DEFEND SPACE stamp, clear below the globe.
  box(gx - 118, gy + 100, 236, 40, RED, 4);
  box(gx - 111, gy + 107, 222, 26, RED, 1);
  centerText("DEFEND SPACE", gx, gy + 110, 3, RED);
}

// ---- row 2: Gaza (left) and Ukraine (right), y 452..700
function storyBox(x, y, w, h, kicker, kickerColor) {
  box(x, y, w, h, INK, 2);
  rect(x, y, w, 30, NAVY);
  drawText(kicker, x + 14, y + 8, 2, WHITE);
  return { x, y, w, h };
}
function drawGaza() {
  const b = storyBox(28, 452, 476, 248, "GAZA  -  ISRAEL-HAMAS WAR", NAVY);
  drawText("ISRAEL KILLS HAMAS", b.x + 16, b.y + 44, 3, INK);
  drawText("SECURITY CHIEF", b.x + 16, b.y + 70, 3, RED);
  para(
    "Israeli strikes kill Hamas security chief Naeem Abu Nahel and six others. The UN says the war has undone 77 years of development in Gaza.",
    b.x + 16, b.y + 102, 2, INK, b.w - 32, 18
  );
  // City skyline strip at the bottom: low dark blocks, one hit by a blast.
  const sy = b.y + b.h - 42;
  rect(b.x + 2, sy, b.w - 4, 40, hex("#3a3f4a"));
  const tops = [12, 20, 10, 24, 16, 22, 12, 18];
  let bx = b.x + 14;
  tops.forEach((hgt, i) => {
    rect(bx, sy - hgt, 40, hgt + 42, INK);
    // Lit windows on each block.
    for (let wy = sy - hgt + 6; wy < sy - 4; wy += 10) {
      for (let wx = bx + 6; wx < bx + 34; wx += 12) {
        if ((wx + wy) % 24 === 0) rect(wx, wy, 4, 5, GOLD);
      }
    }
    bx += 52;
  });
  // Blast starburst over the last block, clear of the body text.
  const ex = b.x + 436;
  const ey = sy - 10;
  for (let a = 0; a < 360; a += 30) {
    const rad = (a * Math.PI) / 180;
    thickLine(ex, ey, Math.round(ex + 14 * Math.cos(rad)), Math.round(ey + 14 * Math.sin(rad)), 2, ORANGE);
  }
  disc(ex, ey, 7, GOLD);
  disc(ex, ey, 3, WHITE);
}
function drawUkraine() {
  const b = storyBox(520, 452, 476, 248, "UKRAINE  -  RUSSIA STRIKES BACK", NAVY);
  drawText("RUSSIA HITS", b.x + 16, b.y + 44, 3, INK);
  drawText("ZAPORIZHZHIA", b.x + 16, b.y + 70, 3, RED);
  para(
    "An overnight Russian attack on Zaporizhzhia kills two and wounds dozens. Germany gains first access to Ukraine's Delta system.",
    b.x + 16, b.y + 102, 2, INK, b.w - 32, 18
  );
  // Apartment block strip: a low block with a blown-out corner, flames,
  // and a small drone overhead — all kept below the body text.
  const sy = b.y + b.h - 42;
  rect(b.x + 2, sy, b.w - 4, 40, hex("#3a3f4a"));
  const bx = b.x + 60;
  rect(bx, sy - 28, 150, 28 + 42, INK);
  // Window grid, dark where the blast hit the upper right.
  for (let wy = sy - 22; wy < sy - 6; wy += 12) {
    for (let wx = bx + 10; wx < bx + 140; wx += 20) {
      const hit = wx > bx + 96 && wy < sy - 12;
      rect(wx, wy, 8, 7, hit ? BLACK : GOLD);
    }
  }
  // Jagged black damage at the block's upper-right corner.
  fillPoly(
    [
      [bx + 104, sy - 28],
      [bx + 150, sy - 28],
      [bx + 150, sy - 10],
      [bx + 130, sy - 18],
      [bx + 118, sy - 8],
    ],
    BLACK
  );
  // Flames at the damage.
  disc(bx + 128, sy - 20, 6, ORANGE);
  disc(bx + 136, sy - 25, 4, GOLD);
  disc(bx + 120, sy - 25, 3, ORANGE);
  // Small quadcopter drone with a red light, upper right of the strip.
  const dx = b.x + 380;
  const dy = sy - 30;
  rect(dx - 14, dy - 4, 28, 8, BLACK);
  disc(dx - 18, dy - 6, 4, BLACK);
  disc(dx + 18, dy - 6, 4, BLACK);
  hline(dx - 24, dy - 10, 12, BLACK);
  hline(dx + 12, dy - 10, 12, BLACK);
  disc(dx, dy - 8, 3, RED);
}

// ---- row 3: Sanofi deal (left) and Myanmar sanctions (right), y 716..920
function drawSanofi() {
  const b = storyBox(28, 716, 476, 204, "BUSINESS  -  BIGGEST BIOTECH DEAL", NAVY);
  drawText("SANOFI BUYS INSMED", b.x + 16, b.y + 42, 3, INK);
  drawText("FOR $41 BILLION", b.x + 16, b.y + 68, 3, GREEN);
  para(
    "Sanofi agrees to buy US biotech Insmed for $175 a share, the biggest biotech deal in nearly three years.",
    b.x + 16, b.y + 100, 2, INK, b.w - 32, 19
  );
  // Bottom strip: rising green bars and the price tag.
  const base = b.y + b.h - 6;
  const bars = [8, 16, 24, 34, 46];
  bars.forEach((hgt, i) => rect(b.x + 24 + i * 26, base - hgt, 16, hgt, GREEN));
  drawText("$41B", b.x + 180, base - 24, 3, GREEN);
  drawText("$175 A SHARE", b.x + 300, base - 20, 2, INK);
}
function drawMyanmar() {
  const b = storyBox(520, 716, 476, 204, "JUSTICE  -  THE HAGUE", NAVY);
  drawText("UK SANCTIONS", b.x + 16, b.y + 42, 3, INK);
  drawText("MYANMAR GENERALS", b.x + 16, b.y + 68, 3, INK);
  drawText("AFTER GENOCIDE RULING", b.x + 16, b.y + 94, 2, RED);
  para(
    "Britain sanctions five Myanmar generals after the world court ruled Myanmar committed genocide against the Rohingya in 2017.",
    b.x + 16, b.y + 120, 2, INK, b.w - 32, 19
  );
  // Small scales of justice in the empty space at the top right.
  const cx = b.x + 400;
  const cy = b.y + 46;
  vline(cx, cy - 6, 52, NAVY);
  hline(cx - 34, cy - 6, 68, NAVY);
  disc(cx, cy - 10, 4, GOLD);
  rect(cx - 12, cy + 44, 24, 4, NAVY);
  // Left pan.
  line(cx - 34, cy - 6, cx - 44, cy + 18, NAVY);
  line(cx - 34, cy - 6, cx - 24, cy + 18, NAVY);
  hline(cx - 44, cy + 18, 20, NAVY);
  disc(cx - 34, cy + 22, 3, GOLD);
  // Right pan.
  line(cx + 34, cy - 6, cx + 24, cy + 18, NAVY);
  line(cx + 34, cy - 6, cx + 44, cy + 18, NAVY);
  hline(cx + 24, cy + 18, 20, NAVY);
  disc(cx + 34, cy + 22, 3, GOLD);
}

// ---- ticker + footer
function drawTicker() {
  const y = 936;
  rect(28, y, 968, 52, BLACK);
  drawText("ALSO TODAY", 44, y + 8, 2, GOLD);
  const items =
    "Virginia and Oregon sue SpaceX over Grok deepfakes  \u2022  Fighting in Congo traps Ebola teams  \u2022  Russian jets enter South Korea air defence zone  \u2022  UN chief urges global AI safety talks  \u2022  Trump to meet NATO chief Rutte on Wednesday";
  para(items, 44, y + 28, 1, WHITE, 936, 11);
  centerText(
    "SOURCES: BBC  -  REUTERS  -  AP  -  NPR  -  TBS  -  UN NEWS",
    W / 2, 996, 1, GREY
  );
}

// ---------------------------------------------------------------- main
drawPage();
drawGaza();
drawUkraine();
drawSanofi();
drawMyanmar();
drawTicker();

const dir = dirname(fileURLToPath(import.meta.url));
const png = encodePNG();
const outPath = process.env.DRAW_OUT ?? join(dir, "entry.png");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);
console.log(`wrote ${png.length} bytes to ${outPath}`);
