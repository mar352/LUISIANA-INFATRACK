import { useMemo, useState, type ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

export type UserRole =
  | "MPDC"
  | "Engineer"
  | "Agriculture"
  | "Negosyo Center"
  | "Barangay Official"
  | "Viewer";

export function isBarangayOfficial(role: UserRole | null | undefined): boolean {
  return role === "Barangay Official";
}

export function isMunicipalStaff(role: UserRole | null | undefined): boolean {
  return (
    role === "MPDC" ||
    role === "Engineer" ||
    role === "Agriculture" ||
    role === "Negosyo Center"
  );
}

export interface RoleConfig {
  label: string;
  color: string;
  description: string;
  canSeeWeather: boolean;
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
    color: "#245C3A",
    description: "Municipal Planning & Development Coordinator",
    canSeeWeather: true,
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
    color: "#3D9B5F",
    description: "Infrastructure & Engineering Office",
    canSeeWeather: true,
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
    color: "#3D9B5F",
    description: "Municipal Agriculture Office",
    canSeeWeather: true,
    canSeeLayers: false,
    canSeeRisk: true,
    canSeeProjects: false,
    canSeeAlerts: true,
    canSeeBusinessPermits: false,
    canSeePlanning: true,
    canSeeEngagement: false,
  },
  "Negosyo Center": {
    label: "Negosyo Center",
    color: "#2E6B45",
    description: "Business Permit & Licensing Office",
    canSeeWeather: false,
    canSeeLayers: false,
    canSeeRisk: false,
    canSeeProjects: false,
    canSeeAlerts: false,
    canSeeBusinessPermits: true,
    canSeePlanning: true,
    canSeeEngagement: false,
  },
  "Barangay Official": {
    label: "Barangay Official",
    color: "#6B4F2A",
    description: "Barangay hall — submit infrastructure requests for MPDC review",
    canSeeWeather: true,
    canSeeLayers: true,
    canSeeRisk: true,
    canSeeProjects: true,
    canSeeAlerts: false,
    canSeeBusinessPermits: false,
    canSeePlanning: true,
    canSeeEngagement: false,
  },
  Viewer: {
    label: "Public Viewer",
    color: "#3D9B5F",
    description: "Citizen portal access — live map, projects, and public reporting",
    canSeeWeather: true,
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
  negosyo: "Negosyo Center",
  barangay: "Barangay Official",
};

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
  { icon: "map", title: "Real-Time GIS Map", desc: "Live 3D map of Luisiana with risk zones, project markers, and satellite imagery." },
  { icon: "cloud", title: "Weather & Satellite", desc: "ECMWF IFS forecasts and NASA GIBS satellite precipitation layers." },
  { icon: "alert", title: "Landslide Risk", desc: "Automated risk scoring using rainfall intensity and slope data across all barangays." },
  { icon: "building", title: "Infrastructure Tracking", desc: "Monitor ongoing municipal, agricultural, and private construction projects in real time." },
  { icon: "bell", title: "Instant Alerts", desc: "Automatic HIGH-risk alerts pushed live to relevant departments via WebSocket." },
  { icon: "clipboard", title: "Business Permits", desc: "Negosyo Center dashboard for tracking permit applications and approvals." },
];

type LandingPageId = "overview" | "features" | "departments" | "risk" | "about";

const PageWrap = ({ children }: { children: ReactNode }) => (
  <div className="page-wrap">{children}</div>
);

const PageOverview = ({
  onEnter,
  onPublicPortal,
  setActivePage,
}: {
  onEnter: () => void;
  onPublicPortal: () => void;
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
          Integrated monitoring for municipal GIS, disaster risk, infrastructure, and business permits — built for Luisiana&apos;s departments.
        </p>
        <div className="hero-cta">
          <button type="button" className="btn-amber" onClick={onPublicPortal}>
            Public Portal
          </button>
          <button type="button" className="btn-ghost" onClick={onEnter}>
            Department Sign In
          </button>
        </div>
      </div>
    </section>

    <div className="masthead">
      {[
        { v: "5s", l: "Update Interval" },
        { v: "4", l: "Departments" },
        { v: "22+", l: "Projects Tracked" },
        { v: "Live", l: "Weather & Satellite" },
      ].map((s) => (
        <div key={s.l} className="masthead-cell">
          <div className="v">{s.v}</div>
          <div className="l">{s.l}</div>
        </div>
      ))}
    </div>

    <section className="ed-section">
      <div className="ed-rail">
        <h2>Built for modern municipal operations</h2>
        <p>One instrument panel. Four offices. Continuous signal.</p>
      </div>
      <div className="ed-body">
        <div className="ed-list">
          {[
            { icon: <IconMap />, title: "Real-Time GIS Mapping", desc: "Interactive maps with live overlays, satellite imagery, and custom layers for spatial analysis." },
            { icon: <IconAlert />, title: "Safe-site hazard layers", desc: "PHIVOLCS overlays, slope, and climate data so you can place infrastructure on safer ground." },
            { icon: <IconBuilding />, title: "Infrastructure Tracking", desc: "Municipal projects, construction progress, and assets in one continuous register." },
            { icon: <IconClipboard />, title: "Business Permit System", desc: "Permit processing, application status, and compliance without scattered spreadsheets." },
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
        <p>MDRRMO · MPDC · Engineering · Business Permits</p>
      </div>
      <div className="ed-body">
        <div className="dept-stack">
          {[
            { name: "MDRRMO", desc: "Disaster Risk Reduction" },
            { name: "MPDC", desc: "Planning & Development" },
            { name: "Engineering", desc: "Infrastructure Projects" },
            { name: "Business Permits", desc: "Licensing & Compliance" },
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
        <p>Open the public portal for the live map, projects, and citizen reporting — or sign in for department tools.</p>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn-amber" onClick={onPublicPortal}>Public Portal</button>
        <button type="button" className="btn-ghost" onClick={onEnter}>Launch Dashboard</button>
        <button type="button" className="btn-ghost" onClick={() => setActivePage("about")}>About the System</button>
      </div>
    </div>
  </>
);

const PageFeatures = ({ onEnter, onPublicPortal }: { onEnter: () => void; onPublicPortal: () => void }) => (
  <>
    <section className="ed-section">
      <div className="ed-rail">
        <h2>Everything your LGU needs</h2>
        <p>Six modules. One continuous operating picture.</p>
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
        <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn-amber" onClick={onPublicPortal}>Open Public Portal</button>
          <button type="button" className="btn-ghost" onClick={onEnter}>Sign In to Access All Features</button>
        </div>
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
                cfg.canSeeWeather && "Climate & Forecast",
                cfg.canSeeLayers && "Map Layer Controls",
                cfg.canSeeRisk && "Risk Zone Monitoring",
                cfg.canSeeProjects && "Infrastructure Projects",
                cfg.canSeeAlerts && "Real-Time Alerts",
                cfg.canSeeBusinessPermits && "Business Permit Dashboard",
              ].filter(Boolean).map((item) => (
                <span key={item as string}>{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn-amber" onClick={onPublicPortal}>Open Public Portal</button>
        <button type="button" className="btn-ghost" onClick={onEnter}>Sign In to Your Department</button>
      </div>
    </div>
  </section>
);

const PageRisk = () => (
  <section className="ed-section">
    <div className="ed-rail">
      <h2>Real-time risk monitoring</h2>
      <p>Rainfall × slope, scored across every barangay.</p>
    </div>
    <div className="ed-body" style={{ padding: 0 }}>
      {[
        { cls: "risk-high", level: "HIGH", title: "High Risk Alert", desc: "Triggered when rainfall intensity exceeds 72% and slope index is above 62%. Immediate evacuation advisory for affected barangays." },
        { cls: "risk-mod", level: "MODERATE", title: "Moderate Risk", desc: "Issued when combined risk exceeds 55% or rainfall alone is above 45%. Departments prepare response teams." },
        { cls: "risk-low", level: "LOW", title: "Low Risk / Safe", desc: "Normal conditions. Operations continue. System keeps passive monitoring every 5 seconds." },
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
        <h3>How the model works</h3>
        <p>
          Risk score = <em>Rainfall Intensity × 0.65</em> + <em>Slope Index × 0.55</em>. Sourced from ECMWF IFS and OpenStreetMap terrain, refreshed every 5 seconds via WebSocket.
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
        INFA-TRACK is a GIS monitoring platform for the Municipality of Luisiana, Laguna. It consolidates infrastructure tracking, disaster risk, weather, and business permits into one live dashboard.
      </p>
      <p>
        Open-data sources — ECMWF IFS, OpenStreetMap, NASA GIBS — keep licensing cost at zero while staying accurate enough for LGU decisions. Residents can open the Public Portal for the live map, project updates, and citizen reports without signing in.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn-amber" onClick={onPublicPortal}>Open Public Portal</button>
        <button type="button" className="btn-ghost" onClick={onEnter}>Sign In to Dashboard</button>
      </div>
    </div>
    <div className="about-meta">
      {[
        { label: "Municipality", value: "Luisiana" },
        { label: "Province", value: "Laguna" },
        { label: "Region", value: "IV-A CALABARZON" },
        { label: "System Type", value: "Real-Time GIS" },
        { label: "Data Updates", value: "Every 5 seconds" },
        { label: "Weather Model", value: "ECMWF IFS 0.25°" },
        { label: "Map Provider", value: "OpenFreeMap / ESRI" },
        { label: "Satellite Source", value: "NASA GIBS" },
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
}: {
  onEnter: () => void;
  onPublicPortal: () => void;
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
          <button type="button" className="btn-amber" onClick={onPublicPortal}>
            Public Portal
          </button>
          <button type="button" className="btn-ghost" onClick={onEnter}>
            Sign In
          </button>
        </div>
      </nav>
      <PageWrap>
        <ActivePage onEnter={onEnter} onPublicPortal={onPublicPortal} />
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
          <p>Department access for Luisiana municipal operations.</p>
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
