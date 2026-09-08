/**
 * MapTiler helpers for Cesium & MapLibre (Satellite, Streets, 3D Terrain).
 * @see https://docs.maptiler.com/cesium/
 */

export const MAPTILER_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>';

/**
 * Returns the configured MapTiler API Key from Vite environment variables.
 */
export function maptilerApiKey(): string {
  const key = (
    (import.meta.env.VITE_MAPTILER_API_KEY as string | undefined) ||
    (import.meta.env.VITE_MAPTILER_KEY as string | undefined) ||
    (import.meta.env.VITE_MAPTILER_TOKEN as string | undefined) ||
    ""
  ).trim();
  return key;
}

/**
 * MapTiler raster tile URL for street / outdoors basemaps.
 * e.g. streets-v2, outdoor-v2, basic-v2, dataviz-dark
 */
export function maptilerRasterUrl(mapId: string = "streets-v2", ext: "jpg" | "png" = "png"): string {
  const key = maptilerApiKey();
  const base = `https://api.maptiler.com/maps/${mapId}/{z}/{x}/{y}.${ext}`;
  return key ? `${base}?key=${encodeURIComponent(key)}` : base;
}

/**
 * MapTiler high-resolution global satellite imagery tile URL for Cesium.
 */
export function maptilerSatelliteUrl(): string {
  const key = maptilerApiKey();
  const base = `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg`;
  return key ? `${base}?key=${encodeURIComponent(key)}` : base;
}

/**
 * MapTiler quantized-mesh 3D terrain provider endpoint for Cesium.
 */
export function maptilerTerrainUrl(): string {
  const key = maptilerApiKey();
  const base = `https://api.maptiler.com/tiles/terrain-quantized-mesh/`;
  return key ? `${base}?key=${encodeURIComponent(key)}` : base;
}
