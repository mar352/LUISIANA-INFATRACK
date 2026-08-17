import type { ModelType, Project, ProjectStatus } from "../types";
import { MODEL_CATALOG } from "../types";

export type InfraCategory = "Building" | "Infrastructure" | "Agriculture" | "Construction";

export type InfraFilter = {
  query: string;
  statuses: ProjectStatus[];
  categories: InfraCategory[];
  department: "" | Project["department"];
  barangay: string;
  clustering: boolean;
};

export const INFRA_STATUSES: ProjectStatus[] = [
  "Planned",
  "Ongoing",
  "Delayed",
  "Completed",
  "Suspended",
];

export const INFRA_CATEGORIES: InfraCategory[] = [
  "Building",
  "Infrastructure",
  "Agriculture",
  "Construction",
];

export const INFRA_DEPARTMENTS: Project["department"][] = [
  "MPDC",
  "Engineering",
  "Agriculture",
  "Negosyo Center",
];

export const DEFAULT_INFRA_FILTER: InfraFilter = {
  query: "",
  statuses: [...INFRA_STATUSES],
  categories: [...INFRA_CATEGORIES],
  department: "",
  barangay: "",
  clustering: true,
};

export function categoryForModel(type: ModelType | undefined): InfraCategory {
  return MODEL_CATALOG.find((m) => m.type === type)?.category ?? "Building";
}

export function filterInfrastructure(projects: Project[], f: InfraFilter): Project[] {
  const q = f.query.trim().toLowerCase();
  return projects.filter((p) => {
    if (f.statuses.length > 0 && !f.statuses.includes(p.status)) return false;
    if (f.categories.length > 0 && !f.categories.includes(categoryForModel(p.modelType))) {
      return false;
    }
    if (f.department && p.department !== f.department) return false;
    if (f.barangay && (p.barangay || "") !== f.barangay) return false;
    if (q) {
      const hay = `${p.name} ${p.barangay || ""} ${p.modelType} ${p.status}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function toggleListValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}
