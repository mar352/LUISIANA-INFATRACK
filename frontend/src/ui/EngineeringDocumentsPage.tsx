import React, { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../services/auth";
import { BARANGAY_LIST } from "../types";
import { backendUrl, fetchCitizenApplications } from "../lib/api";
import { ThemeToggle } from "./ThemeToggle";
import { InSystemDocModal } from "./InSystemDocViewer";
import { useTranslation, LanguageToggle } from "./LanguageToggle";
import "./EngineeringDocumentsPage.css";

interface EngineeringDocumentsPageProps {
  onBack?: () => void;
  session: SessionUser | null;
  onNavigate?: (screen: string) => void;
  onNavigateToMap?: (projId?: string, lat?: number, lon?: number) => void;
  onLogout?: () => void;
  hideHeader?: boolean;
}

export interface EngDocItem {
  id: string;
  category: "receipt" | "blueprint" | "zoning" | "clearance" | "other";
  categoryLabel: string;
  name: string;
  url: string;
  uploadedAt?: string;
  verified?: boolean;
}

export interface EngApplicantDossier {
  id: string;
  trackingNumber: string;
  applicantName: string;
  contactNumber: string;
  barangay: string;
  buildingType: string;
  projectTitle: string;
  status: string;
  submittedAt: string;
  orNumber?: string;
  orDate?: string;
  orAmount?: number;
  hasReceipt: boolean;
  engineerApproved: boolean;
  documents: EngDocItem[];
}

/* ── Crisp Vector SVG Icons ────────────────────────────────────────────────── */
const IconMapPin: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconReceipt: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" />
    <line x1="8" y1="7" x2="16" y2="7" />
    <line x1="8" y1="11" x2="16" y2="11" />
    <line x1="8" y1="15" x2="13" y2="15" />
  </svg>
);

const IconBlueprint: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="3 20 21 20 21 4 3 20" />
    <line x1="9" y1="15" x2="15" y2="15" />
    <line x1="15" y1="9" x2="15" y2="15" />
  </svg>
);

const IconClearance: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const IconZoning: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const IconFileDoc: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);

const IconClock: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconCheck: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconEye: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconChevronDown: React.FC<{ size?: number }> = ({ size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconChevronUp: React.FC<{ size?: number }> = ({ size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const IconDownload: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconClose: React.FC<{ size?: number }> = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconFiles: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const renderCategoryIcon = (category: string, size = 12) => {
  switch (category) {
    case "receipt":
      return <IconReceipt size={size} />;
    case "blueprint":
      return <IconBlueprint size={size} />;
    case "clearance":
      return <IconClearance size={size} />;
    case "zoning":
      return <IconZoning size={size} />;
    default:
      return <IconFileDoc size={size} />;
  }
};

export const EngineeringDocumentsPage: React.FC<EngineeringDocumentsPageProps> = ({
  onBack,
  session,
  onNavigate,
  onNavigateToMap,
  onLogout,
  hideHeader = false,
}) => {
  const { t, language } = useTranslation();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | "receipt" | "blueprint" | "clearance" | "zoning">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "with_receipt" | "approved" | "pending">("all");
  const [viewingDoc, setViewingDoc] = useState<{ url: string; name: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const apps = await fetchCitizenApplications();
      if (Array.isArray(apps)) {
        setApplications(apps);
      }
    } catch (err) {
      console.error("Failed to fetch engineering applications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Transform citizen applications into Engineering Dossiers
  const dossiers: EngApplicantDossier[] = useMemo(() => {
    return applications.map((app) => {
      const tracking = app.trackingNumber || app.id || "TRK-UNKNOWN";
      const applicantName = app.applicant?.fullName || app.applicantName || "Hindi Tukoy na Aplikante";
      const bgy = app.applicant?.barangay || app.barangay || "Poblacion";
      const bldgType = app.project?.type || app.projectType || app.buildingType || "Residential";
      const projectTitle = app.project?.title || app.projectTitle || `Konstruksyon ni ${applicantName}`;

      const orNum = app.payment?.orNumber || app.payment?.or_number || app.or_number || "";
      const orDate = app.payment?.paymentDate || app.payment?.orDate || app.or_date || "";
      const orAmount = app.payment?.amount || app.payment?.amountPaid || 0;
      const receiptUrl = app.payment?.receiptUrl || app.payment?.receipt_url || app.or_file_url || "";
      const hasReceipt = Boolean(receiptUrl || orNum);

      const docs: EngDocItem[] = [];

      // 1. Official Receipt (O.R.)
      if (receiptUrl) {
        docs.push({
          id: `${tracking}-receipt`,
          category: "receipt",
          categoryLabel: "Opisyal na Resibo (O.R.)",
          name: orNum ? `Resibo (O.R. #${orNum})` : "Opisyal na Resibo ng Bayad",
          url: receiptUrl.startsWith("http") || receiptUrl.startsWith("blob:") ? receiptUrl : backendUrl(receiptUrl),
          uploadedAt: orDate || app.updatedAt,
          verified: Boolean(app.engineerApproved || app.status === "approved_for_construction"),
        });
      }

      // 2. Attached Application Documents (Blueprints, Plans, TCT)
      if (app.documents && typeof app.documents === "object") {
        Object.entries(app.documents).forEach(([key, val]: [string, any]) => {
          if (!val) return;
          const urlStr = typeof val === "string" ? val : val.url || val.fileUrl;
          if (!urlStr) return;

          const resolvedUrl = urlStr.startsWith("http") || urlStr.startsWith("blob:") ? urlStr : backendUrl(urlStr);
          const lowerKey = key.toLowerCase();

          if (lowerKey.includes("blueprint") || lowerKey.includes("plan") || lowerKey.includes("building") || lowerKey.includes("structural") || lowerKey.includes("architectural")) {
            docs.push({
              id: `${tracking}-${key}`,
              category: "blueprint",
              categoryLabel: "Building Plan / Blueprint",
              name: val.name || val.fileName || `Plano ng Gusali (${key})`,
              url: resolvedUrl,
              uploadedAt: app.createdAt,
            });
          } else if (lowerKey.includes("zoning") || lowerKey.includes("clearance") || lowerKey.includes("cert")) {
            docs.push({
              id: `${tracking}-${key}`,
              category: "zoning",
              categoryLabel: "Zoning Clearance Certificate",
              name: val.name || val.fileName || "Zoning Clearance Certificate",
              url: resolvedUrl,
              uploadedAt: app.createdAt,
            });
          } else {
            docs.push({
              id: `${tracking}-${key}`,
              category: "other",
              categoryLabel: "Supporting Document",
              name: val.name || val.fileName || key,
              url: resolvedUrl,
              uploadedAt: app.createdAt,
            });
          }
        });
      }

      // 3. Approved Clearance Certificate if issued by Engineer
      if (app.clearanceCertificateUrl) {
        const certUrl = app.clearanceCertificateUrl.startsWith("http") || app.clearanceCertificateUrl.startsWith("blob:")
          ? app.clearanceCertificateUrl
          : backendUrl(app.clearanceCertificateUrl);
        docs.push({
          id: `${tracking}-eng-cert`,
          category: "clearance",
          categoryLabel: "Engineering Inspection Clearance",
          name: `Sertipiko ng Inhinyero (${tracking})`,
          url: certUrl,
          uploadedAt: app.engineerApprovedAt || app.updatedAt,
          verified: true,
        });
      }

      return {
        id: app.id || tracking,
        trackingNumber: tracking,
        applicantName,
        contactNumber: app.applicant?.contactNumber || app.applicant?.phone || "—",
        barangay: bgy,
        buildingType: bldgType,
        projectTitle,
        status: app.status || "submitted",
        submittedAt: app.createdAt || new Date().toISOString(),
        orNumber: orNum,
        orDate,
        orAmount,
        hasReceipt,
        engineerApproved: Boolean(app.engineerApproved || app.status === "approved_for_construction"),
        documents: docs,
      };
    });
  }, [applications]);

  // Statistics calculation
  const stats = useMemo(() => {
    const totalDossiers = dossiers.length;
    let totalReceipts = 0;
    let totalBlueprints = 0;
    let totalClearances = 0;

    dossiers.forEach((d) => {
      d.documents.forEach((doc) => {
        if (doc.category === "receipt") totalReceipts++;
        if (doc.category === "blueprint") totalBlueprints++;
        if (doc.category === "clearance") totalClearances++;
      });
    });

    return { totalDossiers, totalReceipts, totalBlueprints, totalClearances };
  }, [dossiers]);

  // Filtered dossiers based on user search and filters
  const filteredDossiers = useMemo(() => {
    return dossiers.filter((d) => {
      // Barangay filter
      if (selectedBarangay && d.barangay !== selectedBarangay) return false;

      // Status filter
      if (statusFilter === "with_receipt" && !d.hasReceipt) return false;
      if (statusFilter === "approved" && !d.engineerApproved) return false;
      if (statusFilter === "pending" && d.engineerApproved) return false;

      // Category filter: must have at least one document of this category
      if (activeCategory !== "all") {
        const hasCat = d.documents.some((doc) => doc.category === activeCategory);
        if (!hasCat) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTrack = d.trackingNumber.toLowerCase().includes(q);
        const matchesName = d.applicantName.toLowerCase().includes(q);
        const matchesOr = (d.orNumber || "").toLowerCase().includes(q);
        const matchesBgy = d.barangay.toLowerCase().includes(q);
        const matchesProject = d.projectTitle.toLowerCase().includes(q);

        if (!matchesTrack && !matchesName && !matchesOr && !matchesBgy && !matchesProject) {
          return false;
        }
      }

      return true;
    });
  }, [dossiers, selectedBarangay, statusFilter, activeCategory, searchQuery]);

  return (
    <div className={hideHeader ? "eng-docs-embedded" : "eng-docs-root"}>
      {/* ── Top Header Navigation (Only shown when not embedded) ───────── */}
      {!hideHeader && (
        <header className="eng-docs-nav">
          <div className="eng-docs-nav-left">
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
                  {t("docs.title")}
                </h1>
              </div>
            </div>
          </div>

          <div className="eng-docs-nav-right">
            {onNavigateToMap && (
              <button
                type="button"
                className="eng-docs-btn eng-docs-btn-map"
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
            )}

            {onNavigate && (
              <button
                type="button"
                className="eng-docs-btn eng-docs-btn-dash"
                onClick={() => onNavigate("engineer_dashboard")}
                title={t("nav.command_center")}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
                <span>Executive Dashboard</span>
              </button>
            )}

            <div className="eng-docs-separator" />
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
                className="eng-docs-btn eng-docs-btn-ghost"
                onClick={onLogout}
                title={t("common.logout")}
              >
                <span>{t("common.logout")}</span>
              </button>
            )}
          </div>
        </header>
      )}

      {/* ── Subheader Banner & KPI Counters ─────────────────────────────── */}
      <section className="eng-docs-kpi-bar">
        <div className="eng-docs-kpi-card">
          <span className="eng-docs-kpi-label">{t("docs.kpi_total")}</span>
          <span className="eng-docs-kpi-val">{stats.totalDossiers}</span>
          <span className="eng-docs-kpi-sub">{t("docs.kpi_total_sub")}</span>
        </div>
        <div className="eng-docs-kpi-card">
          <span className="eng-docs-kpi-label">{t("docs.kpi_receipts")}</span>
          <span className="eng-docs-kpi-val kpi-accent-receipt">{stats.totalReceipts}</span>
          <span className="eng-docs-kpi-sub">{t("docs.kpi_receipts_sub")}</span>
        </div>
        <div className="eng-docs-kpi-card">
          <span className="eng-docs-kpi-label">{t("docs.kpi_blueprints")}</span>
          <span className="eng-docs-kpi-val kpi-accent-blueprint">{stats.totalBlueprints}</span>
          <span className="eng-docs-kpi-sub">{t("docs.kpi_blueprints_sub")}</span>
        </div>
        <div className="eng-docs-kpi-card">
          <span className="eng-docs-kpi-label">{t("docs.kpi_clearances")}</span>
          <span className="eng-docs-kpi-val kpi-accent-clearance">{stats.totalClearances}</span>
          <span className="eng-docs-kpi-sub">{t("docs.kpi_clearances_sub")}</span>
        </div>
      </section>

      {/* ── Filter & Search Toolbar ─────────────────────────────────────── */}
      <div className="eng-docs-toolbar">
        <div className="eng-docs-search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder={t("docs.search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" className="eng-docs-clear-search" onClick={() => setSearchQuery("")}>
              <IconClose size={11} />
            </button>
          )}
        </div>

        <div className="eng-docs-filter-group">
          <select
            className="eng-docs-select"
            value={selectedBarangay}
            onChange={(e) => setSelectedBarangay(e.target.value)}
            title="Piliin ang Barangay"
          >
            <option value="">Lahat ng Barangay (23)</option>
            {BARANGAY_LIST.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          <select
            className="eng-docs-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            title="Piliin ang Katayuan ng Aplikasyon"
          >
            <option value="all">Lahat ng Katayuan</option>
            <option value="with_receipt">May Resibo ng Bayad (O.R.)</option>
            <option value="approved">Naaprubahan para sa Konstruksyon</option>
            <option value="pending">Nakatakda sa Inspeksyon</option>
          </select>
        </div>
      </div>

      {/* ── Category Pill Filters ───────────────────────────────────────── */}
      <div className="eng-docs-category-tabs">
        <button
          type="button"
          className={`eng-cat-pill${activeCategory === "all" ? " is-active" : ""}`}
          onClick={() => setActiveCategory("all")}
        >
          <IconFiles size={13} />
          <span>{t("docs.cat_all")}</span>
        </button>
        <button
          type="button"
          className={`eng-cat-pill${activeCategory === "receipt" ? " is-active" : ""}`}
          onClick={() => setActiveCategory("receipt")}
        >
          <IconReceipt size={13} />
          <span>{t("docs.cat_receipts")}</span>
        </button>
        <button
          type="button"
          className={`eng-cat-pill${activeCategory === "blueprint" ? " is-active" : ""}`}
          onClick={() => setActiveCategory("blueprint")}
        >
          <IconBlueprint size={13} />
          <span>{t("docs.cat_blueprints")}</span>
        </button>
        <button
          type="button"
          className={`eng-cat-pill${activeCategory === "clearance" ? " is-active" : ""}`}
          onClick={() => setActiveCategory("clearance")}
        >
          <IconClearance size={13} />
          <span>{t("docs.cat_clearance")}</span>
        </button>
        <button
          type="button"
          className={`eng-cat-pill${activeCategory === "zoning" ? " is-active" : ""}`}
          onClick={() => setActiveCategory("zoning")}
        >
          <IconZoning size={13} />
          <span>{t("docs.cat_zoning")}</span>
        </button>
      </div>

      {/* ── Main Dossier Grid View ──────────────────────────────────────── */}
      <main className="eng-docs-body">
        {loading ? (
          <div className="eng-docs-loading">
            <div className="eng-docs-spinner" />
            <p>{t("common.loading")}</p>
          </div>
        ) : filteredDossiers.length === 0 ? (
          <div className="eng-docs-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <h3>{language === "en" ? "No Documents Found" : "Walang Natagpuang Dokumento"}</h3>
            <p>{language === "en" ? "Try adjusting your filters or search by tracking number or applicant." : "Subukang baguhin ang mga filter o maghanap ng ibang tracking number o aplikante."}</p>
          </div>
        ) : (
          <div className="eng-table-wrap">
            <table className="eng-docs-table">
              <thead>
                <tr>
                  <th style={{ width: "26%" }}>{t("docs.col_dossier")}</th>
                  <th style={{ width: "15%" }}>{t("common.barangay")}</th>
                  <th style={{ width: "18%" }}>{t("docs.col_receipt")}</th>
                  <th style={{ width: "23%" }}>{t("docs.col_files")}</th>
                  <th style={{ width: "11%" }}>{t("docs.col_status")}</th>
                  <th style={{ width: "7%", textAlign: "right" }}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredDossiers.map((dossier) => {
                  const isExpanded = expandedId === dossier.id;
                  const matchingDocs = dossier.documents.filter(
                    (doc) => activeCategory === "all" || doc.category === activeCategory
                  );
                  const receiptDoc = dossier.documents.find((d) => d.category === "receipt");

                  return (
                    <React.Fragment key={dossier.id}>
                      <tr
                        className={`eng-table-row${isExpanded ? " is-row-expanded" : ""}`}
                        onClick={() => setExpandedId(isExpanded ? null : dossier.id)}
                      >
                        {/* Aplikante & Tracking */}
                        <td className="td-applicant">
                          <div className="eng-cell-applicant">
                            <div className="eng-tracking-meta-row">
                              <span className="eng-list-trk">{dossier.trackingNumber}</span>
                              <span className="eng-list-bldg-badge">{dossier.buildingType}</span>
                            </div>
                            <strong className="eng-list-name">{dossier.applicantName}</strong>
                            {dossier.projectTitle && (
                              <span className="eng-list-project-sub" title={dossier.projectTitle}>
                                {dossier.projectTitle}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Barangay */}
                        <td className="td-barangay">
                          <div className="eng-cell-bgy">
                            <span className="eng-bgy-pin"><IconMapPin size={13} /></span>
                            <span className="eng-bgy-text">Brgy. {dossier.barangay}</span>
                          </div>
                        </td>

                        {/* Official Receipt (O.R.) */}
                        <td className="td-receipt">
                          {dossier.hasReceipt ? (
                            <div className="eng-cell-rcpt">
                              {receiptDoc ? (
                                <button
                                  type="button"
                                  className="eng-rcpt-pill-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingDoc({ url: receiptDoc.url, name: receiptDoc.name });
                                  }}
                                  title="I-click upang suriin ang opisyal na resibo"
                                >
                                  <span className="eng-rcpt-indicator" />
                                  <IconReceipt size={12} />
                                  <span className="eng-rcpt-num">O.R. #{dossier.orNumber || "Walang Tala"}</span>
                                  {dossier.orAmount > 0 && (
                                    <span className="eng-rcpt-amt">₱{Number(dossier.orAmount).toLocaleString()}</span>
                                  )}
                                  <span className="eng-rcpt-eye"><IconEye size={12} /></span>
                                </button>
                              ) : (
                                <span className="eng-rcpt-pill-static">
                                  <span className="eng-rcpt-indicator" />
                                  <IconReceipt size={12} />
                                  <span className="eng-rcpt-num">O.R. #{dossier.orNumber || "Walang Tala"}</span>
                                  {dossier.orAmount > 0 && (
                                    <span className="eng-rcpt-amt">₱{Number(dossier.orAmount).toLocaleString()}</span>
                                  )}
                                </span>
                              )}
                              {dossier.orDate && (
                                <span className="eng-rcpt-date-sub">{dossier.orDate}</span>
                              )}
                            </div>
                          ) : (
                            <span className="eng-rcpt-waiting-pill">
                              <IconClock size={11} />
                              <span>Walang Resibo</span>
                            </span>
                          )}
                        </td>

                        {/* Attached Documents */}
                        <td className="td-docs">
                          {matchingDocs.length === 0 ? (
                            <span className="eng-docs-zero-pill">Walang dokumento</span>
                          ) : (
                            <div className="eng-table-chips-group">
                              {matchingDocs.slice(0, 2).map((doc) => (
                                <button
                                  key={doc.id}
                                  type="button"
                                  className={`eng-table-doc-chip cat-${doc.category}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingDoc({ url: doc.url, name: doc.name });
                                  }}
                                  title={`Suriin sa viewer: ${doc.name}`}
                                >
                                  <span className="eng-chip-icon">
                                    {renderCategoryIcon(doc.category, 12)}
                                  </span>
                                  <span className="eng-chip-text">{doc.name}</span>
                                </button>
                              ))}
                              {matchingDocs.length > 2 && (
                                <span className="eng-table-more-chip">
                                  +{matchingDocs.length - 2} pa
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="td-status">
                          {dossier.engineerApproved ? (
                            <span className="eng-table-status-pill is-approved">
                              <IconCheck size={11} />
                              <span>Naaprubahan</span>
                            </span>
                          ) : dossier.hasReceipt ? (
                            <span className="eng-table-status-pill is-receipt">
                              <IconCheck size={11} />
                              <span>May Resibo</span>
                            </span>
                          ) : (
                            <span className="eng-table-status-pill is-pending">
                              <IconClock size={11} />
                              <span>Naghihintay</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="td-actions" style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className={`eng-table-expand-btn${isExpanded ? " active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(isExpanded ? null : dossier.id);
                            }}
                            title={isExpanded ? "Itago ang mga detalye" : "Tingnan ang lahat ng detalye at dokumento"}
                          >
                            <span>{isExpanded ? "Itago" : "Detalye"}</span>
                            <span className="eng-expand-icon">
                              {isExpanded ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}
                            </span>
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Details Drawer Row */}
                      {isExpanded && (
                        <tr className="eng-drawer-tr">
                          <td colSpan={6}>
                            <div className="eng-drawer-box">
                              <div className="eng-drawer-grid">
                                {/* Left Info Column */}
                                <div className="eng-drawer-meta-col">
                                  <h4 className="eng-drawer-subtitle">
                                    Impormasyon ng Aplikante &amp; Konstruksyon
                                  </h4>
                                  <div className="eng-drawer-kv-table">
                                    <div className="eng-drawer-kv-row">
                                      <span className="kv-label">Tracking Ref:</span>
                                      <span className="kv-value font-mono font-bold text-accent">{dossier.trackingNumber}</span>
                                    </div>
                                    <div className="eng-drawer-kv-row">
                                      <span className="kv-label">Aplikante:</span>
                                      <span className="kv-value font-semibold">{dossier.applicantName}</span>
                                    </div>
                                    <div className="eng-drawer-kv-row">
                                      <span className="kv-label">Telepono / Kontak:</span>
                                      <span className="kv-value">{dossier.contactNumber}</span>
                                    </div>
                                    <div className="eng-drawer-kv-row">
                                      <span className="kv-label">Lokasyon:</span>
                                      <span className="kv-value">Brgy. {dossier.barangay}, Luisiana</span>
                                    </div>
                                    <div className="eng-drawer-kv-row">
                                      <span className="kv-label">Uri ng Gusali:</span>
                                      <span className="kv-value">{dossier.buildingType}</span>
                                    </div>
                                    <div className="eng-drawer-kv-row">
                                      <span className="kv-label">Proyekto:</span>
                                      <span className="kv-value">{dossier.projectTitle}</span>
                                    </div>
                                  </div>

                                  {/* Receipt Summary Box */}
                                  {dossier.hasReceipt && (
                                    <div className="eng-drawer-receipt-card">
                                      <div className="eng-drawer-rcpt-header">
                                        <span className="eng-drawer-rcpt-icon"><IconReceipt size={14} /></span>
                                        <strong>Opisyal na Resibo (Assessor / Treasury)</strong>
                                      </div>
                                      <div className="eng-drawer-kv-table">
                                        <div className="eng-drawer-kv-row">
                                          <span className="kv-label">O.R. Number:</span>
                                          <span className="kv-value font-mono font-bold">{dossier.orNumber || "Walang Tala"}</span>
                                        </div>
                                        {dossier.orAmount > 0 && (
                                          <div className="eng-drawer-kv-row">
                                            <span className="kv-label">Halagang Binayaran:</span>
                                            <span className="kv-value font-bold text-emerald">₱{Number(dossier.orAmount).toLocaleString()}</span>
                                          </div>
                                        )}
                                        {dossier.orDate && (
                                          <div className="eng-drawer-kv-row">
                                            <span className="kv-label">Petsa ng Resibo:</span>
                                            <span className="kv-value">{dossier.orDate}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Right Attached Documents Column */}
                                <div className="eng-drawer-files-col">
                                  <h4 className="eng-drawer-subtitle">
                                    Lahat ng Dokumento at Blueprints ({dossier.documents.length})
                                  </h4>

                                  {dossier.documents.length === 0 ? (
                                    <div className="eng-drawer-empty-docs">
                                      Walang naka-attach na dokumento para sa aplikasyong ito.
                                    </div>
                                  ) : (
                                    <div className="eng-drawer-files-list">
                                      {dossier.documents.map((doc) => (
                                        <div key={doc.id} className="eng-drawer-file-item">
                                          <div className="eng-drawer-file-left">
                                            <span className="eng-drawer-file-badge">
                                              {renderCategoryIcon(doc.category, 15)}
                                            </span>
                                            <div className="eng-drawer-file-text">
                                              <strong className="eng-drawer-file-name" title={doc.name}>
                                                {doc.name}
                                              </strong>
                                              <span className="eng-drawer-file-cat">{doc.categoryLabel}</span>
                                            </div>
                                          </div>

                                          <div className="eng-drawer-file-actions">
                                            <button
                                              type="button"
                                              className="eng-btn-drawer-view"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setViewingDoc({ url: doc.url, name: doc.name });
                                              }}
                                              title="Suriin ang file"
                                            >
                                              Suriin
                                            </button>
                                            <a
                                              href={doc.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="eng-btn-drawer-dl"
                                              download
                                              title="I-download"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <IconDownload size={13} />
                                            </a>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── Built-in In-System Document Viewer Modal ──────────────────────── */}
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

export default EngineeringDocumentsPage;
