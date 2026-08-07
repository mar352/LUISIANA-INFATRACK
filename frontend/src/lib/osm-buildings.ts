/**
 * Luisiana OSM building footprints for Cesium extrusion (municipality only).
 */

import { LUISIANA_BOUNDS } from "./luisiana-bounds";

export type BuildingFootprint = {
  id?: string | number;
  /** Closed ring [[lon, lat], ...] */
  ring: number[][];
  /** Extrusion height in meters */
  heightM: number;
};

const BUNDLED_URL = "/data/luisiana-buildings.geojson";

let memory: BuildingFootprint[] | null = null;
let inflight: Promise<BuildingFootprint[]> | null = null;

function closeRing(ring: number[][]): number[][] {
  if (ring.length < 3) return ring;
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) ring.push([a[0], a[1]]);
  return ring;
}

function heightFromTags(tags: Record<string, string> | undefined): number {
  if (!tags) return 8;
  if (tags.height) {
    const n = parseFloat(String(tags.height).replace(/m/i, "").trim());
    if (Number.isFinite(n) && n > 1 && n < 120) return n;
  }
  if (tags["building:levels"]) {
    const lv = parseFloat(tags["building:levels"]);
    if (Number.isFinite(lv) && lv > 0) return Math.min(80, Math.max(3, lv * 3.2));
  }
  const b = tags.building;
  if (b === "house" || b === "detached" || b === "residential") return 7;
  if (b === "apartments") return 12;
  if (b === "commercial" || b === "retail") return 9;
  if (b === "church" || b === "cathedral") return 14;
  if (b === "school" || b === "hospital") return 11;
  if (b === "industrial" || b === "warehouse") return 8;
  return 8;
}

function ringInLuisiana(ring: number[][]): boolean {
  for (const p of ring) {
    const lon = p[0];
    const lat = p[1];
    if (
      lon >= LUISIANA_BOUNDS.west &&
      lon <= LUISIANA_BOUNDS.east &&
      lat >= LUISIANA_BOUNDS.south &&
      lat <= LUISIANA_BOUNDS.north
    ) {
      return true;
    }
  }
  return false;
}

function featuresFromGeoJSON(data: any): BuildingFootprint[] {
  const list = Array.isArray(data?.features) ? data.features : [];
  const out: BuildingFootprint[] = [];
  for (const f of list) {
    const geom = f?.geometry;
    if (!geom) continue;
    const heightM = Number(f.properties?.height) || 8;
    if (geom.type === "Polygon" && Array.isArray(geom.coordinates?.[0])) {
      const ring = closeRing(geom.coordinates[0].map((c: number[]) => [c[0], c[1]]));
      if (ring.length >= 4 && ringInLuisiana(ring)) {
        out.push({ id: f.id, ring, heightM });
      }
    } else if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
      for (const poly of geom.coordinates) {
        const outer = poly?.[0];
        if (!Array.isArray(outer)) continue;
        const ring = closeRing(outer.map((c: number[]) => [c[0], c[1]]));
        if (ring.length >= 4 && ringInLuisiana(ring)) {
          out.push({ id: f.id, ring, heightM });
        }
      }
    }
  }
  return out;
}

function overpassToFootprints(data: any): BuildingFootprint[] {
  const out: BuildingFootprint[] = [];
  for (const el of data?.elements ?? []) {
    if (!el.tags?.building) continue;
    const heightM = heightFromTags(el.tags);
    if (el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 4) {
      const ring = closeRing(el.geometry.map((g: { lon: number; lat: number }) => [g.lon, g.lat]));
      if (ring.length >= 4 && ringInLuisiana(ring)) out.push({ id: el.id, ring, heightM });
    }
  }
  return out;
}

async function fetchBundled(): Promise<BuildingFootprint[]> {
  const res = await fetch(BUNDLED_URL, { cache: "force-cache" });
  if (!res.ok) throw new Error(`buildings geojson HTTP ${res.status}`);
  return featuresFromGeoJSON(await res.json());
}

async function fetchOverpass(): Promise<BuildingFootprint[]> {
  const { west, south, east, north } = LUISIANA_BOUNDS;
  const query = `
[out:json][timeout:60];
(
  way["building"](${south},${west},${north},${east});
);
out geom;
`.trim();
  const endpoint = "https://overpass-api.de/api/interpreter";
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 40_000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    return overpassToFootprints(await res.json());
  } finally {
    window.clearTimeout(timer);
  }
}

/** Building footprints in Luisiana only. Bundled first, Overpass fallback. */
export async function fetchLuisianaBuildings(): Promise<BuildingFootprint[]> {
  if (memory) return memory;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const bundled = await fetchBundled();
      if (bundled.length > 0) {
        memory = bundled;
        console.info(`[osm-buildings] ${bundled.length} from bundled ${BUNDLED_URL}`);
        return bundled;
      }
    } catch (err) {
      console.warn("[osm-buildings] bundled failed:", err);
    }
    try {
      const live = await fetchOverpass();
      memory = live;
      console.info(`[osm-buildings] ${live.length} from Overpass`);
      return live;
    } catch (err) {
      console.warn("[osm-buildings] Overpass failed:", err);
      memory = [];
      return memory;
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
