import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  HardHat,
  PencilLine,
  X,
  MapPin,
  Camera,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  ShieldCheck,
  Check,
} from "lucide-react";
import type { Project } from "../types";
import { backendUrl } from "../lib/api";
import { useTranslation } from "../lib/i18n";
import { updateProjectInFirestore, recordProjectInspectionInFirestore } from "../services/firestore-projects";
import { compressImageToBase64 } from "../lib/image-compress";
import "./InspectionUpdateModal.css";


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

interface ExistingStagePhoto {
  id: string;
  url: string;
  stage: "before" | "during" | "after";
  progress?: number;
  remarks?: string;
  inspector?: string;
  date?: string;
}

interface InspectionUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  onSuccess: (updatedData: any) => void;
  currentInspector?: string;
}

export const InspectionUpdateModal: React.FC<InspectionUpdateModalProps> = ({
  isOpen,
  onClose,
  project,
  onSuccess,
  currentInspector = "Municipal Engineer",
}) => {
  const { isEn } = useTranslation();
  const [stage, setStage] = useState<"before" | "during" | "after">("during");
  const [progress, setProgress] = useState<number>(50);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<string>("");
  const [inspector, setInspector] = useState<string>(currentInspector);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCompletionConfirm, setShowCompletionConfirm] = useState(false);

  
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  // Group existing site & inspection photos by stage to display currently uploaded street photos
  const existingPhotosByStage = useMemo(() => {
    const grouped: Record<"before" | "during" | "after", ExistingStagePhoto[]> = {
      before: [],
      during: [],
      after: [],
    };
    if (!project) return grouped;

    const seen = new Set<string>();

    // 1. Inspection photos array
    const inspections = (project as any).inspectionPhotos || [];
    inspections.forEach((insp: any, idx: number) => {
      const rawUrl = insp.photoUrl || insp.url;
      if (!rawUrl || seen.has(rawUrl)) return;
      seen.add(rawUrl);

      let s: "before" | "during" | "after" = "during";
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
        progress: typeof insp.progress === "number" ? insp.progress : undefined,
        remarks: insp.remarks || "",
        inspector: insp.inspector || "",
        date: insp.inspectedAt || insp.uploadedAt || insp.timestamp || "",
      });
    });

    // 2. Project photos array
    if (Array.isArray(project.photos)) {
      project.photos.forEach((p, idx) => {
        const rawUrl = p.url;
        if (!rawUrl || seen.has(rawUrl)) return;
        // Do not treat geotagged baseline photo as an inspection photo
        if (
          p.kind === "site" ||
          p.kind === "geotagged" ||
          p.caption?.toLowerCase().includes("geotagged") ||
          p.caption?.toLowerCase().includes("baseline")
        ) {
          return;
        }
        seen.add(rawUrl);

        let s: "before" | "during" | "after" = "during";
        const stLower = String((p as any).stage || p.caption || "").toLowerCase();
        if (stLower.includes("before") || (p as any).progress === 0) {
          s = "before";
        } else if (stLower.includes("after") || (p as any).progress >= 100) {
          s = "after";
        } else {
          s = "during";
        }

        grouped[s].push({
          id: p.id || `proj-photo-${idx}`,
          url: resolvePhotoUrl(rawUrl),
          stage: s,
          remarks: p.caption || "",
          date: p.uploadedAt || "",
        });
      });
    }

    // 3. Single direct photoUrl if present (exclude geotagged coordinate photo)
    const singleUrl = (project as any).photoUrl;
    const isGeotag =
      singleUrl === (project as any).geotaggedPhotoUrl ||
      singleUrl === (project as any).sitePhotoUrl;
    if (singleUrl && !isGeotag && !seen.has(singleUrl)) {
      const currentProgress = (project as any).numericProgress ?? project.progress ?? 0;
      const s: "before" | "during" | "after" =
        currentProgress >= 100 ? "after" : currentProgress >= 50 ? "during" : "before";
      grouped[s].push({
        id: "initial-photo",
        url: resolvePhotoUrl(singleUrl),
        stage: s,
        date: (project as any).updatedAt || "",
      });
    }

    return grouped;
  }, [project]);

  const currentExistingPhotos = existingPhotosByStage[stage];

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync initial state from selected project
  useEffect(() => {
    if (!project) return;
    const currentProgress = (project as any).numericProgress ?? project.progress ?? 0;
    const currentStage =
      (project as any).stage ||
      (project as any).inspectionStage ||
      (project as any).latestInspection?.stage ||
      (currentProgress >= 100 ? "after" : currentProgress >= 50 ? "during" : "before");

    if (currentStage === "after" || currentProgress >= 100) {
      setStage("after");
      setProgress(100);
    } else if (currentStage === "during" || currentProgress >= 50) {
      setStage("during");
      setProgress(50);
    } else {
      setStage("before");
      setProgress(0);
    }

    setRemarks((project as any).latestInspection?.remarks || "");
    setInspector((project as any).latestInspection?.inspector || currentInspector || "Municipal Engineer");
    setFile(null);
    setPreviewUrl(null);
    setErrorMessage(null);
    setShowCompletionConfirm(false);
  }, [project, currentInspector, isOpen]);

  // Handle Escape key to close modal without affecting background street view
  useEffect(() => {
    if (!isOpen) {
      setShowCompletionConfirm(false);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        if (showCompletionConfirm) {
          setShowCompletionConfirm(false);
        } else if (viewingPhoto) {
          setViewingPhoto(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose, showCompletionConfirm, viewingPhoto]);

  if (!isOpen || !project) return null;

  const handleStageSelect = (selectedStage: "before" | "during" | "after") => {
    setStage(selectedStage);
    if (selectedStage === "before") setProgress(0);
    else if (selectedStage === "during") setProgress(50);
    else if (selectedStage === "after") setProgress(100);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  const executeSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const appId =
        (project as any).applicationId ||
        (project as any).trackingNumber ||
        (project.id.startsWith("infra-app-")
          ? project.id.replace("infra-app-", "")
          : project.id);

      // Convert photo to compressed base64 if selected, ensuring permanent storage in Cloud Firestore
      let compressedPhotoUrl = previewUrl || "";
      if (file) {
        try {
          const comp = await compressImageToBase64(file, 1024, 1024, 0.75);
          if (comp) compressedPhotoUrl = comp;
        } catch (compErr) {
          console.warn("[InspectionUpdateModal] Photo compression notice:", compErr);
        }
      }

      const formData = new FormData();
      formData.append("stage", stage);
      formData.append("progress", String(progress));
      formData.append("remarks", remarks);
      formData.append("inspector", inspector);
      if (file) {
        formData.append("photo", file);
      }

      let res: Response | null = null;
      let data: any = null;
      try {
        res = await fetch(backendUrl(`/api/citizen/applications/${appId}/inspection`), {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (res.ok) {
          data = await res.json();
        } else {
          const errData = await res.json().catch(() => null);
          if (errData?.error && !project?.isLguProject && !project?.id?.startsWith("lgu-proj-")) {
            throw new Error(errData.error || errData.message || "Nabigong i-save ang inspection report");
          }
        }
      } catch (fetchErr: any) {
        if (!project?.isLguProject && !project?.id?.startsWith("lgu-proj-")) {
          throw fetchErr;
        }
        console.warn("[InspectionUpdateModal] Backend notice:", fetchErr?.message);
      }

      const nextStatus = progress >= 100 ? "Completed" : progress >= 50 ? "Ongoing" : "Planned";
      const nextColor = progress >= 100 ? "#10b981" : progress >= 50 ? "#f5a623" : "#3b82f6";
      const now = new Date().toISOString();
      const serverPhotoUrl = data?.application?.latestInspection?.photoUrl || data?.project?.latestInspection?.photoUrl || "";
      const finalPhotoUrl = compressedPhotoUrl || (serverPhotoUrl ? resolvePhotoUrl(serverPhotoUrl) : "");

      const updatedRecord = {
        id: `insp-${Date.now()}`,
        stage,
        progress,
        photoUrl: finalPhotoUrl,
        remarks,
        inspector,
        timestamp: now,
        inspectedAt: now,
        stageLabel: `${stage === "before" ? "Before Construction" : stage === "after" ? "Completed / Final" : "During Construction"} (${progress}%)`,
      };

      // ── Cloud Firestore Sync: Pinned project, inspections, and progress photos ──
      const inspectionPayload = {
        id: updatedRecord.id,
        stage,
        progress,
        photoUrl: finalPhotoUrl,
        remarks,
        inspector,
        timestamp: now,
        inspectedAt: now,
        stageLabel: updatedRecord.stageLabel,
      };

      if (project?.id) {
        try {
          await recordProjectInspectionInFirestore(project.id, inspectionPayload, {
            ...project,
            progress,
            inspectionStage: stage,
            status: nextStatus as any,
            markerColor: nextColor,
          });
          console.info("[InspectionUpdateModal] Successfully synced inspection to Cloud Firestore:", project.id);
        } catch (e: any) {
          console.warn("[InspectionUpdateModal] Firestore inspection sync notice:", e?.message || e);
        }

        // If appId differs from project.id (e.g. tracking number), also update under appId
        if (appId && appId !== project.id) {
          try {
            await recordProjectInspectionInFirestore(appId, inspectionPayload, {
              progress,
              inspectionStage: stage,
              status: nextStatus as any,
              markerColor: nextColor,
            });
          } catch {
            /* ignore */
          }
        }

        // Also update local storage cache immediately
        try {
          const cachedRaw = localStorage.getItem("infatrack-projects-cache");
          const cached = cachedRaw ? JSON.parse(cachedRaw) : [];
          const list = Array.isArray(cached) ? cached : [];
          const updatedList = list.map((p: any) =>
            p.id === project.id || p.trackingNumber === appId
              ? {
                  ...p,
                  progress,
                  inspectionStage: stage,
                  status: nextStatus,
                  markerColor: nextColor,
                  latestInspection: updatedRecord,
                  photos: finalPhotoUrl
                    ? [
                        {
                          id: `photo-${updatedRecord.id}`,
                          url: finalPhotoUrl,
                          caption: `${stage.toUpperCase()} Inspection (${progress}%) - ${remarks || "Site progress photo"}`,
                          stage,
                          kind: "progress",
                          uploadedAt: now,
                          lat: p.location?.lat,
                          lon: p.location?.lon,
                        },
                        ...(p.photos || []),
                      ]
                    : p.photos,
                }
              : p
          );
          localStorage.setItem("infatrack-projects-cache", JSON.stringify(updatedList));
        } catch {
          /* quota */
        }
      }

      const resultPayload = data?.application || data?.project || {
        id: project.id,
        progress,
        inspectionStage: stage,
        stage,
        status: nextStatus,
        latestInspection: updatedRecord,
        inspectionPhotos: [updatedRecord],
      };

      setShowCompletionConfirm(false);
      onSuccess(resultPayload);
      onClose();
    } catch (err: any) {
      console.error("Inspection submit error:", err);
      setErrorMessage(err.message || "Nagkaroon ng aberya habang nagse-save");
      setShowCompletionConfirm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (stage === "after") {
      setShowCompletionConfirm(true);
      return;
    }
    executeSubmit();
  };

  const trackingNumber =
    (project as any).trackingNumber ||
    (project.id.startsWith("infra-app-")
      ? project.id.replace("infra-app-", "")
      : project.id);

  const applicantName =
    (project as any).applicantName || "Private Applicant";

  return (
    <div className="ium-backdrop" role="dialog" aria-modal="true" aria-labelledby="ium-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ium-modal">
        {/* Header */}
        <div className="ium-header">
          <div className="ium-header-info">
            <div className="ium-header-kicker">
              <span className="ium-seal-badge">
                <HardHat size={12} />
                <span>Municipal Engineering Office</span>
              </span>
              <span className="ium-portal-tag">INFA-TRACK · Ocular Inspection</span>
            </div>
            <h2 id="ium-title" className="ium-header-title">
              <PencilLine size={17} className="ium-title-icon" />
              <span>{isEn ? "Update Site Progress & Inspection" : "I-update ang Site Progress at Inspeksyon"}</span>
            </h2>
          </div>
          <button
            type="button"
            className="ium-close-btn"
            onClick={onClose}
            title={isEn ? "Close" : "Isara"}
            aria-label={isEn ? "Close modal" : "Isara ang modal"}
          >
            <X size={15} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="ium-body">
          {/* Target Application Summary */}
          <div className="ium-app-summary">
            <div className="ium-app-summary-left">
              <span className="ium-app-tracking">{trackingNumber}</span>
              <span className="ium-app-name">{project.name}</span>
              <span className="ium-app-applicant">{isEn ? "Applicant:" : "Aplikante:"} {applicantName}</span>
            </div>
            {project.barangay && (
              <span className="ium-app-location-pill">
                <MapPin size={13} />
                <span>{project.barangay}</span>
              </span>
            )}
          </div>

          {/* 3-Stage Workflow Selector */}
          <div className="ium-form-group">
            <label className="ium-label">
              <span>{isEn ? "Inspection Stage" : "Yugto ng Inspeksyon (Inspection Stage)"}</span>
              <span className="ium-label-hint">{isEn ? "Pin color on map will update" : "Magbabago ang kulay ng pin sa mapa"}</span>
            </label>
            <div className="ium-stages-grid">
              {/* Stage 1: Before (0%) */}
              <div
                className={`ium-stage-option ${
                  stage === "before" ? "is-selected-before" : ""
                }`}
                onClick={() => handleStageSelect("before")}
                role="button"
                tabIndex={0}
              >
                <div className="ium-stage-dot">
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 8px rgba(239, 68, 68, 0.6)" }} />
                </div>
                <div className="ium-stage-name">Before</div>
                <div className="ium-stage-pct" style={{ color: "#ef4444" }}>0%</div>
                <div className="ium-stage-desc">{isEn ? "Pre-excavation / Vacant Lot" : "Pre-excavation / Bakanteng Lote"}</div>
              </div>

              {/* Stage 2: During (50%) */}
              <div
                className={`ium-stage-option ${
                  stage === "during" ? "is-selected-during" : ""
                }`}
                onClick={() => handleStageSelect("during")}
                role="button"
                tabIndex={0}
              >
                <div className="ium-stage-dot">
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#eab308", boxShadow: "0 0 8px rgba(234, 179, 8, 0.6)" }} />
                </div>
                <div className="ium-stage-name">During</div>
                <div className="ium-stage-pct" style={{ color: "#eab308" }}>50%</div>
                <div className="ium-stage-desc">{isEn ? "Ongoing Construction / Foundation" : "Kasalukuyang Ginagawa / Pundasyon"}</div>
              </div>

              {/* Stage 3: After (100%) */}
              <div
                className={`ium-stage-option ${
                  stage === "after" ? "is-selected-after" : ""
                }`}
                onClick={() => handleStageSelect("after")}
                role="button"
                tabIndex={0}
              >
                <div className="ium-stage-dot">
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34, 197, 94, 0.6)" }} />
                </div>
                <div className="ium-stage-name">After</div>
                <div className="ium-stage-pct" style={{ color: "#22c55e" }}>100%</div>
                <div className="ium-stage-desc">{isEn ? "Completed / Ready for Occupancy" : "Tapos Na / Handa sa Occupancy"}</div>
              </div>
            </div>

            {/* Inline Notice: Dynamic for each inspection stage */}
            {stage === "before" && (
              <div className="ium-stage-notice-box is-stage-before" role="note">
                <div className="ium-stage-notice-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </div>
                <div className="ium-stage-notice-content">
                  <span className="ium-stage-notice-heading">{isEn ? "Guide for Before Stage (0%):" : "Gabay sa Before Stage (0%):"}</span>
                  <span className="ium-stage-notice-text">
                    {isEn ? "Verify boundary monuments (mohon), road right-of-way (ROW), and mandatory building setbacks before excavation and concrete pouring." : "Tiyakin ang kumpirmasyon ng mga mohon (boundary monuments), sapat na road right-of-way (ROW), at tamang building setbacks bago simulan ang paghuhukay at pagbuhos."}
                  </span>
                </div>
              </div>
            )}

            {stage === "during" && (
              <div className="ium-stage-notice-box is-stage-during" role="note">
                <div className="ium-stage-notice-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                </div>
                <div className="ium-stage-notice-content">
                  <span className="ium-stage-notice-heading">{isEn ? "Guide for During Stage (50%):" : "Gabay sa During Stage (50%):"}</span>
                  <span className="ium-stage-notice-text">
                    {isEn ? "Document actual progress including foundations, columns, and walls. Ensure materials and framing comply with the approved structural plan." : "I-dokumento ang aktwal na progreso tulad ng pundasyon, poste, at pader. Tiyaking tumutugma ang materyales at estruktura sa inaprubahang structural plan."}
                  </span>
                </div>
              </div>
            )}

            {stage === "after" && (
              <div className="ium-stage-notice-box is-stage-after ium-after-notice-box" role="alert">
                <div className="ium-stage-notice-icon ium-after-notice-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="ium-stage-notice-content ium-after-notice-content">
                  <span className="ium-stage-notice-heading ium-after-notice-heading">{isEn ? "Notice on 100% Completion:" : "Paalala sa 100% Completion:"}</span>
                  <span className="ium-stage-notice-text ium-after-notice-text">
                    {isEn ? "Setting progress to 100% is final. This automatically concludes monitoring and signals the system to issue the Certificate of Occupancy." : "Ang pag-set ng progress sa 100% ay pinal. Awtomatiko nitong tatapusin ang monitoring at magbibigay-hudyat sa system na i-isyu ang Certificate of Occupancy para sa proyektong ito."}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 📸 MGA KASALUKUYANG IN-UPLOAD NA LITRATO (WITH EMBEDDED ADD BUTTON) */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {currentExistingPhotos.length > 0 ? (
            <div className="ium-form-group">
              <div className="ium-existing-photos-wrap">
                <div className="ium-existing-photos-header">
                  <label className="ium-label" style={{ marginBottom: 0 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span>{isEn ? "Uploaded Photos for This Stage:" : "In-upload na Litrato sa Yugtong Ito:"}</span>
                    </span>
                    <span className="ium-existing-count-badge">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 4 }}>
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      {currentExistingPhotos.length} {isEn ? (currentExistingPhotos.length === 1 ? "photo" : "photos") : (currentExistingPhotos.length === 1 ? "litrato" : "mga litrato")}
                    </span>
                  </label>
                  <span className="ium-label-hint">
                    {isEn ? "Linked to Street View Pager" : "Naka-link sa Street View Pager"}
                  </span>
                </div>

                <div className="ium-existing-photos-grid">
                  {/* Existing Uploaded Photos */}
                  {currentExistingPhotos.map((photo, idx) => (
                    <div
                      key={photo.id || idx}
                      className="ium-existing-photo-card"
                      onClick={() => setViewingPhoto(photo.url)}
                      role="button"
                      tabIndex={0}
                      title={isEn ? "Click to view full photo preview" : "I-click upang i-preview nang malaki ang kuha"}
                    >
                      <img
                        src={photo.url}
                        alt={`Photo ${idx + 1}`}
                        className="ium-existing-thumb"
                        loading="lazy"
                      />
                      <div className="ium-existing-thumb-overlay">
                        <span className="ium-existing-idx-badge">
                          {isEn ? `Photo ${idx + 1} of ${currentExistingPhotos.length}` : `Kuha ${idx + 1} ng ${currentExistingPhotos.length}`}
                        </span>
                        <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            <line x1="11" y1="8" x2="11" y2="14"/>
                            <line x1="8" y1="11" x2="14" y2="11"/>
                          </svg>
                        </div>
                        {photo.remarks && (
                          <div className="ium-existing-caption" title={photo.remarks}>
                            "{photo.remarks}"
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* EMBEDDED ADD PHOTO CARD / NEW PREVIEW CARD IN THE SAME ROW */}
                  {previewUrl ? (
                    <div
                      className="ium-existing-photo-card is-new-photo-card"
                      title={isEn ? "Selected new photo for this stage" : "Napiling bagong litrato para sa yugtong ito"}
                    >
                      <img
                        src={previewUrl}
                        alt="New selected photo"
                        className="ium-existing-thumb"
                      />
                      <div className="ium-existing-thumb-overlay is-new-overlay">
                        <span className="ium-new-photo-badge">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 4 }}>
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          {isEn ? "New Photo" : "Bagong Kuha"}
                        </span>
                        <div className="ium-new-photo-actions">
                          <button
                            type="button"
                            className="ium-new-change-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              fileInputRef.current?.click();
                            }}
                            title={isEn ? "Change photo" : "Palitan ang litrato"}
                          >
                            {isEn ? "Change" : "Palitan"}
                          </button>
                          <button
                            type="button"
                            className="ium-new-remove-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFile(null);
                              setPreviewUrl(null);
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            title={isEn ? "Remove" : "Tanggalin"}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="ium-add-photo-card"
                      onClick={() => fileInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      title={isEn ? "Add another photo for this stage" : "Magdagdag ng panibagong litrato para sa yugtong ito"}
                    >
                      <div className="ium-add-photo-icon-wrap">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"/>
                          <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </div>
                      <span className="ium-add-photo-text">{isEn ? "+ Add" : "+ Magdagdag"}</span>
                      <span className="ium-add-photo-sub">{isEn ? "Photo" : "ng Kuha"}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* If 0 photos exist yet for this stage, show the classic dropzone */
            <div className="ium-form-group">
              <label className="ium-label">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Camera size={15} />
                  <span>{isEn ? "Actual Site Photo (Street View)" : "Aktwal na Litrato mula sa Site (Street View)"}</span>
                </span>
                <span className="ium-label-hint">{isEn ? "Photo from mobile phone or camera" : "Litrato mula sa cellphone o camera"}</span>
              </label>
              <div
                className={`ium-drop-zone ${previewUrl ? "has-file" : ""}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {previewUrl ? (
                  <>
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="ium-preview-img"
                    />
                    <div className="ium-drop-text has-file">
                      <CheckCircle2 size={15} />
                      <span>{isEn ? "Photo selected — click to change" : "May napiling litrato — i-click para palitan"}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="ium-drop-icon-wrap">
                      <Camera size={22} />
                    </div>
                    <div className="ium-drop-text">
                      {isEn ? "Click here to upload new site photo (JPEG/PNG)" : "I-click dito upang mag-upload ng bagong kuha sa site (JPEG/PNG)"}
                    </div>
                    <div className="ium-drop-sub">
                      {isEn ? "Actual geotagged ocular inspection photo" : "Aktwal na litrato mula sa inspeksyon"}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Remarks / Field Notes */}
          <div className="ium-form-group">
            <label className="ium-label">
              <span>{isEn ? "Official Remarks / Field Observations" : "Opisyal na Remarks / Obserbasyon"}</span>
            </label>
            <textarea
              className="ium-textarea"
              placeholder={isEn ? "Example: Foundation and column pouring complete, compliant with approved structural plan..." : "Halimbawa: Pundasyon at buhos ng poste tapos na, sumunod sa approved structural plan..."}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          {/* Inspector Name */}
          <div className="ium-form-group">
            <label className="ium-label">
              <span>{isEn ? "Inspector Name" : "Pangalan ng Inspector"}</span>
            </label>
            <input
              type="text"
              className="ium-input"
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
              placeholder={isEn ? "e.g. Engr. Dela Cruz" : "Hal. Engr. Dela Cruz"}
            />
          </div>

          {/* Error Message if any */}
          {errorMessage && (
            <div className="ium-error-alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Modal Footer */}
          <div className="ium-footer">
            <button
              type="button"
              className="ium-btn-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {isEn ? "Cancel" : "Kanselahin"}
            </button>
            <button
              type="submit"
              className="ium-btn-save"
              disabled={isSubmitting}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span>{isSubmitting ? (isEn ? "Saving..." : "Sine-save...") : (isEn ? "Save Inspection Update" : "I-save ang Inspection Update")}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Lightbox photo preview */}
      {viewingPhoto && (
        <div
          className="ium-photo-preview-backdrop"
          onClick={() => setViewingPhoto(null)}
        >
          <div className="ium-photo-preview-modal" onClick={(e) => e.stopPropagation()}>
            <img src={viewingPhoto} alt="Site Photo Preview" className="ium-photo-preview-full" />
            <button
              type="button"
              className="ium-photo-preview-close"
              onClick={() => setViewingPhoto(null)}
            >
              {isEn ? "✕ Close Preview" : "✕ Isara ang Preview"}
            </button>
          </div>
        </div>
      )}

      {/* KUMPIRMASYON SA PAGKUMPLETO (100% AFTER DIALOG) */}
      {showCompletionConfirm && (
        <div
          className="ium-confirm-backdrop"
          onClick={() => {
            if (!isSubmitting) setShowCompletionConfirm(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ium-confirm-title"
        >
          <div
            className="ium-confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ium-confirm-icon-ring">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>

            <div className="ium-confirm-header">
              <h3 id="ium-confirm-title" className="ium-confirm-title">
                {isEn ? "Confirm Project Completion" : "Kumpirmahin ang Pagkumpleto"}
              </h3>
              <div className="ium-confirm-badges">
                <span className="ium-confirm-badge-app">{trackingNumber}</span>
                <span className="ium-confirm-badge-stage" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4" y="2" width="16" height="20" rx="2" />
                    <line x1="9" y1="22" x2="9" y2="22.01" />
                    <line x1="15" y1="22" x2="15" y2="22.01" />
                  </svg>
                  <span>After Construction (100%)</span>
                </span>
              </div>
            </div>

            <div className="ium-confirm-body">
              <p className="ium-confirm-text">
                {isEn
                  ? "Are you sure this structure is 100% completed and safe? This action is irreversible and proceeds to the issuance of the Occupancy Permit."
                  : "Sigurado ka bang 100% nang tapos at ligtas ang istrukturang ito? Ang aksyong ito ay hindi na maibabalik (irreversible) at ipapasa na sa pag-iisyu ng Occupancy Permit."}
              </p>
              {applicantName && (
                <div className="ium-confirm-meta">
                  <span className="ium-confirm-meta-label">{isEn ? "Applicant:" : "Aplikante:"}</span>
                  <span className="ium-confirm-meta-val">{applicantName}</span>
                </div>
              )}
            </div>

            <div className="ium-confirm-actions">
              <button
                type="button"
                className="ium-confirm-btn-cancel"
                onClick={() => setShowCompletionConfirm(false)}
                disabled={isSubmitting}
              >
                {isEn ? "Cancel" : "Kanselahin"}
              </button>
              <button
                type="button"
                className="ium-confirm-btn-confirm"
                onClick={executeSubmit}
                disabled={isSubmitting}
                autoFocus
              >
                {isSubmitting ? (
                  <>
                    <svg className="ium-confirm-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    <span>{isEn ? "Confirming..." : "Kino-kumpirma..."}</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{isEn ? "Yes, Confirm" : "Oo, Kumpirmahin"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
