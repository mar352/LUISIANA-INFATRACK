import type { MapShape } from "./lib/map-shapes";

export type { MapShape, MapShapeKind } from "./lib/map-shapes";

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
  | "municipal_hall"
  | "rhu"
  | "road"
  | "bridge"
  | "water_tank"
  | "solar_farm"
  | "barn"
  | "evacuation_center"
  | "construction"
  | "custom"
  | "shape";

/** Placement / site markup drawn on the map (not a GLB). */
export type MapSketchKind = "pin" | "line" | "area";

/** Tools available in the placement toolbar (includes erase for OSM blocks). */
export type PlacementTool = MapSketchKind | "erase";

export type MapSketch = {
  kind: MapSketchKind;
  color: string;
  /** Vertices in order. Pin = 1; line ≥ 2; area ≥ 3. */
  coordinates: { lon: number; lat: number }[];
};

export const MAP_SKETCH_COLORS = [
  "#c47a1a",
  "#151c28",
  "#1d4e89",
  "#b42318",
  "#7a3e9d",
  "#0f766e",
] as const;

export const MODEL_CATALOG: {
  type: ModelType;
  label: string;
  icon: string;
  category: "Building" | "Infrastructure" | "Agriculture" | "Construction";
  description: string;
  glb: string;        // path under /models/
  scale: number;      // world-space scale multiplier
}[] = [
  { type: "municipal_hall",    label: "Municipal Hall",     icon: "municipal_hall",    category: "Building",        description: "Luisiana Municipal Hall",                      glb: "municipal-office.glb",   scale: 1   },
  { type: "rhu",               label: "Rural Health Unit",  icon: "rhu",               category: "Building",        description: "Luisiana Rural Health Unit (RHU)",            glb: "rural-health-unit.glb",  scale: 1   },
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
  { type: "shape",             label: "Map shape",           icon: "construction",      category: "Construction",    description: "Box, cylinder, freeform, roof, or tree",      glb: "building.glb",      scale: 8   },
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
  { phase: "Turnover",        label: "Turnover",        color: "#c9a227" },
  { phase: "Maintenance",     label: "Maintenance",     color: "#151c28" },
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

export type ProjectPhotoKind = "site" | "progress";

export type ProjectPhoto = {
  id: string;
  url: string;
  caption?: string;
  /** site = Overview gallery; progress = Progress Photos tab / monitoring. */
  kind?: ProjectPhotoKind;
  milestoneId?: string | null;
  uploadedAt: string;
  /** Phone GPS at capture, if the inspector allowed location. */
  lat?: number | null;
  lon?: number | null;
};

export type ProjectActivity = {
  at: string;
  message: string;
};

/** Citizen-facing project (public API DTO). */
export type PublicProject = {
  id: string;
  name: string;
  modelType: ModelType;
  type: "Municipal Project" | "Private Building" | "Agricultural Structure";
  department: "MPDC" | "Engineering" | "Agriculture" | "Negosyo Center";
  status: ProjectStatus;
  progress: number;
  location: { lat: number; lon: number };
  description?: string;
  startDate?: string | null;
  targetEndDate?: string | null;
  barangay?: string | null;
  fundingSource?: string | null;
  lifecyclePhase?: LifecyclePhase | null;
  customModelUrl?: string | null;
  rotation?: number;
  modelScale?: number;
  modelHeight?: number;
  milestones: ProjectMilestone[];
  issues: Array<{
    id: string;
    kind: "delay" | "issue";
    title: string;
    reportedAt: string;
    resolvedAt?: string | null;
    open: boolean;
  }>;
  photos: ProjectPhoto[];
  openIssueCount: number;
  updatedAt: string;
};

export type EngagementKind = "feedback" | "issue" | "suggestion";
export type EngagementStatus = "new" | "reviewing" | "resolved" | "dismissed";

export type EngagementSubmission = {
  id: string;
  kind: EngagementKind;
  title: string;
  body: string;
  category: string;
  projectId?: string | null;
  lng?: number | null;
  lat?: number | null;
  barangay?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status: EngagementStatus;
  createdAt: string;
  staffNote?: string | null;
  updatedAt?: string;
};

export type EngagementPublicStats = {
  total: number;
  byKind: Record<EngagementKind, number>;
  byStatus: Record<EngagementStatus, number>;
  open: number;
  closed: number;
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
  /** Extra orientation for the map GLB, degrees. */
  rotationPitch?: number;
  rotationRoll?: number;
  /** User-adjusted multiplier for the map GLB model. */
  modelScale?: number;
  /** Non-uniform stretch on the GLB (1 = no extra stretch). Width / depth / height. */
  modelScaleX?: number;
  modelScaleY?: number;
  modelScaleZ?: number;
  /**
   * Height above ground in meters. Use 0 (default) to clamp to terrain — no elevation float.
   */
  modelHeight?: number;
  /** When true, model cannot be moved / rotated / scaled on the map. */
  modelLocked?: boolean;
  /** When true, floating 3D badge above the model is hidden on the map. */
  hideBadge?: boolean;
  /**
   * MPDC site pin only — show a map marker, do not load a GLB until Engineering places a model.
   */
  siteMarkerOnly?: boolean;
  /** Procedural volume / roof / tree placed from the Shapes panel. */
  mapShape?: MapShape | null;
  /** Map markup from placement tools (pin / line / area). */
  mapSketch?: MapSketch | null;
  /** Marker / sketch stroke color (hex). */
  markerColor?: string;
  customModelUrl?: string;
  description?: string;
  startDate?: string | null;
  targetEndDate?: string | null;
  budgetTotal?: number | null;
  budgetSpent?: number;
  barangay?: string;
  fundingSource?: string;
  contractor?: string;
  /** Staff-set official page for this facility (https://…). */
  officialUrl?: string;
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
  Completed: "#151c28",
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

/** Committee botohan (yes / no / abstain) on a proposal under review. */
export type PlanningVoteChoice = "yes" | "no" | "abstain";

export type PlanningVote = {
  username: string;
  role: string;
  choice: PlanningVoteChoice;
  note?: string;
  at: string;
};

export type PlanningRequestKind =
  | "barangay_request"
  | "office_proposal"
  | "zoning_certificate"
  | "land_titling"
  | "planning_research";

export type CitizenServiceType = "zoning_certificate" | "land_titling" | "planning_research";

export type CitizenUploadedFile = {
  url: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType?: string;
  uploadedAt?: string;
  tag?: string; // e.g. "inside", "outside", "toilet", "notarized"
};

export type CitizenApplication = {
  id: string;
  trackingNumber: string;
  serviceType: CitizenServiceType;
  applicant: {
    fullName: string;
    contactPhone: string;
    contactEmail?: string;
    address: string;
    barangay: string;
  };
  lotDetails?: {
    tctNo?: string;
    taxDecNo?: string;
    lotOwner?: string;
    isApplicantOwner: boolean;
    proposedBuildingType?: string;
    lotAreaSqM?: number;
    lotLocationDescription?: string;
  };
  uploads: {
    tctTaxDec?: CitizenUploadedFile[];
    deedOrConsent?: CitizenUploadedFile[];
    rptReceipt?: CitizenUploadedFile[];
    brgyClearance?: CitizenUploadedFile[];
    ploCert?: CitizenUploadedFile[];
    photoDocs?: CitizenUploadedFile[];
    denrLetter?: CitizenUploadedFile[];
    studentIdLetter?: CitizenUploadedFile[];
  };
  notes?: string;
  status: "submitted" | "in_review" | "ocular_inspection" | "approved" | "rejected";
  stepProgress?: {
    currentStep: number;
    totalSteps: number;
    step1Completed: boolean;
    step1At?: string | null;
    step1By?: string | null;
    step2Completed: boolean;
    step2At?: string | null;
    step2By?: string | null;
    step3Completed: boolean;
    step3At?: string | null;
    step3By?: string | null;
  };
  responsibleOfficers?: { name: string; role: string }[];
  slaDays?: number;
  slaMinutes?: number;
  fee?: string;
  createdAt: string;
  updatedAt: string;
};

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
  /** Inter-office botohan / poll tallies. */
  votes?: PlanningVote[];
  /** Barangay infrastructure request vs office-originated proposal vs Citizen Charter applications. */
  requestKind?: PlanningRequestKind;
  citizenApplicationId?: string | null;
  citizenTrackingNumber?: string | null;
  citizenUploads?: CitizenApplication["uploads"] | null;
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

/** Plain-language column headers for the Planning Workspace board. */
export const PLANNING_STATUS_WORKSPACE_LABELS: Record<PlanningProposalStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "Under review",
  recommended: "Recommended",
  approved: "Approved",
  returned: "Returned",
  rejected: "Rejected",
};

export const PLANNING_STATUS_COLORS: Record<PlanningProposalStatus, string> = {
  draft: "#9b9b9b",
  submitted: "#6c8ebf",
  in_review: "#f5a623",
  recommended: "#c9a227",
  approved: "#151c28",
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


