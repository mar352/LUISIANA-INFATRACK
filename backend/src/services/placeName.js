/**
 * Reverse-geocode a map click to a street or barangay name (not the POI/building).
 */

const UA = "INFA-TRACK-Luisiana/1.0 (municipal GIS)";
const ROAD_AROUND_M = 90;
const PLACE_AROUND_M = 700;
const cache = new Map();
const CACHE_MAX = 800;

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const BARANGAY_LIST = [
  "Barangay Zone I (Poblacion)",
  "Barangay Zone II (Poblacion)",
  "Barangay Zone III (Poblacion)",
  "Barangay Zone IV (Poblacion)",
  "Barangay Zone V (Poblacion)",
  "Barangay Zone VI (Poblacion)",
  "Barangay Zone VII (Poblacion)",
  "Barangay Zone VIII (Poblacion)",
  "De La Paz",
  "San Antonio",
  "San Buenaventura",
  "San Diego",
  "San Isidro",
  "San Jose",
  "San Juan",
  "San Luis",
  "San Pablo",
  "San Pedro",
  "San Rafael",
  "San Roque",
  "San Salvador",
  "Santo Domingo",
  "Santo Tomas",
];

function cacheKey(lat, lon) {
  return `sb3:${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
}

const ZONE_ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };
const ZONE_BARANGAY = {
  1: "Barangay Zone I (Poblacion)",
  2: "Barangay Zone II (Poblacion)",
  3: "Barangay Zone III (Poblacion)",
  4: "Barangay Zone IV (Poblacion)",
  5: "Barangay Zone V (Poblacion)",
  6: "Barangay Zone VI (Poblacion)",
  7: "Barangay Zone VII (Poblacion)",
  8: "Barangay Zone VIII (Poblacion)",
};

function remember(key, value) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
  return value;
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cleanName(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

function barangayKey(raw) {
  return cleanName(raw)
    .toLowerCase()
    .replace(/^brgy\.?\s+/i, "")
    .replace(/^barangay\s+/i, "")
    .replace(/\(poblacion\)/gi, "")
    .replace(/poblacion/gi, "")
    .replace(/zone\s*0*/i, "zone ")
    .trim();
}

function parseZoneNumber(raw) {
  const n = barangayKey(raw);
  const m = n.match(/^zone\s*([ivxlcdm]+|\d+)$/i);
  if (!m) return null;
  const token = m[1].toLowerCase();
  if (/^\d+$/.test(token)) {
    const num = Number(token);
    return num >= 1 && num <= 8 ? num : null;
  }
  return ZONE_ROMAN[token] ?? null;
}

function matchBarangay(raw) {
  const n = barangayKey(raw);
  if (!n) return "";
  const zone = parseZoneNumber(n);
  if (zone != null) return ZONE_BARANGAY[zone] ?? "";
  for (const b of BARANGAY_LIST) {
    if (barangayKey(b) === n) return b;
  }
  return cleanName(raw);
}

function formatBarangayLabel(raw) {
  const brgy = matchBarangay(raw);
  if (!brgy) return "";
  if (brgy.startsWith("Barangay") || BARANGAY_LIST.includes(brgy)) return brgy;
  return `Barangay ${brgy}`;
}

function formatLocationName(street, barangay) {
  let road = cleanName(street);
  if (road) {
    road = road.replace(/\s*[-·•]\s*(Barangay|Brgy).*$/i, "").trim();
    return road;
  }
  const brgy = formatBarangayLabel(barangay);
  if (brgy) return brgy;
  return null;
}

async function overpassAround(lat, lon) {
  const query = `
[out:json][timeout:12];
(
  way["highway"]["name"](around:${ROAD_AROUND_M},${lat},${lon});
  nwr["place"~"suburb|village|neighbourhood|quarter|hamlet"]["name"](around:${PLACE_AROUND_M},${lat},${lon});
);
out center tags 40;
`.trim();
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
          "User-Agent": UA,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new Error("Overpass failed");
}

function fromOverpass(data, lat, lon) {
  let street = "";
  let streetDist = Infinity;
  let barangay = "";
  let brgyDist = Infinity;
  for (const el of data?.elements ?? []) {
    const name = cleanName(el.tags?.name);
    if (!name) continue;
    const plat = el.lat ?? el.center?.lat;
    const plon = el.lon ?? el.center?.lon;
    if (!Number.isFinite(plat) || !Number.isFinite(plon)) continue;
    const distanceM = haversineM(lat, lon, plat, plon);
    if (el.tags?.highway && distanceM <= ROAD_AROUND_M + 20 && distanceM < streetDist) {
      street = name;
      streetDist = distanceM;
    }
    if (el.tags?.place && distanceM <= PLACE_AROUND_M && distanceM < brgyDist) {
      barangay = name;
      brgyDist = distanceM;
    }
  }
  return { street, barangay };
}

async function nominatimReverse(lat, lon) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    `&zoom=17&addressdetails=1`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return { street: "", barangay: "" };
    const data = await res.json();
    const addr = data.address || {};
    return {
      street: cleanName(addr.road || addr.pedestrian || addr.residential || ""),
      barangay: cleanName(
        addr.suburb ||
          addr.neighbourhood ||
          addr.village ||
          addr.quarter ||
          addr.city_district ||
          addr.hamlet ||
          "",
      ),
    };
  } catch {
    return { street: "", barangay: "" };
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupPlaceName({ lat, lon } = {}) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  const key = cacheKey(la, lo);
  if (cache.has(key)) return cache.get(key);

  const nom = await nominatimReverse(la, lo);
  let street = nom.street;
  let barangay = nom.barangay;

  if (!street || !barangay) {
    try {
      const overpass = await overpassAround(la, lo);
      const fromOsm = fromOverpass(overpass, la, lo);
      if (!street) street = fromOsm.street;
      if (!barangay) barangay = fromOsm.barangay;
    } catch (err) {
      console.warn("[place-name] Overpass:", err?.message || err);
    }
  }

  return remember(key, formatLocationName(street, barangay));
}
