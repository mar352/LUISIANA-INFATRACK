import type { FilterSpecification, Map as MapLibreMap } from "maplibre-gl";
import { detectOpenMapTilesSourceId } from "./stadia";

export const EDIT_STREETS_GLOW_ID = "edit-streets-glow";
export const EDIT_STREETS_CORE_ID = "edit-streets-core";

const ROAD_CLASS_FILTER: FilterSpecification = [
  "in",
  ["get", "class"],
  ["literal", [
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "minor",
    "service",
    "path",
    "track",
    "living_street",
  ]],
];

const GLOW_COLOR = "#00f3ff";
const CORE_COLOR = "#66fff0";

type PulseState = {
  raf: number | null;
  start: number;
};

const pulseByMap = new WeakMap<MapLibreMap, PulseState>();

function hasOpenMapTiles(map: MapLibreMap): boolean {
  const id = detectOpenMapTilesSourceId(map);
  return Boolean(map.getSource(id));
}

/** Add glow + core line layers once (hidden by default). */
export function ensureEditStreetLayers(map: MapLibreMap): void {
  if (!hasOpenMapTiles(map)) return;

  const source = detectOpenMapTilesSourceId(map);

  if (!map.getLayer(EDIT_STREETS_GLOW_ID)) {
    map.addLayer({
      id: EDIT_STREETS_GLOW_ID,
      type: "line",
      source,
      "source-layer": "transportation",
      filter: ROAD_CLASS_FILTER,
      layout: {
        visibility: "none",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": GLOW_COLOR,
        "line-width": 8,
        "line-blur": 10,
        "line-opacity": 0.55,
      },
    });
  }

  if (!map.getLayer(EDIT_STREETS_CORE_ID)) {
    map.addLayer({
      id: EDIT_STREETS_CORE_ID,
      type: "line",
      source,
      "source-layer": "transportation",
      filter: ROAD_CLASS_FILTER,
      layout: {
        visibility: "none",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": CORE_COLOR,
        "line-width": 2.2,
        "line-blur": 0.4,
        "line-opacity": 0.95,
      },
    });
  }
}

export function setEditStreetVisible(map: MapLibreMap, visible: boolean): void {
  ensureEditStreetLayers(map);
  const v = visible ? "visible" : "none";
  if (map.getLayer(EDIT_STREETS_GLOW_ID)) {
    map.setLayoutProperty(EDIT_STREETS_GLOW_ID, "visibility", v);
  }
  if (map.getLayer(EDIT_STREETS_CORE_ID)) {
    map.setLayoutProperty(EDIT_STREETS_CORE_ID, "visibility", v);
  }
}

export function startEditStreetPulse(map: MapLibreMap): void {
  stopEditStreetPulse(map);
  if (!map.getLayer(EDIT_STREETS_GLOW_ID)) return;

  const state: PulseState = { raf: null, start: performance.now() };
  pulseByMap.set(map, state);

  const tick = (now: number) => {
    if (!map.getLayer(EDIT_STREETS_GLOW_ID)) {
      state.raf = null;
      return;
    }
    const t = (now - state.start) / 1000;
    // ~0.7 Hz soft pulse
    const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.4);
    const blur = 6 + wave * 8;
    const width = 6 + wave * 5;
    const opacity = 0.35 + wave * 0.4;
    map.setPaintProperty(EDIT_STREETS_GLOW_ID, "line-blur", blur);
    map.setPaintProperty(EDIT_STREETS_GLOW_ID, "line-width", width);
    map.setPaintProperty(EDIT_STREETS_GLOW_ID, "line-opacity", opacity);
    if (map.getLayer(EDIT_STREETS_CORE_ID)) {
      map.setPaintProperty(EDIT_STREETS_CORE_ID, "line-opacity", 0.75 + wave * 0.25);
    }
    state.raf = requestAnimationFrame(tick);
  };

  state.raf = requestAnimationFrame(tick);
}

export function stopEditStreetPulse(map: MapLibreMap): void {
  const state = pulseByMap.get(map);
  if (state?.raf != null) {
    cancelAnimationFrame(state.raf);
    state.raf = null;
  }
  pulseByMap.delete(map);
}

export function teardownEditStreetOverlay(map: MapLibreMap): void {
  stopEditStreetPulse(map);
  if (map.getLayer(EDIT_STREETS_CORE_ID)) map.removeLayer(EDIT_STREETS_CORE_ID);
  if (map.getLayer(EDIT_STREETS_GLOW_ID)) map.removeLayer(EDIT_STREETS_GLOW_ID);
}
