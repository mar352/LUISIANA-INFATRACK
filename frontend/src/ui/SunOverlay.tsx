/**
 * SunOverlay — 3D sun disc + ring in a MapLibre custom layer (Shadowmap-style).
 * Position comes from SunCalc direction (+x east, +y south, +z up).
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, CustomLayerInterface } from "maplibre-gl";
import * as THREE from "three";

const LAYER_ID = "glb-sun";

type Props = {
  map: MapLibreMap | null;
  /** Unit or scaled sun vector toward the sun (east, south, up). */
  sunLightPosition: [number, number, number];
  isDaylight: boolean;
  visible?: boolean;
};

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

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Build a glowing disc + torus ring facing the camera (billboarded each frame). */
function createSunMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = "sun-ring";

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  disc.renderOrder = 10;

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  glow.renderOrder = 9;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 1.45, 64),
    new THREE.MeshBasicMaterial({
      color: 0xfff6d0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  ring.renderOrder = 11;

  // Outer soft halo
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 2.4, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  halo.renderOrder = 8;

  group.add(halo);
  group.add(glow);
  group.add(disc);
  group.add(ring);
  group.frustumCulled = false;
  group.matrixAutoUpdate = false;
  return group;
}

/**
 * Place the sun on a sky sphere around the camera along the solar direction.
 * Distance in meters scales slightly with zoom so angular size stays readable.
 */
function sunSkyOffsetMeters(zoom: number): number {
  // Far enough to sit in “sky”, close enough to stay crisp
  if (zoom >= 16) return 1800;
  if (zoom >= 14) return 3200;
  if (zoom >= 12) return 5500;
  return 9000;
}

function sunAngularRadiusMeters(zoom: number): number {
  // Apparent size ~ constant on screen
  if (zoom >= 16) return 55;
  if (zoom >= 14) return 90;
  if (zoom >= 12) return 140;
  return 220;
}

export function SunOverlay({
  map,
  sunLightPosition,
  isDaylight,
  visible = true,
}: Props) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera>(new THREE.Camera());
  const sunGroupRef = useRef<THREE.Group | null>(null);
  const layerAddedRef = useRef(false);
  const sunDirRef = useRef(normalize3(sunLightPosition));
  const dayRef = useRef(isDaylight);
  const _vp64 = useRef(new Float64Array(16));
  const _camT64 = useRef(new Float64Array(16));
  const _vpCentered = useRef(new Float64Array(16));
  const _model64 = useRef(new Float64Array(16));
  const _result64 = useRef(new Float64Array(16));

  useEffect(() => {
    sunDirRef.current = normalize3(sunLightPosition);
    map?.triggerRepaint();
  }, [sunLightPosition, map]);

  useEffect(() => {
    dayRef.current = isDaylight;
    if (sunGroupRef.current) sunGroupRef.current.visible = isDaylight;
    map?.triggerRepaint();
  }, [isDaylight, map]);

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

    const disposeAll = () => {
      removeLayer();
      if (sunGroupRef.current) {
        sunGroupRef.current.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry?.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        });
        sunGroupRef.current = null;
      }
      sceneRef.current = null;
      rendererRef.current = null;
    };

    if (!visible) {
      disposeAll();
      return;
    }

    const createSceneAndLayer = () => {
      if (layerAddedRef.current) return;

      const scene = new THREE.Scene();
      const sun = createSunMesh();
      sun.visible = dayRef.current;
      scene.add(sun);
      sunGroupRef.current = sun;
      sceneRef.current = scene;

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
          rendererRef.current = r;
        },

        render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: any) {
          const renderer = rendererRef.current;
          const scene = sceneRef.current;
          const sun = sunGroupRef.current;
          if (!renderer || !scene || !sun) return;
          if (!dayRef.current) return;

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

          const zoom = map.getZoom();
          const mpu = camMerc.meterInMercatorCoordinateUnits();
          const distM = sunSkyOffsetMeters(zoom);
          const radiusM = sunAngularRadiusMeters(zoom);
          const [dx, dy, dz] = sunDirRef.current;

          // Relative-to-eye: sun sits along solar direction from camera
          const ox = dx * distM * mpu;
          const oy = dy * distM * mpu;
          const oz = dz * distM * mpu;
          const scale = radiusM * mpu;

          // Billboard: face the camera (look from sun toward camera origin in RTE)
          // Build basis: Z toward camera (−sun offset), Y ≈ world up projected
          const fx = -ox;
          const fy = -oy;
          const fz = -oz;
          const fl = Math.hypot(fx, fy, fz) || 1;
          const zx = fx / fl;
          const zy = fy / fl;
          const zz = fz / fl;
          // world up in map space
          let ux = 0;
          let uy = 0;
          let uz = 1;
          // right = up × forward
          let rx = uy * zz - uz * zy;
          let ry = uz * zx - ux * zz;
          let rz = ux * zy - uy * zx;
          let rl = Math.hypot(rx, ry, rz);
          if (rl < 1e-6) {
            ux = 1;
            uy = 0;
            uz = 0;
            rx = uy * zz - uz * zy;
            ry = uz * zx - ux * zz;
            rz = ux * zy - uy * zx;
            rl = Math.hypot(rx, ry, rz) || 1;
          }
          rx /= rl;
          ry /= rl;
          rz /= rl;
          // true up = forward × right
          const tx = zy * rz - zz * ry;
          const ty = zz * rx - zx * rz;
          const tz = zx * ry - zy * rx;

          // Column-major: axes * scale, translation
          const s = scale;
          _model64.current[0] = rx * s;
          _model64.current[1] = ry * s;
          _model64.current[2] = rz * s;
          _model64.current[3] = 0;
          _model64.current[4] = tx * s;
          _model64.current[5] = ty * s;
          _model64.current[6] = tz * s;
          _model64.current[7] = 0;
          _model64.current[8] = zx * s;
          _model64.current[9] = zy * s;
          _model64.current[10] = zz * s;
          _model64.current[11] = 0;
          _model64.current[12] = ox;
          _model64.current[13] = oy;
          _model64.current[14] = oz;
          _model64.current[15] = 1;

          mulMat4Float64(_vpCentered.current, _model64.current, _result64.current);

          const camera = cameraRef.current;
          camera.matrixAutoUpdate = false;
          camera.projectionMatrix.fromArray(_result64.current as unknown as number[]);
          camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

          sun.matrix.identity();
          sun.updateMatrixWorld(true);

          renderer.resetState();
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

    if (map.isStyleLoaded()) createSceneAndLayer();
    else map.once("style.load", createSceneAndLayer);

    const onStyleLoad = () => {
      layerAddedRef.current = false;
      createSceneAndLayer();
    };
    map.on("style.load", onStyleLoad);

    return () => {
      map.off("style.load", onStyleLoad);
      disposeAll();
    };
  }, [map, visible]);

  return null;
}
