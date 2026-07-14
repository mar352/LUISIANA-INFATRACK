import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

const DEPTS = ["MPDC", "Engineering", "Agriculture", "Negosyo Center"];

let state = null;
let nextId = 100;

function modelTypeToLegacyType(modelType) {
  if (!modelType) return "Private Building";
  if (["road", "bridge", "water_tank", "solar_farm"].includes(modelType)) return "Municipal Project";
  if (["barn"].includes(modelType)) return "Agricultural Structure";
  return "Private Building";
}

function jitter(n, amp) {
  return n + (r() - 0.5) * amp;
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
    activityLog: Array.isArray(p.activityLog) ? p.activityLog : [],
    budgetTotal: p.budgetTotal ?? null,
    budgetSpent: p.budgetSpent ?? 0,
    description: p.description ?? "",
    startDate: p.startDate ?? null,
    targetEndDate: p.targetEndDate ?? null,
  };
}

function logActivity(project, message) {
  project.activityLog.unshift({ at: new Date().toISOString(), message });
  project.activityLog = project.activityLog.slice(0, 50);
}

function saveState() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify({ projects: state, nextId }, null, 2),
    "utf8"
  );
}

function buildSeedProjects() {
  const baseLat = 14.19;
  const baseLon = 121.51;

  return Array.from({ length: 22 }).map((_, i) => {
    const status =
      i < 5 ? "Completed" : i < 14 ? "Ongoing" : i < 18 ? "Planned" : i < 20 ? "Delayed" : "Suspended";
    const progress =
      status === "Completed" ? 100 : status === "Planned" ? 0 : status === "Suspended" ? 45 : Math.round(20 + r() * 65);

    const nameKind = i % 3;
    const name =
      nameKind === 0 ? `Road Improvement Segment ${i + 1}` :
      nameKind === 1 ? `Barangay Waterline Upgrade ${i + 1}` :
                       `Agri Post-Harvest Facility ${i + 1}`;

    const modelType =
      nameKind === 0 ? "road" :
      nameKind === 2 ? "barn" :
                       "office";

    const budgetTotal = Math.round(500000 + r() * 4500000);
    const budgetSpent = Math.round(budgetTotal * (progress / 100) * (0.85 + r() * 0.2));

    const start = new Date();
    start.setMonth(start.getMonth() - Math.floor(r() * 6));
    const end = new Date(start);
    end.setMonth(end.getMonth() + 3 + Math.floor(r() * 6));

    return ensureProjectShape({
      id: `P${i + 1}`,
      name,
      modelType,
      type: modelTypeToLegacyType(modelType),
      department: DEPTS[i % DEPTS.length],
      status,
      progress,
      location: {
        lat: Number(jitter(baseLat, 0.12).toFixed(6)),
        lon: Number(jitter(baseLon, 0.14).toFixed(6)),
      },
      rotation: 0,
      description: "",
      startDate: start.toISOString().slice(0, 10),
      targetEndDate: end.toISOString().slice(0, 10),
      budgetTotal,
      budgetSpent: Math.min(budgetSpent, budgetTotal),
      milestones: [
        {
          id: `M${i + 1}-1`,
          title: "Site preparation",
          targetDate: new Date(start.getTime() + 14 * 86400000).toISOString().slice(0, 10),
          status: progress > 20 ? "done" : progress > 0 ? "pending" : "pending",
          completedAt: progress > 20 ? new Date().toISOString() : undefined,
        },
        {
          id: `M${i + 1}-2`,
          title: "Main construction phase",
          targetDate: end.toISOString().slice(0, 10),
          status: status === "Completed" ? "done" : status === "Delayed" ? "missed" : "pending",
        },
      ],
      issues: status === "Delayed"
        ? [{
            id: `I${i + 1}-1`,
            kind: "delay",
            title: "Schedule slip",
            description: "Weather and material delivery caused delay.",
            reportedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
          }]
        : [],
      activityLog: [{ at: new Date().toISOString(), message: "Project seeded in system." }],
      updatedAt: new Date().toISOString(),
    });
  });
}

function loadFromDisk() {
  if (!fs.existsSync(DATA_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    const projects = (raw.projects || []).map(ensureProjectShape);
    nextId = raw.nextId ?? 100;
    return projects;
  } catch (err) {
    console.warn("[projects] Failed to load data file, re-seeding:", err.message);
    return null;
  }
}

export function projectsSeed() {
  if (state) return state;

  const loaded = loadFromDisk();
  if (loaded) {
    state = loaded;
    return state;
  }

  state = buildSeedProjects();
  saveState();
  return state;
}

function findProject(id) {
  return projectsSeed().find((p) => p.id === id);
}

function hasOpenDelayIssue(project) {
  return project.issues.some((i) => i.kind === "delay" && !i.resolvedAt);
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

export function tickProjects() {
  const projects = projectsSeed();
  const now = new Date().toISOString();

  for (const p of projects) {
    updateMilestoneStatuses(p, now);
    maybeMarkDelayed(p, now);

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
}) {
  const projects = projectsSeed();
  const id = `P${nextId++}`;
  const normalizedStatus = normalizeStatus(status || "Planned");
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
    description: description || "",
    startDate: startDate || null,
    targetEndDate: targetEndDate || null,
    budgetTotal: budgetTotal != null ? Number(budgetTotal) : null,
    budgetSpent: budgetSpent != null ? Number(budgetSpent) : 0,
    milestones: [],
    issues: [],
    activityLog: [],
    updatedAt: new Date().toISOString(),
  });
  logActivity(project, `Project created with status ${project.status}.`);
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

  if (patch.budgetTotal !== undefined) {
    project.budgetTotal = patch.budgetTotal == null ? null : Number(patch.budgetTotal);
    logActivity(project, "Budget total updated.");
  }
  if (patch.budgetSpent !== undefined) {
    project.budgetSpent = Number(patch.budgetSpent) || 0;
    logActivity(project, "Budget spent updated.");
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

export function emitProjectsPayload() {
  return { projects: projectsSeed(), generatedAt: new Date().toISOString() };
}
