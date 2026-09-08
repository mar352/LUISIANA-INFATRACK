import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { listCitizenApplications } from "./citizenApplications.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH =
  process.env.PROJECTS_DATA_PATH ||
  path.join(__dirname, "../../data/projects.json");

const VALID_STATUSES = ["Planned", "Ongoing", "Delayed", "Completed", "Suspended"];

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260427;
const r = mulberry32(SEED);

let state = null;
let nextId = 1;

function modelTypeToLegacyType(modelType) {
  if (!modelType) return "Private Building";
  if (["road", "bridge", "water_tank", "solar_farm", "municipal_hall", "rhu"].includes(modelType)) return "Municipal Project";
  if (["barn"].includes(modelType)) return "Agricultural Structure";
  if (modelType === "shape") return "Municipal Project";
  return "Private Building";
}

function normalizeStatus(status) {
  if (status === "Planning") return "Planned";
  return VALID_STATUSES.includes(status) ? status : "Planned";
}

function ensureProjectShape(p) {
  return {
    ...p,
    status: normalizeStatus(p.status),
    milestones: Array.isArray(p.milestones) ? p.milestones : [],
    issues: Array.isArray(p.issues) ? p.issues : [],
    photos: (Array.isArray(p.photos) ? p.photos : []).map((ph) => ({
      ...ph,
      // Legacy uploads were progress photos; keep them there.
      kind: ph.kind === "site" ? "site" : "progress",
      lat: Number.isFinite(Number(ph.lat)) ? Number(ph.lat) : null,
      lon: Number.isFinite(Number(ph.lon)) ? Number(ph.lon) : null,
    })),
    activityLog: Array.isArray(p.activityLog) ? p.activityLog : [],
    budgetTotal: p.budgetTotal ?? null,
    budgetSpent: p.budgetSpent ?? 0,
    description: p.description ?? "",
    startDate: p.startDate ?? null,
    targetEndDate: p.targetEndDate ?? null,
    barangay: p.barangay ?? "",
    fundingSource: p.fundingSource ?? "",
    contractor: p.contractor ?? "",
    officialUrl: p.officialUrl ? String(p.officialUrl) : "",
    lifecyclePhase: p.lifecyclePhase ?? "Planning",
    rotation: Number.isFinite(Number(p.rotation)) ? Number(p.rotation) : 0,
    modelScale: Number.isFinite(Number(p.modelScale)) ? Number(p.modelScale) : 1,
    modelScaleX: Number.isFinite(Number(p.modelScaleX)) ? Number(p.modelScaleX) : 1,
    modelScaleY: Number.isFinite(Number(p.modelScaleY)) ? Number(p.modelScaleY) : 1,
    modelScaleZ: Number.isFinite(Number(p.modelScaleZ)) ? Number(p.modelScaleZ) : 1,
    modelHeight: Number.isFinite(Number(p.modelHeight)) ? Number(p.modelHeight) : 0,
    modelLocked: Boolean(p.modelLocked),
    siteMarkerOnly: Boolean(p.siteMarkerOnly),
    markerColor: p.markerColor ? String(p.markerColor) : "",
    mapSketch: normalizeMapSketch(p.mapSketch),
    mapShape: normalizeMapShape(p.mapShape),
  };
}

const SHAPE_KINDS = [
  "freeform",
  "box",
  "cylinder",
  "gable",
  "hip",
  "pyramid",
  "tree_broadleaf",
  "tree_conifer",
  "tree_bush",
];

function normalizeMapShape(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!SHAPE_KINDS.includes(raw.kind)) return null;
  const n = (v, fallback) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  };
  const footprint = Array.isArray(raw.footprint)
    ? raw.footprint
        .map((c) => ({ lon: Number(c?.lon ?? c?.lng), lat: Number(c?.lat) }))
        .filter((c) => Number.isFinite(c.lon) && Number.isFinite(c.lat))
    : undefined;
  return {
    kind: raw.kind,
    color: typeof raw.color === "string" && raw.color ? raw.color : "#c8ccd4",
    width: n(raw.width, 8),
    depth: n(raw.depth, 8),
    height: n(raw.height, 8),
    radius: n(raw.radius, 4),
    ...(footprint && footprint.length >= 3 ? { footprint } : {}),
  };
}

function normalizeMapSketch(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = raw.kind === "line" || raw.kind === "area" || raw.kind === "pin" ? raw.kind : "pin";
  const color = typeof raw.color === "string" && raw.color ? raw.color : "#c47a1a";
  const coordinates = Array.isArray(raw.coordinates)
    ? raw.coordinates
        .map((c) => ({
          lon: Number(c?.lon ?? c?.lng),
          lat: Number(c?.lat),
        }))
        .filter((c) => Number.isFinite(c.lon) && Number.isFinite(c.lat))
    : [];
  if (!coordinates.length) return null;
  return { kind, color, coordinates };
}

function logActivity(project, message) {
  project.activityLog.unshift({ at: new Date().toISOString(), message });
  project.activityLog = project.activityLog.slice(0, 50);
}

function hasRecentActivity(project, prefix) {
  return project.activityLog.some((a) => a.message.startsWith(prefix));
}

function saveState() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const toSave = (state || []).filter((p) => !p.isPrivateApplication && !p.siteMarkerOnly);
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify({ projects: toSave, nextId }, null, 2),
    "utf8"
  );
}

export function getPrivateInfraProjects() {
  try {
    const apps = listCitizenApplications();
    const privates = [];
    for (const app of apps) {
      const isPrivate =
        app.category === "private_infrastructure" ||
        app.serviceType === "zoning_certificate" ||
        Boolean(app.lotDetails?.proposedBuildingType);
      const lat = Number(app.latitude ?? app.lotDetails?.lat ?? app.coordinates?.lat);
      const lon = Number(app.longitude ?? app.lotDetails?.lon ?? app.coordinates?.lon);
      if (!isPrivate || !lat || !lon) continue;

      // STRICT: Wag muna i-pin sa map yung mga hindi pa na-a-approve ng Engineer!
      // Tanging ang mga may engineerApproved === true o status === "approved_for_construction" ang mai-pin.
      const isApprovedToPin =
        app.engineerApproved === true ||
        app.status === "approved_for_construction";

      if (!isApprovedToPin) continue;

      const title =
        app.projectTitle ||
        app.title ||
        `${app.applicant?.fullName || "Private"} - ${app.lotDetails?.proposedBuildingType || "Residential"}`;
      const name = `${title} (${app.trackingNumber})`;

      const numericProgress = Number(app.latestInspection?.progress ?? app.progress ?? (app.status === "approved" ? 100 : 0));
      const stage = app.latestInspection?.stage || (numericProgress >= 100 ? "after_construction" : numericProgress >= 50 ? "during_construction" : "before_construction");
      const pinColor = numericProgress >= 100 ? "#22c55e" : numericProgress >= 50 ? "#eab308" : "#ef4444";
      const pinCategory = numericProgress >= 100 ? "green" : numericProgress >= 50 ? "yellow" : "red";

      privates.push({
        id: app.id || app.trackingNumber,
        name,
        modelType: "office",
        type: "Private Building",
        department: "Engineering",
        status: numericProgress >= 100 ? "Completed" : numericProgress >= 50 ? "Ongoing" : "Planned",
        progress: numericProgress,
        inspectionStage: stage,
        location: { lat, lon },
        rotation: 0,
        modelLocked: true,
        siteMarkerOnly: true,
        isPrivateApplication: true,
        mapSketch: null,
        markerColor: pinColor,
        pinCategory,
        latestInspection: app.latestInspection || null,
        inspectionPhotos: Array.isArray(app.inspectionPhotos) ? app.inspectionPhotos : [],
        applicantName: app.applicant?.fullName || "",
        trackingNumber: app.trackingNumber,
        buildingType: app.lotDetails?.proposedBuildingType || "Residential",
        description: `Private Infrastructure Application: ${app.trackingNumber} | Proponent: ${app.applicant?.fullName || "—"} | Lot: ${app.lotDetails?.lotLocationDescription || app.applicant?.address || "Luisiana"}`,
        startDate: app.createdAt || null,
        targetEndDate: null,
        budgetTotal: app.estimatedCost || null,
        budgetSpent: 0,
        barangay: app.applicant?.barangay || "",
        fundingSource: "Private / Proponent",
        contractor: app.applicant?.fullName || "Private Property Owner",
        lifecyclePhase: numericProgress >= 100 ? "Turnover" : numericProgress >= 50 ? "Construction" : "Planning",
        milestones: [],
        issues: [],
        photos: [],
        activityLog: [
          {
            at: app.createdAt || new Date().toISOString(),
            message: `Private infrastructure submitted & pinned via application ${app.trackingNumber}.`,
          },
        ],
        updatedAt: app.updatedAt || app.createdAt || new Date().toISOString(),
        isPrivateApplication: true,
      });
    }
    return privates;
  } catch (err) {
    console.warn("[projects] failed to load private infra projects:", err.message);
    return [];
  }
}

function loadFromDisk() {
  if (!fs.existsSync(DATA_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    const now = new Date().toISOString();
    let repaired = false;
    const projects = (raw.projects || [])
      .filter((p) => !p.siteMarkerOnly && !p.isPrivateApplication && p.modelType !== "custom" && !p.customModelUrl)
      .map((p) => {
        const shaped = ensureProjectShape(p);
        if (repairSitePinSimulation(shaped, now)) repaired = true;
        return shaped;
      });
    nextId = raw.nextId ?? 1;
    if (repaired) {
      state = projects;
      saveState();
    }
    return projects;
  } catch (err) {
    console.warn("[projects] Failed to load data file, starting empty:", err.message);
    return null;
  }
}

export function projectsSeed() {
  if (!state) {
    const loaded = loadFromDisk();
    if (loaded) {
      state = loaded.filter((p) => !p.siteMarkerOnly && !p.isPrivateApplication && p.modelType !== "custom" && !p.customModelUrl);
    } else {
      state = [];
      nextId = 1;
      saveState();
    }
  } else if (state.some((p) => (p.siteMarkerOnly && !p.isPrivateApplication) || p.modelType === "custom" || p.customModelUrl)) {
    state = state.filter((p) => (!p.siteMarkerOnly || p.isPrivateApplication) && p.modelType !== "custom" && !p.customModelUrl);
    saveState();
  }

  const privates = getPrivateInfraProjects();
  return [...state, ...privates];
}

function findProject(id) {
  return projectsSeed().find((p) => p.id === id);
}

function hasOpenDelayIssue(project) {
  return project.issues.some((i) => i.kind === "delay" && !i.resolvedAt);
}

function countOpenIssues(project) {
  return project.issues.filter((i) => !i.resolvedAt).length;
}

function countMissedMilestones(project) {
  return project.milestones.filter((m) => m.status === "missed").length;
}

function allMilestonesDone(project) {
  return project.milestones.length > 0 && project.milestones.every((m) => m.status === "done");
}

function budgetUtilization(project) {
  if (!project.budgetTotal || project.budgetTotal <= 0) return null;
  return Math.round(((project.budgetSpent ?? 0) / project.budgetTotal) * 100);
}

function updateMilestoneStatuses(project, nowIso) {
  const today = nowIso.slice(0, 10);
  for (const m of project.milestones) {
    if (m.status === "done") continue;
    if (m.targetDate < today) m.status = "missed";
  }
}

function maybeMarkDelayed(project, nowIso) {
  if (project.status === "Completed" || project.status === "Suspended") return;
  if (hasOpenDelayIssue(project)) {
    if (project.status !== "Delayed") {
      project.status = "Delayed";
      logActivity(project, "Status auto-set to Delayed (open delay report).");
    }
    return;
  }
  if (countMissedMilestones(project) >= 2 && project.status === "Ongoing") {
    project.status = "Delayed";
    logActivity(project, "Status auto-set to Delayed (2+ missed milestones).");
    return;
  }
  if (
    project.targetEndDate &&
    project.targetEndDate < nowIso.slice(0, 10) &&
    project.progress < 100
  ) {
    if (project.status !== "Delayed") {
      project.status = "Delayed";
      logActivity(project, "Status auto-set to Delayed (past target end date).");
    }
  }
}

function isSitePin(project) {
  return Boolean(project?.siteMarkerOnly);
}

function wasAutoAdvancedSitePin(project) {
  return (project.activityLog || []).some((a) => {
    const msg = String(a?.message || "");
    return (
      msg.includes("automated start") ||
      msg.includes("Progress reached 100% — marked Completed.")
    );
  });
}

/** Site pins are markup only — never treat them as construction progress. */
function repairSitePinSimulation(project, nowIso) {
  if (!isSitePin(project) || !wasAutoAdvancedSitePin(project)) return false;
  if (project.status !== "Ongoing" && project.status !== "Completed") return false;

  project.status = "Planned";
  project.progress = 0;
  project.activityLog = (project.activityLog || []).filter((a) => {
    const msg = String(a?.message || "");
    return (
      !msg.includes("automated start") &&
      !msg.includes("Progress reached 100% — marked Completed.")
    );
  });
  logActivity(project, "Status restored to Planned (pinned site is not construction).");
  project.updatedAt = nowIso;
  return true;
}

function applyAutomationRules(project, nowIso) {
  if (isSitePin(project)) return;

  const today = nowIso.slice(0, 10);

  updateMilestoneStatuses(project, nowIso);
  maybeMarkDelayed(project, nowIso);

  if (project.status === "Planned" && project.startDate && project.startDate <= today) {
    project.status = "Ongoing";
    if (project.progress <= 0) project.progress = 5;
    logActivity(project, "Status changed to Ongoing (start date reached).");
    project.updatedAt = nowIso;
  }

  const openIssues = countOpenIssues(project);
  if (project.status === "Ongoing" && openIssues >= 5) {
    project.status = "Suspended";
    logActivity(project, "Status auto-set to Suspended (5+ unresolved issues).");
    project.updatedAt = nowIso;
  }

  const util = budgetUtilization(project);
  if (util != null && util >= 100 && !hasRecentActivity(project, "Budget alert:")) {
    logActivity(project, `Budget alert: utilization at ${util}% (over budget).`);
  } else if (util != null && util >= 90 && util < 100 && !hasRecentActivity(project, "Budget alert:")) {
    logActivity(project, `Budget alert: utilization at ${util}% (approaching limit).`);
  }

  if (
    project.status === "Ongoing" &&
    allMilestonesDone(project) &&
    project.progress < 100
  ) {
    const next = Math.min(100, project.progress + 10);
    project.progress = next;
    logActivity(project, `Progress boosted to ${next}% (all milestones completed).`);
    if (next >= 100) {
      project.status = "Completed";
      logActivity(project, "Progress reached 100% — marked Completed.");
    }
    project.updatedAt = nowIso;
  }

  if (
    project.status === "Delayed" &&
    !hasOpenDelayIssue(project) &&
    countMissedMilestones(project) === 0 &&
    project.progress < 100
  ) {
    project.status = "Ongoing";
    logActivity(project, "Status restored to Ongoing (delays cleared, milestones on track).");
    project.updatedAt = nowIso;
  }
}

export function tickProjects() {
  const projects = projectsSeed();
  const now = new Date().toISOString();

  for (const p of projects) {
    if (isSitePin(p)) {
      repairSitePinSimulation(p, now);
      continue;
    }

    applyAutomationRules(p, now);

    if (p.status === "Ongoing" && !hasOpenDelayIssue(p)) {
      const delta = 0.4 + r() * 1.2;
      p.progress = Math.min(100, Math.round((p.progress + delta) * 10) / 10);
      if (p.progress >= 100) {
        p.progress = 100;
        p.status = "Completed";
        logActivity(p, "Progress reached 100% — marked Completed.");
      }
      p.updatedAt = now;
    } else if (p.status === "Planned" && r() < 0.02) {
      p.status = "Ongoing";
      p.progress = Math.round(5 + r() * 10);
      logActivity(p, "Status changed to Ongoing (automated start).");
      p.updatedAt = now;
    }
  }

  saveState();
  return projects;
}

export function addProject({
  name,
  modelType,
  type,
  department,
  location,
  rotation = 0,
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
  siteMarkerOnly,
  mapSketch,
  markerColor,
  mapShape,
}) {
  const projects = projectsSeed();
  const id = `P${nextId++}`;
  const normalizedStatus = normalizeStatus(status || "Planned");
  const sketch = normalizeMapSketch(mapSketch);
  const project = ensureProjectShape({
    id,
    name: name || `New ${modelType}`,
    modelType: modelType || "office",
    type: type || modelTypeToLegacyType(modelType),
    department: department || "Engineering",
    status: normalizedStatus,
    progress: Math.max(0, Math.min(100, Number(progress) || 0)),
    location,
    rotation,
    customModelUrl,
    modelLocked: siteMarkerOnly ? true : false,
    siteMarkerOnly: Boolean(siteMarkerOnly),
    mapSketch: sketch,
    mapShape: normalizeMapShape(mapShape),
    markerColor: markerColor || sketch?.color || "",
    description: description || "",
    startDate: startDate || null,
    targetEndDate: targetEndDate || null,
    budgetTotal: budgetTotal != null ? Number(budgetTotal) : null,
    budgetSpent: budgetSpent != null ? Number(budgetSpent) : 0,
    barangay: barangay || "",
    fundingSource: fundingSource || "LGU",
    contractor: contractor || "",
    lifecyclePhase: lifecyclePhase || "Planning",
    milestones: [],
    issues: [],
    photos: [],
    activityLog: [],
    updatedAt: new Date().toISOString(),
  });
  logActivity(
    project,
    siteMarkerOnly
      ? `Site markup placed (${sketch?.kind || "pin"}) — map drawing only, no 3D model yet.`
      : `Project created with status ${project.status}.`,
  );
  projects.push(project);
  saveState();
  return project;
}

export function updateProject(id, patch) {
  const project = findProject(id);
  if (!project) return null;

  if (patch.status !== undefined) {
    const next = normalizeStatus(patch.status);
    if (project.status !== next) {
      project.status = next;
      logActivity(project, `Status updated to ${next}.`);
      if (next === "Completed") project.progress = 100;
    }
  }

  if (patch.progress !== undefined) {
    const next = Math.max(0, Math.min(100, Number(patch.progress)));
    if (project.progress !== next) {
      project.progress = next;
      logActivity(project, `Progress updated to ${next}%.`);
      if (next >= 100 && project.status !== "Suspended") {
        project.status = "Completed";
        logActivity(project, "Progress reached 100% — marked Completed.");
      }
    }
  }

  if (patch.description !== undefined) project.description = String(patch.description);
  if (patch.startDate !== undefined) project.startDate = patch.startDate || null;
  if (patch.targetEndDate !== undefined) project.targetEndDate = patch.targetEndDate || null;
  if (patch.name !== undefined) {
    const next = String(patch.name).trim();
    if (next) project.name = next;
  }
  if (patch.customModelUrl !== undefined) {
    project.customModelUrl = patch.customModelUrl ? String(patch.customModelUrl) : undefined;
  }
  if (patch.modelType !== undefined) {
    project.modelType = String(patch.modelType);
  }
  if (patch.department !== undefined) {
    project.department = String(patch.department);
  }
  if (patch.barangay !== undefined) {
    project.barangay = String(patch.barangay || "");
  }
  if (patch.fundingSource !== undefined) {
    project.fundingSource = String(patch.fundingSource || "");
  }
  if (patch.contractor !== undefined) {
    project.contractor = String(patch.contractor || "");
  }
  if (patch.officialUrl !== undefined) {
    project.officialUrl = String(patch.officialUrl || "").trim();
  }
  if (patch.lifecyclePhase !== undefined) {
    project.lifecyclePhase = String(patch.lifecyclePhase || "Planning");
  }

  if (patch.budgetTotal !== undefined) {
    project.budgetTotal = patch.budgetTotal == null ? null : Number(patch.budgetTotal);
    logActivity(project, "Budget total updated.");
  }
  if (patch.budgetSpent !== undefined) {
    project.budgetSpent = Number(patch.budgetSpent) || 0;
    logActivity(project, "Budget spent updated.");
  }

  if (patch.modelLocked !== undefined) {
    const next = Boolean(patch.modelLocked);
    if (project.modelLocked !== next) {
      project.modelLocked = next;
      logActivity(project, next ? "3D model locked on map." : "3D model unlocked on map.");
    }
  }

  if (patch.siteMarkerOnly !== undefined) {
    const next = Boolean(patch.siteMarkerOnly);
    if (project.siteMarkerOnly !== next) {
      project.siteMarkerOnly = next;
      logActivity(
        project,
        next
          ? "Showing as site pin only (no 3D model)."
          : "3D model placement enabled for this site.",
      );
      if (next) project.modelLocked = true;
    }
  }

  if (patch.mapSketch !== undefined) {
    project.mapSketch = normalizeMapSketch(patch.mapSketch);
    if (project.mapSketch?.color) project.markerColor = project.mapSketch.color;
    logActivity(project, "Map sketch updated.");
  }

  if (patch.mapShape !== undefined) {
    project.mapShape = normalizeMapShape(patch.mapShape);
    logActivity(project, "Map shape updated.");
  }

  if (patch.markerColor !== undefined) {
    project.markerColor = String(patch.markerColor || "");
    if (project.mapSketch) project.mapSketch = { ...project.mapSketch, color: project.markerColor || project.mapSketch.color };
    logActivity(project, "Marker color updated.");
  }

  if (patch.hideBadge !== undefined) {
    project.hideBadge = Boolean(patch.hideBadge);
  }

  if (project.modelLocked) {
    // Locked models keep position/rotation/scale fixed until unlocked
    if (
      patch.location !== undefined ||
      patch.rotation !== undefined ||
      patch.modelScale !== undefined ||
      patch.modelScaleX !== undefined ||
      patch.modelScaleY !== undefined ||
      patch.modelScaleZ !== undefined ||
      patch.modelHeight !== undefined
    ) {
      // strip transform changes when locked (modelLocked toggle above still applies)
      delete patch.location;
      delete patch.rotation;
      delete patch.modelScale;
      delete patch.modelScaleX;
      delete patch.modelScaleY;
      delete patch.modelScaleZ;
      delete patch.modelHeight;
    }
  }

  if (patch.location !== undefined) {
    const lat = Number(patch.location?.lat);
    const lon = Number(patch.location?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      project.location = { lat, lon };
    }
  }
  if (patch.rotation !== undefined) {
    const rotation = Number(patch.rotation);
    if (Number.isFinite(rotation)) project.rotation = rotation;
  }
  if (patch.modelScale !== undefined) {
    const scale = Number(patch.modelScale);
    if (Number.isFinite(scale)) {
      project.modelScale = Math.max(0.001, Math.min(100, scale));
    }
  }
  for (const key of ["modelScaleX", "modelScaleY", "modelScaleZ"]) {
    if (patch[key] !== undefined) {
      const n = Number(patch[key]);
      if (Number.isFinite(n)) project[key] = Math.max(0.001, Math.min(100, n));
    }
  }
  if (patch.modelHeight !== undefined) {
    const h = Number(patch.modelHeight);
    if (Number.isFinite(h)) {
      // 0 = ground-clamped (no elevation); allow tiny negative for pivot fixes
      project.modelHeight = Math.max(-50, Math.min(500, h));
    }
  }
  if (
    patch.location !== undefined ||
    patch.rotation !== undefined ||
    patch.modelScale !== undefined ||
    patch.modelScaleX !== undefined ||
    patch.modelScaleY !== undefined ||
    patch.modelScaleZ !== undefined ||
    patch.modelHeight !== undefined
  ) {
    logActivity(project, "3D model position, rotation, or scale updated.");
  }

  project.updatedAt = new Date().toISOString();
  saveState();
  return project;
}

export function addMilestone(projectId, { title, targetDate }) {
  const project = findProject(projectId);
  if (!project) return null;
  if (!title || !targetDate) return null;

  const milestone = {
    id: `M${Date.now()}`,
    title: String(title),
    targetDate: String(targetDate).slice(0, 10),
    status: "pending",
  };
  project.milestones.push(milestone);
  logActivity(project, `Milestone added: ${milestone.title}.`);
  project.updatedAt = new Date().toISOString();
  saveState();
  return milestone;
}

export function completeMilestone(projectId, milestoneId) {
  const project = findProject(projectId);
  if (!project) return null;

  const m = project.milestones.find((x) => x.id === milestoneId);
  if (!m) return null;

  m.status = "done";
  m.completedAt = new Date().toISOString();
  logActivity(project, `Milestone completed: ${m.title}.`);
  project.updatedAt = new Date().toISOString();
  saveState();
  return m;
}

export function reportIssue(projectId, { kind, title, description }) {
  const project = findProject(projectId);
  if (!project) return null;
  if (!kind || !title) return null;

  const issue = {
    id: `I${Date.now()}`,
    kind: kind === "delay" ? "delay" : "issue",
    title: String(title),
    description: String(description || ""),
    reportedAt: new Date().toISOString(),
  };
  project.issues.unshift(issue);
  logActivity(project, `${issue.kind === "delay" ? "Delay" : "Issue"} reported: ${issue.title}.`);

  if (issue.kind === "delay" && project.status !== "Completed" && project.status !== "Suspended") {
    project.status = "Delayed";
    logActivity(project, "Status set to Delayed due to delay report.");
  }

  project.updatedAt = new Date().toISOString();
  saveState();
  return issue;
}

export function resolveIssue(projectId, issueId) {
  const project = findProject(projectId);
  if (!project) return null;

  const issue = project.issues.find((i) => i.id === issueId);
  if (!issue) return null;

  issue.resolvedAt = new Date().toISOString();
  logActivity(project, `${issue.kind === "delay" ? "Delay" : "Issue"} resolved: ${issue.title}.`);

  if (issue.kind === "delay" && project.status === "Delayed" && !hasOpenDelayIssue(project)) {
    project.status = "Ongoing";
    logActivity(project, "Status restored to Ongoing (delay resolved).");
  }

  project.updatedAt = new Date().toISOString();
  saveState();
  return issue;
}

export function removeProject(id) {
  const projects = projectsSeed();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  projects.splice(idx, 1);
  saveState();
  return true;
}

export function addProjectPhoto(projectId, { url, caption, milestoneId, kind, lat, lon }) {
  const project = findProject(projectId);
  if (!project || !url) return null;

  const photoKind = kind === "site" ? "site" : "progress";
  const gpsLat = Number(lat);
  const gpsLon = Number(lon);
  const photo = {
    id: `PH${Date.now()}`,
    url: String(url),
    caption: caption ? String(caption) : "",
    kind: photoKind,
    milestoneId: photoKind === "progress" ? milestoneId || null : null,
    uploadedAt: new Date().toISOString(),
    lat: Number.isFinite(gpsLat) ? gpsLat : null,
    lon: Number.isFinite(gpsLon) ? gpsLon : null,
  };
  project.photos.unshift(photo);
  const label = photoKind === "site" ? "Site photo" : "Progress photo";
  logActivity(project, `${label} uploaded${photo.caption ? `: ${photo.caption}` : ""}.`);
  project.updatedAt = new Date().toISOString();
  saveState();
  return photo;
}

export function removeProjectPhoto(projectId, photoId) {
  const project = findProject(projectId);
  if (!project) return false;

  const idx = project.photos.findIndex((p) => p.id === photoId);
  if (idx === -1) return false;

  project.photos.splice(idx, 1);
  logActivity(project, "Progress photo removed.");
  project.updatedAt = new Date().toISOString();
  saveState();
  return true;
}

export function generateAccomplishmentReport(projectId) {
  const project = findProject(projectId);
  if (!project) return null;

  const openIssues = project.issues.filter((i) => !i.resolvedAt);
  const openDelays = openIssues.filter((i) => i.kind === "delay");
  const openOther = openIssues.filter((i) => i.kind === "issue");
  const resolved = project.issues.filter((i) => i.resolvedAt).length;
  const doneMs = project.milestones.filter((m) => m.status === "done").length;
  const missedMs = project.milestones.filter((m) => m.status === "missed").length;
  const util = budgetUtilization(project);

  const progressPhotos = (project.photos || []).filter((ph) => ph.kind !== "site");

  const narrative = [
    `${project.name} (${project.department}) is currently ${project.status} at ${project.progress}% completion.`,
    project.milestones.length
      ? `${doneMs} of ${project.milestones.length} milestones completed${missedMs ? `; ${missedMs} missed` : ""}.`
      : "No milestones recorded yet.",
    util != null
      ? `Budget utilization: ${util}% (${project.budgetSpent ?? 0} of ${project.budgetTotal} PHP).`
      : "No budget data recorded.",
    openIssues.length
      ? `${openDelays.length} open delay(s) and ${openOther.length} open issue(s) require attention.`
      : "No open delays or issues.",
    progressPhotos.length
      ? `${progressPhotos.length} progress photo(s) on file.`
      : "No progress photos yet.",
  ].join(" ");

  return {
    generatedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      department: project.department,
      type: project.type,
      status: project.status,
      progress: project.progress,
      description: project.description || "",
    },
    timeline: {
      startDate: project.startDate ?? null,
      targetEndDate: project.targetEndDate ?? null,
      milestonesTotal: project.milestones.length,
      milestonesDone: doneMs,
      milestonesMissed: missedMs,
      milestones: project.milestones,
    },
    budget: {
      total: project.budgetTotal ?? null,
      spent: project.budgetSpent ?? 0,
      utilizationPct: util,
      overBudget: util != null && util > 100,
    },
    issues: {
      openDelays: openDelays.length,
      openIssues: openOther.length,
      resolved,
      items: project.issues,
    },
    photos: {
      count: progressPhotos.length,
      items: progressPhotos,
    },
    activityLog: project.activityLog.slice(0, 20),
    narrative,
  };
}

export function emitProjectsPayload() {
  return { projects: projectsSeed(), generatedAt: new Date().toISOString() };
}

/** Citizen-facing project shape — strips staff notes, activity log, budget internals. */
export function toPublicProject(p) {
  if (!p) return null;
  const milestones = (p.milestones || []).map((m) => ({
    id: m.id,
    title: m.title,
    targetDate: m.targetDate,
    completedAt: m.completedAt || null,
    status: m.status,
  }));
  const issues = (p.issues || []).map((i) => ({
    id: i.id,
    kind: i.kind,
    title: i.title,
    reportedAt: i.reportedAt,
    resolvedAt: i.resolvedAt || null,
    open: !i.resolvedAt,
  }));
  const photos = (p.photos || []).map((ph) => ({
    id: ph.id,
    url: ph.url,
    caption: ph.caption || "",
    kind: ph.kind === "site" ? "site" : "progress",
    uploadedAt: ph.uploadedAt,
    lat: Number.isFinite(Number(ph.lat)) ? Number(ph.lat) : null,
    lon: Number.isFinite(Number(ph.lon)) ? Number(ph.lon) : null,
  }));
  return {
    id: p.id,
    name: p.name,
    modelType: p.modelType,
    type: p.type,
    department: p.department,
    status: p.status,
    progress: p.progress,
    location: p.location,
    description: p.description || "",
    startDate: p.startDate ?? null,
    targetEndDate: p.targetEndDate ?? null,
    barangay: p.barangay || null,
    fundingSource: p.fundingSource || null,
    lifecyclePhase: p.lifecyclePhase || null,
    customModelUrl: p.customModelUrl || null,
    rotation: p.rotation ?? 0,
    modelScale: p.modelScale ?? 1,
    modelHeight: p.modelHeight ?? 0,
    milestones,
    issues,
    photos,
    openIssueCount: issues.filter((i) => i.open).length,
    updatedAt: p.updatedAt,
  };
}

export function listPublicProjects() {
  return projectsSeed()
    .filter((p) => !p.archivedAt)
    .map(toPublicProject);
}

export function getPublicProject(id) {
  return toPublicProject(findProject(id));
}
