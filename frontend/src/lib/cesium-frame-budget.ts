/**
 * Frame-time budget so the globe sheds work instead of locking the main thread.
 * When a frame is already late, extra picks / GLB attaches / heatmap paints
 * turn lag into a freeze.
 */

let emaMs = 16.6;
let lastStamp = 0;
let cameraMoving = false;

export function noteSceneFrame() {
  const now = performance.now();
  if (lastStamp > 0) {
    const dt = Math.min(250, now - lastStamp);
    emaMs = emaMs * 0.82 + dt * 0.18;
  }
  lastStamp = now;
}

export function sceneFrameEmaMs(): number {
  return emaMs;
}

/** ~30 fps or worse — skip cosmetics. */
export function sceneIsLagging(): boolean {
  return emaMs > 32;
}

/** ~20 fps or worse — skip streaming and extra scene.pick. */
export function sceneIsStalling(): boolean {
  return emaMs > 50;
}

export function setSceneCameraMoving(moving: boolean) {
  cameraMoving = moving;
}

export function sceneCameraMoving(): boolean {
  return cameraMoving;
}

/** Suggested Viewer.targetFrameRate, or 0 for uncapped. */
export function sceneTargetFrameRate(): number {
  if (emaMs > 50) return 28;
  if (emaMs > 32) return 40;
  return 0;
}
