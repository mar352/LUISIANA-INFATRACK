/**
 * CesiumMap — primary globe with sun lighting, shadows, click-to-place,
 * and MapLibre-parity edit: select / left-drag move / right-drag rotate / scroll scale.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { Project, ProjectStatus } from "../types";
import { MODEL_CATALOG, PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from "../types";
import { dateFromSolarHour, getSunPosition, LUISIANA_CENTER } from "../lib/solar";
import { patchProject } from "../lib/api";
import { updateProjectInFirestore } from "../services/firestore-projects";
import { gibsWmtsTileUrl, GIBS_LAYERS, type GibsLayerId } from "../lib/gibs";
import { getCachedGlbUrl } from "../lib/glb-cache";
import { luisianaPaddedBounds } from "../lib/luisiana-bounds";
import { PlaceSidePanel } from "./PlaceSidePanel";

/**
 * When pitched into local 3D and still near the ground, clip tiles to Luisiana.
 * Zoomed out / top-down → full globe (round Earth) stays free to scroll.
 */
const MUNICIPAL_3D_PITCH_RAD = Cesium.Math.toRadians(-75);
const MUNICIPAL_3D_MAX_HEIGHT_M = 45_000;

/** Load full GLB only when camera is this close (meters). */
const MODEL_LOAD_DIST_M = 5500;
/** Drop GPU model (keep pin) when camera is farther than this. */
const MODEL_UNLOAD_DIST_M = 9000;
/** How many GLBs to decode at once — keep low so the PC doesn't melt. */
const MODEL_LOAD_CONCURRENCY = 1;

const MUNICIPAL_OFFICE = { lat: 14.185435, lon: 121.509513 };
const CENTER = { lat: LUISIANA_CENTER.lat, lon: LUISIANA_CENTER.lon };
const HOME_HEIGHT_M = 2200;
const HOME_HEADING = Cesium.Math.toRadians(-15);
const HOME_PITCH = Cesium.Math.toRadians(-35);

export type CesiumMapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  flyHome: () => void;
  toggleTilt: () => void;
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
  projects: Project[];
  visible?: boolean;
  placementMode?: boolean;
  onPlaceClick?: (pos: PlaceClick) => void;
  readOnly?: boolean;
  canAddPhotos?: boolean;
  onDeleteBuilding?: (projectId: string) => void;
  /** NASA GIBS WMTS overlay (precip / climate layers). */
  gibs?: {
    enabled: boolean;
    layer: GibsLayerId;
    date: string;
    opacity: number;
  };
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

const xyzBtnStyle: CSSProperties = {
  cursor: "pointer",
  padding: "4px 6px",
  border: "1px solid var(--stroke)",
  background: "var(--cream-deep)",
  color: "var(--ink)",
  fontSize: 10,
  fontWeight: 700,
  fontFamily: '"Chakra Petch", sans-serif',
};

function entityIdFor(projectId: string) {
  return `project-${projectId}`;
}

function projectIdFromEntity(id: string | undefined): string | null {
  if (!id || !id.startsWith("project-")) return null;
  return id.slice("project-".length);
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

function pickProjectId(viewer: Cesium.Viewer, screenPos: Cesium.Cartesian2): string | null {
  const picked = viewer.scene.pick(screenPos);
  if (!Cesium.defined(picked)) return null;
  const id = (picked as { id?: Cesium.Entity }).id;
  if (id instanceof Cesium.Entity) {
    return projectIdFromEntity(id.id);
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

function statusLabel(status: Project["status"]) {
  return PROJECT_STATUS_LABELS[status as ProjectStatus] ?? String(status);
}

function statusColor(status: Project["status"]) {
  return PROJECT_STATUS_COLORS[status as ProjectStatus] ?? "#9b9b9b";
}

export const CesiumMap = forwardRef<CesiumMapHandle, Props>(function CesiumMap(
  {
    solarHour,
    projects,
    visible = true,
    placementMode = false,
    onPlaceClick,
    readOnly = false,
    canAddPhotos = false,
    onDeleteBuilding,
    gibs,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const gibsImageryRef = useRef<Cesium.ImageryLayer | null>(null);
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
  const selectedIdRef = useRef<string | null>(null);
  const placementModeRef = useRef(placementMode);
  const onPlaceClickRef = useRef(onPlaceClick);
  const readOnlyRef = useRef(readOnly);
  const saveTimerRef = useRef<number | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformDirty, setTransformDirty] = useState(false);
  const [transformSaving, setTransformSaving] = useState(false);
  const [transformMessage, setTransformMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<{
    status: ProjectStatus;
    progress: number;
    description: string;
    startDate: string;
    targetEndDate: string;
    budgetTotal: string;
    budgetSpent: string;
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
    placementModeRef.current = placementMode;
  }, [placementMode]);
  useEffect(() => {
    onPlaceClickRef.current = onPlaceClick;
  }, [onPlaceClick]);
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);
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
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(CENTER.lon, CENTER.lat, HOME_HEIGHT_M),
        orientation: { heading: HOME_HEADING, pitch: HOME_PITCH, roll: 0 },
        duration: 1.2,
      });
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
    const hasIon = Boolean(ionToken);
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
      baseLayer: hasIon ? undefined : false,
    });

    if (!hasIon) {
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          credit: "© OpenStreetMap contributors",
          maximumLevel: 19,
        }),
      );
    }

    viewer.clock.shouldAnimate = false;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.dynamicAtmosphereLighting = true;
    viewer.scene.globe.shadows = Cesium.ShadowMode.RECEIVE_ONLY;

    // Luisiana tile clip + fog ONLY in local 3D tilt — never lock the globe.
    const pad = luisianaPaddedBounds();
    const luisianaRect = Cesium.Rectangle.fromDegrees(pad.west, pad.south, pad.east, pad.north);
    viewer.scene.fog.minimumBrightness = 0.05;

    const applyLuisianaScopeForCamera = () => {
      if (viewer.isDestroyed()) return;
      const carto = viewer.camera.positionCartographic;
      if (!carto) return;
      // Pitch near -90° = top-down; greater (e.g. -35°) = 3D tilt.
      const inLocal3d =
        viewer.camera.pitch > MUNICIPAL_3D_PITCH_RAD &&
        carto.height < MUNICIPAL_3D_MAX_HEIGHT_M;

      if (inLocal3d) {
        viewer.scene.globe.cartographicLimitRectangle = luisianaRect;
        viewer.scene.fog.enabled = true;
        viewer.scene.fog.density = 0.00035;
        viewer.scene.fog.screenSpaceErrorFactor = 4.0;
      } else {
        viewer.scene.globe.cartographicLimitRectangle = Cesium.Rectangle.MAX_VALUE;
        viewer.scene.fog.enabled = false;
      }
      tiltedRef.current = inLocal3d;
    };
    applyLuisianaScopeForCamera();
    const removeCamChanged = viewer.camera.changed.addEventListener(applyLuisianaScopeForCamera);
    const removeCamMoveEnd = viewer.camera.moveEnd.addEventListener(applyLuisianaScopeForCamera);

    // Render on demand — continuous redraw cooks weak GPUs while heavy GLBs stream in.
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;

    const sm = viewer.shadowMap;
    sm.softShadows = false;
    sm.darkness = 0.55;
    sm.maximumDistance = 4500;

    (async () => {
      try {
        viewer.terrainProvider = hasIon
          ? await Cesium.createWorldTerrainAsync()
          : new Cesium.EllipsoidTerrainProvider();
      } catch (err) {
        console.warn("[CesiumMap] terrain failed, using ellipsoid:", err);
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      }
    })();

    (async () => {
      if (!hasIon) return;
      try {
        const buildings = await Cesium.createOsmBuildingsAsync();
        buildings.shadows = Cesium.ShadowMode.ENABLED;
        viewer.scene.primitives.add(buildings);
      } catch (err) {
        console.warn("[CesiumMap] OSM Buildings unavailable:", err);
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
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(CENTER.lon, CENTER.lat, HOME_HEIGHT_M),
      orientation: { heading: HOME_HEADING, pitch: HOME_PITCH, roll: 0 },
    });

    viewerRef.current = viewer;
    loadedIdsRef.current.clear();
    setViewerReady((n) => n + 1);

    return () => {
      removeCamChanged();
      removeCamMoveEnd();
      loadedIdsRef.current.clear();
      modelAttachedRef.current.clear();
      modelLoadingIdsRef.current.clear();
      modelLoadQueueRef.current = [];
      gibsImageryRef.current = null;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
  }, [visible]);

  // ── Sync solar clock ─────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const date = dateFromSolarHour(solarHour);
    viewer.clock.currentTime = Cesium.JulianDate.fromDate(date);
    viewer.clock.shouldAnimate = false;

    const pos = getSunPosition(LUISIANA_CENTER.lat, LUISIANA_CENTER.lon, date);
    viewer.shadows = pos.isDaylight;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.light = new Cesium.SunLight({
      intensity: pos.isDaylight ? 2.2 : 0.35,
    });
    viewer.scene.requestRender();
  }, [solarHour, viewerReady]);

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

  // ── Sync project pins (lightweight). GLBs attach via distance LOD + cache. ─
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;

    const nextIds = new Set(
      projects.filter((p) => p?.location?.lon && p?.location?.lat).map((p) => p.id),
    );

    for (const id of [...loadedIdsRef.current]) {
      if (!nextIds.has(id)) {
        const ent = viewer.entities.getById(entityIdFor(id));
        if (ent) viewer.entities.remove(ent);
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
        // Pin only — full GLB is attached later when the camera is nearby (cached).
        ent = viewer.entities.add({
          id: eid,
          name: p.name,
          position,
          orientation: Cesium.Transforms.headingPitchRollQuaternion(
            position,
            new Cesium.HeadingPitchRoll(heading, 0, 0),
          ),
          point: {
            pixelSize: 10,
            color: Cesium.Color.fromCssColorString("#245c3a"),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: heightRef,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            show: new Cesium.CallbackProperty(
              () => !modelAttachedRef.current.has(p.id),
              false,
            ),
          },
          label: {
            text: p.name,
            font: "12px sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -18),
            heightReference: heightRef,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            show: new Cesium.CallbackProperty(
              () => selectedIdRef.current === p.id || !modelAttachedRef.current.has(p.id),
              false,
            ),
          },
        });
        loadedIdsRef.current.add(p.id);
      } else {
        applyEntityPose(ent, xf.lon, xf.lat, xf.rotationDeg, scale, xf.heightM);
        if (ent.label && !xf.dirty) {
          (ent.label as Cesium.LabelGraphics).text = new Cesium.ConstantProperty(p.name);
        }
      }
    }

    viewer.scene.requestRender();
  }, [projects, viewerReady, ensureXform]);

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

        ent.model = new Cesium.ModelGraphics({
          uri,
          scale,
          heightReference: heightRef,
          shadows: Cesium.ShadowMode.CAST_ONLY,
          runAnimations: false,
          maximumScale: undefined,
          minimumPixelSize: 0,
        });
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
      if (modelAttachedRef.current.has(id)) return;
      if (modelLoadingIdsRef.current.has(id)) return;
      if (modelLoadQueueRef.current.includes(id)) return;
      modelLoadQueueRef.current.push(id);
      publishLoadUi();
      pumpQueue();
    };

    const reconcileLod = () => {
      if (cancelled || viewer.isDestroyed()) return;
      const ids = [...loadedIdsRef.current];
      for (const id of ids) {
        const xf = xformsRef.current.get(id);
        if (!xf) continue;
        const dist = cameraDistanceTo(xf.lon, xf.lat);
        const force = selectedIdRef.current === id;
        const attached = modelAttachedRef.current.has(id);

        if ((force || dist <= MODEL_LOAD_DIST_M) && !attached) {
          enqueue(id);
        } else if (!force && dist >= MODEL_UNLOAD_DIST_M && attached) {
          // Don't unload while still decoding
          if (!modelLoadQueueRef.current.includes(id)) {
            detachModel(id);
          }
        }
      }
      viewer.scene.requestRender();
    };

    reconcileLod();
    lodReconcileRef.current = reconcileLod;
    const removeMove = viewer.camera.moveEnd.addEventListener(reconcileLod);
    const removeChanged = viewer.camera.changed.addEventListener(reconcileLod);
    const interval = window.setInterval(reconcileLod, 1500);

    return () => {
      cancelled = true;
      lodReconcileRef.current = null;
      window.clearInterval(interval);
      modelLoadQueueRef.current = [];
      modelLoadingIdsRef.current.clear();
      setModelLoadUi({ active: false, label: "", remaining: 0 });
      if (typeof removeMove === "function") removeMove();
      if (typeof removeChanged === "function") removeChanged();
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

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      if (readOnlyRef.current) return;
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
      if (readOnlyRef.current) return;
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

      const hitId = pickProjectId(viewer, click.position);

      if (placementModeRef.current) {
        if (hitId) {
          setSelectedId(hitId);
          setConfirmDelete(false);
          setEditOpen(false);
          setTransformDirty(Boolean(xformsRef.current.get(hitId)?.dirty));
          return;
        }
        const ll = pickGlobeLngLat(viewer, click.position);
        if (ll) onPlaceClickRef.current?.(ll);
        return;
      }

      if (hitId) {
        setSelectedId(hitId);
        setConfirmDelete(false);
        setEditOpen(false);
        setTransformDirty(Boolean(xformsRef.current.get(hitId)?.dirty));
      } else {
        setSelectedId(null);
        setConfirmDelete(false);
        setEditOpen(false);
      }
      viewer.selectedEntity = undefined;
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Native wheel — Cesium's WHEEL delta is often 0/undefined, which made scale only grow.
    const onWheel = (e: WheelEvent) => {
      if (readOnlyRef.current) return;
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
      if (selectedIdRef.current && !readOnlyRef.current) e.preventDefault();
    };
    viewer.canvas.addEventListener("contextmenu", onContextMenu);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
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
    viewer.canvas.style.cursor = placementMode ? "crosshair" : "";
    return () => {
      if (!viewer.isDestroyed()) viewer.canvas.style.cursor = "";
    };
  }, [placementMode, viewerReady]);

  // While an unlocked model is selected, scroll scales it instead of zooming the camera.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !viewerReady) return;
    const xf = selectedId ? xformsRef.current.get(selectedId) : undefined;
    const scaleMode = Boolean(selectedId && !readOnly && xf && !xf.modelLocked);
    viewer.scene.screenSpaceCameraController.enableZoom = !scaleMode;
    return () => {
      if (!viewer.isDestroyed()) {
        viewer.scene.screenSpaceCameraController.enableZoom = true;
      }
    };
  }, [selectedId, readOnly, viewerReady, transformDirty, transformMessage]);

  async function handleToggleLock() {
    if (!selectedId || readOnly) return;
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
    if (!selectedProject || readOnly) return;
    setEditDraft({
      status: selectedProject.status,
      progress: selectedProject.progress,
      description: selectedProject.description ?? "",
      startDate: selectedProject.startDate ?? "",
      targetEndDate: selectedProject.targetEndDate ?? "",
      budgetTotal: selectedProject.budgetTotal != null ? String(selectedProject.budgetTotal) : "",
      budgetSpent: selectedProject.budgetSpent != null ? String(selectedProject.budgetSpent) : "0",
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selectedId || !editDraft) return;
    setEditSaving(true);
    try {
      await patchProject(selectedId, {
        status: editDraft.status,
        progress: editDraft.progress,
        description: editDraft.description,
        startDate: editDraft.startDate || null,
        targetEndDate: editDraft.targetEndDate || null,
        budgetTotal: editDraft.budgetTotal ? Number(editDraft.budgetTotal) : null,
        budgetSpent: editDraft.budgetSpent ? Number(editDraft.budgetSpent) : 0,
      });
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
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, 450),
      orientation: {
        heading: viewer.camera.heading,
        pitch: Cesium.Math.toRadians(-40),
        roll: 0,
      },
      duration: 0.9,
    });
  }

  function commitLocalPose(projectId: string, next: Partial<LocalXform>, autoSave = false) {
    const xf = xformsRef.current.get(projectId);
    const p = projectsRef.current.find((x) => x.id === projectId);
    const viewer = viewerRef.current;
    if (!xf || !p || xf.modelLocked || readOnly) return;
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
    if (!selectedId || !selectedXform) return;
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

  if (!visible) return null;

  return (
    <>
      <div
        ref={containerRef}
        className="cesium-map"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          cursor: placementMode ? "crosshair" : undefined,
        }}
      />

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

      {panelProject && (
        <PlaceSidePanel
          project={panelProject}
          onFlyHere={flyToSelected}
          readOnly={readOnly}
          canAddPhotos={canAddPhotos}
          onClose={() => {
            setSelectedId(null);
            setConfirmDelete(false);
            setEditOpen(false);
          }}
          onEdit={openEdit}
          onToggleLock={() => void handleToggleLock()}
        />
      )}

      {selectedProject && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 28,
            transform: "translateX(-50%)",
            zIndex: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "stretch",
            minWidth: 280,
            maxWidth: "min(520px, calc(100vw - 24px))",
            padding: "10px 12px",
            background: "var(--cream)",
            border: "2px solid var(--ink)",
            boxShadow: "5px 5px 0 var(--shadow-accent)",
            fontFamily: '"Chakra Petch", sans-serif',
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 0,
                background: statusColor(selectedProject.status),
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedProject.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted2)" }}>
                {statusLabel(selectedProject.status)}
                {selectedXform
                  ? ` · ${selectedXform.lat.toFixed(5)}, ${selectedXform.lon.toFixed(5)} · ${Math.round(selectedXform.rotationDeg)}° · ×${
                      selectedXform.scaleMultiplier >= 0.1
                        ? selectedXform.scaleMultiplier.toFixed(2)
                        : selectedXform.scaleMultiplier.toFixed(3)
                    }`
                  : null}
              </div>
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={openEdit}
                style={{
                  cursor: "pointer",
                  background: "var(--seed)",
                  border: "2px solid var(--ink)",
                  color: "var(--ink)",
                  fontSize: 11,
                  padding: "6px 12px",
                  fontWeight: 700,
                }}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => setHudCollapsed((v) => !v)}
              style={{
                cursor: "pointer",
                background: "var(--cream-deep)",
                border: "2px solid var(--ink)",
                color: "var(--ink)",
                fontSize: 11,
                padding: "6px 10px",
                fontWeight: 700,
                lineHeight: 1,
              }}
              title={hudCollapsed ? "Expand controls" : "Collapse controls"}
              aria-expanded={!hudCollapsed}
            >
              {hudCollapsed ? "▴" : "▾"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setConfirmDelete(false);
                setEditOpen(false);
              }}
              style={{
                cursor: "pointer",
                background: "none",
                border: "none",
                color: "var(--muted2)",
                fontSize: 20,
                lineHeight: 1,
                padding: "0 4px",
              }}
              title="Deselect"
            >
              ×
            </button>
          </div>

          {!hudCollapsed && (
            <>
          {!readOnly && selectedXform && !locked && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr auto auto",
                gap: 6,
                alignItems: "center",
                borderTop: "1px solid var(--stroke2)",
                paddingTop: 8,
                fontSize: 11,
              }}
            >
              <span style={{ fontWeight: 700, color: "#c0392b" }}>X</span>
              <input
                type="number"
                step="0.00001"
                value={selectedXform.lon}
                title="Longitude (East / West)"
                onChange={(e) => {
                  const lon = Number(e.target.value);
                  if (!Number.isFinite(lon) || !selectedId) return;
                  commitLocalPose(selectedId, { lon });
                }}
                onBlur={() => selectedId && void persistTransform(selectedId)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "5px 6px",
                  border: "1px solid var(--stroke)",
                  background: "var(--cream-deep)",
                  color: "var(--ink)",
                  fontSize: 11,
                }}
              />
              <button type="button" title="West −1 m" onClick={() => nudgeSelected(-1, 0, 0)} style={xyzBtnStyle}>
                −1m
              </button>
              <button type="button" title="East +1 m" onClick={() => nudgeSelected(1, 0, 0)} style={xyzBtnStyle}>
                +1m
              </button>

              <span style={{ fontWeight: 700, color: "#27ae60" }}>Y</span>
              <input
                type="number"
                step="0.00001"
                value={selectedXform.lat}
                title="Latitude (North / South)"
                onChange={(e) => {
                  const lat = Number(e.target.value);
                  if (!Number.isFinite(lat) || !selectedId) return;
                  commitLocalPose(selectedId, { lat });
                }}
                onBlur={() => selectedId && void persistTransform(selectedId)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "5px 6px",
                  border: "1px solid var(--stroke)",
                  background: "var(--cream-deep)",
                  color: "var(--ink)",
                  fontSize: 11,
                }}
              />
              <button type="button" title="South −1 m" onClick={() => nudgeSelected(0, -1, 0)} style={xyzBtnStyle}>
                −1m
              </button>
              <button type="button" title="North +1 m" onClick={() => nudgeSelected(0, 1, 0)} style={xyzBtnStyle}>
                +1m
              </button>

              <span style={{ fontWeight: 700, color: "#2980b9" }}>Z</span>
              <input
                type="number"
                step="0.1"
                value={selectedXform.heightM}
                title="Height above ground (m). Keep 0 for ground — no elevation."
                onChange={(e) => {
                  const heightM = Number(e.target.value);
                  if (!Number.isFinite(heightM) || !selectedId) return;
                  commitLocalPose(selectedId, { heightM: Math.max(-50, Math.min(500, heightM)) });
                }}
                onBlur={() => selectedId && void persistTransform(selectedId)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "5px 6px",
                  border: "1px solid var(--stroke)",
                  background: "var(--cream-deep)",
                  color: "var(--ink)",
                  fontSize: 11,
                }}
              />
              <button
                type="button"
                title="Set Z = 0 (ground, no elevation)"
                onClick={() => selectedId && commitLocalPose(selectedId, { heightM: 0 }, true)}
                style={xyzBtnStyle}
              >
                Ground
              </button>
              <button type="button" title="Up +0.5 m" onClick={() => nudgeSelected(0, 0, 0.5)} style={xyzBtnStyle}>
                +0.5
              </button>
              <div
                style={{
                  gridColumn: "1 / -1",
                  color: "var(--muted2)",
                  fontSize: 10,
                }}
              >
                X = lon · Y = lat · Z = height m (keep <b>0</b> for ground clamp — no elevation)
              </div>
            </div>
          )}

          {!readOnly && (
            <div
              style={{
                display: "flex",
                gap: 12,
                fontSize: 11,
                color: "var(--muted2)",
                borderTop: "1px solid var(--stroke2)",
                paddingTop: 8,
              }}
            >
              {locked ? (
                <span style={{ color: "#c47a1a", fontWeight: 600 }}>
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

          {!readOnly && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void handleToggleLock()}
                disabled={transformSaving}
                style={{
                  cursor: transformSaving ? "default" : "pointer",
                  flex: "1 1 90px",
                  padding: "8px 10px",
                  background: locked ? "rgba(196,122,26,0.18)" : "var(--cream-deep)",
                  border: "2px solid var(--ink)",
                  color: "var(--ink)",
                  fontSize: 12,
                  fontWeight: 700,
                  opacity: transformSaving ? 0.65 : 1,
                }}
              >
                {locked ? "Unlock" : "Lock"}
              </button>
              <button
                type="button"
                onClick={() => selectedId && void persistTransform(selectedId)}
                disabled={transformSaving || !transformDirty || locked}
                style={{
                  cursor: transformSaving || !transformDirty || locked ? "default" : "pointer",
                  flex: "1 1 110px",
                  padding: "8px 10px",
                  background: transformDirty && !locked ? "var(--seed)" : "var(--cream-deep)",
                  border: "2px solid var(--ink)",
                  color: "var(--ink)",
                  fontSize: 12,
                  fontWeight: 700,
                  opacity: transformSaving || !transformDirty || locked ? 0.65 : 1,
                }}
              >
                {transformSaving
                  ? "Saving…"
                  : transformMessage ??
                    (locked ? "Locked" : transformDirty ? "Save Position" : "Saved")}
              </button>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    cursor: "pointer",
                    flex: "1 1 120px",
                    padding: "8px 0",
                    background: "rgba(255,77,79,0.15)",
                    border: "1px solid rgba(255,77,79,0.3)",
                    color: "#ff4d4f",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Remove Building
                </button>
              ) : (
                <div
                  style={{
                    flex: "1 1 100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "8px 10px",
                    background: "rgba(255,77,79,0.1)",
                    border: "1px solid rgba(255,77,79,0.3)",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
                    Remove <strong style={{ color: "var(--seed)" }}>{selectedProject.name}</strong>?
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedId) onDeleteBuilding?.(selectedId);
                        setSelectedId(null);
                        setConfirmDelete(false);
                      }}
                      style={{
                        cursor: "pointer",
                        flex: 1,
                        padding: "7px 0",
                        background: "rgba(255,77,79,0.25)",
                        border: "1px solid rgba(255,77,79,0.5)",
                        color: "#ff4d4f",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      Yes, Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      style={{
                        cursor: "pointer",
                        flex: 1,
                        padding: "7px 0",
                        background: "var(--cream-deep)",
                        border: "1px solid var(--stroke)",
                        color: "var(--muted)",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>
      )}

      {editOpen && editDraft && selectedProject && (
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
