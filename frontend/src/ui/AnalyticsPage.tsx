import { useMemo } from "react";
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
import type { Project } from "../types";
import { computeInfraAnalytics } from "../lib/infra-analytics";
import { ThemeToggle } from "./ThemeToggle";
import "./AnalyticsPage.css";

type Props = {
  onBack: () => void;
  /** Live projects from the map / backend — no sample or seeded filler data. */
  projects: Project[];
};

const CHART_FALLBACK = [
  "#245C3A",
  "#3D9B5F",
  "#6c8ebf",
  "#d4a017",
  "#2E6B45",
  "#7a9e3e",
  "#9b9b9b",
  "#82b366",
];

export default function AnalyticsPage({ onBack, projects }: Props) {
  const stats = useMemo(() => computeInfraAnalytics(projects), [projects]);

  return (
    <div className="an-page">
      <header className="an-top">
        <div className="an-top-left">
          <button type="button" className="an-btn" onClick={onBack}>
            ← Map
          </button>
          <div>
            <h1>Infrastructure analytics</h1>
            <p className="an-sub">Live from your map projects</p>
          </div>
        </div>
        <ThemeToggle />
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
                      cursor={{ fill: "rgba(36,92,58,0.08)" }}
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
                      cursor={{ fill: "rgba(36,92,58,0.08)" }}
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
                      cursor={{ fill: "rgba(36,92,58,0.08)" }}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="count" name="Projects" fill="#3D9B5F" radius={[0, 3, 3, 0]}>
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
