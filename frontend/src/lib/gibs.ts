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
  const layerInfo = GIBS_LAYERS[layerId];
  
  // Most GIBS layers are available from ~2000 onwards
  const minDate = new Date("2000-01-01");
  
  // Data is typically available up to yesterday (processing lag)
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() - 1);
  
  return date >= minDate && date <= maxDate;
}
