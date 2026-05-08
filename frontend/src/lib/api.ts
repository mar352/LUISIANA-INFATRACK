const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export function backendUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${BACKEND_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(backendUrl(path));
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

