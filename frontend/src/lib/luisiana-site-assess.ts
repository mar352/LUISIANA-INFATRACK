/**
 * Point assessment for Luisiana siting only.
 * Local PEIS / EIL 2014 + terrain model, plus live MGB flood & landslide
 * via the backend GeoRiskPH proxy. Not HazardHunterPH.
 */

import { backendUrl } from "./api";
import { isInsideLuisiana, loadLuisianaRing, type LonLat } from "./luisiana-polygon";
import { classAdvice, classColor, type EilClass, type ShakeClass } from "./earthquake-labels";
import type { EarthquakeDualSummary } from "./ml-earthquake";

/** Mt. Banahaw summit (geographic reference, not a volcanic-hazard polygon). */
export const MT_BANAHAW = { lat: 14.068, lon: 121.492 } as const;

export type AssessRow = {
  label: string;
  value: string;
  color?: string;
};

export type LuisianaSiteAssess = {
  inside: boolean;
  rows: AssessRow[];
  note: string;
};

export type GeoRiskLayer = {
  value: string;
  code: string | null;
};

export type GeoRiskAssess = {
  inside: boolean;
  flood: GeoRiskLayer | null;
  landslide: GeoRiskLayer | null;
  source?: string;
};

export type LiveHazardStatus = "loading" | "unavailable";

export type LiveHazards = {
  flood?: GeoRiskLayer | LiveHazardStatus;
  landslide?: GeoRiskLayer | LiveHazardStatus;
};

function hazardColor(value: string): string | undefined {
  const v = value.toLowerCase();
  if (v === "unavailable" || v === "checking…") return undefined;
  if (v === "safe") return "#1e8449";
  if (v.includes("debris") || v.includes("very high") || v.includes("high")) return "#c0392b";
  if (v.includes("moderate")) return "#d68910";
  if (v.includes("low")) return "#2e86ab";
  return undefined;
}

function liveRow(
  label: string,
  live: GeoRiskLayer | LiveHazardStatus | undefined,
): AssessRow {
  if (live === "loading" || live == null) return { label, value: "Checking…" };
  if (live === "unavailable") return { label, value: "Unavailable" };
  return { label, value: live.value, color: hazardColor(live.value) };
}

export async function fetchGeoriskAssess(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<GeoRiskAssess | null> {
  try {
    const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    const res = await fetch(backendUrl(`/api/georisk-assess?${q.toString()}`), { signal });
    if (!res.ok) return null;
    return (await res.json()) as GeoRiskAssess;
  } catch {
    return null;
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function compassFrom(fromLat: number, fromLon: number, toLat: number, toLon: number): string {
  const dy = toLat - fromLat;
  const dx = (toLon - fromLon) * Math.cos((fromLat * Math.PI) / 180);
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  const n = ((deg + 360) % 360);
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(n / 45) % 8];
}

function eilLabel(c: EilClass): string {
  if (c === "runout") return "Runout";
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function shakeLabel(c: ShakeClass): string {
  return `PEIS ${c.toUpperCase()}`;
}

let ringCache: LonLat[] | null = null;

export async function pointInLuisiana(lon: number, lat: number): Promise<boolean> {
  try {
    if (!ringCache) ringCache = await loadLuisianaRing();
    return isInsideLuisiana(lon, lat, ringCache);
  } catch {
    return lon >= 121.44 && lon <= 121.58 && lat >= 14.12 && lat <= 14.27;
  }
}

export function banahawDistanceKm(lat: number, lon: number): { km: number; bearing: string } {
  const km = haversineKm(MT_BANAHAW.lat, MT_BANAHAW.lon, lat, lon);
  const bearing = compassFrom(MT_BANAHAW.lat, MT_BANAHAW.lon, lat, lon);
  return { km, bearing };
}

export function buildLuisianaAssess(
  lon: number,
  lat: number,
  inside: boolean,
  score: EarthquakeDualSummary | null,
  live?: LiveHazards,
): LuisianaSiteAssess {
  if (!inside) {
    return {
      inside: false,
      rows: [{ label: "Scope", value: "Outside Luisiana" }],
      note: "Assessment is municipality-only.",
    };
  }

  const official = score?.official ?? null;
  const predicted = score?.predicted ?? null;
  const ban = banahawDistanceKm(lat, lon);
  const rows: AssessRow[] = [];

  if (official) {
    rows.push({
      label: "Ground shaking",
      value: shakeLabel(official.shakeClass),
      color: classColor(official.cls),
    });
    rows.push({
      label: "EIL 2014",
      value: eilLabel(official.eilClass),
      color: classColor(official.cls),
    });
    rows.push({
      label: "Siting class",
      value: `${official.cls} — ${classAdvice(official.cls)}`,
      color: classColor(official.cls),
    });
  } else {
    rows.push({ label: "Ground shaking", value: "No nearby 2014 pixel" });
    rows.push({ label: "EIL 2014", value: "No nearby 2014 pixel" });
  }

  if (predicted) {
    rows.push({
      label: "Terrain model",
      value: `${predicted.cls} · ${Math.round(predicted.confidence * 100)}%`,
      color: classColor(predicted.cls),
    });
  } else {
    rows.push({ label: "Terrain model", value: "Not ready" });
  }

  if (live) {
    rows.push(liveRow("Flood", live.flood));
    rows.push(liveRow("Rain-induced landslide", live.landslide));
  }

  rows.push({
    label: "Mt. Banahaw",
    value: `${ban.km.toFixed(1)} km ${bearingWord(ban.bearing)} of summit`,
  });

  return {
    inside: true,
    rows,
    note: "Luisiana only · MGB flood & landslide (GeoRiskPH) + PHIVOLCS 2014 sheets + local terrain model.",
  };
}

function bearingWord(abbr: string): string {
  const map: Record<string, string> = {
    N: "north",
    NE: "northeast",
    E: "east",
    SE: "southeast",
    S: "south",
    SW: "southwest",
    W: "west",
    NW: "northwest",
  };
  return map[abbr] ?? abbr;
}
