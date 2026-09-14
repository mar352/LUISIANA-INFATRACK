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
import { initDb } from "./services/db.js";
import { recordTermsConsent, listTermsConsents, resolveRealPublicIp } from "./services/termsConsent.js";
import { createAlertFromRisk } from "./services/alerts.js";
import { buildSlopeCache } from "./services/dem.js";
import { chatWithOllama, getChatConfig } from "./services/chat.js";
import { lookupPlaceName } from "./services/placeName.js";
import { assessGeorisk } from "./services/georiskAssess.js";
import {
  changePassword as staffChangePassword,
  cookieHeader,
  isGlbFile,
  login as staffLogin,
  logout as staffLogout,
  requireRoles,
  requireStaff,
  sessionFromRequest,
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

const MODEL_UPLOAD_MAX_BYTES = 500 * 1024 * 1024; // 500MB — large textured Blender GLBs
const PHOTO_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase() || ".glb";
    cb(null, "model-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MODEL_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".glb" || ext === ".gltf") {
      cb(null, true);
    } else {
      cb(new Error("Only .glb and .gltf files are allowed"));
    }
  },
});

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
      const isPhoto = err.field === "photo" || err.field === "file";
      const maxMb = Math.round(
        (isPhoto ? PHOTO_UPLOAD_MAX_BYTES : MODEL_UPLOAD_MAX_BYTES) / (1024 * 1024),
      );
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

app.use(
  "/uploads",
  (req, res, next) => {
    res.removeHeader("X-Frame-Options");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Disposition", "inline");
    next();
  },
  express.static(uploadsDir, {
    setHeaders: (res) => {
      res.setHeader("Content-Disposition", "inline");
    },
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

function clientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "anon"
  );
}

app.post("/api/auth/login", (req, res) => {
  const result = staffLogin(req.body?.username, req.body?.password, clientIp(req));
  if (!result.ok) {
    const status = result.error === "locked" ? 423 : 401;
    return res.status(status).json({
      error: result.error,
      lockedUntil: result.lockedUntil || undefined,
    });
  }
  res.setHeader("Set-Cookie", cookieHeader(result.sid));
  // sid is for the mobile field app (React Native has no httpOnly cookie jar).
  res.json({ user: result.session.user, sid: result.sid });
});

app.post("/api/auth/logout", (req, res) => {
  staffLogout(req);
  res.setHeader("Set-Cookie", cookieHeader("", { clear: true }));
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const s = sessionFromRequest(req);
  if (!s) return res.json({ user: null });
  res.json({
    user: { username: s.username, role: s.role, department: s.department },
  });
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
    siteMarkerOnly: Boolean(req.body?.siteMarkerOnly),
    mapSketch: req.body?.mapSketch ?? null,
    markerColor: req.body?.markerColor || "",
    mapShape: req.body?.mapShape ?? null,
  });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ project });
});

app.patch("/api/projects/:id", requireRoles("Engineer", "MPDC"), (req, res) => {
  const project = updateProject(req.params.id, req.body);
  if (!project) return res.status(404).json({ error: "Project not found" });
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

function optimizeUploadedGlb(filePath) {
  return new Promise((resolve) => {
    const scriptPath = path.resolve(__dirname, "../../scripts/optimize-single-glb.mjs");
    if (!fs.existsSync(scriptPath)) {
      console.warn("[upload-model] Optimizer script not found at", scriptPath);
      return resolve({ ok: false, error: "Optimizer script not found" });
    }

    const child = spawn(process.execPath, [scriptPath, filePath], {
      windowsHide: true,
      timeout: 120000, // 2 minutes max
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        try {
          const res = JSON.parse(stdout.trim());
          console.info(
            `[upload-model] Auto-optimized ${path.basename(filePath)}: ${(res.beforeBytes / 1024).toFixed(1)}KB -> ${(res.afterBytes / 1024).toFixed(1)}KB (${res.savedPercent}% saved)`,
          );
          resolve(res);
        } catch {
          resolve({ ok: true });
        }
      } else {
        console.warn(`[upload-model] Optimizer warning (code ${code}):`, stderr || stdout);
        resolve({ ok: false, error: stderr || stdout });
      }
    });

    child.on("error", (err) => {
      console.warn("[upload-model] Optimizer spawn error:", err.message);
      resolve({ ok: false, error: err.message });
    });
  });
}

app.post("/api/upload-model", requireRoles("Engineer"), (req, res, next) => {
  upload.single("model")(req, res, async (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    if (!isGlbFile(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: "File is not a valid GLB/GLTF model." });
    }

    const originalSize = req.file.size;

    // Automatically optimize custom uploaded GLB (merge draw calls, compress textures, Draco)
    const optResult = await optimizeUploadedGlb(req.file.path);
    let finalSize = originalSize;
    try {
      finalSize = fs.statSync(req.file.path).size;
    } catch {
      /* ignore */
    }

    // Also mirror into frontend/dist/uploads when present (vite preview / static builds).
    try {
      const distUploads = path.join(__dirname, "../../frontend/dist/uploads");
      if (fs.existsSync(path.dirname(distUploads))) {
        fs.mkdirSync(distUploads, { recursive: true });
        fs.copyFileSync(
          path.join(uploadsDir, req.file.filename),
          path.join(distUploads, req.file.filename),
        );
        const lodFilename = req.file.filename.replace(/\.glb$/i, ".lod.glb");
        const srcLod = path.join(uploadsDir, lodFilename);
        if (fs.existsSync(srcLod)) {
          fs.copyFileSync(srcLod, path.join(distUploads, lodFilename));
        }
      }
    } catch (copyErr) {
      console.warn("[upload-model] dist mirror skipped:", copyErr?.message || copyErr);
    }

    const url = `/uploads/${req.file.filename}`;
    res.json({
      url,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: finalSize,
      originalSize,
      optimized: Boolean(optResult?.ok),
      savedPercent: optResult?.savedPercent ?? 0,
      drawCallsBefore: optResult?.beforeStats?.prims ?? null,
      drawCallsAfter: optResult?.afterStats?.prims ?? null,
    });
  });
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
  if (updated.payment?.status === "paid" || updated.or_number) {
    io.emit("treasury:payment_confirmed", {
      trackingNumber: updated.trackingNumber,
      orNumber: updated.or_number || updated.payment?.orNumber,
      amountPaid: updated.amount_paid || updated.payment?.amount_paid,
      status: updated.status,
      at: updated.updatedAt,
    });
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

      const updated = updateSiteInspection(idOrTracking, {
        stage,
        progress,
        photoUrl,
        remarks,
        inspector,
      });

      if (!updated) {
        return res.status(404).json({ error: "Hindi natagpuan ang aplikasyon." });
      }

      // Real-time broadcast to map and tracker
      io.emit("projects:update", emitProjectsPayload());
      io.emit("planning:application_updated", {
        trackingNumber: updated.trackingNumber,
        status: updated.status,
        progress: updated.progress,
        inspectionStage: updated.inspectionStage,
        at: updated.updatedAt,
      });

      res.json({
        ok: true,
        application: updated,
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

io.on("connection", (socket) => {
  socket.emit("hello", {
    system: "INFA-TRACK-Luisiana",
    serverTime: new Date().toISOString(),
    updateEverySeconds: 5,
  });
});

/**
 * Real-time loop (simulation fallback)
 * - emits heatmap points
 * - emits landslide risk zones
 * - emits project progress updates
 * - emits alerts on high-risk triggers
 */
let lastAlertKey = "";
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
}, 5000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[INFA-TRACK] backend listening on http://0.0.0.0:${PORT}`);
  // Initialize PostgreSQL database connection and migrations
  void initDb();
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

