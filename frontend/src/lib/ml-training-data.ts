/**
 * Digitized Luisiana geohazard training labels (from EIL KMZ map overlays).
 * CSV columns: lat,lon,label,type[,source]
 * KML: Placemarks; folder/name containing "safe" → 0, else hazard → 1.
 */

import type { TerrainFeatures, TrainingData } from "./ml-risk";
import { extractTerrainFeaturesAt } from "./risk-grid";

export type HazardLabelPoint = {
  lat: number;
  lon: number;
  label: 0 | 1;
  type: string;
  source?: string;
};

export type HazardLabelsLoadResult = {
  points: HazardLabelPoint[];
  sourceUrl: string;
  format: "csv" | "kml";
};

export const DEFAULT_HAZARD_LABELS_CSV = "/data/luisiana-hazard-labels.csv";
export const DEFAULT_HAZARD_LABELS_KML = "/data/luisiana-hazard-labels.kml";

const MIN_LABELED_POINTS = 40;

export function parseHazardLabelsCsv(text: string): HazardLabelPoint[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const latIdx = header.indexOf("lat");
  const lonIdx = header.indexOf("lon");
  const labelIdx = header.indexOf("label");
  const typeIdx = header.indexOf("type");
  const sourceIdx = header.indexOf("source");
  if (latIdx < 0 || lonIdx < 0 || labelIdx < 0) return [];

  const points: HazardLabelPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const lat = Number(cols[latIdx]);
    const lon = Number(cols[lonIdx]);
    const labelRaw = Number(cols[labelIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (labelRaw !== 0 && labelRaw !== 1) continue;
    const type = (typeIdx >= 0 ? cols[typeIdx] : labelRaw === 1 ? "hazard" : "safe") || "hazard";
    points.push({
      lat,
      lon,
      label: labelRaw as 0 | 1,
      type,
      source: sourceIdx >= 0 ? cols[sourceIdx] : undefined,
    });
  }
  return points;
}

export function parseHazardLabelsKml(text: string): HazardLabelPoint[] {
  const points: HazardLabelPoint[] = [];
  // Match Placemark blocks with Point coordinates
  const placemarkRe = /<Placemark\b[\s\S]*?<\/Placemark>/gi;
  let m: RegExpExecArray | null;
  while ((m = placemarkRe.exec(text)) !== null) {
    const block = m[0];
    const nameMatch = block.match(/<name>\s*([^<]*)\s*<\/name>/i);
    const name = (nameMatch?.[1] ?? "").trim();
    const coordMatch = block.match(
      /<Point>\s*<coordinates>\s*([^<\s]+)\s*<\/coordinates>\s*<\/Point>/i,
    );
    if (!coordMatch) continue;
    const parts = coordMatch[1].split(",");
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const folderHint = findParentFolderName(text, m.index);
    const blob = `${folderHint} ${name}`.toLowerCase();
    const isSafe =
      /\bsafe\b/.test(blob) ||
      /\blow[- ]?risk\b/.test(blob) ||
      blob.includes("label=0") ||
      blob.includes("label:0");
    const isFlood = /\bflood\b/.test(blob);
    const isLandslide = /\blandslide\b|\beil\b|\bhazard\b/.test(blob);

    points.push({
      lat,
      lon,
      label: isSafe ? 0 : 1,
      type: isSafe ? "safe" : isFlood ? "flood" : isLandslide ? "landslide" : "hazard",
      source: "kml",
    });
  }
  return points;
}

function findParentFolderName(kml: string, placemarkIndex: number): string {
  const before = kml.slice(0, placemarkIndex);
  const folders = [...before.matchAll(/<Folder\b[\s\S]*?<name>\s*([^<]*)\s*<\/name>/gi)];
  if (folders.length === 0) return "";
  return folders[folders.length - 1][1] ?? "";
}

export async function fetchHazardLabels(
  urls: string[] = [DEFAULT_HAZARD_LABELS_CSV, DEFAULT_HAZARD_LABELS_KML],
): Promise<HazardLabelsLoadResult | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) continue;
      const text = await res.text();
      const lower = url.toLowerCase();
      const points = lower.endsWith(".kml")
        ? parseHazardLabelsKml(text)
        : parseHazardLabelsCsv(text);
      if (points.length >= MIN_LABELED_POINTS) {
        return {
          points,
          sourceUrl: url,
          format: lower.endsWith(".kml") ? "kml" : "csv",
        };
      }
      if (points.length > 0) {
        console.warn(
          `Hazard labels at ${url}: only ${points.length} points (need ≥${MIN_LABELED_POINTS}); trying next source.`,
        );
      }
    } catch (err) {
      console.warn(`Failed to load hazard labels from ${url}:`, err);
    }
  }
  return null;
}

/**
 * Build TF training tensors from digitized points + terrain feature sampler.
 */
export function trainingDataFromHazardLabels(
  points: HazardLabelPoint[],
  featureFn: (lon: number, lat: number) => TerrainFeatures = extractTerrainFeaturesAt,
): TrainingData {
  const features: TerrainFeatures[] = [];
  const labels: number[] = [];
  for (const p of points) {
    const f = featureFn(p.lon, p.lat);
    // Encode digitized hazard type into historicalEvents so the net can use it lightly
    if (p.label === 1) {
      f.historicalEvents = Math.max(f.historicalEvents, p.type === "flood" ? 2 : 3);
    }
    features.push(f);
    labels.push(p.label);
  }
  return { features, labels };
}

export async function loadDigitizedTrainingData(): Promise<{
  data: TrainingData;
  meta: { count: number; sourceUrl: string; format: string; hazard: number; safe: number };
} | null> {
  const loaded = await fetchHazardLabels();
  if (!loaded) return null;
  const data = trainingDataFromHazardLabels(loaded.points);
  const hazard = loaded.points.filter((p) => p.label === 1).length;
  const safe = loaded.points.filter((p) => p.label === 0).length;
  return {
    data,
    meta: {
      count: loaded.points.length,
      sourceUrl: loaded.sourceUrl,
      format: loaded.format,
      hazard,
      safe,
    },
  };
}
