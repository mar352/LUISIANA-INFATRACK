import { useEffect, useMemo, useState } from "react";
import {
  subscribeToAuditLogs,
  type AuditCategory,
  type AuditEvent,
} from "../services/firestore-audit";
import { ThemeToggle } from "./ThemeToggle";
import "./AuditPage.css";

type Props = {
  onBack: () => void;
};

const CATEGORIES: { id: AuditCategory | ""; label: string }[] = [
  { id: "", label: "All" },
  { id: "auth", label: "Sign-in" },
  { id: "project", label: "Projects" },
  { id: "planning", label: "Planning" },
  { id: "document", label: "Documents" },
  { id: "engagement", label: "Engagement" },
  { id: "system", label: "System" },
];

function formatWhen(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AuditPage({ onBack }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = subscribeToAuditLogs(
      (list) => {
        setEvents(list);
        setLoading(false);
      },
      { limitTo: 300 },
      (msg) => {
        setError(msg);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (category && e.category !== category) return false;
      if (!q) return true;
      return (
        e.summary.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        (e.entityName || "").toLowerCase().includes(q)
      );
    });
  }, [events, category, search]);

  function exportCsv() {
    const header = ["When", "User", "Role", "Action", "Category", "Summary", "Entity"];
    const rows = filtered.map((e) => [
      e.at,
      e.username,
      e.role,
      e.action,
      e.category,
      e.summary.replace(/"/g, '""'),
      e.entityName || e.entityId || "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `infatrack-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="audit-page">
      <header className="audit-top">
        <div className="audit-top-left">
          <button type="button" className="audit-back" onClick={onBack}>
            ← Map
          </button>
          <div>
            <h1>Activity log</h1>
            <p className="audit-sub">Audit trail of sign-ins and municipal record changes</p>
          </div>
        </div>
        <div className="audit-top-actions">
          <ThemeToggle iconOnly />
          <button type="button" className="audit-export" onClick={exportCsv} disabled={filtered.length === 0}>
            Export CSV
          </button>
        </div>
      </header>

      <div className="audit-toolbar">
        <input
          type="search"
          className="audit-search"
          placeholder="Search user, action, or summary"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="audit-cats" role="tablist">
          {CATEGORIES.map((c) => (
            <button
              key={c.id || "all"}
              type="button"
              className={`audit-cat${category === c.id ? " is-on" : ""}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="audit-body">
        {loading && <p className="audit-empty">Loading activity…</p>}
        {error && <p className="audit-empty">Could not load the audit trail: {error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="audit-empty">No matching events yet. Sign-ins and record edits will appear here.</p>
        )}
        {!loading && filtered.length > 0 && (
          <table className="audit-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="audit-when">{formatWhen(e.at)}</td>
                  <td>
                    <div className="audit-who">{e.username}</div>
                    <div className="audit-role">{e.role}</div>
                  </td>
                  <td>
                    <span className={`audit-pill audit-pill--${e.category}`}>{e.action}</span>
                  </td>
                  <td>{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
