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

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
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
  await setDoc(ref, sanitizeProjectForFirestore(project));
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
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) cleaned[key] = value;
  }
  await updateDoc(ref, cleaned);
  void writeAudit({
    action: "project.update",
    category: "project",
    summary: `Updated project ${id}${patch.name ? ` (“${patch.name}”)` : ""}${patch.status ? ` → ${patch.status}` : ""}`,
    entityType: "project",
    entityId: id,
    entityName: patch.name,
  });
}

export async function archiveProject(id: string) {
  const ref = doc(db, "projects", id);
  await updateDoc(ref, { archivedAt: new Date().toISOString() });
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
