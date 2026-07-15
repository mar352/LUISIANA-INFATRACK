import { useEffect, useMemo, useState } from "react";
import type {
  Project,
  ProjectStatus,
  LifecyclePhase,
} from "../types";
import {
  BARANGAY_LIST,
  LIFECYCLE_PHASES,
  MODEL_CATALOG,
  PROJECT_STATUS_COLORS,
} from "../types";
import {
  subscribeToProjects,
  subscribeToArchivedProjects,
  updateProjectInFirestore,
  archiveProject,
  restoreProject,
  seedFirestoreFromBackend,
} from "../services/firestore-projects";
import { ThemeToggle } from "./ThemeToggle";
import type { UserRole } from "./Landing";
import "./InventoryPage.css";

type SortKey =
  | "name"
  | "barangay"
  | "modelType"
  | "budgetTotal"
  | "fundingSource"
  | "contractor"
  | "status"
  | "progress"
  | "lifecyclePhase"
  | "updatedAt";

type Props = {
  onBack: () => void;
  backendProjects: Project[];
  currentRole: UserRole | null;
};

const ROLE_PERMISSIONS: Record<string, {
  canEdit: boolean;
  canArchive: boolean;
  canSeeBudget: boolean;
  canSeeArchived: boolean;
  departmentFilter: string | null;
}> = {
  MPDC:             { canEdit: true,  canArchive: true,  canSeeBudget: true,  canSeeArchived: true,  departmentFilter: null },
  Engineer:         { canEdit: true,  canArchive: true,  canSeeBudget: true,  canSeeArchived: true,  departmentFilter: "Engineering" },
  Agriculture:      { canEdit: false, canArchive: false, canSeeBudget: false, canSeeArchived: false, departmentFilter: "Agriculture" },
  "Negosyo Center": { canEdit: false, canArchive: false, canSeeBudget: false, canSeeArchived: false, departmentFilter: null },
  Viewer:           { canEdit: false, canArchive: false, canSeeBudget: false, canSeeArchived: false, departmentFilter: null },
};

export default function InventoryPage({ onBack, backendProjects, currentRole }: Props) {
  const perms = ROLE_PERMISSIONS[currentRole || "Viewer"] ?? ROLE_PERMISSIONS.Viewer;
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);

  const [search, setSearch] = useState("");
  const [filterBarangay, setFilterBarangay] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | "">("");
  const [filterLifecycle, setFilterLifecycle] = useState<LifecyclePhase | "">("");
  const [filterFunding, setFilterFunding] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Project>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (seeded || !backendProjects.length) return;
    seedFirestoreFromBackend(backendProjects).then((didSeed) => {
      setSeeded(true);
      if (didSeed) console.log("[Inventory] Seeded Firestore with", backendProjects.length, "projects");
    });
  }, [backendProjects, seeded]);

  useEffect(() => {
    setLoading(true);
    const unsub1 = subscribeToProjects((p) => {
      setProjects(p);
      setLoading(false);
    });
    const unsub2 = subscribeToArchivedProjects(setArchivedProjects);
    return () => { unsub1(); unsub2(); };
  }, []);

  const fundingSources = useMemo(() => {
    const set = new Set<string>();
    [...projects, ...archivedProjects].forEach((p) => {
      if (p.fundingSource) set.add(p.fundingSource);
    });
    return Array.from(set).sort();
  }, [projects, archivedProjects]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    MODEL_CATALOG.forEach((m) => set.add(m.category));
    return Array.from(set).sort();
  }, []);

  const displayProjects = useMemo(() => {
    const source = tab === "active" ? projects : archivedProjects;
    let list = source.filter((p) => {
      if (perms.departmentFilter && p.department !== perms.departmentFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          p.name.toLowerCase().includes(q) ||
          (p.barangay || "").toLowerCase().includes(q) ||
          (p.contractor || "").toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterBarangay && p.barangay !== filterBarangay) return false;
      if (filterCategory) {
        const cat = MODEL_CATALOG.find((m) => m.type === p.modelType)?.category;
        if (cat !== filterCategory) return false;
      }
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterLifecycle && p.lifecyclePhase !== filterLifecycle) return false;
      if (filterFunding && p.fundingSource !== filterFunding) return false;
      return true;
    });

    list.sort((a, b) => {
      let va: any = (a as any)[sortKey] ?? "";
      let vb: any = (b as any)[sortKey] ?? "";
      if (sortKey === "budgetTotal" || sortKey === "progress") {
        va = Number(va) || 0;
        vb = Number(vb) || 0;
      }
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [projects, archivedProjects, tab, search, filterBarangay, filterCategory, filterStatus, filterLifecycle, filterFunding, sortKey, sortDir]);

  const stats = useMemo(() => {
    const all = projects;
    const totalBudget = all.reduce((s, p) => s + (p.budgetTotal || 0), 0);
    const totalSpent = all.reduce((s, p) => s + (p.budgetSpent || 0), 0);
    const byStatus: Record<string, number> = {};
    all.forEach((p) => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });
    return { total: all.length, totalBudget, totalSpent, byStatus, archived: archivedProjects.length };
  }, [projects, archivedProjects]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function openEdit(p: Project) {
    setEditProject(p);
    setEditDraft({
      name: p.name,
      barangay: p.barangay || "",
      fundingSource: p.fundingSource || "",
      contractor: p.contractor || "",
      lifecyclePhase: p.lifecyclePhase || "Planning",
      status: p.status,
      progress: p.progress,
      budgetTotal: p.budgetTotal,
      budgetSpent: p.budgetSpent,
      startDate: p.startDate || "",
      targetEndDate: p.targetEndDate || "",
      description: p.description || "",
    });
  }

  async function handleSaveEdit() {
    if (!editProject) return;
    setSaving(true);
    try {
      await updateProjectInFirestore(editProject.id, editDraft);
      setEditProject(null);
    } catch (err) {
      console.error("Failed to save:", err);
    }
    setSaving(false);
  }

  async function handleArchive(id: string) {
    try { await archiveProject(id); } catch (err) { console.error(err); }
  }
  async function handleRestore(id: string) {
    try { await restoreProject(id); } catch (err) { console.error(err); }
  }

  function formatCurrency(n: number | null | undefined) {
    if (n == null) return "—";
    return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  const hasFilters = filterBarangay || filterCategory || filterStatus || filterLifecycle || filterFunding;

  return (
    <div className="inv-page">
      {/* ─── Top Bar ─── */}
      <header className="inv-topBar">
        <div className="inv-topBar-brand">
          <div className="inv-topBar-brandText">
            <div className="inv-topBar-title">INFA-TRACK <span>Luisiana</span></div>
            <div className="inv-topBar-sub">Infrastructure Inventory Management{currentRole ? ` · ${currentRole}` : ""}</div>
          </div>
        </div>
        <div className="inv-topBar-toolbar">
          <div className="inv-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              type="text"
              placeholder="Search projects, barangays, contractors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="inv-topBar-actions">
          <ThemeToggle iconOnly />
          <button className="inv-backBtn" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            <span className="inv-backBtn-full">Back to Map</span>
            <span className="inv-backBtn-short">Map</span>
          </button>
        </div>
      </header>

      {/* ─── Stats Strip ─── */}
      <div className="inv-stats">
        <div className="inv-stat">
          <div className="inv-stat-v">{stats.total}</div>
          <div className="inv-stat-l">Total Projects</div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-v">{stats.byStatus["Ongoing"] || 0}</div>
          <div className="inv-stat-l">Ongoing</div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-v">{stats.byStatus["Completed"] || 0}</div>
          <div className="inv-stat-l">Completed</div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-v">{stats.byStatus["Delayed"] || 0}</div>
          <div className="inv-stat-l">Delayed</div>
        </div>
        {perms.canSeeBudget && (
          <div className="inv-stat">
            <div className="inv-stat-v">{formatCurrency(stats.totalBudget)}</div>
            <div className="inv-stat-l">Total Budget</div>
          </div>
        )}
        {perms.canSeeBudget && (
          <div className="inv-stat">
            <div className="inv-stat-v">{formatCurrency(stats.totalSpent)}</div>
            <div className="inv-stat-l">Total Spent</div>
          </div>
        )}
        {perms.canSeeArchived && (
          <div className="inv-stat">
            <div className="inv-stat-v">{stats.archived}</div>
            <div className="inv-stat-l">Archived</div>
          </div>
        )}
      </div>

      {/* ─── Tabs + Filters ─── */}
      <div className="inv-controls">
        <div className="inv-tabs">
          <button className={`inv-tab${tab === "active" ? " active" : ""}`} onClick={() => setTab("active")}>
            Active ({projects.length})
          </button>
          {perms.canSeeArchived && (
            <button className={`inv-tab${tab === "archived" ? " active" : ""}`} onClick={() => setTab("archived")}>
              Archived ({archivedProjects.length})
            </button>
          )}
        </div>
        <div className="inv-filters">
          <select value={filterBarangay} onChange={(e) => setFilterBarangay(e.target.value)}>
            <option value="">All Barangays</option>
            {BARANGAY_LIST.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
            <option value="">All Statuses</option>
            <option value="Planned">Planned</option>
            <option value="Ongoing">Ongoing</option>
            <option value="Delayed">Delayed</option>
            <option value="Completed">Completed</option>
            <option value="Suspended">Suspended</option>
          </select>
          <select value={filterLifecycle} onChange={(e) => setFilterLifecycle(e.target.value as any)}>
            <option value="">All Lifecycle</option>
            {LIFECYCLE_PHASES.map((l) => <option key={l.phase} value={l.phase}>{l.label}</option>)}
          </select>
          <select value={filterFunding} onChange={(e) => setFilterFunding(e.target.value)}>
            <option value="">All Funding</option>
            {fundingSources.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {hasFilters && (
            <button className="inv-clearBtn" onClick={() => {
              setFilterBarangay(""); setFilterCategory(""); setFilterStatus("");
              setFilterLifecycle(""); setFilterFunding("");
            }}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className="inv-tableWrap">
        {loading ? (
          <div className="inv-empty">Loading from Firestore...</div>
        ) : displayProjects.length === 0 ? (
          <div className="inv-empty">No projects found.</div>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                {([
                  ["name", "Project Name"],
                  ["barangay", "Barangay"],
                  ["modelType", "Category"],
                  ...(perms.canSeeBudget ? [["budgetTotal", "Budget"] as [SortKey, string]] : []),
                  ["fundingSource", "Funding"],
                  ["contractor", "Contractor"],
                  ["status", "Status"],
                  ["progress", "Progress"],
                  ["lifecyclePhase", "Lifecycle"],
                  ["updatedAt", "Updated"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} onClick={() => handleSort(key)} className={sortKey === key ? "sorted" : ""}>
                    {label}{sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
                {(perms.canEdit || perms.canArchive) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {displayProjects.map((p) => {
                const cat = MODEL_CATALOG.find((m) => m.type === p.modelType);
                const lc = LIFECYCLE_PHASES.find((l) => l.phase === p.lifecyclePhase);
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <span className="inv-cell-sub">{p.id} · {cat?.label || p.modelType}</span>
                    </td>
                    <td>{p.barangay || "—"}</td>
                    <td><span className="pill">{cat?.category || "—"}</span></td>
                    {perms.canSeeBudget && <td className="inv-cell-num">{formatCurrency(p.budgetTotal)}</td>}
                    <td>{p.fundingSource || "—"}</td>
                    <td>{p.contractor || "—"}</td>
                    <td>
                      <span className="inv-status" style={{ "--status-color": PROJECT_STATUS_COLORS[p.status] } as React.CSSProperties}>
                        {p.status}
                      </span>
                    </td>
                    <td>
                      <div className="inv-progress-cell">
                        <div className="bar"><div style={{ width: `${p.progress}%`, background: PROJECT_STATUS_COLORS[p.status] }} /></div>
                        <span>{p.progress}%</span>
                      </div>
                    </td>
                    <td>
                      {lc ? (
                        <span className="inv-lifecycle" style={{ "--lc-color": lc.color } as React.CSSProperties}>{lc.label}</span>
                      ) : "—"}
                    </td>
                    <td className="inv-cell-date">
                      {new Date(p.updatedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    {(perms.canEdit || perms.canArchive) && (
                      <td>
                        <div className="inv-actions">
                          {perms.canEdit && (
                            <button className="inv-actBtn" title="Edit" onClick={() => openEdit(p)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                            </button>
                          )}
                          {perms.canArchive && tab === "active" && (
                            <button className="inv-actBtn inv-actBtn--warn" title="Archive" onClick={() => handleArchive(p.id)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>
                            </button>
                          )}
                          {perms.canArchive && tab === "archived" && (
                            <button className="inv-actBtn inv-actBtn--safe" title="Restore" onClick={() => handleRestore(p.id)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <footer className="inv-footer">
        Showing {displayProjects.length} of {tab === "active" ? projects.length : archivedProjects.length} projects
      </footer>

      {/* ─── Edit Modal ─── */}
      {editProject && (
        <div className="inv-overlay" onClick={() => setEditProject(null)}>
          <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <h2>{perms.canEdit ? "Edit" : "View"} Infrastructure Record</h2>
              <button className="inv-modal-close" onClick={() => setEditProject(null)}>&times;</button>
            </div>
            <div className="inv-modal-body">
              {/* Lifecycle Timeline */}
              <div className="inv-lifecycle-timeline">
                {LIFECYCLE_PHASES.map((lp) => {
                  const idx = LIFECYCLE_PHASES.findIndex((x) => x.phase === lp.phase);
                  const currentIdx = LIFECYCLE_PHASES.findIndex((x) => x.phase === editDraft.lifecyclePhase);
                  const isActive = idx === currentIdx;
                  const isPast = idx < currentIdx;
                  return (
                    <button
                      key={lp.phase}
                      type="button"
                      className={`inv-lc-step${isActive ? " active" : ""}${isPast ? " past" : ""}`}
                      style={{ "--lc-color": lp.color } as React.CSSProperties}
                      onClick={perms.canEdit ? () => setEditDraft((d) => ({ ...d, lifecyclePhase: lp.phase })) : undefined}
                      disabled={!perms.canEdit}
                    >
                      {lp.label}
                    </button>
                  );
                })}
              </div>

              <div className="inv-form-grid">
                <div className="field">
                  <label>Project Name</label>
                  <input type="text" value={editDraft.name || ""} readOnly={!perms.canEdit} onChange={perms.canEdit ? (e) => setEditDraft((d) => ({ ...d, name: e.target.value })) : undefined} />
                </div>
                <div className="field">
                  <label>Barangay</label>
                  <select value={editDraft.barangay || ""} disabled={!perms.canEdit} onChange={perms.canEdit ? (e) => setEditDraft((d) => ({ ...d, barangay: e.target.value })) : undefined}>
                    <option value="">Select Barangay</option>
                    {BARANGAY_LIST.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Funding Source</label>
                  <input type="text" placeholder="e.g. LGU, DPWH, DSWD" value={editDraft.fundingSource || ""} readOnly={!perms.canEdit} onChange={perms.canEdit ? (e) => setEditDraft((d) => ({ ...d, fundingSource: e.target.value })) : undefined} />
                </div>
                <div className="field">
                  <label>Contractor</label>
                  <input type="text" placeholder="Contractor / implementing agency" value={editDraft.contractor || ""} readOnly={!perms.canEdit} onChange={perms.canEdit ? (e) => setEditDraft((d) => ({ ...d, contractor: e.target.value })) : undefined} />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={editDraft.status || "Planned"} disabled={!perms.canEdit} onChange={perms.canEdit ? (e) => setEditDraft((d) => ({ ...d, status: e.target.value as ProjectStatus })) : undefined}>
                    <option value="Planned">Planned</option>
                    <option value="Ongoing">Ongoing</option>
                    <option value="Delayed">Delayed</option>
                    <option value="Completed">Completed</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
                <div className="field">
                  <label>Progress: {editDraft.progress ?? 0}%</label>
                  <input type="range" min={0} max={100} value={editDraft.progress ?? 0} disabled={!perms.canEdit} onChange={perms.canEdit ? (e) => setEditDraft((d) => ({ ...d, progress: Number(e.target.value) })) : undefined} />
                </div>
                {perms.canSeeBudget && (
                  <div className="field">
                    <label>Budget Total (PHP)</label>
                    <input type="number" value={editDraft.budgetTotal ?? ""} readOnly={!perms.canEdit} onChange={perms.canEdit ? (e) => setEditDraft((d) => ({ ...d, budgetTotal: e.target.value ? Number(e.target.value) : null })) : undefined} />
                  </div>
                )}
                {perms.canSeeBudget && (
                  <div className="field">
                    <label>Budget Spent (PHP)</label>
                    <input type="number" value={editDraft.budgetSpent ?? ""} readOnly={!perms.canEdit} onChange={perms.canEdit ? (e) => setEditDraft((d) => ({ ...d, budgetSpent: Number(e.target.value) || 0 })) : undefined} />
                  </div>
                )}
                <div className="field">
                  <label>Start Date</label>
                  <input type="date" value={editDraft.startDate || ""} readOnly={!perms.canEdit} onChange={perms.canEdit ? (e) => setEditDraft((d) => ({ ...d, startDate: e.target.value })) : undefined} />
                </div>
                <div className="field">
                  <label>Target End Date</label>
                  <input type="date" value={editDraft.targetEndDate || ""} readOnly={!perms.canEdit} onChange={perms.canEdit ? (e) => setEditDraft((d) => ({ ...d, targetEndDate: e.target.value })) : undefined} />
                </div>
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <label>Description</label>
                <textarea rows={3} value={editDraft.description || ""} readOnly={!perms.canEdit} onChange={perms.canEdit ? (e) => setEditDraft((d) => ({ ...d, description: e.target.value })) : undefined} />
              </div>

              {perms.canSeeBudget && editDraft.budgetTotal != null && editDraft.budgetTotal > 0 && (
                <div className="inv-budget-bar">
                  <span className="inv-budget-label">
                    Budget Utilization: {Math.round(((editDraft.budgetSpent || 0) / editDraft.budgetTotal) * 100)}%
                  </span>
                  <div className="bar">
                    <div style={{
                      width: `${Math.min(100, ((editDraft.budgetSpent || 0) / editDraft.budgetTotal) * 100)}%`,
                      background: ((editDraft.budgetSpent || 0) / editDraft.budgetTotal) > 1
                        ? "var(--danger)"
                        : "var(--amber-sharp)",
                    }} />
                  </div>
                </div>
              )}

              {editProject.activityLog.length > 0 && (
                <div className="inv-activity">
                  <div className="inv-activity-head">Recent Activity</div>
                  {editProject.activityLog.slice(0, 8).map((a, i) => (
                    <div key={i} className="inv-activity-row">
                      <span className="inv-activity-date">
                        {new Date(a.at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                      </span>
                      {a.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="inv-modal-foot">
              <button className="btn-ghost" onClick={() => setEditProject(null)}>{perms.canEdit ? "Cancel" : "Close"}</button>
              {perms.canEdit && (
                <button className="btn-amber" disabled={saving} onClick={handleSaveEdit}>
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
