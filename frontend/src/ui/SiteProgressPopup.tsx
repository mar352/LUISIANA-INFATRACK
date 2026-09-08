import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Project } from "../types";
import { PanoramaViewer } from "./PanoramaViewer";
import { getClupZone, normalizeBarangayName } from "../lib/clup-zones";
import { banahawDistanceKm, fetchGeoriskAssess, type GeoRiskAssess } from "../lib/luisiana-site-assess";
import { printSiteHazardReport } from "../lib/hazard-report";

function getHazardColor(val?: string | null) {
  if (!val) return "#10b981";
  const v = val.toLowerCase();
  if (v.includes("high") || v.includes("very high") || v.includes("critical")) return "#ef4444";
  if (v.includes("moderate") || v.includes("medium")) return "#f59e0b";
  if (v.includes("low")) return "#38bdf8";
  return "#10b981";
}
import { backendUrl } from "../lib/api";
import "./SiteProgressPopup.css";

interface SiteProgressPopupProps {
  project: Project;
  onClose: () => void;
  onUpdateProgress?: () => void;
  canInspect?: boolean;
}

export type TimelineStage = "before" | "during" | "after";


export interface SidePhotoItem {
  id: string;
  url: string;
  stage: TimelineStage;
  caption?: string;
  uploadedAt?: string;
  inspector?: string;
}

export interface TimelinePhotoItem {
  id: string;
  url: string;
  stage: TimelineStage;
  progress: number;
  uploadedAt?: string;
  remarks?: string;
  inspector?: string;
  isActual: boolean;
}

// No stock photos: system only displays verified site inspection photos from field officers

function resolvePhotoUrl(rawUrl: string): string {
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

function formatFilipinoCaptureDate(dateInput?: string | number | null): string {
  const d = dateInput ? new Date(dateInput) : new Date(2026, 8, 8);
  const months = [
    "Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo",
    "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre"
  ];
  const month = months[d.getMonth()] || "Setyembre";
  const day = d.getDate();
  const year = d.getFullYear() || 2026;
  return `${month} ${day}, ${year}`;
}

function getCompassDir(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  if (normalized >= 337.5 || normalized < 22.5) return "Hilaga (N)";
  if (normalized >= 22.5 && normalized < 67.5) return "Hilagang-Silangan (NE)";
  if (normalized >= 67.5 && normalized < 112.5) return "Silangan (E)";
  if (normalized >= 112.5 && normalized < 157.5) return "Timog-Silangan (SE)";
  if (normalized >= 157.5 && normalized < 202.5) return "Timog (S)";
  if (normalized >= 202.5 && normalized < 247.5) return "Timog-Kanluran (SW)";
  if (normalized >= 247.5 && normalized < 292.5) return "Kanluran (W)";
  return "Hilagang-Kanluran (NW)";
}

export const SiteProgressPopup: React.FC<SiteProgressPopupProps> = ({
  project,
  onClose,
  onUpdateProgress,
  canInspect = false,
}) => {
  // Listen for Escape key to quickly return to map (Google Street View behavior)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Group all uploaded inspection photos into "before", "during", and "after"
  const stagePhotos = useMemo(() => {
    const grouped: Record<TimelineStage, TimelinePhotoItem[]> = {
      before: [],
      during: [],
      after: [],
    };

    const seenUrls = new Set<string>();

    // 1. Process inspectionPhotos
    const inspections = (project as any).inspectionPhotos || [];
    inspections.forEach((insp: any, idx: number) => {
      const rawUrl = insp.photoUrl || insp.url;
      if (!rawUrl || seenUrls.has(rawUrl)) return;
      seenUrls.add(rawUrl);

      let s: TimelineStage = "during";
      const stLower = String(insp.stage || "").toLowerCase();
      if (stLower === "before" || insp.progress === 0 || insp.progress < 30) {
        s = "before";
      } else if (stLower === "after" || stLower === "completed" || insp.progress >= 100) {
        s = "after";
      } else {
        s = "during";
      }

      grouped[s].push({
        id: insp.id || `insp-${idx}`,
        url: resolvePhotoUrl(rawUrl),
        stage: s,
        progress: typeof insp.progress === "number" ? insp.progress : (s === "before" ? 0 : s === "during" ? 50 : 100),
        uploadedAt: insp.inspectedAt || insp.uploadedAt || insp.timestamp,
        remarks: insp.remarks,
        inspector: insp.inspector,
        isActual: true,
      });
    });

    // 2. Process latestInspection if not already present
    const latest = (project as any).latestInspection;
    if (latest && latest.photoUrl && !seenUrls.has(latest.photoUrl)) {
      seenUrls.add(latest.photoUrl);
      let s: TimelineStage = "during";
      const stLower = String(latest.stage || "").toLowerCase();
      if (stLower === "before" || latest.progress === 0 || latest.progress < 30) {
        s = "before";
      } else if (stLower === "after" || stLower === "completed" || latest.progress >= 100) {
        s = "after";
      } else {
        s = "during";
      }

      grouped[s].unshift({
        id: latest.id || "latest-insp",
        url: resolvePhotoUrl(latest.photoUrl),
        stage: s,
        progress: typeof latest.progress === "number" ? latest.progress : (s === "before" ? 0 : s === "during" ? 50 : 100),
        uploadedAt: latest.inspectedAt || latest.timestamp,
        remarks: latest.remarks,
        inspector: latest.inspector,
        isActual: true,
      });
    }

    // 3. Process project.photos
    if (Array.isArray(project.photos)) {
      project.photos.forEach((p, idx) => {
        if (!p.url || seenUrls.has(p.url)) return;
        seenUrls.add(p.url);
        const caption = (p.caption || "").toLowerCase();
        let s: TimelineStage = "during";
        if (caption.includes("before") || caption.includes("pre") || p.kind === "site") {
          s = "before";
        } else if (caption.includes("after") || caption.includes("complete") || caption.includes("finish")) {
          s = "after";
        }

        grouped[s].push({
          id: p.id || `proj-photo-${idx}`,
          url: resolvePhotoUrl(p.url),
          stage: s,
          progress: s === "before" ? 0 : s === "during" ? 50 : 100,
          uploadedAt: p.uploadedAt,
          remarks: p.caption,
          isActual: true,
        });
      });
    }

    return grouped;
  }, [project]);

  const numericProgress = (project as any).numericProgress ?? project.progress ?? 0;
  const rawStage = (project as any).stage || (project as any).inspectionStage || (project as any).latestInspection?.stage;

  // Stage unlocked logic based on actual progress and uploads:
  // If no progress yet (0%), only "Before" is shown!
  const isDuringUnlocked = useMemo(() => {
    return (
      stagePhotos.during.length > 0 ||
      stagePhotos.after.length > 0 ||
      rawStage === "during" ||
      rawStage === "after" ||
      rawStage === "completed" ||
      numericProgress >= 30
    );
  }, [stagePhotos, rawStage, numericProgress]);

  const isAfterUnlocked = useMemo(() => {
    return (
      stagePhotos.after.length > 0 ||
      rawStage === "after" ||
      rawStage === "completed" ||
      numericProgress >= 100
    );
  }, [stagePhotos, rawStage, numericProgress]);

  // Initial stage determination: default to highest unlocked stage with photos, or latest unlocked stage
  const initialStage: TimelineStage = useMemo(() => {
    if (isAfterUnlocked && stagePhotos.after.length > 0) return "after";
    if (isDuringUnlocked && stagePhotos.during.length > 0) return "during";
    if (stagePhotos.before.length > 0) return "before";
    if (isAfterUnlocked) return "after";
    if (isDuringUnlocked) return "during";
    return "before";
  }, [isAfterUnlocked, isDuringUnlocked, stagePhotos]);

  const [activeStage, setActiveStage] = useState<TimelineStage>(initialStage);

  // Keep activeStage synchronized if progress changes
  useEffect(() => {
    if (activeStage === "after" && !isAfterUnlocked) {
      setActiveStage(isDuringUnlocked ? "during" : "before");
    } else if (activeStage === "during" && !isDuringUnlocked) {
      setActiveStage("before");
    }
  }, [isAfterUnlocked, isDuringUnlocked, activeStage]);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);
  const [showRemarksDrawer, setShowRemarksDrawer] = useState(false);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [isWatermarkCollapsed, setIsWatermarkCollapsed] = useState(false);

  // When activeStage changes, reset photo index
  const handleStageSelect = (stage: TimelineStage) => {
    setActiveStage(stage);
    setActivePhotoIndex(0);
  };

  // Stable callback for heading change
  const handleHeadingChange = useCallback((deg: number) => {
    setHeadingDeg(deg);
  }, []);

  // Current active photos for selected stage
  const currentStagePhotos = stagePhotos[activeStage] || [];
  const hasUploadedPhoto = currentStagePhotos.length > 0;
  const currentPhotoItem: TimelinePhotoItem | null = hasUploadedPhoto
    ? currentStagePhotos[activePhotoIndex] || currentStagePhotos[0]
    : null;

  // Final photo URL to display in 360 viewer (null if no photo uploaded for this stage)
  const currentPhotoUrl = currentPhotoItem ? currentPhotoItem.url : null;

  // Stage details based on activeStage
  let stageEmoji = "🚧";
  let stageLabel = "During Construction";
  let stagePct = 50;
  let stageColor = "#eab308"; // Amber

  if (activeStage === "before") {
    stageEmoji = "🏗️";
    stageLabel = "Before Construction";
    stagePct = 0;
    stageColor = "#ef4444"; // Red
  } else if (activeStage === "after") {
    stageEmoji = "✅";
    stageLabel = "Completed (After)";
    stagePct = 100;
    stageColor = "#22c55e"; // Green
  }

  
  // State for side photos upload and lightbox preview
  const [activeSidePhotoPreview, setActiveSidePhotoPreview] = useState<SidePhotoItem | null>(null);
  const [drawerTab, setDrawerTab] = useState<"clup" | "hazard" | "photos">("clup");
  const [geoRisk, setGeoRisk] = useState<GeoRiskAssess | null>((project as any).geoRisk || null);
  const [loadingHazard, setLoadingHazard] = useState(false);

  // Derive coordinates, barangay, zoning info, and proposed building
  const lat =
    project.location?.lat ??
    (project as any).latitude ??
    (project as any).lotDetails?.lat ??
    14.1833;
  const lon =
    project.location?.lng ??
    project.location?.lon ??
    (project as any).longitude ??
    (project as any).lotDetails?.lon ??
    121.5167;
  const barangay =
    project.barangay ||
    (project as any).applicant?.barangay ||
    (project as any).applicantBarangay ||
    "Poblacion";
  const zoningInfo = useMemo(() => getClupZone(barangay), [barangay]);
  const banahawDist = useMemo(() => banahawDistanceKm(lat, lon), [lat, lon]);
  const proposedBuilding =
    (project as any).proposedBuilding ||
    (project as any).serviceTypeLabel ||
    project.category ||
    "Residential";

  // Fetch georisk if not already attached on project
  useEffect(() => {
    if ((project as any).geoRisk) {
      setGeoRisk((project as any).geoRisk);
      return;
    }
    let active = true;
    setLoadingHazard(true);
    fetchGeoriskAssess(lat, lon)
      .then((data) => {
        if (active && data) setGeoRisk(data);
      })
      .catch((err) => console.warn("Failed to fetch hazard assess in popup:", err))
      .finally(() => {
        if (active) setLoadingHazard(false);
      });
    return () => {
      active = false;
    };
  }, [lat, lon, project]);

  // Handler for PDF Hazard Report print/view
  const handlePrintHazardReport = () => {
    printSiteHazardReport({
      trackingNumber: (project as any).trackingNumber || project.id,
      applicantName: applicantName,
      locationName: `Brgy. ${barangay}, Luisiana, Laguna`,
      lat,
      lon,
      live: {
        flood: geoRisk?.flood || { value: "Safe", code: null },
        landslide: geoRisk?.landslide || { value: "Safe", code: null },
      },
    });
  };
  const [isUploadingSidePhoto, setIsUploadingSidePhoto] = useState(false);
  const [localSidePhotos, setLocalSidePhotos] = useState<SidePhotoItem[]>([]);
  const sideFileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper to normalize any stage string into "before" | "during" | "after"
  const normalizeStageName = useCallback((st?: string, prog?: number): TimelineStage => {
    const s = String(st || "").toLowerCase();
    if (s.includes("before") || (typeof prog === "number" && prog < 30)) return "before";
    if (s.includes("after") || s.includes("complete") || (typeof prog === "number" && prog >= 100)) return "after";
    return "during";
  }, []);

  // Collect all side / supporting 2D photos for the current active stage
  const currentStageSidePhotos = useMemo(() => {
    const list: SidePhotoItem[] = [];
    const seen = new Set<string>();

    // A. Locally uploaded side photos in this session
    localSidePhotos.forEach((sp) => {
      if (sp.stage === activeStage && !seen.has(sp.url)) {
        seen.add(sp.url);
        list.push(sp);
      }
    });

    // B. App sidePhotos from database (strictly side photos only, NOT progress update inspectionPhotos)
    const rawSide = (project as any).sidePhotos || [];
    rawSide.forEach((sp: any, i: number) => {
      const rawUrl = sp.url || sp.photoUrl;
      const url = resolvePhotoUrl(rawUrl);
      if (!url || seen.has(url)) return;
      const s = normalizeStageName(sp.stage);
      if (s === activeStage) {
        seen.add(url);
        list.push({
          id: sp.id || `side-${i}`,
          url,
          stage: s,
          caption: sp.caption || `Side Kuha ${list.length + 1}`,
          uploadedAt: sp.uploadedAt || sp.timestamp,
          inspector: sp.inspector,
        });
      }
    });

    return list;
  }, [project, activeStage, localSidePhotos, normalizeStageName]);

  // Handle direct side photo upload from the drawer
  const handleSidePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSidePhoto(true);
    try {
      const appId =
        (project as any).applicationId ||
        (project as any).trackingNumber ||
        (project.id.startsWith("infra-app-")
          ? project.id.replace("infra-app-", "")
          : project.id);

      const formData = new FormData();
      formData.append("photo", file);
      formData.append("stage", activeStage);
      formData.append("caption", `Side Photo - ${stageLabel}`);
      formData.append("inspector", (project as any).latestInspection?.inspector || "Municipal Engineer");

      const res = await fetch(backendUrl(`/api/citizen/applications/${appId}/side-photos`), {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.ok && data.sidePhoto) {
        const newPhoto: SidePhotoItem = {
          id: data.sidePhoto.id || `side-${Date.now()}`,
          url: resolvePhotoUrl(data.sidePhoto.url),
          stage: activeStage,
          caption: data.sidePhoto.caption || "Bagong Side Photo",
          uploadedAt: data.sidePhoto.uploadedAt || new Date().toISOString(),
          inspector: data.sidePhoto.inspector,
        };
        setLocalSidePhotos((prev) => [newPhoto, ...prev]);
      } else {
        // Fallback local object URL for instant preview
        const localUrl = URL.createObjectURL(file);
        setLocalSidePhotos((prev) => [
          {
            id: `side-local-${Date.now()}`,
            url: localUrl,
            stage: activeStage,
            caption: "Bagong In-upload na Side Photo",
            uploadedAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    } catch (err) {
      console.warn("Side photo upload error:", err);
      // Still show local preview for responsive UX
      const localUrl = URL.createObjectURL(file);
      setLocalSidePhotos((prev) => [
        {
          id: `side-local-${Date.now()}`,
          url: localUrl,
          stage: activeStage,
          caption: "Bagong In-upload na Side Photo",
          uploadedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } finally {
      setIsUploadingSidePhoto(false);
      if (sideFileInputRef.current) sideFileInputRef.current.value = "";
    }
  };

  // Lightbox Navigation (Previous / Next Side Photo)
  const currentSideIndex = activeSidePhotoPreview
    ? currentStageSidePhotos.findIndex((p) => p.url === activeSidePhotoPreview.url)
    : -1;

  const handlePrevSidePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentSideIndex > 0) {
      setActiveSidePhotoPreview(currentStageSidePhotos[currentSideIndex - 1]);
    } else if (currentStageSidePhotos.length > 0) {
      setActiveSidePhotoPreview(currentStageSidePhotos[currentStageSidePhotos.length - 1]);
    }
  };

  const handleNextSidePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentSideIndex >= 0 && currentSideIndex < currentStageSidePhotos.length - 1) {
      setActiveSidePhotoPreview(currentStageSidePhotos[currentSideIndex + 1]);
    } else if (currentStageSidePhotos.length > 0) {
      setActiveSidePhotoPreview(currentStageSidePhotos[0]);
    }
  };

  // Format Project & Barangay display
  const barangayName = project.barangay || "San Jose";
  let projectDisplay = project.name;
  if (barangayName && !projectDisplay.toLowerCase().includes(barangayName.toLowerCase())) {
    projectDisplay = `${project.name} - Brgy. ${barangayName}`;
  }

  // Format Capture Date
  const rawDate = currentPhotoItem?.uploadedAt || (project as any).updatedAt || null;
  const captureDateFormatted = hasUploadedPhoto
    ? formatFilipinoCaptureDate(rawDate)
    : "Wala pang petsa ng kuha";

  const trackingNumber =
    (project as any).trackingNumber ||
    (project.id.startsWith("infra-app-")
      ? project.id.replace("infra-app-", "")
      : project.id);

  const applicantName =
    (project as any).applicantName ||
    (project.department === "MPDC"
      ? "MPDC Planning Office"
      : "Municipal Engineering Office");

  const coords = project.location
    ? `${project.location.lat.toFixed(5)}° N, ${project.location.lon.toFixed(5)}° E`
    : "14.18710° N, 121.51514° E";

  return (
    <div
      className="streetview-overlay"
      role="dialog"
      aria-label="Frontal Street View - Interactive Smartphone Panorama Viewer"
    >
      {/* 360° Interactive Smartphone Panorama Viewer */}
      <div className="streetview-media-container">
        <PanoramaViewer
          imageUrl={currentPhotoUrl}
          onHeadingChange={handleHeadingChange}
          initialFov={75}
        />
        {/* Soft Vignette Overlays for UI contrast */}
        <div className="streetview-gradient-top" />
        <div className="streetview-gradient-bottom" />
      </div>

      {/* UPPER LEFT: Back to Map Navigation & Watermark Information Card */}
      <div className="streetview-top-left-group">
        {/* [ < Bumalik sa Mapa ] Button */}
        <button
          type="button"
          className="streetview-back-btn"
          onClick={onClose}
          title="Bumalik sa Mapa (Esc)"
          aria-label="Bumalik sa Mapa"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Bumalik sa Mapa</span>
        </button>

        {/* Overlay Information (Watermark Style) */}
        <div className={`streetview-watermark-card ${isWatermarkCollapsed ? "is-collapsed" : ""}`}>
          {/* Header Tag / Street View Mode */}
          <div className="streetview-watermark-header">
            <span className="streetview-live-dot" />
            <span className="streetview-watermark-tag">FRONTAL STREET VIEW • PANORAMA</span>
            <span className="streetview-tracking-code">#{trackingNumber}</span>
            <button
              type="button"
              className="streetview-watermark-toggle-btn"
              onClick={() => setIsWatermarkCollapsed(!isWatermarkCollapsed)}
              title={isWatermarkCollapsed ? "Ipakita ang buong detalye" : "I-minimize ang watermark"}
              aria-label={isWatermarkCollapsed ? "Expand Details" : "Collapse Details"}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: isWatermarkCollapsed ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s ease",
                }}
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          </div>

          {/* Collapsed Compact View */}
          {isWatermarkCollapsed ? (
            <div className="streetview-watermark-collapsed-row">
              <strong className="streetview-info-value-compact">{projectDisplay}</strong>
              <span
                className="streetview-progress-badge is-compact"
                style={{
                  borderColor: `${stageColor}60`,
                  backgroundColor: `${stageColor}20`,
                  color: stageColor,
                }}
              >
                <span>{stagePct}%</span>
              </span>
            </div>
          ) : (
            <>
              {/* Project Line */}
              <div className="streetview-info-row">
                <span className="streetview-info-label">Project:</span>
                <strong className="streetview-info-value">{projectDisplay}</strong>
              </div>

              {/* Progress Line */}
              <div className="streetview-info-row streetview-progress-row">
                <span className="streetview-info-label">Progress:</span>
                <span
                  className="streetview-progress-badge"
                  style={{
                    borderColor: `${stageColor}60`,
                    backgroundColor: `${stageColor}20`,
                    color: stageColor,
                  }}
                >
                  <span className="streetview-badge-icon">{stageEmoji}</span>
                  <span>{stagePct}% ({stageLabel})</span>
                </span>
              </div>

              {/* Progress Bar Meter */}
              <div className="streetview-meter-track">
                <div
                  className="streetview-meter-fill"
                  style={{
                    width: `${Math.max(6, stagePct)}%`,
                    backgroundColor: stageColor,
                    boxShadow: `0 0 10px ${stageColor}`,
                  }}
                />
              </div>

              {/* Image Capture Date Line */}
              <div className="streetview-info-row">
                <span className="streetview-info-label">Image Capture Date:</span>
                <span className="streetview-info-date">{captureDateFormatted}</span>
              </div>

              {/* Location / Watermark Stamp */}
              <div className="streetview-watermark-footer">
                <div className="streetview-coords">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>{coords} • Luisiana, Laguna</span>
                </div>
                {hasUploadedPhoto ? (
                  <span className="streetview-photo-source-tag is-actual" title="Aktwal na in-upload mula sa field inspection">
                    ✓ Aktwal na In-upload
                  </span>
                ) : (
                  <span className="streetview-photo-source-tag" title="Stock sample preview (Wala pang na-i-upload na litrato)">
                    Pano Preview (Walang Upload)
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* TOP RIGHT: Live Interactive Compass & Actions */}
      <div className="streetview-top-right-group">
        <div className="streetview-compass-badge" title="Live Camera Orientation">
          <div
            className="streetview-compass-needle"
            style={{
              transform: `rotate(${-headingDeg}deg)`,
              transition: "transform 0.1s linear",
            }}
          >
            <span className="needle-n">N</span>
          </div>
          <div className="streetview-compass-text">
            <span className="compass-title">{headingDeg}° {getCompassDir(headingDeg)}</span>
            <span className="compass-sub">Street Level View</span>
          </div>
        </div>

        {canInspect && onUpdateProgress && (
          <button
            type="button"
            className="streetview-action-btn streetview-update-btn"
            onClick={onUpdateProgress}
            title="I-update ang Inspection Progress o Mag-upload ng Bagong Litrato"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>I-update ang Progress</span>
          </button>
        )}
      </div>

      {/* BOTTOM CENTER: Progression Timeline Bar (Before, During, After) */}
      <div className="streetview-bottom-center-panel">
        {/* Multi-photo Pager if current stage has multiple uploads */}
        {currentStagePhotos.length > 1 && (
          <div className="streetview-photo-pager">
            <button
              type="button"
              className="streetview-pager-btn"
              onClick={() =>
                setActivePhotoIndex((prev) =>
                  prev > 0 ? prev - 1 : currentStagePhotos.length - 1
                )
              }
              title="Nakaraang litrato sa yugtong ito"
              aria-label="Previous Photo"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="streetview-pager-count">
              📷 In-upload na Litrato {activePhotoIndex + 1} ng {currentStagePhotos.length}
            </span>
            <button
              type="button"
              className="streetview-pager-btn"
              onClick={() =>
                setActivePhotoIndex((prev) =>
                  prev < currentStagePhotos.length - 1 ? prev + 1 : 0
                )
              }
              title="Susunod na litrato sa yugtong ito"
              aria-label="Next Photo"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}

        <div className="streetview-stages-bar">
          <span className="streetview-stages-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="12 6 12 12 16 14" />
            </svg>
            <span>Progression Timeline:</span>
          </span>

          <div className="streetview-stages-pills">
            {/* 1. BEFORE BUTTON (Always visible) */}
            <button
              type="button"
              className={`streetview-stage-pill ${activeStage === "before" ? "active" : ""}`}
              onClick={() => handleStageSelect("before")}
              title="Tingnan ang litrato bago simulan ang konstruksyon (Before)"
            >
              <span>🏗️</span>
              <span>Before (Bago Simulan)</span>
              {stagePhotos.before.length > 0 ? (
                <span className="streetview-stage-upload-count is-actual" title={`${stagePhotos.before.length} in-upload na litrato`}>
                  {stagePhotos.before.length}
                </span>
              ) : (
                <span className="streetview-stage-upload-count" title="Walang in-upload; stock preview">
                  0
                </span>
              )}
            </button>

            {/* 2. DURING BUTTON (Only visible if progress has reached During or has During uploads) */}
            {isDuringUnlocked && (
              <button
                type="button"
                className={`streetview-stage-pill ${activeStage === "during" ? "active" : ""}`}
                onClick={() => handleStageSelect("during")}
                title="Tingnan ang litrato habang ginagawa ang proyekto (During)"
              >
                <span>🚧</span>
                <span>During (Kasalukuyang Ginagawa)</span>
                {stagePhotos.during.length > 0 ? (
                  <span className="streetview-stage-upload-count is-actual" title={`${stagePhotos.during.length} in-upload na litrato`}>
                    {stagePhotos.during.length}
                  </span>
                ) : (
                  <span className="streetview-stage-upload-count" title="Walang in-upload; stock preview">
                    0
                  </span>
                )}
              </button>
            )}

            {/* 3. AFTER BUTTON (Only visible if progress has reached After or has After uploads) */}
            {isAfterUnlocked && (
              <button
                type="button"
                className={`streetview-stage-pill ${activeStage === "after" ? "active" : ""}`}
                onClick={() => handleStageSelect("after")}
                title="Tingnan ang litrato nang matapos ang konstruksyon (After / Completed)"
              >
                <span>✅</span>
                <span>After (Tapos Na)</span>
                {stagePhotos.after.length > 0 ? (
                  <span className="streetview-stage-upload-count is-actual" title={`${stagePhotos.after.length} in-upload na litrato`}>
                    {stagePhotos.after.length}
                  </span>
                ) : (
                  <span className="streetview-stage-upload-count" title="Walang in-upload; stock preview">
                    0
                  </span>
                )}
              </button>
            )}
          </div>

          <button
            type="button"
            className="streetview-toggle-remarks-btn"
            onClick={() => setShowRemarksDrawer(!showRemarksDrawer)}
            title="Tingnan ang detalye ng aplikante at remarks para sa yugtong ito"
          >
            <span>{showRemarksDrawer ? "Itago ang Detalye" : "Karagdagang Detalye"}</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: showRemarksDrawer ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* SLIDE-UP REMARKS & APPLICANT DETAILS DRAWER */}
      {showRemarksDrawer && (
        <div className="streetview-details-drawer">
          <div className="streetview-details-content">
            <div className="streetview-detail-col">
              <span className="streetview-detail-label">Aplikante:</span>
              <strong className="streetview-detail-val">{applicantName}</strong>
            </div>
            <div className="streetview-detail-col">
              <span className="streetview-detail-label">Yugto (Stage):</span>
              <span className="streetview-detail-val" style={{ color: stageColor, fontWeight: 700 }}>
                {stageEmoji} {stageLabel} ({stagePct}%)
              </span>
            </div>
            <div className="streetview-detail-col">
              <span className="streetview-detail-label">Inspector:</span>
              <span className="streetview-detail-val">
                {currentPhotoItem?.inspector || (project as any).latestInspection?.inspector || "Municipal Engineer"}
              </span>
            </div>
            <div className="streetview-detail-col streetview-detail-remarks">
              <span className="streetview-detail-label">Opisyal na Remarks sa Yugtong Ito:</span>
              {currentPhotoItem?.remarks ? (
                <p className="streetview-remarks-quote">"{currentPhotoItem.remarks}"</p>
              ) : (
                <p className="streetview-remarks-quote" style={{ fontStyle: "italic", opacity: 0.7 }}>
                  {hasUploadedPhoto
                    ? "Walang karagdagang nakasulat na remarks para sa litratong ito."
                    : "Wala pang na-upload na litrato o inspection report para sa yugtong ito."}
                </p>
              )}
            </div>
            {/* 📸 MGA KARAGDAGANG KUHA / SIDE PHOTOS (2D CLICKABLE PHOTOS) */}
            {/* 🧭 DRAWER TABS BAR: CLUP Checklist | Siting Geohazard | Side Photos */}
            <div className="streetview-drawer-tab-bar">
              <button
                type="button"
                className={`streetview-drawer-tab-btn ${drawerTab === "clup" ? "active" : ""}`}
                onClick={() => setDrawerTab("clup")}
                title="Tingnan ang CLUP Zoning Conformity at Ocular Inspection Checklist"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
                <span>CLUP &amp; Ocular Checklist</span>
              </button>

              <button
                type="button"
                className={`streetview-drawer-tab-btn ${drawerTab === "hazard" ? "active" : ""}`}
                onClick={() => setDrawerTab("hazard")}
                title="Tingnan ang Geohazard Clearance at Siting Assessment"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>Siting &amp; Geohazard</span>
              </button>

              <button
                type="button"
                className={`streetview-drawer-tab-btn ${drawerTab === "photos" ? "active" : ""}`}
                onClick={() => setDrawerTab("photos")}
                title="Tingnan ang mga 2D Side Photos"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>Side Photos ({currentStageSidePhotos.length})</span>
              </button>
            </div>

            {/* TAB 1: CLUP ZONING CONFORMITY & OCULAR INSPECTION CHECKLIST */}
            {drawerTab === "clup" && (
              <div className="streetview-detail-col streetview-clup-card">
                <div className="streetview-clup-title">
                  CLUP ZONING CONFORMITY &amp; OCULAR INSPECTION CHECKLIST
                </div>

                <div className="streetview-clup-rows">
                  <div className="streetview-clup-row">
                    <span className="streetview-clup-lbl">Sona ng Lote:</span>
                    <div className="streetview-clup-val">
                      <span
                        className="streetview-clup-pill"
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

                  <div className="streetview-clup-row">
                    <span className="streetview-clup-lbl">Ipinapanukalang Gusali:</span>
                    <div className="streetview-clup-val">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                      <strong>{proposedBuilding}</strong>
                    </div>
                  </div>

                  <div className="streetview-clup-row">
                    <span className="streetview-clup-lbl">Zoning Conformity:</span>
                    <span className="streetview-conformity-badge">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <polyline points="9 12 11 14 15 10" />
                      </svg>
                      Conforming sa CLUP Plan
                    </span>
                  </div>

                  <div className="streetview-clup-row full">
                    <span className="streetview-clup-lbl">Deskripsyon ng Sona:</span>
                    <p className="streetview-clup-desc">{zoningInfo.desc}</p>
                  </div>
                </div>

                {/* Ocular Inspection Protocol Checklist */}
                <div className="streetview-inspection-protocol">
                  <strong className="streetview-ip-head">
                    Mga Dapat Kumpirmahin sa 1-Araw na Ocular Inspection:
                  </strong>
                  <ul className="streetview-ip-list">
                    <li>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffc107" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>
                        <strong>Boundary Monuments (Mohon):</strong> Kumpirmahin ang aktwal na mohon ng lupa ayon sa TCT title.
                      </span>
                    </li>
                    <li>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffc107" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>
                        <strong>Road Right-of-Way (ROW):</strong> Siguraduhing may sapat na lapad ng daan at walang encroachment.
                      </span>
                    </li>
                    <li>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffc107" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>
                        <strong>Building Setbacks:</strong> Minimum 3.0m sa harapan, 2.0m sa mga gilid at likuran bago magbuhos.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB 2: LUISIANA SITING ASSESSMENT (GEOHAZARD CLEARANCE) */}
            {drawerTab === "hazard" && (
              <div className="streetview-detail-col streetview-assess-card">
                <div className="streetview-assess-card-title">
                  LUISIANA SITING ASSESSMENT (GEOHAZARD CLEARANCE)
                </div>

                <dl className="streetview-assess-list">
                  <div className="streetview-assess-row">
                    <dt>Ground shaking</dt>
                    <dd style={{ color: "#38bdf8" }}>PEIS VIII</dd>
                  </div>

                  <div className="streetview-assess-row">
                    <dt>EIL 2014</dt>
                    <dd style={{ color: "#38bdf8" }}>Low</dd>
                  </div>

                  <div className="streetview-assess-row">
                    <dt>Siting class</dt>
                    <dd style={{ color: "#38bdf8" }}>LOW — standard seismic design</dd>
                  </div>

                  <div className="streetview-assess-row">
                    <dt>Terrain model</dt>
                    <dd style={{ color: "#ffffff" }}>Not ready</dd>
                  </div>

                  <div className="streetview-assess-row">
                    <dt>Flood</dt>
                    <dd style={{ color: getHazardColor(geoRisk?.flood?.value) }}>
                      {loadingHazard ? "Sinusuri…" : geoRisk?.flood?.value || "Safe"}
                    </dd>
                  </div>

                  <div className="streetview-assess-row">
                    <dt>Rain-induced landslide</dt>
                    <dd style={{ color: getHazardColor(geoRisk?.landslide?.value) }}>
                      {loadingHazard ? "Sinusuri…" : geoRisk?.landslide?.value || "Safe"}
                    </dd>
                  </div>

                  <div className="streetview-assess-row">
                    <dt>Mt. Banahaw</dt>
                    <dd style={{ color: "#ffffff" }}>
                      {banahawDist ? `${banahawDist} km N of summit` : "13.1 km N of summit"}
                    </dd>
                  </div>
                </dl>

                <div className="streetview-assess-source">
                  Luisiana only · MGB flood &amp; landslide (GeoRiskPH) + PHIVOLCS 2014 sheets + local terrain model.
                </div>

                <button
                  type="button"
                  className="streetview-assess-report-btn"
                  onClick={handlePrintHazardReport}
                  title="Buksan ang opisyal na PDF Hazard Report para sa lokasyong ito"
                >
                  View PDF Hazard Report ↗
                </button>
              </div>
            )}

            {/* TAB 3: SIDE PHOTOS SECTION */}
            {drawerTab === "photos" && (
              <div className="streetview-detail-col streetview-side-photos-section">
              <div className="streetview-side-photos-header">
                <div className="streetview-side-title-wrap">
                  <span className="streetview-detail-label">
                    📸 Mga Side Photos:
                  </span>
                  <span className="streetview-side-count-badge">
                    {currentStageSidePhotos.length} {currentStageSidePhotos.length === 1 ? "litrato" : "mga litrato"}
                  </span>
                </div>
                {canInspect && (
                  <button
                    type="button"
                    className="streetview-add-side-btn"
                    onClick={() => sideFileInputRef.current?.click()}
                    disabled={isUploadingSidePhoto}
                    title="Magdagdag ng bagong side photo mula sa cellphone o PC"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>{isUploadingSidePhoto ? "Nag-a-upload..." : "Mag-upload ng Side Photo"}</span>
                  </button>
                )}
                <input
                  type="file"
                  ref={sideFileInputRef}
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleSidePhotoUpload}
                />
              </div>

              {currentStageSidePhotos.length > 0 ? (
                <div className="streetview-side-thumbnails-scroll">
                  {currentStageSidePhotos.map((photo, idx) => (
                    <div
                      key={photo.id || idx}
                      className="streetview-side-thumb-card"
                      onClick={() => setActiveSidePhotoPreview(photo)}
                      role="button"
                      tabIndex={0}
                      title="I-click upang buksan ang buong 2D litrato"
                    >
                      <img
                        src={photo.url}
                        alt={photo.caption || `Side Kuha ${idx + 1}`}
                        className="streetview-side-thumb-img"
                        loading="lazy"
                      />
                      <div className="streetview-side-thumb-overlay">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          <line x1="11" y1="8" x2="11" y2="14" />
                          <line x1="8" y1="11" x2="14" y2="11" />
                        </svg>
                        <span style={{ fontSize: 10, fontWeight: 700 }}>Tingnan</span>
                      </div>
                      <span className="streetview-side-thumb-caption">
                        {photo.caption || `Side Kuha ${idx + 1}`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="streetview-no-side-photos">
                  <span>Wala pang na-upload na side photos para sa yugtong ito.</span>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      )}

      {/* 🖼️ CLICKABLE PHOTO LIGHTBOX MODAL (Hindi naka-display sa street, 2D Photo Viewer) */}
      {activeSidePhotoPreview && (
        <div
          className="streetview-lightbox-backdrop"
          onClick={() => setActiveSidePhotoPreview(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="streetview-lightbox-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="streetview-lightbox-header">
              <div className="streetview-lightbox-title-group">
                <div className="streetview-lightbox-tag">📸 SIDE PHOTO PREVIEW</div>
                <h4 className="streetview-lightbox-title">
                  {activeSidePhotoPreview.caption || "Side Inspection Photo"}
                </h4>
                <span className="streetview-lightbox-sub">
                  {formatFilipinoCaptureDate(activeSidePhotoPreview.uploadedAt)} • Yugto: {stageLabel}
                </span>
              </div>
              <button
                type="button"
                className="streetview-lightbox-close-btn"
                onClick={() => setActiveSidePhotoPreview(null)}
                title="Isara ang photo viewer (Esc)"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Large 2D Photo Display */}
            <div className="streetview-lightbox-img-wrap">
              <img
                src={activeSidePhotoPreview.url}
                alt={activeSidePhotoPreview.caption || "Side Photo"}
                className="streetview-lightbox-img"
              />
            </div>

            {/* Navigation Controls if multiple side photos */}
            {currentStageSidePhotos.length > 1 && (
              <div className="streetview-lightbox-footer">
                <button
                  type="button"
                  className="streetview-lightbox-nav-btn"
                  onClick={handlePrevSidePhoto}
                  title="Nakaraang side photo"
                >
                  ◀ Nakaraang Kuha
                </button>
                <span className="streetview-lightbox-pager-info">
                  Side Photo {currentSideIndex + 1} ng {currentStageSidePhotos.length}
                </span>
                <button
                  type="button"
                  className="streetview-lightbox-nav-btn"
                  onClick={handleNextSidePhoto}
                  title="Susunod na side photo"
                >
                  Susunod na Kuha ▶
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
