/**
 * Solar utilities — real astronomy via suncalc + radiation viz helpers.
 * Sun position is geographic (Luisiana lat/lon) + local clock time.
 */

import * as SunCalc from "suncalc";

export type SolarDataPoint = {
  position: [number, number]; // [lon, lat]
  intensity: number; // 0-1 normalized solar radiation
  elevation: number; // height in meters for 3D visualization
};

export type SunPosition = {
  /** Radians above horizon (negative = night). */
  altitudeRad: number;
  /**
   * Internal azimuth radians in the classic SunCalc v1 convention:
   * from south, westward positive (0 = south, π/2 = west).
   * Prefer bearingDegFromSunCalcAzimuth() for compass UI (0 = N).
   */
  azimuthRad: number;
  isDaylight: boolean;
};

export const LUISIANA_CENTER = {
  lat: 14.19,
  lon: 121.51,
} as const;

const LUISIANA_BOUNDS = {
  west: 121.44,
  south: 14.12,
  east: 121.58,
  north: 14.27,
};

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEG2RAD = Math.PI / 180;

/** Inverse: compass bearing → legacy south-based azimuth radians. */
export function sunCalcAzimuthFromBearingDeg(bearingDeg: number): number {
  const b = ((bearingDeg % 360) + 360) % 360;
  return ((b - 180) * Math.PI) / 180;
}

/**
 * Compass bearing of the sun: 0° = North, 90° = East, clockwise.
 * From internal legacy azimuth radians (south-based).
 */
export function bearingDegFromSunCalcAzimuth(azimuthRad: number): number {
  return (((azimuthRad * 180) / Math.PI) + 180 + 360) % 360;
}

/** Current fractional hour in Asia/Manila (UTC+8). */
export function getCurrentSolarHour(): number {
  const now = new Date();
  const ph = new Date(now.getTime() + PH_OFFSET_MS);
  return ph.getUTCHours() + ph.getUTCMinutes() / 60 + ph.getUTCSeconds() / 3600;
}

/**
 * Build a Date whose Asia/Manila wall-clock matches `hourFractional` (0–24)
 * on the same calendar day as `baseDate` (or today).
 */
export function dateFromSolarHour(hourFractional: number, baseDate?: Date): Date {
  const now = baseDate ?? new Date();
  const ph = new Date(now.getTime() + PH_OFFSET_MS);
  const y = ph.getUTCFullYear();
  const m = ph.getUTCMonth();
  const d = ph.getUTCDate();
  const h = ((hourFractional % 24) + 24) % 24;
  const hour = Math.floor(h);
  const mins = (h - hour) * 60;
  const minute = Math.floor(mins);
  const second = Math.floor((mins - minute) * 60);
  // Construct as UTC components that represent PH local, then subtract offset
  const asUtcLabel = Date.UTC(y, m, d, hour, minute, second);
  return new Date(asUtcLabel - PH_OFFSET_MS);
}

/**
 * TIME-slider hour when the sun should meet the horizon (before 6:00 PM).
 * Real Luisiana sunset is ~6:15–6:20 PM; we compress the afternoon so
 * golden hour + sundown land on the slider before 6.
 */
export const DISPLAY_SUNSET_HOUR = 17.75; // 5:45 PM

function phFractionalHour(date: Date): number {
  const ph = new Date(date.getTime() + PH_OFFSET_MS);
  return ph.getUTCHours() + ph.getUTCMinutes() / 60 + ph.getUTCSeconds() / 3600;
}

/**
 * Map TIME-slider hour → astronomy hour (Luisiana).
 * Morning/noon stay 1:1; afternoon is stretched so display sunset ≈ real sunset.
 */
export function astroHourFromDisplayHour(
  displayHour: number,
  baseDate?: Date,
  lat: number = LUISIANA_CENTER.lat,
  lon: number = LUISIANA_CENTER.lon,
): number {
  const h = ((displayHour % 24) + 24) % 24;
  const noonDate = dateFromSolarHour(12, baseDate);
  const times = SunCalc.getTimes(noonDate, lat, lon);
  const realSunset = phFractionalHour(times.sunset);

  if (h <= 12) return h;

  const displaySpan = DISPLAY_SUNSET_HOUR - 12;
  const realSpan = Math.max(0.5, realSunset - 12);

  if (h <= DISPLAY_SUNSET_HOUR) {
    const t = (h - 12) / displaySpan;
    return 12 + t * realSpan;
  }

  // Past display sunset: continue into night 1:1 past real sunset.
  return realSunset + (h - DISPLAY_SUNSET_HOUR);
}

/** Date used for sky / sun / shadows from the TIME slider (early dusk remapped). */
export function dateFromDisplaySolarHour(
  displayHour: number,
  baseDate?: Date,
): Date {
  return dateFromSolarHour(astroHourFromDisplayHour(displayHour, baseDate), baseDate);
}

/**
 * Astronomical sun position for a place and instant.
 * SunCalc v2 returns altitude/azimuth in **degrees** (azimuth clockwise from north).
 * We normalize to radians + legacy south-based azimuth for the rest of the app.
 */
export function getSunPosition(lat: number, lon: number, date: Date): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lon);
  const altitudeRad = pos.altitude * DEG2RAD;
  const bearingDeg = ((pos.azimuth % 360) + 360) % 360;
  return {
    altitudeRad,
    azimuthRad: sunCalcAzimuthFromBearingDeg(bearingDeg),
    isDaylight: pos.altitude > 0,
  };
}

/**
 * Unit direction FROM ground TOWARD the sun in MapLibre / Three custom-layer space:
 *   +x = east, +y = south, +z = up
 *
 * suncalc azimuth is from south, westward positive:
 *   east  component = -sin(azimuth)
 *   south component =  cos(azimuth)
 *   up    component =  sin(altitude)
 */
export function sunDirectionFromPosition(pos: SunPosition): [number, number, number] {
  const { altitudeRad, azimuthRad } = pos;
  const cosAlt = Math.cos(altitudeRad);
  const x = -Math.sin(azimuthRad) * cosAlt; // east
  const y = Math.cos(azimuthRad) * cosAlt; // south
  const z = Math.sin(altitudeRad); // up
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/** Sun position with altitude from astronomy and horizontal bearing from the dial. */
export function sunPositionWithBearing(altitudeRad: number, bearingDeg: number): SunPosition {
  return {
    altitudeRad,
    azimuthRad: sunCalcAzimuthFromBearingDeg(bearingDeg),
    isDaylight: altitudeRad > 0,
  };
}

/**
 * ENU unit vector toward the sun (east, north, up) from altitude + compass bearing.
 * Used for Cesium DirectionalLight via eastNorthUpToFixedFrame.
 */
export function sunEnuFromAltitudeBearing(
  altitudeRad: number,
  bearingDeg: number,
): { east: number; north: number; up: number } {
  const bearingRad = ((bearingDeg % 360) + 360) % 360 * (Math.PI / 180);
  const cosAlt = Math.cos(altitudeRad);
  const east = Math.sin(bearingRad) * cosAlt;
  const north = Math.cos(bearingRad) * cosAlt;
  const up = Math.sin(altitudeRad);
  const len = Math.hypot(east, north, up) || 1;
  return { east: east / len, north: north / len, up: up / len };
}

/**
 * Light position vector for DirectionalLight (same axes, scaled).
 * Below horizon: keep a low northern glow so night isn’t pure black.
 */
export function getSunLightPosition(
  lat: number,
  lon: number,
  hour: number,
  baseDate?: Date,
): [number, number, number] {
  const date = dateFromSolarHour(hour, baseDate);
  const pos = getSunPosition(lat, lon, date);
  const [dx, dy, dz] = sunDirectionFromPosition(pos);
  if (!pos.isDaylight) {
    // Dim moon-side fill above the horizon line
    return [dx * 40, dy * 40, Math.max(8, Math.abs(dz) * 20)];
  }
  const scale = 100;
  return [dx * scale, dy * scale, Math.max(12, dz * scale)];
}

/** Shadow stretch factor: ~1 at noon zenith, longer near sunrise/sunset. */
export function shadowStretchFromAltitude(altitudeRad: number): number {
  if (altitudeRad <= 0.02) return 0; // night / just below horizon
  const s = Math.sin(altitudeRad);
  return Math.min(3.5, 1 / Math.max(0.18, s));
}

/**
 * Ground-plane offset direction for contact shadows (away from sun).
 * Returns unit [east, south] or null at night.
 */
export function shadowGroundOffset(pos: SunPosition): [number, number] | null {
  if (pos.altitudeRad <= 0.02) return null;
  const [dx, dy] = sunDirectionFromPosition(pos);
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [0, 0];
  // Shadow falls opposite the sun's ground projection
  return [-dx / len, -dy / len];
}

/** Display solar hour as 12-hour clock with seconds and AM/PM (e.g. 2:30:08 PM). */
export function formatSolarHour(hour: number): string {
  const h24 = ((hour % 24) + 24) % 24;
  const hh24 = Math.floor(h24);
  const mins = (h24 - hh24) * 60;
  const mm = Math.floor(mins);
  const ss = Math.floor((mins - mm) * 60);
  const period = hh24 >= 12 ? "PM" : "AM";
  const hh12 = hh24 % 12 === 0 ? 12 : hh24 % 12;
  return `${hh12}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")} ${period}`;
}

export const SUN_NIGHT_VEIL_SOURCE = "sun-night-veil";
export const SUN_NIGHT_VEIL_LAYER = "sun-night-veil";

/** Cool navy veil over the basemap; 0 at day, ~0.6 at night. */
export function nightVeilOpacity(pos: SunPosition): number {
  const deg = (pos.altitudeRad * 180) / Math.PI;
  if (deg <= 0) return 0.6;
  if (deg >= 12) return 0;
  return 0.6 * (1 - deg / 12);
}

/** Scale for satellite/street rasters: 1 by day, ~0.35 at night. */
export function daylightRasterScale(pos: SunPosition): number {
  const deg = (pos.altitudeRad * 180) / Math.PI;
  if (deg <= 0) return 0.35;
  if (deg >= 12) return 1;
  return 0.35 + 0.65 * (deg / 12);
}

/**
 * MapLibre light + hillshade angles from sun position.
 * Light position: [radial, azimuthal° clockwise from north, polar° from zenith].
 */
export function mapLightFromSun(pos: SunPosition): {
  azimuthDeg: number;
  polarDeg: number;
  altitudeDeg: number;
  light: {
    anchor: "map";
    color: string;
    intensity: number;
    position: [number, number, number];
  };
  hillshadeExaggeration: number;
} {
  const altitudeDeg = (pos.altitudeRad * 180) / Math.PI;
  const azimuthDeg =
    (((pos.azimuthRad * 180) / Math.PI) + 180 + 360) % 360;
  // Polar: 0 = overhead, 90 = horizon (MapLibre light)
  const polarDeg = pos.isDaylight
    ? Math.max(5, Math.min(90, 90 - altitudeDeg))
    : 88;

  const intensity = pos.isDaylight
    ? Math.max(0.28, Math.min(0.7, 0.25 + Math.sin(pos.altitudeRad) * 0.5))
    : 0.06;

  return {
    azimuthDeg,
    polarDeg,
    altitudeDeg,
    light: {
      anchor: "map",
      color: pos.isDaylight ? "#fff2d6" : "#3a4560",
      intensity,
      position: [1.4, azimuthDeg, polarDeg],
    },
    hillshadeExaggeration: pos.isDaylight
      ? Math.max(0.25, Math.min(0.85, 0.35 + Math.sin(pos.altitudeRad) * 0.45))
      : 0.08,
  };
}

type SunMap = {
  setLight?: (l: any) => void;
  getLayer: (id: string) => unknown;
  getSource?: (id: string) => unknown;
  addSource?: (id: string, src: any) => void;
  addLayer?: (layer: any, beforeId?: string) => void;
  moveLayer?: (id: string, beforeId?: string) => void;
  setPaintProperty: (id: string, prop: string, v: any) => void;
  setLayoutProperty?: (id: string, prop: string, v: any) => void;
};

/** Ensure world-covering night veil exists (above rasters, below 3d-buildings). */
export function ensureNightVeilLayer(
  map: SunMap,
  beforeId?: string,
): void {
  if (!map.addSource || !map.addLayer) return;
  if (!map.getSource?.(SUN_NIGHT_VEIL_SOURCE)) {
    map.addSource(SUN_NIGHT_VEIL_SOURCE, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85],
          ]],
        },
      },
    });
  }
  if (!map.getLayer(SUN_NIGHT_VEIL_LAYER)) {
    const layer = {
      id: SUN_NIGHT_VEIL_LAYER,
      type: "fill",
      source: SUN_NIGHT_VEIL_SOURCE,
      paint: {
        "fill-color": "#070b16",
        "fill-opacity": 0,
      },
    };
    try {
      if (beforeId && map.getLayer(beforeId)) map.addLayer(layer, beforeId);
      else map.addLayer(layer);
    } catch {
      try {
        map.addLayer(layer);
      } catch {
        /* ignore */
      }
    }
  }
  // Keep veil above rasters/hillshade even if those layers were added later
  if (map.moveLayer && map.getLayer(SUN_NIGHT_VEIL_LAYER)) {
    try {
      if (beforeId && map.getLayer(beforeId)) map.moveLayer(SUN_NIGHT_VEIL_LAYER, beforeId);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Apply sun to the basemap: light, hillshade, night veil, raster dimming.
 * Call whenever solar hour changes (and after style load).
 */
export function applyMapSunLighting(
  map: SunMap,
  pos: SunPosition,
  opts?: {
    showHillshade?: boolean;
    beforeVeilId?: string;
    /** When true, satellite-layer opacity uses daylight scale (caller owns off=0). */
    satelliteOn?: boolean;
    streetMapOn?: boolean;
  },
): void {
  const cfg = mapLightFromSun(pos);
  try {
    map.setLight?.(cfg.light as any);
  } catch {
    /* style may not support light yet */
  }

  ensureNightVeilLayer(map, opts?.beforeVeilId ?? "3d-buildings");
  if (map.getLayer(SUN_NIGHT_VEIL_LAYER)) {
    try {
      map.setPaintProperty(SUN_NIGHT_VEIL_LAYER, "fill-opacity", nightVeilOpacity(pos));
    } catch {
      /* ignore */
    }
  }

  const rasterScale = daylightRasterScale(pos);
  if (opts?.satelliteOn != null && map.getLayer("satellite-layer")) {
    try {
      map.setPaintProperty(
        "satellite-layer",
        "raster-opacity",
        opts.satelliteOn ? rasterScale : 0,
      );
    } catch {
      /* ignore */
    }
  }
  if (opts?.streetMapOn != null && map.getLayer("osm-street-layer")) {
    try {
      map.setPaintProperty(
        "osm-street-layer",
        "raster-opacity",
        opts.streetMapOn ? rasterScale : 0,
      );
    } catch {
      /* ignore */
    }
  }

  if (!map.getLayer("hillshade")) return;
  try {
    map.setPaintProperty("hillshade", "hillshade-illumination-direction", cfg.azimuthDeg);
    map.setPaintProperty("hillshade", "hillshade-illumination-anchor", "map");
    map.setPaintProperty("hillshade", "hillshade-exaggeration", cfg.hillshadeExaggeration);
    map.setPaintProperty(
      "hillshade",
      "hillshade-shadow-color",
      pos.isDaylight ? "rgba(20, 16, 10, 0.75)" : "rgba(4, 8, 18, 0.95)",
    );
    map.setPaintProperty(
      "hillshade",
      "hillshade-highlight-color",
      pos.isDaylight ? "rgba(255, 244, 220, 0.55)" : "rgba(90, 110, 150, 0.18)",
    );
    if (opts?.showHillshade && map.setLayoutProperty) {
      map.setLayoutProperty("hillshade", "visibility", "visible");
    }
  } catch {
    /* ignore */
  }
}

/** @deprecated Prefer getSunLightPosition(lat, lon, hour) */
export function calculateSunPosition(hour: number): [number, number, number] {
  return getSunLightPosition(LUISIANA_CENTER.lat, LUISIANA_CENTER.lon, hour);
}

/**
 * Generate solar radiation data grid for Luisiana (intensity from real altitude).
 */
export function generateSolarGrid(
  resolution: number = 20,
  timeOfDay: number = 12,
): SolarDataPoint[] {
  const points: SolarDataPoint[] = [];
  const date = dateFromSolarHour(timeOfDay);
  const lonStep = (LUISIANA_BOUNDS.east - LUISIANA_BOUNDS.west) / resolution;
  const latStep = (LUISIANA_BOUNDS.north - LUISIANA_BOUNDS.south) / resolution;

  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      const lon = LUISIANA_BOUNDS.west + i * lonStep;
      const lat = LUISIANA_BOUNDS.south + j * latStep;
      const intensity = calculateSolarIntensity(lon, lat, date);
      const elevation = intensity * 2000;
      points.push({ position: [lon, lat], intensity, elevation });
    }
  }
  return points;
}

function calculateSolarIntensity(lon: number, lat: number, date: Date): number {
  const pos = getSunPosition(lat, lon, date);
  const sunAngle = Math.max(0, Math.sin(pos.altitudeRad));
  const spatialVariation =
    Math.sin(lon * 50) * 0.1 +
    Math.cos(lat * 50) * 0.1 +
    Math.sin((lon + lat) * 30) * 0.05;
  return Math.max(0, Math.min(1, sunAngle * (0.85 + spatialVariation)));
}

export function getSolarColor(intensity: number): [number, number, number, number] {
  const r = 255;
  const g = Math.floor(255 - intensity * 155);
  const b = Math.floor(100 - intensity * 100);
  const a = Math.floor(120 + intensity * 135);
  return [r, g, b, a];
}
