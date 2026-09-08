/**
 * Luisiana Comprehensive Land Use Plan (CLUP) Zoning Classification Helper.
 */

export type ClupZoneInfo = {
  code: string;
  name: string;
  desc: string;
  isCommercial: boolean;
  type: "urban_commercial" | "rural";
  badgeColor: string;
  badgeBg: string;
  borderColor: string;
};

export const CLUP_ZONES: Record<string, ClupZoneInfo> = {
  "Barangay Zone I (Poblacion)": {
    code: "URBAN / COMMERCIAL",
    name: "Urban / Commercial Zone",
    desc: "Poblacion urban core & sentro ng kalakalan",
    isCommercial: true,
    type: "urban_commercial",
    badgeColor: "#fbbf24",
    badgeBg: "rgba(245, 158, 11, 0.18)",
    borderColor: "rgba(251, 191, 36, 0.45)",
  },
  "Barangay Zone II (Poblacion)": {
    code: "URBAN / COMMERCIAL",
    name: "Urban / Commercial Zone",
    desc: "Poblacion urban core & sentro ng kalakalan",
    isCommercial: true,
    type: "urban_commercial",
    badgeColor: "#fbbf24",
    badgeBg: "rgba(245, 158, 11, 0.18)",
    borderColor: "rgba(251, 191, 36, 0.45)",
  },
  "Barangay Zone III (Poblacion)": {
    code: "URBAN / COMMERCIAL",
    name: "Urban / Commercial Zone",
    desc: "Poblacion urban core & sentro ng kalakalan",
    isCommercial: true,
    type: "urban_commercial",
    badgeColor: "#fbbf24",
    badgeBg: "rgba(245, 158, 11, 0.18)",
    borderColor: "rgba(251, 191, 36, 0.45)",
  },
  "Barangay Zone IV (Poblacion)": {
    code: "URBAN / COMMERCIAL",
    name: "Urban / Commercial Zone",
    desc: "Poblacion urban core & sentro ng kalakalan",
    isCommercial: true,
    type: "urban_commercial",
    badgeColor: "#fbbf24",
    badgeBg: "rgba(245, 158, 11, 0.18)",
    borderColor: "rgba(251, 191, 36, 0.45)",
  },
  "Barangay Zone V (Poblacion)": {
    code: "URBAN / COMMERCIAL",
    name: "Urban / Commercial Zone",
    desc: "Poblacion urban core & sentro ng kalakalan",
    isCommercial: true,
    type: "urban_commercial",
    badgeColor: "#fbbf24",
    badgeBg: "rgba(245, 158, 11, 0.18)",
    borderColor: "rgba(251, 191, 36, 0.45)",
  },
  "Barangay Zone VI (Poblacion)": {
    code: "URBAN / COMMERCIAL",
    name: "Urban / Commercial Zone",
    desc: "Poblacion urban core & sentro ng kalakalan",
    isCommercial: true,
    type: "urban_commercial",
    badgeColor: "#fbbf24",
    badgeBg: "rgba(245, 158, 11, 0.18)",
    borderColor: "rgba(251, 191, 36, 0.45)",
  },
  "Barangay Zone VII (Poblacion)": {
    code: "URBAN / COMMERCIAL",
    name: "Urban / Commercial Zone",
    desc: "Poblacion urban core & sentro ng kalakalan",
    isCommercial: true,
    type: "urban_commercial",
    badgeColor: "#fbbf24",
    badgeBg: "rgba(245, 158, 11, 0.18)",
    borderColor: "rgba(251, 191, 36, 0.45)",
  },
  "Barangay Zone VIII (Poblacion)": {
    code: "URBAN / COMMERCIAL",
    name: "Urban / Commercial Zone",
    desc: "Poblacion urban core & sentro ng kalakalan",
    isCommercial: true,
    type: "urban_commercial",
    badgeColor: "#fbbf24",
    badgeBg: "rgba(245, 158, 11, 0.18)",
    borderColor: "rgba(251, 191, 36, 0.45)",
  },
  "De La Paz": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Antonio": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Buenaventura": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Diego": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Isidro": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Jose": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Juan": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Luis": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Pablo": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Pedro": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Rafael": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Roque": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "San Salvador": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "Santo Domingo": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  "Santo Tomas": {
    code: "RURAL",
    name: "Rural Zone",
    desc: "Rural barangay jurisdiction / Labas ng kabayanan",
    isCommercial: false,
    type: "rural",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
};

export function normalizeBarangayName(name?: string | null): string {
  if (!name) return "Barangay Zone I (Poblacion)";
  const trimmed = name.trim();
  if (CLUP_ZONES[trimmed]) return trimmed;

  // Check variations like "Poblacion Zone I" -> "Barangay Zone I (Poblacion)"
  const romanMap: Record<string, string> = {
    "1": "I", "i": "I", "2": "II", "ii": "II", "3": "III", "iii": "III",
    "4": "IV", "iv": "IV", "5": "V", "v": "V", "6": "VI", "vi": "VI",
    "7": "VII", "vii": "VII", "8": "VIII", "viii": "VIII",
  };
  const zoneMatch = trimmed.match(/zone\s+([ivx\d]+)/i);
  if (zoneMatch) {
    const rawNum = zoneMatch[1];
    const roman = romanMap[rawNum] || romanMap[rawNum.toLowerCase()] || rawNum.toUpperCase();
    const candidate = `Barangay Zone ${roman} (Poblacion)`;
    if (CLUP_ZONES[candidate]) return candidate;
  }

  // Check case-insensitive and prefix variations
  for (const official of Object.keys(CLUP_ZONES)) {
    if (official.toLowerCase() === trimmed.toLowerCase()) return official;
    const cleanOfficial = official.replace(/^Barangay\s+/i, "").replace(/\s*\(Poblacion\)/i, "").trim().toLowerCase();
    const cleanInput = trimmed.replace(/^Barangay\s+/i, "").replace(/\s*\(Poblacion\)/i, "").trim().toLowerCase();
    if (cleanOfficial === cleanInput) return official;
  }

  return trimmed;
}

export function getClupZone(barangay?: string | null): ClupZoneInfo {
  if (!barangay) {
    return {
      code: "RURAL",
      name: "Rural Zone",
      desc: "Rural barangay jurisdiction / Labas ng kabayanan",
      isCommercial: false,
      type: "rural",
      badgeColor: "#38bdf8",
      badgeBg: "rgba(56, 189, 248, 0.14)",
      borderColor: "rgba(56, 189, 248, 0.35)",
    };
  }
  const norm = normalizeBarangayName(barangay);
  return (
    CLUP_ZONES[norm] ||
    CLUP_ZONES[barangay] || {
      code: "RURAL",
      name: "Rural Zone",
      desc: "Rural barangay jurisdiction / Labas ng kabayanan",
      isCommercial: false,
      type: "rural",
      badgeColor: "#38bdf8",
      badgeBg: "rgba(56, 189, 248, 0.14)",
      borderColor: "rgba(56, 189, 248, 0.35)",
    }
  );
}

