/**
 * Tropical systems (Invest / TC / LPA-watch) — backend RAMMB proxy.
 */

import { backendUrl } from "./api";

export type TropicalStage = "invest" | "td" | "ts" | "typhoon" | "other";

export type TropicalTrackPoint = {
  lon: number;
  lat: number;
  intensityKt: number;
  observedAt: string;
};

export type TropicalSystem = {
  id: string;
  basinId: string;
  name: string;
  stage: TropicalStage;
  label: string;
  lon: number;
  lat: number;
  intensityKt: number;
  observedAt: string;
  track: TropicalTrackPoint[];
  sourceUrl: string;
  lpaWatch: boolean;
};

export type TropicalSystemsResponse = {
  source: string;
  sourceIndexUrl: string;
  disclaimer: string;
  updatedAt: string;
  systems: TropicalSystem[];
  cached?: boolean;
  error?: string | null;
};

const STAGE_META: Record<
  TropicalStage,
  { title: string; color: string; icon: string }
> = {
  invest: { title: "Invest / LPA-watch", color: "#f0a030", icon: "◎" },
  td: { title: "Tropical Depression", color: "#5dade2", icon: "◉" },
  ts: { title: "Tropical Storm", color: "#3498db", icon: "◉" },
  typhoon: { title: "Typhoon", color: "#e74c3c", icon: "⬤" },
  other: { title: "Tropical system", color: "#95a5a6", icon: "○" },
};

export function getTropicalStageMeta(stage: TropicalStage | string) {
  return STAGE_META[(stage as TropicalStage) in STAGE_META ? (stage as TropicalStage) : "other"];
}

export function getTropicalColor(system: TropicalSystem): string {
  if (system.lpaWatch || system.stage === "invest") return STAGE_META.invest.color;
  return getTropicalStageMeta(system.stage).color;
}

export function getTropicalIcon(system: TropicalSystem): string {
  return getTropicalStageMeta(system.stage).icon;
}

export function formatTropicalInfo(system: TropicalSystem): string {
  const lines = [
    system.label,
    `Stage: ${getTropicalStageMeta(system.stage).title}`,
    `Intensity: ${system.intensityKt} kt`,
    `Position: ${system.lat.toFixed(1)}°, ${system.lon.toFixed(1)}°`,
    `Observed: ${new Date(system.observedAt).toLocaleString()}`,
  ];
  if (system.lpaWatch) {
    lines.push("LPA-watch: Invest inside Philippine AOI (not official PAGASA).");
  }
  return lines.join("\n");
}

export async function fetchTropicalSystems(opts?: {
  refresh?: boolean;
}): Promise<TropicalSystemsResponse> {
  const q = opts?.refresh ? "?refresh=1" : "";
  const res = await fetch(backendUrl(`/api/tropical-systems${q}`));
  if (!res.ok) throw new Error(`Tropical systems request failed: ${res.status}`);
  return (await res.json()) as TropicalSystemsResponse;
}
