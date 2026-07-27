import { useEffect, useMemo, useState } from "react";
import type {
  PlanningApprovalDecision,
  PlanningEvent,
  PlanningEventType,
  PlanningMeeting,
  PlanningProposal,
  PlanningProposalStatus,
  Project,
} from "../types";
import {
  BARANGAY_LIST,
  PLANNING_STATUS_COLORS,
  PLANNING_STATUS_LABELS,
} from "../types";
import type { SessionUser } from "../services/auth";
import {
  addComment,
  createPlanningEvent,
  createPlanningMeeting,
  createProposal,
  deletePlanningEvent,
  deletePlanningMeeting,
  subscribeToComments,
  subscribeToPlanningEvents,
  subscribeToPlanningMeetings,
  subscribeToProposals,
  updatePlanningMeeting,
  updateProposal,
} from "../services/firestore-planning";
import { addProjectToFirestore } from "../services/firestore-projects";
import { backendUrl } from "../lib/api";
import {
  allowedStatusTransitions,
  departmentForRole,
  getPlanningPermissions,
} from "../lib/planning-permissions";
import { ThemeToggle } from "./ThemeToggle";
import "./PlanningPage.css";

type Tab = "board" | "calendar" | "meetings";

type Props = {
  onBack: () => void;
  session: SessionUser | null;
};

const STATUS_COLUMNS: PlanningProposalStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "recommended",
  "approved",
  "returned",
  "rejected",
];

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

export default function PlanningPage({ onBack, session }: Props) {
  const role = session?.role ?? null;
  const perms = getPlanningPermissions(role);

  const [tab, setTab] = useState<Tab>("board");
  const [proposals, setProposals] = useState<PlanningProposal[]>([]);
  const [events, setEvents] = useState<PlanningEvent[]>([]);
  const [meetings, setMeetings] = useState<PlanningMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterDept, setFilterDept] = useState("");
  const [filterStatus, setFilterStatus] = useState<PlanningProposalStatus | "">("");
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<{ id: string; author: string; role: string; body: string; createdAt: string }[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftBarangay, setDraftBarangay] = useState("");
  const [draftPriority, setDraftPriority] = useState<1 | 2 | 3 | 4 | 5>(3);

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
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [firestoreDenied, setFirestoreDenied] = useState(false);

  useEffect(() => {
    const onPerm = (msg: string) => {
      if (/permission|insufficient/i.test(msg)) setFirestoreDenied(true);
    };
    const unsub = subscribeToProposals((list) => {
      setProposals(list);
      setLoading(false);
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

  const selected = useMemo(
    () => proposals.find((p) => p.id === selectedId) ?? null,
    [proposals, selectedId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proposals.filter((p) => {
      if (filterDept && p.department !== filterDept) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        (p.barangay || "").toLowerCase().includes(q)
      );
    });
  }, [proposals, filterDept, filterStatus, search]);

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

  async function handleCreateProposal(submit: boolean) {
    if (!session || !perms.canCreate) return;
    if (!draftTitle.trim()) {
      setMessage("Title is required.");
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
        assignees: [],
        committeeId: null,
      });
      setShowCreate(false);
      setDraftTitle("");
      setDraftSummary("");
      setDraftBarangay("");
      setDraftPriority(3);
      setSelectedId(created.id);
      setMessage(submit ? "Proposal submitted." : "Draft saved.");
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

  async function handlePriority(proposal: PlanningProposal, priority: 1 | 2 | 3 | 4 | 5) {
    if (!perms.canSetPriority) return;
    setBusy(true);
    try {
      await updateProposal(proposal.id, { priority });
    } catch (err) {
      console.error(err);
      setMessage("Failed to update priority.");
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
      const approval = {
        role: session.role,
        username: session.username,
        decision,
        note: decisionNote.trim() || undefined,
        at: new Date().toISOString(),
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

  async function handleApproveAndLink(proposal: PlanningProposal) {
    if (!session || !perms.canApprove) return;
    setBusy(true);
    setMessage(null);
    try {
      const approval = {
        role: session.role,
        username: session.username,
        decision: "approve" as const,
        note: decisionNote.trim() || undefined,
        at: new Date().toISOString(),
      };

      const now = new Date().toISOString();
      const fallbackProject: Project = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `plan-${Date.now()}`,
        name: proposal.title,
        modelType: "office",
        type: "Municipal Project",
        department: proposal.department,
        status: "Planned",
        progress: 0,
        location: proposal.location ?? { lat: 14.185, lon: 121.51 },
        description: proposal.summary,
        barangay: proposal.barangay,
        lifecyclePhase: "Planning",
        milestones: [],
        issues: [],
        photos: [],
        activityLog: [
          {
            at: now,
            message: `Created from planning proposal (${proposal.id}) by ${session.username}.`,
          },
        ],
        updatedAt: now,
      };

      let linkedId = fallbackProject.id;
      try {
        const res = await fetch(backendUrl("/api/projects"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fallbackProject.name,
            modelType: fallbackProject.modelType,
            type: fallbackProject.type,
            department: fallbackProject.department,
            status: "Planned",
            progress: 0,
            description: fallbackProject.description,
            location: fallbackProject.location,
            barangay: fallbackProject.barangay,
          }),
        });
        if (res.ok) {
          const { project } = await res.json();
          linkedId = project.id;
          addProjectToFirestore(project).catch(() => undefined);
        } else {
          await addProjectToFirestore(fallbackProject);
        }
      } catch {
        await addProjectToFirestore(fallbackProject);
      }

      await updateProposal(proposal.id, {
        status: "approved",
        linkedProjectId: linkedId,
        approvals: [...(proposal.approvals || []), approval],
      });
      setDecisionNote("");
      setMessage(`Approved and linked project ${linkedId}.`);
    } catch (err) {
      console.error(err);
      setMessage("Approve / link failed.");
    }
    setBusy(false);
  }

  async function handleAddComment() {
    if (!session || !perms.canComment || !selectedId || !commentBody.trim()) return;
    setBusy(true);
    try {
      await addComment(selectedId, {
        author: session.username,
        role: session.role,
        body: commentBody.trim(),
      });
      setCommentBody("");
    } catch (err) {
      console.error(err);
      setMessage("Failed to post comment.");
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
        attachments: [] as string[],
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
    } catch (err) {
      console.error(err);
      setMessage("Failed to save meeting.");
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
            <div className="planning-brand">Collaborative Planning</div>
            <div className="planning-sub">
              {session
                ? `${session.username} · ${session.role}`
                : "Sign in required"}
            </div>
          </div>
        </div>
        <div className="planning-top-right">
          <ThemeToggle iconOnly />
        </div>
      </header>

      <nav className="planning-tabs">
        {(["board", "calendar", "meetings"] as Tab[]).map((t) => (
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
                placeholder="Search proposals…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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
                    {PLANNING_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              {perms.canCreate && (
                <button
                  type="button"
                  className="planning-btn primary"
                  onClick={() => setShowCreate(true)}
                >
                  + New proposal
                </button>
              )}
            </div>

            {!selected && !loading && (
              <p className="planning-board-hint">
                Select a proposal card to open review, comments, and approval actions.
              </p>
            )}

            {loading ? (
              <div className="planning-empty">Loading proposals…</div>
            ) : (
              <div className="planning-columns">
                {STATUS_COLUMNS.map((status) => (
                  <div key={status} className="planning-column">
                    <div className="planning-column-head">
                      <span
                        className="planning-status-dot"
                        style={{ background: PLANNING_STATUS_COLORS[status] }}
                      />
                      {PLANNING_STATUS_LABELS[status]}
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
                            {p.department}
                            {p.barangay ? ` · ${p.barangay}` : ""}
                          </div>
                          <div className="planning-card-foot">
                            <span>P{p.priority}</span>
                            <span>{p.submitter?.username}</span>
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
                  <span>{selected.department}</span>
                  {selected.barangay && <span>{selected.barangay}</span>}
                </div>
                <p className="planning-summary">{selected.summary || "No summary."}</p>
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
                </div>

                {(transitions.length > 0 ||
                  (perms.canApprove &&
                    (selected.status === "recommended" || selected.status === "in_review"))) && (
                  <div className="planning-actions">
                    <label>Workflow</label>
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
                          → {PLANNING_STATUS_LABELS[next]}
                        </button>
                      ))}
                      {perms.canApprove &&
                        (selected.status === "recommended" ||
                          selected.status === "in_review") &&
                        !selected.linkedProjectId && (
                          <button
                            type="button"
                            className="planning-btn primary"
                            disabled={busy}
                            onClick={() => handleApproveAndLink(selected)}
                          >
                            Approve & create project
                          </button>
                        )}
                    </div>
                  </div>
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

                <div className="planning-comments">
                  <label>Comments</label>
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
                      <button
                        type="button"
                        className="planning-btn primary"
                        disabled={busy || !commentBody.trim()}
                        onClick={handleAddComment}
                      >
                        Post comment
                      </button>
                    </div>
                  )}
                </div>
          </aside>
          )}
        </div>
      )}

      {tab === "calendar" && (
        <section className="planning-panel">
          <div className="planning-toolbar">
            <button
              type="button"
              className="planning-btn"
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                )
              }
            >
              ←
            </button>
            <strong>
              {calendarMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </strong>
            <button
              type="button"
              className="planning-btn"
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                )
              }
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
          <div className="planning-event-list">
            {monthEvents.length === 0 && (
              <div className="planning-empty">No events this month.</div>
            )}
            {monthEvents.map((ev) => (
              <div key={ev.id} className="planning-event-card">
                <div className="planning-event-type">{ev.type}</div>
                <div className="planning-card-title">{ev.title}</div>
                <div className="planning-card-meta">
                  {formatWhen(ev.startsAt)}
                  {ev.endsAt ? ` → ${formatWhen(ev.endsAt)}` : ""}
                </div>
                {ev.attendees.length > 0 && (
                  <div className="planning-card-meta">Attendees: {ev.attendees.join(", ")}</div>
                )}
                {ev.proposalIds.length > 0 && (
                  <div className="planning-card-meta">
                    Proposals: {ev.proposalIds.join(", ")}
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
          <div className="planning-toolbar">
            <h2 style={{ margin: 0, flex: 1 }}>Meeting documentation</h2>
            {perms.canManageMeetings && (
              <button
                type="button"
                className="planning-btn primary"
                onClick={() => {
                  setEditingMeetingId(null);
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
          <div className="planning-modal" onClick={(e) => e.stopPropagation()}>
            <h2>New planning proposal</h2>
            <label>Title</label>
            <input
              className="planning-input"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
            />
            <label>Summary</label>
            <textarea
              className="planning-input"
              rows={4}
              value={draftSummary}
              onChange={(e) => setDraftSummary(e.target.value)}
            />
            <label>Barangay</label>
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
            <label>Priority (1 = highest)</label>
            <select
              className="planning-input"
              value={draftPriority}
              onChange={(e) => setDraftPriority(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
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
                Submit
              </button>
              <button type="button" className="planning-btn" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
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
                onClick={() => setShowMeetingForm(false)}
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
