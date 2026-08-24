/**
 * CesiumMap — primary globe with sun lighting, shadows, click-to-place,
 * and MapLibre-parity edit: select / left-drag move / right-drag rotate / scroll scale.
 */

import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
import {
  clearGlbMemoryCache,
  getGlbMemoryStats,
  isCatalogGlbUrl,
  isGlbCached,
  prefetchGlbUrls,
  resolveGlbUrlForAttach,
  retainGlbUrls,
  touchGlbCache,
} from "../lib/glb-cache";
import {
  formatBytesShort,
  gpuModelBudget,
  modelLoadConcurrency,
  modelLoadRadiusM,
  modelUnloadRadiusM,
} from "../lib/cesium-model-stream";
import {
  noteSceneFrame,
  sceneIsLagging,
  sceneIsStalling,
  sceneTargetFrameRate,
  setSceneCameraMoving,
} from "../lib/cesium-frame-budget";
import { attachCesiumMotionBlur, type MotionBlurHandle } from "../lib/cesium-motion-blur";
import {
  gizmoHandleToAxis,
  pickGizmoHandle,
  removeEditGizmo,
  resizeEditGizmo,
  setEditGizmoHover,
  syncEditGizmo,
  type EditAxis,
  type EditTool,
} from "../lib/cesium-edit-gizmo";
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
import { isGlobeOfflineMode, OFFLINE_MODE_EVENT } from "../lib/globe-offline";
import { classAdvice, classColor } from "../lib/earthquake-labels";
import {
  earthquakeProneModel,
  type EarthquakeDualSummary,
  type EarthquakeGridCell,
  type EarthquakeSiteScore,
} from "../lib/ml-earthquake";
import { registerTerrainSatSampler, type TerrainSatSample } from "../lib/terrain-sat-features";
import { PlaceSidePanel } from "./PlaceSidePanel";
import { GoogleHeatmapOverlay } from "./GoogleHeatmapOverlay";
import { quakeHeatWeight } from "../lib/google-heatmap";
import {
  formatTropicalInfo,
  getTropicalColor,
  getTropicalIcon,
  getTropicalStageMeta,
  type TropicalSystem,
} from "../lib/tropical-systems";
import { HAZARD_OVERLAYS, loadHazardTilesManifest } from "../lib/hazard-overlays";
import { addLuisianaBoundary } from "../lib/luisiana-boundary";
import {
  addBarangayOverlay,
  flyToBarangay as flyCameraToBarangay,
  highlightBarangay,
  loadBarangayAreas,
  removeBarangayOverlay,
  type BarangayArea,
} from "../lib/barangay-overlay";
import {
  displayNameForProject,
  hoverTypeLabel,
  lookupPlaceName,
  syncPlaceName,
} from "../lib/place-name";
import { formatLonLat, infraLabelText } from "../lib/coords";
import {
  isInsideLuisiana,
  loadLuisianaRing,
  ringBounds,
  type LonLat,
} from "../lib/luisiana-polygon";

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

/** Don't flash the stream chip for cached attaches that finish instantly. */
const MODEL_LOAD_UI_DELAY_MS = 280;
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

/** Height above ellipsoid, or above DEM when satellite/terrain is on. */
function cameraHeightAboveSurface(viewer: Cesium.Viewer): number {
  const carto = viewer.camera.positionCartographic;
  if (!carto) return MIN_CAMERA_HEIGHT_M;
  const ellipsoidH = carto.height;
  const terrainOn =
    !!viewer.terrainProvider &&
    !(viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider);
  if (terrainOn) {
    try {
      const sampled = viewer.scene.globe.getHeight(carto);
      if (typeof sampled === "number" && Number.isFinite(sampled)) {
        return Math.max(MIN_CAMERA_HEIGHT_M, ellipsoidH - sampled);
      }
    } catch {
      /* DEM sample not ready */
    }
  }
  return Math.max(MIN_CAMERA_HEIGHT_M, ellipsoidH);
}

/** Ground-plane WASD: W/S along heading, A/D strafe. Speed scales with altitude. */
function moveCameraWasd(viewer: Cesium.Viewer, held: Set<string>, dt: number) {
  if (dt <= 0) return;
  const cam = viewer.camera;
  const pos = cam.position;
  const heading = cam.heading;
  const agl = cameraHeightAboveSurface(viewer);
  let speed = Math.min(520, Math.max(14, agl * 0.85));
  if (held.has("shift")) speed *= 2.4;
  const dist = speed * dt;
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  let east = 0;
  let north = 0;
  if (held.has("w")) {
    north += cosH;
    east += sinH;
  }
  if (held.has("s")) {
    north -= cosH;
    east -= sinH;
  }
  if (held.has("d")) {
    north -= sinH;
    east += cosH;
  }
  if (held.has("a")) {
    north += sinH;
    east -= cosH;
  }
  const len = Math.hypot(east, north);
  if (len < 1e-8) return;
  east = (east / len) * dist;
  north = (north / len) * dist;
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
  const eastV = Cesium.Matrix4.getColumn(enu, 0, new Cesium.Cartesian3());
  const northV = Cesium.Matrix4.getColumn(enu, 1, new Cesium.Cartesian3());
  const delta = new Cesium.Cartesian3();
  Cesium.Cartesian3.multiplyByScalar(eastV, east, eastV);
  Cesium.Cartesian3.multiplyByScalar(northV, north, northV);
  Cesium.Cartesian3.add(eastV, northV, delta);
  cam.position = Cesium.Cartesian3.add(pos, delta, new Cesium.Cartesian3());

  const carto = cam.positionCartographic;
  if (!carto) return;
  const sampled = viewer.scene.globe.getHeight(carto);
  const ground = typeof sampled === "number" && Number.isFinite(sampled) ? sampled : 0;
  const minHeight = Math.max(MIN_CAMERA_HEIGHT_M, ground + MIN_TERRAIN_CLEARANCE_M);
  if (carto.height >= minHeight) return;
  const up = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude),
    new Cesium.Cartesian3(),
  );
  cam.position = Cesium.Cartesian3.add(
    cam.position,
    Cesium.Cartesian3.multiplyByScalar(up, minHeight - carto.height, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
}
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
  /** Select a project model and fly the camera to it. False if the globe is not ready yet. */
  flyToProject: (projectId: string) => boolean;
  /** Select a just-placed building so Edit Mode gizmo attaches (no fly). */
  selectProject: (projectId: string) => boolean;
  /** Finish current line/area sketch (placement mode). */
  finishSketch: () => boolean;
  /** Remove last sketch vertex. */
  undoSketchVertex: () => void;
  /** Clear in-progress sketch. */
  clearSketch: () => void;
  /** How many vertices in the current draft sketch. */
  getSketchVertexCount: () => number;
  /** Snapshot of the live globe (PNG data URL) for printable maps / reports. */
  captureMapPng: () => Promise<string | null>;
  /** Fly to a barangay polygon from the legend. */
  flyToBarangay: (area: BarangayArea) => void;
};

type PlaceClick = { lng: number; lat: number };

type LocalXform = {
  lon: number;
  lat: number;
  /** Meters above ground. 0 = clamp to terrain (no elevation). */
  heightM: number;
  rotationDeg: number;
  pitchDeg: number;
  rollDeg: number;
  scaleMultiplier: number;
  /** Extra stretch on the GLB (1 = none). X width, Y depth, Z height. */
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  modelLocked: boolean;
  dirty: boolean;
  /** Keep local pose until projects prop matches after save. */
  pendingSync: boolean;
};

const MAX_EDIT_UNDO = 80;

type EditPoseSnap = {
  projectId: string;
  lon: number;
  lat: number;
  heightM: number;
  rotationDeg: number;
  pitchDeg: number;
  rollDeg: number;
  scaleMultiplier: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
};

function snapFromXform(projectId: string, xf: LocalXform): EditPoseSnap {
  return {
    projectId,
    lon: xf.lon,
    lat: xf.lat,
    heightM: xf.heightM,
    rotationDeg: xf.rotationDeg,
    pitchDeg: xf.pitchDeg ?? 0,
    rollDeg: xf.rollDeg ?? 0,
    scaleMultiplier: xf.scaleMultiplier,
    scaleX: xf.scaleX ?? 1,
    scaleY: xf.scaleY ?? 1,
    scaleZ: xf.scaleZ ?? 1,
  };
}

function poseSnapEqual(a: EditPoseSnap, b: EditPoseSnap): boolean {
  return (
    a.projectId === b.projectId &&
    Math.abs(a.lon - b.lon) < 1e-8 &&
    Math.abs(a.lat - b.lat) < 1e-8 &&
    Math.abs(a.heightM - b.heightM) < 1e-4 &&
    Math.abs(a.rotationDeg - b.rotationDeg) < 1e-3 &&
    Math.abs(a.pitchDeg - b.pitchDeg) < 1e-3 &&
    Math.abs(a.rollDeg - b.rollDeg) < 1e-3 &&
    Math.abs(a.scaleMultiplier - b.scaleMultiplier) < 1e-4 &&
    Math.abs(a.scaleX - b.scaleX) < 1e-4 &&
    Math.abs(a.scaleY - b.scaleY) < 1e-4 &&
    Math.abs(a.scaleZ - b.scaleZ) < 1e-4
  );
}

function writeXformFromSnap(xf: LocalXform, snap: EditPoseSnap) {
  xf.lon = snap.lon;
  xf.lat = snap.lat;
  xf.heightM = snap.heightM;
  xf.rotationDeg = snap.rotationDeg;
  xf.pitchDeg = snap.pitchDeg;
  xf.rollDeg = snap.rollDeg;
  xf.scaleMultiplier = snap.scaleMultiplier;
  xf.scaleX = snap.scaleX ?? 1;
  xf.scaleY = snap.scaleY ?? 1;
  xf.scaleZ = snap.scaleZ ?? 1;
}

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
  /** Parent list / portal — a project pin or model was clicked. */
  onProjectSelect?: (projectId: string) => void;
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
  /** Left-rail toggle — color-coded barangay areas. */
  barangaysVisible?: boolean;
  /** Legend selection — highlight that barangay fill. */
  focusedBarangay?: string | null;
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

function clampScaleMult(n: number): number {
  return Math.max(SCALE_MULT_MIN, Math.min(SCALE_MULT_MAX, n));
}

function stretchFromProject(p: Project): { scaleX: number; scaleY: number; scaleZ: number } {
  return {
    scaleX: Number.isFinite(p.modelScaleX) ? Number(p.modelScaleX) : 1,
    scaleY: Number.isFinite(p.modelScaleY) ? Number(p.modelScaleY) : 1,
    scaleZ: Number.isFinite(p.modelScaleZ) ? Number(p.modelScaleZ) : 1,
  };
}

function applyStretchFactor(xf: LocalXform, axis: EditAxis, factor: number) {
  if (axis === "x") xf.scaleX = clampScaleMult((xf.scaleX ?? 1) * factor);
  else if (axis === "y") xf.scaleY = clampScaleMult((xf.scaleY ?? 1) * factor);
  else if (axis === "z") xf.scaleZ = clampScaleMult((xf.scaleZ ?? 1) * factor);
  else xf.scaleMultiplier = clampScaleMult(xf.scaleMultiplier * factor);
}

const _stretchScale = new Cesium.Cartesian3();

function forEachModelPrimitive(
  collection: { length: number; get: (i: number) => unknown },
  visit: (prim: Cesium.Model & { id?: unknown }) => void,
) {
  const n = collection.length;
  for (let i = 0; i < n; i++) {
    const p = collection.get(i) as {
      length?: number;
      get?: (i: number) => unknown;
      modelMatrix?: Cesium.Matrix4;
      id?: unknown;
    };
    if (!p) continue;
    if (typeof p.length === "number" && typeof p.get === "function") {
      forEachModelPrimitive(p as Cesium.PrimitiveCollection, visit);
    } else if (p.modelMatrix) {
      visit(p as Cesium.Model & { id?: unknown });
    }
  }
}

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
  sm.darkness = 0.4;
  sm.fadingEnabled = true;
  sm.normalOffset = true;
}

/** Shadows only while the camera is over / next to Luisiana (not the whole globe). */
function cameraOverLuisiana(viewer: Cesium.Viewer, ring: LonLat[] | null): boolean {
  const carto = viewer.camera.positionCartographic;
  if (!carto) return false;
  if (carto.height > 8_000) return false;
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const lat = Cesium.Math.toDegrees(carto.latitude);
  if (ring && ring.length >= 4) {
    if (isInsideLuisiana(lon, lat, ring)) return true;
    const b = ringBounds(ring);
    const pad = 0.02;
    return lon >= b.west - pad && lon <= b.east + pad && lat >= b.south - pad && lat <= b.north + pad;
  }
  return (
    lon >= 121.44 && lon <= 121.58 && lat >= 14.12 && lat <= 14.27
  );
}

/**
 * Attach a project GLB with cast+receive shadows.
 * Pins / billboards stay on entities with ShadowMode.DISABLED (no caster overhead).
 */
function attachProjectGlbModel(
  ent: Cesium.Entity,
  opts: {
    uri: string;
    scale: number;
    heightReference: Cesium.HeightReference;
    /** Extra models past the budget skip the shadow pass so pan stays smooth. */
    skipShadows?: boolean;
  },
): void {
  // Heavy authored halls (municipal-office / RHU) skip the shadow map —
  // casting 100k+ tris into Cesium's shadow pass is what stalls the globe.
  const heavy = /municipal-office|rural-health-unit/i.test(opts.uri);
  const shadowMode =
    heavy || opts.skipShadows ? Cesium.ShadowMode.DISABLED : Cesium.ShadowMode.ENABLED;
  ent.shadows = new Cesium.ConstantProperty(shadowMode);
  ent.model = new Cesium.ModelGraphics({
    uri: opts.uri,
    scale: opts.scale,
    heightReference: opts.heightReference,
    shadows: shadowMode,
    runAnimations: false,
    incrementallyLoadTextures: true,
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

function viewerAlive(viewer: Cesium.Viewer | null | undefined): viewer is Cesium.Viewer {
  return Boolean(viewer && !viewer.isDestroyed());
}

function applyProjectHoverVisual(
  viewer: Cesium.Viewer,
  project: Project,
  hovered: boolean,
) {
  if (!viewerAlive(viewer)) return;
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
  const base = cls === "HIGH" ? 8 : cls === "MODERATE" ? 7 : 5;
  const sized = predicted ? Math.max(4, base - 1) : base;
  return hovered ? sized + 4 : sized;
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
  pitchDeg = 0,
  rollDeg = 0,
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
      new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(-rotationDeg),
        Cesium.Math.toRadians(pitchDeg),
        Cesium.Math.toRadians(rollDeg),
      ),
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

function gizmoScreenAngle(
  viewer: Cesium.Viewer,
  lon: number,
  lat: number,
  heightM: number,
  mouse: Cesium.Cartesian2,
): number | null {
  const onGround = Math.abs(heightM) < 1e-4;
  const z = onGround ? 1.2 : heightM + 1.2;
  const origin = Cesium.Cartesian3.fromDegrees(lon, lat, z);
  const win = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, origin);
  if (!Cesium.defined(win) || !win) return null;
  return Math.atan2(mouse.y - win.y, mouse.x - win.x);
}

/** Street / barangay height: show name + coordinates on every visible site. */
const INFRA_COORDS_LABEL_HEIGHT_M = 2800;

function applyXformToEntity(ent: Cesium.Entity, p: Project, xf: LocalXform) {
  applyEntityPose(
    ent,
    xf.lon,
    xf.lat,
    xf.rotationDeg,
    modelScaleValue(p, xf.scaleMultiplier),
    xf.heightM,
    xf.pitchDeg ?? 0,
    xf.rollDeg ?? 0,
  );
  if (ent.label) {
    const isSitePin = Boolean(p.siteMarkerOnly);
    const displayName = p.name?.trim() || "Untitled site";
    (ent.label as Cesium.LabelGraphics).text = new Cesium.ConstantProperty(
      infraLabelText(displayName, xf.lat, xf.lon, isSitePin),
    );
  }
}

function applyResolvedPlaceName(
  viewer: Cesium.Viewer,
  p: Project,
  name: string,
  lonLat?: { lon: number; lat: number },
) {
  if (!viewerAlive(viewer) || !name.trim()) return;
  const ent = viewer.entities.getById(entityIdFor(p.id));
  if (!ent) return;
  ent.name = name;
  if (ent.label) {
    const isSitePin = Boolean(p.siteMarkerOnly);
    const lat = lonLat?.lat ?? p.location.lat;
    const lon = lonLat?.lon ?? p.location.lon;
    (ent.label as Cesium.LabelGraphics).text = new Cesium.ConstantProperty(
      infraLabelText(name, lat, lon, isSitePin),
    );
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
    cameraHeightM?: () => number;
    lon?: number;
    lat?: number;
  },
) {
  const isSitePin = Boolean(p.siteMarkerOnly);
  const displayName = p.name?.trim() || "Untitled site";
  const lon = opts.lon ?? p.location.lon;
  const lat = opts.lat ?? p.location.lat;
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
    label.text = new Cesium.ConstantProperty(infraLabelText(displayName, lat, lon, isSitePin));
    label.font = new Cesium.ConstantProperty(isSitePin ? "bold 12px sans-serif" : "11px sans-serif");
    label.showBackground = new Cesium.ConstantProperty(true);
    label.backgroundColor = new Cesium.ConstantProperty(
      Cesium.Color.fromCssColorString("#0c121ce6"),
    );
    label.backgroundPadding = new Cesium.ConstantProperty(new Cesium.Cartesian2(7, 5));
    label.pixelOffset = new Cesium.ConstantProperty(
      new Cesium.Cartesian2(0, isSitePin ? -28 : -36),
    );
    label.show = new Cesium.CallbackProperty(
      () =>
        isSitePin ||
        opts.isSelected(p.id) ||
        opts.isHovered(p.id) ||
        !opts.isAttached(p.id) ||
        (opts.cameraHeightM?.() ?? Infinity) < INFRA_COORDS_LABEL_HEIGHT_M,
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
    onProjectSelect,
    readOnly = false,
    canManipulateModels = false,
    canPromoteSitePin = false,
    onProjectPatch,
    canAddPhotos = false,
    onPhotosChange,
    onDeleteBuilding,
    gibs,
    buildingBlocksVisible = true,
    barangaysVisible = false,
    focusedBarangay = null,
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
  const forceCachedEsriRef = useRef<() => void>(() => {});
  const cachedEsriLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const restoreOnlineImageryRef = useRef<() => void>(() => {});
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
    streetLabel: string | null;
    coords: string;
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
  const resolvedPlaceNameRef = useRef(new Map<string, string>());
  const [, setPlaceNameTick] = useState(0);
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
  const sunIsDayRef = useRef(true);
  const luisianaRingRef = useRef<LonLat[] | null>(null);
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
  /** Original absolute GLB URL per attached project — used to retain the RAM cache. */
  const modelSourceUrlRef = useRef<Map<string, string>>(new Map());
  const cameraMovingRef = useRef(false);
  const motionBlurRef = useRef<MotionBlurHandle | null>(null);
  const modelLoadUiDelayRef = useRef<number | null>(null);
  const modelLoadUiVisibleRef = useRef(false);
  const modelLoadUiPayloadRef = useRef<{
    label: string;
    remaining: number;
    attached: number;
    budget: number;
    cacheLabel: string;
  } | null>(null);
  const lodReconcileRef = useRef<(() => void) | null>(null);
  const tiltedRef = useRef(true);
  const xformsRef = useRef<Map<string, LocalXform>>(new Map());
  const undoStackRef = useRef<EditPoseSnap[]>([]);
  const redoStackRef = useRef<EditPoseSnap[]>([]);
  const dragActiveRef = useRef(false);
  const scaleUndoArmedRef = useRef(false);
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);
  const projectsRef = useRef(projects);
  const clusteringEnabledRef = useRef(clusteringEnabled);
  const applyInfraClustersRef = useRef<() => void>(() => {});
  const clusterMetaRef = useRef(new Map<string, { lon: number; lat: number }>());
  const selectedIdRef = useRef<string | null>(null);
  const placementModeRef = useRef(placementMode);
  const editModeRef = useRef(editMode);
  const [editTool, setEditTool] = useState<EditTool>("move");
  const [editAxis, setEditAxis] = useState<EditAxis>("free");
  const editToolRef = useRef<EditTool>("move");
  const editAxisRef = useRef<EditAxis>("free");
  const modelsFrozenRef = useRef(false);
  const onPlaceClickRef = useRef(onPlaceClick);
  const onPlaceSketchRef = useRef(onPlaceSketch);
  const onProjectSelectRef = useRef(onProjectSelect);
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
    attached: number;
    budget: number;
    cacheLabel: string;
  }>({ active: false, label: "", remaining: 0, attached: 0, budget: gpuModelBudget(), cacheLabel: "" });

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
  useEffect(() => {
    editToolRef.current = editTool;
  }, [editTool]);
  useEffect(() => {
    editAxisRef.current = editAxis;
  }, [editAxis]);
  useEffect(() => {
    if (!editMode) {
      setEditTool("move");
      setEditAxis("free");
      scaleUndoArmedRef.current = false;
      dragActiveRef.current = false;
    }
  }, [editMode]);
  modelsFrozenRef.current = placementMode || blockRemoverActive;
  useEffect(() => {
    onPlaceClickRef.current = onPlaceClick;
  }, [onPlaceClick]);
  useEffect(() => {
    onPlaceSketchRef.current = onPlaceSketch;
    onProjectSelectRef.current = onProjectSelect;
  }, [onPlaceSketch, onProjectSelect]);
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
      const h = cameraHeightAboveSurface(viewer);
      viewer.camera.zoomIn(Math.max(50, h * 0.48));
      resizeEditGizmo(viewer);
      viewer.scene.requestRender();
    },
    zoomOut() {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      const h = cameraHeightAboveSurface(viewer);
      viewer.camera.zoomOut(Math.max(50, h * 0.48));
      resizeEditGizmo(viewer);
      viewer.scene.requestRender();
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
    flyToBarangay(area: BarangayArea) {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      flyCameraToBarangay(viewer, area);
    },
    flyToProject(projectId: string) {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return false;
      const p = projectsRef.current.find((x) => x.id === projectId);
      if (!p?.location) return false;
      const xf = xformsRef.current.get(projectId);
      const lon = xf?.lon ?? p.location.lon;
      const lat = xf?.lat ?? p.location.lat;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
      setSelectedId(projectId);
      const ent = viewer.entities.getById(entityIdFor(projectId));
      if (ent) ent.show = true;
      const scale = Math.max(0.5, xf?.scaleMultiplier ?? p.modelScale ?? 1);
      flyCameraToProjectTarget(viewer, lon, lat, {
        entity: ent && ent.show !== false ? ent : undefined,
        rangeM: Math.max(90, 160 * scale),
        duration: 1.15,
      });
      window.setTimeout(() => lodReconcileRef.current?.(), 80);
      return true;
    },
    selectProject(projectId: string) {
      const p = projectsRef.current.find((x) => x.id === projectId);
      if (!p?.location || p.siteMarkerOnly) return false;
      setSelectedId(projectId);
      setEditTool("move");
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        const ent = viewer.entities.getById(entityIdFor(projectId));
        if (ent) ent.show = true;
        viewer.scene.requestRender();
      }
      window.setTimeout(() => {
        lodReconcileRef.current?.();
        refreshEditGizmoRef.current(true);
      }, 80);
      return true;
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
    captureMapPng() {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return Promise.resolve(null);
      motionBlurRef.current?.suppress();
      return new Promise((resolve) => {
        const remove = viewer.scene.postRender.addEventListener(() => {
          if (typeof remove === "function") remove();
          try {
            resolve(viewer.scene.canvas.toDataURL("image/png"));
          } catch {
            resolve(null);
          }
        });
        viewer.scene.requestRender();
      });
    },
  }));

  const ensureXform = useCallback((p: Project): LocalXform => {
    const existing = xformsRef.current.get(p.id);
    if (existing) {
      if (!Number.isFinite(existing.scaleX)) existing.scaleX = 1;
      if (!Number.isFinite(existing.scaleY)) existing.scaleY = 1;
      if (!Number.isFinite(existing.scaleZ)) existing.scaleZ = 1;
    }
    if (existing?.dirty) return existing;

    if (existing?.pendingSync) {
      const matches =
        Math.abs(existing.lon - p.location.lon) < 1e-6 &&
        Math.abs(existing.lat - p.location.lat) < 1e-6 &&
        Math.abs(existing.heightM - (p.modelHeight ?? 0)) < 0.01 &&
        Math.abs(existing.rotationDeg - (p.rotation ?? 0)) < 0.05 &&
        Math.abs((existing.pitchDeg ?? 0) - (p.rotationPitch ?? 0)) < 0.05 &&
        Math.abs((existing.rollDeg ?? 0) - (p.rotationRoll ?? 0)) < 0.05 &&
        Math.abs(existing.scaleMultiplier - (p.modelScale ?? 1)) < 0.001 &&
        Math.abs((existing.scaleX ?? 1) - (p.modelScaleX ?? 1)) < 0.001 &&
        Math.abs((existing.scaleY ?? 1) - (p.modelScaleY ?? 1)) < 0.001 &&
        Math.abs((existing.scaleZ ?? 1) - (p.modelScaleZ ?? 1)) < 0.001;
      if (matches) {
        existing.pendingSync = false;
        existing.modelLocked = Boolean(p.modelLocked);
      } else {
        existing.modelLocked = Boolean(p.modelLocked);
        return existing;
      }
    }

    const stretch = stretchFromProject(p);
    const next: LocalXform = {
      lon: p.location.lon,
      lat: p.location.lat,
      heightM: p.modelHeight ?? 0,
      rotationDeg: p.rotation ?? 0,
      pitchDeg: p.rotationPitch ?? 0,
      rollDeg: p.rotationRoll ?? 0,
      scaleMultiplier: p.modelScale ?? 1,
      scaleX: stretch.scaleX,
      scaleY: stretch.scaleY,
      scaleZ: stretch.scaleZ,
      modelLocked: Boolean(p.modelLocked),
      dirty: false,
      pendingSync: false,
    };
    xformsRef.current.set(p.id, next);
    return next;
  }, []);

  const setCameraInteractive = (viewer: Cesium.Viewer, enabled: boolean) => {
    if (!viewer || viewer.isDestroyed()) return;
    const scene = viewer.scene as Cesium.Scene | undefined;
    const c = scene?.screenSpaceCameraController;
    if (!c) return;
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
      msaaSamples: 2,
      // OSM street basemap (Ion token stays for terrain only).
      baseLayer: false,
    });
    // Keep imagery / GLB fetches from starving each other on weak GPUs.
    Cesium.RequestScheduler.maximumRequests = 12;
    Cesium.RequestScheduler.maximumRequestsPerServer = 6;

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
      applyScopeRef.current?.();
    };

    const applySatVisibility = () => {
      if (viewer.isDestroyed()) return;
      const on = satelliteEnabledRef.current;
      const sat = satelliteImageryRef.current;
      const osm = osmBasemapRef.current;
      // Keep satellite under the street map so a failed OSM fetch is not a black globe.
      if (sat) {
        sat.show = true;
        sat.alpha = 1;
        styleSatelliteLayer(sat);
      }
      if (osm) {
        osm.show = !on;
        osm.alpha = on ? 0 : 1;
        if (!on) {
          try {
            viewer.imageryLayers.raiseToTop(osm);
          } catch {
            /* ignore */
          }
        }
      }
      if (on && sat) {
        try {
          viewer.imageryLayers.raiseToTop(sat);
        } catch {
          /* ignore */
        }
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

    forceCachedEsriRef.current = () => {
      const satCfg = getSatelliteSource("esri");
      const url =
        satCfg.tiles[0]?.replace(
          "server.arcgisonline.com",
          "services.arcgisonline.com",
        ) ?? `${ESRI_WORLD_IMAGERY}/tile/{z}/{y}/{x}`;
      if (!cachedEsriLayerRef.current) {
        const layer = viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url,
            credit: satCfg.attribution,
            maximumLevel: 18,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
          }),
        );
        cachedEsriLayerRef.current = layer;
      }
      const layer = cachedEsriLayerRef.current;
      layer.show = true;
      layer.alpha = 1;
      try {
        viewer.imageryLayers.raiseToTop(layer);
      } catch {
        /* ignore */
      }
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#2c4a3a");
    };

    restoreOnlineImageryRef.current = () => {
      if (cachedEsriLayerRef.current) {
        cachedEsriLayerRef.current.show = false;
        cachedEsriLayerRef.current.alpha = 0;
      }
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
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#2c4a3a");

    // Draw the Luisiana municipality boundary outline on the globe.
    void addLuisianaBoundary(viewer);
    void loadLuisianaRing()
      .then((ring) => {
        if (viewer.isDestroyed()) return;
        luisianaRingRef.current = ring;
        applyScopeRef.current?.();
      })
      .catch((err) => {
        console.warn("[CesiumMap] Luisiana ring for shadows/blocks failed:", err);
      });

    // Fog + pan tuning in local 3D tilt (no cartographic clip — keeps full globe).
    viewer.scene.globe.cartographicLimitRectangle = Cesium.Rectangle.MAX_VALUE;
    viewer.scene.fog.minimumBrightness = FOG_MIN_BRIGHTNESS_DAY;

    const applyLuisianaScopeForCamera = () => {
      if (viewer.isDestroyed()) return;
      const carto = viewer.camera.positionCartographic;
      if (!carto) return;
      // Pitch near -90° = top-down; greater (e.g. -35°) = 3D tilt.
      const pitch = viewer.camera.pitch;
      const agl = cameraHeightAboveSurface(viewer);
      const satOn = satelliteEnabledRef.current;
      const inLocal3d =
        pitch > MUNICIPAL_3D_PITCH_RAD &&
        agl < MUNICIPAL_3D_MAX_HEIGHT_M;

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

      const wantShadows =
        sunIsDayRef.current &&
        mapSettingsRef.current.shadowsEnabled &&
        cameraOverLuisiana(viewer, luisianaRingRef.current);
      if (viewer.shadows !== wantShadows) {
        viewer.shadows = wantShadows;
      }

      // Slow pan/orbit in 3D tilt — especially near-horizon / low “street” angles.
      // (Left-drag rotates the globe; near the ground that feels like racing pan.)
      const camCtrl = viewer.scene.screenSpaceCameraController;
      const nearTown = agl < MUNICIPAL_3D_MAX_HEIGHT_M;
      // Per-frame cap: at 60fps a 0.016 ratio ≈ a full-window fling per second.
      // Left-drag rotate at street height then coasts to the horizon — keep it tight.
      if (inLocal3d || (satOn && nearTown)) {
        // Keep 3D orbit/tilt usable. Do not slow down as pitch goes toward the horizon —
        // that made “getting a 3D view” crawl. Inertia stays low so a short pull stops.
        camCtrl.maximumMovementRatio = 0.011;
        camCtrl.inertiaTranslate = 0.06;
        camCtrl.inertiaSpin = 0.06;
        camCtrl.inertiaZoom = 0.28;
        camCtrl.zoomFactor = satOn ? 5 : 7;
      } else {
        camCtrl.maximumMovementRatio = 0.016;
        camCtrl.inertiaTranslate = 0.1;
        camCtrl.inertiaSpin = 0.1;
        camCtrl.inertiaZoom = 0.35;
        camCtrl.zoomFactor = satOn ? 5 : 7;
      }
    };
    applyScopeRef.current = applyLuisianaScopeForCamera;
    applyLuisianaScopeForCamera();
    const removeCamChanged = viewer.camera.changed.addEventListener(applyLuisianaScopeForCamera);
    const removeCamMoveEnd = viewer.camera.moveEnd.addEventListener(applyLuisianaScopeForCamera);

    // Render on demand — continuous redraw cooks weak GPUs while heavy GLBs stream in.
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
    let lastFrameCap = 0;
    const removeFrameNote = viewer.scene.postRender.addEventListener(() => {
      if (viewer.isDestroyed()) return;
      noteSceneFrame();
      const cap = sceneTargetFrameRate();
      if (cap === lastFrameCap) return;
      lastFrameCap = cap;
      viewer.targetFrameRate = cap > 0 ? cap : undefined;
    });

    motionBlurRef.current?.destroy();
    motionBlurRef.current = attachCesiumMotionBlur(viewer);
    motionBlurRef.current.setStrength((mapSettingsRef.current.motionBlur ?? 30) / 100);

    applyCesiumShadowMap(viewer, mapSettingsRef.current.shadowQuality);

    // Right-drag = change camera angle (tilt). Zoom only via scroll wheel / pinch.
    const camCtrl = viewer.scene.screenSpaceCameraController;
    // Wheel zoom is handled in onWheel so pan can stay slow without clamping scroll.
    camCtrl.zoomEventTypes = [Cesium.CameraEventType.PINCH];
    camCtrl.tiltEventTypes = [
      Cesium.CameraEventType.RIGHT_DRAG,
      Cesium.CameraEventType.MIDDLE_DRAG,
      Cesium.CameraEventType.PINCH,
      { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
    ];
    // Keep orbit around world-up so tilt cannot roll/flip the globe.
    camCtrl.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
    // Baseline; applyLuisianaScopeForCamera retunes for 3D / bottom view.
    camCtrl.maximumMovementRatio = 0.011;
    camCtrl.inertiaTranslate = 0.06;
    camCtrl.inertiaSpin = 0.06;
    camCtrl.inertiaZoom = 0.28;
    camCtrl.zoomFactor = 7;
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
      const boost = sceneIsLagging() ? 2.6 : 1.8;
      viewer.scene.globe.maximumScreenSpaceError = terrainSseWhileIdle() * boost;
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
        const poly = luisianaRingRef.current;
        if (poly && poly.length >= 4) {
          let lon = 0;
          let lat = 0;
          let n = 0;
          const closed =
            b.ring[0][0] === b.ring[b.ring.length - 1][0] &&
            b.ring[0][1] === b.ring[b.ring.length - 1][1];
          const count = closed ? b.ring.length - 1 : b.ring.length;
          for (let k = 0; k < count; k++) {
            lon += b.ring[k][0];
            lat += b.ring[k][1];
            n++;
          }
          if (n < 3 || !isInsideLuisiana(lon / n, lat / n, poly)) continue;
        }
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
          // Casters are municipality-clipped footprints only.
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
        color: Cesium.Color.fromCssColorString("#151c28"),
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
          removeFrameNote();
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
        modelSourceUrlRef.current.clear();
        cameraMovingRef.current = false;
        setSceneCameraMoving(false);
        try {
          if (!viewer.isDestroyed()) removeEditGizmo(viewer);
        } catch {
          /* ignore */
        }
        try {
          motionBlurRef.current?.destroy();
        } catch {
          /* ignore */
        }
        motionBlurRef.current = null;
        gibsImageryRef.current = null;
        satelliteImageryRef.current = null;
        osmBasemapRef.current = null;
        cachedEsriLayerRef.current = null;
        forceCachedEsriRef.current = () => {};
        restoreOnlineImageryRef.current = () => {};
        hazardOverlayLayersRef.current.clear();
        applySatelliteVisibilityRef.current = () => {};
        forceCachedEsriRef.current = () => {};
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          try {
            viewerRef.current.destroy();
          } catch (err) {
            console.warn("[CesiumMap] viewer.destroy failed:", err);
          }
        }
        clearGlbMemoryCache();
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

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;
    if (!barangaysVisible) {
      removeBarangayOverlay(viewer);
      viewer.scene.requestRender();
      return;
    }
    let cancelled = false;
    void loadBarangayAreas()
      .then((areas) => {
        if (cancelled || viewer.isDestroyed()) return;
        addBarangayOverlay(viewer, areas);
        highlightBarangay(viewer, areas, focusedBarangay);
      })
      .catch((err) => {
        console.warn("[CesiumMap] barangay overlay failed:", err);
      });
    return () => {
      cancelled = true;
      if (!viewer.isDestroyed()) removeBarangayOverlay(viewer);
    };
  }, [barangaysVisible, viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady || !barangaysVisible) return;
    void loadBarangayAreas().then((areas) => {
      if (viewer.isDestroyed()) return;
      highlightBarangay(viewer, areas, focusedBarangay);
    });
  }, [focusedBarangay, barangaysVisible, viewerReady]);

  // ── 3D Terrain (Ion World Terrain or ArcGIS elevation) ───────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    let cancelled = false;

    (async () => {
      if (!terrainEnabled || isGlobeOfflineMode()) {
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

  useEffect(() => {
    if (!viewerReady) return;
    const applyMode = (offline: boolean) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      if (offline) {
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        applyTerrainPerfSettings(viewer, false);
        forceCachedEsriRef.current();
      } else {
        restoreOnlineImageryRef.current();
        if (terrainEnabled) {
          void createLuisianaTerrainProvider()
            .then((provider) => {
              const v = viewerRef.current;
              if (!v || v.isDestroyed() || isGlobeOfflineMode()) return;
              v.terrainProvider = provider;
              applyTerrainPerfSettings(v, true, {
                screenSpaceError: terrainQualityToSse(mapSettingsRef.current.terrainQuality),
                satelliteOn: satelliteEnabledRef.current,
              });
              v.scene.requestRender();
            })
            .catch(() => undefined);
        }
      }
      viewer.scene.requestRender();
    };
    applyMode(isGlobeOfflineMode());
    const onMode = (e: Event) => {
      const on = Boolean((e as CustomEvent<{ on?: boolean }>).detail?.on);
      applyMode(on);
    };
    window.addEventListener(OFFLINE_MODE_EVENT, onMode);
    return () => window.removeEventListener(OFFLINE_MODE_EVENT, onMode);
  }, [viewerReady, terrainEnabled]);

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
    motionBlurRef.current?.setStrength((mapSettings.motionBlur ?? 30) / 100);

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
    sunIsDayRef.current = isDay;
    applyScopeRef.current?.();
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
      if (!viewerAlive(viewer)) return;
      const ent = viewer.entities.getById(tropicalEntityId(id));
      if (ent?.point) ent.point.pixelSize = new Cesium.ConstantProperty(tropicalBasePx(id));
      if (ent?.label) ent.label.show = new Cesium.ConstantProperty(false);
    };

    const clearQuakeVisual = (id: string) => {
      if (!viewerAlive(viewer)) return;
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
      if (!viewerAlive(viewer)) {
        lastKind = null;
        lastId = null;
        hoveredProjectIdRef.current = null;
        return;
      }
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
        if (project) {
          const xf = xformsRef.current.get(project.id);
          const coords = formatLonLat(
            xf?.lat ?? project.location.lat,
            xf?.lon ?? project.location.lon,
          );
          const cached = resolvedPlaceNameRef.current.get(project.id) ??
            (project.location
              ? syncPlaceName(project.location.lat, project.location.lon)
              : null);
          setHoveredProject({ project, x, y, streetLabel: cached ?? null, coords });
          if (
            !cached &&
            project.location?.lat != null &&
            project.location?.lon != null
          ) {
            const id = project.id;
            void lookupPlaceName(project.location.lat, project.location.lon).then((found) => {
              if (!found) return;
              resolvedPlaceNameRef.current.set(id, found);
              if (hoveredProjectIdRef.current === id) {
                setHoveredProject((prev) =>
                  prev && prev.project.id === id ? { ...prev, streetLabel: found } : prev,
                );
              }
            });
          }
        }
      }
    };

    const runPick = (screenPos: Cesium.Cartesian2) => {
      if (modelsFrozenRef.current) {
        clearAllHover();
        return;
      }
      if (freehandDrawingRef.current) return;
      if (cameraMovingRef.current) return;

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
      const hoverGap = sceneIsStalling()
        ? 160
        : sceneIsLagging()
          ? 100
          : HOVER_PICK_THROTTLE_MS;
      if (now - lastPickAt < hoverGap) {
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
      lastKind = null;
      lastId = null;
      hoveredProjectIdRef.current = null;
      try {
        canvas.removeEventListener("mouseleave", onLeave);
      } catch {
        /* canvas gone */
      }
      try {
        handler.destroy();
      } catch {
        /* viewer gone */
      }
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
          color: color.withAlpha(0.01),
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
    if (!selectedProject?.location) {
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
  }, [selectedProject?.id, selectedProject?.location.lat, selectedProject?.location.lon]);

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
        modelSourceUrlRef.current.delete(id);
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
        const pinColor = p.markerColor || p.mapSketch?.color || (isSitePin ? "#c47a1a" : "#151c28");
        const displayName = p.name?.trim() || "Untitled site";
        const cameraHeightM = () => viewer.camera.positionCartographic.height;
        ent = viewer.entities.add({
          id: eid,
          name: displayName,
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
            text: infraLabelText(displayName, xf.lat, xf.lon, isSitePin),
            font: isSitePin ? "bold 12px sans-serif" : "11px sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString("#0c121ce6"),
            backgroundPadding: new Cesium.Cartesian2(7, 5),
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, isSitePin ? -28 : -36),
            heightReference: heightRef,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(400, 1.0, 9000, 0.35),
            show: new Cesium.CallbackProperty(
              () =>
                isSitePin ||
                selectedIdRef.current === p.id ||
                hoveredProjectIdRef.current === p.id ||
                !modelAttachedRef.current.has(p.id) ||
                cameraHeightM() < INFRA_COORDS_LABEL_HEIGHT_M,
              false,
            ),
          },
        });
        loadedIdsRef.current.add(p.id);
      } else {
        applyXformToEntity(ent, p, xf);
        applySitePinChrome(ent, p, {
          isAttached: (id) => modelAttachedRef.current.has(id),
          isSelected: (id) => selectedIdRef.current === id,
          isHovered: (id) => hoveredProjectIdRef.current === id,
          cameraHeightM: () => viewer.camera.positionCartographic.height,
          lon: xf.lon,
          lat: xf.lat,
        });
        if (ent.point && (p.markerColor || p.mapSketch?.color)) {
          const c = p.markerColor || p.mapSketch?.color || "#151c28";
          ent.point.color = new Cesium.ConstantProperty(Cesium.Color.fromCssColorString(c));
        }
      }
      syncProjectSketchEntities(viewer, p);
    }

    applyInfraClustersRef.current();
    viewer.scene.requestRender();
  }, [projects, viewerReady, ensureXform]);

  // Street / barangay for hover subtitle (does not rename the structure).
  useEffect(() => {
    if (!viewerReady) return;
    let cancelled = false;
    const pending = projects.filter(
      (p) =>
        p.location?.lat != null &&
        p.location?.lon != null &&
        !resolvedPlaceNameRef.current.has(p.id),
    );
    void (async () => {
      for (const p of pending) {
        if (cancelled) return;
        const found = await lookupPlaceName(p.location.lat, p.location.lon);
        if (!found || cancelled) continue;
        resolvedPlaceNameRef.current.set(p.id, found);
      }
      if (!cancelled) setPlaceNameTick((n) => n + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [projects, viewerReady]);

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
              color: Cesium.Color.fromCssColorString("#151c28"),
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
  // Depends only on viewerReady — project ticks must not cancel in-flight decodes.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    let cancelled = false;

    const cameraDistanceTo = (lon: number, lat: number) => {
      const dest = Cesium.Cartesian3.fromDegrees(lon, lat);
      return Cesium.Cartesian3.distance(viewer.camera.positionWC, dest);
    };

    const cameraHeightM = () => {
      const carto = viewer.camera.positionCartographic;
      return carto && Number.isFinite(carto.height) ? carto.height : 1_000;
    };

    const retainAttachedBytes = () => {
      retainGlbUrls(modelSourceUrlRef.current.values());
    };

    const detachModel = (projectId: string) => {
      const ent = viewer.entities.getById(entityIdFor(projectId));
      if (ent) {
        ent.model = undefined;
        ent.shadows = new Cesium.ConstantProperty(Cesium.ShadowMode.DISABLED);
      }
      modelAttachedRef.current.delete(projectId);
      modelSourceUrlRef.current.delete(projectId);
      retainAttachedBytes();
      viewer.scene.requestRender();
    };

    const hideLoadUi = () => {
      if (modelLoadUiDelayRef.current != null) {
        window.clearTimeout(modelLoadUiDelayRef.current);
        modelLoadUiDelayRef.current = null;
      }
      modelLoadUiPayloadRef.current = null;
      modelLoadUiVisibleRef.current = false;
      setModelLoadUi({
        active: false,
        label: "",
        remaining: 0,
        attached: modelAttachedRef.current.size,
        budget: gpuModelBudget(),
        cacheLabel: "",
      });
    };

    const publishLoadUi = () => {
      const remaining =
        modelLoadingIdsRef.current.size + modelLoadQueueRef.current.length;
      const budget = gpuModelBudget();
      const attached = modelAttachedRef.current.size;
      const stats = getGlbMemoryStats();
      if (remaining <= 0) {
        if (modelLoadUiVisibleRef.current || modelLoadUiDelayRef.current != null) {
          hideLoadUi();
        }
        return;
      }
      const currentId =
        [...modelLoadingIdsRef.current][0] ?? modelLoadQueueRef.current[0];
      const p = currentId
        ? projectsRef.current.find((x) => x.id === currentId)
        : undefined;
      const payload = {
        label: p ? `Streaming ${displayNameForProject(p)}` : "Streaming 3D models",
        remaining,
        attached,
        budget,
        cacheLabel: `${formatBytesShort(stats.bytes)} cached of ${formatBytesShort(stats.budget)}`,
      };
      modelLoadUiPayloadRef.current = payload;
      if (modelLoadUiVisibleRef.current) {
        setModelLoadUi({ active: true, ...payload });
        return;
      }
      if (modelLoadUiDelayRef.current != null) return;
      modelLoadUiDelayRef.current = window.setTimeout(() => {
        modelLoadUiDelayRef.current = null;
        const next = modelLoadUiPayloadRef.current;
        if (!next) return;
        modelLoadUiVisibleRef.current = true;
        setModelLoadUi({ active: true, ...next });
      }, MODEL_LOAD_UI_DELAY_MS);
    };

    const slotsOpen = () => {
      const budget = gpuModelBudget();
      return (
        budget -
        modelAttachedRef.current.size -
        modelLoadingIdsRef.current.size
      );
    };

    const sortQueueNearest = () => {
      const selected = selectedIdRef.current;
      modelLoadQueueRef.current.sort((a, b) => {
        if (a === selected) return -1;
        if (b === selected) return 1;
        const xa = xformsRef.current.get(a);
        const xb = xformsRef.current.get(b);
        if (!xa) return 1;
        if (!xb) return -1;
        return cameraDistanceTo(xa.lon, xa.lat) - cameraDistanceTo(xb.lon, xb.lat);
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
        const dist = cameraDistanceTo(xf.lon, xf.lat);
        const force = selectedIdRef.current === projectId;
        const unloadR = modelUnloadRadiusM(modelLoadRadiusM(cameraHeightM()));
        if (!force && (unloadR <= 0 || dist > unloadR)) return;
        if (!force && slotsOpen() < 0) return;

        // Blob if already in RAM; otherwise the HTTP URL so Cesium streams instead
        // of waiting for a 100MB+ ArrayBuffer before the first triangle.
        const uri = resolveGlbUrlForAttach(abs);
        const onGround = Math.abs(xf.heightM) < 1e-4;
        const heightRef = onGround
          ? Cesium.HeightReference.CLAMP_TO_GROUND
          : Cesium.HeightReference.RELATIVE_TO_GROUND;
        const scale = modelScaleValue(p, xf.scaleMultiplier);
        touchGlbCache(abs);

        attachProjectGlbModel(ent, {
          uri,
          scale,
          heightReference: heightRef,
          skipShadows: modelAttachedRef.current.size >= 8,
        });
        applyXformToEntity(ent, p, xf);
        modelAttachedRef.current.add(projectId);
        modelSourceUrlRef.current.set(projectId, abs);
        viewer.scene.requestRender();
      } catch (err) {
        console.warn("[CesiumMap] model attach failed:", projectId, err);
        modelAttachedRef.current.delete(projectId);
        modelSourceUrlRef.current.delete(projectId);
      } finally {
        modelLoadingIdsRef.current.delete(projectId);
        publishLoadUi();
      }
    };

    const pumpQueue = () => {
      if (cancelled || viewer.isDestroyed()) return;
      if (cameraMovingRef.current) return;
      sortQueueNearest();
      while (modelLoadQueueRef.current.length > 0) {
        const open = slotsOpen();
        if (open <= 0) break;
        const next = modelLoadQueueRef.current[0];
        const p = next ? projectsRef.current.find((x) => x.id === next) : undefined;
        const cached = next && p ? isGlbCached(absoluteAssetUrl(projectModelUrl(p))) : false;
        const cap = modelLoadConcurrency(Boolean(cached));
        if (modelLoadBusyRef.current >= cap) break;
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
      if (cameraMovingRef.current) return;
      const height = cameraHeightM();
      const loadR = modelLoadRadiusM(height);
      const unloadR = modelUnloadRadiusM(loadR);
      const budget = gpuModelBudget();
      const selected = selectedIdRef.current;
      let changed = false;

      type Scored = { id: string; dist: number; force: boolean };
      const stay: Scored[] = [];
      const want: Scored[] = [];

      for (const id of [...loadedIdsRef.current]) {
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
        const force = selected === id;
        const attached = modelAttachedRef.current.has(id);
        if (attached) {
          if (force || (unloadR > 0 && dist < unloadR)) {
            stay.push({ id, dist, force });
          } else {
            detachModel(id);
            changed = true;
          }
        } else if (force || (loadR > 0 && dist <= loadR)) {
          want.push({ id, dist, force });
        }
      }

      stay.sort((a, b) => {
        if (a.force !== b.force) return a.force ? -1 : 1;
        return a.dist - b.dist;
      });
      if (stay.length > budget) {
        for (const extra of stay.slice(budget)) {
          if (extra.force) continue;
          detachModel(extra.id);
          changed = true;
        }
        stay.length = Math.min(stay.length, budget);
      }

      const keepIds = new Set(stay.map((s) => s.id));
      modelLoadQueueRef.current = modelLoadQueueRef.current.filter((id) => {
        if (keepIds.has(id) || modelAttachedRef.current.has(id)) return false;
        return want.some((w) => w.id === id);
      });

      const free = budget - modelAttachedRef.current.size - modelLoadingIdsRef.current.size;
      if (free > 0) {
        want.sort((a, b) => {
          if (a.force !== b.force) return a.force ? -1 : 1;
          return a.dist - b.dist;
        });
        let slots = free;
        for (const w of want) {
          if (slots <= 0) break;
          if (modelAttachedRef.current.has(w.id) || modelLoadingIdsRef.current.has(w.id)) {
            continue;
          }
          enqueue(w.id);
          slots -= 1;
          changed = true;
        }
      }

      retainAttachedBytes();
      if (changed) viewer.scene.requestRender();
    };

    reconcileLod();
    lodReconcileRef.current = reconcileLod;
    const onMoveStart = () => {
      cameraMovingRef.current = true;
      setSceneCameraMoving(true);
    };
    const onMoveEnd = () => {
      cameraMovingRef.current = false;
      setSceneCameraMoving(false);
      reconcileLod();
      pumpQueue();
    };
    let lodChangedAt = 0;
    const onCamChanged = () => {
      if (cameraMovingRef.current || sceneIsLagging()) return;
      const now = performance.now();
      if (now - lodChangedAt < 220) return;
      lodChangedAt = now;
      reconcileLod();
    };
    const removeMoveStart = viewer.camera.moveStart.addEventListener(onMoveStart);
    const removeMoveEnd = viewer.camera.moveEnd.addEventListener(onMoveEnd);
    const removeCamChanged = viewer.camera.changed.addEventListener(onCamChanged);
    const interval = window.setInterval(() => {
      if (cameraMovingRef.current) return;
      reconcileLod();
    }, 1200);

    return () => {
      cancelled = true;
      lodReconcileRef.current = null;
      window.clearInterval(interval);
      if (modelLoadUiDelayRef.current != null) {
        window.clearTimeout(modelLoadUiDelayRef.current);
        modelLoadUiDelayRef.current = null;
      }
      modelLoadQueueRef.current = [];
      modelLoadingIdsRef.current.clear();
      hideLoadUi();
      if (typeof removeMoveStart === "function") removeMoveStart();
      if (typeof removeMoveEnd === "function") removeMoveEnd();
      if (typeof removeCamChanged === "function") removeCamChanged();
    };
  }, [viewerReady]);

  // Force-load GLB when user selects a project (even if camera is far).
  useEffect(() => {
    if (!selectedId || !viewerReady) return;
    lodReconcileRef.current?.();
  }, [selectedId, viewerReady]);

  // Project list changed — re-score nearby twins without cancelling in-flight loads.
  useEffect(() => {
    if (!viewerReady) return;
    lodReconcileRef.current?.();
  }, [projects, viewerReady]);

  // Non-uniform width/depth/height: Cesium Entity scale is uniform, so stretch
  // the loaded Model primitive each frame after the visualizer writes modelMatrix.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;
    const remove = viewer.scene.preRender.addEventListener(() => {
      if (viewer.isDestroyed()) return;
      const wanted = new Map<Cesium.Entity, LocalXform>();
      for (const [id, xf] of xformsRef.current) {
        const sx = xf.scaleX ?? 1;
        const sy = xf.scaleY ?? 1;
        const sz = xf.scaleZ ?? 1;
        if (Math.abs(sx - 1) < 1e-5 && Math.abs(sy - 1) < 1e-5 && Math.abs(sz - 1) < 1e-5) {
          continue;
        }
        const ent = viewer.entities.getById(entityIdFor(id));
        if (ent) wanted.set(ent, xf);
      }
      if (wanted.size === 0) return;
      forEachModelPrimitive(viewer.scene.primitives, (prim) => {
        const owner = prim.id;
        const xf =
          owner instanceof Cesium.Entity
            ? wanted.get(owner)
            : undefined;
        if (!xf || !prim.modelMatrix) return;
        _stretchScale.x = xf.scaleX ?? 1;
        _stretchScale.y = xf.scaleY ?? 1;
        _stretchScale.z = xf.scaleZ ?? 1;
        Cesium.Matrix4.multiplyByScale(prim.modelMatrix, _stretchScale, prim.modelMatrix);
      });
    });
    return () => {
      try {
        if (typeof remove === "function") remove();
      } catch {
        /* viewer gone */
      }
    };
  }, [viewerReady]);

  // Warm RAM cache for small catalog GLBs so the next attach is a blob URL, not a refetch.
  useEffect(() => {
    if (!viewerReady) return;
    const urls = [
      ...new Set(
        projects
          .filter((p) => p?.location?.lon && p?.location?.lat && !p.siteMarkerOnly)
          .map((p) => absoluteAssetUrl(projectModelUrl(p))),
      ),
    ].filter(isCatalogGlbUrl);
    if (urls.length === 0) return;
    void prefetchGlbUrls(urls, 3);
  }, [projects, viewerReady]);

  const persistTransform = useCallback(async (projectId: string) => {
    const xf = xformsRef.current.get(projectId);
    if (!xf || !xf.dirty || xf.modelLocked) return;
    setTransformSaving(true);
    setTransformMessage(null);
    const patch: Partial<Project> = {
      location: { lat: xf.lat, lon: xf.lon },
      rotation: xf.rotationDeg,
      rotationPitch: xf.pitchDeg ?? 0,
      rotationRoll: xf.rollDeg ?? 0,
      modelScale: xf.scaleMultiplier,
      modelScaleX: xf.scaleX ?? 1,
      modelScaleY: xf.scaleY ?? 1,
      modelScaleZ: xf.scaleZ ?? 1,
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

  const refreshEditGizmo = useCallback((resize = true) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const sel = selectedIdRef.current;
    const xf = sel ? xformsRef.current.get(sel) : undefined;
    const p = sel ? projectsRef.current.find((x) => x.id === sel) : undefined;
    const show = Boolean(
      editModeRef.current &&
        canEditModelsRef.current &&
        sel &&
        xf &&
        p &&
        !p.siteMarkerOnly &&
        !xf.modelLocked &&
        !modelsFrozenRef.current,
    );
    const h = viewer.camera.positionCartographic?.height ?? 400;
    try {
      syncEditGizmo(viewer, {
        show,
        lon: xf?.lon ?? 0,
        lat: xf?.lat ?? 0,
        heightM: xf?.heightM ?? 0,
        rotationDeg: xf?.rotationDeg ?? 0,
        scaleMultiplier: xf?.scaleMultiplier ?? 1,
        tool: editToolRef.current,
        axis: editAxisRef.current,
        cameraHeightM: h,
        resize,
      });
      if (!viewer.isDestroyed()) viewer.scene.requestRender();
    } catch (err) {
      console.warn("[CesiumMap] gizmo sync skipped:", err);
    }
  }, []);
  const refreshEditGizmoRef = useRef(refreshEditGizmo);
  refreshEditGizmoRef.current = refreshEditGizmo;

  const syncUndoUi = useCallback(() => {
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(redoStackRef.current.length);
  }, []);

  const pushEditUndo = useCallback(
    (projectId: string) => {
      if (!editModeRef.current) return;
      const xf = xformsRef.current.get(projectId);
      if (!xf || xf.modelLocked) return;
      const snap = snapFromXform(projectId, xf);
      const top = undoStackRef.current[undoStackRef.current.length - 1];
      if (top && poseSnapEqual(top, snap)) return;
      undoStackRef.current.push(snap);
      if (undoStackRef.current.length > MAX_EDIT_UNDO) undoStackRef.current.shift();
      redoStackRef.current = [];
      syncUndoUi();
    },
    [syncUndoUi],
  );

  const dropEditUndoIfUnchanged = useCallback(
    (projectId: string) => {
      const xf = xformsRef.current.get(projectId);
      const top = undoStackRef.current[undoStackRef.current.length - 1];
      if (!xf || !top) return;
      if (poseSnapEqual(top, snapFromXform(projectId, xf))) {
        undoStackRef.current.pop();
        syncUndoUi();
      }
    },
    [syncUndoUi],
  );

  const applyEditPoseSnap = useCallback((snap: EditPoseSnap, message: string) => {
    const xf = xformsRef.current.get(snap.projectId);
    const p = projectsRef.current.find((x) => x.id === snap.projectId);
    const viewer = viewerRef.current;
    if (!xf || !p || xf.modelLocked) return false;
    writeXformFromSnap(xf, snap);
    xf.dirty = true;
    if (viewer && !viewer.isDestroyed()) {
      const ent = viewer.entities.getById(entityIdFor(snap.projectId));
      if (ent) applyXformToEntity(ent, p, xf);
      viewer.scene.requestRender();
    }
    if (selectedIdRef.current !== snap.projectId) setSelectedId(snap.projectId);
    setTransformDirty(true);
    setTransformMessage(message);
    window.setTimeout(() => setTransformMessage(null), 1600);
    bumpXform((n) => n + 1);
    refreshEditGizmoRef.current(false);
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persistTransformRef.current(snap.projectId);
    }, 280);
    return true;
  }, []);

  const undoEditPose = useCallback(() => {
    if (!editModeRef.current || !canEditModelsRef.current || dragActiveRef.current) return;
    const snap = undoStackRef.current.pop();
    if (!snap) return;
    const xf = xformsRef.current.get(snap.projectId);
    if (!xf || xf.modelLocked) {
      if (xf?.modelLocked) undoStackRef.current.push(snap);
      syncUndoUi();
      return;
    }
    const current = snapFromXform(snap.projectId, xf);
    if (!poseSnapEqual(current, snap)) redoStackRef.current.push(current);
    if (redoStackRef.current.length > MAX_EDIT_UNDO) redoStackRef.current.shift();
    applyEditPoseSnap(snap, "Undone");
    syncUndoUi();
  }, [applyEditPoseSnap, syncUndoUi]);

  const redoEditPose = useCallback(() => {
    if (!editModeRef.current || !canEditModelsRef.current || dragActiveRef.current) return;
    const snap = redoStackRef.current.pop();
    if (!snap) return;
    const xf = xformsRef.current.get(snap.projectId);
    if (!xf || xf.modelLocked) {
      if (xf?.modelLocked) redoStackRef.current.push(snap);
      syncUndoUi();
      return;
    }
    const current = snapFromXform(snap.projectId, xf);
    if (!poseSnapEqual(current, snap)) {
      undoStackRef.current.push(current);
      if (undoStackRef.current.length > MAX_EDIT_UNDO) undoStackRef.current.shift();
    }
    applyEditPoseSnap(snap, "Redone");
    syncUndoUi();
  }, [applyEditPoseSnap, syncUndoUi]);

  const pushEditUndoRef = useRef(pushEditUndo);
  pushEditUndoRef.current = pushEditUndo;
  const dropEditUndoIfUnchangedRef = useRef(dropEditUndoIfUnchanged);
  dropEditUndoIfUnchangedRef.current = dropEditUndoIfUnchanged;
  const undoEditPoseRef = useRef(undoEditPose);
  undoEditPoseRef.current = undoEditPose;
  const redoEditPoseRef = useRef(redoEditPose);
  redoEditPoseRef.current = redoEditPose;

  useEffect(() => {
    refreshEditGizmo(true);
  }, [refreshEditGizmo, selectedId, editMode, editTool, editAxis, viewerReady, modelsFrozen]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady || !editMode) return;
    const onCamChanged = () => {
      resizeEditGizmo(viewer);
    };
    const onZoomEnd = () => refreshEditGizmoRef.current(true);
    const remChanged = viewer.camera.changed.addEventListener(onCamChanged);
    const rem = viewer.camera.moveEnd.addEventListener(onZoomEnd);
    return () => {
      if (typeof remChanged === "function") remChanged();
      if (typeof rem === "function") rem();
    };
  }, [viewerReady, editMode]);

  // ── Pointer interactions: select / move / rotate / scale / place ─────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    let moving = false;
    let rotating = false;
    let scaling = false;
    let dragAxis: EditAxis = "free";
    let didDrag = false;
    let lastX = 0;
    let lastY = 0;
    let lastAngle = 0;
    let startLon = 0;
    let startLat = 0;
    let startH = 0;
    let startRot = 0;
    let startScale = 1;
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
      const sel = selectedIdRef.current;
      if (!sel) return;
      const xf = xformsRef.current.get(sel);
      if (!xf || xf.modelLocked) return;
      const tool = editToolRef.current;
      const handle = pickGizmoHandle(viewer, click.position);
      const hitId = pickProjectId(viewer, click.position);
      const begin = (kind: "move" | "rotate" | "scale", axis: EditAxis) => {
        moving = kind === "move";
        rotating = kind === "rotate";
        scaling = kind === "scale";
        dragAxis = axis;
        didDrag = false;
        dragActiveRef.current = true;
        lastX = click.position.x;
        lastY = click.position.y;
        startLon = xf.lon;
        startLat = xf.lat;
        startH = xf.heightM;
        startRot = xf.rotationDeg;
        startScale = xf.scaleMultiplier;
        lastAngle = gizmoScreenAngle(viewer, xf.lon, xf.lat, xf.heightM, click.position) ?? 0;
        pushEditUndoRef.current(sel);
        setCameraInteractive(viewer, false);
      };
      if (handle) {
        if (handle === "rotate-x" || handle === "rotate-y" || handle === "rotate-z") {
          begin("rotate", gizmoHandleToAxis(handle));
        } else if (handle === "scale" || handle === "scale-x" || handle === "scale-y" || handle === "scale-z") {
          begin("scale", gizmoHandleToAxis(handle));
        } else {
          begin("move", gizmoHandleToAxis(handle));
        }
        return;
      }
      if (tool === "select") return;
      if (hitId !== sel) return;
      begin(
        tool === "rotate" ? "rotate" : tool === "scale" ? "scale" : "move",
        editAxisRef.current,
      );
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
      dragActiveRef.current = true;
      lastX = click.position.x;
      pushEditUndoRef.current(hitId);
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
        scaling = false;
        setEditGizmoHover(viewer, null);
        return;
      }

      if (!moving && !rotating && !scaling) {
        const hover = pickGizmoHandle(viewer, move.endPosition);
        setEditGizmoHover(viewer, hover);
        if (hover) viewer.canvas.style.cursor = "pointer";
        else if (viewer.canvas.style.cursor === "pointer") viewer.canvas.style.cursor = "";
      } else if (moving || rotating || scaling) {
        const prefix = rotating ? "rotate" : scaling ? "scale" : "move";
        const h =
          dragAxis === "x"
            ? (`${prefix}-x` as const)
            : dragAxis === "y"
              ? (`${prefix}-y` as const)
              : dragAxis === "z"
                ? (`${prefix}-z` as const)
                : scaling
                  ? "scale"
                  : null;
        setEditGizmoHover(viewer, h);
      }

      const sel = selectedIdRef.current;
      if (!sel) return;
      const xf = xformsRef.current.get(sel);
      const p = projectsRef.current.find((x) => x.id === sel);
      if (!xf || !p || xf.modelLocked) return;
      const ent = viewer.entities.getById(entityIdFor(sel));
      if (!ent) return;

      const pose = () => {
        applyXformToEntity(ent, p, xf);
        xf.dirty = true;
        didDrag = true;
        viewer.scene.requestRender();
        setTransformDirty(true);
        setTransformMessage(null);
        bumpXform((n) => n + 1);
        refreshEditGizmoRef.current(false);
      };

      if (moving) {
        if (dragAxis === "z") {
          const dy = lastY - move.endPosition.y;
          lastY = move.endPosition.y;
          xf.heightM = Math.max(-50, Math.min(500, xf.heightM + dy * 0.08));
          pose();
        } else if (dragAxis === "xz" || dragAxis === "yz") {
          const dy = lastY - move.endPosition.y;
          lastY = move.endPosition.y;
          xf.heightM = Math.max(-50, Math.min(500, xf.heightM + dy * 0.08));
          const ll = pickGlobeLngLat(viewer, move.endPosition);
          if (ll) {
            if (dragAxis === "xz") {
              xf.lon = ll.lng;
              xf.lat = startLat;
            } else {
              xf.lon = startLon;
              xf.lat = ll.lat;
            }
          }
          pose();
        } else {
          const ll = pickGlobeLngLat(viewer, move.endPosition);
          if (!ll) return;
          if (dragAxis === "x") {
            xf.lon = ll.lng;
            xf.lat = startLat;
          } else if (dragAxis === "y") {
            xf.lon = startLon;
            xf.lat = ll.lat;
          } else {
            xf.lon = ll.lng;
            xf.lat = ll.lat;
          }
          pose();
        }
      } else if (rotating) {
        const ang = gizmoScreenAngle(viewer, xf.lon, xf.lat, xf.heightM, move.endPosition);
        if (ang == null) {
          const dx = move.endPosition.x - lastX;
          lastX = move.endPosition.x;
          xf.rotationDeg = (xf.rotationDeg - dx * 0.5 + 3600) % 360;
        } else {
          let d = ((ang - lastAngle) * 180) / Math.PI;
          if (d > 180) d -= 360;
          if (d < -180) d += 360;
          lastAngle = ang;
          if (dragAxis === "x") {
            xf.pitchDeg = Math.max(-85, Math.min(85, (xf.pitchDeg ?? 0) + d));
          } else if (dragAxis === "y") {
            xf.rollDeg = Math.max(-85, Math.min(85, (xf.rollDeg ?? 0) + d));
          } else {
            xf.rotationDeg = (xf.rotationDeg - d + 3600) % 360;
          }
        }
        pose();
      } else if (scaling) {
        const dy = lastY - move.endPosition.y;
        lastY = move.endPosition.y;
        const factor = dy > 0 ? 1 + dy * 0.008 : 1 / (1 + Math.abs(dy) * 0.008);
        applyStretchFactor(xf, dragAxis, factor);
        pose();
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
      const was = moving || rotating || scaling;
      const dragged = didDrag;
      moving = false;
      rotating = false;
      scaling = false;
      dragAxis = "free";
      dragActiveRef.current = false;
      setCameraInteractive(viewer, true);
      if (was && selectedIdRef.current) {
        if (dragged) {
          suppressClick = true;
          void persistTransformRef.current(selectedIdRef.current);
        } else {
          dropEditUndoIfUnchangedRef.current(selectedIdRef.current);
        }
      }
    };

    handler.setInputAction(endDrag, Cesium.ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction(endDrag, Cesium.ScreenSpaceEventType.RIGHT_UP);

    const onGizmoLeave = () => setEditGizmoHover(viewer, null);
    viewer.canvas.addEventListener("mouseleave", onGizmoLeave);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (moving || rotating || scaling) return;

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
        if (pickGizmoHandle(viewer, click.position)) {
          viewer.selectedEntity = undefined;
          return;
        }
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
        onProjectSelectRef.current?.(hitId);
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

    // Native wheel — scale the selected model when the cursor is on it, else zoom the globe.
    const onWheel = (e: WheelEvent) => {
      if (
        !modelsFrozenRef.current &&
        editModeRef.current &&
        canEditModelsRef.current &&
        selectedIdRef.current
      ) {
        const sel = selectedIdRef.current;
        const xf = xformsRef.current.get(sel);
        const p = projectsRef.current.find((x) => x.id === sel);
        if (xf && p && !xf.modelLocked) {
          const rect = viewer.canvas.getBoundingClientRect();
          const pos = new Cesium.Cartesian2(e.clientX - rect.left, e.clientY - rect.top);
          const overModel = pickProjectId(viewer, pos) === sel;
          const overGizmo = Boolean(pickGizmoHandle(viewer, pos));
          if (overModel || overGizmo) {
            e.preventDefault();
            e.stopPropagation();
            if (!scaleUndoArmedRef.current) {
              pushEditUndoRef.current(sel);
              scaleUndoArmedRef.current = true;
            }
            const grow = e.deltaY < 0;
            const step = e.ctrlKey || e.metaKey ? 1.35 : e.shiftKey ? 1.03 : 1.12;
            const factor = grow ? step : 1 / step;
            applyStretchFactor(xf, editAxisRef.current, factor);
            xf.dirty = true;
            const ent = viewer.entities.getById(entityIdFor(sel));
            if (ent) {
              applyXformToEntity(ent, p, xf);
              viewer.scene.requestRender();
            }
            setTransformDirty(true);
            setTransformMessage(null);
            bumpXform((n) => n + 1);
            if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = window.setTimeout(() => {
              scaleUndoArmedRef.current = false;
              void persistTransformRef.current(sel);
            }, 450);
            return;
          }
        }
      }

      e.preventDefault();
      e.stopPropagation();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      if (e.deltaMode === 2) dy *= 800;
      const mag = Math.min(1.6, Math.max(0.45, Math.abs(dy) / 90));
      const h = cameraHeightAboveSurface(viewer);
      const amount = Math.max(40, h * 0.32 * mag);
      if (dy < 0) viewer.camera.zoomIn(amount);
      else viewer.camera.zoomOut(amount);
      resizeEditGizmo(viewer);
      viewer.scene.requestRender();
    };
    viewer.canvas.addEventListener("wheel", onWheel, { passive: false });

    // Block browser context menu on right-drag rotate
    const onContextMenu = (e: Event) => {
      if (selectedIdRef.current && canEditModelsRef.current) e.preventDefault();
    };
    viewer.canvas.addEventListener("contextmenu", onContextMenu);

    const heldMove = new Set<string>();
    let walkLastMs = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (e.key === "Escape") {
        setSelectedId(null);
        setSelectedTropicalId(null);
        setConfirmDelete(false);
        setEditOpen(false);
        setEditTool("select");
        setEditAxis("free");
        return;
      }
      const k = e.key.toLowerCase();
      const numberField =
        target instanceof HTMLInputElement && target.type === "number";
      if ((e.ctrlKey || e.metaKey) && k === "z") {
        if (typing && !numberField) return;
        if (!editModeRef.current || !canEditModelsRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) redoEditPoseRef.current();
        else undoEditPoseRef.current();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === "y") {
        if (typing && !numberField) return;
        if (!editModeRef.current || !canEditModelsRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        redoEditPoseRef.current();
        return;
      }
      if (typing) return;
      if (e.ctrlKey || e.metaKey) return;
      if (k === "w" || k === "a" || k === "s" || k === "d") {
        e.preventDefault();
        heldMove.add(k);
        if (e.shiftKey) heldMove.add("shift");
        viewer.camera.cancelFlight();
        viewer.scene.requestRender();
        return;
      }
      if (e.key === "Shift") heldMove.add("shift");
      if (!editModeRef.current || !canEditModelsRef.current) return;
      if (k === "g") {
        e.preventDefault();
        setEditTool("move");
      } else if (k === "r") {
        e.preventDefault();
        setEditTool("rotate");
      } else if (k === "x" || k === "y" || k === "z") {
        e.preventDefault();
        const next: EditAxis = k === "x" ? "x" : k === "y" ? "y" : "z";
        setEditAxis((prev) => (prev === next ? "free" : next));
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      heldMove.delete(k);
      if (e.key === "Shift") heldMove.delete("shift");
    };
    const onBlurWalk = () => {
      heldMove.clear();
      walkLastMs = 0;
    };
    const onWalkTick = () => {
      if (viewer.isDestroyed()) return;
      const moving = heldMove.has("w") || heldMove.has("a") || heldMove.has("s") || heldMove.has("d");
      if (!moving) {
        walkLastMs = 0;
        return;
      }
      const now = performance.now();
      const dt = walkLastMs ? Math.min(0.05, (now - walkLastMs) / 1000) : 0.016;
      walkLastMs = now;
      moveCameraWasd(viewer, heldMove, dt);
      viewer.scene.requestRender();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlurWalk);
    const removeWalkTick = viewer.scene.preUpdate.addEventListener(onWalkTick);

    return () => {
      try {
        handler.destroy();
      } catch {
        /* already destroyed */
      }
      if (!viewer.isDestroyed()) {
        setCameraInteractive(viewer, true);
        try {
          viewer.canvas.removeEventListener("wheel", onWheel);
          viewer.canvas.removeEventListener("contextmenu", onContextMenu);
          viewer.canvas.removeEventListener("mouseleave", onGizmoLeave);
        } catch {
          /* canvas gone with viewer */
        }
      }
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlurWalk);
      try {
        removeWalkTick();
      } catch {
        /* listener already gone */
      }
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
      if (viewerAlive(viewer)) viewer.canvas.style.cursor = "";
    };
  }, [placementMode, blockRemoverActive, placementTool, viewerReady]);

  // Camera zoom stays on. Wheel scales a model only when the cursor is on it (see onWheel).

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
            cameraHeightM: () => viewer.camera.positionCartographic.height,
            lon: xf?.lon,
            lat: xf?.lat,
          });
          if (xf) {
            applyXformToEntity(ent, nextProject, xf);
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
      const renamed = editDraft.name.trim();
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
          if (renamed && currentProject) {
            const xf = xformsRef.current.get(selectedId);
            applyResolvedPlaceName(
              viewer,
              { ...currentProject, name: renamed },
              renamed,
              xf ? { lon: xf.lon, lat: xf.lat } : undefined,
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

  async function saveProjectName(name: string) {
    if (!selectedId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const currentProject = projectsRef.current.find((p) => p.id === selectedId);
    try {
      await patchProject(selectedId, { name: trimmed });
    } catch {
      await updateProjectInFirestore(selectedId, { name: trimmed });
    }
    onProjectPatch?.(selectedId, { name: trimmed });
    const viewer = viewerRef.current;
    if (viewerAlive(viewer) && currentProject) {
      const xf = xformsRef.current.get(selectedId);
      applyResolvedPlaceName(
        viewer,
        { ...currentProject, name: trimmed },
        trimmed,
        xf ? { lon: xf.lon, lat: xf.lat } : undefined,
      );
      viewer.scene.requestRender();
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

  function commitLocalPose(
    projectId: string,
    next: Partial<LocalXform>,
    autoSave = false,
    recordUndo = true,
  ) {
    const xf = xformsRef.current.get(projectId);
    const p = projectsRef.current.find((x) => x.id === projectId);
    const viewer = viewerRef.current;
    if (!xf || !p || xf.modelLocked || !canEditModels || !editMode) return;
    if (recordUndo) pushEditUndo(projectId);
    Object.assign(xf, next);
    xf.dirty = true;
    const ent = viewer && !viewer.isDestroyed() ? viewer.entities.getById(entityIdFor(projectId)) : undefined;
    if (ent) {
      applyXformToEntity(ent, p, xf);
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

  const quakeHeatSites = useMemo(
    () =>
      earthquakeGrid.map((c) => ({
        lon: c.lon,
        lat: c.lat,
        weight: quakeHeatWeight(c.cls, c.confidence),
      })),
    [earthquakeGrid],
  );

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
        {editMode && canEditModels && !modelsFrozen && (
          <div
            className="cesium-edit-tools"
            role="toolbar"
            aria-label="Edit tools"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(
              [
                ["move", "Move"],
                ["rotate", "Rotate"],
                ["scale", "Size"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`cesium-edit-tool${editTool === id ? " is-on" : ""}`}
                title={label}
                aria-pressed={editTool === id}
                onClick={() => setEditTool(id)}
              >
                {label}
              </button>
            ))}
            <span className="cesium-edit-tools-split" aria-hidden="true" />
            <button
              type="button"
              className="cesium-edit-tool"
              title="Undo (Ctrl+Z)"
              disabled={undoDepth === 0}
              onClick={() => undoEditPose()}
            >
              Undo
            </button>
            <button
              type="button"
              className="cesium-edit-tool"
              title="Redo (Ctrl+Shift+Z)"
              disabled={redoDepth === 0}
              onClick={() => redoEditPose()}
            >
              Redo
            </button>
          </div>
        )}
        {earthquakeEnabled && viewerReady > 0 && quakeHeatSites.length > 0 && (
          <GoogleHeatmapOverlay
            viewer={viewerRef.current}
            sites={quakeHeatSites}
            title="Earthquake-prone heatmap"
            copy="Siting risk mula sa model + PHIVOLCS EIL 2014. Hindi live shaking."
            lowLabel="LOW"
            highLabel="HIGH · iwasan"
          />
        )}
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
                (containerRef.current?.clientWidth ?? 360) - 290,
              ),
              top: Math.min(
                hoveredProject.y + 14,
                (containerRef.current?.clientHeight ?? 400) - 160,
              ),
              pointerEvents: "none",
              zIndex: 14,
              width: 280,
              maxWidth: "min(280px, calc(100% - 24px))",
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
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{hoveredProject.project.name}</div>
            {hoveredProject.coords && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.01em",
                  color: "#ffe566",
                  marginBottom: 6,
                  whiteSpace: "nowrap",
                }}
              >
                {hoveredProject.coords}
              </div>
            )}
            <div style={{ opacity: 0.8, fontSize: 11, marginBottom: 6 }}>
              {hoveredProject.streetLabel || hoverTypeLabel(hoveredProject.project)}
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
                  ? `${modelLoadUi.remaining} nearby · ${modelLoadUi.attached}/${modelLoadUi.budget} in GPU`
                  : `${modelLoadUi.attached}/${modelLoadUi.budget} models in view`}
                {modelLoadUi.cacheLabel ? ` · ${modelLoadUi.cacheLabel}` : ""}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedTropicalSystem && !modelsFrozen && (
        <div
          style={{
            position: "absolute",
            top: "calc(var(--map-hud-top, 48px) + 8px)",
            left: 68,
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
            top: "calc(var(--map-hud-top, 48px) + 132px)",
            left: 68,
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
        className={`cesium-pick-chrome${selectedProject && !modelsFrozen && editMode ? " has-hud" : ""}`}
      >
      {panelProject && !modelsFrozen && !editMode && !readOnly && (
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
          onRename={canEditModels ? saveProjectName : undefined}
          locationLabel={resolvedPlaceNameRef.current.get(panelProject.id) ?? null}
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
          earthquakeScore={siteQuakeScore}
        />
      )}

      {selectedProject && !modelsFrozen && editMode && (
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
                    {formatLonLat(selectedXform.lat, selectedXform.lon)}
                    {" · "}
                    {Math.round(selectedXform.rotationDeg)}°
                    {" · ×"}
                    {selectedXform.scaleMultiplier >= 0.1
                      ? selectedXform.scaleMultiplier.toFixed(2)
                      : selectedXform.scaleMultiplier.toFixed(3)}
                    {(selectedXform.scaleX ?? 1) !== 1 ||
                    (selectedXform.scaleY ?? 1) !== 1 ||
                    (selectedXform.scaleZ ?? 1) !== 1
                      ? ` · W${(selectedXform.scaleX ?? 1).toFixed(2)} D${(selectedXform.scaleY ?? 1).toFixed(2)} H${(selectedXform.scaleZ ?? 1).toFixed(2)}`
                      : ""}
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
                onFocus={() => selectedId && pushEditUndo(selectedId)}
                onChange={(e) => {
                  const lon = Number(e.target.value);
                  if (!Number.isFinite(lon) || !selectedId) return;
                  commitLocalPose(selectedId, { lon }, false, false);
                }}
                onBlur={() => {
                  if (!selectedId) return;
                  dropEditUndoIfUnchanged(selectedId);
                  void persistTransform(selectedId);
                }}
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
                onFocus={() => selectedId && pushEditUndo(selectedId)}
                onChange={(e) => {
                  const lat = Number(e.target.value);
                  if (!Number.isFinite(lat) || !selectedId) return;
                  commitLocalPose(selectedId, { lat }, false, false);
                }}
                onBlur={() => {
                  if (!selectedId) return;
                  dropEditUndoIfUnchanged(selectedId);
                  void persistTransform(selectedId);
                }}
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
                onFocus={() => selectedId && pushEditUndo(selectedId)}
                onChange={(e) => {
                  const heightM = Number(e.target.value);
                  if (!Number.isFinite(heightM) || !selectedId) return;
                  commitLocalPose(
                    selectedId,
                    { heightM: Math.max(-50, Math.min(500, heightM)) },
                    false,
                    false,
                  );
                }}
                onBlur={() => {
                  if (!selectedId) return;
                  dropEditUndoIfUnchanged(selectedId);
                  void persistTransform(selectedId);
                }}
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

          {canEditModels && editMode && selectedXform && !locked && !selectedProject.siteMarkerOnly && (
            <div className="project-pick-hud-xyz">
              {(
                [
                  ["scaleX", "W", "Width", "#c0392b"],
                  ["scaleY", "D", "Depth", "#27ae60"],
                  ["scaleZ", "H", "Height", "#2980b9"],
                ] as const
              ).map(([key, short, label, color]) => (
                <Fragment key={key}>
                  <span className="project-pick-hud-axis" style={{ color }} title={label}>
                    {short}
                  </span>
                  <input
                    type="number"
                    step="0.05"
                    min={SCALE_MULT_MIN}
                    max={SCALE_MULT_MAX}
                    value={Number((selectedXform[key] ?? 1).toFixed(3))}
                    title={`${label} stretch (1 = original)`}
                    className="project-pick-hud-input"
                    onFocus={() => selectedId && pushEditUndo(selectedId)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n) || !selectedId) return;
                      commitLocalPose(selectedId, { [key]: clampScaleMult(n) }, false, false);
                    }}
                    onBlur={() => {
                      if (!selectedId) return;
                      dropEditUndoIfUnchanged(selectedId);
                      void persistTransform(selectedId);
                    }}
                  />
                  <button
                    type="button"
                    title={`Narrower ${label.toLowerCase()}`}
                    onClick={() =>
                      selectedId &&
                      commitLocalPose(
                        selectedId,
                        { [key]: clampScaleMult((selectedXform[key] ?? 1) / 1.1) },
                        true,
                      )
                    }
                    className="project-pick-hud-nudge"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    title={`Widen ${label.toLowerCase()}`}
                    onClick={() =>
                      selectedId &&
                      commitLocalPose(
                        selectedId,
                        { [key]: clampScaleMult((selectedXform[key] ?? 1) * 1.1) },
                        true,
                      )
                    }
                    className="project-pick-hud-nudge"
                  >
                    +
                  </button>
                </Fragment>
              ))}
              <div className="project-pick-hud-xyz-hint">
                Width / depth / height stretch. Size tool: axis cubes stretch one side; center cube or scroll = overall size.
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
                  <span>
                    {editTool === "rotate"
                      ? "Rotate — drag left/right"
                      : editTool === "scale"
                        ? "Size — X cube widens, Y deepens, Z height. Center / scroll = overall"
                        : "Move — drag the building"}
                  </span>
                  <span>Esc deselect · Ctrl+Z undo · Ctrl+Shift+Z redo</span>
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
