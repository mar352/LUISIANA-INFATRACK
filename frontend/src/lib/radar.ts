export type RadarFrame = { path: string; time: number };

export type RainViewerResponse = {
  host: string;
  radar?: {
    past?: RadarFrame[];
    nowcast?: RadarFrame[];
  };
};

/**
 * RainViewer color schemes:
 * 0 - Original (green→yellow→red, classic radar)
 * 1 - Universal Blue
 * 2 - TITAN
 * 3 - The Weather Channel (rainbow)
 * 4 - Meteored
 * 5 - NEXRAD Level III
 * 6 - RAINBOW @ SELEX-SI (vivid green→yellow→orange→red, closest to the image)
 * 7 - Dark Sky
 * 8 - Spectrum
 */
export type RadarColorScheme = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const RADAR_COLOR_SCHEMES: { value: RadarColorScheme; label: string }[] = [
  { value: 6, label: "Windy Style" },
  { value: 2, label: "TITAN" },
  { value: 0, label: "Classic" },
  { value: 5, label: "NEXRAD" },
  { value: 8, label: "Spectrum" },
];

export async function fetchRadarFrames() {
  const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
  if (!res.ok) throw new Error(`Radar API failed: ${res.status}`);
  const json = (await res.json()) as RainViewerResponse;

  const host = json.host;
  const past = json.radar?.past ?? [];
  const nowcast = json.radar?.nowcast ?? [];

  // Use last 10 past frames + first 3 nowcast frames for smooth animation.
  const frames = [...past.slice(-10), ...nowcast.slice(0, 3)].filter((f) => f?.path && Number.isFinite(f.time));

  return { host, frames };
}

export function radarTileUrl(host: string, framePath: string, colorScheme: RadarColorScheme = 6) {
  // RainViewer format: {host}{path}/{size}/{z}/{x}/{y}/{color}/{options}.png
  // - size: 256
  // - color: 6 (RAINBOW@SELEX — vivid green→yellow→orange→red, Windy-style)
  // - options: 1_1 (smooth + show snow)
  return `${host}${framePath}/256/{z}/{x}/{y}/${colorScheme}/1_1.png`;
}

export function formatRadarTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${mo}/${day} ${h}:${m}`;
}
