/**
 * Digitized PHIVOLCS GSH 2014 + EIL 2014 labels for earthquake siting.
 * CSV: lat,lon,shakeClass,eilClass,label,source
 */

export const EARTHQUAKE_LABELS_CSV = "/data/luisiana-earthquake-labels.csv";

export type ShakeClass = "viii" | "vii" | "vi" | "v";
export type EilClass = "high" | "moderate" | "low" | "none" | "runout";
export type QuakeSiteClass = "SAFE" | "LOW" | "MODERATE" | "HIGH";

export type EarthquakeLabelPoint = {
  lat: number;
  lon: number;
  shakeClass: ShakeClass;
  eilClass: EilClass;
  label: QuakeSiteClass;
  source: string;
};

const SHAKE_RANK: Record<ShakeClass, number> = { v: 1, vi: 2, vii: 3, viii: 4 };
const EIL_RANK: Record<EilClass, number> = { none: 0, low: 1, runout: 2, moderate: 2, high: 3 };

export function combineQuakeClass(shake: ShakeClass, eil: EilClass): QuakeSiteClass {
  if (eil === "high") return "HIGH";
  if (eil === "moderate" || eil === "runout") return "MODERATE";
  if (eil === "low") return SHAKE_RANK[shake] >= 3 ? "MODERATE" : "LOW";
  return SHAKE_RANK[shake] >= 4 ? "LOW" : "SAFE";
}

export function classIndex(c: QuakeSiteClass): number {
  return c === "SAFE" ? 0 : c === "LOW" ? 1 : c === "MODERATE" ? 2 : 3;
}

export function classFromIndex(i: number): QuakeSiteClass {
  if (i <= 0) return "SAFE";
  if (i === 1) return "LOW";
  if (i === 2) return "MODERATE";
  return "HIGH";
}

export function classColor(c: QuakeSiteClass): string {
  if (c === "HIGH") return "#c0392b";
  if (c === "MODERATE") return "#d68910";
  if (c === "LOW") return "#2e86ab";
  return "#1e8449";
}

export function classAdvice(c: QuakeSiteClass): string {
  if (c === "HIGH") return "avoid if possible";
  if (c === "MODERATE") return "extra structural review";
  if (c === "LOW") return "standard seismic design";
  return "preferred for siting";
}

function parseShake(raw: string): ShakeClass | null {
  const s = raw.trim().toLowerCase();
  if (s === "viii" || s === "vii" || s === "vi" || s === "v") return s;
  return null;
}

function parseEil(raw: string): EilClass | null {
  const s = raw.trim().toLowerCase();
  if (s === "high" || s === "moderate" || s === "low" || s === "none" || s === "runout") return s;
  return null;
}

function parseLabel(raw: string): QuakeSiteClass | null {
  const s = raw.trim().toUpperCase();
  if (s === "SAFE" || s === "LOW" || s === "MODERATE" || s === "HIGH") return s;
  return null;
}

export function parseEarthquakeLabelsCsv(text: string): EarthquakeLabelPoint[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const latIdx = header.indexOf("lat");
  const lonIdx = header.indexOf("lon");
  const shakeIdx = header.indexOf("shakeclass");
  const eilIdx = header.indexOf("eilclass");
  const labelIdx = header.indexOf("label");
  const sourceIdx = header.indexOf("source");
  if (latIdx < 0 || lonIdx < 0 || labelIdx < 0) return [];

  const points: EarthquakeLabelPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const lat = Number(cols[latIdx]);
    const lon = Number(cols[lonIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const shake = parseShake(shakeIdx >= 0 ? cols[shakeIdx] : "v") ?? "v";
    const eil = parseEil(eilIdx >= 0 ? cols[eilIdx] : "none") ?? "none";
    const label = parseLabel(cols[labelIdx]) ?? combineQuakeClass(shake, eil);
    points.push({
      lat,
      lon,
      shakeClass: shake,
      eilClass: eil,
      label,
      source: sourceIdx >= 0 ? cols[sourceIdx] : "csv",
    });
  }
  return points;
}

export async function fetchEarthquakeLabels(
  url = EARTHQUAKE_LABELS_CSV,
): Promise<EarthquakeLabelPoint[]> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Earthquake labels HTTP ${res.status}`);
  const points = parseEarthquakeLabelsCsv(await res.text());
  if (points.length < 20) throw new Error(`Only ${points.length} earthquake labels loaded`);
  return points;
}

export function nearestLabel(
  points: EarthquakeLabelPoint[],
  lon: number,
  lat: number,
): EarthquakeLabelPoint | null {
  if (points.length === 0) return null;
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const d = (p.lon - lon) ** 2 + (p.lat - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function encodeShake(s: ShakeClass): number {
  return SHAKE_RANK[s] / 4;
}

export function encodeEil(e: EilClass): number {
  return EIL_RANK[e] / 3;
}
