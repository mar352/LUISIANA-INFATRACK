import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DeckGLOverlay } from "./DeckOverlay";
import type { AlertItem, HeatPoint, Project, RiskZones, WeatherSnapshot } from "../types";
import { connectRealtime } from "../lib/realtime";
import { buildHeatmapPoints, type BBox, type HeatmapMetric } from "../lib/heatmap";
import { fetchRadarFrames, radarTileUrl, formatRadarTime, type RadarColorScheme, type RadarFrame, RADAR_COLOR_SCHEMES } from "../lib/radar";
import { formatGibsDate, gibsWmtsTileUrl, type GibsLayerId } from "../lib/gibs";

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
    <div style={{ display: "flex", justifyContent: "center", padding: "0 24px", marginTop: -28, marginBottom: 60 }}>
      <div style={{ display: "flex", gap: 0, flexWrap: "wrap", justifyContent: "center", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, background: "rgba(10,22,38,0.80)", backdropFilter: "blur(12px)", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
        {[{ v: "5s", l: "Update Interval" }, { v: "4", l: "Departments" }, { v: "22+", l: "Projects Tracked" }, { v: "Live", l: "Radar & Weather" }].map((s, i) => (
          <div key={i} style={{ padding: "20px 36px", textAlign: "center", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#19c37d" }}>{s.v}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.l}</div>
          </div>
        ))}
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
// Operational focus (approx): Luisiana, Laguna
// This keeps the experience LGU-focused (staff won’t accidentally pan to other provinces).
const LUISIANA_BOUNDS: [[number, number], [number, number]] = [
  [121.43, 14.12], // [west, south]
  [121.61, 14.27], // [east, north]
];

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

  // Insert right above the OSM base layer — radar is the bottom-most overlay.
  // Everything else (GIBS, risk zones, projects) renders on top.
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

  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [screen, setScreen] = useState<"landing" | "login" | "app">("landing");
  const roleConfig = currentRole ? ROLE_CONFIGS[currentRole] : null;

  const [connected, setConnected] = useState(false);
  const [toggles, setToggles] = useState<LayerToggles>(DEFAULT_TOGGLES);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>([]);
  const [riskZones, setRiskZones] = useState<RiskZones | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
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
      pitch: 50,
      bearing: -12,
      attributionControl: false,
      maxBounds: LUISIANA_BOUNDS,
    });

    mapRef.current = map;

    const pushViewport = () => {
      const b = map.getBounds();
      setViewport({
        bbox: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
        zoom: map.getZoom(),
      });
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
            "interpolate", ["linear"], ["get", "render_height"],
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

      // Project buildings — highlighted in blue/orange on top of OSM buildings
      map.addSource("project-footprints", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "project-buildings-3d",
        type: "fill-extrusion",
        source: "project-footprints",
        paint: {
          "fill-extrusion-color": [
            "match", ["get", "status"],
            "Completed", "#4a90d9",
            "Ongoing",   "#f5a623",
            "Planning",  "#9b9b9b",
            "#4a90d9",
          ],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.95,
        },
      } as any);

      // Project label dots
      map.addLayer({
        id: "project-labels",
        type: "circle",
        source: "project-footprints",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match", ["get", "status"],
            "Completed", "#4a90d9",
            "Ongoing",   "#f5a623",
            "Planning",  "#9b9b9b",
            "#4a90d9",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // ── Satellite imagery source (ESRI World Imagery — free, no API key) ──
      map.addSource("satellite", {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© Esri, Maxar, Earthstar Geographics",
      });

      // ── Terrain DEM ───────────────────────────────────────────────────────
      map.addSource("terrain-dem", {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 15,
        encoding: "terrarium",
      } as any);

      // ── GIBS precipitation (added before satellite so satellite sits on top) ──
      map.addSource("gibs-imerg", {
        type: "raster",
        tiles: [gibsWmtsTileUrl({ layer: gibsLayer, date: gibsDate })],
        tileSize: 256,
        maxzoom: 6,
      } as any);
      map.addLayer({
        id: "gibs-imerg-layer",
        type: "raster",
        source: "gibs-imerg",
        paint: { "raster-opacity": DEFAULT_TOGGLES.gibsPrecip ? gibsOpacity : 0 },
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
    });

    map.on("moveend", pushViewport);

    return () => {
      map.off("moveend", pushViewport);
      map.remove();
      mapRef.current = null;
    };
  }, [screen]); // Re-initialize when screen changes to "app"

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
      maxzoom: 6,
    } as any);

    // Add above base map; below vectors if present.
    map.addLayer(
      {
        id: "gibs-imerg-layer",
        type: "raster",
        source: "gibs-imerg",
        paint: { "raster-opacity": visible ? opacity : 0 },
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
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getLayer("satellite-layer")) return;
    // Fade in/out via opacity so the transition is smooth
    map.setPaintProperty("satellite-layer", "raster-opacity", toggles.satellite ? 1 : 0);
    // When satellite is on, dim the 3D buildings slightly so imagery shows through
    if (map.getLayer("3d-buildings")) {
      map.setPaintProperty("3d-buildings", "fill-extrusion-opacity", toggles.satellite ? 0.55 : 0.92);
    }
  }, [toggles.satellite]);

  // Terrain (3D elevation) toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getSource("terrain-dem")) return;
    if (toggles.terrain) {
      (map as any).setTerrain({ source: "terrain-dem", exaggeration: 2.5 });
      // Increase pitch for dramatic terrain view
      map.easeTo({ pitch: 65, duration: 600 });
    } else {
      (map as any).setTerrain(null);
      map.easeTo({ pitch: 50, duration: 600 });
    }
  }, [toggles.terrain]);

  // Push project footprints to the 3D highlighted buildings layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("project-footprints") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features = (toggles.projects ? projects : []).map((p) => {
      // Building footprint size by type
      const hw = p.type === "Municipal Project" ? 0.0007 :
                 p.type === "Agricultural Structure" ? 0.0005 : 0.0003;
      const hd = p.type === "Municipal Project" ? 0.00015 :
                 p.type === "Agricultural Structure" ? 0.0004 : 0.0003;
      const { lon, lat } = p.location;
      const height = p.type === "Municipal Project" ? 4 :
                     p.type === "Agricultural Structure" ? 12 :
                     p.status === "Completed" ? 40 :
                     p.status === "Ongoing" ? Math.max(8, (p.progress / 100) * 40) : 8;
      return {
        type: "Feature" as const,
        properties: { id: p.id, name: p.name, status: p.status, height },
        geometry: {
          type: "Polygon" as const,
          coordinates: [[
            [lon - hw, lat - hd],
            [lon + hw, lat - hd],
            [lon + hw, lat + hd],
            [lon - hw, lat + hd],
            [lon - hw, lat - hd],
          ]],
        },
      };
    });

    src.setData({ type: "FeatureCollection", features });
    if (map.getLayer("project-buildings-3d"))
      map.setLayoutProperty("project-buildings-3d", "visibility", toggles.projects ? "visible" : "none");
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
        <div className="map" ref={mapDivRef} />

        <DeckGLOverlay
          map={mapRef.current}
          enabledHeatmap={toggles.heatmap && !toggles.gibsPrecip}
          heatPoints={heatPoints}
          enabledWeather={toggles.weather}
          weather={weather}
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

        {!MAPBOX_TOKEN ? (
          <div style={{ position: "absolute", left: 14, bottom: 14, maxWidth: 520 }} className="card">
            <div className="sectionTitle">OpenFreeMap — Vector Tiles</div>
            <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.35 }}>
              3D buildings from OpenStreetMap via OpenFreeMap (free, no API key).
              Add <span className="pill">VITE_MAPBOX_TOKEN</span> in <span className="pill">frontend/.env</span> for Mapbox basemaps.
            </div>
          </div>
        ) : null}
      </div>

      <aside className="sidePanel">
        <div className="sectionTitle">Live Situation Panel</div>

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

        {roleConfig?.canSeeWeather && <div className="card" style={{ marginBottom: 12 }}>
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
        </div>}

        {roleConfig?.canSeeLayers && <div className="card" style={{ marginBottom: 12 }}>
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

          <div className="toggleRow" style={{ alignItems: "flex-start" }}>
            <div>
              <label>NASA GIBS Layer</label>
              <div className="hint">Worldview / GIBS precipitation tiles</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {(
                  [
                    ["IMERG_Precipitation_Rate", "IMERG Rate"],
                    ["IMERG_Precipitation_Rate_30min", "IMERG 30-min"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setGibsLayer(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: gibsLayer === k ? "rgba(88,160,255,0.16)" : "rgba(0,0,0,0.12)",
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                <span className="pill">Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={0.9}
                  step={0.02}
                  value={gibsOpacity}
                  onChange={(e) => setGibsOpacity(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                <span className="pill">Date</span>
                <input
                  type="date"
                  value={gibsDate}
                  onChange={(e) => setGibsDate(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.12)",
                    color: "rgba(255,255,255,0.85)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 10,
                    padding: "6px 10px",
                  }}
                />
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                Status:{" "}
                {gibsStatus === "ok"
                  ? "available"
                  : gibsStatus === "loading"
                    ? "checking availability…"
                    : "not available for this date (auto-fallback applied)"}
              </div>
            </div>
            <div style={{ minWidth: 86, textAlign: "right" }}>
              <span className="pill">GIBS</span>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted2)" }}>WMTS tiles</div>
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
        </div>}

        {roleConfig?.canSeeRadar && toggles.radar && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              Radar Controls
            </div>
            {radarFrames.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                Loading radar frames...
              </div>
            ) : (
              <>
                {/* Playback row */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <button
                    onClick={() => setRadarPlaying(!radarPlaying)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 999,
                      padding: "6px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: radarPlaying ? "rgba(25,195,125,0.20)" : "rgba(88,160,255,0.16)",
                      color: "rgba(255,255,255,0.9)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {radarPlaying
                      ? <><IconPause /> Pause</>
                      : <><IconPlay /> Play</>
                    }
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

                {/* Seek scrubber */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <span className="pill" style={{ minWidth: 36 }}>Seek</span>
                  <input
                    type="range"
                    min={0}
                    max={radarFrames.length - 1}
                    value={radarFrameIdx}
                    onChange={(e) => { setRadarPlaying(false); setRadarFrameIdx(Number(e.target.value)); }}
                    style={{ width: "100%" }}
                  />
                </div>

                {/* Opacity slider */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <span className="pill" style={{ minWidth: 52 }}>Opacity</span>
                  <input
                    type="range"
                    min={0.2}
                    max={1.0}
                    step={0.05}
                    value={radarOpacity}
                    onChange={(e) => setRadarOpacity(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--muted2)", minWidth: 28, textAlign: "right" }}>
                    {Math.round(radarOpacity * 100)}%
                  </span>
                </div>

                {/* Color scheme picker */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Color Scheme</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {RADAR_COLOR_SCHEMES.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setRadarColorScheme(value)}
                        style={{
                          cursor: "pointer",
                          borderRadius: 999,
                          padding: "5px 10px",
                          fontSize: 11,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: radarColorScheme === value ? "rgba(255,140,60,0.22)" : "rgba(0,0,0,0.12)",
                          color: radarColorScheme === value ? "rgba(255,200,100,0.95)" : "rgba(255,255,255,0.7)",
                          fontWeight: radarColorScheme === value ? 600 : 400,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Radar legend */}
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    background: "linear-gradient(to right, #00aa00, #00ff00, #ffff00, #ff8800, #ff0000, #cc00cc)",
                  }} />
                  <div style={{ display: "flex", justifyContent: "space-between", width: "100%", position: "absolute", fontSize: 10, color: "var(--muted2)", marginTop: 14 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted2)", marginTop: 4 }}>
                  <span>Light</span>
                  <span>Moderate</span>
                  <span>Heavy</span>
                </div>
              </>
            )}
          </div>
        )}

        {roleConfig?.canSeeRisk && <div className="card" style={{ marginBottom: 12 }}>
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
        </div>}

        {roleConfig?.canSeeProjects && <div className="card" style={{ marginBottom: 12 }}>
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
              <div key={p.id} className="proj">
                <div className="n">{p.name}</div>
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
        </div>}

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

