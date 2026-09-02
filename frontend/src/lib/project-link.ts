/** Deep link for a mapped asset so a printed QR opens that project. */

export function assetQueryParam(): string {
  if (typeof window === "undefined") return "";
  const q = new URLSearchParams(window.location.search);
  return (q.get("asset") || q.get("project") || "").trim();
}

export function assetShareUrl(projectId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  return `${origin}${path}?asset=${encodeURIComponent(projectId)}`;
}

export function qrImageUrl(data: string, size = 180): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

export function readGps(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15_000 },
    );
  });
}
