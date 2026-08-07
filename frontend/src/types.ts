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

export type LifecyclePhase =
  | "Planning"
  | "Procurement"
  | "Construction"
  | "Inspection"
  | "Turnover"
  | "Maintenance"
  | "Decommissioned";

export const LIFECYCLE_PHASES: { phase: LifecyclePhase; label: string; color: string }[] = [
  { phase: "Planning",        label: "Planning",        color: "#9b9b9b" },
  { phase: "Procurement",     label: "Procurement",     color: "#6c8ebf" },
  { phase: "Construction",    label: "Construction",    color: "#f5a623" },
  { phase: "Inspection",      label: "Inspection",      color: "#d4a017" },
  { phase: "Turnover",        label: "Turnover",        color: "#82b366" },
  { phase: "Maintenance",     label: "Maintenance",     color: "#245C3A" },
  { phase: "Decommissioned",  label: "Decommissioned",  color: "#7a6b8a" },
];

// Official 23 barangays of Luisiana, Laguna (PSGC 0403412000)
export const BARANGAY_LIST = [
  "Barangay Zone I (Poblacion)",
  "Barangay Zone II (Poblacion)",
  "Barangay Zone III (Poblacion)",
  "Barangay Zone IV (Poblacion)",
  "Barangay Zone V (Poblacion)",
  "Barangay Zone VI (Poblacion)",
  "Barangay Zone VII (Poblacion)",
  "Barangay Zone VIII (Poblacion)",
  "De La Paz",
  "San Antonio",
  "San Buenaventura",
  "San Diego",
  "San Isidro",
  "San Jose",
  "San Juan",
  "San Luis",
  "San Pablo",
  "San Pedro",
  "San Rafael",
  "San Roque",
  "San Salvador",
  "Santo Domingo",
  "Santo Tomas",
] as const;

export type Barangay = typeof BARANGAY_LIST[number];

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
  /** User-adjusted multiplier for the map GLB model. */
  modelScale?: number;
  /** When true, model cannot be moved / rotated / scaled on the map. */
  modelLocked?: boolean;
  customModelUrl?: string;
  description?: string;
  startDate?: string | null;
  targetEndDate?: string | null;
  budgetTotal?: number | null;
  budgetSpent?: number;
  barangay?: string;
  fundingSource?: string;
  contractor?: string;
  lifecyclePhase?: LifecyclePhase;
  archivedAt?: string | null;
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

/** Collaborative Planning Module */

export type PlanningProposalStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "recommended"
  | "approved"
  | "returned"
  | "rejected";

export type PlanningApprovalDecision = "recommend" | "approve" | "return" | "reject";

export type PlanningEventType = "committee" | "hearing" | "deadline" | "site";

export type PlanningActor = {
  username: string;
  role: string;
  department?: string;
};

export type PlanningApproval = {
  role: string;
  username: string;
  decision: PlanningApprovalDecision;
  note?: string;
  at: string;
};

export type PlanningRequestKind = "barangay_request" | "office_proposal";

export type PlanningNeedsAssessment = {
  populationServed?: string;
  hazardExposure?: string;
  existingInfra?: string;
  urgencyNote?: string;
  assessedBy?: string;
  assessedAt?: string;
};

export type PlanningProposal = {
  id: string;
  title: string;
  summary: string;
  department: Project["department"];
  barangay?: string;
  priority: 1 | 2 | 3 | 4 | 5;
  status: PlanningProposalStatus;
  linkedProjectId?: string | null;
  location?: { lat: number; lon: number } | null;
  submitter: PlanningActor;
  assignees: string[];
  committeeId?: string | null;
  approvals: PlanningApproval[];
  /** Barangay infrastructure request vs office-originated proposal. */
  requestKind?: PlanningRequestKind;
  needsAssessment?: PlanningNeedsAssessment | null;
  recommendationScore?: number | null;
  recommendationReasons?: string[];
  attachments?: string[];
  createdAt: string;
  updatedAt: string;
};

export type PlanningComment = {
  id: string;
  author: string;
  role: string;
  body: string;
  createdAt: string;
  anchor?: { kind: "map" | "section"; label?: string } | null;
};

export type PlanningEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  type: PlanningEventType;
  proposalIds: string[];
  attendees: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlanningMeeting = {
  id: string;
  title: string;
  heldAt: string;
  attendees: string[];
  agenda: string;
  minutes: string;
  decisions: string[];
  proposalIds: string[];
  attachments: string[];
  createdAt: string;
  updatedAt: string;
};

export const PLANNING_STATUS_LABELS: Record<PlanningProposalStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  recommended: "Recommended",
  approved: "Approved",
  returned: "Returned",
  rejected: "Rejected",
};

export const PLANNING_STATUS_COLORS: Record<PlanningProposalStatus, string> = {
  draft: "#9b9b9b",
  submitted: "#6c8ebf",
  in_review: "#f5a623",
  recommended: "#82b366",
  approved: "#245C3A",
  returned: "#d4a017",
  rejected: "#e05252",
};

/** Municipal document categories for the Document Management System. */
export type DocumentCategory =
  | "CLUP"
  | "CDP"
  | "LDIP"
  | "AIP"
  | "infrastructure_plan"
  | "engineering_drawing"
  | "permit"
  | "feasibility_study";

export type DocumentVersionEntry = {
  version: number;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
};

export type MunicipalDocument = {
  id: string;
  title: string;
  category: DocumentCategory;
  description: string;
  year: number;
  barangay?: string;
  tags: string[];
  fileUrl: string;
  fileName: string;
  mimeType: string;
  version: number;
  previousVersions: DocumentVersionEntry[];
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
};

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  CLUP: "CLUP",
  CDP: "CDP",
  LDIP: "LDIP",
  AIP: "AIP",
  infrastructure_plan: "Infrastructure plan",
  engineering_drawing: "Engineering drawing",
  permit: "Permit",
  feasibility_study: "Feasibility study",
};

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "CLUP",
  "CDP",
  "LDIP",
  "AIP",
  "infrastructure_plan",
  "engineering_drawing",
  "permit",
  "feasibility_study",
];


