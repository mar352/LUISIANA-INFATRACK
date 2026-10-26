import React, { useState, useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { fetchCitizenApplications, patchCitizenApplication, backendUrl } from "../lib/api";
import { subscribeToProjects, updateProjectInFirestore } from "../services/firestore-projects";
import { lookupBarangayCoords } from "../lib/barangay-overlay";
import { getClupZone } from "../lib/clup-zones";
import { InSystemDocModal } from "./InSystemDocViewer";
import { ThemeToggle } from "./ThemeToggle";
import { useTranslation, LanguageToggle } from "./LanguageToggle";
import { EngineeringDocumentsPage } from "./EngineeringDocumentsPage";
import type { SessionUser } from "../services/auth";
import type { Project } from "../types";
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State for Inspection Queue
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "hold" | "approved">("all");
  const [barangayFilter, setBarangayFilter] = useState("");

  // Approval Modal State
  const [approvingApp, setApprovingApp] = useState<any | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // LGU Project Approval Modal State
  const [approvingLguProj, setApprovingLguProj] = useState<Project | null>(null);
  const [lguApprovalNotes, setLguApprovalNotes] = useState("");
  const [isSubmittingLguApproval, setIsSubmittingLguApproval] = useState(false);

  // Hold Modal State
  const [holdingApp, setHoldingApp] = useState<any | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [isSubmittingHold, setIsSubmittingHold] = useState(false);

  // Document Lightbox
  const [viewingDoc, setViewingDoc] = useState<{ url: string; name: string } | null>(null);

  // Personnel State
  const [personnelList] = useState<EngineeringStaff[]>(() => {
    try {
      const cached = localStorage.getItem("infatrack_engineering_roster");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
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
    } catch {}
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
      } catch {}
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

    // Subscribe to live infrastructure projects
    const unsubscribeProjects = subscribeToProjects((projs) => {
      setProjects(projs);
    });

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
  }, [paidApplications, statusFilter, barangayFilter, searchQuery]);

  // Handle Confirm Approval & Pinning to 3D Globe
  const handleConfirmApproval = async () => {
    if (!approvingApp) return;
    setIsSubmittingApproval(true);
    try {
      const updatedStatus = "approved_for_construction";
      const tracking = approvingApp.trackingNumber || approvingApp.id;

      await patchCitizenApplication(tracking, {
        status: updatedStatus,
        engineerApproved: true,
        engineerApprovedAt: new Date().toISOString(),
        engineerApprovedBy: session?.name || "Engr. Mario S. Baldovino (Municipal Engineer)",
        engineerNotes: approvalNotes.trim() || "Approved for site construction and coordinate pinning.",
        stepProgress: {
          ...(approvingApp.stepProgress || {}),
          currentStep: 3,
          totalSteps: 3,
          step3Completed: true,
          step3At: new Date().toISOString(),
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
                engineerApprovedAt: new Date().toISOString(),
                engineerApprovedBy: session?.name || "Municipal Engineer",
              }
            : a
        )
      );

      showToast(`Matagumpay na naaprubahan at na-pin ang aplikasyon (${tracking}) sa 3D Mapa.`);
      if (onApplicationApproved) onApplicationApproved();
      setApprovingApp(null);
      setApprovalNotes("");
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

      // 1. Update in Firestore
      try {
        await updateProjectInFirestore(approvingLguProj.id, patchData);
      } catch (fErr) {
        console.warn("[EngineerDashboard] Firestore update note:", fErr);
      }

      // 2. Update via Backend API
      try {
        const url = `${backendUrl()}/api/projects/${approvingLguProj.id}`;
        await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchData),
        });
      } catch (bErr) {
        console.warn("[EngineerDashboard] Backend patch note:", bErr);
      }

      // 3. Update local state
      const confirmedProj: Project = {
        ...approvingLguProj,
        ...patchData,
      };

      setProjects((prev) =>
        prev.map((p) => (p.id === approvingLguProj.id ? { ...p, ...patchData } : p))
      );

      // 4. Update localStorage cache
      try {
        const cachedRaw = localStorage.getItem("infatrack-projects-cache");
        const cached = cachedRaw ? JSON.parse(cachedRaw) : [];
        const list = Array.isArray(cached) ? cached : [];
        const updated = list.map((p: any) =>
          p.id === approvingLguProj.id ? { ...p, ...patchData } : p
        );
        localStorage.setItem("infatrack-projects-cache", JSON.stringify(updated));
      } catch {}

      showToast(`Matagumpay na nakumpirma at nai-pin sa 3D Mapa ang "${approvingLguProj.name}".`);

      const coords = lookupBarangayCoords(approvingLguProj.barangay);
      const targetLat = approvingLguProj.location?.lat ?? coords?.lat ?? 14.1811622;
      const targetLon = approvingLguProj.location?.lon ?? coords?.lon ?? 121.510284;

      const fullProj: Project = {
        ...confirmedProj,
        location: { lat: targetLat, lon: targetLon },
        isLguProject: true,
        type: "Municipal Project",
        siteMarkerOnly: true,
        markerColor: confirmedProj.markerColor || (confirmedProj.status === "Completed" ? "#10b981" : confirmedProj.status === "Ongoing" ? "#f5a623" : "#3b82f6"),
        mapSketch: confirmedProj.mapSketch || {
          kind: "pin",
          color: confirmedProj.markerColor || (confirmedProj.status === "Completed" ? "#10b981" : confirmedProj.status === "Ongoing" ? "#f5a623" : "#3b82f6"),
          coordinates: [{ lon: targetLon, lat: targetLat }],
        },
      };

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
            className="eng-nav-btn eng-nav-btn-map"
            onClick={() => onNavigateToMap()}
            title={t("nav.map_3d")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            <span>{t("nav.map_3d")}</span>
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
                  {metrics.pendingLguCount > 0 ? ` (${metrics.pendingLguCount} ⏳)` : ""}
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
              <span className="eng-toast-icon">✓</span>
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
                  <div className="eng-empty-icon">📂</div>
                  <h3>{t("eng.no_apps_found")}</h3>
                  <p>
                    {searchQuery || barangayFilter || statusFilter !== "all"
                      ? t("eng.no_apps_filter")
                      : t("eng.no_apps_empty")}
                  </p>
                </div>
              ) : (
                <div className="eng-inspection-cards-grid">
                  {displayedApps.map((app) => {
                    const isApproved = app.engineerApproved === true || app.status === "approved_for_construction";
                    const isHold = app.status === "returned";
                    const tracking = app.trackingNumber || app.id;
                    const applicant = app.applicant?.fullName || app.applicantName || "Private Applicant";
                    const bgy = app.applicant?.barangay || app.barangay || "Luisiana";
                    const bldgType = app.lotDetails?.proposedBuildingType || app.buildingType || "Residential Building";
                    const estCost = app.estimatedCost || app.budgetTotal;
                    const orNumber = app.payment?.orNumber || app.payment?.or_number || app.or_number || "OR-VERIFIED";
                    const paymentDate = app.payment?.payment_date || app.payment?.paidAt || app.payment_date || app.updatedAt;
                    const lat = app.latitude ?? app.lotDetails?.lat ?? app.coordinates?.lat;
                    const lon = app.longitude ?? app.lotDetails?.lon ?? app.coordinates?.lon;
                    const receiptUrl = app.payment?.receiptUrl || app.uploads?.officialReceipt?.[0]?.url;

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
                            ) : (
                              <span className="eng-status-pill pending">
                                {t("eng.status_pending_badge")}
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
                            <strong className="eng-detail-val">{bldgType}</strong>
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

                        {/* Assessor Receipt Metadata Box */}
                        <div className="eng-receipt-box">
                          <div className="eng-receipt-left">
                            <div className="eng-receipt-icon">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                              </svg>
                            </div>
                            <div>
                              <div className="eng-receipt-title">
                                <span>{t("eng.or_header")}</span>
                                <strong className="eng-receipt-num">{orNumber}</strong>
                              </div>
                              <div className="eng-receipt-meta">
                                <span>{t("eng.date_label")} {formatDate(paymentDate)}</span>
                                <span> · {t("common.status")}: <strong>{t("eng.or_status_text")}</strong></span>
                              </div>
                            </div>
                          </div>

                          <div className="eng-receipt-right">
                            {receiptUrl && (
                              <button
                                type="button"
                                className="eng-receipt-view-btn"
                                onClick={() =>
                                  setViewingDoc({
                                    url: resolveDocUrl(receiptUrl),
                                    name: `Official Receipt #${orNumber}`,
                                  })
                                }
                              >
                                {t("eng.view_receipt_btn")}
                              </button>
                            )}
                          </div>
                        </div>

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
                                  📎 {doc.name.slice(0, 24)}
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
                            🗺️ {t("eng.view_map_btn")}
                          </button>

                          {!isApproved && (
                            <>
                              <button
                                type="button"
                                className="eng-action-btn eng-btn-hold"
                                onClick={() => setHoldingApp(app)}
                                title={t("eng.hold_return_btn")}
                              >
                                ⚠ {t("eng.hold_return_btn")}
                              </button>

                              <button
                                type="button"
                                className="eng-action-btn eng-btn-approve"
                                onClick={() => setApprovingApp(app)}
                                title={t("eng.approve_pin_btn")}
                              >
                                ✓ {t("eng.approve_pin_btn")}
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
                    <span>{language === "en" ? "View All in 3D Map ↗" : "Tingnan Lahat sa 3D Mapa ↗"}</span>
                  </button>
                </div>
              </div>

              {metrics.pendingLguCount > 0 && (
                <div className="eng-lgu-pending-banner">
                  <span className="eng-lgu-pending-icon">⏳</span>
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

              <div className="eng-projects-grid">
                {projects.map((proj) => {
                  const progress = proj.progress != null ? Number(proj.progress) : 0;
                  const isPendingConfirm = proj.engineerApproved === false;
                  return (
                    <div key={proj.id} className={`eng-project-card ${isPendingConfirm ? "pending-approval" : ""}`}>
                      <div className="eng-project-card-head">
                        <div>
                          <span className="eng-proj-code">{proj.code || proj.id}</span>
                          <h4 className="eng-proj-name">{proj.name}</h4>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                          <span className={`eng-proj-status-badge ${(proj.lifecyclePhase || "Planning").toLowerCase()}`}>
                            {proj.lifecyclePhase || "Planning"}
                          </span>
                          {isPendingConfirm ? (
                            <span className="eng-lgu-confirm-badge pending">
                              ⏳ {language === "en" ? "For Engineer Confirmation" : "Naghihintay ng Kumpirmasyon"}
                            </span>
                          ) : (
                            <span className="eng-lgu-confirm-badge confirmed">
                              ✓ {language === "en" ? "Confirmed & Pinned" : "Kinumpirma at Na-pin"}
                            </span>
                          )}
                        </div>
                      </div>

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
                            <span>✓</span>
                            <span>{language === "en" ? "Confirm & Pin to 3D Map" : "Kumpirmahin at I-pin sa 3D Mapa"}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="eng-proj-fly-btn"
                            onClick={() => {
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
                            }}
                          >
                            🗺️ {language === "en" ? "Fly in 3D Map" : "I-fly sa 3D Mapa"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {projects.length === 0 && (
                  <div className="eng-state-card empty">
                    <p>{language === "en" ? "No infrastructure projects currently registered." : "Walang nakatalang proyekto sa kasalukuyan."}</p>
                  </div>
                )}
              </div>
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
                      <th>{language === "en" ? "Status" : "Katayuan"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((sch) => (
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
                          <span className={`eng-schedule-pill ${sch.status.toLowerCase().replace(/\s+/g, "-")}`}>
                            {sch.status}
                          </span>
                        </td>
                      </tr>
                    ))}
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
                <div><strong>{language === "en" ? "Receipt from Assessor:" : "O.R. mula sa Assessor:"}</strong> {approvingApp.payment?.orNumber || "OR-VERIFIED"}</div>
              </div>

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
                disabled={isSubmittingApproval}
              >
                {isSubmittingApproval ? (language === "en" ? "Approving..." : "Ina-aprubahan...") : t("eng.approve_confirm_btn")}
              </button>
            </div>
          </div>
        </div>
      )}

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
                {isSubmittingLguApproval
                  ? (language === "en" ? "Confirming & Pinning..." : "Kinukumpirma at Inipit...")
                  : (language === "en" ? "✓ Confirm & Pin to 3D Map" : "✓ Kumpirmahin at I-pin sa 3D Mapa")}
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
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, trackingNumber: e.target.value })}
                    required
                  />
                </div>

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

      {/* ── IN-SYSTEM DOCUMENT VIEWER ─────────────────────────────────── */}
      {viewingDoc && (
        <InSystemDocModal
          fileUrl={viewingDoc.url}
          fileName={viewingDoc.name}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </div>
  );
};

export default EngineerDashboardPage;
