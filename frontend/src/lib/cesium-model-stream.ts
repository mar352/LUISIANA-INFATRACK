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
 * Adaptive model budget — bounds VRAM usage so the main thread and GPU stay responsive.
 */
export function gpuModelBudget(): number {
  if (sceneIsStalling()) return 10;
  if (sceneIsLagging()) return 16;
  const mem = deviceMemoryGb();
  if (mem != null && mem <= 4) return 14;
  if (mem != null && mem <= 8) return 22;
  return 28;
}

/**
 * Background preload radius (meters) — scaled intelligently with camera altitude.
 */
export function modelPreloadRadiusM(cameraHeightM?: number): number {
  const h = cameraHeightM ?? 1000;
  if (h > 4000) return 6000;
  if (h > 1500) return 4000;
  if (h > 600) return 2500;
  return 1800;
}

/**
 * Visual rendering radius (meters) — models within this radius are attached.
 * Distant projects beyond this radius are represented cleanly by 2D map pins/badges.
 */
export function modelVisibleRadiusM(cameraHeightM?: number): number {
  const h = cameraHeightM ?? 1000;
  if (h > 4000) return 7000;
  if (h > 1500) return 5000;
  if (h > 600) return 3200;
  return 2200;
}

/** Hysteresis unload radius. */
export function modelUnloadRadiusM(loadRadiusM: number): number {
  if (loadRadiusM <= 0) return 4000;
  return Math.round(loadRadiusM * 1.3);
}

/** Parallel GLB streaming concurrency. */
export function modelLoadConcurrency(cachedHit: boolean): number {
  if (sceneIsStalling()) return 1;
  if (sceneIsLagging()) return 1;
  return cachedHit ? 3 : 2;
}

export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
