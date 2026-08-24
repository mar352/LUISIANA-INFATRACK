/**
 * Color-coded barangay areas on the Cesium globe (toggle from map shortcuts).
 */

import * as Cesium from "cesium";

export type BarangayArea = {
  name: string;
  color: string;
  lon: number;
  lat: number;
  ring: number[][];
};

const DATA_URL = "/data/luisiana-barangays.geojson";
const ID_PREFIX = "brgy-area-";
const LABEL_PREFIX = "brgy-label-";

let cache: BarangayArea[] | null = null;
let inflight: Promise<BarangayArea[]> | null = null;

function shortLabel(name: string): string {
  return name
    .replace(/^Barangay\s+/i, "")
    .replace(/\s*\(Poblacion\)\s*/i, "")
    .trim();
}

export async function loadBarangayAreas(): Promise<BarangayArea[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch(DATA_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error(`barangays geojson HTTP ${res.status}`);
    const gj = (await res.json()) as {
      features?: Array<{
        properties?: { name?: string; color?: string; lon?: number; lat?: number };
        geometry?: { type?: string; coordinates?: number[][][] };
      }>;
    };
    const list: BarangayArea[] = [];
    for (const f of gj.features ?? []) {
      const name = String(f.properties?.name ?? "").trim();
      const ring = f.geometry?.type === "Polygon" ? f.geometry.coordinates?.[0] : null;
      if (!name || !ring || ring.length < 4) continue;
      list.push({
        name,
        color: f.properties?.color || "#c9a227",
        lon: Number(f.properties?.lon) || ring[0][0],
        lat: Number(f.properties?.lat) || ring[0][1],
        ring,
      });
    }
    cache = list;
    return list;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function removeBarangayOverlay(viewer: Cesium.Viewer) {
  if (viewer.isDestroyed()) return;
  const doomed: Cesium.Entity[] = [];
  for (const e of viewer.entities.values) {
    const id = typeof e.id === "string" ? e.id : "";
    if (id.startsWith(ID_PREFIX) || id.startsWith(LABEL_PREFIX)) doomed.push(e);
  }
  for (const e of doomed) viewer.entities.remove(e);
}

export function addBarangayOverlay(viewer: Cesium.Viewer, areas: BarangayArea[]) {
  if (viewer.isDestroyed()) return;
  removeBarangayOverlay(viewer);
  for (let i = 0; i < areas.length; i++) {
    const a = areas[i];
    const fill = Cesium.Color.fromCssColorString(a.color).withAlpha(0.38);
    const line = Cesium.Color.fromCssColorString(a.color).withAlpha(0.95);
    const positions = Cesium.Cartesian3.fromDegreesArray(a.ring.flatMap(([lon, lat]) => [lon, lat]));
    viewer.entities.add({
      id: `${ID_PREFIX}${i}`,
      name: a.name,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: fill,
        outline: true,
        outlineColor: line,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        zIndex: 8,
      },
    });
    viewer.entities.add({
      id: `${LABEL_PREFIX}${i}`,
      name: a.name,
      position: Cesium.Cartesian3.fromDegrees(a.lon, a.lat),
      label: {
        text: shortLabel(a.name),
        font: "bold 12px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -6),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(600, 1.05, 28000, 0.15),
      },
    });
  }
  viewer.scene.requestRender();
}

export function highlightBarangay(viewer: Cesium.Viewer, areas: BarangayArea[], name: string | null) {
  if (viewer.isDestroyed()) return;
  for (let i = 0; i < areas.length; i++) {
    const a = areas[i];
    const on = Boolean(name && a.name === name);
    const fill = Cesium.Color.fromCssColorString(a.color).withAlpha(on ? 0.62 : 0.38);
    const line = Cesium.Color.fromCssColorString(a.color).withAlpha(on ? 1 : 0.95);
    const poly = viewer.entities.getById(`${ID_PREFIX}${i}`);
    if (poly?.polygon) {
      poly.polygon.material = new Cesium.ColorMaterialProperty(fill);
      poly.polygon.outlineColor = new Cesium.ConstantProperty(line);
    }
    const lab = viewer.entities.getById(`${LABEL_PREFIX}${i}`);
    if (lab?.label) {
      lab.label.font = new Cesium.ConstantProperty(on ? "bold 15px sans-serif" : "bold 12px sans-serif");
      lab.label.pixelOffset = new Cesium.ConstantProperty(new Cesium.Cartesian2(0, on ? -10 : -6));
    }
  }
  viewer.scene.requestRender();
}

/** Frame the barangay polygon on the globe. */
export function flyToBarangay(viewer: Cesium.Viewer, area: BarangayArea) {
  if (viewer.isDestroyed() || area.ring.length < 3) return;
  const positions = area.ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  const range = Math.max(420, sphere.radius * 2.7);
  viewer.camera.flyToBoundingSphere(sphere, {
    duration: 1.15,
    offset: new Cesium.HeadingPitchRange(
      viewer.camera.heading,
      Cesium.Math.toRadians(-42),
      range,
    ),
  });
}
