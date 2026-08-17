/**
 * Live DEM / satellite features for the earthquake siting net.
 * Cesium registers the sampler when terrain (Satellite toggle) is on.
 */

export type TerrainSatSample = {
  elevation: number;
  slope: number;
  aspect: number;
  /** 0–1 vegetation / green proxy from satellite when available. */
  greenness: number;
};

export type TerrainSatSampler = (lon: number, lat: number) => Promise<TerrainSatSample | null>;

let sampler: TerrainSatSampler | null = null;
const cache = new Map<string, TerrainSatSample>();

function key(lon: number, lat: number): string {
  return `${lon.toFixed(5)},${lat.toFixed(5)}`;
}

export function registerTerrainSatSampler(fn: TerrainSatSampler | null): void {
  sampler = fn;
  cache.clear();
}

export function hasTerrainSatSampler(): boolean {
  return sampler != null;
}

export async function sampleTerrainSat(lon: number, lat: number): Promise<TerrainSatSample | null> {
  const k = key(lon, lat);
  const hit = cache.get(k);
  if (hit) return hit;
  if (!sampler) return null;
  const s = await sampler(lon, lat);
  if (s) cache.set(k, s);
  return s;
}

export async function sampleTerrainSatMany(
  points: Array<{ lon: number; lat: number }>,
): Promise<void> {
  for (const p of points) {
    await sampleTerrainSat(p.lon, p.lat);
  }
}

export function cachedTerrainSat(lon: number, lat: number): TerrainSatSample | null {
  return cache.get(key(lon, lat)) ?? null;
}
