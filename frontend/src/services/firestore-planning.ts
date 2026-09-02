import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  db,
  planningEventsCollection,
  planningMeetingsCollection,
  proposalsCollection,
} from "../firebase";
import type {
  PlanningApproval,
  PlanningComment,
  PlanningEvent,
  PlanningMeeting,
  PlanningNeedsAssessment,
  PlanningProposal,
  PlanningRequestKind,
  PlanningVote,
} from "../types";
import { backendUrl } from "../lib/api";
import { computeRecommendation } from "../lib/planning-recommend";
import { writeAudit } from "./firestore-audit";

function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item));
  }
  const cleaned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue;
    cleaned[key] = stripUndefinedDeep(entry);
  }
  return cleaned;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return stripUndefinedDeep(obj) as Record<string, unknown>;
}

async function notifyPlanningUpdate(kind: string) {
  try {
    await fetch(backendUrl("/api/planning/notify"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, at: new Date().toISOString() }),
    });
  } catch {
    /* backend optional for Firestore-first planning */
  }
}

function mapNeeds(raw: unknown): PlanningNeedsAssessment | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  return {
    populationServed: d.populationServed ? String(d.populationServed) : undefined,
    hazardExposure: d.hazardExposure ? String(d.hazardExposure) : undefined,
    existingInfra: d.existingInfra ? String(d.existingInfra) : undefined,
    urgencyNote: d.urgencyNote ? String(d.urgencyNote) : undefined,
    assessedBy: d.assessedBy ? String(d.assessedBy) : undefined,
    assessedAt: d.assessedAt ? String(d.assessedAt) : undefined,
  };
}

function mapProposal(id: string, data: Record<string, unknown>): PlanningProposal {
  const requestKind = (data.requestKind as PlanningRequestKind) || "office_proposal";
  const needsAssessment = mapNeeds(data.needsAssessment);
  const base: PlanningProposal = {
    id,
    title: String(data.title ?? ""),
    summary: String(data.summary ?? ""),
    department: (data.department as PlanningProposal["department"]) ?? "MPDC",
    barangay: data.barangay ? String(data.barangay) : undefined,
    priority: (Number(data.priority) || 3) as PlanningProposal["priority"],
    status: (data.status as PlanningProposal["status"]) ?? "draft",
    linkedProjectId: (data.linkedProjectId as string | null) ?? null,
    location: (data.location as PlanningProposal["location"]) ?? null,
    submitter: (data.submitter as PlanningProposal["submitter"]) ?? {
      username: "unknown",
      role: "MPDC",
    },
    assignees: Array.isArray(data.assignees) ? (data.assignees as string[]) : [],
    committeeId: (data.committeeId as string | null) ?? null,
    approvals: Array.isArray(data.approvals) ? (data.approvals as PlanningApproval[]) : [],
    votes: Array.isArray(data.votes) ? (data.votes as PlanningVote[]) : [],
    requestKind,
    needsAssessment,
    recommendationScore:
      data.recommendationScore != null ? Number(data.recommendationScore) : null,
    recommendationReasons: Array.isArray(data.recommendationReasons)
      ? (data.recommendationReasons as string[])
      : [],
    attachments: Array.isArray(data.attachments) ? (data.attachments as string[]) : [],
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
  };

  // Backfill score for older docs missing it
  if (base.recommendationScore == null) {
    const rec = computeRecommendation(base);
    base.recommendationScore = rec.score;
    base.recommendationReasons = rec.reasons;
  }
  return base;
}

export function subscribeToProposals(
  callback: (proposals: PlanningProposal[]) => void,
  onError?: (message: string) => void,
) {
  return onSnapshot(
    proposalsCollection,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapProposal(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      callback(list);
    },
    (err) => {
      console.error("[Firestore] subscribeToProposals:", err.message);
      onError?.(err.message);
      callback([]);
    },
  );
}

/** One-shot fetch for Board polling (same shape as subscribeToProposals). */
export async function fetchProposalsOnce(): Promise<PlanningProposal[]> {
  const snapshot = await getDocs(proposalsCollection);
  return snapshot.docs
    .map((d) => mapProposal(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function createProposal(
  input: Omit<PlanningProposal, "id" | "createdAt" | "updatedAt" | "approvals"> & {
    approvals?: PlanningApproval[];
  },
): Promise<PlanningProposal> {
  const now = new Date().toISOString();
  const withDefaults: PlanningProposal = {
    ...input,
    id: "pending",
    approvals: input.approvals ?? [],
    votes: input.votes ?? [],
    requestKind: input.requestKind ?? "office_proposal",
    needsAssessment: input.needsAssessment ?? null,
    attachments: input.attachments ?? [],
    createdAt: now,
    updatedAt: now,
  };
  const rec = computeRecommendation(withDefaults);
  const payload = stripUndefined({
    ...input,
    approvals: input.approvals ?? [],
    votes: input.votes ?? [],
    linkedProjectId: input.linkedProjectId ?? null,
    location: input.location ?? null,
    committeeId: input.committeeId ?? null,
    requestKind: input.requestKind ?? "office_proposal",
    needsAssessment: input.needsAssessment ?? null,
    attachments: input.attachments ?? [],
    recommendationScore: rec.score,
    recommendationReasons: rec.reasons,
    createdAt: now,
    updatedAt: now,
  });
  const ref = await addDoc(proposalsCollection, payload);
  await notifyPlanningUpdate("proposal:create");
  void writeAudit({
    action: "planning.create",
    category: "planning",
    summary: `Created proposal “${input.title || ref.id}”`,
    entityType: "proposal",
    entityId: ref.id,
    entityName: input.title,
  });
  return mapProposal(ref.id, payload);
}

export async function updateProposal(
  id: string,
  patch: Partial<PlanningProposal>,
): Promise<void> {
  if (!id) throw new Error("Missing proposal id");
  const ref = doc(db, "proposals", id);
  const data = stripUndefined({
    ...patch,
    updatedAt: new Date().toISOString(),
  }) as Record<string, unknown>;
  delete data.id;
  // Firestore rejects nested `undefined` (e.g. empty approval.note).
  await updateDoc(ref, data);
  await notifyPlanningUpdate("proposal:update");
  void writeAudit({
    action: patch.status ? "planning.status" : "planning.update",
    category: "planning",
    summary: patch.status
      ? `Proposal ${id} status → ${patch.status}`
      : `Updated proposal ${id}`,
    entityType: "proposal",
    entityId: id,
    entityName: patch.title,
  });
}

export async function deleteProposal(id: string): Promise<void> {
  await deleteDoc(doc(db, "proposals", id));
  await notifyPlanningUpdate("proposal:delete");
  void writeAudit({
    action: "planning.delete",
    category: "planning",
    summary: `Deleted proposal ${id}`,
    entityType: "proposal",
    entityId: id,
  });
}

export function subscribeToComments(
  proposalId: string,
  callback: (comments: PlanningComment[]) => void,
) {
  const commentsRef = collection(db, "proposals", proposalId, "comments");
  const q = query(commentsRef, orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            author: String(data.author ?? ""),
            role: String(data.role ?? ""),
            body: String(data.body ?? ""),
            createdAt: String(data.createdAt ?? ""),
            anchor: data.anchor ?? null,
          } satisfies PlanningComment;
        }),
      );
    },
    (err) => {
      console.error("[Firestore] subscribeToComments:", err.message);
      callback([]);
    },
  );
}

export async function fetchCommentsOnce(proposalId: string): Promise<PlanningComment[]> {
  const commentsRef = collection(db, "proposals", proposalId, "comments");
  const q = query(commentsRef, orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      author: String(data.author ?? ""),
      role: String(data.role ?? ""),
      body: String(data.body ?? ""),
      createdAt: String(data.createdAt ?? ""),
      anchor: data.anchor ?? null,
    } satisfies PlanningComment;
  });
}

export async function addComment(
  proposalId: string,
  comment: Omit<PlanningComment, "id" | "createdAt"> & { createdAt?: string },
): Promise<void> {
  const commentsRef = collection(db, "proposals", proposalId, "comments");
  await addDoc(commentsRef, {
    author: comment.author,
    role: comment.role,
    body: comment.body,
    anchor: comment.anchor ?? null,
    createdAt: comment.createdAt ?? new Date().toISOString(),
    _ts: serverTimestamp(),
  });
  await updateDoc(doc(db, "proposals", proposalId), {
    updatedAt: new Date().toISOString(),
  });
  await notifyPlanningUpdate("comment:create");
}

function mapEvent(id: string, data: Record<string, unknown>): PlanningEvent {
  return {
    id,
    title: String(data.title ?? ""),
    startsAt: String(data.startsAt ?? ""),
    endsAt: String(data.endsAt ?? ""),
    type: (data.type as PlanningEvent["type"]) ?? "committee",
    proposalIds: Array.isArray(data.proposalIds) ? (data.proposalIds as string[]) : [],
    attendees: Array.isArray(data.attendees) ? (data.attendees as string[]) : [],
    notes: data.notes ? String(data.notes) : undefined,
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
  };
}

export function subscribeToPlanningEvents(
  callback: (events: PlanningEvent[]) => void,
  onError?: (message: string) => void,
) {
  return onSnapshot(
    planningEventsCollection,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapEvent(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (a.startsAt || "").localeCompare(b.startsAt || ""));
      callback(list);
    },
    (err) => {
      console.error("[Firestore] subscribeToPlanningEvents:", err.message);
      onError?.(err.message);
      callback([]);
    },
  );
}

export async function fetchPlanningEventsOnce(): Promise<PlanningEvent[]> {
  const snapshot = await getDocs(planningEventsCollection);
  return snapshot.docs
    .map((d) => mapEvent(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => (a.startsAt || "").localeCompare(b.startsAt || ""));
}

export async function createPlanningEvent(
  input: Omit<PlanningEvent, "id" | "createdAt" | "updatedAt">,
): Promise<PlanningEvent> {
  const now = new Date().toISOString();
  const payload = stripUndefined({ ...input, createdAt: now, updatedAt: now });
  const ref = await addDoc(planningEventsCollection, payload);
  await notifyPlanningUpdate("event:create");
  return mapEvent(ref.id, payload);
}

export async function updatePlanningEvent(
  id: string,
  patch: Partial<PlanningEvent>,
): Promise<void> {
  const data = stripUndefined({ ...patch, updatedAt: new Date().toISOString() });
  delete data.id;
  await updateDoc(doc(db, "planningEvents", id), data);
  await notifyPlanningUpdate("event:update");
}

export async function deletePlanningEvent(id: string): Promise<void> {
  await deleteDoc(doc(db, "planningEvents", id));
  await notifyPlanningUpdate("event:delete");
}

function mapMeeting(id: string, data: Record<string, unknown>): PlanningMeeting {
  return {
    id,
    title: String(data.title ?? ""),
    heldAt: String(data.heldAt ?? ""),
    attendees: Array.isArray(data.attendees) ? (data.attendees as string[]) : [],
    agenda: String(data.agenda ?? ""),
    minutes: String(data.minutes ?? ""),
    decisions: Array.isArray(data.decisions) ? (data.decisions as string[]) : [],
    proposalIds: Array.isArray(data.proposalIds) ? (data.proposalIds as string[]) : [],
    attachments: Array.isArray(data.attachments) ? (data.attachments as string[]) : [],
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
  };
}

export function subscribeToPlanningMeetings(
  callback: (meetings: PlanningMeeting[]) => void,
  onError?: (message: string) => void,
) {
  return onSnapshot(
    planningMeetingsCollection,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapMeeting(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.heldAt || "").localeCompare(a.heldAt || ""));
      callback(list);
    },
    (err) => {
      console.error("[Firestore] subscribeToPlanningMeetings:", err.message);
      onError?.(err.message);
      callback([]);
    },
  );
}

export async function fetchPlanningMeetingsOnce(): Promise<PlanningMeeting[]> {
  const snapshot = await getDocs(planningMeetingsCollection);
  return snapshot.docs
    .map((d) => mapMeeting(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => (b.heldAt || "").localeCompare(a.heldAt || ""));
}

export async function createPlanningMeeting(
  input: Omit<PlanningMeeting, "id" | "createdAt" | "updatedAt">,
): Promise<PlanningMeeting> {
  const now = new Date().toISOString();
  const payload = stripUndefined({ ...input, createdAt: now, updatedAt: now });
  const ref = await addDoc(planningMeetingsCollection, payload);
  await notifyPlanningUpdate("meeting:create");
  return mapMeeting(ref.id, payload);
}

export async function updatePlanningMeeting(
  id: string,
  patch: Partial<PlanningMeeting>,
): Promise<void> {
  const data = stripUndefined({ ...patch, updatedAt: new Date().toISOString() });
  delete data.id;
  await updateDoc(doc(db, "planningMeetings", id), data);
  await notifyPlanningUpdate("meeting:update");
}

export async function deletePlanningMeeting(id: string): Promise<void> {
  await deleteDoc(doc(db, "planningMeetings", id));
  await notifyPlanningUpdate("meeting:delete");
}

export async function setProposalDoc(id: string, proposal: PlanningProposal): Promise<void> {
  await setDoc(doc(db, "proposals", id), stripUndefined({ ...proposal, id }));
}
