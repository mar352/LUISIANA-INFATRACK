import React, { useEffect } from "react";
import type { ProjectCategory } from "../types";
import "./ApplicationConfirmModal.css";

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
    if (v.includes("high") || v.includes("critical") || v.includes("very high")) {
      badgeClass = "is-danger";
    } else if (v.includes("mod") || v.includes("medium") || v.includes("warn") || v.includes("low")) {
      badgeClass = "is-warn";
    }
    return <span className={`app-confirm-badge ${badgeClass}`}>{val || "Safe"}</span>;
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
                Suriin at Kumpirmahin ang Aplikasyon
              </h2>
              <p className="app-confirm-subtitle">
                Pakisuri ang mga impormasyon bago opisyal na isumite sa Tanggapan ng MPDC
              </p>
            </div>
          </div>
          {!submitting && (
            <button
              type="button"
              className="app-confirm-close-btn"
              onClick={onClose}
              aria-label="Isara ang pagsusuri"
              title="Isara"
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
                <span>📋</span>
                <span>Kategorya at Proyekto</span>
              </div>
              <span className="app-confirm-badge is-accent">
                {data.categoryLabel}
              </span>
            </div>
            <div className="app-confirm-grid">
              <div className="app-confirm-item full-width">
                <span className="app-confirm-item-label">Pamagat ng Proyekto</span>
                <span className="app-confirm-item-val">{data.title || "Walang Pamagat"}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Tinatayang Halaga (Cost)</span>
                <span className="app-confirm-item-val">
                  {typeof data.estimatedCostPhp === "number" && data.estimatedCostPhp > 0
                    ? `₱${data.estimatedCostPhp.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                    : "Hindi Tinukoy"}
                </span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Serbisyo ng Tanggapan</span>
                <span className="app-confirm-item-val">Locational Clearance / Zoning</span>
              </div>

              {/* Agricultural Specifics */}
              {data.category === "agricultural" && (
                <>
                  <div className="app-confirm-item">
                    <span className="app-confirm-item-label">Uri ng Sakahan / Hayop</span>
                    <span className="app-confirm-item-val">{data.farmType || "Hindi tinukoy"}</span>
                  </div>
                  <div className="app-confirm-item">
                    <span className="app-confirm-item-label">Kapasidad (Head Capacity)</span>
                    <span className="app-confirm-item-val">{data.headCapacity ? `${data.headCapacity} heads` : "0"}</span>
                  </div>
                  <div className="app-confirm-item full-width">
                    <span className="app-confirm-item-label">Pamamahala ng Dumi (Waste Mgt.)</span>
                    <span className="app-confirm-item-val">{data.wasteManagement || "Hindi tinukoy"}</span>
                  </div>
                </>
              )}

              {/* Municipal Specifics */}
              {data.category === "municipal_project" && (
                <>
                  <div className="app-confirm-item">
                    <span className="app-confirm-item-label">Kagawaran / Tanggapan</span>
                    <span className="app-confirm-item-val">{data.implementingDepartment || "LGU Luisiana"}</span>
                  </div>
                  <div className="app-confirm-item">
                    <span className="app-confirm-item-label">Pinagmulan ng Pondo</span>
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
                      <span className="app-confirm-item-label">Mga Benepisyaryo</span>
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
                <span>👤</span>
                <span>Impormasyon ng Aplikante</span>
              </div>
            </div>
            <div className="app-confirm-grid">
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Buong Pangalan</span>
                <span className="app-confirm-item-val">{data.applicantName || "Aplikante"}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Numero ng Telepono</span>
                <span className="app-confirm-item-val">{data.contactPhone || "Walang numero"}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Email Address</span>
                <span className="app-confirm-item-val">{data.contactEmail || "Walang email"}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Barangay sa Luisiana</span>
                <span className="app-confirm-item-val">{data.barangay}</span>
              </div>
              <div className="app-confirm-item full-width">
                <span className="app-confirm-item-label">Tirahan / Lokasyon ng Lote</span>
                <span className="app-confirm-item-val">{data.locationDescription || `${data.barangay}, Luisiana, Laguna`}</span>
              </div>
            </div>
          </div>

          {/* 3. Detalye ng Lote at Zoning */}
          <div className="app-confirm-card">
            <div className="app-confirm-card-head">
              <div className="app-confirm-card-title">
                <span>🏷️</span>
                <span>Detalye ng Lote at Zoning</span>
              </div>
              {data.zoningClassification && (
                <span className="app-confirm-badge is-accent">
                  {data.zoningClassification}
                </span>
              )}
            </div>
            <div className="app-confirm-grid">
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">TCT No. / Titulo</span>
                <span className="app-confirm-item-val">{data.tctNo || "Hindi Tinukoy"}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Tax Declaration No.</span>
                <span className="app-confirm-item-val">{data.taxDecNo || "Hindi Tinukoy"}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Katayuan sa Lote</span>
                <span className="app-confirm-item-val">
                  {data.isOwner ? "Aplikante ang May-ari" : "May Pahintulot / Kinatawan"}
                </span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Uri ng Gusali</span>
                <span className="app-confirm-item-val">{data.buildingType || "Residential / Standard"}</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Sukat ng Lote</span>
                <span className="app-confirm-item-val">
                  {typeof data.lotAreaSqM === "number" && data.lotAreaSqM > 0
                    ? `${data.lotAreaSqM.toLocaleString()} sq.m.`
                    : "Hindi Tinukoy"}
                </span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Opisyal na CLUP Zone</span>
                <span className="app-confirm-item-val">{data.zoningClassification || "Urban / Rural Zone"}</span>
              </div>
            </div>
          </div>

          {/* 4. GIS Location Siting & Hazard Clearance */}
          <div className="app-confirm-card">
            <div className="app-confirm-card-head">
              <div className="app-confirm-card-title">
                <span>📍</span>
                <span>GIS Location &amp; Hazard Clearance</span>
              </div>
            </div>
            <div className="app-confirm-grid">
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Koordinada ng Lote (Pin)</span>
                <span className="app-confirm-item-val" style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>
                  {data.pinnedCoords.lat.toFixed(6)}° N, {data.pinnedCoords.lon.toFixed(6)}° E
                </span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Mt. Banahaw Distance</span>
                <span className="app-confirm-item-val">{data.banahawKm.toFixed(1)} km hilaga ng summit</span>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Katayuan sa Baha (Flood Hazard)</span>
                <div>{getHazardBadge(data.floodHazard)}</div>
              </div>
              <div className="app-confirm-item">
                <span className="app-confirm-item-label">Katayuan sa Landslide (Ulan)</span>
                <div>{getHazardBadge(data.landslideHazard)}</div>
              </div>
            </div>
          </div>

          {/* 5. Mga Kalakip na Dokumento */}
          <div className="app-confirm-card">
            <div className="app-confirm-card-head">
              <div className="app-confirm-card-title">
                <span>📁</span>
                <span>Mga Kalakip na Dokumento</span>
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
                  Walang na-upload na file (Maaari ding i-presenta ang pisikal na kopya sa tanggapan ng MPDC).
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
              Sa pagpindot ng <strong>"Kumpirmahin at I-submit Na"</strong>, pinatutunayan mo na totoo, kumpleto, at wasto ang lahat ng impormasyon na iyong ipinahayag alinsunod sa mga panuntunan ng Bayan ng Luisiana at Data Privacy Act (RA 10173).
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
            <span>← Baguhin ang Form</span>
          </button>
          <button
            type="button"
            className="app-confirm-btn-submit"
            disabled={submitting}
            onClick={onConfirmSubmit}
          >
            {submitting ? (
              <span>Isinusumite ang Aplikasyon...</span>
            ) : (
              <>
                <span>Kumpirmahin at I-submit Na</span>
                <span>✓</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
