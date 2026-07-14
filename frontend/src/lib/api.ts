import type { Project, ProjectIssue, ProjectMilestone } from "../types";

// undefined → local default; "" → same-origin (Docker / nginx proxy)
const envBackend = import.meta.env.VITE_BACKEND_URL as string | undefined;
export const BACKEND_URL = envBackend === undefined ? "http://localhost:4000" : envBackend;

export function backendUrl(path: string) {
  if (path.startsWith("http")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return BACKEND_URL ? `${BACKEND_URL}${p}` : p;
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(backendUrl(path));
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(backendUrl(path), {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
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
