/**
 * Scatter tree instance positions inside OSM wood/forest polygons,
 * clipped to the Municipality of Luisiana.
 */

export const LUISIANA_BOUNDS = {
  west: 121.44,
  south: 14.12,
  east: 121.58,
  north: 14.27,
} as const;

export type LonLat = { lon: number; lat: number };

export type TreeInstancePose = {
  lon: number;
  lat: number;
  /** Radians — yaw around ground-up */
  yaw: number;
  /** Multiplier in [0.8, 1.2] */
  scale: number;
};

/** Pose with mercator position cached at rebuild time. */
export type TreeInstanceCached = TreeInstancePose & {
  mx: number;
  my: number;
  mz: number;
};

/** Deterministic 0..1 from integer seeds (stable across rebuilds). */
export function hash01(a: number, b: number, c = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export function insideLuisiana(lon: number, lat: number): boolean {
  return (
    lon >= LUISIANA_BOUNDS.west &&
    lon <= LUISIANA_BOUNDS.east &&
    lat >= LUISIANA_BOUNDS.south &&
    lat <= LUISIANA_BOUNDS.north
  );
}

export function bboxIntersectsLuisiana(
  west: number,
  south: number,
  east: number,
  north: number,
): boolean {
  return !(
    east < LUISIANA_BOUNDS.west ||
    west > LUISIANA_BOUNDS.east ||
    north < LUISIANA_BOUNDS.south ||
    south > LUISIANA_BOUNDS.north
  );
}

/** Ray-cast point-in-polygon for a closed lon/lat ring [[lon,lat], ...]. */
export function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  if (!ring || ring.length < 4) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringBBox(ring: number[][]): { west: number; south: number; east: number; north: number } {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of ring) {
    const lon = p[0];
    const lat = p[1];
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return { west, south, east, north };
}

/** Rough area in “degree²” for density (good enough for sample counts). */
function ringAreaDeg2(ring: number[][]): number {
  const b = ringBBox(ring);
  return Math.max(0, (b.east - b.west) * (b.north - b.south));
}

/**
 * Stable world-meter samples inside a polygon (PIP-filtered).
 * Optional jitter breaks the regular lattice so forests don't look like road grids.
 */
export function samplePointsInPolygon(
  outer: number[][],
  holes: number[][][],
  countTarget: number,
  seed: number,
  spacingM = 18,
  /** Extra random offset in meters after lattice sample (re-checked with PIP). */
  jitterMRange: [number, number] = [0, 0],
): LonLat[] {
  if (!outer || outer.length < 4 || countTarget <= 0) return [];
  const bbox = ringBBox(outer);
  if (!bboxIntersectsLuisiana(bbox.west, bbox.south, bbox.east, bbox.north)) return [];

  const west = Math.max(bbox.west, LUISIANA_BOUNDS.west);
  const south = Math.max(bbox.south, LUISIANA_BOUNDS.south);
  const east = Math.min(bbox.east, LUISIANA_BOUNDS.east);
  const north = Math.min(bbox.north, LUISIANA_BOUNDS.north);
  if (east <= west || north <= south) return [];

  const midLat = (south + north) / 2;
  const mPerDegLat = 111320;
  const mPerDegLon = Math.max(1e-6, 111320 * Math.cos((midLat * Math.PI) / 180));
  const stepLat = spacingM / mPerDegLat;
  const stepLon = spacingM / mPerDegLon;
  const [jMin, jMax] = jitterMRange;
  const jitterSpan = Math.max(0, jMax - jMin);

  const accept = (lon: number, lat: number) => {
    if (!insideLuisiana(lon, lat)) return false;
    if (!pointInRing(lon, lat, outer)) return false;
    for (const hole of holes) {
      if (pointInRing(lon, lat, hole)) return false;
    }
    return true;
  };

  const out: LonLat[] = [];
  // Offset lattice origin per-seed so adjacent forests don't share one global grid.
  const originJ = hash01(seed, 11, 22);
  const originI = hash01(seed, 33, 44);
  const i0 = Math.floor(south / stepLat - originI);
  const i1 = Math.ceil(north / stepLat - originI);
  const j0 = Math.floor(west / stepLon - originJ);
  const j1 = Math.ceil(east / stepLon - originJ);

  for (let i = i0; i <= i1 && out.length < countTarget; i++) {
    for (let j = j0; j <= j1 && out.length < countTarget; j++) {
      // Full-cell random (not a narrow 0.2–0.6 band) → breaks visible rows.
      const u = hash01(seed, i, j * 3 + 1);
      const v = hash01(seed, i, j * 3 + 2);
      let lon = (j + originJ + u) * stepLon;
      let lat = (i + originI + v) * stepLat;
      if (lon < west || lon > east || lat < south || lat > north) continue;
      if (!accept(lon, lat)) continue;

      if (jitterSpan > 0) {
        const jm = jMin + hash01(seed, i, j * 5 + 9) * jitterSpan;
        const ang = hash01(seed, i, j * 7 + 3) * Math.PI * 2;
        const jLon = lon + (Math.cos(ang) * jm) / mPerDegLon;
        const jLat = lat + (Math.sin(ang) * jm) / mPerDegLat;
        if (accept(jLon, jLat)) {
          lon = jLon;
          lat = jLat;
        }
      }
      out.push({ lon, lat });
    }
  }
  return out;
}

/** @deprecated use samplePointsInPolygon — kept as thin wrapper */
export function samplePointsInRing(
  ring: number[][],
  countTarget: number,
  seed: number,
): LonLat[] {
  return samplePointsInPolygon(ring, [], countTarget, seed);
}

export type PolyParts = { outer: number[][]; holes: number[][][] };

/** Extract outer + holes for Polygon / MultiPolygon GeoJSON. */
export function extractPolygons(geometry: {
  type?: string;
  coordinates?: any;
}): PolyParts[] {
  if (!geometry?.type || !geometry.coordinates) return [];
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    if (!Array.isArray(rings?.[0])) return [];
    return [{ outer: rings[0], holes: rings.slice(1).filter((r) => Array.isArray(r) && r.length >= 4) }];
  }
  if (geometry.type === "MultiPolygon") {
    const out: PolyParts[] = [];
    for (const poly of geometry.coordinates as number[][][][]) {
      if (!Array.isArray(poly?.[0])) continue;
      out.push({
        outer: poly[0],
        holes: poly.slice(1).filter((r) => Array.isArray(r) && r.length >= 4),
      });
    }
    return out;
  }
  return [];
}

export function extractOuterRings(geometry: {
  type?: string;
  coordinates?: any;
}): number[][][] {
  return extractPolygons(geometry).map((p) => p.outer);
}

/** Dedupe MapLibre tile duplicates (same polygon appears in many tiles). */
export function dedupeLandcoverFeatures(
  features: Array<{ id?: string | number; geometry?: any; properties?: any }>,
): Array<{ id?: string | number; geometry?: any; properties?: any }> {
  const seen = new Set<string>();
  const out: typeof features = [];
  for (const f of features) {
    const rings = extractOuterRings(f.geometry);
    if (rings.length === 0) continue;
    const ring = rings[0];
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const p of ring) {
      if (p[0] < west) west = p[0];
      if (p[0] > east) east = p[0];
      if (p[1] < south) south = p[1];
      if (p[1] > north) north = p[1];
    }
    const cls = String(f.properties?.class ?? "");
    const key = `${cls}:${west.toFixed(4)},${south.toFixed(4)},${east.toFixed(4)},${north.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/**
 * Build tree poses from landcover features.
 * Uses a fixed world-meter spacing so zoom does not reshuffle tree positions.
 */
export function buildTreePosesFromFeatures(
  features: Array<{ id?: string | number; geometry?: any; properties?: any }>,
  opts: {
    zoom: number;
    maxInstances: number;
    maxPerFeature?: number;
    /** Multiplier on class spacing ( >1 = fewer trees ). */
    spacingScale?: number;
  },
): TreeInstancePose[] {
  const { zoom, maxInstances, maxPerFeature = 2000, spacingScale = 1 } = opts;
  if (zoom < 12 || maxInstances <= 0) return [];

  const unique = dedupeLandcoverFeatures(features);
  const poses: TreeInstancePose[] = [];
  let featureIndex = 0;

  for (const f of unique) {
    if (poses.length >= maxInstances) break;
    const cls = String(f.properties?.class ?? "");
    if (cls === "farmland") continue;
    const baseSpacing =
      cls === "wood" ? 14 :
      cls === "orchard" ? 16 :
      cls === "scrub" ? 18 :
      cls === "park" ? 22 :
      cls === "grass" ? 30 :
      24;
    const spacingM = baseSpacing * Math.max(0.8, spacingScale);

    const polys = extractPolygons(f.geometry);
    const seedBase =
      typeof f.id === "number"
        ? f.id
        : typeof f.id === "string"
          ? f.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
          : featureIndex * 9973;

    let addedForFeature = 0;
    for (let ri = 0; ri < polys.length; ri++) {
      if (poses.length >= maxInstances || addedForFeature >= maxPerFeature) break;
      const { outer, holes } = polys[ri];
      const budget = Math.min(maxInstances - poses.length, maxPerFeature - addedForFeature);
      const pts = samplePointsInPolygon(outer, holes, budget, seedBase + ri * 131, spacingM);
      for (let pi = 0; pi < pts.length; pi++) {
        if (poses.length >= maxInstances || addedForFeature >= maxPerFeature) break;
        const p = pts[pi];
        const yaw = hash01(seedBase, ri, pi + 3) * Math.PI * 2;
        const scale = 0.75 + hash01(seedBase, ri, pi + 7) * 0.5;
        poses.push({ lon: p.lon, lat: p.lat, yaw, scale });
        addedForFeature++;
      }
    }
    featureIndex++;
  }

  return poses;
}
