import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { spawn } from "child_process";

import { buildHeatPointsForBbox, computeRiskZones } from "./services/risk.js";
import {
  projectsSeed,
  tickProjects,
  addProject,
  removeProject,
  updateProject,
  addMilestone,
  completeMilestone,
  reportIssue,
  resolveIssue,
  addProjectPhoto,
  removeProjectPhoto,
  generateAccomplishmentReport,
  emitProjectsPayload,
  listPublicProjects,
  getPublicProject,
  updateProjectInspection,
  syncProjectsWithPostgres,
} from "./services/projects.js";
import {
  listEngagement,
  createEngagement,
  updateEngagement,
  checkEngagementRateLimit,
  engagementPublicStats,
} from "./services/engagement.js";
import {
  listCitizenApplications,
  getCitizenApplicationByTracking,
  createCitizenApplication,
  updateCitizenApplication,
  addCitizenApplicationRemark,
  submitOfficialReceipt,
  reuploadCitizenDocument,
  updateSiteInspection,
  addApplicationSidePhoto,
  getApplicationPhotos,
} from "./services/citizenApplications.js";
import { securityCheckUploadedFile, logSecurityEvent } from "./services/fileSecurity.js";
import { initDb, isDbConnected } from "./services/db.js";
import { recordTermsConsent, listTermsConsents, resolveRealPublicIp } from "./services/termsConsent.js";
import { createAlertFromRisk } from "./services/alerts.js";
import { buildSlopeCache } from "./services/dem.js";
import { chatWithOllama, getChatConfig } from "./services/chat.js";
import { lookupPlaceName } from "./services/placeName.js";
import { assessGeorisk } from "./services/georiskAssess.js";
import {
  getSystemConfig,
  getPublicConfig,
  addConfigItem,
  updateConfigItem,
  deleteConfigItem,
  toggleConfigItemStatus,
  resetCategoryToDefaults,
  setMaintenanceMode,
  getMaintenanceMode,
} from "./services/systemConfig.js";
import {
  generateSqlBackup,
  generateJsonBackup,
  buildBackupBundle,
} from "./services/backup.js";
import { computeSlaMetrics } from "./services/slaMonitoring.js";
import {
  sendSmsNotification,
  getSmsStatus,
  sendTestSms,
} from "./services/smsService.js";
import {
  changePassword as staffChangePassword,
  cookieHeader,
  createAccount,
  deleteAccount,
  forcedChangePassword,
  getLocationFromIp,
  getOnlineUsers,
  getRealNetworkIp,
  listAllAccounts,
  login as staffLogin,
  logout as staffLogout,
  parseDeviceFromUserAgent,
  requireRoles,
  requireStaff,
  resetAccountPassword,
  sessionFromRequest,
  toggleAccountStatus,
} from "./services/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const LOCALHOST_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:1b";

// Setup multer for file uploads
// Local: frontend/public/uploads · Docker: UPLOADS_DIR=/app/uploads (shared volume)
const uploadsDir =
  process.env.UPLOADS_DIR || path.join(__dirname, "../../frontend/public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const PHOTO_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "photo-" + uniqueSuffix + path.extname(file.originalname).toLowerCase());
  },
});

const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: PHOTO_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only .jpg, .jpeg, .png, and .webp images are allowed"));
    }
  },
});

const planningAttachStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "plan-" + uniqueSuffix + path.extname(file.originalname).toLowerCase());
  },
});

const uploadPlanningAttach = multer({
  storage: planningAttachStorage,
  limits: { fileSize: PHOTO_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".pdf", ".doc", ".docx"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Allowed: .jpg, .jpeg, .png, .webp, .pdf, .doc, .docx"));
    }
  },
});

const CITIZEN_UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // 15MB per requirement document/photo

const citizenUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "czreq-" + uniqueSuffix + path.extname(file.originalname).toLowerCase());
  },
});

const uploadCitizenRequirement = multer({
  storage: citizenUploadStorage,
  limits: { fileSize: CITIZEN_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Allowed formats: PDF, JPG, PNG, WEBP (Max 15MB)"));
    }
  },
});

/** Turn multer LIMIT_FILE_SIZE / filter errors into clear JSON instead of bare 500. */
function multerErrorHandler(err, _req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const isCitizenDoc = err.field === "file";
      const maxMb = isCitizenDoc ? 15 : 10;
      return res.status(413).json({
        error: `File too large. Maximum upload size is ${maxMb}MB.`,
        code: err.code,
      });
    }
    return res.status(400).json({ error: err.message, code: err.code });
  }
  return res.status(400).json({ error: err.message || "Upload failed" });
}

const app = express();
app.disable("x-powered-by");

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow Vite to move ports (5173 -> 5174, etc.) without breaking demos.
      if (!origin) return cb(null, true);
      if (origin === CLIENT_ORIGIN) return cb(null, true);
      if (LOCALHOST_ORIGIN_RE.test(origin)) return cb(null, true);
      return cb(new Error("CORS: origin not allowed"), false);
    },
    credentials: true,
  })
);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Do NOT deny frames on uploads so PDFs and images can be embedded in-system
  if (!req.path.startsWith("/uploads")) {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use(express.json({ limit: "2mb" }));

// System Maintenance Mode Guard Middleware
app.use((req, res, next) => {
  const m = getMaintenanceMode();
  if (!m || !m.enabled) return next();

  // Paths permitted even during maintenance:
  const isAllowedPath =
    req.path === "/health" ||
    req.path === "/api/config" ||
    req.path.startsWith("/api/auth/") ||
    req.path.startsWith("/api/admin/") ||
    req.path.startsWith("/uploads");

  if (isAllowedPath) return next();

  // If user has a valid session with Super Admin role, bypass maintenance mode
  const session = sessionFromRequest(req);
  if (session && session.role === "Super Admin") {
    return next();
  }

  return res.status(503).json({
    error: "maintenance_mode",
    message: m.message || "Pansamantalang inaayos ang LUISIANA INFA-TRACK system upang mapabuti ang serbisyo. Mangyaring bumalik mamaya.",
    estimatedDuration: m.estimatedDuration || "2 oras",
    updatedAt: m.updatedAt,
  });
});

app.use(
  "/uploads",
  (req, res, next) => {
    res.removeHeader("X-Frame-Options");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox;");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Disposition", "inline");
    next();
  },
  express.static(uploadsDir, {
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox;");
      res.setHeader("Content-Disposition", "inline");
    },
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin === CLIENT_ORIGIN) return cb(null, true);
      if (LOCALHOST_ORIGIN_RE.test(origin)) return cb(null, true);
      return cb(new Error("CORS: origin not allowed"), false);
    },
    credentials: true,
  },
});

export function broadcastOnlineUsers() {
  try {
    const onlineUsers = getOnlineUsers();
    io.emit("admin:online-users:update", {
      onlineUsers,
      count: onlineUsers.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[Realtime] broadcastOnlineUsers error:", err);
  }
}

// In-memory ring buffer for runtime system errors & exceptions
export const recentSystemErrors = [];

export function recordSystemError(source, message, details = null) {
  const item = {
    id: `ERR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    source,
    message: String(message || "Unknown system error"),
    details: details ? String(details) : null,
    at: new Date().toISOString(),
  };
  recentSystemErrors.unshift(item);
  if (recentSystemErrors.length > 50) recentSystemErrors.pop();
  try {
    broadcastSystemHealth();
  } catch (_err) {
    // Ignore if server/socket not fully bound yet
  }
  return item;
}

/** Super Admin: Accurate live system health, telemetries, and operational alerts */
export function computeSystemHealth() {
  const accounts = listAllAccounts();
  const apps = listCitizenApplications();
  const onlineUsers = getOnlineUsers();
  const now = Date.now();
  const oneDayAgo = now - 24 * 3600 * 1000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);

  // Application Telemetry with precise status detection
  let appsToday = 0;
  let appsLast24h = 0;
  let appsPendingReview = 0;
  let appsPendingPayment = 0;
  let appsReturnedOrHold = 0;
  let appsApproved = 0;
  let latestAppAt = null;
  let latestReturnedAt = null;

  for (const app of apps) {
    const createdAtMs = app.createdAt ? new Date(app.createdAt).getTime() : 0;
    const updatedAtMs = app.updatedAt ? new Date(app.updatedAt).getTime() : createdAtMs;
    if (!latestAppAt || createdAtMs > new Date(latestAppAt).getTime()) {
      if (app.createdAt) latestAppAt = app.createdAt;
    }

    if (createdAtMs >= startOfToday) appsToday++;
    if (createdAtMs >= oneDayAgo) appsLast24h++;

    const status = String(app.status || "").toLowerCase();
    const hasInvalidDocs = Boolean(
      (app.notes && (app.notes.includes("HINDI WASTONG") || app.notes.includes("❌") || app.notes.includes("Maling"))) ||
      (Array.isArray(app.remarks) && app.remarks.some((r) => r && r.message && (r.message.includes("HINDI WASTONG") || r.message.includes("❌"))))
    );

    if (
      status === "returned_to_applicant" ||
      status === "returned" ||
      status === "hold" ||
      status === "rejected" ||
      hasInvalidDocs ||
      app.inspection?.status === "failed"
    ) {
      appsReturnedOrHold++;
      if (!latestReturnedAt || updatedAtMs > new Date(latestReturnedAt).getTime()) {
        latestReturnedAt = app.updatedAt || app.createdAt;
      }
    } else if (
      status === "pending_review" ||
      status === "submitted" ||
      status === "under_review" ||
      status === "ocular_inspection"
    ) {
      appsPendingReview++;
    } else if (
      status === "order_of_payment_issued" ||
      status === "pending_payment" ||
      status === "for_payment"
    ) {
      appsPendingPayment++;
    } else if (status === "approved" || status === "released") {
      appsApproved++;
    }
  }

  // Auth & Security Telemetry
  let lockedAccounts = [];
  let lockedSecurityDetails = [];
  let failedSecurityDetails = [];
  let failedAttemptsCount = 0;
  let activeAccounts = 0;
  let deactivatedAccounts = 0;
  let pendingPasswordReset = 0;
  let latestLockoutAt = null;
  let latestFailedAt = null;

  for (const acc of accounts) {
    if (acc.isActive === false) {
      deactivatedAccounts++;
    } else {
      activeAccounts++;
      if (acc.mustChangePassword) pendingPasswordReset++;
    }

    const accountIp = acc.lastFailedIp || getRealNetworkIp();
    const accountLocation = acc.lastFailedLocation || getLocationFromIp(accountIp);
    const accountDevice = acc.lastFailedDevice || "Desktop Workstation";

    if (acc.lockedUntil && new Date(acc.lockedUntil).getTime() > now) {
      lockedAccounts.push(acc.username);
      const lockoutEventTime = acc.lastFailedAt || new Date().toISOString();
      if (!latestLockoutAt || new Date(lockoutEventTime).getTime() > new Date(latestLockoutAt).getTime()) {
        latestLockoutAt = lockoutEventTime;
      }
      lockedSecurityDetails.push({
        username: acc.username,
        name: acc.name || acc.label || acc.username,
        role: acc.role || "Staff",
        department: acc.department || "LGU Luisiana",
        ip: accountIp,
        location: accountLocation,
        device: accountDevice,
        failedAttempts: acc.failedAttempts || 5,
        lockedUntil: acc.lockedUntil,
        lastAttemptAt: acc.lastFailedAt || acc.lockedUntil,
      });
    }
    if (acc.failedAttempts > 0) {
      failedAttemptsCount += acc.failedAttempts;
      if (acc.lastFailedAt && (!latestFailedAt || new Date(acc.lastFailedAt).getTime() > new Date(latestFailedAt).getTime())) {
        latestFailedAt = acc.lastFailedAt;
      }
      if (!acc.lockedUntil || new Date(acc.lockedUntil).getTime() <= now) {
        failedSecurityDetails.push({
          username: acc.username,
          name: acc.name || acc.label || acc.username,
          role: acc.role || "Staff",
          department: acc.department || "LGU Luisiana",
          ip: accountIp,
          location: accountLocation,
          device: accountDevice,
          failedAttempts: acc.failedAttempts,
          lockedUntil: null,
          lastAttemptAt: acc.lastFailedAt || new Date().toISOString(),
        });
      }
    }
  }

  // System Error Telemetry in last 1 hour
  const oneHourAgo = now - 3600 * 1000;
  const recentErrors = recentSystemErrors.filter((e) => new Date(e.at).getTime() >= oneHourAgo);
  const latestErrorAt = recentErrors[0]?.at || null;

  // Dynamically compute accurate real-time system alerts
  const alerts = [];

  // Alert 1: Runtime System Errors & Exceptions (Only if errors exist)
  if (recentErrors.length > 0) {
    alerts.push({
      id: "ALERT-SYS-ERRORS",
      type: "error",
      category: "system_error",
      title: "Naitalang Server Runtime Errors",
      desc: `May ${recentErrors.length} runtime error sa server sa nakalipas na 1 oras. Huling mensahe: "${recentErrors[0].message}" mula sa (${recentErrors[0].source}).`,
      metric: `${recentErrors.length} Error(s)`,
      actionHint: "Suriin ang server terminal logs para sa agarang pag-diagnose.",
      timestamp: latestErrorAt || new Date().toISOString(),
      priority: 100,
      recentErrors: recentErrors.slice(0, 3),
    });
  }

  // Alert 2: Security & Lockout Monitoring (Only if active lockouts or failed attempts exist)
  if (lockedAccounts.length > 0) {
    const primaryLocked = lockedSecurityDetails[0];
    const detailsSummary = primaryLocked
      ? `${primaryLocked.name || "@" + primaryLocked.username} (${primaryLocked.role} • ${primaryLocked.department})`
      : lockedAccounts.map((u) => "@" + u).join(", ");
    alerts.push({
      id: "ALERT-SEC-LOCKOUT",
      type: "error",
      category: "security",
      title: "Security Alert: Account Lockout Detected",
      desc: `Pansamantalang naka-lock dahil sa 5 sunod-sunod na maling password: ${detailsSummary}.`,
      metric: `${lockedAccounts.length} Naka-lock`,
      timestamp: latestLockoutAt || new Date().toISOString(),
      priority: 95,
      securityDetails: lockedSecurityDetails,
    });
  } else if (failedAttemptsCount > 0) {
    const primaryFailed = failedSecurityDetails[0];
    const detailsSummary = primaryFailed
      ? `Huling sinubukang account: ${primaryFailed.name || "@" + primaryFailed.username} (${primaryFailed.role} • ${primaryFailed.department}) mula sa IP ${primaryFailed.ip}.`
      : `May kabuuang ${failedAttemptsCount} failed login attempt(s) na naitala bago matagumpay na nakapasok ang mga kawani.`;
    alerts.push({
      id: "ALERT-SEC-FAILED",
      type: "warn",
      category: "security",
      title: "May Naitalang Nabigong Pag-login",
      desc: detailsSummary,
      metric: `${failedAttemptsCount} Attempts`,
      timestamp: latestFailedAt || new Date().toISOString(),
      priority: 75,
      securityDetails: failedSecurityDetails,
    });
  }

  // Alert 3: Document Discrepancies & Returned Applications (Only if returned or hold items exist)
  if (appsReturnedOrHold > 0) {
    alerts.push({
      id: "ALERT-DISCREPANCY",
      type: "warn",
      category: "discrepancy",
      title: "Mga Aplikasyong May Discrepancy o Maling Dokumento",
      desc: `May ${appsReturnedOrHold} aplikasyon ang minarkahan ng 'Maling Dokumento' o 'Returned' dahil sa malabong kopya o kulang na requirements.`,
      metric: `${appsReturnedOrHold} Aplikasyon`,
      actionHint: "Awtomatikong naka-notify ang mga aplikante sa Citizen Portal upang makapag-reupload ng tamang dokumento.",
      timestamp: latestReturnedAt || new Date().toISOString(),
      priority: 85,
    });
  }

  // Alert 4: Application Volume Influx & Review Backlog (Only if volume threshold exceeded)
  if (appsLast24h >= 5) {
    alerts.push({
      id: "ALERT-VOL-HIGH",
      type: "warn",
      category: "intake",
      title: "Mataas na Dami ng Bagong Aplikasyon (High Intake Influx)",
      desc: `May ${appsLast24h} bagong aplikasyon ang pumasok sa nakalipas na 24 oras (${appsToday} ngayong araw). Kabuuang ${appsPendingReview} ang nasa review queue ng MPDC at Engineering.`,
      metric: `${appsLast24h} sa 24h`,
      actionHint: "I-coordinate sa MPDC at Engineering para mapabilis ang review queue.",
      timestamp: latestAppAt || new Date().toISOString(),
      priority: 80,
    });
  } else if (appsPendingReview >= 5) {
    alerts.push({
      id: "ALERT-VOL-BACKLOG",
      type: "warn",
      category: "intake",
      title: "Mataas na Nakabinbing Aplikasyon (Review Queue Backlog)",
      desc: `May ${appsPendingReview} aplikasyon ang kasalukuyang naghihintay ng pagsusuri (submitted/ocular inspection). ${appsToday} ang pumasok ngayong araw.`,
      metric: `${appsPendingReview} Nakabinbin`,
      actionHint: "I-prioritize ng MPDC Zoning Officer at Engineering ang mga nakabinbing dokumento.",
      timestamp: latestAppAt || new Date().toISOString(),
      priority: 70,
    });
  }

  // Alert 5: Database Persistence & Storage Engine (Only if disconnected / running on fallback)
  const postgresOk = isDbConnected();
  if (!postgresOk) {
    alerts.push({
      id: "ALERT-INFRA-STORAGE-FALLBACK",
      type: "warn",
      category: "database",
      title: "Database Engine: Naka-Fallback sa Local Storage",
      desc: "Hindi makakonekta sa PostgreSQL server sa Port 5432. Gumagana ang local encrypted JSON storage na may SHA-256 integrity hashing.",
      metric: "JSON Engine Active",
      actionHint: "Suriin kung tumatakbo ang PostgreSQL server.",
      timestamp: new Date().toISOString(),
      priority: 60,
    });
  }

  // Alert 6: Deactivated Historical Accounts Notice
  if (deactivatedAccounts > 0) {
    alerts.push({
      id: "ALERT-DEACTIVATED-PRESERVED",
      type: "info",
      category: "staff",
      title: "Napanatiling Kasaysayan ng mga Nag-resign na Kawani",
      desc: `May ${deactivatedAccounts} empleyado ang naka-deactivate. Hindi sila makakapag-login ngunit buo at hindi nabura ang kanilang pangalan sa mga nakaraang permit at tax assessments.`,
      metric: `${deactivatedAccounts} Deactivated`,
      actionHint: "Pwedeng i-activate muli anumang oras kung babalik ang kawani sa serbisyo.",
      timestamp: new Date().toISOString(),
      priority: 5,
    });
  }

  // Strictly sort alerts so that LATEST / HIGHEST-PRIORITY active alerts are in the FIRST ROW
  const severityTier = (type) => {
    if (type === "error") return 3;
    if (type === "warn") return 2;
    if (type === "info") return 1;
    return 0; // safe
  };

  alerts.sort((a, b) => {
    // 1. Severity tier: errors and warnings take precedence
    const tierDiff = severityTier(b.type) - severityTier(a.type);
    if (tierDiff !== 0) return tierDiff;

    // 2. Specific priority ranking within tier
    const prioDiff = (b.priority || 0) - (a.priority || 0);
    if (prioDiff !== 0) return prioDiff;

    // 3. Newest timestamp first
    const timeDiff = new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
    return timeDiff;
  });

  // Mark the top card (index 0) as isLatest
  alerts.forEach((alt, idx) => {
    alt.isLatest = idx === 0;
  });

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    server: {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      nodeVersion: process.version,
    },
    database: {
      postgresConnected: postgresOk,
      storageMode: postgresOk ? "PostgreSQL (Synchronized)" : "Local JSON Engine (Encrypted Storage)",
    },
    stats: {
      totalAccounts: accounts.length,
      activeAccounts,
      deactivatedAccounts,
      pendingPasswordReset,
      usersOnlineNow: onlineUsers.length,
      totalApplications: apps.length,
      applicationsToday: appsToday,
      applicationsLast24h: appsLast24h,
      applicationsPendingReview: appsPendingReview,
      applicationsPendingPayment: appsPendingPayment,
      applicationsReturnedOrHold: appsReturnedOrHold,
      applicationsApproved: appsApproved,
      systemErrorsCount: recentErrors.length,
    },
    alerts,
  };
}

export function broadcastSystemHealth() {
  try {
    const health = computeSystemHealth();
    io.emit("admin:system-health:update", health);
  } catch (err) {
    console.warn("[Realtime] broadcastSystemHealth error:", err);
  }
}

io.on("connection", (socket) => {
  socket.emit("hello", {
    system: "INFA-TRACK-Luisiana",
    serverTime: new Date().toISOString(),
    updateEverySeconds: 5,
  });

  // Emit current maintenance mode state to client
  socket.emit("system:maintenance", getMaintenanceMode());

  // Real-time zero-reload online presence request from Admin panel
  socket.on("admin:online-users:request", () => {
    socket.emit("admin:online-users:update", {
      onlineUsers: getOnlineUsers(),
      count: getOnlineUsers().length,
      timestamp: new Date().toISOString(),
    });
  });

  // Real-time zero-reload system health & alerts request from Admin panel
  socket.on("admin:system-health:request", () => {
    socket.emit("admin:system-health:update", computeSystemHealth());
  });

  // Track if socket belongs to an authenticated staff user
  const staff = sessionFromRequest(socket.request);
  if (staff) {
    broadcastOnlineUsers();
  }

  socket.on("disconnect", () => {
    if (staff) {
      broadcastOnlineUsers();
    }
  });
});

function clientIp(req, userAgent = "") {
  const raw =
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.headers["x-real-ip"]?.toString().trim() ||
    req.headers["cf-connecting-ip"]?.toString().trim() ||
    req.socket?.remoteAddress ||
    "";
  let ip = raw;
  if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
  if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("127.")) {
    const ua = userAgent || req.headers["user-agent"] || "";
    const parsed = parseDeviceFromUserAgent(ua);
    ip = getRealNetworkIp(parsed.type);
  }
  return ip;
}

app.post("/api/auth/login", (req, res) => {
  const ua = req.headers["user-agent"] || "";
  const ip = clientIp(req, ua);
  const result = staffLogin(req.body?.username, req.body?.password, ip, ua);
  if (!result.ok) {
    broadcastSystemHealth();
    const status = result.error === "locked" ? 423 : 401;
    return res.status(status).json({
      error: result.error,
      lockedUntil: result.lockedUntil || undefined,
    });
  }
  res.setHeader("Set-Cookie", cookieHeader(result.sid));
  // Broadcast instantaneous online presence update to all connected admin dashboards
  broadcastOnlineUsers();
  broadcastSystemHealth();
  // sid is for the mobile field app (React Native has no httpOnly cookie jar).
  res.json({ user: result.session.user, sid: result.sid });
});

app.post("/api/auth/logout", (req, res) => {
  staffLogout(req);
  res.setHeader("Set-Cookie", cookieHeader("", { clear: true }));
  // Broadcast instantaneous removal to all connected admin dashboards
  broadcastOnlineUsers();
  broadcastSystemHealth();
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const s = sessionFromRequest(req);
  if (!s) return res.json({ user: null });
  res.json({
    user: {
      username: s.username,
      name: s.name || s.username,
      employeeId: s.employeeId || "",
      role: s.role,
      department: s.department,
      mustChangePassword: Boolean(s.mustChangePassword),
    },
  });
});

app.post("/api/auth/forced-reset-password", requireStaff, (req, res) => {
  const result = forcedChangePassword(req, req.body?.newPassword);
  if (!result.ok) {
    const map = {
      auth: [401, "Sign in required."],
      short: [400, "Ang bagong password ay dapat may hindi bababa sa 8 characters."],
      long: [400, "Masyadong mahaba ang bagong password."],
      same_as_default: [400, "Hindi maaaring gamitin muli ang default password. Maglagay ng sariling password."],
      invalid: [400, "Mangyaring maglagay ng bagong password."],
    };
    const [status, error] = map[result.error] || [400, "Nabigong palitan ang password."];
    return res.status(status).json({ error });
  }
  res.json({ ok: true, user: result.user });
});

/** Super Admin: List all employee accounts */
app.get("/api/admin/users", requireRoles("Super Admin"), (_req, res) => {
  const users = listAllAccounts();
  res.json({ users });
});

/** Super Admin: Create a new employee account with default password & mustChangePassword flag */
app.post("/api/admin/users", requireRoles("Super Admin"), (req, res) => {
  const result = createAccount(req.body || {});
  if (!result.ok) {
    const map = {
      missing_fields: [400, "Kailangan punan ang Pangalan, Username, at Tanggapan/Role."],
      invalid_role: [400, "Hindi wastong Role ang napili."],
      username_exists: [409, "Mayroon nang empleyado na may ganitong username. Pumili ng iba."],
      password_too_short: [400, "Ang default password ay dapat may hindi bababa sa 8 characters."],
    };
    const [status, error] = map[result.error] || [400, "Hindi nalikha ang account."];
    return res.status(status).json({ error });
  }
  broadcastSystemHealth();
  res.status(201).json(result);
});

/** Super Admin: Reset employee password to default and re-flag mustChangePassword */
app.post("/api/admin/users/:username/reset", requireRoles("Super Admin"), (req, res) => {
  const result = resetAccountPassword(req.params.username, req.body?.defaultPassword);
  if (!result.ok) {
    return res.status(404).json({ error: "Hindi natagpuan ang account." });
  }
  broadcastSystemHealth();
  res.json(result);
});

/** Super Admin: Delete staff account */
app.delete("/api/admin/users/:username", requireRoles("Super Admin"), (req, res) => {
  const result = deleteAccount(req.params.username, req.staff?.username);
  if (!result.ok) {
    const map = {
      cannot_delete_root_admin: [403, "Hindi maaaring tanggalin ang root Super Admin account."],
      cannot_delete_self: [400, "Hindi mo maaaring tanggalin ang sarili mong account."],
      not_found: [404, "Hindi natagpuan ang account."],
    };
    const [status, error] = map[result.error] || [400, "Hindi natanggal ang account."];
    return res.status(status).json({ error });
  }
  broadcastOnlineUsers();
  broadcastSystemHealth();
  res.json({ ok: true });
});

/** Super Admin: Deactivate or Activate employee account */
app.patch("/api/admin/users/:username/status", requireRoles("Super Admin"), (req, res) => {
  const { active } = req.body || {};
  const result = toggleAccountStatus(req.params.username, active, req.staff?.username);
  if (!result.ok) {
    const map = {
      cannot_deactivate_root_admin: [403, "Hindi maaaring i-deactivate ang root Super Admin account."],
      cannot_deactivate_self: [400, "Hindi mo maaaring i-deactivate ang sarili mong account."],
      not_found: [404, "Hindi natagpuan ang account."],
    };
    const [status, error] = map[result.error] || [400, "Hindi nabago ang status ng account."];
    return res.status(status).json({ error });
  }
  broadcastOnlineUsers();
  broadcastSystemHealth();
  res.json(result);
});

/** Super Admin: List all currently active logged-in users */
app.get("/api/admin/online-users", requireRoles("Super Admin"), (_req, res) => {
  const onlineUsers = getOnlineUsers();
  res.json({ onlineUsers, count: onlineUsers.length });
});

// Global exception safety listeners
process.on("unhandledRejection", (reason) => {
  console.error("[INFA-TRACK System Error] unhandledRejection:", reason);
  recordSystemError("unhandledRejection", reason?.message || String(reason), reason?.stack);
});

process.on("uncaughtException", (err) => {
  console.error("[INFA-TRACK System Error] uncaughtException:", err);
  recordSystemError("uncaughtException", err?.message || String(err), err?.stack);
});

/** Super Admin: Accurate live system health, telemetries, and operational alerts */
app.get("/api/admin/system-health", requireRoles("Super Admin"), (_req, res) => {
  res.json(computeSystemHealth());
});

/** Super Admin: Diagnostic tool to simulate a system error for alert testing */
app.post("/api/admin/system-health/test-error", requireRoles("Super Admin"), (req, res) => {
  const msg = req.body?.message || "Simulated test runtime exception for Super Admin alert testing";
  const err = recordSystemError("AdminDiagnostics", msg, `Triggered by @${req.staffUser?.username || "admin"}`);
  broadcastSystemHealth();
  res.json({ ok: true, simulatedError: err });
});

/** Super Admin: Clear recorded system errors */
app.delete("/api/admin/system-health/clear-errors", requireRoles("Super Admin"), (_req, res) => {
  recentSystemErrors.length = 0;
  broadcastSystemHealth();
  res.json({ ok: true, cleared: true });
});

/** Public / Staff cached configuration for dropdown masterlists and maintenance info */
app.get("/api/config", (_req, res) => {
  res.json(getPublicConfig());
});

/** Super Admin: Full System Configuration & Masterlist Management */
app.get("/api/admin/config", requireRoles("Super Admin"), (_req, res) => {
  res.json(getSystemConfig());
});

app.post("/api/admin/config/:category/items", requireRoles("Super Admin"), (req, res) => {
  const result = addConfigItem(req.params.category, req.body || {}, req.staffUser?.username || "Super Admin");
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.status(201).json(result);
});

app.put("/api/admin/config/:category/items/:id", requireRoles("Super Admin"), (req, res) => {
  const result = updateConfigItem(req.params.category, req.params.id, req.body || {}, req.staffUser?.username || "Super Admin");
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.patch("/api/admin/config/:category/items/:id/toggle", requireRoles("Super Admin"), (req, res) => {
  const result = toggleConfigItemStatus(req.params.category, req.params.id, req.staffUser?.username || "Super Admin");
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.delete("/api/admin/config/:category/items/:id", requireRoles("Super Admin"), (req, res) => {
  const result = deleteConfigItem(req.params.category, req.params.id);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post("/api/admin/config/reset/:category", requireRoles("Super Admin"), (req, res) => {
  const result = resetCategoryToDefaults(req.params.category, req.staffUser?.username || "Super Admin");
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

/** Super Admin: System Maintenance Mode toggle */
app.post("/api/admin/maintenance", requireRoles("Super Admin"), (req, res) => {
  const { enabled, message, estimatedDuration } = req.body || {};
  const result = setMaintenanceMode(enabled, message, estimatedDuration, req.staffUser?.username || "Super Admin");
  io.emit("system:maintenance", result.maintenance);
  broadcastSystemHealth();
  res.json(result);
});

app.get("/api/admin/maintenance", requireRoles("Super Admin"), (_req, res) => {
  res.json(getMaintenanceMode());
});

/** Super Admin: 1-Click Database Disaster Recovery Backup (.sql / .json) */
app.get("/api/admin/backup/download", requireRoles("Super Admin"), (req, res) => {
  const format = (req.query.format || "sql").toLowerCase();
  const dateStr = new Date().toISOString().slice(0, 10);
  const author = req.staff?.username || req.staffUser?.username || "Super Admin";

  if (format === "json") {
    const jsonBackup = generateJsonBackup(author);
    res.setHeader("Content-Disposition", `attachment; filename="luisiana-infatrack-backup-${dateStr}.json"`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.send(jsonBackup);
  }

  const sqlBackup = generateSqlBackup(author);
  res.setHeader("Content-Disposition", `attachment; filename="luisiana-infatrack-backup-${dateStr}.sql"`);
  res.setHeader("Content-Type", "application/sql; charset=utf-8");
  return res.send(sqlBackup);
});

/** Super Admin: Get backup payload bundle for Cloud Storage / Firebase upload */
app.get("/api/admin/backup/bundle", requireRoles("Super Admin"), (req, res) => {
  const author = req.staff?.username || req.staffUser?.username || "Super Admin";
  const bundle = buildBackupBundle(author);
  const sqlDump = generateSqlBackup(author);
  res.json({
    ok: true,
    bundle,
    sqlDump,
  });
});

/** Super Admin: SLA & Bottleneck Monitoring */
app.get("/api/admin/sla-monitoring", requireRoles("Super Admin"), (_req, res) => {
  res.json(computeSlaMetrics());
});

/** Super Admin / Staff: SMS Gateway Health, Rate Limits & Logs */
app.get("/api/admin/sms-status", requireStaff, (_req, res) => {
  res.json({ ok: true, status: getSmsStatus() });
});

/** Super Admin / Staff: Send Test SMS to phone number */
app.post("/api/admin/test-sms", requireStaff, async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ error: "Kinakailangan ang numero ng telepono." });
  }
  const result = await sendTestSms(phone);
  res.json(result);
});

app.post("/api/auth/password", requireStaff, (req, res) => {
  const result = staffChangePassword(req, req.body?.currentPassword, req.body?.newPassword);
  if (!result.ok) {
    const map = {
      auth: [401, "Sign in required."],
      current: [400, "Current password is wrong."],
      short: [400, "New password must be at least 8 characters."],
      long: [400, "New password is too long."],
      same: [400, "Pick a different password from the current one."],
      invalid: [400, "Enter your current and new password."],
    };
    const [status, error] = map[result.error] || [400, "Could not change password."];
    return res.status(status).json({ error });
  }
  res.json({ ok: true });
});

/** Nearby street or barangay for a map drop / hover. */
app.get("/api/place-name", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: "lat and lon required" });
    return;
  }
  try {
    const name = await lookupPlaceName({ lat, lon });
    res.json({ name: name || null });
  } catch (err) {
    console.error("place-name:", err);
    res.json({ name: null });
  }
});

/** Live MGB flood + rain-induced landslide (GeoRiskPH public layers). Luisiana only. */
app.get("/api/georisk-assess", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: "lat and lon required" });
    return;
  }
  try {
    const payload = await assessGeorisk({ lat, lon });
    res.json(payload);
  } catch (err) {
    console.error("georisk-assess:", err);
    res.json({
      inside: true,
      flood: { value: "Unavailable", code: null },
      landslide: { value: "Unavailable", code: null },
      source: "MGB via GeoRiskPH",
    });
  }
});

/**
 * Map viewport-driven endpoints
 * The frontend calls these with the current map bounding box.
 */

app.get("/api/heatmap", (req, res) => {
  const { west, south, east, north } = req.query;
  if ([west, south, east, north].some((v) => v === undefined)) {
    res.status(400).json({ error: "Missing bbox params: west,south,east,north" });
    return;
  }

  const points = buildHeatPointsForBbox({
    west: Number(west),
    south: Number(south),
    east: Number(east),
    north: Number(north),
  });
  res.json({ points, generatedAt: new Date().toISOString() });
});

app.get("/api/risk-zones", (req, res) => {
  const { west, south, east, north, rainfall = "0.6" } = req.query;
  if ([west, south, east, north].some((v) => v === undefined)) {
    res.status(400).json({ error: "Missing bbox params: west,south,east,north" });
    return;
  }

  const zones = computeRiskZones({
    bbox: {
      west: Number(west),
      south: Number(south),
      east: Number(east),
      north: Number(north),
    },
    rainfallIntensity: Number(rainfall),
  });
  res.json({ zones, generatedAt: new Date().toISOString() });
});

app.get("/api/projects", requireStaff, (_req, res) => {
  res.json(emitProjectsPayload());
});

// ── Public citizen APIs (no auth; safe DTOs only) ───────────────────────────
app.get("/api/public/projects", (_req, res) => {
  res.json({
    projects: listPublicProjects(),
    generatedAt: new Date().toISOString(),
  });
});

app.get("/api/public/projects/:id", (req, res) => {
  const project = getPublicProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ project });
});

app.get("/api/public/engagement/stats", (_req, res) => {
  res.json({ stats: engagementPublicStats(), generatedAt: new Date().toISOString() });
});

app.post("/api/public/engagement", (req, res) => {
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "anon";
  if (!checkEngagementRateLimit(ip)) {
    return res.status(429).json({ error: "Too many submissions. Please try again in a minute." });
  }
  const result = createEngagement(req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ submission: { id: result.submission.id, createdAt: result.submission.createdAt } });
});

app.get("/api/engagement", requireStaff, (req, res) => {
  const kind = req.query.kind ? String(req.query.kind) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  res.json({
    submissions: listEngagement({ kind, status }),
    generatedAt: new Date().toISOString(),
  });
});

app.patch("/api/engagement/:id", requireStaff, (req, res) => {
  const result = updateEngagement(req.params.id, req.body || {});
  if (!result) return res.status(404).json({ error: "Submission not found" });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ submission: result.submission });
});

app.get("/api/engagement/stats", (_req, res) => {
  res.json({ stats: engagementPublicStats(), generatedAt: new Date().toISOString() });
});

app.post("/api/projects", requireRoles("Engineer", "MPDC"), (req, res) => {
  const {
    name,
    modelType,
    type,
    department,
    location,
    rotation,
    customModelUrl,
    status,
    progress,
    description,
    startDate,
    targetEndDate,
    budgetTotal,
    budgetSpent,
    barangay,
    fundingSource,
    contractor,
    lifecyclePhase,
  } = req.body;
  if (!name || !modelType || !location?.lat || !location?.lon) {
    return res.status(400).json({ error: "Missing required fields: name, modelType, location" });
  }
  const project = addProject({
    id: req.body?.id,
    isLguProject: req.body?.isLguProject !== undefined ? Boolean(req.body.isLguProject) : true,
    name,
    modelType: modelType || "office",
    type: type || (req.body?.isLguProject ? "Municipal Project" : undefined),
    department,
    location,
    rotation,
    customModelUrl,
    status,
    progress,
    description,
    startDate,
    targetEndDate,
    budgetTotal,
    budgetSpent,
    barangay,
    fundingSource,
    contractor,
    lifecyclePhase,
    siteMarkerOnly: Boolean(req.body?.siteMarkerOnly),
    mapSketch: req.body?.mapSketch ?? null,
    markerColor: req.body?.markerColor || "",
    mapShape: req.body?.mapShape ?? null,
    biddingResults: req.body?.biddingResults || null,
    noticeOfAwardUrl: req.body?.noticeOfAwardUrl || null,
    noticeOfAwardName: req.body?.noticeOfAwardName || null,
    programOfWorksUrl: req.body?.programOfWorksUrl || null,
    programOfWorksName: req.body?.programOfWorksName || null,
    photos: req.body?.photos || [],
    milestones: req.body?.milestones || [],
    activityLog: req.body?.activityLog || [],
    encodedBy: req.body?.encodedBy || "",
    engineerApproved: req.body?.engineerApproved !== undefined ? Boolean(req.body.engineerApproved) : undefined,
    engineerApprovedAt: req.body?.engineerApprovedAt || null,
    engineerApprovedBy: req.body?.engineerApprovedBy || null,
    isPinned: req.body?.isPinned !== undefined ? Boolean(req.body.isPinned) : undefined,
  });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ project });
});

app.patch("/api/projects/:id", (req, res, next) => {
  const s = sessionFromRequest(req);
  if (s && !["Engineer", "MPDC", "Super Admin"].includes(s.role)) {
    return res.status(403).json({ error: "Your office cannot do this." });
  }
  next();
}, (req, res) => {
  let project = updateProject(req.params.id, req.body);
  if (!project) {
    project = addProject({
      id: req.params.id,
      ...req.body,
    });
  }
  io.emit("projects:update", emitProjectsPayload());
  res.json({ project });
});

app.post("/api/projects/:id/milestones", requireRoles("Engineer", "MPDC"), (req, res) => {
  const milestone = addMilestone(req.params.id, req.body);
  if (!milestone) return res.status(400).json({ error: "Invalid project or milestone data" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ milestone });
});

app.patch("/api/projects/:id/milestones/:mid", requireRoles("Engineer", "MPDC"), (req, res) => {
  const milestone = completeMilestone(req.params.id, req.params.mid);
  if (!milestone) return res.status(404).json({ error: "Milestone not found" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ milestone });
});

app.post("/api/projects/:id/issues", requireStaff, (req, res) => {
  const issue = reportIssue(req.params.id, req.body);
  if (!issue) return res.status(400).json({ error: "Invalid project or issue data" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ issue });
});

app.patch("/api/projects/:id/issues/:iid", requireStaff, (req, res) => {
  const issue = resolveIssue(req.params.id, req.params.iid);
  if (!issue) return res.status(404).json({ error: "Issue not found" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ issue });
});

app.get("/api/projects/:id/report", requireStaff, (req, res) => {
  const report = generateAccomplishmentReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Project not found" });
  res.json({ report });
});

app.post("/api/projects/:id/photos", requireRoles("Engineer", "MPDC"), (req, res, next) => {
  uploadPhoto.single("photo")(req, res, (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    if (!req.file) {
      return res.status(400).json({ error: "No photo uploaded" });
    }

    const uploadedFilePath = path.join(uploadsDir, req.file.filename);
    const secCheck = securityCheckUploadedFile(
      uploadedFilePath,
      req.file.originalname,
      req.file.mimetype,
      [".jpg", ".jpeg", ".png", ".webp"]
    );
    if (!secCheck.ok) {
      logSecurityEvent({
        ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        filename: req.file.originalname,
        reason: secCheck.error,
        code: secCheck.code,
        userAgent: req.headers["user-agent"],
      });
      return res.status(400).json({ error: secCheck.error, code: secCheck.code });
    }

    const url = `/uploads/${req.file.filename}`;
    const photo = addProjectPhoto(req.params.id, {
      url,
      caption: req.body?.caption,
      milestoneId: req.body?.milestoneId || null,
      kind: req.body?.kind || "progress",
      lat: req.body?.lat,
      lon: req.body?.lon,
    });
    if (!photo) return res.status(404).json({ error: "Project not found" });
    io.emit("projects:update", emitProjectsPayload());
    res.json({ photo });
  });
});

app.delete("/api/projects/:id/photos/:photoId", requireRoles("Engineer", "MPDC"), (req, res) => {
  const removed = removeProjectPhoto(req.params.id, req.params.photoId);
  if (!removed) return res.status(404).json({ error: "Photo or project not found" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ ok: true });
});



app.delete("/api/projects/:id", requireRoles("Engineer"), (req, res) => {
  const removed = removeProject(req.params.id);
  if (!removed) return res.status(404).json({ error: "Project not found" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ ok: true });
});

app.post("/api/planning/notify", requireStaff, (req, res) => {
  io.emit("planning:update", {
    kind: req.body?.kind || "update",
    at: req.body?.at || new Date().toISOString(),
  });
  res.json({ ok: true });
});

app.post("/api/planning/attachments", requireStaff, (req, res, next) => {
  uploadPlanningAttach.single("file")(req, res, (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploadedFilePath = path.join(uploadsDir, req.file.filename);
    const secCheck = securityCheckUploadedFile(
      uploadedFilePath,
      req.file.originalname,
      req.file.mimetype,
      [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".doc", ".docx"]
    );
    if (!secCheck.ok) {
      logSecurityEvent({
        ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        filename: req.file.originalname,
        reason: secCheck.error,
        code: secCheck.code,
        userAgent: req.headers["user-agent"],
      });
      return res.status(400).json({ error: secCheck.error, code: secCheck.code });
    }

    const url = `/uploads/${req.file.filename}`;
    res.json({
      url,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  });
});

// ── Citizen Online Applications (Zoning & MPDC Certifications) ───────────
app.post("/api/citizen/applications/upload", (req, res, next) => {
  uploadCitizenRequirement.single("file")(req, res, (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploadedFilePath = path.join(uploadsDir, req.file.filename);
    const fieldKey = String(req.body?.fieldKey || req.query?.fieldKey || "").trim();
    const allowedExtensions =
      fieldKey === "photoDocs" || fieldKey === "photo_doc"
        ? [".jpg", ".jpeg", ".png", ".webp"]
        : [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

    const secCheck = securityCheckUploadedFile(
      uploadedFilePath,
      req.file.originalname,
      req.file.mimetype,
      allowedExtensions
    );
    if (!secCheck.ok) {
      logSecurityEvent({
        ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        filename: req.file.originalname,
        reason: secCheck.error,
        code: secCheck.code,
        userAgent: req.headers["user-agent"],
      });
      return res.status(400).json({
        error: secCheck.error,
        code: secCheck.code || "FILE_SECURITY_VIOLATION",
      });
    }

    // Mirror to dist/uploads if folder exists
    try {
      const distUploads = path.join(__dirname, "../../frontend/dist/uploads");
      if (fs.existsSync(path.dirname(distUploads))) {
        fs.mkdirSync(distUploads, { recursive: true });
        fs.copyFileSync(
          path.join(uploadsDir, req.file.filename),
          path.join(distUploads, req.file.filename),
        );
      }
    } catch {
      /* ignore */
    }

    const url = `/uploads/${req.file.filename}`;
    res.json({
      ok: true,
      url,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  });
});

app.post("/api/citizen/applications", async (req, res) => {
  try {
    const appData = req.body || {};
    if (!appData.applicant?.fullName || !appData.applicant?.contactPhone) {
      return res.status(400).json({ error: "Applicant name and contact number are required." });
    }
    const candidateIp =
      appData.clientIp ||
      req.headers["cf-connecting-ip"] ||
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      "";
    const realIp = await resolveRealPublicIp(candidateIp);
    appData.clientIp = realIp;
    if (!appData.termsConsentDetails || typeof appData.termsConsentDetails !== "object") {
      appData.termsConsentDetails = {};
    }
    appData.termsConsentDetails.ipAddress = realIp;

    const created = createCitizenApplication(appData);
    io.emit("planning:new_application", {
      trackingNumber: created.trackingNumber,
      serviceType: created.serviceType,
      applicant: created.applicant.fullName,
      barangay: created.applicant.barangay,
      at: created.createdAt,
    });
    broadcastSystemHealth();

    // Trigger Intake Confirmation SMS
    if (created?.applicant?.contactPhone) {
      sendSmsNotification({
        phone: created.applicant.contactPhone,
        trackingNumber: created.trackingNumber,
        eventType: "NEW_APPLICATION",
      }).catch((err) => console.warn("[SMS Service] New app SMS error:", err.message));
    }

    res.json({ ok: true, application: created });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Failed to submit application" });
  }
});

// ── Terms & Conditions and Cookie Consent Persistence ─────────────────────────
app.post("/api/terms-consent", async (req, res) => {
  try {
    const candidateIp =
      req.body?.ipAddress ||
      req.headers["cf-connecting-ip"] ||
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      "";
    const userAgent = req.headers["user-agent"] || req.body?.userAgent || "";
    const record = await recordTermsConsent({
      ...req.body,
      ipAddress: candidateIp,
      userAgent,
    });
    res.json({ ok: true, consent: record });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Failed to record terms consent" });
  }
});

app.get("/api/terms-consent", (req, res) => {
  try {
    const list = listTermsConsents();
    res.json({ ok: true, consents: list });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Failed to list terms consents" });
  }
});

app.get("/api/citizen/applications/:trackingNumber", (req, res) => {
  const app = getCitizenApplicationByTracking(req.params.trackingNumber);
  if (!app) {
    return res.status(404).json({ error: "Application not found with the provided tracking number." });
  }
  res.json({ ok: true, application: app });
});

app.get("/api/citizen/applications", (req, res) => {
  const list = listCitizenApplications();
  res.json({ ok: true, applications: list });
});

app.patch("/api/citizen/applications/:id", requireStaff, (req, res) => {
  const updated = updateCitizenApplication(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: "Application not found." });
  }
  io.emit("planning:application_updated", {
    id: updated.id,
    trackingNumber: updated.trackingNumber,
    status: updated.status,
    notes: updated.notes,
    remarks: updated.remarks,
    application: updated,
    at: updated.updatedAt,
  });
  io.emit("citizen:application_notes", {
    id: updated.id,
    trackingNumber: updated.trackingNumber,
    notes: updated.notes,
    remarks: updated.remarks,
    application: updated,
    at: updated.updatedAt,
  });
  if (updated.payment?.status === "order_of_payment_issued" || updated.status === "for_payment") {
    io.emit("assessor:order_of_payment_issued", {
      trackingNumber: updated.trackingNumber,
      orderOfPaymentNo: updated.payment?.orderOfPaymentNo,
      amount: updated.payment?.amount || updated.payment?.feeAmount,
      status: updated.status,
      at: updated.updatedAt,
    });
  }
  if (updated.payment?.status === "paid" || updated.or_number) {
    io.emit("treasury:payment_confirmed", {
      trackingNumber: updated.trackingNumber,
      orNumber: updated.or_number || updated.payment?.orNumber,
      amountPaid: updated.amount_paid || updated.payment?.amount_paid,
      status: updated.status,
      at: updated.updatedAt,
    });
  }
  broadcastSystemHealth();

  // ── Dispatch Asynchronous SMS Notification via Textbee.dev ──
  const applicantPhone = updated.applicant?.contactPhone || updated.applicant?.phone;
  if (applicantPhone) {
    const nextSt = (req.body?.status || "").toLowerCase();
    const rawNotes = (req.body?.notes || req.body?.reviewerNotes || "").trim();

    if (nextSt === "ocular_inspection" || nextSt === "for_ocular_inspection") {
      sendSmsNotification({
        phone: applicantPhone,
        trackingNumber: updated.trackingNumber,
        eventType: "STATUS_OCULAR",
        eventData: updated,
      }).catch((err) => console.warn("[SMS Service] Ocular SMS error:", err.message));
    } else if (nextSt === "for_payment" || nextSt === "approved_for_payment") {
      sendSmsNotification({
        phone: applicantPhone,
        trackingNumber: updated.trackingNumber,
        eventType: "STATUS_FOR_PAYMENT",
        eventData: updated,
      }).catch((err) => console.warn("[SMS Service] Payment SMS error:", err.message));
    } else if (nextSt === "approved" || nextSt === "completed") {
      sendSmsNotification({
        phone: applicantPhone,
        trackingNumber: updated.trackingNumber,
        eventType: "STATUS_APPROVED",
        eventData: updated,
      }).catch((err) => console.warn("[SMS Service] Approval SMS error:", err.message));
    } else if (nextSt === "denied" || nextSt === "rejected") {
      sendSmsNotification({
        phone: applicantPhone,
        trackingNumber: updated.trackingNumber,
        eventType: "STATUS_DENIED",
        eventData: updated,
      }).catch((err) => console.warn("[SMS Service] Denial SMS error:", err.message));
    } else if (nextSt === "returned" || nextSt === "flagged") {
      sendSmsNotification({
        phone: applicantPhone,
        trackingNumber: updated.trackingNumber,
        eventType: "STATUS_RETURNED",
        eventData: { ...updated, reason: req.body?.holdReason || req.body?.notes },
      }).catch((err) => console.warn("[SMS Service] Returned SMS error:", err.message));
    } else if (rawNotes) {
      sendSmsNotification({
        phone: applicantPhone,
        trackingNumber: updated.trackingNumber,
        eventType: "OFFICIAL_NOTE",
        eventData: {
          note: rawNotes,
          fromOffice: req.body?.fromOffice || (updated.status === "ocular_inspection" || updated.status === "engineering" ? "Engineering" : "MPDC"),
        },
      }).catch((err) => console.warn("[SMS Service] Note SMS error:", err.message));
    }
  }

  res.json({ ok: true, application: updated });
});

app.post("/api/citizen/applications/:trackingNumber/remarks", (req, res) => {
  const remark = addCitizenApplicationRemark(req.params.trackingNumber, req.body || {});
  if (!remark) {
    return res.status(404).json({ error: "Application not found." });
  }
  io.emit("planning:application_remark", {
    trackingNumber: req.params.trackingNumber,
    remark,
  });
  broadcastSystemHealth();

  // Dispatch SMS for official remarks sent to applicant
  if (remark && remark.fromOffice !== "Applicant") {
    const targetApp = getCitizenApplicationByTracking(req.params.trackingNumber);
    const appPhone = targetApp?.applicant?.contactPhone || targetApp?.applicant?.phone;
    if (appPhone) {
      sendSmsNotification({
        phone: appPhone,
        trackingNumber: req.params.trackingNumber,
        eventType: "OFFICIAL_NOTE",
        eventData: {
          note: remark.message,
          fromOffice: remark.fromOffice || "Opisina",
        },
      }).catch((err) => console.warn("[SMS Service] Remarks SMS error:", err.message));
    }
  }

  res.json({ ok: true, remark });
});

app.post(
  "/api/citizen/applications/:trackingNumber/receipt",
  uploadCitizenRequirement.single("file"),
  (req, res) => {
    try {
      const trackingNumber = req.params.trackingNumber;
      let receiptUrl = req.body?.receiptUrl || "";
      let originalName = req.body?.receiptOriginalName || "Official_Receipt.jpg";
      let size = Number(req.body?.receiptSize) || 0;

      if (req.file) {
        const uploadedFilePath = path.join(uploadsDir, req.file.filename);
        const secCheck = securityCheckUploadedFile(
          uploadedFilePath,
          req.file.originalname,
          req.file.mimetype,
          [".jpg", ".jpeg", ".png", ".webp", ".pdf"]
        );
        if (!secCheck.ok) {
          logSecurityEvent({
            ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
            filename: req.file.originalname,
            trackingNumber,
            reason: secCheck.error,
            code: secCheck.code,
            userAgent: req.headers["user-agent"],
          });
          return res.status(400).json({
            error: secCheck.error,
            code: secCheck.code || "FILE_SECURITY_VIOLATION",
          });
        }

        receiptUrl = `/uploads/${req.file.filename}`;
        originalName = req.file.originalname;
        size = req.file.size;

        // Mirror to dist/uploads if folder exists
        try {
          const distUploads = path.join(__dirname, "../../frontend/dist/uploads");
          if (fs.existsSync(path.dirname(distUploads))) {
            fs.mkdirSync(distUploads, { recursive: true });
            fs.copyFileSync(
              path.join(uploadsDir, req.file.filename),
              path.join(distUploads, req.file.filename)
            );
          }
        } catch {
          /* ignore */
        }
      }

      if (!receiptUrl) {
        return res.status(400).json({ error: "Kinakailangan ang litrato o kopya ng Official Receipt (O.R.)." });
      }

      const updated = submitOfficialReceipt(trackingNumber, {
        orNumber: req.body?.orNumber,
        paidAmount: req.body?.paidAmount,
        paidAt: req.body?.paidAt,
        receiptUrl,
        receiptOriginalName: originalName,
        receiptSize: size,
      });

      if (!updated) {
        return res.status(404).json({ error: "Hindi natagpuan ang aplikasyon." });
      }

      io.emit("planning:application_updated", {
        trackingNumber: updated.trackingNumber,
        status: updated.status,
        at: updated.updatedAt,
      });

      io.emit("planning:receipt_submitted", {
        trackingNumber: updated.trackingNumber,
        orNumber: updated.payment?.orNumber,
        paidAmount: updated.payment?.paidAmount,
        at: updated.updatedAt,
      });

      res.json({ ok: true, application: updated });
    } catch (err) {
      console.warn("[Receipt Upload]", err);
      res.status(500).json({ error: err?.message || "Nabigong i-save ang resibo." });
    }
  }
);

app.post(
  "/api/citizen/applications/:trackingNumber/reupload-doc",
  uploadCitizenRequirement.single("file"),
  (req, res) => {
    try {
      const trackingNumber = req.params.trackingNumber;
      const docKey = req.body?.docKey || "tctTaxDec";
      const docTitle = req.body?.docTitle || docKey;

      if (!req.file) {
        return res.status(400).json({ error: "Kinakailangang mag-upload ng file." });
      }

      const uploadedFilePath = path.join(uploadsDir, req.file.filename);
      const secCheck = securityCheckUploadedFile(
        uploadedFilePath,
        req.file.originalname,
        req.file.mimetype,
        [".jpg", ".jpeg", ".png", ".webp", ".pdf"]
      );
      if (!secCheck.ok) {
        logSecurityEvent({
          ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
          filename: req.file.originalname,
          trackingNumber,
          reason: secCheck.error,
          code: secCheck.code,
          userAgent: req.headers["user-agent"],
        });
        return res.status(400).json({
          error: secCheck.error,
          code: secCheck.code || "FILE_SECURITY_VIOLATION",
        });
      }

      // Mirror to dist/uploads if folder exists
      try {
        const distUploads = path.join(__dirname, "../../frontend/dist/uploads");
        if (fs.existsSync(path.dirname(distUploads))) {
          fs.mkdirSync(distUploads, { recursive: true });
          fs.copyFileSync(
            path.join(uploadsDir, req.file.filename),
            path.join(distUploads, req.file.filename)
          );
        }
      } catch {
        /* ignore */
      }

      const fileObj = {
        url: `/uploads/${req.file.filename}`,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      };

      const updated = reuploadCitizenDocument(trackingNumber, {
        docKey,
        docTitle,
        file: fileObj,
      });

      if (!updated) {
        return res.status(404).json({ error: "Hindi natagpuan ang aplikasyon." });
      }

      io.emit("planning:application_updated", {
        trackingNumber: updated.trackingNumber,
        status: updated.status,
        at: updated.updatedAt,
      });

      res.json({
        ok: true,
        application: updated,
        message: `Matagumpay na nai-upload ang bagong kopya para sa ${docTitle}.`,
      });
    } catch (err) {
      console.warn("[Doc Reupload Error]", err);
      res.status(500).json({ error: err?.message || "Nabigong i-upload ang dokumento." });
    }
  }
);

const inspectionStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "insp-" + uniqueSuffix + path.extname(file.originalname).toLowerCase());
  },
});

const uploadInspectionPhoto = multer({
  storage: inspectionStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Allowed formats: JPG, JPEG, PNG, WEBP (Max 25MB)"));
    }
  },
});

app.post(
  "/api/citizen/applications/:id/inspection",
  uploadInspectionPhoto.single("photo"),
  (req, res) => {
    try {
      const idOrTracking = req.params.id;
      const stage = req.body?.stage || "before_construction";
      const progress = req.body?.progress !== undefined && req.body?.progress !== "" ? Number(req.body.progress) : undefined;
      const remarks = req.body?.remarks || "";
      const inspector = req.body?.inspector || "Engr. Mario S. Baldovino (Municipal Engineering Office)";

      let photoUrl = "";
      if (req.file) {
        const uploadedFilePath = path.join(uploadsDir, req.file.filename);
        const secCheck = securityCheckUploadedFile(
          uploadedFilePath,
          req.file.originalname,
          req.file.mimetype,
          [".jpg", ".jpeg", ".png", ".webp"]
        );
        if (!secCheck.ok) {
          logSecurityEvent({
            ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
            filename: req.file.originalname,
            reason: secCheck.error,
            code: secCheck.code,
            userAgent: req.headers["user-agent"],
          });
          return res.status(400).json({ error: secCheck.error, code: secCheck.code });
        }

        photoUrl = `/uploads/${req.file.filename}`;
        try {
          const distUploads = path.join(__dirname, "../../frontend/dist/uploads");
          if (fs.existsSync(path.dirname(distUploads))) {
            fs.mkdirSync(distUploads, { recursive: true });
            fs.copyFileSync(
              path.join(uploadsDir, req.file.filename),
              path.join(distUploads, req.file.filename)
            );
          }
        } catch {
          /* ignore */
        }
      }

      let updated = updateSiteInspection(idOrTracking, {
        stage,
        progress,
        photoUrl,
        remarks,
        inspector,
      });

      if (!updated) {
        // Fallback for LGU / Municipal Infrastructure projects
        updated = updateProjectInspection(idOrTracking, {
          stage,
          progress,
          photoUrl,
          remarks,
          inspector,
        });
      }

      if (!updated) {
        return res.status(404).json({ error: "Hindi natagpuan ang aplikasyon o proyekto." });
      }

      // Real-time broadcast to map and tracker
      io.emit("projects:update", emitProjectsPayload());
      io.emit("planning:application_updated", {
        trackingNumber: updated.trackingNumber || updated.id,
        status: updated.status,
        progress: updated.progress,
        inspectionStage: updated.inspectionStage,
        at: updated.updatedAt,
      });

      // Dispatch SMS notification to applicant if application has a contact number
      const appPhone = updated.applicant?.contactPhone || updated.applicant?.phone;
      if (appPhone && updated.trackingNumber) {
        sendSmsNotification({
          phone: appPhone,
          trackingNumber: updated.trackingNumber,
          eventType: "INSPECTION_UPDATE",
          eventData: {
            stage: stage.replace(/_/g, " "),
            progress: progress,
          },
        }).catch((err) => console.warn("[SMS Service] Inspection SMS error:", err.message));
      }

      res.json({
        ok: true,
        application: updated,
        project: updated,
        message: "Matagumpay na na-update ang site inspection progress.",
      });
    } catch (err) {
      console.warn("[Site Inspection Error]", err);
      res.status(500).json({ error: err?.message || "Nabigong i-save ang inspeksyon." });
    }
  }
);

const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "doc-" + uniqueSuffix + path.extname(file.originalname).toLowerCase());
  },
});

const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: PHOTO_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".pdf", ".doc", ".docx"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Allowed: .jpg, .jpeg, .png, .webp, .pdf, .doc, .docx"));
    }
  },
});


// Upload a 2D side/supporting photo for an application
app.post(
  "/api/citizen/applications/:id/side-photos",
  uploadInspectionPhoto.single("photo"),
  (req, res) => {
    try {
      const idOrTracking = req.params.id;
      const stage = req.body?.stage || "during";
      const caption = req.body?.caption || "Side Inspection Photo";
      const inspector = req.body?.inspector || "Municipal Engineering Office";

      if (!req.file) {
        return res.status(400).json({ error: "Walang na-upload na litrato." });
      }

      const uploadedFilePath = path.join(uploadsDir, req.file.filename);
      const secCheck = securityCheckUploadedFile(
        uploadedFilePath,
        req.file.originalname,
        req.file.mimetype,
        [".jpg", ".jpeg", ".png", ".webp"]
      );
      if (!secCheck.ok) {
        logSecurityEvent({
          ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
          filename: req.file.originalname,
          reason: secCheck.error,
          code: secCheck.code,
          userAgent: req.headers["user-agent"],
        });
        return res.status(400).json({ error: secCheck.error, code: secCheck.code });
      }

      const photoUrl = `/uploads/${req.file.filename}`;
      try {
        const distUploads = path.join(__dirname, "../../frontend/dist/uploads");
        if (fs.existsSync(path.dirname(distUploads))) {
          fs.mkdirSync(distUploads, { recursive: true });
          fs.copyFileSync(
            path.join(uploadsDir, req.file.filename),
            path.join(distUploads, req.file.filename)
          );
        }
      } catch {
        /* ignore */
      }

      const result = addApplicationSidePhoto(idOrTracking, {
        photoUrl,
        stage,
        caption,
        inspector,
      });

      if (!result) {
        return res.status(404).json({ error: "Hindi natagpuan ang aplikasyon." });
      }

      io.emit("projects:update", emitProjectsPayload());
      res.json({ ok: true, application: result.app, sidePhoto: result.sidePhoto });
    } catch (err) {
      console.error("Side photo upload error:", err);
      res.status(500).json({ error: "Failed to upload side photo" });
    }
  }
);

// GET all inspection & side photos from PostgreSQL site_inspection_photos table
app.get("/api/citizen/applications/:id/photos", async (req, res) => {
  try {
    const idOrTracking = req.params.id;
    const photoType = req.query.type || null;
    const stage = req.query.stage || null;
    const photos = await getApplicationPhotos(idOrTracking, photoType, stage);
    res.json({ ok: true, photos });
  } catch (err) {
    console.error("GET application photos error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/documents/upload", requireStaff, (req, res, next) => {
  uploadDocument.single("file")(req, res, (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploadedFilePath = path.join(uploadsDir, req.file.filename);
    const secCheck = securityCheckUploadedFile(
      uploadedFilePath,
      req.file.originalname,
      req.file.mimetype,
      [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".doc", ".docx"]
    );
    if (!secCheck.ok) {
      logSecurityEvent({
        ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        filename: req.file.originalname,
        reason: secCheck.error,
        code: secCheck.code,
        userAgent: req.headers["user-agent"],
      });
      return res.status(400).json({ error: secCheck.error, code: secCheck.code });
    }

    const url = `/uploads/${req.file.filename}`;
    res.json({
      url,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype || "application/octet-stream",
      size: req.file.size,
    });
  });
});

// ── MPDC Personnel Directory ────────────────────────────────────────────────
const MPDC_PERSONNEL_FILE = path.join(__dirname, "../data/mpdc-personnel.json");

function loadMpdcPersonnel() {
  try {
    if (fs.existsSync(MPDC_PERSONNEL_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(MPDC_PERSONNEL_FILE, "utf8"));
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (p) =>
            !["Engr. Mario S. Baldovino", "Arch. Jose Marie C. Alcantara", "Engr. Clarissa V. Ramos", "Ronaldo T. Estrellado", "Maria Theresa N. Gomez"].includes(p?.name)
        );
      }
    }
  } catch (err) {
    console.warn("[MPDC Personnel] Error loading file:", err);
  }
  return [];
}

function saveMpdcPersonnel(list) {
  try {
    const dir = path.dirname(MPDC_PERSONNEL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MPDC_PERSONNEL_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.warn("[MPDC Personnel] Error saving file:", err);
  }
}

app.get("/api/mpdc/personnel", (_req, res) => {
  res.json({ ok: true, personnel: loadMpdcPersonnel() });
});

app.post("/api/mpdc/personnel", (req, res) => {
  const { name, position, role, phone, status, assignedBarangays, id, createAccount: shouldCreateAccount, username, defaultPassword } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Pangalan ng kawani ay kailangan." });
  }

  const list = loadMpdcPersonnel();
  let max = 0;
  for (const s of list) {
    const match = s.id?.match(/MPDC-(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  const newId = id?.trim() || `MPDC-${String(max + 1).padStart(3, "0")}`;
  const newPersonnel = {
    id: newId,
    name: name.trim(),
    position: (position || "Planning & Zoning Officer").trim(),
    role: (role || "Ocular Inspector").trim(),
    phone: (phone || "").trim() || "(049) 555-0100",
    status: status || "In Office",
    assignedBarangays: Array.isArray(assignedBarangays) && assignedBarangays.length > 0 ? assignedBarangays : ["All 23 Barangays"],
    createdAt: new Date().toISOString(),
  };

  list.push(newPersonnel);
  saveMpdcPersonnel(list);

  let accountCreated = null;
  if (shouldCreateAccount) {
    const userKey = (username || name.toLowerCase().replace(/[^a-z0-9]/g, "")).trim();
    const accResult = createAccount({
      name: newPersonnel.name,
      employeeId: newPersonnel.id,
      username: userKey,
      role: "MPDC",
      department: "Municipal Planning & Development Coordinator",
      defaultPassword: defaultPassword || "InfaTrack2026",
    });
    if (accResult.ok) {
      accountCreated = accResult.user;
    }
  }

  io.emit("mpdc:personnel_updated", { list });
  res.status(201).json({ ok: true, personnel: newPersonnel, list, accountCreated });
});

app.patch("/api/mpdc/personnel/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const list = loadMpdcPersonnel();
  const item = list.find((p) => p.id === id);
  if (!item) {
    return res.status(404).json({ error: "Personnel not found." });
  }
  item.status = status || (item.status === "In Office" ? "On Field" : "In Office");
  saveMpdcPersonnel(list);
  io.emit("mpdc:personnel_updated", { list });
  res.json({ ok: true, personnel: item, list });
});

app.delete("/api/mpdc/personnel/:id", (req, res) => {
  const { id } = req.params;
  let list = loadMpdcPersonnel();
  const exists = list.some((p) => p.id === id);
  if (!exists) {
    return res.status(404).json({ error: "Personnel not found." });
  }
  list = list.filter((p) => p.id !== id);
  saveMpdcPersonnel(list);
  io.emit("mpdc:personnel_updated", { list });
  res.json({ ok: true, list });
});

app.get("/api/chat/health", (_req, res) => {
  res.json({ ok: true, ...getChatConfig() });
});

app.post("/api/chat", requireStaff, async (req, res) => {
  try {
    const messages = req.body?.messages;
    const result = await chatWithOllama(messages);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    console.warn("[Chat]", err.message);
    res.status(status).json({
      error: err.message || "Chat failed",
      hint:
        status === 503
          ? `Ensure Ollama is running and run: ollama pull ${process.env.OLLAMA_MODEL || "llama3.2:1b"}`
          : undefined,
    });
  }
});

/**
 * Real-time loop (simulation fallback)
 * - emits heatmap points
 * - emits landslide risk zones
 * - emits project progress updates
 * - emits alerts on high-risk triggers
 */
let lastAlertKey = "";
let healthTickCount = 0;
setInterval(async () => {
  const bbox = {
    // Luisiana, Laguna viewport (approx)
    west: 121.43,
    south: 14.12,
    east: 121.61,
    north: 14.27,
  };

  const seed = Date.now();
  const heatmap = buildHeatPointsForBbox(bbox, { seed });
  const zones = computeRiskZones({
    bbox,
    rainfallIntensity: 0.2,
    seed,
  });
  const projects = tickProjects();

  io.emit("heatmap:update", { points: heatmap, generatedAt: new Date().toISOString() });
  io.emit("risk:update", { zones, generatedAt: new Date().toISOString() });
  io.emit("projects:update", { projects, generatedAt: new Date().toISOString() });

  const alert = createAlertFromRisk(zones);
  if (alert) {
    const key = `${alert.zoneId}:${alert.severity}:${alert.triggeredAt}`;
    if (key !== lastAlertKey) {
      lastAlertKey = key;
      io.emit("alerts:new", alert);
    }
  }

  // Live telemetry broadcast to Super Admin dashboard every 10s
  healthTickCount = (healthTickCount + 1) % 2;
  if (healthTickCount === 0) {
    broadcastSystemHealth();
  }
}, 5000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[INFA-TRACK] backend listening on http://0.0.0.0:${PORT}`);
  // Initialize PostgreSQL database connection and migrations
  initDb()
    .then(() => syncProjectsWithPostgres())
    .catch((err) => console.warn("[PostgreSQL] Startup sync warning:", err.message));
  // Large GLB uploads can take a while on slow disks / Wi‑Fi.
  server.timeout = 10 * 60 * 1000;
  server.headersTimeout = 11 * 60 * 1000;
  server.requestTimeout = 10 * 60 * 1000;
  console.log(`[INFA-TRACK] allowed client origin: ${CLIENT_ORIGIN}`);
  console.log(`[INFA-TRACK] uploads dir: ${uploadsDir}`);
  console.log(`[INFA-TRACK] chat → Ollama ${OLLAMA_BASE_URL} model=${OLLAMA_MODEL}`);

  // Build real slope cache from AWS Terrarium DEM on startup
  // Runs in background — risk zones fall back to 0.4 until ready (~5-10s)
  buildSlopeCache().catch((err) => {
    console.warn("[DEM] Slope cache build failed:", err.message);
  });
});

