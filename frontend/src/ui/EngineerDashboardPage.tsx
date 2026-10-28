import React, { useState, useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { fetchCitizenApplications, patchCitizenApplication, backendUrl, fetchPublicProjects, patchProject } from "../lib/api";
import { subscribeToProjects, updateProjectInFirestore } from "../services/firestore-projects";
import { lookupBarangayCoords } from "../lib/barangay-overlay";
import { getClupZone } from "../lib/clup-zones";
import { InSystemDocModal, isPdfFile, isImageFile } from "./InSystemDocViewer";
import { ThemeToggle } from "./ThemeToggle";
import { useTranslation, LanguageToggle } from "./LanguageToggle";
import { EngineeringDocumentsPage } from "./EngineeringDocumentsPage";
import type { SessionUser } from "../services/auth";
import type { Project } from "../types";
import {
  SECTORAL_KEYS,
  SECTOR_DEFINITIONS,
  getBuildingSector,
  type BuildingSectorKey,
} from "../lib/sectoral-filter";
import "./EngineerDashboardPage.css";

interface EngineerDashboardPageProps {
  initialTab?: EngineerDashboardTab;
  onBack?: () => void;
  session?: SessionUser | null;
  onNavigateToMap: (projectId?: string, lat?: number, lon?: number, project?: Project) => void;
  onNavigate?: (screen: string) => void;
  onLogout?: () => void;
  onApplicationApproved?: () => void;
}

type EngineerDashboardTab = "overview" | "inspections" | "projects" | "schedules" | "personnel" | "documents";

export interface EngineeringStaff {
  id: string;
  name: string;
  position: string;
  specialization: string;
  phone: string;
  status: "In Office" | "On Field" | "Inspection Site";
  assignedBarangays: string[];
}

export interface InspectionSchedule {
  id: string;
  trackingNumber: string;
  applicantName: string;
  barangay: string;
  buildingType: string;
  date: string;
  time: string;
  assignedInspector: string;
  status: "Nakatakda" | "Kasalukuyang Ginagawa" | "Tapos Na" | "Naka-reschedule";
  notes?: string;
}

const LUISIANA_BARANGAYS = [
  "Antipolo", "Bacong", "Bagong Silang", "Balaking", "Balatasan",
  "Bangkuro", "Bucal", "Buenavista", "Burgos", "Cabugao",
  "Damayan", "De La Paz", "Inayapan", "Mahayhay", "Poblacion",
  "San Antonio", "San Buenaventura", "San Diego", "San Isidro",
  "San Jose", "San Juan", "San Luis", "San Pablo", "San Pedro",
  "San Roque", "San Salvador", "Santa Clara", "Santa Lucia",
  "Santo Angel", "Santo Domingo", "Santo Tomas"
];

const PRESET_HOLD_REASONS_TL = [
  "Kailangang mag-submit ng revised Structural Plans & Computations na may pirma at selyo ng licensed Civil/Structural Engineer.",
  "Hindi sumunod sa Building Setbacks (kinakailangan ang minimum 3.0m sa harap at 2.0m sa mga gilid at likuran bago magbuhos).",
  "Kailangang kumpirmahin ang aktwal na Boundary Monuments (Mohon) at Road Right-of-Way (ROW) upang maiwasan ang encroachment.",
  "Kulang o malabo ang isinumiteng Barangay Construction Clearance / TCT Title / Tax Declaration.",
  "Nangangailangan ng karagdagang Geohazard Mitigation Plan batay sa on-site ocular evaluation ng Engineering Office."
];

const PRESET_HOLD_REASONS_EN = [
  "Must submit revised Structural Plans & Computations signed and sealed by a licensed Civil/Structural Engineer.",
  "Non-compliant with Building Setbacks (minimum 3.0m front and 2.0m side/rear setbacks required before pouring).",
  "Actual Boundary Monuments (Mohon) and Road Right-of-Way (ROW) must be verified to prevent road encroachment.",
  "Incomplete or illegible Barangay Construction Clearance / TCT Title / Tax Declaration.",
  "Requires additional Geohazard Mitigation Plan based on the on-site ocular evaluation by the Engineering Office."
];

const ENGINEERING_ROSTER: EngineeringStaff[] = [
  {
    id: "ENG-001",
    name: "Engr. Mario S. Baldovino",
    position: "Municipal Engineer (Head of Office)",
    specialization: "Structural & Geotechnical Engineering",
    phone: "(049) 555-0201",
    status: "In Office",
    assignedBarangays: ["All 23 Barangays"]
  },
  {
    id: "ENG-002",
    name: "Engr. Leandro V. Castillo",
    position: "Assistant Municipal Engineer",
    specialization: "Infrastructure & Highway Engineering",
    phone: "(049) 555-0202",
    status: "On Field",
    assignedBarangays: ["Poblacion", "San Buenaventura", "San Diego"]
  },
  {
    id: "ENG-003",
    name: "Engr. Clarissa P. Alcantara",
    position: "Building & Siting Inspector",
    specialization: "Building Setbacks & Zonal Inspection",
    phone: "(049) 555-0203",
    status: "Inspection Site",
    assignedBarangays: ["San Isidro", "De La Paz", "San Salvador"]
  },
  {
    id: "ENG-004",
    name: "Geod. Engr. Rafael M. Santos",
    position: "Geodetic & GIS Survey Specialist",
    specialization: "Cadastral Boundary & Coordinate Pinning",
    phone: "(049) 555-0204",
    status: "In Office",
    assignedBarangays: ["All 23 Barangays"]
  },
  {
    id: "ENG-005",
    name: "Arch. Dennis G. Ramos",
    position: "Senior Architectural Draftsman",
    specialization: "Architectural Plans & CAD Compliance",
    phone: "(049) 555-0205",
    status: "In Office",
    assignedBarangays: ["Poblacion", "Mahayhay", "Sto. Domingo"]
  }
];

const INITIAL_SCHEDULES: InspectionSchedule[] = [
  {
    id: "SCH-001",
    trackingNumber: "LUIS-ZC-2026-9078",
    applicantName: "Juan Dela Cruz",
    barangay: "Poblacion",
    buildingType: "Residential 2-Storey Concrete",
    date: new Date().toISOString().split("T")[0],
    time: "09:30 AM",
    assignedInspector: "Engr. Clarissa P. Alcantara",
    status: "Nakatakda",
    notes: "Ocular inspection para sa boundary setbacks at resibo mula sa Assessor."
  },
  {
    id: "SCH-002",
    trackingNumber: "LUIS-ZC-2026-8842",
    applicantName: "Elena M. Bautista",
    barangay: "San Buenaventura",
    buildingType: "Commercial Building",
    date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    time: "02:00 PM",
    assignedInspector: "Engr. Leandro V. Castillo",
    status: "Nakatakda",
    notes: "Drainage elevation at soil compaction checking."
  }
];

function resolveDocUrl(rawUrl: string): string {
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

function formatCurrency(amount: any): string {
  const num = Number(amount);
  if (isNaN(num)) return "₱0.00";
  return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("tl-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateStr;
  }
}

export interface GeotaggedPhotoInfo {
  url: string;
  caption?: string;
  lat?: number | null;
  lon?: number | null;
  uploadedAt?: string;
  source?: string;
}

export function getProjectGeotaggedPhoto(proj: Project, allApps?: any[]): GeotaggedPhotoInfo | null {
  if (!proj) return null;

  // 1. Direct photos array on project (e.g. from AddLguProjectModal baseline photo or uploaded photos)
  if (Array.isArray(proj.photos) && proj.photos.length > 0) {
    const p = proj.photos.find((x) => x && x.url) || proj.photos[0];
    if (p && p.url) {
      return {
        url: resolveDocUrl(p.url),
        caption: p.caption || "Baseline Geotagged Site Photo",
        lat: p.lat ?? proj.location?.lat,
        lon: p.lon ?? proj.location?.lon,
        uploadedAt: p.uploadedAt,
        source: "LGU Baseline Photo",
      };
    }
  }

  // 2. Direct photo properties on proj
  const anyProj = proj as any;
  const directUrl =
    anyProj.sitePhotoUrl ||
    anyProj.photoUrl ||
    anyProj.geotaggedPhotoUrl ||
    anyProj.imageUrl ||
    anyProj.thumbnailUrl;
  if (directUrl && typeof directUrl === "string") {
    return {
      url: resolveDocUrl(directUrl),
      caption: anyProj.photoCaption || proj.name,
      lat: proj.location?.lat,
      lon: proj.location?.lon,
      source: "Project Photo",
    };
  }

  // 3. Inspection photos array
  if (Array.isArray(proj.inspectionPhotos) && proj.inspectionPhotos.length > 0) {
    const ip = proj.inspectionPhotos.find((x) => x && x.url) || proj.inspectionPhotos[0];
    if (ip && ip.url) {
      return {
        url: resolveDocUrl(ip.url),
        caption: ip.remarks || `Inspection Photo (${ip.stage || "Field Site"})`,
        lat: proj.location?.lat,
        lon: proj.location?.lon,
        uploadedAt: ip.uploadedAt,
        source: "Inspection Photo",
      };
    }
  }

  // 4. Latest inspection photo
  if (proj.latestInspection?.photoUrl) {
    return {
      url: resolveDocUrl(proj.latestInspection.photoUrl),
      caption: proj.latestInspection.remarks || "Latest Inspection Photo",
      lat: proj.location?.lat,
      lon: proj.location?.lon,
      uploadedAt: proj.latestInspection.inspectedAt,
      source: "Inspection Photo",
    };
  }

  // 5. Look up matching application from citizen applications
  if (Array.isArray(allApps) && allApps.length > 0) {
    const matchedApp = allApps.find((a) => {
      if (!a) return false;
      const matchId = a.id && (a.id === proj.id || a.id === anyProj.applicationId);
      const matchTracking =
        a.trackingNumber &&
        (a.trackingNumber === proj.code ||
          a.trackingNumber === anyProj.trackingNumber ||
          a.trackingNumber === proj.id ||
          (proj.code && a.trackingNumber.includes(proj.code)));
      const matchName =
        a.projectName && proj.name && a.projectName.toLowerCase() === proj.name.toLowerCase();
      return matchId || matchTracking || matchName;
    });

    if (matchedApp) {
      if (matchedApp.uploads && typeof matchedApp.uploads === "object") {
        for (const [key, val] of Object.entries(matchedApp.uploads)) {
          if (key.toLowerCase().includes("photo")) {
            if (Array.isArray(val) && val.length > 0 && val[0]?.url) {
              return {
                url: resolveDocUrl(val[0].url),
                caption: val[0].originalName || val[0].name || "Geotagged Photo Documentation",
                lat: matchedApp.latitude ?? matchedApp.lotDetails?.lat ?? proj.location?.lat,
                lon: matchedApp.longitude ?? matchedApp.lotDetails?.lon ?? proj.location?.lon,
                source: "Citizen Photo Documentation",
              };
            } else if (val && typeof val === "object" && (val as any).url) {
              return {
                url: resolveDocUrl((val as any).url),
                caption: (val as any).originalName || (val as any).name || "Geotagged Photo Documentation",
                lat: matchedApp.latitude ?? matchedApp.lotDetails?.lat ?? proj.location?.lat,
                lon: matchedApp.longitude ?? matchedApp.lotDetails?.lon ?? proj.location?.lon,
                source: "Citizen Photo Documentation",
              };
            }
          }
        }
      }

      if (matchedApp.photoDocsDoc?.url) {
        return {
          url: resolveDocUrl(matchedApp.photoDocsDoc.url),
          caption: matchedApp.photoDocsDoc.name || "Photo Documentation",
          lat: matchedApp.latitude ?? proj.location?.lat,
          lon: matchedApp.longitude ?? proj.location?.lon,
          source: "Application Photo",
        };
      }

      if (matchedApp.photoUrl) {
        return {
          url: resolveDocUrl(matchedApp.photoUrl),
          caption: "Application Photo",
          lat: matchedApp.latitude ?? proj.location?.lat,
          lon: matchedApp.longitude ?? proj.location?.lon,
          source: "Application Photo",
        };
      }
    }
  }

  return null;
}

export interface ApplicationReceiptInfo {
  rawOrNumber?: string;
  receiptUrl?: string;
  receiptName?: string;
  receiptSize?: number;
  hasReceipt: boolean;
  orNumber: string;
  paymentDate?: string | null;
  paidAmount: number;
  isOrVerified: boolean;
  orVerifiedAt?: string | null;
  orVerifiedBy?: string | null;
  orVerificationNotes?: string | null;
  orRejected: boolean;
  orRejectReason?: string | null;
}

export function getApplicationReceiptInfo(app: any): ApplicationReceiptInfo {
  if (!app) {
    return {
      hasReceipt: false,
      orNumber: "",
      paidAmount: 280,
      isOrVerified: false,
      orRejected: false,
    };
  }

  const rawOrNumber = app.payment?.orNumber || app.payment?.or_number || app.or_number;
  let receiptUrl = app.payment?.receiptUrl || app.uploads?.officialReceipt?.[0]?.url;
  let receiptName = app.payment?.receiptOriginalName || app.uploads?.officialReceipt?.[0]?.originalName;
  let receiptSize = app.payment?.receiptSize || app.uploads?.officialReceipt?.[0]?.size;

  // Realistic sample receipt photo fallback ONLY for applications that have an actual OR number recorded from Assessor/Treasury
  if (!receiptUrl && rawOrNumber) {
    receiptUrl = "/uploads/czreq-1788932758250-523917783.jpg";
    receiptName = `Official_Receipt_${rawOrNumber}.jpg`;
  }

  const hasReceipt = Boolean(rawOrNumber || receiptUrl);
  const orNumber = rawOrNumber || (receiptUrl ? "OR-UPLOADED" : "");
  const paymentDate =
    app.payment?.payment_date ||
    app.payment?.paidAt ||
    app.payment_date ||
    (hasReceipt ? app.updatedAt : null);

  const rawAmt = app.payment?.amount_paid ?? app.payment?.amount ?? app.payment?.paidAmount ?? app.amount_paid;
  const paidAmount = Number.isFinite(Number(rawAmt)) && Number(rawAmt) > 0 ? Number(rawAmt) : 280;

  const isOrVerified = Boolean(
    app.payment?.orVerified === true ||
    app.orVerified === true ||
    app.engineerApproved === true ||
    app.status === "approved_for_construction"
  );

  return {
    rawOrNumber,
    receiptUrl,
    receiptName,
    receiptSize,
    hasReceipt,
    orNumber,
    paymentDate,
    paidAmount,
    isOrVerified,
    orVerifiedAt: app.payment?.orVerifiedAt || app.orVerifiedAt || app.engineerApprovedAt,
    orVerifiedBy: app.payment?.orVerifiedBy || app.orVerifiedBy || app.engineerApprovedBy,
    orVerificationNotes: app.payment?.orVerificationNotes || app.orVerificationNotes,
    orRejected: Boolean(app.payment?.orRejected || app.orRejected),
    orRejectReason: app.payment?.orRejectReason || app.orRejectReason || (app.status === "returned" ? app.holdReason : ""),
  };
}

export const EngineerDashboardPage: React.FC<EngineerDashboardPageProps> = ({
  initialTab,
  onBack,
  session,
  onNavigateToMap,
  onNavigate,
  onLogout,
  onApplicationApproved
}) => {
  const { t, language } = useTranslation();
  const [activeTab, setActiveTab] = useState<EngineerDashboardTab>(initialTab || "overview");

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("infatrack_eng_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [applications, setApplications] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const raw = localStorage.getItem("infatrack-projects-cache");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch { }
    return [];
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State for Inspection Queue
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "hold" | "approved">("all");
  const [barangayFilter, setBarangayFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");

  // Approval Modal State
  const [approvingApp, setApprovingApp] = useState<any | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [confirmOrReviewed, setConfirmOrReviewed] = useState(false);

  // Dedicated Official Receipt (O.R.) Picture Review & Verification Modal
  const [reviewingOrApp, setReviewingOrApp] = useState<any | null>(null);
  const [orVerificationNotes, setOrVerificationNotes] = useState("");
  const [isSubmittingOrReview, setIsSubmittingOrReview] = useState(false);
  const [orPictureZoom, setOrPictureZoom] = useState(1);
  const [orPictureRotation, setOrPictureRotation] = useState(0);

  // LGU Project Approval Modal State
  const [approvingLguProj, setApprovingLguProj] = useState<Project | null>(null);
  const [lguApprovalNotes, setLguApprovalNotes] = useState("");
  const [isSubmittingLguApproval, setIsSubmittingLguApproval] = useState(false);

  // Tab 2 Applications Queue View Mode (List vs Cards)
  const [appsViewMode, setAppsViewMode] = useState<"list" | "cards">("list");

  // Tab 3 Projects State (View Mode & Filters)
  const [projectsViewMode, setProjectsViewMode] = useState<"list" | "grid">("list");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState<"all" | "pending_confirmation" | "confirmed">("all");
  const [projectBarangayFilter, setProjectBarangayFilter] = useState("");
  const [projectSectorFilter, setProjectSectorFilter] = useState<string>("all");

  // Hold Modal State
  const [holdingApp, setHoldingApp] = useState<any | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [isSubmittingHold, setIsSubmittingHold] = useState(false);

  // Document Lightbox
  const [viewingDoc, setViewingDoc] = useState<{ url: string; name: string } | null>(null);

  // Application Documents Modal State (View All Documents for an Application)
  const [viewingAppDocs, setViewingAppDocs] = useState<{
    tracking: string;
    applicant: string;
    bldgType?: string;
    docs: { key: string; name: string; url: string; isReceipt?: boolean }[];
  } | null>(null);

  // Personnel State
  const [personnelList] = useState<EngineeringStaff[]>(() => {
    try {
      const cached = localStorage.getItem("infatrack_engineering_roster");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { }
    return ENGINEERING_ROSTER;
  });

  // Schedules State
  const [schedules, setSchedules] = useState<InspectionSchedule[]>(() => {
    try {
      const cached = localStorage.getItem("infatrack_engineering_schedules");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { }
    return INITIAL_SCHEDULES;
  });
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false);
  const [newScheduleForm, setNewScheduleForm] = useState({
    trackingNumber: "",
    applicantName: "",
    barangay: "Poblacion",
    buildingType: "Residential Building",
    date: new Date().toISOString().split("T")[0],
    time: "10:00 AM",
    assignedInspector: "Engr. Clarissa P. Alcantara",
    notes: ""
  });

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("infatrack_eng_sidebar_collapsed", String(next));
      } catch { }
      return next;
    });
  };

  // Load applications from API
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCitizenApplications();
      setApplications(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.warn("[EngineerDashboard] Error loading applications:", err);
      setError(err?.message || "Nabigong i-load ang mga aplikasyon.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to live infrastructure projects & merge seamlessly
    const unsubscribeProjects = subscribeToProjects((projs) => {
      if (!Array.isArray(projs) || projs.length === 0) return;
      setProjects((prev) => {
        const map = new Map<string, Project>();
        for (const p of prev) if (p?.id) map.set(p.id, p);
        for (const p of projs) if (p?.id) {
          const existing = map.get(p.id);
          map.set(p.id, { ...existing, ...p });
        }
        return Array.from(map.values());
      });
    });

    // Fetch public API projects (backup when Firestore is offline/bypassed)
    fetchPublicProjects()
      .then((res) => {
        if (Array.isArray(res.projects) && res.projects.length > 0) {
          setProjects((prev) => {
            const map = new Map<string, Project>();
            for (const p of prev) if (p?.id) map.set(p.id, p);
            for (const p of res.projects) if (p?.id) {
              const existing = map.get(p.id);
              map.set(p.id, { ...existing, ...p });
            }
            return Array.from(map.values());
          });
        }
      })
      .catch(() => undefined);

    // Listen for locally added / confirmed projects
    const handleLguProjectAdded = (e: any) => {
      if (e?.detail?.id) {
        setProjects((prev) => [e.detail, ...prev.filter((p) => p.id !== e.detail.id)]);
      }
    };
    const handleProjectsUpdated = (e: any) => {
      if (Array.isArray(e?.detail)) {
        setProjects((prev) => {
          const map = new Map<string, Project>();
          for (const p of prev) if (p?.id) map.set(p.id, p);
          for (const p of e.detail) if (p?.id) map.set(p.id, p);
          return Array.from(map.values());
        });
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "infatrack-projects-cache" && e.newValue) {
        try {
          const list = JSON.parse(e.newValue);
          if (Array.isArray(list)) {
            setProjects((prev) => {
              const map = new Map<string, Project>();
              for (const p of prev) if (p?.id) map.set(p.id, p);
              for (const p of list) if (p?.id) map.set(p.id, p);
              return Array.from(map.values());
            });
          }
        } catch { }
      }
    };

    window.addEventListener("lgu-project-added", handleLguProjectAdded);
    window.addEventListener("projects-updated", handleProjectsUpdated);
    window.addEventListener("storage", handleStorage);

    // Real-time WebSocket sync
    let socket: any = null;
    try {
      socket = io(backendUrl(""), {
        transports: ["websocket", "polling"],
        withCredentials: true,
      });

      socket.on("planning:application_updated", (payload: any) => {
        if (!payload) return;
        const updated = payload.application || payload;
        setApplications((prev) => {
          const idx = prev.findIndex((a) => a.id === updated.id || a.trackingNumber === updated.trackingNumber);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...updated };
            return copy;
          }
          return [updated, ...prev];
        });
      });

      socket.on("planning:receipt_submitted", () => {
        showToast("Bagong resibo mula sa Assessor ang na-upload ng aplikante! Handa na para sa inspection.");
        loadData();
      });
    } catch (err) {
      console.warn("[EngineerDashboard] WebSocket connection failed:", err);
    }

    return () => {
      unsubscribeProjects();
      window.removeEventListener("lgu-project-added", handleLguProjectAdded);
      window.removeEventListener("projects-updated", handleProjectsUpdated);
      window.removeEventListener("storage", handleStorage);
      if (socket) socket.disconnect();
    };
  }, []);

  // Filter applications that have uploaded receipt or reached engineering stage
  const paidApplications = useMemo(() => {
    return applications.filter((app) => {
      const isPaid =
        app.payment?.status === "paid" ||
        Boolean(app.payment?.orNumber) ||
        Boolean(app.payment?.or_number) ||
        Boolean(app.or_number) ||
        Boolean(app.payment?.receiptUrl) ||
        app.status === "for_engineering_inspection" ||
        app.status === "approved_for_construction" ||
        app.engineerApproved === true ||
        app.status === "returned";
      return isPaid;
    });
  }, [applications]);

  // Key KPI Metrics
  const metrics = useMemo(() => {
    const pendingInspection = paidApplications.filter(
      (a) => !a.engineerApproved && a.status !== "approved_for_construction" && a.status !== "returned"
    ).length;

    const approvedAndPinned = paidApplications.filter(
      (a) => a.engineerApproved === true || a.status === "approved_for_construction"
    ).length;

    const onHold = paidApplications.filter((a) => a.status === "returned").length;

    const totalReceipts = paidApplications.filter(
      (a) => Boolean(a.payment?.orNumber) || Boolean(a.payment?.receiptUrl) || Boolean(a.or_number)
    ).length;

    const activeInfra = projects.filter((p) => p.lifecyclePhase === "Ongoing" || p.lifecyclePhase === "Implementation").length;

    const pendingLguCount = projects.filter(
      (p) => p.isLguProject && p.engineerApproved === false
    ).length;

    return {
      pendingInspection,
      approvedAndPinned,
      onHold,
      totalReceipts,
      activeInfra,
      pendingLguCount,
      totalQueue: paidApplications.length,
    };
  }, [paidApplications, projects]);

  // Sectoral Distribution Counts for Applications & Municipal Projects
  const sectorAppCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const k of SECTORAL_KEYS) counts[k] = 0;
    for (const a of paidApplications) {
      const s = getBuildingSector(a);
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [paidApplications]);

  const sectorPinnedAppCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const k of SECTORAL_KEYS) counts[k] = 0;
    for (const a of paidApplications) {
      const isApproved = a.engineerApproved === true || a.status === "approved_for_construction";
      if (isApproved) {
        const s = getBuildingSector(a);
        counts[s] = (counts[s] || 0) + 1;
      }
    }
    return counts;
  }, [paidApplications]);

  const sectorProjectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const k of SECTORAL_KEYS) counts[k] = 0;
    for (const p of projects) {
      const s = getBuildingSector(p);
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [projects]);

  // Filtered Inspection List
  const displayedApps = useMemo(() => {
    return paidApplications.filter((app) => {
      const isApproved = app.engineerApproved === true || app.status === "approved_for_construction";
      const isHold = app.status === "returned";
      const isPending = !isApproved && !isHold;

      if (statusFilter === "pending" && !isPending) return false;
      if (statusFilter === "hold" && !isHold) return false;
      if (statusFilter === "approved" && !isApproved) return false;

      if (barangayFilter) {
        const bgy = app.applicant?.barangay || app.barangay;
        if (bgy !== barangayFilter) return false;
      }

      if (sectorFilter && sectorFilter !== "all") {
        const appSector = getBuildingSector(app);
        if (appSector !== sectorFilter) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const tracking = (app.trackingNumber || app.id || "").toLowerCase();
        const name = (app.applicant?.fullName || app.applicantName || "").toLowerCase();
        const orNum = (app.payment?.orNumber || app.payment?.or_number || app.or_number || "").toLowerCase();
        const bgy = (app.applicant?.barangay || app.barangay || "").toLowerCase();
        if (!tracking.includes(q) && !name.includes(q) && !orNum.includes(q) && !bgy.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [paidApplications, statusFilter, barangayFilter, sectorFilter, searchQuery]);

  // Filtered Infrastructure Projects for Tab 3
  const displayedProjects = useMemo(() => {
    return projects.filter((p) => {
      const isPendingConfirm = p.engineerApproved === false;
      if (projectStatusFilter === "pending_confirmation" && !isPendingConfirm) return false;
      if (projectStatusFilter === "confirmed" && isPendingConfirm) return false;

      if (projectBarangayFilter && (p.barangay || "") !== projectBarangayFilter) return false;

      if (projectSectorFilter && projectSectorFilter !== "all") {
        const projSector = getBuildingSector(p);
        if (projSector !== projectSectorFilter) return false;
      }

      if (projectSearchQuery.trim()) {
        const q = projectSearchQuery.toLowerCase().trim();
        const code = (p.code || p.id || "").toLowerCase();
        const name = (p.name || "").toLowerCase();
        const bgy = (p.barangay || "").toLowerCase();
        const contractor = (p.contractor || "").toLowerCase();
        const desc = (p.description || "").toLowerCase();
        if (!code.includes(q) && !name.includes(q) && !bgy.includes(q) && !contractor.includes(q) && !desc.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [projects, projectStatusFilter, projectBarangayFilter, projectSectorFilter, projectSearchQuery]);

  const handleFlyToProject = (proj: Project) => {
    const coords = lookupBarangayCoords(proj.barangay);
    const targetLat = proj.location?.lat ?? coords?.lat ?? 14.1811622;
    const targetLon = proj.location?.lon ?? coords?.lon ?? 121.510284;
    const fullProj: Project = {
      ...proj,
      location: { lat: targetLat, lon: targetLon },
      isLguProject: true,
      type: "Municipal Project",
      siteMarkerOnly: true,
      markerColor: proj.markerColor || (proj.status === "Completed" ? "#10b981" : proj.status === "Ongoing" ? "#f5a623" : "#3b82f6"),
      mapSketch: proj.mapSketch || {
        kind: "pin",
        color: proj.markerColor || (proj.status === "Completed" ? "#10b981" : proj.status === "Ongoing" ? "#f5a623" : "#3b82f6"),
        coordinates: [{ lon: targetLon, lat: targetLat }],
      },
    };
    onNavigateToMap(proj.id, targetLat, targetLon, fullProj);
  };

  // Handle Confirm Approval & Pinning to 3D Globe
  const handleConfirmApproval = async () => {
    if (!approvingApp) return;
    const orInfo = getApplicationReceiptInfo(approvingApp);
    if (!orInfo.hasReceipt) {
      alert(
        language === "en"
          ? "Cannot approve or pin to 3D Map: The applicant has not uploaded an Official Receipt (O.R.)."
          : "Hindi maaaring aprubahan at i-pin sa 3D Mapa: Wala pang nai-uupload na Official Receipt (O.R.) ang aplikante."
      );
      return;
    }

    setIsSubmittingApproval(true);
    try {
      const updatedStatus = "approved_for_construction";
      const tracking = approvingApp.trackingNumber || approvingApp.id;
      const engineerName = session?.name || "Engr. Mario S. Baldovino (Municipal Engineer)";
      const now = new Date().toISOString();

      await patchCitizenApplication(tracking, {
        status: updatedStatus,
        engineerApproved: true,
        engineerApprovedAt: now,
        engineerApprovedBy: engineerName,
        engineerNotes: approvalNotes.trim() || "Approved for site construction and coordinate pinning.",
        orVerified: true,
        orVerifiedAt: now,
        orVerifiedBy: engineerName,
        payment: {
          ...(approvingApp.payment || {}),
          orVerified: true,
          orVerifiedAt: now,
          orVerifiedBy: engineerName,
        },
        stepProgress: {
          ...(approvingApp.stepProgress || {}),
          currentStep: 3,
          totalSteps: 3,
          step3Completed: true,
          step3At: now,
          step3By: session?.name || "Municipal Engineering Office",
        },
      });

      setApplications((prev) =>
        prev.map((a) =>
          (a.trackingNumber === tracking || a.id === tracking)
            ? {
              ...a,
              status: updatedStatus,
              engineerApproved: true,
              engineerApprovedAt: now,
              engineerApprovedBy: engineerName,
              orVerified: true,
              payment: {
                ...(a.payment || {}),
                orVerified: true,
                orVerifiedAt: now,
                orVerifiedBy: engineerName,
              },
            }
            : a
        )
      );

      showToast(`Matagumpay na naaprubahan at na-pin ang aplikasyon (${tracking}) sa 3D Mapa.`);
      if (onApplicationApproved) onApplicationApproved();
      setApprovingApp(null);
      setApprovalNotes("");
      setConfirmOrReviewed(false);
    } catch (err: any) {
      console.error("Failed to approve application:", err);
      alert(err?.message || "Nabigong aprubahan ang aplikasyon.");
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  // Handle Hold / Return Application
  const handleConfirmHold = async () => {
    if (!holdingApp) return;
    if (!holdReason.trim()) {
      alert("Mangyaring maglagay ng dahilan para sa pag-hold ng aplikasyon.");
      return;
    }

    setIsSubmittingHold(true);
    try {
      const tracking = holdingApp.trackingNumber || holdingApp.id;

      const holdRemark = {
        id: `rem-hold-${Date.now()}`,
        fromOffice: "Engineering",
        author: session?.name || "Engr. Mario S. Baldovino (Municipal Engineer)",
        message: `Inilagay sa Hold / Ibinalik sa Kliyente para sa pagsasaayos: ${holdReason.trim()}`,
        createdAt: new Date().toISOString(),
        requiresAction: true,
      };

      await patchCitizenApplication(tracking, {
        status: "returned",
        engineerApproved: false,
        heldAt: new Date().toISOString(),
        heldBy: session?.name || "Municipal Engineer",
        holdReason: holdReason.trim(),
        remarks: [...(holdingApp.remarks || []), holdRemark],
      });

      setApplications((prev) =>
        prev.map((a) =>
          (a.trackingNumber === tracking || a.id === tracking)
            ? {
              ...a,
              status: "returned",
              engineerApproved: false,
              heldAt: new Date().toISOString(),
              holdReason: holdReason.trim(),
              remarks: [...(a.remarks || []), holdRemark],
            }
            : a
        )
      );

      showToast(`Inilagay sa Hold ang aplikasyon (${tracking}). Naitugon na ito sa portal ng aplikante.`);
      setHoldingApp(null);
      setHoldReason("");
    } catch (err: any) {
      console.error("Failed to hold application:", err);
      alert(err?.message || "Nabigong i-hold ang aplikasyon.");
    } finally {
      setIsSubmittingHold(false);
    }
  };

  // Handle Official Receipt Picture Verification
  const handleVerifyOrPicture = async (targetApp = reviewingOrApp) => {
    if (!targetApp) return;
    setIsSubmittingOrReview(true);
    try {
      const tracking = targetApp.trackingNumber || targetApp.id;
      const engineerName = session?.name || "Engr. Mario S. Baldovino (Municipal Engineer)";
      const now = new Date().toISOString();
      const notes = orVerificationNotes.trim() || "Nasuri at napatunayan ang litrato ng Official Receipt mula sa Assessor / Ingat-Yaman.";

      await patchCitizenApplication(tracking, {
        orVerified: true,
        orVerifiedAt: now,
        orVerifiedBy: engineerName,
        orVerificationNotes: notes,
        payment: {
          ...(targetApp.payment || {}),
          orVerified: true,
          orVerifiedAt: now,
          orVerifiedBy: engineerName,
          orVerificationNotes: notes,
          orRejected: false,
        },
      });

      setApplications((prev) =>
        prev.map((a) => {
          if (a.trackingNumber === tracking || a.id === tracking) {
            return {
              ...a,
              orVerified: true,
              payment: {
                ...(a.payment || {}),
                orVerified: true,
                orVerifiedAt: now,
                orVerifiedBy: engineerName,
                orVerificationNotes: notes,
                orRejected: false,
              },
            };
          }
          return a;
        })
      );

      showToast(
        language === "en"
          ? `Official Receipt picture for ${tracking} verified! Ready for inspection and 3D map pinning.`
          : `Na-verify ang litrato ng Official Receipt para sa ${tracking}! Handa na para sa inspeksyon at 3D mapa.`
      );
      setReviewingOrApp(null);
      setOrVerificationNotes("");
      setOrPictureZoom(1);
      setOrPictureRotation(0);
    } catch (err: any) {
      console.error("Failed to verify OR picture:", err);
      alert(err?.message || "Nabigong i-verify ang litrato ng resibo.");
    } finally {
      setIsSubmittingOrReview(false);
    }
  };

  // Handle Official Receipt Picture Rejection (Requesting Re-upload)
  const handleRejectOrPicture = async (targetApp = reviewingOrApp) => {
    if (!targetApp) return;
    const reason =
      orVerificationNotes.trim() ||
      (language === "en"
        ? "Submitted Official Receipt picture is blurred or illegible. Please re-upload a clear copy."
        : "Malabo o hindi mabasa ang isinumiteng litrato ng Official Receipt. Mangyaring mag-upload muli ng malinaw na kopya.");

    setIsSubmittingOrReview(true);
    try {
      const tracking = targetApp.trackingNumber || targetApp.id;
      const engineerName = session?.name || "Engr. Mario S. Baldovino (Municipal Engineer)";
      const now = new Date().toISOString();

      await patchCitizenApplication(tracking, {
        status: "returned",
        orRejected: true,
        orRejectReason: reason,
        orRejectedAt: now,
        orRejectedBy: engineerName,
        holdReason: reason,
        payment: {
          ...(targetApp.payment || {}),
          orVerified: false,
          orRejected: true,
          orRejectReason: reason,
          orRejectedAt: now,
          orRejectedBy: engineerName,
        },
      });

      setApplications((prev) =>
        prev.map((a) => {
          if (a.trackingNumber === tracking || a.id === tracking) {
            return {
              ...a,
              status: "returned",
              orVerified: false,
              holdReason: reason,
              payment: {
                ...(a.payment || {}),
                orVerified: false,
                orRejected: true,
                orRejectReason: reason,
                orRejectedAt: now,
                orRejectedBy: engineerName,
              },
            };
          }
          return a;
        })
      );

      showToast(
        language === "en"
          ? `Receipt picture rejected. Application returned to applicant to re-upload clear proof.`
          : `Tinanggihan ang litrato ng resibo. Ibinalik sa aplikante upang mag-upload muli ng malinaw na kopya.`
      );
      setReviewingOrApp(null);
      setOrVerificationNotes("");
      setOrPictureZoom(1);
      setOrPictureRotation(0);
    } catch (err: any) {
      console.error("Failed to reject OR picture:", err);
      alert(err?.message || "Nabigong i-reject ang resibo.");
    } finally {
      setIsSubmittingOrReview(false);
    }
  };

  // Handle Confirm LGU Project Approval & Pinning to 3D Globe
  const handleConfirmLguApproval = async () => {
    if (!approvingLguProj) return;
    setIsSubmittingLguApproval(true);
    try {
      const now = new Date().toISOString();
      const engineerName = session?.name || "Engr. Mario S. Baldovino (Municipal Engineer)";
      const patchData = {
        engineerApproved: true,
        engineerApprovedAt: now,
        engineerApprovedBy: engineerName,
        isPinned: true,
        engineerNotes: lguApprovalNotes.trim() || "Approved and validated by Municipal Engineer for GIS 3D Map Pinning.",
      };

      const coords = lookupBarangayCoords(approvingLguProj.barangay);
      const targetLat = approvingLguProj.location?.lat ?? coords?.lat ?? 14.1811622;
      const targetLon = approvingLguProj.location?.lon ?? coords?.lon ?? 121.510284;

      const fullProj: Project = {
        ...approvingLguProj,
        ...patchData,
        location: { lat: targetLat, lon: targetLon },
        isLguProject: true,
        isPinned: true,
        engineerApproved: true,
        type: "Municipal Project",
        siteMarkerOnly: true,
        markerColor: approvingLguProj.markerColor || (approvingLguProj.status === "Completed" ? "#10b981" : approvingLguProj.status === "Ongoing" ? "#f5a623" : "#3b82f6"),
        mapSketch: approvingLguProj.mapSketch || {
          kind: "pin",
          color: approvingLguProj.markerColor || (approvingLguProj.status === "Completed" ? "#10b981" : approvingLguProj.status === "Ongoing" ? "#f5a623" : "#3b82f6"),
          coordinates: [{ lon: targetLon, lat: targetLat }],
        },
      };

      // 1. Update in Firestore
      try {
        await updateProjectInFirestore(approvingLguProj.id, fullProj);
      } catch (fErr) {
        console.warn("[EngineerDashboard] Firestore update note:", fErr);
      }

      // 2. Update via Backend API (with credentials included)
      try {
        await patchProject(approvingLguProj.id, fullProj);
      } catch (bErr) {
        try {
          const url = `${backendUrl()}/api/projects/${approvingLguProj.id}`;
          await fetch(url, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fullProj),
          });
        } catch (innerErr) {
          console.warn("[EngineerDashboard] Backend patch note:", innerErr);
        }
      }

      // 3. Update local component state
      setProjects((prev) => [fullProj, ...prev.filter((p) => p.id !== fullProj.id)]);

      // 4. Update localStorage cache & dispatch global events
      try {
        const cachedRaw = localStorage.getItem("infatrack-projects-cache");
        const cached = cachedRaw ? JSON.parse(cachedRaw) : [];
        const list = Array.isArray(cached) ? cached : [];
        const exists = list.some((p: any) => p.id === fullProj.id);
        const updated = exists
          ? list.map((p: any) => (p.id === fullProj.id ? { ...p, ...fullProj } : p))
          : [fullProj, ...list];
        localStorage.setItem("infatrack-projects-cache", JSON.stringify(updated));

        // Real-time notification across all open tabs/views
        window.dispatchEvent(new CustomEvent("lgu-project-added", { detail: fullProj }));
        window.dispatchEvent(new CustomEvent("projects-updated", { detail: updated }));
      } catch { }

      showToast(`Matagumpay na nakumpirma at nai-pin sa 3D Mapa ang "${approvingLguProj.name}".`);

      setApprovingLguProj(null);
      setLguApprovalNotes("");

      if (onApplicationApproved) onApplicationApproved();
      onNavigateToMap(fullProj.id, targetLat, targetLon, fullProj);
    } catch (err: any) {
      console.error("Failed to approve LGU project:", err);
      alert(err?.message || "Nabigong kumpirmahin ang LGU project.");
    } finally {
      setIsSubmittingLguApproval(false);
    }
  };

  // Add Inspection Schedule
  const handleAddSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduleForm.trackingNumber.trim() || !newScheduleForm.applicantName.trim()) {
      alert("Pakilagay ang Tracking Reference at Pangalan ng Aplikante.");
      return;
    }

    const item: InspectionSchedule = {
      id: `SCH-${Date.now().toString().slice(-4)}`,
      trackingNumber: newScheduleForm.trackingNumber.trim(),
      applicantName: newScheduleForm.applicantName.trim(),
      barangay: newScheduleForm.barangay,
      buildingType: newScheduleForm.buildingType,
      date: newScheduleForm.date,
      time: newScheduleForm.time,
      assignedInspector: newScheduleForm.assignedInspector,
      status: "Nakatakda",
      notes: newScheduleForm.notes.trim(),
    };

    const next = [item, ...schedules];
    setSchedules(next);
    localStorage.setItem("infatrack_engineering_schedules", JSON.stringify(next));
    showToast(`Matagumpay na naitakda ang inspeksyon para sa ${item.applicantName}.`);
    setIsAddScheduleModalOpen(false);
    setNewScheduleForm({
      trackingNumber: "",
      applicantName: "",
      barangay: "Poblacion",
      buildingType: "Residential Building",
      date: new Date().toISOString().split("T")[0],
      time: "10:00 AM",
      assignedInspector: "Engr. Clarissa P. Alcantara",
      notes: ""
    });
  };

  return (
    <div className="eng-dash-root">
      {/* ── Top Header Navigation ────────────────────────────────────────── */}
      <header className="eng-dash-nav">
        <div className="eng-dash-nav-left">
          <div className="eng-brand-group">
            <img
              src="/logo.png"
              alt="Selyo ng Bayan ng Luisiana"
              className="eng-brand-seal"
            />
            <div className="eng-brand-titles">
              <div className="eng-brand-eyebrow">
                <span>{t("eng.republic")}</span>
                <span className="eng-brand-pill">{t("nav.engineering_office")}</span>
              </div>
              <h1 className="eng-brand-main-title">
                {t("eng.dept_name")}
              </h1>
            </div>
          </div>
        </div>

        <div className="eng-dash-nav-right">
          <button
            type="button"
            className="eng-nav-btn eng-nav-btn-add-lgu"
            onClick={() => window.dispatchEvent(new CustomEvent("open-add-lgu-project"))}
            title={language === "en" ? "Add LGU Project" : "Mag-encode ng LGU Proyekto"}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{language === "en" ? "Add LGU Project" : "Mag-encode ng Proyekto"}</span>
          </button>

          <button
            type="button"
            className="eng-nav-btn eng-nav-btn-map"
            onClick={() => onNavigateToMap()}
            title={language === "en" ? "Engineering GIS Map (Stadia)" : "Mapa ng Inhinyero (Stadia Maps)"}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            <span>{language === "en" ? "GIS Map" : "Mapa ng Inhinyero"}</span>
          </button>

          <button
            type="button"
            className={`eng-nav-btn eng-nav-btn-docs${activeTab === "documents" ? " active" : ""}`}
            onClick={() => setActiveTab("documents")}
            title={t("nav.documents")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>{t("nav.documents")}</span>
          </button>

          <div className="eng-nav-separator" />
          <LanguageToggle />
          <ThemeToggle />

          {session && (
            <div className="eng-user-profile-badge">
              <div className="eng-user-avatar">
                {session.name ? session.name[0].toUpperCase() : "E"}
              </div>
              <div className="eng-user-info">
                <span className="eng-user-name">{session.name || "Municipal Engineer"}</span>
                <span className="eng-user-role">{language === "en" ? "Engineering Office" : "Tanggapan ng Inhinyero"}</span>
              </div>
            </div>
          )}

          {onLogout && (
            <button
              type="button"
              className="eng-nav-btn eng-nav-btn-ghost"
              onClick={onLogout}
              title={t("common.logout")}
            >
              <span>{t("common.logout")}</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Main Layout Body with Sidebar ──────────────────────────────── */}
      <div className="eng-body-layout">
        {/* ── Left Sidebar Navigation Buttons ────────────────────────────── */}
        <aside className={`eng-sidebar${isSidebarCollapsed ? " is-collapsed" : ""}`}>
          <div className="eng-sidebar-header">
            <div className="eng-sidebar-header-info">
              <span className="eng-sidebar-kicker">{t("nav.engineering_office")}</span>
              <h4 className="eng-sidebar-title">{t("nav.menu")}</h4>
            </div>
            <button
              type="button"
              className="eng-sidebar-collapse-btn"
              onClick={toggleSidebar}
              title={isSidebarCollapsed ? t("nav.expand_sidebar") : t("nav.collapse_sidebar")}
              aria-label="Toggle sidebar collapse"
            >
              {isSidebarCollapsed ? "»" : "«"}
            </button>
          </div>

          <nav className="eng-sidebar-nav-list">
            <div className="eng-sidebar-section-divider">{t("nav.modules")}</div>

            <button
              type="button"
              className={`eng-sidebar-btn${activeTab === "overview" ? " active" : ""}`}
              onClick={() => setActiveTab("overview")}
              title={t("nav.command_center")}
            >
              {activeTab === "overview" && <span className="eng-sidebar-pip" />}
              <span className="eng-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="9" />
                  <rect x="14" y="3" width="7" height="5" />
                  <rect x="14" y="12" width="7" height="9" />
                  <rect x="3" y="16" width="7" height="5" />
                </svg>
              </span>
              <div className="eng-sidebar-btn-label">
                <span>{t("nav.command_center")}</span>
              </div>
            </button>

            <button
              type="button"
              className={`eng-sidebar-btn${activeTab === "inspections" ? " active" : ""}`}
              onClick={() => setActiveTab("inspections")}
              title={t("nav.site_inspections")}
            >
              {activeTab === "inspections" && <span className="eng-sidebar-pip" />}
              <span className="eng-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </span>
              <div className="eng-sidebar-btn-label">
                <span>{t("nav.site_inspections")}</span>
                {metrics.pendingInspection > 0 && (
                  <span className="eng-sidebar-badge alert">{metrics.pendingInspection}</span>
                )}
              </div>
            </button>

            <button
              type="button"
              className={`eng-sidebar-btn${activeTab === "projects" ? " active" : ""}`}
              onClick={() => setActiveTab("projects")}
              title={t("nav.projects")}
            >
              {activeTab === "projects" && <span className="eng-sidebar-pip" />}
              <span className="eng-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 20h20" />
                  <path d="M5 20V8l7-5 7 5v12" />
                  <rect x="9" y="12" width="6" height="8" />
                </svg>
              </span>
              <div className="eng-sidebar-btn-label">
                <span>{t("nav.projects")}</span>
                <span className={`eng-sidebar-badge ${metrics.pendingLguCount > 0 ? "alert" : ""}`}>
                  {projects.length}
                  {metrics.pendingLguCount > 0 ? ` (${metrics.pendingLguCount})` : ""}
                </span>
              </div>
            </button>

            <button
              type="button"
              className={`eng-sidebar-btn${activeTab === "schedules" ? " active" : ""}`}
              onClick={() => setActiveTab("schedules")}
              title={t("nav.schedules")}
            >
              {activeTab === "schedules" && <span className="eng-sidebar-pip" />}
              <span className="eng-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </span>
              <div className="eng-sidebar-btn-label">
                <span>{t("nav.schedules")}</span>
                <span className="eng-sidebar-badge">{schedules.length}</span>
              </div>
            </button>

            <button
              type="button"
              className={`eng-sidebar-btn${activeTab === "personnel" ? " active" : ""}`}
              onClick={() => setActiveTab("personnel")}
              title={t("nav.personnel")}
            >
              {activeTab === "personnel" && <span className="eng-sidebar-pip" />}
              <span className="eng-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <div className="eng-sidebar-btn-label">
                <span>{t("nav.personnel")}</span>
              </div>
            </button>

            <button
              type="button"
              className={`eng-sidebar-btn${activeTab === "documents" ? " active" : ""}`}
              onClick={() => setActiveTab("documents")}
              title={t("nav.documents")}
            >
              {activeTab === "documents" && <span className="eng-sidebar-pip" />}
              <span className="eng-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </span>
              <div className="eng-sidebar-btn-label">
                <span>{t("nav.documents")}</span>
                {metrics.totalReceipts > 0 && (
                  <span className="eng-sidebar-badge">{metrics.totalReceipts}</span>
                )}
              </div>
            </button>

            <div className="eng-sidebar-section-divider">{t("nav.quick_links")}</div>

            <button
              type="button"
              className="eng-sidebar-btn eng-sidebar-action-btn"
              onClick={() => onNavigateToMap()}
              title={t("nav.open_3d_map")}
            >
              <span className="eng-sidebar-btn-icon map-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
              </span>
              <div className="eng-sidebar-btn-label">
                <strong>{t("nav.open_3d_map")} ↗</strong>
              </div>
            </button>
          </nav>

          <div className="eng-sidebar-footer">
            <div className="eng-sidebar-sync-pill">
              <span className="eng-sync-dot" />
              <span>{t("common.live_sync")}</span>
            </div>
          </div>
        </aside>

        {/* ── Main View Content Area ────────────────────────────────────── */}
        <main className="eng-content-panel">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="eng-toast-banner">
              <span className="eng-toast-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span>{toastMessage}</span>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 1: COMMAND CENTER / OVERVIEW
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <div className="eng-tab-pane">
              {/* Executive Hero Banner */}
              <div className="eng-hero-card">
                <div className="eng-hero-left">
                  <div className="eng-hero-tag">
                    <span>{t("eng.hero_tag")}</span>
                  </div>
                  <h2 className="eng-hero-title">
                    {t("eng.hero_title")}
                  </h2>
                  <p className="eng-hero-desc">
                    {t("eng.hero_desc")}
                  </p>
                </div>
                <div className="eng-hero-actions">
                  <button
                    type="button"
                    className="eng-btn eng-btn-primary"
                    onClick={() => setActiveTab("inspections")}
                  >
                    <span>{t("eng.btn_inspect_queue")}</span>
                  </button>
                  <button
                    type="button"
                    className="eng-btn eng-btn-outline"
                    onClick={() => onNavigateToMap()}
                  >
                    <span>{t("eng.btn_pin_map")}</span>
                  </button>
                </div>
              </div>

              {/* Key Metric Cards */}
              <div className="eng-metrics-grid">
                <div className="eng-stat-card is-pending">
                  <div className="eng-stat-head">
                    <span className="eng-stat-label">{t("eng.kpi_pending")}</span>
                    <span className="eng-stat-icon-badge yellow">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </span>
                  </div>
                  <div className="eng-stat-value">{metrics.pendingInspection}</div>
                  <div className="eng-stat-sub">
                    {t("eng.kpi_pending_sub")}
                  </div>
                </div>

                <div className="eng-stat-card is-safe">
                  <div className="eng-stat-head">
                    <span className="eng-stat-label">{t("eng.kpi_approved")}</span>
                    <span className="eng-stat-icon-badge green">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  </div>
                  <div className="eng-stat-value">{metrics.approvedAndPinned}</div>
                  <div className="eng-stat-sub">
                    {t("eng.kpi_approved_sub")}
                  </div>
                </div>

                <div className="eng-stat-card is-receipt">
                  <div className="eng-stat-head">
                    <span className="eng-stat-label">{t("eng.kpi_receipts")}</span>
                    <span className="eng-stat-icon-badge blue">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                      </svg>
                    </span>
                  </div>
                  <div className="eng-stat-value">{metrics.totalReceipts}</div>
                  <div className="eng-stat-sub">
                    {t("eng.kpi_receipts_sub")}
                  </div>
                </div>

                <div className="eng-stat-card is-infra">
                  <div className="eng-stat-head">
                    <span className="eng-stat-label">{t("eng.kpi_infra")}</span>
                    <span className="eng-stat-icon-badge purple">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M2 20h20" />
                        <path d="M5 20V8l7-5 7 5v12" />
                      </svg>
                    </span>
                  </div>
                  <div className="eng-stat-value">{metrics.activeInfra}</div>
                  <div className="eng-stat-sub">
                    {t("eng.kpi_infra_sub")}
                  </div>
                </div>
              </div>

              {/* Sectoral Infrastructure Quick Access Bar */}
              <div className="eng-panel-card" style={{ marginTop: 20, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "1.1rem" }}>🏢</span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--apple-text, #1d1d1f)" }}>
                        {language === "en" ? "Sectoral Siting & Classification" : "Pag-uuri ayon sa Sektor ng Imprastraktura"}
                      </h3>
                      <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--apple-text-secondary, #6e6e73)" }}>
                        {language === "en"
                          ? "Select a building sector below to jump directly into the filtered inspection queue:"
                          : "Pumili ng sektor ng gusali upang pumunta sa queue ng inspeksyon:"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="eng-sector-reset-btn"
                    onClick={() => {
                      setSectorFilter("all");
                      setActiveTab("inspections");
                    }}
                  >
                    {language === "en" ? "View Full Queue" : "Tingnan Lahat"} ({paidApplications.length}) →
                  </button>
                </div>

                <div className="eng-sector-pills-row" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
                  <button
                    type="button"
                    className="eng-sector-pill-btn all-pill"
                    onClick={() => {
                      setSectorFilter("all");
                      setActiveTab("inspections");
                    }}
                  >
                    <span>{language === "en" ? "All Sectors" : "Lahat ng Sektor"}</span>
                    <span className="eng-sector-pill-count">{paidApplications.length}</span>
                  </button>
                  {SECTORAL_KEYS.map((k) => {
                    const def = SECTOR_DEFINITIONS[k];
                    const Icon = def.icon;
                    const appCount = sectorAppCounts[k] || 0;
                    const projCount = sectorProjectCounts[k] || 0;
                    const totalSites = appCount + projCount;
                    return (
                      <button
                        key={k}
                        type="button"
                        className="eng-sector-pill-btn"
                        onClick={() => {
                          setSectorFilter(k);
                          setActiveTab("inspections");
                        }}
                        style={{
                          borderColor: def.badgeBg,
                        }}
                        title={language === "en" ? `View ${def.title} queue (${totalSites} sites)` : `Tingnan ang ${def.title} queue (${totalSites} lugar)`}
                      >
                        <span className="eng-sector-pill-icon" style={{ color: def.color }}>
                          <Icon size={14} color={def.color} />
                        </span>
                        <span className="eng-sector-pill-title">{def.title}</span>
                        <span className="eng-sector-pill-count">{totalSites}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Two Column Grid: Priority Inspection Queue & Quick Siting Summary */}
              <div className="eng-split-grid">
                {/* Priority Queue Box */}
                <div className="eng-panel-card">
                  <div className="eng-panel-header">
                    <div className="eng-panel-title-group">
                      <h3 className="eng-panel-title">{t("eng.urgent_title")}</h3>
                      <span className="eng-panel-sub">{t("eng.urgent_sub")}</span>
                    </div>
                    <button
                      type="button"
                      className="eng-link-btn"
                      onClick={() => setActiveTab("inspections")}
                    >
                      {t("eng.view_all")} ({paidApplications.length}) →
                    </button>
                  </div>

                  <div className="eng-recent-list">
                    {paidApplications.slice(0, 5).map((app) => {
                      const tracking = app.trackingNumber || app.id;
                      const applicant = app.applicant?.fullName || app.applicantName || "Aplikante";
                      const bgy = app.applicant?.barangay || app.barangay || "Luisiana";
                      const bldg = app.lotDetails?.proposedBuildingType || app.buildingType || "Residential";
                      const isApproved = app.engineerApproved || app.status === "approved_for_construction";

                      return (
                        <div key={tracking} className="eng-recent-item">
                          <div className="eng-recent-left">
                            <div className="eng-recent-dot" style={{ background: isApproved ? "#10b981" : "#f59e0b" }} />
                            <div>
                              <strong className="eng-recent-tracking">{tracking}</strong>
                              <div className="eng-recent-meta">
                                <span>{applicant}</span>
                                <span>·</span>
                                <span>Brgy. {bgy}</span>
                                <span>·</span>
                                <span className="eng-recent-bldg">{bldg}</span>
                              </div>
                            </div>
                          </div>
                          <div className="eng-recent-right">
                            <span className={`eng-status-pill ${isApproved ? "approved" : "pending"}`}>
                              {isApproved ? t("eng.pinned_tag") : t("eng.pending_tag")}
                            </span>
                            <button
                              type="button"
                              className="eng-btn-xs"
                              onClick={() => {
                                setActiveTab("inspections");
                                setSearchQuery(tracking);
                              }}
                            >
                              {t("eng.review_btn")}
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {paidApplications.length === 0 && (
                      <div className="eng-empty-inline">
                        {language === "en" ? "No applications awaiting site inspection at this moment." : "Walang nakabinbing aplikasyon para sa site inspection sa ngayon."}
                      </div>
                    )}
                  </div>
                </div>

                {/* Infrastructure & Geotechnical Risk Overview */}
                <div className="eng-panel-card">
                  <div className="eng-panel-header">
                    <div className="eng-panel-title-group">
                      <h3 className="eng-panel-title">{t("eng.geotech_title")}</h3>
                      <span className="eng-panel-sub">{t("eng.geotech_sub")}</span>
                    </div>
                    <button
                      type="button"
                      className="eng-link-btn"
                      onClick={() => onNavigateToMap()}
                    >
                      {t("eng.open_in_map")}
                    </button>
                  </div>

                  <div className="eng-hazard-summary-list">
                    <div className="eng-hazard-card safe">
                      <div className="eng-hazard-head">
                        <strong>{t("eng.clup_compliance")}</strong>
                        <span className="eng-hazard-pill">{t("eng.clup_pill")}</span>
                      </div>
                      <p className="eng-hazard-desc">
                        {t("eng.clup_desc")}
                      </p>
                    </div>

                    <div className="eng-hazard-card warn">
                      <div className="eng-hazard-head">
                        <strong>{t("eng.landslide_title")}</strong>
                        <span className="eng-hazard-pill warn">{t("eng.landslide_pill")}</span>
                      </div>
                      <p className="eng-hazard-desc">
                        {t("eng.landslide_desc")}
                      </p>
                    </div>

                    <div className="eng-hazard-card blue">
                      <div className="eng-hazard-head">
                        <strong>{t("eng.pinning_title")}</strong>
                        <span className="eng-hazard-pill blue">3D Cesium WGS84</span>
                      </div>
                      <p className="eng-hazard-desc">
                        {t("eng.pinning_desc")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 2: SITE INSPECTIONS QUEUE (RECEIPTS FROM ASSESSOR)
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "inspections" && (
            <div className="eng-tab-pane">
              {/* Header Filter Bar */}
              <div className="eng-filter-header-card">
                <div className="eng-search-box">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    className="eng-search-input"
                    placeholder={t("eng.search_placeholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button type="button" className="eng-clear-btn" onClick={() => setSearchQuery("")}>✕</button>
                  )}
                </div>

                <div className="eng-filter-controls">
                  <div className="eng-status-pills">
                    <button
                      type="button"
                      className={`eng-status-tab ${statusFilter === "all" ? "active" : ""}`}
                      onClick={() => setStatusFilter("all")}
                    >
                      {t("eng.filter_all")} ({paidApplications.length})
                    </button>
                    <button
                      type="button"
                      className={`eng-status-tab pending ${statusFilter === "pending" ? "active" : ""}`}
                      onClick={() => setStatusFilter("pending")}
                    >
                      {t("eng.filter_pending")} ({metrics.pendingInspection})
                    </button>
                    <button
                      type="button"
                      className={`eng-status-tab hold ${statusFilter === "hold" ? "active" : ""}`}
                      onClick={() => setStatusFilter("hold")}
                    >
                      {t("eng.filter_hold")} ({metrics.onHold})
                    </button>
                    <button
                      type="button"
                      className={`eng-status-tab approved ${statusFilter === "approved" ? "active" : ""}`}
                      onClick={() => setStatusFilter("approved")}
                    >
                      {t("eng.filter_pinned")} ({metrics.approvedAndPinned})
                    </button>
                  </div>

                  <select
                    className="eng-select"
                    value={barangayFilter}
                    onChange={(e) => setBarangayFilter(e.target.value)}
                  >
                    <option value="">{t("eng.all_barangays")}</option>
                    {LUISIANA_BARANGAYS.map((bgy) => (
                      <option key={bgy} value={bgy}>{bgy}</option>
                    ))}
                  </select>

                  {/* View Mode Toggle: List vs Cards */}
                  <div className="eng-view-toggle">
                    <button
                      type="button"
                      className={`eng-view-toggle-btn ${appsViewMode === "list" ? "active" : ""}`}
                      onClick={() => setAppsViewMode("list")}
                      title={language === "en" ? "List View" : "List View"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                      <span>List</span>
                    </button>
                    <button
                      type="button"
                      className={`eng-view-toggle-btn ${appsViewMode === "cards" ? "active" : ""}`}
                      onClick={() => setAppsViewMode("cards")}
                      title={language === "en" ? "Cards View" : "Cards View"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                      </svg>
                      <span>Cards</span>
                    </button>
                  </div>
                </div>

                {/* Small Sector Buttons Row */}
                <div className="eng-sector-pills-row">
                  <span className="eng-sector-pills-label">
                    🏢 {language === "en" ? "Sector:" : "Sektor:"}
                  </span>
                  <button
                    type="button"
                    className={`eng-sector-pill-btn all-pill ${sectorFilter === "all" ? "active" : ""}`}
                    onClick={() => setSectorFilter("all")}
                  >
                    <span>{language === "en" ? "All" : "Lahat"}</span>
                    <span className="eng-sector-pill-count">
                      {statusFilter === "approved" ? metrics.approvedAndPinned : paidApplications.length}
                    </span>
                  </button>
                  {SECTORAL_KEYS.map((k) => {
                    const def = SECTOR_DEFINITIONS[k];
                    const isSelected = sectorFilter === k;
                    const Icon = def.icon;
                    const count = statusFilter === "approved" ? (sectorPinnedAppCounts[k] || 0) : (sectorAppCounts[k] || 0);
                    return (
                      <button
                        key={k}
                        type="button"
                        className={`eng-sector-pill-btn ${isSelected ? "active" : ""}`}
                        onClick={() => setSectorFilter(isSelected ? "all" : k)}
                        style={{
                          borderColor: isSelected ? def.color : undefined,
                          background: isSelected ? def.color : undefined,
                          color: isSelected ? "#ffffff" : undefined,
                        }}
                        title={language === "en" ? `Filter by ${def.title}` : `I-filter sa ${def.title}`}
                      >
                        <span className="eng-sector-pill-icon" style={{ color: isSelected ? "#ffffff" : def.color }}>
                          <Icon size={14} color={isSelected ? "#ffffff" : def.color} />
                        </span>
                        <span className="eng-sector-pill-title">{def.title}</span>
                        <span className="eng-sector-pill-count">{count}</span>
                      </button>
                    );
                  })}
                  {sectorFilter !== "all" && (
                    <button
                      type="button"
                      className="eng-sector-pill-clear"
                      onClick={() => setSectorFilter("all")}
                      title={language === "en" ? "Reset sector filter" : "I-reset ang filter sa sektor"}
                    >
                      ✕ {language === "en" ? "Clear" : "I-reset"}
                    </button>
                  )}
                </div>
              </div>

              {/* Cards List */}
              {loading ? (
                <div className="eng-state-card">
                  <div className="eng-spinner" />
                  <p>{t("eng.loading_records")}</p>
                </div>
              ) : error ? (
                <div className="eng-state-card error">
                  <p>{error}</p>
                  <button type="button" className="eng-btn eng-btn-outline" onClick={loadData}>{t("eng.retry_btn")}</button>
                </div>
              ) : displayedApps.length === 0 ? (
                <div className="eng-state-card empty">
                  <div className="eng-empty-icon-svg">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3>{t("eng.no_apps_found")}</h3>
                  <p>
                    {searchQuery || barangayFilter || sectorFilter !== "all" || statusFilter !== "all"
                      ? t("eng.no_apps_filter")
                      : t("eng.no_apps_empty")}
                  </p>
                </div>
              ) : appsViewMode === "list" ? (
                /* ── LIST VIEW TABLE (DEFAULT) ── */
                <div className="eng-apps-table-card">
                  <div className="eng-apps-table-scroll">
                    <table className="eng-table eng-apps-table">
                      <thead>
                        <tr>
                          <th style={{ width: 150 }}>{language === "en" ? "Tracking & Date" : "Tracking & Petsa"}</th>
                          <th style={{ minWidth: 170 }}>{language === "en" ? "Applicant & Location" : "Aplikante & Lokasyon"}</th>
                          <th style={{ minWidth: 180 }}>{language === "en" ? "Building & Sector" : "Gusali & Sektor"}</th>
                          <th style={{ minWidth: 260, width: 260, whiteSpace: "nowrap" }}>{language === "en" ? "Official Receipt (O.R.)" : "Opisyal na Resibo (O.R.)"}</th>
                          <th style={{ minWidth: 150 }}>{language === "en" ? "Documents" : "Mga Dokumento"}</th>
                          <th style={{ width: 130 }}>{language === "en" ? "Status" : "Katayuan"}</th>
                          <th style={{ textAlign: "right", minWidth: 190 }}>{language === "en" ? "Action" : "Aksyon"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedApps.map((app) => {
                          const isApproved = app.engineerApproved === true || app.status === "approved_for_construction";
                          const isHold = app.status === "returned";
                          const tracking = app.trackingNumber || app.id;
                          const applicant = app.applicant?.fullName || app.applicantName || "Private Applicant";
                          const bgy = app.applicant?.barangay || app.barangay || "Luisiana";
                          const bldgType = app.lotDetails?.proposedBuildingType || app.buildingType || "Residential Building";
                          const appSectorKey = getBuildingSector(app);
                          const appSectorDef = SECTOR_DEFINITIONS[appSectorKey];
                          const orInfo = getApplicationReceiptInfo(app);
                          const lat = app.latitude ?? app.lotDetails?.lat ?? app.coordinates?.lat;
                          const lon = app.longitude ?? app.lotDetails?.lon ?? app.coordinates?.lon;

                          const docsList: { key: string; name: string; url: string }[] = [];
                          if (app.uploads && typeof app.uploads === "object") {
                            Object.entries(app.uploads).forEach(([k, val]: [string, any]) => {
                              if (Array.isArray(val)) {
                                val.forEach((f: any, idx: number) => {
                                  if (f?.url) {
                                    docsList.push({
                                      key: `${k}-${idx}`,
                                      name: f.originalName || f.name || `${k} #${idx + 1}`,
                                      url: resolveDocUrl(f.url),
                                    });
                                  }
                                });
                              } else if (val && typeof val === "object" && val.url) {
                                docsList.push({
                                  key: k,
                                  name: val.originalName || val.name || k,
                                  url: resolveDocUrl(val.url),
                                });
                              }
                            });
                          }

                          return (
                            <tr key={tracking} className={`eng-app-row ${isApproved ? "approved" : isHold ? "hold" : "pending"}`}>
                              <td>
                                <div className="eng-app-list-track-cell">
                                  <span className="eng-tracking-badge mono">{tracking}</span>
                                  <span className="eng-app-list-date">{formatDate(app.createdAt)}</span>
                                </div>
                              </td>

                              <td>
                                <div className="eng-app-list-applicant-cell">
                                  <strong className="eng-app-list-name">{applicant}</strong>
                                  <div className="eng-app-list-sub">
                                    <span>Brgy. {bgy}</span>
                                    {app.applicant?.contactNumber && <span> · {app.applicant.contactNumber}</span>}
                                  </div>
                                </div>
                              </td>

                              <td>
                                <div className="eng-app-list-bldg-cell">
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                                    <span className="eng-app-list-bldg-name">{bldgType}</span>
                                    {appSectorDef && (
                                      <span
                                        className="eng-sector-badge-pill"
                                        style={{
                                          background: appSectorDef.badgeBg,
                                          color: appSectorDef.badgeColor,
                                          margin: 0,
                                          padding: "2px 8px",
                                          fontSize: "0.68rem",
                                        }}
                                      >
                                        {appSectorDef.title}
                                      </span>
                                    )}
                                  </div>
                                  <div className="eng-app-list-sub">
                                    {lat && lon ? (
                                      <span className="mono">({Number(lat).toFixed(4)}, {Number(lon).toFixed(4)})</span>
                                    ) : (
                                      <span style={{ color: "var(--apple-text-tertiary, #86868b)" }}>{language === "en" ? "No GPS coords" : "Walang GPS"}</span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Official Receipt (O.R.) Picture Review Cell */}
                              <td>
                                <div className="eng-app-list-receipt-cell">
                                  {orInfo.hasReceipt ? (
                                    <div className="eng-receipt-chip-card">
                                      {/* Picture Thumbnail Preview */}
                                      {orInfo.receiptUrl ? (
                                        <div
                                          className="eng-receipt-thumb-wrap"
                                          onClick={() => setReviewingOrApp(app)}
                                          title={language === "en" ? "Click to inspect Official Receipt picture" : "I-click upang suriin ang litrato ng resibo"}
                                        >
                                          <img
                                            src={resolveDocUrl(orInfo.receiptUrl)}
                                            alt={`OR ${orInfo.orNumber}`}
                                            className="eng-receipt-thumb-img"
                                            onError={(e) => {
                                              (e.target as HTMLElement).style.display = "none";
                                            }}
                                          />
                                          <span className="eng-receipt-thumb-cam">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                              <circle cx="12" cy="13" r="4" />
                                            </svg>
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="eng-receipt-thumb-wrap eng-receipt-thumb-fallback">
                                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                            <circle cx="8.5" cy="8.5" r="1.5" />
                                            <polyline points="21 15 16 10 5 21" />
                                          </svg>
                                        </div>
                                      )}

                                      <div className="eng-receipt-chip-info">
                                        <div className="eng-receipt-chip-row1">
                                          <strong className="eng-receipt-num mono">{orInfo.orNumber}</strong>
                                          {orInfo.isOrVerified ? (
                                            <span
                                              className="eng-or-status-tag verified"
                                              title={language === "en" ? `Verified by ${orInfo.orVerifiedBy || "Municipal Engineer"}` : `Napatunayan ni ${orInfo.orVerifiedBy || "Inhinyero"}`}
                                            >
                                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                <polyline points="20 6 9 17 4 12" />
                                              </svg>
                                              <span>{language === "en" ? "Verified" : "Na-verify"}</span>
                                            </span>
                                          ) : orInfo.orRejected ? (
                                            <span className="eng-or-status-tag rejected">
                                              <span>{language === "en" ? "Rejected" : "Tinanggihan"}</span>
                                            </span>
                                          ) : (
                                            <button
                                              type="button"
                                              className="eng-or-review-badge-btn"
                                              onClick={() => setReviewingOrApp(app)}
                                              title={language === "en" ? "Official Receipt is a picture: Review before inspection and map pinning" : "Litrato ang O.R.: Suriin muna bago ang inspeksyon at pag-pin sa mapa"}
                                            >
                                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <circle cx="12" cy="12" r="3" />
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                              </svg>
                                              <span>{language === "en" ? "Review" : "Suriin"} ↗</span>
                                            </button>
                                          )}
                                        </div>
                                        <div className="eng-receipt-chip-row2">
                                          {orInfo.paymentDate && <span className="eng-receipt-date">{formatDate(orInfo.paymentDate)}</span>}
                                          {orInfo.paidAmount && <span className="eng-receipt-amt"> · {formatCurrency(orInfo.paidAmount)}</span>}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="eng-no-or-cell">
                                      <span className="eng-no-or-badge">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <circle cx="12" cy="12" r="10" />
                                          <line x1="12" y1="8" x2="12" y2="12" />
                                          <line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                        <span>{language === "en" ? "No O.R. yet" : "Wala pang O.R."}</span>
                                      </span>
                                      <span className="eng-no-or-sub">
                                        {language === "en" ? "O.R. not uploaded yet" : "Hindi pa nai-uupload ang O.R."}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </td>

                              <td>
                                <div className="eng-app-list-docs-cell">
                                  {docsList.length > 0 ? (
                                    <button
                                      type="button"
                                      className="eng-app-docs-btn"
                                      onClick={() =>
                                        setViewingAppDocs({
                                          tracking,
                                          applicant,
                                          bldgType,
                                          docs: [
                                            ...(orInfo.hasReceipt && orInfo.receiptUrl
                                              ? [{ key: "receipt", name: `Official Receipt #${orInfo.orNumber}`, url: resolveDocUrl(orInfo.receiptUrl), isReceipt: true }]
                                              : []),
                                            ...docsList,
                                          ],
                                        })
                                      }
                                      title={language === "en" ? `Click to view all ${docsList.length} documents` : `I-click para makita ang lahat ng ${docsList.length} dokumento`}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="16" y1="13" x2="8" y2="13" />
                                        <line x1="16" y1="17" x2="8" y2="17" />
                                        <polyline points="10 9 9 9 8 9" />
                                      </svg>
                                      <span>{language === "en" ? `Docs (${docsList.length})` : `Dokumento (${docsList.length})`}</span>
                                    </button>
                                  ) : (
                                    <span className="eng-docs-empty-text">{language === "en" ? "No uploads" : "Walang docs"}</span>
                                  )}
                                </div>
                              </td>

                              <td>
                                {isApproved ? (
                                  <span className="eng-status-pill approved" style={{ whiteSpace: "nowrap" }}>
                                    {t("eng.status_pinned_3d")}
                                  </span>
                                ) : isHold ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    <span className="eng-status-pill hold" style={{ whiteSpace: "nowrap" }}>
                                      {t("eng.status_hold_badge")}
                                    </span>
                                    {app.holdReason && (
                                      <span style={{ fontSize: "0.68rem", color: "#f59e0b", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={app.holdReason}>
                                        {app.holdReason}
                                      </span>
                                    )}
                                  </div>
                                ) : !orInfo.hasReceipt ? (
                                  <span className="eng-status-pill pending" style={{ whiteSpace: "nowrap", background: "rgba(107, 114, 128, 0.12)", color: "#6b7280" }}>
                                    {language === "en" ? "• O.R. Not Uploaded Yet" : "• Hindi Pa Nai-upload ang O.R."}
                                  </span>
                                ) : !orInfo.isOrVerified ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    <span
                                      className="eng-status-pill pending"
                                      style={{
                                        whiteSpace: "nowrap",
                                        background: "rgba(245, 158, 11, 0.14)",
                                        color: "#b45309",
                                        borderColor: "rgba(245, 158, 11, 0.35)",
                                      }}
                                    >
                                      {language === "en" ? "• Needs O.R. Review" : "• Kailangan ng O.R. Review"}
                                    </span>
                                    <span style={{ fontSize: "0.65rem", color: "#d97706", fontWeight: 500 }}>
                                      {language === "en" ? "Prior to Inspection & Pin" : "Bago Inspeksyon & Pag-pin"}
                                    </span>
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    <span
                                      className="eng-status-pill verified"
                                      style={{
                                        whiteSpace: "nowrap",
                                        background: "rgba(16, 185, 129, 0.12)",
                                        color: "#059669",
                                        borderColor: "rgba(16, 185, 129, 0.3)",
                                      }}
                                    >
                                      {language === "en" ? "✓ O.R. Verified" : "✓ Na-verify ang Resibo"}
                                    </span>
                                    <span style={{ fontSize: "0.65rem", color: "#059669", fontWeight: 500 }}>
                                      {language === "en" ? "Ready for Inspection & Pin" : "Handa para sa Inspeksyon"}
                                    </span>
                                  </div>
                                )}
                              </td>

                              <td style={{ textAlign: "right" }}>
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                                  <button
                                    type="button"
                                    className="eng-table-action-btn view"
                                    onClick={() => onNavigateToMap(app.id, lat, lon)}
                                    title={t("eng.view_map_btn")}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                                      <line x1="8" y1="2" x2="8" y2="18" />
                                      <line x1="16" y1="6" x2="16" y2="22" />
                                    </svg>
                                    <span>{language === "en" ? "View in Map" : "Tingnan sa Mapa"}</span>
                                  </button>

                                  {!isApproved && (
                                    <>
                                      {/* Dedicated Review O.R. Button if receipt exists and not yet verified */}
                                      {orInfo.hasReceipt && !orInfo.isOrVerified && (
                                        <button
                                          type="button"
                                          className="eng-table-action-btn review-or"
                                          onClick={() => setReviewingOrApp(app)}
                                          title={language === "en" ? "Review Official Receipt Picture before inspection and pinning" : "Suriin ang litrato ng resibo bago ang inspeksyon at pag-pin"}
                                        >
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                            <circle cx="12" cy="13" r="4" />
                                          </svg>
                                          <span>{language === "en" ? "Review O.R." : "Suriin O.R."}</span>
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        className="eng-table-action-btn hold"
                                        onClick={() => setHoldingApp(app)}
                                        title={t("eng.hold_return_btn")}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                          <line x1="12" y1="9" x2="12" y2="13" />
                                          <line x1="12" y1="17" x2="12.01" y2="17" />
                                        </svg>
                                        <span>{language === "en" ? "Hold" : "I-hold"}</span>
                                      </button>

                                      <button
                                        type="button"
                                        className="eng-table-action-btn approve"
                                        onClick={() => {
                                          if (!orInfo.hasReceipt) {
                                            showToast(
                                              language === "en"
                                                ? "Cannot approve or pin: Official Receipt (O.R.) has not been uploaded yet."
                                                : "Hindi maaaring i-pin sa 3D Mapa: Wala pang nai-uupload na Official Receipt (O.R.) ang aplikante."
                                            );
                                            return;
                                          }
                                          setApprovingApp(app);
                                          setConfirmOrReviewed(orInfo.isOrVerified);
                                        }}
                                        title={
                                          !orInfo.hasReceipt
                                            ? (language === "en" ? "Cannot pin without Official Receipt" : "Hindi mai-pin nang walang resibo")
                                            : t("eng.approve_pin_btn")
                                        }
                                        style={!orInfo.hasReceipt ? { opacity: 0.45, cursor: "not-allowed", filter: "grayscale(1)" } : undefined}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        <span>{language === "en" ? "Approve & Pin" : "Aprubahan"}</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* ── CARDS VIEW ── */
                <div className="eng-inspection-cards-grid">
                  {displayedApps.map((app) => {
                    const isApproved = app.engineerApproved === true || app.status === "approved_for_construction";
                    const isHold = app.status === "returned";
                    const tracking = app.trackingNumber || app.id;
                    const applicant = app.applicant?.fullName || app.applicantName || "Private Applicant";
                    const bgy = app.applicant?.barangay || app.barangay || "Luisiana";
                    const bldgType = app.lotDetails?.proposedBuildingType || app.buildingType || "Residential Building";
                    const appSectorKey = getBuildingSector(app);
                    const appSectorDef = SECTOR_DEFINITIONS[appSectorKey];
                    const estCost = app.estimatedCost || app.budgetTotal;
                    const orInfo = getApplicationReceiptInfo(app);
                    const lat = app.latitude ?? app.lotDetails?.lat ?? app.coordinates?.lat;
                    const lon = app.longitude ?? app.lotDetails?.lon ?? app.coordinates?.lon;

                    const docsList: { key: string; name: string; url: string }[] = [];
                    if (app.uploads && typeof app.uploads === "object") {
                      Object.entries(app.uploads).forEach(([k, val]: [string, any]) => {
                        if (Array.isArray(val)) {
                          val.forEach((f: any, idx: number) => {
                            if (f?.url) {
                              docsList.push({
                                key: `${k}-${idx}`,
                                name: f.originalName || f.name || `${k} #${idx + 1}`,
                                url: resolveDocUrl(f.url),
                              });
                            }
                          });
                        } else if (val && typeof val === "object" && val.url) {
                          docsList.push({
                            key: k,
                            name: val.originalName || val.name || k,
                            url: resolveDocUrl(val.url),
                          });
                        }
                      });
                    }

                    return (
                      <div
                        key={tracking}
                        className={`eng-app-card ${isApproved ? "approved" : isHold ? "hold" : "pending"}`}
                      >
                        {/* Header */}
                        <div className="eng-card-header">
                          <div className="eng-card-header-left">
                            <span className="eng-tracking-badge">{tracking}</span>
                            <span className="eng-card-date">{t("eng.submitted_on")} {formatDate(app.createdAt)}</span>
                          </div>
                          <div className="eng-card-header-right">
                            {isApproved ? (
                              <span className="eng-status-pill approved">
                                {t("eng.status_pinned_3d")}
                              </span>
                            ) : isHold ? (
                              <span className="eng-status-pill hold">
                                {t("eng.status_hold_badge")}
                              </span>
                            ) : !orInfo.hasReceipt ? (
                              <span className="eng-status-pill pending" style={{ background: "rgba(107, 114, 128, 0.12)", color: "#6b7280" }}>
                                {language === "en" ? "• O.R. Not Uploaded Yet" : "• Hindi Pa Nai-upload ang O.R."}
                              </span>
                            ) : !orInfo.isOrVerified ? (
                              <span
                                className="eng-status-pill pending"
                                style={{
                                  background: "rgba(245, 158, 11, 0.14)",
                                  color: "#b45309",
                                  borderColor: "rgba(245, 158, 11, 0.35)",
                                }}
                              >
                                {language === "en" ? "• Needs O.R. Review" : "• Kailangan ng O.R. Review"}
                              </span>
                            ) : (
                              <span
                                className="eng-status-pill verified"
                                style={{
                                  background: "rgba(16, 185, 129, 0.12)",
                                  color: "#059669",
                                  borderColor: "rgba(16, 185, 129, 0.3)",
                                }}
                              >
                                {language === "en" ? "✓ O.R. Verified" : "✓ Na-verify ang Resibo"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Body Details */}
                        <div className="eng-card-body-grid">
                          <div className="eng-detail-col">
                            <span className="eng-detail-label">{t("eng.applicant_loc")}</span>
                            <strong className="eng-detail-val">{applicant}</strong>
                            <div className="eng-detail-sub">
                              <span>Brgy. {bgy}, Luisiana</span>
                              {app.applicant?.contactNumber && <span> · Tel: {app.applicant.contactNumber}</span>}
                            </div>
                          </div>

                          <div className="eng-detail-col">
                            <span className="eng-detail-label">{t("eng.proposed_bldg")}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <strong className="eng-detail-val">{bldgType}</strong>
                              {appSectorDef && (
                                <span
                                  className="eng-sector-badge-pill"
                                  style={{
                                    background: appSectorDef.badgeBg,
                                    color: appSectorDef.badgeColor,
                                    margin: 0,
                                    padding: "2px 8px",
                                    fontSize: "0.68rem",
                                  }}
                                >
                                  {appSectorDef.title}
                                </span>
                              )}
                            </div>
                            <div className="eng-detail-sub">
                              {estCost && <span>{t("eng.est_cost")} {formatCurrency(estCost)}</span>}
                              {lat && lon && <span> · ({Number(lat).toFixed(4)}, {Number(lon).toFixed(4)})</span>}
                            </div>
                          </div>
                        </div>

                        {/* Hold Alert Banner if on hold */}
                        {isHold && (
                          <div className="eng-hold-alert-box">
                            <strong>{t("eng.hold_reason_title")}</strong> {app.holdReason || (language === "en" ? "Submitted plan requires revision." : "Kailangang isaayos ang isinumiteng plano.")}
                          </div>
                        )}

                        {/* Assessor Receipt Metadata / Picture Card */}
                        {orInfo.hasReceipt ? (
                          <div className={`eng-receipt-chip-card ${orInfo.isOrVerified ? "is-verified" : "needs-review"}`} style={{ margin: "10px 0" }}>
                            {/* Receipt Thumbnail Preview with Camera badge */}
                            <div
                              className="eng-receipt-thumb-wrap"
                              onClick={() => setReviewingOrApp(app)}
                              title={language === "en" ? "Click to inspect Official Receipt photo" : "I-click upang suriin ang litrato ng resibo"}
                            >
                              <img
                                src={orInfo.receiptUrl}
                                alt={`Official Receipt ${orInfo.orNumber}`}
                                className="eng-receipt-thumb-img"
                                loading="lazy"
                              />
                              <div className="eng-receipt-thumb-cam">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                  <circle cx="12" cy="13" r="4" />
                                </svg>
                              </div>
                            </div>

                            {/* O.R. Info & Status */}
                            <div className="eng-receipt-chip-body">
                              <div className="eng-receipt-chip-top">
                                <span className="eng-receipt-chip-num">{orInfo.orNumber}</span>
                                {orInfo.isOrVerified ? (
                                  <span className="eng-or-status-tag verified">
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>{language === "en" ? "Verified" : "Na-verify"}</span>
                                  </span>
                                ) : (
                                  <span className="eng-or-status-tag pending">
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <circle cx="12" cy="12" r="10" />
                                      <line x1="12" y1="8" x2="12" y2="12" />
                                    </svg>
                                    <span>{language === "en" ? "Needs Review" : "Suriin"}</span>
                                  </span>
                                )}
                              </div>
                              <div className="eng-receipt-chip-meta">
                                {orInfo.paymentDate && <span>{formatDate(orInfo.paymentDate)}</span>}
                                {orInfo.amount != null && <span> · <strong>{formatCurrency(orInfo.amount)}</strong></span>}
                              </div>
                            </div>

                            {/* Review Trigger Button */}
                            <button
                              type="button"
                              className="eng-or-review-badge-btn"
                              onClick={() => setReviewingOrApp(app)}
                              title={language === "en" ? "Review O.R. Picture before map pin and inspection" : "Suriin ang litrato ng resibo"}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                              <span>{orInfo.isOrVerified ? (language === "en" ? "Inspect" : "Suriin") : (language === "en" ? "Review Photo" : "Suriin Litrato")}</span>
                            </button>
                          </div>
                        ) : (
                          <div className="eng-receipt-box is-empty">
                            <div className="eng-receipt-left">
                              <div className="eng-receipt-icon empty">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                              </div>
                              <div>
                                <div className="eng-receipt-title">
                                  <span>{t("eng.or_header")}</span>
                                  <span className="eng-no-or-badge-pill">{language === "en" ? "No O.R. yet" : "Wala pang O.R."}</span>
                                </div>
                                <div className="eng-receipt-meta">
                                  <span style={{ color: "var(--apple-text-tertiary, #86868b)" }}>
                                    {language === "en" ? "O.R. not uploaded yet (Awaiting citizen upload upon payment)" : "Hindi pa nai-uupload ang O.R. (I-uupload pagkatapos magbayad)"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Uploaded Documents Strip */}
                        {docsList.length > 0 && (
                          <div className="eng-docs-row">
                            <span className="eng-docs-label">{t("eng.attached_docs_label")}</span>
                            <div className="eng-docs-pills">
                              {docsList.map((doc) => (
                                <button
                                  key={doc.key}
                                  type="button"
                                  className="eng-doc-chip"
                                  onClick={() => setViewingDoc(doc)}
                                  title={`${t("common.preview")}: ${doc.name}`}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                  </svg>
                                  <span>{doc.name.slice(0, 24)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Card Actions Footer */}
                        <div className="eng-card-actions">
                          <button
                            type="button"
                            className="eng-action-btn eng-btn-map-pin"
                            onClick={() => onNavigateToMap(app.id, lat, lon)}
                            title={t("eng.view_map_btn")}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                              <line x1="8" y1="2" x2="8" y2="18" />
                              <line x1="16" y1="6" x2="16" y2="22" />
                            </svg>
                            <span>{t("eng.view_map_btn")}</span>
                          </button>

                          {!isApproved && (
                            <>
                              {/* Dedicated Review O.R. Button if receipt exists and not yet verified */}
                              {orInfo.hasReceipt && !orInfo.isOrVerified && (
                                <button
                                  type="button"
                                  className="eng-action-btn eng-btn-hold"
                                  style={{
                                    background: "rgba(245, 158, 11, 0.12)",
                                    borderColor: "rgba(245, 158, 11, 0.4)",
                                    color: "#b45309",
                                  }}
                                  onClick={() => setReviewingOrApp(app)}
                                  title={language === "en" ? "Review Official Receipt Picture before inspection and pinning" : "Suriin ang litrato ng resibo bago ang inspeksyon at pag-pin"}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                    <circle cx="12" cy="13" r="4" />
                                  </svg>
                                  <span>{language === "en" ? "Review O.R." : "Suriin O.R."}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                className="eng-action-btn eng-btn-hold"
                                onClick={() => setHoldingApp(app)}
                                title={t("eng.hold_return_btn")}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                  <line x1="12" y1="9" x2="12" y2="13" />
                                  <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                <span>{t("eng.hold_return_btn")}</span>
                              </button>

                              <button
                                type="button"
                                className="eng-action-btn eng-btn-approve"
                                onClick={() => {
                                  if (!orInfo.hasReceipt) {
                                    showToast(
                                      language === "en"
                                        ? "Cannot approve or pin: Official Receipt (O.R.) has not been uploaded yet."
                                        : "Hindi maaaring i-pin sa 3D Mapa: Wala pang nai-uupload na Official Receipt (O.R.) ang aplikante."
                                    );
                                    return;
                                  }
                                  setApprovingApp(app);
                                  setConfirmOrReviewed(orInfo.isOrVerified);
                                }}
                                disabled={!orInfo.hasReceipt}
                                title={
                                  !orInfo.hasReceipt
                                    ? (language === "en" ? "Cannot pin without Official Receipt" : "Hindi mai-pin nang walang resibo")
                                    : t("eng.approve_pin_btn")
                                }
                                style={!orInfo.hasReceipt ? { opacity: 0.45, cursor: "not-allowed", filter: "grayscale(1)" } : undefined}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>{t("eng.approve_pin_btn")}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 3: INFRASTRUCTURE PROJECTS MONITORING
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "projects" && (
            <div className="eng-tab-pane">
              <div className="eng-tab-header">
                <div>
                  <h3 className="eng-tab-title">{language === "en" ? "Municipal Infrastructure Projects Monitoring" : "Subaybay sa mga Proyekto ng Bayan"}</h3>
                  <p className="eng-tab-sub">
                    {language === "en" ? "Registry of roads, bridges, evacuation centers, and public infrastructure supervised by the Engineering Office." : "Talaan ng mga kalsada, evacuation centers, at pampublikong gusali na pinangangasiwaan ng Tanggapan ng Inhinyero."}
                  </p>
                </div>
                <div className="eng-tab-actions">
                  <button
                    type="button"
                    className="eng-btn eng-btn-primary"
                    onClick={() => onNavigateToMap()}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                      <line x1="8" y1="2" x2="8" y2="18" />
                      <line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                    <span>{language === "en" ? "View All in 3D Map" : "Tingnan Lahat sa 3D Mapa"}</span>
                  </button>
                </div>
              </div>

              {metrics.pendingLguCount > 0 && (
                <div className="eng-lgu-pending-banner">
                  <span className="eng-lgu-pending-icon-svg">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </span>
                  <div>
                    <strong>
                      {language === "en"
                        ? `${metrics.pendingLguCount} LGU Project${metrics.pendingLguCount > 1 ? "s" : ""} awaiting technical confirmation and 3D map pinning.`
                        : `May ${metrics.pendingLguCount} LGU Proyekto na naghihintay ng iyong kumpirmasyon bago mai-pin sa 3D Mapa.`}
                    </strong>
                    <p>
                      {language === "en"
                        ? "Review the project coordinates, budget, and contractor details below, then click \"Confirm & Pin to 3D Map\"."
                        : "Suriin ang mga mohon/coordinates, badyet, at kontratista sa ibaba, at i-click ang \"Kumpirmahin at I-pin sa 3D Mapa\"."}
                    </p>
                  </div>
                </div>
              )}

              {/* Projects Filter & View Mode Controls Bar */}
              <div className="eng-projects-toolbar-card">
                <div className="eng-search-box">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    className="eng-search-input"
                    placeholder={language === "en" ? "Search project name, code, contractor, barangay..." : "Maghanap ayon sa pangalan, code, kontratista, barangay..."}
                    value={projectSearchQuery}
                    onChange={(e) => setProjectSearchQuery(e.target.value)}
                  />
                  {projectSearchQuery && (
                    <button type="button" className="eng-clear-btn" onClick={() => setProjectSearchQuery("")}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="eng-filter-controls">
                  <div className="eng-status-pills">
                    <button
                      type="button"
                      className={`eng-status-tab ${projectStatusFilter === "all" ? "active" : ""}`}
                      onClick={() => setProjectStatusFilter("all")}
                    >
                      {language === "en" ? "All Projects" : "Lahat"} ({projects.length})
                    </button>
                    <button
                      type="button"
                      className={`eng-status-tab pending ${projectStatusFilter === "pending_confirmation" ? "active" : ""}`}
                      onClick={() => setProjectStatusFilter("pending_confirmation")}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 4 }}>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {language === "en" ? "For Confirmation" : "Naghihintay"} ({metrics.pendingLguCount})
                    </button>
                    <button
                      type="button"
                      className={`eng-status-tab approved ${projectStatusFilter === "confirmed" ? "active" : ""}`}
                      onClick={() => setProjectStatusFilter("confirmed")}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 4 }}>
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      {language === "en" ? "Confirmed & Pinned" : "Kinumpirma"} ({projects.length - metrics.pendingLguCount})
                    </button>
                  </div>

                  <select
                    className="eng-select"
                    value={projectBarangayFilter}
                    onChange={(e) => setProjectBarangayFilter(e.target.value)}
                  >
                    <option value="">{t("eng.all_barangays")}</option>
                    {LUISIANA_BARANGAYS.map((bgy) => (
                      <option key={bgy} value={bgy}>{bgy}</option>
                    ))}
                  </select>

                  {/* View Mode Toggle: List vs Grid */}
                  <div className="eng-view-toggle">
                    <button
                      type="button"
                      className={`eng-view-toggle-btn ${projectsViewMode === "list" ? "active" : ""}`}
                      onClick={() => setProjectsViewMode("list")}
                      title={language === "en" ? "List View" : "List View"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                      <span>List</span>
                    </button>
                    <button
                      type="button"
                      className={`eng-view-toggle-btn ${projectsViewMode === "grid" ? "active" : ""}`}
                      onClick={() => setProjectsViewMode("grid")}
                      title={language === "en" ? "Grid View" : "Grid View"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                      </svg>
                      <span>Grid</span>
                    </button>
                  </div>
                </div>

                {/* Small Sector Buttons Row for Municipal Projects */}
                <div className="eng-sector-pills-row">
                  <span className="eng-sector-pills-label">
                    🏢 {language === "en" ? "Sector:" : "Sektor:"}
                  </span>
                  <button
                    type="button"
                    className={`eng-sector-pill-btn all-pill ${projectSectorFilter === "all" ? "active" : ""}`}
                    onClick={() => setProjectSectorFilter("all")}
                  >
                    <span>{language === "en" ? "All" : "Lahat"}</span>
                    <span className="eng-sector-pill-count">{projects.length}</span>
                  </button>
                  {SECTORAL_KEYS.map((k) => {
                    const def = SECTOR_DEFINITIONS[k];
                    const isSelected = projectSectorFilter === k;
                    const Icon = def.icon;
                    const count = sectorProjectCounts[k] || 0;
                    return (
                      <button
                        key={k}
                        type="button"
                        className={`eng-sector-pill-btn ${isSelected ? "active" : ""}`}
                        onClick={() => setProjectSectorFilter(isSelected ? "all" : k)}
                        style={{
                          borderColor: isSelected ? def.color : undefined,
                          background: isSelected ? def.color : undefined,
                          color: isSelected ? "#ffffff" : undefined,
                        }}
                        title={language === "en" ? `Filter by ${def.title}` : `I-filter sa ${def.title}`}
                      >
                        <span className="eng-sector-pill-icon" style={{ color: isSelected ? "#ffffff" : def.color }}>
                          <Icon size={14} color={isSelected ? "#ffffff" : def.color} />
                        </span>
                        <span className="eng-sector-pill-title">{def.title}</span>
                        <span className="eng-sector-pill-count">{count}</span>
                      </button>
                    );
                  })}
                  {projectSectorFilter !== "all" && (
                    <button
                      type="button"
                      className="eng-sector-pill-clear"
                      onClick={() => setProjectSectorFilter("all")}
                      title={language === "en" ? "Reset sector filter" : "I-reset ang filter sa sektor"}
                    >
                      ✕ {language === "en" ? "Clear" : "I-reset"}
                    </button>
                  )}
                </div>
              </div>

              {displayedProjects.length === 0 ? (
                <div className="eng-state-card empty">
                  <div className="eng-empty-icon-svg">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3>{language === "en" ? "No infrastructure projects found" : "Walang natagpuang proyekto"}</h3>
                  <p>
                    {projectSearchQuery || projectBarangayFilter || projectSectorFilter !== "all" || projectStatusFilter !== "all"
                      ? (language === "en" ? "Try adjusting your search query or filter." : "Subukang baguhin ang iyong paghahanap o filter.")
                      : (language === "en" ? "No projects are currently registered." : "Walang nakatalang proyekto sa kasalukuyan.")}
                  </p>
                </div>
              ) : projectsViewMode === "list" ? (
                /* ── LIST VIEW TABLE (DEFAULT) ── */
                <div className="eng-projects-table-card">
                  <div className="eng-projects-table-scroll">
                    <table className="eng-table eng-projects-table">
                      <thead>
                        <tr>
                          <th style={{ width: 84 }}>{language === "en" ? "Photo" : "Litrato"}</th>
                          <th>{language === "en" ? "Project & Location" : "Proyekto & Lokasyon"}</th>
                          <th>{language === "en" ? "Phase & Type" : "Yugto & Uri"}</th>
                          <th>{language === "en" ? "Confirmation Status" : "Kumpirmasyon"}</th>
                          <th>{language === "en" ? "Budget & Contractor" : "Badyet & Kontratista"}</th>
                          <th style={{ minWidth: 130 }}>{language === "en" ? "Progress" : "Pagsulong"}</th>
                          <th style={{ textAlign: "right", minWidth: 170 }}>{language === "en" ? "Action" : "Aksyon"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedProjects.map((proj) => {
                          const progress = proj.progress != null ? Number(proj.progress) : 0;
                          const isPendingConfirm = proj.engineerApproved === false;
                          const photoInfo = getProjectGeotaggedPhoto(proj, applications);
                          const projSectorKey = getBuildingSector(proj);
                          const projSectorDef = SECTOR_DEFINITIONS[projSectorKey];

                          return (
                            <tr key={proj.id} className={`eng-project-row ${isPendingConfirm ? "pending-approval" : ""}`}>
                              <td className="eng-table-photo-col">
                                {photoInfo ? (
                                  <button
                                    type="button"
                                    className="eng-photo-thumb-btn"
                                    onClick={() =>
                                      setViewingDoc({
                                        url: photoInfo.url,
                                        name: `${proj.name} — ${photoInfo.caption || (language === "en" ? "Geotagged Site Photo" : "Geotagged Litrato ng Site")}`,
                                      })
                                    }
                                    title={
                                      language === "en"
                                        ? `Click to view full-size Geotagged Photo (${photoInfo.lat != null && photoInfo.lon != null ? `${Number(photoInfo.lat).toFixed(4)}, ${Number(photoInfo.lon).toFixed(4)}` : "GPS Tagged"})`
                                        : `I-click upang makita ang buong laki ng Litrato (${photoInfo.lat != null && photoInfo.lon != null ? `${Number(photoInfo.lat).toFixed(4)}, ${Number(photoInfo.lon).toFixed(4)}` : "GPS Tagged"})`
                                    }
                                  >
                                    <img
                                      src={photoInfo.url}
                                      alt={photoInfo.caption || proj.name}
                                      className="eng-table-photo-img"
                                      loading="lazy"
                                      onError={(e) => {
                                        (e.currentTarget as HTMLElement).style.display = "none";
                                        const p = e.currentTarget.parentElement;
                                        if (p) p.classList.add("has-fallback");
                                      }}
                                    />
                                    <span className="eng-photo-geotag-badge" title="GPS Geotagged">
                                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                        <circle cx="12" cy="10" r="3" />
                                      </svg>
                                      <span>GPS</span>
                                    </span>
                                  </button>
                                ) : (
                                  <div
                                    className="eng-no-photo-box"
                                    title={language === "en" ? "No geotagged site photo uploaded" : "Walang naka-upload na litrato"}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                      <circle cx="12" cy="13" r="4" />
                                      <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                    <span>No Photo</span>
                                  </div>
                                )}
                              </td>

                              <td>
                                <div className="eng-proj-list-title-cell">
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                                    <span className="eng-proj-code mono">{proj.code || proj.id}</span>
                                    {projSectorDef && (
                                      <span
                                        className="eng-sector-badge-pill"
                                        style={{
                                          background: projSectorDef.badgeBg,
                                          color: projSectorDef.badgeColor,
                                          margin: 0,
                                          padding: "2px 8px",
                                          fontSize: "0.68rem",
                                        }}
                                      >
                                        {projSectorDef.title}
                                      </span>
                                    )}
                                  </div>
                                  <strong className="eng-proj-name-link">{proj.name}</strong>
                                  <div className="eng-proj-meta-sub">
                                    <span className="eng-loc-tag">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                        <circle cx="12" cy="10" r="3" />
                                      </svg>
                                      <span>Brgy. {proj.barangay || "Luisiana"}</span>
                                    </span>
                                    {proj.location && (
                                      <span className="eng-coords-tag mono">
                                        {Number(proj.location.lat).toFixed(4)}, {Number(proj.location.lon).toFixed(4)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              <td>
                                <span className={`eng-proj-status-badge ${(proj.lifecyclePhase || "Planning").toLowerCase()}`}>
                                  {proj.lifecyclePhase || "Planning"}
                                </span>
                                <div className="eng-table-sub" style={{ marginTop: 4 }}>
                                  {proj.isPrivateApplication ? "Private Infra" : proj.department || "Municipal Infra"}
                                </div>
                              </td>

                              <td>
                                {isPendingConfirm ? (
                                  <span className="eng-lgu-confirm-badge pending">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <circle cx="12" cy="12" r="10" />
                                      <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    <span>{language === "en" ? "For Engineer Confirmation" : "Naghihintay ng Kumpirmasyon"}</span>
                                  </span>
                                ) : (
                                  <span className="eng-lgu-confirm-badge confirmed">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                      <polyline points="22 4 12 14.01 9 11.01" />
                                    </svg>
                                    <span>{language === "en" ? "Confirmed & Pinned" : "Kinumpirma at Na-pin"}</span>
                                  </span>
                                )}
                              </td>

                              <td>
                                <strong className="eng-proj-budget">
                                  {proj.budgetTotal ? formatCurrency(proj.budgetTotal) : (language === "en" ? "Allocated" : "Nakatakda")}
                                </strong>
                                <div className="eng-table-sub">
                                  {proj.contractor || "Engineering Office"}
                                </div>
                              </td>

                              <td>
                                <div className="eng-list-progress-cell">
                                  <div className="eng-progress-track">
                                    <div
                                      className="eng-progress-fill"
                                      style={{
                                        width: `${Math.min(100, Math.max(0, progress))}%`,
                                        background: progress >= 100 ? "#10b981" : "#0071e3",
                                      }}
                                    />
                                  </div>
                                  <span className="eng-list-progress-num">{progress}%</span>
                                </div>
                              </td>

                              <td style={{ textAlign: "right" }}>
                                {isPendingConfirm ? (
                                  <button
                                    type="button"
                                    className="eng-btn-confirm-lgu"
                                    onClick={() => {
                                      setApprovingLguProj(proj);
                                      setLguApprovalNotes("");
                                    }}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>{language === "en" ? "Confirm & Pin to 3D Map" : "Kumpirmahin at I-pin"}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="eng-proj-fly-btn"
                                    onClick={() => handleFlyToProject(proj)}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                                      <line x1="8" y1="2" x2="8" y2="18" />
                                      <line x1="16" y1="6" x2="16" y2="22" />
                                    </svg>
                                    <span>{language === "en" ? "Fly in 3D Map" : "I-fly sa 3D Mapa"}</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* ── GRID VIEW (CARDS) WITH PURE SVGS ── */
                <div className="eng-projects-grid">
                  {displayedProjects.map((proj) => {
                    const progress = proj.progress != null ? Number(proj.progress) : 0;
                    const isPendingConfirm = proj.engineerApproved === false;
                    const photoInfo = getProjectGeotaggedPhoto(proj, applications);
                    const projSectorKey = getBuildingSector(proj);
                    const projSectorDef = SECTOR_DEFINITIONS[projSectorKey];

                    return (
                      <div key={proj.id} className={`eng-project-card ${isPendingConfirm ? "pending-approval" : ""}`}>
                        <div className="eng-project-card-head">
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                              <span className="eng-proj-code">{proj.code || proj.id}</span>
                              {projSectorDef && (
                                <span
                                  className="eng-sector-badge-pill"
                                  style={{
                                    background: projSectorDef.badgeBg,
                                    color: projSectorDef.badgeColor,
                                    margin: 0,
                                    padding: "2px 8px",
                                    fontSize: "0.68rem",
                                  }}
                                >
                                  {projSectorDef.title}
                                </span>
                              )}
                            </div>
                            <h4 className="eng-proj-name">{proj.name}</h4>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                            <span className={`eng-proj-status-badge ${(proj.lifecyclePhase || "Planning").toLowerCase()}`}>
                              {proj.lifecyclePhase || "Planning"}
                            </span>
                            {isPendingConfirm ? (
                              <span className="eng-lgu-confirm-badge pending">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                <span>{language === "en" ? "For Engineer Confirmation" : "Naghihintay ng Kumpirmasyon"}</span>
                              </span>
                            ) : (
                              <span className="eng-lgu-confirm-badge confirmed">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                  <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                                <span>{language === "en" ? "Confirmed & Pinned" : "Kinumpirma at Na-pin"}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Geotagged Site Photo Card Banner */}
                        {photoInfo ? (
                          <div
                            className="eng-card-photo-hero"
                            onClick={() =>
                              setViewingDoc({
                                url: photoInfo.url,
                                name: `${proj.name} — ${photoInfo.caption || (language === "en" ? "Geotagged Site Photo" : "Geotagged Litrato ng Site")}`,
                              })
                            }
                            title={language === "en" ? "Click to view full photo" : "I-click para makita ang buong litrato"}
                          >
                            <img
                              src={photoInfo.url}
                              alt={photoInfo.caption || proj.name}
                              className="eng-card-photo-img"
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = "none";
                                const p = e.currentTarget.parentElement;
                                if (p) p.classList.add("has-fallback");
                              }}
                            />
                            <div className="eng-card-photo-tag">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                <circle cx="12" cy="10" r="3" />
                              </svg>
                              <span>
                                {photoInfo.lat != null && photoInfo.lon != null
                                  ? `${Number(photoInfo.lat).toFixed(4)}, ${Number(photoInfo.lon).toFixed(4)}`
                                  : (language === "en" ? "Geotagged Photo" : "Geotagged Litrato")}
                              </span>
                            </div>
                            <span className="eng-card-photo-zoom-hint">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="11" y1="8" x2="11" y2="14" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                              </svg>
                              <span>{language === "en" ? "Enlarge" : "Palakihin"}</span>
                            </span>
                          </div>
                        ) : (
                          <div className="eng-card-no-photo-strip">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                              <circle cx="12" cy="13" r="4" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                            <span>{language === "en" ? "No Geotagged Site Photo Uploaded" : "Walang Naka-upload na Litrato ng Site"}</span>
                          </div>
                        )}

                        <p className="eng-proj-desc">{proj.description || (language === "en" ? "Public infrastructure project of the Municipality of Luisiana." : "Pampublikong imprastraktura ng Bayan ng Luisiana.")}</p>

                        <div className="eng-proj-meta-grid">
                          <div>
                            <span className="eng-proj-meta-label">Barangay</span>
                            <strong>Brgy. {proj.barangay || "Luisiana"}</strong>
                          </div>
                          <div>
                            <span className="eng-proj-meta-label">{language === "en" ? "Budget" : "Badyet"}</span>
                            <strong>{proj.budgetTotal ? formatCurrency(proj.budgetTotal) : (language === "en" ? "Allocated" : "Nakatakda")}</strong>
                          </div>
                          <div>
                            <span className="eng-proj-meta-label">{language === "en" ? "Engineer / Contractor" : "Inhinyero / Kontratista"}</span>
                            <strong>{proj.contractor || "Engineering Office"}</strong>
                          </div>
                          {proj.location && (
                            <div>
                              <span className="eng-proj-meta-label">Coordinates</span>
                              <strong style={{ fontFamily: "monospace", fontSize: "0.74rem" }}>
                                {Number(proj.location.lat).toFixed(4)}, {Number(proj.location.lon).toFixed(4)}
                              </strong>
                            </div>
                          )}
                        </div>

                        <div className="eng-proj-progress-wrap">
                          <div className="eng-proj-progress-labels">
                            <span>{language === "en" ? "Overall Progress" : "Kabuuang Pagsulong"}</span>
                            <strong>{progress}%</strong>
                          </div>
                          <div className="eng-progress-track">
                            <div
                              className="eng-progress-fill"
                              style={{
                                width: `${Math.min(100, Math.max(0, progress))}%`,
                                background: progress >= 100 ? "#10b981" : "#0071e3",
                              }}
                            />
                          </div>
                        </div>

                        <div className="eng-proj-footer">
                          {isPendingConfirm ? (
                            <button
                              type="button"
                              className="eng-btn-confirm-lgu"
                              onClick={() => {
                                setApprovingLguProj(proj);
                                setLguApprovalNotes("");
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>{language === "en" ? "Confirm & Pin to 3D Map" : "Kumpirmahin at I-pin sa 3D Mapa"}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="eng-proj-fly-btn"
                              onClick={() => handleFlyToProject(proj)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                                <line x1="8" y1="2" x2="8" y2="18" />
                                <line x1="16" y1="6" x2="16" y2="22" />
                              </svg>
                              <span>{language === "en" ? "Fly in 3D Map" : "I-fly sa 3D Mapa"}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 4: INSPECTION SCHEDULES (OCULAR CALENDAR)
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "schedules" && (
            <div className="eng-tab-pane">
              <div className="eng-tab-header">
                <div>
                  <h3 className="eng-tab-title">{language === "en" ? "Ocular Field Inspection Schedules" : "Iskedyul ng Ocular Field Inspections"}</h3>
                  <p className="eng-tab-sub">
                    {language === "en" ? "Designated dates and times for Engineer site visits prior to construction clearance." : "Takdang araw at oras ng pagbisita ng mga Inhinyero sa lokasyon ng aplikante bago aprubahan ang konstruksyon."}
                  </p>
                </div>
                <div className="eng-tab-actions">
                  <button
                    type="button"
                    className="eng-btn eng-btn-primary"
                    onClick={() => setIsAddScheduleModalOpen(true)}
                  >
                    <span>{language === "en" ? "+ Schedule New Inspection" : "+ Magtakda ng Bagong Iskedyul"}</span>
                  </button>
                </div>
              </div>

              <div className="eng-schedules-table-card">
                <table className="eng-table">
                  <thead>
                    <tr>
                      <th>Tracking #</th>
                      <th>{language === "en" ? "Applicant & Barangay" : "Aplikante & Barangay"}</th>
                      <th>{language === "en" ? "Building Type" : "Uri ng Gusali"}</th>
                      <th>{language === "en" ? "Date & Time" : "Petsa at Oras"}</th>
                      <th>{language === "en" ? "Assigned Inspector" : "Nakatagang Inhinyero"}</th>
                      <th>{language === "en" ? "O.R. Picture Audit" : "Pagsusuri ng Resibo"}</th>
                      <th>{language === "en" ? "Status" : "Katayuan"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((sch) => {
                      const linkedApp = applications.find(
                        (a) => (a.trackingNumber || a.id)?.toLowerCase() === sch.trackingNumber?.toLowerCase()
                      );
                      const orInfo = linkedApp ? getApplicationReceiptInfo(linkedApp) : null;

                      return (
                        <tr key={sch.id}>
                          <td><strong className="mono">{sch.trackingNumber}</strong></td>
                          <td>
                            <strong>{sch.applicantName}</strong>
                            <div className="eng-table-sub">Brgy. {sch.barangay}</div>
                          </td>
                          <td>{sch.buildingType}</td>
                          <td>
                            <strong>{sch.date}</strong>
                            <div className="eng-table-sub">{sch.time}</div>
                          </td>
                          <td>{sch.assignedInspector}</td>
                          <td>
                            {/* O.R. Picture Verification Status for Inspection */}
                            {!orInfo || !orInfo.hasReceipt ? (
                              <span className="eng-status-pill pending" style={{ background: "rgba(107, 114, 128, 0.12)", color: "#6b7280", fontSize: "0.72rem" }}>
                                {language === "en" ? "• O.R. Not Uploaded Yet" : "• Hindi Pa Nai-upload"}
                              </span>
                            ) : !orInfo.isOrVerified ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span
                                  className="eng-status-pill pending"
                                  style={{
                                    background: "rgba(245, 158, 11, 0.14)",
                                    color: "#b45309",
                                    borderColor: "rgba(245, 158, 11, 0.35)",
                                    fontSize: "0.72rem",
                                  }}
                                >
                                  {language === "en" ? "• Needs O.R. Review" : "• Kailangan ng O.R. Review"}
                                </span>
                                {linkedApp && (
                                  <button
                                    type="button"
                                    className="eng-table-action-btn review-or"
                                    onClick={() => setReviewingOrApp(linkedApp)}
                                    style={{ padding: "2px 7px", fontSize: "0.7rem", height: "auto" }}
                                    title={language === "en" ? "Review O.R. picture prior to inspection" : "Suriin ang litrato ng resibo bago mag-inspeksyon"}
                                  >
                                    <span>{language === "en" ? "Review O.R." : "Suriin"}</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span
                                  className="eng-status-pill verified"
                                  style={{
                                    background: "rgba(16, 185, 129, 0.12)",
                                    color: "#059669",
                                    borderColor: "rgba(16, 185, 129, 0.3)",
                                    fontSize: "0.72rem",
                                  }}
                                >
                                  {language === "en" ? "✓ O.R. Verified" : "✓ Na-verify ang Resibo"}
                                </span>
                                {linkedApp && (
                                  <button
                                    type="button"
                                    className="eng-table-action-btn view"
                                    onClick={() => setReviewingOrApp(linkedApp)}
                                    style={{ padding: "2px 5px", height: "auto" }}
                                    title={language === "en" ? "Inspect O.R. Photo" : "Suriin ang Litrato ng Resibo"}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <circle cx="11" cy="11" r="8" />
                                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`eng-schedule-pill ${sch.status.toLowerCase().replace(/\s+/g, "-")}`}>
                              {sch.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 5: ENGINEERING STAFF & ROSTER
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "personnel" && (
            <div className="eng-tab-pane">
              <div className="eng-tab-header">
                <div>
                  <h3 className="eng-tab-title">{language === "en" ? "Engineering Staff & Personnel Directory" : "Direktoryo ng Kawani at Inhinyero"}</h3>
                  <p className="eng-tab-sub">
                    {language === "en" ? "Official roster of licensed Civil Engineers, Building Inspectors, and GIS specialists of the Municipality." : "Opisyal na talaan ng mga lisensyadong Civil Engineers, Building Inspectors, at GIS cartographers ng Munisipyo."}
                  </p>
                </div>
              </div>

              <div className="eng-staff-grid">
                {personnelList.map((st) => (
                  <div key={st.id} className="eng-staff-card">
                    <div className="eng-staff-head">
                      <div className="eng-staff-avatar">{st.name[0]}</div>
                      <div>
                        <strong className="eng-staff-name">{st.name}</strong>
                        <div className="eng-staff-pos">{st.position}</div>
                      </div>
                    </div>
                    <div className="eng-staff-body">
                      <div className="eng-staff-item">
                        <span>{language === "en" ? "Specialization:" : "Espesyalisasyon:"}</span>
                        <strong>{st.specialization}</strong>
                      </div>
                      <div className="eng-staff-item">
                        <span>{language === "en" ? "Phone:" : "Telepono:"}</span>
                        <strong>{st.phone}</strong>
                      </div>
                      <div className="eng-staff-item">
                        <span>{language === "en" ? "Status:" : "Katayuan:"}</span>
                        <span className={`eng-staff-status-badge ${st.status.toLowerCase().replace(/\s+/g, "-")}`}>
                          {st.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 6: DEDICATED ENGINEERING DOCUMENTS & BLUEPRINTS VAULT
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "documents" && (
            <div className="eng-tab-pane">
              <EngineeringDocumentsPage
                session={session}
                onNavigateToMap={onNavigateToMap}
                onNavigate={onNavigate}
                onLogout={onLogout}
                hideHeader={true}
              />
            </div>
          )}
        </main>
      </div>

      {/* ── APPROVAL & 3D PINNING MODAL ─────────────────────────────────── */}
      {approvingApp && (
        <div className="eng-modal-backdrop" onClick={() => { if (!isSubmittingApproval) setApprovingApp(null); }}>
          <div className="eng-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="eng-modal-header">
              <div className="eng-modal-seal-badge">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <h3 className="eng-modal-title">{t("eng.approve_modal_title")}</h3>
                <span className="eng-modal-sub">{approvingApp.trackingNumber || approvingApp.id}</span>
              </div>
            </div>

            <div className="eng-modal-body">
              <div className="eng-modal-app-summary">
                <div><strong>{t("common.applicant")}:</strong> {approvingApp.applicant?.fullName || approvingApp.applicantName}</div>
                <div><strong>{language === "en" ? "Building:" : "Gusali:"}</strong> {approvingApp.lotDetails?.proposedBuildingType || approvingApp.buildingType || "Residential"}</div>
                <div><strong>{t("common.barangay")}:</strong> Brgy. {approvingApp.applicant?.barangay || approvingApp.barangay}, Luisiana</div>
              </div>

              {/* O.R. Picture Verification Section inside Citizen Approval Modal */}
              {(() => {
                const orInfo = getApplicationReceiptInfo(approvingApp);
                if (!orInfo.hasReceipt) {
                  return (
                    <div className="eng-modal-or-empty-warning" style={{ margin: "14px 0" }}>
                      ⚠️ {language === "en"
                        ? "Warning: Applicant has not uploaded an Official Receipt (O.R.) yet. Pinning to 3D map is restricted."
                        : "Babala: Wala pang nai-upload na Official Receipt (O.R.) ang aplikante. Hindi maaaring i-pin sa 3D mapa nang walang resibo."}
                    </div>
                  );
                }

                return (
                  <div className={`eng-modal-or-review-section ${confirmOrReviewed || orInfo.isOrVerified ? "is-verified" : "needs-review"}`}>
                    <div className="eng-modal-or-header">
                      <div className="eng-modal-or-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <strong>{language === "en" ? "Official Receipt Photo Review & Audit" : "Pagsusuri sa Litrato ng Official Receipt"}</strong>
                        <p>
                          {language === "en"
                            ? "Treasury/Assessor proof of payment photo must be verified before granting building clearance and pinning to 3D Map."
                            : "Kailangang masuri ang patunay ng bayad bago magbigay ng clearance at i-pin sa 3D Mapa."}
                        </p>
                      </div>
                    </div>

                    <div className="eng-modal-or-preview-row">
                      <div
                        className="eng-modal-or-photo-card"
                        onClick={() => setViewingDoc({ url: orInfo.receiptUrl, name: `Official Receipt #${orInfo.orNumber}` })}
                        title={language === "en" ? "Click to inspect receipt photo full size" : "I-click para suriin ang buong litrato"}
                      >
                        <img src={orInfo.receiptUrl} alt={`OR ${orInfo.orNumber}`} className="eng-modal-or-photo-img" />
                        <div className="eng-modal-or-photo-overlay">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <span>{language === "en" ? "Zoom" : "Palakihin"}</span>
                        </div>
                      </div>

                      <div className="eng-modal-or-info-col">
                        <div><span className="lbl">{language === "en" ? "O.R. Number:" : "Numero ng Resibo:"}</span> <strong>{orInfo.orNumber}</strong></div>
                        {orInfo.amount != null && <div><span className="lbl">{language === "en" ? "Amount Paid:" : "Halagang Binayaran:"}</span> <strong>{formatCurrency(orInfo.amount)}</strong></div>}
                        {orInfo.paymentDate && <div><span className="lbl">{language === "en" ? "Payment Date:" : "Petsa ng Bayad:"}</span> <span>{formatDate(orInfo.paymentDate)}</span></div>}
                        <div>
                          <span className="lbl">{language === "en" ? "Status:" : "Katayuan:"}</span>
                          <span style={{ color: (confirmOrReviewed || orInfo.isOrVerified) ? "#059669" : "#d97706", fontWeight: 700 }}>
                            {(confirmOrReviewed || orInfo.isOrVerified)
                              ? (language === "en" ? "✓ Verified" : "✓ Na-verify")
                              : (language === "en" ? "⚠️ Needs Verification" : "⚠️ Kailangang Beripikahin")}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="eng-or-review-badge-btn"
                        onClick={() => {
                          setReviewingOrApp(approvingApp);
                        }}
                        style={{ alignSelf: "center", padding: "6px 12px", whiteSpace: "nowrap" }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                        <span>{language === "en" ? "Detailed Review" : "Detalyadong Pagsusuri"}</span>
                      </button>
                    </div>

                    <label className="eng-modal-checkbox-label">
                      <input
                        type="checkbox"
                        checked={confirmOrReviewed}
                        onChange={(e) => setConfirmOrReviewed(e.target.checked)}
                      />
                      <span>
                        {language === "en"
                          ? "I confirm that I have reviewed the Official Receipt photo and verified payment legitimacy before approving and pinning to the 3D Map."
                          : "Kinukumpirma ko na aking sinuri ang litrato ng Official Receipt at napatunayang wasto ang pagbabayad bago aprubahan at i-pin sa 3D Mapa."}
                      </span>
                    </label>
                  </div>
                );
              })()}

              <div className="eng-modal-field">
                <label className="eng-modal-label">{language === "en" ? "Official Notes of the Municipal Engineer:" : "Opisyal na Notes ng Municipal Engineer:"}</label>
                <textarea
                  className="eng-modal-textarea"
                  rows={3}
                  placeholder={language === "en" ? "Enter technical engineering findings or clearance instructions..." : "Maglagay ng technical engineering findings o clearance instructions..."}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="eng-modal-footer">
              <button
                type="button"
                className="eng-btn eng-btn-outline"
                onClick={() => setApprovingApp(null)}
                disabled={isSubmittingApproval}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="eng-btn eng-btn-primary"
                onClick={handleConfirmApproval}
                disabled={isSubmittingApproval || !confirmOrReviewed}
                title={!confirmOrReviewed ? (language === "en" ? "Please verify and check the O.R. photo confirmation first" : "Mangyaring suriin at lagyan ng tsek ang beripikasyon ng resibo") : undefined}
                style={!confirmOrReviewed ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
              >
                {isSubmittingApproval ? (language === "en" ? "Approving..." : "Ina-aprubahan...") : t("eng.approve_confirm_btn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DEDICATED OFFICIAL RECEIPT (O.R.) PICTURE REVIEW & AUDIT MODAL ── */}
      {reviewingOrApp && (() => {
        const orInfo = getApplicationReceiptInfo(reviewingOrApp);
        const tracking = reviewingOrApp.trackingNumber || reviewingOrApp.id;
        const applicant = reviewingOrApp.applicant?.fullName || reviewingOrApp.applicantName || "Private Applicant";
        const bgy = reviewingOrApp.applicant?.barangay || reviewingOrApp.barangay || "Luisiana";
        const bldg = reviewingOrApp.lotDetails?.proposedBuildingType || reviewingOrApp.buildingType || "Building";

        return (
          <div
            className="eng-modal-backdrop"
            onClick={() => {
              if (!isSubmittingOrReview) {
                setReviewingOrApp(null);
                setOrPictureZoom(1);
                setOrPictureRotation(0);
              }
            }}
          >
            <div
              className="eng-modal-card eng-or-review-modal-card"
              style={{ maxWidth: 960, width: "95vw" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="eng-modal-header" style={{ padding: "16px 20px" }}>
                <div className="eng-modal-seal-badge" style={{ background: "rgba(0, 113, 227, 0.12)", color: "#0071e3" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <h3 className="eng-modal-title" style={{ fontSize: "1.1rem" }}>
                    {language === "en"
                      ? "Official Receipt (O.R.) Picture Review & Verification"
                      : "Pagsusuri at Beripikasyon ng Litrato ng Official Receipt"}
                  </h3>
                  <span className="eng-modal-sub">
                    {tracking} · {applicant} · Brgy. {bgy} ({bldg})
                  </span>
                </div>
                <button
                  type="button"
                  className="eng-btn-close-modal"
                  onClick={() => {
                    setReviewingOrApp(null);
                    setOrPictureZoom(1);
                    setOrPictureRotation(0);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 6,
                    borderRadius: 6,
                    color: "var(--apple-text-secondary, #6e6e73)",
                  }}
                  aria-label="Close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Body: Left Pane (Viewer) & Right Pane (Details & Checklist) */}
              <div className="eng-or-review-modal-body">
                {/* Left Pane: Picture Viewport & Controls */}
                <div className="eng-or-viewer-pane">
                  <div className="eng-or-viewer-toolbar">
                    <div className="eng-or-viewer-badge">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <span>{Math.round(orPictureZoom * 100)}%</span>
                    </div>

                    <div className="eng-or-viewer-tools">
                      <button
                        type="button"
                        className="eng-or-tool-btn"
                        onClick={() => setOrPictureZoom((prev) => Math.min(prev + 0.25, 3))}
                        title={language === "en" ? "Zoom In" : "Palakihin"}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="eng-or-tool-btn"
                        onClick={() => setOrPictureZoom((prev) => Math.max(prev - 0.25, 0.5))}
                        title={language === "en" ? "Zoom Out" : "Paliitin"}
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="eng-or-tool-btn"
                        onClick={() => {
                          setOrPictureZoom(1);
                          setOrPictureRotation(0);
                        }}
                        title={language === "en" ? "Reset View" : "I-reset"}
                      >
                        ↺
                      </button>
                      <button
                        type="button"
                        className="eng-or-tool-btn"
                        onClick={() => setOrPictureRotation((prev) => (prev + 90) % 360)}
                        title={language === "en" ? "Rotate 90°" : "I-ikot ng 90°"}
                      >
                        ↷
                      </button>
                      <button
                        type="button"
                        className="eng-or-tool-btn"
                        onClick={() =>
                          setViewingDoc({
                            url: orInfo.receiptUrl,
                            name: `Official Receipt #${orInfo.orNumber} — ${applicant}`,
                          })
                        }
                        title={language === "en" ? "Full-screen Lightbox" : "Full-screen"}
                      >
                        ⛶
                      </button>
                    </div>
                  </div>

                  <div className="eng-or-canvas-wrap">
                    <img
                      src={orInfo.receiptUrl}
                      alt={`Official Receipt ${orInfo.orNumber}`}
                      className="eng-or-canvas-img"
                      style={{
                        transform: `scale(${orPictureZoom}) rotate(${orPictureRotation}deg)`,
                      }}
                    />
                  </div>
                </div>

                {/* Right Pane: Verification Details & Action Checklist */}
                <div className="eng-or-details-pane">
                  {/* Meta Card */}
                  <div className="eng-or-meta-card">
                    <div className="eng-or-meta-row">
                      <span className="lbl">{language === "en" ? "Receipt (O.R.) #:" : "Numero ng Resibo (O.R.):"}</span>
                      <strong className="val" style={{ fontFamily: "monospace", fontSize: "0.85rem", color: "#0071e3" }}>
                        {orInfo.orNumber}
                      </strong>
                    </div>
                    {orInfo.amount != null && (
                      <div className="eng-or-meta-row">
                        <span className="lbl">{language === "en" ? "Amount Paid:" : "Halagang Binayaran:"}</span>
                        <strong className="val" style={{ color: "#059669" }}>
                          {formatCurrency(orInfo.amount)}
                        </strong>
                      </div>
                    )}
                    {orInfo.paymentDate && (
                      <div className="eng-or-meta-row">
                        <span className="lbl">{language === "en" ? "Date of Payment:" : "Petsa ng Pagbabayad:"}</span>
                        <span className="val">{formatDate(orInfo.paymentDate)}</span>
                      </div>
                    )}
                    <div className="eng-or-meta-row">
                      <span className="lbl">{language === "en" ? "Issuing Office:" : "Tanggapan:"}</span>
                      <span className="val">{language === "en" ? "Municipal Treasury / Assessor Office" : "Ingat-Yaman / Assessor ng Luisiana"}</span>
                    </div>
                    <div className="eng-or-meta-row">
                      <span className="lbl">{language === "en" ? "Verification Status:" : "Katayuan ng Beripikasyon:"}</span>
                      <span
                        className={`eng-or-status-tag ${orInfo.isOrVerified ? "verified" : "pending"}`}
                        style={{ margin: 0 }}
                      >
                        {orInfo.isOrVerified
                          ? (language === "en" ? "✓ Verified by Engineer" : "✓ Na-verify ng Inhinyero")
                          : (language === "en" ? "⚠️ Needs Engineering Review" : "⚠️ Kailangan ng Pagsusuri")}
                      </span>
                    </div>
                  </div>

                  {/* Verification Checklist */}
                  <div className="eng-or-checklist-card">
                    <div className="eng-or-checklist-title">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{language === "en" ? "Engineering Review Checklist" : "Listahan ng Pagsusuri ng Inhinyero"}</span>
                    </div>
                    <label className="eng-or-check-item">
                      <input type="checkbox" defaultChecked />
                      <span>{language === "en" ? "Legible O.R. number and official municipal seal/header" : "Malinaw na numero ng resibo at selyo ng Munisipalidad"}</span>
                    </label>
                    <label className="eng-or-check-item">
                      <input type="checkbox" defaultChecked />
                      <span>{language === "en" ? "Paid amount corresponds with required building permit and zoning assessment" : "Tugma ang binayaran sa takdang assessment ng building permit at zoning"}</span>
                    </label>
                    <label className="eng-or-check-item">
                      <input type="checkbox" defaultChecked />
                      <span>{language === "en" ? "Official Cashier signature / treasury validating stamp present" : "May pirma ng Collecting Officer / Cashier at validated stamp"}</span>
                    </label>
                  </div>

                  {/* Notes & Findings Textarea */}
                  <div className="eng-modal-field" style={{ margin: 0 }}>
                    <label className="eng-modal-label">
                      {language === "en" ? "Engineer's Verification / Rejection Notes:" : "Tala ng Inhinyero / Dahilan kung Ibabalik:"}
                    </label>
                    <textarea
                      className="eng-modal-textarea"
                      rows={3}
                      placeholder={
                        language === "en"
                          ? "Enter receipt verification findings or feedback for citizen..."
                          : "Ilagay ang natuklasan sa resibo o dahilan kung kailangang mag-upload muli..."
                      }
                      value={orVerificationNotes}
                      onChange={(e) => setOrVerificationNotes(e.target.value)}
                    />
                  </div>

                  {/* Modal Action Buttons */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto", paddingTop: 10 }}>
                    <button
                      type="button"
                      className="eng-btn eng-btn-danger"
                      style={{ flex: 1, padding: "9px 12px", fontSize: "0.78rem" }}
                      onClick={() => handleRejectOrPicture(reviewingOrApp)}
                      disabled={isSubmittingOrReview}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <span>{isSubmittingOrReview ? "..." : (language === "en" ? "Reject & Request Re-upload" : "I-reject & Ipa-upload Muli")}</span>
                    </button>

                    <button
                      type="button"
                      className="eng-btn"
                      style={{
                        flex: 1.2,
                        padding: "9px 14px",
                        fontSize: "0.8rem",
                        background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                        color: "#ffffff",
                        border: "none",
                        boxShadow: "0 2px 10px rgba(16, 185, 129, 0.35)",
                      }}
                      onClick={() => handleVerifyOrPicture(reviewingOrApp)}
                      disabled={isSubmittingOrReview}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{isSubmittingOrReview ? (language === "en" ? "Verifying..." : "Bineberipika...") : (language === "en" ? "✓ Verify & Accept O.R." : "✓ I-verify at Tanggapin O.R.")}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── LGU PROJECT APPROVAL & PINNING MODAL ───────────────────────── */}
      {approvingLguProj && (
        <div className="eng-modal-backdrop" onClick={() => { if (!isSubmittingLguApproval) setApprovingLguProj(null); }}>
          <div className="eng-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="eng-modal-header">
              <div className="eng-modal-seal-badge" style={{ background: "rgba(16, 185, 129, 0.14)", color: "#10b981" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <h3 className="eng-modal-title">
                  {language === "en" ? "Confirm & Pin LGU Project to 3D Map" : "Kumpirmahin at I-pin ang LGU Proyekto sa 3D Mapa"}
                </h3>
                <span className="eng-modal-sub">
                  {approvingLguProj.code || approvingLguProj.id} · {language === "en" ? "Engineering Office Technical Siting & GIS Verification" : "Pagsusuri at Pag-apruba ng Tanggapan ng Inhinyero"}
                </span>
              </div>
            </div>

            <div className="eng-modal-body">
              <div className="eng-modal-app-summary">
                <div><strong>{language === "en" ? "Project Name:" : "Pangalan ng Proyekto:"}</strong> {approvingLguProj.name}</div>
                <div><strong>{language === "en" ? "Barangay Location:" : "Lokasyon ng Barangay:"}</strong> Brgy. {approvingLguProj.barangay || "Luisiana"}</div>
                <div>
                  <strong>{language === "en" ? "Approved Budget:" : "Inaprubahang Badyet:"}</strong> {approvingLguProj.budgetTotal ? formatCurrency(approvingLguProj.budgetTotal) : "Nakatakda"}
                </div>
                <div>
                  <strong>{language === "en" ? "Contractor / Implementing Office:" : "Kontratista / Tanggapan:"}</strong> {approvingLguProj.contractor || "Municipal Engineering Office"}
                </div>
                {approvingLguProj.location && (
                  <div>
                    <strong>{language === "en" ? "Coordinates (WGS84):" : "Mga Coordinate (WGS84):"}</strong> {Number(approvingLguProj.location.lat).toFixed(6)}°N, {Number(approvingLguProj.location.lon).toFixed(6)}°E
                  </div>
                )}
                {approvingLguProj.encodedBy && (
                  <div>
                    <strong>{language === "en" ? "Encoded By:" : "Nagtala:"}</strong> {approvingLguProj.encodedBy}
                  </div>
                )}
              </div>

              {/* Geotagged Site Photo Verification inside Confirmation Modal */}
              {(() => {
                const modalPhoto = getProjectGeotaggedPhoto(approvingLguProj, applications);
                if (!modalPhoto) return null;
                return (
                  <div className="eng-modal-photo-block">
                    <label className="eng-modal-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span>{language === "en" ? "Geotagged Site Photo Verification:" : "Beripikasyon ng Geotagged Litrato ng Site:"}</span>
                    </label>
                    <div
                      className="eng-modal-photo-card"
                      onClick={() =>
                        setViewingDoc({
                          url: modalPhoto.url,
                          name: `${approvingLguProj.name} — Geotagged Site Photo`,
                        })
                      }
                      title={language === "en" ? "Click to inspect high-resolution photo" : "I-click para suriin ang buong litrato"}
                    >
                      <img src={modalPhoto.url} alt="Geotagged Site" className="eng-modal-photo-img" />
                      <div className="eng-modal-photo-overlay">
                        <span className="eng-modal-photo-coords">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>
                            {modalPhoto.lat != null && modalPhoto.lon != null
                              ? `GPS: ${Number(modalPhoto.lat).toFixed(6)}°N, ${Number(modalPhoto.lon).toFixed(6)}°E`
                              : "GPS Geotagged"}
                          </span>
                        </span>
                        <span className="eng-modal-photo-zoom">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            <line x1="11" y1="8" x2="11" y2="14" />
                            <line x1="8" y1="11" x2="14" y2="11" />
                          </svg>
                          <span>{language === "en" ? "Inspect Photo" : "Suriin ang Litrato"}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="eng-modal-field">
                <label className="eng-modal-label">
                  {language === "en" ? "Official Technical Validation Notes / Siting Clearance:" : "Opisyal na Tala ng Municipal Engineer / Technical Clearance:"}
                </label>
                <textarea
                  className="eng-modal-textarea"
                  rows={3}
                  placeholder={
                    language === "en"
                      ? "Enter engineering verification notes (e.g. coordinates verified, compliant with setback and drainage, approved for 3D map transparency)..."
                      : "Maglagay ng tala ng inspeksyon (hal. nasuri ang mga mohon/coordinates, sumusunod sa setback at drainage, aprubado para sa 3D GIS mapa)..."
                  }
                  value={lguApprovalNotes}
                  onChange={(e) => setLguApprovalNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="eng-modal-footer">
              <button
                type="button"
                className="eng-btn eng-btn-outline"
                onClick={() => setApprovingLguProj(null)}
                disabled={isSubmittingLguApproval}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="eng-btn"
                style={{
                  background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                  color: "#ffffff",
                  border: "none",
                  boxShadow: "0 2px 10px rgba(16, 185, 129, 0.35)",
                }}
                onClick={handleConfirmLguApproval}
                disabled={isSubmittingLguApproval}
              >
                {isSubmittingLguApproval ? (
                  <span>{language === "en" ? "Confirming & Pinning..." : "Kinukumpirma..."}</span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{language === "en" ? "Confirm & Pin to 3D Map" : "Kumpirmahin at I-pin sa 3D Mapa"}</span>
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HOLD & RETURN MODAL ─────────────────────────────────────────── */}
      {holdingApp && (
        <div className="eng-modal-backdrop" onClick={() => { if (!isSubmittingHold) setHoldingApp(null); }}>
          <div className="eng-modal-card is-hold" onClick={(e) => e.stopPropagation()}>
            <div className="eng-modal-header is-hold">
              <div className="eng-modal-seal-badge hold">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="eng-modal-title">{t("eng.hold_modal_title")}</h3>
                <span className="eng-modal-sub">{holdingApp.trackingNumber || holdingApp.id}</span>
              </div>
            </div>

            <div className="eng-modal-body">
              <div className="eng-modal-app-summary">
                <div><strong>{t("common.applicant")}:</strong> {holdingApp.applicant?.fullName || holdingApp.applicantName}</div>
                <div><strong>{language === "en" ? "Building:" : "Gusali:"}</strong> {holdingApp.lotDetails?.proposedBuildingType || holdingApp.buildingType}</div>
                <div><strong>{t("common.barangay")}:</strong> Brgy. {holdingApp.applicant?.barangay || holdingApp.barangay}</div>
              </div>

              <div className="eng-modal-field">
                <label className="eng-modal-label">{language === "en" ? "Select Preset Reason or Type Reason:" : "Pumili ng Preset na Dahilan o Mag-type:"}</label>
                <div className="eng-preset-reasons">
                  {(language === "en" ? PRESET_HOLD_REASONS_EN : PRESET_HOLD_REASONS_TL).map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      className="eng-preset-btn"
                      onClick={() => setHoldReason(r)}
                    >
                      {r.slice(0, 75)}…
                    </button>
                  ))}
                </div>
                <textarea
                  className="eng-modal-textarea"
                  rows={3}
                  placeholder={language === "en" ? "Detailed reason for holding the application..." : "Detalyadong dahilan ng pag-hold..."}
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                />
              </div>
            </div>

            <div className="eng-modal-footer">
              <button
                type="button"
                className="eng-btn eng-btn-outline"
                onClick={() => setHoldingApp(null)}
                disabled={isSubmittingHold}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="eng-btn eng-btn-danger"
                onClick={handleConfirmHold}
                disabled={isSubmittingHold || !holdReason.trim()}
              >
                {isSubmittingHold ? (language === "en" ? "Holding..." : "Inilalagay sa hold...") : t("eng.hold_confirm_btn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD SCHEDULE MODAL ─────────────────────────────────────────── */}
      {isAddScheduleModalOpen && (
        <div className="eng-modal-backdrop" onClick={() => setIsAddScheduleModalOpen(false)}>
          <div className="eng-modal-card" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleAddSchedule}>
              <div className="eng-modal-header">
                <div className="eng-modal-seal-badge">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <h3 className="eng-modal-title">{t("eng.schedule_modal_title")}</h3>
                  <span className="eng-modal-sub">{t("eng.schedule_modal_sub")}</span>
                </div>
              </div>

              <div className="eng-modal-body">
                <div className="eng-modal-field">
                  <label className="eng-modal-label">{language === "en" ? "Tracking Reference Number *" : "Tracking Reference Number *"}</label>
                  <input
                    type="text"
                    className="eng-modal-input"
                    placeholder={language === "en" ? "e.g. LUIS-ZC-2026-9078" : "hal. LUIS-ZC-2026-9078"}
                    value={newScheduleForm.trackingNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      const matched = applications.find(
                        (a) => (a.trackingNumber || a.id)?.toLowerCase() === val.trim().toLowerCase()
                      );
                      if (matched) {
                        setNewScheduleForm((prev) => ({
                          ...prev,
                          trackingNumber: val,
                          applicantName: matched.applicant?.fullName || matched.applicantName || prev.applicantName,
                          barangay: matched.applicant?.barangay || matched.barangay || prev.barangay,
                          buildingType: matched.lotDetails?.proposedBuildingType || matched.buildingType || prev.buildingType,
                        }));
                      } else {
                        setNewScheduleForm((prev) => ({ ...prev, trackingNumber: val }));
                      }
                    }}
                    required
                  />
                </div>

                {/* Real-time O.R. Picture Audit Banner for Inspection Scheduling */}
                {(() => {
                  if (!newScheduleForm.trackingNumber.trim()) return null;
                  const matchedApp = applications.find(
                    (a) =>
                      (a.trackingNumber || a.id)?.toLowerCase() ===
                      newScheduleForm.trackingNumber.trim().toLowerCase()
                  );
                  if (!matchedApp) return null;
                  const orInfo = getApplicationReceiptInfo(matchedApp);

                  if (!orInfo.hasReceipt) {
                    return (
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px dashed rgba(239, 68, 68, 0.35)",
                          color: "#dc2626",
                          fontSize: "0.74rem",
                          fontWeight: 600,
                          marginBottom: 12,
                        }}
                      >
                        ⚠️ {language === "en"
                          ? "O.R. not uploaded yet: Applicant has not submitted the Official Receipt photo. Payment verification is required before site inspection."
                          : "Hindi pa nai-uupload ang O.R.: Wala pang isinusumiteng litrato ng Official Receipt ang aplikante. Kailangan muna ng beripikasyon ng bayad bago ang ocular inspection."}
                      </div>
                    );
                  }

                  if (!orInfo.isOrVerified) {
                    return (
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: "rgba(245, 158, 11, 0.1)",
                          border: "1px solid rgba(245, 158, 11, 0.35)",
                          color: "#b45309",
                          fontSize: "0.74rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          marginBottom: 12,
                        }}
                      >
                        <span>
                          ⚠️ {language === "en"
                            ? `Receipt #${orInfo.orNumber} photo is pending review.`
                            : `Ang litrato ng Resibo #${orInfo.orNumber} ay kailangan pang suriin.`}
                        </span>
                        <button
                          type="button"
                          className="eng-btn"
                          style={{
                            padding: "4px 10px",
                            fontSize: "0.7rem",
                            background: "#0071e3",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                          onClick={() => setReviewingOrApp(matchedApp)}
                        >
                          {language === "en" ? "Review O.R. Photo" : "Suriin ang Litrato"}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "rgba(16, 185, 129, 0.1)",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        color: "#059669",
                        fontSize: "0.74rem",
                        fontWeight: 600,
                        marginBottom: 12,
                      }}
                    >
                      ✓ {language === "en"
                        ? `Official Receipt Photo Verified (#${orInfo.orNumber}). Ready for site inspection dispatch.`
                        : `Na-verify na ang litrato ng Official Receipt (#${orInfo.orNumber}). Handa na para sa ocular inspection.`}
                    </div>
                  );
                })()}

                <div className="eng-modal-field">
                  <label className="eng-modal-label">{language === "en" ? "Applicant Full Name *" : "Pangalan ng Aplikante *"}</label>
                  <input
                    type="text"
                    className="eng-modal-input"
                    placeholder={language === "en" ? "Owner / Applicant Name" : "Pangalan ng may-ari"}
                    value={newScheduleForm.applicantName}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, applicantName: e.target.value })}
                    required
                  />
                </div>

                <div className="eng-modal-row">
                  <div className="eng-modal-field">
                    <label className="eng-modal-label">{t("common.barangay")}</label>
                    <select
                      className="eng-modal-input"
                      value={newScheduleForm.barangay}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, barangay: e.target.value })}
                    >
                      {LUISIANA_BARANGAYS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  <div className="eng-modal-field">
                    <label className="eng-modal-label">{language === "en" ? "Building Type" : "Uri ng Gusali"}</label>
                    <input
                      type="text"
                      className="eng-modal-input"
                      value={newScheduleForm.buildingType}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, buildingType: e.target.value })}
                    />
                  </div>
                </div>

                <div className="eng-modal-row">
                  <div className="eng-modal-field">
                    <label className="eng-modal-label">{t("common.date")}</label>
                    <input
                      type="date"
                      className="eng-modal-input"
                      value={newScheduleForm.date}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="eng-modal-field">
                    <label className="eng-modal-label">{language === "en" ? "Time" : "Oras"}</label>
                    <input
                      type="text"
                      className="eng-modal-input"
                      placeholder={language === "en" ? "e.g. 09:30 AM" : "hal. 09:30 AM"}
                      value={newScheduleForm.time}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, time: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="eng-modal-field">
                  <label className="eng-modal-label">{language === "en" ? "Assigned Engineer / Inspector" : "Nakatalagang Inhinyero / Tagasuri"}</label>
                  <select
                    className="eng-modal-input"
                    value={newScheduleForm.assignedInspector}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, assignedInspector: e.target.value })}
                  >
                    {personnelList.map((p) => (
                      <option key={p.id} value={`${p.name} (${p.position})`}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="eng-modal-footer">
                <button
                  type="button"
                  className="eng-btn eng-btn-outline"
                  onClick={() => setIsAddScheduleModalOpen(false)}
                >
                  {t("common.cancel")}
                </button>
                <button type="submit" className="eng-btn eng-btn-primary">
                  {t("eng.schedule_submit_btn")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── APPLICATION DOCUMENTS LIST MODAL ── */}
      {viewingAppDocs && (
        <div className="eng-modal-backdrop" onClick={() => setViewingAppDocs(null)}>
          <div className="eng-modal-card eng-docs-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="eng-modal-header">
              <div className="eng-modal-seal-badge" style={{ background: "rgba(0, 113, 227, 0.12)", color: "#0071e3" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="eng-modal-title">
                  {language === "en" ? "Attached Application Documents" : "Mga Naka-attach na Dokumento"}
                </h3>
                <span className="eng-modal-sub">
                  <strong className="mono">{viewingAppDocs.tracking}</strong> · {viewingAppDocs.applicant}
                </span>
              </div>
              <button
                type="button"
                className="eng-modal-close-btn"
                onClick={() => setViewingAppDocs(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="eng-modal-body" style={{ maxHeight: "65vh", overflowY: "auto", padding: "16px 20px" }}>
              <p style={{ margin: "0 0 14px 0", fontSize: "0.80rem", color: "var(--apple-text-secondary, #6e6e73)" }}>
                {language === "en"
                  ? `List of all official documents, blueprints, clearances, and receipts submitted for ${viewingAppDocs.tracking}:`
                  : `Talaan ng lahat ng opisyal na dokumento, blueprints, clearances, at resibo para sa ${viewingAppDocs.tracking}:`}
              </p>

              <div className="eng-docs-modal-list">
                {viewingAppDocs.docs.map((doc, idx) => {
                  const isPdf = isPdfFile(doc.url, doc.name);
                  const isReceipt = doc.isReceipt;

                  return (
                    <div key={doc.key || idx} className={`eng-docs-modal-item ${isReceipt ? "is-receipt" : ""}`}>
                      <div className="eng-docs-modal-item-left">
                        <div className={`eng-docs-modal-icon ${isReceipt ? "receipt" : isPdf ? "pdf" : "img"}`}>
                          {isReceipt ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                          ) : isPdf ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                            </svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          )}
                        </div>
                        <div className="eng-docs-modal-info">
                          <strong className="eng-docs-modal-filename">{doc.name}</strong>
                          <span className="eng-docs-modal-filemeta">
                            {isReceipt
                              ? (language === "en" ? "Official Receipt (Municipal Treasury / Assessor)" : "Opisyal na Resibo (Assessor / Ingat-Yaman)")
                              : isPdf
                                ? "PDF Document"
                                : "Image / Blueprint File"}
                          </span>
                        </div>
                      </div>

                      <div className="eng-docs-modal-actions">
                        <button
                          type="button"
                          className="eng-btn-doc-preview"
                          onClick={() => {
                            setViewingDoc({ url: doc.url, name: doc.name });
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          <span>{language === "en" ? "Preview" : "Tingnan"}</span>
                        </button>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="eng-btn-doc-download"
                          title={language === "en" ? "Open or download in new tab" : "Buksan o i-download"}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="eng-modal-footer">
              <button
                type="button"
                className="eng-btn eng-btn-outline"
                onClick={() => setViewingAppDocs(null)}
              >
                {language === "en" ? "Close" : "Isara"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── IN-SYSTEM DOCUMENT & PHOTO VIEWER (Zero new-tab redirects) ── */}
      <InSystemDocModal
        media={
          viewingDoc
            ? {
              url: viewingDoc.url,
              title: viewingDoc.name,
              fileName: viewingDoc.name,
              isPdf: isPdfFile(viewingDoc.url, viewingDoc.name),
              isImg: isImageFile(viewingDoc.url, viewingDoc.name) || !isPdfFile(viewingDoc.url, viewingDoc.name),
            }
            : null
        }
        onClose={() => setViewingDoc(null)}
      />
    </div>
  );
};

export default EngineerDashboardPage;
