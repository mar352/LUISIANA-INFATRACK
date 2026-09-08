import type { Project, ProjectStatus } from "../types";
import { BARANGAY_LIST, MODEL_CATALOG } from "../types";

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
  Ongoing: "#ffc107",
  Delayed: "#d4a017",
  Completed: "#151c28",
  Suspended: "#9b9b9b",
};

const DEPT_FILL: Record<string, string> = {
  MPDC: "#151c28",
  Engineering: "#ffc107",
  Agriculture: "#5b6b7c",
  "Treasury Office": "#059669",
  "Negosyo Center": "#059669",
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
  const list = Array.isArray(projects) ? projects : [];
  const total = list.length;
  const statusMap = new Map<ProjectStatus, number>();
  let progressSum = 0;

  for (const p of list) {
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
      list,
      (p) => p.department || "Unknown",
      (k) => DEPT_FILL[k],
    ),
    byType: countBy(list, (p) => modelLabel(p.modelType)),
    ongoing: statusMap.get("Ongoing") || 0,
    completed: statusMap.get("Completed") || 0,
    delayed: statusMap.get("Delayed") || 0,
    planned: statusMap.get("Planned") || 0,
    suspended: statusMap.get("Suspended") || 0,
    avgProgress: total === 0 ? 0 : Math.round((progressSum / total) * 10) / 10,
  };
}

export type BarangayCompareRow = {
  name: string;
  count: number;
  completed: number;
  ongoing: number;
  planned: number;
  delayed: number;
  avgProgress: number;
  budgetTotal: number;
  budgetSpent: number;
};

export type BudgetRollup = {
  total: number;
  spent: number;
  utilPct: number;
  withBudget: number;
  byBarangay: { name: string; total: number; spent: number }[];
  byDepartment: { name: string; total: number; spent: number }[];
};

export type GapNeed = {
  key: string;
  label: string;
  modelTypes: string[];
};

/** Baseline facilities each Luisiana barangay is expected to have for siting. */
export const BASELINE_NEEDS: GapNeed[] = [
  { key: "hall", label: "Barangay Hall", modelTypes: ["barangay_hall", "municipal_hall"] },
  { key: "health", label: "Health facility", modelTypes: ["rhu", "hospital"] },
  { key: "school", label: "School", modelTypes: ["school"] },
  { key: "water", label: "Water facility", modelTypes: ["water_tank"] },
];

export type BarangayGap = {
  barangay: string;
  projectCount: number;
  present: string[];
  missing: string[];
};

export function computeBarangayCompare(projects: Project[]): BarangayCompareRow[] {
  const list = Array.isArray(projects) ? projects : [];
  const map = new Map<string, BarangayCompareRow>();

  const ensure = (name: string): BarangayCompareRow => {
    let row = map.get(name);
    if (!row) {
      row = {
        name,
        count: 0,
        completed: 0,
        ongoing: 0,
        planned: 0,
        delayed: 0,
        avgProgress: 0,
        budgetTotal: 0,
        budgetSpent: 0,
      };
      map.set(name, row);
    }
    return row;
  };

  for (const p of list) {
    const name = (p.barangay || "").trim() || "Unspecified";
    const row = ensure(name);
    row.count += 1;
    if (p.status === "Completed") row.completed += 1;
    else if (p.status === "Ongoing") row.ongoing += 1;
    else if (p.status === "Planned") row.planned += 1;
    else if (p.status === "Delayed") row.delayed += 1;
    row.avgProgress += Number(p.progress) || 0;
    row.budgetTotal += Number(p.budgetTotal) || 0;
    row.budgetSpent += Number(p.budgetSpent) || 0;
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      avgProgress: row.count === 0 ? 0 : Math.round(row.avgProgress / row.count),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function computeBudgetRollup(projects: Project[]): BudgetRollup {
  const list = Array.isArray(projects) ? projects : [];
  let total = 0;
  let spent = 0;
  let withBudget = 0;
  const brgy = new Map<string, { total: number; spent: number }>();
  const dept = new Map<string, { total: number; spent: number }>();

  for (const p of list) {
    const t = Number(p.budgetTotal) || 0;
    const s = Number(p.budgetSpent) || 0;
    if (t > 0) withBudget += 1;
    total += t;
    spent += s;
    const bName = (p.barangay || "").trim() || "Unspecified";
    const dName = p.department || "Unknown";
    const b = brgy.get(bName) ?? { total: 0, spent: 0 };
    b.total += t;
    b.spent += s;
    brgy.set(bName, b);
    const d = dept.get(dName) ?? { total: 0, spent: 0 };
    d.total += t;
    d.spent += s;
    dept.set(dName, d);
  }

  const toList = (m: Map<string, { total: number; spent: number }>) =>
    [...m.entries()]
      .map(([name, v]) => ({ name, total: v.total, spent: v.spent }))
      .filter((r) => r.total > 0 || r.spent > 0)
      .sort((a, b) => b.total - a.total);

  return {
    total,
    spent,
    utilPct: total > 0 ? Math.round((spent / total) * 100) : 0,
    withBudget,
    byBarangay: toList(brgy),
    byDepartment: toList(dept),
  };
}

export function computeInfraGaps(projects: Project[]): BarangayGap[] {
  const list = Array.isArray(projects) ? projects : [];
  const byBrgy = new Map<string, Project[]>();
  for (const p of list) {
    const name = (p.barangay || "").trim();
    if (!name) continue;
    const arr = byBrgy.get(name) ?? [];
    arr.push(p);
    byBrgy.set(name, arr);
  }

  return BARANGAY_LIST.map((barangay) => {
    const items = byBrgy.get(barangay) ?? [];
    const types = new Set(items.map((p) => String(p.modelType || "")));
    const present: string[] = [];
    const missing: string[] = [];
    for (const need of BASELINE_NEEDS) {
      const hit = need.modelTypes.some((t) => types.has(t));
      if (hit) present.push(need.label);
      else missing.push(need.label);
    }
    return {
      barangay,
      projectCount: items.length,
      present,
      missing,
    };
  }).sort((a, b) => b.missing.length - a.missing.length || a.barangay.localeCompare(b.barangay));
}

export function formatPesoCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "₱0";
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `₱${(n / 1_000).toFixed(0)}k`;
  return `₱${Math.round(n).toLocaleString()}`;
}
