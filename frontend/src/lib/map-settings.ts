/**
 * Cesium map performance / view settings (Layers → Map Settings).
 */

export type TerrainQuality = "low" | "medium" | "high";

export type ShadowQuality = "low" | "medium" | "high";

export type TargetFps = 30 | 60;

export type MapSettings = {
  /** Local 3D camera far plane (km). */
  drawDistanceKm: number;
  /** Terrain mesh detail — low is smoothest. */
  terrainQuality: TerrainQuality;
  /** Cast/receive shadows when daylight. */
  shadowsEnabled: boolean;
  /** Shadow map distance / resolution preset. */
  shadowQuality: ShadowQuality;
  /** Horizon fog in tilted 3D (also drops far tile detail). */
  fogEnabled: boolean;
  /**
   * Camera motion-blur strength while panning (0 = off, 100 = current max).
   * Default is a light streak — the original pass read as too strong.
   */
  motionBlur: number;
  /** Target frame rate cap (60 fps for smooth vsync, 30 fps for power saving). */
  targetFps?: TargetFps;
  /** Show floating 3D labels / badges above models on the map. */
  showFloatingLabels?: boolean;
  /** Show GPS coordinates inside the floating 3D badges. */
  showCoordinates?: boolean;
};

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  drawDistanceKm: 18,
  terrainQuality: "medium",
  shadowsEnabled: true,
  shadowQuality: "medium",
  fogEnabled: true,
  motionBlur: 30,
  targetFps: 60,
  showFloatingLabels: true,
  showCoordinates: true,
};

const STORAGE_KEY = "infatrack-map-settings-v1";

/** Screen-space error: higher = fewer tiles / faster. */
export function terrainQualityToSse(q: TerrainQuality): number {
  if (q === "low") return 12;
  if (q === "high") return 6;
  return 9;
}

/** Cesium shadowMap knobs for Low / Medium / High. */
export function shadowQualityToShadowMap(q: ShadowQuality): {
  maximumDistance: number;
  size: number;
  softShadows: boolean;
} {
  if (q === "low") {
    return { maximumDistance: 700, size: 512, softShadows: false };
  }
  if (q === "high") {
    return { maximumDistance: 2200, size: 2048, softShadows: true };
  }
  // medium — soft PCF, municipal range only (see CesiumMap camera gate)
  return { maximumDistance: 1600, size: 1024, softShadows: true };
}

function parseQuality<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function loadMapSettings(): MapSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MAP_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<MapSettings>;
    const draw = Number(parsed.drawDistanceKm);
    const blur = Number(parsed.motionBlur);
    const qualities = ["low", "medium", "high"] as const;
    return {
      drawDistanceKm: Number.isFinite(draw)
        ? Math.min(50, Math.max(5, draw))
        : DEFAULT_MAP_SETTINGS.drawDistanceKm,
      terrainQuality: parseQuality(
        parsed.terrainQuality,
        qualities,
        DEFAULT_MAP_SETTINGS.terrainQuality,
      ),
      shadowsEnabled:
        typeof parsed.shadowsEnabled === "boolean"
          ? parsed.shadowsEnabled
          : DEFAULT_MAP_SETTINGS.shadowsEnabled,
      shadowQuality: parseQuality(
        parsed.shadowQuality,
        qualities,
        DEFAULT_MAP_SETTINGS.shadowQuality,
      ),
      fogEnabled:
        typeof parsed.fogEnabled === "boolean"
          ? parsed.fogEnabled
          : DEFAULT_MAP_SETTINGS.fogEnabled,
      motionBlur: Number.isFinite(blur)
        ? Math.min(100, Math.max(0, Math.round(blur)))
        : DEFAULT_MAP_SETTINGS.motionBlur,
      targetFps: parsed.targetFps === 30 || parsed.targetFps === 60 ? parsed.targetFps : DEFAULT_MAP_SETTINGS.targetFps,
      showFloatingLabels:
        typeof parsed.showFloatingLabels === "boolean"
          ? parsed.showFloatingLabels
          : DEFAULT_MAP_SETTINGS.showFloatingLabels,
      showCoordinates:
        typeof parsed.showCoordinates === "boolean"
          ? parsed.showCoordinates
          : DEFAULT_MAP_SETTINGS.showCoordinates,
    };
  } catch {
    return { ...DEFAULT_MAP_SETTINGS };
  }
}

export function saveMapSettings(settings: MapSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* quota / private mode */
  }
}
