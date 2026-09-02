import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "frontend/public/data/luisiana-roads.geojson");

const LUISIANA_BOUNDS = {
  west: 121.44,
  south: 14.12,
  east: 121.58,
  north: 14.27,
};

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function fetchRoads() {
  const { west, south, east, north } = LUISIANA_BOUNDS;
  const query = `
[out:json][timeout:60];
(
  way["highway"](${south},${west},${north},${east});
);
out geom;
`.trim();

  let data = null;
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`Trying Overpass API endpoint: ${endpoint}...`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": "LuisianaInfraTrack/1.0 (GIS road network tool)",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (res.ok) {
        data = await res.json();
        console.log(`Success with ${endpoint}`);
        break;
      }
      console.warn(`Endpoint ${endpoint} returned ${res.status}`);
    } catch (e) {
      console.warn(`Endpoint ${endpoint} failed:`, e.message);
    }
  }

  if (!data) {
    throw new Error("All Overpass endpoints failed");
  }

  const elements = data.elements || [];
  console.log(`Received ${elements.length} elements from Overpass.`);

  const features = [];
  for (const el of elements) {
    if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
    
    const coordinates = el.geometry.map((pt) => [pt.lon, pt.lat]);
    features.push({
      type: "Feature",
      id: el.id,
      properties: {
        id: el.id,
        name: el.tags?.name || "",
        highway: el.tags?.highway || "road",
        surface: el.tags?.surface || "asphalt",
        lanes: el.tags?.lanes ? parseInt(el.tags.lanes, 10) : undefined,
        oneway: el.tags?.oneway === "yes",
        bridge: el.tags?.bridge === "yes",
        tunnel: el.tags?.tunnel === "yes",
      },
      geometry: {
        type: "LineString",
        coordinates,
      },
    });
  }

  const geojson = {
    type: "FeatureCollection",
    features,
  };

  fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2), "utf8");
  console.log(`Successfully saved ${features.length} road segments to ${outPath}`);
}

fetchRoads().catch((err) => {
  console.error("Failed to build roads geojson:", err);
  process.exit(1);
});
