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
import { formatLonLat } from "../lib/coords";
import { ThemeToggle } from "./ThemeToggle";
import "./AnalyticsPage.css";

type Props = {
  onBack: () => void;
  /** Live projects from the map / backend — no sample or seeded filler data. */
  projects: Project[];
  captureMapPng?: () => Promise<string | null>;
};

const CHART_FALLBACK = [
  "#151c28",
  "#ffc107",
  "#6c8ebf",
  "#d4a017",
  "#5b6b7c",
  "#c9a227",
  "#9b9b9b",
  "#8a9bb5",
];

export default function AnalyticsPage({ onBack, projects, captureMapPng }: Props) {
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
      <header className="an-top">
        <div className="an-top-left">
          <button type="button" className="an-btn" onClick={onBack}>
            ← Map
          </button>
          <div>
            <h1>Infrastructure analytics</h1>
            <p className="an-sub">Live from your map projects · export CSV, Excel, or PDF</p>
          </div>
        </div>
        <div className="an-export">
          <button type="button" className="an-btn" onClick={exportProjectsCsv} disabled={!stats.total}>
            CSV · projects
          </button>
          <button type="button" className="an-btn" onClick={exportBarangayCsv} disabled={!stats.total}>
            CSV · barangay
          </button>
          <button type="button" className="an-btn" onClick={exportBudgetCsv} disabled={!stats.total}>
            CSV · budget
          </button>
          <button type="button" className="an-btn" onClick={exportExcel} disabled={!stats.total}>
            Excel
          </button>
          <button type="button" className="an-btn an-btn-primary" onClick={() => void withMap("pdf")} disabled={busy != null}>
            {busy === "pdf" ? "Preparing…" : "Municipal PDF"}
          </button>
          <button type="button" className="an-btn" onClick={() => void withMap("map")} disabled={busy != null}>
            {busy === "map" ? "Capturing…" : "Print map"}
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="an-body">
        <section className="an-kpis" aria-label="Key indicators">
          <div className="an-kpi">
            <div className="an-kpi-label">Total projects</div>
            <div className="an-kpi-value">{stats.total}</div>
          </div>
          <div className="an-kpi">
            <div className="an-kpi-label">Ongoing</div>
            <div className="an-kpi-value accent">{stats.ongoing}</div>
          </div>
          <div className="an-kpi">
            <div className="an-kpi-label">Completed</div>
            <div className="an-kpi-value safe">{stats.completed}</div>
          </div>
          <div className="an-kpi">
            <div className="an-kpi-label">Delayed</div>
            <div className="an-kpi-value warn">{stats.delayed}</div>
          </div>
          <div className="an-kpi">
            <div className="an-kpi-label">Avg progress</div>
            <div className="an-kpi-value">{stats.avgProgress}%</div>
          </div>
          <div className="an-kpi">
            <div className="an-kpi-label">Budget programmed</div>
            <div className="an-kpi-value">{formatPesoCompact(budget.total)}</div>
          </div>
          <div className="an-kpi">
            <div className="an-kpi-label">Budget utilized</div>
            <div className={`an-kpi-value${budget.utilPct > 90 ? " warn" : ""}`}>{budget.utilPct}%</div>
          </div>
        </section>

        <section className="an-insights" aria-label="Planning insights and recommendations">
          <article className="an-card">
            <h2>Predictive planning outlook</h2>
            <p className="an-card-hint">
              Linear finish estimate from live progress and target dates — not a black-box forecast.
            </p>
            <div className="an-insight-kpis">
              <div>
                <b>{insights.outlook.gapsNow}</b>
                <span>Baseline gaps now</span>
              </div>
              <div>
                <b>{insights.outlook.gapsUncovered}</b>
                <span>No project in flight</span>
              </div>
              <div>
                <b>{insights.outlook.monthsToClearOngoing ?? "—"}</b>
                <span>Months to clear ongoing</span>
              </div>
              <div>
                <b>{insights.outlook.delayed}</b>
                <span>Delayed / suspended</span>
              </div>
            </div>
            <p className="an-insight-note">{insights.outlook.note}</p>
            {insights.flags.length > 0 && (
              <ul className="an-insight-flags">
                {insights.flags.map((f) => (
                  <li key={f.title} className={f.tone === "warn" ? "is-warn" : ""}>
                    <strong>{f.title}.</strong> {f.detail}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="an-card">
            <h2>Data-driven recommendations</h2>
            <p className="an-card-hint">
              Ranked next builds from barangay gaps. Planning requests that match a gap are called out.
            </p>
            {insights.nextBuilds.length === 0 ? (
              <p className="an-card-hint">No uncovered baseline gaps from current map tags.</p>
            ) : (
              <ol className="an-rec-list">
                {insights.nextBuilds.slice(0, 6).map((r) => (
                  <li key={`${r.barangay}-${r.facility}`}>
                    <div className="an-rec-head">
                      <span>
                        Build <b>{r.facility}</b> in <b>{r.barangay}</b>
                      </span>
                      <span className="an-rec-score">{r.needScore}</span>
                    </div>
                    <div className="an-rec-why">{r.reasons.slice(0, 3).join(" · ")}</div>
                    {r.matchingProposalTitle && (
                      <div className="an-rec-link">Matches request: {r.matchingProposalTitle}</div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {insights.proposalRanks.length > 0 && (
              <>
                <h3 className="an-rec-sub">Planning requests to prioritize</h3>
                <ol className="an-rec-list an-rec-list-compact">
                  {insights.proposalRanks.slice(0, 5).map((p) => (
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
            <h2>Critical infrastructure identification</h2>
            <p className="an-card-hint">
              Halls, health facilities, schools, water, and evacuation centers tagged on the map.
              Hazard classes are live MGB flood / landslide plus PHIVOLCS 2014 sheets — Luisiana only.
            </p>
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
                <span>
                  <b>{criticalFiltered.length}</b> listed
                </span>
                <span>
                  <b>{ciHigh}</b> need extra review / avoid
                </span>
                {ciHazBusy && <span>Checking hazards…</span>}
              </div>
            </div>
            {criticalFiltered.length === 0 ? (
              <p className="an-card-hint">
                No critical facilities match this filter. Place hall, RHU, school, water tank, or
                evacuation models on the globe.
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
                      <th>Siting advice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criticalFiltered.map((p) => {
                      const h = ciHazards[p.id];
                      return (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>{criticalTypeLabel(p.modelType)}</td>
                          <td>{p.barangay || "—"}</td>
                          <td className="an-coords">
                            {formatLonLat(p.location.lat, p.location.lon) || "—"}
                          </td>
                          <td>{p.status}</td>
                          <td>{h?.flood ?? (ciHazBusy ? "…" : "—")}</td>
                          <td>{h?.landslide ?? (ciHazBusy ? "…" : "—")}</td>
                          <td>{h?.shaking ?? (ciHazBusy ? "…" : "—")}</td>
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

        {stats.total === 0 ? (
          <div className="an-empty">No projects on the map yet — add projects to see analytics.</div>
        ) : (
          <div className="an-charts">
            <article className="an-card">
              <h2>By status</h2>
              <p className="an-card-hint">Only statuses present in current projects</p>
              <div className="an-chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats.byStatus} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.25)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                    <Tooltip
                      cursor={{ fill: "rgba(21,28,40,0.08)" }}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="count" name="Projects" radius={[3, 3, 0, 0]}>
                      {stats.byStatus.map((row) => (
                        <Cell key={row.name} fill={row.fill || CHART_FALLBACK[0]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="an-card">
              <h2>By department</h2>
              <p className="an-card-hint">Which office owns the most projects</p>
              <div className="an-chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={stats.byDepartment}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.25)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: "rgba(21,28,40,0.08)" }}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="count" name="Projects" radius={[0, 3, 3, 0]}>
                      {stats.byDepartment.map((row, i) => (
                        <Cell
                          key={row.name}
                          fill={row.fill || CHART_FALLBACK[i % CHART_FALLBACK.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="an-card an-card-wide">
              <h2>Barangay comparison</h2>
              <p className="an-card-hint">Projects and completion by barangay (live map data)</p>
              <div className="an-chart-wrap an-chart-tall">
                <ResponsiveContainer width="100%" height={Math.max(280, barangays.length * 28)}>
                  <BarChart
                    data={barangays}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.25)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
                    <Tooltip
                      cursor={{ fill: "rgba(21,28,40,0.08)" }}
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value: number, name: string) => [value, name]}
                    />
                    <Bar dataKey="completed" name="Completed" stackId="a" fill="#151c28" />
                    <Bar dataKey="ongoing" name="Ongoing" stackId="a" fill="#ffc107" />
                    <Bar dataKey="planned" name="Planned" stackId="a" fill="#6c8ebf" />
                    <Bar dataKey="delayed" name="Delayed" stackId="a" fill="#d4a017" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="an-card">
              <h2>Budget by office</h2>
              <p className="an-card-hint">
                {budget.withBudget} project{budget.withBudget === 1 ? "" : "s"} with a budget · spent{" "}
                {formatPesoCompact(budget.spent)} of {formatPesoCompact(budget.total)}
              </p>
              <div className="an-chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={budget.byDepartment}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.25)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatPesoCompact(Number(v))} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: "rgba(21,28,40,0.08)" }}
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value: number) => formatPesoCompact(Number(value))}
                    />
                    <Bar dataKey="total" name="Programmed" fill="#6c8ebf" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="spent" name="Spent" fill="#151c28" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="an-card">
              <h2>Budget by barangay</h2>
              <p className="an-card-hint">Where programmed funds sit</p>
              <div className="an-chart-wrap an-chart-tall">
                <ResponsiveContainer width="100%" height={Math.max(260, budget.byBarangay.length * 28)}>
                  <BarChart
                    data={budget.byBarangay}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.25)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatPesoCompact(Number(v))} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                    <Tooltip
                      cursor={{ fill: "rgba(21,28,40,0.08)" }}
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value: number) => formatPesoCompact(Number(value))}
                    />
                    <Bar dataKey="total" name="Programmed" fill="#ffc107" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="an-card an-card-wide">
              <h2>Infrastructure gap analysis</h2>
              <p className="an-card-hint">
                Baseline for each barangay: Barangay Hall, health facility, school, water facility.
                Missing = none of those types on the map yet.
              </p>
              {gapWorst.length === 0 ? (
                <p className="an-card-hint">Every listed barangay has the baseline types, or no projects are tagged.</p>
              ) : (
                <div className="an-table-wrap">
                  <table className="an-table">
                    <thead>
                      <tr>
                        <th>Barangay</th>
                        <th>Projects</th>
                        <th>Present</th>
                        <th>Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gaps.map((g) => (
                        <tr key={g.barangay}>
                          <td>{g.barangay}</td>
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
              <h2>By infrastructure type</h2>
              <p className="an-card-hint">Model / facility types on the map</p>
              <div className="an-chart-wrap an-chart-tall">
                <ResponsiveContainer width="100%" height={Math.max(280, stats.byType.length * 36)}>
                  <BarChart
                    data={stats.byType}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.25)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: "rgba(21,28,40,0.08)" }}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="count" name="Projects" fill="#ffc107" radius={[0, 3, 3, 0]}>
                      {stats.byType.map((row, i) => (
                        <Cell
                          key={row.name}
                          fill={CHART_FALLBACK[i % CHART_FALLBACK.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>
        )}
      </div>
    </div>
  );
}
