/**
 * Shared Three.js GPU disposal + map streaming/LOD helpers.
 * Keeps custom-layer memory in check when layers are toggled or leave the viewport.
 *
 * Covers:
 * - Explicit dispose of geometries / materials / textures (GPU buffer GC)
 * - Viewport + distance LOD gates for digital twins
 * - Camera pose keys for skipping idle instance-buffer uploads
 */

import type { Map as MapLibreMap } from "maplibre-gl";
import * as THREE from "three";

/** Dispose geometry, materials, and textures under a root (does not remove from parent). */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry?.dispose();

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      const anyMat = mat as THREE.Material & Record<string, unknown>;
      for (const key of Object.keys(anyMat)) {
        const val = anyMat[key];
        if (val && typeof val === "object" && (val as THREE.Texture).isTexture) {
          (val as THREE.Texture).dispose();
        }
      }
      mat.dispose();
    }
  });
}

export function disposeGltfCache(cache: Map<string, THREE.Object3D>): void {
  for (const root of cache.values()) disposeObject3D(root);
  cache.clear();
}

export function disposeInstancedMesh(mesh: THREE.InstancedMesh): void {
  mesh.geometry?.dispose();
  const mat = mesh.material;
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat?.dispose();
}

/** True if lng/lat is inside the map view expanded by `padFrac` of the span. */
export function isInPaddedViewport(
  map: MapLibreMap,
  lng: number,
  lat: number,
  padFrac = 0.4,
): boolean {
  const b = map.getBounds();
  const west = b.getWest();
  const east = b.getEast();
  const south = b.getSouth();
  const north = b.getNorth();
  const lngPad = Math.abs(east - west) * padFrac;
  const latPad = Math.abs(north - south) * padFrac;
  return (
    lng >= west - lngPad &&
    lng <= east + lngPad &&
    lat >= south - latPad &&
    lat <= north + latPad
  );
}

/**
 * Max ground distance (meters) to keep drawing a digital twin at this zoom.
 * Farther assets are culled — Shadowmap-style distance LOD.
 */
export function maxAssetDistanceMeters(zoom: number): number {
  if (zoom >= 17) return 4000;
  if (zoom >= 16) return 2800;
  if (zoom >= 15) return 1800;
  if (zoom >= 14) return 1200;
  if (zoom >= 13) return 800;
  return 450;
}

/** Approximate haversine distance in meters (good enough for LOD gates). */
export function distanceMeters(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Min zoom to draw full project GLBs (labels/extrusions handle farther scales). */
export const BUILDING_GLB_MIN_ZOOM = 13;

/**
 * Camera pose key — when unchanged, skip rewriting relative-to-eye instance matrices.
 * Coarse enough to absorb sub-pixel jitter, fine enough to update while navigating.
 */
export function cameraPoseKey(map: MapLibreMap): string {
  const c = map.getCenter();
  return [
    c.lng.toFixed(5),
    c.lat.toFixed(5),
    map.getZoom().toFixed(2),
    map.getBearing().toFixed(1),
    map.getPitch().toFixed(1),
  ].join("|");
}
