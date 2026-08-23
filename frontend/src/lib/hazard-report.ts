/**
 * Printable siting hazard table for one clicked infrastructure pin.
 * Hazard | Assessment | Explanation and recommendation
 * Not HazardHunterPH / not an official PHIVOLCS printout.
 */

import type { EarthquakeDualSummary, EarthquakeSiteScore } from "./ml-earthquake";
import { classAdvice, officialLabelAt, type EarthquakeLabelPoint } from "./earthquake-labels";
import {
  fetchGeoriskAssess,
  type GeoRiskLayer,
  type LiveHazardStatus,
  type LiveHazards,
} from "./luisiana-site-assess";
import { printHtmlDocument } from "./report-export";

export type HazardTone = "ok" | "low" | "mid" | "high" | "muted";

export type HazardTableRow = {
  hazard: string;
  assessment: string;
  explanation: string;
  tone: HazardTone;
};

function layerValue(live: GeoRiskLayer | LiveHazardStatus | undefined): string {
  if (live == null || live === "loading") return "Unavailable";
  if (live === "unavailable") return "Unavailable";
  return live.value || "Unavailable";
}

function toneOf(value: string): HazardTone {
  const v = value.toLowerCase();
  if (!v || v.includes("unavailable") || v.includes("no nearby") || v.includes("checking")) return "muted";
  if (v.includes("debris") || v.includes("very high")) return "high";
  if (/\bviii\b/.test(v) || v.includes("prone")) return "high";
  if (v.includes("high") && !v.includes("viii") && !v.includes("vii")) return "high";
  if (v.includes("moderate") || /\bvii\b/.test(v) || v.includes("runout")) return "mid";
  if (v.includes("low") || /\bvi\b/.test(v)) return "low";
  if (v.includes("safe") || v.includes("none") || /\bv\b/.test(v)) return "ok";
  return "muted";
}

function floodExplain(value: string): string {
  const v = value.toLowerCase();
  if (v.includes("unavailable")) {
    return "MGB flood layer could not be reached. Open this report again when the network is up.";
  }
  if (v === "safe") {
    return "This point is not inside a mapped MGB flood-susceptibility polygon. Keep drainage and floor height in the design, but flood is not the controlling siting constraint here.";
  }
  if (v.includes("very high")) {
    return "MGB Very High flood susceptibility: flood heights over about 2 m and duration over 3 days are expected. Do not prefer this ground for new municipal infrastructure if another site exists.";
  }
  if (v.includes("high")) {
    return "MGB High flood susceptibility: about 1–2 m flood height and more than 3 days. Extra structural review. Avoid new critical facilities here if a drier site is available.";
  }
  if (v.includes("moderate")) {
    return "MGB Moderate flood susceptibility: about 0.5–1 m for 1–3 days. Extra structural review; raise utilities and keep an access path above expected water.";
  }
  if (v.includes("low")) {
    return "MGB Low flood susceptibility: about 0.5 m or less for 1–3 days. Standard flood-aware design is enough; still keep drainage clear.";
  }
  return "Flood class is from the live MGB layer (GeoRiskPH).";
}

function landslideExplain(value: string): string {
  const v = value.toLowerCase();
  if (v.includes("unavailable")) {
    return "MGB rain-induced landslide layer could not be reached. Open this report again when the network is up.";
  }
  if (v === "safe") {
    return "This point is not inside a mapped MGB rain-induced landslide polygon. Slope protection still follows the National Building Code where cut-and-fill is needed.";
  }
  if (v.includes("debris")) {
    return "MGB debris-flow / accumulation zone. Avoid new siting if another site exists. If this facility must stay, require geotechnical review before construction.";
  }
  if (v.includes("very high") || v.includes("high")) {
    return "MGB High or Very High rain-induced landslide susceptibility. Prefer another pin on safer ground. Extra structural and slope review if the facility must remain here.";
  }
  if (v.includes("moderate")) {
    return "MGB Moderate rain-induced landslide susceptibility. Extra structural review: drainage, retaining, and cut-and-fill limits before locking the model.";
  }
  if (v.includes("low")) {
    return "MGB Low rain-induced landslide susceptibility. Standard slope and drainage design. Confirm the pin on the globe before locking the site.";
  }
  return "Landslide class is from the live MGB rain-induced landslide layer (GeoRiskPH).";
}

function sheetAsOfficial(sheet: EarthquakeLabelPoint | null): EarthquakeSiteScore | null {
  if (!sheet) return null;
  return {
    lon: sheet.lon,
    lat: sheet.lat,
    cls: sheet.label,
    confidence: 1,
    shakeClass: sheet.shakeClass,
    eilClass: sheet.eilClass,
    source: "nearest-label",
  };
}

export function buildSiteHazardRows(opts: {
  live?: LiveHazards;
  score: EarthquakeDualSummary | null;
  sheet?: EarthquakeLabelPoint | null;
}): { rows: HazardTableRow[]; advice: string } {
  const floodVal = layerValue(opts.live?.flood);
  const slideVal = layerValue(opts.live?.landslide);
  const official = opts.score?.official ?? sheetAsOfficial(opts.sheet ?? null);

  const shakeText = official
    ? official.shakeClass === "viii" || official.shakeClass === "vii"
      ? `Prone; Intensity ${official.shakeClass.toUpperCase()}`
      : `PEIS ${official.shakeClass.toUpperCase()}`
    : "No nearby 2014 pixel";
  const eilText = official
    ? official.eilClass === "none"
      ? "Safe / none"
      : official.eilClass === "runout"
        ? "Runout"
        : official.eilClass.charAt(0).toUpperCase() + official.eilClass.slice(1)
    : "No nearby 2014 pixel";

  const rows: HazardTableRow[] = [
    {
      hazard: "Flood",
      assessment: floodVal,
      explanation: floodExplain(floodVal),
      tone: toneOf(floodVal),
    },
    {
      hazard: "Rain-induced landslide",
      assessment: slideVal,
      explanation: landslideExplain(slideVal),
      tone: toneOf(slideVal),
    },
    {
      hazard: "Ground shaking",
      assessment: shakeText,
      explanation: official
        ? `All sites in Luisiana may experience ground shaking. Digitized PHIVOLCS 2014 sheet at this point: ${shakeText}. Mitigate by following the National Building Code and the Structural Code of the Philippines — this is a siting note, not a structural design.`
        : "No nearby pixel on the digitized PHIVOLCS 2014 ground-shaking sheet.",
      tone: toneOf(shakeText),
    },
    {
      hazard: "Earthquake-induced landslide",
      assessment: eilText,
      explanation: official
        ? eilText.toLowerCase().includes("high") || eilText.toLowerCase().includes("runout")
          ? "PHIVOLCS 2014 earthquake-induced landslide class is High or Runout. Avoid new siting if another site exists; extra geotechnical review if this facility must stay."
          : eilText.toLowerCase().includes("moderate")
            ? "PHIVOLCS 2014 earthquake-induced landslide class is Moderate. Extra structural review for slopes and retaining."
            : eilText.toLowerCase().includes("low")
              ? "PHIVOLCS 2014 earthquake-induced landslide class is Low. Standard seismic and slope design; still confirm live MGB landslide above."
              : "PHIVOLCS 2014 earthquake-induced landslide class is None at the nearest digitized pixel. Confirm with the live MGB rain-induced landslide row."
        : "No nearby pixel on the digitized PHIVOLCS 2014 earthquake-induced landslide sheet.",
      tone: toneOf(eilText),
    },
  ];

  const order: HazardTone[] = ["ok", "low", "muted", "mid", "high"];
  const worst = rows.reduce((w, r) => (order.indexOf(r.tone) > order.indexOf(w) ? r.tone : w), "ok" as HazardTone);

  let advice = official ? `Siting class ${official.cls} — ${classAdvice(official.cls)}.` : "Confirm the pin on the globe before placement.";
  if (worst === "high") {
    advice =
      "Avoid this ground for new infrastructure if another site exists. If the facility must stay, extra geotechnical and structural review before construction.";
  } else if (worst === "mid") {
    advice = "Extra structural review for flood, landslide, and seismic class before locking this site.";
  } else if (worst === "ok" || worst === "low") {
    advice =
      "Preferred for siting relative to mapped flood, landslide, and 2014 seismic class. Still verify the exact pin on the globe.";
  }

  return { rows, advice };
}

export type CompactHazard = {
  flood: string;
  landslide: string;
  shaking: string;
  eil: string;
  advice: string;
};

export async function assessPointCompact(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<CompactHazard> {
  const [geo, sheet] = await Promise.all([
    fetchGeoriskAssess(lat, lon, signal),
    officialLabelAt(lon, lat),
  ]);
  const { rows, advice } = buildSiteHazardRows({
    live: {
      flood: geo?.flood ?? "unavailable",
      landslide: geo?.landslide ?? "unavailable",
    },
    score: null,
    sheet,
  });
  const pick = (label: string) => rows.find((r) => r.hazard === label)?.assessment || "—";
  return {
    flood: pick("Flood"),
    landslide: pick("Rain-induced landslide"),
    shaking: pick("Ground shaking"),
    eil: pick("Earthquake-induced landslide"),
    advice,
  };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toneClass(tone: HazardTone): string {
  if (tone === "high") return "haz-high";
  if (tone === "mid") return "haz-mid";
  if (tone === "ok") return "haz-ok";
  if (tone === "low") return "haz-low";
  return "";
}

export async function printSiteHazardReport(opts: {
  name: string;
  barangay?: string | null;
  locationLabel?: string | null;
  lat: number;
  lon: number;
  live?: LiveHazards;
  score: EarthquakeDualSummary | null;
}) {
  const sheet = opts.score?.official ? null : await officialLabelAt(opts.lon, opts.lat);
  const { rows, advice } = buildSiteHazardRows({ live: opts.live, score: opts.score, sheet });
  const place = [opts.locationLabel, opts.barangay, "Luisiana, Laguna"].filter(Boolean).join(" · ");
  const bodyRows = rows
    .map(
      (r) => `<tr>
        <td class="haz-name">${escape(r.hazard)}</td>
        <td class="haz-assess ${toneClass(r.tone)}">${escape(r.assessment)}</td>
        <td class="haz-why">${escape(r.explanation)}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <style>
      .haz-kicker { font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; color: #555; font-weight: 700; }
      .haz-head { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 10px; }
      .haz-head h1 { font-size: 1.35rem; margin: 4px 0 0; }
      .haz-meta { font-size: 0.84rem; min-width: 250px; }
      .haz-meta div { display: grid; grid-template-columns: 110px 1fr; gap: 6px; margin: 3px 0; }
      .haz-meta span { font-weight: 800; letter-spacing: 0.04em; font-size: 0.68rem; }
      .haz-note { font-size: 0.78rem; color: #555; font-style: italic; margin: 0 0 16px; }
      table.haz-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
      .haz-table th { background: #151c28; color: #fff; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.72rem; padding: 9px 10px; }
      .haz-table td { border: 1px solid #cfc9bc; padding: 12px; vertical-align: top; }
      .haz-name { width: 22%; font-weight: 700; background: #f4f1ea; }
      .haz-assess { width: 22%; text-align: center; font-weight: 800; }
      .haz-high { color: #b71c1c; }
      .haz-mid { color: #b36b00; }
      .haz-ok { color: #1e8449; }
      .haz-low { color: #1a5276; }
      .haz-advice { margin-top: 16px; padding: 12px 14px; border: 1px solid #151c28; background: #f7f3ea; font-size: 0.9rem; }
    </style>
    <div class="haz-head">
      <div>
        <div class="haz-kicker">INFA-TRACK · Luisiana siting</div>
        <h1>${escape(opts.name)}</h1>
      </div>
      <div class="haz-meta">
        <div><span>DATE</span>${escape(new Date().toLocaleString())}</div>
        <div><span>LOCATION</span>${escape(place)}</div>
        <div><span>COORDINATES</span>${opts.lon.toFixed(5)}, ${opts.lat.toFixed(5)}</div>
      </div>
    </div>
    <p class="haz-note">Not HazardHunterPH and not an official PHIVOLCS printout. Flood and rain-induced landslide are live MGB layers via GeoRiskPH. Ground shaking and earthquake-induced landslide are digitized PHIVOLCS 2014 sheets.</p>
    <h2>Hazard assessment</h2>
    <table class="haz-table">
      <thead><tr><th>Hazard</th><th>Assessment</th><th>Explanation and recommendation</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p class="haz-advice"><strong>Siting recommendation.</strong> ${escape(advice)}</p>
  `;

  printHtmlDocument(`${opts.name} — siting hazard assessment`, body, "INFA-TRACK · Siting assessment");
}
