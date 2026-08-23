import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { buildHeatPointsForBbox, computeRiskZones } from "./services/risk.js";
import { getWeatherSnapshot } from "./services/weather.js";
import { getTropicalSystems } from "./services/tropicalSystems.js";
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
import { createAlertFromRisk } from "./services/alerts.js";
import { buildSlopeCache } from "./services/dem.js";
import { chatWithOllama, getChatConfig } from "./services/chat.js";
import { lookupPlaceName } from "./services/placeName.js";
import { assessGeorisk } from "./services/georiskAssess.js";

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
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsDir));
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

app.get("/health", (_req, res) => res.json({ ok: true }));

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
app.get("/api/weather", async (req, res) => {
  // Default to Luisiana, Laguna for LGU focus
  const { lat = "14.19", lon = "121.51" } = req.query;
  const snapshot = await getWeatherSnapshot({
    lat: Number(lat),
    lon: Number(lon),
  });
  res.json(snapshot);
});

/** West Pacific Invest / TC systems (RAMMB proxy; PH AOI → LPA-watch). */
app.get("/api/tropical-systems", async (req, res) => {
  const force = req.query.refresh === "1" || req.query.refresh === "true";
  try {
    const payload = await getTropicalSystems({ force });
    res.json(payload);
  } catch (err) {
    console.error("tropical-systems:", err);
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to fetch tropical systems",
      systems: [],
    });
  }
});

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

app.get("/api/projects", (_req, res) => {
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

app.get("/api/engagement", (req, res) => {
  const kind = req.query.kind ? String(req.query.kind) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  res.json({
    submissions: listEngagement({ kind, status }),
    generatedAt: new Date().toISOString(),
  });
});

app.patch("/api/engagement/:id", (req, res) => {
  const result = updateEngagement(req.params.id, req.body || {});
  if (!result) return res.status(404).json({ error: "Submission not found" });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ submission: result.submission });
});

app.get("/api/engagement/stats", (_req, res) => {
  res.json({ stats: engagementPublicStats(), generatedAt: new Date().toISOString() });
});

app.post("/api/projects", (req, res) => {
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
  });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ project });
});

app.patch("/api/projects/:id", (req, res) => {
  const project = updateProject(req.params.id, req.body);
  if (!project) return res.status(404).json({ error: "Project not found" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ project });
});

app.post("/api/projects/:id/milestones", (req, res) => {
  const milestone = addMilestone(req.params.id, req.body);
  if (!milestone) return res.status(400).json({ error: "Invalid project or milestone data" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ milestone });
});

app.patch("/api/projects/:id/milestones/:mid", (req, res) => {
  const milestone = completeMilestone(req.params.id, req.params.mid);
  if (!milestone) return res.status(404).json({ error: "Milestone not found" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ milestone });
});

app.post("/api/projects/:id/issues", (req, res) => {
  const issue = reportIssue(req.params.id, req.body);
  if (!issue) return res.status(400).json({ error: "Invalid project or issue data" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ issue });
});

app.patch("/api/projects/:id/issues/:iid", (req, res) => {
  const issue = resolveIssue(req.params.id, req.params.iid);
  if (!issue) return res.status(404).json({ error: "Issue not found" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ issue });
});

app.get("/api/projects/:id/report", (req, res) => {
  const report = generateAccomplishmentReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Project not found" });
  res.json({ report });
});

app.post("/api/projects/:id/photos", (req, res, next) => {
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
    });
    if (!photo) return res.status(404).json({ error: "Project not found" });
    io.emit("projects:update", emitProjectsPayload());
    res.json({ photo });
  });
});

app.delete("/api/projects/:id/photos/:photoId", (req, res) => {
  const removed = removeProjectPhoto(req.params.id, req.params.photoId);
  if (!removed) return res.status(404).json({ error: "Photo or project not found" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ ok: true });
});

app.post("/api/upload-model", (req, res, next) => {
  upload.single("model")(req, res, (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
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
      }
    } catch (copyErr) {
      console.warn("[upload-model] dist mirror skipped:", copyErr?.message || copyErr);
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

app.delete("/api/projects/:id", (req, res) => {
  const removed = removeProject(req.params.id);
  if (!removed) return res.status(404).json({ error: "Project not found" });
  io.emit("projects:update", emitProjectsPayload());
  res.json({ ok: true });
});

app.post("/api/planning/notify", (req, res) => {
  io.emit("planning:update", {
    kind: req.body?.kind || "update",
    at: req.body?.at || new Date().toISOString(),
  });
  res.json({ ok: true });
});

app.post("/api/planning/attachments", (req, res, next) => {
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

app.post("/api/documents/upload", (req, res, next) => {
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

app.post("/api/chat", async (req, res) => {
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
 * - emits weather snapshots
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

  const weather = await getWeatherSnapshot({ lat: 14.19, lon: 121.51 });
  const heatmap = buildHeatPointsForBbox(bbox, { seed: weather.seed });
  const zones = computeRiskZones({
    bbox,
    rainfallIntensity: weather.rainfallIntensity,
    seed: weather.seed,
  });
  const projects = tickProjects();

  io.emit("weather:update", weather);
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

