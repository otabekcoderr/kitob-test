// scripts/generate-brand-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function createPng(width, height, pixelFn) {
  const rowStride = width * 4;
  const rawData = Buffer.alloc((1 + rowStride) * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + rowStride);
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', deflated),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// Standard CRC32
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// 1. Generate apple-touch-icon.png (180x180)
const touchIcon = createPng(180, 180, (x, y, w, h) => {
  // Brand dark background: #111714
  // Centered Kitobchi badge
  const inPillar = x >= 36 && x <= 64 && y >= 32 && y <= 148;
  const inWingTop = x >= 64 && x <= 144 && y >= 32 && y <= 90 && (x - 64) > (y - 32) * 0.8;
  const inWingBottom = x >= 64 && x <= 144 && y >= 90 && y <= 148 && (x - 64) > (148 - y) * 0.8;
  const inCenterDot = Math.hypot(x - 68, y - 90) <= 8;

  if (inCenterDot) return [254, 243, 199, 255]; // #FEF3C7
  if (inPillar) return [217, 119, 6, 255];      // #D97706
  if (inWingTop) return [245, 158, 11, 255];    // #F59E0B
  if (inWingBottom) return [217, 119, 6, 255];   // #D97706

  return [17, 23, 20, 255]; // #111714
});

fs.writeFileSync(path.join(rootDir, 'apple-touch-icon.png'), touchIcon);

// 2. Generate og-image.png (1200x630)
const ogImage = createPng(1200, 630, (x, y, w, h) => {
  // Gradient from #111714 to #1a2520
  const t = y / h;
  const r = Math.round(17 + t * 9);
  const g = Math.round(23 + t * 14);
  const b = Math.round(20 + t * 12);

  // Logo badge on the left-center (cx: 260, cy: 315, size: 280)
  const lx = x - 120;
  const ly = y - 175;
  if (lx >= 0 && lx <= 280 && ly >= 0 && ly <= 280) {
    const inPillar = lx >= 50 && lx <= 90 && ly >= 45 && ly <= 235;
    const inWingTop = lx >= 90 && lx <= 230 && ly >= 45 && ly <= 140 && (lx - 90) > (ly - 45) * 0.8;
    const inWingBottom = lx >= 90 && lx <= 230 && ly >= 140 && ly <= 235 && (lx - 90) > (235 - ly) * 0.8;
    const inCenterDot = Math.hypot(lx - 95, ly - 140) <= 12;

    if (inCenterDot) return [254, 243, 199, 255];
    if (inPillar) return [217, 119, 6, 255];
    if (inWingTop) return [245, 158, 11, 255];
    if (inWingBottom) return [217, 119, 6, 255];
  }

  // Accent horizontal divider line
  if (x >= 450 && x <= 1100 && y >= 340 && y <= 343) {
    return [217, 119, 6, 220]; // #D97706
  }

  return [r, g, b, 255];
});

fs.writeFileSync(path.join(rootDir, 'og-image.png'), ogImage);
console.log('Brand assets generated: apple-touch-icon.png, og-image.png');
