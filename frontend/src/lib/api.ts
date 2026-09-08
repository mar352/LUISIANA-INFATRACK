import type {
  Project,
  ProjectIssue,
  ProjectMilestone,
  ProjectPhoto,
  ProjectAccomplishmentReport,
  PublicProject,
  EngagementSubmission,
  EngagementPublicStats,
  EngagementKind,
  EngagementStatus,
} from "../types";

// undefined → local default; "" → same-origin (Docker / nginx proxy)
const envBackend = import.meta.env.VITE_BACKEND_URL as string | undefined;
export const BACKEND_URL = envBackend === undefined ? "http://localhost:4000" : envBackend;

export function backendUrl(path: string) {
  if (path.startsWith("http")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return BACKEND_URL ? `${BACKEND_URL}${p}` : p;
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(backendUrl(path), { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(backendUrl(path), {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = `Request failed: ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.error) detail = String(errBody.error);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export function patchProject(id: string, body: Partial<Project>) {
  return sendJson<{ project: Project }>(`/api/projects/${id}`, "PATCH", body);
}

export function addMilestone(projectId: string, body: { title: string; targetDate: string }) {
  return sendJson<{ milestone: ProjectMilestone }>(`/api/projects/${projectId}/milestones`, "POST", body);
}

export function completeMilestone(projectId: string, milestoneId: string) {
  return sendJson<{ milestone: ProjectMilestone }>(
    `/api/projects/${projectId}/milestones/${milestoneId}`,
    "PATCH",
    {}
  );
}

export function reportIssue(
  projectId: string,
  body: { kind: "delay" | "issue"; title: string; description?: string }
) {
  return sendJson<{ issue: ProjectIssue }>(`/api/projects/${projectId}/issues`, "POST", body);
}

export function resolveIssue(projectId: string, issueId: string) {
  return sendJson<{ issue: ProjectIssue }>(
    `/api/projects/${projectId}/issues/${issueId}`,
    "PATCH",
    {}
  );
}

export function fetchAccomplishmentReport(projectId: string) {
  return getJson<{ report: ProjectAccomplishmentReport }>(`/api/projects/${projectId}/report`);
}

export async function uploadProjectPhoto(
  projectId: string,
  file: File,
  opts?: {
    caption?: string;
    milestoneId?: string | null;
    kind?: "site" | "progress";
    lat?: number | null;
    lon?: number | null;
  }
) {
  const form = new FormData();
  form.append("photo", file);
  if (opts?.caption) form.append("caption", opts.caption);
  if (opts?.milestoneId) form.append("milestoneId", opts.milestoneId);
  form.append("kind", opts?.kind === "site" ? "site" : "progress");
  if (opts?.lat != null && Number.isFinite(opts.lat)) form.append("lat", String(opts.lat));
  if (opts?.lon != null && Number.isFinite(opts.lon)) form.append("lon", String(opts.lon));
  const res = await fetch(backendUrl(`/api/projects/${projectId}/photos`), {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return (await res.json()) as { photo: ProjectPhoto };
}

export function deleteProjectPhoto(projectId: string, photoId: string) {
  return sendJson<{ ok: boolean }>(`/api/projects/${projectId}/photos/${photoId}`, "DELETE");
}

/** Upload a planning meeting attachment (pdf/images/docx). Returns public /uploads URL. */
export async function uploadPlanningAttachment(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(backendUrl("/api/planning/attachments"), {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await res.json()) as { url: string; filename: string; originalName: string; size: number };
}

/** Upload a municipal DMS file (pdf/images/docx). */
export async function uploadDocumentFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(backendUrl("/api/documents/upload"), {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await res.json()) as {
    url: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
  };
}

// ── Public / citizen engagement ─────────────────────────────────────────────

export function fetchPublicProjects() {
  return getJson<{ projects: PublicProject[]; generatedAt: string }>("/api/public/projects");
}

export function fetchPublicProject(id: string) {
  return getJson<{ project: PublicProject }>(`/api/public/projects/${id}`);
}

export function fetchEngagementPublicStats() {
  return getJson<{ stats: EngagementPublicStats; generatedAt: string }>(
    "/api/public/engagement/stats"
  );
}

export function submitEngagement(body: {
  kind: EngagementKind;
  title: string;
  body: string;
  category?: string;
  projectId?: string | null;
  lng?: number | null;
  lat?: number | null;
  barangay?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}) {
  return sendJson<{ submission: { id: string; createdAt: string } }>(
    "/api/public/engagement",
    "POST",
    body
  );
}

export function fetchEngagementList(opts?: { kind?: EngagementKind; status?: EngagementStatus }) {
  const q = new URLSearchParams();
  if (opts?.kind) q.set("kind", opts.kind);
  if (opts?.status) q.set("status", opts.status);
  const qs = q.toString();
  return getJson<{ submissions: EngagementSubmission[]; generatedAt: string }>(
    `/api/engagement${qs ? `?${qs}` : ""}`
  );
}

export function patchEngagement(
  id: string,
  body: { status?: EngagementStatus; staffNote?: string | null }
) {
  return sendJson<{ submission: EngagementSubmission }>(`/api/engagement/${id}`, "PATCH", body);
}

// ── Citizen Online Applications (Zoning & MPDC Certifications) ───────────
export async function uploadCitizenDocument(
  file: File
): Promise<{ url: string; filename: string; originalName: string; size: number; mimeType?: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(backendUrl("/api/citizen/applications/upload"), {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) {
    let msg = `Upload failed: ${res.status}`;
    try {
      const b = await res.json();
      if (b?.error) msg = b.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function submitCitizenApplication(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; application: any }> {
  return sendJson<{ ok: boolean; application: any }>("/api/citizen/applications", "POST", payload);
}

export async function trackCitizenApplication(trackingNumber: string): Promise<any | null> {
  try {
    const res = await getJson<{ ok: boolean; application: any }>(
      `/api/citizen/applications/${encodeURIComponent(trackingNumber.trim())}`
    );
    return res.application || null;
  } catch {
    return null;
  }
}

export async function submitCitizenReceipt(
  trackingNumber: string,
  data: {
    orNumber: string;
    paidAmount?: number;
    paidAt?: string;
    file?: File;
    receiptUrl?: string;
    receiptOriginalName?: string;
    receiptSize?: number;
  }
): Promise<{ ok: boolean; application: any }> {
  const fd = new FormData();
  if (data.file) {
    fd.append("file", data.file);
  }
  if (data.orNumber) fd.append("orNumber", data.orNumber);
  if (data.paidAmount !== undefined) fd.append("paidAmount", String(data.paidAmount));
  if (data.paidAt) fd.append("paidAt", data.paidAt);
  if (data.receiptUrl) fd.append("receiptUrl", data.receiptUrl);
  if (data.receiptOriginalName) fd.append("receiptOriginalName", data.receiptOriginalName);
  if (data.receiptSize !== undefined) fd.append("receiptSize", String(data.receiptSize));

  const res = await fetch(backendUrl(`/api/citizen/applications/${encodeURIComponent(trackingNumber)}/receipt`), {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) {
    let msg = `Submission failed: ${res.status}`;
    try {
      const b = await res.json();
      if (b?.error) msg = b.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function reuploadCitizenDocument(
  trackingNumber: string,
  docKey: string,
  docTitle: string,
  file: File
): Promise<{ ok: boolean; application: any; message: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("docKey", docKey);
  fd.append("docTitle", docTitle);

  const res = await fetch(
    backendUrl(`/api/citizen/applications/${encodeURIComponent(trackingNumber)}/reupload-doc`),
    {
      method: "POST",
      credentials: "include",
      body: fd,
    }
  );
  if (!res.ok) {
    let msg = `Upload failed: ${res.status}`;
    try {
      const b = await res.json();
      if (b?.error) msg = b.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchCitizenApplications(): Promise<any[]> {
  try {
    const res = await getJson<{ ok: boolean; applications: any[] }>("/api/citizen/applications");
    return res.applications || [];
  } catch {
    return [];
  }
}

export async function patchCitizenApplication(id: string, patch: Record<string, unknown>): Promise<any> {
  return sendJson<{ ok: boolean; application: any }>(`/api/citizen/applications/${id}`, "PATCH", patch);
}

/** Map public DTO → full Project shape for Cesium (fill staff-only fields with defaults). */
export function publicProjectAsMapProject(p: PublicProject): Project {
  const issues = Array.isArray(p.issues) ? p.issues : [];
  const milestones = Array.isArray(p.milestones) ? p.milestones : [];
  const photos = Array.isArray(p.photos) ? p.photos : [];
  return {
    id: p.id,
    name: p.name || "Untitled",
    modelType: p.modelType || "office",
    type: p.type || "Municipal Project",
    department: p.department || "MPDC",
    status: p.status || "Planned",
    progress: Number(p.progress) || 0,
    location: p.location || { lat: 14.185, lon: 121.51 },
    rotation: p.rotation ?? 0,
    modelScale: p.modelScale ?? 1,
    modelHeight: p.modelHeight ?? 0,
    modelLocked: true,
    customModelUrl: p.customModelUrl || undefined,
    description: p.description,
    startDate: p.startDate,
    targetEndDate: p.targetEndDate,
    barangay: p.barangay || undefined,
    fundingSource: p.fundingSource || undefined,
    lifecyclePhase: p.lifecyclePhase || undefined,
    milestones,
    issues: issues.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      description: "",
      reportedAt: i.reportedAt,
      resolvedAt: i.resolvedAt || undefined,
    })),
    photos,
    activityLog: [],
    updatedAt: p.updatedAt || new Date().toISOString(),
  };
}
