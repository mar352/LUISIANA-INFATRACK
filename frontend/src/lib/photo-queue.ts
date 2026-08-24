/**
 * Offline inspection photos: keep Blobs in IndexedDB, upload when the network is back.
 */

import { uploadProjectPhoto } from "./api";
import type { ProjectPhotoKind } from "../types";

const DB_NAME = "infatrack-photo-queue";
const STORE = "pending";
const CHANGED = "infatrack-photo-queue";

export type QueuedPhoto = {
  id: string;
  projectId: string;
  caption: string;
  milestoneId: string | null;
  kind: ProjectPhotoKind;
  lat: number | null;
  lon: number | null;
  blob: Blob;
  name: string;
  type: string;
  queuedAt: string;
};

function emitChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGED));
  }
}

export function onPhotoQueueChange(fn: () => void): () => void {
  window.addEventListener(CHANGED, fn);
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function enqueuePhoto(
  item: Omit<QueuedPhoto, "id" | "queuedAt">,
): Promise<QueuedPhoto> {
  const row: QueuedPhoto = {
    ...item,
    id: `Q${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    queuedAt: new Date().toISOString(),
  };
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(row);
  await txDone(tx);
  db.close();
  emitChange();
  return row;
}

export async function listQueuedPhotos(projectId?: string): Promise<QueuedPhoto[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const req = tx.objectStore(STORE).getAll();
  const rows = await new Promise<QueuedPhoto[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as QueuedPhoto[]) || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  const list = rows.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  return projectId ? list.filter((r) => r.projectId === projectId) : list;
}

export async function removeQueuedPhoto(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
  db.close();
  emitChange();
}

export function isOfflineNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : String(err || "");
  if (/failed to fetch|networkerror|load failed|offline/i.test(msg)) return true;
  const status = Number(/Upload failed: (\d+)/.exec(msg)?.[1]);
  return status === 0 || status >= 500;
}

let flushing = false;

export async function flushPhotoQueue(): Promise<number> {
  if (flushing) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  flushing = true;
  let sent = 0;
  try {
    const pending = await listQueuedPhotos();
    for (const row of pending) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      try {
        const file = new File([row.blob], row.name || "photo.jpg", {
          type: row.type || "image/jpeg",
        });
        await uploadProjectPhoto(row.projectId, file, {
          caption: row.caption || undefined,
          milestoneId: row.milestoneId,
          kind: row.kind,
          lat: row.lat,
          lon: row.lon,
        });
        await removeQueuedPhoto(row.id);
        sent += 1;
      } catch (err) {
        if (isOfflineNetworkError(err)) break;
        console.warn("[photo-queue] drop failed item", row.id, err);
        await removeQueuedPhoto(row.id);
      }
    }
  } finally {
    flushing = false;
    if (sent) emitChange();
  }
  return sent;
}

export function startPhotoQueueFlusher(): () => void {
  const tick = () => {
    void flushPhotoQueue();
  };
  window.addEventListener("online", tick);
  const timer = window.setInterval(tick, 20_000);
  tick();
  return () => {
    window.removeEventListener("online", tick);
    window.clearInterval(timer);
  };
}
