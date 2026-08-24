/**
 * Staff sign-in talks to the backend. The browser never sees password hashes.
 */
import type { UserRole } from "../ui/Landing";
import { backendUrl } from "../lib/api";
import { writeAudit } from "./firestore-audit";

export type SessionUser = {
  role: UserRole;
  username: string;
  department: string;
};

export type AuthResult =
  | { ok: true; session: SessionUser }
  | { ok: false; error: "invalid" | "locked" | "unavailable"; lockedUntil?: string };

export type PublicAccount = {
  username: string;
  role: UserRole;
  label: string;
  department: string;
};

const ROLE_DEPARTMENT: Record<UserRole, string> = {
  MPDC: "Municipal Planning & Development Coordinator",
  Engineer: "Infrastructure & Engineering Office",
  Agriculture: "Municipal Agriculture Office",
  "Negosyo Center": "Business Permit & Licensing Office",
  "Barangay Official": "Barangay Hall — Luisiana",
  Viewer: "Public",
};

const PUBLIC_STAFF: PublicAccount[] = [
  { username: "mpdc", role: "MPDC", label: "MPDC", department: ROLE_DEPARTMENT.MPDC },
  { username: "engineer", role: "Engineer", label: "Engineer", department: ROLE_DEPARTMENT.Engineer },
  { username: "agriculture", role: "Agriculture", label: "Agriculture", department: ROLE_DEPARTMENT.Agriculture },
  { username: "negosyo", role: "Negosyo Center", label: "Negosyo Center", department: ROLE_DEPARTMENT["Negosyo Center"] },
  { username: "barangay", role: "Barangay Official", label: "Barangay Official", department: ROLE_DEPARTMENT["Barangay Official"] },
];

async function parseAuthJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function sessionForRole(role: UserRole, username?: string): SessionUser {
  const user =
    username ||
    (role === "Viewer"
      ? "viewer"
      : role === "Negosyo Center"
        ? "negosyo"
        : role === "Barangay Official"
          ? "barangay"
          : role.toLowerCase());
  return { role, username: user, department: ROLE_DEPARTMENT[role] };
}

export function getSessionFromCookie(): SessionUser | null {
  return null;
}

export function getRoleFromCookie(): UserRole | null {
  return null;
}

export function setSessionCookie(_session: SessionUser): void {
  /* httpOnly cookie is set by the backend */
}

export function clearSessionCookie(): void {
  /* backend clears the httpOnly cookie on logout */
}

/** Accounts live on the server now. */
export async function seedAccounts(): Promise<void> {
  return;
}

export async function listAccounts(): Promise<PublicAccount[]> {
  return PUBLIC_STAFF;
}

export async function authenticateUserSecure(username: string, password: string): Promise<AuthResult> {
  const key = username.toLowerCase().trim();
  if (!key || !password) return { ok: false, error: "invalid" };
  try {
    const res = await fetch(backendUrl("/api/auth/login"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: key, password }),
    });
    const body = await parseAuthJson(res);
    if (res.status === 423 || body.error === "locked") {
      return { ok: false, error: "locked", lockedUntil: body.lockedUntil as string | undefined };
    }
    if (!res.ok) return { ok: false, error: "invalid" };
    const user = body.user as SessionUser | undefined;
    if (!user?.role || !user.username) return { ok: false, error: "invalid" };
    void writeAudit({
      action: "login.success",
      category: "auth",
      summary: `${user.username} signed in (${user.role})`,
      actor: user,
    });
    return { ok: true, session: user };
  } catch (err) {
    console.warn("[Auth] login failed:", err);
    return { ok: false, error: "unavailable" };
  }
}

export async function authenticateUser(username: string, password: string): Promise<SessionUser | null> {
  const result = await authenticateUserSecure(username, password);
  return result.ok ? result.session : null;
}

export async function restoreSession(): Promise<SessionUser | null> {
  try {
    const res = await fetch(backendUrl("/api/auth/me"), { credentials: "include" });
    if (!res.ok) return null;
    const body = await parseAuthJson(res);
    const user = body.user as SessionUser | undefined;
    if (!user?.role || !user.username) return null;
    return user;
  } catch (err) {
    console.warn("[Auth] restoreSession failed:", err);
    return null;
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(backendUrl("/api/auth/password"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const body = await parseAuthJson(res);
    if (!res.ok) {
      return { ok: false, error: String(body.error || "Could not change password.") };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[Auth] changePassword failed:", err);
    return { ok: false, error: "Could not reach the server." };
  }
}

export async function logoutUser(session: SessionUser | null): Promise<void> {
  try {
    await fetch(backendUrl("/api/auth/logout"), { method: "POST", credentials: "include" });
  } catch (err) {
    console.warn("[Auth] logout failed:", err);
  }
  if (session && session.role !== "Viewer") {
    void writeAudit({
      action: "logout",
      category: "auth",
      summary: `${session.username} signed out`,
      actor: session,
    });
  }
}
