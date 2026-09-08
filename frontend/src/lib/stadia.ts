/**
 * Stadia Maps basemap helpers & style catalog (vector styles for MapLibre + raster tiles for Cesium).
 * Includes the iconic Stadia & Stamen map styles: Outdoors, Watercolor, Alidade Smooth, Dark, Stamen Terrain, Toner, etc.
 */

export type StadiaMapStyleId =
  | "outdoors"
  | "stamen_watercolor"
  | "alidade_smooth"
  | "alidade_smooth_dark"
  | "stamen_terrain"
  | "stamen_toner"
  | "stamen_toner_lite"
  | "osm_bright"
  | "alidade_satellite";

export type StadiaMapStyleOption = {
  id: StadiaMapStyleId;
  name: string;
  tagline: string;
  badge?: string;
  icon: string;
  previewBg: string;
  textColor?: string;
};

export const STADIA_MAP_STYLES: StadiaMapStyleOption[] = [
  {
    id: "outdoors",
    name: "Outdoors",
    tagline: "Topographic & lush terrain",
    badge: "Default",
    icon: "🌿",
    previewBg: "linear-gradient(135deg, #a8d5ba 0%, #e8d595 100%)",
  },
  {
    id: "stamen_watercolor",
    name: "Watercolor",
    tagline: "Artistic hand-painted look",
    badge: "Artistic",
    icon: "🎨",
    previewBg: "linear-gradient(135deg, #e0b488 0%, #87ceeb 50%, #82c974 100%)",
  },
  {
    id: "alidade_smooth",
    name: "Alidade Smooth",
    tagline: "Clean, minimal modern light",
    badge: "Modern",
    icon: "🏙️",
    previewBg: "linear-gradient(135deg, #f0f0f0 0%, #d8d8d8 100%)",
  },
  {
    id: "alidade_smooth_dark",
    name: "Smooth Dark",
    tagline: "Sleek night & dark mode",
    badge: "Dark",
    icon: "🌑",
    previewBg: "linear-gradient(135deg, #1b212c 0%, #0d1117 100%)",
    textColor: "#f4f6f8",
  },
  {
    id: "stamen_terrain",
    name: "Stamen Terrain",
    tagline: "Hillshaded natural relief",
    badge: "Elevation",
    icon: "🏔️",
    previewBg: "linear-gradient(135deg, #d3c4a2 0%, #8cae68 100%)",
  },
  {
    id: "stamen_toner",
    name: "Stamen Toner",
    tagline: "High-contrast bold B&W",
    badge: "Monochrome",
    icon: "🖤",
    previewBg: "linear-gradient(135deg, #1a1a1a 0%, #ffffff 100%)",
  },
  {
    id: "stamen_toner_lite",
    name: "Toner Lite",
    tagline: "Soft minimal black & white",
    badge: "Light Mono",
    icon: "📰",
    previewBg: "linear-gradient(135deg, #ffffff 0%, #a0a0a0 100%)",
  },
  {
    id: "osm_bright",
    name: "OSM Bright",
    tagline: "Detailed municipal cartography",
    badge: "Streets",
    icon: "📍",
    previewBg: "linear-gradient(135deg, #ffdf85 0%, #c4e4ff 100%)",
  },
  {
    id: "alidade_satellite",
    name: "Satellite",
    tagline: "HD Aerial satellite photo",
    badge: "Photo",
    icon: "🛰️",
    previewBg: "linear-gradient(135deg, #2b3d2b 0%, #1e2838 100%)",
    textColor: "#f4f6f8",
  },
];

export const STADIA_DEFAULT_STYLE: StadiaMapStyleId = "outdoors";
export const STADIA_SATELLITE_STYLE: StadiaMapStyleId = "alidade_satellite";
export const STADIA_STREET_STYLE: StadiaMapStyleId = "alidade_smooth";

export const STADIA_ATTRIBUTION =
  "© Stadia Maps © Stamen Design © OpenMapTiles © OpenStreetMap";

/** Optional API key — not required on localhost; needed for production hosts. */
export function stadiaApiKey(): string | undefined {
  const key = (import.meta.env.VITE_STADIA_API_KEY as string | undefined)?.trim();
  return key || undefined;
}

/** Known Stadia style ids: outdoors | alidade_smooth | alidade_smooth_dark | osm_bright | alidade_satellite | stamen_watercolor | stamen_terrain | stamen_toner … */
export function stadiaStyleUrl(style: string = STADIA_DEFAULT_STYLE): string {
  const key = stadiaApiKey();
  const base = `https://tiles.stadiamaps.com/styles/${style}.json`;
  return key ? `${base}?api_key=${encodeURIComponent(key)}` : base;
}

/**
 * Raster XYZ URL template for Cesium `UrlTemplateImageryProvider`.
 * @see https://docs.stadiamaps.com/raster/
 */
export function stadiaRasterTileUrl(
  style: string = STADIA_DEFAULT_STYLE,
  opts?: { retina?: boolean },
): string {
  const retina = opts?.retina ? "@2x" : "";
  const ext = style === "alidade_satellite" ? "jpg" : "png";
  const key = stadiaApiKey();
  const base = `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}${retina}.${ext}`;
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
