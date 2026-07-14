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

