import {
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { db, documentsCollection } from "../firebase";
import type {
  DocumentCategory,
  DocumentVersionEntry,
  MunicipalDocument,
} from "../types";
import { DOCUMENT_CATEGORIES } from "../types";

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
}

function mapVersion(raw: unknown): DocumentVersionEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  return {
    version: Number(d.version) || 1,
    fileUrl: String(d.fileUrl ?? ""),
    fileName: String(d.fileName ?? ""),
    mimeType: String(d.mimeType ?? "application/octet-stream"),
    uploadedBy: String(d.uploadedBy ?? ""),
    uploadedAt: String(d.uploadedAt ?? ""),
  };
}

function mapDocument(id: string, data: Record<string, unknown>): MunicipalDocument {
  const categoryRaw = String(data.category ?? "CLUP");
  const category = (DOCUMENT_CATEGORIES as string[]).includes(categoryRaw)
    ? (categoryRaw as DocumentCategory)
    : "CLUP";

  const previousVersions = Array.isArray(data.previousVersions)
    ? (data.previousVersions.map(mapVersion).filter(Boolean) as DocumentVersionEntry[])
    : [];

  return {
    id,
    title: String(data.title ?? ""),
    category,
    description: String(data.description ?? ""),
    year: Number(data.year) || new Date().getFullYear(),
    barangay: data.barangay ? String(data.barangay) : undefined,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    fileUrl: String(data.fileUrl ?? ""),
    fileName: String(data.fileName ?? ""),
    mimeType: String(data.mimeType ?? "application/octet-stream"),
    version: Number(data.version) || 1,
    previousVersions,
    uploadedBy: String(data.uploadedBy ?? ""),
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
  };
}

export function subscribeToDocuments(
  callback: (docs: MunicipalDocument[]) => void,
  onError?: (message: string) => void,
) {
  return onSnapshot(
    documentsCollection,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapDocument(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      callback(list);
    },
    (err) => {
      console.error("[firestore] subscribeToDocuments:", err.message);
      onError?.(err.message);
      callback([]);
    },
  );
}

export type CreateDocumentInput = {
  title: string;
  category: DocumentCategory;
  description: string;
  year: number;
  barangay?: string;
  tags: string[];
  fileUrl: string;
  fileName: string;
  mimeType: string;
  uploadedBy: string;
};

export async function createDocument(input: CreateDocumentInput): Promise<MunicipalDocument> {
  const now = new Date().toISOString();
  const payload = stripUndefined({
    title: input.title,
    category: input.category,
    description: input.description,
    year: input.year,
    barangay: input.barangay || null,
    tags: input.tags,
    fileUrl: input.fileUrl,
    fileName: input.fileName,
    mimeType: input.mimeType,
    version: 1,
    previousVersions: [],
    uploadedBy: input.uploadedBy,
    createdAt: now,
    updatedAt: now,
  });
  const ref = await addDoc(documentsCollection, payload);
  return mapDocument(ref.id, payload);
}

export async function updateDocumentMeta(
  id: string,
  patch: Partial<
    Pick<
      MunicipalDocument,
      "title" | "category" | "description" | "year" | "barangay" | "tags"
    >
  >,
): Promise<void> {
  const ref = doc(db, "documents", id);
  await updateDoc(
    ref,
    stripUndefined({
      ...patch,
      barangay: patch.barangay === undefined ? undefined : patch.barangay || null,
      updatedAt: new Date().toISOString(),
    }),
  );
}

/** Bump version: archive current file into previousVersions, set new file as current. */
export async function addDocumentVersion(
  docItem: MunicipalDocument,
  next: {
    fileUrl: string;
    fileName: string;
    mimeType: string;
    uploadedBy: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const archived: DocumentVersionEntry = {
    version: docItem.version,
    fileUrl: docItem.fileUrl,
    fileName: docItem.fileName,
    mimeType: docItem.mimeType,
    uploadedBy: docItem.uploadedBy,
    uploadedAt: docItem.updatedAt || docItem.createdAt || now,
  };
  const ref = doc(db, "documents", docItem.id);
  await updateDoc(ref, {
    previousVersions: [...(docItem.previousVersions || []), archived],
    fileUrl: next.fileUrl,
    fileName: next.fileName,
    mimeType: next.mimeType,
    version: docItem.version + 1,
    uploadedBy: next.uploadedBy,
    updatedAt: now,
  });
}

export async function deleteDocument(id: string): Promise<void> {
  await deleteDoc(doc(db, "documents", id));
}
