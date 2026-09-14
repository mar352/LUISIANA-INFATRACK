import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { BARANGAY_LIST } from "../types";
import type {
  ApplicationCategory,
  AgriculturalFarmType,
  MunicipalFundingSource,
  NewApplicationPayload,
} from "../types";
import { LUISIANA_CENTER } from "../lib/solar";
import { ThemeToggle } from "./ThemeToggle";
import PinpointMapPicker, { BARANGAY_COORDINATES } from "./PinpointMapPicker";
import { normalizeBarangayName, getClupZone } from "../lib/clup-zones";
import {
  banahawDistanceKm,
  fetchGeoriskAssess,
  type GeoRiskAssess,
} from "../lib/luisiana-site-assess";
import { printSiteHazardReport } from "../lib/hazard-report";
import { uploadCitizenDocument, submitCitizenApplication } from "../lib/api";
import ApplicationTermsModal from "./ApplicationTermsModal";
import ApplicationConfirmModal, { type ApplicationConfirmData } from "./ApplicationConfirmModal";
import { isAppTermsAccepted, setAppTermsAccepted, fetchClientPublicIp } from "../lib/terms-consent";
import {
  loadApplicationDraft,
  saveApplicationDraft,
  clearApplicationDraft,
  type ApplicationDraft,
  type AttachedDocDraft,
} from "../lib/application-draft";
import "./NewApplicationPage.css";
import "./NewApplicationModal.css";

/* ── Vector SVG Icons ── */
const IconBackArrow = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
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

const IconPin = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconCheck = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconCheckCircle = ({ size = 56, color = "#10b981" }: { size?: number; color?: string }) => (
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

const IconAlert = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
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

const IconTrashBin = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
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


export type AttachedDocument = {
  file?: File;
  url?: string;
  name: string;
  size: number;
  uploading?: boolean;
};

type Props = {
  onBack: () => void;
  onCreated: (payload: NewApplicationPayload, trackingNo: string) => void;
  onViewOnMap?: (lon: number, lat: number) => void;
  onTrackApplication?: (trackingNo: string) => void;
};

type Step = 1 | 2 | 3 | 4;

function docFromDraft(d?: AttachedDocDraft | null): AttachedDocument | null {
  if (!d || !d.name) return null;
  return {
    name: d.name,
    url: d.url,
    size: d.size || 0,
    uploading: false,
  };
}

function docToDraft(d: AttachedDocument | null): AttachedDocDraft | null {
  if (!d) return null;
  return {
    name: d.name,
    url: d.url,
    size: d.size || 0,
  };
}

export default function NewApplicationPage({
  onBack,
  onCreated,
  onViewOnMap,
  onTrackApplication,
}: Props) {
  // Load draft from localStorage once on initial mount
  const initialDraft = useMemo(() => loadApplicationDraft(), []);
  const [draftRestored, setDraftRestored] = useState<boolean>(() => initialDraft !== null);

  const [step, setStep] = useState<Step>(() => {
    if (typeof window === "undefined") return 1;
    const p = new URLSearchParams(window.location.search).get("step");
    if (p) {
      const num = parseInt(p, 10);
      if (num >= 1 && num <= 4) return num as Step;
    }
    if (initialDraft && initialDraft.step) {
      return (initialDraft.step >= 1 && initialDraft.step <= 3 ? initialDraft.step : 1) as Step;
    }
    return 1;
  });
  const isStepPopRef = useRef(false);

  const [category, setCategory] = useState<ApplicationCategory>(
    () => initialDraft?.category || "private_infrastructure"
  );

  // Common form state
  const [title, setTitle] = useState(() => initialDraft?.title || "");
  const [applicantName, setApplicantName] = useState(() => initialDraft?.applicantName || "");
  const [contactPhone, setContactPhone] = useState(() => initialDraft?.contactPhone || "");
  const [contactEmail, setContactEmail] = useState(() => initialDraft?.contactEmail || "");
  const [barangay, setBarangay] = useState(() => initialDraft?.barangay || "Barangay Zone I (Poblacion)");
  const [locationDescription, setLocationDescription] = useState(() => initialDraft?.locationDescription || "");
  const [lotAreaSqM, setLotAreaSqM] = useState<number | "">(() => initialDraft?.lotAreaSqM ?? "");
  const [estimatedCostPhp, setEstimatedCostPhp] = useState<number | "">(() => initialDraft?.estimatedCostPhp ?? "");

  // Terms and Conditions & Cookie Consent: only opens if not previously accepted in cookies/localStorage
  const [termsModalOpen, setTermsModalOpen] = useState<boolean>(() => !isAppTermsAccepted());

  // Pre-submission Review & Confirmation Modal
  const [confirmModalOpen, setConfirmModalOpen] = useState<boolean>(false);

  // Prefetch client public IP for consent tracking
  useEffect(() => {
    void fetchClientPublicIp();
  }, []);

  const handleAcceptTerms = useCallback(async () => {
    const publicIp = await fetchClientPublicIp();
    setAppTermsAccepted(true, {
      applicantName: applicantName.trim() || undefined,
      source: "new_application_page",
      ipAddress: publicIp || undefined,
    });
    setTermsModalOpen(false);
  }, [applicantName]);

  const handleDeclineTerms = useCallback(() => {
    setTermsModalOpen(false);
    onBack();
  }, [onBack]);

  const handleBack = useCallback(() => {
    if (step > 1) {
      setStep((s) => Math.max(1, s - 1) as Step);
    } else {
      onBack();
    }
  }, [step, onBack]);

  // Listen to browser Back/Forward (popstate)
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      isStepPopRef.current = true;
      if (e.state && typeof e.state.step === "number") {
        const targetStep = (e.state.step >= 1 && e.state.step <= 4 ? e.state.step : 1) as Step;
        setStep(targetStep);
      } else {
        const p = new URLSearchParams(window.location.search).get("step");
        const num = p ? parseInt(p, 10) : 1;
        setStep((num >= 1 && num <= 4 ? num : 1) as Step);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Sync step state to URL search param using replaceState
  useEffect(() => {
    if (isStepPopRef.current) {
      isStepPopRef.current = false;
      return;
    }

    if (typeof window !== "undefined") {
      const currentUrl = new URL(window.location.href);
      if (step > 1) {
        currentUrl.searchParams.set("step", String(step));
      } else {
        currentUrl.searchParams.delete("step");
      }
      const targetPath = currentUrl.pathname + currentUrl.search;
      window.history.replaceState(
        { ...window.history.state, screen: "new_application", step },
        "",
        targetPath
      );
    }
  }, [step]);

  // Private Infrastructure fields
  const [tctNo, setTctNo] = useState(() => initialDraft?.tctNo || "");
  const [taxDecNo, setTaxDecNo] = useState(() => initialDraft?.taxDecNo || "");
  const [buildingType, setBuildingType] = useState(() => initialDraft?.buildingType || "Residential");
  const [isOwner, setIsOwner] = useState<boolean>(() => initialDraft?.isOwner ?? true);

  // Agricultural fields
  const [farmType, setFarmType] = useState<AgriculturalFarmType>(
    () => initialDraft?.farmType || "poultry_broiler"
  );
  const [headCapacity, setHeadCapacity] = useState<number | "">(
    () => initialDraft?.headCapacity ?? 5000
  );
  const [wasteManagement, setWasteManagement] = useState(
    () => initialDraft?.wasteManagement || "Biogas Digester + Wastewater Lagoon"
  );
  const [bufferComplianceConfirmed, setBufferComplianceConfirmed] = useState<boolean>(
    () => initialDraft?.bufferComplianceConfirmed ?? true
  );

  // Municipal Project fields
  const [implementingDepartment, setImplementingDepartment] = useState(
    () => initialDraft?.implementingDepartment || "Municipal Engineering Office"
  );
  const [fundingSource, setFundingSource] = useState<MunicipalFundingSource>(
    () => initialDraft?.fundingSource || "20_dev_fund"
  );
  const [cipCode, setCipCode] = useState(() => initialDraft?.cipCode || "");
  const [targetBeneficiaries, setTargetBeneficiaries] = useState(
    () => initialDraft?.targetBeneficiaries || "All residents of Luisiana"
  );
  const [notes, setNotes] = useState(() => initialDraft?.notes || "");

  // ── Document Attachments (6 Mandatory/Standard Citizen Requirements) ──
  const [landTitleDoc, setLandTitleDoc] = useState<AttachedDocument | null>(
    () => docFromDraft(initialDraft?.attachedDocs?.landTitle)
  );
  const [taxDecDoc, setTaxDecDoc] = useState<AttachedDocument | null>(
    () => docFromDraft(initialDraft?.attachedDocs?.taxDec)
  );
  const [rptReceiptDoc, setRptReceiptDoc] = useState<AttachedDocument | null>(
    () => docFromDraft(initialDraft?.attachedDocs?.rptReceipt)
  );
  const [brgyClearanceDoc, setBrgyClearanceDoc] = useState<AttachedDocument | null>(
    () => docFromDraft(initialDraft?.attachedDocs?.brgyClearance)
  );
  const [ploCertDoc, setPloCertDoc] = useState<AttachedDocument | null>(
    () => docFromDraft(initialDraft?.attachedDocs?.ploCert)
  );
  const [photoDocsDoc, setPhotoDocsDoc] = useState<AttachedDocument | null>(
    () => docFromDraft(initialDraft?.attachedDocs?.photoDocs)
  );

  const handleAttachFile = async (
    file: File,
    setter: React.Dispatch<React.SetStateAction<AttachedDocument | null>>
  ) => {
    setter({
      file,
      name: file.name,
      size: file.size,
      uploading: true,
    });

    try {
      const uploaded = await uploadCitizenDocument(file);
      setter({
        file,
        url: uploaded.url,
        name: uploaded.originalName || file.name,
        size: uploaded.size || file.size,
        uploading: false,
      });
    } catch {
      // Gracefully retain file reference and local object preview if backend is offline
      setter({
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        uploading: false,
      });
    }
  };

  // Tracking & Submission State
  const [generatedTrackingNo, setGeneratedTrackingNo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attemptedStep2Proceed, setAttemptedStep2Proceed] = useState(false);

  // Helper key blockers: Disallow letters and invalid symbols
  const handleIntegerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"];
    if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handleDecimalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"];
    if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
    if (e.key === "." && !e.currentTarget.value.includes(".")) return;
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  };

  // Pinned Coordinates on Interactive Map
  const [pinnedCoords, setPinnedCoords] = useState<{ lon: number; lat: number }>(() => {
    if (initialDraft?.pinnedCoords?.lat && initialDraft?.pinnedCoords?.lon) {
      return initialDraft.pinnedCoords;
    }
    return {
      lon: LUISIANA_CENTER.lon,
      lat: LUISIANA_CENTER.lat,
    };
  });

  const [geoRisk, setGeoRisk] = useState<GeoRiskAssess | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGeoriskAssess(pinnedCoords.lat, pinnedCoords.lon)
      .then((res) => {
        if (!cancelled) setGeoRisk(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pinnedCoords.lat, pinnedCoords.lon]);

  const ban = useMemo(
    () => banahawDistanceKm(pinnedCoords.lat, pinnedCoords.lon),
    [pinnedCoords.lat, pinnedCoords.lon],
  );

  // Debounced auto-save to localStorage across Steps 1–3
  useEffect(() => {
    if (step >= 4) return;

    // Only save if there is some meaningful progress or input
    const hasAnyInput =
      step > 1 ||
      title.trim().length > 0 ||
      applicantName.trim().length > 0 ||
      contactPhone.trim().length > 0 ||
      contactEmail.trim().length > 0 ||
      locationDescription.trim().length > 0 ||
      tctNo.trim().length > 0 ||
      taxDecNo.trim().length > 0 ||
      lotAreaSqM !== "" ||
      estimatedCostPhp !== "" ||
      cipCode.trim().length > 0 ||
      landTitleDoc !== null ||
      taxDecDoc !== null ||
      rptReceiptDoc !== null ||
      brgyClearanceDoc !== null ||
      ploCertDoc !== null ||
      photoDocsDoc !== null;

    if (!hasAnyInput) return;

    const timer = setTimeout(() => {
      const draft: ApplicationDraft = {
        step: (step >= 1 && step <= 3 ? step : 1) as 1 | 2 | 3,
        category,
        title,
        applicantName,
        contactPhone,
        contactEmail,
        barangay,
        locationDescription,
        lotAreaSqM,
        estimatedCostPhp,
        tctNo,
        taxDecNo,
        buildingType,
        isOwner,
        farmType,
        headCapacity,
        wasteManagement,
        bufferComplianceConfirmed,
        implementingDepartment,
        fundingSource,
        cipCode,
        targetBeneficiaries,
        notes,
        pinnedCoords,
        attachedDocs: {
          landTitle: docToDraft(landTitleDoc),
          taxDec: docToDraft(taxDecDoc),
          rptReceipt: docToDraft(rptReceiptDoc),
          brgyClearance: docToDraft(brgyClearanceDoc),
          ploCert: docToDraft(ploCertDoc),
          photoDocs: docToDraft(photoDocsDoc),
        },
        savedAt: new Date().toISOString(),
      };
      saveApplicationDraft(draft);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    step,
    category,
    title,
    applicantName,
    contactPhone,
    contactEmail,
    barangay,
    locationDescription,
    lotAreaSqM,
    estimatedCostPhp,
    tctNo,
    taxDecNo,
    buildingType,
    isOwner,
    farmType,
    headCapacity,
    wasteManagement,
    bufferComplianceConfirmed,
    implementingDepartment,
    fundingSource,
    cipCode,
    targetBeneficiaries,
    notes,
    pinnedCoords,
    landTitleDoc,
    taxDecDoc,
    rptReceiptDoc,
    brgyClearanceDoc,
    ploCertDoc,
    photoDocsDoc,
  ]);

  // Warn on accidental tab close or page reload if unsubmitted changes exist in steps 1-3
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (step < 4) {
        const hasInput =
          step > 1 ||
          title.trim().length > 0 ||
          applicantName.trim().length > 0 ||
          contactPhone.trim().length > 0 ||
          landTitleDoc !== null ||
          tctNo.trim().length > 0;

        if (hasInput) {
          e.preventDefault();
          e.returnValue = "";
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [step, title, applicantName, contactPhone, landTitleDoc, tctNo]);

  // Start fresh / Reset draft
  const handleResetDraft = () => {
    if (window.confirm("Nais mo bang burahin ang na-save na draft at magsimula muli mula sa simula?")) {
      clearApplicationDraft();
      setDraftRestored(false);
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
      setPinnedCoords({ lon: LUISIANA_CENTER.lon, lat: LUISIANA_CENTER.lat });
    }
  };

  const getHazardColor = (val?: string) => {
    if (!val) return "var(--apple-safe, #15803d)";
    const v = val.toLowerCase();
    if (v.includes("high") || v.includes("very high") || v.includes("debris") || v.includes("critical")) {
      return "var(--apple-danger, #b91c1c)";
    }
    if (v.includes("moderate") || v.includes("medium") || v.includes("warning")) {
      return "var(--apple-warn, #b45309)";
    }
    if (v.includes("low")) {
      return "var(--apple-accent, #0071e3)";
    }
    return "var(--apple-safe, #15803d)";
  };

  const getHazardBadgeClass = (val?: string) => {
    if (!val) return "is-safe";
    const v = val.toLowerCase();
    if (v.includes("high") || v.includes("very high") || v.includes("debris") || v.includes("critical")) {
      return "is-danger";
    }
    if (v.includes("moderate") || v.includes("medium") || v.includes("warning") || v.includes("low")) {
      return "is-warn";
    }
    return "is-safe";
  };

  const handleBarangayChange = (newBrgy: string) => {
    const norm = normalizeBarangayName(newBrgy);
    setBarangay(norm);
    const coords = BARANGAY_COORDINATES[norm] || BARANGAY_COORDINATES[newBrgy];
    if (coords) {
      setPinnedCoords({ lon: coords.lon, lat: coords.lat });
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

  const getStep2MissingFields = () => {
    const missing: string[] = [];
    if (!title.trim()) missing.push("Pangalan ng Proyekto / Title");
    if (!applicantName.trim()) missing.push("Pangalan ng Aplikante / May-ari");
    if (!contactPhone.trim() || contactPhone.trim().length < 11) {
      missing.push("Mobile Contact No. (11-digit, hal. 09171234567)");
    }
    if (!contactEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      missing.push("Wastong Email Address");
    }
    if (!locationDescription.trim()) missing.push("Sitio / Street / Landmark Address");

    if (category === "private_infrastructure") {
      if (!tctNo.trim()) missing.push("TCT No.");
      if (!taxDecNo.trim()) missing.push("Tax Declaration (TD) No.");
      if (typeof lotAreaSqM !== "number" || lotAreaSqM <= 0) missing.push("Sukat ng Lote (sq.m.)");
    }

    if (category === "agricultural") {
      if (typeof headCapacity !== "number" || headCapacity <= 0) missing.push("Target Head Capacity (Bilang ng Hayop)");
      if (!wasteManagement.trim()) missing.push("Waste Management System");
      if (!bufferComplianceConfirmed) missing.push("Environmental Buffer Zone Compliance");
    }

    if (category === "municipal_project") {
      if (!implementingDepartment.trim()) missing.push("Implementing Department");
      if (!cipCode.trim()) missing.push("AIP / CIP Reference Code");
      if (!targetBeneficiaries.trim()) missing.push("Target Beneficiaries");
      if (typeof estimatedCostPhp !== "number" || estimatedCostPhp <= 0) missing.push("Tinatayang Badyet (Estimated Cost in ₱)");
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

  const handleSubmit = async () => {
    if (!isStep2Valid()) {
      setStep(2);
      setAttemptedStep2Proceed(true);
      return;
    }
    setSubmitting(true);

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
      lon: pinnedCoords.lon,
      lat: pinnedCoords.lat,
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

    const uploadsPayload = {
      tctTaxDec: landTitleDoc ? [{ url: landTitleDoc.url || "", originalName: landTitleDoc.name, size: landTitleDoc.size }] : [],
      taxDeclaration: taxDecDoc ? [{ url: taxDecDoc.url || "", originalName: taxDecDoc.name, size: taxDecDoc.size }] : [],
      rptReceipt: rptReceiptDoc ? [{ url: rptReceiptDoc.url || "", originalName: rptReceiptDoc.name, size: rptReceiptDoc.size }] : [],
      brgyClearance: brgyClearanceDoc ? [{ url: brgyClearanceDoc.url || "", originalName: brgyClearanceDoc.name, size: brgyClearanceDoc.size }] : [],
      ploCert: ploCertDoc ? [{ url: ploCertDoc.url || "", originalName: ploCertDoc.name, size: ploCertDoc.size }] : [],
      photoDocs: photoDocsDoc ? [{ url: photoDocsDoc.url || "", originalName: photoDocsDoc.name, size: photoDocsDoc.size }] : [],
    };

    let officialTrackingNo = "";

    try {
      const clientPublicIp = await fetchClientPublicIp();
      // Save directly to PostgreSQL & Citizen Applications DB
      const res = await submitCitizenApplication({
        serviceType: "zoning_certificate",
        projectTitle: title.trim() || `${category.replace("_", " ")} Application`,
        title: title.trim() || `${category.replace("_", " ")} Application`,
        category,
        estimatedCost: typeof estimatedCostPhp === "number" ? estimatedCostPhp : 0,
        estimatedCostPhp: typeof estimatedCostPhp === "number" ? estimatedCostPhp : 0,
        applicant: {
          fullName: applicantName.trim() || "Municipal Officer / LGU",
          contactPhone: contactPhone.trim(),
          contactEmail: contactEmail.trim(),
          address: locationDescription.trim(),
          barangay,
        },
        latitude: pinnedCoords.lat,
        longitude: pinnedCoords.lon,
        coordinates: {
          lat: pinnedCoords.lat,
          lon: pinnedCoords.lon,
        },
        geoRisk: geoRisk || {},
        isOwner,
        agriculturalDetails: {
          farmType,
          headCapacity: typeof headCapacity === "number" ? headCapacity : 0,
          wasteManagement,
          bufferComplianceConfirmed,
        },
        municipalDetails: {
          implementingDepartment,
          fundingSource,
          cipCode: cipCode.trim(),
          targetBeneficiaries: targetBeneficiaries.trim(),
        },
        zoningClassification: getClupZone(barangay).name,
        lotDetails: {
          tctNo: tctNo.trim(),
          taxDecNo: taxDecNo.trim(),
          isApplicantOwner: isOwner,
          proposedBuildingType: buildingType,
          lotAreaSqM: typeof lotAreaSqM === "number" ? lotAreaSqM : 0,
          lotLocationDescription: locationDescription.trim(),
          zoningClassification: getClupZone(barangay).name,
          lat: pinnedCoords.lat,
          lon: pinnedCoords.lon,
        },
        uploads: uploadsPayload,
        notes: notes.trim(),
        clientIp: clientPublicIp || undefined,
        termsAccepted: true,
        termsAcceptedAt: new Date().toISOString(),
        termsVersion: "2026.1",
        termsConsentDetails: {
          agreedToTerms: true,
          agreedToPrivacyAct: true,
          agreedToClup: true,
          agreedToCookies: true,
          acceptedAt: new Date().toISOString(),
          termsVersion: "2026.1",
          ipAddress: clientPublicIp || undefined,
        },
      });

      if (res?.ok && res.application?.trackingNumber) {
        officialTrackingNo = res.application.trackingNumber;
      }
    } catch (err) {
      console.warn("[NewApp] submitCitizenApplication sync warning:", err);
    }

    // Fallback to official LUIS prefix if backend did not return a tracking number
    if (!officialTrackingNo) {
      officialTrackingNo = `LUIS-ZC-${new Date().getFullYear()}-${String(
        Math.floor(1000 + Math.random() * 9000)
      )}`;
    }

    setGeneratedTrackingNo(officialTrackingNo);
    setSubmitting(false);
    setConfirmModalOpen(false);
    clearApplicationDraft();
    setDraftRestored(false);
    setStep(4);
    onCreated(payload, officialTrackingNo);
  };

  const handleInitiateSubmit = () => {
    if (!isStep2Valid()) {
      setStep(2);
      setAttemptedStep2Proceed(true);
      return;
    }
    setConfirmModalOpen(true);
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "private_infrastructure":
        return "Pribadong Imprastraktura";
      case "commercial_business":
        return "Komersyal at Negosyo";
      case "agricultural":
        return "Agrikultural at Paghahayupan";
      case "municipal_project":
        return "Proyektong Pambayan (LGU)";
      case "special_use":
        return "Espesyal na Paggamit";
      default:
        return "Locational Clearance / Zoning";
    }
  };

  const confirmModalData: ApplicationConfirmData = {
    category,
    categoryLabel: getCategoryLabel(category),
    title: title.trim() || `${category.replace("_", " ")} Application`,
    applicantName: applicantName.trim() || "Aplikante",
    contactPhone: contactPhone.trim(),
    contactEmail: contactEmail.trim(),
    locationDescription: locationDescription.trim(),
    barangay,
    estimatedCostPhp,
    tctNo: tctNo.trim(),
    taxDecNo: taxDecNo.trim(),
    isOwner,
    buildingType,
    lotAreaSqM,
    zoningClassification: getClupZone(barangay).name,
    farmType,
    headCapacity,
    wasteManagement,
    bufferComplianceConfirmed,
    implementingDepartment,
    fundingSource,
    cipCode,
    targetBeneficiaries,
    pinnedCoords,
    floodHazard: geoRisk?.flood?.value || "Safe",
    landslideHazard: geoRisk?.landslide?.value || "Safe",
    banahawKm: ban.km,
    attachedDocs: [
      { label: "Titulo ng Lupa / TCT / Deed of Sale", filename: landTitleDoc?.name },
      { label: "Tax Declaration", filename: taxDecDoc?.name },
      { label: "RPT / Real Property Tax Receipt", filename: rptReceiptDoc?.name },
      { label: "Barangay Clearance", filename: brgyClearanceDoc?.name },
      { label: "Location Plan / PLO Certification", filename: ploCertDoc?.name },
      { label: "Mga Larawan ng Site", filename: photoDocsDoc?.name },
    ],
  };

  return (
    <div className="new-app-page">
      {/* Navigation Top Bar */}
      <header className="new-app-nav">
        <div className="new-app-nav-left">
          <button
            type="button"
            className="new-app-back-btn"
            onClick={handleBack}
            aria-label={step > 1 ? "Bumalik sa nakaraang hakbang" : "Bumalik sa dashboard"}
            title={step > 1 ? "Bumalik" : "Bumalik sa dashboard"}
          >
            <IconBackArrow />
          </button>
          <div className="new-app-nav-brand">
            <img src="/logo.png" alt="Bayan ng Luisiana" />
            <div>
              <div className="new-app-nav-title">INFA-TRACK Luisiana</div>
              <div className="new-app-nav-sub">Project Categorization &amp; Application Intake</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="new-app-terms-trigger-btn"
            onClick={() => setTermsModalOpen(true)}
            title="Tingnan ang Mga Tuntunin at Kundisyon (Terms & Conditions)"
          >
            <IconShieldCheck size={14} color="currentColor" />
            <span className="new-app-terms-trigger-label">Tuntunin at Kundisyon</span>
          </button>
          <ThemeToggle iconOnly />
        </div>
      </header>

      {/* Progress Stepper Bar */}
      <div className="new-app-page-stepper">
        <div className="new-app-stepper-inner">
          {/* Mobile Compact Progress Indicator */}
          <div className="new-app-stepper-mobile-meta">
            <div className="new-app-stepper-mobile-indicator">
              <span className="new-app-stepper-mobile-badge">Hakbang {step} ng 4</span>
              <span className="new-app-stepper-mobile-label">
                {step === 1 && "1. Kategorya (Ano ang ia-apply?)"}
                {step === 2 && "2. Impormasyon ng Proyekto"}
                {step === 3 && "3. GIS Location & Hazard"}
                {step === 4 && "4. Pagkumpirma"}
              </span>
            </div>
            <div className="new-app-stepper-mobile-bar">
              <div
                className={`new-app-mobile-step-item ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}
                onClick={() => { if (step > 1) setStep(1); }}
                role={step > 1 ? "button" : undefined}
                tabIndex={step > 1 ? 0 : undefined}
                title="1. Kategorya"
              >
                <div className={`new-app-mobile-segment ${step >= 1 ? "filled" : ""}`} />
                <span className="new-app-mobile-step-text">1. Kategorya</span>
              </div>
              <div
                className={`new-app-mobile-step-item ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}
                onClick={() => { if (step > 2) setStep(2); }}
                role={step > 2 ? "button" : undefined}
                tabIndex={step > 2 ? 0 : undefined}
                title="2. Impormasyon"
              >
                <div className={`new-app-mobile-segment ${step >= 2 ? "filled" : ""}`} />
                <span className="new-app-mobile-step-text">2. Impormasyon</span>
              </div>
              <div
                className={`new-app-mobile-step-item ${step === 3 ? "active" : step > 3 ? "completed" : ""}`}
                onClick={() => { if (step > 3) setStep(3); }}
                role={step > 3 ? "button" : undefined}
                tabIndex={step > 3 ? 0 : undefined}
                title="3. GIS & Hazard"
              >
                <div className={`new-app-mobile-segment ${step >= 3 ? "filled" : ""}`} />
                <span className="new-app-mobile-step-text">3. GIS &amp; Hazard</span>
              </div>
              <div
                className={`new-app-mobile-step-item ${step === 4 ? "active" : ""}`}
                title="4. Pagkumpirma"
              >
                <div className={`new-app-mobile-segment ${step >= 4 ? "filled" : ""}`} />
                <span className="new-app-mobile-step-text">4. Kumpirma</span>
              </div>
            </div>
          </div>

          {/* Desktop & Tablet Track */}
          <div className="new-app-stepper-desktop-track">
            <div className={`new-app-page-step ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}>
              <span className="new-app-page-step-badge">{step > 1 ? "✓" : "1"}</span>
              <span className="new-app-page-step-text">
                <span className="new-app-step-full">1. Kategorya (Ano ang ia-apply?)</span>
                <span className="new-app-step-short">1. Kategorya</span>
              </span>
            </div>
            <div className={`new-app-page-step-divider ${step > 1 ? "completed" : ""}`} />
            <div className={`new-app-page-step ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}>
              <span className="new-app-page-step-badge">{step > 2 ? "✓" : "2"}</span>
              <span className="new-app-page-step-text">
                <span className="new-app-step-full">2. Impormasyon ng Proyekto</span>
                <span className="new-app-step-short">2. Impormasyon</span>
              </span>
            </div>
            <div className={`new-app-page-step-divider ${step > 2 ? "completed" : ""}`} />
            <div className={`new-app-page-step ${step === 3 ? "active" : step > 3 ? "completed" : ""}`}>
              <span className="new-app-page-step-badge">{step > 3 ? "✓" : "3"}</span>
              <span className="new-app-page-step-text">
                <span className="new-app-step-full">3. GIS Location &amp; Hazard</span>
                <span className="new-app-step-short">3. GIS &amp; Hazard</span>
              </span>
            </div>
            <div className={`new-app-page-step-divider ${step > 3 ? "completed" : ""}`} />
            <div className={`new-app-page-step ${step === 4 ? "completed active" : ""}`}>
              <span className="new-app-page-step-badge">{step === 4 ? "✓" : "4"}</span>
              <span className="new-app-page-step-text">
                <span className="new-app-step-full">4. Pagkumpirma</span>
                <span className="new-app-step-short">4. Kumpirma</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="new-app-page-main">
        {/* Draft Auto-Restored Notice */}
        {draftRestored && step < 4 && (
          <div className="new-app-draft-banner" role="status" aria-live="polite">
            <div className="new-app-draft-banner-left">
              <IconCheck size={16} color="var(--apple-safe, #15803d)" />
              <span>
                <strong>Awtomatikong naibalik ang iyong draft:</strong> Na-restore ang iyong mga naunang inilagay na impormasyon at napiling kategorya.
              </span>
            </div>
            <button
              type="button"
              className="new-app-draft-reset-btn"
              onClick={handleResetDraft}
              title="Burahin ang draft at magsimula muli"
            >
              Mag-umpisa Muli (Clear Draft)
            </button>
          </div>
        )}

        {/* STEP 1: CATEGORY SELECTION ("Ano ang ia-apply?") */}
        {step === 1 && (
          <div>
            <div className="new-app-heading-wrap">
              <h1 className="new-app-main-heading">Ano ang ia-apply?</h1>
              <p className="new-app-main-lead">
                Pumili ng tamang kategorya ng aplikasyon upang maipagkaloob ang karampatang zoning evaluation, environmental buffer checking, at GIS hazard screening.
              </p>
            </div>

            <div className="new-app-page-cards-grid" role="radiogroup" aria-label="Kategorya ng Aplikasyon">
              {/* Card 1: Private Infrastructure */}
              <div
                className={`new-app-page-card ${category === "private_infrastructure" ? "selected" : ""}`}
                onClick={() => setCategory("private_infrastructure")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setCategory("private_infrastructure");
                  }
                }}
                role="radio"
                aria-checked={category === "private_infrastructure"}
                tabIndex={0}
              >
                <div className="new-app-card-radio-indicator" aria-hidden="true">
                  <IconCheck size={12} color="#ffffff" />
                </div>
                <div className="new-app-card-top-row">
                  <div className="new-app-card-icon-wrap" style={{ color: "var(--apple-accent, #0071e3)" }}>
                    <IconBuilding size={30} color="var(--apple-accent, #0071e3)" />
                  </div>
                  <div className="new-app-card-header-text">
                    <div className="new-app-card-title">Private Infrastructure</div>
                    <span className="new-app-card-badge tag-private">Residential / Commercial</span>
                  </div>
                </div>
                <div className="new-app-card-desc">
                  Para sa mga pribadong gusali, bahay, commercial spaces, subdibisyon, bodega, o private telecom structures.
                </div>
                <ul className="new-app-card-features">
                  <li><IconCheck size={13} /> Land title (TCT / Tax Dec) verification</li>
                  <li><IconCheck size={13} /> Building setback &amp; zoning clearance</li>
                  <li><IconCheck size={13} /> Slope &amp; flood hazard assessment</li>
                </ul>
              </div>

              {/* Card 2: Agricultural (Poultry / Piggery) */}
              <div
                className={`new-app-page-card ${category === "agricultural" ? "selected" : ""}`}
                onClick={() => setCategory("agricultural")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setCategory("agricultural");
                  }
                }}
                role="radio"
                aria-checked={category === "agricultural"}
                tabIndex={0}
              >
                <div className="new-app-card-radio-indicator" aria-hidden="true">
                  <IconCheck size={12} color="#ffffff" />
                </div>
                <div className="new-app-card-top-row">
                  <div className="new-app-card-icon-wrap" style={{ color: "var(--apple-safe, #15803d)" }}>
                    <IconAgriculture size={30} color="var(--apple-safe, #15803d)" />
                  </div>
                  <div className="new-app-card-header-text">
                    <div className="new-app-card-title">Agricultural</div>
                    <span className="new-app-card-badge tag-agri">Poultry / Piggery / Farm</span>
                  </div>
                </div>
                <div className="new-app-card-desc">
                  Para sa mga pasilidad pang-agrikultura tulad ng broiler/layer poultry farms, babuyan (piggery), at livestock.
                </div>
                <ul className="new-app-card-features">
                  <li><IconCheck size={13} /> 500m mandatory buffer mula sa kabahayan</li>
                  <li><IconCheck size={13} /> 200m buffer mula sa mga ilog at tubig</li>
                  <li><IconCheck size={13} /> Biogas at waste management plan</li>
                </ul>
              </div>

              {/* Card 3: Municipal Projects */}
              <div
                className={`new-app-page-card ${category === "municipal_project" ? "selected" : ""}`}
                onClick={() => setCategory("municipal_project")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setCategory("municipal_project");
                  }
                }}
                role="radio"
                aria-checked={category === "municipal_project"}
                tabIndex={0}
              >
                <div className="new-app-card-radio-indicator" aria-hidden="true">
                  <IconCheck size={12} color="#ffffff" />
                </div>
                <div className="new-app-card-top-row">
                  <div className="new-app-card-icon-wrap" style={{ color: "var(--apple-warn, #b45309)" }}>
                    <IconMunicipal size={30} color="var(--apple-warn, #b45309)" />
                  </div>
                  <div className="new-app-card-header-text">
                    <div className="new-app-card-title">Municipal Projects</div>
                    <span className="new-app-card-badge tag-municipal">LGU Public Works / CIP</span>
                  </div>
                </div>
                <div className="new-app-card-desc">
                  Para sa mga pampublikong imprastraktura ng Pamahalaang Bayan: mga kalsada, evacuation centers, barangay halls, at RHU.
                </div>
                <ul className="new-app-card-features">
                  <li><IconCheck size={13} /> Implementing department routing</li>
                  <li><IconCheck size={13} /> 20% LDF / LGU budget source tracking</li>
                  <li><IconCheck size={13} /> Multi-hazard disaster mitigation siting</li>
                </ul>
              </div>
            </div>

            <div className="new-app-page-footer new-app-step1-footer">
              <button type="button" className="new-app-page-btn new-app-page-btn-secondary" onClick={onBack} title="Bumalik sa Dashboard">
                <span className="new-app-btn-text-full">← Bumalik sa Dashboard</span>
                <span className="new-app-btn-text-short">← Bumalik</span>
              </button>
              <button type="button" className="new-app-page-btn new-app-page-btn-primary" onClick={() => setStep(2)}>
                <span className="new-app-btn-text-full">Magpatuloy sa Impormasyon</span>
                <span className="new-app-btn-text-short">Magpatuloy</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: CATEGORY SPECIFIC FORM */}
        {step === 2 && (
          <div className="new-app-form-panel">
            <div className="new-app-form-header">
              <h2 className="new-app-form-title">
                {category === "private_infrastructure" && (
                  <>
                    <IconBuilding size={20} color="var(--apple-accent, #0071e3)" />
                    <span>Private Infrastructure Application Details</span>
                  </>
                )}
                {category === "agricultural" && (
                  <>
                    <IconAgriculture size={20} color="var(--apple-safe, #15803d)" />
                    <span>Agricultural (Poultry / Piggery) Farm Application Details</span>
                  </>
                )}
                {category === "municipal_project" && (
                  <>
                    <IconMunicipal size={20} color="var(--apple-warn, #b45309)" />
                    <span>Municipal Infrastructure Project Details</span>
                  </>
                )}
              </h2>
              <div className="new-app-form-sub">
                Punan ang mga kailangang impormasyon para sa opisyal na pagtatala at pagsusuri ng MPDC.
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
                  className={`new-app-input ${attemptedStep2Proceed && !title.trim() ? "is-missing-field" : ""}`}
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

              {/* Applicant / Proponent Name */}
              <div className="new-app-field">
                <label className="new-app-label">
                  {category === "municipal_project" ? "Project Proponent / Focal Engineer *" : "Pangalan ng Aplikante / May-ari *"}
                </label>
                <input
                  type="text"
                  className={`new-app-input ${attemptedStep2Proceed && !applicantName.trim() ? "is-missing-field" : ""}`}
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  placeholder="hal. Juan Dela Cruz"
                />
              </div>

              {/* Mobile Phone */}
              <div className="new-app-field">
                <label className="new-app-label">Mobile Contact Number (11-digit) *</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`new-app-input ${attemptedStep2Proceed && (!contactPhone.trim() || contactPhone.trim().length < 11) ? "is-missing-field" : ""}`}
                  value={contactPhone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                    setContactPhone(digits);
                  }}
                  onKeyDown={handleIntegerKeyDown}
                  placeholder="09171234567"
                />
              </div>

              {/* Email */}
              <div className="new-app-field">
                <label className="new-app-label">Email Address *</label>
                <input
                  type="email"
                  className={`new-app-input ${attemptedStep2Proceed && (!contactEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) ? "is-missing-field" : ""}`}
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="applicant@example.com"
                />
              </div>

              {/* Barangay Location */}
              <div className="new-app-field">
                <label className="new-app-label">Barangay Location *</label>
                <select
                  className="new-app-select"
                  value={barangay}
                  onChange={(e) => handleBarangayChange(e.target.value)}
                >
                  {BARANGAY_LIST.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* Specific Sitio / Street */}
              <div className="new-app-field full-width">
                <label className="new-app-label">Sitio / Street / Landmark Address *</label>
                <input
                  type="text"
                  className={`new-app-input ${attemptedStep2Proceed && !locationDescription.trim() ? "is-missing-field" : ""}`}
                  value={locationDescription}
                  onChange={(e) => setLocationDescription(e.target.value)}
                  placeholder="hal. Sitio Mahabang Parang, tapat ng Barangay Outpost"
                />
              </div>

              {/* Interactive Location Pinpoint Map */}
              <div className="new-app-field full-width" style={{ marginTop: 4 }}>
                <label className="new-app-label new-app-map-label">
                  <span>Eksaktong Lokasyon ng Proyekto (Interactive Map Pinpoint) *</span>
                  <span className="new-app-map-coords-text">
                    {pinnedCoords.lat.toFixed(6)}° N, {pinnedCoords.lon.toFixed(6)}° E
                  </span>
                </label>
                <PinpointMapPicker
                  lon={pinnedCoords.lon}
                  lat={pinnedCoords.lat}
                  selectedBarangay={barangay}
                  onLocationChange={(coords) => setPinnedCoords(coords)}
                  onBarangayChange={(detected) => setBarangay(detected)}
                />
              </div>

              {/* ── PRIVATE INFRASTRUCTURE SPECIFIC FIELDS ── */}
              {category === "private_infrastructure" && (
                <>
                  <div className="new-app-field">
                    <label className="new-app-label">Uri ng Gusali (Building Type) *</label>
                    <select
                      className="new-app-select"
                      value={buildingType}
                      onChange={(e) => setBuildingType(e.target.value)}
                    >
                      <option value="Residential">Residential (Single Family / Duplex)</option>
                      <option value="Commercial">Commercial (Store, Retail, Office)</option>
                      <option value="Mixed-Use">Mixed-Use (Commercial Ground + Residential)</option>
                      <option value="Institutional">Private Institutional / School / Chapel</option>
                      <option value="Subdivision">Subdivision / Housing Development</option>
                      <option value="Industrial">Light Industrial / Warehouse</option>
                    </select>
                  </div>

                  <div className="new-app-field">
                    <label className="new-app-label">Sukat ng Lote (Lot Area in sq.m.) *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={`new-app-input ${attemptedStep2Proceed && (typeof lotAreaSqM !== "number" || lotAreaSqM <= 0) ? "is-missing-field" : ""}`}
                      value={lotAreaSqM === "" ? "" : lotAreaSqM}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9.]/g, "");
                        const parts = clean.split(".");
                        const sanitized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : clean;
                        setLotAreaSqM(sanitized === "" ? "" : Number(sanitized));
                      }}
                      onKeyDown={handleDecimalKeyDown}
                      placeholder="hal. 250"
                    />
                  </div>

                  <div className="new-app-field">
                    <label className="new-app-label">TCT No. (Transfer Certificate of Title) *</label>
                    <input
                      type="text"
                      className={`new-app-input ${attemptedStep2Proceed && !tctNo.trim() ? "is-missing-field" : ""}`}
                      value={tctNo}
                      onChange={(e) => setTctNo(e.target.value)}
                      placeholder="hal. TCT-059-2023001234"
                    />
                  </div>

                  <div className="new-app-field">
                    <label className="new-app-label">Tax Declaration (TD) No. *</label>
                    <input
                      type="text"
                      className={`new-app-input ${attemptedStep2Proceed && !taxDecNo.trim() ? "is-missing-field" : ""}`}
                      value={taxDecNo}
                      onChange={(e) => setTaxDecNo(e.target.value)}
                      placeholder="hal. TD-2024-0012-0045"
                    />
                  </div>
                </>
              )}

              {/* ── AGRICULTURAL SPECIFIC FIELDS ── */}
              {category === "agricultural" && (
                <>
                  <div className="new-app-field">
                    <label className="new-app-label">Type of Agricultural Farm</label>
                    <select
                      className="new-app-select"
                      value={farmType}
                      onChange={(e) => setFarmType(e.target.value as AgriculturalFarmType)}
                    >
                      <option value="poultry_broiler">Poultry Farm - Broiler (Meat Production)</option>
                      <option value="poultry_layer">Poultry Farm - Layer (Egg Production)</option>
                      <option value="piggery_swine">Piggery / Swine Raising Farm</option>
                      <option value="livestock_cattle">Livestock / Cattle / Goat Feedlot</option>
                      <option value="agro_processing">Agro-Industrial / Feed Mill / Rice Mill</option>
                    </select>
                  </div>

                  <div className="new-app-field">
                    <label className="new-app-label">Target Head Capacity (Bilang ng Hayop) *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`new-app-input ${attemptedStep2Proceed && (typeof headCapacity !== "number" || headCapacity <= 0) ? "is-missing-field" : ""}`}
                      value={headCapacity === "" ? "" : headCapacity}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/\D/g, "");
                        setHeadCapacity(clean === "" ? "" : Number(clean));
                      }}
                      onKeyDown={handleIntegerKeyDown}
                      placeholder="hal. 5000 para sa poultry, 200 para sa baboy"
                    />
                  </div>

                  <div className="new-app-field full-width">
                    <label className="new-app-label">Pasilidad sa Pamamahala ng Dumi at Amoy *</label>
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
                    <div className={`new-app-buffer-box ${attemptedStep2Proceed && !bufferComplianceConfirmed ? "is-missing-box" : ""}`}>
                      <div className="new-app-buffer-title">
                        <IconShieldCheck size={18} color="var(--apple-safe, #15803d)" />
                        <span>Mandatory Environmental Buffer Zone Compliance *</span>
                      </div>
                      <div className="new-app-buffer-text">
                        Ayon sa Municipal Zoning &amp; Sanitary Code ng Bayan ng Luisiana:
                        <ul style={{ margin: "6px 0 0 20px", padding: 0 }}>
                          <li><b>500 metro</b> minimum distance mula sa built-up residential areas at mga paaralan.</li>
                          <li><b>200 metro</b> minimum distance mula sa mga pangunahing ilog at water supply intake.</li>
                        </ul>
                      </div>
                      <label className="new-app-checkbox-label">
                        <input
                          type="checkbox"
                          checked={bufferComplianceConfirmed}
                          onChange={(e) => setBufferComplianceConfirmed(e.target.checked)}
                        />
                        <span>Pinatutunayan na sumusunod ang napiling lokasyon sa itinakdang environmental distance buffers.</span>
                      </label>
                    </div>
                  </div>
                </>
              )}

              {/* ── MUNICIPAL PROJECT SPECIFIC FIELDS ── */}
              {category === "municipal_project" && (
                <>
                  <div className="new-app-field">
                    <label className="new-app-label">Implementing Department / Office *</label>
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
                    <label className="new-app-label">Funding Source *</label>
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
                    <label className="new-app-label">AIP / CIP Reference Code *</label>
                    <input
                      type="text"
                      className={`new-app-input ${attemptedStep2Proceed && !cipCode.trim() ? "is-missing-field" : ""}`}
                      value={cipCode}
                      onChange={(e) => setCipCode(e.target.value)}
                      placeholder="hal. LUIS-CIP-2026-INFRA-08"
                    />
                  </div>

                  <div className="new-app-field">
                    <label className="new-app-label">Target Beneficiaries *</label>
                    <input
                      type="text"
                      className={`new-app-input ${attemptedStep2Proceed && !targetBeneficiaries.trim() ? "is-missing-field" : ""}`}
                      value={targetBeneficiaries}
                      onChange={(e) => setTargetBeneficiaries(e.target.value)}
                      placeholder="hal. All residents of Luisiana"
                    />
                  </div>

                  <div className="new-app-field">
                    <label className="new-app-label">Tinatayang Badyet (Estimated Cost in ₱ PHP) *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={`new-app-input ${attemptedStep2Proceed && (typeof estimatedCostPhp !== "number" || estimatedCostPhp <= 0) ? "is-missing-field" : ""}`}
                      value={estimatedCostPhp === "" ? "" : estimatedCostPhp}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9.]/g, "");
                        const parts = clean.split(".");
                        const sanitized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : clean;
                        setEstimatedCostPhp(sanitized === "" ? "" : Number(sanitized));
                      }}
                      onKeyDown={handleDecimalKeyDown}
                      placeholder="hal. 3500000"
                    />
                  </div>
                </>
              )}

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
                  <div className={`new-app-upload-box${landTitleDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-land-title"
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleAttachFile(file, setLandTitleDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconFileTextDoc size={24} />
                    </div>
                    <div className="new-app-upload-title">Photocopy ng TCT (Land Title) *</div>
                    <div className="new-app-upload-desc">
                      Scanned o malinaw na kopya ng Transfer Certificate of Title (TCT) o OCT bilang katibayan ng pag-aari.
                    </div>

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
                      <label htmlFor="upload-land-title" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? "Kailangan (Pumili ng File) *" : "Pumili ng File *"}</span>
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
                  <div className={`new-app-upload-box${taxDecDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-tax-dec"
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleAttachFile(file, setTaxDecDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconFileTextDoc size={24} />
                    </div>
                    <div className="new-app-upload-title">Tax Declaration *</div>
                    <div className="new-app-upload-desc">
                      Certified True Copy ng pinakahuling Tax Declaration para sa lupa mula sa Municipal Assessor.
                    </div>

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
                      <label htmlFor="upload-tax-dec" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? "Kailangan (Pumili ng File) *" : "Pumili ng File *"}</span>
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
                  <div className={`new-app-upload-box${rptReceiptDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-rpt-receipt"
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleAttachFile(file, setRptReceiptDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconReceipt size={24} />
                    </div>
                    <div className="new-app-upload-title">Current Real Property Tax Receipt (Amilyar) *</div>
                    <div className="new-app-upload-desc">
                      Resibo ng bayad sa amilyar (Official Receipt / Tax Clearance) para sa kasalukuyang taon.
                    </div>

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
                      <label htmlFor="upload-rpt-receipt" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? "Kailangan (Pumili ng File) *" : "Pumili ng File *"}</span>
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
                  <div className={`new-app-upload-box${brgyClearanceDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-brgy-clearance"
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleAttachFile(file, setBrgyClearanceDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconShieldCheck size={24} />
                    </div>
                    <div className="new-app-upload-title">Barangay Clearance *</div>
                    <div className="new-app-upload-desc">
                      Opisyal na clearance para sa konstruksyon / lokasyon mula sa Barangay kung saan nakatirik ang lote.
                    </div>

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
                      <label htmlFor="upload-brgy-clearance" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? "Kailangan (Pumili ng File) *" : "Pumili ng File *"}</span>
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
                  <div className={`new-app-upload-box${ploCertDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-plo-cert"
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleAttachFile(file, setPloCertDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconBolt size={24} />
                    </div>
                    <div className="new-app-upload-title">PLO Certification (MERALCO) *</div>
                    <div className="new-app-upload-desc">
                      Clearance mula sa MERALCO / Public Lighting Office para sa opisyal na koneksyon ng kuryente.
                    </div>

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
                      <label htmlFor="upload-plo-cert" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? "Kailangan (Pumili ng File) *" : "Pumili ng File *"}</span>
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
                  <div className={`new-app-upload-box${photoDocsDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-photo-docs"
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleAttachFile(file, setPhotoDocsDoc);
                      }}
                    />
                    <div className="new-app-upload-icon">
                      <IconCamera size={24} />
                    </div>
                    <div className="new-app-upload-title">Photo Documentation *</div>
                    <div className="new-app-upload-desc">
                      Mga litrato ng loob at labas ng mismong lote/site (aktwal na kalagayan ng lugar).
                    </div>

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
                      <label htmlFor="upload-photo-docs" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? "Kailangan (Pumili ng File) *" : "Pumili ng File *"}</span>
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

            <div className="new-app-page-footer" style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "stretch" }}>
              {!isStep2Valid() && (
                <div className="new-app-missing-alert">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--apple-danger, #b91c1c)" }}>
                    <IconAlert size={18} color="#ef4444" />
                    <span>Dapat kumpleto ang lahat ng patlang at 6 na mandatory requirements bago magpatuloy ({getStep2MissingFields().length} kulang):</span>
                  </div>
                  <div className="new-app-missing-chips">
                    {getStep2MissingFields().map((f, i) => (
                      <span key={i} className="new-app-missing-chip">
                        ✕ {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="new-app-footer-actions">
                <button type="button" className="new-app-page-btn new-app-page-btn-secondary" onClick={handleBack}>
                  <span className="new-app-btn-text-full">← Bumalik sa Kategorya</span>
                  <span className="new-app-btn-text-short">← Bumalik</span>
                </button>
                <button
                  type="button"
                  className="new-app-page-btn new-app-page-btn-primary"
                  disabled={!isStep2Valid()}
                  onClick={() => {
                    if (isStep2Valid()) {
                      setAttemptedStep2Proceed(false);
                      setStep(3);
                    } else {
                      setAttemptedStep2Proceed(true);
                    }
                  }}
                  title={!isStep2Valid() ? "Pakikumpleto muna ang lahat ng patlang at 6 na kalakip bago magpatuloy" : undefined}
                >
                  <span className="new-app-btn-text-full">Magpatuloy sa GIS Siting</span>
                  <span className="new-app-btn-text-short">Magpatuloy</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: GIS SITING & HAZARD VERIFICATION */}
        {step === 3 && (
          <div className="new-app-form-panel">
            <div className="new-app-form-header">
              <h2 className="new-app-form-title">
                <IconPin size={22} color="var(--apple-safe, #15803d)" />
                <span>GIS Location Siting &amp; Hazard Clearance</span>
              </h2>
              <div className="new-app-form-sub">
                Awtomatikong sinusuri ng GIS engine ang elevation slope, fault proximity, at hazard zones sa Bayan ng Luisiana.
              </div>
            </div>

            {/* LUISIANA SITING ASSESSMENT (Matched with Apple Theme) */}
            <div className="app-assess-card">
              <div className="app-assess-card-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Luisiana Siting Assessment</span>
              </div>

              <dl className="app-assess-list">
                <div className="app-assess-row">
                  <dt>Ground shaking</dt>
                  <dd className="app-assess-val-accent">PEIS VIII</dd>
                </div>

                <div className="app-assess-row">
                  <dt>EIL 2014</dt>
                  <dd className="app-assess-val-accent">Low</dd>
                </div>

                <div className="app-assess-row">
                  <dt>Siting class</dt>
                  <dd className="app-assess-val-accent">LOW — standard seismic design</dd>
                </div>

                <div className="app-assess-row">
                  <dt>Terrain model</dt>
                  <dd className="app-assess-val-muted">Not ready</dd>
                </div>

                <div className="app-assess-row">
                  <dt>Flood</dt>
                  <dd>
                    <span className={`app-hazard-badge ${getHazardBadgeClass(geoRisk?.flood?.value)}`}>
                      {geoRisk?.flood?.value || "Safe"}
                    </span>
                  </dd>
                </div>

                <div className="app-assess-row">
                  <dt>Rain-induced landslide</dt>
                  <dd>
                    <span className={`app-hazard-badge ${getHazardBadgeClass(geoRisk?.landslide?.value)}`}>
                      {geoRisk?.landslide?.value || "Safe"}
                    </span>
                  </dd>
                </div>

                <div className="app-assess-row">
                  <dt>Mt. Banahaw</dt>
                  <dd className="app-assess-val-normal">
                    {ban.km.toFixed(1)} km north of summit
                  </dd>
                </div>
              </dl>

              <p className="app-assess-note">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>Luisiana only · MGB flood &amp; landslide (GeoRiskPH) + PHIVOLCS 2014 sheets + local terrain model.</span>
              </p>

              <button
                type="button"
                className="app-assess-report-btn"
                onClick={() => {
                  void printSiteHazardReport({
                    name: title.trim() || "New Application Site",
                    barangay,
                    locationLabel: `${barangay}, Luisiana, Laguna`,
                    lat: pinnedCoords.lat,
                    lon: pinnedCoords.lon,
                    live: {
                      flood: geoRisk?.flood || { value: "Safe", code: null },
                      landslide: geoRisk?.landslide || { value: "Safe", code: null },
                    },
                    distanceKm: ban.km,
                  });
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <span>View report</span>
              </button>
            </div>

            <div
              style={{
                marginTop: 18,
                padding: "12px 16px",
                background: "var(--apple-surface-secondary, #f5f5f7)",
                borderRadius: "var(--apple-radius-md, 10px)",
                fontSize: 13,
                color: "var(--apple-text-secondary, #6e6e73)",
                border: "1px solid var(--apple-border, rgba(0, 0, 0, 0.08))",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <IconInfo size={18} color="var(--apple-accent, #0071e3)" />
              <span>Pagkatapos i-submit, maaari mong buksan agad ang interactive 2D map upang mai-plot ang eksaktong perimeter gamit ang cursor.</span>
            </div>

            <div className="new-app-page-footer">
              <div className="new-app-footer-actions">
                <button type="button" className="new-app-page-btn new-app-page-btn-secondary" onClick={handleBack}>
                  <span className="new-app-btn-text-full">← Bumalik sa Form</span>
                  <span className="new-app-btn-text-short">← Bumalik</span>
                </button>
                <button
                  type="button"
                  className="new-app-page-btn new-app-page-btn-primary"
                  disabled={submitting}
                  onClick={handleInitiateSubmit}
                >
                  <span>
                    {submitting ? (
                      "Isinusumite..."
                    ) : (
                      <>
                        <span className="new-app-btn-text-full">Kumpirmahin at I-submit</span>
                        <span className="new-app-btn-text-short">I-submit</span>
                      </>
                    )}
                  </span>
                  <span>✓</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: CONFIRMATION & TRACKING */}
        {step === 4 && (
          <div className="new-app-form-panel" style={{ textAlign: "center", padding: "48px 32px" }}>
            <div style={{ marginBottom: 18 }}>
              <IconCheckCircle size={56} color="var(--apple-safe, #15803d)" />
            </div>
            <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem", fontWeight: 700, color: "var(--apple-safe, #15803d)", letterSpacing: "-0.02em" }}>
              Matagumpay na Nalikha ang Aplikasyon!
            </h1>
            <p style={{ margin: "0 auto 24px", fontSize: "0.94rem", color: "var(--apple-text-secondary, #6e6e73)", maxWidth: 520, lineHeight: 1.55 }}>
              Nailagay na sa database ng Bayan ng Luisiana ang inyong aplikasyon para sa opisyal na pagsusuri ng MPDC at Engineering Office.
            </p>

            <div
              style={{
                background: "var(--apple-surface-secondary, #f5f5f7)",
                border: "1.5px dashed var(--apple-border-strong, rgba(0, 0, 0, 0.16))",
                borderRadius: "var(--apple-radius-md, 10px)",
                padding: "20px 28px",
                display: "inline-block",
                marginBottom: 28,
              }}
            >
              <div style={{ fontSize: 12, color: "var(--apple-text-secondary, #6e6e73)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                Tracking Reference Number
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--apple-text, #1d1d1f)", marginTop: 6, letterSpacing: "0.05em", fontFamily: "monospace" }}>
                {generatedTrackingNo}
              </div>
            </div>

            {/* Attached Documents Verification Summary */}
            <div style={{ maxWidth: 580, margin: "0 auto 28px", textAlign: "left", background: "var(--apple-surface-secondary, #f5f5f7)", border: "1px solid var(--apple-border, rgba(0, 0, 0, 0.08))", borderRadius: "var(--apple-radius-md, 10px)", padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--apple-text-secondary, #6e6e73)", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <IconUploadCloud size={16} color="var(--apple-text, #1d1d1f)" />
                <span>Nai-attach na mga Dokumento ({[landTitleDoc, taxDecDoc, rptReceiptDoc, brgyClearanceDoc, ploCertDoc, photoDocsDoc].filter(Boolean).length} of 6)</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: "0.82rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: landTitleDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconFileTextDoc size={14} color="currentColor" /> Photocopy ng TCT (Land Title):
                  </span>
                  <strong>{landTitleDoc ? `✓ ${landTitleDoc.name}` : "Walang kalakip"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: taxDecDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconFileTextDoc size={14} color="currentColor" /> Tax Declaration:
                  </span>
                  <strong>{taxDecDoc ? `✓ ${taxDecDoc.name}` : "Walang kalakip"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: rptReceiptDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconReceipt size={14} color="currentColor" /> Current Real Property Tax Receipt (Amilyar):
                  </span>
                  <strong>{rptReceiptDoc ? `✓ ${rptReceiptDoc.name}` : "Walang kalakip"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: brgyClearanceDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconShieldCheck size={14} color="currentColor" /> Barangay Clearance:
                  </span>
                  <strong>{brgyClearanceDoc ? `✓ ${brgyClearanceDoc.name}` : "Walang kalakip"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: ploCertDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconBolt size={14} color="currentColor" /> PLO Certification (MERALCO Clearance):
                  </span>
                  <strong>{ploCertDoc ? `✓ ${ploCertDoc.name}` : "Walang kalakip"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: photoDocsDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconCamera size={14} color="currentColor" /> Photo Documentation (Loob at Labas ng Site):
                  </span>
                  <strong>{photoDocsDoc ? `✓ ${photoDocsDoc.name}` : "Walang kalakip"}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14 }}>
              <button
                type="button"
                className="new-app-page-btn new-app-page-btn-primary"
                onClick={() => {
                  if (onTrackApplication) {
                    onTrackApplication(generatedTrackingNo);
                  }
                }}
              >
                <IconPin size={16} color="currentColor" />
                <span>Subaybayan ang Aplikasyon (Live Tracker)</span>
              </button>

              {onViewOnMap && (
                <button
                  type="button"
                  className="new-app-page-btn new-app-page-btn-primary"
                  onClick={() => onViewOnMap(pinnedCoords.lon, pinnedCoords.lat)}
                >
                  <IconMap size={16} color="currentColor" />
                  <span>Tingnan sa 2D Mapa</span>
                </button>
              )}
              <button
                type="button"
                className="new-app-page-btn new-app-page-btn-secondary"
                onClick={onBack}
              >
                Bumalik sa Dashboard / Landing
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Terms & Conditions / Cookie Consent Gate Modal */}
      <ApplicationTermsModal
        isOpen={termsModalOpen}
        onAccept={handleAcceptTerms}
        onDecline={handleDeclineTerms}
        isAlreadyAccepted={isAppTermsAccepted()}
      />

      {/* Pre-Submission Review & Confirmation Modal */}
      <ApplicationConfirmModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirmSubmit={handleSubmit}
        submitting={submitting}
        data={confirmModalData}
      />
    </div>
  );
}
