/** Static municipal planning committees (stored as proposal.committeeId). */
export type PlanningCommittee = {
  id: string;
  label: string;
  shortLabel: string;
};

export const PLANNING_COMMITTEES: PlanningCommittee[] = [
  { id: "mdc", label: "Municipal Development Council", shortLabel: "MDC" },
  { id: "infra", label: "Infrastructure Committee", shortLabel: "Infra" },
  { id: "bac", label: "Bids and Awards Committee", shortLabel: "BAC" },
  { id: "agri", label: "Agriculture & Livelihood Committee", shortLabel: "Agri" },
  { id: "zoning", label: "Zoning & Land Use Committee", shortLabel: "Zoning" },
];

export function committeeLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return PLANNING_COMMITTEES.find((c) => c.id === id)?.label ?? id;
}

export function committeeShortLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return PLANNING_COMMITTEES.find((c) => c.id === id)?.shortLabel ?? id;
}
