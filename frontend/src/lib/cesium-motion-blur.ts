/**
 * Camera motion blur for the Luisiana globe.
 *
 * Screen-space streak from heading / pitch / pan. Strength (0–1) scales smear
 * length — a fixed max-blur cap used to erase the slider. Fades out when the
 * camera stops so reports and idle frames stay sharp.
 */

import * as Cesium from "cesium";

export type MotionBlurHandle = {
  destroy: () => void;
  /** Force a sharp frame (PNG / printable map). */
  suppress: () => void;
  /** 0 = off, 1 = longest streak. */
  setStrength: (value: number) => void;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
uniform vec2 u_velocity;
uniform float u_amount;
uniform float u_strength;

void main() {
  vec2 uv = v_textureCoordinates;
  vec4 center = texture(colorTexture, uv);
  float k = u_amount * u_strength;
  if (k < 0.008) {
    out_FragColor = center;
    return;
  }

  vec2 velocity = u_velocity * k;
  float mag = length(velocity);
  if (mag < 0.0002) {
    out_FragColor = center;
    return;
  }
  // Cap scales with the slider so 30% is actually shorter than 100%.
  float maxBlur = 0.004 + 0.044 * u_strength;
  if (mag > maxBlur) {
    velocity *= maxBlur / mag;
  }

  vec4 acc = center * 0.34;
  acc += texture(colorTexture, uv - velocity * 0.22) * 0.22;
  acc += texture(colorTexture, uv - velocity * 0.44) * 0.16;
  acc += texture(colorTexture, uv - velocity * 0.66) * 0.12;
  acc += texture(colorTexture, uv - velocity * 0.88) * 0.08;
  acc += texture(colorTexture, uv + velocity * 0.12) * 0.08;
  out_FragColor = acc;
}
`;

function wrapAngle(delta: number): number {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Attach a post-process stage. Call destroy() when the viewer goes away.
 */
export function attachCesiumMotionBlur(viewer: Cesium.Viewer): MotionBlurHandle {
  const reduced = prefersReducedMotion();

  const screenVelocity = new Cesium.Cartesian2(0, 0);
  let amount = 0;
  let strength = 0.3;
  let suppressUntil = 0;
  let primed = false;
  let lastHeading = viewer.camera.heading;
  let lastPitch = viewer.camera.pitch;
  let lastHeight = viewer.camera.positionCartographic.height;
  let lastLon = viewer.camera.positionCartographic.longitude;
  let lastLat = viewer.camera.positionCartographic.latitude;
  let fadeFrames = 0;
  let destroyed = false;

  const stage = new Cesium.PostProcessStage({
    name: "infatrack-motion-blur",
    fragmentShader: FRAGMENT,
    sampleMode: Cesium.PostProcessStageSampleMode.LINEAR,
    uniforms: {
      u_velocity: () => screenVelocity,
      u_amount: () => amount,
      u_strength: () => strength,
    },
  });
  const media =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  const syncEnabled = () => {
    const off = reduced || Boolean(media?.matches) || strength <= 0.005;
    stage.enabled = !off;
    if (off) amount = 0;
  };

  syncEnabled();
  viewer.scene.postProcessStages.add(stage);

  const onMedia = () => {
    if (destroyed) return;
    syncEnabled();
  };
  media?.addEventListener?.("change", onMedia);

  const onPreRender = () => {
    if (destroyed || viewer.isDestroyed()) return;
    if (media?.matches || strength <= 0.005) {
      amount = 0;
      screenVelocity.x = 0;
      screenVelocity.y = 0;
      return;
    }
    if (Date.now() < suppressUntil) {
      amount = 0;
      screenVelocity.x = 0;
      screenVelocity.y = 0;
      return;
    }

    const cam = viewer.camera;
    const carto = cam.positionCartographic;
    const dHeading = wrapAngle(cam.heading - lastHeading);
    const dPitch = cam.pitch - lastPitch;
    const dLon = carto.longitude - lastLon;
    const dLat = carto.latitude - lastLat;
    const dH = carto.height - lastHeight;
    lastHeading = cam.heading;
    lastPitch = cam.pitch;
    lastLon = carto.longitude;
    lastLat = carto.latitude;
    lastHeight = carto.height;

    if (!primed) {
      primed = true;
      amount = 0;
      return;
    }

    const frustum = cam.frustum as Cesium.PerspectiveFrustum;
    const fovy = frustum.fovy || 1;
    const aspect = Math.max(0.5, frustum.aspectRatio || 1);
    const heightM = Math.max(40, carto.height);
    screenVelocity.x =
      dHeading / (fovy * aspect) + (dLon * 6371000 * Math.cos(carto.latitude)) / (heightM * 4.5);
    screenVelocity.y = dPitch / fovy + (dLat * 6371000) / (heightM * 4.5);

    const rot = Math.hypot(dHeading, dPitch);
    const pan = (Math.hypot(dLon, dLat) * 6371000) / heightM;
    const zoom = Math.abs(dH) / heightM;
    const speed = rot * 2.4 + pan * 1.1 + zoom * 0.8;
    const target = Math.max(0, Math.min(1, (speed - 0.0008) / 0.028));
    if (target > amount) {
      amount = amount * 0.28 + target * 0.72;
    } else {
      amount = amount * 0.62;
    }
    if (amount < 0.004) amount = 0;
    if (amount > 0) fadeFrames = 2;
  };

  const onPostRender = () => {
    if (destroyed || viewer.isDestroyed()) return;
    if (fadeFrames > 0 && amount < 0.004) {
      fadeFrames -= 1;
      viewer.scene.requestRender();
    }
  };

  const onMoveEnd = () => {
    if (destroyed || viewer.isDestroyed()) return;
    fadeFrames = 2;
    viewer.scene.requestRender();
    window.requestAnimationFrame(() => {
      if (!destroyed && !viewer.isDestroyed()) viewer.scene.requestRender();
    });
  };

  const removePre = viewer.scene.preRender.addEventListener(onPreRender);
  const removePost = viewer.scene.postRender.addEventListener(onPostRender);
  const removeMoveEnd = viewer.camera.moveEnd.addEventListener(onMoveEnd);

  return {
    setStrength(value: number) {
      const next = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.3;
      strength = next;
      syncEnabled();
      if (!viewer.isDestroyed()) viewer.scene.requestRender();
    },
    suppress() {
      suppressUntil = Date.now() + 400;
      amount = 0;
      screenVelocity.x = 0;
      screenVelocity.y = 0;
      if (!viewer.isDestroyed()) viewer.scene.requestRender();
    },
    destroy() {
      destroyed = true;
      media?.removeEventListener?.("change", onMedia);
      try {
        if (typeof removePre === "function") removePre();
      } catch {
        /* ignore */
      }
      try {
        if (typeof removePost === "function") removePost();
      } catch {
        /* ignore */
      }
      try {
        if (typeof removeMoveEnd === "function") removeMoveEnd();
      } catch {
        /* ignore */
      }
      try {
        if (!viewer.isDestroyed()) {
          viewer.scene.postProcessStages.remove(stage);
        }
      } catch {
        /* ignore */
      }
    },
  };
}
