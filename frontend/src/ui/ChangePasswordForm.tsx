import { useState, type CSSProperties, type FormEvent } from "react";
import { changePassword } from "../services/auth";

export function ChangePasswordForm() {
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
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
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
        Current password
      </label>
      <input
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        style={{ ...field, marginBottom: 8 }}
      />
      <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
        New password
      </label>
      <input
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        style={{ ...field, marginBottom: 8 }}
      />
      <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
        Confirm new password
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
          Password updated. Use it the next time you sign in.
        </div>
      )}
      <button type="submit" className="side-btn is-primary" disabled={busy}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
