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

let state = null;
let nextId = 1;

function modelTypeToLegacyType(modelType) {
  if (!modelType) return "Private Building";
  if (["road", "bridge", "water_tank", "solar_farm"].includes(modelType)) return "Municipal Project";
  if (["barn"].includes(modelType)) return "Agricultural Structure";
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
    photos: Array.isArray(p.photos) ? p.photos : [],
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

function hasRecentActivity(project, prefix) {
  return project.activityLog.some((a) => a.message.startsWith(prefix));
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

function loadFromDisk() {
  if (!fs.existsSync(DATA_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    const projects = (raw.projects || []).map(ensureProjectShape);
    nextId = raw.nextId ?? 1;
    return projects;
  } catch (err) {
    console.warn("[projects] Failed to load data file, starting empty:", err.message);
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

  state = [];
  nextId = 1;
  saveState();
  return state;
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

function applyAutomationRules(project, nowIso) {
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
    photos: [],
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

export function addProjectPhoto(projectId, { url, caption, milestoneId }) {
  const project = findProject(projectId);
  if (!project || !url) return null;

  const photo = {
    id: `PH${Date.now()}`,
    url: String(url),
    caption: caption ? String(caption) : "",
    milestoneId: milestoneId || null,
    uploadedAt: new Date().toISOString(),
  };
  project.photos.unshift(photo);
  logActivity(project, `Progress photo uploaded${photo.caption ? `: ${photo.caption}` : ""}.`);
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
    project.photos.length ? `${project.photos.length} progress photo(s) on file.` : "No progress photos yet.",
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
      count: project.photos.length,
      items: project.photos,
    },
    activityLog: project.activityLog.slice(0, 20),
    narrative,
  };
}

export function emitProjectsPayload() {
  return { projects: projectsSeed(), generatedAt: new Date().toISOString() };
}
