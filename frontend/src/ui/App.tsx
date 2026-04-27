import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DeckGLOverlay } from "./DeckOverlay";
import type { AlertItem, HeatPoint, Project, RiskZones, WeatherSnapshot } from "../types";
import { connectRealtime } from "../lib/realtime";
import { buildHeatmapPoints, type BBox, type HeatmapMetric } from "../lib/heatmap";
import { fetchRadarFrames, radarTileUrl, formatRadarTime, type RadarColorScheme, type RadarFrame, RADAR_COLOR_SCHEMES } from "../lib/radar";
import { formatGibsDate, gibsWmtsTileUrl, type GibsLayerId } from "../lib/gibs";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || "http://localhost:4000";

// OpenFreeMap Liberty — free vector tiles with OSM building footprints + heights.
// No API key needed. Buildings have render_height / render_min_height properties.
const VECTOR_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

type LayerToggles = {
  satellite: boolean;
  terrain: boolean;
  heatmap: boolean;
  weather: boolean;
  radar: boolean;
  gibsPrecip: boolean;
  risk: boolean;
  projects: boolean;
  stormTrack: boolean;
};

const DEFAULT_TOGGLES: LayerToggles = {
  satellite: false,
  terrain: false,
  heatmap: false,
  weather: false,
  radar: true,
  gibsPrecip: false,
  risk: true,
  projects: true,
  stormTrack: false,
};

const CENTER = { lat: 14.19, lon: 121.51, zoom: 11.4 };
// Operational focus (approx): Luisiana, Laguna
// This keeps the experience LGU-focused (staff won’t accidentally pan to other provinces).
const LUISIANA_BOUNDS: [[number, number], [number, number]] = [
  [121.43, 14.12], // [west, south]
  [121.61, 14.27], // [east, north]
];

function levelColor(level: "LOW" | "MODERATE" | "HIGH") {
  if (level === "HIGH") return "rgba(255, 77, 79, 0.55)";
  if (level === "MODERATE") return "rgba(255, 214, 102, 0.45)";
  return "rgba(92, 219, 149, 0.30)";
}

function formatAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}

function footprintSquare(lon: number, lat: number, halfSizeMeters: number) {
  const dLat = halfSizeMeters / 111320;
  const dLon = halfSizeMeters / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ];
}

function buildRadarLayers(
  map: MapLibreMap,
  radarHost: string,
  frames: RadarFrame[],
  colorScheme: RadarColorScheme,
  frameIdx: number,
  visible: boolean,
  opacity: number
) {
  // Tear down any existing radar layers/sources first.
  for (let i = 0; i < 20; i++) {
    if (map.getLayer(`radar-${i}`)) map.removeLayer(`radar-${i}`);
    if (map.getSource(`radar-src-${i}`)) map.removeSource(`radar-src-${i}`);
  }

  // Insert right above the OSM base layer — radar is the bottom-most overlay.
  // Everything else (GIBS, risk zones, projects) renders on top.
  const beforeLayer = map.getLayer("gibs-imerg-layer") ? "gibs-imerg-layer" : (map.getLayer("risk-fill") ? "risk-fill" : undefined);

  for (let i = 0; i < frames.length; i++) {
    const tileUrl = radarTileUrl(radarHost, frames[i].path, colorScheme);
    map.addSource(`radar-src-${i}`, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 12,
    } as any);
    map.addLayer(
      {
        id: `radar-${i}`,
        type: "raster",
        source: `radar-src-${i}`,
        paint: {
          "raster-opacity": visible && i === frameIdx ? opacity : 0,
          "raster-resampling": "linear",
        },
      } as any,
      beforeLayer
    );
  }
}

export default function App() {
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);

  const [connected, setConnected] = useState(false);
  const [toggles, setToggles] = useState<LayerToggles>(DEFAULT_TOGGLES);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>([]);
  const [riskZones, setRiskZones] = useState<RiskZones | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [heatMetric, setHeatMetric] = useState<HeatmapMetric>("combined");
  const [viewport, setViewport] = useState<{ bbox: BBox; zoom: number } | null>(null);
  const [radarHost, setRadarHost] = useState<string | null>(null);
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [radarFrameIdx, setRadarFrameIdx] = useState(0);
  const [radarPlaying, setRadarPlaying] = useState(true);
  const [radarColorScheme, setRadarColorScheme] = useState<RadarColorScheme>(6);
  const [radarOpacity, setRadarOpacity] = useState(0.9);
  const [gibsLayer, setGibsLayer] = useState<GibsLayerId>("IMERG_Precipitation_Rate");
  const [gibsDate, setGibsDate] = useState(() => {
    // GIBS layers often lag “today” availability. Default to yesterday (UTC) to avoid 404 tiles.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return formatGibsDate(d);
  });
  const [gibsOpacity, setGibsOpacity] = useState(0.62);
  const [gibsStatus, setGibsStatus] = useState<"loading" | "ok" | "unavailable">("loading");

  const topRisk = useMemo(() => {
    const feats = riskZones?.features || [];
    const high = feats.filter((f) => f.properties.level === "HIGH");
    if (high.length) return { level: "HIGH" as const, count: high.length };
    const mod = feats.filter((f) => f.properties.level === "MODERATE");
    if (mod.length) return { level: "MODERATE" as const, count: mod.length };
    return { level: "LOW" as const, count: feats.length ? feats.length : 0 };
  }, [riskZones]);

  const radarStateRef = useRef<{ host: string; frames: RadarFrame[]; colorScheme: RadarColorScheme } | null>(null);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: VECTOR_STYLE_URL,
      center: [CENTER.lon, CENTER.lat],
      zoom: CENTER.zoom,
      pitch: 50,
      bearing: -12,
      attributionControl: false,
      maxBounds: LUISIANA_BOUNDS,
    });

    mapRef.current = map;

    const pushViewport = () => {
      const b = map.getBounds();
      setViewport({
        bbox: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
        zoom: map.getZoom(),
      });
    };

    map.on("load", () => {
      pushViewport();

      // ── 3D Buildings (Apple Maps style) ──────────────────────────────────
      // OpenFreeMap Liberty already has a "building" source layer with
      // render_height and render_min_height. We add our own fill-extrusion
      // on top with warm beige colors.

      // Remove the default flat building fill from Liberty style if present
      if (map.getLayer("building")) map.removeLayer("building");
      if (map.getLayer("building-top")) map.removeLayer("building-top");

      // All OSM buildings — warm beige like Apple Maps
      map.addLayer({
        id: "3d-buildings",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 12,
        paint: {
          "fill-extrusion-color": [
            "interpolate", ["linear"], ["get", "render_height"],
            0,   "#e8dcc8",
            10,  "#ddd0b8",
            30,  "#d4c8ae",
            80,  "#c8bca0",
            200, "#b8ac90",
          ],
          "fill-extrusion-height": [
            "interpolate", ["linear"], ["zoom"],
            12, 0,
            13, ["coalesce", ["get", "render_height"], 6],
          ],
          "fill-extrusion-base": [
            "coalesce", ["get", "render_min_height"], 0,
          ],
          "fill-extrusion-opacity": 0.92,
          "fill-extrusion-ambient-occlusion-intensity": 0.4,
          "fill-extrusion-ambient-occlusion-radius": 3,
        },
      } as any);

      // Project buildings — highlighted in blue/orange on top of OSM buildings
      map.addSource("project-footprints", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "project-buildings-3d",
        type: "fill-extrusion",
        source: "project-footprints",
        paint: {
          "fill-extrusion-color": [
            "match", ["get", "status"],
            "Completed", "#4a90d9",
            "Ongoing",   "#f5a623",
            "Planning",  "#9b9b9b",
            "#4a90d9",
          ],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.95,
          "fill-extrusion-ambient-occlusion-intensity": 0.5,
          "fill-extrusion-ambient-occlusion-radius": 4,
        },
      } as any);

      // Project label dots
      map.addLayer({
        id: "project-labels",
        type: "circle",
        source: "project-footprints",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match", ["get", "status"],
            "Completed", "#4a90d9",
            "Ongoing",   "#f5a623",
            "Planning",  "#9b9b9b",
            "#4a90d9",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // ── Satellite imagery source (ESRI World Imagery — free, no API key) ──
      map.addSource("satellite", {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© Esri, Maxar, Earthstar Geographics",
      });
      map.addLayer(
        {
          id: "satellite-layer",
          type: "raster",
          source: "satellite",
          paint: { "raster-opacity": DEFAULT_TOGGLES.satellite ? 1 : 0 },
        } as any,
        "gibs-imerg-layer" // just above GIBS, below buildings
      );

      // ── Terrain (Terrarium RGB DEM — free, no API key, from AWS) ──────────
      map.addSource("terrain-dem", {
        type: "raster-dem",
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 15,
        encoding: "terrarium",
      } as any);
      // Terrain is applied via setTerrain — not a layer.
      // We enable/disable it via the toggle effect below.
      map.addSource("gibs-imerg", {
        type: "raster",
        tiles: [gibsWmtsTileUrl({ layer: gibsLayer, date: gibsDate })],
        tileSize: 256,
        maxzoom: 6,
      } as any);
      map.addLayer(
        {
          id: "gibs-imerg-layer",
          type: "raster",
          source: "gibs-imerg",
          paint: { "raster-opacity": DEFAULT_TOGGLES.gibsPrecip ? gibsOpacity : 0 },
        } as any,
        "3d-buildings"  // insert below buildings
      );

      // Risk zones
      map.addSource("riskZones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "risk-fill",
        type: "fill",
        source: "riskZones",
        paint: {
          "fill-color": [
            "match", ["get", "level"],
            "HIGH",     "rgba(255,77,79,0.35)",
            "MODERATE", "rgba(255,214,102,0.28)",
            "LOW",      "rgba(92,219,149,0.15)",
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

      if (radarStateRef.current) {
        buildRadarLayers(map, radarStateRef.current.host, radarStateRef.current.frames, radarStateRef.current.colorScheme, 0, DEFAULT_TOGGLES.radar, 0.9);
      }
    });

    map.on("moveend", pushViewport);

    return () => {
      map.off("moveend", pushViewport);
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
      maxzoom: 6,
    } as any);

    // Add above base map; below vectors if present.
    map.addLayer(
      {
        id: "gibs-imerg-layer",
        type: "raster",
        source: "gibs-imerg",
        paint: { "raster-opacity": visible ? opacity : 0 },
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

  // Load radar frames from RainViewer API.
  useEffect(() => {
    let cancelled = false;
    fetchRadarFrames()
      .then(({ host, frames }) => {
        if (cancelled) return;
        setRadarHost(host);
        setRadarFrames(frames);
        // Store in ref so the map load handler can access it if map loads after fetch.
        radarStateRef.current = { host, frames, colorScheme: radarColorScheme };
        // If map is already loaded, build layers now.
        const map = mapRef.current;
        if (map && map.isStyleLoaded()) {
          buildRadarLayers(map, host, frames, radarColorScheme, 0, DEFAULT_TOGGLES.radar, 0.9);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRadarHost(null);
        setRadarFrames([]);
      });
    return () => { cancelled = true; };
  }, []);

  // Animate radar by cycling frame index.
  useEffect(() => {
    if (!toggles.radar || !radarPlaying) return;
    if (!radarFrames.length) return;
    const t = setInterval(() => {
      setRadarFrameIdx((i) => (i + 1) % radarFrames.length);
    }, 650);
    return () => clearInterval(t);
  }, [toggles.radar, radarPlaying, radarFrames.length]);

  // Rebuild radar layers when color scheme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!radarHost || !radarFrames.length) return;
    radarStateRef.current = { host: radarHost, frames: radarFrames, colorScheme: radarColorScheme };
    buildRadarLayers(map, radarHost, radarFrames, radarColorScheme, radarFrameIdx, toggles.radar, radarOpacity);
  }, [radarColorScheme]);

  // Update frame visibility (fast path — no layer rebuild).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (let i = 0; i < radarFrames.length; i++) {
      if (!map.getLayer(`radar-${i}`)) continue;
      map.setPaintProperty(`radar-${i}`, "raster-opacity", toggles.radar && i === radarFrameIdx ? radarOpacity : 0);
    }
  }, [radarFrameIdx, toggles.radar, radarOpacity, radarFrames.length]);

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
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getLayer("satellite-layer")) return;
    // Fade in/out via opacity so the transition is smooth
    map.setPaintProperty("satellite-layer", "raster-opacity", toggles.satellite ? 1 : 0);
    // When satellite is on, dim the 3D buildings slightly so imagery shows through
    if (map.getLayer("3d-buildings")) {
      map.setPaintProperty("3d-buildings", "fill-extrusion-opacity", toggles.satellite ? 0.55 : 0.92);
    }
  }, [toggles.satellite]);

  // Terrain (3D elevation) toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getSource("terrain-dem")) return;
    if (toggles.terrain) {
      (map as any).setTerrain({ source: "terrain-dem", exaggeration: 2.5 });
      // Increase pitch for dramatic terrain view
      map.easeTo({ pitch: 65, duration: 600 });
    } else {
      (map as any).setTerrain(null);
      map.easeTo({ pitch: 50, duration: 600 });
    }
  }, [toggles.terrain]);

  // Push project footprints to the 3D highlighted buildings layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("project-footprints") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features = (toggles.projects ? projects : []).map((p) => {
      // Building footprint size by type
      const hw = p.type === "Municipal Project" ? 0.0007 :
                 p.type === "Agricultural Structure" ? 0.0005 : 0.0003;
      const hd = p.type === "Municipal Project" ? 0.00015 :
                 p.type === "Agricultural Structure" ? 0.0004 : 0.0003;
      const { lon, lat } = p.location;
      const height = p.type === "Municipal Project" ? 4 :
                     p.type === "Agricultural Structure" ? 12 :
                     p.status === "Completed" ? 40 :
                     p.status === "Ongoing" ? Math.max(8, (p.progress / 100) * 40) : 8;
      return {
        type: "Feature" as const,
        properties: { id: p.id, name: p.name, status: p.status, height },
        geometry: {
          type: "Polygon" as const,
          coordinates: [[
            [lon - hw, lat - hd],
            [lon + hw, lat - hd],
            [lon + hw, lat + hd],
            [lon - hw, lat + hd],
            [lon - hw, lat - hd],
          ]],
        },
      };
    });

    src.setData({ type: "FeatureCollection", features });
    if (map.getLayer("project-buildings-3d"))
      map.setLayoutProperty("project-buildings-3d", "visibility", toggles.projects ? "visible" : "none");
    if (map.getLayer("project-labels"))
      map.setLayoutProperty("project-labels", "visibility", toggles.projects ? "visible" : "none");
  }, [projects, toggles.projects]);

  const riskSummary = useMemo(() => {
    const feats = riskZones?.features || [];
    const high = feats.filter((f) => f.properties.level === "HIGH").length;
    const mod = feats.filter((f) => f.properties.level === "MODERATE").length;
    const low = feats.filter((f) => f.properties.level === "LOW").length;
    return { high, mod, low, total: feats.length };
  }, [riskZones]);

  const projectSummary = useMemo(() => {
    const ongoing = projects.filter((p) => p.status === "Ongoing").length;
    const completed = projects.filter((p) => p.status === "Completed").length;
    const planning = projects.filter((p) => p.status === "Planning").length;
    return { ongoing, completed, planning, total: projects.length };
  }, [projects]);

  return (
    <div className="appShell">
      <div className="mapWrap">
        <div className="map" ref={mapDivRef} />

        <DeckGLOverlay
          map={mapRef.current}
          enabledHeatmap={toggles.heatmap && !toggles.gibsPrecip}
          heatPoints={heatPoints}
          enabledWeather={toggles.weather}
          weather={weather}
        />

        <div className="topBar">
          <div>
            <div className="brand">IMPACT-Luisiana</div>
            <div className="sub">Real-Time GIS Infrastructure & Disaster Monitoring</div>
          </div>
          <div className="grow" />
          <div className="chip">
            <span className="dot" style={{ background: connected ? "var(--accent)" : "rgba(255,77,79,0.9)" }} />
            {connected ? "Live" : "Disconnected"}
          </div>
          <div className="chip">
            Risk:{" "}
            <span style={{ color: topRisk.level === "HIGH" ? "var(--danger)" : topRisk.level === "MODERATE" ? "var(--warn)" : "var(--safe)" }}>
              {topRisk.level}
            </span>
          </div>
          <div className="chip">Updates: 5s</div>
        </div>

        {!MAPBOX_TOKEN ? (
          <div style={{ position: "absolute", left: 14, bottom: 14, maxWidth: 520 }} className="card">
            <div className="sectionTitle">OpenFreeMap — Vector Tiles</div>
            <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.35 }}>
              3D buildings from OpenStreetMap via OpenFreeMap (free, no API key).
              Add <span className="pill">VITE_MAPBOX_TOKEN</span> in <span className="pill">frontend/.env</span> for Mapbox basemaps.
            </div>
          </div>
        ) : null}
      </div>

      <aside className="sidePanel">
        <div className="sectionTitle">Live Situation Panel</div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="sectionTitle" style={{ marginBottom: 8 }}>
            Weather — ECMWF IFS
          </div>
          <div className="grid2">
            <div className="stat">
              <div className="v">{weather ? `${weather.temperatureC}°C` : "—"}</div>
              <div className="l">Temperature</div>
            </div>
            <div className="stat">
              <div className="v">{weather ? `${weather.rainfallMm} mm` : "—"}</div>
              <div className="l">Rainfall</div>
            </div>
            <div className="stat">
              <div className="v">{weather ? `${weather.windSpeedMps} m/s` : "—"}</div>
              <div className="l">Wind Speed</div>
            </div>
            <div className="stat">
              <div className="v">{weather ? `${weather.cloudinessPct}%` : "—"}</div>
              <div className="l">Cloud Cover</div>
            </div>
            <div className="stat">
              <div className="v">{weather ? `${weather.humidityPct ?? "—"}%` : "—"}</div>
              <div className="l">Humidity</div>
            </div>
            <div className="stat">
              <div className="v">{weather ? `${weather.pressureHpa ?? "—"} hPa` : "—"}</div>
              <div className="l">Pressure</div>
            </div>
          </div>
          <div style={{ marginTop: 8, color: "var(--muted2)", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>Source: {weather?.source ?? "—"}</span>
            <span>Updated: {weather ? formatAgo(weather.observedAt) : "—"}</span>
          </div>

          {/* 6-hour ECMWF forecast — key for infrastructure safety decisions */}
          {weather?.forecast?.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                6-Hour Forecast (ECMWF)
              </div>
              <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
                {weather.forecast.map((f) => {
                  const rainColor = f.rainfallMm > 10 ? "var(--danger)" : f.rainfallMm > 3 ? "var(--warn)" : "var(--safe)";
                  return (
                    <div key={f.hour} style={{
                      flex: "0 0 auto",
                      minWidth: 52,
                      border: "1px solid var(--stroke2)",
                      borderRadius: 10,
                      padding: "6px 5px",
                      background: "rgba(0,0,0,0.12)",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: 10, color: "var(--muted2)", marginBottom: 3 }}>+{f.hour}h</div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{f.temperatureC}°</div>
                      <div style={{ fontSize: 11, color: rainColor, marginTop: 2 }}>{f.rainfallMm}mm</div>
                      <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{f.windSpeedMps}m/s</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted2)" }}>
                {(() => {
                  const maxRain = Math.max(...(weather.forecast.map(f => f.rainfallMm)));
                  if (maxRain > 10) return "⚠️ Heavy rain forecast — review construction schedules";
                  if (maxRain > 3)  return "🌧 Moderate rain expected — monitor drainage";
                  return "✅ Conditions favorable for outdoor infrastructure work";
                })()}
              </div>
            </div>
          ) : null}
        </div>

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
              { k: "risk", title: "Landslide Risk Zones", hint: "Green/Yellow/Red polygons" },
              { k: "stormTrack", title: "Storm Tracking", hint: "Drift line based on wind" },
              { k: "projects", title: "Infrastructure Projects", hint: "Markers with progress" },
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

          {/* Radar and GIBS are mutually exclusive precipitation layers */}
          <div className="toggleRow">
            <div>
              <label>Precipitation Radar</label>
              <div className="hint">Live animated radar — RainViewer (Windy-style)</div>
            </div>
            <div
              className={`switch ${toggles.radar ? "on" : ""}`}
              role="switch"
              aria-checked={toggles.radar}
              onClick={() => setToggles((t) => ({ ...t, radar: !t.radar, gibsPrecip: t.radar ? t.gibsPrecip : false }))}
            />
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
              onClick={() => setToggles((t) => ({ ...t, gibsPrecip: !t.gibsPrecip, radar: t.gibsPrecip ? t.radar : false }))}
            />
          </div>

          <div className="toggleRow" style={{ alignItems: "flex-start" }}>
            <div>
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
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: heatMetric === k ? "rgba(25,195,125,0.16)" : "rgba(0,0,0,0.12)",
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ minWidth: 86, textAlign: "right" }}>
              <span className="pill">Blue→Red</span>
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

          <div className="toggleRow" style={{ alignItems: "flex-start" }}>
            <div>
              <label>NASA GIBS Layer</label>
              <div className="hint">Worldview / GIBS precipitation tiles</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {(
                  [
                    ["IMERG_Precipitation_Rate", "IMERG Rate"],
                    ["IMERG_Precipitation_Rate_30min", "IMERG 30-min"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setGibsLayer(k)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: gibsLayer === k ? "rgba(88,160,255,0.16)" : "rgba(0,0,0,0.12)",
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                <span className="pill">Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={0.9}
                  step={0.02}
                  value={gibsOpacity}
                  onChange={(e) => setGibsOpacity(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                <span className="pill">Date</span>
                <input
                  type="date"
                  value={gibsDate}
                  onChange={(e) => setGibsDate(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.12)",
                    color: "rgba(255,255,255,0.85)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 10,
                    padding: "6px 10px",
                  }}
                />
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                Status:{" "}
                {gibsStatus === "ok"
                  ? "available"
                  : gibsStatus === "loading"
                    ? "checking availability…"
                    : "not available for this date (auto-fallback applied)"}
              </div>
            </div>
            <div style={{ minWidth: 86, textAlign: "right" }}>
              <span className="pill">GIBS</span>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted2)" }}>WMTS tiles</div>
            </div>
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

        {toggles.radar && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="sectionTitle" style={{ marginBottom: 8 }}>
              Radar Controls
            </div>
            {radarFrames.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                Loading radar frames...
              </div>
            ) : (
              <>
                {/* Playback row */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <button
                    onClick={() => setRadarPlaying(!radarPlaying)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 999,
                      padding: "6px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: radarPlaying ? "rgba(25,195,125,0.20)" : "rgba(88,160,255,0.16)",
                      color: "rgba(255,255,255,0.9)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {radarPlaying ? "⏸ Pause" : "▶ Play"}
                  </button>
                  <div style={{ flex: 1, textAlign: "right" }}>
                    <span className="pill" style={{ fontSize: 12 }}>
                      {formatRadarTime(radarFrames[radarFrameIdx]?.time ?? 0)}
                    </span>
                    <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 3 }}>
                      Frame {radarFrameIdx + 1} / {radarFrames.length}
                      {radarFrameIdx >= radarFrames.length - 3 ? " · Nowcast" : " · Past"}
                    </div>
                  </div>
                </div>

                {/* Seek scrubber */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <span className="pill" style={{ minWidth: 36 }}>Seek</span>
                  <input
                    type="range"
                    min={0}
                    max={radarFrames.length - 1}
                    value={radarFrameIdx}
                    onChange={(e) => { setRadarPlaying(false); setRadarFrameIdx(Number(e.target.value)); }}
                    style={{ width: "100%" }}
                  />
                </div>

                {/* Opacity slider */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <span className="pill" style={{ minWidth: 52 }}>Opacity</span>
                  <input
                    type="range"
                    min={0.2}
                    max={1.0}
                    step={0.05}
                    value={radarOpacity}
                    onChange={(e) => setRadarOpacity(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--muted2)", minWidth: 28, textAlign: "right" }}>
                    {Math.round(radarOpacity * 100)}%
                  </span>
                </div>

                {/* Color scheme picker */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Color Scheme</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {RADAR_COLOR_SCHEMES.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setRadarColorScheme(value)}
                        style={{
                          cursor: "pointer",
                          borderRadius: 999,
                          padding: "5px 10px",
                          fontSize: 11,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: radarColorScheme === value ? "rgba(255,140,60,0.22)" : "rgba(0,0,0,0.12)",
                          color: radarColorScheme === value ? "rgba(255,200,100,0.95)" : "rgba(255,255,255,0.7)",
                          fontWeight: radarColorScheme === value ? 600 : 400,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Radar legend */}
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    background: "linear-gradient(to right, #00aa00, #00ff00, #ffff00, #ff8800, #ff0000, #cc00cc)",
                  }} />
                  <div style={{ display: "flex", justifyContent: "space-between", width: "100%", position: "absolute", fontSize: 10, color: "var(--muted2)", marginTop: 14 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted2)", marginTop: 4 }}>
                  <span>Light</span>
                  <span>Moderate</span>
                  <span>Heavy</span>
                </div>
              </>
            )}
          </div>
        )}

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

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="sectionTitle" style={{ marginBottom: 8 }}>
            Infrastructure Snapshot
          </div>
          <div className="grid2">
            <div className="stat">
              <div className="v">{projectSummary.total}</div>
              <div className="l">Total Projects</div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "var(--accent)" }}>
                {projectSummary.ongoing}
              </div>
              <div className="l">Ongoing</div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "rgba(88, 160, 255, 0.95)" }}>
                {projectSummary.completed}
              </div>
              <div className="l">Completed</div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "rgba(160, 174, 192, 0.95)" }}>
                {projectSummary.planning}
              </div>
              <div className="l">Planning</div>
            </div>
          </div>

          <div style={{ marginTop: 10 }} className="miniList">
            {projects.slice(0, 4).map((p) => (
              <div key={p.id} className="proj">
                <div className="n">{p.name}</div>
                <div className="s">
                  <span>{p.department}</span>
                  <span>{p.status}</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${Math.max(0, Math.min(100, p.progress))}%` }} />
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted2)" }}>
                  Progress: {p.progress}% · Updated {formatAgo(p.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        </div>

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
      </aside>
    </div>
  );
}

