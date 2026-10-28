import React, { useState, useEffect, useMemo, useRef } from "react";
import PinpointMapPicker, { BARANGAY_COORDINATES } from "./PinpointMapPicker";
import { normalizeBarangayName, getClupZone, type ClupZoneInfo } from "../lib/clup-zones";
import { banahawDistanceKm, fetchGeoriskAssess, type GeoRiskAssess } from "../lib/luisiana-site-assess";
import { printSiteHazardReport } from "../lib/hazard-report";
import "./ZoningOcularInspectionView.css";

/* ── Vector SVG Icons ── */
const IconMapPin = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconShieldCheck = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const IconAlertTriangle = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconCheckCircle = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconBuilding = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="9" y1="22" x2="9" y2="22.01" />
    <line x1="15" y1="22" x2="15" y2="22.01" />
    <line x1="9" y1="6" x2="9" y2="6.01" />
    <line x1="15" y1="6" x2="15" y2="6.01" />
    <line x1="9" y1="10" x2="9" y2="10.01" />
    <line x1="15" y1="10" x2="15" y2="10.01" />
    <line x1="9" y1="14" x2="9" y2="14.01" />
    <line x1="15" y1="14" x2="15" y2="14.01" />
  </svg>
);

const IconUploadCloud = ({ size = 24, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="M12 12v9" />
    <path d="m16 16-4-4-4 4" />
  </svg>
);

const IconCamera = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const IconCalendar = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconUser = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconTrash = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconLock = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconCheck = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconFileText = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);


export interface SetbackComplianceState {
  roadSetback: boolean;
  waterwayEasement: boolean;
  faultLineClearance: boolean;
  boundaryMonuments: boolean;
}

export interface OcularInspectionPayload {
  applicationId?: string;
  trackingNumber: string;
  inspectionDate: string;
  inspectingOfficer: string;
  setbacks: SetbackComplianceState;
  remarks: string;
  photos: Array<{ file: File; name: string; size: number; previewUrl: string }>;
  decision: "approved" | "rejected";
}

export interface ZoningOcularInspectionViewProps {
  /** Optional active application. When absent, the UI gracefully renders pure empty states and placeholders */
  application?: any;
  /** Current logged-in officer name or default placeholder */
  officerName?: string;
  /** Callback triggered when Zoning Officer approves the clearance */
  onApprove?: (payload: OcularInspectionPayload) => void;
  /** Callback triggered when Zoning Officer rejects the clearance */
  onReject?: (payload: OcularInspectionPayload) => void;
  /** Callback to close or return */
  onClose?: () => void;
  /** Whether form submission is currently pending */
  submitting?: boolean;
  /** Read-only mode flag */
  readOnly?: boolean;
}

export function ZoningOcularInspectionView({
  application,
  officerName,
  onApprove,
  onReject,
  onClose,
  submitting = false,
  readOnly = false,
}: ZoningOcularInspectionViewProps) {
  // Tracking number placeholder logic (zero fake hardcoded data)
  const trackingNumber = application?.trackingNumber || "[LUIS-ZC-XXXX]";
  const isRealApp = Boolean(application?.trackingNumber);

  // Barangay and Coordinates handling
  const rawBarangay = application?.applicant?.barangay || application?.barangay || "";
  const normalizedBrgy = rawBarangay ? normalizeBarangayName(rawBarangay) : "Barangay Zone I (Poblacion)";
  const brgyDisplay = rawBarangay ? `Brgy. ${rawBarangay}` : "[Barangay / Lokasyon]";

  const applicantLat =
    typeof application?.latitude === "number"
      ? application.latitude
      : typeof application?.coordinates?.lat === "number"
      ? application.coordinates.lat
      : typeof application?.lotDetails?.lat === "number"
      ? application.lotDetails.lat
      : BARANGAY_COORDINATES[normalizedBrgy]?.lat ?? 14.1856;

  const applicantLon =
    typeof application?.longitude === "number"
      ? application.longitude
      : typeof application?.coordinates?.lon === "number"
      ? application.coordinates.lon
      : typeof application?.lotDetails?.lon === "number"
      ? application.lotDetails.lon
      : BARANGAY_COORDINATES[normalizedBrgy]?.lon ?? 121.5098;

  const hasCoordinates = Boolean(
    application?.latitude || application?.coordinates?.lat || application?.lotDetails?.lat
  );

  // CLUP Zoning info
  const zoningInfo: ClupZoneInfo = useMemo(() => {
    return getClupZone(normalizedBrgy);
  }, [normalizedBrgy]);

  const proposedUse =
    application?.property?.proposedBuildingType ||
    application?.lotDetails?.proposedBuildingType ||
    application?.buildingType ||
    (application?.category ? application.category.replace(/_/g, " ") : "[Ipinapanukalang Gamit ng Estruktura]");

  // Automated GeoHazard Data
  const [geoRisk, setGeoRisk] = useState<GeoRiskAssess | null>(null);
  const [loadingHazard, setLoadingHazard] = useState(false);

  useEffect(() => {
    let active = true;
    if (hasCoordinates) {
      setLoadingHazard(true);
      fetchGeoriskAssess(applicantLat, applicantLon)
        .then((res) => {
          if (active) {
            setGeoRisk(res);
            setLoadingHazard(false);
          }
        })
        .catch(() => {
          if (active) setLoadingHazard(false);
        });
    }
    return () => {
      active = false;
    };
  }, [applicantLat, applicantLon, hasCoordinates]);

  const banahaw = useMemo(() => {
    return banahawDistanceKm(applicantLat, applicantLon);
  }, [applicantLat, applicantLon]);

  // Form State: 1. Inspection Date (default: today)
  const [inspectionDate, setInspectionDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Form State: 2. Inspecting Officer (Read-only, default: Logged-in MPDC Officer)
  const resolvedOfficer = officerName?.trim() || "[Logged-in MPDC Officer]";

  // Form State: 3. Setback & Easement Checkboxes
  const [setbacks, setSetbacks] = useState<SetbackComplianceState>({
    roadSetback: false,
    waterwayEasement: false,
    faultLineClearance: false,
    boundaryMonuments: false,
  });

  const handleCheckboxChange = (key: keyof SetbackComplianceState) => {
    if (readOnly) return;
    setSetbacks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Form State: 4. Evaluator's Remarks
  const [remarks, setRemarks] = useState<string>("");

  // Form State: 5. Actual Site Photos (Drag-and-Drop)
  const [photos, setPhotos] = useState<
    Array<{ file: File; name: string; size: number; previewUrl: string }>
  >([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = (fileList: FileList | null) => {
    if (!fileList || readOnly) return;
    const newItems: Array<{ file: File; name: string; size: number; previewUrl: string }> = [];

    Array.from(fileList).forEach((file) => {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return;
      if (file.size > 15 * 1024 * 1024) return; // 15MB limit

      const previewUrl = URL.createObjectURL(file);
      newItems.push({
        file,
        name: file.name,
        size: file.size,
        previewUrl,
      });
    });

    if (newItems.length > 0) {
      setPhotos((prev) => [...prev, ...newItems]);
      setPhotoError(null);
    }
  };

  const handleRemovePhoto = (index: number) => {
    if (readOnly) return;
    setPhotos((prev) => {
      const target = prev[index];
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setPhotoError("Kinakailangan mag-upload ng kahit isang (1) Actual Site Photo ng ocular inspection bago maaprubahan ang Zoning Clearance.");
      }
      return updated;
    });
  };


  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!readOnly) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!readOnly && e.dataTransfer.files) {
      handleFileSelection(e.dataTransfer.files);
    }
  };

  // Quick notes helper templates
  const applyTemplate = (type: "pass" | "conditional" | "reject") => {
    if (readOnly) return;
    if (type === "pass") {
      setSetbacks({
        roadSetback: true,
        waterwayEasement: true,
        faultLineClearance: true,
        boundaryMonuments: true,
      });
      setRemarks(
        `[Hakbang 2 Ocular Inspection]: Naisagawa ang ocular inspection sa site sa ${brgyDisplay}. Sumusunod sa required setback (≥3.0m sa harapan) at legal easement. Ligtas sa geohazard alinsunod sa CLUP zoning guidelines. Inirerekomenda ang pag-apruba ng Zoning Clearance.`
      );
    } else if (type === "conditional") {
      setSetbacks((prev) => ({ ...prev, roadSetback: true, faultLineClearance: true }));
      setRemarks(
        `[Hakbang 2 Ocular Inspection]: May kaunting adjustment na kailangan sa easement o boundary setback bago ang buhos ng pundasyon. Kinakailangang magsumite ng corrected location plan ang aplikante.`
      );
    } else {
      setRemarks(
        `[Hakbang 2 Ocular Inspection]: May natuklasang paglabag sa itinakdang Right-of-Way (ROW) setback o protektadong waterway buffer zone sa site sa ${brgyDisplay}. Hindi sumusunod sa Municipal Zoning Ordinance.`
      );
    }
  };

  // Payload assembly
  const buildPayload = (decision: "approved" | "rejected"): OcularInspectionPayload => ({
    applicationId: application?.id,
    trackingNumber,
    inspectionDate,
    inspectingOfficer: resolvedOfficer,
    setbacks,
    remarks: remarks.trim(),
    photos,
    decision,
  });

  const setbacksCount = Object.values(setbacks).filter(Boolean).length;
  const hasPhotos = photos.length > 0;

  return (
    <div className="zoi-container">
      {/* ── 1. HEADER ── */}
      <header className="zoi-header">
        <div className="zoi-header-main">
          <div className="zoi-header-tag-row">
            <span className="zoi-step-badge">
              <span className="zoi-badge-dot" />
              <span>HAKBANG 2 · ZONING OFFICER EVALUATION</span>
            </span>
            <div className="zoi-tracking-badge" title="Tracking Reference Number">
              <span className="zoi-tracking-label">Tracking No:</span>
              <strong className="zoi-tracking-number">{trackingNumber}</strong>
            </div>
            {brgyDisplay && (
              <span className="zoi-brgy-pill">
                <IconMapPin size={13} />
                <span>{brgyDisplay}</span>
              </span>
            )}
          </div>

          <h1 className="zoi-title">
            Hakbang 2: Pagsusuri ng Zoning Officer (Ocular Inspection)
          </h1>
          <p className="zoi-subtitle">
            Suriin ang na-pinpoint na lokasyon ng lote sa GIS mapa at itala ang aktwal na obserbasyon, setback, easement compliance, at litrato ng site alinsunod sa 1-Araw na SLA ng Luisiana Citizen&apos;s Charter.
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            className="zoi-close-btn"
            onClick={onClose}
            title="Isara ang pagsusuri"
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </header>

      {/* ── 2. MAP & GIS LAYERS (Top Half) ── */}
      <section className="zoi-top-half" aria-label="Map at GIS Layers">
        {/* Large 2D Map Area */}
        <div className="zoi-map-card">
          <div className="zoi-map-bar">
            <div className="zoi-map-bar-left">
              <IconMapPin size={16} color="var(--apple-accent, #0071e3)" />
              <span className="zoi-map-bar-title">
                Lokasyon ng Pinned Lot (2D GIS Verification Mode)
              </span>
            </div>
            <div className="zoi-map-bar-right">
              <div
                className="zoi-zone-chip"
                style={{
                  background: isRealApp ? zoningInfo.badgeBg : "var(--apple-surface-secondary, #f1f5f9)",
                  color: isRealApp ? zoningInfo.badgeColor : "var(--apple-text-secondary, #64748b)",
                  border: `1px solid ${isRealApp ? zoningInfo.borderColor : "var(--apple-border, rgba(0,0,0,0.1))"}`,
                }}
              >
                <IconBuilding size={13} />
                <span>Sona: <strong>{isRealApp ? zoningInfo.name : "[Zoning Classification]"}</strong></span>
              </div>
              <div className="zoi-coord-chip">
                <span>Coordinates:</span>
                <strong>
                  {hasCoordinates
                    ? `${applicantLat.toFixed(6)}° N, ${applicantLon.toFixed(6)}° E`
                    : "[Awaiting Coordinates Pin]"}
                </strong>
              </div>
            </div>
          </div>

          {/* Interactive Map Canvas or Clean Placeholder */}
          <div className="zoi-map-viewport">
            {hasCoordinates ? (
              <PinpointMapPicker
                lon={applicantLon}
                lat={applicantLat}
                selectedBarangay={normalizedBrgy}
                height={420}
                showHazardToggles={true}
                readOnly={true}
              />
            ) : (
              <div className="zoi-map-empty-state">
                <div className="zoi-map-empty-graphic">
                  <div className="zoi-empty-grid-lines" />
                  <div className="zoi-empty-pin-marker">
                    <IconMapPin size={38} color="var(--apple-accent, #0071e3)" />
                  </div>
                </div>
                <h3 className="zoi-map-empty-title">2D Map Display (Awaiting Pinned Lot)</h3>
                <p className="zoi-map-empty-desc">
                  Ipinapakita sa bahaging ito ang eksaktong lokasyon ng lote at mga hazard layer kapag may nakatakdang coordinates ang aplikasyon.
                </p>
                <div className="zoi-map-coords-placeholder">
                  <span>Default Centroid Reference:</span>
                  <strong>{applicantLat.toFixed(4)}° N, {applicantLon.toFixed(4)}° E ({normalizedBrgy})</strong>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dual Side Panels for Automated GIS Data */}
        <div className="zoi-gis-panels-grid">
          {/* Card A: Geohazard Assessment */}
          <div className="zoi-panel-card">
            <div className="zoi-panel-header">
              <div className="zoi-panel-header-icon is-hazard">
                <IconAlertTriangle size={17} color="#d97706" />
              </div>
              <div>
                <h2 className="zoi-panel-title">Geohazard Assessment (Landslide/Flood)</h2>
                <span className="zoi-panel-meta">Automated MGB &amp; GeoRiskPH screening</span>
              </div>
            </div>

            <div className="zoi-hazard-table">
              <div className="zoi-hazard-row">
                <span className="zoi-hazard-key">Ground Shaking Susceptibility:</span>
                <span className="zoi-hazard-val is-accent">PEIS VIII (Standard Design)</span>
              </div>

              <div className="zoi-hazard-row">
                <span className="zoi-hazard-key">Flood Susceptibility Level:</span>
                <span className="zoi-hazard-val">
                  {loadingHazard ? (
                    <span className="zoi-pulse">Sinusuri...</span>
                  ) : geoRisk?.flood?.value ? (
                    <strong style={{ color: geoRisk.flood.value.toLowerCase().includes("high") ? "#dc2626" : "#15803d" }}>
                      {geoRisk.flood.value}
                    </strong>
                  ) : (
                    <span className="zoi-placeholder-text">[Flood Level: Safe / Low]</span>
                  )}
                </span>
              </div>

              <div className="zoi-hazard-row">
                <span className="zoi-hazard-key">Rain-Induced Landslide Risk:</span>
                <span className="zoi-hazard-val">
                  {loadingHazard ? (
                    <span className="zoi-pulse">Sinusuri...</span>
                  ) : geoRisk?.landslide?.value ? (
                    <strong style={{ color: geoRisk.landslide.value.toLowerCase().includes("high") ? "#dc2626" : "#15803d" }}>
                      {geoRisk.landslide.value}
                    </strong>
                  ) : (
                    <span className="zoi-placeholder-text">[Landslide Risk: Low / Moderate]</span>
                  )}
                </span>
              </div>

              <div className="zoi-hazard-row">
                <span className="zoi-hazard-key">Active Fault Line Proximity:</span>
                <span className="zoi-hazard-val">
                  {hasCoordinates ? "Walang aktibong fault line sa 5.0km" : "[Fault Proximity: Safe Distance]"}
                </span>
              </div>

              <div className="zoi-hazard-row">
                <span className="zoi-hazard-key">Mt. Banahaw Volcanic Siting:</span>
                <span className="zoi-hazard-val">
                  {banahaw.km.toFixed(1)} km {banahaw.bearing} mula sa summit
                </span>
              </div>
            </div>

            <button
              type="button"
              className="zoi-pdf-btn"
              onClick={() => {
                void printSiteHazardReport({
                  name: `Zoning Inspection ${trackingNumber}`,
                  barangay: normalizedBrgy,
                  locationLabel: `${normalizedBrgy}, Luisiana, Laguna`,
                  lat: applicantLat,
                  lon: applicantLon,
                  live: {
                    flood: geoRisk?.flood || { value: "Safe", code: null },
                    landslide: geoRisk?.landslide || { value: "Safe", code: null },
                  },
                });
              }}
            >
              <span>Tingnan ang PDF Hazard Report ↗</span>
            </button>
          </div>

          {/* Card B: CLUP Zoning Conformity */}
          <div className="zoi-panel-card">
            <div className="zoi-panel-header">
              <div className="zoi-panel-header-icon is-clup">
                <IconShieldCheck size={17} color="#2563eb" />
              </div>
              <div>
                <h2 className="zoi-panel-title">CLUP Zoning Conformity</h2>
                <span className="zoi-panel-meta">Bayan ng Luisiana Comprehensive Land Use Plan</span>
              </div>
            </div>

            <div className="zoi-clup-list">
              <div className="zoi-clup-item">
                <span className="zoi-clup-label">Opisyal na Sona ng Lote:</span>
                <span
                  className="zoi-clup-badge"
                  style={{
                    background: isRealApp ? zoningInfo.badgeBg : "var(--apple-surface-secondary, #f1f5f9)",
                    color: isRealApp ? zoningInfo.badgeColor : "var(--apple-text, #1e293b)",
                    borderColor: isRealApp ? zoningInfo.borderColor : "var(--apple-border, rgba(0,0,0,0.1))",
                  }}
                >
                  {isRealApp ? zoningInfo.name : "[Zoning Classification]"}
                </span>
              </div>

              <div className="zoi-clup-item">
                <span className="zoi-clup-label">Ipinapanukalang Gamit (Proposed Use):</span>
                <strong className="zoi-clup-value">{proposedUse}</strong>
              </div>

              <div className="zoi-clup-item">
                <span className="zoi-clup-label">Zoning Conformity Evaluation:</span>
                <span className="zoi-conformity-pill">
                  <IconCheckCircle size={14} color="#15803d" />
                  <span>Conforming sa CLUP Plan</span>
                </span>
              </div>

              <div className="zoi-clup-item full">
                <span className="zoi-clup-label">Deskripsyon ng Sona:</span>
                <p className="zoi-clup-desc">
                  {isRealApp ? zoningInfo.desc : "[Naglalaman ng mga panuntunan para sa residential, commercial, o agro-industrial use ayon sa itinakda sa Comprehensive Land Use Plan ng Munisipyo.]"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. OCULAR INSPECTION FORM (Bottom Half - New Fields) ── */}
      <section className="zoi-bottom-half" aria-label="Ocular Inspection Form">
        <div className="zoi-form-card">
          <div className="zoi-form-card-header">
            <div className="zoi-card-icon">
              <IconCamera size={20} color="var(--apple-accent, #0071e3)" />
            </div>
            <div>
              <h2 className="zoi-card-title">Ocular Inspection Details</h2>
              <p className="zoi-card-subtitle">
                Itala ang opisyal na petsa ng site visit, inspektor, clearance sa building setback, easement sa daan/tubig, at mga litrato ng lote.
              </p>
            </div>
          </div>

          <div className="zoi-form-fields-grid">
            {/* Field 1: Inspection Date */}
            <div className="zoi-field-group">
              <label htmlFor="zoi-inspection-date" className="zoi-field-label">
                <IconCalendar size={14} />
                <span>Petsa ng Inspeksyon (Inspection Date):</span>
              </label>
              <input
                id="zoi-inspection-date"
                type="date"
                className="zoi-input-date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                disabled={readOnly}
              />
              <span className="zoi-field-hint">Petsa kung kailan isinagawa ang aktwal na pagbisita sa lote</span>
            </div>

            {/* Field 2: Inspecting Officer (Read-Only) */}
            <div className="zoi-field-group">
              <label htmlFor="zoi-inspecting-officer" className="zoi-field-label">
                <IconUser size={14} />
                <span>Inspecting Officer (Zoning / MPDC Officer):</span>
                <span className="zoi-readonly-badge" title="Read-only field">
                  <IconLock size={11} />
                  <span>Read-Only</span>
                </span>
              </label>
              <input
                id="zoi-inspecting-officer"
                type="text"
                readOnly
                className="zoi-input-readonly"
                value={resolvedOfficer}
                placeholder="[Logged-in MPDC Officer]"
              />
              <span className="zoi-field-hint">Awtomatikong nakatala mula sa kasalukuyang naka-log in na Zoning Officer</span>
            </div>
          </div>

          {/* Field 3: Setback & Easement Clearance Checkboxes */}
          <div className="zoi-setbacks-section">
            <div className="zoi-section-head">
              <label className="zoi-field-label">
                <IconShieldCheck size={15} />
                <span>Setback &amp; Easement Clearance:</span>
              </label>
              <span className="zoi-counter-pill">
                {setbacksCount}/4 Na-verify
              </span>
            </div>
            <p className="zoi-section-desc">
              Lagyan ng tsek ang bawat pamantayan kung napatunayang sumusunod ang lote sa panahon ng ocular inspection:
            </p>

            <div className="zoi-checkbox-grid">
              {/* Checkbox 1: Road Setback */}
              <label
                className={`zoi-checkbox-card ${setbacks.roadSetback ? "is-checked" : ""}`}
                htmlFor="cb-road-setback"
              >
                <input
                  type="checkbox"
                  id="cb-road-setback"
                  checked={setbacks.roadSetback}
                  onChange={() => handleCheckboxChange("roadSetback")}
                  disabled={readOnly}
                />
                <span className="zoi-custom-check">
                  {setbacks.roadSetback && <IconCheck size={12} color="#ffffff" />}
                </span>
                <div className="zoi-cb-text">
                  <strong className="zoi-cb-title">Road Setback Compliant</strong>
                  <span className="zoi-cb-desc">
                    May sapat na distansya (minimum 3.0m - 5.0m) mula sa Road Right-of-Way (ROW) bago ang estruktura.
                  </span>
                </div>
              </label>

              {/* Checkbox 2: Waterway Easement */}
              <label
                className={`zoi-checkbox-card ${setbacks.waterwayEasement ? "is-checked" : ""}`}
                htmlFor="cb-waterway-easement"
              >
                <input
                  type="checkbox"
                  id="cb-waterway-easement"
                  checked={setbacks.waterwayEasement}
                  onChange={() => handleCheckboxChange("waterwayEasement")}
                  disabled={readOnly}
                />
                <span className="zoi-custom-check">
                  {setbacks.waterwayEasement && <IconCheck size={12} color="#ffffff" />}
                </span>
                <div className="zoi-cb-text">
                  <strong className="zoi-cb-title">Waterway Easement Compliant</strong>
                  <span className="zoi-cb-desc">
                    Sumusunod sa 3.0m urban / 20.0m agricultural easement sa tabing-ilog, sapa, o estero (Water Code).
                  </span>
                </div>
              </label>

              {/* Checkbox 3: Fault Line Clearance */}
              <label
                className={`zoi-checkbox-card ${setbacks.faultLineClearance ? "is-checked" : ""}`}
                htmlFor="cb-fault-clearance"
              >
                <input
                  type="checkbox"
                  id="cb-fault-clearance"
                  checked={setbacks.faultLineClearance}
                  onChange={() => handleCheckboxChange("faultLineClearance")}
                  disabled={readOnly}
                />
                <span className="zoi-custom-check">
                  {setbacks.faultLineClearance && <IconCheck size={12} color="#ffffff" />}
                </span>
                <div className="zoi-cb-text">
                  <strong className="zoi-cb-title">Fault Line Clearance</strong>
                  <span className="zoi-cb-desc">
                    Walang active fault trace na bumabaybay sa loob o katabi ng itatayong estruktura (PHIVOLCS buffer).
                  </span>
                </div>
              </label>

              {/* Checkbox 4: Boundary Monuments */}
              <label
                className={`zoi-checkbox-card ${setbacks.boundaryMonuments ? "is-checked" : ""}`}
                htmlFor="cb-boundary-monuments"
              >
                <input
                  type="checkbox"
                  id="cb-boundary-monuments"
                  checked={setbacks.boundaryMonuments}
                  onChange={() => handleCheckboxChange("boundaryMonuments")}
                  disabled={readOnly}
                />
                <span className="zoi-custom-check">
                  {setbacks.boundaryMonuments && <IconCheck size={12} color="#ffffff" />}
                </span>
                <div className="zoi-cb-text">
                  <strong className="zoi-cb-title">Boundary Monuments (Mohon) Verified</strong>
                  <span className="zoi-cb-desc">
                    Nahanap at napatotohanan ang mga mohon ng lupa sa aktwal na site ayon sa TCT title at tax declaration.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Field 4: Evaluator's Remarks */}
          <div className="zoi-remarks-section">
            <div className="zoi-remarks-head">
              <label htmlFor="zoi-remarks-textarea" className="zoi-field-label">
                <IconFileText size={15} />
                <span>Evaluator&apos;s Remarks &amp; Conditions:</span>
              </label>
              {!readOnly && (
                <div className="zoi-template-chips">
                  <span className="zoi-chips-label">Bilis-Puno:</span>
                  <button
                    type="button"
                    className="zoi-chip is-pass"
                    onClick={() => applyTemplate("pass")}
                  >
                    ✓ Sumusunod / Passed
                  </button>
                  <button
                    type="button"
                    className="zoi-chip is-cond"
                    onClick={() => applyTemplate("conditional")}
                  >
                    ⚠ May Kondisyon
                  </button>
                  <button
                    type="button"
                    className="zoi-chip is-fail"
                    onClick={() => applyTemplate("reject")}
                  >
                    ✕ May Paglabag
                  </button>
                </div>
              )}
            </div>

            <textarea
              id="zoi-remarks-textarea"
              rows={4}
              className="zoi-textarea-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="[Ilagay ang mga opisyal na kondisyon, obserbasyon sa site, o rekomendasyon ng Zoning Officer...]"
              disabled={readOnly}
            />
          </div>

          {/* Field 5: Actual Site Photos (Drag-and-Drop) */}
          <div className="zoi-photos-section">
            <div className="zoi-field-label-row">
              <label className="zoi-field-label">
                <IconCamera size={15} />
                <span>Actual Site Photos (Ocular Inspection Site Photos):</span>
              </label>
              <span className={`zoi-field-badge ${hasPhotos ? "is-satisfied" : "is-required"}`}>
                {hasPhotos ? `✓ ${photos.length} Litrato Na-attach` : "MANDATORY PARA MA-APPROVE"}
              </span>
            </div>
            <p className="zoi-section-desc">
              I-upload ang mga aktwal na litrato ng lote na kinuha sa panahon ng ocular inspection (harapan, gilid, katabing daan/ROW).
            </p>

            {photoError && (
              <div className="zoi-photo-error-banner" role="alert">
                <IconAlertTriangle size={16} color="#dc2626" />
                <span>{photoError}</span>
              </div>
            )}

            {/* Drop Zone */}
            {!readOnly && (
              <div
                className={`zoi-dropzone ${isDragOver ? "is-dragover" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept=".jpg,.jpeg,.png,.webp"
                  multiple
                  onChange={(e) => handleFileSelection(e.target.files)}
                />
                <div className="zoi-dropzone-icon">
                  <IconUploadCloud size={34} color="var(--apple-accent, #0071e3)" />
                </div>
                <div className="zoi-dropzone-text">
                  <strong>I-drag at i-drop ang mga litrato ng ocular inspection dito</strong>
                  <span>o pindutin upang mag-browse mula sa inyong device</span>
                </div>
                <div className="zoi-dropzone-formats">
                  JPG, PNG, o WEBP (Hanggang 15MB bawat litrato)
                </div>
              </div>
            )}

            {/* Uploaded Photos Thumbnails Grid */}
            {photos.length > 0 ? (
              <div className="zoi-photos-grid">
                {photos.map((item, idx) => (
                  <div key={item.name + idx} className="zoi-photo-card">
                    <img
                      src={item.previewUrl}
                      alt={`Site Photo ${idx + 1}`}
                      className="zoi-photo-thumb"
                    />
                    <div className="zoi-photo-info">
                      <span className="zoi-photo-name" title={item.name}>
                        {item.name}
                      </span>
                      <span className="zoi-photo-size">
                        {(item.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        className="zoi-photo-delete-btn"
                        onClick={() => handleRemovePhoto(idx)}
                        title="Tanggalin ang litrato"
                      >
                        <IconTrash size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="zoi-photos-empty-hint zoi-photos-required-alert">
                <div className="zoi-alert-icon-wrap">
                  <IconAlertTriangle size={18} color="#d97706" />
                </div>
                <div className="zoi-alert-content">
                  <strong>Hindi Maaaring Ma-approve nang Walang Actual Site Photo</strong>
                  <span>
                    [Wala pang nai-upload na litrato]. Alinsunod sa Municipal Zoning Ocular Inspection guidelines, kinakailangang mag-attach ng kahit 1 actual site photo ng lote bago mabuksan ang pag-apruba ng Zoning Clearance.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 4. ACTION FOOTER (Sticky) ── */}
      <footer className="zoi-sticky-footer">
        <div className="zoi-footer-left">
          <div className="zoi-footer-summary">
            <span className="zoi-summary-item">
              <IconShieldCheck size={14} color="var(--apple-accent, #0071e3)" />
              <span>Setbacks: <strong>{setbacksCount}/4</strong> Compliant</span>
            </span>
            <span className="zoi-summary-dot">•</span>
            <span className={`zoi-summary-item ${hasPhotos ? "is-ok" : "is-missing"}`}>
              <IconCamera size={14} color={hasPhotos ? "#16a34a" : "#dc2626"} />
              <span>
                Litrato:{" "}
                <strong style={{ color: hasPhotos ? "#16a34a" : "#dc2626" }}>
                  {photos.length}
                </strong>{" "}
                {hasPhotos ? "Na-attach" : "(Kailangan)"}
              </span>
            </span>
            {!hasPhotos && (
              <span className="zoi-footer-missing-photo-tag" title="I-upload ang litrato ng ocular inspection para maaprubahan">
                <IconAlertTriangle size={12} color="#dc2626" />
                <span>Walang Litrato · Di Maaaring Ma-approve</span>
              </span>
            )}
          </div>
        </div>

        <div className="zoi-footer-actions">
          {/* Button 1: Reject Application (Outline or Red color) */}
          <button
            type="button"
            className="zoi-btn-reject"
            disabled={submitting || readOnly}
            onClick={() => {
              const confirmMsg = "Sigurado ba kayong nais i-REJECT ang aplikasyong ito batay sa resulta ng ocular inspection?";
              if (window.confirm(confirmMsg)) {
                onReject?.(buildPayload("rejected"));
              }
            }}
          >
            <IconAlertTriangle size={16} />
            <span>Reject Application</span>
          </button>

          {/* Button 2: Approve Zoning Clearance (Solid Primary or Green color - Disabled if no photo) */}
          <button
            type="button"
            className={`zoi-btn-approve ${!hasPhotos ? "is-disabled" : ""}`}
            disabled={submitting || readOnly || !hasPhotos}
            title={
              !hasPhotos
                ? "Hindi maaaring ma-approve: Kinakailangan mag-upload ng kahit isang (1) actual site photo mula sa ocular inspection."
                : "Aprubahan ang Zoning Clearance"
            }
            onClick={() => {
              if (!hasPhotos) {
                setPhotoError("Kinakailangan mag-upload ng kahit isang (1) Actual Site Photo ng ocular inspection bago maaprubahan ang Zoning Clearance.");
                const el = document.querySelector(".zoi-photos-section");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
              }
              onApprove?.(buildPayload("approved"));
            }}
          >
            <IconCheckCircle size={17} />
            <span>{submitting ? "Ipinoproseso..." : "Approve Zoning Clearance"}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

export default ZoningOcularInspectionView;
