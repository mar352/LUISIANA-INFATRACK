import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import "./Landing.css";

export type UserRole =
  | "MPDC"
  | "Engineer"
  | "Agriculture"
  | "Treasury Office"
  | "Negosyo Center"
  | "Barangay Official"
  | "Private Engineer"
  | "Viewer";

export function isBarangayOfficial(role: UserRole | null | undefined): boolean {
  return role === "Barangay Official";
}

export function isPrivateEngineer(role: UserRole | null | undefined): boolean {
  return role === "Private Engineer";
}

export function isMunicipalStaff(role: UserRole | null | undefined): boolean {
  return (
    role === "MPDC" ||
    role === "Engineer" ||
    role === "Agriculture" ||
    role === "Treasury Office" ||
    role === "Negosyo Center"
  );
}

export interface RoleConfig {
  label: string;
  color: string;
  description: string;
  canSeeLayers: boolean;
  canSeeRisk: boolean;
  canSeeProjects: boolean;
  canSeeAlerts: boolean;
  canSeeBusinessPermits: boolean;
  canSeePlanning: boolean;
  canSeeEngagement: boolean;
}

export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  MPDC: {
    label: "MPDC",
    color: "#151c28",
    description: "Municipal Planning & Development Coordinator",
    canSeeLayers: true,
    canSeeRisk: true,
    canSeeProjects: true,
    canSeeAlerts: true,
    canSeeBusinessPermits: false,
    canSeePlanning: true,
    canSeeEngagement: true,
  },
  Engineer: {
    label: "Engineer",
    color: "#8a6500",
    description: "Infrastructure & Engineering Office",
    canSeeLayers: true,
    canSeeRisk: true,
    canSeeProjects: true,
    canSeeAlerts: true,
    canSeeBusinessPermits: false,
    canSeePlanning: true,
    canSeeEngagement: true,
  },
  Agriculture: {
    label: "Agriculture",
    color: "#3d4f6b",
    description: "Municipal Agriculture Office",
    canSeeLayers: false,
    canSeeRisk: true,
    canSeeProjects: false,
    canSeeAlerts: true,
    canSeeBusinessPermits: false,
    canSeePlanning: true,
    canSeeEngagement: false,
  },
  "Treasury Office": {
    label: "Treasury Office",
    color: "#059669",
    description: "Municipal Treasury Office — Revenue, Payment Collections & Official Receipts (O.R.)",
    canSeeLayers: false,
    canSeeRisk: false,
    canSeeProjects: false,
    canSeeAlerts: false,
    canSeeBusinessPermits: true,
    canSeePlanning: false,
    canSeeEngagement: false,
  },
  "Negosyo Center": {
    label: "Negosyo Center",
    color: "#0d9488",
    description: "Business Permits & Licensing Office (BPLO) — Business clearances, tax orders, and renewals",
    canSeeLayers: false,
    canSeeRisk: false,
    canSeeProjects: false,
    canSeeAlerts: false,
    canSeeBusinessPermits: true,
    canSeePlanning: false,
    canSeeEngagement: false,
  },
  "Barangay Official": {
    label: "Barangay Official",
    color: "#6B4F2A",
    description: "Barangay hall — submit infrastructure requests for MPDC review",
    canSeeLayers: true,
    canSeeRisk: true,
    canSeeProjects: true,
    canSeeAlerts: false,
    canSeeBusinessPermits: false,
    canSeePlanning: true,
    canSeeEngagement: false,
  },
  "Private Engineer": {
    label: "Private Engineer",
    color: "#0d7377",
    description: "Licensed Private Civil Engineers & Architects — submit blueprints, 3D designs, and progress logs",
    canSeeLayers: true,
    canSeeRisk: true,
    canSeeProjects: false,
    canSeeAlerts: false,
    canSeeBusinessPermits: false,
    canSeePlanning: false,
    canSeeEngagement: false,
  },
  Viewer: {
    label: "Public Viewer",
    color: "#151c28",
    description: "Citizen portal access — live map, projects, and public reporting",
    canSeeLayers: true,
    canSeeRisk: true,
    canSeeProjects: true,
    canSeeAlerts: true,
    canSeeBusinessPermits: false,
    canSeePlanning: false,
    canSeeEngagement: false,
  },
};

export const ROLE_CREDENTIALS: Record<string, UserRole> = {
  mpdc: "MPDC",
  engineer: "Engineer",
  agriculture: "Agriculture",
  treasury: "Treasury Office",
  negosyo: "Treasury Office",
  barangay: "Barangay Official",
  pengineer: "Private Engineer",
};

type FeatureIcon = "map" | "cloud" | "alert" | "building" | "bell" | "clipboard";

const IconMap = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
    <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
  </svg>
);
const IconCloud = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
  </svg>
);
const IconAlert = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconBuilding = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="7" width="20" height="14" rx="1" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);
const IconBell = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const IconClipboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
  </svg>
);

const FEATURE_ICON_MAP: Record<FeatureIcon, () => JSX.Element> = {
  map: IconMap,
  cloud: IconCloud,
  alert: IconAlert,
  building: IconBuilding,
  bell: IconBell,
  clipboard: IconClipboard,
};

const FEATURES: { icon: FeatureIcon; title: string; desc: string }[] = [
  { icon: "map", title: "3D Municipal Globe", desc: "Cesium 3D map of Luisiana with high-resolution satellite imagery, terrain contours, and 23-barangay boundaries." },
  { icon: "alert", title: "Hazard Risk Siting Assessment", desc: "Evaluate any coordinate for flood, rain-induced landslide, PEIS, and PHIVOLCS 2014 ground shaking before construction." },
  { icon: "building", title: "Infrastructure Tracking", desc: "Pin, place, and monitor municipal infrastructure with live progress milestones, blueprints, and inspector logs." },
  { icon: "bell", title: "Disaster-Resilient Planning", desc: "Barangay project requests scored against geotechnical constraints for MPDC zoning and engineering review." },
  { icon: "clipboard", title: "Treasury Collections", desc: "Integrated municipal collections for Order of Payment, O.R. issuance, and business clearance fees." },
];

type LandingPageId = "overview" | "features" | "departments" | "risk" | "about";

const PageWrap = ({ children }: { children: ReactNode }) => (
  <div className="page-wrap">{children}</div>
);

const PageOverview = ({
  onEnter,
  onPublicPortal,
  onOnlineServices,
  onNewApplication,
  onTrackPermit,
  setActivePage,
}: {
  onEnter: () => void;
  onPublicPortal: () => void;
  onOnlineServices?: () => void;
  onNewApplication?: () => void;
  onTrackPermit?: () => void;
  setActivePage: (page: LandingPageId) => void;
}) => {
  const [showcaseMode, setShowcaseMode] = useState<"map" | "video">("map");

  return (
    <>
      {/* ── Hero Section (Flat & Minimal) ────────────────────────────────────── */}
      <section className="hero-flat">
        <div className="hero-status-pill">
          <span className="hero-status-dot" />
          <span>Live · Municipality of Luisiana, Laguna</span>
        </div>

        <h1>INFA-TRACK</h1>
        <p className="hero-headline-sub">Precision GIS &amp; Disaster-Resilient Siting</p>

        <p className="hero-lede">
          Empowering Luisiana&apos;s municipal engineers, planners, and citizens to build on safer ground — featuring real-time 3D terrain intelligence, hazard risk analytics, and inter-departmental workflows.
        </p>

        <div className="hero-actions-cluster">
          <button
            type="button"
            className="landing-btn landing-btn-primary"
            onClick={onNewApplication || onOnlineServices || onPublicPortal}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Start New Application</span>
          </button>

          <button
            type="button"
            className="landing-btn landing-btn-secondary"
            onClick={onPublicPortal}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <polygon points="12 8 8 12 12 16 12 8" />
            </svg>
            <span>Open Public Portal</span>
          </button>

          {onTrackPermit && (
            <button
              type="button"
              className="landing-btn landing-btn-outline"
              onClick={onTrackPermit}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Track Permit</span>
            </button>
          )}

          <button type="button" className="landing-btn landing-btn-ghost" onClick={onEnter}>
            <span>Department Sign In →</span>
          </button>
        </div>

        {/* Showcase Preview */}
        <div className="hero-showcase">
          <div className="hero-showcase-bar">
            <div className="hero-showcase-dots">
              <span className="hero-showcase-dot" style={{ background: "#ff5f56" }} />
              <span className="hero-showcase-dot" style={{ background: "#ffbd2e" }} />
              <span className="hero-showcase-dot" style={{ background: "#27c93f" }} />
            </div>
            <span className="hero-showcase-title">
              {showcaseMode === "map"
                ? "3D Terrain & Geohazard Monitoring · Luisiana Globe (Stadia Maps)"
                : "Aerial Drone Overview · Bayan ng Luisiana"}
            </span>
            <div className="hero-showcase-tabs">
              <button
                type="button"
                className={`hero-showcase-tab ${showcaseMode === "map" ? "active" : ""}`}
                onClick={() => setShowcaseMode("map")}
                title="Tingnan ang 3D Terrain & Geohazard Map"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                <span>Stadia GIS Mapa</span>
              </button>
              <button
                type="button"
                className={`hero-showcase-tab ${showcaseMode === "video" ? "active" : ""}`}
                onClick={() => setShowcaseMode("video")}
                title="Tingnan ang Drone Aerial Video"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Drone Video</span>
              </button>
            </div>
          </div>
          <div className="hero-showcase-video">
            {showcaseMode === "map" ? (
              <img
                src="/luisiana-stadia-map.png"
                alt="3D Terrain & Geohazard Monitoring · Luisiana Globe"
                className="hero-showcase-map-img"
              />
            ) : (
              <video autoPlay muted loop playsInline preload="auto">
                <source src="/hero.mp4" type="video/mp4" />
              </video>
            )}
          </div>
        </div>
      </section>

      {/* ── Key Metrics Ribbon ───────────────────────────────────────────────── */}
    <div className="metrics-ribbon">
      <div className="metrics-ribbon-inner">
        {[
          { v: "23", l: "Barangays Covered" },
          { v: "5", l: "Municipal Offices" },
          { v: "3D", l: "Cesium Terrain Globe" },
          { v: "Real-Time", l: "PHIVOLCS & MGB Hazard Feeds" },
        ].map((s) => (
          <div key={s.l} className="metric-cell">
            <div className="metric-value">{s.v}</div>
            <div className="metric-label">{s.l}</div>
          </div>
        ))}
      </div>
    </div>

    {/* ── Core Capabilities Grid ───────────────────────────────────────────── */}
    <section className="flat-section">
      <div className="section-header-minimal">
        <h2>Built for where Luisiana builds</h2>
        <p>A unified spatial system linking field requests, geotechnical evaluation, and engineering review.</p>
      </div>

      <div className="features-grid">
        {[
          {
            icon: <IconMap />,
            title: "3D Municipal Globe",
            desc: "Explore Luisiana with street-level Cesium terrain, satellite imagery, 3D structure placement, and 23 barangay zoning overlays.",
          },
          {
            icon: <IconAlert />,
            title: "Siting Risk Assessment",
            desc: "Evaluate any pin inside the municipality against historical PHIVOLCS ground shaking, rain-induced landslides, and flood thresholds.",
          },
          {
            icon: <IconBuilding />,
            title: "Infrastructure Tracking",
            desc: "Centralized municipal asset registry with blueprint archives, field inspection photos, contractor milestones, and real-time alerts.",
          },
          {
            icon: <IconClipboard />,
            title: "Planning & Zoning Board",
            desc: "Barangay proposals scored with spatial intelligence for MPDC review, streamlining approvals for safe, compliant facilities.",
          },
        ].map((f) => (
          <div key={f.title} className="feature-flat-card">
            <div className="feature-icon-wrap">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>

    {/* ── Departments Directory ────────────────────────────────────────────── */}
    <section className="flat-section" style={{ paddingTop: 0 }}>
      <div className="section-header-minimal">
        <h2>Inter-Departmental Governance</h2>
        <p>Role-scoped workspaces tailored to municipal workflows and accountability.</p>
      </div>

      <div className="dept-directory">
        {[
          { name: "MPDC", desc: "Pins project locations, evaluates terrain suitability, and coordinates zoning approvals.", scope: ["Site Siting", "Planning Board", "Zoning Clearance"] },
          { name: "Engineering Office", desc: "Performs geotechnical verification, places 3D CAD/glTF models, and monitors construction.", scope: ["3D Placement", "Inspections", "Structural Logs"] },
          { name: "Agriculture Office", desc: "Monitors agro-climatic risks, rural farm infrastructure, and flood vulnerability.", scope: ["Agro-Risk", "Watersheds", "Rural Roads"] },
          { name: "Treasury Office", desc: "Handles revenue assessment, Order of Payment collection, and official receipt tracking.", scope: ["O.R. Issuance", "Collections", "Permit Fees"] },
          { name: "Barangay Officials", desc: "Submits community infrastructure proposals with ground coordinates and photos.", scope: ["Project Requests", "Local Notices", "Public Feedback"] },
        ].map((d) => (
          <div key={d.name} className="dept-card-flat">
            <div className="dept-info">
              <div className="dept-title-wrap">
                <strong>{d.name}</strong>
                <span className="dept-badge">Authorized Staff</span>
              </div>
              <p>{d.desc}</p>
            </div>
            <div className="dept-tags">
              {d.scope.map((tag) => (
                <span key={tag} className="dept-tag-chip">{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>

    {/* ── Call to Action Banner ────────────────────────────────────────────── */}
    <div className="cta-banner-flat">
      <div className="cta-banner-copy">
        <h2>Ready to explore or plan?</h2>
        <p>Open the public portal for interactive map layers and ongoing projects — or sign in to your department workspace to review sites and issue permits.</p>
      </div>
      <div className="cta-banner-actions">
        <button type="button" className="landing-btn landing-btn-primary" onClick={onPublicPortal}>
          Open Public Portal
        </button>
        <button type="button" className="landing-btn landing-btn-secondary" onClick={onEnter}>
          Department Sign In
        </button>
        <button type="button" className="landing-btn landing-btn-outline" onClick={() => setActivePage("about")}>
          About System
        </button>
      </div>
    </div>
  </>
  );
};

const PageFeatures = ({ onEnter, onPublicPortal }: { onEnter: () => void; onPublicPortal: () => void }) => (
  <section className="flat-section">
    <div className="section-header-minimal">
      <h2>Core Municipal Capabilities</h2>
      <p>Purpose-built spatial tools for site evaluation, asset management, and risk mitigation.</p>
    </div>

    <div className="features-grid">
      {FEATURES.map((f) => {
        const Icon = FEATURE_ICON_MAP[f.icon];
        return (
          <div key={f.title} className="feature-flat-card">
            <div className="feature-icon-wrap"><Icon /></div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        );
      })}
    </div>

    <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 48 }}>
      <button type="button" className="landing-btn landing-btn-primary" onClick={onPublicPortal}>
        Open Public Portal
      </button>
      <button type="button" className="landing-btn landing-btn-secondary" onClick={onEnter}>
        Sign In to Dashboard
      </button>
    </div>
  </section>
);

const PageDepartments = ({ onEnter, onPublicPortal }: { onEnter: () => void; onPublicPortal: () => void }) => (
  <section className="flat-section">
    <div className="section-header-minimal">
      <h2>Department Workspaces</h2>
      <p>Role-based access designed to ensure each office sees exactly what is needed for swift action.</p>
    </div>

    <div className="dept-directory">
      {(Object.entries(ROLE_CONFIGS) as [UserRole, RoleConfig][]).map(([roleKey, cfg]) => (
        <div key={roleKey} className="dept-card-flat">
          <div className="dept-info">
            <div className="dept-title-wrap">
              <strong style={{ color: cfg.color }}>{cfg.label}</strong>
              <span className="dept-badge">Active Role</span>
            </div>
            <p>{cfg.description}</p>
          </div>
          <div className="dept-tags">
            {[
              cfg.canSeeLayers && "Map Layers",
              cfg.canSeeRisk && "Risk Assessment",
              cfg.canSeeProjects && "Infrastructure",
              cfg.canSeeAlerts && "Alerts Feed",
              cfg.canSeeBusinessPermits && "Permits & Treasury",
              cfg.canSeePlanning && "Planning Board",
            ].filter(Boolean).map((item) => (
              <span key={item as string} className="dept-tag-chip">{item}</span>
            ))}
          </div>
        </div>
      ))}
    </div>

    <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 48 }}>
      <button type="button" className="landing-btn landing-btn-primary" onClick={onPublicPortal}>
        Open Public Portal
      </button>
      <button type="button" className="landing-btn landing-btn-secondary" onClick={onEnter}>
        Sign In to Your Department
      </button>
    </div>
  </section>
);

const PageRisk = () => (
  <section className="flat-section">
    <div className="section-header-minimal">
      <h2>Siting Risk Classification</h2>
      <p>Every pin in Luisiana is evaluated against rigorous geological and meteorological indicators.</p>
    </div>

    <div className="risk-grid">
      {[
        {
          cls: "risk-high",
          level: "High Risk",
          title: "Avoid if possible — Requires Mitigation",
          desc: "Steep slopes or earthquake-prone fault proximity. Any development here requires comprehensive geotechnical study, soil stabilization, and reinforced structural calculations.",
        },
        {
          cls: "risk-mod",
          level: "Moderate Risk",
          title: "Buildable with Engineering Controls",
          desc: "Moderate slope or drainage constraints. MPDC and Municipal Engineers review elevation drainage, retaining measures, and foundation depth before approval.",
        },
        {
          cls: "risk-low",
          level: "Safe / Low Risk",
          title: "Preferred Ground for Infrastructure",
          desc: "Stable terrain with minimal liquefaction and slope failure vulnerability. Preferred for schools, evacuation centers, and civic buildings.",
        },
      ].map((r) => (
        <div key={r.level} className={`risk-card-flat ${r.cls}`}>
          <div className="risk-level-badge">{r.level}</div>
          <div className="risk-content">
            <h3>{r.title}</h3>
            <p>{r.desc}</p>
          </div>
        </div>
      ))}
    </div>

    <div className="risk-methodology-card">
      <h4>Geotechnical & Hazard Data Sources</h4>
      <p>
        Assessments are computed using local PHIVOLCS Earthquake Intensity Scale (PEIS) sheets, 2014 Ground Shaking hazard overlays, digitized elevation contours, and live MGB rain-induced landslide and flood susceptibility data. Restricted to the geographic boundaries of Luisiana, Laguna.
      </p>
    </div>
  </section>
);

const PageAbout = ({ onEnter, onPublicPortal }: { onEnter: () => void; onPublicPortal: () => void }) => (
  <section className="flat-section">
    <div className="section-header-minimal">
      <h2>About the INFA-TRACK System</h2>
      <p>Modern spatial infrastructure intelligence for the Municipality of Luisiana, Laguna.</p>
    </div>

    <div className="about-flat-grid">
      <div className="about-prose-flat">
        <h3>Built for Resilient Municipal Governance</h3>
        <p>
          INFA-TRACK is the municipal GIS and infrastructure tracking platform developed for the local government unit of Luisiana, Laguna. It replaces fragmented paper files with a single, collaborative 3D geospatial environment.
        </p>
        <p>
          By connecting MPDC planners, municipal engineers, treasury staff, and barangay captains on one interactive terrain globe, the system ensures that every peso of public investment is sited on safe, resilient ground.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button type="button" className="landing-btn landing-btn-primary" onClick={onPublicPortal}>
            Open Public Portal
          </button>
          <button type="button" className="landing-btn landing-btn-secondary" onClick={onEnter}>
            Department Sign In
          </button>
        </div>
      </div>

      <div className="about-specs-table">
        {[
          { label: "Municipality", value: "Luisiana" },
          { label: "Province", value: "Laguna" },
          { label: "Region", value: "Region IV-A (CALABARZON)" },
          { label: "Classification", value: "4th Class Municipality" },
          { label: "Barangays", value: "23 Local Barangays" },
          { label: "GIS Core", value: "Cesium 3D / Mapbox GL" },
          { label: "Hazard Layers", value: "PHIVOLCS & MGB GeoRiskPH" },
          { label: "Deployment", value: "Web / Offline Globe Worker" },
        ].map((item) => (
          <div key={item.label} className="about-spec-row">
            <span className="spec-key">{item.label}</span>
            <span className="spec-val">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  </section>
);

function parseLandingHash(): LandingPageId {
  if (typeof window === "undefined") return "overview";
  const h = (window.location.hash || "").toLowerCase().replace(/^#\/?/, "");
  if (h === "features" || h === "capabilities") return "features";
  if (h === "departments") return "departments";
  if (h === "risk" || h === "hazard") return "risk";
  if (h === "about") return "about";
  return "overview";
}

export function LandingPage({
  onEnter,
  onPublicPortal,
  onOnlineServices,
  onNewApplication,
  onTrackPermit,
}: {
  onEnter: () => void;
  onPublicPortal: () => void;
  onOnlineServices?: () => void;
  onNewApplication?: () => void;
  onTrackPermit?: () => void;
}) {
  const [activePage, setActivePage] = useState<LandingPageId>(() => parseLandingHash());

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      setActivePage(parseLandingHash());
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, []);

  const handleNavClick = (page: LandingPageId) => {
    setActivePage(page);
    setMobileMenuOpen(false);
    const targetHash = page === "overview" ? "" : `#${page === "features" ? "capabilities" : page}`;
    if (window.location.hash !== targetHash) {
      if (!targetHash) {
        window.history.pushState(
          { ...window.history.state, landingTab: page },
          "",
          window.location.pathname + window.location.search
        );
      } else {
        window.location.hash = targetHash;
      }
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 860) setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const NAV_LINKS: { label: string; page: LandingPageId }[] = [
    { label: "Overview", page: "overview" },
    { label: "Capabilities", page: "features" },
    { label: "Departments", page: "departments" },
    { label: "Risk Siting", page: "risk" },
    { label: "About", page: "about" },
  ];

  const PAGE_MAP = useMemo(
    () => ({
      overview: (props: {
        onEnter: () => void;
        onPublicPortal: () => void;
        onOnlineServices?: () => void;
        onNewApplication?: () => void;
        onTrackPermit?: () => void;
      }) => <PageOverview {...props} setActivePage={setActivePage} />,
      features: PageFeatures,
      departments: PageDepartments,
      risk: (_props: { onEnter: () => void; onPublicPortal: () => void }) => <PageRisk />,
      about: PageAbout,
    }),
    []
  );

  const ActivePage = PAGE_MAP[activePage];

  return (
    <div className="landing">
      {/* ── Minimal Flat Navbar ────────────────────────────────────────────── */}
      <nav className={`landing-nav${mobileMenuOpen ? " mobile-open" : ""}`}>
        <div
          className="landing-brand"
          onClick={() => handleNavClick("overview")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleNavClick("overview");
            }
          }}
          role="button"
          tabIndex={0}
        >
          <img src="/logo.png" alt="Bayan ng Luisiana seal" />
          <div className="landing-brand-text">
            <span className="name">INFA-TRACK</span>
            <span className="tag">Luisiana GIS</span>
          </div>
        </div>

        {/* Desktop segmented links */}
        <div className="landing-links">
          {NAV_LINKS.map((link) => (
            <button
              key={link.page}
              type="button"
              className={`landing-link${activePage === link.page ? " active" : ""}`}
              onClick={() => handleNavClick(link.page)}
            >
              {link.label}
            </button>
          ))}
        </div>

        <div className="landing-nav-actions">
          <ThemeToggle iconOnly />

          {onTrackPermit && (
            <button
              type="button"
              className="landing-btn landing-btn-outline landing-nav-hide-mobile"
              onClick={onTrackPermit}
              title="Track Permit Status"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Track Permit</span>
            </button>
          )}

          <button
            type="button"
            className="landing-btn landing-btn-primary landing-nav-btn-app"
            onClick={() => {
              setMobileMenuOpen(false);
              (onNewApplication || onOnlineServices || onPublicPortal)();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="landing-btn-label-desktop">New Application</span>
            <span className="landing-btn-label-mobile">New App</span>
          </button>

          <button
            type="button"
            className="landing-btn landing-btn-secondary landing-nav-btn-signin"
            onClick={onEnter}
          >
            <span>Sign In</span>
          </button>

          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            className={`landing-menu-toggle${mobileMenuOpen ? " active" : ""}`}
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* ── Mobile Navigation Drawer & Backdrop ────────────────────────────── */}
      {mobileMenuOpen && (
        <>
          <div
            className="landing-mobile-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="landing-mobile-drawer">
            <div className="landing-mobile-links">
              {NAV_LINKS.map((link) => (
                <button
                  key={link.page}
                  type="button"
                  className={`landing-mobile-link${activePage === link.page ? " active" : ""}`}
                  onClick={() => handleNavClick(link.page)}
                >
                  <span>{link.label}</span>
                  {activePage === link.page ? (
                    <span className="active-pill">Current</span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            <div className="landing-mobile-drawer-actions">
              {onTrackPermit && (
                <button
                  type="button"
                  className="landing-btn landing-btn-outline landing-btn-full"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onTrackPermit();
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <span>Track Permit Status</span>
                </button>
              )}

              <button
                type="button"
                className="landing-btn landing-btn-primary landing-btn-full"
                onClick={() => {
                  setMobileMenuOpen(false);
                  (onNewApplication || onOnlineServices || onPublicPortal)();
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Start New Application</span>
              </button>

              <button
                type="button"
                className="landing-btn landing-btn-secondary landing-btn-full"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onEnter();
                }}
              >
                <span>Department Sign In</span>
              </button>
            </div>

            <div className="landing-mobile-drawer-footer">
              <span>Municipality of Luisiana, Laguna · Bayan ng Luisiana</span>
            </div>
          </div>
        </>
      )}

      {/* ── Active Sub-Page Content ────────────────────────────────────────── */}
      <PageWrap>
        <ActivePage
          onEnter={onEnter}
          onPublicPortal={onPublicPortal}
          onOnlineServices={onOnlineServices}
          onNewApplication={onNewApplication}
          onTrackPermit={onTrackPermit}
        />
      </PageWrap>
    </div>
  );
}

export function LoginScreen({
  onLogin,
  onBack,
}: {
  onLogin: (session: import("../services/auth").SessionUser) => void;
  onBack: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      const { authenticateUserSecure } = await import("../services/auth");
      const result = await authenticateUserSecure(username, password);
      if (result.ok) {
        onLogin(result.session);
      } else if (result.error === "locked") {
        const until = result.lockedUntil ? new Date(result.lockedUntil) : null;
        const when = until && Number.isFinite(until.getTime())
          ? until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : "later";
        setError(`Account locked after too many failed attempts. Try again after ${when}.`);
      } else if (result.error === "unavailable") {
        setError("Sign-in service is unavailable. Check your connection and try again.");
      } else {
        setError("Invalid username or password.");
      }
    } catch (err) {
      console.error("[Auth] Login error:", err);
      setError("Sign-in failed. Check your connection and try again.");
    }
    setLoading(false);
  }

  return (
    <div className="login">
      <div className="login-nav-top">
        <button type="button" className="landing-btn landing-btn-ghost" onClick={onBack}>
          ← Back to Overview
        </button>
        <ThemeToggle iconOnly />
      </div>

      <div className="login-container">
        <div className="login-card-flat">
          <div className="login-card-header">
            <img src="/logo.png" alt="Luisiana Seal" className="login-card-logo" />
            <h2>Sign In to INFA-TRACK</h2>
            <p>Access your municipal department workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="field">
              <label htmlFor="login-user">Department Account / Username</label>
              <input
                id="login-user"
                type="text"
                className="login-input"
                value={username}
                autoFocus
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                placeholder="mpdc / engineer / agriculture / treasury / barangay"
              />
            </div>

            <div className="field">
              <label htmlFor="login-pass">Password</label>
              <div className="login-password-wrap">
                <input
                  id="login-pass"
                  type={showPassword ? "text" : "password"}
                  className="login-input"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && <div className="login-error-pill">{error}</div>}

            <button type="submit" className="login-submit-btn" disabled={loading}>
              {loading ? "Verifying credentials..." : "Sign In to Dashboard"}
            </button>
          </form>

          <div className="login-accounts-ref">
            <div className="login-accounts-title">Authorized Roles</div>
            <div className="login-accounts-grid">
              {(Object.entries(ROLE_CONFIGS) as [UserRole, RoleConfig][]).map(([roleKey, cfg]) => (
                <div key={roleKey} className="login-account-item">
                  <strong>{cfg.label}</strong>
                  <span>{cfg.description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
