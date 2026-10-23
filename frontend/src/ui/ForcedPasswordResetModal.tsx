import React, { useState, useEffect } from "react";
import type { SessionUser } from "../services/auth";
import { forcedResetPassword } from "../services/auth";
import { useTranslation } from "../lib/i18n";
import "./ForcedPasswordResetModal.css";

type Props = {
  session: SessionUser;
  onPasswordChanged: (updatedSession: SessionUser) => void;
  onLogout: () => void;
};

export function ForcedPasswordResetModal({ session, onPasswordChanged, onLogout }: Props) {
  const { isEn } = useTranslation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trap Escape key so user cannot dismiss this security modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // Compute password strength
  const hasMinLength = newPassword.length >= 8;
  const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword);
  const hasUpperLower = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
  const isDefaultPassword = newPassword.toLowerCase() === "infatrack2026";

  let strengthScore = 0;
  if (hasMinLength) strengthScore += 1;
  if (hasNumberOrSpecial) strengthScore += 1;
  if (hasUpperLower) strengthScore += 1;

  const strengthLabel =
    !newPassword
      ? ""
      : isDefaultPassword
      ? (isEn ? "Default password not allowed" : "Bawal gamitin ang default")
      : strengthScore <= 1
      ? (isEn ? "Weak" : "Mahina (Weak)")
      : strengthScore === 2
      ? (isEn ? "Medium" : "Katamtaman (Medium)")
      : (isEn ? "Strong" : "Malakas (Strong)");

  const isMatch = Boolean(newPassword && confirmPassword && newPassword === confirmPassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (!newPassword || !confirmPassword) {
      setError(isEn ? "Please fill in both password fields." : "Mangyaring punan ang parehong password fields.");
      return;
    }

    if (newPassword.length < 8) {
      setError(isEn ? "New password must be at least 8 characters long." : "Ang bagong password ay dapat may hindi bababa sa 8 characters.");
      return;
    }

    if (isDefaultPassword) {
      setError(isEn ? "Cannot reuse 'InfaTrack2026'. Please create your own private password." : "Hindi maaaring gamitin muli ang 'InfaTrack2026'. Maglagay ng sariling password na ikaw lang ang nakakaalam.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(isEn ? "New Password and Confirmation do not match." : "Hindi magkatugma ang Bagong Password at ang Kumpirmasyon.");
      return;
    }

    setLoading(true);
    try {
      const res = await forcedResetPassword(newPassword);
      if (!res.ok) {
        setError(res.error || (isEn ? "Failed to save new password." : "Nabigong i-save ang bagong password."));
        setLoading(false);
        return;
      }

      // Success! Update local session
      const updatedUser: SessionUser = res.user || {
        ...session,
        mustChangePassword: false,
      };
      onPasswordChanged(updatedUser);
    } catch (err: any) {
      setError(err?.message || (isEn ? "An error occurred. Please try again." : "May naganap na error. Subukang muli."));
      setLoading(false);
    }
  }

  return (
    <div className="fprm-backdrop" role="dialog" aria-modal="true" aria-labelledby="fprm-title">
      <div className="fprm-card">
        {/* Header */}
        <div className="fprm-header">
          <div className="fprm-icon-wrap" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <div className="fprm-pill">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>{isEn ? "First-time Login · Mandatory Password Change" : "Unang Pag-login · Mandatory Password Change"}</span>
          </div>

          <h2 id="fprm-title" className="fprm-title">
            {isEn ? "Change Your Password" : "Palitan ang Iyong Password"}
          </h2>
          <p className="fprm-subtitle">
            {isEn ? (
              <>Good day, <strong>{session.name || session.username}</strong>! This is your first time logging into INFA-TRACK using the temporary default password. In accordance with security policy, please set your private password before continuing.</>
            ) : (
              <>Magandang araw, <strong>{session.name || session.username}</strong>! Ito ang unang beses mong mag-login sa INFA-TRACK gamit ang pansamantalang default password. Alinsunod sa seguridad ng tanggapan, magtakda ng iyong sariling pribadong password bago magpatuloy.</>
            )}
          </p>
        </div>

        {/* Account Details Pill */}
        <div className="fprm-account-chip">
          <div className="fprm-chip-item">
            <span className="fprm-chip-label">{isEn ? "Account / Username" : "Account / Username"}</span>
            <span className="fprm-chip-val">@{session.username}</span>
          </div>
          <div className="fprm-chip-item">
            <span className="fprm-chip-label">{isEn ? "Office / Role" : "Tanggapan / Role"}</span>
            <span className="fprm-chip-val">{session.department || session.role}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="fprm-form">
          {error && (
            <div className="fprm-error-pill" role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* New Password */}
          <div className="fprm-field">
            <div className="fprm-label">
              <label htmlFor="fprm-new-pw">{isEn ? "New Password" : "Bagong Password"}</label>
              {strengthLabel && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    color:
                      strengthScore >= 3 ? "#10b981" : strengthScore === 2 ? "#f59e0b" : "#ef4444",
                  }}
                >
                  {strengthLabel}
                </span>
              )}
            </div>

            <div className="fprm-input-wrap">
              <input
                id="fprm-new-pw"
                type={showNew ? "text" : "password"}
                className="fprm-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={isEn ? "Minimum 8 characters" : "Hindi bababa sa 8 characters"}
                autoFocus
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="fprm-toggle-btn"
                onClick={() => setShowNew((v) => !v)}
                title={showNew ? (isEn ? "Hide password" : "Itago ang password") : (isEn ? "Show password" : "Ipakita ang password")}
                aria-label="Toggle password visibility"
              >
                {showNew ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {/* Strength meter bar */}
            {newPassword && (
              <div className="fprm-meter">
                <div className="fprm-meter-bars">
                  <div
                    className={`fprm-meter-bar ${
                      strengthScore >= 1 ? (strengthScore === 1 ? "active-weak" : strengthScore === 2 ? "active-medium" : "active-strong") : ""
                    }`}
                  />
                  <div
                    className={`fprm-meter-bar ${
                      strengthScore >= 2 ? (strengthScore === 2 ? "active-medium" : "active-strong") : ""
                    }`}
                  />
                  <div
                    className={`fprm-meter-bar ${strengthScore >= 3 ? "active-strong" : ""}`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="fprm-field">
            <div className="fprm-label">
              <label htmlFor="fprm-confirm-pw">{isEn ? "Confirm New Password" : "Kumpirmahin ang Bagong Password"}</label>
              {confirmPassword && (
                isMatch ? (
                  <span style={{ fontSize: "0.72rem", color: "#10b981", display: "inline-flex", alignItems: "center", gap: 3 }}>
                    ✓ {isEn ? "Matches" : "Tumutugma"}
                  </span>
                ) : (
                  <span style={{ fontSize: "0.72rem", color: "#ef4444", display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {isEn ? "Does not match" : "Hindi magkatugma"}
                  </span>
                )
              )}
            </div>

            <div className="fprm-input-wrap">
              <input
                id="fprm-confirm-pw"
                type={showConfirm ? "text" : "password"}
                className="fprm-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={isEn ? "Re-type new password" : "I-type muli ang bagong password"}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="fprm-toggle-btn"
                onClick={() => setShowConfirm((v) => !v)}
                title={showConfirm ? (isEn ? "Hide password" : "Itago ang password") : (isEn ? "Show password" : "Ipakita ang password")}
                aria-label="Toggle password visibility"
              >
                {showConfirm ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="fprm-submit-btn"
            disabled={loading || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 8}
          >
            {loading ? (
              <span>{isEn ? "Saving new credentials..." : "Nai-save ang bagong credentials..."}</span>
            ) : (
              <>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                <span>{isEn ? "Save New Password & Continue →" : "I-save ang Bagong Password at Magpatuloy →"}</span>
              </>
            )}
          </button>

          <div className="fprm-footer">
            {isEn ? `Not ${session.name || session.username}? ` : `Hindi ikaw si ${session.name || session.username}? `}{" "}
            <button type="button" className="fprm-logout-link" onClick={onLogout}>
              {isEn ? "Sign out" : "Mag-sign out"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
