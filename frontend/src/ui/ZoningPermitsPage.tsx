import React, { useEffect, useState, useMemo, useRef } from "react";
import { io } from "socket.io-client";
import type { SessionUser } from "../services/auth";
import type { PlanningProposal } from "../types";
import { fetchProposalsOnce } from "../services/firestore-planning";
import {
  fetchCitizenApplications,
  patchCitizenApplication,
  backendUrl,
} from "../lib/api";
import { BARANGAY_LIST } from "../types";
import { ThemeToggle } from "./ThemeToggle";
import ZoningReviewMapView from "./ZoningReviewMapView";
import { getClupZone } from "../lib/clup-zones";
import "./ZoningPermitsPage.css";

/* ── Vector SVG Icons (No Emojis) ── */
function IconBell({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconTitleDeed({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconTaxDoc({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.342a2 2 0 0 0-.602-1.43l-4.44-4.342A2 2 0 0 0 13.56 2H6a2 2 0 0 0-2 2z" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function IconReceipt({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function IconGovernmentBuilding({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 21h18" />
      <path d="M5 21V10l7-5 7 5v11" />
      <path d="M9 21V14h6v7" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
    </svg>
  );
}

function IconElectricity({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconCamera({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconUser({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconEngineer({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M2 18h20" />
      <path d="M4 18v-2a8 8 0 0 1 16 0v2" />
      <path d="M12 4v4" />
      <path d="M10 8h4" />
    </svg>
  );
}

function IconPaperclip({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function IconSearch({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconFile({ size = 13, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconBolt({ size = 13, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className} style={style} aria-hidden>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconCheck({ size = 13, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconAlertTriangle({ size = 13, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconClock({ size = 14, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconEye({ size = 14, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconCheckCircle({ size = 14, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconRotateCcw({ size = 14, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function IconMapPin({ size = 14, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconDownload({ size = 14, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconZoomIn({ size = 13, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function IconZoomOut({ size = 13, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function IconRotate({ size = 13, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

function IconChevronLeft({ size = 13, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight({ size = 13, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconX({ size = 13, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconXCircle({ size = 14, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function IconArrowRight({ size = 14, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

const REJECT_PRESET_REASONS = [
  "Malabo o hindi mabasa ang kopya (Blurry / Unreadable)",
  "Maling dokumento ang isinumite (Wrong Document)",
  "Expired o lumang resibo / clearance",
  "Hindi tugma ang pangalan o detalye sa titulo",
  "Kulang o putol ang mga pahina ng dokumento",
  "May bura o pinaghihinalaang alteration",
];


export interface MpdcNotification {
  id: string;
  source: "application" | "planning";
  kind: "new" | "payment" | "inspection" | "flagged" | "planning" | "approved";
  title: string;
  message: string;
  timestamp: string;
  badge: string;
  trackingNumber?: string;
  applicationId?: string;
  proposalId?: string;
}

function formatRealDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const datePart = d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart} · ${timePart}`;
  } catch {
    return String(iso);
  }
}

function formatRealNotifDate(iso?: string | null): string {
  if (!iso) return "Walang petsa";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const datePart = d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const ms = Date.now() - d.getTime();
    if (ms < 0) return `${datePart} · ${timePart}`;
    const s = Math.round(ms / 1000);
    let ago = "";
    if (s < 60) ago = "kamakailan";
    else if (s < 3600) ago = `${Math.round(s / 60)}m nakalipas`;
    else if (s < 86400) ago = `${Math.round(s / 3600)}h nakalipas`;
    else ago = `${Math.round(s / 86400)}d nakalipas`;

    return `${datePart} · ${timePart} (${ago})`;
  } catch {
    return String(iso);
  }
}

function formatAgo(iso: string): string {
  return formatRealNotifDate(iso);
}

type Props = {
  onBack?: () => void;
  session: SessionUser | null;
  onLogout?: () => void;
  onNewApplication?: () => void;
  onNavigate?: (screen: "planning" | "documents" | "analytics" | "audit" | "app") => void;
  onPinSite?: (app: any) => void;
};

export type RequirementIconType =
  | "tct"
  | "tax_dec"
  | "rpt_receipt"
  | "brgy_clearance"
  | "plo_cert"
  | "photo_docs";

export interface MandatoryDocRequirement {
  id: string;
  key: string;
  fallbackKeys: string[];
  stepNumber: number;
  title: string;
  subDescription: string;
  iconType: RequirementIconType;
}

export const MANDATORY_DOC_REQUIREMENTS: MandatoryDocRequirement[] = [
  {
    id: "tct",
    key: "tctTaxDec",
    fallbackKeys: ["tctTitle", "tctDoc", "landTitle", "titleDeed"],
    stepNumber: 1,
    title: "Photocopy ng TCT (Land Title)",
    subDescription: "Katunayan ng pagmamay-ari sa lupa o rehistradong titulo sa Register of Deeds",
    iconType: "tct",
  },
  {
    id: "tax_dec",
    key: "taxDeclaration",
    fallbackKeys: ["taxDec", "taxDeclarationDoc"],
    stepNumber: 2,
    title: "Tax Declaration",
    subDescription: "Pinakabagong deklarasyon sa ari-arian mula sa Assessor's Office",
    iconType: "tax_dec",
  },
  {
    id: "rpt_receipt",
    key: "rptReceipt",
    fallbackKeys: ["rptTaxReceipt", "taxReceipt", "amilyarReceipt"],
    stepNumber: 3,
    title: "Current Real Property Tax Receipt (Amilyar)",
    subDescription: "Resibo ng bayad sa amilyar para sa kasalukuyang taon mula sa Treasury Office",
    iconType: "rpt_receipt",
  },
  {
    id: "brgy_clearance",
    key: "brgyClearance",
    fallbackKeys: ["barangayClearance"],
    stepNumber: 4,
    title: "Barangay Clearance",
    subDescription: "Pahintulot at clearance mula sa Punong Barangay ng lokasyon ng proyekto",
    iconType: "brgy_clearance",
  },
  {
    id: "plo_cert",
    key: "ploCert",
    fallbackKeys: ["ploCertification", "meralcoClearance", "powerClearance"],
    stepNumber: 5,
    title: "PLO Certification (Clearance mula sa MERALCO)",
    subDescription: "Clearance mula sa MERALCO / PLO ukol sa linya at kaligtasan ng kuryente",
    iconType: "plo_cert",
  },
  {
    id: "photo_docs",
    key: "photoDocs",
    fallbackKeys: ["photos", "sitePhotos", "photoDocumentation"],
    stepNumber: 6,
    title: "Photo Documentation (Loob at Labas ng Site)",
    subDescription: "Mga litrato ng loob at labas ng mismong lote/site at mga kalapit na kalsada",
    iconType: "photo_docs",
  },
];

function renderRequirementIcon(type: RequirementIconType) {
  switch (type) {
    case "tct":
      return <IconTitleDeed size={20} />;
    case "tax_dec":
      return <IconTaxDoc size={20} />;
    case "rpt_receipt":
      return <IconReceipt size={20} />;
    case "brgy_clearance":
      return <IconGovernmentBuilding size={20} />;
    case "plo_cert":
      return <IconElectricity size={20} />;
    case "photo_docs":
      return <IconCamera size={20} />;
  }
}

export function extractRequirementFiles(uploads: any, req: MandatoryDocRequirement): any[] {
  if (!uploads || typeof uploads !== "object") return [];
  if (Array.isArray(uploads[req.key]) && uploads[req.key].length > 0) {
    return uploads[req.key];
  }
  for (const fb of req.fallbackKeys) {
    if (Array.isArray(uploads[fb]) && uploads[fb].length > 0) {
      return uploads[fb];
    }
  }
  if (uploads[req.key] && !Array.isArray(uploads[req.key]) && typeof uploads[req.key] === "object") {
    return [uploads[req.key]];
  }
  return [];
}

export function getCompletenessSummary(uploads: any) {
  let completed = 0;
  const missing: string[] = [];
  for (const req of MANDATORY_DOC_REQUIREMENTS) {
    const files = extractRequirementFiles(uploads, req);
    if (files.length > 0) {
      completed += 1;
    } else {
      missing.push(req.title);
    }
  }
  return {
    completed,
    total: MANDATORY_DOC_REQUIREMENTS.length,
    isComplete: completed === MANDATORY_DOC_REQUIREMENTS.length,
    missing,
  };
}

export function getSupplementaryUploads(uploads: any) {
  if (!uploads || typeof uploads !== "object") return [];
  const knownKeys = new Set(
    MANDATORY_DOC_REQUIREMENTS.flatMap((r) => [r.key, ...r.fallbackKeys])
  );
  const result: { key: string; files: any[] }[] = [];
  for (const [key, val] of Object.entries(uploads)) {
    if (knownKeys.has(key)) continue;
    const arr = Array.isArray(val) ? val : val && typeof val === "object" ? [val] : [];
    if (arr.length > 0) {
      result.push({ key, files: arr });
    }
  }
  return result;
}

function formatFileSize(size: any): string {
  if (typeof size === "number" && Number.isFinite(size)) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
  return typeof size === "string" ? size : "";
}

let pdfjsPromise: Promise<any> | null = null;
function getPdfJs(): Promise<any> {
  if ((window as any).pdfjsLib) {
    return Promise.resolve((window as any).pdfjsLib);
  }
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/pdfjs/pdf.min.js";
      script.onload = () => {
        const lib = (window as any).pdfjsLib;
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
        }
        resolve(lib);
      };
      script.onerror = (err) => {
        pdfjsPromise = null;
        reject(err);
      };
      document.head.appendChild(script);
    });
  }
  return pdfjsPromise;
}

function PdfCanvasViewer({
  url,
  title,
  fileName,
}: {
  url: string;
  title: string;
  fileName?: string;
}) {
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCurrentPage(1);

    async function loadPdf() {
      try {
        const pdfjs = await getPdfJs();
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Hindi makarga ang PDF mula sa server.`);
        }
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(buf),
          disableRange: true,
          disableStream: true,
        }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error("[PdfCanvasViewer] Error loading PDF:", err);
        setError(err?.message || "Hindi mabuksan ang PDF file.");
        setLoading(false);
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
      }
    };
  }, [url]);

  useEffect(() => {
    if (!pdfDocRef.current || loading || error) return;
    let cancelled = false;

    async function renderPage() {
      try {
        const page = await pdfDocRef.current.getPage(currentPage);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch (_) {}
        }

        const viewport = page.getViewport({ scale, rotation });
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const task = page.render({
          canvasContext: ctx,
          viewport,
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: any) {
        if (err?.name === "RenderingCancelledException") return;
        console.warn("[PdfCanvasViewer] Render warning:", err);
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
      }
    };
  }, [currentPage, scale, rotation, loading, error]);

  const handleZoomIn = () => setScale((s) => Math.min(Number((s + 0.2).toFixed(1)), 3.0));
  const handleZoomOut = () => setScale((s) => Math.max(Number((s - 0.2).toFixed(1)), 0.6));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleFitWidth = () => setScale(1.1);

  if (error) {
    return (
      <div className="zp-doc-error-box">
        <IconAlertTriangle size={32} style={{ color: "#f59e0b", marginBottom: 12 }} />
        <h4 style={{ margin: "0 0 8px 0" }}>Hindi maipakita ang PDF preview</h4>
        <p style={{ fontSize: 13, margin: "0 0 16px 0", maxWidth: 420, textAlign: "center", opacity: 0.85 }}>
          {error}
        </p>
        <a href={url} download={fileName || "dokumento.pdf"} className="zp-lightbox-download-btn">
          <IconDownload size={14} />
          I-download ang PDF nang Diretso
        </a>
      </div>
    );
  }

  return (
    <div className="zp-pdf-viewer-wrap">
      {/* Floating Modern Toolbar */}
      <div className="zp-pdf-toolbar">
        {/* Pagination */}
        <div className="zp-pdf-tb-group">
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={currentPage <= 1 || loading}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            title="Nakaraang Pahina"
            aria-label="Nakaraang Pahina"
          >
            <IconChevronLeft size={13} />
          </button>
          <span className="zp-pdf-tb-pages">
            Pahina <strong>{currentPage}</strong> / {numPages}
          </span>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={currentPage >= numPages || loading}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            title="Susunod na Pahina"
            aria-label="Susunod na Pahina"
          >
            <IconChevronRight size={13} />
          </button>
        </div>

        {/* Zoom & Rotation */}
        <div className="zp-pdf-tb-group">
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={scale <= 0.6 || loading}
            onClick={handleZoomOut}
            title="Liitan (Zoom Out)"
            aria-label="Liitan"
          >
            <IconZoomOut size={13} />
          </button>
          <span className="zp-pdf-tb-zoom-val">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={scale >= 3.0 || loading}
            onClick={handleZoomIn}
            title="Palakihin (Zoom In)"
            aria-label="Palakihin"
          >
            <IconZoomIn size={13} />
          </button>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            onClick={handleFitWidth}
            title="I-angkop sa Screen (Fit Width)"
          >
            Fit
          </button>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            onClick={handleRotate}
            title="Pihitin nang 90° (Rotate)"
            aria-label="Pihitin nang 90°"
          >
            <IconRotate size={13} />
          </button>
        </div>
      </div>

      {/* Canvas Viewport Container */}
      <div className="zp-pdf-canvas-viewport">
        {loading && (
          <div className="zp-doc-loading-overlay">
            <div className="zp-spinner" />
            <span>Ikinakarga ang PDF dokumento sa in-system canvas...</span>
          </div>
        )}
        <div className="zp-pdf-canvas-canvas-wrap">
          <canvas ref={canvasRef} className="zp-pdf-rendered-canvas" />
        </div>
      </div>
    </div>
  );
}

function ImagePreviewViewer({
  url,
  title,
  fileName,
}: {
  url: string;
  title: string;
  fileName?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1.0);

  const handleZoomIn = () => setScale((s) => Math.min(Number((s + 0.25).toFixed(2)), 3.0));
  const handleZoomOut = () => setScale((s) => Math.max(Number((s - 0.25).toFixed(2)), 0.5));
  const handleReset = () => setScale(1.0);

  if (loadError) {
    return (
      <div className="zp-doc-error-box">
        <IconAlertTriangle size={32} style={{ color: "#f59e0b", marginBottom: 12 }} />
        <h4 style={{ margin: "0 0 8px 0" }}>Hindi maipakita ang larawan</h4>
        <p style={{ fontSize: 13, margin: "0 0 16px 0", maxWidth: 400, textAlign: "center", opacity: 0.85 }}>
          {loadError}
        </p>
        <a href={url} download={fileName || "larawan"} className="zp-lightbox-download-btn">
          <IconDownload size={14} />
          I-download ang Larawan
        </a>
      </div>
    );
  }

  return (
    <div className="zp-img-viewer-wrap">
      <div className="zp-pdf-toolbar">
        <div className="zp-pdf-tb-group">
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={scale <= 0.5}
            onClick={handleZoomOut}
            title="Liitan (Zoom Out)"
          >
            <IconZoomOut size={13} />
          </button>
          <span className="zp-pdf-tb-zoom-val">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={scale >= 3.0}
            onClick={handleZoomIn}
            title="Palakihin (Zoom In)"
          >
            <IconZoomIn size={13} />
          </button>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            onClick={handleReset}
            title="Ibalik sa orihinal na sukat"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="zp-lightbox-img-viewport">
        {loading && (
          <div className="zp-doc-loading-overlay">
            <div className="zp-spinner" />
            <span>Ikinakarga ang larawan...</span>
          </div>
        )}
        <img
          src={url}
          alt={title}
          className="zp-lightbox-img"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "center center",
            transition: "transform 0.15s ease",
          }}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setLoadError("Hindi maikarga ang larawan mula sa server.");
          }}
        />
      </div>
    </div>
  );
}

function GenericDocCard({
  url,
  fileName,
  size,
  title,
}: {
  url: string;
  fileName?: string;
  size?: number;
  title: string;
}) {
  const rawExt = (fileName || url).split(".").pop()?.toUpperCase() || "FILE";
  const ext = rawExt.length > 6 ? "FILE" : rawExt;

  return (
    <div className="zp-generic-doc-box">
      <div className="zp-generic-doc-icon-wrap">
        <IconFile size={46} style={{ color: "var(--apple-accent, #0071e3)" }} />
        <span className="zp-generic-doc-badge">{ext}</span>
      </div>
      <h3 className="zp-generic-doc-title">{fileName || title}</h3>
      {size ? <span className="zp-generic-doc-size">{formatFileSize(size)}</span> : null}
      <p className="zp-generic-doc-desc">
        Ang uri ng dokumentong ito (<strong>.{ext.toLowerCase()}</strong>) ay hindi direktang
        maipakita sa web browser reader. Maaari itong i-download kung nais mong suriin o buksan gamit ang
        nakalaang desktop application sa iyong computer.
      </p>
      <a href={url} download={fileName || `dokumento.${ext.toLowerCase()}`} className="zp-lightbox-download-btn">
        <IconDownload size={14} />
        I-download ang File ({ext})
      </a>
    </div>
  );
}

function DocViewerContent({
  url,
  title,
  fileName,
  isPdf,
  isImg,
  size,
}: {
  url: string;
  title: string;
  fileName?: string;
  isPdf?: boolean;
  isImg?: boolean;
  size?: number;
}) {
  if (isImg) {
    return <ImagePreviewViewer url={url} title={title} fileName={fileName} />;
  }
  if (isPdf) {
    return <PdfCanvasViewer url={url} title={title} fileName={fileName} />;
  }
  return <GenericDocCard url={url} fileName={fileName} size={size} title={title} />;
}

let cachedCitizenApps: any[] = [];
let hasFetchedOnce = false;

export function ZoningPermitsPage({
  onBack,
  session,
  onLogout,
  onNewApplication,
  onNavigate,
  onPinSite,
}: Props) {
  const [applications, setApplications] = useState<any[]>(cachedCitizenApps);
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [modalTab, setModalTab] = useState<"checklist" | "map">("checklist");
  const [loading, setLoading] = useState(!hasFetchedOnce && cachedCitizenApps.length === 0);
  const [updating, setUpdating] = useState(false);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [search, setSearch] = useState("");
  const [filterBarangay, setFilterBarangay] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDocs, setFilterDocs] = useState<"" | "complete" | "incomplete">("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    hasFetchedOnce ? new Date().toISOString() : null
  );
  const [notification, setNotification] = useState<string | null>(null);

  // MPDC Notification Center States
  // MPDC Notification Center States (Read & Dismissed)
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("infatrack_mpdc_read_notices");
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [dismissedNotifIds, setDismissedNotifIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("infatrack_mpdc_dismissed_notices_v2");
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [planningProposals, setPlanningProposals] = useState<PlanningProposal[]>([]);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<"all" | "apps" | "planning">("all");

  useEffect(() => {
    let active = true;
    const loadProposals = async () => {
      try {
        const pList = await fetchProposalsOnce();
        if (active && Array.isArray(pList)) {
          setPlanningProposals(pList);
        }
      } catch (err) {
        console.warn("[ZoningPermitsPage] Failed to fetch planning proposals:", err);
      }
    };
    void loadProposals();
    const timer = setInterval(loadProposals, 25_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Aggregate all MPDC notifications from Citizen Applications and Planning Proposals
  const allNotices = useMemo(() => {
    const list: MpdcNotification[] = [];

    // 1. Citizen Applications notices (with real database timestamps)
    for (const app of applications) {
      const subDate = app.createdAt || app.submittedAt || app.updatedAt;
      const payDate =
        app.payment?.paidAt ||
        app.payment?.payment_date ||
        app.payment?.paymentDate ||
        app.payment?.issuedAt ||
        app.updatedAt ||
        app.createdAt;
      const inspDate =
        app.latestInspection?.inspectedAt ||
        app.latestInspection?.timestamp ||
        app.updatedAt ||
        app.createdAt;
      const flagDate = app.updatedAt || app.createdAt;

      // a) Bagong submit na aplikasyon (Hakbang 1: 10-min SLA)
      if (app.status === "submitted" || app.status === "pending") {
        list.push({
          id: `notif-app-${app.id}-submitted`,
          source: "application",
          kind: "new",
          title: `Bagong Aplikasyon: ${app.trackingNumber || app.id}`,
          message: `${app.applicantName || "Aplikante"} · ${app.projectTitle || "Zoning Permit"}. Isinumite noong ${formatRealDate(subDate)}. Kailangan ng 10-Min paunang pagsusuri.`,
          timestamp: subDate || "",
          badge: "Hakbang 1",
          trackingNumber: app.trackingNumber,
          applicationId: app.id,
        });
      }

      // b) Bayad na sa Treasury (Order of Payment settled, O.R. Issued)
      const hasPaid = app.payment?.status === "paid" || Boolean(app.payment?.orNumber);
      if (hasPaid) {
        list.push({
          id: `notif-app-${app.id}-paid-${app.payment?.orNumber || "paid"}`,
          source: "application",
          kind: "payment",
          title: `Bayad sa Treasury: ${app.payment?.orNumber || "O.R. Issued"}`,
          message: `₱${Number(app.payment?.amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })} opisyal na nabayaran noong ${formatRealDate(payDate)} ni ${app.applicantName || "Aplikante"} (${app.trackingNumber}).`,
          timestamp: payDate || "",
          badge: "O.R. Resibo",
          trackingNumber: app.trackingNumber,
          applicationId: app.id,
        });
      }

      // c) Nakatakdang Ocular Inspection (Hakbang 2)
      if (app.status === "ocular_inspection" || app.status === "for_ocular_inspection") {
        list.push({
          id: `notif-app-${app.id}-inspection`,
          source: "application",
          kind: "inspection",
          title: `Ocular Inspection: ${app.trackingNumber}`,
          message: `Nakatakdang site visit ng Zoning Officer sa ${app.barangay ? `Brgy. ${app.barangay}` : "Luisiana"} para sa proyektong "${app.projectTitle || "Estruktura"}". Petsa: ${formatRealDate(inspDate)}.`,
          timestamp: inspDate || "",
          badge: "Hakbang 2",
          trackingNumber: app.trackingNumber,
          applicationId: app.id,
        });
      }

      // d) Flagged na dokumento (kailangang rebyuhin muli)
      if (app.status === "flagged") {
        list.push({
          id: `notif-app-${app.id}-flagged`,
          source: "application",
          kind: "flagged",
          title: `Flagged na Dokumento: ${app.trackingNumber}`,
          message: `May mga dokumentong kailangang palitan o muling i-upload ni ${app.applicantName || "Aplikante"}. Na-update noong ${formatRealDate(flagDate)}.`,
          timestamp: flagDate || "",
          badge: "Flagged",
          trackingNumber: app.trackingNumber,
          applicationId: app.id,
        });
      }
    }

    // 2. Planning proposals notices (with real database timestamps)
    for (const p of planningProposals) {
      const planDate = p.updatedAt || p.createdAt || p.submittedAt;

      // Newly submitted proposal -> MPDC needs to assign reviewer
      if (p.status === "submitted") {
        list.push({
          id: `notif-plan-${p.id}-submitted`,
          source: "planning",
          kind: "planning",
          title: `Bagong Panukala: "${p.title}"`,
          message: `Isinumite noong ${formatRealDate(planDate)} ng ${p.department || "Barangay"}. Naghihintay ng MPDC review assignment.`,
          timestamp: planDate || "",
          badge: "Planning",
          proposalId: p.id,
        });
      }

      // Recommended -> MPDC approval
      if (p.status === "recommended") {
        list.push({
          id: `notif-plan-${p.id}-recommended`,
          source: "planning",
          kind: "approved",
          title: `Handa sa Pag-apruba: "${p.title}"`,
          message: `Inirekomenda ng reviewer noong ${formatRealDate(planDate)}. Handa na para sa pinal na pag-apruba ng MPDC Coordinator.`,
          timestamp: planDate || "",
          badge: "For Approval",
          proposalId: p.id,
        });
      }

      // Resubmitted after return
      if (p.status === "submitted" && (p.approvals || []).some((a) => a.action === "returned")) {
        list.push({
          id: `notif-plan-${p.id}-resubmitted`,
          source: "planning",
          kind: "flagged",
          title: `Muling Isinumite: "${p.title}"`,
          message: `Binago at muling isinumite noong ${formatRealDate(planDate)} pagkatapos ibalik. Handa para sa re-review.`,
          timestamp: planDate || "",
          badge: "Resubmitted",
          proposalId: p.id,
        });
      }
    }

    // Sort by timestamp newest first
    return list.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  }, [applications, planningProposals]);

  // Helper to check if a notice is read
  const isNoticeRead = (n: MpdcNotification) => {
    return (
      readNotifIds.includes(n.id) ||
      (n.applicationId && readNotifIds.includes(`app-${n.applicationId}`)) ||
      (n.proposalId && readNotifIds.includes(`plan-${n.proposalId}`))
    );
  };

  // Active (not dismissed)
  const activeNotices = useMemo(() => {
    return allNotices.filter((n) => !dismissedNotifIds.includes(n.id));
  }, [allNotices, dismissedNotifIds]);

  // UNREAD COUNT: Unread notices decrement immediately when read/clicked
  const unreadCount = useMemo(() => {
    return activeNotices.filter((n) => !isNoticeRead(n)).length;
  }, [activeNotices, readNotifIds]);

  // Mark single notice as read (decrements badge immediately)
  const markNoticeAsRead = (id: string, relatedKey?: string) => {
    setReadNotifIds((prev) => {
      const additions = [id];
      if (relatedKey) additions.push(relatedKey);
      const next = [...new Set([...prev, ...additions])].slice(-200);
      try {
        localStorage.setItem("infatrack_mpdc_read_notices", JSON.stringify(next));
        window.dispatchEvent(new Event("infatrack_mpdc_notif_change"));
      } catch {}
      return next;
    });
  };

  // Mark all active notices as read (resets badge to 0)
  const markAllNoticesAsRead = () => {
    setReadNotifIds((prev) => {
      const allIds = activeNotices.map((n) => n.id);
      const next = [...new Set([...prev, ...allIds])].slice(-200);
      try {
        localStorage.setItem("infatrack_mpdc_read_notices", JSON.stringify(next));
        window.dispatchEvent(new Event("infatrack_mpdc_notif_change"));
      } catch {}
      return next;
    });
  };

  const dismissNotice = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // Also mark as read when dismissed
    markNoticeAsRead(id);
    setDismissedNotifIds((prev) => {
      const next = [...new Set([...prev, id])].slice(-150);
      try {
        localStorage.setItem("infatrack_mpdc_dismissed_notices_v2", JSON.stringify(next));
        window.dispatchEvent(new Event("infatrack_mpdc_notif_change"));
      } catch {}
      return next;
    });
  };

  const dismissAllNotices = () => {
    markAllNoticesAsRead();
    setDismissedNotifIds((prev) => {
      const next = [...new Set([...prev, ...activeNotices.map((n) => n.id)])].slice(-150);
      try {
        localStorage.setItem("infatrack_mpdc_dismissed_notices_v2", JSON.stringify(next));
        window.dispatchEvent(new Event("infatrack_mpdc_notif_change"));
      } catch {}
      return next;
    });
  };

  const handleNoticeClick = (notice: MpdcNotification) => {
    // 1. Mark as read immediately to decrement the badge count
    markNoticeAsRead(notice.id, notice.applicationId ? `app-${notice.applicationId}` : undefined);
    setNotifDrawerOpen(false);

    // 2. Open the modal/page to read the actual item
    if (notice.source === "application") {
      const found = applications.find(
        (a) => a.id === notice.applicationId || (notice.trackingNumber && a.trackingNumber === notice.trackingNumber)
      );
      if (found) {
        openAppModal(found, notice.kind === "inspection" ? "map" : "checklist");
      }
    } else if (notice.source === "planning") {
      if (onNavigate) {
        onNavigate("planning");
      }
    }
  };

  const displayedNotices = useMemo(() => {
    if (notifFilter === "apps") return activeNotices.filter((n) => n.source === "application");
    if (notifFilter === "planning") return activeNotices.filter((n) => n.source === "planning");
    return activeNotices;
  }, [activeNotices, notifFilter]);

  const appNoticesCount = activeNotices.filter((n) => n.source === "application").length;
  const planningNoticesCount = activeNotices.filter((n) => n.source === "planning").length;
  const [previewMedia, setPreviewMedia] = useState<{
    url: string;
    title: string;
    fileName?: string;
    isPdf?: boolean;
    isImg?: boolean;
    size?: number;
    reqId?: string;
    reqTitle?: string;
  } | null>(null);

  // Reject Document & Reject Application Modal States
  const [rejectDocModal, setRejectDocModal] = useState<{
    reqId: string;
    reqTitle: string;
    fileName: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [isRejectAppModalOpen, setIsRejectAppModalOpen] = useState(false);
  const [appRejectReason, setAppRejectReason] = useState("");

  // Confirmation Modal State for Approving Document(s)
  const [approveConfirmModal, setApproveConfirmModal] = useState<{
    type: "single" | "all";
    reqId?: string;
    reqTitle?: string;
    fileName?: string;
  } | null>(null);

  // Close preview modal when Escape key is pressed
  useEffect(() => {
    if (!previewMedia) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewMedia(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewMedia]);

  // Citizen's Charter Workflow State Machine
  const appStatus = (selectedApp?.status || "").toLowerCase();
  const isStep1 =
    appStatus === "in_review" ||
    appStatus === "flagged" ||
    appStatus === "pending_verification" ||
    appStatus === "submitted" ||
    appStatus === "pending" ||
    appStatus === "";
  const isStep2 =
    appStatus === "ocular_inspection" ||
    appStatus === "for_ocular_inspection" ||
    appStatus === "inspection";
  const isForPayment = appStatus === "for_payment" || appStatus === "approved_for_payment";
  const isForEngineering =
    appStatus === "for_engineering_inspection" ||
    (Boolean(selectedApp?.payment?.orNumber) && selectedApp?.payment?.status === "paid");
  const isApproved = appStatus === "approved" || appStatus === "completed";
  const isReturned = appStatus === "returned";
  const isDenied = appStatus === "rejected" || appStatus === "denied";

  const loadApplications = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const list = await fetchCitizenApplications();
      cachedCitizenApps = list;
      hasFetchedOnce = true;
      setApplications(list);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      console.warn("[ZoningPermits] Failed to fetch applications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadApplications(!hasFetchedOnce);
    const interval = window.setInterval(() => {
      void loadApplications(false);
    }, 6000);

    // Real-time WebSocket connection for instant updates
    let socket: any = null;
    try {
      socket = io(backendUrl(""), {
        transports: ["websocket", "polling"],
        withCredentials: true,
      });

      const handleIncomingUpdate = (payload: any) => {
        if (!payload) return;
        const appPayload = payload.application;
        const tracking = payload.trackingNumber;
        const targetId = payload.id;

        setApplications((prev) =>
          prev.map((a) => {
            if ((targetId && a.id === targetId) || (tracking && a.trackingNumber === tracking)) {
              return appPayload || { ...a, notes: payload.notes ?? a.notes, status: payload.status ?? a.status };
            }
            return a;
          })
        );

        setSelectedApp((curr) => {
          if (curr && ((targetId && curr.id === targetId) || (tracking && curr.trackingNumber === tracking))) {
            const updated = appPayload || {
              ...curr,
              notes: payload.notes ?? curr.notes,
              remarks: payload.remarks ?? curr.remarks,
              status: payload.status ?? curr.status,
            };
            if (payload.notes) setReviewerNotes(payload.notes);
            return updated;
          }
          return curr;
        });
      };

      const handleIncomingRemark = (payload: any) => {
        if (!payload || !payload.remark) return;
        const tracking = (payload.trackingNumber || "").trim().toUpperCase();
        const remark = payload.remark;

        setSelectedApp((curr) => {
          if (!curr || (curr.trackingNumber || "").trim().toUpperCase() !== tracking) return curr;
          const remarks = Array.isArray(curr.remarks) ? curr.remarks : [];
          if (remarks.some((r: any) => r.id === remark.id)) return curr;
          return {
            ...curr,
            remarks: [...remarks, remark],
          };
        });

        setApplications((prev) =>
          prev.map((a) => {
            if ((a.trackingNumber || "").trim().toUpperCase() !== tracking) return a;
            const remarks = Array.isArray(a.remarks) ? a.remarks : [];
            if (remarks.some((r: any) => r.id === remark.id)) return a;
            return {
              ...a,
              remarks: [...remarks, remark],
            };
          })
        );
      };

      socket.on("planning:application_updated", handleIncomingUpdate);
      socket.on("citizen:application_notes", handleIncomingUpdate);
      socket.on("planning:application_remark", handleIncomingRemark);
    } catch {
      /* ignore realtime fallback */
    }

    return () => {
      window.clearInterval(interval);
      if (socket) socket.disconnect();
    };
  }, []);

  const openAppModal = (app: any, preferredTab?: "checklist" | "map") => {
    setSelectedApp(app);
    // Mark any notices for this application as read so the badge decreases
    if (app && app.id) {
      markNoticeAsRead(`app-${app.id}`);
      const matching = allNotices.filter(n => n.applicationId === app.id || (app.trackingNumber && n.trackingNumber === app.trackingNumber));
      matching.forEach(m => markNoticeAsRead(m.id));
    }
    setReviewerNotes(app.notes || "");
    if (preferredTab) {
      setModalTab(preferredTab);
    } else {
      const st = (app.status || "").toLowerCase();
      const isOcular =
        st === "ocular_inspection" ||
        st === "for_ocular_inspection" ||
        st === "inspection";
      setModalTab(isOcular ? "map" : "checklist");
    }
  };

  const handleUpdateStatus = async (appId: string, nextStatus: string) => {
    setUpdating(true);
    try {
      const res = await patchCitizenApplication(appId, {
        status: nextStatus,
        notes: reviewerNotes.trim() || undefined,
      });
      if (res && res.application) {
        setApplications((prev) =>
          prev.map((a) => (a.id === appId ? res.application : a))
        );
        setSelectedApp(res.application);
        if (nextStatus === "ocular_inspection" || nextStatus === "for_ocular_inspection") {
          setModalTab("map");
        }
        let notifMsg = `Aplikasyon (${res.application.trackingNumber}) ay matagumpay na nai-set sa "${nextStatus}"`;
        if (nextStatus === "ocular_inspection") {
          notifMsg = `Naipasa na sa Hakbang 2: 1-Araw na Ocular Inspection ang aplikasyon (${res.application.trackingNumber})!`;
        } else if (nextStatus === "for_payment") {
          notifMsg = `Zoning Approved! Nai-isyu na ang Order of Payment para kay ${res.application.trackingNumber}. Ipakikita ito ng aplikante sa Treasury Office upang magbayad.`;
        } else if (nextStatus === "flagged") {
          notifMsg = `Aplikasyon (${res.application.trackingNumber}) ay nai-set bilang "Flagged" (May kailangang palitang dokumento).`;
        } else if (nextStatus === "approved") {
          notifMsg = `Matagumpay na naaprubahan ang Permiso para sa ${res.application.trackingNumber}!`;
        } else if (nextStatus === "rejected") {
          notifMsg = `Aplikasyon (${res.application.trackingNumber}) ay opisyal nang TINANGGIHAN (Rejected).`;
        }
        setNotification(notifMsg);
        setTimeout(() => setNotification(null), 5000);
      }
    } catch (err: any) {
      alert("Hindi ma-update ang status: " + (err?.message || "Error"));
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenRejectDocModal = (reqId: string, reqTitle: string, fileName: string) => {
    const existingReason = selectedApp?.rejectedDocs?.[reqId]?.reason || "";
    setRejectReason(existingReason || "Malabo o hindi mabasa ang kopya ng dokumento");
    setRejectDocModal({ reqId, reqTitle, fileName });
  };

  const handleConfirmRejectDoc = async () => {
    if (!selectedApp || !rejectDocModal) return;
    const { reqId, reqTitle, fileName } = rejectDocModal;
    const reason = rejectReason.trim() || "Hindi wasto ang isinumiteng dokumento.";

    const foundReq = MANDATORY_DOC_REQUIREMENTS.find((m) => m.id === reqId || m.key === reqId);
    const reqKey = foundReq?.key || reqId;

    const updatedRejectedDocs = { ...(selectedApp.rejectedDocs || {}) };
    updatedRejectedDocs[reqId] = {
      reqId,
      reqKey,
      reqTitle,
      fileName,
      reason,
      rejectedAt: new Date().toISOString(),
      rejectedBy: session?.label || session?.role || "MPDC Officer",
    };

    const updatedApprovedDocs = { ...(selectedApp.approvedDocs || {}) };
    delete updatedApprovedDocs[reqId];

    const noteEntry = `❌ [HINDI WASTONG DOKUMENTO: ${reqTitle}] Dahilan: ${reason}`;
    const newNotes = reviewerNotes ? `${reviewerNotes.trim()}\n${noteEntry}` : noteEntry;
    setReviewerNotes(newNotes);

    const nextStatus = "flagged";

    setUpdating(true);
    try {
      const res = await patchCitizenApplication(selectedApp.id, {
        status: nextStatus,
        rejectedDocs: updatedRejectedDocs,
        approvedDocs: updatedApprovedDocs,
        notes: newNotes,
      });
      if (res && res.application) {
        setApplications((prev) =>
          prev.map((a) => (a.id === selectedApp.id ? res.application : a))
        );
        setSelectedApp(res.application);
        setNotification(
          `Na-reject ang dokumentong "${reqTitle}" (Status: Flagged para sa re-upload).`
        );
        setTimeout(() => setNotification(null), 5000);
        setRejectDocModal(null);
        setRejectReason("");
      }
    } catch (err: any) {
      alert("Hindi ma-save ang rejection: " + (err?.message || "Error"));
    } finally {
      setUpdating(false);
    }
  };

  const handleUndoRejectDoc = async (reqId: string, reqTitle: string) => {
    if (!selectedApp) return;
    const updatedRejectedDocs = { ...(selectedApp.rejectedDocs || {}) };
    delete updatedRejectedDocs[reqId];

    const hasNoMoreRejected = Object.keys(updatedRejectedDocs).length === 0;
    const nextStatus =
      hasNoMoreRejected && selectedApp.status === "flagged"
        ? "in_review"
        : selectedApp.status;

    setUpdating(true);
    try {
      const res = await patchCitizenApplication(selectedApp.id, {
        status: nextStatus,
        rejectedDocs: updatedRejectedDocs,
      });
      if (res && res.application) {
        setApplications((prev) =>
          prev.map((a) => (a.id === selectedApp.id ? res.application : a))
        );
        setSelectedApp(res.application);
        setNotification(`Na-bawi ang pag-reject sa "${reqTitle}".`);
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (err: any) {
      alert("Hindi ma-update: " + (err?.message || "Error"));
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenApproveSingleModal = (reqId: string, reqTitle: string, fileName?: string) => {
    setApproveConfirmModal({
      type: "single",
      reqId,
      reqTitle,
      fileName,
    });
  };

  const handleOpenApproveAllModal = () => {
    setApproveConfirmModal({
      type: "all",
    });
  };

  const handleExecuteApprove = async () => {
    if (!selectedApp || !approveConfirmModal) return;

    if (approveConfirmModal.type === "all") {
      setApproveConfirmModal(null);
      await executeApproveAllDocs();
    } else if (approveConfirmModal.reqId) {
      const { reqId, reqTitle } = approveConfirmModal;
      setApproveConfirmModal(null);
      await executeApproveSingleDoc(reqId, reqTitle || "");
    }
  };

  const executeApproveSingleDoc = async (reqId: string, reqTitle: string) => {
    if (!selectedApp) return;
    const currentApproved = { ...(selectedApp.approvedDocs || {}) };
    const currentRejected = { ...(selectedApp.rejectedDocs || {}) };

    currentApproved[reqId] = {
      approvedAt: new Date().toISOString(),
      approvedBy: session?.label || session?.role || "Admin Aide / IT Officer",
      title: reqTitle,
    };
    delete currentRejected[reqId];

    const totalApproved = MANDATORY_DOC_REQUIREMENTS.filter((r) => Boolean(currentApproved[r.id])).length;
    const isNowAllApproved = totalApproved === MANDATORY_DOC_REQUIREMENTS.length;

    const patchPayload: any = {
      approvedDocs: currentApproved,
      rejectedDocs: currentRejected,
    };
    if (selectedApp.status === "flagged" && Object.keys(currentRejected).length === 0) {
      patchPayload.status = "in_review";
    }

    setUpdating(true);
    try {
      const res = await patchCitizenApplication(selectedApp.id, patchPayload);
      if (res && res.application) {
        setApplications((prev) =>
          prev.map((a) => (a.id === selectedApp.id ? res.application : a))
        );
        setSelectedApp(res.application);
      } else {
        setSelectedApp((prev: any) => ({
          ...prev,
          approvedDocs: currentApproved,
          rejectedDocs: currentRejected,
          status: patchPayload.status || prev.status,
        }));
      }
      if (isNowAllApproved) {
        setNotification("Lahat ng 6/6 na dokumento ay opisyal nang na-apruba! Lumitaw na ang Hakbang 2 (Ocular Inspection).");
      } else {
        setNotification(`Na-apruba ang dokumentong "${reqTitle}" (${totalApproved}/6). Pinal na ito at hindi na mababago.`);
      }
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      alert("Hindi ma-update ang approval: " + (err?.message || "Error"));
    } finally {
      setUpdating(false);
    }
  };

  const executeApproveAllDocs = async () => {
    if (!selectedApp) return;
    const currentApproved: Record<string, any> = { ...(selectedApp.approvedDocs || {}) };
    const currentRejected = { ...(selectedApp.rejectedDocs || {}) };

    MANDATORY_DOC_REQUIREMENTS.forEach((req) => {
      currentApproved[req.id] = {
        approvedAt: new Date().toISOString(),
        approvedBy: session?.label || session?.role || "Admin Aide / IT Officer",
        title: req.title,
      };
      delete currentRejected[req.id];
    });

    const patchPayload: any = {
      approvedDocs: currentApproved,
      rejectedDocs: currentRejected,
    };
    if (selectedApp.status === "flagged") {
      patchPayload.status = "in_review";
    }

    setUpdating(true);
    try {
      const res = await patchCitizenApplication(selectedApp.id, patchPayload);
      if (res && res.application) {
        setApplications((prev) =>
          prev.map((a) => (a.id === selectedApp.id ? res.application : a))
        );
        setSelectedApp(res.application);
      } else {
        setSelectedApp((prev: any) => ({
          ...prev,
          approvedDocs: currentApproved,
          rejectedDocs: currentRejected,
          status: patchPayload.status || prev.status,
        }));
      }
      setNotification("Lahat ng 6/6 na dokumento ay opisyal nang na-apruba (Pinal)! Lumitaw na ang Hakbang 2.");
      setTimeout(() => setNotification(null), 5000);
    } catch (err: any) {
      alert("Hindi ma-apruba ang mga dokumento: " + (err?.message || "Error"));
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenRejectAppModal = () => {
    const flaggedList = Object.entries(selectedApp?.rejectedDocs || {})
      .map(([_, v]: any) => `${v.reqTitle}: ${v.reason}`)
      .join("; ");
    const defaultReason = flaggedList
      ? `Hindi wasto ang mga sumusunod na documentary requirements: ${flaggedList}`
      : "Hindi nakapasa ang isinumiteng mga documentary requirements ayon sa pagsusuri ng MPDC.";
    setAppRejectReason(defaultReason);
    setIsRejectAppModalOpen(true);
  };

  const handleConfirmRejectApp = async () => {
    if (!selectedApp) return;
    const reason = appRejectReason.trim() || "Hindi wasto ang mga documentary requirements.";
    const noteEntry = `❌ [TINANGGIHAN ANG APLIKASYON - HINDI WASTONG MGA DOKUMENTO] ${reason}`;
    const newNotes = reviewerNotes ? `${reviewerNotes.trim()}\n${noteEntry}` : noteEntry;
    setReviewerNotes(newNotes);

    setUpdating(true);
    try {
      const res = await patchCitizenApplication(selectedApp.id, {
        status: "rejected",
        notes: newNotes,
      });
      if (res && res.application) {
        setApplications((prev) =>
          prev.map((a) => (a.id === selectedApp.id ? res.application : a))
        );
        setSelectedApp(res.application);
        setNotification(
          `Aplikasyon (${res.application.trackingNumber}) ay opisyal nang TINANGGIHAN (Disapproved).`
        );
        setTimeout(() => setNotification(null), 5000);
        setIsRejectAppModalOpen(false);
        setAppRejectReason("");
      }
    } catch (err: any) {
      alert("Hindi ma-reject ang aplikasyon: " + (err?.message || "Error"));
    } finally {
      setUpdating(false);
    }
  };

  const handleEndorseInspectionFromMap = async (appId: string, notes: string) => {
    setUpdating(true);
    try {
      const res = await patchCitizenApplication(appId, {
        status: "ocular_inspection",
        notes: notes.trim() || reviewerNotes.trim() || undefined,
      });
      if (res && res.application) {
        setApplications((prev) =>
          prev.map((a) => (a.id === appId ? res.application : a))
        );
        setSelectedApp(res.application);
        setModalTab("map");
        setReviewerNotes(notes || res.application.notes || "");
        setNotification(
          `Matagumpay na inindorso ang aplikasyon (${res.application.trackingNumber}) para sa 1-Araw na Ocular Inspection!`
        );
        setTimeout(() => setNotification(null), 5000);
      }
    } catch (err: any) {
      alert("Hindi ma-endorse para sa ocular inspection: " + (err?.message || "Error"));
    } finally {
      setUpdating(false);
    }
  };

  const handleSendNotes = async (notesText?: string) => {
    const textToSend = (notesText ?? reviewerNotes).trim();
    if (!textToSend || !selectedApp) return;

    // 1. Instant optimistic update for zero latency (real-time UI response)
    const optimisticRemark = {
      id: `rem-instant-${Date.now()}`,
      fromOffice: selectedApp.status === "ocular_inspection" || selectedApp.status === "engineering" ? "Engineering" : "MPDC",
      author: selectedApp.status === "ocular_inspection" ? "Engr. Mario S. Baldovino (Municipal Engineer)" : "Edward B. Romulo, EnP. (Zoning Officer)",
      message: textToSend,
      createdAt: new Date().toISOString(),
      requiresAction: false,
    };
    const optimisticallyUpdated = {
      ...selectedApp,
      notes: textToSend,
      remarks: [...(selectedApp.remarks || []), optimisticRemark],
      updatedAt: new Date().toISOString(),
    };
    setSelectedApp(optimisticallyUpdated);
    setApplications((prev) =>
      prev.map((a) => (a.id === selectedApp.id ? optimisticallyUpdated : a))
    );
    setNotification(
      `✓ Naipadala agad ang opisyal na notes para sa ${selectedApp.trackingNumber}!`
    );
    setTimeout(() => setNotification(null), 3000);

    // 2. Dispatch to backend and PostgreSQL
    try {
      const res = await patchCitizenApplication(selectedApp.id, {
        notes: textToSend,
      });
      if (res && res.application) {
        setApplications((prev) =>
          prev.map((a) => (a.id === selectedApp.id ? res.application : a))
        );
        setSelectedApp(res.application);
      }
    } catch (err: any) {
      console.warn("[ZoningPermits] Failed to sync notes:", err?.message || err);
    }
  };

  const attachmentHref = (url: string) => {
    if (!url) return "#";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
      return url;
    }
    return backendUrl(url.startsWith("/") ? url : `/${url}`);
  };

  const isImageFile = (url: string, originalName?: string) => {
    if (url?.startsWith("data:image/")) return true;
    const name = (originalName || url || "").toLowerCase();
    return /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(name);
  };

  const isPdfFile = (url: string, originalName?: string) => {
    if (url?.startsWith("data:application/pdf")) return true;
    const name = (originalName || url || "").toLowerCase();
    return /\.pdf($|\?)/i.test(name) || name.includes("application/pdf");
  };

  const openDocViewer = (url: string, fileName?: string, reqTitle?: string, size?: number, reqId?: string) => {
    const href = attachmentHref(url);
    const isPdf = isPdfFile(href, fileName);
    const isImg = isImageFile(href, fileName);
    const cleanFileName = fileName || "Dokumento";
    setPreviewMedia({
      url: href,
      title: reqTitle ? `${reqTitle} — ${cleanFileName}` : cleanFileName,
      fileName: cleanFileName,
      isPdf,
      isImg,
      size,
      reqId,
      reqTitle,
    });
  };

  const filteredApps = applications.filter((app) => {
    if (filterBarangay && app.applicant?.barangay !== filterBarangay) return false;
    if (filterStatus && app.status !== filterStatus) return false;
    if (filterType && app.property?.proposedBuildingType !== filterType) return false;
    if (filterDocs) {
      const { isComplete } = getCompletenessSummary(app.uploads);
      if (filterDocs === "complete" && !isComplete) return false;
      if (filterDocs === "incomplete" && isComplete) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchRef = app.trackingNumber?.toLowerCase().includes(q);
      const matchName = app.applicant?.fullName?.toLowerCase().includes(q);
      const matchPhone = app.applicant?.contactPhone?.toLowerCase().includes(q);
      const matchTd = app.property?.taxDecNo?.toLowerCase().includes(q);
      if (!matchRef && !matchName && !matchPhone && !matchTd) return false;
    }
    return true;
  });

  const totalCount = applications.length;
  const pendingCount = applications.filter(
    (a) => a.status === "submitted" || a.status === "pending"
  ).length;
  const reviewCount = applications.filter(
    (a) => a.status === "in_review" || a.status === "ocular_inspection"
  ).length;
  const approvedCount = applications.filter((a) => a.status === "approved").length;

  const selectedCompleteness = selectedApp ? getCompletenessSummary(selectedApp.uploads) : null;
  const supplementaryUploads = selectedApp ? getSupplementaryUploads(selectedApp.uploads) : [];
  const hasRejectedDocs = Boolean(
    selectedApp?.rejectedDocs && Object.keys(selectedApp.rejectedDocs).length > 0
  );
  const approvedDocsCount = selectedApp?.approvedDocs
    ? MANDATORY_DOC_REQUIREMENTS.filter((req) => Boolean(selectedApp.approvedDocs[req.id])).length
    : 0;
  const allApproved =
    approvedDocsCount === MANDATORY_DOC_REQUIREMENTS.length && !hasRejectedDocs;
  const canShowStep2 =
    allApproved || isStep2 || isApproved || isForPayment || isForEngineering;
  const isDocsCompleteAndValid =
    Boolean(selectedCompleteness?.isComplete) && !hasRejectedDocs;

  return (
    <div className="zp-page">
      {/* Top Header Bar */}
      <header className="zp-header">
        <div className="zp-header-top">
          <div className="zp-header-left">
            {/* Back button only for Engineer or non-MPDC roles */}
            {session?.role !== "MPDC" && onBack && (
              <button
                type="button"
                className="zp-back-btn"
                onClick={onBack}
                title="Bumalik sa 3D Cesium GIS Globe Map"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                3D Mapa
              </button>
            )}

            <img src="/logo.png" alt="Luisiana Seal" className="zp-brand-logo" />

            <div className="zp-brand-wrap">
              <div className="zp-brand-title-row">
                <span className="zp-brand-pill">MPDC</span>
                <h1 className="zp-title">
                  Talaan ng mga Natanggap na Aplikasyon
                </h1>
              </div>
              <div className="zp-sub">
                Municipal Planning &amp; Development Office · Bayan ng Luisiana, Laguna
              </div>
            </div>
          </div>

          <div className="zp-header-right">
            <div className="zp-header-meta">
              <div className="zp-service-pill">
                <span className="zp-service-tag">Citizen&apos;s Charter Service #2</span>
                <span className="zp-service-sla">Hakbang 1: Paunang Pagsusuri (10 Mins SLA) · ₱0.00 Libre</span>
              </div>
              <div
                className={`zp-live-indicator${lastSyncedAt ? " active" : ""}`}
                title="Real-time multi-user PostgreSQL sync"
              >
                <span className="zp-live-dot" />
                <span>
                  {lastSyncedAt ? `Live · ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Syncing…"}
                </span>
              </div>
            </div>

            <div className="zp-header-controls">
              {/* MPDC Notification Bell */}
              <button
                type="button"
                className={`zp-notif-btn${unreadCount > 0 ? " has-badge" : ""}`}
                onClick={() => setNotifDrawerOpen((prev) => !prev)}
                title={`Mga Notipikasyon para sa MPDC (${unreadCount} bago)`}
                aria-label="Mga Notipikasyon"
              >
                <IconBell size={17} />
                {unreadCount > 0 && (
                  <span className="zp-notif-badge">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {session && (
                <div className="zp-user-badge" title={`Naka-login: ${session.label || session.role}`}>
                  <span className="zp-user-avatar">
                    <IconUser size={15} />
                  </span>
                  <div className="zp-user-meta">
                    <span className="zp-user-role">{session.label || session.role}</span>
                    <span className="zp-user-dept">IT Officer / Admin Aide</span>
                  </div>
                </div>
              )}

              {onLogout && (
                <button
                  type="button"
                  className="zp-logout-btn"
                  onClick={onLogout}
                  title="Mag-sign out sa sistema"
                >
                  Sign Out
                </button>
              )}
              <ThemeToggle iconOnly />
            </div>
          </div>
        </div>

        {/* Dedicated Navigation Bar */}
        {onNavigate && (
          <nav className="zp-nav-bar" aria-label="Pangunahing Navigasyon">
            <div className="zp-nav-pill-group">
              <button
                type="button"
                className="zp-nav-pill-btn active"
                title="Kasalukuyang view: Talaan ng mga Aplikasyon"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
                Talaan ng Aplikasyon
              </button>
              <button
                type="button"
                className="zp-nav-pill-btn"
                onClick={() => onNavigate("planning")}
                title="Pumunta sa Municipal Planning & Development Proposals"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                Planning
              </button>
              <button
                type="button"
                className="zp-nav-pill-btn"
                onClick={() => onNavigate("documents")}
                title="Pumunta sa Document Archive"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Documents
              </button>
              <button
                type="button"
                className="zp-nav-pill-btn"
                onClick={() => onNavigate("analytics")}
                title="Pumunta sa Siting & Zoning Analytics"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                Analytics
              </button>
              <button
                type="button"
                className="zp-nav-pill-btn"
                onClick={() => onNavigate("audit")}
                title="Pumunta sa Activity Log & Audit Trail"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Activity Log
              </button>
              <button
                type="button"
                className="zp-nav-pill-btn zp-nav-pill-map"
                onClick={() => onNavigate("app")}
                title="Buksan ang 3D Cesium GIS Mapa at Situation Dashboard"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                3D Mapa
              </button>
            </div>
          </nav>
        )}
      </header>

      {notification && (
        <div className="zp-notification" role="status">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{notification}</span>
          <button type="button" onClick={() => setNotification(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Main Container */}
      <main className="zp-main">
        {/* KPI Metrics */}
        <section className="zp-kpi-grid">
          <div className="zp-kpi-card">
            <div className="zp-kpi-val">{totalCount}</div>
            <div className="zp-kpi-lbl">Kabuuang Aplikasyon</div>
            <div className="zp-kpi-desc">Lahat ng natanggap sa talaan ng MPDC</div>
          </div>
          <div className="zp-kpi-card">
            <div className="zp-kpi-val zp-kpi--warn">{pendingCount}</div>
            <div className="zp-kpi-lbl">Bagong Tanggap / For Verification</div>
            <div className="zp-kpi-desc">Admin Aide / IT Officer completeness check (10 Mins)</div>
          </div>
          <div className="zp-kpi-card">
            <div className="zp-kpi-val zp-kpi--info">{reviewCount}</div>
            <div className="zp-kpi-lbl">In Review / Inspection</div>
            <div className="zp-kpi-desc">Zoning Officer evaluation &amp; site visit (1 Day)</div>
          </div>
          <div className="zp-kpi-card">
            <div className="zp-kpi-val zp-kpi--safe">{approvedCount}</div>
            <div className="zp-kpi-lbl">Approved / Ready for Issuance</div>
            <div className="zp-kpi-desc">Nalagdaan na Zoning Certificate</div>
          </div>
        </section>

        {/* Toolbar: Search and Filters */}
        <section className="zp-toolbar">
          <div className="zp-search-box">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="zp-input"
              placeholder="Hanapin ayon sa Tracking Reference, Pangalan, o Cellphone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="zp-filters">
            <select
              className="zp-select"
              value={filterBarangay}
              onChange={(e) => setFilterBarangay(e.target.value)}
            >
              <option value="">Lahat ng Barangay (23)</option>
              {BARANGAY_LIST.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <select
              className="zp-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">Lahat ng Uri ng Gusali</option>
              <option value="Residential (Pabahay)">Residential (Pabahay)</option>
              <option value="Commercial (Tindahan / Negosyo)">Commercial (Tindahan / Negosyo)</option>
              <option value="Industrial / Warehouse (Bodega)">Industrial / Warehouse (Bodega)</option>
              <option value="Agricultural (Poultry / Farm Structure)">
                Agricultural (Poultry / Farm Structure)
              </option>
              <option value="Institutional (Simbahan / Paaralan)">Institutional (Simbahan / Paaralan)</option>
            </select>

            <select
              className="zp-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Lahat ng Katayuan (Status)</option>
              <option value="submitted">Bago / Submitted</option>
              <option value="in_review">In Review</option>
              <option value="flagged">Flagged / May Puna sa Dokumento</option>
              <option value="ocular_inspection">Ocular Inspection</option>
              <option value="for_payment">Zoning Approved (For Treasury Payment)</option>
              <option value="for_engineering_inspection">Para sa Engineering (Bayad Na)</option>
              <option value="approved">Approved</option>
              <option value="rejected">Tinanggihan / Rejected</option>
              <option value="returned">Returned / Kulang</option>
            </select>

            <select
              className="zp-select zp-select--docs"
              value={filterDocs}
              onChange={(e) => setFilterDocs(e.target.value as any)}
              title="I-filter ayon sa pagkakumpleto ng mga documentary requirements"
            >
              <option value="">Lahat ng Dokumento</option>
              <option value="complete">Kumpleto (6/6 Files)</option>
              <option value="incomplete">May Kulang (&lt;6 Files)</option>
            </select>

            <button type="button" className="zp-btn-refresh" onClick={() => loadApplications(true)}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              I-refresh
            </button>
          </div>
        </section>

        {/* Applications Registry Table */}
        <section className="zp-table-container">
          {loading ? (
            <div className="zp-empty">
              <div className="zp-spinner" />
              <p>Kinukuha ang talaan ng mga natanggap na aplikasyon…</p>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="zp-empty">
              <svg
                width="42"
                height="42"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#64748b"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <h3>Walang Nakitang Aplikasyon</h3>
              <p>Walang aplikasyon na tumutugma sa kasalukuyang search o filter.</p>
            </div>
          ) : (
            <table className="zp-table">
              <thead>
                <tr>
                  <th>Tracking Number</th>
                  <th>Aplikante</th>
                  <th>Barangay &amp; Lokasyon</th>
                  <th>Uri ng Gusali</th>
                  <th>Mga Dokumento (6 Requirements)</th>
                  <th>Petsa</th>
                  <th>Status</th>
                  <th>Aksyon</th>
                </tr>
              </thead>
              <tbody>
                {filteredApps.map((app) => {
                  const completeness = getCompletenessSummary(app.uploads);
                  return (
                    <tr
                      key={app.id || app.trackingNumber}
                      className="zp-table-row-clickable"
                      onClick={() => openAppModal(app)}
                      title="I-click upang suriin ang aplikasyon at mga kalakip na dokumento"
                    >
                      <td className="zp-col-track">
                        <strong className="zp-track-num">
                          {app.trackingNumber}
                        </strong>
                      </td>
                      <td className="zp-col-applicant">
                        <div className="zp-applicant-name">{app.applicant?.fullName || "—"}</div>
                        <div className="zp-applicant-sub">
                          {app.applicant?.contactPhone || app.applicant?.email || "—"}
                        </div>
                      </td>
                      <td className="zp-col-location">
                        <div className="zp-barangay-tag">{app.applicant?.barangay}</div>
                        <div className="zp-location-sub">
                          {app.property?.locationDescription || app.applicant?.address || "—"}
                        </div>
                      </td>
                      <td className="zp-col-type">
                        <span className="zp-building-type">
                          {app.property?.proposedBuildingType || "Residential"}
                        </span>
                      </td>
                      <td className="zp-col-docs">
                        <div
                          className={`zp-doc-badge ${
                            completeness.isComplete ? "is-complete" : "is-incomplete"
                          }`}
                          title={
                            completeness.isComplete
                              ? "Kumpleto ang lahat ng 6 na mandatory requirements"
                              : `May kulang: ${completeness.missing.join(", ")}`
                          }
                        >
                          {completeness.isComplete ? (
                            <IconCheck size={12} />
                          ) : (
                            <IconAlertTriangle size={12} />
                          )}
                          <span className="zp-doc-badge-count">
                            {completeness.completed}/6
                          </span>
                          <span className="zp-doc-badge-txt">
                            {completeness.isComplete ? "Kumpleto" : "May Kulang"}
                          </span>
                        </div>
                      </td>
                      <td className="zp-col-date">
                        <span className="zp-date">
                          {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : "—"}
                        </span>
                      </td>
                      <td className="zp-col-status">
                        <span className={`zp-status-pill ${app.status || "submitted"}`}>
                          {app.status === "approved"
                            ? "Approved"
                            : app.status === "for_engineering_inspection"
                            ? "Para sa Eng. Insp."
                            : app.status === "for_payment"
                            ? "For Payment"
                            : app.status === "ocular_inspection"
                            ? "Inspection"
                            : app.status === "in_review"
                            ? "In Review"
                            : app.status === "flagged"
                            ? "Flagged"
                            : app.status === "rejected"
                            ? "Rejected"
                            : app.status === "returned"
                            ? "Returned"
                            : "Submitted"}
                        </span>
                      </td>
                      <td className="zp-col-actions">
                        <div className="zp-actions-cell">
                          <button
                            type="button"
                            className="zp-review-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAppModal(app);
                            }}
                            title="Suriin ang aplikasyon ayon sa Citizen's Charter"
                          >
                            Suriin →
                          </button>
                          <button
                            type="button"
                            className="zp-map-quick-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAppModal(app, "map");
                            }}
                            title="Detail / Map View & Hazard Crosscheck bago mag-ocular inspection (Zoning Officer)"
                          >
                            <IconMapPin size={12} />
                            Mapa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>

      {/* Review & Issuance Modal */}
      {selectedApp && selectedCompleteness && (
        <div className="zp-modal-backdrop" onClick={() => setSelectedApp(null)}>
          <div
            className={`zp-modal ${modalTab === "map" ? "zp-modal--wide" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="zp-modal-head">
              <div className="zp-modal-head-info">
                <span className="zp-modal-tag">
                  {isStep2
                    ? "Hakbang 2: Pagsusuri ng Zoning Officer (1-Araw na Ocular Inspection & GIS Layers)"
                    : modalTab === "checklist"
                    ? isStep1
                      ? "Hakbang 1: Pagsusuri ng IT Officer / Admin Aide (Citizen's Charter)"
                      : "Hakbang 2: Pagsusuri ng Zoning Officer (1-Araw na Ocular Inspection)"
                    : "Hakbang 2: Detail / Map View & Hazard Crosscheck (Zoning Officer)"}
                </span>
                <h2 className="zp-modal-title">
                  <span className="zp-modal-title-track">
                    <span className="zp-modal-track-label">Tracking No:</span>{" "}
                    <span className="zp-gold-ref">{selectedApp.trackingNumber}</span>
                  </span>
                  <span className="zp-modal-brgy-pill">
                    Brgy. {selectedApp.applicant?.barangay || "—"}
                  </span>
                </h2>
              </div>
              <button
                type="button"
                className="zp-close-btn"
                onClick={() => setSelectedApp(null)}
                title="Isara"
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="zp-modal-tabs">
              <button
                type="button"
                className={`zp-modal-tab-btn ${modalTab === "checklist" ? "active" : ""}`}
                onClick={() => setModalTab("checklist")}
              >
                <IconFile size={15} />
                <span>Hakbang 1: Documentary Checklist (Admin Aide)</span>
                {isStep2 || isApproved ? (
                  <span className="zp-tab-badge complete">✓ Tapos na (6/6)</span>
                ) : (
                  <span
                    className={`zp-tab-badge ${
                      allApproved ? "complete" : "incomplete"
                    }`}
                  >
                    {approvedDocsCount}/6 Aprobado
                  </span>
                )}
              </button>

              {/* Step 2 Tab: only shows up once all 6 documents are approved, or if the app is already in Step 2 / beyond */}
              {canShowStep2 && (
                <button
                  type="button"
                  className={`zp-modal-tab-btn ${modalTab === "map" ? "active" : ""}`}
                  onClick={() => setModalTab("map")}
                >
                  <IconMapPin size={15} />
                  <span>Hakbang 2: Detail / Map View &amp; Hazard Layers (Zoning Officer)</span>
                  <span
                    className="zp-tab-badge-sla"
                    style={
                      isStep2
                        ? {
                            background: "#0284c7",
                            color: "#ffffff",
                            border: "1px solid #38bdf8",
                            fontWeight: 800,
                            padding: "3px 9px",
                            borderRadius: 4,
                          }
                        : undefined
                    }
                  >
                    {isStep2 ? "● AKTIBONG HAKBANG (1-Araw Ocular)" : isApproved ? "✓ Na-inspeksyon" : "1-Araw Ocular"}
                  </span>
                </button>
              )}
            </div>

            {modalTab === "checklist" ? (
              <div className="zp-modal-body">
                {/* Status & SLA Banner */}
                <div className="zp-status-banner">
                <div>
                  <div className="zp-status-banner-lbl">Kasalukuyang Katayuan:</div>
                  <strong className={`zp-status-pill ${selectedApp.status}`}>
                    {selectedApp.status?.toUpperCase()}
                  </strong>
                </div>
                <div className="zp-sla-info">
                  Turnaround: <strong>1 Day 12 Minutes SLA</strong> (Libre / ₱0.00)
                </div>
              </div>

              {/* Applicant & Property Details */}
              <div className="zp-detail-grid">
                <div className="zp-detail-item">
                  <label>Pangalan ng Aplikante</label>
                  <p>{selectedApp.applicant?.fullName || "—"}</p>
                </div>
                <div className="zp-detail-item">
                  <label>Contact Number (Cellphone)</label>
                  <p>{selectedApp.applicant?.contactPhone || "—"}</p>
                </div>
                <div className="zp-detail-item">
                  <label>Email Address</label>
                  <p>{selectedApp.applicant?.email || "—"}</p>
                </div>
                <div className="zp-detail-item">
                  <label>Barangay</label>
                  <p>{selectedApp.applicant?.barangay || "—"}</p>
                </div>
                <div className="zp-detail-item">
                  <label>Sona ng Lote (CLUP Zoning)</label>
                  <p>
                    {(() => {
                      const zone = getClupZone(selectedApp.applicant?.barangay);
                      const displayZone =
                        selectedApp.zoningClassification ||
                        selectedApp.lotDetails?.zoningClassification ||
                        zone.name;
                      return (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 9px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            background: zone.badgeBg,
                            color: zone.badgeColor,
                            border: `1px solid ${zone.borderColor}`,
                          }}
                        >
                          {displayZone}
                        </span>
                      );
                    })()}
                  </p>
                </div>
                <div className="zp-detail-item">
                  <label>Uri ng Ipanapanukalang Gusali</label>
                  <p>{selectedApp.property?.proposedBuildingType || "Residential"}</p>
                </div>
                <div className="zp-detail-item">
                  <label>Sukat ng Lupa / Floor Area</label>
                  <p>
                    {selectedApp.property?.lotAreaSqM
                      ? `${selectedApp.property.lotAreaSqM} sq.m.`
                      : "—"}
                  </p>
                </div>
                <div className="zp-detail-item">
                  <label>Tax Declaration / TCT No.</label>
                  <p>
                    TD: <strong>{selectedApp.property?.taxDecNo || "—"}</strong> | TCT:{" "}
                    <strong>{selectedApp.property?.tctNo || "—"}</strong>
                  </p>
                </div>
                <div className="zp-detail-item">
                  <label>Pagmamay-ari ng Lupa</label>
                  <p>
                    {selectedApp.property?.isRegisteredOwner
                      ? "Rehistradong May-ari"
                      : "May Consent / Deed of Sale"}
                  </p>
                </div>
                <div className="zp-detail-item full">
                  <label>Deskripsyon ng Lokasyon / Landmark</label>
                  <p>
                    {selectedApp.property?.locationDescription ||
                      selectedApp.applicant?.address ||
                      "—"}
                  </p>
                </div>
              </div>

              {/* Private Engineer Information if provided */}
              {selectedApp.privateEngineer && (
                <div
                  className="zp-detail-grid"
                  style={{
                    marginTop: 0,
                    background: "rgba(13, 115, 119, 0.08)",
                    padding: 14,
                    borderRadius: 10,
                    border: "1px solid rgba(13, 115, 119, 0.3)",
                  }}
                >
                  <div className="zp-detail-item">
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <IconEngineer size={15} />
                      Nakatalagang Pribadong Inhinyero / Arkitekto
                    </label>
                    <p>
                      <strong>{selectedApp.privateEngineer.fullName}</strong>
                    </p>
                  </div>
                  <div className="zp-detail-item">
                    <label>PRC License &amp; PTR No.</label>
                    <p>{selectedApp.privateEngineer.prcNo || "—"}</p>
                  </div>
                  <div className="zp-detail-item">
                    <label>Contact Number / Email ng Inhinyero</label>
                    <p>{selectedApp.privateEngineer.contact || "—"}</p>
                  </div>
                  <div className="zp-detail-item">
                    <label>Kontratista / Construction In-Charge</label>
                    <p>{selectedApp.privateEngineer.contractor || "—"}</p>
                  </div>
                </div>
              )}

              {/* Hakbang 1 / Hakbang 2 Completeness & Stage Banner */}
              <div className={`zp-step1-banner ${isStep2 ? "is-step2-active" : ""}`}>
                <div className="zp-step1-banner-header">
                  <div
                    className="zp-step1-badge"
                    style={isStep2 ? { background: "linear-gradient(135deg, #059669, #10b981)", color: "#fff" } : undefined}
                  >
                    <span>{isStep2 ? "HAKBANG 1: TAPOS NA ✓" : "HAKBANG 1"}</span>
                  </div>
                  <div className="zp-step1-info-text">
                    <h3 className="zp-step1-title">
                      {isStep2
                        ? "Tapos na ang Paunang Pagsusuri — Kasalukuyang nasa Hakbang 2 (Ocular Inspection)"
                        : "Paunang Pagsusuri at Completeness Check (IT Officer / Admin Aide)"}
                    </h3>
                    <p className="zp-step1-desc">
                      {isStep2
                        ? "Na-endorso na ng Admin Aide ang aplikasyon para sa 1-Araw na Ocular Inspection ng Zoning Officer matapos masuri ang 6 na kalakip na dokumento."
                        : "Ayon sa Citizen's Charter, suriin ang anim (6) na documentary requirements na isinumite ng aplikante sa unang hakbang (10 Mins SLA). I-click ang bawat kalakip upang masigurong malinaw at lehitimo ang kopya."}
                    </p>
                  </div>
                  <div
                    className={`zp-step1-score ${
                      isStep2 || allApproved ? "is-complete" : "is-incomplete"
                    }`}
                  >
                    <span className="zp-step1-score-num">
                      {isStep2 ? "6 / 6" : `${approvedDocsCount} / 6`}
                    </span>
                    <span className="zp-step1-score-lbl">
                      {isStep2
                        ? "Kumpleto at Na-endorso"
                        : allApproved
                        ? "Lahat Na-aprubahan ✓"
                        : `${approvedDocsCount} Na-aprubahan`}
                    </span>
                  </div>
                </div>

                {/* Approve All Button if 6 files uploaded and not yet all approved */}
                {isStep1 && selectedCompleteness?.isComplete && !hasRejectedDocs && !allApproved && (
                  <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="zp-btn-approve-all"
                      disabled={updating}
                      onClick={handleOpenApproveAllModal}
                      title="Aprubahan ang lahat ng 6 na documentary requirements nang sabay-sabay (Pinal)"
                    >
                      <IconCheck size={14} />
                      Aprubahan Lahat ng Dokumento (Approve All 6)
                    </button>
                  </div>
                )}

                {isStep2 && (
                  <div className="zp-step2-callout">
                    <div className="zp-step2-callout-left">
                      <IconMapPin size={22} className="zp-step2-callout-icon" />
                      <div>
                        <strong className="zp-step2-callout-title">
                          AKTIBONG YUGTO: Hakbang 2 (1-Araw na Ocular Inspection &amp; GIS Hazard Review)
                        </strong>
                        <span className="zp-step2-callout-sub">
                          Suriin ang lokasyon sa GIS Mapa, lot pinning, at hazard layers sa Tab 2.
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="zp-step2-callout-btn"
                      onClick={() => setModalTab("map")}
                    >
                      <IconMapPin size={13} />
                      Buksan ang Hakbang 2 (Map View) →
                    </button>
                  </div>
                )}
              </div>

                {/* 6 Mandatory Requirements Cards Grid */}
                <div className="zp-req-grid">
                  {MANDATORY_DOC_REQUIREMENTS.map((req) => {
                    const files = extractRequirementFiles(selectedApp.uploads, req);
                    const hasFiles = files.length > 0;
                    const isDocApproved = Boolean(selectedApp.approvedDocs?.[req.id]);
                    const isDocRejected = Boolean(selectedApp.rejectedDocs?.[req.id]);
                    const rejectData = selectedApp.rejectedDocs?.[req.id];
                    return (
                      <div
                        key={req.id}
                        className={`zp-req-card ${hasFiles ? "has-file" : "missing-file"} ${isDocRejected ? "is-rejected-doc" : ""} ${isDocApproved ? "is-approved-doc" : ""}`}
                      >
                        <div className="zp-req-card-top">
                          <div className="zp-req-card-header">
                            <span className="zp-req-icon">
                              {renderRequirementIcon(req.iconType)}
                            </span>
                            <div className="zp-req-info">
                              <span className="zp-req-step">Dokumento #{req.stepNumber}</span>
                              <h4 className="zp-req-title">{req.title}</h4>
                              <p className="zp-req-desc">{req.subDescription}</p>
                            </div>
                          </div>
                          <div className="zp-req-badge">
                            {isDocRejected ? (
                              <span className="zp-badge-rejected" title={rejectData?.reason || "Hindi wasto ang dokumento"}>
                                <IconXCircle size={12} />
                                Hindi Wasto / Rejected
                              </span>
                            ) : isDocApproved ? (
                              <span className="zp-badge-approved">
                                <IconCheck size={12} />
                                Approved ✓
                              </span>
                            ) : hasFiles ? (
                              <span className="zp-badge-for-approval">
                                <IconClock size={12} />
                                For Approval ({files.length})
                              </span>
                            ) : (
                              <span className="zp-badge-missing">
                                <IconAlertTriangle size={12} />
                                Walang Kalakip
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Inline Alert Banner for Rejected Requirement */}
                        {isDocRejected && (
                          <div className="zp-rejected-doc-banner">
                            <div className="zp-rejected-doc-row">
                              <IconAlertTriangle size={13} style={{ color: "#ef4444", flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <strong style={{ color: "#fca5a5", fontSize: 11.5 }}>
                                  Tinanggihan ang Dokumentong Ito:
                                </strong>{" "}
                                <span style={{ color: "#fecaca", fontSize: 11.5 }}>{rejectData?.reason}</span>
                              </div>
                              <button
                                type="button"
                                className="zp-btn-undo-reject"
                                onClick={() => handleUndoRejectDoc(req.id, req.title)}
                                title="Bawiin ang pag-reject sa dokumentong ito"
                              >
                                Bawiin
                              </button>
                            </div>
                          </div>
                        )}

                        {hasFiles ? (
                          <div className="zp-req-files-box">
                            {files.map((f: any, idx: number) => {
                              const href = attachmentHref(f.url);
                              return (
                                <div key={idx} className="zp-req-file-item">
                                  {/* Row 1: File metadata & View/Download Tools */}
                                  <div className="zp-file-row-top">
                                    <div
                                      className="zp-file-meta"
                                      onClick={() => openDocViewer(f.url, f.originalName, req.title, f.size, req.id)}
                                      title="Pindutin para suriin ang dokumento rito sa system"
                                      style={{ cursor: "pointer" }}
                                    >
                                      <IconFile size={13} style={{ flexShrink: 0, color: "#38bdf8" }} />
                                      <span
                                        className="zp-file-name"
                                        title={f.originalName || "Dokumento"}
                                      >
                                        {f.originalName || `Dokumento_${idx + 1}`}
                                      </span>
                                      {f.size ? (
                                        <span className="zp-file-size">
                                          ({formatFileSize(f.size)})
                                        </span>
                                      ) : null}
                                    </div>

                                    <div className="zp-file-tools">
                                      <button
                                        type="button"
                                        className="zp-btn-preview"
                                        onClick={() => openDocViewer(f.url, f.originalName, req.title, f.size, req.id)}
                                        title="Suriin ang file sa mismong system"
                                      >
                                        <IconEye size={12} />
                                        <span>Suriin</span>
                                      </button>
                                      <a
                                        href={href}
                                        download={f.originalName || `Dokumento_${idx + 1}`}
                                        className="zp-btn-download-file"
                                        title="I-download ang file sa iyong computer"
                                      >
                                        <IconDownload size={12} />
                                        <span>Download</span>
                                      </a>
                                    </div>
                                  </div>

                                  {/* Row 2: Verification Decision (Approve / Reject) */}
                                  <div className="zp-file-row-bottom">
                                    <div className="zp-file-status-indicator">
                                      {isDocApproved ? (
                                        <span className="zp-status-approved-txt">
                                          <IconCheck size={11} />
                                          <span>Pinal na Na-apruba</span>
                                        </span>
                                      ) : isDocRejected ? (
                                        <span className="zp-status-rejected-txt">
                                          <IconX size={11} />
                                          <span>Tinanggihan (Kailangang Palitan)</span>
                                        </span>
                                      ) : (
                                        <span className="zp-status-pending-txt">
                                          Aksyon ng Admin Aide:
                                        </span>
                                      )}
                                    </div>

                                    <div className="zp-file-decision-btns">
                                      {!isDocApproved && (
                                        <>
                                          <button
                                            type="button"
                                            className="zp-btn-approve-file"
                                            onClick={() =>
                                              handleOpenApproveSingleModal(
                                                req.id,
                                                req.title,
                                                f.originalName || `Dokumento_${idx + 1}`
                                              )
                                            }
                                            title="Aprubahan ang dokumentong ito (Pinal na aksyon)"
                                          >
                                            <IconCheck size={12} />
                                            <span>I-apruba</span>
                                          </button>
                                          <button
                                            type="button"
                                            className={`zp-btn-reject-file ${isDocRejected ? "is-rejected" : ""}`}
                                            onClick={() =>
                                              handleOpenRejectDocModal(
                                                req.id,
                                                req.title,
                                                f.originalName || `Dokumento_${idx + 1}`
                                              )
                                            }
                                            title={
                                              isDocRejected
                                                ? "Palitan o i-update ang dahilan ng pag-reject"
                                                : "I-reject ang dokumentong ito kung hindi wasto, malabo, o expired"
                                            }
                                          >
                                            <IconX size={12} />
                                            <span>{isDocRejected ? "Naka-reject" : "I-reject"}</span>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="zp-req-empty-box">
                            <span>
                              Walang na-upload na file ang aplikante para sa kailangang dokumentong ito.
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Supplementary / Additional files if any */}
                {supplementaryUploads.length > 0 && (
                  <div className="zp-supp-section">
                    <h4 className="zp-supp-title" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <IconPaperclip size={14} />
                      Iba Pang Karagdagang Dokumento / Plans:
                    </h4>
                    <div className="zp-supp-list">
                      {supplementaryUploads.map(({ key, files }) => (
                        <div key={key} className="zp-supp-item">
                          <strong className="zp-supp-name">{key}:</strong>
                          <div className="zp-supp-links">
                            {files.map((f: any, idx: number) => {
                              const href = attachmentHref(f.url);
                              return (
                                <div key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  <button
                                    type="button"
                                    className="zp-btn-preview"
                                    onClick={() => openDocViewer(f.url, f.originalName, key, f.size)}
                                    title="Suriin ang file sa mismong system"
                                  >
                                    <IconEye size={13} />
                                    {f.originalName || "Suriin ang File"}
                                  </button>
                                  <a
                                    href={href}
                                    download={f.originalName || "dokumento"}
                                    className="zp-btn-download-file"
                                    title="I-download ang file"
                                  >
                                    <IconDownload size={12} />
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 1 Action: Continue to Ocular Inspection (shows when all approved) */}
                {isStep1 && (
                  <div className={`zp-step1-continue-card ${allApproved ? "is-valid" : "is-pending"}`}>
                    <div className="zp-step1-continue-info">
                      {allApproved ? (
                        <>
                          <div className="zp-step1-continue-icon-wrap valid">
                            <IconCheckCircle size={22} />
                          </div>
                          <div>
                            <strong className="zp-step1-continue-title valid">
                              Lahat ng Anim (6) na Dokumento ay Na-apruba Na! (6/6 Approved)
                            </strong>
                            <span className="zp-step1-continue-desc">
                              Lumitaw na ang Hakbang 2. Pindutin ang button sa ibaba upang magpatuloy sa 1-Araw na Ocular Inspection ng Zoning Officer.
                            </span>
                          </div>
                        </>
                      ) : hasRejectedDocs ? (
                        <>
                          <div className="zp-step1-continue-icon-wrap warn">
                            <IconAlertTriangle size={22} />
                          </div>
                          <div>
                            <strong className="zp-step1-continue-title warn">
                              May Tinanggihang Dokumento (Naka-flag)
                            </strong>
                            <span className="zp-step1-continue-desc">
                              Kailangang mai-reupload muna ng aplikante ang tinanggihang dokumento sa tracker bago magpatuloy.
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="zp-step1-continue-icon-wrap warn">
                            <IconAlertTriangle size={22} />
                          </div>
                          <div>
                            <strong className="zp-step1-continue-title warn">
                              Pagsusuri ng Dokumento: {approvedDocsCount}/6 Na-aprubahan
                            </strong>
                            <span className="zp-step1-continue-desc">
                              Pindutin ang &quot;I-apruba&quot; sa bawat dokumento sa itaas. Kapag na-apruba ang lahat ng anim (6), awtomatikong lilitaw ang Hakbang 2 (Ocular Inspection).
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {allApproved && (
                      <button
                        type="button"
                        className="zp-btn-continue-ocular"
                        disabled={updating}
                        onClick={() => handleUpdateStatus(selectedApp.id, "ocular_inspection")}
                        title="Magpatuloy sa Hakbang 2: 1-Araw na Ocular Inspection ng Zoning Officer"
                      >
                        <span>Continue to Ocular Inspection</span>
                        <IconArrowRight size={16} />
                      </button>
                    )}
                  </div>
                )}

                {/* Action Buttons for Stages After Step 1 */}
                {!isStep1 && (
                  <div className="zp-actions-card">

                  {isStep2 && (
                    <div className="zp-action-final-status is-step2">
                      <div className="zp-action-status-left">
                        <IconCheckCircle size={20} className="zp-action-status-icon" />
                        <div>
                          <strong className="zp-action-status-title">
                            Tapos na ang Hakbang 1: Documentary Completeness Check
                          </strong>
                          <span className="zp-action-status-sub">
                            Ang pagsusuri sa lote, ocular notes, at pag-apruba o pag-deny ng Zoning Officer ay isinasagawa sa Hakbang 2 (Map View gamit ang button sa itaas o ang Tab 2).
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                {isForPayment && (
                  <div className="zp-action-final-status is-for-payment">
                    <div className="zp-action-status-head">
                      <div className="zp-action-status-left">
                        <IconCheckCircle size={20} className="zp-action-status-icon" />
                        <strong className="zp-action-status-title">
                          Zoning Approved · Nai-isyu na ang Order of Payment ({selectedApp.payment?.orderOfPaymentNo || "OP-2026"})
                        </strong>
                      </div>
                      <span className="zp-action-status-tag">
                        Kabuuang Halaga: ₱{Number(selectedApp.payment?.amount || 280).toFixed(2)}
                      </span>
                    </div>
                    <p className="zp-action-status-desc">
                      Nasa estado na ito ng pagbabayad sa Municipal Treasury Office. Kapag nakapagbayad na ang aplikante sa Physical Cashier, iu-upload niya ang kanyang Official Receipt (O.R.) sa Client Tracker at awtomatikong papasok sa Engineering dashboard para sa &quot;Before&quot; Inspection.
                    </p>
                  </div>
                )}

                {isForEngineering && (
                  <div className="zp-action-final-status is-for-engineering">
                    <div className="zp-action-status-head">
                      <div className="zp-action-status-left">
                        <div className="zp-action-status-icon-badge">
                          <IconCheckCircle size={20} />
                        </div>
                        <div>
                          <strong className="zp-action-status-title">
                            Bayad Na sa Treasury · Para sa Engineering &quot;Before&quot; Inspection
                          </strong>
                          <span className="zp-action-status-sub">
                            Official Receipt No: <strong className="zp-action-mono-tag">{selectedApp.payment?.orNumber || "OR-VERIFIED"}</strong> · Halaga: <strong>₱{Number(selectedApp.payment?.amount || 280).toFixed(2)}</strong> · Petsa: <strong>{selectedApp.payment?.paymentDate || "—"}</strong>
                          </span>
                        </div>
                      </div>

                      {selectedApp.payment?.receiptUrl && (
                        <button
                          type="button"
                          className="zp-act-btn zp-btn-view-receipt"
                          onClick={() => openDocViewer(selectedApp.payment.receiptUrl, `Official-Receipt-${selectedApp.payment.orNumber}`, "Opisyal na Resibo (Treasury O.R.)")}
                        >
                          <span>Suriin ang In-upload na Resibo (In-System) ↗</span>
                        </button>
                      )}
                    </div>

                    <div className="zp-action-status-footer">
                      <span className="zp-action-status-desc">
                        Kumpirmadong bayad na ang aplikante. Maaari nang isagawa ng Municipal Engineer ang &quot;Before&quot; Construction Inspection upang mai-isyu ang pinal na permiso.
                      </span>

                      <button
                        type="button"
                        className="zp-act-btn zp-btn-issue-permit"
                        disabled={updating}
                        onClick={() => handleUpdateStatus(selectedApp.id, "approved")}
                      >
                        <IconCheckCircle size={16} />
                        <span>Isagawa ang Before Inspection &amp; I-isyu ang Permiso →</span>
                      </button>
                    </div>
                  </div>
                )}

                {isApproved && (
                  <div className="zp-action-final-status is-approved">
                    <div className="zp-action-status-left">
                      <IconCheckCircle size={18} className="zp-action-status-icon" />
                      <span>Naaprubahan na at Nai-isyu ang Opisyal na Permiso / Zoning Clearance.</span>
                    </div>
                  </div>
                )}

                {isDenied && (
                  <div className="zp-action-final-status is-denied">
                    <div className="zp-action-status-left">
                      <IconAlertTriangle size={18} className="zp-action-status-icon" />
                      <span>Na-deny ang aplikasyong ito dahil sa paglabag sa zoning o site hazards.</span>
                    </div>
                    <button
                      type="button"
                      className="zp-act-btn zp-act--review"
                      onClick={() => handleUpdateStatus(selectedApp.id, "ocular_inspection")}
                    >
                      I-re-evaluate muli
                    </button>
                  </div>
                )}

                {isReturned && (
                  <div className="zp-action-final-status is-returned">
                    <div className="zp-action-status-left">
                      <IconRotateCcw size={18} className="zp-action-status-icon" />
                      <span>Kasalukuyang naibalik sa aplikante dahil sa may kulang na dokumento.</span>
                    </div>
                    <button
                      type="button"
                      className="zp-act-btn zp-act--review"
                      onClick={() => handleUpdateStatus(selectedApp.id, "in_review")}
                    >
                      Ibalik sa &quot;In Review&quot;
                    </button>
                  </div>
                )}
              </div>
            )}
            </div>
            ) : (
              <div className="zp-modal-map-wrap">
                <ZoningReviewMapView
                  application={selectedApp}
                  onUpdateApplication={(updated) => {
                    setApplications((prev) =>
                      prev.map((a) => (a.id === updated.id ? updated : a))
                    );
                    setSelectedApp(updated);
                    setNotification(
                      `Matagumpay na nai-save ang na-verify na lokasyon ng lote para sa ${updated.trackingNumber}`
                    );
                    setTimeout(() => setNotification(null), 4000);
                  }}
                  onEndorseInspection={handleEndorseInspectionFromMap}
                  onApprove={(appId) => handleUpdateStatus(appId, "for_payment")}
                  onDeny={(appId) => handleUpdateStatus(appId, "denied")}
                  onSendNotes={handleSendNotes}
                  reviewerNotes={reviewerNotes}
                  onChangeReviewerNotes={setReviewerNotes}
                  updating={updating}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* In-System Document & Media Viewer Modal */}
      {previewMedia && (
        <div className="zp-lightbox-backdrop" onClick={() => setPreviewMedia(null)}>
          <div className="zp-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="zp-lightbox-head">
              <div className="zp-lightbox-meta">
                <span
                  className={`zp-lightbox-badge ${
                    previewMedia.isPdf
                      ? "zp-lightbox-badge--pdf"
                      : previewMedia.isImg
                      ? "zp-lightbox-badge--img"
                      : "zp-lightbox-badge--doc"
                  }`}
                >
                  {previewMedia.isPdf ? "PDF Dokumento" : previewMedia.isImg ? "Larawan / Plano" : "Dokumento"}
                </span>
                <span className="zp-lightbox-title" title={previewMedia.title}>
                  {previewMedia.title}
                </span>
                {previewMedia.size ? (
                  <span className="zp-lightbox-size">({formatFileSize(previewMedia.size)})</span>
                ) : null}
              </div>
              <div className="zp-lightbox-head-actions">
                {previewMedia.reqId && (
                  <button
                    type="button"
                    className="zp-lightbox-reject-btn"
                    onClick={() => {
                      handleOpenRejectDocModal(
                        previewMedia.reqId!,
                        previewMedia.reqTitle || previewMedia.title,
                        previewMedia.fileName || "Dokumento"
                      );
                    }}
                    title="I-reject ang dokumentong ito kung hindi wasto, malabo, o expired"
                  >
                    <IconX size={13} />
                    I-reject ang Dokumento
                  </button>
                )}
                <a
                  href={previewMedia.url}
                  download={previewMedia.fileName || "dokumento"}
                  className="zp-btn-download-file"
                  title="I-download ang file"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px" }}
                >
                  <IconDownload size={13} />
                  I-download
                </a>
                <button
                  type="button"
                  className="zp-close-btn"
                  onClick={() => setPreviewMedia(null)}
                  title="Isara (o pindutin ang Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="zp-lightbox-body">
              <DocViewerContent
                url={previewMedia.url}
                title={previewMedia.title}
                fileName={previewMedia.fileName}
                isPdf={previewMedia.isPdf}
                isImg={previewMedia.isImg}
                size={previewMedia.size}
              />
            </div>

            <div className="zp-lightbox-foot">
              <span className="zp-lightbox-hint">
                <IconEye size={13} />
                Mismong tinitingnan sa Infatrack System (Walang bubuksang bagong tab)
              </span>
              <div className="zp-lightbox-foot-actions">
                <a
                  href={previewMedia.url}
                  download={previewMedia.fileName || "dokumento"}
                  className="zp-lightbox-download-btn"
                >
                  <IconDownload size={14} />
                  I-download ang Kopya
                </a>
                <button
                  type="button"
                  className="zp-lightbox-close-btn"
                  onClick={() => setPreviewMedia(null)}
                >
                  Isara ang Viewer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Document Approval Modal */}
      {approveConfirmModal && selectedApp && (
        <div className="zp-modal-backdrop" onClick={() => setApproveConfirmModal(null)}>
          <div
            className="zp-modal zp-approve-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520 }}
          >
            <div className="zp-modal-head" style={{ borderBottomColor: "rgba(16, 185, 129, 0.25)" }}>
              <div>
                <span className="zp-modal-tag" style={{ color: "#34d399" }}>
                  Kumpirmasyon ng Pag-apruba · Pinal na Aksyon
                </span>
                <h3 className="zp-modal-title" style={{ fontSize: "1.15rem", color: "#ffffff" }}>
                  {approveConfirmModal.type === "all"
                    ? "Aprubahan ang Lahat ng 6 na Dokumento?"
                    : `Aprubahan ang: ${approveConfirmModal.reqTitle}?`}
                </h3>
              </div>
              <button
                type="button"
                className="zp-close-btn"
                onClick={() => setApproveConfirmModal(null)}
                title="Isara"
              >
                ✕
              </button>
            </div>

            <div className="zp-modal-body" style={{ padding: "20px 24px" }}>
              {approveConfirmModal.type === "all" ? (
                <div>
                  <p style={{ margin: "0 0 14px", fontSize: 13, color: "#e2e8f0", lineHeight: 1.5 }}>
                    Sigurado ka bang na-verify mo nang maayos at nais mong aprubahan ang <strong>lahat ng anim (6) na documentary requirements</strong> para sa Tracking No. <strong style={{ color: "#38bdf8" }}>{selectedApp.trackingNumber}</strong>?
                  </p>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      background: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid rgba(245, 158, 11, 0.35)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <IconAlertTriangle size={18} style={{ color: "#fbbf24", flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: 12, color: "#fef3c7", lineHeight: 1.45 }}>
                      <strong>PAALALA (PINAL NA DESISYON):</strong> Kapag kinumpirma ang pag-apruba, hindi na ito maaaring bawiin o baguhin, at awtomatikong magbubukas ang <strong>Hakbang 2 (Ocular Inspection)</strong>.
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="zp-reject-file-info" style={{ borderColor: "rgba(16, 185, 129, 0.3)" }}>
                    <IconFile size={16} style={{ color: "#34d399", flexShrink: 0 }} />
                    <div>
                      <strong style={{ color: "#34d399", display: "block", fontSize: 12 }}>
                        {approveConfirmModal.reqTitle}
                      </strong>
                      <span className="zp-reject-filename" style={{ color: "#cbd5e1" }}>
                        {approveConfirmModal.fileName}
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: "14px 0 12px", fontSize: 13, color: "#e2e8f0", lineHeight: 1.5 }}>
                    Kumpirmahin na ang dokumentong ito ay wasto, malinaw, at sumusunod sa mga panuntunan ng Citizen&apos;s Charter.
                  </p>

                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid rgba(245, 158, 11, 0.35)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <IconAlertTriangle size={16} style={{ color: "#fbbf24", flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: 12, color: "#fef3c7", lineHeight: 1.45 }}>
                      <strong>PAALALA:</strong> Kapag na-apruba na ang dokumentong ito, ito ay magiging <strong>PINAL NA</strong> at hindi na maaaring bawiin o i-reject.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              className="zp-modal-foot"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: "16px 24px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <button
                type="button"
                className="zp-btn-cancel"
                onClick={() => setApproveConfirmModal(null)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#cbd5e1",
                  padding: "8px 18px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12.5,
                }}
              >
                Kanselahin
              </button>
              <button
                type="button"
                className="zp-btn-confirm-approve"
                disabled={updating}
                onClick={handleExecuteApprove}
                style={{
                  background: "linear-gradient(135deg, #059669, #10b981)",
                  border: "1px solid #34d399",
                  color: "#ffffff",
                  padding: "8px 20px",
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: updating ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 2px 10px rgba(16, 185, 129, 0.35)",
                }}
              >
                <IconCheck size={14} />
                <span>Oo, Kumpirmahing Aprubado</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Single Document Modal */}
      {rejectDocModal && selectedApp && (
        <div className="zp-modal-backdrop" onClick={() => setRejectDocModal(null)}>
          <div
            className="zp-modal zp-reject-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 540 }}
          >
            <div className="zp-modal-head" style={{ borderBottomColor: "rgba(239, 68, 68, 0.2)" }}>
              <div>
                <span className="zp-modal-tag" style={{ color: "#f87171" }}>
                  Maling Dokumento · Aksyon ng Reviewer
                </span>
                <h3 className="zp-modal-title" style={{ fontSize: "1.15rem", color: "#ffffff" }}>
                  I-reject ang Dokumento: <span style={{ color: "#fca5a5" }}>{rejectDocModal.reqTitle}</span>
                </h3>
              </div>
              <button
                type="button"
                className="zp-close-btn"
                onClick={() => setRejectDocModal(null)}
                title="Isara"
              >
                ✕
              </button>
            </div>

            <div className="zp-modal-body" style={{ padding: "20px 24px" }}>
              <div className="zp-reject-file-info">
                <IconFile size={16} style={{ color: "#94a3b8", flexShrink: 0 }} />
                <span className="zp-reject-filename">{rejectDocModal.fileName}</span>
              </div>

              <div style={{ marginTop: 16 }}>
                <label className="zp-field-lbl" style={{ display: "block", marginBottom: 8, color: "#cbd5e1", fontSize: 12 }}>
                  Pumili ng Karaniwang Dahilan (Quick Presets):
                </label>
                <div className="zp-preset-chips">
                  {REJECT_PRESET_REASONS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`zp-preset-chip ${rejectReason === preset ? "is-active" : ""}`}
                      onClick={() => setRejectReason(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label className="zp-field-lbl" style={{ display: "block", marginBottom: 6, color: "#cbd5e1", fontSize: 12 }}>
                  Partikular na Dahilan ng Pag-reject:
                </label>
                <textarea
                  className="zp-notes-textarea"
                  style={{
                    width: "100%",
                    minHeight: 75,
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#ffffff",
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 12.5,
                    boxSizing: "border-box",
                  }}
                  placeholder="Hal. Malabo ang kopya ng titulo; hindi mabasa ang TCT Number at lagda ng Register of Deeds…"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
            </div>

            <div
              className="zp-modal-foot"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: "16px 24px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <button
                type="button"
                className="zp-btn-cancel"
                onClick={() => setRejectDocModal(null)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#cbd5e1",
                  padding: "7px 16px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12.5,
                }}
              >
                Kanselahin
              </button>
              <button
                type="button"
                className="zp-btn-confirm-reject"
                disabled={updating || !rejectReason.trim()}
                onClick={handleConfirmRejectDoc}
                style={{
                  background: "#dc2626",
                  border: "1px solid #ef4444",
                  color: "#ffffff",
                  padding: "7px 18px",
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: updating || !rejectReason.trim() ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <IconXCircle size={14} />
                I-reject ang Dokumentong Ito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Entire Application Modal */}
      {isRejectAppModalOpen && selectedApp && (
        <div className="zp-modal-backdrop" onClick={() => setIsRejectAppModalOpen(false)}>
          <div
            className="zp-modal zp-reject-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 540 }}
          >
            <div className="zp-modal-head" style={{ borderBottomColor: "rgba(239, 68, 68, 0.2)" }}>
              <div>
                <span className="zp-modal-tag" style={{ color: "#f87171" }}>
                  Disapproval · Hakbang 1
                </span>
                <h3 className="zp-modal-title" style={{ fontSize: "1.2rem", color: "#ffffff" }}>
                  I-reject ang Aplikasyon: <span style={{ color: "#fca5a5" }}>{selectedApp.trackingNumber}</span>
                </h3>
              </div>
              <button
                type="button"
                className="zp-close-btn"
                onClick={() => setIsRejectAppModalOpen(false)}
                title="Isara"
              >
                ✕
              </button>
            </div>

            <div className="zp-modal-body" style={{ padding: "20px 24px" }}>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <IconAlertTriangle size={18} style={{ color: "#f87171", flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 12.5, color: "#fecaca", lineHeight: 1.5 }}>
                  Opisyal na itatala ang katayuan bilang <strong>Tinanggihan (Rejected)</strong>.
                  Makikita ito ng aplikante sa kanyang tracking dashboard kasama ang inyong pormal na dahilan.
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label className="zp-field-lbl" style={{ display: "block", marginBottom: 6, color: "#cbd5e1", fontSize: 12 }}>
                  Opisyal na Dahilan ng Pagtanggi (Rejection / Disapproval Reason):
                </label>
                <textarea
                  className="zp-notes-textarea"
                  style={{
                    width: "100%",
                    minHeight: 90,
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#ffffff",
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 12.5,
                    boxSizing: "border-box",
                  }}
                  placeholder="Isulat ang dahilan kung bakit tinanggihan ang aplikasyon..."
                  value={appRejectReason}
                  onChange={(e) => setAppRejectReason(e.target.value)}
                />
              </div>
            </div>

            <div
              className="zp-modal-foot"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: "16px 24px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <button
                type="button"
                className="zp-btn-cancel"
                onClick={() => setIsRejectAppModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#cbd5e1",
                  padding: "7px 16px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12.5,
                }}
              >
                Kanselahin
              </button>
              <button
                type="button"
                className="zp-btn-confirm-reject"
                disabled={updating || !appRejectReason.trim()}
                onClick={handleConfirmRejectApp}
                style={{
                  background: "#dc2626",
                  border: "1px solid #ef4444",
                  color: "#ffffff",
                  padding: "7px 18px",
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: updating || !appRejectReason.trim() ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <IconXCircle size={14} />
                Kumpirmahin ang Pag-reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MPDC Notification Drawer ── */}
      {notifDrawerOpen && (
        <div className="zp-notif-backdrop" onClick={() => setNotifDrawerOpen(false)}>
          <aside
            className="zp-notif-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Mga Notipikasyon ng MPDC"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="zp-notif-header">
              <div className="zp-notif-header-title-wrap">
                <span className="zp-notif-bell-icon">
                  <IconBell size={18} />
                </span>
                <h3 className="zp-notif-header-title">Mga Notipikasyon</h3>
                {unreadCount > 0 && (
                  <span className="zp-notif-header-count">{unreadCount} bago</span>
                )}
              </div>
              <button
                type="button"
                className="zp-notif-close-btn"
                onClick={() => setNotifDrawerOpen(false)}
                aria-label="Isara ang drawer"
              >
                ✕
              </button>
            </div>

            <div className="zp-notif-tabs-bar">
              <div className="zp-notif-filter-tabs">
                <button
                  type="button"
                  className={`zp-notif-tab-btn${notifFilter === "all" ? " active" : ""}`}
                  onClick={() => setNotifFilter("all")}
                >
                  Lahat ({activeNotices.length})
                </button>
                <button
                  type="button"
                  className={`zp-notif-tab-btn${notifFilter === "apps" ? " active" : ""}`}
                  onClick={() => setNotifFilter("apps")}
                >
                  Aplikasyon ({appNoticesCount})
                </button>
                <button
                  type="button"
                  className={`zp-notif-tab-btn${notifFilter === "planning" ? " active" : ""}`}
                  onClick={() => setNotifFilter("planning")}
                >
                  Planning ({planningNoticesCount})
                </button>
              </div>

              {activeNotices.length > 0 && (
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    className="zp-notif-clear-all"
                    onClick={markAllNoticesAsRead}
                    title="Markahan lahat na nabasa para mabawasan ang badge"
                  >
                    Basahin lahat
                  </button>
                  <button
                    type="button"
                    className="zp-notif-clear-all"
                    onClick={dismissAllNotices}
                    title="I-dismiss lahat"
                    style={{ opacity: 0.75 }}
                  >
                    I-clear lahat
                  </button>
                </div>
              )}
            </div>

            <div className="zp-notif-body">
              {displayedNotices.length > 0 ? (
                <div className="zp-notif-list">
                  {displayedNotices.map((n) => (
                    <div
                      key={n.id}
                      className={`zp-notif-card zp-notif-${n.kind}${!isNoticeRead(n) ? " zp-notif-unread" : " zp-notif-read"}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNoticeClick(n)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleNoticeClick(n);
                        }
                      }}
                    >
                      <div className="zp-notif-card-top">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {!isNoticeRead(n) && (
                            <span className="zp-notif-unread-dot" title="Hindi pa nababasa">● Bago</span>
                          )}
                          <span className={`zp-notif-tag zp-tag-${n.kind}`}>{n.badge}</span>
                        </div>
                        <span className="zp-notif-time">{formatRealNotifDate(n.timestamp)}</span>
                        <button
                          type="button"
                          className="zp-notif-item-dismiss"
                          onClick={(e) => dismissNotice(n.id, e)}
                          title="I-dismiss"
                          aria-label="I-dismiss ang notipikasyon"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="zp-notif-card-title">{n.title}</div>
                      <div className="zp-notif-card-msg">{n.message}</div>
                      <div className="zp-notif-card-footer">
                        <span className="zp-notif-action-hint">
                          {n.source === "application" ? "I-click para suriin ang aplikasyon →" : "I-click para buksan ang planning →"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="zp-notif-empty">
                  <div className="zp-notif-empty-icon">
                    <IconBell size={32} />
                  </div>
                  <div className="zp-notif-empty-title">Walang bagong notipikasyon</div>
                  <div className="zp-notif-empty-sub">
                    Ang mga bagong dating na citizen applications, bayad sa Treasury, at planning proposals ay awtomatikong lilitaw rito.
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default ZoningPermitsPage;
