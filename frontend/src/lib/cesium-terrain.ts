/**
 * Cesium terrain providers for the Luisiana globe (Ion optional, ArcGIS fallback).
 * Tuned for weaker GPUs: coarser SSE, no vertex normals / water mask.
 */

import * as Cesium from "cesium";
import { maptilerApiKey, maptilerTerrainUrl } from "./maptiler";

const ARCGIS_ELEVATION_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

/** Mild exaggeration — enough for hills without extra mesh stress. */
export const LUISIANA_TERRAIN_EXAGGERATION = 1.35;

export const LUISIANA_TERRAIN_SSE = 1.25;


/**
 * Cesium terrain provider for the Luisiana globe (MapTiler Quantized-Mesh with ArcGIS Elevation fallback).
 * Tuned for weaker GPUs: coarser SSE, no vertex normals / water mask.
 */
export async function createLuisianaTerrainProvider(): Promise<Cesium.TerrainProvider> {
  const key = maptilerApiKey();
  if (key) {
    try {
      return await Cesium.CesiumTerrainProvider.fromUrl(maptilerTerrainUrl(), {
        requestVertexNormals: false,
        requestWaterMask: false,
      });
    } catch (err) {
      console.warn("[terrain] MapTiler quantized mesh failed, trying ArcGIS elevation:", err);
    }
  }

  try {
    return await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(ARCGIS_ELEVATION_URL);
  } catch (err) {
    console.warn("[terrain] ArcGIS elevation failed:", err);
    throw err;
  }
}

/** Apply / clear globe LOD knobs used while 3D terrain is on. */
export function applyTerrainPerfSettings(
  viewer: Cesium.Viewer,
  enabled: boolean,
  opts?: { screenSpaceError?: number; satelliteOn?: boolean },
) {
  const globe = viewer.scene.globe as Cesium.Globe & {
    maximumScreenSpaceError?: number;
    loadingDescendantLimit?: number;
    preloadSiblings?: boolean;
    preloadAncestors?: boolean;
    tileCacheSize?: number;
    terrainExaggeration?: number;
    terrainExaggerationRelativeHeight?: number;
    dynamicAtmosphereLightingFromSun?: boolean;
  };

  if (viewer.scene.fog) {
    viewer.scene.fog.enabled = false;
  }

  if (enabled) {
    globe.maximumScreenSpaceError = opts?.screenSpaceError ?? LUISIANA_TERRAIN_SSE;
    globe.loadingDescendantLimit = 4;
    globe.preloadSiblings = true;
    globe.preloadAncestors = true;
    if (typeof globe.tileCacheSize === "number") globe.tileCacheSize = 1000;
    globe.terrainExaggeration = LUISIANA_TERRAIN_EXAGGERATION;
    globe.terrainExaggerationRelativeHeight = 0;
    globe.depthTestAgainstTerrain = true;
    // Keep sun-driven atmosphere so night / dawn actually go dark (incl. satellite).
    globe.dynamicAtmosphereLighting = true;
    globe.dynamicAtmosphereLightingFromSun = true;
  } else {
    globe.maximumScreenSpaceError = 1.25;
    globe.loadingDescendantLimit = 4;
    globe.preloadSiblings = true;
    globe.preloadAncestors = true;
    if (typeof globe.tileCacheSize === "number") globe.tileCacheSize = 1000;
    globe.terrainExaggeration = 1;
    globe.terrainExaggerationRelativeHeight = 0;
    globe.depthTestAgainstTerrain = false;
    globe.dynamicAtmosphereLighting = true;
    globe.dynamicAtmosphereLightingFromSun = true;
  }
}

/** Convert DEM height to visual height under globe terrain exaggeration. */
export function exaggerateTerrainHeight(
  heightM: number,
  exaggeration: number,
  relativeHeight = 0,
): number {
  if (!Number.isFinite(heightM)) return relativeHeight;
  if (exaggeration === 1) return heightM;
  return relativeHeight + (heightM - relativeHeight) * exaggeration;
}
