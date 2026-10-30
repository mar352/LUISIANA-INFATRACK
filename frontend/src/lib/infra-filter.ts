import type { ModelType, Project, ProjectStatus } from "../types";
import { MODEL_CATALOG } from "../types";
import { getBuildingSector } from "./sectoral-filter";

export type InfraCategory = "Building" | "Infrastructure" | "Agriculture" | "Construction";

export type InfraFilter = {
  query: string;
  statuses: ProjectStatus[];
  categories: InfraCategory[];
  department: "" | Project["department"];
  barangay: string;
  clustering: boolean;
  sector?: string;
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
  "Treasury Office",
  "Negosyo Center",
];

export const DEFAULT_INFRA_FILTER: InfraFilter = {
  query: "",
  statuses: [...INFRA_STATUSES],
  categories: [...INFRA_CATEGORIES],
  department: "",
  barangay: "",
  clustering: false,
};

export function categoryForModel(type: ModelType | undefined): InfraCategory {
  return MODEL_CATALOG.find((m) => m.type === type)?.category ?? "Building";
}

export function isLguInfrastructureProject(p: Project | any): boolean {
  if (!p) return false;
  // 1. Explicit private application & building flags
  if (
    p.isPrivateApplication === true ||
    p.type === "Private Building" ||
    Boolean(p.trackingNumber) ||
    Boolean(p.applicationId) ||
    (typeof p.id === "string" && (p.id.startsWith("app-") || p.id.startsWith("infra-app-"))) ||
    (p.fundingSource && typeof p.fundingSource === "string" && /private|proponent|citizen|property owner/i.test(p.fundingSource)) ||
    (p.contractor && typeof p.contractor === "string" && /private|property owner/i.test(p.contractor))
  ) {
    return false;
  }

  // 2. Private infra description / title indicators
  const desc = typeof p.description === "string" ? p.description.toLowerCase() : "";
  const name = typeof p.name === "string" ? p.name.toLowerCase() : "";
  if (
    desc.includes("private infrastructure") ||
    desc.includes("citizen zoning") ||
    desc.includes("tracking: luis-") ||
    desc.includes("proponent:") ||
    name.includes("(luis-")
  ) {
    return false;
  }

  // 3. Residential housing sectors are strictly private citizen structures (never LGU projects)
  const sector = getBuildingSector(p);
  if (["Residential", "Apartment", "Townhouse", "Dormitory"].includes(sector)) {
    return false;
  }

  // 4. Generic online submissions starting with proj_ without explicit isLguProject: true
  if (typeof p.id === "string" && p.id.startsWith("proj_") && p.isLguProject !== true) {
    return false;
  }

  // 5. Must satisfy legitimate LGU project criteria (strictly municipal/LGU)
  return Boolean(
    p.isLguProject === true ||
    p.type === "Municipal Project" ||
    (typeof p.id === "string" && (
      p.id.startsWith("lgu-proj-") ||
      p.id.startsWith("municipal-") ||
      p.id.startsWith("muni-")
    ))
  );
}

export function isMeoStaffRole(role?: string | null): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  if (r.includes("private")) return false;
  return (
    r === "meo" ||
    r === "engineer" ||
    r === "municipal engineer" ||
    r === "municipal engineering office" ||
    r === "engineering"
  );
}

export function filterInfrastructure(
  projects: Project[],
  f: InfraFilter,
  userRole?: string
): Project[] {
  const isMeo = isMeoStaffRole(userRole);
  const q = f.query.trim().toLowerCase();

  return projects.filter((p) => {
    // Strict Role Isolation: MEO role is strictly for LGU infrastructure projects.
    // No private infrastructure (citizen applications, private buildings, non-LGU) should be pinned or displayed for MEO.
    if (isMeo) {
      if (!isLguInfrastructureProject(p)) {
        return false;
      }
    }

    if (f.sector && f.sector !== "all") {
      if (getBuildingSector(p) !== f.sector) return false;
    }

    if (
      (p as any).isPrivateApplication ||
      (p as any).isLguProject ||
      p.type === "Municipal Project" ||
      (p as any).trackingNumber ||
      p.id === "pinpoint_site_pin" ||
      (typeof p.id === "string" && (p.id.startsWith("lgu-proj-") || p.id.startsWith("P")))
    ) {
      if (f.barangay && (p.barangay || "") !== f.barangay) return false;
      if (q) {
        const hay = `${p.name} ${p.barangay || ""} ${p.status || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }
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
