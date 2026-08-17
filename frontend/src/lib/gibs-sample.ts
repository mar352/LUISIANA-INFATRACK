/**
 * Sample a NASA GIBS WMTS pixel at lon/lat and map RGB → colormap value.
 */

import {
  fetchGibsColormap,
  formatGibsColormapValue,
  gibsMaxTileZoom,
  gibsWmtsTileUrl,
  getGibsLayerInfo,
  isGibsQuantitativeLayer,
  valueFromRgb,
  type GibsLayerId,
} from "./gibs";

const TILE_SIZE = 256;
const TILE_CACHE_MAX = 32;

type TileCacheEntry = { key: string; imageData: ImageData };

const tileCache: TileCacheEntry[] = [];
const tileInflight = new Map<string, Promise<ImageData | null>>();

export type GibsSampleResult = {
  layerId: GibsLayerId;
  layerName: string;
  lat: number;
  lon: number;
  /** Short value string for tooltip (e.g. "12.4 mm/hr" or "Imagery only"). */
  valueText: string;
  quantitative: boolean;
};

function lonLatToTilePixel(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const latClamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (latClamped * Math.PI) / 180;
  const xFloat = ((lon + 180) / 360) * n;
  const yFloat =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  let x = Math.floor(xFloat);
  let y = Math.floor(yFloat);
  x = ((x % n) + n) % n;
  y = Math.max(0, Math.min(n - 1, y));
  const px = Math.max(0, Math.min(TILE_SIZE - 1, Math.floor((xFloat - Math.floor(xFloat)) * TILE_SIZE)));
  const py = Math.max(0, Math.min(TILE_SIZE - 1, Math.floor((yFloat - Math.floor(yFloat)) * TILE_SIZE)));
  return { z, x, y, px, py };
}

function tileUrl(layer: GibsLayerId, date: string, z: number, x: number, y: number): string {
  return gibsWmtsTileUrl({ layer, date })
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

function rememberTile(key: string, imageData: ImageData) {
  const idx = tileCache.findIndex((e) => e.key === key);
  if (idx >= 0) tileCache.splice(idx, 1);
  tileCache.push({ key, imageData });
  while (tileCache.length > TILE_CACHE_MAX) tileCache.shift();
}

async function loadTileImageData(
  layer: GibsLayerId,
  date: string,
  z: number,
  x: number,
  y: number,
): Promise<ImageData | null> {
  const key = `${layer}|${date}|${z}|${x}|${y}`;
  const hit = tileCache.find((e) => e.key === key);
  if (hit) {
    // LRU touch
    rememberTile(key, hit.imageData);
    return hit.imageData;
  }

  let pending = tileInflight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(tileUrl(layer, date, z, x, y));
        if (!res.ok) return null;
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        const imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
        rememberTile(key, imageData);
        return imageData;
      } catch {
        return null;
      } finally {
        tileInflight.delete(key);
      }
    })();
    tileInflight.set(key, pending);
  }
  return pending;
}

/**
 * Sample GIBS at a lon/lat. Returns null if the request fails hard;
 * imagery layers return a non-quantitative message.
 */
export async function sampleGibsAtLonLat(args: {
  layer: GibsLayerId;
  date: string;
  lon: number;
  lat: number;
}): Promise<GibsSampleResult | null> {
  const { layer, date, lon, lat } = args;
  const info = getGibsLayerInfo(layer);

  if (!isGibsQuantitativeLayer(layer)) {
    return {
      layerId: layer,
      layerName: info.name,
      lat,
      lon,
      valueText: "Imagery only",
      quantitative: false,
    };
  }

  const z = gibsMaxTileZoom(layer);
  const { x, y, px, py } = lonLatToTilePixel(lon, lat, z);
  const [imageData, colormap] = await Promise.all([
    loadTileImageData(layer, date, z, x, y),
    fetchGibsColormap(layer),
  ]);

  if (!imageData || !colormap) {
    return {
      layerId: layer,
      layerName: info.name,
      lat,
      lon,
      valueText: "No data",
      quantitative: true,
    };
  }

  const i = (py * TILE_SIZE + px) * 4;
  const r = imageData.data[i] ?? 0;
  const g = imageData.data[i + 1] ?? 0;
  const b = imageData.data[i + 2] ?? 0;
  const a = imageData.data[i + 3] ?? 0;
  const entry = valueFromRgb(colormap, r, g, b, a);

  return {
    layerId: layer,
    layerName: info.name,
    lat,
    lon,
    valueText: formatGibsColormapValue(entry),
    quantitative: true,
  };
}

/** Debounced sampler for hover — cancels stale results via generation token. */
export function createGibsHoverSampler(debounceMs = 200) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let gen = 0;

  return {
    schedule(
      args: { layer: GibsLayerId; date: string; lon: number; lat: number },
      onResult: (result: GibsSampleResult | null) => void,
    ) {
      if (timer) clearTimeout(timer);
      const myGen = ++gen;
      timer = setTimeout(() => {
        void sampleGibsAtLonLat(args).then((result) => {
          if (myGen === gen) onResult(result);
        });
      }, debounceMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      gen += 1;
    },
  };
}
