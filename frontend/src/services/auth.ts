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

const DEFAULT_ACCOUNTS: Account[] = [
  { username: "mpdc",        password: "impact2024", role: "MPDC",           label: "MPDC",           department: "Municipal Planning & Development Coordinator" },
  { username: "engineer",    password: "impact2024", role: "Engineer",       label: "Engineer",       department: "Infrastructure & Engineering Office" },
  { username: "agriculture", password: "impact2024", role: "Agriculture",    label: "Agriculture",    department: "Municipal Agriculture Office" },
  { username: "negosyo",     password: "impact2024", role: "Negosyo Center", label: "Negosyo Center", department: "Business Permit & Licensing Office" },
];

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
): Promise<UserRole | null> {
  const key = username.toLowerCase().trim();
  const ref = doc(db, ACCOUNTS_COLLECTION, key);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const account = snap.data() as Account;
  if (account.password !== password) return null;

  if (hasCookieConsent()) {
    setSessionCookie(account.role);
  }
  return account.role;
}

function hasCookieConsent(): boolean {
  return localStorage.getItem("infatrack_cookie_consent") === "accepted";
}

function setSessionCookie(role: UserRole): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_EXPIRY_DAYS);
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(role)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

export function getSessionFromCookie(): UserRole | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;

  const value = decodeURIComponent(match.split("=")[1]) as UserRole;
  const validRoles: UserRole[] = ["MPDC", "Engineer", "Agriculture", "Negosyo Center", "Viewer"];
  return validRoles.includes(value) ? value : null;
}

export function clearSessionCookie(): void {
  document.cookie = `${SESSION_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
}
