/**
 * Luisiana OSM road network for Cesium draped asphalt rendering.
 */

import { LUISIANA_BOUNDS } from "./luisiana-bounds";
import { isInsideLuisiana, loadLuisianaRing, type LonLat } from "./luisiana-polygon";

export type RoadSegment = {
  id: string | number;
  name?: string;
  highway: string;
  widthM: number;
  /** Coordinates [[lon, lat], ...] */
  points: [number, number][];
};

const BUNDLED_URL = "/data/luisiana-roads.geojson";

let memory: RoadSegment[] | null = null;
let inflight: Promise<RoadSegment[]> | null = null;

export function roadWidthFromHighway(highway: string): number {
  switch (highway) {
    case "motorway":
    case "motorway_link":
      return 12.0;
    case "trunk":
    case "trunk_link":
    case "primary":
    case "primary_link":
      return 9.0;
    case "secondary":
    case "secondary_link":
      return 7.5;
    case "tertiary":
    case "tertiary_link":
      return 6.5;
    case "residential":
    case "unclassified":
    case "living_street":
      return 5.8;
    case "service":
      return 4.5;
    case "track":
      return 4.0;
    case "pedestrian":
    case "footway":
    case "path":
      return 2.8;
    default:
      return 5.5;
  }
}

function perpendicularDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const px = p[0] - a[0];
    const py = p[1] - a[1];
    return Math.hypot(px, py);
  }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

/** Ramer-Douglas-Peucker polyline simplification for low-polygon high-performance rendering. */
function simplifyRoadPoints(points: [number, number][], epsilon = 0.00004): [number, number][] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyRoadPoints(points.slice(0, index + 1), epsilon);
    const right = simplifyRoadPoints(points.slice(index), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

function cleanCoordinates(coords: [number, number][]): [number, number][] {
  if (coords.length < 2) return [];
  const out: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const prev = out[out.length - 1];
    const curr = coords[i];
    const dx = curr[0] - prev[0];
    const dy = curr[1] - prev[1];
    // Skip tiny sub-meter steps to reduce vertex count
    if (Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5) {
      out.push(curr);
    }
  }
  if (out.length < 2) return [];
  return simplifyRoadPoints(out, 0.00004);
}

function inLuisianaBox(lon: number, lat: number): boolean {
  return (
    lon >= LUISIANA_BOUNDS.west &&
    lon <= LUISIANA_BOUNDS.east &&
    lat >= LUISIANA_BOUNDS.south &&
    lat <= LUISIANA_BOUNDS.north
  );
}

function isSegmentInBounds(points: [number, number][], ring: LonLat[] | null): boolean {
  if (points.length < 2) return false;
  // Check if midpoint or endpoints are in bounds
  const mid = points[Math.floor(points.length / 2)];
  if (!inLuisianaBox(mid[0], mid[1])) return false;
  if (!ring || ring.length < 4) return true;
  return isInsideLuisiana(mid[0], mid[1], ring) ||
         isInsideLuisiana(points[0][0], points[0][1], ring) ||
         isInsideLuisiana(points[points.length - 1][0], points[points.length - 1][1], ring);
}

const ALLOWED_HIGHWAYS = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "residential",
  "unclassified",
]);

function highwayRank(highway: string): number {
  if (highway.startsWith("primary") || highway.startsWith("trunk")) return 1;
  if (highway.startsWith("secondary")) return 2;
  if (highway.startsWith("tertiary")) return 3;
  if (highway === "residential") return 4;
  return 5;
}

function featuresFromGeoJSON(data: any, ring: LonLat[] | null): RoadSegment[] {
  const list = Array.isArray(data?.features) ? data.features : [];
  const out: RoadSegment[] = [];

  for (const f of list) {
    const geom = f?.geometry;
    if (!geom) continue;
    const highway = f.properties?.highway || "residential";
    if (!ALLOWED_HIGHWAYS.has(highway)) continue;

    const widthM = roadWidthFromHighway(highway);
    const name = f.properties?.name || undefined;

    if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
      const pts = cleanCoordinates(geom.coordinates);
      if (pts.length >= 2 && isSegmentInBounds(pts, ring)) {
        out.push({ id: f.id ?? Math.random().toString(), name, highway, widthM, points: pts });
      }
    } else if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
      for (const line of geom.coordinates) {
        if (!Array.isArray(line)) continue;
        const pts = cleanCoordinates(line);
        if (pts.length >= 2 && isSegmentInBounds(pts, ring)) {
          out.push({ id: f.id ?? Math.random().toString(), name, highway, widthM, points: pts });
        }
      }
    }
  }

  // Sort by highway importance and cap to 90 primary/secondary/residential arteries
  out.sort((a, b) => highwayRank(a.highway) - highwayRank(b.highway));
  return out.slice(0, 90);
}

async function fetchBundled(ring: LonLat[] | null): Promise<RoadSegment[]> {
  const res = await fetch(BUNDLED_URL, { cache: "force-cache" });
  if (!res.ok) throw new Error(`roads geojson HTTP ${res.status}`);
  return featuresFromGeoJSON(await res.json(), ring);
}

export async function fetchLuisianaRoads(): Promise<RoadSegment[]> {
  if (memory) return memory;
  if (inflight) return inflight;

  inflight = (async () => {
    let ring: LonLat[] | null = null;
    try {
      ring = await loadLuisianaRing();
    } catch {
      // Box fallback is fine
    }

    try {
      const bundled = await fetchBundled(ring);
      if (bundled.length > 0) {
        memory = bundled;
        console.info(`[osm-roads] Loaded ${bundled.length} road segments in Luisiana`);
        return bundled;
      }
    } catch (err) {
      console.warn("[osm-roads] bundled failed:", err);
    }

    memory = [];
    return memory;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
