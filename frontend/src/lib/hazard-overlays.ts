/**
 * Official geohazard map ground overlays (from PHIVOLCS KMZ image tiles).
 * Uses highest-LOD tiles from each KMZ (not the blurry L1 overview).
 */

export type HazardTileRect = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type HazardTile = {
  url: string;
  rectangle: HazardTileRect;
};

export type HazardLegendItem = {
  color: string;
  /** Optional hatch for deposition / runout zones. */
  pattern?: "solid" | "hatch";
  label: string;
  hint?: string;
};

export type HazardOverlayMeta = {
  id: string;
  title: string;
  /** Fallback single overview if tiles fail to load. */
  url: string;
  rectangle: HazardTileRect;
  attribution: string;
  /** Manifest of high-res leaf tiles extracted from the KMZ. */
  tilesManifestUrl: string;
  /** Color key from the official map sheet (UI legend — no need to read KMZ chrome). */
  legend: HazardLegendItem[];
  legendTitle: string;
};

/** Earthquake-induced landslide susceptibility (READY / PHIVOLCS sheet). */
const EIL_LEGEND: HazardLegendItem[] = [
  { color: "#c62828", label: "High susceptibility", hint: "Steep / unstable slopes" },
  { color: "#7b1fa2", label: "Moderate susceptibility" },
  { color: "#f9a825", label: "Low susceptibility" },
  { color: "#f5f5f5", label: "Not susceptible" },
  {
    color: "#607d8b",
    pattern: "hatch",
    label: "Possible deposition / runout",
    hint: "Landslide material may accumulate here",
  },
];

/** Ground shaking by PEIS (PHIVOLCS Earthquake Intensity Scale). */
const GSH_LEGEND: HazardLegendItem[] = [
  { color: "#c62828", label: "PEIS VIII and above", hint: "Very destructive shaking" },
  { color: "#ec407a", label: "PEIS VII", hint: "Destructive" },
  { color: "#7b1fa2", label: "PEIS VI", hint: "Very strong" },
  { color: "#f9a825", label: "PEIS V and below", hint: "Strong or weaker" },
];

export const HAZARD_OVERLAYS: HazardOverlayMeta[] = [
  {
    id: "eil-2010",
    title: "EIL 2010 (landslide)",
    url: "/hazards/eil-2010/overview.png",
    tilesManifestUrl: "/hazards/eil-2010/tiles/tiles.json",
    rectangle: {
      west: 121.39760892475421,
      south: 14.039262354773943,
      east: 121.70534623150124,
      north: 14.318219410060735,
    },
    attribution: "PHIVOLCS EIL map (KMZ high-res tiles)",
    legendTitle: "Earthquake-induced landslide",
    legend: EIL_LEGEND,
  },
  {
    id: "eil-2014",
    title: "EIL / Earthquake 50K 2014",
    url: "/hazards/eil-2014/overview.png",
    tilesManifestUrl: "/hazards/eil-2014/tiles/tiles.json",
    rectangle: {
      west: 121.43154468716837,
      south: 14.071619029901823,
      east: 121.68805595624853,
      north: 14.30481109270206,
    },
    attribution: "PHIVOLCS earthquake hazard map (KMZ high-res tiles)",
    legendTitle: "Earthquake-induced landslide (2014)",
    legend: EIL_LEGEND,
  },
  {
    id: "gsh-2014",
    title: "Ground Shaking 2014",
    url: "/hazards/gsh-2014/overview.png",
    tilesManifestUrl: "/hazards/gsh-2014/tiles/tiles.json",
    rectangle: {
      west: 121.42930055610675,
      south: 14.068322540209429,
      east: 121.68874168293704,
      north: 14.304178110055073,
    },
    attribution: "PHIVOLCS ground shaking map (KMZ high-res tiles)",
    legendTitle: "Ground shaking (PEIS)",
    legend: GSH_LEGEND,
  },
];

export type HazardOverlayId = (typeof HAZARD_OVERLAYS)[number]["id"];

export function getHazardOverlay(id: HazardOverlayId): HazardOverlayMeta | undefined {
  return HAZARD_OVERLAYS.find((h) => h.id === id);
}

/** Active overlay from Risk toggles (only one on at a time). */
export function activeHazardFromToggles(t: {
  hazardEil2010?: boolean;
  hazardEq2014?: boolean;
  hazardGsh2014?: boolean;
}): HazardOverlayMeta | null {
  if (t.hazardEil2010) return getHazardOverlay("eil-2010") ?? null;
  if (t.hazardEq2014) return getHazardOverlay("eil-2014") ?? null;
  if (t.hazardGsh2014) return getHazardOverlay("gsh-2014") ?? null;
  return null;
}

export type HazardTilesManifest = {
  id: string;
  maxOrder: number;
  tileCount: number;
  rectangle: HazardTileRect;
  tiles: HazardTile[];
};

const tilesCache = new Map<string, HazardTilesManifest>();

export async function loadHazardTilesManifest(
  meta: HazardOverlayMeta,
): Promise<HazardTilesManifest | null> {
  const cached = tilesCache.get(meta.id);
  if (cached) return cached;
  try {
    const res = await fetch(meta.tilesManifestUrl, { cache: "force-cache" });
    if (!res.ok) return null;
    const json = (await res.json()) as HazardTilesManifest;
    if (!json?.tiles?.length) return null;
    tilesCache.set(meta.id, json);
    return json;
  } catch (err) {
    console.warn(`Failed to load hazard tiles for ${meta.id}:`, err);
    return null;
  }
}
