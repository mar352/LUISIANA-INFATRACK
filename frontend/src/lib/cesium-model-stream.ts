/**
 * Streaming budget for Cesium project GLBs.
 *
 * Luisiana is small enough that a fixed 4 km load radius pulls every digital
 * twin onto the GPU at once. These knobs scale with camera height and
 * `navigator.deviceMemory` so pan/orbit stay smooth as the project list grows.
 */

import { sceneIsLagging, sceneIsStalling } from "./cesium-frame-budget";

function deviceMemoryGb(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const gb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof gb === "number" && Number.isFinite(gb) ? gb : undefined;
}

/** How many decoded GLBs may sit on the GPU at once (selected always counts). */
export function gpuModelBudget(): number {
  const gb = deviceMemoryGb();
  if (gb != null && gb <= 4) return 10;
  if (gb != null && gb <= 8) return 16;
  return 22;
}

/**
 * Ground distance (meters) at which a pin may promote to a full GLB.
 * 0 = pins / clusters only (camera is too high to read a digital twin).
 */
export function modelLoadRadiusM(cameraHeightM: number): number {
  if (!Number.isFinite(cameraHeightM) || cameraHeightM > 14_000) return 0;
  if (cameraHeightM > 8_000) return 1_600;
  if (cameraHeightM > 3_500) return 2_500;
  if (cameraHeightM > 1_200) return 2_200;
  return 1_800;
}

/** Hysteresis so a model does not pop off the moment the camera eases back. */
export function modelUnloadRadiusM(loadRadiusM: number): number {
  if (loadRadiusM <= 0) return 0;
  return Math.round(loadRadiusM * 1.55);
}

/** How many GLB attaches to start at once. Cached hits can be more parallel. */
export function modelLoadConcurrency(cachedHit: boolean): number {
  if (sceneIsStalling()) return 1;
  if (sceneIsLagging()) return cachedHit ? 2 : 1;
  const gb = deviceMemoryGb();
  if (gb != null && gb <= 4) return cachedHit ? 2 : 2;
  return cachedHit ? 4 : 3;
}

export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
