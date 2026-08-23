import { Component, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { EngagementKind, EngagementPublicStats, PublicProject } from "../types";
import { BARANGAY_LIST, MODEL_CATALOG } from "../types";
import {
  fetchEngagementPublicStats,
  fetchPublicProjects,
  publicProjectAsMapProject,
  submitEngagement,
} from "../lib/api";
import { CesiumMap, type CesiumMapHandle } from "./CesiumMap";
import TransparencyDashboard from "./TransparencyDashboard";
import { ThemeToggle } from "./ThemeToggle";
import "./CitizenPortal.css";

type PortalTab = "map" | "projects" | "report" | "feedback" | "suggest" | "transparency";

type Props = {
  onBack: () => void;
  /** Open the full live map shell (with side panel). */
  onOpenLiveMap: () => void;
};

const ISSUE_CATEGORIES = [
  { id: "road", label: "Road / pavement" },
  { id: "drainage", label: "Drainage / flooding" },
  { id: "lighting", label: "Street lighting" },
  { id: "building", label: "Building / facility" },
  { id: "other", label: "Other" },
] as const;

function modelLabel(type: string) {
  return MODEL_CATALOG.find((m) => m.type === type)?.label || type || "Project";
}

function statusClass(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "ok";
  if (s === "delayed" || s === "suspended") return "warn";
  if (s === "ongoing") return "live";
  return "";
}

function asProjectList(raw: unknown): PublicProject[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is PublicProject => Boolean(p && typeof p === "object" && "id" in p));
}

class PortalErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="cp-banner err" role="alert">
          {this.props.label}: {this.state.error}
          <button
            type="button"
            className="cp-btn"
            style={{ marginLeft: 12 }}
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CitizenPortal({ onBack, onOpenLiveMap }: Props) {
  const [tab, setTab] = useState<PortalTab>("projects");
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [stats, setStats] = useState<EngagementPublicStats | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const portalMapRef = useRef<CesiumMapHandle>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formCategory, setFormCategory] = useState("road");
  const [formProjectId, setFormProjectId] = useState("");
  const [formBarangay, setFormBarangay] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitOkId, setSubmitOkId] = useState("");

  const mapProjects = useMemo(() => {
    try {
      return projects.map(publicProjectAsMapProject);
    } catch {
      return [];
    }
  }, [projects]);

  const selected = useMemo(
    () => projects.find((p) => p.id === selectedId) || null,
    [projects, selectedId]
  );

  const refresh = useCallback(async () => {
    try {
      setLoadError("");
      const [proj, eng] = await Promise.all([
        fetchPublicProjects().catch(() => ({ projects: [] as PublicProject[] })),
        fetchEngagementPublicStats().catch(() => ({ stats: null as EngagementPublicStats | null })),
      ]);
      setProjects(asProjectList(proj.projects));
      setStats(eng.stats ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load public data");
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab !== "projects" || !selectedId) return;
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      if (portalMapRef.current?.flyToProject(selectedId)) return;
      if (tries++ < 40) timer = window.setTimeout(attempt, 200);
    };
    attempt();
    return () => window.clearTimeout(timer);
  }, [tab, selectedId]);

  const resetForm = () => {
    setFormTitle("");
    setFormBody("");
    setFormCategory(tab === "suggest" ? "recommendation" : tab === "feedback" ? "general" : "road");
    setFormProjectId("");
    setFormBarangay("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setSubmitError("");
    setSubmitOkId("");
  };

  useEffect(() => {
    if (tab === "report" || tab === "feedback" || tab === "suggest") {
      setSubmitOkId("");
      setSubmitError("");
      setFormCategory(tab === "suggest" ? "recommendation" : tab === "feedback" ? "general" : "road");
    }
  }, [tab]);

  const kindForTab = (t: PortalTab): EngagementKind | null => {
    if (t === "report") return "issue";
    if (t === "feedback") return "feedback";
    if (t === "suggest") return "suggestion";
    return null;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const kind = kindForTab(tab);
    if (!kind) return;
    setSubmitting(true);
    setSubmitError("");
    setSubmitOkId("");
    try {
      const res = await submitEngagement({
        kind,
        title: formTitle,
        body: formBody,
        category: formCategory,
        projectId: formProjectId || null,
        barangay: formBarangay || null,
        lng: projects.find((p) => p.id === formProjectId)?.location.lon ?? null,
        lat: projects.find((p) => p.id === formProjectId)?.location.lat ?? null,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
      });
      setSubmitOkId(res.submission.id);
      setFormTitle("");
      setFormBody("");
      void refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const milestones = selected?.milestones ?? [];
  const issues = selected?.issues ?? [];
  const photos = (selected?.photos ?? []).filter((p) => p.kind !== "site");
  const openIssues = issues.filter((i) => i.open !== false && !i.resolvedAt);

  return (
    <div className="cp-page">
      <header className="cp-top">
        <div className="cp-top-left">
          <button type="button" className="cp-btn" onClick={onBack}>← Home</button>
          <div>
            <h1>Citizen &amp; Stakeholder Portal</h1>
            <p className="cp-sub">Projects, reporting, and transparency — Live Map opens the full map with side panel</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <nav className="cp-tabs" aria-label="Portal sections">
        {(
          [
            ["map", "Live Map"],
            ["projects", "Projects"],
            ["report", "Report issue"],
            ["feedback", "Feedback"],
            ["suggest", "Suggest"],
            ["transparency", "Transparency"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`cp-tab${tab === id ? " active" : ""}`}
            onClick={() => {
              if (id === "map") {
                onOpenLiveMap?.();
                return;
              }
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {loadError && <div className="cp-banner err">{loadError}</div>}

      <div className="cp-body">
        <PortalErrorBoundary label="Portal section">
          {tab === "projects" && (
            <div className="cp-split cp-split--projects">
              <div className="cp-list">
                <h2>Public projects</h2>
                {projects.length === 0 ? (
                  <p className="cp-muted">No projects published yet.</p>
                ) : (
                  projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`cp-proj${selectedId === p.id ? " active" : ""}`}
                      onClick={() => {
                        if (selectedId === p.id) {
                          portalMapRef.current?.flyToProject(p.id);
                        } else {
                          setSelectedId(p.id);
                        }
                      }}
                    >
                      <div className="cp-proj-name">{p.name || "Untitled"}</div>
                      <div className="cp-proj-meta">
                        <span className={`cp-pill ${statusClass(p.status)}`}>{p.status || "—"}</span>
                        <span>{p.barangay || "Luisiana"}</span>
                        <span>{Math.round(Number(p.progress) || 0)}%</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="cp-detail">
                {!selected ? (
                  <p className="cp-muted">Select a project to monitor progress, milestones, and photos.</p>
                ) : (
                  <>
                    <h2>{selected.name}</h2>
                    <div className="cp-proj-meta" style={{ marginBottom: 12 }}>
                      <span className={`cp-pill ${statusClass(selected.status)}`}>{selected.status}</span>
                      <span>{modelLabel(selected.modelType)}</span>
                      {selected.lifecyclePhase && <span>{selected.lifecyclePhase}</span>}
                    </div>
                    {selected.description && <p className="cp-desc">{selected.description}</p>}
                    <div className="cp-progress">
                      <div
                        className="cp-progress-bar"
                        style={{ width: `${Math.min(100, Number(selected.progress) || 0)}%` }}
                      />
                    </div>
                    <div className="cp-muted" style={{ marginBottom: 16 }}>
                      {Math.round(Number(selected.progress) || 0)}% complete
                      {selected.targetEndDate ? ` · target ${selected.targetEndDate}` : ""}
                    </div>

                    <h3>Milestones</h3>
                    {milestones.length === 0 ? (
                      <p className="cp-muted">No milestones listed.</p>
                    ) : (
                      <ul className="cp-ul">
                        {milestones.map((m) => (
                          <li key={m.id}>
                            <strong>{m.title}</strong>
                            <span className="cp-muted">
                              {" "}
                              — {m.status}
                              {m.targetDate ? ` · ${m.targetDate}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <h3>Open issues ({selected.openIssueCount ?? openIssues.length})</h3>
                    {openIssues.length === 0 ? (
                      <p className="cp-muted">No open project issues.</p>
                    ) : (
                      <ul className="cp-ul">
                        {openIssues.map((i) => (
                          <li key={i.id}>
                            <strong>{i.title}</strong>{" "}
                            <span className="cp-muted">({i.kind})</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <h3>Photos</h3>
                    {photos.length === 0 ? (
                      <p className="cp-muted">No progress photos yet.</p>
                    ) : (
                      <div className="cp-photos">
                        {photos.slice(0, 8).map((ph) => (
                          <a
                            key={ph.id}
                            href={ph.url}
                            target="_blank"
                            rel="noreferrer"
                            className="cp-photo"
                          >
                            <img src={ph.url} alt={ph.caption || "Progress photo"} />
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="cp-map-host cp-map-host--projects">
                <CesiumMap
                  ref={portalMapRef}
                  solarHour={14}
                  projects={mapProjects}
                  visible
                  readOnly
                  clusteringEnabled={false}
                  terrainEnabled={false}
                  satellite={false}
                  buildingBlocksVisible
                  onProjectSelect={(id) => setSelectedId(id)}
                />
                <div className="cp-map-hint">
                  {selected
                    ? `${selected.name} · ${selected.barangay || "Luisiana"}`
                    : "Select a project to fly to it"}
                </div>
              </div>
            </div>
          )}

          {(tab === "report" || tab === "feedback" || tab === "suggest") && (
            <div className="cp-form-wrap">
              <div>
                <h2>
                  {tab === "report" && "Report an infrastructure issue"}
                  {tab === "feedback" && "Community feedback"}
                  {tab === "suggest" && "Suggestion / recommendation"}
                </h2>
                <p className="cp-muted">
                  Submissions go to the municipal review queue. Contact details are optional.
                </p>

                {submitOkId && (
                  <div className="cp-banner ok">
                    Received. Reference ID: <strong>{submitOkId}</strong>
                    <button type="button" className="cp-btn" style={{ marginLeft: 12 }} onClick={resetForm}>
                      New submission
                    </button>
                  </div>
                )}
                {submitError && <div className="cp-banner err">{submitError}</div>}

                <form className="cp-form" onSubmit={onSubmit}>
                  <label>
                    Title
                    <input
                      required
                      maxLength={200}
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder={tab === "report" ? "e.g. Broken drainage on Rizal St." : "Short title"}
                    />
                  </label>

                  {tab === "report" && (
                    <label>
                      Category
                      <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                        {ISSUE_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {tab === "feedback" && (
                    <label>
                      Topic
                      <input
                        value={formCategory === "general" ? "" : formCategory}
                        onChange={(e) => setFormCategory(e.target.value || "general")}
                        placeholder="e.g. project updates, transparency"
                      />
                    </label>
                  )}

                  <label>
                    {tab === "suggest" ? "Recommendation" : "Details"}
                    <textarea
                      required
                      rows={5}
                      maxLength={4000}
                      value={formBody}
                      onChange={(e) => setFormBody(e.target.value)}
                    />
                  </label>

                  {(tab === "report" || tab === "suggest") && (
                    <label>
                      Related project (optional)
                      <select value={formProjectId} onChange={(e) => setFormProjectId(e.target.value)}>
                        <option value="">—</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <fieldset className="cp-fieldset">
                    <legend>Contact (optional)</legend>
                    <div className="cp-grid2">
                      <label>
                        Name
                        <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                      </label>
                      <label>
                        Email
                        <input
                          type="email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                        />
                      </label>
                      <label>
                        Phone
                        <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                      </label>
                      <label>
                        Barangay
                        <select value={formBarangay} onChange={(e) => setFormBarangay(e.target.value)}>
                          <option value="">—</option>
                          {BARANGAY_LIST.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </fieldset>

                  <button type="submit" className="cp-btn primary" disabled={submitting}>
                    {submitting ? "Sending…" : "Submit"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {tab === "transparency" && (
            <TransparencyDashboard projects={projects} engagementStats={stats} />
          )}
        </PortalErrorBoundary>
      </div>
    </div>
  );
}
