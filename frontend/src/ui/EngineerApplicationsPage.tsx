import React, { useState, useEffect, useMemo } from "react";
import { fetchCitizenApplications, patchCitizenApplication, backendUrl } from "../lib/api";
import { getClupZone } from "../lib/clup-zones";
import "./EngineerApplicationsPage.css";

const BARANGAYS = [
  "Antipolo", "Bacong", "Bagong Silang", "Balaking", "Balatasan",
  "Bangkuro", "Bucal", "Buenavista", "Burgos", "Cabugao",
  "Damayan", "De La Paz", "Inayapan", "Mahayhay", "Poblacion",
  "San Antonio", "San Buenaventura", "San Diego", "San Isidro",
  "San Jose", "San Juan", "San Luis", "San Pablo", "San Pedro",
  "San Roque", "San Salvador", "Santa Clara", "Santa Lucia",
  "Santo Angel", "Santo Domingo", "Santo Tomas"
];

const PRESET_HOLD_REASONS = [
  "Kailangang mag-submit ng revised Structural Plans & Computations na may pirma at selyo ng licensed Civil/Structural Engineer.",
  "Hindi sumunod sa Building Setbacks (kinakailangan ang minimum 3.0m sa harap at 2.0m sa mga gilid at likuran bago magbuhos).",
  "Kailangang kumpirmahin ang aktwal na Boundary Monuments (Mohon) at Road Right-of-Way (ROW) upang maiwasan ang encroachment.",
  "Kulang o malabo ang isinumiteng Barangay Construction Clearance / TCT Title / Tax Declaration.",
  "Nangangailangan ng karagdagang Geohazard Mitigation Plan batay sa on-site ocular evaluation ng Engineering Office."
];

interface EngineerApplicationsPageProps {
  onBack: () => void;
  session?: any;
  onNavigateToProject?: (projectId: string) => void;
  onApplicationApproved?: () => void;
}

function resolveDocUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  if (
    rawUrl.startsWith("http://") ||
    rawUrl.startsWith("https://") ||
    rawUrl.startsWith("data:") ||
    rawUrl.startsWith("blob:")
  ) {
    return rawUrl;
  }
  const path = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  return backendUrl(path);
}

function formatCurrency(amount: any): string {
  const num = Number(amount);
  if (isNaN(num)) return "₱0.00";
  return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("tl-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export const EngineerApplicationsPage: React.FC<EngineerApplicationsPageProps> = ({
  onBack,
  session,
  onNavigateToProject,
  onApplicationApproved,
}) => {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "hold" | "approved">("all");
  const [barangayFilter, setBarangayFilter] = useState("");

  // Approval Modal State
  const [approvingApp, setApprovingApp] = useState<any | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // Hold Modal State
  const [holdingApp, setHoldingApp] = useState<any | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [isSubmittingHold, setIsSubmittingHold] = useState(false);

  // Document Lightbox
  const [viewingDoc, setViewingDoc] = useState<{ url: string; name: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCitizenApplications();
      const list = Array.isArray(data) ? data : [];
      setApplications(list);
    } catch (err: any) {
      console.error("Failed to load applications for engineer clearance:", err);
      setError(err?.message || "Nabigong i-load ang mga aplikasyon.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter only applications that have completed Treasury payment
  const paidApplications = useMemo(() => {
    return applications.filter((app) => {
      const isPaid =
        app.payment?.status === "paid" ||
        Boolean(app.payment?.orNumber) ||
        Boolean(app.payment?.or_number) ||
        Boolean(app.or_number) ||
        app.status === "for_engineering_inspection" ||
        app.status === "approved_for_construction" ||
        app.status === "returned" ||
        app.engineerApproved === true;

      return isPaid;
    });
  }, [applications]);

  // Counts for KPIs
  const pendingCount = useMemo(() => {
    return paidApplications.filter(
      (a) => !a.engineerApproved && a.status !== "approved_for_construction" && a.status !== "returned"
    ).length;
  }, [paidApplications]);

  const holdCount = useMemo(() => {
    return paidApplications.filter(
      (a) => a.status === "returned" || (!a.engineerApproved && a.status === "flagged")
    ).length;
  }, [paidApplications]);

  const approvedCount = useMemo(() => {
    return paidApplications.filter(
      (a) => a.engineerApproved === true || a.status === "approved_for_construction"
    ).length;
  }, [paidApplications]);

  // Filtered list based on search and dropdowns
  const displayedApps = useMemo(() => {
    return paidApplications.filter((app) => {
      const isApproved =
        app.engineerApproved === true || app.status === "approved_for_construction";
      const isHold = app.status === "returned";
      const isPending = !isApproved && !isHold;

      if (statusFilter === "pending" && !isPending) return false;
      if (statusFilter === "hold" && !isHold) return false;
      if (statusFilter === "approved" && !isApproved) return false;

      const appBarangay = app.applicant?.barangay || app.barangay || "";
      if (barangayFilter && appBarangay !== barangayFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const tracking = (app.trackingNumber || app.id || "").toLowerCase();
        const applicant = (app.applicant?.fullName || app.applicantName || "").toLowerCase();
        const bgy = appBarangay.toLowerCase();
        const bldg = (app.lotDetails?.proposedBuildingType || app.buildingType || "").toLowerCase();
        const orNo = (
          app.payment?.orNumber ||
          app.payment?.or_number ||
          app.or_number ||
          ""
        ).toLowerCase();

        return (
          tracking.includes(q) ||
          applicant.includes(q) ||
          bgy.includes(q) ||
          bldg.includes(q) ||
          orNo.includes(q)
        );
      }

      return true;
    });
  }, [paidApplications, statusFilter, barangayFilter, searchQuery]);

  // Handle Engineer Approval Submission
  const handleConfirmApproval = async () => {
    if (!approvingApp) return;
    setIsSubmittingApproval(true);
    try {
      const appId = approvingApp.id || approvingApp.trackingNumber;
      const engineerName = session?.fullName || session?.username || "Engr. Mario S. Baldovino (Municipal Engineer)";

      await patchCitizenApplication(appId, {
        engineerApproved: true,
        engineerApprovedAt: new Date().toISOString(),
        engineerApprovedBy: engineerName,
        isPinned: true,
        status: "approved_for_construction",
        fromOffice: "Engineering",
        author: engineerName,
        notes:
          approvalNotes.trim() ||
          `Inaprubahan ni ${engineerName} ang aplikasyon para sa konstruksyon. Opisyal nang nai-pin ang site sa 3D GIS Mapa.`,
      });

      // Update local state
      setApplications((prev) =>
        prev.map((item) =>
          item.id === appId || item.trackingNumber === appId
            ? {
                ...item,
                engineerApproved: true,
                isPinned: true,
                status: "approved_for_construction",
                engineerApprovedAt: new Date().toISOString(),
                engineerApprovedBy: engineerName,
              }
            : item
        )
      );

      if (onApplicationApproved) onApplicationApproved();
      setApprovingApp(null);
      setApprovalNotes("");
    } catch (err: any) {
      console.error("Failed to approve application:", err);
      alert("Nabigong i-save ang pag-apruba: " + (err.message || "Error"));
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  // Handle Engineer Hold Submission
  const handleConfirmHold = async () => {
    if (!holdingApp) return;
    if (!holdReason.trim()) {
      alert("Mangyaring maglagay ng dahilan o mga kailangang ayusin bago i-hold ang aplikasyon.");
      return;
    }
    setIsSubmittingHold(true);
    try {
      const appId = holdingApp.id || holdingApp.trackingNumber;
      const engineerName = session?.fullName || session?.username || "Engr. Mario S. Baldovino (Municipal Engineer)";

      await patchCitizenApplication(appId, {
        status: "returned",
        engineerApproved: false,
        isPinned: false,
        fromOffice: "Engineering",
        author: engineerName,
        notes: holdReason.trim(),
        requiresAction: true,
        heldAt: new Date().toISOString(),
        heldBy: engineerName,
      });

      // Update local state
      setApplications((prev) =>
        prev.map((item) =>
          item.id === appId || item.trackingNumber === appId
            ? {
                ...item,
                status: "returned",
                engineerApproved: false,
                isPinned: false,
                notes: holdReason.trim(),
                heldAt: new Date().toISOString(),
                heldBy: engineerName,
              }
            : item
        )
      );

      setHoldingApp(null);
      setHoldReason("");
    } catch (err: any) {
      console.error("Failed to hold application:", err);
      alert("Nabigong i-hold ang aplikasyon: " + (err.message || "Error"));
    } finally {
      setIsSubmittingHold(false);
    }
  };

  return (
    <div className="eap-container">
      {/* Top Header */}
      <header className="eap-header">
        <div className="eap-header-left">
          <button type="button" className="eap-btn-back" onClick={onBack} title="Bumalik sa 3D Globe / Mapa">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Bumalik sa Mapa</span>
          </button>
          <div className="eap-title-block">
            <div className="eap-header-badge">MUNICIPAL ENGINEERING OFFICE</div>
            <h1 className="eap-title">Engineering Clearance &amp; Site Pinning Portal</h1>
            <p className="eap-subtitle">
              Pagsusuri, pag-hold, o pag-apruba sa mga bayad na aplikasyon upang mai-pin sa 3D Cesium GIS para sa on-site inspection.
            </p>
          </div>
        </div>

        <div className="eap-header-actions">
          <button type="button" className="eap-btn-refresh" onClick={loadData} disabled={loading} title="I-reload ang mga aplikasyon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "eap-spin" : ""}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>I-refresh</span>
          </button>
        </div>
      </header>

      {/* KPI Stats Bar */}
      <section className="eap-kpi-grid">
        <div className="eap-kpi-card is-pending">
          <div className="eap-kpi-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="eap-kpi-info">
            <div className="eap-kpi-val" style={{ color: "#f59e0b" }}>{pendingCount}</div>
            <div className="eap-kpi-lbl">Naghihintay ng Clearance</div>
            <div className="eap-kpi-sub">Bayad na sa Treasury · Handa sa Pagsusuri</div>
          </div>
        </div>

        <div className="eap-kpi-card is-hold">
          <div className="eap-kpi-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div className="eap-kpi-info">
            <div className="eap-kpi-val" style={{ color: "#ef4444" }}>{holdCount}</div>
            <div className="eap-kpi-lbl">Naka-Hold / May Kulang</div>
            <div className="eap-kpi-sub">Ibinalik sa Kliyente para Ayusin</div>
          </div>
        </div>

        <div className="eap-kpi-card is-approved">
          <div className="eap-kpi-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          </div>
          <div className="eap-kpi-info">
            <div className="eap-kpi-val" style={{ color: "#22c55e" }}>{approvedCount}</div>
            <div className="eap-kpi-lbl">Na-aprubahan &amp; Naka-pin</div>
            <div className="eap-kpi-sub">Aktibo sa 3D Mapa at Handang Inspeksyunin</div>
          </div>
        </div>

        <div className="eap-kpi-card is-total">
          <div className="eap-kpi-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <div className="eap-kpi-info">
            <div className="eap-kpi-val" style={{ color: "#38bdf8" }}>{paidApplications.length}</div>
            <div className="eap-kpi-lbl">Kabuuang Bayad na Aplikasyon</div>
            <div className="eap-kpi-sub">Mula sa Municipal Treasury Office</div>
          </div>
        </div>
      </section>

      {/* Search and Filters Bar */}
      <section className="eap-filters-bar">
        <div className="eap-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="eap-search-icon">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="eap-search-input"
            placeholder="Hanapin ayon sa Tracking Reference, Pangalan, O.R. #, o Barangay..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" className="eap-search-clear" onClick={() => setSearchQuery("")}>✕</button>
          )}
        </div>

        <div className="eap-filters-group">
          {/* Status Segmented Control */}
          <div className="eap-status-tabs">
            <button
              type="button"
              className={`eap-status-tab ${statusFilter === "all" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              Lahat ({paidApplications.length})
            </button>
            <button
              type="button"
              className={`eap-status-tab is-pending ${statusFilter === "pending" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("pending")}
            >
              Naghihintay ({pendingCount})
            </button>
            <button
              type="button"
              className={`eap-status-tab is-hold ${statusFilter === "hold" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("hold")}
            >
              Naka-Hold ({holdCount})
            </button>
            <button
              type="button"
              className={`eap-status-tab is-approved ${statusFilter === "approved" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("approved")}
            >
              Naka-pin ({approvedCount})
            </button>
          </div>

          {/* Barangay Dropdown */}
          <select
            className="eap-select"
            value={barangayFilter}
            onChange={(e) => setBarangayFilter(e.target.value)}
          >
            <option value="">Lahat ng Barangay</option>
            {BARANGAYS.map((bgy) => (
              <option key={bgy} value={bgy}>{bgy}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Main List / Table */}
      {loading ? (
        <div className="eap-loading-state">
          <div className="eap-spinner" />
          <p>Kinukuha ang mga bayad na aplikasyon mula sa database...</p>
        </div>
      ) : error ? (
        <div className="eap-error-state">
          <p>{error}</p>
          <button type="button" className="eap-btn-retry" onClick={loadData}>Subukang Muli</button>
        </div>
      ) : displayedApps.length === 0 ? (
        <div className="eap-empty-state">
          <div className="eap-empty-icon">📭</div>
          <h3>Walang nahanap na aplikasyon</h3>
          <p>
            {searchQuery || barangayFilter || statusFilter !== "all"
              ? "Walang tumutugma sa kasalukuyang filter o search term."
              : "Wala pang aplikasyon na nakapagbayad sa Treasury Office sa ngayon."}
          </p>
        </div>
      ) : (
        <div className="eap-cards-grid">
          {displayedApps.map((app) => {
            const isApproved =
              app.engineerApproved === true || app.status === "approved_for_construction";
            const isHold = app.status === "returned";
            const tracking = app.trackingNumber || app.id;
            const applicant = app.applicant?.fullName || app.applicantName || "Private Applicant";
            const bgy = app.applicant?.barangay || app.barangay || "Luisiana";
            const bldgType = app.lotDetails?.proposedBuildingType || app.buildingType || "Residential Building";
            const estCost = app.estimatedCost || app.budgetTotal;
            const orNumber = app.payment?.orNumber || app.payment?.or_number || app.or_number || "O.R. Pending";
            const amountPaid = app.payment?.amount_paid ?? app.payment?.amount ?? app.amount_paid ?? 280;
            const paymentDate = app.payment?.payment_date || app.payment?.paidAt || app.payment_date;
            const clupZone = getClupZone(bgy);
            const lat = app.latitude ?? app.lotDetails?.lat ?? app.coordinates?.lat;
            const lon = app.longitude ?? app.lotDetails?.lon ?? app.coordinates?.lon;

            // Collect uploaded documents
            const docsList: { key: string; name: string; url: string }[] = [];
            if (app.uploads && typeof app.uploads === "object") {
              Object.entries(app.uploads).forEach(([k, val]: [string, any]) => {
                if (Array.isArray(val)) {
                  val.forEach((f: any, idx: number) => {
                    if (f?.url) {
                      docsList.push({
                        key: `${k}-${idx}`,
                        name: f.originalName || f.name || `${k} #${idx + 1}`,
                        url: resolveDocUrl(f.url),
                      });
                    }
                  });
                } else if (val && typeof val === "object" && val.url) {
                  docsList.push({
                    key: k,
                    name: val.originalName || val.name || k,
                    url: resolveDocUrl(val.url),
                  });
                }
              });
            }

            const cardClass = isApproved
              ? "is-approved-card"
              : isHold
              ? "is-hold-card"
              : "is-pending-card";

            return (
              <div
                key={app.id || tracking}
                className={`eap-app-card ${cardClass}`}
              >
                {/* Card Header */}
                <div className="eap-card-header">
                  <div className="eap-card-header-left">
                    <span className="eap-tracking-badge">{tracking}</span>
                    <span className="eap-submission-date">Isinumite: {formatDate(app.createdAt)}</span>
                  </div>
                  <div className="eap-card-header-right">
                    {isApproved ? (
                      <span className="eap-status-pill approved">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Naka-pin sa 3D Mapa</span>
                      </span>
                    ) : isHold ? (
                      <span className="eap-status-pill hold">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span>⚠️ Naka-Hold / Ibinalik sa Kliyente</span>
                      </span>
                    ) : (
                      <span className="eap-status-pill pending">
                        <span className="eap-pulsing-dot" />
                        <span>Naghihintay ng Clearance</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Main Info Grid */}
                <div className="eap-card-body">
                  <div className="eap-col-applicant">
                    <div className="eap-field-label">Aplikante &amp; May-ari:</div>
                    <strong className="eap-applicant-name">{applicant}</strong>
                    <div className="eap-applicant-meta">
                      <span>📞 {app.applicant?.contactNumber || app.applicant?.phone || "—"}</span>
                      <span>📍 Brgy. {bgy}, Luisiana</span>
                    </div>
                  </div>

                  <div className="eap-col-project">
                    <div className="eap-field-label">Ipinapanukalang Gusali:</div>
                    <strong className="eap-bldg-name">{bldgType}</strong>
                    <div className="eap-project-meta">
                      {estCost && <span>Tinatayang Halaga: {formatCurrency(estCost)}</span>}
                      {lat && lon && (
                        <span className="eap-coord-badge">
                          🌐 {Number(lat).toFixed(5)}, {Number(lon).toFixed(5)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Hold Notice Banner if app is on hold */}
                {isHold && (
                  <div className="eap-card-hold-alert">
                    <div className="eap-card-hold-header">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <strong>Dahilan ng Pag-Hold mula sa Engineering Office:</strong>
                    </div>
                    <p className="eap-card-hold-text">
                      &ldquo;{app.notes || "Kailangang i-review at ayusin ng aplikante ang isinumiteng dokumento bago mai-pin sa mapa."}&rdquo;
                    </p>
                    {app.heldAt && (
                      <div className="eap-card-hold-meta">
                        Inilagay sa hold noong {formatDate(app.heldAt)} ni {app.heldBy || "Municipal Engineer"}
                      </div>
                    )}
                  </div>
                )}

                {/* Treasury Payment Receipt Box */}
                <div className="eap-treasury-box">
                  <div className="eap-treasury-left">
                    <div className="eap-receipt-icon-wrap">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </div>
                    <div>
                      <div className="eap-treasury-title">
                        <span>TREASURY OFFICIAL RECEIPT:</span>
                        <strong className="eap-or-num">{orNumber}</strong>
                      </div>
                      <div className="eap-treasury-sub">
                        <span>Binayaran: {formatDate(paymentDate)}</span>
                        {app.payment?.cashier && <span> · Teller: {app.payment.cashier}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="eap-treasury-amount">
                    <span className="eap-amount-lbl">Halagang Binayaran:</span>
                    <strong className="eap-amount-val">{formatCurrency(amountPaid)}</strong>
                  </div>
                </div>

                {/* CLUP & Geohazard Badge */}
                <div className="eap-clup-row">
                  <div className="eap-clup-badge">
                    <span>Zoning (CLUP):</span>
                    <strong>{clupZone.zoneName}</strong>
                  </div>
                  <div className="eap-hazard-badge safe">
                    <span>Geohazard Status:</span>
                    <strong>Ligtas (Low Siting Class)</strong>
                  </div>
                </div>

                {/* Attached Documents Row */}
                {docsList.length > 0 && (
                  <div className="eap-docs-section">
                    <div className="eap-field-label">
                      <span>Nakalakip na mga Plano at Dokumento ({docsList.length}):</span>
                    </div>
                    <div className="eap-docs-chips">
                      {docsList.map((doc) => (
                        <button
                          type="button"
                          key={doc.key}
                          className="eap-doc-chip"
                          onClick={() => setViewingDoc({ url: doc.url, name: doc.name })}
                          title="I-click upang tingnan ang dokumento"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          <span>{doc.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Card Action Footer */}
                <div className="eap-card-footer">
                  {isApproved ? (
                    <div className="eap-approved-actions">
                      <div className="eap-approved-note">
                        <span>✓ Na-aprubahan ni {app.engineerApprovedBy || "Municipal Engineer"}</span>
                        {app.engineerApprovedAt && <span> noong {formatDate(app.engineerApprovedAt)}</span>}
                      </div>
                      {onNavigateToProject && (
                        <button
                          type="button"
                          className="eap-btn-view-map"
                          onClick={() => onNavigateToProject(app.id || tracking)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                            <line x1="8" y1="2" x2="8" y2="18" />
                            <line x1="16" y1="6" x2="16" y2="22" />
                          </svg>
                          <span>Tingnan sa 3D Mapa</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="eap-pending-actions">
                      <span className="eap-ready-hint">
                        {isHold
                          ? "⚠️ Naka-hold ang record. Maaari itong i-update o aprubahan kapag naayos na ng kliyente."
                          : "💡 Suriin ang plano at site. Pwedeng i-hold para ipaayos o aprubahan para mai-pin sa mapa."}
                      </span>
                      <div className="eap-action-buttons-group">
                        {/* ✖ HOLD BUTTON (RED/ORANGE) */}
                        <button
                          type="button"
                          className="eap-btn-hold"
                          onClick={() => {
                            setHoldingApp(app);
                            setHoldReason(app.notes || "");
                          }}
                          title="I-hold ang aplikasyon at ibalik sa kliyente para ayusin"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                          <span>{isHold ? "✏️ Baguhin ang Hold" : "✖ I-hold ang Aplikasyon"}</span>
                        </button>

                        {/* ✔ APPROVE BUTTON (GREEN) */}
                        <button
                          type="button"
                          className="eap-btn-approve"
                          onClick={() => {
                            setApprovingApp(app);
                            setApprovalNotes(`Inaprubahan para sa konstruksyon. Pinal nang nai-pin ang site sa 3D GIS Mapa para sa on-site inspection.`);
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>✔ Aprubahan at I-pin sa Mapa</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ⚠️ APPROVAL CONFIRMATION MODAL */}
      {approvingApp && (
        <div className="eap-modal-backdrop" onClick={() => { if (!isSubmittingApproval) setApprovingApp(null); }}>
          <div className="eap-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="eap-modal-header">
              <div className="eap-modal-seal">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <div>
                <h3 className="eap-modal-title">Kumpirmahin ang Pag-apruba at Pag-pin</h3>
                <span className="eap-modal-tracking">{approvingApp.trackingNumber || approvingApp.id}</span>
              </div>
            </div>

            <div className="eap-modal-body">
              <div className="eap-modal-app-summary">
                <div><strong>Aplikante:</strong> {approvingApp.applicant?.fullName || approvingApp.applicantName}</div>
                <div><strong>Gusali:</strong> {approvingApp.lotDetails?.proposedBuildingType || approvingApp.buildingType || "Residential"}</div>
                <div><strong>Lokasyon:</strong> Brgy. {approvingApp.applicant?.barangay || approvingApp.barangay}, Luisiana</div>
                <div><strong>O.R. No:</strong> {approvingApp.payment?.orNumber || approvingApp.or_number || "Paid at Treasury"}</div>
              </div>

              <div className="eap-modal-alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p>
                  Awtomatikong magkakaroon ng <strong>aktibong private infrastructure pin</strong> ang proyektong ito sa <strong>3D Cesium GIS at Street View</strong> para sa live on-site monitoring ng Engineering Office.
                </p>
              </div>

              <div className="eap-form-group">
                <label className="eap-form-label">
                  <span>Opisyal na Remarks / Tala ng Engineer:</span>
                </label>
                <textarea
                  className="eap-textarea"
                  rows={3}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Halimbawa: Naaprubahan batay sa isinumiteng structural plans. Handa na para sa Before Construction ocular inspection..."
                />
              </div>
            </div>

            <div className="eap-modal-footer">
              <button
                type="button"
                className="eap-btn-cancel"
                onClick={() => setApprovingApp(null)}
                disabled={isSubmittingApproval}
              >
                Kanselahin
              </button>
              <button
                type="button"
                className="eap-btn-confirm-approve"
                onClick={handleConfirmApproval}
                disabled={isSubmittingApproval}
              >
                {isSubmittingApproval ? (
                  <>
                    <div className="eap-spinner-sm" />
                    <span>Ina-aprubahan...</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Oo, Aprubahan at I-pin sa Mapa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🛑 HOLD APPLICATION MODAL */}
      {holdingApp && (
        <div className="eap-modal-backdrop" onClick={() => { if (!isSubmittingHold) setHoldingApp(null); }}>
          <div className="eap-modal-content is-hold-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eap-modal-header is-hold-header">
              <div className="eap-modal-seal is-hold-seal">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <div>
                <h3 className="eap-modal-title" style={{ color: "#f87171" }}>I-hold at Ibalik ang Aplikasyon sa Kliyente</h3>
                <span className="eap-modal-tracking">{holdingApp.trackingNumber || holdingApp.id}</span>
              </div>
            </div>

            <div className="eap-modal-body">
              <div className="eap-modal-app-summary">
                <div><strong>Aplikante:</strong> {holdingApp.applicant?.fullName || holdingApp.applicantName}</div>
                <div><strong>Gusali:</strong> {holdingApp.lotDetails?.proposedBuildingType || holdingApp.buildingType || "Residential"}</div>
                <div><strong>Barangay:</strong> Brgy. {holdingApp.applicant?.barangay || holdingApp.barangay}, Luisiana</div>
                <div><strong>O.R. No:</strong> {holdingApp.payment?.orNumber || holdingApp.or_number || "Paid at Treasury"}</div>
              </div>

              <div className="eap-modal-alert is-hold-alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <p>
                  <strong>Paalala:</strong> Ang pag-hold ay magbabalik ng record sa kliyente kasama ang mga tala/deficiencies ng Engineering Office para sa kanilang pagwawasto. <strong>HINDI ito mai-pin sa mapa</strong> hangga&apos;t hindi naaayos.
                </p>
              </div>

              {/* Preset Quick Deficiency Reasons */}
              <div className="eap-preset-reasons-wrap">
                <label className="eap-form-label">
                  <span>Pumili ng Karaniwang Dahilan (I-click para mailagay sa tala):</span>
                </label>
                <div className="eap-preset-buttons-grid">
                  {PRESET_HOLD_REASONS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="eap-preset-btn"
                      onClick={() => {
                        if (!holdReason) setHoldReason(preset);
                        else setHoldReason(holdReason + "\n• " + preset);
                      }}
                    >
                      <span>• {preset}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="eap-form-group">
                <label className="eap-form-label">
                  <span>Opisyal na Dahilan ng Pag-Hold / Mga Dapat Ayusin ng Aplikante: <strong style={{ color: "#ef4444" }}>*</strong></span>
                </label>
                <textarea
                  className="eap-textarea is-hold-textarea"
                  rows={4}
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="Isulat ang eksaktong detalye o mga kailangang i-revise ng aplikante bago maaprubahan ang clearance..."
                  required
                />
              </div>
            </div>

            <div className="eap-modal-footer">
              <button
                type="button"
                className="eap-btn-cancel"
                onClick={() => setHoldingApp(null)}
                disabled={isSubmittingHold}
              >
                Kanselahin
              </button>
              <button
                type="button"
                className="eap-btn-confirm-hold"
                onClick={handleConfirmHold}
                disabled={isSubmittingHold}
              >
                {isSubmittingHold ? (
                  <>
                    <div className="eap-spinner-sm" />
                    <span>Sine-save ang Hold...</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span>Kumpirmahin ang Pag-Hold at Ibalik</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📄 DOCUMENT LIGHTBOX MODAL */}
      {viewingDoc && (
        <div className="eap-doc-lightbox-backdrop" onClick={() => setViewingDoc(null)}>
          <div className="eap-doc-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eap-doc-lightbox-header">
              <h4 className="eap-doc-lightbox-title">{viewingDoc.name}</h4>
              <button type="button" className="eap-doc-lightbox-close" onClick={() => setViewingDoc(null)}>✕</button>
            </div>
            <div className="eap-doc-lightbox-body">
              {viewingDoc.url.toLowerCase().endsWith(".pdf") ? (
                <iframe src={viewingDoc.url} className="eap-doc-iframe" title={viewingDoc.name} />
              ) : (
                <img src={viewingDoc.url} alt={viewingDoc.name} className="eap-doc-img" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
