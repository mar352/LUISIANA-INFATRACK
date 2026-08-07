import type { Project, ProjectStatus } from "../types";
import { MODEL_CATALOG } from "../types";

export type NamedCount = {
  name: string;
  count: number;
  fill?: string;
};

export type InfraAnalyticsSummary = {
  total: number;
  byStatus: NamedCount[];
  byDepartment: NamedCount[];
  byType: NamedCount[];
  ongoing: number;
  completed: number;
  delayed: number;
  planned: number;
  suspended: number;
  avgProgress: number;
};

const STATUS_ORDER: ProjectStatus[] = [
  "Planned",
  "Ongoing",
  "Delayed",
  "Completed",
  "Suspended",
];

const STATUS_FILL: Record<ProjectStatus, string> = {
  Planned: "#6c8ebf",
  Ongoing: "#3D9B5F",
  Delayed: "#d4a017",
  Completed: "#245C3A",
  Suspended: "#9b9b9b",
};

const DEPT_FILL: Record<string, string> = {
  MPDC: "#245C3A",
  Engineering: "#3D9B5F",
  Agriculture: "#7a9e3e",
  "Negosyo Center": "#2E6B45",
};

function modelLabel(modelType: string): string {
  return MODEL_CATALOG.find((m) => m.type === modelType)?.label || modelType || "Unknown";
}

function countBy(
  projects: Project[],
  keyFn: (p: Project) => string,
  fillFn?: (key: string) => string | undefined,
): NamedCount[] {
  const map = new Map<string, number>();
  for (const p of projects) {
    const key = keyFn(p) || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({
      name,
      count,
      fill: fillFn?.(name),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Aggregate live projects for Infrastructure development analytics (Feature 1). */
export function computeInfraAnalytics(projects: Project[]): InfraAnalyticsSummary {
  const total = projects.length;
  const statusMap = new Map<ProjectStatus, number>();
  let progressSum = 0;

  for (const p of projects) {
    const st = (STATUS_ORDER.includes(p.status) ? p.status : "Planned") as ProjectStatus;
    statusMap.set(st, (statusMap.get(st) || 0) + 1);
    progressSum += Number(p.progress) || 0;
  }

  // Only statuses that exist in the live data — no zero-padded filler rows
  const byStatus: NamedCount[] = STATUS_ORDER.filter((name) => (statusMap.get(name) || 0) > 0).map(
    (name) => ({
      name,
      count: statusMap.get(name) || 0,
      fill: STATUS_FILL[name],
    }),
  );

  return {
    total,
    byStatus,
    byDepartment: countBy(
      projects,
      (p) => p.department || "Unknown",
      (k) => DEPT_FILL[k],
    ),
    byType: countBy(projects, (p) => modelLabel(p.modelType)),
    ongoing: statusMap.get("Ongoing") || 0,
    completed: statusMap.get("Completed") || 0,
    delayed: statusMap.get("Delayed") || 0,
    planned: statusMap.get("Planned") || 0,
    suspended: statusMap.get("Suspended") || 0,
    avgProgress: total === 0 ? 0 : Math.round((progressSum / total) * 10) / 10,
  };
}
