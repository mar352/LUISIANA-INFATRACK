/**
 * Live MGB flood + rain-induced landslide at a point.
 * Public GeoRiskPH ArcGIS MapServers — no token, no HazardHunter scrape.
 * Luisiana bbox only. Empty identify = Safe (not in a mapped polygon).
 */

const UA = "INFA-TRACK-Luisiana/1.0 (municipal GIS; MGB flood/landslide)";
const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 400;

const GEORISK_BASE = "https://ulap-hazards.georisk.gov.ph/arcgis/rest/services/MGBPublic";

/** Generous municipality box; frontend still uses the precise polygon. */
const LUISIANA_BBOX = { west: 121.44, south: 14.12, east: 121.58, north: 14.27 };

const FLOOD_CODES = {
  "01": "Low Susceptibility",
  "02": "Moderate Susceptibility",
  "03": "High Susceptibility",
  "04": "Very High Susceptibility",
};

const RIL_CODES = {
  "01": "Debris Flow / Accumulation Zone",
  "02": "Low Susceptibility",
  "03": "Moderate Susceptibility",
  "04": "High Susceptibility",
  "05": "Very High Susceptibility",
};

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

export function isInsideLuisianaBbox(lat, lon) {
  return (
    lon >= LUISIANA_BBOX.west &&
    lon <= LUISIANA_BBOX.east &&
    lat >= LUISIANA_BBOX.south &&
    lat <= LUISIANA_BBOX.north
  );
}

function attrMap(attributes) {
  const out = {};
  if (!attributes || typeof attributes !== "object") return out;
  for (const [k, v] of Object.entries(attributes)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s || s === "Null" || s === "null") continue;
    out[k] = s;
    out[k.toLowerCase()] = s;
  }
  return out;
}

function pick(map, keys) {
  for (const k of keys) {
    const v = map[k] ?? map[k.toLowerCase()];
    if (v) return v;
  }
  return "";
}

function rankFromLabel(value) {
  const v = String(value || "").toLowerCase();
  if (v.includes("debris")) return 5;
  if (v.includes("very high")) return 4;
  if (v.includes("high")) return 3;
  if (v.includes("moderate")) return 2;
  if (v.includes("low")) return 1;
  if (v === "safe") return 0;
  return 0;
}

function decodeFlood(attributes) {
  const m = attrMap(attributes);
  const code = pick(m, ["fscode", "Flood Susceptibility"]).replace(/\D/g, "").padStart(2, "0");
  const labeled = pick(m, ["Flood Susceptibility", "fscode"]);
  if (FLOOD_CODES[code]) return { value: FLOOD_CODES[code], code };
  if (FLOOD_CODES[labeled]) return { value: FLOOD_CODES[labeled], code: labeled };
  if (/suscept/i.test(labeled)) {
    const found = Object.entries(FLOOD_CODES).find(([, name]) =>
      name.toLowerCase() === labeled.toLowerCase(),
    );
    return { value: labeled, code: found?.[0] ?? null };
  }
  return null;
}

function decodeRil(attributes) {
  const m = attrMap(attributes);
  const codeRaw = pick(m, ["rilscode", "RIL Susceptibility"]);
  const code = /^\d{1,2}$/.test(codeRaw) ? codeRaw.padStart(2, "0") : "";
  const labeled = pick(m, [
    "RIL Susceptibility",
    "lndslidesu",
    "RIL Susceptibility Description",
  ]);
  if (RIL_CODES[code]) return { value: RIL_CODES[code], code };
  if (/suscept|debris/i.test(labeled)) {
    const found = Object.entries(RIL_CODES).find(([, name]) =>
      name.toLowerCase() === labeled.toLowerCase(),
    );
    return { value: labeled, code: found?.[0] ?? null };
  }
  if (labeled === "LL" || labeled.toLowerCase() === "low") {
    return { value: RIL_CODES["02"], code: "02" };
  }
  return code ? { value: RIL_CODES[code] || labeled || code, code } : null;
}

function worstLayer(results, decode) {
  let best = null;
  let bestRank = -1;
  for (const row of results) {
    const decoded = decode(row?.attributes);
    if (!decoded) continue;
    const rank = rankFromLabel(decoded.value);
    if (rank > bestRank) {
      best = decoded;
      bestRank = rank;
    }
  }
  return best;
}

function identifyUrl(service, lon, lat) {
  const pad = 0.02;
  const params = new URLSearchParams({
    f: "json",
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers: "all:0",
    tolerance: "3",
    mapExtent: `${lon - pad},${lat - pad},${lon + pad},${lat + pad}`,
    imageDisplay: "400,400,96",
    returnGeometry: "false",
  });
  return `${GEORISK_BASE}/${service}/MapServer/identify?${params}`;
}

async function identify(service, lon, lat) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(identifyUrl(service, lon, lat), {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json?.error) throw new Error(json.error.message || "GeoRisk error");
    return Array.isArray(json.results) ? json.results : [];
  } finally {
    clearTimeout(timer);
  }
}

const UNAVAILABLE = { value: "Unavailable", code: null };

async function layerResult(service, lon, lat, decode) {
  try {
    const results = await identify(service, lon, lat);
    const hit = worstLayer(results, decode);
    if (hit) return hit;
    return { value: "Safe", code: null };
  } catch (err) {
    console.error("georisk-assess", service, err instanceof Error ? err.message : err);
    return UNAVAILABLE;
  }
}

export async function assessGeorisk({ lat, lon }) {
  if (!isInsideLuisianaBbox(lat, lon)) {
    return { inside: false, flood: null, landslide: null, source: "MGB via GeoRiskPH" };
  }

  const key = cacheKey(lat, lon);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const [flood, landslide] = await Promise.all([
    layerResult("Flood", lon, lat, decodeFlood),
    layerResult("RainInducedLandslide", lon, lat, decodeRil),
  ]);

  return remember(key, {
    inside: true,
    flood,
    landslide,
    source: "MGB via GeoRiskPH",
  });
}
