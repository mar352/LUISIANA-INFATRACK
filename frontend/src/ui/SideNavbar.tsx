import React, { useEffect, useState } from "react";
import { fetchCitizenApplications } from "../lib/api";
import { restoreSession } from "../services/auth";
import { useTranslation, LanguageToggle } from "./LanguageToggle";
import { AddLguProjectModal } from "./AddLguProjectModal";
import "./SideNavbar.css";

export type NavScreenId =
  | "permits"
  | "documents"
  | "engineer_documents"
  | "analytics"
  | "audit"
  | "app"
  | string;

export interface SideNavbarProps {
  currentScreen: NavScreenId;
  onNavigate?: (screen: NavScreenId) => void;
  approvedDocsCount?: number;
  className?: string;
  title?: string;
  currentRole?: string;
}

export interface NavItemDef {
  id: NavScreenId;
  label: string;
  badge?: string | number | null;
  tooltip: string;
  isMap?: boolean;
  icon: (active: boolean) => React.ReactNode;
}

export const SideNavbar: React.FC<SideNavbarProps> = ({
  currentScreen,
  onNavigate,
  approvedDocsCount,
  className = "",
  title = "Pangunahing Menu",
  currentRole,
}) => {
  const { t, language } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("infatrack_side_nav_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [docCount, setDocCount] = useState<number>(approvedDocsCount ?? 0);
  const [pendingAppsCount, setPendingAppsCount] = useState<number>(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAddLguModalOpen, setIsAddLguModalOpen] = useState(false);

  useEffect(() => {
    restoreSession()
      .then((s) => {
        setCurrentUser(s);
        if (s?.role === "Super Admin" || s?.username === "mpdc_admin" || s?.role === "MPDC Admin") {
          setIsAdmin(true);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof approvedDocsCount === "number") {
      setDocCount(approvedDocsCount);
    }

    let cancelled = false;
    fetchCitizenApplications()
      .then((apps) => {
        if (cancelled || !Array.isArray(apps)) return;
        let count = 0;
        let pCount = 0;
        for (const a of apps) {
          if (a.approvedDocs && typeof a.approvedDocs === "object") {
            count += Object.keys(a.approvedDocs).length;
          } else if (a.status === "approved" || a.status === "completed") {
            count += 6;
          }
          const st = a.status || "submitted";
          if (st === "submitted" || st === "ocular_inspection" || st === "in_review") {
            pCount++;
          }
        }
        if (typeof approvedDocsCount !== "number") {
          setDocCount(count);
        }
        setPendingAppsCount(pCount);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [approvedDocsCount]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("infatrack_side_nav_collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const userRole = currentUser?.role || currentRole;
  const isMpdc = userRole === "MPDC" || currentUser?.username === "mpdc" || currentUser?.username === "mpdc_admin" || userRole === "MPDC Admin";
  const isMpdcAdmin = isAdmin || currentUser?.username === "mpdc_admin" || userRole === "MPDC Admin";
  const isEngineer = userRole === "Engineer" || userRole === "Private Engineer" || currentUser?.username === "engineer" || currentUser?.username === "pengineer";

  const canAddLguProject = Boolean(
    currentUser &&
    (currentUser.role === "MPDC" ||
     currentUser.role === "MPDC Admin" ||
     currentUser.role === "Engineer" ||
     currentUser.role === "Super Admin" ||
     currentUser.username === "mpdc" ||
     currentUser.username === "mpdc_admin" ||
     currentUser.username === "engineer")
  );

  useEffect(() => {
    const handleOpen = () => {
      if (canAddLguProject) {
        setIsAddLguModalOpen(true);
      }
    };
    window.addEventListener("open-add-lgu-project", handleOpen);
    return () => window.removeEventListener("open-add-lgu-project", handleOpen);
  }, [canAddLguProject]);

  const navItems: NavItemDef[] = [
    // MPDC-Only Modules (Strictly forbidden for Engineering Office per RBAC)
    ...(!isEngineer
      ? [
          {
            id: "permits",
            label: isMpdcAdmin ? t("nav.permits_registry") : t("nav.permits"),
            badge: pendingAppsCount > 0 ? pendingAppsCount : null,
            tooltip: isMpdcAdmin
              ? t("nav.permits_reg_tooltip")
              : t("nav.permits_tooltip"),
            icon: (active: boolean) => (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? "2.3" : "2"}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            ),
          },
          {
            id: "documents",
            label: t("nav.mpdc_documents"),
            badge: docCount > 0 ? docCount : null,
            tooltip: `${t("nav.mpdc_docs_tooltip")} (${docCount} files)`,
            icon: (active: boolean) => (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? "2.3" : "2"}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            ),
          },
          {
            id: "analytics",
            label: t("nav.analytics"),
            tooltip: t("nav.analytics_tooltip"),
            icon: (active: boolean) => (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? "2.3" : "2"}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            ),
          },
        ]
      : []),
    {
      id: "audit",
      label: t("nav.audit"),
      tooltip: t("nav.audit_tooltip"),
      icon: (active) => (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={active ? "2.3" : "2"}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    // Engineering Dashboard & 3D Mapa for Engineers and Admins.
    ...(!isMpdc && (isEngineer || isAdmin)
      ? [
          {
            id: "engineer_dashboard",
            label: t("nav.command_center"),
            tooltip: language === "en" ? "Municipal Engineering Office (Executive Dashboard & Inspection Queue)" : "Tanggapan ng Inhinyero (Executive Engineering Dashboard & Site Inspection Queue)",
            icon: (active: boolean) => (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? "2.3" : "2"}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 20h20" />
                <path d="M5 20V8l7-5 7 5v12" />
                <rect x="9" y="12" width="6" height="8" />
              </svg>
            ),
          },
          {
            id: "engineer_documents",
            label: t("nav.documents"),
            tooltip: language === "en" ? "Engineering Documents & Blueprints Vault (O.R. Receipts, Blueprints, & Clearances)" : "Engineering Documents & Blueprints Vault (Opisyal na Resibo O.R., Blueprints, at Clearances)",
            icon: (active: boolean) => (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? "2.3" : "2"}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            ),
          },
          {
            id: "app",
            label: t("nav.map_3d"),
            tooltip: language === "en" ? "Open 3D Cesium GIS Globe Map & Situation Dashboard" : "Buksan ang 3D Cesium GIS Globe Mapa & Situation Dashboard (Pang-Engineer Lamang)",
            isMap: true,
            icon: (active: boolean) => (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? "2.3" : "2"}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
            ),
          },
        ]
      : []),
    ...(isAdmin || currentScreen === "admin_users" || currentScreen === "mpdc_admin"
      ? [
          {
            id: isMpdcAdmin ? "mpdc_admin" : "admin_users",
            label: isMpdcAdmin ? t("nav.mpdc_admin") : t("nav.admin_panel"),
            tooltip: isMpdcAdmin ? t("nav.mpdc_admin_tooltip") : t("nav.admin_panel_tooltip"),
            icon: (active: boolean) => (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? "2.3" : "2"}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            ),
          },
        ]
      : []),
  ];

  const handleItemClick = (item: NavItemDef) => {
    if (onNavigate) {
      if (item.id === "app" && isMpdc) {
        // Hard security block: MPDC has ZERO access to 3D map
        return;
      }
      if ((item.id === "permits" || item.id === "documents" || item.id === "analytics") && isEngineer) {
        // Hard security block: Engineering has ZERO access to MPDC modules per RBAC
        return;
      }
      if ((item.id === "admin_users" || item.id === "mpdc_admin") && isMpdcAdmin) {
        onNavigate("mpdc_admin");
      } else {
        onNavigate(item.id);
      }
    }
  };

  return (
    <>
      <aside
      className={`app-side-navbar ${isCollapsed ? "is-collapsed" : "is-expanded"} ${className}`}
      aria-label="Pangunahing Navigasyon sa Gilid"
      data-testid="app-side-navbar"
    >
      {/* Sidebar Header Section (Under main header) */}
      <div className="side-nav-header">
        <div className="side-nav-header-info">
          <span className="side-nav-kicker">{isEngineer ? (language === "en" ? "ENGINEERING" : "INHINYERO") : "INFATRACK"}</span>
          <h2 className="side-nav-heading">{isEngineer ? (language === "en" ? "Office of the Engineer" : "Tanggapan ng Inhinyero") : (language === "en" ? "Main Menu" : title)}</h2>
        </div>
        <button
          type="button"
          className="side-nav-collapse-btn"
          onClick={toggleCollapse}
          title={isCollapsed ? t("nav.expand_sidebar", "I-expand ang side navbar") : t("nav.collapse_sidebar", "I-collapse ang side navbar")}
          aria-label={isCollapsed ? t("nav.expand_sidebar", "I-expand ang side navbar") : t("nav.collapse_sidebar", "I-collapse ang side navbar")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="side-nav-chevron"
          >
            {isCollapsed ? (
              <polyline points="9 18 15 12 9 6" />
            ) : (
              <polyline points="15 18 9 12 15 6" />
            )}
          </svg>
        </button>
      </div>

      {/* Button List */}
      <nav className="side-nav-list" role="navigation">
        {/* Quick Action: Encode LGU Project (Strictly MPDC and Engineering Staff Only) */}
        {canAddLguProject && (
          <button
            type="button"
            id="nav-side-add-lgu-project"
            className="side-nav-item side-nav-item-action"
            onClick={() => setIsAddLguModalOpen(true)}
            title={language === "en" ? "Add LGU Project" : "Mag-encode ng Proyekto"}
            aria-label={language === "en" ? "Add LGU Project" : "Mag-encode ng Proyekto"}
          >
            <span className="side-nav-icon">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span className="side-nav-label">
              <span>{language === "en" ? "Add LGU Project" : "Mag-encode ng Proyekto"}</span>
            </span>
          </button>
        )}

        {navItems.map((item) => {
          const isActive = currentScreen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              id={`nav-side-${item.id}`}
              className={`side-nav-item ${isActive ? "active" : ""} ${item.isMap ? "side-nav-map" : ""}`}
              onClick={() => handleItemClick(item)}
              title={item.tooltip}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="side-nav-icon">{item.icon(isActive)}</span>
              <span className="side-nav-label">
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge !== null && (
                  <span className="side-nav-badge">({item.badge})</span>
                )}
              </span>
              {isActive && <span className="side-nav-active-pip" aria-hidden="true" />}
            </button>
          );
        })}
      </nav>

      {/* Footer / Language Selector & System Status */}
      <div className="side-nav-footer">
        {!isCollapsed && (
          <div className="side-nav-lang-row">
            <LanguageToggle />
          </div>
        )}
        <div className="side-nav-status">
          <span className="side-nav-status-dot" />
          <span className="side-nav-status-text">
            {isEngineer ? (language === "en" ? "ENGINEERING LUISIANA" : "INHINYERO LUISIANA") : isMpdcAdmin ? "MPDC ADMIN" : "MPDC LUISIANA"}
          </span>
        </div>
      </div>
    </aside>

    {/* ── Internal Add LGU Project Form Modal ── */}
    <AddLguProjectModal
      isOpen={isAddLguModalOpen}
      onClose={() => setIsAddLguModalOpen(false)}
      currentSession={currentUser}
      currentRole={userRole}
      onSuccess={(newProject) => {
        setIsAddLguModalOpen(false);
        window.dispatchEvent(new CustomEvent("lgu-project-added", { detail: newProject }));
        if (onNavigate) {
          onNavigate("app");
        }
      }}
    />
  </>
  );
};

export default SideNavbar;
