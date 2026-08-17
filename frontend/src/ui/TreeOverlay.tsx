/**
 * TreeOverlay — InstancedMesh trees from OSM wood landcover (Luisiana only).
 * Uses the user-supplied /models/tree.fbx — no procedural substitute.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, CustomLayerInterface, MapGeoJSONFeature } from "maplibre-gl";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  bboxIntersectsLuisiana,
  buildTreePosesFromFeatures,
  type TreeInstancePose,
  type TreeInstanceCached,
} from "../lib/tree-scatter";
import {
  cameraPoseKey,
  disposeInstancedMesh,
} from "../lib/three-dispose";
import { detectOpenMapTilesSourceId } from "../lib/stadia";

const LAYER_ID = "glb-trees";
const TREE_MODEL_URL = "/models/tree.fbx";
const MIN_ZOOM = 12;
/** Cap kept modest — each instance matrix is 64 bytes; multi-mesh × 22k OOM'd tabs. */
const MAX_INSTANCES = 7000;
const TARGET_TREE_HEIGHT_M = 12;
const LANDCOVER_LAYER = "landcover";

function maxTreesForZoom(zoom: number): number {
  if (zoom >= 16) return MAX_INSTANCES;
  if (zoom >= 15) return 5500;
  if (zoom >= 14) return 4000;
  if (zoom >= 13) return 2800;
  return 1800;
}

// Spacing stays fixed in world meters (see tree-scatter). Do not scale by zoom —
// that reshuffled / dropped trees when zooming in.

type Props = {
  map: MapLibreMap | null;
  visible?: boolean;
  sunLightPosition?: [number, number, number];
  sunIsDaylight?: boolean;
};

const DEFAULT_SUN: [number, number, number] = [40, -60, 80];

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

/** Same ground-plane convention as BuildingOverlay (GLTF Y-up → map Z-up). */
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
  const rx = new Float64Array([
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, 0, 1,
  ]);
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
  mulMat4Float64(rx, ry, tmp1);
  mulMat4Float64(s, tmp1, tmp2);
  mulMat4Float64(t, tmp2, out);
  return out;
}

const TRUNK_COLOR = new THREE.Color(0x6b3f24);
const LEAF_COLOR = new THREE.Color(0x2f9b3a);
const LEAF_COLOR_B = new THREE.Color(0x1e7a2d);
/** Lift above DEM so trunks aren't buried by terrain exaggeration / sampling error. */
const TREE_LIFT_M = 2.5;

function queryGroundAltitude(map: MapLibreMap, lng: number, lat: number): number {
  try {
    const elev = map.queryTerrainElevation({ lng, lat } as maplibregl.LngLatLike);
    return typeof elev === "number" && Number.isFinite(elev) ? elev : 0;
  } catch {
    return 0;
  }
}

/** Mercator position for a tree sitting on DEM (+ small lift so it isn't buried). */
function mercatorOnTerrain(map: MapLibreMap, lon: number, lat: number) {
  const altitude = queryGroundAltitude(map, lon, lat) + TREE_LIFT_M;
  const mc = maplibregl.MercatorCoordinate.fromLngLat({ lng: lon, lat }, altitude);
  return { mx: mc.x, my: mc.y, mz: mc.z ?? 0, altitude };
}

function makeTreeMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  mat.needsUpdate = true;
  return mat;
}

type TreePart = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
};

/**
 * Bake FBX into ONE Y-up geometry (merged) with trunk base at y=0.
 * Single InstancedMesh = far less GPU memory than N parts × maxInstances.
 */
function prepareTreeParts(root: THREE.Object3D): { parts: TreePart[]; nativeHeight: number } | null {
  root.updateMatrixWorld(true);

  const geos: THREE.BufferGeometry[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    geos.push(g);
  });
  if (geos.length === 0) return null;

  let worldBox = new THREE.Box3();
  for (const g of geos) {
    g.computeBoundingBox();
    if (g.boundingBox) worldBox.union(g.boundingBox);
  }
  if (worldBox.isEmpty()) return null;

  const size = new THREE.Vector3();
  worldBox.getSize(size);

  if (size.z > size.y * 1.15) {
    const toYUp = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    worldBox = new THREE.Box3();
    for (const g of geos) {
      g.applyMatrix4(toYUp);
      g.computeBoundingBox();
      if (g.boundingBox) worldBox.union(g.boundingBox);
    }
  }

  const cx = (worldBox.min.x + worldBox.max.x) / 2;
  const cz = (worldBox.min.z + worldBox.max.z) / 2;
  const groundY = worldBox.min.y;
  const groundShift = new THREE.Matrix4().makeTranslation(-cx, -groundY, -cz);
  worldBox = new THREE.Box3();
  for (const g of geos) {
    g.applyMatrix4(groundShift);
    g.computeBoundingBox();
    if (g.boundingBox) worldBox.union(g.boundingBox);
  }

  const minY = worldBox.min.y;
  const height = Math.max(worldBox.max.y - minY, 1e-6);
  const trunkTop = minY + height * 0.22;

  for (const g of geos) {
    const pos = g.getAttribute("position");
    const colors = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y <= trunkTop) {
        tmp.copy(TRUNK_COLOR);
      } else {
        const t = Math.min(1, Math.max(0, (y - trunkTop) / (height * 0.78)));
        tmp.copy(LEAF_COLOR).lerp(LEAF_COLOR_B, t * 0.45);
      }
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  if (!merged) return null;
  for (const g of geos) {
    if (g !== merged) g.dispose();
  }

  return {
    parts: [{ geometry: merged, material: makeTreeMaterial() }],
    nativeHeight: height,
  };
}

function featureBBox(geometry: any): { west: number; south: number; east: number; north: number } | null {
  const coords: number[][] = [];
  const walk = (c: any) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      coords.push([c[0], c[1]]);
      return;
    }
    for (const x of c) walk(x);
  };
  walk(geometry?.coordinates);
  if (coords.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return { west, south, east, north };
}

export function TreeOverlay({
  map,
  visible = true,
  sunLightPosition = DEFAULT_SUN,
  sunIsDaylight = true,
}: Props) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera>(new THREE.Camera());
  const meshesRef = useRef<THREE.InstancedMesh[]>([]);
  const baseScaleRef = useRef(1);
  const posesRef = useRef<TreeInstanceCached[]>([]);
  const layerAddedRef = useRef(false);
  const modelReadyRef = useRef(false);
  const rebuildTimerRef = useRef<number | null>(null);
  const zoomingRef = useRef(false);
  const matricesDirtyRef = useRef(true);
  const lastCamKeyRef = useRef("");
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
      sun.intensity = 1.45;
      sun.color.set(0xfff4e0);
      amb.intensity = 1.05;
      amb.color.set(0xffffff);
    } else {
      sun.intensity = 0.2;
      sun.color.set(0x8899bb);
      amb.intensity = 0.4;
      amb.color.set(0x667799);
    }
    matricesDirtyRef.current = true;
    map?.triggerRepaint();
  }, [sunLightPosition, sunIsDaylight, map]);

  const _vp64 = useRef(new Float64Array(16));
  const _camT64 = useRef(new Float64Array(16));
  const _vpCentered = useRef(new Float64Array(16));
  const _model64 = useRef(new Float64Array(16));
  const _tmpMat = useRef(new THREE.Matrix4());

  useEffect(() => {
    if (!map) return;

    const removeLayer = () => {
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      } catch {
        /* ignore */
      }
      layerAddedRef.current = false;
    };

    const disposeScene = () => {
      removeLayer();
      for (const mesh of meshesRef.current) {
        sceneRef.current?.remove(mesh);
        disposeInstancedMesh(mesh);
      }
      meshesRef.current = [];
      sceneRef.current = null;
      // Shared MapLibre GL context — do not call renderer.dispose()/forceContextLoss
      rendererRef.current = null;
      sunLightRef.current = null;
      ambientLightRef.current = null;
      modelReadyRef.current = false;
      posesRef.current = [];
      matricesDirtyRef.current = true;
      lastCamKeyRef.current = "";
    };

    if (!visible) {
      disposeScene();
      return;
    }

    const applyPosesToMesh = (poses: TreeInstancePose[]) => {
      if (!map || meshesRef.current.length === 0) return;
      // Keep all sampled poses — do NOT distance-cull from map center.
      // With high pitch the look-at point is far ahead of center, so that
      // cull made trees vanish when zooming in / tilting toward a forest.
      const n = Math.min(poses.length, MAX_INSTANCES);
      const cached: TreeInstanceCached[] = poses.slice(0, n).map((p) => {
        const { mx, my, mz } = mercatorOnTerrain(map, p.lon, p.lat);
        return { ...p, mx, my, mz };
      });
      posesRef.current = cached;
      for (const mesh of meshesRef.current) {
        mesh.count = cached.length;
        mesh.instanceMatrix.needsUpdate = true;
      }
      matricesDirtyRef.current = true;
      map.triggerRepaint();
    };

    const rebuildInstances = () => {
      if (!map || !modelReadyRef.current || meshesRef.current.length === 0) return;
      const zoom = map.getZoom();
      if (zoom < MIN_ZOOM) {
        applyPosesToMesh([]);
        return;
      }

      const bounds = map.getBounds();
      const view = {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      };
      if (!bboxIntersectsLuisiana(view.west, view.south, view.east, view.north)) {
        applyPosesToMesh([]);
        return;
      }

      let features: MapGeoJSONFeature[] = [];
      try {
        const omtSource = detectOpenMapTilesSourceId(map);
        if (!map.getSource(omtSource)) {
          applyPosesToMesh([]);
          return;
        }
        features = map.querySourceFeatures(omtSource, {
          sourceLayer: LANDCOVER_LAYER,
          filter: [
            "match",
            ["get", "class"],
            ["wood", "grass", "scrub"],
            true,
            false,
          ],
        }) as MapGeoJSONFeature[];
      } catch (err) {
        console.warn("[TreeOverlay] querySourceFeatures failed:", err);
        applyPosesToMesh([]);
        return;
      }

      const clipped = features.filter((f) => {
        const b = featureBBox(f.geometry);
        if (!b) return false;
        return bboxIntersectsLuisiana(b.west, b.south, b.east, b.north);
      });

      const cap = maxTreesForZoom(zoom);
      const poses = buildTreePosesFromFeatures(clipped as any, {
        zoom,
        maxInstances: cap,
        maxPerFeature: Math.min(900, cap),
        // Fixed world spacing — zoom only changes how many we keep, not where they sit
        spacingScale: 1,
      });
      applyPosesToMesh(poses);
    };

    const scheduleRebuild = (delayMs = 280) => {
      if (zoomingRef.current) return; // freeze poses while zooming — stops the "dance"
      if (rebuildTimerRef.current != null) window.clearTimeout(rebuildTimerRef.current);
      rebuildTimerRef.current = window.setTimeout(() => {
        rebuildTimerRef.current = null;
        if (zoomingRef.current) return;
        rebuildInstances();
      }, delayMs);
    };

    const onZoomStart = () => {
      zoomingRef.current = true;
      if (rebuildTimerRef.current != null) {
        window.clearTimeout(rebuildTimerRef.current);
        rebuildTimerRef.current = null;
      }
    };
    const onZoomEnd = () => {
      zoomingRef.current = false;
      scheduleRebuild(320);
    };
    const onMoveEnd = () => {
      if (zoomingRef.current) return;
      scheduleRebuild(280);
    };
    const onSourceData = (e: any) => {
      if (zoomingRef.current) return;
      const id = e?.sourceId as string | undefined;
      if (id) {
        const omtSource = detectOpenMapTilesSourceId(map);
        if (id !== omtSource && id !== "terrain-dem") return;
      }
      scheduleRebuild(400);
    };

    const createSceneAndLayer = () => {
      if (layerAddedRef.current) return;

      const scene = new THREE.Scene();
      const ambient = new THREE.AmbientLight(0xffffff, 1.05);
      scene.add(ambient);
      ambientLightRef.current = ambient;
      const [sx, sy, sz] = sunPosRef.current;
      const sun = new THREE.DirectionalLight(0xfff4e0, 1.45);
      sun.position.set(sx, sy, sz);
      sun.castShadow = false;
      scene.add(sun);
      sunLightRef.current = sun;
      const fill = new THREE.DirectionalLight(0xc8e6c9, 0.4);
      fill.position.set(-30, 40, 50).normalize();
      fill.castShadow = false;
      scene.add(fill);
      sceneRef.current = scene;

      for (const mesh of meshesRef.current) {
        mesh.castShadow = false;
        mesh.frustumCulled = false;
        scene.add(mesh);
      }

      const layer: CustomLayerInterface = {
        id: LAYER_ID,
        type: "custom",
        renderingMode: "3d",

        onAdd(_map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
          const r = new THREE.WebGLRenderer({
            canvas: _map.getCanvas(),
            context: gl as WebGL2RenderingContext,
            antialias: false,
          });
          r.autoClear = false;
          r.outputColorSpace = THREE.SRGBColorSpace;
          r.toneMapping = THREE.NoToneMapping;
          r.shadowMap.enabled = false;
          rendererRef.current = r;
        },

        render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: any) {
          const renderer = rendererRef.current;
          const scene = sceneRef.current;
          const meshes = meshesRef.current;
          if (!renderer || !scene || meshes.length === 0) return;
          const lead = meshes[0];
          if (lead.count <= 0) return;

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

          const camera = cameraRef.current;
          camera.matrixAutoUpdate = false;
          camera.projectionMatrix.fromArray(_vpCentered.current as unknown as number[]);
          camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

          const poses = posesRef.current;
          const n = Math.min(lead.count, poses.length);
          const base = baseScaleRef.current;
          const tmp = _tmpMat.current;
          const f64 = _model64.current;

          // Buffer pooling: rewrite instance matrices only when camera/poses change
          const camKey = cameraPoseKey(map);
          const needUpload =
            matricesDirtyRef.current || lastCamKeyRef.current !== camKey;

          if (needUpload) {
            for (let i = 0; i < n; i++) {
              const p = poses[i];
              const dx = p.mx - camMerc.x;
              const dy = p.my - camMerc.y;
              const dz = p.mz - (camMerc.z || 0);
              writeTranslationScaleRotation(f64, dx, dy, dz, base * p.scale, p.yaw);
              tmp.fromArray(f64 as unknown as number[]);
              for (const mesh of meshes) {
                mesh.setMatrixAt(i, tmp);
              }
            }
            for (const mesh of meshes) {
              mesh.count = n;
              mesh.instanceMatrix.needsUpdate = true;
              mesh.matrixAutoUpdate = false;
              mesh.matrix.identity();
              mesh.updateMatrixWorld(true);
              mesh.castShadow = false;
              mesh.frustumCulled = false;
            }

            matricesDirtyRef.current = false;
            lastCamKeyRef.current = camKey;
          }

          renderer.resetState();
          // Same as BuildingOverlay: map terrain/extrusions already wrote depth.
          // Without clearing, pitched views bury trees behind the DEM depth buffer
          // (they only peek through in near–top-down views).
          renderer.clearDepth();
          renderer.render(scene, camera);
          renderer.resetState();
        },
      };

      try {
        map.addLayer(layer as any);
        layerAddedRef.current = true;
        map.triggerRepaint();
      } catch {
        /* already exists */
      }
    };

    const loadTreeModel = () => {
      if (modelReadyRef.current) {
        createSceneAndLayer();
        scheduleRebuild();
        return;
      }

      const loader = new FBXLoader();
      loader.load(
        TREE_MODEL_URL,
        (fbx) => {
          const prepared = prepareTreeParts(fbx);
          if (!prepared) {
            console.warn("[TreeOverlay] tree.fbx has no usable mesh geometry.");
            return;
          }

          const { parts, nativeHeight } = prepared;
          const center = map.getCenter();
          const mc = maplibregl.MercatorCoordinate.fromLngLat(
            { lng: center.lng, lat: center.lat },
            0,
          );
          const metersPerUnit = mc.meterInMercatorCoordinateUnits();
          baseScaleRef.current = (TARGET_TREE_HEIGHT_M / nativeHeight) * metersPerUnit;

          for (const mesh of meshesRef.current) {
            sceneRef.current?.remove(mesh);
            disposeInstancedMesh(mesh);
          }

          const meshes: THREE.InstancedMesh[] = parts.map(({ geometry, material }) => {
            const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
            mesh.count = 0;
            mesh.frustumCulled = false;
            mesh.matrixAutoUpdate = false;
            mesh.renderOrder = 2;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            return mesh;
          });
          meshesRef.current = meshes;

          modelReadyRef.current = true;

          if (!sceneRef.current) {
            createSceneAndLayer();
          } else {
            for (const mesh of meshes) sceneRef.current.add(mesh);
          }
          if (!layerAddedRef.current) createSceneAndLayer();
          scheduleRebuild();
        },
        undefined,
        (err) => {
          console.warn(
            "[TreeOverlay] Failed to load /models/tree.fbx — place your FBX there to enable trees.",
            err,
          );
        },
      );
    };

    if (map.isStyleLoaded()) {
      loadTreeModel();
    } else {
      map.once("style.load", loadTreeModel);
    }

    const onStyleLoad = () => {
      layerAddedRef.current = false;
      loadTreeModel();
    };
    map.on("style.load", onStyleLoad);
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);
    map.on("moveend", onMoveEnd);
    map.on("sourcedata", onSourceData);

    return () => {
      if (rebuildTimerRef.current != null) window.clearTimeout(rebuildTimerRef.current);
      map.off("style.load", onStyleLoad);
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
      map.off("moveend", onMoveEnd);
      map.off("sourcedata", onSourceData);
      disposeScene();
    };
  }, [map, visible]);

  return null;
}
