import bearing from "@turf/bearing";
import distance from "@turf/distance";
import { lineString, point } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import type { Feature, FeatureCollection, LineString, Position } from "geojson";
import type { Map as MapLibreMap, LngLatLike, PointLike } from "maplibre-gl";

/** Magnets within this distance (meters). */
export const SNAP_THRESHOLD_M = 12;

/** Screen-pixel search radius for queryRenderedFeatures. */
export const SNAP_QUERY_RADIUS_PX = 40;

/** Liberty / OpenMapTiles road line layer ids (OpenFreeMap Liberty). */
export const ROAD_LAYER_IDS = [
  "road_motorway",
  "road_motorway_link",
  "road_trunk_primary",
  "road_secondary_tertiary",
  "road_minor",
  "road_link",
  "road_service_track",
  "road_path_pedestrian",
  "tunnel_motorway",
  "tunnel_motorway_link",
  "tunnel_trunk_primary",
  "tunnel_secondary_tertiary",
  "tunnel_minor",
  "tunnel_service_track",
  "tunnel_path_pedestrian",
  "bridge_motorway",
  "bridge_motorway_link",
  "bridge_trunk_primary",
  "bridge_secondary_tertiary",
  "bridge_minor",
  "bridge_link",
  "bridge_service_track",
  "bridge_path_pedestrian",
] as const;

export type SnapResult = {
  lng: number;
  lat: number;
  bearingDeg: number;
  snapped: boolean;
};

function existingRoadLayers(map: MapLibreMap): string[] {
  return ROAD_LAYER_IDS.filter((id) => Boolean(map.getLayer(id)));
}

function toLngLatPair(lngLat: LngLatLike): [number, number] {
  if (Array.isArray(lngLat)) return [lngLat[0], lngLat[1]];
  const any = lngLat as { lng: number; lat: number };
  return [any.lng, any.lat];
}

/** Collect nearby road LineStrings via queryRenderedFeatures. */
export function queryNearbyRoadFeatures(
  map: MapLibreMap,
  lngLat: LngLatLike,
  radiusPx: number = SNAP_QUERY_RADIUS_PX,
): Feature<LineString>[] {
  const layers = existingRoadLayers(map);
  if (layers.length === 0) return [];

  const [lng, lat] = toLngLatPair(lngLat);
  const screen = map.project([lng, lat]);
  const bbox: [PointLike, PointLike] = [
    [screen.x - radiusPx, screen.y - radiusPx],
    [screen.x + radiusPx, screen.y + radiusPx],
  ];

  const rendered = map.queryRenderedFeatures(bbox, { layers });
  const lines: Feature<LineString>[] = [];

  for (const f of rendered) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "LineString" && g.coordinates.length >= 2) {
      lines.push(lineString(g.coordinates as Position[]));
    } else if (g.type === "MultiLineString") {
      for (const coords of g.coordinates) {
        if (coords.length >= 2) lines.push(lineString(coords as Position[]));
      }
    }
  }

  return lines;
}

function segmentBearingDeg(coords: Position[], index: number): number {
  const i = Math.max(0, Math.min(index, coords.length - 2));
  const a = coords[i];
  const b = coords[i + 1];
  // Turf bearing: degrees clockwise from north — matches MapLibre heading / Project.rotation
  const bDeg = bearing(point(a), point(b));
  return ((bDeg % 360) + 360) % 360;
}

/**
 * Snap lng/lat to the nearest rendered road centerline within SNAP_THRESHOLD_M.
 * On snap, bearingDeg is the road segment heading (0–360, clockwise from north).
 */
export function snapLngLatToRoad(
  map: MapLibreMap,
  lng: number,
  lat: number,
  thresholdM: number = SNAP_THRESHOLD_M,
): SnapResult {
  const lines = queryNearbyRoadFeatures(map, [lng, lat]);
  if (lines.length === 0) {
    return { lng, lat, bearingDeg: 0, snapped: false };
  }

  const fc: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: lines,
  };

  // nearestPointOnLine accepts FeatureCollection of lines
  const pt = point([lng, lat]);
  let best: ReturnType<typeof nearestPointOnLine> | null = null;
  let bestLine: Feature<LineString> | null = null;
  let bestDist = Infinity;

  for (const line of fc.features) {
    const snapped = nearestPointOnLine(line, pt, { units: "meters" });
    const d = distance(pt, snapped, { units: "meters" });
    if (d < bestDist) {
      bestDist = d;
      best = snapped;
      bestLine = line;
    }
  }

  if (!best || !bestLine || bestDist > thresholdM) {
    return { lng, lat, bearingDeg: 0, snapped: false };
  }

  const [sLng, sLat] = best.geometry.coordinates;
  const idx = typeof best.properties?.index === "number" ? best.properties.index : 0;
  const bearingDeg = segmentBearingDeg(bestLine.geometry.coordinates, idx);

  return {
    lng: sLng,
    lat: sLat,
    bearingDeg,
    snapped: true,
  };
}
