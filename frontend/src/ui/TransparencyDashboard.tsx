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
import type { EngagementPublicStats, PublicProject } from "../types";
import { computeInfraAnalytics } from "../lib/infra-analytics";
import { publicProjectAsMapProject } from "../lib/api";
import "./TransparencyDashboard.css";

type Props = {
  projects: PublicProject[];
  engagementStats: EngagementPublicStats | null;
};

const CHART_FALLBACK = ["#245C3A", "#3D9B5F", "#6c8ebf", "#d4a017", "#2E6B45", "#9b9b9b"];

export default function TransparencyDashboard({ projects, engagementStats }: Props) {
  const mapProjects = useMemo(() => projects.map(publicProjectAsMapProject), [projects]);
  const stats = useMemo(() => computeInfraAnalytics(mapProjects), [mapProjects]);

  const byBarangay = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projects) {
      const key = p.barangay?.trim() || "Unspecified";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [projects]);

  const byLifecycle = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projects) {
      const key = p.lifecyclePhase || "Unspecified";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [projects]);

  const engageBars = useMemo(() => {
    if (!engagementStats) return [];
    const byKind = engagementStats.byKind || { feedback: 0, issue: 0, suggestion: 0 };
    return [
      { name: "Open reports", count: engagementStats.open ?? 0, fill: "#d4a017" },
      { name: "Resolved / closed", count: engagementStats.closed ?? 0, fill: "#245C3A" },
      { name: "Feedback", count: byKind.feedback ?? 0, fill: "#3D9B5F" },
      { name: "Issues", count: byKind.issue ?? 0, fill: "#6c8ebf" },
      { name: "Suggestions", count: byKind.suggestion ?? 0, fill: "#2E6B45" },
    ];
  }, [engagementStats]);

  return (
    <div className="td-root">
      <section className="td-kpis" aria-label="Transparency indicators">
        <div className="td-kpi">
          <div className="td-kpi-label">Public projects</div>
          <div className="td-kpi-value">{stats.total}</div>
        </div>
        <div className="td-kpi">
          <div className="td-kpi-label">Ongoing</div>
          <div className="td-kpi-value accent">{stats.ongoing}</div>
        </div>
        <div className="td-kpi">
          <div className="td-kpi-label">Completed</div>
          <div className="td-kpi-value safe">{stats.completed}</div>
        </div>
        <div className="td-kpi">
          <div className="td-kpi-label">Avg progress</div>
          <div className="td-kpi-value">{stats.avgProgress}%</div>
        </div>
        <div className="td-kpi">
          <div className="td-kpi-label">Citizen reports (open)</div>
          <div className="td-kpi-value warn">{engagementStats?.open ?? "—"}</div>
        </div>
      </section>

      {stats.total === 0 ? (
        <div className="td-empty">No public projects published yet.</div>
      ) : (
        <div className="td-charts">
          <article className="td-card">
            <h3>Projects by status</h3>
            <div className="td-chart">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.byStatus}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {stats.byStatus.map((row, i) => (
                      <Cell key={row.name} fill={row.fill || CHART_FALLBACK[i % CHART_FALLBACK.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="td-card">
            <h3>Lifecycle phase</h3>
            <div className="td-chart">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byLifecycle}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3D9B5F" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="td-card">
            <h3>By barangay</h3>
            <div className="td-chart">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byBarangay} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#245C3A" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="td-card">
            <h3>Community engagement</h3>
            {engageBars.every((b) => b.count === 0) ? (
              <p className="td-muted">No citizen submissions yet.</p>
            ) : (
              <div className="td-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={engageBars}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                      {engageBars.map((row) => (
                        <Cell key={row.name} fill={row.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>
        </div>
      )}
    </div>
  );
}
