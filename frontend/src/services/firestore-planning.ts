import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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
  PlanningProposal,
} from "../types";
import { backendUrl } from "../lib/api";

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
}

async function notifyPlanningUpdate(kind: string) {
  try {
    await fetch(backendUrl("/api/planning/notify"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, at: new Date().toISOString() }),
    });
  } catch {
    /* backend optional for Firestore-first planning */
  }
}

function mapProposal(id: string, data: Record<string, unknown>): PlanningProposal {
  return {
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
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
  };
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

export async function createProposal(
  input: Omit<PlanningProposal, "id" | "createdAt" | "updatedAt" | "approvals"> & {
    approvals?: PlanningApproval[];
  },
): Promise<PlanningProposal> {
  const now = new Date().toISOString();
  const payload = stripUndefined({
    ...input,
    approvals: input.approvals ?? [],
    linkedProjectId: input.linkedProjectId ?? null,
    location: input.location ?? null,
    committeeId: input.committeeId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const ref = await addDoc(proposalsCollection, payload);
  await notifyPlanningUpdate("proposal:create");
  return mapProposal(ref.id, payload);
}

export async function updateProposal(
  id: string,
  patch: Partial<PlanningProposal>,
): Promise<void> {
  const ref = doc(db, "proposals", id);
  const data = stripUndefined({
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  delete data.id;
  await updateDoc(ref, data);
  await notifyPlanningUpdate("proposal:update");
}

export async function deleteProposal(id: string): Promise<void> {
  await deleteDoc(doc(db, "proposals", id));
  await notifyPlanningUpdate("proposal:delete");
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
