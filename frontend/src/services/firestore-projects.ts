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
import type { Project } from "../types";

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
}

export async function archiveProject(id: string) {
  const ref = doc(db, "projects", id);
  await updateDoc(ref, { archivedAt: new Date().toISOString() });
}

export async function restoreProject(id: string) {
  const ref = doc(db, "projects", id);
  await updateDoc(ref, { archivedAt: null });
}

export async function deleteProjectFromFirestore(id: string) {
  const ref = doc(db, "projects", id);
  await deleteDoc(ref);
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
