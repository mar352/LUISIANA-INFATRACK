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
import type { Project } from "../types";
import { MODEL_CATALOG } from "../types";

const LAYER_ID = "glb-buildings";
const HIT_RADIUS_PX = 32;

function statusColor(status: Project["status"]): THREE.Color {
  if (status === "Completed") return new THREE.Color(0x3d7fd5);
  if (status === "Ongoing")   return new THREE.Color(0xf5a623);
  return new THREE.Color(0x888899);
}

type Props = {
  map: MapLibreMap | null;
  projects: Project[];
  visible: boolean;
  onBuildingClick?: (hit: boolean) => void;
  onDeleteBuilding?: (projectId: string) => void;
};

type ModelState = {
  scene: THREE.Group;
  // Mercator coords (used for hit testing and drag)
  translateX: number;
  translateY: number;
  translateZ: number;
  // Original lng/lat (used for getMatrixForModel with terrain)
  lng: number;
  lat: number;
  baseScale: number;
  scaleMultiplier: number;
  rotateZ: number;
  projectId: string;
  projectName: string;
  status: Project["status"];
};

export function BuildingOverlay({ map, projects, visible, onBuildingClick, onDeleteBuilding }: Props) {
  const gltfCache = useRef<Map<string, THREE.Group>>(new Map());
  const statesRef = useRef<ModelState[]>([]);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.Camera>(new THREE.Camera());
  const sceneRef = useRef<THREE.Scene | null>(null);
  const lastMapMatrixRef = useRef<THREE.Matrix4 | null>(null);
  const lastRenderArgsRef = useRef<any>(null);
  const layerAddedRef = useRef(false);
  const manuallyMovedRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Pre-allocated matrices to avoid GC pressure every frame
  const _mapMatrix   = useRef(new THREE.Matrix4());
  const _rotX        = useRef(new THREE.Matrix4());
  const _rotHeading  = useRef(new THREE.Matrix4());
  const _localMatrix = useRef(new THREE.Matrix4());
  const _scaleVec    = useRef(new THREE.Vector3());
  const _axisX       = new THREE.Vector3(1, 0, 0);
  const _axisY       = new THREE.Vector3(0, 1, 0);
  // Track last selection to only update emissive when it changes
  const lastSelIdxRef = useRef(-2); // -2 = uninitialized

  const [selectedIdx, setSelectedIdx] = useState(-1);
  const selectedIdxRef = useRef(-1);
  useEffect(() => { selectedIdxRef.current = selectedIdx; setConfirmDelete(false); }, [selectedIdx]);

  // Confirmation state for delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // Modal state for building info
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('view');
  
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
      sceneRef.current = null;
      rendererRef.current = null;
      statesRef.current = [];
    };

    if (!visible) {
      fullReset();
      return;
    }

    const createSceneAndLayer = () => {
      if (layerAddedRef.current) return;

      // Build a fresh scene with just lights
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 2.5));
      const sun = new THREE.DirectionalLight(0xfff4e0, 3.0);
      sun.position.set(0, -70, 100).normalize();
      scene.add(sun);
      const sun2 = new THREE.DirectionalLight(0xffffff, 1.5);
      sun2.position.set(0, 70, 100).normalize();
      scene.add(sun2);
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
          rendererRef.current = r;
        },

        render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: any) {
          const renderer = rendererRef.current;
          const scene = sceneRef.current;
          if (!renderer || !scene) return;

          const mainMatrix: number[] =
            args.defaultProjectionData?.mainMatrix ??
            args.modelViewProjectionMatrix;
          if (!mainMatrix) return;

          // Reuse pre-allocated matrix — no GC
          _mapMatrix.current.fromArray(mainMatrix);
          lastMapMatrixRef.current = _mapMatrix.current;
          lastRenderArgsRef.current = args;

          const states = statesRef.current;
          if (states.length === 0) return;

          const selIdx = selectedIdxRef.current;

          // Only update emissive materials when selection changes — not every frame
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
                      mat.emissive.set(0xffdd44);
                      mat.emissiveIntensity = 1.2;
                    } else {
                      mat.emissive.copy(statusColor(t.status));
                      mat.emissiveIntensity = 0.4;
                    }
                  }
                });
              });
            }
          }

          renderer.resetState();

          for (let i = 0; i < states.length; i++) {
            const t = states[i];

            for (const other of states) other.scene.visible = false;
            t.scene.visible = true;

            const finalScale = t.baseScale * t.scaleMultiplier;

            // Reuse pre-allocated matrices — zero GC per frame
            _rotX.current.makeRotationAxis(_axisX, Math.PI / 2);
            _rotHeading.current.makeRotationAxis(_axisY, t.rotateZ);
            _scaleVec.current.set(finalScale, -finalScale, finalScale);

            _localMatrix.current
              .makeTranslation(t.translateX, t.translateY, t.translateZ)
              .scale(_scaleVec.current)
              .multiply(_rotX.current)
              .multiply(_rotHeading.current);

            cameraRef.current.projectionMatrix
              .copy(_mapMatrix.current)
              .multiply(_localMatrix.current);
            cameraRef.current.projectionMatrixInverse
              .copy(cameraRef.current.projectionMatrix)
              .invert();

            renderer.render(scene, cameraRef.current);
            t.scene.visible = true;
          }

          for (const t of states) t.scene.visible = true;
          // NOTE: do NOT call map.triggerRepaint() here — it creates an
          // infinite render loop. MapLibre will call render() again when
          // the camera moves or state changes.
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

    return () => {
      map.off("style.load", createSceneAndLayer as any);
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
        
        // Determine if this is a custom model URL or a standard model path
        const modelPath = glb.startsWith('http') || glb.startsWith('/uploads/') 
          ? glb 
          : `/models/${glb}`;
        
        loader.load(
          modelPath,
          (gltf) => { gltfCache.current.set(glb, gltf.scene); resolve(); },
          undefined,
          (err) => { console.warn(`[BuildingOverlay] Failed to load ${glb}:`, err); resolve(); }
        );
      }))
    );

    loadMissing().then(() => {
      // Ensure scene exists (may not if layer hasn't been added yet)
      if (!sceneRef.current) {
        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 2.5));
        const sun = new THREE.DirectionalLight(0xfff4e0, 3.0);
        sun.position.set(0, -70, 100).normalize();
        scene.add(sun);
        const sun2 = new THREE.DirectionalLight(0xffffff, 1.5);
        sun2.position.set(0, 70, 100).normalize();
        scene.add(sun2);
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
        if (existing) {
          // Reuse existing Three.js object — preserves user edits
          model = existing.scene;
        } else {
          // New project — clone from cache and add to scene
          model = proto.clone(true);
          model.position.set(0, 0, 0);
          model.rotation.set(0, 0, 0);
          model.scale.set(1, 1, 1);
          scene.add(model);
        }

        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const modelNativeHeight = Math.max(size.x, size.y, size.z, 0.001);

        newStates.push({
          scene: model,
          translateX: manualPos?.x ?? mc.x,
          translateY: manualPos?.y ?? mc.y,
          translateZ: mc.z ?? 0,
          lng: p.location.lon,
          lat: p.location.lat,
          baseScale: (targetHeightM / modelNativeHeight) * metersPerUnit,
          scaleMultiplier: existing?.scaleMultiplier ?? 1,
          rotateZ: existing?.rotateZ ?? THREE.MathUtils.degToRad(p.rotation ?? 0),
          projectId: p.id,
          projectName: p.name,
          status: p.status,
        });
      }

      // Remove Three.js objects for projects that no longer exist
      const newIds = new Set(newStates.map(s => s.projectId));
      for (const old of statesRef.current) {
        if (!newIds.has(old.projectId)) {
          scene.remove(old.scene);
        }
      }

      statesRef.current = newStates;
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

        const rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        const rotHeading = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), t.rotateZ);

        const l = new THREE.Matrix4()
          .makeTranslation(t.translateX, t.translateY, t.translateZ)
          .scale(new THREE.Vector3(finalScale, -finalScale, finalScale))
          .multiply(rotX)
          .multiply(rotHeading);

        const combinedMatrix = new THREE.Matrix4().copy(mat).multiply(l);
        const combinedInverse = combinedMatrix.clone().invert();

        const nearLocal = new THREE.Vector3(ndcX, ndcY, -1).applyMatrix4(combinedInverse);
        const farLocal  = new THREE.Vector3(ndcX, ndcY,  1).applyMatrix4(combinedInverse);
        const rayDir = farLocal.clone().sub(nearLocal).normalize();
        const ray = new THREE.Ray(nearLocal, rayDir);

        const bbox = new THREE.Box3().setFromObject(t.scene);
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
    let isMoving = false;
    let moveDragLastX = 0;
    let moveDragLastY = 0;
    let didMove = false;

    function screenDeltaToMercator(dxPx: number, dyPx: number) {
      const zoom = map.getZoom();
      const worldPx = 512 * Math.pow(2, zoom);
      return { dx: dxPx / worldPx, dy: dyPx / worldPx };
    }

    const onMouseDown = (e: MouseEvent) => {
      const idx = selectedIdxRef.current;
      if (idx < 0) return;
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
        const lngLat = new maplibregl.MercatorCoordinate(s.translateX, s.translateY, s.translateZ).toLngLat();
        s.lng = lngLat.lng;
        s.lat = lngLat.lat;
        manuallyMovedRef.current.set(s.projectId, { x: s.translateX, y: s.translateY });
        didMove = true;
        map.triggerRepaint();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (isDragging) {
        const idx = selectedIdxRef.current;
        if (idx < 0) { isDragging = false; return; }
        const dx = e.clientX - dragLastX;
        dragLastX = e.clientX;
        statesRef.current[idx].rotateZ += THREE.MathUtils.degToRad(dx * 0.5);
        map.triggerRepaint();
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0 && isMoving) { isMoving = false; map.dragPan.enable(); }
      if (e.button === 2) isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      const idx = selectedIdxRef.current;
      if (idx < 0) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const px = (e.clientX - rect.left) * dpr;
      const py = (e.clientY - rect.top) * dpr;
      const s = statesRef.current[idx];
      if (!s) return;
      const sc = mercatorToScreen(s.translateX, s.translateY, s.translateZ);
      if (!sc) return;
      if ((sc.x - px) ** 2 + (sc.y - py) ** 2 > (HIT_RADIUS_PX * 4) ** 2) return;
      s.scaleMultiplier = Math.max(0.1, Math.min(20, s.scaleMultiplier * (e.deltaY < 0 ? 1.08 : 0.93)));
      map.triggerRepaint();
      e.preventDefault();
      e.stopPropagation();
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

  return (
    <>
      {/* Hover Tooltip */}
      {hoveredBuilding && selectedIdx < 0 && (
        <div
          style={{
            position: "fixed",
            left: hoveredBuilding.x + 15,
            top: hoveredBuilding.y + 15,
            pointerEvents: "none",
            zIndex: 9998,
            background: "rgba(10, 20, 35, 0.95)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            padding: "8px 12px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#ffd666", marginBottom: 2 }}>
            {hoveredBuilding.name}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>
            Status: <span style={{ color: hoveredBuilding.status === "Completed" ? "#5cdb95" : hoveredBuilding.status === "Ongoing" ? "#ffa500" : "#6495ed" }}>
              {hoveredBuilding.status}
            </span>
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
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
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: "rgba(15, 23, 35, 0.98)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              maxWidth: 500,
              width: "90%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              color: "rgba(255,255,255,0.9)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fixed Header */}
            <div style={{
              padding: "20px 24px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#fff", lineHeight: 1.3 }}>
                  {project.name}
                </h2>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                  {modelInfo?.label || "Building"}
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.5)",
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
              {/* Status */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</div>
                <div style={{
                  display: "inline-block",
                  padding: "4px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: project.status === "Completed" ? "rgba(92,219,149,0.15)" : project.status === "Ongoing" ? "rgba(255,165,0,0.15)" : "rgba(100,149,237,0.15)",
                  color: project.status === "Completed" ? "#5cdb95" : project.status === "Ongoing" ? "#ffa500" : "#6495ed",
                  border: `1px solid ${project.status === "Completed" ? "rgba(92,219,149,0.3)" : project.status === "Ongoing" ? "rgba(255,165,0,0.3)" : "rgba(100,149,237,0.3)"}`,
                }}>
                  {project.status}
                </div>
              </div>

              {/* Details Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)" }}>{project.type}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Department</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)" }}>{project.department}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)" }}>{modelInfo?.category || "Building"}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Progress</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)" }}>{project.progress}%</div>
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
                  {modelInfo?.description || "Infrastructure project for Luisiana municipality."}
                </div>
              </div>

              {/* Location */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Location</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>
                  {project.location.lat.toFixed(6)}°N, {project.location.lon.toFixed(6)}°E
                </div>
              </div>

              {/* Last Updated */}
              <div style={{ paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  Last updated: {new Date(project.updatedAt).toLocaleDateString()} {new Date(project.updatedAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Control HUD (bottom) - Only show when building is selected */}
      {sel && (
        <div style={{
          position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "rgba(15,23,35,0.95)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
          padding: "12px 16px", display: "flex", flexDirection: "column", alignItems: "center",
          gap: 10, color: "rgba(255,255,255,0.85)", fontSize: 13,
          zIndex: 100, boxShadow: "0 4px 24px rgba(0,0,0,0.5)", whiteSpace: "nowrap",
          minWidth: 380,
        }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 14, flex: 1 }}>
              {sel.projectName}
            </span>
            <button
              onClick={() => { setModalMode('view'); setShowModal(true); }}
              style={{
                cursor: "pointer", background: "rgba(74,144,217,0.15)", border: "1px solid rgba(74,144,217,0.3)",
                color: "#4a90d9", fontSize: 11, padding: "6px 12px", borderRadius: 6, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 5,
              }}
              title="View Details"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              View
            </button>
            <button
              onClick={() => { setModalMode('edit'); setShowModal(true); }}
              style={{
                cursor: "pointer", background: "rgba(255,214,102,0.15)", border: "1px solid rgba(255,214,102,0.3)",
                color: "#ffd666", fontSize: 11, padding: "6px 12px", borderRadius: 6, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 5,
              }}
              title="Edit Details"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
            <button
              onClick={() => { setSelectedIdx(-1); selectedIdxRef.current = -1; setShowModal(false); setHoveredBuilding(null); map?.triggerRepaint(); }}
              style={{
                cursor: "pointer", background: "none", border: "none",
                color: "rgba(255,255,255,0.4)", fontSize: 20, padding: "0 4px",
                lineHeight: 1,
              }}
              title="Deselect"
            >×</button>
          </div>

          {/* Controls hint */}
          <div style={{
            display: "flex", gap: 12, fontSize: 11, color: "rgba(255,255,255,0.45)",
            borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8, width: "100%",
          }}>
            <span>Left-drag: Move</span>
            <span>Right-drag: Rotate</span>
            <span>Scroll: Scale</span>
          </div>

          {/* Action row */}
          <div style={{ display: "flex", gap: 8, width: "100%", paddingTop: 2 }}>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  cursor: "pointer", flex: 1, padding: "8px 0", borderRadius: 8,
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
                  padding: "8px 10px", borderRadius: 8,
                  background: "rgba(255,77,79,0.1)", border: "1px solid rgba(255,77,79,0.3)",
                }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", textAlign: "center" }}>
                    Remove <strong style={{ color: "#ffd666" }}>{sel.projectName}</strong>?
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
                        cursor: "pointer", flex: 1, padding: "7px 0", borderRadius: 6,
                        background: "rgba(255,77,79,0.25)", border: "1px solid rgba(255,77,79,0.5)",
                        color: "#ff4d4f", fontSize: 12, fontWeight: 700,
                      }}
                    >
                      Yes, Remove
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      style={{
                        cursor: "pointer", flex: 1, padding: "7px 0", borderRadius: 6,
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                        color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: 600,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
