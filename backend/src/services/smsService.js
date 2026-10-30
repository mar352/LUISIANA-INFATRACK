import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../../data");
const SMS_AUDIT_FILE = path.join(DATA_DIR, "sms-audit.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Rate Limiter & Cost Control In-Memory State ───────────────────────────────
const recentDispatchesByPhone = new Map(); // phone -> Array<number (timestamp)>
const lastSentTimestamps = new Map(); // phone -> number (timestamp)
const recentMessageHashes = new Map(); // hash -> number (timestamp)
let dailyCounter = {
  date: new Date().toISOString().split("T")[0],
  sentCount: 0,
  failedCount: 0,
  blockedCount: 0,
};

// Load audit log from disk (capped at last 200 entries)
function loadAuditLog() {
  try {
    if (!fs.existsSync(SMS_AUDIT_FILE)) {
      fs.writeFileSync(SMS_AUDIT_FILE, JSON.stringify([], null, 2), "utf8");
      return [];
    }
    const raw = fs.readFileSync(SMS_AUDIT_FILE, "utf8");
    return JSON.parse(raw) || [];
  } catch (err) {
    console.warn("[SMS Service] Failed to read sms-audit.json:", err.message);
    return [];
  }
}

function saveAuditEntry(entry) {
  try {
    const list = loadAuditLog();
    list.unshift(entry);
    // Keep last 200 entries for cost & compliance records
    const trimmed = list.slice(0, 200);
    fs.writeFileSync(SMS_AUDIT_FILE, JSON.stringify(trimmed, null, 2), "utf8");
  } catch (err) {
    console.error("[SMS Service] Failed to save audit entry:", err.message);
  }
}

function resetDailyCounterIfNewDay() {
  const today = new Date().toISOString().split("T")[0];
  if (dailyCounter.date !== today) {
    dailyCounter = {
      date: today,
      sentCount: 0,
      failedCount: 0,
      blockedCount: 0,
    };
  }
}

/**
 * Normalizes standard Philippine numbers to international E.164 (+639XXXXXXXXX).
 * Accepts: "09618907215", "9618907215", "+639618907215", "0961-890-7215", "(0961) 890 7215"
 */
export function normalizePhoneNumber(rawPhone) {
  if (!rawPhone || typeof rawPhone !== "string") return null;
  const digits = rawPhone.replace(/\D/g, ""); // strip non-digits

  // 11 digits starting with 09... (e.g. 09618907215)
  if (digits.length === 11 && digits.startsWith("09")) {
    return `+63${digits.substring(1)}`;
  }
  // 10 digits starting with 9... (e.g. 9618907215)
  if (digits.length === 10 && digits.startsWith("9")) {
    return `+63${digits}`;
  }
  // 12 digits starting with 639... (e.g. 639618907215)
  if (digits.length === 12 && digits.startsWith("639")) {
    return `+${digits}`;
  }
  // If already formatted as E.164 (+639XXXXXXXXX)
  if (rawPhone.startsWith("+639") && digits.length === 12) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Enforces rate limiting, deduplication, and cost control.
 * Returns { allowed: boolean, reason?: string }
 */
export function checkRateLimit(phone, message) {
  resetDailyCounterIfNewDay();

  const dailyLimit = Number(process.env.TEXTBEE_DAILY_LIMIT) || 100;
  const hourlyLimitPerRecipient = Number(process.env.TEXTBEE_RECIPIENT_HOURLY_LIMIT) || 3;
  const cooldownSecs = Number(process.env.TEXTBEE_COOLDOWN_SECONDS) || 120;
  const now = Date.now();

  // 1. Global Daily Quota Cap
  if (dailyCounter.sentCount >= dailyLimit) {
    dailyCounter.blockedCount++;
    return {
      allowed: false,
      reason: `Global daily quota reached (${dailyCounter.sentCount}/${dailyLimit} SMS today). Suppressed for cost control.`,
    };
  }

  // 2. Minimum Cooldown Gap (Throttle rapid staff clicks)
  const lastSent = lastSentTimestamps.get(phone) || 0;
  const elapsedSecs = Math.floor((now - lastSent) / 1000);
  if (elapsedSecs < cooldownSecs) {
    dailyCounter.blockedCount++;
    return {
      allowed: false,
      reason: `Recipient cooldown active (${elapsedSecs}s / ${cooldownSecs}s required gap). Suppressed to prevent duplicate charges.`,
    };
  }

  // 3. Hourly Cap Per Recipient
  const oneHourAgo = now - 60 * 60 * 1000;
  const timestamps = recentDispatchesByPhone.get(phone) || [];
  const validTimestamps = timestamps.filter((t) => t > oneHourAgo);
  if (validTimestamps.length >= hourlyLimitPerRecipient) {
    dailyCounter.blockedCount++;
    return {
      allowed: false,
      reason: `Hourly recipient cap reached (${validTimestamps.length}/${hourlyLimitPerRecipient} SMS in last hour).`,
    };
  }

  // 4. Exact Content Deduplication (15-minute sliding window)
  const msgHash = crypto.createHash("md5").update(`${phone}:${message.trim()}`).digest("hex");
  const lastHashSent = recentMessageHashes.get(msgHash);
  if (lastHashSent && now - lastHashSent < 15 * 60 * 1000) {
    dailyCounter.blockedCount++;
    return {
      allowed: false,
      reason: `Identical message already sent to recipient within the last 15 minutes. Deduplicated.`,
    };
  }

  return { allowed: true, msgHash, validTimestamps };
}

/**
 * Compacts and ensures standard single-segment GSM 03.38 SMS (<= 160 characters).
 * Avoids UCS-2 emojis that divide message segment limits to only 70 characters.
 */
export function compactSmsText(text) {
  if (!text) return "";
  // Strip multi-byte unicode emojis and replace with plain ASCII tags
  let cleaned = text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  // Strict 160 character boundary
  if (cleaned.length > 160) {
    cleaned = cleaned.substring(0, 157) + "...";
  }
  return cleaned;
}

/**
 * Formats standardized, concise SMS templates for INFA-TRACK workflow events.
 */
export function buildSmsTemplate(eventType, data = {}) {
  const tracking = data.trackingNumber || "LUIS-ZC";
  const portalUrl = (process.env.CLIENT_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
  const trackLink = `${portalUrl}/#track`;

  switch (eventType) {
    case "STATUS_OCULAR":
      return compactSmsText(
        `[INFA-TRACK] Ref: ${tracking}\nHakbang 2: Naka-iskedyul na ang 1-Araw na Ocular Inspection ng Zoning Officer sa inyong lote. I-track sa ${trackLink}`
      );

    case "STATUS_FOR_PAYMENT": {
      const opNo = data.orderOfPaymentNo || data.payment?.orderOfPaymentNo || "O.P.";
      const amt = data.amount || data.feeAmount || data.payment?.amount || 280;
      return compactSmsText(
        `[INFA-TRACK] Ref: ${tracking}\nInaprubahan ang Zoning! Magbayad sa Treasury (O.P. #${opNo}, P${amt}). I-upload ang O.R. sa ${trackLink}`
      );
    }

    case "STATUS_APPROVED":
      return compactSmsText(
        `[INFA-TRACK] Ref: ${tracking}\nOpisyal nang INAPRUBAHAN ang inyong Permiso sa Luisiana! I-download ang inyong kopya sa ${trackLink}`
      );

    case "STATUS_RETURNED": {
      const reason = data.reason || data.holdReason || "May kailangang palitang dokumento";
      return compactSmsText(
        `[INFA-TRACK] Ref: ${tracking}\nPAALALA: ${reason}. Mag-login sa ${trackLink} upang i-reupload ang dokumento.`
      );
    }

    case "STATUS_DENIED":
      return compactSmsText(
        `[INFA-TRACK] Ref: ${tracking}\nTinanggihan ang aplikasyon batay sa resulta ng pagsusuri. Tingnan ang opisyal na paliwanag sa ${trackLink}`
      );

    case "OFFICIAL_NOTE": {
      const office = data.fromOffice || "MPDC";
      const snippet = (data.note || data.message || "May bagong update").slice(0, 75);
      return compactSmsText(
        `[INFA-TRACK] Ref: ${tracking}\nMensahe mula sa ${office}: "${snippet}". Tingnan sa ${trackLink}`
      );
    }

    case "INSPECTION_UPDATE": {
      const stage = data.stage || "Before Inspection";
      const pct = data.progress !== undefined ? `${data.progress}%` : "Updated";
      return compactSmsText(
        `[INFA-TRACK] Ref: ${tracking}\nNa-update ang site inspection (${stage}, ${pct}) ng Municipal Engineer. Tingnan sa ${trackLink}`
      );
    }

    case "NEW_APPLICATION":
      return compactSmsText(
        `[INFA-TRACK] Natanggap ang inyong aplikasyon! Tracking Ref: ${tracking}. Maaari itong subaybayan anumang oras sa ${trackLink}`
      );

    case "STAFF_ACCOUNT_CREATED": {
      const staffName = data.name || "Kawani";
      const user = data.username || "user";
      const pass = data.temporaryPassword || data.defaultPassword || "InfaTrack2026";
      const shortName = staffName.split(" ")[0];
      return compactSmsText(
        `[INFA-TRACK] Magandang araw ${shortName}! Nalikha ang inyong LGU account. User: ${user} | Temp Pass: ${pass}. Mag-login sa portal at magpalit ng password.`
      );
    }

    case "STAFF_PASSWORD_RESET": {
      const staffName = data.name || "Kawani";
      const user = data.username || "user";
      const pass = data.temporaryPassword || data.defaultPassword || "InfaTrack2026";
      const shortName = staffName.split(" ")[0];
      return compactSmsText(
        `[INFA-TRACK] Na-reset ang inyong password sa LGU Portal. User: ${user} | Bagong Temp Pass: ${pass}. Mag-login at magpalit ng password.`
      );
    }

    default:
      return compactSmsText(
        `[INFA-TRACK] Ref: ${tracking}\nMay bagong update sa inyong aplikasyon. Tingnan sa ${trackLink}`
      );
  }
}

/**
 * Dispatches an SMS notification via Textbee.dev REST API.
 * Automatically handles formatting, normalization, and rate limiting.
 */
export async function sendSmsNotification({
  phone,
  trackingNumber,
  eventType,
  eventData = {},
  customMessage = null,
}) {
  const normPhone = normalizePhoneNumber(phone);
  if (!normPhone) {
    return {
      success: false,
      skipped: true,
      reason: `Invalid or missing Philippine mobile number ("${phone || ""}").`,
    };
  }

  const message = customMessage ? compactSmsText(customMessage) : buildSmsTemplate(eventType, { trackingNumber, ...eventData });

  // Rate Limiter & Cost Control Evaluation
  const rateCheck = checkRateLimit(normPhone, message);
  if (!rateCheck.allowed) {
    console.warn(`[SMS RateLimit] Skipped SMS to ${normPhone}: ${rateCheck.reason}`);
    saveAuditEntry({
      id: `sms-blocked-${Date.now()}`,
      phone: normPhone,
      trackingNumber,
      eventType,
      message,
      status: "blocked_rate_limit",
      reason: rateCheck.reason,
      createdAt: new Date().toISOString(),
    });
    return { success: false, skipped: true, reason: rateCheck.reason };
  }

  const apiKey = (process.env.TEXTBEE_API_KEY || "").trim();
  const deviceId = (process.env.TEXTBEE_DEVICE_ID || "").trim() || undefined;
  const isEnabled = process.env.TEXTBEE_ENABLED !== "false" && Boolean(apiKey);

  const auditEntry = {
    id: `sms-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    phone: normPhone,
    trackingNumber: trackingNumber || "N/A",
    eventType: eventType || "GENERAL",
    message,
    charCount: message.length,
    smsSegments: 1, // Guaranteed <= 160 chars GSM 03.38
    createdAt: new Date().toISOString(),
  };

  // Safe Simulation Mode (when TEXTBEE_API_KEY is not configured or disabled)
  if (!isEnabled) {
    console.log(`[SMS Simulation] Textbee disabled or API key not set. SMS logged for ${normPhone}: "${message}"`);
    auditEntry.status = "simulated";
    auditEntry.textbeeBatchId = `sim-${Date.now()}`;
    saveAuditEntry(auditEntry);

    // Update rate limiter tracking even in simulation
    updateRateLimitTracking(normPhone, rateCheck);
    return { success: true, simulated: true, batchId: auditEntry.textbeeBatchId, message };
  }

  // Real Textbee.dev Gateway Call
  try {
    const payload = {
      recipients: [normPhone],
      message,
    };
    if (deviceId) {
      payload.deviceId = deviceId;
    }

    const response = await fetch("https://api.textbee.dev/api/v1/gateway/send-sms", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    const resJson = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errMsg = resJson?.message || resJson?.error || `HTTP ${response.status} ${response.statusText}`;
      dailyCounter.failedCount++;
      auditEntry.status = "failed";
      auditEntry.error = errMsg;
      saveAuditEntry(auditEntry);
      console.error(`[SMS Service] Textbee error for ${normPhone}:`, errMsg);
      return { success: false, error: errMsg };
    }

    const batchId = resJson?.data?.smsBatchId || resJson?.smsBatchId || "queued";
    auditEntry.status = "sent";
    auditEntry.textbeeBatchId = batchId;
    saveAuditEntry(auditEntry);

    updateRateLimitTracking(normPhone, rateCheck);
    console.log(`[SMS Service] ✓ SMS dispatched via Textbee to ${normPhone} (Batch: ${batchId})`);
    return { success: true, batchId, message };
  } catch (err) {
    dailyCounter.failedCount++;
    auditEntry.status = "failed";
    auditEntry.error = err.message || "Network error calling textbee.dev";
    saveAuditEntry(auditEntry);
    console.error(`[SMS Service] Failed to dispatch SMS to ${normPhone}:`, err.message);
    return { success: false, error: err.message };
  }
}

function updateRateLimitTracking(phone, rateCheck) {
  const now = Date.now();
  dailyCounter.sentCount++;
  lastSentTimestamps.set(phone, now);

  const list = rateCheck.validTimestamps || [];
  list.push(now);
  recentDispatchesByPhone.set(phone, list);

  if (rateCheck.msgHash) {
    recentMessageHashes.set(rateCheck.msgHash, now);
  }
}

/**
 * Returns current SMS health metrics, limits, and recent logs for admin dashboard.
 */
export function getSmsStatus() {
  resetDailyCounterIfNewDay();
  const apiKey = (process.env.TEXTBEE_API_KEY || "").trim();
  const dailyLimit = Number(process.env.TEXTBEE_DAILY_LIMIT) || 100;
  const isEnabled = process.env.TEXTBEE_ENABLED !== "false" && Boolean(apiKey);

  return {
    provider: "textbee.dev",
    configured: Boolean(apiKey),
    enabled: isEnabled,
    deviceId: process.env.TEXTBEE_DEVICE_ID || "default",
    quota: {
      dailyLimit,
      sentToday: dailyCounter.sentCount,
      remainingToday: Math.max(0, dailyLimit - dailyCounter.sentCount),
      failedToday: dailyCounter.failedCount,
      blockedByRateLimit: dailyCounter.blockedCount,
    },
    rateLimits: {
      cooldownSeconds: Number(process.env.TEXTBEE_COOLDOWN_SECONDS) || 120,
      recipientHourlyCap: Number(process.env.TEXTBEE_RECIPIENT_HOURLY_LIMIT) || 3,
      maxCharPerMessage: 160,
    },
    recentLogs: loadAuditLog().slice(0, 15),
  };
}

/**
 * Diagnostic test tool to verify carrier gateway delivery.
 */
export async function sendTestSms(targetPhone) {
  return sendSmsNotification({
    phone: targetPhone,
    trackingNumber: "LUIS-TEST-SMS",
    eventType: "GENERAL",
    customMessage: `[LUISIANA INFA-TRACK] Pagsubok: Matagumpay na nakakonekta ang Textbee SMS Gateway sa Luisiana LGU Portal noong ${new Date().toLocaleTimeString("tl-PH")}.`,
  });
}
