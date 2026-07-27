import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DeckGLOverlay } from "./DeckOverlay";
import { BuildingOverlay } from "./BuildingOverlay";
import InventoryPage from "./InventoryPage";
import PlanningPage from "./PlanningPage";
import { addProjectToFirestore } from "../services/firestore-projects";
import type { AlertItem, HeatPoint, Project, RiskZones, WeatherSnapshot, ProjectStatus } from "../types";
import { MODEL_CATALOG, type ModelType, PROJECT_STATUS_COLORS } from "../types";
import { connectRealtime } from "../lib/realtime";
import { BACKEND_URL, backendUrl } from "../lib/api";
import { buildHeatmapPoints, type BBox, type HeatmapMetric } from "../lib/heatmap";
import { formatGibsDate, gibsWmtsTileUrl, type GibsLayerId } from "../lib/gibs";
import { getCurrentSolarHour } from "../lib/solar";
import { 
  getTerrainSource, 
  getSatelliteSource, 
  createHillshadeLayer, 
  applyWebGLOptimizations,
  calculateTerrainExaggeration,
  type TerrainSource,
  type SatelliteSource 
} from "../lib/terrain";
import { 
  fetchEONETEvents, 
  filterEventsByRegion, 
  getEventStats, 
  getLatestGeometry,
  calculateDistance,
  EONET_CATEGORIES,
  type EONETEvent 
} from "../lib/eonet";
import { 
  TerrainRiskModel, 
  generateSyntheticTrainingData,
  getRiskColor,
  getRiskDescription,
  type RiskPrediction 
} from "../lib/ml-risk";
import {
  ensureEditStreetLayers,
  setEditStreetVisible,
  startEditStreetPulse,
  stopEditStreetPulse,
  teardownEditStreetOverlay,
} from "../lib/street-edit-overlay";
import { snapLngLatToRoad } from "../lib/snap-to-road";
import { LandingPage, LoginScreen, ROLE_CONFIGS, type UserRole } from "./Landing";
import { ProjectMonitoringPanel } from "./ProjectMonitoringPanel";
import { ThemeToggle } from "./ThemeToggle";
import {
  seedAccounts,
  getSessionFromCookie,
  clearSessionCookie,
  sessionForRole,
  type SessionUser,
} from "../services/auth";

// ── Dashboard icons ────────────────────────────────────────────────────────────
const IconClipboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
  </svg>
);
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconClock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IconWarn = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

// ── Model catalog SVG icons ──────────────────────────────────────────────
const ModelIcons: Record<string, React.FC<{ size?: number; color?: string }>> = {
  office: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18"/><path d="M9 21V9"/><path d="M7 6h.01"/><path d="M12 6h.01"/><path d="M17 6h.01"/>
    </svg>
  ),
  school: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
    </svg>
  ),
  hospital: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="1"/><path d="M12 8v8"/><path d="M8 12h8"/>
    </svg>
  ),
  barangay_hall: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M9 10h.01"/><path d="M15 10h.01"/>
    </svg>
  ),
  evacuation_center: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  road: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21L9 3"/><path d="M19 21L15 3"/><path d="M9 12h6"/><path d="M10 7h4"/><path d="M10 17h4"/>
    </svg>
  ),
  bridge: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 18h20"/><path d="M2 18c0-4 4-7 10-7s10 3 10 7"/><path d="M6 18v-3"/><path d="M18 18v-3"/>
    </svg>
  ),
  water_tank: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="7" rx="9" ry="4"/><path d="M3 7v10c0 2.2 4 4 9 4s9-1.8 9-4V7"/><path d="M3 12c0 2.2 4 4 9 4s9-1.8 9-4"/>
    </svg>
  ),
  solar_farm: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>
    </svg>
  ),
  barn: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18"/><path d="M3 10l9-7 9 7"/><path d="M5 21V10"/><path d="M19 21V10"/><rect x="9" y="14" width="6" height="7"/>
    </svg>
  ),
  construction: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20"/><path d="M6 20V10l6-6 6 6v10"/><path d="M12 20v-6"/><path d="M9 14h6"/><path d="M3 10h18"/>
    </svg>
  ),
};


const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// OpenFreeMap Liberty — free vector tiles with OSM building footprints + heights.
// No API key needed. Buildings have render_height / render_min_height properties.
const VECTOR_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

type LayerToggles = {
  satellite: boolean;
  streetMap: boolean;
  terrain: boolean;
  heatmap: boolean;
  weather: boolean;
  gibsPrecip: boolean;
  risk: boolean;
  projects: boolean;
  stormTrack: boolean;
};

const DEFAULT_TOGGLES: LayerToggles = {
  satellite: false,
  streetMap: false,
  terrain: false,
  heatmap: false,
  weather: false,
  gibsPrecip: false,
  risk: false,
  projects: true,
  stormTrack: false,
};

const BUILDING_EXTRUSION_OPACITY_DEFAULT = 0.9;

/**
 * The REAL 3D blocks on this app:
 *   layer id:     "3d-buildings"
 *   type:         fill-extrusion
 *   source:       "openmaptiles"  (OpenFreeMap Liberty vector tiles)
 *   source-layer: "building"
 *
 * Do NOT confuse with:
 *   - "project-labels" (circle highlight markers)
 *   - "glb-buildings"  (Three.js custom layer for project GLBs)
 */
const BUILDING_EXTRUSION_LAYER = "3d-buildings";
const BUILDING_VECTOR_SOURCE = "openmaptiles";
const BUILDING_SOURCE_LAYER = "building";

/** Set opacity/visibility on our extrusion and base-style building extrusions. */
function applyBuildingExtrusionOpacity(map: MapLibreMap, opacity: number) {
  const value = Math.max(0, Math.min(1, opacity));
  const hidden = value <= 0.001;
  const knownBuildingLayerIds = new Set([
    BUILDING_EXTRUSION_LAYER,
    "building",
    "building-top",
    "buildings",
    "building-3d",
    "3d-building",
    "3d-buildings",
  ]);

  // Update our extrusion and any building extrusion supplied by the base style.
  // This remains resilient if a style reload restores its original building layer.
  for (const layer of map.getStyle()?.layers ?? []) {
    const sourceLayer = (layer as any)["source-layer"];
    const isBuildingExtrusion =
      layer.type === "fill-extrusion" &&
      (knownBuildingLayerIds.has(layer.id) ||
        sourceLayer === BUILDING_SOURCE_LAYER ||
        /(^|[-_])buildings?($|[-_])/i.test(layer.id));

    if (!isBuildingExtrusion) continue;

    try {
      map.setLayoutProperty(layer.id, "visibility", hidden ? "none" : "visible");
      map.setPaintProperty(layer.id, "fill-extrusion-opacity", hidden ? 0 : value);
    } catch (err) {
      console.warn(`[Map] failed to update ${layer.id} opacity:`, err);
    }
  }

  map.triggerRepaint();
}

const CENTER = { lat: 14.19, lon: 121.51, zoom: 11.4 };

function levelColor(level: "LOW" | "MODERATE" | "HIGH") {
  if (level === "HIGH") return "rgba(255, 77, 79, 0.55)";
  if (level === "MODERATE") return "rgba(61, 155, 95, 0.45)";
  return "rgba(61, 155, 95, 0.30)";
}

function formatAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}

export default function App() {
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  // Separate state so React re-renders overlays when the map instance is ready
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);

  const [currentSession, setCurrentSession] = useState<SessionUser | null>(null);
  const currentRole = currentSession?.role ?? null;
  const [screen, setScreen] = useState<"landing" | "login" | "app" | "inventory" | "planning">("landing");
  const roleConfig = currentRole ? ROLE_CONFIGS[currentRole] : null;

  const [cookieConsent, setCookieConsent] = useState<"pending" | "accepted" | "declined">(() => {
    const stored = localStorage.getItem("infatrack_cookie_consent");
    return stored === "accepted" ? "accepted" : stored === "declined" ? "declined" : "pending";
  });

  useEffect(() => {
    seedAccounts().catch((err) => console.warn("[Auth] Seed accounts failed:", err));

    if (cookieConsent === "accepted") {
      const saved = getSessionFromCookie();
      if (saved) {
        setCurrentSession(saved);
        setScreen("app");
      }
    }
  }, []);

  function handleCookieAccept() {
    localStorage.setItem("infatrack_cookie_consent", "accepted");
    setCookieConsent("accepted");
  }

  function handleCookieDecline() {
    localStorage.setItem("infatrack_cookie_consent", "declined");
    setCookieConsent("declined");
  }

  const [connected, setConnected] = useState(false);
  const [toggles, setToggles] = useState<LayerToggles>(DEFAULT_TOGGLES);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>([]);
  const [riskZones, setRiskZones] = useState<RiskZones | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [placementMode, setPlacementMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [snapToRoad, setSnapToRoad] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelType>("office");
  const [placementRotation, setPlacementRotation] = useState(0);
  const [placingName, setPlacingName] = useState("");
  const [customModelFile, setCustomModelFile] = useState<File | null>(null);
  const [customModelPreview, setCustomModelPreview] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"layers" | "risk" | "projects" | "climate" | "events" | "ai-risk">("climate");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches
  );
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  // Set default tab based on role permissions
  useEffect(() => {
    if (roleConfig) {
      if (roleConfig.canSeeWeather || roleConfig.canSeeLayers) setSidebarTab("climate");
      else if (roleConfig.canSeeRisk) setSidebarTab("risk");
      else if (roleConfig.canSeeProjects) setSidebarTab("projects");
    }
  }, [currentRole]);

  // Collapse side panel by default on tablet/phone; full map first
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarCollapsed(true);
    };
    if (mq.matches) setSidebarCollapsed(true);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // MapLibre needs a resize after the panel width animates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timers = [50, 280, 420].map((ms) =>
      window.setTimeout(() => {
        try { map.resize(); } catch { /* map may be gone */ }
      }, ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [sidebarCollapsed]);
  const [heatMetric, setHeatMetric] = useState<HeatmapMetric>("combined");
  const [viewport, setViewport] = useState<{ bbox: BBox; zoom: number } | null>(null);
  const [gibsLayer, setGibsLayer] = useState<GibsLayerId>("IMERG_Precipitation_Rate");
  const [gibsDate, setGibsDate] = useState(() => {
    // GIBS layers often lag “today” availability. Default to yesterday (UTC) to avoid 404 tiles.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return formatGibsDate(d);
  });
  const [gibsOpacity, setGibsOpacity] = useState(0.62);
  const [buildingExtrusionOpacity, setBuildingExtrusionOpacity] = useState(BUILDING_EXTRUSION_OPACITY_DEFAULT);
  const [glbModelsOpacity, setGlbModelsOpacity] = useState(1);
  const [gibsStatus, setGibsStatus] = useState<"loading" | "ok" | "unavailable">("loading");

  // NASA EONET Natural Events
  const [eonetEvents, setEonetEvents] = useState<EONETEvent[]>([]);
  const [eonetEnabled, setEonetEnabled] = useState(false);
  const [eonetLoading, setEonetLoading] = useState(false);
  const [eonetCategories, setEonetCategories] = useState<string[]>(["wildfires", "severeStorms", "volcanoes", "earthquakes", "floods"]);
  const [eonetRadius, setEonetRadius] = useState(1000); // km radius from Luisiana

  // AI Risk Analysis
  const [aiRiskEnabled, setAiRiskEnabled] = useState(false);
  const [aiRiskLoading, setAiRiskLoading] = useState(false);
  const [aiRiskTrained, setAiRiskTrained] = useState(false);
  const [aiRiskPredictions, setAiRiskPredictions] = useState<any[]>([]);
  const [aiRiskModel, setAiRiskModel] = useState<any>(null);
  const [aiRiskAutoTraining, setAiRiskAutoTraining] = useState(false);

  // Google Street View mode — when active, clicking the map opens GSV in a new tab
  const [streetViewMode, setStreetViewMode] = useState(false);

  // Auto-train AI model on app load
  useEffect(() => {
    if (screen !== 'app' || aiRiskAutoTraining || aiRiskTrained) return;

    const autoTrainModel = async () => {
      setAiRiskAutoTraining(true);
      setAiRiskLoading(true);
      
      try {
        console.log('🤖 Auto-training AI Risk Model...');
        
        // Try to load existing model first
        const { TerrainRiskModel } = await import('../lib/ml-risk');
        const model = new TerrainRiskModel();
        
        try {
          await model.loadModel('luisiana-risk-model');
          console.log('✅ Loaded existing trained model');
          setAiRiskModel(model);
          setAiRiskTrained(true);
        } catch (loadError) {
          // No existing model, train new one
          console.log('📚 Training new model with 2000 samples...');
          const { generateSyntheticTrainingData } = await import('../lib/ml-risk');
          const trainingData = generateSyntheticTrainingData(2000);
          
          await model.train(trainingData, 50); // 50 epochs for better accuracy
          await model.saveModel('luisiana-risk-model');
          
          console.log('✅ Model trained and saved successfully!');
          setAiRiskModel(model);
          setAiRiskTrained(true);
        }
      } catch (error) {
        console.error('❌ Auto-training failed:', error);
      } finally {
        setAiRiskLoading(false);
        setAiRiskAutoTraining(false);
      }
    };

    // Start auto-training after 2 seconds (let app load first)
    const timer = setTimeout(autoTrainModel, 2000);
    return () => clearTimeout(timer);
  }, [screen, aiRiskAutoTraining, aiRiskTrained]);

  // Map bearing for compass display
  const [mapBearing, setMapBearing] = useState(-15);

  // Keyboard shortcuts: +/- zoom, N = reset north, H = fly home
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = mapRef.current;
      if (!m) return;
      // Don't fire when typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.key === "=" || e.key === "+") m.zoomIn({ duration: 300 });
      if (e.key === "-" || e.key === "_") m.zoomOut({ duration: 300 });
      if (e.key === "n" || e.key === "N") m.easeTo({ bearing: 0, pitch: 62, duration: 500 });
      if (e.key === "h" || e.key === "H") m.flyTo({ center: [CENTER.lon, CENTER.lat], zoom: CENTER.zoom, pitch: toggles.terrain ? 62 : 30, bearing: -15, duration: 1200, essential: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggles.terrain]);

  // Fetch NASA EONET natural events
  useEffect(() => {
    if (!eonetEnabled) return;

    const fetchEvents = async () => {
      setEonetLoading(true);
      try {
        const response = await fetchEONETEvents({
          status: "open",
          limit: 500,
          days: 30,
        });

        // Filter events by region (within radius of Luisiana)
        const filtered = filterEventsByRegion(response.events, [121.5167, 14.1856], eonetRadius);
        
        // Further filter by selected categories
        const categoryFiltered = filtered.filter(event =>
          event.categories.some(cat => eonetCategories.includes(cat.id))
        );

        setEonetEvents(categoryFiltered);
      } catch (error) {
        console.error("Failed to fetch EONET events:", error);
        setEonetEvents([]);
      } finally {
        setEonetLoading(false);
      }
    };

    fetchEvents();
    
    // Refresh every 30 minutes
    const interval = setInterval(fetchEvents, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [eonetEnabled, eonetCategories, eonetRadius]);

  // Generate AI Risk Predictions
  useEffect(() => {
    if (!aiRiskEnabled || !aiRiskModel) return;

    const generatePredictions = async () => {
      setAiRiskLoading(true);
      try {
        const { generateRiskGrid, updateGridWithWeather } = await import('../lib/risk-grid');
        
        // Generate smaller grid (20x20 = 441 points) - lighter and faster
        let grid = generateRiskGrid(20);
        
        // Update with current weather if available
        if (weather) {
          grid = updateGridWithWeather(grid, {
            rainfallMm: weather.rainfallMm,
            humidityPct: weather.humidityPct || 70,
          });
        }
        
        // Generate predictions for all grid points
        const predictions = await aiRiskModel.predictBatch(grid.map((p: any) => p.features));
        
        // Combine with positions
        const predictionData = grid.map((point: any, i: number) => ({
          position: point.position,
          prediction: predictions[i],
        }));
        
        setAiRiskPredictions(predictionData);
        console.log(`✅ Generated ${predictionData.length} risk predictions`);
      } catch (error) {
        console.error("Failed to generate predictions:", error);
        setAiRiskPredictions([]);
      } finally {
        setAiRiskLoading(false);
      }
    };

    generatePredictions();
  }, [aiRiskEnabled, aiRiskModel, weather]);

  const topRisk = useMemo(() => {
    const feats = riskZones?.features || [];
    const high = feats.filter((f) => f.properties.level === "HIGH");
    if (high.length) return { level: "HIGH" as const, count: high.length };
    const mod = feats.filter((f) => f.properties.level === "MODERATE");
    if (mod.length) return { level: "MODERATE" as const, count: mod.length };
    return { level: "LOW" as const, count: feats.length ? feats.length : 0 };
  }, [riskZones]);

  // Clear map when leaving the app screen
  useEffect(() => {
    if (screen !== "app" && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, [screen]);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    if (screen !== "app") return; // Only initialize when on app screen

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: VECTOR_STYLE_URL,
      center: [CENTER.lon, CENTER.lat],
      zoom: CENTER.zoom,
      pitch: 30,
      bearing: -15,
      attributionControl: false,
      canvasContextAttributes: { antialias: true }, // required for three.js custom layers
    });

    mapRef.current = map;
    setMapInstance(map);

    const pushViewport = () => {
      const b = map.getBounds();
      setViewport({
        bbox: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
        zoom: map.getZoom(),
      });
      setMapBearing(map.getBearing());
    };

    map.on("load", () => {
      pushViewport();

      // ── Context OSM buildings (muted) + project 3D blocks ─────────────────
      // Project blocks = status-colored fill-extrusion (height from progress).
      // GLB models are rendered separately by BuildingOverlay.

      // Remove Liberty's flat building fills; we use our own 3D extrusions.
      if (map.getLayer("building")) map.removeLayer("building");
      if (map.getLayer("building-top")) map.removeLayer("building-top");

      // Context OSM buildings — always visible; opacity slider does NOT touch these.
      // Z-fight with GLBs is handled by clearDepth in BuildingOverlay + hole filter.
      map.addLayer({
        id: BUILDING_EXTRUSION_LAYER,
        type: "fill-extrusion",
        source: BUILDING_VECTOR_SOURCE,
        "source-layer": BUILDING_SOURCE_LAYER,
        minzoom: 12,
        paint: {
          "fill-extrusion-color": "#a8b0b8",
          "fill-extrusion-height": [
            "interpolate", ["linear"], ["zoom"],
            12, 0,
            13, ["coalesce", ["get", "render_height"], 6],
          ],
          "fill-extrusion-base": [
            "coalesce", ["get", "render_min_height"], 0,
          ],
          "fill-extrusion-opacity": BUILDING_EXTRUSION_OPACITY_DEFAULT,
          "fill-extrusion-vertical-gradient": false,
        },
      } as any);

      // Project location dots — GLB models rendered by BuildingOverlay
      map.addSource("project-footprints", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "project-labels",
        type: "circle",
        source: "project-footprints",
        paint: {
          "circle-radius": 5,
          "circle-color": [
            "match", ["get", "status"],
            "Completed", PROJECT_STATUS_COLORS.Completed,
            "Ongoing",   PROJECT_STATUS_COLORS.Ongoing,
            "Delayed",   PROJECT_STATUS_COLORS.Delayed,
            "Suspended", PROJECT_STATUS_COLORS.Suspended,
            "Planned",   PROJECT_STATUS_COLORS.Planned,
            "Planning",  PROJECT_STATUS_COLORS.Planned,
            PROJECT_STATUS_COLORS.Planned,
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.85,
        },
      });

      // ── OSM Street Map raster source ──
      // Guard every addSource: the terrain/satellite/street toggle effects run on
      // "style.load" (fires before "load") and may have created these already.
      // An unguarded duplicate addSource throws and kills the rest of this handler.
      if (!map.getSource("osm-street")) {
        map.addSource("osm-street", {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          maxzoom: 19,
          attribution: "© OpenStreetMap contributors",
        } as any);
      }

      // ── Satellite imagery source (Enhanced WebGL with multiple providers) ──
      if (!map.getSource("satellite")) {
        const satelliteSource = getSatelliteSource("esri");
        map.addSource("satellite", {
          type: "raster",
          tiles: Array.from(satelliteSource.tiles) as string[],
          tileSize: satelliteSource.tileSize,
          maxzoom: satelliteSource.maxzoom,
          attribution: satelliteSource.attribution,
        });
      }

      // ── Terrain DEM (WebGL-optimized with Terrarium encoding) ──
      if (!map.getSource("terrain-dem")) {
        const terrainSource = getTerrainSource("terrarium");
        map.addSource("terrain-dem", {
          type: "raster-dem",
          tiles: terrainSource.tiles,
          tileSize: terrainSource.tileSize,
          encoding: terrainSource.encoding as any,
          maxzoom: terrainSource.maxzoom,
        } as any);
      }

      // ── Apply WebGL optimizations for better performance ──
      applyWebGLOptimizations(map, "balanced");

      // ── Sky: MapLibre OSS does not support type "sky" (Mapbox-only) — skip ──

      // ── Add Hillshade layer for terrain depth ──
      try {
        const hillshadeLayer = createHillshadeLayer(0.35);
        if (map.getLayer(BUILDING_EXTRUSION_LAYER)) {
          map.addLayer(hillshadeLayer as any, BUILDING_EXTRUSION_LAYER);
        } else {
          map.addLayer(hillshadeLayer as any);
        }
      } catch (e) {
        console.warn("Hillshade layer not supported:", e);
      }

      // ── GIBS precipitation (added before satellite so satellite sits on top) ──
      if (!map.getSource("gibs-imerg")) {
        map.addSource("gibs-imerg", {
          type: "raster",
          tiles: [gibsWmtsTileUrl({ layer: gibsLayer, date: gibsDate })],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 6,
        } as any);
      }
      if (!map.getLayer("gibs-imerg-layer")) {
        map.addLayer({
          id: "gibs-imerg-layer",
          type: "raster",
          source: "gibs-imerg",
          paint: {
            "raster-opacity": DEFAULT_TOGGLES.gibsPrecip ? gibsOpacity : 0,
            "raster-resampling": "linear",
          },
        } as any);
      }

      // OSM Street / Satellite — insert before 3d-buildings when that layer exists
      const beforeBuildings = map.getLayer(BUILDING_EXTRUSION_LAYER)
        ? BUILDING_EXTRUSION_LAYER
        : undefined;

      if (!map.getLayer("osm-street-layer")) {
        map.addLayer(
          {
            id: "osm-street-layer",
            type: "raster",
            source: "osm-street",
            paint: { "raster-opacity": 0 },
          } as any,
          beforeBuildings
        );
      }

      if (!map.getLayer("satellite-layer")) {
        map.addLayer(
          {
            id: "satellite-layer",
            type: "raster",
            source: "satellite",
            paint: { "raster-opacity": DEFAULT_TOGGLES.satellite ? 1 : 0 },
          } as any,
          beforeBuildings
        );
      }

      // Risk zones
      map.addSource("riskZones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "risk-fill",
        type: "fill",
        source: "riskZones",
        layout: {
          visibility: "none",
        },
        paint: {
          "fill-color": [
            "match", ["get", "level"],
            "HIGH",     "rgba(255,77,79,0.35)",
            "MODERATE", "rgba(255,214,102,0.28)",
            "LOW",      "rgba(61,155,95,0.15)",
            "rgba(255,255,255,0.0)",
          ],
          "fill-outline-color": "rgba(255,255,255,0.12)",
        },
      });

      // Storm track
      map.addSource("stormTrack", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "storm-line",
        type: "line",
        source: "stormTrack",
        paint: {
          "line-color": "rgba(120, 200, 255, 0.85)",
          "line-width": 2.5,
          "line-opacity": 0.9,
        },
      });

      // Legacy projects source (kept for compat)
      map.addSource("projects", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // ── Municipal Office label ─────────────────────────────────────────────
      // Marks the Luisiana Municipal Hall with a pin dot + label (no highlight).
      const MUNICIPAL_OFFICE = { lat: 14.185435, lon: 121.509513 };
      map.addSource("municipal-office", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [MUNICIPAL_OFFICE.lon, MUNICIPAL_OFFICE.lat] },
              properties: {},
            },
          ],
        },
      });
      map.addLayer({
        id: "municipal-office-dot",
        type: "circle",
        source: "municipal-office",
        minzoom: 10,
        paint: {
          "circle-radius": 5,
          "circle-color": "#245C3A",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      } as any);
      map.addLayer({
        id: "municipal-office-label",
        type: "symbol",
        source: "municipal-office",
        minzoom: 10,
        layout: {
          "text-field": "Municipal Office",
          "text-font": ["Noto Sans Regular"],
          "text-size": 13,
          "text-anchor": "bottom",
          "text-offset": [0, -0.7],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#245C3A",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.8,
        },
      } as any);

      // Hide Liberty POI labels like "Luisiana Municipal Hall".
      // Cream OSM building holes under projects are handled in a separate effect.
      {
        const hideMunicipalPoiLabels = () => {
          const nameHide: any = [
            "!",
            [
              "in",
              ["downcase", ["to-string", ["coalesce", ["get", "name"], ["get", "name_en"], ""]]],
              [
                "literal",
                [
                  "luisiana municipal hall",
                  "municipal hall",
                  "municipal office",
                  "luisiana municipal office",
                  "luisiana mdrrimo command center",
                  "luisiana mdrrmo command center",
                  "mdrrimo command center",
                  "mdrrmo command center",
                ],
              ],
            ],
          ];
          for (const layer of map.getStyle()?.layers ?? []) {
            if (layer.type !== "symbol") continue;
            const id = layer.id;
            if (!/poi|place|label/i.test(id)) continue;
            try {
              // Replace filter (don't nest on every call)
              const prev = map.getFilter(id);
              const base = Array.isArray(prev) && prev[0] === "all"
                ? prev.filter((clause: any) => !(Array.isArray(clause) && clause[0] === "!" && JSON.stringify(clause).includes("municipal")))
                : prev;
              map.setFilter(id, base ? (["all", base, nameHide] as any) : nameHide);
            } catch { /* ignore */ }
          }
        };

        hideMunicipalPoiLabels();
        map.on("style.load", hideMunicipalPoiLabels);
      }

      // ── Double-click to smooth zoom in ───────────────────────────────────
      map.on("dblclick", (e) => {
        e.preventDefault();
        map.flyTo({
          center: e.lngLat,
          zoom: Math.min(map.getZoom() + 1.5, 19),
          duration: 600,
          essential: true,
        });
      });
    });

    map.on("moveend", pushViewport);

    // Suppress "Image X could not be loaded" warnings for icons referenced by
    // the base style's sprite that aren't bundled (e.g. POI icons like "office",
    // "gate", "swimming_pool"). Provide a 1×1 transparent fallback so MapLibre
    // stops retrying and logging.
    map.on("styleimagemissing", (e: { id: string }) => {
      if (!map.hasImage(e.id)) {
        map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      }
    });

    return () => {
      map.off("moveend", pushViewport);
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
  }, [screen]); // Re-initialize when screen changes to "app"

  // ── Placement mode: click on map to place a model ──────────────────────────
  const placementModeRef = useRef(false);
  const snapToRoadRef = useRef(true);
  const selectedModelRef = useRef<ModelType>("office");
  const placementRotationRef = useRef(0);
  const placingNameRef = useRef("");
  const customModelFileRef = useRef<File | null>(null);
  // Set to true by BuildingOverlay when a building is clicked — prevents placement
  const buildingHitRef = useRef(false);
  
  // Modal state for entering building details before placement
  const [showPlacementModal, setShowPlacementModal] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState<{ lng: number; lat: number } | null>(null);
  const [modalProjectName, setModalProjectName] = useState("");
  const [modalProjectType, setModalProjectType] = useState<"Municipal Project" | "Private Building" | "Agricultural Structure">("Municipal Project");
  const [modalDepartment, setModalDepartment] = useState<"MPDC" | "Engineering" | "Agriculture" | "Negosyo Center">("Engineering");
  const [modalStatus, setModalStatus] = useState<ProjectStatus>("Planned");
  const [modalProgress, setModalProgress] = useState(0);
  const [modalDescription, setModalDescription] = useState("");
  const [modalStartDate, setModalStartDate] = useState("");
  const [modalTargetEndDate, setModalTargetEndDate] = useState("");
  const [modalBudgetTotal, setModalBudgetTotal] = useState("");

  useEffect(() => { placementModeRef.current = placementMode; }, [placementMode]);
  useEffect(() => { snapToRoadRef.current = snapToRoad; }, [snapToRoad]);
  useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);
  useEffect(() => { placementRotationRef.current = placementRotation; }, [placementRotation]);
  useEffect(() => { placingNameRef.current = placingName; }, [placingName]);
  useEffect(() => { customModelFileRef.current = customModelFile; }, [customModelFile]);

  // Edit Mode: neon street overlay + pulse
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;

    const apply = () => {
      ensureEditStreetLayers(map);
      if (editMode) {
        setEditStreetVisible(map, true);
        startEditStreetPulse(map);
      } else {
        stopEditStreetPulse(map);
        setEditStreetVisible(map, false);
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);

    const onStyleData = () => {
      if (!editMode) return;
      ensureEditStreetLayers(map);
      setEditStreetVisible(map, true);
      startEditStreetPulse(map);
    };
    map.on("styledata", onStyleData);

    return () => {
      map.off("styledata", onStyleData);
      stopEditStreetPulse(map);
      if (map.getStyle()) {
        try {
          setEditStreetVisible(map, false);
        } catch {
          /* style may already be gone */
        }
      }
    };
  }, [mapInstance, editMode]);

  // Tear down street overlay when map instance is disposed
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;
    return () => {
      try {
        teardownEditStreetOverlay(map);
      } catch {
        /* ignore */
      }
    };
  }, [mapInstance]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = async (e: maplibregl.MapMouseEvent) => {
      if (!placementModeRef.current) return;
      // If BuildingOverlay consumed this click (building was hit), skip placement
      if (buildingHitRef.current) { buildingHitRef.current = false; return; }

      let { lng, lat } = e.lngLat;
      if (snapToRoadRef.current) {
        const snap = snapLngLatToRoad(map, lng, lat);
        if (snap.snapped) {
          lng = snap.lng;
          lat = snap.lat;
          const deg = Math.round(snap.bearingDeg);
          placementRotationRef.current = deg;
          setPlacementRotation(deg);
        }
      }

      // Show modal to enter building details
      setPendingPlacement({ lng, lat });
      const catalog = MODEL_CATALOG.find((m) => m.type === selectedModelRef.current);
      setModalProjectName(placingNameRef.current.trim() || `${catalog?.label ?? selectedModelRef.current}`);
      setModalProjectType(
        catalog?.category === "Agriculture" ? "Agricultural Structure" :
        catalog?.category === "Infrastructure" ? "Municipal Project" :
        catalog?.category === "Construction" ? "Municipal Project" : "Private Building"
      );
      setModalDepartment("Engineering");
      setModalStatus("Planned");
      setModalProgress(0);
      setModalDescription(catalog?.description || "");
      setShowPlacementModal(true);
    };

    map.on("click", handleClick);
    return () => { map.off("click", handleClick); };
  }, [mapRef.current]);

  // Function to actually place the building after modal submission
  const handlePlaceBuilding = async () => {
    if (!pendingPlacement) return;

    const { lng, lat } = pendingPlacement;
    const now = new Date().toISOString();
    const fallbackProject: Project = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local-${Date.now()}`,
      name: modalProjectName,
      modelType: selectedModelRef.current,
      type: modalProjectType,
      department: modalDepartment,
      status: modalStatus,
      progress: modalProgress,
      description: modalDescription || "",
      startDate: modalStartDate || null,
      targetEndDate: modalTargetEndDate || null,
      budgetTotal: modalBudgetTotal ? Number(modalBudgetTotal) : null,
      location: { lat, lon: lng },
      rotation: placementRotationRef.current,
      lifecyclePhase: "Planning",
      archivedAt: null,
      milestones: [],
      issues: [],
      photos: [],
      activityLog: [{ at: now, message: "Project created from map placement." }],
      updatedAt: now,
    };

    try {
      // If custom model is selected and a file is provided, upload it first
      let customModelUrl: string | undefined;
      if (selectedModelRef.current === "custom" && customModelFileRef.current) {
        const file = customModelFileRef.current;
        const maxMb = 200;
        if (file.size > maxMb * 1024 * 1024) {
          alert(`Model is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum is ${maxMb}MB.`);
          return;
        }

        const formData = new FormData();
        formData.append("model", file);

        const uploadRes = await fetch(backendUrl("/api/upload-model"), {
          method: "POST",
          body: formData,
        });

        if (uploadRes.ok) {
          const data = await uploadRes.json();
          customModelUrl = data.url;
        } else {
          let detail = "";
          try {
            const errBody = await uploadRes.json();
            detail = errBody?.error ? `: ${errBody.error}` : "";
          } catch {
            detail = ` (HTTP ${uploadRes.status})`;
          }
          console.error("Failed to upload custom model", uploadRes.status, detail);
          alert(`Failed to upload custom model${detail}`);
          return;
        }
      }

      try {
        const res = await fetch(backendUrl("/api/projects"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: modalProjectName,
            modelType: selectedModelRef.current,
            type: modalProjectType,
            department: modalDepartment,
            status: modalStatus,
            progress: modalProgress,
            description: modalDescription,
            startDate: modalStartDate || undefined,
            targetEndDate: modalTargetEndDate || undefined,
            budgetTotal: modalBudgetTotal ? Number(modalBudgetTotal) : undefined,
            location: { lat, lon: lng },
            rotation: placementRotationRef.current,
            customModelUrl,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Backend save failed: ${res.status}${errorText ? ` - ${errorText}` : ""}`);
        }

        const { project } = await res.json();
        addProjectToFirestore(project).catch((e) => console.warn("[Firestore] sync failed:", e));
      } catch (backendErr) {
        if (selectedModelRef.current === "custom") {
          throw backendErr;
        }

        const localProject: Project = customModelUrl
          ? { ...fallbackProject, customModelUrl }
          : fallbackProject;
        await addProjectToFirestore(localProject);
        setProjects((prev) => [localProject, ...prev]);
        console.warn("[Projects] Backend unavailable, saved placement directly to Firestore:", backendErr);
      }
      
      // Close modal and reset
      setShowPlacementModal(false);
      setPendingPlacement(null);
      setModalProjectName("");
      setModalDescription("");
      
      // Backend will emit projects:update via socket
    } catch (err) {
      console.error("Failed to place project:", err);
      const message =
        err instanceof Error && /Failed to fetch|Backend save failed/i.test(err.message)
          ? "Failed to reach the backend server on port 4000. Start the backend, or keep using standard models and the app will save directly to Firestore."
          : "Failed to place building. Please try again.";
      alert(message);
    }
  };

  // ESC key to close placement modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showPlacementModal) {
        setShowPlacementModal(false);
        setPendingPlacement(null);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [showPlacementModal]);

  function upsertGibsLayer(args: { layer: GibsLayerId; date: string; opacity: number; visible: boolean }) {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return;

    const { layer, date, opacity, visible } = args;
    const tileUrl = gibsWmtsTileUrl({ layer, date });

    // MapLibre raster sources do not consistently support setTiles across versions.
    // Recreate source+layer for reliable updates (prevents “stuck requesting old date”).
    if (map.getLayer("gibs-imerg-layer")) map.removeLayer("gibs-imerg-layer");
    if (map.getSource("gibs-imerg")) map.removeSource("gibs-imerg");

    map.addSource("gibs-imerg", {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 6,
    } as any);

    // Add above base map; below vectors if present.
    map.addLayer(
      {
        id: "gibs-imerg-layer",
        type: "raster",
        source: "gibs-imerg",
        paint: {
          "raster-opacity": visible ? opacity : 0,
          "raster-resampling": "linear",
        },
      } as any,
      map.getLayer("risk-fill") ? "risk-fill" : undefined
    );
  }

  async function resolveLatestGibsDate(layer: GibsLayerId, startDateIso: string) {
    // Probe backwards until a known tile exists. Keeps UI stable and avoids 404 spam.
    // We test a low zoom tile (z=1, x=0, y=0) for availability.
    const base = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi";
    const d = new Date(`${startDateIso}T00:00:00Z`);
    for (let i = 0; i < 14; i++) {
      const date = formatGibsDate(d);
      const url =
        base +
        `?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
        `&LAYER=${encodeURIComponent(layer)}` +
        `&STYLE=default` +
        `&TILEMATRIXSET=GoogleMapsCompatible_Level6` +
        `&TILEMATRIX=1&TILEROW=0&TILECOL=0` +
        `&FORMAT=image/png` +
        `&TIME=${encodeURIComponent(date)}`;
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (res.ok) return date;
      } catch {
        // ignore and continue
      }
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return null;
  }

  // Auto-resolve to latest available GIBS date (prevents persistent 404s).
  useEffect(() => {
    let cancelled = false;
    setGibsStatus("loading");
    resolveLatestGibsDate(gibsLayer, gibsDate)
      .then((date) => {
        if (cancelled) return;
        if (!date) {
          setGibsStatus("unavailable");
          return;
        }
        setGibsStatus("ok");
        if (date !== gibsDate) setGibsDate(date);
      })
      .catch(() => {
        if (cancelled) return;
        setGibsStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
    // Only when the user changes layer/date.
  }, [gibsLayer, gibsDate]);

  // Update NASA GIBS tiles when layer/date/opacity changes.
  useEffect(() => {
    upsertGibsLayer({
      layer: gibsLayer,
      date: gibsDate,
      opacity: gibsOpacity,
      visible: toggles.gibsPrecip && gibsStatus === "ok",
    });
  }, [gibsLayer, gibsDate, gibsOpacity, toggles.gibsPrecip, gibsStatus]);

  useEffect(() => {
    const socket = connectRealtime(BACKEND_URL);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("weather:update", (w) => setWeather(w));
    socket.on("risk:update", (z) => setRiskZones(z.zones));
    socket.on("projects:update", (p) => setProjects(p.projects));
    socket.on("alerts:new", (a) => setAlerts((prev) => [a, ...prev].slice(0, 8)));

    return () => {
      socket.disconnect();
    };
  }, []);

  // Heatmap engine (Zoom Earth feel): regenerate points from live signals + viewport.
  useEffect(() => {
    if (!viewport) return;
    if (!toggles.heatmap) return;

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // keep it smooth but lightweight
      if (now - last < 650) return;
      last = now;

      setHeatPoints(
        buildHeatmapPoints({
          bbox: viewport.bbox,
          zoom: viewport.zoom,
          metric: heatMetric,
          weather,
          riskZones,
          projects,
          nowMs: Date.now(),
        })
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewport, toggles.heatmap, heatMetric, weather, riskZones, projects]);

  // Push risk zones to Mapbox
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !riskZones) return;
    const src = map.getSource("riskZones") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(riskZones as any);
    map.setLayoutProperty("risk-fill", "visibility", toggles.risk ? "visible" : "none");
  }, [riskZones, toggles.risk]);

  // Push storm track to Mapbox
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !weather?.stormTrack) return;
    const src = map.getSource("stormTrack") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: toggles.stormTrack ? [weather.stormTrack] : [],
    } as any);
    map.setLayoutProperty("storm-line", "visibility", toggles.stormTrack ? "visible" : "none");
  }, [weather, toggles.stormTrack]);

  // Satellite imagery toggle
  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    if (!map) return;

    const applySatellite = () => {
      // Terrain toggles can reload the style; after reload, custom sources/layers
      // (like satellite) may be missing. Recreate them if needed.
      if (!map.getSource("satellite")) {
        try {
          map.addSource("satellite", {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "© Esri, Maxar, Earthstar Geographics",
          } as any);
        } catch {
          // ignore: source may be in-flight during style load
        }
      }

      if (!map.getLayer("satellite-layer") && map.getSource("satellite")) {
        try {
          map.addLayer(
            {
              id: "satellite-layer",
              type: "raster",
              source: "satellite",
              paint: { "raster-opacity": 0 },
            } as any,
            map.getLayer("3d-buildings")
              ? "3d-buildings"
              : map.getLayer("project-labels")
                ? "project-labels"
                : undefined
          );
        } catch {
          // ignore: layer may already exist or style is mid-reload
        }
      }

      if (map.getLayer("satellite-layer")) {
        // Fade in/out via opacity so the transition is smooth
        map.setPaintProperty("satellite-layer", "raster-opacity", toggles.satellite ? 1 : 0);
      }

      const opacity = toggles.satellite
        ? Math.min(buildingExtrusionOpacity, 0.4)
        : buildingExtrusionOpacity;
      applyBuildingExtrusionOpacity(map, opacity);
    };

    if (map.isStyleLoaded()) applySatellite();
    else map.once("style.load", applySatellite);
  }, [toggles.satellite, buildingExtrusionOpacity, mapInstance]);

  // Keep fill-extrusion opacity synced with the slider (and after style reload).
  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    if (!map) return;

    const apply = () => {
      const opacity = toggles.satellite
        ? Math.min(buildingExtrusionOpacity, 0.4)
        : buildingExtrusionOpacity;
      applyBuildingExtrusionOpacity(map, opacity);
    };

    if (map.isStyleLoaded()) apply();
    map.on("load", apply);
    map.on("style.load", apply);

    return () => {
      map.off("load", apply);
      map.off("style.load", apply);
    };
  }, [mapInstance, buildingExtrusionOpacity, toggles.satellite]);

  // OSM Street Map toggle
  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    if (!map) return;

    const applyStreet = () => {
      if (!map.getSource("osm-street")) {
        try {
          map.addSource("osm-street", {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "© OpenStreetMap contributors",
          } as any);
        } catch {
          // source may be in-flight during style load
        }
      }

      if (!map.getLayer("osm-street-layer") && map.getSource("osm-street")) {
        try {
          map.addLayer(
            {
              id: "osm-street-layer",
              type: "raster",
              source: "osm-street",
              paint: { "raster-opacity": 0 },
            } as any,
            map.getLayer("satellite-layer")
              ? "satellite-layer"
              : map.getLayer("3d-buildings")
                ? "3d-buildings"
                : undefined
          );
        } catch {
          // layer may already exist
        }
      }

      if (map.getLayer("osm-street-layer")) {
        map.setPaintProperty("osm-street-layer", "raster-opacity", toggles.streetMap ? 1 : 0);
      }
    };

    if (map.isStyleLoaded()) applyStreet();
    else map.once("style.load", applyStreet);
  }, [toggles.streetMap, mapInstance]);

  // Google Street View mode — click map to open GSV in new tab
  const streetViewModeRef = useRef(false);
  useEffect(() => { streetViewModeRef.current = streetViewMode; }, [streetViewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!streetViewModeRef.current) return;
      const { lat, lng } = e.lngLat;
      const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
      window.open(url, "_blank");
    };

    map.on("click", handleClick);
    return () => { map.off("click", handleClick); };
  }, [mapInstance]);

  // Update cursor when street view mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = streetViewMode ? "crosshair" : "";
  }, [streetViewMode]);

  // Terrain (3D elevation) toggle with WebGL enhancements
  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    if (!map) return;

    const applyTerrain = () => {
      // setTerrain() can trigger a style reload in MapLibre; after that reload the
      // DEM source may not exist yet, so we defensively recreate it.
      if (!map.getSource("terrain-dem")) {
        try {
          const terrainSource = getTerrainSource("terrarium");
          map.addSource("terrain-dem", {
            type: "raster-dem",
            tiles: terrainSource.tiles,
            tileSize: terrainSource.tileSize,
            encoding: terrainSource.encoding as any,
            maxzoom: terrainSource.maxzoom,
          } as any);
        } catch {
          // ignore: source may be in-flight during style load
        }
      }

      try {
        if (toggles.terrain) {
          // Dynamic exaggeration based on zoom level for optimal visualization
          const currentZoom = map.getZoom();
          const exaggeration = calculateTerrainExaggeration(currentZoom);
          
          (map as any).setTerrain({ 
            source: "terrain-dem", 
            exaggeration: exaggeration 
          });
          map.easeTo({ pitch: 62, duration: 600 });
          
          // Show hillshade when terrain is enabled
          if (map.getLayer("hillshade")) {
            map.setLayoutProperty("hillshade", "visibility", "visible");
          }
        } else {
          (map as any).setTerrain(null);
          map.easeTo({ pitch: 30, duration: 600 });
          
          // Hide hillshade when terrain is disabled
          if (map.getLayer("hillshade")) {
            map.setLayoutProperty("hillshade", "visibility", "none");
          }
        }
      } catch {
        // ignore transient errors while style is reloading
      }
    };

    if (map.isStyleLoaded()) applyTerrain();
    else map.once("style.load", applyTerrain);

    // Update exaggeration on zoom change
    const handleZoom = () => {
      if (!toggles.terrain) return;
      const currentZoom = map.getZoom();
      const exaggeration = calculateTerrainExaggeration(currentZoom);
      try {
        (map as any).setTerrain({ 
          source: "terrain-dem", 
          exaggeration: exaggeration 
        });
      } catch {
        // ignore
      }
    };

    map.on("zoomend", handleZoom);
    return () => {
      map.off("zoomend", handleZoom);
    };
  }, [toggles.terrain, mapInstance]);

  // Keep project/municipal holes in the basemap building extrusion layer.
  useEffect(() => {
    const map = mapRef.current ?? mapInstance;
    if (!map) return;

    const OFFICE = { lat: 14.185435, lon: 121.509513 };

    const applyHoles = () => {
      if (!map.getLayer(BUILDING_EXTRUSION_LAYER)) return;

      const points = [
        OFFICE,
        ...(toggles.projects ? projects : [])
          .filter((p) => p?.location?.lon && p?.location?.lat)
          .map((p) => ({ lat: p.location.lat, lon: p.location.lon })),
      ];

      const halfM = 55;
      const rings = points.map(({ lat, lon }) => {
        const dLat = halfM / 111320;
        const dLon = halfM / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
        return [
          [lon - dLon, lat - dLat],
          [lon + dLon, lat - dLat],
          [lon + dLon, lat + dLat],
          [lon - dLon, lat + dLat],
          [lon - dLon, lat - dLat],
        ];
      });

      const exclusion = {
        type: "MultiPolygon" as const,
        coordinates: rings.map((ring) => [ring]),
      };

      const filter: any[] = [
        "all",
        ["!", ["within", exclusion]],
        [
          "!",
          [
            "in",
            ["downcase", ["to-string", ["coalesce", ["get", "name"], ""]]],
            [
              "literal",
              [
                "luisiana municipal hall",
                "municipal hall",
                "municipal office",
                "luisiana municipal office",
              ],
            ],
          ],
        ],
      ];

      try {
        map.setFilter(BUILDING_EXTRUSION_LAYER, filter as any);
      } catch (err) {
        console.warn("[Map] 3d-buildings hole filter failed:", err);
      }
    };

    if (map.isStyleLoaded()) applyHoles();
    map.on("style.load", applyHoles);
    return () => {
      map.off("style.load", applyHoles);
    };
  }, [projects, toggles.projects, mapInstance]);

  // Push project footprint dots.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const points = (toggles.projects ? projects : []).filter(
      (p) => p?.location?.lon && p?.location?.lat
    );

    const pointFeatures = points.map((p) => ({
      type: "Feature" as const,
      properties: { id: p.id, name: p.name, status: p.status },
      geometry: {
        type: "Point" as const,
        coordinates: [p.location.lon, p.location.lat],
      },
    }));

    const dots = map.getSource("project-footprints") as maplibregl.GeoJSONSource | undefined;
    dots?.setData({ type: "FeatureCollection", features: pointFeatures } as any);

    if (map.getLayer("project-labels")) {
      map.setLayoutProperty("project-labels", "visibility", toggles.projects ? "visible" : "none");
    }
  }, [projects, toggles.projects, mapInstance]);

  const riskSummary = useMemo(() => {
    const feats = riskZones?.features || [];
    const high = feats.filter((f) => f.properties.level === "HIGH").length;
    const mod = feats.filter((f) => f.properties.level === "MODERATE").length;
    const low = feats.filter((f) => f.properties.level === "LOW").length;
    return { high, mod, low, total: feats.length };
  }, [riskZones]);

  return (
    <div
      className={`appShell${
        sidebarCollapsed || screen !== "app" ? " sidebar-collapsed" : ""
      }${screen !== "app" ? " appShell--fullpage" : ""}`}
    >
      {/* Landing page */}
      {screen === "landing" && (
        <LandingPage
          onEnter={() => setScreen("login")}
          onViewMap={() => {
            setCurrentSession(sessionForRole("Viewer"));
            setScreen("app");
          }}
        />
      )}

      {/* Login screen */}
      {screen === "login" && (
        <LoginScreen
          onLogin={(session) => {
            setCurrentSession(session);
            setScreen("app");
          }}
          onBack={() => setScreen("landing")}
        />
      )}

      {/* Inventory Page */}
      {screen === "inventory" && (
        <InventoryPage
          onBack={() => setScreen("app")}
          backendProjects={projects}
          currentRole={currentRole}
        />
      )}

      {screen === "planning" && (
        <PlanningPage onBack={() => setScreen("app")} session={currentSession} />
      )}

      {/* Main app - only render when logged in */}
      {screen === "app" && <>
      <div className="mapWrap">
        <div className="map" ref={mapDivRef} style={{ cursor: placementMode ? "crosshair" : undefined }} />

        <DeckGLOverlay
          map={mapInstance}
          enabledHeatmap={toggles.heatmap && !toggles.gibsPrecip}
          heatPoints={heatPoints}
          enabledWeather={toggles.weather}
          weather={weather}
          shadowsEnabled={toggles.terrain}
          sunLightPosition={[0, -70, 100]}
          enabledEONET={eonetEnabled}
          eonetEvents={eonetEvents}
          enabledAIRisk={aiRiskEnabled}
          aiRiskPredictions={aiRiskPredictions}
        />

        <BuildingOverlay
          map={mapInstance}
          projects={projects}
          visible={toggles.projects}
          opacity={glbModelsOpacity}
          readOnly={currentRole === "Viewer"}
          snapToRoad={snapToRoad && (editMode || placementMode)}
          onBuildingClick={(hit) => { buildingHitRef.current = hit; }}
          onDeleteBuilding={currentRole === "Viewer" ? undefined : async (projectId) => {
            try {
              await fetch(backendUrl(`/api/projects/${projectId}`), { method: "DELETE" });
            } catch (err) {
              console.error("Failed to delete project:", err);
            }
          }}
        />

        {/* Google Street View mode indicator */}
        {streetViewMode && (
          <div style={{
            position: "absolute",
            top: 70,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            background: "rgba(0,0,0,0.85)",
            color: "#fff",
            padding: "8px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: '"Chakra Petch", sans-serif',
            display: "flex",
            alignItems: "center",
            gap: 10,
            border: "1px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(8px)",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FBBC05" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="3"/><path d="M12 8v4"/><path d="M6.5 16a5.5 5.5 0 0 1 11 0"/>
              <path d="M4 22l2-6"/><path d="M20 22l-2-6"/>
            </svg>
            <span>Click anywhere on the map to open <b>Google Street View</b></span>
            <button
              onClick={() => setStreetViewMode(false)}
              style={{
                cursor: "pointer",
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 4,
                color: "#fff",
                padding: "3px 12px",
                fontSize: 11,
                fontWeight: 600,
                marginLeft: 4,
              }}
            >
              Exit
            </button>
          </div>
        )}

        <div className="topBar">
          <div className="topBar-brand">
            <div className="topBar-brand-text">
              <div className="brand">
                INFA-TRACK <span className="brand-place">Luisiana</span>
              </div>
              <div className="sub">Real-Time GIS Infrastructure & Disaster Monitoring</div>
            </div>
          </div>
          <div className="topBar-toolbar">
            {roleConfig && (
              <div className="chip chip-role" style={{ borderColor: `${roleConfig.color}50`, color: roleConfig.color, fontWeight: 600 }}>
                {roleConfig.label}
              </div>
            )}
            <div className="chip chip-live">
              <span className="dot" style={{ background: connected ? "var(--accent)" : "rgba(255,77,79,0.9)" }} />
              {connected ? "Live" : "Offline"}
            </div>
            <div className="chip chip-risk topBar-hide-sm">
              Risk:{" "}
              <span style={{ color: topRisk.level === "HIGH" ? "var(--danger)" : topRisk.level === "MODERATE" ? "var(--warn)" : "var(--safe)" }}>
                {topRisk.level}
              </span>
            </div>
            <div className="chip chip-updates topBar-hide-mobile">Updates: 5s</div>
          </div>
          <div className="topBar-actions-primary">
            {roleConfig?.canSeePlanning && (
              <button
                type="button"
                className="topBar-exit"
                style={{
                  background: "linear-gradient(135deg, rgba(36,92,58,0.22), rgba(61,155,95,0.18))",
                  borderColor: "rgba(36,92,58,0.45)",
                }}
                onClick={() => setScreen("planning")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" />
                  <path d="M9 12h6M9 16h4" />
                </svg>
                <span className="topBar-exit-full">Planning</span>
                <span className="topBar-exit-short">Plan</span>
              </button>
            )}
            {currentRole !== "Negosyo Center" && currentRole !== "Viewer" && (
              <button
                type="button"
                className="topBar-exit"
                style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))", borderColor: "rgba(59,130,246,0.4)" }}
                onClick={() => setScreen("inventory")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>
                <span className="topBar-exit-full">Inventory</span>
                <span className="topBar-exit-short">Inv</span>
              </button>
            )}
            <ThemeToggle iconOnly />
            {currentRole && (
              <button
                type="button"
                className="topBar-exit"
                onClick={() => {
                  clearSessionCookie();
                  setCurrentSession(null);
                  setScreen("landing");
                }}
              >
                <span className="topBar-exit-full">{currentRole === "Viewer" ? "Exit Map" : "Sign Out"}</span>
                <span className="topBar-exit-short">{currentRole === "Viewer" ? "Exit" : "Out"}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Map Controls ── */}
        <div className="map-controls">
          {/* Zoom in */}
          <button className="map-ctrl-btn" title="Zoom In (=)" onClick={() => mapRef.current?.zoomIn({ duration: 300 })}>+</button>
          {/* Zoom out */}
          <button className="map-ctrl-btn" title="Zoom Out (-)" onClick={() => mapRef.current?.zoomOut({ duration: 300 })}>−</button>
          <div className="map-ctrl-divider" />
          {/* Compass — rotates to show current bearing, click to reset north */}
          <button
            className="map-ctrl-btn"
            title="Reset North"
            onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 62, duration: 500 })}
            style={{ fontSize: 18 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2 L14.5 9 L12 8 L9.5 9 Z"
                fill="#ff4d4f"
                transform={`rotate(${mapBearing}, 12, 12)`}
              />
              <path
                d="M12 22 L9.5 15 L12 16 L14.5 15 Z"
                fill="var(--muted2)"
                transform={`rotate(${mapBearing}, 12, 12)`}
              />
            </svg>
          </button>
          <div className="map-ctrl-divider" />
          {/* Fly home */}
          <button
            className="map-ctrl-btn"
            title="Fly to Luisiana"
            onClick={() => mapRef.current?.flyTo({
              center: [CENTER.lon, CENTER.lat],
              zoom: CENTER.zoom,
              pitch: 62,
              bearing: -15,
              duration: 1200,
              essential: true,
            })}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </button>
          {/* Tilt toggle */}
          <button
            className="map-ctrl-btn"
            title="Toggle Tilt"
            onClick={() => {
              const m = mapRef.current;
              if (!m) return;
              const p = m.getPitch();
              m.easeTo({ pitch: p > 10 ? 0 : 62, duration: 500 });
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20 L12 4 L22 20"/>
              <line x1="2" y1="20" x2="22" y2="20"/>
            </svg>
          </button>
        </div>

      </div>

      <button
        type="button"
        className={`sidePanel-edgeToggle${sidebarCollapsed ? " is-collapsed" : ""}`}
        aria-label={sidebarCollapsed ? "Expand side panel" : "Collapse side panel"}
        title={sidebarCollapsed ? "Expand panel" : "Collapse panel"}
        onClick={() => setSidebarCollapsed((v) => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {sidebarCollapsed
            ? <polyline points="15 18 9 12 15 6" />
            : <polyline points="9 18 15 12 9 6" />}
        </svg>
      </button>

      <aside className={`sidePanel${sidebarCollapsed ? " is-collapsed" : ""}`} aria-hidden={sidebarCollapsed}>
        <div className="sidePanel-head">
          <div className="sectionTitle">Live Situation Panel</div>
          <button
            type="button"
            className="sidePanel-collapseBtn"
            aria-label="Collapse side panel"
            title="Collapse panel"
            onClick={() => setSidebarCollapsed(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="sidebar-tabs">
          {(roleConfig?.canSeeWeather || roleConfig?.canSeeLayers) && (
            <button type="button" className={`sidebar-tab${sidebarTab === "climate" ? " active" : ""}`} onClick={() => setSidebarTab("climate")}>Climate</button>
          )}
          {roleConfig?.canSeeLayers && (
            <button type="button" className={`sidebar-tab${sidebarTab === "layers" ? " active" : ""}`} onClick={() => setSidebarTab("layers")}>Layers</button>
          )}
          {roleConfig?.canSeeRisk && (
            <button type="button" className={`sidebar-tab${sidebarTab === "risk" ? " active" : ""}`} onClick={() => setSidebarTab("risk")}>Risk</button>
          )}
          {roleConfig?.canSeeProjects && (
            <button type="button" className={`sidebar-tab${sidebarTab === "projects" ? " active" : ""}`} onClick={() => setSidebarTab("projects")}>Projects</button>
          )}
          {roleConfig?.canSeeLayers && (
            <button type="button" className={`sidebar-tab${sidebarTab === "events" ? " active" : ""}`} onClick={() => setSidebarTab("events")}>Events</button>
          )}
          {roleConfig?.canSeeLayers && (
            <button type="button" className={`sidebar-tab${sidebarTab === "ai-risk" ? " active" : ""}`} onClick={() => setSidebarTab("ai-risk")}>AI Risk</button>
          )}
        </div>

        {currentRole === "Viewer" && (
          <div className="card viewer-banner" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 4 }}>Public Map Viewer</div>
            <p style={{ margin: 0, fontSize: 11, color: "var(--muted2)", lineHeight: 1.5 }}>
              View-only mode — browse weather, risk, and projects without department sign-in.
            </p>
          </div>
        )}

        {/* Tab Content */}
        <div className="sidePanel-body">

        {/* ── Negosyo Center: Business Permit Panel ── */}
        {roleConfig?.canSeeBusinessPermits && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>Business Permit &amp; Licensing</div>
            <div className="grid2">
              <div className="stat">
                <div className="v" style={{ color: "var(--warn)" }}>{projects.filter(p => p.department === "Negosyo Center" && p.status === "Ongoing").length}</div>
                <div className="l">Pending Permits</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--safe)" }}>{projects.filter(p => p.department === "Negosyo Center" && p.status === "Completed").length}</div>
                <div className="l">Approved</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--muted)" }}>{projects.filter(p => p.department === "Negosyo Center" && p.status === "Planned").length}</div>
                <div className="l">For Review</div>
              </div>
              <div className="stat">
                <div className="v">{projects.filter(p => p.department === "Negosyo Center").length}</div>
                <div className="l">Total Applications</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Recent Applications</div>
              <div className="miniList">
                {projects.filter(p => p.department === "Negosyo Center").slice(0, 5).map(p => (
                  <div key={p.id} className="proj">
                    <div className="n">{p.name}</div>
                    <div className="s">
                      <span style={{ color: p.status === "Completed" ? "var(--safe)" : p.status === "Ongoing" ? "var(--warn)" : "var(--muted)" }}>
                      {p.status === "Completed"
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconCheck /> Approved</span>
                        : p.status === "Ongoing"
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconClock /> Pending</span>
                        : p.status === "Planned"
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconClipboard /> For Review</span>
                        : <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconClipboard /> {p.status}</span>
                      }
                      </span>
                      <span>{p.progress}%</span>
                    </div>
                    <div className="bar"><div style={{ width: `${p.progress}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Layers Tab ── */}
        {sidebarTab === "layers" && roleConfig?.canSeeLayers && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="sectionTitle" style={{ marginBottom: 8 }}>
            Layers (LGU-Friendly Toggles)
          </div>

          {(
            [
              {
                k: "heatmap",
                title: "Heatmap",
                hint: "Animated intensity (Blue→Yellow→Red)",
              },
              { k: "weather", title: "Weather Overlay", hint: "Cloud field + rainfall feel" },
              { k: "stormTrack", title: "Storm Tracking", hint: "Drift line based on wind" },
              { k: "projects", title: "Infrastructure Projects", hint: "GLB models on map" },
            ] as const
          ).map((row) => (
            <div key={row.k} className="toggleRow">
              <div>
                <label>{row.title}</label>
                <div className="hint">{row.hint}</div>
              </div>
              <div
                className={`switch ${toggles[row.k] ? "on" : ""}`}
                role="switch"
                aria-checked={toggles[row.k]}
                onClick={() => setToggles((t) => ({ ...t, [row.k]: !t[row.k] }))}
              />
            </div>
          ))}

          <div
            className="extrusion-opacity-control"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginTop: 4,
              marginBottom: 10,
              paddingLeft: 2,
            }}
          >
            <span className="pill">3D Blocks</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={buildingExtrusionOpacity}
              aria-label="Basemap 3D building extrusion opacity"
              onChange={(e) => {
                const next = Number(e.target.value);
                setBuildingExtrusionOpacity(next);
                const map = mapRef.current ?? mapInstance;
                if (map) {
                  const opacity = toggles.satellite ? Math.min(next, 0.4) : next;
                  applyBuildingExtrusionOpacity(map, opacity);
                }
              }}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 35 }}>
              {Math.round(buildingExtrusionOpacity * 100)}%
            </span>
          </div>

          <div
            className="extrusion-opacity-control"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginBottom: 10,
              paddingLeft: 2,
            }}
          >
            <span className="pill">GLB Models</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={glbModelsOpacity}
              aria-label="Project GLB model opacity"
              onChange={(e) => {
                setGlbModelsOpacity(Number(e.target.value));
              }}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 35 }}>
              {Math.round(glbModelsOpacity * 100)}%
            </span>
          </div>

          <div className="toggleRow">
            <div>
              <label>NASA GIBS Precip</label>
              <div className="hint">Satellite rainfall heatmap (low-res, daily)</div>
            </div>
            <div
              className={`switch ${toggles.gibsPrecip ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.gibsPrecip}
              onClick={() => setToggles((t) => ({ ...t, gibsPrecip: !t.gibsPrecip }))}
            />
          </div>

          <div className="toggleRow" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <label>Heatmap Mode</label>
              <div className="hint">What the heatmap represents</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {(
                  [
                    ["combined", "Combined"],
                    ["rainfall", "Rainfall"],
                    ["landslide", "Landslide"],
                    ["infrastructure", "Infrastructure"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setHeatMetric(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 2,
                      padding: "6px 10px",
                      fontSize: 12,
                      background: heatMetric === k ? "var(--seed)" : "var(--cream-ink)",
                      color: "var(--ink)",
                      fontWeight: 700,
                      border: heatMetric === k ? "2px solid var(--ink)" : "1px solid var(--stroke)",
                      boxShadow: heatMetric === k ? "2px 2px 0 var(--ink)" : "none",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: "0 0 auto", textAlign: "right" }}>
              <span className="pill">Cool→Hot</span>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted2)" }}>
                {heatMetric === "rainfall"
                  ? "Rain intensity"
                  : heatMetric === "landslide"
                    ? "Risk pressure"
                    : heatMetric === "infrastructure"
                      ? "Density"
                      : "All signals"}
              </div>
            </div>
          </div>

          <div className="toggleRow">
            <div>
              <label>Street Map</label>
              <div className="hint">OpenStreetMap — clean roads, labels, POIs</div>
            </div>
            <div
              className={`switch ${toggles.streetMap ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.streetMap}
              onClick={() =>
                setToggles((t) => ({
                  ...t,
                  streetMap: !t.streetMap,
                  satellite: t.streetMap ? t.satellite : false,
                }))
              }
            />
          </div>
          <div className="toggleRow">
            <div>
              <label>Street View</label>
              <div className="hint">Google — click map to view 360° street imagery</div>
            </div>
            <div
              className={`switch ${streetViewMode ? "on" : ""}`}
              role="switch"
              aria-checked={streetViewMode}
              onClick={() => setStreetViewMode((v) => !v)}
            />
          </div>
          <div className="toggleRow">
            <div>
              <label>Satellite</label>
              <div className="hint">ESRI World Imagery — damage validation</div>
            </div>
            <div
              className={`switch ${toggles.satellite ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.satellite}
              onClick={() =>
                setToggles((t) => ({
                  ...t,
                  satellite: !t.satellite,
                  streetMap: t.satellite ? t.streetMap : false,
                  terrain: t.satellite ? t.terrain : false,
                }))
              }
            />
          </div>
          <div className="toggleRow">
            <div>
              <label>3D Terrain</label>
              <div className="hint">Elevation exaggeration — slope analysis</div>
            </div>
            <div
              className={`switch ${toggles.terrain ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.terrain}
              onClick={() =>
                setToggles((t) => ({
                  ...t,
                  terrain: !t.terrain,
                  satellite: t.terrain ? t.satellite : false,
                }))
              }
            />
          </div>
        </div>
        )}

        {/* ── Risk Tab ── */}
        {sidebarTab === "risk" && roleConfig?.canSeeRisk && (
          <>
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="sectionTitle" style={{ marginBottom: 8 }}>
            Risk Summary
          </div>
          <div className="grid2">
            <div className="stat">
              <div className="v" style={{ color: "var(--danger)" }}>
                {riskSummary.high}
              </div>
              <div className="l">High Risk</div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "var(--warn)" }}>
                {riskSummary.mod}
              </div>
              <div className="l">Moderate</div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "var(--safe)" }}>
                {riskSummary.low}
              </div>
              <div className="l">Safe</div>
            </div>
            <div className="stat">
              <div className="v">{riskSummary.total}</div>
              <div className="l">Zones</div>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            Model: rainfall + slope (LGU explainable logic)
          </div>
        </div>

        {roleConfig?.canSeeAlerts && <>
        <div style={{ marginBottom: 8 }} className="sectionTitle">
          Real-Time Alerts
        </div>
        {alerts.length ? (
          <div className="miniList">
            {alerts.map((a) => (
              <div key={a.id} className="alert">
                <div className="t">{a.title}</div>
                <div className="m">{a.message}</div>
                <div className="meta">
                  Recommended: {a.recommendedAction}
                  <br />
                  Triggered: {formatAgo(a.triggeredAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{ color: "var(--muted)", fontSize: 13 }}>
            No high-risk alerts yet. The system will notify automatically when a zone transitions to HIGH risk.
          </div>
        )}
        </>}
          </>
        )}

        {/* ── Projects Tab ── */}
        {sidebarTab === "projects" && (
          <>
        {/* ── Engineer: Place Infrastructure Models ── */}
        {currentRole === "Engineer" && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 10 }}>
              Place Infrastructure
            </div>

            {/* Placement toggle */}
            <button
              onClick={() => setPlacementMode((v) => !v)}
              style={{
                width: "100%", cursor: "pointer", padding: "10px 0",
                borderRadius: 2, fontWeight: 700, fontSize: 13,
                border: placementMode ? "1px solid rgba(61,155,95,0.6)" : "1px solid var(--stroke)",
                background: placementMode ? "rgba(61,155,95,0.20)" : "var(--cream-deep)",
                color: placementMode ? "var(--seed)" : "var(--muted)",
                marginBottom: 10,
              }}
            >
              {placementMode ? (
                <span style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                  Placement Mode ON — Click map to place
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Enable Placement Mode
                </span>
              )}
            </button>

            {/* Edit Mode — glowing streets */}
            <button
              type="button"
              onClick={() => {
                setEditMode((v) => {
                  const next = !v;
                  if (next) setSnapToRoad(true);
                  return next;
                });
              }}
              style={{
                width: "100%", cursor: "pointer", padding: "10px 0",
                borderRadius: 2, fontWeight: 700, fontSize: 13,
                border: editMode ? "1px solid rgba(0,243,255,0.7)" : "1px solid var(--stroke)",
                background: editMode ? "rgba(0,243,255,0.12)" : "var(--cream-deep)",
                color: editMode ? "#00c8d4" : "var(--muted)",
                marginBottom: 10,
              }}
            >
              {editMode ? "Edit Mode ON — Streets highlighted" : "Enable Edit Mode"}
            </button>

            {/* Snap to Road */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                fontSize: 12,
                color: (editMode || placementMode) ? "var(--ink-soft)" : "var(--muted2)",
                cursor: (editMode || placementMode) ? "pointer" : "not-allowed",
                opacity: (editMode || placementMode) ? 1 : 0.55,
              }}
            >
              <input
                type="checkbox"
                checked={snapToRoad}
                disabled={!editMode && !placementMode}
                onChange={(e) => setSnapToRoad(e.target.checked)}
              />
              Snap to Road (magnet + align yaw)
            </label>

            {/* Name input */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Project Name (optional)</div>
              <input
                value={placingName}
                onChange={(e) => setPlacingName(e.target.value)}
                placeholder="e.g. Brgy. Hall Phase 2"
                style={{
                  width: "100%", boxSizing: "border-box", padding: "7px 10px",
                  borderRadius: 2, border: "1px solid var(--stroke)",
                  background: "var(--cream-deep)", color: "var(--ink-soft)",
                  fontSize: 12, outline: "none",
                }}
              />
            </div>

            {/* Rotation */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 52 }}>Rotation</span>
              <input type="range" min={0} max={360} step={15} value={placementRotation}
                onChange={(e) => setPlacementRotation(Number(e.target.value))}
                style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: "var(--muted2)", minWidth: 32, textAlign: "right" }}>
                {placementRotation}°
              </span>
            </div>

            {/* Model catalog */}
            {(["Building", "Infrastructure", "Agriculture", "Construction"] as const).map((cat) => (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{cat}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {MODEL_CATALOG.filter((m) => m.category === cat).map((m) => (
                    <button
                      key={m.type}
                      onClick={() => {
                        setSelectedModel(m.type);
                        if (m.type !== "custom") {
                          setCustomModelFile(null);
                          setCustomModelPreview(null);
                        }
                      }}
                      title={m.description}
                      style={{
                        cursor: "pointer", padding: "8px 6px", borderRadius: 2, textAlign: "left",
                        border: selectedModel === m.type
                          ? "1px solid rgba(61,155,95,0.55)"
                          : "1px solid var(--stroke2)",
                        background: selectedModel === m.type
                          ? "rgba(61,155,95,0.14)"
                          : "var(--cream-ink)",
                        color: selectedModel === m.type ? "var(--seed)" : "var(--muted)",
                      }}
                    >
                      <div style={{ marginBottom: 4, display: "flex", alignItems: "center", color: selectedModel === m.type ? "var(--seed)" : "var(--muted)" }}>
                        {(() => { const Ic = ModelIcons[m.icon] ?? ModelIcons.construction; return <Ic size={18} />; })()}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{m.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Custom Model Upload */}
            {selectedModel === "custom" && (
              <div style={{ 
                marginTop: 12, 
                padding: "12px", 
                background: "rgba(61,155,95,0.08)", 
                border: "1px solid rgba(61,155,95,0.25)", 
                borderRadius: 2 
              }}>
                <div style={{ fontSize: 11, color: "var(--seed)", fontWeight: 600, marginBottom: 8 }}>
                  Upload Custom GLB Model
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.45, marginBottom: 8 }}>
                  Colors must be on Principled BSDF Base Color (or image textures), not Viewport Display only.
                  SVG materials often export white — run scripts/blender_fix_materials_for_gltf.py in Blender before export.
                  Max file size: 200MB (.glb / .gltf).
                </div>
                <input
                  type="file"
                  accept=".glb,.gltf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCustomModelFile(file);
                      setCustomModelPreview(file.name);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "rgba(0,0,0,0.3)",
                    color: "var(--ink-soft)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                />
                {customModelPreview && (
                  <div style={{ 
                    marginTop: 8, 
                    fontSize: 10, 
                    color: "var(--muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--seed)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {customModelPreview}
                  </div>
                )}
                <div style={{ 
                  marginTop: 8, 
                  fontSize: 10, 
                  color: "var(--muted2)", 
                  lineHeight: 1.4 
                }}>
                  Upload your own 3D model in GLB or GLTF format. The model will be placed on the map at the clicked location.
                </div>
              </div>
            )}

            {/* Placed projects list with delete */}
            {projects.filter((p) => p.department === "Engineering").length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Placed by Engineer</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                  {projects.filter((p) => p.department === "Engineering").map((p) => (
                    <div key={p.id} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
                      background: "var(--cream-ink)", borderRadius: 0,
                      border: "1px solid var(--stroke2)",
                    }}>
                      <span style={{ display: "flex", alignItems: "center", color: "var(--muted)" }}>
                        {(() => { const ic = MODEL_CATALOG.find((m) => m.type === p.modelType)?.icon ?? "construction"; const Ic = ModelIcons[ic] ?? ModelIcons.construction; return <Ic size={15} />; })()}
                      </span>
                      <span style={{ flex: 1, fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                      <button
                        onClick={async () => {
                          await fetch(backendUrl(`/api/projects/${p.id}`), { method: "DELETE" });
                        }}
                        style={{
                          cursor: "pointer", padding: "2px 7px", borderRadius: 5, fontSize: 11,
                          border: "1px solid rgba(255,77,79,0.3)", background: "rgba(255,77,79,0.10)",
                          color: "rgba(255,100,100,0.9)",
                        }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {roleConfig?.canSeeProjects && (
          <ProjectMonitoringPanel
            projects={projects}
            currentRole={currentRole}
            mapRef={mapRef}
            readOnly={currentRole === "Viewer"}
          />
        )}
        </>
        )}

        {/* ── Climate Tab ── */}
        {sidebarTab === "climate" && (roleConfig?.canSeeWeather || roleConfig?.canSeeLayers) && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              Climate Readings
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
              Live station values for Luisiana — readable numbers, not particle visualizations.
            </div>

            <div className="grid2" style={{ marginBottom: 12 }}>
              <div className="stat">
                <div className="v">{weather ? `${Math.round(weather.windSpeedMps * 3.6)} kph` : "—"}</div>
                <div className="l">Wind Speed</div>
              </div>
              <div className="stat">
                <div className="v">
                  {weather
                    ? (() => {
                        const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
                        const label = dirs[Math.round(((weather.windDirectionDeg % 360) + 360) % 360 / 45) % 8];
                        return `${label} · ${Math.round(weather.windDirectionDeg)}°`;
                      })()
                    : "—"}
                </div>
                <div className="l">Wind Direction</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${weather.temperatureC.toFixed(1)}°C` : "—"}</div>
                <div className="l">Air Temperature</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${weather.rainfallMm.toFixed(1)} mm` : "—"}</div>
                <div className="l">Rainfall</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${weather.humidityPct ?? "—"}%` : "—"}</div>
                <div className="l">Humidity</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${weather.cloudinessPct}%` : "—"}</div>
                <div className="l">Cloud Cover</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${weather.pressureHpa ?? "—"} hPa` : "—"}</div>
                <div className="l">Pressure</div>
              </div>
              <div className="stat">
                <div className="v">{weather ? `${(weather.rainfallIntensity * 100).toFixed(0)}%` : "—"}</div>
                <div className="l">Rain Intensity</div>
              </div>
            </div>

            {weather && (
              <div style={{
                marginBottom: 14,
                padding: "10px 12px",
                borderLeft: "4px solid var(--accent)",
                background: "var(--cream-deep)",
                fontSize: 12,
                lineHeight: 1.45,
                color: "var(--ink-soft)",
              }}>
                <strong style={{ color: "var(--ink)" }}>Hangin:</strong>{" "}
                {Math.round(weather.windSpeedMps * 3.6) >= 118
                  ? `Bagyo-level wind signal — ${Math.round(weather.windSpeedMps * 3.6)} kph. Limit outdoor / elevated work.`
                  : Math.round(weather.windSpeedMps * 3.6) >= 62
                    ? `Strong breeze at ${Math.round(weather.windSpeedMps * 3.6)} kph. Secure loose materials on site.`
                    : Math.round(weather.windSpeedMps * 3.6) >= 30
                      ? `Moderate wind at ${Math.round(weather.windSpeedMps * 3.6)} kph from ${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((weather.windDirectionDeg % 360) + 360) % 360 / 45) % 8]}.`
                      : `Light wind at ${Math.round(weather.windSpeedMps * 3.6)} kph — conditions are manageable for outdoor operations.`}
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted2)" }}>
                  Source: {weather.source} · Updated {formatAgo(weather.observedAt)}
                </div>
              </div>
            )}

            {weather?.forecast?.length ? (
              <div style={{ marginBottom: 16 }}>
                <div className="sectionTitle" style={{ marginBottom: 8 }}>Next hours (text forecast)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {weather.forecast.slice(0, 6).map((f) => {
                    const kph = Math.round(f.windSpeedMps * 3.6);
                    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
                    const dir = dirs[Math.round(((f.windDirectionDeg % 360) + 360) % 360 / 45) % 8];
                    return (
                      <div key={f.hour} style={{
                        display: "grid",
                        gridTemplateColumns: "3.2rem 1fr",
                        gap: 10,
                        padding: "8px 0",
                        borderBottom: "1px solid var(--stroke2)",
                        fontSize: 12,
                      }}>
                        <div style={{ fontWeight: 700, color: "var(--burnt-deep)" }}>+{f.hour}h</div>
                        <div style={{ color: "var(--ink-soft)", lineHeight: 1.4 }}>
                          Temp <strong style={{ color: "var(--ink)" }}>{f.temperatureC}°C</strong>
                          {" · "}Wind <strong style={{ color: "var(--ink)" }}>{kph} kph {dir}</strong>
                          {" · "}Rain <strong style={{ color: "var(--ink)" }}>{f.rainfallMm} mm</strong>
                          {" · "}Clouds <strong style={{ color: "var(--ink)" }}>{f.cloudinessPct}%</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {roleConfig?.canSeeLayers && (
            <>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              NASA GIBS Map Layers
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
              Optional map overlays — precipitation, temperature, imagery, atmosphere.
            </div>

            {/* Enable/Disable Toggle */}
            <div className="toggleRow" style={{ marginBottom: 16 }}>
              <div>
                <label>Enable Climate Layer</label>
                <div className="hint">Show NASA GIBS data on map</div>
              </div>
              <div
                className={`switch ${toggles.gibsPrecip ? "on" : ""}`}
                role="switch"
                aria-checked={toggles.gibsPrecip}
                onClick={() => setToggles((t) => ({ ...t, gibsPrecip: !t.gibsPrecip }))}
              />
            </div>

            {/* Precipitation Layers */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(61,155,95,0.85)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                ☔ Precipitation (Ulan)
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    ["IMERG_Precipitation_Rate", "IMERG Rate"],
                    ["IMERG_Precipitation_Rate_30min", "IMERG 30min"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setGibsLayer(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 2,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(61,155,95,0.20)",
                      background: gibsLayer === k ? "rgba(61,155,95,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "rgba(61,155,95,1)" : "var(--muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Temperature Layers */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(255,140,60,0.85)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                🌡️ Temperature (Temperatura)
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    ["MODIS_Terra_Land_Surface_Temp_Day", "Surface (Day)"],
                    ["MODIS_Terra_Land_Surface_Temp_Night", "Surface (Night)"],
                    ["AIRS_L2_Surface_Air_Temperature_Day", "Air Temp"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setGibsLayer(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 2,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(255,140,60,0.20)",
                      background: gibsLayer === k ? "rgba(255,140,60,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "var(--primary)" : "var(--muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Satellite Imagery */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(61,155,95,0.85)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                🛰️ Satellite Imagery
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    ["MODIS_Terra_CorrectedReflectance_TrueColor", "MODIS (250m)"],
                    ["VIIRS_NOAA20_CorrectedReflectance_TrueColor", "VIIRS (750m)"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setGibsLayer(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 2,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(61,155,95,0.20)",
                      background: gibsLayer === k ? "rgba(61,155,95,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "rgba(61,155,95,1)" : "var(--muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Atmosphere Layers */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(255,215,0,0.85)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                🌫️ Atmosphere (Hangin)
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    ["MODIS_Terra_Aerosol", "Air Quality"],
                    ["MODIS_Aqua_Cloud_Top_Temp_Day", "Cloud Temp"],
                    ["AIRS_L2_Surface_Relative_Humidity_Day", "Humidity"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setGibsLayer(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 2,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid rgba(255,215,0,0.20)",
                      background: gibsLayer === k ? "rgba(255,215,0,0.25)" : "rgba(0,0,0,0.15)",
                      color: gibsLayer === k ? "var(--seed)" : "var(--muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity Control */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <span className="pill">Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={0.9}
                  step={0.05}
                  value={gibsOpacity}
                  onChange={(e) => setGibsOpacity(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 35 }}>
                  {Math.round(gibsOpacity * 100)}%
                </span>
              </div>

              {/* Date Control */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="pill">Date</span>
                <input
                  type="date"
                  value={gibsDate}
                  onChange={(e) => setGibsDate(e.target.value)}
                  style={{
                    flex: 1,
                    background: "rgba(0,0,0,0.15)",
                    border: "1px solid var(--stroke)",
                    borderRadius: 0,
                    padding: "6px 8px",
                    color: "var(--ink-soft)",
                    fontSize: 11,
                  }}
                />
              </div>

              {/* Status Indicator */}
              {gibsStatus === "loading" && (
                <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,215,0,0.85)", display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,215,0,0.85)", animation: "pulse 1.5s infinite" }} />
                  Loading climate data...
                </div>
              )}
              {gibsStatus === "unavailable" && (
                <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,77,79,0.85)" }}>
                  ⚠️ Data unavailable for this date
                </div>
              )}
              {gibsStatus === "ok" && toggles.gibsPrecip && (
                <div style={{ marginTop: 10, fontSize: 11, color: "rgba(61,155,95,0.85)", display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(61,155,95,0.85)" }} />
                  Climate data active
                </div>
              )}
            </div>

            {/* Info Box */}
            <div style={{ marginTop: 16, padding: 12, background: "rgba(61,155,95,0.08)", border: "1px solid rgba(61,155,95,0.15)", borderRadius: 2 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                💡 <strong>Tip:</strong> Use yesterday's date for most reliable data. Some layers have 1-2 day processing lag.
              </div>
            </div>
            </>
            )}
          </div>
        )}

        {/* ── Events Tab (NASA EONET Natural Events) ── */}
        {sidebarTab === "events" && roleConfig?.canSeeLayers && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              🌍 NASA Natural Event Tracker
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
              Real-time natural events from NASA EONET - Wildfires, Storms, Volcanoes, Earthquakes, and more
            </div>

            {/* Enable/Disable Toggle */}
            <div className="toggleRow" style={{ marginBottom: 16 }}>
              <div>
                <label>Enable Event Tracking</label>
                <div className="hint">Show natural events on map</div>
              </div>
              <div
                className={`switch ${eonetEnabled ? "on" : ""}`}
                role="switch"
                aria-checked={eonetEnabled}
                onClick={() => setEonetEnabled(!eonetEnabled)}
              />
            </div>

            {/* Event Statistics */}
            {eonetEnabled && eonetEvents.length > 0 && (
              <div style={{ marginBottom: 16, padding: 12, background: "rgba(255,100,100,0.08)", border: "1px solid rgba(255,100,100,0.15)", borderRadius: 2 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  Active Events Nearby
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {Object.entries(getEventStats(eonetEvents)).map(([catId, count]) => {
                    const cat = EONET_CATEGORIES[catId];
                    if (!cat) return null;
                    return (
                      <div key={catId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                        <span style={{ fontSize: 14 }}>{cat.icon}</span>
                        <span style={{ color: "var(--ink-soft)" }}>{count}</span>
                        <span style={{ color: "var(--muted)" }}>{cat.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category Filters */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                Event Categories
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(EONET_CATEGORIES).map(([id, cat]) => {
                  const isSelected = eonetCategories.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        if (isSelected) {
                          setEonetCategories(eonetCategories.filter(c => c !== id));
                        } else {
                          setEonetCategories([...eonetCategories, id]);
                        }
                      }}
                      style={{
                        cursor: "pointer",
                        borderRadius: 2,
                        padding: "7px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        border: `1px solid ${cat.color}40`,
                        background: isSelected ? `${cat.color}30` : "rgba(0,0,0,0.15)",
                        color: isSelected ? cat.color : "var(--muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Radius Control */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <span className="pill">Search Radius</span>
                <input
                  type="range"
                  min={100}
                  max={5000}
                  step={100}
                  value={eonetRadius}
                  onChange={(e) => setEonetRadius(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 60 }}>
                  {eonetRadius} km
                </span>
              </div>
            </div>

            {/* Status Indicator */}
            {eonetLoading && (
              <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,215,0,0.85)", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,215,0,0.85)", animation: "pulse 1.5s infinite" }} />
                Loading events...
              </div>
            )}
            {!eonetLoading && eonetEnabled && eonetEvents.length === 0 && (
              <div style={{ marginTop: 12, fontSize: 11, color: "rgba(61,155,95,0.85)" }}>
                ✓ No active events in your area
              </div>
            )}
            {!eonetLoading && eonetEnabled && eonetEvents.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,100,100,0.85)", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,100,100,0.85)" }} />
                {eonetEvents.length} active event{eonetEvents.length !== 1 ? 's' : ''} tracked
              </div>
            )}

            {/* Event List */}
            {eonetEnabled && eonetEvents.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  📍 Event Locations
                </div>
                <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {eonetEvents.slice(0, 20).map((event) => {
                    const geometry = getLatestGeometry(event);
                    const category = event.categories[0];
                    const catInfo = EONET_CATEGORIES[category?.id];
                    const distance = geometry ? Math.round(
                      calculateDistance(14.1856, 121.5167, geometry.coordinates[1], geometry.coordinates[0])
                    ) : 0;

                    return (
                      <div
                        key={event.id}
                        onClick={() => {
                          if (geometry && mapRef.current) {
                            mapRef.current.flyTo({
                              center: [geometry.coordinates[0], geometry.coordinates[1]],
                              zoom: 8,
                              duration: 2000,
                            });
                          }
                        }}
                        style={{
                          padding: 10,
                          background: "rgba(0,0,0,0.20)",
                          border: `1px solid ${catInfo?.color || '#888'}30`,
                          borderRadius: 2,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(0,0,0,0.35)";
                          e.currentTarget.style.borderColor = `${catInfo?.color || '#888'}60`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(0,0,0,0.20)";
                          e.currentTarget.style.borderColor = `${catInfo?.color || '#888'}30`;
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span style={{ fontSize: 18, flexShrink: 0 }}>{catInfo?.icon || '📍'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)", marginBottom: 4, lineHeight: 1.3 }}>
                              {event.title}
                            </div>
                            {event.description && (
                              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, lineHeight: 1.3 }}>
                                {event.description}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: "var(--muted)" }}>
                              <span style={{ color: catInfo?.color || '#888' }}>
                                {category?.title || 'Unknown'}
                              </span>
                              <span>•</span>
                              <span>{distance.toLocaleString()} km away</span>
                              {geometry?.magnitudeValue && (
                                <>
                                  <span>•</span>
                                  <span>{geometry.magnitudeValue.toLocaleString()} {geometry.magnitudeUnit}</span>
                                </>
                              )}
                            </div>
                            {geometry?.date && (
                              <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>
                                Updated: {new Date(geometry.date).toLocaleDateString()} {new Date(geometry.date).toLocaleTimeString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {eonetEvents.length > 20 && (
                  <div style={{ marginTop: 8, fontSize: 10, color: "var(--muted2)", textAlign: "center" }}>
                    Showing 20 of {eonetEvents.length} events
                  </div>
                )}
              </div>
            )}

            {/* Info Box */}
            <div style={{ marginTop: 16, padding: 12, background: "rgba(255,100,100,0.08)", border: "1px solid rgba(255,100,100,0.15)", borderRadius: 2 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                💡 <strong>About:</strong> NASA EONET provides near real-time natural event data. Events are updated every 30 minutes. Click on map markers for details.
              </div>
            </div>
          </div>
        )}

        {/* ── AI Risk Analysis Tab ── */}
        {sidebarTab === "ai-risk" && roleConfig?.canSeeLayers && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              🤖 AI-Powered Risk Analysis
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
              Machine learning model predicts landslide and flood risks based on terrain, weather, and historical data
            </div>

            {/* Model Status */}
            <div style={{ marginBottom: 16, padding: 12, background: aiRiskTrained ? "rgba(61,155,95,0.08)" : aiRiskLoading ? "rgba(255,215,0,0.08)" : "rgba(255,215,0,0.08)", border: `1px solid ${aiRiskTrained ? "rgba(61,155,95,0.15)" : aiRiskLoading ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.15)"}`, borderRadius: 2 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                Model Status
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                {aiRiskLoading ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--seed)", animation: "pulse 1.5s infinite" }} />
                    Auto-training model... (50 epochs)
                  </span>
                ) : aiRiskTrained ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--seed)" }} />
                    Model trained and ready (2000 samples)
                  </span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--seed)" }} />
                    Initializing...
                  </span>
                )}
              </div>
            </div>

            {/* Manual Train Button (only if auto-train failed) */}
            {!aiRiskTrained && !aiRiskLoading && (
              <div style={{ marginBottom: 16 }}>
                <button
                  onClick={async () => {
                    setAiRiskLoading(true);
                    try {
                      const { TerrainRiskModel, generateSyntheticTrainingData } = await import('../lib/ml-risk');
                      const model = new TerrainRiskModel();
                      const trainingData = generateSyntheticTrainingData(2000);
                      await model.train(trainingData, 50);
                      await model.saveModel('luisiana-risk-model');
                      setAiRiskModel(model);
                      setAiRiskTrained(true);
                      alert('✅ Model trained successfully!');
                    } catch (error) {
                      console.error('Training failed:', error);
                      alert('❌ Training failed. Check console for details.');
                    } finally {
                      setAiRiskLoading(false);
                    }
                  }}
                  style={{
                    width: "100%",
                    cursor: "pointer",
                    padding: "12px",
                    borderRadius: 2,
                    background: "rgba(36,92,58,0.20)",
                    border: "1px solid rgba(36,92,58,0.40)",
                    color: "var(--ink)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  🚀 Retry Training
                </button>
              </div>
            )}

            {/* Enable/Disable Toggle */}
            {aiRiskTrained && (
              <div className="toggleRow" style={{ marginBottom: 16 }}>
                <div>
                  <label>Enable Risk Visualization</label>
                  <div className="hint">Show AI predictions on map</div>
                </div>
                <div
                  className={`switch ${aiRiskEnabled ? "on" : ""}`}
                  role="switch"
                  aria-checked={aiRiskEnabled}
                  onClick={() => setAiRiskEnabled(!aiRiskEnabled)}
                />
              </div>
            )}

            {/* Risk Statistics */}
            {aiRiskEnabled && aiRiskPredictions.length > 0 && (
              <div style={{ marginBottom: 16, padding: 12, background: "rgba(36,92,58,0.08)", border: "1px solid rgba(36,92,58,0.15)", borderRadius: 2 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  Risk Analysis Summary
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {(() => {
                    const safe = aiRiskPredictions.filter(p => p.riskLevel === 'SAFE').length;
                    const low = aiRiskPredictions.filter(p => p.riskLevel === 'LOW').length;
                    const moderate = aiRiskPredictions.filter(p => p.riskLevel === 'MODERATE').length;
                    const high = aiRiskPredictions.filter(p => p.riskLevel === 'HIGH').length;
                    const critical = aiRiskPredictions.filter(p => p.riskLevel === 'CRITICAL').length;
                    const total = aiRiskPredictions.length;

                    return (
                      <>
                        <div style={{ fontSize: 11 }}>
                          <span style={{ color: "var(--seed)" }}>🟢 Safe:</span>
                          <span style={{ color: "var(--ink-soft)", marginLeft: 6 }}>
                            {((safe / total) * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div style={{ fontSize: 11 }}>
                          <span style={{ color: "#90ee90" }}>🟡 Low:</span>
                          <span style={{ color: "var(--ink-soft)", marginLeft: 6 }}>
                            {((low / total) * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div style={{ fontSize: 11 }}>
                          <span style={{ color: "var(--seed)" }}>🟡 Moderate:</span>
                          <span style={{ color: "var(--ink-soft)", marginLeft: 6 }}>
                            {((moderate / total) * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div style={{ fontSize: 11 }}>
                          <span style={{ color: "#ffa500" }}>🟠 High:</span>
                          <span style={{ color: "var(--ink-soft)", marginLeft: 6 }}>
                            {((high / total) * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div style={{ fontSize: 11, gridColumn: "1 / -1" }}>
                          <span style={{ color: "#ff4d4f" }}>🔴 Critical:</span>
                          <span style={{ color: "var(--ink-soft)", marginLeft: 6 }}>
                            {((critical / total) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Features Info */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                📊 Analysis Features
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, color: "var(--muted)" }}>
                <div>✓ Terrain slope and elevation</div>
                <div>✓ Rainfall and soil moisture</div>
                <div>✓ Vegetation density</div>
                <div>✓ Distance to water bodies</div>
                <div>✓ Historical disaster data</div>
                <div>✓ Real-time weather integration</div>
              </div>
            </div>

            {/* Info Box */}
            <div style={{ marginTop: 16, padding: 12, background: "rgba(36,92,58,0.08)", border: "1px solid rgba(36,92,58,0.15)", borderRadius: 2 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                💡 <strong>About:</strong> AI model uses deep learning to predict landslide and flood risks. Predictions are probabilistic and should be used as decision support, not sole determinant.
              </div>
            </div>
          </div>
        )}

        </div>
        {/* End Tab Content */}

        {currentRole === "Negosyo Center" && (
          <div className="card" style={{ marginTop: 12, borderColor: "rgba(255,214,102,0.2)" }}>
            <div style={{ fontSize: 12, color: "var(--muted2)", lineHeight: 1.5 }}>
              The map shows the Luisiana area. Your dashboard above is focused on business permit processing.
            </div>
          </div>
        )}
      </aside>
      </>}
      
      {/* Placement Modal - Enter Building Details */}
      {showPlacementModal && pendingPlacement && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--overlay)",
            backdropFilter: "none",
          }}
          onClick={() => {
            setShowPlacementModal(false);
            setPendingPlacement(null);
          }}
        >
          <div
            style={{
              background: "var(--cream)",
              border: "3px solid var(--ink)",
              borderRadius: 0,
              padding: "24px 28px",
              maxWidth: 500,
              width: "90%",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "8px 8px 0 var(--shadow-accent)",
              color: "var(--ink)",
              position: "relative",
              fontFamily: '"Chakra Petch", sans-serif',
            }}
            className="modal-content-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => {
                setShowPlacementModal(false);
                setPendingPlacement(null);
              }}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                cursor: "pointer",
                background: "none",
                border: "none",
                color: "var(--muted)",
                fontSize: 24,
                padding: 0,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Close (ESC)"
            >
              ×
            </button>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3, marginBottom: 4 }}>
                Place New Infrastructure
              </h2>
              <div style={{ fontSize: 12, color: "var(--muted2)" }}>
                Enter building details before placing on map
              </div>
            </div>

            {/* Form Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Project Name */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Project Name *
                </label>
                <input
                  type="text"
                  value={modalProjectName}
                  onChange={(e) => setModalProjectName(e.target.value)}
                  placeholder="e.g. Barangay Hall Phase 2"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    color: "var(--ink)",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>

              {/* Type */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Project Type *
                </label>
                <select
                  value={modalProjectType}
                  onChange={(e) => setModalProjectType(e.target.value as any)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    color: "var(--ink)",
                    fontSize: 14,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="Municipal Project">Municipal Project</option>
                  <option value="Private Building">Private Building</option>
                  <option value="Agricultural Structure">Agricultural Structure</option>
                </select>
              </div>

              {/* Department */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Department *
                </label>
                <select
                  value={modalDepartment}
                  onChange={(e) => setModalDepartment(e.target.value as any)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    color: "var(--ink)",
                    fontSize: 14,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="MPDC">MPDC</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Agriculture">Agriculture</option>
                  <option value="Negosyo Center">Negosyo Center</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Status *
                </label>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value as any)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    color: "var(--ink)",
                    fontSize: 14,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="Planned">Planned</option>
                  <option value="Ongoing">Ongoing</option>
                  <option value="Delayed">Delayed</option>
                  <option value="Completed">Completed</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>

              {/* Progress */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Progress: {modalProgress}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={modalProgress}
                  onChange={(e) => setModalProgress(Number(e.target.value))}
                  style={{
                    width: "100%",
                    cursor: "pointer",
                  }}
                />
              </div>

              {/* Timeline & budget */}
              <div className="grid2" style={{ gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={modalStartDate}
                    onChange={(e) => setModalStartDate(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 0, border: "1px solid var(--stroke)", background: "var(--cream-deep)", fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                    Target End
                  </label>
                  <input
                    type="date"
                    value={modalTargetEndDate}
                    onChange={(e) => setModalTargetEndDate(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 0, border: "1px solid var(--stroke)", background: "var(--cream-deep)", fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Budget Total (PHP, optional)
                </label>
                <input
                  type="number"
                  min={0}
                  value={modalBudgetTotal}
                  onChange={(e) => setModalBudgetTotal(e.target.value)}
                  placeholder="e.g. 1500000"
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 0, border: "1px solid var(--stroke)", background: "var(--cream-deep)", fontSize: 13 }}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
                  Description (Optional)
                </label>
                <textarea
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                  placeholder="Enter project description..."
                  rows={3}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 0,
                    border: "1px solid var(--stroke)",
                    background: "var(--cream-deep)",
                    color: "var(--ink)",
                    fontSize: 13,
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Location Info */}
              <div style={{ padding: "10px 12px", background: "var(--cream-ink)", border: "1px solid var(--stroke2)", borderRadius: 0 }}>
                <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Location
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>
                  {pendingPlacement.lat.toFixed(6)}°N, {pendingPlacement.lng.toFixed(6)}°E
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
              <button
                onClick={() => {
                  setShowPlacementModal(false);
                  setPendingPlacement(null);
                }}
                style={{
                  flex: 1,
                  cursor: "pointer",
                  padding: "11px 0",
                  borderRadius: 2,
                  background: "var(--cream-deep)",
                  border: "1px solid var(--stroke)",
                  color: "var(--muted)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePlaceBuilding}
                disabled={!modalProjectName.trim()}
                style={{
                  flex: 1,
                  cursor: modalProjectName.trim() ? "pointer" : "not-allowed",
                  padding: "11px 0",
                  borderRadius: 2,
                  background: modalProjectName.trim()
                    ? "var(--seed)"
                    : "var(--cream-ink)",
                  border: modalProjectName.trim()
                    ? "2px solid var(--ink)"
                    : "1px solid var(--stroke)",
                  color: modalProjectName.trim() ? "var(--ink)" : "var(--muted2)",
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: '"Chakra Petch", sans-serif',
                  boxShadow: modalProjectName.trim() ? "4px 4px 0 var(--ink)" : "none",
                  opacity: modalProjectName.trim() ? 1 : 0.6,
                }}
              >
                Place Building
              </button>
            </div>
          </div>
        </div>
      )}

      {cookieConsent === "pending" && (
        <div className="cookie-banner-overlay">
          <div className="cookie-banner">
            <div className="cookie-banner-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="8" cy="9" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="14" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="10" cy="14" r="1" fill="currentColor" stroke="none" />
                <circle cx="15.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
                <circle cx="13" cy="16" r="0.8" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div className="cookie-banner-text">
              <strong>Cookie Notice</strong>
              <p>
                INFA-TRACK uses cookies to keep you signed in and remember your preferences.
                By accepting, you allow us to store session data on your browser.
              </p>
            </div>
            <div className="cookie-banner-actions">
              <button type="button" className="cookie-btn-accept" onClick={handleCookieAccept}>
                Accept Cookies
              </button>
              <button type="button" className="cookie-btn-decline" onClick={handleCookieDecline}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

