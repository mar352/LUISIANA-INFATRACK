import { useState, useMemo } from "react";
import { BARANGAY_LIST } from "../types";
import type {
  ApplicationCategory,
  AgriculturalFarmType,
  MunicipalFundingSource,
  NewApplicationPayload,
} from "../types";
import { LUISIANA_CENTER } from "../lib/solar";
import ApplicationTermsModal from "./ApplicationTermsModal";
import { isAppTermsAccepted, setAppTermsAccepted, fetchClientPublicIp } from "../lib/terms-consent";
import { uploadCitizenDocument } from "../lib/api";
import { validateApplicationFile } from "../lib/documentValidation";
import "./NewApplicationModal.css";
import "./NewApplicationPage.css";

/* ── SVG Icons ── */
const IconPlus = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconBuilding = ({ size = 32, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

const IconAgriculture = ({ size = 32, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 2a9 9 0 0 1 9 9c0 4.97-4.03 9-9 9A9 9 0 0 1 3 11c0-4.97 4.03-9 9-9z" />
    <path d="M12 6v12" />
    <path d="M7 11c2-3 5-3 5-3s3 0 5 3" />
    <path d="M8 15c2-2 4-2 4-2s2 0 4 2" />
  </svg>
);

const IconMunicipal = ({ size = 32, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="2" y1="22" x2="22" y2="22" />
    <line x1="12" y1="2" x2="2" y2="7" />
    <line x1="12" y1="2" x2="22" y2="7" />
    <line x1="2" y1="7" x2="22" y2="7" />
    <line x1="4" y1="7" x2="4" y2="22" />
    <line x1="8" y1="7" x2="8" y2="22" />
    <line x1="12" y1="7" x2="12" y2="22" />
    <line x1="16" y1="7" x2="16" y2="22" />
    <line x1="20" y1="7" x2="20" y2="22" />
  </svg>
);

const IconShieldCheck = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const IconPin = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconCheckCircle = ({ size = 48, color = "#10b981" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const IconMap = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

const IconInfo = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const IconUploadCloud = ({ size = 22, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    <polyline points="16 16 12 12 8 16" />
  </svg>
);

const IconFileTextDoc = ({ size = 20, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconReceipt = ({ size = 22, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" />
    <line x1="8" y1="8" x2="16" y2="8" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="8" y1="16" x2="13" y2="16" />
  </svg>
);

const IconBolt = ({ size = 22, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IconCamera = ({ size = 22, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export interface AttachedDocument {
  file?: File;
  url?: string;
  name: string;
  size: number;
  uploading?: boolean;
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (payload: NewApplicationPayload, trackingNo: string) => void;
  onViewOnMap?: (lon: number, lat: number) => void;
};

type Step = 1 | 2 | 3 | 4;

export function NewApplicationModal({
  isOpen,
  onClose,
  onCreated,
  onViewOnMap,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [category, setCategory] = useState<ApplicationCategory>("private_infrastructure");
  const [termsModalOpen, setTermsModalOpen] = useState<boolean>(() => !isAppTermsAccepted());

  // Common fields
  const [title, setTitle] = useState("");
  const [applicantName, setApplicantName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [barangay, setBarangay] = useState("Barangay Zone I (Poblacion)");
  const [locationDescription, setLocationDescription] = useState("");
  const [lotAreaSqM, setLotAreaSqM] = useState<number | "">("");
  const [estimatedCostPhp, setEstimatedCostPhp] = useState<number | "">("");

  // Private Infrastructure fields
  const [tctNo, setTctNo] = useState("");
  const [taxDecNo, setTaxDecNo] = useState("");
  const [buildingType, setBuildingType] = useState("Residential");
  const [isOwner, setIsOwner] = useState(true);

  // Agricultural (Poultry / Piggery) fields
  const [farmType, setFarmType] = useState<AgriculturalFarmType>("poultry_broiler");
  const [headCapacity, setHeadCapacity] = useState<number | "">(5000);
  const [wasteManagement, setWasteManagement] = useState("Biogas Digester + Wastewater Lagoon");
  const [bufferComplianceConfirmed, setBufferComplianceConfirmed] = useState(true);

  // Municipal Project fields
  const [implementingDepartment, setImplementingDepartment] = useState("Municipal Engineering Office");
  const [fundingSource, setFundingSource] = useState<MunicipalFundingSource>("20_dev_fund");
  const [cipCode, setCipCode] = useState("");
  const [targetBeneficiaries, setTargetBeneficiaries] = useState("All residents of Luisiana");
  const [notes, setNotes] = useState("");

  // ── Document Attachments (6 Mandatory Citizen Requirements) ──
  const [landTitleDoc, setLandTitleDoc] = useState<AttachedDocument | null>(null);
  const [taxDecDoc, setTaxDecDoc] = useState<AttachedDocument | null>(null);
  const [rptReceiptDoc, setRptReceiptDoc] = useState<AttachedDocument | null>(null);
  const [brgyClearanceDoc, setBrgyClearanceDoc] = useState<AttachedDocument | null>(null);
  const [ploCertDoc, setPloCertDoc] = useState<AttachedDocument | null>(null);
  const [photoDocsDoc, setPhotoDocsDoc] = useState<AttachedDocument | null>(null);

  const handleAttachFile = async (
    file: File,
    fieldKey: string,
    setter: React.Dispatch<React.SetStateAction<AttachedDocument | null>>
  ) => {
    const existingDocsSnapshot = {
      landTitle: landTitleDoc ? { name: landTitleDoc.name, size: landTitleDoc.size } : null,
      taxDec: taxDecDoc ? { name: taxDecDoc.name, size: taxDecDoc.size } : null,
      rptReceipt: rptReceiptDoc ? { name: rptReceiptDoc.name, size: rptReceiptDoc.size } : null,
      brgyClearance: brgyClearanceDoc ? { name: brgyClearanceDoc.name, size: brgyClearanceDoc.size } : null,
      ploCert: ploCertDoc ? { name: ploCertDoc.name, size: ploCertDoc.size } : null,
      photoDocs: photoDocsDoc ? { name: photoDocsDoc.name, size: photoDocsDoc.size } : null,
    };

    const valResult = await validateApplicationFile(file, fieldKey, existingDocsSnapshot);
    if (!valResult.valid) {
      alert(valResult.error || "Hindi matanggap ang file para sa field na ito.");
      setter(null);
      return;
    }

    setter({
      file,
      name: file.name,
      size: file.size,
      uploading: true,
    });

    try {
      const uploaded = await uploadCitizenDocument(file, fieldKey);
      setter({
        file,
        url: uploaded.url,
        name: uploaded.originalName || file.name,
        size: uploaded.size || file.size,
        uploading: false,
      });
    } catch (err: any) {
      const errMsg = err?.message || "";
      const isSecurityOrFormatError =
        errMsg.includes("Tanggihang Seguridad") ||
        errMsg.includes("Di-wastong format") ||
        errMsg.includes("aktibong script") ||
        errMsg.includes("FILE_SECURITY_VIOLATION") ||
        errMsg.includes("INVALID_FILE_SIGNATURE") ||
        errMsg.includes("INVALID_FIELD_DOCUMENT") ||
        errMsg.includes("Bawal ang PDF") ||
        errMsg.includes("Allowed formats") ||
        errMsg.includes("File too large");

      if (isSecurityOrFormatError) {
        alert(
          `[SECURITY ALERT] Hindi Matanggap ang Dokumento:\n\n${errMsg}\n\nPakitiyak na ang dokumento ay malinis at opisyal na format na walang nakapaloob na script o macro.`
        );
        setter(null);
      } else if (errMsg.includes("Failed to fetch") || errMsg.includes("NetworkError")) {
        setter({
          file,
          url: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          uploading: false,
        });
      } else {
        alert(`[ALERT] Hindi Matanggap ang Dokumento:\n\n${errMsg || "Nabigong i-upload ang file."}`);
        setter(null);
      }
    }
  };

  const uploadedDocsCount = [
    landTitleDoc,
    taxDecDoc,
    rptReceiptDoc,
    brgyClearanceDoc,
    ploCertDoc,
    photoDocsDoc,
  ].filter(Boolean).length;

  // Generated Result
  const [generatedTrackingNo, setGeneratedTrackingNo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Approximate default coordinates per barangay center
  const defaultCoords = useMemo(() => {
    return {
      lon: LUISIANA_CENTER.lon,
      lat: LUISIANA_CENTER.lat,
    };
  }, []);

  if (!isOpen) return null;

  const handleReset = () => {
    setStep(1);
    setCategory("private_infrastructure");
    setTitle("");
    setApplicantName("");
    setContactPhone("");
    setContactEmail("");
    setBarangay("Barangay Zone I (Poblacion)");
    setLocationDescription("");
    setLotAreaSqM("");
    setEstimatedCostPhp("");
    setTctNo("");
    setTaxDecNo("");
    setBuildingType("Residential");
    setIsOwner(true);
    setFarmType("poultry_broiler");
    setHeadCapacity(5000);
    setWasteManagement("Biogas Digester + Wastewater Lagoon");
    setBufferComplianceConfirmed(true);
    setImplementingDepartment("Municipal Engineering Office");
    setFundingSource("20_dev_fund");
    setCipCode("");
    setTargetBeneficiaries("All residents of Luisiana");
    setNotes("");
    setLandTitleDoc(null);
    setTaxDecDoc(null);
    setRptReceiptDoc(null);
    setBrgyClearanceDoc(null);
    setPloCertDoc(null);
    setPhotoDocsDoc(null);
    setGeneratedTrackingNo("");
    setSubmitting(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const getStep2MissingFields = () => {
    const missing: string[] = [];
    if (!title.trim()) missing.push("Title");
    if (!applicantName.trim()) missing.push("Applicant Name");
    if (!contactPhone.trim() || contactPhone.trim().length < 11) missing.push("Contact Phone (11 digits)");
    if (!locationDescription.trim()) missing.push("Sitio / Street Address");

    if (category === "private_infrastructure") {
      if (!tctNo.trim()) missing.push("TCT No.");
      if (!taxDecNo.trim()) missing.push("Tax Declaration (TD) No.");
      if (typeof lotAreaSqM !== "number" || lotAreaSqM <= 0) missing.push("Lot Area (sq.m.)");
    }

    if (category === "agricultural") {
      if (typeof headCapacity !== "number" || headCapacity <= 0) missing.push("Head Capacity");
      if (!wasteManagement.trim()) missing.push("Waste Management");
      if (!bufferComplianceConfirmed) missing.push("Buffer Compliance");
    }

    if (category === "municipal_project") {
      if (!implementingDepartment.trim()) missing.push("Implementing Department");
      if (typeof estimatedCostPhp !== "number" || estimatedCostPhp <= 0) missing.push("Estimated Cost (₱)");
    }

    // 6 Mandatory Documentary Requirements
    if (!landTitleDoc) missing.push("Dokumento #1: TCT (Land Title)");
    if (!taxDecDoc) missing.push("Dokumento #2: Tax Declaration");
    if (!rptReceiptDoc) missing.push("Dokumento #3: Real Property Tax Receipt (Amilyar)");
    if (!brgyClearanceDoc) missing.push("Dokumento #4: Barangay Clearance");
    if (!ploCertDoc) missing.push("Dokumento #5: PLO Certification (MERALCO)");
    if (!photoDocsDoc) missing.push("Dokumento #6: Photo Documentation (Loob at Labas)");

    if ([landTitleDoc, taxDecDoc, rptReceiptDoc, brgyClearanceDoc, ploCertDoc, photoDocsDoc].some((d) => d?.uploading)) {
      missing.push("May dokumentong kasalukuyan pang nag-a-upload...");
    }

    return missing;
  };

  const isStep2Valid = () => getStep2MissingFields().length === 0;

  const handleSubmit = () => {
    if (!isStep2Valid()) {
      setStep(2);
      return;
    }
    setSubmitting(true);
    const trackingCode = `APP-${new Date().getFullYear()}-${String(
      Math.floor(1000 + Math.random() * 9000)
    )}`;
    setGeneratedTrackingNo(trackingCode);

    const payload: NewApplicationPayload = {
      category,
      title: title.trim() || `${category.replace("_", " ")} Application`,
      applicantName: applicantName.trim() || "Municipal Officer / LGU",
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
      barangay,
      locationDescription: locationDescription.trim(),
      lotAreaSqM: typeof lotAreaSqM === "number" ? lotAreaSqM : undefined,
      estimatedCostPhp: typeof estimatedCostPhp === "number" ? estimatedCostPhp : undefined,
      lon: defaultCoords.lon,
      lat: defaultCoords.lat,
      tctNo: category === "private_infrastructure" ? tctNo.trim() : undefined,
      taxDecNo: category === "private_infrastructure" ? taxDecNo.trim() : undefined,
      buildingType: category === "private_infrastructure" ? buildingType : undefined,
      isOwner: category === "private_infrastructure" ? isOwner : undefined,
      farmType: category === "agricultural" ? farmType : undefined,
      headCapacity:
        category === "agricultural" && typeof headCapacity === "number"
          ? headCapacity
          : undefined,
      wasteManagement: category === "agricultural" ? wasteManagement : undefined,
      bufferComplianceConfirmed:
        category === "agricultural" ? bufferComplianceConfirmed : undefined,
      implementingDepartment:
        category === "municipal_project" ? implementingDepartment : undefined,
      fundingSource: category === "municipal_project" ? fundingSource : undefined,
      cipCode: category === "municipal_project" ? cipCode.trim() : undefined,
      targetBeneficiaries:
        category === "municipal_project" ? targetBeneficiaries.trim() : undefined,
      notes: notes.trim(),
    };

    setTimeout(() => {
      setSubmitting(false);
      setStep(4);
      onCreated(payload, trackingCode);
    }, 450);
  };

  return (
    <div className="new-app-modal-overlay" onClick={handleClose}>
      <div
        className="new-app-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-app-title"
      >
        {/* Header */}
        <div className="new-app-modal-header">
          <div>
            <h2 id="new-app-title" className="new-app-modal-title">
              <IconPlus size={18} color="#38bdf8" />
              <span>New Application Intake</span>
            </h2>
            <div className="new-app-modal-subtitle">
              Municipal Planning and Development Coordinator · Luisiana, Laguna
            </div>
          </div>
          <button
            type="button"
            className="new-app-modal-close"
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Stepper */}
        <div className="new-app-stepper">
          <div className={`new-app-step-item ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}>
            <span className="new-app-step-badge">{step > 1 ? "✓" : "1"}</span>
            <span>Category</span>
          </div>
          <div className="new-app-step-divider" />
          <div className={`new-app-step-item ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}>
            <span className="new-app-step-badge">{step > 2 ? "✓" : "2"}</span>
            <span>Details</span>
          </div>
          <div className="new-app-step-divider" />
          <div className={`new-app-step-item ${step === 3 ? "active" : step > 3 ? "completed" : ""}`}>
            <span className="new-app-step-badge">{step > 3 ? "✓" : "3"}</span>
            <span>GIS Siting</span>
          </div>
          <div className="new-app-step-divider" />
          <div className={`new-app-step-item ${step === 4 ? "completed active" : ""}`}>
            <span className="new-app-step-badge">4</span>
            <span>Complete</span>
          </div>
        </div>

        {/* Body Content */}
        <div className="new-app-modal-body">
          {/* STEP 1: CATEGORY SELECTION ("Ano ang ia-apply?") */}
          {step === 1 && (
            <div>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 4px", fontSize: 18, color: "#fff" }}>
                  Ano ang ia-apply?
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: "rgba(255, 255, 255, 0.65)" }}>
                  Pumili ng kategorya ng proyekto o aplikasyon para sa pagsusuri ng zoning at hazard clearance.
                </p>
              </div>

              <div className="new-app-category-grid">
                {/* 1. Private Infrastructure */}
                <div
                  className={`new-app-category-card ${
                    category === "private_infrastructure" ? "selected" : ""
                  }`}
                  onClick={() => setCategory("private_infrastructure")}
                  role="button"
                  tabIndex={0}
                >
                  <div className="new-app-category-icon" style={{ color: "#38bdf8" }}>
                    <IconBuilding size={40} color="#38bdf8" />
                  </div>
                  <div className="new-app-category-name">Private Infrastructure</div>
                  <span className="new-app-category-tag tag-private">
                    Residential / Commercial
                  </span>
                  <div className="new-app-category-desc">
                    Pribadong gusali, bahay, komersyal na establisimyento, subdibisyon, o bodega na may zoning clearance.
                  </div>
                </div>

                {/* 2. Agricultural (Poultry/Piggery) */}
                <div
                  className={`new-app-category-card ${
                    category === "agricultural" ? "selected" : ""
                  }`}
                  onClick={() => setCategory("agricultural")}
                  role="button"
                  tabIndex={0}
                >
                  <div className="new-app-category-icon" style={{ color: "#34d399" }}>
                    <IconAgriculture size={40} color="#34d399" />
                  </div>
                  <div className="new-app-category-name">Agro-Industrial</div>
                  <span className="new-app-category-tag tag-agri">
                    Poultry / Piggery / Farm
                  </span>
                  <div className="new-app-category-desc">
                    Poultry farm, babuyan, livestock, at pasilidad pang-agrikultura na may environmental buffer checking.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CATEGORY SPECIFIC FORM */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 }}>
                <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#38bdf8", display: "flex", alignItems: "center", gap: 8 }}>
                  {category === "private_infrastructure" && (
                    <>
                      <IconBuilding size={18} color="#38bdf8" />
                      <span>Private Infrastructure Application</span>
                    </>
                  )}
                  {category === "agricultural" && (
                    <>
                      <IconAgriculture size={18} color="#34d399" />
                      <span>Agro-Industrial Application</span>
                    </>
                  )}
                  {category === "municipal_project" && (
                    <>
                      <IconMunicipal size={18} color="#fbbf24" />
                      <span>Municipal LGU Infrastructure Project</span>
                    </>
                  )}
                </h3>
                <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.6)" }}>
                  Punan ang mga kailangang impormasyon para sa pagsusuri ng MPDC at Engineering Office.
                </div>
              </div>

              <div className="new-app-form-grid">
                {/* Project Title */}
                <div className="new-app-field full-width">
                  <label className="new-app-label">
                    Pangalan ng Proyekto / Application Title *
                  </label>
                  <input
                    type="text"
                    className="new-app-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      category === "private_infrastructure"
                        ? "hal. 2-Storey Commercial Building - Santos Lot"
                        : category === "agricultural"
                        ? "hal. Luisiana Broiler Poultry Farm Phase 1"
                        : "hal. Barangay San Salvador Evacuation Center"
                    }
                  />
                </div>

                {/* Applicant / Contact Name */}
                <div className="new-app-field">
                  <label className="new-app-label">
                    {category === "municipal_project" ? "Project Proponent / Focal Officer *" : "Pangalan ng Aplikante / May-ari *"}
                  </label>
                  <input
                    type="text"
                    className="new-app-input"
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    placeholder="hal. Engr. Juan Dela Cruz"
                  />
                </div>

                {/* Contact Phone */}
                <div className="new-app-field">
                  <label className="new-app-label">Mobile Phone Number *</label>
                  <input
                    type="tel"
                    className="new-app-input"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="0917-123-4567"
                  />
                  <span style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "4px", display: "block" }}>
                    Makakatanggap ng libreng SMS text updates (tracking no., inspection, approval) sa numerong ito.
                  </span>
                </div>

                {/* Barangay */}
                <div className="new-app-field">
                  <label className="new-app-label">Barangay Location *</label>
                  <select
                    className="new-app-select"
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

                {/* Sitio / Specific Location */}
                <div className="new-app-field">
                  <label className="new-app-label">Sitio / Street Address</label>
                  <input
                    type="text"
                    className="new-app-input"
                    value={locationDescription}
                    onChange={(e) => setLocationDescription(e.target.value)}
                    placeholder="hal. Sitio Mahabang Parang, near National Road"
                  />
                </div>

                {/* ── PRIVATE INFRASTRUCTURE SPECIFIC FIELDS ── */}
                {category === "private_infrastructure" && (
                  <>
                    <div className="new-app-field">
                      <label className="new-app-label">Building / Structure Type</label>
                      <select
                        className="new-app-select"
                        value={buildingType}
                        onChange={(e) => setBuildingType(e.target.value)}
                      >
                        <option value="Residential">Residential</option>
                        <option value="Apartment">Apartment</option>
                        <option value="Townhouse">Townhouse</option>
                        <option value="Dormitory">Dormitory</option>
                        <option value="Institutional">Institutional</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Industrial">Industrial</option>
                        <option value="Agro-Industrial">Agro-Industrial</option>
                      </select>
                    </div>

                    <div className="new-app-field">
                      <label className="new-app-label">Lot Area (sq. meters)</label>
                      <input
                        type="number"
                        className="new-app-input"
                        value={lotAreaSqM}
                        onChange={(e) => setLotAreaSqM(e.target.value ? Number(e.target.value) : "")}
                        placeholder="hal. 250"
                      />
                    </div>

                    <div className="new-app-field">
                      <label className="new-app-label">TCT No. (Transfer Certificate of Title)</label>
                      <input
                        type="text"
                        className="new-app-input"
                        value={tctNo}
                        onChange={(e) => setTctNo(e.target.value)}
                        placeholder="hal. TCT-059-2023001234"
                      />
                    </div>

                    <div className="new-app-field">
                      <label className="new-app-label">Tax Declaration (TD) No.</label>
                      <input
                        type="text"
                        className="new-app-input"
                        value={taxDecNo}
                        onChange={(e) => setTaxDecNo(e.target.value)}
                        placeholder="hal. TD-2024-0012-0045"
                      />
                    </div>
                  </>
                )}

                {/* ── AGRICULTURAL (POULTRY / PIGGERY) SPECIFIC FIELDS ── */}
                {category === "agricultural" && (
                  <>
                    <div className="new-app-field">
                      <label className="new-app-label">Type of Agricultural Farm</label>
                      <select
                        className="new-app-select"
                        value={farmType}
                        onChange={(e) => setFarmType(e.target.value as AgriculturalFarmType)}
                      >
                        <option value="poultry_broiler">Poultry Farm - Broiler (Meat)</option>
                        <option value="poultry_layer">Poultry Farm - Layer (Eggs)</option>
                        <option value="piggery_swine">Piggery / Swine Raising Farm</option>
                        <option value="livestock_cattle">Livestock / Cattle / Goat Feedlot</option>
                        <option value="agro_processing">Agro-Industrial / Feed Mill / Rice Mill</option>
                      </select>
                    </div>

                    <div className="new-app-field">
                      <label className="new-app-label">Target Head Capacity (Bilang ng Hayop)</label>
                      <input
                        type="number"
                        className="new-app-input"
                        value={headCapacity}
                        onChange={(e) => setHeadCapacity(e.target.value ? Number(e.target.value) : "")}
                        placeholder="hal. 5000 para sa poultry, 200 para sa baboy"
                      />
                    </div>

                    <div className="new-app-field full-width">
                      <label className="new-app-label">Waste &amp; Odor Management Facility</label>
                      <select
                        className="new-app-select"
                        value={wasteManagement}
                        onChange={(e) => setWasteManagement(e.target.value)}
                      >
                        <option value="Biogas Digester + Wastewater Lagoon">Biogas Digester + 3-Stage Wastewater Treatment Lagoon</option>
                        <option value="Closed Tunnel Ventilated with Odor Scrubber">Closed Tunnel Ventilated Housing with Odor Scrubber</option>
                        <option value="Dry Bedding System (Deep Litter / Rice Hull)">Dry Bedding System (Deep Litter / Rice Hull Microbe)</option>
                        <option value="Covered Slurry Tank with Aerator">Covered Slurry Tank with Aeration System</option>
                      </select>
                    </div>

                    <div className="new-app-field full-width">
                      <div className="new-app-buffer-box">
                        <div className="new-app-buffer-title">
                          <IconShieldCheck size={18} color="#34d399" />
                          <span>Mandatory Environmental Buffer Zone Compliance</span>
                        </div>
                        <div className="new-app-buffer-text">
                          Ayon sa Municipal Zoning &amp; Sanitary Code ng Luisiana, ang mga agricultural poultry at piggery ay kailangang may minimum distance buffer na:
                          <ul style={{ margin: "6px 0 0 20px", padding: 0 }}>
                            <li><b>500 metro</b> mula sa built-up residential areas at mga paaralan.</li>
                            <li><b>200 metro</b> mula sa mga pangunahing ilog at water supply intake.</li>
                          </ul>
                        </div>
                        <label className="new-app-checkbox-label">
                          <input
                            type="checkbox"
                            checked={bufferComplianceConfirmed}
                            onChange={(e) => setBufferComplianceConfirmed(e.target.checked)}
                          />
                          <span>Pinatutunayan na sumusunod ang napiling lote sa environmental distance buffers.</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {/* ── MUNICIPAL PROJECT SPECIFIC FIELDS ── */}
                {category === "municipal_project" && (
                  <>
                    <div className="new-app-field">
                      <label className="new-app-label">Implementing Department / Office</label>
                      <select
                        className="new-app-select"
                        value={implementingDepartment}
                        onChange={(e) => setImplementingDepartment(e.target.value)}
                      >
                        <option value="Municipal Engineering Office">Municipal Engineering Office (MEO)</option>
                        <option value="MPDC">Municipal Planning &amp; Development Office (MPDC)</option>
                        <option value="MDRRMO">MDRRMO (Disaster Risk Reduction Office)</option>
                        <option value="Municipal Agriculture Office">Municipal Agriculture Office (MAO)</option>
                        <option value="Office of the Mayor">Office of the Municipal Mayor</option>
                      </select>
                    </div>

                    <div className="new-app-field">
                      <label className="new-app-label">Funding Source</label>
                      <select
                        className="new-app-select"
                        value={fundingSource}
                        onChange={(e) => setFundingSource(e.target.value as MunicipalFundingSource)}
                      >
                        <option value="20_dev_fund">20% Local Development Fund (LDF)</option>
                        <option value="general_fund">LGU General Fund</option>
                        <option value="national_subsidy">National Government Subsidy / GAA</option>
                        <option value="calamity_fund">5% Local DRRM / Calamity Fund</option>
                        <option value="special_education_fund">Special Education Fund (SEF)</option>
                        <option value="external_grant">Official Development Assistance / Grant</option>
                      </select>
                    </div>

                    <div className="new-app-field">
                      <label className="new-app-label">AIP / CIP Reference Code</label>
                      <input
                        type="text"
                        className="new-app-input"
                        value={cipCode}
                        onChange={(e) => setCipCode(e.target.value)}
                        placeholder="hal. LUIS-CIP-2026-INFRA-08"
                      />
                    </div>

                    <div className="new-app-field">
                      <label className="new-app-label">Estimated Project Cost (₱ PHP)</label>
                      <input
                        type="number"
                        className="new-app-input"
                        value={estimatedCostPhp}
                        onChange={(e) => setEstimatedCostPhp(e.target.value ? Number(e.target.value) : "")}
                        placeholder="hal. 3500000"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* ── DOCUMENT UPLOAD SECTION (6 Mandatory Requirements) ── */}
              <div className="new-app-docs-section">
                <div className="new-app-docs-header">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, width: "100%" }}>
                    <div className="new-app-docs-title">
                      <IconUploadCloud size={22} color="var(--apple-text, #1d1d1f)" />
                      <span>Anim (6) na Mandatory Documents (Citizen&apos;s Charter) *</span>
                    </div>
                    <span className={`new-app-docs-counter ${uploadedDocsCount === 6 ? "complete" : "incomplete"}`}>
                      {uploadedDocsCount === 6 ? "Kumpleto (6/6) ✓" : `${uploadedDocsCount} of 6 Naka-attach`}
                    </span>
                  </div>
                  <div className="new-app-docs-sub">
                    Ayon sa Citizen&apos;s Charter ng Bayan ng Luisiana, kailangang mai-upload ang lahat ng anim (6) na mandatory na dokumento bago magpatuloy sa pagsusuri.
                  </div>
                </div>

                <div className="new-app-docs-grid">
                  {/* Upload Box 1: Photocopy ng TCT (Land Title) */}
                  <div className={`new-app-upload-box${landTitleDoc ? " attached" : ""}`}>
                    <input
                      id="modal-upload-land-title"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleAttachFile(file, "landTitle", setLandTitleDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconFileTextDoc size={24} />
                    </div>
                    <div className="new-app-upload-title">Photocopy ng TCT (Land Title) *</div>
                    <div className="new-app-upload-desc">
                      Scanned o malinaw na kopya ng Transfer Certificate of Title (TCT) o OCT bilang katibayan ng pag-aari.
                    </div>
                    <div className="new-app-upload-format-badge doc">Tinatanggap: PDF, JPG, PNG, WEBP (Max 15MB)</div>

                    {landTitleDoc ? (
                      <div className="new-app-file-preview-wrap">
                        <span className="new-app-file-name" title={landTitleDoc.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <IconFileTextDoc size={13} color="currentColor" /> {landTitleDoc.name}
                        </span>
                        <button
                          type="button"
                          className="new-app-file-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLandTitleDoc(null);
                          }}
                        >
                          Alisin
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="modal-upload-land-title" className="new-app-upload-status pending" style={{ cursor: "pointer" }}>
                        <span>Pumili ng File *</span>
                        <span>+</span>
                      </label>
                    )}

                    {landTitleDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ Naka-attach ({(landTitleDoc.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Box 2: Tax Declaration */}
                  <div className={`new-app-upload-box${taxDecDoc ? " attached" : ""}`}>
                    <input
                      id="modal-upload-tax-dec"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleAttachFile(file, "taxDec", setTaxDecDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconFileTextDoc size={24} />
                    </div>
                    <div className="new-app-upload-title">Tax Declaration *</div>
                    <div className="new-app-upload-desc">
                      Certified True Copy ng pinakahuling Tax Declaration para sa lupa mula sa Municipal Assessor.
                    </div>
                    <div className="new-app-upload-format-badge doc">Tinatanggap: PDF, JPG, PNG, WEBP (Max 15MB)</div>

                    {taxDecDoc ? (
                      <div className="new-app-file-preview-wrap">
                        <span className="new-app-file-name" title={taxDecDoc.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <IconFileTextDoc size={13} color="currentColor" /> {taxDecDoc.name}
                        </span>
                        <button
                          type="button"
                          className="new-app-file-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTaxDecDoc(null);
                          }}
                        >
                          Alisin
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="modal-upload-tax-dec" className="new-app-upload-status pending" style={{ cursor: "pointer" }}>
                        <span>Pumili ng File *</span>
                        <span>+</span>
                      </label>
                    )}

                    {taxDecDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ Naka-attach ({(taxDecDoc.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Box 3: Current Real Property Tax Receipt */}
                  <div className={`new-app-upload-box${rptReceiptDoc ? " attached" : ""}`}>
                    <input
                      id="modal-upload-rpt-receipt"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleAttachFile(file, "rptReceipt", setRptReceiptDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconReceipt size={24} />
                    </div>
                    <div className="new-app-upload-title">Current Real Property Tax Receipt (Amilyar) *</div>
                    <div className="new-app-upload-desc">
                      Resibo ng bayad sa amilyar (Official Receipt / Tax Clearance) para sa kasalukuyang taon.
                    </div>
                    <div className="new-app-upload-format-badge doc">Tinatanggap: PDF, JPG, PNG, WEBP (Max 15MB)</div>

                    {rptReceiptDoc ? (
                      <div className="new-app-file-preview-wrap">
                        <span className="new-app-file-name" title={rptReceiptDoc.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <IconFileTextDoc size={13} color="currentColor" /> {rptReceiptDoc.name}
                        </span>
                        <button
                          type="button"
                          className="new-app-file-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRptReceiptDoc(null);
                          }}
                        >
                          Alisin
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="modal-upload-rpt-receipt" className="new-app-upload-status pending" style={{ cursor: "pointer" }}>
                        <span>Pumili ng File *</span>
                        <span>+</span>
                      </label>
                    )}

                    {rptReceiptDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ Naka-attach ({(rptReceiptDoc.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Box 4: Barangay Clearance */}
                  <div className={`new-app-upload-box${brgyClearanceDoc ? " attached" : ""}`}>
                    <input
                      id="modal-upload-brgy-clearance"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleAttachFile(file, "brgyClearance", setBrgyClearanceDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconShieldCheck size={24} />
                    </div>
                    <div className="new-app-upload-title">Barangay Clearance *</div>
                    <div className="new-app-upload-desc">
                      Opisyal na clearance para sa konstruksyon / lokasyon mula sa Barangay kung saan nakatirik ang lote.
                    </div>
                    <div className="new-app-upload-format-badge doc">Tinatanggap: PDF, JPG, PNG, WEBP (Max 15MB)</div>

                    {brgyClearanceDoc ? (
                      <div className="new-app-file-preview-wrap">
                        <span className="new-app-file-name" title={brgyClearanceDoc.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <IconFileTextDoc size={13} color="currentColor" /> {brgyClearanceDoc.name}
                        </span>
                        <button
                          type="button"
                          className="new-app-file-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBrgyClearanceDoc(null);
                          }}
                        >
                          Alisin
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="modal-upload-brgy-clearance" className="new-app-upload-status pending" style={{ cursor: "pointer" }}>
                        <span>Pumili ng File *</span>
                        <span>+</span>
                      </label>
                    )}

                    {brgyClearanceDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ Naka-attach ({(brgyClearanceDoc.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Box 5: PLO Certification */}
                  <div className={`new-app-upload-box${ploCertDoc ? " attached" : ""}`}>
                    <input
                      id="modal-upload-plo-cert"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleAttachFile(file, "ploCert", setPloCertDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconBolt size={24} />
                    </div>
                    <div className="new-app-upload-title">PLO Certification (MERALCO) *</div>
                    <div className="new-app-upload-desc">
                      Clearance mula sa MERALCO / Public Lighting Office para sa opisyal na koneksyon ng kuryente.
                    </div>
                    <div className="new-app-upload-format-badge doc">Tinatanggap: PDF, JPG, PNG, WEBP (Max 15MB)</div>

                    {ploCertDoc ? (
                      <div className="new-app-file-preview-wrap">
                        <span className="new-app-file-name" title={ploCertDoc.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <IconFileTextDoc size={13} color="currentColor" /> {ploCertDoc.name}
                        </span>
                        <button
                          type="button"
                          className="new-app-file-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPloCertDoc(null);
                          }}
                        >
                          Alisin
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="modal-upload-plo-cert" className="new-app-upload-status pending" style={{ cursor: "pointer" }}>
                        <span>Pumili ng File *</span>
                        <span>+</span>
                      </label>
                    )}

                    {ploCertDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ Naka-attach ({(ploCertDoc.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Box 6: Photo Documentation */}
                  <div className={`new-app-upload-box${photoDocsDoc ? " attached" : ""}`}>
                    <input
                      id="modal-upload-photo-docs"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleAttachFile(file, "photoDocs", setPhotoDocsDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconCamera size={24} />
                    </div>
                    <div className="new-app-upload-title">Photo Documentation *</div>
                    <div className="new-app-upload-desc">
                      Mga litrato ng loob at labas ng mismong lote/site (aktwal na kalagayan ng lugar).
                    </div>
                    <div className="new-app-upload-format-badge photo">Tinatanggap: Litrato Lamang (JPG, PNG, WEBP) · Bawal ang PDF</div>

                    {photoDocsDoc ? (
                      <div className="new-app-file-preview-wrap">
                        <span className="new-app-file-name" title={photoDocsDoc.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <IconFileTextDoc size={13} color="currentColor" /> {photoDocsDoc.name}
                        </span>
                        <button
                          type="button"
                          className="new-app-file-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhotoDocsDoc(null);
                          }}
                        >
                          Alisin
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="modal-upload-photo-docs" className="new-app-upload-status pending" style={{ cursor: "pointer" }}>
                        <span>Pumili ng File *</span>
                        <span>+</span>
                      </label>
                    )}

                    {photoDocsDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ Naka-attach ({(photoDocsDoc.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: GIS SITING & HAZARD VERIFICATION */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#10b981", display: "flex", alignItems: "center", gap: 6 }}>
                  <IconPin size={18} color="#10b981" />
                  <span>GIS Location Siting &amp; Hazard Clearance</span>
                </h3>
                <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.65)" }}>
                  Suriin ang lokasyon sa 2D municipal GIS map bago kumpirmahin ang aplikasyon.
                </div>
              </div>

              <div
                style={{
                  background: "rgba(0,0,0,0.22)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>Barangay Target:</span>
                  <span style={{ fontWeight: 700, color: "#fff" }}>{barangay}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>Default Coordinates:</span>
                  <span style={{ fontFamily: "monospace", color: "#38bdf8" }}>
                    {defaultCoords.lat.toFixed(5)}° N, {defaultCoords.lon.toFixed(5)}° E
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>Hazard Slope Index:</span>
                  <span style={{ color: "#34d399", fontWeight: 700 }}>Low / Safe Elevation (Grade 2)</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>Fault Line Proximity:</span>
                  <span style={{ color: "#34d399", fontWeight: 700 }}>&gt; 5.2 km from Marikina West Valley Fault</span>
                </div>
                {category === "agricultural" && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>Sanitary Buffer:</span>
                    <span style={{ color: "#34d399", fontWeight: 700 }}>Compliant (&gt; 500m to Residential)</span>
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: "10px 14px",
                  background: "rgba(56, 189, 248, 0.08)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#7dd3fc",
                  border: "1px solid rgba(56, 189, 248, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <IconInfo size={16} color="#38bdf8" />
                <span>Pagkatapos i-submit, maaari mong buksan agad ang interactive 2D map para baguhin ang eksaktong lote gamit ang cursor.</span>
              </div>
            </div>
          )}

          {/* STEP 4: CONFIRMATION & TRACKING */}
          {step === 4 && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ marginBottom: 14 }}>
                <IconCheckCircle size={56} color="#10b981" />
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: 20, color: "#34d399" }}>
                Matagumpay na Nalikha ang Aplikasyon!
              </h3>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "rgba(255, 255, 255, 0.7)" }}>
                Nailagay na sa sistema ang record para sa pagsusuri ng zoning at municipal planning.
              </p>

              <div
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "2px dashed rgba(56, 189, 248, 0.4)",
                  borderRadius: 12,
                  padding: "16px 20px",
                  display: "inline-block",
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Tracking Reference Number
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#38bdf8", marginTop: 4, letterSpacing: "0.06em" }}>
                  {generatedTrackingNo}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
                {onViewOnMap && (
                  <button
                    type="button"
                    className="new-app-btn new-app-btn-primary"
                    onClick={() => {
                      onViewOnMap(defaultCoords.lon, defaultCoords.lat);
                      handleClose();
                    }}
                  >
                    <IconMap size={15} color="#fff" />
                    <span>Tingnan sa Mapa</span>
                  </button>
                )}
                <button
                  type="button"
                  className="new-app-btn new-app-btn-secondary"
                  onClick={handleClose}
                >
                  Isara
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {step < 4 && (
          <div className="new-app-modal-footer">
            {step === 1 ? (
              <button
                type="button"
                className="new-app-btn new-app-btn-secondary"
                onClick={handleClose}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="new-app-btn new-app-btn-secondary"
                onClick={() => setStep((s) => (s - 1) as Step)}
              >
                ← Back
              </button>
            )}

            {step === 1 && (
              <button
                type="button"
                className="new-app-btn new-app-btn-primary"
                onClick={() => setStep(2)}
              >
                Next: Fill Details →
              </button>
            )}

            {step === 2 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
                {!isStep2Valid() && (
                  <span style={{ fontSize: 12, color: "#fca5a5" }}>
                    Kumpletuhin lahat ng fields ({getStep2MissingFields().length} kulang)
                  </span>
                )}
                <button
                  type="button"
                  className="new-app-btn new-app-btn-primary"
                  disabled={!isStep2Valid()}
                  onClick={() => setStep(3)}
                  title={!isStep2Valid() ? "Kumpletuhin muna ang lahat ng fields bago magpatuloy" : undefined}
                >
                  Next: Siting &amp; Hazard →
                </button>
              </div>
            )}

            {step === 3 && (
              <button
                type="button"
                className="new-app-btn new-app-btn-primary"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            )}
          </div>
        )}
      </div>

      <ApplicationTermsModal
        isOpen={termsModalOpen}
        onAccept={async () => {
          const publicIp = await fetchClientPublicIp();
          setAppTermsAccepted(true, {
            source: "modal_application",
            ipAddress: publicIp || undefined,
          });
          setTermsModalOpen(false);
        }}
        onDecline={() => {
          setTermsModalOpen(false);
          onClose();
        }}
        isAlreadyAccepted={isAppTermsAccepted()}
      />
    </div>
  );
}
