import { useMemo, useState, type ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

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

function CapsuleActions({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className ? `btn-capsule ${className}` : "btn-capsule"}>{children}</div>;
}

type FeatureIcon = "map" | "cloud" | "alert" | "building" | "bell" | "clipboard";

const IconMap = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
    <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
  </svg>
);
const IconCloud = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
  </svg>
);
const IconAlert = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconBuilding = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="1" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);
const IconBell = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const IconClipboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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
  { icon: "map", title: "3D municipal globe", desc: "Cesium map of Luisiana with satellite imagery, 3D models, and barangay colors." },
  { icon: "alert", title: "Risk assessment tools", desc: "Click a site for flood, rain-induced landslide, PEIS, EIL 2014, and the terrain model. Luisiana only." },
  { icon: "building", title: "Infrastructure tracking", desc: "Pin, place, and monitor municipal projects with progress, photos, and reports." },
  { icon: "bell", title: "Disaster-resilient planning", desc: "Barangay requests, MPDC siting review, Engineer placement — build on safer ground." },
  { icon: "clipboard", title: "Treasury Collections", desc: "Municipal Treasury dashboard for Order of Payment collections, O.R. issuance, and business taxes." },
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
}) => (
  <>
    <section className="hero">
      <div className="hero-media">
        <video autoPlay muted loop playsInline preload="auto">
          <source src="/hero.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="hero-copy">
        <div className="hero-kicker">
          <span className="pulse" />
          Live — Luisiana, Laguna
        </div>
        <img src="/logo.png" alt="Bayan ng Luisiana" className="hero-logo" />
        <h1>INFA-TRACK</h1>
        <p className="hero-lede">
          Municipal GIS for where Luisiana builds infrastructure on safer ground — 3D map, site assessment, and department planning.
        </p>
        <CapsuleActions className="hero-cta">
          <button
            type="button"
            className="btn-amber"
            onClick={onNewApplication || onOnlineServices || onPublicPortal}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New Application</span>
          </button>
          {onTrackPermit && (
            <button
              type="button"
              className="btn-ghost"
              onClick={onTrackPermit}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#38bdf8", borderColor: "rgba(56, 189, 248, 0.4)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Track Permit</span>
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onEnter}>
            Department Sign In
          </button>
        </CapsuleActions>
      </div>
    </section>

    <div className="masthead">
      {[
        { v: "23", l: "Barangays" },
        { v: "5", l: "Municipal offices" },
        { v: "3D", l: "Luisiana globe" },
        { v: "Live", l: "Flood & landslide" },
      ].map((s) => (
        <div key={s.l} className="masthead-cell">
          <div className="v">{s.v}</div>
          <div className="l">{s.l}</div>
        </div>
      ))}
    </div>

    <section className="ed-section">
      <div className="ed-rail">
        <h2>Built for where Luisiana builds</h2>
        <p>MPDC pins the site. Engineer places the model. Assessment at every pin.</p>
      </div>
      <div className="ed-body">
        <div className="ed-list">
          {[
            { icon: <IconMap />, title: "3D municipal globe", desc: "Street-level Cesium map of Luisiana with satellite, 3D models, and a 23-barangay overlay." },
            { icon: <IconAlert />, title: "Site assessment", desc: "Flood, rain-induced landslide, PEIS, EIL 2014, terrain model, and distance to Mt. Banahaw — inside the municipality only." },
            { icon: <IconBuilding />, title: "Infrastructure tracking", desc: "Municipal projects, construction progress, photos, and reports in one register." },
            { icon: <IconClipboard />, title: "Planning board", desc: "Barangay requests scored for MPDC zoning review. Negosyo Center still handles permits." },
          ].map((f, i) => (
            <div key={f.title} className="ed-item">
              <div className="idx">{String(i + 1).padStart(2, "0")}</div>
              <div>
                <div className="icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="ed-section">
      <div className="ed-rail">
        <h2>Offices on the line</h2>
        <p>MPDC · Engineer · Agriculture · Treasury Office · Barangay</p>
      </div>
      <div className="ed-body">
        <div className="dept-stack">
          {[
            { name: "MPDC", desc: "Pins sites and reviews siting" },
            { name: "Engineer", desc: "Places and builds the model" },
            { name: "Agriculture", desc: "Climate and risk for farm sites" },
            { name: "Treasury Office", desc: "Payments, O.R. issuance & business taxes" },
            { name: "Barangay Official", desc: "Requests infrastructure" },
          ].map((d) => (
            <div key={d.name} className="dept-row">
              <div className="dept-name">
                <strong>{d.name}</strong>
                <span>{d.desc}</span>
              </div>
              <div className="dept-perms">
                <span>Role-scoped views</span>
                <span>Live feeds</span>
                <span>Audit-ready records</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <div className="cta-band">
      <div>
        <h2>Ready when the municipality is</h2>
        <p>Open the public portal for the live map and projects — or sign in to pin sites, assess ground, and plan.</p>
      </div>
      <CapsuleActions>
        <button type="button" className="btn-amber" onClick={onPublicPortal}>Public Portal</button>
        <button type="button" className="btn-ghost" onClick={onEnter}>Launch Dashboard</button>
        <button type="button" className="btn-ghost" onClick={() => setActivePage("about")}>About the System</button>
      </CapsuleActions>
    </div>
  </>
);

const PageFeatures = ({ onEnter, onPublicPortal }: { onEnter: () => void; onPublicPortal: () => void }) => (
  <>
    <section className="ed-section">
      <div className="ed-rail">
        <h2>What staff actually use</h2>
        <p>Siting, assessment, and tracking — not an MDRRM operations desk.</p>
      </div>
      <div className="ed-body">
        <div className="ed-list">
          {FEATURES.map((f, i) => {
            const Icon = FEATURE_ICON_MAP[f.icon];
            return (
              <div key={f.title} className="ed-item">
                <div className="idx">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <div className="icon"><Icon /></div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
        <CapsuleActions className="ed-cta">
          <button type="button" className="btn-amber" onClick={onPublicPortal}>Open Public Portal</button>
          <button type="button" className="btn-ghost" onClick={onEnter}>Sign In to Access All Features</button>
        </CapsuleActions>
      </div>
    </section>
  </>
);

const PageDepartments = ({ onEnter, onPublicPortal }: { onEnter: () => void; onPublicPortal: () => void }) => (
  <section className="ed-section">
    <div className="ed-rail">
      <h2>Department accounts</h2>
      <p>Each office sees only what it needs to act.</p>
    </div>
    <div className="ed-body">
      <div className="dept-stack">
        {(Object.entries(ROLE_CONFIGS) as [UserRole, RoleConfig][]).map(([, cfg]) => (
          <div key={cfg.label} className="dept-row">
            <div className="dept-name">
              <strong style={{ color: cfg.color }}>{cfg.label}</strong>
              <span>{cfg.description}</span>
            </div>
            <div className="dept-perms">
              {[
                cfg.canSeeLayers && "Map layers",
                cfg.canSeeRisk && "Siting assessment",
                cfg.canSeeProjects && "Infrastructure projects",
                cfg.canSeeAlerts && "Project notices",
                cfg.canSeeBusinessPermits && "Business permits",
                cfg.canSeePlanning && "Planning board",
              ].filter(Boolean).map((item) => (
                <span key={item as string}>{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <CapsuleActions className="ed-cta">
        <button type="button" className="btn-amber" onClick={onPublicPortal}>Open Public Portal</button>
        <button type="button" className="btn-ghost" onClick={onEnter}>Sign In to Your Department</button>
      </CapsuleActions>
    </div>
  </section>
);

const PageRisk = () => (
  <section className="ed-section">
    <div className="ed-rail">
      <h2>Risk assessment for siting</h2>
      <p>Click a pin inside Luisiana. Classes tell you whether the ground is preferred, or better avoided.</p>
    </div>
    <div className="ed-body" style={{ padding: 0 }}>
      {[
        { cls: "risk-high", level: "HIGH", title: "Avoid if possible", desc: "Steep or earthquake-prone ground. New infrastructure here needs extra review — prefer another site when you can." },
        { cls: "risk-mod", level: "MODERATE", title: "Extra structural review", desc: "Buildable with care. Engineer and MPDC weigh flood, landslide, and seismic class before placing the model." },
        { cls: "risk-low", level: "SAFE / LOW", title: "Preferred for siting", desc: "Safer ground for municipal facilities. Still check live flood and rain-induced landslide on the pin." },
      ].map((r) => (
        <div key={r.level} className={`risk-band ${r.cls}`}>
          <div className="level">{r.level}</div>
          <div className="copy">
            <h3>{r.title}</h3>
            <p>{r.desc}</p>
          </div>
        </div>
      ))}
      <div className="formula-block">
        <h3>What the assessment uses</h3>
        <p>
          Local PHIVOLCS EIL / ground-shaking 2014 sheets and a terrain model, plus live MGB flood and rain-induced landslide (GeoRiskPH). Luisiana only. Not HazardHunterPH, not an evacuation feed.
        </p>
      </div>
    </div>
  </section>
);

const PageAbout = ({ onEnter, onPublicPortal }: { onEnter: () => void; onPublicPortal: () => void }) => (
  <div className="about-grid">
    <div className="about-prose">
      <h2>Built for Luisiana&apos;s municipal government</h2>
      <p>
        INFA-TRACK is the municipal GIS for Luisiana, Laguna — where to pin and place infrastructure on safer ground. MPDC, Engineering, Agriculture, Treasury Office, and barangay halls share one 3D map.
      </p>
      <p>
        Site assessment uses PHIVOLCS 2014 sheets, a local terrain model, and live MGB flood / landslide layers. Residents open the Public Portal for the map and projects without signing in.
      </p>
      <CapsuleActions>
        <button type="button" className="btn-amber" onClick={onPublicPortal}>Open Public Portal</button>
        <button type="button" className="btn-ghost" onClick={onEnter}>Sign In to Dashboard</button>
      </CapsuleActions>
    </div>
    <div className="about-meta">
      {[
        { label: "Municipality", value: "Luisiana" },
        { label: "Province", value: "Laguna" },
        { label: "Region", value: "IV-A CALABARZON" },
        { label: "System type", value: "Municipal siting GIS" },
        { label: "Assessment", value: "Luisiana only" },
        { label: "Live hazards", value: "MGB flood & landslide" },
        { label: "Seismic", value: "PHIVOLCS 2014 + terrain" },
        { label: "Globe", value: "Cesium / ESRI" },
      ].map((item) => (
        <div key={item.label} className="meta-row">
          <span className="k">{item.label}</span>
          <span className="val">{item.value}</span>
        </div>
      ))}
    </div>
  </div>
);

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
  const [activePage, setActivePage] = useState<LandingPageId>("overview");

  const NAV_LINKS: { label: string; page: LandingPageId }[] = [
    { label: "Overview", page: "overview" },
    { label: "Features", page: "features" },
    { label: "Departments", page: "departments" },
    { label: "Risk", page: "risk" },
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
      <nav className="landing-nav">
        <div className="landing-brand" onClick={() => setActivePage("overview")} onKeyDown={() => undefined} role="button" tabIndex={0}>
          <img src="/logo.png" alt="Bayan ng Luisiana seal" />
          <div>
            <div className="name">INFA-TRACK</div>
            <div className="tag">Luisiana LGU</div>
          </div>
        </div>
        <div className="landing-links">
          {NAV_LINKS.map((link) => (
            <button
              key={link.page}
              type="button"
              className={`landing-link${activePage === link.page ? " active" : ""}`}
              onClick={() => setActivePage(link.page)}
            >
              {link.label}
            </button>
          ))}
        </div>
        <div className="landing-nav-actions">
          <ThemeToggle />
          <CapsuleActions>
            {onTrackPermit && (
              <button
                type="button"
                className="btn-ghost"
                onClick={onTrackPermit}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#38bdf8" }}
                title="Subaybayan ang Aplikasyon / Track Permit"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span>Track Permit</span>
              </button>
            )}
            <button
              type="button"
              className="btn-amber"
              onClick={onNewApplication || onOnlineServices || onPublicPortal}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Application</span>
            </button>
            <button type="button" className="btn-ghost" onClick={onEnter}>
              Sign In
            </button>
          </CapsuleActions>
        </div>
      </nav>
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
      <aside className="login-rail">
        <div>
          <img src="/logo.png" alt="" className="login-rail-logo" />
          <h1>INFA-TRACK</h1>
          <p>Department access for Luisiana infrastructure siting.</p>
        </div>
        <p style={{ fontSize: "0.78rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, opacity: 0.75 }}>
          Luisiana · Laguna
        </p>
      </aside>
      <div className="login-main">
        <ThemeToggle className="theme-toggle-login" />
        <button type="button" className="login-back" onClick={onBack}>← Back to home</button>
        <div className="login-panel">
          <div className="title">Sign in</div>
          <div className="sub">Use your department account</div>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="login-user">Username</label>
              <input
                id="login-user"
                type="text"
                value={username}
                autoFocus
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                placeholder="mpdc / engineer / agriculture / negosyo / barangay"
              />
            </div>
            <div className="field">
              <label htmlFor="login-pass">Password</label>
              <div className="field-wrap">
                <input
                  id="login-pass"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  style={{ paddingRight: 42 }}
                />
                <button type="button" className="eye" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password">
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign In to Dashboard"}
            </button>
          </form>
          <div className="login-accounts">
            <div className="cap">Department Accounts</div>
            <div className="account-list">
              {(Object.entries(ROLE_CONFIGS) as [UserRole, RoleConfig][]).map(([, cfg]) => (
                <div key={cfg.label} className="account-row">
                  <strong style={{ color: cfg.color }}>{cfg.label}</strong>
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
