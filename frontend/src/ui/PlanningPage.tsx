import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PlanningApprovalDecision,
  PlanningComment,
  PlanningEvent,
  PlanningEventType,
  PlanningMeeting,
  PlanningNeedsAssessment,
  PlanningProposal,
  PlanningProposalStatus,
  PlanningRequestKind,
  PlanningVoteChoice,
} from "../types";
import {
  BARANGAY_LIST,
  PLANNING_STATUS_COLORS,
  PLANNING_STATUS_LABELS,
  PLANNING_STATUS_WORKSPACE_LABELS,
} from "../types";
import type { PublicAccount, SessionUser } from "../services/auth";
import { isBarangayOfficial } from "./Landing";
import { listAccounts } from "../services/auth";
import {
  addComment,
  createPlanningEvent,
  createPlanningMeeting,
  createProposal,
  deletePlanningEvent,
  deletePlanningMeeting,
  fetchCommentsOnce,
  fetchPlanningEventsOnce,
  fetchPlanningMeetingsOnce,
  fetchProposalsOnce,
  subscribeToComments,
  subscribeToPlanningEvents,
  subscribeToPlanningMeetings,
  subscribeToProposals,
  updatePlanningMeeting,
  updateProposal,
} from "../services/firestore-planning";
import { BACKEND_URL, backendUrl, uploadPlanningAttachment } from "../lib/api";
import {
  allowedStatusTransitions,
  departmentForRole,
  getPlanningPermissions,
} from "../lib/planning-permissions";
import {
  PLANNING_COMMITTEES,
  committeeLabel,
  committeeShortLabel,
} from "../lib/planning-committees";
import {
  computeRecommendation,
  isNeedsAssessmentComplete,
  nextActorHint,
  requestKindLabel,
  routingStepsForStatus,
} from "../lib/planning-recommend";
import { connectRealtime } from "../lib/realtime";
import { ThemeToggle } from "./ThemeToggle";
import "./PlanningPage.css";

type Tab = "board" | "calendar" | "meetings";

type Props = {
  onBack: () => void;
  session: SessionUser | null;
  /** After approval, MPDC opens the map to pin where the building will stand. */
  onPinSite?: (proposal: PlanningProposal) => void;
};

type AnchorKind = "none" | "section" | "map";

const SECTION_ANCHORS = ["Summary", "Location", "Priority", "Other"] as const;

/** Office accounts shown in assignee pickers (no Viewer, no scroller needed). */
const OFFICE_ASSIGNEE_ROLES = ["MPDC", "Engineer", "Agriculture", "Negosyo Center"] as const;
/** MPDC owns zoning / siting review — always on the card. */
const MPDC_ASSIGNEE = "mpdc";

function withMpdcAssignee(list: string[]): string[] {
  return list.includes(MPDC_ASSIGNEE) ? list : [MPDC_ASSIGNEE, ...list];
}

const FALLBACK_OFFICE_ACCOUNTS: PublicAccount[] = [
  {
    username: "mpdc",
    role: "MPDC",
    label: "MPDC",
    department: "Municipal Planning & Development Coordinator",
  },
  {
    username: "engineer",
    role: "Engineer",
    label: "Engineer",
    department: "Infrastructure & Engineering Office",
  },
  {
    username: "agriculture",
    role: "Agriculture",
    label: "Agriculture",
    department: "Municipal Agriculture Office",
  },
  {
    username: "negosyo",
    role: "Negosyo Center",
    label: "Negosyo Center",
    department: "Business Permit & Licensing Office",
  },
];

const STATUS_COLUMNS: PlanningProposalStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "recommended",
  "approved",
  "returned",
  "rejected",
];

const MAIN_PIPELINE: PlanningProposalStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "recommended",
  "approved",
];

const SIDE_LANES: PlanningProposalStatus[] = ["returned", "rejected"];

const POLL_MS = 5000;

function formatWhen(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDay(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function attachmentLabel(url: string) {
  try {
    const name = url.split("/").pop() || url;
    return decodeURIComponent(name);
  } catch {
    return url;
  }
}

function attachmentHref(url: string) {
  if (url.startsWith("http")) return url;
  return backendUrl(url);
}

function tallyVotes(votes: PlanningProposal["votes"] | undefined) {
  const list = votes || [];
  return {
    yes: list.filter((v) => v.choice === "yes").length,
    no: list.filter((v) => v.choice === "no").length,
    abstain: list.filter((v) => v.choice === "abstain").length,
    total: list.length,
  };
}

function sameCalendarDay(iso: string, day: Date) {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

function buildMonthGrid(monthStart: Date) {
  const y = monthStart.getFullYear();
  const m = monthStart.getMonth();
  const firstDow = new Date(y, m, 1).getDay(); // 0 Sun
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function PlanningPage({ onBack, session, onPinSite }: Props) {
  const role = session?.role ?? null;
  const perms = getPlanningPermissions(role);
  const barangayOnly = isBarangayOfficial(role);

  const [tab, setTab] = useState<Tab>("board");
  const [proposals, setProposals] = useState<PlanningProposal[]>([]);
  const [events, setEvents] = useState<PlanningEvent[]>([]);
  const [meetings, setMeetings] = useState<PlanningMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterDept, setFilterDept] = useState("");
  const [filterStatus, setFilterStatus] = useState<PlanningProposalStatus | "">("");
  const [filterBarangay, setFilterBarangay] = useState("");
  const [filterKind, setFilterKind] = useState<PlanningRequestKind | "">("");
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<PlanningComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentAnchorKind, setCommentAnchorKind] = useState<AnchorKind>("none");
  const [commentSectionLabel, setCommentSectionLabel] = useState<string>("Summary");
  const [commentOtherLabel, setCommentOtherLabel] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [voteNote, setVoteNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<PublicAccount[]>([]);
  const [draftAssignees, setDraftAssignees] = useState<string[]>([MPDC_ASSIGNEE]);
  const [draftCommitteeId, setDraftCommitteeId] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [showCreateMore, setShowCreateMore] = useState(false);
  const [showDetailMore, setShowDetailMore] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftBarangay, setDraftBarangay] = useState("");
  const [draftPriority, setDraftPriority] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [draftRequestKind, setDraftRequestKind] =
    useState<PlanningRequestKind>(
      isBarangayOfficial(session?.role) ? "barangay_request" : "office_proposal",
    );
  const [draftAttachments, setDraftAttachments] = useState<string[]>([]);

  const [needsDraft, setNeedsDraft] = useState<PlanningNeedsAssessment>({});

  const [showEventForm, setShowEventForm] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventType, setEventType] = useState<PlanningEventType>("committee");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventAttendees, setEventAttendees] = useState("");
  const [eventProposalIds, setEventProposalIds] = useState("");

  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingHeldAt, setMeetingHeldAt] = useState("");
  const [meetingAttendees, setMeetingAttendees] = useState("");
  const [meetingAgenda, setMeetingAgenda] = useState("");
  const [meetingMinutes, setMeetingMinutes] = useState("");
  const [meetingDecisions, setMeetingDecisions] = useState("");
  const [meetingProposalIds, setMeetingProposalIds] = useState("");
  const [meetingAttachments, setMeetingAttachments] = useState<string[]>([]);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedCalDay, setSelectedCalDay] = useState<Date | null>(null);
  const [firestoreDenied, setFirestoreDenied] = useState(false);
  const tabRef = useRef(tab);
  const selectedIdRef = useRef(selectedId);
  tabRef.current = tab;
  selectedIdRef.current = selectedId;

  useEffect(() => {
    listAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    const socket = connectRealtime(BACKEND_URL);
    const onPlanning = (payload: { kind?: string; at?: string }) => {
      const kind = payload?.kind ? ` (${payload.kind})` : "";
      setMessage(`Planning synced${kind}`);
      void (async () => {
        try {
          const activeTab = tabRef.current;
          const sel = selectedIdRef.current;
          if (activeTab === "board") {
            setProposals(await fetchProposalsOnce());
            if (sel) setComments(await fetchCommentsOnce(sel));
          } else if (activeTab === "calendar") {
            setEvents(await fetchPlanningEventsOnce());
          } else {
            setMeetings(await fetchPlanningMeetingsOnce());
          }
          setLastSyncedAt(new Date().toISOString());
        } catch (err) {
          console.warn("[Planning] socket refetch failed:", err);
        }
      })();
    };
    socket.on("planning:update", onPlanning);
    return () => {
      socket.off("planning:update", onPlanning);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const onPerm = (msg: string) => {
      if (/permission|insufficient/i.test(msg)) setFirestoreDenied(true);
    };
    const unsub = subscribeToProposals((list) => {
      setProposals(list);
      setLoading(false);
      setLastSyncedAt(new Date().toISOString());
      if (list.length > 0) setFirestoreDenied(false);
    }, onPerm);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeToPlanningEvents(setEvents, (msg) => {
      if (/permission|insufficient/i.test(msg)) setFirestoreDenied(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeToPlanningMeetings(setMeetings, (msg) => {
      if (/permission|insufficient/i.test(msg)) setFirestoreDenied(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setComments([]);
      return;
    }
    const unsub = subscribeToComments(selectedId, setComments);
    return () => unsub();
  }, [selectedId]);

  // Safety polling — multi-user freshness while the Planning page is open.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        if (tab === "board") {
          const list = await fetchProposalsOnce();
          if (!cancelled) {
            setProposals(list);
            setLoading(false);
          }
          if (selectedId) {
            const nextComments = await fetchCommentsOnce(selectedId);
            if (!cancelled) setComments(nextComments);
          }
        } else if (tab === "calendar") {
          const list = await fetchPlanningEventsOnce();
          if (!cancelled) setEvents(list);
        } else {
          const list = await fetchPlanningMeetingsOnce();
          if (!cancelled) setMeetings(list);
        }
        if (!cancelled) setLastSyncedAt(new Date().toISOString());
      } catch (err) {
        console.warn("[Planning] poll failed:", err);
      }
    };

    void tick();

    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tab, selectedId]);

  useEffect(() => {
    setShowDetailMore(false);
  }, [selectedId]);

  const selected = useMemo(
    () => proposals.find((p) => p.id === selectedId) ?? null,
    [proposals, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setNeedsDraft({});
      return;
    }
    setNeedsDraft({ ...(selected.needsAssessment || {}) });
  }, [selectedId, selected?.needsAssessment?.assessedAt, selected?.updatedAt]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proposals.filter((p) => {
      if (barangayOnly) {
        if ((p.requestKind || "office_proposal") !== "barangay_request") return false;
        if (session?.username && p.submitter?.username !== session.username) return false;
      }
      if (filterDept && p.department !== filterDept) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterBarangay && (p.barangay || "") !== filterBarangay) return false;
      if (filterKind && (p.requestKind || "office_proposal") !== filterKind) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        (p.barangay || "").toLowerCase().includes(q)
      );
    });
  }, [proposals, filterDept, filterStatus, filterBarangay, filterKind, search, barangayOnly, session?.username]);

  async function patchProposal(
    proposal: PlanningProposal,
    patch: Partial<PlanningProposal>,
  ) {
    const merged = { ...proposal, ...patch };
    const rec = computeRecommendation(merged);
    await updateProposal(proposal.id, {
      ...patch,
      recommendationScore: rec.score,
      recommendationReasons: rec.reasons,
    });
  }

  const byStatus = useMemo(() => {
    const map: Record<PlanningProposalStatus, PlanningProposal[]> = {
      draft: [],
      submitted: [],
      in_review: [],
      recommended: [],
      approved: [],
      returned: [],
      rejected: [],
    };
    for (const p of filtered) map[p.status].push(p);
    for (const key of STATUS_COLUMNS) {
      map[key].sort((a, b) => a.priority - b.priority || b.updatedAt.localeCompare(a.updatedAt));
    }
    return map;
  }, [filtered]);

  const monthEvents = useMemo(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    return events.filter((ev) => {
      const d = new Date(ev.startsAt);
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [events, calendarMonth]);

  const monthCells = useMemo(() => buildMonthGrid(calendarMonth), [calendarMonth]);

  const officeAccounts = useMemo(() => {
    const filtered = accounts.filter((a) =>
      (OFFICE_ASSIGNEE_ROLES as readonly string[]).includes(a.role),
    );
    if (filtered.length === 0) return FALLBACK_OFFICE_ACCOUNTS;
    // Prefer one account per office role, stable order
    return OFFICE_ASSIGNEE_ROLES.map(
      (role) =>
        filtered.find((a) => a.role === role) ||
        FALLBACK_OFFICE_ACCOUNTS.find((a) => a.role === role)!,
    );
  }, [accounts]);

  const dayEvents = useMemo(() => {
    if (!selectedCalDay) return monthEvents;
    return events.filter((ev) => sameCalendarDay(ev.startsAt, selectedCalDay));
  }, [events, selectedCalDay, monthEvents]);

  function toggleAssignee(list: string[], username: string) {
    return list.includes(username)
      ? list.filter((u) => u !== username)
      : [...list, username];
  }

  async function handleCreateProposal(submit: boolean) {
    if (!session || !perms.canCreate) return;
    if (!draftTitle.trim()) {
      setMessage("Title is required.");
      return;
    }
    const kind: PlanningRequestKind = barangayOnly
      ? "barangay_request"
      : draftRequestKind;
    if (kind === "barangay_request" && !draftBarangay) {
      setMessage("Barangay is required for barangay infrastructure requests.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const created = await createProposal({
        title: draftTitle.trim(),
        summary: draftSummary.trim(),
        department: departmentForRole(session.role),
        barangay: draftBarangay || undefined,
        priority: draftPriority,
        status: submit ? "submitted" : "draft",
        linkedProjectId: null,
        location: null,
        submitter: {
          username: session.username,
          role: session.role,
          department: session.department,
        },
        assignees: withMpdcAssignee(draftAssignees),
        committeeId: draftCommitteeId || null,
        requestKind: kind,
        needsAssessment: null,
        attachments: draftAttachments,
      });
      setShowCreate(false);
      setDraftTitle("");
      setDraftSummary("");
      setDraftBarangay("");
      setDraftPriority(3);
      setDraftRequestKind(barangayOnly ? "barangay_request" : "office_proposal");
      setDraftAttachments([]);
      setDraftAssignees([MPDC_ASSIGNEE]);
      setDraftCommitteeId("");
      setSelectedId(created.id);
      setMessage(submit ? "Request / proposal submitted." : "Draft saved.");
      setFirestoreDenied(false);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      if (/permission|insufficient/i.test(msg)) {
        setFirestoreDenied(true);
        setMessage("Firestore blocked this write — update security rules (see banner).");
      } else {
        setMessage("Failed to create proposal.");
      }
    }
    setBusy(false);
  }

  async function handleAssigneesChange(proposal: PlanningProposal, next: string[]) {
    if (!perms.canAssign) return;
    setBusy(true);
    try {
      await patchProposal(proposal, { assignees: withMpdcAssignee(next) });
    } catch (err) {
      console.error(err);
      setMessage("Failed to update assignees.");
    }
    setBusy(false);
  }

  async function handleCommitteeChange(proposal: PlanningProposal, committeeId: string) {
    if (!perms.canAssign) return;
    setBusy(true);
    try {
      await patchProposal(proposal, { committeeId: committeeId || null });
    } catch (err) {
      console.error(err);
      setMessage("Failed to update committee.");
    }
    setBusy(false);
  }

  async function handlePriority(proposal: PlanningProposal, priority: 1 | 2 | 3 | 4 | 5) {
    if (!perms.canSetPriority) return;
    setBusy(true);
    try {
      await patchProposal(proposal, { priority });
    } catch (err) {
      console.error(err);
      setMessage("Failed to update priority.");
    }
    setBusy(false);
  }

  async function handleSaveNeeds(proposal: PlanningProposal) {
    if (!session || !(perms.canRecommend || perms.canAssign)) return;
    setBusy(true);
    try {
      const needs: PlanningNeedsAssessment = {
        ...needsDraft,
        assessedBy: session.username,
        assessedAt: new Date().toISOString(),
      };
      await patchProposal(proposal, { needsAssessment: needs });
      setMessage("Needs assessment saved.");
    } catch (err) {
      console.error(err);
      setMessage("Failed to save needs assessment.");
    }
    setBusy(false);
  }

  async function handleProposalFile(proposal: PlanningProposal, file: File | null) {
    if (!file || (!perms.canComment && !perms.canCreate)) return;
    setBusy(true);
    try {
      const result = await uploadPlanningAttachment(file);
      const next = [...(proposal.attachments || []), result.url];
      await patchProposal(proposal, { attachments: next });
      setMessage(`Attached ${result.originalName}`);
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : "Attachment upload failed.");
    }
    setBusy(false);
  }

  async function handleRemoveProposalAttachment(proposal: PlanningProposal, url: string) {
    if (!perms.canComment && !perms.canCreate) return;
    setBusy(true);
    try {
      const next = (proposal.attachments || []).filter((u) => u !== url);
      await patchProposal(proposal, { attachments: next });
    } catch (err) {
      console.error(err);
      setMessage("Failed to remove attachment.");
    }
    setBusy(false);
  }

  async function handleDraftFile(file: File | null) {
    if (!file || !perms.canCreate) return;
    setBusy(true);
    try {
      const result = await uploadPlanningAttachment(file);
      setDraftAttachments((prev) => [...prev, result.url]);
      setMessage(`Attached ${result.originalName}`);
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : "Attachment upload failed.");
    }
    setBusy(false);
  }

  async function applyDecision(
    proposal: PlanningProposal,
    decision: PlanningApprovalDecision,
    nextStatus: PlanningProposalStatus,
  ) {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const note = decisionNote.trim();
      const approval = {
        role: session.role,
        username: session.username,
        decision,
        at: new Date().toISOString(),
        ...(note ? { note } : {}),
      };
      await updateProposal(proposal.id, {
        status: nextStatus,
        approvals: [...(proposal.approvals || []), approval],
      });
      setDecisionNote("");
      setMessage(`Marked as ${PLANNING_STATUS_LABELS[nextStatus]}.`);
    } catch (err) {
      console.error(err);
      setMessage("Failed to update status.");
    }
    setBusy(false);
  }

  async function transitionStatus(proposal: PlanningProposal, next: PlanningProposalStatus) {
    if (!session) return;
    const decisionMap: Partial<Record<PlanningProposalStatus, PlanningApprovalDecision>> = {
      recommended: "recommend",
      approved: "approve",
      returned: "return",
      rejected: "reject",
    };
    const decision = decisionMap[next];
    if (decision) {
      await applyDecision(proposal, decision, next);
      return;
    }
    setBusy(true);
    try {
      await updateProposal(proposal.id, { status: next });
      setMessage(`Status → ${PLANNING_STATUS_LABELS[next]}`);
    } catch (err) {
      console.error(err);
      setMessage("Failed to update status.");
    }
    setBusy(false);
  }

  async function handleApprove(proposal: PlanningProposal) {
    if (!session || !perms.canApprove) return;
    setBusy(true);
    setMessage(null);
    try {
      const note = decisionNote.trim();
      const approval = {
        role: session.role,
        username: session.username,
        decision: "approve" as const,
        at: new Date().toISOString(),
        ...(note ? { note } : {}),
      };

      await updateProposal(proposal.id, {
        status: "approved",
        approvals: [...(proposal.approvals || []), approval],
      });
      setDecisionNote("");
      if (onPinSite) {
        setMessage("Approved — opening map to pin the building site…");
        window.setTimeout(() => onPinSite({ ...proposal, status: "approved" }), 50);
      } else {
        setMessage(
          "Approved. Next: pin the building site on the live map (MPDC).",
        );
      }
    } catch (err) {
      console.error("[Planning] Approve failed:", err);
      const detail =
        err instanceof Error && err.message
          ? err.message
          : "Check Firestore rules / network.";
      setMessage(`Approve failed: ${detail}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddComment() {
    if (!session || !perms.canComment || !selectedId || !commentBody.trim()) return;
    setBusy(true);
    try {
      let anchor: PlanningComment["anchor"] = null;
      if (commentAnchorKind === "section") {
        const label =
          commentSectionLabel === "Other"
            ? commentOtherLabel.trim() || "Other"
            : commentSectionLabel;
        anchor = { kind: "section", label };
      } else if (commentAnchorKind === "map" && selected?.location) {
        anchor = {
          kind: "map",
          label: `${selected.location.lat.toFixed(5)}, ${selected.location.lon.toFixed(5)}`,
        };
      }
      await addComment(selectedId, {
        author: session.username,
        role: session.role,
        body: commentBody.trim(),
        anchor,
      });
      setCommentBody("");
      setCommentAnchorKind("none");
      setCommentOtherLabel("");
    } catch (err) {
      console.error(err);
      setMessage("Failed to post comment.");
    }
    setBusy(false);
  }

  async function handleCastVote(proposal: PlanningProposal, choice: PlanningVoteChoice) {
    if (!session || !perms.canVote) return;
    if (proposal.status === "draft" || proposal.status === "rejected") {
      setMessage("Botohan opens after the proposal is submitted.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const note = voteNote.trim();
      const vote = {
        username: session.username,
        role: session.role,
        choice,
        at: new Date().toISOString(),
        ...(note ? { note } : {}),
      };
      const others = (proposal.votes || []).filter((v) => v.username !== session.username);
      await updateProposal(proposal.id, { votes: [...others, vote] });
      setVoteNote("");
      setMessage(
        choice === "yes"
          ? "Vote recorded: Yes / Sang-ayon"
          : choice === "no"
            ? "Vote recorded: No / Tutol"
            : "Vote recorded: Abstain",
      );
    } catch (err) {
      console.error(err);
      setMessage("Failed to record vote.");
    }
    setBusy(false);
  }

  async function handleCreateEvent() {
    if (!perms.canManageCalendar) return;
    if (!eventTitle.trim() || !eventStart) {
      setMessage("Event title and start are required.");
      return;
    }
    setBusy(true);
    try {
      await createPlanningEvent({
        title: eventTitle.trim(),
        type: eventType,
        startsAt: new Date(eventStart).toISOString(),
        endsAt: new Date(eventEnd || eventStart).toISOString(),
        attendees: eventAttendees
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        proposalIds: eventProposalIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        notes: "",
      });
      setShowEventForm(false);
      setEventTitle("");
      setEventStart("");
      setEventEnd("");
      setEventAttendees("");
      setEventProposalIds("");
      setMessage("Calendar event created.");
    } catch (err) {
      console.error(err);
      setMessage("Failed to create event.");
    }
    setBusy(false);
  }

  async function handleSaveMeeting() {
    if (!perms.canManageMeetings) return;
    if (!meetingTitle.trim() || !meetingHeldAt) {
      setMessage("Meeting title and date are required.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: meetingTitle.trim(),
        heldAt: new Date(meetingHeldAt).toISOString(),
        attendees: meetingAttendees
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        agenda: meetingAgenda,
        minutes: meetingMinutes,
        decisions: meetingDecisions
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        proposalIds: meetingProposalIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        attachments: meetingAttachments,
      };
      if (editingMeetingId) {
        await updatePlanningMeeting(editingMeetingId, payload);
        setMessage("Meeting updated.");
      } else {
        await createPlanningMeeting(payload);
        setMessage("Meeting documented.");
      }
      setShowMeetingForm(false);
      setEditingMeetingId(null);
      setMeetingTitle("");
      setMeetingHeldAt("");
      setMeetingAttendees("");
      setMeetingAgenda("");
      setMeetingMinutes("");
      setMeetingDecisions("");
      setMeetingProposalIds("");
      setMeetingAttachments([]);
    } catch (err) {
      console.error(err);
      setMessage("Failed to save meeting.");
    }
    setBusy(false);
  }

  async function handleMeetingFile(file: File | null) {
    if (!file || !perms.canManageMeetings) return;
    setBusy(true);
    try {
      const result = await uploadPlanningAttachment(file);
      setMeetingAttachments((prev) => [...prev, result.url]);
      setMessage(`Attached ${result.originalName}`);
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : "Attachment upload failed.");
    }
    setBusy(false);
  }

  function openEditMeeting(m: PlanningMeeting) {
    setEditingMeetingId(m.id);
    setMeetingTitle(m.title);
    setMeetingHeldAt(m.heldAt ? m.heldAt.slice(0, 16) : "");
    setMeetingAttendees(m.attendees.join(", "));
    setMeetingAgenda(m.agenda);
    setMeetingMinutes(m.minutes);
    setMeetingDecisions(m.decisions.join("\n"));
    setMeetingProposalIds(m.proposalIds.join(", "));
    setMeetingAttachments(m.attachments || []);
    setShowMeetingForm(true);
  }

  const transitions = selected ? allowedStatusTransitions(selected.status, role) : [];

  return (
    <div className="planning-page">
      <header className="planning-top">
        <div className="planning-top-left">
          <button type="button" className="planning-back" onClick={onBack}>
            ← Map
          </button>
          <div>
            <div className="planning-brand">
              {barangayOnly ? "Infrastructure Requests" : "Collaborative Planning"}
            </div>
            <div className="planning-sub">
              {session
                ? `${session.username} · ${session.role}`
                : "Sign in required"}
            </div>
          </div>
        </div>
        <div className="planning-top-right">
          <div
            className={`planning-live-pill${lastSyncedAt ? " is-live" : ""}`}
            title="Auto-refreshes every 5 seconds for multi-user sync"
          >
            <span className="planning-live-dot" aria-hidden />
            {lastSyncedAt
              ? `Live · ${new Date(lastSyncedAt).toLocaleTimeString()}`
              : "Polling…"}
          </div>
          <ThemeToggle iconOnly />
        </div>
      </header>

      <nav className="planning-tabs">
        {(
          (barangayOnly ? (["board"] as Tab[]) : (["board", "calendar", "meetings"] as Tab[]))
        ).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "board" ? "Workspace" : t === "calendar" ? "Calendar" : "Meetings"}
          </button>
        ))}
      </nav>

      {firestoreDenied && (
        <div className="planning-banner planning-banner-warn" role="alert">
          <div>
            <strong>Firestore permissions missing</strong> for{" "}
            <code>proposals</code>, <code>planningEvents</code>,{" "}
            <code>planningMeetings</code>.
            <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45 }}>
              Firebase Console → project <strong>infa-track</strong> → Firestore → Rules.
              Publish the rules from <code>firestore.rules</code> in this repo (includes those
              collections), or paste matching <code>allow read, write: if true;</code> blocks
              like your existing <code>projects</code> rules.
            </div>
          </div>
          <button type="button" onClick={() => setFirestoreDenied(false)}>
            ×
          </button>
        </div>
      )}

      {message && (
        <div className="planning-banner" role="status">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)}>
            ×
          </button>
        </div>
      )}

      {tab === "board" && (
        <div className={`planning-board-layout${selected ? " has-detail" : ""}`}>
          <section className="planning-board-main">
            <div className="planning-toolbar">
              <input
                className="planning-input"
                placeholder={barangayOnly ? "Search your requests…" : "Search proposals…"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {!barangayOnly && (
              <select
                className="planning-input"
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
              >
                <option value="">All departments</option>
                <option value="MPDC">MPDC</option>
                <option value="Engineering">Engineering</option>
                <option value="Agriculture">Agriculture</option>
                <option value="Negosyo Center">Negosyo Center</option>
              </select>
              )}
              <select
                className="planning-input"
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus((e.target.value || "") as PlanningProposalStatus | "")
                }
              >
                <option value="">All statuses</option>
                {STATUS_COLUMNS.map((s) => (
                  <option key={s} value={s}>
                    {PLANNING_STATUS_WORKSPACE_LABELS[s]}
                  </option>
                ))}
              </select>
              <select
                className="planning-input"
                value={filterBarangay}
                onChange={(e) => setFilterBarangay(e.target.value)}
              >
                <option value="">All barangays</option>
                {BARANGAY_LIST.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              {!barangayOnly && (
              <select
                className="planning-input"
                value={filterKind}
                onChange={(e) =>
                  setFilterKind((e.target.value || "") as PlanningRequestKind | "")
                }
              >
                <option value="">All kinds</option>
                <option value="barangay_request">Barangay request</option>
                <option value="office_proposal">Office proposal</option>
              </select>
              )}
              {perms.canCreate && (
                <button
                  type="button"
                  className="planning-btn primary"
                  onClick={() => setShowCreate(true)}
                >
                  {barangayOnly ? "+ Request infrastructure" : "+ Submit proposal"}
                </button>
              )}
            </div>

            {!selected && !loading && (
              <p className="planning-board-hint">
                {barangayOnly
                  ? "File a barangay infrastructure request. MPDC and Engineering will review, prioritize, and approve it."
                  : "Multi-user workspace — submit proposals, prioritize, review in committee, then approve to create a map project. Cards refresh automatically for other offices."}
              </p>
            )}

            {loading ? (
              <div className="planning-empty">Loading proposals…</div>
            ) : (
              <>
              <div className="planning-columns planning-columns--main">
                {MAIN_PIPELINE.map((status) => (
                  <div key={status} className="planning-column">
                    <div className="planning-column-head">
                      <span
                        className="planning-status-dot"
                        style={{ background: PLANNING_STATUS_COLORS[status] }}
                      />
                      {PLANNING_STATUS_WORKSPACE_LABELS[status]}
                      <span className="planning-count">{byStatus[status].length}</span>
                    </div>
                    <div className="planning-column-body">
                      {byStatus[status].map((p) => (
                        <div
                          key={p.id}
                          className={`planning-card ${selectedId === p.id ? "selected" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedId(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedId(p.id);
                            }
                          }}
                        >
                          <div className="planning-card-title-row">
                            <div className="planning-card-title">{p.title}</div>
                            <span
                              className={`planning-kind-badge ${
                                p.requestKind === "barangay_request" ? "brgy" : "office"
                              }`}
                            >
                              {requestKindLabel(p.requestKind)}
                            </span>
                          </div>
                          <div className="planning-card-meta">
                            {p.department}
                            {p.barangay ? ` · ${p.barangay}` : ""}
                            {p.committeeId
                              ? ` · ${committeeShortLabel(p.committeeId)}`
                              : ""}
                          </div>
                          <div className="planning-card-next">
                            Next: {nextActorHint(p.status).replace(/^Waiting on /, "")}
                          </div>
                          {(() => {
                            const t = tallyVotes(p.votes);
                            if (t.total === 0) return null;
                            return (
                              <div className="planning-card-votes">
                                Botohan · Oo {t.yes} · Hindi {t.no} · Abstain {t.abstain}
                              </div>
                            );
                          })()}
                          <div className="planning-card-foot">
                            <span>Priority P{p.priority}</span>
                            <span>
                              {p.recommendationScore != null
                                ? `Score ${p.recommendationScore}`
                                : p.submitter?.username}
                            </span>
                          </div>
                          {session?.role === "MPDC" &&
                            p.status === "approved" &&
                            !p.linkedProjectId &&
                            onPinSite && (
                              <button
                                type="button"
                                className="planning-card-pin-btn"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onPinSite(p);
                                }}
                              >
                                Pin site on map
                              </button>
                            )}
                          {session?.role === "MPDC" &&
                            (p.status === "recommended" || p.status === "in_review") &&
                            !p.linkedProjectId &&
                            perms.canApprove && (
                              <button
                                type="button"
                                className="planning-card-pin-btn"
                                disabled={busy}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void handleApprove(p);
                                }}
                              >
                                Approve &amp; pin site
                              </button>
                            )}
                        </div>
                      ))}
                      {byStatus[status].length === 0 && (
                        <div className="planning-column-empty">None</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="planning-columns planning-columns--side">
                {SIDE_LANES.map((status) => (
                  <div key={status} className="planning-column planning-column--muted">
                    <div className="planning-column-head">
                      <span
                        className="planning-status-dot"
                        style={{ background: PLANNING_STATUS_COLORS[status] }}
                      />
                      {PLANNING_STATUS_WORKSPACE_LABELS[status]}
                      <span className="planning-count">{byStatus[status].length}</span>
                    </div>
                    <div className="planning-column-body">
                      {byStatus[status].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`planning-card ${selectedId === p.id ? "selected" : ""}`}
                          onClick={() => setSelectedId(p.id)}
                        >
                          <div className="planning-card-title">{p.title}</div>
                          <div className="planning-card-meta">
                            {p.barangay || p.department} · P{p.priority}
                          </div>
                          <div className="planning-card-next">
                            Next: {nextActorHint(p.status).replace(/^Waiting on /, "")}
                          </div>
                        </button>
                      ))}
                      {byStatus[status].length === 0 && (
                        <div className="planning-column-empty">None</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </section>

          {selected && (
          <aside className="planning-detail">
            <div className="planning-detail-top">
              <h2>{selected.title}</h2>
              <button
                type="button"
                className="planning-detail-close"
                aria-label="Close proposal detail"
                onClick={() => setSelectedId(null)}
              >
                ×
              </button>
            </div>
                <div className="planning-detail-meta">
                  <span
                    className="planning-pill"
                    style={{
                      borderColor: PLANNING_STATUS_COLORS[selected.status],
                      color: PLANNING_STATUS_COLORS[selected.status],
                    }}
                  >
                    {PLANNING_STATUS_LABELS[selected.status]}
                  </span>
                  <span
                    className={`planning-kind-badge ${
                      selected.requestKind === "barangay_request" ? "brgy" : "office"
                    }`}
                  >
                    {requestKindLabel(selected.requestKind)}
                  </span>
                  <span>{selected.department}</span>
                  {selected.barangay && <span>{selected.barangay}</span>}
                  {!isNeedsAssessmentComplete(selected.needsAssessment) && (
                    <span className="planning-chip planning-chip-warn">Assessment incomplete</span>
                  )}
                </div>
                <p className="planning-summary">{selected.summary || "No summary."}</p>

                <div className="planning-route">
                  <label>Committee review route</label>
                  <ol className="planning-stepper">
                    {routingStepsForStatus(selected.status).map((step) => (
                      <li key={step.id} className={`planning-step ${step.state}`}>
                        <span className="planning-step-dot" />
                        <span>{step.label}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="planning-next-actor">
                    <strong>Next:</strong> {nextActorHint(selected.status)}
                    {selected.status === "approved" && !selected.linkedProjectId
                      ? " Tap the green button below."
                      : ""}
                  </p>
                </div>

                {perms.canApprove &&
                  (selected.status === "recommended" || selected.status === "in_review") &&
                  !selected.linkedProjectId && (
                    <div className="planning-site-cta">
                      <p>
                        As <strong>MPDC</strong>, approve then pin where the building will stand on
                        the live map.
                      </p>
                      <button
                        type="button"
                        className="planning-btn primary planning-site-cta-btn"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleApprove(selected);
                        }}
                      >
                        Approve &amp; pin site on map
                      </button>
                    </div>
                  )}

                {session?.role === "MPDC" &&
                  selected.status === "approved" &&
                  !selected.linkedProjectId && (
                    <div className="planning-site-cta">
                      <p>
                        Proposal is approved. Click below, then click the map to place the building.
                      </p>
                      <button
                        type="button"
                        className="planning-btn primary planning-site-cta-btn"
                        disabled={busy || !onPinSite}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (onPinSite) onPinSite(selected);
                          else window.alert("Pin mode is only available for MPDC on the live map.");
                        }}
                      >
                        Pin site on map
                      </button>
                    </div>
                  )}

                {selected.status === "approved" && selected.linkedProjectId && (
                  <div className="planning-site-cta is-done">
                    <p>
                      Site already pinned · project <code>{selected.linkedProjectId}</code>
                    </p>
                  </div>
                )}

                {selected.status !== "draft" && selected.status !== "rejected" && (
                  <div className="planning-poll">
                    <label>Botohan — committee poll</label>
                    <p className="planning-muted" style={{ marginTop: 0 }}>
                      Offices vote Yes / No / Abstain. One vote per account (pwedeng palitan).
                    </p>
                    {(() => {
                      const t = tallyVotes(selected.votes);
                      const mine = (selected.votes || []).find(
                        (v) => v.username === session?.username,
                      );
                      return (
                        <>
                          <div className="planning-poll-tally">
                            <span className="planning-poll-yes">Oo / Yes · {t.yes}</span>
                            <span className="planning-poll-no">Hindi / No · {t.no}</span>
                            <span className="planning-poll-abs">Abstain · {t.abstain}</span>
                            <span className="planning-muted">
                              {t.total} vote{t.total === 1 ? "" : "s"}
                            </span>
                          </div>
                          {mine && (
                            <p className="planning-muted">
                              Your vote:{" "}
                              <strong>
                                {mine.choice === "yes"
                                  ? "Yes"
                                  : mine.choice === "no"
                                    ? "No"
                                    : "Abstain"}
                              </strong>
                              {mine.note ? ` — ${mine.note}` : ""}
                            </p>
                          )}
                          {perms.canVote && (
                            <>
                              <input
                                className="planning-input"
                                placeholder="Optional note with your vote"
                                value={voteNote}
                                onChange={(e) => setVoteNote(e.target.value)}
                              />
                              <div className="planning-action-row">
                                <button
                                  type="button"
                                  className={`planning-btn${mine?.choice === "yes" ? " primary" : ""}`}
                                  disabled={busy}
                                  onClick={() => void handleCastVote(selected, "yes")}
                                >
                                  Yes / Sang-ayon
                                </button>
                                <button
                                  type="button"
                                  className={`planning-btn${mine?.choice === "no" ? " danger" : ""}`}
                                  disabled={busy}
                                  onClick={() => void handleCastVote(selected, "no")}
                                >
                                  No / Tutol
                                </button>
                                <button
                                  type="button"
                                  className={`planning-btn${mine?.choice === "abstain" ? " primary" : ""}`}
                                  disabled={busy}
                                  onClick={() => void handleCastVote(selected, "abstain")}
                                >
                                  Abstain
                                </button>
                              </div>
                            </>
                          )}
                          {(selected.votes?.length ?? 0) > 0 && (
                            <ul className="planning-poll-list">
                              {(selected.votes || [])
                                .slice()
                                .sort((a, b) => b.at.localeCompare(a.at))
                                .map((v) => (
                                  <li key={`${v.username}-${v.at}`}>
                                    <strong>{v.username}</strong> ({v.role}) —{" "}
                                    {v.choice === "yes"
                                      ? "Yes"
                                      : v.choice === "no"
                                        ? "No"
                                        : "Abstain"}
                                    {v.note ? ` · ${v.note}` : ""} · {formatWhen(v.at)}
                                  </li>
                                ))}
                            </ul>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {transitions.length > 0 && (
                  <div className="planning-actions planning-actions--workflow">
                    <label>Other status actions</label>
                    <textarea
                      className="planning-input"
                      rows={2}
                      placeholder="Decision note (optional)"
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                    />
                    <div className="planning-action-row">
                      {transitions.map((next) => (
                        <button
                          key={next}
                          type="button"
                          className="planning-btn"
                          disabled={busy}
                          onClick={() => transitionStatus(selected, next)}
                        >
                          → {PLANNING_STATUS_WORKSPACE_LABELS[next]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="planning-comments">
                  <label>Office comments &amp; annotations</label>
                  <div className="planning-comment-list">
                    {comments.length === 0 && (
                      <div className="planning-column-empty">No comments yet.</div>
                    )}
                    {comments.map((c) => (
                      <div key={c.id} className="planning-comment">
                        <div className="planning-comment-head">
                          <strong>{c.author}</strong>
                          <span>{c.role}</span>
                          <span>{formatWhen(c.createdAt)}</span>
                        </div>
                        {c.anchor && (
                          <div className="planning-anchor-badge">
                            {c.anchor.kind === "map" ? "Map" : "Section"}
                            {c.anchor.label ? `: ${c.anchor.label}` : ""}
                          </div>
                        )}
                        <div>{c.body}</div>
                      </div>
                    ))}
                  </div>
                  {perms.canComment && (
                    <div className="planning-comment-compose">
                      <textarea
                        className="planning-input"
                        rows={3}
                        placeholder="Add an inter-office comment…"
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                      />
                      <div className="planning-anchor-row">
                        <label>Annotate</label>
                        <select
                          className="planning-input"
                          value={commentAnchorKind}
                          onChange={(e) =>
                            setCommentAnchorKind(e.target.value as AnchorKind)
                          }
                        >
                          <option value="none">No anchor</option>
                          <option value="section">Section</option>
                          <option value="map">Map location</option>
                        </select>
                        {commentAnchorKind === "section" && (
                          <>
                            <select
                              className="planning-input"
                              value={commentSectionLabel}
                              onChange={(e) => setCommentSectionLabel(e.target.value)}
                            >
                              {SECTION_ANCHORS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            {commentSectionLabel === "Other" && (
                              <input
                                className="planning-input"
                                placeholder="Section label"
                                value={commentOtherLabel}
                                onChange={(e) => setCommentOtherLabel(e.target.value)}
                              />
                            )}
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        className="planning-btn primary"
                        disabled={busy || !commentBody.trim()}
                        onClick={() => handleAddComment()}
                      >
                        Post comment
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="planning-more-toggle"
                  onClick={() => setShowDetailMore((v) => !v)}
                >
                  {showDetailMore ? "Hide more details" : "More details — score, assessment, assignees"}
                </button>

                {showDetailMore && (
                <>
                <div className="planning-recommend">
                  <label>System suggestion</label>
                  <div className="planning-recommend-score">
                    {selected.recommendationScore ?? computeRecommendation(selected).score}
                    <span>/ 100</span>
                  </div>
                  <ul className="planning-recommend-reasons">
                    {(selected.recommendationReasons?.length
                      ? selected.recommendationReasons
                      : computeRecommendation(selected).reasons
                    ).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>

                <div className="planning-needs">
                  <label>Needs assessment</label>
                  {(perms.canRecommend || perms.canAssign) ? (
                    <>
                      <div className="planning-detail-grid">
                        <div>
                          <label>Population served</label>
                          <input
                            className="planning-input"
                            value={needsDraft.populationServed || ""}
                            onChange={(e) =>
                              setNeedsDraft((d) => ({
                                ...d,
                                populationServed: e.target.value,
                              }))
                            }
                            placeholder="e.g. ~800 households"
                          />
                        </div>
                        <div>
                          <label>Hazard exposure *</label>
                          <select
                            className="planning-input"
                            value={needsDraft.hazardExposure || ""}
                            onChange={(e) =>
                              setNeedsDraft((d) => ({
                                ...d,
                                hazardExposure: e.target.value,
                              }))
                            }
                          >
                            <option value="">— Select —</option>
                            <option value="high">High</option>
                            <option value="moderate">Moderate</option>
                            <option value="low">Low</option>
                            <option value="none">None</option>
                          </select>
                        </div>
                        <div className="planning-detail-span">
                          <label>Existing infrastructure</label>
                          <input
                            className="planning-input"
                            value={needsDraft.existingInfra || ""}
                            onChange={(e) =>
                              setNeedsDraft((d) => ({
                                ...d,
                                existingInfra: e.target.value,
                              }))
                            }
                            placeholder="What exists today?"
                          />
                        </div>
                        <div className="planning-detail-span">
                          <label>Urgency note *</label>
                          <textarea
                            className="planning-input"
                            rows={2}
                            value={needsDraft.urgencyNote || ""}
                            onChange={(e) =>
                              setNeedsDraft((d) => ({
                                ...d,
                                urgencyNote: e.target.value,
                              }))
                            }
                            placeholder="Why this needs attention now"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="planning-btn primary"
                        disabled={busy}
                        onClick={() => handleSaveNeeds(selected)}
                      >
                        Save assessment
                      </button>
                      {selected.needsAssessment?.assessedAt && (
                        <p className="planning-muted">
                          Last assessed by {selected.needsAssessment.assessedBy} ·{" "}
                          {formatWhen(selected.needsAssessment.assessedAt)}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="planning-needs-readonly">
                      <div>
                        Population: {selected.needsAssessment?.populationServed || "—"}
                      </div>
                      <div>
                        Hazard: {selected.needsAssessment?.hazardExposure || "—"}
                      </div>
                      <div>
                        Existing: {selected.needsAssessment?.existingInfra || "—"}
                      </div>
                      <div>
                        Urgency: {selected.needsAssessment?.urgencyNote || "—"}
                      </div>
                    </div>
                  )}
                </div>

                <div className="planning-docs">
                  <label>Supporting documents</label>
                  {(selected.attachments?.length ?? 0) === 0 ? (
                    <div className="planning-column-empty">No documents yet.</div>
                  ) : (
                    <ul className="planning-attach-list">
                      {selected.attachments!.map((url) => (
                        <li key={url}>
                          <a href={attachmentHref(url)} target="_blank" rel="noreferrer">
                            {attachmentLabel(url)}
                          </a>
                          {(perms.canComment || perms.canCreate) && (
                            <button
                              type="button"
                              className="planning-btn"
                              disabled={busy}
                              onClick={() => handleRemoveProposalAttachment(selected, url)}
                            >
                              Remove
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(perms.canComment || perms.canCreate) && (
                    <label className="planning-file-btn">
                      <input
                        type="file"
                        hidden
                        disabled={busy}
                        onChange={(e) => {
                          void handleProposalFile(selected, e.target.files?.[0] ?? null);
                          e.target.value = "";
                        }}
                      />
                      Upload document
                    </label>
                  )}
                </div>

                <div className="planning-detail-grid">
                  <div>
                    <label>Priority</label>
                    {perms.canSetPriority ? (
                      <select
                        className="planning-input"
                        value={selected.priority}
                        disabled={busy}
                        onChange={(e) =>
                          handlePriority(
                            selected,
                            Number(e.target.value) as 1 | 2 | 3 | 4 | 5,
                          )
                        }
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n} {n === 1 ? "(highest)" : n === 5 ? "(lowest)" : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div>P{selected.priority}</div>
                    )}
                  </div>
                  <div>
                    <label>Submitter</label>
                    <div>
                      {selected.submitter.username} ({selected.submitter.role})
                    </div>
                  </div>
                  <div>
                    <label>Linked project</label>
                    <div>{selected.linkedProjectId || "—"}</div>
                  </div>
                  <div>
                    <label>Updated</label>
                    <div>{formatWhen(selected.updatedAt)}</div>
                  </div>
                  <div className="planning-detail-span">
                    <label>Committee</label>
                    {perms.canAssign ? (
                      <select
                        className="planning-input"
                        value={selected.committeeId || ""}
                        disabled={busy}
                        onChange={(e) => handleCommitteeChange(selected, e.target.value)}
                      >
                        <option value="">— None —</option>
                        {PLANNING_COMMITTEES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div>{committeeLabel(selected.committeeId) || "—"}</div>
                    )}
                  </div>
                  <div className="planning-detail-span">
                    <label>Assignees</label>
                    {perms.canAssign ? (
                      <div className="planning-check-list planning-check-list--offices">
                        {officeAccounts.map((acc) => {
                          const isMpdc = acc.username === MPDC_ASSIGNEE;
                          return (
                          <label key={acc.username} className="planning-check">
                            <input
                              type="checkbox"
                              checked={
                                isMpdc ||
                                (selected.assignees?.includes(acc.username) ?? false)
                              }
                              disabled={busy || isMpdc}
                              onChange={() => {
                                if (isMpdc) return;
                                handleAssigneesChange(
                                  selected,
                                  toggleAssignee(selected.assignees || [], acc.username),
                                );
                              }}
                            />
                            <span>
                              {acc.label}
                              <span className="planning-check-user">
                                {isMpdc ? " · zoning / review" : ` · ${acc.role}`}
                              </span>
                            </span>
                          </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div>
                        {selected.assignees?.length
                          ? selected.assignees.join(", ")
                          : "—"}
                      </div>
                    )}
                  </div>
                </div>
                </>
                )}

                {selected.approvals?.length > 0 && (
                  <div className="planning-approvals">
                    <label>Approvals / recommendations</label>
                    <ul>
                      {selected.approvals.map((a, i) => (
                        <li key={`${a.at}-${i}`}>
                          <strong>{a.decision}</strong> — {a.username} ({a.role}) ·{" "}
                          {formatWhen(a.at)}
                          {a.note ? ` — ${a.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
          </aside>
          )}
        </div>
      )}

      {tab === "calendar" && (
        <section className="planning-panel">
          <p className="planning-panel-intro">
            Shared planning calendar — committee and review dates linked to proposals. Updates
            refresh automatically for other offices.
          </p>
          <div className="planning-toolbar">
            <button
              type="button"
              className="planning-btn"
              onClick={() => {
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                );
                setSelectedCalDay(null);
              }}
            >
              ←
            </button>
            <strong>
              {calendarMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </strong>
            <button
              type="button"
              className="planning-btn"
              onClick={() => {
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                );
                setSelectedCalDay(null);
              }}
            >
              →
            </button>
            {perms.canManageCalendar && (
              <button
                type="button"
                className="planning-btn primary"
                onClick={() => setShowEventForm(true)}
              >
                + Event
              </button>
            )}
          </div>

          <div className="planning-cal-grid" role="grid" aria-label="Month calendar">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="planning-cal-dow">
                {d}
              </div>
            ))}
            {monthCells.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} className="planning-cal-cell empty" />;
              }
              const dayEvs = monthEvents.filter((ev) => sameCalendarDay(ev.startsAt, cell));
              const isSelected =
                !!selectedCalDay &&
                selectedCalDay.getFullYear() === cell.getFullYear() &&
                selectedCalDay.getMonth() === cell.getMonth() &&
                selectedCalDay.getDate() === cell.getDate();
              const now = new Date();
              const isToday =
                now.getFullYear() === cell.getFullYear() &&
                now.getMonth() === cell.getMonth() &&
                now.getDate() === cell.getDate();
              return (
                <button
                  key={cell.toISOString()}
                  type="button"
                  className={`planning-cal-cell${isSelected ? " selected" : ""}${isToday ? " today" : ""}`}
                  onClick={() => setSelectedCalDay(cell)}
                >
                  <span className="planning-cal-daynum">{cell.getDate()}</span>
                  <div className="planning-cal-dots">
                    {dayEvs.slice(0, 3).map((ev) => (
                      <span
                        key={ev.id}
                        className={`planning-cal-dot type-${ev.type}`}
                        title={ev.title}
                      />
                    ))}
                    {dayEvs.length > 3 && (
                      <span className="planning-cal-more">+{dayEvs.length - 3}</span>
                    )}
                  </div>
                  {dayEvs[0] && (
                    <div className="planning-cal-title" title={dayEvs[0].title}>
                      {dayEvs[0].title}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="planning-event-list">
            <h3 style={{ margin: "12px 0 8px", fontSize: 14 }}>
              {selectedCalDay
                ? `Events on ${selectedCalDay.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}`
                : "Events this month"}
              {selectedCalDay && (
                <button
                  type="button"
                  className="planning-btn"
                  style={{ marginLeft: 8 }}
                  onClick={() => setSelectedCalDay(null)}
                >
                  Show month
                </button>
              )}
            </h3>
            {dayEvents.length === 0 && (
              <div className="planning-empty">No events.</div>
            )}
            {dayEvents.map((ev) => (
              <div key={ev.id} className="planning-event-card">
                <div className="planning-event-type">{ev.type}</div>
                <div className="planning-card-title">{ev.title}</div>
                <div className="planning-card-meta">
                  {formatWhen(ev.startsAt)}
                  {ev.endsAt ? ` → ${formatWhen(ev.endsAt)}` : ""}
                </div>
                {ev.type === "committee" && (
                  <div className="planning-card-meta">Committee meeting</div>
                )}
                {ev.attendees.length > 0 && (
                  <div className="planning-card-meta">Attendees: {ev.attendees.join(", ")}</div>
                )}
                {ev.proposalIds.length > 0 && (
                  <div className="planning-card-meta">
                    Proposals:{" "}
                    {ev.proposalIds
                      .map((id) => {
                        const p = proposals.find((x) => x.id === id);
                        const c = p ? committeeShortLabel(p.committeeId) : null;
                        return c ? `${id} (${c})` : id;
                      })
                      .join(", ")}
                  </div>
                )}
                {perms.canManageCalendar && (
                  <button
                    type="button"
                    className="planning-btn danger"
                    disabled={busy}
                    onClick={() => deletePlanningEvent(ev.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="planning-upcoming">
            <h3>Upcoming (all)</h3>
            {events
              .filter((e) => new Date(e.startsAt).getTime() >= Date.now() - 86400000)
              .slice(0, 12)
              .map((ev) => (
                <div key={ev.id} className="planning-upcoming-row">
                  <span>{formatDay(ev.startsAt)}</span>
                  <strong>{ev.title}</strong>
                  <span>{ev.type}</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {tab === "meetings" && (
        <section className="planning-panel">
          <p className="planning-panel-intro">
            Planning meeting documentation — agenda, minutes, decisions, and attachments. List
            refreshes automatically for multi-user collaboration.
          </p>
          <div className="planning-toolbar">
            <h2 style={{ margin: 0, flex: 1 }}>Meeting documentation</h2>
            {perms.canManageMeetings && (
              <button
                type="button"
                className="planning-btn primary"
                onClick={() => {
                  setEditingMeetingId(null);
                  setMeetingAttachments([]);
                  setShowMeetingForm(true);
                }}
              >
                + Meeting
              </button>
            )}
          </div>
          <div className="planning-meeting-list">
            {meetings.length === 0 && (
              <div className="planning-empty">No meeting records yet.</div>
            )}
            {meetings.map((m) => (
              <article key={m.id} className="planning-meeting-card">
                <header>
                  <h3>{m.title}</h3>
                  <span>{formatWhen(m.heldAt)}</span>
                </header>
                <div className="planning-card-meta">
                  Attendees: {m.attendees.join(", ") || "—"}
                </div>
                {m.proposalIds.length > 0 && (
                  <div className="planning-card-meta">
                    Linked proposals: {m.proposalIds.join(", ")}
                  </div>
                )}
                <div className="planning-meeting-block">
                  <label>Agenda</label>
                  <p>{m.agenda || "—"}</p>
                </div>
                <div className="planning-meeting-block">
                  <label>Minutes</label>
                  <p>{m.minutes || "—"}</p>
                </div>
                {m.decisions.length > 0 && (
                  <div className="planning-meeting-block">
                    <label>Decisions</label>
                    <ul>
                      {m.decisions.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {m.attachments?.length > 0 && (
                  <div className="planning-meeting-block">
                    <label>Attachments</label>
                    <ul className="planning-attach-list">
                      {m.attachments.map((url) => (
                        <li key={url}>
                          <a href={attachmentHref(url)} target="_blank" rel="noreferrer">
                            {attachmentLabel(url)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {perms.canManageMeetings && (
                  <div className="planning-action-row">
                    <button
                      type="button"
                      className="planning-btn"
                      onClick={() => openEditMeeting(m)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="planning-btn danger"
                      disabled={busy}
                      onClick={() => deletePlanningMeeting(m.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {showCreate && (
        <div className="planning-modal-backdrop" onClick={() => setShowCreate(false)}>
          <div
            className="planning-modal planning-modal--tall"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="planning-create-title"
          >
            <div className="planning-modal-head">
              <h2 id="planning-create-title">
                {barangayOnly ? "Request infrastructure" : "Submit proposal"}
              </h2>
            </div>
            <div className="planning-modal-body">
              {barangayOnly ? (
                <p className="planning-board-hint" style={{ margin: "0 0 10px" }}>
                  This goes to MPDC as a <strong>barangay infrastructure request</strong>.
                  Pick the barangay and describe what you need built.
                </p>
              ) : (
                <>
              <label>Request type</label>
              <select
                className="planning-input"
                value={draftRequestKind}
                onChange={(e) =>
                  setDraftRequestKind(e.target.value as PlanningRequestKind)
                }
              >
                <option value="office_proposal">Office proposal</option>
                <option value="barangay_request">Barangay infrastructure request</option>
              </select>
                </>
              )}
              <label>Title</label>
              <input
                className="planning-input"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />
              <label>Summary</label>
              <textarea
                className="planning-input planning-textarea"
                rows={3}
                value={draftSummary}
                onChange={(e) => setDraftSummary(e.target.value)}
              />
              <div className="planning-modal-row">
                <div>
                  <label>
                    Barangay
                    {draftRequestKind === "barangay_request" ? " *" : ""}
                  </label>
                  <select
                    className="planning-input"
                    value={draftBarangay}
                    onChange={(e) => setDraftBarangay(e.target.value)}
                  >
                    <option value="">—</option>
                    {BARANGAY_LIST.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Priority (1 = highest)</label>
                  <select
                    className="planning-input"
                    value={draftPriority}
                    onChange={(e) =>
                      setDraftPriority(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
                    }
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                className="planning-more-toggle"
                onClick={() => setShowCreateMore((v) => !v)}
              >
                {showCreateMore ? "Hide more details" : "More details — committee, assignees, documents"}
              </button>

              {showCreateMore && (
              <>
              <label>Committee</label>
              <select
                className="planning-input"
                value={draftCommitteeId}
                onChange={(e) => setDraftCommitteeId(e.target.value)}
              >
                <option value="">— None —</option>
                {PLANNING_COMMITTEES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <label>Assignees</label>
              <p className="planning-board-hint" style={{ margin: "0 0 8px" }}>
                MPDC is assigned automatically — they handle zoning and siting review.
                Other offices are optional.
              </p>
              <div className="planning-check-list planning-check-list--offices">
                {officeAccounts.map((acc) => {
                  const isMpdc = acc.username === MPDC_ASSIGNEE;
                  return (
                  <label key={acc.username} className="planning-check">
                    <input
                      type="checkbox"
                      checked={isMpdc || draftAssignees.includes(acc.username)}
                      disabled={isMpdc}
                      onChange={() => {
                        if (isMpdc) return;
                        setDraftAssignees((prev) =>
                          withMpdcAssignee(toggleAssignee(prev, acc.username)),
                        );
                      }}
                    />
                    <span>
                      {acc.label}
                      <span className="planning-check-user">
                        {isMpdc ? " · zoning / review" : ` · ${acc.role}`}
                      </span>
                    </span>
                  </label>
                  );
                })}
              </div>
              <label>Supporting documents (optional)</label>
              {draftAttachments.length > 0 && (
                <ul className="planning-attach-list">
                  {draftAttachments.map((url) => (
                    <li key={url}>
                      <a href={attachmentHref(url)} target="_blank" rel="noreferrer">
                        {attachmentLabel(url)}
                      </a>
                      <button
                        type="button"
                        className="planning-btn"
                        onClick={() =>
                          setDraftAttachments((prev) => prev.filter((u) => u !== url))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="planning-file-btn">
                <input
                  type="file"
                  hidden
                  disabled={busy}
                  onChange={(e) => {
                    void handleDraftFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                Attach file
              </label>
              </>
              )}
            </div>
            <div className="planning-modal-foot">
              <div className="planning-action-row">
                <button
                  type="button"
                  className="planning-btn"
                  disabled={busy}
                  onClick={() => handleCreateProposal(false)}
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className="planning-btn primary"
                  disabled={busy}
                  onClick={() => handleCreateProposal(true)}
                >
                  {barangayOnly ? "Submit request" : "Submit"}
                </button>
                <button
                  type="button"
                  className="planning-btn"
                  onClick={() => {
                    setShowCreate(false);
                    setShowCreateMore(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEventForm && (
        <div className="planning-modal-backdrop" onClick={() => setShowEventForm(false)}>
          <div className="planning-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Calendar event</h2>
            <label>Title</label>
            <input
              className="planning-input"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
            />
            <label>Type</label>
            <select
              className="planning-input"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as PlanningEventType)}
            >
              <option value="committee">Committee</option>
              <option value="hearing">Hearing</option>
              <option value="deadline">Deadline</option>
              <option value="site">Site visit</option>
            </select>
            <label>Starts</label>
            <input
              className="planning-input"
              type="datetime-local"
              value={eventStart}
              onChange={(e) => setEventStart(e.target.value)}
            />
            <label>Ends</label>
            <input
              className="planning-input"
              type="datetime-local"
              value={eventEnd}
              onChange={(e) => setEventEnd(e.target.value)}
            />
            <label>Attendees (comma-separated)</label>
            <input
              className="planning-input"
              value={eventAttendees}
              onChange={(e) => setEventAttendees(e.target.value)}
            />
            <label>Proposal IDs (comma-separated)</label>
            <input
              className="planning-input"
              value={eventProposalIds}
              onChange={(e) => setEventProposalIds(e.target.value)}
              placeholder={selectedId || ""}
            />
            <div className="planning-action-row">
              <button
                type="button"
                className="planning-btn primary"
                disabled={busy}
                onClick={handleCreateEvent}
              >
                Create
              </button>
              <button type="button" className="planning-btn" onClick={() => setShowEventForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showMeetingForm && (
        <div className="planning-modal-backdrop" onClick={() => setShowMeetingForm(false)}>
          <div className="planning-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingMeetingId ? "Edit meeting" : "Document meeting"}</h2>
            <label>Title</label>
            <input
              className="planning-input"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
            />
            <label>Held at</label>
            <input
              className="planning-input"
              type="datetime-local"
              value={meetingHeldAt}
              onChange={(e) => setMeetingHeldAt(e.target.value)}
            />
            <label>Attendees (comma-separated)</label>
            <input
              className="planning-input"
              value={meetingAttendees}
              onChange={(e) => setMeetingAttendees(e.target.value)}
            />
            <label>Agenda</label>
            <textarea
              className="planning-input"
              rows={3}
              value={meetingAgenda}
              onChange={(e) => setMeetingAgenda(e.target.value)}
            />
            <label>Minutes</label>
            <textarea
              className="planning-input"
              rows={4}
              value={meetingMinutes}
              onChange={(e) => setMeetingMinutes(e.target.value)}
            />
            <label>Decisions (one per line)</label>
            <textarea
              className="planning-input"
              rows={3}
              value={meetingDecisions}
              onChange={(e) => setMeetingDecisions(e.target.value)}
            />
            <label>Linked proposal IDs (comma-separated)</label>
            <input
              className="planning-input"
              value={meetingProposalIds}
              onChange={(e) => setMeetingProposalIds(e.target.value)}
            />
            <label>Attachments</label>
            <div className="planning-attach-compose">
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void handleMeetingFile(f);
                }}
              />
              {meetingAttachments.length > 0 && (
                <ul className="planning-attach-list">
                  {meetingAttachments.map((url) => (
                    <li key={url}>
                      <a href={attachmentHref(url)} target="_blank" rel="noreferrer">
                        {attachmentLabel(url)}
                      </a>
                      <button
                        type="button"
                        className="planning-btn danger"
                        onClick={() =>
                          setMeetingAttachments((prev) => prev.filter((u) => u !== url))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="planning-action-row">
              <button
                type="button"
                className="planning-btn primary"
                disabled={busy}
                onClick={handleSaveMeeting}
              >
                Save
              </button>
              <button
                type="button"
                className="planning-btn"
                onClick={() => {
                  setShowMeetingForm(false);
                  setMeetingAttachments([]);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
