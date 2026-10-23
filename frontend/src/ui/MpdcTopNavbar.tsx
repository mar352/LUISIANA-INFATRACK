import React, { useState, useEffect, useMemo } from "react";
import type { SessionUser } from "../services/auth";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";
import { fetchCitizenApplications } from "../lib/api";
import { fetchProposalsOnce } from "../services/firestore-planning";
import "./MpdcTopNavbar.css";

export type MpdcNotification = {
  id: string;
  source: "application" | "planning";
  kind: "new" | "inspection" | "payment" | "flagged" | "planning" | "approved";
  title: string;
  message: string;
  timestamp: string;
  badge: string;
  trackingNumber?: string;
  applicationId?: string;
  proposalId?: string;
};

export interface MpdcTopNavbarProps {
  title: string;
  subtitle?: string;
  brandPill?: string;
  onBack?: () => void;
  backLabel?: string;
  serviceTag?: string;
  serviceSla?: string;
  lastSyncedAt?: Date | string | number | null;
  unreadCount?: number;
  onOpenNotif?: () => void;
  onNoticeSelect?: (notice: MpdcNotification) => void;
  session?: SessionUser | null;
  userDept?: string;
  onLogout?: () => void;
  extraControls?: React.ReactNode;
  accentClass?: string;
}

function formatRealNotifDate(isoString?: string): string {
  if (!isoString) return "Kamakailan";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "Kamakailan";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Kani-kanina lang";
    if (diffMins < 60) return `${diffMins}m nakalipas`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}o nakalipas`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Kahapon";
    if (diffDays < 7) return `${diffDays} araw nakalipas`;
    return d.toLocaleDateString("tl-PH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Kamakailan";
  }
}

export const MpdcTopNavbar: React.FC<MpdcTopNavbarProps> = ({
  title,
  subtitle = "Municipal Planning & Development Office · Bayan ng Luisiana, Laguna",
  brandPill = "MPDC",
  onBack,
  backLabel = "Bumalik",
  serviceTag,
  serviceSla,
  lastSyncedAt,
  unreadCount: propUnreadCount,
  onOpenNotif,
  onNoticeSelect,
  session,
  userDept = "IT Officer / Admin Aide",
  onLogout,
  extraControls,
  accentClass = "topnav-accent-mpdc",
}) => {
  const [currentTime, setCurrentTime] = useState<string>(() => new Date().toLocaleTimeString());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<"all" | "apps" | "planning">("all");

  const [rawApplications, setRawApplications] = useState<any[]>([]);
  const [rawProposals, setRawProposals] = useState<any[]>([]);

  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("infatrack_mpdc_read_notices") || "[]");
    } catch {
      return [];
    }
  });

  const [dismissedNotifIds, setDismissedNotifIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("infatrack_mpdc_dismissed_notices_v2") || "[]");
    } catch {
      return [];
    }
  });

  // Live ticking clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch applications and proposals for notifications
  const loadNotifData = () => {
    fetchCitizenApplications()
      .then((apps) => {
        if (Array.isArray(apps)) setRawApplications(apps);
      })
      .catch(() => undefined);

    fetchProposalsOnce()
      .then((props) => {
        if (Array.isArray(props)) setRawProposals(props);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    loadNotifData();
    const interval = setInterval(loadNotifData, 10000);

    const onStorageChange = () => {
      try {
        setReadNotifIds(JSON.parse(localStorage.getItem("infatrack_mpdc_read_notices") || "[]"));
        setDismissedNotifIds(JSON.parse(localStorage.getItem("infatrack_mpdc_dismissed_notices_v2") || "[]"));
      } catch {}
    };

    window.addEventListener("infatrack_mpdc_notif_change", onStorageChange);
    window.addEventListener("storage", onStorageChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener("infatrack_mpdc_notif_change", onStorageChange);
      window.removeEventListener("storage", onStorageChange);
    };
  }, []);

  // Assemble full list of MPDC notifications
  const allNotices = useMemo<MpdcNotification[]>(() => {
    const list: MpdcNotification[] = [];

    // 1. Citizen Applications notices
    for (const app of rawApplications) {
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

      // a) Bagong submit na aplikasyon (Hakbang 1)
      if (app.status === "submitted" || app.status === "pending" || !app.status) {
        list.push({
          id: `notif-app-${app.id || app.trackingNumber}-submitted`,
          source: "application",
          kind: "new",
          title: `Bagong Aplikasyon: ${app.trackingNumber || "LUIS-2026"}`,
          message: `${app.applicantName || app.applicant?.fullName || "Aplikante"} · ${app.projectTitle || app.title || "Zoning Permit"}. Isinumite noong ${formatRealNotifDate(subDate)}. Handa para sa paunang pagsusuri.`,
          timestamp: subDate || "",
          badge: "Hakbang 1",
          trackingNumber: app.trackingNumber,
          applicationId: app.id,
        });
      }

      // b) Bayad sa Treasury
      const hasPaid = app.payment?.status === "paid" || Boolean(app.payment?.orNumber);
      if (hasPaid) {
        list.push({
          id: `notif-app-${app.id || app.trackingNumber}-paid-${app.payment?.orNumber || "paid"}`,
          source: "application",
          kind: "payment",
          title: `Bayad sa Treasury: ${app.payment?.orNumber || "O.R. Issued"}`,
          message: `₱${Number(app.payment?.amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })} opisyal na nabayaran noong ${formatRealNotifDate(payDate)} ni ${app.applicantName || app.applicant?.fullName || "Aplikante"} (${app.trackingNumber}).`,
          timestamp: payDate || "",
          badge: "O.R. Resibo",
          trackingNumber: app.trackingNumber,
          applicationId: app.id,
        });
      }

      // c) Nakatakdang Ocular Inspection (Hakbang 2)
      if (app.status === "ocular_inspection" || app.status === "for_ocular_inspection") {
        list.push({
          id: `notif-app-${app.id || app.trackingNumber}-inspection`,
          source: "application",
          kind: "inspection",
          title: `Ocular Inspection: ${app.trackingNumber}`,
          message: `Nakatakdang site visit ng Zoning Officer sa ${app.barangay ? `Brgy. ${app.barangay}` : "Luisiana"} para sa "${app.projectTitle || "Estruktura"}". Petsa: ${formatRealNotifDate(inspDate)}.`,
          timestamp: inspDate || "",
          badge: "Hakbang 2",
          trackingNumber: app.trackingNumber,
          applicationId: app.id,
        });
      }

      // d) Flagged na dokumento
      if (app.status === "flagged") {
        list.push({
          id: `notif-app-${app.id || app.trackingNumber}-flagged`,
          source: "application",
          kind: "flagged",
          title: `Flagged na Dokumento: ${app.trackingNumber}`,
          message: `May mga dokumentong kailangang palitan o muling i-upload ni ${app.applicantName || app.applicant?.fullName || "Aplikante"}. Na-update noong ${formatRealNotifDate(flagDate)}.`,
          timestamp: flagDate || "",
          badge: "Flagged",
          trackingNumber: app.trackingNumber,
          applicationId: app.id,
        });
      }
    }

    // 2. Planning Proposals notices
    for (const p of rawProposals) {
      const planDate = p.updatedAt || p.createdAt || p.submittedAt;

      if (p.status === "submitted") {
        list.push({
          id: `notif-plan-${p.id}-submitted`,
          source: "planning",
          kind: "planning",
          title: `Bagong Panukala: "${p.title}"`,
          message: `Isinumite noong ${formatRealNotifDate(planDate)} ng ${p.department || "Barangay"}. Handa para sa MPDC review assignment.`,
          timestamp: planDate || "",
          badge: "Planning",
          proposalId: p.id,
        });
      }

      if (p.status === "recommended") {
        list.push({
          id: `notif-plan-${p.id}-recommended`,
          source: "planning",
          kind: "approved",
          title: `Handa sa Pag-apruba: "${p.title}"`,
          message: `Inirekomenda ng reviewer noong ${formatRealNotifDate(planDate)}. Handa na para sa pag-apruba ng MPDC Coordinator.`,
          timestamp: planDate || "",
          badge: "For Approval",
          proposalId: p.id,
        });
      }
    }

    return list.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  }, [rawApplications, rawProposals]);

  const isNoticeRead = (n: MpdcNotification) => {
    return (
      readNotifIds.includes(n.id) ||
      Boolean(n.applicationId && readNotifIds.includes(`app-${n.applicationId}`)) ||
      Boolean(n.proposalId && readNotifIds.includes(`plan-${n.proposalId}`))
    );
  };

  const activeNotices = useMemo(() => {
    return allNotices.filter((n) => !dismissedNotifIds.includes(n.id));
  }, [allNotices, dismissedNotifIds]);

  const internalUnreadCount = useMemo(() => {
    return activeNotices.filter((n) => !isNoticeRead(n)).length;
  }, [activeNotices, readNotifIds]);

  const displayUnread = typeof propUnreadCount === "number" ? propUnreadCount : internalUnreadCount;

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
    markNoticeAsRead(notice.id, notice.applicationId ? `app-${notice.applicationId}` : undefined);
    if (onNoticeSelect) {
      onNoticeSelect(notice);
      setIsDrawerOpen(false);
    }
  };

  const handleToggleDrawer = () => {
    if (onOpenNotif) {
      onOpenNotif();
      return;
    }
    // Open in-place notification drawer without navigating away!
    setIsDrawerOpen((prev) => !prev);
  };

  const displayedNotices = useMemo(() => {
    if (notifFilter === "apps") return activeNotices.filter((n) => n.source === "application");
    if (notifFilter === "planning") return activeNotices.filter((n) => n.source === "planning");
    return activeNotices;
  }, [activeNotices, notifFilter]);

  const appNoticesCount = activeNotices.filter((n) => n.source === "application").length;
  const planningNoticesCount = activeNotices.filter((n) => n.source === "planning").length;

  return (
    <>
      <header className={`mpdc-shared-header ${accentClass}`} data-testid="mpdc-top-navbar">
        <div className="mpdc-shared-header-top">
          {/* Left Side: Back Pill, Luisiana Logo, MPDC Pill, Title & Subtitle */}
          <div className="mpdc-shared-header-left">
            {onBack && (
              <button
                type="button"
                className="mpdc-shared-back-btn"
                onClick={onBack}
                title={backLabel ? `Bumalik: ${backLabel}` : "Bumalik sa nakaraang pahina"}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span>{backLabel}</span>
              </button>
            )}

            <img src="/logo.png" alt="Luisiana Seal" className="mpdc-shared-brand-logo" />

            <div className="mpdc-shared-brand-wrap">
              <div className="mpdc-shared-title-row">
                <span className="mpdc-shared-brand-pill">{brandPill}</span>
                <h1 className="mpdc-shared-title">{title}</h1>
              </div>
              {subtitle && <div className="mpdc-shared-sub">{subtitle}</div>}
            </div>
          </div>

          {/* Right Side: Meta, Live Dot, Notif Bell, User Badge, Sign Out, Dark Mode */}
          <div className="mpdc-shared-header-right">
            {(serviceTag || serviceSla) && (
              <div className="mpdc-shared-header-meta">
                <div className="mpdc-shared-service-pill">
                  {serviceTag && <span className="mpdc-shared-service-tag">{serviceTag}</span>}
                  {serviceSla && <span className="mpdc-shared-service-sla">{serviceSla}</span>}
                </div>
              </div>
            )}

            <div
              className="mpdc-shared-live-indicator"
              title="Real-time multi-user PostgreSQL sync"
            >
              <span className="mpdc-shared-live-dot" />
              <span>
                {lastSyncedAt
                  ? `Live · ${new Date(lastSyncedAt).toLocaleTimeString()}`
                  : `Live · ${currentTime}`}
              </span>
            </div>

            <div className="mpdc-shared-header-controls">
              {extraControls}

              {/* Notification Bell */}
              <button
                type="button"
                className="mpdc-shared-notif-btn"
                onClick={handleToggleDrawer}
                title={
                  displayUnread > 0
                    ? `Mga Notipikasyon para sa MPDC (${displayUnread} bago)`
                    : "Mga Notipikasyon para sa MPDC"
                }
                aria-label="Mga Notipikasyon"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {displayUnread > 0 && (
                  <span className="mpdc-shared-notif-badge">
                    {displayUnread > 9 ? "9+" : displayUnread}
                  </span>
                )}
              </button>

              {/* User Profile Badge */}
              {session && (
                <div
                  className="mpdc-shared-user-badge"
                  title={`Naka-login: ${session.name || session.label || session.role}`}
                >
                  <span className="mpdc-shared-user-avatar">
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                  <div className="mpdc-shared-user-meta">
                    <span className="mpdc-shared-user-role">
                      {session.label || session.role || "MPDC"}
                    </span>
                    <span className="mpdc-shared-user-dept">
                      {session.username === "mpdc_admin" || session.role === "MPDC Admin"
                        ? "MPDC Coordinator"
                        : userDept}
                    </span>
                  </div>
                </div>
              )}

              {/* Sign Out Button */}
              {onLogout && (
                <button
                  type="button"
                  className="mpdc-shared-logout-btn"
                  onClick={onLogout}
                  title="Mag-sign out sa sistema"
                >
                  Sign Out
                </button>
              )}

              <LanguageToggle />
              <ThemeToggle iconOnly />
            </div>
          </div>
        </div>
      </header>

      {/* ── Built-in In-Place Notification Drawer ── */}
      {isDrawerOpen && (
        <div className="mpdc-notif-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <aside
            className="mpdc-notif-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Mga Notipikasyon ng MPDC"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mpdc-notif-header">
              <div className="mpdc-notif-header-title-wrap">
                <span className="mpdc-notif-bell-icon">
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </span>
                <h3 className="mpdc-notif-header-title">Mga Notipikasyon</h3>
                {displayUnread > 0 && (
                  <span className="mpdc-notif-header-count">{displayUnread} bago</span>
                )}
              </div>
              <button
                type="button"
                className="mpdc-notif-close-btn"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Isara ang drawer"
              >
                ✕
              </button>
            </div>

            <div className="mpdc-notif-tabs-bar">
              <div className="mpdc-notif-filter-tabs">
                <button
                  type="button"
                  className={`mpdc-notif-tab-btn${notifFilter === "all" ? " active" : ""}`}
                  onClick={() => setNotifFilter("all")}
                >
                  Lahat ({activeNotices.length})
                </button>
                <button
                  type="button"
                  className={`mpdc-notif-tab-btn${notifFilter === "apps" ? " active" : ""}`}
                  onClick={() => setNotifFilter("apps")}
                >
                  Aplikasyon ({appNoticesCount})
                </button>
                <button
                  type="button"
                  className={`mpdc-notif-tab-btn${notifFilter === "planning" ? " active" : ""}`}
                  onClick={() => setNotifFilter("planning")}
                >
                  Planning ({planningNoticesCount})
                </button>
              </div>

              {activeNotices.length > 0 && (
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    className="mpdc-notif-clear-all"
                    onClick={markAllNoticesAsRead}
                    title="Markahan lahat na nabasa para mabawasan ang badge"
                  >
                    Basahin lahat
                  </button>
                  <button
                    type="button"
                    className="mpdc-notif-clear-all"
                    onClick={dismissAllNotices}
                    title="I-dismiss lahat"
                    style={{ opacity: 0.75 }}
                  >
                    I-clear lahat
                  </button>
                </div>
              )}
            </div>

            <div className="mpdc-notif-body">
              {displayedNotices.length > 0 ? (
                <div className="mpdc-notif-list">
                  {displayedNotices.map((n) => {
                    const isRead = isNoticeRead(n);
                    return (
                      <div
                        key={n.id}
                        className={`mpdc-notif-card mpdc-notif-${n.kind}${!isRead ? " mpdc-notif-unread" : ""}`}
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
                        <div className="mpdc-notif-card-top">
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {!isRead && (
                              <span className="mpdc-notif-unread-dot" title="Hindi pa nababasa">
                                ● Bago
                              </span>
                            )}
                            <span className={`mpdc-notif-tag mpdc-tag-${n.kind}`}>{n.badge}</span>
                          </div>
                          <span className="mpdc-notif-time">
                            {formatRealNotifDate(n.timestamp)}
                          </span>
                          <button
                            type="button"
                            className="mpdc-notif-item-dismiss"
                            onClick={(e) => dismissNotice(n.id, e)}
                            title="I-dismiss"
                            aria-label="I-dismiss ang notipikasyon"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="mpdc-notif-card-title">{n.title}</div>
                        <div className="mpdc-notif-card-msg">{n.message}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mpdc-notif-empty">
                  <div className="mpdc-notif-empty-icon">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </div>
                  <div className="mpdc-notif-empty-title">Walang bagong notipikasyon</div>
                  <div className="mpdc-notif-empty-sub">
                    Ang mga bagong dating na citizen applications, bayad sa Treasury, at planning proposals ay awtomatikong lilitaw rito.
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

export default MpdcTopNavbar;
