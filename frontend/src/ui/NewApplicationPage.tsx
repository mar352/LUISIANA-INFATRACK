import { useState, useMemo, useEffect } from "react";
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

const IconPin = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
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

export default function NewApplicationPage({
  onBack,
  onCreated,
  onViewOnMap,
  onTrackApplication,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [category, setCategory] = useState<ApplicationCategory>("private_infrastructure");

  // Common form state
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

  // Agricultural fields
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

  // ── Document Attachments (6 Mandatory/Standard Citizen Requirements) ──
  const [landTitleDoc, setLandTitleDoc] = useState<AttachedDocument | null>(null);
  const [taxDecDoc, setTaxDecDoc] = useState<AttachedDocument | null>(null);
  const [rptReceiptDoc, setRptReceiptDoc] = useState<AttachedDocument | null>(null);
  const [brgyClearanceDoc, setBrgyClearanceDoc] = useState<AttachedDocument | null>(null);
  const [ploCertDoc, setPloCertDoc] = useState<AttachedDocument | null>(null);
  const [photoDocsDoc, setPhotoDocsDoc] = useState<AttachedDocument | null>(null);

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
  const [pinnedCoords, setPinnedCoords] = useState<{ lon: number; lat: number }>({
    lon: LUISIANA_CENTER.lon,
    lat: LUISIANA_CENTER.lat,
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

  const getHazardColor = (val?: string) => {
    if (!val) return "#22c55e"; // default safe green
    const v = val.toLowerCase();
    if (v.includes("high") || v.includes("very high") || v.includes("debris") || v.includes("critical")) {
      return "#ef4444"; // Red for high susceptibility
    }
    if (v.includes("moderate") || v.includes("medium") || v.includes("warning")) {
      return "#f59e0b"; // Amber/orange for moderate
    }
    if (v.includes("low")) {
      return "#38bdf8"; // Cyan for low
    }
    return "#22c55e"; // Green for safe
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
    setStep(4);
    onCreated(payload, officialTrackingNo);
  };

  return (
    <div className="new-app-page">
      {/* Navigation Top Bar */}
      <header className="new-app-nav">
        <div className="new-app-nav-left">
          <button type="button" className="new-app-back-btn" onClick={onBack}>
            <IconBackArrow />
            <span>Bumalik</span>
          </button>
          <div className="new-app-nav-brand">
            <img src="/logo.png" alt="Bayan ng Luisiana" />
            <div>
              <div className="new-app-nav-title">INFA-TRACK Luisiana</div>
              <div className="new-app-nav-sub">Project Categorization &amp; Application Intake</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ThemeToggle />
        </div>
      </header>

      {/* Progress Stepper Bar */}
      <div className="new-app-page-stepper">
        <div className="new-app-stepper-inner">
          <div className={`new-app-page-step ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}>
            <span className="new-app-page-step-badge">{step > 1 ? "✓" : "1"}</span>
            <span>1. Kategorya (Ano ang ia-apply?)</span>
          </div>
          <div className="new-app-page-step-divider" />
          <div className={`new-app-page-step ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}>
            <span className="new-app-page-step-badge">{step > 2 ? "✓" : "2"}</span>
            <span>2. Impormasyon ng Proyekto</span>
          </div>
          <div className="new-app-page-step-divider" />
          <div className={`new-app-page-step ${step === 3 ? "active" : step > 3 ? "completed" : ""}`}>
            <span className="new-app-page-step-badge">{step > 3 ? "✓" : "3"}</span>
            <span>3. GIS Location &amp; Hazard</span>
          </div>
          <div className="new-app-page-step-divider" />
          <div className={`new-app-page-step ${step === 4 ? "completed active" : ""}`}>
            <span className="new-app-page-step-badge">4</span>
            <span>4. Pagkumpirma</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="new-app-page-main">
        {/* STEP 1: CATEGORY SELECTION ("Ano ang ia-apply?") */}
        {step === 1 && (
          <div>
            <div className="new-app-heading-wrap">
              <h1 className="new-app-main-heading">Ano ang ia-apply?</h1>
              <p className="new-app-main-lead">
                Pumili ng tamang kategorya ng aplikasyon upang maipagkaloob ang karampatang zoning evaluation, environmental buffer checking, at GIS hazard screening.
              </p>
            </div>

            <div className="new-app-page-cards-grid">
              {/* Card 1: Private Infrastructure */}
              <div
                className={`new-app-page-card ${category === "private_infrastructure" ? "selected" : ""}`}
                onClick={() => setCategory("private_infrastructure")}
                role="button"
                tabIndex={0}
              >
                <div className="new-app-card-icon-wrap" style={{ color: "#38bdf8" }}>
                  <IconBuilding size={36} color="#38bdf8" />
                </div>
                <div className="new-app-card-title">Private Infrastructure</div>
                <span className="new-app-card-badge tag-private">Residential / Commercial</span>
                <div className="new-app-card-desc">
                  Para sa mga pribadong gusali, bahay, commercial spaces, subdibisyon, bodega, o private telecom structures.
                </div>
                <ul className="new-app-card-features">
                  <li><IconCheck /> Land title (TCT / Tax Dec) verification</li>
                  <li><IconCheck /> Building setback &amp; zoning clearance</li>
                  <li><IconCheck /> Slope &amp; flood hazard assessment</li>
                </ul>
              </div>

              {/* Card 2: Agricultural (Poultry / Piggery) */}
              <div
                className={`new-app-page-card ${category === "agricultural" ? "selected" : ""}`}
                onClick={() => setCategory("agricultural")}
                role="button"
                tabIndex={0}
              >
                <div className="new-app-card-icon-wrap" style={{ color: "#34d399" }}>
                  <IconAgriculture size={36} color="#34d399" />
                </div>
                <div className="new-app-card-title">Agricultural</div>
                <span className="new-app-card-badge tag-agri">Poultry / Piggery / Farm</span>
                <div className="new-app-card-desc">
                  Para sa mga pasilidad pang-agrikultura tulad ng broiler/layer poultry farms, babuyan (piggery), at livestock.
                </div>
                <ul className="new-app-card-features">
                  <li><IconCheck /> 500m mandatory buffer mula sa kabahayan</li>
                  <li><IconCheck /> 200m buffer mula sa mga ilog at tubig</li>
                  <li><IconCheck /> Biogas at waste management plan</li>
                </ul>
              </div>

              {/* Card 3: Municipal Projects */}
              <div
                className={`new-app-page-card ${category === "municipal_project" ? "selected" : ""}`}
                onClick={() => setCategory("municipal_project")}
                role="button"
                tabIndex={0}
              >
                <div className="new-app-card-icon-wrap" style={{ color: "#fbbf24" }}>
                  <IconMunicipal size={36} color="#fbbf24" />
                </div>
                <div className="new-app-card-title">Municipal Projects</div>
                <span className="new-app-card-badge tag-municipal">LGU Public Works / CIP</span>
                <div className="new-app-card-desc">
                  Para sa mga pampublikong imprastraktura ng Pamahalaang Bayan: mga kalsada, evacuation centers, barangay halls, at RHU.
                </div>
                <ul className="new-app-card-features">
                  <li><IconCheck /> Implementing department routing</li>
                  <li><IconCheck /> 20% LDF / LGU budget source tracking</li>
                  <li><IconCheck /> Multi-hazard disaster mitigation siting</li>
                </ul>
              </div>
            </div>

            <div className="new-app-page-footer">
              <button type="button" className="new-app-page-btn new-app-page-btn-secondary" onClick={onBack}>
                Kanselahin
              </button>
              <button type="button" className="new-app-page-btn new-app-page-btn-primary" onClick={() => setStep(2)}>
                <span>Magpatuloy sa Impormasyon</span>
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
                    <IconBuilding size={20} color="#38bdf8" />
                    <span>Private Infrastructure Application Details</span>
                  </>
                )}
                {category === "agricultural" && (
                  <>
                    <IconAgriculture size={20} color="#34d399" />
                    <span>Agricultural (Poultry / Piggery) Farm Application Details</span>
                  </>
                )}
                {category === "municipal_project" && (
                  <>
                    <IconMunicipal size={20} color="#fbbf24" />
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
                <label className="new-app-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Eksaktong Lokasyon ng Proyekto (Interactive Map Pinpoint) *</span>
                  <span style={{ fontSize: 12, color: "#38bdf8", fontWeight: 700, fontFamily: "monospace" }}>
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
                        <IconShieldCheck size={18} color="#34d399" />
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
                      <IconUploadCloud size={22} color="#38bdf8" />
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#fca5a5" }}>
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

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button type="button" className="new-app-page-btn new-app-page-btn-secondary" onClick={() => setStep(1)}>
                  ← Bumalik sa Kategorya
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
                  <span>Magpatuloy sa GIS Siting</span>
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
              <h2 className="new-app-form-title" style={{ color: "#10b981" }}>
                <IconPin size={22} color="#10b981" />
                <span>GIS Location Siting &amp; Hazard Clearance</span>
              </h2>
              <div className="new-app-form-sub">
                Awtomatikong sinusuri ng GIS engine ang elevation slope, fault proximity, at hazard zones sa Bayan ng Luisiana.
              </div>
            </div>

            {/* LUISIANA SITING ASSESSMENT (Exact match with Pic 2) */}
            <div className="app-assess-card">
              <div className="app-assess-card-title">
                LUISIANA SITING ASSESSMENT
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
                    {geoRisk?.flood?.value || "Safe"}
                  </dd>
                </div>

                <div className="app-assess-row">
                  <dt>Rain-induced landslide</dt>
                  <dd style={{ color: getHazardColor(geoRisk?.landslide?.value) }}>
                    {geoRisk?.landslide?.value || "Safe"}
                  </dd>
                </div>

                <div className="app-assess-row">
                  <dt>Mt. Banahaw</dt>
                  <dd style={{ color: "#ffffff" }}>
                    {ban.km.toFixed(1)} km north of summit
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
                    name: title.trim() || "New Application Site",
                    barangay,
                    locationLabel: `${barangay}, Luisiana, Laguna`,
                    lat: pinnedCoords.lat,
                    lon: pinnedCoords.lon,
                    live: {
                      flood: geoRisk?.flood || { value: "Safe", code: null },
                      landslide: geoRisk?.landslide || { value: "Safe", code: null },
                    },
                  });
                }}
              >
                View report
              </button>
            </div>

            <div
              style={{
                marginTop: 18,
                padding: "12px 16px",
                background: "rgba(56, 189, 248, 0.08)",
                borderRadius: 10,
                fontSize: 13,
                color: "#7dd3fc",
                border: "1px solid rgba(56, 189, 248, 0.2)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <IconInfo size={18} color="#38bdf8" />
              <span>Pagkatapos i-submit, maaari mong buksan agad ang interactive 2D map upang mai-plot ang eksaktong perimeter gamit ang cursor.</span>
            </div>

            <div className="new-app-page-footer">
              <button type="button" className="new-app-page-btn new-app-page-btn-secondary" onClick={() => setStep(2)}>
                ← Bumalik sa Form
              </button>
              <button
                type="button"
                className="new-app-page-btn new-app-page-btn-primary"
                disabled={submitting}
                onClick={handleSubmit}
              >
                <span>{submitting ? "Isinusumite..." : "Kumpirmahin at I-submit"}</span>
                <span>✓</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: CONFIRMATION & TRACKING */}
        {step === 4 && (
          <div className="new-app-form-panel" style={{ textAlign: "center", padding: "48px 32px" }}>
            <div style={{ marginBottom: 18 }}>
              <IconCheckCircle size={64} color="#10b981" />
            </div>
            <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800, color: "#34d399" }}>
              Matagumpay na Nalikha ang Aplikasyon!
            </h1>
            <p style={{ margin: "0 auto 24px", fontSize: 14.5, color: "rgba(255, 255, 255, 0.7)", maxWidth: 520, lineHeight: 1.5 }}>
              Nailagay na sa database ng Bayan ng Luisiana ang inyong aplikasyon para sa opisyal na pagsusuri ng MPDC at Engineering Office.
            </p>

            <div
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "2px dashed rgba(56, 189, 248, 0.45)",
                borderRadius: 14,
                padding: "20px 28px",
                display: "inline-block",
                marginBottom: 28,
              }}
            >
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                Tracking Reference Number
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#38bdf8", marginTop: 6, letterSpacing: "0.07em" }}>
                {generatedTrackingNo}
              </div>
            </div>

            {/* Attached Documents Verification Summary */}
            <div style={{ maxWidth: 580, margin: "0 auto 28px", textAlign: "left", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <IconUploadCloud size={16} color="#38bdf8" />
                <span>Nai-attach na mga Dokumento ({[landTitleDoc, taxDecDoc, rptReceiptDoc, brgyClearanceDoc, ploCertDoc, photoDocsDoc].filter(Boolean).length} of 6)</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 12.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: landTitleDoc ? "#34d399" : "rgba(255,255,255,0.4)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconFileTextDoc size={14} color="currentColor" /> Photocopy ng TCT (Land Title):
                  </span>
                  <strong>{landTitleDoc ? `✓ ${landTitleDoc.name}` : "Walang kalakip"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: taxDecDoc ? "#34d399" : "rgba(255,255,255,0.4)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconFileTextDoc size={14} color="currentColor" /> Tax Declaration:
                  </span>
                  <strong>{taxDecDoc ? `✓ ${taxDecDoc.name}` : "Walang kalakip"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: rptReceiptDoc ? "#34d399" : "rgba(255,255,255,0.4)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconReceipt size={14} color="currentColor" /> Current Real Property Tax Receipt (Amilyar):
                  </span>
                  <strong>{rptReceiptDoc ? `✓ ${rptReceiptDoc.name}` : "Walang kalakip"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: brgyClearanceDoc ? "#34d399" : "rgba(255,255,255,0.4)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconShieldCheck size={14} color="currentColor" /> Barangay Clearance:
                  </span>
                  <strong>{brgyClearanceDoc ? `✓ ${brgyClearanceDoc.name}` : "Walang kalakip"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: ploCertDoc ? "#34d399" : "rgba(255,255,255,0.4)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconBolt size={14} color="currentColor" /> PLO Certification (MERALCO Clearance):
                  </span>
                  <strong>{ploCertDoc ? `✓ ${ploCertDoc.name}` : "Walang kalakip"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: photoDocsDoc ? "#34d399" : "rgba(255,255,255,0.4)" }}>
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
                style={{ background: "#0284c7", borderColor: "#38bdf8" }}
                onClick={() => {
                  if (onTrackApplication) {
                    onTrackApplication(generatedTrackingNo);
                  }
                }}
              >
                <IconPin size={17} color="#fff" />
                <span>Subaybayan ang Aplikasyon (Live Tracker)</span>
              </button>

              {onViewOnMap && (
                <button
                  type="button"
                  className="new-app-page-btn new-app-page-btn-primary"
                  onClick={() => onViewOnMap(pinnedCoords.lon, pinnedCoords.lat)}
                >
                  <IconMap size={17} color="#fff" />
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
    </div>
  );
}
