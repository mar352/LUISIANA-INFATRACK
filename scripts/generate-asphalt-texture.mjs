import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const texturesDir = path.join(root, "frontend/public/textures");

if (!fs.existsSync(texturesDir)) {
  fs.mkdirSync(texturesDir, { recursive: true });
}

// CRC32 for PNG
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, "ascii");
    data.copy(buf, 8);
    const crc = crc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  const ihdrChunk = makeChunk("IHDR", ihdr);

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0;
    rgbaBuffer.copy(rawData, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk("IDAT", compressedData);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate smooth, optimal-resolution PBR asphalt texture without harsh pixel noise
function generateCleanAsphalt(width = 512, height = 512) {
  const buf = Buffer.alloc(width * height * 4);

  let seed = 42;
  function random() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  const gridW = 32;
  const gridH = 32;
  const grid = new Float32Array(gridW * gridH);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = random();
  }

  function sampleNoise(x, y) {
    const gx = ((x % 1) + 1) % 1 * gridW;
    const gy = ((y % 1) + 1) % 1 * gridH;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = (x0 + 1) % gridW;
    const y1 = (y0 + 1) % gridH;
    const fx = gx - x0;
    const fy = gy - y0;

    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const v00 = grid[y0 * gridW + x0];
    const v10 = grid[y0 * gridW + x1];
    const v01 = grid[y1 * gridW + x0];
    const v11 = grid[y1 * gridW + x1];

    const top = v00 + sx * (v10 - v00);
    const btm = v01 + sx * (v11 - v01);
    return top + sy * (btm - top);
  }

  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;

      // Multi-octave continuous smooth noise (no harsh single-pixel salt-and-pepper)
      const n1 = sampleNoise(u * 4, v * 4) * 0.55;
      const n2 = sampleNoise(u * 12, v * 12) * 0.30;
      const n3 = sampleNoise(u * 28, v * 28) * 0.15;
      const totalNoise = (n1 + n2 + n3) - 0.5;

      // Clean realistic dark slate asphalt tone: base ~ #25262a
      const baseLuma = 0.155 + totalNoise * 0.035;
      const clamped = Math.max(0.12, Math.min(0.22, baseLuma));

      const r = Math.round(clamped * 255 * 0.98);
      const g = Math.round(clamped * 255 * 1.0);
      const b = Math.round(clamped * 255 * 1.05);
      const a = 255;

      const idx = (y * width + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = a;
    }
  }

  return makePng(width, height, buf);
}

const cleanAsphaltPng = generateCleanAsphalt(512, 512);
fs.writeFileSync(path.join(texturesDir, "asphalt.png"), cleanAsphaltPng);
fs.writeFileSync(path.join(texturesDir, "asphalt_road.png"), cleanAsphaltPng);

console.log("Successfully generated clean, optimal resolution asphalt texture.");
