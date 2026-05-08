export type GibsLayerId = "IMERG_Precipitation_Rate" | "IMERG_Precipitation_Rate_30min";

export function formatGibsDate(d: Date) {
  // GIBS time format: YYYY-MM-DD
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function gibsWmtsTileUrl(args: { layer: GibsLayerId; date: string; tileMatrixSet?: string }) {
  const { layer, date } = args;
  const tileMatrixSet = args.tileMatrixSet ?? "GoogleMapsCompatible_Level6";
  return (
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi" +
    `?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
    `&LAYER=${encodeURIComponent(layer)}` +
    `&STYLE=default` +
    `&TILEMATRIXSET=${encodeURIComponent(tileMatrixSet)}` +
    `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}` +
    `&FORMAT=image/png` +
    `&TIME=${encodeURIComponent(date)}`
  );
}

