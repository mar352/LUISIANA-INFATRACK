/**
 * Staff login for INFA-TRACK. Stops strangers from using staff APIs.
 * Passwords are PBKDF2 hashes on disk — never sent to the browser.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH =
  process.env.AUTH_DATA_PATH || path.join(__dirname, "../../data/auth.json");

/**
 * Resolves the real IPv4 address from the active network connection being used,
 * ensuring localhost (127.0.0.1 / ::1) is never shown to the Super Admin.
 */
export function getRealNetworkIp(deviceType = "desktop") {
  try {
    const ifaces = os.networkInterfaces();
    let ethernetIp = "";
    let wifiIp = "";
    const validIps = [];

    for (const [name, addrs] of Object.entries(ifaces)) {
      if (!Array.isArray(addrs)) continue;
      const lname = name.toLowerCase();
      for (const addr of addrs) {
        if (addr.family === "IPv4" && !addr.internal) {
          // Ignore VirtualBox Host-Only (192.168.56.x) and Windows Hotspot (192.168.137.x)
          const isVirtual =
            lname.includes("virtual") ||
            lname.includes("host-only") ||
            addr.address.startsWith("192.168.56.") ||
            addr.address.startsWith("192.168.137.");

          if (!isVirtual) {
            validIps.push(addr.address);
            if (lname.includes("wi-fi") || lname.includes("wifi") || lname.includes("wlan") || lname.includes("wireless")) {
              if (!wifiIp) wifiIp = addr.address;
            } else if (lname.includes("ethernet") || lname.includes("eth") || lname.includes("lan")) {
              if (!ethernetIp) ethernetIp = addr.address;
            }
          }
        }
      }
    }

    if (deviceType === "mobile" || deviceType === "tablet") {
      return wifiIp || ethernetIp || validIps[0] || "192.168.93.8";
    }
    return ethernetIp || wifiIp || validIps[0] || "192.168.93.2";
  } catch (_err) {
    return "192.168.93.2";
  }
}

/**
 * Resolves the friendly network or location name from an IP address.
 */
export function getLocationFromIp(ip = "") {
  const clean = String(ip || "").trim();
  if (!clean || clean === "127.0.0.1" || clean === "::1" || clean.startsWith("127.")) {
    return "Munisipyo ng Luisiana (LGU Intranet)";
  }
  if (clean.startsWith("192.168.93.") || clean.startsWith("192.168.")) {
    return "Munisipyo ng Luisiana (LGU Municipal Network)";
  }
  if (clean.startsWith("10.") || clean.startsWith("172.")) {
    return "Munisipyo ng Luisiana (Government GovNet)";
  }
  return "Luisiana, Laguna (Remote Access)";
}

const SESSION_HOURS = 8;
const PBKDF2_ITERATIONS = 120_000;
const MAX_FAILED = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const COOKIE = "infatrack_sid";
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_PER_IP = 20;

const STAFF_ROLES = new Set([
  "Super Admin",
  "MPDC",
  "Engineer",
  "Agriculture",
  "Barangay Official",
  "Private Engineer",
]);

const SEED = [
  { username: "admin", password: "impact2024", role: "Super Admin", label: "Super Admin", department: "ICT Office / Office of the Mayor", name: "System Administrator", employeeId: "ADMIN-001" },
  { username: "mpdc", password: "impact2024", role: "MPDC", label: "MPDC", department: "Municipal Planning & Development Coordinator", name: "Engr. Mario S. Baldovino", employeeId: "MPDC-001" },
  { username: "mpdc_admin", password: "impact2024", role: "Super Admin", label: "MPDC Admin", department: "Municipal Planning & Development Coordinator", name: "MPDC Administrator", employeeId: "MPDC-ADM-001" },
  { username: "engineer", password: "impact2024", role: "Engineer", label: "Engineer", department: "Infrastructure & Engineering Office", name: "Municipal Engineer Office", employeeId: "ENG-001" },
  { username: "agriculture", password: "impact2024", role: "Agriculture", label: "Agriculture", department: "Municipal Agriculture Office", name: "Municipal Agriculturist", employeeId: "AGRI-001" },
  { username: "barangay", password: "impact2024", role: "Barangay Official", label: "Barangay Official", department: "Barangay Hall — Luisiana", name: "Barangay Officer", employeeId: "BRGY-001" },
  { username: "pengineer", password: "impact2024", role: "Private Engineer", label: "Private Engineer", department: "Private Professional / Design Engineer", name: "Private Design Engineer", employeeId: "PENG-001" },
];

const loginBuckets = new Map();
const sessions = new Map();

let state = null;

function hashPassword(password, saltB64, iterations = PBKDF2_ITERATIONS) {
  const salt = Buffer.from(saltB64, "base64");
  return crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64");
}

function newSalt() {
  return crypto.randomBytes(16).toString("base64");
}

function newSid() {
  return crypto.randomBytes(24).toString("hex");
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function save() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const accounts = {};
  for (const [k, acc] of Object.entries(state.accounts)) {
    accounts[k] = { ...acc };
  }
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify({ accounts, sessions: [...sessions.values()] }, null, 2),
    "utf8",
  );
}

function load() {
  if (state) return;
  state = { accounts: {} };
  if (fs.existsSync(DATA_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      state.accounts = raw.accounts && typeof raw.accounts === "object" ? raw.accounts : {};
      const now = Date.now();
      for (const s of raw.sessions || []) {
        if (s?.id && s.expiresAt && new Date(s.expiresAt).getTime() > now) {
          if (!s.ip || s.ip === "127.0.0.1" || s.ip === "::1" || s.ip === "anon" || s.ip.startsWith("127.")) {
            s.ip = getRealNetworkIp(s.deviceType);
          }
          sessions.set(s.id, s);
        }
      }
    } catch (err) {
      console.warn("[auth] Failed to load auth.json:", err.message);
    }
  }
  let added = false;
  for (const seed of SEED) {
    const key = seed.username.toLowerCase();
    if (state.accounts[key]) {
      // Ensure existing accounts have name and employeeId if missing
      if (!state.accounts[key].name) state.accounts[key].name = seed.name || seed.label;
      if (!state.accounts[key].employeeId) state.accounts[key].employeeId = seed.employeeId || "";
      if (state.accounts[key].mustChangePassword === undefined) state.accounts[key].mustChangePassword = false;
      if (state.accounts[key].isActive === undefined) state.accounts[key].isActive = true;
      continue;
    }
    const passwordSalt = newSalt();
    state.accounts[key] = {
      username: seed.username,
      name: seed.name || seed.label,
      employeeId: seed.employeeId || "",
      role: seed.role,
      label: seed.label,
      department: seed.department,
      passwordHash: hashPassword(seed.password, passwordSalt),
      passwordSalt,
      iterations: PBKDF2_ITERATIONS,
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      mustChangePassword: false,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    added = true;
  }
  if (added) save();
}

function publicUser(acc) {
  return {
    username: acc.username,
    name: acc.name || acc.label || acc.username,
    employeeId: acc.employeeId || "",
    role: acc.role,
    department: acc.department,
    mustChangePassword: Boolean(acc.mustChangePassword),
  };
}

function loginIpOk(ip) {
  const now = Date.now();
  let b = loginBuckets.get(ip);
  if (!b || now - b.start > LOGIN_WINDOW_MS) {
    b = { start: now, n: 0 };
    loginBuckets.set(ip, b);
  }
  b.n += 1;
  return b.n <= LOGIN_MAX_PER_IP;
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function cookieHeader(sid, { clear = false } = {}) {
  if (clear) {
    return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }
  const maxAge = SESSION_HOURS * 3600;
  const secure = process.env.COOKIE_SECURE === "1" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** Cookie (web) or Bearer / X-Infatrack-Sid (mobile field app). */
export function sidFromRequest(req) {
  const cookies = parseCookies(req);
  const auth = String(req.headers.authorization || "");
  const bearer = /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "").trim() : "";
  const headerSid = String(req.headers["x-infatrack-sid"] || "").trim();
  return cookies[COOKIE] || bearer || headerSid || "";
}

export function parseDeviceFromUserAgent(ua) {
  if (!ua || typeof ua !== "string") {
    return {
      device: "Desktop Workstation",
      type: "desktop",
      os: "Windows / PC",
      browser: "Web Browser",
    };
  }

  const s = ua.toLowerCase();

  // Operating System detection
  let os = "PC";
  if (s.includes("windows nt 10.0") || s.includes("windows nt 11.0") || s.includes("windows")) {
    os = "Windows PC";
  } else if (s.includes("iphone")) {
    os = "iPhone";
  } else if (s.includes("ipad")) {
    os = "iPad";
  } else if (s.includes("macintosh") || s.includes("mac os x")) {
    os = "macOS";
  } else if (s.includes("android")) {
    os = "Android Device";
  } else if (s.includes("linux")) {
    os = "Linux Workstation";
  }

  // Browser detection
  let browser = "Browser";
  if (s.includes("edg/")) {
    browser = "Edge";
  } else if (s.includes("chrome/") && !s.includes("edg/")) {
    browser = "Chrome";
  } else if (s.includes("safari/") && !s.includes("chrome/")) {
    browser = "Safari";
  } else if (s.includes("firefox/")) {
    browser = "Firefox";
  } else if (s.includes("opr/") || s.includes("opera/")) {
    browser = "Opera";
  }

  // Form factor
  let type = "desktop";
  if (s.includes("mobile") || s.includes("iphone") || (s.includes("android") && !s.includes("tablet"))) {
    type = "mobile";
  } else if (s.includes("ipad") || s.includes("tablet")) {
    type = "tablet";
  }

  return {
    device: `${os} (${browser})`,
    type,
    os,
    browser,
  };
}

export function sessionFromRequest(req) {
  load();
  const sid = sidFromRequest(req);
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() < Date.now()) {
    sessions.delete(sid);
    save();
    return null;
  }

  // Auto-enrich IP & Device if missing or updated from active HTTP request
  if (req) {
    const rawIp =
      req.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
      req.headers?.["x-real-ip"]?.toString().trim() ||
      req.headers?.["cf-connecting-ip"]?.toString().trim() ||
      req.socket?.remoteAddress ||
      "";
    let cleanIp = rawIp;
    if (cleanIp.startsWith("::ffff:")) cleanIp = cleanIp.replace("::ffff:", "");
    if (!cleanIp || cleanIp === "::1" || cleanIp === "127.0.0.1" || cleanIp.startsWith("127.") || cleanIp === "anon") {
      cleanIp = getRealNetworkIp(s.deviceType);
    }

    s.ip = cleanIp;

    const ua = req.headers ? req.headers["user-agent"] : "";
    if (ua && (!s.device || !s.userAgent || s.userAgent !== ua)) {
      s.userAgent = ua;
      const parsed = parseDeviceFromUserAgent(ua);
      s.device = parsed.device;
      s.deviceType = parsed.type;
      if (s.ip.startsWith("192.168.93.") || s.ip.startsWith("127.")) {
        s.ip = getRealNetworkIp(s.deviceType);
      }
    }
  }

  return s;
}

export function login(username, password, ip = "anon", userAgent = "") {
  load();
  const key = String(username || "").toLowerCase().trim();
  const pw = String(password || "");
  if (!key || !pw) return { ok: false, error: "invalid" };
  if (!loginIpOk(ip)) return { ok: false, error: "locked" };

  const parsed = parseDeviceFromUserAgent(userAgent);
  let cleanIp = ip;
  if (cleanIp.startsWith("::ffff:")) cleanIp = cleanIp.replace("::ffff:", "");
  if (!cleanIp || cleanIp === "::1" || cleanIp === "127.0.0.1" || cleanIp.startsWith("127.") || cleanIp === "anon") {
    cleanIp = getRealNetworkIp(parsed.type);
  }
  const location = getLocationFromIp(cleanIp);
  const now = new Date().toISOString();

  const acc = state.accounts[key];
  if (!acc) return { ok: false, error: "invalid" };
  if (acc.isActive === false) {
    return { ok: false, error: "deactivated" };
  }

  if (acc.lockedUntil) {
    if (new Date(acc.lockedUntil).getTime() > Date.now()) {
      acc.lastFailedIp = cleanIp;
      acc.lastFailedDevice = parsed.device;
      acc.lastFailedLocation = location;
      acc.lastFailedAt = now;
      save();
      return { ok: false, error: "locked", lockedUntil: acc.lockedUntil };
    } else {
      acc.lockedUntil = null;
      acc.failedAttempts = 0;
      acc.lastFailedAt = null;
      acc.lastFailedIp = null;
      acc.lastFailedDevice = null;
      acc.lastFailedLocation = null;
      save();
    }
  }

  if (acc.lastFailedAt && Date.now() - new Date(acc.lastFailedAt).getTime() > LOCKOUT_MS) {
    acc.failedAttempts = 0;
  }

  const computed = hashPassword(pw, acc.passwordSalt, acc.iterations || PBKDF2_ITERATIONS);
  if (!timingSafeEqual(computed, acc.passwordHash)) {
    acc.failedAttempts = (acc.failedAttempts || 0) + 1;
    acc.lastFailedAt = now;
    acc.lastFailedIp = cleanIp;
    acc.lastFailedDevice = parsed.device;
    acc.lastFailedLocation = location;
    if (acc.failedAttempts >= MAX_FAILED) {
      acc.lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
    }
    save();
    if (acc.lockedUntil) return { ok: false, error: "locked", lockedUntil: acc.lockedUntil };
    return { ok: false, error: "invalid" };
  }

  acc.failedAttempts = 0;
  acc.lockedUntil = null;
  acc.lastFailedAt = null;
  acc.lastFailedIp = null;
  acc.lastFailedDevice = null;
  acc.lastFailedLocation = null;
  acc.lastLoginAt = now;

  const id = newSid();
  const session = {
    id,
    username: acc.username,
    name: acc.name || acc.label || acc.username,
    employeeId: acc.employeeId || "",
    role: acc.role,
    department: acc.department,
    mustChangePassword: Boolean(acc.mustChangePassword),
    ip: cleanIp,
    userAgent: userAgent || "",
    device: parsed.device,
    deviceType: parsed.type,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString(),
  };
  sessions.set(id, session);
  save();
  return { ok: true, session: { ...session, user: publicUser(acc) }, sid: id };
}

export function logout(req) {
  load();
  const sid = sidFromRequest(req);
  if (sid) sessions.delete(sid);
  save();
}

export function changePassword(req, currentPassword, newPassword) {
  load();
  const s = sessionFromRequest(req);
  if (!s) return { ok: false, error: "auth" };
  const current = String(currentPassword || "");
  const next = String(newPassword || "");
  if (!current || !next) return { ok: false, error: "invalid" };
  if (next.length < 8) return { ok: false, error: "short" };
  if (next.length > 200) return { ok: false, error: "long" };
  if (current === next) return { ok: false, error: "same" };

  const acc = state.accounts[String(s.username).toLowerCase()];
  if (!acc) return { ok: false, error: "auth" };

  const computed = hashPassword(current, acc.passwordSalt, acc.iterations || PBKDF2_ITERATIONS);
  if (!timingSafeEqual(computed, acc.passwordHash)) {
    return { ok: false, error: "current" };
  }

  const passwordSalt = newSalt();
  acc.passwordHash = hashPassword(next, passwordSalt);
  acc.passwordSalt = passwordSalt;
  acc.iterations = PBKDF2_ITERATIONS;
  acc.failedAttempts = 0;
  acc.lockedUntil = null;
  acc.mustChangePassword = false;

  for (const [id, sess] of sessions) {
    if (sess.username === acc.username && id !== s.id) sessions.delete(id);
  }
  save();
  return { ok: true };
}

/**
 * First-Time Login Forced Password Reset:
 * Allows user with mustChangePassword: true to change to their secret password.
 */
export function forcedChangePassword(req, newPassword) {
  load();
  const s = sessionFromRequest(req);
  if (!s) return { ok: false, error: "auth" };

  const next = String(newPassword || "");
  if (!next) return { ok: false, error: "invalid" };
  if (next.length < 8) return { ok: false, error: "short" };
  if (next.length > 200) return { ok: false, error: "long" };
  if (next.toLowerCase() === "infatrack2026") return { ok: false, error: "same_as_default" };

  const acc = state.accounts[String(s.username).toLowerCase()];
  if (!acc) return { ok: false, error: "auth" };

  const passwordSalt = newSalt();
  acc.passwordHash = hashPassword(next, passwordSalt);
  acc.passwordSalt = passwordSalt;
  acc.iterations = PBKDF2_ITERATIONS;
  acc.failedAttempts = 0;
  acc.lockedUntil = null;
  acc.mustChangePassword = false;

  // Invalidate any other old sessions
  for (const [id, sess] of sessions) {
    if (sess.username === acc.username && id !== s.id) sessions.delete(id);
  }

  // Update current session
  s.mustChangePassword = false;

  save();
  return { ok: true, user: publicUser(acc) };
}

/**
 * Super Admin: Create a new employee account with default password & mustChangePassword flag.
 */
export function createAccount({ name, employeeId, username, role, department, defaultPassword }) {
  load();
  const key = String(username || "").toLowerCase().trim();
  const trimmedName = String(name || "").trim();
  const trimmedEmpId = String(employeeId || "").trim();
  const selectedRole = String(role || "").trim();
  const selectedDept = String(department || "").trim();
  const defPass = String(defaultPassword || "InfaTrack2026").trim();

  if (!key || !trimmedName || !selectedRole) {
    return { ok: false, error: "missing_fields" };
  }
  if (!STAFF_ROLES.has(selectedRole)) {
    return { ok: false, error: "invalid_role" };
  }
  if (state.accounts[key]) {
    return { ok: false, error: "username_exists" };
  }
  if (defPass.length < 8) {
    return { ok: false, error: "password_too_short" };
  }

  const passwordSalt = newSalt();
  const newAcc = {
    username: key,
    name: trimmedName,
    employeeId: trimmedEmpId || `EMP-${Date.now().toString().slice(-4)}`,
    role: selectedRole,
    label: selectedRole,
    department: selectedDept || selectedRole,
    passwordHash: hashPassword(defPass, passwordSalt),
    passwordSalt,
    iterations: PBKDF2_ITERATIONS,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    mustChangePassword: true, // FORCED RESET TRIGGER!
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  state.accounts[key] = newAcc;
  save();

  return {
    ok: true,
    user: {
      username: newAcc.username,
      name: newAcc.name,
      employeeId: newAcc.employeeId,
      role: newAcc.role,
      department: newAcc.department,
      mustChangePassword: newAcc.mustChangePassword,
      isActive: newAcc.isActive,
      defaultPassword: defPass,
      createdAt: newAcc.createdAt,
    },
  };
}

/**
 * Super Admin: List all staff accounts.
 */
export function listAllAccounts() {
  load();
  let changed = false;
  const now = Date.now();
  const list = [];
  for (const [_, acc] of Object.entries(state.accounts)) {
    if (acc.lockedUntil && new Date(acc.lockedUntil).getTime() <= now) {
      acc.lockedUntil = null;
      acc.failedAttempts = 0;
      acc.lastFailedAt = null;
      acc.lastFailedIp = null;
      acc.lastFailedLocation = null;
      acc.lastFailedDevice = null;
      changed = true;
    } else if (acc.failedAttempts > 0 && !acc.lockedUntil) {
      const failedTime = acc.lastFailedAt ? new Date(acc.lastFailedAt).getTime() : 0;
      if (!failedTime || now - failedTime > LOCKOUT_MS) {
        acc.failedAttempts = 0;
        acc.lastFailedAt = null;
        acc.lastFailedIp = null;
        acc.lastFailedLocation = null;
        acc.lastFailedDevice = null;
        changed = true;
      }
    }
    list.push({
      username: acc.username,
      name: acc.name || acc.label || acc.username,
      employeeId: acc.employeeId || "",
      role: acc.role,
      department: acc.department,
      label: acc.label || acc.role,
      mustChangePassword: Boolean(acc.mustChangePassword),
      isActive: acc.isActive !== false,
      failedAttempts: acc.failedAttempts || 0,
      lockedUntil: acc.lockedUntil || null,
      lastLoginAt: acc.lastLoginAt || null,
      lastFailedAt: acc.lastFailedAt || null,
      lastFailedIp: acc.lastFailedIp || null,
      lastFailedLocation: acc.lastFailedLocation || null,
      lastFailedDevice: acc.lastFailedDevice || null,
      createdAt: acc.createdAt || null,
    });
  }
  if (changed) {
    save();
  }
  return list;
}

/**
 * Super Admin: Reset employee password to default and re-flag mustChangePassword.
 */
export function resetAccountPassword(username, defaultPassword = "InfaTrack2026") {
  load();
  const key = String(username || "").toLowerCase().trim();
  const acc = state.accounts[key];
  if (!acc) return { ok: false, error: "not_found" };

  const defPass = String(defaultPassword || "InfaTrack2026").trim();
  const passwordSalt = newSalt();
  acc.passwordHash = hashPassword(defPass, passwordSalt);
  acc.passwordSalt = passwordSalt;
  acc.iterations = PBKDF2_ITERATIONS;
  acc.failedAttempts = 0;
  acc.lockedUntil = null;
  acc.lastFailedAt = null;
  acc.lastFailedIp = null;
  acc.lastFailedLocation = null;
  acc.lastFailedDevice = null;
  acc.mustChangePassword = true;

  // Invalidate any active sessions so they must log in afresh with default password
  for (const [id, sess] of sessions) {
    if (sess.username?.toLowerCase() === key) sessions.delete(id);
  }

  save();
  return { ok: true, username: acc.username, defaultPassword: defPass };
}

/**
 * Super Admin: Delete staff account.
 */
export function deleteAccount(username, currentActorUsername) {
  load();
  const key = String(username || "").toLowerCase().trim();
  const actor = String(currentActorUsername || "").toLowerCase().trim();

  if (key === "admin") {
    return { ok: false, error: "cannot_delete_root_admin" };
  }
  if (key === actor) {
    return { ok: false, error: "cannot_delete_self" };
  }
  if (!state.accounts[key]) {
    return { ok: false, error: "not_found" };
  }

  delete state.accounts[key];
  for (const [id, sess] of sessions) {
    if (sess.username?.toLowerCase() === key) sessions.delete(id);
  }
  save();
  return { ok: true };
}

/**
 * Super Admin: Deactivate or Activate staff account without deleting historical permit records.
 */
export function toggleAccountStatus(username, isActive, currentActorUsername) {
  load();
  const key = String(username || "").toLowerCase().trim();
  const actor = String(currentActorUsername || "").toLowerCase().trim();

  if (key === "admin" && !isActive) {
    return { ok: false, error: "cannot_deactivate_root_admin" };
  }
  if (key === actor && !isActive) {
    return { ok: false, error: "cannot_deactivate_self" };
  }
  const acc = state.accounts[key];
  if (!acc) return { ok: false, error: "not_found" };

  acc.isActive = Boolean(isActive);

  // If deactivating, revoke all active sessions immediately
  if (!acc.isActive) {
    for (const [id, sess] of sessions) {
      if (sess.username?.toLowerCase() === key) sessions.delete(id);
    }
  }

  save();
  return { ok: true, username: acc.username, isActive: acc.isActive };
}

/**
 * Super Admin: List all currently active logged-in users.
 */
export function getOnlineUsers() {
  load();
  const now = Date.now();
  const onlineMap = new Map();

  for (const [_, sess] of sessions) {
    if (sess?.expiresAt && new Date(sess.expiresAt).getTime() > now) {
      const key = String(sess.username || "").toLowerCase();
      if (!onlineMap.has(key) || new Date(sess.createdAt) > new Date(onlineMap.get(key).createdAt)) {
        const parsed = sess.device
          ? { device: sess.device, type: sess.deviceType || "desktop" }
          : parseDeviceFromUserAgent(sess.userAgent);

        let userIp = sess.ip;
        if (!userIp || userIp === "127.0.0.1" || userIp === "::1" || userIp === "anon" || userIp.startsWith("127.")) {
          userIp = getRealNetworkIp(sess.deviceType || parsed.type);
          sess.ip = userIp;
        }

        onlineMap.set(key, {
          username: sess.username,
          name: sess.name,
          employeeId: sess.employeeId,
          role: sess.role,
          department: sess.department,
          loggedInAt: sess.createdAt,
          expiresAt: sess.expiresAt,
          ip: userIp,
          device: sess.device || parsed.device,
          deviceType: sess.deviceType || parsed.type,
        });
      }
    }
  }

  return [...onlineMap.values()];
}

export function requireStaff(req, res, next) {
  const s = sessionFromRequest(req);
  if (!s || !STAFF_ROLES.has(s.role)) {
    return res.status(401).json({ error: "Sign in required." });
  }
  req.staff = s;
  next();
}

export function requireRoles(...roles) {
  const allow = new Set(roles);
  return (req, res, next) => {
    const s = sessionFromRequest(req);
    if (!s || !STAFF_ROLES.has(s.role)) {
      return res.status(401).json({ error: "Sign in required." });
    }
    if (!allow.has(s.role)) {
      return res.status(403).json({ error: "Your office cannot do this." });
    }
    req.staff = s;
    next();
  };
}
