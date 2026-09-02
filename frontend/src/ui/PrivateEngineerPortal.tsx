import React, { useEffect, useState, useMemo } from "react";
import type { SessionUser } from "../services/auth";
import { fetchCitizenApplications, uploadCitizenDocument } from "../lib/api";
import { BARANGAY_LIST } from "../types";
import { ThemeToggle } from "./ThemeToggle";
import "./PrivateEngineerPortal.css";

type Tab = "projects" | "plans" | "siting" | "progress";

type Props = {
  onBack: () => void;
  session: SessionUser | null;
  onOpenLiveMap?: () => void;
};

/* ── Vector SVG Icons ── */
const IconBuilding = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
    <path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/>
  </svg>
);

const IconFileText = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
);

const IconCompass = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
  </svg>
);

const IconTool = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);

const IconUpload = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const IconCheckCircle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52c41a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const IconAlert = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fa8c16" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

export function PrivateEngineerPortal({ onBack, session, onOpenLiveMap }: Props) {
  const [tab, setTab] = useState<Tab>("projects");
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedApp, setSelectedApp] = useState<any | null>(null);

  // Siting tool calculator state
  const [calcBarangay, setCalcBarangay] = useState("Poblacion Zone I");
  const [calcLat, setCalcLat] = useState("14.1854");
  const [calcLon, setCalcLon] = useState("121.5095");
  const [calcBuildingHeightM, setCalcBuildingHeightM] = useState("8.5");
  const [calcResult, setCalcResult] = useState<{
    faultDistanceM: number;
    slopePct: number;
    floodRisk: "Ligtas" | "Katamtaman" | "Mataas";
    zoningZone: string;
    safeToBuild: boolean;
  } | null>(null);

  // Plan upload form
  const [selectedUploadAppId, setSelectedUploadAppId] = useState("");
  const [planCategory, setPlanCategory] = useState("structural");
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Construction milestone form
  const [milestoneStage, setMilestoneStage] = useState("Foundation / Footing Excavation");
  const [milestonePct, setMilestonePct] = useState(25);
  const [milestoneNotes, setMilestoneNotes] = useState("");
  const [milestoneLogs, setMilestoneLogs] = useState<
    { stage: string; pct: number; date: string; notes: string; appRef: string }[]
  >([
    {
      stage: "Foundation / Footing Excavation",
      pct: 20,
      date: new Date(Date.now() - 86400000 * 5).toLocaleDateString(),
      notes: "Excavation to -1.8m hardpan depth completed. Rebar cages delivered.",
      appRef: "LUIS-ZC-2026-4349",
    },
  ]);

  useEffect(() => {
    fetchCitizenApplications()
      .then((list) => {
        setApplications(Array.isArray(list) ? list : []);
        if (list.length > 0 && !selectedUploadAppId) {
          setSelectedUploadAppId(list[0].id || list[0].trackingNumber);
        }
      })
      .catch((err) => console.warn("[PrivateEngineerPortal] fetch failed:", err))
      .finally(() => setLoading(false));
  }, []);

  const filteredApps = useMemo(() => {
    return applications.filter((app) => {
      const matchSearch =
        !search.trim() ||
        app.trackingNumber?.toLowerCase().includes(search.toLowerCase()) ||
        app.applicant?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        app.property?.proposedBuildingType?.toLowerCase().includes(search.toLowerCase()) ||
        app.applicant?.barangay?.toLowerCase().includes(search.toLowerCase());

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "approved" && app.status === "approved") ||
        (statusFilter === "in_review" && (app.status === "in_review" || app.status === "ocular_inspection")) ||
        (statusFilter === "submitted" && (app.status === "submitted" || !app.status));

      return matchSearch && matchStatus;
    });
  }, [applications, search, statusFilter]);

  const kpis = useMemo(() => {
    const total = applications.length;
    const approved = applications.filter((a) => a.status === "approved").length;
    const inReview = applications.filter((a) => a.status === "in_review" || a.status === "ocular_inspection").length;
    const pending = applications.filter((a) => a.status === "submitted" || !a.status).length;
    return { total, approved, inReview, pending };
  }, [applications]);

  const handleRunSitingCheck = () => {
    const lat = Number(calcLat);
    const lon = Number(calcLon);
    // Approximate Luisiana faultline & slope assessment
    const faultDistanceM = Math.round(180 + Math.abs(lat - 14.185) * 12000);
    const slopePct = Math.round(6 + (Math.abs(lon - 121.509) * 250) % 18);
    const floodRisk = slopePct < 8 ? "Katamtaman" : "Ligtas";
    const safeToBuild = faultDistanceM > 15 && slopePct < 30;

    setCalcResult({
      faultDistanceM,
      slopePct,
      floodRisk,
      zoningZone: calcBarangay.includes("Zone") ? "R-2 Medium Density Residential" : "A-1 Agricultural / Rural",
      safeToBuild,
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadSuccess(false);

    try {
      for (let i = 0; i < files.length; i++) {
        await uploadCitizenDocument(files[i]);
      }
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 4000);
    } catch (err) {
      console.error(err);
      alert("Hindi ma-upload ang file. Pakisubukang muli.");
    } finally {
      setUploading(false);
    }
  };

  const handleAddMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!milestoneNotes.trim()) return;
    const newLog = {
      stage: milestoneStage,
      pct: milestonePct,
      date: new Date().toLocaleDateString(),
      notes: milestoneNotes.trim(),
      appRef: selectedUploadAppId || "General Project",
    };
    setMilestoneLogs([newLog, ...milestoneLogs]);
    setMilestoneNotes("");
    alert("Matagumpay na naitala ang inspection milestone para sa MEO review!");
  };

  return (
    <div className="pe-portal">
      {/* Header */}
      <header className="pe-header">
        <div className="pe-header-left">
          <div className="pe-brand-title">
            <h1>
              <IconBuilding /> INFA-TRACK
            </h1>
            <span>Private Professional & Contractor Portal</span>
          </div>
        </div>

        <nav className="pe-header-center" aria-label="Portal Navigation">
          <button
            type="button"
            className={`pe-nav-btn ${tab === "projects" ? "active" : ""}`}
            onClick={() => setTab("projects")}
          >
            <IconBuilding /> Mga Proyekto
          </button>
          <button
            type="button"
            className={`pe-nav-btn ${tab === "plans" ? "active" : ""}`}
            onClick={() => setTab("plans")}
          >
            <IconFileText /> Blueprints & Plano
          </button>
          <button
            type="button"
            className={`pe-nav-btn ${tab === "siting" ? "active" : ""}`}
            onClick={() => setTab("siting")}
          >
            <IconCompass /> Geohazard Siting (3D GIS)
          </button>
          <button
            type="button"
            className={`pe-nav-btn ${tab === "progress" ? "active" : ""}`}
            onClick={() => setTab("progress")}
          >
            <IconTool /> Construction Log
          </button>
        </nav>

        <div className="pe-header-right">
          <div className="pe-profile-chip">
            <div className="pe-profile-avatar">PE</div>
            <div className="pe-profile-info">
              <strong>Engr. Pedro Reyes, CE</strong>
              <span>PRC Lic. #0184920 · PTR 2026</span>
            </div>
          </div>
          <ThemeToggle iconOnly />
          <button type="button" className="pe-btn-out" onClick={onBack} title="Sign Out">
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="pe-body">
        {/* KPI Cards */}
        <div className="pe-kpi-grid">
          <div className="pe-kpi-card">
            <div className="pe-kpi-info">
              <h4>Kabuuang Proyekto</h4>
              <div className="pe-kpi-num">{kpis.total}</div>
            </div>
            <div className="pe-kpi-icon">
              <IconBuilding />
            </div>
          </div>
          <div className="pe-kpi-card">
            <div className="pe-kpi-info">
              <h4>Naaprubahang Zoning</h4>
              <div className="pe-kpi-num" style={{ color: "#52c41a" }}>{kpis.approved}</div>
            </div>
            <div className="pe-kpi-icon" style={{ background: "rgba(82, 196, 26, 0.12)", color: "#52c41a" }}>
              <IconCheckCircle />
            </div>
          </div>
          <div className="pe-kpi-card">
            <div className="pe-kpi-info">
              <h4>Under MEO / MPDC Review</h4>
              <div className="pe-kpi-num" style={{ color: "#fa8c16" }}>{kpis.inReview}</div>
            </div>
            <div className="pe-kpi-icon" style={{ background: "rgba(250, 140, 22, 0.12)", color: "#fa8c16" }}>
              <IconAlert />
            </div>
          </div>
          <div className="pe-kpi-card">
            <div className="pe-kpi-info">
              <h4>For Technical Submission</h4>
              <div className="pe-kpi-num" style={{ color: "#1890ff" }}>{kpis.pending}</div>
            </div>
            <div className="pe-kpi-icon" style={{ background: "rgba(24, 144, 255, 0.12)", color: "#1890ff" }}>
              <IconFileText />
            </div>
          </div>
        </div>

        {/* TAB 1: PROJECTS LIST */}
        {tab === "projects" && (
          <section className="pe-section-card">
            <div className="pe-section-header">
              <div>
                <h2><IconBuilding /> Talaan ng mga Ipinapagawang Pribadong Gusali</h2>
                <p>Mga aplikasyon ng kliyente kung saan kayo ang nakatalagang Civil Engineer / Arkitekto.</p>
              </div>
              {onOpenLiveMap && (
                <button type="button" className="pe-btn-action pe-btn-primary" onClick={onOpenLiveMap}>
                  <IconCompass /> Buksan sa 3D Mapa
                </button>
              )}
            </div>

            <div className="pe-toolbar">
              <input
                type="text"
                className="pe-search-input"
                placeholder="Maghanap ayon sa Aplikante, Tracking No., o Barangay..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="pe-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Lahat ng Katayuan</option>
                <option value="submitted">Bago / For Submission</option>
                <option value="in_review">Nasa MEO / MPDC Review</option>
                <option value="approved">Approved Zoning / Permit Issued</option>
              </select>
            </div>

            <div className="pe-table-wrap">
              <table className="pe-table">
                <thead>
                  <tr>
                    <th>Tracking Reference</th>
                    <th>Aplikante / May-ari</th>
                    <th>Uri ng Gusali</th>
                    <th>Barangay</th>
                    <th>Sukat ng Lupa</th>
                    <th>Katayuan</th>
                    <th>Aksyon</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
                        Kinukuha ang mga proyekto...
                      </td>
                    </tr>
                  ) : filteredApps.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
                        Walang nakitang proyekto.
                      </td>
                    </tr>
                  ) : (
                    filteredApps.map((app) => (
                      <tr key={app.id || app.trackingNumber}>
                        <td>
                          <strong>{app.trackingNumber}</strong>
                        </td>
                        <td>{app.applicant?.fullName || "—"}</td>
                        <td>{app.property?.proposedBuildingType || "Residential"}</td>
                        <td>{app.applicant?.barangay || "—"}</td>
                        <td>{app.property?.lotAreaSqM ? `${app.property.lotAreaSqM} sq.m.` : "—"}</td>
                        <td>
                          <span
                            className={`pe-status-badge ${
                              app.status === "approved"
                                ? "approved"
                                : app.status === "in_review"
                                ? "in_review"
                                : "submitted"
                            }`}
                          >
                            {app.status === "approved"
                              ? "✓ Zoning Approved"
                              : app.status === "in_review"
                              ? "⏳ Under MEO Review"
                              : "📄 Submitted"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="pe-btn-action"
                            onClick={() => setSelectedApp(app)}
                          >
                            Tingnan Detalye
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 2: BLUEPRINTS & PLANS UPLOADER */}
        {tab === "plans" && (
          <section className="pe-section-card">
            <div className="pe-section-header">
              <div>
                <h2><IconFileText /> Pag-upload ng Nilagdaang Plano & Blueprints</h2>
                <p>I-attach ang nilagdaan at selyadong plano (PDF/CAD) para sa pagsusuri ng Municipal Engineering Office (MEO).</p>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: 6 }}>
                Piliin ang Proyekto:
              </label>
              <select
                className="pe-select"
                style={{ width: "100%", maxWidth: 480 }}
                value={selectedUploadAppId}
                onChange={(e) => setSelectedUploadAppId(e.target.value)}
              >
                {applications.map((app) => (
                  <option key={app.id || app.trackingNumber} value={app.id || app.trackingNumber}>
                    {app.trackingNumber} — {app.applicant?.fullName} ({app.property?.proposedBuildingType})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: 6 }}>
                Kategorya ng Dokumento:
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { id: "structural", label: "📐 Architectural & Structural Plan (PDF)" },
                  { id: "calc", label: "📊 Structural Computations & Analysis" },
                  { id: "soil", label: "🧪 Geotechnical & Soil Boring Test" },
                  { id: "mep", label: "⚡ Electrical & Sanitary Layout" },
                  { id: "model", label: "🧊 3D CAD/BIM Model (.glb / .obj)" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`pe-btn-action ${planCategory === cat.id ? "pe-btn-primary" : ""}`}
                    onClick={() => setPlanCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pe-upload-grid">
              <label className="pe-upload-box">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.dwg,.glb,.obj,.doc,.docx"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                <IconUpload />
                <h4>Pumili ng File o I-drag Dito</h4>
                <p>Tumatanggap ng PDF, DWG, GLB, JPG, PNG (Max: 25 MB)</p>
                <span className="pe-btn-action pe-btn-primary">
                  {uploading ? "Nag-a-upload..." : "Pumili ng Plano mula sa Computer"}
                </span>
              </label>
            </div>

            {uploadSuccess && (
              <div style={{ marginTop: 16, padding: "12px 16px", background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 8, color: "#52c41a", fontWeight: 600 }}>
                ✓ Matagumpay na nai-upload ang plano at naisumite sa Municipal Engineering Office (MEO)!
              </div>
            )}
          </section>
        )}

        {/* TAB 3: GEOHAZARD SITING TOOL */}
        {tab === "siting" && (
          <section className="pe-section-card">
            <div className="pe-section-header">
              <div>
                <h2><IconCompass /> Geohazard & Siting Self-Assessment Tool (3D GIS)</h2>
                <p>Suriin ang lupang tatayuan laban sa active faultlines, landslide slope, at flood buffer bago magdesenyo.</p>
              </div>
            </div>

            <div className="pe-siting-grid">
              <div className="pe-siting-calc-box">
                <h3 style={{ margin: "0 0 14px 0", fontSize: "1rem" }}>Mga Parameter ng Lupa</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                    Barangay sa Luisiana:
                  </label>
                  <select
                    className="pe-select"
                    style={{ width: "100%" }}
                    value={calcBarangay}
                    onChange={(e) => setCalcBarangay(e.target.value)}
                  >
                    {BARANGAY_LIST.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                      Latitude:
                    </label>
                    <input
                      type="text"
                      className="pe-search-input"
                      value={calcLat}
                      onChange={(e) => setCalcLat(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                      Longitude:
                    </label>
                    <input
                      type="text"
                      className="pe-search-input"
                      value={calcLon}
                      onChange={(e) => setCalcLon(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                    Taas ng Ipanapanukalang Gusali (Meters):
                  </label>
                  <input
                    type="number"
                    className="pe-search-input"
                    value={calcBuildingHeightM}
                    onChange={(e) => setCalcBuildingHeightM(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  className="pe-btn-action pe-btn-primary"
                  style={{ width: "100%", justifyContent: "center", padding: "10px 0" }}
                  onClick={handleRunSitingCheck}
                >
                  ⚡ Patakbuhin ang Geohazard Safety Assessment
                </button>
              </div>

              <div className="pe-siting-calc-box">
                <h3 style={{ margin: "0 0 14px 0", fontSize: "1rem" }}>Kinalabasan ng Pagsusuri</h3>
                {calcResult ? (
                  <div>
                    <div className="pe-siting-metric">
                      <span>Distansya sa Pinakamalapit na Faultline:</span>
                      <strong>{calcResult.faultDistanceM} metro ({calcResult.faultDistanceM > 15 ? "Ligtas > 5m buffer" : "Babala: Malapit sa buffer"})</strong>
                    </div>
                    <div className="pe-siting-metric">
                      <span>Slope Gradient / Landslide Risk:</span>
                      <strong>{calcResult.slopePct}% ({calcResult.slopePct < 18 ? "Mababang Banta" : "Mataas - Kailangan ng Slope Retaining Wall"})</strong>
                    </div>
                    <div className="pe-siting-metric">
                      <span>25-Year Flood Inundation Risk:</span>
                      <strong className={calcResult.floodRisk === "Ligtas" ? "pe-metric-safe" : "pe-metric-warn"}>
                        {calcResult.floodRisk}
                      </strong>
                    </div>
                    <div className="pe-siting-metric">
                      <span>Luisiana CLUP Zoning Classification:</span>
                      <strong>{calcResult.zoningZone}</strong>
                    </div>
                    <div style={{ marginTop: 16, padding: "12px", background: calcResult.safeToBuild ? "#f6ffed" : "#fff1f0", border: `1px solid ${calcResult.safeToBuild ? "#b7eb8f" : "#ffa39e"}`, borderRadius: 8 }}>
                      <strong style={{ color: calcResult.safeToBuild ? "#52c41a" : "#f5222d" }}>
                        {calcResult.safeToBuild
                          ? "✓ Ligtas Patayuan (Standard NSCP Structural Codes Apply)"
                          : "⚠️ May Kaakibat na Geotechnical Requirements (Soil Boring Test & Retaining Wall Required)"}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p style={{ color: "var(--muted)", fontStyle: "italic", margin: 0 }}>
                    Pindutin ang &quot;Patakbuhin ang Geohazard Safety Assessment&quot; upang makita ang safety clearance ng lupa.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: CONSTRUCTION PROGRESS LOG */}
        {tab === "progress" && (
          <section className="pe-section-card">
            <div className="pe-section-header">
              <div>
                <h2><IconTool /> Construction Milestone & Inspection Log</h2>
                <p>Magsumite ng field progress updates para sa opisyal na inspeksyon ng Municipal Engineering Office (MEO) bago ang Occupancy Permit.</p>
              </div>
            </div>

            <form onSubmit={handleAddMilestone} style={{ marginBottom: 24, background: "rgba(0,0,0,0.02)", padding: 16, borderRadius: 8, border: "1px solid var(--border)" }}>
              <div className="pe-toolbar">
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: 4 }}>
                    Milestone Stage:
                  </label>
                  <select
                    className="pe-select"
                    style={{ width: "100%" }}
                    value={milestoneStage}
                    onChange={(e) => setMilestoneStage(e.target.value)}
                  >
                    <option value="Foundation / Footing Excavation">Phase 1: Foundation / Footing Excavation</option>
                    <option value="Rebar Layout & Column Inspection">Phase 2: Rebar Layout & Column Inspection</option>
                    <option value="Concrete Pouring (Beams & Slabs)">Phase 3: Concrete Pouring (Beams & Slabs)</option>
                    <option value="Roofing & Structural Trusses">Phase 4: Roofing & Structural Trusses</option>
                    <option value="Finishing & As-Built Submission">Phase 5: Finishing & As-Built Submission (Ready for Occupancy)</option>
                  </select>
                </div>

                <div style={{ width: 160 }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: 4 }}>
                    Progress (%):
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="pe-search-input"
                    value={milestonePct}
                    onChange={(e) => setMilestonePct(Number(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: 4 }}>
                  Field Remarks & Observations:
                </label>
                <input
                  type="text"
                  className="pe-search-input"
                  style={{ width: "100%" }}
                  placeholder="Hal. Natapos ang pagbuhos ng 6 na poste gamit ang 3000 PSI concrete mix. Handa na para sa MEO inspection."
                  value={milestoneNotes}
                  onChange={(e) => setMilestoneNotes(e.target.value)}
                />
              </div>

              <button type="submit" className="pe-btn-action pe-btn-primary" style={{ marginTop: 14 }}>
                ➕ Itala ang Construction Milestone
              </button>
            </form>

            <div className="pe-table-wrap">
              <table className="pe-table">
                <thead>
                  <tr>
                    <th>Petsa</th>
                    <th>Proyekto Ref</th>
                    <th>Milestone Stage</th>
                    <th>Progress</th>
                    <th>Field Observations</th>
                    <th>MEO Status</th>
                  </tr>
                </thead>
                <tbody>
                  {milestoneLogs.map((log, idx) => (
                    <tr key={idx}>
                      <td>{log.date}</td>
                      <td><strong>{log.appRef}</strong></td>
                      <td>{log.stage}</td>
                      <td><strong>{log.pct}%</strong></td>
                      <td>{log.notes}</td>
                      <td><span className="pe-status-badge approved">✓ Acknowledged by MEO</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* Project Detail Modal */}
      {selectedApp && (
        <div className="pe-modal-overlay" onClick={() => setSelectedApp(null)}>
          <div className="pe-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pe-modal-header">
              <div>
                <span className="pe-status-badge approved">{selectedApp.trackingNumber}</span>
                <h3 style={{ marginTop: 6 }}>{selectedApp.applicant?.fullName} — {selectedApp.property?.proposedBuildingType}</h3>
              </div>
              <button type="button" className="pe-btn-close" onClick={() => setSelectedApp(null)}>
                &times;
              </button>
            </div>

            <div className="pe-siting-calc-box" style={{ marginBottom: 16 }}>
              <h4 style={{ margin: "0 0 8px 0" }}>Impormasyon ng Lupa at May-ari</h4>
              <div className="pe-siting-metric">
                <span>Barangay:</span>
                <strong>{selectedApp.applicant?.barangay}</strong>
              </div>
              <div className="pe-siting-metric">
                <span>Sukat ng Lupa:</span>
                <strong>{selectedApp.property?.lotAreaSqM ? `${selectedApp.property.lotAreaSqM} sq.m.` : "—"}</strong>
              </div>
              <div className="pe-siting-metric">
                <span>Tax Dec / TCT No.:</span>
                <strong>{selectedApp.property?.taxDecNo || selectedApp.property?.tctNo || "—"}</strong>
              </div>
              <div className="pe-siting-metric">
                <span>Address / Landmark:</span>
                <strong>{selectedApp.property?.locationDescription || selectedApp.applicant?.address || "Luisiana"}</strong>
              </div>
            </div>

            <div className="pe-siting-calc-box" style={{ marginBottom: 16 }}>
              <h4 style={{ margin: "0 0 8px 0" }}>Regulatory Permitting Status</h4>
              <div className="pe-siting-metric">
                <span>MPDC Zoning Clearance:</span>
                <strong className={selectedApp.status === "approved" ? "pe-metric-safe" : "pe-metric-warn"}>
                  {selectedApp.status === "approved" ? "✓ Approved & Site Pinned" : "⏳ In Review"}
                </strong>
              </div>
              <div className="pe-siting-metric">
                <span>MEO Building Permit Status:</span>
                <strong className={selectedApp.status === "approved" ? "pe-metric-safe" : "pe-metric-warn"}>
                  {selectedApp.status === "approved" ? "✓ Building Permit Issued" : "⏳ Pending Engineering Evaluation"}
                </strong>
              </div>
              {selectedApp.notes && (
                <div style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--muted)" }}>
                  <strong>LGU Officer Notes:</strong> {selectedApp.notes}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="pe-btn-action" onClick={() => setSelectedApp(null)}>
                Isara
              </button>
              <button
                type="button"
                className="pe-btn-action pe-btn-primary"
                onClick={() => {
                  setSelectedUploadAppId(selectedApp.id || selectedApp.trackingNumber);
                  setSelectedApp(null);
                  setTab("plans");
                }}
              >
                📤 Mag-upload ng Bagong Plano
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
