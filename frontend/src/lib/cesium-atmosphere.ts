/**
 * Procedural atmospheric sky for Cesium (Nishita-style scattering).
 *
 * Orange haze at golden hour comes from Mie bloom + warmer Rayleigh (more R, less B),
 * not large hueShift (that turns the dome magenta).
 */

import * as Cesium from "cesium";

export type AtmosphereOpts = {
  isDay?: boolean;
  solarHour?: number;
  sunAltitudeRad?: number;
  /** Dim this imagery layer at night (satellite / aerial). */
  satelliteLayer?: Cesium.ImageryLayer | null;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

type OwnedSkyBox = Cesium.SkyBox & { __infatrackUnlitSkyBox?: boolean };

function clearTexturedSkyBox(scene: Cesium.Scene): void {
  const box = scene.skyBox as OwnedSkyBox | undefined;
  if (!box) return;

  if (box.__infatrackUnlitSkyBox) {
    try {
      box.destroy();
    } catch {
      /* already destroyed */
    }
    scene.skyBox = undefined;
    return;
  }

  box.show = false;
}

function atmosphereGrades(opts: AtmosphereOpts): {
  dayFactor: number;
  sunsetWarmth: number;
  nightFactor: number;
} {
  let altDeg: number;
  if (typeof opts.sunAltitudeRad === "number" && Number.isFinite(opts.sunAltitudeRad)) {
    altDeg = (opts.sunAltitudeRad * 180) / Math.PI;
  } else if (typeof opts.solarHour === "number" && Number.isFinite(opts.solarHour)) {
    const h = ((opts.solarHour % 24) + 24) % 24;
    const noonDist = Math.abs(h - 12);
    altDeg = lerp(65, -18, clamp01(noonDist / 8));
  } else {
    altDeg = opts.isDay === false ? -12 : 35;
  }

  // Stay dark through night and early dawn; full day only once the sun is up.
  const dayFactor = smoothstep(-4, 16, altDeg);
  // Wide golden-hour window so orange haze reads clearly before sundown.
  const sunsetWarmth =
    smoothstep(26, 4, altDeg) * smoothstep(-10, 2, altDeg);
  const nightFactor = 1 - dayFactor;

  return { dayFactor, sunsetWarmth, nightFactor };
}

/** Cesium defaults (approx). */
const RAYLEIGH_DAY = { r: 5.5e-6, g: 13.0e-6, b: 28.4e-6 };
const MIE_DAY = 21e-6;

/**
 * Apply / refresh procedural sky. Safe to call on every TIME slider tick — no I/O.
 */
export function applyProceduralAtmosphere(
  viewer: Cesium.Viewer,
  opts: AtmosphereOpts = {},
): void {
  if (viewer.isDestroyed()) return;

  const scene = viewer.scene;
  const globe = scene.globe;
  const { dayFactor, sunsetWarmth, nightFactor } = atmosphereGrades(opts);
  const w = sunsetWarmth; // 0..1 orange haze amount

  clearTexturedSkyBox(scene);

  // Warmer Rayleigh: lift R/G, pull B down → amber horizon without hue-wheel magenta.
  const rayR = lerp(RAYLEIGH_DAY.r, 9.5e-6, w);
  const rayG = lerp(RAYLEIGH_DAY.g, 14.5e-6, w);
  const rayB = lerp(RAYLEIGH_DAY.b, 18.0e-6, w);
  // Extra Mie = soft orange haze / sun bloom.
  const mie = MIE_DAY * (1 + w * 2.4);

  globe.enableLighting = false;
  globe.dynamicAtmosphereLighting = false;
  globe.dynamicAtmosphereLightingFromSun = false;
  globe.shadows = Cesium.ShadowMode.RECEIVE_ONLY;
  globe.showGroundAtmosphere = true;
  globe.atmosphereLightIntensity = lerp(0.8, 22, dayFactor) + w * 10;
  globe.atmosphereRayleighCoefficient = new Cesium.Cartesian3(rayR, rayG, rayB);
  globe.atmosphereMieCoefficient = new Cesium.Cartesian3(mie, mie, mie);
  globe.atmosphereMieAnisotropy = lerp(0.9, 0.75, w); // wider haze lobe at dusk
  // Cap hue well below the magenta danger zone (~0.05+).
  globe.atmosphereHueShift = w * 0.03;
  globe.atmosphereSaturationShift = lerp(-0.2, 0, nightFactor) + w * 0.22;
  globe.atmosphereBrightnessShift = lerp(-0.32, 0.02, dayFactor) + w * 0.04;
  if ("nightFadeInDistance" in globe) {
    (globe as Cesium.Globe & { nightFadeInDistance: number }).nightFadeInDistance = 8.0e6;
  }
  if ("nightFadeOutDistance" in globe) {
    (globe as Cesium.Globe & { nightFadeOutDistance: number }).nightFadeOutDistance = 1.6e7;
  }

  if (scene.sun) {
    scene.sun.show = dayFactor > 0.04;
    scene.sun.glowFactor = lerp(2, 6, dayFactor) + w * 8;
  }
  if (scene.moon) scene.moon.show = nightFactor > 0.4;

  if (scene.atmosphere) {
    scene.atmosphere.dynamicLighting = Cesium.DynamicAtmosphereLightingType.SUNLIGHT;
    scene.atmosphere.rayleighCoefficient = new Cesium.Cartesian3(rayR, rayG, rayB);
    scene.atmosphere.mieCoefficient = new Cesium.Cartesian3(mie, mie, mie);
    scene.atmosphere.mieAnisotropy = lerp(0.9, 0.75, w);
    scene.atmosphere.hueShift = w * 0.03;
    scene.atmosphere.saturationShift = lerp(-0.15, 0, nightFactor) + w * 0.2;
    scene.atmosphere.brightnessShift = lerp(-0.28, 0.02, dayFactor) + w * 0.04;
    scene.atmosphere.lightIntensity = lerp(2.2, 16, dayFactor) + w * 10;
  }

  let sky = scene.skyAtmosphere;
  if (!sky) {
    sky = new Cesium.SkyAtmosphere();
    scene.skyAtmosphere = sky;
  }
  sky.show = true;
  sky.perFragmentAtmosphere = true;
  sky.atmosphereRayleighCoefficient = new Cesium.Cartesian3(rayR, rayG, rayB);
  sky.atmosphereMieCoefficient = new Cesium.Cartesian3(mie, mie, mie);
  sky.atmosphereMieAnisotropy = lerp(0.92, 0.72, w);
  sky.atmosphereLightIntensity = lerp(4, 50, dayFactor) + w * 22;
  sky.hueShift = w * 0.03;
  sky.saturationShift = lerp(-0.22, 0, nightFactor) + w * 0.28;
  sky.brightnessShift = lerp(-0.36, 0.03, dayFactor) + w * 0.06;

  const nightBright = lerp(0.38, 1.04, dayFactor);
  const nightSat = lerp(0.5, 1.04, dayFactor);
  const nightGamma = lerp(1.18, 0.96, dayFactor);
  const n = viewer.imageryLayers.length;
  for (let i = 0; i < n; i++) {
    const layer = viewer.imageryLayers.get(i);
    layer.brightness = nightBright;
    layer.saturation = nightSat;
    layer.gamma = nightGamma;
    layer.contrast = lerp(0.96, 1.1, dayFactor);
  }

  // Thicker warm fog at the horizon during golden hour; darker at night.
  if (scene.fog) {
    scene.fog.enabled = true;
    scene.fog.density = lerp(0.0004, 0.00011, dayFactor) + w * 0.00022;
    scene.fog.minimumBrightness = lerp(0.04, 0.22, dayFactor) + w * 0.16;
    if ("visualDensityScalar" in scene.fog) {
      scene.fog.visualDensityScalar = 1 + w * 0.5;
    }
  }
}

export function initProceduralSky(viewer: Cesium.Viewer): void {
  applyProceduralAtmosphere(viewer, {
    isDay: true,
    solarHour: 12,
    sunAltitudeRad: Math.PI / 4,
  });
}
