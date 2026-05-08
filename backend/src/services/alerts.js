function severityRank(level) {
  if (level === "HIGH") return 3;
  if (level === "MODERATE") return 2;
  return 1;
}

export function createAlertFromRisk(featureCollection) {
  const features = featureCollection?.features || [];
  if (!Array.isArray(features) || features.length === 0) return null;

  let top = null;
  for (const f of features) {
    const level = f?.properties?.level;
    if (!level) continue;
    if (!top || severityRank(level) > severityRank(top.properties.level)) top = f;
  }

  if (!top) return null;
  if (top.properties.level !== "HIGH") return null;

  const zoneId = top.properties.zoneId;
  const score = top.properties.score;
  const rainfall = top.properties.rainfallIntensity;
  const slope = top.properties.slopeIndex;

  return {
    id: `AL-${zoneId}-${Date.now()}`,
    type: "LANDSLIDE_RISK",
    severity: "HIGH",
    zoneId,
    title: `High Landslide Risk: ${top.properties.name}`,
    message: `High rainfall (${rainfall}) + steep slope (${slope}) triggered high risk (score ${score}).`,
    recommendedAction:
      "Coordinate with barangay officials; prepare evacuation advisories for nearby slopes; validate drainage status.",
    triggeredAt: new Date().toISOString(),
  };
}

