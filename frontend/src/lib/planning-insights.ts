import type { PlanningProposal, Project } from "../types";
import { BASELINE_NEEDS, computeInfraGaps, type BarangayGap } from "./infra-analytics";
import { computeRecommendation, inferBaselineNeed } from "./planning-recommend";

export type NextBuildRec = {
  barangay: string;
  facility: string;
  needScore: number;
  reasons: string[];
  coveredByProject: boolean;
  matchingProposalId?: string;
  matchingProposalTitle?: string;
};

export type RankedProposal = {
  id: string;
  title: string;
  barangay?: string;
  status: string;
  score: number;
  reasons: string[];
};

export type PlanningFlag = {
  tone: "warn" | "info";
  title: string;
  detail: string;
};

export type PlanningInsights = {
  generatedAt: string;
  outlook: {
    ongoing: number;
    delayed: number;
    planned: number;
    monthsToClearOngoing: number | null;
    gapsNow: number;
    gapsUncovered: number;
    barangaysStillShort: string[];
    note: string;
  };
  nextBuilds: NextBuildRec[];
  proposalRanks: RankedProposal[];
  flags: PlanningFlag[];
};

export function baselineNeedForModel(modelType: string | undefined): string | null {
  if (!modelType) return null;
  for (const need of BASELINE_NEEDS) {
    if (need.modelTypes.includes(modelType)) return need.label;
  }
  return null;
}

function monthsToFinish(p: Project): number | null {
  if (p.status !== "Ongoing" && p.status !== "Planned") return null;
  if (p.targetEndDate) {
    const ms = new Date(p.targetEndDate).getTime() - Date.now();
    if (Number.isFinite(ms) && ms > 0) return Math.max(1, Math.round(ms / (30.44 * 86_400_000)));
  }
  const remaining = Math.max(1, 100 - Math.max(0, Math.min(99, Number(p.progress) || 0)));
  const rate = p.status === "Ongoing" ? 10 : 5;
  return Math.max(2, Math.min(24, Math.ceil(remaining / rate)));
}

function gapKey(barangay: string, facility: string) {
  return `${barangay}::${facility}`;
}

/** Explainable outlook + ranked next-build list from live projects and planning requests. */
export function computePlanningInsights(
  projects: Project[],
  proposals: PlanningProposal[] = [],
): PlanningInsights {
  const list = (Array.isArray(projects) ? projects : []).filter(Boolean);
  const safeProposals = (Array.isArray(proposals) ? proposals : []).filter(Boolean);
  const gaps = computeInfraGaps(list);
  const active = safeProposals.filter((p) => p.status !== "draft" && p.status !== "rejected");

  const delayed = list.filter((p) => p.status === "Delayed" || p.status === "Suspended");
  const ongoing = list.filter((p) => p.status === "Ongoing");
  const planned = list.filter((p) => p.status === "Planned");

  const inFlightFill = new Set<string>();
  const finishMonths: number[] = [];
  for (const p of [...ongoing, ...planned]) {
    const need = baselineNeedForModel(p.modelType);
    const brgy = (p.barangay || "").trim();
    if (need && brgy) inFlightFill.add(gapKey(brgy, need));
    const m = monthsToFinish(p);
    if (m != null && p.status === "Ongoing") finishMonths.push(m);
  }

  const uncovered: { barangay: string; facility: string }[] = [];
  for (const g of gaps) {
    for (const facility of g.missing) {
      if (!inFlightFill.has(gapKey(g.barangay, facility))) {
        uncovered.push({ barangay: g.barangay, facility });
      }
    }
  }

  const gapsNow = gaps.reduce((n, g) => n + g.missing.length, 0);
  const monthsToClearOngoing =
    finishMonths.length === 0 ? null : Math.max(...finishMonths);
  const stillShort = [...new Set(uncovered.map((u) => u.barangay))];

  const outlookNote =
    gapsNow === 0
      ? "Baseline hall / health / school / water types are present in every listed barangay that has map tags."
      : monthsToClearOngoing == null
        ? `${uncovered.length} baseline gap(s) have no planned or ongoing project in flight.`
        : `Ongoing work may wrap in about ${monthsToClearOngoing} month(s) at current progress. ${uncovered.length} gap(s) still have nothing in the pipeline.`;

  const nextBuilds: NextBuildRec[] = uncovered
    .map((u) => {
      const g = gaps.find((x) => x.barangay === u.barangay);
      const delayedHere = delayed.filter((p) => p.barangay === u.barangay).length;
      const count = g?.projectCount ?? 0;
      let needScore = 40 + (g?.missing.length ?? 1) * 14;
      if (count === 0) needScore += 12;
      if (delayedHere) needScore += 10;
      if (!inFlightFill.has(gapKey(u.barangay, u.facility))) needScore += 8;
      needScore = Math.max(20, Math.min(100, needScore));

      const reasons = [
        `${u.facility} is not on the map in ${u.barangay}`,
        `${g?.missing.length ?? 0} baseline gap(s) in this barangay`,
      ];
      if (count === 0) reasons.push("No tagged project in this barangay yet");
      if (delayedHere) reasons.push(`${delayedHere} delayed/suspended project(s) here`);

      const match = active.find((pr) => {
        if ((pr.barangay || "").trim() !== u.barangay) return false;
        const inferred = inferBaselineNeed(`${pr.title} ${pr.summary || ""}`);
        return inferred === u.facility;
      });
      if (match) reasons.push(`Open request: ${match.title}`);

      return {
        barangay: u.barangay,
        facility: u.facility,
        needScore,
        reasons,
        coveredByProject: false,
        matchingProposalId: match?.id,
        matchingProposalTitle: match?.title,
      };
    })
    .sort((a, b) => b.needScore - a.needScore || a.barangay.localeCompare(b.barangay))
    .slice(0, 10);

  const proposalRanks: RankedProposal[] = active
    .map((pr) => {
      const rec = computeRecommendation(pr, { projects: list });
      return {
        id: pr.id,
        title: pr.title,
        barangay: pr.barangay,
        status: pr.status,
        score: rec.score,
        reasons: rec.reasons,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const flags: PlanningFlag[] = [];
  if (delayed.length) {
    flags.push({
      tone: "warn",
      title: `${delayed.length} delayed or suspended`,
      detail: "These sit in the pipeline but are not advancing — they should be reviewed before new siting.",
    });
  }
  if (uncovered.length) {
    flags.push({
      tone: "warn",
      title: `${uncovered.length} gaps with no project`,
      detail: stillShort.slice(0, 4).join(", ") + (stillShort.length > 4 ? "…" : ""),
    });
  }
  const noBudget = list.filter((p) => p.status !== "Completed" && !(Number(p.budgetTotal) > 0));
  if (noBudget.length >= 3) {
    flags.push({
      tone: "info",
      title: `${noBudget.length} active projects have no budget line`,
      detail: "Expenditure analytics will under-count until a programmed amount is set.",
    });
  }
  if (proposalRanks[0] && proposalRanks[0].score >= 70) {
    flags.push({
      tone: "info",
      title: `Prioritize “${proposalRanks[0].title}”`,
      detail: proposalRanks[0].reasons.slice(0, 2).join(" · "),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    outlook: {
      ongoing: ongoing.length,
      delayed: delayed.length,
      planned: planned.length,
      monthsToClearOngoing,
      gapsNow,
      gapsUncovered: uncovered.length,
      barangaysStillShort: stillShort,
      note: outlookNote,
    },
    nextBuilds,
    proposalRanks,
    flags,
  };
}

export function gapMap(projects: Project[]): Map<string, BarangayGap> {
  return new Map(computeInfraGaps(projects).map((g) => [g.barangay, g]));
}
