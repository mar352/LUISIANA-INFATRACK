/**
 * Stadia Maps basemap helpers (OpenMapTiles-compatible vector styles).
 */

export const STADIA_DEFAULT_STYLE = "outdoors";

/** Known Stadia style ids: outdoors | alidade_smooth | alidade_smooth_dark | osm_bright | … */
export function stadiaStyleUrl(style: string = STADIA_DEFAULT_STYLE): string {
  const key = import.meta.env.VITE_STADIA_API_KEY as string | undefined;
  const base = `https://tiles.stadiamaps.com/styles/${style}.json`;
  return key?.trim()
    ? `${base}?api_key=${encodeURIComponent(key.trim())}`
    : base;
}

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
