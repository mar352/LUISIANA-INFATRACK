/**
 * Approximate Luisiana barangay polygons: nearest-centroid grid inside the
 * municipal ring, then convex hull per barangay. For map color-coding, not a
 * cadastral survey.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const boundaryPath = path.join(root, "frontend/public/data/luisiana-boundary.geojson");
const outPath = path.join(root, "frontend/public/data/luisiana-barangays.geojson");

const CENTROIDS = [
  { name: "Barangay Zone I (Poblacion)", lon: 121.509387, lat: 14.1839084 },
  { name: "Barangay Zone II (Poblacion)", lon: 121.5103674, lat: 14.1839873 },
  { name: "Barangay Zone III (Poblacion)", lon: 121.5113341, lat: 14.1837591 },
  { name: "Barangay Zone IV (Poblacion)", lon: 121.5125314, lat: 14.1837933 },
  { name: "Barangay Zone V (Poblacion)", lon: 121.513583, lat: 14.1854236 },
  { name: "Barangay Zone VI (Poblacion)", lon: 121.5121485, lat: 14.185504 },
  { name: "Barangay Zone VII (Poblacion)", lon: 121.5112004, lat: 14.1854541 },
  { name: "Barangay Zone VIII (Poblacion)", lon: 121.5102021, lat: 14.1856137 },
  { name: "De La Paz", lon: 121.5375131, lat: 14.188082 },
  { name: "San Antonio", lon: 121.5061572, lat: 14.1873079 },
  { name: "San Buenaventura", lon: 121.5547896, lat: 14.1951736 },
  { name: "San Diego", lon: 121.5072126, lat: 14.1844996 },
  { name: "San Isidro", lon: 121.510284, lat: 14.1811622 },
  { name: "San Jose", lon: 121.5130008, lat: 14.1908359 },
  { name: "San Juan", lon: 121.5192551, lat: 14.1894542 },
  { name: "San Luis", lon: 121.5077204, lat: 14.1705015 },
  { name: "San Pablo", lon: 121.5291478, lat: 14.1870998 },
  { name: "San Pedro", lon: 121.5254577, lat: 14.17426 },
  { name: "San Rafael", lon: 121.5185067, lat: 14.1616657 },
  { name: "San Roque", lon: 121.5079647, lat: 14.1603499 },
  { name: "San Salvador", lon: 121.4903596, lat: 14.2162959 },
  { name: "Santo Domingo", lon: 121.5461878, lat: 14.1979935 },
  { name: "Santo Tomas", lon: 121.5167568, lat: 14.1869878 },
];

const COLORS = [
  "#c0392b", "#d35400", "#e67e22", "#f1c40f", "#27ae60",
  "#16a085", "#1abc9c", "#2980b9", "#8e44ad", "#e84393",
  "#00b894", "#fdcb6e", "#e17055", "#0984e3", "#6c5ce7",
  "#a29bfe", "#00cec9", "#55efc4", "#fab1a0", "#fd79a8",
  "#636e72", "#2d3436", "#b2bec3",
];

function ringFromGeojson(geojson) {
  const feature = geojson.features?.find(
    (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
  );
  if (!feature?.geometry) return [];
  if (feature.geometry.type === "Polygon") return feature.geometry.coordinates[0] ?? [];
  const polys = feature.geometry.coordinates;
  return polys.reduce((best, poly) => (poly[0].length > best.length ? poly[0] : best), polys[0]?.[0] ?? []);
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const denom = yj - yi || Number.EPSILON;
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function nearestIndex(lon, lat) {
  const k = Math.cos((lat * Math.PI) / 180);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < CENTROIDS.length; i++) {
    const c = CENTROIDS[i];
    const dlat = lat - c.lat;
    const dlon = (lon - c.lon) * k;
    const d = dlat * dlat + dlon * dlon;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

const geojson = JSON.parse(fs.readFileSync(boundaryPath, "utf8"));
const ring = ringFromGeojson(geojson);
if (ring.length < 4) throw new Error("municipal ring missing");

let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
for (const [lon, lat] of ring) {
  if (lon < west) west = lon;
  if (lon > east) east = lon;
  if (lat < south) south = lat;
  if (lat > north) north = lat;
}

const STEP = 0.00055;
const buckets = CENTROIDS.map(() => []);

for (let lat = south; lat <= north; lat += STEP) {
  for (let lon = west; lon <= east; lon += STEP) {
    if (!pointInRing(lon, lat, ring)) continue;
    buckets[nearestIndex(lon, lat)].push([lon, lat]);
  }
}

const features = CENTROIDS.map((c, i) => {
  let hull = convexHull(buckets[i]);
  if (hull.length < 3) {
    const pad = 0.0012;
    hull = [
      [c.lon - pad, c.lat - pad],
      [c.lon + pad, c.lat - pad],
      [c.lon + pad, c.lat + pad],
      [c.lon - pad, c.lat + pad],
    ];
  }
  if (hull[0][0] !== hull[hull.length - 1][0] || hull[0][1] !== hull[hull.length - 1][1]) {
    hull = [...hull, hull[0]];
  }
  return {
    type: "Feature",
    properties: {
      name: c.name,
      color: COLORS[i % COLORS.length],
      lon: c.lon,
      lat: c.lat,
    },
    geometry: { type: "Polygon", coordinates: [hull] },
  };
});

fs.writeFileSync(outPath, JSON.stringify({ type: "FeatureCollection", features }));
console.log(`wrote ${features.length} barangays → ${outPath}`);
