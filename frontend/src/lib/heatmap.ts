import type { HeatPoint, Project, RiskZones, WeatherSnapshot } from "../types";

export type HeatmapMetric = "combined" | "rainfall" | "landslide" | "infrastructure";

export type BBox = { west: number; south: number; east: number; north: number };

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hash01(a: number, b: number, c: number) {
  // Cheap deterministic noise in [0,1)
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function polygonCentroid(polygon: number[][][]) {
  const ring = polygon?.[0];
  if (!ring || ring.length < 4) return null;
  // For our LGU zones (rectangles), simple average is stable and fast.
  let lon = 0;
  let lat = 0;
  const n = ring.length - 1; // last == first
  for (let i = 0; i < n; i++) {
    lon += ring[i][0];
    lat += ring[i][1];
  }
  return { lon: lon / n, lat: lat / n };
}

// Ray-casting point-in-polygon (works for rectangles and general polygons).
function pointInPolygon(lon: number, lat: number, polygon: number[][][]) {
  const ring = polygon?.[0];
  if (!ring || ring.length < 4) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function riskWeightAtPoint(lon: number, lat: number, zones: RiskZones | null) {
  if (!zones?.features?.length) return 0;
  for (const f of zones.features) {
    if (f.geometry.type !== "Polygon") continue;
    if (!pointInPolygon(lon, lat, f.geometry.coordinates as any)) continue;
    const lvl = f.properties.level;
    return lvl === "HIGH" ? 1.0 : lvl === "MODERATE" ? 0.62 : 0.22;
  }
  return 0;
}

function infraWeightAtPoint(lon: number, lat: number, projects: Project[]) {
  if (!projects.length) return 0;

  // Kernel density estimate. Sigma in meters (controls blob size).
  const sigma = 1100;
  const sigma2 = sigma * sigma;
  let sum = 0;
  for (const p of projects) {
    const d = haversineMeters({ lat, lon }, { lat: p.location.lat, lon: p.location.lon });
    const w = Math.exp(-(d * d) / (2 * sigma2));
    // Ongoing projects contribute more (operational importance).
    const statusBoost = p.status === "Ongoing" ? 1.0 : p.status === "Planning" ? 0.65 : 0.8;
    sum += w * statusBoost;
  }
  // Normalize: 0..~1 (empirical clamp keeps it stable for demos).
  return clamp01(sum / 4.5);
}

function rainfallWeight(weather: WeatherSnapshot | null) {
  // Data-driven rainfall intensity (no fake moving storm core).
  return clamp01(weather?.rainfallIntensity ?? 0.25);
}

export function buildHeatmapPoints(args: {
  bbox: BBox;
  zoom: number;
  metric: HeatmapMetric;
  weather: WeatherSnapshot | null;
  riskZones: RiskZones | null;
  projects: Project[];
  nowMs?: number;
}) {
  const { bbox, zoom, metric, weather, riskZones, projects } = args;
  const now = args.nowMs ?? Date.now();

  const rain = rainfallWeight(weather);

  // Primary sampling sources:
  // - landslide/rainfall/combined: derived from actual risk zones (spatially aligned)
  // - infrastructure: derived from project locations (true density)
  const points: HeatPoint[] = [];

  if ((metric === "landslide" || metric === "rainfall" || metric === "combined") && riskZones?.features?.length) {
    for (const f of riskZones.features) {
      if (f.geometry.type !== "Polygon") continue;
      const c = polygonCentroid(f.geometry.coordinates as any);
      if (!c) continue;

      const lvl = f.properties.level;
      const risk = lvl === "HIGH" ? 1.0 : lvl === "MODERATE" ? 0.62 : 0.22;
      const score = clamp01(Number.isFinite(f.properties.score) ? f.properties.score : risk);

      let w = 0;
      if (metric === "rainfall") w = rain;
      else if (metric === "landslide") w = clamp01(score * 0.85 + rain * 0.25);
      else w = clamp01(rain * 0.55 + score * 0.45);

      // Add 4 satellite samples around centroid to allow smooth blending (no dot grid).
      const spread = zoom >= 13 ? 0.006 : zoom >= 11 ? 0.009 : 0.012;
      const jitterSeed = Math.floor(now / 900);
      const j = (hash01(c.lon, c.lat, jitterSeed) - 0.5) * spread * 0.6;
      const j2 = (hash01(c.lat, c.lon, jitterSeed + 3) - 0.5) * spread * 0.6;

      const samples: Array<[number, number, number]> = [
        [c.lon + j, c.lat + j2, w],
        [c.lon + spread, c.lat, w * 0.82],
        [c.lon - spread, c.lat, w * 0.82],
        [c.lon, c.lat + spread, w * 0.82],
        [c.lon, c.lat - spread, w * 0.82],
      ];

      for (const s of samples) {
        // keep samples inside bbox
        if (s[0] < bbox.west || s[0] > bbox.east || s[1] < bbox.south || s[1] > bbox.north) continue;
        if (s[2] < 0.05) continue;
        points.push([Number(s[0].toFixed(6)), Number(s[1].toFixed(6)), Number(s[2].toFixed(4))]);
      }
    }
  }

  if ((metric === "infrastructure" || metric === "combined") && projects.length) {
    // Density from real project coordinates.
    for (const p of projects) {
      const wBase = p.status === "Ongoing" ? 1.0 : p.status === "Planning" ? 0.65 : 0.8;
      const w = metric === "combined" ? clamp01(0.22 + wBase * 0.55) : wBase;
      if (w < 0.05) continue;
      points.push([p.location.lon, p.location.lat, Number(w.toFixed(4))]);
    }
  }

  // Fallback if zones/projects not loaded yet: simple low-res grid with uniform rain.
  if (points.length === 0) {
    const cols = zoom >= 13 ? 44 : zoom >= 11 ? 36 : 28;
    const rows = zoom >= 13 ? 28 : zoom >= 11 ? 24 : 18;
    const jitterSeed = Math.floor(now / 900);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lon = lerp(bbox.west, bbox.east, (x + 0.5) / cols);
        const lat = lerp(bbox.south, bbox.north, (y + 0.5) / rows);
        const j1 = (hash01(x, y, jitterSeed) - 0.5) * ((bbox.east - bbox.west) / cols) * 0.22;
        const j2 = (hash01(y, x, jitterSeed + 11) - 0.5) * ((bbox.north - bbox.south) / rows) * 0.22;
        const w = rain * 0.6;
        if (w < 0.05) continue;
        points.push([lon + j1, lat + j2, Number(w.toFixed(4))]);
      }
    }
  }

  return points;
}

