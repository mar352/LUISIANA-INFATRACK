export type MapShapeKind =
  | "freeform"
  | "box"
  | "cylinder"
  | "gable"
  | "hip"
  | "pyramid"
  | "road_straight"
  | "road_cross"
  | "road_t"
  | "road_curve"
  | "road_deadend"
  | "road_4lane"
  | "tree_broadleaf"
  | "tree_conifer"
  | "tree_bush";

export type MapShape = {
  kind: MapShapeKind;
  color?: string;
  /** Box / roof footprint in meters. */
  width?: number;
  depth?: number;
  height?: number;
  /** Cylinder / cone radius in meters. */
  radius?: number;
  /** Freeform ground ring. */
  footprint?: { lon: number; lat: number }[];
};

export type ShapeGroup = "Roads (Low Poly)" | "Volumes" | "Roofs" | "Trees";

export type ShapeCatalogItem = {
  kind: MapShapeKind;
  group: ShapeGroup;
  label: string;
  hint: string;
  /** Pin = one click. Area = draw polygon then Finish. */
  tool: "pin" | "area";
  locked?: boolean;
};

export const SHAPE_CATALOG: ShapeCatalogItem[] = [
  // Low Poly Roads
  { kind: "road_straight", group: "Roads (Low Poly)", label: "Straight Road", hint: "Click to place a straight 2-lane road tile with sidewalks.", tool: "pin" },
  { kind: "road_cross", group: "Roads (Low Poly)", label: "4-Way Crossroad", hint: "Click to place a 4-way intersection road tile.", tool: "pin" },
  { kind: "road_t", group: "Roads (Low Poly)", label: "T-Junction", hint: "Click to place a 3-way T-junction road tile.", tool: "pin" },
  { kind: "road_curve", group: "Roads (Low Poly)", label: "Road Turn 90°", hint: "Click to place a 90-degree corner road tile.", tool: "pin" },
  { kind: "road_deadend", group: "Roads (Low Poly)", label: "Cul-de-sac", hint: "Click to place a dead-end road tile.", tool: "pin" },
  { kind: "road_4lane", group: "Roads (Low Poly)", label: "4-Lane Avenue", hint: "Click to place a wide 4-lane avenue tile.", tool: "pin" },

  // Volumes & Roofs
  { kind: "freeform", group: "Volumes", label: "Freeform", hint: "Draw a polygon, then Finish to extrude a volume.", tool: "area" },
  { kind: "box", group: "Volumes", label: "Box", hint: "Click the globe to place a box.", tool: "pin" },
  { kind: "cylinder", group: "Volumes", label: "Cylinder", hint: "Click the globe to place a cylinder.", tool: "pin" },
  { kind: "gable", group: "Roofs", label: "Gable roof", hint: "Click the globe to place a gable roof.", tool: "pin" },
  { kind: "hip", group: "Roofs", label: "Hip roof", hint: "Click the globe to place a hip roof.", tool: "pin" },
  { kind: "pyramid", group: "Roofs", label: "Pyramid roof", hint: "Click the globe to place a pyramid roof.", tool: "pin" },
  { kind: "tree_broadleaf", group: "Trees", label: "Broadleaf", hint: "Click the globe to plant a broadleaf tree.", tool: "pin" },
  { kind: "tree_conifer", group: "Trees", label: "Conifer", hint: "Click the globe to plant a conifer.", tool: "pin" },
  { kind: "tree_bush", group: "Trees", label: "Bush", hint: "Click the globe to plant a bush.", tool: "pin" },
];

export const SHAPE_DEFAULTS: Record<MapShapeKind, Omit<MapShape, "kind" | "footprint">> = {
  road_straight: { color: "#383b43", width: 12, depth: 12, height: 0.25, radius: 6 },
  road_cross: { color: "#383b43", width: 12, depth: 12, height: 0.25, radius: 6 },
  road_t: { color: "#383b43", width: 12, depth: 12, height: 0.25, radius: 6 },
  road_curve: { color: "#383b43", width: 12, depth: 12, height: 0.25, radius: 6 },
  road_deadend: { color: "#383b43", width: 12, depth: 12, height: 0.25, radius: 6 },
  road_4lane: { color: "#383b43", width: 18, depth: 12, height: 0.25, radius: 9 },
  freeform: { color: "#cfd3d8", width: 8, depth: 8, height: 8, radius: 4 },
  box: { color: "#cfd3d8", width: 8, depth: 8, height: 8, radius: 4 },
  cylinder: { color: "#cfd3d8", width: 8, depth: 8, height: 10, radius: 4 },
  gable: { color: "#d4d8df", width: 10, depth: 8, height: 5, radius: 4 },
  hip: { color: "#d4d8df", width: 10, depth: 10, height: 5, radius: 5 },
  pyramid: { color: "#d4d8df", width: 10, depth: 10, height: 6, radius: 5 },
  tree_broadleaf: { color: "#5a8f4a", width: 6, depth: 6, height: 8, radius: 3 },
  tree_conifer: { color: "#3f6b38", width: 4, depth: 4, height: 12, radius: 2 },
  tree_bush: { color: "#6a9a4e", width: 3, depth: 3, height: 3, radius: 1.6 },
};

export function isRoadShape(kind: MapShapeKind | undefined | null): boolean {
  return Boolean(kind && kind.startsWith("road_"));
}

export function isTreeShape(kind: MapShapeKind | undefined | null): boolean {
  return Boolean(kind && kind.startsWith("tree_"));
}

export function isPrimitiveShape(kind: MapShapeKind | undefined | null): boolean {
  return Boolean(kind) && !isTreeShape(kind);
}

export function shapeLabel(kind: MapShapeKind | undefined | null): string {
  return SHAPE_CATALOG.find((s) => s.kind === kind)?.label ?? "Shape";
}

export function makeMapShape(kind: MapShapeKind, footprint?: { lon: number; lat: number }[]): MapShape {
  return {
    kind,
    ...SHAPE_DEFAULTS[kind],
    ...(footprint && footprint.length >= 3 ? { footprint } : {}),
  };
}

export function sketchCentroid(coords: { lon: number; lat: number }[]): { lng: number; lat: number } {
  if (coords.length === 0) return { lng: 121.51, lat: 14.185 };
  let lon = 0;
  let lat = 0;
  for (const c of coords) {
    lon += c.lon;
    lat += c.lat;
  }
  return { lng: lon / coords.length, lat: lat / coords.length };
}