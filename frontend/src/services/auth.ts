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
  name?: string;
  employeeId?: string;
  mustChangePassword?: boolean;
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

export type AdminUserRecord = {
  username: string;
  name: string;
  employeeId: string;
  role: UserRole;
  department: string;
  label?: string;
  phone?: string;
  mustChangePassword: boolean;
  isActive?: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
};

export type OnlineUserRecord = {
  username: string;
  name: string;
  employeeId: string;
  role: string;
  department: string;
  loggedInAt: string;
  expiresAt: string;
  ip?: string;
  device?: string;
  deviceType?: "desktop" | "mobile" | "tablet" | string;
};

export type NewUserPayload = {
  name: string;
  employeeId: string;
  username: string;
  role: UserRole;
  department?: string;
  phone?: string;
  defaultPassword?: string;
};

const ROLE_DEPARTMENT: Record<UserRole, string> = {
  "Super Admin": "Office of the Mayor / ICT Office",
  MPDC: "Municipal Planning & Development Coordinator",
  Engineer: "Infrastructure & Engineering Office",
  Agriculture: "Municipal Agriculture Office",
  "Barangay Official": "Barangay Hall — Luisiana",
  "Private Engineer": "Private Professional / Design Engineer",
  Viewer: "Public",
};

const PUBLIC_STAFF: PublicAccount[] = [
  { username: "admin", role: "Super Admin", label: "Super Admin", department: ROLE_DEPARTMENT["Super Admin"] },
  { username: "mpdc", role: "MPDC", label: "MPDC", department: ROLE_DEPARTMENT.MPDC },
  { username: "mpdc_admin", role: "Super Admin", label: "MPDC Admin", department: ROLE_DEPARTMENT.MPDC },
  { username: "engineer", role: "Engineer", label: "Engineer", department: ROLE_DEPARTMENT.Engineer },
  { username: "agriculture", role: "Agriculture", label: "Agriculture", department: ROLE_DEPARTMENT.Agriculture },
  { username: "barangay", role: "Barangay Official", label: "Barangay Official", department: ROLE_DEPARTMENT["Barangay Official"] },
  { username: "pengineer", role: "Private Engineer", label: "Private Engineer", department: ROLE_DEPARTMENT["Private Engineer"] },
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
      : role === "Super Admin"
        ? "admin"
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

/**
 * First-Time Login: Forced Password Reset
 */
export async function forcedResetPassword(newPassword: string): Promise<{ ok: boolean; user?: SessionUser; error?: string }> {
  try {
    const res = await fetch(backendUrl("/api/auth/forced-reset-password"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    const body = await parseAuthJson(res);
    if (!res.ok) {
      return { ok: false, error: String(body.error || "Nabigong palitan ang password.") };
    }
    return { ok: true, user: body.user as SessionUser };
  } catch (err) {
    console.warn("[Auth] forcedResetPassword failed:", err);
    return { ok: false, error: "Hindi maabot ang server." };
  }
}

/**
 * Super Admin: Fetch all employee user accounts
 */
export async function fetchAdminUsers(): Promise<AdminUserRecord[]> {
  try {
    const res = await fetch(backendUrl("/api/admin/users"), { credentials: "include" });
    if (!res.ok) return [];
    const body = await parseAuthJson(res);
    return Array.isArray(body.users) ? (body.users as AdminUserRecord[]) : [];
  } catch (err) {
    console.warn("[Auth] fetchAdminUsers failed:", err);
    return [];
  }
}

/**
 * Super Admin: Create a new employee user account
 */
export async function createAdminUser(payload: NewUserPayload): Promise<{ ok: boolean; user?: AdminUserRecord; error?: string }> {
  try {
    const res = await fetch(backendUrl("/api/admin/users"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await parseAuthJson(res);
    if (!res.ok) {
      return { ok: false, error: String(body.error || "Nabigong likhain ang account.") };
    }
    return { ok: true, user: body.user as AdminUserRecord };
  } catch (err) {
    console.warn("[Auth] createAdminUser failed:", err);
    return { ok: false, error: "Hindi maabot ang server." };
  }
}

/**
 * Super Admin: Reset employee password back to default
 */
export async function resetUserToDefault(username: string, defaultPassword?: string): Promise<{ ok: boolean; defaultPassword?: string; error?: string }> {
  try {
    const res = await fetch(backendUrl(`/api/admin/users/${encodeURIComponent(username)}/reset`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultPassword }),
    });
    const body = await parseAuthJson(res);
    if (!res.ok) {
      return { ok: false, error: String(body.error || "Nabigong i-reset ang password.") };
    }
    return { ok: true, defaultPassword: String(body.defaultPassword || "InfaTrack2026") };
  } catch (err) {
    console.warn("[Auth] resetUserToDefault failed:", err);
    return { ok: false, error: "Hindi maabot ang server." };
  }
}

/**
 * Super Admin: Delete employee account
 */
export async function deleteAdminUser(username: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(backendUrl(`/api/admin/users/${encodeURIComponent(username)}`), {
      method: "DELETE",
      credentials: "include",
    });
    const body = await parseAuthJson(res);
    if (!res.ok) {
      return { ok: false, error: String(body.error || "Nabigong tanggalin ang account.") };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[Auth] deleteAdminUser failed:", err);
    return { ok: false, error: "Hindi maabot ang server." };
  }
}

/**
 * Super Admin: Deactivate or Activate employee account without deleting history
 */
export async function toggleAdminUserStatus(username: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(backendUrl(`/api/admin/users/${encodeURIComponent(username)}/status`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
      credentials: "include",
    });
    const body = await parseAuthJson(res);
    if (!res.ok) {
      return { ok: false, error: String(body.error || "Nabigong baguhin ang status ng account.") };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[Auth] toggleAdminUserStatus failed:", err);
    return { ok: false, error: "Hindi maabot ang server." };
  }
}

/**
 * Super Admin: Fetch all currently active logged-in users
 */
export async function fetchOnlineUsers(): Promise<OnlineUserRecord[]> {
  try {
    const res = await fetch(backendUrl("/api/admin/online-users"), { credentials: "include" });
    const body = await parseAuthJson(res);
    return Array.isArray(body.onlineUsers) ? (body.onlineUsers as OnlineUserRecord[]) : [];
  } catch (err) {
    console.warn("[Auth] fetchOnlineUsers failed:", err);
    return [];
  }
}

export type SystemAlertItem = {
  id: string;
  type: "safe" | "warn" | "error" | "info";
  category: "intake" | "discrepancy" | "security" | "system_error" | "database" | "staff" | string;
  title: string;
  desc: string;
  metric: string;
  actionHint?: string;
  timestamp?: string;
  priority?: number;
  isLatest?: boolean;
  recentErrors?: Array<{
    id: string;
    source: string;
    message: string;
    details?: string | null;
    at: string;
  }>;
  securityDetails?: Array<{
    username: string;
    name?: string;
    role?: string;
    department?: string;
    ip?: string;
    location?: string;
    device?: string;
    failedAttempts?: number;
    lockedUntil?: string | null;
    lastAttemptAt?: string;
  }>;
};

export type SystemHealthData = {
  ok: boolean;
  timestamp: string;
  server: {
    uptimeSeconds: number;
    memoryUsageMB: number;
    nodeVersion: string;
  };
  database: {
    postgresConnected: boolean;
    storageMode: string;
  };
  stats: {
    totalAccounts: number;
    activeAccounts: number;
    deactivatedAccounts: number;
    pendingPasswordReset: number;
    usersOnlineNow: number;
    totalApplications: number;
    applicationsToday: number;
    applicationsLast24h: number;
    applicationsPendingReview: number;
    applicationsPendingPayment: number;
    applicationsReturnedOrHold: number;
    applicationsApproved?: number;
    systemErrorsCount?: number;
  };
  alerts: SystemAlertItem[];
};

/**
 * Super Admin: Fetch accurate real-time telemetry, operational statistics, and system alerts
 */
export async function fetchSystemHealth(): Promise<SystemHealthData | null> {
  try {
    const res = await fetch(backendUrl("/api/admin/system-health"), { credentials: "include" });
    if (!res.ok) return null;
    const data = await parseAuthJson(res);
    return data as SystemHealthData;
  } catch (err) {
    console.warn("[Auth] fetchSystemHealth failed:", err);
    return null;
  }
}

/**
 * Super Admin diagnostic helper: Simulate a test error to test real-time alert trigger
 */
export async function simulateSystemError(message?: string): Promise<boolean> {
  try {
    const res = await fetch(backendUrl("/api/admin/system-health/test-error"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Super Admin diagnostic helper: Clear recorded runtime errors
 */
export async function clearSystemErrors(): Promise<boolean> {
  try {
    const res = await fetch(backendUrl("/api/admin/system-health/clear-errors"), {
      method: "DELETE",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

