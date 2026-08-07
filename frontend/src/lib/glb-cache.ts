/**
 * GLB / asset byte cache — avoids re-downloading huge engineer models every load.
 * Memory Map + Cache Storage (persistent across reloads in the same origin).
 */

const MEMORY = new Map<string, string>(); // absoluteUrl → blob: URL
const INFLIGHT = new Map<string, Promise<string>>();
const CACHE_NAME = "infatrack-glb-v1";

function isCacheableUrl(url: string): boolean {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : undefined);
    // Same-origin models / uploads only (CORS-safe for Cache Storage)
    return u.origin === window.location.origin;
  } catch {
    return false;
  }
}

async function readFromCacheStorage(url: string): Promise<ArrayBuffer | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(url);
    if (!res || !res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

async function writeToCacheStorage(url: string, buf: ArrayBuffer, contentType: string) {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const headers = new Headers({
      "Content-Type": contentType || "model/gltf-binary",
      "Content-Length": String(buf.byteLength),
    });
    await cache.put(url, new Response(buf.slice(0), { status: 200, headers }));
  } catch (err) {
    console.warn("[glb-cache] Cache Storage write failed:", err);
  }
}

/**
 * Returns a blob: URL for the GLB (or the original URL if uncacheable).
 * Dedupes concurrent fetches for the same absolute URL.
 */
export function getCachedGlbUrl(absoluteUrl: string): Promise<string> {
  const hit = MEMORY.get(absoluteUrl);
  if (hit) return Promise.resolve(hit);

  const pending = INFLIGHT.get(absoluteUrl);
  if (pending) return pending;

  const job = (async () => {
    if (!isCacheableUrl(absoluteUrl)) {
      return absoluteUrl;
    }

    let buf = await readFromCacheStorage(absoluteUrl);
    let contentType = "model/gltf-binary";

    if (!buf) {
      const res = await fetch(absoluteUrl, { credentials: "same-origin" });
      if (!res.ok) {
        throw new Error(`[glb-cache] fetch failed ${res.status} for ${absoluteUrl}`);
      }
      contentType = res.headers.get("Content-Type") || contentType;
      buf = await res.arrayBuffer();
      void writeToCacheStorage(absoluteUrl, buf, contentType);
    }

    const blob = new Blob([buf], { type: contentType });
    const blobUrl = URL.createObjectURL(blob);
    MEMORY.set(absoluteUrl, blobUrl);
    return blobUrl;
  })()
    .catch((err) => {
      console.warn("[glb-cache] falling back to network URL:", err);
      return absoluteUrl;
    })
    .finally(() => {
      INFLIGHT.delete(absoluteUrl);
    });

  INFLIGHT.set(absoluteUrl, job);
  return job;
}

/** Prefetch a list of model URLs (unique) with limited concurrency. */
export async function prefetchGlbUrls(urls: string[], concurrency = 2): Promise<void> {
  const unique = [...new Set(urls.filter(Boolean))];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (i < unique.length) {
      const idx = i++;
      try {
        await getCachedGlbUrl(unique[idx]);
      } catch {
        /* ignore */
      }
    }
  });
  await Promise.all(workers);
}

export function clearGlbMemoryCache() {
  for (const blobUrl of MEMORY.values()) {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      /* ignore */
    }
  }
  MEMORY.clear();
  INFLIGHT.clear();
}
