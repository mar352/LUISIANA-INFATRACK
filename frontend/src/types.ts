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
  | "evacuation_center"
  | "construction"
  | "custom";

export const MODEL_CATALOG: {
  type: ModelType;
  label: string;
  icon: string;
  category: "Building" | "Infrastructure" | "Agriculture" | "Construction";
  description: string;
  glb: string;        // path under /models/
  scale: number;      // world-space scale multiplier
}[] = [
  { type: "office",            label: "Office / Admin",      icon: "office",            category: "Building",        description: "Multi-floor office or admin building",        glb: "building.glb",      scale: 80  },
  { type: "school",            label: "School",              icon: "school",            category: "Building",        description: "Elementary or high school building",          glb: "building.glb",      scale: 100 },
  { type: "hospital",          label: "Health Center",       icon: "hospital",          category: "Building",        description: "Barangay health center or hospital",          glb: "Hospital.glb",      scale: 90  },
  { type: "barangay_hall",     label: "Barangay Hall",       icon: "barangay_hall",     category: "Building",        description: "Barangay hall or municipal building",         glb: "building.glb",      scale: 85  },
  { type: "evacuation_center", label: "Evacuation Center",   icon: "evacuation_center", category: "Building",        description: "Emergency evacuation facility",               glb: "building.glb",      scale: 110 },
  { type: "road",              label: "Road Segment",        icon: "road",              category: "Infrastructure",  description: "Road improvement or new road segment",        glb: "building.glb",      scale: 120 },
  { type: "bridge",            label: "Bridge",              icon: "bridge",            category: "Infrastructure",  description: "Bridge or overpass structure",                glb: "building.glb",      scale: 100 },
  { type: "water_tank",        label: "Water Tank",          icon: "water_tank",        category: "Infrastructure",  description: "Water reservoir or tank",                     glb: "building.glb",      scale: 60  },
  { type: "solar_farm",        label: "Solar Farm",          icon: "solar_farm",        category: "Infrastructure",  description: "Solar panel installation",                    glb: "building.glb",      scale: 130 },
  { type: "barn",              label: "Barn / Post-Harvest", icon: "barn",              category: "Agriculture",     description: "Agricultural barn or post-harvest facility",  glb: "building.glb",      scale: 95  },
  { type: "construction",      label: "Under Construction",  icon: "construction",      category: "Construction",    description: "Site under active construction",              glb: "construction.glb",  scale: 80  },
  { type: "custom",            label: "Custom Model",        icon: "construction",      category: "Construction",    description: "Upload your own 3D model",                    glb: "building.glb",      scale: 80  },
];

export type ProjectStatus = "Planned" | "Ongoing" | "Delayed" | "Completed" | "Suspended";

export type ProjectMilestone = {
  id: string;
  title: string;
  targetDate: string;
  completedAt?: string;
  status: "pending" | "done" | "missed";
};

export type ProjectIssue = {
  id: string;
  kind: "delay" | "issue";
  title: string;
  description: string;
  reportedAt: string;
  resolvedAt?: string;
};

export type ProjectPhoto = {
  id: string;
  url: string;
  caption?: string;
  milestoneId?: string | null;
  uploadedAt: string;
};

export type ProjectActivity = {
  at: string;
  message: string;
};

export type Project = {
  id: string;
  name: string;
  modelType: ModelType;
  type: "Municipal Project" | "Private Building" | "Agricultural Structure";
  department: "MPDC" | "Engineering" | "Agriculture" | "Negosyo Center";
  status: ProjectStatus;
  progress: number;
  location: { lat: number; lon: number };
  rotation?: number;
  customModelUrl?: string;
  description?: string;
  startDate?: string | null;
  targetEndDate?: string | null;
  budgetTotal?: number | null;
  budgetSpent?: number;
  milestones: ProjectMilestone[];
  issues: ProjectIssue[];
  photos: ProjectPhoto[];
  activityLog: ProjectActivity[];
  updatedAt: string;
};

export type ProjectAccomplishmentReport = {
  generatedAt: string;
  project: {
    id: string;
    name: string;
    department: string;
    type: string;
    status: ProjectStatus;
    progress: number;
    description?: string;
  };
  timeline: {
    startDate: string | null;
    targetEndDate: string | null;
    milestonesTotal: number;
    milestonesDone: number;
    milestonesMissed: number;
    milestones: ProjectMilestone[];
  };
  budget: {
    total: number | null;
    spent: number;
    utilizationPct: number | null;
    overBudget: boolean;
  };
  issues: {
    openDelays: number;
    openIssues: number;
    resolved: number;
    items: ProjectIssue[];
  };
  photos: {
    count: number;
    items: ProjectPhoto[];
  };
  activityLog: ProjectActivity[];
  narrative: string;
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  Planned: "#9b9b9b",
  Ongoing: "#f5a623",
  Delayed: "#e05252",
  Completed: "#245C3A",
  Suspended: "#7a6b8a",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  Planned: "Planned",
  Ongoing: "Ongoing",
  Delayed: "Delayed",
  Completed: "Completed",
  Suspended: "Suspended",
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

