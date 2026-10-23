import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PlanningProposal, Project } from "../types";
import {
  computeBarangayCompare,
  computeBudgetRollup,
  computeInfraAnalytics,
  computeInfraGaps,
  formatPesoCompact,
} from "../lib/infra-analytics";
import { downloadCsv, downloadExcel, reportStamp } from "../lib/report-export";
import {
  buildMunicipalSheets,
  printMapSheet,
  printMunicipalReport,
  projectRows,
} from "../lib/municipal-report";
import { computePlanningInsights } from "../lib/planning-insights";
import {
  CRITICAL_GROUPS,
  criticalTypeLabel,
  listCriticalProjects,
  loadCriticalHazards,
} from "../lib/critical-infra";
import type { CompactHazard } from "../lib/hazard-report";
import { fetchProposalsOnce } from "../services/firestore-planning";
import type { SessionUser } from "../services/auth";
import { ThemeToggle } from "./ThemeToggle";
import SideNavbar from "./SideNavbar";
import MpdcTopNavbar from "./MpdcTopNavbar";
import "./AnalyticsPage.css";

type Props = {
  onBack: () => void;
  /** Live projects from the map / backend — no sample or seeded filler data. */
  projects: Project[];
  captureMapPng?: () => Promise<string | null>;
  onNavigate?: (screen: string) => void;
  session?: SessionUser | null;
  onLogout?: () => void;
};

const CHART_FALLBACK = [
  "#151c28",
  "#0071e3",
  "#d97706",
  "#16a34a",
  "#6366f1",
  "#0284c7",
  "#64748b",
  "#7c3aed",
];

const TOOLTIP_STYLE = {
  backgroundColor: "var(--apple-surface, #ffffff)",
  border: "1px solid var(--apple-border, rgba(0, 0, 0, 0.1))",
  borderRadius: "8px",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
  color: "var(--apple-text, #1d1d1f)",
  fontSize: "12px",
};

export default function AnalyticsPage({
  onBack,
  projects,
  captureMapPng,
  onNavigate,
  session,
  onLogout,
}: Props) {
  const stats = useMemo(() => computeInfraAnalytics(projects), [projects]);
  const barangays = useMemo(() => computeBarangayCompare(projects), [projects]);
  const budget = useMemo(() => computeBudgetRollup(projects), [projects]);
  const gaps = useMemo(() => computeInfraGaps(projects), [projects]);
  const gapWorst = useMemo(() => gaps.filter((g) => g.missing.length > 0), [gaps]);
  const [busy, setBusy] = useState<string | null>(null);
  const [proposals, setProposals] = useState<PlanningProposal[]>([]);
  const [ciGroup, setCiGroup] = useState("all");
  const [ciBarangay, setCiBarangay] = useState("all");
  const [ciHazards, setCiHazards] = useState<Record<string, CompactHazard>>({});
  const [ciHazBusy, setCiHazBusy] = useState(false);
  const stamp = reportStamp();
  const insights = useMemo(() => {
    try {
      return computePlanningInsights(projects, proposals);
    } catch (err) {
      console.warn("[Analytics] insights failed", err);
      return computePlanningInsights([], []);
    }
  }, [projects, proposals]);

  const criticalAll = useMemo(() => listCriticalProjects(projects), [projects]);
  const criticalFiltered = useMemo(() => {
    const group = CRITICAL_GROUPS.find((g) => g.id === ciGroup) ?? CRITICAL_GROUPS[0];
    return criticalAll.filter((p) => {
      if (!group.types.includes(p.modelType as (typeof group.types)[number])) return false;
      if (ciBarangay !== "all" && (p.barangay || "") !== ciBarangay) return false;
      return true;
    });
  }, [criticalAll, ciGroup, ciBarangay]);
  const ciBarangays = useMemo(() => {
    const set = new Set(criticalAll.map((p) => p.barangay).filter(Boolean) as string[]);
    return [...set].sort();
  }, [criticalAll]);
  const ciHigh = useMemo(
    () => Object.values(ciHazards).filter((h) => /avoid|extra geotechnical/i.test(h.advice)).length,
    [ciHazards],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    if (criticalAll.length === 0) {
      setCiHazards({});
      return;
    }
    setCiHazBusy(true);
    void loadCriticalHazards(criticalAll, ctrl.signal)
      .then((map) => {
        if (!ctrl.signal.aborted) setCiHazards(map);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCiHazBusy(false);
      });
    return () => ctrl.abort();
  }, [criticalAll]);

  useEffect(() => {
    let cancelled = false;
    void fetchProposalsOnce()
      .then((list) => {
        if (!cancelled) setProposals(list);
      })
      .catch(() => {
        if (!cancelled) setProposals([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function exportProjectsCsv() {
    const sheet = projectRows(projects);
    downloadCsv(`infatrack-projects-${stamp}.csv`, sheet.headers, sheet.rows);
  }

  function exportBarangayCsv() {
    downloadCsv(
      `infatrack-barangay-${stamp}.csv`,
      ["Barangay", "Projects", "Completed", "Ongoing", "Planned", "Delayed", "Avg %", "Budget total", "Budget spent"],
      barangays.map((b) => [
        b.name,
        b.count,
        b.completed,
        b.ongoing,
        b.planned,
        b.delayed,
        b.avgProgress,
        b.budgetTotal,
        b.budgetSpent,
      ]),
    );
  }

  function exportBudgetCsv() {
    downloadCsv(
      `infatrack-budget-${stamp}.csv`,
      ["Group", "Name", "Programmed", "Spent"],
      [
        ...budget.byDepartment.map((r) => ["Office", r.name, r.total, r.spent]),
        ...budget.byBarangay.map((r) => ["Barangay", r.name, r.total, r.spent]),
      ],
    );
  }

  function exportExcel() {
    downloadExcel(`infatrack-municipal-${stamp}.xls`, buildMunicipalSheets(projects));
  }

  async function withMap(kind: "pdf" | "map") {
    setBusy(kind);
    try {
      const png = captureMapPng ? await captureMapPng() : null;
      if (kind === "pdf") printMunicipalReport(projects, png);
      else printMapSheet({ mapPng: png, projects });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="an-page">
      <MpdcTopNavbar
        title="Infrastructure Telemetry & Analytics"
        subtitle="Real-time telemetry, municipal budget tracking & hazard exposure"
        brandPill="MPDC"
        accentClass="topnav-accent-mpdc"
        onBack={onBack}
        backLabel="Bumalik"
        serviceTag="Executive GIS Telemetry"
        serviceSla="23 Barangays · Multi-Spectral Siting"
        session={session}
        userDept="GIS & Urban Planning"
        onLogout={onLogout}
        extraControls={
          <div className="an-export">
            <button
              type="button"
              className="an-btn"
              onClick={exportProjectsCsv}
              disabled={!stats.total}
              title="Export projects to CSV"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              CSV · Projects
            </button>
            <button
              type="button"
              className="an-btn"
              onClick={exportBarangayCsv}
              disabled={!stats.total}
              title="Export barangay summary to CSV"
            >
              CSV · Barangay
            </button>
            <button
              type="button"
              className="an-btn"
              onClick={exportBudgetCsv}
              disabled={!stats.total}
              title="Export budget summary to CSV"
            >
              CSV · Budget
            </button>
            <button
              type="button"
              className="an-btn"
              onClick={exportExcel}
              disabled={!stats.total}
              title="Export municipal Excel workbook"
            >
              Excel (.xls)
            </button>
            <button
              type="button"
              className="an-btn an-btn-primary"
              onClick={() => void withMap("pdf")}
              disabled={busy != null}
              title="Generate official municipal PDF report"
            >
              {busy === "pdf" ? "Preparing…" : "Municipal PDF"}
            </button>
            <button
              type="button"
              className="an-btn"
              onClick={() => void withMap("map")}
              disabled={busy != null}
              title="Print current map viewport with legend"
            >
              {busy === "map" ? "Capturing…" : "Print Map"}
            </button>
          </div>
        }
      />

      <div className="app-page-body-with-side-nav">
        <SideNavbar currentScreen="analytics" onNavigate={onNavigate} currentRole={session?.role || "MPDC"} />
        <div className="app-page-main-with-side-nav">
          <div className="an-body">
        <div className="an-container">
          <section className="an-kpis" aria-label="Key indicators">
            <div className="an-kpi">
              <div className="an-kpi-head">
                <span className="an-kpi-label">Total Projects</span>
              </div>
              <div className="an-kpi-value">{stats.total}</div>
              <span className="an-kpi-sub">On Luisiana 3D map</span>
            </div>
            <div className="an-kpi">
              <div className="an-kpi-head">
                <span className="an-kpi-label">Ongoing</span>
              </div>
              <div className="an-kpi-value accent">{stats.ongoing}</div>
              <span className="an-kpi-sub">Active in flight</span>
            </div>
            <div className="an-kpi">
              <div className="an-kpi-head">
                <span className="an-kpi-label">Completed</span>
              </div>
              <div className="an-kpi-value safe">{stats.completed}</div>
              <span className="an-kpi-sub">Finished / turned over</span>
            </div>
            <div className="an-kpi">
              <div className="an-kpi-head">
                <span className="an-kpi-label">Delayed</span>
              </div>
              <div className="an-kpi-value warn">{stats.delayed}</div>
              <span className="an-kpi-sub">Flagged or past target</span>
            </div>
            <div className="an-kpi">
              <div className="an-kpi-head">
                <span className="an-kpi-label">Avg Progress</span>
              </div>
              <div className="an-kpi-value">{stats.avgProgress}%</div>
              <span className="an-kpi-sub">Across all projects</span>
            </div>
            <div className="an-kpi">
              <div className="an-kpi-head">
                <span className="an-kpi-label">Programmed</span>
              </div>
              <div className="an-kpi-value">{formatPesoCompact(budget.total)}</div>
              <span className="an-kpi-sub">Allocated budget</span>
            </div>
            <div className="an-kpi">
              <div className="an-kpi-head">
                <span className="an-kpi-label">Utilized</span>
              </div>
              <div className={`an-kpi-value${budget.utilPct > 90 ? " warn" : ""}`}>{budget.utilPct}%</div>
              <span className="an-kpi-sub">Expenditure rate</span>
            </div>
          </section>

          {stats.total === 0 ? (
            <div className="an-empty-container">
              <div className="an-empty-icon-wrap">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <h3 className="an-empty-title">No Infrastructure Projects on Map</h3>
              <p className="an-empty-desc">
                When infrastructure projects or private building applications are pinned to the Luisiana GIS globe, their completion metrics, budget utilization, hazard exposure, and gap analytics will appear here in real time.
              </p>
              <button type="button" className="an-btn an-btn-primary" onClick={onBack}>
                ← Return to 3D Map
              </button>
            </div>
          ) : (
            <>
              <section className="an-insights" aria-label="Planning insights and recommendations">
                <article className="an-card">
                  <div className="an-card-header">
                    <div>
                      <h2>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        Predictive Planning Outlook
                      </h2>
                      <p className="an-card-hint">
                        Linear completion estimate from live progress and target milestone dates.
                      </p>
                    </div>
                  </div>
                  <div className="an-insight-kpis">
                    <div className="an-insight-metric">
                      <b>{insights.outlook.gapsNow}</b>
                      <span>Baseline Gaps</span>
                    </div>
                    <div className="an-insight-metric">
                      <b>{insights.outlook.gapsUncovered}</b>
                      <span>Uncovered Gaps</span>
                    </div>
                    <div className="an-insight-metric">
                      <b>{insights.outlook.monthsToClearOngoing ?? "—"}</b>
                      <span>Months Horizon</span>
                    </div>
                    <div className="an-insight-metric">
                      <b>{insights.outlook.delayed}</b>
                      <span>Delayed / Alert</span>
                    </div>
                  </div>
                  <p className="an-insight-note">{insights.outlook.note}</p>
                  {insights.flags.length > 0 && (
                    <ul className="an-insight-flags">
                      {insights.flags.map((f) => (
                        <li key={f.title} className={f.tone === "warn" ? "is-warn" : ""}>
                          <strong>{f.title}:</strong> {f.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>

                <article className="an-card">
                  <div className="an-card-header">
                    <div>
                      <h2>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        Data-Driven Recommendations
                      </h2>
                      <p className="an-card-hint">
                        Ranked municipal builds inferred from barangay facility gap matrix.
                      </p>
                    </div>
                  </div>
                  {insights.nextBuilds.length === 0 ? (
                    <p className="an-card-hint">No uncovered baseline gaps from current map infrastructure tags.</p>
                  ) : (
                    <ol className="an-rec-list">
                      {insights.nextBuilds.slice(0, 5).map((r) => (
                        <li key={`${r.barangay}-${r.facility}`}>
                          <div className="an-rec-head">
                            <span>
                              Build <strong>{r.facility}</strong> in <strong>{r.barangay}</strong>
                            </span>
                            <span className="an-rec-score">{r.needScore} pts</span>
                          </div>
                          <div className="an-rec-why">{r.reasons.slice(0, 3).join(" · ")}</div>
                          {r.matchingProposalTitle && (
                            <div className="an-rec-link">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                              </svg>
                              Matches request: {r.matchingProposalTitle}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                  {insights.proposalRanks.length > 0 && (
                    <>
                      <h3 className="an-rec-sub">Planning Requests to Prioritize</h3>
                      <ol className="an-rec-list an-rec-list-compact">
                        {insights.proposalRanks.slice(0, 4).map((p) => (
                          <li key={p.id}>
                            <div className="an-rec-head">
                              <span>
                                {p.title}
                                {p.barangay ? ` · ${p.barangay}` : ""}
                              </span>
                              <span className="an-rec-score">{p.score}</span>
                            </div>
                            <div className="an-rec-why">{p.reasons.slice(0, 2).join(" · ")}</div>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </article>
              </section>

              <section className="an-insights" aria-label="Critical infrastructure identification">
                <article className="an-card an-card-wide">
                  <div className="an-card-header">
                    <div>
                      <h2>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        Critical Infrastructure Identification & Hazard Siting
                      </h2>
                      <p className="an-card-hint">
                        Civic halls, health facilities, schools, water utilities, and evacuation centers tagged on the globe with live MGB flood/landslide exposure.
                      </p>
                    </div>
                  </div>
                  <div className="an-ci-filters">
                    <label>
                      Type
                      <select value={ciGroup} onChange={(e) => setCiGroup(e.target.value)}>
                        {CRITICAL_GROUPS.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Barangay
                      <select value={ciBarangay} onChange={(e) => setCiBarangay(e.target.value)}>
                        <option value="all">All barangays</option>
                        {ciBarangays.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="an-ci-kpis">
                      <span className="an-ci-kpi-chip">
                        <b>{criticalFiltered.length}</b> listed
                      </span>
                      <span className="an-ci-kpi-chip">
                        <b style={{ color: ciHigh > 0 ? "var(--apple-danger)" : "inherit" }}>{ciHigh}</b> need review
                      </span>
                      {ciHazBusy && <span className="an-ci-kpi-chip">Checking hazards…</span>}
                    </div>
                  </div>
                  {criticalFiltered.length === 0 ? (
                    <p className="an-card-hint">
                      No critical facilities match this filter. Tag municipal hall, RHU, school, water tank, or evacuation models on the 3D globe.
                    </p>
                  ) : (
                    <div className="an-table-wrap">
                      <table className="an-table">
                        <thead>
                          <tr>
                            <th>Facility</th>
                            <th>Type</th>
                            <th>Barangay</th>
                            <th>Coordinates</th>
                            <th>Status</th>
                            <th>Flood</th>
                            <th>Landslide</th>
                            <th>Shaking</th>
                            <th>Siting Advice</th>
                          </tr>
                        </thead>
                        <tbody>
                          {criticalFiltered.map((p) => {
                            const h = ciHazards[p.id];
                            const statusChipClass =
                              p.status === "Completed"
                                ? "an-chip-safe"
                                : p.status === "Delayed"
                                ? "an-chip-danger"
                                : p.status === "Ongoing"
                                ? "an-chip-warn"
                                : "an-chip-neutral";
                            const floodClass = /high|critical/i.test(h?.flood || "")
                              ? "an-chip-danger"
                              : /moderate|medium/i.test(h?.flood || "")
                              ? "an-chip-warn"
                              : /low|safe|none/i.test(h?.flood || "")
                              ? "an-chip-safe"
                              : "an-chip-neutral";
                            const landClass = /high|critical/i.test(h?.landslide || "")
                              ? "an-chip-danger"
                              : /moderate|medium/i.test(h?.landslide || "")
                              ? "an-chip-warn"
                              : /low|safe|none/i.test(h?.landslide || "")
                              ? "an-chip-safe"
                              : "an-chip-neutral";
                            return (
                              <tr key={p.id}>
                                <td>
                                  <strong>{p.name}</strong>
                                </td>
                                <td>{criticalTypeLabel(p.modelType)}</td>
                                <td>{p.barangay || "—"}</td>
                                <td className="an-coords">
                                  {formatLonLat(p.location.lat, p.location.lon) || "—"}
                                </td>
                                <td>
                                  <span className={`an-chip ${statusChipClass}`}>{p.status}</span>
                                </td>
                                <td>
                                  <span className={`an-chip ${floodClass}`}>
                                    {h?.flood ?? (ciHazBusy ? "…" : "—")}
                                  </span>
                                </td>
                                <td>
                                  <span className={`an-chip ${landClass}`}>
                                    {h?.landslide ?? (ciHazBusy ? "…" : "—")}
                                  </span>
                                </td>
                                <td>
                                  <span className="an-chip an-chip-neutral">
                                    {h?.shaking ?? (ciHazBusy ? "…" : "—")}
                                  </span>
                                </td>
                                <td className={h && /avoid/i.test(h.advice) ? "an-gap" : ""}>
                                  {h?.advice ?? (ciHazBusy ? "Checking…" : "—")}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              </section>

              <div className="an-charts">
                <article className="an-card">
                  <h2>Projects by Status</h2>
                  <p className="an-card-hint">Active and completed status distribution</p>
                  <div className="an-chart-wrap">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={stats.byStatus} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--apple-text-secondary, #6e6e73)" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--apple-text-secondary, #6e6e73)" }} width={36} />
                        <Tooltip cursor={{ fill: "rgba(0, 113, 227, 0.05)" }} contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="count" name="Projects" radius={[4, 4, 0, 0]}>
                          {stats.byStatus.map((row) => (
                            <Cell key={row.name} fill={row.fill || CHART_FALLBACK[0]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="an-card">
                  <h2>Projects by Implementing Office</h2>
                  <p className="an-card-hint">Departmental workload across municipal offices</p>
                  <div className="an-chart-wrap">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={stats.byDepartment} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--apple-text-secondary, #6e6e73)" }} />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "var(--apple-text-secondary, #6e6e73)" }} />
                        <Tooltip cursor={{ fill: "rgba(0, 113, 227, 0.05)" }} contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="count" name="Projects" radius={[0, 4, 4, 0]}>
                          {stats.byDepartment.map((row, i) => (
                            <Cell key={row.name} fill={row.fill || CHART_FALLBACK[i % CHART_FALLBACK.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="an-card an-card-wide">
                  <h2>Barangay Project Comparison</h2>
                  <p className="an-card-hint">Spatial allocation of ongoing and completed builds by barangay</p>
                  <div className="an-chart-wrap an-chart-tall">
                    <ResponsiveContainer width="100%" height={Math.max(280, barangays.length * 28)}>
                      <BarChart data={barangays} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--apple-text-secondary, #6e6e73)" }} />
                        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fill: "var(--apple-text-secondary, #6e6e73)" }} />
                        <Tooltip
                          cursor={{ fill: "rgba(0, 113, 227, 0.05)" }}
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number, name: string) => [value, name]}
                        />
                        <Bar dataKey="completed" name="Completed" stackId="a" fill="#16a34a" />
                        <Bar dataKey="ongoing" name="Ongoing" stackId="a" fill="#d97706" />
                        <Bar dataKey="planned" name="Planned" stackId="a" fill="#0071e3" />
                        <Bar dataKey="delayed" name="Delayed" stackId="a" fill="#dc2626" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="an-card">
                  <h2>Programmed Budget by Office</h2>
                  <p className="an-card-hint">
                    {budget.withBudget} project{budget.withBudget === 1 ? "" : "s"} with budget · spent{" "}
                    {formatPesoCompact(budget.spent)} of {formatPesoCompact(budget.total)}
                  </p>
                  <div className="an-chart-wrap">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={budget.byDepartment} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--apple-text-secondary, #6e6e73)" }} tickFormatter={(v) => formatPesoCompact(Number(v))} />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "var(--apple-text-secondary, #6e6e73)" }} />
                        <Tooltip
                          cursor={{ fill: "rgba(0, 113, 227, 0.05)" }}
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number) => formatPesoCompact(Number(value))}
                        />
                        <Bar dataKey="total" name="Programmed" fill="#0071e3" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="spent" name="Spent" fill="#151c28" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="an-card">
                  <h2>Programmed Budget by Barangay</h2>
                  <p className="an-card-hint">Where municipal development funds are committed</p>
                  <div className="an-chart-wrap an-chart-tall">
                    <ResponsiveContainer width="100%" height={Math.max(260, budget.byBarangay.length * 28)}>
                      <BarChart data={budget.byBarangay} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--apple-text-secondary, #6e6e73)" }} tickFormatter={(v) => formatPesoCompact(Number(v))} />
                        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: "var(--apple-text-secondary, #6e6e73)" }} />
                        <Tooltip
                          cursor={{ fill: "rgba(0, 113, 227, 0.05)" }}
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number) => formatPesoCompact(Number(value))}
                        />
                        <Bar dataKey="total" name="Programmed" fill="#d97706" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="an-card an-card-wide">
                  <h2>Infrastructure Gap Analysis</h2>
                  <p className="an-card-hint">
                    Baseline civic requirements for each Luisiana barangay: Barangay Hall, health facility, school, and water system.
                  </p>
                  {gapWorst.length === 0 ? (
                    <p className="an-card-hint">Every tagged barangay meets the baseline facility requirements.</p>
                  ) : (
                    <div className="an-table-wrap">
                      <table className="an-table">
                        <thead>
                          <tr>
                            <th>Barangay</th>
                            <th>Projects</th>
                            <th>Present Facilities</th>
                            <th>Missing Baseline</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gaps.map((g) => (
                            <tr key={g.barangay}>
                              <td>
                                <strong>{g.barangay}</strong>
                              </td>
                              <td className="an-num">{g.projectCount}</td>
                              <td>{g.present.length ? g.present.join(", ") : "—"}</td>
                              <td className={g.missing.length ? "an-gap" : ""}>
                                {g.missing.length ? g.missing.join(", ") : "None"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>

                <article className="an-card an-card-wide">
                  <h2>Projects by Infrastructure Type</h2>
                  <p className="an-card-hint">Classification across cataloged 3D facility models</p>
                  <div className="an-chart-wrap an-chart-tall">
                    <ResponsiveContainer width="100%" height={Math.max(280, stats.byType.length * 36)}>
                      <BarChart data={stats.byType} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--apple-text-secondary, #6e6e73)" }} />
                        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: "var(--apple-text-secondary, #6e6e73)" }} />
                        <Tooltip cursor={{ fill: "rgba(0, 113, 227, 0.05)" }} contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="count" name="Projects" fill="#0071e3" radius={[0, 4, 4, 0]}>
                          {stats.byType.map((row, i) => (
                            <Cell key={row.name} fill={CHART_FALLBACK[i % CHART_FALLBACK.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
