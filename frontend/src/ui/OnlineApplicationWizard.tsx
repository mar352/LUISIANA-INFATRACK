import { useState, useMemo, type ChangeEvent } from "react";
import { BARANGAY_LIST } from "../types";
import type { CitizenServiceType, CitizenUploadedFile } from "../types";
import {
  MPDC_CHARTER_SERVICES,
  getCharterService,
  validateFileSizeAndFormat,
  type CharterRequirementSpec,
} from "../lib/mpdc-charter";
import {
  uploadCitizenDocument,
  submitCitizenApplication,
  trackCitizenApplication,
} from "../lib/api";
import "./OnlineApplicationWizard.css";

type WizardStep = 1 | 2 | 3 | 4;

type Props = {
  onBack?: () => void;
  onViewMap?: () => void;
};

/* ── SVG Icons ── */
const IconEdit = ({ size = 15, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 6 }}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const IconSearch = ({ size = 15, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 6 }}>
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconClock = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 5 }}>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const IconUpload = ({ size = 22, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const IconPin = ({ size = 13, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 4 }}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

const IconDocument = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 5 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

const IconBuilding = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 5 }}>
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
    <line x1="9" y1="22" x2="9" y2="22.01"/>
    <line x1="15" y1="22" x2="15" y2="22.01"/>
    <line x1="9" y1="6" x2="9" y2="6.01"/>
    <line x1="15" y1="6" x2="15" y2="6.01"/>
    <line x1="9" y1="10" x2="9" y2="10.01"/>
    <line x1="15" y1="10" x2="15" y2="10.01"/>
    <line x1="9" y1="14" x2="9" y2="14.01"/>
    <line x1="15" y1="14" x2="15" y2="14.01"/>
    <line x1="9" y1="18" x2="9" y2="18.01"/>
    <line x1="15" y1="18" x2="15" y2="18.01"/>
  </svg>
);

const IconMap = ({ size = 15, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 6 }}>
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
    <line x1="8" y1="2" x2="8" y2="18"/>
    <line x1="16" y1="6" x2="16" y2="22"/>
  </svg>
);

const IconCheckCircle = ({ size = 48, color = "#10b981" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const IconInfo = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 5 }}>
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

const IconAlert = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 5 }}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

export default function OnlineApplicationWizard({ onBack, onViewMap }: Props) {
  const [mode, setMode] = useState<"apply" | "track">("apply");
  const [step, setStep] = useState<WizardStep>(1);
  const serviceType: CitizenServiceType = "zoning_certificate";

  // Applicant info
  const [fullName, setFullName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [address, setAddress] = useState("");
  const [barangay, setBarangay] = useState("Poblacion Zone I");

  // Lot & Project info
  const [tctNo, setTctNo] = useState("");
  const [taxDecNo, setTaxDecNo] = useState("");
  const [lotOwner, setLotOwner] = useState("");
  const [isApplicantOwner, setIsApplicantOwner] = useState(true);
  const [proposedBuildingType, setProposedBuildingType] = useState("Residential");
  const [lotAreaSqM, setLotAreaSqM] = useState<number | "">("");
  const [lotLocationDescription, setLotLocationDescription] = useState("");
  const [notes] = useState("");

  // Private Engineer info
  const [engineerName, setEngineerName] = useState("");
  const [engineerPrc, setEngineerPrc] = useState("");
  const [engineerContact, setEngineerContact] = useState("");
  const [contractorName, setContractorName] = useState("");

  // Uploaded files mapped by requirement id
  const [uploadsMap, setUploadsMap] = useState<Record<string, CitizenUploadedFile[]>>({});
  const [uploadingReqId, setUploadingReqId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Submitting
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submittedApp, setSubmittedApp] = useState<any | null>(null);

  // Tracking tab
  const [trackQuery, setTrackQuery] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackedResult, setTrackedResult] = useState<any | null>(null);
  const [trackError, setTrackError] = useState("");

  // Undertaking checkbox
  const [undertakingAgreed, setUndertakingAgreed] = useState(false);

  const activeCharter = useMemo(() => getCharterService(serviceType), [serviceType]);

  // Handle file selection and upload
  const handleFileSelect = async (
    reqSpec: CharterRequirementSpec,
    e: ChangeEvent<HTMLInputElement>,
    photoTag?: string
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setValidationErrors((prev) => ({ ...prev, [reqSpec.id]: "" }));
    setUploadingReqId(reqSpec.id);

    try {
      const newFiles: CitizenUploadedFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const validation = validateFileSizeAndFormat(file, reqSpec);
        if (!validation.valid) {
          setValidationErrors((prev) => ({
            ...prev,
            [reqSpec.id]: validation.error || "File invalid.",
          }));
          continue;
        }

        const res = await uploadCitizenDocument(file);
        newFiles.push({
          url: res.url,
          filename: res.filename,
          originalName: res.originalName,
          size: res.size,
          mimeType: res.mimeType,
          uploadedAt: new Date().toISOString(),
          tag: photoTag || undefined,
        });
      }

      if (newFiles.length > 0) {
        setUploadsMap((prev) => ({
          ...prev,
          [reqSpec.id]: reqSpec.multiple ? [...(prev[reqSpec.id] || []), ...newFiles] : newFiles,
        }));
      }
    } catch {
      setValidationErrors((prev) => ({
        ...prev,
        [reqSpec.id]: "Hindi ma-upload ang file. Pakisubukang muli.",
      }));
    } finally {
      setUploadingReqId(null);
      e.target.value = "";
    }
  };

  // Remove uploaded file
  const removeUpload = (reqId: string, index: number) => {
    setUploadsMap((prev) => {
      const current = prev[reqId] || [];
      const updated = current.filter((_, idx) => idx !== index);
      return { ...prev, [reqId]: updated };
    });
  };

  // Step 1 validation (Applicant & Property info)
  const handleNextFromStep1 = () => {
    if (!fullName.trim()) {
      alert("Pakilagay ang inyong Buong Pangalan.");
      return;
    }
    if (!contactPhone.trim()) {
      alert("Pakilagay ang inyong Contact Number para sa updates.");
      return;
    }
    if (!isApplicantOwner && !lotOwner.trim()) {
      alert("Pakilagay ang Pangalan ng Nakarehistrong May-ari ng Lupa.");
      return;
    }
    setStep(2);
  };

  // Step 2 validation (Requirements Checklist)
  const handleNextFromStep2 = () => {
    const missing: string[] = [];
    activeCharter.requirements.forEach((req) => {
      if (req.required) {
        if (req.id === "deed_consent" && isApplicantOwner) {
          return;
        }
        const uploads = uploadsMap[req.id] || [];
        if (uploads.length === 0) {
          missing.push(req.label);
        }
      }
    });

    if (missing.length > 0) {
      alert(
        `Kailangan pong i-upload ang mga sumusunod na kailangang dokumento bago magpatuloy:\n\n• ${missing.join(
          "\n• "
        )}`
      );
      return;
    }
    setStep(3);
  };

  // Submit Application
  const handleSubmit = async () => {
    if (!undertakingAgreed) {
      alert("Paki-check po ang Affidavit of Undertaking bago i-sumite.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const payload = {
        serviceType,
        applicant: {
          fullName: fullName.trim(),
          contactPhone: contactPhone.trim(),
          contactEmail: contactEmail.trim() || undefined,
          address: address.trim(),
          barangay,
        },
        property: {
          tctNo: tctNo.trim() || undefined,
          taxDecNo: taxDecNo.trim() || undefined,
          lotOwner: (isApplicantOwner ? fullName : lotOwner).trim(),
          isApplicantOwner,
          proposedBuildingType,
          lotAreaSqM: typeof lotAreaSqM === "number" ? lotAreaSqM : undefined,
          locationDescription: lotLocationDescription.trim() || undefined,
        },
        privateEngineer: engineerName.trim()
          ? {
              fullName: engineerName.trim(),
              prcNo: engineerPrc.trim() || undefined,
              contact: engineerContact.trim() || undefined,
              contractor: contractorName.trim() || undefined,
            }
          : undefined,
        uploads: {
          tctTaxDec: uploadsMap["tct_tax_dec"] || [],
          deedConsent: uploadsMap["deed_consent"] || [],
          taxReceipt: uploadsMap["tax_receipt"] || [],
          barangayClearance: uploadsMap["brgy_clearance"] || [],
          meralcoPlo: uploadsMap["meralco_plo"] || [],
          photoDocumentation: uploadsMap["photo_documentation"] || [],
          denrLetter: uploadsMap["denr_letter"] || [],
          studentIdLetter: uploadsMap["student_id_letter"] || [],
        },
        notes,
      };

      const res = await submitCitizenApplication(payload);
      if (res.ok && res.application) {
        setSubmittedApp(res.application);
        setStep(4);
      } else {
        throw new Error("Nagkaroon ng problema sa pagsusumite.");
      }
    } catch (err: any) {
      setSubmitError(err?.message || "Submission failed. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  // Track application
  const handleTrack = async () => {
    if (!trackQuery.trim()) return;
    setTrackingLoading(true);
    setTrackError("");
    setTrackedResult(null);

    try {
      const res = await trackCitizenApplication(trackQuery.trim());
      if (res) {
        setTrackedResult(res);
      } else {
        setTrackError("Walang natagpuang aplikasyon sa Tracking Number na ito. Pakitiyak kung tama ang na-type.");
      }
    } catch {
      setTrackError("Hindi ma-access ang server. Pakisubukang muli mamaya.");
    } finally {
      setTrackingLoading(false);
    }
  };

  return (
    <div className="cz-wizard-root">
      {/* Top Header */}
      <header className="cz-wizard-header">
        <div className="cz-header-brand">
          <img
            src="/logo.png"
            alt="Bayan ng Luisiana Seal"
            className="cz-header-seal"
            width={52}
            height={52}
            style={{
              width: 52,
              height: 52,
              maxWidth: 52,
              maxHeight: 52,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid #ffc107",
              flexShrink: 0,
              boxShadow: "0 0 14px rgba(255, 193, 7, 0.45)",
            }}
          />
          <div>
            <div className="cz-header-sub">Bayan ng Luisiana · Lalawigan ng Laguna</div>
            <h1 className="cz-header-title">
              Office of the Municipal Planning and Development (MPDC)
            </h1>
            <div className="cz-header-badge">Zoning Certificate Online Application (Service #2)</div>
          </div>
        </div>
        <div className="cz-header-actions">
          <div className="cz-nav-toggle">
            <button
              type="button"
              className={`cz-toggle-btn ${mode === "apply" ? "active" : ""}`}
              onClick={() => {
                setMode("apply");
                if (step === 4) setStep(1);
              }}
            >
              <IconEdit size={14} color={mode === "apply" ? "#151c28" : "currentColor"} />
              Mag-apply Online
            </button>
            <button
              type="button"
              className={`cz-toggle-btn ${mode === "track" ? "active" : ""}`}
              onClick={() => setMode("track")}
            >
              <IconSearch size={14} color={mode === "track" ? "#151c28" : "currentColor"} />
              I-track ang Aplikasyon
            </button>
          </div>
          {onBack && (
            <button type="button" className="cz-back-btn" onClick={onBack}>
              ← Bumalik
            </button>
          )}
        </div>
      </header>

      {/* TRACKING MODE */}
      {mode === "track" && (
        <div className="cz-track-container">
          <div className="cz-card cz-track-card">
            <h2>I-track ang Katayuan ng Inyong Aplikasyon</h2>
            <p className="cz-muted">
              Ilagay ang inyong <strong>Tracking Reference Number</strong> (hal.{" "}
              <code>LUIS-ZC-2026-1234</code>) upang makita ang kasalukuyang estado ng pagsusuri.
            </p>
            <div className="cz-track-input-row">
              <input
                type="text"
                placeholder="Hal. LUIS-ZC-2026-0842"
                value={trackQuery}
                onChange={(e) => setTrackQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTrack()}
              />
              <button
                type="button"
                className="cz-primary-btn"
                onClick={handleTrack}
                disabled={trackingLoading || !trackQuery.trim()}
              >
                {trackingLoading ? "Naghahanap…" : "Hanapin"}
              </button>
            </div>

            {trackError && <div className="cz-banner err"><IconAlert size={14} /> {trackError}</div>}

            {trackedResult && (
              <div className="cz-track-result-box">
                <div className="cz-result-header">
                  <div>
                    <span className="cz-tag-ref">{trackedResult.trackingNumber}</span>
                    <h3>Securing Zoning Certificate for Building Construction (Exemption)</h3>
                  </div>
                  <span className={`cz-status-pill ${trackedResult.status}`}>
                    {trackedResult.status === "approved"
                      ? "Approved / Ready for Issuance"
                      : trackedResult.status === "ocular_inspection"
                      ? "Ocular Inspection"
                      : trackedResult.status === "in_review"
                      ? "In Review"
                      : "Submitted / Verification"}
                  </span>
                </div>

                <div className="cz-grid-2">
                  <div>
                    <label>Pangalan ng Aplikante</label>
                    <p>
                      <strong>{trackedResult.applicant?.fullName}</strong>
                    </p>
                  </div>
                  <div>
                    <label>Barangay</label>
                    <p>{trackedResult.applicant?.barangay}</p>
                  </div>
                  <div>
                    <label>Petsa ng Pagsusumite</label>
                    <p>{new Date(trackedResult.createdAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <label>Citizen's Charter SLA</label>
                    <p>1 Day 12 Minutes · Libre (₱0.00)</p>
                  </div>
                </div>

                {/* Progress Timeline */}
                <div className="cz-timeline-wrap">
                  <h4>Timeline ng Proseso (Citizen's Charter Standard):</h4>
                  <div className="cz-timeline">
                    <div className="cz-t-step done">
                      <div className="cz-t-dot">1</div>
                      <div className="cz-t-content">
                        <strong>Step 1: Accomplishment & Completeness Verification</strong>
                        <p>10 mins · Bon Ryan P. Pedron (Admin Aide)</p>
                        <span className="cz-t-time">
                          {new Date(trackedResult.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div
                      className={`cz-t-step ${
                        trackedResult.status === "in_review" ||
                        trackedResult.status === "ocular_inspection" ||
                        trackedResult.status === "approved"
                          ? "done"
                          : "pending"
                      }`}
                    >
                      <div className="cz-t-dot">2</div>
                      <div className="cz-t-content">
                        <strong>Step 2: Review, Permit Preparation & Ocular Inspection</strong>
                        <p>
                          1 Day · Engr. Mario S. Baldovino (MPDC), Edward B. Romulo, EnP. (Zoning
                          Officer), Randy A. Balasabas
                        </p>
                      </div>
                    </div>
                    <div
                      className={`cz-t-step ${
                        trackedResult.status === "approved" ? "done" : "pending"
                      }`}
                    >
                      <div className="cz-t-dot">3</div>
                      <div className="cz-t-content">
                        <strong>Step 3: Issuance of Certificate / Location Clearance</strong>
                        <p>2 mins · Bon Ryan P. Pedron (Admin Aide)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* APPLICATION WIZARD MODE */}
      {mode === "apply" && (
        <div className="cz-wizard-container">
          {/* Progress Bar */}
          {step < 4 && (
            <div className="cz-steps-nav">
              <div className={`cz-step-item ${step >= 1 ? "active" : ""}`}>
                <span className="cz-step-num">1</span>
                <span className="cz-step-text">Impormasyon</span>
              </div>
              <div className="cz-step-line" />
              <div className={`cz-step-item ${step >= 2 ? "active" : ""}`}>
                <span className="cz-step-num">2</span>
                <span className="cz-step-text">Digital Requirements</span>
              </div>
              <div className="cz-step-line" />
              <div className={`cz-step-item ${step >= 3 ? "active" : ""}`}>
                <span className="cz-step-num">3</span>
                <span className="cz-step-text">Review & Submit</span>
              </div>
            </div>
          )}

          {/* STEP 1: APPLICANT & PROPERTY INFO */}
          {step === 1 && (
            <div className="cz-card">
              <div className="cz-card-header">
                <div>
                  <h2>Impormasyon ng Aplikante at Lokasyon ng Proyekto</h2>
                  <p className="cz-muted" style={{ margin: "4px 0 0" }}>
                    Ayon sa <strong>Citizen's Charter Service #2</strong> ng MPDC (1 Day 12 Mins · Libre / ₱0.00).
                  </p>
                </div>
                <span className="cz-badge-service">Zoning Certificate</span>
              </div>

              <div className="cz-form-section">
                <h3>1. Personal na Impormasyon ng Aplikante</h3>
                <div className="cz-grid-2">
                  <div className="cz-field">
                    <label>
                      Buong Pangalan ng Aplikante <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Hal. Juan Dela Cruz"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="cz-field">
                    <label>
                      Aktibong Contact Number (Cellphone) <span className="req">*</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="Hal. 0917-123-4567"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>
                  <div className="cz-field">
                    <label>Email Address (Opsyonal)</label>
                    <input
                      type="email"
                      placeholder="Hal. juandelacruz@gmail.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>
                  <div className="cz-field">
                    <label>
                      Barangay sa Luisiana <span className="req">*</span>
                    </label>
                    <select
                      value={barangay}
                      onChange={(e) => setBarangay(e.target.value)}
                    >
                      {BARANGAY_LIST.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="cz-field full">
                    <label>Tirahan / Residential Address</label>
                    <input
                      type="text"
                      placeholder="Purok / Street, Barangay, Luisiana, Laguna"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="cz-form-section">
                <h3>2. Detalye ng Lupa at Ipanapanukalang Konstruksyon</h3>
                <div className="cz-grid-2">
                  <div className="cz-field">
                    <label>Ikaw ba ang Rehistradong May-ari ng Lupa?</label>
                    <div className="cz-radio-group">
                      <label className="cz-radio">
                        <input
                          type="radio"
                          name="ownerStatus"
                          checked={isApplicantOwner}
                          onChange={() => setIsApplicantOwner(true)}
                        />
                        Oo, nakapangalan sa akin
                      </label>
                      <label className="cz-radio">
                        <input
                          type="radio"
                          name="ownerStatus"
                          checked={!isApplicantOwner}
                          onChange={() => setIsApplicantOwner(false)}
                        />
                        Hindi (May Deed of Sale / Lease / Consent)
                      </label>
                    </div>
                  </div>

                  {!isApplicantOwner && (
                    <div className="cz-field">
                      <label>
                        Pangalan ng Nakarehistrong May-ari <span className="req">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Pangalan ayon sa TCT/Tax Declaration"
                        value={lotOwner}
                        onChange={(e) => setLotOwner(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="cz-field">
                    <label>Tax Declaration Number</label>
                    <input
                      type="text"
                      placeholder="Hal. TD No. 2024-00123"
                      value={taxDecNo}
                      onChange={(e) => setTaxDecNo(e.target.value)}
                    />
                  </div>

                  <div className="cz-field">
                    <label>TCT / Oct No. (Kung may Titulo)</label>
                    <input
                      type="text"
                      placeholder="Hal. TCT No. T-123456"
                      value={tctNo}
                      onChange={(e) => setTctNo(e.target.value)}
                    />
                  </div>

                  <div className="cz-field">
                    <label>Uri ng Ipanapanukalang Gusali / Gamit</label>
                    <select
                      value={proposedBuildingType}
                      onChange={(e) => setProposedBuildingType(e.target.value)}
                    >
                      <option value="Residential">Residential (Pabahay)</option>
                      <option value="Commercial">Commercial (Tindahan / Negosyo)</option>
                      <option value="Agricultural">Agricultural (Kamalig / Poultry)</option>
                      <option value="Institutional">Institutional (Simbahan / Pasilidad)</option>
                      <option value="Industrial">Industrial</option>
                    </select>
                  </div>

                  <div className="cz-field">
                    <label>Sukat ng Lupa / Floor Area (sq.m.)</label>
                    <input
                      type="number"
                      placeholder="Hal. 120"
                      value={lotAreaSqM}
                      onChange={(e) =>
                        setLotAreaSqM(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </div>

                  <div className="cz-field full">
                    <label>Deskripsyon ng Lokasyon / Landmark</label>
                    <input
                      type="text"
                      placeholder="Hal. Katabi ng barangay chapel, tapat ng elementary school"
                      value={lotLocationDescription}
                      onChange={(e) => setLotLocationDescription(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="cz-form-section">
                <h3>3. Nakatalagang Pribadong Inhinyero / Arkitekto (Design Professional)</h3>
                <p className="cz-muted" style={{ marginBottom: 12 }}>
                  Impormasyon ng lisensyadong Civil Engineer o Arkitekto na pumirma at nag-selyo sa inyong mga plano at structural computations.
                </p>
                <div className="cz-grid-2">
                  <div className="cz-field">
                    <label>Pangalan ng Inhinyero / Arkitekto</label>
                    <input
                      type="text"
                      placeholder="Hal. Engr. Pedro Reyes, CE / Arch. Maria Santos"
                      value={engineerName}
                      onChange={(e) => setEngineerName(e.target.value)}
                    />
                  </div>
                  <div className="cz-field">
                    <label>PRC License No. & PTR No.</label>
                    <input
                      type="text"
                      placeholder="Hal. PRC Lic. #0184920 · PTR #2026-9812"
                      value={engineerPrc}
                      onChange={(e) => setEngineerPrc(e.target.value)}
                    />
                  </div>
                  <div className="cz-field">
                    <label>Contact Number / Email ng Inhinyero</label>
                    <input
                      type="text"
                      placeholder="Hal. 0917-123-4567 / engr.reyes@gmail.com"
                      value={engineerContact}
                      onChange={(e) => setEngineerContact(e.target.value)}
                    />
                  </div>
                  <div className="cz-field">
                    <label>Kontratista / In-Charge of Construction</label>
                    <input
                      type="text"
                      placeholder="Pangalan ng Construction Company o Foreman"
                      value={contractorName}
                      onChange={(e) => setContractorName(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="cz-step-actions">
                <button
                  type="button"
                  className="cz-primary-btn"
                  onClick={handleNextFromStep1}
                >
                  Magpatuloy sa Digital Requirements Checklist →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: DIGITAL REQUIREMENT CHECKLIST & UPLOADS */}
          {step === 2 && (
            <div className="cz-card">
              <div className="cz-card-header">
                <div>
                  <h2>Digital Requirement Checklist & Uploads</h2>
                  <p className="cz-muted">
                    I-upload ang malinaw na kopya (<strong>PDF, JPG, PNG, WEBP</strong> hanggang{" "}
                    <strong>15MB</strong> bawat file).
                  </p>
                </div>
                <span className="cz-badge-service">{activeCharter.shortTitle}</span>
              </div>

              <div className="cz-requirements-list">
                {activeCharter.requirements.map((req, idx) => {
                  const uploadedFiles = uploadsMap[req.id] || [];
                  const isUploading = uploadingReqId === req.id;
                  const errorMsg = validationErrors[req.id];

                  // If deed_consent is optional and applicant is owner, highlight as conditional
                  const isCond = req.id === "deed_consent" && isApplicantOwner;

                  return (
                    <div
                      key={req.id}
                      className={`cz-req-card ${uploadedFiles.length > 0 ? "has-files" : ""} ${
                        isCond ? "conditional-req" : ""
                      }`}
                    >
                      <div className="cz-req-header">
                        <div className="cz-req-title-wrap">
                          <span className="cz-req-num">{idx + 1}</span>
                          <div>
                            <h4>
                              {req.label}{" "}
                              {req.required && !isCond ? (
                                <span className="req">* (Required)</span>
                              ) : (
                                <span className="opt">(Opsyonal / Kung angkop)</span>
                              )}
                            </h4>
                            <span className="cz-where-tag">
                              <IconPin size={13} /> Saan Kukunin: <strong>{req.whereToSecure}</strong>
                            </span>
                          </div>
                        </div>
                        <div className="cz-req-status-pill">
                          {uploadedFiles.length > 0 ? (
                            <span className="pill-ok">{uploadedFiles.length} uploaded</span>
                          ) : req.required && !isCond ? (
                            <span className="pill-pending">Kailangan</span>
                          ) : (
                            <span className="pill-opt">Opsyonal</span>
                          )}
                        </div>
                      </div>

                      {req.notes && <p className="cz-req-notes"><IconInfo size={13} /> {req.notes}</p>}

                      {/* File Dropzone */}
                      <div className="cz-dropzone">
                        <label className="cz-file-label">
                          <input
                            type="file"
                            accept={req.acceptTypes}
                            multiple={req.multiple}
                            disabled={isUploading}
                            onChange={(e) => handleFileSelect(req, e)}
                          />
                          <div className="cz-dropzone-inner">
                            <span className="cz-upload-icon"><IconUpload size={24} color="#ffc107" /></span>
                            <div>
                              <strong>{isUploading ? "Nag-a-upload…" : "Pumili ng file o i-drag dito"}</strong>
                              <span className="cz-formats-hint">
                                PDF, JPG, PNG, o WEBP (Hanggang {req.maxSizeMb}MB)
                              </span>
                            </div>
                          </div>
                        </label>
                      </div>

                      {errorMsg && <div className="cz-field-err"><IconAlert size={14} /> {errorMsg}</div>}

                      {/* Uploaded Files List */}
                      {uploadedFiles.length > 0 && (
                        <div className="cz-uploaded-chips">
                          {uploadedFiles.map((f, fIdx) => (
                            <div key={f.url || fIdx} className="cz-file-chip">
                              <span className="cz-chip-name" title={f.originalName}>
                                <IconDocument size={13} /> {f.originalName} ({(f.size / (1024 * 1024)).toFixed(2)}MB)
                              </span>
                              <button
                                type="button"
                                className="cz-chip-del"
                                title="Alisin"
                                onClick={() => removeUpload(req.id, fIdx)}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="cz-step-actions between">
                <button
                  type="button"
                  className="cz-secondary-btn"
                  onClick={() => setStep(1)}
                >
                  ← Bumalik sa Impormasyon
                </button>
                <button
                  type="button"
                  className="cz-primary-btn"
                  onClick={handleNextFromStep2}
                >
                  Magpatuloy sa Review & Undertaking →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & UNDERTAKING */}
          {step === 3 && (
            <div className="cz-card">
              <div className="cz-card-header">
                <h2>Review ng Aplikasyon at Affidavit of Undertaking</h2>
                <span className="cz-badge-service">{activeCharter.shortTitle}</span>
              </div>

              <div className="cz-summary-box">
                <h3>Buod ng Isinumite</h3>
                <div className="cz-grid-2">
                  <div>
                    <label>Aplikante</label>
                    <p>
                      <strong>{fullName}</strong> ({contactPhone})
                    </p>
                  </div>
                  <div>
                    <label>Lokasyon sa Luisiana</label>
                    <p>
                      {address ? `${address}, ` : ""}
                      {barangay}
                    </p>
                  </div>
                  <div>
                    <label>Gamit ng Gusali</label>
                    <p>{proposedBuildingType}</p>
                  </div>
                  <div>
                    <label>Detalye ng Lupa</label>
                    <p>
                      Tax Dec: {taxDecNo || "—"} · TCT: {tctNo || "—"}
                    </p>
                  </div>
                </div>

                <div className="cz-summary-files">
                  <h4>Mga Isinumiteng Digital Attachment:</h4>
                  <ul>
                    {Object.entries(uploadsMap).map(([reqId, files]) => {
                      const reqSpec = activeCharter.requirements.find((r) => r.id === reqId);
                      if (!files || files.length === 0) return null;
                      return (
                        <li key={reqId}>
                          <strong>{reqSpec?.label || reqId}:</strong>{" "}
                          {files.map((f) => f.originalName).join(", ")}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* Citizen Charter SLA Banner */}
              <div className="cz-sla-card">
                <div className="cz-sla-header">
                  <span><IconBuilding size={14} /> Opisina: <strong>{activeCharter.office}</strong></span>
                  <span><IconClock size={14} /> Standard Turnaround: <strong>{activeCharter.totalTime}</strong></span>
                  <span>Bayad: <strong>LIBRE / ₱0.00</strong></span>
                </div>
                <div className="cz-sla-officers">
                  <span>
                    Nakatalagang Kawani:{" "}
                    <strong>
                      Bon Ryan P. Pedron (Admin Aide), Edward B. Romulo, EnP. (Zoning Officer), Engr.
                      Mario S. Baldovino (MPDC)
                    </strong>
                  </span>
                </div>
              </div>

              {/* Undertaking Agreement */}
              <div className="cz-undertaking-box">
                <label className="cz-check-label">
                  <input
                    type="checkbox"
                    checked={undertakingAgreed}
                    onChange={(e) => setUndertakingAgreed(e.target.checked)}
                  />
                  <span>
                    <strong>Pahayag ng Katapatan (Affidavit of Undertaking):</strong> Pinatutunayan
                    ko na ang lahat ng impormasyon at dokumentong aking isinumite ay totoo,
                    kumpleto, at wasto. Nauunawaan ko na ang anumang maling pahayag ay maaaring
                    maging sanhi ng pagpapawalang-bisa sa aking aplikasyon.
                  </span>
                </label>
              </div>

              {submitError && <div className="cz-banner err"><IconAlert size={14} /> {submitError}</div>}

              <div className="cz-step-actions between">
                <button
                  type="button"
                  className="cz-secondary-btn"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                >
                  ← Bumalik sa Checklist
                </button>
                <button
                  type="button"
                  className="cz-submit-btn"
                  onClick={handleSubmit}
                  disabled={submitting || !undertakingAgreed}
                >
                  {submitting ? "Isinusumite sa MPDC…" : "I-sumite ang Aplikasyon Ngayon"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS & RECEIPT */}
          {step === 4 && submittedApp && (
            <div className="cz-card cz-success-card">
              <div className="cz-success-icon"><IconCheckCircle size={56} color="#10b981" /></div>
              <h2>Matagumpay na Naisumite ang Inyong Aplikasyon!</h2>
              <p className="cz-muted">
                Nakatala na po sa opisyal na review queue ng <strong>Municipal Planning and Development Office (MPDC)</strong> ang inyong mga requirement.
              </p>

              <div className="cz-tracking-hero">
                <div className="cz-track-title">Ang Inyong Tracking Reference Number:</div>
                <div className="cz-track-badge">{submittedApp.trackingNumber}</div>
                <div className="cz-track-help">
                  Itabi o kumuha ng kopya ng numerong ito upang masubaybayan ang estado ng inyong aplikasyon online.
                </div>
              </div>

              <div className="cz-receipt-details">
                <div className="cz-receipt-row">
                  <span>Aplikante:</span>
                  <strong>{submittedApp.applicant?.fullName}</strong>
                </div>
                <div className="cz-receipt-row">
                  <span>Serbisyo:</span>
                  <strong>{activeCharter.title}</strong>
                </div>
                <div className="cz-receipt-row">
                  <span>Barangay:</span>
                  <strong>{submittedApp.applicant?.barangay}</strong>
                </div>
                <div className="cz-receipt-row">
                  <span>Standard Processing Time:</span>
                  <strong>{activeCharter.totalTime}</strong>
                </div>
                <div className="cz-receipt-row">
                  <span>Opisyal na Bayad:</span>
                  <strong className="cz-free-tag">LIBRE / ₱0.00</strong>
                </div>
              </div>

              <div className="cz-step-actions">
                <button
                  type="button"
                  className="cz-primary-btn"
                  onClick={() => {
                    setMode("track");
                    setTrackQuery(submittedApp.trackingNumber);
                    handleTrack();
                  }}
                >
                  <IconSearch size={14} color="#151c28" /> I-track ang Katayuan Ngayon
                </button>
                {onViewMap && (
                  <button
                    type="button"
                    className="cz-secondary-btn"
                    onClick={onViewMap}
                  >
                    <IconMap size={14} /> Tingnan ang 3D Map
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
