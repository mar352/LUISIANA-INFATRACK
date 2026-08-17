/**
 * Municipality outline as a lon/lat ring, plus point-in-polygon.
 * Use this — not the square LUISIANA_BOUNDS box — when placing risk/quake dots.
 */

export const LUISIANA_BOUNDARY_URL = "/data/luisiana-boundary.geojson";

export type LonLat = [number, number];

let cachedRing: LonLat[] | null = null;

export function pointInRing(lon: number, lat: number, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const denom = yj - yi;
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (denom === 0 ? Number.EPSILON : denom) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function ringFromGeojson(geojson: {
  features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }>;
}): LonLat[] {
  const feature = geojson.features?.find(
    (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
  );
  if (!feature?.geometry) return [];
  if (feature.geometry.type === "Polygon") {
    const coords = feature.geometry.coordinates as LonLat[][];
    return coords[0] ?? [];
  }
  const polys = feature.geometry.coordinates as LonLat[][][];
  return polys.reduce((best, poly) => (poly[0].length > best.length ? poly[0] : best), polys[0]?.[0] ?? []);
}

export async function loadLuisianaRing(): Promise<LonLat[]> {
  if (cachedRing && cachedRing.length > 3) return cachedRing;
  const res = await fetch(LUISIANA_BOUNDARY_URL, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Luisiana boundary HTTP ${res.status}`);
  const ring = ringFromGeojson(await res.json());
  if (ring.length < 4) throw new Error("Luisiana boundary ring is empty");
  cachedRing = ring;
  return ring;
}

export function isInsideLuisiana(lon: number, lat: number, ring: LonLat[]): boolean {
  return pointInRing(lon, lat, ring);
}

export function ringBounds(ring: LonLat[]): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return { west, south, east, north };
}
