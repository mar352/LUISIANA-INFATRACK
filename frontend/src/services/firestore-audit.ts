import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";

export type AuditCategory = "auth" | "project" | "planning" | "document" | "engagement" | "system";

export type AuditActor = {
  username: string;
  role: string;
  department?: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  username: string;
  role: string;
  department: string;
  action: string;
  category: AuditCategory;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  summary: string;
};

export type WriteAuditInput = {
  action: string;
  category: AuditCategory;
  summary: string;
  actor?: AuditActor | null;
  entityType?: string;
  entityId?: string;
  entityName?: string;
};

let currentActor: AuditActor | null = null;

export function setAuditActor(actor: AuditActor | null) {
  currentActor = actor;
}

export function getAuditActor(): AuditActor | null {
  return currentActor;
}

export const auditLogsCollection = collection(db, "auditLogs");

export async function writeAudit(input: WriteAuditInput): Promise<void> {
  const actor = input.actor ?? currentActor;
  try {
    await addDoc(auditLogsCollection, {
      at: new Date().toISOString(),
      username: actor?.username || "system",
      role: actor?.role || "system",
      department: actor?.department || "",
      action: input.action,
      category: input.category,
      entityType: input.entityType || "",
      entityId: input.entityId || "",
      entityName: input.entityName || "",
      summary: input.summary,
    });
  } catch (err) {
    console.warn("[Audit] write failed:", err);
  }
}

function mapEvent(id: string, data: Record<string, unknown>): AuditEvent {
  return {
    id,
    at: String(data.at ?? ""),
    username: String(data.username ?? ""),
    role: String(data.role ?? ""),
    department: String(data.department ?? ""),
    action: String(data.action ?? ""),
    category: (data.category as AuditCategory) || "system",
    entityType: data.entityType ? String(data.entityType) : undefined,
    entityId: data.entityId ? String(data.entityId) : undefined,
    entityName: data.entityName ? String(data.entityName) : undefined,
    summary: String(data.summary ?? ""),
  };
}

export function subscribeToAuditLogs(
  callback: (events: AuditEvent[]) => void,
  opts?: { category?: AuditCategory | ""; limitTo?: number },
  onError?: (message: string) => void,
): Unsubscribe {
  const q = query(auditLogsCollection, orderBy("at", "desc"), limit(opts?.limitTo ?? 250));

  return onSnapshot(
    q,
    (snap) => {
      const all = snap.docs.map((d) => mapEvent(d.id, d.data() as Record<string, unknown>));
      callback(opts?.category ? all.filter((e) => e.category === opts.category) : all);
    },
    (err) => {
      console.error("[Audit] subscribe:", err.message);
      onError?.(err.message);
      callback([]);
    },
  );
}
