import React, { useState, useEffect, useRef, useMemo } from "react";
import type { Project } from "../types";
import { backendUrl } from "../lib/api";
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

    // 3. Single direct photoUrl if present
    const singleUrl = (project as any).photoUrl || (project as any).sitePhotoUrl;
    if (singleUrl && !seen.has(singleUrl)) {
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

      const formData = new FormData();
      formData.append("stage", stage);
      formData.append("progress", String(progress));
      formData.append("remarks", remarks);
      formData.append("inspector", inspector);
      if (file) {
        formData.append("photo", file);
      }

      const res = await fetch(backendUrl(`/api/citizen/applications/${appId}/inspection`), {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || data.error || "Nabigong i-save ang inspection report");
      }

      setShowCompletionConfirm(false);
      onSuccess(data.application || data);
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
          <h2 id="ium-title" className="ium-header-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>Update Site Progress & Inspection</span>
          </h2>
          <button
            type="button"
            className="ium-close-btn"
            onClick={onClose}
            title="Isara"
            aria-label="Isara ang modal"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="ium-body">
          {/* Target Application Summary */}
          <div className="ium-app-summary">
            <div className="ium-app-summary-left">
              <span className="ium-app-tracking">{trackingNumber}</span>
              <span className="ium-app-name">{project.name}</span>
              <span className="ium-app-applicant">Aplikante: {applicantName}</span>
            </div>
            {project.barangay && (
              <span style={{ fontSize: 12, color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>{project.barangay}</span>
              </span>
            )}
          </div>

          {/* 3-Stage Workflow Selector */}
          <div className="ium-form-group">
            <label className="ium-label">
              <span>Yugto ng Inspeksyon (Inspection Stage)</span>
              <span className="ium-label-hint">Magbabago ang kulay ng pin sa mapa</span>
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
                <div className="ium-stage-desc">Pre-excavation / Bakanteng Lote</div>
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
                <div className="ium-stage-desc">Kasalukuyang Ginagawa / Pundasyon</div>
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
                <div className="ium-stage-desc">Tapos Na / Handa sa Occupancy</div>
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
                  <span className="ium-stage-notice-heading">Gabay sa Before Stage (0%):</span>
                  <span className="ium-stage-notice-text">
                    Tiyakin ang kumpirmasyon ng mga mohon (boundary monuments), sapat na road right-of-way (ROW), at tamang building setbacks bago simulan ang paghuhukay at pagbuhos.
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
                  <span className="ium-stage-notice-heading">Gabay sa During Stage (50%):</span>
                  <span className="ium-stage-notice-text">
                    I-dokumento ang aktwal na progreso tulad ng pundasyon, poste, at pader. Tiyaking tumutugma ang materyales at estruktura sa inaprubahang structural plan.
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
                  <span className="ium-stage-notice-heading ium-after-notice-heading">Paalala sa 100% Completion:</span>
                  <span className="ium-stage-notice-text ium-after-notice-text">
                    Ang pag-set ng progress sa 100% ay pinal. Awtomatiko nitong tatapusin ang monitoring at magbibigay-hudyat sa system na i-isyu ang Certificate of Occupancy para sa proyektong ito.
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
                      <span>In-upload na Litrato sa Yugtong Ito:</span>
                    </span>
                    <span className="ium-existing-count-badge">
                      📷 {currentExistingPhotos.length} {currentExistingPhotos.length === 1 ? "litrato" : "mga litrato"}
                    </span>
                  </label>
                  <span className="ium-label-hint">
                    Naka-link sa Street View Pager
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
                      title="I-click upang i-preview nang malaki ang kuha"
                    >
                      <img
                        src={photo.url}
                        alt={`Kuha ${idx + 1}`}
                        className="ium-existing-thumb"
                        loading="lazy"
                      />
                      <div className="ium-existing-thumb-overlay">
                        <span className="ium-existing-idx-badge">
                          Kuha {idx + 1} ng {currentExistingPhotos.length}
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

                  {/* ➕ EMBEDDED ADD PHOTO CARD / NEW PREVIEW CARD IN THE SAME ROW */}
                  {previewUrl ? (
                    <div
                      className="ium-existing-photo-card is-new-photo-card"
                      title="Napiling bagong litrato para sa yugtong ito"
                    >
                      <img
                        src={previewUrl}
                        alt="Bagong napiling litrato"
                        className="ium-existing-thumb"
                      />
                      <div className="ium-existing-thumb-overlay is-new-overlay">
                        <span className="ium-new-photo-badge">
                          ✨ Bagong Kuha
                        </span>
                        <div className="ium-new-photo-actions">
                          <button
                            type="button"
                            className="ium-new-change-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              fileInputRef.current?.click();
                            }}
                            title="Palitan ang litrato"
                          >
                            Palitan
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
                            title="Tanggalin"
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
                      title="Magdagdag ng panibagong litrato para sa yugtong ito"
                    >
                      <div className="ium-add-photo-icon-wrap">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"/>
                          <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </div>
                      <span className="ium-add-photo-text">+ Magdagdag</span>
                      <span className="ium-add-photo-sub">ng Kuha</span>
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
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>Aktwal na Litrato mula sa Site (Street View)</span>
                </span>
                <span className="ium-label-hint">Litrato mula sa cellphone o camera</span>
              </label>
              <div
                className={`ium-drop-zone ${previewUrl ? "has-file" : ""}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {previewUrl ? (
                  <>
                    <img
                      src={previewUrl}
                      alt="Preview ng bagong litrato"
                      className="ium-preview-img"
                    />
                    <div className="ium-drop-text" style={{ color: "#86efac", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>May napiling litrato — i-click para palitan</span>
                    </div>
                  </>
                ) : (
                  <>
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <div className="ium-drop-text">
                      I-click dito upang mag-upload ng bagong kuha sa site (JPEG/PNG)
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Remarks / Field Notes */}
          <div className="ium-form-group">
            <label className="ium-label">
              <span>Opisyal na Remarks / Obserbasyon</span>
            </label>
            <textarea
              className="ium-textarea"
              placeholder="Halimbawa: Pundasyon at buhos ng poste tapos na, sumunod sa approved structural plan..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          {/* Inspector Name */}
          <div className="ium-form-group">
            <label className="ium-label">
              <span>Pangalan ng Inspector</span>
            </label>
            <input
              type="text"
              className="ium-input"
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
              placeholder="Hal. Engr. Dela Cruz"
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
              Kanselahin
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
              <span>{isSubmitting ? "Sine-save..." : "I-save ang Inspection Update"}</span>
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
              ✕ Isara ang Preview
            </button>
          </div>
        </div>
      )}

      {/* ⚠️ KUMPIRMASYON SA PAGKUMPLETO (100% AFTER DIALOG) */}
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
                Kumpirmahin ang Pagkumpleto
              </h3>
              <div className="ium-confirm-badges">
                <span className="ium-confirm-badge-app">{trackingNumber}</span>
                <span className="ium-confirm-badge-stage">🏗️ After Construction (100%)</span>
              </div>
            </div>

            <div className="ium-confirm-body">
              <p className="ium-confirm-text">
                Sigurado ka bang <strong>100% nang tapos at ligtas</strong> ang istrukturang ito? Ang aksyong ito ay hindi na maibabalik (<em>irreversible</em>) at ipapasa na sa pag-iisyu ng <strong>Occupancy Permit</strong>.
              </p>
              {applicantName && (
                <div className="ium-confirm-meta">
                  <span className="ium-confirm-meta-label">Aplikante:</span>
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
                Kanselahin
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
                    <span>Kino-kumpirma...</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Oo, Kumpirmahin</span>
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
