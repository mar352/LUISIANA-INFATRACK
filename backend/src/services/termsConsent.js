import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query, isDbConnected } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../../data");
const CONSENTS_FILE = path.join(DATA_DIR, "user-terms-consents.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConsents() {
  try {
    if (!fs.existsSync(CONSENTS_FILE)) {
      fs.writeFileSync(CONSENTS_FILE, JSON.stringify([], null, 2), "utf8");
      return [];
    }
    const raw = fs.readFileSync(CONSENTS_FILE, "utf8");
    return JSON.parse(raw) || [];
  } catch (err) {
    console.warn("[termsConsent] failed to read json:", err.message);
    return [];
  }
}

function saveConsents(list) {
  try {
    fs.writeFileSync(CONSENTS_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.error("[termsConsent] failed to save json:", err.message);
  }
}

let consents = loadConsents();

let cachedPublicIp = null;
let lastPublicIpFetch = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Checks if an IP is local, loopback, private LAN or invalid.
 */
export function isPrivateOrLocalIp(ip) {
  if (!ip || typeof ip !== "string") return true;
  const clean = ip.replace(/^::ffff:/i, "").trim().toLowerCase();
  if (
    !clean ||
    clean === "127.0.0.1" ||
    clean === "::1" ||
    clean === "localhost" ||
    clean === "0.0.0.0" ||
    clean === "anon" ||
    clean === "unknown"
  ) {
    return true;
  }
  // RFC 1918 IPv4
  if (clean.startsWith("10.")) return true;
  if (clean.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
  // Carrier-grade NAT / Link-local
  if (clean.startsWith("169.254.")) return true;
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(clean)) return true;
  // IPv6 unique local / link-local
  if (clean.startsWith("fc00:") || clean.startsWith("fd00:") || clean.startsWith("fe80:")) return true;

  return false;
}

/**
 * Queries reliable external public IP discovery providers with abort timeouts.
 */
export async function fetchOutboundPublicIp() {
  const now = Date.now();
  if (cachedPublicIp && now - lastPublicIpFetch < CACHE_TTL_MS) {
    return cachedPublicIp;
  }

  const endpoints = [
    { url: "https://api.ipify.org?format=json", parse: (data) => data?.ip },
    { url: "https://api64.ipify.org?format=json", parse: (data) => data?.ip },
    { url: "https://icanhazip.com", parse: (data) => (typeof data === "string" ? data.trim() : "") },
    { url: "https://ifconfig.me/ip", parse: (data) => (typeof data === "string" ? data.trim() : "") },
  ];

  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(ep.url, {
        signal: controller.signal,
        headers: { "User-Agent": "INFA-TRACK-IP-Resolver/1.0" },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        let ip = "";
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          ip = ep.parse(json);
        } catch {
          ip = ep.parse(text);
        }
        ip = String(ip || "").replace(/^::ffff:/i, "").trim();
        if (ip && !isPrivateOrLocalIp(ip)) {
          cachedPublicIp = ip;
          lastPublicIpFetch = now;
          return cachedPublicIp;
        }
      }
    } catch {
      // try next provider
    }
  }

  return cachedPublicIp || "";
}

/**
 * Resolves the real public internet IP address.
 * If candidateIp is already a valid non-private IP, uses it.
 * If candidateIp is localhost (127.0.0.1, ::1) or private LAN, determines the real public IP.
 */
export async function resolveRealPublicIp(candidateIp) {
  let raw = String(candidateIp || "").replace(/^::ffff:/i, "").trim();
  if (raw.includes(",")) {
    raw = raw.split(",")[0].trim();
  }

  if (raw && !isPrivateOrLocalIp(raw)) {
    return raw;
  }

  const realPublic = await fetchOutboundPublicIp();
  return realPublic || raw || "127.0.0.1";
}

/**
 * Records a citizen/user's acceptance of Terms & Conditions and cookies.
 * Dual-writes to user-terms-consents.json and PostgreSQL user_terms_consents table.
 */
export async function recordTermsConsent(data) {
  const now = new Date().toISOString();
  const rawIp = data.ipAddress || "";
  const resolvedIp = await resolveRealPublicIp(rawIp);

  const consentRecord = {
    id: `consent-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    ipAddress: resolvedIp,
    userAgent: String(data.userAgent || "").trim(),
    termsVersion: String(data.termsVersion || "2026.1").trim(),
    agreedTerms: data.agreedTerms !== false,
    agreedPrivacy: data.agreedPrivacy !== false,
    agreedCookies: data.agreedCookies !== false,
    consentSource: String(data.consentSource || "new_application_page").trim(),
    applicantName: String(data.applicantName || "").trim(),
    createdAt: now,
  };

  // 1. Save to JSON
  consents = loadConsents();
  consents.unshift(consentRecord);
  saveConsents(consents);

  // 2. Save to PostgreSQL if connected
  if (isDbConnected()) {
    try {
      await query(
        `INSERT INTO user_terms_consents (
          id, ip_address, user_agent, terms_version,
          agreed_terms, agreed_privacy, agreed_cookies,
          consent_source, applicant_name, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          consentRecord.id,
          consentRecord.ipAddress,
          consentRecord.userAgent,
          consentRecord.termsVersion,
          consentRecord.agreedTerms,
          consentRecord.agreedPrivacy,
          consentRecord.agreedCookies,
          consentRecord.consentSource,
          consentRecord.applicantName,
          consentRecord.createdAt,
        ]
      );
    } catch (err) {
      console.warn("[termsConsent] failed to sync to Postgres:", err.message);
    }
  }

  return consentRecord;
}

export function listTermsConsents() {
  consents = loadConsents();
  return consents;
}
