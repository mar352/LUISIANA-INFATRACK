import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db, projectsCollection } from "../firebase";
import type { Project, ProjectPhoto } from "../types";
import { writeAudit } from "./firestore-audit";

function mergePhotos(prev?: ProjectPhoto[], next?: ProjectPhoto[]): ProjectPhoto[] {
  const map = new Map<string, ProjectPhoto>();
  for (const ph of [...(prev || []), ...(next || [])]) {
    if (ph?.id) map.set(ph.id, ph);
  }
  return [...map.values()].sort((a, b) =>
    String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")),
  );
}

/** Deeply remove undefined values so Firestore never throws unsupported field value error */
export function cleanForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(cleanForFirestore).filter((v) => v !== undefined);
  }
  if (typeof obj === "object") {
    if (obj instanceof Date) return obj.toISOString();
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        res[k] = cleanForFirestore(v);
      }
    }
    return res;
  }
  return obj;
}

/** Firestore rejects `undefined`; omit those fields and normalize optionals. */
function sanitizeProjectForFirestore(project: Partial<Project> & { id: string }) {
  const base: Record<string, unknown> = {
    ...project,
    barangay: project.barangay ?? "",
    fundingSource: project.fundingSource ?? "",
    contractor: project.contractor ?? "",
    lifecyclePhase: project.lifecyclePhase ?? "Planning",
    archivedAt: project.archivedAt ?? null,
    milestones: project.milestones ?? [],
    issues: project.issues ?? [],
    photos: project.photos ?? [],
    activityLog: project.activityLog ?? [],
    updatedAt: project.updatedAt ?? new Date().toISOString(),
  };

  return cleanForFirestore(base);
}

export function subscribeToProjects(
  callback: (projects: Project[]) => void,
) {
  return onSnapshot(
    projectsCollection,
    (snapshot) => {
      const all: Project[] = snapshot.docs.map((d) => ({
        ...d.data(),
        id: d.id,
      })) as Project[];
      const active = all
        .filter((p) => !p.archivedAt)
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      callback(active);
    },
    (err) => {
      console.error("[Firestore] subscribeToProjects error:", err.message);
      callback([]);
    },
  );
}

export function subscribeToArchivedProjects(
  callback: (projects: Project[]) => void,
) {
  return onSnapshot(
    projectsCollection,
    (snapshot) => {
      const all: Project[] = snapshot.docs.map((d) => ({
        ...d.data(),
        id: d.id,
      })) as Project[];
      const archived = all
        .filter((p) => !!p.archivedAt)
        .sort((a, b) => (b.archivedAt || "").localeCompare(a.archivedAt || ""));
      callback(archived);
    },
    (err) => {
      console.error("[Firestore] subscribeToArchivedProjects error:", err.message);
      callback([]);
    },
  );
}

export async function addProjectToFirestore(project: Project) {
  const ref = doc(projectsCollection, project.id);
  await setDoc(ref, sanitizeProjectForFirestore(project), { merge: true });
  void writeAudit({
    action: "project.create",
    category: "project",
    summary: `Created project “${project.name}”`,
    entityType: "project",
    entityId: project.id,
    entityName: project.name,
  });
}

export async function updateProjectInFirestore(
  id: string,
  patch: Partial<Project>,
) {
  const ref = doc(db, "projects", id);
  const data: Record<string, unknown> = {
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const cleaned = cleanForFirestore(data);
  // Using setDoc with merge: true ensures document is created if not yet present
  await setDoc(ref, cleaned, { merge: true });
  void writeAudit({
    action: "project.update",
    category: "project",
    summary: `Updated project ${id}${patch.name ? ` (“${patch.name}”)` : ""}${patch.status ? ` → ${patch.status}` : ""}`,
    entityType: "project",
    entityId: id,
    entityName: patch.name,
  });
}

export interface InspectionPayload {
  stage: "before" | "during" | "after";
  progress: number;
  remarks?: string;
  inspector: string;
  photoUrl?: string;
  timestamp?: string;
  inspectedAt?: string;
  stageLabel?: string;
  id?: string;
}

/**
 * Persists an inspection record, progress photo, stage, and percentage into Cloud Firestore.
 * Automatically updates latestInspection, appends to inspectionPhotos history, and adds to project photos.
 */
export async function recordProjectInspectionInFirestore(
  projectId: string,
  inspection: InspectionPayload,
  extraProjectData?: Partial<Project>
) {
  const ref = doc(db, "projects", projectId);
  const now = inspection.timestamp || inspection.inspectedAt || new Date().toISOString();
  const inspId = inspection.id || `insp-${Date.now()}`;
  const nextStatus = inspection.progress >= 100 ? "Completed" : inspection.progress >= 50 ? "Ongoing" : "Planned";
  const nextColor = inspection.progress >= 100 ? "#10b981" : inspection.progress >= 50 ? "#f5a623" : "#3b82f6";

  const inspectionRecord = {
    id: inspId,
    stage: inspection.stage,
    progress: inspection.progress,
    photoUrl: inspection.photoUrl || "",
    remarks: inspection.remarks || "",
    inspector: inspection.inspector || "Municipal Engineer",
    inspectedAt: now,
    timestamp: now,
    stageLabel:
      inspection.stageLabel ||
      `${inspection.stage === "before" ? "Before Construction" : inspection.stage === "after" ? "Completed / Final" : "During Construction"} (${inspection.progress}%)`,
  };

  // 1. Fetch current document if exists to merge arrays cleanly
  let existingInspPhotos: any[] = [];
  let existingPhotos: ProjectPhoto[] = [];
  let existingActivity: any[] = [];
  let existingName = extraProjectData?.name || projectId;

  try {
    const snap = await getDocs(projectsCollection);
    const existingDoc = snap.docs.find((d) => d.id === projectId);
    if (existingDoc && existingDoc.exists()) {
      const d = existingDoc.data();
      if (Array.isArray(d.inspectionPhotos)) existingInspPhotos = d.inspectionPhotos;
      if (Array.isArray(d.photos)) existingPhotos = d.photos;
      if (Array.isArray(d.activityLog)) existingActivity = d.activityLog;
      if (d.name) existingName = d.name;
    }
  } catch {
    // If query fails, proceed with payload merge
  }

  // 2. Append to inspection history without duplicate IDs or identical URLs
  const updatedInspPhotos = [
    ...existingInspPhotos.filter(
      (ip: any) => ip?.id !== inspId && (inspection.photoUrl ? ip?.photoUrl !== inspection.photoUrl : true),
    ),
    inspectionRecord,
  ];

  // 3. Append to photo gallery if a photo was captured
  let updatedPhotos = [...existingPhotos];
  if (inspection.photoUrl && inspection.photoUrl.trim() !== "") {
    const photoEntry: ProjectPhoto = {
      id: `photo-${inspId}`,
      url: inspection.photoUrl,
      caption: `${inspection.stage.toUpperCase()} Inspection (${inspection.progress}%) - ${inspection.remarks || "Site progress photo"}`,
      stage: inspection.stage,
      kind: "progress",
      uploadedAt: now,
      lat: extraProjectData?.location?.lat,
      lon: extraProjectData?.location?.lon,
    };
    updatedPhotos = [
      photoEntry,
      ...updatedPhotos.filter((p) => p.url !== inspection.photoUrl && p.id !== photoEntry.id),
    ];
  }

  // 4. Append to Activity Log
  const newLog = {
    at: now,
    message: `Site inspection conducted by ${inspectionRecord.inspector} (${inspection.stage.toUpperCase()} stage, ${inspection.progress}%). ${inspection.remarks ? `Remarks: ${inspection.remarks}` : ""}`.trim(),
  };
  const updatedActivity = [newLog, ...existingActivity];

  // 5. Construct Firestore patch payload
  const patch: Record<string, unknown> = {
    ...extraProjectData,
    progress: inspection.progress,
    inspectionStage: inspection.stage,
    status: nextStatus,
    markerColor: nextColor,
    latestInspection: inspectionRecord,
    inspectionPhotos: updatedInspPhotos,
    photos: updatedPhotos,
    activityLog: updatedActivity,
    updatedAt: now,
  };

  const cleaned = cleanForFirestore(patch);
  await setDoc(ref, cleaned, { merge: true });

  void writeAudit({
    action: "project.inspect",
    category: "project",
    summary: `Recorded ${inspection.stage} inspection (${inspection.progress}%) by ${inspectionRecord.inspector} for project “${existingName}”`,
    entityType: "project",
    entityId: projectId,
    entityName: existingName,
  });
}

/**
 * Ensures a project pin with geographical coordinates and status is stored in Cloud Firestore.
 */
export async function syncPinnedProjectToFirestore(project: Project) {
  const ref = doc(projectsCollection, project.id);
  const data = cleanForFirestore({
    ...project,
    isPinned: true,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(ref, data, { merge: true });
}

export async function archiveProject(id: string) {
  const ref = doc(db, "projects", id);
  await setDoc(ref, { archivedAt: new Date().toISOString() }, { merge: true });
  void writeAudit({
    action: "project.archive",
    category: "project",
    summary: `Archived project ${id}`,
    entityType: "project",
    entityId: id,
  });
}

export async function restoreProject(id: string) {
  const ref = doc(db, "projects", id);
  await updateDoc(ref, { archivedAt: null });
  void writeAudit({
    action: "project.restore",
    category: "project",
    summary: `Restored project ${id}`,
    entityType: "project",
    entityId: id,
  });
}

export async function deleteProjectFromFirestore(id: string) {
  const ref = doc(db, "projects", id);
  await deleteDoc(ref);
  void writeAudit({
    action: "project.delete",
    category: "project",
    summary: `Deleted project ${id}`,
    entityType: "project",
    entityId: id,
  });
}

export async function seedFirestoreFromBackend(projects: Project[]) {
  try {
    const existing = await getDocs(projectsCollection);
    if (!existing.empty) return false;

    const batch = writeBatch(db);
    for (const p of projects) {
      const ref = doc(projectsCollection, p.id);
      batch.set(ref, sanitizeProjectForFirestore(p));
    }
    await batch.commit();
    return true;
  } catch (err: any) {
    console.error("[Firestore] seedFirestoreFromBackend error:", err.message);
    return false;
  }
}

/**
 * Keep Inventory in lockstep with the map/backend list:
 * - upsert every backend project (status/progress from map win)
 * - remove Firestore rows that are no longer on the map
 */
export async function syncFirestoreWithBackend(projects: Project[]) {
  try {
    const existing = await getDocs(projectsCollection);
    const backendIds = new Set(projects.map((p) => p.id));
    const prevById = new Map(
      existing.docs.map((d) => [d.id, d.data() as Project]),
    );

    const batch = writeBatch(db);

    for (const p of projects) {
      const prev = prevById.get(p.id);
      const merged: Project = {
        ...prev,
        ...p,
        // Preserve inventory-only fields when map payload left them empty
        barangay: p.barangay || prev?.barangay || "",
        fundingSource: p.fundingSource || prev?.fundingSource || "",
        contractor: p.contractor || prev?.contractor || "",
        lifecyclePhase: p.lifecyclePhase || prev?.lifecyclePhase || "Planning",
        budgetTotal: p.budgetTotal ?? prev?.budgetTotal ?? null,
        budgetSpent: p.budgetSpent ?? prev?.budgetSpent ?? 0,
        // Keep field-app photos that live only in Firestore
        photos: mergePhotos(prev?.photos, p.photos),
        // Live map projects stay active in inventory
        archivedAt: null,
        updatedAt: p.updatedAt || prev?.updatedAt || new Date().toISOString(),
      };
      batch.set(doc(projectsCollection, p.id), sanitizeProjectForFirestore(merged));
    }

    for (const d of existing.docs) {
      if (!backendIds.has(d.id)) {
        batch.delete(d.ref);
      }
    }

    await batch.commit();
    return true;
  } catch (err: any) {
    console.error("[Firestore] syncFirestoreWithBackend error:", err.message);
    return false;
  }
}
