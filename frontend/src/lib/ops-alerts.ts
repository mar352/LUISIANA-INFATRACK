import type { PlanningEvent, PlanningMeeting, Project } from "../types";

export type OpsAlertKind = "deadline" | "budget" | "delayed" | "meeting" | "maintenance";

export type OpsAlert = {
  id: string;
  title: string;
  message: string;
  at: string;
  kind: OpsAlertKind;
  open: "projects" | "planning";
  rank: number;
};

const DAY = 86_400_000;

export function formatAlertWhen(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ms = t - Date.now();
  const days = Math.round(ms / DAY);
  if (ms >= 0) {
    if (days <= 0) return "today";
    if (days === 1) return "tomorrow";
    return `in ${days}d`;
  }
  const ago = Math.abs(days);
  if (ago <= 0) return "today";
  if (ago === 1) return "yesterday";
  return `${ago}d ago`;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / DAY);
}

function utilPct(p: Project): number | null {
  const total = Number(p.budgetTotal);
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.round(((Number(p.budgetSpent) || 0) / total) * 100);
}

/** Project deadline, budget, delay, meeting, and maintenance alerts. */
export function buildOpsAlerts(
  projects: Project[],
  meetings: PlanningMeeting[] = [],
  events: PlanningEvent[] = [],
  opts?: { department?: string | null },
): OpsAlert[] {
  const list = (Array.isArray(projects) ? projects : []).filter(Boolean);
  const scoped = opts?.department ? list.filter((p) => p.department === opts.department) : list;
  const out: OpsAlert[] = [];

  for (const p of scoped) {
    if (p.status === "Completed" || p.lifecyclePhase === "Decommissioned") {
      if (p.lifecyclePhase === "Maintenance") {
        out.push({
          id: `maint:${p.id}`,
          title: "Maintenance",
          message: `"${p.name}" is in the Maintenance phase${p.barangay ? ` · ${p.barangay}` : ""}.`,
          at: p.updatedAt || new Date().toISOString(),
          kind: "maintenance",
          open: "projects",
          rank: 6,
        });
      }
      continue;
    }

    if (p.status === "Delayed" || p.status === "Suspended") {
      out.push({
        id: `delayed:${p.id}:${p.status}`,
        title: p.status === "Suspended" ? "Project suspended" : "Project delayed",
        message: `"${p.name}" is ${p.status}${p.barangay ? ` · ${p.barangay}` : ""}.`,
        at: p.updatedAt || new Date().toISOString(),
        kind: "delayed",
        open: "projects",
        rank: 2,
      });
    }

    const days = daysUntil(p.targetEndDate);
    if (days != null && p.status !== "Completed") {
      if (days < 0) {
        out.push({
          id: `deadline:${p.id}:overdue`,
          title: "Deadline overdue",
          message: `"${p.name}" is ${Math.abs(days)} day(s) past its target end (${p.targetEndDate}).`,
          at: p.targetEndDate || p.updatedAt,
          kind: "deadline",
          open: "projects",
          rank: 0,
        });
      } else if (days <= 7) {
        out.push({
          id: `deadline:${p.id}:week`,
          title: "Deadline this week",
          message: `"${p.name}" is due in ${days} day(s) (${p.targetEndDate}).`,
          at: p.targetEndDate || p.updatedAt,
          kind: "deadline",
          open: "projects",
          rank: 3,
        });
      } else if (days <= 14) {
        out.push({
          id: `deadline:${p.id}:soon`,
          title: "Deadline in 2 weeks",
          message: `"${p.name}" target end is ${p.targetEndDate} (${days} days).`,
          at: p.targetEndDate || p.updatedAt,
          kind: "deadline",
          open: "projects",
          rank: 4,
        });
      }
    }

    const pct = utilPct(p);
    if (pct != null) {
      if (pct > 100) {
        out.push({
          id: `budget:${p.id}:over`,
          title: "Over budget",
          message: `"${p.name}" spent ${pct}% of programmed budget.`,
          at: p.updatedAt || new Date().toISOString(),
          kind: "budget",
          open: "projects",
          rank: 1,
        });
      } else if (pct >= 90) {
        out.push({
          id: `budget:${p.id}:near`,
          title: "Budget threshold (90%)",
          message: `"${p.name}" is at ${pct}% utilization.`,
          at: p.updatedAt || new Date().toISOString(),
          kind: "budget",
          open: "projects",
          rank: 4,
        });
      }
    }

    if (p.lifecyclePhase === "Maintenance") {
      out.push({
        id: `maint:${p.id}`,
        title: "Maintenance",
        message: `"${p.name}" is tagged Maintenance${p.barangay ? ` · ${p.barangay}` : ""}.`,
        at: p.updatedAt || new Date().toISOString(),
        kind: "maintenance",
        open: "projects",
        rank: 6,
      });
    }
  }

  for (const m of Array.isArray(meetings) ? meetings : []) {
    const days = daysUntil(m.heldAt);
    if (days == null || days < 0 || days > 7) continue;
    out.push({
      id: `meeting:${m.id}:${m.heldAt}`,
      title: days === 0 ? "Meeting today" : days === 1 ? "Meeting tomorrow" : "Meeting this week",
      message: `"${m.title}" · ${new Date(m.heldAt).toLocaleString()}`,
      at: m.heldAt,
      kind: "meeting",
      open: "planning",
      rank: days <= 1 ? 3 : 5,
    });
  }

  for (const ev of Array.isArray(events) ? events : []) {
    const days = daysUntil(ev.startsAt);
    if (days == null || days < 0 || days > 7) continue;
    const isDeadline = ev.type === "deadline";
    out.push({
      id: `event:${ev.id}:${ev.startsAt}`,
      title: isDeadline
        ? days === 0
          ? "Planning deadline today"
          : "Planning deadline this week"
        : days === 0
          ? "Calendar event today"
          : "Calendar event this week",
      message: `"${ev.title}" · ${new Date(ev.startsAt).toLocaleString()}`,
      at: ev.startsAt,
      kind: isDeadline ? "deadline" : "meeting",
      open: "planning",
      rank: days <= 1 ? 3 : 5,
    });
  }

  const seen = new Set<string>();
  return out
    .filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    })
    .sort((a, b) => a.rank - b.rank || (b.at || "").localeCompare(a.at || ""))
    .slice(0, 24);
}
