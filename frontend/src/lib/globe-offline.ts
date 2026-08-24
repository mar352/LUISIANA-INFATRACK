/**
 * Prefetch Luisiana imagery tiles into Cache API so the globe still paints offline.
 * Terrain stays ellipsoid when there is no network (Ion/ArcGIS DEM is not packed).
 */

import { luisianaPaddedBounds } from "./luisiana-bounds";
import { MODEL_CATALOG } from "../types";

export const GLOBE_CACHE = "infatrack-globe-v1";
export const PACK_META_KEY = "infatrack-globe-pack";
export const OFFLINE_MODE_KEY = "infatrack-offline-mode";
export const OFFLINE_MODE_EVENT = "infatrack-offline-mode";

const ESRI =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const UA = "INFA-TRACK-Luisiana/1.0 (municipal GIS; offline pack)";

type PackMeta = {
  at: string;
  tiles: number;
  assets: number;
};

function lngToX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z,
  );
}

function tilesFor(
  west: number,
  south: number,
  east: number,
  north: number,
  z: number,
): Array<{ z: number; x: number; y: number }> {
  const max = 2 ** z - 1;
  const x0 = Math.max(0, lngToX(west, z));
  const x1 = Math.min(max, lngToX(east, z));
  const y0 = Math.max(0, latToY(north, z));
  const y1 = Math.min(max, latToY(south, z));
  const out: Array<{ z: number; x: number; y: number }> = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}

function packBounds() {
  return luisianaPaddedBounds(0.02);
}

/** Street-level pocket around the municipal hall. */
const HALL = { west: 121.498, south: 14.176, east: 121.52, north: 14.194 };

function allTileJobs(): string[] {
  const b = packBounds();
  const urls: string[] = [];
  const add = (z: number, box: { west: number; south: number; east: number; north: number }) => {
    for (const t of tilesFor(box.west, box.south, box.east, box.north, z)) {
      urls.push(ESRI.replace("{z}", String(t.z)).replace("{y}", String(t.y)).replace("{x}", String(t.x)));
      urls.push(OSM.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y)));
    }
  };
  for (let z = 12; z <= 16; z++) add(z, b);
  add(17, b);
  add(18, HALL);
  return [...new Set(urls)];
}

function localAssets(): string[] {
  const models = [...new Set(MODEL_CATALOG.map((m) => `/models/${m.glb}`))];
  return [
    "/logo.png",
    "/bagong-pilipinas.png",
    "/data/luisiana-boundary.geojson",
    "/data/luisiana-barangays.geojson",
    "/data/luisiana-earthquake-labels.csv",
    ...models,
  ];
}

export function globePackEstimate(): { tiles: number; assets: number } {
  return { tiles: allTileJobs().length, assets: localAssets().length };
}

export function readGlobePackMeta(): PackMeta | null {
  try {
    const raw = localStorage.getItem(PACK_META_KEY);
    return raw ? (JSON.parse(raw) as PackMeta) : null;
  } catch {
    return null;
  }
}

async function putOk(cache: Cache, url: string, init?: RequestInit): Promise<boolean> {
  try {
    const existing = await cache.match(url, { ignoreSearch: true });
    if (existing) return true;
    const res = await fetch(url, init);
    if (!res.ok) return false;
    await cache.put(url, res.clone());
    return true;
  } catch {
    return false;
  }
}

export async function downloadGlobePack(
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PackMeta> {
  const tiles = allTileJobs();
  const assets = localAssets().map((p) => `${window.location.origin}${p}`);
  const jobs = [...tiles, ...assets];
  const cache = await caches.open(GLOBE_CACHE);
  let done = 0;
  const total = jobs.length;
  onProgress(0, total);

  const workers = 4;
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const url = jobs[i++];
      const osm = url.includes("openstreetmap.org");
      await putOk(
        cache,
        url,
        osm
          ? { headers: { "User-Agent": UA, Accept: "image/png" } }
          : { mode: "cors" },
      );
      done += 1;
      if (done % 8 === 0 || done === total) onProgress(done, total);
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  const meta: PackMeta = { at: new Date().toISOString(), tiles: tiles.length, assets: assets.length };
  localStorage.setItem(PACK_META_KEY, JSON.stringify(meta));
  return meta;
}

export function isGlobeOfflineMode(): boolean {
  try {
    return localStorage.getItem(OFFLINE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function notifyOfflineMode(on: boolean) {
  navigator.serviceWorker?.controller?.postMessage({ type: "INFATRACK_OFFLINE", on });
  window.dispatchEvent(new CustomEvent(OFFLINE_MODE_EVENT, { detail: { on } }));
}

export function setGlobeOfflineMode(on: boolean) {
  try {
    localStorage.setItem(OFFLINE_MODE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  notifyOfflineMode(on);
}

export async function registerGlobeServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const reg = await navigator.serviceWorker.register("/sw-globe.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "INFATRACK_OFFLINE", on: isGlobeOfflineMode() });
  } catch (err) {
    console.warn("[globe-offline] SW register failed", err);
  }
}
