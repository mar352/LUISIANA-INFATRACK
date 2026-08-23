import type { QuakeSiteClass } from "./earthquake-labels";

/** Official Google Maps HeatmapLayer example gradient (cyan → blue → red). */
export const GOOGLE_HEATMAP_GRADIENT = [
  "rgba(0, 255, 255, 0)",
  "rgba(0, 255, 255, 1)",
  "rgba(0, 191, 255, 1)",
  "rgba(0, 127, 255, 1)",
  "rgba(0, 63, 255, 1)",
  "rgba(0, 0, 255, 1)",
  "rgba(0, 0, 223, 1)",
  "rgba(0, 0, 191, 1)",
  "rgba(0, 0, 159, 1)",
  "rgba(0, 0, 127, 1)",
  "rgba(63, 0, 91, 1)",
  "rgba(127, 0, 63, 1)",
  "rgba(191, 0, 31, 1)",
  "rgba(255, 0, 0, 1)",
];

type Rgba = [number, number, number, number];

function parseRgba(s: string): Rgba {
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (!m) return [0, 0, 0, 1];
  const p = m[1].split(",").map((x) => Number(x.trim()));
  return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] ?? 1];
}

const HEAT_STOPS = GOOGLE_HEATMAP_GRADIENT.map((c, i, arr) => ({
  t: arr.length <= 1 ? 0 : i / (arr.length - 1),
  c: parseRgba(c),
}));

export function heatRgb(t: number): [number, number, number] {
  const [r, g, b] = colorAt(t);
  return [r, g, b];
}

function colorAt(t: number): Rgba {
  const x = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < HEAT_STOPS.length - 2 && x > HEAT_STOPS[i + 1].t) i += 1;
  const a = HEAT_STOPS[i];
  const b = HEAT_STOPS[i + 1];
  const u = (x - a.t) / Math.max(1e-6, b.t - a.t);
  return [
    a.c[0] + (b.c[0] - a.c[0]) * u,
    a.c[1] + (b.c[1] - a.c[1]) * u,
    a.c[2] + (b.c[2] - a.c[2]) * u,
    a.c[3] + (b.c[3] - a.c[3]) * u,
  ];
}

export type HeatProject = {
  x: number;
  y: number;
  weight: number;
};

export type HeatSite = {
  lon: number;
  lat: number;
  weight: number;
};

const COLOR_LUT = new Uint8ClampedArray(256 * 4);
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  const [r, g, b, a] = colorAt(t);
  const o = i * 4;
  COLOR_LUT[o] = r;
  COLOR_LUT[o + 1] = g;
  COLOR_LUT[o + 2] = b;
  COLOR_LUT[o + 3] = Math.min(230, a * 255 * Math.min(1, t * 1.35));
}

const stampCache = new Map<string, HTMLCanvasElement>();

function heatStamp(radiusPx: number, alpha: number): HTMLCanvasElement {
  const r = Math.max(4, Math.round(radiusPx));
  const a = Math.round(Math.max(0.12, Math.min(0.85, alpha)) * 20) / 20;
  const key = `${r}:${a}`;
  const hit = stampCache.get(key);
  if (hit) return hit;
  const size = r * 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, `rgba(0,0,0,${a})`);
    grd.addColorStop(0.45, `rgba(0,0,0,${a * 0.45})`);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(r, r, r, 0, Math.PI * 2);
    g.fill();
  }
  if (stampCache.size > 80) stampCache.clear();
  stampCache.set(key, c);
  return c;
}

/** Same look as Google HeatmapLayer, drawn onto a canvas over Cesium. */
export function drawGoogleStyleHeatmap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: HeatProject[],
  radiusPx: number,
  scratch?: HTMLCanvasElement,
) {
  ctx.clearRect(0, 0, width, height);
  if (!points.length) return;

  const off = scratch ?? document.createElement("canvas");
  if (off.width !== width) off.width = width;
  if (off.height !== height) off.height = height;
  const g = off.getContext("2d", { willReadFrequently: true });
  if (!g) return;
  g.clearRect(0, 0, width, height);
  g.globalCompositeOperation = "lighter";
  for (const p of points) {
    if (p.x < -radiusPx || p.y < -radiusPx || p.x > width + radiusPx || p.y > height + radiusPx) {
      continue;
    }
    const stamp = heatStamp(radiusPx * (0.75 + p.weight * 0.45), p.weight);
    g.drawImage(stamp, p.x - stamp.width / 2, p.y - stamp.height / 2);
  }

  const img = g.getImageData(0, 0, width, height);
  const d = img.data;
  const lut = COLOR_LUT;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    const o = a << 2;
    d[i] = lut[o];
    d[i + 1] = lut[o + 1];
    d[i + 2] = lut[o + 2];
    d[i + 3] = lut[o + 3];
  }
  ctx.putImageData(img, 0, 0);
}

export function quakeHeatWeight(cls: QuakeSiteClass, confidence = 1): number {
  const base = cls === "HIGH" ? 1 : cls === "MODERATE" ? 0.62 : cls === "LOW" ? 0.34 : 0.12;
  return Math.max(0.1, Math.min(1, base * (0.55 + 0.45 * Math.max(0, Math.min(1, confidence)))));
}

/** Keep hot cells; thin cooler ones so the canvas stays cheap. */
export function thinHeatSites(sites: HeatSite[], max = 520): HeatSite[] {
  if (sites.length <= max) return sites;
  const hot = sites.filter((s) => s.weight >= 0.75);
  const rest = sites.filter((s) => s.weight < 0.75);
  const budget = Math.max(80, max - hot.length);
  const step = Math.max(1, Math.ceil(rest.length / budget));
  return [...hot, ...rest.filter((_, i) => i % step === 0)].slice(0, max);
}
