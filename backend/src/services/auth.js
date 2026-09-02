/**
 * Staff login for INFA-TRACK. Stops strangers from using staff APIs.
 * Passwords are PBKDF2 hashes on disk — never sent to the browser.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH =
  process.env.AUTH_DATA_PATH || path.join(__dirname, "../../data/auth.json");

const SESSION_HOURS = 8;
const PBKDF2_ITERATIONS = 120_000;
const MAX_FAILED = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const COOKIE = "infatrack_sid";
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_PER_IP = 20;

const STAFF_ROLES = new Set([
  "MPDC",
  "Engineer",
  "Agriculture",
  "Negosyo Center",
  "Barangay Official",
  "Private Engineer",
]);

const SEED = [
  { username: "mpdc", password: "impact2024", role: "MPDC", label: "MPDC", department: "Municipal Planning & Development Coordinator" },
  { username: "engineer", password: "impact2024", role: "Engineer", label: "Engineer", department: "Infrastructure & Engineering Office" },
  { username: "agriculture", password: "impact2024", role: "Agriculture", label: "Agriculture", department: "Municipal Agriculture Office" },
  { username: "negosyo", password: "impact2024", role: "Negosyo Center", label: "Negosyo Center", department: "Business Permit & Licensing Office" },
  { username: "barangay", password: "impact2024", role: "Barangay Official", label: "Barangay Official", department: "Barangay Hall — Luisiana" },
  { username: "pengineer", password: "impact2024", role: "Private Engineer", label: "Private Engineer", department: "Private Professional / Design Engineer" },
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
    if (state.accounts[key]) continue;
    const passwordSalt = newSalt();
    state.accounts[key] = {
      username: seed.username,
      role: seed.role,
      label: seed.label,
      department: seed.department,
      passwordHash: hashPassword(seed.password, passwordSalt),
      passwordSalt,
      iterations: PBKDF2_ITERATIONS,
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
    };
    added = true;
  }
  if (added) save();
}

function publicUser(acc) {
  return {
    username: acc.username,
    role: acc.role,
    department: acc.department,
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
  return s;
}

export function login(username, password, ip = "anon") {
  load();
  const key = String(username || "").toLowerCase().trim();
  const pw = String(password || "");
  if (!key || !pw) return { ok: false, error: "invalid" };
  if (!loginIpOk(ip)) return { ok: false, error: "locked" };

  const acc = state.accounts[key];
  if (!acc) return { ok: false, error: "invalid" };

  if (acc.lockedUntil && new Date(acc.lockedUntil).getTime() > Date.now()) {
    return { ok: false, error: "locked", lockedUntil: acc.lockedUntil };
  }

  const computed = hashPassword(pw, acc.passwordSalt, acc.iterations || PBKDF2_ITERATIONS);
  if (!timingSafeEqual(computed, acc.passwordHash)) {
    acc.failedAttempts = (acc.failedAttempts || 0) + 1;
    if (acc.failedAttempts >= MAX_FAILED) {
      acc.lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
    }
    save();
    if (acc.lockedUntil) return { ok: false, error: "locked", lockedUntil: acc.lockedUntil };
    return { ok: false, error: "invalid" };
  }

  acc.failedAttempts = 0;
  acc.lockedUntil = null;
  acc.lastLoginAt = new Date().toISOString();

  const id = newSid();
  const session = {
    id,
    username: acc.username,
    role: acc.role,
    department: acc.department,
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

  for (const [id, sess] of sessions) {
    if (sess.username === acc.username && id !== s.id) sessions.delete(id);
  }
  save();
  return { ok: true };
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

export function isGlbFile(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(12);
    const n = fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (n >= 4 && buf.readUInt32LE(0) === 0x46546c67) return true;
    const head = buf.slice(0, Math.min(n, 12)).toString("utf8").trimStart();
    return head.startsWith("{") || head.startsWith("glTF");
  } catch {
    return false;
  }
}
