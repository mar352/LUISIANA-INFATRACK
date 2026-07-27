import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
} from "firebase/firestore";
import { db } from "../firebase";
import type { UserRole } from "../ui/Landing";

const ACCOUNTS_COLLECTION = "accounts";
const SESSION_COOKIE = "infatrack_session";
const SESSION_EXPIRY_DAYS = 30;

export interface Account {
  username: string;
  password: string;
  role: UserRole;
  label: string;
  department: string;
}

/** Persisted identity for comments / approvals (beyond role-only). */
export type SessionUser = {
  role: UserRole;
  username: string;
  department: string;
};

const DEFAULT_ACCOUNTS: Account[] = [
  { username: "mpdc",        password: "impact2024", role: "MPDC",           label: "MPDC",           department: "Municipal Planning & Development Coordinator" },
  { username: "engineer",    password: "impact2024", role: "Engineer",       label: "Engineer",       department: "Infrastructure & Engineering Office" },
  { username: "agriculture", password: "impact2024", role: "Agriculture",    label: "Agriculture",    department: "Municipal Agriculture Office" },
  { username: "negosyo",     password: "impact2024", role: "Negosyo Center", label: "Negosyo Center", department: "Business Permit & Licensing Office" },
];

const ROLE_DEPARTMENT: Record<UserRole, string> = {
  MPDC: "Municipal Planning & Development Coordinator",
  Engineer: "Infrastructure & Engineering Office",
  Agriculture: "Municipal Agriculture Office",
  "Negosyo Center": "Business Permit & Licensing Office",
  Viewer: "Public",
};

export async function seedAccounts(): Promise<void> {
  const snap = await getDocs(collection(db, ACCOUNTS_COLLECTION));
  if (!snap.empty) return;

  for (const acc of DEFAULT_ACCOUNTS) {
    await setDoc(doc(db, ACCOUNTS_COLLECTION, acc.username), acc);
  }
  console.log("[Auth] Seeded", DEFAULT_ACCOUNTS.length, "accounts to Firestore");
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<SessionUser | null> {
  const key = username.toLowerCase().trim();
  const ref = doc(db, ACCOUNTS_COLLECTION, key);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const account = snap.data() as Account;
  if (account.password !== password) return null;

  const session: SessionUser = {
    role: account.role,
    username: account.username,
    department: account.department || ROLE_DEPARTMENT[account.role],
  };

  if (hasCookieConsent()) {
    setSessionCookie(session);
  }
  return session;
}

/** Build a session for Viewer / credential fallback without Firestore. */
export function sessionForRole(
  role: UserRole,
  username?: string,
): SessionUser {
  const user =
    username ||
    (role === "Viewer"
      ? "viewer"
      : role === "Negosyo Center"
        ? "negosyo"
        : role.toLowerCase());
  return {
    role,
    username: user,
    department: ROLE_DEPARTMENT[role],
  };
}

function hasCookieConsent(): boolean {
  return localStorage.getItem("infatrack_cookie_consent") === "accepted";
}

export function setSessionCookie(session: SessionUser): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_EXPIRY_DAYS);
  const payload = encodeURIComponent(JSON.stringify(session));
  document.cookie = `${SESSION_COOKIE}=${payload}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

export function getSessionFromCookie(): SessionUser | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;

  const raw = decodeURIComponent(match.split("=").slice(1).join("="));
  const validRoles: UserRole[] = ["MPDC", "Engineer", "Agriculture", "Negosyo Center", "Viewer"];

  // Legacy cookie: role string only
  if (validRoles.includes(raw as UserRole)) {
    return sessionForRole(raw as UserRole);
  }

  try {
    const parsed = JSON.parse(raw) as SessionUser;
    if (parsed?.role && validRoles.includes(parsed.role)) {
      return {
        role: parsed.role,
        username: parsed.username || sessionForRole(parsed.role).username,
        department: parsed.department || ROLE_DEPARTMENT[parsed.role],
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** @deprecated Prefer getSessionFromCookie(); kept for call sites that only need role. */
export function getRoleFromCookie(): UserRole | null {
  return getSessionFromCookie()?.role ?? null;
}

export function clearSessionCookie(): void {
  document.cookie = `${SESSION_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
}
