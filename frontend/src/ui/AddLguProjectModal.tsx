import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  Landmark,
  MapPin,
  Coins,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  Lock,
  Unlock,
  Camera,
  Scan,
  ShieldCheck,
  Trash2,
  Sparkles,
  RefreshCw,
  HardHat,
  FileCheck2,
} from "lucide-react";
import { BARANGAY_LIST, type Project, type ProjectPhoto, type ProjectStatus } from "../types";
import type { SessionUser } from "../services/auth";
import { extractGeotagCoordinates, type GeotagExtractionResult } from "../lib/geotag";
import { uploadDocumentFile, createProject } from "../lib/api";
import { addProjectToFirestore } from "../services/firestore-projects";
import { writeAudit } from "../services/firestore-audit";
import "./AddLguProjectModal.css";

export type ProjectStatusOption = "Pre-construction" | "Ongoing" | "Completed";

export interface AddLguProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newProject: Project) => void;
  currentSession?: SessionUser | null;
  currentRole?: string | null;
  isModal?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPeso(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const AddLguProjectModal: React.FC<AddLguProjectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentSession,
  currentRole,
  isModal = true,
}) => {
  // ── 1. Section 1: PROJECT DETAILS ──
  const [name, setName] = useState<string>("");
  const [barangay, setBarangay] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // ── 2. Section 2: TRANSPARENCY & BIDDING RESULTS ──
  const [contractor, setContractor] = useState<string>("");
  const [budget, setBudget] = useState<string>("");
  const [status, setStatus] = useState<ProjectStatusOption>("Pre-construction");

  // ── 3. Section 3: MEDIA & MAP PINNING ──
  const [sitePhoto, setSitePhoto] = useState<File | null>(null);
  const [sitePhotoPreview, setSitePhotoPreview] = useState<string | null>(null);
  const [isExtractingGps, setIsExtractingGps] = useState<boolean>(false);
  const [gpsExtracted, setGpsExtracted] = useState<boolean>(false);
  const [gpsExtractionSource, setGpsExtractionSource] = useState<"exif" | "ocr" | null>(null);
  const [gpsExtractionMessage, setGpsExtractionMessage] = useState<string | null>(null);
  const [lat, setLat] = useState<string>("");
  const [lon, setLon] = useState<string>("");
  const [isManualCoords, setIsManualCoords] = useState<boolean>(false);

  // Documents
  const [noticeOfAwardFile, setNoticeOfAwardFile] = useState<File | null>(null);
  const [programOfWorksFile, setProgramOfWorksFile] = useState<File | null>(null);

  // ── 4. Form Lifecycle & Submission ──
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const noaInputRef = useRef<HTMLInputElement | null>(null);
  const powInputRef = useRef<HTMLInputElement | null>(null);

  // Determine current user display info for audit trail
  const encodedByDisplay = useMemo(() => {
    const username = currentSession?.name || currentSession?.username || currentRole || "Staff User";
    const dept = currentSession?.department || (currentRole === "Engineer" ? "Engineering Office" : "MPDC");
    return { username, dept };
  }, [currentSession, currentRole]);

  // Clean form when modal closes or opens
  useEffect(() => {
    if (!isOpen) {
      // Clean up object URLs to avoid memory leaks
      if (sitePhotoPreview && sitePhotoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(sitePhotoPreview);
      }
      setName("");
      setBarangay("");
      setDescription("");
      setContractor("");
      setBudget("");
      setStatus("Pre-construction");
      setSitePhoto(null);
      setSitePhotoPreview(null);
      setIsExtractingGps(false);
      setGpsExtracted(false);
      setGpsExtractionSource(null);
      setGpsExtractionMessage(null);
      setLat("");
      setLon("");
      setIsManualCoords(false);
      setNoticeOfAwardFile(null);
      setProgramOfWorksFile(null);
      setIsSubmitting(false);
      setSubmitError(null);
      setSubmitSuccess(false);
      setValidationErrors({});
    }
  }, [isOpen]);

  // Handle Geotagged Site Photo Selection
  const handlePhotoSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setSubmitError("Please upload a valid image file (JPEG, PNG, or WEBP).");
      return;
    }

    setSitePhoto(file);
    const previewUrl = URL.createObjectURL(file);
    setSitePhotoPreview(previewUrl);
    setSubmitError(null);
    setIsExtractingGps(true);
    setGpsExtractionMessage("Scanning photo for GPS EXIF metadata & camera watermarks...");

    try {
      const result: GeotagExtractionResult = await extractGeotagCoordinates(file);

      if (result.hasGeotag && result.coords) {
        setLat(result.coords.lat.toFixed(6));
        setLon(result.coords.lon.toFixed(6));
        setGpsExtracted(true);
        setGpsExtractionSource(result.source || "exif");
        setGpsExtractionMessage(
          result.source === "ocr"
            ? "GPS coordinates successfully extracted from photo watermark (OCR Engine)."
            : "High-precision GPS coordinates successfully extracted from photo EXIF tags."
        );

        // Auto-detect barangay if found in watermark
        if (result.detectedBarangay && !barangay) {
          setBarangay(result.detectedBarangay);
        }
      } else {
        setGpsExtracted(false);
        setGpsExtractionSource(null);
        setGpsExtractionMessage(
          "No GPS EXIF coordinates or camera watermark recognized. You may toggle manual coordinate entry."
        );
      }
    } catch (err) {
      console.warn("[AddLguProjectModal] Geotag extraction failed:", err);
      setGpsExtracted(false);
      setGpsExtractionSource(null);
      setGpsExtractionMessage("Coordinate extraction encountered an issue. You may input coordinates manually.");
    } finally {
      setIsExtractingGps(false);
    }
  };

  const handleRemovePhoto = () => {
    if (sitePhotoPreview && sitePhotoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(sitePhotoPreview);
    }
    setSitePhoto(null);
    setSitePhotoPreview(null);
    setGpsExtracted(false);
    setGpsExtractionSource(null);
    setGpsExtractionMessage(null);
    if (!isManualCoords) {
      setLat("");
      setLon("");
    }
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  // Validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = "Project Name is required.";
    }
    if (!barangay) {
      errors.barangay = "Please select a Barangay in Luisiana.";
    }
    if (!contractor.trim()) {
      errors.contractor = "Winning Contractor name is required for transparency.";
    }
    const numBudget = parseFloat(budget.replace(/,/g, ""));
    if (isNaN(numBudget) || numBudget <= 0) {
      errors.budget = "Please enter a valid approved budget greater than ₱0.00.";
    }
    if (!lat || !lon) {
      errors.coordinates = "Map coordinates are required. Upload a geotagged photo or enter coordinates.";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      setSubmitError("Please fill out all required fields before saving.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const now = new Date().toISOString();
      const numBudget = parseFloat(budget.replace(/,/g, "")) || 0;
      const numLat = parseFloat(lat);
      const numLon = parseFloat(lon);

      // 1. Upload files if provided
      let noaUrl = "";
      let noaName = "";
      if (noticeOfAwardFile) {
        try {
          const res = await uploadDocumentFile(noticeOfAwardFile);
          noaUrl = res.url;
          noaName = res.originalName || noticeOfAwardFile.name;
        } catch {
          noaName = noticeOfAwardFile.name;
        }
      }

      let powUrl = "";
      let powName = "";
      if (programOfWorksFile) {
        try {
          const res = await uploadDocumentFile(programOfWorksFile);
          powUrl = res.url;
          powName = res.originalName || programOfWorksFile.name;
        } catch {
          powName = programOfWorksFile.name;
        }
      }

      let photoUrl = "";
      if (sitePhoto) {
        try {
          const res = await uploadDocumentFile(sitePhoto);
          photoUrl = res.url;
        } catch {
          // If direct upload fails, preserve preview URL
          photoUrl = sitePhotoPreview || "";
        }
      }

      // Map UI status to standard ProjectStatus and LifecyclePhase
      let projectStatus: ProjectStatus = "Planned";
      let lifecyclePhase = "Planning";
      let numericProgress = 0;

      if (status === "Pre-construction") {
        projectStatus = "Planned";
        lifecyclePhase = "Procurement";
        numericProgress = 0;
      } else if (status === "Ongoing") {
        projectStatus = "Ongoing";
        lifecyclePhase = "Construction";
        numericProgress = 15;
      } else if (status === "Completed") {
        projectStatus = "Completed";
        lifecyclePhase = "Turnover";
        numericProgress = 100;
      }

      const generatedId = `lgu-proj-${Date.now()}`;
      const photosArray: ProjectPhoto[] = [];
      if (photoUrl) {
        photosArray.push({
          id: `site-photo-${Date.now()}`,
          url: photoUrl,
          caption: `Baseline Geotagged Site Photo - ${name.trim()}`,
          uploadedAt: now,
          kind: "site",
          lat: numLat,
          lon: numLon,
        });
      }

      const newProject: Project = {
        id: generatedId,
        name: name.trim(),
        modelType: "municipal",
        type: "Municipal Project",
        department: currentRole === "Engineer" ? "Engineering" : "MPDC",
        status: projectStatus,
        lifecyclePhase: lifecyclePhase as any,
        progress: numericProgress,
        location: {
          lat: numLat,
          lon: numLon,
        },
        barangay: barangay,
        description: description.trim() || `LGU Infrastructure project encoded for transparency: ${name.trim()}`,
        contractor: contractor.trim(),
        budgetTotal: numBudget,
        budgetSpent: 0,
        siteMarkerOnly: true,
        markerColor: status === "Completed" ? "#10b981" : status === "Ongoing" ? "#f5a623" : "#3b82f6",
        noticeOfAwardUrl: noaUrl || undefined,
        noticeOfAwardName: noaName || undefined,
        programOfWorksUrl: powUrl || undefined,
        programOfWorksName: powName || undefined,
        encodedBy: `${encodedByDisplay.username} (${encodedByDisplay.dept})`,
        biddingResults: {
          winningContractor: contractor.trim(),
          approvedBudget: numBudget,
        },
        photos: photosArray,
        milestones: [
          {
            id: `ms-bidding-${Date.now()}`,
            title: "Bidding & Awarding of Contract",
            targetDate: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
            completed: true,
          },
          {
            id: `ms-notice-${Date.now()}`,
            title: "Notice of Award & Notice to Proceed",
            targetDate: new Date().toISOString().slice(0, 10),
            completed: true,
          },
          {
            id: `ms-turnover-${Date.now()}`,
            title: "Final Inspection & Turnover",
            targetDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
            completed: status === "Completed",
          },
        ],
        issues: [],
        activityLog: [
          {
            at: now,
            message: `Project encoded by ${encodedByDisplay.username} (${encodedByDisplay.dept}) with approved budget ₱${numBudget.toLocaleString()}.`,
          },
        ],
        updatedAt: now,
        archivedAt: null,
      };

      // 2. Persist to Firestore
      await addProjectToFirestore(newProject);

      // 3. Sync with backend API
      createProject(newProject).catch((err) => {
        console.warn("[AddLguProjectModal] Backend API sync note:", err?.message);
      });

      // 4. Record Audit Trail
      void writeAudit({
        action: "project.create",
        category: "project",
        summary: `Encoded new LGU Project: "${newProject.name}" in Brgy. ${newProject.barangay} with Budget ₱${numBudget.toLocaleString()}`,
        entityType: "project",
        entityId: newProject.id,
        entityName: newProject.name,
      });

      setSubmitSuccess(true);
      setTimeout(() => {
        onSuccess?.(newProject);
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error("[AddLguProjectModal] Save failed:", err);
      setSubmitError(err.message || "Failed to save LGU project. Please verify inputs and network connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className={`lgu-modal-backdrop ${isModal ? "active" : "inline"}`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="lgu-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="lgu-modal-header">
          <div className="lgu-header-badge-row">
            <span className="lgu-seal-badge">
              <Landmark size={14} />
              <span>Municipality of Luisiana</span>
            </span>
            <span className="lgu-portal-tag">INFA-TRACK · Internal Staff</span>
          </div>
          <div className="lgu-header-title-row">
            <div>
              <h2 className="lgu-modal-title">Add LGU Project</h2>
              <p className="lgu-modal-subtitle">
                Encode municipal infrastructure projects for 2D/3D map pinning, procurement compliance, and public transparency.
              </p>
            </div>
            <button
              type="button"
              className="lgu-modal-close-btn"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Success Alert Banner */}
        {submitSuccess && (
          <div className="lgu-banner lgu-banner-success">
            <CheckCircle2 size={18} className="lgu-banner-icon" />
            <div>
              <strong>LGU Project Encoded Successfully!</strong>
              <p>The project record has been registered and synced with GIS map pinning.</p>
            </div>
          </div>
        )}

        {/* Error Alert Banner */}
        {submitError && (
          <div className="lgu-banner lgu-banner-error">
            <AlertCircle size={18} className="lgu-banner-icon" />
            <div>
              <strong>Attention Required:</strong>
              <p>{submitError}</p>
            </div>
          </div>
        )}

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="lgu-modal-form">
          <div className="lgu-sections-scrollable">
            {/* ══════════════════════════════════════════════════════════
                SECTION 1: PROJECT DETAILS
            ══════════════════════════════════════════════════════════ */}
            <div className="lgu-form-section">
              <div className="lgu-section-header">
                <div className="lgu-section-number">1</div>
                <div>
                  <h3 className="lgu-section-title">Project Details</h3>
                  <p className="lgu-section-desc">General identification and territorial jurisdiction</p>
                </div>
              </div>

              <div className="lgu-fields-stack">
                {/* Project Name */}
                <div className="lgu-field-group">
                  <label htmlFor="lgu-project-name" className="lgu-label">
                    Project Name <span className="lgu-required">*</span>
                  </label>
                  <div className="lgu-input-wrap">
                    <Building2 size={16} className="lgu-input-icon" />
                    <input
                      id="lgu-project-name"
                      type="text"
                      className={`lgu-input ${validationErrors.name ? "has-error" : ""}`}
                      placeholder="e.g., Construction of Two-Storey Evacuation Center & Disaster Facility"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (validationErrors.name) {
                          setValidationErrors((prev) => ({ ...prev, name: "" }));
                        }
                      }}
                      disabled={isSubmitting}
                    />
                  </div>
                  {validationErrors.name && (
                    <span className="lgu-field-error">{validationErrors.name}</span>
                  )}
                </div>

                {/* Barangay Selection */}
                <div className="lgu-field-group">
                  <div className="lgu-label-with-meta">
                    <label htmlFor="lgu-barangay-select" className="lgu-label">
                      Barangay <span className="lgu-required">*</span>
                    </label>
                    <span className="lgu-meta-pill">23 Official Barangays</span>
                  </div>
                  <div className="lgu-input-wrap">
                    <MapPin size={16} className="lgu-input-icon" />
                    <select
                      id="lgu-barangay-select"
                      className={`lgu-select ${validationErrors.barangay ? "has-error" : ""}`}
                      value={barangay}
                      onChange={(e) => {
                        setBarangay(e.target.value);
                        if (validationErrors.barangay) {
                          setValidationErrors((prev) => ({ ...prev, barangay: "" }));
                        }
                      }}
                      disabled={isSubmitting}
                    >
                      <option value="">— Select Barangay in Luisiana —</option>
                      {BARANGAY_LIST.map((brgy) => (
                        <option key={brgy} value={brgy}>
                          {brgy}
                        </option>
                      ))}
                    </select>
                  </div>
                  {validationErrors.barangay && (
                    <span className="lgu-field-error">{validationErrors.barangay}</span>
                  )}
                </div>

                {/* Project Description */}
                <div className="lgu-field-group">
                  <div className="lgu-label-with-meta">
                    <label htmlFor="lgu-description" className="lgu-label">
                      Project Description
                    </label>
                    <span className="lgu-char-counter">{description.length} characters</span>
                  </div>
                  <textarea
                    id="lgu-description"
                    rows={3}
                    className="lgu-textarea"
                    placeholder="Provide brief scope of work, project rationale, intended beneficiaries, and engineering specifications..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                SECTION 2: TRANSPARENCY & BIDDING RESULTS
            ══════════════════════════════════════════════════════════ */}
            <div className="lgu-form-section">
              <div className="lgu-section-header">
                <div className="lgu-section-number">2</div>
                <div>
                  <h3 className="lgu-section-title">Transparency & Bidding Results</h3>
                  <p className="lgu-section-desc">Public procurement disclosures compliant with RA 9184</p>
                </div>
              </div>

              <div className="lgu-fields-grid-2">
                {/* Winning Contractor */}
                <div className="lgu-field-group lgu-col-span-2">
                  <label htmlFor="lgu-contractor" className="lgu-label">
                    Winning Contractor <span className="lgu-required">*</span>
                  </label>
                  <div className="lgu-input-wrap">
                    <HardHat size={16} className="lgu-input-icon" />
                    <input
                      id="lgu-contractor"
                      type="text"
                      className={`lgu-input ${validationErrors.contractor ? "has-error" : ""}`}
                      placeholder="e.g., R.S. Bernardo Construction & Trading Corp."
                      value={contractor}
                      onChange={(e) => {
                        setContractor(e.target.value);
                        if (validationErrors.contractor) {
                          setValidationErrors((prev) => ({ ...prev, contractor: "" }));
                        }
                      }}
                      disabled={isSubmitting}
                    />
                  </div>
                  {validationErrors.contractor && (
                    <span className="lgu-field-error">{validationErrors.contractor}</span>
                  )}
                </div>

                {/* Approved Budget */}
                <div className="lgu-field-group">
                  <label htmlFor="lgu-budget" className="lgu-label">
                    Approved Budget (ABC / Contract) <span className="lgu-required">*</span>
                  </label>
                  <div className="lgu-input-wrap lgu-budget-wrap">
                    <span className="lgu-peso-prefix">₱</span>
                    <input
                      id="lgu-budget"
                      type="number"
                      min="0"
                      step="any"
                      className={`lgu-input lgu-budget-input ${validationErrors.budget ? "has-error" : ""}`}
                      placeholder="0.00"
                      value={budget}
                      onChange={(e) => {
                        setBudget(e.target.value);
                        if (validationErrors.budget) {
                          setValidationErrors((prev) => ({ ...prev, budget: "" }));
                        }
                      }}
                      disabled={isSubmitting}
                    />
                  </div>
                  {budget && !isNaN(parseFloat(budget)) && parseFloat(budget) > 0 ? (
                    <span className="lgu-budget-preview">
                      Formatted: <strong>{formatPeso(parseFloat(budget))}</strong>
                    </span>
                  ) : null}
                  {validationErrors.budget && (
                    <span className="lgu-field-error">{validationErrors.budget}</span>
                  )}
                </div>

                {/* Project Status */}
                <div className="lgu-field-group">
                  <label htmlFor="lgu-status" className="lgu-label">
                    Project Status <span className="lgu-required">*</span>
                  </label>
                  <div className="lgu-input-wrap">
                    <select
                      id="lgu-status"
                      className="lgu-select"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ProjectStatusOption)}
                      disabled={isSubmitting}
                    >
                      <option value="Pre-construction">Pre-construction</option>
                      <option value="Ongoing">Ongoing</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                  <div className="lgu-status-chip-row">
                    <span className={`lgu-status-pill ${status.toLowerCase()}`}>
                      {status === "Pre-construction" && "🔵 Pre-construction (Bidding / Award)"}
                      {status === "Ongoing" && "🟠 Ongoing (Active Construction)"}
                      {status === "Completed" && "🟢 Completed (Turnover / In-service)"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                SECTION 3: MEDIA & MAP PINNING
            ══════════════════════════════════════════════════════════ */}
            <div className="lgu-form-section">
              <div className="lgu-section-header">
                <div className="lgu-section-number">3</div>
                <div>
                  <h3 className="lgu-section-title">Media & Map Pinning</h3>
                  <p className="lgu-section-desc">Automated GPS georeferencing & compliance document uploads</p>
                </div>
              </div>

              <div className="lgu-fields-stack">
                {/* Geotagged Site Photo Upload Box */}
                <div className="lgu-field-group">
                  <div className="lgu-label-with-meta">
                    <label className="lgu-label">
                      Geotagged Site Photo Upload
                    </label>
                    <span className="lgu-meta-pill lgu-meta-pill-ai">
                      <Sparkles size={11} /> Auto EXIF & OCR
                    </span>
                  </div>

                  <p className="lgu-helper-text">
                    Upload photo to auto-extract GPS coordinates for 2D Map Pinning
                  </p>

                  <input
                    type="file"
                    ref={photoInputRef}
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handlePhotoSelect(file);
                    }}
                    disabled={isSubmitting || isExtractingGps}
                  />

                  {!sitePhotoPreview ? (
                    <div
                      className={`lgu-upload-dropzone ${isExtractingGps ? "is-extracting" : ""}`}
                      onClick={() => photoInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (file) void handlePhotoSelect(file);
                      }}
                    >
                      {isExtractingGps ? (
                        <div className="lgu-scanner-animation">
                          <RefreshCw size={28} className="lgu-spin-icon" />
                          <span className="lgu-scanner-text">Scanning image for EXIF & OCR GPS watermarks...</span>
                        </div>
                      ) : (
                        <div className="lgu-dropzone-content">
                          <div className="lgu-dropzone-icon-bubble">
                            <Camera size={24} />
                          </div>
                          <span className="lgu-dropzone-title">Click to browse or drag & drop site photo</span>
                          <span className="lgu-dropzone-sub">
                            Supports GPS Map Camera, SpotLens, NoteCam, Solocator, and standard mobile photos
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="lgu-photo-preview-card">
                      <div className="lgu-preview-img-container">
                        <img src={sitePhotoPreview} alt="Site preview" className="lgu-preview-img" />
                        {gpsExtracted && (
                          <span className="lgu-geotag-verified-badge">
                            <CheckCircle2 size={12} /> Geotagged
                          </span>
                        )}
                      </div>
                      <div className="lgu-preview-meta">
                        <div className="lgu-preview-name-row">
                          <strong className="lgu-preview-filename">{sitePhoto?.name}</strong>
                          <span className="lgu-preview-size">
                            {sitePhoto ? formatFileSize(sitePhoto.size) : ""}
                          </span>
                        </div>
                        {gpsExtractionMessage && (
                          <div className={`lgu-extraction-feedback ${gpsExtracted ? "success" : "info"}`}>
                            {gpsExtracted ? <CheckCircle2 size={14} /> : <Scan size={14} />}
                            <span>{gpsExtractionMessage}</span>
                          </div>
                        )}
                        <div className="lgu-preview-actions">
                          <button
                            type="button"
                            className="lgu-btn-pill lgu-btn-pill-subtle"
                            onClick={() => photoInputRef.current?.click()}
                            disabled={isSubmitting || isExtractingGps}
                          >
                            <RefreshCw size={12} /> Replace Photo
                          </button>
                          <button
                            type="button"
                            className="lgu-btn-pill lgu-btn-pill-danger"
                            onClick={handleRemovePhoto}
                            disabled={isSubmitting}
                          >
                            <Trash2 size={12} /> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Map Coordinates: Latitude & Longitude (Read-only inputs with auto-fill visual indicators) */}
                <div className="lgu-field-group">
                  <div className="lgu-coords-header">
                    <label className="lgu-label">Map Coordinates</label>
                    <div className="lgu-coords-header-actions">
                      {gpsExtracted ? (
                        <span className="lgu-autofill-badge">
                          <Sparkles size={11} /> Auto-filled from uploaded photo ({gpsExtractionSource?.toUpperCase()})
                        </span>
                      ) : (
                        <span className="lgu-autofill-badge lgu-waiting">
                          <Lock size={11} /> Waiting for geotagged photo
                        </span>
                      )}
                      <button
                        type="button"
                        className="lgu-toggle-manual-btn"
                        onClick={() => setIsManualCoords(!isManualCoords)}
                        title="Toggle manual coordinate override"
                      >
                        {isManualCoords ? <Lock size={12} /> : <Unlock size={12} />}
                        <span>{isManualCoords ? "Lock Inputs" : "Override manually"}</span>
                      </button>
                    </div>
                  </div>

                  <div className="lgu-coords-grid">
                    {/* Latitude */}
                    <div className="lgu-coord-box">
                      <div className="lgu-coord-box-label">
                        <span>Latitude (Lat)</span>
                        {!isManualCoords && <Lock size={11} className="lgu-lock-icon" />}
                      </div>
                      <input
                        type="text"
                        className={`lgu-input lgu-coord-input ${gpsExtracted ? "is-autofilled" : ""} ${validationErrors.coordinates ? "has-error" : ""}`}
                        placeholder="e.g., 14.185435"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                        readOnly={!isManualCoords}
                        disabled={isSubmitting}
                      />
                    </div>

                    {/* Longitude */}
                    <div className="lgu-coord-box">
                      <div className="lgu-coord-box-label">
                        <span>Longitude (Lon)</span>
                        {!isManualCoords && <Lock size={11} className="lgu-lock-icon" />}
                      </div>
                      <input
                        type="text"
                        className={`lgu-input lgu-coord-input ${gpsExtracted ? "is-autofilled" : ""} ${validationErrors.coordinates ? "has-error" : ""}`}
                        placeholder="e.g., 121.509513"
                        value={lon}
                        onChange={(e) => setLon(e.target.value)}
                        readOnly={!isManualCoords}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  {validationErrors.coordinates && (
                    <span className="lgu-field-error">{validationErrors.coordinates}</span>
                  )}
                </div>

                {/* Document Uploads: Notice of Award (NOA) and Program of Works (POW) */}
                <div className="lgu-field-group">
                  <label className="lgu-label">Procurement & Engineering Documents</label>
                  <p className="lgu-sublabel-note">
                    Attach official documentation for DILG audit compliance and public transparency portal.
                  </p>

                  <div className="lgu-docs-grid">
                    {/* Notice of Award File Input */}
                    <div className="lgu-doc-card">
                      <input
                        type="file"
                        ref={noaInputRef}
                        accept=".pdf,.png,.jpg,.jpeg,.docx"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setNoticeOfAwardFile(file);
                        }}
                        disabled={isSubmitting}
                      />

                      <div className="lgu-doc-card-header">
                        <FileCheck2 size={16} className="lgu-doc-icon" />
                        <div>
                          <strong className="lgu-doc-title">Notice of Award (NOA)</strong>
                          <span className="lgu-doc-req">Signed BAC Resolution / NOA</span>
                        </div>
                      </div>

                      {!noticeOfAwardFile ? (
                        <button
                          type="button"
                          className="lgu-doc-attach-btn"
                          onClick={() => noaInputRef.current?.click()}
                          disabled={isSubmitting}
                        >
                          <UploadCloud size={14} />
                          <span>Attach Notice of Award</span>
                        </button>
                      ) : (
                        <div className="lgu-doc-selected-chip">
                          <FileText size={14} className="lgu-file-icon" />
                          <div className="lgu-doc-chip-info">
                            <span className="lgu-doc-chip-name">{noticeOfAwardFile.name}</span>
                            <span className="lgu-doc-chip-size">{formatFileSize(noticeOfAwardFile.size)}</span>
                          </div>
                          <button
                            type="button"
                            className="lgu-doc-remove-btn"
                            onClick={() => {
                              setNoticeOfAwardFile(null);
                              if (noaInputRef.current) noaInputRef.current.value = "";
                            }}
                            title="Remove file"
                            disabled={isSubmitting}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Program of Works (POW) File Input */}
                    <div className="lgu-doc-card">
                      <input
                        type="file"
                        ref={powInputRef}
                        accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setProgramOfWorksFile(file);
                        }}
                        disabled={isSubmitting}
                      />

                      <div className="lgu-doc-card-header">
                        <FileText size={16} className="lgu-doc-icon" />
                        <div>
                          <strong className="lgu-doc-title">Program of Works (POW)</strong>
                          <span className="lgu-doc-req">Itemized Detailed Estimates & Timeline</span>
                        </div>
                      </div>

                      {!programOfWorksFile ? (
                        <button
                          type="button"
                          className="lgu-doc-attach-btn"
                          onClick={() => powInputRef.current?.click()}
                          disabled={isSubmitting}
                        >
                          <UploadCloud size={14} />
                          <span>Attach Program of Works</span>
                        </button>
                      ) : (
                        <div className="lgu-doc-selected-chip">
                          <FileText size={14} className="lgu-file-icon" />
                          <div className="lgu-doc-chip-info">
                            <span className="lgu-doc-chip-name">{programOfWorksFile.name}</span>
                            <span className="lgu-doc-chip-size">{formatFileSize(programOfWorksFile.size)}</span>
                          </div>
                          <button
                            type="button"
                            className="lgu-doc-remove-btn"
                            onClick={() => {
                              setProgramOfWorksFile(null);
                              if (powInputRef.current) powInputRef.current.value = "";
                            }}
                            title="Remove file"
                            disabled={isSubmitting}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════
              SECTION 4: FORM ACTIONS & AUDIT TRAIL
          ══════════════════════════════════════════════════════════ */}
          <div className="lgu-modal-footer">
            {/* Subtle Audit Trail Label */}
            <div className="lgu-audit-trail-label">
              <ShieldCheck size={13} className="lgu-audit-icon" />
              <span>
                Encoded by: <strong>{encodedByDisplay.username}</strong> ({encodedByDisplay.dept})
              </span>
            </div>

            {/* Buttons: Cancel & Primary Save */}
            <div className="lgu-action-buttons">
              <button
                type="button"
                className="lgu-btn lgu-btn-cancel"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="lgu-btn lgu-btn-primary"
                disabled={isSubmitting || submitSuccess}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={15} className="lgu-spin-icon" />
                    <span>Saving LGU Project...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Save LGU Project</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  if (isModal && typeof document !== "undefined") {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

export default AddLguProjectModal;
