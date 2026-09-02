/* Cached Esri tiles only while Offline mode is ON. Live globe is untouched. */
const CACHE = "infatrack-globe-v1";
let offlineMode = false;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "INFATRACK_OFFLINE") {
    offlineMode = Boolean(event.data.on);
  }
});

self.addEventListener("fetch", (event) => {
  if (!offlineMode) return;
  if (event.request.method !== "GET") return;
  const url = event.request.url;
  if (!url.includes("arcgisonline.com") || !url.includes("/tile/")) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(url, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(event.request);
      } catch {
        return new Response("", { status: 504, statusText: "offline" });
      }
    }),
  );
});
