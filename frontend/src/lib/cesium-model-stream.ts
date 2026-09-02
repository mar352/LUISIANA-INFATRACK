/**
 * Streaming budget for Cesium project GLBs.
 *
 * Covers the entire municipality so all digital twins in Luisiana
 * load and stay ready in the scene without needing to fly close first.
 */

import { sceneIsLagging, sceneIsStalling } from "./cesium-frame-budget";

function deviceMemoryGb(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const gb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof gb === "number" && Number.isFinite(gb) ? gb : undefined;
}

/**
 * Unlimited model count — all 3D models across Luisiana are loaded.
 */
export function gpuModelBudget(): number {
  return Number.POSITIVE_INFINITY;
}

/**
 * Background preload radius (meters) — covers all barangays across Luisiana (25km).
 */
export function modelPreloadRadiusM(_cameraHeightM?: number): number {
  return 25_000;
}

/**
 * Visual rendering radius (meters) — covers the entire town (25km).
 * Distant models render lightweight Low-Poly LOD; closer models render High Detail.
 */
export function modelVisibleRadiusM(_cameraHeightM?: number): number {
  return 25_000;
}

/** Hysteresis unload radius. */
export function modelUnloadRadiusM(loadRadiusM: number): number {
  if (loadRadiusM <= 0) return 30_000;
  return Math.round(loadRadiusM * 1.35);
}

/** Parallel GLB streaming concurrency. */
export function modelLoadConcurrency(cachedHit: boolean): number {
  return cachedHit ? 4 : 2;
}

export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
