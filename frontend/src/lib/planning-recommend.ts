import type {
  PlanningNeedsAssessment,
  PlanningProposal,
  PlanningProposalStatus,
  PlanningRequestKind,
  Project,
} from "../types";
import { computeInfraGaps } from "./infra-analytics";

const NEED_HINTS: { label: string; needles: string[] }[] = [
  { label: "Barangay Hall", needles: ["barangay hall", "brgy hall", "bgy hall", "municipal hall"] },
  { label: "Health facility", needles: ["rhu", "health center", "health", "hospital", "clinic", "birthing"] },
  { label: "School", needles: ["school", "classroom", "deped", "elementary", "high school"] },
  { label: "Water facility", needles: ["water tank", "water", "reservoir", "poso", "level ii", "level iii"] },
];

export function inferBaselineNeed(text: string): string | null {
  const t = String(text || "").toLowerCase();
  for (const row of NEED_HINTS) {
    if (row.needles.some((n) => t.includes(n))) return row.label;
  }
  return null;
}

export type RecommendationResult = {
  score: number;
  reasons: string[];
};

const HAZARD_WEIGHT: Record<string, number> = {
  high: 25,
  moderate: 15,
  medium: 15,
  low: 5,
  none: 0,
  unknown: 5,
};

/** True when urgency + hazard exposure are filled. */
export function isNeedsAssessmentComplete(
  needs: PlanningNeedsAssessment | null | undefined,
): boolean {
  if (!needs) return false;
  return Boolean(needs.urgencyNote?.trim() && needs.hazardExposure?.trim());
}

export type RecommendationContext = {
  projects?: Project[];
};

/**
 * Rule-based recommendation score (0–100).
 * Transparent weights for MPDC — not ML.
 * Optional live projects add points when the request fills a mapped baseline gap.
 */
export function computeRecommendation(
  proposal: Pick<
    PlanningProposal,
    | "title"
    | "summary"
    | "priority"
    | "needsAssessment"
    | "requestKind"
    | "barangay"
    | "attachments"
  >,
  ctx?: RecommendationContext,
): RecommendationResult {
  const reasons: string[] = [];
  let score = 0;

  // Priority 1 = highest → up to 40 points
  const p = proposal.priority || 3;
  const priorityPts = Math.round(((6 - p) / 5) * 40);
  score += priorityPts;
  reasons.push(
    p <= 2
      ? `High priority (P${p})`
      : p === 3
        ? `Medium priority (P${p})`
        : `Lower priority (P${p})`,
  );

  const needs = proposal.needsAssessment;
  if (isNeedsAssessmentComplete(needs)) {
    score += 25;
    reasons.push("Needs assessment complete");
  } else {
    reasons.push("Needs assessment incomplete");
  }

  const hazardKey = (needs?.hazardExposure || "unknown").trim().toLowerCase();
  const hazardPts =
    HAZARD_WEIGHT[hazardKey] ??
    (hazardKey.includes("high")
      ? 25
      : hazardKey.includes("mod") || hazardKey.includes("med")
        ? 15
        : hazardKey.includes("low")
          ? 5
          : 8);
  score += Math.min(25, hazardPts);
  if (needs?.hazardExposure?.trim()) {
    reasons.push(`Hazard exposure: ${needs.hazardExposure.trim()}`);
  }

  if (proposal.requestKind === "barangay_request" && proposal.barangay) {
    score += 5;
    reasons.push(`Barangay request (${proposal.barangay})`);
  }

  const docs = proposal.attachments?.length ?? 0;
  if (docs > 0) {
    score += Math.min(10, docs * 4);
    reasons.push(`${docs} supporting document${docs === 1 ? "" : "s"}`);
  }

  const projects = ctx?.projects;
  const barangay = (proposal.barangay || "").trim();
  if (projects?.length && barangay) {
    const gap = computeInfraGaps(projects).find((g) => g.barangay === barangay);
    const inferred = inferBaselineNeed(`${proposal.title || ""} ${proposal.summary || ""}`);
    if (gap && inferred && gap.missing.includes(inferred)) {
      score += 20;
      reasons.push(`Fills ${inferred} gap in ${barangay}`);
    } else if (gap && gap.missing.length >= 2) {
      score += 8;
      reasons.push(`${barangay} has ${gap.missing.length} baseline gaps`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
}

const ROUTE_STEPS: PlanningProposalStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "recommended",
  "approved",
];

export function routingStepsForStatus(status: PlanningProposalStatus): {
  id: PlanningProposalStatus;
  label: string;
  state: "done" | "current" | "upcoming" | "aside";
}[] {
  if (status === "returned" || status === "rejected") {
    return [
      ...ROUTE_STEPS.slice(0, 3).map((id) => ({
        id,
        label: id === "in_review" ? "In review" : id[0].toUpperCase() + id.slice(1),
        state: "done" as const,
      })),
      {
        id: status,
        label: status === "returned" ? "Returned" : "Rejected",
        state: "current" as const,
      },
    ];
  }

  const idx = ROUTE_STEPS.indexOf(status);
  return ROUTE_STEPS.map((id, i) => {
    const label =
      id === "in_review"
        ? "In review"
        : id === "recommended"
          ? "Recommended"
          : id[0].toUpperCase() + id.slice(1);
    let state: "done" | "current" | "upcoming" | "aside" = "upcoming";
    if (idx < 0) state = "upcoming";
    else if (i < idx) state = "done";
    else if (i === idx) state = "current";
    return { id, label, state };
  });
}

export function nextActorHint(status: PlanningProposalStatus): string {
  switch (status) {
    case "draft":
      return "Waiting on submitter to submit the request.";
    case "submitted":
      return "Waiting on MPDC to move into review.";
    case "in_review":
      return "Waiting on MPDC to recommend, return, or reject.";
    case "recommended":
      return "Waiting on MPDC to approve, return, or reject.";
    case "approved":
      return "Waiting on MPDC to pin the building site on the map.";
    case "returned":
      return "Returned to submitter — revise and resubmit.";
    case "rejected":
      return "Rejected — no further routing.";
    default:
      return "";
  }
}

export function requestKindLabel(kind: PlanningRequestKind | undefined): string {
  switch (kind) {
    case "barangay_request":
      return "Brgy Request";
    case "office_proposal":
      return "Office Proposal";
    case "zoning_certificate":
      return "Zoning Certificate";
    case "land_titling":
      return "Land Titling (DENR)";
    case "planning_research":
      return "Research Data";
    default:
      return "Proposal";
  }
}
