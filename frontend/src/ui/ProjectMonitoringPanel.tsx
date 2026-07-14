import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  PROJECT_STATUS_COLORS,
  PROJECT_STATUS_LABELS,
  MODEL_CATALOG,
  type Project,
  type ProjectStatus,
} from "../types";
import {
  patchProject,
  addMilestone,
  completeMilestone,
  reportIssue,
  resolveIssue,
  uploadProjectPhoto,
  deleteProjectPhoto,
  fetchAccomplishmentReport,
  backendUrl,
} from "../lib/api";
import { downloadReportJson, printAccomplishmentReport } from "../lib/projectReport";

function formatPeso(n: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
}

function formatAgo(iso: string) {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

type Props = {
  projects: Project[];
  currentRole: string | null;
  mapRef: React.RefObject<MapLibreMap | null>;
  readOnly?: boolean;
};

export function ProjectMonitoringPanel({ projects, currentRole, mapRef, readOnly = false }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [issueKind, setIssueKind] = useState<"delay" | "issue">("delay");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoMilestoneId, setPhotoMilestoneId] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const detailRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () => projects.filter((p) => (currentRole === "Engineer" ? p.department === "Engineering" : true)),
    [projects, currentRole]
  );

  // Look up from full projects list so the pane still opens if filter drifts
  const selected = (selectedId ? projects.find((p) => p.id === selectedId) : null) ?? null;

  useEffect(() => {
    if (!selectedId || !detailRef.current) return;
    detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  function openProject(p: Project) {
    setSelectedId(p.id);
    mapRef.current?.flyTo({
      center: [p.location.lon, p.location.lat],
      zoom: 16,
      pitch: 62,
      bearing: -15,
      duration: 1400,
      essential: true,
    });
  }

  function closeProject() {
    setSelectedId(null);
  }

  const summary = useMemo(() => {
    const counts: Record<ProjectStatus, number> = {
      Planned: 0,
      Ongoing: 0,
      Delayed: 0,
      Completed: 0,
      Suspended: 0,
    };
    let budgetTotal = 0;
    let budgetSpent = 0;
    for (const p of projects) {
      counts[p.status] = (counts[p.status] ?? 0) + 1;
      if (p.budgetTotal) {
        budgetTotal += p.budgetTotal;
        budgetSpent += p.budgetSpent ?? 0;
      }
    }
    const budgetUtil = budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0;
    return { counts, total: projects.length, budgetUtil, budgetTotal, budgetSpent };
  }, [projects]);

  async function updateField(patch: Partial<Project>) {
    if (!selected) return;
    try {
      await patchProject(selected.id, patch);
    } catch (err) {
      console.error("Failed to update project:", err);
    }
  }

  async function handleAddMilestone() {
    if (!selected || !milestoneTitle || !milestoneDate) return;
    try {
      await addMilestone(selected.id, { title: milestoneTitle, targetDate: milestoneDate });
      setMilestoneTitle("");
      setMilestoneDate("");
    } catch (err) {
      console.error("Failed to add milestone:", err);
    }
  }

  async function handleReportIssue() {
    if (!selected || !issueTitle) return;
    try {
      await reportIssue(selected.id, { kind: issueKind, title: issueTitle, description: issueDesc });
      setIssueTitle("");
      setIssueDesc("");
    } catch (err) {
      console.error("Failed to report issue:", err);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!selected || !file) return;
    setPhotoUploading(true);
    try {
      await uploadProjectPhoto(selected.id, file, {
        caption: photoCaption || undefined,
        milestoneId: photoMilestoneId || null,
      });
      setPhotoCaption("");
      setPhotoMilestoneId("");
      e.target.value = "";
    } catch (err) {
      console.error("Failed to upload photo:", err);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!selected) return;
    try {
      await deleteProjectPhoto(selected.id, photoId);
    } catch (err) {
      console.error("Failed to delete photo:", err);
    }
  }

  async function handleDownloadReport() {
    if (!selected) return;
    setReportLoading(true);
    try {
      const { report } = await fetchAccomplishmentReport(selected.id);
      downloadReportJson(report, selected.name);
    } catch (err) {
      console.error("Failed to generate report:", err);
    } finally {
      setReportLoading(false);
    }
  }

  async function handlePrintReport() {
    if (!selected) return;
    setReportLoading(true);
    try {
      const { report } = await fetchAccomplishmentReport(selected.id);
      printAccomplishmentReport(report);
    } catch (err) {
      console.error("Failed to print report:", err);
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="sectionTitle" style={{ marginBottom: 8 }}>Project Monitoring</div>
        <div className="grid2" style={{ marginBottom: 8 }}>
          <div className="stat">
            <div className="v">{summary.total}</div>
            <div className="l">Total</div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: PROJECT_STATUS_COLORS.Ongoing }}>{summary.counts.Ongoing}</div>
            <div className="l">Ongoing</div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: PROJECT_STATUS_COLORS.Delayed }}>{summary.counts.Delayed}</div>
            <div className="l">Delayed</div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: PROJECT_STATUS_COLORS.Completed }}>{summary.counts.Completed}</div>
            <div className="l">Completed</div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: PROJECT_STATUS_COLORS.Planned }}>{summary.counts.Planned}</div>
            <div className="l">Planned</div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: PROJECT_STATUS_COLORS.Suspended }}>{summary.counts.Suspended}</div>
            <div className="l">Suspended</div>
          </div>
        </div>
        {summary.budgetTotal > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted2)", marginBottom: 4 }}>
              <span>Budget utilization (all projects)</span>
              <span>{summary.budgetUtil}%</span>
            </div>
            <div className="bar"><div style={{ width: `${Math.min(100, summary.budgetUtil)}%`, background: summary.budgetUtil > 90 ? "var(--danger)" : "var(--accent)" }} /></div>
            <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 4 }}>
              {formatPeso(summary.budgetSpent)} of {formatPeso(summary.budgetTotal)}
            </div>
          </div>
        )}
      </div>

      {!selected && (
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="sectionTitle" style={{ marginBottom: 8 }}>Project List</div>
        <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 8 }}>
          Click a project to open details, photos, and reports.
        </div>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted2)", lineHeight: 1.5 }}>
            {readOnly
              ? "No infrastructure projects are published on the map yet."
              : "No infrastructure projects yet. Use Engineer placement mode to add projects on the map."}
          </div>
        ) : (
        <div className="miniList">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className="proj"
              onClick={() => openProject(p)}
              style={{
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                font: "inherit",
                background: "transparent",
              }}
            >
              <div className="n">{p.name}</div>
              <div className="s">
                <span style={{ color: PROJECT_STATUS_COLORS[p.status] ?? "var(--muted)" }}>
                  {PROJECT_STATUS_LABELS[p.status] ?? p.status}
                </span>
                <span>{p.progress}%</span>
              </div>
              <div className="bar"><div style={{ width: `${p.progress}%` }} /></div>
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted2)" }}>
                {p.department} · {formatAgo(p.updatedAt)} · Open details →
              </div>
            </button>
          ))}
        </div>
        )}
      </div>
      )}

      {selected && (
        <div className="card" ref={detailRef} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={closeProject}
              style={{
                cursor: "pointer",
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 700,
                border: "2px solid var(--ink)",
                background: "var(--cream-deep)",
                color: "var(--ink)",
                flexShrink: 0,
              }}
            >
              ← Back
            </button>
            <div className="sectionTitle" style={{ margin: 0, flex: 1 }}>{selected.name}</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 4 }}>Status</label>
            {readOnly ? (
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: PROJECT_STATUS_COLORS[selected.status] ?? "var(--muted)",
              }}>
                {PROJECT_STATUS_LABELS[selected.status] ?? selected.status}
              </div>
            ) : (
            <select
              value={selected.status}
              onChange={(e) => updateField({ status: e.target.value as ProjectStatus })}
              style={{ width: "100%", padding: "8px", fontSize: 12, border: "1px solid var(--stroke2)", background: "var(--cream-deep)" }}
            >
              {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
              ))}
            </select>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 4 }}>
              Progress: {selected.progress}%
            </label>
            {readOnly ? (
              <div className="bar"><div style={{ width: `${selected.progress}%` }} /></div>
            ) : (
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={selected.progress}
              onChange={(e) => updateField({ progress: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
            )}
          </div>

          <div className="grid2" style={{ marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 4 }}>Start date</label>
              {readOnly ? (
                <div style={{ fontSize: 12 }}>{selected.startDate || "—"}</div>
              ) : (
              <input
                type="date"
                value={selected.startDate ?? ""}
                onChange={(e) => updateField({ startDate: e.target.value || null })}
                style={{ width: "100%", padding: "6px", fontSize: 11, border: "1px solid var(--stroke2)" }}
              />
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 4 }}>Target end</label>
              {readOnly ? (
                <div style={{ fontSize: 12 }}>{selected.targetEndDate || "—"}</div>
              ) : (
              <input
                type="date"
                value={selected.targetEndDate ?? ""}
                onChange={(e) => updateField({ targetEndDate: e.target.value || null })}
                style={{ width: "100%", padding: "6px", fontSize: 11, border: "1px solid var(--stroke2)" }}
              />
              )}
            </div>
          </div>

          <div className="grid2" style={{ marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 4 }}>Budget total (PHP)</label>
              {readOnly ? (
                <div style={{ fontSize: 12 }}>{selected.budgetTotal != null ? formatPeso(selected.budgetTotal) : "—"}</div>
              ) : (
              <input
                type="number"
                min={0}
                value={selected.budgetTotal ?? ""}
                onChange={(e) => updateField({ budgetTotal: e.target.value ? Number(e.target.value) : null })}
                style={{ width: "100%", padding: "6px", fontSize: 11, border: "1px solid var(--stroke2)" }}
              />
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--muted2)", display: "block", marginBottom: 4 }}>Budget spent (PHP)</label>
              {readOnly ? (
                <div style={{ fontSize: 12 }}>{formatPeso(selected.budgetSpent ?? 0)}</div>
              ) : (
              <input
                type="number"
                min={0}
                value={selected.budgetSpent ?? 0}
                onChange={(e) => updateField({ budgetSpent: Number(e.target.value) })}
                style={{ width: "100%", padding: "6px", fontSize: 11, border: "1px solid var(--stroke2)" }}
              />
              )}
            </div>
          </div>

          {selected.budgetTotal != null && selected.budgetTotal > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 4 }}>
                Utilization: {Math.round(((selected.budgetSpent ?? 0) / selected.budgetTotal) * 100)}%
              </div>
              <div className="bar">
                <div style={{
                  width: `${Math.min(100, Math.round(((selected.budgetSpent ?? 0) / selected.budgetTotal) * 100))}%`,
                  background: "var(--accent)",
                }} />
              </div>
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ fontSize: 11, marginBottom: 6 }}>Timeline & Milestones</div>
            {(selected.milestones ?? []).length === 0 && (
              <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 8 }}>No milestones yet.</div>
            )}
            {(selected.milestones ?? []).map((m) => (
              <div key={m.id} style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                borderBottom: "1px solid var(--stroke2)",
                fontSize: 11,
              }}>
                <span style={{
                  color: m.status === "done" ? "var(--safe)" : m.status === "missed" ? "var(--danger)" : "var(--muted2)",
                  minWidth: 52,
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}>{m.status}</span>
                <span style={{ flex: 1 }}>{m.title} · {m.targetDate}</span>
                {!readOnly && m.status !== "done" && (
                  <button
                    type="button"
                    onClick={() => completeMilestone(selected.id, m.id)}
                    style={{ fontSize: 10, padding: "2px 6px", cursor: "pointer", border: "1px solid var(--stroke2)", background: "var(--cream-deep)" }}
                  >
                    Done
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <input
                placeholder="Milestone title"
                value={milestoneTitle}
                onChange={(e) => setMilestoneTitle(e.target.value)}
                style={{ flex: 1, minWidth: 100, padding: "6px", fontSize: 11, border: "1px solid var(--stroke2)" }}
              />
              <input
                type="date"
                value={milestoneDate}
                onChange={(e) => setMilestoneDate(e.target.value)}
                style={{ padding: "6px", fontSize: 11, border: "1px solid var(--stroke2)" }}
              />
              <button type="button" onClick={handleAddMilestone} style={{ padding: "6px 10px", fontSize: 11, cursor: "pointer" }}>
                Add
              </button>
            </div>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ fontSize: 11, marginBottom: 6 }}>Delays & Issues</div>
            {(selected.issues ?? []).filter((i) => !i.resolvedAt).map((i) => (
              <div key={i.id} style={{
                padding: "8px",
                marginBottom: 6,
                background: i.kind === "delay" ? "rgba(224,82,82,0.08)" : "rgba(245,166,35,0.08)",
                border: "1px solid var(--stroke2)",
                fontSize: 11,
              }}>
                <div style={{ fontWeight: 600, color: i.kind === "delay" ? "var(--danger)" : "var(--warn)" }}>
                  {i.kind === "delay" ? "Delay" : "Issue"}: {i.title}
                </div>
                {i.description && <div style={{ marginTop: 4, color: "var(--muted2)" }}>{i.description}</div>}
                {!readOnly && (
                <button
                  type="button"
                  onClick={() => resolveIssue(selected.id, i.id)}
                  style={{ marginTop: 6, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}
                >
                  Resolve
                </button>
                )}
              </div>
            ))}
            {!readOnly && (
            <>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <select
                value={issueKind}
                onChange={(e) => setIssueKind(e.target.value as "delay" | "issue")}
                style={{ padding: "6px", fontSize: 11, border: "1px solid var(--stroke2)" }}
              >
                <option value="delay">Delay</option>
                <option value="issue">Issue</option>
              </select>
              <input
                placeholder="Title"
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                style={{ flex: 1, minWidth: 80, padding: "6px", fontSize: 11, border: "1px solid var(--stroke2)" }}
              />
            </div>
            <textarea
              placeholder="Description (optional)"
              value={issueDesc}
              onChange={(e) => setIssueDesc(e.target.value)}
              rows={2}
              style={{ width: "100%", marginTop: 6, padding: "6px", fontSize: 11, border: "1px solid var(--stroke2)", resize: "vertical" }}
            />
            <button type="button" onClick={handleReportIssue} style={{ marginTop: 6, padding: "6px 10px", fontSize: 11, cursor: "pointer" }}>
              Report
            </button>
            </>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ fontSize: 11, marginBottom: 6 }}>Progress Photos</div>
            {(selected.photos ?? []).length === 0 && (
              <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 8 }}>No progress photos yet.</div>
            )}
            {(selected.photos ?? []).length > 0 && (
              <div className="project-photo-grid">
                {(selected.photos ?? []).map((photo) => (
                  <div key={photo.id} className="project-photo-item">
                    <a href={backendUrl(photo.url)} target="_blank" rel="noreferrer">
                      <img src={backendUrl(photo.url)} alt={photo.caption || "Progress photo"} />
                    </a>
                    <div className="project-photo-meta">
                      <span>{photo.caption || "Progress photo"}</span>
                      {photo.milestoneId && (
                        <span className="project-photo-tag">
                          {(selected.milestones ?? []).find((m) => m.id === photo.milestoneId)?.title ?? "Milestone"}
                        </span>
                      )}
                    </div>
                    {!readOnly && (
                    <button type="button" className="project-photo-remove" onClick={() => handleDeletePhoto(photo.id)}>
                      Remove
                    </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!readOnly && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              <input
                placeholder="Caption (optional)"
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                style={{ width: "100%", padding: "6px", fontSize: 11, border: "1px solid var(--stroke2)" }}
              />
              {(selected.milestones ?? []).length > 0 && (
                <select
                  value={photoMilestoneId}
                  onChange={(e) => setPhotoMilestoneId(e.target.value)}
                  style={{ padding: "6px", fontSize: 11, border: "1px solid var(--stroke2)" }}
                >
                  <option value="">Link to milestone (optional)</option>
                  {selected.milestones.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              )}
              <label style={{ fontSize: 11, cursor: photoUploading ? "wait" : "pointer" }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoUpload}
                  disabled={photoUploading}
                  style={{ fontSize: 11 }}
                />
                {photoUploading ? " Uploading…" : " Upload progress photo"}
              </label>
            </div>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ fontSize: 11, marginBottom: 6 }}>Accomplishment Report</div>
            <p style={{ fontSize: 11, color: "var(--muted2)", margin: "0 0 8px", lineHeight: 1.5 }}>
              Export a summary of progress, milestones, budget, issues, and photos.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleDownloadReport}
                disabled={reportLoading}
                style={{ padding: "6px 10px", fontSize: 11, cursor: "pointer" }}
              >
                Download JSON
              </button>
              <button
                type="button"
                onClick={handlePrintReport}
                disabled={reportLoading}
                style={{ padding: "6px 10px", fontSize: 11, cursor: "pointer" }}
              >
                Print / Save PDF
              </button>
            </div>
          </div>

          <div>
            <div className="sectionTitle" style={{ fontSize: 11, marginBottom: 6 }}>Recent Activity</div>
            {(selected.activityLog ?? []).slice(0, 5).map((a, idx) => (
              <div key={`${a.at}-${idx}`} style={{ fontSize: 10, color: "var(--muted2)", padding: "4px 0", borderBottom: "1px solid var(--stroke2)" }}>
                {formatAgo(a.at)} — {a.message}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 8, fontSize: 10, color: "var(--muted2)" }}>
            Model: {MODEL_CATALOG.find((m) => m.type === selected.modelType)?.label ?? selected.modelType}
          </div>
        </div>
      )}
    </>
  );
}
