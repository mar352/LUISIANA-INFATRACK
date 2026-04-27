import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import { buildHeatPointsForBbox, computeRiskZones } from "./services/risk.js";
import { getWeatherSnapshot } from "./services/weather.js";
import { projectsSeed, tickProjects } from "./services/projects.js";
import { createAlertFromRisk } from "./services/alerts.js";

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const LOCALHOST_ORIGIN_RE = /^http:\/\/localhost:\d+$/;

const app = express();
app.use(express.json({ limit: "2mb" }));
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
  res.json({ projects: projectsSeed() });
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
    system: "IMPACT-Luisiana",
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

server.listen(PORT, () => {
  // Intentionally minimal: this project is meant to run in LGU environments
  // where logs should stay readable for operators.
  console.log(`[IMPACT] backend listening on http://localhost:${PORT}`);
  console.log(`[IMPACT] allowed client origin: ${CLIENT_ORIGIN}`);
});

