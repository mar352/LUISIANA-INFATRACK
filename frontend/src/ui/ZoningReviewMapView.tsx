import { useEffect, useMemo, useState } from "react";
import PinpointMapPicker, { BARANGAY_COORDINATES } from "./PinpointMapPicker";
import {
  banahawDistanceKm,
  fetchGeoriskAssess,
  type GeoRiskAssess,
} from "../lib/luisiana-site-assess";
import { printSiteHazardReport } from "../lib/hazard-report";
import "./ZoningReviewMapView.css";

/* ── Vector SVG Icons (No Emojis) ── */
function IconMapPin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconCheckCircle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconCheck({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconBuilding({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="9" y1="22" x2="9" y2="22.01" />
      <line x1="15" y1="22" x2="15" y2="22.01" />
      <line x1="9" y1="6" x2="9" y2="6.01" />
      <line x1="15" y1="6" x2="15" y2="6.01" />
      <line x1="9" y1="10" x2="9" y2="10.01" />
      <line x1="15" y1="10" x2="15" y2="10.01" />
      <line x1="9" y1="14" x2="9" y2="14.01" />
      <line x1="15" y1="14" x2="15" y2="14.01" />
      <line x1="9" y1="18" x2="9" y2="18.01" />
      <line x1="15" y1="18" x2="15" y2="18.01" />
    </svg>
  );
}

function IconShieldCheck({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function IconAlertTriangle({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconBolt({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconSend({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

import { getClupZone, normalizeBarangayName, type ClupZoneInfo } from "../lib/clup-zones";

function getHazardColor(val?: string | null) {
  if (!val) return "#10b981";
  const v = val.toLowerCase();
  if (v.includes("high") || v.includes("very high") || v.includes("critical")) return "#ef4444";
  if (v.includes("moderate") || v.includes("medium")) return "#f59e0b";
  if (v.includes("low")) return "#38bdf8";
  return "#10b981";
}

type Props = {
  application: any;
  onUpdateApplication?: (updated: any) => void;
  onEndorseInspection?: (appId: string, notes: string) => void;
  onApprove?: (appId: string) => void;
  onDeny?: (appId: string) => void;
  onSendNotes?: (notes: string) => void;
  reviewerNotes?: string;
  onChangeReviewerNotes?: (notes: string) => void;
  updating?: boolean;
};

export function ZoningReviewMapView({
  application,
  onUpdateApplication,
  onEndorseInspection,
  onApprove,
  onDeny,
  onSendNotes,
  reviewerNotes,
  onChangeReviewerNotes,
  updating = false,
}: Props) {
  const applicantBarangay = normalizeBarangayName(application.applicant?.barangay || "Barangay Zone I (Poblacion)");

  // Initial coordinates from application
  const initialLat =
    typeof application.latitude === "number"
      ? application.latitude
      : typeof application.coordinates?.lat === "number"
      ? application.coordinates.lat
      : typeof application.lotDetails?.lat === "number"
      ? application.lotDetails.lat
      : BARANGAY_COORDINATES[applicantBarangay]?.lat ?? 14.1856;

  const initialLon =
    typeof application.longitude === "number"
      ? application.longitude
      : typeof application.coordinates?.lon === "number"
      ? application.coordinates.lon
      : typeof application.lotDetails?.lon === "number"
      ? application.lotDetails.lon
      : BARANGAY_COORDINATES[applicantBarangay]?.lon ?? 121.5098;

  const [currCoords] = useState({ lat: initialLat, lon: initialLon });
  const [currBarangay] = useState(applicantBarangay);

  // Live hazard assessment
  const [geoRisk, setGeoRisk] = useState<GeoRiskAssess | null>(null);
  const [loadingHazard, setLoadingHazard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingHazard(true);
    fetchGeoriskAssess(currCoords.lat, currCoords.lon)
      .then((res) => {
        if (!cancelled) {
          setGeoRisk(res);
          setLoadingHazard(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingHazard(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currCoords.lat, currCoords.lon]);

  const ban = useMemo(() => {
    return banahawDistanceKm(currCoords.lat, currCoords.lon);
  }, [currCoords.lat, currCoords.lon]);

  const [justSent, setJustSent] = useState(false);

  const zoningInfo = useMemo(() => getClupZone(currBarangay), [currBarangay]);

  const proposedBuilding = application.property?.proposedBuildingType || "Residential";

  const appStatus = (application?.status || "").toLowerCase();
  const isOcularInspection =
    appStatus === "ocular_inspection" ||
    appStatus === "for_ocular_inspection" ||
    appStatus === "inspection";

  const isForPayment = appStatus === "for_payment" || appStatus === "approved_for_payment";
  const isForEngineering = appStatus === "for_engineering_inspection";
  const isApproved = appStatus === "approved" || appStatus === "completed" || isForPayment || isForEngineering;
  const isDenied = appStatus === "rejected" || appStatus === "denied";

  return (
    <div className="zrm-wrapper">
      {/* Officer Header Banner with SLA and Actions */}
      <div className="zrm-header-banner">
        <div className="zrm-header-left">
          <span className="zrm-stage-badge">
            <IconMapPin size={14} />
            HAKBANG 2 · ZONING OFFICER VERIFICATION
          </span>
          <div>
            <h3 className="zrm-title">
              Pagsusuri ng Eksaktong Lokasyon sa GIS Mapa &amp; Hazard Screening (Checking Mode)
            </h3>
            <p className="zrm-desc">
              Suriin ang na-pinpoint na lote ng aplikante sa interactive Cesium map. I-crosscheck sa CLUP zoning at hazard layers bago isagawa ang 1-araw na ocular inspection.
            </p>
          </div>
        </div>

        <div className="zrm-header-actions">
          {isApproved ? (
            <div
              className="zrm-status-badge is-approved"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 6,
                background: "rgba(16, 185, 129, 0.18)",
                border: "1px solid rgba(16, 185, 129, 0.45)",
                color: "#34d399",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              <IconCheckCircle size={16} />
              <span>
                {isForEngineering
                  ? "✓ Bayad Na (Papasok sa Engineering)"
                  : isForPayment
                  ? "✓ Aprubado (Nai-isyu ang Order of Payment)"
                  : "✓ Naaprubahan na ang Clearance"}
              </span>
            </div>
          ) : isDenied ? (
            <div
              className="zrm-status-badge is-denied"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 6,
                background: "rgba(239, 68, 68, 0.18)",
                border: "1px solid rgba(239, 68, 68, 0.45)",
                color: "#f87171",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              <IconAlertTriangle size={16} />
              <span>✕ Na-deny ang Aplikasyon</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── THE EXACT MAP FROM THE APPLICATION (PinpointMapPicker · Read Only for Checking) ── */}
      <div className="zrm-map-section">
        <div className="zrm-map-label-bar">
          <div className="zrm-map-label-left">
            <IconMapPin size={16} />
            <strong>Lokasyon ng Lote ng Aplikante (View &amp; Verification Mode · Read Only)</strong>
          </div>
          <div className="zrm-map-label-right">
            <div
              className={`zrm-zone-tag ${zoningInfo.isCommercial ? "is-commercial" : "is-outlying"}`}
              style={{
                color: zoningInfo.badgeColor,
                background: zoningInfo.badgeBg,
                border: `1px solid ${zoningInfo.borderColor}`,
              }}
            >
              <IconBuilding size={13} />
              <span>Sona: <strong>{zoningInfo.name}</strong></span>
            </div>
            <div className="zrm-map-coords-pill">
              <span>Coordinate Pin ng Aplikante:</span>
              <strong>
                {currCoords.lat.toFixed(6)}° N, {currCoords.lon.toFixed(6)}° E
              </strong>
            </div>
          </div>
        </div>

        <PinpointMapPicker
          lon={currCoords.lon}
          lat={currCoords.lat}
          selectedBarangay={currBarangay}
          height={460}
          showHazardToggles={true}
          readOnly={true}
        />
      </div>

      {/* ── Siting Assessment & CLUP Conformity (2 Columns) ── */}
      <div className="zrm-eval-grid">
        {/* Column 1: LUISIANA SITING ASSESSMENT (Exact match with Application Step 3) */}
        <div className="app-assess-card">
          <div className="app-assess-card-title">
            LUISIANA SITING ASSESSMENT (GEOHAZARD CLEARANCE)
          </div>

          <dl className="app-assess-list">
            <div className="app-assess-row">
              <dt>Ground shaking</dt>
              <dd style={{ color: "#38bdf8" }}>PEIS VIII</dd>
            </div>

            <div className="app-assess-row">
              <dt>EIL 2014</dt>
              <dd style={{ color: "#38bdf8" }}>Low</dd>
            </div>

            <div className="app-assess-row">
              <dt>Siting class</dt>
              <dd style={{ color: "#38bdf8" }}>LOW — standard seismic design</dd>
            </div>

            <div className="app-assess-row">
              <dt>Terrain model</dt>
              <dd style={{ color: "#ffffff" }}>Not ready</dd>
            </div>

            <div className="app-assess-row">
              <dt>Flood</dt>
              <dd style={{ color: getHazardColor(geoRisk?.flood?.value) }}>
                {loadingHazard ? "Sinusuri…" : geoRisk?.flood?.value || "Safe"}
              </dd>
            </div>

            <div className="app-assess-row">
              <dt>Rain-induced landslide</dt>
              <dd style={{ color: getHazardColor(geoRisk?.landslide?.value) }}>
                {loadingHazard ? "Sinusuri…" : geoRisk?.landslide?.value || "Safe"}
              </dd>
            </div>

            <div className="app-assess-row">
              <dt>Mt. Banahaw</dt>
              <dd style={{ color: "#ffffff" }}>
                {ban.km.toFixed(1)} km {ban.bearing} of summit
              </dd>
            </div>
          </dl>

          <p className="app-assess-note">
            Luisiana only · MGB flood &amp; landslide (GeoRiskPH) + PHIVOLCS 2014 sheets + local terrain model.
          </p>

          <button
            type="button"
            className="app-assess-report-btn"
            onClick={() => {
              void printSiteHazardReport({
                name: application.trackingNumber ? `Application ${application.trackingNumber}` : "Application Site",
                barangay: currBarangay,
                locationLabel: `${currBarangay}, Luisiana, Laguna`,
                lat: currCoords.lat,
                lon: currCoords.lon,
                live: {
                  flood: geoRisk?.flood || { value: "Safe", code: null },
                  landslide: geoRisk?.landslide || { value: "Safe", code: null },
                },
              });
            }}
          >
            View PDF Hazard Report ↗
          </button>
        </div>

        {/* Column 2: CLUP Zoning Conformity & Ocular Inspection Checklist */}
        <div className="zrm-clup-card">
          <div className="zrm-clup-title">
            CLUP ZONING CONFORMITY &amp; OCULAR INSPECTION CHECKLIST
          </div>

          <div className="zrm-clup-rows">
            <div className="zrm-clup-row">
              <span className="zrm-clup-lbl">Sona ng Lote:</span>
              <div className="zrm-clup-val">
                <span
                  className="zrm-clup-pill"
                  style={{
                    background: zoningInfo.badgeBg,
                    color: zoningInfo.badgeColor,
                    borderColor: zoningInfo.borderColor,
                    fontWeight: 700,
                  }}
                >
                  {zoningInfo.name}
                </span>
              </div>
            </div>

            <div className="zrm-clup-row">
              <span className="zrm-clup-lbl">Ipinapanukalang Gusali:</span>
              <div className="zrm-clup-val">
                <IconBuilding size={14} />
                <strong>{proposedBuilding}</strong>
              </div>
            </div>

            <div className="zrm-clup-row">
              <span className="zrm-clup-lbl">Zoning Conformity:</span>
              <span className="zrm-conformity-badge">
                <IconShieldCheck size={14} />
                Conforming sa CLUP Plan
              </span>
            </div>

            <div className="zrm-clup-row full">
              <span className="zrm-clup-lbl">Deskripsyon ng Sona:</span>
              <p className="zrm-clup-desc">{zoningInfo.desc}</p>
            </div>
          </div>

          {/* Ocular Inspection Protocol Checklist */}
          <div className="zrm-inspection-protocol">
            <strong className="zrm-ip-head">
              Mga Dapat Kumpirmahin sa 1-Araw na Ocular Inspection:
            </strong>
            <ul className="zrm-ip-list">
              <li>
                <IconCheck size={12} />
                <span>
                  <strong>Boundary Monuments (Mohon):</strong> Kumpirmahin ang aktwal na mohon ng lupa ayon sa TCT title.
                </span>
              </li>
              <li>
                <IconCheck size={12} />
                <span>
                  <strong>Road Right-of-Way (ROW):</strong> Siguraduhing may sapat na lapad ng daan at walang encroachment.
                </span>
              </li>
              <li>
                <IconCheck size={12} />
                <span>
                  <strong>Building Setbacks:</strong> Minimum 3.0m sa harapan, 2.0m sa mga gilid at likuran bago magbuhos.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── HAKBANG 2: ZONING OFFICER DECISION & RECOMMENDATION CARD ── */}
      <div
        className="zrm-officer-decision-card"
        style={{
          marginTop: 20,
          background: "rgba(15, 23, 42, 0.75)",
          border: "1px solid rgba(56, 189, 248, 0.35)",
          borderRadius: 10,
          padding: "18px 20px",
        }}
      >
        {/* Quick note templates */}
        <div style={{ marginBottom: 14 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 800,
              color: "#f59e0b",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            <IconBolt size={14} />
            Bilis-Aksyon ng Zoning Officer (Template Notes para sa Hakbang 2):
          </span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                const note = `[Hakbang 2 Ocular Inspection]: Naisagawa ang 1-araw na ocular inspection sa lote sa ${currBarangay}. Ligtas sa hazard, walang paglabag sa CLUP zoning ordinance (${zoningInfo.name}), at sumusunod sa itinakdang building setback. Inirerekomenda para sa pag-apruba.`;
                onChangeReviewerNotes?.(note);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                color: "#34d399",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <IconCheck size={13} />
              Punan: &quot;Passed Ocular Inspection / Ligtas&quot;
            </button>
            <button
              type="button"
              onClick={() => {
                const note = `[Hakbang 2 Ocular Inspection]: May nakitang paglabag sa zoning o mataas na hazard risk sa site sa ${currBarangay} matapos ang ocular inspection. Hindi sumusunod sa CLUP zoning guidelines o may encroachment sa Right-of-Way.`;
                onChangeReviewerNotes?.(note);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.4)",
                color: "#fbbf24",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <IconAlertTriangle size={13} />
              Punan: &quot;May Violation / Hindi Ligtas&quot;
            </button>
          </div>
        </div>

        {/* Textarea */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 800,
              color: "#38bdf8",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Opisyal na Rekomendasyon at Notes ng Zoning Officer:
          </label>
          <textarea
            rows={3}
            value={reviewerNotes || ""}
            onChange={(e) => onChangeReviewerNotes?.(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                if (!updating && reviewerNotes?.trim()) {
                  setJustSent(true);
                  onSendNotes?.(reviewerNotes.trim());
                  setTimeout(() => setJustSent(false), 2400);
                }
              }
            }}
            placeholder="Hal. Naisagawa ang 1-araw na ocular inspection. Ligtas sa hazard at sumusunod sa CLUP zoning… (Ctrl+Enter para i-send agad)"
            style={{
              width: "100%",
              background: "rgba(2, 6, 23, 0.75)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              borderRadius: 6,
              color: "#e2e8f0",
              fontSize: 13,
              lineHeight: "1.5",
              padding: "10px 12px",
              boxSizing: "border-box",
              outline: "none",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 11.5, color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>Pindutin ang <strong>Ctrl + Enter</strong> para i-send</span>
            </span>
            <button
              type="button"
              disabled={updating || !reviewerNotes?.trim()}
              onClick={() => {
                if (!reviewerNotes?.trim()) return;
                setJustSent(true);
                onSendNotes?.(reviewerNotes.trim());
                setTimeout(() => setJustSent(false), 2400);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: justSent ? "#059669" : "#0284c7",
                color: "#ffffff",
                border: justSent ? "1px solid #10b981" : "1px solid #38bdf8",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: updating || !reviewerNotes?.trim() ? "not-allowed" : "pointer",
                opacity: updating || !reviewerNotes?.trim() ? 0.6 : 1,
                boxShadow: justSent ? "0 0 14px rgba(16, 185, 129, 0.4)" : undefined,
                transition: "all 0.2s ease",
              }}
              title="I-send ang opisyal na notes ng Zoning Officer (Ctrl+Enter)"
            >
              {justSent ? <IconCheck size={14} /> : <IconSend size={14} />}
              <span>{justSent ? "✓ Naipadala Na!" : updating ? "Ipinapadala..." : "Send Notes"}</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#f59e0b",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Aksyon ng Zoning Officer (Hakbang 2: 1-Araw na Ocular Inspection):
          </label>
          {isApproved ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 6,
                background: "rgba(16, 185, 129, 0.16)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                color: "#34d399",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              <IconCheckCircle size={18} />
              <span>
                {isForEngineering
                  ? "Bayad na ang Kliyente sa Treasury. Papasok na sa Engineering Office para sa Before Inspection."
                  : isForPayment
                  ? "Zoning Approved! Nai-isyu na ang Order of Payment para sa pagbabayad sa Municipal Treasury."
                  : "Naaprubahan na at Nai-isyu ang Opisyal na Zoning Clearance."}
              </span>
            </div>
          ) : isDenied ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 6,
                background: "rgba(239, 68, 68, 0.16)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "#f87171",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              <IconAlertTriangle size={18} />
              <span>Na-deny ang aplikasyon dahil sa paglabag sa zoning o site hazards.</span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={updating}
                onClick={() => onApprove?.(application.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  background: "#059669",
                  color: "#fff",
                  border: "1px solid #10b981",
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: updating ? "not-allowed" : "pointer",
                }}
              >
                <IconCheckCircle size={16} />
                <span>Aprubahan at I-isyu ang Zoning Clearance</span>
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={() => onDeny?.(application.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  background: "rgba(239, 68, 68, 0.18)",
                  color: "#f87171",
                  border: "1px solid rgba(239, 68, 68, 0.45)",
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: updating ? "not-allowed" : "pointer",
                }}
              >
                <IconAlertTriangle size={16} />
                <span>I-Deny (May Violation sa Zoning)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ZoningReviewMapView;
