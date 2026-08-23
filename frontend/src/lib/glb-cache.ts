/**
 * GLB / asset byte cache — avoids re-downloading huge engineer models every load.
 *
 * Two layers:
 * - Memory Map of blob: URLs (fast Cesium attach). LRU-evicted by a RAM budget.
 * - Cache Storage (persistent across reloads, same origin). Disk, not GPU.
 *
 * GPU meshes themselves are owned by Cesium ModelGraphics — this module only
 * holds the source bytes so a pan-back does not refetch.
 */

type MemoryEntry = {
  blobUrl: string;
  bytes: number;
  lastUsed: number;
};

const MEMORY = new Map<string, MemoryEntry>(); // absoluteUrl → entry
const INFLIGHT = new Map<string, Promise<string>>();
const CACHE_NAME = "infatrack-glb-v1";

function deviceMemoryGb(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const gb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof gb === "number" && Number.isFinite(gb) ? gb : undefined;
}

/** RAM budget for decoded blob: URLs. GPU models are a separate cap. */
export function glbMemoryBudgetBytes(): number {
  const gb = deviceMemoryGb();
  if (gb != null && gb <= 4) return 48 * 1024 * 1024;
  if (gb != null && gb <= 8) return 96 * 1024 * 1024;
  return 160 * 1024 * 1024;
}

function isCacheableUrl(url: string): boolean {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : undefined);
    return u.origin === window.location.origin;
  } catch {
    return false;
  }
}

function memoryBytesUsed(): number {
  let n = 0;
  for (const e of MEMORY.values()) n += e.bytes;
  return n;
}

function evictUntilUnderBudget(keepAbsoluteUrls: Set<string>) {
  const budget = glbMemoryBudgetBytes();
  let used = memoryBytesUsed();
  if (used <= budget) return;

  const ranked = [...MEMORY.entries()]
    .filter(([url]) => !keepAbsoluteUrls.has(url))
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

  for (const [url, entry] of ranked) {
    if (used <= budget) break;
    try {
      URL.revokeObjectURL(entry.blobUrl);
    } catch {
      /* ignore */
    }
    MEMORY.delete(url);
    used -= entry.bytes;
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

export function isGlbCached(absoluteUrl: string): boolean {
  return MEMORY.has(absoluteUrl);
}

/** Instant attach URL: blob if already in RAM, otherwise the HTTP path so Cesium can stream. */
export function resolveGlbUrlForAttach(absoluteUrl: string): string {
  const hit = MEMORY.get(absoluteUrl);
  if (hit) {
    hit.lastUsed = Date.now();
    return hit.blobUrl;
  }
  return absoluteUrl;
}

/** Catalog files under /models/ are small enough to warm the RAM cache. Skip /uploads/. */
export function isCatalogGlbUrl(absoluteUrl: string): boolean {
  try {
    const path = new URL(absoluteUrl, typeof window !== "undefined" ? window.location.origin : undefined).pathname;
    return path.includes("/models/") && !path.includes("/uploads/");
  } catch {
    return false;
  }
}

export function touchGlbCache(absoluteUrl: string) {
  const entry = MEMORY.get(absoluteUrl);
  if (entry) entry.lastUsed = Date.now();
}

/**
 * Drop blob: URLs that no attached model still needs, then LRU-evict if the
 * RAM budget is still over. Call after Cesium detaches GLBs.
 */
export function retainGlbUrls(keepAbsoluteUrls: Iterable<string>) {
  const keep = new Set([...keepAbsoluteUrls].filter(Boolean));
  evictUntilUnderBudget(keep);
}

export function getGlbMemoryStats(): { count: number; bytes: number; budget: number } {
  return {
    count: MEMORY.size,
    bytes: memoryBytesUsed(),
    budget: glbMemoryBudgetBytes(),
  };
}

/**
 * Returns a blob: URL for the GLB (or the original URL if uncacheable).
 * Dedupes concurrent fetches for the same absolute URL.
 */
export function getCachedGlbUrl(absoluteUrl: string): Promise<string> {
  const hit = MEMORY.get(absoluteUrl);
  if (hit) {
    hit.lastUsed = Date.now();
    return Promise.resolve(hit.blobUrl);
  }

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
    MEMORY.set(absoluteUrl, {
      blobUrl,
      bytes: buf.byteLength,
      lastUsed: Date.now(),
    });
    // Never drop the URL we just created; LRU the rest if over budget.
    evictUntilUnderBudget(new Set([absoluteUrl]));
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
  for (const entry of MEMORY.values()) {
    try {
      URL.revokeObjectURL(entry.blobUrl);
    } catch {
      /* ignore */
    }
  }
  MEMORY.clear();
  INFLIGHT.clear();
}
