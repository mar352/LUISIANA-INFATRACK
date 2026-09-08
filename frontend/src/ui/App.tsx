import { lazy, Suspense, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type SyntheticEvent } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CesiumMap, type CesiumMapHandle } from "./CesiumMap";
import { MapShortcuts } from "./MapShortcuts";
import { BarangayLegend } from "./BarangayLegend";
import { loadBarangayAreas, type BarangayArea } from "../lib/barangay-overlay";
import InventoryPage from "./InventoryPage";
import DocumentsPage from "./DocumentsPage";
import AnalyticsPage from "./AnalyticsPage";
import CitizenPortal from "./CitizenPortal";
import NewApplicationPage from "./NewApplicationPage";
import ApplicantTrackingPage from "./ApplicantTrackingPage";
import EngagementPage from "./EngagementPage";
import { addProjectToFirestore } from "../services/firestore-projects";
import type {
  AlertItem,
  HeatPoint,
  MapSketch,
  MapSketchKind,
  PlacementTool,
  PlanningEvent,
  PlanningMeeting,
  PlanningProposal,
  Project,
  RiskZones,
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
import { BACKEND_URL, backendUrl, fetchCitizenApplications } from "../lib/api";
import { fetchPlanningEventsOnce, fetchPlanningMeetingsOnce, fetchProposalsOnce, updateProposal } from "../services/firestore-planning";
import { departmentForRole } from "../lib/planning-permissions";
import { buildOpsAlerts, type OpsAlert } from "../lib/ops-alerts";
import { assetQueryParam } from "../lib/project-link";
import { startPhotoQueueFlusher } from "../lib/photo-queue";
import { inspectGlbFile, type GlbTextureReport } from "../lib/inspect-glb";
import {
  makeMapShape,
  shapeLabel,
  sketchCentroid,
  type MapShapeKind,
  type ShapeCatalogItem,
} from "../lib/map-shapes";
import { NotifyOpsList } from "./NotifyOpsList";
import { StadiaStylePicker } from "./StadiaStylePicker";
import { buildHeatmapPoints, type BBox, type HeatmapMetric } from "../lib/heatmap";
import {
  DEFAULT_MAP_SETTINGS,
  loadMapSettings,
  saveMapSettings,
  type MapSettings,
  type ShadowQuality,
  type TerrainQuality,
} from "../lib/map-settings";
import {
  getTerrainSource,
  getSatelliteSource,
  createHillshadeLayer,
  applyWebGLOptimizations,
  calculateTerrainExaggeration,
  type TerrainSource,
  type SatelliteSource
} from "../lib/terrain";
import { detectOpenMapTilesSourceId, stadiaStyleUrl } from "../lib/stadia";
import {
  ensureEditStreetLayers,
  setEditStreetVisible,
  startEditStreetPulse,
  stopEditStreetPulse,
  teardownEditStreetOverlay,
} from "../lib/street-edit-overlay";
import { snapLngLatToRoad } from "../lib/snap-to-road";
import { displayNameForProject } from "../lib/place-name";
import { LandingPage, LoginScreen, ROLE_CONFIGS, isBarangayOfficial, isMunicipalStaff, type UserRole } from "./Landing";
import {
  DEFAULT_INFRA_FILTER,
  INFRA_CATEGORIES,
  INFRA_DEPARTMENTS,
  INFRA_STATUSES,
  filterInfrastructure,
  toggleListValue,
  type InfraFilter,
} from "../lib/infra-filter";
import { BARANGAY_LIST } from "../types";
import { earthquakeProneModel, type EarthquakeGridCell, type EarthquakeTrainStatus } from "../lib/ml-earthquake";
import { classAdvice, classColor } from "../lib/earthquake-labels";
import { ProjectMonitoringPanel } from "./ProjectMonitoringPanel";
import { EngineerApplicationsPage } from "./EngineerApplicationsPage";
import { ThemeToggle } from "./ThemeToggle";
import { ProjectChat } from "./ProjectChat";
import { ChangePasswordForm } from "./ChangePasswordForm";

import {
  seedAccounts,
  restoreSession,
  logoutUser,
  sessionForRole,
  type SessionUser,
} from "../services/auth";
import TreasuryOfficePage from "./TreasuryOfficePage";
import NegosyoCenterPage from "./NegosyoCenterPage";
import ZoningPermitsPage from "./ZoningPermitsPage";
import { setAuditActor } from "../services/firestore-audit";
import AuditPage from "./AuditPage";
import PlanningPage from "./PlanningPage";
import { PrivateEngineerPortal } from "./PrivateEngineerPortal";
import { SiteProgressPopup } from "./SiteProgressPopup";
import { InspectionTaskQueue } from "./InspectionTaskQueue";
import { InspectionUpdateModal } from "./InspectionUpdateModal";

// ── Dashboard icons ────────────────────────────────────────────────────────────
const IconClipboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
  </svg>
);
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconClock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconWarn = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// ── Model catalog SVG icons ──────────────────────────────────────────────
const ModelIcons: Record<string, React.FC<{ size?: number; color?: string }>> = {
  office: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18" /><path d="M9 21V9" /><path d="M7 6h.01" /><path d="M12 6h.01" /><path d="M17 6h.01" />
    </svg>
  ),
  school: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  ),
  hospital: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="1" /><path d="M12 8v8" /><path d="M8 12h8" />
    </svg>
  ),
  barangay_hall: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-4h6v4" /><path d="M9 10h.01" /><path d="M15 10h.01" />
    </svg>
  ),
  municipal_hall: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" /><path d="M4 21V10l8-6 8 6v11" /><path d="M9 21v-6h6v6" /><path d="M12 4v3" /><path d="M8 14h.01" /><path d="M16 14h.01" />
    </svg>
  ),
  rhu: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" /><path d="M5 21V9l7-5 7 5v12" /><path d="M12 11v6" /><path d="M9 14h6" />
    </svg>
  ),
  evacuation_center: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  ),
  road: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21L9 3" /><path d="M19 21L15 3" /><path d="M9 12h6" /><path d="M10 7h4" /><path d="M10 17h4" />
    </svg>
  ),
  bridge: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 18h20" /><path d="M2 18c0-4 4-7 10-7s10 3 10 7" /><path d="M6 18v-3" /><path d="M18 18v-3" />
    </svg>
  ),
  water_tank: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="7" rx="9" ry="4" /><path d="M3 7v10c0 2.2 4 4 9 4s9-1.8 9-4V7" /><path d="M3 12c0 2.2 4 4 9 4s9-1.8 9-4" />
    </svg>
  ),
  solar_farm: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="M6.34 17.66l-1.41 1.41" /><path d="M19.07 4.93l-1.41 1.41" />
    </svg>
  ),
  barn: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" /><path d="M3 10l9-7 9 7" /><path d="M5 21V10" /><path d="M19 21V10" /><rect x="9" y="14" width="6" height="7" />
    </svg>
  ),
  construction: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20" /><path d="M6 20V10l6-6 6 6v10" /><path d="M12 20v-6" /><path d="M9 14h6" /><path d="M3 10h18" />
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
  risk: boolean;
  projects: boolean;
};

const DEFAULT_TOGGLES: LayerToggles = {
  satellite: false,
  terrain: false,
  heatmap: false,
  risk: false,
  projects: true,
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

function formatRealDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return String(iso);
  }
}

function formatAgo(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dateStr = d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const ms = Date.now() - d.getTime();
    if (ms < 0) return dateStr;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${dateStr} (just now)`;
    const m = Math.round(s / 60);
    if (m < 60) return `${dateStr} (${m}m ago)`;
    const h = Math.round(m / 60);
    if (h < 24) return `${dateStr} (${h}h ago)`;
    const days = Math.round(h / 24);
    return `${dateStr} (${days}d ago)`;
  } catch {
    return iso;
  }
}

type PanelNotice = {
  id: string;
  proposalId: string;
  title: string;
  message: string;
  at: string;
  kind: "returned" | "review" | "assigned" | "update";
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
    const statusLabel = PLANNING_STATUS_LABELS[p.status] || p.status;
    const at = p.updatedAt || p.createdAt;

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
        id: `${p.id}:assigned:${p.status}`,
        proposalId: p.id,
        title: "Assigned to you",
        message: `"${p.title}" · ${statusLabel}`,
        at,
        kind: "assigned",
      });
      continue;
    }

    if (isDept && (p.status === "submitted" || p.status === "in_review" || p.status === "recommended")) {
      notices.push({
        id: `${p.id}:${p.status}`,
        proposalId: p.id,
        title: statusLabel,
        message: `"${p.title}" needs Engineering attention.`,
        at,
        kind: p.status === "in_review" ? "review" : "update",
      });
    }
  }

  return notices
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""))
    .slice(0, 12);
}

/**
 * Notices for the MPDC role.
 *
 * MPDC is the final approval authority so they need to see:
 * - Any proposal newly submitted (waiting for them to open review / assign)
 * - Proposals that reached "recommended" status (ready for their approve/reject decision)
 * - Proposals returned by them that were resubmitted (came back for re-review)
 */
function buildMpdcPlanningNotices(
  proposals: PlanningProposal[],
  session: SessionUser,
): PanelNotice[] {
  const notices: PanelNotice[] = [];

  for (const p of proposals) {
    const at = p.updatedAt || p.createdAt;

    // Newly submitted — MPDC needs to open review and assign.
    if (p.status === "submitted") {
      notices.push({
        id: `${p.id}:submitted:${at}`,
        proposalId: p.id,
        title: "New proposal submitted",
        message: `"${p.title}" is waiting for review assignment.`,
        at,
        kind: "review",
      });
      continue;
    }

    // Recommended — MPDC needs to approve or reject.
    if (p.status === "recommended") {
      notices.push({
        id: `${p.id}:recommended:${at}`,
        proposalId: p.id,
        title: "Ready for approval",
        message: `"${p.title}" is ready for MPDC approval.`,
        at,
        kind: "assigned",
      });
      continue;
    }

    // Returned proposal that has been resubmitted — came back for re-review.
    if (p.status === "submitted" && (p.approvals || []).some((a) => a.action === "returned")) {
      notices.push({
        id: `${p.id}:resubmitted:${at}`,
        proposalId: p.id,
        title: "Resubmitted after return",
        message: `"${p.title}" was revised and resubmitted.`,
        at,
        kind: "returned",
      });
    }
  }

  return notices
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""))
    .slice(0, 12);
}

// ── Engineer notices ─────────────────────────────────────────────────────────
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

// ── MPDC notices ─────────────────────────────────────────────────────────────
const MPDC_DISMISSED_NOTICES_KEY = "infatrack_mpdc_dismissed_notices";
const OPS_DISMISSED_KEY = "infatrack_ops_dismissed_notices";

function loadMpdcDismissedNoticeIds(): string[] {
  try {
    const raw = localStorage.getItem(MPDC_DISMISSED_NOTICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function loadOpsDismissedIds(): string[] {
  try {
    const raw = localStorage.getItem(OPS_DISMISSED_KEY);
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
  const [screen, setScreen] = useState<"landing" | "login" | "app" | "inventory" | "planning" | "documents" | "analytics" | "engagement" | "citizen" | "services" | "audit" | "negosyo" | "treasury" | "permits" | "new_application" | "applicant_tracking" | "pengineer" | "engineer_applications">("landing");
  const [trackingReference, setTrackingReference] = useState<string>("");
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
    return startPhotoQueueFlusher();
  }, []);

  useEffect(() => {
    seedAccounts().catch((err) => console.warn("[Auth] Seed accounts failed:", err));

    if (cookieConsent === "accepted") {
      restoreSession()
        .then((saved) => {
          if (!saved) return;
          setAuditActor(saved);
          setCurrentSession(saved);
          setScreen(
            saved.role === "Barangay Official"
              ? "planning"
              : saved.role === "Treasury Office" || saved.role === "Negosyo Center"
                ? "treasury"
                : saved.role === "Private Engineer"
                  ? "pengineer"
                  : saved.role === "MPDC"
                    ? "permits"
                    : "app"
          );
        })
        .catch((err) => console.warn("[Auth] restore session failed:", err));
    }

    // Direct permanent tracking URL support: ?track=LUIS-ZC-2026-XXXX
    try {
      const params = new URLSearchParams(window.location.search);
      const trackParam = params.get("track") || params.get("tracking");
      if (trackParam) {
        setTrackingReference(trackParam);
        setScreen("applicant_tracking");
      }
    } catch {
      /* ignore */
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

  const stopMapPointer = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>([]);
  const [riskZones, setRiskZones] = useState<RiskZones | null>(null);
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const raw = localStorage.getItem("infatrack-projects-cache");
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      return list
        .filter((p: any) => !p?.siteMarkerOnly || p?.isPrivateApplication)
        .filter((p: any) => p?.modelType !== "custom" && !p?.customModelUrl);
    } catch {
      return [];
    }
  });
  const [infraFilter, setInfraFilter] = useState<InfraFilter>(DEFAULT_INFRA_FILTER);
  const filteredProjects = useMemo(
    () => filterInfrastructure(Array.isArray(projects) ? projects : [], infraFilter),
    [projects, infraFilter],
  );

  useEffect(() => {
    const id = assetQueryParam();
    if (!id) return;
    if (currentSession && screen === "landing") setScreen("app");
    if (screen !== "app" && screen !== "citizen") return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const ok = cesiumMapRef.current?.flyToProject(id);
      if (ok || tries > 50) window.clearInterval(timer);
    }, 400);
    return () => window.clearInterval(timer);
  }, [screen, currentSession, filteredProjects.length]);

  const [placementMode, setPlacementMode] = useState(false);
  const [newAppModalOpen, setNewAppModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [snapToRoad, setSnapToRoad] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelType>("office");
  const [placementRotation, setPlacementRotation] = useState(0);
  const [placingName, setPlacingName] = useState("");
  const [customModelFile, setCustomModelFile] = useState<File | null>(null);
  const [customModelPreview, setCustomModelPreview] = useState<string | null>(null);
  const [customModelTextureReport, setCustomModelTextureReport] = useState<GlbTextureReport | null>(null);
  /** Approved proposal waiting for MPDC to click the map and pin the site. */
  const [pinProposal, setPinProposal] = useState<PlanningProposal | null>(null);
  const pinProposalRef = useRef<PlanningProposal | null>(null);
  const [pinCitizenApp, setPinCitizenApp] = useState<any | null>(null);
  const pinCitizenAppRef = useRef<any | null>(null);
  const [placementTool, setPlacementTool] = useState<PlacementTool>("pin");
  const [placementColor, setPlacementColor] = useState<string>(MAP_SKETCH_COLORS[0]);
  const [shapesPanelOpen, setShapesPanelOpen] = useState(false);
  const [pendingShapeKind, setPendingShapeKind] = useState<MapShapeKind | null>(null);
  const pendingShapeKindRef = useRef<MapShapeKind | null>(null);
  const [pendingShapeFootprintRef] = useState(() => ({ current: null as { lon: number; lat: number }[] | null }));
  const [selectedSitePin, setSelectedSitePin] = useState<Project | null>(null);
  const [isInspectionQueueOpen, setIsInspectionQueueOpen] = useState(false);
  const [inspectingProject, setInspectingProject] = useState<Project | null>(null);

  const refreshProjects = async () => {
    try {
      const res = await fetch(backendUrl("/api/projects"), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (Array.isArray(data?.projects) ? data.projects : []);
        const list = rawList
          .filter((x: any) => !x?.siteMarkerOnly || x?.isPrivateApplication)
          .filter((x: any) => x?.modelType !== "custom" && !x?.customModelUrl);
        setProjects(list);
      }
    } catch (err) {
      console.warn("refreshProjects error:", err);
    }
  };

  const placementToolbarOpen =
    ((pinProposal || pinCitizenApp) && currentRole === "MPDC" && screen === "app") ||
    (placementMode && currentRole === "Engineer" && screen === "app");
  const [sidebarTab, setSidebarTab] = useState<"notify" | "layers" | "settings" | "account" | "risk" | "projects" | "climate" | "events" | "inspection">("notify");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches
  );

  const inspectionTaskCount = useMemo(() => {
    return projects.filter(
      (p) =>
        p.isPrivateApplication ||
        p.siteMarkerOnly ||
        (p.id && p.id.startsWith("infra-app-")),
    ).length;
  }, [projects]);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [compactChrome, setCompactChrome] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches,
  );
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [planningNotices, setPlanningNotices] = useState<PanelNotice[]>([]);
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<string[]>(() => loadDismissedNoticeIds());
  const [mpdcNotices, setMpdcNotices] = useState<PanelNotice[]>([]);
  const [mpdcDismissedIds, setMpdcDismissedIds] = useState<string[]>(() => loadMpdcDismissedNoticeIds());
  const [planningMeetings, setPlanningMeetings] = useState<PlanningMeeting[]>([]);
  const [planningEvents, setPlanningEvents] = useState<PlanningEvent[]>([]);
  const [opsDismissedIds, setOpsDismissedIds] = useState<string[]>(() => loadOpsDismissedIds());
  const refreshPlanningNoticesRef = useRef<() => void>(() => { });

  // Set default tab based on role permissions
  useEffect(() => {
    if (roleConfig) {
      if (currentRole === "Engineer") setSidebarTab("notify");
      else if (currentRole === "MPDC") setSidebarTab("notify");
      else if (roleConfig.canSeeLayers) setSidebarTab("layers");
      else if (roleConfig.canSeeRisk) setSidebarTab("risk");
      else if (roleConfig.canSeeProjects) setSidebarTab("projects");
      else if (currentRole && currentRole !== "Viewer") setSidebarTab("account");
    }
    if (currentRole !== "Engineer") {
      setEditMode(false);
    }
    if (currentRole !== "MPDC") {
      setPinProposal(null);
      pinProposalRef.current = null;
      setPinCitizenApp(null);
      pinCitizenAppRef.current = null;
    }
    if (currentRole !== "Engineer" && currentRole !== "MPDC") {
      setPlacementMode(false);
    }
  }, [currentRole]);

  useEffect(() => {
    pinProposalRef.current = pinProposal;
  }, [pinProposal]);

  useEffect(() => {
    pinCitizenAppRef.current = pinCitizenApp;
  }, [pinCitizenApp]);

  // Collapse side panel by default on tablet/phone; full map first
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const phone = window.matchMedia("(max-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarCollapsed(true);
    };
    const onPhone = (e: MediaQueryListEvent) => {
      setCompactChrome(e.matches);
      if (!e.matches) setMoreMenuOpen(false);
    };
    if (mq.matches) setSidebarCollapsed(true);
    setCompactChrome(phone.matches);
    mq.addEventListener("change", onChange);
    phone.addEventListener("change", onPhone);
    return () => {
      mq.removeEventListener("change", onChange);
      phone.removeEventListener("change", onPhone);
    };
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
  const [buildingExtrusionOpacity, setBuildingExtrusionOpacity] = useState(BUILDING_EXTRUSION_OPACITY_DEFAULT);
  const [glbModelsOpacity, setGlbModelsOpacity] = useState(1);

  const [barangaysVisible, setBarangaysVisible] = useState(false);
  const [barangayAreas, setBarangayAreas] = useState<BarangayArea[]>([]);
  const [focusedBarangay, setFocusedBarangay] = useState<string | null>(null);

  useEffect(() => {
    if (!barangaysVisible) {
      setFocusedBarangay(null);
      return;
    }
    void loadBarangayAreas()
      .then(setBarangayAreas)
      .catch(() => setBarangayAreas([]));
  }, [barangaysVisible]);

  const [quakeModelEnabled, setQuakeModelEnabled] = useState(false);
  const [quakeStatus, setQuakeStatus] = useState<EarthquakeTrainStatus>({
    state: "idle",
    message: "Off",
    samples: 0,
    accuracy: null,
  });
  const [quakeGrid, setQuakeGrid] = useState<EarthquakeGridCell[]>([]);

  // Keyboard shortcuts: +/- zoom, N = reset north, H = fly home
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't fire when typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.key === "h" || e.key === "H") {
        cesiumMapRef.current?.flyHome();
      }
      const m = mapRef.current;
      if (!m) return;
      if (e.key === "=" || e.key === "+") m.zoomIn({ duration: 300 });
      if (e.key === "-" || e.key === "_") m.zoomOut({ duration: 300 });
      if (e.key === "n" || e.key === "N") m.easeTo({ bearing: 0, pitch: 75, duration: 500 });
      if (e.key === "h" || e.key === "H") m.flyTo({ center: [CENTER.lon, CENTER.lat], zoom: CENTER.zoom, pitch: toggles.satellite ? 75 : 30, bearing: -15, duration: 1200, essential: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggles.satellite]);

  useEffect(() => {
    if (!quakeModelEnabled) {
      setQuakeGrid([]);
      setQuakeStatus({ state: "idle", message: "Off", samples: 0, accuracy: null });
      return;
    }
    let cancelled = false;
    void earthquakeProneModel
      .ensureReady(setQuakeStatus)
      .then(() => earthquakeProneModel.buildMapLayer())
      .then((cells) => {
        if (cancelled) return;
        setQuakeGrid(cells);
        setQuakeStatus({ ...earthquakeProneModel.status });
      })
      .catch((err) => {
        console.error("Earthquake model failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [quakeModelEnabled]);

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
            "Ongoing", PROJECT_STATUS_COLORS.Ongoing,
            "Delayed", PROJECT_STATUS_COLORS.Delayed,
            "Suspended", PROJECT_STATUS_COLORS.Suspended,
            "Planned", PROJECT_STATUS_COLORS.Planned,
            "Planning", PROJECT_STATUS_COLORS.Planned,
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
            "HIGH", "rgba(255,77,79,0.35)",
            "MODERATE", "rgba(255,214,102,0.28)",
            "LOW", "rgba(61,155,95,0.15)",
            "rgba(255,255,255,0.0)",
          ],
          "fill-outline-color": "rgba(255,255,255,0.12)",
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
          "circle-color": "#151c28",
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
          "text-color": "#151c28",
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
  /** Ignore the leftover globe click that would instantly close the new modal. */
  const placementModalReadyRef = useRef(false);
  const pendingEditIdRef = useRef<string | null>(null);
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
  useEffect(() => { pendingShapeKindRef.current = pendingShapeKind; }, [pendingShapeKind]);
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

    const pendingCitizenPin = pinCitizenAppRef.current;
    if (pendingCitizenPin && currentRole === "MPDC") {
      void placeApprovedCitizenSiteAt(pendingCitizenPin, lng, lat, {
        kind: "pin",
        color: placementColor,
        coordinates: [{ lon: lng, lat }],
      });
      return;
    }

    setPendingPlacement({ lng, lat });
    const shapeKind = pendingShapeKindRef.current;
    const catalog = MODEL_CATALOG.find((m) => m.type === selectedModelRef.current);
    setModalProjectName(
      placingNameRef.current.trim() ||
      (shapeKind ? shapeLabel(shapeKind) : `${catalog?.label ?? selectedModelRef.current}`),
    );
    setModalProjectType(
      catalog?.category === "Agriculture" ? "Agricultural Structure" :
        catalog?.category === "Infrastructure" ? "Municipal Project" :
          catalog?.category === "Construction" ? "Municipal Project" : "Private Building"
    );
    setModalDepartment("Engineering");
    setModalStatus("Planned");
    setModalProgress(0);
    setModalDescription(catalog?.description || "");
    placementModalReadyRef.current = false;
    setShowPlacementModal(true);
    window.setTimeout(() => {
      placementModalReadyRef.current = true;
    }, 400);
  }

  function closePlacementModal() {
    setShowPlacementModal(false);
    setPendingPlacement(null);
  }

  function handlePlaceSketch(sketch: MapSketch) {
    const pendingPin = pinProposalRef.current;
    const first = sketch.coordinates[0];
    if (!first) return;
    if (pendingPin && currentRole === "MPDC") {
      void placeApprovedProposalAt(pendingPin, first.lon, first.lat, sketch);
      return;
    }
    const pendingCitizenPin = pinCitizenAppRef.current;
    if (pendingCitizenPin && currentRole === "MPDC") {
      void placeApprovedCitizenSiteAt(pendingCitizenPin, first.lon, first.lat, sketch);
      return;
    }
    if (pendingShapeKindRef.current === "freeform" && sketch.kind === "area" && sketch.coordinates.length >= 3) {
      pendingShapeFootprintRef.current = sketch.coordinates;
      const c = sketchCentroid(sketch.coordinates);
      openPlacementAt({ lng: c.lng, lat: c.lat });
      return;
    }
    // Engineer free placement: use sketch centroid / first point for the GLB modal.
    openPlacementAt({ lng: first.lon, lat: first.lat });
  }

  function startShapePlacement(item: ShapeCatalogItem) {
    if (item.locked) return;
    pendingShapeKindRef.current = item.kind;
    pendingShapeFootprintRef.current = null;
    setPendingShapeKind(item.kind);
    setSelectedModel("shape");
    setPlacingName(item.label);
    setPlacementTool(item.tool);
    setPlacementMode(true);
    setEditMode(false);
    setSidebarCollapsed(true);
    cesiumMapRef.current?.clearSketch();
  }

  function clearPendingShape() {
    pendingShapeKindRef.current = null;
    pendingShapeFootprintRef.current = null;
    setPendingShapeKind(null);
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
    setEditMode(false);
    setSidebarCollapsed(true);
    setScreen("app");
  }

  function startPinCitizenSite(app: any) {
    setPinCitizenApp(app);
    pinCitizenAppRef.current = app;
    setPlacingName(`${app.applicant?.fullName || "Private"} - ${app.property?.proposedBuildingType || "Gusali"}`);
    const isCommercial = app.property?.proposedBuildingType?.toLowerCase().includes("commercial");
    setSelectedModel(isCommercial ? "shop" : "residential");
    setModalDepartment("MPDC");
    setPlacementTool("pin");
    setPlacementColor("#ffc107");
    setPlacementMode(true);
    setEditMode(false);
    setSidebarCollapsed(true);
    setScreen("app");
  }

  async function placeApprovedCitizenSiteAt(
    app: any,
    lng: number,
    lat: number,
    sketch?: MapSketch | null,
  ) {
    const now = new Date().toISOString();
    const mapSketch: MapSketch = sketch ?? {
      kind: "pin",
      color: "#ffc107",
      coordinates: [{ lon: lng, lat }],
    };
    const title = `${app.applicant?.fullName || "Private"} - ${app.property?.proposedBuildingType || "Gusali"} (${app.trackingNumber})`;
    const body = {
      name: title,
      modelType: "office" as ModelType,
      type: "Private Building" as const,
      department: "MPDC" as const,
      status: "Planned" as ProjectStatus,
      progress: 0,
      description: `Citizen Zoning Application: ${app.trackingNumber} | TD: ${app.property?.taxDecNo || "—"} | TCT: ${app.property?.tctNo || "—"} | Area: ${app.property?.lotAreaSqM ? `${app.property.lotAreaSqM} sq.m.` : "—"} | Address: ${app.property?.locationDescription || app.applicant?.address || "Luisiana"}`,
      barangay: app.applicant?.barangay || "Zone I Poblacion",
      fundingSource: "Private / Citizen",
      contractor: "Private Property Owner",
      location: { lat, lon: lng },
      rotation: 0,
      modelLocked: true,
      siteMarkerOnly: true,
      mapSketch,
      markerColor: mapSketch.color,
      lifecyclePhase: "Planning",
    };

    try {
      let createdProject: Project | null = null;
      try {
        const res = await fetch(backendUrl("/api/projects"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json();
          createdProject = data.project;
        }
      } catch (err) {
        console.warn("[App] backend save failed, using local fallback:", err);
      }

      if (!createdProject) {
        createdProject = {
          id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `app-site-${Date.now()}`,
          ...body,
          milestones: [],
          issues: [],
          photos: [],
          activityLog: [{ at: now, message: `Site pinned by MPDC for citizen application ${app.trackingNumber}.` }],
          updatedAt: now,
          archivedAt: null,
        } as Project;
      }

      addProjectToFirestore(createdProject).catch(() => undefined);
      setProjects((prev) => [createdProject!, ...prev]);

      if (app.id) {
        patchCitizenApplication(app.id, {
          notes: app.notes
            ? `${app.notes} [Site Pinned at (${lat.toFixed(5)}, ${lng.toFixed(5)})]`
            : `Site Pinned on 3D Map at coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)}).`,
        }).catch((e) => console.warn("Failed to patch citizen app location note:", e));
      }

      setPinCitizenApp(null);
      pinCitizenAppRef.current = null;
      setPlacementMode(false);
      cesiumMapRef.current?.flyToLonLat(lng, lat, 1800);
      window.alert(
        `Matagumpay na nai-pin sa 3D Mapa ang lokasyon para sa aplikasyon ni ${app.applicant?.fullName || "Aplikante"} (${app.trackingNumber})!`,
      );
    } catch (err) {
      console.error("Failed to pin citizen site:", err);
      window.alert("Failed to pin site. Please try again.");
    }
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
          credentials: "include",
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
    const placedName = modalProjectName.trim();
    if (!placedName) return;
    const fallbackProject: Project = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local-${Date.now()}`,
      name: placedName,
      modelType: pendingShapeKindRef.current ? "shape" : selectedModelRef.current,
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
      mapShape: pendingShapeKindRef.current
        ? makeMapShape(
          pendingShapeKindRef.current,
          pendingShapeKindRef.current === "freeform"
            ? pendingShapeFootprintRef.current ?? undefined
            : undefined,
        )
        : undefined,
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
          credentials: "include",
          body: formData,
        });

        if (uploadRes.ok) {
          const data = await uploadRes.json();
          customModelUrl = data.url;
          if (data.optimized && data.savedPercent > 0) {
            console.info(
              `[upload-model] Auto-optimized custom model: ${(data.originalSize / (1024 * 1024)).toFixed(1)}MB -> ${(data.size / (1024 * 1024)).toFixed(1)}MB (${data.savedPercent}% saved, ${data.drawCallsBefore ?? "?"} -> ${data.drawCallsAfter ?? "?"} draw calls)`,
            );
          }
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
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: placedName,
            modelType: pendingShapeKindRef.current ? "shape" : selectedModelRef.current,
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
            mapShape: pendingShapeKindRef.current
              ? makeMapShape(
                pendingShapeKindRef.current,
                pendingShapeKindRef.current === "freeform"
                  ? pendingShapeFootprintRef.current ?? undefined
                  : undefined,
              )
              : undefined,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Backend save failed: ${res.status}${errorText ? ` - ${errorText}` : ""}`);
        }

        const { project } = await res.json();
        addProjectToFirestore(project).catch((e) => console.warn("[Firestore] sync failed:", e));
        setProjects((prev) => {
          if (prev.some((x) => x.id === project.id)) return prev;
          return [project, ...prev];
        });
        pendingEditIdRef.current = project.id;
      } catch (backendErr) {
        if (selectedModelRef.current === "custom" && !pendingShapeKindRef.current) {
          throw backendErr;
        }

        const localProject: Project = customModelUrl
          ? { ...fallbackProject, customModelUrl }
          : fallbackProject;
        await addProjectToFirestore(localProject);
        setProjects((prev) => [localProject, ...prev]);
        pendingEditIdRef.current = localProject.id;
        console.warn("[Projects] Backend unavailable, saved placement directly to Firestore:", backendErr);
      }

      setShowPlacementModal(false);
      setPendingPlacement(null);
      setModalProjectName("");
      setModalDescription("");
      setPlacementMode(false);
      clearPendingShape();
      setEditMode(true);
      setSnapToRoad(true);
      setSidebarCollapsed(true);
    } catch (err) {
      console.error("Failed to place project:", err);
      const message =
        err instanceof Error && /Failed to fetch|Backend save failed/i.test(err.message)
          ? "Failed to reach the backend server on port 4000. Start the backend, or keep using standard models and the app will save directly to Firestore."
          : "Failed to place building. Please try again.";
      alert(message);
    }
  };

  useEffect(() => {
    const id = pendingEditIdRef.current;
    if (!id || !editMode) return;
    if (!projects.some((p) => p.id === id && !p.siteMarkerOnly)) return;
    pendingEditIdRef.current = null;
    cesiumMapRef.current?.selectProject(id);
  }, [projects, editMode]);

  // Swallow the leftover globe click so it cannot close the placement modal.
  useEffect(() => {
    if (!showPlacementModal) return;
    const blockGhostClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("click", blockGhostClick, true);
    const t = window.setTimeout(() => {
      window.removeEventListener("click", blockGhostClick, true);
      placementModalReadyRef.current = true;
    }, 350);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", blockGhostClick, true);
    };
  }, [showPlacementModal]);

  // ESC key to close placement modal / cancel MPDC site pin
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showPlacementModal) {
        closePlacementModal();
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

  useEffect(() => {
    const socket = connectRealtime(BACKEND_URL);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("risk:update", (z) => setRiskZones(z.zones));
    socket.on("projects:update", (p) => {
      const rawList = Array.isArray(p?.projects) ? p.projects : [];
      const list = rawList
        .filter((x: any) => !x?.siteMarkerOnly || x?.isPrivateApplication)
        .filter((x: any) => x?.modelType !== "custom" && !x?.customModelUrl);
      setProjects(list);
      try {
        localStorage.setItem("infatrack-projects-cache", JSON.stringify(list));
      } catch {
        /* quota */
      }
    });
    socket.on("alerts:new", (a) => setAlerts((prev) => [a, ...prev].slice(0, 8)));
    socket.on("planning:update", () => {
      refreshPlanningNoticesRef.current();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Engineer + MPDC planning notices; all municipal staff get meeting/event data for ops alerts
  useEffect(() => {
    const planningStaff = currentRole === "Engineer" || currentRole === "MPDC";
    const staff = isMunicipalStaff(currentRole);
    if (!staff || !currentSession) {
      setPlanningNotices([]);
      setMpdcNotices([]);
      setPlanningMeetings([]);
      setPlanningEvents([]);
      refreshPlanningNoticesRef.current = () => { };
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const [meetings, events] = await Promise.all([
          fetchPlanningMeetingsOnce(),
          fetchPlanningEventsOnce(),
        ]);
        if (cancelled) return;
        setPlanningMeetings(meetings);
        setPlanningEvents(events);
      } catch (err) {
        console.warn("[Notices] Failed to load meetings/events:", err);
        if (!cancelled) {
          setPlanningMeetings([]);
          setPlanningEvents([]);
        }
      }

      if (!planningStaff) return;
      try {
        const list = await fetchProposalsOnce();
        if (cancelled) return;
        if (currentRole === "Engineer") {
          setPlanningNotices(buildEngineerPlanningNotices(list, currentSession));
        } else if (currentRole === "MPDC") {
          try {
            const apps = await fetchCitizenApplications();
            const appNotices: PanelNotice[] = [];
            for (const a of apps) {
              const subDate = a.createdAt || a.submittedAt || a.updatedAt;
              const payDate =
                a.payment?.paidAt ||
                a.payment?.payment_date ||
                a.payment?.paymentDate ||
                a.payment?.issuedAt ||
                a.updatedAt ||
                a.createdAt;
              const inspDate =
                a.latestInspection?.inspectedAt ||
                a.latestInspection?.timestamp ||
                a.updatedAt ||
                a.createdAt;

              if (a.status === "submitted" || a.status === "pending") {
                appNotices.push({
                  id: `app:${a.id}:submitted`,
                  proposalId: a.id,
                  title: `Bagong Aplikasyon: ${a.trackingNumber}`,
                  message: `${a.applicantName || "Aplikante"} - ${a.projectTitle || "Zoning Permit"}. Isinumite: ${formatRealDate(subDate)}.`,
                  at: subDate || "",
                  kind: "review",
                });
              } else if (a.payment?.status === "paid" || Boolean(a.payment?.orNumber)) {
                appNotices.push({
                  id: `app:${a.id}:paid:${a.payment?.orNumber || "or"}`,
                  proposalId: a.id,
                  title: `Bayad sa Treasury: ${a.payment?.orNumber || "O.R. Issued"}`,
                  message: `₱${Number(a.payment?.amount || 0).toLocaleString()} para kay ${a.applicantName} (${a.trackingNumber}). Nabayaran: ${formatRealDate(payDate)}.`,
                  at: payDate || "",
                  kind: "assigned",
                });
              } else if (a.status === "ocular_inspection" || a.status === "for_ocular_inspection") {
                appNotices.push({
                  id: `app:${a.id}:inspection`,
                  proposalId: a.id,
                  title: `Ocular Inspection: ${a.trackingNumber}`,
                  message: `Site visit sa ${a.barangay || "Luisiana"} para kay ${a.applicantName || "Aplikante"}. Petsa: ${formatRealDate(inspDate)}.`,
                  at: inspDate || "",
                  kind: "review",
                });
              }
            }
            setMpdcNotices([...buildMpdcPlanningNotices(list, currentSession), ...appNotices]);
          } catch {
            setMpdcNotices(buildMpdcPlanningNotices(list, currentSession));
          }
        } else {
          setMpdcNotices(buildMpdcPlanningNotices(list, currentSession));
        }
      } catch (err) {
        console.warn("[Notices] Failed to load planning notifications:", err);
        if (!cancelled) {
          setPlanningNotices([]);
          setMpdcNotices([]);
        }
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
      refreshPlanningNoticesRef.current = () => { };
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

  // MPDC notice derived state + dismiss helpers (parallel to Engineer above)
  const activeMpdcNotices = useMemo(
    () => mpdcNotices.filter((n) => !mpdcDismissedIds.includes(n.id)),
    [mpdcNotices, mpdcDismissedIds],
  );
  const mpdcUnreadCount = activeMpdcNotices.length;

  function dismissMpdcNotice(id: string) {
    setMpdcDismissedIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id].slice(-80);
      try {
        localStorage.setItem(MPDC_DISMISSED_NOTICES_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }

  const opsDept =
    currentRole === "Agriculture" || currentRole === "Negosyo Center"
      ? departmentForRole(currentRole)
      : null;
  const opsAlerts = useMemo(
    () =>
      isMunicipalStaff(currentRole)
        ? buildOpsAlerts(Array.isArray(projects) ? projects : [], planningMeetings, planningEvents, {
          department: opsDept,
        })
        : [],
    [currentRole, projects, planningMeetings, planningEvents, opsDept],
  );
  const activeOpsAlerts = useMemo(
    () => opsAlerts.filter((a) => !opsDismissedIds.includes(a.id)),
    [opsAlerts, opsDismissedIds],
  );
  const opsUnreadCount = activeOpsAlerts.length;
  const notifyBadgeCount =
    (currentRole === "Engineer" ? noticeUnreadCount : currentRole === "MPDC" ? mpdcUnreadCount : 0) +
    opsUnreadCount;

  function persistOpsDismissed(next: string[]) {
    try {
      localStorage.setItem(OPS_DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function dismissOpsAlert(id: string) {
    setOpsDismissedIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id].slice(-120);
      persistOpsDismissed(next);
      return next;
    });
  }

  function dismissAllOpsAlerts() {
    setOpsDismissedIds((prev) => {
      const next = [...new Set([...prev, ...activeOpsAlerts.map((a) => a.id)])].slice(-120);
      persistOpsDismissed(next);
      return next;
    });
  }

  function openOpsAlert(alert: OpsAlert) {
    dismissOpsAlert(alert.id);
    if (alert.open === "planning") setScreen("planning");
    else {
      setSidebarTab("projects");
      setScreen("app");
    }
  }

  function dismissAllMpdcNotices() {
    setMpdcDismissedIds((prev) => {
      const next = [...new Set([...prev, ...activeMpdcNotices.map((n) => n.id)])].slice(-80);
      try {
        localStorage.setItem(MPDC_DISMISSED_NOTICES_KEY, JSON.stringify(next));
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
          riskZones,
          projects,
          nowMs: Date.now(),
        })
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewport, toggles.heatmap, heatMetric, riskZones, projects]);

  // Push risk zones to Mapbox
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !riskZones) return;
    const src = map.getSource("riskZones") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(riskZones as any);
    map.setLayoutProperty("risk-fill", "visibility", toggles.risk ? "visible" : "none");
  }, [riskZones, toggles.risk]);

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
          toggles.satellite ? 1 : 0,
        );
      }

      const opacity = toggles.satellite
        ? Math.min(buildingExtrusionOpacity, 0.4)
        : buildingExtrusionOpacity;
      applyBuildingExtrusionOpacity(map, opacity);
    };

    if (map.isStyleLoaded()) applySatellite();
    else map.once("style.load", applySatellite);
  }, [toggles.satellite, buildingExtrusionOpacity, mapInstance]);

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

  const staffOverlay =
    screen === "planning" ||
    screen === "documents" ||
    screen === "analytics" ||
    screen === "inventory" ||
    screen === "engagement" ||
    screen === "engineer_applications" ||
    screen === "audit";

  /**
   * Only show the municipal 3D map shell for the Engineer role on the map view ("app") or its quick overlays.
   * MPDC role should NEVER see or run this 3D map situation dashboard (it is strictly for Engineer).
   * On standalone pages like Zoning Permits ("permits"), New Application ("new_application"),
   * Negosyo ("negosyo"), Engineer Portal ("pengineer"), Landing, or Tracking:
   * Completely shut down the municipal map so 0% GPU is consumed and no background maps lag the browser.
   */
  const isStandalonePage =
    screen === "permits" ||
    screen === "new_application" ||
    screen === "applicant_tracking" ||
    screen === "treasury" ||
    screen === "negosyo" ||
    screen === "pengineer" ||
    screen === "landing" ||
    screen === "login";

  const showMapShell = !isStandalonePage && (screen === "app" || staffOverlay || mapHold);
  const parkMapShell = showMapShell && screen !== "app";

  // MPDC role defaults to permits, but can view 3D map situation panel when selected
  /* Role separation relaxed: MPDC can toggle between permits and 3D map */

  useEffect(() => {
    if (screen === "app" && currentRole !== "MPDC") setMapHold(true);
    if (screen === "citizen") setCitizenHold(true);
  }, [screen, currentRole]);

  function goHome() {
    const leaving = currentSession;
    setAuditActor(null);
    setCurrentSession(null);
    setMapHold(false);
    setCitizenHold(false);
    setScreen("landing");
    void logoutUser(leaving);
  }

  const showCitizenShell = screen === "citizen" || citizenHold;
  const parkCitizenShell = showCitizenShell && screen !== "citizen";

  return (
    <div
      className={`appShell${sidebarCollapsed || screen !== "app" ? " sidebar-collapsed" : ""
        }${screen !== "app" ? " appShell--fullpage" : ""}`}
    >
      {/* Landing page */}
      {screen === "landing" && (
        <LandingPage
          onEnter={() => setScreen("login")}
          onNewApplication={() => setScreen("new_application")}
          onTrackPermit={() => setScreen("applicant_tracking")}
          onPublicPortal={() => {
            setCurrentSession(sessionForRole("Viewer"));
            setScreen("citizen");
          }}
          onOnlineServices={() => setScreen("new_application")}
        />
      )}

      {/* Login screen */}
      {screen === "login" && (
        <LoginScreen
          onLogin={(session) => {
            setAuditActor(session);
            setCurrentSession(session);
            setScreen(
              session.role === "Barangay Official"
                ? "planning"
                : session.role === "Treasury Office" || session.role === "Negosyo Center"
                  ? "treasury"
                  : session.role === "Private Engineer"
                    ? "pengineer"
                    : session.role === "MPDC"
                      ? "permits"
                      : "app"
            );
          }}
          onBack={() => setScreen("landing")}
        />
      )}

      {/* Dedicated Private Engineer / Professional Portal */}
      {screen === "pengineer" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, overflowY: "auto", background: "#080c14" }}>
          <PrivateEngineerPortal
            onBack={goHome}
            session={currentSession}
            onOpenLiveMap={(lon, lat) => {
              setSidebarCollapsed(false);
              setScreen("app");
              if (lon != null && lat != null) {
                setTimeout(() => {
                  cesiumMapRef.current?.flyToLonLat(lon, lat, 1800);
                }, 400);
              }
            }}
          />
        </div>
      )}

      {/* Dedicated Treasury Office / Cashiering & Local Revenue Page (NO MAP) */}
      {(screen === "treasury" || screen === "negosyo") && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, overflowY: "auto", background: "#080c14" }}>
          <TreasuryOfficePage onLogout={goHome} session={currentSession} />
        </div>
      )}

      {/* Dedicated Project Categorization & New Application Page */}
      {screen === "new_application" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, overflowY: "auto", background: "var(--bg-root, #0b1120)" }}>
          <NewApplicationPage
            onBack={() => setScreen(currentRole === "MPDC" ? "permits" : currentSession ? "app" : "landing")}
            onCreated={(payload, trackingNo) => {
              const newProj: Project = {
                id: `proj_${Date.now()}`,
                name: payload.title,
                type: payload.category === "agricultural" ? "barn" : payload.category === "municipal_project" ? "office" : "office",
                category: payload.category === "agricultural" ? "Agriculture" : payload.category === "municipal_project" ? "Infrastructure" : "Building",
                status: "Planned",
                progress: 0,
                budget: payload.estimatedCostPhp || 0,
                spent: 0,
                department: payload.implementingDepartment || "MPDC",
                location: {
                  lon: payload.lon ?? 121.509513,
                  lat: payload.lat ?? 14.185435,
                  barangay: payload.barangay,
                },
                description: `${
                  payload.category === "agricultural"
                    ? `Agricultural (Poultry/Piggery) Application [${payload.farmType || "Farm"}]`
                    : payload.category === "municipal_project"
                    ? `Municipal Project [${payload.fundingSource || "LGU Fund"}]`
                    : `Private Infrastructure [${payload.buildingType || "Structure"}]`
                } · Tracking: ${trackingNo} · Proponent: ${payload.applicantName}`,
              };
              setProjects((prev) => [newProj, ...prev]);
              addProjectToFirestore(newProj).catch(() => undefined);
            }}
            onTrackApplication={(trackingNo) => {
              setTrackingReference(trackingNo);
              setScreen("applicant_tracking");
            }}
            onViewOnMap={(lon, lat) => {
              setScreen("app");
              if (!currentSession) {
                setCurrentSession(sessionForRole("Admin"));
              }
              setTimeout(() => {
                cesiumMapRef.current?.flyToLonLat(lon, lat, 2200);
              }, 200);
            }}
          />
        </div>
      )}

      {/* Permanent Applicant Permit Tracking Page */}
      {screen === "applicant_tracking" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, overflowY: "auto", background: "var(--bg-root, #0b1120)" }}>
          <ApplicantTrackingPage
            initialTrackingNo={trackingReference}
            onBack={() => setScreen(currentSession ? "app" : "landing")}
          />
        </div>
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
            onOpenOnlineServices={() => setScreen("services")}
          />
        </div>
      )}

      {/* Inventory / Planning / Documents / Analytics / Zoning Permits — overlays */}
      {screen === "inventory" && (
        <InventoryPage
          onBack={() => setScreen(currentRole === "MPDC" ? "permits" : "app")}
          backendProjects={Array.isArray(projects) ? projects : []}
          currentRole={currentRole}
        />
      )}

      {screen === "planning" && currentRole !== "Viewer" && (
        <PlanningPage
          onBack={() => setScreen(currentRole === "MPDC" ? "permits" : "app")}
          session={currentSession}
          projects={Array.isArray(projects) ? projects : []}
        />
      )}

      {screen === "permits" && isMunicipalStaff(currentRole) && (
        <ZoningPermitsPage
          onBack={currentRole === "Engineer" || currentRole === "MPDC" ? () => setScreen("app") : undefined}
          session={currentSession}
          onLogout={goHome}
          onNavigate={(target) => setScreen(target as any)}
        />
      )}

      {screen === "engineer_applications" && (
        <EngineerApplicationsPage
          onBack={() => setScreen("app")}
          session={currentSession}
          onNavigateToProject={(projId) => {
            setScreen("app");
            setTimeout(() => {
              cesiumMapRef.current?.flyToProject(projId);
            }, 350);
          }}
          onApplicationApproved={() => {
            refreshProjects();
          }}
        />
      )}

      {screen === "documents" && isMunicipalStaff(currentRole) && (
        <DocumentsPage onBack={() => setScreen(currentRole === "MPDC" ? "permits" : "app")} session={currentSession} />
      )}

      {screen === "audit" && isMunicipalStaff(currentRole) && (
        <AuditPage onBack={() => setScreen(currentRole === "MPDC" ? "permits" : "app")} />
      )}

      {screen === "analytics" && isMunicipalStaff(currentRole) && (
        <AnalyticsPage
          onBack={() => setScreen(currentRole === "MPDC" ? "permits" : "app")}
          projects={Array.isArray(projects) ? projects : []}
          captureMapPng={() => cesiumMapRef.current?.captureMapPng() ?? Promise.resolve(null)}
        />
      )}

      {screen === "engagement" && roleConfig?.canSeeEngagement && (
        <EngagementPage
          onBack={() => setScreen(currentRole === "MPDC" ? "permits" : "app")}
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
                barangaysVisible={barangaysVisible}
                focusedBarangay={focusedBarangay}
                terrainEnabled={toggles.satellite}
                satellite={toggles.satellite}
                mapSettings={mapSettings}
                earthquakeEnabled={quakeModelEnabled}
                earthquakeGrid={quakeGrid}
                projects={filteredProjects}
                clusteringEnabled={infraFilter.clustering}
                visible={!parkMapShell}
                paused={parkMapShell}
                placementMode={
                  (placementMode && currentRole === "Engineer") ||
                  (placementMode && currentRole === "MPDC" && (Boolean(pinProposal) || Boolean(pinCitizenApp)))
                }
                editMode={false}
                placementTool={placementTool}
                placementColor={placementColor}
                onPlaceClick={openPlacementAt}
                onPlaceSketch={handlePlaceSketch}
                readOnly={currentRole === "Viewer" || isBarangayOfficial(currentRole)}
                canManipulateModels={false}
                canPromoteSitePin={false}
                onProjectPatch={(projectId, patch) => {
                  setProjects((prev) =>
                    prev.map((p) => (p.id === projectId ? { ...p, ...patch } : p)),
                  );
                }}
                canAddPhotos={currentRole === "MPDC" || currentRole === "Engineer"}
                onPhotosChange={(projectId, photos) => {
                  setProjects((prev) =>
                    prev.map((p) => (p.id === projectId ? { ...p, photos } : p)),
                  );
                }}
                onSelectSitePin={(p) => {
                  const hasUploadedPhoto =
                    Boolean((p as any).latestInspection?.photoUrl) ||
                    (Array.isArray((p as any).inspectionPhotos) && (p as any).inspectionPhotos.length > 0) ||
                    (Array.isArray(p.photos) && p.photos.length > 0);

                  // Kung wala pang na-upload na litrato, ilabas agad ang inspection update modal!
                  if (!hasUploadedPhoto && (currentRole === "Engineer" || currentRole === "Admin" || currentRole === "MPDC")) {
                    setInspectingProject(p);
                  } else {
                    setSelectedSitePin(p);
                  }
                }}
                onDeleteBuilding={
                  currentRole === "Engineer"
                    ? async (projectId) => {
                      try {
                        await fetch(backendUrl(`/api/projects/${projectId}`), {
                          method: "DELETE",
                          credentials: "include",
                        });
                      } catch (err) {
                        console.error("Failed to delete project:", err);
                      }
                    }
                    : undefined
                }
              />

              {selectedSitePin && (
                <SiteProgressPopup
                  project={selectedSitePin}
                  onClose={() => setSelectedSitePin(null)}
                  onUpdateProgress={() => setInspectingProject(selectedSitePin)}
                  canInspect={currentRole === "Engineer" || currentRole === "Admin"}
                />
              )}

              <ProjectChat />

              {placementToolbarOpen ? (
                <div className="placement-draw-toolbar">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ lineHeight: 1.35, flex: 1, minWidth: 140 }}>
                      {pinProposal ? (
                        <>
                          <b>Draw site</b> for <b>{pinProposal.title}</b> — pin / draw / area / erase blocks
                        </>
                      ) : pinCitizenApp ? (
                        <>
                          <b>📍 I-pin ang Lokasyon ng Gusali</b> para kay <b>{pinCitizenApp.applicant?.fullName}</b> ({pinCitizenApp.trackingNumber}) — i-click ang lote sa mapa
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
                        setPinCitizenApp(null);
                        pinCitizenAppRef.current = null;
                        setPlacementMode(false);
                        setPlacementTool("pin");
                        clearPendingShape();
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
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setPlacementTool(id);
                          cesiumMapRef.current?.clearSketch();
                        }}
                        style={{
                          cursor: "pointer",
                          padding: "6px 10px",
                          fontWeight: 700,
                          border: "2px solid var(--ink)",
                          background:
                            placementTool === id
                              ? "var(--seed)"
                              : "var(--cream-deep)",
                          color: "var(--ink)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
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
                  </div>

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

              <div className={`topBar${moreMenuOpen ? " is-nav-open" : ""}`}>
                <div className="topBar-brand">
                  <div className="topBar-brand-text">
                    <div className="brand">
                      INFA-TRACK <span className="brand-place">Luisiana</span>
                    </div>
                    <div className="sub">Municipal GIS for safer infrastructure siting</div>
                  </div>
                  <span
                    className="topBar-live-dot"
                    title={connected ? "Live" : "Offline"}
                    aria-label={connected ? "Live connection" : "Offline"}
                    style={{ background: connected ? "var(--accent)" : "rgba(255,77,79,0.9)" }}
                  />
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
                  <nav id="topBar-nav" className={`topBar-nav${moreMenuOpen ? " is-open" : ""}`} aria-label="App sections">
                    {roleConfig?.canSeePlanning && currentRole !== "Viewer" && (
                      <button
                        type="button"
                        className="topBar-nav-link"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setScreen("planning");
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                          <rect x="8" y="2" width="8" height="4" rx="1" />
                          <path d="M9 12h6M9 16h4" />
                        </svg>
                        <span className="topBar-exit-full">
                          {isBarangayOfficial(currentRole) ? "Requests" : "Planning"}
                        </span>
                        <span className="topBar-exit-short">
                          {isBarangayOfficial(currentRole) ? "Req" : "Plan"}
                        </span>
                      </button>
                    )}
                    {currentRole === "Engineer" && (
                      <button
                        type="button"
                        className="topBar-nav-link"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setScreen("engineer_applications");
                        }}
                        style={{ borderColor: "rgba(56, 189, 248, 0.45)", color: "#38bdf8" }}
                        title="Talaan ng mga Bayad na Aplikasyon mula Treasury para sa Engineering Clearance & Pinning"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                        </svg>
                        <span className="topBar-exit-full">Clearance &amp; Pinning</span>
                        <span className="topBar-exit-short">Clearance</span>
                      </button>
                    )}
                    {currentRole === "MPDC" && (
                      <button
                        type="button"
                        className="topBar-nav-link"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setScreen("permits");
                        }}
                        style={currentRole === "MPDC" ? { borderColor: "rgba(255, 193, 7, 0.45)", color: "#ffc107" } : undefined}
                        title="Talaan ng mga Natanggap na Aplikasyon (Zoning Permits)"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                          <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                        </svg>
                        <span className="topBar-exit-full">Permits / Talaan</span>
                        <span className="topBar-exit-short">Permits</span>
                      </button>
                    )}
                    {isMunicipalStaff(currentRole) && (
                      <button
                        type="button"
                        className="topBar-nav-link"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setScreen("documents");
                        }}
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
                    {isMunicipalStaff(currentRole) && (
                      <button
                        type="button"
                        className="topBar-nav-link"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setScreen("analytics");
                        }}
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
                        className="topBar-nav-link"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setScreen("engagement");
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span className="topBar-exit-full">Engagement</span>
                        <span className="topBar-exit-short">Engage</span>
                      </button>
                    )}
                    {isMunicipalStaff(currentRole) && currentRole !== "Negosyo Center" && (
                      <button
                        type="button"
                        className="topBar-nav-link"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setScreen("inventory");
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><rect x="2" y="4" width="20" height="5" rx="1" /><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" /><path d="M10 13h4" /></svg>
                        <span className="topBar-exit-full">Inventory</span>
                        <span className="topBar-exit-short">Inv</span>
                      </button>
                    )}
                    {currentRole === "Viewer" && (
                      <button
                        type="button"
                        className="topBar-nav-link"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setScreen("citizen");
                        }}
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
                          setMoreMenuOpen(false);
                          goHome();
                        }}
                      >
                        <span className="topBar-exit-full">{currentRole === "Viewer" ? "Exit Map" : "Sign Out"}</span>
                        <span className="topBar-exit-short">{currentRole === "Viewer" ? "Exit" : "Out"}</span>
                      </button>
                    )}
                  </nav>
                  {isMunicipalStaff(currentRole) && (
                    <button
                      type="button"
                      className="topBar-nav-link topBar-audit-btn"
                      title="Activity log and audit trail"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setScreen("audit");
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 8v4l2.5 1.5" />
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                      <span className="topBar-exit-full">Activity</span>
                      <span className="topBar-exit-short">Log</span>
                    </button>
                  )}
                  <ThemeToggle iconOnly />
                  <button
                    type="button"
                    className="topBar-moreBtn"
                    aria-expanded={moreMenuOpen}
                    aria-controls="topBar-nav"
                    onClick={() => setMoreMenuOpen((v) => !v)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                      {moreMenuOpen ? (
                        <path d="M18 6L6 18M6 6l12 12" />
                      ) : (
                        <>
                          <line x1="4" y1="7" x2="20" y2="7" />
                          <line x1="4" y1="12" x2="20" y2="12" />
                          <line x1="4" y1="17" x2="20" y2="17" />
                        </>
                      )}
                    </svg>
                    <span>{moreMenuOpen ? "Close" : "Menu"}</span>
                  </button>
                </div>
              </div>
              {moreMenuOpen && (
                <button
                  type="button"
                  className="topBar-nav-backdrop"
                  aria-label="Close menu"
                  onClick={() => setMoreMenuOpen(false)}
                />
              )}


              <MapShortcuts
                canSeeLayers={Boolean(roleConfig?.canSeeLayers)}
                canSeeRisk={Boolean(roleConfig?.canSeeRisk)}
                satellite={toggles.satellite}
                projects={toggles.projects}
                quakeHeat={quakeModelEnabled}
                barangays={barangaysVisible}
                currentStyle={mapSettings.basemapStyle || "outdoors"}
                onSelectStyle={(style) => {
                  setMapSettings((s) => ({ ...s, basemapStyle: style }));
                  if (style === "alidade_satellite") {
                    setToggles((t) => ({ ...t, satellite: true, terrain: true }));
                  } else if (toggles.satellite) {
                    setToggles((t) => ({ ...t, satellite: false, terrain: false }));
                  }
                }}
                coordinates={mapSettings.showCoordinates ?? true}
                labels={mapSettings.showFloatingLabels ?? true}
                placement={placementMode}
                canPlace={currentRole === "Engineer" || currentRole === "MPDC"}
                onPlacement={() => {
                  setPlacementMode((v) => {
                    const next = !v;
                    if (!next) {
                      setPinProposal(null);
                      pinProposalRef.current = null;
                      setPlacementTool("pin");
                      clearPendingShape();
                      cesiumMapRef.current?.clearSketch();
                    }
                    return next;
                  });
                }}
                onSatellite={() =>
                  setToggles((t) => {
                    const next = !t.satellite;
                    return { ...t, satellite: next, terrain: next };
                  })
                }
                onProjects={() => setToggles((t) => ({ ...t, projects: !t.projects }))}
                onBarangays={() => {
                  setBarangaysVisible((v) => !v);
                  setShapesPanelOpen(false);
                }}
                onCoordinates={() =>
                  setMapSettings((s) => ({
                    ...s,
                    showCoordinates: !(s.showCoordinates ?? true),
                  }))
                }
                onLabels={() =>
                  setMapSettings((s) => ({
                    ...s,
                    showFloatingLabels: !(s.showFloatingLabels ?? true),
                  }))
                }
                onQuakeHeat={() => setQuakeModelEnabled((v) => !v)}
                onPointerDown={stopMapPointer}
              />

              {barangaysVisible && roleConfig?.canSeeLayers && (
                <BarangayLegend
                  areas={barangayAreas}
                  selectedName={focusedBarangay}
                  onSelect={(area) => {
                    setFocusedBarangay(area.name);
                    cesiumMapRef.current?.flyToBarangay(area);
                  }}
                  onClose={() => setBarangaysVisible(false)}
                  onPointerDown={stopMapPointer}
                />
              )}

              {/* ── Map Controls ── */}
              <div
                className="map-controls"
                onPointerDown={stopMapPointer}
                onMouseDown={stopMapPointer}
                onWheel={(e) => {
                  e.stopPropagation();
                }}
              >
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
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </button>
                <button
                  className="map-ctrl-btn"
                  title="Toggle Tilt"
                  type="button"
                  onClick={() => cesiumMapRef.current?.toggleTilt()}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 20 L12 4 L22 20" />
                    <line x1="2" y1="20" x2="22" y2="20" />
                  </svg>
                </button>
              </div>

            </div>

            {!sidebarCollapsed && (
              <button
                type="button"
                className="sidePanel-backdrop"
                aria-label="Close live situation panel"
                onClick={() => setSidebarCollapsed(true)}
              />
            )}
            <button
              type="button"
              className={`sidePanel-edgeToggle${sidebarCollapsed ? " is-collapsed" : ""}${isMunicipalStaff(currentRole) && notifyBadgeCount > 0 ? " has-badge" : ""
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
              {isMunicipalStaff(currentRole) && notifyBadgeCount > 0 && (
                <span className="sidePanel-edgeBadge" aria-hidden>{notifyBadgeCount > 9 ? "9+" : notifyBadgeCount}</span>
              )}
            </button>

            <aside className={`sidePanel${sidebarCollapsed ? " is-collapsed" : ""}`} aria-hidden={sidebarCollapsed}>
              <div className="sidePanel-head">
                <div className="sectionTitle">
                  Live Situation Panel
                  {isMunicipalStaff(currentRole) && notifyBadgeCount > 0 && (
                    <span className="sidePanel-titleBadge" aria-label={`${notifyBadgeCount} notifications`}>
                      {notifyBadgeCount}
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
                {isMunicipalStaff(currentRole) && (
                  <button
                    type="button"
                    className={`sidebar-tab${sidebarTab === "notify" ? " active" : ""}`}
                    onClick={() => setSidebarTab("notify")}
                  >
                    Notify
                    {notifyBadgeCount > 0 && (
                      <span className="sidebar-tab-badge">{notifyBadgeCount > 9 ? "9+" : notifyBadgeCount}</span>
                    )}
                  </button>
                )}
                {(currentRole === "Engineer" || currentRole === "Admin" || currentRole === "MPDC") && (
                  <button
                    type="button"
                    className={`sidebar-tab${sidebarTab === "inspection" ? " active" : ""}`}
                    onClick={() => setSidebarTab("inspection")}
                  >
                    Inspection
                    {inspectionTaskCount > 0 && (
                      <span className="sidebar-tab-badge" style={{ background: "#ef4444" }}>
                        {inspectionTaskCount}
                      </span>
                    )}
                  </button>
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
                {(roleConfig?.canSeeLayers || roleConfig?.canSeeRisk) && (
                  <button type="button" className={`sidebar-tab${sidebarTab === "settings" ? " active" : ""}`} onClick={() => setSidebarTab("settings")}>Settings</button>
                )}
                {currentRole && currentRole !== "Viewer" && (
                  <button type="button" className={`sidebar-tab${sidebarTab === "account" ? " active" : ""}`} onClick={() => setSidebarTab("account")}>Account</button>
                )}
              </div>

              {currentRole === "Viewer" && (
                <div className="card viewer-banner" style={{ marginBottom: 12 }}>
                  <div className="sectionTitle" style={{ marginBottom: 4 }}>Public Portal · Live Map</div>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--muted2)", lineHeight: 1.5 }}>
                    View-only map with layers, risk, and projects. Use <strong>Portal</strong> in the top bar for reporting, feedback, and transparency.
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
                          className="side-btn"
                          onClick={dismissAllNotices}
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
                      Planning items for Engineering. Live updates when the workspace changes.
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
                        No open notifications. New returns and Engineering assignments will show up here.
                      </div>
                    )}

                    <NotifyOpsList
                      alerts={activeOpsAlerts}
                      formatAgo={formatAgo}
                      onOpen={openOpsAlert}
                      onDismiss={dismissOpsAlert}
                      onClearAll={dismissAllOpsAlerts}
                    />
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

                {/* ── Dedicated Inspection Tab Content ── */}
                {sidebarTab === "inspection" && (
                  <div style={{ marginBottom: 16 }}>
                    <InspectionTaskQueue
                      embedded={true}
                      projects={projects}
                      selectedProjectId={selectedSitePin?.id}
                      onLocateProject={(p) => {
                        if (p.location) {
                          cesiumMapRef.current?.flyToLonLat(p.location.lon, p.location.lat, 1200);
                          setSelectedSitePin(p);
                        }
                      }}
                      onInspectProject={(p) => {
                        setInspectingProject(p);
                      }}
                    />
                  </div>
                )}

                {/* ── MPDC: Notifications ── */}
                {sidebarTab === "notify" && currentRole === "MPDC" && (
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
                      {activeMpdcNotices.length > 0 && (
                        <button
                          type="button"
                          className="side-btn"
                          onClick={dismissAllMpdcNotices}
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
                      Planning items requiring MPDC action — submissions and approvals. Live updates.
                    </p>
                    {activeMpdcNotices.length ? (
                      <div className="miniList">
                        {activeMpdcNotices.map((n) => (
                          <div
                            key={n.id}
                            className={`alert notice-card notice-${n.kind}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              dismissMpdcNotice(n.id);
                              if (n.id.startsWith("app:")) {
                                setScreen("permits");
                              } else {
                                setScreen("planning");
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                dismissMpdcNotice(n.id);
                                if (n.id.startsWith("app:")) {
                                  setScreen("permits");
                                } else {
                                  setScreen("planning");
                                }
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
                                  dismissMpdcNotice(n.id);
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
                        No open notifications. New submissions and items ready for approval will appear here.
                      </div>
                    )}
                    <NotifyOpsList
                      alerts={activeOpsAlerts}
                      formatAgo={formatAgo}
                      onOpen={openOpsAlert}
                      onDismiss={dismissOpsAlert}
                      onClearAll={dismissAllOpsAlerts}
                    />
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

                {sidebarTab === "notify" &&
                  isMunicipalStaff(currentRole) &&
                  currentRole !== "Engineer" &&
                  currentRole !== "MPDC" && (
                    <div style={{ marginBottom: 12 }}>
                      <div className="sectionTitle" style={{ marginBottom: 8 }}>
                        Notifications
                      </div>
                      <NotifyOpsList
                        alerts={activeOpsAlerts}
                        formatAgo={formatAgo}
                        onOpen={openOpsAlert}
                        onDismiss={dismissOpsAlert}
                        onClearAll={dismissAllOpsAlerts}
                      />
                    </div>
                  )}

                {/* ── Treasury Office / Negosyo: Business Permit Panel ── */}
                {roleConfig?.canSeeBusinessPermits && (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div className="sectionTitle" style={{ marginBottom: 8 }}>Treasury &amp; Local Business Registry</div>
                    <div className="grid2">
                      <div className="stat">
                        <div className="v" style={{ color: "var(--warn)" }}>{projects.filter(p => (p.department === "Treasury Office" || p.department === "Negosyo Center") && p.status === "Ongoing").length}</div>
                        <div className="l">Pending Permits</div>
                      </div>
                      <div className="stat">
                        <div className="v" style={{ color: "var(--safe)" }}>{projects.filter(p => (p.department === "Treasury Office" || p.department === "Negosyo Center") && p.status === "Completed").length}</div>
                        <div className="l">Approved</div>
                      </div>
                      <div className="stat">
                        <div className="v" style={{ color: "var(--muted)" }}>{projects.filter(p => (p.department === "Treasury Office" || p.department === "Negosyo Center") && p.status === "Planned").length}</div>
                        <div className="l">For Review</div>
                      </div>
                      <div className="stat">
                        <div className="v">{projects.filter(p => p.department === "Treasury Office" || p.department === "Negosyo Center").length}</div>
                        <div className="l">Total Records</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Recent Applications</div>
                      <div className="miniList">
                        {projects.filter(p => p.department === "Treasury Office" || p.department === "Negosyo Center").slice(0, 5).map(p => (
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

                {/* ── Settings Tab ── */}
                {sidebarTab === "settings" &&
                  (roleConfig?.canSeeLayers || roleConfig?.canSeeRisk) && (
                    <div className="card" style={{ marginBottom: 12 }}>
                      <div className="sectionTitle" style={{ marginBottom: 8 }}>
                        Settings
                      </div>
                      <div className="hint" style={{ marginBottom: 10 }}>
                        Globe performance and view. Saved on this device.
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
                        <div className="side-seg">
                          {(["low", "medium", "high"] as TerrainQuality[]).map((q) => (
                            <button
                              key={q}
                              type="button"
                              className={`side-seg-btn${mapSettings.terrainQuality === q ? " is-on" : ""}`}
                              onClick={() => setMapSettings((s) => ({ ...s, terrainQuality: q }))}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="toggleRow">
                        <div>
                          <label>Shadows</label>
                          <div className="hint">Soft sun shadows inside Luisiana only (day, near town)</div>
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
                              ? "700 m · hard"
                              : mapSettings.shadowQuality === "high"
                                ? "2.2 km · soft"
                                : "1.6 km · soft"}
                          </span>
                        </div>
                        <div className="side-seg">
                          {(["low", "medium", "high"] as ShadowQuality[]).map((q) => (
                            <button
                              key={q}
                              type="button"
                              className={`side-seg-btn${mapSettings.shadowQuality === q ? " is-on" : ""}`}
                              onClick={() => setMapSettings((s) => ({ ...s, shadowQuality: q }))}
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

                      <div className="toggleRow">
                        <div>
                          <label>Floating 3D badges</label>
                          <div className="hint">Show floating title badges above 3D models</div>
                        </div>
                        <div
                          className={`switch ${mapSettings.showFloatingLabels ?? true ? "on" : ""}`}
                          role="switch"
                          aria-checked={mapSettings.showFloatingLabels ?? true}
                          onClick={() =>
                            setMapSettings((s) => ({
                              ...s,
                              showFloatingLabels: !(s.showFloatingLabels ?? true),
                            }))
                          }
                        />
                      </div>

                      <div className="toggleRow">
                        <div>
                          <label>GPS coordinates</label>
                          <div className="hint">Show latitude/longitude in floating badges</div>
                        </div>
                        <div
                          className={`switch ${mapSettings.showCoordinates ?? true ? "on" : ""}`}
                          role="switch"
                          aria-checked={mapSettings.showCoordinates ?? true}
                          onClick={() =>
                            setMapSettings((s) => ({
                              ...s,
                              showCoordinates: !(s.showCoordinates ?? true),
                            }))
                          }
                        />
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
                        <span className="pill">Motion blur</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={mapSettings.motionBlur}
                          aria-label="Camera motion blur strength"
                          onChange={(e) =>
                            setMapSettings((s) => ({ ...s, motionBlur: Number(e.target.value) }))
                          }
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 52 }}>
                          {mapSettings.motionBlur <= 0
                            ? "Off"
                            : mapSettings.motionBlur <= 30
                              ? `${mapSettings.motionBlur}% soft`
                              : mapSettings.motionBlur <= 70
                                ? `${mapSettings.motionBlur}%`
                                : `${mapSettings.motionBlur}% strong`}
                        </span>
                      </div>
                      <div className="hint" style={{ marginTop: -4, marginBottom: 10, paddingLeft: 2 }}>
                        Streak while panning the globe. 0 is off. Drag, then pan to preview.
                      </div>

                      <button
                        type="button"
                        className="side-btn"
                        style={{ marginBottom: 4 }}
                        onClick={() => setMapSettings({ ...DEFAULT_MAP_SETTINGS })}
                      >
                        Reset settings
                      </button>
                    </div>
                  )}

                {sidebarTab === "account" && currentRole && currentRole !== "Viewer" && (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div className="sectionTitle" style={{ marginBottom: 8 }}>
                      Account
                    </div>
                    <div className="hint" style={{ marginBottom: 8 }}>
                      Signed in as <b>{currentSession?.username || currentRole}</b>
                      {currentSession?.department ? ` · ${currentSession.department}` : ""}.
                      Change this login’s password (at least 8 characters).
                    </div>
                    <ChangePasswordForm />
                  </div>
                )}

                {/* ── Layers Tab ── */}
                {sidebarTab === "layers" && roleConfig?.canSeeLayers && (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div className="sectionTitle" style={{ marginBottom: 8 }}>
                      Layers
                    </div>
                    <div className="hint" style={{ marginBottom: 10 }}>
                      Show or hide map overlays. Globe performance lives in Settings.
                    </div>

                    {(
                      [
                        { k: "projects", title: "Infrastructure Projects", hint: "GLB models on map" },
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

                    {/* Stadia Maps Style Theme */}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--stroke)" }}>
                      <div className="sectionTitle" style={{ marginBottom: 4, fontSize: 12 }}>
                        Stadia Basemap Style
                      </div>
                      <div className="hint" style={{ marginBottom: 8 }}>
                        Choose cartography style: Outdoors, Watercolor, Minimal Light, Dark, Stamen Terrain, Toner B&amp;W, or Satellite.
                      </div>
                      <StadiaStylePicker
                        currentStyle={mapSettings.basemapStyle || "outdoors"}
                        onSelectStyle={(style) => {
                          setMapSettings((s) => ({ ...s, basemapStyle: style }));
                          if (style === "alidade_satellite") {
                            setToggles((t) => ({ ...t, satellite: true, terrain: true }));
                          } else if (toggles.satellite) {
                            setToggles((t) => ({ ...t, satellite: false, terrain: false }));
                          }
                        }}
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
                        Earthquake-prone model
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
                        Heatmap = TensorFlow trained on PHIVOLCS EIL / GSH KMZ labels (not a photocopy of the
                        old sheet). Turn Satellite on for live DEM. Pula = HIGH, iwasan sa siting.
                      </div>
                      <div className="toggleRow" style={{ marginBottom: 10 }}>
                        <div>
                          <label>Show earthquake-prone heatmap</label>
                          <div className="hint">Model fills the municipal grid. Click a hot spot for class.</div>
                        </div>
                        <div
                          className={`switch ${quakeModelEnabled ? "on" : ""}`}
                          role="switch"
                          aria-checked={quakeModelEnabled}
                          onClick={() => setQuakeModelEnabled((v) => !v)}
                        />
                      </div>
                      {quakeModelEnabled && (
                        <div style={{ fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                          {quakeStatus.state === "loading" || quakeStatus.state === "training"
                            ? quakeStatus.message
                            : quakeStatus.state === "failed"
                              ? `Failed: ${quakeStatus.message}`
                              : quakeStatus.state === "ready"
                                ? `Ready · ${quakeStatus.samples} labels${quakeStatus.accuracy != null
                                  ? ` · acc ${(quakeStatus.accuracy * 100).toFixed(0)}%`
                                  : ""
                                }`
                                : quakeStatus.message}
                          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {(["SAFE", "LOW", "MODERATE", "HIGH"] as const).map((c) => (
                              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                <span
                                  style={{
                                    width: 10,
                                    height: 10,
                                    background: classColor(c),
                                    border: "1px solid var(--ink)",
                                  }}
                                />
                                {c}
                              </span>
                            ))}
                          </div>
                          <div style={{ marginTop: 6, color: "var(--muted)" }}>
                            Click a hot spot for class. Pin a site to see {classAdvice("HIGH")} vs {classAdvice("SAFE")}.
                          </div>
                        </div>
                      )}
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
                    <div className="card infra-filter">
                      <div className="sectionTitle" style={{ marginBottom: 10 }}>
                        Filter &amp; cluster
                      </div>
                      <div className="infra-filter-count">
                        Showing <strong>{filteredProjects.length}</strong> of {projects.length} sites
                      </div>
                      <input
                        className="infra-filter-search"
                        type="search"
                        placeholder="Search name, barangay, type…"
                        value={infraFilter.query}
                        onChange={(e) => setInfraFilter((f) => ({ ...f, query: e.target.value }))}
                      />
                      <div className="infra-filter-label">Status</div>
                      <div className="infra-filter-chips">
                        {INFRA_STATUSES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={`infra-chip${infraFilter.statuses.includes(s) ? " is-on" : ""}`}
                            onClick={() =>
                              setInfraFilter((f) => ({ ...f, statuses: toggleListValue(f.statuses, s) }))
                            }
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <div className="infra-filter-label">Type</div>
                      <div className="infra-filter-chips">
                        {INFRA_CATEGORIES.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`infra-chip${infraFilter.categories.includes(c) ? " is-on" : ""}`}
                            onClick={() =>
                              setInfraFilter((f) => ({ ...f, categories: toggleListValue(f.categories, c) }))
                            }
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                      <div className="infra-filter-row">
                        <label>
                          Office
                          <select
                            value={infraFilter.department}
                            onChange={(e) =>
                              setInfraFilter((f) => ({
                                ...f,
                                department: e.target.value as InfraFilter["department"],
                              }))
                            }
                          >
                            <option value="">All offices</option>
                            {INFRA_DEPARTMENTS.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Barangay
                          <select
                            value={infraFilter.barangay}
                            onChange={(e) => setInfraFilter((f) => ({ ...f, barangay: e.target.value }))}
                          >
                            <option value="">All barangays</option>
                            {BARANGAY_LIST.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="infra-filter-cluster">
                        <input
                          type="checkbox"
                          checked={infraFilter.clustering}
                          onChange={(e) => setInfraFilter((f) => ({ ...f, clustering: e.target.checked }))}
                        />
                        Cluster nearby sites when zoomed out
                      </label>
                      <button
                        type="button"
                        className="infra-filter-reset"
                        onClick={() => setInfraFilter(DEFAULT_INFRA_FILTER)}
                      >
                        Reset filters
                      </button>
                    </div>
                    {/* ── Engineer: Place Infrastructure Models ── */}
                    {currentRole === "Engineer" && (
                      <div className="card" style={{ marginBottom: 12 }}>
                        <div className="sectionTitle" style={{ marginBottom: 10 }}>
                          Place Infrastructure
                        </div>

                        {/* Placement toggle */}
                        <button
                          type="button"
                          className={`side-cta${placementMode ? " is-on" : ""}`}
                          onClick={() => {
                            setPlacementMode((v) => {
                              const next = !v;
                              if (next) {
                                setEditMode(false);
                              }
                              return next;
                            });
                          }}
                        >
                          {placementMode ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
                              Placement Mode ON — Click globe to place
                            </span>
                          ) : (
                            <span style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                              Enable Placement Mode
                            </span>
                          )}
                        </button>

                        {/* Snap to Road */}
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 12,
                            fontSize: 12,
                            color: placementMode ? "var(--ink-soft)" : "var(--muted2)",
                            cursor: placementMode ? "pointer" : "not-allowed",
                            opacity: placementMode ? 1 : 0.55,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={snapToRoad}
                            disabled={!placementMode}
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
                              {MODEL_CATALOG.filter((m) => m.category === cat && m.type !== "shape").map((m) => (
                                <button
                                  key={m.type}
                                  type="button"
                                  className={`side-seg-btn${selectedModel === m.type ? " is-on" : ""}`}
                                  onClick={() => {
                                    setSelectedModel(m.type);
                                    clearPendingShape();
                                    if (m.type !== "custom") {
                                      setCustomModelFile(null);
                                      setCustomModelPreview(null);
                                      setCustomModelTextureReport(null);
                                    }
                                  }}
                                  title={m.description}
                                  style={{ textAlign: "left", width: "100%", padding: "8px 10px" }}
                                >
                                  <div style={{ marginBottom: 4, display: "flex", alignItems: "center", color: selectedModel === m.type ? "var(--on-gold)" : "var(--muted)" }}>
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
                            background: "color-mix(in oklch, var(--gold-oklch) 12%, var(--cream))",
                            border: "1px solid color-mix(in oklch, var(--gold-oklch) 40%, var(--stroke))",
                            borderRadius: 2
                          }}>
                            <div style={{ fontSize: 11, color: "var(--seed)", fontWeight: 600, marginBottom: 8 }}>
                              Upload Custom GLB Model
                            </div>
                            <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.45, marginBottom: 8 }}>
                              Blender viewport textures do not count. Image Texture must plug into Principled BSDF
                              Base Color, then File → External Data → Pack Resources, export glTF Binary (.glb).
                              White mesh = maps never made it into the file. Run
                              scripts/blender_fix_materials_for_gltf.py before export. Max 500MB.
                            </div>
                            <input
                              type="file"
                              accept=".glb,.gltf"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setCustomModelFile(file);
                                  setCustomModelPreview(file.name);
                                  setCustomModelTextureReport(null);
                                  void inspectGlbFile(file).then(setCustomModelTextureReport);
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
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                {customModelPreview}
                                {customModelTextureReport && (
                                  <span>
                                    · {customModelTextureReport.texturedMaterials}/{customModelTextureReport.materials} textured
                                  </span>
                                )}
                              </div>
                            )}
                            {customModelTextureReport?.warning && (
                              <div
                                style={{
                                  marginTop: 8,
                                  fontSize: 10,
                                  color: "var(--seed)",
                                  background: "color-mix(in oklch, var(--warn) 12%, var(--cream))",
                                  border: "1px solid color-mix(in oklch, var(--warn) 40%, var(--stroke))",
                                  padding: "8px 10px",
                                  lineHeight: 1.45,
                                }}
                              >
                                {customModelTextureReport.warning}
                              </div>
                            )}
                            <div style={{
                              marginTop: 8,
                              fontSize: 10,
                              color: "var(--muted2)",
                              lineHeight: 1.45,
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 6,
                              padding: "6px 8px",
                              background: "rgba(74, 222, 128, 0.08)",
                              border: "1px solid rgba(74, 222, 128, 0.25)",
                              borderRadius: 2,
                            }}>
                              <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 11 }}>⚡</span>
                              <span style={{ color: "var(--ink-soft)" }}>
                                <strong>Auto-Optimization Enabled:</strong> Uploaded BIM/CAD geometry is automatically merged, textures compressed, and Draco-encoded on the server for instant map rendering.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Placed projects list with delete */}
                        {projects.filter((p) => p.department === "Engineering" && !p.siteMarkerOnly).length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Placed by Engineer</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                              {projects.filter((p) => p.department === "Engineering" && !p.siteMarkerOnly).map((p) => (
                                <div key={p.id} style={{
                                  display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
                                  background: "var(--cream-ink)", borderRadius: 0,
                                  border: "1px solid var(--stroke2)",
                                }}>
                                  <span style={{ display: "flex", alignItems: "center", color: "var(--muted)" }}>
                                    {(() => { const ic = MODEL_CATALOG.find((m) => m.type === p.modelType)?.icon ?? "construction"; const Ic = ModelIcons[ic] ?? ModelIcons.construction; return <Ic size={15} />; })()}
                                  </span>
                                  <span style={{ flex: 1, fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {displayNameForProject(p)}
                                  </span>
                                  <button
                                    type="button"
                                    className="side-btn-danger"
                                    onClick={async () => {
                                      await fetch(backendUrl(`/api/projects/${p.id}`), {
                                        method: "DELETE",
                                        credentials: "include",
                                      });
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
                        projects={filteredProjects}
                        currentRole={currentRole}
                        mapRef={mapRef}
                        cesiumMapRef={cesiumMapRef}
                        readOnly={currentRole === "Viewer" || isBarangayOfficial(currentRole)}
                      />
                    )}
                  </>
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
          className="placement-modal"
          onClick={() => {
            if (!placementModalReadyRef.current) return;
            closePlacementModal();
          }}
        >
          <div
            className="placement-modal-panel modal-content-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              className="placement-modal-close"
              onClick={closePlacementModal}
              title="Close (ESC)"
            >
              ×
            </button>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#fff", lineHeight: 1.3, marginBottom: 4 }}>
                Place New Infrastructure
              </h2>
              <div style={{ fontSize: 12, color: "rgba(238,241,246,0.62)" }}>
                Enter building details before placing on map
              </div>
            </div>

            {/* Form Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Project Name */}
              <div>
                <label className="placement-modal-label">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={modalProjectName}
                  onChange={(e) => setModalProjectName(e.target.value)}
                  placeholder="e.g. Bonifacio Elementary School"
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
                <label className="placement-modal-label">
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
                <label className="placement-modal-label">
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
                  <option value="Treasury Office">Treasury Office</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="placement-modal-label">
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
                <label className="placement-modal-label">
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
                  <label className="placement-modal-label">
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
                  <label className="placement-modal-label">
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
                <label className="placement-modal-label">
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
                <label className="placement-modal-label">
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
              <div className="placement-modal-loc">
                <div style={{ fontSize: 11, color: "rgba(238,241,246,0.62)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Location
                </div>
                <div style={{ fontSize: 12, color: "#eef1f6", fontFamily: "monospace" }}>
                  {pendingPlacement.lat.toFixed(6)}°N, {pendingPlacement.lng.toFixed(6)}°E
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="placement-modal-actions">
              <button
                type="button"
                className="place-modal-cancel"
                onClick={closePlacementModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="place-modal-submit"
                onClick={handlePlaceBuilding}
                disabled={!modalProjectName.trim()}
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

      <InspectionUpdateModal
        isOpen={Boolean(inspectingProject)}
        onClose={() => setInspectingProject(null)}
        project={inspectingProject}
        onSuccess={(_updated) => {
          refreshProjects();
          if (inspectingProject) {
            setSelectedSitePin((prev) =>
              prev?.id === inspectingProject.id
                ? {
                    ...prev,
                    numericProgress: _updated.progress,
                    progress: _updated.progress,
                    stage: _updated.inspectionStage || _updated.stage,
                    latestInspection: _updated.latestInspection,
                    inspectionPhotos: _updated.inspectionPhotos,
                  }
                : prev,
            );
          }
        }}
        currentInspector={currentSession?.fullName || currentSession?.username || "Municipal Engineer"}
      />
    </div>
  );
}

