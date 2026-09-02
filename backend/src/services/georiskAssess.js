/**
 * Live MGB flood + rain-induced landslide at a point.
 * Public GeoRiskPH ArcGIS MapServers — no token.
 *
 * identify / query are NOT supported by these MapServers (returns 400).
 * Instead we use the `export` operation to get a tiny PNG image centred on
 * the point, then sample the centre pixel and match it against the known
 * MGB legend palette colours.
 *
 * Luisiana bbox only. A fully-transparent pixel means the point is not
 * inside any susceptibility polygon → "Safe".
 */

import { PNG } from "pngjs";

const UA = "INFA-TRACK-Luisiana/1.0 (municipal GIS; MGB flood/landslide)";
const FETCH_TIMEOUT_MS = 18_000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 400;

const GEORISK_BASE = "https://ulap-hazards.georisk.gov.ph/arcgis/rest/services/MGBPublic";

/** Generous municipality box; frontend still uses the precise polygon. */
const LUISIANA_BBOX = { west: 121.44, south: 14.12, east: 121.58, north: 14.27 };

// ─── Legend palettes ──────────────────────────────────────────────────────────
// Colours taken directly from the ArcGIS uniqueValueInfos renderer returned by
// /MapServer/0?f=json for each service.

const FLOOD_PALETTE = [
  { r: 0,   g: 38,  b: 115, code: "04", value: "Very High Susceptibility" },
  { r: 89,  g: 0,   b: 255, code: "03", value: "High Susceptibility" },
  { r: 176, g: 69,  b: 255, code: "02", value: "Moderate Susceptibility" },
  { r: 227, g: 209, b: 255, code: "01", value: "Low Susceptibility" },
];

const RIL_PALETTE = [
  { r: 144, g: 36,  b: 0,   code: "05", value: "Very High Susceptibility" },
  { r: 255, g: 0,   b: 0,   code: "04", value: "High Susceptibility" },
  { r: 0,   g: 128, b: 0,   code: "03", value: "Moderate Susceptibility" },
  { r: 255, g: 255, b: 0,   code: "02", value: "Low Susceptibility" },
  { r: 0,   g: 0,   b: 0,   code: "01", value: "Debris Flow / Accumulation Zone" },
];

const UNAVAILABLE = { value: "Unavailable", code: null };

// ─── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map();

function cacheKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

function remember(key, value) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isInsideLuisianaBbox(lat, lon) {
  return (
    lon >= LUISIANA_BBOX.west &&
    lon <= LUISIANA_BBOX.east &&
    lat >= LUISIANA_BBOX.south &&
    lat <= LUISIANA_BBOX.north
  );
}

/** Euclidean distance in RGB space. */
function colourDist(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Match a pixel RGBA against a known palette.
 * Returns null when the pixel is transparent (alpha < 64) = outside polygon.
 * Returns the closest palette entry within a colour-distance threshold of 80.
 */
function matchPalette(r, g, b, a, palette) {
  if (a < 64) return null; // transparent → Safe
  let best = null;
  let bestDist = Infinity;
  for (const entry of palette) {
    const d = colourDist(r, g, b, entry.r, entry.g, entry.b);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return bestDist < 80 ? { value: best.value, code: best.code } : null;
}

/**
 * Decode a raw PNG buffer and read the RGBA of the pixel at (px, py).
 */
function readPixel(buf, px, py) {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(buf, (err, data) => {
      if (err) return reject(err);
      const idx = (data.width * py + px) * 4;
      resolve({
        r: data.data[idx],
        g: data.data[idx + 1],
        b: data.data[idx + 2],
        a: data.data[idx + 3],
      });
    });
  });
}

/**
 * Export a tiny (5×5 px) map image centred on the point using the ArcGIS
 * MapServer `export` operation, then sample the centre pixel (2,2) and
 * match it to the supplied palette.
 *
 * Returns { value, code } on a match, null for Safe (transparent), or throws.
 */
async function sampleLayer(service, lon, lat, palette) {
  const pad = 0.003; // ~330 m radius — small enough for point precision
  const bbox = `${lon - pad},${lat - pad},${lon + pad},${lat + pad}`;

  const params = new URLSearchParams({
    f: "image",
    bbox,
    bboxSR: "4326",
    imageSR: "4326",
    size: "5,5",
    format: "png32",
    transparent: "true",
    dpi: "96",
    layers: "show:0",
  });

  const url = `${GEORISK_BASE}/${service}/MapServer/export?${params}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  let buf;
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }

  const { r, g, b, a } = await readPixel(buf, 2, 2);
  return matchPalette(r, g, b, a, palette);
}

async function layerResult(service, lon, lat, palette) {
  try {
    const hit = await sampleLayer(service, lon, lat, palette);
    if (hit) return hit;
    return { value: "Safe", code: null };
  } catch (err) {
    console.error("georisk-assess", service, err instanceof Error ? err.message : err);
    return UNAVAILABLE;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function assessGeorisk({ lat, lon }) {
  if (!isInsideLuisianaBbox(lat, lon)) {
    return { inside: false, flood: null, landslide: null, source: "MGB via GeoRiskPH" };
  }

  const key = cacheKey(lat, lon);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const [flood, landslide] = await Promise.all([
    layerResult("Flood",               lon, lat, FLOOD_PALETTE),
    layerResult("RainInducedLandslide", lon, lat, RIL_PALETTE),
  ]);

  return remember(key, {
    inside: true,
    flood,
    landslide,
    source: "MGB via GeoRiskPH",
  });
}
