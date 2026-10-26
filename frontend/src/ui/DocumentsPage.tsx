import React, { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { BARANGAY_LIST } from "../types";
import type { SessionUser } from "../services/auth";
import { backendUrl, fetchCitizenApplications } from "../lib/api";
import { ThemeToggle } from "./ThemeToggle";
import { InSystemDocModal, type PreviewMedia, isPdfFile, isImageFile, downloadFileViaBlob } from "./InSystemDocViewer";
import {
  downloadDocumentBackupZip,
  downloadSingleApplicantBackupZip,
  subscribeToDocumentBackups,
  formatBackupBytes,
  type BackupProgressInfo,
  type DocumentBackupRecord,
} from "../services/documentBackup";
import SideNavbar from "./SideNavbar";
import MpdcTopNavbar from "./MpdcTopNavbar";
import "./DocumentsPage.css";

type Props = {
  onBack?: () => void;
  session: SessionUser | null;
  onNavigate?: (screen: string) => void;
  onLogout?: () => void;
};

export type ApprovedDocItem = {
  id: string;
  docKey: string;
  docTitle: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  approvedAt: string;
  approvedBy: string;
};

export type ApprovedApplicationFolder = {
  id: string;
  trackingNumber: string;
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string;
  applicantAddress: string;
  projectTitle: string;
  serviceType: string;
  barangay: string;
  applicationStatus: string;
  year: number;
  approvedAtLatest: string;
  approvedBy: string;
  documents: ApprovedDocItem[];
};

function fileHref(url: string) {
  if (!url) return "#";
  if (url.startsWith("http") || url.startsWith("blob:")) return url;
  return backendUrl(url);
}

function formatWhen(iso: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => currentYear - i);

const REQUIREMENT_MAPPINGS: {
  id: string;
  title: string;
  shortLabel: string;
  keys: string[];
  iconType: string;
}[] = [
  {
    id: "tct",
    title: "Photocopy ng TCT (Land Title)",
    shortLabel: "TCT / Land Title",
    keys: ["tctTaxDec", "tctTitle", "tctDoc", "landTitle", "titleDeed", "tct"],
    iconType: "tct",
  },
  {
    id: "tax_dec",
    title: "Tax Declaration",
    shortLabel: "Tax Declaration",
    keys: ["taxDeclaration", "taxDec", "taxDeclarationDoc", "tax_dec"],
    iconType: "tax_dec",
  },
  {
    id: "rpt_receipt",
    title: "Current Real Property Tax Receipt (Amilyar)",
    shortLabel: "Amilyar Receipt",
    keys: ["rptReceipt", "rptTaxReceipt", "taxReceipt", "amilyarReceipt", "rpt_receipt"],
    iconType: "rpt_receipt",
  },
  {
    id: "brgy_clearance",
    title: "Barangay Clearance",
    shortLabel: "Barangay Clearance",
    keys: ["brgyClearance", "barangayClearance", "brgy_clearance"],
    iconType: "brgy_clearance",
  },
  {
    id: "plo_cert",
    title: "PLO Certification (Clearance mula sa MERALCO)",
    shortLabel: "PLO / MERALCO",
    keys: ["ploCert", "ploCertification", "meralcoClearance", "powerClearance", "plo_cert"],
    iconType: "plo_cert",
  },
  {
    id: "photo_docs",
    title: "Photo Documentation (Loob at Labas ng Site)",
    shortLabel: "Site Photos",
    keys: ["photoDocs", "photos", "sitePhotos", "photoDocumentation", "photo_docs"],
    iconType: "photo_docs",
  },
  {
    id: "deedOrConsent",
    title: "Deed of Sale / Owner's Consent",
    shortLabel: "Deed / Consent",
    keys: ["deedOrConsent", "deedOfSale", "ownerConsent"],
    iconType: "other",
  },
  {
    id: "denrLetter",
    title: "DENR / Environmental Clearance",
    shortLabel: "DENR Clearance",
    keys: ["denrLetter", "denrClearance"],
    iconType: "other",
  },
  {
    id: "studentIdLetter",
    title: "Student / Organization Endorsement Letter",
    shortLabel: "Endorsement Letter",
    keys: ["studentIdLetter"],
    iconType: "other",
  },
];

function extractFilesFromKeys(uploads: any, keys: string[]): any[] {
  if (!uploads || typeof uploads !== "object") return [];
  for (const k of keys) {
    const val = uploads[k];
    if (Array.isArray(val) && val.length > 0) return val;
    if (val && typeof val === "object" && val.url) return [val];
  }
  return [];
}

function extractApprovedApplicationFolders(applications: any[]): ApprovedApplicationFolder[] {
  const folders: ApprovedApplicationFolder[] = [];

  for (const app of applications) {
    if (!app || typeof app !== "object") continue;
    const uploads = app.uploads || {};
    const approvedDocs = app.approvedDocs || {};
    const rejectedDocs = app.rejectedDocs || {};
    const isAppFullyApproved =
      app.status === "approved" ||
      app.status === "completed" ||
      app.status === "approved_for_construction";

    const applicantName = app.applicant?.fullName || "Aplikante";
    const applicantPhone = app.applicant?.contactPhone || "";
    const applicantEmail = app.applicant?.contactEmail || "";
    const applicantAddress = app.applicant?.address || "";
    const trackingNumber = app.trackingNumber || app.id || "—";
    const projectTitle = app.projectTitle || app.title || "Project Application";
    const serviceType = app.serviceType || "zoning_certificate";
    const barangay = app.applicant?.barangay || app.lotDetails?.barangay || "Luisiana";
    const appYear = app.createdAt ? new Date(app.createdAt).getFullYear() : currentYear;

    const usedUploadKeys = new Set<string>();
    const docItems: ApprovedDocItem[] = [];
    let latestApproval = app.updatedAt || app.createdAt || "";
    let approvedByStaff = "MPDC";

    for (const req of REQUIREMENT_MAPPINGS) {
      const files = extractFilesFromKeys(uploads, req.keys);
      const approvedEntry = approvedDocs[req.id];
      const isRejected = Boolean(rejectedDocs[req.id]);

      if ((approvedEntry || (isAppFullyApproved && !isRejected)) && files.length > 0) {
        req.keys.forEach((k) => usedUploadKeys.add(k));
        files.forEach((file: any, fIdx: number) => {
          const fileUrl = file?.url || (typeof file === "string" ? file : "");
          if (!fileUrl) return;
          const fileName =
            file?.originalName ||
            file?.filename ||
            file?.name ||
            (typeof file === "string" ? file.split("/").pop() || "Document" : "Document");
          const approvedAt =
            approvedEntry?.approvedAt || app.updatedAt || app.createdAt || new Date().toISOString();
          const approvedBy = approvedEntry?.approvedBy || "MPDC";
          if (approvedAt && (!latestApproval || approvedAt > latestApproval)) {
            latestApproval = approvedAt;
          }
          if (approvedEntry?.approvedBy) {
            approvedByStaff = approvedEntry.approvedBy;
          }

          docItems.push({
            id: `appdoc-${app.id}-${req.id}-${fIdx}`,
            docKey: req.id,
            docTitle: approvedEntry?.title || req.title,
            fileName,
            fileUrl,
            fileSize: file?.size,
            mimeType: file?.mimeType,
            approvedAt,
            approvedBy,
          });
        });
      }
    }

    // Unmapped keys in approvedDocs
    for (const [key, approvedEntry] of Object.entries(approvedDocs)) {
      if (REQUIREMENT_MAPPINGS.some((r) => r.id === key) || usedUploadKeys.has(key)) continue;
      const files = extractFilesFromKeys(uploads, [key]);
      if (files.length > 0) {
        usedUploadKeys.add(key);
        const appDocEntry = approvedEntry as any;
        files.forEach((file: any, fIdx: number) => {
          const fileUrl = file?.url || (typeof file === "string" ? file : "");
          if (!fileUrl) return;
          const fileName =
            file?.originalName ||
            file?.filename ||
            file?.name ||
            (typeof file === "string" ? file.split("/").pop() || "Document" : "Document");
          const approvedAt =
            appDocEntry?.approvedAt || app.updatedAt || app.createdAt || new Date().toISOString();
          const approvedBy = appDocEntry?.approvedBy || "MPDC";
          if (approvedAt && (!latestApproval || approvedAt > latestApproval)) {
            latestApproval = approvedAt;
          }

          docItems.push({
            id: `appdoc-${app.id}-${key}-${fIdx}`,
            docKey: key,
            docTitle: appDocEntry?.title || key,
            fileName,
            fileUrl,
            fileSize: file?.size,
            mimeType: file?.mimeType,
            approvedAt,
            approvedBy,
          });
        });
      }
    }

    // If fully approved, add remaining attachments not rejected
    if (isAppFullyApproved) {
      for (const [key, val] of Object.entries(uploads)) {
        if (usedUploadKeys.has(key) || rejectedDocs[key]) continue;
        const fileList = Array.isArray(val) ? val : val && typeof val === "object" ? [val] : [];
        fileList.forEach((file: any, fIdx: number) => {
          const fileUrl = file?.url || (typeof file === "string" ? file : "");
          if (!fileUrl) return;
          const fileName =
            file?.originalName ||
            file?.filename ||
            file?.name ||
            (typeof file === "string" ? file.split("/").pop() || "Document" : "Document");
          const approvedAt = app.updatedAt || app.createdAt || new Date().toISOString();

          docItems.push({
            id: `appdoc-${app.id}-${key}-${fIdx}`,
            docKey: key,
            docTitle: `Attachment (${key})`,
            fileName,
            fileUrl,
            fileSize: file?.size,
            mimeType: file?.mimeType,
            approvedAt,
            approvedBy: "MPDC",
          });
        });
      }
    }

    if (docItems.length > 0) {
      folders.push({
        id: app.id,
        trackingNumber,
        applicantName,
        applicantPhone,
        applicantEmail,
        applicantAddress,
        projectTitle,
        serviceType,
        barangay,
        applicationStatus: app.status || "approved",
        year: latestApproval ? new Date(latestApproval).getFullYear() : appYear,
        approvedAtLatest: latestApproval,
        approvedBy: approvedByStaff,
        documents: docItems,
      });
    }
  }

  // Sort descending by latest approved date
  return folders.sort((a, b) => (b.approvedAtLatest || "").localeCompare(a.approvedAtLatest || ""));
}

/* ── Vector SVG Icons ── */
function IconCheckBadge({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconFolder({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function IconDocFile({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconDownload({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconEye({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconExternal({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function IconRefresh({ size = 14, spinning }: { size?: number; spinning?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? "dms-spin" : ""}
      aria-hidden
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function IconSearch({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconUser({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconMapPin({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconShieldLock({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconArchive({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function IconClockHistory({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 14 14" />
    </svg>
  );
}

export default function DocumentsPage({ onBack, session, onNavigate, onLogout }: Props) {
  const [folders, setFolders] = useState<ApprovedApplicationFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Backup & Disaster Recovery State
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupScope, setBackupScope] = useState<"all" | "filtered">("all");
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState<BackupProgressInfo | null>(null);
  const [backupAbortController, setBackupAbortController] = useState<AbortController | null>(null);
  const [backupHistory, setBackupHistory] = useState<DocumentBackupRecord[]>([]);
  const [backupToast, setBackupToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [singleDossierBackingUpId, setSingleDossierBackingUpId] = useState<string | null>(null);
  const [activeTabBackup, setActiveTabBackup] = useState<"create" | "history">("create");

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterYear, setFilterYear] = useState<number | "">("");
  const [filterBarangay, setFilterBarangay] = useState<string>("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [activePreviewDocId, setActivePreviewDocId] = useState<string | null>(null);
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null);

  const openDocPreview = (doc: { fileUrl: string; docTitle: string; fileName?: string; fileSize?: number }) => {
    const href = fileHref(doc.fileUrl);
    const cleanName = doc.fileName || `${doc.docTitle}.pdf`;
    setPreviewMedia({
      url: href,
      title: `${doc.docTitle} — ${cleanName}`,
      fileName: cleanName,
      isPdf: isPdfFile(href, cleanName),
      isImg: isImageFile(href, cleanName),
      size: doc.fileSize,
    });
  };

  const loadFolders = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setRefreshing(true);
    try {
      const apps = await fetchCitizenApplications();
      const folderList = extractApprovedApplicationFolders(apps);
      setFolders(folderList);
      setMessage(null);
    } catch (err) {
      console.warn("[DocumentsPage] Failed to fetch citizen applications:", err);
      setMessage("Hindi maikonekta ang server upang makuha ang mga dokumento.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadFolders(true);

    let socket: any = null;
    try {
      socket = io(backendUrl(""), {
        transports: ["websocket", "polling"],
        withCredentials: true,
      });

      const handleUpdate = () => {
        void loadFolders(false);
      };

      socket.on("application_created", handleUpdate);
      socket.on("application_updated", handleUpdate);
      socket.on("connect", () => {
        void loadFolders(false);
      });
    } catch (err) {
      console.warn("[DocumentsPage] Socket init notice:", err);
    }

    const interval = window.setInterval(() => {
      void loadFolders(false);
    }, 10000);

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const selectedFolder = useMemo(
    () => (selectedId ? folders.find((f) => f.id === selectedId) ?? null : null),
    [folders, selectedId]
  );

  // Total approved individual documents
  const totalApprovedDocsCount = useMemo(
    () => folders.reduce((sum, f) => sum + f.documents.length, 0),
    [folders]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return folders.filter((f) => {
      if (filterYear !== "" && f.year !== filterYear) return false;
      if (filterBarangay && (f.barangay || "").toLowerCase() !== filterBarangay.toLowerCase()) {
        return false;
      }
      if (filterType && !f.documents.some((d) => d.docKey === filterType)) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        f.applicantName,
        f.trackingNumber,
        f.projectTitle,
        f.barangay,
        ...f.documents.map((d) => `${d.docTitle} ${d.fileName}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [folders, search, filterType, filterYear, filterBarangay]);

  const handleCopyTracking = (tracking: string) => {
    navigator.clipboard.writeText(tracking);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  useEffect(() => {
    const unsub = subscribeToDocumentBackups((records) => {
      setBackupHistory(records);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!backupToast) return;
    const timer = setTimeout(() => setBackupToast(null), 6000);
    return () => clearTimeout(timer);
  }, [backupToast]);

  const filteredDocsCount = useMemo(
    () => filtered.reduce((sum, f) => sum + f.documents.length, 0),
    [filtered]
  );

  const handleStartBackup = async () => {
    const targetFolders = backupScope === "filtered" ? filtered : folders;
    if (targetFolders.length === 0) {
      setBackupToast({ type: "error", text: "Walang mga dokumento sa napiling grupo upang i-backup." });
      return;
    }

    const controller = new AbortController();
    setBackupAbortController(controller);
    setIsBackingUp(true);
    setBackupProgress({
      current: 0,
      total: targetFolders.reduce((sum, f) => sum + f.documents.length, 0),
      percent: 0,
      currentItemName: "Inihahanda ang archive…",
      stage: "fetching",
      statusText: "Sinisimulan ang pagbuo ng opisyal na backup archive…",
    });

    try {
      const author = session?.name || session?.username || "MPDC Staff";
      const result = await downloadDocumentBackupZip(targetFolders, {
        author,
        type: backupScope === "filtered" ? "filtered_archive" : "full_archive",
        filterNote:
          backupScope === "filtered"
            ? `Naka-filter: ${search ? `Search="${search}" ` : ""}${filterBarangay ? `Brgy="${filterBarangay}" ` : ""}${filterYear ? `Taon="${filterYear}"` : ""}`
            : "Lahat ng Naaprubahang Dokumento",
        onProgress: (p) => setBackupProgress(p),
        abortSignal: controller.signal,
      });

      if (result.ok) {
        setBackupToast({
          type: "success",
          text: `Matagumpay na nai-backup ang ${result.record?.documentCount || 0} dokumento sa ZIP file: ${result.filename}! May kasamang offline HTML verification report at cryptographic JSON manifest.`,
        });
      } else {
        setBackupToast({
          type: "error",
          text: result.error || "Hindi matagumpay ang pagbuo ng backup.",
        });
      }
    } catch (err: any) {
      if (controller.signal.aborted) {
        setBackupToast({ type: "error", text: "Kinansela ang pag-backup ng mga dokumento." });
      } else {
        console.error("[DocumentsPage] Backup error:", err);
        setBackupToast({ type: "error", text: `Error sa pag-backup: ${err?.message || "Unknown error"}` });
      }
    } finally {
      setIsBackingUp(false);
      setBackupAbortController(null);
    }
  };

  const handleCancelBackup = () => {
    if (backupAbortController) {
      backupAbortController.abort();
    }
  };

  const handleBackupSelectedApplicant = async (folder: ApprovedApplicationFolder) => {
    if (!folder || folder.documents.length === 0) return;
    setSingleDossierBackingUpId(folder.id);
    const author = session?.name || session?.username || "MPDC Staff";
    try {
      const result = await downloadSingleApplicantBackupZip(folder, author);
      if (result.ok) {
        setBackupToast({
          type: "success",
          text: `Matagumpay na nai-backup ang lahat ng ${folder.documents.length} naaprubahang dokumento ni ${folder.applicantName} sa ZIP (${result.filename})!`,
        });
      } else {
        setBackupToast({
          type: "error",
          text: result.error || "Hindi ma-download ang ZIP ng aplikante.",
        });
      }
    } catch (err: any) {
      setBackupToast({
        type: "error",
        text: `Error sa pag-backup: ${err?.message || "Unknown error"}`,
      });
    } finally {
      setSingleDossierBackingUpId(null);
    }
  };

  return (
    <div className="dms-page">
      <MpdcTopNavbar
        title="Talaan ng mga Aprubadong Dokumento (DMS)"
        subtitle="Naka-grupo ayon sa bawat aplikante ang lahat ng opisyal na aprubadong dokumento at kalakip"
        brandPill="MPDC"
        accentClass="topnav-accent-mpdc"
        serviceTag="Document Repository Vault"
        serviceSla={`${folders.length} Aplikante · ${totalApprovedDocsCount} Naaprubahang Dokumento`}
        session={session}
        userDept="DMS Records Officer"
        onLogout={onLogout}
        extraControls={
          <>
            <button
              type="button"
              className="dms-btn dms-btn-backup-repo"
              onClick={() => {
                setIsBackupModalOpen(true);
                setBackupToast(null);
              }}
              title="I-backup ang lahat ng naaprubahang dokumento at kalakip bilang opisyal na disaster recovery ZIP archive"
            >
              <IconShieldLock size={15} />
              <span>I-backup ang mga Dokumento</span>
              <span className="dms-badge-counter">{totalApprovedDocsCount} Files</span>
            </button>
            <button
              type="button"
              className="dms-btn dms-btn-secondary"
              onClick={() => void loadFolders(false)}
              disabled={refreshing}
              title="I-refresh ang mga talaan"
            >
              <IconRefresh size={13} spinning={refreshing} />
              <span style={{ marginLeft: 5 }}>Refresh</span>
            </button>
          </>
        }
      />

      <div className="app-page-body-with-side-nav">
        <SideNavbar
          currentScreen="documents"
          onNavigate={onNavigate}
          approvedDocsCount={totalApprovedDocsCount}
          currentRole={session?.role || "MPDC"}
        />
        <div className="app-page-main-with-side-nav">
          {message && (
            <div className="dms-banner" role="status">
              <span>{message}</span>
              <button type="button" onClick={() => setMessage(null)}>
                ×
              </button>
            </div>
          )}

          <div className={`dms-layout${selectedFolder ? " has-detail" : ""}`}>
        <section className="dms-main">
          {/* Quick Metrics / KPI Bar */}
          <div className="dms-stat-strip">
            <div className="dms-stat-card">
              <div className="dms-stat-val">{folders.length}</div>
              <div className="dms-stat-label">Mga Aplikanteng may Aprubadong Docs</div>
              <div className="dms-stat-desc">Lahat ng aplikanteng may opisyal na naaprubahang mga dokumento</div>
            </div>
            <div className="dms-stat-card">
              <div className="dms-stat-val dms-val--warn">{totalApprovedDocsCount}</div>
              <div className="dms-stat-label">Kabuuang Naaprubahang Files</div>
              <div className="dms-stat-desc">Opisyal na naaprubahang kalakip at dokumento</div>
            </div>
            <div className="dms-stat-card">
              <div className="dms-stat-val dms-val--info">
                {new Set(folders.map((f) => f.barangay)).size}
              </div>
              <div className="dms-stat-label">Mga Barangay na may Aprubadong Lote</div>
              <div className="dms-stat-desc">Mga sakop na barangay sa Bayan ng Luisiana</div>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="dms-toolbar">
            <div className="dms-search-box">
              <IconSearch size={14} />
              <input
                className="dms-search-input"
                placeholder="Hanapin ayon sa Pangalan ng Aplikante, Tracking #, Proyekto, o Barangay…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="dms-clear-search"
                  onClick={() => setSearch("")}
                  title="Burahin ang search"
                >
                  ×
                </button>
              )}
            </div>

            <select
              className="dms-input"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              title="Salain kung may kalakip na partikular na dokumento"
            >
              <option value="">Lahat ng Uri ng Dokumento</option>
              {REQUIREMENT_MAPPINGS.map((req) => (
                <option key={req.id} value={req.id}>
                  Naglalaman ng {req.title}
                </option>
              ))}
            </select>

            <select
              className="dms-input"
              value={filterBarangay}
              onChange={(e) => setFilterBarangay(e.target.value)}
              title="Salain ayon sa Barangay"
            >
              <option value="">Lahat ng Barangay</option>
              {BARANGAY_LIST.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <select
              className="dms-input"
              value={filterYear === "" ? "" : String(filterYear)}
              onChange={(e) =>
                setFilterYear(e.target.value ? Number(e.target.value) : "")
              }
              title="Salain ayon sa Taon"
            >
              <option value="">Lahat ng Taon</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  Taong {y}
                </option>
              ))}
            </select>

            {(search || filterType || filterBarangay || filterYear !== "") && (
              <button
                type="button"
                className="dms-btn dms-btn-reset"
                onClick={() => {
                  setSearch("");
                  setFilterType("");
                  setFilterBarangay("");
                  setFilterYear("");
                }}
                title="I-reset ang lahat ng filter"
              >
                I-reset ang Filter
              </button>
            )}
          </div>

          {/* Grouped Folder List */}
          {loading ? (
            <div className="dms-empty-state">
              <div className="dms-spinner" />
              <p>Ikinakarga ang mga dossier ng bawat aplikante…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="dms-empty-state">
              <div className="dms-empty-icon">📁</div>
              <h3>Walang Nakitang Aplikante</h3>
              <p>
                {search || filterType || filterBarangay || filterYear !== ""
                  ? "Walang aplikanteng tumutugma sa iyong mga filter o hinahanap."
                  : "Kasalukuyang wala pang aprubadong dokumento mula sa mga aplikante. Lumitaw ang mga ito kapag naaprubahan na ng MPDC sa Hakbang 1 ng Zoning Review."}
              </p>
            </div>
          ) : (
            <div className="dms-table-wrap">
              <table className="dms-table">
                <thead>
                  <tr>
                    <th>Aplikante &amp; Proyekto</th>
                    <th>Mga Naaprubahang Dokumento (Folder)</th>
                    <th>Lokasyon</th>
                    <th>Petsa Naaprubahan</th>
                    <th style={{ textAlign: "right" }}>Aksyon</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => {
                    const isSelected = selectedFolder?.id === f.id;
                    return (
                      <tr
                        key={f.id}
                        className={isSelected ? "selected" : ""}
                        onClick={() => setSelectedId(f.id)}
                      >
                        <td>
                          <div className="dms-applicant-cell">
                            <div className="dms-avatar-wrap">
                              <IconUser size={16} />
                            </div>
                            <div>
                              <div className="dms-applicant-name">{f.applicantName}</div>
                              <span className="dms-tracking-pill">{f.trackingNumber}</span>
                              <div className="dms-project-title-sub" title={f.projectTitle}>
                                {f.projectTitle}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="dms-folder-docs-cell">
                            <div className="dms-folder-badge">
                              <IconCheckBadge size={12} />
                              <strong>{f.documents.length} Dokumento</strong>
                            </div>
                            <div className="dms-doc-chips-wrap">
                              {f.documents.map((doc) => (
                                <button
                                  key={doc.id}
                                  type="button"
                                  className="dms-doc-chip"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDocPreview(doc);
                                  }}
                                  title={`Suriin sa viewer: ${doc.docTitle} (${doc.fileName})`}
                                >
                                  <IconDocFile size={11} />
                                  <span>{doc.docTitle}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="dms-barangay-tag">
                            <IconMapPin size={12} />
                            <strong>{f.barangay}</strong>
                          </div>
                        </td>
                        <td>
                          <div className="dms-approved-stamp-cell">
                            <span className="dms-badge-approved">
                              <IconCheckBadge size={11} />
                              Naaprubahan
                            </span>
                            <span className="dms-approved-date">
                              {formatWhen(f.approvedAtLatest)}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="dms-btn-action"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(f.id);
                            }}
                            title="Tingnan ang lahat ng dokumento sa folder"
                          >
                            <IconFolder size={13} />
                            Tingnan Folder
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Selected Applicant Dossier Side Drawer */}
        {selectedFolder && (
          <aside className="dms-detail">
            <div className="dms-detail-top">
              <div>
                <span className="dms-detail-kicker">DOSSIER NG MGA DOKUMENTO</span>
                <h2>{selectedFolder.applicantName}</h2>
                <div className="dms-tracking-row" style={{ marginTop: 4 }}>
                  <span className="dms-tracking-text">{selectedFolder.trackingNumber}</span>
                  <button
                    type="button"
                    className="dms-copy-btn"
                    onClick={() => handleCopyTracking(selectedFolder.trackingNumber)}
                    title="Kopyahin ang tracking number"
                  >
                    {copiedTracking ? "✓ Nakopya" : "Kopyahin"}
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="dms-detail-close"
                aria-label="Isara"
                onClick={() => setSelectedId(null)}
              >
                ×
              </button>
            </div>

            {/* Official Approval Stamp Banner */}
            <div className="dms-approval-stamp-card">
              <div className="dms-stamp-header">
                <IconCheckBadge size={22} />
                <div>
                  <strong className="dms-stamp-status">
                    OPISYAL NA NAAPRUBAHAN NG MPDC
                  </strong>
                  <span className="dms-stamp-sub">
                    Lahat ng {selectedFolder.documents.length} dokumento ay naaprubahan
                  </span>
                </div>
              </div>
              <div className="dms-stamp-meta">
                <span>Inaprubahan ni: <strong>{selectedFolder.approvedBy}</strong></span>
                <span>Petsa: <strong>{formatWhen(selectedFolder.approvedAtLatest)}</strong></span>
              </div>
            </div>

            {/* Dossier Backup Action */}
            <div className="dms-dossier-backup-action-bar">
              <button
                type="button"
                className="dms-btn-backup-single"
                onClick={() => void handleBackupSelectedApplicant(selectedFolder)}
                disabled={isBackingUp || singleDossierBackingUpId === selectedFolder.id}
                title={`I-download ang lahat ng ${selectedFolder.documents.length} naaprubahang dokumento ni ${selectedFolder.applicantName} bilang isang ZIP file`}
              >
                <IconArchive size={14} />
                <span>
                  {singleDossierBackingUpId === selectedFolder.id
                    ? "Ikinakarga ang ZIP Archive…"
                    : `I-backup ang Dossier na Ito (${selectedFolder.documents.length} Files ZIP)`}
                </span>
              </button>
            </div>

            {/* Applicant & Project Summary Card */}
            <div className="dms-section-card">
              <div className="dms-card-heading">
                <IconUser size={14} />
                <span>Impormasyon ng Aplikante at Proyekto</span>
              </div>
              <div className="dms-info-grid">
                <div className="dms-info-item full">
                  <span className="dms-label">Pamagat ng Proyekto:</span>
                  <strong className="dms-val">{selectedFolder.projectTitle}</strong>
                </div>
                <div className="dms-info-item">
                  <span className="dms-label">Barangay:</span>
                  <span className="dms-val">{selectedFolder.barangay}</span>
                </div>
                <div className="dms-info-item">
                  <span className="dms-label">Uri ng Aplikasyon:</span>
                  <span className="dms-val dms-status-chip">
                    {selectedFolder.serviceType}
                  </span>
                </div>
                {selectedFolder.applicantPhone && (
                  <div className="dms-info-item">
                    <span className="dms-label">Telepono:</span>
                    <span className="dms-val">{selectedFolder.applicantPhone}</span>
                  </div>
                )}
                {selectedFolder.applicantEmail && (
                  <div className="dms-info-item">
                    <span className="dms-label">Email:</span>
                    <span className="dms-val">{selectedFolder.applicantEmail}</span>
                  </div>
                )}
                {selectedFolder.applicantAddress && (
                  <div className="dms-info-item full">
                    <span className="dms-label">Tirahan / Lokasyon:</span>
                    <span className="dms-val">{selectedFolder.applicantAddress}</span>
                  </div>
                )}
              </div>
            </div>

            {/* List of All Approved Documents for this Applicant */}
            <div className="dms-section-card">
              <div className="dms-card-heading">
                <IconFolder size={14} />
                <span>Mga Aprubadong Dokumento sa Folder ({selectedFolder.documents.length})</span>
              </div>
              <div className="dms-doc-collection-list">
                {selectedFolder.documents.map((doc, idx) => {
                  const isPreviewing = activePreviewDocId === doc.id;
                  const isImage = /\.(png|jpe?g|webp|jfif|gif)$/i.test(doc.fileName || doc.fileUrl);
                  return (
                    <div key={doc.id} className="dms-doc-item-card">
                      <div className="dms-doc-item-header">
                        <div
                          className="dms-doc-item-title-wrap"
                          onClick={() => openDocPreview(doc)}
                          style={{ cursor: "pointer" }}
                          title="I-click upang suriin sa built-in viewer"
                        >
                          <span className="dms-doc-num">#{idx + 1}</span>
                          <div>
                            <strong className="dms-doc-item-title">{doc.docTitle}</strong>
                            <div className="dms-doc-item-file">
                              {doc.fileName}
                              {doc.fileSize ? ` · ${formatBytes(doc.fileSize)}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="dms-doc-item-actions">
                          <button
                            type="button"
                            className="dms-btn-download"
                            onClick={() => openDocPreview(doc)}
                            title="Suriin ang dokumento rito sa system nang walang bagong tab"
                          >
                            <IconEye size={12} />
                            Suriin
                          </button>
                          <button
                            type="button"
                            className="dms-btn-preview-toggle"
                            onClick={() => void downloadFileViaBlob(fileHref(doc.fileUrl), doc.fileName || `${doc.docTitle}.pdf`)}
                            title="I-download ang file nang diretso nang walang bagong tab"
                          >
                            <IconDownload size={12} />
                            Download
                          </button>
                        </div>
                      </div>

                      {/* Inline Image Preview if Toggled */}
                      {isPreviewing && isImage && (
                        <div className="dms-img-preview-wrap">
                          <img
                            src={fileHref(doc.fileUrl)}
                            alt={doc.docTitle}
                            className="dms-img-preview"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Link back to Zoning Permits */}
            {onNavigate && (
              <div className="dms-action-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="dms-btn dms-btn-nav-review"
                  onClick={() => onNavigate("permits")}
                  title="Pumunta sa Zoning Permits & Talaan ng Aplikasyon"
                >
                  Buksan sa Talaan ng Aplikasyon (Zoning Review) →
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
        </div>
      </div>

      {/* In-System Document & Media Viewer Modal (Zero new tabs) */}
      <InSystemDocModal media={previewMedia} onClose={() => setPreviewMedia(null)} />

      {/* Document Backup & Disaster Recovery Modal */}
      {isBackupModalOpen && (
        <div
          className="dms-modal-backdrop"
          onClick={() => !isBackingUp && setIsBackupModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="dms-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dms-modal-header">
              <div className="dms-modal-header-text">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <IconShieldLock size={20} />
                  <h2>Disaster Recovery & Document Backup</h2>
                </div>
                <p>
                  Bayan ng Luisiana · Opisyal na Archiving at Backup ng Lahat ng Naaprubahang Dokumento
                </p>
              </div>
              <button
                type="button"
                className="dms-modal-close-btn"
                onClick={() => !isBackingUp && setIsBackupModalOpen(false)}
                disabled={isBackingUp}
                aria-label="Isara"
              >
                ×
              </button>
            </div>

            <div className="dms-modal-tabs">
              <button
                type="button"
                className={`dms-modal-tab-btn ${activeTabBackup === "create" ? "active" : ""}`}
                onClick={() => setActiveTabBackup("create")}
              >
                Gumawa ng Backup (ZIP Archive)
              </button>
              <button
                type="button"
                className={`dms-modal-tab-btn ${activeTabBackup === "history" ? "active" : ""}`}
                onClick={() => setActiveTabBackup("history")}
              >
                Kasaysayan ng Backup ({backupHistory.length})
              </button>
            </div>

            <div className="dms-modal-body">
              {activeTabBackup === "create" ? (
                <>
                  <div className="dms-modal-stats-grid">
                    <div className="dms-modal-stat-card">
                      <div className="dms-modal-stat-val">
                        {backupScope === "filtered" ? filtered.length : folders.length}
                      </div>
                      <div className="dms-modal-stat-lbl">Mga Aplikante</div>
                    </div>
                    <div className="dms-modal-stat-card">
                      <div className="dms-modal-stat-val" style={{ color: "var(--apple-safe, #16a34a)" }}>
                        {backupScope === "filtered" ? filteredDocsCount : totalApprovedDocsCount}
                      </div>
                      <div className="dms-modal-stat-lbl">Naaprubahang Files</div>
                    </div>
                    <div className="dms-modal-stat-card">
                      <div className="dms-modal-stat-val" style={{ color: "var(--apple-accent, #0284c7)" }}>
                        {new Set((backupScope === "filtered" ? filtered : folders).map((f) => f.barangay)).size}
                      </div>
                      <div className="dms-modal-stat-lbl">Mga Barangay</div>
                    </div>
                  </div>

                  {/* Scope Selector */}
                  <div className="dms-scope-picker">
                    <span className="dms-scope-label">Pumili ng Saklaw ng Backup:</span>
                    <label
                      className={`dms-scope-option ${backupScope === "all" ? "selected" : ""}`}
                      onClick={() => !isBackingUp && setBackupScope("all")}
                    >
                      <input
                        type="radio"
                        name="backupScope"
                        checked={backupScope === "all"}
                        onChange={() => setBackupScope("all")}
                        disabled={isBackingUp}
                      />
                      <div>
                        <div className="dms-scope-title">
                          Lahat ng Naaprubahang Dokumento ({folders.length} Aplikante · {totalApprovedDocsCount} Dokumento)
                        </div>
                        <div className="dms-scope-desc">
                          Kumpletong municipal archive ng lahat ng opisyal na naaprubahang aplikasyon sa buong Bayan ng Luisiana.
                        </div>
                      </div>
                    </label>

                    {(search || filterBarangay || filterType || filterYear !== "") && (
                      <label
                        className={`dms-scope-option ${backupScope === "filtered" ? "selected" : ""}`}
                        onClick={() => !isBackingUp && setBackupScope("filtered")}
                      >
                        <input
                          type="radio"
                          name="backupScope"
                          checked={backupScope === "filtered"}
                          onChange={() => setBackupScope("filtered")}
                          disabled={isBackingUp}
                        />
                        <div>
                          <div className="dms-scope-title">
                            Kasalukuyang Naka-filter Lamang ({filtered.length} Aplikante · {filteredDocsCount} Dokumento)
                          </div>
                          <div className="dms-scope-desc">
                            Isasama lamang ang mga rekord na tumutugma sa iyong aktibong pagsala (Barangay, Taon, o Uri ng Dokumento).
                          </div>
                        </div>
                      </label>
                    )}
                  </div>

                  {/* Backup Inclusions Info */}
                  <div className="dms-inclusions-card">
                    <div className="dms-inclusions-title">
                      <IconCheckBadge size={14} />
                      <span>Kasama sa Bawat ZIP Archive:</span>
                    </div>
                    <ul className="dms-inclusions-list">
                      <li><strong>Mga Direktoryo Bawat Aplikante:</strong> Naka-grupo sa mga folder na may tracking number at buong pangalan.</li>
                      <li><strong>Lahat ng Dokumento:</strong> TCT Land Titles, Tax Declarations, Amilyar, Brgy Clearances, Meralco PLO, atbp.</li>
                      <li><strong>Offline Verification Report (HTML):</strong> Standalone na webpage para sa offline na pagsusuri at pag-print kahit walang internet.</li>
                      <li><strong>Cryptographic Master Manifest (JSON):</strong> Talaan na may SHA-256 data integrity checksum para sa audit compliance.</li>
                    </ul>
                  </div>

                  {/* Active Progress */}
                  {isBackingUp && backupProgress && (
                    <div className="dms-progress-card">
                      <div className="dms-progress-header">
                        <span className="dms-progress-stage">
                          <IconRefresh size={14} spinning={true} />
                          {backupProgress.stage === "fetching"
                            ? "Kinukuha ang mga Files…"
                            : backupProgress.stage === "compressing"
                            ? "Ikinokompres sa ZIP…"
                            : "Tinatapos…"}
                        </span>
                        <span className="dms-progress-pct">{backupProgress.percent}%</span>
                      </div>
                      <div className="dms-progress-bar-track">
                        <div
                          className="dms-progress-bar-fill"
                          style={{ width: `${Math.max(5, backupProgress.percent)}%` }}
                        />
                      </div>
                      <div className="dms-progress-status-text" title={backupProgress.statusText}>
                        {backupProgress.statusText}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="dms-history-wrap">
                  {backupHistory.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px 10px", color: "var(--apple-text-secondary)" }}>
                      <p>Wala pang naitatalang nakaraang backup sa system na ito.</p>
                    </div>
                  ) : (
                    backupHistory.map((rec) => (
                      <div key={rec.id} className="dms-history-item">
                        <div>
                          <div className="dms-history-file-title">{rec.filename}</div>
                          <div className="dms-history-meta">
                            <span>Petsa: <strong>{formatWhen(rec.createdAt)}</strong></span>
                            <span>Inilabas ni: <strong>{rec.createdBy}</strong></span>
                            <span>{rec.applicantCount} Aplikante · {rec.documentCount} Files</span>
                            <span>Laki: <strong>{formatBackupBytes(rec.totalBytes)}</strong></span>
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <span className="dms-history-hash">SHA-256: {rec.checksumSha256.slice(0, 16)}…</span>
                          </div>
                        </div>
                        <div>
                          <span className="dms-history-badge">
                            ✓ Nai-save
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="dms-modal-footer">
              {isBackingUp ? (
                <button
                  type="button"
                  className="dms-btn-modal-cancel"
                  onClick={handleCancelBackup}
                >
                  Itigil / Kanselahin
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="dms-btn-modal-cancel"
                    onClick={() => setIsBackupModalOpen(false)}
                  >
                    Isara
                  </button>
                  {activeTabBackup === "create" && (
                    <button
                      type="button"
                      className="dms-btn-modal-primary"
                      onClick={() => void handleStartBackup()}
                      disabled={(backupScope === "filtered" ? filtered.length : folders.length) === 0}
                    >
                      <IconDownload size={14} />
                      Simulan ang Pag-download ng ZIP Backup
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {backupToast && (
        <aside className={`dms-toast-notice ${backupToast.type}`} role="alert" aria-live="polite">
          <div className="dms-toast-content">
            <strong>{backupToast.type === "success" ? "✓ Matagumpay ang Backup" : "⚠️ Paunawa sa Backup"}</strong>
            <span>{backupToast.text}</span>
          </div>
          <button
            type="button"
            className="dms-toast-close"
            onClick={() => setBackupToast(null)}
            aria-label="Isara ang paunawa"
          >
            ×
          </button>
        </aside>
      )}
    </div>
  );
}
