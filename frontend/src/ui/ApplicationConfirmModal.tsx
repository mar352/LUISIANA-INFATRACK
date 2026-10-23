import React, { useEffect } from "react";
import type { ProjectCategory } from "../types";
import { useTranslation } from "./LanguageToggle";
import "./ApplicationConfirmModal.css";

/* ── SVG Icons (Zero Emoji) ── */
const IconClipboard = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);
const IconUser = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconTag = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);
const IconPin = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const IconFolder = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

export interface ApplicationConfirmData {
  category: ProjectCategory;
  categoryLabel: string;
  title: string;
  applicantName: string;
  contactPhone: string;
  contactEmail: string;
  locationDescription: string;
  barangay: string;
  estimatedCostPhp: number | "";
  // Lot details
  tctNo?: string;
  taxDecNo?: string;
  isOwner?: boolean;
  buildingType?: string;
  lotAreaSqM?: number | "";
  zoningClassification?: string;
  // Agricultural details
  farmType?: string;
  headCapacity?: number | "";
  wasteManagement?: string;
  bufferComplianceConfirmed?: boolean;
  // Municipal details
  implementingDepartment?: string;
  fundingSource?: string;
  cipCode?: string;
  targetBeneficiaries?: string;
  // GIS & Hazard
  pinnedCoords: { lat: number; lon: number };
  isGeotagged?: boolean;
  floodHazard?: string;
  landslideHazard?: string;
  banahawKm: number;
  // Attached files
  attachedDocs: {
    label: string;
    filename?: string;
  }[];
}

interface ApplicationConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSubmit: () => void;
  submitting: boolean;
  data: ApplicationConfirmData;
}

export default function ApplicationConfirmModal({
  isOpen,
  onClose,
  onConfirmSubmit,
  submitting,
  data,
}: ApplicationConfirmModalProps) {
  const { language } = useTranslation();
  const isEn = language === "en";

  // Listen for Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const getHazardBadge = (val?: string) => {
    const v = String(val || "Safe").toLowerCase();
    let badgeClass = "is-safe";
    if (v.includes("high") || v.includes("critical") || v.includes("very high") || v.includes("mataas")) {
      badgeClass = "is-danger";
    } else if (v.includes("mod") || v.includes("medium") || v.includes("warn") || v.includes("low") || v.includes("katamtaman")) {
      badgeClass = "is-warn";
    }
    const label = val || (isEn ? "Low / Safe" : "Ligtas / Mababa");
    return <span className={`app-confirm-badge ${badgeClass}`}>{label}</span>;
  };

  return (
    <div
      className="app-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div className="app-confirm-dialog">
        {/* Header */}
        <div className="app-confirm-header">
          <div className="app-confirm-header-left">
            <img src="/logo.png" alt="Bayan ng Luisiana" className="app-confirm-logo" />
            <div>
              <h2 id="app-confirm-title" className="app-confirm-title">
                {isEn ? "Review & Confirm Application" : "Suriin at Kumpirmahin ang Aplikasyon"}
              </h2>
              <p className="app-confirm-subtitle">
                {isEn
                  ? "Please review all details before officially submitting to the MPDC Office"
                  : "Pakisuri ang mga impormasyon bago opisyal na isumite sa Tanggapan ng MPDC"}
              </p>
            </div>
          </div>
          {!submitting && (
            <button
              type="button"
              className="app-confirm-close-btn"
              onClick={onClose}
              aria-label={isEn ? "Close review modal" : "Isara ang pagsusuri"}
              title={isEn ? "Close" : "Isara"}
            >
              ✕
            </button>
          )}
        </div>

        {/* Scrollable Form Review Body */}
        <div className="app-confirm-body">
          {/* 1. Proyekto & Kategorya */}
          <div className="app-confirm-card">
            <div className="app-confirm-card-head">
              <div className="app-confirm-card-title">
                <IconClipboard />
                <span>{isEn ? "Category & Project" : "Kategorya at Proyekto"}</span>
              </div>
              <span className="app-confirm-badge is-accent">
                {data.categoryLabel}
              </span>
            </div>
            <div className="app-confirm-grid">
              <div className="app-confirm-item full-width">
                <span className="app-confirm-item-label">{isEn ? "Project Title" : "Pamagat ng Proyekto"}</span>
                <span className="app-confirm-item-val">{data.title || (isEn ? "Untitled Application" : "Walang Pamagat")}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Estimated Cost" : "Tinatayang Halaga (Cost)"}</span>
                <span className="app-confirm-item-val">
                  {typeof data.estimatedCostPhp === "number" && data.estimatedCostPhp > 0
                    ? `₱${data.estimatedCostPhp.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                    : (isEn ? "Not Specified" : "Hindi Tinukoy")}
                </span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Department Service" : "Serbisyo ng Tanggapan"}</span>
                <span className="app-confirm-item-val">Locational Clearance / Zoning</span>
              </div>

              {/* Agricultural Specifics */}
              {data.category === "agricultural" && (
                <>
                  <div className="app-confirm-item">
                    <span className="app-confirm-item-label">{isEn ? "Farm / Livestock Type" : "Uri ng Sakahan / Hayop"}</span>
                    <span className="app-confirm-item-val">{data.farmType || (isEn ? "Not specified" : "Hindi tinukoy")}</span>
                  </div>
                  <div className="app-confirm-item">
                    <span className="app-confirm-item-label">{isEn ? "Head Capacity" : "Kapasidad (Head Capacity)"}</span>
                    <span className="app-confirm-item-val">{data.headCapacity ? `${data.headCapacity} heads` : "0"}</span>
                  </div>
                  <div className="app-confirm-item full-width">
                    <span className="app-confirm-item-label">{isEn ? "Waste Management" : "Pamamahala ng Dumi (Waste Mgt.)"}</span>
                    <span className="app-confirm-item-val">{data.wasteManagement || (isEn ? "Not specified" : "Hindi tinukoy")}</span>
                  </div>
                </>
              )}

              {/* Municipal Specifics */}
              {data.category === "municipal_project" && (
                <>
                  <div className="app-confirm-item">
                    <span className="app-confirm-item-label">{isEn ? "Department / Office" : "Kagawaran / Tanggapan"}</span>
                    <span className="app-confirm-item-val">{data.implementingDepartment || "LGU Luisiana"}</span>
                  </div>
                  <div className="app-confirm-item">
                    <span className="app-confirm-item-label">{isEn ? "Funding Source" : "Pinagmulan ng Pondo"}</span>
                    <span className="app-confirm-item-val">{data.fundingSource || "General Fund / 20% DF"}</span>
                  </div>
                  {data.cipCode && (
                    <div className="app-confirm-item">
                      <span className="app-confirm-item-label">CIP Code</span>
                      <span className="app-confirm-item-val">{data.cipCode}</span>
                    </div>
                  )}
                  {data.targetBeneficiaries && (
                    <div className="app-confirm-item">
                      <span className="app-confirm-item-label">{isEn ? "Target Beneficiaries" : "Mga Benepisyaryo"}</span>
                      <span className="app-confirm-item-val">{data.targetBeneficiaries}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 2. Impormasyon ng Aplikante */}
          <div className="app-confirm-card">
            <div className="app-confirm-card-head">
              <div className="app-confirm-card-title">
                <IconUser />
                <span>{isEn ? "Applicant Information" : "Impormasyon ng Aplikante"}</span>
              </div>
            </div>
            <div className="app-confirm-grid">
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Full Name" : "Buong Pangalan"}</span>
                <span className="app-confirm-item-val">{data.applicantName || (isEn ? "Applicant" : "Aplikante")}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Phone Number" : "Numero ng Telepono"}</span>
                <span className="app-confirm-item-val">{data.contactPhone || (isEn ? "No number" : "Walang numero")}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Email Address" : "Email Address"}</span>
                <span className="app-confirm-item-val">{data.contactEmail || (isEn ? "No email" : "Walang email")}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Barangay in Luisiana" : "Barangay sa Luisiana"}</span>
                <span className="app-confirm-item-val">{data.barangay}</span>
              </div>
              <div className="app-confirm-item full-width">
                <span className="app-confirm-item-label">{isEn ? "Address / Lot Location" : "Tirahan / Lokasyon ng Lote"}</span>
                <span className="app-confirm-item-val">{data.locationDescription || `${data.barangay}, Luisiana, Laguna`}</span>
              </div>
            </div>
          </div>

          {/* 3. Detalye ng Lote at Zoning */}
          <div className="app-confirm-card">
            <div className="app-confirm-card-head">
              <div className="app-confirm-card-title">
                <IconTag />
                <span>{isEn ? "Lot & Zoning Details" : "Detalye ng Lote at Zoning"}</span>
              </div>
              {data.zoningClassification && (
                <span className="app-confirm-badge is-accent">
                  {data.zoningClassification}
                </span>
              )}
            </div>
            <div className="app-confirm-grid">
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "TCT No. / Title" : "TCT No. / Titulo"}</span>
                <span className="app-confirm-item-val">{data.tctNo || (isEn ? "Not Specified" : "Hindi Tinukoy")}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Tax Declaration No." : "Tax Declaration No."}</span>
                <span className="app-confirm-item-val">{data.taxDecNo || (isEn ? "Not Specified" : "Hindi Tinukoy")}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Lot Ownership Status" : "Katayuan sa Lote"}</span>
                <span className="app-confirm-item-val">
                  {data.isOwner
                    ? (isEn ? "Applicant is the Owner" : "Aplikante ang May-ari")
                    : (isEn ? "Authorized Representative" : "May Pahintulot / Kinatawan")}
                </span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Building Type" : "Uri ng Gusali"}</span>
                <span className="app-confirm-item-val">{data.buildingType || "Residential / Standard"}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Lot Area" : "Sukat ng Lote"}</span>
                <span className="app-confirm-item-val">
                  {typeof data.lotAreaSqM === "number" && data.lotAreaSqM > 0
                    ? `${data.lotAreaSqM.toLocaleString()} sq.m.`
                    : (isEn ? "Not Specified" : "Hindi Tinukoy")}
                </span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Official CLUP Zone" : "Opisyal na CLUP Zone"}</span>
                <span className="app-confirm-item-val">{data.zoningClassification || "Urban / Rural Zone"}</span>
              </div>
            </div>
          </div>

          {/* 4. GIS Location Siting & Hazard Clearance */}
          <div className="app-confirm-card">
            <div className="app-confirm-card-head">
              <div className="app-confirm-card-title">
                <IconPin />
                <span>{isEn ? "GIS Location & Hazard Clearance" : "Lokasyon sa GIS & Clearance sa Panganib"}</span>
              </div>
            </div>
            <div className="app-confirm-grid">
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Lot Coordinates (Pin)" : "Koordinada ng Lote (Pin)"}</span>
                <span className="app-confirm-item-val" style={{ fontFamily: "monospace", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span>{data.pinnedCoords.lat.toFixed(6)}° N, {data.pinnedCoords.lon.toFixed(6)}° E</span>
                  {data.isGeotagged && (
                    <span style={{ fontSize: "0.72rem", padding: "1px 6px", borderRadius: 4, background: "rgba(16,185,129,0.15)", color: "#10b981", fontWeight: 600 }}>
                      📸 Geotag
                    </span>
                  )}
                </span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Mt. Banahaw Distance" : "Distansya sa Mt. Banahaw"}</span>
                <span className="app-confirm-item-val">
                  {data.banahawKm.toFixed(1)} {isEn ? "km north of summit" : "km hilaga ng summit"}
                </span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Flood Hazard Status" : "Katayuan sa Baha (Flood Hazard)"}</span>
                <div>{getHazardBadge(data.floodHazard)}</div>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">{isEn ? "Rain-Induced Landslide Status" : "Katayuan sa Landslide (Ulan)"}</span>
                <div>{getHazardBadge(data.landslideHazard)}</div>
              </div>
            </div>
          </div>

          {/* 5. Mga Kalakip na Dokumento */}
          <div className="app-confirm-card">
            <div className="app-confirm-card-head">
              <div className="app-confirm-card-title">
                <IconFolder />
                <span>{isEn ? "Attached Documents" : "Mga Kalakip na Dokumento"}</span>
              </div>
            </div>
            <div className="app-confirm-docs-list">
              {data.attachedDocs.filter((d) => Boolean(d.filename)).length > 0 ? (
                data.attachedDocs
                  .filter((d) => Boolean(d.filename))
                  .map((doc, idx) => (
                    <div key={idx} className="app-confirm-doc-row">
                      <span className="app-confirm-doc-name">
                        <span style={{ color: "var(--apple-safe, #15803d)", fontWeight: 700 }}>✓</span>
                        {doc.filename}
                      </span>
                      <span className="app-confirm-doc-tag">{doc.label}</span>
                    </div>
                  ))
              ) : (
                <div style={{ fontSize: "0.8rem", color: "var(--apple-text-secondary, #6e6e73)", fontStyle: "italic", padding: "4px 0" }}>
                  {isEn
                    ? "No uploaded files (Physical copies may also be presented at the MPDC Office)."
                    : "Walang na-upload na file (Maaari ding i-presenta ang pisikal na kopya sa tanggapan ng MPDC)."}
                </div>
              )}
            </div>
          </div>

          {/* Legal Affirmation */}
          <div className="app-confirm-attestation">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--apple-accent, #0071e3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
            <span>
              {isEn ? (
                <>
                  By clicking <strong>"Confirm & Submit Now"</strong>, you certify that all information declared is true, complete, and correct pursuant to the regulations of the Municipality of Luisiana and the Data Privacy Act (RA 10173).
                </>
              ) : (
                <>
                  Sa pagpindot ng <strong>"Kumpirmahin at I-submit Na"</strong>, pinatutunayan mo na totoo, kumpleto, at wasto ang lahat ng impormasyon na iyong ipinahayag alinsunod sa mga panuntunan ng Bayan ng Luisiana at Data Privacy Act (RA 10173).
                </>
              )}
            </span>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="app-confirm-footer">
          <button
            type="button"
            className="app-confirm-btn-back"
            onClick={onClose}
            disabled={submitting}
          >
            <span>{isEn ? "← Edit Form" : "← Baguhin ang Form"}</span>
          </button>
          <button
            type="button"
            className="app-confirm-btn-submit"
            disabled={submitting}
            onClick={onConfirmSubmit}
          >
            {submitting ? (
              <span>{isEn ? "Submitting Application..." : "Isinusumite ang Aplikasyon..."}</span>
            ) : (
              <>
                <span>{isEn ? "Confirm & Submit Now" : "Kumpirmahin at I-submit Na"}</span>
                <span>✓</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
