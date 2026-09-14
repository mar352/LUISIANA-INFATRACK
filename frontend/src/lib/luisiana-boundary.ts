/**
 * Draws and manages the Luisiana municipality boundary outline on a Cesium globe.
 *
 * The boundary is rendered as a ground-clamped polyline so it follows terrain
 * at all camera heights and zoom levels.  A very subtle filled polygon is also
 * added below the line so the area reads clearly from high altitude without
 * obscuring the basemap at street level.
 */

import * as Cesium from "cesium";

const BOUNDARY_POLYLINE_ID = "luisiana-boundary-line";
const BOUNDARY_POLYGON_ID = "luisiana-boundary-fill";

/** Outline style — matches the dark polygon border in the reference screenshot. */
const BORDER_COLOR = Cesium.Color.fromCssColorString("#1a1a2e").withAlpha(0.92);
const BORDER_WIDTH = 2.5;

/** Very light tint inside the boundary — faint so the basemap shines through. */
const FILL_COLOR = Cesium.Color.fromCssColorString("#4a9e6b").withAlpha(0.07);

type BoundaryHandles = {
  lineEntity: Cesium.Entity;
  fillEntity: Cesium.Entity;
  remove: () => void;
};

/**
 * Fetches /data/luisiana-boundary.geojson and adds the municipality border to
 * the Cesium viewer.  Returns handles so the caller can remove it later.
 *
 * Safe to call multiple times — existing entities are removed before re-adding.
 */
export async function addLuisianaBoundary(
  viewer: Cesium.Viewer,
): Promise<BoundaryHandles | null> {
  if (viewer.isDestroyed()) return null;

  // Clean up any pre-existing boundary entities so we never get duplicates.
  removeLuisianaBoundary(viewer);

  let geojson: GeoJSON.FeatureCollection;
  try {
    const res = await fetch("/data/luisiana-boundary.geojson");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    geojson = (await res.json()) as GeoJSON.FeatureCollection;
  } catch (err) {
    console.warn("[luisiana-boundary] Could not load boundary GeoJSON:", err);
    return null;
  }

  if (viewer.isDestroyed()) return null;

  // Extract the exterior ring from the first Polygon feature.
  const feature = geojson.features.find(
    (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
  );
  if (!feature) {
    console.warn("[luisiana-boundary] No polygon feature found in GeoJSON");
    return null;
  }

  let ring: number[][];
  if (feature.geometry.type === "Polygon") {
    ring = (feature.geometry as GeoJSON.Polygon).coordinates[0];
  } else {
    // MultiPolygon — take the exterior ring of the largest polygon
    const polys = (feature.geometry as GeoJSON.MultiPolygon).coordinates;
    ring = polys.reduce((best, poly) =>
      poly[0].length > best.length ? poly[0] : best,
      polys[0][0],
    );
  }

  // Convert [lng, lat] pairs → flat Cartesian3 array for Cesium.
  const positions = Cesium.Cartesian3.fromDegreesArray(
    ring.flatMap(([lng, lat]) => [lng, lat]),
  );

  // ── Outline (ground polyline — follows terrain) ──────────────────────────
  const lineEntity = viewer.entities.add({
    id: BOUNDARY_POLYLINE_ID,
    polyline: {
      positions,
      width: BORDER_WIDTH,
      material: new Cesium.PolylineOutlineMaterialProperty({
        color: BORDER_COLOR,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.35),
        outlineWidth: 1,
      }),
      clampToGround: true,
      // Always draw on top of other overlays so the border reads clearly.
      zIndex: 10,
    },
  });

  // ── Fill (subtle tint inside the boundary) ───────────────────────────────
  const hierarchy = new Cesium.PolygonHierarchy(positions);
  const fillEntity = viewer.entities.add({
    id: BOUNDARY_POLYGON_ID,
    polygon: {
      hierarchy,
      material: FILL_COLOR,
      // Ground-clamped + height defined so it drapes over DEM without warnings or z-fighting.
      height: 0,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      classificationType: Cesium.ClassificationType.TERRAIN,
      outline: false,
      // Render below the polyline.
      zIndex: 9,
    },
  });

  viewer.scene.requestRender();

  const remove = () => removeLuisianaBoundary(viewer);
  return { lineEntity, fillEntity, remove };
}

/**
 * Removes boundary entities from the viewer if they exist.
 */
export function removeLuisianaBoundary(viewer: Cesium.Viewer): void {
  if (viewer.isDestroyed()) return;
  const line = viewer.entities.getById(BOUNDARY_POLYLINE_ID);
  const fill = viewer.entities.getById(BOUNDARY_POLYGON_ID);
  if (line) viewer.entities.remove(line);
  if (fill) viewer.entities.remove(fill);
}
