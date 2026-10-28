import React from "react";

export type BuildingSectorKey =
  | "Residential"
  | "Apartment"
  | "Townhouse"
  | "Dormitory"
  | "Institutional"
  | "Commercial"
  | "Industrial"
  | "Agro-Industrial";

export const SECTORAL_KEYS: BuildingSectorKey[] = [
  "Residential",
  "Apartment",
  "Townhouse",
  "Dormitory",
  "Institutional",
  "Commercial",
  "Industrial",
  "Agro-Industrial",
];

/* ── Vector SVG Icons matching NewApplicationPage exactly ── */
export const IconHome: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

export const IconApartment: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 7h2v2H7z" />
    <path d="M15 7h2v2h-2z" />
    <path d="M7 11h2v2H7z" />
    <path d="M15 11h2v2h-2z" />
    <path d="M7 15h2v2H7z" />
    <path d="M15 15h2v2h-2z" />
    <line x1="11" y1="21" x2="11" y2="15" />
    <line x1="13" y1="21" x2="13" y2="15" />
    <line x1="11" y1="15" x2="13" y2="15" />
  </svg>
);

export const IconTownhouse: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 10l5-4 5 4v10H2z" />
    <path d="M12 10l5-4 5 4v10h-10z" />
    <path d="M5 14h2" />
    <path d="M15 14h2" />
  </svg>
);

export const IconDormitory: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 4v16" />
    <path d="M2 8h18a2 2 0 0 1 2 2v10" />
    <path d="M2 17h20" />
    <path d="M6 8v9" />
    <circle cx="6" cy="6" r="2" />
  </svg>
);

export const IconInstitutional: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="2" y1="21" x2="22" y2="21" />
    <line x1="4" y1="10" x2="4" y2="21" />
    <line x1="8" y1="10" x2="8" y2="21" />
    <line x1="12" y1="10" x2="12" y2="21" />
    <line x1="16" y1="10" x2="16" y2="21" />
    <line x1="20" y1="10" x2="20" y2="21" />
    <polygon points="12 2 2 8 22 8" />
  </svg>
);

export const IconCommercial: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

export const IconIndustrial: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 20h20" />
    <path d="M3 20V8l6 4V8l6 4V4l6 4v12" />
  </svg>
);

export const IconAgroIndustrial: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 2a9 9 0 0 1 9 9c0 4.97-4.03 9-9 9A9 9 0 0 1 3 11c0-4.97 4.03-9 9-9z" />
    <path d="M12 6v12" />
    <path d="M7 11c2-3 5-3 5-3s3 0 5 3" />
    <path d="M8 15c2-2 4-2 4-2s2 0 4 2" />
  </svg>
);

export interface SectorDefinition {
  key: BuildingSectorKey;
  title: string;
  tagline: { en: string; tl: string };
  desc: { en: string; tl: string };
  badge: { en: string; tl: string };
  badgeColor: string;
  badgeBg: string;
  color: string;
  iconBg: string;
  icon: React.FC<{ size?: number; color?: string }>;
  features: { en: string[]; tl: string[] };
}

export const SECTOR_DEFINITIONS: Record<BuildingSectorKey, SectorDefinition> = {
  Residential: {
    key: "Residential",
    title: "Residential",
    tagline: { en: "Family Housing / Residence", tl: "Pabahay para sa Pamilya" },
    desc: {
      en: "Single-family homes, duplex, bungalow, or private family residence.",
      tl: "Single-family homes, duplex, bungalow, o pribadong tirahan ng pamilya.",
    },
    badge: { en: "Housing", tl: "Pabahay" },
    badgeColor: "#0071e3",
    badgeBg: "rgba(0, 113, 227, 0.12)",
    color: "#0071e3",
    iconBg: "rgba(0, 113, 227, 0.10)",
    icon: IconHome,
    features: {
      en: [
        "Building setback and zoning clearance",
        "Siting hazard screening",
        "Land title / Tax Dec verification",
      ],
      tl: [
        "Building setback at zoning clearance",
        "Siting hazard screening",
        "Land title / Tax Dec verification",
      ],
    },
  },
  Apartment: {
    key: "Apartment",
    title: "Apartment",
    tagline: { en: "Rental Building / Multi-Unit", tl: "Paupahang Gusali / Multi-Unit" },
    desc: {
      en: "Apartment complex, rental units, or residential rental buildings.",
      tl: "Apartment complex, paupahang mga yunit, o residential rental buildings.",
    },
    badge: { en: "Multi-Unit", tl: "Multi-Unit" },
    badgeColor: "#2563eb",
    badgeBg: "rgba(37, 99, 235, 0.12)",
    color: "#2563eb",
    iconBg: "rgba(37, 99, 235, 0.10)",
    icon: IconApartment,
    features: {
      en: [
        "Density and parking requirements",
        "Fire safety and egress clearance",
        "Locational clearance endorsement",
      ],
      tl: [
        "Density at parking requirement",
        "Fire safety at egress clearance",
        "Locational clearance endorsement",
      ],
    },
  },
  Townhouse: {
    key: "Townhouse",
    title: "Townhouse",
    tagline: { en: "Row House / Cluster", tl: "Row House / Cluster" },
    desc: {
      en: "Townhouses, attached dwelling units, or residential cluster development.",
      tl: "Townhouses, attached dwelling units, o residential cluster development.",
    },
    badge: { en: "Row House", tl: "Row House" },
    badgeColor: "#0284c7",
    badgeBg: "rgba(2, 132, 199, 0.12)",
    color: "#0284c7",
    iconBg: "rgba(2, 132, 199, 0.10)",
    icon: IconTownhouse,
    features: {
      en: [
        "Party-wall and setback compliance",
        "Drainage and utility clearance",
        "Residential zone verification",
      ],
      tl: [
        "Party-wall at setback compliance",
        "Drainage and utility clearance",
        "Residential zone verification",
      ],
    },
  },
  Dormitory: {
    key: "Dormitory",
    title: "Dormitory",
    tagline: { en: "Boarding House / Transient", tl: "Boarding House / Transient" },
    desc: {
      en: "Dormitory, boarding house, staff housing, or transient lodging facilities.",
      tl: "Dormitoryo, boarding house, staff housing, o pasilidad para sa transient.",
    },
    badge: { en: "Boarding", tl: "Boarding" },
    badgeColor: "#7c3aed",
    badgeBg: "rgba(124, 58, 237, 0.12)",
    color: "#7c3aed",
    iconBg: "rgba(124, 58, 237, 0.10)",
    icon: IconDormitory,
    features: {
      en: [
        "Sanitation and occupancy check",
        "CLUP urban zoning evaluation",
        "Barangay clearance validation",
      ],
      tl: [
        "Sanitation at occupancy check",
        "CLUP urban zoning evaluation",
        "Barangay clearance validation",
      ],
    },
  },
  Institutional: {
    key: "Institutional",
    title: "Institutional",
    tagline: { en: "School, Chapel, Facility", tl: "Paaralan, Kapilya, Pasilidad" },
    desc: {
      en: "Private school, chapel, church, community facility, or civic center.",
      tl: "Pribadong paaralan, kapilya, simbahan, pasilidad ng komunidad, o civic center.",
    },
    badge: { en: "School / Church", tl: "School / Church" },
    badgeColor: "#9333ea",
    badgeBg: "rgba(147, 51, 234, 0.12)",
    color: "#9333ea",
    iconBg: "rgba(147, 51, 234, 0.10)",
    icon: IconInstitutional,
    features: {
      en: [
        "Institutional zoning endorsement",
        "Traffic & accessibility screening",
        "Environmental screening",
      ],
      tl: [
        "Institutional zoning endorsement",
        "Traffic & accessibility screening",
        "Environmental screening",
      ],
    },
  },
  Commercial: {
    key: "Commercial",
    title: "Commercial",
    tagline: { en: "Store, Office, Business", tl: "Tindahan, Opisina, Negosyo" },
    desc: {
      en: "Retail store, restaurant, commercial office, bank, or shopping complex.",
      tl: "Tindahan, retail store, restawran, commercial office, bangko, o shopping complex.",
    },
    badge: { en: "Business / Store", tl: "Negosyo / Store" },
    badgeColor: "#d97706",
    badgeBg: "rgba(217, 119, 6, 0.14)",
    color: "#d97706",
    iconBg: "rgba(217, 119, 6, 0.10)",
    icon: IconCommercial,
    features: {
      en: [
        "Commercial CLUP zone check",
        "Clearance for Business Permit",
        "Traffic and parking review",
      ],
      tl: [
        "Commercial CLUP zone check",
        "Clearance para sa Business Permit",
        "Traffic at parking review",
      ],
    },
  },
  Industrial: {
    key: "Industrial",
    title: "Industrial",
    tagline: { en: "Warehouse, Workshop, Plant", tl: "Bodega, Pagawaan, Warehouse" },
    desc: {
      en: "Light industrial facility, warehouse, storage, packaging, or fabrication shop.",
      tl: "Light industrial facility, bodega, storage, packaging, o fabrication shop.",
    },
    badge: { en: "Warehouse / Factory", tl: "Warehouse / Factory" },
    badgeColor: "#475569",
    badgeBg: "rgba(71, 85, 105, 0.14)",
    color: "#475569",
    iconBg: "rgba(71, 85, 105, 0.10)",
    icon: IconIndustrial,
    features: {
      en: [
        "Industrial zoning compliance",
        "Heavy vehicle access clearance",
        "Environmental safety screening",
      ],
      tl: [
        "Industrial zoning compliance",
        "Heavy vehicle access clearance",
        "Environmental safety screening",
      ],
    },
  },
  "Agro-Industrial": {
    key: "Agro-Industrial",
    title: "Agro-Industrial",
    tagline: { en: "Poultry, Piggery, Feed/Rice Mill", tl: "Poultry, Piggery, Feed/Rice Mill" },
    desc: {
      en: "Agricultural and processing facilities like broiler/layer poultry, piggery, and feed mills.",
      tl: "Pasilidad pang-agrikultura at pagproseso tulad ng broiler/layer poultry, babuyan, at feed mill.",
    },
    badge: { en: "Poultry / Piggery", tl: "Poultry / Piggery" },
    badgeColor: "#16a34a",
    badgeBg: "rgba(22, 163, 74, 0.14)",
    color: "#16a34a",
    iconBg: "rgba(22, 163, 74, 0.10)",
    icon: IconAgroIndustrial,
    features: {
      en: [
        "500m mandatory buffer from residential zones",
        "200m buffer from rivers and water bodies",
        "Biogas and waste management plan",
      ],
      tl: [
        "500m mandatory buffer from residential zones",
        "200m buffer from rivers and water bodies",
        "Biogas and waste management plan",
      ],
    },
  },
};

/**
 * Intelligent categorization of any application or project record
 * into one of the 8 canonical building sectors.
 */
export function getBuildingSector(item: any): BuildingSectorKey {
  if (!item) return "Residential";

  // Check direct explicit property first
  const direct = String(
    item.sector ||
    item.lotDetails?.proposedBuildingType ||
    item.property?.proposedBuildingType ||
    item.buildingType ||
    item.proposedBuilding ||
    item.category ||
    ""
  ).trim();

  const directLow = direct.toLowerCase();
  if (directLow.includes("agro") || directLow.includes("poultry") || directLow.includes("piggery") || directLow.includes("feed mill") || directLow.includes("rice mill")) {
    return "Agro-Industrial";
  }
  if (directLow.includes("apartment")) return "Apartment";
  if (directLow.includes("townhouse") || directLow.includes("row house") || directLow.includes("rowhouse")) return "Townhouse";
  if (directLow.includes("dormitory") || directLow.includes("boarding house") || directLow.includes("transient")) return "Dormitory";
  if (
    directLow.includes("institution") ||
    directLow.includes("school") ||
    directLow.includes("church") ||
    directLow.includes("chapel") ||
    directLow.includes("simbahan") ||
    directLow.includes("kapilya") ||
    directLow.includes("hospital") ||
    directLow.includes("clinic")
  ) {
    return "Institutional";
  }
  if (directLow.includes("commercial")) return "Commercial";
  if (directLow.includes("industrial") && !directLow.includes("agro")) return "Industrial";
  if (directLow.includes("residential") || directLow.includes("pabahay")) return "Residential";

  // Combine textual metadata for contextual regex detection
  const text = [
    item.lotDetails?.proposedBuildingType,
    item.property?.proposedBuildingType,
    item.buildingType,
    item.proposedBuilding,
    item.sector,
    item.category,
    item.name,
    item.title,
    item.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(agro|poultry|piggery|feed\s*mill|rice\s*mill|babuyan|manukan|livestock|farm)\b/i.test(text)) {
    return "Agro-Industrial";
  }
  if (/\b(apartment|multi-unit|rental\s*unit|paupahan)\b/i.test(text)) {
    return "Apartment";
  }
  if (/\b(townhouse|row\s*house|rowhouse|cluster\s*house)\b/i.test(text)) {
    return "Townhouse";
  }
  if (/\b(dormitory|dorm|boarding\s*house|transient|lodging)\b/i.test(text)) {
    return "Dormitory";
  }
  if (
    /\b(institution|school|chapel|church|simbahan|kapilya|paaralan|clinic|hospital|health|rhu|civic|multi-purpose|multipurpose|evacuation|daycare|hall|barangay\s*hall|police|fire\s*station)\b/i.test(
      text
    )
  ) {
    return "Institutional";
  }
  if (
    /\b(commercial|store|stores|tindahan|market|palengke|office|business|retail|mall|restaurant|cafe|bank|hotel|shop|shops|negosyo)\b/i.test(
      text
    )
  ) {
    return "Commercial";
  }
  if (/\b(industrial|warehouse|bodega|workshop|plant|factory|fabrication|storage\s*facility)\b/i.test(text)) {
    return "Industrial";
  }
  if (/\b(residential|pabahay|house|housing|duplex|bungalow|single-family|tirahan)\b/i.test(text)) {
    return "Residential";
  }

  // Fallback heuristic: Municipal LGU projects without specific type default to Institutional (public works)
  if (
    item.isLguProject ||
    item.type === "Municipal Project" ||
    (typeof item.id === "string" && (item.id.startsWith("lgu-proj-") || item.id.startsWith("P")))
  ) {
    return "Institutional";
  }

  return "Residential";
}

/**
 * Filter predicate helper
 */
export function matchesSector(item: any, sectorKey?: string | null): boolean {
  if (!sectorKey || sectorKey === "all" || sectorKey === "") return true;
  return getBuildingSector(item) === sectorKey;
}
