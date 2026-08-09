import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CesiumMap, type CesiumMapHandle } from "./CesiumMap";
import InventoryPage from "./InventoryPage";
import PlanningPage from "./PlanningPage";
import DocumentsPage from "./DocumentsPage";
import AnalyticsPage from "./AnalyticsPage";
import CitizenPortal from "./CitizenPortal";
import EngagementPage from "./EngagementPage";
import { addProjectToFirestore } from "../services/firestore-projects";
import type {
  AlertItem,
  HeatPoint,
  MapSketch,
  MapSketchKind,
  PlacementTool,
  PlanningProposal,
  Project,
  RiskZones,
  WeatherSnapshot,
  ProjectStatus,
} from "../types";
import {
  MAP_SKETCH_COLORS,
  MODEL_CATALOG,
  PLANNING_STATUS_LABELS,
  type ModelType,
  PROJECT_STATUS_COLORS,
} from "../types";
import { connectRealtime } from "../lib/realtime";
import { BACKEND_URL, backendUrl } from "../lib/api";
import { fetchProposalsOnce, updateProposal } from "../services/firestore-planning";
import { departmentForRole } from "../lib/planning-permissions";
import { buildHeatmapPoints, type BBox, type HeatmapMetric } from "../lib/heatmap";
import { formatGibsDate, getGibsLayerInfo, gibsWmtsTileUrl, type GibsLayerId } from "../lib/gibs";
import {
  applyMapSunLighting,
  dateFromSolarHour,
  formatSolarHour,
  getCurrentSolarHour,
  getSunPosition,
  bearingDegFromSunCalcAzimuth,
  sunPositionWithBearing,
  sunDirectionFromPosition,
  shadowGroundOffset,
  shadowStretchFromAltitude,
  daylightRasterScale,
  ensureNightVeilLayer,
  LUISIANA_CENTER,
} from "../lib/solar";
import {
  DEFAULT_MAP_SETTINGS,
  loadMapSettings,
  saveMapSettings,
  type MapSettings,
  type ShadowQuality,
  type TerrainQuality,
} from "../lib/map-settings";
import { SunAzimuthDial } from "./SunAzimuthDial";
import { 
  getTerrainSource, 
  getSatelliteSource, 
  createHillshadeLayer, 
  applyWebGLOptimizations,
  calculateTerrainExaggeration,
  type TerrainSource,
  type SatelliteSource 
} from "../lib/terrain";
import { 
  fetchEONETEvents, 
  filterEventsByRegion, 
  getEventStats, 
  getLatestGeometry,
  calculateDistance,
  EONET_CATEGORIES,
  type EONETEvent 
} from "../lib/eonet";
import {
  fetchTropicalSystems,
  getTropicalColor,
  getTropicalIcon,
  getTropicalStageMeta,
  type TropicalSystem,
} from "../lib/tropical-systems";
import { detectOpenMapTilesSourceId, stadiaStyleUrl } from "../lib/stadia";
import {
  ensureEditStreetLayers,
  setEditStreetVisible,
  startEditStreetPulse,
  stopEditStreetPulse,
  teardownEditStreetOverlay,
} from "../lib/street-edit-overlay";
import { snapLngLatToRoad } from "../lib/snap-to-road";
import { LandingPage, LoginScreen, ROLE_CONFIGS, type UserRole } from "./Landing";
import { ProjectMonitoringPanel } from "./ProjectMonitoringPanel";
import { ThemeToggle } from "./ThemeToggle";
import { ProjectChat } from "./ProjectChat";
import { HazardLegend } from "./HazardLegend";
import { activeHazardFromToggles } from "../lib/hazard-overlays";
import {
  seedAccounts,
  getSessionFromCookie,
  clearSessionCookie,
  sessionForRole,
  type SessionUser,
} from "../services/auth";

// ── Dashboard icons ────────────────────────────────────────────────────────────
const IconClipboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
  </svg>
);
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconClock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IconWarn = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

// ── Model catalog SVG icons ──────────────────────────────────────────────
const ModelIcons: Record<string, React.FC<{ size?: number; color?: string }>> = {
  office: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18"/><path d="M9 21V9"/><path d="M7 6h.01"/><path d="M12 6h.01"/><path d="M17 6h.01"/>
    </svg>
  ),
  school: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
    </svg>
  ),
  hospital: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="1"/><path d="M12 8v8"/><path d="M8 12h8"/>
    </svg>
  ),
  barangay_hall: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M9 10h.01"/><path d="M15 10h.01"/>
    </svg>
  ),
  municipal_hall: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18"/><path d="M4 21V10l8-6 8 6v11"/><path d="M9 21v-6h6v6"/><path d="M12 4v3"/><path d="M8 14h.01"/><path d="M16 14h.01"/>
    </svg>
  ),
  rhu: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M12 11v6"/><path d="M9 14h6"/>
    </svg>
  ),
  evacuation_center: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  road: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21L9 3"/><path d="M19 21L15 3"/><path d="M9 12h6"/><path d="M10 7h4"/><path d="M10 17h4"/>
    </svg>
  ),
  bridge: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 18h20"/><path d="M2 18c0-4 4-7 10-7s10 3 10 7"/><path d="M6 18v-3"/><path d="M18 18v-3"/>
    </svg>
  ),
  water_tank: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="7" rx="9" ry="4"/><path d="M3 7v10c0 2.2 4 4 9 4s9-1.8 9-4V7"/><path d="M3 12c0 2.2 4 4 9 4s9-1.8 9-4"/>
    </svg>
  ),
  solar_farm: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>
    </svg>
  ),
  barn: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18"/><path d="M3 10l9-7 9 7"/><path d="M5 21V10"/><path d="M19 21V10"/><rect x="9" y="14" width="6" height="7"/>
    </svg>
  ),
  construction: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20"/><path d="M6 20V10l6-6 6 6v10"/><path d="M12 20v-6"/><path d="M9 14h6"/><path d="M3 10h18"/>
    </svg>
  ),
};


const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Stadia Maps Outdoors — OpenMapTiles schema (buildings + landcover). API key optional on localhost.
const VECTOR_STYLE_URL = stadiaStyleUrl();

type LayerToggles = {
  satellite: boolean;
  terrain: boolean;
  heatmap: boolean;
  weather: boolean;
  gibsPrecip: boolean;
  risk: boolean;
  projects: boolean;
  buildingBlocks: boolean;
  stormTrack: boolean;
  hazardEil2010: boolean;
  hazardEq2014: boolean;
  hazardGsh2014: boolean;
};

const DEFAULT_TOGGLES: LayerToggles = {
  satellite: false,
  terrain: false,
  heatmap: false,
  weather: false,
  gibsPrecip: false,
  risk: false,
  projects: true,
  buildingBlocks: true,
  stormTrack: false,
  hazardEil2010: false,
  hazardEq2014: false,
  hazardGsh2014: false,
};

const BUILDING_EXTRUSION_OPACITY_DEFAULT = 1;

/**
 * The REAL 3D blocks on this app:
 *   layer id:     "3d-buildings"
 *   type:         fill-extrusion
 *   source:       OpenMapTiles vector (usually "openmaptiles" — Stadia / OMT)
 *   source-layer: "building"
 *
 * Do NOT confuse with:
 *   - "project-labels" (circle highlight markers)
 *   - "glb-buildings"  (Three.js custom layer for project GLBs)
 */
const BUILDING_EXTRUSION_LAYER = "3d-buildings";
const BUILDING_SOURCE_LAYER = "building";

/** Flat / style-provided building layers to strip before our extrusion (Stadia, Liberty, …). */
const FLAT_BUILDING_LAYER_IDS = [
  "building",
  "building-top",
  "building-3d",
  "buildings",
  "building-street",
  "building-number",
];

/** Set opacity/visibility on our extrusion and base-style building extrusions. */
function applyBuildingExtrusionOpacity(map: MapLibreMap, opacity: number) {
  const value = Math.max(0, Math.min(1, opacity));
  const hidden = value <= 0.001;
  const knownBuildingLayerIds = new Set([
    BUILDING_EXTRUSION_LAYER,
    "building",
    "building-top",
    "buildings",
    "building-3d",
    "3d-building",
    "3d-buildings",
  ]);

  // Update our extrusion and any building extrusion supplied by the base style.
  // This remains resilient if a style reload restores its original building layer.
  for (const layer of map.getStyle()?.layers ?? []) {
    const sourceLayer = (layer as any)["source-layer"];
    const isBuildingExtrusion =
      layer.type === "fill-extrusion" &&
      (knownBuildingLayerIds.has(layer.id) ||
        sourceLayer === BUILDING_SOURCE_LAYER ||
        /(^|[-_])buildings?($|[-_])/i.test(layer.id));

    if (!isBuildingExtrusion) continue;

    try {
      map.setLayoutProperty(layer.id, "visibility", hidden ? "none" : "visible");
      map.setPaintProperty(layer.id, "fill-extrusion-opacity", hidden ? 0 : value);
    } catch (err) {
      console.warn(`[Map] failed to update ${layer.id} opacity:`, err);
    }
  }

  map.triggerRepaint();
}

const CENTER = { lat: 14.19, lon: 121.51, zoom: 11.4 };

function levelColor(level: "LOW" | "MODERATE" | "HIGH") {
  if (level === "HIGH") return "rgba(255, 77, 79, 0.55)";
  if (level === "MODERATE") return "rgba(61, 155, 95, 0.45)";
  return "rgba(61, 155, 95, 0.30)";
}

function formatAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}

type PanelNotice = {
  id: string;
  proposalId: string;
  title: string;
  message: string;
  at: string;
  kind: "botohan" | "returned" | "review" | "assigned" | "update";
};

function buildEngineerPlanningNotices(
  proposals: PlanningProposal[],
  session: SessionUser,
): PanelNotice[] {
  const username = session.username.toLowerCase();
  const dept = departmentForRole(session.role);
  const notices: PanelNotice[] = [];

  for (const p of proposals) {
    const isDept = p.department === dept;
    const isAssignee = (p.assignees || []).some((a) => a.toLowerCase() === username);
    const votes = p.votes || [];
    const hasVoted = votes.some((v) => v.username.toLowerCase() === username);
    const yes = votes.filter((v) => v.choice === "yes").length;
    const no = votes.filter((v) => v.choice === "no").length;
    const abstain = votes.filter((v) => v.choice === "abstain").length;
    const statusLabel = PLANNING_STATUS_LABELS[p.status] || p.status;
    const at = p.updatedAt || p.createdAt;

    if (p.status === "in_review" && !hasVoted) {
      notices.push({
        id: `${p.id}:botohan:${votes.length}`,
        proposalId: p.id,
        title: "Botohan open",
        message: `"${p.title}" — cast your Yes / No / Abstain vote.`,
        at,
        kind: "botohan",
      });
      continue;
    }

    if (!isDept && !isAssignee) continue;

    if (p.status === "returned") {
      notices.push({
        id: `${p.id}:returned:${at}`,
        proposalId: p.id,
        title: "Returned for revision",
        message: `"${p.title}" was returned. Update and resubmit.`,
        at,
        kind: "returned",
      });
      continue;
    }

    if (isAssignee && (p.status === "submitted" || p.status === "in_review")) {
      notices.push({
        id: `${p.id}:assigned:${p.status}:${votes.length}`,
        proposalId: p.id,
        title: "Assigned to you",
        message: `"${p.title}" · ${statusLabel}${votes.length ? ` · Botohan ${yes}Y / ${no}N / ${abstain}A` : ""}`,
        at,
        kind: "assigned",
      });
      continue;
    }

    if (isDept && (p.status === "submitted" || p.status === "in_review" || p.status === "recommended")) {
      notices.push({
        id: `${p.id}:${p.status}:${votes.length}`,
        proposalId: p.id,
        title: statusLabel,
        message:
          p.status === "in_review" && votes.length
            ? `"${p.title}" · Botohan ${yes}Y / ${no}N / ${abstain}A`
            : `"${p.title}" needs Engineering attention.`,
        at,
        kind: p.status === "in_review" ? "review" : "update",
      });
    }
  }

  return notices
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""))
    .slice(0, 12);
}

const DISMISSED_NOTICES_KEY = "infatrack_eng_dismissed_notices";

function loadDismissedNoticeIds(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_NOTICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  // Separate state so React re-renders overlays when the map instance is ready
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const cesiumMapRef = useRef<CesiumMapHandle | null>(null);

  const [currentSession, setCurrentSession] = useState<SessionUser | null>(null);
  const currentRole = currentSession?.role ?? null;
  const [screen, setScreen] = useState<"landing" | "login" | "app" | "inventory" | "planning" | "documents" | "analytics" | "engagement" | "citizen">("landing");
  const roleConfig = currentRole ? ROLE_CONFIGS[currentRole] : null;
  /** Keep Cesium alive briefly after leaving the map so logout/home doesn't white-screen on WebGL teardown. */
  const [mapHold, setMapHold] = useState(false);
  /** Same for Citizen Portal globe — unmounting it after Home was white-screening Landing. */
  const [citizenHold, setCitizenHold] = useState(false);

  const [cookieConsent, setCookieConsent] = useState<"pending" | "accepted" | "declined">(() => {
    const stored = localStorage.getItem("infatrack_cookie_consent");
    return stored === "accepted" ? "accepted" : stored === "declined" ? "declined" : "pending";
  });

  useEffect(() => {
    seedAccounts().catch((err) => console.warn("[Auth] Seed accounts failed:", err));

    if (cookieConsent === "accepted") {
      const saved = getSessionFromCookie();
      if (saved) {
        setCurrentSession(saved);
        setScreen("app");
      }
    }
  }, []);

  function handleCookieAccept() {
    localStorage.setItem("infatrack_cookie_consent", "accepted");
    setCookieConsent("accepted");
  }

  function handleCookieDecline() {
    localStorage.setItem("infatrack_cookie_consent", "declined");
    setCookieConsent("declined");
  }

  const [connected, setConnected] = useState(false);
  const [toggles, setToggles] = useState<LayerToggles>(DEFAULT_TOGGLES);
  const [mapSettings, setMapSettings] = useState<MapSettings>(() => loadMapSettings());
  useEffect(() => {
    saveMapSettings(mapSettings);
  }, [mapSettings]);
  const [solarHour, setSolarHour] = useState(() => getCurrentSolarHour());
  const [sunAzimuthDeg, setSunAzimuthDeg] = useState(() => {
    const date = dateFromSolarHour(getCurrentSolarHour());
    const pos = getSunPosition(LUISIANA_CENTER.lat, LUISIANA_CENTER.lon, date);
    return bearingDegFromSunCalcAzimuth(pos.azimuthRad);
  });
  const sunLighting = useMemo(() => {
    const date = dateFromSolarHour(solarHour);
    const astro = getSunPosition(LUISIANA_CENTER.lat, LUISIANA_CENTER.lon, date);
    const pos = sunPositionWithBearing(astro.altitudeRad, sunAzimuthDeg);
    const [dx, dy, dz] = sunDirectionFromPosition(pos);
    const lightPosition: [number, number, number] = pos.isDaylight
      ? [dx * 100, dy * 100, Math.max(12, dz * 100)]
      : [dx * 40, dy * 40, Math.max(8, Math.abs(dz) * 20)];
    return {
      pos,
      lightPosition,
      altitudeRad: pos.altitudeRad,
      azimuthRad: pos.azimuthRad,
      isDaylight: pos.isDaylight,
      stretch: shadowStretchFromAltitude(pos.altitudeRad),
      groundOffset: shadowGroundOffset(pos),
    };
  }, [solarHour, sunAzimuthDeg]);

  const setSolarHourAndSyncAzimuth = (hour: number) => {
    setSolarHour(hour);
    const date = dateFromSolarHour(hour);
    const pos = getSunPosition(LUISIANA_CENTER.lat, LUISIANA_CENTER.lon, date);
    setSunAzimuthDeg(bearingDegFromSunCalcAzimuth(pos.azimuthRad));
  };

  // Drive MapLibre basemap light + hillshade + night veil from SunCalc
  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    if (!map) return;
    const apply = () => {
      applyMapSunLighting(map as any, sunLighting.pos, {
        showHillshade: true,
        beforeVeilId: BUILDING_EXTRUSION_LAYER,
        satelliteOn: toggles.satellite,
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("style.load", apply);
    map.on("style.load", apply);
    return () => {
      map.off("style.load", apply);
    };
  }, [mapInstance, sunLighting, toggles.satellite]);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>([]);
  const [riskZones, setRiskZones] = useState<RiskZones | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [placementMode, setPlacementMode] = useState(false);
  const [blockRemoverMode, setBlockRemoverMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [snapToRoad, setSnapToRoad] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelType>("office");
  const [placementRotation, setPlacementRotation] = useState(0);
  const [placingName, setPlacingName] = useState("");
  const [customModelFile, setCustomModelFile] = useState<File | null>(null);
  const [customModelPreview, setCustomModelPreview] = useState<string | null>(null);
  /** Approved proposal waiting for MPDC to click the map and pin the site. */
  const [pinProposal, setPinProposal] = useState<PlanningProposal | null>(null);
  const pinProposalRef = useRef<PlanningProposal | null>(null);
  const [placementTool, setPlacementTool] = useState<PlacementTool>("pin");
  const [placementColor, setPlacementColor] = useState<string>(MAP_SKETCH_COLORS[0]);

  const placementToolbarOpen =
    (pinProposal && currentRole === "MPDC" && screen === "app") ||
    (placementMode && currentRole === "Engineer" && screen === "app");
  const eraseBlocksActive = placementToolbarOpen && placementTool === "erase";
  const [sidebarTab, setSidebarTab] = useState<"notify" | "layers" | "risk" | "projects" | "climate" | "events">("climate");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches
  );
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [planningNotices, setPlanningNotices] = useState<PanelNotice[]>([]);
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<string[]>(() => loadDismissedNoticeIds());
  const refreshPlanningNoticesRef = useRef<() => void>(() => {});

  // Set default tab based on role permissions
  useEffect(() => {
    if (roleConfig) {
      if (currentRole === "Engineer") setSidebarTab("notify");
      else if (roleConfig.canSeeWeather || roleConfig.canSeeLayers) setSidebarTab("climate");
      else if (roleConfig.canSeeRisk) setSidebarTab("risk");
      else if (roleConfig.canSeeProjects) setSidebarTab("projects");
    }
    if (currentRole !== "Engineer") {
      setBlockRemoverMode(false);
      setEditMode(false);
    }
    if (currentRole !== "MPDC") {
      setPinProposal(null);
      pinProposalRef.current = null;
    }
    if (currentRole !== "Engineer" && currentRole !== "MPDC") {
      setPlacementMode(false);
    }
  }, [currentRole]);

  useEffect(() => {
    pinProposalRef.current = pinProposal;
  }, [pinProposal]);

  // Collapse side panel by default on tablet/phone; full map first
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarCollapsed(true);
    };
    if (mq.matches) setSidebarCollapsed(true);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Overlay panel: keep the map canvas size fixed and ease camera padding so
  // custom 3D models stay locked to lat/lng/altitude (no mid-animation resize).
  useEffect(() => {
    const map = mapRef.current ?? mapInstance;
    if (!map || screen !== "app") return;

    const durationMs = 280;
    const isNarrow = window.matchMedia("(max-width: 1024px)").matches;
    const panelEl = document.querySelector(".sidePanel") as HTMLElement | null;
    const rect = panelEl?.getBoundingClientRect();
    const measuredW = rect && rect.width > 0 ? Math.round(rect.width) : Math.max(320, Math.min(352, Math.round(window.innerWidth * 0.22)));
    const measuredH = rect && rect.height > 0
      ? Math.round(rect.height)
      : Math.min(Math.round(window.innerHeight * 0.58), Math.max(0, window.innerHeight - 52));

    const padding = sidebarCollapsed
      ? { top: 0, bottom: 0, left: 0, right: 0 }
      : isNarrow
        ? { top: 0, bottom: measuredH, left: 0, right: 0 }
        : { top: 0, bottom: 0, left: 0, right: measuredW };

    try {
      map.easeTo({
        padding,
        duration: durationMs,
        essential: true,
      });
    } catch {
      /* map may not be ready */
    }

    // Keep projection matrices fresh while padding eases.
    // Custom layer re-reads map matrix each frame via getProjectionDataForCustomLayer.
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      try {
        map.triggerRepaint();
      } catch {
        /* map may be gone */
      }
      if (now - start < durationMs + 80) {
        raf = window.requestAnimationFrame(tick);
      } else {
        try {
          map.resize();
          map.triggerRepaint();
        } catch {
          /* ignore */
        }
      }
    };
    raf = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(raf);
  }, [sidebarCollapsed, screen, mapInstance]);
  const [heatMetric, setHeatMetric] = useState<HeatmapMetric>("combined");
  const [viewport, setViewport] = useState<{ bbox: BBox; zoom: number } | null>(null);
  const [gibsLayer, setGibsLayer] = useState<GibsLayerId>("IMERG_Precipitation_Rate");
  const [gibsDate, setGibsDate] = useState(() => {
    // GIBS layers often lag “today” availability. Default to yesterday (UTC) to avoid 404 tiles.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return formatGibsDate(d);
  });
  const [gibsOpacity, setGibsOpacity] = useState(0.62);
  const [buildingExtrusionOpacity, setBuildingExtrusionOpacity] = useState(BUILDING_EXTRUSION_OPACITY_DEFAULT);
  const [glbModelsOpacity, setGlbModelsOpacity] = useState(1);
  const [gibsStatus, setGibsStatus] = useState<"loading" | "ok" | "unavailable">("loading");

  // NASA EONET Natural Events
  const [eonetEvents, setEonetEvents] = useState<EONETEvent[]>([]);
  const [eonetEnabled, setEonetEnabled] = useState(false);
  const [eonetLoading, setEonetLoading] = useState(false);
  const [eonetCategories, setEonetCategories] = useState<string[]>(["wildfires", "severeStorms", "volcanoes", "earthquakes", "floods"]);
  const [eonetRadius, setEonetRadius] = useState(1000); // km radius from Luisiana

  // Tropical systems (Invest / TC / LPA-watch via RAMMB)
  const [tropicalEnabled, setTropicalEnabled] = useState(false);
  const [tropicalSystems, setTropicalSystems] = useState<TropicalSystem[]>([]);
  const [tropicalLoading, setTropicalLoading] = useState(false);
  const [tropicalDisclaimer, setTropicalDisclaimer] = useState("");
  const [tropicalError, setTropicalError] = useState<string | null>(null);

  // Google Street View mode — when active, clicking the map opens GSV in a new tab
  const [streetViewMode, setStreetViewMode] = useState(false);

  // Map bearing tracked by CameraCompass (live rotate/pitch sync)

  // Keyboard shortcuts: +/- zoom, N = reset north, H = fly home
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = mapRef.current;
      if (!m) return;
      // Don't fire when typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.key === "=" || e.key === "+") m.zoomIn({ duration: 300 });
      if (e.key === "-" || e.key === "_") m.zoomOut({ duration: 300 });
      if (e.key === "n" || e.key === "N") m.easeTo({ bearing: 0, pitch: 75, duration: 500 });
      if (e.key === "h" || e.key === "H") m.flyTo({ center: [CENTER.lon, CENTER.lat], zoom: CENTER.zoom, pitch: toggles.satellite ? 75 : 30, bearing: -15, duration: 1200, essential: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggles.satellite]);

  // Fetch NASA EONET natural events
  useEffect(() => {
    if (!eonetEnabled) return;

    const fetchEvents = async () => {
      setEonetLoading(true);
      try {
        const response = await fetchEONETEvents({
          status: "open",
          limit: 500,
          days: 30,
        });

        // Filter events by region (within radius of Luisiana)
        const filtered = filterEventsByRegion(response.events, [121.5167, 14.1856], eonetRadius);
        
        // Further filter by selected categories
        const categoryFiltered = filtered.filter(event =>
          event.categories.some(cat => eonetCategories.includes(cat.id))
        );

        setEonetEvents(categoryFiltered);
      } catch (error) {
        console.error("Failed to fetch EONET events:", error);
        setEonetEvents([]);
      } finally {
        setEonetLoading(false);
      }
    };

    fetchEvents();
    
    // Refresh every 30 minutes
    const interval = setInterval(fetchEvents, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [eonetEnabled, eonetCategories, eonetRadius]);

  // Fetch West Pacific tropical systems (Invest / TC / LPA-watch)
  useEffect(() => {
    if (!tropicalEnabled) return;

    const loadTropical = async () => {
      setTropicalLoading(true);
      try {
        const response = await fetchTropicalSystems();
        setTropicalSystems(response.systems ?? []);
        setTropicalDisclaimer(response.disclaimer ?? "");
        setTropicalError(response.error ?? null);
      } catch (error) {
        console.error("Failed to fetch tropical systems:", error);
        setTropicalSystems([]);
        setTropicalError(error instanceof Error ? error.message : "Failed to load");
      } finally {
        setTropicalLoading(false);
      }
    };

    loadTropical();
    const interval = setInterval(loadTropical, 20 * 60 * 1000);
    return () => clearInterval(interval);
  }, [tropicalEnabled]);

  const topRisk = useMemo(() => {
    const feats = riskZones?.features || [];
    const high = feats.filter((f) => f.properties.level === "HIGH");
    if (high.length) return { level: "HIGH" as const, count: high.length };
    const mod = feats.filter((f) => f.properties.level === "MODERATE");
    if (mod.length) return { level: "MODERATE" as const, count: mod.length };
    return { level: "LOW" as const, count: feats.length ? feats.length : 0 };
  }, [riskZones]);

  // Clear map when leaving the app screen
  // Tear down MapLibre when leaving the app screen
  useEffect(() => {
    if (screen !== "app" && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      setMapInstance(null);
    }
  }, [screen]);

  // MapLibre retired — Cesium globe is the primary map. Keep init gated off.
  useEffect(() => {
    const ENABLE_MAPLIBRE = false;
    if (!ENABLE_MAPLIBRE) return;
    if (!mapDivRef.current || mapRef.current) return;
    if (screen !== "app") return; // Only initialize when on app screen

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: VECTOR_STYLE_URL,
      center: [CENTER.lon, CENTER.lat],
      zoom: CENTER.zoom,
      pitch: 30,
      bearing: -15,
      // Shadowmap-style near-horizon tilt (MapLibre default clamp is 60°)
      maxPitch: 85,
      // Keep Stadia / OpenMapTiles / OSM attribution visible (required by tile providers)
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true }, // required for three.js custom layers
    });

    mapRef.current = map;
    setMapInstance(map);

    const pushViewport = () => {
      const b = map.getBounds();
      setViewport({
        bbox: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
        zoom: map.getZoom(),
      });
    };

    map.on("load", () => {
      pushViewport();

      // ── Context OSM buildings (muted) + project 3D blocks ─────────────────
      // Project blocks = status-colored fill-extrusion (height from progress).
      // GLB models are rendered separately by BuildingOverlay.

      const buildingVectorSource = detectOpenMapTilesSourceId(map);

      // Remove flat style building fills (Stadia Outdoors / Liberty names); we use 3D extrusions.
      for (const id of FLAT_BUILDING_LAYER_IDS) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const layer of [...(map.getStyle()?.layers ?? [])].reverse()) {
        if (layer.id === BUILDING_EXTRUSION_LAYER) continue;
        const sourceLayer = (layer as any)["source-layer"];
        if (
          sourceLayer === BUILDING_SOURCE_LAYER &&
          (layer.type === "fill" || layer.type === "fill-extrusion") &&
          map.getLayer(layer.id)
        ) {
          map.removeLayer(layer.id);
        }
      }

      // Context OSM buildings — always visible; opacity slider does NOT touch these.
      // Z-fight with GLBs is handled by clearDepth in BuildingOverlay + hole filter.
      if (map.getSource(buildingVectorSource) && !map.getLayer(BUILDING_EXTRUSION_LAYER)) {
        map.addLayer({
          id: BUILDING_EXTRUSION_LAYER,
          type: "fill-extrusion",
          source: buildingVectorSource,
          "source-layer": BUILDING_SOURCE_LAYER,
          minzoom: 12,
          paint: {
            "fill-extrusion-color": "#a8b0b8",
            "fill-extrusion-height": [
              "interpolate", ["linear"], ["zoom"],
              12, 0,
              13, ["coalesce", ["get", "render_height"], 6],
            ],
            "fill-extrusion-base": [
              "coalesce", ["get", "render_min_height"], 0,
            ],
            "fill-extrusion-opacity": BUILDING_EXTRUSION_OPACITY_DEFAULT,
            "fill-extrusion-vertical-gradient": false,
          },
        } as any);
      } else if (!map.getSource(buildingVectorSource)) {
        console.warn("[Map] OpenMapTiles vector source missing; 3d-buildings skipped");
      }

      // Project location dots — GLB models rendered by BuildingOverlay
      map.addSource("project-footprints", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "project-labels",
        type: "circle",
        source: "project-footprints",
        paint: {
          "circle-radius": 5,
          "circle-color": [
            "match", ["get", "status"],
            "Completed", PROJECT_STATUS_COLORS.Completed,
            "Ongoing",   PROJECT_STATUS_COLORS.Ongoing,
            "Delayed",   PROJECT_STATUS_COLORS.Delayed,
            "Suspended", PROJECT_STATUS_COLORS.Suspended,
            "Planned",   PROJECT_STATUS_COLORS.Planned,
            "Planning",  PROJECT_STATUS_COLORS.Planned,
            PROJECT_STATUS_COLORS.Planned,
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.85,
        },
      });

      // ── Satellite imagery source (Enhanced WebGL with multiple providers) ──
      if (!map.getSource("satellite")) {
        const satelliteSource = getSatelliteSource("esri");
        map.addSource("satellite", {
          type: "raster",
          tiles: Array.from(satelliteSource.tiles) as string[],
          tileSize: satelliteSource.tileSize,
          maxzoom: satelliteSource.maxzoom,
          attribution: satelliteSource.attribution,
        });
      }

      // ── Terrain DEM (WebGL-optimized with Terrarium encoding) ──
      if (!map.getSource("terrain-dem")) {
        const terrainSource = getTerrainSource("terrarium");
        map.addSource("terrain-dem", {
          type: "raster-dem",
          tiles: terrainSource.tiles,
          tileSize: terrainSource.tileSize,
          encoding: terrainSource.encoding as any,
          maxzoom: terrainSource.maxzoom,
        } as any);
      }

      // ── Apply WebGL optimizations for better performance ──
      applyWebGLOptimizations(map, "performance");

      // ── Sky: MapLibre OSS does not support type "sky" (Mapbox-only) — skip ──

      // ── Add Hillshade layer for terrain depth ──
      try {
        const hillshadeLayer = createHillshadeLayer(0.35);
        if (map.getLayer(BUILDING_EXTRUSION_LAYER)) {
          map.addLayer(hillshadeLayer as any, BUILDING_EXTRUSION_LAYER);
        } else {
          map.addLayer(hillshadeLayer as any);
        }
      } catch (e) {
        console.warn("Hillshade layer not supported:", e);
      }

      // Night veil — above rasters/hillshade, below 3d-buildings (opacity driven by sun)
      ensureNightVeilLayer(map as any, BUILDING_EXTRUSION_LAYER);

      // ── GIBS precipitation (added before satellite so satellite sits on top) ──
      if (!map.getSource("gibs-imerg")) {
        map.addSource("gibs-imerg", {
          type: "raster",
          tiles: [gibsWmtsTileUrl({ layer: gibsLayer, date: gibsDate })],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 6,
        } as any);
      }
      if (!map.getLayer("gibs-imerg-layer")) {
        map.addLayer({
          id: "gibs-imerg-layer",
          type: "raster",
          source: "gibs-imerg",
          paint: {
            "raster-opacity": DEFAULT_TOGGLES.gibsPrecip ? gibsOpacity : 0,
            "raster-resampling": "linear",
          },
        } as any);
      }

      // Satellite — insert before 3d-buildings when that layer exists
      const beforeBuildings = map.getLayer(BUILDING_EXTRUSION_LAYER)
        ? BUILDING_EXTRUSION_LAYER
        : undefined;

      if (!map.getLayer("satellite-layer")) {
        map.addLayer(
          {
            id: "satellite-layer",
            type: "raster",
            source: "satellite",
            paint: { "raster-opacity": DEFAULT_TOGGLES.satellite ? 1 : 0 },
          } as any,
          beforeBuildings
        );
      }

      // Risk zones
      map.addSource("riskZones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "risk-fill",
        type: "fill",
        source: "riskZones",
        layout: {
          visibility: "none",
        },
        paint: {
          "fill-color": [
            "match", ["get", "level"],
            "HIGH",     "rgba(255,77,79,0.35)",
            "MODERATE", "rgba(255,214,102,0.28)",
            "LOW",      "rgba(61,155,95,0.15)",
            "rgba(255,255,255,0.0)",
          ],
          "fill-outline-color": "rgba(255,255,255,0.12)",
        },
      });

      // Storm track
      map.addSource("stormTrack", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "storm-line",
        type: "line",
        source: "stormTrack",
        paint: {
          "line-color": "rgba(120, 200, 255, 0.85)",
          "line-width": 2.5,
          "line-opacity": 0.9,
        },
      });

      // Legacy projects source (kept for compat)
      map.addSource("projects", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // ── Municipal Office label ─────────────────────────────────────────────
      // Marks the Luisiana Municipal Hall with a pin dot + label (no highlight).
      const MUNICIPAL_OFFICE = { lat: 14.185435, lon: 121.509513 };
      map.addSource("municipal-office", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [MUNICIPAL_OFFICE.lon, MUNICIPAL_OFFICE.lat] },
              properties: {},
            },
          ],
        },
      });
      map.addLayer({
        id: "municipal-office-dot",
        type: "circle",
        source: "municipal-office",
        minzoom: 10,
        paint: {
          "circle-radius": 5,
          "circle-color": "#245C3A",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      } as any);
      map.addLayer({
        id: "municipal-office-label",
        type: "symbol",
        source: "municipal-office",
        minzoom: 10,
        layout: {
          "text-field": "Municipal Office",
          "text-font": ["Noto Sans Regular"],
          "text-size": 13,
          "text-anchor": "bottom",
          "text-offset": [0, -0.7],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#245C3A",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.8,
        },
      } as any);

      // Hide Liberty POI labels like "Luisiana Municipal Hall".
      // Cream OSM building holes under projects are handled in a separate effect.
      {
        const hideMunicipalPoiLabels = () => {
          const nameHide: any = [
            "!",
            [
              "in",
              ["downcase", ["to-string", ["coalesce", ["get", "name"], ["get", "name_en"], ""]]],
              [
                "literal",
                [
                  "luisiana municipal hall",
                  "municipal hall",
                  "municipal office",
                  "luisiana municipal office",
                  "luisiana mdrrimo command center",
                  "luisiana mdrrmo command center",
                  "mdrrimo command center",
                  "mdrrmo command center",
                ],
              ],
            ],
          ];
          for (const layer of map.getStyle()?.layers ?? []) {
            if (layer.type !== "symbol") continue;
            const id = layer.id;
            if (!/poi|place|label/i.test(id)) continue;
            try {
              // Replace filter (don't nest on every call)
              const prev = map.getFilter(id);
              const base = Array.isArray(prev) && prev[0] === "all"
                ? prev.filter((clause: any) => !(Array.isArray(clause) && clause[0] === "!" && JSON.stringify(clause).includes("municipal")))
                : prev;
              map.setFilter(id, base ? (["all", base, nameHide] as any) : nameHide);
            } catch { /* ignore */ }
          }
        };

        hideMunicipalPoiLabels();
        map.on("style.load", hideMunicipalPoiLabels);
      }

      // ── Double-click to smooth zoom in ───────────────────────────────────
      map.on("dblclick", (e) => {
        e.preventDefault();
        map.flyTo({
          center: e.lngLat,
          zoom: Math.min(map.getZoom() + 1.5, 19),
          duration: 600,
          essential: true,
        });
      });
    });

    map.on("moveend", pushViewport);

    // Suppress "Image X could not be loaded" warnings for icons referenced by
    // the base style's sprite that aren't bundled (e.g. POI icons like "office",
    // "gate", "swimming_pool"). Provide a 1×1 transparent fallback so MapLibre
    // stops retrying and logging.
    map.on("styleimagemissing", (e: { id: string }) => {
      if (!map.hasImage(e.id)) {
        map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      }
    });

    return () => {
      map.off("moveend", pushViewport);
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
  }, [screen]); // MapLibre init gated off — Cesium is primary

  // ── Placement mode: click on map to place a model ──────────────────────────
  const placementModeRef = useRef(false);
  const snapToRoadRef = useRef(true);
  const selectedModelRef = useRef<ModelType>("office");
  const placementRotationRef = useRef(0);
  const placingNameRef = useRef("");
  const customModelFileRef = useRef<File | null>(null);
  // Set to true by BuildingOverlay when a building is clicked — prevents placement
  const buildingHitRef = useRef(false);
  
  // Modal state for entering building details before placement
  const [showPlacementModal, setShowPlacementModal] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState<{ lng: number; lat: number } | null>(null);
  const [modalProjectName, setModalProjectName] = useState("");
  const [modalProjectType, setModalProjectType] = useState<"Municipal Project" | "Private Building" | "Agricultural Structure">("Municipal Project");
  const [modalDepartment, setModalDepartment] = useState<"MPDC" | "Engineering" | "Agriculture" | "Negosyo Center">("Engineering");
  const [modalStatus, setModalStatus] = useState<ProjectStatus>("Planned");
  const [modalProgress, setModalProgress] = useState(0);
  const [modalDescription, setModalDescription] = useState("");
  const [modalStartDate, setModalStartDate] = useState("");
  const [modalTargetEndDate, setModalTargetEndDate] = useState("");
  const [modalBudgetTotal, setModalBudgetTotal] = useState("");

  useEffect(() => { placementModeRef.current = placementMode; }, [placementMode]);
  useEffect(() => { snapToRoadRef.current = snapToRoad; }, [snapToRoad]);
  useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);
  useEffect(() => { placementRotationRef.current = placementRotation; }, [placementRotation]);
  useEffect(() => { placingNameRef.current = placingName; }, [placingName]);
  useEffect(() => { customModelFileRef.current = customModelFile; }, [customModelFile]);

  // Edit Mode: neon street overlay + pulse
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;

    const apply = () => {
      ensureEditStreetLayers(map);
      if (editMode) {
        setEditStreetVisible(map, true);
        startEditStreetPulse(map);
      } else {
        stopEditStreetPulse(map);
        setEditStreetVisible(map, false);
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);

    const onStyleData = () => {
      if (!editMode) return;
      ensureEditStreetLayers(map);
      setEditStreetVisible(map, true);
      startEditStreetPulse(map);
    };
    map.on("styledata", onStyleData);

    return () => {
      map.off("styledata", onStyleData);
      stopEditStreetPulse(map);
      if (map.getStyle()) {
        try {
          setEditStreetVisible(map, false);
        } catch {
          /* style may already be gone */
        }
      }
    };
  }, [mapInstance, editMode]);

  // Tear down street overlay when map instance is disposed
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;
    return () => {
      try {
        teardownEditStreetOverlay(map);
      } catch {
        /* ignore */
      }
    };
  }, [mapInstance]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = async (e: maplibregl.MapMouseEvent) => {
      if (!placementModeRef.current) return;
      // If BuildingOverlay consumed this click (building was hit), skip placement
      if (buildingHitRef.current) { buildingHitRef.current = false; return; }

      let { lng, lat } = e.lngLat;
      if (snapToRoadRef.current) {
        const snap = snapLngLatToRoad(map, lng, lat);
        if (snap.snapped) {
          lng = snap.lng;
          lat = snap.lat;
          const deg = Math.round(snap.bearingDeg);
          placementRotationRef.current = deg;
          setPlacementRotation(deg);
        }
      }

      openPlacementAt({ lng, lat });
    };

    map.on("click", handleClick);
    return () => { map.off("click", handleClick); };
  }, [mapRef.current]);

  /** Open the placement details modal at a clicked lat/lng (MapLibre or Cesium). */
  function openPlacementAt({ lng, lat }: { lng: number; lat: number }) {
    const pendingPin = pinProposalRef.current;
    if (pendingPin && currentRole === "MPDC") {
      void placeApprovedProposalAt(pendingPin, lng, lat, {
        kind: "pin",
        color: placementColor,
        coordinates: [{ lon: lng, lat }],
      });
      return;
    }

    setPendingPlacement({ lng, lat });
    const catalog = MODEL_CATALOG.find((m) => m.type === selectedModelRef.current);
    setModalProjectName(placingNameRef.current.trim() || `${catalog?.label ?? selectedModelRef.current}`);
    setModalProjectType(
      catalog?.category === "Agriculture" ? "Agricultural Structure" :
      catalog?.category === "Infrastructure" ? "Municipal Project" :
      catalog?.category === "Construction" ? "Municipal Project" : "Private Building"
    );
    setModalDepartment("Engineering");
    setModalStatus("Planned");
    setModalProgress(0);
    setModalDescription(catalog?.description || "");
    setShowPlacementModal(true);
  }

  function handlePlaceSketch(sketch: MapSketch) {
    const pendingPin = pinProposalRef.current;
    const first = sketch.coordinates[0];
    if (!first) return;
    if (pendingPin && currentRole === "MPDC") {
      void placeApprovedProposalAt(pendingPin, first.lon, first.lat, sketch);
      return;
    }
    // Engineer free placement: use sketch centroid / first point for the GLB modal.
    openPlacementAt({ lng: first.lon, lat: first.lat });
  }

  function startPinSite(proposal: PlanningProposal) {
    setPinProposal(proposal);
    pinProposalRef.current = proposal;
    setPlacingName(proposal.title);
    setSelectedModel("office");
    setModalDepartment(proposal.department);
    setPlacementTool("pin");
    setPlacementColor(MAP_SKETCH_COLORS[0]);
    setPlacementMode(true);
    setBlockRemoverMode(false);
    setEditMode(false);
    setSidebarCollapsed(true);
    setStreetViewMode(false);
    setScreen("app");
  }

  async function placeApprovedProposalAt(
    proposal: PlanningProposal,
    lng: number,
    lat: number,
    sketch?: MapSketch | null,
  ) {
    const now = new Date().toISOString();
    const dept = proposal.department;
    const mapSketch: MapSketch = sketch ?? {
      kind: "pin",
      color: placementColor,
      coordinates: [{ lon: lng, lat }],
    };
    const body = {
      name: proposal.title,
      modelType: "office" as ModelType,
      type: "Municipal Project" as const,
      department: dept,
      status: "Planned" as ProjectStatus,
      progress: 0,
      description: proposal.summary,
      barangay: proposal.barangay,
      fundingSource: "LGU",
      contractor:
        dept === "Engineering"
          ? "Municipal Engineering Office"
          : dept === "Agriculture"
            ? "Municipal Agriculture Office"
            : dept === "Negosyo Center"
              ? "Negosyo Center"
              : "Municipal Planning & Development Coordinator",
      location: { lat, lon: lng },
      rotation: 0,
      modelLocked: true,
      siteMarkerOnly: true,
      mapSketch,
      markerColor: mapSketch.color,
      lifecyclePhase: "Planning",
    };

    try {
      let linkedId: string;
      try {
        const res = await fetch(backendUrl("/api/projects"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { project } = await res.json();
        linkedId = project.id as string;
        addProjectToFirestore(project).catch(() => undefined);
      } catch {
        const fallback = {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `plan-${Date.now()}`,
          ...body,
          milestones: [],
          issues: [],
          photos: [],
          activityLog: [
            {
              at: now,
              message: `Site markup drawn by MPDC from approved proposal ${proposal.id}.`,
            },
          ],
          updatedAt: now,
          archivedAt: null,
        } as Project;
        linkedId = fallback.id;
        await addProjectToFirestore(fallback);
        setProjects((prev) => [fallback, ...prev]);
      }

      await updateProposal(proposal.id, {
        status: "approved",
        linkedProjectId: linkedId,
        location: { lat, lon: lng },
      });

      setPinProposal(null);
      pinProposalRef.current = null;
      setPlacementMode(false);
      cesiumMapRef.current?.flyToLonLat(lng, lat, 2500);
      window.alert(
        `Site markup saved for “${proposal.title}” (${mapSketch.kind}, no 3D model).`,
      );
    } catch (err) {
      console.error(err);
      window.alert("Failed to pin site. Please try again.");
    }
  }

  // Function to actually place the building after modal submission
  const handlePlaceBuilding = async () => {
    if (!pendingPlacement) return;

    const { lng, lat } = pendingPlacement;
    const now = new Date().toISOString();
    const fallbackProject: Project = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local-${Date.now()}`,
      name: modalProjectName,
      modelType: selectedModelRef.current,
      type: modalProjectType,
      department: modalDepartment,
      status: modalStatus,
      progress: modalProgress,
      description: modalDescription || "",
      startDate: modalStartDate || null,
      targetEndDate: modalTargetEndDate || null,
      budgetTotal: modalBudgetTotal ? Number(modalBudgetTotal) : null,
      location: { lat, lon: lng },
      rotation: placementRotationRef.current,
      lifecyclePhase: "Planning",
      archivedAt: null,
      milestones: [],
      issues: [],
      photos: [],
      activityLog: [{ at: now, message: "Project created from map placement." }],
      updatedAt: now,
    };

    try {
      // If custom model is selected and a file is provided, upload it first
      let customModelUrl: string | undefined;
      if (selectedModelRef.current === "custom" && customModelFileRef.current) {
        const file = customModelFileRef.current;
        const maxMb = 500;
        if (file.size > maxMb * 1024 * 1024) {
          alert(`Model is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum is ${maxMb}MB.`);
          return;
        }

        const formData = new FormData();
        formData.append("model", file);

        const uploadRes = await fetch(backendUrl("/api/upload-model"), {
          method: "POST",
          body: formData,
        });

        if (uploadRes.ok) {
          const data = await uploadRes.json();
          customModelUrl = data.url;
        } else {
          let detail = "";
          try {
            const errBody = await uploadRes.json();
            detail = errBody?.error ? `: ${errBody.error}` : "";
          } catch {
            detail = ` (HTTP ${uploadRes.status})`;
          }
          console.error("Failed to upload custom model", uploadRes.status, detail);
          alert(`Failed to upload custom model${detail}`);
          return;
        }
      }

      try {
        const res = await fetch(backendUrl("/api/projects"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: modalProjectName,
            modelType: selectedModelRef.current,
            type: modalProjectType,
            department: modalDepartment,
            status: modalStatus,
            progress: modalProgress,
            description: modalDescription,
            startDate: modalStartDate || undefined,
            targetEndDate: modalTargetEndDate || undefined,
            budgetTotal: modalBudgetTotal ? Number(modalBudgetTotal) : undefined,
            fundingSource: "LGU",
            contractor:
              modalDepartment === "Engineering"
                ? "Municipal Engineering Office"
                : modalDepartment === "Agriculture"
                  ? "Municipal Agriculture Office"
                  : modalDepartment || "LGU Implementing Office",
            location: { lat, lon: lng },
            rotation: placementRotationRef.current,
            customModelUrl,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Backend save failed: ${res.status}${errorText ? ` - ${errorText}` : ""}`);
        }

        const { project } = await res.json();
        addProjectToFirestore(project).catch((e) => console.warn("[Firestore] sync failed:", e));
      } catch (backendErr) {
        if (selectedModelRef.current === "custom") {
          throw backendErr;
        }

        const localProject: Project = customModelUrl
          ? { ...fallbackProject, customModelUrl }
          : fallbackProject;
        await addProjectToFirestore(localProject);
        setProjects((prev) => [localProject, ...prev]);
        console.warn("[Projects] Backend unavailable, saved placement directly to Firestore:", backendErr);
      }
      
      // Close modal and reset
      setShowPlacementModal(false);
      setPendingPlacement(null);
      setModalProjectName("");
      setModalDescription("");
      
      // Backend will emit projects:update via socket
    } catch (err) {
      console.error("Failed to place project:", err);
      const message =
        err instanceof Error && /Failed to fetch|Backend save failed/i.test(err.message)
          ? "Failed to reach the backend server on port 4000. Start the backend, or keep using standard models and the app will save directly to Firestore."
          : "Failed to place building. Please try again.";
      alert(message);
    }
  };

  // ESC key to close placement modal / cancel MPDC site pin
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showPlacementModal) {
        setShowPlacementModal(false);
        setPendingPlacement(null);
      }
      if (pinProposal) {
        setPinProposal(null);
        pinProposalRef.current = null;
        setPlacementMode(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [showPlacementModal, pinProposal]);

  function upsertGibsLayer(args: { layer: GibsLayerId; date: string; opacity: number; visible: boolean }) {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return;

    const { layer, date, opacity, visible } = args;
    const tileUrl = gibsWmtsTileUrl({ layer, date });

    // MapLibre raster sources do not consistently support setTiles across versions.
    // Recreate source+layer for reliable updates (prevents “stuck requesting old date”).
    if (map.getLayer("gibs-imerg-layer")) map.removeLayer("gibs-imerg-layer");
    if (map.getSource("gibs-imerg")) map.removeSource("gibs-imerg");

    map.addSource("gibs-imerg", {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 6,
    } as any);

    // Add above base map; below vectors if present.
    map.addLayer(
      {
        id: "gibs-imerg-layer",
        type: "raster",
        source: "gibs-imerg",
        paint: {
          "raster-opacity": visible ? opacity : 0,
          "raster-resampling": "linear",
        },
      } as any,
      map.getLayer("risk-fill") ? "risk-fill" : undefined
    );
  }

  async function resolveLatestGibsDate(layer: GibsLayerId, startDateIso: string) {
    // Probe backwards until a known tile exists. Keeps UI stable and avoids 404 spam.
    // We test a low zoom tile (z=1, x=0, y=0) for availability.
    const base = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi";
    const d = new Date(`${startDateIso}T00:00:00Z`);
    for (let i = 0; i < 14; i++) {
      const date = formatGibsDate(d);
      const url =
        base +
        `?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
        `&LAYER=${encodeURIComponent(layer)}` +
        `&STYLE=default` +
        `&TILEMATRIXSET=GoogleMapsCompatible_Level6` +
        `&TILEMATRIX=1&TILEROW=0&TILECOL=0` +
        `&FORMAT=image/png` +
        `&TIME=${encodeURIComponent(date)}`;
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (res.ok) return date;
      } catch {
        // ignore and continue
      }
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return null;
  }

  // Auto-resolve to latest available GIBS date (prevents persistent 404s).
  useEffect(() => {
    let cancelled = false;
    setGibsStatus("loading");
    resolveLatestGibsDate(gibsLayer, gibsDate)
      .then((date) => {
        if (cancelled) return;
        if (!date) {
          setGibsStatus("unavailable");
          return;
        }
        setGibsStatus("ok");
        if (date !== gibsDate) setGibsDate(date);
      })
      .catch(() => {
        if (cancelled) return;
        setGibsStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
    // Only when the user changes layer/date.
  }, [gibsLayer, gibsDate]);

  // Update NASA GIBS tiles when layer/date/opacity changes.
  useEffect(() => {
    upsertGibsLayer({
      layer: gibsLayer,
      date: gibsDate,
      opacity: gibsOpacity,
      visible: toggles.gibsPrecip && gibsStatus === "ok",
    });
  }, [gibsLayer, gibsDate, gibsOpacity, toggles.gibsPrecip, gibsStatus]);

  useEffect(() => {
    const socket = connectRealtime(BACKEND_URL);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("weather:update", (w) => setWeather(w));
    socket.on("risk:update", (z) => setRiskZones(z.zones));
    socket.on("projects:update", (p) => {
      setProjects(Array.isArray(p?.projects) ? p.projects : []);
    });
    socket.on("alerts:new", (a) => setAlerts((prev) => [a, ...prev].slice(0, 8)));
    socket.on("planning:update", () => {
      refreshPlanningNoticesRef.current();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Engineer Live Situation notifications (planning / botohan)
  useEffect(() => {
    if (currentRole !== "Engineer" || !currentSession) {
      setPlanningNotices([]);
      refreshPlanningNoticesRef.current = () => {};
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const list = await fetchProposalsOnce();
        if (cancelled) return;
        setPlanningNotices(buildEngineerPlanningNotices(list, currentSession));
      } catch (err) {
        console.warn("[Notices] Failed to load planning notifications:", err);
        if (!cancelled) setPlanningNotices([]);
      }
    };

    refreshPlanningNoticesRef.current = () => {
      void refresh();
    };
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      refreshPlanningNoticesRef.current = () => {};
    };
  }, [currentRole, currentSession]);

  const activePlanningNotices = useMemo(
    () => planningNotices.filter((n) => !dismissedNoticeIds.includes(n.id)),
    [planningNotices, dismissedNoticeIds],
  );
  const noticeUnreadCount = activePlanningNotices.length;

  function dismissNotice(id: string) {
    setDismissedNoticeIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id].slice(-80);
      try {
        localStorage.setItem(DISMISSED_NOTICES_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }

  function dismissAllNotices() {
    setDismissedNoticeIds((prev) => {
      const next = [...new Set([...prev, ...activePlanningNotices.map((n) => n.id)])].slice(-80);
      try {
        localStorage.setItem(DISMISSED_NOTICES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Heatmap engine (Zoom Earth feel): regenerate points from live signals + viewport.
  useEffect(() => {
    if (!viewport) return;
    if (!toggles.heatmap) return;

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // keep it smooth but lightweight
      if (now - last < 650) return;
      last = now;

      setHeatPoints(
        buildHeatmapPoints({
          bbox: viewport.bbox,
          zoom: viewport.zoom,
          metric: heatMetric,
          weather,
          riskZones,
          projects,
          nowMs: Date.now(),
        })
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewport, toggles.heatmap, heatMetric, weather, riskZones, projects]);

  // Push risk zones to Mapbox
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !riskZones) return;
    const src = map.getSource("riskZones") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(riskZones as any);
    map.setLayoutProperty("risk-fill", "visibility", toggles.risk ? "visible" : "none");
  }, [riskZones, toggles.risk]);

  // Push storm track to Mapbox
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !weather?.stormTrack) return;
    const src = map.getSource("stormTrack") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: toggles.stormTrack ? [weather.stormTrack] : [],
    } as any);
    map.setLayoutProperty("storm-line", "visibility", toggles.stormTrack ? "visible" : "none");
  }, [weather, toggles.stormTrack]);

  // Satellite imagery toggle
  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    if (!map) return;

    const applySatellite = () => {
      // Terrain toggles can reload the style; after reload, custom sources/layers
      // (like satellite) may be missing. Recreate them if needed.
      if (!map.getSource("satellite")) {
        try {
          map.addSource("satellite", {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "© Esri, Maxar, Earthstar Geographics",
          } as any);
        } catch {
          // ignore: source may be in-flight during style load
        }
      }

      if (!map.getLayer("satellite-layer") && map.getSource("satellite")) {
        try {
          map.addLayer(
            {
              id: "satellite-layer",
              type: "raster",
              source: "satellite",
              paint: { "raster-opacity": 0 },
            } as any,
            map.getLayer("3d-buildings")
              ? "3d-buildings"
              : map.getLayer("project-labels")
                ? "project-labels"
                : undefined
          );
        } catch {
          // ignore: layer may already exist or style is mid-reload
        }
      }

      if (map.getLayer("satellite-layer")) {
        // Fade in/out via opacity; night dims via daylightRasterScale
        map.setPaintProperty(
          "satellite-layer",
          "raster-opacity",
          toggles.satellite ? daylightRasterScale(sunLighting.pos) : 0,
        );
      }

      const opacity = toggles.satellite
        ? Math.min(buildingExtrusionOpacity, 0.4)
        : buildingExtrusionOpacity;
      applyBuildingExtrusionOpacity(map, opacity);
    };

    if (map.isStyleLoaded()) applySatellite();
    else map.once("style.load", applySatellite);
  }, [toggles.satellite, buildingExtrusionOpacity, mapInstance, sunLighting.pos]);

  // Keep fill-extrusion opacity synced with the slider (and after style reload).
  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    if (!map) return;

    const apply = () => {
      const opacity = toggles.satellite
        ? Math.min(buildingExtrusionOpacity, 0.4)
        : buildingExtrusionOpacity;
      applyBuildingExtrusionOpacity(map, opacity);
    };

    if (map.isStyleLoaded()) apply();
    map.on("load", apply);
    map.on("style.load", apply);

    return () => {
      map.off("load", apply);
      map.off("style.load", apply);
    };
  }, [mapInstance, buildingExtrusionOpacity, toggles.satellite]);

  // Google Street View mode — click map to open GSV in new tab
  const streetViewModeRef = useRef(false);
  useEffect(() => { streetViewModeRef.current = streetViewMode; }, [streetViewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!streetViewModeRef.current) return;
      const { lat, lng } = e.lngLat;
      const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
      window.open(url, "_blank");
    };

    map.on("click", handleClick);
    return () => { map.off("click", handleClick); };
  }, [mapInstance]);

  // Update cursor when street view mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = streetViewMode ? "crosshair" : "";
  }, [streetViewMode]);

  // Terrain (3D elevation) toggle with WebGL enhancements
  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    if (!map) return;

    const applyTerrain = () => {
      // setTerrain() can trigger a style reload in MapLibre; after that reload the
      // DEM source may not exist yet, so we defensively recreate it.
      if (!map.getSource("terrain-dem")) {
        try {
          const terrainSource = getTerrainSource("terrarium");
          map.addSource("terrain-dem", {
            type: "raster-dem",
            tiles: terrainSource.tiles,
            tileSize: terrainSource.tileSize,
            encoding: terrainSource.encoding as any,
            maxzoom: terrainSource.maxzoom,
          } as any);
        } catch {
          // ignore: source may be in-flight during style load
        }
      }

      try {
        if (toggles.satellite) {
          // Dynamic exaggeration based on zoom level for optimal visualization
          const currentZoom = map.getZoom();
          const exaggeration = calculateTerrainExaggeration(currentZoom);
          
          (map as any).setTerrain({ 
            source: "terrain-dem", 
            exaggeration: exaggeration 
          });
          map.easeTo({ pitch: 75, duration: 600 });
          
          // Show hillshade when terrain is enabled
          if (map.getLayer("hillshade")) {
            map.setLayoutProperty("hillshade", "visibility", "visible");
          }
        } else {
          (map as any).setTerrain(null);
          map.easeTo({ pitch: 30, duration: 600 });
          
          // Keep hillshade visible — solar time drives illumination on the DEM
          // even when the 3D terrain mesh is off
          if (map.getLayer("hillshade")) {
            map.setLayoutProperty("hillshade", "visibility", "visible");
          }
        }
      } catch {
        // ignore transient errors while style is reloading
      }
    };

    if (map.isStyleLoaded()) applyTerrain();
    else map.once("style.load", applyTerrain);

    // Update exaggeration on zoom change
    const handleZoom = () => {
      if (!toggles.satellite) return;
      const currentZoom = map.getZoom();
      const exaggeration = calculateTerrainExaggeration(currentZoom);
      try {
        (map as any).setTerrain({ 
          source: "terrain-dem", 
          exaggeration: exaggeration 
        });
      } catch {
        // ignore
      }
    };

    map.on("zoomend", handleZoom);
    return () => {
      map.off("zoomend", handleZoom);
    };
  }, [toggles.satellite, mapInstance]);

  // Keep project/municipal holes in the basemap building extrusion layer.
  useEffect(() => {
    const map = mapRef.current ?? mapInstance;
    if (!map) return;

    const OFFICE = { lat: 14.185435, lon: 121.509513 };

    const applyHoles = () => {
      if (!map.getLayer(BUILDING_EXTRUSION_LAYER)) return;

      const points = [
        OFFICE,
        ...(toggles.projects ? projects : [])
          .filter((p) => p?.location?.lon && p?.location?.lat)
          .map((p) => ({ lat: p.location.lat, lon: p.location.lon })),
      ];

      const halfM = 55;
      const rings = points.map(({ lat, lon }) => {
        const dLat = halfM / 111320;
        const dLon = halfM / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
        return [
          [lon - dLon, lat - dLat],
          [lon + dLon, lat - dLat],
          [lon + dLon, lat + dLat],
          [lon - dLon, lat + dLat],
          [lon - dLon, lat - dLat],
        ];
      });

      const exclusion = {
        type: "MultiPolygon" as const,
        coordinates: rings.map((ring) => [ring]),
      };

      const filter: any[] = [
        "all",
        ["!", ["within", exclusion]],
        [
          "!",
          [
            "in",
            ["downcase", ["to-string", ["coalesce", ["get", "name"], ""]]],
            [
              "literal",
              [
                "luisiana municipal hall",
                "municipal hall",
                "municipal office",
                "luisiana municipal office",
              ],
            ],
          ],
        ],
      ];

      try {
        map.setFilter(BUILDING_EXTRUSION_LAYER, filter as any);
      } catch (err) {
        console.warn("[Map] 3d-buildings hole filter failed:", err);
      }
    };

    if (map.isStyleLoaded()) applyHoles();
    map.on("style.load", applyHoles);
    return () => {
      map.off("style.load", applyHoles);
    };
  }, [projects, toggles.projects, mapInstance]);

  // Push project footprint dots.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const points = (toggles.projects ? projects : []).filter(
      (p) => p?.location?.lon && p?.location?.lat
    );

    const pointFeatures = points.map((p) => ({
      type: "Feature" as const,
      properties: { id: p.id, name: p.name, status: p.status },
      geometry: {
        type: "Point" as const,
        coordinates: [p.location.lon, p.location.lat],
      },
    }));

    const dots = map.getSource("project-footprints") as maplibregl.GeoJSONSource | undefined;
    dots?.setData({ type: "FeatureCollection", features: pointFeatures } as any);

    if (map.getLayer("project-labels")) {
      map.setLayoutProperty("project-labels", "visibility", toggles.projects ? "visible" : "none");
    }
  }, [projects, toggles.projects, mapInstance]);

  const riskSummary = useMemo(() => {
    const feats = riskZones?.features || [];
    const high = feats.filter((f) => f.properties.level === "HIGH").length;
    const mod = feats.filter((f) => f.properties.level === "MODERATE").length;
    const low = feats.filter((f) => f.properties.level === "LOW").length;
    return { high, mod, low, total: feats.length };
  }, [riskZones]);

  const activeHazardLegend = useMemo(
    () =>
      activeHazardFromToggles({
        hazardEil2010: toggles.hazardEil2010,
        hazardEq2014: toggles.hazardEq2014,
        hazardGsh2014: toggles.hazardGsh2014,
      }),
    [toggles.hazardEil2010, toggles.hazardEq2014, toggles.hazardGsh2014],
  );

  const staffOverlay =
    screen === "planning" ||
    screen === "documents" ||
    screen === "analytics" ||
    screen === "inventory" ||
    screen === "engagement";
  /**
   * Once the globe has been created, never tear it down in-SPA.
   * Deferred Cesium destroy after logout painted Landing then white-screened.
   */
  const showMapShell = screen === "app" || staffOverlay || mapHold;
  const parkMapShell = showMapShell && screen !== "app";

  useEffect(() => {
    if (screen === "app" || staffOverlay) setMapHold(true);
    if (screen === "citizen") setCitizenHold(true);
  }, [screen, staffOverlay]);

  function goHome() {
    clearSessionCookie();
    setCurrentSession(null);
    setScreen("landing");
  }

  const showCitizenShell = screen === "citizen" || citizenHold;
  const parkCitizenShell = showCitizenShell && screen !== "citizen";

  return (
    <div
      className={`appShell${
        sidebarCollapsed || screen !== "app" ? " sidebar-collapsed" : ""
      }${screen !== "app" ? " appShell--fullpage" : ""}`}
    >
      {/* Landing page */}
      {screen === "landing" && (
        <LandingPage
          onEnter={() => setScreen("login")}
          onPublicPortal={() => {
            setCurrentSession(sessionForRole("Viewer"));
            setScreen("citizen");
          }}
        />
      )}

      {/* Login screen */}
      {screen === "login" && (
        <LoginScreen
          onLogin={(session) => {
            setCurrentSession(session);
            setScreen("app");
          }}
          onBack={() => setScreen("landing")}
        />
      )}

      {showCitizenShell && (
        <div
          className={parkCitizenShell ? "app-shell-parked" : undefined}
          aria-hidden={parkCitizenShell}
          style={parkCitizenShell ? undefined : { position: "relative", zIndex: 10000 }}
        >
          <CitizenPortal
            onBack={goHome}
            onOpenLiveMap={() => {
              setCurrentSession(sessionForRole("Viewer"));
              setSidebarCollapsed(false);
              setScreen("app");
            }}
          />
        </div>
      )}

      {/* Inventory / Planning / Documents / Analytics — overlays; map stays parked underneath */}
      {screen === "inventory" && (
        <InventoryPage
          onBack={() => setScreen("app")}
          backendProjects={Array.isArray(projects) ? projects : []}
          currentRole={currentRole}
        />
      )}

      {screen === "planning" && currentRole !== "Viewer" && (
        <PlanningPage
          onBack={() => setScreen("app")}
          session={currentSession}
          onPinSite={currentRole === "MPDC" ? startPinSite : undefined}
        />
      )}

      {screen === "documents" && currentRole !== "Viewer" && (
        <DocumentsPage onBack={() => setScreen("app")} session={currentSession} />
      )}

      {screen === "analytics" && currentRole !== "Viewer" && (
        <AnalyticsPage onBack={() => setScreen("app")} projects={Array.isArray(projects) ? projects : []} />
      )}

      {screen === "engagement" && roleConfig?.canSeeEngagement && (
        <EngagementPage
          onBack={() => setScreen("app")}
          onFlyTo={(lon, lat) => {
            window.setTimeout(() => {
              cesiumMapRef.current?.flyToLonLat(lon, lat, 2500);
            }, 100);
          }}
        />
      )}

      {/* Main map shell — stays alive while staff overlays are open */}
      {showMapShell && (
      <div
        className={parkMapShell ? "app-shell-parked" : undefined}
        aria-hidden={parkMapShell}
      >
      <>
      <div className="mapWrap">
        <CesiumMap
          ref={cesiumMapRef}
          solarHour={solarHour}
          sunAzimuthDeg={sunAzimuthDeg}
          buildingBlocksVisible={toggles.buildingBlocks}
          blockRemoverActive={
            (blockRemoverMode && currentRole === "Engineer") || eraseBlocksActive
          }
          terrainEnabled={toggles.satellite}
          satellite={toggles.satellite}
          hazardOverlays={{
            eil2010: toggles.hazardEil2010,
            eq2014: toggles.hazardEq2014,
            gsh2014: toggles.hazardGsh2014,
          }}
          mapSettings={mapSettings}
          eonetEnabled={eonetEnabled}
          eonetEvents={eonetEvents}
          tropicalEnabled={tropicalEnabled}
          tropicalSystems={tropicalSystems}
          projects={Array.isArray(projects) ? projects : []}
          visible
          placementMode={
            (placementMode && currentRole === "Engineer") ||
            (placementMode && currentRole === "MPDC" && Boolean(pinProposal))
          }
          placementTool={placementTool}
          placementColor={placementColor}
          onPlaceClick={openPlacementAt}
          onPlaceSketch={handlePlaceSketch}
          readOnly={currentRole === "Viewer"}
          canManipulateModels={currentRole === "Engineer"}
          canAddPhotos={currentRole === "MPDC" || currentRole === "Engineer"}
          onPhotosChange={(projectId, photos) => {
            setProjects((prev) =>
              prev.map((p) => (p.id === projectId ? { ...p, photos } : p)),
            );
          }}
          gibs={{
            enabled: toggles.gibsPrecip && gibsStatus === "ok",
            layer: gibsLayer,
            date: gibsDate,
            opacity: gibsOpacity,
          }}
          onDeleteBuilding={
            currentRole === "Engineer"
              ? async (projectId) => {
                  try {
                    await fetch(backendUrl(`/api/projects/${projectId}`), { method: "DELETE" });
                  } catch (err) {
                    console.error("Failed to delete project:", err);
                  }
                }
              : undefined
          }
        />

        <ProjectChat />

        {activeHazardLegend && screen === "app" && (
          <HazardLegend hazard={activeHazardLegend} variant="map" />
        )}

        {/* Google Street View mode indicator */}
        {streetViewMode && (
          <div style={{
            position: "absolute",
            top: 70,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            background: "rgba(0,0,0,0.85)",
            color: "#fff",
            padding: "8px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: '"Chakra Petch", sans-serif',
            display: "flex",
            alignItems: "center",
            gap: 10,
            border: "1px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(8px)",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FBBC05" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="3"/><path d="M12 8v4"/><path d="M6.5 16a5.5 5.5 0 0 1 11 0"/>
              <path d="M4 22l2-6"/><path d="M20 22l-2-6"/>
            </svg>
            <span>Click anywhere on the map to open <b>Google Street View</b></span>
            <button
              onClick={() => setStreetViewMode(false)}
              style={{
                cursor: "pointer",
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 4,
                color: "#fff",
                padding: "3px 12px",
                fontSize: 11,
                fontWeight: 600,
                marginLeft: 4,
              }}
            >
              Exit
            </button>
          </div>
        )}

        {placementToolbarOpen ? (
          <div
            className="placement-draw-toolbar"
            style={{
              position: "absolute",
              top: 70,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 12,
              background: "var(--cream)",
              color: "var(--ink)",
              padding: "10px 12px",
              border: "2px solid var(--ink)",
              boxShadow: "4px 4px 0 var(--shadow-accent)",
              fontSize: 12,
              fontFamily: '"Chakra Petch", sans-serif',
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxWidth: "min(560px, calc(100vw - 24px))",
              minWidth: "min(320px, calc(100vw - 24px))",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ lineHeight: 1.35, flex: 1, minWidth: 140 }}>
                {pinProposal ? (
                  <>
                    <b>Draw site</b> for <b>{pinProposal.title}</b> — pin / draw / area / erase blocks
                  </>
                ) : (
                  <>
                    <b>Place tools</b> — pin, draw, color, or delete OSM blocks
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPinProposal(null);
                  pinProposalRef.current = null;
                  setPlacementMode(false);
                  setBlockRemoverMode(false);
                  setPlacementTool("pin");
                  cesiumMapRef.current?.clearSketch();
                }}
                style={{
                  cursor: "pointer",
                  flexShrink: 0,
                  background: "var(--cream-deep)",
                  border: "2px solid var(--ink)",
                  color: "var(--ink)",
                  padding: "6px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {(
                [
                  ["pin", "Pin"],
                  ["line", "Draw"],
                  ["area", "Area"],
                  ["erase", "Delete blocks"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPlacementTool(id);
                    cesiumMapRef.current?.clearSketch();
                    if (id === "erase") {
                      setBlockRemoverMode(true);
                    } else {
                      setBlockRemoverMode(false);
                    }
                  }}
                  style={{
                    cursor: "pointer",
                    padding: "6px 10px",
                    fontWeight: 700,
                    border: "2px solid var(--ink)",
                    background:
                      placementTool === id
                        ? id === "erase"
                          ? "rgba(255,77,79,0.35)"
                          : "var(--seed)"
                        : "var(--cream-deep)",
                    color: "var(--ink)",
                  }}
                >
                  {label}
                </button>
              ))}
              {placementTool !== "erase" && (
                <>
                  <span style={{ width: 1, height: 22, background: "var(--stroke)", margin: "0 4px" }} />
                  {MAP_SKETCH_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      aria-label={`Color ${c}`}
                      onClick={() => setPlacementColor(c)}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 0,
                        cursor: "pointer",
                        background: c,
                        border:
                          placementColor === c
                            ? "3px solid var(--ink)"
                            : "2px solid rgba(0,0,0,0.35)",
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={placementColor}
                    aria-label="Custom color"
                    onChange={(e) => setPlacementColor(e.target.value)}
                    style={{
                      width: 28,
                      height: 22,
                      padding: 0,
                      border: "2px solid var(--ink)",
                      cursor: "pointer",
                    }}
                  />
                </>
              )}
            </div>

            {placementTool === "erase" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>
                  Click gray OSM building blocks to remove them from the map.
                </span>
                <button
                  type="button"
                  onClick={() => cesiumMapRef.current?.restoreRemovedBlocks()}
                  style={{
                    cursor: "pointer",
                    padding: "5px 10px",
                    border: "2px solid var(--ink)",
                    background: "var(--cream-deep)",
                    fontWeight: 700,
                  }}
                >
                  Restore all blocks
                </button>
              </div>
            )}

            {placementTool === "line" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>
                  Hold and drag to draw. Release pauses — press Finish to save.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    cesiumMapRef.current?.undoSketchVertex();
                  }}
                  style={{
                    cursor: "pointer",
                    padding: "5px 8px",
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    fontWeight: 600,
                  }}
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    cesiumMapRef.current?.clearSketch();
                  }}
                  style={{
                    cursor: "pointer",
                    padding: "5px 8px",
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    fontWeight: 600,
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ok = cesiumMapRef.current?.finishSketch() ?? false;
                    if (!ok) {
                      window.alert("Draw a longer stroke first (need at least 2 points).");
                    }
                  }}
                  style={{
                    cursor: "pointer",
                    padding: "5px 10px",
                    border: "2px solid var(--ink)",
                    background: "var(--seed)",
                    fontWeight: 800,
                  }}
                >
                  Finish
                </button>
              </div>
            )}

            {placementTool === "area" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>
                  Click map to add points (≥3). Double-click last point or Finish.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    cesiumMapRef.current?.undoSketchVertex();
                  }}
                  style={{
                    cursor: "pointer",
                    padding: "5px 8px",
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    fontWeight: 600,
                  }}
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    cesiumMapRef.current?.clearSketch();
                  }}
                  style={{
                    cursor: "pointer",
                    padding: "5px 8px",
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    fontWeight: 600,
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ok = cesiumMapRef.current?.finishSketch() ?? false;
                    if (!ok) {
                      window.alert("Need at least 3 points for an area.");
                    }
                  }}
                  style={{
                    cursor: "pointer",
                    padding: "5px 10px",
                    border: "2px solid var(--ink)",
                    background: "var(--seed)",
                    fontWeight: 800,
                  }}
                >
                  Finish
                </button>
              </div>
            )}
          </div>
        ) : null}

        <div className="topBar">
          <div className="topBar-brand">
            <div className="topBar-brand-text">
              <div className="brand">
                INFA-TRACK <span className="brand-place">Luisiana</span>
              </div>
              <div className="sub">Real-Time GIS Infrastructure & Disaster Monitoring</div>
            </div>
          </div>
          <div className="topBar-toolbar">
            {roleConfig && (
              <div className="chip chip-role" style={{ borderColor: `${roleConfig.color}50`, color: roleConfig.color, fontWeight: 600 }}>
                {roleConfig.label}
              </div>
            )}
            <div className="chip chip-live">
              <span className="dot" style={{ background: connected ? "var(--accent)" : "rgba(255,77,79,0.9)" }} />
              {connected ? "Live" : "Offline"}
            </div>
            <div className="chip chip-risk topBar-hide-sm">
              Risk:{" "}
              <span style={{ color: topRisk.level === "HIGH" ? "var(--danger)" : topRisk.level === "MODERATE" ? "var(--warn)" : "var(--safe)" }}>
                {topRisk.level}
              </span>
            </div>
            <div className="chip chip-updates topBar-hide-mobile">Updates: 5s</div>
          </div>
          <div className="topBar-actions-primary">
            {roleConfig?.canSeePlanning && currentRole !== "Viewer" && (
              <button
                type="button"
                className="topBar-exit"
                style={{
                  background: "linear-gradient(135deg, rgba(36,92,58,0.22), rgba(61,155,95,0.18))",
                  borderColor: "rgba(36,92,58,0.45)",
                }}
                onClick={() => setScreen("planning")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" />
                  <path d="M9 12h6M9 16h4" />
                </svg>
                <span className="topBar-exit-full">Planning</span>
                <span className="topBar-exit-short">Plan</span>
              </button>
            )}
            {currentRole && currentRole !== "Viewer" && (
              <button
                type="button"
                className="topBar-exit"
                style={{
                  background: "linear-gradient(135deg, rgba(120,90,40,0.2), rgba(180,140,60,0.15))",
                  borderColor: "rgba(140,110,50,0.45)",
                }}
                onClick={() => setScreen("documents")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <span className="topBar-exit-full">Documents</span>
                <span className="topBar-exit-short">Docs</span>
              </button>
            )}
            {currentRole && currentRole !== "Viewer" && (
              <button
                type="button"
                className="topBar-exit"
                style={{
                  background: "linear-gradient(135deg, rgba(36,92,58,0.18), rgba(108,142,191,0.2))",
                  borderColor: "rgba(60,100,80,0.45)",
                }}
                onClick={() => setScreen("analytics")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <span className="topBar-exit-full">Analytics</span>
                <span className="topBar-exit-short">Stats</span>
              </button>
            )}
            {roleConfig?.canSeeEngagement && (
              <button
                type="button"
                className="topBar-exit"
                style={{
                  background: "linear-gradient(135deg, rgba(36,92,58,0.2), rgba(212,160,23,0.18))",
                  borderColor: "rgba(36,92,58,0.45)",
                }}
                onClick={() => setScreen("engagement")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span className="topBar-exit-full">Engagement</span>
                <span className="topBar-exit-short">Engage</span>
              </button>
            )}
            {currentRole !== "Negosyo Center" && currentRole !== "Viewer" && (
              <button
                type="button"
                className="topBar-exit"
                style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))", borderColor: "rgba(59,130,246,0.4)" }}
                onClick={() => setScreen("inventory")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>
                <span className="topBar-exit-full">Inventory</span>
                <span className="topBar-exit-short">Inv</span>
              </button>
            )}
            <ThemeToggle iconOnly />
            {currentRole === "Viewer" && (
              <button
                type="button"
                className="topBar-exit"
                style={{
                  background: "linear-gradient(135deg, rgba(36,92,58,0.2), rgba(212,160,23,0.18))",
                  borderColor: "rgba(36,92,58,0.45)",
                }}
                onClick={() => setScreen("citizen")}
              >
                <span className="topBar-exit-full">Portal</span>
                <span className="topBar-exit-short">Portal</span>
              </button>
            )}
            {currentRole && (
              <button
                type="button"
                className="topBar-exit"
                onClick={() => {
                  goHome();
                }}
              >
                <span className="topBar-exit-full">{currentRole === "Viewer" ? "Exit Map" : "Sign Out"}</span>
                <span className="topBar-exit-short">{currentRole === "Viewer" ? "Exit" : "Out"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Sun bearing dial + time — one control for Cesium light/shadows */}
        <div className="solar-map-controls" title="Sun bearing & time (Luisiana)">
          <div className="solar-azimuth-wrap">
            <div className="solar-map-slider-label">
              <span>Sun</span>
              <span className="solar-map-slider-time">
                {Math.round(sunAzimuthDeg)}°
                {!sunLighting.isDaylight ? " · night" : ""}
              </span>
            </div>
            <SunAzimuthDial value={sunAzimuthDeg} onChange={setSunAzimuthDeg} size={108} />
            <div className="solar-azimuth-time">
              <div className="solar-map-slider-label">
                <span>Time</span>
                <span className="solar-map-slider-time">{formatSolarHour(solarHour)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={24}
                step={0.25}
                value={solarHour}
                aria-label="Solar time of day"
                onChange={(e) => setSolarHourAndSyncAzimuth(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* ── Map Controls ── */}
        <div className="map-controls">
          <button className="map-ctrl-btn" title="Zoom In (=)" type="button" onClick={() => cesiumMapRef.current?.zoomIn()}>+</button>
          <button className="map-ctrl-btn" title="Zoom Out (-)" type="button" onClick={() => cesiumMapRef.current?.zoomOut()}>−</button>
          <div className="map-ctrl-divider" />
          <button
            className="map-ctrl-btn"
            title="Fly to Luisiana"
            type="button"
            onClick={() => cesiumMapRef.current?.flyHome()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </button>
          <button
            className="map-ctrl-btn"
            title="Toggle Tilt"
            type="button"
            onClick={() => cesiumMapRef.current?.toggleTilt()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20 L12 4 L22 20"/>
              <line x1="2" y1="20" x2="22" y2="20"/>
            </svg>
          </button>
          {currentRole === "Engineer" && (
            <>
              <div className="map-ctrl-divider" />
              <button
                className={`map-ctrl-btn${blockRemoverMode ? " is-active" : ""}`}
                title={blockRemoverMode ? "Block remover ON — click a building to delete" : "Remove 3D block"}
                type="button"
                aria-pressed={blockRemoverMode}
                onClick={() => {
                  setBlockRemoverMode((v) => !v);
                  if (!blockRemoverMode) setPlacementMode(false);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </>
          )}
        </div>

      </div>

      <button
        type="button"
        className={`sidePanel-edgeToggle${sidebarCollapsed ? " is-collapsed" : ""}${
          currentRole === "Engineer" && noticeUnreadCount > 0 ? " has-badge" : ""
        }`}
        aria-label={sidebarCollapsed ? "Expand side panel" : "Collapse side panel"}
        title={
          sidebarCollapsed
            ? noticeUnreadCount > 0
              ? `Expand panel · ${noticeUnreadCount} notification${noticeUnreadCount === 1 ? "" : "s"}`
              : "Expand panel"
            : "Collapse panel"
        }
        onClick={() => setSidebarCollapsed((v) => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {sidebarCollapsed
            ? <polyline points="15 18 9 12 15 6" />
            : <polyline points="9 18 15 12 9 6" />}
        </svg>
        {currentRole === "Engineer" && noticeUnreadCount > 0 && (
          <span className="sidePanel-edgeBadge" aria-hidden>{noticeUnreadCount > 9 ? "9+" : noticeUnreadCount}</span>
        )}
      </button>

      <aside className={`sidePanel${sidebarCollapsed ? " is-collapsed" : ""}`} aria-hidden={sidebarCollapsed}>
        <div className="sidePanel-head">
          <div className="sectionTitle">
            Live Situation Panel
            {currentRole === "Engineer" && noticeUnreadCount > 0 && (
              <span className="sidePanel-titleBadge" aria-label={`${noticeUnreadCount} notifications`}>
                {noticeUnreadCount}
              </span>
            )}
          </div>
          <button
            type="button"
            className="sidePanel-collapseBtn"
            aria-label="Collapse side panel"
            title="Collapse panel"
            onClick={() => setSidebarCollapsed(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="sidebar-tabs">
          {currentRole === "Engineer" && (
            <button
              type="button"
              className={`sidebar-tab${sidebarTab === "notify" ? " active" : ""}`}
              onClick={() => setSidebarTab("notify")}
            >
              Notify
              {noticeUnreadCount > 0 && (
                <span className="sidebar-tab-badge">{noticeUnreadCount > 9 ? "9+" : noticeUnreadCount}</span>
              )}
            </button>
          )}
          {(roleConfig?.canSeeWeather || roleConfig?.canSeeLayers) && (
            <button type="button" className={`sidebar-tab${sidebarTab === "climate" ? " active" : ""}`} onClick={() => setSidebarTab("climate")}>Climate</button>
          )}
          {roleConfig?.canSeeLayers && (
            <button type="button" className={`sidebar-tab${sidebarTab === "layers" ? " active" : ""}`} onClick={() => setSidebarTab("layers")}>Layers</button>
          )}
          {roleConfig?.canSeeRisk && (
            <button type="button" className={`sidebar-tab${sidebarTab === "risk" ? " active" : ""}`} onClick={() => setSidebarTab("risk")}>Risk</button>
          )}
          {roleConfig?.canSeeProjects && (
            <button type="button" className={`sidebar-tab${sidebarTab === "projects" ? " active" : ""}`} onClick={() => setSidebarTab("projects")}>Projects</button>
          )}
          {roleConfig?.canSeeLayers && (
            <button type="button" className={`sidebar-tab${sidebarTab === "events" ? " active" : ""}`} onClick={() => setSidebarTab("events")}>Events</button>
          )}
        </div>

        {currentRole === "Viewer" && (
          <div className="card viewer-banner" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 4 }}>Public Portal · Live Map</div>
            <p style={{ margin: 0, fontSize: 11, color: "var(--muted2)", lineHeight: 1.5 }}>
              View-only map with climate, layers, risk, and projects. Use <strong>Portal</strong> in the top bar for reporting, feedback, and transparency.
            </p>
          </div>
        )}

        {/* Tab Content */}
        <div className="sidePanel-body">

        {/* ── Engineer: Notifications ── */}
        {sidebarTab === "notify" && currentRole === "Engineer" && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div className="sectionTitle" style={{ margin: 0 }}>
                Notifications
              </div>
              {activePlanningNotices.length > 0 && (
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ fontSize: 11, padding: "4px 8px" }}
                  onClick={dismissAllNotices}
                >
                  Clear all
                </button>
              )}
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
              Planning &amp; botohan items for Engineering. Live updates when the committee workspace changes.
            </p>
            {activePlanningNotices.length ? (
              <div className="miniList">
                {activePlanningNotices.map((n) => (
                  <div
                    key={n.id}
                    className={`alert notice-card notice-${n.kind}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      dismissNotice(n.id);
                      setScreen("planning");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        dismissNotice(n.id);
                        setScreen("planning");
                      }
                    }}
                  >
                    <div className="t">{n.title}</div>
                    <div className="m">{n.message}</div>
                    <div className="meta">
                      Updated {formatAgo(n.at)} · Open Planning
                      <button
                        type="button"
                        className="notice-dismiss"
                        aria-label="Dismiss notification"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissNotice(n.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card" style={{ color: "var(--muted)", fontSize: 13 }}>
                No open notifications. New botohan, returns, and Engineering assignments will show up here.
              </div>
            )}
            {roleConfig?.canSeeAlerts && alerts.length > 0 && (
              <>
                <div className="sectionTitle" style={{ marginTop: 16, marginBottom: 8 }}>
                  Risk alerts
                </div>
                <div className="miniList">
                  {alerts.slice(0, 3).map((a) => (
                    <div key={a.id} className="alert">
                      <div className="t">{a.title}</div>
                      <div className="m">{a.message}</div>
                      <div className="meta">Triggered: {formatAgo(a.triggeredAt)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Negosyo Center: Business Permit Panel ── */}
        {roleConfig?.canSeeBusinessPermits && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>Business Permit &amp; Licensing</div>
            <div className="grid2">
              <div className="stat">
                <div className="v" style={{ color: "var(--warn)" }}>{projects.filter(p => p.department === "Negosyo Center" && p.status === "Ongoing").length}</div>
                <div className="l">Pending Permits</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--safe)" }}>{projects.filter(p => p.department === "Negosyo Center" && p.status === "Completed").length}</div>
                <div className="l">Approved</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--muted)" }}>{projects.filter(p => p.department === "Negosyo Center" && p.status === "Planned").length}</div>
                <div className="l">For Review</div>
              </div>
              <div className="stat">
                <div className="v">{projects.filter(p => p.department === "Negosyo Center").length}</div>
                <div className="l">Total Applications</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Recent Applications</div>
              <div className="miniList">
                {projects.filter(p => p.department === "Negosyo Center").slice(0, 5).map(p => (
                  <div key={p.id} className="proj">
                    <div className="n">{p.name}</div>
                    <div className="s">
                      <span style={{ color: p.status === "Completed" ? "var(--safe)" : p.status === "Ongoing" ? "var(--warn)" : "var(--muted)" }}>
                      {p.status === "Completed"
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconCheck /> Approved</span>
                        : p.status === "Ongoing"
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconClock /> Pending</span>
                        : p.status === "Planned"
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconClipboard /> For Review</span>
                        : <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconClipboard /> {p.status}</span>
                      }
                      </span>
                      <span>{p.progress}%</span>
                    </div>
                    <div className="bar"><div style={{ width: `${p.progress}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Layers Tab ── */}
        {sidebarTab === "layers" && roleConfig?.canSeeLayers && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="sectionTitle" style={{ marginBottom: 8 }}>
            Layers (LGU-Friendly Toggles)
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>
            3D tilt uses Map Settings draw distance around Luisiana — zoom out anytime for the full globe.
          </div>

          <div className="sectionTitle" style={{ marginBottom: 8, marginTop: 4, fontSize: 13 }}>
            Map Settings
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>
            Tune performance and view. Saved on this device.
          </div>

          <div
            className="extrusion-opacity-control"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginBottom: 10,
              paddingLeft: 2,
            }}
          >
            <span className="pill">Draw distance</span>
            <input
              type="range"
              min={5}
              max={50}
              step={1}
              value={mapSettings.drawDistanceKm}
              aria-label="3D draw distance in kilometers"
              onChange={(e) =>
                setMapSettings((s) => ({ ...s, drawDistanceKm: Number(e.target.value) }))
              }
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 40 }}>
              {mapSettings.drawDistanceKm} km
            </span>
          </div>

          <div style={{ marginBottom: 10, paddingLeft: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span className="pill">Terrain quality</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {mapSettings.terrainQuality === "low"
                  ? "Fastest"
                  : mapSettings.terrainQuality === "high"
                    ? "Sharpest"
                    : "Balanced"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["low", "medium", "high"] as TerrainQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setMapSettings((s) => ({ ...s, terrainQuality: q }))}
                  style={{
                    cursor: "pointer",
                    borderRadius: 2,
                    padding: "6px 10px",
                    fontSize: 12,
                    textTransform: "capitalize",
                    background: mapSettings.terrainQuality === q ? "var(--seed)" : "var(--cream-ink)",
                    color: "var(--ink)",
                    fontWeight: 700,
                    border:
                      mapSettings.terrainQuality === q ? "2px solid var(--ink)" : "1px solid var(--stroke)",
                    boxShadow: mapSettings.terrainQuality === q ? "2px 2px 0 var(--ink)" : "none",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="toggleRow">
            <div>
              <label>Shadows</label>
              <div className="hint">Sun shadows on terrain &amp; models (day only)</div>
            </div>
            <div
              className={`switch ${mapSettings.shadowsEnabled ? "on" : ""}`}
              role="switch"
              aria-checked={mapSettings.shadowsEnabled}
              onClick={() => setMapSettings((s) => ({ ...s, shadowsEnabled: !s.shadowsEnabled }))}
            />
          </div>

          <div style={{ marginBottom: 10, paddingLeft: 2, opacity: mapSettings.shadowsEnabled ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span className="pill">Shadow quality</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {mapSettings.shadowQuality === "low"
                  ? "250 m · 512"
                  : mapSettings.shadowQuality === "high"
                    ? "1000 m · 2048"
                    : "500 m · 1024"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["low", "medium", "high"] as ShadowQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setMapSettings((s) => ({ ...s, shadowQuality: q }))}
                  style={{
                    cursor: "pointer",
                    borderRadius: 2,
                    padding: "6px 10px",
                    fontSize: 12,
                    textTransform: "capitalize",
                    background: mapSettings.shadowQuality === q ? "var(--seed)" : "var(--cream-ink)",
                    color: "var(--ink)",
                    fontWeight: 700,
                    border:
                      mapSettings.shadowQuality === q ? "2px solid var(--ink)" : "1px solid var(--stroke)",
                    boxShadow: mapSettings.shadowQuality === q ? "2px 2px 0 var(--ink)" : "none",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="toggleRow">
            <div>
              <label>Horizon fog</label>
              <div className="hint">Fades far terrain in 3D tilt (helps FPS)</div>
            </div>
            <div
              className={`switch ${mapSettings.fogEnabled ? "on" : ""}`}
              role="switch"
              aria-checked={mapSettings.fogEnabled}
              onClick={() => setMapSettings((s) => ({ ...s, fogEnabled: !s.fogEnabled }))}
            />
          </div>

          <button
            type="button"
            className="btn"
            style={{ fontSize: 11, padding: "4px 8px", marginBottom: 12 }}
            onClick={() => setMapSettings({ ...DEFAULT_MAP_SETTINGS })}
          >
            Reset map settings
          </button>

          {(
            [
              {
                k: "heatmap",
                title: "Heatmap",
                hint: "Animated intensity (Blue→Yellow→Red)",
              },
              { k: "weather", title: "Weather Overlay", hint: "Cloud field + rainfall feel" },
              { k: "stormTrack", title: "Storm Tracking", hint: "Drift line based on wind" },
              { k: "projects", title: "Infrastructure Projects", hint: "GLB models on map" },
              { k: "buildingBlocks", title: "3D Blocks", hint: "Luisiana OSM building extrusions" },
            ] as const
          ).map((row) => (
            <div key={row.k} className="toggleRow">
              <div>
                <label>{row.title}</label>
                <div className="hint">{row.hint}</div>
              </div>
              <div
                className={`switch ${toggles[row.k] ? "on" : ""}`}
                role="switch"
                aria-checked={toggles[row.k]}
                onClick={() => setToggles((t) => ({ ...t, [row.k]: !t[row.k] }))}
              />
            </div>
          ))}

          {currentRole !== "Viewer" && (
            <div style={{ marginBottom: 10, paddingLeft: 2 }}>
              <button
                type="button"
                className="btn"
                style={{ fontSize: 11, padding: "4px 8px" }}
                title="Restore all deleted OSM blocks"
                onClick={() => cesiumMapRef.current?.restoreRemovedBlocks()}
              >
                Restore blocks
              </button>
            </div>
          )}

          <div
            className="extrusion-opacity-control"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginBottom: 10,
              paddingLeft: 2,
            }}
          >
            <span className="pill">GLB Models</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={glbModelsOpacity}
              aria-label="Project GLB model opacity"
              onChange={(e) => {
                setGlbModelsOpacity(Number(e.target.value));
              }}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 35 }}>
              {Math.round(glbModelsOpacity * 100)}%
            </span>
          </div>

          <div className="solar-time-control" style={{ marginBottom: 12, paddingLeft: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span className="pill">Sun</span>
              <span style={{ fontSize: 11, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(sunAzimuthDeg)}° · {formatSolarHour(solarHour)}
                {sunLighting.isDaylight ? "" : " · night"}
              </span>
            </div>
            <div className="solar-layers-bearing">
              <SunAzimuthDial value={sunAzimuthDeg} onChange={setSunAzimuthDeg} size={112} />
              <div className="solar-azimuth-time" style={{ flex: 1, minWidth: 0 }}>
                <div className="solar-map-slider-label">
                  <span>Time</span>
                  <span className="solar-map-slider-time">{formatSolarHour(solarHour)}</span>
                </div>
                <input
                  type="range"
                  className="solar-hour-slider"
                  min={0}
                  max={24}
                  step={0.25}
                  value={solarHour}
                  aria-label="Time of day for solar lighting"
                  onChange={(e) => setSolarHourAndSyncAzimuth(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
                <div className="hint" style={{ marginTop: 6 }}>
                  Dial = bearing (shadows). Slider = sun height / time of day.
                </div>
              </div>
            </div>
          </div>

          <div className="toggleRow" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <label>Heatmap Mode</label>
              <div className="hint">What the heatmap represents</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {(
                  [
                    ["combined", "Combined"],
                    ["rainfall", "Rainfall"],
                    ["landslide", "Landslide"],
                    ["infrastructure", "Infrastructure"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setHeatMetric(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 2,
                      padding: "6px 10px",
                      fontSize: 12,
                      background: heatMetric === k ? "var(--seed)" : "var(--cream-ink)",
                      color: "var(--ink)",
                      fontWeight: 700,
                      border: heatMetric === k ? "2px solid var(--ink)" : "1px solid var(--stroke)",
                      boxShadow: heatMetric === k ? "2px 2px 0 var(--ink)" : "none",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: "0 0 auto", textAlign: "right" }}>
              <span className="pill">Cool→Hot</span>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted2)" }}>
                {heatMetric === "rainfall"
                  ? "Rain intensity"
                  : heatMetric === "landslide"
                    ? "Risk pressure"
                    : heatMetric === "infrastructure"
                      ? "Density"
                      : "All signals"}
              </div>
            </div>
          </div>

          <div className="toggleRow">
            <div>
              <label>Street View</label>
              <div className="hint">Google — click map to view 360° street imagery</div>
            </div>
            <div
              className={`switch ${streetViewMode ? "on" : ""}`}
              role="switch"
              aria-checked={streetViewMode}
              onClick={() => setStreetViewMode((v) => !v)}
            />
          </div>
          <div className="toggleRow">
            <div>
              <label>Satellite</label>
              <div className="hint">
                HD aerial imagery + 3D terrain together — zoom in for rooftop detail
              </div>
            </div>
            <div
              className={`switch ${toggles.satellite ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.satellite}
              onClick={() =>
                setToggles((t) => {
                  const next = !t.satellite;
                  return { ...t, satellite: next, terrain: next };
                })
              }
            />
          </div>
        </div>
        )}

        {/* ── Risk Tab ── */}
        {sidebarTab === "risk" && roleConfig?.canSeeRisk && (
          <>
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="sectionTitle" style={{ marginBottom: 8 }}>
            Risk Summary
          </div>
          <div className="grid2">
            <div className="stat">
              <div className="v" style={{ color: "var(--danger)" }}>
                {riskSummary.high}
              </div>
              <div className="l">High Risk</div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "var(--warn)" }}>
                {riskSummary.mod}
              </div>
              <div className="l">Moderate</div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "var(--safe)" }}>
                {riskSummary.low}
              </div>
              <div className="l">Safe</div>
            </div>
            <div className="stat">
              <div className="v">{riskSummary.total}</div>
              <div className="l">Zones</div>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            Model: rainfall + slope (LGU explainable logic)
          </div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="sectionTitle" style={{ marginBottom: 8 }}>
            Official map overlays (KMZ)
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
            Light high-res PHIVOLCS map tiles — turn on one at a time.
          </div>
          <div className="toggleRow" style={{ marginBottom: 10 }}>
            <div>
              <label>EIL 2010 landslide map</label>
              <div className="hint">Earthquake-induced landslide</div>
            </div>
            <div
              className={`switch ${toggles.hazardEil2010 ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.hazardEil2010}
              onClick={() =>
                setToggles((t) => ({
                  ...t,
                  hazardEil2010: !t.hazardEil2010,
                  hazardEq2014: false,
                  hazardGsh2014: false,
                }))
              }
            />
          </div>
          <div className="toggleRow" style={{ marginBottom: 10 }}>
            <div>
              <label>Earthquake 50K 2014 (EIL)</label>
              <div className="hint">Earthquake-induced landslide</div>
            </div>
            <div
              className={`switch ${toggles.hazardEq2014 ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.hazardEq2014}
              onClick={() =>
                setToggles((t) => ({
                  ...t,
                  hazardEq2014: !t.hazardEq2014,
                  hazardEil2010: false,
                  hazardGsh2014: false,
                }))
              }
            />
          </div>
          <div className="toggleRow" style={{ marginBottom: 10 }}>
            <div>
              <label>Ground Shaking 2014</label>
              <div className="hint">PHIVOLCS ground shaking map</div>
            </div>
            <div
              className={`switch ${toggles.hazardGsh2014 ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.hazardGsh2014}
              onClick={() =>
                setToggles((t) => ({
                  ...t,
                  hazardGsh2014: !t.hazardGsh2014,
                  hazardEil2010: false,
                  hazardEq2014: false,
                }))
              }
            />
          </div>
          {activeHazardLegend && <HazardLegend hazard={activeHazardLegend} variant="panel" />}
        </div>

        {roleConfig?.canSeeAlerts && <>
        <div style={{ marginBottom: 8 }} className="sectionTitle">
          Real-Time Alerts
        </div>
        {alerts.length ? (
          <div className="miniList">
            {alerts.map((a) => (
              <div key={a.id} className="alert">
                <div className="t">{a.title}</div>
                <div className="m">{a.message}</div>
                <div className="meta">
                  Recommended: {a.recommendedAction}
                  <br />
                  Triggered: {formatAgo(a.triggeredAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{ color: "var(--muted)", fontSize: 13 }}>
            No high-risk alerts yet. The system will notify automatically when a zone transitions to HIGH risk.
          </div>
        )}
        </>}
          </>
        )}

        {/* ── Projects Tab ── */}
        {sidebarTab === "projects" && (
          <>
        {/* ── Engineer: Place Infrastructure Models ── */}
        {currentRole === "Engineer" && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 10 }}>
              Place Infrastructure
            </div>

            {/* Placement toggle */}
            <button
              onClick={() => {
                setPlacementMode((v) => {
                  if (!v) setBlockRemoverMode(false);
                  return !v;
                });
              }}
              style={{
                width: "100%", cursor: "pointer", padding: "10px 0",
                borderRadius: 2, fontWeight: 700, fontSize: 13,
                border: placementMode ? "1px solid rgba(61,155,95,0.6)" : "1px solid var(--stroke)",
                background: placementMode ? "rgba(61,155,95,0.20)" : "var(--cream-deep)",
                color: placementMode ? "var(--seed)" : "var(--muted)",
                marginBottom: 10,
              }}
            >
              {placementMode ? (
                <span style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                  Placement Mode ON — Click globe to place
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Enable Placement Mode
                </span>
              )}
            </button>

            {/* Edit Mode — glowing streets */}
            <button
              type="button"
              onClick={() => {
                setEditMode((v) => {
                  const next = !v;
                  if (next) setSnapToRoad(true);
                  return next;
                });
              }}
              style={{
                width: "100%", cursor: "pointer", padding: "10px 0",
                borderRadius: 2, fontWeight: 700, fontSize: 13,
                border: editMode ? "1px solid rgba(0,243,255,0.7)" : "1px solid var(--stroke)",
                background: editMode ? "rgba(0,243,255,0.12)" : "var(--cream-deep)",
                color: editMode ? "#00c8d4" : "var(--muted)",
                marginBottom: 10,
              }}
            >
              {editMode ? "Edit Mode ON — Streets highlighted" : "Enable Edit Mode"}
            </button>

            {/* Snap to Road */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                fontSize: 12,
                color: (editMode || placementMode) ? "var(--ink-soft)" : "var(--muted2)",
                cursor: (editMode || placementMode) ? "pointer" : "not-allowed",
                opacity: (editMode || placementMode) ? 1 : 0.55,
              }}
            >
              <input
                type="checkbox"
                checked={snapToRoad}
                disabled={!editMode && !placementMode}
                onChange={(e) => setSnapToRoad(e.target.checked)}
              />
              Snap to Road (magnet + align yaw)
            </label>

            {/* Name input */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Project Name (optional)</div>
              <input
                value={placingName}
                onChange={(e) => setPlacingName(e.target.value)}
                placeholder="e.g. Brgy. Hall Phase 2"
                style={{
                  width: "100%", boxSizing: "border-box", padding: "7px 10px",
                  borderRadius: 2, border: "1px solid var(--stroke)",
                  background: "var(--cream-deep)", color: "var(--ink-soft)",
                  fontSize: 12, outline: "none",
                }}
              />
            </div>

            {/* Rotation */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 52 }}>Rotation</span>
              <input type="range" min={0} max={360} step={15} value={placementRotation}
                onChange={(e) => setPlacementRotation(Number(e.target.value))}
                style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: "var(--muted2)", minWidth: 32, textAlign: "right" }}>
                {placementRotation}°
              </span>
            </div>

            {/* Model catalog */}
            {(["Building", "Infrastructure", "Agriculture", "Construction"] as const).map((cat) => (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{cat}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {MODEL_CATALOG.filter((m) => m.category === cat).map((m) => (
                    <button
                      key={m.type}
                      onClick={() => {
                        setSelectedModel(m.type);
                        if (m.type !== "custom") {
                          setCustomModelFile(null);
                          setCustomModelPreview(null);
                        }
                      }}
                      title={m.description}
                      style={{
                        cursor: "pointer", padding: "8px 6px", borderRadius: 2, textAlign: "left",
                        border: selectedModel === m.type
                          ? "1px solid rgba(61,155,95,0.55)"
                          : "1px solid var(--stroke2)",
                        background: selectedModel === m.type
                          ? "rgba(61,155,95,0.14)"
                          : "var(--cream-ink)",
                        color: selectedModel === m.type ? "var(--seed)" : "var(--muted)",
                      }}
                    >
                      <div style={{ marginBottom: 4, display: "flex", alignItems: "center", color: selectedModel === m.type ? "var(--seed)" : "var(--muted)" }}>
                        {(() => { const Ic = ModelIcons[m.icon] ?? ModelIcons.construction; return <Ic size={18} />; })()}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{m.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Custom Model Upload */}
            {selectedModel === "custom" && (
              <div style={{ 
                marginTop: 12, 
                padding: "12px", 
                background: "rgba(61,155,95,0.08)", 
                border: "1px solid rgba(61,155,95,0.25)", 
                borderRadius: 2 
              }}>
                <div style={{ fontSize: 11, color: "var(--seed)", fontWeight: 600, marginBottom: 8 }}>
                  Upload Custom GLB Model
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.45, marginBottom: 8 }}>
                  Colors must be on Principled BSDF Base Color (or image textures), not Viewport Display only.
                  SVG materials often export white — run scripts/blender_fix_materials_for_gltf.py in Blender before export.
                  Max file size: 500MB (.glb / .gltf).
                </div>
                <input
                  type="file"
                  accept=".glb,.gltf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCustomModelFile(file);
                      setCustomModelPreview(file.name);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "rgba(0,0,0,0.3)",
                    color: "var(--ink-soft)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                />
                {customModelPreview && (
                  <div style={{ 
                    marginTop: 8, 
                    fontSize: 10, 
                    color: "var(--muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--seed)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {customModelPreview}
                  </div>
                )}
                <div style={{ 
                  marginTop: 8, 
                  fontSize: 10, 
                  color: "var(--muted2)", 
                  lineHeight: 1.4 
                }}>
                  Upload your own 3D model in GLB or GLTF format. The model will be placed on the map at the clicked location.
                </div>
              </div>
            )}

            {/* Placed projects list with delete */}
            {projects.filter((p) => p.department === "Engineering").length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Placed by Engineer</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                  {projects.filter((p) => p.department === "Engineering").map((p) => (
                    <div key={p.id} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
                      background: "var(--cream-ink)", borderRadius: 0,
                      border: "1px solid var(--stroke2)",
                    }}>
                      <span style={{ display: "flex", alignItems: "center", color: "var(--muted)" }}>
                        {(() => { const ic = MODEL_CATALOG.find((m) => m.type === p.modelType)?.icon ?? "construction"; const Ic = ModelIcons[ic] ?? ModelIcons.construction; return <Ic size={15} />; })()}
                      </span>
                      <span style={{ flex: 1, fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                      <button
                        onClick={async () => {
                          await fetch(backendUrl(`/api/projects/${p.id}`), { method: "DELETE" });
                        }}
                        style={{
                          cursor: "pointer", padding: "2px 7px", borderRadius: 5, fontSize: 11,
                          border: "1px solid rgba(255,77,79,0.3)", background: "rgba(255,77,79,0.10)",
                          color: "rgba(255,100,100,0.9)",
                        }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {roleConfig?.canSeeProjects && (
          <ProjectMonitoringPanel
            projects={projects}
            currentRole={currentRole}
            mapRef={mapRef}
            cesiumMapRef={cesiumMapRef}
            readOnly={currentRole === "Viewer"}
          />
        )}
        </>
        )}

        {/* ── Climate Tab ── */}
        {sidebarTab === "climate" && (roleConfig?.canSeeWeather || roleConfig?.canSeeLayers) && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              Climate Readings
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
              Live station values for Luisiana — readable numbers, not particle visualizations.
            </div>

            <div className="grid2" style={{ marginBottom: 12 }}>
              <div className="stat">
                <div className="v">{weather ? `${Math.round(weather.windSpeedMps * 3.6)} kph` : "—"}</div>
                <div className="l">Wind Speed</div>
              </div>
              <div className="stat">
                <div className="v">
                  {weather
                    ? (() => {
                        const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
                        const label = dirs[Math.round(((weather.windDirectionDeg % 360) + 360) % 360 / 45) % 8];
                        return `${label} · ${Math.round(weather.windDirectionDeg)}°`;
                      })()
                    : "—"}
                </div>
                <div className="l">Wind Direction</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${weather.temperatureC.toFixed(1)}°C` : "—"}</div>
                <div className="l">Air Temperature</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${weather.rainfallMm.toFixed(1)} mm` : "—"}</div>
                <div className="l">Rainfall</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${weather.humidityPct ?? "—"}%` : "—"}</div>
                <div className="l">Humidity</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${weather.cloudinessPct}%` : "—"}</div>
                <div className="l">Cloud Cover</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${weather.pressureHpa ?? "—"} hPa` : "—"}</div>
                <div className="l">Pressure</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${(weather.rainfallIntensity * 100).toFixed(0)}%` : "—"}</div>
                <div className="l">Rain Intensity</div>
              </div>
            </div>

            {weather && (
              <div style={{
                marginBottom: 14,
                padding: "10px 12px",
                borderLeft: "4px solid var(--accent)",
                background: "var(--cream-deep)",
                fontSize: 12,
                lineHeight: 1.45,
                color: "var(--ink-soft)",
              }}>
                <strong style={{ color: "var(--ink)" }}>Hangin:</strong>{" "}
                {Math.round(weather.windSpeedMps * 3.6) >= 118
                  ? `Bagyo-level wind signal — ${Math.round(weather.windSpeedMps * 3.6)} kph. Limit outdoor / elevated work.`
                  : Math.round(weather.windSpeedMps * 3.6) >= 62
                    ? `Strong breeze at ${Math.round(weather.windSpeedMps * 3.6)} kph. Secure loose materials on site.`
                    : Math.round(weather.windSpeedMps * 3.6) >= 30
                      ? `Moderate wind at ${Math.round(weather.windSpeedMps * 3.6)} kph from ${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((weather.windDirectionDeg % 360) + 360) % 360 / 45) % 8]}.`
                      : `Light wind at ${Math.round(weather.windSpeedMps * 3.6)} kph — conditions are manageable for outdoor operations.`}
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted2)" }}>
                  Source: {weather.source} · Updated {formatAgo(weather.observedAt)}
                </div>
              </div>
            )}

            {weather?.forecast?.length ? (
              <div style={{ marginBottom: 16 }}>
                <div className="sectionTitle" style={{ marginBottom: 8 }}>Next hours (text forecast)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {weather.forecast.slice(0, 6).map((f) => {
                    const kph = Math.round(f.windSpeedMps * 3.6);
                    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
                    const dir = dirs[Math.round(((f.windDirectionDeg % 360) + 360) % 360 / 45) % 8];
                    return (
                      <div key={f.hour} style={{
                        display: "grid",
                        gridTemplateColumns: "3.2rem 1fr",
                        gap: 10,
                        padding: "8px 0",
                        borderBottom: "1px solid var(--stroke2)",
                        fontSize: 12,
                      }}>
                        <div style={{ fontWeight: 700, color: "var(--burnt-deep)" }}>+{f.hour}h</div>
                        <div style={{ color: "var(--ink-soft)", lineHeight: 1.4 }}>
                          Temp <strong style={{ color: "var(--ink)" }}>{f.temperatureC}°C</strong>
                          {" · "}Wind <strong style={{ color: "var(--ink)" }}>{kph} kph {dir}</strong>
                          {" · "}Rain <strong style={{ color: "var(--ink)" }}>{f.rainfallMm} mm</strong>
                          {" · "}Clouds <strong style={{ color: "var(--ink)" }}>{f.cloudinessPct}%</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {roleConfig?.canSeeLayers && (
            <>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              NASA GIBS Map Layers
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
              Precipitation follows Tropical Tracking (Events). Other overlays use the same on/off.
            </div>

            {/* Precipitation Layers */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(61,155,95,0.85)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                ☔ Precipitation (Ulan)
              </div>
              <div className="hint" style={{ marginBottom: 8 }}>
                Turns on/off with tropical tracking
                {tropicalEnabled ? " · active" : " · off"}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    ["IMERG_Precipitation_Rate", "IMERG Rate"],
                    ["IMERG_Precipitation_Rate_30min", "IMERG 30min"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setGibsLayer(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 2,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(61,155,95,0.20)",
                      background: gibsLayer === k ? "rgba(61,155,95,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "rgba(61,155,95,1)" : "var(--muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Temperature Layers */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(255,140,60,0.85)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                🌡️ Temperature (Temperatura)
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    ["MODIS_Terra_Land_Surface_Temp_Day", "Surface (Day)"],
                    ["MODIS_Terra_Land_Surface_Temp_Night", "Surface (Night)"],
                    ["AIRS_L2_Surface_Air_Temperature_Day", "Air Temp"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setGibsLayer(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 2,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(255,140,60,0.20)",
                      background: gibsLayer === k ? "rgba(255,140,60,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "var(--primary)" : "var(--muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Satellite Imagery */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(61,155,95,0.85)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                🛰️ Satellite Imagery
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    ["MODIS_Terra_CorrectedReflectance_TrueColor", "MODIS (250m)"],
                    ["VIIRS_NOAA20_CorrectedReflectance_TrueColor", "VIIRS (750m)"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setGibsLayer(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 2,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(61,155,95,0.20)",
                      background: gibsLayer === k ? "rgba(61,155,95,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "rgba(61,155,95,1)" : "var(--muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Atmosphere Layers */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(255,215,0,0.85)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                🌫️ Atmosphere (Hangin)
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    ["MODIS_Terra_Aerosol", "Air Quality"],
                    ["MODIS_Aqua_Cloud_Top_Temp_Day", "Cloud Temp"],
                    ["AIRS_L2_Surface_Relative_Humidity_Day", "Humidity"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setGibsLayer(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 2,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(255,215,0,0.20)",
                      background: gibsLayer === k ? "rgba(255,215,0,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "var(--seed)" : "var(--muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity Control */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <span className="pill">Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={0.9}
                  step={0.05}
                  value={gibsOpacity}
                  onChange={(e) => setGibsOpacity(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 35 }}>
                  {Math.round(gibsOpacity * 100)}%
                </span>
              </div>

              {/* Date Control */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="pill">Date</span>
                <input
                  type="date"
                  value={gibsDate}
                  onChange={(e) => setGibsDate(e.target.value)}
                  style={{
                    flex: 1,
                    background: "rgba(0,0,0,0.15)",
                    border: "1px solid var(--stroke)",
                    borderRadius: 0,
                    padding: "6px 8px",
                    color: "var(--ink-soft)",
                    fontSize: 11,
                  }}
                />
              </div>

              {/* Status Indicator */}
              {gibsStatus === "loading" && (
                <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,215,0,0.85)", display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,215,0,0.85)", animation: "pulse 1.5s infinite" }} />
                  Loading climate data...
                </div>
              )}
              {gibsStatus === "unavailable" && (
                <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,77,79,0.85)" }}>
                  ⚠️ Data unavailable for this date
                </div>
              )}
              {gibsStatus === "ok" && toggles.gibsPrecip && (
                <div style={{ marginTop: 10, fontSize: 11, color: "rgba(61,155,95,0.85)", display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(61,155,95,0.85)" }} />
                  Climate data active
                </div>
              )}
            </div>

            {/* Info Box */}
            <div style={{ marginTop: 16, padding: 12, background: "rgba(61,155,95,0.08)", border: "1px solid rgba(61,155,95,0.15)", borderRadius: 2 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                💡 <strong>Tip:</strong> Use yesterday's date for most reliable data. Some layers have 1-2 day processing lag.
              </div>
            </div>
            </>
            )}
          </div>
        )}

        {/* ── Events Tab (NASA EONET Natural Events) ── */}
        {sidebarTab === "events" && roleConfig?.canSeeLayers && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              🌍 NASA Natural Event Tracker
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
              Real-time natural events from NASA EONET - Wildfires, Storms, Volcanoes, Earthquakes, and more
            </div>

            {/* Enable/Disable Toggle */}
            <div className="toggleRow" style={{ marginBottom: 16 }}>
              <div>
                <label>Enable Event Tracking</label>
                <div className="hint">Show natural events on map</div>
              </div>
              <div
                className={`switch ${eonetEnabled ? "on" : ""}`}
                role="switch"
                aria-checked={eonetEnabled}
                onClick={() => setEonetEnabled(!eonetEnabled)}
              />
            </div>

            {/* Event Statistics */}
            {eonetEnabled && eonetEvents.length > 0 && (
              <div style={{ marginBottom: 16, padding: 12, background: "rgba(255,100,100,0.08)", border: "1px solid rgba(255,100,100,0.15)", borderRadius: 2 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  Active Events Nearby
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {Object.entries(getEventStats(eonetEvents)).map(([catId, count]) => {
                    const cat = EONET_CATEGORIES[catId];
                    if (!cat) return null;
                    return (
                      <div key={catId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                        <span style={{ fontSize: 14 }}>{cat.icon}</span>
                        <span style={{ color: "var(--ink-soft)" }}>{count}</span>
                        <span style={{ color: "var(--muted)" }}>{cat.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category Filters */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                Event Categories
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(EONET_CATEGORIES).map(([id, cat]) => {
                  const isSelected = eonetCategories.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        if (isSelected) {
                          setEonetCategories(eonetCategories.filter(c => c !== id));
                        } else {
                          setEonetCategories([...eonetCategories, id]);
                        }
                      }}
                      style={{
                        cursor: "pointer",
                        borderRadius: 2,
                        padding: "7px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        border: `1px solid ${cat.color}40`,
                        background: isSelected ? `${cat.color}30` : "rgba(0,0,0,0.15)",
                        color: isSelected ? cat.color : "var(--muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Radius Control */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <span className="pill">Search Radius</span>
                <input
                  type="range"
                  min={100}
                  max={5000}
                  step={100}
                  value={eonetRadius}
                  onChange={(e) => setEonetRadius(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 60 }}>
                  {eonetRadius} km
                </span>
              </div>
            </div>

            {/* Status Indicator */}
            {eonetLoading && (
              <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,215,0,0.85)", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,215,0,0.85)", animation: "pulse 1.5s infinite" }} />
                Loading events...
              </div>
            )}
            {!eonetLoading && eonetEnabled && eonetEvents.length === 0 && (
              <div style={{ marginTop: 12, fontSize: 11, color: "rgba(61,155,95,0.85)" }}>
                ✓ No active events in your area
              </div>
            )}
            {!eonetLoading && eonetEnabled && eonetEvents.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,100,100,0.85)", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,100,100,0.85)" }} />
                {eonetEvents.length} active event{eonetEvents.length !== 1 ? 's' : ''} tracked
              </div>
            )}

            {/* Event List */}
            {eonetEnabled && eonetEvents.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  📍 Event Locations
                </div>
                <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {eonetEvents.slice(0, 20).map((event) => {
                    const geometry = getLatestGeometry(event);
                    const category = event.categories[0];
                    const catInfo = EONET_CATEGORIES[category?.id];
                    const distance = geometry ? Math.round(
                      calculateDistance(14.1856, 121.5167, geometry.coordinates[1], geometry.coordinates[0])
                    ) : 0;

                    return (
                      <div
                        key={event.id}
                        onClick={() => {
                          if (!geometry) return;
                          const [lon, lat] = geometry.coordinates;
                          cesiumMapRef.current?.flyToLonLat(lon, lat, 80_000);
                          // Keep MapLibre in sync if it ever becomes visible again.
                          mapRef.current?.flyTo({
                            center: [lon, lat],
                            zoom: 8,
                            duration: 2000,
                          });
                        }}
                        style={{
                          padding: 10,
                          background: "rgba(0,0,0,0.20)",
                          border: `1px solid ${catInfo?.color || '#888'}30`,
                          borderRadius: 2,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(0,0,0,0.35)";
                          e.currentTarget.style.borderColor = `${catInfo?.color || '#888'}60`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(0,0,0,0.20)";
                          e.currentTarget.style.borderColor = `${catInfo?.color || '#888'}30`;
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span style={{ fontSize: 18, flexShrink: 0 }}>{catInfo?.icon || '📍'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)", marginBottom: 4, lineHeight: 1.3 }}>
                              {event.title}
                            </div>
                            {event.description && (
                              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, lineHeight: 1.3 }}>
                                {event.description}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: "var(--muted)" }}>
                              <span style={{ color: catInfo?.color || '#888' }}>
                                {category?.title || 'Unknown'}
                              </span>
                              <span>•</span>
                              <span>{distance.toLocaleString()} km away</span>
                              {geometry?.magnitudeValue && (
                                <>
                                  <span>•</span>
                                  <span>{geometry.magnitudeValue.toLocaleString()} {geometry.magnitudeUnit}</span>
                                </>
                              )}
                            </div>
                            {geometry?.date && (
                              <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>
                                Updated: {new Date(geometry.date).toLocaleDateString()} {new Date(geometry.date).toLocaleTimeString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {eonetEvents.length > 20 && (
                  <div style={{ marginTop: 8, fontSize: 10, color: "var(--muted2)", textAlign: "center" }}>
                    Showing 20 of {eonetEvents.length} events
                  </div>
                )}
              </div>
            )}

            {/* Info Box */}
            <div style={{ marginTop: 16, padding: 12, background: "rgba(255,100,100,0.08)", border: "1px solid rgba(255,100,100,0.15)", borderRadius: 2 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                💡 <strong>About:</strong> NASA EONET provides near real-time natural event data. Events are updated every 30 minutes. Click on map markers for details.
              </div>
            </div>
          </div>
        )}

        {/* ── Tropical systems (Invest / TC / LPA-watch) ── */}
        {sidebarTab === "events" && roleConfig?.canSeeLayers && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              Tropical systems (Invest / TC)
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
              West Pacific Invests and named cyclones from RAMMB/CIRA. Invests inside the Philippine AOI are labeled LPA-watch.
            </div>

            <div className="toggleRow" style={{ marginBottom: 16 }}>
              <div>
                <label>Enable tropical tracking</label>
                <div className="hint">Invest / TC tracks + NASA GIBS precip</div>
              </div>
              <div
                className={`switch ${tropicalEnabled ? "on" : ""}`}
                role="switch"
                aria-checked={tropicalEnabled}
                onClick={() => {
                  setTropicalEnabled((on) => {
                    const next = !on;
                    setToggles((t) => ({ ...t, gibsPrecip: next }));
                    if (next) {
                      setGibsLayer((layer) =>
                        layer.startsWith("IMERG_") ? layer : "IMERG_Precipitation_Rate"
                      );
                    }
                    return next;
                  });
                }}
              />
            </div>

            {tropicalLoading && (
              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,215,0,0.85)", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,215,0,0.85)", animation: "pulse 1.5s infinite" }} />
                Loading tropical systems...
              </div>
            )}

            {!tropicalLoading && tropicalEnabled && tropicalError && (
              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,140,80,0.9)" }}>
                {tropicalError}
              </div>
            )}

            {!tropicalLoading && tropicalEnabled && !tropicalError && tropicalSystems.length === 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(61,155,95,0.85)" }}>
                No active West Pacific systems reported
              </div>
            )}

            {!tropicalLoading && tropicalEnabled && tropicalSystems.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(240,160,48,0.9)", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(240,160,48,0.9)" }} />
                {tropicalSystems.length} system{tropicalSystems.length !== 1 ? "s" : ""} tracked
              </div>
            )}

            {tropicalEnabled && tropicalSystems.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  Active systems
                </div>
                <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {tropicalSystems.map((system) => {
                    const color = getTropicalColor(system);
                    const meta = getTropicalStageMeta(system.stage);
                    const distance = Math.round(
                      calculateDistance(14.1856, 121.5167, system.lat, system.lon),
                    );
                    return (
                      <div
                        key={system.id}
                        onClick={() => {
                          cesiumMapRef.current?.flyToLonLat(system.lon, system.lat, 400_000);
                          mapRef.current?.flyTo({
                            center: [system.lon, system.lat],
                            zoom: 5,
                            duration: 2000,
                          });
                        }}
                        style={{
                          padding: 10,
                          background: "rgba(0,0,0,0.20)",
                          border: `1px solid ${color}30`,
                          borderRadius: 2,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(0,0,0,0.35)";
                          e.currentTarget.style.borderColor = `${color}60`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(0,0,0,0.20)";
                          e.currentTarget.style.borderColor = `${color}30`;
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span style={{ fontSize: 16, flexShrink: 0, color }}>{getTropicalIcon(system)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)", marginBottom: 4, lineHeight: 1.3 }}>
                              {system.label}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: "var(--muted)" }}>
                              <span style={{ color }}>{meta.title}</span>
                              <span>•</span>
                              <span>{system.intensityKt} kt</span>
                              <span>•</span>
                              <span>{distance.toLocaleString()} km away</span>
                              {system.lpaWatch && (
                                <>
                                  <span>•</span>
                                  <span style={{ color: "#f0a030" }}>LPA-watch</span>
                                </>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>
                              Observed: {new Date(system.observedAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, padding: 12, background: "rgba(240,160,48,0.08)", border: "1px solid rgba(240,160,48,0.18)", borderRadius: 2 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                {tropicalDisclaimer ||
                  "Positions from RAMMB/CIRA TC Realtime (JTWC-derived). Not an official PAGASA bulletin."}
              </div>
            </div>
          </div>
        )}

        </div>
        {/* End Tab Content */}

        {currentRole === "Negosyo Center" && (
          <div className="card" style={{ marginTop: 12, borderColor: "rgba(255,214,102,0.2)" }}>
            <div style={{ fontSize: 12, color: "var(--muted2)", lineHeight: 1.5 }}>
              The map shows the Luisiana area. Your dashboard above is focused on business permit processing.
            </div>
          </div>
        )}
      </aside>
      </>
      </div>
      )}
      
      {/* Placement Modal - Enter Building Details */}
      {showPlacementModal && pendingPlacement && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--overlay)",
            backdropFilter: "none",
          }}
          onClick={() => {
            setShowPlacementModal(false);
            setPendingPlacement(null);
          }}
        >
          <div
            style={{
              background: "var(--cream)",
              border: "3px solid var(--ink)",
              borderRadius: 0,
              padding: "24px 28px",
              maxWidth: 500,
              width: "90%",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "8px 8px 0 var(--shadow-accent)",
              color: "var(--ink)",
              position: "relative",
              fontFamily: '"Chakra Petch", sans-serif',
            }}
            className="modal-content-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => {
                setShowPlacementModal(false);
                setPendingPlacement(null);
              }}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                cursor: "pointer",
                background: "none",
                border: "none",
                color: "var(--muted)",
                fontSize: 24,
                padding: 0,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Close (ESC)"
            >
              ×
            </button>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3, marginBottom: 4 }}>
                Place New Infrastructure
              </h2>
              <div style={{ fontSize: 12, color: "var(--muted2)" }}>
                Enter building details before placing on map
              </div>
            </div>

            {/* Form Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Project Name */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Project Name *
                </label>
                <input
                  type="text"
                  value={modalProjectName}
                  onChange={(e) => setModalProjectName(e.target.value)}
                  placeholder="e.g. Barangay Hall Phase 2"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    color: "var(--ink)",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>

              {/* Type */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Project Type *
                </label>
                <select
                  value={modalProjectType}
                  onChange={(e) => setModalProjectType(e.target.value as any)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    color: "var(--ink)",
                    fontSize: 14,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="Municipal Project">Municipal Project</option>
                  <option value="Private Building">Private Building</option>
                  <option value="Agricultural Structure">Agricultural Structure</option>
                </select>
              </div>

              {/* Department */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Department *
                </label>
                <select
                  value={modalDepartment}
                  onChange={(e) => setModalDepartment(e.target.value as any)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    color: "var(--ink)",
                    fontSize: 14,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="MPDC">MPDC</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Agriculture">Agriculture</option>
                  <option value="Negosyo Center">Negosyo Center</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Status *
                </label>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value as any)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    color: "var(--ink)",
                    fontSize: 14,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="Planned">Planned</option>
                  <option value="Ongoing">Ongoing</option>
                  <option value="Delayed">Delayed</option>
                  <option value="Completed">Completed</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>

              {/* Progress */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Progress: {modalProgress}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={modalProgress}
                  onChange={(e) => setModalProgress(Number(e.target.value))}
                  style={{
                    width: "100%",
                    cursor: "pointer",
                  }}
                />
              </div>

              {/* Timeline & budget */}
              <div className="grid2" style={{ gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={modalStartDate}
                    onChange={(e) => setModalStartDate(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 0, border: "1px solid var(--stroke)", background: "var(--cream-deep)", fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                    Target End
                  </label>
                  <input
                    type="date"
                    value={modalTargetEndDate}
                    onChange={(e) => setModalTargetEndDate(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 0, border: "1px solid var(--stroke)", background: "var(--cream-deep)", fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Budget Total (PHP, optional)
                </label>
                <input
                  type="number"
                  min={0}
                  value={modalBudgetTotal}
                  onChange={(e) => setModalBudgetTotal(e.target.value)}
                  placeholder="e.g. 1500000"
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 0, border: "1px solid var(--stroke)", background: "var(--cream-deep)", fontSize: 13 }}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Description (Optional)
                </label>
                <textarea
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                  placeholder="Enter project description..."
                  rows={3}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    color: "var(--ink)",
                    fontSize: 13,
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Location Info */}
              <div style={{ padding: "10px 12px", background: "var(--cream-ink)", border: "1px solid var(--stroke2)", borderRadius: 0 }}>
                <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Location
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>
                  {pendingPlacement.lat.toFixed(6)}°N, {pendingPlacement.lng.toFixed(6)}°E
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
              <button
                onClick={() => {
                  setShowPlacementModal(false);
                  setPendingPlacement(null);
                }}
                style={{
                  flex: 1,
                  cursor: "pointer",
                  padding: "11px 0",
                  borderRadius: 2,
                  background: "var(--cream-deep)",
                  border: "1px solid var(--stroke)",
                  color: "var(--muted)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePlaceBuilding}
                disabled={!modalProjectName.trim()}
                style={{
                  flex: 1,
                  cursor: modalProjectName.trim() ? "pointer" : "not-allowed",
                  padding: "11px 0",
                  borderRadius: 2,
                  background: modalProjectName.trim()
                    ? "var(--seed)"
                    : "var(--cream-ink)",
                  border: modalProjectName.trim()
                    ? "2px solid var(--ink)"
                    : "1px solid var(--stroke)",
                  color: modalProjectName.trim() ? "var(--ink)" : "var(--muted2)",
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: '"Chakra Petch", sans-serif',
                  boxShadow: modalProjectName.trim() ? "4px 4px 0 var(--ink)" : "none",
                  opacity: modalProjectName.trim() ? 1 : 0.6,
                }}
              >
                Place Building
              </button>
            </div>
          </div>
        </div>
      )}

      {cookieConsent === "pending" && (
        <div className="cookie-banner-overlay">
          <div className="cookie-banner">
            <div className="cookie-banner-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="8" cy="9" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="14" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="10" cy="14" r="1" fill="currentColor" stroke="none" />
                <circle cx="15.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
                <circle cx="13" cy="16" r="0.8" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div className="cookie-banner-text">
              <strong>Cookie Notice</strong>
              <p>
                INFA-TRACK uses cookies to keep you signed in and remember your preferences.
                By accepting, you allow us to store session data on your browser.
              </p>
            </div>
            <div className="cookie-banner-actions">
              <button type="button" className="cookie-btn-accept" onClick={handleCookieAccept}>
                Accept Cookies
              </button>
              <button type="button" className="cookie-btn-decline" onClick={handleCookieDecline}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

