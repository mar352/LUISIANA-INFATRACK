import { useEffect, useMemo, useState } from "react";
import type { DocumentCategory, MunicipalDocument } from "../types";
import {
  BARANGAY_LIST,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
} from "../types";
import type { SessionUser } from "../services/auth";
import {
  addDocumentVersion,
  createDocument,
  deleteDocument,
  subscribeToDocuments,
  updateDocumentMeta,
} from "../services/firestore-documents";
import { backendUrl, uploadDocumentFile } from "../lib/api";
import { getDocumentPermissions } from "../lib/document-permissions";
import { ThemeToggle } from "./ThemeToggle";
import "./DocumentsPage.css";

type Props = {
  onBack: () => void;
  session: SessionUser | null;
};

function fileHref(url: string) {
  if (!url) return "#";
  if (url.startsWith("http")) return url;
  return backendUrl(url);
}

function formatWhen(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 15 }, (_, i) => currentYear - i);

export default function DocumentsPage({ onBack, session }: Props) {
  const role = session?.role ?? null;
  const perms = getDocumentPermissions(role);

  const [docs, setDocs] = useState<MunicipalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<DocumentCategory | "">("");
  const [filterYear, setFilterYear] = useState<number | "">("");
  const [filterBarangay, setFilterBarangay] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showVersion, setShowVersion] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState<DocumentCategory>("CLUP");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftYear, setDraftYear] = useState(currentYear);
  const [draftBarangay, setDraftBarangay] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);

  useEffect(() => {
    const unsub = subscribeToDocuments(
      (list) => {
        setDocs(list);
        setLoading(false);
      },
      (err) => {
        setMessage(`Could not load documents: ${err}`);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const selected = useMemo(
    () => docs.find((d) => d.id === selectedId) ?? null,
    [docs, selectedId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (filterCategory && d.category !== filterCategory) return false;
      if (filterYear !== "" && d.year !== filterYear) return false;
      if (filterBarangay && (d.barangay || "") !== filterBarangay) return false;
      if (!q) return true;
      const hay = [
        d.title,
        d.description,
        d.fileName,
        DOCUMENT_CATEGORY_LABELS[d.category],
        d.barangay || "",
        ...(d.tags || []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [docs, search, filterCategory, filterYear, filterBarangay]);

  function resetDraft() {
    setDraftTitle("");
    setDraftCategory("CLUP");
    setDraftDescription("");
    setDraftYear(currentYear);
    setDraftBarangay("");
    setDraftTags("");
    setDraftFile(null);
  }

  function openUpload() {
    resetDraft();
    setShowUpload(true);
  }

  function openEdit(docItem: MunicipalDocument) {
    setDraftTitle(docItem.title);
    setDraftCategory(docItem.category);
    setDraftDescription(docItem.description);
    setDraftYear(docItem.year);
    setDraftBarangay(docItem.barangay || "");
    setDraftTags((docItem.tags || []).join(", "));
    setShowEdit(true);
  }

  function openVersion() {
    setDraftFile(null);
    setShowVersion(true);
  }

  async function handleCreate() {
    if (!session || !perms.canUpload) return;
    if (!draftTitle.trim()) {
      setMessage("Title is required.");
      return;
    }
    if (!draftFile) {
      setMessage("Choose a PDF or image file.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const uploaded = await uploadDocumentFile(draftFile);
      const created = await createDocument({
        title: draftTitle.trim(),
        category: draftCategory,
        description: draftDescription.trim(),
        year: draftYear,
        barangay: draftBarangay || undefined,
        tags: draftTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        fileUrl: uploaded.url,
        fileName: uploaded.originalName || uploaded.filename,
        mimeType: uploaded.mimeType,
        uploadedBy: session.username,
      });
      setShowUpload(false);
      resetDraft();
      setSelectedId(created.id);
      setMessage("Document uploaded.");
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    }
    setBusy(false);
  }

  async function handleSaveMeta() {
    if (!selected || !perms.canEdit) return;
    if (!draftTitle.trim()) {
      setMessage("Title is required.");
      return;
    }
    setBusy(true);
    try {
      await updateDocumentMeta(selected.id, {
        title: draftTitle.trim(),
        category: draftCategory,
        description: draftDescription.trim(),
        year: draftYear,
        barangay: draftBarangay || undefined,
        tags: draftTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setShowEdit(false);
      setMessage("Document details updated.");
    } catch (err) {
      console.error(err);
      setMessage("Failed to update document.");
    }
    setBusy(false);
  }

  async function handleNewVersion() {
    if (!session || !selected || !perms.canUpload) return;
    if (!draftFile) {
      setMessage("Choose a file for the new version.");
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadDocumentFile(draftFile);
      await addDocumentVersion(selected, {
        fileUrl: uploaded.url,
        fileName: uploaded.originalName || uploaded.filename,
        mimeType: uploaded.mimeType,
        uploadedBy: session.username,
      });
      setShowVersion(false);
      setDraftFile(null);
      setMessage(`Version ${selected.version + 1} uploaded.`);
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : "Version upload failed.");
    }
    setBusy(false);
  }

  async function handleDelete(docItem: MunicipalDocument) {
    if (!perms.canDelete) return;
    if (!window.confirm(`Delete “${docItem.title}”? This removes the catalog entry.`)) {
      return;
    }
    setBusy(true);
    try {
      await deleteDocument(docItem.id);
      if (selectedId === docItem.id) setSelectedId(null);
      setMessage("Document deleted.");
    } catch (err) {
      console.error(err);
      setMessage("Failed to delete document.");
    }
    setBusy(false);
  }

  if (!perms.canView) {
    return (
      <div className="dms-page">
        <header className="dms-top">
          <button type="button" className="dms-btn" onClick={onBack}>
            ← Back
          </button>
          <h1>Documents</h1>
        </header>
        <p className="dms-empty">Sign in to browse the document repository.</p>
      </div>
    );
  }

  return (
    <div className="dms-page">
      <header className="dms-top">
        <div className="dms-top-left">
          <button type="button" className="dms-btn" onClick={onBack}>
            ← Map
          </button>
          <div>
            <h1>Document repository</h1>
            <p className="dms-sub">CLUP · CDP · LDIP · AIP · plans · permits</p>
          </div>
        </div>
        <div className="dms-top-actions">
          <ThemeToggle />
          {perms.canUpload && (
            <button type="button" className="dms-btn primary" onClick={openUpload}>
              + Upload
            </button>
          )}
        </div>
      </header>

      {message && (
        <div className="dms-banner" role="status">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)}>
            ×
          </button>
        </div>
      )}

      <div className={`dms-layout${selected ? " has-detail" : ""}`}>
        <section className="dms-main">
          <div className="dms-toolbar">
            <input
              className="dms-input"
              placeholder="Search title, tags, file…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="dms-input"
              value={filterCategory}
              onChange={(e) =>
                setFilterCategory((e.target.value || "") as DocumentCategory | "")
              }
            >
              <option value="">All categories</option>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <select
              className="dms-input"
              value={filterYear === "" ? "" : String(filterYear)}
              onChange={(e) =>
                setFilterYear(e.target.value ? Number(e.target.value) : "")
              }
            >
              <option value="">All years</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              className="dms-input"
              value={filterBarangay}
              onChange={(e) => setFilterBarangay(e.target.value)}
            >
              <option value="">All barangays</option>
              {BARANGAY_LIST.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="dms-empty">Loading documents…</div>
          ) : filtered.length === 0 ? (
            <div className="dms-empty">
              No documents match. {perms.canUpload ? "Upload the first file." : ""}
            </div>
          ) : (
            <div className="dms-table-wrap">
              <table className="dms-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Year</th>
                    <th>Ver</th>
                    <th>Updated</th>
                    {perms.canDelete && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr
                      key={d.id}
                      className={selectedId === d.id ? "selected" : ""}
                      onClick={() => setSelectedId(d.id)}
                    >
                      <td>
                        <div className="dms-row-title">{d.title}</div>
                        <div className="dms-row-meta">{d.fileName}</div>
                      </td>
                      <td>
                        <span className="dms-chip">{DOCUMENT_CATEGORY_LABELS[d.category]}</span>
                      </td>
                      <td>{d.year}</td>
                      <td>v{d.version}</td>
                      <td>{formatWhen(d.updatedAt)}</td>
                      {perms.canDelete && (
                        <td>
                          <button
                            type="button"
                            className="dms-btn danger dms-btn-sm"
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(d);
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected && (
          <aside className="dms-detail">
            <div className="dms-detail-top">
              <h2>{selected.title}</h2>
              <button
                type="button"
                className="dms-detail-close"
                aria-label="Close"
                onClick={() => setSelectedId(null)}
              >
                ×
              </button>
            </div>
            <div className="dms-detail-meta">
              <span className="dms-chip">{DOCUMENT_CATEGORY_LABELS[selected.category]}</span>
              <span>{selected.year}</span>
              {selected.barangay && <span>{selected.barangay}</span>}
              <span>v{selected.version}</span>
            </div>
            <p className="dms-desc">{selected.description || "No description."}</p>
            {(selected.tags?.length ?? 0) > 0 && (
              <div className="dms-tags">
                {selected.tags.map((t) => (
                  <span key={t} className="dms-chip soft">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="dms-file-block">
              <label>Current file</label>
              <div className="dms-file-row">
                <a
                  className="dms-file-link"
                  href={fileHref(selected.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {selected.fileName || "Open file"}
                </a>
                {perms.canDelete && (
                  <button
                    type="button"
                    className="dms-btn danger dms-btn-sm"
                    disabled={busy}
                    onClick={() => void handleDelete(selected)}
                  >
                    Delete file
                  </button>
                )}
              </div>
              <div className="dms-muted">
                Uploaded by {selected.uploadedBy} · {formatWhen(selected.updatedAt)}
              </div>
            </div>

            <div className="dms-versions">
              <label>Version history</label>
              {selected.previousVersions?.length ? (
                <ul>
                  {[...selected.previousVersions]
                    .slice()
                    .reverse()
                    .map((v) => (
                      <li key={`${v.version}-${v.fileUrl}`}>
                        <a href={fileHref(v.fileUrl)} target="_blank" rel="noreferrer">
                          v{v.version} — {v.fileName || "file"}
                        </a>
                        <span className="dms-muted">
                          {v.uploadedBy} · {formatWhen(v.uploadedAt)}
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <div className="dms-muted">No older versions yet.</div>
              )}
            </div>

            <div className="dms-action-row">
              {perms.canUpload && (
                <button type="button" className="dms-btn primary" onClick={openVersion}>
                  Upload new version
                </button>
              )}
              {perms.canEdit && (
                <button type="button" className="dms-btn" onClick={() => openEdit(selected)}>
                  Edit details
                </button>
              )}
              {perms.canDelete && (
                <button
                  type="button"
                  className="dms-btn danger"
                  disabled={busy}
                  onClick={() => handleDelete(selected)}
                >
                  Delete
                </button>
              )}
            </div>
          </aside>
        )}
      </div>

      {showUpload && (
        <div className="dms-modal-backdrop" onClick={() => setShowUpload(false)}>
          <div
            className="dms-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="dms-upload-title"
          >
            <h2 id="dms-upload-title">Upload document</h2>
            <label>Title *</label>
            <input
              className="dms-input"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
            />
            <label>Category *</label>
            <select
              className="dms-input"
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value as DocumentCategory)}
            >
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <label>Description</label>
            <textarea
              className="dms-input"
              rows={3}
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
            />
            <div className="dms-modal-row">
              <div>
                <label>Year</label>
                <select
                  className="dms-input"
                  value={draftYear}
                  onChange={(e) => setDraftYear(Number(e.target.value))}
                >
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Barangay</label>
                <select
                  className="dms-input"
                  value={draftBarangay}
                  onChange={(e) => setDraftBarangay(e.target.value)}
                >
                  <option value="">—</option>
                  {BARANGAY_LIST.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label>Tags (comma-separated)</label>
            <input
              className="dms-input"
              value={draftTags}
              onChange={(e) => setDraftTags(e.target.value)}
              placeholder="drainage, flood, 2026"
            />
            <label>File * (PDF, image, doc)</label>
            <input
              className="dms-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/*"
              onChange={(e) => setDraftFile(e.target.files?.[0] ?? null)}
            />
            <div className="dms-action-row">
              <button
                type="button"
                className="dms-btn primary"
                disabled={busy}
                onClick={() => void handleCreate()}
              >
                Upload
              </button>
              <button type="button" className="dms-btn" onClick={() => setShowUpload(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showEdit && selected && (
        <div className="dms-modal-backdrop" onClick={() => setShowEdit(false)}>
          <div className="dms-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <h2>Edit details</h2>
            <label>Title *</label>
            <input
              className="dms-input"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
            />
            <label>Category</label>
            <select
              className="dms-input"
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value as DocumentCategory)}
            >
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <label>Description</label>
            <textarea
              className="dms-input"
              rows={3}
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
            />
            <div className="dms-modal-row">
              <div>
                <label>Year</label>
                <select
                  className="dms-input"
                  value={draftYear}
                  onChange={(e) => setDraftYear(Number(e.target.value))}
                >
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Barangay</label>
                <select
                  className="dms-input"
                  value={draftBarangay}
                  onChange={(e) => setDraftBarangay(e.target.value)}
                >
                  <option value="">—</option>
                  {BARANGAY_LIST.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label>Tags</label>
            <input
              className="dms-input"
              value={draftTags}
              onChange={(e) => setDraftTags(e.target.value)}
            />
            <div className="dms-action-row">
              <button
                type="button"
                className="dms-btn primary"
                disabled={busy}
                onClick={() => void handleSaveMeta()}
              >
                Save
              </button>
              <button type="button" className="dms-btn" onClick={() => setShowEdit(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showVersion && selected && (
        <div className="dms-modal-backdrop" onClick={() => setShowVersion(false)}>
          <div className="dms-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <h2>Upload new version</h2>
            <p className="dms-muted">
              Current is v{selected.version}. The old file stays in version history.
            </p>
            <label>File *</label>
            <input
              className="dms-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/*"
              onChange={(e) => setDraftFile(e.target.files?.[0] ?? null)}
            />
            <div className="dms-action-row">
              <button
                type="button"
                className="dms-btn primary"
                disabled={busy}
                onClick={() => void handleNewVersion()}
              >
                Upload v{selected.version + 1}
              </button>
              <button type="button" className="dms-btn" onClick={() => setShowVersion(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
