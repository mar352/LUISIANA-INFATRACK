import React, { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { fetchPublicProjects, patchProject, backendUrl } from "../lib/api";
import { subscribeToProjects, updateProjectInFirestore } from "../services/firestore-projects";
import {
  subscribeToInspectionSchedules,
  saveInspectionScheduleToFirestore,
  deleteInspectionScheduleFromFirestore,
  type FirestoreInspectionSchedule,
} from "../services/firestore-inspection-schedules";
import { lookupBarangayCoords } from "../lib/barangay-overlay";
import { InSystemDocModal } from "./InSystemDocViewer";
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
import { isLguInfrastructureProject } from "../lib/infra-filter";
import "./EngineerDashboardPage.css";

export interface MeoDashboardPageProps {
  initialTab?: MeoDashboardTab;
  onBack?: () => void;
  session?: SessionUser | null;
  onNavigateToMap: (projectId?: string, lat?: number, lon?: number, project?: Project) => void;
  onNavigate?: (screen: string) => void;
  onLogout?: () => void;
  onProjectUpdated?: () => void;
}

export type MeoDashboardTab = "overview" | "projects" | "analytics" | "procurement" | "schedules" | "personnel" | "documents";

export interface EngineeringStaff {
  id: string;
  name: string;
  position: string;
  specialization: string;
  phone: string;
  status: "In Office" | "On Field" | "Inspection Site";
  assignedBarangays: string[];
}

export interface BiddingRecord {
  id: string;
  projectCode: string;
  projectName: string;
  barangay?: string;
  abcBudget: number;
  contractAmount: number;
  contractor: string;
  pcabLicense: string;
  status: "Pre-Procurement" | "Invitation to Bid" | "Bid Evaluation" | "Notice of Award (NOA)" | "Notice to Proceed (NTP)" | "Under Construction" | "Completed";
  noaDate?: string;
  ntpDate?: string;
  targetCompletion?: string;
  powUrl?: string;
}

export interface MeoInspectionSchedule {
  id: string;
  projectCode: string;
  projectName: string;
  barangay: string;
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

const MEO_ENGINEERING_ROSTER: EngineeringStaff[] = [
  {
    id: "MEO-001",
    name: "Municipal Engineer",
    position: "Municipal Engineer (Head of Office)",
    specialization: "Structural & Geotechnical Engineering",
    phone: "(049) 555-0201",
    status: "In Office",
    assignedBarangays: ["All 23 Barangays"]
  },
  {
    id: "MEO-002",
    name: "Assistant Municipal Engineer",
    position: "Assistant Municipal Engineer",
    specialization: "Infrastructure & Highway Engineering",
    phone: "(049) 555-0202",
    status: "On Field",
    assignedBarangays: ["Poblacion", "San Buenaventura", "San Diego"]
  },
  {
    id: "MEO-003",
    name: "Materials & Quality Control Engineer",
    position: "Materials & Quality Control Engineer",
    specialization: "Concrete Compressive Testing & Soil Mechanics",
    phone: "(049) 555-0203",
    status: "Inspection Site",
    assignedBarangays: ["San Isidro", "De La Paz", "San Salvador"]
  },
  {
    id: "MEO-004",
    name: "Geodetic & GIS Survey Specialist",
    position: "Geodetic & GIS Survey Specialist",
    specialization: "Cadastral Boundary & Coordinate Pinning",
    phone: "(049) 555-0204",
    status: "In Office",
    assignedBarangays: ["All 23 Barangays"]
  },
  {
    id: "MEO-005",
    name: "Senior Architectural Draftsman",
    position: "Senior Architectural Draftsman",
    specialization: "Architectural Plans & CAD Compliance",
    phone: "(049) 555-0205",
    status: "In Office",
    assignedBarangays: ["Poblacion", "Mahayhay", "Sto. Domingo"]
  }
];

const INITIAL_BIDDING_RECORDS: BiddingRecord[] = [];

const INITIAL_MEO_SCHEDULES: MeoInspectionSchedule[] = [];

export const MeoDashboardPage: React.FC<MeoDashboardPageProps> = ({
  initialTab = "overview",
  session,
  onNavigateToMap,
  onLogout,
  onProjectUpdated
}) => {
  const { t, language } = useTranslation();

  const [activeTab, setActiveTab] = useState<MeoDashboardTab>(initialTab);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Projects state
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const raw = localStorage.getItem("infatrack-projects-cache");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((p: any) => isLguInfrastructureProject(p))
        : [];
    } catch {
      return [];
    }
  });

  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [projectBarangayFilter, setProjectBarangayFilter] = useState("");
  const [projectSectorFilter, setProjectSectorFilter] = useState<string>("all");
  const [projectStatusFilter, setProjectStatusFilter] = useState<"all" | "pending_confirmation" | "confirmed">("all");
  const [projectsViewMode, setProjectsViewMode] = useState<"list" | "grid">("list");

  // Approval Modal state
  const [approvingLguProj, setApprovingLguProj] = useState<Project | null>(null);
  const [lguApprovalNotes, setLguApprovalNotes] = useState("");
  const [isSubmittingLguApproval, setIsSubmittingLguApproval] = useState(false);

  // Bidding state
  const [biddingRecords, setBiddingRecords] = useState<BiddingRecord[]>(() => {
    try {
      const cached = localStorage.getItem("infatrack_meo_bidding_records");
      if (cached) {
        const parsed = JSON.parse(cached);
        // Cleanse any fabricated mock contractor records
        const legitimate = Array.isArray(parsed)
          ? parsed.filter(
              (r: any) =>
                r.id !== "BID-2026-001" &&
                r.id !== "BID-2026-002" &&
                r.id !== "BID-2026-003" &&
                r.id !== "BID-2026-004" &&
                !r.contractor?.includes("R.V. Construction") &&
                !r.contractor?.includes("Laguna Prime") &&
                !r.contractor?.includes("Southern Tagalog Civil") &&
                !r.contractor?.includes("AquaFlow")
            )
          : [];
        localStorage.setItem("infatrack_meo_bidding_records", JSON.stringify(legitimate));
        return legitimate;
      }
      return [];
    } catch {
      return [];
    }
  });
  const [procurementViewMode, setProcurementViewMode] = useState<"all" | "analytics" | "registry">("all");
  const [biddingSearchQuery, setBiddingSearchQuery] = useState("");
  const [biddingStageFilter, setBiddingStageFilter] = useState("all");
  const [editingBiddingRecord, setEditingBiddingRecord] = useState<BiddingRecord | null>(null);

  // Schedules state — backed by Firestore real-time subscription
  const [schedules, setSchedules] = useState<MeoInspectionSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false);
  const [selectedScheduleProjectId, setSelectedScheduleProjectId] = useState<string>("");
  const [newScheduleForm, setNewScheduleForm] = useState({
    projectCode: "",
    projectName: "",
    barangay: "Poblacion",
    date: new Date().toISOString().split("T")[0],
    time: "09:00 AM",
    assignedInspector: "Assistant Municipal Engineer",
    notes: ""
  });

  // Personnel state
  const [personnelList] = useState<EngineeringStaff[]>(() => {
    try {
      const cached = localStorage.getItem("infatrack_meo_personnel_roster");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasLegacy = parsed.some((p: any) => /Mario|Baldovino|Alcantara|Castillo|Mercado|Santos/i.test(p?.name || ""));
          if (!hasLegacy) return parsed;
        }
      }
    } catch { }
    return MEO_ENGINEERING_ROSTER;
  });

  // Document modal viewer
  const [viewingDoc, setViewingDoc] = useState<{ url: string; name: string } | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch Public Projects
  useEffect(() => {
    fetchPublicProjects()
      .then((data: any) => {
        const list = Array.isArray(data) ? data : data?.projects;
        if (Array.isArray(list)) {
          const lguOnly = list.filter((p: any) => isLguInfrastructureProject(p));
          setProjects(lguOnly);
          try {
            localStorage.setItem("infatrack-projects-cache", JSON.stringify(lguOnly));
          } catch { }
        }
      })
      .catch((err) => console.warn("[MEO] Could not fetch public projects:", err));

    const unsubscribe = subscribeToProjects((liveProjects) => {
      if (Array.isArray(liveProjects)) {
        const lguOnly = liveProjects.filter((p: any) => isLguInfrastructureProject(p));
        setProjects(lguOnly);
      }
    });

    const handleLguProjectAdded = (e: any) => {
      const newProj = e.detail;
      if (newProj && isLguInfrastructureProject(newProj)) {
        setProjects((prev) => [newProj, ...prev.filter((p) => p.id !== newProj.id)]);
      }
    };

    const handleBiddingRecordCreated = (e: any) => {
      const newRec = e.detail;
      if (newRec) {
        setBiddingRecords((prev) => [newRec, ...prev.filter((b) => b.id !== newRec.id)]);
      }
    };

    window.addEventListener("lgu-project-added", handleLguProjectAdded);
    window.addEventListener("bidding-record-created", handleBiddingRecordCreated);

    return () => {
      unsubscribe();
      window.removeEventListener("lgu-project-added", handleLguProjectAdded);
      window.removeEventListener("bidding-record-created", handleBiddingRecordCreated);
    };
  }, []);

  // Real-time Firestore subscription for MEO inspection schedules
  useEffect(() => {
    const unsubSchedules = subscribeToInspectionSchedules((firestoreSchedules) => {
      setSchedules(firestoreSchedules as unknown as MeoInspectionSchedule[]);
      setSchedulesLoading(false);
      // Mirror to localStorage for offline fallback
      try {
        localStorage.setItem("infatrack_meo_inspection_schedules", JSON.stringify(firestoreSchedules));
      } catch { }
    });
    return () => unsubSchedules();
  }, []);

  // Automatic POW & BAC Reconciliation for all LGU projects with budgets
  useEffect(() => {
    if (!projects || projects.length === 0) return;

    let hasNewSync = false;
    const currentRecords = [...biddingRecords];

    for (const p of projects) {
      if (!isLguInfrastructureProject(p)) continue;
      const projBudget = Number((p as any).budgetTotal || p.budget || p.cost || 0);
      if (projBudget <= 0) continue;

      // Check if project is already present in bidding records
      const exists = currentRecords.some(
        (b) =>
          b.projectCode === p.id ||
          b.projectCode === p.code ||
          b.id === `BID-${p.id}` ||
          (b.projectName && p.name && b.projectName.toLowerCase() === p.name.toLowerCase()) ||
          (b.projectName && p.title && b.projectName.toLowerCase() === p.title.toLowerCase())
      );

      if (!exists) {
        const contractorName = p.contractor ? String(p.contractor).trim() : "";
        let initialStage: BiddingRecord["status"] = "Pre-Procurement";
        if (p.status === "completed" || p.progress === 100) {
          initialStage = "Completed";
        } else if (p.status === "ongoing" || (p.progress || 0) > 0) {
          initialStage = "Under Construction";
        } else if (p.noticeOfAwardUrl) {
          initialStage = "Notice of Award (NOA)";
        }

        const autoRecord: BiddingRecord = {
          id: `BID-${p.id}`,
          projectCode: p.code || p.id,
          projectName: p.name || p.title || "LGU Infrastructure Project",
          barangay: p.barangay ? p.barangay.replace(/^Brgy\.?\s+/i, "").trim() : "Luisiana",
          abcBudget: projBudget,
          contractAmount: contractorName ? projBudget : 0,
          contractor: contractorName || "Pending BAC Award",
          pcabLicense: contractorName ? "PCAB-REGISTERED" : "Pending Bidding",
          status: initialStage,
          powUrl: (p as any).programOfWorksUrl || undefined,
        };

        currentRecords.unshift(autoRecord);
        hasNewSync = true;
      }
    }

    if (hasNewSync) {
      setBiddingRecords(currentRecords);
      try {
        localStorage.setItem("infatrack_meo_bidding_records", JSON.stringify(currentRecords));
      } catch { }
    }
  }, [projects]);

  // Compute Metrics
  const metrics = useMemo(() => {
    const lguList = projects.filter((p) => isLguInfrastructureProject(p));
    const totalCount = lguList.length;
    const pendingLguCount = lguList.filter((p) => p.engineerApproved === false).length;
    const confirmedCount = lguList.filter((p) => p.engineerApproved === true || p.isPinned).length;
    const ongoingCount = lguList.filter((p) => p.status === "ongoing" || ((p.progress || 0) > 0 && (p.progress || 0) < 100)).length;
    const completedCount = lguList.filter((p) => p.status === "completed" || p.progress === 100).length;

    let totalBudget = 0;
    for (const p of lguList) {
      const b = Number(p.budget || p.cost || 0);
      if (!isNaN(b)) totalBudget += b;
    }

    return {
      totalCount,
      pendingLguCount,
      confirmedCount,
      ongoingCount,
      completedCount,
      totalBudget
    };
  }, [projects]);

  // Sector Counts
  const sectorCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of projects) {
      if (!isLguInfrastructureProject(p)) continue;
      const s = getBuildingSector(p);
      map[s] = (map[s] || 0) + 1;
    }
    return map;
  }, [projects]);

  // Filtered Projects
  const displayedProjects = useMemo(() => {
    return projects.filter((p) => {
      if (!isLguInfrastructureProject(p)) return false;
      if (projectStatusFilter === "pending_confirmation" && p.engineerApproved !== false) return false;
      if (projectStatusFilter === "confirmed" && p.engineerApproved === false) return false;

      if (projectBarangayFilter && p.barangay !== projectBarangayFilter) return false;

      if (projectSearchQuery.trim()) {
        const q = projectSearchQuery.toLowerCase();
        const matchName = p.name?.toLowerCase().includes(q);
        const matchId = p.id?.toLowerCase().includes(q);
        const matchBgy = p.barangay?.toLowerCase().includes(q);
        const matchContractor = (p as any).contractor?.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchBgy && !matchContractor) return false;
      }

      return true;
    });
  }, [projects, projectStatusFilter, projectBarangayFilter, projectSectorFilter, projectSearchQuery]);

  // Confirm LGU Project
  const handleConfirmLguApproval = async () => {
    if (!approvingLguProj) return;
    setIsSubmittingLguApproval(true);
    try {
      const now = new Date().toISOString();
      const officerName = (session?.name && !session.name.includes("Baldovino")) ? session.name : "Municipal Engineer";
      const patchData = {
        engineerApproved: true,
        engineerApprovedAt: now,
        engineerApprovedBy: officerName,
        isPinned: true,
        engineerNotes: lguApprovalNotes.trim() || "Approved and validated by Municipal Engineer for GIS 3D Map Pinning.",
      };

      const coords = lookupBarangayCoords(approvingLguProj.barangay);
      const targetLat = approvingLguProj.location?.lat ?? coords?.lat ?? 14.1811622;
      const targetLon = approvingLguProj.location?.lon ?? coords?.lon ?? 121.510284;

      const fullProj: Project = {
        ...approvingLguProj,
        ...patchData,
        location: {
          lat: targetLat,
          lon: targetLon,
        },
      };

      try {
        await patchProject(approvingLguProj.id, patchData);
      } catch (err) {
        console.warn("[MEO] Backend patch failed, writing to Firestore:", err);
      }

      await updateProjectInFirestore(approvingLguProj.id, fullProj).catch((e) =>
        console.warn("[MEO] Firestore sync error:", e)
      );

      setProjects((prev) =>
        prev.map((p) => (p.id === approvingLguProj.id ? fullProj : p))
      );

      showToast(
        language === "en"
          ? `LGU Project "${approvingLguProj.name}" confirmed & pinned to 3D Map!`
          : `Nakumpirma at nai-pin sa 3D Mapa ang Proyektong "${approvingLguProj.name}"!`
      );

      setApprovingLguProj(null);
      setLguApprovalNotes("");
      if (onProjectUpdated) onProjectUpdated();
    } catch (err: any) {
      console.error("[MEO] Failed to confirm LGU project:", err);
      alert(err?.message || "Nabigong aprubahan ang LGU project.");
    } finally {
      setIsSubmittingLguApproval(false);
    }
  };

  const handleDeleteBiddingRecord = (id: string, name: string) => {
    if (
      window.confirm(
        language === "en"
          ? `Are you sure you want to remove contract record "${name}"?`
          : `Nais mo bang tanggalin ang talaan ng kontrata para sa "${name}"?`
      )
    ) {
      const updated = biddingRecords.filter((b) => b.id !== id);
      setBiddingRecords(updated);
      try {
        localStorage.setItem("infatrack_meo_bidding_records", JSON.stringify(updated));
      } catch { }
      showToast(
        language === "en"
          ? "Contract record removed successfully."
          : "Matagumpay na tinanggal ang talaan ng kontrata."
      );
    }
  };

  const handleUpdateBiddingRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBiddingRecord) return;

    const updated = biddingRecords.map((b) =>
      b.id === editingBiddingRecord.id ? editingBiddingRecord : b
    );
    setBiddingRecords(updated);
    try {
      localStorage.setItem("infatrack_meo_bidding_records", JSON.stringify(updated));
    } catch { }

    showToast(
      language === "en"
        ? `Contract updated for "${editingBiddingRecord.projectName}"!`
        : `Na-update ang kontrata para sa "${editingBiddingRecord.projectName}"!`
    );
    setEditingBiddingRecord(null);
  };

  // MEO Procurement & POW Analytics
  const procurementAnalytics = useMemo(() => {
    const totalAbc = biddingRecords.reduce((sum, b) => sum + (Number(b.abcBudget) || 0), 0);
    const totalContracted = biddingRecords.reduce((sum, b) => sum + (Number(b.contractAmount) || 0), 0);
    const totalSavings = totalAbc - totalContracted;
    const savingsPercentage = totalAbc > 0 ? (totalSavings / totalAbc) * 100 : 0;

    const activeConstructionCount = biddingRecords.filter((b) => b.status === "Under Construction").length;
    const completedCount = biddingRecords.filter((b) => b.status === "Completed").length;

    // Variance bar chart data: up to 8 records
    const budgetComparisonData = biddingRecords.slice(0, 8).map((b) => {
      const shortName = b.projectName.length > 22 ? b.projectName.slice(0, 20) + "…" : b.projectName;
      return {
        name: shortName,
        fullName: b.projectName,
        code: b.projectCode,
        abc: Number(b.abcBudget) || 0,
        contract: Number(b.contractAmount) || 0,
        savings: (Number(b.abcBudget) || 0) - (Number(b.contractAmount) || 0),
        contractor: b.contractor,
      };
    });

    // RA 9184 Stages breakdown
    const STAGE_COLORS: Record<string, string> = {
      "Pre-Procurement": "#8b5cf6",
      "Invitation to Bid": "#3b82f6",
      "Bid Evaluation": "#f59e0b",
      "Notice of Award (NOA)": "#06b6d4",
      "Notice to Proceed (NTP)": "#6366f1",
      "Under Construction": "#0284c7",
      "Completed": "#10b981",
    };

    const stageCounts: Record<string, number> = {};
    biddingRecords.forEach((b) => {
      stageCounts[b.status] = (stageCounts[b.status] || 0) + 1;
    });

    const stageData = Object.entries(stageCounts).map(([stage, count]) => ({
      name: stage,
      value: count,
      color: STAGE_COLORS[stage] || "#64748b",
    }));

    // Barangay Allocation data: combine bidding records and registered LGU projects
    const barangayMap: Record<string, { totalBudget: number; count: number }> = {};

    biddingRecords.forEach((b) => {
      let brgy = b.barangay;
      if (!brgy) {
        const matched = projects.find(
          (p) => p.code === b.projectCode || p.id === b.projectCode || (p.title && b.projectName.includes(p.title))
        );
        if (matched?.barangay) brgy = matched.barangay;
      }
      const cleanBrgy = brgy ? brgy.replace(/^Brgy\.?\s+/i, "").trim() : "Luisiana Proper";
      if (!barangayMap[cleanBrgy]) {
        barangayMap[cleanBrgy] = { totalBudget: 0, count: 0 };
      }
      barangayMap[cleanBrgy].totalBudget += Number(b.contractAmount) || Number(b.abcBudget) || 0;
      barangayMap[cleanBrgy].count += 1;
    });

    projects.forEach((p) => {
      const alreadyCounted = biddingRecords.some((b) => b.projectCode === p.id || b.projectCode === p.code);
      if (!alreadyCounted) {
        const cleanBrgy = p.barangay ? p.barangay.replace(/^Brgy\.?\s+/i, "").trim() : "Luisiana Proper";
        if (!barangayMap[cleanBrgy]) {
          barangayMap[cleanBrgy] = { totalBudget: 0, count: 0 };
        }
        const pBudget = typeof p.budget === "number" ? p.budget : parseFloat(String(p.budget || "0").replace(/[^0-9.]/g, "")) || 0;
        barangayMap[cleanBrgy].totalBudget += pBudget;
        barangayMap[cleanBrgy].count += 1;
      }
    });

    const barangayAllocationData = Object.entries(barangayMap)
      .map(([barangay, info]) => ({
        barangay,
        totalBudget: info.totalBudget,
        projectCount: info.count,
      }))
      .sort((a, b) => b.totalBudget - a.totalBudget)
      .slice(0, 6);

    return {
      totalAbc,
      totalContracted,
      totalSavings,
      savingsPercentage,
      activeConstructionCount,
      completedCount,
      budgetComparisonData,
      stageData,
      barangayAllocationData,
      hasRecords: biddingRecords.length > 0,
    };
  }, [biddingRecords, projects]);

  const filteredBiddingRecords = useMemo(() => {
    return biddingRecords.filter((b) => {
      if (biddingStageFilter !== "all" && b.status !== biddingStageFilter) {
        return false;
      }
      if (biddingSearchQuery.trim()) {
        const q = biddingSearchQuery.toLowerCase();
        const matchName = b.projectName.toLowerCase().includes(q);
        const matchCode = b.projectCode.toLowerCase().includes(q);
        const matchContractor = b.contractor.toLowerCase().includes(q);
        const matchPcab = (b.pcabLicense || "").toLowerCase().includes(q);
        const matchBrgy = (b.barangay || "").toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchContractor && !matchPcab && !matchBrgy) {
          return false;
        }
      }
      return true;
    });
  }, [biddingRecords, biddingStageFilter, biddingSearchQuery]);

  const getStageBadgeClass = (status: string) => {
    switch (status) {
      case "Completed":
        return "approved";
      case "Under Construction":
        return "info";
      case "Notice of Award (NOA)":
      case "Notice to Proceed (NTP)":
        return "pending";
      case "Bid Evaluation":
      case "Invitation to Bid":
        return "warning";
      default:
        return "neutral";
    }
  };

  // Derived LGU Projects for Dropdown in Field Inspection Scheduler
  const availableLguProjects = useMemo(() => {
    const list: Array<{
      id: string;
      code: string;
      name: string;
      barangay: string;
      status?: string;
      budget?: number;
    }> = [];
    const seen = new Set<string>();

    for (const p of projects) {
      if (!isLguInfrastructureProject(p)) continue;
      const pName = (p.name || (p as any).title || "").trim();
      if (!pName || seen.has(p.id)) continue;
      seen.add(p.id);
      list.push({
        id: p.id,
        code: p.code || p.id,
        name: pName,
        barangay: p.barangay || "Poblacion",
        status: p.status,
        budget: Number((p as any).budgetTotal || p.budget || p.cost || 0),
      });
    }

    for (const b of biddingRecords) {
      if (!b.projectName) continue;
      const exists = list.some(
        (item) =>
          item.id === b.id ||
          item.code === b.projectCode ||
          item.name.toLowerCase() === b.projectName.toLowerCase()
      );
      if (!exists && !seen.has(b.id)) {
        seen.add(b.id);
        list.push({
          id: b.id,
          code: b.projectCode || b.id,
          name: b.projectName,
          barangay: b.barangay || "Poblacion",
          status: b.status,
          budget: Number(b.contractAmount || b.abcBudget || 0),
        });
      }
    }

    return list;
  }, [projects, biddingRecords]);

  // Derived merged schedules — combines PostgreSQL/Firestore schedules with any project having nextScheduledInspection
  const allSchedules = useMemo(() => {
    const map = new Map<string, MeoInspectionSchedule>();
    for (const s of schedules) {
      if (s?.id) map.set(s.id, s);
      if (s?.projectCode) map.set(s.projectCode, s);
      if (s?.projectName) map.set(s.projectName.toLowerCase().trim(), s);
    }

    for (const p of projects) {
      if ((p as any).nextScheduledInspection?.date) {
        const next = (p as any).nextScheduledInspection;
        const pNameKey = (p.name || (p as any).title || "").toLowerCase().trim();
        const exists = map.has(p.id) || (p.code && map.has(p.code)) || (pNameKey && map.has(pNameKey));
        if (!exists) {
          const synth: MeoInspectionSchedule = {
            id: `MSCH-${p.id}`,
            projectCode: p.code || p.id,
            projectName: p.name || (p as any).title || "LGU Infrastructure Project",
            barangay: p.barangay ? p.barangay.replace(/^Barangay\s+/i, "").replace(/^Brgy\.?\s+/i, "").trim() : "Poblacion",
            date: next.date,
            time: next.time || "09:00 AM",
            assignedInspector: next.assignedInspector || "Assistant Municipal Engineer",
            status: next.status || "Nakatakda",
            notes: next.notes || "Technical ocular site assessment",
          };
          map.set(synth.id, synth);
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [schedules, projects]);

  const normalizeBarangayForSchedule = (raw?: string): string => {
    if (!raw) return "Poblacion";
    const clean = raw.replace(/^Brgy\.?\s+/i, "").trim();
    const exact = LUISIANA_BARANGAYS.find((b) => b.toLowerCase() === clean.toLowerCase());
    if (exact) return exact;
    if (/zone|poblacion/i.test(clean)) return "Poblacion";
    const partial = LUISIANA_BARANGAYS.find(
      (b) => clean.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(clean.toLowerCase())
    );
    if (partial) return partial;
    return "Poblacion";
  };

  const handleScheduleProjectSelect = (projId: string) => {
    setSelectedScheduleProjectId(projId);
    if (!projId || projId === "__custom__") {
      if (projId === "__custom__") {
        setNewScheduleForm((prev) => ({ ...prev, projectCode: "" }));
      }
      return;
    }
    const matched = availableLguProjects.find((p) => p.id === projId);
    if (matched) {
      setNewScheduleForm((prev) => ({
        ...prev,
        projectCode: matched.code,
        projectName: matched.name,
        barangay: normalizeBarangayForSchedule(matched.barangay),
      }));
    }
  };

  // Add Schedule
  const handleAddSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduleForm.projectName) {
      alert(language === "en" ? "Please fill in project name." : "Mangyaring punan ang pangalan ng proyekto.");
      return;
    }

    const newSch: MeoInspectionSchedule = {
      id: `MSCH-${Date.now()}`,
      projectCode: newScheduleForm.projectCode || `MEO-${Math.floor(100 + Math.random() * 900)}`,
      projectName: newScheduleForm.projectName,
      barangay: newScheduleForm.barangay,
      date: newScheduleForm.date,
      time: newScheduleForm.time,
      assignedInspector: newScheduleForm.assignedInspector,
      status: "Nakatakda",
      notes: newScheduleForm.notes
    };

    // Save to Firestore (primary — triggers subscribeToInspectionSchedules callback)
    saveInspectionScheduleToFirestore(newSch as unknown as FirestoreInspectionSchedule).catch((err) =>
      console.warn("[MEO] Firestore schedule save failed:", err)
    );

    // Dispatch global events for instant sync across portals
    window.dispatchEvent(new CustomEvent("inspection-scheduled", { detail: newSch }));
    window.dispatchEvent(new CustomEvent("projects-updated"));

    // Sync inspection directly into project record if matched
    const matchedProj = projects.find(
      (p) =>
        p.id === selectedScheduleProjectId ||
        p.id === newScheduleForm.projectCode ||
        p.code === newScheduleForm.projectCode ||
        (p.name && newScheduleForm.projectName && p.name.toLowerCase().trim() === newScheduleForm.projectName.toLowerCase().trim()) ||
        ((p as any).title && newScheduleForm.projectName && (p as any).title.toLowerCase().trim() === newScheduleForm.projectName.toLowerCase().trim()) ||
        (p.name && newScheduleForm.projectName && (p.name.toLowerCase().includes(newScheduleForm.projectName.toLowerCase().trim()) || newScheduleForm.projectName.toLowerCase().trim().includes(p.name.toLowerCase())))
    );

    if (matchedProj) {
      const updatedProj: Project = {
        ...matchedProj,
        nextScheduledInspection: {
          date: newSch.date,
          time: newSch.time,
          assignedInspector: newSch.assignedInspector,
          status: newSch.status,
          notes: newSch.notes,
          scheduledAt: new Date().toISOString(),
        },
      };

      setProjects((prev) => prev.map((p) => (p.id === matchedProj.id ? updatedProj : p)));
      try {
        const cachedRaw = localStorage.getItem("infatrack-projects-cache");
        const cached = cachedRaw ? JSON.parse(cachedRaw) : [];
        if (Array.isArray(cached)) {
          const newCache = cached.map((p: any) => (p.id === matchedProj.id ? updatedProj : p));
          localStorage.setItem("infatrack-projects-cache", JSON.stringify(newCache));
        }
      } catch {}

      updateProjectInFirestore(matchedProj.id, updatedProj).catch((err) =>
        console.warn("[MEO] Could not sync scheduled inspection to Firestore:", err)
      );

      patchProject(matchedProj.id, {
        nextScheduledInspection: updatedProj.nextScheduledInspection,
      }).catch(() => {});
    }

    showToast(
      language === "en"
        ? `Field inspection scheduled for "${newSch.projectName}"!`
        : `Naitakda ang inspeksyon para sa "${newSch.projectName}"!`
    );
    setIsAddScheduleModalOpen(false);
    setSelectedScheduleProjectId("");
    setNewScheduleForm({
      projectCode: "",
      projectName: "",
      barangay: "Poblacion",
      date: new Date().toISOString().split("T")[0],
      time: "09:00 AM",
      assignedInspector: "Assistant Municipal Engineer",
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
                <span>{language === "en" ? "Republic of the Philippines · Luisiana, Laguna" : "Republika ng Pilipinas · Luisiana, Laguna"}</span>
                <span className="eng-brand-pill">MEO</span>
              </div>
              <h1 className="eng-brand-main-title">
                {language === "en"
                  ? "Municipal Engineering Office"
                  : "Tanggapan ng Pambayang Inhinyero"}
              </h1>
            </div>
          </div>
        </div>

        <div className="eng-dash-nav-right">
          {/* Add LGU Project Modal Trigger */}
          <button
            type="button"
            className="eng-nav-btn eng-nav-btn-add-lgu"
            onClick={() => window.dispatchEvent(new CustomEvent("open-add-lgu-project"))}
            title={language === "en" ? "Encode New Public Infrastructure Project" : "Mag-encode ng LGU Proyekto"}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{language === "en" ? "Add LGU Project" : "Mag-encode ng Proyekto"}</span>
          </button>

          {/* GIS Map */}
          <button
            type="button"
            className="eng-nav-btn eng-nav-btn-map"
            onClick={() => onNavigateToMap()}
            title={language === "en" ? "Engineering GIS Map" : "Mapa ng Inhinyero"}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            <span>{language === "en" ? "GIS Map" : "Mapa ng Inhinyero"}</span>
          </button>

          {/* Engineering Analytics Button */}
          <button
            type="button"
            className={`eng-nav-btn eng-nav-btn-analytics${activeTab === "analytics" ? " active" : ""}`}
            onClick={() => setActiveTab("analytics")}
            title={language === "en" ? "Engineering Analytics & POW" : "Pagsusuri & Analytics ng Inhinyero"}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>{language === "en" ? "Analytics" : "Analytics"}</span>
          </button>

          {/* Documents Tab Button */}
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
            <span>{language === "en" ? "Documents" : "Dokumento"}</span>
          </button>

          <div className="eng-nav-separator" />
          <LanguageToggle />
          <ThemeToggle />

          {/* User Badge */}
          {session && (
            <div className="eng-user-profile-badge">
              <div className="eng-user-avatar">
                {session.name ? session.name[0]?.toUpperCase() : "M"}
              </div>
              <div className="eng-user-info">
                <span className="eng-user-name" title={session.name || "Municipal Engineer"}>
                  {session.name || (language === "en" ? "Municipal Engineer" : "Pambayang Inhinyero")}
                </span>
                <span className="eng-user-role">
                  {language === "en" ? "MEO Executive" : "Inhinyero · MEO"}
                </span>
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
              <span className="eng-sidebar-kicker">
                {language === "en" ? "MUNICIPAL ENGINEERING OFFICE" : "TANGGAPAN NG PAMBAYANG INHINYERO"}
              </span>
              <h4 className="eng-sidebar-title">{t("nav.menu")}</h4>
            </div>
            <button
              type="button"
              className="eng-sidebar-collapse-btn"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              title={isSidebarCollapsed ? t("nav.expand_sidebar") : t("nav.collapse_sidebar")}
              aria-label="Toggle sidebar collapse"
            >
              {isSidebarCollapsed ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              )}
            </button>
          </div>

          <nav className="eng-sidebar-nav-list">
            <div className="eng-sidebar-section-divider">
              {language === "en" ? "ENGINEERING MODULES" : "MGA MODYUL NG INHINYERO"}
            </div>

            {/* Tab 1: Command Center */}
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

            {/* Tab 2: Municipal Infrastructure Projects */}
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
                <span>{language === "en" ? "Municipal Projects" : "Mga Proyekto ng Bayan"}</span>
                <span className={`eng-sidebar-badge ${metrics.pendingLguCount > 0 ? "alert" : ""}`}>
                  {projects.length}
                  {metrics.pendingLguCount > 0 ? ` (${metrics.pendingLguCount})` : ""}
                </span>
              </div>
            </button>

            {/* Tab: Engineering Analytics (Dedicated Page) */}
            <button
              type="button"
              className={`eng-sidebar-btn${activeTab === "analytics" ? " active" : ""}`}
              onClick={() => setActiveTab("analytics")}
              title={language === "en" ? "Engineering Analytics" : "Pagsusuri & Analytics ng Inhinyero"}
            >
              {activeTab === "analytics" && <span className="eng-sidebar-pip" />}
              <span className="eng-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </span>
              <div className="eng-sidebar-btn-label">
                <span>{language === "en" ? "Engineering Analytics" : "Pagsusuri & Analytics"}</span>
              </div>
            </button>

            {/* Tab 3: Program of Works (POW) & BAC Procurement */}
            <button
              type="button"
              className={`eng-sidebar-btn${activeTab === "procurement" ? " active" : ""}`}
              onClick={() => setActiveTab("procurement")}
              title={language === "en" ? "Program of Works & BAC" : "Program of Works & Bidding"}
            >
              {activeTab === "procurement" && <span className="eng-sidebar-pip" />}
              <span className="eng-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </span>
              <div className="eng-sidebar-btn-label">
                <span>{language === "en" ? "POW & Procurement (BAC)" : "POW & Bidding (BAC)"}</span>
                <span className="eng-sidebar-badge">{biddingRecords.length}</span>
              </div>
            </button>

            {/* Tab 4: Field Inspection Schedules */}
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
                <span>{language === "en" ? "Field Inspections" : "Iskedyul ng Inspeksyon"}</span>
                <span className="eng-sidebar-badge">{schedules.length}</span>
              </div>
            </button>

            {/* Tab 5: Engineering Staff */}
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

            {/* Tab 6: Documents & Blueprints Vault */}
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
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </span>
              <div className="eng-sidebar-btn-label">
                <span>{t("nav.documents")}</span>
              </div>
            </button>
          </nav>

          <div className="eng-sidebar-quick-links">
            <span className="eng-sidebar-quick-label">{t("nav.quick_links")}</span>
            <button
              type="button"
              className="eng-sidebar-quick-btn"
              onClick={() => onNavigateToMap()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
              <span>{t("nav.open_3d_map")}</span>
            </button>
          </div>

          <div className="eng-sidebar-footer">
            <div className="eng-sync-pill">
              <span className="eng-sync-dot pulse" />
              <span>{t("common.live_sync")}</span>
            </div>
          </div>
        </aside>

        {/* ── Main Content Area with Scroll ────────────────────────────────── */}
        <main className="eng-content-scroll">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="eng-toast-banner" role="status">
              <span className="eng-toast-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                    <span>● Executive Command Center · Tanggapan ng Inhinyero (MEO)</span>
                  </div>
                  <h2 className="eng-hero-title">
                    {language === "en" ? "Office of the Municipal Engineer" : "Tanggapan ng Pambayang Inhinyero"}
                  </h2>
                  <p className="eng-hero-desc">
                    {language === "en"
                      ? "Centralized operational command for Program of Works (POW), road network concreting, public evacuation facilities, procurement monitoring, and GIS coordinate transparency."
                      : "Sentralisadong dashboard para sa Program of Works, pagsubaybay sa mga kalsada, tulay at pampublikong gusali ng bayan, at koordinasyon sa 3D GIS Mapa ng Luisiana."}
                  </p>
                </div>
                <div className="eng-hero-actions">
                  <button
                    type="button"
                    className="eng-btn eng-btn-primary"
                    onClick={() => setActiveTab("projects")}
                  >
                    <span>{language === "en" ? "View Municipal Projects →" : "Suriin ang mga Proyekto →"}</span>
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
                {/* Total Projects */}
                <div className="eng-stat-card is-pending">
                  <div className="eng-stat-head">
                    <span className="eng-stat-label">
                      {language === "en" ? "Active LGU Projects" : "Mga Proyekto ng Bayan"}
                    </span>
                    <span className="eng-stat-icon-badge yellow">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M2 20h20" />
                        <path d="M5 20V8l7-5 7 5v12" />
                      </svg>
                    </span>
                  </div>
                  <div className="eng-stat-value">{metrics.totalCount}</div>
                  <div className="eng-stat-sub">
                    {language === "en" ? "Municipal infrastructure registry" : "Nakatala sa pangasiwaan ng MEO"}
                  </div>
                </div>

                {/* Ongoing Works */}
                <div className="eng-stat-card is-receipt">
                  <div className="eng-stat-head">
                    <span className="eng-stat-label">
                      {language === "en" ? "Ongoing Construction" : "Kasalukuyang Ginagawa"}
                    </span>
                    <span className="eng-stat-icon-badge blue">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </span>
                  </div>
                  <div className="eng-stat-value">{metrics.ongoingCount}</div>
                  <div className="eng-stat-sub">
                    {language === "en" ? "Active civil works on site" : "Aktibong konstruksyon sa mga barangay"}
                  </div>
                </div>

                {/* Confirmed & Pinned */}
                <div className="eng-stat-card is-safe">
                  <div className="eng-stat-head">
                    <span className="eng-stat-label">
                      {language === "en" ? "Confirmed & Pinned" : "Kinumpirma at Naka-pin"}
                    </span>
                    <span className="eng-stat-icon-badge green">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  </div>
                  <div className="eng-stat-value">{metrics.confirmedCount}</div>
                  <div className="eng-stat-sub">
                    {language === "en" ? "Validated on 3D GIS satellite globe" : "Na-validate sa 3D GIS satelayt mapa"}
                  </div>
                </div>

                {/* Pending Technical Confirmation */}
                <div className="eng-stat-card is-infra">
                  <div className="eng-stat-head">
                    <span className="eng-stat-label">
                      {language === "en" ? "Awaiting Confirmation" : "Naghihintay ng Kumpirmasyon"}
                    </span>
                    <span className="eng-stat-icon-badge purple">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </span>
                  </div>
                  <div className="eng-stat-value">{metrics.pendingLguCount}</div>
                  <div className="eng-stat-sub">
                    {language === "en" ? "New projects pending MEO validation" : "Bago maitalaga sa 3D Mapa"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 2: MUNICIPAL INFRASTRUCTURE PROJECTS
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "projects" && (
            <div className="eng-tab-pane">
              <div className="eng-tab-header">
                <div>
                  <h3 className="eng-tab-title">
                    {language === "en" ? "Municipal Infrastructure Projects Monitoring" : "Subaybay sa mga Proyekto ng Bayan"}
                  </h3>
                  <p className="eng-tab-sub">
                    {language === "en"
                      ? "Registry of roads, bridges, evacuation centers, and public infrastructure supervised by the Engineering Office."
                      : "Talaan ng mga kalsada, evacuation centers, at pampublikong gusali na pinangangasiwaan ng Tanggapan ng Inhinyero."}
                  </p>
                </div>
                <div className="eng-tab-actions">
                  <button
                    type="button"
                    className="eng-btn eng-btn-primary"
                    onClick={() => window.dispatchEvent(new CustomEvent("open-add-lgu-project"))}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>{language === "en" ? "+ Add LGU Project" : "+ Mag-encode ng Proyekto"}</span>
                  </button>
                  <button
                    type="button"
                    className="eng-btn eng-btn-outline"
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

              {/* Pending confirmation alert banner */}
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
              </div>

              {/* Projects Listing */}
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
                /* List View Table */
                <div className="eng-projects-table-card">
                  <div className="eng-projects-table-scroll">
                    <table className="eng-table eng-projects-table">
                      <thead>
                        <tr>
                          <th style={{ width: 84 }}>{language === "en" ? "Photo" : "Litrato"}</th>
                          <th>{language === "en" ? "Project Code & Title" : "Kodigo & Pangalan"}</th>
                          <th>{language === "en" ? "Category" : "Kategorya"}</th>
                          <th>{language === "en" ? "Location" : "Lokasyon"}</th>
                          <th>{language === "en" ? "Budget & Contractor" : "Badyet & Kontratista"}</th>
                          <th style={{ minWidth: 130 }}>{language === "en" ? "Progress & Status" : "Pagsulong & Katayuan"}</th>
                          <th style={{ textAlign: "right", minWidth: 170 }}>{language === "en" ? "Actions" : "Aksyon"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedProjects.map((proj) => {
                          const progress = proj.progress != null ? Number(proj.progress) : 0;
                          const isPendingConfirm = proj.engineerApproved === false;
                          const projSectorKey = getBuildingSector(proj);
                          const projSectorDef = SECTOR_DEFINITIONS[projSectorKey];
                          const photoUrl = (proj.photos && proj.photos[0]?.url) || (proj as any).imageUrl;

                          return (
                            <tr key={proj.id} className={`eng-project-row ${isPendingConfirm ? "pending-approval" : ""}`}>
                              <td className="eng-table-photo-col">
                                {photoUrl ? (
                                  <button
                                    type="button"
                                    className="eng-photo-thumb-btn"
                                    onClick={() =>
                                      setViewingDoc({
                                        url: photoUrl,
                                        name: `${proj.name} — Site Photo`,
                                      })
                                    }
                                  >
                                    <img
                                      src={photoUrl}
                                      alt={proj.name}
                                      className="eng-table-photo-img"
                                      loading="lazy"
                                    />
                                    <span className="eng-photo-geotag-badge">
                                      <span>GPS</span>
                                    </span>
                                  </button>
                                ) : (
                                  <div className="eng-no-photo-box">
                                    <span>No Photo</span>
                                  </div>
                                )}
                              </td>

                              <td className="eng-table-name-col">
                                <div className="eng-project-name">{proj.name}</div>
                                <div className="eng-project-code-tag">{proj.id}</div>
                              </td>

                              <td>
                                <span
                                  className="eng-sector-badge"
                                  style={{
                                    background: "#0284c718",
                                    color: "#0284c7",
                                    borderColor: "#0284c740",
                                  }}
                                >
                                  {proj.category || proj.type || "Municipal Project"}
                                </span>
                              </td>

                              <td>
                                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{proj.barangay ? `Brgy. ${proj.barangay}` : "Luisiana"}</div>
                                <div style={{ fontSize: "0.74rem", color: "var(--apple-text-secondary, #6e6e73)" }}>
                                  {proj.location?.lat ? `${proj.location.lat.toFixed(4)}°N, ${proj.location.lon.toFixed(4)}°E` : "Location Recorded"}
                                </div>
                              </td>

                              <td>
                                <div className="eng-budget-value">
                                  ₱{Number(proj.budget || proj.cost || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="eng-contractor-sub">
                                  {(proj as any).contractor || "MEO Engineering Works"}
                                </div>
                              </td>

                              <td>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, marginBottom: 4 }}>
                                  <span style={{ textTransform: "capitalize", color: progress === 100 ? "#059669" : "#d97706" }}>
                                    {proj.status || (progress === 100 ? "Completed" : "Ongoing")}
                                  </span>
                                  <span>{progress}%</span>
                                </div>
                                <div className="eng-progress-bar-wrap">
                                  <div
                                    className="eng-progress-bar-fill"
                                    style={{
                                      width: `${Math.min(100, Math.max(0, progress))}%`,
                                      backgroundColor: progress === 100 ? "#059669" : "#0071e3",
                                    }}
                                  />
                                </div>
                              </td>

                              <td style={{ textAlign: "right" }}>
                                <div className="eng-action-btn-group">
                                  <button
                                    type="button"
                                    className="eng-btn eng-btn-xs eng-btn-outline"
                                    onClick={() => onNavigateToMap(proj.id, proj.location?.lat, proj.location?.lon, proj)}
                                    title="Tingnan sa 3D Mapa"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                                    </svg>
                                    <span>Mapa</span>
                                  </button>

                                  {isPendingConfirm ? (
                                    <button
                                      type="button"
                                      className="eng-btn eng-btn-xs eng-btn-approve"
                                      onClick={() => setApprovingLguProj(proj)}
                                      title="Kumpirmahin at I-pin sa 3D Mapa"
                                    >
                                      ✓ Kumpirmahin
                                    </button>
                                  ) : (
                                    <span className="eng-confirmed-tag">✓ Pinned</span>
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
                /* Grid Cards View */
                <div className="eng-projects-grid">
                  {displayedProjects.map((proj) => {
                    const progress = proj.progress != null ? Number(proj.progress) : 0;
                    const isPendingConfirm = proj.engineerApproved === false;
                    const projSectorKey = getBuildingSector(proj);
                    const projSectorDef = SECTOR_DEFINITIONS[projSectorKey];
                    const photoUrl = (proj.photos && proj.photos[0]?.url) || (proj as any).imageUrl;

                    return (
                      <div key={proj.id} className={`eng-project-grid-card ${isPendingConfirm ? "pending-approval" : ""}`}>
                        <div className="eng-grid-card-media">
                          {photoUrl ? (
                            <img src={photoUrl} alt={proj.name} loading="lazy" />
                          ) : (
                            <div className="eng-grid-media-placeholder">
                              <span>MEO Public Works</span>
                            </div>
                          )}
                          <span
                            className="eng-grid-sector-badge"
                            style={{ background: "#0284c7" }}
                          >
                            {proj.category || proj.type || "Municipal Project"}
                          </span>
                        </div>

                        <div className="eng-grid-card-body">
                          <h4 className="eng-grid-card-title">{proj.name}</h4>
                          <div className="eng-grid-card-sub">
                            📍 {proj.barangay ? `Brgy. ${proj.barangay}` : "Luisiana"} · <strong>₱{Number(proj.budget || proj.cost || 0).toLocaleString()}</strong>
                          </div>

                          <div className="eng-grid-card-progress">
                            <div className="eng-progress-bar-wrap">
                              <div
                                className="eng-progress-bar-fill"
                                style={{ width: `${progress}%`, background: progress === 100 ? "#059669" : "#0071e3" }}
                              />
                            </div>
                            <span>{progress}%</span>
                          </div>

                          <div className="eng-grid-card-actions">
                            <button
                              type="button"
                              className="eng-btn eng-btn-xs eng-btn-outline"
                              onClick={() => onNavigateToMap(proj.id, proj.location?.lat, proj.location?.lon, proj)}
                            >
                              3D Mapa
                            </button>
                            {isPendingConfirm ? (
                              <button
                                type="button"
                                className="eng-btn eng-btn-xs eng-btn-approve"
                                onClick={() => setApprovingLguProj(proj)}
                              >
                                ✓ Kumpirmahin
                              </button>
                            ) : (
                              <span className="eng-confirmed-tag">✓ Pinned</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 3: ENGINEERING ANALYTICS (DEDICATED PAGE)
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "analytics" && (
            <div className="eng-tab-pane">
              <div className="eng-tab-header">
                <div>
                  <h3 className="eng-tab-title">
                    {language === "en"
                      ? "Engineering & Program of Works (POW) Analytics"
                      : "Pagsusuri ng Imprastruktura at Program of Works"}
                  </h3>
                  <p className="eng-tab-sub">
                    {language === "en"
                      ? "Executive analytical command for municipal infrastructure capital budgets, RA 9184 procurement stages, and spatial barangay allocations."
                      : "Komprehensibong pagsusuri sa inilaang badyet, nanalong kontratista, mga yugto ng bidding, at alokasyon sa mga barangay ng Luisiana."}
                  </p>
                </div>
                <div className="eng-tab-actions">
                  <button
                    type="button"
                    className="eng-btn eng-btn-outline"
                    onClick={() => setActiveTab("procurement")}
                  >
                    {language === "en" ? "📑 View Bidding Registry Table →" : "📑 Suriin ang Talaan ng Bidding →"}
                  </button>
                  <button
                    type="button"
                    className="eng-btn eng-btn-primary"
                    onClick={() => window.dispatchEvent(new CustomEvent("open-add-lgu-project"))}
                  >
                    + {language === "en" ? "Add LGU Project" : "Mag-encode ng LGU Proyekto"}
                  </button>
                </div>
              </div>

              {/* Apple Glass KPI Grid */}
              <div className="eng-proc-kpi-grid">
                {/* KPI 1: ABC Budget */}
                <div className="eng-proc-kpi-card">
                  <div className="eng-proc-kpi-top">
                    <span className="eng-proc-kpi-label">
                      {language === "en" ? "Total Approved Budget (ABC)" : "Kabuuang Badyet (ABC)"}
                    </span>
                    <span className="eng-proc-kpi-icon blue">₱</span>
                  </div>
                  <div className="eng-proc-kpi-value">
                    ₱{procurementAnalytics.totalAbc.toLocaleString()}
                  </div>
                  <div className="eng-proc-kpi-foot">
                    <span>
                      {language === "en" ? "Appropriated public works funds" : "Inilaang pondo para sa publiko"}
                    </span>
                  </div>
                </div>

                {/* KPI 2: Contract Awarded */}
                <div className="eng-proc-kpi-card">
                  <div className="eng-proc-kpi-top">
                    <span className="eng-proc-kpi-label">
                      {language === "en" ? "Total Contract Awarded" : "Iginawad na Kontrata"}
                    </span>
                    <span className="eng-proc-kpi-icon slate">📄</span>
                  </div>
                  <div className="eng-proc-kpi-value">
                    ₱{procurementAnalytics.totalContracted.toLocaleString()}
                  </div>
                  <div className="eng-proc-kpi-foot">
                    <span>
                      {language === "en" ? "Committed to PCAB contractors" : "Iginawad sa lisensyadong kontratista"}
                    </span>
                  </div>
                </div>

                {/* KPI 3: Net Municipal Savings */}
                <div className="eng-proc-kpi-card">
                  <div className="eng-proc-kpi-top">
                    <span className="eng-proc-kpi-label">
                      {language === "en" ? "Net Government Savings" : "Kabuuang Natipid ng Bayan"}
                    </span>
                    <span className="eng-proc-kpi-icon green">🌱</span>
                  </div>
                  <div
                    className="eng-proc-kpi-value"
                    style={{ color: procurementAnalytics.totalSavings >= 0 ? "#10b981" : "#ef4444" }}
                  >
                    {procurementAnalytics.totalSavings >= 0 ? "+" : "-"}₱{Math.abs(procurementAnalytics.totalSavings).toLocaleString()}
                  </div>
                  <div className="eng-proc-kpi-foot">
                    <span>
                      {language === "en" ? "Competitive bidding surplus" : "Natipid sa kompetitibong bidding"}
                    </span>
                  </div>
                </div>

                {/* KPI 4: Optimization Rate */}
                <div className="eng-proc-kpi-card">
                  <div className="eng-proc-kpi-top">
                    <span className="eng-proc-kpi-label">
                      {language === "en" ? "Optimization Rate" : "Antas ng Pagtitipid"}
                    </span>
                    <span className="eng-proc-kpi-icon amber">%</span>
                  </div>
                  <div className="eng-proc-kpi-value">
                    {procurementAnalytics.totalAbc > 0
                      ? `${procurementAnalytics.savingsPercentage.toFixed(1)}%`
                      : "0.0%"}
                  </div>
                  <div className="eng-proc-kpi-foot">
                    <span>
                      {procurementAnalytics.hasRecords
                        ? `${procurementAnalytics.activeConstructionCount} ${language === "en" ? "active civil works" : "aktibong ginagawa"}`
                        : `${projects.length} ${language === "en" ? "municipal projects on record" : "proyektong nakatala"}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recharts Visualizations Grid */}
              {procurementAnalytics.hasRecords ? (
                <div className="eng-proc-charts-grid">
                  {/* Chart 1: Budget vs Contract Variance */}
                  <div className="eng-proc-chart-card">
                    <div className="eng-proc-chart-head">
                      <div>
                        <h4 className="eng-proc-chart-title">
                          {language === "en" ? "Budget vs. Contract Award Variance" : "Diperensya ng ABC at Nanalong Kontrata"}
                        </h4>
                        <div className="eng-proc-chart-sub">
                          {language === "en"
                            ? "Comparison of Approved Budget for the Contract (ABC) against winning bid amounts"
                            : "Paghahambing ng inilaang badyet laban sa pinal na halaga ng kontrata"}
                        </div>
                      </div>
                    </div>
                    <div style={{ width: "100%", height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={procurementAnalytics.budgetComparisonData}
                          margin={{ top: 12, right: 12, left: 0, bottom: 24 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.15)" />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10, fill: "var(--apple-text-secondary, #6e6e73)" }}
                            interval={0}
                            angle={-15}
                            textAnchor="end"
                          />
                          <YAxis
                            tickFormatter={(v) => `₱${v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}k`}`}
                            tick={{ fontSize: 10, fill: "var(--apple-text-secondary, #6e6e73)" }}
                          />
                          <RechartsTooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const d = payload[0].payload;
                                return (
                                  <div className="eng-chart-tooltip">
                                    <div className="eng-chart-tooltip-title">{d.fullName || label}</div>
                                    {d.code && <div className="eng-chart-tooltip-code">{d.code}</div>}
                                    {d.contractor && (
                                      <div className="eng-chart-tooltip-contractor">
                                        <strong>{language === "en" ? "Contractor: " : "Kontratista: "}</strong>
                                        {d.contractor}
                                      </div>
                                    )}
                                    <div className="eng-chart-tooltip-row">
                                      <span style={{ color: "#0071e3" }}>● {language === "en" ? "ABC Budget:" : "ABC Badyet:"}</span>
                                      <span className="eng-chart-tooltip-val">₱{Number(d.abc || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="eng-chart-tooltip-row">
                                      <span style={{ color: "#10b981" }}>● {language === "en" ? "Contract Award:" : "Iginawad na Halaga:"}</span>
                                      <span className="eng-chart-tooltip-val">₱{Number(d.contract || 0).toLocaleString()}</span>
                                    </div>
                                    {d.savings !== undefined && (
                                      <div className="eng-chart-tooltip-row">
                                        <span style={{ color: d.savings >= 0 ? "#10b981" : "#ef4444" }}>
                                          ● {language === "en" ? "Net Savings:" : "Natipid:"}
                                        </span>
                                        <span className="eng-chart-tooltip-val" style={{ color: d.savings >= 0 ? "#10b981" : "#ef4444" }}>
                                          {d.savings >= 0 ? "+" : ""}₱{Number(d.savings).toLocaleString()}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                          <Bar
                            dataKey="abc"
                            name={language === "en" ? "ABC Budget" : "ABC Badyet"}
                            fill="#0071e3"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="contract"
                            name={language === "en" ? "Contract Award" : "Nanalong Halaga"}
                            fill="#10b981"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Chart 2: RA 9184 Stages Pipeline */}
                  <div className="eng-proc-chart-card">
                    <div className="eng-proc-chart-head">
                      <div>
                        <h4 className="eng-proc-chart-title">
                          {language === "en" ? "Procurement Stages Pipeline" : "Yugto ng Bidding (RA 9184)"}
                        </h4>
                        <div className="eng-proc-chart-sub">
                          {language === "en"
                            ? "Distribution of public infrastructure across statutory procurement stages"
                            : "Distribusyon ng mga proyekto sa bawat yugto ng procurement"}
                        </div>
                      </div>
                    </div>
                    <div style={{ width: "100%", height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={procurementAnalytics.stageData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={82}
                            paddingAngle={3}
                          >
                            {procurementAnalytics.stageData.map((entry, index) => (
                              <Cell key={`stage-cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(val: any, name: any) => [
                              `${val} ${language === "en" ? "projects" : "proyekto"}`,
                              name
                            ]}
                          />
                          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Chart 3: Barangay Allocation */}
                  <div className="eng-proc-chart-card full-width">
                    <div className="eng-proc-chart-head">
                      <div>
                        <h4 className="eng-proc-chart-title">
                          {language === "en" ? "Barangay Public Works Allocation" : "Alokasyon sa mga Barangay"}
                        </h4>
                        <div className="eng-proc-chart-sub">
                          {language === "en"
                            ? "Infrastructure investment and civil works funding distributed across Luisiana barangays"
                            : "Pampublikong pondo para sa mga kalsada at pasilidad sa bawat barangay"}
                        </div>
                      </div>
                    </div>
                    <div style={{ width: "100%", height: 220 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={procurementAnalytics.barangayAllocationData}
                          margin={{ top: 8, right: 24, left: 40, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(128,128,128,0.15)" />
                          <XAxis
                            type="number"
                            tickFormatter={(v) => `₱${v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}k`}`}
                            tick={{ fontSize: 10, fill: "var(--apple-text-secondary, #6e6e73)" }}
                          />
                          <YAxis
                            type="category"
                            dataKey="barangay"
                            tick={{ fontSize: 11, fill: "var(--apple-text, #1d1d1f)" }}
                            width={110}
                          />
                          <RechartsTooltip
                            formatter={(val: any) => [
                              `₱${Number(val).toLocaleString()}`,
                              language === "en" ? "Allocated Infrastructure Budget" : "Inilaang Badyet"
                            ]}
                          />
                          <Bar
                            dataKey="totalBudget"
                            name={language === "en" ? "Allocated Budget" : "Inilaang Badyet"}
                            fill="#6366f1"
                            radius={[0, 4, 4, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : (
                /* Elegant Apple Frosted Empty State */
                <div className="eng-proc-empty-banner">
                  <div className="eng-proc-empty-icon">📊</div>
                  <div className="eng-proc-empty-title">
                    {language === "en" ? "Procurement Analytics Ready for Data" : "Handa ang Analytics para sa Opisyal na Datos"}
                  </div>
                  <p className="eng-proc-empty-desc">
                    {language === "en"
                      ? "The MEO Analytics Suite operates exclusively on authentic public records. Once legitimate awarded public works contracts are encoded, real-time RA 9184 pipeline diagrams and contractor variance charts will dynamically render here."
                      : "Ang lahat ng analytics, diperensya ng badyet, at savings rate ay kinalkula mula sa mga opisyal na rekord ng BAC. Kapag nagtala ng kontrata, kagyat na lalabas ang mga grapiko at tsart dito alinsunod sa RA 9184."}
                  </p>
                  <div className="eng-proc-empty-actions">
                    <button
                      type="button"
                      className="eng-btn eng-btn-primary"
                      onClick={() => window.dispatchEvent(new CustomEvent("open-add-lgu-project"))}
                    >
                      + {language === "en" ? "Add First LGU Project" : "Mag-encode ng Unang Proyekto"}
                    </button>
                  </div>
                  <div className="eng-proc-empty-chips">
                    <span className="eng-proc-chip">
                      🏛️ {projects.length} {language === "en" ? "Municipal projects on record" : "Proyekto ng bayan sa sistema"}
                    </span>
                    <span className="eng-proc-chip">
                      ⚖️ RA 9184 {language === "en" ? "Procurement Compliant" : "Alinsunod sa Batas"}
                    </span>
                    <span className="eng-proc-chip">
                      🛡️ {language === "en" ? "Zero Fake Data Policy" : "Tunay na Datos Lamang"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 4: POW & BAC PROCUREMENT REGISTRY TABLE
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "procurement" && (
            <div className="eng-tab-pane">
              <div className="eng-tab-header">
                <div>
                  <h3 className="eng-tab-title">
                    {language === "en" ? "Program of Works (POW) & Bidding Registry (BAC)" : "Program of Works & Talaan ng Bidding (BAC)"}
                  </h3>
                  <p className="eng-tab-sub">
                    {language === "en"
                      ? "Official monitoring of Approved Budget for the Contract (ABC), contractor bidding awards, and RA 9184 compliance."
                      : "Pagsusuri sa ABC Badyet, nanalong kontratista, at mga yugto ng procurement alinsunod sa RA 9184."}
                  </p>
                </div>
                <div className="eng-tab-actions">
                  <button
                    type="button"
                    className="eng-btn eng-btn-outline"
                    onClick={() => setActiveTab("analytics")}
                  >
                    📊 {language === "en" ? "View Analytics & Charts →" : "Suriin ang Analytics & Tsart →"}
                  </button>
                  <button
                    type="button"
                    className="eng-btn eng-btn-primary"
                    onClick={() => window.dispatchEvent(new CustomEvent("open-add-lgu-project"))}
                  >
                    + {language === "en" ? "Add LGU Project" : "Mag-encode ng LGU Proyekto"}
                  </button>
                </div>
              </div>

              {/* ── SECTION: Bidding Registry Table ── */}
              <div className="eng-projects-table-card">
                {/* Table Filter Toolbar */}
                <div className="eng-table-filter-bar">
                  <input
                    type="text"
                    className="eng-table-search-input"
                    placeholder={language === "en" ? "Search project, contractor, license..." : "Maghanap ng proyekto, kontratista..."}
                    value={biddingSearchQuery}
                    onChange={(e) => setBiddingSearchQuery(e.target.value)}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <select
                      className="eng-table-stage-select"
                      value={biddingStageFilter}
                      onChange={(e) => setBiddingStageFilter(e.target.value)}
                    >
                      <option value="all">{language === "en" ? "All Stages (RA 9184)" : "Lahat ng Yugto"}</option>
                      <option value="Pre-Procurement">Pre-Procurement</option>
                      <option value="Invitation to Bid">Invitation to Bid</option>
                      <option value="Bid Evaluation">Bid Evaluation</option>
                      <option value="Notice of Award (NOA)">Notice of Award (NOA)</option>
                      <option value="Notice to Proceed (NTP)">Notice to Proceed (NTP)</option>
                      <option value="Under Construction">Under Construction</option>
                      <option value="Completed">Completed</option>
                    </select>
                    <button
                      type="button"
                      className="eng-btn eng-btn-xs eng-btn-outline"
                      onClick={() => {
                        setBiddingSearchQuery("");
                        setBiddingStageFilter("all");
                      }}
                    >
                      {language === "en" ? "Reset" : "I-reset"}
                    </button>
                  </div>
                </div>

                <div className="eng-projects-table-scroll">
                  <table className="eng-table">
                    <thead>
                      <tr>
                        <th>{language === "en" ? "Code & Project" : "Kodigo & Proyekto"}</th>
                        <th>{language === "en" ? "Contractor & PCAB" : "Kontratista & PCAB"}</th>
                        <th>{language === "en" ? "ABC Budget" : "ABC Badyet"}</th>
                        <th>{language === "en" ? "Contract Amount" : "Halaga ng Kontrata"}</th>
                        <th>{language === "en" ? "Savings" : "Natipid"}</th>
                        <th>{language === "en" ? "Bidding Stage" : "Yugto"}</th>
                        <th style={{ textAlign: "right" }}>{language === "en" ? "Actions" : "Aksyon"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBiddingRecords.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: "48px 24px", color: "var(--apple-text-secondary, #6e6e73)" }}>
                            <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>📋</div>
                            <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--apple-text, #1d1d1f)" }}>
                              {biddingRecords.length === 0
                                ? (language === "en" ? "No Bidding & Contract Records" : "Walang Naitatalang Bidding o Kontrata")
                                : (language === "en" ? "No matching contracts found" : "Walang nahanap na tugmang kontrata")}
                            </div>
                            <div style={{ fontSize: "0.82rem", marginTop: 4 }}>
                              {biddingRecords.length === 0 ? (
                                language === "en"
                                  ? "Click '+ Add LGU Project' to encode municipal public works with approved budgets."
                                  : "I-click ang '+ Mag-encode ng LGU Proyekto' upang magtala ng mga proyekto na may badyet."
                              ) : (
                                language === "en" ? "Try clearing search or filters." : "Subukang i-reset ang paghahanap."
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredBiddingRecords.map((b) => {
                          const savings = b.abcBudget - b.contractAmount;
                          return (
                            <tr key={b.id}>
                              <td>
                                <div style={{ fontWeight: 700 }}>{b.projectName}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                  <span style={{ fontSize: "0.74rem", color: "#6b7280" }}>{b.projectCode}</span>
                                  {b.barangay && (
                                    <span
                                      style={{
                                        fontSize: "0.68rem",
                                        padding: "1px 6px",
                                        borderRadius: "980px",
                                        background: "rgba(0, 113, 227, 0.08)",
                                        color: "#0071e3",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Brgy. {b.barangay}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600 }}>{b.contractor}</div>
                                <div style={{ fontSize: "0.74rem", color: "#6b7280" }}>{b.pcabLicense}</div>
                              </td>
                              <td>₱{b.abcBudget.toLocaleString()}</td>
                              <td style={{ fontWeight: 700, color: "#0071e3" }}>₱{b.contractAmount.toLocaleString()}</td>
                              <td style={{ color: savings >= 0 ? "#059669" : "#dc2626", fontWeight: 600 }}>
                                {savings >= 0 ? "+" : "-"}₱{Math.abs(savings).toLocaleString()}
                              </td>
                              <td>
                                <span className={`eng-status-pill ${getStageBadgeClass(b.status)}`}>
                                  {b.status}
                                </span>
                              </td>
                              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <button
                                  type="button"
                                  className="eng-btn eng-btn-xs eng-btn-outline"
                                  style={{ marginRight: 6 }}
                                  title={language === "en" ? "Award or edit contract details" : "I-award o i-edit ang kontrata"}
                                  onClick={() => setEditingBiddingRecord(b)}
                                >
                                  ✏️ {language === "en" ? "Award" : "I-award"}
                                </button>
                                <button
                                  type="button"
                                  className="eng-btn eng-btn-xs eng-btn-outline"
                                  style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.25)" }}
                                  title={language === "en" ? "Delete contract record" : "Tanggalin ang talaan"}
                                  onClick={() => handleDeleteBiddingRecord(b.id, b.projectName)}
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 4: FIELD INSPECTION SCHEDULES
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "schedules" && (
            <div className="eng-tab-pane">
              <div className="eng-tab-header">
                <div>
                  <h3 className="eng-tab-title">
                    {language === "en" ? "Field Inspection Schedules" : "Iskedyul ng Field Inspection"}
                  </h3>
                  <p className="eng-tab-sub">
                    {language === "en"
                      ? "Scheduled on-site ocular visits by MEO engineers to municipal infrastructure sites."
                      : "Talaan ng nakatakdang pagbisita ng mga Inhinyero sa mga proyekto ng bayan."}
                  </p>
                </div>
                <div className="eng-tab-actions">
                  <button
                    type="button"
                    className="eng-btn eng-btn-primary"
                    onClick={() => setIsAddScheduleModalOpen(true)}
                  >
                    + {language === "en" ? "Schedule Inspection" : "Magtakda ng Inspeksyon"}
                  </button>
                </div>
              </div>

              <div className="eng-projects-table-card">
                <div className="eng-projects-table-scroll">
                  <table className="eng-table">
                    <thead>
                      <tr>
                        <th>{language === "en" ? "Project & Code" : "Proyekto & Kodigo"}</th>
                        <th>{language === "en" ? "Barangay" : "Barangay"}</th>
                        <th>{language === "en" ? "Date & Time" : "Araw & Oras"}</th>
                        <th>{language === "en" ? "Assigned Engineer" : "Inhinyerong Nakatalaga"}</th>
                        <th>{language === "en" ? "Status" : "Katayuan"}</th>
                        <th>{language === "en" ? "Notes" : "Mga Tala"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allSchedules.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "48px 24px", color: "var(--apple-text-secondary, #6e6e73)" }}>
                            <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>📅</div>
                            <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--apple-text, #1d1d1f)" }}>
                              {language === "en" ? "No Field Inspection Schedules" : "Walang Nakatakdang Field Inspection"}
                            </div>
                            <div style={{ fontSize: "0.82rem", marginTop: 4 }}>
                              {language === "en"
                                ? "Click '+ Schedule Inspection' to set up a new ocular inspection date."
                                : "I-click ang '+ Magtakda ng Inspeksyon' upang magtakda ng araw ng pagsusuri sa sityo."}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        allSchedules.map((s) => (
                          <tr key={s.id}>
                            <td>
                              <div style={{ fontWeight: 700 }}>{s.projectName}</div>
                              <div style={{ fontSize: "0.74rem", color: "#6b7280" }}>{s.projectCode}</div>
                            </td>
                            <td>Brgy. {s.barangay}</td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{s.date}</div>
                              <div style={{ fontSize: "0.74rem", color: "#6b7280" }}>{s.time}</div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{s.assignedInspector}</td>
                            <td>
                              <span className="eng-status-pill verified">{s.status}</span>
                            </td>
                            <td style={{ fontSize: "0.82rem", color: "var(--apple-text-secondary, #6e6e73)" }}>
                              {s.notes || "Standard ocular inspection"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 5: ENGINEERING PERSONNEL ROSTER
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "personnel" && (
            <div className="eng-tab-pane">
              <div className="eng-tab-header">
                <div>
                  <h3 className="eng-tab-title">{t("eng.roster_title")}</h3>
                  <p className="eng-tab-sub">{t("eng.roster_sub")}</p>
                </div>
              </div>

              <div className="eng-roster-grid">
                {personnelList.map((staff) => (
                  <div key={staff.id} className="eng-staff-card">
                    <div className="eng-staff-card-header">
                      <div className="eng-staff-avatar">
                        {staff.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="eng-staff-info">
                        <h4 className="eng-staff-name">{staff.name}</h4>
                        <span className="eng-staff-pos">{staff.position}</span>
                      </div>
                      <span className={`eng-staff-status-pill ${staff.status.toLowerCase().replace(/\s+/g, "-")}`}>
                        {staff.status}
                      </span>
                    </div>

                    <div className="eng-staff-body">
                      <div className="eng-staff-row">
                        <span className="eng-staff-label">{t("eng.specialization")}:</span>
                        <span className="eng-staff-val">{staff.specialization}</span>
                      </div>
                      <div className="eng-staff-row">
                        <span className="eng-staff-label">{t("eng.contact")}:</span>
                        <span className="eng-staff-val">{staff.phone}</span>
                      </div>
                      <div className="eng-staff-row">
                        <span className="eng-staff-label">{t("eng.assigned_barangays")}:</span>
                        <div className="eng-staff-chips">
                          {staff.assignedBarangays.map((b) => (
                            <span key={b} className="eng-staff-chip">{b}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 6: DOCUMENTS & BLUEPRINTS VAULT
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "documents" && (
            <div className="eng-tab-pane" style={{ padding: 0 }}>
              <EngineeringDocumentsPage
                onBack={() => setActiveTab("overview")}
                session={session}
                onNavigateToMap={onNavigateToMap}
                hideHeader={true}
              />
            </div>
          )}
        </main>
      </div>

      {/* ── MODAL: Confirm LGU Project & Pin to 3D Globe ── */}
      {approvingLguProj && (
        <div className="eng-modal-backdrop" onClick={() => setApprovingLguProj(null)}>
          <div className="eng-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="eng-modal-header">
              <div className="eng-modal-seal-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
              </div>
              <div className="eng-modal-title-group">
                <h3 className="eng-modal-title">
                  {language === "en" ? "Technical Validation & 3D Map Pinning" : "Kumpirmasyon at Pag-pin sa 3D Mapa"}
                </h3>
                <span className="eng-modal-sub">
                  {approvingLguProj.projectCode || approvingLguProj.id}
                </span>
              </div>
              <button
                type="button"
                className="eng-modal-close"
                onClick={() => setApprovingLguProj(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="eng-modal-body">
              <div className="eng-modal-app-summary">
                <div><strong>{language === "en" ? "Project:" : "Proyekto:"}</strong> {approvingLguProj.name}</div>
                <div><strong>{t("common.barangay")}:</strong> Brgy. {approvingLguProj.barangay || "Luisiana"}</div>
                <div><strong>{language === "en" ? "Budget:" : "Badyet:"}</strong> ₱{Number(approvingLguProj.budget || approvingLguProj.cost || 0).toLocaleString()}</div>
              </div>

              <div className="eng-modal-field">
                <label className="eng-modal-label">
                  {language === "en" ? "MEO Validation & Inspection Notes" : "Mga Tala ng Inhinyero / Inspection Notes"}
                </label>
                <textarea
                  className="eng-modal-textarea"
                  rows={3}
                  placeholder={language === "en" ? "Enter technical confirmation remarks..." : "Ilagay ang mga tala ng pag-apruba..."}
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
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="eng-btn eng-btn-primary"
                disabled={isSubmittingLguApproval}
                onClick={handleConfirmLguApproval}
              >
                {isSubmittingLguApproval ? "Pinning..." : "✓ Kumpirmahin at I-pin"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Award / Edit Bidding Record ── */}
      {editingBiddingRecord && (
        <div className="eng-modal-backdrop" onClick={() => setEditingBiddingRecord(null)}>
          <div className="eng-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="eng-modal-header">
              <div className="eng-modal-seal-badge blue">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </div>
              <div className="eng-modal-title-group">
                <h3 className="eng-modal-title">
                  {language === "en" ? "Award / Edit BAC Contract" : "I-award o I-edit ang Kontrata"}
                </h3>
                <span className="eng-modal-sub">
                  {editingBiddingRecord.projectCode} · {editingBiddingRecord.projectName}
                </span>
              </div>
              <button
                type="button"
                className="eng-modal-close"
                onClick={() => setEditingBiddingRecord(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdateBiddingRecord}>
              <div className="eng-modal-body">
                <div className="eng-modal-row">
                  <div className="eng-modal-field">
                    <label className="eng-modal-label">
                      {language === "en" ? "Approved Budget for Contract (ABC)" : "Inilaang Badyet (ABC)"}
                    </label>
                    <input
                      type="number"
                      required
                      className="eng-modal-input"
                      value={editingBiddingRecord.abcBudget}
                      onChange={(e) =>
                        setEditingBiddingRecord({
                          ...editingBiddingRecord,
                          abcBudget: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="eng-modal-field">
                    <label className="eng-modal-label">
                      {language === "en" ? "Awarded Contract Amount (₱)" : "Halaga ng Kontrata (₱)"}
                    </label>
                    <input
                      type="number"
                      required
                      className="eng-modal-input"
                      placeholder="0.00"
                      value={editingBiddingRecord.contractAmount}
                      onChange={(e) =>
                        setEditingBiddingRecord({
                          ...editingBiddingRecord,
                          contractAmount: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="eng-modal-row">
                  <div className="eng-modal-field">
                    <label className="eng-modal-label">
                      {language === "en" ? "Winning Contractor" : "Nanalong Kontratista"}
                    </label>
                    <input
                      type="text"
                      required
                      className="eng-modal-input"
                      placeholder={language === "en" ? "e.g. Alpha Builders & Construction" : "hal. Alpha Builders"}
                      value={editingBiddingRecord.contractor}
                      onChange={(e) =>
                        setEditingBiddingRecord({
                          ...editingBiddingRecord,
                          contractor: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="eng-modal-field">
                    <label className="eng-modal-label">
                      {language === "en" ? "PCAB License No." : "Numero ng Lisensya ng PCAB"}
                    </label>
                    <input
                      type="text"
                      className="eng-modal-input"
                      placeholder="e.g. PCAB-2024-9981"
                      value={editingBiddingRecord.pcabLicense}
                      onChange={(e) =>
                        setEditingBiddingRecord({
                          ...editingBiddingRecord,
                          pcabLicense: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="eng-modal-row">
                  <div className="eng-modal-field">
                    <label className="eng-modal-label">
                      {language === "en" ? "Procurement Stage (RA 9184)" : "Yugto ng Bidding (RA 9184)"}
                    </label>
                    <select
                      className="eng-modal-select"
                      value={editingBiddingRecord.status}
                      onChange={(e) =>
                        setEditingBiddingRecord({
                          ...editingBiddingRecord,
                          status: e.target.value as BiddingRecord["status"],
                        })
                      }
                    >
                      <option value="Pre-Procurement">Pre-Procurement Conference</option>
                      <option value="Invitation to Bid">Invitation to Bid (ITB)</option>
                      <option value="Bid Evaluation">Bid Evaluation & Eligibility</option>
                      <option value="Notice of Award (NOA)">Notice of Award (NOA)</option>
                      <option value="Notice to Proceed (NTP)">Notice to Proceed (NTP)</option>
                      <option value="Under Construction">Under Construction (Civil Works)</option>
                      <option value="Completed">Project Completed & Turned Over</option>
                    </select>
                  </div>

                  <div className="eng-modal-field">
                    <label className="eng-modal-label">
                      {language === "en" ? "Target Completion Date" : "Target na Petsa ng Pagtatapos"}
                    </label>
                    <input
                      type="date"
                      className="eng-modal-input"
                      value={editingBiddingRecord.targetCompletion || ""}
                      onChange={(e) =>
                        setEditingBiddingRecord({
                          ...editingBiddingRecord,
                          targetCompletion: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="eng-modal-footer">
                <button
                  type="button"
                  className="eng-btn eng-btn-outline"
                  onClick={() => setEditingBiddingRecord(null)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="eng-btn eng-btn-primary"
                >
                  {language === "en" ? "Save Contract Changes" : "I-save ang Pagbabago"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Add Field Inspection Schedule ── */}
      {isAddScheduleModalOpen && (
        <div className="eng-modal-backdrop" onClick={() => setIsAddScheduleModalOpen(false)}>
          <div className="eng-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="eng-modal-header">
              <div className="eng-modal-seal-badge amber">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
              <div className="eng-modal-title-group">
                <h3 className="eng-modal-title">
                  {language === "en" ? "+ Schedule Ocular Field Inspection" : "+ Magtakda ng Field Inspection"}
                </h3>
                <span className="eng-modal-sub">
                  {language === "en" ? "MEO Technical Site Assessment Calendar" : "Kalendaryo ng Pagsusuri sa Sityo"}
                </span>
              </div>
              <button
                type="button"
                className="eng-modal-close"
                onClick={() => {
                  setIsAddScheduleModalOpen(false);
                  setSelectedScheduleProjectId("");
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddSchedule}>
              <div className="eng-modal-body">
                <div className="eng-modal-field">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label className="eng-modal-label" style={{ margin: 0 }}>
                      {language === "en" ? "Project Name" : "Pangalan ng Proyekto"}
                    </label>
                    {availableLguProjects.length > 0 && selectedScheduleProjectId !== "__custom__" && (
                      <span style={{ fontSize: "0.75rem", color: "var(--apple-blue, #0071e3)", fontWeight: 500 }}>
                        {availableLguProjects.length} {language === "en" ? "LGU projects available" : "proyektong nakatala"}
                      </span>
                    )}
                  </div>

                  <select
                    className="eng-modal-select"
                    value={selectedScheduleProjectId}
                    onChange={(e) => handleScheduleProjectSelect(e.target.value)}
                    required={selectedScheduleProjectId !== "__custom__" && !newScheduleForm.projectName}
                  >
                    <option value="">
                      {language === "en"
                        ? `— Select from registered LGU projects (${availableLguProjects.length}) —`
                        : `— Pumili sa mga nakatalang LGU proyekto (${availableLguProjects.length}) —`}
                    </option>
                    {availableLguProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.barangay ? `— Brgy. ${p.barangay.replace(/^Brgy\.?\s+/i, "")}` : ""}
                      </option>
                    ))}
                    <option value="__custom__">
                      {language === "en" ? "✏️ Other / Enter Custom Project Name..." : "✏️ Iba pang proyekto (Manual)..."}
                    </option>
                  </select>

                  {/* If custom is selected or if no registered projects exist, show manual text input */}
                  {(selectedScheduleProjectId === "__custom__" || availableLguProjects.length === 0) && (
                    <div style={{ marginTop: 8 }}>
                      <input
                        type="text"
                        required
                        className="eng-modal-input"
                        placeholder={language === "en" ? "Type custom project name (e.g. Drainage Rehabilitation)" : "I-type ang pangalan ng proyekto"}
                        value={newScheduleForm.projectName}
                        onChange={(e) => setNewScheduleForm({ ...newScheduleForm, projectName: e.target.value })}
                        autoFocus
                      />
                    </div>
                  )}

                  {/* Selected Project Summary Pill */}
                  {selectedScheduleProjectId && selectedScheduleProjectId !== "__custom__" && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: "rgba(0, 113, 227, 0.06)",
                        border: "1px solid rgba(0, 113, 227, 0.16)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "0.82rem",
                        color: "var(--apple-text, #1d1d1f)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "1rem" }}>🏛️</span>
                        <div>
                          <div style={{ fontWeight: 600, color: "#0071e3" }}>
                            {newScheduleForm.projectCode || "LGU-PROJECT"}
                          </div>
                          <div style={{ fontSize: "0.76rem", color: "var(--apple-text-secondary, #6e6e73)" }}>
                            {language === "en" ? "Auto-synced Barangay:" : "Lokasyon:"} Brgy. {newScheduleForm.barangay}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedScheduleProjectId("__custom__")}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#0071e3",
                          fontSize: "0.78rem",
                          fontWeight: 500,
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        {language === "en" ? "Edit name" : "I-edit"}
                      </button>
                    </div>
                  )}
                </div>

                <div className="eng-modal-row">
                  <div className="eng-modal-field">
                    <label className="eng-modal-label">Barangay</label>
                    <select
                      className="eng-modal-select"
                      value={newScheduleForm.barangay}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, barangay: e.target.value })}
                    >
                      {LUISIANA_BARANGAYS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="eng-modal-field">
                    <label className="eng-modal-label">Inspector</label>
                    <select
                      className="eng-modal-select"
                      value={newScheduleForm.assignedInspector}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, assignedInspector: e.target.value })}
                    >
                      {MEO_ENGINEERING_ROSTER.map((st) => (
                        <option key={st.id} value={st.name}>{st.name} ({st.position})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="eng-modal-row">
                  <div className="eng-modal-field">
                    <label className="eng-modal-label">{language === "en" ? "Date" : "Petsa"}</label>
                    <input
                      type="date"
                      required
                      className="eng-modal-input"
                      value={newScheduleForm.date}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, date: e.target.value })}
                    />
                  </div>
                  <div className="eng-modal-field">
                    <label className="eng-modal-label">{language === "en" ? "Time" : "Oras"}</label>
                    <input
                      type="text"
                      className="eng-modal-input"
                      placeholder="e.g. 09:00 AM"
                      value={newScheduleForm.time}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, time: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="eng-modal-footer">
                <button
                  type="button"
                  className="eng-btn eng-btn-outline"
                  onClick={() => {
                    setIsAddScheduleModalOpen(false);
                    setSelectedScheduleProjectId("");
                  }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="eng-btn eng-btn-primary"
                >
                  {language === "en" ? "Confirm Schedule" : "Itakda ang Iskedyul"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Document / Photo Viewer ── */}
      {viewingDoc && (
        <InSystemDocModal
          fileUrl={viewingDoc.url}
          title={viewingDoc.name}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </div>
  );
};
export default MeoDashboardPage;
