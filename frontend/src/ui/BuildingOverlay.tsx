/**
 * BuildingOverlay — renders GLB models on the MapLibre map using Three.js.
 *
 * Architecture:
 *  - Step 1: Create the Three.js scene + MapLibre custom layer ONCE (on map ready).
 *            No models are added here — just lights and the render loop.
 *  - Step 2: React to `projects` changes. Load any missing GLBs, then add/remove/update
 *            model states. This is the only place models enter the scene.
 *  - Step 3: Mouse interactions (select, drag, rotate, scale).
 */

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, CustomLayerInterface } from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Project, ProjectStatus } from "../types";
import { MODEL_CATALOG, PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from "../types";
import { patchProject, backendUrl } from "../lib/api";
import { updateProjectInFirestore } from "../services/firestore-projects";
import { snapLngLatToRoad } from "../lib/snap-to-road";
import { PlaceSidePanel } from "./PlaceSidePanel";
import {
  BUILDING_GLB_MIN_ZOOM,
  disposeGltfCache,
  disposeObject3D,
  isInPaddedViewport,
} from "../lib/three-dispose";

const LAYER_ID = "glb-buildings";
const HIT_RADIUS_PX = 32;
const ORIGIN_NORMALIZED_KEY = "__infatrackOriginNormalized";
/** Soft view pad so twins stream in before they hit the screen edge. */
const STREAM_PAD_FRAC = 0.45;

function hexToThree(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function statusColor(status: Project["status"]): THREE.Color {
  const normalized = status === "Planning" ? "Planned" : status;
  const hex = PROJECT_STATUS_COLORS[normalized as keyof typeof PROJECT_STATUS_COLORS] ?? PROJECT_STATUS_COLORS.Planned;
  return hexToThree(hex);
}

/**
 * Put GLTF local origin at the bounding-box bottom-center (Y-up).
 * Heading/scale then pivot on the ground pin instead of an off-center mesh origin.
 */
function normalizeModelOrigin(root: THREE.Object3D): THREE.Box3 {
  if (root.userData[ORIGIN_NORMALIZED_KEY]) {
    root.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(root);
  }

  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    const shift = new THREE.Vector3(-center.x, -box.min.y, -center.z);
    // Shift mesh contents; keep root transform identity for camera-matrix anchoring.
    for (const child of root.children) {
      child.position.add(shift);
    }
    if (root.children.length === 0 && (root as THREE.Mesh).isMesh) {
      root.position.copy(shift);
    }
  }

  root.updateMatrixWorld(true);
  root.userData[ORIGIN_NORMALIZED_KEY] = true;
  return new THREE.Box3().setFromObject(root);
}

/** Column-major 4×4 multiply in Float64 (MapLibre mercator precision). */
function mulMat4Float64(a: Float64Array, b: Float64Array, out: Float64Array): Float64Array {
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4];
    const b1 = b[col * 4 + 1];
    const b2 = b[col * 4 + 2];
    const b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

/**
 * Model matrix in mercator space (column-major Float64):
 *   M = T(pos) · S(s, −s, s) · Rx(π/2) · Ry(heading)
 *
 * Rx(π/2) maps GLTF Y-up → MapLibre Z-up. S_y = −1 matches the MapLibre
 * three.js example (mercator Y). Heading is yaw about ground-up after that
 * conversion (Ry), i.e. rotation in the ground plane — not camera-local tilt.
 */
function writeTranslationScaleRotation(
  out: Float64Array,
  tx: number,
  ty: number,
  tz: number,
  scale: number,
  rotateZ: number,
) {
  const sx = scale;
  const sy = -scale;
  const sz = scale;
  // Rx(π/2) — column-major
  const rx = new Float64Array([
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, 0, 1,
  ]);
  // Ry(heading) — column-major; angle is ground-plane yaw
  const cy = Math.cos(rotateZ);
  const syr = Math.sin(rotateZ);
  const ry = new Float64Array([
    cy, 0, -syr, 0,
    0, 1, 0, 0,
    syr, 0, cy, 0,
    0, 0, 0, 1,
  ]);
  const s = new Float64Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1,
  ]);
  const t = new Float64Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    tx, ty, tz, 1,
  ]);
  const tmp1 = new Float64Array(16);
  const tmp2 = new Float64Array(16);
  mulMat4Float64(rx, ry, tmp1); // Rx · Ry
  mulMat4Float64(s, tmp1, tmp2); // S · Rx · Ry
  mulMat4Float64(t, tmp2, out); // T · S · Rx · Ry
  return out;
}

function queryGroundAltitude(map: MapLibreMap, lng: number, lat: number): number {
  try {
    const elev = map.queryTerrainElevation({ lng, lat } as maplibregl.LngLatLike);
    return typeof elev === "number" && Number.isFinite(elev) ? elev : 0;
  } catch {
    return 0;
  }
}

type OriginalMaterialAppearance = {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
};

const ORIGINAL_APPEARANCE_KEY = "__infatrackOriginalAppearance";

function rememberMaterialAppearance(material: THREE.Material) {
  if (material.userData[ORIGINAL_APPEARANCE_KEY]) return;
  material.userData[ORIGINAL_APPEARANCE_KEY] = {
    opacity: material.opacity,
    transparent: material.transparent,
    depthWrite: material.depthWrite,
  } satisfies OriginalMaterialAppearance;
}

function applyGlobalMaterialOpacity(
  material: THREE.Material,
  globalOpacity: number,
) {
  rememberMaterialAppearance(material);
  const original = material.userData[
    ORIGINAL_APPEARANCE_KEY
  ] as OriginalMaterialAppearance;
  const nextOpacity = original.opacity * globalOpacity;
  const nextTransparent =
    original.transparent || nextOpacity < 0.999 || globalOpacity < 0.999;
  const nextDepthWrite =
    original.depthWrite && globalOpacity >= 0.999;

  const shaderModeChanged =
    material.transparent !== nextTransparent ||
    material.depthWrite !== nextDepthWrite;

  material.opacity = nextOpacity;
  material.transparent = nextTransparent;
  material.depthWrite = nextDepthWrite;
  if (shaderModeChanged) material.needsUpdate = true;
}

type Props = {
  map: MapLibreMap | null;
  projects: Project[];
  visible: boolean;
  /** 0–1 opacity for GLB project blocks */
  opacity?: number;
  readOnly?: boolean;
  /** Engineer / MPDC can add photos from the left place panel. */
  canAddPhotos?: boolean;
  /** When true, left-drag snaps position + yaw to nearby roads. */
  snapToRoad?: boolean;
  /** MapLibre/Three sun vector (+x east, +y south, +z up), from SunCalc. */
  sunLightPosition?: [number, number, number];
  sunIsDaylight?: boolean;
  onBuildingClick?: (hit: boolean) => void;
  onDeleteBuilding?: (projectId: string) => void;
};

type ModelState = {
  scene: THREE.Group;
  translateX: number;
  translateY: number;
  translateZ: number;
  lng: number;
  lat: number;
  baseScale: number;
  scaleMultiplier: number;
  rotateZ: number;
  projectId: string;
  projectName: string;
  status: Project["status"];
  modelLocked: boolean;
  /** Axis-aligned bounds in model-local space (identity transform). */
  localBBox: THREE.Box3;
};

const DEFAULT_SUN: [number, number, number] = [50, -70, 100];

export function BuildingOverlay({
  map,
  projects,
  visible,
  opacity = 1,
  readOnly = false,
  canAddPhotos = false,
  snapToRoad = false,
  sunLightPosition = DEFAULT_SUN,
  sunIsDaylight = true,
  onBuildingClick,
  onDeleteBuilding,
}: Props) {
  const gltfCache = useRef<Map<string, THREE.Group>>(new Map());
  const statesRef = useRef<ModelState[]>([]);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.Camera>(new THREE.Camera());
  const sceneRef = useRef<THREE.Scene | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const sunPosRef = useRef(sunLightPosition);
  useEffect(() => { sunPosRef.current = sunLightPosition; }, [sunLightPosition]);
  useEffect(() => {
    const sun = sunLightRef.current;
    const amb = ambientLightRef.current;
    if (!sun || !amb) return;
    const [x, y, z] = sunLightPosition;
    sun.position.set(x, y, z);
    sun.castShadow = false;
    if (sunIsDaylight) {
      sun.intensity = 1.55;
      sun.color.set(0xfff4e0);
      amb.intensity = 0.85;
      amb.color.set(0xffffff);
    } else {
      sun.intensity = 0.25;
      sun.color.set(0x8899bb);
      amb.intensity = 0.35;
      amb.color.set(0x667799);
    }
    map?.triggerRepaint();
  }, [sunLightPosition, sunIsDaylight, map]);
  const lastMapMatrixRef = useRef<THREE.Matrix4 | null>(null);
  const lastRenderArgsRef = useRef<any>(null);
  const layerAddedRef = useRef(false);
  const manuallyMovedRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const opacityRef = useRef(opacity);
  const lastAppliedOpacityRef = useRef(-1);
  const snapToRoadRef = useRef(snapToRoad);
  useEffect(() => { snapToRoadRef.current = snapToRoad; }, [snapToRoad]);
  useEffect(() => {
    opacityRef.current = opacity;
    map?.triggerRepaint();
  }, [opacity, map]);

  // Pre-allocated matrices to avoid GC pressure every frame
  const _mapMatrix   = useRef(new THREE.Matrix4());
  const _vp64        = useRef(new Float64Array(16));
  const _camT64      = useRef(new Float64Array(16));
  const _vpCentered  = useRef(new Float64Array(16));
  const _model64     = useRef(new Float64Array(16));
  const _result64    = useRef(new Float64Array(16));
  // Track last selection to only update emissive when it changes
  const lastSelIdxRef = useRef(-2); // -2 = uninitialized

  const [selectedIdx, setSelectedIdx] = useState(-1);
  const selectedIdxRef = useRef(-1);
  const readOnlyRef = useRef(readOnly);
  useEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);
  useEffect(() => { selectedIdxRef.current = selectedIdx; setConfirmDelete(false); }, [selectedIdx]);

  // Confirmation state for delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // Modal state for building info
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"view" | "edit">("view");
  const [editDraft, setEditDraft] = useState<{
    status: ProjectStatus;
    progress: number;
    description: string;
    startDate: string;
    targetEndDate: string;
    budgetTotal: string;
    budgetSpent: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [transformDirty, setTransformDirty] = useState(false);
  const [transformSaving, setTransformSaving] = useState(false);
  const [transformMessage, setTransformMessage] = useState<string | null>(null);
  const transformDirtyRef = useRef(false);
  const transformSavingRef = useRef(false);
  const saveTransformRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => { transformDirtyRef.current = transformDirty; }, [transformDirty]);
  useEffect(() => { transformSavingRef.current = transformSaving; }, [transformSaving]);
  
  // Hover state for tooltip
  const [hoveredBuilding, setHoveredBuilding] = useState<{ name: string; status: string; x: number; y: number } | null>(null);

  // ── Step 1: Create scene + layer once. No models here. ───────────────────
  useEffect(() => {
    if (!map) return;

    const removeLayer = () => {
      try { if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID); } catch { /* ignore */ }
      layerAddedRef.current = false;
      // NOTE: do NOT null sceneRef/statesRef here — we want to keep models
      // alive so they can be re-added after terrain/style reloads.
    };

    const fullReset = () => {
      removeLayer();
      // Explicit GPU GC when projects layer is hidden / unmounted
      for (const s of statesRef.current) {
        sceneRef.current?.remove(s.scene);
        disposeObject3D(s.scene);
      }
      disposeGltfCache(gltfCache.current);
      statesRef.current = [];
      sceneRef.current = null;
      rendererRef.current = null;
      sunLightRef.current = null;
      ambientLightRef.current = null;
      lastSelIdxRef.current = -2;
      lastAppliedOpacityRef.current = -1;
    };

    if (!visible) {
      fullReset();
      return;
    }

    const createSceneAndLayer = () => {
      if (layerAddedRef.current) return;

      // Build a fresh scene with just lights (direction updated from SunCalc)
      const scene = new THREE.Scene();
      const ambient = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambient);
      ambientLightRef.current = ambient;
      const [sx, sy, sz] = sunPosRef.current;
      const sun = new THREE.DirectionalLight(0xfff4e0, 1.55);
      sun.position.set(sx, sy, sz);
      sun.castShadow = false;
      scene.add(sun);
      sunLightRef.current = sun;
      const fill = new THREE.DirectionalLight(0xffffff, 0.45);
      fill.position.set(-40, 50, 80).normalize();
      fill.castShadow = false;
      scene.add(fill);
      sceneRef.current = scene;

      // Re-add any existing model scenes (e.g. after terrain/style reload)
      for (const s of statesRef.current) {
        scene.add(s.scene);
      }

      const layer: CustomLayerInterface = {
        id: LAYER_ID,
        type: "custom",
        renderingMode: "3d",

        onAdd(_map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
          const r = new THREE.WebGLRenderer({
            canvas: _map.getCanvas(),
            context: gl as WebGL2RenderingContext,
            antialias: false, // antialias is expensive — map canvas already has MSAA from canvasContextAttributes
          });
          r.autoClear = false;
          r.outputColorSpace = THREE.SRGBColorSpace;
          // No tone mapping — ACES washes Blender base colors on the map.
          // Keep linear→sRGB output only so exported GLB colors stay faithful.
          r.toneMapping = THREE.NoToneMapping;
          r.toneMappingExposure = 1;
          // Shadow maps on the shared MapLibre context explode models at high zoom —
          // keep directional sun lighting only.
          r.shadowMap.enabled = false;
          rendererRef.current = r;
        },

        render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: any) {
          const renderer = rendererRef.current;
          const scene = sceneRef.current;
          if (!renderer || !scene) return;

          // Sync with MapLibre's live custom-layer projection every frame
          // (equivalent to map.getMatrix() / transform custom-layer matrix).
          // Critical during easeTo(padding) so GLBs stay locked to lat/lng.
          const transform = (map as any).transform;
          let mainMatrix: ArrayLike<number> | undefined;
          if (typeof transform?.getProjectionDataForCustomLayer === "function") {
            try {
              mainMatrix = transform.getProjectionDataForCustomLayer(true)?.mainMatrix;
            } catch {
              /* fall through */
            }
          }
          if (!mainMatrix) {
            mainMatrix =
              args?.defaultProjectionData?.mainMatrix ??
              args?.modelViewProjectionMatrix;
          }
          if (!mainMatrix) return;

          for (let i = 0; i < 16; i++) _vp64.current[i] = Number(mainMatrix[i]);
          _mapMatrix.current.fromArray(_vp64.current as unknown as number[]);
          lastMapMatrixRef.current = _mapMatrix.current;
          lastRenderArgsRef.current = args;

          const states = statesRef.current;
          if (states.length === 0) return;

          const zoom = map.getZoom();
          // Zoom LOD: skip heavy digital twins when viewing large areas
          if (zoom < BUILDING_GLB_MIN_ZOOM) {
            renderer.resetState();
            return;
          }

          // Relative-to-eye: re-center VP around camera mercator so Float32
          // doesn't swim when panning/rotating/zooming.
          const cam = map.getCenter();
          const camMerc = maplibregl.MercatorCoordinate.fromLngLat(
            { lng: cam.lng, lat: cam.lat },
            0,
          );
          _camT64.current.set([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            camMerc.x, camMerc.y, camMerc.z || 0, 1,
          ]);
          mulMat4Float64(_vp64.current, _camT64.current, _vpCentered.current);

          const selIdx = selectedIdxRef.current;
          const blockOpacity = Math.max(0, Math.min(1, opacityRef.current));

          // Selection emissive — only when selection changes
          if (selIdx !== lastSelIdxRef.current) {
            lastSelIdxRef.current = selIdx;
            for (let i = 0; i < states.length; i++) {
              const t = states[i];
              const isSelected = i === selIdx;
              t.scene.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                if (!mesh.isMesh) return;
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach((mat) => {
                  if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                    if (isSelected) {
                      mat.emissive.set(0x245c3a);
                      mat.emissiveIntensity = 0.15;
                    } else {
                      mat.emissive.set(0x000000);
                      mat.emissiveIntensity = 0;
                    }
                  }
                });
              });
            }
          }

          // Opacity — only when slider changes
          if (blockOpacity !== lastAppliedOpacityRef.current) {
            lastAppliedOpacityRef.current = blockOpacity;
            for (const t of states) {
              t.scene.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                if (!mesh.isMesh) return;
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const mat of mats) {
                  if (!mat) continue;
                  applyGlobalMaterialOpacity(mat, blockOpacity);
                }
              });
            }
          }

          renderer.resetState();
          // Clear map depth so GLBs never z-fight OSM fill-extrusions (white↔cream flash)
          renderer.clearDepth();

          const camera = cameraRef.current;
          camera.matrixAutoUpdate = false;

          // Stable MapLibre pattern: bake each model's mercator transform into the
          // camera projection and render one model at a time (identity model matrix).
          // World-space + shadow maps caused explode/disappear glitches at high zoom.
          for (let i = 0; i < states.length; i++) {
            const t = states[i];
            const isSelected = i === selIdx;

            if (!isSelected && !isInPaddedViewport(map, t.lng, t.lat, STREAM_PAD_FRAC)) {
              continue;
            }

            for (const other of states) other.scene.visible = false;
            t.scene.visible = true;
            t.scene.frustumCulled = false;
            t.scene.matrixAutoUpdate = false;
            t.scene.matrix.identity();
            t.scene.updateMatrixWorld(true);

            const altitude = queryGroundAltitude(map, t.lng, t.lat);
            const mc = maplibregl.MercatorCoordinate.fromLngLat(
              { lng: t.lng, lat: t.lat },
              altitude,
            );
            const tx = mc.x;
            const ty = mc.y;
            const tz = mc.z ?? 0;
            t.translateX = tx;
            t.translateY = ty;
            t.translateZ = tz;

            const finalScale = t.baseScale * t.scaleMultiplier;
            const dx = tx - camMerc.x;
            const dy = ty - camMerc.y;
            const dz = tz - (camMerc.z || 0);

            writeTranslationScaleRotation(
              _model64.current,
              dx,
              dy,
              dz,
              finalScale,
              t.rotateZ,
            );
            mulMat4Float64(_vpCentered.current, _model64.current, _result64.current);
            camera.projectionMatrix.fromArray(_result64.current as unknown as number[]);
            camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

            renderer.render(scene, camera);
          }

          for (const t of states) t.scene.visible = true;
          renderer.resetState();
        },
      };

      try {
        map.addLayer(layer as any);
        layerAddedRef.current = true;
        map.triggerRepaint();
      } catch { /* already exists */ }
    };

    if (map.isStyleLoaded()) {
      createSceneAndLayer();
    } else {
      map.once("style.load", createSceneAndLayer);
    }

    // Re-add the layer whenever MapLibre reloads the style
    // (happens when terrain is toggled via setTerrain())
    map.on("style.load", createSceneAndLayer);

    const onMapResize = () => {
      // Keep custom layer drawing with the latest viewport matrix while the
      // canvas size changes (right panel open/close).
      map.triggerRepaint();
    };
    map.on("resize", onMapResize);

    return () => {
      map.off("style.load", createSceneAndLayer as any);
      map.off("resize", onMapResize);
      fullReset();
    };
  }, [map, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 2: Sync models whenever projects list changes ───────────────────
  useEffect(() => {
    if (!map || !visible) return;

    // Collect all GLBs needed for current projects
    const neededGlbs = [...new Set(
      projects
        .filter(p => p?.location?.lon && p?.location?.lat)
        .map((p) => {
          // If custom model with URL, use that; otherwise use catalog
          if (p.modelType === "custom" && p.customModelUrl) {
            return p.customModelUrl;
          }
          const cat = MODEL_CATALOG.find((m) => m.type === (p.modelType ?? "office"));
          return cat?.glb ?? "building.glb";
        })
    )];

    const loader = new GLTFLoader();

    // Load any GLBs not yet in cache
    const loadMissing = () => Promise.all(
      neededGlbs.map((glb) => new Promise<void>((resolve) => {
        if (gltfCache.current.has(glb)) { resolve(); return; }
        
        // Absolute URLs (/uploads/..., /models/...) or http — else catalog filename under /models/
        const modelPath =
          glb.startsWith("http") || glb.startsWith("/")
            ? glb
            : `/models/${glb}`;
        
        loader.load(
          modelPath,
          (gltf) => {
            normalizeModelOrigin(gltf.scene);
            gltfCache.current.set(glb, gltf.scene);
            resolve();
          },
          undefined,
          (err) => { console.warn(`[BuildingOverlay] Failed to load ${glb}:`, err); resolve(); }
        );
      }))
    );

    loadMissing().then(() => {
      // Ensure scene exists (may not if layer hasn't been added yet)
      if (!sceneRef.current) {
        const scene = new THREE.Scene();
        const ambient = new THREE.AmbientLight(0xffffff, 0.85);
        scene.add(ambient);
        ambientLightRef.current = ambient;
        const [sx, sy, sz] = sunPosRef.current;
        const sun = new THREE.DirectionalLight(0xfff4e0, 1.55);
        sun.position.set(sx, sy, sz);
        sun.castShadow = false;
        scene.add(sun);
        sunLightRef.current = sun;
        const fill = new THREE.DirectionalLight(0xffffff, 0.45);
        fill.position.set(-40, 50, 80).normalize();
        fill.castShadow = false;
        scene.add(fill);
        sceneRef.current = scene;
      }

      const scene = sceneRef.current;
      const newStates: ModelState[] = [];
      const existingIds = new Set(statesRef.current.map(s => s.projectId));

      for (const p of projects) {
        if (!p?.location?.lon || !p?.location?.lat) continue;

        // Determine which GLB to use
        let glb: string;
        if (p.modelType === "custom" && p.customModelUrl) {
          glb = p.customModelUrl;
        } else {
          const cat = MODEL_CATALOG.find((m) => m.type === (p.modelType ?? "office"));
          glb = cat?.glb ?? "building.glb";
        }
        
        const proto = gltfCache.current.get(glb);
        if (!proto) continue;

        const existing = statesRef.current.find(s => s.projectId === p.id);
        const manualPos = manuallyMovedRef.current.get(p.id);

        const mc = maplibregl.MercatorCoordinate.fromLngLat(
          { lng: p.location.lon, lat: p.location.lat }, 0
        );
        const metersPerUnit = mc.meterInMercatorCoordinateUnits();
        const cat = MODEL_CATALOG.find((m) => m.type === (p.modelType ?? "office"));
        const targetHeightM = cat?.scale ?? 60;

        let model: THREE.Group;
        let localBBox: THREE.Box3;

        if (existing) {
          // Reuse existing Three.js object — preserves user edits
          model = existing.scene;
          localBBox = normalizeModelOrigin(model);
        } else {
          // New project — clone from cache and add to scene
          model = proto.clone(true);
          model.position.set(0, 0, 0);
          model.rotation.set(0, 0, 0);
          model.scale.set(1, 1, 1);
          model.matrix.identity();
          model.matrixAutoUpdate = false;
          model.frustumCulled = false;
          // Clone materials so selection emissive/opacity don't leak across
          // instances — but keep the GLB's original colors untouched.
          model.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.frustumCulled = false;
            mesh.castShadow = false;
            if (Array.isArray(mesh.material)) {
              mesh.material = mesh.material.map((m) => m.clone());
            } else if (mesh.material) {
              mesh.material = mesh.material.clone();
            }
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of mats) {
              if (!material) continue;
              // Recover color from hex material names (e.g. "#FDFBD4FF") when
              // Blender exported an empty/white material with no baseColorFactor.
              if (
                (material instanceof THREE.MeshStandardMaterial ||
                  material instanceof THREE.MeshPhysicalMaterial) &&
                !material.map
              ) {
                const hexMatch = /^#([0-9A-Fa-f]{6})/.exec(material.name.trim());
                if (hexMatch) {
                  const isWhite =
                    material.color.r > 0.95 &&
                    material.color.g > 0.95 &&
                    material.color.b > 0.95;
                  if (isWhite) material.color.set(`#${hexMatch[1]}`);
                }
              }
              rememberMaterialAppearance(material);
            }
          });
          localBBox = normalizeModelOrigin(model);
          scene.add(model);
        }

        const size = new THREE.Vector3();
        localBBox.getSize(size);
        // Prefer vertical extent (GLTF Y-up) for target building height.
        const modelNativeHeight = Math.max(size.y, size.x * 0.5, size.z * 0.5, 0.001);

        const altitude = queryGroundAltitude(map, p.location.lon, p.location.lat);
        const mcGround = maplibregl.MercatorCoordinate.fromLngLat(
          { lng: p.location.lon, lat: p.location.lat },
          altitude,
        );

        newStates.push({
          scene: model,
          translateX: manualPos?.x ?? mcGround.x,
          translateY: manualPos?.y ?? mcGround.y,
          translateZ: mcGround.z ?? 0,
          lng: p.location.lon,
          lat: p.location.lat,
          baseScale: (targetHeightM / modelNativeHeight) * metersPerUnit,
          scaleMultiplier: existing?.scaleMultiplier ?? p.modelScale ?? 1,
          rotateZ: existing?.rotateZ ?? THREE.MathUtils.degToRad(p.rotation ?? 0),
          projectId: p.id,
          projectName: p.name,
          status: p.status,
          modelLocked: Boolean(p.modelLocked),
          localBBox,
        });
      }

      // Remove + dispose GPU for projects that no longer exist
      const newIds = new Set(newStates.map(s => s.projectId));
      for (const old of statesRef.current) {
        if (!newIds.has(old.projectId)) {
          scene.remove(old.scene);
          disposeObject3D(old.scene);
          manuallyMovedRef.current.delete(old.projectId);
        }
      }

      // Drop unused GLB prototypes from GPU when no project references them
      const liveGlbs = new Set(
        projects
          .filter((p) => p?.location?.lon && p?.location?.lat)
          .map((p) => {
            if (p.modelType === "custom" && p.customModelUrl) return p.customModelUrl;
            const cat = MODEL_CATALOG.find((m) => m.type === (p.modelType ?? "office"));
            return cat?.glb ?? "building.glb";
          }),
      );
      for (const key of [...gltfCache.current.keys()]) {
        if (!liveGlbs.has(key)) {
          const proto = gltfCache.current.get(key);
          if (proto) disposeObject3D(proto);
          gltfCache.current.delete(key);
        }
      }

      statesRef.current = newStates;
      lastAppliedOpacityRef.current = -1; // re-apply opacity to new materials
      map.triggerRepaint();
    });
  }, [projects, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 3: Mouse interactions ────────────────────────────────────────────
  useEffect(() => {
    if (!map || !visible) return;

    const canvas = map.getCanvas();

    function mercatorToScreen(tx: number, ty: number, tz: number) {
      const mat = lastMapMatrixRef.current;
      if (!mat) return null;
      const w = canvas.width;
      const h = canvas.height;
      const v = new THREE.Vector4(tx, ty, tz, 1).applyMatrix4(mat);
      if (v.w === 0) return null;
      return {
        x: (v.x / v.w * 0.5 + 0.5) * w,
        y: (1 - (v.y / v.w * 0.5 + 0.5)) * h,
      };
    }

    function hitTest(px: number, py: number) {
      const mat = lastMapMatrixRef.current;
      if (!mat) return -1;

      const canvas = map.getCanvas();
      const w = canvas.width;
      const h = canvas.height;

      const ndcX =  (px / w) * 2 - 1;
      const ndcY = -(py / h) * 2 + 1;

      const states = statesRef.current;
      let bestIdx = -1;
      let bestDist = Infinity;

      for (let i = 0; i < states.length; i++) {
        const t = states[i];
        const finalScale = t.baseScale * t.scaleMultiplier;
        const modelMat = new Float64Array(16);
        writeTranslationScaleRotation(
          modelMat,
          t.translateX,
          t.translateY,
          t.translateZ,
          finalScale,
          t.rotateZ,
        );
        const l = new THREE.Matrix4().fromArray(modelMat as unknown as number[]);
        const combinedMatrix = new THREE.Matrix4().copy(mat).multiply(l);
        const combinedInverse = combinedMatrix.clone().invert();

        const nearLocal = new THREE.Vector3(ndcX, ndcY, -1).applyMatrix4(combinedInverse);
        const farLocal  = new THREE.Vector3(ndcX, ndcY,  1).applyMatrix4(combinedInverse);
        const rayDir = farLocal.clone().sub(nearLocal).normalize();
        const ray = new THREE.Ray(nearLocal, rayDir);

        const bbox = t.localBBox;
        const hitPoint = new THREE.Vector3();
        if (ray.intersectBox(bbox, hitPoint)) {
          const dist = nearLocal.distanceTo(hitPoint);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
      }

      return bestIdx;
    }

    let isDragging = false;
    let dragLastX = 0;
    let dragLastY = 0;
    let isMoving = false;
    let moveDragLastX = 0;
    let moveDragLastY = 0;
    let didMove = false;

    /**
     * Convert a screen-pixel drag into Mercator deltas aligned to the current
     * map bearing so “drag left” always moves toward the left edge of the view.
     * Screen +x = right, +y = down.
     */
    function screenDeltaToMercator(dxPx: number, dyPx: number) {
      const zoom = map.getZoom();
      const worldPx = 512 * Math.pow(2, zoom);
      // MapLibre: +x east, +y south; bearing = direction that is “up” (clockwise from north).
      const bearing = (map.getBearing() * Math.PI) / 180;
      const cosB = Math.cos(bearing);
      const sinB = Math.sin(bearing);
      // screenRight = (cosB, sinB), screenDown = (−sinB, cosB) in mercator XY
      const mx = (dxPx * cosB - dyPx * sinB) / worldPx;
      const my = (dxPx * sinB + dyPx * cosB) / worldPx;
      return { dx: mx, dy: my };
    }

    const onMouseDown = (e: MouseEvent) => {
      if (readOnlyRef.current) return;
      const idx = selectedIdxRef.current;
      if (idx < 0) return;
      const selected = statesRef.current[idx];
      if (selected?.modelLocked) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const px = (e.clientX - rect.left) * dpr;
      const py = (e.clientY - rect.top) * dpr;
      const hit = hitTest(px, py);

      if (e.button === 0 && hit === idx) {
        isMoving = true;
        didMove = false;
        moveDragLastX = e.clientX;
        moveDragLastY = e.clientY;
        map.dragPan.disable();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.button === 2 && hit === idx) {
        isDragging = true;
        dragLastX = e.clientX;
        dragLastY = e.clientY;
        map.dragRotate.disable();
        map.touchPitch?.disable?.();
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onClick = (e: MouseEvent) => {
      if (didMove) {
        didMove = false;
        onBuildingClick?.(true);
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }
      if (isDragging) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const px = (e.clientX - rect.left) * dpr;
      const py = (e.clientY - rect.top) * dpr;
      const hit = hitTest(px, py);
      setTransformDirty(false);
      setTransformMessage(null);
      setSelectedIdx(hit);
      selectedIdxRef.current = hit;
      
      // Don't auto-open modal on click, just select the building
      // Modal will open when user clicks "View Details" or "Edit Details" button
      
      onBuildingClick?.(hit >= 0);
      if (hit >= 0) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      map.triggerRepaint();
    };

    const onMouseMove = (e: MouseEvent) => {
      // Update hover tooltip
      if (!isMoving && !isDragging) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const px = (e.clientX - rect.left) * dpr;
        const py = (e.clientY - rect.top) * dpr;
        const hit = hitTest(px, py);
        
        if (hit >= 0) {
          const s = statesRef.current[hit];
          setHoveredBuilding({
            name: s.projectName,
            status: s.status,
            x: e.clientX,
            y: e.clientY,
          });
        } else {
          setHoveredBuilding(null);
        }
      }
      
      if (isMoving) {
        const idx = selectedIdxRef.current;
        if (idx < 0) { isMoving = false; map.dragPan.enable(); return; }
        const dxPx = e.clientX - moveDragLastX;
        const dyPx = e.clientY - moveDragLastY;
        moveDragLastX = e.clientX;
        moveDragLastY = e.clientY;
        const { dx, dy } = screenDeltaToMercator(dxPx, dyPx);
        const s = statesRef.current[idx];
        s.translateX += dx;
        s.translateY += dy;
        // Convert updated Mercator back to lng/lat for getMatrixForModel (terrain support)
        let lngLat = new maplibregl.MercatorCoordinate(s.translateX, s.translateY, s.translateZ).toLngLat();
        s.lng = lngLat.lng;
        s.lat = lngLat.lat;

        if (snapToRoadRef.current) {
          const snap = snapLngLatToRoad(map, s.lng, s.lat);
          if (snap.snapped) {
            s.lng = snap.lng;
            s.lat = snap.lat;
            const elev = map.queryTerrainElevation({ lng: snap.lng, lat: snap.lat }) ?? 0;
            const mc = maplibregl.MercatorCoordinate.fromLngLat({ lng: snap.lng, lat: snap.lat }, elev);
            s.translateX = mc.x;
            s.translateY = mc.y;
            s.translateZ = mc.z;
            s.rotateZ = THREE.MathUtils.degToRad(snap.bearingDeg);
          }
        }

        manuallyMovedRef.current.set(s.projectId, { x: s.translateX, y: s.translateY });
        didMove = true;
        setTransformDirty(true);
        setTransformMessage(null);
        map.triggerRepaint();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (isDragging) {
        const idx = selectedIdxRef.current;
        if (idx < 0) { isDragging = false; return; }
        const dx = e.clientX - dragLastX;
        const dy = e.clientY - dragLastY;
        dragLastX = e.clientX;
        dragLastY = e.clientY;
        // Invert screen X: with mercator Y-flip in the model matrix, raw +=dx
        // made drag-left turn the model right. Subtract so left = CCW on screen.
        // Horizontal drag = yaw about ground-up. Ignore vertical for yaw so
        // map pitch gestures don't fight the model heading.
        const s = statesRef.current[idx];
        s.rotateZ -= THREE.MathUtils.degToRad(dx * 0.5);
        // Soft clamp unused dy so accidental vertical right-drags don't feel like
        // an inverted "tilt" via map pitch stealing the gesture.
        void dy;
        setTransformDirty(true);
        setTransformMessage(null);
        map.triggerRepaint();
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const wasMoving = e.button === 0 && isMoving;
      const wasRotating = e.button === 2 && isDragging;
      if (e.button === 0 && isMoving) { isMoving = false; map.dragPan.enable(); }
      if (e.button === 2) {
        isDragging = false;
        map.dragRotate.enable();
        map.touchPitch?.enable?.();
      }
      // Persist map placement immediately so reload keeps the new spot
      if ((wasMoving || wasRotating) && (didMove || transformDirtyRef.current)) {
        void saveTransformRef.current?.();
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (readOnlyRef.current) return;
      const idx = selectedIdxRef.current;
      if (idx < 0) return;
      const s = statesRef.current[idx];
      if (!s || s.modelLocked) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const px = (e.clientX - rect.left) * dpr;
      const py = (e.clientY - rect.top) * dpr;
      const sc = mercatorToScreen(s.translateX, s.translateY, s.translateZ);
      if (!sc) return;
      if ((sc.x - px) ** 2 + (sc.y - py) ** 2 > (HIT_RADIUS_PX * 4) ** 2) return;
      s.scaleMultiplier = Math.max(0.1, Math.min(20, s.scaleMultiplier * (e.deltaY < 0 ? 1.08 : 0.93)));
      setTransformDirty(true);
      setTransformMessage(null);
      map.triggerRepaint();
      e.preventDefault();
      e.stopPropagation();
      window.clearTimeout((onWheel as any)._saveTimer);
      (onWheel as any)._saveTimer = window.setTimeout(() => {
        void saveTransformRef.current?.();
      }, 450);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIdx(-1);
        selectedIdxRef.current = -1;
        setShowModal(false);
        map.triggerRepaint();
      }
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("click", onClick, true);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      map.dragPan.enable();
      map.dragRotate.enable();
      map.touchPitch?.enable?.();
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("click", onClick, true);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [map, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── HUD & Modal ───────────────────────────────────────────────────────────
  const sel = selectedIdx >= 0 ? statesRef.current[selectedIdx] : null;

  // Get full project details
  const project = sel ? projects.find(p => p.id === sel.projectId) : null;
  const modelInfo = MODEL_CATALOG.find(m => m.type === (project?.modelType ?? "office"));

  function openModal(mode: "view" | "edit") {
    if (!project) return;
    if (readOnly && mode === "edit") return;
    setModalMode(mode);
    if (mode === "edit") {
      setEditDraft({
        status: project.status === "Planning" ? "Planned" : project.status,
        progress: project.progress,
        description: project.description ?? modelInfo?.description ?? "",
        startDate: project.startDate ?? "",
        targetEndDate: project.targetEndDate ?? "",
        budgetTotal: project.budgetTotal != null ? String(project.budgetTotal) : "",
        budgetSpent: project.budgetSpent != null ? String(project.budgetSpent) : "0",
      });
    }
    setShowModal(true);
  }

  async function handleSaveEdit() {
    if (!project || !editDraft) return;
    setSaving(true);
    try {
      await patchProject(project.id, {
        status: editDraft.status,
        progress: editDraft.progress,
        description: editDraft.description,
        startDate: editDraft.startDate || null,
        targetEndDate: editDraft.targetEndDate || null,
        budgetTotal: editDraft.budgetTotal ? Number(editDraft.budgetTotal) : null,
        budgetSpent: editDraft.budgetSpent ? Number(editDraft.budgetSpent) : 0,
      });
      setModalMode("view");
      setEditDraft(null);
    } catch (err) {
      console.error("Failed to save project:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTransform() {
    const idx = selectedIdxRef.current;
    const state = statesRef.current[idx];
    if (!state || transformSavingRef.current || state.modelLocked) return;

    const rotation = THREE.MathUtils.radToDeg(state.rotateZ);
    const patch: Partial<Project> = {
      location: { lat: state.lat, lon: state.lng },
      rotation,
      modelScale: state.scaleMultiplier,
    };

    transformSavingRef.current = true;
    setTransformSaving(true);
    setTransformMessage(null);
    try {
      try {
        await patchProject(state.projectId, patch);
      } catch (backendError) {
        // Placements can fall back to Firestore when the local API is offline.
        try {
          await updateProjectInFirestore(state.projectId, patch);
        } catch {
          throw backendError;
        }
      }

      // Keep mercator pin aligned with saved lng/lat across reloads
      manuallyMovedRef.current.set(state.projectId, {
        x: state.translateX,
        y: state.translateY,
      });
      setTransformDirty(false);
      setTransformMessage("Position saved");
      window.setTimeout(() => setTransformMessage(null), 2200);
    } catch (err) {
      console.error("Failed to save 3D model transform:", err);
      setTransformMessage("Save failed");
    } finally {
      transformSavingRef.current = false;
      setTransformSaving(false);
    }
  }

  saveTransformRef.current = () => handleSaveTransform();

  async function handleToggleLock() {
    const idx = selectedIdxRef.current;
    const state = statesRef.current[idx];
    if (!state || transformSavingRef.current) return;
    // Save placement before locking so it doesn't snap back after reload
    if (!state.modelLocked && transformDirtyRef.current) {
      await handleSaveTransform();
    }
    const next = !state.modelLocked;
    transformSavingRef.current = true;
    setTransformSaving(true);
    setTransformMessage(null);
    try {
      try {
        await patchProject(state.projectId, { modelLocked: next });
      } catch (backendError) {
        try {
          await updateProjectInFirestore(state.projectId, { modelLocked: next });
        } catch {
          throw backendError;
        }
      }
      state.modelLocked = next;
      if (next) {
        setTransformDirty(false);
        setTransformMessage("Locked");
      } else {
        setTransformMessage("Unlocked");
      }
      window.setTimeout(() => setTransformMessage(null), 2200);
      map?.triggerRepaint();
    } catch (err) {
      console.error("Failed to toggle model lock:", err);
      setTransformMessage("Lock failed");
    } finally {
      transformSavingRef.current = false;
      setTransformSaving(false);
    }
  }

  const displayStatus = project?.status === "Planning" ? "Planned" : project?.status;

  return (
    <>
      {sel && project && (
        <PlaceSidePanel
          project={{ ...project, modelLocked: sel.modelLocked }}
          map={map}
          readOnly={readOnly}
          canAddPhotos={canAddPhotos}
          onClose={() => {
            setSelectedIdx(-1);
            selectedIdxRef.current = -1;
            setShowModal(false);
            setHoveredBuilding(null);
            map?.triggerRepaint();
          }}
          onEdit={() => openModal("edit")}
          onToggleLock={() => void handleToggleLock()}
        />
      )}

      {/* Hover Tooltip */}
      {hoveredBuilding && selectedIdx < 0 && (
        <div
          style={{
            position: "fixed",
            left: hoveredBuilding.x + 15,
            top: hoveredBuilding.y + 15,
            pointerEvents: "none",
            zIndex: 9998,
            background: "var(--cream)",
            backdropFilter: "none",
            border: "2px solid var(--ink)",
            borderRadius: 0,
            padding: "8px 12px",
            boxShadow: "5px 5px 0 var(--shadow-accent)",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--seed)", marginBottom: 2 }}>
            {hoveredBuilding.name}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>
            Status: <span style={{ color: PROJECT_STATUS_COLORS[(hoveredBuilding.status === "Planning" ? "Planned" : hoveredBuilding.status) as keyof typeof PROJECT_STATUS_COLORS] ?? PROJECT_STATUS_COLORS.Planned }}>
              {hoveredBuilding.status === "Planning" ? "Planned" : hoveredBuilding.status}
            </span>
          </div>
          <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>
            Click to select
          </div>
        </div>
      )}

      {/* Building Info Modal */}
      {showModal && project && sel && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--overlay)",
            backdropFilter: "none",
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: "var(--cream)",
              border: "2px solid var(--ink)",
              borderRadius: 0,
              maxWidth: 500,
              width: "90%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "8px 8px 0 var(--shadow-accent)",
              color: "var(--ink)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fixed Header */}
            <div style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--stroke)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3 }}>
                  {project.name}
                </h2>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {modalMode === "edit" ? "Edit project details" : (modelInfo?.label || "Building")}
                </div>
              </div>
              <button
                onClick={() => { setShowModal(false); setEditDraft(null); setModalMode("view"); }}
                style={{
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  fontSize: 24,
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: 16,
                }}
                title="Close (ESC)"
              >
                ×
              </button>
            </div>

            {/* Scrollable Content */}
            <div style={{
              padding: "24px",
              overflowY: "auto",
              flex: 1,
            }}
            className="modal-content-scroll"
            >
              {modalMode === "edit" && editDraft ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</label>
                    <select
                      value={editDraft.status}
                      onChange={(e) => setEditDraft({ ...editDraft, status: e.target.value as ProjectStatus })}
                      style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid var(--stroke)", background: "var(--cream-deep)" }}
                    >
                      {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
                        <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Progress: {editDraft.progress}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={editDraft.progress}
                      onChange={(e) => setEditDraft({ ...editDraft, progress: Number(e.target.value) })}
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Start date</label>
                      <input
                        type="date"
                        value={editDraft.startDate}
                        onChange={(e) => setEditDraft({ ...editDraft, startDate: e.target.value })}
                        style={{ width: "100%", padding: "8px", fontSize: 12, border: "1px solid var(--stroke)" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Target end</label>
                      <input
                        type="date"
                        value={editDraft.targetEndDate}
                        onChange={(e) => setEditDraft({ ...editDraft, targetEndDate: e.target.value })}
                        style={{ width: "100%", padding: "8px", fontSize: 12, border: "1px solid var(--stroke)" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Budget total (PHP)</label>
                      <input
                        type="number"
                        min={0}
                        value={editDraft.budgetTotal}
                        onChange={(e) => setEditDraft({ ...editDraft, budgetTotal: e.target.value })}
                        style={{ width: "100%", padding: "8px", fontSize: 12, border: "1px solid var(--stroke)" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Budget spent (PHP)</label>
                      <input
                        type="number"
                        min={0}
                        value={editDraft.budgetSpent}
                        onChange={(e) => setEditDraft({ ...editDraft, budgetSpent: e.target.value })}
                        style={{ width: "100%", padding: "8px", fontSize: 12, border: "1px solid var(--stroke)" }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</label>
                    <textarea
                      value={editDraft.description}
                      onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                      rows={3}
                      style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 13, border: "1px solid var(--stroke)", resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 10, paddingTop: 8, borderTop: "1px solid var(--stroke2)" }}>
                    <button
                      type="button"
                      onClick={() => { setModalMode("view"); setEditDraft(null); }}
                      style={{ flex: 1, padding: "10px", cursor: "pointer", border: "1px solid var(--stroke)", background: "var(--cream-deep)", fontWeight: 600 }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={saving}
                      style={{ flex: 1, padding: "10px", cursor: "pointer", border: "2px solid var(--ink)", background: "var(--seed)", color: "var(--ink)", fontWeight: 700, opacity: saving ? 0.7 : 1 }}
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </>
              ) : (
                <>
              {/* Status */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</div>
                <div style={{
                  display: "inline-block",
                  padding: "4px 12px",
                  borderRadius: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  background: `${PROJECT_STATUS_COLORS[displayStatus as ProjectStatus] ?? PROJECT_STATUS_COLORS.Planned}22`,
                  color: PROJECT_STATUS_COLORS[displayStatus as ProjectStatus] ?? PROJECT_STATUS_COLORS.Planned,
                  border: `1px solid ${PROJECT_STATUS_COLORS[displayStatus as ProjectStatus] ?? PROJECT_STATUS_COLORS.Planned}55`,
                }}>
                  {displayStatus}
                </div>
              </div>

              {/* Details Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</div>
                  <div style={{ fontSize: 14, color: "var(--ink-soft)" }}>{project.type}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Department</div>
                  <div style={{ fontSize: 14, color: "var(--ink-soft)" }}>{project.department}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</div>
                  <div style={{ fontSize: 14, color: "var(--ink-soft)" }}>{modelInfo?.category || "Building"}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Progress</div>
                  <div style={{ fontSize: 14, color: "var(--ink-soft)" }}>{project.progress}%</div>
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</div>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                  {project.description || modelInfo?.description || "Infrastructure project for Luisiana municipality."}
                </div>
              </div>

              {(project.budgetTotal != null && project.budgetTotal > 0) && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Budget</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    ₱{(project.budgetSpent ?? 0).toLocaleString()} / ₱{project.budgetTotal.toLocaleString()}
                    {" "}({Math.round(((project.budgetSpent ?? 0) / project.budgetTotal) * 100)}% utilized)
                  </div>
                </div>
              )}

              {(project.startDate || project.targetEndDate) && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Timeline</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    {project.startDate ?? "—"} → {project.targetEndDate ?? "—"}
                  </div>
                </div>
              )}

              {/* Progress photos from engineers */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Progress Photos
                  {(project.photos ?? []).filter((p) => p.kind !== "site").length > 0 && (
                    <span style={{ marginLeft: 6, fontWeight: 700, color: "var(--seed)" }}>
                      ({(project.photos ?? []).filter((p) => p.kind !== "site").length})
                    </span>
                  )}
                </div>
                {(project.photos ?? []).filter((p) => p.kind !== "site").length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--muted2)", lineHeight: 1.5 }}>
                    No progress photos uploaded yet.
                  </div>
                ) : (
                  <div className="project-photo-grid building-modal-photos">
                    {(project.photos ?? []).filter((p) => p.kind !== "site").map((photo) => (
                      <a
                        key={photo.id}
                        href={backendUrl(photo.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="project-photo-item building-modal-photo"
                        title={photo.caption || "Progress photo"}
                      >
                        <img src={backendUrl(photo.url)} alt={photo.caption || "Progress photo"} />
                        <div className="project-photo-meta">
                          <span>{photo.caption || "Progress photo"}</span>
                          {photo.milestoneId && (
                            <span className="project-photo-tag">
                              {(project.milestones ?? []).find((m) => m.id === photo.milestoneId)?.title ?? "Milestone"}
                            </span>
                          )}
                          <span style={{ opacity: 0.75 }}>
                            {new Date(photo.uploadedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Location */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Location</div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>
                  {project.location.lat.toFixed(6)}°N, {project.location.lon.toFixed(6)}°E
                </div>
              </div>

              <div style={{ paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
                <div style={{ fontSize: 11, color: "var(--muted2)" }}>
                  Last updated: {new Date(project.updatedAt).toLocaleDateString()} {new Date(project.updatedAt).toLocaleTimeString()}
                </div>
              </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Control HUD (bottom) - Only show when building is selected */}
      {sel && (
        <div style={{
          position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "var(--cream)", backdropFilter: "none",
          border: "2px solid var(--ink)", borderRadius: 0,
          padding: "12px 16px", display: "flex", flexDirection: "column", alignItems: "center",
          gap: 10, color: "var(--ink-soft)", fontSize: 13,
          zIndex: 100, boxShadow: "6px 6px 0 var(--shadow-accent)", whiteSpace: "nowrap",
          minWidth: 380,
        }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
            <span style={{ color: "var(--ink)", fontWeight: 600, fontSize: 14, flex: 1 }}>
              {sel.projectName}
            </span>
            {!readOnly && (
            <button
              onClick={() => openModal("edit")}
              style={{
                cursor: "pointer", background: "var(--seed)", border: "2px solid var(--ink)",
                color: "var(--ink)", fontSize: 11, padding: "6px 12px", borderRadius: 0, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 5,
                fontFamily: '"Chakra Petch", sans-serif',
                boxShadow: "2px 2px 0 var(--ink)",
              }}
              title="Edit Details"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
            )}
            <button
              onClick={() => { setSelectedIdx(-1); selectedIdxRef.current = -1; setShowModal(false); setHoveredBuilding(null); map?.triggerRepaint(); }}
              style={{
                cursor: "pointer", background: "none", border: "none",
                color: "var(--muted2)", fontSize: 20, padding: "0 4px",
                lineHeight: 1,
              }}
              title="Deselect"
            >×</button>
          </div>

          {/* Controls hint */}
          {!readOnly && (
          <div style={{
            display: "flex", gap: 12, fontSize: 11, color: "var(--muted2)",
            borderTop: "1px solid var(--stroke2)", paddingTop: 8, width: "100%",
          }}>
            {sel.modelLocked ? (
              <span style={{ color: "#c47a1a", fontWeight: 600 }}>Locked — unlock to move / rotate / scale</span>
            ) : (
              <>
                <span>Left-drag: Move</span>
                <span>Right-drag: Rotate</span>
                <span>Scroll: Scale</span>
                {snapToRoad && <span style={{ color: "#00c8d4" }}>Snap to road</span>}
              </>
            )}
          </div>
          )}

          {/* Action row */}
          {!readOnly && (
          <div style={{ display: "flex", gap: 8, width: "100%", paddingTop: 2, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void handleToggleLock()}
              disabled={transformSaving}
              style={{
                cursor: transformSaving ? "default" : "pointer",
                flex: "1 1 90px",
                padding: "8px 10px",
                borderRadius: 0,
                background: sel.modelLocked ? "rgba(196,122,26,0.18)" : "var(--cream-deep)",
                border: "2px solid var(--ink)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 700,
                opacity: transformSaving ? 0.65 : 1,
              }}
              title={sel.modelLocked ? "Unlock model so it can be moved" : "Lock model in place"}
            >
              {sel.modelLocked ? "Unlock" : "Lock"}
            </button>
            <button
              type="button"
              onClick={handleSaveTransform}
              disabled={transformSaving || !transformDirty || sel.modelLocked}
              style={{
                cursor: transformSaving || !transformDirty || sel.modelLocked ? "default" : "pointer",
                flex: "1 1 110px",
                padding: "8px 10px",
                borderRadius: 0,
                background: transformDirty && !sel.modelLocked ? "var(--seed)" : "var(--cream-deep)",
                border: "2px solid var(--ink)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 700,
                opacity: transformSaving || !transformDirty || sel.modelLocked ? 0.65 : 1,
              }}
              title={sel.modelLocked ? "Unlock before saving position" : "Save map position, rotation, and scale"}
            >
              {transformSaving
                ? "Saving…"
                : transformMessage ??
                  (sel.modelLocked ? "Locked" : transformDirty ? "Save Position" : "Saved")}
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  cursor: "pointer", flex: "1 1 120px", padding: "8px 0", borderRadius: 0,
                  background: "rgba(255,77,79,0.15)", border: "1px solid rgba(255,77,79,0.3)",
                  color: "#ff4d4f", fontSize: 12, fontWeight: 600,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
                Remove Building
              </button>
            ) : (
              <>
                <div style={{
                  flex: 1, display: "flex", flexDirection: "column", gap: 6,
                  padding: "8px 10px", borderRadius: 0,
                  background: "rgba(255,77,79,0.1)", border: "1px solid rgba(255,77,79,0.3)",
                }}>
                  <span style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
                    Remove <strong style={{ color: "var(--seed)" }}>{sel.projectName}</strong>?
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => {
                        onDeleteBuilding?.(sel.projectId);
                        setSelectedIdx(-1);
                        selectedIdxRef.current = -1;
                        setConfirmDelete(false);
                        setShowModal(false);
                        setHoveredBuilding(null);
                      }}
                      style={{
                        cursor: "pointer", flex: 1, padding: "7px 0", borderRadius: 0,
                        background: "rgba(255,77,79,0.25)", border: "1px solid rgba(255,77,79,0.5)",
                        color: "#ff4d4f", fontSize: 12, fontWeight: 700,
                      }}
                    >
                      Yes, Remove
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      style={{
                        cursor: "pointer", flex: 1, padding: "7px 0", borderRadius: 0,
                        background: "var(--cream-deep)", border: "1px solid var(--stroke)",
                        color: "var(--muted)", fontSize: 12, fontWeight: 600,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          )}
        </div>
      )}
    </>
  );
}
