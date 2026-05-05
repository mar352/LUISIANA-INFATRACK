/**
 * BuildingOverlay — renders GLB models on the MapLibre map using Three.js.
 *
 * Architecture:
 *  - The MapLibre custom layer is created ONCE and never torn down unless
 *    visible=false or the map changes. This prevents the flash/disappear on
 *    every socket update.
 *  - Per-model mutable state (scale, rotation, tint) is updated via refs so
 *    React re-renders never rebuild the layer.
 *  - Each model is rendered one at a time with its own camera matrix
 *    (camera.projectionMatrix = mapMatrix * modelLocalMatrix).
 *
 * Interactions on selected building:
 *  - Click building  → select (yellow highlight)
 *  - Right-drag      → rotate selected building
 *  - Scroll wheel    → scale selected building
 *  - Escape / click empty → deselect
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
};

type ModelState = {
  scene: THREE.Group;
  translateX: number;
  translateY: number;
  translateZ: number;
  rotateX: number;       // fixed: PI/2 for Y-up → Z-up
  baseScale: number;     // from target height
  scaleMultiplier: number; // user-controlled
  rotateZ: number;       // user-controlled
  projectId: string;
  projectName: string;
  status: Project["status"];
};

export function BuildingOverlay({ map, projects, visible, onBuildingClick }: Props) {
  const gltfCache = useRef<Map<string, THREE.Group>>(new Map());

  // All mutable render state lives in a ref — never causes re-renders
  const statesRef = useRef<ModelState[]>([]);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.Camera>(new THREE.Camera());
  const sceneRef = useRef<THREE.Scene | null>(null);
  const lastMapMatrixRef = useRef<THREE.Matrix4 | null>(null);
  const layerAddedRef = useRef(false);

  // Tracks which project IDs have been manually dragged by the user.
  // Their translateX/Y will NOT be overwritten by socket updates.
  const manuallyMovedRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Selected index — only this needs React state (drives HUD render)
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const selectedIdxRef = useRef(-1);
  useEffect(() => { selectedIdxRef.current = selectedIdx; }, [selectedIdx]);

  // ── Step 1: Load GLBs once, build scene once, add layer once ────────────
  useEffect(() => {
    if (!map) return;

    const removeLayer = () => {
      try { if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID); } catch { /* ignore */ }
      layerAddedRef.current = false;
    };

    if (!visible) {
      removeLayer();
      statesRef.current = [];
      return;
    }

    // Collect all unique GLBs across all projects
    const neededGlbs = [...new Set(
      projects.map((p) => {
        const cat = MODEL_CATALOG.find((m) => m.type === (p.modelType ?? "office"));
        return cat?.glb ?? "building.glb";
      })
    )];

    const loader = new GLTFLoader();

    const loadAll = () => Promise.all(
      neededGlbs.map((glb) => new Promise<void>((resolve) => {
        if (gltfCache.current.has(glb)) { resolve(); return; }
        loader.load(
          `/models/${glb}`,
          (gltf) => { gltfCache.current.set(glb, gltf.scene); resolve(); },
          undefined,
          () => resolve() // don't block on error
        );
      }))
    );

    const buildStates = () => {
      const states: ModelState[] = [];
      for (const p of projects) {
        if (!p?.location?.lon || !p?.location?.lat) continue;
        const cat = MODEL_CATALOG.find((m) => m.type === (p.modelType ?? "office"));
        const glb = cat?.glb ?? "building.glb";
        const proto = gltfCache.current.get(glb);
        if (!proto) continue;

        const model = proto.clone(true);
        const mc = maplibregl.MercatorCoordinate.fromLngLat(
          { lng: p.location.lon, lat: p.location.lat }, 0
        );
        const metersPerUnit = mc.meterInMercatorCoordinateUnits();
        const targetHeightM = cat?.scale ?? 60;
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const modelNativeHeight = Math.max(size.x, size.y, size.z, 0.001);

        // Preserve user edits if this project already exists in statesRef
        const existing = statesRef.current.find(s => s.projectId === p.id);
        const manualPos = manuallyMovedRef.current.get(p.id);

        states.push({
          scene: model,
          translateX: manualPos?.x ?? mc.x,
          translateY: manualPos?.y ?? mc.y,
          translateZ: mc.z ?? 0,
          rotateX: Math.PI / 2,
          baseScale: (targetHeightM / modelNativeHeight) * metersPerUnit,
          scaleMultiplier: existing?.scaleMultiplier ?? 1,
          rotateZ: existing?.rotateZ ?? THREE.MathUtils.degToRad(p.rotation ?? 0),
          projectId: p.id,
          projectName: p.name,
          status: p.status,
        });
      }
      return states;
    };

    const setupScene = (states: ModelState[]) => {
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 2.5));
      const sun = new THREE.DirectionalLight(0xfff4e0, 3.0);
      sun.position.set(0, -70, 100).normalize();
      scene.add(sun);
      const sun2 = new THREE.DirectionalLight(0xffffff, 1.5);
      sun2.position.set(0, 70, 100).normalize();
      scene.add(sun2);
      for (const s of states) {
        s.scene.position.set(0, 0, 0);
        s.scene.rotation.set(0, 0, 0);
        s.scene.scale.set(1, 1, 1);
        scene.add(s.scene);
      }
      return scene;
    };

    const addLayer = (scene: THREE.Scene) => {
      if (layerAddedRef.current) return;

      const layer: CustomLayerInterface = {
        id: LAYER_ID,
        type: "custom",
        renderingMode: "3d",

        onAdd(_map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
          const r = new THREE.WebGLRenderer({
            canvas: _map.getCanvas(),
            context: gl as WebGL2RenderingContext,
            antialias: true,
          });
          r.autoClear = false;
          r.outputColorSpace = THREE.SRGBColorSpace;
          rendererRef.current = r;
        },

        render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: any) {
          const renderer = rendererRef.current;
          if (!renderer) return;

          const mainMatrix: number[] = args.defaultProjectionData?.mainMatrix
            ?? args.modelViewProjectionMatrix;
          if (!mainMatrix) return;

          const mapMatrix = new THREE.Matrix4().fromArray(mainMatrix);
          lastMapMatrixRef.current = mapMatrix.clone();

          const states = statesRef.current;
          if (states.length === 0) return;

          const selIdx = selectedIdxRef.current;
          renderer.resetState();

          for (let i = 0; i < states.length; i++) {
            const t = states[i];
            const isSelected = i === selIdx;

            // Update emissive tint (selected = yellow glow, else status color)
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

            // Make only this model visible for this draw call
            // IMPORTANT: restore immediately after — never leave hidden
            for (const other of states) other.scene.visible = false;
            t.scene.visible = true;

            const finalScale = t.baseScale * t.scaleMultiplier;

            // Build local transform:
            // 1. Rotate around model's local Y axis (heading/spin) — BEFORE Y-up fix
            // 2. Apply Y-up → Z-up conversion (rotX = PI/2)
            // 3. Scale (negative Y to flip for Mercator)
            // 4. Translate to Mercator position
            //
            // Matrix multiplication is right-to-left, so we compose:
            // l = T * S * rotX * rotY_heading
            const rotX = new THREE.Matrix4().makeRotationAxis(
              new THREE.Vector3(1, 0, 0), Math.PI / 2
            );
            const rotHeading = new THREE.Matrix4().makeRotationAxis(
              new THREE.Vector3(0, 1, 0), t.rotateZ  // Y axis = vertical in model space
            );

            const l = new THREE.Matrix4()
              .makeTranslation(t.translateX, t.translateY, t.translateZ)
              .scale(new THREE.Vector3(finalScale, -finalScale, finalScale))
              .multiply(rotX)
              .multiply(rotHeading);

            cameraRef.current.projectionMatrix = new THREE.Matrix4()
              .copy(mapMatrix)
              .multiply(l);

            renderer.render(scene, cameraRef.current);

            // Restore immediately
            t.scene.visible = true;
          }

          // Ensure all visible after loop
          for (const t of states) t.scene.visible = true;

          map.triggerRepaint();
        },
      };

      try {
        map.addLayer(layer as any);
        layerAddedRef.current = true;
        map.triggerRepaint();
      } catch { /* layer may already exist */ }
    };

    const init = () => {
      loadAll().then(() => {
        const states = buildStates();
        statesRef.current = states;
        if (states.length === 0) return;
        const scene = setupScene(states);
        sceneRef.current = scene;
        addLayer(scene);
      });
    };

    if (map.isStyleLoaded()) {
      init();
    } else {
      map.once("style.load", init);
    }

    return () => {
      map.off("style.load", init as any);
      // Don't remove the layer here — only remove when visible turns false
      // This prevents the flash on every projects socket update
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, visible]); // ← intentionally NOT in projects dep — see Step 2

  // ── Step 2: Update model states when projects change (no layer rebuild) ──
  useEffect(() => {
    if (!map || !visible || projects.length === 0) return;

    const neededGlbs = [...new Set(
      projects.map((p) => {
        const cat = MODEL_CATALOG.find((m) => m.type === (p.modelType ?? "office"));
        return cat?.glb ?? "building.glb";
      })
    )];

    const loader = new GLTFLoader();

    const loadMissing = () => Promise.all(
      neededGlbs.map((glb) => new Promise<void>((resolve) => {
        if (gltfCache.current.has(glb)) { resolve(); return; }
        loader.load(
          `/models/${glb}`,
          (gltf) => { gltfCache.current.set(glb, gltf.scene); resolve(); },
          undefined,
          () => resolve()
        );
      }))
    );

    loadMissing().then(() => {
      const newStates: ModelState[] = [];

      for (const p of projects) {
        if (!p?.location?.lon || !p?.location?.lat) continue;
        const cat = MODEL_CATALOG.find((m) => m.type === (p.modelType ?? "office"));
        const glb = cat?.glb ?? "building.glb";
        const proto = gltfCache.current.get(glb);
        if (!proto) continue;

        const existing = statesRef.current.find(s => s.projectId === p.id);

        // Reuse existing scene object if project hasn't changed location/type
        let model: THREE.Group;
        if (existing) {
          model = existing.scene;
        } else {
          model = proto.clone(true);
          model.position.set(0, 0, 0);
          model.rotation.set(0, 0, 0);
          model.scale.set(1, 1, 1);
          // Add to scene if scene exists
          if (sceneRef.current) sceneRef.current.add(model);
        }

        const mc = maplibregl.MercatorCoordinate.fromLngLat(
          { lng: p.location.lon, lat: p.location.lat }, 0
        );
        const metersPerUnit = mc.meterInMercatorCoordinateUnits();
        const targetHeightM = cat?.scale ?? 60;
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const modelNativeHeight = Math.max(size.x, size.y, size.z, 0.001);

        // If the user manually dragged this building, keep their position.
        // Otherwise use the backend's lat/lng.
        const manualPos = manuallyMovedRef.current.get(p.id);

        newStates.push({
          scene: model,
          translateX: manualPos?.x ?? mc.x,
          translateY: manualPos?.y ?? mc.y,
          translateZ: mc.z ?? 0,
          rotateX: Math.PI / 2,
          baseScale: (targetHeightM / modelNativeHeight) * metersPerUnit,
          scaleMultiplier: existing?.scaleMultiplier ?? 1,
          rotateZ: existing?.rotateZ ?? THREE.MathUtils.degToRad(p.rotation ?? 0),
          projectId: p.id,
          projectName: p.name,
          status: p.status,
        });
      }

      // Remove models that no longer exist
      if (sceneRef.current) {
        const newIds = new Set(newStates.map(s => s.projectId));
        for (const old of statesRef.current) {
          if (!newIds.has(old.projectId)) {
            sceneRef.current.remove(old.scene);
          }
        }
      }

      statesRef.current = newStates;

      // If layer doesn't exist yet (first load), add it now
      if (!layerAddedRef.current && sceneRef.current && map.isStyleLoaded()) {
        // Re-trigger the layer setup via a style.load-safe path
        map.triggerRepaint();
      }

      map.triggerRepaint();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

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
      let best = -1;
      let bestD2 = HIT_RADIUS_PX * HIT_RADIUS_PX;
      const states = statesRef.current;
      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        const sc = mercatorToScreen(s.translateX, s.translateY, s.translateZ);
        if (!sc) continue;
        const d2 = (sc.x - px) ** 2 + (sc.y - py) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
      return best;
    }

    let isDragging = false;
    let dragLastX = 0;
    // For left-drag repositioning
    let isMoving = false;
    let moveDragLastX = 0;
    let moveDragLastY = 0;
    // True if the mouse actually moved during a drag — used to suppress the
    // click event that fires after mouseup
    let didMove = false;

    // Convert a screen pixel delta (CSS pixels) to a Mercator coordinate delta.
    function screenDeltaToMercator(dxPx: number, dyPx: number) {
      const zoom = map.getZoom();
      // At zoom N, the full mercator world (1 unit) = 512 * 2^N CSS pixels
      const worldPx = 512 * Math.pow(2, zoom);
      return {
        dx:  dxPx / worldPx,
        // Mercator Y=0 is north (top of screen), Y=1 is south (bottom).
        // Mouse moving DOWN (positive dyPx) → building moves south → mercator Y increases.
        dy:  dyPx / worldPx,
      };
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
        // Left-click on selected building → start move drag
        isMoving = true;
        didMove = false;
        moveDragLastX = e.clientX;
        moveDragLastY = e.clientY;
        // Disable map panning while we drag the building
        map.dragPan.disable();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.button === 2 && hit === idx) {
        // Right-click on selected building → start rotate drag
        isDragging = true;
        dragLastX = e.clientX;
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onClick = (e: MouseEvent) => {
      // If we just finished a move drag, suppress this click entirely
      // (didMove stays true from mousemove until we clear it here)
      if (didMove) {
        didMove = false;
        onBuildingClick?.(true); // tell App.tsx to ignore this click too
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
      onBuildingClick?.(hit >= 0);
      if (hit >= 0) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      map.triggerRepaint();
    };

    const onMouseMove = (e: MouseEvent) => {
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
        // Persist the dragged position so socket updates don't reset it
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
      if (e.button === 0 && isMoving) {
        isMoving = false;
        map.dragPan.enable();
      }
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
      const factor = e.deltaY < 0 ? 1.08 : 0.93;
      s.scaleMultiplier = Math.max(0.1, Math.min(20, s.scaleMultiplier * factor));
      map.triggerRepaint();
      e.preventDefault();
      e.stopPropagation();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIdx(-1);
        selectedIdxRef.current = -1;
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
      map.dragPan.enable(); // restore in case we left it disabled
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("click", onClick, true);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [map, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── HUD ───────────────────────────────────────────────────────────────────
  const sel = selectedIdx >= 0 ? statesRef.current[selectedIdx] : null;
  if (!sel) return null;

  return (
    <div style={{
      position: "absolute",
      bottom: 80,
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(10,22,38,0.90)",
      backdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 14,
      padding: "12px 20px",
      display: "flex",
      alignItems: "center",
      gap: 20,
      color: "rgba(255,255,255,0.85)",
      fontSize: 13,
      pointerEvents: "none",
      zIndex: 100,
      boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      whiteSpace: "nowrap",
    }}>
      <span style={{ color: "#ffd666", fontWeight: 700 }}>✦ {sel.projectName}</span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>|</span>
      <span>🖱 Drag → Move</span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>|</span>
      <span>🖱 Right-drag → Rotate</span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>|</span>
      <span>⚙ Scroll → Scale</span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>|</span>
      <span style={{ color: "rgba(255,255,255,0.45)" }}>Esc to deselect</span>
    </div>
  );
}
