function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildHeatPointsForBbox(bbox, opts = {}) {
  const { west, south, east, north } = bbox;
  const seed = Number.isFinite(opts.seed) ? opts.seed : Math.floor(Date.now() / 5000);
  const r = mulberry32(seed);

  const cols = 36;
  const rows = 24;
  const points = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lon = west + ((x + 0.5) / cols) * (east - west);
      const lat = south + ((y + 0.5) / rows) * (north - south);

      // Create a “moving storm core” by shifting a gaussian center over time.
      const t = (seed % 600) / 600;
      const cx = west + (0.25 + 0.55 * t) * (east - west);
      const cy = south + (0.55 - 0.25 * t) * (north - south);
      const dx = (lon - cx) / (east - west);
      const dy = (lat - cy) / (north - south);
      const storm = Math.exp(-(dx * dx * 16 + dy * dy * 10));

      // “Infrastructure density” blob near center of bbox.
      const ix = (lon - (west + (east - west) * 0.55)) / (east - west);
      const iy = (lat - (south + (north - south) * 0.55)) / (north - south);
      const infra = Math.exp(-(ix * ix * 24 + iy * iy * 24));

      const noise = r() * 0.15;
      const weight = clamp01(storm * 0.85 + infra * 0.35 + noise);

      points.push([lon, lat, Number(weight.toFixed(4))]);
    }
  }

  return points;
}

function zoneSeverity({ rainfallIntensity, slope }) {
  // Core thesis logic:
  // - High rainfall + steep slope => high risk
  // - Moderate => moderate
  // - Low => low
  const rain = clamp01(rainfallIntensity);
  const s = clamp01(slope);
  const score = clamp01(rain * 0.65 + s * 0.55);

  if (rain > 0.72 && s > 0.62) return { level: "HIGH", score };
  if (score > 0.55 || rain > 0.45) return { level: "MODERATE", score };
  return { level: "LOW", score };
}

export function computeRiskZones({ bbox, rainfallIntensity = 0.4, seed }) {
  const { west, south, east, north } = bbox;
  const s = Number.isFinite(seed) ? seed : Math.floor(Date.now() / 5000);
  const r = mulberry32(s + 1337);

  // Build 12-15 zones across the bbox (barangay-style partitions).
  const cols = 4;
  const rows = 3;
  const zones = [];
  let id = 1;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const padX = (east - west) * 0.01;
      const padY = (north - south) * 0.01;
      const zWest = west + (x / cols) * (east - west) + padX;
      const zEast = west + ((x + 1) / cols) * (east - west) - padX;
      const zSouth = south + (y / rows) * (north - south) + padY;
      const zNorth = south + ((y + 1) / rows) * (north - south) - padY;

      // Slope simulation: some zones are naturally steeper.
      const slope = clamp01(0.25 + r() * 0.75 + (y === 0 ? 0.15 : 0) + (x === 0 ? 0.08 : 0));
      const sev = zoneSeverity({ rainfallIntensity, slope });

      const feature = {
        type: "Feature",
        properties: {
          zoneId: `Z${id}`,
          name: `Zone ${id}`,
          slopeIndex: Number(slope.toFixed(3)),
          rainfallIntensity: Number(clamp01(rainfallIntensity).toFixed(3)),
          level: sev.level,
          score: Number(sev.score.toFixed(3)),
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [zWest, zSouth],
              [zEast, zSouth],
              [zEast, zNorth],
              [zWest, zNorth],
              [zWest, zSouth],
            ],
          ],
        },
      };

      zones.push(feature);
      id++;
    }
  }

  return {
    type: "FeatureCollection",
    features: zones,
    properties: {
      model: "rainfall+slope-v1",
      generatedAt: new Date().toISOString(),
    },
  };
}

