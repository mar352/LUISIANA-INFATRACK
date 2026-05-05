/**
 * BuildingOverlay — renders GLB models on the MapLibre map using Three.js.
 *
 * Follows the official MapLibre + Three.js example exactly:
 * https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs
 *
 * Key insight: camera.projectionMatrix = mapMatrix * modelLocalMatrix
 * Each model gets its own camera.projectionMatrix = m.multiply(l) call.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, CustomLayerInterface } from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Project } from "../types";
import { MODEL_CATALOG } from "../types";

const LAYER_ID = "glb-buildings";

function statusColor(status: Project["status"]): THREE.Color {
  if (status === "Completed") return new THREE.Color(0x3d7fd5);
  if (status === "Ongoing")   return new THREE.Color(0xf5a623);
  return new THREE.Color(0x888899);
}

type Props = {
  map: MapLibreMap | null;
  projects: Project[];
  visible: boolean;
};

export function BuildingOverlay({ map, projects, visible }: Props) {
  const gltfCache = useRef<Map<string, THREE.Group>>(new Map());

  useEffect(() => {
    if (!map) return;

    const removeLayer = () => {
      try { if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID); } catch { /* ignore */ }
    };

    if (!visible || projects.length === 0) {
      removeLayer();
      return;
    }

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
          (err) => { console.warn(`[BuildingOverlay] Failed to load ${glb}:`, err); resolve(); }
        );
      }))
    );

    const buildLayer = () => {
      removeLayer();

      // Pre-compute the modelTransform for each project (same pattern as official example)
      type ModelTransform = {
        scene: THREE.Group;
        translateX: number;
        translateY: number;
        translateZ: number;
        rotateX: number; // PI/2 to convert Y-up GLB to Z-up map
        rotateY: number;
        rotateZ: number;
        scale: number;
      };

      const transforms: ModelTransform[] = [];

      for (const p of projects) {
        if (!p?.location?.lon || !p?.location?.lat) continue;

        const cat = MODEL_CATALOG.find((m) => m.type === (p.modelType ?? "office"));
        const glb = cat?.glb ?? "building.glb";
        const proto = gltfCache.current.get(glb);
        if (!proto) continue;

        const model = proto.clone(true);

        // Apply status tint
        const tint = statusColor(p.status);
        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((mat) => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                mat.emissive.copy(tint);
                mat.emissiveIntensity = 0.4;
              }
            });
          }
        });

        // Project lat/lng to Mercator coordinate (same as official example)
        const mc = maplibregl.MercatorCoordinate.fromLngLat(
          { lng: p.location.lon, lat: p.location.lat },
          0
        );

        // Scale: 1 meter in mercator units at this latitude
        const metersPerUnit = mc.meterInMercatorCoordinateUnits();
        const targetHeightM = cat?.scale ?? 60;

        // Get the model's native bounding box height
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const modelNativeHeight = Math.max(size.x, size.y, size.z, 0.001);

        transforms.push({
          scene: model,
          translateX: mc.x,
          translateY: mc.y,
          translateZ: mc.z ?? 0,
          rotateX: Math.PI / 2, // GLB is Y-up, map is Z-up
          rotateY: 0,
          rotateZ: THREE.MathUtils.degToRad(p.rotation ?? 0),
          scale: (targetHeightM / modelNativeHeight) * metersPerUnit,
        });
      }

      if (transforms.length === 0) return;

      // One scene, one camera — render each model separately with its own matrix
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 2.5));
      const sun = new THREE.DirectionalLight(0xfff4e0, 3.0);
      sun.position.set(0, -70, 100).normalize();
      scene.add(sun);
      const sun2 = new THREE.DirectionalLight(0xffffff, 1.5);
      sun2.position.set(0, 70, 100).normalize();
      scene.add(sun2);

      // Add all models to the scene at origin — we'll move them via camera matrix
      for (const t of transforms) {
        t.scene.position.set(0, 0, 0);
        t.scene.rotation.set(0, 0, 0);
        t.scene.scale.set(1, 1, 1);
        scene.add(t.scene);
      }

      let renderer: THREE.WebGLRenderer | null = null;
      const camera = new THREE.Camera();

      const layer: CustomLayerInterface = {
        id: LAYER_ID,
        type: "custom",
        renderingMode: "3d",

        onAdd(_map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
          renderer = new THREE.WebGLRenderer({
            canvas: _map.getCanvas(),
            context: gl as WebGL2RenderingContext,
            antialias: true,
          });
          renderer.autoClear = false;
          renderer.outputColorSpace = THREE.SRGBColorSpace;
        },

        render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: any) {
          if (!renderer) return;

          const mainMatrix: number[] = args.defaultProjectionData?.mainMatrix
            ?? args.modelViewProjectionMatrix;
          if (!mainMatrix) return;

          // Map's current projection matrix
          const mapMatrix = new THREE.Matrix4().fromArray(mainMatrix);

          renderer.resetState();

          // Render each model individually with its own combined camera matrix
          // (exactly like the official example: camera.projectionMatrix = m.multiply(l))
          for (const t of transforms) {
            // Hide all models, show only this one
            for (const other of transforms) other.scene.visible = false;
            t.scene.visible = true;

            // Build this model's local transform matrix
            const rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), t.rotateX);
            const rotY = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), t.rotateY);
            const rotZ = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), t.rotateZ);

            const l = new THREE.Matrix4()
              .makeTranslation(t.translateX, t.translateY, t.translateZ)
              .scale(new THREE.Vector3(t.scale, -t.scale, t.scale))
              .multiply(rotX)
              .multiply(rotY)
              .multiply(rotZ);

            // Combined: map projection * model local transform
            camera.projectionMatrix = new THREE.Matrix4()
              .copy(mapMatrix)
              .multiply(l);

            renderer.render(scene, camera);
          }

          // Restore all visible
          for (const t of transforms) t.scene.visible = true;

          map.triggerRepaint();
        },
      };

      map.addLayer(layer as any);
      map.triggerRepaint();
    };

    const setup = () => loadAll().then(buildLayer);

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once("style.load", setup);
    }

    return () => {
      map.off("style.load", setup as any);
      removeLayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, projects, visible]);

  return null;
}
