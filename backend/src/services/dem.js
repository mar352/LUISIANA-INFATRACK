/**
 * DEM (Digital Elevation Model) service
 * Uses AWS Terrarium tiles (same source as the map's terrain layer)
 * to compute real slope index for each zone in Luisiana, Laguna.
 *
 * Terrarium encoding: R, G, B → elevation in meters
 *   elevation = (R * 256 + G + B / 256) - 32768
 *
 * Slope is computed from a 3×3 grid of elevation samples using
 * the Horn (1981) finite-difference method.
 */

import https from "https";

const TILE_SIZE = 256;
const TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

// ── Tile math ────────────────────────────────────────────────────────────────

function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

function tile2lon(x, zoom) {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

function tile2lat(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// ── HTTP fetch (no external deps) ────────────────────────────────────────────

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ── PNG decoder (pure JS, no native deps) ────────────────────────────────────
// Minimal PNG reader that handles Terrarium tiles (8-bit RGB, deflate).

import zlib from "zlib";

function readUint32BE(buf, offset) {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

function decodePng(buffer) {
  // Validate PNG signature
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== sig[i]) throw new Error("Not a PNG");
  }

  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks = [];
  let offset = 8;

  while (offset < buffer.length) {
    const length = readUint32BE(buffer, offset);
    const type = buffer.slice(offset + 4, offset + 8).toString("ascii");
    const data = buffer.slice(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = readUint32BE(data, 0);
      height = readUint32BE(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  if (colorType !== 2) throw new Error(`Unsupported PNG color type: ${colorType}`);
  if (bitDepth !== 8) throw new Error(`Unsupported bit depth: ${bitDepth}`);

  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);

  // Reconstruct pixels using PNG filter types
  const bytesPerPixel = 3; // RGB
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const srcRow = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const dstRow = pixels.slice(y * stride, (y + 1) * stride);
    const prevRow = y > 0 ? pixels.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);

    for (let x = 0; x < stride; x++) {
      const a = x >= bytesPerPixel ? dstRow[x - bytesPerPixel] : 0;
      const b = prevRow[x];
      const c = x >= bytesPerPixel ? prevRow[x - bytesPerPixel] : 0;

      let val;
      switch (filterType) {
        case 0: val = srcRow[x]; break;
        case 1: val = (srcRow[x] + a) & 0xff; break;
        case 2: val = (srcRow[x] + b) & 0xff; break;
        case 3: val = (srcRow[x] + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          val = (srcRow[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: val = srcRow[x];
      }
      dstRow[x] = val;
    }
  }

  return { width, height, pixels };
}

// ── Elevation from Terrarium RGB ─────────────────────────────────────────────

function terrariumElevation(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

// ── Fetch elevation grid for a lat/lon point ─────────────────────────────────

const tileCache = new Map();
const CACHE_MAX = 64;

async function getTilePixels(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);

  const url = `${TERRARIUM_URL}/${z}/${x}/${y}.png`;
  try {
    const buf = await fetchBuffer(url);
    const img = decodePng(buf);
    if (tileCache.size >= CACHE_MAX) {
      // Evict oldest entry
      tileCache.delete(tileCache.keys().next().value);
    }
    tileCache.set(key, img);
    return img;
  } catch {
    return null;
  }
}

async function getElevationAt(lat, lon, zoom = 10) {
  const tx = lon2tile(lon, zoom);
  const ty = lat2tile(lat, zoom);
  const img = await getTilePixels(zoom, tx, ty);
  if (!img) return null;

  // Pixel position within tile
  const tileLonW = tile2lon(tx, zoom);
  const tileLonE = tile2lon(tx + 1, zoom);
  const tileLatN = tile2lat(ty, zoom);
  const tileLatS = tile2lat(ty + 1, zoom);

  const px = Math.floor(((lon - tileLonW) / (tileLonE - tileLonW)) * TILE_SIZE);
  const py = Math.floor(((tileLatN - lat) / (tileLatN - tileLatS)) * TILE_SIZE);

  const cx = Math.max(0, Math.min(TILE_SIZE - 1, px));
  const cy = Math.max(0, Math.min(TILE_SIZE - 1, py));
  const idx = (cy * img.width + cx) * 3;

  return terrariumElevation(img.pixels[idx], img.pixels[idx + 1], img.pixels[idx + 2]);
}

// ── Slope computation (Horn 1981 finite-difference) ──────────────────────────

/**
 * Compute slope index (0–1) for a given lat/lon center.
 * Samples a 3×3 grid of elevation points spaced ~200m apart.
 * Returns slope in degrees normalized to 0–1 (0°=flat, 45°+=1.0).
 */
export async function computeSlopeIndex(lat, lon) {
  const spacing = 0.002; // ~200m in degrees

  // 3×3 grid: [row][col] = elevation
  const grid = [];
  for (let dy = -1; dy <= 1; dy++) {
    const row = [];
    for (let dx = -1; dx <= 1; dx++) {
      const elev = await getElevationAt(lat + dy * spacing, lon + dx * spacing);
      row.push(elev ?? 0);
    }
    grid.push(row);
  }

  // Horn's method: dz/dx and dz/dy
  const cellSize = spacing * 111320; // degrees → meters (approx)
  const dzdx = ((grid[0][2] + 2 * grid[1][2] + grid[2][2]) -
                (grid[0][0] + 2 * grid[1][0] + grid[2][0])) / (8 * cellSize);
  const dzdy = ((grid[2][0] + 2 * grid[2][1] + grid[2][2]) -
                (grid[0][0] + 2 * grid[0][1] + grid[0][2])) / (8 * cellSize);

  const slopeDeg = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * (180 / Math.PI);

  // Normalize: 0° = 0.0, 45°+ = 1.0
  return Math.min(1, slopeDeg / 45);
}

// ── Pre-compute slope for all zones in Luisiana bbox ─────────────────────────

const LUISIANA_BBOX = { west: 121.43, south: 14.12, east: 121.61, north: 14.27 };
const COLS = 4;
const ROWS = 3;

// Cache: zoneId → slope index
const slopeCache = new Map();
let slopeCacheReady = false;
let slopeCacheBuilding = false;

export async function buildSlopeCache(bbox = LUISIANA_BBOX) {
  if (slopeCacheBuilding) return;
  slopeCacheBuilding = true;

  const { west, south, east, north } = bbox;
  const promises = [];

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = y * COLS + x + 1;
      const zWest  = west  + (x / COLS)       * (east - west);
      const zEast  = west  + ((x + 1) / COLS) * (east - west);
      const zSouth = south + (y / ROWS)        * (north - south);
      const zNorth = south + ((y + 1) / ROWS)  * (north - south);
      const centerLat = (zSouth + zNorth) / 2;
      const centerLon = (zWest  + zEast)  / 2;

      promises.push(
        computeSlopeIndex(centerLat, centerLon).then((slope) => {
          slopeCache.set(`Z${id}`, slope);
        })
      );
    }
  }

  await Promise.all(promises);
  slopeCacheReady = true;
  slopeCacheBuilding = false;
  console.log("[DEM] Slope cache built for", slopeCache.size, "zones");
}

/**
 * Get real slope index for a zone.
 * Falls back to 0.4 (moderate) if cache not ready yet.
 */
export function getSlopeForZone(zoneId) {
  if (!slopeCacheReady) return 0.4; // fallback until cache is ready
  return slopeCache.get(zoneId) ?? 0.4;
}
