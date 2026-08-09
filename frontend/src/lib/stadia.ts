/**
 * Stadia Maps basemap helpers (vector styles for MapLibre + raster tiles for Cesium).
 */

export const STADIA_DEFAULT_STYLE = "outdoors";

export const STADIA_ATTRIBUTION =
  "© Stadia Maps © OpenMapTiles © OpenStreetMap";

/** Optional API key — not required on localhost; needed for production hosts. */
export function stadiaApiKey(): string | undefined {
  const key = (import.meta.env.VITE_STADIA_API_KEY as string | undefined)?.trim();
  return key || undefined;
}

/** Known Stadia style ids: outdoors | alidade_smooth | alidade_smooth_dark | osm_bright | … */
export function stadiaStyleUrl(style: string = STADIA_DEFAULT_STYLE): string {
  const key = stadiaApiKey();
  const base = `https://tiles.stadiamaps.com/styles/${style}.json`;
  return key ? `${base}?api_key=${encodeURIComponent(key)}` : base;
}

/**
 * Raster XYZ URL template for Cesium `UrlTemplateImageryProvider`.
 * Same style family as MapLibre vector (default: outdoors).
 * @see https://docs.stadiamaps.com/raster/
 */
export function stadiaRasterTileUrl(
  style: string = STADIA_DEFAULT_STYLE,
  opts?: { retina?: boolean },
): string {
  const retina = opts?.retina ? "@2x" : "";
  const key = stadiaApiKey();
  const base = `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}${retina}.png`;
  return key ? `${base}?api_key=${encodeURIComponent(key)}` : base;
}

export const OSM_RASTER_ATTRIBUTION = "© OpenStreetMap contributors";

/** Classic OSM raster XYZ — Layers → Street Map overlay on Cesium/MapLibre. */
export const OSM_RASTER_TILE_URL =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Find the OpenMapTiles vector source id in the loaded style.
 * Stadia / OpenFreeMap usually use "openmaptiles"; fall back by scanning layers.
 */
export function detectOpenMapTilesSourceId(map: {
  getStyle: () => { sources?: Record<string, any>; layers?: any[] } | undefined;
  getSource: (id: string) => unknown;
}): string {
  if (map.getSource("openmaptiles")) return "openmaptiles";

  const style = map.getStyle();
  const layers = style?.layers ?? [];
  for (const layer of layers) {
    const sourceLayer = layer["source-layer"];
    if (
      (sourceLayer === "building" || sourceLayer === "landcover") &&
      typeof layer.source === "string" &&
      map.getSource(layer.source)
    ) {
      return layer.source;
    }
  }

  // Prefer any vector source whose tiles URL mentions openmaptiles / stadiamaps
  const sources = style?.sources ?? {};
  for (const [id, src] of Object.entries(sources)) {
    if (src?.type !== "vector") continue;
    const tiles: string[] = src.tiles ?? (src.url ? [src.url] : []);
    const blob = tiles.join(" ").toLowerCase();
    if (
      blob.includes("openmaptiles") ||
      blob.includes("stadiamaps") ||
      blob.includes("openfreemap")
    ) {
      return id;
    }
  }

  return "openmaptiles";
}
