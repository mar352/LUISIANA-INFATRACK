/**
 * Cesium terrain providers for the Luisiana globe (Ion optional, ArcGIS fallback).
 * Tuned for weaker GPUs: coarser SSE, no vertex normals / water mask.
 */

import * as Cesium from "cesium";

const ARCGIS_ELEVATION_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

/** Mild exaggeration — enough for hills without extra mesh stress. */
export const LUISIANA_TERRAIN_EXAGGERATION = 1.35;

/**
 * Higher = fewer terrain tiles / smoother camera (default Cesium is 2).
 * 5–6 reads fine for LGU overview; still tilts into hills.
 */
export const LUISIANA_TERRAIN_SSE = 7.5;

/**
 * Prefer Cesium World Terrain when an Ion token is set; otherwise ArcGIS World Elevation.
 * Skip vertex normals + water mask — big win on bandwidth and GPU.
 */
export async function createLuisianaTerrainProvider(): Promise<Cesium.TerrainProvider> {
  const ionToken = (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined)?.trim();
  if (ionToken) {
    Cesium.Ion.defaultAccessToken = ionToken;
    try {
      return await Cesium.createWorldTerrainAsync({
        requestVertexNormals: false,
        requestWaterMask: false,
      });
    } catch (err) {
      console.warn("[terrain] Ion world terrain failed, trying ArcGIS:", err);
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
  opts?: { screenSpaceError?: number },
) {
  const globe = viewer.scene.globe as Cesium.Globe & {
    maximumScreenSpaceError?: number;
    loadingDescendantLimit?: number;
    preloadSiblings?: boolean;
    terrainExaggeration?: number;
    terrainExaggerationRelativeHeight?: number;
  };

  if (enabled) {
    globe.maximumScreenSpaceError = opts?.screenSpaceError ?? LUISIANA_TERRAIN_SSE;
    // Don't prefetch as aggressively while the camera moves.
    globe.loadingDescendantLimit = 4;
    globe.preloadSiblings = false;
    globe.terrainExaggeration = LUISIANA_TERRAIN_EXAGGERATION;
    globe.terrainExaggerationRelativeHeight = 0;
    globe.depthTestAgainstTerrain = true;
    // Keep atmosphere day/night in sync with the scene light / sun.
    globe.dynamicAtmosphereLighting = true;
  } else {
    globe.maximumScreenSpaceError = 2;
    globe.loadingDescendantLimit = 20;
    globe.preloadSiblings = true;
    globe.terrainExaggeration = 1;
    globe.terrainExaggerationRelativeHeight = 0;
    globe.depthTestAgainstTerrain = false;
    globe.dynamicAtmosphereLighting = true;
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
