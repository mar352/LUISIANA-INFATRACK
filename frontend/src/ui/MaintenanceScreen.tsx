import { useState } from "react";
import type { MaintenanceModeStatus } from "../types";
import { ThemeToggle } from "./ThemeToggle";
import "./MaintenanceScreen.css";

type Props = {
  maintenance: MaintenanceModeStatus | null;
  onAdminLogin?: () => void;
};

export function MaintenanceScreen({ maintenance, onAdminLogin }: Props) {
  const [showAdminNotice, setShowAdminNotice] = useState(false);

  const message =
    maintenance?.message ||
    "Pansamantalang inaayos ang LUISIANA INFA-TRACK system upang mapabuti ang kalidad ng serbisyo at seguridad ng datos. Mangyaring bumalik mamaya.";
  const estimatedDuration = maintenance?.estimatedDuration || "2 oras";

  return (
    <div className="maint-screen">
      <div className="maint-topbar">
        <div className="maint-brand">
          <img src="/favicon.ico" alt="Luisiana Logo" className="maint-logo-mini" onError={(e) => ((e.target as HTMLElement).style.display = "none")} />
          <span className="maint-brand-name">INFA-TRACK LUISIANA</span>
        </div>
        <div className="maint-topbar-actions">
          <ThemeToggle iconOnly />
        </div>
      </div>

      <div className="maint-center-wrap">
        <div className="maint-card">
          <div className="maint-icon-badge">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>

          <span className="maint-status-pill">
            <span className="maint-status-dot" />
            Naka-Schedule na Maintenance
          </span>

          <h1 className="maint-title">Pansamantalang Naka-Maintenance ang System</h1>
          <p className="maint-subtitle">System Under Scheduled Maintenance · Bayan ng Luisiana, Laguna</p>

          <div className="maint-message-box">
            <p>{message}</p>
          </div>

          <div className="maint-meta-grid">
            <div className="maint-meta-item">
              <span className="maint-meta-label">Inaasahang Tagal</span>
              <span className="maint-meta-value">{estimatedDuration}</span>
            </div>
            <div className="maint-meta-item">
              <span className="maint-meta-label">Oras ng Pagsisimula</span>
              <span className="maint-meta-value">
                {maintenance?.updatedAt ? new Date(maintenance.updatedAt).toLocaleTimeString("tl-PH", { hour: "2-digit", minute: "2-digit", hour12: true }) : "Kasalukuyan"}
              </span>
            </div>
            <div className="maint-meta-item">
              <span className="maint-meta-label">Katayuan ng Database</span>
              <span className="maint-meta-value" style={{ color: "#34d399" }}>Ligtas at Naka-Backup</span>
            </div>
          </div>

          <div className="maint-contact-section">
            <h4>Kailangan ng agarang tulong?</h4>
            <p>
              Maaaring makipag-ugnayan sa Tanggapan ng Pagpaplano at Pagpapaunlad ng Bayan (MPDC) o sa IT Helpdesk ng Munisipyo:
            </p>
            <div className="maint-contact-links">
              <span className="maint-contact-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <strong>mpdc@luisiana.gov.ph</strong>
              </span>
              <span className="maint-contact-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <strong>Municipal Hall, Luisiana, Laguna</strong>
              </span>
            </div>
          </div>

          <div className="maint-admin-bypass">
            {!showAdminNotice ? (
              <button
                type="button"
                className="maint-admin-btn"
                onClick={() => {
                  if (onAdminLogin) onAdminLogin();
                  else setShowAdminNotice(true);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Super Admin Emergency Access</span>
              </button>
            ) : (
              <div className="maint-admin-card">
                <p>
                  Kung ikaw ay may <strong>Super Admin</strong> credentials, mag-sign in upang ma-access ang Admin Panel at mai-toggle ang Maintenance Mode.
                </p>
                <button
                  type="button"
                  className="maint-login-btn"
                  onClick={() => {
                    if (onAdminLogin) onAdminLogin();
                    else window.location.href = "/login";
                  }}
                >
                  Pumunta sa Admin Login →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="maint-footer">
        <span>© 2026 Pamahalaang Bayan ng Luisiana · LUISIANA INFA-TRACK Municipal Infrastructure Portal</span>
      </footer>
    </div>
  );
}
