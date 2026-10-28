import React, { useState, useEffect, useMemo, useRef } from "react";
import maplibregl, { type Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Building2,
  HardHat,
  Banknote,
  PieChart,
  Camera,
  RotateCcw,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  Layers,
  Eye,
} from "lucide-react";
import { SiteProgressPopup } from "./SiteProgressPopup";
import {
  BARANGAY_LIST,
  type Project,
} from "../types";
import {
  stadiaStyleUrl,
  STADIA_MAP_STYLES,
  type StadiaMapStyleId,
} from "../lib/stadia";
import {
  getPinSvgForProject,
  makeClassicMapPinIcon,
  RED_PIN_SVG_DATA_URL,
} from "./CesiumMap";
import { BARANGAY_COORDINATES } from "./PinpointMapPicker";
import { lookupBarangayCoords } from "../lib/barangay-overlay";
import { subscribeToProjects } from "../services/firestore-projects";
import { fetchPublicProjects } from "../lib/api";
import { ensurePinImages, projectsToGeoJson } from "../lib/stadia-pins";
import "./PublicTransparencyPortal.css";

export interface PublicTransparencyPortalProps {
  /** Optional externally passed projects (e.g. from parent state or testing) */
  projects?: Project[];
  /** Callback to return to Home / Landing / Dashboard */
  onBack?: () => void;
  /** Custom label for the back button (default: "Bumalik") */
  backLabel?: string;
  /** Callback to open online citizen services / permit applications */
  onOpenOnlineServices?: () => void;
  /** Initial filter status if requested */
  initialStatus?: "all" | "Pre-construction" | "Ongoing" | "Completed";
  /** Portal Mode: 'public' (Transparency page) or 'engineer' (Municipal Engineer GIS Map) */
  mode?: "public" | "engineer";
  /** Whether inspection updates are allowed */
  canInspect?: boolean;
  /** Callback triggered when user clicks "Magsagawa ng Inspeksyon" / "I-update ang Progress" */
  onInspectProject?: (project: Project) => void;
  /** Whether adding an LGU project is allowed */
  canAddProject?: boolean;
  /** Callback triggered when clicking "Mag-encode ng Proyekto" */
  onAddProject?: () => void;
  /** Controlled selected project ID */
  selectedProjectId?: string | null;
  /** Callback when a project is selected */
  onSelectProject?: (project: Project | null) => void;
}

// Center coordinate for Luisiana, Laguna (Poblacion)
const LUISIANA_CENTER = { lon: 121.5089, lat: 14.1837 };

// Layer IDs for Luisiana Municipal Border and Barangays
const SOURCE_BOUNDARY = "ptp-luisiana-boundary-source";
const LAYER_BOUNDARY_FILL = "ptp-luisiana-boundary-fill";
const LAYER_BOUNDARY_CASING = "ptp-luisiana-boundary-casing";
const LAYER_BOUNDARY_LINE = "ptp-luisiana-boundary-line";

const SOURCE_BARANGAYS = "ptp-luisiana-barangays-source";
const SOURCE_BARANGAY_LABELS = "ptp-luisiana-barangay-labels";
const LAYER_BARANGAYS_FILL = "ptp-luisiana-barangays-fill";
const LAYER_BARANGAYS_LINE = "ptp-luisiana-barangays-line";
const LAYER_BARANGAYS_LABEL = "ptp-luisiana-barangays-label";

// In-memory module cache for geojson files
let cachedBoundaryGeoJson: GeoJSON.FeatureCollection | null = null;
let cachedBarangayGeoJson: GeoJSON.FeatureCollection | null = null;
let cachedBarangayLabelsGeoJson: GeoJSON.FeatureCollection | null = null;

function shortLabel(name: string): string {
  return name
    .replace(/^Barangay\s+/i, "")
    .replace(/\s*\(Poblacion\)\s*/i, "")
    .trim();
}

// Pre-load GeoJSON boundary assets
if (typeof window !== "undefined") {
  fetch("/data/luisiana-boundary.geojson")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data) cachedBoundaryGeoJson = data as GeoJSON.FeatureCollection;
    })
    .catch(() => undefined);

  fetch("/data/luisiana-barangays.geojson")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      cachedBarangayGeoJson = data as GeoJSON.FeatureCollection;
      const labelFeatures: GeoJSON.Feature[] = [];
      for (const f of (data as GeoJSON.FeatureCollection).features ?? []) {
        const name = String(f.properties?.name ?? "");
        const ring = f.geometry?.type === "Polygon" ? (f.geometry as GeoJSON.Polygon).coordinates?.[0] : null;
        if (!name || !ring || ring.length < 4) continue;
        let sumLon = 0;
        let sumLat = 0;
        const n = ring.length - 1;
        for (let k = 0; k < n; k++) {
          sumLon += ring[k][0];
          sumLat += ring[k][1];
        }
        labelFeatures.push({
          type: "Feature",
          properties: {
            name,
            label: shortLabel(name),
          },
          geometry: {
            type: "Point",
            coordinates: [sumLon / n, sumLat / n],
          },
        });
      }
      cachedBarangayLabelsGeoJson = {
        type: "FeatureCollection",
        features: labelFeatures,
      };
    })
    .catch(() => undefined);
}

/** Formats currency amounts as Philippine Peso (PHP) */
function formatPeso(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(amount) || amount === 0) {
    return "₱0.00";
  }
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Maps system status or lifecycle phase to the required three transparency tiers */
function getNormalizedStatus(
  project?: Project | null
): "Pre-construction" | "Ongoing" | "Completed" | "Awaiting Data" {
  if (!project) return "Pre-construction";
  const s = String(project.status || "").toLowerCase();
  const phase = String(project.lifecyclePhase || "").toLowerCase();

  if (s === "completed" || phase === "turnover" || phase === "maintenance") {
    return "Completed";
  }
  if (s === "ongoing" || phase === "construction" || phase === "inspection") {
    return "Ongoing";
  }
  if (
    s === "planned" ||
    s === "pre-construction" ||
    phase === "planning" ||
    phase === "procurement"
  ) {
    return "Pre-construction";
  }
  return "Pre-construction";
}

export const PublicTransparencyPortal: React.FC<PublicTransparencyPortalProps> = ({
  projects: propProjects,
  onBack,
  backLabel,
  onOpenOnlineServices,
  initialStatus = "all",
  mode = "public",
  canInspect = false,
  onInspectProject,
  canAddProject = false,
  onAddProject,
  selectedProjectId: propSelectedProjectId,
  onSelectProject,
}) => {
  // ── 1. REAL DATA MANAGEMENT (Multi-source: REST, Firestore, Local Cache & Global Events) ──
  const [dbProjects, setDbProjects] = useState<Project[]>(() => {
    const list: Project[] = [];
    if (Array.isArray(propProjects) && propProjects.length > 0) {
      list.push(...propProjects);
    }
    try {
      const raw = localStorage.getItem("infatrack-projects-cache");
      if (raw) {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached) && cached.length > 0) {
          const map = new Map<string, Project>();
          for (const p of list) if (p?.id) map.set(p.id, p);
          for (const p of cached) if (p?.id) {
            // Filter out corrupted test project that overrode Simbahan
            if (p.id === "lgu-proj-1793104962886" && (p.name !== "Simbahan" || Number(p.budgetTotal) > 100000)) {
              continue;
            }
            const existing = map.get(p.id);
            map.set(p.id, { ...p, ...(existing || {}) });
          }
          return Array.from(map.values());
        }
      }
    } catch {}
    return list;
  });
  const [isLoading, setIsLoading] = useState<boolean>(!propProjects && dbProjects.length === 0);

  useEffect(() => {
    let isMounted = true;

    // Helper to merge incoming projects cleanly into state & cache
    const mergeIncomingProjects = (incoming: Project[]) => {
      if (!isMounted || !Array.isArray(incoming) || incoming.length === 0) return;
      setDbProjects((prev) => {
        const map = new Map<string, Project>();
        for (const p of prev) {
          if (p?.id) {
            // Clean out corrupted Simbahan override
            if (p.id === "lgu-proj-1793104962886" && (p.name !== "Simbahan" || Number(p.budgetTotal) > 100000)) {
              continue;
            }
            map.set(p.id, p);
          }
        }
        for (const p of incoming) if (p?.id) {
          const existing = map.get(p.id);
          // Incoming fresh API / PostgreSQL / event data takes precedence
          map.set(p.id, { ...(existing || {}), ...p });
        }
        const merged = Array.from(map.values());
        try {
          localStorage.setItem("infatrack-projects-cache", JSON.stringify(merged));
        } catch {}
        return merged;
      });
      setIsLoading(false);
    };

    // If propProjects is provided or changes, merge immediately
    if (Array.isArray(propProjects) && propProjects.length > 0) {
      mergeIncomingProjects(propProjects);
    }

    // 1. Subscribe to live Firestore projects (real-time sync)
    const unsubscribe = subscribeToProjects((liveProjects) => {
      if (!isMounted) return;
      if (Array.isArray(liveProjects) && liveProjects.length > 0) {
        mergeIncomingProjects(liveProjects);
      }
    });

    // 2. Fetch public projects via REST API (/api/public/projects)
    fetchPublicProjects()
      .then((res) => {
        if (!isMounted) return;
        if (Array.isArray(res?.projects) && res.projects.length > 0) {
          mergeIncomingProjects(res.projects as any);
        }
      })
      .catch((err) => {
        console.info("[PublicTransparencyPortal] REST fetch notice:", err?.message || err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // 3. Listen for live events when an LGU project is pinned or created
    const handleLguProjectAdded = (e: any) => {
      if (e?.detail?.id) {
        mergeIncomingProjects([e.detail]);
      }
    };
    const handleProjectsUpdated = (e: any) => {
      if (Array.isArray(e?.detail)) {
        mergeIncomingProjects(e.detail);
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "infatrack-projects-cache" && e.newValue) {
        try {
          const list = JSON.parse(e.newValue);
          if (Array.isArray(list)) mergeIncomingProjects(list);
        } catch {}
      }
    };

    window.addEventListener("lgu-project-added", handleLguProjectAdded);
    window.addEventListener("projects-updated", handleProjectsUpdated);
    window.addEventListener("storage", handleStorage);

    return () => {
      isMounted = false;
      unsubscribe();
      window.removeEventListener("lgu-project-added", handleLguProjectAdded);
      window.removeEventListener("projects-updated", handleProjectsUpdated);
      window.removeEventListener("storage", handleStorage);
    };
  }, [propProjects]);

  const activeProjects = useMemo(() => {
    const map = new Map<string, Project>();

    // 1. Pass in propProjects if any
    if (Array.isArray(propProjects)) {
      for (const p of propProjects) {
        if (p?.id) map.set(p.id, p);
      }
    }

    // 2. Merge with dbProjects (Firestore, REST API, events)
    for (const p of dbProjects) {
      if (p?.id) {
        const existing = map.get(p.id);
        map.set(p.id, { ...existing, ...p });
      }
    }

    // 3. Directly check local cache to guarantee zero missing pins (database records take priority)
    try {
      const raw = localStorage.getItem("infatrack-projects-cache");
      if (raw) {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached)) {
          for (const p of cached) {
            if (p?.id) {
              if (p.id === "lgu-proj-1793104962886" && (p.name !== "Simbahan" || Number(p.budgetTotal) > 100000)) {
                continue;
              }
              const existing = map.get(p.id);
              // Fresh database / REST API / prop record ALWAYS overrides stale local cache
              map.set(p.id, { ...p, ...(existing || {}) });
            }
          }
        }
      }
    } catch {}

    const all = Array.from(map.values());

    // STRICT: Only LGU / Municipal Infrastructure projects appear in Public Transparency Portal!
    return all.filter((p) => {
      if (!p) return false;
      // Exclude private citizen applications
      if (p.isPrivateApplication || p.type === "Private Building" || (p as any).trackingNumber) {
        return false;
      }
      // Must be an LGU / Municipal project
      return Boolean(
        p.isLguProject ||
        p.type === "Municipal Project" ||
        (typeof p.id === "string" && (
          p.id.startsWith("lgu-proj-") ||
          p.id.startsWith("P") ||
          p.id.startsWith("municipal-") ||
          p.id.startsWith("muni-")
        ))
      );
    });
  }, [propProjects, dbProjects]);

  // ── 2. SIDEBAR FILTER CONTROLS ──
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedBarangay, setSelectedBarangay] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<
    "all" | "Pre-construction" | "Ongoing" | "Completed"
  >(initialStatus);

  // Collapsible sidebar state (width: ~350px when open)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // ── 3. MAP STATE & STADIA MAPS API ──
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);

  // Active Stadia Maps style (Outdoors, Alidade Smooth, Satellite, OSM Bright, etc.)
  const [activeStadiaStyle, setActiveStadiaStyle] = useState<StadiaMapStyleId>("outdoors");
  const [isStylePickerOpen, setIsStylePickerOpen] = useState<boolean>(false);

  // Selected project for map popup card
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(propSelectedProjectId || null);
  const [isPopupOpen, setIsPopupOpen] = useState<boolean>(true);
  // Controlled view of site progress / streetview modal
  const [viewingSiteProgress, setViewingSiteProgress] = useState<Project | null>(null);

  // Sync propSelectedProjectId when passed externally
  useEffect(() => {
    if (propSelectedProjectId !== undefined && propSelectedProjectId !== selectedProjectId) {
      setSelectedProjectId(propSelectedProjectId);
      if (propSelectedProjectId) {
        setIsPopupOpen(true);
      }
    }
  }, [propSelectedProjectId]);

  // Handle map resize when component mounts or viewport changes
  useEffect(() => {
    const handleResize = () => {
      mapRef.current?.resize();
    };
    window.addEventListener("resize", handleResize);
    const t1 = setTimeout(handleResize, 150);
    const t2 = setTimeout(handleResize, 500);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Filter projects by search, barangay, and status
  const filteredProjects = useMemo(() => {
    return activeProjects.filter((project) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = (project.name || "").toLowerCase().includes(query);
        const matchBarangay = (project.barangay || "").toLowerCase().includes(query);
        const matchContractor = (
          project.contractor ||
          project.biddingResults?.winningContractor ||
          ""
        )
          .toLowerCase()
          .includes(query);

        if (!matchName && !matchBarangay && !matchContractor) {
          return false;
        }
      }

      if (selectedBarangay !== "all") {
        if ((project.barangay || "").trim() !== selectedBarangay.trim()) {
          return false;
        }
      }

      if (selectedStatus !== "all") {
        const normalized = getNormalizedStatus(project);
        if (normalized !== selectedStatus) {
          return false;
        }
      }

      return true;
    });
  }, [activeProjects, searchQuery, selectedBarangay, selectedStatus]);

  // Selected project for details card
  const selectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return filteredProjects.length > 0 ? filteredProjects[0] : null;
    }
    return (
      activeProjects.find((p) => p.id === selectedProjectId) ??
      (filteredProjects.length > 0 ? filteredProjects[0] : null)
    );
  }, [selectedProjectId, activeProjects, filteredProjects]);

  // Helper to extract or fallback to verified barangay coordinates, strictly constrained within Luisiana
  const getProjectCoords = (p: Project | null): { lon: number; lat: number } | null => {
    if (!p) return null;

    const lon = Number(p.location?.lon);
    const lat = Number(p.location?.lat);
    const hasValidCoords = Number.isFinite(lon) && Number.isFinite(lat) && lon !== 0 && lat !== 0;

    // Check if the coordinates legitimately fall within Luisiana municipal borders
    const isInsideLuisiana =
      hasValidCoords &&
      lat >= 14.14 &&
      lat <= 14.23 &&
      lon >= 121.46 &&
      lon <= 121.61;

    if (isInsideLuisiana) {
      return { lon, lat };
    }

    // If coordinates are outside Luisiana or missing, resolve from the project's official Barangay
    if (p.barangay) {
      const clean = p.barangay.trim();
      if (BARANGAY_COORDINATES[clean]) {
        return BARANGAY_COORDINATES[clean];
      }
      const lookedUp = lookupBarangayCoords(clean);
      if (lookedUp) {
        return lookedUp;
      }
    }

    return LUISIANA_CENTER;
  };

  // Target coordinates: selected project location or center of Luisiana
  const targetCoords = useMemo(() => {
    return getProjectCoords(selectedProject) || LUISIANA_CENTER;
  }, [selectedProject]);

  const PTP_SOURCE_ID = "ptp-projects-source";
  const PTP_PINS_LAYER_ID = "ptp-pins-layer";
  const PTP_GLOW_LAYER_ID = "ptp-glow-layer";

  // ── SETUP LUISIANA MUNICIPAL BOUNDARY (High-Contrast Cartographic Outer Border) ──
  const syncBoundaryLayers = async (map: MapLibreMap) => {
    if (!map.isStyleLoaded()) return;

    if (!cachedBoundaryGeoJson) {
      try {
        const res = await fetch("/data/luisiana-boundary.geojson");
        if (res.ok) {
          cachedBoundaryGeoJson = (await res.json()) as GeoJSON.FeatureCollection;
        }
      } catch (err) {
        console.warn("[PublicTransparencyPortal] Boundary fetch failed:", err);
        return;
      }
    }

    if (!cachedBoundaryGeoJson || !map.isStyleLoaded()) return;

    if (!map.getSource(SOURCE_BOUNDARY)) {
      map.addSource(SOURCE_BOUNDARY, {
        type: "geojson",
        data: cachedBoundaryGeoJson,
      });
    }

    const beforePin = map.getLayer(PTP_GLOW_LAYER_ID) ? PTP_GLOW_LAYER_ID : undefined;

    // 1. Subtle emerald tint inside Luisiana municipal boundary
    if (!map.getLayer(LAYER_BOUNDARY_FILL)) {
      map.addLayer(
        {
          id: LAYER_BOUNDARY_FILL,
          type: "fill",
          source: SOURCE_BOUNDARY,
          paint: {
            "fill-color": "#10b981",
            "fill-opacity": 0.08,
          },
        },
        beforePin
      );
    }

    // 2. High-contrast white casing for outer boundary line
    if (!map.getLayer(LAYER_BOUNDARY_CASING)) {
      map.addLayer(
        {
          id: LAYER_BOUNDARY_CASING,
          type: "line",
          source: SOURCE_BOUNDARY,
          paint: {
            "line-color": "#ffffff",
            "line-width": 6,
            "line-opacity": 0.85,
          },
        },
        beforePin
      );
    }

    // 3. Crisp dark boundary perimeter line
    if (!map.getLayer(LAYER_BOUNDARY_LINE)) {
      map.addLayer(
        {
          id: LAYER_BOUNDARY_LINE,
          type: "line",
          source: SOURCE_BOUNDARY,
          paint: {
            "line-color": "#0f172a",
            "line-width": 3.2,
            "line-opacity": 1.0,
          },
        },
        beforePin
      );
    }
  };

  // ── SETUP COLOR-CODED BARANGAY AREAS & LABELS ──
  const syncBarangayLayers = async (map: MapLibreMap) => {
    if (!map.isStyleLoaded()) return;

    if (!cachedBarangayGeoJson) {
      try {
        const res = await fetch("/data/luisiana-barangays.geojson");
        if (res.ok) {
          const gj = (await res.json()) as GeoJSON.FeatureCollection;
          cachedBarangayGeoJson = gj;

          const labelFeatures: GeoJSON.Feature[] = [];
          for (const f of gj.features ?? []) {
            const name = String(f.properties?.name ?? "");
            const ring = f.geometry?.type === "Polygon" ? (f.geometry as GeoJSON.Polygon).coordinates?.[0] : null;
            if (!name || !ring || ring.length < 4) continue;
            let sumLon = 0;
            let sumLat = 0;
            const n = ring.length - 1;
            for (let k = 0; k < n; k++) {
              sumLon += ring[k][0];
              sumLat += ring[k][1];
            }
            labelFeatures.push({
              type: "Feature",
              properties: {
                name,
                label: shortLabel(name),
              },
              geometry: {
                type: "Point",
                coordinates: [sumLon / n, sumLat / n],
              },
            });
          }
          cachedBarangayLabelsGeoJson = {
            type: "FeatureCollection",
            features: labelFeatures,
          };
        }
      } catch (err) {
        console.warn("[PublicTransparencyPortal] Barangays fetch failed:", err);
        return;
      }
    }

    if (!cachedBarangayGeoJson || !map.isStyleLoaded()) return;

    if (!map.getSource(SOURCE_BARANGAYS)) {
      map.addSource(SOURCE_BARANGAYS, {
        type: "geojson",
        data: cachedBarangayGeoJson,
      });
    }

    if (cachedBarangayLabelsGeoJson && !map.getSource(SOURCE_BARANGAY_LABELS)) {
      map.addSource(SOURCE_BARANGAY_LABELS, {
        type: "geojson",
        data: cachedBarangayLabelsGeoJson,
      });
    }

    const beforePin = map.getLayer(PTP_GLOW_LAYER_ID) ? PTP_GLOW_LAYER_ID : undefined;
    const focusedName = selectedBarangay !== "all" ? selectedBarangay.trim().toLowerCase() : "";

    // Barangay fills with official color coding
    if (!map.getLayer(LAYER_BARANGAYS_FILL)) {
      map.addLayer(
        {
          id: LAYER_BARANGAYS_FILL,
          type: "fill",
          source: SOURCE_BARANGAYS,
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": [
              "case",
              focusedName ? ["in", focusedName, ["downcase", ["get", "name"]]] : false,
              0.42,
              0.06,
            ],
          },
        },
        beforePin
      );
    } else {
      map.setPaintProperty(LAYER_BARANGAYS_FILL, "fill-opacity", [
        "case",
        focusedName ? ["in", focusedName, ["downcase", ["get", "name"]]] : false,
        0.42,
        0.06,
      ]);
    }

    // Barangay boundary lines
    if (!map.getLayer(LAYER_BARANGAYS_LINE)) {
      map.addLayer(
        {
          id: LAYER_BARANGAYS_LINE,
          type: "line",
          source: SOURCE_BARANGAYS,
          paint: {
            "line-color": ["get", "color"],
            "line-width": [
              "case",
              focusedName ? ["in", focusedName, ["downcase", ["get", "name"]]] : false,
              3.2,
              1.4,
            ],
            "line-opacity": 0.85,
          },
        },
        beforePin
      );
    } else {
      map.setPaintProperty(LAYER_BARANGAYS_LINE, "line-width", [
        "case",
        focusedName ? ["in", focusedName, ["downcase", ["get", "name"]]] : false,
        3.2,
        1.4,
      ]);
    }

    // Barangay name labels
    if (cachedBarangayLabelsGeoJson && !map.getLayer(LAYER_BARANGAYS_LABEL)) {
      map.addLayer(
        {
          id: LAYER_BARANGAYS_LABEL,
          type: "symbol",
          source: SOURCE_BARANGAY_LABELS,
          layout: {
            "text-field": ["get", "label"],
            "text-size": 11,
            "text-anchor": "center",
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#0f172a",
            "text-halo-width": 2.2,
          },
        },
        beforePin
      );
    }
  };

  // Synchronize WebGL sources and layers for rock-solid pin rendering
  const syncPtpSourceData = (map: MapLibreMap) => {
    if (!map.isStyleLoaded()) return;
    ensurePinImages(map);

    const geojson = projectsToGeoJson(filteredProjects, selectedProjectId, getProjectCoords);
    const existingSource = map.getSource(PTP_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

    if (existingSource) {
      existingSource.setData(geojson);
    } else {
      map.addSource(PTP_SOURCE_ID, {
        type: "geojson",
        data: geojson,
      });
    }

    if (!map.getLayer(PTP_GLOW_LAYER_ID)) {
      map.addLayer({
        id: PTP_GLOW_LAYER_ID,
        type: "circle",
        source: PTP_SOURCE_ID,
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "isSelected"], 1],
            14,
            8,
          ],
          "circle-color": ["get", "color"],
          "circle-opacity": [
            "case",
            ["==", ["get", "isSelected"], 1],
            0.65,
            0.38,
          ],
          "circle-blur": 0.85,
        },
      });
    }

    if (!map.getLayer(PTP_PINS_LAYER_ID)) {
      map.addLayer({
        id: PTP_PINS_LAYER_ID,
        type: "symbol",
        source: PTP_SOURCE_ID,
        layout: {
          "icon-image": ["get", "icon"],
          "icon-anchor": "bottom",
          "icon-offset": [0, 5],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": 1,
        },
      });
    }

    // Always elevate pins and their ground glow to the top of the stack
    if (map.getLayer(PTP_GLOW_LAYER_ID)) {
      map.moveLayer(PTP_GLOW_LAYER_ID);
    }
    if (map.getLayer(PTP_PINS_LAYER_ID)) {
      map.moveLayer(PTP_PINS_LAYER_ID);
    }
  };

  // ── 4. INITIALIZE STADIA MAPS INSTANCE WITH STRICT LUISIANA BOUNDS ──
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    // Initialize MapLibre with Stadia Maps API locked securely to Luisiana municipality
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: stadiaStyleUrl(activeStadiaStyle),
      center: [targetCoords.lon, targetCoords.lat],
      zoom: 14.2,
      minZoom: 12.8,
      maxZoom: 18.5,
      maxBounds: [
        [121.32, 14.04], // Southwest buffer around Luisiana
        [121.70, 14.33], // Northeast buffer around Luisiana
      ],
      pitch: 0,
      dragRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      attributionControl: { compact: true },
    });

    map.scrollZoom.enable();

    const hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: [0, -48],
      className: "ptp-stadia-hover-popup",
    });
    hoverPopupRef.current = hoverPopup;

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");

    const initAllLayers = () => {
      void syncBoundaryLayers(map);
      void syncBarangayLayers(map);
      syncPtpSourceData(map);
    };

    map.on("load", () => {
      initAllLayers();
    });

    map.on("style.load", () => {
      initAllLayers();
    });

    // Pin click event
    map.on("click", PTP_PINS_LAYER_ID, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const pid = feature.properties?.id;
      const p = filteredProjects.find((x) => x.id === pid);
      if (p) {
        handleSelectProject(p);
      }
    });

    // Pin hover events
    map.on("mouseenter", PTP_PINS_LAYER_ID, (e) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = e.features?.[0];
      if (!feature) return;
      const geom = feature.geometry as GeoJSON.Point;
      const name = feature.properties?.name || "Proyekto ng Luisiana";
      const brgy = feature.properties?.barangay
        ? `Brgy. ${feature.properties.barangay}`
        : "Luisiana, Laguna";

      hoverPopup
        .setLngLat(geom.coordinates as [number, number])
        .setHTML(
          `<div class="ptp-pin-label is-hover-label" style="opacity: 1; transform: translateX(-50%) translateY(0); display: flex;">` +
            `<span class="ptp-pin-label-title">${name}</span>` +
            `<span class="ptp-pin-label-sub">${brgy}</span>` +
          `</div>`
        )
        .addTo(map);
    });

    map.on("mouseleave", PTP_PINS_LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
      hoverPopup.remove();
    });

    mapRef.current = map;

    return () => {
      hoverPopup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Stadia map style when user switches styles
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(stadiaStyleUrl(activeStadiaStyle));
  }, [activeStadiaStyle]);

  // Sync projects and selection into WebGL layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncPtpSourceData(map);
  }, [filteredProjects, selectedProjectId]);

  // Dynamically update barangay focus highlights and fly to barangay when selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    void syncBarangayLayers(map);

    if (selectedBarangay !== "all") {
      const clean = selectedBarangay.trim();
      const coords = BARANGAY_COORDINATES[clean] || lookupBarangayCoords(clean);
      if (coords) {
        map.flyTo({
          center: [coords.lon, coords.lat],
          zoom: 14.8,
          essential: true,
          duration: 900,
        });
      }
    }
  }, [selectedBarangay]);

  // Ensure boundary and barangays remain mounted once geojson data finishes loading
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = setTimeout(() => {
      if (map.isStyleLoaded()) {
        void syncBoundaryLayers(map);
        void syncBarangayLayers(map);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Smoothly pan/fly map when user selects a project
  useEffect(() => {
    if (!mapRef.current || !selectedProject) return;
    const coords = getProjectCoords(selectedProject);
    if (!coords) return;

    mapRef.current.flyTo({
      center: [coords.lon, coords.lat],
      zoom: 14.5,
      essential: true,
      duration: 1000,
    });
  }, [selectedProjectId]);

  // Handle selecting a project from the directory list
  const handleSelectProject = (project: Project) => {
    setSelectedProjectId(project.id);
    setIsPopupOpen(true);
    onSelectProject?.(project);
  };

  // Re-center map to Luisiana
  const handleRecenter = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [LUISIANA_CENTER.lon, LUISIANA_CENTER.lat],
      zoom: 14,
      duration: 800,
      essential: true,
    });
  };

  // Budget calculations
  const approvedBudget =
    selectedProject?.budgetTotal ??
    selectedProject?.biddingResults?.approvedBudget ??
    0;
  const utilizedBudget = selectedProject?.budgetSpent ?? 0;
  const budgetUtilizationPercent =
    approvedBudget > 0
      ? Math.min(100, Math.round((utilizedBudget / approvedBudget) * 100))
      : 0;

  // Real geotagged photo if uploaded
  const sitePhoto = useMemo(() => {
    if (!selectedProject || !Array.isArray(selectedProject.photos)) return null;
    return (
      selectedProject.photos.find((p) => p.kind === "site") ||
      selectedProject.photos.find((p) => p.lat && p.lon) ||
      selectedProject.photos[0] ||
      null
    );
  }, [selectedProject]);

  // Check if project actually has any verified uploaded photos or progress documentation
  const hasUploadedPhotos = useMemo(() => {
    if (!selectedProject) return false;
    const p = selectedProject as any;
    if (sitePhoto?.url && String(sitePhoto.url).trim() !== "") return true;
    if (p.geotaggedPhotoUrl && String(p.geotaggedPhotoUrl).trim() !== "") return true;
    if (p.latestInspection?.photoUrl && String(p.latestInspection.photoUrl).trim() !== "") return true;
    if (Array.isArray(p.photos) && p.photos.some((ph: any) => Boolean(ph?.url && String(ph.url).trim() !== ""))) return true;
    if (Array.isArray(p.inspectionPhotos) && p.inspectionPhotos.some((ph: any) => Boolean((ph?.photoUrl || ph?.url) && String(ph?.photoUrl || ph?.url).trim() !== ""))) return true;
    if (Array.isArray(p.sidePhotos) && p.sidePhotos.some((sp: any) => Boolean((sp?.url || sp?.photoUrl) && String(sp?.url || sp?.photoUrl).trim() !== ""))) return true;
    return false;
  }, [selectedProject, sitePhoto]);

  const activeStatusBadge = getNormalizedStatus(selectedProject);

  return (
    <div className="ptp-container" role="main" aria-label="Public Transparency Portal">
      {/* ── CLEAN GOVERNMENT TOPBAR ── */}
      <header className="ptp-topbar">
        <div className="ptp-topbar-left">
          {onBack && (
            <button
              type="button"
              className="ptp-back-btn"
              onClick={onBack}
              title={backLabel || (mode === "engineer" ? "Bumalik sa Dashboard" : "Return to Home")}
            >
              <ArrowLeft size={16} />
              <span>{backLabel || (mode === "engineer" ? "Bumalik sa Dashboard" : "Bumalik")}</span>
            </button>
          )}
          <div className="ptp-branding">
            <div className="ptp-lgu-seal" aria-hidden="true">
              {mode === "engineer" ? <HardHat size={20} /> : <Building2 size={20} />}
            </div>
            <div>
              <div className="ptp-brand-title">
                INFA-TRACK <span>{mode === "engineer" ? "Mapa ng Inhinyero" : "Portal ng Transparency"}</span>
              </div>
              <div className="ptp-brand-sub">
                {mode === "engineer"
                  ? "Tanggapan ng Pambayang Inhinyero • Opisyal na Stadia GIS Map"
                  : "Pamahalaang Bayan ng Luisiana, Laguna • Stadia Maps Integrated"}
              </div>
            </div>
          </div>
        </div>

        <div className="ptp-topbar-right">
          {canAddProject && onAddProject && (
            <button
              type="button"
              className="ptp-add-project-btn"
              onClick={onAddProject}
              title="Mag-encode ng Bagong Proyekto ng LGU"
            >
              <HardHat size={14} />
              <span>Mag-encode ng Proyekto</span>
            </button>
          )}

          {/* Stadia Map Style Selector Button */}
          <div className="ptp-style-btn-wrap">
            <button
              type="button"
              className="ptp-basemap-toggle-btn"
              onClick={() => setIsStylePickerOpen((prev) => !prev)}
              title="Palitan ang Estilo ng Mapa (Stadia Maps)"
            >
              <Layers size={15} />
              <span>
                {STADIA_MAP_STYLES.find((s) => s.id === activeStadiaStyle)?.name || "Basemap"}
              </span>
            </button>

            {/* Stadia Style Popover */}
            {isStylePickerOpen && (
              <div className="ptp-style-popover">
                <div className="ptp-style-popover-head">
                  <span>Pumili ng Estilo ng Mapa (Stadia Maps)</span>
                  <button
                    type="button"
                    className="ptp-style-popover-close"
                    onClick={() => setIsStylePickerOpen(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="ptp-style-grid">
                  {STADIA_MAP_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      className={`ptp-style-card ${activeStadiaStyle === style.id ? "active" : ""}`}
                      onClick={() => {
                        setActiveStadiaStyle(style.id);
                        setIsStylePickerOpen(false);
                      }}
                    >
                      <span className="ptp-style-icon">{style.icon}</span>
                      <div className="ptp-style-info">
                        <span className="ptp-style-name">{style.name}</span>
                        <span className="ptp-style-tagline">{style.tagline}</span>
                      </div>
                      {activeStadiaStyle === style.id && <span className="ptp-style-check">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="ptp-project-count-badge">
            <span className="ptp-count-dot" />
            <span>Aktibong Proyekto:</span>
            <strong>{activeProjects.length}</strong>
          </div>
          {onOpenOnlineServices && mode !== "engineer" && (
            <button
              type="button"
              className="ptp-services-btn"
              onClick={onOpenOnlineServices}
            >
              <span>Mag-apply Online</span>
              <ExternalLink size={14} />
            </button>
          )}
        </div>
      </header>

      {/* ── MAIN WORKSPACE: SIDEBAR + STADIA MAP ── */}
      <div className="ptp-workspace">
        {/* ── 1. MAIN LAYOUT: LEFT COLLAPSIBLE SIDEBAR (~350px) ── */}
        <aside
          className={`ptp-sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}
          aria-label="Project Directory Sidebar"
        >
          {/* Sidebar Header matching MPDC panel */}
          <div className="ptp-sidebar-header">
            <div className="ptp-sidebar-header-info">
              <span className="ptp-sidebar-kicker">
                {mode === "engineer" ? "Engineering Office" : "Public Transparency · LGU Luisiana"}
              </span>
              <h2 className="ptp-sidebar-title">
                <MapPin size={15} className="ptp-title-pin" />
                <span>{mode === "engineer" ? "Talaan ng Proyekto" : "Infrastructure Tracker"}</span>
              </h2>
            </div>
            <button
              type="button"
              className="ptp-collapse-btn"
              onClick={() => setIsSidebarCollapsed(true)}
              title="I-collapse ang Sidebar"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Sidebar Filter Controls */}
          <section className="ptp-filters-section" aria-label="Project filter controls">
            {/* Search Bar */}
            <div className="ptp-search-wrap">
              <Search size={15} className="ptp-search-icon" />
              <input
                type="text"
                className="ptp-search-input"
                placeholder="Maghanap ng proyekto o kontratista..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search project directory"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="ptp-search-clear"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Dropdown Filters */}
            <div className="ptp-dropdown-grid">
              <div className="ptp-field-group">
                <label htmlFor="ptp-filter-barangay" className="ptp-field-label">
                  Barangay:
                </label>
                <select
                  id="ptp-filter-barangay"
                  className="ptp-select"
                  value={selectedBarangay}
                  onChange={(e) => setSelectedBarangay(e.target.value)}
                >
                  <option value="all">Lahat ng Barangay ({BARANGAY_LIST.length})</option>
                  {BARANGAY_LIST.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ptp-field-group">
                <label htmlFor="ptp-filter-status" className="ptp-field-label">
                  Status:
                </label>
                <select
                  id="ptp-filter-status"
                  className="ptp-select"
                  value={selectedStatus}
                  onChange={(e) =>
                    setSelectedStatus(
                      e.target.value as
                        | "all"
                        | "Pre-construction"
                        | "Ongoing"
                        | "Completed"
                    )
                  }
                >
                  <option value="all">Lahat ng Status</option>
                  <option value="Pre-construction">Pre-construction</option>
                  <option value="Ongoing">Ongoing</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="ptp-filter-summary">
              <span>
                Ipinapakita: <strong>{filteredProjects.length}</strong> sa{" "}
                {activeProjects.length}
              </span>
              {(searchQuery || selectedBarangay !== "all" || selectedStatus !== "all") && (
                <button
                  type="button"
                  className="ptp-reset-filters-btn"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedBarangay("all");
                    setSelectedStatus("all");
                  }}
                >
                  I-reset
                </button>
              )}
            </div>
          </section>

          {/* Sidebar Scrollable List Area */}
          <div className="ptp-list-container" role="region" aria-label="Project list">
            {isLoading ? (
              <div className="ptp-loading-state">
                <div className="ptp-spinner" />
                <span>Kinukuha ang talaan ng proyekto...</span>
              </div>
            ) : filteredProjects.length === 0 ? (
              /* REQUIRED EMPTY STATE CARD: "No public projects available to display." */
              <div className="ptp-empty-state-card" role="status">
                <div className="ptp-empty-icon-wrap">
                  <Building2 size={28} className="ptp-empty-icon" />
                </div>
                <h3 className="ptp-empty-title">No public projects available to display.</h3>
                <p className="ptp-empty-sub">
                  {activeProjects.length === 0
                    ? "Wala pang pampublikong proyekto na naitala sa kasalukuyan."
                    : "Walang proyektong tumutugma sa iyong piniling filter."}
                </p>
                {activeProjects.length > 0 && (
                  <button
                    type="button"
                    className="ptp-empty-reset-btn"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedBarangay("all");
                      setSelectedStatus("all");
                    }}
                  >
                    I-clear ang filter
                  </button>
                )}
              </div>
            ) : (
              /* REAL DATA PROJECT CARDS */
              <ul className="ptp-project-list">
                {filteredProjects.map((project) => {
                  const isSelected = selectedProject?.id === project.id;
                  const statusLabel = getNormalizedStatus(project);
                  const budgetNum =
                    project.budgetTotal ?? project.biddingResults?.approvedBudget ?? 0;

                  return (
                    <li key={project.id}>
                      <button
                        type="button"
                        className={`ptp-project-item ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelectProject(project)}
                      >
                        <div className="ptp-proj-head">
                          <span className={`ptp-status-pill ${statusLabel.toLowerCase()}`}>
                            {statusLabel}
                          </span>
                          <span className="ptp-proj-progress">
                            {Math.round(Number(project.progress) || 0)}%
                          </span>
                        </div>

                        <div className="ptp-proj-name">{project.name || "Walang Pamagat"}</div>

                        <div className="ptp-proj-details">
                          <div className="ptp-proj-meta-item">
                            <MapPin size={13} />
                            <span>{project.barangay || "Luisiana"}</span>
                          </div>
                          {(project.contractor ||
                            project.biddingResults?.winningContractor) && (
                            <div className="ptp-proj-meta-item">
                              <HardHat size={13} />
                              <span className="truncate">
                                {project.contractor ||
                                  project.biddingResults?.winningContractor}
                              </span>
                            </div>
                          )}
                          <div className="ptp-proj-meta-item budget">
                            <Banknote size={13} />
                            <span>{formatPeso(budgetNum)}</span>
                          </div>
                        </div>

                        <div className="ptp-proj-progress-track">
                          <div
                            className={`ptp-proj-progress-bar ${statusLabel.toLowerCase()}`}
                            style={{
                              width: `${Math.min(100, Number(project.progress) || 0)}%`,
                            }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Floating Expand Trigger when Sidebar is collapsed */}
        {isSidebarCollapsed && (
          <button
            type="button"
            className="ptp-expand-trigger-btn"
            onClick={() => setIsSidebarCollapsed(false)}
            title="Buksan ang Project Directory"
            aria-label="Expand project directory"
          >
            <ChevronRight size={16} />
            <span>Talaan ng Proyekto</span>
            <span className="ptp-expand-count">{filteredProjects.length}</span>
          </button>
        )}

        {/* ── 2. MAIN LAYOUT: RIGHT FULL-SCREEN STADIA MAPS AREA ── */}
        <section className="ptp-map-area" aria-label="Stadia 2D Map Interface">
          {/* MapLibre WebGL Canvas Container with Stadia Maps API */}
          <div ref={mapContainerRef} className="ptp-maplibre-canvas" />

          {/* Recenter Quick Button */}
          <div className="ptp-map-quick-actions">
            <button
              type="button"
              className="ptp-recenter-btn"
              onClick={handleRecenter}
              title="I-recenter ang mapa sa Bayan ng Luisiana"
            >
              <RotateCcw size={14} />
              <span>Luisiana Center</span>
            </button>
          </div>

          {/* ── 3. ACTIVE MAP POP-UP / TOOLTIP CARD (Clean Government Card) ── */}
          {isPopupOpen && (
            <div
              className="ptp-popup-card ptp-popup-card--stadia"
              role="dialog"
              aria-label="Active Project Details"
            >
              {/* Pop-up Card Header with Close Button */}
              <div className="ptp-popup-header">
                <div className="ptp-popup-meta-row">
                  <span
                    className={`ptp-popup-status-badge ${activeStatusBadge.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {activeStatusBadge}
                  </span>
                  <span className="ptp-popup-type">
                    {selectedProject?.type || "Municipal Project"}
                  </span>
                </div>
                <button
                  type="button"
                  className="ptp-popup-close-btn"
                  onClick={() => setIsPopupOpen(false)}
                  title="Isara"
                  aria-label="Close details"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 1. Project Name */}
              <h2 className="ptp-popup-title">
                {selectedProject?.name || "Awaiting Data"}
              </h2>

              {/* 2. Barangay */}
              <div className="ptp-popup-row">
                <div className="ptp-popup-row-label">
                  <MapPin size={14} className="ptp-row-icon" />
                  <span>Barangay:</span>
                </div>
                <div className="ptp-popup-row-value">
                  {selectedProject?.barangay || "Awaiting Data"}
                </div>
              </div>

              {/* 3. Winning Contractor */}
              <div className="ptp-popup-row">
                <div className="ptp-popup-row-label">
                  <HardHat size={14} className="ptp-row-icon" />
                  <span>Winning Contractor:</span>
                </div>
                <div className="ptp-popup-row-value highlight">
                  {selectedProject?.contractor ||
                    selectedProject?.biddingResults?.winningContractor ||
                    "Awaiting Data"}
                </div>
              </div>

              {/* 4 & 5. Approved Budget & Utilized Budget */}
              <div className="ptp-budget-card">
                <div className="ptp-budget-grid">
                  <div className="ptp-budget-col">
                    <div className="ptp-budget-label">
                      <Banknote size={13} />
                      <span>Approved Budget</span>
                    </div>
                    <div className="ptp-budget-amount total">
                      {formatPeso(approvedBudget)}
                    </div>
                  </div>
                  <div className="ptp-budget-col">
                    <div className="ptp-budget-label">
                      <PieChart size={13} />
                      <span>Utilized Budget</span>
                    </div>
                    <div className="ptp-budget-amount spent">
                      {formatPeso(utilizedBudget)}
                    </div>
                  </div>
                </div>

                {/* Utilization Percentage Track */}
                <div className="ptp-utilization-bar-wrap">
                  <div className="ptp-utilization-labels">
                    <span>Paggamit ng Badyet:</span>
                    <strong>{budgetUtilizationPercent}%</strong>
                  </div>
                  <div className="ptp-utilization-track">
                    <div
                      className="ptp-utilization-fill"
                      style={{ width: `${budgetUtilizationPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 7. Image Box for Geotagged Site Photo */}
              <div
                className={`ptp-photo-container ${hasUploadedPhotos ? "is-clickable" : ""}`}
                onClick={() => {
                  if (hasUploadedPhotos && selectedProject) {
                    setViewingSiteProgress(selectedProject);
                  }
                }}
                title={
                  hasUploadedPhotos
                    ? "I-click upang tingnan ang buong site photo at progress timeline"
                    : "Wala pang naka-upload na litrato"
                }
              >
                <div className="ptp-photo-header">
                  <div className="ptp-photo-title">
                    <Camera size={14} />
                    <span>Geotagged Site Photo</span>
                  </div>
                  <span className="ptp-photo-status">
                    {sitePhoto ? "Verified Photo" : "Awaiting Data"}
                  </span>
                </div>

                {sitePhoto ? (
                  <div className="ptp-photo-image-wrap">
                    <img
                      src={sitePhoto.url}
                      alt={sitePhoto.caption || "Geotagged site baseline photo"}
                      className="ptp-site-img"
                    />
                    <div className="ptp-photo-overlay-tag">
                      <MapPin size={11} />
                      <span>
                        {sitePhoto.lat && sitePhoto.lon
                          ? `${sitePhoto.lat.toFixed(5)}° N, ${sitePhoto.lon.toFixed(5)}° E`
                          : selectedProject?.barangay || "Luisiana Geotag"}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* REQUIRED IMAGE PLACEHOLDER BOX (Clean Government Style) */
                  <div className="ptp-photo-placeholder-box">
                    <div className="ptp-photo-placeholder-content">
                      <Camera size={26} className="ptp-ph-camera-icon" />
                      <div className="ptp-ph-text">Geotagged Site Photo</div>
                      <div className="ptp-ph-subtext">Awaiting Data</div>
                    </div>
                  </div>
                )}
              </div>

              {/* 8. Action Buttons for Site & Progress - ONLY show View Progress if photos were uploaded! */}
              {selectedProject && (hasUploadedPhotos || (canInspect && onInspectProject)) && (
                <div className="ptp-card-actions">
                  {hasUploadedPhotos && (
                    <button
                      type="button"
                      className="ptp-view-progress-btn"
                      onClick={() => setViewingSiteProgress(selectedProject)}
                      title="Tingnan ang Aktwal na Site Photos, Street View, at Inspection Progress"
                    >
                      <Eye size={15} />
                      <span>Tingnan ang Site at Progress</span>
                    </button>
                  )}

                  {canInspect && onInspectProject && (
                    <button
                      type="button"
                      className="ptp-engineer-inspect-btn"
                      onClick={() => onInspectProject(selectedProject)}
                      title="Magsagawa ng Inspeksyon at I-update ang Progress ng Proyekto"
                    >
                      <HardHat size={15} />
                      <span>Magsagawa ng Inspeksyon / I-update</span>
                    </button>
                  )}
                </div>
              )}

              {/* Pop-up Footer */}
              <div className="ptp-popup-footer">
                <div className="ptp-footer-tag">
                  <ShieldCheck size={13} className="ptp-verified-icon" />
                  <span>LGU INFA-TRACK Verified Record</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* 360° Site Progress & Inspection Timeline Modal */}
      {viewingSiteProgress && (
        <SiteProgressPopup
          project={viewingSiteProgress}
          onClose={() => setViewingSiteProgress(null)}
          onUpdateProgress={
            canInspect && onInspectProject
              ? () => {
                  onInspectProject(viewingSiteProgress);
                  setViewingSiteProgress(null);
                }
              : undefined
          }
          canInspect={canInspect}
        />
      )}
    </div>
  );
};

export default PublicTransparencyPortal;
