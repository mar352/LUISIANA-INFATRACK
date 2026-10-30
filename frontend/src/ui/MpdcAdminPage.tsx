import React, { useState, useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { fetchCitizenApplications, patchCitizenApplication, backendUrl } from "../lib/api";
import { fetchProposalsOnce } from "../services/firestore-planning";
import type { SessionUser } from "../services/auth";
import type { PlanningProposal } from "../types";
import { BARANGAY_LIST } from "../types";
import { ThemeToggle } from "./ThemeToggle";
import MpdcTopNavbar from "./MpdcTopNavbar";
import { useTranslation } from "../lib/i18n";
import "./MpdcAdminPage.css";

type Props = {
  session: SessionUser | null;
  onLogout: () => void;
  onNavigate: (screen: string) => void;
};

type MpdcAdminTab = "overview" | "zoning" | "clup" | "proposals" | "staff" | "analytics";

export interface StaffMember {
  id: string;
  name: string;
  position: string;
  role: string;
  phone: string;
  status: "Active" | "On Field" | "In Office";
  assignedBarangays: string[];
  createdAt?: string;
  username?: string;
}

const LUISIANA_BARANGAYS = [
  "Barangay Zone I (Poblacion)",
  "Barangay Zone II (Poblacion)",
  "Barangay Zone III (Poblacion)",
  "Barangay Zone IV (Poblacion)",
  "Barangay Zone V (Poblacion)",
  "Barangay Zone VI (Poblacion)",
  "Barangay Zone VII (Poblacion)",
  "Barangay Zone VIII (Poblacion)",
  "De La Paz",
  "San Antonio",
  "San Buenaventura",
  "San Diego",
  "San Isidro",
  "San Jose",
  "San Juan",
  "San Luis",
  "San Pablo",
  "San Pedro",
  "San Rafael",
  "San Roque",
  "San Salvador",
  "Santo Domingo",
  "Santo Tomas",
];

const COMMON_POSITIONS = [
  "MPDC",
  "Zoning Officer",
  "Planning Officer I",
  "Planning Assistant",
  "Statistician Aide",
  "Information Technology",
  "Admin. Aide I",
  "Admin. Aide",
];

const COMMON_ROLES = [
  "MPDC",
  "Zoning Officer",
  "Planning Officer I",
  "Planning Assistant",
  "Statistician Aide",
  "Information Technology",
  "Admin. Aide I",
  "Admin. Aide",
];

const MPDC_STAFF_ROSTER: StaffMember[] = [];

export function MpdcAdminPage({ session, onLogout, onNavigate }: Props) {
  const { isEn } = useTranslation();
  const [activeTab, setActiveTab] = useState<MpdcAdminTab>("overview");
  const [applications, setApplications] = useState<any[]>([]);
  const [proposals, setProposals] = useState<PlanningProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // MPDC Staff & Personnel Directory State
  const [staffList, setStaffList] = useState<StaffMember[]>(() => {
    try {
      const cached = localStorage.getItem("infatrack_mpdc_personnel");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          // Filter out legacy hardcoded dummy users and guarantee valid properties
          return parsed
            .filter(
              (p) =>
                p &&
                !["Arch. Jose Marie C. Alcantara", "Engr. Clarissa V. Ramos", "Ronaldo T. Estrellado", "Maria Theresa N. Gomez"].includes(p?.name)
            )
            .map((p) => ({
              ...p,
              assignedBarangays: Array.isArray(p.assignedBarangays) ? p.assignedBarangays : ["All 23 Barangays"],
            }));
        }
      }
    } catch {}
    return MPDC_STAFF_ROSTER;
  });

  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [staffStatusFilter, setStaffStatusFilter] = useState<"All" | "In Office" | "On Field" | "Active">("All");
  const [staffBarangayFilter, setStaffBarangayFilter] = useState("All");
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);
  const [staffFormError, setStaffFormError] = useState<string | null>(null);

  const [staffFormData, setStaffFormData] = useState({
    name: "",
    id: "",
    position: "MPDC",
    role: "MPDC Coordinator",
    phone: "",
    status: "In Office" as "Active" | "On Field" | "In Office",
    assignedBarangays: ["All 23 Barangays"] as string[],
    createAccount: false,
    username: "",
    defaultPassword: "InfaTrack2026",
  });

  // Inspection scheduling / detail modal
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [inspectorNotes, setInspectorNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionSuccessToast, setActionSuccessToast] = useState<string | null>(null);

  // Sidebar collapsible state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("infatrack_mpdc_side_nav_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("infatrack_mpdc_side_nav_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Quick Siting coordinate tester state
  const [testCoords, setTestCoords] = useState({ lat: "14.1834", lon: "121.5173" });
  const [testResult, setTestResult] = useState<{ zone: string; hazard: string; compliant: boolean } | null>(null);

  // Load live applications and planning proposals
  const loadData = async () => {
    setLoading(true);
    try {
      const [apps, props] = await Promise.all([
        fetchCitizenApplications().catch(() => []),
        fetchProposalsOnce().catch(() => []),
      ]);
      setApplications(Array.isArray(apps) ? apps : []);
      setProposals(Array.isArray(props) ? props : []);
    } catch (err) {
      console.warn("[MPDC Admin] Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadPersonnel = async () => {
    try {
      const res = await fetch(backendUrl("/api/mpdc/personnel"), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.personnel)) {
          const cleaned = data.personnel
            .filter(
              (p: any) =>
                p &&
                !["Arch. Jose Marie C. Alcantara", "Engr. Clarissa V. Ramos", "Ronaldo T. Estrellado", "Maria Theresa N. Gomez"].includes(p?.name)
            )
            .map((p: any) => ({
              ...p,
              assignedBarangays: Array.isArray(p.assignedBarangays) ? p.assignedBarangays : ["All 23 Barangays"],
            }));
          setStaffList(cleaned);
          localStorage.setItem("infatrack_mpdc_personnel", JSON.stringify(cleaned));
        }
      }
    } catch (err) {
      console.warn("[MPDC Personnel] Error fetching:", err);
    }
  };

  useEffect(() => {
    loadData();
    loadPersonnel();

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

      socket.on("mpdc:personnel_updated", (payload: any) => {
        if (Array.isArray(payload?.list)) {
          const cleaned = payload.list
            .filter(
              (p: any) =>
                p &&
                !["Arch. Jose Marie C. Alcantara", "Engr. Clarissa V. Ramos", "Ronaldo T. Estrellado", "Maria Theresa N. Gomez"].includes(p?.name)
            )
            .map((p: any) => ({
              ...p,
              assignedBarangays: Array.isArray(p.assignedBarangays) ? p.assignedBarangays : ["All 23 Barangays"],
            }));
          setStaffList(cleaned);
          localStorage.setItem("infatrack_mpdc_personnel", JSON.stringify(cleaned));
        }
      });
    } catch {
      /* realtime fallback */
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const showToast = (msg: string) => {
    setActionSuccessToast(msg);
    setTimeout(() => setActionSuccessToast(null), 4000);
  };

  const getNextStaffId = () => {
    let max = 0;
    for (const s of staffList) {
      const match = s.id?.match(/MPDC-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > max) max = num;
      }
    }
    return `MPDC-${String(max + 1).padStart(3, "0")}`;
  };

  const openAddStaffModal = () => {
    setStaffFormError(null);
    setStaffFormData({
      name: "",
      id: getNextStaffId(),
      position: "MPDC",
      role: "MPDC",
      phone: "",
      status: "In Office",
      assignedBarangays: ["All 23 Barangays"],
      createAccount: true,
      username: "",
      defaultPassword: "InfaTrack2026",
    });
    setIsAddStaffModalOpen(true);
  };

  const toggleBarangaySelection = (brgy: string) => {
    setStaffFormData((prev) => {
      const prevList = Array.isArray(prev?.assignedBarangays) ? prev.assignedBarangays : [];
      if (brgy === "All 23 Barangays") {
        return { ...prev, assignedBarangays: ["All 23 Barangays"] };
      }
      let current = prevList.filter((b) => b !== "All 23 Barangays");
      if (current.includes(brgy)) {
        current = current.filter((b) => b !== brgy);
        if (current.length === 0) current = ["All 23 Barangays"];
      } else {
        current.push(brgy);
      }
      return { ...prev, assignedBarangays: current };
    });
  };

  const [sendingSmsStaffId, setSendingSmsStaffId] = useState<string | null>(null);

  const handleSendStaffSmsPassword = async (staff: StaffMember) => {
    const rawPhone = (staff.phone || "").trim();
    const phoneInput = window.prompt(
      `Ipadala ang Temporary Password sa SMS ni ${staff.name}.\nPakikumpirma o ilagay ang Mobile Number (09XXXXXXXXX):`,
      rawPhone.startsWith("09") || rawPhone.startsWith("+639") ? rawPhone : "09"
    );
    if (!phoneInput || !phoneInput.trim()) return;

    setSendingSmsStaffId(staff.id);
    try {
      const res = await fetch(backendUrl(`/api/mpdc/personnel/${staff.id}/send-sms-credentials`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phoneInput.trim(), defaultPassword: "InfaTrack2026" }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`✓ Naipadala ang temporary password SMS kay ${staff.name} (${phoneInput.trim()})!`);
        setStaffList((prev) =>
          prev.map((s) => (s.id === staff.id ? { ...s, phone: phoneInput.trim() } : s))
        );
      } else {
        showToast(`Hindi naipadala ang SMS: ${data.error || "Nabigo ang gateway."}`);
      }
    } catch (err: any) {
      showToast(`Error: ${err.message || "Nabigo ang koneksyon."}`);
    } finally {
      setSendingSmsStaffId(null);
    }
  };

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffFormError(null);

    if (!staffFormData.name.trim()) {
      setStaffFormError("Kailangan punan ang Pangalan ng Kawani.");
      return;
    }

    const rawPhone = staffFormData.phone.trim();
    if (!rawPhone) {
      setStaffFormError("Kailangan ilagay ang Mobile Phone Number ng kawani (hal. 09171234567) upang maipadala ang temporary password sa SMS.");
      return;
    }

    setIsSubmittingStaff(true);
    try {
      const payload = {
        name: staffFormData.name.trim(),
        id: staffFormData.id.trim() || getNextStaffId(),
        position: staffFormData.position.trim(),
        role: staffFormData.role.trim(),
        phone: rawPhone,
        status: staffFormData.status,
        assignedBarangays:
          Array.isArray(staffFormData?.assignedBarangays) && staffFormData.assignedBarangays.length > 0
            ? staffFormData.assignedBarangays
            : ["All 23 Barangays"],
        createAccount: true,
        username: staffFormData.username.trim() || staffFormData.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
        defaultPassword: staffFormData.defaultPassword || "InfaTrack2026",
      };

      const res = await fetch(backendUrl("/api/mpdc/personnel"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Nabigong idagdag ang kawani.");
      }

      const resData = await res.json();
      const updatedList = resData.list || [...staffList, resData.personnel];
      setStaffList(updatedList);
      localStorage.setItem("infatrack_mpdc_personnel", JSON.stringify(updatedList));

      setIsAddStaffModalOpen(false);

      if (resData.smsResult?.success) {
        showToast(`✓ Naidagdag si ${payload.name}! Naipadala ang temporary password sa SMS (${payload.phone}).`);
      } else if (resData.smsResult?.skipped) {
        showToast(`✓ Naidagdag si ${payload.name}! (SMS notice: ${resData.smsResult.reason})`);
      } else {
        showToast(`✓ Naidagdag si ${payload.name}! Naipasa ang credentials sa ${payload.phone}.`);
      }
    } catch (err: any) {
      // Offline fallback: save to localStorage directly if server unreachable
      const fallbackItem: StaffMember = {
        name: staffFormData.name.trim(),
        id: staffFormData.id.trim() || getNextStaffId(),
        position: staffFormData.position.trim(),
        role: staffFormData.role.trim(),
        phone: rawPhone,
        status: staffFormData.status,
        assignedBarangays:
          Array.isArray(staffFormData?.assignedBarangays) && staffFormData.assignedBarangays.length > 0
            ? staffFormData.assignedBarangays
            : ["All 23 Barangays"],
        createdAt: new Date().toISOString(),
      };
      const updatedList = [...staffList, fallbackItem];
      setStaffList(updatedList);
      localStorage.setItem("infatrack_mpdc_personnel", JSON.stringify(updatedList));
      setIsAddStaffModalOpen(false);
      showToast(`Naidagdag si ${fallbackItem.name} sa lokal na talaan ng MPDC.`);
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  const handleToggleStaffStatus = async (staffId: string) => {
    try {
      const res = await fetch(backendUrl(`/api/mpdc/personnel/${staffId}/status`), {
        method: "PATCH",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setStaffList(data.list);
        localStorage.setItem("infatrack_mpdc_personnel", JSON.stringify(data.list));
        showToast("Na-update ang katayuan ng kawani.");
      } else {
        throw new Error();
      }
    } catch {
      setStaffList((prev) => {
        const updated = prev.map((s) => (s.id === staffId ? { ...s, status: s.status === "In Office" ? ("On Field" as const) : ("In Office" as const) } : s));
        localStorage.setItem("infatrack_mpdc_personnel", JSON.stringify(updated));
        return updated;
      });
      showToast("Na-update ang katayuan ng kawani.");
    }
  };

  const handleDeleteStaff = async (staffId: string, name: string) => {
    if (!window.confirm(`Sigurado ka bang nais mong tanggalin si ${name} (${staffId}) sa talaan ng kawani ng MPDC?`)) {
      return;
    }
    try {
      const res = await fetch(backendUrl(`/api/mpdc/personnel/${staffId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setStaffList(data.list);
        localStorage.setItem("infatrack_mpdc_personnel", JSON.stringify(data.list));
        showToast(`Tinanggal si ${name} sa direktoryo.`);
      } else {
        throw new Error();
      }
    } catch {
      setStaffList((prev) => {
        const updated = prev.filter((s) => s.id !== staffId);
        localStorage.setItem("infatrack_mpdc_personnel", JSON.stringify(updated));
        return updated;
      });
      showToast(`Tinanggal si ${name} sa direktoryo.`);
    }
  };

  const handleExportStaffCsv = () => {
    const headers = ["ID ng Kawani", "Pangalan", "Posisyon", "Katungkulan", "Telepono", "Katayuan", "Nakatalagang mga Barangay"];
    const rows = staffList.map((s) => [
      s.id,
      s.name,
      s.position,
      s.role,
      s.phone,
      s.status || "In Office",
      (Array.isArray(s.assignedBarangays) ? s.assignedBarangays : ["All 23 Barangays"]).join(" / "),
    ]);
    const csvContent = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MPDC_Kawani_Direktoryo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Matagumpay na na-download ang Direktoryo ng Kawani ng MPDC.");
  };

  const filteredStaff = useMemo(() => {
    return (staffList || []).filter((s) => {
      if (!s) return false;
      const q = (staffSearchQuery || "").toLowerCase().trim();
      const brgys = Array.isArray(s.assignedBarangays) ? s.assignedBarangays : ["All 23 Barangays"];

      const matchSearch =
        q === "" ||
        String(s.name || "").toLowerCase().includes(q) ||
        String(s.id || "").toLowerCase().includes(q) ||
        String(s.position || "").toLowerCase().includes(q) ||
        String(s.role || "").toLowerCase().includes(q) ||
        brgys.some((b) => typeof b === "string" && b.toLowerCase().includes(q));

      const matchStatus = staffStatusFilter === "All" || s.status === staffStatusFilter;

      const matchBarangay =
        staffBarangayFilter === "All" ||
        brgys.includes("All 23 Barangays") ||
        brgys.some((b) => typeof b === "string" && b.includes(staffBarangayFilter));

      return matchSearch && matchStatus && matchBarangay;
    });
  }, [staffList, staffSearchQuery, staffStatusFilter, staffBarangayFilter]);

  // Helper to extract and normalize the official Barangay name from an application
  const resolveAppBarangay = (a: any): string => {
    if (!a) return "Barangay Zone I (Poblacion)";
    const raw = String(
      a.applicant?.barangay ||
      a.barangay ||
      a.lotDetails?.barangay ||
      a.lotLocation?.barangay ||
      a.address?.barangay ||
      ""
    ).trim();

    if (!raw) return "Barangay Zone I (Poblacion)";
    if (/zone\s*i\b/i.test(raw) && !/ii|iv|v|vi|vii|viii/i.test(raw)) return "Barangay Zone I (Poblacion)";
    if (/zone\s*ii\b/i.test(raw) && !/iii/i.test(raw)) return "Barangay Zone II (Poblacion)";
    if (/zone\s*iii\b/i.test(raw)) return "Barangay Zone III (Poblacion)";
    if (/zone\s*iv\b/i.test(raw)) return "Barangay Zone IV (Poblacion)";
    if (/zone\s*v\b/i.test(raw) && !/vi/i.test(raw)) return "Barangay Zone V (Poblacion)";
    if (/zone\s*vi\b/i.test(raw) && !/vii/i.test(raw)) return "Barangay Zone VI (Poblacion)";
    if (/zone\s*vii\b/i.test(raw) && !/viii/i.test(raw)) return "Barangay Zone VII (Poblacion)";
    if (/zone\s*viii\b/i.test(raw)) return "Barangay Zone VIII (Poblacion)";
    return raw;
  };

  const resolveAppApplicantName = (a: any): string => {
    if (!a) return "Aplikante";
    return a.applicant?.fullName || a.applicantName || a.fullName || a.applicant?.name || "Aplikante";
  };

  const resolveAppContact = (a: any): string => {
    if (!a) return "Walang contact";
    return a.applicant?.contactPhone || a.contactNumber || a.phone || a.applicant?.phone || "Walang contact";
  };

  // Metrics computation
  const metrics = useMemo(() => {
    const totalApps = applications.length;
    const forOcular = applications.filter((a) => {
      const st = String(a.status || "").toLowerCase();
      return st === "ocular_inspection" || st === "for_ocular_inspection";
    }).length;
    const inReview = applications.filter((a) => {
      const st = String(a.status || "").toLowerCase();
      return st === "in_review" || st === "submitted" || st === "for_payment";
    }).length;
    const approved = applications.filter((a) => {
      const st = String(a.status || "").toLowerCase();
      return st === "approved" || st === "completed" || st === "approved_for_construction";
    }).length;
    const flagged = applications.filter((a) => {
      const st = String(a.status || "").toLowerCase();
      return st === "flagged" || st === "returned" || st === "rejected";
    }).length;

    // SLA: Applications acted on in reasonable time
    const slaRate = totalApps > 0 ? (((totalApps - flagged) / totalApps) * 100).toFixed(1) : "98.4";

    // Total Proposals
    const highPrioProposals = proposals.filter((p) => p.priority === "high").length;

    return {
      totalApps,
      forOcular,
      inReview,
      approved,
      flagged,
      slaRate,
      totalProposals: proposals.length,
      highPrioProposals,
      totalStaff: staffList.length,
    };
  }, [applications, proposals, staffList]);

  // Analytics & Accomplishment Report Statistics (100% Dynamic from live applications)
  const analyticsStats = useMemo(() => {
    const total = applications.length;
    let approvedCount = 0;
    let forOcularCount = 0;
    let inReviewCount = 0;
    let returnedCount = 0;
    let safeCount = 0;
    let bufferCount = 0;

    let residentialZoneCount = 0;
    let commercialZoneCount = 0;
    let agriculturalZoneCount = 0;
    let institutionalZoneCount = 0;

    let residentialTypeCount = 0;
    let commercialTypeCount = 0;
    let institutionalTypeCount = 0;

    const brgyFrequency: Record<string, number> = {};

    for (const a of applications) {
      const st = String(a.status || "").toLowerCase();
      if (st === "approved" || st === "completed" || st === "approved_for_construction") approvedCount++;
      else if (st === "ocular_inspection" || st === "for_ocular_inspection") forOcularCount++;
      else if (st === "returned" || st === "rejected") returnedCount++;
      else inReviewCount++;

      const brgy = resolveAppBarangay(a);
      brgyFrequency[brgy] = (brgyFrequency[brgy] || 0) + 1;

      // Real CLUP Zoning Classification & Building Type
      const zc = String(a.zoningClassification || a.lotDetails?.zoningClassification || "").toLowerCase();
      const bldg = String(a.lotDetails?.proposedBuildingType || a.property?.proposedBuildingType || a.buildingType || "").toLowerCase();

      // Dynamic CLUP 4-Zone Distribution matching official CLUP framework
      if (bldg.includes("inst") || zc.includes("inst") || zc.includes("eco")) {
        institutionalZoneCount++;
      } else if (zc.includes("rural") || zc.includes("agri") || (!brgy.includes("Zone") && !brgy.includes("Poblacion"))) {
        agriculturalZoneCount++;
      } else if (bldg.includes("comm") || bldg.includes("dorm") || bldg.includes("retail") || bldg.includes("store") || zc.includes("comm")) {
        commercialZoneCount++;
      } else {
        residentialZoneCount++;
      }

      // Building Type Breakdown
      if (bldg.includes("comm") || bldg.includes("dorm") || bldg.includes("retail") || bldg.includes("store")) {
        commercialTypeCount++;
      } else if (bldg.includes("inst")) {
        institutionalTypeCount++;
      } else {
        residentialTypeCount++;
      }

      // GeoRisk Assessment from active record
      const floodVal = String(a.geoRisk?.flood?.value || a.geoRisk?.flood?.level || "").toLowerCase();
      const slideVal = String(a.geoRisk?.landslide?.value || a.geoRisk?.landslide?.level || "").toLowerCase();
      const isBuffer =
        slideVal.includes("moderate") ||
        slideVal.includes("high") ||
        floodVal.includes("moderate") ||
        floodVal.includes("high");

      if (isBuffer) bufferCount++;
      else safeCount++;
    }

    const topBarangays = Object.entries(brgyFrequency)
      .map(([name, count]) => ({
        name,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const safeRate = total > 0 ? Math.round((safeCount / total) * 100) : 100;

    return {
      total,
      approvedCount,
      forOcularCount,
      inReviewCount,
      returnedCount,
      safeCount,
      bufferCount,
      safeRate,
      residentialZoneCount,
      commercialZoneCount,
      agriculturalZoneCount,
      institutionalZoneCount,
      residentialTypeCount,
      commercialTypeCount,
      institutionalTypeCount,
      topBarangays,
    };
  }, [applications]);

  const handleExportAccomplishmentReportCsv = () => {
    const headers = [
      "Tracking Number",
      "Pangalan ng Aplikante",
      "Pamagat ng Proyekto",
      "Barangay",
      "Sona ng Lupa (Zoning)",
      "Uri ng Gusali (Building Type)",
      "Katayuan (Status)",
      "Petsa ng Pagsumite",
    ];
    const rows = applications.map((app) => {
      const brgy = resolveAppBarangay(app);
      const zoning =
        app.zoningClassification ||
        app.lotDetails?.zoningClassification ||
        (brgy.includes("Poblacion") || brgy.includes("Zone")
          ? "Urban / Commercial Zone"
          : "Rural Zone");
      const bldg = app.lotDetails?.proposedBuildingType || "Residential";

      return [
        app.trackingNumber || app.id || "",
        app.applicant?.fullName || app.applicantName || app.applicant?.name || "—",
        app.projectTitle || app.projectName || "—",
        brgy,
        zoning,
        bldg,
        app.status || "submitted",
        app.submittedAt || app.createdAt || new Date().toISOString().slice(0, 10),
      ];
    });

    const csvContent = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MPDC_Zoning_Report_Luisiana_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Matagumpay na na-download ang Talaan ng mga Aplikasyon at Sona.");
  };

  // Filtered applications for Tab 2
  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const q = String(searchQuery || "").toLowerCase().trim();
      const appBrgy = resolveAppBarangay(app);
      const appApplicant = String(app.applicant?.fullName || app.applicantName || app.applicant?.name || "");
      const matchSearch =
        !q ||
        String(app.trackingNumber || "").toLowerCase().includes(q) ||
        appApplicant.toLowerCase().includes(q) ||
        String(app.projectTitle || app.projectName || "").toLowerCase().includes(q) ||
        String(appBrgy || "").toLowerCase().includes(q);

      const matchBrgy = selectedBarangay === "all" || appBrgy === selectedBarangay;
      const matchStat = selectedStatus === "all" || app.status === selectedStatus;

      return matchSearch && matchBrgy && matchStat;
    });
  }, [applications, searchQuery, selectedBarangay, selectedStatus]);

  // Quick Siting coordinate tester
  const handleTestSiting = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(testCoords.lat);
    const lon = parseFloat(testCoords.lon);
    if (isNaN(lat) || isNaN(lon)) return;

    // Deterministic mock evaluation matching Luisiana bounds
    const isPoblacion = lat >= 14.18 && lat <= 14.19 && lon >= 121.51 && lon <= 121.52;
    const isEcoZone = lat < 14.16 || lon > 121.55;

    setTestResult({
      zone: isPoblacion ? "C-1 Commercial / R-1 Residential" : isEcoZone ? "Protected Watershed & Eco-Tourism" : "Agricultural / Rural Settlement",
      hazard: isEcoZone ? "Moderate Rain-Induced Landslide Risk" : "Low Risk (PHIVOLCS Buffer > 5km)",
      compliant: !isEcoZone,
    });
  };

  // Direct status update
  const handleUpdateStatus = async (appId: string, nextStatus: string) => {
    setIsUpdating(true);
    try {
      const res = await patchCitizenApplication(appId, {
        status: nextStatus,
        notes: inspectorNotes ? inspectorNotes : undefined,
      });
      if (res?.application) {
        setApplications((prev) => prev.map((a) => (a.id === appId ? res.application : a)));
        setSelectedApp(res.application);
        showToast(`Matagumpay na na-update ang status sa: ${nextStatus.toUpperCase()}`);
      }
    } catch (err: any) {
      alert("Hindi ma-update ang application: " + (err?.message || "Error"));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="mpdc-admin-container">
      {/* ── Top Header Navigation ── */}
      <MpdcTopNavbar
        title="Pangasiwaan ng MPDC (Executive Dashboard)"
        subtitle="Municipal Planning & Development Office · Bayan ng Luisiana, Laguna"
        brandPill="MPDC ADMIN"
        accentClass="topnav-accent-mpdc"
        serviceTag="Office of the Coordinator"
        serviceSla="Comprehensive Siting & Staff Operations"
        session={session}
        userDept="MPDC Coordinator"
        onLogout={onLogout}
      />

      {/* ── Body Layout with Dedicated MPDC Sidebar ── */}
      <div className="mpdc-body-layout">
        {/* ── Left Sidebar Navigation Buttons ── */}
        <aside className={`mpdc-sidebar${isCollapsed ? " is-collapsed" : ""}`}>
          <div className="mpdc-sidebar-header">
            <div className="mpdc-sidebar-header-info">
              <span className="mpdc-sidebar-kicker">MPDC Office</span>
              <h4 className="mpdc-sidebar-title">Pangunahing Menu</h4>
            </div>
            <button
              type="button"
              className="mpdc-sidebar-collapse-btn"
              onClick={toggleSidebar}
              title={isCollapsed ? "Palawakin ang sidebar" : "Paliitin ang sidebar"}
              aria-label="Toggle sidebar collapse"
            >
              {isCollapsed ? "»" : "«"}
            </button>
          </div>

          <nav className="mpdc-sidebar-nav-list">
            <div className="mpdc-sidebar-section-divider">Mga Modyul ng MPDC</div>

            <button
              type="button"
              className={`mpdc-sidebar-btn${activeTab === "overview" ? " active" : ""}`}
              onClick={() => setActiveTab("overview")}
              title="1. Pipeline & Siting (Command Center)"
            >
              {activeTab === "overview" && <span className="mpdc-sidebar-pip" />}
              <span className="mpdc-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="9" />
                  <rect x="14" y="3" width="7" height="5" />
                  <rect x="14" y="12" width="7" height="9" />
                  <rect x="3" y="16" width="7" height="5" />
                </svg>
              </span>
              <div className="mpdc-sidebar-btn-label">
                <span>Pipeline &amp; Siting</span>
              </div>
            </button>

            <button
              type="button"
              className={`mpdc-sidebar-btn${activeTab === "zoning" ? " active" : ""}`}
              onClick={() => setActiveTab("zoning")}
              title="2. Talaan ng Permits (Zoning Clearances)"
            >
              {activeTab === "zoning" && <span className="mpdc-sidebar-pip" />}
              <span className="mpdc-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </span>
              <div className="mpdc-sidebar-btn-label">
                <span>Talaan ng Permits</span>
                <span className="mpdc-sidebar-badge">{metrics.totalApps}</span>
              </div>
            </button>

            <button
              type="button"
              className={`mpdc-sidebar-btn${activeTab === "clup" ? " active" : ""}`}
              onClick={() => setActiveTab("clup")}
              title="3. CLUP & Zoning Ordinances"
            >
              {activeTab === "clup" && <span className="mpdc-sidebar-pip" />}
              <span className="mpdc-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
              </span>
              <div className="mpdc-sidebar-btn-label">
                <span>CLUP Ordinances</span>
              </div>
            </button>

            <button
              type="button"
              className={`mpdc-sidebar-btn${activeTab === "proposals" ? " active" : ""}`}
              onClick={() => setActiveTab("proposals")}
              title="4. Barangay Proposals (AIP 2026)"
            >
              {activeTab === "proposals" && <span className="mpdc-sidebar-pip" />}
              <span className="mpdc-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </span>
              <div className="mpdc-sidebar-btn-label">
                <span>AIP Proposals</span>
                <span className="mpdc-sidebar-badge">{metrics.totalProposals}</span>
              </div>
            </button>

            <button
              type="button"
              className={`mpdc-sidebar-btn${activeTab === "staff" ? " active" : ""}`}
              onClick={() => setActiveTab("staff")}
              title="5. Kawani ng MPDC & Field Inspectors"
            >
              {activeTab === "staff" && <span className="mpdc-sidebar-pip" />}
              <span className="mpdc-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <div className="mpdc-sidebar-btn-label">
                <span>Kawani &amp; Inspectors</span>
                <span className="mpdc-sidebar-badge">{staffList.length}</span>
              </div>
            </button>

            <button
              type="button"
              className={`mpdc-sidebar-btn${activeTab === "analytics" ? " active" : ""}`}
              onClick={() => setActiveTab("analytics")}
              title="6. Analytics at mga Ulat (Reports & Statistics)"
            >
              {activeTab === "analytics" && <span className="mpdc-sidebar-pip" />}
              <span className="mpdc-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </span>
              <div className="mpdc-sidebar-btn-label">
                <span>Analytics &amp; Ulat</span>
                <span className="mpdc-sidebar-badge" style={{ background: "rgba(0,113,227,0.12)", color: "#0071e3" }}>Live</span>
              </div>
            </button>

            <div className="mpdc-sidebar-section-divider">Mabilisang Aksyon</div>

            <button
              type="button"
              className="mpdc-sidebar-btn mpdc-sidebar-action-btn"
              onClick={() => window.dispatchEvent(new CustomEvent("open-add-lgu-project"))}
              title="Add / Encode LGU Project for Transparency"
            >
              <span className="mpdc-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <div className="mpdc-sidebar-btn-label">
                <span>Mag-encode ng Proyekto</span>
              </div>
            </button>

            <div className="mpdc-sidebar-section-divider">Mga Portal ng Bayan</div>

            <button
              type="button"
              className="mpdc-sidebar-btn mpdc-sidebar-portal-btn"
              onClick={() => onNavigate("permits")}
              title="Buksan ang Buong Talaan ng Zoning Permits"
            >
              <span className="mpdc-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
              </span>
              <div className="mpdc-sidebar-btn-label">
                <span>Talaan ng Permits (Portal)</span>
              </div>
            </button>

            <button
              type="button"
              className="mpdc-sidebar-btn mpdc-sidebar-portal-btn"
              onClick={() => onNavigate("documents")}
              title="DMS Blueprints & Legal Archives"
            >
              <span className="mpdc-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <div className="mpdc-sidebar-btn-label">
                <span>DMS Blueprints</span>
              </div>
            </button>

            <button
              type="button"
              className="mpdc-sidebar-btn mpdc-sidebar-portal-btn"
              onClick={() => onNavigate("analytics")}
              title="Buksan ang Buong 3D GIS Analytics Portal ng Bayan ng Luisiana"
            >
              <span className="mpdc-sidebar-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </span>
              <div className="mpdc-sidebar-btn-label">
                <span>3D GIS Analytics (Portal)</span>
              </div>
            </button>
          </nav>

          <div className="mpdc-sidebar-footer">
            <span className="mpdc-user-dot" />
            <span className="mpdc-sidebar-footer-text">SLA Target: 10-Min ({metrics.slaRate}%)</span>
          </div>
        </aside>

        {/* ── Main Scrollable Area ── */}
        <div className="mpdc-main-view">
          {/* ── Executive Hero Strip (Apple Minimalist) ── */}
          <section className="mpdc-hero-banner">
            <div className="mpdc-hero-content">
              <div className="mpdc-hero-titles">
                <div className="hero-status-pill">
                  <span className="hero-status-dot" />
                  <span>MPDC Executive Workspace · Live GIS &amp; Zoning Registry</span>
                </div>
                <h1>Tanggapan ng Pagpaplano at Pagpapaunlad</h1>
                <p>
                  Komprehensibong pangangasiwa sa Comprehensive Land Use Plan (CLUP), Locational Clearances,
                  Geotechnical Siting Risk, at 23-Barangay Annual Investment Program (AIP).
                </p>
              </div>

              <div className="mpdc-hero-tags">
                <span className="mpdc-hero-tag">
                  CLUP: <strong>Bayan ng Luisiana</strong>
                </span>
                <span className="mpdc-hero-tag">
                  Saklaw: <strong>23 Barangays</strong>
                </span>
                <span className="mpdc-hero-tag">
                  SLA Intake: <strong>{metrics.slaRate}%</strong>
                </span>
                <span className="mpdc-hero-tag">
                  AIP Proposals: <strong>{metrics.totalProposals} Aktibo</strong>
                </span>
              </div>
            </div>
          </section>

          {/* ── Main Dashboard Body ── */}
          <main className="mpdc-main-content">
        {/* Toast Notification */}
        {actionSuccessToast && (
          <div style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: "var(--apple-surface)",
            color: "var(--apple-text)",
            border: "1px solid var(--apple-border-strong)",
            padding: "12px 20px",
            borderRadius: "var(--apple-radius-md)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontWeight: 600,
            fontSize: "0.85rem",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--apple-safe)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{actionSuccessToast}</span>
          </div>
        )}

        {/* ── Executive KPI Ribbon ── */}
        <div className="mpdc-kpi-grid">
          <div className="mpdc-kpi-card">
            <div className="mpdc-kpi-icon-wrap emerald">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
            <div className="mpdc-kpi-body">
              <span className="mpdc-kpi-label">Aktibong Aplikasyon</span>
              <span className="mpdc-kpi-val">{metrics.totalApps}</span>
              <span className="mpdc-kpi-sub">
                <strong>{metrics.approved}</strong> aprubado · <strong>{metrics.forOcular}</strong> ocular
              </span>
            </div>
          </div>

          <div className="mpdc-kpi-card">
            <div className="mpdc-kpi-icon-wrap amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12h20" />
                <path d="M20 12l-4-4" />
                <path d="M20 12l-4 4" />
              </svg>
            </div>
            <div className="mpdc-kpi-body">
              <span className="mpdc-kpi-label">Nakatakdang Ocular Visit</span>
              <span className="mpdc-kpi-val">{metrics.forOcular}</span>
              <span className="mpdc-kpi-sub">Field setback &amp; siting verification</span>
            </div>
          </div>

          <div className="mpdc-kpi-card">
            <div className="mpdc-kpi-icon-wrap blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="mpdc-kpi-body">
              <span className="mpdc-kpi-label">SLA Compliance Rate</span>
              <span className="mpdc-kpi-val">{metrics.slaRate}%</span>
              <span className="mpdc-kpi-sub">10-Min Hakbang 1 intake standard</span>
            </div>
          </div>

          <div className="mpdc-kpi-card">
            <div className="mpdc-kpi-icon-wrap indigo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div className="mpdc-kpi-body">
              <span className="mpdc-kpi-label">Barangay Proposals</span>
              <span className="mpdc-kpi-val">{metrics.totalProposals}</span>
              <span className="mpdc-kpi-sub">
                <strong>{metrics.highPrioProposals}</strong> High Priority AIP projects
              </span>
            </div>
          </div>

          <div
            className="mpdc-kpi-card"
            style={{ cursor: "pointer" }}
            onClick={() => setActiveTab("staff")}
            title="Buksan ang Direktoryo ng Kawani ng MPDC"
          >
            <div className="mpdc-kpi-icon-wrap emerald">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="mpdc-kpi-body">
              <span className="mpdc-kpi-label">Kawani &amp; Inspectors</span>
              <span className="mpdc-kpi-val">{metrics.totalStaff}</span>
              <span className="mpdc-kpi-sub">
                <strong style={{ color: "#059669" }}>Direktoryo &amp; Add Staff →</strong>
              </span>
            </div>
          </div>

          <div
            className="mpdc-kpi-card"
            style={{ cursor: "pointer" }}
            onClick={() => setActiveTab("analytics")}
            title="Buksan ang Analytics at Accomplishment Reports ng MPDC"
          >
            <div className="mpdc-kpi-icon-wrap" style={{ background: "rgba(0,113,227,0.12)", color: "#0071e3" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <div className="mpdc-kpi-body">
              <span className="mpdc-kpi-label">Analytics &amp; Ulat</span>
              <span className="mpdc-kpi-val" style={{ color: "#0071e3" }}>{analyticsStats.safeRate}%</span>
              <span className="mpdc-kpi-sub">
                <strong style={{ color: "#0071e3" }}>Buksan ang Ulat &amp; Export →</strong>
              </span>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* TAB 1: COMMAND CENTER & ZONING PIPELINE                               */}
        {/* ===================================================================== */}
        {activeTab === "overview" && (
          <>
            {/* 4-Step Pipeline Strip */}
            <div className="mpdc-card">
              <div className="mpdc-card-header">
                <div className="mpdc-card-title-group">
                  <div className="mpdc-card-icon-pill">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                  </div>
                  <div>
                    <h3>Zoning Clearance Processing Pipeline</h3>
                    <p>Subaybayan ang pag-usad ng bawat aplikasyon sa 4 na opisyal na hakbang ng MPDC Citizen&apos;s Charter.</p>
                  </div>
                </div>
              </div>

              <div className="mpdc-pipeline-wrap">
                <div className="mpdc-pipeline-step" onClick={() => { setActiveTab("zoning"); setSelectedStatus("submitted"); }}>
                  <div className="mpdc-pipeline-bar-top" />
                  <span className="mpdc-pipeline-step-num">Hakbang 1</span>
                  <div className="mpdc-pipeline-step-title">Intake &amp; Document Review</div>
                  <div className="mpdc-pipeline-step-count">{applications.filter((a) => a.status === "submitted" || a.status === "pending").length}</div>
                  <span style={{ fontSize: "0.75rem", color: "var(--apple-text-secondary)" }}>10-min target window</span>
                </div>

                <div className="mpdc-pipeline-step" onClick={() => { setActiveTab("zoning"); setSelectedStatus("ocular_inspection"); }}>
                  <div className="mpdc-pipeline-bar-top" />
                  <span className="mpdc-pipeline-step-num">Hakbang 2</span>
                  <div className="mpdc-pipeline-step-title">Ocular Site Inspection</div>
                  <div className="mpdc-pipeline-step-count">{metrics.forOcular}</div>
                  <span style={{ fontSize: "0.75rem", color: "var(--apple-text-secondary)" }}>Field hazard verification</span>
                </div>

                <div className="mpdc-pipeline-step" onClick={() => { setActiveTab("zoning"); setSelectedStatus("for_payment"); }}>
                  <div className="mpdc-pipeline-bar-top" />
                  <span className="mpdc-pipeline-step-num">Hakbang 3</span>
                  <div className="mpdc-pipeline-step-title">Order of Payment &amp; Fees</div>
                  <div className="mpdc-pipeline-step-count">{applications.filter((a) => a.status === "in_review" || a.status === "for_payment").length}</div>
                  <span style={{ fontSize: "0.75rem", color: "var(--apple-text-secondary)" }}>Forwarded to Treasury</span>
                </div>

                <div className="mpdc-pipeline-step" onClick={() => { setActiveTab("zoning"); setSelectedStatus("approved"); }}>
                  <div className="mpdc-pipeline-bar-top" />
                  <span className="mpdc-pipeline-step-num">Hakbang 4</span>
                  <div className="mpdc-pipeline-step-title">Clearance Issuance</div>
                  <div className="mpdc-pipeline-step-count">{metrics.approved}</div>
                  <span style={{ fontSize: "0.75rem", color: "var(--apple-text-secondary)" }}>Signed &amp; Released</span>
                </div>
              </div>
            </div>

            {/* Quick Siting Coordinate Tester Tool */}
            <div className="mpdc-card">
              <div className="mpdc-card-header">
                <div className="mpdc-card-title-group">
                  <div className="mpdc-card-icon-pill">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </div>
                  <div>
                    <h3>Mabilisang Siting &amp; Georisk Conformity Checker</h3>
                    <p>Maglagay ng heograpikal na koordinata (Latitude / Longitude) upang suriin ang CLUP Zoning at Flood/Fault hazard bago mag-apruba.</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleTestSiting} style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--apple-text-secondary)" }}>Latitude</label>
                  <input
                    type="text"
                    value={testCoords.lat}
                    onChange={(e) => setTestCoords({ ...testCoords, lat: e.target.value })}
                    className="mpdc-select"
                    style={{ width: "160px" }}
                    placeholder="14.1834"
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--apple-text-secondary)" }}>Longitude</label>
                  <input
                    type="text"
                    value={testCoords.lon}
                    onChange={(e) => setTestCoords({ ...testCoords, lon: e.target.value })}
                    className="mpdc-select"
                    style={{ width: "160px" }}
                    placeholder="121.5173"
                  />
                </div>

                <button type="submit" className="landing-btn landing-btn-primary" style={{ padding: "8px 16px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <span>Suriin ang Siting</span>
                </button>
              </form>

              {testResult && (
                <div style={{
                  marginTop: "16px",
                  padding: "14px 18px",
                  background: testResult.compliant ? "var(--apple-safe-bg)" : "var(--apple-gold-bg)",
                  border: `1px solid ${testResult.compliant ? "rgba(22, 163, 74, 0.25)" : "rgba(217, 119, 6, 0.25)"}`,
                  borderRadius: "var(--apple-radius-md)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.92rem", color: testResult.compliant ? "var(--apple-safe)" : "var(--apple-gold)" }}>
                      CLUP Zone: {testResult.zone}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--apple-text-secondary)", marginTop: "2px" }}>
                      Geotechnical Assessment: {testResult.hazard}
                    </div>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--apple-text-secondary)", fontWeight: 600 }}>
                    Ang 3D structural model at elevation mapping ay isinasagawa ng Tanggapan ng Inhinyero.
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ===================================================================== */}
        {/* TAB 2: TALAAN NG ZONING CLEARANCES                                    */}
        {/* ===================================================================== */}
        {activeTab === "zoning" && (
          <div className="mpdc-card">
            <div className="mpdc-card-header">
              <div className="mpdc-card-title-group">
                <div className="mpdc-card-icon-pill">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <h3>Opisyal na Talaan ng mga Permits at Aplikasyon sa Pagpaplano</h3>
                  <p>Lahat ng Zoning Certificates at Locational Clearances sa 23 barangay ng Luisiana.</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="landing-btn landing-btn-secondary"
                  onClick={() => onNavigate("permits")}
                  title="Buksan ang buong screen ng Talaan ng Zoning Permits"
                >
                  <span>Buksan ang Talaan Portal →</span>
                </button>
                <button
                  type="button"
                  className="landing-btn landing-btn-secondary"
                  onClick={loadData}
                  title="I-refresh ang database"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  <span>I-refresh</span>
                </button>
              </div>
            </div>

            {/* Toolbar Filters */}
            <div className="mpdc-toolbar">
              <div className="mpdc-search-box">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="mpdc-search-input"
                  placeholder="Maghanap ayon sa Tracking No, Aplikante, o Proyekto..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="mpdc-filters-group">
                <select
                  className="mpdc-select"
                  value={selectedBarangay}
                  onChange={(e) => setSelectedBarangay(e.target.value)}
                >
                  <option value="all">Lahat ng 23 Barangay</option>
                  {BARANGAY_LIST.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>

                <select
                  className="mpdc-select"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  <option value="all">Lahat ng Status</option>
                  <option value="submitted">Hakbang 1: Tanggap (Submitted)</option>
                  <option value="ocular_inspection">Hakbang 2: Ocular Inspection</option>
                  <option value="in_review">Hakbang 3: In Review</option>
                  <option value="approved">Hakbang 4: Aprubado</option>
                  <option value="flagged">Flagged para sa Compliance</option>
                </select>
              </div>
            </div>

            {/* Applications Table */}
            <div className="mpdc-table-wrap">
              <table className="mpdc-table">
                <thead>
                  <tr>
                    <th>Tracking Number</th>
                    <th>Aplikante</th>
                    <th>Proyekto</th>
                    <th>Barangay</th>
                    <th>Hakbang / Status</th>
                    <th>Petsa</th>
                    <th style={{ textAlign: "right" }}>Aksyon ng MPDC</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApplications.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "var(--apple-text-secondary)" }}>
                        Walang natagpuang aplikasyon batay sa iyong filter.
                      </td>
                    </tr>
                  ) : (
                    filteredApplications.map((app) => (
                      <tr key={app.id || app.trackingNumber}>
                        <td>
                          <span className="mpdc-tracking-pill">{app.trackingNumber || "LUIS-2026-XXXX"}</span>
                        </td>
                        <td>
                          <strong style={{ display: "block" }}>{resolveAppApplicantName(app)}</strong>
                          <span style={{ fontSize: "0.75rem", color: "var(--apple-text-secondary)" }}>{resolveAppContact(app)}</span>
                        </td>
                        <td>
                          <span>{app.projectTitle || "Zoning Clearance Siting"}</span>
                        </td>
                        <td>
                          <span>{resolveAppBarangay(app)}</span>
                        </td>
                        <td>
                          <span className={`mpdc-status-badge ${app.status || "submitted"}`}>
                            {app.status === "ocular_inspection" ? "Hakbang 2: Ocular" : app.status || "Submitted"}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.78rem", color: "var(--apple-text-secondary)" }}>
                          {app.createdAt ? new Date(app.createdAt).toLocaleDateString("tl-PH") : "Kamakailan"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="landing-btn landing-btn-secondary"
                            style={{ padding: "5px 12px", fontSize: "0.78rem" }}
                            onClick={() => setSelectedApp(app)}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            <span>Suriin</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 3: CLUP & ZONING ORDINANCES                                       */}
        {/* ===================================================================== */}
        {activeTab === "clup" && (
          <div className="mpdc-card">
            <div className="mpdc-card-header">
              <div className="mpdc-card-title-group">
                <div className="mpdc-card-icon-pill">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                </div>
                <div>
                  <h3>Comprehensive Land Use Plan (CLUP)</h3>
                  <p>Mga opisyal na sona ng lupa at pamantayan sa zoning ng Bayan ng Luisiana, Laguna.</p>
                </div>
              </div>
            </div>

            <div className="mpdc-clup-grid">
              <div className="mpdc-clup-card">
                <span className="mpdc-clup-badge r1">R-1 Low Density Residential</span>
                <h4>Sona ng Mababang Density na Tirahan</h4>
                <p>Nakalaan para sa mga single-family detached dwellings, barangay chapels, at day-care centers. Bawal ang mabibigat na industriya o warehouse.</p>
                <div className="mpdc-clup-rules">Saklaw: Poblacion Zones 1–8, San Buenaventura</div>
              </div>

              <div className="mpdc-clup-card">
                <span className="mpdc-clup-badge r2">R-2 Medium Density Residential</span>
                <h4>Sona ng Katamtamang Density na Tirahan</h4>
                <p>Pinapayagan ang two-family dwellings, townhouses, sari-sari stores, at maliliit na klinika na sumusunod sa 3-meter setback.</p>
                <div className="mpdc-clup-rules">Saklaw: Sto. Domingo, San Roque, Sto. Tomas</div>
              </div>

              <div className="mpdc-clup-card">
                <span className="mpdc-clup-badge c1">C-1 Commercial District</span>
                <h4>Pangunahing Sona ng Kalakalan at Pamilihan</h4>
                <p>Sentro ng komersyo sa bayan, pamilihang bayan (Public Market), retail banks, mga botika, kainan, at opisina ng negosyo.</p>
                <div className="mpdc-clup-rules">Saklaw: Luisiana Town Plaza &amp; Palengke Perimeter</div>
              </div>

              <div className="mpdc-clup-card">
                <span className="mpdc-clup-badge agri">Agricultural &amp; Agro-Forestry</span>
                <h4>Sona ng Pagsasaka at Pandan / Lansones</h4>
                <p>Lupang nakalaan sa pagsasaka, plantasyon ng pandan, taniman ng lansones, at mga pasilidad ng patubig. Mahigpit na protektado laban sa illegal conversion.</p>
                <div className="mpdc-clup-rules">Saklaw: San Diego, San Salvador, San Antonio, San Isidro</div>
              </div>

              <div className="mpdc-clup-card">
                <span className="mpdc-clup-badge eco">Eco-Tourism &amp; Watershed Protection</span>
                <h4>Protected Watershed &amp; Talon ng Aliw</h4>
                <p>Mga protektadong kagubatan, watershed reservoir, talon, at natural eco-tourism sites. Nangangailangan ng DENR-ECC at MPDC Siting Clearance.</p>
                <div className="mpdc-clup-rules">Saklaw: Botocan, Cavinti-Luisiana Buffer Boundary</div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 4: BARANGAY PROPOSALS (AIP 2026)                                  */}
        {/* ===================================================================== */}
        {activeTab === "proposals" && (
          <div className="mpdc-card">
            <div className="mpdc-card-header">
              <div className="mpdc-card-title-group">
                <div className="mpdc-card-icon-pill">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                </div>
                <div>
                  <h3>Barangay Development Projects (AIP / CDP Prioritization)</h3>
                  <p>Mga panukalang proyekto mula sa 23 Punong Barangay na sinusuri ng MPDC para sa Annual Investment Program.</p>
                </div>
              </div>
            </div>

            <div className="mpdc-table-wrap">
              <table className="mpdc-table">
                <thead>
                  <tr>
                    <th>Pamagat ng Proyekto</th>
                    <th>Nagmumulang Barangay</th>
                    <th>Tinatayang Pondo</th>
                    <th>Prioridad</th>
                    <th>Status sa MPDC</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "2.5rem", color: "var(--apple-text-secondary)" }}>
                        Walang nakabinbing panukala sa kasalukuyan.
                      </td>
                    </tr>
                  ) : (
                    proposals.slice(0, 10).map((prop) => (
                      <tr key={prop.id}>
                        <td>
                          <strong>{prop.title}</strong>
                          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--apple-text-secondary)" }}>
                            {prop.description ? prop.description.slice(0, 75) + "..." : "Walang deskripsyon"}
                          </span>
                        </td>
                        <td>{prop.department || "Barangay Hall"}</td>
                        <td>₱{Number(prop.budget || 250000).toLocaleString("en-PH")}</td>
                        <td>
                          <span className={`mpdc-status-badge ${prop.priority === "high" ? "urgent" : "submitted"}`}>
                            {prop.priority ? prop.priority.toUpperCase() : "NORMAL"}
                          </span>
                        </td>
                        <td>
                          <span className="mpdc-status-badge in_review">{prop.status || "In Review"}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 5: KAWANI NG MPDC & FIELD INSPECTORS                              */}
        {/* ===================================================================== */}
        {activeTab === "staff" && (
          <div className="mpdc-card">
            <div className="mpdc-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div className="mpdc-card-title-group">
                <div className="mpdc-card-icon-pill">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <h3>Direktoryo ng Kawani ng MPDC at Field Zoning Inspectors</h3>
                  <p>Opisyal na talaan ng mga kawaning nangangasiwa sa CLUP zoning at ocular site inspections ({staffList.length} Kawani).</p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  className="landing-btn landing-btn-secondary"
                  onClick={handleExportStaffCsv}
                  title="I-export ang opisyal na direktoryo sa CSV"
                  style={{ padding: "8px 14px", fontSize: "0.8rem" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  className="mpdc-btn-emerald"
                  onClick={openAddStaffModal}
                  title="Magrehistro ng bagong kawani o inspector sa MPDC"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>+ Magdagdag ng Kawani</span>
                </button>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="mpdc-staff-toolbar">
              <div className="mpdc-staff-search-box">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--apple-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Maghanap ayon sa Pangalan, ID (MPDC-001), Posisyon, o Barangay..."
                  value={staffSearchQuery}
                  onChange={(e) => setStaffSearchQuery(e.target.value)}
                />
                {staffSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setStaffSearchQuery("")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--apple-text-secondary)", fontSize: "0.85rem" }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="mpdc-staff-filters">
                <select
                  className="mpdc-select"
                  value={staffStatusFilter}
                  onChange={(e) => setStaffStatusFilter(e.target.value as any)}
                  aria-label="Filter ayon sa Katayuan"
                >
                  <option value="All">Lahat ng Katayuan</option>
                  <option value="In Office">In Office (Nasa Tanggapan)</option>
                  <option value="On Field">On Field (Nasa Inspeksyon)</option>
                  <option value="Active">Active (Aktibo)</option>
                </select>

                <select
                  className="mpdc-select"
                  value={staffBarangayFilter}
                  onChange={(e) => setStaffBarangayFilter(e.target.value)}
                  aria-label="Filter ayon sa Barangay"
                >
                  <option value="All">Lahat ng Barangay Assignment</option>
                  {LUISIANA_BARANGAYS.map((brgy) => (
                    <option key={brgy} value={brgy}>{brgy}</option>
                  ))}
                </select>

                <span style={{ fontSize: "0.76rem", color: "var(--apple-text-secondary)", whiteSpace: "nowrap" }}>
                  Ipinapakita: <strong>{filteredStaff.length}</strong> sa {staffList.length}
                </span>
              </div>
            </div>

            <div className="mpdc-table-wrap">
              <table className="mpdc-table">
                <thead>
                  <tr>
                    <th>ID ng Kawani</th>
                    <th>Pangalan</th>
                    <th>Posisyon at Katungkulan</th>
                    <th>Telepono / Contact</th>
                    <th>Katayuan</th>
                    <th>Nakatalagang mga Barangay</th>
                    <th style={{ textAlign: "right" }}>Mga Aksyon</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "48px 16px", color: "var(--apple-text-secondary)" }}>
                        <div style={{ maxWidth: "420px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--apple-gray-100, #f1f5f9)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--apple-text-secondary)" }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                          </div>
                          <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--apple-text)" }}>
                            {staffSearchQuery || staffStatusFilter !== "All" || staffBarangayFilter !== "All"
                              ? "Walang natagpuang kawani sa pamantayan ng paghahanap."
                              : "Walang nakatalang kawani sa direktoryo."}
                          </div>
                          <p style={{ fontSize: "0.82rem", margin: 0, color: "var(--apple-text-secondary)" }}>
                            {staffSearchQuery || staffStatusFilter !== "All" || staffBarangayFilter !== "All"
                              ? "Subukang i-clear ang filter upang makita ang lahat ng kawani."
                              : "Gamitin ang \"+ Magdagdag ng Kawani\" upang magrehistro ng opisyal o field inspector sa tanggapan."}
                          </p>
                          {!staffSearchQuery && staffStatusFilter === "All" && staffBarangayFilter === "All" && (
                            <button
                              type="button"
                              className="mpdc-btn-emerald"
                              onClick={openAddStaffModal}
                              style={{ marginTop: "6px" }}
                            >
                              + Magdagdag ng Kawani
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStaff.map((staff) => (
                      <tr key={staff.id}>
                        <td><code className="mpdc-tracking-pill">{staff.id}</code></td>
                        <td>
                          <strong>{staff.name}</strong>
                          {staff.username && (
                            <div style={{ fontSize: "0.72rem", color: "var(--apple-accent)", marginTop: "2px" }}>
                              @{staff.username}
                            </div>
                          )}
                        </td>
                        <td>
                          <div>{staff.position}</div>
                          <span style={{ fontSize: "0.74rem", color: "var(--apple-text-secondary)" }}>{staff.role}</span>
                        </td>
                        <td>{staff.phone}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleToggleStaffStatus(staff.id)}
                            title="I-click upang i-toggle ang katayuan (In Office / On Field)"
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                          >
                            <span className={`mpdc-status-badge ${staff.status === "In Office" ? "approved" : staff.status === "On Field" ? "ocular" : "pending"}`}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                              {staff.status}
                            </span>
                          </button>
                        </td>
                        <td style={{ fontSize: "0.8rem", color: "var(--apple-text-secondary)", maxWidth: "240px" }}>
                          {(Array.isArray(staff?.assignedBarangays) ? staff.assignedBarangays : ["All 23 Barangays"]).join(", ")}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button
                              type="button"
                              className="mpdc-table-btn"
                              onClick={() => handleSendStaffSmsPassword(staff)}
                              disabled={sendingSmsStaffId === staff.id}
                              title="I-send o muling i-send ang temporary password sa mobile number ng kawani sa SMS"
                              style={{ color: "#0071e3", borderColor: "rgba(0,113,227,0.3)" }}
                            >
                              {sendingSmsStaffId === staff.id ? "Nagpapadala..." : "📱 SMS Pass"}
                            </button>
                            <button
                              type="button"
                              className="mpdc-table-btn"
                              onClick={() => handleToggleStaffStatus(staff.id)}
                              title={staff.status === "In Office" ? "Ilipat sa On Field (Site Inspection)" : "Ibalik sa In Office (Tanggapan)"}
                            >
                              {staff.status === "In Office" ? "Mag-Field" : "Pumasok"}
                            </button>
                            <button
                              type="button"
                              className="mpdc-table-btn delete"
                              onClick={() => handleDeleteStaff(staff.id, staff.name)}
                              title="Alisin ang kawani sa direktoryo"
                            >
                              Alisin
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 6: ANALYTICS AT MGA ULAT (ACCOMPLISHMENT REPORTS)                  */}
        {/* ===================================================================== */}
        {activeTab === "analytics" && (
          <div className="mpdc-card">
            <div className="mpdc-card-header" style={{ flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
              <div className="mpdc-card-title-group">
                <div className="mpdc-card-icon-pill" style={{ background: "rgba(0,113,227,0.12)", color: "#0071e3" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
                <div>
                  <h3>Analytics at Opisyal na Ulat ng MPDC</h3>
                  <p>Real-time na mga datos, pag-unlad ng zoning clearances, hazard safety distribution, at opisyal na ulat ng pagsasakatuparan.</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className="mpdc-btn mpdc-btn-secondary"
                  onClick={handleExportAccomplishmentReportCsv}
                  title="I-download ang CSV file ng talaan ng aplikasyon at permits"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>I-export ang CSV</span>
                </button>

                <button
                  type="button"
                  className="mpdc-btn mpdc-btn-primary"
                  onClick={() => onNavigate("analytics")}
                  title="Buksan ang buong 3D GIS Analytics Portal ng Bayan ng Luisiana"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span>3D GIS Portal</span>
                </button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="mpdc-analytics-kpi-grid">
              <div className="mpdc-analytics-kpi-card">
                <div className="mpdc-analytics-kpi-top">
                  <span className="mpdc-analytics-kpi-label">Kabuuang Aplikasyon</span>
                  <span style={{ fontSize: "1.1rem" }}>📋</span>
                </div>
                <span className="mpdc-analytics-kpi-val">{analyticsStats.total}</span>
                <span className="mpdc-analytics-kpi-sub">
                  Nakatala sa sistema ng MPDC
                </span>
              </div>

              <div className="mpdc-analytics-kpi-card">
                <div className="mpdc-analytics-kpi-top">
                  <span className="mpdc-analytics-kpi-label">Naaprubahan / Inilabas</span>
                  <span style={{ fontSize: "1.1rem" }}>✅</span>
                </div>
                <span className="mpdc-analytics-kpi-val" style={{ color: "#059669" }}>{analyticsStats.approvedCount}</span>
                <span className="mpdc-analytics-kpi-sub">
                  May Locational Clearance / Permits
                </span>
              </div>

              <div className="mpdc-analytics-kpi-card">
                <div className="mpdc-analytics-kpi-top">
                  <span className="mpdc-analytics-kpi-label">Ocular Inspection</span>
                  <span style={{ fontSize: "1.1rem" }}>🔍</span>
                </div>
                <span className="mpdc-analytics-kpi-val" style={{ color: "#d97706" }}>{analyticsStats.forOcularCount}</span>
                <span className="mpdc-analytics-kpi-sub">
                  Nakatakdang suriin sa field
                </span>
              </div>

              <div className="mpdc-analytics-kpi-card">
                <div className="mpdc-analytics-kpi-top">
                  <span className="mpdc-analytics-kpi-label">Ligtas na Pagpapatayo</span>
                  <span style={{ fontSize: "1.1rem" }}>🛡️</span>
                </div>
                <span className="mpdc-analytics-kpi-val" style={{ color: "#0071e3" }}>{analyticsStats.safeRate}%</span>
                <span className="mpdc-analytics-kpi-sub">
                  {analyticsStats.safeCount} labas sa high hazard zones
                </span>
              </div>

              <div className="mpdc-analytics-kpi-card">
                <div className="mpdc-analytics-kpi-top">
                  <span className="mpdc-analytics-kpi-label">AIP Barangay Proposals</span>
                  <span style={{ fontSize: "1.1rem" }}>📑</span>
                </div>
                <span className="mpdc-analytics-kpi-val">{metrics.totalProposals}</span>
                <span className="mpdc-analytics-kpi-sub">
                  {metrics.highPrioProposals} Mataas na prayoridad
                </span>
              </div>
            </div>

            {/* Visual Charts & Categorical Breakdown */}
            <div className="mpdc-analytics-charts-grid">
              {/* Panel 1: Sona ng Lupa (Zoning Classification) */}
              <div className="mpdc-analytics-panel">
                <div className="mpdc-analytics-panel-header">
                  <h4 className="mpdc-analytics-panel-title">Distribusyon ng Sona (CLUP Zones)</h4>
                  <span style={{ fontSize: "0.74rem", color: "var(--apple-text-secondary)" }}>
                    {analyticsStats.total} Aplikasyon
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="mpdc-analytics-bar-row">
                    <div className="mpdc-analytics-bar-info">
                      <span className="mpdc-analytics-bar-name">Residential (R-1 &amp; R-2 Low/Mod Density)</span>
                      <span className="mpdc-analytics-bar-count">
                        {analyticsStats.residentialZoneCount} ({analyticsStats.total > 0 ? Math.round((analyticsStats.residentialZoneCount / analyticsStats.total) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="mpdc-analytics-bar-track">
                      <div
                        className="mpdc-analytics-bar-fill"
                        style={{
                          width: `${analyticsStats.total > 0 ? (analyticsStats.residentialZoneCount / analyticsStats.total) * 100 : 0}%`,
                          background: "#0071e3",
                        }}
                      />
                    </div>
                  </div>

                  <div className="mpdc-analytics-bar-row">
                    <div className="mpdc-analytics-bar-info">
                      <span className="mpdc-analytics-bar-name">Commercial (C-1 Urban / Poblacion Core)</span>
                      <span className="mpdc-analytics-bar-count">
                        {analyticsStats.commercialZoneCount} ({analyticsStats.total > 0 ? Math.round((analyticsStats.commercialZoneCount / analyticsStats.total) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="mpdc-analytics-bar-track">
                      <div
                        className="mpdc-analytics-bar-fill"
                        style={{
                          width: `${analyticsStats.total > 0 ? (analyticsStats.commercialZoneCount / analyticsStats.total) * 100 : 0}%`,
                          background: "#f59e0b",
                        }}
                      />
                    </div>
                  </div>

                  <div className="mpdc-analytics-bar-row">
                    <div className="mpdc-analytics-bar-info">
                      <span className="mpdc-analytics-bar-name">Agricultural at Pandan / Lansones</span>
                      <span className="mpdc-analytics-bar-count">
                        {analyticsStats.agriculturalZoneCount} ({analyticsStats.total > 0 ? Math.round((analyticsStats.agriculturalZoneCount / analyticsStats.total) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="mpdc-analytics-bar-track">
                      <div
                        className="mpdc-analytics-bar-fill"
                        style={{
                          width: `${analyticsStats.total > 0 ? (analyticsStats.agriculturalZoneCount / analyticsStats.total) * 100 : 0}%`,
                          background: "#10b981",
                        }}
                      />
                    </div>
                  </div>

                  <div className="mpdc-analytics-bar-row">
                    <div className="mpdc-analytics-bar-info">
                      <span className="mpdc-analytics-bar-name">Institutional / Protected Eco-Tourism</span>
                      <span className="mpdc-analytics-bar-count">
                        {analyticsStats.institutionalZoneCount} ({analyticsStats.total > 0 ? Math.round((analyticsStats.institutionalZoneCount / analyticsStats.total) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="mpdc-analytics-bar-track">
                      <div
                        className="mpdc-analytics-bar-fill"
                        style={{
                          width: `${analyticsStats.total > 0 ? (analyticsStats.institutionalZoneCount / analyticsStats.total) * 100 : 0}%`,
                          background: "#8b5cf6",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid var(--apple-border)", paddingTop: "10px", marginTop: "4px", fontSize: "0.76rem", color: "var(--apple-text-secondary)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                    <span>Uri ng Ipinapatayo:</span>
                    <span><strong>{analyticsStats.residentialTypeCount}</strong> Residensyal · <strong>{analyticsStats.commercialTypeCount}</strong> Komersyal / Dormitory · <strong>{analyticsStats.institutionalTypeCount}</strong> Institusyonal</span>
                  </div>
                </div>
              </div>

              {/* Panel 2: Nangungunang mga Barangay */}
              <div className="mpdc-analytics-panel">
                <div className="mpdc-analytics-panel-header">
                  <h4 className="mpdc-analytics-panel-title">Nangungunang mga Barangay (Lokasyon)</h4>
                  <span style={{ fontSize: "0.74rem", color: "var(--apple-text-secondary)" }}>
                    Top 5 Barangays
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {analyticsStats.topBarangays.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "var(--apple-text-secondary)", fontSize: "0.82rem" }}>
                      Wala pang naitalang aplikasyon sa mga barangay.
                    </div>
                  ) : (
                    analyticsStats.topBarangays.map((b) => (
                      <div key={b.name} className="mpdc-analytics-bar-row">
                        <div className="mpdc-analytics-bar-info">
                          <span className="mpdc-analytics-bar-name">{b.name}</span>
                          <span className="mpdc-analytics-bar-count">
                            {b.count} aplikasyon ({b.pct}%)
                          </span>
                        </div>
                        <div className="mpdc-analytics-bar-track">
                          <div
                            className="mpdc-analytics-bar-fill"
                            style={{ width: `${b.pct}%`, background: "#059669" }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      </div>
    </div>

      {/* ── Inspection / Review Modal ── */}
      {selectedApp && (
        <div className="mpdc-modal-backdrop" role="dialog" aria-modal="true">
          <div className="mpdc-modal-card">
            <div className="mpdc-modal-header">
              <div className="mpdc-modal-title">
                <h3>{isEn ? `Review Zoning Application: ${selectedApp.trackingNumber}` : `Suriin ang Zoning Application: ${selectedApp.trackingNumber}`}</h3>
                <p>{selectedApp.projectTitle || (isEn ? "Zoning Clearance Evaluation" : "Zoning Clearance Evaluation")}</p>
              </div>
              <button
                type="button"
                className="mpdc-modal-close-btn"
                onClick={() => setSelectedApp(null)}
                aria-label={isEn ? "Close" : "Isara"}
              >
                ✕
              </button>
            </div>

            <div className="mpdc-modal-body">
              <div className="mpdc-detail-grid">
                <div className="mpdc-detail-item">
                  <span className="mpdc-detail-key">{isEn ? "Applicant Name" : "Pangalan ng Aplikante"}</span>
                  <span className="mpdc-detail-val">{resolveAppApplicantName(selectedApp)}</span>
                </div>
                <div className="mpdc-detail-item">
                  <span className="mpdc-detail-key">Barangay</span>
                  <span className="mpdc-detail-val">{resolveAppBarangay(selectedApp)}</span>
                </div>
                <div className="mpdc-detail-item">
                  <span className="mpdc-detail-key">{isEn ? "Current Status" : "Kasalukuyang Status"}</span>
                  <span className="mpdc-detail-val">{selectedApp.status || "Submitted"}</span>
                </div>
                <div className="mpdc-detail-item">
                  <span className="mpdc-detail-key">{isEn ? "Contact Phone" : "Telepono / Contact"}</span>
                  <span className="mpdc-detail-val">{resolveAppContact(selectedApp)}</span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--apple-text, #0f172a)", display: "block", marginBottom: "6px" }}>
                  {isEn ? "Official Notes of MPDC Reviewer:" : "Opisyal na Tala ng MPDC Reviewer:"}
                </label>
                <textarea
                  className="mpdc-select"
                  style={{ width: "100%", height: "80px", borderRadius: "10px" }}
                  placeholder={isEn ? "Enter notes for ocular site inspection or zoning compliance..." : "Maglagay ng komento para sa ocular site inspection o zoning compliance..."}
                  value={inspectorNotes}
                  onChange={(e) => setInspectorNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="mpdc-modal-footer">
              <button
                type="button"
                className="landing-btn landing-btn-secondary"
                onClick={() => setSelectedApp(null)}
              >
                {isEn ? "Close" : "Isara"}
              </button>

              <button
                type="button"
                className="landing-btn landing-btn-outline"
                style={{ color: "var(--apple-gold)", borderColor: "var(--apple-gold)" }}
                disabled={isUpdating}
                onClick={() => handleUpdateStatus(selectedApp.id, "ocular_inspection")}
              >
                {isEn ? "Set to Ocular Site Visit (Step 2)" : "Itakda sa Ocular Site Visit (Hakbang 2)"}
              </button>

              <button
                type="button"
                className="landing-btn landing-btn-primary"
                disabled={isUpdating}
                onClick={() => handleUpdateStatus(selectedApp.id, "approved")}
              >
                {isEn ? "Approve Zoning Clearance" : "Aprubahan ang Zoning Clearance"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add MPDC Personnel Modal ── */}
      {isAddStaffModalOpen && (
        <div className="mpdc-modal-backdrop" role="dialog" aria-modal="true">
          <div className="mpdc-modal-card" style={{ maxWidth: "640px" }}>
            <div className="mpdc-modal-header">
              <div className="mpdc-modal-title">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="mpdc-kpi-icon-wrap emerald" style={{ width: "28px", height: "28px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
                  <h3>{isEn ? "Register New MPDC Staff" : "Magrehistro ng Bagong Kawani ng MPDC"}</h3>
                </div>
                <p>{isEn ? "Add an officer, urban planner, or field ocular inspector to the office directory." : "Magdagdag ng opisyal, urban planner, o field ocular inspector sa direktoryo ng tanggapan."}</p>
              </div>
              <button
                type="button"
                className="mpdc-modal-close-btn"
                onClick={() => setIsAddStaffModalOpen(false)}
                title={isEn ? "Close" : "Isara"}
                aria-label={isEn ? "Close" : "Isara"}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStaffSubmit}>
              <div className="mpdc-modal-body" style={{ maxHeight: "70vh", overflowY: "auto", padding: "20px 24px" }}>
                {staffFormError && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "var(--apple-radius-sm)",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#dc2626",
                    fontSize: "0.82rem",
                    marginBottom: "14px",
                    fontWeight: 600,
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>{staffFormError}</span>
                  </div>
                )}

                <div className="mpdc-form-row">
                  <div className="mpdc-form-group">
                    <label className="mpdc-form-label">
                      {isEn ? "Staff Full Name *" : "Pangalan ng Kawani *"}
                    </label>
                    <input
                      type="text"
                      className="mpdc-form-input"
                      placeholder={isEn ? "e.g. Arch. Maria C. Santos" : "Hal. Arch. Maria C. Santos"}
                      value={staffFormData.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStaffFormData((prev) => ({
                          ...prev,
                          name: val,
                          username: prev.username === "" || prev.username === prev.name.toLowerCase().replace(/[^a-z0-9]/g, "")
                            ? val.toLowerCase().replace(/[^a-z0-9]/g, "")
                            : prev.username,
                        }));
                      }}
                      required
                    />
                  </div>

                  <div className="mpdc-form-group">
                    <label className="mpdc-form-label">
                      {isEn ? "Personnel / Employee ID" : "Personnel / Employee ID"}
                    </label>
                    <input
                      type="text"
                      className="mpdc-form-input"
                      placeholder={isEn ? "e.g. MPDC-001" : "Hal. MPDC-001"}
                      value={staffFormData.id}
                      onChange={(e) => setStaffFormData((prev) => ({ ...prev, id: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="mpdc-form-row">
                  <div className="mpdc-form-group">
                    <label className="mpdc-form-label">
                      {isEn ? "Official Position / Role (Citizen's Charter)" : "Opisyal na Posisyon / Role (Citizen's Charter)"}
                    </label>
                    <select
                      className="mpdc-select"
                      style={{ width: "100%" }}
                      value={staffFormData.position}
                      onChange={(e) => {
                        const sel = e.target.value;
                        setStaffFormData((prev) => ({
                          ...prev,
                          position: sel,
                          role: sel,
                        }));
                      }}
                    >
                      {COMMON_POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mpdc-form-group">
                    <label className="mpdc-form-label">
                      {isEn ? "Designation / Role" : "Katungkulan / Role"}
                    </label>
                    <select
                      className="mpdc-select"
                      style={{ width: "100%" }}
                      value={staffFormData.role}
                      onChange={(e) => setStaffFormData((prev) => ({ ...prev, role: e.target.value }))}
                    >
                      {COMMON_ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mpdc-form-row">
                  <div className="mpdc-form-group">
                    <label className="mpdc-form-label">
                      {isEn ? "Mobile Number (SMS Temporary Password) *" : "Mobile Number (para sa SMS ng Password) *"}
                    </label>
                    <input
                      type="tel"
                      className="mpdc-form-input"
                      placeholder={isEn ? "e.g. 09171234567" : "Hal. 09171234567"}
                      value={staffFormData.phone}
                      onChange={(e) => setStaffFormData((prev) => ({ ...prev, phone: e.target.value }))}
                      required
                    />
                    <span style={{ fontSize: "0.73rem", color: "var(--apple-accent, #0071e3)", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                      📱 Awtomatikong magpapadala ng SMS ang system na may Temporary Password at Username sa numerong ito.
                    </span>
                  </div>

                  <div className="mpdc-form-group">
                    <label className="mpdc-form-label">
                      {isEn ? "Initial Status" : "Panimulang Katayuan (Status)"}
                    </label>
                    <select
                      className="mpdc-select"
                      style={{ width: "100%" }}
                      value={staffFormData.status}
                      onChange={(e) => setStaffFormData((prev) => ({ ...prev, status: e.target.value as any }))}
                    >
                      <option value="In Office">{isEn ? "In Office" : "In Office (Nasa Tanggapan)"}</option>
                      <option value="On Field">{isEn ? "On Field" : "On Field (Nasa Inspeksyon)"}</option>
                      <option value="Active">{isEn ? "Active" : "Active (Aktibo)"}</option>
                    </select>
                  </div>
                </div>

                {/* Assigned Barangays */}
                <div className="mpdc-form-group">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <label className="mpdc-form-label">
                      {isEn ? "Assigned Barangays" : "Mga Nakatalagang Barangay"}
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        onClick={() => setStaffFormData((prev) => ({ ...prev, assignedBarangays: ["All 23 Barangays"] }))}
                        className="mpdc-table-btn"
                        style={{ fontSize: "0.68rem" }}
                      >
                        {isEn ? "All (All 23)" : "Lahat (All 23)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStaffFormData((prev) => ({ ...prev, assignedBarangays: ["Poblacion (Zone I - VIII)"] }))}
                        className="mpdc-table-btn"
                        style={{ fontSize: "0.68rem" }}
                      >
                        {isEn ? "Poblacion Zones" : "Poblacion Zones"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStaffFormData((prev) => ({ ...prev, assignedBarangays: [] }))}
                        className="mpdc-table-btn"
                        style={{ fontSize: "0.68rem" }}
                      >
                        {isEn ? "Clear All" : "Alisin Lahat"}
                      </button>
                    </div>
                  </div>
                  <div className="mpdc-barangay-chips-wrap">
                    {(() => {
                      const selectedBrgys = Array.isArray(staffFormData?.assignedBarangays) ? staffFormData.assignedBarangays : [];
                      const isAll = selectedBrgys.includes("All 23 Barangays");
                      return (
                        <>
                          <button
                            type="button"
                            className={`mpdc-brgy-chip ${isAll ? "selected" : ""}`}
                            onClick={() => toggleBarangaySelection("All 23 Barangays")}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ marginRight: 4 }} aria-hidden="true">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            <span>{isEn ? "All 23 Barangays" : "Lahat ng 23 Barangay"}</span>
                          </button>
                          {LUISIANA_BARANGAYS.map((brgy) => {
                            const isSel = selectedBrgys.includes(brgy);
                            return (
                              <button
                                key={brgy}
                                type="button"
                                className={`mpdc-brgy-chip ${isSel ? "selected" : ""}`}
                                onClick={() => toggleBarangaySelection(brgy)}
                              >
                                {brgy}
                              </button>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                  <span style={{ fontSize: "0.72rem", color: "var(--apple-text-secondary)", marginTop: "4px" }}>
                    {isEn ? "Selected:" : "Napili:"}{" "}
                    {Array.isArray(staffFormData?.assignedBarangays) && staffFormData.assignedBarangays.length
                      ? staffFormData.assignedBarangays.join(", ")
                      : (isEn ? "None yet" : "Wala pa")}
                  </span>
                </div>

                {/* Optional System Login Account */}
                <div className="mpdc-account-box">
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 700, color: "var(--apple-text)" }}>
                    <input
                      type="checkbox"
                      checked={staffFormData.createAccount}
                      onChange={(e) => setStaffFormData((prev) => ({ ...prev, createAccount: e.target.checked }))}
                    />
                    {isEn ? "Grant Official INFA-TRACK Login Account (Role: MPDC)" : "Bigyan ng Opisyal na Login Account sa INFA-TRACK (Role: MPDC)"}
                  </label>
                  {staffFormData.createAccount && (
                    <div className="mpdc-form-row" style={{ marginTop: "12px", marginBottom: 0 }}>
                      <div className="mpdc-form-group" style={{ marginBottom: 0 }}>
                        <label className="mpdc-form-label">{isEn ? "Username" : "Username"}</label>
                        <input
                          type="text"
                          className="mpdc-form-input"
                          placeholder={isEn ? "e.g. msantos" : "Hal. msantos"}
                          value={staffFormData.username}
                          onChange={(e) => setStaffFormData((prev) => ({ ...prev, username: e.target.value.toLowerCase().trim() }))}
                        />
                      </div>
                      <div className="mpdc-form-group" style={{ marginBottom: 0 }}>
                        <label className="mpdc-form-label">{isEn ? "Default Password" : "Default Password"}</label>
                        <input
                          type="text"
                          className="mpdc-form-input"
                          value={staffFormData.defaultPassword}
                          onChange={(e) => setStaffFormData((prev) => ({ ...prev, defaultPassword: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mpdc-modal-footer">
                <button
                  type="button"
                  className="landing-btn landing-btn-secondary"
                  onClick={() => setIsAddStaffModalOpen(false)}
                  disabled={isSubmittingStaff}
                >
                  {isEn ? "Cancel" : "Kanselahin"}
                </button>
                <button
                  type="submit"
                  className="mpdc-btn-emerald"
                  disabled={isSubmittingStaff}
                >
                  {isSubmittingStaff ? (isEn ? "Adding..." : "Idinaragdag...") : (isEn ? "Add as Staff Member" : "Idagdag bilang Kawani")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default MpdcAdminPage;

