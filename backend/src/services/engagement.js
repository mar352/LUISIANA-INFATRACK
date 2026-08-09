import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH =
  process.env.ENGAGEMENT_DATA_PATH ||
  path.join(__dirname, "../../data/engagement.json");

const KINDS = new Set(["feedback", "issue", "suggestion"]);
const STATUSES = new Set(["new", "reviewing", "resolved", "dismissed"]);
const ISSUE_CATEGORIES = new Set(["road", "drainage", "lighting", "building", "other"]);

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;
const rateBuckets = new Map();

let state = null;
let nextId = 1;

function saveState() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify({ submissions: state, nextId }, null, 2),
    "utf8"
  );
}

/** Ensure every submission has a unique id; bump nextId past the highest used. */
function repairIds(list, incomingNextId) {
  const seen = new Set();
  let maxNum = 0;
  let changed = false;

  for (const s of list) {
    const m = /^E(\d+)$/i.exec(String(s.id || ""));
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }

  let cursor = Math.max(Number(incomingNextId) || 1, maxNum + 1);
  for (const s of list) {
    const id = String(s.id || "");
    if (!id || seen.has(id)) {
      s.id = `E${cursor++}`;
      changed = true;
    }
    seen.add(s.id);
    const m = /^E(\d+)$/i.exec(s.id);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }

  nextId = Math.max(cursor, maxNum + 1, Number(incomingNextId) || 1);
  if (changed || nextId !== Number(incomingNextId)) {
    saveState();
  }
  return list;
}

function loadFromDisk() {
  if (!fs.existsSync(DATA_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    state = Array.isArray(raw.submissions) ? raw.submissions : [];
    repairIds(state, raw.nextId);
    return state;
  } catch (err) {
    console.warn("[engagement] Failed to load data file:", err.message);
    return null;
  }
}

function ensureLoaded() {
  if (state) return state;
  const loaded = loadFromDisk();
  if (loaded) return loaded;
  state = [];
  nextId = 1;
  saveState();
  return state;
}

function trimStr(v, max = 2000) {
  if (v == null) return "";
  return String(v).trim().slice(0, max);
}

function optionalNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Simple in-process rate limit by IP (or anonymous key). */
export function checkEngagementRateLimit(key) {
  const k = String(key || "anon");
  const now = Date.now();
  let bucket = rateBuckets.get(k);
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(k, bucket);
  }
  bucket.count += 1;
  return bucket.count <= RATE_MAX;
}

export function listEngagement({ kind, status } = {}) {
  let list = ensureLoaded().slice();
  if (kind && KINDS.has(kind)) list = list.filter((s) => s.kind === kind);
  if (status && STATUSES.has(status)) list = list.filter((s) => s.status === status);
  return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getEngagement(id) {
  return ensureLoaded().find((s) => s.id === id) || null;
}

export function createEngagement(body = {}) {
  const kind = String(body.kind || "").toLowerCase();
  if (!KINDS.has(kind)) return { error: "Invalid kind" };

  const title = trimStr(body.title, 200);
  const message = trimStr(body.body ?? body.message, 4000);
  if (!title || !message) return { error: "title and body are required" };

  let category = trimStr(body.category, 40).toLowerCase() || "general";
  if (kind === "issue") {
    if (!ISSUE_CATEGORIES.has(category)) category = "other";
  } else if (kind === "feedback") {
    category = category || "general";
  } else {
    category = category || "recommendation";
  }

  const lng = optionalNum(body.lng ?? body.lon);
  const lat = optionalNum(body.lat);
  if (lng != null && (lng < -180 || lng > 180)) return { error: "Invalid lng" };
  if (lat != null && (lat < -90 || lat > 90)) return { error: "Invalid lat" };

  ensureLoaded();
  // Always allocate past any id already on disk (guards stale nextId / duplicates).
  for (const s of state) {
    const m = /^E(\d+)$/i.exec(String(s.id || ""));
    if (m) nextId = Math.max(nextId, Number(m[1]) + 1);
  }
  const id = `E${nextId++}`;
  const submission = {
    id,
    kind,
    title,
    body: message,
    category,
    projectId: body.projectId ? trimStr(body.projectId, 64) : null,
    lng,
    lat,
    barangay: body.barangay ? trimStr(body.barangay, 80) : null,
    contactName: body.contactName ? trimStr(body.contactName, 120) : null,
    contactEmail: body.contactEmail ? trimStr(body.contactEmail, 160) : null,
    contactPhone: body.contactPhone ? trimStr(body.contactPhone, 40) : null,
    status: "new",
    createdAt: new Date().toISOString(),
    staffNote: null,
    updatedAt: new Date().toISOString(),
  };

  ensureLoaded().unshift(submission);
  saveState();
  return { submission };
}

export function updateEngagement(id, patch = {}) {
  const item = getEngagement(id);
  if (!item) return null;

  if (patch.status !== undefined) {
    const next = String(patch.status).toLowerCase();
    if (!STATUSES.has(next)) return { error: "Invalid status" };
    item.status = next;
  }
  if (patch.staffNote !== undefined) {
    item.staffNote = trimStr(patch.staffNote, 2000) || null;
  }
  item.updatedAt = new Date().toISOString();
  saveState();
  return { submission: item };
}

/** Aggregate counts safe for the public transparency dashboard (no PII). */
export function engagementPublicStats() {
  const list = ensureLoaded();
  const byKind = { feedback: 0, issue: 0, suggestion: 0 };
  const byStatus = { new: 0, reviewing: 0, resolved: 0, dismissed: 0 };
  for (const s of list) {
    if (byKind[s.kind] != null) byKind[s.kind] += 1;
    if (byStatus[s.status] != null) byStatus[s.status] += 1;
  }
  const open = byStatus.new + byStatus.reviewing;
  const closed = byStatus.resolved + byStatus.dismissed;
  return {
    total: list.length,
    byKind,
    byStatus,
    open,
    closed,
  };
}
