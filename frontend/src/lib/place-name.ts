/**
 * Auto-name a map pin from the nearby street or barangay — not the POI/building.
 * A user-typed name always wins over the lookup.
 */

import { BARANGAY_LIST, MODEL_CATALOG, type ModelType } from "../types";
import { backendUrl } from "./api";

const PHOTON_URL = "https://photon.komoot.io/reverse";

/** Old POI auto-names that should be replaced with street / barangay. */
const LEGACY_POI_NAMES = new Set(
  [
    "Bonifacio Elementary School",
    "Luisiana Central Elementary School",
    "San Antonio Elementary School",
    "San Isidro Elementary School",
    "San Buenaventura Elementary School",
    "Santo Domingo Elementary School",
    "San Salvador Elementary School",
    "De La Paz San Pablo Elementary School",
    "San Rafael - San Roque Elementary School",
    "Luisiana Adventist Elementary School",
    "Liceo de Luisiana",
    "Luis Bernardo Memorial High School",
    "San Buenaventura National High School",
    "Luisiana Municipal Hall",
    "Our Lady of the Holy Rosary Parish Church",
    "Luisiana Public Market",
    "Luisiana Police Station",
    "Luisiana Fire Station",
    "Barangay San Diego Multipurpose Hall",
    "Barangay Zone V Multipurpose Hall",
    "Barangay San Isidro Multipurpose Hall",
    "Covered Court",
  ].map((n) => n.toLowerCase()),
);

const liveCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(lat: number, lon: number) {
  return `sb3:${lat.toFixed(5)},${lon.toFixed(5)}`;
}

const ZONE_ROMAN: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
};

const ZONE_BARANGAY: Record<number, string> = {
  1: "Barangay Zone I (Poblacion)",
  2: "Barangay Zone II (Poblacion)",
  3: "Barangay Zone III (Poblacion)",
  4: "Barangay Zone IV (Poblacion)",
  5: "Barangay Zone V (Poblacion)",
  6: "Barangay Zone VI (Poblacion)",
  7: "Barangay Zone VII (Poblacion)",
  8: "Barangay Zone VIII (Poblacion)",
};

function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

function barangayKey(raw: string) {
  return cleanName(raw)
    .toLowerCase()
    .replace(/^brgy\.?\s+/i, "")
    .replace(/^barangay\s+/i, "")
    .replace(/\(poblacion\)/gi, "")
    .replace(/poblacion/gi, "")
    .replace(/zone\s*0*/i, "zone ")
    .trim();
}

function parseZoneNumber(raw: string): number | null {
  const n = barangayKey(raw);
  const m = n.match(/^zone\s*([ivxlcdm]+|\d+)$/i);
  if (!m) return null;
  const token = m[1].toLowerCase();
  if (/^\d+$/.test(token)) {
    const num = Number(token);
    return num >= 1 && num <= 8 ? num : null;
  }
  return ZONE_ROMAN[token] ?? null;
}

export function matchBarangayName(raw: string): string {
  const n = barangayKey(raw);
  if (!n) return "";
  const zone = parseZoneNumber(n);
  if (zone != null) return ZONE_BARANGAY[zone] ?? "";
  for (const b of BARANGAY_LIST) {
    if (barangayKey(b) === n) return b;
  }
  return cleanName(raw);
}

function formatBarangayLabel(raw: string): string {
  const brgy = matchBarangayName(raw);
  if (!brgy) return "";
  if (brgy.startsWith("Barangay") || (BARANGAY_LIST as readonly string[]).includes(brgy)) return brgy;
  return `Barangay ${brgy}`;
}

export function formatStreetOrBarangay(street?: string | null, barangay?: string | null): string | null {
  let road = cleanName(street);
  if (road) {
    road = road.replace(/\s*[-·•]\s*(Barangay|Brgy).*$/i, "").trim();
    return road;
  }
  const brgy = formatBarangayLabel(barangay || "");
  if (brgy) return brgy;
  return null;
}

export function isGenericProjectName(name: string | undefined | null): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return true;
  if (n === "custom" || n === "custom model" || n === "3d model") return true;
  if (LEGACY_POI_NAMES.has(n)) return true;
  return MODEL_CATALOG.some(
    (m) => m.label.toLowerCase() === n || m.type.replace(/_/g, " ") === n,
  );
}

function photonLocation(props: Record<string, unknown> | undefined): {
  street: string;
  barangay: string;
} {
  if (!props) return { street: "", barangay: "" };
  const key = String(props.osm_key ?? "");
  const named = cleanName(props.name);
  const streetFromAddr = cleanName(props.street);
  const street = key === "highway" && named ? named : streetFromAddr;
  const barangay = cleanName(
    props.district || props.locality || props.suburb || props.neighbourhood || (key === "place" ? named : ""),
  );
  return { street, barangay };
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchPhotonLocation(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<{ street: string; barangay: string }> {
  const url = `${PHOTON_URL}?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`;
  const data = (await fetchJson(url, signal ?? new AbortController().signal)) as {
    features?: Array<{ properties?: Record<string, unknown> }>;
  };
  return photonLocation(data.features?.[0]?.properties);
}

async function fetchBackendName(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const data = (await fetchJson(
    backendUrl(`/api/place-name?${q.toString()}`),
    signal ?? new AbortController().signal,
  )) as { name?: string | null };
  const name = typeof data.name === "string" ? data.name.trim() : "";
  return name || null;
}

/** Nearby street or barangay for a drop / hover. */
export async function lookupPlaceName(
  lat: number,
  lon: number,
  opts?: { modelType?: ModelType | string | null; signal?: AbortSignal },
): Promise<string | null> {
  const key = cacheKey(lat, lon);
  if (liveCache.has(key)) return liveCache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 10_000);
    const onAbort = () => ctrl.abort();
    opts?.signal?.addEventListener("abort", onAbort);
    try {
      const [backend, photon] = await Promise.allSettled([
        fetchBackendName(lat, lon, ctrl.signal),
        fetchPhotonLocation(lat, lon, ctrl.signal),
      ]);
      const fromApi = backend.status === "fulfilled" ? backend.value : null;
      const photonVal =
        photon.status === "fulfilled" ? photon.value : { street: "", barangay: "" };
      let name =
        fromApi || formatStreetOrBarangay(photonVal.street, photonVal.barangay) || null;
      if (name) {
        name = name.replace(/\s*[-·•]\s*(Barangay|Brgy).*$/i, "").trim() || null;
      }
      liveCache.set(key, name);
      return name;
    } catch {
      liveCache.set(key, null);
      return null;
    } finally {
      window.clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onAbort);
      inflight.delete(key);
    }
  })();

  inflight.set(key, pending);
  return pending;
}

/** Instant cached street/barangay if a lookup already ran. */
export function syncPlaceName(lat: number, lon: number): string | null {
  return liveCache.get(cacheKey(lat, lon)) ?? null;
}

export function displayNameForProject(project: {
  name: string;
  modelType?: ModelType | string | null;
  location?: { lat: number; lon: number } | null;
}): string {
  return project.name?.trim() || "Untitled site";
}

/** Street or barangay for the hover subtitle — never used as the structure name. */
export function locationLabelForPoint(lat: number, lon: number): string | null {
  return syncPlaceName(lat, lon);
}

export function hoverTypeLabel(project: {
  siteMarkerOnly?: boolean | null;
  modelType?: ModelType | string | null;
  type?: string | null;
}): string {
  if (project.siteMarkerOnly) return "Pinned site";
  if (project.modelType === "custom") return project.type?.trim() || "3D model";
  return (
    MODEL_CATALOG.find((m) => m.type === project.modelType)?.label ??
    project.type?.trim() ??
    "Infrastructure"
  );
}
