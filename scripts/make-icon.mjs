// Renders images/icon.png (256x256) matching site/static/img/logo.svg:
// teal rounded tile (#0f766e), white hangar arch, two white repo bars, and one mint accent bar (#99f6e4).
// Pure Node (zlib) with 4x supersampling; run with `node scripts/make-icon.mjs`.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const S = 256;
const SS = 4;
const N = S * SS;
const px = new Float32Array(N * N * 4); // premultiplied RGBA, 0..1

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const TEAL = hex('#0f766e');
const WHITE = hex('#ffffff');
const MINT = hex('#99f6e4');

function blend(x, y, [r, g, b], a = 1) {
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 4;
  px[i] = r * a + px[i] * (1 - a);
  px[i + 1] = g * a + px[i + 1] * (1 - a);
  px[i + 2] = b * a + px[i + 2] * (1 - a);
  px[i + 3] = a + px[i + 3] * (1 - a);
}

// Evaluate shapes in the 64x64 viewBox of site/static/img/logo.svg
function fill(test, color) {
  for (let y = 0; y < N; y++) {
    const vy = ((y + 0.5) / N) * 64;
    for (let x = 0; x < N; x++) {
      const vx = ((x + 0.5) / N) * 64;
      if (test(vx, vy)) blend(x, y, color);
    }
  }
}

const roundedRect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

const segment = (ax, ay, bx, by, w) => (x, y) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return (x - (ax + t * dx)) ** 2 + (y - (ay + t * dy)) ** 2 <= (w / 2) ** 2;
};

// Distance to upper half of ellipse centered at (32, 30) with rx=22, ry=18, stroked with width 5.
const hangarArch = (x, y) => {
  if (y > 30) return false;
  // Approximate Euclidean distance to ellipse by sampling angle around atan2
  const cx = 32;
  const cy = 30;
  const rx = 22;
  const ry = 18;
  const halfStroke = 2.5;
  let t = Math.atan2((y - cy) / ry, (x - cx) / rx);
  // Clamp to upper half [-pi, 0]
  if (t > 0) t = t < Math.PI / 2 ? 0 : -Math.PI;
  // 3 Newton steps for closest point on ellipse
  for (let k = 0; k < 4; k++) {
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    const dx = ex - (x - cx);
    const dy = ey - (y - cy);
    const dxdt = -rx * Math.sin(t);
    const dydt = ry * Math.cos(t);
    const f = dx * dxdt + dy * dydt;
    const df = dxdt * dxdt + dydt * dydt + dx * (-rx * Math.cos(t)) + dy * (-ry * Math.sin(t));
    if (Math.abs(df) > 1e-6) t -= f / df;
    if (t > 0) t = 0;
    if (t < -Math.PI) t = -Math.PI;
  }
  const px0 = cx + rx * Math.cos(t);
  const py0 = cy + ry * Math.sin(t);
  return (x - px0) ** 2 + (y - py0) ** 2 <= halfStroke * halfStroke;
};

// 1. Teal rounded background (viewBox 0..64, rx=14)
fill(roundedRect(0, 0, 64, 64, 14), TEAL);
// 2. Hangar arch: left post (10,50)-(10,30), upper elliptical arc, right post (54,30)-(54,50), stroke=5, round caps
fill(segment(10, 50, 10, 30, 5), WHITE);
fill(segment(54, 30, 54, 50, 5), WHITE);
fill(hangarArch, WHITE);
// 3. Three repository bars inside the hangar
fill(roundedRect(21, 32, 43, 36, 2), WHITE);
fill(roundedRect(21, 39, 43, 43, 2), WHITE);
fill(roundedRect(21, 46, 43, 50, 2), MINT);

// Downsample with alpha and encode PNG (RGBA, 8-bit)
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * N + (x * SS + sx)) * 4;
        r += px[i];
        g += px[i + 1];
        b += px[i + 2];
        a += px[i + 3];
      }
    }
    const n = SS * SS;
    a /= n;
    const o = y * (S * 4 + 1) + 1 + x * 4;
    raw[o] = a ? Math.round((r / n / a) * 255) : 0;
    raw[o + 1] = a ? Math.round((g / n / a) * 255) : 0;
    raw[o + 2] = a ? Math.round((b / n / a) * 255) : 0;
    raw[o + 3] = Math.round(a * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(new URL('../images/', import.meta.url), { recursive: true });
writeFileSync(new URL('../images/icon.png', import.meta.url), png);
console.log(`images/icon.png written (${S}x${S}, ${png.length} bytes)`);
