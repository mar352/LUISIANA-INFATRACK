import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DeckGLOverlay } from "./DeckOverlay";
import { BuildingOverlay } from "./BuildingOverlay";
import type { AlertItem, HeatPoint, Project, RiskZones, WeatherSnapshot } from "../types";
import { MODEL_CATALOG, type ModelType } from "../types";
import { connectRealtime } from "../lib/realtime";
import { buildHeatmapPoints, type BBox, type HeatmapMetric } from "../lib/heatmap";
import { fetchRadarFrames, radarTileUrl, formatRadarTime, type RadarColorScheme, type RadarFrame, RADAR_COLOR_SCHEMES } from "../lib/radar";
import { formatGibsDate, gibsWmtsTileUrl, type GibsLayerId } from "../lib/gibs";
import { getCurrentSolarHour } from "../lib/solar";
import { 
  getTerrainSource, 
  getSatelliteSource, 
  createHillshadeLayer, 
  createSkyLayer,
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
import SunCalc from "suncalc";

// ── RBAC ─────────────────────────────────────────────────────────────────────
type UserRole = "MPDC" | "Engineer" | "Agriculture" | "Negosyo Center";

interface RoleConfig {
  label: string;
  color: string;
  description: string;
  // which side-panel sections are visible
  canSeeWeather: boolean;
  canSeeLayers: boolean;
  canSeeRadar: boolean;
  canSeeRisk: boolean;
  canSeeProjects: boolean;
  canSeeAlerts: boolean;
  canSeeBusinessPermits: boolean;
}

const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  MPDC: {
    label: "MPDC",
    color: "#4a90d9",
    description: "Municipal Planning & Development Coordinator",
    canSeeWeather: true,
    canSeeLayers: true,
    canSeeRadar: true,
    canSeeRisk: true,
    canSeeProjects: true,
    canSeeAlerts: true,
    canSeeBusinessPermits: false,
  },
  Engineer: {
    label: "Engineer",
    color: "#f5a623",
    description: "Infrastructure & Engineering Office",
    canSeeWeather: true,
    canSeeLayers: true,
    canSeeRadar: true,
    canSeeRisk: true,
    canSeeProjects: true,
    canSeeAlerts: true,
    canSeeBusinessPermits: false,
  },
  Agriculture: {
    label: "Agriculture",
    color: "#5cdb95",
    description: "Municipal Agriculture Office",
    canSeeWeather: true,
    canSeeLayers: false,
    canSeeRadar: false,
    canSeeRisk: true,
    canSeeProjects: false,
    canSeeAlerts: true,
    canSeeBusinessPermits: false,
  },
  "Negosyo Center": {
    label: "Negosyo Center",
    color: "#ffd666",
    description: "Business Permit & Licensing Office",
    canSeeWeather: false,
    canSeeLayers: false,
    canSeeRadar: false,
    canSeeRisk: false,
    canSeeProjects: false,
    canSeeAlerts: false,
    canSeeBusinessPermits: true,
  },
};

// Hardcoded credentials for demo (in production, use a real auth backend)
const ROLE_CREDENTIALS: Record<string, UserRole> = {
  "mpdc": "MPDC",
  "engineer": "Engineer",
  "agriculture": "Agriculture",
  "negosyo": "Negosyo Center",
};

// ── SVG icon set ─────────────────────────────────────────────────────────────
const IconMap = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
    <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
);
const IconCloud = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
    <line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="16" y1="19" x2="16" y2="21"/>
  </svg>
);
const IconAlert = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IconBuilding = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    <line x1="6" y1="11" x2="6" y2="11"/><line x1="10" y1="11" x2="10" y2="11"/>
    <line x1="6" y1="15" x2="6" y2="15"/><line x1="10" y1="15" x2="10" y2="15"/>
  </svg>
);
const IconBell = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const IconClipboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
  </svg>
);
const IconGlobe = () => null; // replaced by logo.png
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
const IconPause = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
  </svg>
);
const IconPlay = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);
const IconWarn = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

type FeatureIcon = "map" | "cloud" | "alert" | "building" | "bell" | "clipboard";
const FEATURE_ICON_MAP: Record<FeatureIcon, React.FC> = {
  map: IconMap, cloud: IconCloud, alert: IconAlert,
  building: IconBuilding, bell: IconBell, clipboard: IconClipboard,
};

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

const FEATURES: { icon: FeatureIcon; title: string; desc: string }[] = [
  { icon: "map",       title: "Real-Time GIS Map",        desc: "Live 3D map of Luisiana with risk zones, project markers, and satellite imagery." },
  { icon: "cloud",     title: "Weather & Radar",           desc: "ECMWF IFS forecasts, animated precipitation radar, and NASA GIBS satellite layers." },
  { icon: "alert",     title: "Landslide Risk",            desc: "Automated risk scoring using rainfall intensity and slope data across all barangays." },
  { icon: "building",  title: "Infrastructure Tracking",   desc: "Monitor ongoing municipal, agricultural, and private construction projects in real time." },
  { icon: "bell",      title: "Instant Alerts",            desc: "Automatic HIGH-risk alerts pushed live to relevant departments via WebSocket." },
  { icon: "clipboard", title: "Business Permits",          desc: "Negosyo Center dashboard for tracking permit applications and approvals." },
];

type LandingPage = "overview" | "features" | "departments" | "risk" | "about";

// ── Shared page wrapper ──────────────────────────────────────────────────
const PageWrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
    {/* Subtle grid bg */}
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 1,
      backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
      backgroundSize: "48px 48px" }} />
    <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
  </div>
);

// ── Page: Overview (Hero) ────────────────────────────────────────────────
const PageOverview = ({ onEnter, setActivePage }: { onEnter: () => void; setActivePage: (page: LandingPage) => void }) => (
  <>
    <section style={{
      position: "relative", display: "flex", flexDirection: "column",
      alignItems: "center", textAlign: "center", padding: "120px 24px 80px",
      minHeight: "88vh", justifyContent: "center", overflow: "clip",
    }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(135deg, #060f1e 0%, #0d2137 40%, #071a2e 100%)" }} />
      <video autoPlay muted loop playsInline preload="auto" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.38) saturate(0.75)", transform: "scale(1.04)", zIndex: 1 }}>
        <source src="/hero.mp4" type="video/mp4" />
      </video>
      <div style={{ position: "absolute", inset: 0, zIndex: 2, background: "linear-gradient(to bottom, rgba(6,15,30,0.70) 0%, rgba(6,15,30,0.10) 35%, rgba(6,15,30,0.10) 65%, rgba(6,15,30,0.80) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 2, background: "radial-gradient(ellipse 90% 70% at 50% 50%, transparent 20%, rgba(6,15,30,0.75) 100%)" }} />
      <div style={{ position: "relative", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "rgba(25,195,125,0.10)", border: "1px solid rgba(25,195,125,0.25)", fontSize: 12, color: "#19c37d", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 28 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#19c37d", display: "inline-block", animation: "pulse 2s infinite" }} />
          Live System — Luisiana, Laguna
        </div>
        <img src="/logo.png" alt="Bayan ng Luisiana" style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.18)", marginBottom: 24, boxShadow: "0 0 0 6px rgba(25,195,125,0.08), 0 8px 40px rgba(0,0,0,0.5)" }} />
        <h1 style={{ margin: 0, fontSize: "clamp(32px, 6vw, 58px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.02em", background: "linear-gradient(135deg, #ffffff 30%, rgba(255,255,255,0.55))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", maxWidth: 720 }}>
          Integrated Monitoring Platform for Luisiana LGU
        </h1>
        <p style={{ marginTop: 20, fontSize: 17, color: "rgba(255,255,255,0.55)", maxWidth: 560, lineHeight: 1.65 }}>
          Real-time GIS, disaster risk monitoring, infrastructure tracking, and business permit management — all in one platform built for Luisiana's municipal departments.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 36, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={onEnter} style={{ cursor: "pointer", padding: "13px 32px", borderRadius: 12, background: "linear-gradient(135deg, rgba(25,195,125,0.25), rgba(74,144,217,0.20))", border: "1px solid rgba(25,195,125,0.45)", color: "rgba(255,255,255,0.95)", fontSize: 15, fontWeight: 700 }}>
            Access the Dashboard
          </button>
          <button onClick={() => setActivePage("features")} style={{ cursor: "pointer", padding: "13px 28px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.65)", fontSize: 15, fontWeight: 500 }}>
            Explore Features →
          </button>
        </div>
      </div>
    </section>
    {/* Stats */}
    <div style={{ display: "flex", justifyContent: "center", padding: "0 24px", marginTop: -28, marginBottom: 60, position: "relative", zIndex: 10 }}>
      <div style={{ display: "flex", gap: 0, flexWrap: "wrap", justifyContent: "center", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, background: "rgba(10,22,38,0.80)", backdropFilter: "blur(12px)", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
        {[{ v: "5s", l: "Update Interval" }, { v: "4", l: "Departments" }, { v: "22+", l: "Projects Tracked" }, { v: "Live", l: "Radar & Weather" }].map((s, i) => (
          <div key={i} style={{ padding: "20px 36px", textAlign: "center", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#19c37d" }}>{s.v}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Key Features Highlight */}
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10 }}>Core Capabilities</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "rgba(255,255,255,0.92)", marginBottom: 12 }}>Built for Modern Governance</div>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", maxWidth: 520, margin: "0 auto", lineHeight: 1.65 }}>
          Comprehensive tools designed specifically for Luisiana's municipal operations
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        {[
          { icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#19c37d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>, title: "Real-Time GIS Mapping", desc: "Interactive maps with live data overlays, satellite imagery, and custom layers for comprehensive spatial analysis" },
          { icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff4d4f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>, title: "Disaster Risk Monitoring", desc: "24/7 weather tracking, flood alerts, and risk assessment tools to keep communities safe" },
          { icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>, title: "Infrastructure Tracking", desc: "Monitor all municipal projects, construction progress, and asset management in one place" },
          { icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffd666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>, title: "Business Permit System", desc: "Streamlined permit processing, application tracking, and compliance monitoring" },
          { icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a90d9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, title: "Analytics Dashboard", desc: "Data-driven insights with customizable reports and visualization tools for informed decision-making" },
          { icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5cdb95" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>, title: "Smart Alerts", desc: "Automated notifications for critical events, deadlines, and system updates across all departments" }
        ].map((f, i) => (
          <div key={i} style={{ padding: "28px 24px", background: "rgba(10,22,38,0.60)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, transition: "all 0.3s ease" }}>
            <div style={{ marginBottom: 16 }}>{f.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)", marginBottom: 10 }}>{f.title}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.65 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Trusted By Section */}
    <div style={{ background: "rgba(10,22,38,0.40)", padding: "60px 32px", marginBottom: 60 }}>
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 16 }}>Serving Luisiana</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.92)", marginBottom: 32 }}>Trusted by Municipal Departments</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
          {[
            { name: "MDRRMO", desc: "Disaster Risk Reduction" },
            { name: "MPDC", desc: "Planning & Development" },
            { name: "Engineering", desc: "Infrastructure Projects" },
            { name: "Business Permits", desc: "Licensing & Compliance" }
          ].map((d, i) => (
            <div key={i} style={{ padding: "24px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#19c37d", marginBottom: 6 }}>{d.name}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>{d.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Quick Access CTA */}
    <div style={{ maxWidth: 800, margin: "0 auto 80px", padding: "0 32px" }}>
      <div style={{ padding: "48px 40px", background: "linear-gradient(135deg, rgba(25,195,125,0.08), rgba(74,144,217,0.06))", border: "1px solid rgba(25,195,125,0.20)", borderRadius: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.95)", marginBottom: 12 }}>Ready to Get Started?</div>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", marginBottom: 32, lineHeight: 1.65 }}>
          Access the full platform and start monitoring your municipality in real-time
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onEnter} style={{ cursor: "pointer", padding: "14px 36px", borderRadius: 12, background: "linear-gradient(135deg, rgba(25,195,125,0.30), rgba(74,144,217,0.25))", border: "1px solid rgba(25,195,125,0.50)", color: "rgba(255,255,255,0.98)", fontSize: 15, fontWeight: 700 }}>
            Launch Dashboard
          </button>
          <button onClick={() => setActivePage("about")} style={{ cursor: "pointer", padding: "14px 32px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.70)", fontSize: 15, fontWeight: 500 }}>
            Learn More
          </button>
        </div>
      </div>
    </div>
  </>
);

// ── Page: Features ───────────────────────────────────────────────────────
const PageFeatures = ({ onEnter }: { onEnter: () => void }) => (
  <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 32px 80px" }}>
    <div style={{ textAlign: "center", marginBottom: 48 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10 }}>Platform Capabilities</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: "rgba(255,255,255,0.92)", marginBottom: 12 }}>Everything your LGU needs</div>
      <div style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", maxWidth: 520, margin: "0 auto", lineHeight: 1.65 }}>
        Six integrated modules covering every aspect of municipal monitoring and management.
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
      {FEATURES.map((f) => {
        const Icon = FEATURE_ICON_MAP[f.icon];
        return (
          <div key={f.title} style={{ padding: "28px 24px", background: "rgba(10,22,38,0.60)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, marginBottom: 16, background: "rgba(25,195,125,0.08)", border: "1px solid rgba(25,195,125,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#19c37d" }}>
              <Icon />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.92)", marginBottom: 8 }}>{f.title}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.65 }}>{f.desc}</div>
          </div>
        );
      })}
    </div>
    <div style={{ marginTop: 48, textAlign: "center" }}>
      <button onClick={onEnter} style={{ cursor: "pointer", padding: "13px 36px", borderRadius: 12, background: "linear-gradient(135deg, rgba(25,195,125,0.22), rgba(74,144,217,0.18))", border: "1px solid rgba(25,195,125,0.40)", color: "rgba(255,255,255,0.95)", fontSize: 15, fontWeight: 700 }}>
        Sign In to Access All Features →
      </button>
    </div>
  </div>
);

// ── Page: Departments ────────────────────────────────────────────────────
const PageDepartments = ({ onEnter }: { onEnter: () => void }) => (
  <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 32px 80px" }}>
    <div style={{ textAlign: "center", marginBottom: 48 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10 }}>Role-Based Access Control</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: "rgba(255,255,255,0.92)", marginBottom: 12 }}>Department Accounts</div>
      <div style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", maxWidth: 520, margin: "0 auto", lineHeight: 1.65 }}>
        Each department has a dedicated dashboard showing only the data relevant to their role.
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
      {(Object.entries(ROLE_CONFIGS) as [UserRole, RoleConfig][]).map(([, cfg]) => (
        <div key={cfg.label} style={{ padding: "28px 24px", borderRadius: 18, background: "rgba(10,22,38,0.60)", backdropFilter: "blur(8px)", border: `1px solid ${cfg.color}25` }}>
          <div style={{ display: "inline-block", padding: "5px 12px", borderRadius: 999, background: `${cfg.color}18`, border: `1px solid ${cfg.color}35`, fontSize: 13, fontWeight: 700, color: cfg.color, marginBottom: 14 }}>{cfg.label}</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 16 }}>{cfg.description}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              cfg.canSeeWeather && "Weather & Forecast",
              cfg.canSeeLayers && "Map Layer Controls",
              cfg.canSeeRadar && "Radar Animation",
              cfg.canSeeRisk && "Risk Zone Monitoring",
              cfg.canSeeProjects && "Infrastructure Projects",
              cfg.canSeeAlerts && "Real-Time Alerts",
              cfg.canSeeBusinessPermits && "Business Permit Dashboard",
            ].filter(Boolean).map(item => (
              <div key={item as string} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {item}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div style={{ marginTop: 48, textAlign: "center" }}>
      <button onClick={onEnter} style={{ cursor: "pointer", padding: "13px 36px", borderRadius: 12, background: "linear-gradient(135deg, rgba(25,195,125,0.22), rgba(74,144,217,0.18))", border: "1px solid rgba(25,195,125,0.40)", color: "rgba(255,255,255,0.95)", fontSize: 15, fontWeight: 700 }}>
        Sign In to Your Department →
      </button>
    </div>
  </div>
);

// ── Page: Risk Monitoring ────────────────────────────────────────────────
const PageRisk = () => (
  <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 32px 80px" }}>
    <div style={{ textAlign: "center", marginBottom: 48 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10 }}>Disaster Preparedness</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: "rgba(255,255,255,0.92)", marginBottom: 12 }}>Real-Time Risk Monitoring</div>
      <div style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", maxWidth: 560, margin: "0 auto", lineHeight: 1.65 }}>
        INFA-TRACK continuously evaluates landslide and flood risk across all barangays using live rainfall data and terrain slope analysis.
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 32 }}>
      {[
        { level: "HIGH", color: "#ff4d4f", bg: "rgba(255,77,79,0.08)", border: "rgba(255,77,79,0.20)", title: "High Risk Alert", desc: "Triggered when rainfall intensity exceeds 72% and slope index is above 62%. Immediate evacuation advisory is issued to affected barangays." },
        { level: "MODERATE", color: "#ffd666", bg: "rgba(255,214,102,0.08)", border: "rgba(255,214,102,0.20)", title: "Moderate Risk", desc: "Issued when combined risk score exceeds 55% or rainfall alone is above 45%. Departments are notified to prepare response teams." },
        { level: "LOW", color: "#5cdb95", bg: "rgba(92,219,149,0.08)", border: "rgba(92,219,149,0.20)", title: "Low Risk / Safe", desc: "Normal conditions. Infrastructure and agricultural activities may proceed. System continues passive monitoring every 5 seconds." },
      ].map(r => (
        <div key={r.level} style={{ padding: "28px 24px", borderRadius: 18, background: r.bg, border: `1px solid ${r.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: r.color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, display: "inline-block" }} />{r.level}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.92)", marginBottom: 10 }}>{r.title}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.65 }}>{r.desc}</div>
        </div>
      ))}
    </div>
    <div style={{ padding: "28px 32px", borderRadius: 18, background: "rgba(10,22,38,0.60)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", flexWrap: "wrap", gap: 32, alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>How the model works</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.7 }}>
          Risk score = <span style={{ color: "#19c37d" }}>Rainfall Intensity × 0.65</span> + <span style={{ color: "#4a90d9" }}>Slope Index × 0.55</span>. Data sourced from ECMWF IFS weather model and OpenStreetMap terrain, updated every 5 seconds via WebSocket.
        </div>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {[{ l: "Update Rate", v: "5s" }, { l: "Data Source", v: "ECMWF IFS" }, { l: "Coverage", v: "All Barangays" }].map(s => (
          <div key={s.l} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#19c37d" }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── Page: About ──────────────────────────────────────────────────────────
const PageAbout = ({ onEnter }: { onEnter: () => void }) => (
  <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 32px 80px" }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 48, alignItems: "start" }}>
      <div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10 }}>About the System</div>
        <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 20, lineHeight: 1.15 }}>Built for Luisiana's Municipal Government</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.8, marginBottom: 16 }}>
          INFA-TRACK is an integrated GIS-based monitoring platform developed specifically for the Municipality of Luisiana, Laguna. It consolidates infrastructure tracking, disaster risk assessment, weather monitoring, and business permit management into a single real-time dashboard.
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.8, marginBottom: 32 }}>
          The system uses open-data sources — ECMWF IFS weather model, OpenStreetMap, NASA GIBS, and RainViewer radar — ensuring zero licensing cost while maintaining high data accuracy for LGU decision-making.
        </div>
        <button onClick={onEnter} style={{ cursor: "pointer", padding: "12px 28px", borderRadius: 12, background: "linear-gradient(135deg, rgba(25,195,125,0.22), rgba(74,144,217,0.18))", border: "1px solid rgba(25,195,125,0.40)", color: "rgba(255,255,255,0.95)", fontSize: 14, fontWeight: 700 }}>
          Sign In to Dashboard →
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { label: "Municipality", value: "Luisiana" },
          { label: "Province", value: "Laguna" },
          { label: "Region", value: "IV-A CALABARZON" },
          { label: "System Type", value: "Real-Time GIS" },
          { label: "Data Updates", value: "Every 5 seconds" },
          { label: "Weather Model", value: "ECMWF IFS 0.25°" },
          { label: "Map Provider", value: "OpenFreeMap / ESRI" },
          { label: "Radar Source", value: "RainViewer API" },
        ].map(item => (
          <div key={item.label} style={{ padding: "16px", borderRadius: 12, background: "rgba(10,22,38,0.60)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

function LandingPage({ onEnter }: { onEnter: () => void }) {
  const [activePage, setActivePage] = useState<LandingPage>("overview");

  const NAV_LINKS: { label: string; page: LandingPage }[] = [
    { label: "Overview",        page: "overview" },
    { label: "Features",        page: "features" },
    { label: "Departments",     page: "departments" },
    { label: "Risk Monitoring", page: "risk" },
    { label: "About",           page: "about" },
  ];

  const PAGE_MAP = useMemo<Record<LandingPage, React.FC<{ onEnter: () => void; setActivePage?: (page: LandingPage) => void }>>>(() => ({
    overview: (props) => <PageOverview {...props} setActivePage={setActivePage} />,
    features: PageFeatures,
    departments: PageDepartments,
    risk: PageRisk,
    about: PageAbout,
  }), [setActivePage]);
  
  const ActivePage = PAGE_MAP[activePage];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "linear-gradient(160deg, #060f1e 0%, #081322 50%, #0a1a2e 100%)",
      display: "flex", flexDirection: "column",
    }}>
      {/* Subtle grid overlay */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

      {/* Nav */}
      <nav style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 32px", background: "rgba(6,15,30,0.85)", backdropFilter: "blur(14px)", borderBottom: "1px solid rgba(255,255,255,0.06)", gap: 24, flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, cursor: "pointer" }} onClick={() => setActivePage("overview")}>
          <img src="/logo.png" alt="Bayan ng Luisiana seal" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(255,255,255,0.15)" }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>INFA-TRACK</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Luisiana LGU</div>
          </div>
        </div>
        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, justifyContent: "center" }}>
          {NAV_LINKS.map(link => (
            <button key={link.page} onClick={() => setActivePage(link.page)} style={{
              cursor: "pointer", padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
              border: "none", background: activePage === link.page ? "rgba(255,255,255,0.08)" : "transparent",
              color: activePage === link.page ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)",
              borderBottom: activePage === link.page ? "2px solid #19c37d" : "2px solid transparent",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (activePage !== link.page) { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.90)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; } }}
            onMouseLeave={e => { if (activePage !== link.page) { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; } }}
            >
              {link.label}
            </button>
          ))}
        </div>
        {/* CTA */}
        <button onClick={onEnter} style={{ cursor: "pointer", padding: "8px 20px", borderRadius: 999, flexShrink: 0, background: "rgba(25,195,125,0.15)", border: "1px solid rgba(25,195,125,0.40)", color: "#19c37d", fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          Sign In
        </button>
      </nav>

      {/* Page content */}
      <PageWrap><ActivePage onEnter={onEnter} /></PageWrap>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

function LoginScreen({ onLogin, onBack }: { onLogin: (role: UserRole) => void; onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const role = ROLE_CREDENTIALS[username.toLowerCase().trim()];
    if (role && password === "impact2024") {
      onLogin(role);
    } else {
      setError("Invalid credentials. Please try again.");
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "linear-gradient(160deg, #060f1e 0%, #081322 50%, #0a1a2e 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Grid bg */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />

      <button
          onClick={onBack}
          style={{
            position: "fixed", top: 20, left: 24, zIndex: 10,
            cursor: "pointer", background: "rgba(10,22,38,0.70)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.70)", fontSize: 13,
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 999,
          }}
        >
          ← Back to home
        </button>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420, padding: "0 16px" }}>

        <div style={{
          background: "rgba(10,22,38,0.90)", backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.10)", borderRadius: 20, padding: 36,
        }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <img src="/logo.png" alt="Bayan ng Luisiana seal" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.12)", margin: "0 auto 14px", display: "block" }} />
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>INFA-TRACK Luisiana</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
              Sign in to your department account
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 7 }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                autoFocus
                onChange={e => { setUsername(e.target.value); setError(""); }}
                placeholder="mpdc / engineer / agriculture / negosyo"
                style={{
                  width: "100%", padding: "11px 14px",
                  background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 10, color: "rgba(255,255,255,0.9)", fontSize: 14, outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 7 }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  style={{
                    width: "100%", padding: "11px 42px 11px 14px",
                    background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 10, color: "rgba(255,255,255,0.9)", fontSize: 14, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "rgba(255,255,255,0.35)", padding: 0, display: "flex", alignItems: "center",
                  }}
                >
                  {showPassword ? (
                    // Eye-off icon
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    // Eye icon
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {error && (
              <div style={{ marginBottom: 14, padding: "9px 12px", background: "rgba(255,77,79,0.10)", border: "1px solid rgba(255,77,79,0.30)", borderRadius: 8, fontSize: 13, color: "#ff4d4f" }}>
                {error}
              </div>
            )}
            <button type="submit" style={{
              width: "100%", padding: "12px",
              background: "linear-gradient(135deg, rgba(25,195,125,0.22), rgba(74,144,217,0.18))",
              border: "1px solid rgba(25,195,125,0.40)",
              borderRadius: 10, color: "rgba(255,255,255,0.95)",
              fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em",
            }}>
              Sign In to Dashboard
            </button>
          </form>

          <div style={{ marginTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Department Accounts
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(Object.entries(ROLE_CONFIGS) as [UserRole, RoleConfig][]).map(([, cfg]) => (
                <div key={cfg.label} style={{
                  padding: "8px 10px",
                  background: "rgba(0,0,0,0.15)", border: `1px solid ${cfg.color}28`, borderRadius: 10,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2, lineHeight: 1.3 }}>{cfg.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || "http://localhost:4000";

// OpenFreeMap Liberty — free vector tiles with OSM building footprints + heights.
// No API key needed. Buildings have render_height / render_min_height properties.
const VECTOR_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

type LayerToggles = {
  satellite: boolean;
  terrain: boolean;
  heatmap: boolean;
  weather: boolean;
  radar: boolean;
  gibsPrecip: boolean;
  risk: boolean;
  projects: boolean;
  stormTrack: boolean;
};

const DEFAULT_TOGGLES: LayerToggles = {
  satellite: false,
  terrain: false,
  heatmap: false,
  weather: false,
  radar: true,
  gibsPrecip: false,
  risk: true,
  projects: true,
  stormTrack: false,
};

const CENTER = { lat: 14.19, lon: 121.51, zoom: 11.4 };

function levelColor(level: "LOW" | "MODERATE" | "HIGH") {
  if (level === "HIGH") return "rgba(255, 77, 79, 0.55)";
  if (level === "MODERATE") return "rgba(255, 214, 102, 0.45)";
  return "rgba(92, 219, 149, 0.30)";
}

function formatAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}

function footprintSquare(lon: number, lat: number, halfSizeMeters: number) {
  const dLat = halfSizeMeters / 111320;
  const dLon = halfSizeMeters / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ];
}

function buildRadarLayers(
  map: MapLibreMap,
  radarHost: string,
  frames: RadarFrame[],
  colorScheme: RadarColorScheme,
  frameIdx: number,
  visible: boolean,
  opacity: number
) {
  // Tear down any existing radar layers/sources first.
  for (let i = 0; i < 20; i++) {
    if (map.getLayer(`radar-${i}`)) map.removeLayer(`radar-${i}`);
    if (map.getSource(`radar-src-${i}`)) map.removeSource(`radar-src-${i}`);
  }

  const beforeLayer = map.getLayer("gibs-imerg-layer") ? "gibs-imerg-layer" : (map.getLayer("risk-fill") ? "risk-fill" : undefined);

  for (let i = 0; i < frames.length; i++) {
    const tileUrl = radarTileUrl(radarHost, frames[i].path, colorScheme);
    map.addSource(`radar-src-${i}`, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 12,
    } as any);
    map.addLayer(
      {
        id: `radar-${i}`,
        type: "raster",
        source: `radar-src-${i}`,
        paint: {
          "raster-opacity": visible && i === frameIdx ? opacity : 0,
          "raster-resampling": "linear",
        },
      } as any,
      beforeLayer
    );
  }
}

export default function App() {
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  // Separate state so React re-renders overlays when the map instance is ready
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);

  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [screen, setScreen] = useState<"landing" | "login" | "app">("landing");
  const roleConfig = currentRole ? ROLE_CONFIGS[currentRole] : null;

  const [connected, setConnected] = useState(false);
  const [toggles, setToggles] = useState<LayerToggles>(DEFAULT_TOGGLES);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>([]);
  const [riskZones, setRiskZones] = useState<RiskZones | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [placementMode, setPlacementMode] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelType>("office");
  const [placementRotation, setPlacementRotation] = useState(0);
  const [placingName, setPlacingName] = useState("");
  const [customModelFile, setCustomModelFile] = useState<File | null>(null);
  const [customModelPreview, setCustomModelPreview] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"weather" | "layers" | "radar" | "risk" | "projects" | "climate" | "events">("weather");
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  // Set default tab based on role permissions
  useEffect(() => {
    if (roleConfig) {
      if (roleConfig.canSeeWeather) setSidebarTab("weather");
      else if (roleConfig.canSeeLayers) setSidebarTab("layers");
      else if (roleConfig.canSeeRisk) setSidebarTab("risk");
      else if (roleConfig.canSeeProjects) setSidebarTab("projects");
    }
  }, [currentRole]);
  const [heatMetric, setHeatMetric] = useState<HeatmapMetric>("combined");
  const [viewport, setViewport] = useState<{ bbox: BBox; zoom: number } | null>(null);
  const [radarHost, setRadarHost] = useState<string | null>(null);
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [radarFrameIdx, setRadarFrameIdx] = useState(0);
  const [radarPlaying, setRadarPlaying] = useState(true);
  const [radarColorScheme, setRadarColorScheme] = useState<RadarColorScheme>(6);
  const [radarOpacity, setRadarOpacity] = useState(0.9);
  const [gibsLayer, setGibsLayer] = useState<GibsLayerId>("IMERG_Precipitation_Rate");
  const [gibsDate, setGibsDate] = useState(() => {
    // GIBS layers often lag “today” availability. Default to yesterday (UTC) to avoid 404 tiles.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return formatGibsDate(d);
  });
  const [gibsOpacity, setGibsOpacity] = useState(0.62);
  const [gibsStatus, setGibsStatus] = useState<"loading" | "ok" | "unavailable">("loading");

  // NASA EONET Natural Events
  const [eonetEvents, setEonetEvents] = useState<EONETEvent[]>([]);
  const [eonetEnabled, setEonetEnabled] = useState(false);
  const [eonetLoading, setEonetLoading] = useState(false);
  const [eonetCategories, setEonetCategories] = useState<string[]>(["wildfires", "severeStorms", "volcanoes", "earthquakes", "floods"]);
  const [eonetRadius, setEonetRadius] = useState(1000); // km radius from Luisiana

  // Map bearing for compass display
  const [mapBearing, setMapBearing] = useState(-15);

  // Keyboard shortcuts: +/- zoom, N = reset north, H = fly home
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = mapRef.current;
      if (!m) return;
      // Don't fire when typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.key === "=" || e.key === "+") m.zoomIn({ duration: 300 });
      if (e.key === "-" || e.key === "_") m.zoomOut({ duration: 300 });
      if (e.key === "n" || e.key === "N") m.easeTo({ bearing: 0, pitch: 62, duration: 500 });
      if (e.key === "h" || e.key === "H") m.flyTo({ center: [CENTER.lon, CENTER.lat], zoom: CENTER.zoom, pitch: toggles.terrain ? 62 : 30, bearing: -15, duration: 1200, essential: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggles.terrain]);

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

  const topRisk = useMemo(() => {
    const feats = riskZones?.features || [];
    const high = feats.filter((f) => f.properties.level === "HIGH");
    if (high.length) return { level: "HIGH" as const, count: high.length };
    const mod = feats.filter((f) => f.properties.level === "MODERATE");
    if (mod.length) return { level: "MODERATE" as const, count: mod.length };
    return { level: "LOW" as const, count: feats.length ? feats.length : 0 };
  }, [riskZones]);

  const radarStateRef = useRef<{ host: string; frames: RadarFrame[]; colorScheme: RadarColorScheme } | null>(null);

  // Clear map when leaving the app screen
  useEffect(() => {
    if (screen !== "app" && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, [screen]);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    if (screen !== "app") return; // Only initialize when on app screen

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: VECTOR_STYLE_URL,
      center: [CENTER.lon, CENTER.lat],
      zoom: CENTER.zoom,
      pitch: 30,
      bearing: -15,
      attributionControl: false,
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
      setMapBearing(map.getBearing());
    };

    map.on("load", () => {
      pushViewport();

      // ── 3D Buildings (Apple Maps style) ──────────────────────────────────
      // OpenFreeMap Liberty already has a "building" source layer with
      // render_height and render_min_height. We add our own fill-extrusion
      // on top with warm beige colors.

      // Remove the default flat building fill from Liberty style if present
      if (map.getLayer("building")) map.removeLayer("building");
      if (map.getLayer("building-top")) map.removeLayer("building-top");

      // All OSM buildings — warm beige like Apple Maps
      map.addLayer({
        id: "3d-buildings",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 12,
        paint: {
          "fill-extrusion-color": [
            "interpolate", ["linear"], ["coalesce", ["get", "render_height"], 0],
            0,   "#e8dcc8",
            10,  "#ddd0b8",
            30,  "#d4c8ae",
            80,  "#c8bca0",
            200, "#b8ac90",
          ],
          "fill-extrusion-height": [
            "interpolate", ["linear"], ["zoom"],
            12, 0,
            13, ["coalesce", ["get", "render_height"], 6],
          ],
          "fill-extrusion-base": [
            "coalesce", ["get", "render_min_height"], 0,
          ],
          "fill-extrusion-opacity": 0.92,
        },
      } as any);

      // Project location dots — simple markers, GLB models rendered by BuildingOverlay
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
            "Completed", "#4a90d9",
            "Ongoing",   "#f5a623",
            "Planning",  "#9b9b9b",
            "#4a90d9",
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.85,
        },
      });

      // ── Satellite imagery source (Enhanced WebGL with multiple providers) ──
      const satelliteSource = getSatelliteSource("esri");
      map.addSource("satellite", {
        type: "raster",
        tiles: satelliteSource.tiles,
        tileSize: satelliteSource.tileSize,
        maxzoom: satelliteSource.maxzoom,
        attribution: satelliteSource.attribution,
      });

      // ── Terrain DEM (WebGL-optimized with Terrarium encoding) ──
      const terrainSource = getTerrainSource("terrarium");
      map.addSource("terrain-dem", {
        type: "raster-dem",
        tiles: terrainSource.tiles,
        tileSize: terrainSource.tileSize,
        encoding: terrainSource.encoding as any,
        maxzoom: terrainSource.maxzoom,
      } as any);

      // ── Apply WebGL optimizations for better performance ──
      applyWebGLOptimizations(map, "balanced");

      // ── Add Sky layer for atmospheric effect ──
      try {
        const skyLayer = createSkyLayer();
        map.addLayer(skyLayer as any);
      } catch (e) {
        console.warn("Sky layer not supported:", e);
      }

      // ── Add Hillshade layer for terrain depth ──
      try {
        const hillshadeLayer = createHillshadeLayer(0.35);
        map.addLayer(hillshadeLayer as any, "3d-buildings");
      } catch (e) {
        console.warn("Hillshade layer not supported:", e);
      }

      // ── GIBS precipitation (added before satellite so satellite sits on top) ──
      map.addSource("gibs-imerg", {
        type: "raster",
        tiles: [gibsWmtsTileUrl({ layer: gibsLayer, date: gibsDate })],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 6,
      } as any);
      map.addLayer({
        id: "gibs-imerg-layer",
        type: "raster",
        source: "gibs-imerg",
        paint: {
          "raster-opacity": DEFAULT_TOGGLES.gibsPrecip ? gibsOpacity : 0,
          "raster-resampling": "linear",
        },
      } as any);

      // Satellite goes above GIBS, below 3d buildings
      map.addLayer(
        {
          id: "satellite-layer",
          type: "raster",
          source: "satellite",
          paint: { "raster-opacity": DEFAULT_TOGGLES.satellite ? 1 : 0 },
        } as any,
        "3d-buildings"
      );

      // Risk zones
      map.addSource("riskZones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "risk-fill",
        type: "fill",
        source: "riskZones",
        paint: {
          "fill-color": [
            "match", ["get", "level"],
            "HIGH",     "rgba(255,77,79,0.35)",
            "MODERATE", "rgba(255,214,102,0.28)",
            "LOW",      "rgba(92,219,149,0.15)",
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

      if (radarStateRef.current) {
        buildRadarLayers(map, radarStateRef.current.host, radarStateRef.current.frames, radarStateRef.current.colorScheme, 0, DEFAULT_TOGGLES.radar, 0.9);
      }

      // ── OSM Building hover highlight ──────────────────────────────────────
      // Add a separate highlight layer that lights up on hover
      map.addLayer({
        id: "3d-buildings-hover",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 12,
        paint: {
          "fill-extrusion-color": "rgba(255, 220, 80, 0.0)",
          "fill-extrusion-height": [
            "interpolate", ["linear"], ["zoom"],
            12, 0,
            13, ["coalesce", ["get", "render_height"], 6],
          ],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.0,
        },
        filter: ["==", ["id"], ""],
      } as any);

      let hoveredBuildingId: string | number | null = null;
      const buildingPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "building-popup",
        maxWidth: "220px",
      });

      map.on("mousemove", "3d-buildings", (e) => {
        if (!e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = "pointer";
        const feat = e.features[0];
        const fid = feat.id;

        if (hoveredBuildingId !== null && hoveredBuildingId !== fid) {
          map.setFilter("3d-buildings-hover", ["==", ["id"], ""]);
        }
        hoveredBuildingId = fid ?? null;
        if (fid !== undefined) {
          map.setFilter("3d-buildings-hover", ["==", ["id"], fid]);
          map.setPaintProperty("3d-buildings-hover", "fill-extrusion-color", "rgba(255,220,80,0.55)");
          map.setPaintProperty("3d-buildings-hover", "fill-extrusion-opacity", 0.85);
        }

        const props = feat.properties as Record<string, any>;
        const name = props?.name || props?.["name:en"] || "Building";
        const height = props?.render_height ? `${Math.round(props.render_height)}m` : "—";
        const type = props?.building || props?.amenity || props?.shop || "—";

        buildingPopup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:system-ui;font-size:12px;color:#e8f0fe;line-height:1.5">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#fff">${name}</div>
              <div style="color:rgba(255,255,255,0.6)">Type: <span style="color:#ffd666">${type}</span></div>
              <div style="color:rgba(255,255,255,0.6)">Height: <span style="color:#19c37d">${height}</span></div>
            </div>
          `)
          .addTo(map);
      });

      map.on("mouseleave", "3d-buildings", () => {
        map.getCanvas().style.cursor = "";
        hoveredBuildingId = null;
        map.setFilter("3d-buildings-hover", ["==", ["id"], ""]);
        map.setPaintProperty("3d-buildings-hover", "fill-extrusion-opacity", 0.0);
        buildingPopup.remove();
      });

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
  }, [screen]); // Re-initialize when screen changes to "app"

  // ── Placement mode: click on map to place a model ──────────────────────────
  const placementModeRef = useRef(false);
  const selectedModelRef = useRef<ModelType>("office");
  const placementRotationRef = useRef(0);
  const placingNameRef = useRef("");
  const customModelFileRef = useRef<File | null>(null);
  // Set to true by BuildingOverlay when a building is clicked — prevents placement
  const buildingHitRef = useRef(false);

  useEffect(() => { placementModeRef.current = placementMode; }, [placementMode]);
  useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);
  useEffect(() => { placementRotationRef.current = placementRotation; }, [placementRotation]);
  useEffect(() => { placingNameRef.current = placingName; }, [placingName]);
  useEffect(() => { customModelFileRef.current = customModelFile; }, [customModelFile]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = async (e: maplibregl.MapMouseEvent) => {
      if (!placementModeRef.current) return;
      // If BuildingOverlay consumed this click (building was hit), skip placement
      if (buildingHitRef.current) { buildingHitRef.current = false; return; }
      const { lng, lat } = e.lngLat;
      const catalog = MODEL_CATALOG.find((m) => m.type === selectedModelRef.current);
      const name = placingNameRef.current.trim() ||
        `${catalog?.label ?? selectedModelRef.current} (${new Date().toLocaleTimeString()})`;

      try {
        // If custom model is selected and a file is provided, upload it first
        let customModelUrl: string | undefined;
        if (selectedModelRef.current === "custom" && customModelFileRef.current) {
          const formData = new FormData();
          formData.append("model", customModelFileRef.current);
          
          const uploadRes = await fetch("http://localhost:4000/api/upload-model", {
            method: "POST",
            body: formData,
          });
          
          if (uploadRes.ok) {
            const data = await uploadRes.json();
            customModelUrl = data.url;
          } else {
            console.error("Failed to upload custom model");
            alert("Failed to upload custom model. Please try again.");
            return;
          }
        }

        await fetch("http://localhost:4000/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            modelType: selectedModelRef.current,
            type: catalog?.category === "Agriculture" ? "Agricultural Structure" :
                  catalog?.category === "Infrastructure" ? "Municipal Project" :
                  catalog?.category === "Construction" ? "Municipal Project" : "Private Building",
            department: "Engineering",
            location: { lat, lon: lng },
            rotation: placementRotationRef.current,
            customModelUrl,
          }),
        });
        // Backend will emit projects:update via socket
      } catch (err) {
        console.error("Failed to place project:", err);
      }
    };

    map.on("click", handleClick);
    return () => { map.off("click", handleClick); };
  }, [mapRef.current]);

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
    socket.on("projects:update", (p) => setProjects(p.projects));
    socket.on("alerts:new", (a) => setAlerts((prev) => [a, ...prev].slice(0, 8)));

    return () => {
      socket.disconnect();
    };
  }, []);

  // Load radar frames from RainViewer API.
  useEffect(() => {
    let cancelled = false;
    fetchRadarFrames()
      .then(({ host, frames }) => {
        if (cancelled) return;
        setRadarHost(host);
        setRadarFrames(frames);
        // Store in ref so the map load handler can access it if map loads after fetch.
        radarStateRef.current = { host, frames, colorScheme: radarColorScheme };
        // If map is already loaded, build layers now.
        const map = mapRef.current;
        if (map && map.isStyleLoaded()) {
          buildRadarLayers(map, host, frames, radarColorScheme, 0, DEFAULT_TOGGLES.radar, 0.9);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRadarHost(null);
        setRadarFrames([]);
      });
    return () => { cancelled = true; };
  }, []);

  // Animate radar by cycling frame index.
  useEffect(() => {
    if (!toggles.radar || !radarPlaying) return;
    if (!radarFrames.length) return;
    const t = setInterval(() => {
      setRadarFrameIdx((i) => (i + 1) % radarFrames.length);
    }, 650);
    return () => clearInterval(t);
  }, [toggles.radar, radarPlaying, radarFrames.length]);

  // Rebuild radar layers when color scheme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!radarHost || !radarFrames.length) return;
    radarStateRef.current = { host: radarHost, frames: radarFrames, colorScheme: radarColorScheme };
    buildRadarLayers(map, radarHost, radarFrames, radarColorScheme, radarFrameIdx, toggles.radar, radarOpacity);
  }, [radarColorScheme]);

  // Update frame visibility (fast path — no layer rebuild).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (let i = 0; i < radarFrames.length; i++) {
      if (!map.getLayer(`radar-${i}`)) continue;
      map.setPaintProperty(`radar-${i}`, "raster-opacity", toggles.radar && i === radarFrameIdx ? radarOpacity : 0);
    }
  }, [radarFrameIdx, toggles.radar, radarOpacity, radarFrames.length]);

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
            // keep satellite below 3D buildings when possible
            map.getLayer("3d-buildings") ? "3d-buildings" : undefined
          );
        } catch {
          // ignore: layer may already exist or style is mid-reload
        }
      }

      if (map.getLayer("satellite-layer")) {
        // Fade in/out via opacity so the transition is smooth
        map.setPaintProperty("satellite-layer", "raster-opacity", toggles.satellite ? 1 : 0);
      }

      // When satellite is on, dim the 3D buildings slightly so imagery shows through
      if (map.getLayer("3d-buildings")) {
        map.setPaintProperty("3d-buildings", "fill-extrusion-opacity", toggles.satellite ? 0.55 : 0.92);
      }
    };

    if (map.isStyleLoaded()) applySatellite();
    else map.once("style.load", applySatellite);
  }, [toggles.satellite]);

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
        if (toggles.terrain) {
          // Dynamic exaggeration based on zoom level for optimal visualization
          const currentZoom = map.getZoom();
          const exaggeration = calculateTerrainExaggeration(currentZoom);
          
          (map as any).setTerrain({ 
            source: "terrain-dem", 
            exaggeration: exaggeration 
          });
          map.easeTo({ pitch: 62, duration: 600 });
          
          // Show hillshade when terrain is enabled
          if (map.getLayer("hillshade")) {
            map.setLayoutProperty("hillshade", "visibility", "visible");
          }
        } else {
          (map as any).setTerrain(null);
          map.easeTo({ pitch: 30, duration: 600 });
          
          // Hide hillshade when terrain is disabled
          if (map.getLayer("hillshade")) {
            map.setLayoutProperty("hillshade", "visibility", "none");
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
      if (!toggles.terrain) return;
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
  }, [toggles.terrain, mapInstance]);

  // Push project footprints to the 3D highlighted buildings layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("project-footprints") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    // Just update dot positions — GLB models are rendered by BuildingOverlay
    const features = (toggles.projects ? projects : []).map((p) => ({
      type: "Feature" as const,
      properties: { id: p.id, name: p.name, status: p.status },
      geometry: {
        type: "Point" as const,
        coordinates: [p.location.lon, p.location.lat],
      },
    }));

    src.setData({ type: "FeatureCollection", features } as any);
    if (map.getLayer("project-labels"))
      map.setLayoutProperty("project-labels", "visibility", toggles.projects ? "visible" : "none");
  }, [projects, toggles.projects]);

  const riskSummary = useMemo(() => {
    const feats = riskZones?.features || [];
    const high = feats.filter((f) => f.properties.level === "HIGH").length;
    const mod = feats.filter((f) => f.properties.level === "MODERATE").length;
    const low = feats.filter((f) => f.properties.level === "LOW").length;
    return { high, mod, low, total: feats.length };
  }, [riskZones]);

  const projectSummary = useMemo(() => {
    const ongoing = projects.filter((p) => p.status === "Ongoing").length;
    const completed = projects.filter((p) => p.status === "Completed").length;
    const planning = projects.filter((p) => p.status === "Planning").length;
    return { ongoing, completed, planning, total: projects.length };
  }, [projects]);

  return (
    <div className="appShell">
      {/* Landing page */}
      {screen === "landing" && <LandingPage onEnter={() => setScreen("login")} />}

      {/* Login screen */}
      {screen === "login" && (
        <LoginScreen
          onLogin={(role) => { setCurrentRole(role); setScreen("app"); }}
          onBack={() => setScreen("landing")}
        />
      )}

      {/* Main app - only render when logged in */}
      {screen === "app" && <>
      <div className="mapWrap">
        <div className="map" ref={mapDivRef} style={{ cursor: placementMode ? "crosshair" : undefined }} />

        <DeckGLOverlay
          map={mapInstance}
          enabledHeatmap={toggles.heatmap && !toggles.gibsPrecip}
          heatPoints={heatPoints}
          enabledWeather={toggles.weather}
          weather={weather}
          shadowsEnabled={toggles.terrain}
          sunLightPosition={[0, -70, 100]}
          enabledEONET={eonetEnabled}
          eonetEvents={eonetEvents}
        />

        <BuildingOverlay
          map={mapInstance}
          projects={projects}
          visible={toggles.projects}
          onBuildingClick={(hit) => { buildingHitRef.current = hit; }}
          onDeleteBuilding={async (projectId) => {
            try {
              await fetch(`${BACKEND_URL}/api/projects/${projectId}`, { method: "DELETE" });
            } catch (err) {
              console.error("Failed to delete project:", err);
            }
          }}
        />

        <div className="topBar">
          <div>
            <div className="brand">INFA-TRACK Luisiana</div>
            <div className="sub">Real-Time GIS Infrastructure & Disaster Monitoring</div>
          </div>
          <div className="grow" />
          {roleConfig && (
            <div className="chip" style={{ borderColor: `${roleConfig.color}50`, color: roleConfig.color, fontWeight: 600 }}>
              {roleConfig.label}
            </div>
          )}
          <div className="chip">
            <span className="dot" style={{ background: connected ? "var(--accent)" : "rgba(255,77,79,0.9)" }} />
            {connected ? "Live" : "Disconnected"}
          </div>
          <div className="chip">
            Risk:{" "}
            <span style={{ color: topRisk.level === "HIGH" ? "var(--danger)" : topRisk.level === "MODERATE" ? "var(--warn)" : "var(--safe)" }}>
              {topRisk.level}
            </span>
          </div>
          <div className="chip">Updates: 5s</div>
          {currentRole && (
            <button
              onClick={() => { setCurrentRole(null); setScreen("landing"); }}
              style={{
                cursor: "pointer", borderRadius: 999, padding: "6px 12px", fontSize: 12,
                border: "1px solid rgba(255,77,79,0.35)", background: "rgba(255,77,79,0.10)",
                color: "rgba(255,77,79,0.9)",
              }}
            >
              Sign Out
            </button>
          )}
        </div>

        {/* ── Map Controls ── */}
        <div className="map-controls">
          {/* Zoom in */}
          <button className="map-ctrl-btn" title="Zoom In (=)" onClick={() => mapRef.current?.zoomIn({ duration: 300 })}>+</button>
          {/* Zoom out */}
          <button className="map-ctrl-btn" title="Zoom Out (-)" onClick={() => mapRef.current?.zoomOut({ duration: 300 })}>−</button>
          <div className="map-ctrl-divider" />
          {/* Compass — rotates to show current bearing, click to reset north */}
          <button
            className="map-ctrl-btn"
            title="Reset North"
            onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 62, duration: 500 })}
            style={{ fontSize: 18 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2 L14.5 9 L12 8 L9.5 9 Z"
                fill="#ff4d4f"
                transform={`rotate(${mapBearing}, 12, 12)`}
              />
              <path
                d="M12 22 L9.5 15 L12 16 L14.5 15 Z"
                fill="rgba(255,255,255,0.4)"
                transform={`rotate(${mapBearing}, 12, 12)`}
              />
            </svg>
          </button>
          <div className="map-ctrl-divider" />
          {/* Fly home */}
          <button
            className="map-ctrl-btn"
            title="Fly to Luisiana"
            onClick={() => mapRef.current?.flyTo({
              center: [CENTER.lon, CENTER.lat],
              zoom: CENTER.zoom,
              pitch: 62,
              bearing: -15,
              duration: 1200,
              essential: true,
            })}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </button>
          {/* Tilt toggle */}
          <button
            className="map-ctrl-btn"
            title="Toggle Tilt"
            onClick={() => {
              const m = mapRef.current;
              if (!m) return;
              const p = m.getPitch();
              m.easeTo({ pitch: p > 10 ? 0 : 62, duration: 500 });
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20 L12 4 L22 20"/>
              <line x1="2" y1="20" x2="22" y2="20"/>
            </svg>
          </button>
        </div>

      </div>

      <aside className="sidePanel">
        <div className="sectionTitle">Live Situation Panel</div>

        {/* Tab Navigation */}
        <div style={{ 
          display: "flex", 
          gap: 4, 
          marginBottom: 12, 
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: 8,
          overflowX: "auto",
          overflowY: "hidden",
          flexWrap: "nowrap",
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
          cursor: "grab",
        }}
        className="hide-scrollbar"
        onMouseDown={(e) => {
          const ele = e.currentTarget;
          const startX = e.pageX - ele.offsetLeft;
          const scrollLeft = ele.scrollLeft;
          ele.style.cursor = "grabbing";
          
          const handleMouseMove = (e: MouseEvent) => {
            const x = e.pageX - ele.offsetLeft;
            const walk = (x - startX) * 1.5;
            ele.scrollLeft = scrollLeft - walk;
          };
          
          const handleMouseUp = () => {
            ele.style.cursor = "grab";
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
          };
          
          document.addEventListener("mousemove", handleMouseMove);
          document.addEventListener("mouseup", handleMouseUp);
        }}
        >
          {roleConfig?.canSeeWeather && (
            <button
              onClick={() => setSidebarTab("weather")}
              style={{
                flex: "0 0 auto",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: "8px 8px 0 0",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                background: sidebarTab === "weather" ? "rgba(25,195,125,0.15)" : "rgba(255,255,255,0.03)",
                color: sidebarTab === "weather" ? "#19c37d" : "rgba(255,255,255,0.6)",
                borderBottom: sidebarTab === "weather" ? "2px solid #19c37d" : "none",
              }}
            >
              Weather
            </button>
          )}
          {roleConfig?.canSeeLayers && (
            <button
              onClick={() => setSidebarTab("layers")}
              style={{
                flex: "0 0 auto",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: "8px 8px 0 0",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                background: sidebarTab === "layers" ? "rgba(25,195,125,0.15)" : "rgba(255,255,255,0.03)",
                color: sidebarTab === "layers" ? "#19c37d" : "rgba(255,255,255,0.6)",
                borderBottom: sidebarTab === "layers" ? "2px solid #19c37d" : "none",
              }}
            >
              Layers
            </button>
          )}
          {roleConfig?.canSeeRadar && toggles.radar && (
            <button
              onClick={() => setSidebarTab("radar")}
              style={{
                flex: "0 0 auto",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: "8px 8px 0 0",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                background: sidebarTab === "radar" ? "rgba(25,195,125,0.15)" : "rgba(255,255,255,0.03)",
                color: sidebarTab === "radar" ? "#19c37d" : "rgba(255,255,255,0.6)",
                borderBottom: sidebarTab === "radar" ? "2px solid #19c37d" : "none",
              }}
            >
              Radar
            </button>
          )}
          {roleConfig?.canSeeRisk && (
            <button
              onClick={() => setSidebarTab("risk")}
              style={{
                flex: "0 0 auto",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: "8px 8px 0 0",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                background: sidebarTab === "risk" ? "rgba(25,195,125,0.15)" : "rgba(255,255,255,0.03)",
                color: sidebarTab === "risk" ? "#19c37d" : "rgba(255,255,255,0.6)",
                borderBottom: sidebarTab === "risk" ? "2px solid #19c37d" : "none",
              }}
            >
              Risk
            </button>
          )}
          {roleConfig?.canSeeProjects && (
            <button
              onClick={() => setSidebarTab("projects")}
              style={{
                flex: "0 0 auto",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: "8px 8px 0 0",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                background: sidebarTab === "projects" ? "rgba(25,195,125,0.15)" : "rgba(255,255,255,0.03)",
                color: sidebarTab === "projects" ? "#19c37d" : "rgba(255,255,255,0.6)",
                borderBottom: sidebarTab === "projects" ? "2px solid #19c37d" : "none",
              }}
            >
              Projects
            </button>
          )}
          {roleConfig?.canSeeLayers && (
            <button
              onClick={() => setSidebarTab("climate")}
              style={{
                flex: "0 0 auto",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: "8px 8px 0 0",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                background: sidebarTab === "climate" ? "rgba(88,160,255,0.15)" : "rgba(255,255,255,0.03)",
                color: sidebarTab === "climate" ? "#58a0ff" : "rgba(255,255,255,0.6)",
                borderBottom: sidebarTab === "climate" ? "2px solid #58a0ff" : "none",
              }}
            >
              🛰️ Climate
            </button>
          )}
          {roleConfig?.canSeeLayers && (
            <button
              onClick={() => setSidebarTab("events")}
              style={{
                flex: "0 0 auto",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: "8px 8px 0 0",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                background: sidebarTab === "events" ? "rgba(255,100,100,0.15)" : "rgba(255,255,255,0.03)",
                color: sidebarTab === "events" ? "#ff6464" : "rgba(255,255,255,0.6)",
                borderBottom: sidebarTab === "events" ? "2px solid #ff6464" : "none",
              }}
            >
              🌍 Events
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 180px)" }}>

        {/* ── Weather Tab ── */}
        {sidebarTab === "weather" && roleConfig?.canSeeWeather && (
          <>
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
                <div className="v" style={{ color: "var(--muted)" }}>{projects.filter(p => p.department === "Negosyo Center" && p.status === "Planning").length}</div>
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
                        : <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconClipboard /> For Review</span>
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

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="sectionTitle" style={{ marginBottom: 8 }}>
            Weather — ECMWF IFS
          </div>
          <div className="grid2">
            <div className="stat">
              <div className="v">{weather ? `${weather.temperatureC}°C` : "—"}</div>
              <div className="l">Temperature</div>
            </div>
            <div className="stat">
              <div className="v">{weather ? `${weather.rainfallMm} mm` : "—"}</div>
              <div className="l">Rainfall</div>
            </div>
            <div className="stat">
              <div className="v">{weather ? `${weather.windSpeedMps} m/s` : "—"}</div>
              <div className="l">Wind Speed</div>
            </div>
            <div className="stat">
              <div className="v">{weather ? `${weather.cloudinessPct}%` : "—"}</div>
              <div className="l">Cloud Cover</div>
            </div>
            <div className="stat">
              <div className="v">{weather ? `${weather.humidityPct ?? "—"}%` : "—"}</div>
              <div className="l">Humidity</div>
            </div>
            <div className="stat">
              <div className="v">{weather ? `${weather.pressureHpa ?? "—"} hPa` : "—"}</div>
              <div className="l">Pressure</div>
            </div>
          </div>
          <div style={{ marginTop: 8, color: "var(--muted2)", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>Source: {weather?.source ?? "—"}</span>
            <span>Updated: {weather ? formatAgo(weather.observedAt) : "—"}</span>
          </div>

          {/* 6-hour ECMWF forecast — key for infrastructure safety decisions */}
          {weather?.forecast?.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                6-Hour Forecast (ECMWF)
              </div>
              <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
                {weather.forecast.map((f) => {
                  const rainColor = f.rainfallMm > 10 ? "var(--danger)" : f.rainfallMm > 3 ? "var(--warn)" : "var(--safe)";
                  return (
                    <div key={f.hour} style={{
                      flex: "0 0 auto",
                      minWidth: 52,
                      border: "1px solid var(--stroke2)",
                      borderRadius: 10,
                      padding: "6px 5px",
                      background: "rgba(0,0,0,0.12)",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: 10, color: "var(--muted2)", marginBottom: 3 }}>+{f.hour}h</div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{f.temperatureC}°</div>
                      <div style={{ fontSize: 11, color: rainColor, marginTop: 2 }}>{f.rainfallMm}mm</div>
                      <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{f.windSpeedMps}m/s</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted2)", display: "flex", alignItems: "center", gap: 5 }}>
                {(() => {
                  const maxRain = Math.max(...(weather.forecast.map(f => f.rainfallMm)));
                  if (maxRain > 10) return <><IconWarn /> Heavy rain forecast — review construction schedules</>;
                  if (maxRain > 3)  return <><IconCloud /> Moderate rain expected — monitor drainage</>;
                  return <><IconCheck /> Conditions favorable for outdoor infrastructure work</>;
                })()}
              </div>
            </div>
          ) : null}
        </div>
          </>
        )}

        {/* ── Layers Tab ── */}
        {sidebarTab === "layers" && roleConfig?.canSeeLayers && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="sectionTitle" style={{ marginBottom: 8 }}>
            Layers (LGU-Friendly Toggles)
          </div>

          {(
            [
              {
                k: "heatmap",
                title: "Heatmap",
                hint: "Animated intensity (Blue→Yellow→Red)",
              },
              { k: "weather", title: "Weather Overlay", hint: "Cloud field + rainfall feel" },
              { k: "risk", title: "Landslide Risk Zones", hint: "Green/Yellow/Red polygons" },
              { k: "stormTrack", title: "Storm Tracking", hint: "Drift line based on wind" },
              { k: "projects", title: "Infrastructure Projects", hint: "Markers with progress" },
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

          {/* Radar and GIBS are mutually exclusive precipitation layers */}
          <div className="toggleRow">
            <div>
              <label>Precipitation Radar</label>
              <div className="hint">Live animated radar — RainViewer (Windy-style)</div>
            </div>
            <div
              className={`switch ${toggles.radar ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.radar}
              onClick={() => setToggles((t) => ({ ...t, radar: !t.radar, gibsPrecip: t.radar ? t.gibsPrecip : false }))}
            />
          </div>
          <div className="toggleRow">
            <div>
              <label>NASA GIBS Precip</label>
              <div className="hint">Satellite rainfall heatmap (low-res, daily)</div>
            </div>
            <div
              className={`switch ${toggles.gibsPrecip ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.gibsPrecip}
              onClick={() => setToggles((t) => ({ ...t, gibsPrecip: !t.gibsPrecip, radar: t.gibsPrecip ? t.radar : false }))}
            />
          </div>

          <div className="toggleRow" style={{ alignItems: "flex-start" }}>
            <div>
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
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: heatMetric === k ? "rgba(25,195,125,0.16)" : "rgba(0,0,0,0.12)",
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ minWidth: 86, textAlign: "right" }}>
              <span className="pill">Blue→Red</span>
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
              <label>Satellite</label>
              <div className="hint">ESRI World Imagery — damage validation</div>
            </div>
            <div
              className={`switch ${toggles.satellite ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.satellite}
              onClick={() =>
                setToggles((t) => ({
                  ...t,
                  satellite: !t.satellite,
                  terrain: t.satellite ? t.terrain : false,
                }))
              }
            />
          </div>
          <div className="toggleRow">
            <div>
              <label>3D Terrain</label>
              <div className="hint">Elevation exaggeration — slope analysis</div>
            </div>
            <div
              className={`switch ${toggles.terrain ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.terrain}
              onClick={() =>
                setToggles((t) => ({
                  ...t,
                  terrain: !t.terrain,
                  satellite: t.terrain ? t.satellite : false,
                }))
              }
            />
          </div>
        </div>
        )}

        {/* ── Radar Tab ── */}
        {sidebarTab === "radar" && roleConfig?.canSeeRadar && toggles.radar && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              Radar Controls
            </div>
            {radarFrames.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Loading radar frames...</div>
            ) : (
              <>
                {/* Playback row */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <button onClick={() => setRadarPlaying(!radarPlaying)} style={{
                    cursor: "pointer", borderRadius: 999, padding: "6px 14px", fontSize: 13,
                    fontWeight: 600, border: "1px solid rgba(255,255,255,0.15)",
                    background: radarPlaying ? "rgba(25,195,125,0.20)" : "rgba(88,160,255,0.16)",
                    color: "rgba(255,255,255,0.9)", letterSpacing: "0.02em",
                  }}>
                    {radarPlaying ? <><IconPause /> Pause</> : <><IconPlay /> Play</>}
                  </button>
                  <div style={{ flex: 1, textAlign: "right" }}>
                    <span className="pill" style={{ fontSize: 12 }}>
                      {formatRadarTime(radarFrames[radarFrameIdx]?.time ?? 0)}
                    </span>
                    <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 3 }}>
                      Frame {radarFrameIdx + 1} / {radarFrames.length}
                      {radarFrameIdx >= radarFrames.length - 3 ? " · Nowcast" : " · Past"}
                    </div>
                  </div>
                </div>
                {/* Seek */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <span className="pill" style={{ minWidth: 36 }}>Seek</span>
                  <input type="range" min={0} max={radarFrames.length - 1} value={radarFrameIdx}
                    onChange={(e) => { setRadarPlaying(false); setRadarFrameIdx(Number(e.target.value)); }}
                    style={{ width: "100%" }} />
                </div>
                {/* Opacity */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <span className="pill" style={{ minWidth: 52 }}>Opacity</span>
                  <input type="range" min={0.2} max={1.0} step={0.05} value={radarOpacity}
                    onChange={(e) => setRadarOpacity(Number(e.target.value))} style={{ width: "100%" }} />
                  <span style={{ fontSize: 11, color: "var(--muted2)", minWidth: 28, textAlign: "right" }}>
                    {Math.round(radarOpacity * 100)}%
                  </span>
                </div>
                {/* Color scheme */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Color Scheme</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {RADAR_COLOR_SCHEMES.map(({ value, label }) => (
                      <button key={value} onClick={() => setRadarColorScheme(value)} style={{
                        cursor: "pointer", borderRadius: 999, padding: "5px 10px", fontSize: 11,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: radarColorScheme === value ? "rgba(255,140,60,0.22)" : "rgba(0,0,0,0.12)",
                        color: radarColorScheme === value ? "rgba(255,200,100,0.95)" : "rgba(255,255,255,0.7)",
                        fontWeight: radarColorScheme === value ? 600 : 400,
                      }}>{label}</button>
                    ))}
                  </div>
                </div>
                {/* Legend */}
                <div style={{ height: 8, borderRadius: 4, background: "linear-gradient(to right, #00aa00, #00ff00, #ffff00, #ff8800, #ff0000, #cc00cc)", marginBottom: 4 }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted2)" }}>
                  <span>Light</span><span>Moderate</span><span>Heavy</span>
                </div>
              </>
            )}
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
              onClick={() => setPlacementMode((v) => !v)}
              style={{
                width: "100%", cursor: "pointer", padding: "10px 0",
                borderRadius: 10, fontWeight: 700, fontSize: 13,
                border: placementMode ? "1px solid rgba(25,195,125,0.6)" : "1px solid rgba(255,255,255,0.12)",
                background: placementMode ? "rgba(25,195,125,0.20)" : "rgba(255,255,255,0.05)",
                color: placementMode ? "#19c37d" : "rgba(255,255,255,0.7)",
                marginBottom: 10,
              }}
            >
              {placementMode ? (
                <span style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                  Placement Mode ON — Click map to place
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Enable Placement Mode
                </span>
              )}
            </button>

            {/* Name input */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Project Name (optional)</div>
              <input
                value={placingName}
                onChange={(e) => setPlacingName(e.target.value)}
                placeholder="e.g. Brgy. Hall Phase 2"
                style={{
                  width: "100%", boxSizing: "border-box", padding: "7px 10px",
                  borderRadius: 8, border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.85)",
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
                        cursor: "pointer", padding: "8px 6px", borderRadius: 8, textAlign: "left",
                        border: selectedModel === m.type
                          ? "1px solid rgba(25,195,125,0.55)"
                          : "1px solid rgba(255,255,255,0.07)",
                        background: selectedModel === m.type
                          ? "rgba(25,195,125,0.14)"
                          : "rgba(255,255,255,0.03)",
                        color: selectedModel === m.type ? "#19c37d" : "rgba(255,255,255,0.7)",
                      }}
                    >
                      <div style={{ marginBottom: 4, display: "flex", alignItems: "center", color: selectedModel === m.type ? "#19c37d" : "rgba(255,255,255,0.55)" }}>
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
                background: "rgba(25,195,125,0.08)", 
                border: "1px solid rgba(25,195,125,0.25)", 
                borderRadius: 10 
              }}>
                <div style={{ fontSize: 11, color: "#19c37d", fontWeight: 600, marginBottom: 8 }}>
                  Upload Custom GLB Model
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
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(0,0,0,0.3)",
                    color: "rgba(255,255,255,0.85)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                />
                {customModelPreview && (
                  <div style={{ 
                    marginTop: 8, 
                    fontSize: 10, 
                    color: "rgba(255,255,255,0.65)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#19c37d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {customModelPreview}
                  </div>
                )}
                <div style={{ 
                  marginTop: 8, 
                  fontSize: 10, 
                  color: "rgba(255,255,255,0.45)", 
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
                      background: "rgba(255,255,255,0.03)", borderRadius: 7,
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <span style={{ display: "flex", alignItems: "center", color: "rgba(255,255,255,0.55)" }}>
                        {(() => { const ic = MODEL_CATALOG.find((m) => m.type === p.modelType)?.icon ?? "construction"; const Ic = ModelIcons[ic] ?? ModelIcons.construction; return <Ic size={15} />; })()}
                      </span>
                      <span style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                      <button
                        onClick={async () => {
                          await fetch(`http://localhost:4000/api/projects/${p.id}`, { method: "DELETE" });
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
          <div className="card" style={{ marginBottom: 12 }}>
          <div className="sectionTitle" style={{ marginBottom: 8 }}>
            Infrastructure Snapshot
          </div>
          <div className="grid2">
            <div className="stat">
              <div className="v">{projectSummary.total}</div>
              <div className="l">Total Projects</div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "var(--accent)" }}>
                {projectSummary.ongoing}
              </div>
              <div className="l">Ongoing</div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "rgba(88, 160, 255, 0.95)" }}>
                {projectSummary.completed}
              </div>
              <div className="l">Completed</div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "rgba(160, 174, 192, 0.95)" }}>
                {projectSummary.planning}
              </div>
              <div className="l">Planning</div>
            </div>
          </div>

          <div style={{ marginTop: 10 }} className="miniList">
            {projects
              .filter(p => currentRole === "Engineer" ? p.department === "Engineering" : true)
              .slice(0, 4).map((p) => (
              <div
                key={p.id}
                className="proj"
                onClick={() => {
                  mapRef.current?.flyTo({
                    center: [p.location.lon, p.location.lat],
                    zoom: 16,
                    pitch: 62,
                    bearing: -15,
                    duration: 1400,
                    essential: true,
                  });
                }}
                style={{ cursor: "pointer" }}
                title="Click to fly to this project"
              >
                <div className="n" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "flex", alignItems: "center", color: "rgba(255,255,255,0.55)" }}>
                    {(() => { const ic = MODEL_CATALOG.find(m => m.type === p.modelType)?.icon ?? "construction"; const Ic = ModelIcons[ic] ?? ModelIcons.construction; return <Ic size={14} />; })()}
                  </span>
                  {p.name}
                  <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", color: "rgba(255,255,255,0.3)" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </span>
                </div>
                <div className="s">
                  <span>{p.department}</span>
                  <span>{p.status}</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${Math.max(0, Math.min(100, p.progress))}%` }} />
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted2)" }}>
                  Progress: {p.progress}% · Updated {formatAgo(p.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
        </>
        )}

        {/* ── Climate Tab ── */}
        {sidebarTab === "climate" && roleConfig?.canSeeLayers && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              🛰️ NASA GIBS Climate Data
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12, lineHeight: 1.5 }}>
              Real satellite data from NASA - Precipitation, Temperature, Imagery, Atmosphere
            </div>

            {/* Enable/Disable Toggle */}
            <div className="toggleRow" style={{ marginBottom: 16 }}>
              <div>
                <label>Enable Climate Layer</label>
                <div className="hint">Show NASA GIBS data on map</div>
              </div>
              <div
                className={`switch ${toggles.gibsPrecip ? "on" : ""}`}
                role="switch"
                aria-checked={toggles.gibsPrecip}
                onClick={() => setToggles((t) => ({ ...t, gibsPrecip: !t.gibsPrecip }))}
              />
            </div>

            {/* Precipitation Layers */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(88,160,255,0.85)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                ☔ Precipitation (Ulan)
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
                      borderRadius: 999,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(88,160,255,0.20)",
                      background: gibsLayer === k ? "rgba(88,160,255,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "rgba(88,160,255,1)" : "rgba(255,255,255,0.75)",
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
                      borderRadius: 999,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(255,140,60,0.20)",
                      background: gibsLayer === k ? "rgba(255,140,60,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "rgba(255,140,60,1)" : "rgba(255,255,255,0.75)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Satellite Imagery */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(92,219,149,0.85)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
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
                      borderRadius: 999,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(92,219,149,0.20)",
                      background: gibsLayer === k ? "rgba(92,219,149,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "rgba(92,219,149,1)" : "rgba(255,255,255,0.75)",
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
                      borderRadius: 999,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(255,215,0,0.20)",
                      background: gibsLayer === k ? "rgba(255,215,0,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "rgba(255,215,0,1)" : "rgba(255,255,255,0.75)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity Control */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
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
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", minWidth: 35 }}>
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
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 6,
                    padding: "6px 8px",
                    color: "rgba(255,255,255,0.85)",
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
                <div style={{ marginTop: 10, fontSize: 11, color: "rgba(92,219,149,0.85)", display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(92,219,149,0.85)" }} />
                  Climate data active
                </div>
              )}
            </div>

            {/* Info Box */}
            <div style={{ marginTop: 16, padding: 12, background: "rgba(88,160,255,0.08)", border: "1px solid rgba(88,160,255,0.15)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
                💡 <strong>Tip:</strong> Use yesterday's date for most reliable data. Some layers have 1-2 day processing lag.
              </div>
            </div>
          </div>
        )}

        {/* ── Events Tab (NASA EONET Natural Events) ── */}
        {sidebarTab === "events" && roleConfig?.canSeeLayers && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              🌍 NASA Natural Event Tracker
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12, lineHeight: 1.5 }}>
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
              <div style={{ marginBottom: 16, padding: 12, background: "rgba(255,100,100,0.08)", border: "1px solid rgba(255,100,100,0.15)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  Active Events Nearby
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {Object.entries(getEventStats(eonetEvents)).map(([catId, count]) => {
                    const cat = EONET_CATEGORIES[catId];
                    if (!cat) return null;
                    return (
                      <div key={catId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                        <span style={{ fontSize: 14 }}>{cat.icon}</span>
                        <span style={{ color: "rgba(255,255,255,0.85)" }}>{count}</span>
                        <span style={{ color: "rgba(255,255,255,0.55)" }}>{cat.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category Filters */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
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
                        borderRadius: 999,
                        padding: "7px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        border: `1px solid ${cat.color}40`,
                        background: isSelected ? `${cat.color}30` : "rgba(0,0,0,0.15)",
                        color: isSelected ? cat.color : "rgba(255,255,255,0.65)",
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
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
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
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", minWidth: 60 }}>
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
              <div style={{ marginTop: 12, fontSize: 11, color: "rgba(92,219,149,0.85)" }}>
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
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
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
                          if (geometry && mapRef.current) {
                            mapRef.current.flyTo({
                              center: [geometry.coordinates[0], geometry.coordinates[1]],
                              zoom: 8,
                              duration: 2000,
                            });
                          }
                        }}
                        style={{
                          padding: 10,
                          background: "rgba(0,0,0,0.20)",
                          border: `1px solid ${catInfo?.color || '#888'}30`,
                          borderRadius: 8,
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
                            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.90)", marginBottom: 4, lineHeight: 1.3 }}>
                              {event.title}
                            </div>
                            {event.description && (
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginBottom: 4, lineHeight: 1.3 }}>
                                {event.description}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: "rgba(255,255,255,0.65)" }}>
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
                              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
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
                  <div style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>
                    Showing 20 of {eonetEvents.length} events
                  </div>
                )}
              </div>
            )}

            {/* Info Box */}
            <div style={{ marginTop: 16, padding: 12, background: "rgba(255,100,100,0.08)", border: "1px solid rgba(255,100,100,0.15)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
                💡 <strong>About:</strong> NASA EONET provides near real-time natural event data. Events are updated every 30 minutes. Click on map markers for details.
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
      </>}
    </div>
  );
}

