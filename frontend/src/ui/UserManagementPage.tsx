import React, { useState, useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import type {
  SessionUser,
  AdminUserRecord,
  NewUserPayload,
  OnlineUserRecord,
  SystemHealthData,
  SystemAlertItem,
} from "../services/auth";
import {
  fetchAdminUsers,
  createAdminUser,
  resetUserToDefault,
  deleteAdminUser,
  toggleAdminUserStatus,
  fetchOnlineUsers,
  fetchSystemHealth,
  simulateSystemError,
  clearSystemErrors,
} from "../services/auth";
import {
  subscribeToAuditLogs,
  AUDIT_RETENTION_MS,
  type AuditEvent,
  type AuditCategory,
} from "../services/firestore-audit";
import { fetchCitizenApplications, backendUrl } from "../lib/api";
import type { UserRole } from "./Landing";
import { ThemeToggle } from "./ThemeToggle";
import { useTranslation } from "../lib/i18n";
import {
  fetchAdminConfig,
  addMasterlistItem,
  updateMasterlistItem,
  toggleMasterlistItem,
  deleteMasterlistItem,
  resetMasterlistCategory,
  toggleMaintenanceMode,
  fetchSlaMonitoring,
  fetchBackupBundle,
  downloadBackupFile,
  DEFAULT_SYSTEM_CONFIG,
} from "../services/systemConfig";
import {
  uploadBackupToFirebase,
  subscribeToCloudBackups,
  deleteCloudBackup,
  type CloudBackupRecord,
} from "../services/firebaseBackup";
import type {
  ConfigItem,
  ConfigItemCategory,
  SystemConfigData,
  MaintenanceModeStatus,
  SlaMonitoringData,
} from "../types";
import "./UserManagementPage.css";

type Props = {
  session: SessionUser | null;
  onLogout: () => void;
  onNavigate: (screen: any) => void;
};

type AdminTab = "overview" | "users" | "rbac" | "audit" | "config";

const DEPARTMENT_ROLE_OPTIONS: Array<{ label: string; role: UserRole; department: string }> = [
  { label: "Tanggapan ng Inhinyero (Infrastructure & Engineering)", role: "Engineer", department: "Infrastructure & Engineering Office" },
  { label: "Tanggapan ng Pagpaplano (MPDC)", role: "MPDC", department: "Municipal Planning & Development Coordinator" },
  { label: "Pangasiwaan ng MPDC (MPDC Administrator)", role: "Super Admin", department: "Municipal Planning & Development Coordinator" },
  { label: "Tanggapan ng Pagsasaka (Agriculture Office)", role: "Agriculture", department: "Municipal Agriculture Office" },
  { label: "Pamahalaang Barangay (Barangay Official)", role: "Barangay Official", department: "Barangay Hall — Luisiana" },
  { label: "Pribadong Inhinyero / Arkitekto (Private Professional)", role: "Private Engineer", department: "Private Professional / Design Engineer" },
  { label: "Pangasiwaan ng Sistema (Super Admin)", role: "Super Admin", department: "Office of the Mayor / ICT Office" },
];

const RBAC_MODULES = [
  { id: "map", label: "3D GIS Mapa & Siting (/app)", desc: "3D Cesium terrain, drone models, at coordinate placement" },
  { id: "hazard", label: "Geohazard Assessment (PEIS/Flood)", desc: "Pagsusuri sa fault line, baha, at landslide risk bago magpatayo" },
  { id: "permits", label: "Zoning & Siting Clearance (/permits)", desc: "MPDC review, CLUP compliance, at permit issuance" },
  { id: "documents", label: "DMS & Blueprint Archival (/documents)", desc: "Opisyal na lagakan ng building blueprints at legal affidavits" },
  { id: "engagement", label: "Citizen Transparency (/engagement)", desc: "Pampublikong konsultasyon at feedback ng mga mamamayan" },
  { id: "admin", label: "Super Admin & User Control (/admin-users)", desc: "Pamamahala sa kawani, security policies, at audit trails" },
];

// RBAC Matrix definitions: which roles have access to which modules
const RBAC_MATRIX: Record<UserRole, string[]> = {
  "Super Admin": ["map", "hazard", "permits", "documents", "engagement", "admin"],
  MPDC: ["map", "hazard", "permits", "documents", "engagement"],
  Engineer: ["map", "hazard", "permits", "documents"],
  Agriculture: ["map", "hazard"],
  "Barangay Official": ["map", "hazard"],
  "Private Engineer": ["map", "hazard", "documents"],
  Viewer: ["map", "hazard"],
};

function formatDisplayIp(ip?: string, deviceType?: string): string {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip === "localhost" || ip.startsWith("127.")) {
    return deviceType === "mobile" || deviceType === "tablet" ? "192.168.93.8" : "192.168.93.2";
  }
  return ip;
}

function formatAlertRelativeTime(isoStr?: string): string {
  if (!isoStr) return "";
  try {
    const ms = Date.now() - new Date(isoStr).getTime();
    if (ms < 10000) return "Kani-kanina lang";
    if (ms < 60000) return `${Math.floor(ms / 1000)}s nakalipas`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m nakalipas`;
    return new Date(isoStr).toLocaleTimeString("tl-PH", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const DISMISSED_ALERTS_STORAGE_KEY = "infatrack_admin_dismissed_alerts_v1";

type DismissedAlertRecord = {
  dismissedAt: number;
  expireAt: number;
  alertTimestamp?: string;
};

function getNextDayMidnight(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function UserManagementPage({ session, onLogout, onNavigate }: Props) {
  // Strict session and role security guard: redirect immediately if unauthenticated
  useEffect(() => {
    if (!session || session.role !== "Super Admin") {
      onLogout();
    }
  }, [session, onLogout]);

  if (!session || session.role !== "Super Admin") {
    return null;
  }

  const { isEn } = useTranslation();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  // User Accounts state
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // System overview intake count
  const [intakeCount, setIntakeCount] = useState<number>(0);

  // Live System Health & Telemetry State
  const [healthData, setHealthData] = useState<SystemHealthData | null>(null);
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);
  const [isSimulatingError, setIsSimulatingError] = useState(false);

  // Audit Logs state
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditCategory, setAuditCategory] = useState<AuditCategory | "">("");

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    employeeId: "",
    username: "",
    roleIdx: 0,
    defaultPassword: "InfaTrack2026",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // System Configuration & Masterlists State
  const [systemConfig, setSystemConfig] = useState<SystemConfigData>(DEFAULT_SYSTEM_CONFIG);
  const [activeConfigCategory, setActiveConfigCategory] = useState<ConfigItemCategory>("barangays");
  const [configSearch, setConfigSearch] = useState("");
  const [isAddConfigModalOpen, setIsAddConfigModalOpen] = useState(false);
  const [addConfigForm, setAddConfigForm] = useState({ name: "", code: "", desc: "", zone: "" });
  const [isEditConfigModalOpen, setIsEditConfigModalOpen] = useState(false);
  const [editingConfigItem, setEditingConfigItem] = useState<ConfigItem | null>(null);
  const [isSubmittingConfig, setIsSubmittingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Disaster Recovery & Cloud Backups State
  const [cloudBackups, setCloudBackups] = useState<CloudBackupRecord[]>([]);
  const [isCloudBackupUploading, setIsCloudBackupUploading] = useState(false);
  const [isBackupMenuOpen, setIsBackupMenuOpen] = useState(false);
  const [backupToast, setBackupToast] = useState<string | null>(null);

  // SLA Turnaround Monitoring State
  const [slaData, setSlaData] = useState<SlaMonitoringData | null>(null);

  // Maintenance Mode State
  const [maintenanceDraft, setMaintenanceDraft] = useState<MaintenanceModeStatus>({
    enabled: false,
    message: "Pansamantalang inaayos ang LUISIANA INFA-TRACK system upang mapabuti ang serbisyo. Mangyaring bumalik mamaya.",
    estimatedDuration: "2 oras",
  });

  // Hand-over modal state
  const [createdSummary, setCreatedSummary] = useState<{
    name: string;
    employeeId: string;
    username: string;
    department: string;
    defaultPassword: string;
  } | null>(null);
  const [hasCopiedHandover, setHasCopiedHandover] = useState(false);

  // Deactivate confirmation state
  const [userToToggleStatus, setUserToToggleStatus] = useState<AdminUserRecord | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Reset confirmation state
  const [userToReset, setUserToReset] = useState<AdminUserRecord | null>(null);
  const [resetting, setResetting] = useState(false);

  // Delete confirmation state
  const [userToDelete, setUserToDelete] = useState<AdminUserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load all users, live presence, system health, config, and SLA
  async function loadData() {
    setLoading(true);
    const [userData, onlineData, applications, health, cfg, sla] = await Promise.all([
      fetchAdminUsers(),
      fetchOnlineUsers(),
      fetchCitizenApplications().catch(() => []),
      fetchSystemHealth(),
      fetchAdminConfig(),
      fetchSlaMonitoring(),
    ]);

    setUsers(userData);
    setOnlineUsers(onlineData);
    setIntakeCount(Array.isArray(applications) ? applications.length : 0);
    setHealthData(health);
    if (cfg) {
      setSystemConfig(cfg);
      if (cfg.maintenance) setMaintenanceDraft(cfg.maintenance);
    }
    if (sla) setSlaData(sla);
    setLoading(false);
  }

  useEffect(() => {
    if (!session || session.role !== "Super Admin") return;
    loadData();

    // Real-time zero-reload online presence and system alerts telemetry connection via Socket.IO
    const socket = io(backendUrl("/"), {
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socket.on("connect", () => {
      socket.emit("admin:online-users:request");
      socket.emit("admin:system-health:request");
    });

    socket.on("admin:online-users:update", (payload: { onlineUsers?: OnlineUserRecord[] }) => {
      if (Array.isArray(payload?.onlineUsers)) {
        setOnlineUsers(payload.onlineUsers);
      }
    });

    socket.on("admin:system-health:update", (health: SystemHealthData) => {
      if (health && Array.isArray(health.alerts)) {
        setHealthData(health);
      }
    });

    // Refresh online users & system health periodically as fallback
    const timer = setInterval(async () => {
      const [live, health] = await Promise.all([
        fetchOnlineUsers(),
        fetchSystemHealth(),
      ]);
      setOnlineUsers(live);
      if (health) setHealthData(health);
    }, 12000);

    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, []);

  // Subscribe to real-time audit logs for Tab 4
  useEffect(() => {
    const unsub = subscribeToAuditLogs(
      (events) => {
        setAuditEvents(events);
        setAuditLoading(false);
      },
      { limitTo: 300 },
      () => {
        setAuditLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // Real-time Cloud Backups subscription
  useEffect(() => {
    const unsub = subscribeToCloudBackups((records) => {
      setCloudBackups(records);
    });
    return () => unsub();
  }, []);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.employeeId.toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q);

      const matchRole = roleFilter === "all" || u.role === roleFilter;

      const isDeactivated = u.isActive === false;
      const isPending = u.mustChangePassword && !isDeactivated;
      const isActive = !u.mustChangePassword && !isDeactivated;

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && isActive) ||
        (statusFilter === "pending" && isPending) ||
        (statusFilter === "deactivated" && isDeactivated);

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Filtered audit events (within rolling 24-hour retention window)
  const filteredAuditEvents = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    const cutoff = Date.now() - AUDIT_RETENTION_MS;
    return auditEvents.filter((e) => {
      const ts = new Date(e.at).getTime();
      if (!isNaN(ts) && ts < cutoff) return false;
      if (auditCategory && e.category !== auditCategory) return false;
      if (!q) return true;
      return (
        e.summary.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.role.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q)
      );
    });
  }, [auditEvents, auditSearch, auditCategory]);

  // KPI Metrics
  const totalUsers = users.length;
  const activeCount = users.filter((u) => u.isActive !== false).length;
  const deactivatedCount = users.filter((u) => u.isActive === false).length;
  const pendingCount = users.filter((u) => u.mustChangePassword && u.isActive !== false).length;
  const onlineCount = onlineUsers.length > 0 ? onlineUsers.length : 1; // At least Super Admin is online

  // Calculate highest alert severity for system status indicator
  const systemStatus = useMemo(() => {
    if (!healthData) return { level: "safe", label: "Operational · All Systems Normal" };
    const alerts = healthData.alerts || [];
    const hasError = alerts.some((a) => a.type === "error");
    if (hasError) {
      const errCount = alerts.filter((a) => a.type === "error").length;
      return { level: "error", label: `Pansin: May ${errCount} Alerto sa System Error / Seguridad` };
    }
    const hasWarn = alerts.some((a) => a.type === "warn");
    if (hasWarn) {
      const warnCount = alerts.filter((a) => a.type === "warn").length;
      return { level: "warn", label: `Babala: ${warnCount} Alerto sa Intake / Discrepancy` };
    }
    return { level: "safe", label: "Operational · Lahat ng Serbisyo ay Normal" };
  }, [healthData]);

  // Interactive alert dismissal state:
  // - Clicking an alert moves it down to the bottom for the rest of today
  // - When the next calendar day arrives (midnight passes), it completely disappears
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, DismissedAlertRecord>>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_ALERTS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  });

  const handleToggleAlert = (alertId: string, currentAlertTimestamp?: string) => {
    setDismissedAlerts((prev) => {
      const next = { ...prev };
      if (next[alertId]) {
        // Toggle back to active top if clicked again
        delete next[alertId];
      } else {
        // Mark as read today, disappears next day
        next[alertId] = {
          dismissedAt: Date.now(),
          expireAt: getNextDayMidnight(),
          alertTimestamp: currentAlertTimestamp || "",
        };
      }
      try {
        localStorage.setItem(DISMISSED_ALERTS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Tab state for alerts: "unread" vs "read"
  const [alertsTab, setAlertsTab] = useState<"unread" | "read">("unread");

  // Filter alerts into Unread and Read collections:
  // - Unread: active alerts that haven't been clicked/read yet
  // - Read: alerts marked as read today (disappear automatically next day)
  const { unreadAlerts, readAlerts } = useMemo(() => {
    if (!healthData?.alerts || !Array.isArray(healthData.alerts)) {
      return { unreadAlerts: [], readAlerts: [] };
    }

    const severityTier = (type: string) => {
      if (type === "error") return 3;
      if (type === "warn") return 2;
      if (type === "info") return 1;
      return 0; // safe
    };

    const sortFn = (a: SystemAlertItem, b: SystemAlertItem) => {
      const tierDiff = severityTier(b.type) - severityTier(a.type);
      if (tierDiff !== 0) return tierDiff;

      const prioDiff = (b.priority || 0) - (a.priority || 0);
      if (prioDiff !== 0) return prioDiff;

      const timeDiff = new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
      return timeDiff;
    };

    const unread: SystemAlertItem[] = [];
    const read: SystemAlertItem[] = [];
    const now = Date.now();

    for (const alert of healthData.alerts) {
      if (alert.type === "safe") continue; // Normal safe states do not clutter the alert list

      const rec = dismissedAlerts[alert.id];
      if (rec) {
        // If next day arrived (local midnight passed), it disappears completely!
        if (now >= rec.expireAt) {
          continue;
        }

        // Check if a brand new event timestamp arrived strictly after dismissal and different from what was read
        const alertTime = alert.timestamp ? new Date(alert.timestamp).getTime() : 0;
        const isBrandNewIncident =
          Boolean(alert.timestamp && rec.alertTimestamp && alert.timestamp !== rec.alertTimestamp && alertTime > rec.dismissedAt);

        if (isBrandNewIncident) {
          unread.push(alert);
          continue;
        }

        // Still today: in Read tab
        read.push(alert);
      } else {
        unread.push(alert);
      }
    }

    unread.sort(sortFn);
    read.sort(sortFn);

    return { unreadAlerts: unread, readAlerts: read };
  }, [healthData?.alerts, dismissedAlerts]);

  const displayedAlerts = alertsTab === "unread" ? unreadAlerts : readAlerts;

  // System Health Handlers
  async function handleRefreshHealth() {
    setIsRefreshingHealth(true);
    const [health, live] = await Promise.all([fetchSystemHealth(), fetchOnlineUsers()]);
    if (health) setHealthData(health);
    setOnlineUsers(live);
    setTimeout(() => setIsRefreshingHealth(false), 500);
  }

  async function handleSimulateTestError() {
    setIsSimulatingError(true);
    await simulateSystemError("Simulated API Error on /api/permits/zoning (Diagnostic Test)");
    const health = await fetchSystemHealth();
    if (health) setHealthData(health);
    setIsSimulatingError(false);
  }

  async function handleClearErrors() {
    await clearSystemErrors();
    const health = await fetchSystemHealth();
    if (health) setHealthData(health);
  }

  // Auto-fill username based on name
  function handleNameChange(name: string) {
    const suggested = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    setAddForm((prev) => ({
      ...prev,
      name,
      username: prev.username === "" || prev.username === prev.name.toLowerCase().replace(/[^a-z0-9]/g, "") ? suggested : prev.username,
    }));
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const sel = DEPARTMENT_ROLE_OPTIONS[addForm.roleIdx];
    if (!sel) return;

    if (!addForm.name.trim()) {
      setFormError("Punan ang Pangalan ng Empleyado.");
      return;
    }
    if (!addForm.username.trim()) {
      setFormError("Punan ang Username.");
      return;
    }
    if (addForm.defaultPassword.length < 8) {
      setFormError("Ang Default Password ay dapat may hindi bababa sa 8 characters.");
      return;
    }

    setIsSubmitting(true);
    const payload: NewUserPayload = {
      name: addForm.name.trim(),
      employeeId: addForm.employeeId.trim() || `EMP-${Date.now().toString().slice(-4)}`,
      username: addForm.username.trim().toLowerCase(),
      role: sel.role,
      department: sel.department,
      defaultPassword: addForm.defaultPassword.trim(),
    };

    const res = await createAdminUser(payload);
    setIsSubmitting(false);

    if (!res.ok) {
      setFormError(res.error || "Nabigong likhain ang account.");
      return;
    }

    // Success! Show handover summary
    setCreatedSummary({
      name: payload.name,
      employeeId: payload.employeeId,
      username: payload.username,
      department: sel.label,
      defaultPassword: payload.defaultPassword || "InfaTrack2026",
    });

    setIsAddModalOpen(false);
    setAddForm({
      name: "",
      employeeId: "",
      username: "",
      roleIdx: 0,
      defaultPassword: "InfaTrack2026",
    });
    loadData();
  }

  // Copy Handover Slip to Clipboard
  function copyHandoverSlip() {
    if (!createdSummary) return;
    const slipText = `=========================================
INFA-TRACK MUNICIPAL ACCOUNT HAND-OVER
Republika ng Pilipinas · Bayan ng Luisiana
=========================================
Pangalan: ${createdSummary.name}
Employee ID: ${createdSummary.employeeId}
Tanggapan: ${createdSummary.department}
Username: ${createdSummary.username}
Pansamantalang Password: ${createdSummary.defaultPassword}
-----------------------------------------
PAALALA SA UNANG PAG-LOGIN:
Sa iyong unang pag-login sa INFA-TRACK, sapilitang
hihingin ng system na magtakda ka ng sarili mong
lihim na password bago makapasok sa iyong dashboard.
=========================================`;

    navigator.clipboard.writeText(slipText);
    setHasCopiedHandover(true);
    setTimeout(() => setHasCopiedHandover(false), 3000);
  }

  // Handle Deactivate / Activate Account
  async function confirmToggleStatus() {
    if (!userToToggleStatus) return;
    const newStatus = userToToggleStatus.isActive === false; // If currently deactivated, activate it
    setTogglingStatus(true);
    const res = await toggleAdminUserStatus(userToToggleStatus.username, newStatus);
    setTogglingStatus(false);

    if (res.ok) {
      setUserToToggleStatus(null);
      loadData();
    } else {
      alert(res.error || "Nabigong baguhin ang status ng account.");
    }
  }

  // Handle Force Password Reset
  async function confirmResetPassword() {
    if (!userToReset) return;
    setResetting(true);
    const res = await resetUserToDefault(userToReset.username, "InfaTrack2026");
    setResetting(false);

    if (res.ok) {
      alert(`Na-reset ang password ni ${userToReset.name || userToReset.username} sa default ('${res.defaultPassword}'). Hihingan siya muli ng password change sa susunod na login.`);
      setUserToReset(null);
      loadData();
    } else {
      alert(res.error || "Nabigong i-reset ang password.");
    }
  }

  // Handle Delete Account
  async function confirmDeleteUser() {
    if (!userToDelete) return;
    setDeleting(true);
    const res = await deleteAdminUser(userToDelete.username);
    setDeleting(false);

    if (res.ok) {
      setUserToDelete(null);
      loadData();
    } else {
      alert(res.error || "Nabigong tanggalin ang account.");
    }
  }

  // Export Audit Logs to CSV
  function exportAuditCsv() {
    const header = ["Timestamp (Kailan)", "Kawani (User)", "Role", "Tanggapan (Department)", "Kategorya", "Aksyon", "Buod (Summary)"];
    const rows = filteredAuditEvents.map((e) => [
      e.at,
      e.username,
      e.role,
      e.department || "",
      e.category,
      e.action,
      (e.summary || "").replace(/"/g, '""'),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `infatrack-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Firebase Cloud Backup & Local Disaster Recovery handlers
  async function handleSaveFirebaseCloudBackup() {
    setIsCloudBackupUploading(true);
    setIsBackupMenuOpen(false);

    // Watchdog timer guarantees the button will NEVER get stuck in loading state
    const watchdog = setTimeout(() => {
      setIsCloudBackupUploading(false);
    }, 1500);

    try {
      const bundleRes = await fetchBackupBundle();
      if (!bundleRes || !bundleRes.bundle) {
        throw new Error("Hindi ma-generate ang backup bundle.");
      }
      const res = await uploadBackupToFirebase(
        bundleRes.bundle,
        bundleRes.sqlDump || "",
        session?.username || "Super Admin"
      );
      if (res.ok && res.record) {
        setCloudBackups((prev) => [res.record!, ...prev.filter((b) => b.id !== res.record!.id)]);
        setBackupToast("Matagumpay na naitala ang Disaster Recovery Backup snapshot sa Firebase Cloud!");
      } else {
        setBackupToast(`Hindi nai-save: ${res.error || "Unknown error"}`);
      }
    } catch (err: any) {
      setBackupToast(`Error sa backup: ${err.message || String(err)}`);
    } finally {
      clearTimeout(watchdog);
      setIsCloudBackupUploading(false);
      setTimeout(() => setBackupToast(null), 5000);
    }
  }

  async function handleDownloadBackup(format: "sql" | "json") {
    setBackupToast(`Inihahanda ang .${format.toUpperCase()} disaster recovery backup file...`);
    try {
      const res = await downloadBackupFile(format);
      if (res.ok) {
        setBackupToast(`Matagumpay na nai-download ang .${format.toUpperCase()} backup (${res.filename || `infatrack.${format}`})!`);
      } else {
        setBackupToast(`Hindi nai-download: ${res.error || "Unknown error"}`);
      }
    } catch (err: any) {
      setBackupToast(`Error sa pag-download: ${err.message || String(err)}`);
    } finally {
      setTimeout(() => setBackupToast(null), 4000);
    }
  }

  async function handleDeleteCloudBackupRecord(id: string) {
    if (!confirm("Sigurado ka bang nais mong tanggalin ang backup snapshot na ito mula sa Firebase Cloud?")) return;
    await deleteCloudBackup(id);
    setCloudBackups((prev) => prev.filter((b) => b.id !== id));
    setBackupToast("Natanggal ang cloud backup snapshot.");
    setTimeout(() => setBackupToast(null), 3000);
  }

  async function handleToggleMaintenance(nextState: boolean) {
    const res = await toggleMaintenanceMode(nextState, maintenanceDraft.message, maintenanceDraft.estimatedDuration);
    if (res && res.ok) {
      setMaintenanceDraft(res.maintenance);
      setBackupToast(
        nextState
          ? "NAKA-ON ang Maintenance Mode (Lockout Active para sa publiko at kawani)."
          : "NAKA-OFF ang Maintenance Mode. Naibalik ang normal na operasyon."
      );
      setTimeout(() => setBackupToast(null), 4000);
    }
  }

  async function handleAddConfigSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addConfigForm.name.trim()) return;
    setIsSubmittingConfig(true);
    setConfigError(null);
    const res = await addMasterlistItem(activeConfigCategory, addConfigForm);
    if (res && res.ok) {
      setIsAddConfigModalOpen(false);
      setAddConfigForm({ name: "", code: "", desc: "", zone: "" });
      const updated = await fetchAdminConfig();
      if (updated) setSystemConfig(updated);
      setBackupToast("Matagumpay na naidagdag ang bagong masterlist item!");
      setTimeout(() => setBackupToast(null), 3000);
    } else {
      setConfigError(res.error === "duplicate_name" ? "Mayroon nang item na may ganitong pangalan." : "Nabigong idagdag ang item.");
    }
    setIsSubmittingConfig(false);
  }

  async function handleEditConfigSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingConfigItem) return;
    setIsSubmittingConfig(true);
    const res = await updateMasterlistItem(activeConfigCategory, editingConfigItem.id, editingConfigItem);
    if (res && res.ok) {
      setIsEditConfigModalOpen(false);
      setEditingConfigItem(null);
      const updated = await fetchAdminConfig();
      if (updated) setSystemConfig(updated);
      setBackupToast("Matagumpay na na-update ang item!");
      setTimeout(() => setBackupToast(null), 3000);
    }
    setIsSubmittingConfig(false);
  }

  async function handleToggleItem(cat: ConfigItemCategory, id: string) {
    await toggleMasterlistItem(cat, id);
    const updated = await fetchAdminConfig();
    if (updated) setSystemConfig(updated);
  }

  async function handleDeleteConfigItem(cat: ConfigItemCategory, id: string) {
    if (!confirm("Sigurado ka bang nais mong tanggalin ang item na ito sa masterlist?")) return;
    await deleteMasterlistItem(cat, id);
    const updated = await fetchAdminConfig();
    if (updated) setSystemConfig(updated);
  }

  async function handleResetCategory(cat: ConfigItemCategory) {
    if (!confirm(`Sigurado ka bang nais mong i-reset ang masterlist ng ${cat} sa opisyal na municipal defaults?`)) return;
    await resetMasterlistCategory(cat);
    const updated = await fetchAdminConfig();
    if (updated) setSystemConfig(updated);
  }

  const currentCategoryItems = useMemo(() => {
    const list = (systemConfig?.masterlists?.[activeConfigCategory] || []) as ConfigItem[];
    if (!configSearch.trim()) return list;
    const q = configSearch.toLowerCase();
    return list.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        (it.code || "").toLowerCase().includes(q) ||
        (it.zone || it.desc || "").toLowerCase().includes(q)
    );
  }, [systemConfig, activeConfigCategory, configSearch]);

  return (
    <div className="ump-container">
      {/* ── Top Header ── */}
      <header className="ump-header-wrap topnav-accent-admin">
        <div className="ump-nav">
          <div className="ump-nav-brand">
            <img src="/logo.png" alt="Luisiana Seal" className="ump-nav-logo" />
            <div className="ump-nav-brand-text">
              <span className="ump-nav-republic">Republika ng Pilipinas · Bayan ng Luisiana</span>
              <div className="ump-nav-title">
                <span className="ump-nav-name">INFA-TRACK Pangasiwaan</span>
                <span className="ump-badge-admin">Super Admin</span>
              </div>
            </div>
          </div>

          <div className="ump-nav-actions">
            {/* Maintenance Mode Toggle Switch in Header */}
            <button
              type="button"
              className={`ump-btn-maint-header ${maintenanceDraft.enabled ? "active" : ""}`}
              onClick={() => handleToggleMaintenance(!maintenanceDraft.enabled)}
              title={
                maintenanceDraft.enabled
                  ? "Naka-ON ang System Maintenance Mode (Lockout Active). I-click upang i-OFF."
                  : "Naka-OFF ang Maintenance Mode. I-click upang mag-maintenance."
              }
            >
              <span className={`ump-maint-dot ${maintenanceDraft.enabled ? "active" : ""}`} />
              <span>{maintenanceDraft.enabled ? "Maintenance: ON" : "Maintenance: OFF"}</span>
            </button>

            {/* 1-Click Backup Dropdown in Header */}
            <div className="ump-backup-dropdown-wrap">
              <button
                type="button"
                className="ump-btn-backup-header"
                onClick={() => setIsBackupMenuOpen(!isBackupMenuOpen)}
                title="1-Click Database Disaster Recovery Backup"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                <span>{isCloudBackupUploading ? "Ikinakarga..." : "1-Click Backup"}</span>
              </button>

              {isBackupMenuOpen && (
                <div className="ump-backup-menu">
                  <button
                    type="button"
                    className="ump-backup-menu-item"
                    onClick={() => {
                      setIsBackupMenuOpen(false);
                      void handleSaveFirebaseCloudBackup();
                    }}
                    disabled={isCloudBackupUploading}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                      <polyline points="12 11 12 17" />
                      <polyline points="9 14 12 11 15 14" />
                    </svg>
                    <span>{isCloudBackupUploading ? "Ikinakarga sa Cloud..." : "I-save sa Firebase Cloud"}</span>
                  </button>
                  <button
                    type="button"
                    className="ump-backup-menu-item"
                    onClick={() => {
                      setIsBackupMenuOpen(false);
                      void handleDownloadBackup("sql");
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>I-download bilang .SQL (Postgres/SQLite)</span>
                  </button>
                  <button
                    type="button"
                    className="ump-backup-menu-item"
                    onClick={() => {
                      setIsBackupMenuOpen(false);
                      void handleDownloadBackup("json");
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>I-download bilang .JSON (Full Bundle)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Navigation to MPDC Portal & 3D Map */}
            {onNavigate && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  className="ump-btn-backup-header"
                  style={{ background: "#151c28", color: "#ffffff", borderColor: "rgba(255,255,255,0.18)" }}
                  onClick={() => onNavigate("mpdc_admin")}
                  title="Buksan ang Tanggapan ng Pagpaplano (MPDC Executive Admin Dashboard)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                  <span>MPDC Dashboard</span>
                </button>
                <button
                  type="button"
                  className="ump-btn-backup-header"
                  style={{ background: "#0a4b78", color: "#ffffff", borderColor: "rgba(255,255,255,0.18)" }}
                  onClick={() => onNavigate("app")}
                  title="Buksan ang 3D GIS Globe Mapa"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                  <span>3D Mapa</span>
                </button>
              </div>
            )}

            <div className="ump-user-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span><strong>{session.name || session.username}</strong></span>
            </div>

            <ThemeToggle iconOnly />

            <button type="button" className="ump-logout-btn" onClick={onLogout} title="Lumabas sa Admin Session">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── 4 Pillars Sub-Navigation Bar ── */}
      <div className="ump-subnav-wrap">
        <div className="ump-subnav">
          <div className="ump-tabs-cluster">
            <button
              type="button"
              className={`ump-tab-button ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" />
                <rect x="14" y="3" width="7" height="5" />
                <rect x="14" y="12" width="7" height="9" />
                <rect x="3" y="16" width="7" height="5" />
              </svg>
              <span>1. Dashboard / System Overview</span>
            </button>

            <button
              type="button"
              className={`ump-tab-button ${activeTab === "users" ? "active" : ""}`}
              onClick={() => setActiveTab("users")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>2. User Management</span>
              <span className="ump-tab-badge">{totalUsers}</span>
            </button>

            <button
              type="button"
              className={`ump-tab-button ${activeTab === "rbac" ? "active" : ""}`}
              onClick={() => setActiveTab("rbac")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>3. Role-Based Access Control (RBAC)</span>
            </button>

            <button
              type="button"
              className={`ump-tab-button ${activeTab === "audit" ? "active" : ""}`}
              onClick={() => setActiveTab("audit")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>4. Audit Trail / Activity Logs</span>
              <span className="ump-tab-badge">{auditEvents.length}</span>
            </button>

            <button
              type="button"
              className={`ump-tab-button ${activeTab === "config" ? "active" : ""}`}
              onClick={() => setActiveTab("config")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>5. Configuration &amp; Backups</span>
            </button>
          </div>

          <div className={`ump-system-status-indicator ${systemStatus.level}`}>
            <span className={`ump-status-dot ${systemStatus.level}`} />
            <span>{systemStatus.label}</span>
          </div>
        </div>
      </div>

      {/* ── Main Body Content ── */}
      <main className="ump-main">
        {/* ========================================================================= */}
        {/* 1. DASHBOARD / SYSTEM OVERVIEW PILLAR                                     */}
        {/* ========================================================================= */}
        {activeTab === "overview" && (
          <>
            {/* KPI Grid */}
            <div className="ump-kpi-grid">
              <div className="ump-kpi-card">
                <div className="ump-kpi-icon green">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div className="ump-kpi-content">
                  <span className="ump-kpi-label">Total Active Users</span>
                  <span className="ump-kpi-val">{activeCount}</span>
                </div>
              </div>

              <div className="ump-kpi-card">
                <div className="ump-kpi-icon indigo">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="ump-kpi-content">
                  <span className="ump-kpi-label">Users Online Now</span>
                  <span className="ump-kpi-val">{onlineCount}</span>
                </div>
              </div>

              <div className="ump-kpi-card">
                <div className="ump-kpi-icon amber">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="ump-kpi-content">
                  <span className="ump-kpi-label">Review Queue Backlog</span>
                  <span className="ump-kpi-val">{healthData?.stats.applicationsPendingReview ?? 0}</span>
                </div>
              </div>

              <div className="ump-kpi-card">
                <div className={`ump-kpi-icon ${systemStatus.level === "error" ? "red" : systemStatus.level === "warn" ? "amber" : "blue"}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div className="ump-kpi-content">
                  <span className="ump-kpi-label">System Health Status</span>
                  <span className="ump-kpi-val" style={{ fontSize: "1.22rem", marginTop: "2px" }}>
                    {systemStatus.level === "safe" ? "100% Stable" : systemStatus.level === "warn" ? "May Babala" : "May Error"}
                  </span>
                </div>
              </div>
            </div>

            {/* Overview 2-Column Section */}
            <div className="ump-overview-grid">
              {/* Left Column: Live Users Online */}
              <div className="ump-card">
                <div className="ump-card-header">
                  <div className="ump-card-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                    <h3>Users Online (Kasalukuyang Naka-login)</h3>
                  </div>
                  <div className="ump-online-header-meta">
                    <span className="ump-card-badge live">● {onlineCount} Aktibong Sesyon</span>
                    <span className="ump-live-sync-indicator" title="Real-time live presence active (walang reload)">
                      <span className="ump-live-sync-dot" />
                      <span>Live Sync</span>
                    </span>
                  </div>
                </div>

                <div className="ump-card-body">
                  <div className="ump-online-list">
                    {/* Current Admin session */}
                    {(() => {
                      const currentUsername = (session.username || "").toLowerCase();
                      const adminOnline = onlineUsers.find(
                        (o) => o.username.toLowerCase() === currentUsername
                      );
                      return (
                        <div className="ump-online-item">
                          <div className="ump-online-person">
                            <span className="ump-online-dot" />
                            <div className="ump-online-info">
                              <div className="ump-online-name-row">
                                <span className="ump-online-name">
                                  {session.name || session.username} (@{session.username})
                                </span>
                                <span className="ump-online-role-pill">Super Admin</span>
                              </div>
                              <span className="ump-online-dept">{session.department || "Office of the Mayor / ICT Office"}</span>

                              <div className="ump-online-meta-row">
                                <span className="ump-online-device-pill" title="Kasalukuyang Ginagamit na Device">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                    <line x1="8" y1="21" x2="16" y2="21" />
                                    <line x1="12" y1="17" x2="12" y2="21" />
                                  </svg>
                                  <span>{adminOnline?.device || "Windows PC (Workstation)"}</span>
                                </span>

                                <span className="ump-online-ip-pill" title={`Network IP: ${formatDisplayIp(adminOnline?.ip, adminOnline?.deviceType)} (LGU Municipal Network)`}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="2" y1="12" x2="22" y2="12" />
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                  </svg>
                                  <code>{formatDisplayIp(adminOnline?.ip, adminOnline?.deviceType)}</code>
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="ump-online-right">
                            <span className="ump-online-time">Kasalukuyang Aktibo (Ikaw)</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Other online staff sessions */}
                    {onlineUsers
                      .filter((o) => o.username.toLowerCase() !== (session.username || "").toLowerCase())
                      .map((ou) => (
                        <div key={ou.username + ou.loggedInAt} className="ump-online-item">
                          <div className="ump-online-person">
                            <span className="ump-online-dot" />
                            <div className="ump-online-info">
                              <div className="ump-online-name-row">
                                <span className="ump-online-name">
                                  {ou.name} (@{ou.username})
                                </span>
                                <span className="ump-online-role-pill">{ou.role}</span>
                              </div>
                              <span className="ump-online-dept">{ou.department}</span>

                              <div className="ump-online-meta-row">
                                <span className="ump-online-device-pill" title={`Device: ${ou.device || "Desktop Workstation"}`}>
                                  {ou.deviceType === "mobile" ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                                      <line x1="12" y1="18" x2="12.01" y2="18" />
                                    </svg>
                                  ) : ou.deviceType === "tablet" ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                                      <line x1="12" y1="18" x2="12.01" y2="18" />
                                    </svg>
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                      <line x1="8" y1="21" x2="16" y2="21" />
                                      <line x1="12" y1="17" x2="12" y2="21" />
                                    </svg>
                                  )}
                                  <span>{ou.device || "Desktop Workstation"}</span>
                                </span>

                                <span className="ump-online-ip-pill" title={`Network IP: ${formatDisplayIp(ou.ip, ou.deviceType)} (LGU Municipal Network)`}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="2" y1="12" x2="22" y2="12" />
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                  </svg>
                                  <code>{formatDisplayIp(ou.ip, ou.deviceType)}</code>
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="ump-online-right">
                            <span className="ump-online-time">
                              Naka-login simula{" "}
                              {new Date(ou.loggedInAt).toLocaleTimeString("tl-PH", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      ))}

                    {onlineUsers.filter((o) => o.username !== session?.username && o.username !== "admin").length === 0 && (
                      <div style={{ padding: "18px", textAlign: "center", color: "var(--apple-text-secondary)", fontSize: "0.86rem" }}>
                        Walang ibang kawani na kasalukuyang naka-login sa system.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: System Alerts & Operational Status */}
              <div className="ump-card">
                <div className="ump-card-header">
                  <div className="ump-card-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <h3>System Alerts &amp; Health</h3>
                  </div>

                  <div className="ump-card-header-actions">
                    <div className="ump-realtime-pill" title="Live WebSocket Telemetry: Awtomatikong nag-a-update nang walang refresh">
                      <span className="ump-realtime-dot"></span>
                      <span className="ump-realtime-label">LIVE SYNC</span>
                    </div>

                    <button
                      type="button"
                      className={`ump-btn-icon-refresh ${isRefreshingHealth ? "spinning" : ""}`}
                      onClick={handleRefreshHealth}
                      title="I-refresh ang live telemetries at alerts"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                      </svg>
                      <span>I-refresh</span>
                    </button>
                  </div>
                </div>

                <div className="ump-card-body">
                  {/* Tabs: Unread & Read */}
                  <div className="ump-alerts-tab-bar">
                    <button
                      type="button"
                      className={`ump-alerts-tab-btn ${alertsTab === "unread" ? "active" : ""}`}
                      onClick={() => setAlertsTab("unread")}
                    >
                      <span>Unread</span>
                      {unreadAlerts.length > 0 && (
                        <span className="ump-alerts-tab-badge unread">{unreadAlerts.length}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`ump-alerts-tab-btn ${alertsTab === "read" ? "active" : ""}`}
                      onClick={() => setAlertsTab("read")}
                    >
                      <span>Read</span>
                      {readAlerts.length > 0 && (
                        <span className="ump-alerts-tab-badge read">{readAlerts.length}</span>
                      )}
                    </button>
                  </div>

                  {/* Dynamic Alert Items rendered accurately from backend telemetry */}
                  <div className="ump-alerts-list">
                    {displayedAlerts && displayedAlerts.length > 0 ? (
                      displayedAlerts.map((alert: SystemAlertItem, idx: number) => {
                        const isRead = alertsTab === "read";
                        const isFirstRow = !isRead && idx === 0;
                        return (
                          <div
                            key={alert.id}
                            className={`ump-alert-card ${alert.type} ${isFirstRow ? "is-first-row" : ""} ${isRead ? "is-read" : ""}`}
                            onClick={() => handleToggleAlert(alert.id, alert.timestamp)}
                            title={isRead ? "I-click upang ibalik sa Unread" : "I-click upang markahang Read"}
                          >
                            <div className="ump-alert-top">
                              <div className="ump-alert-badge-row">
                                <span className={`ump-alert-category-tag ${alert.type}`}>
                                  {alert.category === "system_error"
                                    ? "SYSTEM ERROR"
                                    : alert.category === "intake"
                                    ? "INTAKE VOLUME"
                                    : alert.category === "discrepancy"
                                    ? "DISCREPANCY"
                                    : alert.category === "security"
                                    ? "SECURITY"
                                    : alert.category === "database"
                                    ? "DATABASE"
                                    : "STAFF"}
                                </span>
                                {isFirstRow && (
                                  <span className={`ump-alert-latest-tag ${alert.type}`}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                    </svg>
                                    <span>PINAKABAGO</span>
                                  </span>
                                )}
                              </div>

                              <div className="ump-alert-top-actions">
                                <span className={`ump-alert-metric-pill ${alert.type}`}>{alert.metric}</span>
                                <button
                                  type="button"
                                  className={`ump-alert-toggle-btn ${isRead ? "is-read" : ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleAlert(alert.id, alert.timestamp);
                                  }}
                                  title={isRead ? "I-click upang ibalik sa Unread" : "I-click upang ilipat sa Read section"}
                                >
                                  {isRead ? (
                                    <>
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="1 4 1 10 7 10" />
                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                      </svg>
                                      <span>Ibalik</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      <span>I-markang Read</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            <div className="ump-alert-title-block">
                              <h4 className="ump-alert-title-text">{alert.title}</h4>
                              {alert.timestamp && (
                                <span className="ump-alert-time-pill" title={new Date(alert.timestamp).toLocaleString("tl-PH")}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                  </svg>
                                  <span>{formatAlertRelativeTime(alert.timestamp)}</span>
                                </span>
                              )}
                            </div>

                            <p className="ump-alert-desc">{alert.desc}</p>

                            {/* Render security incident details (Department, Role, IP, Location, Device) */}
                            {alert.securityDetails && alert.securityDetails.length > 0 && (
                              <div className="ump-alert-security-box">
                                {alert.securityDetails.map((sec, sIdx) => (
                                  <div key={sec.username + sIdx} className="ump-sec-item">
                                    <div className="ump-sec-top-row">
                                      <div className="ump-sec-dept-wrap">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                          <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                                          <path d="M9 22v-4h6v4" />
                                          <path d="M8 6h.01" />
                                          <path d="M16 6h.01" />
                                          <path d="M12 6h.01" />
                                          <path d="M12 10h.01" />
                                          <path d="M12 14h.01" />
                                          <path d="M16 10h.01" />
                                          <path d="M16 14h.01" />
                                          <path d="M8 10h.01" />
                                          <path d="M8 14h.01" />
                                        </svg>
                                        <span className="ump-sec-dept-name">{sec.department || "LGU Department"}</span>
                                      </div>
                                      <span className="ump-sec-role-badge">{sec.role || "Staff"}</span>
                                    </div>

                                    <div className="ump-sec-identity-row">
                                      <span className="ump-sec-name-text">
                                        {sec.name || `@${sec.username}`} <span className="ump-sec-user-text">(@{sec.username})</span>
                                      </span>
                                      {sec.failedAttempts !== undefined && (
                                        <span className="ump-sec-attempts-badge">
                                          {sec.lockedUntil ? `${sec.failedAttempts} Failed Attempts (Naka-lock)` : `${sec.failedAttempts} Failed Attempts`}
                                        </span>
                                      )}
                                    </div>

                                    <div className="ump-sec-meta-chips">
                                      <span className="ump-sec-meta-chip ip" title={`Client IP Address: ${formatDisplayIp(sec.ip, "desktop")}`}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                          <circle cx="12" cy="12" r="10" />
                                          <line x1="2" y1="12" x2="22" y2="12" />
                                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                        </svg>
                                        <span>IP:</span>
                                        <code>{formatDisplayIp(sec.ip, "desktop")}</code>
                                      </span>

                                      <span className="ump-sec-meta-chip location" title={`Network Location: ${sec.location || "Munisipyo ng Luisiana (LGU Municipal Network)"}`}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                          <circle cx="12" cy="10" r="3" />
                                        </svg>
                                        <span>{sec.location || "Munisipyo ng Luisiana (LGU Municipal Network)"}</span>
                                      </span>

                                      {sec.device && (
                                        <span className="ump-sec-meta-chip device" title={`Terminal / Device: ${sec.device}`}>
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                            <line x1="8" y1="21" x2="16" y2="21" />
                                            <line x1="12" y1="17" x2="12" y2="21" />
                                          </svg>
                                          <span>{sec.device}</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Render recent runtime error messages if present */}
                            {alert.recentErrors && alert.recentErrors.length > 0 && (
                              <div className="ump-alert-errors-box">
                                <div className="ump-alert-errors-header">Huling Naitalang Runtime Error:</div>
                                {alert.recentErrors.map((err) => (
                                  <div key={err.id} className="ump-alert-err-row">
                                    <code>[{err.source}] {err.message}</code>
                                    <span className="ump-alert-err-time">
                                      {new Date(err.at).toLocaleTimeString("tl-PH")}
                                    </span>
                                  </div>
                                ))}
                                <div className="ump-alert-errors-action">
                                  <button
                                    type="button"
                                    className="ump-btn-clear-errors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleClearErrors();
                                    }}
                                  >
                                    I-clear ang mga Error
                                  </button>
                                </div>
                              </div>
                            )}

                            {alert.actionHint && alert.category !== "security" && (
                              <div className="ump-alert-hint">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="16" x2="12" y2="12" />
                                  <line x1="12" y1="8" x2="12.01" y2="8" />
                                </svg>
                                <span>{alert.actionHint}</span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="ump-alerts-empty safe-state">
                        {alertsTab === "unread" ? (
                          <>
                            <div className="ump-alerts-safe-icon">
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                <polyline points="9 12 11 14 15 10" />
                              </svg>
                            </div>
                            <h4 className="ump-alerts-safe-title">Ligtas at Normal ang Sistema</h4>
                            <p className="ump-alerts-safe-desc">Walang aktibong alerto o babala. Lahat ng serbisyo, database, at seguridad ay nasa normal na antas.</p>
                          </>
                        ) : (
                          <span>Walang nabasang alerto ngayong araw.</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Diagnostic Alert Testing Panel */}
                  <div className="ump-alert-diagnostics">
                    <span className="ump-diagnostics-label">Diagnostic Telemetry Test:</span>
                    <button
                      type="button"
                      className="ump-btn-diag-test"
                      onClick={handleSimulateTestError}
                      disabled={isSimulatingError}
                    >
                      {isSimulatingError ? "Sinusubukan..." : "Subukan ang Error Alert"}
                    </button>
                    {Object.keys(dismissedAlerts).length > 0 && (
                      <button
                        type="button"
                        className="ump-btn-diag-reset"
                        onClick={() => {
                          setDismissedAlerts({});
                          try {
                            localStorage.removeItem(DISMISSED_ALERTS_STORAGE_KEY);
                          } catch {}
                        }}
                      >
                        I-reset ang mga Alert
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── SLA & Turnaround Bottleneck Monitoring Section ── */}
            <div className="ump-sla-section">
              <div className="ump-sla-header-card">
                <div className="ump-sla-header-left">
                  <div className="ump-sla-title-row">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <h3>SLA Turnaround &amp; Bottleneck Monitoring</h3>
                    <span className="ump-sla-compliance-pill">
                      {slaData?.overallComplianceRate ?? 94}% ARTA Compliance
                    </span>
                  </div>
                  <p className="ump-sla-sub">
                    Pagsusuri sa bilis ng serbisyo kada tanggapan alinsunod sa Ease of Doing Business Act (RA 11032).
                  </p>
                </div>

                <div className="ump-sla-header-right">
                  <div className="ump-sla-metric-mini">
                    <span className="ump-sla-mini-val">{slaData?.totalActiveBacklog ?? 0}</span>
                    <span className="ump-sla-mini-lbl">Kabuuang Nakabinbing Aplikasyon</span>
                  </div>
                </div>
              </div>

              {/* Bottleneck Alert Banner if an office is lagging */}
              {slaData?.bottleneck && (
                <div className="ump-bottleneck-alert">
                  <div className="ump-bottleneck-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div className="ump-bottleneck-text">
                    <strong>Pangunahing Bottleneck: {slaData.bottleneck.name} ({slaData.bottleneck.shortName})</strong>
                    <p>{slaData.bottleneck.recommendation}</p>
                  </div>
                  <div className="ump-bottleneck-badge">
                    {slaData.bottleneck.activeQueue} Nakapila
                  </div>
                </div>
              )}

              {/* Department Comparative Bar Chart & Queue Grid */}
              <div className="ump-sla-grid">
                {(slaData?.offices || []).map((office) => {
                  const percentOfTarget = Math.min(100, Math.round((office.avgHours / Math.max(office.targetHours, 1)) * 100));
                  const isOver = office.avgHours > office.targetHours;
                  return (
                    <div key={office.id} className={`ump-sla-card ${office.status}`}>
                      <div className="ump-sla-card-top">
                        <div className="ump-sla-dept-title">
                          <span className="ump-sla-dot" style={{ background: office.color }} />
                          <h4>{office.name}</h4>
                        </div>
                        <span className={`ump-sla-status-tag ${office.status}`}>
                          {office.status === "bottleneck" ? "Bottleneck Alert" : office.status === "warning" ? "May Pila" : "Within SLA"}
                        </span>
                      </div>

                      <div className="ump-sla-numbers-row">
                        <div className="ump-sla-stat">
                          <span className="ump-sla-stat-num">{office.avgHours} oras</span>
                          <span className="ump-sla-stat-desc">Kasalukuyang Average Turnaround ({office.avgDays} araw)</span>
                        </div>
                        <div className="ump-sla-stat target">
                          <span className="ump-sla-stat-num">{office.targetHours} oras</span>
                          <span className="ump-sla-stat-desc">Itinakdang SLA Target</span>
                        </div>
                      </div>

                      {/* Visual Bar Comparison */}
                      <div className="ump-sla-bar-wrap">
                        <div
                          className={`ump-sla-bar-fill ${isOver ? "over" : "good"}`}
                          style={{ width: `${percentOfTarget}%` }}
                        />
                      </div>

                      <div className="ump-sla-footer-meta">
                        <span>Pila: <strong>{office.activeQueue} aplikasyon</strong></span>
                        <span>Lampas sa SLA: <strong style={{ color: office.delayedCount > 0 ? "var(--apple-danger)" : "var(--apple-safe)" }}>{office.delayedCount}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* 2. USER MANAGEMENT PILLAR                                                 */}
        {/* ========================================================================= */}
        {activeTab === "users" && (
          <>
            {/* Toolbar */}
            <div className="ump-toolbar">
              <div className="ump-search-wrap">
                <svg className="ump-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="ump-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Maghanap ng kawani, username, ID, o tanggapan..."
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="ump-search-clear"
                    onClick={() => setSearchQuery("")}
                    title="I-clear ang paghahanap"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="ump-filters">
                <select className="ump-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="all">Lahat ng Role / Tanggapan</option>
                  <option value="Engineer">Engineering Office</option>
                  <option value="MPDC">MPDC Office</option>
                  <option value="Agriculture">Agriculture Office</option>
                  <option value="Barangay Official">Barangay Official</option>
                  <option value="Private Engineer">Private Professional</option>
                  <option value="Super Admin">Super Admin</option>
                </select>

                <select className="ump-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">Lahat ng Status</option>
                  <option value="active">Aktibo</option>
                  <option value="pending">Pending First-Time Reset</option>
                  <option value="deactivated">Naka-deactivate (Resigned/Inactive)</option>
                </select>

                <span className="ump-count-badge">
                  {filteredUsers.length} sa {totalUsers}
                </span>
              </div>

              <button type="button" className="ump-btn-add" onClick={() => setIsAddModalOpen(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>+ Magdagdag ng Empleyado</span>
              </button>
            </div>

            {/* Table Card */}
            <div className="ump-table-card">
              <div className="ump-table-wrap">
                <table className="ump-table">
                  <thead>
                    <tr>
                      <th>Empleyado</th>
                      <th>Username</th>
                      <th>Tanggapan / Role</th>
                      <th>Status ng Account</th>
                      <th>Huling Login</th>
                      <th style={{ textAlign: "right" }}>Mga Aksyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "var(--apple-text-secondary)" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
                            <div className="ump-status-dot" style={{ background: "var(--apple-accent)" }} />
                            <span>Ikinakarga ang listahan ng mga kawani...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "var(--apple-text-secondary)" }}>
                          Walang natagpuang empleyado batay sa iyong filter.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const isDeactivated = u.isActive === false;
                        const initials =
                          u.name
                            .split(" ")
                            .map((p) => p[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2) || u.username.slice(0, 2).toUpperCase();

                        const avatarClass =
                          u.role === "Super Admin"
                            ? "admin"
                            : u.role === "Engineer"
                            ? "engineer"
                            : "";

                        const formattedLastLogin = u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString("tl-PH", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Hindi pa nakapag-login";

                        return (
                          <tr key={u.username} className={isDeactivated ? "deactivated-row" : ""}>
                            <td>
                              <div className="ump-user-cell">
                                <div className={`ump-avatar ${avatarClass}`}>{initials}</div>
                                <div className="ump-user-info">
                                  <span className="ump-user-name">{u.name}</span>
                                  <span className="ump-emp-id">ID: {u.employeeId || "—"}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="ump-username">@{u.username}</span>
                            </td>
                            <td>
                              <div>
                                <span className="ump-role-pill">{u.role}</span>
                                <div className="ump-dept-text">{u.department}</div>
                              </div>
                            </td>
                            <td>
                              {isDeactivated ? (
                                <span className="ump-status-pill-deactivated" title="Naka-deactivate ang account. Hindi makakapag-login ngunit napanatili ang pangalan sa nakaraang mga permit.">
                                  <span className="ump-status-dot-mini deact" />
                                  <span>Naka-deactivate</span>
                                </span>
                              ) : u.mustChangePassword ? (
                                <span className="ump-status-pill-pending" title="Kailangan magpalit ng password sa susunod na login">
                                  <span className="ump-status-dot-mini pending" />
                                  <span>Pending First-Time Reset</span>
                                </span>
                              ) : (
                                <span className="ump-status-pill-active" title="Aktibo at naitakda na ang sariling password">
                                  <span className="ump-status-dot-mini active" />
                                  <span>Aktibo</span>
                                </span>
                              )}
                            </td>
                            <td>
                              <span style={{ fontSize: "0.82rem", color: u.lastLoginAt ? "var(--apple-text)" : "var(--apple-text-tertiary)" }}>
                                {formattedLastLogin}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div className="ump-actions-cell" style={{ justifyContent: "flex-end" }}>
                                {/* Deactivate / Activate Toggle */}
                                {u.username !== "admin" && u.username !== session?.username && (
                                  <button
                                    type="button"
                                    className={`ump-btn-action ${isDeactivated ? "activate" : "deactivate"}`}
                                    onClick={() => setUserToToggleStatus(u)}
                                    title={
                                      isDeactivated
                                        ? "I-activate muli ang account"
                                        : "I-deactivate ang account (mapapanatili ang pangalan sa mga nakaraang permit)"
                                    }
                                  >
                                    {isDeactivated ? (
                                      <>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                        <span>I-activate</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                        <span>I-deactivate</span>
                                      </>
                                    )}
                                  </button>
                                )}

                                {/* Force Password Reset */}
                                <button
                                  type="button"
                                  className="ump-btn-action"
                                  onClick={() => setUserToReset(u)}
                                  title="I-reset ang password pabalik sa default ('InfaTrack2026') at i-require ang forced password change"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                  </svg>
                                  <span>Force Reset</span>
                                </button>

                                {/* Delete Account */}
                                {u.username !== "admin" && u.username !== session?.username && (
                                  <button
                                    type="button"
                                    className="ump-btn-action danger"
                                    onClick={() => setUserToDelete(u)}
                                    title="Tanggalin nang permanente ang account"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* 3. ROLE-BASED ACCESS CONTROL (RBAC) PILLAR                                */}
        {/* ========================================================================= */}
        {activeTab === "rbac" && (
          <>
            {/* Visual Permission Matrix Card */}
            <div className="ump-rbac-card">
              <div className="ump-table-wrap">
                <table className="ump-table ump-rbac-table">
                  <thead>
                    <tr>
                      <th className="role-col">Tanggapan / Role</th>
                      {RBAC_MODULES.map((m) => (
                        <th key={m.id} title={m.desc}>
                          {m.label.split(" (")[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DEPARTMENT_ROLE_OPTIONS.map((dept) => {
                      const allowedModules = new Set(RBAC_MATRIX[dept.role] || []);

                      return (
                        <tr key={dept.role + dept.department}>
                          <td className="role-name">
                            <div>
                              <span>{dept.label}</span>
                              <div style={{ fontSize: "0.72rem", color: "var(--apple-text-secondary)", fontWeight: 400 }}>
                                Role: {dept.role}
                              </div>
                            </div>
                          </td>
                          {RBAC_MODULES.map((m) => {
                            const isAllowed = allowedModules.has(m.id);
                            return (
                              <td key={m.id}>
                                {isAllowed ? (
                                  <span className="ump-perm-check" title={`Pinapayagan ang ${dept.role} sa ${m.label}`}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  </span>
                                ) : (
                                  <span className="ump-perm-none" title="Walang access">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RBAC Explanatory Scope Cards */}
            <div className="ump-rbac-info-grid">
              

              <div className="ump-rbac-info-card">
                <h4>
                  <div className="ump-card-title-icon-box" style={{ width: "26px", height: "26px", borderRadius: "6px", background: "rgba(245, 158, 11, 0.12)", color: "#b45309" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <span>Inhinyero &amp; MPDC (Engineering &amp; Zoning)</span>
                </h4>
                <p>
                  Nangangasiwa sa <strong>3D GIS Map Pinning</strong>, Geotechnical Hazard constraints (PEIS/Flood), Site Inspections, at CLUP Zoning Clearances bago makarating sa assessment.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* 4. AUDIT TRAIL / ACTIVITY LOGS PILLAR                                     */}
        {/* ========================================================================= */}
        {activeTab === "audit" && (
          <>
            {/* 24h Retention Notice */}
            <div className="ump-retention-banner">
              <span className="ump-retention-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                24-Oras na Retention
              </span>
              <span className="ump-retention-text">
                Awtomatikong binubura ang audit logs pagkatapos ng 24 oras para sa seguridad at pagsunod sa privacy.
              </span>
            </div>

            {/* Audit Toolbar */}
            <div className="ump-toolbar">
              <div className="ump-search-wrap">
                <svg className="ump-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="ump-search-input"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Maghanap sa audit log (hal. 'Juan Dela Cruz', 'password', 'LUIS-2026')..."
                />
                {auditSearch && (
                  <button type="button" className="ump-search-clear" onClick={() => setAuditSearch("")} title="I-clear ang paghahanap">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="ump-audit-category-pills">
                <button
                  type="button"
                  className={`ump-audit-pill ${auditCategory === "" ? "active" : ""}`}
                  onClick={() => setAuditCategory("")}
                >
                  Lahat
                </button>
                <button
                  type="button"
                  className={`ump-audit-pill ${auditCategory === "auth" ? "active" : ""}`}
                  onClick={() => setAuditCategory("auth")}
                >
                  Sign-in &amp; Sessions
                </button>
                <button
                  type="button"
                  className={`ump-audit-pill ${auditCategory === "system" ? "active" : ""}`}
                  onClick={() => setAuditCategory("system")}
                >
                  Security &amp; Admin
                </button>
                <button
                  type="button"
                  className={`ump-audit-pill ${auditCategory === "document" ? "active" : ""}`}
                  onClick={() => setAuditCategory("document")}
                >
                  Permit Documents
                </button>
                <button
                  type="button"
                  className={`ump-audit-pill ${auditCategory === "planning" ? "active" : ""}`}
                  onClick={() => setAuditCategory("planning")}
                >
                  Proyekto &amp; Siting
                </button>
              </div>

              <button type="button" className="ump-btn-export" onClick={exportAuditCsv}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>I-export sa CSV (Excel)</span>
              </button>
            </div>

            {/* Audit Log Table Card */}
            <div className="ump-table-card">
              <div className="ump-table-wrap">
                <table className="ump-table">
                  <thead>
                    <tr>
                      <th style={{ width: "190px" }}>Kailan (Timestamp)</th>
                      <th>Kawani (User)</th>
                      <th>Tanggapan / Role</th>
                      <th>Kategorya</th>
                      <th>Aksyon</th>
                      <th>Buod ng Gawain (Summary)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLoading ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "var(--apple-text-secondary)" }}>
                          Ikinakarga ang real-time audit logs...
                        </td>
                      </tr>
                    ) : filteredAuditEvents.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "var(--apple-text-secondary)" }}>
                          Walang natagpuang audit events sa nakalipas na 24 oras batay sa iyong filter.
                        </td>
                      </tr>
                    ) : (
                      filteredAuditEvents.map((e) => {
                        const formattedDate = e.at
                          ? new Date(e.at).toLocaleString("tl-PH", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                          : "—";

                        return (
                          <tr key={e.id}>
                            <td style={{ fontSize: "0.8rem", color: "var(--apple-text-secondary)", whiteSpace: "nowrap" }}>
                              {formattedDate}
                            </td>
                            <td>
                              <span style={{ fontWeight: 600, color: "var(--apple-text)" }}>
                                @{e.username}
                              </span>
                            </td>
                            <td>
                              <div>
                                <span className="ump-role-pill">{e.role}</span>
                                {e.department && <div className="ump-dept-text">{e.department}</div>}
                              </div>
                            </td>
                            <td>
                              <span className={`ump-badge-category ${e.category || "system"}`}>
                                {e.category}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontFamily: "monospace", fontSize: "0.78rem", background: "var(--apple-surface-secondary)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--apple-border)" }}>
                                {e.action}
                              </span>
                            </td>
                            <td>
                              <span style={{ color: "var(--apple-text)", fontSize: "0.85rem", lineHeight: 1.4 }}>
                                {e.summary}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* 5. SYSTEM CONFIGURATION, MASTERLISTS & DISASTER RECOVERY BACKUP           */}
        {/* ========================================================================= */}
        {activeTab === "config" && (
          <div className="ump-config-container">
            {/* ── Sub-panel A: 1-Click Database Disaster Recovery Backup Center ── */}
            <div className="ump-card ump-backup-card">
              <div className="ump-card-header">
                <div className="ump-card-title">
                  <div className="ump-card-title-icon-box primary">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                  </div>
                  <div>
                    <h3>1-Click Database Backup &amp; Firebase Cloud Disaster Recovery</h3>
                    <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--apple-text-secondary)" }}>
                      Kagyat na pag-backup ng lahat ng permit applications, proyekto, kawani, at masterlists para sa Data Disaster Recovery compliance.
                    </p>
                  </div>
                </div>

                <div className="ump-backup-actions-cluster">
                  <button
                    type="button"
                    className="ump-btn-cloud-backup"
                    onClick={handleSaveFirebaseCloudBackup}
                    disabled={isCloudBackupUploading}
                    title="Gumawa ng bagong disaster recovery snapshot sa Firebase Cloud"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                      <polyline points="12 11 12 17" />
                      <polyline points="9 14 12 11 15 14" />
                    </svg>
                    <span>{isCloudBackupUploading ? "Ikinakarga sa Cloud..." : "I-save sa Firebase Cloud"}</span>
                  </button>

                  <button
                    type="button"
                    className="ump-btn-download-sql"
                    onClick={() => void handleDownloadBackup("sql")}
                    title="I-download ang buong SQL schema at data para sa lokal na backup"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>I-download .SQL</span>
                  </button>

                  <button
                    type="button"
                    className="ump-btn-download-json"
                    onClick={() => void handleDownloadBackup("json")}
                    title="I-download ang buong JSON database bundle"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>I-download .JSON</span>
                  </button>
                </div>
              </div>

              {backupToast && (
                <div className="ump-backup-toast">
                  <span>{backupToast}</span>
                  <button type="button" onClick={() => setBackupToast(null)} aria-label="Isara">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Cloud Backup History Table */}
              <div className="ump-table-wrap" style={{ borderTop: "1px solid var(--apple-border)" }}>
                <div className="ump-cloud-header-meta">
                  <div className="ump-cloud-header-left">
                    <span className="ump-cloud-header-title">Talaan ng mga Cloud Backup sa Firebase Storage</span>
                    <span className="ump-cloud-header-count">({cloudBackups.length})</span>
                  </div>
                  <span className="ump-cloud-sync-pill">
                    <span className="ump-cloud-sync-dot" />
                    <span>Naka-sync sa Firebase Storage &amp; Firestore</span>
                  </span>
                </div>

                <table className="ump-table">
                  <thead>
                    <tr>
                      <th>Petsa ng Backup</th>
                      <th>Gumawa</th>
                      <th>Laki ng File</th>
                      <th>SHA-256 Checksum</th>
                      <th>Katayuan</th>
                      <th>Nilalamang Rekord</th>
                      <th style={{ textAlign: "right" }}>Aksyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cloudBackups.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: "0" }}>
                          <div className="ump-cloud-empty-state">
                            <div className="ump-cloud-empty-icon">
                              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                                <line x1="12" y1="11" x2="12" y2="17" />
                                <polyline points="9 14 12 11 15 14" />
                              </svg>
                            </div>
                            <div className="ump-cloud-empty-title">Wala pang naitalang Cloud Backup snapshot</div>
                            <div className="ump-cloud-empty-desc">
                              I-click ang button sa ibaba upang kumuha ng unang snapshot ng buong database na may SHA-256 integrity checksum at i-save sa Firebase Cloud.
                            </div>
                            <button
                              type="button"
                              className="ump-btn-cloud-backup"
                              style={{ marginTop: "16px" }}
                              onClick={handleSaveFirebaseCloudBackup}
                              disabled={isCloudBackupUploading}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                                <polyline points="12 11 12 17" />
                                <polyline points="9 14 12 11 15 14" />
                              </svg>
                              <span>{isCloudBackupUploading ? "Ikinakarga sa Cloud..." : "Mag-save ng Unang Cloud Snapshot"}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      cloudBackups.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <strong>{new Date(b.createdAt).toLocaleDateString("tl-PH", { month: "short", day: "numeric", year: "numeric" })}</strong>
                            <div style={{ fontSize: "0.74rem", color: "var(--apple-text-secondary)" }}>
                              {new Date(b.createdAt).toLocaleTimeString("tl-PH")}
                            </div>
                          </td>
                          <td>
                            <span className="ump-badge-admin" style={{ fontSize: "0.72rem" }}>@{b.createdBy}</span>
                          </td>
                          <td>
                            <code>{Math.round(b.fileSizeJson / 1024)} KB</code>
                          </td>
                          <td>
                            <code style={{ fontSize: "0.72rem" }} title={b.checksumSha256}>
                              {b.checksumSha256.slice(0, 14)}...
                            </code>
                          </td>
                          <td>
                            <span className="ump-status-cloud">
                              <span className="ump-status-cloud-dot" />
                              <span>Naka-save sa Cloud</span>
                            </span>
                          </td>
                          <td style={{ fontSize: "0.78rem", color: "var(--apple-text-secondary)" }}>
                            {b.summary?.totalApplications ?? 0} Apps · {b.summary?.totalProjects ?? 0} Proj · {b.summary?.totalAccounts ?? 0} Users
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div className="ump-actions-cell" style={{ justifyContent: "flex-end" }}>
                              {b.storageUrlSql ? (
                                <a
                                  href={b.storageUrlSql}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="ump-btn-download-pill"
                                  title="I-download ang .SQL mula sa Firebase"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  <span>.SQL</span>
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  className="ump-btn-download-pill"
                                  onClick={() => void handleDownloadBackup("sql")}
                                  title="I-download ang .SQL snapshot"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  <span>.SQL</span>
                                </button>
                              )}
                              {b.storageUrlJson ? (
                                <a
                                  href={b.storageUrlJson}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="ump-btn-download-pill"
                                  title="I-download ang .JSON mula sa Firebase"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  <span>.JSON</span>
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  className="ump-btn-download-pill"
                                  onClick={() => void handleDownloadBackup("json")}
                                  title="I-download ang .JSON snapshot"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  <span>.JSON</span>
                                </button>
                              )}
                              <button
                                type="button"
                                className="ump-btn-action danger"
                                onClick={() => handleDeleteCloudBackupRecord(b.id)}
                                title="Tanggalin ang backup snapshot na ito"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
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

            {/* ── Sub-panel B: Dynamic Masterlists & Dropdowns Management ── */}
            <div className="ump-card" style={{ marginBottom: "24px" }}>
              <div className="ump-card-header">
                <div className="ump-card-title">
                  <div className="ump-card-title-icon-box success">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                  </div>
                  <div>
                    <h3>Pamamahala ng mga Dropdown &amp; Masterlists</h3>
                    <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--apple-text-secondary)" }}>
                      I-configure ang listahan ng mga Barangay, Uri ng Gusali, Zoning, at Permit nang hindi binabago ang source code.
                    </p>
                  </div>
                </div>

                <div className="ump-config-top-actions">
                  <button
                    type="button"
                    className="ump-btn-add"
                    onClick={() => {
                      setAddConfigForm({ name: "", code: "", desc: "", zone: "" });
                      setIsAddConfigModalOpen(true);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Magdagdag ng Item</span>
                  </button>
                  <button
                    type="button"
                    className="ump-btn-ghost-action"
                    onClick={() => handleResetCategory(activeConfigCategory)}
                    title="Ibalik sa orihinal na Luisiana municipal defaults"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                      <path d="M21 3v5h-5" />
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                      <path d="M3 21v-5h5" />
                    </svg>
                    <span>I-reset sa Defaults</span>
                  </button>
                </div>
              </div>

              {/* Masterlist Category Segmented Controls */}
              <div className="ump-config-controls-row">
                <div className="ump-config-segmented-track">
                  <button
                    type="button"
                    className={`ump-config-segmented-btn ${activeConfigCategory === "barangays" ? "active" : ""}`}
                    onClick={() => setActiveConfigCategory("barangays")}
                  >
                    <span>Barangay Masterlist</span>
                    <span className="ump-config-pill-count">{systemConfig?.masterlists?.barangays?.length ?? 23}</span>
                  </button>
                  <button
                    type="button"
                    className={`ump-config-segmented-btn ${activeConfigCategory === "buildingTypes" ? "active" : ""}`}
                    onClick={() => setActiveConfigCategory("buildingTypes")}
                  >
                    <span>Uri ng Gusali / Building Types</span>
                    <span className="ump-config-pill-count">{systemConfig?.masterlists?.buildingTypes?.length ?? 7}</span>
                  </button>
                  <button
                    type="button"
                    className={`ump-config-segmented-btn ${activeConfigCategory === "zoningClassifications" ? "active" : ""}`}
                    onClick={() => setActiveConfigCategory("zoningClassifications")}
                  >
                    <span>Zoning Classifications</span>
                    <span className="ump-config-pill-count">{systemConfig?.masterlists?.zoningClassifications?.length ?? 4}</span>
                  </button>
                  <button
                    type="button"
                    className={`ump-config-segmented-btn ${activeConfigCategory === "permitCategories" ? "active" : ""}`}
                    onClick={() => setActiveConfigCategory("permitCategories")}
                  >
                    <span>Uri ng Permit / Clearance</span>
                    <span className="ump-config-pill-count">{systemConfig?.masterlists?.permitCategories?.length ?? 4}</span>
                  </button>
                </div>

                <div className="ump-config-search-box">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    className="ump-config-search-input"
                    placeholder="Maghanap sa masterlist..."
                    value={configSearch}
                    onChange={(e) => setConfigSearch(e.target.value)}
                  />
                  {configSearch && (
                    <button type="button" className="ump-config-search-clear" onClick={() => setConfigSearch("")} title="I-clear ang paghahanap">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Masterlist Items Table */}
              <div className="ump-table-wrap">
                <table className="ump-table">
                  <thead>
                    <tr>
                      <th style={{ width: "150px" }}>Code / Identifier</th>
                      <th>Pangalan (Display Name)</th>
                      <th>Detalye / Kategorya</th>
                      <th style={{ width: "220px" }}>Katayuan sa Dropdown</th>
                      <th style={{ textAlign: "right", width: "160px" }}>Aksyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentCategoryItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: "2.5rem", color: "var(--apple-text-secondary)" }}>
                          Walang nahanap na item sa masterlist para sa kategoryang ito.
                        </td>
                      </tr>
                    ) : (
                      currentCategoryItems.map((item) => (
                        <tr key={item.id} className={!item.active ? "deactivated-row" : ""}>
                          <td>
                            <code className="ump-code-chip">{item.code || item.id}</code>
                          </td>
                          <td>
                            <strong style={{ color: "var(--apple-text)" }}>{item.name}</strong>
                            {item.isDefault && (
                              <span className="ump-official-badge">
                                Official
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: "0.82rem", color: "var(--apple-text-secondary)" }}>
                            {item.zone || item.desc || "—"}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`ump-badge-toggle ${item.active ? "active" : "inactive"}`}
                              onClick={() => handleToggleItem(activeConfigCategory, item.id)}
                              title="I-click upang i-toggle ang availability sa mga dropdown"
                            >
                              <span className={`ump-toggle-dot ${item.active ? "active" : "inactive"}`} />
                              <span>{item.active ? "Aktibo sa Dropdown" : "Naka-deactivate"}</span>
                            </button>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div className="ump-actions-cell" style={{ justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                className="ump-btn-action"
                                onClick={() => {
                                  setEditingConfigItem(item);
                                  setIsEditConfigModalOpen(true);
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                <span>I-edit</span>
                              </button>
                              {!item.isDefault && (
                                <button
                                  type="button"
                                  className="ump-btn-action danger"
                                  onClick={() => handleDeleteConfigItem(activeConfigCategory, item.id)}
                                  title="Tanggalin ang custom na item na ito"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                  <span>Tanggalin</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Sub-panel C: System Maintenance Mode Controls ── */}
            <div className="ump-card ump-maint-card">
              <div className="ump-card-header">
                <div className="ump-card-title">
                  <div className="ump-card-title-icon-box warning">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                  </div>
                  <div>
                    <h3>System Maintenance Mode &amp; Lockout Controls</h3>
                    <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--apple-text-secondary)" }}>
                      Kapag naka-ON, tanging mga Super Admin lamang ang makakapasok sa system habang nag-a-update o nag-aayos ng database.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className={`ump-btn-maint-toggle ${maintenanceDraft.enabled ? "is-active" : ""}`}
                  onClick={() => handleToggleMaintenance(!maintenanceDraft.enabled)}
                >
                  <span className={`ump-maint-switch-dot ${maintenanceDraft.enabled ? "active" : ""}`} />
                  <span>{maintenanceDraft.enabled ? "Lockout Aktibo (ON)" : "Normal na Operasyon (OFF)"}</span>
                </button>
              </div>

              <div className="ump-card-body ump-maint-body">
                <div className="ump-maint-form-grid">
                  <div className="ump-maint-field full-width">
                    <label className="ump-modal-label">Advisory Message para sa Publiko at Kawani</label>
                    <textarea
                      className="ump-maint-textarea"
                      rows={2}
                      value={maintenanceDraft.message}
                      onChange={(e) => setMaintenanceDraft((prev) => ({ ...prev, message: e.target.value }))}
                      placeholder="Pansamantalang inaayos ang LUISIANA INFA-TRACK system upang mapabuti ang serbisyo. Mangyaring bumalik mamaya."
                    />
                    <div className="ump-field-hint">
                      Lalabas ang mensaheng ito sa lock screen ng lahat ng mamamayan at empleyado.
                    </div>
                  </div>

                  <div className="ump-maint-field">
                    <label className="ump-modal-label">Inaasahang Tagal (Estimated Duration)</label>
                    <input
                      type="text"
                      className="ump-maint-input"
                      value={maintenanceDraft.estimatedDuration}
                      onChange={(e) => setMaintenanceDraft((prev) => ({ ...prev, estimatedDuration: e.target.value }))}
                      placeholder="hal. 2 oras, 30 minuto"
                    />
                  </div>

                  <div className="ump-maint-field">
                    <label className="ump-modal-label">Saklaw ng Lockout</label>
                    <div className="ump-maint-scope-box">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span>Mamamayan, Bisita, at Kawani (Bypass para sa Super Admin)</span>
                    </div>
                  </div>
                </div>

                <div className="ump-maint-footer-bar">
                  <div className="ump-maint-meta-note">
                    {maintenanceDraft.updatedAt ? (
                      <span>Huling na-update: {new Date(maintenanceDraft.updatedAt).toLocaleString("tl-PH")}</span>
                    ) : (
                      <span>Kasalukuyang naka-configure</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ump-btn-save-advisory"
                    onClick={async () => {
                      await toggleMaintenanceMode(maintenanceDraft.enabled, maintenanceDraft.message, maintenanceDraft.estimatedDuration);
                      setBackupToast("Matagumpay na na-update ang Maintenance Advisory!");
                      setTimeout(() => setBackupToast(null), 3000);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    <span>I-save ang Advisory</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Modal: Magdagdag ng Empleyado ── */}
      {isAddModalOpen && (
        <div className="ump-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ump-modal-card">
            <div className="ump-modal-header">
              <div className="ump-modal-title">
                <h3>{isEn ? "+ Add New Employee" : "+ Magdagdag ng Bagong Empleyado"}</h3>
                <p>{isEn ? "Create official account using Default Password + Forced Reset flow." : "Lumikha ng opisyal na account gamit ang “Default Password + Forced Reset” flow."}</p>
              </div>
              <button type="button" className="ump-modal-close" onClick={() => setIsAddModalOpen(false)} aria-label={isEn ? "Close modal" : "Isara ang modal"}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div className="ump-modal-body">
                {formError && (
                  <div
                    style={{
                      padding: "10px 14px",
                      background: "var(--apple-danger-bg)",
                      border: "1px solid rgba(220, 38, 38, 0.25)",
                      borderRadius: "var(--apple-radius-sm)",
                      color: "var(--apple-danger)",
                      fontSize: "0.84rem",
                      fontWeight: 500,
                    }}
                  >
                    {formError}
                  </div>
                )}

                {/* Full Name */}
                <div className="ump-modal-field">
                  <label className="ump-modal-label">{isEn ? "Employee Full Name" : "Pangalan ng Empleyado (Buong Pangalan)"}</label>
                  <input
                    type="text"
                    className="ump-modal-input"
                    value={addForm.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder={isEn ? "e.g. Juan Dela Cruz" : "hal. Juan Dela Cruz"}
                    required
                    autoFocus
                  />
                </div>

                {/* Employee ID */}
                <div className="ump-modal-field">
                  <label className="ump-modal-label">{isEn ? "Employee ID" : "Employee ID"}</label>
                  <input
                    type="text"
                    className="ump-modal-input"
                    value={addForm.employeeId}
                    onChange={(e) => setAddForm({ ...addForm, employeeId: e.target.value })}
                    placeholder={isEn ? "e.g. 2026-001" : "hal. 2026-001"}
                  />
                </div>

                {/* Username */}
                <div className="ump-modal-field">
                  <label className="ump-modal-label">{isEn ? "System Username" : "System Username"}</label>
                  <input
                    type="text"
                    className="ump-modal-input"
                    value={addForm.username}
                    onChange={(e) => setAddForm({ ...addForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, "") })}
                    placeholder={isEn ? "e.g. juandelacruz" : "hal. juandelacruz"}
                    required
                  />
                  <span className="ump-modal-hint">{isEn ? "Staff will use this username to sign in to INFA-TRACK." : "Ito ang gagamitin ng kawani para mag-login sa INFA-TRACK."}</span>
                </div>

                {/* Department & Role Dropdown */}
                <div className="ump-modal-field">
                  <label className="ump-modal-label">{isEn ? "Department & Role" : "Tanggapan at Role (Department)"}</label>
                  <select
                    className="ump-select"
                    style={{ width: "100%", height: "42px", borderRadius: "var(--apple-radius-md)" }}
                    value={addForm.roleIdx}
                    onChange={(e) => setAddForm({ ...addForm, roleIdx: Number(e.target.value) })}
                  >
                    {DEPARTMENT_ROLE_OPTIONS.map((opt, idx) => (
                      <option key={opt.role + opt.department} value={idx}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Default Password */}
                <div className="ump-modal-field">
                  <label className="ump-modal-label">{isEn ? "Default / Temporary Password" : "Default / Pansamantalang Password"}</label>
                  <input
                    type="text"
                    className="ump-modal-input"
                    value={addForm.defaultPassword}
                    onChange={(e) => setAddForm({ ...addForm, defaultPassword: e.target.value })}
                    required
                  />
                  <span className="ump-modal-hint" style={{ color: "var(--apple-warn)", display: "flex", alignItems: "flex-start", gap: "6px", marginTop: "4px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ marginTop: "2px", flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{isEn ? "Temporary password: On first login, the system will enforce setting a private secret password before granting dashboard access." : "Pansamantalang password: Sa unang pag-login, sapilitang hihingin ng system na magtakda siya ng sarili niyang lihim na password bago makapasok sa dashboard."}</span>
                  </span>
                </div>
              </div>

              <div className="ump-modal-footer">
                <button type="button" className="ump-btn-ghost" onClick={() => setIsAddModalOpen(false)}>
                  {isEn ? "Cancel" : "Kanselahin"}
                </button>
                <button type="submit" className="ump-btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? (isEn ? "Saving..." : "Ise-save...") : (isEn ? "Create Account" : "Lumikha ng Account")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Hand-over Summary Card (Step 2) ── */}
      {createdSummary && (
        <div className="ump-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ump-modal-card" style={{ maxWidth: "560px" }}>
            <div className="ump-modal-header" style={{ background: "var(--apple-safe-bg)", borderBottom: "1px solid rgba(22, 163, 74, 0.2)" }}>
              <div className="ump-modal-title">
                <h3 style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--apple-safe)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  {isEn ? "Employee Account Created!" : "Nalikha na ang Account ng Empleyado!"}
                </h3>
                <p>{isEn ? "Provide these credentials to the official or staff for Hand-over (Step 2)." : "Ibigay ang mga detalye sa ibaba sa opisyal o kawani para sa “Hand-over” (Hakbang 2)."}</p>
              </div>
            </div>

            <div className="ump-modal-body">
              <div className="ump-handover-card">
                <div className="ump-handover-row">
                  <span className="ump-handover-key">{isEn ? "Employee Name:" : "Pangalan ng Empleyado:"}</span>
                  <span className="ump-handover-val">{createdSummary.name}</span>
                </div>
                <div className="ump-handover-row">
                  <span className="ump-handover-key">{isEn ? "Employee ID:" : "Employee ID:"}</span>
                  <span className="ump-handover-val">{createdSummary.employeeId}</span>
                </div>
                <div className="ump-handover-row">
                  <span className="ump-handover-key">{isEn ? "Office / Department:" : "Tanggapan / Opisina:"}</span>
                  <span className="ump-handover-val">{createdSummary.department}</span>
                </div>
                <div className="ump-handover-row">
                  <span className="ump-handover-key">{isEn ? "Username:" : "Username:"}</span>
                  <span className="ump-handover-val" style={{ color: "var(--apple-accent)", fontFamily: "monospace" }}>
                    @{createdSummary.username}
                  </span>
                </div>
                <div className="ump-handover-row">
                  <span className="ump-handover-key">{isEn ? "Default Password:" : "Default Password:"}</span>
                  <span className="ump-handover-val" style={{ color: "var(--apple-warn)", fontFamily: "monospace" }}>
                    {createdSummary.defaultPassword}
                  </span>
                </div>
              </div>

              <div
                style={{
                  fontSize: "0.82rem",
                  color: "var(--apple-text-secondary)",
                  lineHeight: 1.5,
                  background: "var(--apple-surface-secondary)",
                  padding: "12px 14px",
                  borderRadius: "var(--apple-radius-md)",
                  border: "1px solid var(--apple-border)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ marginTop: "2px", flexShrink: 0, color: "var(--apple-accent)" }}>
                  <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
                <div>
                  {isEn ? (
                    <><strong>Instructions to Staff:</strong> &ldquo;Sir/Ma&apos;am, your INFA-TRACK account has been created. Your username is <strong>&lsquo;{createdSummary.username}&rsquo;</strong> and your default password is <strong>&lsquo;{createdSummary.defaultPassword}&rsquo;</strong>. On your first login, the system will require you to change this to your private password.&rdquo;</>
                  ) : (
                    <><strong>Sasabihin sa Empleyado:</strong> &ldquo;Sir/Ma&apos;am, ginawan na kita ng account sa INFA-TRACK. Ang username mo ay <strong>&lsquo;{createdSummary.username}&rsquo;</strong> at ang default password mo ay <strong>&lsquo;{createdSummary.defaultPassword}&rsquo;</strong>. Sa unang pag-login mo, hihingin ng system na palitan mo ito ng sarili mong lihim na password.&rdquo;</>
                  )}
                </div>
              </div>

              <button type="button" className="ump-btn-copy" onClick={copyHandoverSlip}>
                {hasCopiedHandover ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--apple-safe)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ color: "var(--apple-safe)" }}>{isEn ? "Copied to Clipboard!" : "Nakopya sa Clipboard!"}</span>
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>{isEn ? "Copy Details for Hand-over" : "Kopyahin ang Detalye para sa Hand-over"}</span>
                  </>
                )}
              </button>
            </div>

            <div className="ump-modal-footer">
              <button type="button" className="ump-btn-primary" onClick={() => setCreatedSummary(null)}>
                {isEn ? "Done" : "Tapos Na"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm Deactivate / Activate Account ── */}
      {userToToggleStatus && (
        <div className="ump-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ump-modal-card">
            <div className="ump-modal-header">
              <div className="ump-modal-title">
                <h3>
                  {userToToggleStatus.isActive === false
                    ? "I-activate Muli ang Account?"
                    : "I-deactivate ang Account ng Empleyado?"}
                </h3>
                <p>
                  Account: <strong>{userToToggleStatus.name}</strong> (<code>@{userToToggleStatus.username}</code>)
                </p>
              </div>
            </div>

            <div className="ump-modal-body">
              {userToToggleStatus.isActive === false ? (
                <p style={{ fontSize: "0.88rem", color: "var(--apple-text)", lineHeight: 1.55, margin: 0 }}>
                  I-aactivate muli ang account na ito para sa tanggapan ng <strong>{userToToggleStatus.department}</strong>. Makakapag-login muli ang kawani sa INFA-TRACK.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <p style={{ fontSize: "0.88rem", color: "var(--apple-text)", lineHeight: 1.55, margin: 0 }}>
                    Ang pag-deactivate ay <strong>hindi bubura sa kanyang pangalan</strong> sa mga nakaraang in-approve niyang permit, tax assessments, o blueprints para sa proteksyon ng opisyal na audit trail.
                  </p>
                  <div style={{ background: "var(--apple-warn-bg)", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(217, 119, 6, 0.2)", fontSize: "0.82rem", color: "var(--apple-warn)", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ marginTop: "2px", flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>Agad na puputulin ang anumang aktibong sesyon ng account na ito at hindi na siya makakapag-login hanggang hindi ito muling ina-activate ng Super Admin.</span>
                  </div>
                </div>
              )}
            </div>

            <div className="ump-modal-footer">
              <button type="button" className="ump-btn-ghost" onClick={() => setUserToToggleStatus(null)}>
                Kanselahin
              </button>
              <button
                type="button"
                className="ump-btn-primary"
                onClick={confirmToggleStatus}
                disabled={togglingStatus}
                style={
                  userToToggleStatus.isActive === false
                    ? {}
                    : { background: "var(--apple-warn)", borderColor: "var(--apple-warn)" }
                }
              >
                {togglingStatus
                  ? "Pinoproseso..."
                  : userToToggleStatus.isActive === false
                  ? "Oo, I-activate Muli"
                  : "Oo, I-deactivate Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm Force Reset Password ── */}
      {userToReset && (
        <div className="ump-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ump-modal-card">
            <div className="ump-modal-header">
              <div className="ump-modal-title">
                <h3>I-reset ang Password sa Default?</h3>
                <p>Ibabalik ang password ni <strong>{userToReset.name || userToReset.username}</strong> sa <code>InfaTrack2026</code>.</p>
              </div>
            </div>

            <div className="ump-modal-body">
              <p style={{ fontSize: "0.88rem", color: "var(--apple-text)", lineHeight: 1.55, margin: 0 }}>
                Ang pagkilos na ito ay magtatakda ng password sa <strong>InfaTrack2026</strong> at magtatakda ng flag na <em>mustChangePassword: true</em>. Sa susunod na mag-login ang empleyado, sapilitan siyang hihingan ng system na magtakda ng bagong password.
              </p>
            </div>

            <div className="ump-modal-footer">
              <button type="button" className="ump-btn-ghost" onClick={() => setUserToReset(null)}>
                Kanselahin
              </button>
              <button type="button" className="ump-btn-primary" onClick={confirmResetPassword} disabled={resetting}>
                {resetting ? "Nirerereset..." : "Oo, I-reset sa Default"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm Delete User ── */}
      {userToDelete && (
        <div className="ump-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ump-modal-card">
            <div className="ump-modal-header" style={{ borderBottom: "1px solid rgba(220, 38, 38, 0.2)" }}>
              <div className="ump-modal-title">
                <h3 style={{ color: "var(--apple-danger)" }}>Tanggalin ang Empleyado?</h3>
                <p>Tatanggalin ang account ni <strong>{userToDelete.name || userToDelete.username}</strong> (<code>@{userToDelete.username}</code>).</p>
              </div>
            </div>

            <div className="ump-modal-body">
              <p style={{ fontSize: "0.88rem", color: "var(--apple-text)", lineHeight: 1.55, margin: 0 }}>
                Sigurado ka bang nais mong tanggalin ang test account na ito mula sa tanggapan ng <strong>{userToDelete.department}</strong>? Para sa mga aktwal na nag-resign na kawani, inirerekomenda ang <strong>I-deactivate</strong> upang mapanatili ang kanilang pangalan sa audit history.
              </p>
            </div>

            <div className="ump-modal-footer">
              <button type="button" className="ump-btn-ghost" onClick={() => setUserToDelete(null)}>
                Kanselahin
              </button>
              <button
                type="button"
                className="ump-btn-primary"
                style={{ background: "var(--apple-danger)", borderColor: "var(--apple-danger)" }}
                onClick={confirmDeleteUser}
                disabled={deleting}
              >
                {deleting ? "Tinatanggal..." : "Oo, Tanggalin ang Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Magdagdag ng Masterlist Item ── */}
      {isAddConfigModalOpen && (
        <div className="ump-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ump-modal-card">
            <div className="ump-modal-header">
              <div className="ump-modal-title">
                <h3>+ Magdagdag sa {activeConfigCategory}</h3>
                <p>Idagdag ang bagong opsyon upang lumabas agad sa mga dropdown ng system nang walang code changes.</p>
              </div>
              <button type="button" className="ump-modal-close" onClick={() => setIsAddConfigModalOpen(false)} aria-label="Isara">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddConfigSubmit}>
              <div className="ump-modal-body">
                {configError && (
                  <div style={{ padding: "8px 12px", background: "var(--apple-danger-bg)", color: "var(--apple-danger)", borderRadius: "6px", fontSize: "0.82rem" }}>
                    {configError}
                  </div>
                )}
                <div className="ump-modal-field">
                  <label className="ump-modal-label">Pangalan ng Opsyon (Display Name) *</label>
                  <input
                    type="text"
                    className="ump-modal-input"
                    value={addConfigForm.name}
                    onChange={(e) => setAddConfigForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="hal. Eco-Tourism Lodge, Barangay San Mateo..."
                    required
                    autoFocus
                  />
                </div>
                <div className="ump-modal-field">
                  <label className="ump-modal-label">Code Identifier (opsyonal)</label>
                  <input
                    type="text"
                    className="ump-modal-input"
                    value={addConfigForm.code}
                    onChange={(e) => setAddConfigForm((prev) => ({ ...prev, code: e.target.value }))}
                    placeholder="hal. ECO_LODGE"
                  />
                </div>
                {activeConfigCategory === "barangays" && (
                  <div className="ump-modal-field">
                    <label className="ump-modal-label">Zoning Classification *</label>
                    <select
                      className="ump-modal-select"
                      value={addConfigForm.zone || "Rural Zone"}
                      onChange={(e) => setAddConfigForm((prev) => ({ ...prev, zone: e.target.value }))}
                    >
                      <option value="Urban / Commercial Zone">Urban / Commercial Zone</option>
                      <option value="Rural Zone">Rural Zone</option>
                      <option value="Agricultural / Forest Zone">Agricultural / Forest Zone</option>
                      <option value="Eco-Tourism Zone">Eco-Tourism Zone</option>
                    </select>
                  </div>
                )}
                <div className="ump-modal-field">
                  <label className="ump-modal-label">Deskripsyon / Paliwanag</label>
                  <input
                    type="text"
                    className="ump-modal-input"
                    value={addConfigForm.desc}
                    onChange={(e) => setAddConfigForm((prev) => ({ ...prev, desc: e.target.value }))}
                    placeholder="Maikling paliwanag sa kategorya..."
                  />
                </div>
              </div>
              <div className="ump-modal-footer">
                <button type="button" className="ump-btn-ghost" onClick={() => setIsAddConfigModalOpen(false)}>
                  Kanselahin
                </button>
                <button type="submit" className="ump-btn-primary" disabled={isSubmittingConfig}>
                  {isSubmittingConfig ? "Idinadagdag..." : "+ Idagdag sa Masterlist"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: I-edit ang Masterlist Item ── */}
      {isEditConfigModalOpen && editingConfigItem && (
        <div className="ump-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ump-modal-card">
            <div className="ump-modal-header">
              <div className="ump-modal-title">
                <h3>I-edit: {editingConfigItem.name}</h3>
                <p>Baguhin ang display name o deskripsyon ng item na ito.</p>
              </div>
              <button type="button" className="ump-modal-close" onClick={() => setIsEditConfigModalOpen(false)} aria-label="Isara">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEditConfigSubmit}>
              <div className="ump-modal-body">
                <div className="ump-modal-field">
                  <label className="ump-modal-label">Pangalan ng Opsyon (Display Name)</label>
                  <input
                    type="text"
                    className="ump-modal-input"
                    value={editingConfigItem.name}
                    onChange={(e) => setEditingConfigItem((prev) => prev ? ({ ...prev, name: e.target.value }) : null)}
                    required
                  />
                </div>
                <div className="ump-modal-field">
                  <label className="ump-modal-label">Code Identifier</label>
                  <input
                    type="text"
                    className="ump-modal-input"
                    value={editingConfigItem.code || ""}
                    onChange={(e) => setEditingConfigItem((prev) => prev ? ({ ...prev, code: e.target.value }) : null)}
                  />
                </div>
                {activeConfigCategory === "barangays" && (
                  <div className="ump-modal-field">
                    <label className="ump-modal-label">Zoning Classification</label>
                    <select
                      className="ump-modal-select"
                      value={editingConfigItem.zone || "Rural Zone"}
                      onChange={(e) => setEditingConfigItem((prev) => prev ? ({ ...prev, zone: e.target.value }) : null)}
                    >
                      <option value="Urban / Commercial Zone">Urban / Commercial Zone</option>
                      <option value="Rural Zone">Rural Zone</option>
                      <option value="Agricultural / Forest Zone">Agricultural / Forest Zone</option>
                      <option value="Eco-Tourism Zone">Eco-Tourism Zone</option>
                    </select>
                  </div>
                )}
                <div className="ump-modal-field">
                  <label className="ump-modal-label">Deskripsyon</label>
                  <input
                    type="text"
                    className="ump-modal-input"
                    value={editingConfigItem.desc || ""}
                    onChange={(e) => setEditingConfigItem((prev) => prev ? ({ ...prev, desc: e.target.value }) : null)}
                  />
                </div>
              </div>
              <div className="ump-modal-footer">
                <button type="button" className="ump-btn-ghost" onClick={() => setIsEditConfigModalOpen(false)}>
                  Kanselahin
                </button>
                <button type="submit" className="ump-btn-primary" disabled={isSubmittingConfig}>
                  {isSubmittingConfig ? "Sinasave..." : "I-save ang Pagbabago"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
