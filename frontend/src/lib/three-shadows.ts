/**
 * Real Three.js directional shadow maps for MapLibre custom layers (RTE mercator space).
 * Uses ShadowMaterial catchers — not fake blob discs.
 *
 * Critical: sun light positions from SunCalc are ~length 100, while RTE model
 * scales are ~1e-6 mercator units. Shadow cameras must be re-homed to scene
 * scale or near/far miss the geometry and corrupt the shared MapLibre GL context.
 */

import * as THREE from "three";

/** ShadowMaterial plane in map ground (XY, Z-up). Scale via matrix. */
export function makeShadowCatcher(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShadowMaterial({
    opacity: 0.4,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "shadow-catcher";
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = -1;
  return mesh;
}

/** Enable soft shadow maps on a shared MapLibre WebGLRenderer. */
export function enableRendererShadows(renderer: THREE.WebGLRenderer): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Manual update from the custom layer so MapLibre frames stay in control
  renderer.shadowMap.autoUpdate = true;
}

export type SunShadowOpts = {
  /** Ortho half-extent in world (RTE mercator) units. */
  frustumHalfExtent?: number;
  mapSize?: number;
  bias?: number;
  normalBias?: number;
  enabled?: boolean;
};

/**
 * Configure a DirectionalLight to cast shadows in RTE space (target at origin).
 * Repositions the light along its current direction to match scene scale.
 */
export function configureSunShadow(
  light: THREE.DirectionalLight,
  opts: SunShadowOpts = {},
): void {
  const enabled = opts.enabled !== false;
  light.castShadow = enabled;
  if (!enabled) return;

  const half = Math.max(1e-6, opts.frustumHalfExtent ?? 0.00035);

  // Preserve direction; place light at a distance the ortho near/far can cover
  const dir = light.position.clone();
  if (dir.lengthSq() < 1e-12) dir.set(0.2, -0.5, 0.8);
  dir.normalize();
  const dist = Math.max(half * 6, 1e-5);
  light.position.copy(dir).multiplyScalar(dist);

  const cam = light.shadow.camera as THREE.OrthographicCamera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = dist * 0.2;
  cam.far = dist * 3;
  cam.updateProjectionMatrix();

  light.shadow.mapSize.set(opts.mapSize ?? 1024, opts.mapSize ?? 1024);
  // Tiny mercator scales need tiny bias or shadows acne / vanish
  light.shadow.bias = opts.bias ?? -0.0002;
  light.shadow.normalBias = opts.normalBias ?? 0.5;
  light.target.position.set(0, 0, 0);
  if (!light.target.parent && light.parent) {
    light.parent.add(light.target);
  }
  light.target.updateMatrixWorld();
  light.shadow.camera.updateMatrixWorld();
}

/**
 * Place a unit XY catcher under a model in RTE space.
 * footprintM / stretch are in meters; metersPerUnit converts to mercator.
 */
export function placeShadowCatcher(
  catcher: THREE.Mesh,
  dx: number,
  dy: number,
  dz: number,
  footprintM: number,
  metersPerUnit: number,
  stretch: number,
  yawRad: number,
): void {
  const base = Math.max(4, footprintM) * metersPerUnit;
  const sx = base * Math.max(1, Math.min(2.8, stretch));
  const sy = base * 0.85;
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  const sz = metersPerUnit * 0.05;
  // Column-major: scale then rotate in XY, sit slightly above ground
  catcher.matrix.fromArray([
    c * sx, s * sx, 0, 0,
    -s * sy, c * sy, 0, 0,
    0, 0, sz, 0,
    dx, dy, dz + metersPerUnit * 0.02, 1,
  ]);
  catcher.matrixAutoUpdate = false;
  catcher.visible = stretch > 0.05;
  catcher.frustumCulled = false;
}

/** Mark all meshes under root as shadow casters; disable frustum cull (MVP-in-projection). */
export function setCastShadowDeep(root: THREE.Object3D, cast: boolean): void {
  root.frustumCulled = false;
  root.traverse((obj) => {
    obj.frustumCulled = false;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = cast;
    mesh.receiveShadow = false;
  });
}
