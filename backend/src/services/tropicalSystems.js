/**
 * Tropical systems (Invest / TC) via RAMMB/CIRA TC Realtime.
 * Free public HTML feed — includes JTWC Invests with synoptic track history.
 * PAGASA LPA has no official API; Invests inside the PH AOI are labeled LPA-watch.
 *
 * Source: https://rammb-data.cira.colostate.edu/tc_realtime/
 */

const RAMMB_INDEX_URL = "https://rammb-data.cira.colostate.edu/tc_realtime/";
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes
const FETCH_TIMEOUT_MS = 20_000;

/** Philippine area of interest for LPA-watch labeling. */
const PH_AOI = { south: 5, north: 25, west: 115, east: 135 };

/** @type {{ fetchedAt: number, payload: object | null }} */
let cache = { fetchedAt: 0, payload: null };

function inPhAoi(lat, lon) {
  return (
    lat >= PH_AOI.south &&
    lat <= PH_AOI.north &&
    lon >= PH_AOI.west &&
    lon <= PH_AOI.east
  );
}

function classifyStage(rawName) {
  const n = String(rawName || "").trim().toUpperCase();
  if (n.includes("INVEST")) return "invest";
  if (n.includes("SUPER TYPHOON") || n.includes("TYPHOON")) return "typhoon";
  if (n.includes("TROPICAL STORM")) return "ts";
  if (n.includes("TROPICAL DEPRESSION")) return "td";
  return "other";
}

function displayName(rawName) {
  return String(rawName || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLabel(stage, basinId, name, lat, lon) {
  const shortBasin = basinId.toUpperCase();
  if (stage === "invest") {
    const base = `Invest ${shortBasin}`;
    return inPhAoi(lat, lon) ? `${base} / LPA-watch` : base;
  }
  // "WP122026 - Typhoon DOLPHIN" → keep descriptive part if present
  const dash = name.indexOf("-");
  const descriptive = dash >= 0 ? name.slice(dash + 1).trim() : name;
  return descriptive || `${shortBasin} ${stage.toUpperCase()}`;
}

function stormPageUrl(identifier) {
  return `${RAMMB_INDEX_URL}storm.asp?storm_identifier=${encodeURIComponent(identifier)}`;
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "INFA-TRACK/1.0 (municipal GIS; tropical systems proxy)",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse Western Pacific storms from the RAMMB index page.
 * @returns {{ identifier: string, basinId: string, name: string }[]}
 */
function parseIndexStorms(html) {
  const storms = [];
  const seen = new Set();
  const re =
    /storm\.asp\?storm_identifier=([a-z0-9]+)[^>]*>\s*(WP\d{6})\s*-\s*([^<\n]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const identifier = m[1].toLowerCase();
    if (seen.has(identifier)) continue;
    seen.add(identifier);
    const wpCode = m[2].toUpperCase();
    const namePart = displayName(m[3]);
    storms.push({
      identifier,
      basinId: identifier.slice(0, 4), // e.g. wp97, wp12
      name: `${wpCode} - ${namePart}`,
    });
  }
  return storms;
}

/**
 * Parse Track History rows (newest-first on the page).
 * @returns {{ time: string, lat: number, lon: number, intensityKt: number }[]}
 */
function parseTrackHistory(html) {
  const sectionMatch = html.match(/Track History[\s\S]*?<\/table>/i);
  if (!sectionMatch) return [];

  const rows = [];
  const rowRe =
    /<tr>\s*<td>(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})<\/td>\s*<td>(-?\d+(?:\.\d+)?)<\/td>\s*<td>(-?\d+(?:\.\d+)?)<\/td>\s*<td>(-?\d+(?:\.\d+)?)<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(sectionMatch[0])) !== null) {
    const lat = Number(m[2]);
    const lon = Number(m[3]);
    const intensityKt = Number(m[4]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // Skip empty placeholder rows (0,0)
    if (lat === 0 && lon === 0) continue;
    rows.push({
      time: m[1].trim(),
      lat,
      lon,
      intensityKt: Number.isFinite(intensityKt) ? intensityKt : 0,
    });
  }
  return rows;
}

/**
 * @param {{ identifier: string, basinId: string, name: string }} storm
 */
async function fetchStormDetail(storm) {
  const html = await fetchText(stormPageUrl(storm.identifier));
  const historyNewestFirst = parseTrackHistory(html);
  if (historyNewestFirst.length === 0) return null;

  const latest = historyNewestFirst[0];
  // Chronological for polylines
  const track = [...historyNewestFirst].reverse().map((p) => ({
    lon: p.lon,
    lat: p.lat,
    intensityKt: p.intensityKt,
    observedAt: toIsoApprox(p.time),
  }));

  const stage = classifyStage(storm.name);
  const label = buildLabel(stage, storm.basinId, storm.name, latest.lat, latest.lon);

  return {
    id: storm.identifier,
    basinId: storm.basinId,
    name: storm.name,
    stage,
    label,
    lon: latest.lon,
    lat: latest.lat,
    intensityKt: latest.intensityKt,
    observedAt: toIsoApprox(latest.time),
    track,
    sourceUrl: stormPageUrl(storm.identifier),
    lpaWatch: stage === "invest" && inPhAoi(latest.lat, latest.lon),
  };
}

/** RAMMB times are UTC synoptic clocks without Z; treat as UTC. */
function toIsoApprox(synoptic) {
  const s = String(synoptic).trim().replace(" ", "T");
  const d = new Date(`${s}:00Z`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function scrapeTropicalSystems() {
  const indexHtml = await fetchText(RAMMB_INDEX_URL);
  const listed = parseIndexStorms(indexHtml);

  const systems = [];
  // Parallel but capped — RAMMB is a small public site
  const chunkSize = 4;
  for (let i = 0; i < listed.length; i += chunkSize) {
    const chunk = listed.slice(i, i + chunkSize);
    const results = await Promise.allSettled(chunk.map((s) => fetchStormDetail(s)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) systems.push(r.value);
    }
  }

  return {
    source: "rammb-cira-tc-realtime",
    sourceIndexUrl: RAMMB_INDEX_URL,
    disclaimer:
      "Positions from RAMMB/CIRA TC Realtime (JTWC-derived). Invests in the Philippine AOI are labeled LPA-watch; not an official PAGASA bulletin.",
    updatedAt: new Date().toISOString(),
    systems,
  };
}

/**
 * Cached tropical systems payload.
 * On scrape failure, returns last good cache if any; otherwise empty list + error.
 */
export async function getTropicalSystems({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.payload && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { ...cache.payload, cached: true };
  }

  try {
    const payload = await scrapeTropicalSystems();
    cache = { fetchedAt: now, payload: { ...payload, error: null } };
    return { ...cache.payload, cached: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (cache.payload) {
      return {
        ...cache.payload,
        cached: true,
        error: `Using cached data; refresh failed: ${message}`,
      };
    }
    return {
      source: "rammb-cira-tc-realtime",
      sourceIndexUrl: RAMMB_INDEX_URL,
      disclaimer:
        "Positions from RAMMB/CIRA TC Realtime (JTWC-derived). Invests in the Philippine AOI are labeled LPA-watch; not an official PAGASA bulletin.",
      updatedAt: new Date().toISOString(),
      systems: [],
      cached: false,
      error: message,
    };
  }
}
