import { useState, type CSSProperties, type FormEvent } from "react";
import { changePassword } from "../services/auth";
import { useTranslation } from "../lib/i18n";

export function ChangePasswordForm() {
  const { isEn } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk(false);
    if (newPassword.length < 8) {
      setError(isEn ? "New password must be at least 8 characters." : "Ang bagong password ay dapat may hindi bababa sa 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(isEn ? "New password and confirmation do not match." : "Hindi tugma ang bagong password at kumpirmasyon.");
      return;
    }
    setBusy(true);
    const result = await changePassword(currentPassword, newPassword);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setOk(true);
  }

  const field: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255, 255, 255, 0.14)",
    background: "rgba(255, 255, 255, 0.08)",
    color: "#fff",
    fontSize: 13,
    outline: "none",
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} style={{ marginTop: 6 }}>
      <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
        {isEn ? "Current password" : "Kasalukuyang password"}
      </label>
      <input
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        style={{ ...field, marginBottom: 8 }}
      />
      <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
        {isEn ? "New password" : "Bagong password"}
      </label>
      <input
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        style={{ ...field, marginBottom: 8 }}
      />
      <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
        {isEn ? "Confirm new password" : "Kumpirmahin ang bagong password"}
      </label>
      <input
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        style={{ ...field, marginBottom: 10 }}
      />
      {error && (
        <div className="hint" style={{ color: "var(--danger)", marginBottom: 8 }}>
          {error}
        </div>
      )}
      {ok && (
        <div className="hint" style={{ marginBottom: 8 }}>
          {isEn ? "Password updated. Use it the next time you sign in." : "Na-update ang password. Gamitin ito sa susunod na pag-log in."}
        </div>
      )}
      <button type="submit" className="side-btn is-primary" disabled={busy}>
        {busy ? (isEn ? "Saving…" : "Sine-save…") : (isEn ? "Change password" : "Palitan ang password")}
      </button>
    </form>
  );
}
