/**
 * firestore-inspection-schedules.ts
 *
 * Firestore CRUD + real-time synchronization + PostgreSQL dual-persistence
 * for MEO Field Inspection Schedules.
 *
 * Collection: `meoInspectionSchedules`
 * PostgreSQL table: `meo_inspection_schedules`
 */

import {
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { db, meoInspectionSchedulesCollection } from "../firebase";
import { cleanForFirestore } from "./firestore-projects";
import { fetchInspectionSchedules, saveInspectionScheduleApi, deleteInspectionScheduleApi } from "../lib/api";

export interface FirestoreInspectionSchedule {
  id: string;
  projectCode: string;
  projectName: string;
  barangay: string;
  date: string;
  time: string;
  assignedInspector: string;
  status: "Nakatakda" | "Kasalukuyang Ginagawa" | "Tapos Na" | "Naka-reschedule";
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Check if an inspection schedule matches a project */
export function matchesScheduleToProject(
  schedule: FirestoreInspectionSchedule | any,
  projectId: string,
  projectCode: string,
  projectName: string
): boolean {
  if (!schedule) return false;

  const sProjCode = (schedule.projectCode || schedule.project_code || schedule.projectId || "").toLowerCase().trim();
  const targetId = (projectId || "").toLowerCase().trim();
  const targetCode = (projectCode || "").toLowerCase().trim();

  // 1. Direct project code / ID match
  if (sProjCode && targetId && sProjCode === targetId) {
    return true;
  }
  if (sProjCode && targetCode && sProjCode === targetCode) {
    return true;
  }

  // 2. Project Name match (exact or close)
  const sName = (schedule.projectName || schedule.project_name || "").toLowerCase().trim();
  const targetName = (projectName || "").toLowerCase().trim();

  if (sName && targetName) {
    if (sName === targetName) return true;
    if (sName.length >= 5 && targetName.length >= 5) {
      if (sName.includes(targetName) || targetName.includes(sName)) return true;
    }
  }

  return false;
}

/**
 * Subscribe to ALL inspection schedules in real-time.
 * Automatically synchronizes with PostgreSQL and Local Storage.
 */
export function subscribeToInspectionSchedules(
  callback: (schedules: FirestoreInspectionSchedule[]) => void
): () => void {
  // First, deliver any cached schedules immediately for zero latency
  try {
    const cachedRaw = localStorage.getItem("infatrack_meo_inspection_schedules");
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (Array.isArray(cached) && cached.length > 0) {
        callback(cached);
      }
    }
  } catch {}

  // Also query PostgreSQL backend REST API for persistence
  fetchInspectionSchedules()
    .then((res) => {
      if (Array.isArray(res?.schedules) && res.schedules.length > 0) {
        callback(res.schedules as FirestoreInspectionSchedule[]);
        try {
          localStorage.setItem("infatrack_meo_inspection_schedules", JSON.stringify(res.schedules));
        } catch {}

        // Ensure Cloud Firestore collection stays in sync with PostgreSQL records
        for (const s of res.schedules) {
          const ref = doc(db, "meoInspectionSchedules", s.id);
          setDoc(ref, cleanForFirestore(s), { merge: true }).catch(() => {});
        }
      }
    })
    .catch(() => {});

  // Real-time Firestore subscription (listening to collection)
  return onSnapshot(
    meoInspectionSchedulesCollection,
    (snapshot) => {
      if (!snapshot.empty) {
        const schedules = snapshot.docs.map((d) => ({
          ...(d.data() as Omit<FirestoreInspectionSchedule, "id">),
          id: d.id,
        })) as FirestoreInspectionSchedule[];

        schedules.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        callback(schedules);
        try {
          localStorage.setItem("infatrack_meo_inspection_schedules", JSON.stringify(schedules));
        } catch {}
      }
    },
    (err) => {
      console.warn("[Firestore] subscribeToInspectionSchedules warning:", err.message);
    }
  );
}

/**
 * Subscribe to schedules for a specific project.
 * Uses real-time Firestore + PostgreSQL REST fallback + LocalStorage.
 */
export function subscribeToProjectSchedules(
  projectId: string,
  projectCode: string,
  projectName: string,
  callback: (schedule: FirestoreInspectionSchedule | null) => void
): () => void {
  let hasMatch = false;

  // 1. Check local storage first (instant zero-latency check)
  try {
    const raw = localStorage.getItem("infatrack_meo_inspection_schedules");
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const match = list.find((s) => matchesScheduleToProject(s, projectId, projectCode, projectName));
        if (match) {
          hasMatch = true;
          callback(match);
        }
      }
    }
  } catch {}

  // 2. Fetch PostgreSQL backend directly
  fetchInspectionSchedules()
    .then((res) => {
      if (Array.isArray(res?.schedules)) {
        const match = res.schedules.find((s) => matchesScheduleToProject(s, projectId, projectCode, projectName));
        if (match) {
          hasMatch = true;
          callback(match);
        } else if (!hasMatch) {
          callback(null);
        }
      } else if (!hasMatch) {
        callback(null);
      }
    })
    .catch(() => {
      if (!hasMatch) callback(null);
    });

  // 3. Firestore live subscription
  return onSnapshot(
    meoInspectionSchedulesCollection,
    (snapshot) => {
      const all = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<FirestoreInspectionSchedule, "id">),
        id: d.id,
      })) as FirestoreInspectionSchedule[];

      const matched = all.find((s) => matchesScheduleToProject(s, projectId, projectCode, projectName));
      if (matched) {
        hasMatch = true;
        callback(matched);
      } else if (!hasMatch) {
        callback(null);
      }
    },
    (err) => {
      console.warn("[Firestore] subscribeToProjectSchedules warning:", err.message);
      if (!hasMatch) callback(null);
    }
  );
}

/**
 * Save (create or update) an inspection schedule in Firestore AND PostgreSQL AND localStorage.
 */
export async function saveInspectionScheduleToFirestore(
  schedule: FirestoreInspectionSchedule
): Promise<void> {
  const now = new Date().toISOString();
  const schedulePayload: FirestoreInspectionSchedule = {
    ...schedule,
    createdAt: schedule.createdAt || now,
    updatedAt: now,
  };

  // 1. Mirror to LocalStorage immediately
  try {
    const raw = localStorage.getItem("infatrack_meo_inspection_schedules");
    const current: FirestoreInspectionSchedule[] = raw ? JSON.parse(raw) : [];
    const updated = [schedulePayload, ...current.filter((s) => s.id !== schedulePayload.id)];
    localStorage.setItem("infatrack_meo_inspection_schedules", JSON.stringify(updated));
  } catch {}

  // 2. Persist to PostgreSQL backend database table
  saveInspectionScheduleApi({
    id: schedulePayload.id,
    projectCode: schedulePayload.projectCode,
    projectName: schedulePayload.projectName,
    barangay: schedulePayload.barangay,
    date: schedulePayload.date,
    time: schedulePayload.time,
    assignedInspector: schedulePayload.assignedInspector,
    status: schedulePayload.status,
    notes: schedulePayload.notes,
  }).catch((err) => {
    console.warn("[PostgreSQL] saveInspectionScheduleApi notice:", err.message);
  });

  // 3. Save to Cloud Firestore
  try {
    const ref = doc(db, "meoInspectionSchedules", schedulePayload.id);
    const data = cleanForFirestore(schedulePayload);
    await setDoc(ref, data, { merge: true });
  } catch (err: any) {
    console.warn("[Firestore] saveInspectionScheduleToFirestore notice:", err.message);
  }
}

/**
 * Update the status of an inspection schedule.
 */
export async function updateInspectionScheduleStatus(
  id: string,
  status: FirestoreInspectionSchedule["status"]
): Promise<void> {
  try {
    const ref = doc(db, "meoInspectionSchedules", id);
    await updateDoc(ref, {
      status,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn("[Firestore] updateInspectionScheduleStatus notice:", err.message);
  }
}

/**
 * Delete an inspection schedule from Firestore, PostgreSQL, and localStorage.
 */
export async function deleteInspectionScheduleFromFirestore(id: string): Promise<void> {
  try {
    const raw = localStorage.getItem("infatrack_meo_inspection_schedules");
    if (raw) {
      const current: FirestoreInspectionSchedule[] = JSON.parse(raw);
      const filtered = current.filter((s) => s.id !== id);
      localStorage.setItem("infatrack_meo_inspection_schedules", JSON.stringify(filtered));
    }
  } catch {}

  deleteInspectionScheduleApi(id).catch(() => {});

  try {
    const ref = doc(db, "meoInspectionSchedules", id);
    await deleteDoc(ref);
  } catch (err: any) {
    console.warn("[Firestore] deleteInspectionScheduleFromFirestore notice:", err.message);
  }
}
