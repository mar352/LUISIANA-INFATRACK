export type HeatPoint = [number, number, number]; // [lon,lat,weight]

export type WeatherForecastHour = {
  hour: number;
  temperatureC: number;
  rainfallMm: number;
  cloudinessPct: number;
  windSpeedMps: number;
  windDirectionDeg: number;
};

export type WeatherSnapshot = {
  source: string;
  lat: number;
  lon: number;
  seed: number;
  observedAt: string;
  temperatureC: number;
  windSpeedMps: number;
  windDirectionDeg: number;
  rainfallMm: number;
  cloudinessPct: number;
  humidityPct: number;
  pressureHpa: number;
  rainfallIntensity: number;
  stormTrack: GeoJSON.Feature<GeoJSON.LineString, { kind: "stormTrack" }>;
  forecast: WeatherForecastHour[]; // next 6 hours from ECMWF
};

export type RiskFeature = GeoJSON.Feature<
  GeoJSON.Polygon,
  {
    zoneId: string;
    name: string;
    slopeIndex: number;
    rainfallIntensity: number;
    level: "LOW" | "MODERATE" | "HIGH";
    score: number;
  }
>;

export type RiskZones = GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  RiskFeature["properties"]
> & { properties?: Record<string, unknown> };

export type ModelType =
  | "office"
  | "school"
  | "hospital"
  | "barangay_hall"
  | "road"
  | "bridge"
  | "water_tank"
  | "solar_farm"
  | "barn"
  | "evacuation_center";

export const MODEL_CATALOG: {
  type: ModelType;
  label: string;
  icon: string;
  category: "Building" | "Infrastructure" | "Agriculture";
  description: string;
  glb: string;        // path under /models/
  scale: number;      // world-space scale multiplier
}[] = [
  { type: "office",            label: "Office / Admin",      icon: "🏢", category: "Building",        description: "Multi-floor office or admin building",        glb: "building.glb", scale: 80  },
  { type: "school",            label: "School",              icon: "🏫", category: "Building",        description: "Elementary or high school building",          glb: "building.glb", scale: 100 },
  { type: "hospital",          label: "Health Center",       icon: "🏥", category: "Building",        description: "Barangay health center or hospital",          glb: "building.glb", scale: 90  },
  { type: "barangay_hall",     label: "Barangay Hall",       icon: "🏛️", category: "Building",        description: "Barangay hall or municipal building",         glb: "building.glb", scale: 85  },
  { type: "evacuation_center", label: "Evacuation Center",   icon: "⛺", category: "Building",        description: "Emergency evacuation facility",               glb: "building.glb", scale: 110 },
  { type: "road",              label: "Road Segment",        icon: "🛣️", category: "Infrastructure",  description: "Road improvement or new road segment",        glb: "building.glb", scale: 120 },
  { type: "bridge",            label: "Bridge",              icon: "🌉", category: "Infrastructure",  description: "Bridge or overpass structure",                glb: "building.glb", scale: 100 },
  { type: "water_tank",        label: "Water Tank",          icon: "💧", category: "Infrastructure",  description: "Water reservoir or tank",                     glb: "building.glb", scale: 60  },
  { type: "solar_farm",        label: "Solar Farm",          icon: "☀️", category: "Infrastructure",  description: "Solar panel installation",                    glb: "building.glb", scale: 130 },
  { type: "barn",              label: "Barn / Post-Harvest", icon: "🏚️", category: "Agriculture",     description: "Agricultural barn or post-harvest facility",  glb: "building.glb", scale: 95  },
];

export type Project = {
  id: string;
  name: string;
  modelType: ModelType;
  type: "Municipal Project" | "Private Building" | "Agricultural Structure";
  department: "MPDC" | "Engineering" | "Agriculture" | "Negosyo Center";
  status: "Planning" | "Ongoing" | "Completed";
  progress: number;
  location: { lat: number; lon: number };
  rotation?: number; // degrees 0-360
  updatedAt: string;
};

export type AlertItem = {
  id: string;
  type: "LANDSLIDE_RISK";
  severity: "HIGH";
  zoneId: string;
  title: string;
  message: string;
  recommendedAction: string;
  triggeredAt: string;
};

