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
import { useTranslation, LanguageToggle } from "./LanguageToggle";
import { useSystemConfig } from "../services/systemConfig";
import PinpointMapPicker, { BARANGAY_COORDINATES } from "./PinpointMapPicker";
import { normalizeBarangayName, getClupZone } from "../lib/clup-zones";
import {
  banahawDistanceKm,
  fetchGeoriskAssess,
  type GeoRiskAssess,
} from "../lib/luisiana-site-assess";
import { printSiteHazardReport } from "../lib/hazard-report";
import { uploadCitizenDocument, submitCitizenApplication } from "../lib/api";
import { validateApplicationFile } from "../lib/documentValidation";
import { extractGeotagCoordinates, type GeotagExtractionResult } from "../lib/geotag";
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

const IconHome = ({ size = 30, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const IconApartment = ({ size = 30, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 7h2v2H7z" />
    <path d="M15 7h2v2h-2z" />
    <path d="M7 11h2v2H7z" />
    <path d="M15 11h2v2h-2z" />
    <path d="M7 15h2v2H7z" />
    <path d="M15 15h2v2h-2z" />
    <line x1="11" y1="21" x2="11" y2="15" />
    <line x1="13" y1="21" x2="13" y2="15" />
    <line x1="11" y1="15" x2="13" y2="15" />
  </svg>
);

const IconTownhouse = ({ size = 30, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 10l5-4 5 4v10H2z" />
    <path d="M12 10l5-4 5 4v10h-10z" />
    <path d="M5 14h2" />
    <path d="M15 14h2" />
  </svg>
);

const IconDormitory = ({ size = 30, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 4v16" />
    <path d="M2 8h18a2 2 0 0 1 2 2v10" />
    <path d="M2 17h20" />
    <path d="M6 8v9" />
    <circle cx="6" cy="6" r="2" />
  </svg>
);

const IconInstitutional = ({ size = 30, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="2" y1="21" x2="22" y2="21" />
    <line x1="4" y1="10" x2="4" y2="21" />
    <line x1="8" y1="10" x2="8" y2="21" />
    <line x1="12" y1="10" x2="12" y2="21" />
    <line x1="16" y1="10" x2="16" y2="21" />
    <line x1="20" y1="10" x2="20" y2="21" />
    <polygon points="12 2 2 8 22 8" />
  </svg>
);

const IconCommercial = ({ size = 30, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const IconIndustrial = ({ size = 30, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 20h20" />
    <path d="M3 20V8l6 4V8l6 4V4l6 4v12" />
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

const IconAgroIndustrial = IconAgriculture;

export function getOfficialCategories(isEn: boolean) {
  return [
    {
      key: "Residential",
      title: "Residential",
      tagline: isEn ? "Family Housing / Residence" : "Pabahay para sa Pamilya",
      desc: isEn
        ? "Single-family homes, duplex, bungalow, or private family residence."
        : "Single-family homes, duplex, bungalow, o pribadong tirahan ng pamilya.",
      badge: isEn ? "Housing" : "Pabahay",
      color: "var(--apple-accent, #0071e3)",
      icon: IconHome,
      isAgro: false,
      features: isEn
        ? [
            "Building setback and zoning clearance",
            "Siting hazard screening",
            "Land title / Tax Dec verification",
          ]
        : [
            "Building setback at zoning clearance",
            "Siting hazard screening",
            "Land title / Tax Dec verification",
          ],
    },
    {
      key: "Apartment",
      title: "Apartment",
      tagline: isEn ? "Rental Building / Multi-Unit" : "Paupahang Gusali / Multi-Unit",
      desc: isEn
        ? "Apartment complex, rental units, or residential rental buildings."
        : "Apartment complex, paupahang mga yunit, o residential rental buildings.",
      badge: isEn ? "Multi-Unit" : "Multi-Unit",
      color: "#2563eb",
      icon: IconApartment,
      isAgro: false,
      features: isEn
        ? [
            "Density and parking requirements",
            "Fire safety and egress clearance",
            "Locational clearance endorsement",
          ]
        : [
            "Density at parking requirement",
            "Fire safety at egress clearance",
            "Locational clearance endorsement",
          ],
    },
    {
      key: "Townhouse",
      title: "Townhouse",
      tagline: isEn ? "Row House / Cluster" : "Row House / Cluster",
      desc: isEn
        ? "Townhouses, attached dwelling units, or residential cluster development."
        : "Townhouses, attached dwelling units, o residential cluster development.",
      badge: isEn ? "Row House" : "Row House",
      color: "#0284c7",
      icon: IconTownhouse,
      isAgro: false,
      features: isEn
        ? [
            "Party-wall and setback compliance",
            "Drainage and utility clearance",
            "Residential zone verification",
          ]
        : [
            "Party-wall at setback compliance",
            "Drainage and utility clearance",
            "Residential zone verification",
          ],
    },
    {
      key: "Dormitory",
      title: "Dormitory",
      tagline: isEn ? "Boarding House / Transient" : "Boarding House / Transient",
      desc: isEn
        ? "Dormitory, boarding house, staff housing, or transient lodging facilities."
        : "Dormitoryo, boarding house, staff housing, o pasilidad para sa transient.",
      badge: isEn ? "Boarding" : "Boarding",
      color: "#7c3aed",
      icon: IconDormitory,
      isAgro: false,
      features: isEn
        ? [
            "Sanitation and occupancy check",
            "CLUP urban zoning evaluation",
            "Barangay clearance validation",
          ]
        : [
            "Sanitation at occupancy check",
            "CLUP urban zoning evaluation",
            "Barangay clearance validation",
          ],
    },
    {
      key: "Institutional",
      title: "Institutional",
      tagline: isEn ? "School, Chapel, Facility" : "Paaralan, Kapilya, Pasilidad",
      desc: isEn
        ? "Private school, chapel, church, community facility, or civic center."
        : "Pribadong paaralan, kapilya, simbahan, pasilidad ng komunidad, o civic center.",
      badge: isEn ? "School / Church" : "School / Church",
      color: "#9333ea",
      icon: IconInstitutional,
      isAgro: false,
      features: isEn
        ? [
            "Institutional zoning endorsement",
            "Traffic & accessibility screening",
            "Environmental screening",
          ]
        : [
            "Institutional zoning endorsement",
            "Traffic & accessibility screening",
            "Environmental screening",
          ],
    },
    {
      key: "Commercial",
      title: "Commercial",
      tagline: isEn ? "Store, Office, Business" : "Tindahan, Opisina, Negosyo",
      desc: isEn
        ? "Retail store, restaurant, commercial office, bank, or shopping complex."
        : "Tindahan, retail store, restawran, commercial office, bangko, o shopping complex.",
      badge: isEn ? "Business / Store" : "Negosyo / Store",
      color: "#d97706",
      icon: IconCommercial,
      isAgro: false,
      features: isEn
        ? [
            "Commercial CLUP zone check",
            "Clearance for Business Permit",
            "Traffic and parking review",
          ]
        : [
            "Commercial CLUP zone check",
            "Clearance para sa Business Permit",
            "Traffic at parking review",
          ],
    },
    {
      key: "Industrial",
      title: "Industrial",
      tagline: isEn ? "Warehouse, Workshop, Plant" : "Bodega, Pagawaan, Warehouse",
      desc: isEn
        ? "Light industrial facility, warehouse, storage, packaging, or fabrication shop."
        : "Light industrial facility, bodega, storage, packaging, o fabrication shop.",
      badge: isEn ? "Warehouse / Factory" : "Warehouse / Factory",
      color: "#475569",
      icon: IconIndustrial,
      isAgro: false,
      features: isEn
        ? [
            "Industrial zoning compliance",
            "Heavy vehicle access clearance",
            "Environmental safety screening",
          ]
        : [
            "Industrial zoning compliance",
            "Heavy vehicle access clearance",
            "Environmental safety screening",
          ],
    },
    {
      key: "Agro-Industrial",
      title: "Agro-Industrial",
      tagline: isEn ? "Poultry, Piggery, Feed/Rice Mill" : "Poultry, Piggery, Feed/Rice Mill",
      desc: isEn
        ? "Agricultural and processing facilities like broiler/layer poultry, piggery, and feed mills."
        : "Pasilidad pang-agrikultura at pagproseso tulad ng broiler/layer poultry, babuyan, at feed mill.",
      badge: isEn ? "Poultry / Piggery" : "Poultry / Piggery",
      color: "var(--apple-safe, #15803d)",
      icon: IconAgroIndustrial,
      isAgro: true,
      features: isEn
        ? [
            "500m mandatory buffer from residential zones",
            "200m buffer from rivers and water bodies",
            "Biogas and waste management plan",
          ]
        : [
            "500m mandatory buffer mula sa kabahayan",
            "200m buffer mula sa ilog at tubig",
            "Biogas at waste management plan",
          ],
    },
  ];
}

export const OFFICIAL_CATEGORIES = getOfficialCategories(false);

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
  const { language } = useTranslation();
  const isEn = language === "en";
  const categoriesList = useMemo(() => getOfficialCategories(isEn), [isEn]);

  // Load draft from localStorage once on initial mount
  const initialDraft = useMemo(() => loadApplicationDraft(), []);
  const [draftRestored, setDraftRestored] = useState<boolean>(() => initialDraft !== null);

  // Dynamic system configuration & masterlists
  const { activeBarangays, activeBuildingTypes } = useSystemConfig();

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
    () => (initialDraft?.category && initialDraft.category !== "municipal_project" ? initialDraft.category : "private_infrastructure")
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
  const [buildingType, setBuildingType] = useState(() => {
    if (initialDraft?.buildingType) {
      return initialDraft.buildingType;
    }
    if (initialDraft?.category === "agricultural") {
      return "Agro-Industrial";
    }
    return "Residential";
  });
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

  // Geotag extraction & coordinate source tracking
  const [geotagResult, setGeotagResult] = useState<GeotagExtractionResult | null>(null);
  const [coordinateSource, setCoordinateSource] = useState<"manual" | "geotag">("manual");
  const [isOcrProcessing, setIsOcrProcessing] = useState<boolean>(false);
  const quickGeotagInputRef = useRef<HTMLInputElement | null>(null);

  const handleAttachFile = async (
    file: File,
    fieldKey: string,
    setter: React.Dispatch<React.SetStateAction<AttachedDocument | null>>,
    options?: { isQuickGeotag?: boolean }
  ) => {
    // 1. Gather other attached documents for duplicate file prevention
    const existingDocsSnapshot = {
      landTitle: landTitleDoc ? { name: landTitleDoc.name, size: landTitleDoc.size } : null,
      taxDec: taxDecDoc ? { name: taxDecDoc.name, size: taxDecDoc.size } : null,
      rptReceipt: rptReceiptDoc ? { name: rptReceiptDoc.name, size: rptReceiptDoc.size } : null,
      brgyClearance: brgyClearanceDoc ? { name: brgyClearanceDoc.name, size: brgyClearanceDoc.size } : null,
      ploCert: ploCertDoc ? { name: ploCertDoc.name, size: ploCertDoc.size } : null,
      photoDocs: photoDocsDoc ? { name: photoDocsDoc.name, size: photoDocsDoc.size } : null,
    };

    // 2. Perform client-side format, magic byte, size, and duplicate checks
    const valResult = await validateApplicationFile(file, fieldKey, existingDocsSnapshot);
    if (!valResult.valid) {
      alert(valResult.error || (isEn ? "Cannot accept file for this field." : "Hindi matanggap ang file para sa field na ito."));
      setter(null);
      return;
    }

    // 3. IMMEDIATE CLIENT-SIDE GEOTAG & OCR EXTRACTION:
    // Extract GPS coordinates right away without waiting for network upload!
    if (fieldKey === "photoDocs") {
      setIsOcrProcessing(true);
      try {
        const geotag = await extractGeotagCoordinates(file);
        setGeotagResult(geotag);
        if (geotag.hasGeotag && geotag.coords) {
          if (geotag.isWithinLuisiana) {
            // ONLY PINPOINT ON INTERACTIVE MAP IF WITHIN LUISIANA BORDER!
            setPinnedCoords({ lat: geotag.coords.lat, lon: geotag.coords.lon });
            setCoordinateSource("geotag");
            if (geotag.detectedBarangay) {
              setBarangay(geotag.detectedBarangay);
            }
          } else {
            // DO NOT PINPOINT IF OUTSIDE LUISIANA BORDER!
            alert(
              isEn
                ? `Notice: The photo's latitude and coordinates (Lat: ${geotag.coords.lat.toFixed(6)}° N, Lon: ${geotag.coords.lon.toFixed(6)}° E) are outside the Luisiana municipal border.\n\nAutomatic map pinpointing has been blocked. Please upload a site photo taken within the Municipality of Luisiana, or pinpoint your project location manually on the interactive map.`
                : `Paunawa: Ang latitude at coordinates ng litrato (Lat: ${geotag.coords.lat.toFixed(6)}° N, Lon: ${geotag.coords.lon.toFixed(6)}° E) ay nasa labas ng border ng Bayan ng Luisiana.\n\nHindi ito awtomatikong nai-pin sa mapa. Mag-upload ng litratong kuha sa loob ng Bayan ng Luisiana, o gamitin ang interactive map pinpointer upang ituro ang lokasyon.`
            );
          }
        } else if (options?.isQuickGeotag) {
          alert(
            isEn
              ? "Notice: No GPS coordinates or watermark were recognized in this photo.\n\nPlease ensure your photo has GPS tags or a visible camera watermark, or pinpoint your project location manually on the interactive map."
              : "Paunawa: Walang natagpuang GPS coordinates o camera watermark ang litratong ito.\n\nSiguraduhing may GPS tags o camera watermark ang litrato, o gamitin ang interactive map pinpointer upang piliin ang lokasyon."
          );
        }
      } catch (err) {
        console.warn("[Geotag Auto-Extract Error]", err);
      } finally {
        setIsOcrProcessing(false);
      }
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
          `[SECURITY ALERT] ${isEn ? "Document Rejected" : "Hindi Matanggap ang Dokumento"}:\n\n${errMsg}\n\n${isEn ? "Please ensure the document is clean and in an official format with no embedded scripts." : "Pakitiyak na ang dokumento ay malinis at opisyal na format na walang nakapaloob na script o macro."}`
        );
        setter(null);
        if (fieldKey === "photoDocs") {
          setGeotagResult(null);
          setCoordinateSource("manual");
        }
      } else {
        // Fallback for offline demo mode or backend server unreachable
        setter({
          file,
          url: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          uploading: false,
        });
      }
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
      title.trim().length > 0 ||
      applicantName.trim().length > 0 ||
      contactPhone.trim().length > 0 ||
      contactEmail.trim().length > 0 ||
      locationDescription.trim().length > 0 ||
      tctNo.trim().length > 0 ||
      taxDecNo.trim().length > 0 ||
      (lotAreaSqM !== "" && Number(lotAreaSqM) > 0) ||
      (estimatedCostPhp !== "" && Number(estimatedCostPhp) > 0) ||
      cipCode.trim().length > 0 ||
      notes.trim().length > 0 ||
      landTitleDoc !== null ||
      taxDecDoc !== null ||
      rptReceiptDoc !== null ||
      brgyClearanceDoc !== null ||
      ploCertDoc !== null ||
      photoDocsDoc !== null;

    if (!hasAnyInput) {
      clearApplicationDraft();
      return;
    }

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
    if (window.confirm(isEn ? "Do you want to clear your saved draft and start over from the beginning?" : "Nais mo bang burahin ang na-save na draft at magsimula muli mula sa simula?")) {
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
    if (!title.trim()) missing.push(isEn ? "Project Name / Application Title" : "Pangalan ng Proyekto / Title");
    if (!applicantName.trim()) missing.push(isEn ? "Applicant / Owner Name" : "Pangalan ng Aplikante / May-ari");
    if (!contactPhone.trim() || contactPhone.trim().length < 11) {
      missing.push(isEn ? "Mobile Contact No. (11-digit, e.g. 09171234567)" : "Mobile Contact No. (11-digit, hal. 09171234567)");
    }
    if (!contactEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      missing.push(isEn ? "Valid Email Address" : "Wastong Email Address");
    }
    if (!locationDescription.trim()) missing.push(isEn ? "Sitio / Street / Landmark Address" : "Sitio / Street / Landmark Address");

    if (category === "private_infrastructure") {
      if (!tctNo.trim()) missing.push("TCT No.");
      if (!taxDecNo.trim()) missing.push("Tax Declaration (TD) No.");
      if (typeof lotAreaSqM !== "number" || lotAreaSqM <= 0) missing.push(isEn ? "Lot Area (sq.m.)" : "Sukat ng Lote (sq.m.)");
    }

    if (category === "agricultural") {
      if (!bufferComplianceConfirmed) missing.push(isEn ? "Environmental Buffer Zone Compliance (500m / 200m Buffer)" : "Environmental Buffer Zone Compliance (500m / 200m Buffer)");
    }

    if (category === "municipal_project") {
      if (!implementingDepartment.trim()) missing.push("Implementing Department");
      if (!cipCode.trim()) missing.push("AIP / CIP Reference Code");
      if (!targetBeneficiaries.trim()) missing.push("Target Beneficiaries");
      if (typeof estimatedCostPhp !== "number" || estimatedCostPhp <= 0) missing.push(isEn ? "Estimated Budget (Estimated Cost in ₱)" : "Tinatayang Badyet (Estimated Cost in ₱)");
    }

    // 6 Mandatory Documentary Requirements
    if (!landTitleDoc) missing.push(isEn ? "Document #1: TCT (Land Title)" : "Dokumento #1: TCT (Land Title)");
    if (!taxDecDoc) missing.push(isEn ? "Document #2: Tax Declaration" : "Dokumento #2: Tax Declaration");
    if (!rptReceiptDoc) missing.push(isEn ? "Document #3: Real Property Tax Receipt (Amilyar)" : "Dokumento #3: Real Property Tax Receipt (Amilyar)");
    if (!brgyClearanceDoc) missing.push(isEn ? "Document #4: Barangay Clearance" : "Dokumento #4: Barangay Clearance");
    if (!ploCertDoc) missing.push(isEn ? "Document #5: PLO Certification (MERALCO)" : "Dokumento #5: PLO Certification (MERALCO)");
    if (!photoDocsDoc) missing.push(isEn ? "Document #6: Photo Documentation (Interior & Exterior)" : "Dokumento #6: Photo Documentation (Loob at Labas)");

    if ([landTitleDoc, taxDecDoc, rptReceiptDoc, brgyClearanceDoc, ploCertDoc, photoDocsDoc].some((d) => d?.uploading)) {
      missing.push(isEn ? "Some documents are currently uploading..." : "May dokumentong kasalukuyan pang nag-a-upload...");
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
    if (buildingType === "Agro-Industrial" || cat === "agricultural") {
      return "Agro-Industrial (Poultry / Piggery / Farm)";
    }
    if (buildingType) {
      return buildingType;
    }
    switch (cat) {
      case "private_infrastructure":
        return isEn ? "Private Infrastructure" : "Pribadong Imprastraktura";
      case "commercial_business":
        return isEn ? "Commercial & Business" : "Komersyal at Negosyo";
      case "agricultural":
        return "Agro-Industrial (Poultry / Piggery / Farm)";
      case "municipal_project":
        return isEn ? "Municipal Project (LGU)" : "Proyektong Pambayan (LGU)";
      case "special_use":
        return isEn ? "Special Use" : "Espesyal na Paggamit";
      default:
        return "Locational Clearance / Zoning";
    }
  };

  const confirmModalData: ApplicationConfirmData = {
    category,
    categoryLabel: getCategoryLabel(category),
    title: title.trim() || `${category.replace("_", " ")} Application`,
    applicantName: applicantName.trim() || (isEn ? "Applicant" : "Aplikante"),
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
    isGeotagged: coordinateSource === "geotag" && Boolean(geotagResult?.hasGeotag),
    floodHazard: geoRisk?.flood?.value || "Safe",
    landslideHazard: geoRisk?.landslide?.value || "Safe",
    banahawKm: ban.km,
    attachedDocs: [
      { label: isEn ? "Land Title / TCT / Deed of Sale" : "Titulo ng Lupa / TCT / Deed of Sale", filename: landTitleDoc?.name },
      { label: isEn ? "Tax Declaration" : "Tax Declaration", filename: taxDecDoc?.name },
      { label: isEn ? "RPT / Real Property Tax Receipt" : "RPT / Real Property Tax Receipt", filename: rptReceiptDoc?.name },
      { label: isEn ? "Barangay Clearance" : "Barangay Clearance", filename: brgyClearanceDoc?.name },
      { label: isEn ? "Location Plan / PLO Certification" : "Location Plan / PLO Certification", filename: ploCertDoc?.name },
      { label: isEn ? "Site Photos" : "Mga Larawan ng Site", filename: photoDocsDoc?.name },
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
            aria-label={step > 1 ? (isEn ? "Back to previous step" : "Bumalik sa nakaraang hakbang") : (isEn ? "Back to dashboard" : "Bumalik sa dashboard")}
            title={step > 1 ? (isEn ? "Back" : "Bumalik") : (isEn ? "Back to dashboard" : "Bumalik sa dashboard")}
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
          <a
            href="#infa-form"
            className="new-app-terms-trigger-btn"
            style={{ textDecoration: "none", color: "var(--apple-accent, #2997ff)", borderColor: "rgba(41, 151, 255, 0.4)", display: "inline-flex", alignItems: "center", gap: 5 }}
            title={isEn ? "Try the New Modern Application Form (Agricultural / Enterprise)" : "Subukan ang Bagong Modern Application Form (Agricultural / Enterprise)"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>Modern Dark Form</span>
          </a>
          <button
            type="button"
            className="new-app-terms-trigger-btn"
            onClick={() => setTermsModalOpen(true)}
            title={isEn ? "View Terms & Conditions" : "Tingnan ang Mga Tuntunin at Kundisyon (Terms & Conditions)"}
          >
            <IconShieldCheck size={14} color="currentColor" />
            <span className="new-app-terms-trigger-label">{isEn ? "Terms & Conditions" : "Tuntunin at Kundisyon"}</span>
          </button>
          <LanguageToggle />
          <ThemeToggle iconOnly />
        </div>
      </header>

      {/* Progress Stepper Bar */}
      <div className="new-app-page-stepper">
        <div className="new-app-stepper-inner">
          {/* Mobile Compact Progress Indicator */}
          <div className="new-app-stepper-mobile-meta">
            <div className="new-app-stepper-mobile-indicator">
              <span className="new-app-stepper-mobile-badge">{isEn ? `Step ${step} of 4` : `Hakbang ${step} ng 4`}</span>
              <span className="new-app-stepper-mobile-label">
                {step === 1 && (isEn ? "1. Category (Select Application Type)" : "1. Kategorya (Ano ang ia-apply?)")}
                {step === 2 && (isEn ? "2. Project Information" : "2. Impormasyon ng Proyekto")}
                {step === 3 && (isEn ? "3. GIS Location & Hazard" : "3. GIS Location & Hazard")}
                {step === 4 && (isEn ? "4. Confirmation" : "4. Pagkumpirma")}
              </span>
            </div>
            <div className="new-app-stepper-mobile-bar">
              <div
                className={`new-app-mobile-step-item ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}
                onClick={() => { if (step > 1) setStep(1); }}
                role={step > 1 ? "button" : undefined}
                tabIndex={step > 1 ? 0 : undefined}
                title={isEn ? "1. Category" : "1. Kategorya"}
              >
                <div className={`new-app-mobile-segment ${step >= 1 ? "filled" : ""}`} />
                <span className="new-app-mobile-step-text">{isEn ? "1. Category" : "1. Kategorya"}</span>
              </div>
              <div
                className={`new-app-mobile-step-item ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}
                onClick={() => { if (step > 2) setStep(2); }}
                role={step > 2 ? "button" : undefined}
                tabIndex={step > 2 ? 0 : undefined}
                title={isEn ? "2. Information" : "2. Impormasyon"}
              >
                <div className={`new-app-mobile-segment ${step >= 2 ? "filled" : ""}`} />
                <span className="new-app-mobile-step-text">{isEn ? "2. Information" : "2. Impormasyon"}</span>
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
                title={isEn ? "4. Confirmation" : "4. Pagkumpirma"}
              >
                <div className={`new-app-mobile-segment ${step >= 4 ? "filled" : ""}`} />
                <span className="new-app-mobile-step-text">{isEn ? "4. Confirm" : "4. Kumpirma"}</span>
              </div>
            </div>
          </div>

          {/* Desktop & Tablet Track */}
          <div className="new-app-stepper-desktop-track">
            <div className={`new-app-page-step ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}>
              <span className="new-app-page-step-badge">{step > 1 ? "✓" : "1"}</span>
              <span className="new-app-page-step-text">
                <span className="new-app-step-full">{isEn ? "1. Category (Select Application Type)" : "1. Kategorya (Ano ang ia-apply?)"}</span>
                <span className="new-app-step-short">{isEn ? "1. Category" : "1. Kategorya"}</span>
              </span>
            </div>
            <div className={`new-app-page-step-divider ${step > 1 ? "completed" : ""}`} />
            <div className={`new-app-page-step ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}>
              <span className="new-app-page-step-badge">{step > 2 ? "✓" : "2"}</span>
              <span className="new-app-page-step-text">
                <span className="new-app-step-full">{isEn ? "2. Project Information" : "2. Impormasyon ng Proyekto"}</span>
                <span className="new-app-step-short">{isEn ? "2. Information" : "2. Impormasyon"}</span>
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
                <span className="new-app-step-full">{isEn ? "4. Confirmation" : "4. Pagkumpirma"}</span>
                <span className="new-app-step-short">{isEn ? "4. Confirm" : "4. Kumpirma"}</span>
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
                <strong>{isEn ? "Your draft was automatically restored:" : "Awtomatikong naibalik ang iyong draft:"}</strong>{" "}
                {isEn ? "Your previously entered information and selected category have been restored." : "Na-restore ang iyong mga naunang inilagay na impormasyon at napiling kategorya."}
              </span>
            </div>
            <div className="new-app-draft-banner-actions">
              <button
                type="button"
                className="new-app-draft-reset-btn"
                onClick={handleResetDraft}
                title={isEn ? "Clear draft and start over" : "Burahin ang draft at magsimula muli"}
              >
                {isEn ? "Start Over (Clear Draft)" : "Mag-umpisa Muli (Clear Draft)"}
              </button>
              <button
                type="button"
                className="new-app-draft-dismiss-btn"
                onClick={() => setDraftRestored(false)}
                title={isEn ? "Dismiss notice" : "Itago ang paunawa"}
                aria-label={isEn ? "Close notice" : "Isara ang paunawa"}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: CATEGORY SELECTION ("Ano ang ia-apply?") */}
        {step === 1 && (
          <div>
            <div className="new-app-heading-wrap">
              <h1 className="new-app-main-heading">{isEn ? "What are you applying for?" : "Ano ang ia-apply?"}</h1>
              <p className="new-app-main-lead">
                {isEn
                  ? "Select the correct application category to obtain the appropriate zoning evaluation, environmental buffer checking, and GIS hazard screening."
                  : "Pumili ng tamang kategorya ng aplikasyon upang maipagkaloob ang karampatang zoning evaluation, environmental buffer checking, at GIS hazard screening."}
              </p>
            </div>

            <div className="new-app-page-cards-grid" role="radiogroup" aria-label={isEn ? "Application Category" : "Kategorya ng Aplikasyon"}>
              {categoriesList.map((item) => {
                const IconComponent = item.icon;
                const isSelected = item.isAgro
                  ? category === "agricultural"
                  : category === "private_infrastructure" && (buildingType === item.key || (!buildingType && item.key === "Residential"));

                const handleSelect = () => {
                  if (item.isAgro) {
                    setCategory("agricultural");
                    setBuildingType("Agro-Industrial");
                  } else {
                    setCategory("private_infrastructure");
                    setBuildingType(item.key);
                  }
                };

                return (
                  <div
                    key={item.key}
                    className={`new-app-page-card ${isSelected ? "selected" : ""}`}
                    onClick={handleSelect}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelect();
                      }
                    }}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                  >
                    <div className="new-app-card-radio-indicator" aria-hidden="true">
                      <IconCheck size={12} color="#ffffff" />
                    </div>
                    <div className="new-app-card-top-row">
                      <div className="new-app-card-icon-wrap" style={{ color: item.color }}>
                        <IconComponent size={28} color={item.color} />
                      </div>
                      <div className="new-app-card-header-text">
                        <div className="new-app-card-title">{item.title}</div>
                        <div className="new-app-card-tagline">{item.tagline}</div>
                        <span className="new-app-card-badge" style={{ borderColor: item.color, color: item.color, background: `${item.color}14` }}>
                          {item.badge}
                        </span>
                      </div>
                    </div>
                    <div className="new-app-card-desc">{item.desc}</div>
                    <ul className="new-app-card-features">
                      {item.features.map((feat, fIdx) => (
                        <li key={fIdx}>
                          <IconCheck size={13} color={item.color} />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="new-app-page-footer new-app-step1-footer">
              <button type="button" className="new-app-page-btn new-app-page-btn-secondary" onClick={onBack} title={isEn ? "Back to Dashboard" : "Bumalik sa Dashboard"}>
                <span className="new-app-btn-text-full">{isEn ? "← Back to Dashboard" : "← Bumalik sa Dashboard"}</span>
                <span className="new-app-btn-text-short">{isEn ? "← Back" : "← Bumalik"}</span>
              </button>
              <button type="button" className="new-app-page-btn new-app-page-btn-primary" onClick={() => setStep(2)}>
                <span className="new-app-btn-text-full">{isEn ? "Proceed to Information" : "Magpatuloy sa Impormasyon"}</span>
                <span className="new-app-btn-text-short">{isEn ? "Proceed" : "Magpatuloy"}</span>
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
                    <span>{isEn ? "Private Infrastructure Application Details" : "Private Infrastructure Application Details"}</span>
                  </>
                )}
                {category === "agricultural" && (
                  <>
                    <IconAgroIndustrial size={20} color="var(--apple-safe, #15803d)" />
                    <span>{isEn ? "Agro-Industrial Application Details" : "Agro-Industrial Application Details"}</span>
                  </>
                )}
                {category === "municipal_project" && (
                  <>
                    <IconMunicipal size={20} color="var(--apple-warn, #b45309)" />
                    <span>{isEn ? "Municipal Infrastructure Project Details" : "Municipal Infrastructure Project Details"}</span>
                  </>
                )}
              </h2>
              <div className="new-app-form-sub">
                {isEn
                  ? "Fill in the required information for official recording and MPDC evaluation."
                  : "Punan ang mga kailangang impormasyon para sa opisyal na pagtatala at pagsusuri ng MPDC."}
              </div>
            </div>

            <div className="new-app-form-grid">
              {/* Project Title */}
              <div className="new-app-field full-width">
                <label className="new-app-label">
                  {isEn ? "Project Name / Application Title *" : "Pangalan ng Proyekto / Application Title *"}
                </label>
                <input
                  type="text"
                  className={`new-app-input ${attemptedStep2Proceed && !title.trim() ? "is-missing-field" : ""}`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    category === "private_infrastructure"
                      ? (isEn ? "e.g. 2-Storey Commercial Building - Santos Lot" : "hal. 2-Storey Commercial Building - Santos Lot")
                      : category === "agricultural"
                      ? (isEn ? "e.g. Luisiana Agro-Industrial Broiler Farm Phase 1" : "hal. Luisiana Agro-Industrial Broiler Farm Phase 1")
                      : (isEn ? "e.g. Barangay San Salvador Evacuation Center" : "hal. Barangay San Salvador Evacuation Center")
                  }
                />
              </div>

              {/* Applicant / Proponent Name */}
              <div className="new-app-field">
                <label className="new-app-label">
                  {category === "municipal_project"
                    ? (isEn ? "Project Proponent / Focal Engineer *" : "Project Proponent / Focal Engineer *")
                    : (isEn ? "Applicant / Owner Name *" : "Pangalan ng Aplikante / May-ari *")}
                </label>
                <input
                  type="text"
                  className={`new-app-input ${attemptedStep2Proceed && !applicantName.trim() ? "is-missing-field" : ""}`}
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  placeholder={isEn ? "e.g. Juan Dela Cruz" : "hal. Juan Dela Cruz"}
                />
              </div>

              {/* Mobile Phone */}
              <div className="new-app-field">
                <label className="new-app-label">{isEn ? "Mobile Contact Number (11-digit) *" : "Mobile Contact Number (11-digit) *"}</label>
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
                <label className="new-app-label">{isEn ? "Email Address *" : "Email Address *"}</label>
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
                <label className="new-app-label">{isEn ? "Barangay Location *" : "Barangay Location *"}</label>
                <select
                  className="new-app-select"
                  value={barangay}
                  onChange={(e) => handleBarangayChange(e.target.value)}
                >
                  {activeBarangays.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* Specific Sitio / Street */}
              <div className="new-app-field full-width">
                <label className="new-app-label">{isEn ? "Sitio / Street / Landmark Address *" : "Sitio / Street / Landmark Address *"}</label>
                <input
                  type="text"
                  className={`new-app-input ${attemptedStep2Proceed && !locationDescription.trim() ? "is-missing-field" : ""}`}
                  value={locationDescription}
                  onChange={(e) => setLocationDescription(e.target.value)}
                  placeholder={isEn ? "e.g. Sitio Mahabang Parang, near Barangay Outpost" : "hal. Sitio Mahabang Parang, tapat ng Barangay Outpost"}
                />
              </div>

              {/* Interactive Location Pinpoint Map */}
              <div id="new-app-location-section" className="new-app-field full-width" style={{ marginTop: 4 }}>
                <input
                  ref={quickGeotagInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) {
                      void handleAttachFile(file, "photoDocs", setPhotoDocsDoc, { isQuickGeotag: true });
                    }
                  }}
                />
                <div className="new-app-label new-app-map-label">
                  <div className="new-app-map-label-left">
                    <span>{isEn ? "Exact Project Location (Interactive Map Pinpoint) *" : "Eksaktong Lokasyon ng Proyekto (Interactive Map Pinpoint) *"}</span>
                    {coordinateSource === "geotag" && geotagResult?.hasGeotag ? (
                      <span className="new-app-coord-source-badge geotag" title={isEn ? "Coordinates auto-extracted from photo documentation" : "Awtomatikong nakuha mula sa photo documentation"}>
                        📸 {isEn ? "Geotagged Photo" : "Geotagged Litrato"}
                      </span>
                    ) : (
                      <span className="new-app-coord-source-badge manual" title={isEn ? "Manually pinned using map pinpointer" : "Manwal na nai-pin gamit ang map pinpointer"}>
                        📍 {isEn ? "Map Pinpointer" : "Map Pinpointer"}
                      </span>
                    )}
                  </div>
                  <div className="new-app-map-label-right">
                    <span className="new-app-map-coords-text">
                      {pinnedCoords.lat.toFixed(6)}° N, {pinnedCoords.lon.toFixed(6)}° E
                    </span>
                    <button
                      type="button"
                      className={`new-app-quick-geotag-btn${isOcrProcessing ? " is-scanning" : ""}`}
                      onClick={() => !isOcrProcessing && quickGeotagInputRef.current?.click()}
                      disabled={isOcrProcessing}
                      title={isEn ? "Upload geotagged photo to automatically extract coordinates and pin the map" : "Mag-upload ng geotagged photo upang awtomatikong mag-pin sa mapa"}
                    >
                      <IconCamera size={13} />
                      <span>
                        {isOcrProcessing
                          ? (isEn ? "Reading Location..." : "Binabasa ang Lokasyon...")
                          : (isEn ? "Upload Geotagged Photo" : "I-upload ang Geotagged Litrato")}
                      </span>
                    </button>
                  </div>
                </div>
                <PinpointMapPicker
                  lon={pinnedCoords.lon}
                  lat={pinnedCoords.lat}
                  selectedBarangay={barangay}
                  isGeotagged={coordinateSource === "geotag" && Boolean(geotagResult?.hasGeotag)}
                  onLocationChange={(coords) => {
                    setPinnedCoords(coords);
                    setCoordinateSource("manual");
                  }}
                  onBarangayChange={(detected) => setBarangay(detected)}
                />
              </div>

              {/* ── PRIVATE INFRASTRUCTURE SPECIFIC FIELDS ── */}
              {category === "private_infrastructure" && (
                <>
                  <div className="new-app-field">
                    <label className="new-app-label">{isEn ? "Building Type / Category *" : "Uri ng Gusali / Kategorya (Building Type / Category) *"}</label>
                    <select
                      className="new-app-select"
                      value={buildingType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBuildingType(val);
                        if (val === "Agro-Industrial") {
                          setCategory("agricultural");
                        } else {
                          setCategory("private_infrastructure");
                        }
                      }}
                    >
                      {activeBuildingTypes.map((bType) => (
                        <option key={bType} value={bType}>
                          {bType}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="new-app-field">
                    <label className="new-app-label">{isEn ? "Lot Area (sq.m.) *" : "Sukat ng Lote (Lot Area in sq.m.) *"}</label>
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
                      placeholder={isEn ? "e.g. 250" : "hal. 250"}
                    />
                  </div>

                  <div className="new-app-field">
                    <label className="new-app-label">{isEn ? "TCT No. (Transfer Certificate of Title) *" : "TCT No. (Transfer Certificate of Title) *"}</label>
                    <input
                      type="text"
                      className={`new-app-input ${attemptedStep2Proceed && !tctNo.trim() ? "is-missing-field" : ""}`}
                      value={tctNo}
                      onChange={(e) => setTctNo(e.target.value)}
                      placeholder={isEn ? "e.g. TCT-059-2023001234" : "hal. TCT-059-2023001234"}
                    />
                  </div>

                  <div className="new-app-field">
                    <label className="new-app-label">{isEn ? "Tax Declaration (TD) No. *" : "Tax Declaration (TD) No. *"}</label>
                    <input
                      type="text"
                      className={`new-app-input ${attemptedStep2Proceed && !taxDecNo.trim() ? "is-missing-field" : ""}`}
                      value={taxDecNo}
                      onChange={(e) => setTaxDecNo(e.target.value)}
                      placeholder={isEn ? "e.g. TD-2024-0012-0045" : "hal. TD-2024-0012-0045"}
                    />
                  </div>
                </>
              )}

              {/* ── AGRO-INDUSTRIAL SPECIFIC FIELDS ── */}
              {category === "agricultural" && (
                <>
                  <div className="new-app-field full-width">
                    <label className="new-app-label">{isEn ? "Project Category *" : "Kategorya ng Proyekto (Category) *"}</label>
                    <select
                      className="new-app-select"
                      value="Agro-Industrial"
                      onChange={(e) => {
                        const val = e.target.value;
                        setBuildingType(val);
                        if (val !== "Agro-Industrial") {
                          setCategory("private_infrastructure");
                        }
                      }}
                    >
                      {activeBuildingTypes.map((bType) => (
                        <option key={bType} value={bType}>
                          {bType}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="new-app-field full-width">
                    <label className="new-app-label">{isEn ? "Agro-Industrial Facility Type *" : "Uri ng Pasilidad sa Agro-Industrial (Facility Type) *"}</label>
                    <select
                      className="new-app-select"
                      value={farmType}
                      onChange={(e) => setFarmType(e.target.value as AgriculturalFarmType)}
                    >
                      <option value="poultry_housing">Poultry Housing (Broiler/Layer)</option>
                      <option value="piggery_pen">Piggery Pen (Farrowing/Fattening)</option>
                      <option value="farm_storage">Agro-Industrial Storage / Warehouse / Feed Mill</option>
                      <option value="greenhouse">Greenhouse / Post-Harvest Processing</option>
                    </select>
                  </div>

                  <div className="new-app-field full-width">
                    <div className={`new-app-buffer-box ${attemptedStep2Proceed && !bufferComplianceConfirmed ? "is-missing-box" : ""}`}>
                      <div className="new-app-buffer-title">
                        <IconShieldCheck size={18} color="var(--apple-safe, #15803d)" />
                        <span>{isEn ? "Mandatory Environmental Buffer Zone Compliance *" : "Mandatory Environmental Buffer Zone Compliance *"}</span>
                      </div>
                      <div className="new-app-buffer-text">
                        {isEn ? "According to the Municipal Zoning & Sanitary Code of the Municipality of Luisiana:" : "Ayon sa Municipal Zoning & Sanitary Code ng Bayan ng Luisiana:"}
                        <ul style={{ margin: "6px 0 0 20px", padding: 0 }}>
                          <li><b>{isEn ? "500 meters" : "500 metro"}</b> {isEn ? "minimum distance from built-up residential areas and schools." : "minimum distance mula sa kabahayan at mga paaralan."}</li>
                          <li><b>{isEn ? "200 meters" : "200 metro"}</b> {isEn ? "minimum distance from major rivers and water supply intake." : "minimum distance mula sa mga pangunahing ilog at water supply intake."}</li>
                        </ul>
                      </div>
                      <label className="new-app-checkbox-label">
                        <input
                          type="checkbox"
                          checked={bufferComplianceConfirmed}
                          onChange={(e) => setBufferComplianceConfirmed(e.target.checked)}
                        />
                        <span>{isEn ? "I certify that the selected location complies with the prescribed environmental distance buffers." : "Pinatutunayan na sumusunod ang napiling lokasyon sa itinakdang environmental distance buffers."}</span>
                      </label>
                    </div>
                  </div>
                </>
              )}

              {/* ── MUNICIPAL PROJECT SPECIFIC FIELDS ── */}
              {category === "municipal_project" && (
                <>
                  <div className="new-app-field">
                    <label className="new-app-label">{isEn ? "Implementing Department / Office *" : "Implementing Department / Office *"}</label>
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
                    <label className="new-app-label">{isEn ? "Funding Source *" : "Pinagmumulan ng Pondo (Funding Source) *"}</label>
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
                    <label className="new-app-label">{isEn ? "AIP / CIP Reference Code *" : "AIP / CIP Reference Code *"}</label>
                    <input
                      type="text"
                      className={`new-app-input ${attemptedStep2Proceed && !cipCode.trim() ? "is-missing-field" : ""}`}
                      value={cipCode}
                      onChange={(e) => setCipCode(e.target.value)}
                      placeholder={isEn ? "e.g. LUIS-CIP-2026-INFRA-08" : "hal. LUIS-CIP-2026-INFRA-08"}
                    />
                  </div>

                  <div className="new-app-field">
                    <label className="new-app-label">{isEn ? "Target Beneficiaries *" : "Target Beneficiaries *"}</label>
                    <input
                      type="text"
                      className={`new-app-input ${attemptedStep2Proceed && !targetBeneficiaries.trim() ? "is-missing-field" : ""}`}
                      value={targetBeneficiaries}
                      onChange={(e) => setTargetBeneficiaries(e.target.value)}
                      placeholder={isEn ? "e.g. All residents of Luisiana" : "hal. Lahat ng mamamayan ng Luisiana"}
                    />
                  </div>

                  <div className="new-app-field">
                    <label className="new-app-label">{isEn ? "Estimated Budget (Estimated Cost in ₱ PHP) *" : "Tinatayang Badyet (Estimated Cost in ₱ PHP) *"}</label>
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
                      placeholder={isEn ? "e.g. 3500000" : "hal. 3500000"}
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
                      <span>{isEn ? "Six (6) Mandatory Documents (Citizen's Charter) *" : "Anim (6) na Mandatory Documents (Citizen's Charter) *"}</span>
                    </div>
                    <span className={`new-app-docs-counter ${uploadedDocsCount === 6 ? "complete" : "incomplete"}`}>
                      {uploadedDocsCount === 6 ? (isEn ? "Complete (6/6) ✓" : "Kumpleto (6/6) ✓") : (isEn ? `${uploadedDocsCount} of 6 Attached` : `${uploadedDocsCount} of 6 Naka-attach`)}
                    </span>
                  </div>
                  <div className="new-app-docs-sub">
                    {isEn
                      ? "Under the Citizen's Charter of the Municipality of Luisiana, all six (6) mandatory documents must be uploaded before proceeding to evaluation."
                      : "Ayon sa Citizen's Charter ng Bayan ng Luisiana, kailangang mai-upload ang lahat ng anim (6) na mandatory na dokumento bago magpatuloy sa pagsusuri."}
                  </div>
                </div>

                <div className="new-app-docs-grid">
                  {/* Upload Box 1: Photocopy ng TCT (Land Title) */}
                  <div className={`new-app-upload-box${landTitleDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-land-title"
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
                    <div className="new-app-upload-title">{isEn ? "Photocopy of TCT (Land Title) *" : "Photocopy ng TCT (Land Title) *"}</div>
                    <div className="new-app-upload-desc">
                      {isEn
                        ? "Scanned or clear copy of Transfer Certificate of Title (TCT) or OCT as proof of ownership."
                        : "Scanned o malinaw na kopya ng Transfer Certificate of Title (TCT) o OCT bilang katibayan ng pag-aari."}
                    </div>
                    <div className="new-app-upload-format-badge doc">{isEn ? "Accepted: PDF, JPG, PNG, WEBP (Max 15MB)" : "Tinatanggap: PDF, JPG, PNG, WEBP (Max 15MB)"}</div>

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
                          {isEn ? "Remove" : "Alisin"}
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="upload-land-title" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? (isEn ? "Required (Select File) *" : "Kailangan (Pumili ng File) *") : (isEn ? "Select File *" : "Pumili ng File *")}</span>
                        <span>+</span>
                      </label>
                    )}

                    {landTitleDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ {isEn ? "Attached" : "Naka-attach"} ({(landTitleDoc.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Box 2: Tax Declaration */}
                  <div className={`new-app-upload-box${taxDecDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-tax-dec"
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
                      {isEn
                        ? "Certified True Copy of the latest Tax Declaration for the property from the Municipal Assessor."
                        : "Certified True Copy ng pinakahuling Tax Declaration para sa lupa mula sa Municipal Assessor."}
                    </div>
                    <div className="new-app-upload-format-badge doc">{isEn ? "Accepted: PDF, JPG, PNG, WEBP (Max 15MB)" : "Tinatanggap: PDF, JPG, PNG, WEBP (Max 15MB)"}</div>

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
                          {isEn ? "Remove" : "Alisin"}
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="upload-tax-dec" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? (isEn ? "Required (Select File) *" : "Kailangan (Pumili ng File) *") : (isEn ? "Select File *" : "Pumili ng File *")}</span>
                        <span>+</span>
                      </label>
                    )}

                    {taxDecDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ {isEn ? "Attached" : "Naka-attach"} ({(taxDecDoc.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Box 3: Current Real Property Tax Receipt */}
                  <div className={`new-app-upload-box${rptReceiptDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-rpt-receipt"
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
                    <div className="new-app-upload-title">{isEn ? "Current Real Property Tax Receipt (Amilyar) *" : "Current Real Property Tax Receipt (Amilyar) *"}</div>
                    <div className="new-app-upload-desc">
                      {isEn
                        ? "Official Receipt / Tax Clearance for real property tax payment for the current year."
                        : "Resibo ng bayad sa amilyar (Official Receipt / Tax Clearance) para sa kasalukuyang taon."}
                    </div>
                    <div className="new-app-upload-format-badge doc">{isEn ? "Accepted: PDF, JPG, PNG, WEBP (Max 15MB)" : "Tinatanggap: PDF, JPG, PNG, WEBP (Max 15MB)"}</div>

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
                          {isEn ? "Remove" : "Alisin"}
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="upload-rpt-receipt" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? (isEn ? "Required (Select File) *" : "Kailangan (Pumili ng File) *") : (isEn ? "Select File *" : "Pumili ng File *")}</span>
                        <span>+</span>
                      </label>
                    )}

                    {rptReceiptDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ {isEn ? "Attached" : "Naka-attach"} ({(rptReceiptDoc.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Box 4: Barangay Clearance */}
                  <div className={`new-app-upload-box${brgyClearanceDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-brgy-clearance"
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
                      {isEn
                        ? "Official clearance for construction / location from the Barangay where the lot is located."
                        : "Opisyal na clearance para sa konstruksyon / lokasyon mula sa Barangay kung saan nakatirik ang lote."}
                    </div>
                    <div className="new-app-upload-format-badge doc">{isEn ? "Accepted: PDF, JPG, PNG, WEBP (Max 15MB)" : "Tinatanggap: PDF, JPG, PNG, WEBP (Max 15MB)"}</div>

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
                          {isEn ? "Remove" : "Alisin"}
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="upload-brgy-clearance" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? (isEn ? "Required (Select File) *" : "Kailangan (Pumili ng File) *") : (isEn ? "Select File *" : "Pumili ng File *")}</span>
                        <span>+</span>
                      </label>
                    )}

                    {brgyClearanceDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ {isEn ? "Attached" : "Naka-attach"} ({(brgyClearanceDoc.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Box 5: PLO Certification */}
                  <div className={`new-app-upload-box${ploCertDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-plo-cert"
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
                      {isEn
                        ? "Clearance from MERALCO / Public Lighting Office for official power utility connection."
                        : "Clearance mula sa MERALCO / Public Lighting Office para sa opisyal na koneksyon ng kuryente."}
                    </div>
                    <div className="new-app-upload-format-badge doc">{isEn ? "Accepted: PDF, JPG, PNG, WEBP (Max 15MB)" : "Tinatanggap: PDF, JPG, PNG, WEBP (Max 15MB)"}</div>

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
                          {isEn ? "Remove" : "Alisin"}
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="upload-plo-cert" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? (isEn ? "Required (Select File) *" : "Kailangan (Pumili ng File) *") : (isEn ? "Select File *" : "Pumili ng File *")}</span>
                        <span>+</span>
                      </label>
                    )}

                    {ploCertDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ {isEn ? "Attached" : "Naka-attach"} ({(ploCertDoc.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Box 6: Photo Documentation */}
                  <div className={`new-app-upload-box${photoDocsDoc ? " attached" : attemptedStep2Proceed ? " is-missing-box" : ""}`}>
                    <input
                      id="upload-photo-docs"
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
                    <div className="new-app-upload-title">{isEn ? "Photo Documentation *" : "Photo Documentation *"}</div>
                    <div className="new-app-upload-desc">
                      {isEn
                        ? "Photographs of the interior and exterior of the lot/site (actual on-ground condition)."
                        : "Mga litrato ng loob at labas ng mismong lote/site (aktwal na kalagayan ng lugar)."}
                    </div>
                    <div className="new-app-upload-format-badge photo">{isEn ? "Accepted: Photos Only (JPG, PNG, WEBP) · No PDF" : "Tinatanggap: Litrato Lamang (JPG, PNG, WEBP) · Bawal ang PDF"}</div>

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
                            setGeotagResult(null);
                            setCoordinateSource("manual");
                          }}
                        >
                          {isEn ? "Remove" : "Alisin"}
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="upload-photo-docs" className={`new-app-upload-status ${attemptedStep2Proceed ? "missing" : "pending"}`} style={{ cursor: "pointer" }}>
                        <span>{attemptedStep2Proceed ? (isEn ? "Required (Select File) *" : "Kailangan (Pumili ng File) *") : (isEn ? "Select File *" : "Pumili ng File *")}</span>
                        <span>+</span>
                      </label>
                    )}

                    {photoDocsDoc && (
                      <div className="new-app-upload-status success">
                        <span>✓ {isEn ? "Attached" : "Naka-attach"} ({(photoDocsDoc.size / 1024).toFixed(0)} KB)</span>
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
                    <span>{isEn ? `All fields and 6 mandatory requirements must be complete before proceeding (${getStep2MissingFields().length} missing):` : `Dapat kumpleto ang lahat ng patlang at 6 na mandatory requirements bago magpatuloy (${getStep2MissingFields().length} kulang):`}</span>
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
                  <span className="new-app-btn-text-full">{isEn ? "← Back to Category" : "← Bumalik sa Kategorya"}</span>
                  <span className="new-app-btn-text-short">{isEn ? "← Back" : "← Bumalik"}</span>
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
                  title={!isStep2Valid() ? (isEn ? "Please complete all fields and 6 attachments before proceeding" : "Pakikumpleto muna ang lahat ng patlang at 6 na kalakip bago magpatuloy") : undefined}
                >
                  <span className="new-app-btn-text-full">{isEn ? "Proceed to GIS Siting" : "Magpatuloy sa GIS Siting"}</span>
                  <span className="new-app-btn-text-short">{isEn ? "Proceed" : "Magpatuloy"}</span>
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
                {isEn
                  ? "The GIS engine automatically evaluates elevation slope, fault proximity, and hazard zones across the Municipality of Luisiana."
                  : "Awtomatikong sinusuri ng GIS engine ang elevation slope, fault proximity, at hazard zones sa Bayan ng Luisiana."}
              </div>
            </div>

            {/* LUISIANA SITING ASSESSMENT (Matched with Apple Theme) */}
            <div className="app-assess-card">
              <div className="app-assess-card-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>{isEn ? "Luisiana Siting Assessment" : "Pagsusuri ng Lokasyon sa Luisiana"}</span>
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
                  <dd className="app-assess-val-accent">{isEn ? "LOW — standard seismic design" : "MABABA — standard seismic design"}</dd>
                </div>

                <div className="app-assess-row">
                  <dt>Terrain model</dt>
                  <dd className="app-assess-val-muted">{isEn ? "Not ready" : "Hindi pa handa"}</dd>
                </div>

                <div className="app-assess-row">
                  <dt>{isEn ? "Flood" : "Baha"}</dt>
                  <dd>
                    <span className={`app-hazard-badge ${getHazardBadgeClass(geoRisk?.flood?.value)}`}>
                      {geoRisk?.flood?.value || "Safe"}
                    </span>
                  </dd>
                </div>

                <div className="app-assess-row">
                  <dt>{isEn ? "Rain-induced landslide" : "Landslide dulot ng ulan"}</dt>
                  <dd>
                    <span className={`app-hazard-badge ${getHazardBadgeClass(geoRisk?.landslide?.value)}`}>
                      {geoRisk?.landslide?.value || "Safe"}
                    </span>
                  </dd>
                </div>

                <div className="app-assess-row">
                  <dt>Mt. Banahaw</dt>
                  <dd className="app-assess-val-normal">
                    {ban.km.toFixed(1)} {isEn ? "km north of summit" : "km hilaga ng summit"}
                  </dd>
                </div>
              </dl>

              <p className="app-assess-note">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>{isEn ? "Luisiana only · MGB flood & landslide (GeoRiskPH) + PHIVOLCS 2014 sheets + local terrain model." : "Luisiana only · MGB baha at landslide (GeoRiskPH) + PHIVOLCS 2014 sheets + lokal na terrain model."}</span>
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
                <span>{isEn ? "View report" : "Tingnan ang ulat (Report)"}</span>
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
              <span>{isEn ? "After submission, you can immediately open the interactive 2D map to inspect the exact perimeter." : "Pagkatapos i-submit, maaari mong buksan agad ang interactive 2D map upang mai-plot ang eksaktong perimeter gamit ang cursor."}</span>
            </div>

            <div className="new-app-page-footer">
              <div className="new-app-footer-actions">
                <button type="button" className="new-app-page-btn new-app-page-btn-secondary" onClick={handleBack}>
                  <span className="new-app-btn-text-full">{isEn ? "← Back to Form" : "← Bumalik sa Form"}</span>
                  <span className="new-app-btn-text-short">{isEn ? "← Back" : "← Bumalik"}</span>
                </button>
                <button
                  type="button"
                  className="new-app-page-btn new-app-page-btn-primary"
                  disabled={submitting}
                  onClick={handleInitiateSubmit}
                >
                  <span>
                    {submitting ? (
                      (isEn ? "Submitting..." : "Isinusumite...")
                    ) : (
                      <>
                        <span className="new-app-btn-text-full">{isEn ? "Confirm & Submit" : "Kumpirmahin at I-submit"}</span>
                        <span className="new-app-btn-text-short">{isEn ? "Submit" : "I-submit"}</span>
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
              {isEn ? "Application Successfully Created!" : "Matagumpay na Nalikha ang Aplikasyon!"}
            </h1>
            <p style={{ margin: "0 auto 24px", fontSize: "0.94rem", color: "var(--apple-text-secondary, #6e6e73)", maxWidth: 520, lineHeight: 1.55 }}>
              {isEn
                ? "Your application has been officially recorded in the database of the Municipality of Luisiana for MPDC and Engineering evaluation."
                : "Nailagay na sa database ng Bayan ng Luisiana ang inyong aplikasyon para sa opisyal na pagsusuri ng MPDC at Engineering Office."}
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
                {isEn ? "Tracking Reference Number" : "Tracking Reference Number"}
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--apple-text, #1d1d1f)", marginTop: 6, letterSpacing: "0.05em", fontFamily: "monospace" }}>
                {generatedTrackingNo}
              </div>
            </div>

            {/* Attached Documents Verification Summary */}
            <div style={{ maxWidth: 580, margin: "0 auto 28px", textAlign: "left", background: "var(--apple-surface-secondary, #f5f5f7)", border: "1px solid var(--apple-border, rgba(0, 0, 0, 0.08))", borderRadius: "var(--apple-radius-md, 10px)", padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--apple-text-secondary, #6e6e73)", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <IconUploadCloud size={16} color="var(--apple-text, #1d1d1f)" />
                <span>{isEn ? "Attached Documents" : "Nai-attach na mga Dokumento"} ({[landTitleDoc, taxDecDoc, rptReceiptDoc, brgyClearanceDoc, ploCertDoc, photoDocsDoc].filter(Boolean).length} of 6)</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: "0.82rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: landTitleDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconFileTextDoc size={14} color="currentColor" /> {isEn ? "Photocopy of TCT (Land Title):" : "Photocopy ng TCT (Land Title):"}
                  </span>
                  <strong>{landTitleDoc ? `✓ ${landTitleDoc.name}` : (isEn ? "None attached" : "Walang kalakip")}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: taxDecDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconFileTextDoc size={14} color="currentColor" /> Tax Declaration:
                  </span>
                  <strong>{taxDecDoc ? `✓ ${taxDecDoc.name}` : (isEn ? "None attached" : "Walang kalakip")}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: rptReceiptDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconReceipt size={14} color="currentColor" /> {isEn ? "Current Real Property Tax Receipt (Amilyar):" : "Current Real Property Tax Receipt (Amilyar):"}
                  </span>
                  <strong>{rptReceiptDoc ? `✓ ${rptReceiptDoc.name}` : (isEn ? "None attached" : "Walang kalakip")}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: brgyClearanceDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconShieldCheck size={14} color="currentColor" /> Barangay Clearance:
                  </span>
                  <strong>{brgyClearanceDoc ? `✓ ${brgyClearanceDoc.name}` : (isEn ? "None attached" : "Walang kalakip")}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: ploCertDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconBolt size={14} color="currentColor" /> {isEn ? "PLO Certification (MERALCO Clearance):" : "PLO Certification (MERALCO Clearance):"}
                  </span>
                  <strong>{ploCertDoc ? `✓ ${ploCertDoc.name}` : (isEn ? "None attached" : "Walang kalakip")}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: photoDocsDoc ? "var(--apple-safe, #15803d)" : "var(--apple-text-tertiary, #86868b)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconCamera size={14} color="currentColor" /> {isEn ? "Photo Documentation (Site Photos):" : "Photo Documentation (Loob at Labas ng Site):"}
                  </span>
                  <strong>{photoDocsDoc ? `✓ ${photoDocsDoc.name}` : (isEn ? "None attached" : "Walang kalakip")}</strong>
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
                <span>{isEn ? "Track Application (Live Tracker)" : "Subaybayan ang Aplikasyon (Live Tracker)"}</span>
              </button>

              {onViewOnMap && (
                <button
                  type="button"
                  className="new-app-page-btn new-app-page-btn-primary"
                  onClick={() => onViewOnMap(pinnedCoords.lon, pinnedCoords.lat)}
                >
                  <IconMap size={16} color="currentColor" />
                  <span>{isEn ? "View on 2D Map" : "Tingnan sa 2D Mapa"}</span>
                </button>
              )}
              <button
                type="button"
                className="new-app-page-btn new-app-page-btn-secondary"
                onClick={onBack}
              >
                {isEn ? "Back to Dashboard / Landing" : "Bumalik sa Dashboard / Landing"}
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
