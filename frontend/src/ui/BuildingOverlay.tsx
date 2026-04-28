/**
 * BuildingOverlay — proper 3D building models using deck.gl layers.
 *
 * Uses only already-installed @deck.gl/layers — no new packages needed.
 *
 * Building types:
 *  - Private Building   → multi-floor office/residential tower with windows
 *  - Municipal Project  → road segment with lane markings + guardrails
 *  - Agricultural       → wide barn with pitched roof
 *
 * Sizes are in real-world meters. At zoom 11 (Luisiana view ~15km wide),
 * buildings are 80–120m wide to be clearly visible.
 */

import { useEffect, useRef } from "react";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PolygonLayer, ColumnLayer, PathLayer } from "@deck.gl/layers";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Project } from "../types";

type Props = {
  map: MapLibreMap | null;
  projects: Project[];
  visible: boolean;
};

// ─── Geometry helpers ────────────────────────────────────────────────────────

function offsetMeters(lon: number, lat: number, dx: number, dy: number): [number, number] {
  const dLat = dy / 111320;
  const dLon = dx / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lon + dLon, lat + dLat];
}

function rectPolygon(lon: number, lat: number, w: number, d: number): [number, number][] {
  return [
    offsetMeters(lon, lat, -w / 2, -d / 2),
    offsetMeters(lon, lat,  w / 2, -d / 2),
    offsetMeters(lon, lat,  w / 2,  d / 2),
    offsetMeters(lon, lat, -w / 2,  d / 2),
  ];
}

// ─── Office / Residential Building ───────────────────────────────────────────

function buildOfficeLayers(p: Project, floors: number): any[] {
  const { lon, lat } = p.location;

  // Large enough to see at zoom 11 (~80×60m footprint)
  const w = 80, d = 60;
  const floorH = 12;   // 12m per floor — exaggerated for visibility
  const totalH = floors * floorH;

  const bodyColor: [number, number, number, number] =
    p.status === "Completed" ? [60, 120, 200, 230] :
    p.status === "Ongoing"   ? [80, 155, 240, 220] :
                               [120, 145, 175, 200];

  const layers: any[] = [];

  // Main building body
  layers.push(new PolygonLayer({
    id: `bld-body-${p.id}`,
    data: [{ polygon: rectPolygon(lon, lat, w, d), height: totalH }],
    getPolygon: (d: any) => d.polygon,
    getElevation: (d: any) => d.height,
    getFillColor: bodyColor,
    getLineColor: [20, 40, 80, 220],
    lineWidthMinPixels: 1.5,
    extruded: true,
    pickable: false,
  }));

  // Window strips — 4 columns across the front face
  const winCols = 4;
  for (let c = 0; c < winCols; c++) {
    const wx = -w / 2 + 10 + c * (w / winCols);
    const winPos = offsetMeters(lon, lat, wx, d / 2 + 0.5);
    layers.push(new ColumnLayer({
      id: `bld-win-${p.id}-${c}`,
      data: [{ position: winPos, height: totalH * 0.88 }],
      getPosition: (d: any) => d.position,
      getElevation: (d: any) => d.height,
      getFillColor: p.status === "Completed"
        ? [160, 210, 255, 210] : [200, 230, 255, 160],
      getLineColor: [50, 90, 150, 180],
      diskResolution: 4,
      radius: 5,
      extruded: true,
      pickable: false,
    }));
  }

  // Roof slab
  layers.push(new PolygonLayer({
    id: `bld-roof-${p.id}`,
    data: [{ polygon: rectPolygon(lon, lat, w + 4, d + 4), height: totalH + 5 }],
    getPolygon: (d: any) => d.polygon,
    getElevation: (d: any) => d.height,
    getFillColor: [40, 55, 75, 250],
    extruded: true,
    pickable: false,
  }));

  // Rooftop water tank
  const tankPos = offsetMeters(lon, lat, w / 2 - 10, d / 2 - 10);
  layers.push(new ColumnLayer({
    id: `bld-tank-${p.id}`,
    data: [{ position: tankPos }],
    getPosition: (d: any) => d.position,
    getElevation: 15,
    getFillColor: [90, 110, 130, 230],
    diskResolution: 16,
    radius: 7,
    extruded: true,
    elevationScale: 1,
    pickable: false,
  }));

  // Yellow scaffolding outline if ongoing
  if (p.status === "Ongoing") {
    const pad = 5;
    const scaffoldPath = [
      offsetMeters(lon, lat, -w / 2 - pad, -d / 2 - pad),
      offsetMeters(lon, lat,  w / 2 + pad, -d / 2 - pad),
      offsetMeters(lon, lat,  w / 2 + pad,  d / 2 + pad),
      offsetMeters(lon, lat, -w / 2 - pad,  d / 2 + pad),
      offsetMeters(lon, lat, -w / 2 - pad, -d / 2 - pad),
    ];
    layers.push(new PathLayer({
      id: `bld-scaffold-${p.id}`,
      data: [{ path: scaffoldPath }],
      getPath: (d: any) => d.path,
      getColor: [255, 190, 30, 230],
      getWidth: 3,
      widthUnits: "meters",
      pickable: false,
    }));
  }

  return layers;
}

// ─── Agricultural / Barn ─────────────────────────────────────────────────────

function buildAgriculturalLayers(p: Project): any[] {
  const { lon, lat } = p.location;
  const w = 100, d = 70, wallH = 30;
  const ridgeH = wallH + 25;

  const wallColor: [number, number, number, number] =
    p.status === "Completed" ? [175, 145, 85, 230] :
    p.status === "Ongoing"   ? [190, 160, 100, 220] :
                               [155, 135, 105, 200];

  const layers: any[] = [];

  // Barn walls
  layers.push(new PolygonLayer({
    id: `agri-walls-${p.id}`,
    data: [{ polygon: rectPolygon(lon, lat, w, d), height: wallH }],
    getPolygon: (d: any) => d.polygon,
    getElevation: (d: any) => d.height,
    getFillColor: wallColor,
    getLineColor: [80, 55, 25, 210],
    lineWidthMinPixels: 1.5,
    extruded: true,
    pickable: false,
  }));

  // Left roof face (flat polygon at ridge height)
  layers.push(new PolygonLayer({
    id: `agri-roof-l-${p.id}`,
    data: [{
      polygon: [
        offsetMeters(lon, lat, -w / 2 - 2, -d / 2 - 2),
        offsetMeters(lon, lat,  0,          -d / 2 - 2),
        offsetMeters(lon, lat,  0,           d / 2 + 2),
        offsetMeters(lon, lat, -w / 2 - 2,  d / 2 + 2),
      ],
    }],
    getPolygon: (d: any) => d.polygon,
    getElevation: ridgeH,
    getFillColor: [145, 50, 50, 245],
    extruded: false,
    pickable: false,
  }));

  // Right roof face
  layers.push(new PolygonLayer({
    id: `agri-roof-r-${p.id}`,
    data: [{
      polygon: [
        offsetMeters(lon, lat,  0,          -d / 2 - 2),
        offsetMeters(lon, lat,  w / 2 + 2,  -d / 2 - 2),
        offsetMeters(lon, lat,  w / 2 + 2,   d / 2 + 2),
        offsetMeters(lon, lat,  0,            d / 2 + 2),
      ],
    }],
    getPolygon: (d: any) => d.polygon,
    getElevation: ridgeH,
    getFillColor: [120, 40, 40, 245],
    extruded: false,
    pickable: false,
  }));

  // Ridge beam
  layers.push(new PathLayer({
    id: `agri-ridge-${p.id}`,
    data: [{
      path: [
        offsetMeters(lon, lat, 0, -d / 2 - 2),
        offsetMeters(lon, lat, 0,  d / 2 + 2),
      ],
    }],
    getPath: (d: any) => d.path,
    getColor: [70, 25, 15, 255],
    getWidth: 2,
    widthUnits: "meters",
    pickable: false,
  }));

  // Large barn door
  layers.push(new PolygonLayer({
    id: `agri-door-${p.id}`,
    data: [{ polygon: rectPolygon(lon, lat, 20, 3).map(([lo, la]) =>
      offsetMeters(lo, la, 0, d / 2 + 1)
    ), height: 18 }],
    getPolygon: (d: any) => d.polygon,
    getElevation: (d: any) => d.height,
    getFillColor: [95, 60, 25, 245],
    extruded: true,
    pickable: false,
  }));

  return layers;
}

// ─── Road / Municipal Project ─────────────────────────────────────────────────

function buildRoadLayers(p: Project): any[] {
  const { lon, lat } = p.location;
  const len = 160, roadW = 20;  // 160m long road segment, 20m wide (2 lanes)

  const roadColor: [number, number, number, number] =
    p.status === "Completed" ? [75, 80, 95, 235] :
    p.status === "Ongoing"   ? [90, 100, 120, 225] :
                               [125, 135, 150, 205];

  const layers: any[] = [];

  // Road surface
  layers.push(new PolygonLayer({
    id: `road-surface-${p.id}`,
    data: [{ polygon: rectPolygon(lon, lat, len, roadW), height: 1.5 }],
    getPolygon: (d: any) => d.polygon,
    getElevation: (d: any) => d.height,
    getFillColor: roadColor,
    getLineColor: [50, 55, 70, 200],
    lineWidthMinPixels: 1,
    extruded: true,
    pickable: false,
  }));

  // Center lane dashes
  const markCount = 7;
  for (let i = 0; i < markCount; i++) {
    const mx = -len / 2 + 12 + i * (len / markCount);
    layers.push(new PolygonLayer({
      id: `road-mark-${p.id}-${i}`,
      data: [{ polygon: rectPolygon(lon, lat, 10, 1.2).map(([lo, la]) =>
        offsetMeters(lo, la, mx, 0)
      ), height: 2 }],
      getPolygon: (d: any) => d.polygon,
      getElevation: (d: any) => d.height,
      getFillColor: [255, 255, 180, 230],
      extruded: true,
      pickable: false,
    }));
  }

  // Guardrails both sides
  for (const side of [-1, 1]) {
    layers.push(new PathLayer({
      id: `road-rail-${p.id}-${side}`,
      data: [{
        path: [
          offsetMeters(lon, lat, -len / 2, side * (roadW / 2 + 1.5)),
          offsetMeters(lon, lat,  len / 2, side * (roadW / 2 + 1.5)),
        ],
      }],
      getPath: (d: any) => d.path,
      getColor: [165, 180, 200, 230],
      getWidth: 1.2,
      widthUnits: "meters",
      pickable: false,
    }));

    // Posts every ~25m
    for (let i = 0; i < 7; i++) {
      const px = -len / 2 + 12 + i * (len / 7);
      layers.push(new ColumnLayer({
        id: `road-post-${p.id}-${side}-${i}`,
        data: [{ position: offsetMeters(lon, lat, px, side * (roadW / 2 + 1.5)) }],
        getPosition: (d: any) => d.position,
        getElevation: 5,
        getFillColor: [150, 165, 190, 230],
        diskResolution: 4,
        radius: 1,
        extruded: true,
        pickable: false,
      }));
    }
  }

  // Construction crane if ongoing
  if (p.status === "Ongoing" && p.progress < 80) {
    const cranePos = offsetMeters(lon, lat, len / 2 - 10, 0);
    layers.push(new ColumnLayer({
      id: `road-crane-mast-${p.id}`,
      data: [{ position: cranePos }],
      getPosition: (d: any) => d.position,
      getElevation: 55,
      getFillColor: [255, 200, 0, 245],
      diskResolution: 4,
      radius: 1.5,
      extruded: true,
      pickable: false,
    }));
    layers.push(new PathLayer({
      id: `road-crane-arm-${p.id}`,
      data: [{
        path: [
          offsetMeters(lon, lat, len / 2 - 10, 0),
          offsetMeters(lon, lat, len / 2 - 45, 0),
        ],
      }],
      getPath: (d: any) => d.path,
      getColor: [255, 200, 0, 245],
      getWidth: 2,
      widthUnits: "meters",
      pickable: false,
    }));
  }

  return layers;
}

// ─── Router ──────────────────────────────────────────────────────────────────

function layersForProject(p: Project): any[] {
  if (!p?.location?.lon || !p?.location?.lat) return [];

  const floors =
    p.status === "Completed" ? 6 :
    p.status === "Ongoing"   ? Math.max(2, Math.round((p.progress / 100) * 6)) :
    2;

  switch (p.type) {
    case "Agricultural Structure": return buildAgriculturalLayers(p);
    case "Municipal Project":      return buildRoadLayers(p);
    default:                       return buildOfficeLayers(p, floors);
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BuildingOverlay({ map, projects, visible }: Props) {
  const overlayRef = useRef<MapboxOverlay | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!overlayRef.current) {
      overlayRef.current = new MapboxOverlay({ layers: [] });
      map.addControl(overlayRef.current as any);
    }

    const layers = visible
      ? projects.flatMap((p) => layersForProject(p))
      : [];

    overlayRef.current.setProps({ layers });
  }, [map, projects, visible]);

  useEffect(() => {
    return () => {
      if (map && overlayRef.current) {
        try { map.removeControl(overlayRef.current as any); } catch {}
        overlayRef.current = null;
      }
    };
  }, [map]);

  return null;
}
