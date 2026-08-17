import type { ModelType, Project } from "../types";

export type OfficialLink = {
  label: string;
  url: string;
};

/** Default official / public pages for Luisiana municipal infrastructure types. */
const DEFAULT_LINKS: Partial<Record<ModelType, OfficialLink[]>> = {
  municipal_hall: [
    { label: "LGU eGov", url: "https://elgu-luisiana-laguna.e.gov.ph/" },
    { label: "About Luisiana", url: "https://en.wikipedia.org/wiki/Luisiana" },
  ],
  rhu: [
    { label: "RHU page", url: "https://www.facebook.com/rhuluisiana001/" },
    { label: "Clinic info", url: "https://www.clinicfinderph.com/clinic/luisiana-rural-health-unit" },
    { label: "DOH RHU list", url: "https://ro4a.doh.gov.ph/rural-health-units/" },
  ],
  hospital: [
    { label: "RHU page", url: "https://www.facebook.com/rhuluisiana001/" },
    { label: "Clinic info", url: "https://www.clinicfinderph.com/clinic/luisiana-rural-health-unit" },
  ],
  office: [
    { label: "LGU eGov", url: "https://elgu-luisiana-laguna.e.gov.ph/" },
  ],
  barangay_hall: [
    { label: "About Luisiana", url: "https://en.wikipedia.org/wiki/Luisiana" },
  ],
};

function looksLikeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveOfficialLinks(project: Pick<Project, "officialUrl" | "modelType" | "name">): OfficialLink[] {
  const out: OfficialLink[] = [];
  const custom = (project.officialUrl || "").trim();
  if (custom && looksLikeHttpUrl(custom)) {
    out.push({ label: "Official page", url: custom });
  }
  const defaults = DEFAULT_LINKS[project.modelType] ?? [];
  for (const link of defaults) {
    if (!out.some((x) => x.url === link.url)) out.push(link);
  }
  return out;
}
