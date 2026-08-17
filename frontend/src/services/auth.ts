import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type { UserRole } from "../ui/Landing";
import { writeAudit } from "./firestore-audit";

const ACCOUNTS_COLLECTION = "accounts";
const SESSIONS_COLLECTION = "sessions";
const SESSION_COOKIE = "infatrack_sid";
const LOCAL_SESSION_COOKIE = "infatrack_session";
const SESSION_HOURS = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const PBKDF2_ITERATIONS = 120_000;

export interface Account {
  username: string;
  role: UserRole;
  label: string;
  department: string;
  passwordHash?: string;
  passwordSalt?: string;
  hashAlgo?: string;
  iterations?: number;
  /** @deprecated plaintext leftover — migrated on seed / login */
  password?: string;
  failedAttempts?: number;
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
}

export type SessionUser = {
  role: UserRole;
  username: string;
  department: string;
};

export type AuthResult =
  | { ok: true; session: SessionUser }
  | { ok: false; error: "invalid" | "locked" | "unavailable"; lockedUntil?: string };

export type PublicAccount = Omit<
  Account,
  "password" | "passwordHash" | "passwordSalt" | "hashAlgo" | "iterations"
>;

const DEFAULT_SEED: Array<{
  username: string;
  password: string;
  role: UserRole;
  label: string;
  department: string;
}> = [
  { username: "mpdc", password: "impact2024", role: "MPDC", label: "MPDC", department: "Municipal Planning & Development Coordinator" },
  { username: "engineer", password: "impact2024", role: "Engineer", label: "Engineer", department: "Infrastructure & Engineering Office" },
  { username: "agriculture", password: "impact2024", role: "Agriculture", label: "Agriculture", department: "Municipal Agriculture Office" },
  { username: "negosyo", password: "impact2024", role: "Negosyo Center", label: "Negosyo Center", department: "Business Permit & Licensing Office" },
  { username: "barangay", password: "impact2024", role: "Barangay Official", label: "Barangay Official", department: "Barangay Hall — Luisiana" },
];

const ROLE_DEPARTMENT: Record<UserRole, string> = {
  MPDC: "Municipal Planning & Development Coordinator",
  Engineer: "Infrastructure & Engineering Office",
  Agriculture: "Municipal Agriculture Office",
  "Negosyo Center": "Business Permit & Licensing Office",
  "Barangay Official": "Barangay Hall — Luisiana",
  Viewer: "Public",
};

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function subtleAvailable(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

async function pbkdf2Hash(password: string, saltB64: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  if (!subtleAvailable()) {
    throw new Error("Web Crypto is not available in this context");
  }
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = b64ToBytes(saltB64);
  const saltBuf = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuf, iterations },
    keyMaterial,
    256,
  );
  return bytesToB64(new Uint8Array(bits));
}

function newSalt(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return bytesToB64(buf);
}

async function hashPassword(password: string): Promise<{ passwordHash: string; passwordSalt: string; iterations: number }> {
  const passwordSalt = newSalt();
  const passwordHash = await pbkdf2Hash(password, passwordSalt);
  return { passwordHash, passwordSalt, iterations: PBKDF2_ITERATIONS };
}

function cookieSecureSuffix(): string {
  return typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
}

function setSidCookie(sid: string) {
  const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(sid)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${cookieSecureSuffix()}`;
}

function getSidFromCookie(): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  return decodeURIComponent(match.split("=").slice(1).join("=")) || null;
}

function setLocalSessionCookie(session: SessionUser) {
  const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  const payload = encodeURIComponent(
    JSON.stringify({
      ...session,
      expiresAt: expires.toISOString(),
    }),
  );
  document.cookie = `${LOCAL_SESSION_COOKIE}=${payload}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${cookieSecureSuffix()}`;
}

function readLocalSessionCookie(): SessionUser | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCAL_SESSION_COOKIE}=`));
  if (!match) return null;
  const raw = decodeURIComponent(match.split("=").slice(1).join("="));
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser & { expiresAt?: string };
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) return null;
    if (!parsed.role || !parsed.username) return null;
    return {
      role: parsed.role,
      username: parsed.username,
      department: parsed.department || ROLE_DEPARTMENT[parsed.role],
    };
  } catch {
    return null;
  }
}

export function clearSessionCookie(): void {
  const gone = "expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax";
  document.cookie = `${SESSION_COOKIE}=; ${gone}`;
  document.cookie = `${LOCAL_SESSION_COOKIE}=; ${gone}`;
}

function hasCookieConsent(): boolean {
  return localStorage.getItem("infatrack_cookie_consent") === "accepted";
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

/** @deprecated Prefer restoreSession(). */
export function getSessionFromCookie(): SessionUser | null {
  return null;
}

export function getRoleFromCookie(): UserRole | null {
  return null;
}

/** Kept so older call sites that wrote the full session JSON still compile. */
export function setSessionCookie(_session: SessionUser): void {
  /* sessions are token-based now */
}

function accountFromSnap(id: string, raw: Account): Account {
  return {
    ...raw,
    username: raw.username || id,
    department: raw.department || ROLE_DEPARTMENT[raw.role] || "",
  };
}

async function persistHashedAccount(acc: Account, plaintext?: string): Promise<Account> {
  const creds = plaintext
    ? await hashPassword(plaintext)
    : acc.passwordHash && acc.passwordSalt
      ? {
          passwordHash: acc.passwordHash,
          passwordSalt: acc.passwordSalt,
          iterations: acc.iterations || PBKDF2_ITERATIONS,
        }
      : null;
  if (!creds) return acc;
  const next: Account = {
    username: acc.username,
    role: acc.role,
    label: acc.label,
    department: acc.department,
    passwordHash: creds.passwordHash,
    passwordSalt: creds.passwordSalt,
    hashAlgo: "pbkdf2-sha256",
    iterations: creds.iterations,
    failedAttempts: acc.failedAttempts ?? 0,
    lockedUntil: acc.lockedUntil ?? null,
    lastLoginAt: acc.lastLoginAt ?? null,
  };
  await setDoc(doc(db, ACCOUNTS_COLLECTION, acc.username), next);
  return next;
}

export async function seedAccounts(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, ACCOUNTS_COLLECTION));
    const existing = new Set(
      snap.docs.map((d) => {
        const data = d.data() as Account;
        return String(data.username || d.id).toLowerCase();
      }),
    );
    for (const seed of DEFAULT_SEED) {
      if (existing.has(seed.username)) continue;
      try {
        await persistHashedAccount(
          {
            username: seed.username,
            role: seed.role,
            label: seed.label,
            department: seed.department,
          },
          seed.password,
        );
        existing.add(seed.username);
        console.log("[Auth] Seeded missing account:", seed.username);
      } catch (err) {
        console.warn("[Auth] seed account skipped:", seed.username, err);
      }
    }

    for (const d of snap.docs) {
      const acc = accountFromSnap(d.id, d.data() as Account);
      if (acc.password && !acc.passwordHash) {
        try {
          await persistHashedAccount(acc, acc.password);
          console.log("[Auth] Migrated plaintext password for", acc.username);
        } catch (err) {
          console.warn("[Auth] migrate skipped:", acc.username, err);
        }
      }
    }
  } catch (err) {
    console.warn("[Auth] seedAccounts failed:", err);
  }
}

export async function listAccounts(): Promise<PublicAccount[]> {
  try {
    const snap = await getDocs(collection(db, ACCOUNTS_COLLECTION));
    if (snap.empty) {
      return DEFAULT_SEED.map(({ password: _pw, ...rest }) => rest);
    }
    return snap.docs.map((d) => {
      const data = d.data() as Account;
      return {
        username: data.username || d.id,
        role: data.role,
        label: data.label || data.username || d.id,
        department: data.department || ROLE_DEPARTMENT[data.role] || "",
        failedAttempts: data.failedAttempts,
        lockedUntil: data.lockedUntil,
        lastLoginAt: data.lastLoginAt,
      };
    });
  } catch (err) {
    console.warn("[Auth] listAccounts failed, using defaults:", err);
    return DEFAULT_SEED.map(({ password: _pw, ...rest }) => rest);
  }
}

async function writeSession(user: SessionUser): Promise<string> {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  if (hasCookieConsent()) {
    setSidCookie(id);
    setLocalSessionCookie(user);
  }
  try {
    await setDoc(doc(db, SESSIONS_COLLECTION, id), {
      id,
      username: user.username,
      role: user.role,
      department: user.department,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 180) : "",
    });
  } catch (err) {
    console.warn("[Auth] session doc write skipped:", err);
  }
  return id;
}

export async function restoreSession(): Promise<SessionUser | null> {
  const local = readLocalSessionCookie();
  const sid = getSidFromCookie();
  if (sid && !sid.startsWith("{") && sid.length >= 8) {
    try {
      const snap = await getDoc(doc(db, SESSIONS_COLLECTION, sid));
      if (snap.exists()) {
        const data = snap.data() as { username: string; role: UserRole; department?: string; expiresAt: string };
        if (data.expiresAt && new Date(data.expiresAt).getTime() >= Date.now()) {
          return {
            username: data.username,
            role: data.role,
            department: data.department || ROLE_DEPARTMENT[data.role],
          };
        }
        await deleteDoc(doc(db, SESSIONS_COLLECTION, sid)).catch(() => undefined);
      }
    } catch (err) {
      console.warn("[Auth] restoreSession remote lookup failed:", err);
    }
  }
  if (local) return local;
  return null;
}

export async function logoutUser(session: SessionUser | null): Promise<void> {
  const sid = getSidFromCookie();
  if (sid && !sid.startsWith("{")) {
    await deleteDoc(doc(db, SESSIONS_COLLECTION, sid)).catch(() => undefined);
  }
  clearSessionCookie();
  if (session && session.role !== "Viewer") {
    void writeAudit({
      action: "logout",
      category: "auth",
      summary: `${session.username} signed out`,
      actor: session,
    });
  }
}

export async function authenticateUser(username: string, password: string): Promise<SessionUser | null> {
  const result = await authenticateUserSecure(username, password);
  return result.ok ? result.session : null;
}

function seedAccountFor(username: string) {
  return DEFAULT_SEED.find((s) => s.username === username) ?? null;
}

async function passwordsMatch(account: Account, password: string, seedPlain?: string): Promise<boolean> {
  if (account.passwordHash && account.passwordSalt && subtleAvailable()) {
    try {
      const computed = await pbkdf2Hash(password, account.passwordSalt, account.iterations || PBKDF2_ITERATIONS);
      if (timingSafeEqual(computed, account.passwordHash)) return true;
    } catch (err) {
      console.warn("[Auth] hash verify failed, trying fallback:", err);
    }
  }
  if (account.password && account.password === password) return true;
  if (seedPlain && seedPlain === password) return true;
  return false;
}

export async function authenticateUserSecure(username: string, password: string): Promise<AuthResult> {
  const key = username.toLowerCase().trim();
  if (!key || !password) {
    return { ok: false, error: "invalid" };
  }

  const seed = seedAccountFor(key);
  let account: Account | null = null;
  let ref: ReturnType<typeof doc> | null = null;

  try {
    ref = doc(db, ACCOUNTS_COLLECTION, key);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      account = accountFromSnap(key, snap.data() as Account);
    }
  } catch (err) {
    console.warn("[Auth] account lookup failed:", err);
  }

  if (!account && seed) {
    account = {
      username: seed.username,
      role: seed.role,
      label: seed.label,
      department: seed.department,
      password: seed.password,
    };
  }

  if (!account) {
    void writeAudit({
      action: "login.fail",
      category: "auth",
      summary: `Failed sign-in for unknown account “${key}”`,
      actor: { username: key, role: "Viewer", department: "" },
    });
    return { ok: false, error: "invalid" };
  }

  if (account.lockedUntil && new Date(account.lockedUntil).getTime() > Date.now()) {
    void writeAudit({
      action: "login.locked",
      category: "auth",
      summary: `Sign-in blocked — ${key} is locked`,
      actor: { username: key, role: account.role, department: account.department },
    });
    return { ok: false, error: "locked", lockedUntil: account.lockedUntil };
  }

  const matches = await passwordsMatch(account, password, seed?.password);
  if (!matches) {
    const fails = (account.failedAttempts || 0) + 1;
    const lockedUntil = fails >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
    if (ref) {
      await updateDoc(ref, { failedAttempts: fails, lockedUntil }).catch(() => undefined);
    }
    void writeAudit({
      action: "login.fail",
      category: "auth",
      summary: `Failed sign-in for ${key} (attempt ${fails})`,
      actor: { username: key, role: account.role, department: account.department },
    });
    if (lockedUntil) return { ok: false, error: "locked", lockedUntil };
    return { ok: false, error: "invalid" };
  }

  if (account.password && !account.passwordHash && subtleAvailable() && ref) {
    try {
      account = await persistHashedAccount(account, account.password);
    } catch (err) {
      console.warn("[Auth] password migrate skipped:", err);
    }
  }

  const session: SessionUser = {
    role: account.role,
    username: account.username,
    department: account.department || ROLE_DEPARTMENT[account.role],
  };

  if (ref) {
    await updateDoc(ref, {
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date().toISOString(),
    }).catch(() => undefined);
  }

  try {
    await writeSession(session);
  } catch (err) {
    console.warn("[Auth] session persist skipped:", err);
    if (hasCookieConsent()) setLocalSessionCookie(session);
  }

  void writeAudit({
    action: "login.success",
    category: "auth",
    summary: `${session.username} signed in (${session.role})`,
    actor: session,
  });
  return { ok: true, session };
}
