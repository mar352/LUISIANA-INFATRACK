/**
 * Critical municipal facilities on the Luisiana map.
 * Identification is by model type — hall, health, school, water, evacuation.
 */

import type { Project } from "../types";
import { MODEL_CATALOG } from "../types";
import { assessPointCompact, type CompactHazard } from "./hazard-report";

export const CRITICAL_MODEL_TYPES = [
  "municipal_hall",
  "barangay_hall",
  "rhu",
  "hospital",
  "school",
  "water_tank",
  "evacuation_center",
] as const;

export type CriticalKind = (typeof CRITICAL_MODEL_TYPES)[number];

export const CRITICAL_GROUPS: { id: string; label: string; types: CriticalKind[] }[] = [
  { id: "all", label: "All critical", types: [...CRITICAL_MODEL_TYPES] },
  { id: "hall", label: "Halls", types: ["municipal_hall", "barangay_hall"] },
  { id: "health", label: "Health", types: ["rhu", "hospital"] },
  { id: "school", label: "Schools", types: ["school"] },
  { id: "water", label: "Water", types: ["water_tank"] },
  { id: "evac", label: "Evacuation", types: ["evacuation_center"] },
];

export function isCriticalType(modelType: string | undefined): modelType is CriticalKind {
  return Boolean(modelType && (CRITICAL_MODEL_TYPES as readonly string[]).includes(modelType));
}

export function criticalTypeLabel(modelType: string): string {
  return MODEL_CATALOG.find((m) => m.type === modelType)?.label || modelType;
}

export function listCriticalProjects(projects: Project[]): Project[] {
  return (projects || [])
    .filter((p) => isCriticalType(p.modelType))
    .sort((a, b) => (a.barangay || "").localeCompare(b.barangay || "") || a.name.localeCompare(b.name));
}

async function poolMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  const n = Math.min(Math.max(1, limit), Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export async function loadCriticalHazards(
  projects: Project[],
  signal?: AbortSignal,
): Promise<Record<string, CompactHazard>> {
  const list = listCriticalProjects(projects).filter(
    (p) => Number.isFinite(p.location?.lat) && Number.isFinite(p.location?.lon),
  );
  const rows = await poolMap(list, 4, async (p) => {
    if (signal?.aborted) return [p.id, null] as const;
    try {
      const haz = await assessPointCompact(p.location.lat, p.location.lon, signal);
      return [p.id, haz] as const;
    } catch {
      return [p.id, null] as const;
    }
  });
  const map: Record<string, CompactHazard> = {};
  for (const [id, haz] of rows) {
    if (haz) map[id] = haz;
  }
  return map;
}
