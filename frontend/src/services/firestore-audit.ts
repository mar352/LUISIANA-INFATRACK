import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";

export type AuditCategory = "auth" | "project" | "planning" | "document" | "engagement" | "system";

export const AUDIT_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getAuditCutoffMs(): number {
  return Date.now() - AUDIT_RETENTION_MS;
}

export function getAuditCutoffIso(): string {
  return new Date(getAuditCutoffMs()).toISOString();
}

export function isAuditEventExpired(event: AuditEvent, maxAgeMs = AUDIT_RETENTION_MS): boolean {
  const t = new Date(event.at).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t > maxAgeMs;
}

export type AuditActor = {
  username: string;
  role: string;
  department?: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  expiresAt?: string;
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

let lastPurgeTime = 0;
const PURGE_THROTTLE_MS = 5 * 60 * 1000; // Throttle to at most once per 5 minutes per client

/**
 * Opportunistically purge expired audit logs (>24 hours old) from Cloud Firestore.
 */
export async function purgeExpiredAuditLogs(): Promise<number> {
  const now = Date.now();
  if (now - lastPurgeTime < PURGE_THROTTLE_MS) {
    return 0;
  }
  lastPurgeTime = now;

  try {
    const cutoffIso = new Date(now - AUDIT_RETENTION_MS).toISOString();
    const q = query(auditLogsCollection, where("at", "<", cutoffIso), limit(100));
    const snap = await getDocs(q);
    if (snap.empty) {
      return 0;
    }

    const batch = writeBatch(db);
    snap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    return snap.size;
  } catch (err) {
    // If deletion is restricted by Firestore security rules on the cloud project, log quietly
    console.debug("[Audit] Purge expired logs skipped or restricted by rules:", err);
    return 0;
  }
}

export async function writeAudit(input: WriteAuditInput): Promise<void> {
  const actor = input.actor ?? currentActor;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + AUDIT_RETENTION_MS);
  try {
    await addDoc(auditLogsCollection, {
      at: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      expireAt: Timestamp.fromDate(expiresAt), // For Firestore native TTL policy
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
    void purgeExpiredAuditLogs();
  } catch (err) {
    console.warn("[Audit] write failed:", err);
  }
}

function mapEvent(id: string, data: Record<string, unknown>): AuditEvent {
  return {
    id,
    at: String(data.at ?? ""),
    expiresAt: data.expiresAt ? String(data.expiresAt) : undefined,
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
  // Trigger opportunistic cleanup on subscription start
  void purgeExpiredAuditLogs();

  let latestRawEvents: AuditEvent[] = [];

  const emitFreshEvents = () => {
    const cutoffMs = getAuditCutoffMs();
    // Exclude any audit log older than 24 hours
    const fresh = latestRawEvents.filter((e) => {
      const ts = new Date(e.at).getTime();
      return !isNaN(ts) && ts >= cutoffMs;
    });
    callback(opts?.category ? fresh.filter((e) => e.category === opts.category) : fresh);
  };

  // Live dynamic timer: every 30 seconds, re-evaluates the 24-hour cutoff
  // so any log crossing the 24-hour mark disappears in real-time
  const tickerInterval = setInterval(() => {
    emitFreshEvents();
  }, 30000);

  let fallbackUnsub: Unsubscribe | null = null;
  let hasFallenBack = false;

  const cutoffIso = getAuditCutoffIso();
  let initialQuery;
  try {
    initialQuery = query(
      auditLogsCollection,
      where("at", ">=", cutoffIso),
      orderBy("at", "desc"),
      limit(opts?.limitTo ?? 250),
    );
  } catch {
    initialQuery = query(auditLogsCollection, orderBy("at", "desc"), limit(opts?.limitTo ?? 250));
  }

  const mainUnsub = onSnapshot(
    initialQuery,
    (snap) => {
      latestRawEvents = snap.docs.map((d) => mapEvent(d.id, d.data() as Record<string, unknown>));
      emitFreshEvents();
    },
    (err) => {
      // If server-side range query fails (e.g. requires composite index in Firestore), fall back to client-filtered query
      if (!hasFallenBack) {
        hasFallenBack = true;
        console.warn("[Audit] Range query failed; falling back to client-side 24h filtering:", err.message);
        const fallbackQuery = query(auditLogsCollection, orderBy("at", "desc"), limit(opts?.limitTo ?? 250));
        fallbackUnsub = onSnapshot(
          fallbackQuery,
          (snap) => {
            latestRawEvents = snap.docs.map((d) => mapEvent(d.id, d.data() as Record<string, unknown>));
            emitFreshEvents();
          },
          (fErr) => {
            console.error("[Audit] subscribe error:", fErr.message);
            onError?.(fErr.message);
            callback([]);
          },
        );
        return;
      }
      console.error("[Audit] subscribe:", err.message);
      onError?.(err.message);
      callback([]);
    },
  );

  return () => {
    clearInterval(tickerInterval);
    mainUnsub();
    fallbackUnsub?.();
  };
}
