/**
 * CesiumMap — primary globe with sun lighting, shadows, click-to-place,
 * and MapLibre-parity edit: select / left-drag move / right-drag rotate / scroll scale.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { MapSketch, MapSketchKind, PlacementTool, Project, ProjectPhoto, ProjectStatus } from "../types";
import { BARANGAY_LIST, MAP_SKETCH_COLORS, MODEL_CATALOG, PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from "../types";
import { dateFromDisplaySolarHour, getSunPosition, LUISIANA_CENTER, sunEnuFromAltitudeBearing } from "../lib/solar";
import { patchProject } from "../lib/api";
import { updateProjectInFirestore } from "../services/firestore-projects";
import { writeAudit } from "../services/firestore-audit";
import { gibsWmtsTileUrl, GIBS_LAYERS, type GibsLayerId } from "../lib/gibs";
import { createGibsHoverSampler, type GibsSampleResult } from "../lib/gibs-sample";
import { getCachedGlbUrl } from "../lib/glb-cache";
import { fetchLuisianaBuildings, type BuildingFootprint } from "../lib/osm-buildings";
import {
  applyTerrainPerfSettings,
  createLuisianaTerrainProvider,
  exaggerateTerrainHeight,
  LUISIANA_TERRAIN_EXAGGERATION,
} from "../lib/cesium-terrain";
import {
  applyProceduralAtmosphere,
  initProceduralSky,
} from "../lib/cesium-atmosphere";
import {
  DEFAULT_MAP_SETTINGS,
  shadowQualityToShadowMap,
  terrainQualityToSse,
  type MapSettings,
  type ShadowQuality,
} from "../lib/map-settings";
import {
  OSM_RASTER_ATTRIBUTION,
  OSM_RASTER_TILE_URL,
} from "../lib/stadia";
import { getSatelliteSource } from "../lib/terrain";
import { PlaceSidePanel } from "./PlaceSidePanel";
import { classAdvice, classColor } from "../lib/earthquake-labels";
import {
  earthquakeProneModel,
  type EarthquakeDualSummary,
  type EarthquakeGridCell,
  type EarthquakeSiteScore,
} from "../lib/ml-earthquake";
import { registerTerrainSatSampler, type TerrainSatSample } from "../lib/terrain-sat-features";
import {
  formatTropicalInfo,
  getTropicalColor,
  getTropicalIcon,
  getTropicalStageMeta,
  type TropicalSystem,
} from "../lib/tropical-systems";
import { HAZARD_OVERLAYS, loadHazardTilesManifest } from "../lib/hazard-overlays";
import { addLuisianaBoundary } from "../lib/luisiana-boundary";

/**
 * When pitched into local 3D and still near the ground, tighten fog / pan speed.
 * Never clip the globe to a rectangle — that makes a floating “square map” on blue sky.
 */
const MUNICIPAL_3D_PITCH_RAD = Cesium.Math.toRadians(-75);
const MUNICIPAL_3D_MAX_HEIGHT_M = 45_000;
/** Default Cesium-scale far plane when viewing the full globe. */
const GLOBE_FAR_M = 10_000_000_000;
/**
 * Local 3D still needs a long far plane so SkyAtmosphere / sun are not clipped.
 * Draw distance is enforced with fog + tile SSE, not by chopping the frustum.
 */
const LOCAL_3D_FAR_M = 2_000_000;
const LOCAL_3D_FOG_SSE_FACTOR = 4.0;
const FOG_MIN_BRIGHTNESS_DAY = 0.25;
/** Cap extruded OSM blocks so weak GPUs don't melt. */
const MAX_OSM_BUILDING_BLOCKS = 4500;
const OSM_BUILDING_BATCH = 350;
/** Lift blocks slightly above DEM / ellipsoid (meters). */
const OSM_BLOCK_BASE_M = 0.35;
/** Light gray-white blocks (reference style) — basemap is OSM street. */
const OSM_BLOCK_COLOR = "#E8E6E1";
const OSM_BLDG_ID_PREFIX = "osm-bldg-";
const REMOVED_BLOCKS_STORAGE_KEY = "infatrack-luisiana-removed-blocks-v1";

/**
 * Procedural SkyAtmosphere driven by TIME / sun altitude.
 * Scene DirectionalLight shades terrain & models only (SUNLIGHT atmosphere mode).
 */
function applyCesiumAtmosphere(
  viewer: Cesium.Viewer,
  opts?: {
    isDay?: boolean;
    satelliteHd?: boolean;
    solarHour?: number;
    sunAltitudeRad?: number;
    satelliteLayer?: Cesium.ImageryLayer | null;
  },
) {
  applyProceduralAtmosphere(viewer, {
    isDay: opts?.isDay,
    solarHour: opts?.solarHour,
    sunAltitudeRad: opts?.sunAltitudeRad,
    satelliteLayer: opts?.satelliteLayer,
  });
}

function osmBuildingInstanceId(id: string | number | undefined, fallback: number): string {
  return `${OSM_BLDG_ID_PREFIX}${id ?? `i${fallback}`}`;
}

function loadRemovedBlockIds(): Set<string> {
  try {
    const raw = localStorage.getItem(REMOVED_BLOCKS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveRemovedBlockIds(ids: Set<string>) {
  try {
    localStorage.setItem(REMOVED_BLOCKS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* quota / private mode */
  }
}

function pickOsmBuildingId(viewer: Cesium.Viewer, screenPos: Cesium.Cartesian2): string | null {
  const picked = viewer.scene.pick(screenPos);
  if (!Cesium.defined(picked)) return null;
  if (typeof picked === "string" && picked.startsWith(OSM_BLDG_ID_PREFIX)) return picked;
  const id = (picked as { id?: unknown }).id;
  if (typeof id === "string" && id.startsWith(OSM_BLDG_ID_PREFIX)) return id;
  return null;
}

function ringSpanOk(ring: number[][]): boolean {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of ring) {
    if (p[0] < west) west = p[0];
    if (p[0] > east) east = p[0];
    if (p[1] < south) south = p[1];
    if (p[1] > north) north = p[1];
  }
  // Skip broken/huge rings that paint over the whole town.
  return east - west < 0.012 && north - south < 0.012 && east > west && north > south;
}

/** Load full GLB only when camera is this close (meters). */
const MODEL_LOAD_DIST_M = 4000;
/** Drop GPU model (keep pin) when camera is farther than this. */
const MODEL_UNLOAD_DIST_M = 7000;
/** How many GLBs to decode at once — keep low so the PC doesn't melt. */
const MODEL_LOAD_CONCURRENCY = 1;
/** Throttle map entity hover picks (ms). */
const HOVER_PICK_THROTTLE_MS = 60;
/** Only update hover tooltip screen position if cursor moved this many px. */
const HOVER_POS_DELTA_PX = 8;

const MUNICIPAL_OFFICE = { lat: 14.185435, lon: 121.509513 };
/** Look-at for Home — poblacion / municipal hall, not the camera stand point. */
const HOME_TARGET = MUNICIPAL_OFFICE;
const HOME_HEADING = 0;
/**
 * Street-level 3D (screenshot): horizon near the top, blocks filling the frame.
 * Cesium 0° = horizon, -90° = nadir.
 */
const HOME_PITCH = Cesium.Math.toRadians(-20);
/** Distance from municipal hall — close enough that buildings read large. */
const HOME_RANGE_M = 560;
const HOME_TARGET_HEIGHT_M = 18;

function homeLookAtTarget(): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(HOME_TARGET.lon, HOME_TARGET.lat, HOME_TARGET_HEIGHT_M);
}

function homeHeadingPitchRange(): Cesium.HeadingPitchRange {
  return new Cesium.HeadingPitchRange(HOME_HEADING, HOME_PITCH, HOME_RANGE_M);
}

/** Instant home pose. lookAt is unlocked so the user can pan freely afterwards. */
function setCameraHomeView(camera: Cesium.Camera) {
  camera.lookAt(homeLookAtTarget(), homeHeadingPitchRange());
  camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
}

/** Animate so Luisiana (municipal office) is centered in the view. */
function flyCameraHome(viewer: Cesium.Viewer, duration = 1.2) {
  viewer.camera.cancelFlight();
  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(homeLookAtTarget(), 80), {
    duration,
    offset: homeHeadingPitchRange(),
  });
}

/** Never let the camera go under the ground (dark “underside / hell” view). */
const MIN_CAMERA_HEIGHT_M = 35;
/** Extra clearance above sampled DEM when collision tiles aren’t ready yet. */
const MIN_TERRAIN_CLEARANCE_M = 40;
/**
 * Only run globe/terrain collision when the camera is this close to the ground.
 * A high value (Cesium default ~15 km) keeps collision on while tilting at
 * municipal height, which flips the view when the look-ray hits the globe.
 */
const COLLISION_TERRAIN_HEIGHT_M = 90;
/** Almost nadir — still a hair off -90 so the controller does not lock. */
const MIN_CAMERA_PITCH = Cesium.Math.toRadians(-89.2);
/**
 * Max tilt = the screenshot street view (horizon just in frame).
 * A little more open than HOME_PITCH so you can settle on that shot.
 */
const MAX_CAMERA_PITCH = Cesium.Math.toRadians(-10);

export type CesiumMapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  flyHome: () => void;
  toggleTilt: () => void;
  /** Freeze / unfreeze globe mouse look while overlay UI is dragged. */
  setCameraInputsEnabled: (enabled: boolean) => void;
  /** Restore all user-removed OSM blocks. */
  restoreRemovedBlocks: () => void;
  /** Fly camera to lon/lat (used by Events list). */
  flyToLonLat: (lon: number, lat: number, heightM?: number) => void;
  /** Select a project model and fly the camera to it. */
  flyToProject: (projectId: string) => void;
  /** Finish current line/area sketch (placement mode). */
  finishSketch: () => boolean;
  /** Remove last sketch vertex. */
  undoSketchVertex: () => void;
  /** Clear in-progress sketch. */
  clearSketch: () => void;
  /** How many vertices in the current draft sketch. */
  getSketchVertexCount: () => number;
};

type PlaceClick = { lng: number; lat: number };

type LocalXform = {
  lon: number;
  lat: number;
  /** Meters above ground. 0 = clamp to terrain (no elevation). */
  heightM: number;
  rotationDeg: number;
  scaleMultiplier: number;
  modelLocked: boolean;
  dirty: boolean;
  /** Keep local pose until projects prop matches after save. */
  pendingSync: boolean;
};

type Props = {
  solarHour: number;
  /**
   * Compass bearing of the sun (0° = N, 90° = E). Overrides SunCalc azimuth;
   * altitude still comes from solarHour.
   */
  sunAzimuthDeg?: number;
  projects: Project[];
  /** When true, nearby pins collapse into count bubbles until you zoom in. */
  clusteringEnabled?: boolean;
  visible?: boolean;
  placementMode?: boolean;
  /** Select an existing model and move / rotate / scale it. */
  editMode?: boolean;
  onPlaceClick?: (pos: PlaceClick) => void;
  /** Active placement draw tool (pin / line / area / erase). */
  placementTool?: PlacementTool;
  /** Stroke / pin color while placing. */
  placementColor?: string;
  /** Fired when a sketch is completed (pin click, or finish line/area). */
  onPlaceSketch?: (sketch: MapSketch) => void;
  readOnly?: boolean;
  /** Engineer only — unlock / move / rotate / scale / remove map models. */
  canManipulateModels?: boolean;
  /** Engineer: convert an MPDC site pin into the Under Construction GLB. */
  canPromoteSitePin?: boolean;
  /** Keep App project list in sync after a local patch. */
  onProjectPatch?: (projectId: string, patch: Partial<Project>) => void;
  canAddPhotos?: boolean;
  /** Sync photo list into App projects after place-panel upload/delete. */
  onPhotosChange?: (projectId: string, photos: ProjectPhoto[]) => void;
  onDeleteBuilding?: (projectId: string) => void;
  /** NASA GIBS WMTS overlay (precip / climate layers). */
  gibs?: {
    enabled: boolean;
    layer: GibsLayerId;
    date: string;
    opacity: number;
  };
  /** Layers toggle — hide/show Luisiana 3D blocks. */
  buildingBlocksVisible?: boolean;
  /** Click a block to remove it (engineer tool). */
  blockRemoverActive?: boolean;
  /** Layers → 3D Terrain: elevation mesh on the globe. */
  terrainEnabled?: boolean;
  /** Layers → Satellite: Esri imagery over basemap. */
  satellite?: boolean;
  /** Risk tab — official PHIVOLCS KMZ ground overlays. */
  hazardOverlays?: {
    eil2010?: boolean;
    eq2014?: boolean;
    gsh2014?: boolean;
  };
  /** Events tab — West Pacific Invest / TC / LPA-watch. */
  tropicalEnabled?: boolean;
  tropicalSystems?: TropicalSystem[];
  /** Risk tab — trained PHIVOLCS siting grid. */
  earthquakeEnabled?: boolean;
  earthquakeGrid?: EarthquakeGridCell[];
  /** Layers → Map Settings (draw distance, quality, shadows, fog). */
  mapSettings?: MapSettings;
};

function gibsMaximumLevel(layer: GibsLayerId): number {
  const m = GIBS_LAYERS[layer]?.tileMatrixSet.match(/Level(\d+)/);
  return m ? Number(m[1]) : 6;
}

function projectModelUrl(p: Project): string {
  if (p.modelType === "custom" && p.customModelUrl) {
    const u = p.customModelUrl;
    if (u.startsWith("http")) return u;
    if (u.startsWith("/")) return u;
    return `/models/${u}`;
  }
  const cat = MODEL_CATALOG.find((m) => m.type === (p.modelType ?? "office"));
  const glb = cat?.glb ?? "building.glb";
  return glb.startsWith("/") ? glb : `/models/${glb}`;
}

function absoluteAssetUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:")) {
    return path;
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function modelScaleValue(p: Project, scaleMultiplier: number): number {
  const cat = MODEL_CATALOG.find((m) => m.type === (p.modelType ?? "office"));
  // Catalog `scale` is a relative base; engineers may need tiny multipliers for
  // large authored GLBs (no hard floor of 1 — that blocked shrinking).
  const targetH = (cat?.scale ?? 60) * scaleMultiplier;
  return Math.max(0.0001, targetH / 10);
}

/** Scroll-scale range for engineer-authored GLBs of wildly different unit sizes. */
const SCALE_MULT_MIN = 0.001;
const SCALE_MULT_MAX = 100;

function entityIdFor(projectId: string) {
  return `project-${projectId}`;
}

/** Apply Low / Medium / High shadow-map presets (distance + resolution + soft). */
function applyCesiumShadowMap(viewer: Cesium.Viewer, quality: ShadowQuality) {
  const cfg = shadowQualityToShadowMap(quality);
  const sm = viewer.shadowMap;
  sm.maximumDistance = cfg.maximumDistance;
  sm.size = cfg.size;
  sm.softShadows = cfg.softShadows;
  sm.darkness = 0.35;
}

/**
 * Attach a project GLB with cast+receive shadows.
 * Pins / billboards stay on entities with ShadowMode.DISABLED (no caster overhead).
 */
function attachProjectGlbModel(
  ent: Cesium.Entity,
  opts: { uri: string; scale: number; heightReference: Cesium.HeightReference },
): void {
  // Entity-level ENABLED so the model participates in the shadow map;
  // pin-only entities use DISABLED to avoid billboard/point caster cost.
  ent.shadows = new Cesium.ConstantProperty(Cesium.ShadowMode.ENABLED);
  ent.model = new Cesium.ModelGraphics({
    uri: opts.uri,
    scale: opts.scale,
    heightReference: opts.heightReference,
    shadows: Cesium.ShadowMode.ENABLED,
    runAnimations: false,
    maximumScale: undefined,
    minimumPixelSize: 0,
  });
}

function syncProjectSketchEntities(viewer: Cesium.Viewer, p: Project) {
  const eid = entityIdFor(p.id);
  const lineId = `${eid}-sketch-line`;
  const polyId = `${eid}-sketch-poly`;
  const oldLine = viewer.entities.getById(lineId);
  if (oldLine) viewer.entities.remove(oldLine);
  const oldPoly = viewer.entities.getById(polyId);
  if (oldPoly) viewer.entities.remove(oldPoly);

  const sketch = p.mapSketch;
  if (!sketch || sketch.coordinates.length < 2) return;
  const positions = sketch.coordinates.map((c) =>
    Cesium.Cartesian3.fromDegrees(c.lon, c.lat),
  );
  const stroke = Cesium.Color.fromCssColorString(
    sketch.color || p.markerColor || "#c47a1a",
  );
  if (sketch.kind === "line" || sketch.kind === "area") {
    viewer.entities.add({
      id: lineId,
      polyline: {
        positions: sketch.kind === "area" ? [...positions, positions[0]] : positions,
        width: 4,
        material: stroke,
        clampToGround: true,
      },
    });
  }
  if (sketch.kind === "area" && sketch.coordinates.length >= 3) {
    viewer.entities.add({
      id: polyId,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: stroke.withAlpha(0.28),
        outline: true,
        outlineColor: stroke,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
  }
}

/** Orbit the camera so the model is framed in view (not sitting under the camera). */
function flyCameraToProjectTarget(
  viewer: Cesium.Viewer,
  lon: number,
  lat: number,
  opts?: { entity?: Cesium.Entity; rangeM?: number; duration?: number },
) {
  const rangeM = opts?.rangeM ?? 140;
  const duration = opts?.duration ?? 1.1;
  const heading = viewer.camera.heading;
  const pitch = Cesium.Math.toRadians(-32);
  const offset = new Cesium.HeadingPitchRange(heading, pitch, rangeM);

  if (opts?.entity) {
    void viewer.flyTo(opts.entity, { duration, offset });
    return;
  }

  const target = Cesium.Cartesian3.fromDegrees(lon, lat, 8);
  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 25), {
    duration,
    offset,
  });
}

function projectIdFromEntity(id: string | undefined): string | null {
  if (!id || !id.startsWith("project-")) return null;
  let rest = id.slice("project-".length);
  if (rest.endsWith("-sketch-line")) rest = rest.slice(0, -"-sketch-line".length);
  else if (rest.endsWith("-sketch-poly")) rest = rest.slice(0, -"-sketch-poly".length);
  return rest || null;
}

const CLUSTER_ID_PREFIX = "infra-cluster-";

function clusterIdFromEntity(id: string | undefined): string | null {
  if (!id || !id.startsWith(CLUSTER_ID_PREFIX)) return null;
  return id;
}

function clusterCellDeg(heightM: number): number | null {
  if (heightM > 40_000) return 0.028;
  if (heightM > 16_000) return 0.014;
  if (heightM > 7_000) return 0.006;
  if (heightM > 3_200) return 0.0026;
  return null;
}

function pickClusterEntity(viewer: Cesium.Viewer, screenPos: Cesium.Cartesian2): Cesium.Entity | null {
  const picked = viewer.scene.pick(screenPos);
  if (!Cesium.defined(picked)) return null;
  const raw = (picked as { id?: unknown }).id;
  const id =
    typeof raw === "string"
      ? raw
      : raw instanceof Cesium.Entity
        ? raw.id
        : undefined;
  const cid = clusterIdFromEntity(typeof id === "string" ? id : undefined);
  if (!cid) return null;
  return viewer.entities.getById(cid) ?? null;
}

function pickGlobeLngLat(
  viewer: Cesium.Viewer,
  screenPos: Cesium.Cartesian2,
): { lng: number; lat: number } | null {
  const ray = viewer.camera.getPickRay(screenPos);
  if (!ray) return null;
  let cartesian = viewer.scene.globe.pick(ray, viewer.scene);
  if (!cartesian) {
    cartesian = viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid) ?? undefined;
  }
  if (!cartesian) return null;
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  return {
    lng: Cesium.Math.toDegrees(carto.longitude),
    lat: Cesium.Math.toDegrees(carto.latitude),
  };
}

function applyProjectHoverVisual(
  viewer: Cesium.Viewer,
  project: Project,
  hovered: boolean,
) {
  const eid = entityIdFor(project.id);
  const ent = viewer.entities.getById(eid);
  if (!ent) return;
  const isSitePin = Boolean(project.siteMarkerOnly);
  if (ent.point) {
    const base = isSitePin ? 16 : 10;
    ent.point.pixelSize = new Cesium.ConstantProperty(hovered ? base + 8 : base);
    ent.point.outlineWidth = new Cesium.ConstantProperty(
      hovered ? (isSitePin ? 5 : 3) : isSitePin ? 3 : 2,
    );
  }
  if (ent.model) {
    if (hovered) {
      ent.model.color = new Cesium.ConstantProperty(Cesium.Color.fromCssColorString("#ffe566"));
      ent.model.colorBlendMode = new Cesium.ConstantProperty(Cesium.ColorBlendMode.HIGHLIGHT);
      ent.model.colorBlendAmount = new Cesium.ConstantProperty(0.45);
    } else {
      ent.model.color = new Cesium.ConstantProperty(Cesium.Color.WHITE);
      ent.model.colorBlendMode = new Cesium.ConstantProperty(Cesium.ColorBlendMode.HIGHLIGHT);
      ent.model.colorBlendAmount = new Cesium.ConstantProperty(0);
    }
  }
  const line = viewer.entities.getById(`${eid}-sketch-line`);
  if (line?.polyline) {
    line.polyline.width = new Cesium.ConstantProperty(hovered ? 7 : 4);
  }
  viewer.scene.requestRender();
}

function quakeEntityId(index: number) {
  return `quake-${index}`;
}

function quakeIndexFromEntity(id: string | undefined): number | null {
  if (!id || !id.startsWith("quake-")) return null;
  const n = Number(id.slice("quake-".length));
  return Number.isInteger(n) ? n : null;
}

function quakePointSize(
  cls: EarthquakeGridCell["cls"],
  hovered = false,
  predicted = false,
): number {
  const base = cls === "HIGH" ? 16 : cls === "MODERATE" ? 13 : 9;
  const sized = predicted ? Math.max(8, base - 2) : base;
  return hovered ? sized + 6 : sized;
}

function tropicalEntityId(systemId: string) {
  return `tropical-${systemId}`;
}

function tropicalTrackEntityId(systemId: string) {
  return `tropical-track-${systemId}`;
}

function tropicalIdFromEntity(id: string | undefined): string | null {
  if (!id || !id.startsWith("tropical-")) return null;
  if (id.startsWith("tropical-track-")) return null;
  return id.slice("tropical-".length);
}

function parseHexColor(hex: string): Cesium.Color {
  try {
    return Cesium.Color.fromCssColorString(hex);
  } catch {
    return Cesium.Color.ORANGE;
  }
}

function pickProjectId(viewer: Cesium.Viewer, screenPos: Cesium.Cartesian2): string | null {
  const picked = viewer.scene.pick(screenPos);
  if (!Cesium.defined(picked)) return null;
  const id = (picked as { id?: Cesium.Entity }).id;
  if (id instanceof Cesium.Entity) {
    return projectIdFromEntity(id.id);
  }
  return null;
}

type HoverHit =
  | { kind: "project"; id: string }
  | { kind: "tropical"; id: string }
  | { kind: "quake"; id: string };

/** Single scene.pick for project / tropical / quake hover (avoids extra picks on move). */
function pickHoverHit(viewer: Cesium.Viewer, screenPos: Cesium.Cartesian2): HoverHit | null {
  const picked = viewer.scene.pick(screenPos);
  if (!Cesium.defined(picked)) return null;
  const ent = (picked as { id?: Cesium.Entity }).id;
  if (!(ent instanceof Cesium.Entity)) return null;
  const projectId = projectIdFromEntity(ent.id);
  if (projectId) return { kind: "project", id: projectId };
  const tropicalId = tropicalIdFromEntity(ent.id);
  if (tropicalId) return { kind: "tropical", id: tropicalId };
  const quakeIdx = quakeIndexFromEntity(typeof ent.id === "string" ? ent.id : undefined);
  if (quakeIdx != null) return { kind: "quake", id: String(quakeIdx) };
  return null;
}

function pickTropicalId(viewer: Cesium.Viewer, screenPos: Cesium.Cartesian2): string | null {
  const picked = viewer.scene.pick(screenPos);
  if (!Cesium.defined(picked)) return null;
  const id = (picked as { id?: Cesium.Entity }).id;
  if (id instanceof Cesium.Entity) {
    return tropicalIdFromEntity(id.id);
  }
  return null;
}

/** Move lon/lat by local East / North meters (Z/up handled separately). */
function offsetLngLatMeters(
  lon: number,
  lat: number,
  eastM: number,
  northM: number,
): { lon: number; lat: number } {
  if (eastM === 0 && northM === 0) return { lon, lat };
  const origin = Cesium.Cartesian3.fromDegrees(lon, lat);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
  const local = new Cesium.Cartesian3(eastM, northM, 0);
  const world = Cesium.Matrix4.multiplyByPoint(enu, local, new Cesium.Cartesian3());
  const carto = Cesium.Cartographic.fromCartesian(world);
  return {
    lon: Cesium.Math.toDegrees(carto.longitude),
    lat: Cesium.Math.toDegrees(carto.latitude),
  };
}

function applyEntityPose(
  ent: Cesium.Entity,
  lon: number,
  lat: number,
  rotationDeg: number,
  scale: number,
  heightM = 0,
) {
  // Z ≈ 0 → clamp to ground (no elevation float). Else relative to terrain.
  const onGround = Math.abs(heightM) < 1e-4;
  const position = onGround
    ? Cesium.Cartesian3.fromDegrees(lon, lat)
    : Cesium.Cartesian3.fromDegrees(lon, lat, heightM);
  const heightRef = onGround
    ? Cesium.HeightReference.CLAMP_TO_GROUND
    : Cesium.HeightReference.RELATIVE_TO_GROUND;

  ent.position = new Cesium.ConstantPositionProperty(position);
  ent.orientation = new Cesium.ConstantProperty(
    Cesium.Transforms.headingPitchRollQuaternion(
      position,
      new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(-rotationDeg), 0, 0),
    ),
  );
  if (ent.model) {
    const model = ent.model as Cesium.ModelGraphics;
    model.scale = new Cesium.ConstantProperty(scale);
    model.heightReference = new Cesium.ConstantProperty(heightRef);
    model.minimumPixelSize = new Cesium.ConstantProperty(0);
    model.maximumScale = undefined;
  }
  if (ent.label) {
    const label = ent.label as Cesium.LabelGraphics;
    label.heightReference = new Cesium.ConstantProperty(heightRef);
  }
  if (ent.point) {
    const point = ent.point as Cesium.PointGraphics;
    point.heightReference = new Cesium.ConstantProperty(heightRef);
  }
}

/** Refresh pin vs label chrome after a site pin is promoted to a 3D model. */
function applySitePinChrome(
  ent: Cesium.Entity,
  p: Project,
  opts: {
    isAttached: (id: string) => boolean;
    isSelected: (id: string) => boolean;
    isHovered: (id: string) => boolean;
  },
) {
  const isSitePin = Boolean(p.siteMarkerOnly);
  if (ent.point) {
    const point = ent.point as Cesium.PointGraphics;
    point.pixelSize = new Cesium.ConstantProperty(isSitePin ? 16 : 10);
    point.outlineWidth = new Cesium.ConstantProperty(isSitePin ? 3 : 2);
    point.show = new Cesium.CallbackProperty(
      () => isSitePin || !opts.isAttached(p.id),
      false,
    );
  }
  if (ent.label) {
    const label = ent.label as Cesium.LabelGraphics;
    label.text = new Cesium.ConstantProperty(isSitePin ? `📌 ${p.name}` : p.name);
    label.font = new Cesium.ConstantProperty(isSitePin ? "bold 13px sans-serif" : "12px sans-serif");
    label.pixelOffset = new Cesium.ConstantProperty(
      new Cesium.Cartesian2(0, isSitePin ? -22 : -18),
    );
    label.show = new Cesium.CallbackProperty(
      () =>
        isSitePin ||
        opts.isSelected(p.id) ||
        opts.isHovered(p.id) ||
        !opts.isAttached(p.id),
      false,
    );
  }
}

function statusLabel(status: Project["status"]) {
  return PROJECT_STATUS_LABELS[status as ProjectStatus] ?? String(status);
}

function statusColor(status: Project["status"]) {
  return PROJECT_STATUS_COLORS[status as ProjectStatus] ?? "#9b9b9b";
}

function DualQuakeSummary({
  score,
  ink = false,
}: {
  score: EarthquakeDualSummary;
  ink?: boolean;
}) {
  const mute = ink ? "var(--muted)" : "rgba(255,255,255,0.62)";
  const row = (label: string, item: EarthquakeSiteScore | null, empty: string) => (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: mute }}>
        {label}
      </div>
      {item ? (
        <div>
          <b style={{ color: classColor(item.cls) }}>{item.cls}</b>
          {" — "}
          {classAdvice(item.cls)}
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 1 }}>
            PEIS {item.shakeClass.toUpperCase()} · EIL {item.eilClass} ·{" "}
            {Math.round(item.confidence * 100)}%
          </div>
        </div>
      ) : (
        <div style={{ opacity: 0.7 }}>{empty}</div>
      )}
    </div>
  );
  return (
    <div>
      {row("Old · PHIVOLCS EIL 2014", score.official, "No nearby 2014 sheet pixel")}
      {row("Prediction · terrain / satellite", score.predicted, "Model not ready")}
    </div>
  );
}

export const CesiumMap = forwardRef<CesiumMapHandle, Props>(function CesiumMap(
  {
    solarHour,
    sunAzimuthDeg,
    projects,
    clusteringEnabled = true,
    visible = true,
    placementMode = false,
    editMode = false,
    onPlaceClick,
    placementTool = "pin",
    placementColor = "#c47a1a",
    onPlaceSketch,
    readOnly = false,
    canManipulateModels = false,
    canPromoteSitePin = false,
    onProjectPatch,
    canAddPhotos = false,
    onPhotosChange,
    onDeleteBuilding,
    gibs,
    buildingBlocksVisible = true,
    blockRemoverActive = false,
    terrainEnabled = false,
    satellite = false,
    hazardOverlays = {},
    tropicalEnabled = false,
    tropicalSystems = [],
    earthquakeEnabled = false,
    earthquakeGrid = [],
    mapSettings = DEFAULT_MAP_SETTINGS,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const gibsImageryRef = useRef<Cesium.ImageryLayer | null>(null);
  const satelliteImageryRef = useRef<Cesium.ImageryLayer | null>(null);
  const osmBasemapRef = useRef<Cesium.ImageryLayer | null>(null);
  const satelliteEnabledRef = useRef(satellite);
  satelliteEnabledRef.current = satellite;
  const applySatelliteVisibilityRef = useRef<() => void>(() => {});
  const hazardOverlayLayersRef = useRef<Map<string, Cesium.ImageryLayer[]>>(new Map());
  const gibsRef = useRef(gibs);
  gibsRef.current = gibs;
  const [gibsHover, setGibsHover] = useState<{
    x: number;
    y: number;
    title: string;
    valueText: string;
  } | null>(null);
  const tropicalIdsRef = useRef<Set<string>>(new Set());
  const tropicalSystemsRef = useRef(tropicalSystems);
  tropicalSystemsRef.current = tropicalSystems;
  const [selectedTropicalId, setSelectedTropicalId] = useState<string | null>(null);
  const [hoveredTropical, setHoveredTropical] = useState<{
    system: TropicalSystem;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredProject, setHoveredProject] = useState<{
    project: Project;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredQuake, setHoveredQuake] = useState<{
    cell: EarthquakeGridCell;
    x: number;
    y: number;
  } | null>(null);
  const [selectedQuakeCell, setSelectedQuakeCell] = useState<EarthquakeGridCell | null>(null);
  const [siteQuakeScore, setSiteQuakeScore] = useState<EarthquakeDualSummary | null>(null);
  const [selectedQuakeCompare, setSelectedQuakeCompare] =
    useState<EarthquakeDualSummary | null>(null);
  const earthquakeGridRef = useRef(earthquakeGrid);
  earthquakeGridRef.current = earthquakeGrid;
  const earthquakeEnabledRef = useRef(earthquakeEnabled);
  earthquakeEnabledRef.current = earthquakeEnabled;
  const hoveredProjectIdRef = useRef<string | null>(null);
  const buildingPrimitivesRef = useRef<Cesium.Primitive[]>([]);
  const buildingMaterialRef = useRef<Cesium.Material | null>(null);
  const buildingBlocksVisibleRef = useRef(buildingBlocksVisible);
  buildingBlocksVisibleRef.current = buildingBlocksVisible;
  const buildingFootprintsRef = useRef<BuildingFootprint[] | null>(null);
  const removedBlockIdsRef = useRef<Set<string>>(loadRemovedBlockIds());
  const rebuildBuildingsRef = useRef<(() => Promise<void>) | null>(null);
  const blockRemoverActiveRef = useRef(blockRemoverActive);
  blockRemoverActiveRef.current = blockRemoverActive;
  const terrainEnabledRef = useRef(terrainEnabled);
  terrainEnabledRef.current = terrainEnabled;
  const mapSettingsRef = useRef(mapSettings);
  mapSettingsRef.current = mapSettings;
  const applyScopeRef = useRef<(() => void) | null>(null);
  const [removedBlockCount, setRemovedBlockCount] = useState(() => loadRemovedBlockIds().size);
  const [viewerReady, setViewerReady] = useState(0);
  const loadedIdsRef = useRef<Set<string>>(new Set());
  /** Project ids that currently have a GLB ModelGraphics attached (not just a pin). */
  const modelAttachedRef = useRef<Set<string>>(new Set());
  const modelLoadBusyRef = useRef(0);
  const modelLoadQueueRef = useRef<string[]>([]);
  /** Ids currently fetching/decoding a GLB (not yet attached). */
  const modelLoadingIdsRef = useRef<Set<string>>(new Set());
  const lodReconcileRef = useRef<(() => void) | null>(null);
  const tiltedRef = useRef(true);
  const xformsRef = useRef<Map<string, LocalXform>>(new Map());
  const projectsRef = useRef(projects);
  const clusteringEnabledRef = useRef(clusteringEnabled);
  const applyInfraClustersRef = useRef<() => void>(() => {});
  const clusterMetaRef = useRef(new Map<string, { lon: number; lat: number }>());
  const selectedIdRef = useRef<string | null>(null);
  const placementModeRef = useRef(placementMode);
  const editModeRef = useRef(editMode);
  const modelsFrozenRef = useRef(false);
  const onPlaceClickRef = useRef(onPlaceClick);
  const onPlaceSketchRef = useRef(onPlaceSketch);
  const placementToolRef = useRef(placementTool);
  const placementColorRef = useRef(placementColor);
  const sketchDraftRef = useRef<{ lon: number; lat: number }[]>([]);
  /** True while mouse is held for freehand line drawing. */
  const freehandDrawingRef = useRef(false);
  const [sketchVertexCount, setSketchVertexCount] = useState(0);
  /** Show tip ball after mouse release (freehand draw). */
  const [showFreehandEndBall, setShowFreehandEndBall] = useState(false);
  const bumpSketchUiRef = useRef(() => {});
  bumpSketchUiRef.current = () => setSketchVertexCount(sketchDraftRef.current.length);
  const finishSketchDraftRef = useRef<() => boolean>(() => false);
  const setShowFreehandEndBallRef = useRef(setShowFreehandEndBall);
  setShowFreehandEndBallRef.current = setShowFreehandEndBall;
  const readOnlyRef = useRef(readOnly);
  const canManipulateModelsRef = useRef(canManipulateModels);
  const saveTimerRef = useRef<number | null>(null);

  const canEditModels = canManipulateModels && !readOnly;
  const canEditModelsRef = useRef(canEditModels);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformDirty, setTransformDirty] = useState(false);
  const [transformSaving, setTransformSaving] = useState(false);
  const [transformMessage, setTransformMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmStartBuild, setConfirmStartBuild] = useState(false);
  const [startBuildBusy, setStartBuildBusy] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const hudRef = useRef<HTMLDivElement>(null);
  const pickChromeRef = useRef<HTMLDivElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    status: ProjectStatus;
    progress: number;
    description: string;
    startDate: string;
    targetEndDate: string;
    budgetTotal: string;
    budgetSpent: string;
    markerColor: string;
    barangay: string;
    officialUrl: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [, bumpXform] = useState(0);
  const [modelLoadUi, setModelLoadUi] = useState<{
    active: boolean;
    label: string;
    remaining: number;
  }>({ active: false, label: "", remaining: 0 });

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  useEffect(() => {
    clusteringEnabledRef.current = clusteringEnabled;
    applyInfraClustersRef.current();
  }, [clusteringEnabled]);
  useEffect(() => {
    placementModeRef.current = placementMode;
  }, [placementMode]);
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);
  modelsFrozenRef.current = placementMode || blockRemoverActive;
  useEffect(() => {
    onPlaceClickRef.current = onPlaceClick;
  }, [onPlaceClick]);
  useEffect(() => {
    onPlaceSketchRef.current = onPlaceSketch;
  }, [onPlaceSketch]);
  useEffect(() => {
    placementToolRef.current = placementTool;
  }, [placementTool]);
  useEffect(() => {
    placementColorRef.current = placementColor;
  }, [placementColor]);
  useEffect(() => {
    // Reset draft when tool changes or placement ends.
    freehandDrawingRef.current = false;
    sketchDraftRef.current = [];
    setSketchVertexCount(0);
    setShowFreehandEndBall(false);
  }, [placementTool, placementMode]);
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);
  useEffect(() => {
    canManipulateModelsRef.current = canManipulateModels;
  }, [canManipulateModels]);
  useEffect(() => {
    canEditModelsRef.current = canEditModels;
  }, [canEditModels]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    setHudCollapsed(false);
    setConfirmDelete(false);
  }, [selectedId]);

  const selectedProject = selectedId
    ? projects.find((p) => p.id === selectedId) ?? null
    : null;
  const selectedXform = selectedId ? xformsRef.current.get(selectedId) : undefined;
  const modelsFrozen = placementMode || blockRemoverActive;

  function emitCompletedSketch(coords: { lon: number; lat: number }[], kind: MapSketchKind) {
    const sketch: MapSketch = {
      kind,
      color: placementColorRef.current || "#c47a1a",
      coordinates: coords,
    };
    if (onPlaceSketchRef.current) {
      onPlaceSketchRef.current(sketch);
    } else {
      const first = coords[0];
      if (first) onPlaceClickRef.current?.({ lng: first.lon, lat: first.lat });
    }
    sketchDraftRef.current = [];
    setSketchVertexCount(0);
    setShowFreehandEndBall(false);
  }

  function finishSketchDraft(): boolean {
    const tool = placementToolRef.current;
    const draft = sketchDraftRef.current;
    if (tool === "line" && draft.length >= 2) {
      emitCompletedSketch([...draft], "line");
      return true;
    }
    if (tool === "area" && draft.length >= 3) {
      emitCompletedSketch([...draft], "area");
      return true;
    }
    return false;
  }
  finishSketchDraftRef.current = finishSketchDraft;

  function syncFreehandDraftPreview(viewer: Cesium.Viewer) {
    const draftId = "placement-draft-sketch";
    const draft = sketchDraftRef.current;
    const color = Cesium.Color.fromCssColorString(placementColorRef.current || "#c47a1a");
    const old = viewer.entities.getById(draftId);
    if (draft.length < 2) {
      if (old) viewer.entities.remove(old);
      viewer.scene.requestRender();
      return;
    }
    const positions = draft.map((c) => Cesium.Cartesian3.fromDegrees(c.lon, c.lat));
    if (old?.polyline) {
      old.polyline.positions = new Cesium.ConstantProperty(positions);
      old.polyline.material = new Cesium.ColorMaterialProperty(color);
      old.polyline.width = new Cesium.ConstantProperty(4);
    } else {
      if (old) viewer.entities.remove(old);
      viewer.entities.add({
        id: draftId,
        polyline: {
          positions,
          width: 4,
          material: color,
          clampToGround: true,
        },
      });
    }
    viewer.scene.requestRender();
  }

  function syncFreehandEndBall(viewer: Cesium.Viewer, show: boolean) {
    const ballId = "placement-draft-endball";
    const old = viewer.entities.getById(ballId);
    if (!show) {
      if (old) viewer.entities.remove(old);
      viewer.scene.requestRender();
      return;
    }
    const draft = sketchDraftRef.current;
    const last = draft[draft.length - 1];
    if (!last) {
      if (old) viewer.entities.remove(old);
      viewer.scene.requestRender();
      return;
    }
    const color = Cesium.Color.fromCssColorString(placementColorRef.current || "#c47a1a");
    const pos = Cesium.Cartesian3.fromDegrees(last.lon, last.lat);
    if (old) {
      old.position = new Cesium.ConstantPositionProperty(pos);
      if (old.point) {
        old.point.color = new Cesium.ConstantProperty(color);
      }
    } else {
      viewer.entities.add({
        id: ballId,
        position: pos,
        point: {
          pixelSize: 16,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
    viewer.scene.requestRender();
  }

  useImperativeHandle(ref, () => ({
    zoomIn() {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      const h = viewer.camera.positionCartographic.height;
      viewer.camera.zoomIn(Math.max(50, h * 0.35));
    },
    zoomOut() {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      const h = viewer.camera.positionCartographic.height;
      viewer.camera.zoomOut(Math.max(50, h * 0.35));
    },
    flyHome() {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      tiltedRef.current = true;
      flyCameraHome(viewer);
    },
    toggleTilt() {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      tiltedRef.current = !tiltedRef.current;
      const pitch = tiltedRef.current ? HOME_PITCH : Cesium.Math.toRadians(-89);
      viewer.camera.flyTo({
        destination: viewer.camera.position.clone(),
        orientation: {
          heading: viewer.camera.heading,
          pitch,
          roll: 0,
        },
        duration: 0.5,
      });
    },
    setCameraInputsEnabled(enabled: boolean) {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      viewer.scene.screenSpaceCameraController.enableInputs = enabled;
    },
    restoreRemovedBlocks() {
      removedBlockIdsRef.current = new Set();
      saveRemovedBlockIds(removedBlockIdsRef.current);
      setRemovedBlockCount(0);
      void rebuildBuildingsRef.current?.();
    },
    flyToLonLat(lon: number, lat: number, heightM = 80_000) {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, heightM),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
        duration: 2,
      });
    },
    flyToProject(projectId: string) {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      const p = projectsRef.current.find((x) => x.id === projectId);
      if (!p) return;
      const xf = xformsRef.current.get(projectId);
      const lon = xf?.lon ?? p.location.lon;
      const lat = xf?.lat ?? p.location.lat;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      setSelectedId(projectId);
      const ent = viewer.entities.getById(entityIdFor(projectId));
      const scale = Math.max(0.5, xf?.scaleMultiplier ?? p.modelScale ?? 1);
      flyCameraToProjectTarget(viewer, lon, lat, {
        entity: ent,
        rangeM: Math.max(90, 160 * scale),
        duration: 1.15,
      });
    },
    finishSketch() {
      return finishSketchDraft();
    },
    undoSketchVertex() {
      sketchDraftRef.current = sketchDraftRef.current.slice(0, -1);
      setSketchVertexCount(sketchDraftRef.current.length);
      if (sketchDraftRef.current.length === 0) {
        setShowFreehandEndBall(false);
      }
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        syncFreehandEndBall(viewer, sketchDraftRef.current.length > 0 && placementToolRef.current === "line");
        syncFreehandDraftPreview(viewer);
      }
    },
    clearSketch() {
      sketchDraftRef.current = [];
      setSketchVertexCount(0);
      setShowFreehandEndBall(false);
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        syncFreehandEndBall(viewer, false);
      }
    },
    getSketchVertexCount() {
      return sketchDraftRef.current.length;
    },
  }));

  const ensureXform = useCallback((p: Project): LocalXform => {
    const existing = xformsRef.current.get(p.id);
    if (existing?.dirty) return existing;

    if (existing?.pendingSync) {
      const matches =
        Math.abs(existing.lon - p.location.lon) < 1e-6 &&
        Math.abs(existing.lat - p.location.lat) < 1e-6 &&
        Math.abs(existing.heightM - (p.modelHeight ?? 0)) < 0.01 &&
        Math.abs(existing.rotationDeg - (p.rotation ?? 0)) < 0.05 &&
        Math.abs(existing.scaleMultiplier - (p.modelScale ?? 1)) < 0.001;
      if (matches) {
        existing.pendingSync = false;
        existing.modelLocked = Boolean(p.modelLocked);
      } else {
        existing.modelLocked = Boolean(p.modelLocked);
        return existing;
      }
    }

    const next: LocalXform = {
      lon: p.location.lon,
      lat: p.location.lat,
      heightM: p.modelHeight ?? 0,
      rotationDeg: p.rotation ?? 0,
      scaleMultiplier: p.modelScale ?? 1,
      modelLocked: Boolean(p.modelLocked),
      dirty: false,
      pendingSync: false,
    };
    xformsRef.current.set(p.id, next);
    return next;
  }, []);

  const setCameraInteractive = (viewer: Cesium.Viewer, enabled: boolean) => {
    const c = viewer.scene.screenSpaceCameraController;
    c.enableRotate = enabled;
    c.enableTranslate = enabled;
    c.enableZoom = enabled;
    c.enableTilt = enabled;
    c.enableLook = enabled;
  };

  // ── Create / destroy viewer ──────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !containerRef.current) return;
    if (viewerRef.current) return;

    const ionToken = (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined)?.trim();
    if (ionToken) Cesium.Ion.defaultAccessToken = ionToken;

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: true,
      terrainShadows: Cesium.ShadowMode.RECEIVE_ONLY,
      shouldAnimate: false,
      scene3DOnly: true,
      // OSM street basemap (Ion token stays for terrain only).
      baseLayer: false,
    });

    // Ours is the only click handler — default pick/fly-to fights placement.
    viewer.screenSpaceEventHandler.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    );
    viewer.screenSpaceEventHandler.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );

    const osmLayer = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: OSM_RASTER_TILE_URL,
        credit: OSM_RASTER_ATTRIBUTION,
        maximumLevel: 19,
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
      }),
    );
    osmBasemapRef.current = osmLayer;

    // Satellite: Cesium ion Bing Aerial (HD demo look) when token set, else ESRI World Imagery.
    const ESRI_WORLD_IMAGERY =
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
    const styleSatelliteLayer = (layer: Cesium.ImageryLayer) => {
      layer.maximumAnisotropy = 4;
    };

    const syncOsmBlocksForSatellite = () => {
      const showBlocks =
        buildingBlocksVisibleRef.current && !satelliteEnabledRef.current;
      for (const p of buildingPrimitivesRef.current) {
        p.show = showBlocks;
      }
    };

    const applySatelliteHdScene = (on: boolean) => {
      if (terrainEnabledRef.current) {
        applyTerrainPerfSettings(viewer, true, {
          screenSpaceError: terrainQualityToSse(mapSettingsRef.current.terrainQuality),
          satelliteOn: on,
        });
      }
      // Never upscale the framebuffer for satellite — 2× DPR * DEM * imagery melts GPUs.
      viewer.resolutionScale = 1;
      if (!on) applyScopeRef.current?.();
    };

    const applySatVisibility = () => {
      if (viewer.isDestroyed()) return;
      const on = satelliteEnabledRef.current;
      const sat = satelliteImageryRef.current;
      const osm = osmBasemapRef.current;
      if (sat) {
        sat.show = on;
        sat.alpha = on ? 1 : 0;
        if (on) {
          styleSatelliteLayer(sat);
          try {
            viewer.imageryLayers.raiseToTop(sat);
          } catch {
            /* ignore */
          }
        }
      }
      if (osm) {
        osm.show = !on;
        osm.alpha = on ? 0 : 1;
      }
      syncOsmBlocksForSatellite();
      applySatelliteHdScene(on);
      for (const layers of hazardOverlayLayersRef.current.values()) {
        for (const layer of layers) {
          try {
            viewer.imageryLayers.raiseToTop(layer);
          } catch {
            /* ignore */
          }
        }
      }
      if (gibsImageryRef.current) {
        try {
          viewer.imageryLayers.raiseToTop(gibsImageryRef.current);
        } catch {
          /* ignore */
        }
      }
      viewer.scene.requestRender();
    };
    applySatelliteVisibilityRef.current = applySatVisibility;

    const addSatelliteXyzFallback = () => {
      if (viewer.isDestroyed() || satelliteImageryRef.current) return;
      const satCfg = getSatelliteSource("esri");
      const url =
        satCfg.tiles[0]?.replace(
          "server.arcgisonline.com",
          "services.arcgisonline.com",
        ) ?? `${ESRI_WORLD_IMAGERY}/tile/{z}/{y}/{x}`;
      const layer = viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url,
          credit: satCfg.attribution,
          maximumLevel: 18,
          tilingScheme: new Cesium.WebMercatorTilingScheme(),
        }),
      );
      styleSatelliteLayer(layer);
      satelliteImageryRef.current = layer;
      applySatVisibility();
    };

    const attachSatelliteLayer = (layer: Cesium.ImageryLayer) => {
      styleSatelliteLayer(layer);
      layer.show = false;
      layer.alpha = 0;
      viewer.imageryLayers.add(layer);
      satelliteImageryRef.current = layer;
      layer.readyEvent.addEventListener(() => applySatVisibility());
      layer.errorEvent.addEventListener((err: unknown) => {
        console.warn("[CesiumMap] satellite layer error:", err);
        try {
          viewer.imageryLayers.remove(layer, false);
        } catch {
          /* ignore */
        }
        if (satelliteImageryRef.current === layer) {
          satelliteImageryRef.current = null;
        }
        addSatelliteXyzFallback();
      });
      applySatVisibility();
    };

    if (ionToken) {
      const ionLayer = Cesium.ImageryLayer.fromProviderAsync(
        Cesium.createWorldImageryAsync({
          style: Cesium.IonWorldImageryStyle.AERIAL,
        }),
      );
      attachSatelliteLayer(ionLayer);
    } else {
      console.info(
        "[CesiumMap] No VITE_CESIUM_ION_TOKEN — ESRI fallback. Set ion token for Bing HD Aerial.",
      );
      const esriLayer = Cesium.ImageryLayer.fromProviderAsync(
        Cesium.ArcGisMapServerImageryProvider.fromUrl(ESRI_WORLD_IMAGERY, {
          enablePickFeatures: false,
        }),
      );
      attachSatelliteLayer(esriLayer);
    }

    viewer.clock.shouldAnimate = false;
    initProceduralSky(viewer);
    viewer.scene.globe.shadows = Cesium.ShadowMode.RECEIVE_ONLY;

    // Draw the Luisiana municipality boundary outline on the globe.
    void addLuisianaBoundary(viewer);

    // Fog + pan tuning in local 3D tilt (no cartographic clip — keeps full globe).
    viewer.scene.globe.cartographicLimitRectangle = Cesium.Rectangle.MAX_VALUE;
    viewer.scene.fog.minimumBrightness = FOG_MIN_BRIGHTNESS_DAY;

    const applyLuisianaScopeForCamera = () => {
      if (viewer.isDestroyed()) return;
      const carto = viewer.camera.positionCartographic;
      if (!carto) return;
      // Pitch near -90° = top-down; greater (e.g. -35°) = 3D tilt.
      const pitch = viewer.camera.pitch;
      const inLocal3d =
        pitch > MUNICIPAL_3D_PITCH_RAD &&
        carto.height < MUNICIPAL_3D_MAX_HEIGHT_M;

      const settings = mapSettingsRef.current;
      const frustum = viewer.camera.frustum as Cesium.PerspectiveFrustum;
      // Always full globe — clipping to Luisiana made a floating square on blue sky.
      viewer.scene.globe.cartographicLimitRectangle = Cesium.Rectangle.MAX_VALUE;
      if (inLocal3d) {
        viewer.scene.fog.enabled = settings.fogEnabled;
        // Only set the tile-culling SSE factor here — do NOT override fog.density.
        // applyProceduralAtmosphere owns the density value; overwriting it with the
        // hardcoded constant caused a visible "blue fog pop" on the very first click
        // (camera.changed fired → density jumped from ~0.00011 to 0.0006, 5× denser).
        viewer.scene.fog.screenSpaceErrorFactor = LOCAL_3D_FOG_SSE_FACTOR;
        if (typeof frustum.far === "number") frustum.far = LOCAL_3D_FAR_M;
      } else {
        viewer.scene.fog.enabled = false;
        if (typeof frustum.far === "number") frustum.far = GLOBE_FAR_M;
      }
      tiltedRef.current = inLocal3d;

      // Slow pan/orbit in 3D tilt — especially near-horizon / low “street” angles.
      // (Left-drag rotates the globe; near the ground that feels like racing pan.)
      const camCtrl = viewer.scene.screenSpaceCameraController;
      if (inLocal3d) {
        // pitch: -90 top-down → 0 horizon. t≈0 top-down local, t≈1 looking along ground.
        const t = Math.max(
          0,
          Math.min(1, (pitch - MUNICIPAL_3D_PITCH_RAD) / (0 - MUNICIPAL_3D_PITCH_RAD)),
        );
        const lowAlt = Math.max(0, Math.min(1, 1 - carto.height / 10_000));
        // Much slower than Cesium default (0.1) — fine control for Luisiana streets.
        camCtrl.maximumMovementRatio = 0.012 - 0.006 * Math.max(t, lowAlt * 0.9);
        camCtrl.inertiaTranslate = 0.12;
        camCtrl.inertiaSpin = 0.15;
        camCtrl.inertiaZoom = 0.35;
      } else {
        camCtrl.maximumMovementRatio = 0.028;
        camCtrl.inertiaTranslate = 0.3;
        camCtrl.inertiaSpin = 0.35;
        camCtrl.inertiaZoom = 0.5;
      }
    };
    applyScopeRef.current = applyLuisianaScopeForCamera;
    applyLuisianaScopeForCamera();
    const removeCamChanged = viewer.camera.changed.addEventListener(applyLuisianaScopeForCamera);
    const removeCamMoveEnd = viewer.camera.moveEnd.addEventListener(applyLuisianaScopeForCamera);

    // Render on demand — continuous redraw cooks weak GPUs while heavy GLBs stream in.
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;

    applyCesiumShadowMap(viewer, mapSettingsRef.current.shadowQuality);

    // Right-drag = change camera angle (tilt). Zoom only via scroll wheel / pinch.
    const camCtrl = viewer.scene.screenSpaceCameraController;
    camCtrl.zoomEventTypes = [Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.PINCH];
    camCtrl.tiltEventTypes = [
      Cesium.CameraEventType.RIGHT_DRAG,
      Cesium.CameraEventType.MIDDLE_DRAG,
      Cesium.CameraEventType.PINCH,
      { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
    ];
    // Keep orbit around world-up so tilt cannot roll/flip the globe.
    camCtrl.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
    // Baseline; applyLuisianaScopeForCamera retunes for 3D / bottom view.
    camCtrl.maximumMovementRatio = 0.028;
    camCtrl.inertiaTranslate = 0.3;
    camCtrl.inertiaSpin = 0.35;
    camCtrl.inertiaZoom = 0.5;
    camCtrl.enableCollisionDetection = true;
    camCtrl.minimumZoomDistance = MIN_CAMERA_HEIGHT_M;
    camCtrl.maximumZoomDistance = 8_000_000;
    // Collision only when actually near the ground — not while tilting at 1–8 km.
    camCtrl.minimumCollisionTerrainHeight = COLLISION_TERRAIN_HEIGHT_M;
    if ("minimumPickingTerrainHeight" in camCtrl) {
      camCtrl.minimumPickingTerrainHeight = COLLISION_TERRAIN_HEIGHT_M;
    }

    const clampCameraPitch = () => {
      if (viewer.isDestroyed()) return;
      const cam = viewer.camera;
      const pitch = cam.pitch;
      if (pitch > MAX_CAMERA_PITCH) {
        cam.lookDown(pitch - MAX_CAMERA_PITCH);
      } else if (pitch < MIN_CAMERA_PITCH) {
        cam.lookUp(MIN_CAMERA_PITCH - pitch);
      }
      if (Math.abs(cam.roll) > 0.008) {
        cam.twistLeft(cam.roll);
      }
    };

    const keepCameraAboveGround = () => {
      if (viewer.isDestroyed()) return;
      clampCameraPitch();
      const cam = viewer.camera;
      const carto = cam.positionCartographic;
      const sampled = viewer.scene.globe.getHeight(carto);
      const ground =
        typeof sampled === "number" && Number.isFinite(sampled) ? sampled : 0;
      const minHeight = Math.max(
        MIN_CAMERA_HEIGHT_M,
        ground + MIN_TERRAIN_CLEARANCE_M,
      );

      if (carto.height >= minHeight) return;

      // Lift only — keep the already-clamped pitch (do not setView, that flips).
      const up = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude),
        new Cesium.Cartesian3(),
      );
      const lift = minHeight - carto.height;
      cam.position = Cesium.Cartesian3.add(
        cam.position,
        Cesium.Cartesian3.multiplyByScalar(up, lift, new Cesium.Cartesian3()),
        new Cesium.Cartesian3(),
      );
    };
    const removeKeepAbove = viewer.camera.changed.addEventListener(keepCameraAboveGround);
    const removeKeepAboveMoveEnd = viewer.camera.moveEnd.addEventListener(keepCameraAboveGround);

    const terrainSseWhileIdle = () =>
      terrainQualityToSse(mapSettingsRef.current.terrainQuality);
    const onCamMoveStart = () => {
      if (viewer.isDestroyed() || !terrainEnabledRef.current) return;
      viewer.scene.globe.maximumScreenSpaceError = terrainSseWhileIdle() * 1.8;
    };
    const onCamMoveEnd = () => {
      if (viewer.isDestroyed() || !terrainEnabledRef.current) return;
      viewer.scene.globe.maximumScreenSpaceError = terrainSseWhileIdle();
    };
    const removeMoveStart = viewer.camera.moveStart.addEventListener(onCamMoveStart);
    const removeMoveEndSse = viewer.camera.moveEnd.addEventListener(onCamMoveEnd);

    (async () => {
      // Start flat; Layers → 3D Terrain loads Ion/ArcGIS elevation.
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      viewer.scene.globe.depthTestAgainstTerrain = false;
      viewer.scene.globe.terrainExaggeration = 1;
    })();

    // Luisiana-only extruded OSM blocks (pickable ids for block remover).
    let buildingsCancelled = false;

    const clearBuildingPrimitives = () => {
      for (const p of buildingPrimitivesRef.current) {
        try {
          if (!viewer.isDestroyed()) viewer.scene.primitives.remove(p);
        } catch {
          /* ignore */
        }
      }
      buildingPrimitivesRef.current = [];
    };

    const mountBuildingFootprints = async (footprints: BuildingFootprint[]) => {
      if (buildingsCancelled || viewer.isDestroyed()) return;
      clearBuildingPrimitives();
      const removed = removedBlockIdsRef.current;
      const capped = footprints.slice(0, MAX_OSM_BUILDING_BLOCKS);
      const roof = Cesium.Color.fromCssColorString(OSM_BLOCK_COLOR).withAlpha(1);
      const kept: { b: BuildingFootprint; id: string }[] = [];
      for (let i = 0; i < capped.length; i++) {
        const b = capped[i];
        const id = osmBuildingInstanceId(b.id, i);
        if (removed.has(id)) continue;
        if (b.ring.length < 4 || !ringSpanOk(b.ring)) continue;
        kept.push({ b, id });
      }

      const terrain = viewer.terrainProvider;
      const useDem = !(terrain instanceof Cesium.EllipsoidTerrainProvider);
      const exag = viewer.scene.globe.terrainExaggeration || 1;
      const relH = viewer.scene.globe.terrainExaggerationRelativeHeight || 0;

      // Sample every ring vertex so the base follows the slope (centroid-only floated).
      type Vert = { lon: number; lat: number };
      const verts: Vert[] = [];
      const ringLens: number[] = [];
      for (let bi = 0; bi < kept.length; bi++) {
        const ring = kept[bi].b.ring;
        const n =
          ring.length >= 2 &&
          ring[0][0] === ring[ring.length - 1][0] &&
          ring[0][1] === ring[ring.length - 1][1]
            ? ring.length - 1
            : ring.length;
        ringLens.push(n);
        for (let vi = 0; vi < n; vi++) {
          verts.push({ lon: ring[vi][0], lat: ring[vi][1] });
        }
      }

      const heightAt = new Float64Array(verts.length);
      if (useDem && verts.length > 0) {
        const SAMPLE_BATCH = 800;
        for (let i = 0; i < verts.length; i += SAMPLE_BATCH) {
          if (buildingsCancelled || viewer.isDestroyed()) return;
          const end = Math.min(i + SAMPLE_BATCH, verts.length);
          const cartos: Cesium.Cartographic[] = [];
          for (let j = i; j < end; j++) {
            cartos.push(Cesium.Cartographic.fromDegrees(verts[j].lon, verts[j].lat));
          }
          try {
            const sampled = await Cesium.sampleTerrainMostDetailed(terrain, cartos);
            for (let j = 0; j < sampled.length; j++) {
              const raw = sampled[j]?.height;
              heightAt[i + j] =
                typeof raw === "number" && Number.isFinite(raw)
                  ? exaggerateTerrainHeight(raw, exag, relH)
                  : 0;
            }
          } catch (err) {
            console.warn("[CesiumMap] terrain sample failed for buildings:", err);
          }
        }
      }

      const vertOffset: number[] = new Array(kept.length);
      let cursor = 0;
      for (let bi = 0; bi < kept.length; bi++) {
        vertOffset[bi] = cursor;
        cursor += ringLens[bi];
      }

      for (let i = 0; i < kept.length; i += OSM_BUILDING_BATCH) {
        if (buildingsCancelled || viewer.isDestroyed()) return;
        const sliceStart = i;
        const slice = kept.slice(i, i + OSM_BUILDING_BATCH);
        const instances: Cesium.GeometryInstance[] = [];
        for (let s = 0; s < slice.length; s++) {
          const bi = sliceStart + s;
          const { b, id } = slice[s];
          const n = ringLens[bi];
          const off = vertOffset[bi];
          const h = Math.max(3.5, Math.min(45, b.heightM));

          if (useDem) {
            let maxG = -Infinity;
            const cartPositions: Cesium.Cartesian3[] = [];
            for (let vi = 0; vi < n; vi++) {
              const g = heightAt[off + vi];
              if (g > maxG) maxG = g;
              cartPositions.push(
                Cesium.Cartesian3.fromDegrees(
                  verts[off + vi].lon,
                  verts[off + vi].lat,
                  g + OSM_BLOCK_BASE_M,
                ),
              );
            }
            if (!Number.isFinite(maxG)) maxG = 0;
            cartPositions.push(cartPositions[0].clone());
            try {
              instances.push(
                new Cesium.GeometryInstance({
                  id,
                  geometry: new Cesium.PolygonGeometry({
                    polygonHierarchy: new Cesium.PolygonHierarchy(cartPositions),
                    perPositionHeight: true,
                    extrudedHeight: maxG + OSM_BLOCK_BASE_M + h,
                    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
                    arcType: Cesium.ArcType.NONE,
                  }),
                  attributes: {
                    color: Cesium.ColorGeometryInstanceAttribute.fromColor(roof),
                  },
                }),
              );
            } catch {
              /* skip bad rings */
            }
          } else {
            const positions: number[] = [];
            for (const p of b.ring) positions.push(p[0], p[1]);
            try {
              instances.push(
                new Cesium.GeometryInstance({
                  id,
                  geometry: new Cesium.PolygonGeometry({
                    polygonHierarchy: new Cesium.PolygonHierarchy(
                      Cesium.Cartesian3.fromDegreesArray(positions),
                    ),
                    height: OSM_BLOCK_BASE_M,
                    extrudedHeight: OSM_BLOCK_BASE_M + h,
                    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
                    arcType: Cesium.ArcType.GEODESIC,
                  }),
                  attributes: {
                    color: Cesium.ColorGeometryInstanceAttribute.fromColor(roof),
                  },
                }),
              );
            } catch {
              /* skip */
            }
          }
        }
        if (instances.length === 0) continue;
        const primitive = new Cesium.Primitive({
          geometryInstances: instances,
          appearance: new Cesium.PerInstanceColorAppearance({
            closed: true,
            translucent: false,
            flat: false,
          }),
          asynchronous: true,
          shadows: Cesium.ShadowMode.CAST_ONLY,
          compressVertices: true,
          cull: true,
          allowPicking:
            !placementModeRef.current || placementToolRef.current === "erase",
        });
        viewer.scene.primitives.add(primitive);
        primitive.show =
          buildingBlocksVisibleRef.current && !satelliteEnabledRef.current;
        buildingPrimitivesRef.current.push(primitive);
        viewer.scene.requestRender();
        await new Promise((r) => setTimeout(r, 0));
      }
      console.info(
        `[CesiumMap] Luisiana 3D blocks: ${kept.length} (removed ${removed.size}, terrain=${useDem})`,
      );
    };

    rebuildBuildingsRef.current = async () => {
      const fps = buildingFootprintsRef.current;
      if (!fps || viewer.isDestroyed()) return;
      await mountBuildingFootprints(fps);
    };

    (async () => {
      try {
        const footprints = await fetchLuisianaBuildings();
        if (buildingsCancelled || viewer.isDestroyed()) return;
        buildingFootprintsRef.current = footprints;
        await mountBuildingFootprints(footprints);
      } catch (err) {
        console.warn("[CesiumMap] Luisiana buildings failed:", err);
      }
    })();

    viewer.entities.add({
      id: "municipal-office",
      name: "Municipal Office",
      position: Cesium.Cartesian3.fromDegrees(MUNICIPAL_OFFICE.lon, MUNICIPAL_OFFICE.lat),
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString("#245c3a"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: "Municipal Office",
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    tiltedRef.current = true;
    setCameraHomeView(viewer.camera);

    viewerRef.current = viewer;
    loadedIdsRef.current.clear();
    setViewerReady((n) => n + 1);

    return () => {
      try {
        rebuildBuildingsRef.current = null;
        applyScopeRef.current = null;
        buildingFootprintsRef.current = null;
        buildingsCancelled = true;
        try {
          removeCamChanged();
        } catch {
          /* ignore */
        }
        try {
          removeCamMoveEnd();
        } catch {
          /* ignore */
        }
        try {
          removeKeepAbove();
        } catch {
          /* ignore */
        }
        try {
          removeKeepAboveMoveEnd();
        } catch {
          /* ignore */
        }
        try {
          removeMoveStart();
        } catch {
          /* ignore */
        }
        try {
          removeMoveEndSse();
        } catch {
          /* ignore */
        }
        for (const p of buildingPrimitivesRef.current) {
          try {
            if (!viewer.isDestroyed()) viewer.scene.primitives.remove(p);
          } catch {
            /* ignore */
          }
        }
        buildingPrimitivesRef.current = [];
        buildingMaterialRef.current = null;
        loadedIdsRef.current.clear();
        modelAttachedRef.current.clear();
        modelLoadingIdsRef.current.clear();
        modelLoadQueueRef.current = [];
        gibsImageryRef.current = null;
        satelliteImageryRef.current = null;
        osmBasemapRef.current = null;
        hazardOverlayLayersRef.current.clear();
        applySatelliteVisibilityRef.current = () => {};
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          try {
            viewerRef.current.destroy();
          } catch (err) {
            console.warn("[CesiumMap] viewer.destroy failed:", err);
          }
        }
      } catch (err) {
        console.warn("[CesiumMap] viewer cleanup failed:", err);
      } finally {
        viewerRef.current = null;
      }
    };
  }, [visible]);

  // ── Satellite overlay ────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;
    applySatelliteVisibilityRef.current();
  }, [satellite, viewerReady, gibs?.enabled]);

  // ── Official geohazard KMZ ground overlays (high-res leaf tiles) ─────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    let cancelled = false;
    const wanted = new Set<string>();
    if (hazardOverlays.eil2010) wanted.add("eil-2010");
    if (hazardOverlays.eq2014) wanted.add("eil-2014");
    if (hazardOverlays.gsh2014) wanted.add("gsh-2014");

    const styleLayer = (layer: Cesium.ImageryLayer) => {
      // High-res tiles: a bit more opaque than the old blurry overview, still translucent.
      layer.alpha = 0.48;
      layer.brightness = 1.2;
      layer.contrast = 1.1;
      layer.gamma = 0.92;
    };

    const removeOverlay = (id: string) => {
      const layers = hazardOverlayLayersRef.current.get(id);
      if (!layers) return;
      for (const layer of layers) {
        try {
          viewer.imageryLayers.remove(layer, false);
        } catch {
          /* ignore */
        }
      }
      hazardOverlayLayersRef.current.delete(id);
    };

    const sync = async () => {
      for (const meta of HAZARD_OVERLAYS) {
        if (cancelled || viewer.isDestroyed()) return;
        const existing = hazardOverlayLayersRef.current.get(meta.id);
        const on = wanted.has(meta.id);

        if (on && !existing) {
          try {
            const manifest = await loadHazardTilesManifest(meta);
            if (cancelled || viewer.isDestroyed()) return;
            if (!wanted.has(meta.id)) continue;
            if (hazardOverlayLayersRef.current.has(meta.id)) continue;

            const added: Cesium.ImageryLayer[] = [];
            const tiles =
              manifest?.tiles?.length
                ? manifest.tiles
                : [
                    {
                      url: meta.url,
                      rectangle: meta.rectangle,
                    },
                  ];

            for (const tile of tiles) {
              if (cancelled || viewer.isDestroyed()) break;
              const rect = Cesium.Rectangle.fromDegrees(
                tile.rectangle.west,
                tile.rectangle.south,
                tile.rectangle.east,
                tile.rectangle.north,
              );
              try {
                const provider = await Cesium.SingleTileImageryProvider.fromUrl(tile.url, {
                  rectangle: rect,
                  credit: meta.attribution,
                });
                if (cancelled || viewer.isDestroyed() || !wanted.has(meta.id)) break;
                const layer = viewer.imageryLayers.addImageryProvider(provider);
                styleLayer(layer);
                added.push(layer);
              } catch (tileErr) {
                console.warn(`Failed tile ${tile.url}:`, tileErr);
              }
            }

            if (added.length) {
              hazardOverlayLayersRef.current.set(meta.id, added);
            }
          } catch (err) {
            console.warn(`Failed to load hazard overlay ${meta.id}:`, err);
          }
        } else if (on && existing) {
          for (const layer of existing) {
            layer.show = true;
            styleLayer(layer);
            viewer.imageryLayers.raiseToTop(layer);
          }
        } else if (!on && existing) {
          removeOverlay(meta.id);
        }
      }

      if (!cancelled && !viewer.isDestroyed()) {
        if (gibsImageryRef.current) {
          viewer.imageryLayers.raiseToTop(gibsImageryRef.current);
        }
        viewer.scene.requestRender();
      }
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [viewerReady, hazardOverlays.eil2010, hazardOverlays.eq2014, hazardOverlays.gsh2014]);

  // ── 3D block visibility (Luisiana OSM extrusions) ────────────────────────
  useEffect(() => {
    // Hide gray OSM blocks while satellite is on (photoreal roofs from imagery).
    const show = buildingBlocksVisible && !satellite;
    for (const p of buildingPrimitivesRef.current) {
      p.show = show;
    }
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
  }, [buildingBlocksVisible, satellite, viewerReady]);

  // ── 3D Terrain (Ion World Terrain or ArcGIS elevation) ───────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    let cancelled = false;

    (async () => {
      if (!terrainEnabled) {
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        applyTerrainPerfSettings(viewer, false);
        // Ellipsoid collision is cheap — keep camera from going under the map.
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
        viewer.scene.requestRender();
        if (!cancelled) await rebuildBuildingsRef.current?.();
        return;
      }

      try {
        const provider = await createLuisianaTerrainProvider();
        if (cancelled || viewer.isDestroyed()) return;
        viewer.terrainProvider = provider;
        applyTerrainPerfSettings(viewer, true, {
          screenSpaceError: terrainQualityToSse(mapSettingsRef.current.terrainQuality),
          satelliteOn: satelliteEnabledRef.current,
        });
        // Keep terrain collision ON so the camera cannot dig under hills.
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = MIN_CAMERA_HEIGHT_M;
        viewer.scene.screenSpaceCameraController.minimumCollisionTerrainHeight =
          COLLISION_TERRAIN_HEIGHT_M;
        applyScopeRef.current?.();
        viewer.scene.requestRender();

        // Brief settle for DEM tiles — avoid 12s busy render loops (that caused hitching).
        const waitStart = Date.now();
        let frames = 0;
        while (
          !cancelled &&
          !viewer.isDestroyed() &&
          !viewer.scene.globe.tilesLoaded &&
          Date.now() - waitStart < 4000 &&
          frames < 12
        ) {
          viewer.scene.requestRender();
          frames++;
          await new Promise((r) => setTimeout(r, 300));
        }
        if (!cancelled && !viewer.isDestroyed() && !satelliteEnabledRef.current) {
          await rebuildBuildingsRef.current?.();
        }
        // One delayed rebuild once more tiles arrive — no continuous poll.
        await new Promise((r) => setTimeout(r, 1200));
        if (!cancelled && !viewer.isDestroyed() && !satelliteEnabledRef.current) {
          await rebuildBuildingsRef.current?.();
        }
        console.info("[CesiumMap] 3D terrain enabled (perf SSE)");
        applySatelliteVisibilityRef.current();
      } catch (err) {
        console.warn("[CesiumMap] terrain enable failed:", err);
        if (!cancelled && !viewer.isDestroyed()) {
          viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
          applyTerrainPerfSettings(viewer, false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [terrainEnabled, viewerReady]);

  // ── Map Settings (draw distance, terrain quality, shadows, fog) ───────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    if (terrainEnabled) {
      applyTerrainPerfSettings(viewer, true, {
        screenSpaceError: terrainQualityToSse(mapSettings.terrainQuality),
        satelliteOn: satelliteEnabledRef.current,
      });
    }
    applyScopeRef.current?.();

    // Shadow map quality preset (not tied to draw distance).
    applyCesiumShadowMap(viewer, mapSettings.shadowQuality);

    viewer.scene.requestRender();
  }, [mapSettings, terrainEnabled, viewerReady]);

  // ── Sync solar clock + light from hour + azimuth dial ────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const date = dateFromDisplaySolarHour(solarHour);
    viewer.clock.currentTime = Cesium.JulianDate.fromDate(date);
    viewer.clock.shouldAnimate = false;

    const astro = getSunPosition(LUISIANA_CENTER.lat, LUISIANA_CENTER.lon, date);
    const bearing =
      typeof sunAzimuthDeg === "number" && Number.isFinite(sunAzimuthDeg)
        ? ((sunAzimuthDeg % 360) + 360) % 360
        : undefined;

    const isDay = astro.isDaylight;
    viewer.shadows = isDay && mapSettingsRef.current.shadowsEnabled;
    // TIME slider → clock sun + procedural sky (no cubemap loads).
    applyCesiumAtmosphere(viewer, {
      isDay,
      satelliteHd: satelliteEnabledRef.current,
      solarHour,
      sunAltitudeRad: astro.altitudeRad,
      satelliteLayer: satelliteEnabledRef.current ? satelliteImageryRef.current : null,
    });

    const altDeg = (astro.altitudeRad * 180) / Math.PI;
    const dayIntensity = isDay ? 2.5 : Math.max(0.12, 0.14 + Math.max(0, altDeg + 6) * 0.04);

    // SunLight keeps the visible sun + sky in sync with the time slider.
    // Dial may override surface light during day for shadow direction.
    if (bearing != null && isDay) {
      const { east, north, up } = sunEnuFromAltitudeBearing(astro.altitudeRad, bearing);
      const origin = Cesium.Cartesian3.fromDegrees(LUISIANA_CENTER.lon, LUISIANA_CENTER.lat, 0);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
      const localTowardSun = new Cesium.Cartesian3(east, north, up);
      const worldTowardSun = Cesium.Matrix4.multiplyByPointAsVector(
        enu,
        localTowardSun,
        new Cesium.Cartesian3(),
      );
      Cesium.Cartesian3.normalize(worldTowardSun, worldTowardSun);
      const lightDir = Cesium.Cartesian3.negate(worldTowardSun, new Cesium.Cartesian3());

      viewer.scene.light = new Cesium.DirectionalLight({
        direction: lightDir,
        color: Cesium.Color.WHITE,
        intensity: dayIntensity,
      });
    } else {
      viewer.scene.light = new Cesium.SunLight({
        intensity: dayIntensity,
      });
    }

    viewer.scene.requestRender();
  }, [solarHour, sunAzimuthDeg, viewerReady, mapSettings.shadowsEnabled, satellite, terrainEnabled]);

  // Live DEM (+ optional satellite greenness) for the siting net.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady || !terrainEnabled) {
      registerTerrainSatSampler(null);
      return;
    }

    const dLat = 0.00018;
    const dLon = 0.00018;
    const offsets: Array<[number, number]> = [
      [0, 0],
      [dLon, 0],
      [-dLon, 0],
      [0, dLat],
      [0, -dLat],
    ];

    registerTerrainSatSampler(async (lon, lat) => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return null;
      const terrain = v.terrainProvider;
      if (terrain instanceof Cesium.EllipsoidTerrainProvider) return null;
      const cartos = offsets.map(([dx, dy]) => Cesium.Cartographic.fromDegrees(lon + dx, lat + dy));
      try {
        const sampled = await Cesium.sampleTerrainMostDetailed(terrain, cartos);
        const h = sampled.map((c) =>
          typeof c?.height === "number" && Number.isFinite(c.height) ? c.height : 0,
        );
        const elevation = h[0] ?? 0;
        const dzdx = ((h[1] ?? elevation) - (h[2] ?? elevation)) / (2 * 20);
        const dzdy = ((h[3] ?? elevation) - (h[4] ?? elevation)) / (2 * 20);
        const slope = Math.min(80, (Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180) / Math.PI);
        const aspect = ((Math.atan2(dzdx, dzdy) * 180) / Math.PI + 360) % 360;
        let greenness = 0.35;
        const sat = satelliteImageryRef.current;
        if (sat && satelliteEnabledRef.current) {
          // Steeper, higher ground is typically less canopy in this municipality.
          greenness = Math.max(0.05, Math.min(0.85, 0.55 - slope / 140 - Math.max(0, elevation - 250) / 1200));
        }
        const sample: TerrainSatSample = { elevation, slope, aspect, greenness };
        return sample;
      } catch {
        return null;
      }
    });

    return () => registerTerrainSatSampler(null);
  }, [viewerReady, terrainEnabled, satellite]);

  // ── NASA GIBS precip / climate WMTS overlay ──────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    const removeGibs = () => {
      if (gibsImageryRef.current) {
        try {
          viewer.imageryLayers.remove(gibsImageryRef.current, false);
        } catch {
          /* layer may already be gone */
        }
        gibsImageryRef.current = null;
      }
    };

    if (!gibs?.enabled) {
      removeGibs();
      return;
    }

    removeGibs();

    const provider = new Cesium.UrlTemplateImageryProvider({
      url: gibsWmtsTileUrl({ layer: gibs.layer, date: gibs.date }),
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      maximumLevel: gibsMaximumLevel(gibs.layer),
      tileWidth: 256,
      tileHeight: 256,
      credit: "NASA GIBS / Earthdata",
    });

    const layer = viewer.imageryLayers.addImageryProvider(provider);
    layer.alpha = Math.max(0, Math.min(1, gibs.opacity));
    layer.show = true;
    // Keep GIBS above basemap but below labels if any — raise to top of stack
    viewer.imageryLayers.raiseToTop(layer);
    gibsImageryRef.current = layer;

    return () => {
      if (!viewer.isDestroyed()) removeGibs();
    };
  }, [viewerReady, gibs?.enabled, gibs?.layer, gibs?.date, gibs?.opacity]);

  // ── GIBS hover readout (pixel → colormap value) ──────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    if (!gibs?.enabled) {
      setGibsHover(null);
      return;
    }

    const sampler = createGibsHoverSampler(200);
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    const canvas = viewer.scene.canvas;

    const clear = () => {
      sampler.cancel();
      setGibsHover(null);
    };

    handler.setInputAction((move: { endPosition: Cesium.Cartesian2 }) => {
      const g = gibsRef.current;
      if (!g?.enabled) {
        clear();
        return;
      }
      // Skip while model drag locks camera rotate/translate.
      const cam = viewer.scene.screenSpaceCameraController;
      if (!cam.enableRotate || !cam.enableTranslate) return;
      if (blockRemoverActiveRef.current) {
        clear();
        return;
      }

      const ll = pickGlobeLngLat(viewer, move.endPosition);
      if (!ll) {
        clear();
        return;
      }

      const screenX = move.endPosition.x;
      const screenY = move.endPosition.y;
      sampler.schedule(
        { layer: g.layer, date: g.date, lon: ll.lng, lat: ll.lat },
        (result: GibsSampleResult | null) => {
          if (!result) {
            setGibsHover(null);
            return;
          }
          setGibsHover({
            x: screenX,
            y: screenY,
            title: result.layerName,
            valueText: result.valueText,
          });
        },
      );
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    const onLeave = () => clear();
    canvas.addEventListener("mouseleave", onLeave);

    return () => {
      clear();
      canvas.removeEventListener("mouseleave", onLeave);
      handler.destroy();
    };
  }, [viewerReady, gibs?.enabled, gibs?.layer, gibs?.date]);

  // ── Unified entity hover (one scene.pick, throttled) ─────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    if (!tropicalEnabled) setHoveredTropical(null);
    if (!earthquakeEnabled) setHoveredQuake(null);

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    const canvas = viewer.scene.canvas;

    let lastKind: HoverHit["kind"] | null = null;
    let lastId: string | null = null;
    let lastTooltipX = 0;
    let lastTooltipY = 0;
    let lastPickAt = 0;
    let pendingPos: Cesium.Cartesian2 | null = null;
    let rafId = 0;

    const tropicalBasePx = (id: string) => {
      const system = tropicalSystemsRef.current.find((s) => s.id === id);
      return system?.stage === "invest" || system?.lpaWatch ? 14 : 18;
    };

    const clearTropicalVisual = (id: string) => {
      const ent = viewer.entities.getById(tropicalEntityId(id));
      if (ent?.point) ent.point.pixelSize = new Cesium.ConstantProperty(tropicalBasePx(id));
      if (ent?.label) ent.label.show = new Cesium.ConstantProperty(false);
    };

    const clearQuakeVisual = (id: string) => {
      const idx = Number(id);
      const cell = earthquakeGridRef.current[idx];
      const ent = viewer.entities.getById(quakeEntityId(idx));
      if (ent?.point && cell) {
        ent.point.pixelSize = new Cesium.ConstantProperty(
          quakePointSize(cell.cls, false, cell.source === "model"),
        );
      }
    };

    const clearProjectVisual = (id: string) => {
      const prev = projectsRef.current.find((proj) => proj.id === id);
      if (prev) applyProjectHoverVisual(viewer, prev, false);
    };

    const clearAllHover = (opts?: { render?: boolean }) => {
      const had = lastId != null || hoveredProjectIdRef.current != null;
      if (!had) return;
      if (lastKind === "tropical" && lastId) clearTropicalVisual(lastId);
      if (lastKind === "quake" && lastId) clearQuakeVisual(lastId);
      if (lastKind === "project" && lastId) clearProjectVisual(lastId);
      lastKind = null;
      lastId = null;
      hoveredProjectIdRef.current = null;
      setHoveredTropical(null);
      setHoveredQuake(null);
      setHoveredProject(null);
      if (
        !modelsFrozenRef.current &&
        canvas.style.cursor === "pointer"
      ) {
        canvas.style.cursor = "";
      }
      if (opts?.render !== false) viewer.scene.requestRender();
    };

    const applyHit = (hit: HoverHit, x: number, y: number) => {
      const idChanged = hit.kind !== lastKind || hit.id !== lastId;
      const posMoved =
        Math.abs(x - lastTooltipX) >= HOVER_POS_DELTA_PX ||
        Math.abs(y - lastTooltipY) >= HOVER_POS_DELTA_PX;

      if (idChanged) {
        if (lastKind === "tropical" && lastId) clearTropicalVisual(lastId);
        if (lastKind === "quake" && lastId) clearQuakeVisual(lastId);
        if (lastKind === "project" && lastId) clearProjectVisual(lastId);

        if (hit.kind === "tropical") {
          const ent = viewer.entities.getById(tropicalEntityId(hit.id));
          if (ent?.point) {
            ent.point.pixelSize = new Cesium.ConstantProperty(tropicalBasePx(hit.id) + 6);
          }
          if (ent?.label) ent.label.show = new Cesium.ConstantProperty(true);
          hoveredProjectIdRef.current = null;
          setHoveredProject(null);
          setHoveredQuake(null);
        } else if (hit.kind === "quake") {
          const idx = Number(hit.id);
          const cell = earthquakeGridRef.current[idx];
          const ent = viewer.entities.getById(quakeEntityId(idx));
          if (ent?.point && cell) {
            ent.point.pixelSize = new Cesium.ConstantProperty(
              quakePointSize(cell.cls, true, cell.source === "model"),
            );
          }
          hoveredProjectIdRef.current = null;
          setHoveredProject(null);
          setHoveredTropical(null);
        } else {
          const project = projectsRef.current.find((proj) => proj.id === hit.id);
          if (project) applyProjectHoverVisual(viewer, project, true);
          hoveredProjectIdRef.current = hit.id;
          setHoveredTropical(null);
          setHoveredQuake(null);
        }

        lastKind = hit.kind;
        lastId = hit.id;
        viewer.scene.requestRender();
      }

      if (!idChanged && !posMoved) return;

      lastTooltipX = x;
      lastTooltipY = y;
      canvas.style.cursor = "pointer";
      if (hit.kind === "tropical") {
        const system = tropicalSystemsRef.current.find((s) => s.id === hit.id);
        if (system) setHoveredTropical({ system, x, y });
      } else if (hit.kind === "quake") {
        const cell = earthquakeGridRef.current[Number(hit.id)];
        if (cell) setHoveredQuake({ cell, x, y });
      } else {
        const project = projectsRef.current.find((proj) => proj.id === hit.id);
        if (project) setHoveredProject({ project, x, y });
      }
    };

    const runPick = (screenPos: Cesium.Cartesian2) => {
      if (modelsFrozenRef.current) {
        clearAllHover();
        return;
      }
      if (freehandDrawingRef.current) return;

      const cam = viewer.scene.screenSpaceCameraController;
      if (!cam.enableRotate || !cam.enableTranslate) return;

      const hit = pickHoverHit(viewer, screenPos);
      if (
        editModeRef.current &&
        selectedIdRef.current &&
        (!hit || hit.kind !== "project" || hit.id !== selectedIdRef.current)
      ) {
        clearAllHover();
        return;
      }
      if (!hit) {
        clearAllHover();
        return;
      }
      if (hit.kind === "tropical") {
        if (!tropicalEnabled) {
          clearAllHover();
          return;
        }
      } else if (hit.kind === "quake") {
        if (!earthquakeEnabledRef.current) {
          clearAllHover();
          return;
        }
      } else {
        const project = projectsRef.current.find((proj) => proj.id === hit.id);
        if (!project) {
          clearAllHover();
          return;
        }
      }
      applyHit(hit, screenPos.x, screenPos.y);
    };

    handler.setInputAction((move: { endPosition: Cesium.Cartesian2 }) => {
      pendingPos = move.endPosition.clone();
      const now = performance.now();
      if (now - lastPickAt < HOVER_PICK_THROTTLE_MS) {
        if (!rafId) {
          rafId = window.requestAnimationFrame(() => {
            rafId = 0;
            lastPickAt = performance.now();
            if (pendingPos) runPick(pendingPos);
          });
        }
        return;
      }
      lastPickAt = now;
      runPick(move.endPosition);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    const onLeave = () => clearAllHover();
    canvas.addEventListener("mouseleave", onLeave);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      clearAllHover({ render: false });
      canvas.removeEventListener("mouseleave", onLeave);
      handler.destroy();
    };
  }, [viewerReady, tropicalEnabled, earthquakeEnabled]);

  // ── Tropical systems (Invest / TC) markers + track ───────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    const nextIds = new Set<string>();
    if (tropicalEnabled) {
      for (const system of tropicalSystems) {
        if (!Number.isFinite(system.lon) || !Number.isFinite(system.lat)) continue;
        nextIds.add(system.id);
        const color = parseHexColor(getTropicalColor(system));
        const icon = getTropicalIcon(system);
        const stageTitle = getTropicalStageMeta(system.stage).title;
        const labelText = `${icon} ${system.label}`;
        const position = Cesium.Cartesian3.fromDegrees(system.lon, system.lat);

        const eid = tropicalEntityId(system.id);
        let ent = viewer.entities.getById(eid);
        if (!ent) {
          ent = viewer.entities.add({
            id: eid,
            name: `${stageTitle} · ${system.intensityKt} kt`,
            position,
            point: {
              pixelSize: system.stage === "invest" || system.lpaWatch ? 14 : 18,
              color,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: labelText,
              font: "12px sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -18),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString("#0c121ce6"),
              backgroundPadding: new Cesium.Cartesian2(6, 4),
              scaleByDistance: new Cesium.NearFarScalar(5e3, 1.0, 8e5, 0.3),
              show: false,
            },
            description: formatTropicalInfo(system),
          });
        } else {
          ent.position = new Cesium.ConstantPositionProperty(position);
          if (ent.point) {
            ent.point.color = new Cesium.ConstantProperty(color);
            ent.point.pixelSize = new Cesium.ConstantProperty(
              system.stage === "invest" || system.lpaWatch ? 14 : 18,
            );
          }
          if (ent.label) {
            ent.label.text = new Cesium.ConstantProperty(labelText);
          }
          ent.description = new Cesium.ConstantProperty(formatTropicalInfo(system));
        }

        const trackId = tropicalTrackEntityId(system.id);
        const trackPts = system.track?.filter(
          (p) => Number.isFinite(p.lon) && Number.isFinite(p.lat),
        );
        if (trackPts && trackPts.length >= 2) {
          const positions = trackPts.flatMap((p) => [p.lon, p.lat]);
          const polylinePositions = Cesium.Cartesian3.fromDegreesArray(positions);
          let trackEnt = viewer.entities.getById(trackId);
          if (!trackEnt) {
            viewer.entities.add({
              id: trackId,
              name: `${system.label} track`,
              polyline: {
                positions: polylinePositions,
                width: 2,
                material: color.withAlpha(0.75),
                clampToGround: false,
                arcType: Cesium.ArcType.GEODESIC,
              },
            });
          } else if (trackEnt.polyline) {
            trackEnt.polyline.positions = new Cesium.ConstantProperty(polylinePositions);
            trackEnt.polyline.material = new Cesium.ColorMaterialProperty(color.withAlpha(0.75));
          }
        } else {
          const trackEnt = viewer.entities.getById(trackId);
          if (trackEnt) viewer.entities.remove(trackEnt);
        }
      }
    }

    for (const id of [...tropicalIdsRef.current]) {
      if (!nextIds.has(id)) {
        const ent = viewer.entities.getById(tropicalEntityId(id));
        if (ent) viewer.entities.remove(ent);
        const trackEnt = viewer.entities.getById(tropicalTrackEntityId(id));
        if (trackEnt) viewer.entities.remove(trackEnt);
      }
    }
    tropicalIdsRef.current = nextIds;

    if (!tropicalEnabled) {
      setSelectedTropicalId(null);
    } else {
      setSelectedTropicalId((prev) => (prev && !nextIds.has(prev) ? null : prev));
    }

    viewer.scene.requestRender();
  }, [viewerReady, tropicalEnabled, tropicalSystems]);

  // ── Earthquake-prone siting grid ─────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    const doomed: Cesium.Entity[] = [];
    for (const e of viewer.entities.values) {
      if (typeof e.id === "string" && e.id.startsWith("quake-")) doomed.push(e);
    }
    for (const e of doomed) viewer.entities.remove(e);

    if (!earthquakeEnabled || earthquakeGrid.length === 0) {
      setSelectedQuakeCell(null);
      viewer.scene.requestRender();
      return;
    }

    earthquakeGrid.forEach((cell, i) => {
      const position = Cesium.Cartesian3.fromDegrees(cell.lon, cell.lat);
      const color = Cesium.Color.fromCssColorString(classColor(cell.cls));
      viewer.entities.add({
        id: quakeEntityId(i),
        name: `Earthquake site ${cell.cls}`,
        position,
        point: {
          pixelSize: quakePointSize(cell.cls, false, cell.source === "model"),
          color: color.withAlpha(cell.source === "model" ? 0.72 : 0.92),
          outlineColor:
            cell.source === "model"
              ? Cesium.Color.fromCssColorString("#111111")
              : Cesium.Color.WHITE,
          outlineWidth: cell.source === "model" ? 2 : 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    });
    viewer.scene.requestRender();
  }, [viewerReady, earthquakeEnabled, earthquakeGrid]);

  useEffect(() => {
    if (!earthquakeEnabled || !selectedProject?.location) {
      setSiteQuakeScore(null);
      return;
    }
    let cancelled = false;
    void earthquakeProneModel
      .predictAt(selectedProject.location.lon, selectedProject.location.lat)
      .then((score) => {
        if (!cancelled) setSiteQuakeScore(score);
      })
      .catch(() => {
        if (!cancelled) setSiteQuakeScore(null);
      });
    return () => {
      cancelled = true;
    };
  }, [earthquakeEnabled, selectedProject?.id, selectedProject?.location.lat, selectedProject?.location.lon]);

  useEffect(() => {
    if (!earthquakeEnabled || !selectedQuakeCell) {
      setSelectedQuakeCompare(null);
      return;
    }
    let cancelled = false;
    void earthquakeProneModel
      .predictAt(selectedQuakeCell.lon, selectedQuakeCell.lat)
      .then((score) => {
        if (!cancelled) setSelectedQuakeCompare(score);
      })
      .catch(() => {
        if (!cancelled) setSelectedQuakeCompare(null);
      });
    return () => {
      cancelled = true;
    };
  }, [earthquakeEnabled, selectedQuakeCell?.lon, selectedQuakeCell?.lat]);

  // ── Sync project pins (lightweight). GLBs attach via distance LOD + cache. ─
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    const nextIds = new Set(
      projects.filter((p) => p?.location?.lon && p?.location?.lat).map((p) => p.id),
    );

    for (const id of [...loadedIdsRef.current]) {
      if (!nextIds.has(id)) {
        const eid = entityIdFor(id);
        const ent = viewer.entities.getById(eid);
        if (ent) viewer.entities.remove(ent);
        const line = viewer.entities.getById(`${eid}-sketch-line`);
        if (line) viewer.entities.remove(line);
        const poly = viewer.entities.getById(`${eid}-sketch-poly`);
        if (poly) viewer.entities.remove(poly);
        loadedIdsRef.current.delete(id);
        modelAttachedRef.current.delete(id);
        xformsRef.current.delete(id);
        if (selectedIdRef.current === id) {
          setSelectedId(null);
          setConfirmDelete(false);
          setEditOpen(false);
        }
      }
    }

    for (const p of projects) {
      if (!p?.location?.lon || !p?.location?.lat) continue;
      const xf = ensureXform(p);
      const eid = entityIdFor(p.id);
      const scale = modelScaleValue(p, xf.scaleMultiplier);
      let ent = viewer.entities.getById(eid);

      if (!ent) {
        const onGround = Math.abs(xf.heightM) < 1e-4;
        const position = onGround
          ? Cesium.Cartesian3.fromDegrees(xf.lon, xf.lat)
          : Cesium.Cartesian3.fromDegrees(xf.lon, xf.lat, xf.heightM);
        const heightRef = onGround
          ? Cesium.HeightReference.CLAMP_TO_GROUND
          : Cesium.HeightReference.RELATIVE_TO_GROUND;
        const heading = Cesium.Math.toRadians(-xf.rotationDeg);
        // Pin only — full GLB is attached later when the camera is nearby (cached),
        // unless this is an MPDC site marker (pin forever until Engineering places a model).
        const isSitePin = Boolean(p.siteMarkerOnly);
        const pinColor = p.markerColor || p.mapSketch?.color || (isSitePin ? "#c47a1a" : "#245c3a");
        ent = viewer.entities.add({
          id: eid,
          name: p.name,
          position,
          orientation: Cesium.Transforms.headingPitchRollQuaternion(
            position,
            new Cesium.HeadingPitchRoll(heading, 0, 0),
          ),
          // Pins/labels: no shadow caster overhead. GLB uses ModelGraphics.ENABLED.
          shadows: Cesium.ShadowMode.DISABLED,
          point: {
            pixelSize: isSitePin ? 16 : 10,
            color: Cesium.Color.fromCssColorString(pinColor),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: isSitePin ? 3 : 2,
            heightReference: heightRef,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            show: new Cesium.CallbackProperty(
              () => isSitePin || !modelAttachedRef.current.has(p.id),
              false,
            ),
          },
          label: {
            text: isSitePin ? `📌 ${p.name}` : p.name,
            font: isSitePin ? "bold 13px sans-serif" : "12px sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, isSitePin ? -22 : -18),
            heightReference: heightRef,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            show: new Cesium.CallbackProperty(
              () =>
                isSitePin ||
                selectedIdRef.current === p.id ||
                hoveredProjectIdRef.current === p.id ||
                !modelAttachedRef.current.has(p.id),
              false,
            ),
          },
        });
        loadedIdsRef.current.add(p.id);
      } else {
        applyEntityPose(ent, xf.lon, xf.lat, xf.rotationDeg, scale, xf.heightM);
        applySitePinChrome(ent, p, {
          isAttached: (id) => modelAttachedRef.current.has(id),
          isSelected: (id) => selectedIdRef.current === id,
          isHovered: (id) => hoveredProjectIdRef.current === id,
        });
        if (ent.point && (p.markerColor || p.mapSketch?.color)) {
          const c = p.markerColor || p.mapSketch?.color || "#245c3a";
          ent.point.color = new Cesium.ConstantProperty(Cesium.Color.fromCssColorString(c));
        }
      }
      syncProjectSketchEntities(viewer, p);
    }

    applyInfraClustersRef.current();
    viewer.scene.requestRender();
  }, [projects, viewerReady, ensureXform]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    const clearClusterEntities = () => {
      const doomed: Cesium.Entity[] = [];
      for (const e of viewer.entities.values) {
        if (typeof e.id === "string" && e.id.startsWith(CLUSTER_ID_PREFIX)) doomed.push(e);
      }
      for (const e of doomed) viewer.entities.remove(e);
    };

    const apply = () => {
      if (viewer.isDestroyed()) return;
      clearClusterEntities();
      const list = projectsRef.current.filter((p) => p?.location?.lon && p?.location?.lat);
      const height = viewer.camera.positionCartographic.height;
      const cell = clusteringEnabledRef.current ? clusterCellDeg(height) : null;

      const groups = new Map<string, Project[]>();
      if (cell) {
        for (const p of list) {
          const gx = Math.floor(p.location.lon / cell);
          const gy = Math.floor(p.location.lat / cell);
          const key = `${gx}:${gy}`;
          const arr = groups.get(key);
          if (arr) arr.push(p);
          else groups.set(key, [p]);
        }
      }

      const clusteredIds = new Set<string>();
      if (cell) {
        let i = 0;
        clusterMetaRef.current.clear();
        for (const members of groups.values()) {
          if (members.length < 2) continue;
          for (const p of members) clusteredIds.add(p.id);
          let lon = 0;
          let lat = 0;
          for (const p of members) {
            lon += p.location.lon;
            lat += p.location.lat;
          }
          lon /= members.length;
          lat /= members.length;
          const n = members.length;
          const cid = `${CLUSTER_ID_PREFIX}${i++}`;
          clusterMetaRef.current.set(cid, { lon, lat });
          viewer.entities.add({
            id: cid,
            name: `${n} infrastructure sites`,
            position: Cesium.Cartesian3.fromDegrees(lon, lat),
            point: {
              pixelSize: 18 + Math.min(14, n),
              color: Cesium.Color.fromCssColorString("#245c3a"),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 3,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: String(n),
              font: "bold 13px sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.fromCssColorString("#14331f"),
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              pixelOffset: new Cesium.Cartesian2(0, 0),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }
      } else {
        clusterMetaRef.current.clear();
      }

      for (const p of list) {
        const eid = entityIdFor(p.id);
        const ent = viewer.entities.getById(eid);
        const show = !clusteredIds.has(p.id);
        if (ent) ent.show = show;
        const line = viewer.entities.getById(`${eid}-sketch-line`);
        if (line) line.show = show;
        const poly = viewer.entities.getById(`${eid}-sketch-poly`);
        if (poly) poly.show = show;
      }
      viewer.scene.requestRender();
    };

    applyInfraClustersRef.current = apply;
    apply();
    const removeMoveEnd = viewer.camera.moveEnd.addEventListener(apply);
    return () => {
      try {
        removeMoveEnd();
      } catch {
        /* ignore */
      }
      applyInfraClustersRef.current = () => {};
      if (!viewer.isDestroyed()) clearClusterEntities();
    };
  }, [viewerReady]);

  // Live draft preview while drawing line / area
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    const draftId = "placement-draft-sketch";
    const ptsId = "placement-draft-points";
    const removeDraftEntities = () => {
      const doomed: Cesium.Entity[] = [];
      for (const e of viewer.entities.values) {
        const id = e.id;
        if (typeof id === "string" && id.startsWith("placement-draft")) doomed.push(e);
      }
      for (const e of doomed) viewer.entities.remove(e);
    };
    removeDraftEntities();

    if (!placementMode || sketchVertexCount < 1) {
      viewer.scene.requestRender();
      return;
    }

    const draft = sketchDraftRef.current;
    const color = Cesium.Color.fromCssColorString(placementColor || "#c47a1a");
    // Freehand line: stroke only while drawing; tip ball after release. Area: vertices + fill.
    if (placementTool === "area") {
      for (let i = 0; i < draft.length; i++) {
        viewer.entities.add({
          id: `${ptsId}-${i}`,
          position: Cesium.Cartesian3.fromDegrees(draft[i].lon, draft[i].lat),
          point: {
            pixelSize: 10,
            color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
    } else if (placementTool === "line" && showFreehandEndBall && draft.length >= 1) {
      const last = draft[draft.length - 1];
      viewer.entities.add({
        id: "placement-draft-endball",
        position: Cesium.Cartesian3.fromDegrees(last.lon, last.lat),
        point: {
          pixelSize: 16,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
    if (draft.length >= 2) {
      const positions = draft.map((c) => Cesium.Cartesian3.fromDegrees(c.lon, c.lat));
      viewer.entities.add({
        id: draftId,
        polyline: {
          positions:
            placementTool === "area" && draft.length >= 3
              ? [...positions, positions[0]]
              : positions,
          width: placementTool === "line" ? 4 : 3,
          material: color,
          clampToGround: true,
        },
      });
      if (placementTool === "area" && draft.length >= 3) {
        viewer.entities.add({
          id: `${draftId}-fill`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            material: color.withAlpha(0.22),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });
      }
    }

    viewer.scene.requestRender();
    return () => {
      if (viewer.isDestroyed()) return;
      removeDraftEntities();
    };
  }, [placementMode, placementTool, placementColor, sketchVertexCount, showFreehandEndBall, viewerReady]);

  // ── Distance LOD: attach/detach cached GLBs near the camera ──────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    let cancelled = false;

    const cameraDistanceTo = (lon: number, lat: number) => {
      const dest = Cesium.Cartesian3.fromDegrees(lon, lat);
      return Cesium.Cartesian3.distance(viewer.camera.positionWC, dest);
    };

    const detachModel = (projectId: string) => {
      const ent = viewer.entities.getById(entityIdFor(projectId));
      if (!ent) return;
      ent.model = undefined;
      ent.shadows = new Cesium.ConstantProperty(Cesium.ShadowMode.DISABLED);
      modelAttachedRef.current.delete(projectId);
      viewer.scene.requestRender();
    };

    const publishLoadUi = () => {
      const loadingIds = [...modelLoadingIdsRef.current];
      const remaining = loadingIds.length + modelLoadQueueRef.current.length;
      if (remaining <= 0) {
        setModelLoadUi({ active: false, label: "", remaining: 0 });
        return;
      }
      const currentId = loadingIds[0] ?? modelLoadQueueRef.current[0];
      const p = currentId
        ? projectsRef.current.find((x) => x.id === currentId)
        : undefined;
      setModelLoadUi({
        active: true,
        label: p?.name ? `Loading ${p.name}…` : "Loading 3D models…",
        remaining,
      });
    };

    const attachModel = async (projectId: string) => {
      if (
        cancelled ||
        modelAttachedRef.current.has(projectId) ||
        modelLoadingIdsRef.current.has(projectId)
      ) {
        return;
      }
      const p = projectsRef.current.find((x) => x.id === projectId);
      const xf = xformsRef.current.get(projectId);
      const ent = viewer.entities.getById(entityIdFor(projectId));
      if (!p || !xf || !ent) return;
      // MPDC site pins stay as map markers — never load a GLB here.
      if (p.siteMarkerOnly) return;

      modelLoadingIdsRef.current.add(projectId);
      publishLoadUi();

      try {
        const abs = absoluteAssetUrl(projectModelUrl(p));
        const uri = await getCachedGlbUrl(abs);
        if (cancelled || viewer.isDestroyed()) return;

        const dist = cameraDistanceTo(xf.lon, xf.lat);
        const force = selectedIdRef.current === projectId;
        if (!force && dist > MODEL_UNLOAD_DIST_M) return;

        const onGround = Math.abs(xf.heightM) < 1e-4;
        const heightRef = onGround
          ? Cesium.HeightReference.CLAMP_TO_GROUND
          : Cesium.HeightReference.RELATIVE_TO_GROUND;
        const scale = modelScaleValue(p, xf.scaleMultiplier);

        attachProjectGlbModel(ent, { uri, scale, heightReference: heightRef });
        applyEntityPose(ent, xf.lon, xf.lat, xf.rotationDeg, scale, xf.heightM);
        modelAttachedRef.current.add(projectId);
        viewer.scene.requestRender();
      } catch (err) {
        console.warn("[CesiumMap] model attach failed:", projectId, err);
        modelAttachedRef.current.delete(projectId);
      } finally {
        modelLoadingIdsRef.current.delete(projectId);
        publishLoadUi();
      }
    };

    const pumpQueue = () => {
      while (
        modelLoadBusyRef.current < MODEL_LOAD_CONCURRENCY &&
        modelLoadQueueRef.current.length > 0
      ) {
        const id = modelLoadQueueRef.current.shift()!;
        if (
          modelAttachedRef.current.has(id) ||
          modelLoadingIdsRef.current.has(id)
        ) {
          continue;
        }
        modelLoadBusyRef.current += 1;
        publishLoadUi();
        void attachModel(id).finally(() => {
          modelLoadBusyRef.current -= 1;
          publishLoadUi();
          if (!cancelled) pumpQueue();
        });
      }
      publishLoadUi();
    };

    const enqueue = (id: string) => {
      const p = projectsRef.current.find((x) => x.id === id);
      if (p?.siteMarkerOnly) return;
      if (modelAttachedRef.current.has(id)) return;
      if (modelLoadingIdsRef.current.has(id)) return;
      if (modelLoadQueueRef.current.includes(id)) return;
      modelLoadQueueRef.current.push(id);
      publishLoadUi();
      pumpQueue();
    };

    const reconcileLod = () => {
      if (cancelled || viewer.isDestroyed()) return;
      let changed = false;
      const ids = [...loadedIdsRef.current];
      for (const id of ids) {
        const p = projectsRef.current.find((x) => x.id === id);
        if (p?.siteMarkerOnly) {
          if (modelAttachedRef.current.has(id)) {
            detachModel(id);
            changed = true;
          }
          continue;
        }
        const xf = xformsRef.current.get(id);
        if (!xf) continue;
        const dist = cameraDistanceTo(xf.lon, xf.lat);
        const force = selectedIdRef.current === id;
        const attached = modelAttachedRef.current.has(id);

        if ((force || dist <= MODEL_LOAD_DIST_M) && !attached) {
          enqueue(id);
          changed = true;
        } else if (!force && dist >= MODEL_UNLOAD_DIST_M && attached) {
          // Don't unload while still decoding
          if (!modelLoadQueueRef.current.includes(id)) {
            detachModel(id);
            changed = true;
          }
        }
      }
      if (changed) viewer.scene.requestRender();
    };

    reconcileLod();
    lodReconcileRef.current = reconcileLod;
    const removeMove = viewer.camera.moveEnd.addEventListener(reconcileLod);
    const interval = window.setInterval(reconcileLod, 1500);

    return () => {
      cancelled = true;
      lodReconcileRef.current = null;
      window.clearInterval(interval);
      modelLoadQueueRef.current = [];
      modelLoadingIdsRef.current.clear();
      setModelLoadUi({ active: false, label: "", remaining: 0 });
      if (typeof removeMove === "function") removeMove();
    };
  }, [viewerReady, projects]);

  // Force-load GLB when user selects a project (even if camera is far).
  useEffect(() => {
    if (!selectedId || !viewerReady) return;
    lodReconcileRef.current?.();
  }, [selectedId, viewerReady]);

  const persistTransform = useCallback(async (projectId: string) => {
    const xf = xformsRef.current.get(projectId);
    if (!xf || !xf.dirty || xf.modelLocked) return;
    setTransformSaving(true);
    setTransformMessage(null);
    const patch: Partial<Project> = {
      location: { lat: xf.lat, lon: xf.lon },
      rotation: xf.rotationDeg,
      modelScale: xf.scaleMultiplier,
      modelHeight: xf.heightM,
    };
    try {
      try {
        await patchProject(projectId, patch);
      } catch (backendError) {
        try {
          await updateProjectInFirestore(projectId, patch);
        } catch {
          throw backendError;
        }
      }
      xf.dirty = false;
      xf.pendingSync = true;
      setTransformDirty(false);
      setTransformMessage("Position saved");
      window.setTimeout(() => setTransformMessage(null), 2200);
    } catch (err) {
      console.error("Failed to save 3D model transform:", err);
      setTransformMessage("Save failed");
    } finally {
      setTransformSaving(false);
    }
  }, []);

  const persistTransformRef = useRef(persistTransform);
  useEffect(() => {
    persistTransformRef.current = persistTransform;
  }, [persistTransform]);

  // ── Pointer interactions: select / move / rotate / scale / place ─────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    let moving = false;
    let rotating = false;
    let didDrag = false;
    let lastX = 0;
    let suppressClick = false;
    /** ~2 m at equator — skip near-duplicate freehand samples. */
    const FREEHAND_MIN_DEG2 = 4e-10;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      // Freehand draw: hold + drag (not click-to-connect vertices).
      if (placementModeRef.current && placementToolRef.current === "line") {
        const ll = pickGlobeLngLat(viewer, click.position);
        if (!ll) return;
        freehandDrawingRef.current = true;
        setShowFreehandEndBallRef.current(false);
        syncFreehandEndBall(viewer, false);
        const pt = { lon: ll.lng, lat: ll.lat };
        const draft = sketchDraftRef.current;
        // Continue existing stroke if already drawing; don't wipe on each press.
        if (draft.length === 0) {
          sketchDraftRef.current = [pt];
        } else {
          const last = draft[draft.length - 1];
          const dx = last.lon - pt.lon;
          const dy = last.lat - pt.lat;
          if (dx * dx + dy * dy >= FREEHAND_MIN_DEG2) draft.push(pt);
        }
        bumpSketchUiRef.current();
        syncFreehandDraftPreview(viewer);
        setCameraInteractive(viewer, false);
        return;
      }
      if (modelsFrozenRef.current || !editModeRef.current) return;
      if (!canEditModelsRef.current) return;
      const hitId = pickProjectId(viewer, click.position);
      const sel = selectedIdRef.current;
      if (!hitId || hitId !== sel) return;
      const xf = xformsRef.current.get(hitId);
      if (!xf || xf.modelLocked) return;
      moving = true;
      didDrag = false;
      setCameraInteractive(viewer, false);
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      if (modelsFrozenRef.current || !editModeRef.current) return;
      if (!canEditModelsRef.current) return;
      const hitId = pickProjectId(viewer, click.position);
      const sel = selectedIdRef.current;
      if (!hitId || hitId !== sel) return;
      const xf = xformsRef.current.get(hitId);
      if (!xf || xf.modelLocked) return;
      rotating = true;
      didDrag = false;
      lastX = click.position.x;
      setCameraInteractive(viewer, false);
    }, Cesium.ScreenSpaceEventType.RIGHT_DOWN);

    handler.setInputAction((move: { endPosition: Cesium.Cartesian2 }) => {
      if (freehandDrawingRef.current) {
        const ll = pickGlobeLngLat(viewer, move.endPosition);
        if (!ll) return;
        const draft = sketchDraftRef.current;
        const pt = { lon: ll.lng, lat: ll.lat };
        const last = draft[draft.length - 1];
        if (last) {
          const dx = last.lon - pt.lon;
          const dy = last.lat - pt.lat;
          if (dx * dx + dy * dy < FREEHAND_MIN_DEG2) return;
        }
        draft.push(pt);
        syncFreehandDraftPreview(viewer);
        if (draft.length % 12 === 0) bumpSketchUiRef.current();
        return;
      }

      if (modelsFrozenRef.current || !editModeRef.current) {
        moving = false;
        rotating = false;
        return;
      }

      const sel = selectedIdRef.current;
      if (!sel) return;
      const xf = xformsRef.current.get(sel);
      const p = projectsRef.current.find((x) => x.id === sel);
      if (!xf || !p || xf.modelLocked) return;
      const ent = viewer.entities.getById(entityIdFor(sel));
      if (!ent) return;

      if (moving) {
        const ll = pickGlobeLngLat(viewer, move.endPosition);
        if (!ll) return;
        xf.lon = ll.lng;
        xf.lat = ll.lat;
        xf.dirty = true;
        didDrag = true;
        applyEntityPose(ent, xf.lon, xf.lat, xf.rotationDeg, modelScaleValue(p, xf.scaleMultiplier), xf.heightM);
        viewer.scene.requestRender();
        setTransformDirty(true);
        setTransformMessage(null);
        bumpXform((n) => n + 1);
      } else if (rotating) {
        const dx = move.endPosition.x - lastX;
        lastX = move.endPosition.x;
        xf.rotationDeg = (xf.rotationDeg - dx * 0.5 + 3600) % 360;
        xf.dirty = true;
        didDrag = true;
        applyEntityPose(ent, xf.lon, xf.lat, xf.rotationDeg, modelScaleValue(p, xf.scaleMultiplier), xf.heightM);
        viewer.scene.requestRender();
        setTransformDirty(true);
        setTransformMessage(null);
        bumpXform((n) => n + 1);
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    const endDrag = () => {
      if (freehandDrawingRef.current) {
        freehandDrawingRef.current = false;
        setCameraInteractive(viewer, true);
        suppressClick = true;
        // Keep draft — save only when user presses Finish. Show tip ball on release.
        bumpSketchUiRef.current();
        syncFreehandDraftPreview(viewer);
        if (sketchDraftRef.current.length >= 1) {
          setShowFreehandEndBallRef.current(true);
          syncFreehandEndBall(viewer, true);
        }
        return;
      }
      const was = moving || rotating;
      const dragged = didDrag;
      moving = false;
      rotating = false;
      setCameraInteractive(viewer, true);
      if (was && dragged && selectedIdRef.current) {
        suppressClick = true;
        void persistTransformRef.current(selectedIdRef.current);
      }
    };

    handler.setInputAction(endDrag, Cesium.ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction(endDrag, Cesium.ScreenSpaceEventType.RIGHT_UP);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (moving || rotating) return;

      // Block remover: click an OSM extrusion to delete it (persisted locally).
      if (
        blockRemoverActiveRef.current &&
        (canEditModelsRef.current || placementToolRef.current === "erase")
      ) {
        const bldgId = pickOsmBuildingId(viewer, click.position);
        if (bldgId) {
          removedBlockIdsRef.current.add(bldgId);
          saveRemovedBlockIds(removedBlockIdsRef.current);
          setRemovedBlockCount(removedBlockIdsRef.current.size);
          void rebuildBuildingsRef.current?.();
          return;
        }
        // Erase tool: ignore globe clicks (don't drop a pin).
        if (placementToolRef.current === "erase") return;
      }

      if (placementModeRef.current) {
        if (placementToolRef.current === "erase") return;
        if (placementToolRef.current === "line") return;
        const ll = pickGlobeLngLat(viewer, click.position);
        if (!ll) return;
        const tool = placementToolRef.current;
        const color = placementColorRef.current || "#c47a1a";
        const pt = { lon: ll.lng, lat: ll.lat };

        if (tool === "pin") {
          const sketch = { kind: "pin" as const, color, coordinates: [pt] };
          if (onPlaceSketchRef.current) onPlaceSketchRef.current(sketch);
          else onPlaceClickRef.current?.({ lng: ll.lng, lat: ll.lat });
          sketchDraftRef.current = [];
          bumpSketchUiRef.current();
          return;
        }

        const draft = sketchDraftRef.current;
        const last = draft[draft.length - 1];
        if (
          last &&
          Math.abs(last.lon - pt.lon) < 1e-6 &&
          Math.abs(last.lat - pt.lat) < 1e-6
        ) {
          const min = tool === "area" ? 3 : 2;
          if (draft.length >= min) {
            const sketch = { kind: tool, color, coordinates: [...draft] };
            if (onPlaceSketchRef.current) onPlaceSketchRef.current(sketch);
            else {
              const first = draft[0];
              onPlaceClickRef.current?.({ lng: first.lon, lat: first.lat });
            }
            sketchDraftRef.current = [];
            bumpSketchUiRef.current();
          }
          return;
        }

        sketchDraftRef.current = [...draft, pt];
        bumpSketchUiRef.current();
        viewer.scene.requestRender();
        return;
      }

      const hitId = pickProjectId(viewer, click.position);
      if (editModeRef.current && selectedIdRef.current) {
        const sel = selectedIdRef.current;
        if (hitId && hitId !== sel) {
          viewer.selectedEntity = undefined;
          return;
        }
        if (!hitId) {
          setSelectedId(null);
          setSelectedTropicalId(null);
          setSelectedQuakeCell(null);
          setConfirmDelete(false);
          setEditOpen(false);
        }
        viewer.selectedEntity = undefined;
        return;
      }
      const tropicalHit = pickTropicalId(viewer, click.position);
      const pickedEnt = viewer.scene.pick(click.position);
      const pickedEid =
        Cesium.defined(pickedEnt) && (pickedEnt as { id?: Cesium.Entity }).id instanceof Cesium.Entity
          ? String(((pickedEnt as { id: Cesium.Entity }).id as Cesium.Entity).id)
          : "";
      const quakeHit = quakeIndexFromEntity(pickedEid);

      const clusterEnt = pickClusterEntity(viewer, click.position);
      if (clusterEnt) {
        const meta = clusterMetaRef.current.get(String(clusterEnt.id));
        if (meta) {
          const h = viewer.camera.positionCartographic.height;
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(meta.lon, meta.lat, Math.max(900, h * 0.35)),
            orientation: { heading: HOME_HEADING, pitch: HOME_PITCH, roll: 0 },
            duration: 0.9,
          });
        }
        return;
      }

      if (hitId) {
        setSelectedId(hitId);
        setSelectedTropicalId(null);
        setSelectedQuakeCell(null);
        setConfirmDelete(false);
        setEditOpen(false);
        setTransformDirty(Boolean(xformsRef.current.get(hitId)?.dirty));
      } else if (tropicalHit) {
        setSelectedId(null);
        setSelectedTropicalId(tropicalHit);
        setSelectedQuakeCell(null);
        setConfirmDelete(false);
        setEditOpen(false);
      } else if (quakeHit != null && earthquakeEnabledRef.current) {
        setSelectedId(null);
        setSelectedTropicalId(null);
        setSelectedQuakeCell(earthquakeGridRef.current[quakeHit] ?? null);
        setConfirmDelete(false);
        setEditOpen(false);
      } else {
        setSelectedId(null);
        setSelectedTropicalId(null);
        setSelectedQuakeCell(null);
        setConfirmDelete(false);
        setEditOpen(false);
      }
      viewer.selectedEntity = undefined;
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Native wheel — Cesium's WHEEL delta is often 0/undefined, which made scale only grow.
    const onWheel = (e: WheelEvent) => {
      if (modelsFrozenRef.current || !editModeRef.current) return;
      if (!canEditModelsRef.current) return;
      const sel = selectedIdRef.current;
      if (!sel) return;
      const xf = xformsRef.current.get(sel);
      const p = projectsRef.current.find((x) => x.id === sel);
      if (!xf || !p || xf.modelLocked) return;

      e.preventDefault();
      e.stopPropagation();

      // deltaY < 0 = scroll up → grow; deltaY > 0 = scroll down → shrink
      // Hold Shift for finer steps, Ctrl for coarse (big GLBs that need a lot of shrink).
      const grow = e.deltaY < 0;
      const step = e.ctrlKey || e.metaKey ? 1.35 : e.shiftKey ? 1.03 : 1.12;
      const factor = grow ? step : 1 / step;
      xf.scaleMultiplier = Math.max(
        SCALE_MULT_MIN,
        Math.min(SCALE_MULT_MAX, xf.scaleMultiplier * factor),
      );
      xf.dirty = true;
      const ent = viewer.entities.getById(entityIdFor(sel));
      if (ent) {
        applyEntityPose(ent, xf.lon, xf.lat, xf.rotationDeg, modelScaleValue(p, xf.scaleMultiplier), xf.heightM);
        viewer.scene.requestRender();
      }
      setTransformDirty(true);
      setTransformMessage(null);
      bumpXform((n) => n + 1);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void persistTransformRef.current(sel);
      }, 450);
    };
    viewer.canvas.addEventListener("wheel", onWheel, { passive: false });

    // Block browser context menu on right-drag rotate
    const onContextMenu = (e: Event) => {
      if (selectedIdRef.current && canEditModelsRef.current) e.preventDefault();
    };
    viewer.canvas.addEventListener("contextmenu", onContextMenu);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        setSelectedTropicalId(null);
        setConfirmDelete(false);
        setEditOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      handler.destroy();
      setCameraInteractive(viewer, true);
      viewer.canvas.removeEventListener("wheel", onWheel);
      viewer.canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;
    viewer.canvas.style.cursor = placementMode
      ? "crosshair"
      : blockRemoverActive
        ? "cell"
        : "";
    if (placementMode || blockRemoverActive) {
      if (hoveredProjectIdRef.current) {
        const prev = projectsRef.current.find((p) => p.id === hoveredProjectIdRef.current);
        if (prev) applyProjectHoverVisual(viewer, prev, false);
        hoveredProjectIdRef.current = null;
      }
      setHoveredProject(null);
      setHoveredTropical(null);
      setHoveredQuake(null);
      setSelectedId(null);
      setSelectedTropicalId(null);
      setSelectedQuakeCell(null);
      setConfirmDelete(false);
      setEditOpen(false);
      viewer.selectedEntity = undefined;
    }
    return () => {
      if (!viewer.isDestroyed()) viewer.canvas.style.cursor = "";
    };
  }, [placementMode, blockRemoverActive, placementTool, viewerReady]);

  // While an unlocked model is selected, scroll scales it instead of zooming the camera.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;
    const xf = selectedId ? xformsRef.current.get(selectedId) : undefined;
    const scaleMode = Boolean(
      selectedId &&
        canEditModels &&
        editMode &&
        xf &&
        !xf.modelLocked &&
        !modelsFrozen,
    );
    viewer.scene.screenSpaceCameraController.enableZoom = !scaleMode;
    return () => {
      if (!viewer.isDestroyed()) {
        viewer.scene.screenSpaceCameraController.enableZoom = true;
      }
    };
  }, [selectedId, canEditModels, editMode, viewerReady, transformDirty, transformMessage, modelsFrozen]);

  useEffect(() => {
    setConfirmStartBuild(Boolean(canPromoteSitePin && selectedProject?.siteMarkerOnly));
  }, [canPromoteSitePin, selectedProject?.id, selectedProject?.siteMarkerOnly]);

  async function handleStartConstruction() {
    if (!selectedId || !canPromoteSitePin) return;
    const current = projectsRef.current.find((p) => p.id === selectedId);
    if (!current?.siteMarkerOnly) return;
    setStartBuildBusy(true);
    const patch: Partial<Project> = {
      siteMarkerOnly: false,
      modelType: "construction",
      modelLocked: false,
      status: "Ongoing",
      lifecyclePhase: "Construction",
    };
    try {
      try {
        await patchProject(selectedId, patch);
        void updateProjectInFirestore(selectedId, patch).catch(() => {});
      } catch (backendError) {
        try {
          await updateProjectInFirestore(selectedId, patch);
        } catch {
          throw backendError;
        }
      }
      const nextProject: Project = { ...current, ...patch };
      projectsRef.current = projectsRef.current.map((p) =>
        p.id === selectedId ? nextProject : p,
      );
      const xf = xformsRef.current.get(selectedId);
      if (xf) {
        xf.modelLocked = false;
        xf.dirty = false;
      }
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        const ent = viewer.entities.getById(entityIdFor(selectedId));
        if (ent) {
          applySitePinChrome(ent, nextProject, {
            isAttached: (id) => modelAttachedRef.current.has(id),
            isSelected: (id) => selectedIdRef.current === id,
            isHovered: (id) => hoveredProjectIdRef.current === id,
          });
          if (xf) {
            applyEntityPose(
              ent,
              xf.lon,
              xf.lat,
              xf.rotationDeg,
              modelScaleValue(nextProject, xf.scaleMultiplier),
              xf.heightM,
            );
          }
        }
      }
      onProjectPatch?.(selectedId, patch);
      setConfirmStartBuild(false);
      lodReconcileRef.current?.();
      bumpXform((n) => n + 1);
      void writeAudit({
        action: "project.startConstruction",
        category: "project",
        summary: `Started Under Construction model for “${current.name}”`,
        entityType: "project",
        entityId: selectedId,
        entityName: current.name,
      });
    } catch (err) {
      console.error("Failed to start construction model:", err);
      window.alert("Hindi naisimulan ang construction model. Subukan ulit.");
    } finally {
      setStartBuildBusy(false);
    }
  }

  async function handleToggleLock() {
    if (!selectedId || !canEditModels || !editMode) return;
    const xf = xformsRef.current.get(selectedId);
    if (!xf) return;
    if (!xf.modelLocked && xf.dirty) {
      await persistTransform(selectedId);
    }
    const next = !xf.modelLocked;
    setTransformSaving(true);
    try {
      try {
        await patchProject(selectedId, { modelLocked: next });
      } catch (backendError) {
        try {
          await updateProjectInFirestore(selectedId, { modelLocked: next });
        } catch {
          throw backendError;
        }
      }
      xf.modelLocked = next;
      if (next) {
        xf.dirty = false;
        setTransformDirty(false);
        setTransformMessage("Locked");
      } else {
        setTransformMessage("Unlocked");
      }
      window.setTimeout(() => setTransformMessage(null), 2200);
      bumpXform((n) => n + 1);
    } catch (err) {
      console.error("Failed to toggle model lock:", err);
      setTransformMessage("Lock failed");
    } finally {
      setTransformSaving(false);
    }
  }

  function openEdit() {
    if (!selectedProject || !canEditModels) return;
    setEditDraft({
      name: selectedProject.name,
      status: selectedProject.status,
      progress: selectedProject.progress,
      description: selectedProject.description ?? "",
      startDate: selectedProject.startDate ?? "",
      targetEndDate: selectedProject.targetEndDate ?? "",
      budgetTotal: selectedProject.budgetTotal != null ? String(selectedProject.budgetTotal) : "",
      budgetSpent: selectedProject.budgetSpent != null ? String(selectedProject.budgetSpent) : "0",
      markerColor: selectedProject.markerColor || selectedProject.mapSketch?.color || MAP_SKETCH_COLORS[0],
      barangay: selectedProject.barangay ?? "",
      officialUrl: selectedProject.officialUrl ?? "",
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selectedId || !editDraft) return;
    setEditSaving(true);
    try {
      const patch: Parameters<typeof patchProject>[1] = {
        name: editDraft.name.trim() || undefined,
        status: editDraft.status,
        progress: editDraft.progress,
        description: editDraft.description,
        startDate: editDraft.startDate || null,
        targetEndDate: editDraft.targetEndDate || null,
        budgetTotal: editDraft.budgetTotal ? Number(editDraft.budgetTotal) : null,
        budgetSpent: editDraft.budgetSpent ? Number(editDraft.budgetSpent) : 0,
        markerColor: editDraft.markerColor || undefined,
        barangay: editDraft.barangay || undefined,
        officialUrl: editDraft.officialUrl.trim(),
      };
      // Keep mapSketch.color in sync so the color persists after a page reload.
      const currentProject = projectsRef.current.find((p) => p.id === selectedId);
      if (currentProject?.mapSketch && editDraft.markerColor) {
        (patch as Record<string, unknown>)["mapSketch"] = {
          ...currentProject.mapSketch,
          color: editDraft.markerColor,
        };
      }
      try {
        await patchProject(selectedId, patch);
      } catch {
        await updateProjectInFirestore(selectedId, patch);
      }
      onProjectPatch?.(selectedId, patch);
      // Reflect new color + label on the Cesium entity immediately (no page reload needed).
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        const ent = viewer.entities.getById(entityIdFor(selectedId));
        if (ent) {
          if (ent.point && editDraft.markerColor) {
            ent.point.color = new Cesium.ConstantProperty(
              Cesium.Color.fromCssColorString(editDraft.markerColor),
            );
          }
          if (ent.label && editDraft.name.trim()) {
            const isSitePin = Boolean(currentProject?.siteMarkerOnly);
            (ent.label as Cesium.LabelGraphics).text = new Cesium.ConstantProperty(
              isSitePin ? `📌 ${editDraft.name.trim()}` : editDraft.name.trim(),
            );
          }
          viewer.scene.requestRender();
        }
      }
      setEditOpen(false);
      setEditDraft(null);
    } catch (err) {
      console.error("Failed to save project:", err);
      alert("Failed to save project details.");
    } finally {
      setEditSaving(false);
    }
  }

  function flyToSelected() {
    const viewer = viewerRef.current;
    if (!viewer || !selectedId) return;
    const xf = xformsRef.current.get(selectedId);
    const p = projects.find((x) => x.id === selectedId);
    if (!xf && !p) return;
    const lon = xf?.lon ?? p!.location.lon;
    const lat = xf?.lat ?? p!.location.lat;
    const ent = viewer.entities.getById(entityIdFor(selectedId));
    const scale = Math.max(0.5, xf?.scaleMultiplier ?? p?.modelScale ?? 1);
    flyCameraToProjectTarget(viewer, lon, lat, {
      entity: ent,
      rangeM: Math.max(90, 160 * scale),
      duration: 0.95,
    });
  }

  function commitLocalPose(projectId: string, next: Partial<LocalXform>, autoSave = false) {
    const xf = xformsRef.current.get(projectId);
    const p = projectsRef.current.find((x) => x.id === projectId);
    const viewer = viewerRef.current;
    if (!xf || !p || xf.modelLocked || !canEditModels || !editMode) return;
    Object.assign(xf, next);
    xf.dirty = true;
    const ent = viewer && !viewer.isDestroyed() ? viewer.entities.getById(entityIdFor(projectId)) : undefined;
    if (ent) {
      applyEntityPose(ent, xf.lon, xf.lat, xf.rotationDeg, modelScaleValue(p, xf.scaleMultiplier), xf.heightM);
      viewer?.scene.requestRender();
    }
    setTransformDirty(true);
    setTransformMessage(null);
    bumpXform((n) => n + 1);
    if (autoSave) {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void persistTransformRef.current(projectId);
      }, 400);
    }
  }

  function nudgeSelected(eastM: number, northM: number, upM: number) {
    if (!editMode || !selectedId || !selectedXform) return;
    const moved = offsetLngLatMeters(selectedXform.lon, selectedXform.lat, eastM, northM);
    commitLocalPose(
      selectedId,
      {
        lon: moved.lon,
        lat: moved.lat,
        // Keep Z at ground unless engineer explicitly nudges height
        heightM: Math.max(-50, Math.min(500, selectedXform.heightM + upM)),
      },
      true,
    );
  }

  const locked = Boolean(selectedXform?.modelLocked ?? selectedProject?.modelLocked);

  useEffect(() => {
    const chrome = pickChromeRef.current;
    const hud = hudRef.current;
    if (!chrome) return;
    if (!hud) {
      chrome.style.removeProperty("--pick-hud-offset");
      return;
    }
    const apply = () => {
      const h = Math.ceil(hud.getBoundingClientRect().height);
      chrome.style.setProperty("--pick-hud-offset", `${h + 10}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(hud);
    return () => {
      ro.disconnect();
      chrome.style.removeProperty("--pick-hud-offset");
    };
  }, [
    selectedProject?.id,
    hudCollapsed,
    locked,
    confirmDelete,
    canEditModels,
    selectedProject?.siteMarkerOnly,
    confirmStartBuild,
    startBuildBusy,
    transformDirty,
    transformMessage,
    transformSaving,
  ]);

  const panelProject =
    selectedProject && selectedXform
      ? {
          ...selectedProject,
          location: { lat: selectedXform.lat, lon: selectedXform.lon },
          rotation: selectedXform.rotationDeg,
          modelScale: selectedXform.scaleMultiplier,
          modelHeight: selectedXform.heightM,
          modelLocked: selectedXform.modelLocked,
        }
      : selectedProject;

  const selectedTropicalSystem =
    selectedTropicalId && tropicalEnabled
      ? tropicalSystems.find((s) => s.id === selectedTropicalId) ?? null
      : null;

  if (!visible) return null;

  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
        }}
      >
        <div
          ref={containerRef}
          className="cesium-map"
          style={{
            position: "absolute",
            inset: 0,
            cursor: placementMode ? "crosshair" : blockRemoverActive ? "cell" : undefined,
          }}
        />
        {gibsHover && gibs?.enabled && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: "absolute",
              left: Math.min(gibsHover.x + 14, (containerRef.current?.clientWidth ?? 320) - 160),
              top: Math.max(8, gibsHover.y - 44),
              pointerEvents: "none",
              zIndex: 5,
              maxWidth: 220,
              padding: "6px 10px",
              borderRadius: 2,
              background: "rgba(12, 18, 28, 0.92)",
              color: "#f4f6f8",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow: "2px 2px 0 rgba(0,0,0,0.35)",
              fontSize: 12,
              lineHeight: 1.35,
            }}
          >
            <div style={{ fontWeight: 700, opacity: 0.85, marginBottom: 2 }}>{gibsHover.title}</div>
            <div style={{ fontWeight: 600 }}>{gibsHover.valueText}</div>
          </div>
        )}
        {hoveredQuake && earthquakeEnabled && !modelsFrozen && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: "absolute",
              left: Math.min(
                hoveredQuake.x + 14,
                (containerRef.current?.clientWidth ?? 360) - 260,
              ),
              top: Math.min(
                hoveredQuake.y + 14,
                (containerRef.current?.clientHeight ?? 400) - 130,
              ),
              pointerEvents: "none",
              zIndex: 14,
              width: 240,
              maxWidth: "min(240px, calc(100% - 24px))",
              padding: "10px 12px",
              background: "rgba(12, 18, 28, 0.95)",
              border: `2px solid ${classColor(hoveredQuake.cell.cls)}`,
              boxShadow: "3px 3px 0 rgba(0,0,0,0.4)",
              color: "#f4f6f8",
              fontSize: 12,
              lineHeight: 1.35,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4, color: classColor(hoveredQuake.cell.cls) }}>
              Earthquake site: {hoveredQuake.cell.cls}
            </div>
            <div style={{ opacity: 0.85, marginBottom: 6 }}>
              {hoveredQuake.cell.source === "model" ? "Model prediction" : "PHIVOLCS EIL 2014"}
              {" — "}
              {classAdvice(hoveredQuake.cell.cls)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
              <span style={{ opacity: 0.7 }}>EIL</span>
              <span style={{ fontWeight: 600 }}>{hoveredQuake.cell.eilClass}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, marginTop: 2 }}>
              <span style={{ opacity: 0.7 }}>Shaking</span>
              <span style={{ fontWeight: 600 }}>PEIS {hoveredQuake.cell.shakeClass.toUpperCase()}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, opacity: 0.55 }}>
              {hoveredQuake.cell.lat.toFixed(5)}, {hoveredQuake.cell.lon.toFixed(5)}
            </div>
          </div>
        )}
        {hoveredTropical && tropicalEnabled && !modelsFrozen && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: "absolute",
              left: Math.min(
                hoveredTropical.x + 14,
                (containerRef.current?.clientWidth ?? 360) - 280,
              ),
              top: Math.min(
                hoveredTropical.y + 14,
                (containerRef.current?.clientHeight ?? 400) - 140,
              ),
              pointerEvents: "none",
              zIndex: 14,
              width: 280,
              maxWidth: "min(280px, calc(100% - 24px))",
              padding: "10px 12px",
              background: "rgba(12, 18, 28, 0.95)",
              border: `2px solid ${getTropicalColor(hoveredTropical.system)}`,
              boxShadow: "3px 3px 0 rgba(0,0,0,0.4)",
              color: "#f4f6f8",
              fontSize: 12,
              lineHeight: 1.35,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
              <span style={{ fontSize: 18, color: getTropicalColor(hoveredTropical.system) }}>
                {getTropicalIcon(hoveredTropical.system)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{hoveredTropical.system.label}</div>
                <div style={{ opacity: 0.8, fontSize: 11 }}>
                  {getTropicalStageMeta(hoveredTropical.system.stage).title}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
              <span style={{ opacity: 0.7 }}>Intensity</span>
              <span style={{ fontWeight: 700 }}>{hoveredTropical.system.intensityKt} kt</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, marginTop: 2 }}>
              <span style={{ opacity: 0.7 }}>Position</span>
              <span style={{ fontWeight: 600 }}>
                {hoveredTropical.system.lat.toFixed(1)}°, {hoveredTropical.system.lon.toFixed(1)}°
              </span>
            </div>
            {hoveredTropical.system.lpaWatch && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#f0a030", fontWeight: 600 }}>
                LPA-watch (PH AOI Invest)
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 10, opacity: 0.55 }}>Click for details</div>
          </div>
        )}
        {hoveredProject && !modelsFrozen && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: "absolute",
              left: Math.min(
                hoveredProject.x + 14,
                (containerRef.current?.clientWidth ?? 360) - 260,
              ),
              top: Math.min(
                hoveredProject.y + 14,
                (containerRef.current?.clientHeight ?? 400) - 130,
              ),
              pointerEvents: "none",
              zIndex: 14,
              width: 250,
              maxWidth: "min(250px, calc(100% - 24px))",
              padding: "10px 12px",
              background: "rgba(12, 18, 28, 0.95)",
              border: `2px solid ${
                hoveredProject.project.siteMarkerOnly
                  ? hoveredProject.project.markerColor ||
                    hoveredProject.project.mapSketch?.color ||
                    "#c47a1a"
                  : statusColor(hoveredProject.project.status)
              }`,
              boxShadow: "3px 3px 0 rgba(0,0,0,0.4)",
              color: "#f4f6f8",
              fontSize: 12,
              lineHeight: 1.35,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{hoveredProject.project.name}</div>
            <div style={{ opacity: 0.8, fontSize: 11, marginBottom: 6 }}>
              {hoveredProject.project.siteMarkerOnly
                ? "Pinned site"
                : MODEL_CATALOG.find((m) => m.type === hoveredProject.project.modelType)?.label ??
                  hoveredProject.project.type}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
              <span style={{ opacity: 0.7 }}>Status</span>
              <span style={{ fontWeight: 700, color: statusColor(hoveredProject.project.status) }}>
                {statusLabel(hoveredProject.project.status)}
              </span>
            </div>
            {!hoveredProject.project.siteMarkerOnly && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, marginTop: 2 }}>
                <span style={{ opacity: 0.7 }}>Progress</span>
                <span style={{ fontWeight: 700 }}>{hoveredProject.project.progress}%</span>
              </div>
            )}
            {hoveredProject.project.barangay && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, marginTop: 2 }}>
                <span style={{ opacity: 0.7 }}>Barangay</span>
                <span style={{ fontWeight: 600 }}>{hoveredProject.project.barangay}</span>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 10, opacity: 0.55 }}>Click for details</div>
          </div>
        )}
      </div>

      {modelLoadUi.active && (
        <div
          className="cesium-model-loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="cesium-model-loading-card">
            <div className="cesium-model-loading-spinner" aria-hidden />
            <div className="cesium-model-loading-copy">
              <div className="cesium-model-loading-title">{modelLoadUi.label}</div>
              <div className="cesium-model-loading-sub">
                {modelLoadUi.remaining > 1
                  ? `${modelLoadUi.remaining} models in queue · cached after first load`
                  : "Cached after first load · please wait"}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedTropicalSystem && !modelsFrozen && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 12,
            width: 300,
            maxWidth: "min(300px, calc(100% - 32px))",
            padding: 12,
            background: "rgba(12, 18, 28, 0.94)",
            border: `1px solid ${getTropicalColor(selectedTropicalSystem)}66`,
            boxShadow: "3px 3px 0 rgba(0,0,0,0.35)",
            color: "#f4f6f8",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 18, color: getTropicalColor(selectedTropicalSystem) }}>
              {getTropicalIcon(selectedTropicalSystem)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{selectedTropicalSystem.label}</div>
              <div
                style={{
                  color: getTropicalColor(selectedTropicalSystem),
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {getTropicalStageMeta(selectedTropicalSystem.stage).title}
                {selectedTropicalSystem.lpaWatch ? " · LPA-watch" : ""}
              </div>
              <div style={{ opacity: 0.8, fontSize: 11, marginBottom: 8 }}>
                <div>Intensity: {selectedTropicalSystem.intensityKt} kt</div>
                <div>
                  Position: {selectedTropicalSystem.lat.toFixed(1)}°,{" "}
                  {selectedTropicalSystem.lon.toFixed(1)}°
                </div>
                <div>Observed: {new Date(selectedTropicalSystem.observedAt).toLocaleString()}</div>
                <div>Track points: {selectedTropicalSystem.track?.length ?? 0}</div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {selectedTropicalSystem.sourceUrl && (
                  <a
                    href={selectedTropicalSystem.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#9ad0ff", fontWeight: 600 }}
                  >
                    RAMMB source
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedTropicalId(null)}
                  style={{
                    marginLeft: "auto",
                    cursor: "pointer",
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    color: "#fff",
                    padding: "2px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedQuakeCell && earthquakeEnabled && !modelsFrozen && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 12,
            width: 280,
            maxWidth: "min(280px, calc(100% - 32px))",
            padding: 12,
            background: "rgba(12, 18, 28, 0.94)",
            border: `1px solid ${classColor(selectedQuakeCell.cls)}66`,
            boxShadow: "3px 3px 0 rgba(0,0,0,0.35)",
            color: "#f4f6f8",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Earthquake site</div>
          {selectedQuakeCompare ? (
            <DualQuakeSummary score={selectedQuakeCompare} />
          ) : (
            <>
          <div style={{ opacity: 0.85, marginBottom: 6 }}>
            {selectedQuakeCell.source === "model" ? "Model prediction" : "PHIVOLCS EIL 2014"}
            {" — "}
            {classAdvice(selectedQuakeCell.cls)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            <div>Ground shaking: PEIS {selectedQuakeCell.shakeClass.toUpperCase()}</div>
            <div>EIL (slope failure): {selectedQuakeCell.eilClass}</div>
            <div>Confidence: {Math.round(selectedQuakeCell.confidence * 100)}%</div>
          </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setSelectedQuakeCell(null)}
            style={{
              marginTop: 10,
              cursor: "pointer",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff",
              padding: "2px 10px",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Close
          </button>
        </div>
      )}

      <div
        ref={pickChromeRef}
        className={`cesium-pick-chrome${selectedProject && !modelsFrozen ? " has-hud" : ""}`}
      >
      {panelProject && !modelsFrozen && !editMode && (
        <PlaceSidePanel
          project={panelProject}
          onFlyHere={flyToSelected}
          readOnly={readOnly || !canManipulateModels}
          canAddPhotos={canAddPhotos}
          onPhotosChange={onPhotosChange}
          onClose={() => {
            setSelectedId(null);
            setConfirmDelete(false);
            setEditOpen(false);
          }}
          onEdit={canEditModels ? openEdit : undefined}
          onToggleLock={
            editMode && canEditModels && !panelProject.siteMarkerOnly
              ? () => void handleToggleLock()
              : undefined
          }
          canPromoteSitePin={canPromoteSitePin}
          startConstructionBusy={startBuildBusy}
          onStartConstruction={
            canPromoteSitePin && panelProject.siteMarkerOnly
              ? () => void handleStartConstruction()
              : undefined
          }
          earthquakeScore={earthquakeEnabled ? siteQuakeScore : null}
        />
      )}

      {selectedProject && !modelsFrozen && (
        <div
          ref={hudRef}
          className={`project-pick-hud${hudCollapsed ? " is-collapsed" : ""}`}
        >
          <div className="project-pick-hud-head">
            <div
              className="project-pick-hud-dot"
              style={{ background: statusColor(selectedProject.status) }}
            />
            <div className="project-pick-hud-identity">
              <div className="project-pick-hud-name">{selectedProject.name}</div>
              <div className="project-pick-hud-meta">
                <span>{statusLabel(selectedProject.status)}</span>
                {selectedXform ? (
                  <span className="project-pick-hud-pose">
                    {selectedXform.lat.toFixed(5)}, {selectedXform.lon.toFixed(5)}
                    {" · "}
                    {Math.round(selectedXform.rotationDeg)}°
                    {" · ×"}
                    {selectedXform.scaleMultiplier >= 0.1
                      ? selectedXform.scaleMultiplier.toFixed(2)
                      : selectedXform.scaleMultiplier.toFixed(3)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="project-pick-hud-tools">
              {canEditModels && (
                <button type="button" className="project-pick-hud-btn project-pick-hud-btn--edit" onClick={openEdit}>
                  Edit
                </button>
              )}
              <button
                type="button"
                className="project-pick-hud-btn"
                onClick={() => setHudCollapsed((v) => !v)}
                title={hudCollapsed ? "Expand controls" : "Collapse controls"}
                aria-expanded={!hudCollapsed}
              >
                {hudCollapsed ? "▴" : "▾"}
              </button>
              <button
                type="button"
                className="project-pick-hud-btn project-pick-hud-btn--ghost"
                onClick={() => {
                  setSelectedId(null);
                  setConfirmDelete(false);
                  setEditOpen(false);
                }}
                title="Deselect"
              >
                ×
              </button>
            </div>
          </div>

          {!hudCollapsed && (
            <>
          {canEditModels && editMode && selectedXform && !locked && (
            <div className="project-pick-hud-xyz">
              <span className="project-pick-hud-axis" style={{ color: "#c0392b" }}>X</span>
              <input
                type="number"
                step="0.00001"
                value={selectedXform.lon}
                title="Longitude (East / West)"
                className="project-pick-hud-input"
                onChange={(e) => {
                  const lon = Number(e.target.value);
                  if (!Number.isFinite(lon) || !selectedId) return;
                  commitLocalPose(selectedId, { lon });
                }}
                onBlur={() => selectedId && void persistTransform(selectedId)}
              />
              <button type="button" title="West −1 m" onClick={() => nudgeSelected(-1, 0, 0)} className="project-pick-hud-nudge">
                −1m
              </button>
              <button type="button" title="East +1 m" onClick={() => nudgeSelected(1, 0, 0)} className="project-pick-hud-nudge">
                +1m
              </button>

              <span className="project-pick-hud-axis" style={{ color: "#27ae60" }}>Y</span>
              <input
                type="number"
                step="0.00001"
                value={selectedXform.lat}
                title="Latitude (North / South)"
                className="project-pick-hud-input"
                onChange={(e) => {
                  const lat = Number(e.target.value);
                  if (!Number.isFinite(lat) || !selectedId) return;
                  commitLocalPose(selectedId, { lat });
                }}
                onBlur={() => selectedId && void persistTransform(selectedId)}
              />
              <button type="button" title="South −1 m" onClick={() => nudgeSelected(0, -1, 0)} className="project-pick-hud-nudge">
                −1m
              </button>
              <button type="button" title="North +1 m" onClick={() => nudgeSelected(0, 1, 0)} className="project-pick-hud-nudge">
                +1m
              </button>

              <span className="project-pick-hud-axis" style={{ color: "#2980b9" }}>Z</span>
              <input
                type="number"
                step="0.1"
                value={selectedXform.heightM}
                title="Height above ground (m). Keep 0 for ground — no elevation."
                className="project-pick-hud-input"
                onChange={(e) => {
                  const heightM = Number(e.target.value);
                  if (!Number.isFinite(heightM) || !selectedId) return;
                  commitLocalPose(selectedId, { heightM: Math.max(-50, Math.min(500, heightM)) });
                }}
                onBlur={() => selectedId && void persistTransform(selectedId)}
              />
              <button
                type="button"
                title="Set Z = 0 (ground, no elevation)"
                onClick={() => selectedId && commitLocalPose(selectedId, { heightM: 0 }, true)}
                className="project-pick-hud-nudge"
              >
                Ground
              </button>
              <button type="button" title="Up +0.5 m" onClick={() => nudgeSelected(0, 0, 0.5)} className="project-pick-hud-nudge">
                +0.5
              </button>
              <div className="project-pick-hud-xyz-hint">
                X = lon · Y = lat · Z = height m (keep <b>0</b> for ground clamp — no elevation)
              </div>
            </div>
          )}

          {earthquakeEnabled && siteQuakeScore && (
            <div className="project-pick-hud-note">
              <DualQuakeSummary score={siteQuakeScore} ink />
            </div>
          )}

          {selectedProject.siteMarkerOnly && !canPromoteSitePin && (
            <div className="project-pick-hud-note">
              Site pin only — no 3D GLB. Engineering places the model later.
            </div>
          )}

          {canPromoteSitePin && selectedProject.siteMarkerOnly && (
            <div className="project-pick-hud-build">
              {confirmStartBuild ? (
                <>
                  <div className="project-pick-hud-build-copy">
                    <strong>Itatayo na ba ito?</strong>
                    <span>
                      Lalabas ang Under Construction model sa pin. Ikaw pa rin ang maglalagay —
                      move, rotate, at scale.
                    </span>
                  </div>
                  <div className="project-pick-hud-actions">
                    <button
                      type="button"
                      className="project-pick-hud-action is-primary"
                      disabled={startBuildBusy}
                      onClick={() => void handleStartConstruction()}
                    >
                      {startBuildBusy ? "Sineset…" : "Oo, itayo na"}
                    </button>
                    <button
                      type="button"
                      className="project-pick-hud-action"
                      disabled={startBuildBusy}
                      onClick={() => setConfirmStartBuild(false)}
                    >
                      Hindi muna
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="project-pick-hud-action is-primary"
                  onClick={() => setConfirmStartBuild(true)}
                >
                  Itayo na (Under Construction)
                </button>
              )}
            </div>
          )}

          {editMode && canEditModels && selectedProject.siteMarkerOnly && onDeleteBuilding && (
            <div className="project-pick-hud-actions">
              {!confirmDelete ? (
                <button
                  type="button"
                  className="project-pick-hud-action project-pick-hud-action--danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  Remove site pin
                </button>
              ) : (
                <div className="project-pick-hud-confirm">
                  <button
                    type="button"
                    className="project-pick-hud-action project-pick-hud-action--danger"
                    onClick={() => {
                      if (selectedId) onDeleteBuilding?.(selectedId);
                      setSelectedId(null);
                      setConfirmDelete(false);
                    }}
                  >
                    Yes, Remove
                  </button>
                  <button
                    type="button"
                    className="project-pick-hud-action"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {editMode && canEditModels && !selectedProject.siteMarkerOnly && (
            <div className="project-pick-hud-hint">
              {locked ? (
                <span className="project-pick-hud-hint-lock">
                  Locked — unlock to move / rotate / scale
                </span>
              ) : (
                <>
                  <span>Left-drag: Move</span>
                  <span>Right-drag: Rotate</span>
                  <span>Scroll: Scale (Ctrl = faster)</span>
                </>
              )}
            </div>
          )}

          {editMode && canEditModels && !selectedProject.siteMarkerOnly && (
            <div className="project-pick-hud-actions">
              <button
                type="button"
                className={`project-pick-hud-action${locked ? " is-warn" : ""}`}
                onClick={() => void handleToggleLock()}
                disabled={transformSaving}
              >
                {locked ? "Unlock" : "Lock"}
              </button>
              <button
                type="button"
                className={`project-pick-hud-action${transformDirty && !locked ? " is-primary" : ""}`}
                onClick={() => selectedId && void persistTransform(selectedId)}
                disabled={transformSaving || !transformDirty || locked}
              >
                {transformSaving
                  ? "Saving…"
                  : transformMessage ??
                    (locked ? "Locked" : transformDirty ? "Save Position" : "Saved")}
              </button>
              {onDeleteBuilding && (!confirmDelete ? (
                <button
                  type="button"
                  className="project-pick-hud-action project-pick-hud-action--danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  Remove Building
                </button>
              ) : (
                <div className="project-pick-hud-confirm">
                  <span className="project-pick-hud-confirm-label">
                    Remove <strong>{selectedProject.name}</strong>?
                  </span>
                  <div className="project-pick-hud-confirm-row">
                    <button
                      type="button"
                      className="project-pick-hud-action project-pick-hud-action--danger"
                      onClick={() => {
                        if (selectedId) onDeleteBuilding?.(selectedId);
                        setSelectedId(null);
                        setConfirmDelete(false);
                      }}
                    >
                      Yes, Remove
                    </button>
                    <button
                      type="button"
                      className="project-pick-hud-action"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
            </>
          )}
        </div>
      )}
      </div>

      {editOpen && editDraft && selectedProject && !modelsFrozen && !editMode && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => !editSaving && setEditOpen(false)}
        >
          <div
            className="card"
            style={{
              width: "min(420px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "var(--cream)",
              border: "2px solid var(--ink)",
              padding: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sectionTitle" style={{ marginBottom: 12 }}>
              Edit — {selectedProject.name}
            </div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
              Name
              <input
                type="text"
                value={editDraft.name}
                onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                style={{ width: "100%", marginTop: 4, padding: 8, boxSizing: "border-box" }}
                placeholder="Pin name"
              />
            </label>
            <label style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
              Official page
              <input
                type="url"
                value={editDraft.officialUrl}
                onChange={(e) => setEditDraft({ ...editDraft, officialUrl: e.target.value })}
                style={{ width: "100%", marginTop: 4, padding: 8, boxSizing: "border-box" }}
                placeholder="https://…"
              />
            </label>
            {selectedProject.siteMarkerOnly && (
              <label style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
                Pin color
                <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {MAP_SKETCH_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      title={c}
                      onClick={() => setEditDraft({ ...editDraft, markerColor: c })}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 0,
                        cursor: "pointer",
                        background: c,
                        border: editDraft.markerColor === c
                          ? "3px solid var(--ink)"
                          : "2px solid rgba(0,0,0,0.3)",
                        flexShrink: 0,
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={editDraft.markerColor}
                    aria-label="Custom pin color"
                    onChange={(e) => setEditDraft({ ...editDraft, markerColor: e.target.value })}
                    style={{ width: 32, height: 26, padding: 0, border: "2px solid var(--ink)", cursor: "pointer" }}
                  />
                </div>
              </label>
            )}
            <label style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
              Barangay
              <select
                value={editDraft.barangay}
                onChange={(e) => setEditDraft({ ...editDraft, barangay: e.target.value })}
                style={{ width: "100%", marginTop: 4, padding: 8 }}
              >
                <option value="">— not set —</option>
                {BARANGAY_LIST.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
              Status
              <select
                value={editDraft.status}
                onChange={(e) =>
                  setEditDraft({ ...editDraft, status: e.target.value as ProjectStatus })
                }
                style={{ width: "100%", marginTop: 4, padding: 8 }}
              >
                {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
              Progress ({editDraft.progress}%)
              <input
                type="range"
                min={0}
                max={100}
                value={editDraft.progress}
                onChange={(e) =>
                  setEditDraft({ ...editDraft, progress: Number(e.target.value) })
                }
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
              Description
              <textarea
                value={editDraft.description}
                onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                rows={3}
                style={{ width: "100%", marginTop: 4, padding: 8, boxSizing: "border-box" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <label style={{ flex: 1, fontSize: 12 }}>
                Start
                <input
                  type="date"
                  value={editDraft.startDate}
                  onChange={(e) => setEditDraft({ ...editDraft, startDate: e.target.value })}
                  style={{ width: "100%", marginTop: 4, padding: 8, boxSizing: "border-box" }}
                />
              </label>
              <label style={{ flex: 1, fontSize: 12 }}>
                Target end
                <input
                  type="date"
                  value={editDraft.targetEndDate}
                  onChange={(e) => setEditDraft({ ...editDraft, targetEndDate: e.target.value })}
                  style={{ width: "100%", marginTop: 4, padding: 8, boxSizing: "border-box" }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <label style={{ flex: 1, fontSize: 12 }}>
                Budget total
                <input
                  type="number"
                  value={editDraft.budgetTotal}
                  onChange={(e) => setEditDraft({ ...editDraft, budgetTotal: e.target.value })}
                  style={{ width: "100%", marginTop: 4, padding: 8, boxSizing: "border-box" }}
                />
              </label>
              <label style={{ flex: 1, fontSize: 12 }}>
                Budget spent
                <input
                  type="number"
                  value={editDraft.budgetSpent}
                  onChange={(e) => setEditDraft({ ...editDraft, budgetSpent: e.target.value })}
                  style={{ width: "100%", marginTop: 4, padding: 8, boxSizing: "border-box" }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={editSaving}
                onClick={() => setEditOpen(false)}
                style={{ padding: "8px 14px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editSaving}
                onClick={() => void saveEdit()}
                style={{
                  padding: "8px 14px",
                  cursor: "pointer",
                  background: "var(--seed)",
                  border: "2px solid var(--ink)",
                  fontWeight: 700,
                }}
              >
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
