export type GibsLayerId = 
  | "IMERG_Precipitation_Rate" 
  | "IMERG_Precipitation_Rate_30min"
  | "MODIS_Terra_Land_Surface_Temp_Day"
  | "MODIS_Terra_Land_Surface_Temp_Night"
  | "MODIS_Terra_Aerosol"
  | "MODIS_Terra_CorrectedReflectance_TrueColor"
  | "VIIRS_NOAA20_CorrectedReflectance_TrueColor"
  | "MODIS_Aqua_Cloud_Top_Temp_Day"
  | "AIRS_L2_Surface_Relative_Humidity_Day"
  | "AIRS_L2_Surface_Air_Temperature_Day";

export interface GibsLayerInfo {
  id: GibsLayerId;
  name: string;
  description: string;
  category: "precipitation" | "temperature" | "imagery" | "atmosphere";
  format: "image/png" | "image/jpeg";
  tileMatrixSet: string;
  temporal: boolean; // requires date
  resolution: string;
}

export const GIBS_LAYERS: Record<GibsLayerId, GibsLayerInfo> = {
  "IMERG_Precipitation_Rate": {
    id: "IMERG_Precipitation_Rate",
    name: "Precipitation Rate (IMERG)",
    description: "Global precipitation measurement - 30min intervals",
    category: "precipitation",
    format: "image/png",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    temporal: true,
    resolution: "10km",
  },
  "IMERG_Precipitation_Rate_30min": {
    id: "IMERG_Precipitation_Rate_30min",
    name: "Precipitation Rate 30min",
    description: "Half-hourly precipitation data",
    category: "precipitation",
    format: "image/png",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    temporal: true,
    resolution: "10km",
  },
  "MODIS_Terra_Land_Surface_Temp_Day": {
    id: "MODIS_Terra_Land_Surface_Temp_Day",
    name: "Land Surface Temperature (Day)",
    description: "Daytime land surface temperature from MODIS Terra",
    category: "temperature",
    format: "image/png",
    tileMatrixSet: "GoogleMapsCompatible_Level7",
    temporal: true,
    resolution: "1km",
  },
  "MODIS_Terra_Land_Surface_Temp_Night": {
    id: "MODIS_Terra_Land_Surface_Temp_Night",
    name: "Land Surface Temperature (Night)",
    description: "Nighttime land surface temperature from MODIS Terra",
    category: "temperature",
    format: "image/png",
    tileMatrixSet: "GoogleMapsCompatible_Level7",
    temporal: true,
    resolution: "1km",
  },
  "MODIS_Terra_Aerosol": {
    id: "MODIS_Terra_Aerosol",
    name: "Aerosol Optical Depth",
    description: "Air quality and aerosol particles",
    category: "atmosphere",
    format: "image/png",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    temporal: true,
    resolution: "10km",
  },
  "MODIS_Terra_CorrectedReflectance_TrueColor": {
    id: "MODIS_Terra_CorrectedReflectance_TrueColor",
    name: "True Color Imagery (MODIS Terra)",
    description: "Natural color satellite imagery",
    category: "imagery",
    format: "image/jpeg",
    tileMatrixSet: "GoogleMapsCompatible_Level9",
    temporal: true,
    resolution: "250m",
  },
  "VIIRS_NOAA20_CorrectedReflectance_TrueColor": {
    id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    name: "True Color Imagery (VIIRS)",
    description: "High-resolution natural color from VIIRS",
    category: "imagery",
    format: "image/jpeg",
    tileMatrixSet: "GoogleMapsCompatible_Level9",
    temporal: true,
    resolution: "750m",
  },
  "MODIS_Aqua_Cloud_Top_Temp_Day": {
    id: "MODIS_Aqua_Cloud_Top_Temp_Day",
    name: "Cloud Top Temperature",
    description: "Temperature at cloud tops - storm intensity",
    category: "atmosphere",
    format: "image/png",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    temporal: true,
    resolution: "5km",
  },
  "AIRS_L2_Surface_Relative_Humidity_Day": {
    id: "AIRS_L2_Surface_Relative_Humidity_Day",
    name: "Surface Humidity",
    description: "Relative humidity at surface level",
    category: "atmosphere",
    format: "image/png",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    temporal: true,
    resolution: "50km",
  },
  "AIRS_L2_Surface_Air_Temperature_Day": {
    id: "AIRS_L2_Surface_Air_Temperature_Day",
    name: "Surface Air Temperature",
    description: "Air temperature at surface level",
    category: "temperature",
    format: "image/png",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    temporal: true,
    resolution: "50km",
  },
};

export function formatGibsDate(d: Date) {
  // GIBS time format: YYYY-MM-DD
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatGibsDateTime(d: Date) {
  // GIBS datetime format: YYYY-MM-DDTHH:MM:SSZ
  const dateStr = formatGibsDate(d);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${dateStr}T${h}:${min}:${s}Z`;
}

export function gibsWmtsTileUrl(args: { 
  layer: GibsLayerId; 
  date: string; 
  tileMatrixSet?: string;
  format?: string;
}) {
  const { layer, date } = args;
  const layerInfo = GIBS_LAYERS[layer];
  const tileMatrixSet = args.tileMatrixSet ?? layerInfo.tileMatrixSet;
  const format = args.format ?? layerInfo.format;
  
  return (
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi" +
    `?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
    `&LAYER=${encodeURIComponent(layer)}` +
    `&STYLE=default` +
    `&TILEMATRIXSET=${encodeURIComponent(tileMatrixSet)}` +
    `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}` +
    `&FORMAT=${encodeURIComponent(format)}` +
    `&TIME=${encodeURIComponent(date)}`
  );
}

/**
 * Get available GIBS layers by category
 */
export function getGibsLayersByCategory(category: GibsLayerInfo["category"]): GibsLayerInfo[] {
  return Object.values(GIBS_LAYERS).filter(layer => layer.category === category);
}

/**
 * Get GIBS layer info
 */
export function getGibsLayerInfo(layerId: GibsLayerId): GibsLayerInfo {
  return GIBS_LAYERS[layerId];
}

/**
 * Check if GIBS layer is available for a given date
 * Some layers have limited temporal coverage
 */
export function isGibsLayerAvailable(layerId: GibsLayerId, date: Date): boolean {
  // Most GIBS layers are available from ~2000 onwards
  const minDate = new Date("2000-01-01");

  // Data is typically available up to yesterday (processing lag)
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() - 1);

  return date >= minDate && date <= maxDate;
}

/** True-color JPEG layers — no quantitative colormap. */
export function isGibsQuantitativeLayer(layerId: GibsLayerId): boolean {
  return GIBS_LAYERS[layerId].category !== "imagery";
}

/**
 * Official GIBS v1.3 colormap XML filenames (from WMTS layer Metadata).
 * Layer id ≠ colormap filename for several products (e.g. IMERG → GPM_*).
 */
const GIBS_COLORMAP_FILE: Partial<Record<GibsLayerId, string>> = {
  IMERG_Precipitation_Rate: "GPM_Precipitation_Rate.xml",
  IMERG_Precipitation_Rate_30min: "GPM_Precipitation_Rate.xml",
  MODIS_Terra_Land_Surface_Temp_Day: "MODIS_Land_Surface_Temp.xml",
  MODIS_Terra_Land_Surface_Temp_Night: "MODIS_Land_Surface_Temp.xml",
  MODIS_Terra_Aerosol: "MODIS_VIIRS_AOD.xml",
  MODIS_Aqua_Cloud_Top_Temp_Day: "MODIS_Cloud_Top_Temp.xml",
  AIRS_L2_Surface_Relative_Humidity_Day: "AIRS_RelativeHumidity.xml",
  AIRS_L2_Surface_Air_Temperature_Day: "AIRS_Temperature.xml",
};

export function gibsColormapUrl(layerId: GibsLayerId): string | null {
  const file = GIBS_COLORMAP_FILE[layerId];
  if (!file) return null;
  return `https://gibs.earthdata.nasa.gov/colormaps/v1.3/${file}`;
}

export type GibsColormapEntry = {
  r: number;
  g: number;
  b: number;
  transparent: boolean;
  nodata: boolean;
  /** Midpoint of value range when numeric; otherwise null. */
  value: number | null;
  /** Human label from legend tooltip or formatted range. */
  label: string;
  units: string;
};

export type GibsColormap = {
  layerId: GibsLayerId;
  units: string;
  entries: GibsColormapEntry[];
};

const colormapCache = new Map<GibsLayerId, Promise<GibsColormap | null>>();

function parseRgb(attr: string | null): { r: number; g: number; b: number } | null {
  if (!attr) return null;
  const parts = attr.split(",").map((s) => Number(s.trim()));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return { r: parts[0]!, g: parts[1]!, b: parts[2]! };
}

/** Parse GIBS value attr like `[0.1,0.1059)` or `[-INF,0.1)` or a scalar. */
function parseValueAttr(raw: string | null): { mid: number | null; label: string } {
  if (!raw) return { mid: null, label: "" };
  const range = raw.match(/^\[([^,]+),\s*([^\)]+)\)/);
  if (range) {
    const a = range[1]!.trim();
    const b = range[2]!.trim();
    const lo = a === "-INF" || a === "-Infinity" ? null : Number(a);
    const hi = b === "INF" || b === "Infinity" ? null : Number(b);
    if (lo != null && hi != null && Number.isFinite(lo) && Number.isFinite(hi)) {
      return { mid: (lo + hi) / 2, label: `${lo}–${hi}` };
    }
    if (lo == null && hi != null && Number.isFinite(hi)) {
      return { mid: hi, label: `< ${hi}` };
    }
    if (hi == null && lo != null && Number.isFinite(lo)) {
      return { mid: lo, label: `≥ ${lo}` };
    }
    return { mid: null, label: raw };
  }
  const n = Number(raw);
  if (Number.isFinite(n)) return { mid: n, label: String(n) };
  return { mid: null, label: raw };
}

function formatHoverValue(entry: GibsColormapEntry): string {
  if (entry.nodata || entry.transparent) return "No data";
  if (entry.value != null && Number.isFinite(entry.value)) {
    const abs = Math.abs(entry.value);
    const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
    const num = entry.value.toFixed(digits);
    return entry.units ? `${num} ${entry.units}` : num;
  }
  if (entry.label) {
    return entry.units ? `${entry.label} ${entry.units}` : entry.label;
  }
  return "No data";
}

export function formatGibsColormapValue(entry: GibsColormapEntry | null): string {
  if (!entry) return "No data";
  return formatHoverValue(entry);
}

export async function fetchGibsColormap(layerId: GibsLayerId): Promise<GibsColormap | null> {
  if (!isGibsQuantitativeLayer(layerId)) return null;
  const url = gibsColormapUrl(layerId);
  if (!url) return null;

  let pending = colormapCache.get(layerId);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, "text/xml");
        const legendTips = new Map<string, string>();
        for (const leg of Array.from(doc.querySelectorAll("LegendEntry"))) {
          const id = leg.getAttribute("id");
          const tip = leg.getAttribute("tooltip") ?? leg.getAttribute("label") ?? "";
          if (id) legendTips.set(id, tip);
        }

        const entries: GibsColormapEntry[] = [];
        for (const cmap of Array.from(doc.querySelectorAll("ColorMap"))) {
          const units = cmap.getAttribute("units") ?? "";
          for (const el of Array.from(cmap.querySelectorAll("ColorMapEntry"))) {
            const rgb = parseRgb(el.getAttribute("rgb"));
            if (!rgb) continue;
            const transparent = el.getAttribute("transparent") === "true";
            const nodata = el.getAttribute("nodata") === "true";
            const ref = el.getAttribute("ref") ?? "";
            const parsed = parseValueAttr(el.getAttribute("value") ?? el.getAttribute("sourceValue"));
            const tip = legendTips.get(ref) ?? "";
            entries.push({
              ...rgb,
              transparent,
              nodata,
              value: parsed.mid,
              label: tip || parsed.label || "",
              units,
            });
          }
        }
        if (entries.length === 0) return null;
        const units =
          entries.find((e) => e.units && !e.transparent && !e.nodata)?.units ??
          entries[0]?.units ??
          "";
        return { layerId, units, entries };
      } catch {
        return null;
      }
    })();
    colormapCache.set(layerId, pending);
  }
  return pending;
}

/** Nearest RGB match among opaque colormap entries (GIBS palettes are exact). */
export function valueFromRgb(
  colormap: GibsColormap,
  r: number,
  g: number,
  b: number,
  a = 255,
): GibsColormapEntry | null {
  if (a < 8) {
    return (
      colormap.entries.find((e) => e.nodata || e.transparent) ?? {
        r: 0,
        g: 0,
        b: 0,
        transparent: true,
        nodata: true,
        value: null,
        label: "No data",
        units: colormap.units,
      }
    );
  }

  let best: GibsColormapEntry | null = null;
  let bestDist = Infinity;
  for (const e of colormap.entries) {
    if (e.transparent && !e.nodata) continue;
    const dr = e.r - r;
    const dg = e.g - g;
    const db = e.b - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
      if (dist === 0) break;
    }
  }
  // Reject very far matches (tile may be empty / wrong product).
  if (best && bestDist > 40 * 40 * 3) return null;
  return best;
}

/** Max WMTS zoom from GoogleMapsCompatible_LevelN. */
export function gibsMaxTileZoom(layerId: GibsLayerId): number {
  const m = GIBS_LAYERS[layerId].tileMatrixSet.match(/Level(\d+)/);
  return m ? Number(m[1]) : 6;
}

