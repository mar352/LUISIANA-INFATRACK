import { useCallback, useEffect, useMemo, useState } from "react";
import type { EngagementKind, EngagementStatus, EngagementSubmission } from "../types";
import { fetchEngagementList, fetchEngagementPublicStats, patchEngagement } from "../lib/api";
import type { EngagementPublicStats } from "../types";
import { ThemeToggle } from "./ThemeToggle";
import "./EngagementPage.css";

type Props = {
  onBack: () => void;
  /** Return to map and fly to the submission location. */
  onFlyTo?: (lon: number, lat: number) => void;
};

const KIND_LABEL: Record<EngagementKind, string> = {
  feedback: "Feedback",
  issue: "Issue",
  suggestion: "Suggestion",
};

const STATUS_OPTS: EngagementStatus[] = ["new", "reviewing", "resolved", "dismissed"];

export default function EngagementPage({ onBack, onFlyTo }: Props) {
  const [kind, setKind] = useState<EngagementKind | "">("");
  const [status, setStatus] = useState<EngagementStatus | "">("new");
  const [items, setItems] = useState<EngagementSubmission[]>([]);
  const [stats, setStats] = useState<EngagementPublicStats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** Block ghost click from the top-bar button that opened this page. */
  const [listReady, setListReady] = useState(false);

  const selected = items.find((i) => i.id === selectedId) || null;

  useEffect(() => {
    // Swallow the leftover click from "Engagement" nav (mouseup lands on the list).
    const blockGhostClick = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("click", blockGhostClick, true);
    window.addEventListener("mouseup", blockGhostClick, true);
    const t = window.setTimeout(() => {
      window.removeEventListener("click", blockGhostClick, true);
      window.removeEventListener("mouseup", blockGhostClick, true);
      setListReady(true);
    }, 350);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", blockGhostClick, true);
      window.removeEventListener("mouseup", blockGhostClick, true);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setError("");
      const [listRes, statsRes] = await Promise.all([
        fetchEngagementList({
          kind: kind || undefined,
          status: status || undefined,
        }),
        fetchEngagementPublicStats().catch(() => null),
      ]);
      setItems(listRes.submissions);
      if (statsRes?.stats) setStats(statsRes.stats);
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

  const counts = useMemo(() => {
    if (!stats) {
      return { total: items.length, open: 0, closed: 0 };
    }
    return { total: stats.total, open: stats.open, closed: stats.closed };
  }, [stats, items.length]);

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
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="eg-page">
      <header className="eg-top">
        <div className="eg-top-left">
          <button type="button" className="eg-btn" onClick={onBack}>
            ← Map
          </button>
          <div>
            <h1>Citizen engagement</h1>
            <p className="eg-sub">Review public feedback, infrastructure reports, and suggestions</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <section className="eg-kpis" aria-label="Engagement summary">
        <div className="eg-kpi">
          <div className="eg-kpi-label">Total</div>
          <div className="eg-kpi-value">{counts.total}</div>
        </div>
        <div className="eg-kpi">
          <div className="eg-kpi-label">Open</div>
          <div className="eg-kpi-value warn">{counts.open}</div>
        </div>
        <div className="eg-kpi">
          <div className="eg-kpi-label">Closed</div>
          <div className="eg-kpi-value safe">{counts.closed}</div>
        </div>
        <div className="eg-kpi">
          <div className="eg-kpi-label">Showing</div>
          <div className="eg-kpi-value">{items.length}</div>
        </div>
      </section>

      <div className="eg-toolbar">
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
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="eg-btn" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="eg-err" role="alert">
          {error}
        </div>
      )}

      <div className={`eg-body${listReady ? "" : " eg-body--locked"}`}>
        <div className="eg-list">
          {items.length === 0 ? (
            <div className="eg-empty">No submissions match these filters.</div>
          ) : (
            items.map((s) => {
              const isSelected = selectedId === s.id;
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={listReady ? 0 : -1}
                  className={`eg-item${isSelected ? " is-selected" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (!listReady) return;
                    setSelectedId(s.id);
                  }}
                  onKeyDown={(e) => {
                    if (!listReady) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(s.id);
                    }
                  }}
                >
                  <div className="eg-item-top">
                    <span className="eg-kind">{KIND_LABEL[s.kind]}</span>
                    <span className="eg-status">{s.status}</span>
                  </div>
                  <div className="eg-title">{s.title}</div>
                  <div className="eg-meta">{new Date(s.createdAt).toLocaleString()}</div>
                </div>
              );
            })
          )}
        </div>

        <div className="eg-detail">
          {!selected ? (
            <p className="eg-empty">Select a submission to review details, add a staff note, and update status.</p>
          ) : (
            <>
              <div className="eg-item-top">
                <span className="eg-kind">{KIND_LABEL[selected.kind]}</span>
                <span className="eg-id">{selected.id}</span>
              </div>
              <h2>{selected.title}</h2>
              <p className="eg-body-text">{selected.body}</p>
              <div className="eg-meta">
                Category: {selected.category}
                {selected.barangay ? ` · ${selected.barangay}` : ""}
                {selected.projectId ? ` · project ${selected.projectId}` : ""}
              </div>
              {(selected.contactName || selected.contactEmail || selected.contactPhone) && (
                <div className="eg-contact">
                  {[selected.contactName, selected.contactEmail, selected.contactPhone]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
              {selected.lng != null && selected.lat != null && (
                <button
                  type="button"
                  className="eg-btn"
                  style={{ marginTop: 10 }}
                  onClick={() => {
                    onBack();
                    onFlyTo?.(selected.lng!, selected.lat!);
                  }}
                >
                  Open on map
                </button>
              )}

              <label className="eg-field">
                Staff note
                <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>

              <label className="eg-field">
                Status
                <select
                  value={selected.status}
                  disabled={busy}
                  onChange={(e) => void save(e.target.value as EngagementStatus)}
                >
                  {STATUS_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <button type="button" className="eg-btn primary" disabled={busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save note"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
