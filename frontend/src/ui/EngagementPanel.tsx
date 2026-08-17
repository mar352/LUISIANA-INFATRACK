import { useCallback, useEffect, useState } from "react";
import type { EngagementKind, EngagementStatus, EngagementSubmission } from "../types";
import { fetchEngagementList, patchEngagement } from "../lib/api";
import "./EngagementPanel.css";

type Props = {
  onFlyTo?: (lon: number, lat: number) => void;
};

const KIND_LABEL: Record<EngagementKind, string> = {
  feedback: "Feedback",
  issue: "Issue",
  suggestion: "Suggestion",
};

const STATUS_OPTS: EngagementStatus[] = ["new", "reviewing", "resolved", "dismissed"];

export default function EngagementPanel({ onFlyTo }: Props) {
  const [kind, setKind] = useState<EngagementKind | "">("");
  const [status, setStatus] = useState<EngagementStatus | "">("new");
  const [items, setItems] = useState<EngagementSubmission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = items.find((i) => i.id === selectedId) || null;

  const load = useCallback(async () => {
    try {
      setError("");
      const res = await fetchEngagementList({
        kind: kind || undefined,
        status: status || undefined,
      });
      setItems(res.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load submissions");
    }
  }, [kind, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedId && !items.some((s) => s.id === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  useEffect(() => {
    setNote(selected?.staffNote || "");
  }, [selected?.id, selected?.staffNote]);

  const save = async (nextStatus?: EngagementStatus) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await patchEngagement(selected.id, {
        status: nextStatus ?? selected.status,
        staffNote: note,
      });
      setItems((prev) => prev.map((i) => (i.id === res.submission.id ? res.submission : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ep-root">
      <div className="sectionTitle" style={{ marginBottom: 10 }}>
        Citizen engagement
      </div>
      <p className="ep-help">Review feedback, infrastructure reports, and suggestions from the public portal.</p>

      <div className="ep-filters">
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as EngagementKind | "")}>
            <option value="">All</option>
            <option value="issue">Issues</option>
            <option value="feedback">Feedback</option>
            <option value="suggestion">Suggestions</option>
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as EngagementStatus | "")}>
            <option value="">All</option>
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="button" className="ep-btn" onClick={() => void load()}>Refresh</button>
      </div>

      {error && <div className="ep-err">{error}</div>}

      <div className="ep-list">
        {items.length === 0 ? (
          <div className="ep-empty">No submissions match these filters.</div>
        ) : (
          items.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`ep-item${selectedId === s.id ? " active" : ""}`}
              onClick={() => setSelectedId(s.id)}
            >
              <div className="ep-item-top">
                <span className="ep-kind">{KIND_LABEL[s.kind]}</span>
                <span className="ep-status">{s.status}</span>
              </div>
              <div className="ep-title">{s.title}</div>
              <div className="ep-meta">{new Date(s.createdAt).toLocaleString()}</div>
            </button>
          ))
        )}
      </div>

      {selected && (
        <div className="ep-detail card">
          <div className="ep-item-top">
            <span className="ep-kind">{KIND_LABEL[selected.kind]}</span>
            <span className="ep-id">{selected.id}</span>
          </div>
          <h3>{selected.title}</h3>
          <p className="ep-body">{selected.body}</p>
          <div className="ep-meta">
            Category: {selected.category}
            {selected.barangay ? ` · ${selected.barangay}` : ""}
            {selected.projectId ? ` · project ${selected.projectId}` : ""}
          </div>
          {(selected.contactName || selected.contactEmail || selected.contactPhone) && (
            <div className="ep-contact">
              {[selected.contactName, selected.contactEmail, selected.contactPhone]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
          {selected.lng != null && selected.lat != null && (
            <button
              type="button"
              className="ep-btn"
              style={{ marginTop: 8 }}
              onClick={() => onFlyTo?.(selected.lng!, selected.lat!)}
            >
              Fly to location
            </button>
          )}

          <label className="ep-note">
            Staff note
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <label>
            Status
            <select
              value={selected.status}
              disabled={busy}
              onChange={(e) => void save(e.target.value as EngagementStatus)}
            >
              {STATUS_OPTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <button type="button" className="ep-btn primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save note"}
          </button>
        </div>
      )}
    </div>
  );
}
