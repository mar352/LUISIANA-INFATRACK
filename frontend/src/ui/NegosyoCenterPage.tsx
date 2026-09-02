import { useState, useMemo } from "react";
import { BARANGAY_LIST } from "../types";
import "./NegosyoCenterPage.css";

export type BusinessEntry = {
  id: string;
  permitNo: string;
  businessName: string;
  tradeName?: string;
  ownerName: string;
  barangay: string;
  address: string;
  category: "Retail / Commercial" | "Food & Dining" | "Agri-Commercial" | "Services" | "Handicraft / MSME" | "Industrial";
  capitalization: number;
  dtiSecNo: string;
  status: "active" | "pending" | "for_review";
  dateApplied: string;
  dateApproved?: string;
};

type Props = {
  onLogout: () => void;
};

/* ── Vector SVG Icons ── */
const IconBuilding = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
    <line x1="9" y1="22" x2="9" y2="22.01"/><line x1="15" y1="22" x2="15" y2="22.01"/>
    <line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/>
    <line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/>
    <line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/>
  </svg>
);

const IconSearch = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconPlus = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const IconCheck = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const IconClock = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const IconTrash = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

export default function NegosyoCenterPage({ onLogout }: Props) {
  const [businesses, setBusinesses] = useState<BusinessEntry[]>(() => {
    const saved = localStorage.getItem("infatrack_negosyo_businesses");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  const [search, setSearch] = useState("");
  const [filterBarangay, setFilterBarangay] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states for new entry
  const [bName, setBName] = useState("");
  const [bTrade, setBTrade] = useState("");
  const [bOwner, setBOwner] = useState("");
  const [bBarangay, setBBarangay] = useState("Poblacion Zone I");
  const [bAddress, setBAddress] = useState("");
  const [bCategory, setBCategory] = useState<BusinessEntry["category"]>("Retail / Commercial");
  const [bCapital, setBCapital] = useState<number | "">("");
  const [bDti, setBDti] = useState("");

  const saveBusinesses = (updated: BusinessEntry[]) => {
    setBusinesses(updated);
    localStorage.setItem("infatrack_negosyo_businesses", JSON.stringify(updated));
  };

  const handleApprove = (id: string) => {
    const updated = businesses.map((b) =>
      b.id === id
        ? {
            ...b,
            status: "active" as const,
            dateApproved: new Date().toISOString().slice(0, 10),
          }
        : b
    );
    saveBusinesses(updated);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Sigurado ka bang nais mong alisin ang business record na ito?")) return;
    const updated = businesses.filter((b) => b.id !== id);
    saveBusinesses(updated);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bName.trim() || !bOwner.trim()) {
      alert("Pakilagay ang Business Name at Owner Name.");
      return;
    }

    const currentYear = new Date().getFullYear();
    const newId = `B-${Date.now().toString().slice(-4)}`;
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    const newEntry: BusinessEntry = {
      id: newId,
      permitNo: `BP-LUIS-${currentYear}-${randomSeq}`,
      businessName: bName.trim(),
      tradeName: bTrade.trim() || undefined,
      ownerName: bOwner.trim(),
      barangay: bBarangay,
      address: bAddress.trim(),
      category: bCategory,
      capitalization: typeof bCapital === "number" ? bCapital : 0,
      dtiSecNo: bDti.trim() || `DTI-IV-A-${currentYear}-${randomSeq}`,
      status: "active",
      dateApplied: new Date().toISOString().slice(0, 10),
      dateApproved: new Date().toISOString().slice(0, 10),
    };

    saveBusinesses([newEntry, ...businesses]);
    setShowAddModal(false);

    // Reset
    setBName("");
    setBTrade("");
    setBOwner("");
    setBAddress("");
    setBCapital("");
    setBDti("");
  };

  const filtered = useMemo(() => {
    return businesses.filter((b) => {
      if (filterBarangay && b.barangay !== filterBarangay) return false;
      if (filterStatus && b.status !== filterStatus) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = b.businessName.toLowerCase().includes(q);
        const matchOwner = b.ownerName.toLowerCase().includes(q);
        const matchPermit = b.permitNo.toLowerCase().includes(q);
        const matchDti = b.dtiSecNo.toLowerCase().includes(q);
        if (!matchName && !matchOwner && !matchPermit && !matchDti) return false;
      }
      return true;
    });
  }, [businesses, filterBarangay, filterStatus, search]);

  const activeCount = businesses.filter((b) => b.status === "active").length;
  const pendingCount = businesses.filter((b) => b.status === "pending").length;
  const reviewCount = businesses.filter((b) => b.status === "for_review").length;

  return (
    <div className="nc-page-root">
      {/* Top Header */}
      <header className="nc-header">
        <div className="nc-brand">
          <img src="/logo.png" alt="Bayan ng Luisiana" className="nc-seal" />
          <div className="nc-title-block">
            <div className="nc-sub">Bayan ng Luisiana · DTI Partner Desk</div>
            <h1>Business Permit & Licensing Office (Negosyo Center)</h1>
          </div>
        </div>

        <div className="nc-header-actions">
          <div className="nc-user-pill">
            <IconBuilding size={14} />
            <span>Naka-login: <strong>Negosyo Center Desk</strong></span>
          </div>
          <button type="button" className="nc-logout-btn" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="nc-main">
        {/* KPI Summary Cards */}
        <div className="nc-stats-grid">
          <div className="nc-stat-card" style={{ "--stat-color": "#ffc107" } as any}>
            <div className="nc-stat-val">{businesses.length}</div>
            <div className="nc-stat-lbl">Total Registered Businesses</div>
          </div>
          <div className="nc-stat-card" style={{ "--stat-color": "#10b981" } as any}>
            <div className="nc-stat-val" style={{ color: "#34d399" }}>{activeCount}</div>
            <div className="nc-stat-lbl">Active / Approved Permits (CY {new Date().getFullYear()})</div>
          </div>
          <div className="nc-stat-card" style={{ "--stat-color": "#f59e0b" } as any}>
            <div className="nc-stat-val" style={{ color: "#fbbf24" }}>{pendingCount}</div>
            <div className="nc-stat-lbl">Pending Applications</div>
          </div>
          <div className="nc-stat-card" style={{ "--stat-color": "#3b82f6" } as any}>
            <div className="nc-stat-val" style={{ color: "#60a5fa" }}>{reviewCount}</div>
            <div className="nc-stat-lbl">For DTI / LGU Verification</div>
          </div>
        </div>

        {/* Toolbar & Actions */}
        <div className="nc-toolbar">
          <div className="nc-filters-group">
            <input
              type="text"
              placeholder="Search business name, owner, permit no…"
              className="nc-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="nc-select"
              value={filterBarangay}
              onChange={(e) => setFilterBarangay(e.target.value)}
            >
              <option value="">Lahat ng Barangay (23)</option>
              {BARANGAY_LIST.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <select
              className="nc-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Lahat ng Status</option>
              <option value="active">Active / Approved</option>
              <option value="pending">Pending</option>
              <option value="for_review">For Review</option>
            </select>
          </div>

          <button
            type="button"
            className="nc-primary-btn"
            onClick={() => setShowAddModal(true)}
          >
            <IconPlus size={14} /> + Bagong Business Permit
          </button>
        </div>

        {/* Registry Table */}
        <div className="nc-table-card">
          <div className="nc-table-wrap">
            <table className="nc-table">
              <thead>
                <tr>
                  <th>Permit No. / DTI</th>
                  <th>Pangalan ng Negosyo</th>
                  <th>May-ari (Proprietor)</th>
                  <th>Barangay & Lokasyon</th>
                  <th>Kategorya</th>
                  <th>Capitalization</th>
                  <th>Status</th>
                  <th>Aksyon</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8" }}>
                      <div style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
                        <div style={{ color: "#ffc107", marginBottom: 12 }}>
                          <IconBuilding size={36} />
                        </div>
                        <h3 style={{ margin: "0 0 6px", color: "#f8fafc", fontSize: 16 }}>
                          Walang Nakatalang Business Permit Record
                        </h3>
                        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
                          Wala pang naipapasok na rehistro ng negosyo. Gamitin ang pindutan sa ibaba upang magrehistro ng bagong commercial establishment sa Luisiana.
                        </p>
                        <button
                          type="button"
                          className="nc-primary-btn"
                          onClick={() => setShowAddModal(true)}
                        >
                          <IconPlus size={14} /> + Magrehistro ng Unang Negosyo
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: "#ffc107" }}>{b.permitNo}</div>
                        <div className="nc-b-sub">{b.dtiSecNo}</div>
                      </td>
                      <td>
                        <div className="nc-b-name">{b.businessName}</div>
                        {b.tradeName && <div className="nc-b-sub">Trade: {b.tradeName}</div>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{b.ownerName}</div>
                      </td>
                      <td>
                        <div>{b.barangay}</div>
                        <div className="nc-b-sub">{b.address}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: "#cbd5e1" }}>{b.category}</span>
                      </td>
                      <td>
                        <strong>₱{b.capitalization.toLocaleString()}</strong>
                      </td>
                      <td>
                        {b.status === "active" ? (
                          <span className="nc-status-badge active">
                            <IconCheck size={11} /> Approved
                          </span>
                        ) : b.status === "pending" ? (
                          <span className="nc-status-badge pending">
                            <IconClock size={11} /> Pending
                          </span>
                        ) : (
                          <span className="nc-status-badge review">
                            <IconClock size={11} /> For Review
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {b.status !== "active" && (
                            <button
                              type="button"
                              className="nc-action-btn approve"
                              onClick={() => handleApprove(b.id)}
                            >
                              Aprubahan
                            </button>
                          )}
                          <button
                            type="button"
                            className="nc-action-btn"
                            onClick={() => alert(`Business Permit: ${b.permitNo}\nBusiness: ${b.businessName}\nProprietor: ${b.ownerName}\nBarangay: ${b.barangay}\nCapital: ₱${b.capitalization.toLocaleString()}\nStatus: ${b.status.toUpperCase()}`)}
                          >
                            Tingnan
                          </button>
                          <button
                            type="button"
                            className="nc-action-btn"
                            style={{ color: "#fca5a5" }}
                            title="Alisin ang record"
                            onClick={() => handleDelete(b.id)}
                          >
                            <IconTrash size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* New Business Registration Modal */}
      {showAddModal && (
        <div className="nc-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="nc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="nc-modal-head">
              <h2>Magrehistro ng Bagong Negosyo (BPLO)</h2>
              <button
                type="button"
                className="nc-modal-close"
                onClick={() => setShowAddModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit}>
              <div className="nc-modal-body">
                <div className="nc-form-grid">
                  <div className="nc-form-field full">
                    <label>Pangalan ng Negosyo (Business Name) *</label>
                    <input
                      type="text"
                      placeholder="Hal. Luisiana Fresh Poultry & Farm Supply"
                      value={bName}
                      onChange={(e) => setBName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="nc-form-field">
                    <label>Trade Name / Signboard</label>
                    <input
                      type="text"
                      placeholder="Hal. Luisiana Farm Mart"
                      value={bTrade}
                      onChange={(e) => setBTrade(e.target.value)}
                    />
                  </div>

                  <div className="nc-form-field">
                    <label>Pangalan ng May-ari (Proprietor) *</label>
                    <input
                      type="text"
                      placeholder="Hal. Juan Dela Cruz"
                      value={bOwner}
                      onChange={(e) => setBOwner(e.target.value)}
                      required
                    />
                  </div>

                  <div className="nc-form-field">
                    <label>Barangay sa Luisiana *</label>
                    <select
                      value={bBarangay}
                      onChange={(e) => setBBarangay(e.target.value)}
                    >
                      {BARANGAY_LIST.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="nc-form-field">
                    <label>Uri ng Negosyo (Category)</label>
                    <select
                      value={bCategory}
                      onChange={(e) =>
                        setBCategory(e.target.value as BusinessEntry["category"])
                      }
                    >
                      <option value="Retail / Commercial">Retail / Commercial (Tindahan)</option>
                      <option value="Food & Dining">Food & Dining (Kainan / Resto)</option>
                      <option value="Agri-Commercial">Agri-Commercial (Poultry / Feed)</option>
                      <option value="Handicraft / MSME">Handicraft / MSME (Pandan Crafts)</option>
                      <option value="Services">Services / Repair Shop</option>
                      <option value="Industrial">Industrial / Processing</option>
                    </select>
                  </div>

                  <div className="nc-form-field full">
                    <label>Eksaktong Tirahan / Purok Address</label>
                    <input
                      type="text"
                      placeholder="Purok / Kalye, Barangay, Luisiana"
                      value={bAddress}
                      onChange={(e) => setBAddress(e.target.value)}
                    />
                  </div>

                  <div className="nc-form-field">
                    <label>Inisyal na Capitalization (₱)</label>
                    <input
                      type="number"
                      placeholder="Hal. 200000"
                      value={bCapital}
                      onChange={(e) =>
                        setBCapital(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </div>

                  <div className="nc-form-field">
                    <label>DTI / SEC Registration No.</label>
                    <input
                      type="text"
                      placeholder="Hal. DTI-IV-A-2026-0912"
                      value={bDti}
                      onChange={(e) => setBDti(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="nc-modal-foot">
                <button
                  type="button"
                  className="nc-action-btn"
                  onClick={() => setShowAddModal(false)}
                >
                  Kanselahin
                </button>
                <button type="submit" className="nc-primary-btn">
                  I-rehistro at Aprubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
