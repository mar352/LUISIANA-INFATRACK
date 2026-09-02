import React, { useEffect, useState } from "react";
import type { SessionUser } from "../services/auth";
import {
  fetchCitizenApplications,
  patchCitizenApplication,
  backendUrl,
} from "../lib/api";
import { BARANGAY_LIST } from "../types";
import { ThemeToggle } from "./ThemeToggle";
import "./ZoningPermitsPage.css";

type Props = {
  onBack: () => void;
  session: SessionUser | null;
  onPinSite?: (app: any) => void;
};

let cachedCitizenApps: any[] = [];
let hasFetchedOnce = false;

export function ZoningPermitsPage({ onBack, session, onPinSite }: Props) {
  const [applications, setApplications] = useState<any[]>(cachedCitizenApps);
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [loading, setLoading] = useState(!hasFetchedOnce && cachedCitizenApps.length === 0);
  const [updating, setUpdating] = useState(false);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [search, setSearch] = useState("");
  const [filterBarangay, setFilterBarangay] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(hasFetchedOnce ? new Date().toISOString() : null);
  const [notification, setNotification] = useState<string | null>(null);

  const loadApplications = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const list = await fetchCitizenApplications();
      cachedCitizenApps = list;
      hasFetchedOnce = true;
      setApplications(list);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      console.warn("[ZoningPermits] Failed to fetch applications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadApplications(!hasFetchedOnce);
    const interval = window.setInterval(() => {
      void loadApplications(false);
    }, 6000);
    return () => window.clearInterval(interval);
  }, []);

  const handleUpdateStatus = async (appId: string, nextStatus: string) => {
    setUpdating(true);
    try {
      const res = await patchCitizenApplication(appId, {
        status: nextStatus,
        notes: reviewerNotes.trim() || undefined,
      });
      if (res && res.application) {
        setApplications((prev) =>
          prev.map((a) => (a.id === appId ? res.application : a))
        );
        setSelectedApp(res.application);
        setNotification(`Aplikasyon (${res.application.trackingNumber}) ay matagumpay na nai-set sa "${nextStatus}"`);
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (err: any) {
      alert("Hindi ma-update ang status: " + (err?.message || "Error"));
    } finally {
      setUpdating(false);
    }
  };

  const attachmentHref = (url: string) => {
    if (!url) return "#";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
      return url;
    }
    return backendUrl(url.startsWith("/") ? url : `/${url}`);
  };

  const filteredApps = applications.filter((app) => {
    if (filterBarangay && app.applicant?.barangay !== filterBarangay) return false;
    if (filterStatus && app.status !== filterStatus) return false;
    if (filterType && app.property?.proposedBuildingType !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchRef = app.trackingNumber?.toLowerCase().includes(q);
      const matchName = app.applicant?.fullName?.toLowerCase().includes(q);
      const matchPhone = app.applicant?.contactPhone?.toLowerCase().includes(q);
      const matchTd = app.property?.taxDecNo?.toLowerCase().includes(q);
      if (!matchRef && !matchName && !matchPhone && !matchTd) return false;
    }
    return true;
  });

  const totalCount = applications.length;
  const pendingCount = applications.filter((a) => a.status === "submitted" || a.status === "pending").length;
  const reviewCount = applications.filter((a) => a.status === "in_review" || a.status === "ocular_inspection").length;
  const approvedCount = applications.filter((a) => a.status === "approved").length;

  return (
    <div className="zp-page">
      {/* Top Header Bar */}
      <header className="zp-header">
        <div className="zp-header-left">
          <button type="button" className="zp-back-btn" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Bumalik sa Mapa
          </button>
          <div className="zp-brand-wrap">
            <h1 className="zp-title">
              Non-Governmental Buildings &amp; Zoning Permits
            </h1>
            <div className="zp-sub">
              Office of the MPDC · Bayan ng Luisiana · Lalawigan ng Laguna
            </div>
          </div>
        </div>

        <div className="zp-header-right">
          <div className="zp-service-pill">
            <span className="zp-service-tag">Citizen&apos;s Charter Service #2</span>
            <span className="zp-service-sla">1 Day 12 Mins SLA · ₱0.00 Libre</span>
          </div>
          <div className={`zp-live-indicator${lastSyncedAt ? " active" : ""}`} title="Real-time multi-user sync">
            <span className="zp-live-dot" />
            <span>{lastSyncedAt ? `Live · ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Syncing…"}</span>
          </div>
          <ThemeToggle iconOnly />
        </div>
      </header>

      {notification && (
        <div className="zp-notification" role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{notification}</span>
          <button type="button" onClick={() => setNotification(null)}>✕</button>
        </div>
      )}

      {/* Main Container */}
      <main className="zp-main">
        {/* KPI Metrics */}
        <section className="zp-kpi-grid">
          <div className="zp-kpi-card">
            <div className="zp-kpi-val">{totalCount}</div>
            <div className="zp-kpi-lbl">Kabuuang Aplikasyon</div>
            <div className="zp-kpi-desc">Lahat ng isinumiteng Non-Gov / Pribadong Gusali</div>
          </div>
          <div className="zp-kpi-card">
            <div className="zp-kpi-val zp-kpi--warn">{pendingCount}</div>
            <div className="zp-kpi-lbl">Bago / For Verification</div>
            <div className="zp-kpi-desc">Admin Aide completeness check (10 Mins)</div>
          </div>
          <div className="zp-kpi-card">
            <div className="zp-kpi-val zp-kpi--info">{reviewCount}</div>
            <div className="zp-kpi-lbl">In Review / Inspection</div>
            <div className="zp-kpi-desc">Zoning Officer &amp; MPDC evaluation (1 Day)</div>
          </div>
          <div className="zp-kpi-card">
            <div className="zp-kpi-val zp-kpi--safe">{approvedCount}</div>
            <div className="zp-kpi-lbl">Approved / Ready for Issuance</div>
            <div className="zp-kpi-desc">May opisyal na Zoning Certificate</div>
          </div>
        </section>

        {/* Toolbar: Search and Filters */}
        <section className="zp-toolbar">
          <div className="zp-search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="zp-input"
              placeholder="Hanapin ayon sa Tracking Reference, Pangalan, o Cellphone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="zp-filters">
            <select
              className="zp-select"
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
              className="zp-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">Lahat ng Uri ng Gusali</option>
              <option value="Residential (Pabahay)">Residential (Pabahay)</option>
              <option value="Commercial (Tindahan / Negosyo)">Commercial (Tindahan / Negosyo)</option>
              <option value="Industrial / Warehouse (Bodega)">Industrial / Warehouse (Bodega)</option>
              <option value="Agricultural (Poultry / Farm Structure)">Agricultural (Poultry / Farm Structure)</option>
              <option value="Institutional (Simbahan / Paaralan)">Institutional (Simbahan / Paaralan)</option>
            </select>

            <select
              className="zp-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Lahat ng Katayuan (Status)</option>
              <option value="submitted">Bago / Submitted</option>
              <option value="in_review">In Review</option>
              <option value="ocular_inspection">Ocular Inspection</option>
              <option value="approved">Approved</option>
              <option value="returned">Returned / Kulang</option>
            </select>

            <button type="button" className="zp-btn-refresh" onClick={loadApplications}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              I-refresh
            </button>
          </div>
        </section>

        {/* Applications Registry Table */}
        <section className="zp-table-container">
          {loading ? (
            <div className="zp-empty">
              <div className="zp-spinner" />
              <p>Kinukuha ang talaan ng mga aplikasyon…</p>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="zp-empty">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <h3>Walang Nakitang Aplikasyon</h3>
              <p>Walang aplikasyon na tumutugma sa kasalukuyang search o filter.</p>
            </div>
          ) : (
            <table className="zp-table">
              <thead>
                <tr>
                  <th>Tracking Number</th>
                  <th>Aplikante</th>
                  <th>Barangay &amp; Lokasyon</th>
                  <th>Uri ng Gusali</th>
                  <th>Attachments</th>
                  <th>Petsa</th>
                  <th>Status</th>
                  <th>Aksyon</th>
                </tr>
              </thead>
              <tbody>
                {filteredApps.map((app) => {
                  const attachCount = Object.values(app.uploads || {}).reduce(
                    (acc: number, val: any) => acc + (Array.isArray(val) ? val.length : 0),
                    0
                  );
                  return (
                    <tr key={app.id || app.trackingNumber}>
                      <td>
                        <strong className="zp-track-num">
                          {app.trackingNumber}
                        </strong>
                      </td>
                      <td>
                        <div className="zp-applicant-name">{app.applicant?.fullName || "—"}</div>
                        <div className="zp-applicant-sub">{app.applicant?.contactPhone || app.applicant?.email || "—"}</div>
                      </td>
                      <td>
                        <div className="zp-barangay-tag">{app.applicant?.barangay}</div>
                        <div className="zp-location-sub">{app.property?.locationDescription || app.applicant?.address || "—"}</div>
                      </td>
                      <td>
                        <span className="zp-building-type">{app.property?.proposedBuildingType || "Residential"}</span>
                      </td>
                      <td>
                        <span className="zp-attach-chip">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                          </svg>
                          {attachCount} file(s)
                        </span>
                      </td>
                      <td>
                        <span className="zp-date">
                          {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : "—"}
                        </span>
                      </td>
                      <td>
                        <span className={`zp-status-pill ${app.status || "submitted"}`}>
                          {app.status === "approved"
                            ? "Approved"
                            : app.status === "ocular_inspection"
                            ? "Inspection"
                            : app.status === "in_review"
                            ? "In Review"
                            : app.status === "returned"
                            ? "Returned"
                            : "Submitted"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="zp-review-btn"
                          onClick={() => {
                            setSelectedApp(app);
                            setReviewerNotes(app.notes || "");
                          }}
                        >
                          Suriin →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>

      {/* Review & Issuance Modal */}
      {selectedApp && (
        <div className="zp-modal-backdrop" onClick={() => setSelectedApp(null)}>
          <div className="zp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="zp-modal-head">
              <div>
                <span className="zp-modal-tag">Pagsusuri ng Aplikasyon para sa Zoning Certificate</span>
                <h2 className="zp-modal-title">
                  Tracking No: <span className="zp-gold-ref">{selectedApp.trackingNumber}</span>
                </h2>
              </div>
              <button
                type="button"
                className="zp-close-btn"
                onClick={() => setSelectedApp(null)}
              >
                ✕
              </button>
            </div>

            <div className="zp-modal-body">
              {/* Status & SLA Banner */}
              <div className="zp-status-banner">
                <div>
                  <div className="zp-status-banner-lbl">Kasalukuyang Katayuan:</div>
                  <strong className={`zp-status-pill ${selectedApp.status}`}>
                    {selectedApp.status?.toUpperCase()}
                  </strong>
                </div>
                <div className="zp-sla-info">
                  Standard Turnaround: <strong>1 Day 12 Minutes</strong> (Libre / ₱0.00)
                </div>
              </div>

              {/* Applicant & Property Details */}
              <div className="zp-detail-grid">
                <div className="zp-detail-item">
                  <label>Pangalan ng Aplikante</label>
                  <p>{selectedApp.applicant?.fullName || "—"}</p>
                </div>
                <div className="zp-detail-item">
                  <label>Contact Number (Cellphone)</label>
                  <p>{selectedApp.applicant?.contactPhone || "—"}</p>
                </div>
                <div className="zp-detail-item">
                  <label>Email Address</label>
                  <p>{selectedApp.applicant?.email || "—"}</p>
                </div>
                <div className="zp-detail-item">
                  <label>Barangay</label>
                  <p>{selectedApp.applicant?.barangay || "—"}</p>
                </div>
                <div className="zp-detail-item">
                  <label>Uri ng Ipanapanukalang Gusali</label>
                  <p>{selectedApp.property?.proposedBuildingType || "Residential"}</p>
                </div>
                <div className="zp-detail-item">
                  <label>Sukat ng Lupa / Floor Area</label>
                  <p>{selectedApp.property?.lotAreaSqM ? `${selectedApp.property.lotAreaSqM} sq.m.` : "—"}</p>
                </div>
                <div className="zp-detail-item">
                  <label>Tax Declaration / TCT No.</label>
                  <p>
                    TD: <strong>{selectedApp.property?.taxDecNo || "—"}</strong> | TCT: <strong>{selectedApp.property?.tctNo || "—"}</strong>
                  </p>
                </div>
                <div className="zp-detail-item">
                  <label>Pagmamay-ari ng Lupa</label>
                  <p>{selectedApp.property?.isRegisteredOwner ? "Rehistradong May-ari" : "May Consent / Deed of Sale"}</p>
                </div>
                <div className="zp-detail-item full">
                  <label>Deskripsyon ng Lokasyon / Landmark</label>
                  <p>{selectedApp.property?.locationDescription || selectedApp.applicant?.address || "—"}</p>
                </div>
              </div>

              {/* Private Engineer Information */}
              {selectedApp.privateEngineer && (
                <div className="zp-detail-grid" style={{ marginTop: 14, background: "rgba(13, 115, 119, 0.08)", padding: 12, borderRadius: 8, border: "1px solid rgba(13, 115, 119, 0.25)" }}>
                  <div className="zp-detail-item">
                    <label>👷 Nakatalagang Pribadong Inhinyero / Arkitekto</label>
                    <p><strong>{selectedApp.privateEngineer.fullName}</strong></p>
                  </div>
                  <div className="zp-detail-item">
                    <label>PRC License &amp; PTR No.</label>
                    <p>{selectedApp.privateEngineer.prcNo || "—"}</p>
                  </div>
                  <div className="zp-detail-item">
                    <label>Contact Number / Email ng Inhinyero</label>
                    <p>{selectedApp.privateEngineer.contact || "—"}</p>
                  </div>
                  <div className="zp-detail-item">
                    <label>Kontratista / Construction In-Charge</label>
                    <p>{selectedApp.privateEngineer.contractor || "—"}</p>
                  </div>
                </div>
              )}

              {/* Uploaded Files / Digital Checklist */}
              <div className="zp-files-section">
                <h4 className="zp-section-title">
                  📁 Isinumiteng Digital Attachments &amp; Requirements:
                </h4>
                <div className="zp-files-list">
                  {Object.entries(selectedApp.uploads || {}).map(([key, files]: [string, any]) => {
                    if (!Array.isArray(files) || files.length === 0) return null;
                    return (
                      <div key={key} className="zp-file-row">
                        <span className="zp-file-category">
                          {key.replace(/([A-Z])/g, " $1")}:
                        </span>
                        <div className="zp-file-links">
                          {files.map((f: any, idx: number) => (
                            <a
                              key={idx}
                              href={attachmentHref(f.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="zp-file-btn"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              {f.originalName || "Tingnan ang Dokumento"}
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reviewer Notes */}
              <div className="zp-notes-section">
                <label className="zp-notes-lbl">
                  Opisyal na Reviewer Notes ng MPDC (Mababasa ng Aplikante sa Online Tracker):
                </label>
                <textarea
                  className="zp-textarea"
                  rows={3}
                  placeholder="Hal. Na-verify ang tax declaration at barangay clearance. Nakatakda ang ocular inspection bukas…"
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                />
              </div>

              {/* Action Buttons */}
              <div className="zp-actions-card">
                <label className="zp-actions-lbl">
                  I-update ang Katayuan ayon sa Citizen&apos;s Charter Lifecycle:
                </label>
                <div className="zp-action-btns">
                  <button
                    type="button"
                    className="zp-act-btn zp-act--review"
                    disabled={updating}
                    onClick={() => handleUpdateStatus(selectedApp.id, "in_review")}
                  >
                    🟡 Set as &quot;In Review&quot;
                  </button>
                  <button
                    type="button"
                    className="zp-act-btn zp-act--inspect"
                    disabled={updating}
                    onClick={() => handleUpdateStatus(selectedApp.id, "ocular_inspection")}
                  >
                    🔵 Set as &quot;Ocular Inspection&quot;
                  </button>
                  <button
                    type="button"
                    className="zp-act-btn zp-act--approve"
                    disabled={updating}
                    onClick={() => handleUpdateStatus(selectedApp.id, "approved")}
                  >
                    🟢 Aprubahan at I-isyu ang Clearance
                  </button>
                  <button
                    type="button"
                    className="zp-act-btn zp-act--return"
                    disabled={updating}
                    onClick={() => handleUpdateStatus(selectedApp.id, "returned")}
                  >
                    🔴 Ibalik sa Aplikante (May Kulang)
                  </button>
                  {onPinSite && (
                    <button
                      type="button"
                      className="zp-act-btn zp-act--pin"
                      onClick={() => onPinSite(selectedApp)}
                      style={{ background: "#ffc107", color: "#151c28", border: "1px solid #ffc107", fontWeight: 800, marginLeft: "auto" }}
                    >
                      📍 I-pin ang Lokasyon sa 3D Mapa
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ZoningPermitsPage;
