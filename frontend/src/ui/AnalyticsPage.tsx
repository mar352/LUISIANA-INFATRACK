import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { Project } from "../types";
import type { SessionUser } from "../services/auth";
import SideNavbar from "./SideNavbar";
import MpdcTopNavbar from "./MpdcTopNavbar";
import { fetchCitizenApplications, fetchPublicProjects } from "../lib/api";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";
import {
  FileText,
  Building2,
  Tractor,
  Landmark,
  Clock,
  Wrench,
  CheckCircle2,
  XCircle,
  BarChart3,
  PieChart as PieIcon,
  FolderArchive,
  RefreshCw,
  Database,
  TrendingUp,
  Filter,
  LayoutGrid,
} from "lucide-react";
import "./AnalyticsPage.css";

export type Props = {
  onBack?: () => void;
  /** Live projects from the map / backend — no sample or seeded filler data. */
  projects?: Project[];
  captureMapPng?: () => Promise<string | null>;
  onNavigate?: (screen: string) => void;
  session?: SessionUser | null;
  onLogout?: () => void;
};

export type AnalyticsSubTab =
  | "all"
  | "kpis"
  | "pipeline"
  | "zoning"
  | "trends"
  | "transparency";

// Interface for Municipal Public Works Projects (LGU Transparency)
interface MunicipalProjectItem {
  id?: string;
  projectName: string;
  barangay: string;
  contractor: string;
  budget: number;
}

interface BarangayDistributionItem {
  barangay: string;
  count: number;
  percentage: number;
}

interface SafeBufferStats {
  safeCount: number;
  bufferCount: number;
  unassessedCount: number;
  safePercent: number;
  bufferPercent: number;
  unassessedPercent: number;
}

export default function AnalyticsPage({
  projects = [],
  captureMapPng,
  onNavigate,
  session,
  onLogout,
}: Props) {
  // ── Sub-Navigation Active Tab (Separates the Analytics into dedicated views) ─
  const [activeNavTab, setActiveNavTab] = useState<AnalyticsSubTab>("all");

  // ── Raw Fetched Data States ────────────────────────────────────────────────
  const [rawApplications, setRawApplications] = useState<any[]>([]);
  const [rawProjects, setRawProjects] = useState<any[]>([]);
  const [isFetchingAll, setIsFetchingAll] = useState<boolean>(false);
  const [fetchingSection, setFetchingSection] = useState<Record<string, boolean>>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // View toggle for Pipeline Chart (Funnel vs Horizontal Stacked Bar)
  const [pipelineChartMode, setPipelineChartMode] = useState<"funnel" | "stacked">("funnel");

  // ── 1. AT-A-GLANCE METRICS (Initialized to 0 / Empty) ────────────────────────
  // TODO: Fetch from backend (e.g. GET /api/analytics/metrics or live count query)
  const [totalApplications, setTotalApplications] = useState<number>(0);
  // TODO: Fetch from backend (e.g. GET /api/analytics/metrics/private-infra)
  const [privateInfrastructure, setPrivateInfrastructure] = useState<number>(0);
  // TODO: Fetch from backend (e.g. GET /api/analytics/metrics/agricultural-zone)
  const [agriculturalZone, setAgriculturalZone] = useState<number>(0);
  // TODO: Fetch from backend (e.g. GET /api/analytics/metrics/municipal-projects)
  const [municipalProjects, setMunicipalProjects] = useState<number>(0);

  // ── 2. APPLICATION STATUS PIPELINE (Initialized to 0 / Empty) ────────────────
  // TODO: Fetch from backend (e.g. GET /api/analytics/status-pipeline)
  const [pipelineStatus, setPipelineStatus] = useState<{
    pendingMpdc: number;
    withEngineering: number;
    approved: number;
    rejectedReturned: number;
  }>({
    pendingMpdc: 0,
    withEngineering: 0,
    approved: 0,
    rejectedReturned: 0,
  });

  // ── 3. ZONING & LOCATION METRICS (Initialized to Empty Arrays) ───────────────
  // TODO: Fetch from backend (e.g. GET /api/analytics/zoning-distribution)
  const [distributionPerBarangay, setDistributionPerBarangay] = useState<BarangayDistributionItem[]>([]);
  // TODO: Fetch from backend (e.g. GET /api/analytics/safe-vs-buffer)
  const [safeVsBufferStats, setSafeVsBufferStats] = useState<SafeBufferStats | null>(null);

  // ── 4. LGU TRANSPARENCY (Municipal Projects Table - Initialized to Empty Array)
  // TODO: Fetch from backend (e.g. GET /api/projects/municipal-transparency)
  const [municipalProjectsList, setMunicipalProjectsList] = useState<MunicipalProjectItem[]>([]);

  // ── Process Applications Data Into Metrics ─────────────────────────────────
  const processApplicationsData = useCallback((apps: any[], projs: any[] = []) => {
    if (!Array.isArray(apps)) return;

    // 1. At-a-Glance Metrics
    const total = apps.length;
    let privCount = 0;
    let agriCount = 0;
    let muniCount = 0;

    for (const a of apps) {
      const cat = (a.category || "").toLowerCase();
      const zoning = (a.zoningClassification || "").toLowerCase();
      const isAgri =
        zoning.includes("rural") ||
        zoning.includes("agri") ||
        Boolean(a.agriculturalDetails?.farmType);

      if (isAgri) {
        agriCount++;
      }

      if (cat === "municipal" || cat === "municipal_project" || a.municipalDetails?.implementingDepartment) {
        muniCount++;
      } else {
        privCount++;
      }
    }

    const totalMuni = muniCount + (Array.isArray(projs) ? projs.length : 0);

    setTotalApplications(total);
    setPrivateInfrastructure(privCount);
    setAgriculturalZone(agriCount);
    setMunicipalProjects(totalMuni);

    // 2. Application Status Pipeline
    let pending = 0;
    let engineering = 0;
    let apprv = 0;
    let rejected = 0;

    for (const a of apps) {
      const st = String(a.status || "").toLowerCase();
      if (st === "submitted" || st === "for_payment" || st === "in_review" || st === "intake") {
        pending++;
      } else if (st === "ocular_inspection" || st === "for_engineering_review" || st === "engineering") {
        engineering++;
      } else if (st === "approved" || st === "approved_for_construction" || st === "completed") {
        apprv++;
      } else if (st === "returned" || st === "rejected") {
        rejected++;
      } else {
        pending++;
      }
    }

    setPipelineStatus({
      pendingMpdc: pending,
      withEngineering: engineering,
      approved: apprv,
      rejectedReturned: rejected,
    });

    // 3. Zoning & Location Metrics - Distribution per Barangay
    const brgyMap = new Map<string, number>();
    for (const a of apps) {
      const rawBrgy =
        a.applicant?.barangay ||
        a.barangay ||
        a.lotDetails?.barangay ||
        "Poblacion";
      const cleanBrgy = rawBrgy.trim();
      brgyMap.set(cleanBrgy, (brgyMap.get(cleanBrgy) || 0) + 1);
    }

    const brgyList: BarangayDistributionItem[] = [];
    brgyMap.forEach((cnt, brgyName) => {
      brgyList.push({
        barangay: brgyName,
        count: cnt,
        percentage: total > 0 ? Math.round((cnt / total) * 100) : 0,
      });
    });

    brgyList.sort((a, b) => b.count - a.count);
    setDistributionPerBarangay(brgyList);

    // 3. Safe Zone vs Buffer Zone Analysis
    let safe = 0;
    let buffer = 0;
    let unassessed = 0;

    for (const a of apps) {
      const flood = a.geoRisk?.flood?.value;
      const landslide = a.geoRisk?.landslide?.value;

      if (!flood && !landslide) {
        unassessed++;
      } else {
        const isHazardous =
          (landslide && String(landslide).toLowerCase().includes("moderate")) ||
          (landslide && String(landslide).toLowerCase().includes("high")) ||
          (flood && String(flood).toLowerCase().includes("moderate")) ||
          (flood && String(flood).toLowerCase().includes("high"));

        if (isHazardous) {
          buffer++;
        } else {
          safe++;
        }
      }
    }

    if (total > 0) {
      setSafeVsBufferStats({
        safeCount: safe,
        bufferCount: buffer,
        unassessedCount: unassessed,
        safePercent: Math.round((safe / total) * 100),
        bufferPercent: Math.round((buffer / total) * 100),
        unassessedPercent: Math.round((unassessed / total) * 100),
      });
    } else {
      setSafeVsBufferStats(null);
    }

    // 4. LGU Transparency - Municipal Projects Table
    const formattedPublicProjects: MunicipalProjectItem[] = [];
    if (Array.isArray(projs) && projs.length > 0) {
      for (const p of projs) {
        formattedPublicProjects.push({
          id: p.id,
          projectName: p.name || "Municipal Project",
          barangay: p.barangay || "Municipal Wide",
          contractor: p.contractor || "LGU Luisiana / Direct Execution",
          budget: Number(p.budgetTotal || p.budgetSpent || 0),
        });
      }
    }
    setMunicipalProjectsList(formattedPublicProjects);
  }, []);

  // ── Section-Specific and Global Fetch Handlers ─────────────────────────────
  const handleFetchAll = useCallback(async () => {
    setIsFetchingAll(true);
    try {
      const [apps, pubProjs] = await Promise.all([
        fetchCitizenApplications().catch(() => []),
        fetchPublicProjects().then((r) => r.projects || []).catch(() => []),
      ]);

      const combinedProjects = [...(Array.isArray(projects) ? projects : []), ...pubProjs];
      setRawApplications(apps);
      setRawProjects(combinedProjects);
      processApplicationsData(apps, combinedProjects);
      setLastSyncedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn("[AnalyticsPage] Error fetching telemetry:", err);
    } finally {
      setIsFetchingAll(false);
    }
  }, [projects, processApplicationsData]);

  const handleFetchSection = async (
    sectionKey: "metrics" | "pipeline" | "zoning" | "trends" | "transparency"
  ) => {
    setFetchingSection((prev) => ({ ...prev, [sectionKey]: true }));
    try {
      if (sectionKey === "transparency") {
        const pub = await fetchPublicProjects().then((r) => r.projects || []).catch(() => []);
        const combined = [...(Array.isArray(projects) ? projects : []), ...pub];
        setRawProjects(combined);
        const formatted = combined.map((p) => ({
          id: p.id,
          projectName: p.name || "Municipal Project",
          barangay: p.barangay || "Municipal Wide",
          contractor: p.contractor || "LGU Luisiana / Direct Execution",
          budget: Number(p.budgetTotal || p.budgetSpent || 0),
        }));
        setMunicipalProjectsList(formatted);
      } else {
        const apps = await fetchCitizenApplications().catch(() => []);
        setRawApplications(apps);
        processApplicationsData(apps, rawProjects);
      }
      setLastSyncedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn(`[AnalyticsPage] Error fetching section ${sectionKey}:`, err);
    } finally {
      setFetchingSection((prev) => ({ ...prev, [sectionKey]: false }));
    }
  };

  useEffect(() => {
    void handleFetchAll();
  }, [handleFetchAll]);

  // Compute Total and Percentages for Pipeline
  const totalInPipeline = useMemo(() => {
    return (
      pipelineStatus.pendingMpdc +
      pipelineStatus.withEngineering +
      pipelineStatus.approved +
      pipelineStatus.rejectedReturned
    );
  }, [pipelineStatus]);

  // ── Specific Chart Datasets ────────────────────────────────────────────────

  // 1. Pipeline Funnel Chart Dataset
  const funnelData = useMemo(() => {
    return [
      { name: "Pending with MPDC", value: pipelineStatus.pendingMpdc, fill: "#f59e0b" },
      { name: "With Engineering", value: pipelineStatus.withEngineering, fill: "#0ea5e9" },
      { name: "Approved", value: pipelineStatus.approved, fill: "#10b981" },
      { name: "Rejected / Returned", value: pipelineStatus.rejectedReturned, fill: "#ef4444" },
    ];
  }, [pipelineStatus]);

  // 2. Pipeline Horizontal Stacked Bar Dataset
  const horizontalStackedPipelineData = useMemo(() => {
    return [
      {
        name: "Applications",
        "Pending with MPDC": pipelineStatus.pendingMpdc,
        "With Engineering": pipelineStatus.withEngineering,
        Approved: pipelineStatus.approved,
        "Rejected / Returned": pipelineStatus.rejectedReturned,
      },
    ];
  }, [pipelineStatus]);

  // 3. Horizontal Bar Chart Dataset for "Distribution per Barangay"
  const horizontalBarangayData = useMemo(() => {
    return distributionPerBarangay.map((item) => ({
      name: item.barangay,
      applications: item.count,
      percentage: item.percentage,
    }));
  }, [distributionPerBarangay]);

  // 4. Donut Chart Dataset for "Safe Zone vs Buffer Zone"
  const donutHazardData = useMemo(() => {
    if (!safeVsBufferStats) return [];
    const list = [];
    if (safeVsBufferStats.safeCount > 0) {
      list.push({ name: "Safe Development Zone", value: safeVsBufferStats.safeCount, fill: "#10b981" });
    }
    if (safeVsBufferStats.bufferCount > 0) {
      list.push({ name: "Buffer / Hazard Zone", value: safeVsBufferStats.bufferCount, fill: "#f59e0b" });
    }
    if (safeVsBufferStats.unassessedCount > 0) {
      list.push({ name: "Awaiting Geodetic Pin", value: safeVsBufferStats.unassessedCount, fill: "#94a3b8" });
    }
    return list;
  }, [safeVsBufferStats]);

  // 5. Line Chart Dataset for "Applications Over Time" (Monthly Application Trends)
  const monthlyTrendsData = useMemo(() => {
    if (!Array.isArray(rawApplications) || rawApplications.length === 0) return [];

    const map = new Map<string, number>();
    for (const a of rawApplications) {
      const dateStr = a.createdAt || a.remarks?.[0]?.createdAt;
      if (!dateStr) continue;
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) continue;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const key = `${y}-${m}`;
        map.set(key, (map.get(key) || 0) + 1);
      } catch {}
    }

    const sortedKeys = Array.from(map.keys()).sort();
    return sortedKeys.map((key) => {
      const [y, m] = key.split("-");
      const dateObj = new Date(Number(y), Number(m) - 1, 1);
      const monthLabel = dateObj.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      return {
        monthKey: key,
        monthLabel,
        applications: map.get(key) || 0,
      };
    });
  }, [rawApplications]);

  return (
    <div className="an-page">
      <MpdcTopNavbar
        title="Infrastructure Telemetry & Analytics"
        subtitle="Real-time telemetry, municipal budget tracking & hazard exposure"
        brandPill="MPDC"
        accentClass="topnav-accent-mpdc"
        serviceTag="Executive GIS Telemetry"
        serviceSla="23 Barangays · Multi-Spectral Siting"
        session={session}
        userDept="GIS & Urban Planning"
        onLogout={onLogout}
      />

      <div className="app-page-body-with-side-nav">
        <SideNavbar
          currentScreen="analytics"
          onNavigate={onNavigate}
          currentRole={session?.role || "MPDC"}
        />
        <div className="app-page-main-with-side-nav">
          <div className="an-body">
            <div className="an-container">
              {/* Dashboard Section Header */}
              <div className="an-dashboard-header">
                <div className="an-dashboard-header-text">
                  <div className="an-dashboard-eyebrow">
                    <span>MUNICIPAL PLANNING & DEVELOPMENT COORDINATOR</span>
                    <span className="an-dot-separator">•</span>
                    <span className="an-telemetry-badge">
                      <span className="an-pulse-dot" /> Live Telemetry Mode
                    </span>
                  </div>
                  <h1 className="an-dashboard-title">Infrastructure Analytics Dashboard</h1>
                  <p className="an-dashboard-subtitle">
                    Executive overview of municipal infrastructure applications, CLUP zoning compliance, and public capital works.
                  </p>
                </div>
                <div className="an-dashboard-header-actions">
                  <button
                    type="button"
                    className="an-refresh-btn"
                    onClick={handleFetchAll}
                    disabled={isFetchingAll}
                    title="Fetch and sync live data from database"
                  >
                    <RefreshCw size={14} className={isFetchingAll ? "an-spin" : ""} />
                    <span>{isFetchingAll ? "Syncing Live Data..." : "Sync All Sections"}</span>
                  </button>
                </div>
              </div>

              {/* ── Global Telemetry Control Bar ──────────────────────────────── */}
              <div className="an-global-control-bar">
                <div className="an-global-status-info">
                  <div className="an-db-pill">
                    <Database size={14} />
                    <span>Database Status:</span>
                    <b className="an-db-count">
                      {rawApplications.length > 0
                        ? `${rawApplications.length} Live Applications Loaded`
                        : "Ready to Query"}
                    </b>
                  </div>
                  {lastSyncedAt && (
                    <span className="an-last-synced-text">
                      Last queried: <b>{lastSyncedAt}</b>
                    </span>
                  )}
                </div>

                <div className="an-global-bar-actions">
                  <button
                    type="button"
                    className="an-bar-action-btn"
                    onClick={handleFetchAll}
                    disabled={isFetchingAll}
                  >
                    <RefreshCw size={13} className={isFetchingAll ? "an-spin" : ""} />
                    <span>Fetch All Live Records</span>
                  </button>
                </div>
              </div>

              {/* ── SUB-NAVIGATION BUTTONS (Separating Analytics Sections) ──────── */}
              <div className="an-subnav-container">
                <div className="an-subnav-label">Analytics Modules:</div>
                <nav className="an-subnav-list" role="tablist" aria-label="Analytics sub-navigation">
                  {/* NavButton 1: All Sections */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeNavTab === "all"}
                    className={`an-subnav-btn ${activeNavTab === "all" ? "active" : ""}`}
                    onClick={() => setActiveNavTab("all")}
                  >
                    <LayoutGrid size={15} />
                    <span className="an-subnav-btn-text">All Telemetry</span>
                    <span className="an-subnav-badge">Overview</span>
                  </button>

                  {/* NavButton 2: KPI Metrics */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeNavTab === "kpis"}
                    className={`an-subnav-btn ${activeNavTab === "kpis" ? "active" : ""}`}
                    onClick={() => setActiveNavTab("kpis")}
                  >
                    <FileText size={15} />
                    <span className="an-subnav-btn-text">KPI Metrics</span>
                    <span className="an-subnav-badge">{totalApplications}</span>
                  </button>

                  {/* NavButton 3: Status Pipeline */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeNavTab === "pipeline"}
                    className={`an-subnav-btn ${activeNavTab === "pipeline" ? "active" : ""}`}
                    onClick={() => setActiveNavTab("pipeline")}
                  >
                    <Filter size={15} />
                    <span className="an-subnav-btn-text">Status Pipeline</span>
                    <span className="an-subnav-badge">{totalInPipeline}</span>
                  </button>

                  {/* NavButton 4: Zoning & Hazard */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeNavTab === "zoning"}
                    className={`an-subnav-btn ${activeNavTab === "zoning" ? "active" : ""}`}
                    onClick={() => setActiveNavTab("zoning")}
                  >
                    <PieIcon size={15} />
                    <span className="an-subnav-btn-text">Zoning &amp; Hazard</span>
                    <span className="an-subnav-badge">{distributionPerBarangay.length} Brgys</span>
                  </button>

                  {/* NavButton 5: Trends Over Time */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeNavTab === "trends"}
                    className={`an-subnav-btn ${activeNavTab === "trends" ? "active" : ""}`}
                    onClick={() => setActiveNavTab("trends")}
                  >
                    <TrendingUp size={15} />
                    <span className="an-subnav-btn-text">Applications Over Time</span>
                    <span className="an-subnav-badge">{monthlyTrendsData.length} Mos</span>
                  </button>

                  {/* NavButton 6: LGU Transparency */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeNavTab === "transparency"}
                    className={`an-subnav-btn ${activeNavTab === "transparency" ? "active" : ""}`}
                    onClick={() => setActiveNavTab("transparency")}
                  >
                    <Landmark size={15} />
                    <span className="an-subnav-btn-text">LGU Transparency</span>
                    <span className="an-subnav-badge">{municipalProjectsList.length} Projs</span>
                  </button>
                </nav>
              </div>

              {/* ── SECTION 1: AT-A-GLANCE METRICS (Large KPI Stat Cards) ──────── */}
              {(activeNavTab === "all" || activeNavTab === "kpis") && (
                <section className="an-section an-tab-pane" aria-labelledby="section-metrics-title">
                  <div className="an-section-header">
                    <div className="an-section-title-wrap">
                      <h2 id="section-metrics-title" className="an-section-title">
                        At-a-Glance Metrics
                      </h2>
                      <span className="an-section-badge">Large KPI Stat Cards</span>
                    </div>
                    <div className="an-section-actions">
                      <button
                        type="button"
                        className="an-section-fetch-btn"
                        onClick={() => handleFetchSection("metrics")}
                        disabled={fetchingSection.metrics}
                        title="Fetch latest metrics counters from database"
                      >
                        <RefreshCw size={12} className={fetchingSection.metrics ? "an-spin" : ""} />
                        <span>{fetchingSection.metrics ? "Fetching..." : "Fetch Metrics"}</span>
                      </button>
                    </div>
                  </div>

                  <div className="an-kpi-grid">
                    {/* Card 1: Total Applications */}
                    <div className="an-metric-card an-metric-card-applications">
                      <div className="an-metric-card-top">
                        <span className="an-metric-label">Total Applications</span>
                        <div className="an-metric-icon-wrap" aria-hidden="true">
                          <FileText size={18} />
                        </div>
                      </div>
                      <div className="an-metric-value">{totalApplications}</div>
                      <div className="an-metric-footer">
                        <span className="an-metric-status-pill">Active Intake</span>
                        <span className="an-metric-subtext">
                          {totalApplications > 0
                            ? `${totalApplications} recorded submissions`
                            : "0 recorded submissions"}
                        </span>
                      </div>
                    </div>

                    {/* Card 2: Private Infrastructure */}
                    <div className="an-metric-card an-metric-card-private">
                      <div className="an-metric-card-top">
                        <span className="an-metric-label">Private Infrastructure</span>
                        <div className="an-metric-icon-wrap" aria-hidden="true">
                          <Building2 size={18} />
                        </div>
                      </div>
                      <div className="an-metric-value">{privateInfrastructure}</div>
                      <div className="an-metric-footer">
                        <span className="an-metric-status-pill">Residential / Commercial</span>
                        <span className="an-metric-subtext">
                          {privateInfrastructure > 0
                            ? `${privateInfrastructure} registered structures`
                            : "0 registered structures"}
                        </span>
                      </div>
                    </div>

                    {/* Card 3: Agricultural Zone */}
                    <div className="an-metric-card an-metric-card-agricultural">
                      <div className="an-metric-card-top">
                        <span className="an-metric-label">Agricultural Zone</span>
                        <div className="an-metric-icon-wrap" aria-hidden="true">
                          <Tractor size={18} />
                        </div>
                      </div>
                      <div className="an-metric-value">{agriculturalZone}</div>
                      <div className="an-metric-footer">
                        <span className="an-metric-status-pill">Agri & Rural Siting</span>
                        <span className="an-metric-subtext">
                          {agriculturalZone > 0
                            ? `${agriculturalZone} agri permits logged`
                            : "0 agri permits logged"}
                        </span>
                      </div>
                    </div>

                    {/* Card 4: Municipal Projects */}
                    <div className="an-metric-card an-metric-card-municipal">
                      <div className="an-metric-card-top">
                        <span className="an-metric-label">Municipal Projects</span>
                        <div className="an-metric-icon-wrap" aria-hidden="true">
                          <Landmark size={18} />
                        </div>
                      </div>
                      <div className="an-metric-value">{municipalProjects}</div>
                      <div className="an-metric-footer">
                        <span className="an-metric-status-pill">Public Works & Capital</span>
                        <span className="an-metric-subtext">
                          {municipalProjects > 0
                            ? `${municipalProjects} government initiatives`
                            : "0 government initiatives"}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* ── SECTION 2: APPLICATION STATUS PIPELINE (Funnel or Stacked Bar) ─ */}
              {(activeNavTab === "all" || activeNavTab === "pipeline") && (
                <section className="an-section an-tab-pane" aria-labelledby="section-pipeline-title">
                  <div className="an-card an-pipeline-card">
                    <div className="an-card-header">
                      <div>
                        <h2 id="section-pipeline-title" className="an-card-title">
                          Application Status Pipeline
                        </h2>
                        <p className="an-card-description">
                          Lifecycle flow of applications across municipal intake, engineering review, and final approval stages.
                        </p>
                      </div>
                      <div className="an-pipeline-header-controls">
                        {/* Segmented Mode Selector: Funnel Chart vs Horizontal Stacked Bar */}
                        <div className="an-segmented-control" role="group" aria-label="Pipeline view selector">
                          <button
                            type="button"
                            className={`an-segment-btn ${pipelineChartMode === "funnel" ? "active" : ""}`}
                            onClick={() => setPipelineChartMode("funnel")}
                          >
                            Funnel Chart
                          </button>
                          <button
                            type="button"
                            className={`an-segment-btn ${pipelineChartMode === "stacked" ? "active" : ""}`}
                            onClick={() => setPipelineChartMode("stacked")}
                          >
                            Horizontal Stacked Bar
                          </button>
                        </div>

                        <span className="an-pipeline-total-chip">
                          Total in Pipeline: <b>{totalInPipeline}</b>
                        </span>
                        <button
                          type="button"
                          className="an-section-fetch-btn"
                          onClick={() => handleFetchSection("pipeline")}
                          disabled={fetchingSection.pipeline}
                          title="Fetch and recalculate pipeline status distribution"
                        >
                          <RefreshCw size={12} className={fetchingSection.pipeline ? "an-spin" : ""} />
                          <span>{fetchingSection.pipeline ? "Syncing..." : "Fetch Pipeline"}</span>
                        </button>
                      </div>
                    </div>

                    {totalInPipeline > 0 ? (
                      <div className="an-pipeline-chart-wrapper">
                        {pipelineChartMode === "funnel" ? (
                          /* Funnel Chart View */
                          <div className="an-funnel-container">
                            <ResponsiveContainer width="100%" height={260}>
                              <FunnelChart>
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const d = payload[0].payload;
                                      const pct =
                                        totalInPipeline > 0
                                          ? Math.round((Number(d.value) / totalInPipeline) * 100)
                                          : 0;
                                      return (
                                        <div className="an-custom-tooltip">
                                          <div className="an-tooltip-title">{d.name}</div>
                                          <div className="an-tooltip-value">
                                            {d.value} {d.value === 1 ? "application" : "applications"} ({pct}%)
                                          </div>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                                  <LabelList
                                    position="right"
                                    fill="var(--apple-text, #1d1d1f)"
                                    stroke="none"
                                    dataKey="name"
                                    formatter={(val: string) => val}
                                    style={{ fontSize: 12, fontWeight: 600 }}
                                  />
                                </Funnel>
                              </FunnelChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          /* Horizontal Stacked Bar Chart View */
                          <div className="an-stacked-bar-container">
                            <ResponsiveContainer width="100%" height={160}>
                              <BarChart
                                layout="vertical"
                                data={horizontalStackedPipelineData}
                                margin={{ top: 20, right: 30, left: 30, bottom: 20 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.15} />
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis type="category" dataKey="name" hide />
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      return (
                                        <div className="an-custom-tooltip">
                                          <div className="an-tooltip-title">Pipeline Breakdown</div>
                                          {payload.map((entry: any) => (
                                            <div key={entry.name} className="an-tooltip-row">
                                              <span style={{ color: entry.color }}>●</span>
                                              <span>{entry.name}:</span>
                                              <b>{entry.value}</b>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Legend
                                  verticalAlign="top"
                                  height={36}
                                  formatter={(val) => (
                                    <span style={{ fontSize: 12, color: "var(--apple-text, #1d1d1f)", fontWeight: 500 }}>
                                      {val}
                                    </span>
                                  )}
                                />
                                <Bar dataKey="Pending with MPDC" stackId="pipeline" fill="#f59e0b" radius={[4, 0, 0, 4]} />
                                <Bar dataKey="With Engineering" stackId="pipeline" fill="#0ea5e9" />
                                <Bar dataKey="Approved" stackId="pipeline" fill="#10b981" />
                                <Bar dataKey="Rejected / Returned" stackId="pipeline" fill="#ef4444" radius={[0, 4, 4, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {/* Stage Summary Cards Beneath Chart */}
                        <div className="an-pipeline-summary-cards">
                          <div className="an-stage-summary-chip chip-pending">
                            <div className="an-stage-chip-top">
                              <Clock size={14} />
                              <span>Stage 1: Pending MPDC</span>
                            </div>
                            <b>{pipelineStatus.pendingMpdc}</b>
                          </div>

                          <div className="an-stage-summary-chip chip-engineering">
                            <div className="an-stage-chip-top">
                              <Wrench size={14} />
                              <span>Stage 2: Engineering</span>
                            </div>
                            <b>{pipelineStatus.withEngineering}</b>
                          </div>

                          <div className="an-stage-summary-chip chip-approved">
                            <div className="an-stage-chip-top">
                              <CheckCircle2 size={14} />
                              <span>Stage 3: Approved</span>
                            </div>
                            <b>{pipelineStatus.approved}</b>
                          </div>

                          <div className="an-stage-summary-chip chip-rejected">
                            <div className="an-stage-chip-top">
                              <XCircle size={14} />
                              <span>Stage 4: Rejected / Returned</span>
                            </div>
                            <b>{pipelineStatus.rejectedReturned}</b>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="an-chart-placeholder-box">
                        <div className="an-placeholder-center">
                          <div className="an-placeholder-icon-wrap" aria-hidden="true">
                            <Filter size={26} />
                          </div>
                          <p className="an-placeholder-primary-text">No applications currently in pipeline.</p>
                          <p className="an-placeholder-subtext">Click &ldquo;Fetch Pipeline&rdquo; to load telemetry from database.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── SECTION 3: ZONING & LOCATION METRICS ─────────────────────────── */}
              {(activeNavTab === "all" || activeNavTab === "zoning") && (
                <section className="an-section an-tab-pane" aria-labelledby="section-zoning-title">
                  <div className="an-section-header">
                    <div className="an-section-title-wrap">
                      <h2 id="section-zoning-title" className="an-section-title">
                        Zoning & Location Metrics
                      </h2>
                      <span className="an-section-badge">Horizontal Bar & Donut Visualization</span>
                    </div>
                    <div className="an-section-actions">
                      <button
                        type="button"
                        className="an-section-fetch-btn"
                        onClick={() => handleFetchSection("zoning")}
                        disabled={fetchingSection.zoning}
                        title="Fetch live barangay distribution and hazard risk overlay"
                      >
                        <RefreshCw size={12} className={fetchingSection.zoning ? "an-spin" : ""} />
                        <span>{fetchingSection.zoning ? "Querying..." : "Fetch Zoning Data"}</span>
                      </button>
                    </div>
                  </div>

                  <div className="an-charts-grid">
                    {/* Chart 1: Distribution per Barangay (Horizontal Bar Chart) */}
                    <div className="an-card an-chart-card">
                      <div className="an-card-header">
                        <div>
                          <h3 className="an-card-title">Distribution per Barangay</h3>
                          <p className="an-card-description">
                            Infrastructure application volume across the 23 barangays of Luisiana.
                          </p>
                        </div>
                        <span className="an-chart-badge">Horizontal Bar Chart</span>
                      </div>

                      {horizontalBarangayData.length > 0 ? (
                        <div className="an-recharts-bar-wrap">
                          <ResponsiveContainer
                            width="100%"
                            height={Math.max(280, horizontalBarangayData.length * 28)}
                          >
                            <BarChart
                              layout="vertical"
                              data={horizontalBarangayData}
                              margin={{ top: 8, right: 30, left: 140, bottom: 8 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.12} />
                              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                              <YAxis
                                type="category"
                                dataKey="name"
                                width={135}
                                tick={{
                                  fontSize: 11,
                                  fill: "var(--apple-text, #1d1d1f)",
                                  fontWeight: 500,
                                }}
                              />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const d = payload[0].payload;
                                    return (
                                      <div className="an-custom-tooltip">
                                        <div className="an-tooltip-title">{d.name}</div>
                                        <div className="an-tooltip-value">
                                          <b>{d.applications}</b> applications ({d.percentage}%)
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Bar
                                dataKey="applications"
                                fill="#0071e3"
                                radius={[0, 4, 4, 0]}
                                barSize={14}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="an-chart-placeholder-box">
                          <div className="an-placeholder-center">
                            <div className="an-placeholder-icon-wrap" aria-hidden="true">
                              <BarChart3 size={28} />
                            </div>
                            <p className="an-placeholder-primary-text">Awaiting data from database.</p>
                            <p className="an-placeholder-subtext">Click &ldquo;Fetch Zoning Data&rdquo; above to query live records.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Chart 2: Safe Zone vs Buffer Zone (Donut Chart) */}
                    <div className="an-card an-chart-card">
                      <div className="an-card-header">
                        <div>
                          <h3 className="an-card-title">Safe Zone vs Buffer Zone</h3>
                          <p className="an-card-description">
                            Environmental hazard overlay balancing buildable safe zones against geological and flood buffer corridors.
                          </p>
                        </div>
                        <span className="an-chart-badge">Donut Chart</span>
                      </div>

                      {donutHazardData.length > 0 ? (
                        <div className="an-recharts-donut-wrap">
                          <div className="an-donut-canvas-relative">
                            <ResponsiveContainer width="100%" height={260}>
                              <PieChart>
                                <Pie
                                  data={donutHazardData}
                                  innerRadius={65}
                                  outerRadius={95}
                                  paddingAngle={4}
                                  dataKey="value"
                                  nameKey="name"
                                >
                                  {donutHazardData.map((entry) => (
                                    <Cell key={entry.name} fill={entry.fill} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const d = payload[0].payload;
                                      const totalAssessed = (safeVsBufferStats?.safeCount || 0) + (safeVsBufferStats?.bufferCount || 0) + (safeVsBufferStats?.unassessedCount || 0);
                                      const pct = totalAssessed > 0 ? Math.round((d.value / totalAssessed) * 100) : 0;
                                      return (
                                        <div className="an-custom-tooltip">
                                          <div className="an-tooltip-title">{d.name}</div>
                                          <div className="an-tooltip-value">
                                            <b>{d.value}</b> sites ({pct}%)
                                          </div>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Legend
                                  verticalAlign="bottom"
                                  height={36}
                                  formatter={(value) => (
                                    <span style={{ fontSize: 11.5, color: "var(--apple-text, #1d1d1f)", fontWeight: 500 }}>
                                      {value}
                                    </span>
                                  )}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            {/* Centered Statistic inside Donut */}
                            <div className="an-donut-center-stat" aria-hidden="true">
                              <span className="an-donut-center-pct">
                                {safeVsBufferStats?.safePercent || 0}%
                              </span>
                              <span className="an-donut-center-label">Safe Siting</span>
                            </div>
                          </div>

                          {/* Donut Quick Summary Chips */}
                          <div className="an-donut-summary-row">
                            <div className="an-donut-chip chip-safe">
                              <span>Safe Zones</span>
                              <b>{safeVsBufferStats?.safeCount || 0} Sites</b>
                            </div>
                            <div className="an-donut-chip chip-buffer">
                              <span>Buffer Zones</span>
                              <b>{safeVsBufferStats?.bufferCount || 0} Sites</b>
                            </div>
                            <div className="an-donut-chip chip-unassessed">
                              <span>Awaiting Pin</span>
                              <b>{safeVsBufferStats?.unassessedCount || 0} Sites</b>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="an-chart-placeholder-box">
                          <div className="an-placeholder-center">
                            <div className="an-placeholder-icon-wrap" aria-hidden="true">
                              <PieIcon size={28} />
                            </div>
                            <p className="an-placeholder-primary-text">Insufficient data.</p>
                            <p className="an-placeholder-subtext">Click &ldquo;Fetch Zoning Data&rdquo; above to query live records.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* ── SECTION 4: APPLICATIONS OVER TIME (Line Chart) ─────────────── */}
              {(activeNavTab === "all" || activeNavTab === "trends") && (
                <section className="an-section an-tab-pane" aria-labelledby="section-trends-title">
                  <div className="an-card an-trends-card">
                    <div className="an-card-header">
                      <div>
                        <h2 id="section-trends-title" className="an-card-title">
                          Applications Over Time
                        </h2>
                        <p className="an-card-description">
                          Monthly application trends tracking submission trajectory, seasonal surges, and intake velocity.
                        </p>
                      </div>
                      <div className="an-trends-meta-header">
                        <span className="an-chart-badge">Line Chart View</span>
                        <button
                          type="button"
                          className="an-section-fetch-btn"
                          onClick={() => handleFetchSection("trends")}
                          disabled={fetchingSection.trends}
                          title="Refresh monthly application trajectory"
                        >
                          <RefreshCw size={12} className={fetchingSection.trends ? "an-spin" : ""} />
                          <span>{fetchingSection.trends ? "Syncing..." : "Fetch Trends"}</span>
                        </button>
                      </div>
                    </div>

                    {monthlyTrendsData.length > 0 ? (
                      <div className="an-line-chart-wrapper">
                        <div className="an-trends-stats-banner">
                          <div className="an-trend-metric">
                            <span className="an-trend-metric-label">Tracked Timeframe</span>
                            <span className="an-trend-metric-value">
                              {monthlyTrendsData[0]?.monthLabel} — {monthlyTrendsData[monthlyTrendsData.length - 1]?.monthLabel}
                            </span>
                          </div>
                          <div className="an-trend-metric">
                            <span className="an-trend-metric-label">Peak Submission Period</span>
                            <span className="an-trend-metric-value">
                              {(() => {
                                const peak = [...monthlyTrendsData].sort((a, b) => b.applications - a.applications)[0];
                                return peak ? `${peak.monthLabel} (${peak.applications} apps)` : "N/A";
                              })()}
                            </span>
                          </div>
                          <div className="an-trend-metric">
                            <span className="an-trend-metric-label">Total Submissions Logged</span>
                            <span className="an-trend-metric-value">{totalApplications} Applications</span>
                          </div>
                        </div>

                        <ResponsiveContainer width="100%" height={280}>
                          <LineChart
                            data={monthlyTrendsData}
                            margin={{ top: 15, right: 30, left: 10, bottom: 10 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                            <XAxis
                              dataKey="monthLabel"
                              tick={{ fontSize: 12, fill: "var(--apple-text-secondary, #6e6e73)" }}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fontSize: 12, fill: "var(--apple-text-secondary, #6e6e73)" }}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const d = payload[0].payload;
                                  return (
                                    <div className="an-custom-tooltip">
                                      <div className="an-tooltip-title">{d.monthLabel}</div>
                                      <div className="an-tooltip-value">
                                        <b>{d.applications}</b> applications submitted
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="applications"
                              name="Applications"
                              stroke="#0071e3"
                              strokeWidth={3}
                              dot={{ r: 5, fill: "#0071e3", strokeWidth: 2, stroke: "#ffffff" }}
                              activeDot={{ r: 7, fill: "#0071e3" }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="an-chart-placeholder-box">
                        <div className="an-placeholder-center">
                          <div className="an-placeholder-icon-wrap" aria-hidden="true">
                            <TrendingUp size={28} />
                          </div>
                          <p className="an-placeholder-primary-text">No monthly application records found.</p>
                          <p className="an-placeholder-subtext">Click &ldquo;Fetch Trends&rdquo; to load historical timeline from database.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── SECTION 5: LGU TRANSPARENCY (Municipal Projects Table) ──────── */}
              {(activeNavTab === "all" || activeNavTab === "transparency") && (
                <section className="an-section an-tab-pane" aria-labelledby="section-transparency-title">
                  <div className="an-card an-transparency-card">
                    <div className="an-card-header">
                      <div>
                        <h2 id="section-transparency-title" className="an-card-title">
                          LGU Transparency
                        </h2>
                        <p className="an-card-description">
                          Municipal capital projects, public infrastructure tenders, and general contractor disclosure records.
                        </p>
                      </div>
                      <div className="an-transparency-meta">
                        <span className="an-badge-count">
                          {municipalProjectsList.length} Encoded Projects
                        </span>
                        <button
                          type="button"
                          className="an-section-fetch-btn"
                          onClick={() => handleFetchSection("transparency")}
                          disabled={fetchingSection.transparency}
                          title="Query public works registry"
                        >
                          <RefreshCw size={12} className={fetchingSection.transparency ? "an-spin" : ""} />
                          <span>{fetchingSection.transparency ? "Querying..." : "Fetch Municipal Projects"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Table with Headers and Live Data / Empty State */}
                    <div className="an-table-wrapper">
                      <table className="an-transparency-table">
                        <thead>
                          <tr>
                            <th scope="col" className="col-project">Project Name</th>
                            <th scope="col" className="col-barangay">Barangay</th>
                            <th scope="col" className="col-contractor">Contractor</th>
                            <th scope="col" className="col-budget text-right">Budget (₱)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {municipalProjectsList.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="an-table-empty-row">
                                <div className="an-table-empty-content">
                                  <div className="an-table-empty-icon" aria-hidden="true">
                                    <FolderArchive size={26} />
                                  </div>
                                  <span className="an-table-empty-title">
                                    No public projects encoded.
                                  </span>
                                  <span className="an-table-empty-desc">
                                    Public infrastructure expenditures will be displayed here once registered in the municipal registry.
                                  </span>
                                  <button
                                    type="button"
                                    className="an-table-query-btn"
                                    onClick={() => handleFetchSection("transparency")}
                                  >
                                    <RefreshCw size={12} />
                                    <span>Re-check Public Registry</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            municipalProjectsList.map((project, idx) => (
                              <tr key={project.id || idx}>
                                <td className="font-medium">{project.projectName}</td>
                                <td>{project.barangay}</td>
                                <td>{project.contractor}</td>
                                <td className="text-right">
                                  ₱{Number(project.budget || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
