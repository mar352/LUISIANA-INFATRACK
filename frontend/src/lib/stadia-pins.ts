import type { Map as MapLibreMap } from "maplibre-gl";
import type { Project } from "../types";
import { isLguInfrastructureProject } from "../ui/CesiumMap";

export interface PinImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type PinCenterType = "lgu" | "house" | "none";

// Cache generated pin ImageData
const pinImageDataCache = new Map<string, PinImageData>();

let luisianaLogoImg: HTMLImageElement | null = null;
if (typeof window !== "undefined") {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = "/logo.png";
  img.onload = () => {
    luisianaLogoImg = img;
    pinImageDataCache.clear();
  };
}

/**
 * Creates 72x92 retina ImageData for a classic teardrop pin pointer.
 * - centerIcon === "lgu": Official Seal of Luisiana (for Municipal / LGU projects only)
 * - centerIcon === "house": Clean Private Infrastructure / House icon (for non-LGU / private applications)
 * - centerIcon === "none": Clean target badge
 * At pixelRatio 2, displays at 36x46 with the pin tip at (18, 41) screen points.
 */
export function createPinImageData(
  fillColor: string,
  strokeColor = "#ffffff",
  centerIcon: PinCenterType = "lgu",
  isSelected = false
): PinImageData | null {
  if (typeof document === "undefined") return null;

  const cacheKey = `${fillColor}_${strokeColor}_${centerIcon}_${isSelected ? "sel" : "norm"}`;
  const cached = pinImageDataCache.get(cacheKey);
  if (cached) return cached;

  const w = 72;
  const h = 92;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;

  // 1. Soft contact shadow on the ground below the pin tip
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(36, 86, isSelected ? 18 : 15, isSelected ? 5.5 : 4.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = isSelected ? "rgba(0, 113, 227, 0.45)" : "rgba(0, 0, 0, 0.35)";
  ctx.fill();
  ctx.restore();

  // If selected, draw an outer luminous glow aura
  if (isSelected) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(36, 84);
    ctx.bezierCurveTo(25, 63, 8, 49, 8, 32);
    ctx.arc(36, 32, 28, Math.PI, 0, false);
    ctx.bezierCurveTo(64, 49, 47, 63, 36, 84);
    ctx.closePath();
    ctx.fillStyle = "rgba(2, 132, 199, 0.35)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#38bdf8";
    ctx.stroke();
    ctx.restore();
  }

  // 2. Main teardrop pin body
  // Pin tip is at (36, 82)
  // Pin head center is at (36, 32), radius = 25
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(36, 82);
  ctx.bezierCurveTo(27, 62, 11, 48, 11, 32);
  ctx.arc(36, 32, 25, Math.PI, 0, false);
  ctx.bezierCurveTo(61, 48, 45, 62, 36, 82);
  ctx.closePath();

  ctx.fillStyle = fillColor;
  ctx.fill();

  // Crisp border around pin body
  ctx.lineWidth = isSelected ? 4.5 : 3.5;
  ctx.strokeStyle = strokeColor;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Inner circular badge (enlarged for LGU logo, balanced for house)
  const innerRadius = centerIcon === "lgu" ? 15.5 : centerIcon === "house" ? 12 : 9;
  ctx.beginPath();
  ctx.arc(36, 32, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
  ctx.stroke();

  // 🏛️ LGU MUNICIPAL PROJECTS ONLY: Official Seal of Luisiana
  if (centerIcon === "lgu") {
    ctx.save();
    ctx.beginPath();
    ctx.arc(36, 32, innerRadius - 0.4, 0, Math.PI * 2);
    ctx.clip();

    if (luisianaLogoImg && luisianaLogoImg.complete && luisianaLogoImg.naturalWidth > 0) {
      const size = (innerRadius - 0.4) * 2;
      ctx.drawImage(
        luisianaLogoImg,
        36 - (innerRadius - 0.4),
        32 - (innerRadius - 0.4),
        size,
        size
      );
    } else {
      // Crisp vector crest fallback: Seal of Luisiana
      const cx = 36;
      const cy = 32;
      const r = innerRadius - 0.4;
      // Blue left half
      ctx.fillStyle = "#0038a8";
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 0.5, Math.PI * 1.5);
      ctx.closePath();
      ctx.fill();
      // Red right half
      ctx.fillStyle = "#ce1126";
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.fill();
      // Center white shield
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 8);
      ctx.lineTo(cx + 6.5, cy - 4);
      ctx.lineTo(cx + 4.5, cy + 6);
      ctx.lineTo(cx, cy + 9);
      ctx.lineTo(cx - 4.5, cy + 6);
      ctx.lineTo(cx - 6.5, cy - 4);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "#1b4d3e";
      ctx.stroke();
      // Center monument icon
      ctx.fillStyle = "#1b4d3e";
      ctx.fillRect(cx - 1.5, cy - 2, 3, 7);
      ctx.beginPath();
      ctx.arc(cx, cy - 4, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (centerIcon === "house") {
    // 🏠 NON-LGU / PRIVATE APPLICATIONS: Crisp House icon
    const isYellowish =
      fillColor.toLowerCase().includes("fbb") ||
      fillColor.toLowerCase().includes("ffc") ||
      fillColor.toLowerCase().includes("eab308") ||
      fillColor.toLowerCase().includes("f5a623");
    const iconColor = isYellowish ? "#b45309" : fillColor;

    // A. Chimney
    ctx.beginPath();
    ctx.rect(39.8, 24.2, 2.2, 4.2);
    ctx.fillStyle = iconColor;
    ctx.fill();

    // B. House body (Pitched roof + walls)
    ctx.beginPath();
    ctx.moveTo(36, 23.5);     // Roof peak
    ctx.lineTo(27.5, 30.5);   // Left roof eave
    ctx.lineTo(29.5, 30.5);   // Under left eave
    ctx.lineTo(29.5, 39);     // Down left wall
    ctx.lineTo(42.5, 39);     // Across floor
    ctx.lineTo(42.5, 30.5);   // Up right wall
    ctx.lineTo(44.5, 30.5);   // Right roof eave
    ctx.closePath();
    ctx.fillStyle = iconColor;
    ctx.fill();

    // C. Crisp white door cutout in center of house
    ctx.beginPath();
    ctx.rect(34, 34, 4, 5);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  ctx.restore();

  const imgData = ctx.getImageData(0, 0, w, h);
  const result: PinImageData = {
    width: w,
    height: h,
    data: imgData.data,
  };
  pinImageDataCache.set(cacheKey, result);
  return result;
}

export const STADIA_PIN_ICONS = {
  // LGU Municipal Projects (Official Seal of Luisiana)
  LGU_COMPLETED: "pin-lgu-completed",
  LGU_ONGOING: "pin-lgu-ongoing",
  LGU_PLANNED: "pin-lgu-planned",
  LGU_COMPLETED_SELECTED: "pin-lgu-completed-selected",
  LGU_ONGOING_SELECTED: "pin-lgu-ongoing-selected",
  LGU_PLANNED_SELECTED: "pin-lgu-planned-selected",

  // Private / Non-LGU Projects & Applications (House Icon)
  HOUSE_COMPLETED: "pin-house-completed",
  HOUSE_ONGOING: "pin-house-ongoing",
  HOUSE_PLANNED: "pin-house-planned",
  HOUSE_COMPLETED_SELECTED: "pin-house-completed-selected",
  HOUSE_ONGOING_SELECTED: "pin-house-ongoing-selected",
  HOUSE_PLANNED_SELECTED: "pin-house-planned-selected",
} as const;

/**
 * Resolves icon identifier and color for a project.
 * Uses LGU Seal ONLY for LGU projects; uses House icon for private/non-LGU projects.
 */
export function getProjectPinStyle(
  project: Project,
  isSelected = false
): { iconId: string; color: string } {
  const isLgu = isLguInfrastructureProject(project);
  const prog = (project as any)?.numericProgress ?? project.progress ?? 0;
  const isDone = prog >= 100 || project.status === "Completed";
  const isOngoing = prog >= 50 || project.status === "Ongoing";

  if (isLgu) {
    // 🏛️ LGU Projects: Seal of Luisiana with LGU colors
    if (isDone) {
      return {
        iconId: isSelected
          ? STADIA_PIN_ICONS.LGU_COMPLETED_SELECTED
          : STADIA_PIN_ICONS.LGU_COMPLETED,
        color: "#10b981",
      };
    }
    if (isOngoing) {
      return {
        iconId: isSelected
          ? STADIA_PIN_ICONS.LGU_ONGOING_SELECTED
          : STADIA_PIN_ICONS.LGU_ONGOING,
        color: "#f5a623",
      };
    }
    return {
      iconId: isSelected
        ? STADIA_PIN_ICONS.LGU_PLANNED_SELECTED
        : STADIA_PIN_ICONS.LGU_PLANNED,
      color: "#0284c7",
    };
  }

  // 🏠 Non-LGU / Private Projects: House icon with classic colors
  if (isDone) {
    return {
      iconId: isSelected
        ? STADIA_PIN_ICONS.HOUSE_COMPLETED_SELECTED
        : STADIA_PIN_ICONS.HOUSE_COMPLETED,
      color: "#34a853",
    };
  }
  if (isOngoing) {
    return {
      iconId: isSelected
        ? STADIA_PIN_ICONS.HOUSE_ONGOING_SELECTED
        : STADIA_PIN_ICONS.HOUSE_ONGOING,
      color: "#fbbc04",
    };
  }
  return {
    iconId: isSelected
      ? STADIA_PIN_ICONS.HOUSE_PLANNED_SELECTED
      : STADIA_PIN_ICONS.HOUSE_PLANNED,
    color: "#ea4335",
  };
}

/**
 * Registers all pin icons (both LGU seal and Private house variants) to MapLibre WebGL
 */
export function ensurePinImages(map: MapLibreMap): void {
  const definitions: Array<{
    id: string;
    color: string;
    center: PinCenterType;
    sel: boolean;
  }> = [
    // LGU Seal pins (Municipal projects only)
    { id: STADIA_PIN_ICONS.LGU_COMPLETED, color: "#10b981", center: "lgu", sel: false },
    { id: STADIA_PIN_ICONS.LGU_COMPLETED_SELECTED, color: "#10b981", center: "lgu", sel: true },
    { id: STADIA_PIN_ICONS.LGU_ONGOING, color: "#f5a623", center: "lgu", sel: false },
    { id: STADIA_PIN_ICONS.LGU_ONGOING_SELECTED, color: "#f5a623", center: "lgu", sel: true },
    { id: STADIA_PIN_ICONS.LGU_PLANNED, color: "#0284c7", center: "lgu", sel: false },
    { id: STADIA_PIN_ICONS.LGU_PLANNED_SELECTED, color: "#0284c7", center: "lgu", sel: true },

    // House pins (Private / non-LGU projects)
    { id: STADIA_PIN_ICONS.HOUSE_COMPLETED, color: "#34a853", center: "house", sel: false },
    { id: STADIA_PIN_ICONS.HOUSE_COMPLETED_SELECTED, color: "#34a853", center: "house", sel: true },
    { id: STADIA_PIN_ICONS.HOUSE_ONGOING, color: "#fbbc04", center: "house", sel: false },
    { id: STADIA_PIN_ICONS.HOUSE_ONGOING_SELECTED, color: "#fbbc04", center: "house", sel: true },
    { id: STADIA_PIN_ICONS.HOUSE_PLANNED, color: "#ea4335", center: "house", sel: false },
    { id: STADIA_PIN_ICONS.HOUSE_PLANNED_SELECTED, color: "#ea4335", center: "house", sel: true },
  ];

  for (const def of definitions) {
    if (!map.hasImage(def.id)) {
      const pinData = createPinImageData(def.color, "#ffffff", def.center, def.sel);
      if (pinData) {
        map.addImage(
          def.id,
          { width: pinData.width, height: pinData.height, data: pinData.data },
          { pixelRatio: 2 }
        );
      }
    }
  }
}

/**
 * Transforms an array of projects into a GeoJSON FeatureCollection
 */
export function projectsToGeoJson(
  projects: Project[],
  selectedProjectId: string | null | undefined,
  getCoords: (p: Project) => { lon: number; lat: number } | null
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const proj of projects) {
    const coords = getCoords(proj);
    if (!coords) continue;

    const isSelected = proj.id === selectedProjectId;
    const { iconId, color } = getProjectPinStyle(proj, isSelected);

    features.push({
      type: "Feature",
      id: proj.id,
      geometry: {
        type: "Point",
        coordinates: [coords.lon, coords.lat],
      },
      properties: {
        id: proj.id,
        name: proj.name || "Proyekto ng Munisipyo",
        barangay: proj.barangay || "Luisiana, Laguna",
        status: proj.status || "Pre-construction",
        progress: (proj as any)?.numericProgress ?? proj.progress ?? 0,
        icon: iconId,
        color,
        isSelected: isSelected ? 1 : 0,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
