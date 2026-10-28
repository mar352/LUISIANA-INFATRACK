import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import maplibregl, { type Map as MapLibreMap, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./PublicTransparencyPortal.css";
import type { Project } from "../types";
import type { MapSettings } from "../lib/map-settings";
import {
  stadiaStyleUrl,
  STADIA_MAP_STYLES,
  type StadiaMapStyleId,
} from "../lib/stadia";
import type { CesiumMapHandle } from "./CesiumMap";
import { BARANGAY_COORDINATES } from "./PinpointMapPicker";
import { lookupBarangayCoords } from "../lib/barangay-overlay";
import {
  ensurePinImages,
  projectsToGeoJson,
} from "../lib/stadia-pins";
import { quakeHeatWeight } from "../lib/google-heatmap";
import { earthquakeProneModel, type EarthquakeGridCell } from "../lib/ml-earthquake";

export interface StadiaEngineerMapProps {
  projects: Project[];
  satellite?: boolean;
  mapSettings?: MapSettings;
  visible?: boolean;
  paused?: boolean;
  selectedProjectId?: string | null;
  onSelectSitePin?: (project: Project) => void;
  onPlaceClick?: (coords: { lon: number; lat: number }) => void;
  placementMode?: boolean;

  // Municipal overlays & analysis
  barangaysVisible?: boolean;
  focusedBarangay?: string | any | null;
  earthquakeEnabled?: boolean;
  earthquakeGrid?: EarthquakeGridCell[];

  // Compatibility props with CesiumMap
  terrainEnabled?: boolean;
  clusteringEnabled?: boolean;
  editMode?: boolean;
  placementTool?: any;
  placementColor?: string;
  onPlaceSketch?: any;
  readOnly?: boolean;
  canManipulateModels?: boolean;
  canPromoteSitePin?: boolean;
  onProjectPatch?: any;
  canAddPhotos?: boolean;
  onPhotosChange?: any;
  onDeleteBuilding?: any;
}

// Center coordinate for Luisiana, Laguna (Poblacion)
const LUISIANA_CENTER = { lon: 121.5089, lat: 14.1837 };

// Layer IDs
const SOURCE_BOUNDARY = "luisiana-boundary-source";
const LAYER_BOUNDARY_FILL = "luisiana-boundary-fill";
const LAYER_BOUNDARY_CASING = "luisiana-boundary-casing";
const LAYER_BOUNDARY_LINE = "luisiana-boundary-line";

const SOURCE_BARANGAYS = "luisiana-barangays-source";
const SOURCE_BARANGAY_LABELS = "luisiana-barangay-labels";
const LAYER_BARANGAYS_FILL = "luisiana-barangays-fill";
const LAYER_BARANGAYS_LINE = "luisiana-barangays-line";
const LAYER_BARANGAYS_LABEL = "luisiana-barangays-label";

const SOURCE_QUAKE = "earthquake-hazard-source";
const LAYER_QUAKE_HEATMAP = "earthquake-heatmap-layer";
const LAYER_QUAKE_POINTS = "earthquake-points-layer";

const SOURCE_PINS = "stadia-engineer-projects";
const PINS_LAYER_ID = "stadia-engineer-pins";
const GLOW_LAYER_ID = "stadia-engineer-glow";

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

// Pre-load GeoJSON assets immediately on client execution
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

export const StadiaEngineerMap = forwardRef<CesiumMapHandle, StadiaEngineerMapProps>(
  function StadiaEngineerMap(
    {
      projects,
      satellite,
      mapSettings,
      visible = true,
      paused = false,
      selectedProjectId,
      onSelectSitePin,
      onPlaceClick,
      placementMode = false,
      barangaysVisible = false,
      focusedBarangay = null,
      earthquakeEnabled = false,
      earthquakeGrid = [],
    },
    ref,
  ) {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const hoverPopupRef = useRef<Popup | null>(null);
    const [mapReady, setMapReady] = useState(false);

    // Resolve Stadia Maps style based on satellite toggle or mapSettings
    const currentStadiaStyle: StadiaMapStyleId = useMemo(() => {
      if (satellite) return "alidade_satellite";
      const base = mapSettings?.basemapStyle;
      if (base && STADIA_MAP_STYLES.some((s) => s.id === base)) {
        return base as StadiaMapStyleId;
      }
      return "outdoors";
    }, [satellite, mapSettings?.basemapStyle]);

    // Helper to validate and guarantee coordinates stay strictly within Luisiana
    const getProjectCoords = (p: Project | null): { lon: number; lat: number } | null => {
      if (!p) return null;

      const lon = Number(p.location?.lon);
      const lat = Number(p.location?.lat);
      const hasValidCoords = Number.isFinite(lon) && Number.isFinite(lat) && lon !== 0 && lat !== 0;

      // Check if coordinates legitimately fall within Luisiana municipal borders
      const isInsideLuisiana =
        hasValidCoords &&
        lat >= 14.14 &&
        lat <= 14.23 &&
        lon >= 121.46 &&
        lon <= 121.61;

      if (isInsideLuisiana) {
        return { lon, lat };
      }

      // If missing or outside Luisiana, resolve from official Barangay centroid
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

    const focusedName = useMemo(() => {
      if (!focusedBarangay) return "";
      return typeof focusedBarangay === "string" ? focusedBarangay : focusedBarangay?.name || "";
    }, [focusedBarangay]);

    // ── 1. SETUP LUISIANA MUNICIPAL BOUNDARY ──
    const syncBoundaryLayers = async (map: MapLibreMap) => {
      if (!map.isStyleLoaded()) return;

      if (!cachedBoundaryGeoJson) {
        try {
          const res = await fetch("/data/luisiana-boundary.geojson");
          if (res.ok) {
            cachedBoundaryGeoJson = (await res.json()) as GeoJSON.FeatureCollection;
          }
        } catch (err) {
          console.warn("[StadiaEngineerMap] Boundary fetch failed:", err);
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

      // 1. Subtle emerald tint inside Luisiana municipal boundary
      if (!map.getLayer(LAYER_BOUNDARY_FILL)) {
        map.addLayer({
          id: LAYER_BOUNDARY_FILL,
          type: "fill",
          source: SOURCE_BOUNDARY,
          paint: {
            "fill-color": "#10b981",
            "fill-opacity": 0.08,
          },
        });
      }

      // 2. High-contrast white casing for boundary
      if (!map.getLayer(LAYER_BOUNDARY_CASING)) {
        map.addLayer({
          id: LAYER_BOUNDARY_CASING,
          type: "line",
          source: SOURCE_BOUNDARY,
          paint: {
            "line-color": "#ffffff",
            "line-width": 6,
            "line-opacity": 0.8,
          },
        });
      }

      // 3. Crisp dark boundary perimeter line
      if (!map.getLayer(LAYER_BOUNDARY_LINE)) {
        map.addLayer({
          id: LAYER_BOUNDARY_LINE,
          type: "line",
          source: SOURCE_BOUNDARY,
          paint: {
            "line-color": "#0f172a",
            "line-width": 3.2,
            "line-opacity": 1.0,
          },
        });
      }
    };

    // ── 2. SETUP COLOR-CODED BARANGAY AREAS ──
    const syncBarangayLayers = async (map: MapLibreMap) => {
      if (!map.isStyleLoaded()) return;

      if (!cachedBarangayGeoJson) {
        try {
          const res = await fetch("/data/luisiana-barangays.geojson");
          if (res.ok) {
            const gj = (await res.json()) as GeoJSON.FeatureCollection;
            cachedBarangayGeoJson = gj;

            // Compute centroids for label placement
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
          console.warn("[StadiaEngineerMap] Barangays fetch failed:", err);
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

      const vis = barangaysVisible ? "visible" : "none";

      // Barangay fills with official color coding
      if (!map.getLayer(LAYER_BARANGAYS_FILL)) {
        map.addLayer({
          id: LAYER_BARANGAYS_FILL,
          type: "fill",
          source: SOURCE_BARANGAYS,
          layout: {
            visibility: vis,
          },
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": [
              "case",
              ["==", ["get", "name"], focusedName],
              0.80,
              0.45,
            ],
          },
        });
      } else {
        map.setLayoutProperty(LAYER_BARANGAYS_FILL, "visibility", vis);
        map.setPaintProperty(LAYER_BARANGAYS_FILL, "fill-opacity", [
          "case",
          ["==", ["get", "name"], focusedName],
          0.80,
          0.45,
        ]);
      }

      // Barangay boundary lines
      if (!map.getLayer(LAYER_BARANGAYS_LINE)) {
        map.addLayer({
          id: LAYER_BARANGAYS_LINE,
          type: "line",
          source: SOURCE_BARANGAYS,
          layout: {
            visibility: vis,
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": [
              "case",
              ["==", ["get", "name"], focusedName],
              4.0,
              2.0,
            ],
            "line-opacity": 0.95,
          },
        });
      } else {
        map.setLayoutProperty(LAYER_BARANGAYS_LINE, "visibility", vis);
        map.setPaintProperty(LAYER_BARANGAYS_LINE, "line-width", [
          "case",
          ["==", ["get", "name"], focusedName],
          4.0,
          2.0,
        ]);
      }

      // Barangay name labels
      if (cachedBarangayLabelsGeoJson && !map.getLayer(LAYER_BARANGAYS_LABEL)) {
        map.addLayer({
          id: LAYER_BARANGAYS_LABEL,
          type: "symbol",
          source: SOURCE_BARANGAY_LABELS,
          layout: {
            visibility: vis,
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
        });
      } else if (map.getLayer(LAYER_BARANGAYS_LABEL)) {
        map.setLayoutProperty(LAYER_BARANGAYS_LABEL, "visibility", vis);
      }
    };

    // ── 3. SETUP QUAKE HEAT (EARTHQUAKE HAZARD HEATMAP & RISK POINTS) ──
    const syncEarthquakeLayers = (map: MapLibreMap) => {
      if (!map.isStyleLoaded()) return;

      const hasQuakeData = Boolean(earthquakeEnabled);
      // Use earthquakeGrid if available, otherwise fallback to official PHIVOLCS points so there's never a delay
      const effectiveGrid: EarthquakeGridCell[] =
        earthquakeGrid.length > 0
          ? earthquakeGrid
          : earthquakeEnabled
            ? earthquakeProneModel.hazardMapPoints()
            : [];

      const quakeFeatures: GeoJSON.Feature[] = hasQuakeData
        ? effectiveGrid.map((c) => ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [c.lon, c.lat],
            },
            properties: {
              weight: quakeHeatWeight(c.cls, c.confidence),
              cls: c.cls,
              confidence: c.confidence,
              pga: (c as any).pga ?? (c as any).pgaG ?? 0,
            },
          }))
        : [];

      const quakeGeoJson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: quakeFeatures,
      };

      const existingSource = map.getSource(SOURCE_QUAKE) as maplibregl.GeoJSONSource | undefined;
      if (existingSource) {
        existingSource.setData(quakeGeoJson);
      } else {
        map.addSource(SOURCE_QUAKE, {
          type: "geojson",
          data: quakeGeoJson,
        });
      }

      const vis = hasQuakeData ? "visible" : "none";

      // Heatmap layer
      if (!map.getLayer(LAYER_QUAKE_HEATMAP)) {
        map.addLayer({
          id: LAYER_QUAKE_HEATMAP,
          type: "heatmap",
          source: SOURCE_QUAKE,
          layout: {
            visibility: vis,
          },
          paint: {
            "heatmap-weight": ["get", "weight"],
            "heatmap-intensity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12,
              1.2,
              15,
              2.5,
              18,
              4.0,
            ],
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(0, 0, 255, 0)",
              0.15,
              "rgba(59, 130, 246, 0.55)", // Blue (Low)
              0.35,
              "rgba(16, 185, 129, 0.75)", // Green (Moderate-Low)
              0.60,
              "rgba(245, 158, 11, 0.88)",  // Amber (Moderate)
              0.85,
              "rgba(239, 68, 68, 0.95)",   // Red (High)
              1.0,
              "rgba(185, 28, 28, 1.0)",    // Deep Red (Critical)
            ],
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12,
              25,
              15,
              50,
              18,
              85,
            ],
            "heatmap-opacity": 0.85,
          },
        });
      } else {
        map.setLayoutProperty(LAYER_QUAKE_HEATMAP, "visibility", vis);
      }

      // Inspection risk points at high zoom
      if (!map.getLayer(LAYER_QUAKE_POINTS)) {
        map.addLayer({
          id: LAYER_QUAKE_POINTS,
          type: "circle",
          source: SOURCE_QUAKE,
          minzoom: 14.2,
          layout: {
            visibility: vis,
          },
          paint: {
            "circle-radius": 4.5,
            "circle-color": [
              "match",
              ["get", "cls"],
              "HIGH",
              "#ef4444",
              "MODERATE",
              "#f59e0b",
              "LOW",
              "#10b981",
              "#3b82f6",
            ],
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.9,
          },
        });
      } else {
        map.setLayoutProperty(LAYER_QUAKE_POINTS, "visibility", vis);
      }
    };

    // ── 4. SETUP PROJECT PIN POINTERS VIA WEBGL ──
    const syncPinsData = (map: MapLibreMap) => {
      if (!map.isStyleLoaded()) return;
      ensurePinImages(map);

      const geojson = projectsToGeoJson(projects, selectedProjectId, getProjectCoords);
      const existingSource = map.getSource(SOURCE_PINS) as maplibregl.GeoJSONSource | undefined;

      if (existingSource) {
        existingSource.setData(geojson);
      } else {
        map.addSource(SOURCE_PINS, {
          type: "geojson",
          data: geojson,
        });
      }

      // Soft contact ground glow circle
      if (!map.getLayer(GLOW_LAYER_ID)) {
        map.addLayer({
          id: GLOW_LAYER_ID,
          type: "circle",
          source: SOURCE_PINS,
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

      // Razor-sharp WebGL teardrop pin pointer
      if (!map.getLayer(PINS_LAYER_ID)) {
        map.addLayer({
          id: PINS_LAYER_ID,
          type: "symbol",
          source: SOURCE_PINS,
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
      if (map.getLayer(GLOW_LAYER_ID)) {
        map.moveLayer(GLOW_LAYER_ID);
      }
      if (map.getLayer(PINS_LAYER_ID)) {
        map.moveLayer(PINS_LAYER_ID);
      }
    };

    // ── 5. INITIALIZE MAPLIBRE WITH STADIA MAPS API ──
    useEffect(() => {
      if (!mapContainerRef.current) return;
      if (mapRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: stadiaStyleUrl(currentStadiaStyle),
        center: [LUISIANA_CENTER.lon, LUISIANA_CENTER.lat],
        zoom: 14.2,
        minZoom: 12.8,
        maxZoom: 18.5,
        maxBounds: [
          [121.42, 14.10], // Southwest boundary strictly focused on Luisiana
          [121.63, 14.29], // Northeast boundary strictly focused on Luisiana
        ],
        pitch: 0,
        dragRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        attributionControl: false,
      });

      map.scrollZoom.enable();

      const hoverPopup = new Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -48],
        className: "ptp-stadia-hover-popup",
      });
      hoverPopupRef.current = hoverPopup;

      const initAllLayers = () => {
        void syncBoundaryLayers(map);
        void syncBarangayLayers(map);
        syncEarthquakeLayers(map);
        syncPinsData(map);
      };

      map.on("load", () => {
        initAllLayers();
        setMapReady(true);
      });

      map.on("style.load", () => {
        initAllLayers();
      });

      // Pin pointer click event (WebGL raycast pick)
      map.on("click", PINS_LAYER_ID, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const pid = feature.properties?.id;
        const p = projects.find((x) => x.id === pid);
        if (p) {
          onSelectSitePin?.(p);
        }
      });

      // Map canvas click for placement mode
      map.on("click", (e) => {
        if (placementMode && onPlaceClick) {
          onPlaceClick({ lon: e.lngLat.lng, lat: e.lngLat.lat });
        }
      });

      // Hover events: Show floating pill label badge
      map.on("mouseenter", PINS_LAYER_ID, (e) => {
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

      map.on("mouseleave", PINS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
        hoverPopup.remove();
      });

      mapRef.current = map;

      return () => {
        hoverPopup.remove();
        map.remove();
        mapRef.current = null;
        setMapReady(false);
      };
    }, []);

    // ── 6. DYNAMIC MAP RESIZE HANDLING ──
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
    }, [visible, paused]);

    // ── 7. UPDATE BASEMAP STYLE DYNAMICALLY (Avoid double reload on mount) ──
    const prevStyleRef = useRef<string>(currentStadiaStyle);
    useEffect(() => {
      if (!mapRef.current || !mapReady) return;
      if (prevStyleRef.current === currentStadiaStyle) return;
      prevStyleRef.current = currentStadiaStyle;
      mapRef.current.setStyle(stadiaStyleUrl(currentStadiaStyle));
    }, [currentStadiaStyle, mapReady]);

    // ── 8. UPDATE GEOJSON SOURCE WHEN PROJECTS OR SELECTION CHANGES ──
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      syncPinsData(map);
    }, [projects, selectedProjectId, mapReady]);

    // ── 9. DYNAMICALLY TOGGLE BARANGAYS OVERLAY & FOCUS ──
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      void syncBarangayLayers(map);
    }, [barangaysVisible, focusedName, mapReady]);

    // ── 10. DYNAMICALLY UPDATE EARTHQUAKE HAZARD HEATMAP ──
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      syncEarthquakeLayers(map);
    }, [earthquakeEnabled, earthquakeGrid, mapReady]);

    // ── 11. DYNAMICALLY ENSURE BOUNDARY REMAINS ACTIVE ──
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      void syncBoundaryLayers(map);
    }, [mapReady]);

    // ── 12. IMPLEMENT CESIUMMAPHANDLE FOR FULL SYSTEM COMPATIBILITY ──
    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => {
          mapRef.current?.zoomIn();
        },
        zoomOut: () => {
          mapRef.current?.zoomOut();
        },
        flyHome: () => {
          mapRef.current?.flyTo({
            center: [LUISIANA_CENTER.lon, LUISIANA_CENTER.lat],
            zoom: 14.2,
            pitch: 0,
            bearing: 0,
            duration: 1000,
          });
        },
        toggleTilt: () => {
          if (!mapRef.current) return;
          const currentPitch = mapRef.current.getPitch();
          mapRef.current.easeTo({
            pitch: currentPitch > 20 ? 0 : 50,
            duration: 600,
          });
        },
        setCameraInputsEnabled: (enabled: boolean) => {
          const map = mapRef.current;
          if (!map) return;
          if (enabled) {
            map.boxZoom.enable();
            map.scrollZoom.enable();
            map.dragPan.enable();
            map.dragRotate.enable();
            map.doubleClickZoom.enable();
            map.touchZoomRotate.enable();
          } else {
            map.boxZoom.disable();
            map.scrollZoom.disable();
            map.dragPan.disable();
            map.dragRotate.disable();
            map.doubleClickZoom.disable();
            map.touchZoomRotate.disable();
          }
        },
        flyToLonLat: (lon: number, lat: number, _heightM?: number) => {
          mapRef.current?.flyTo({
            center: [lon, lat],
            zoom: 16,
            essential: true,
            duration: 1000,
          });
        },
        flyToProject: (projectId: string) => {
          const p = projects.find((x) => x.id === projectId);
          if (!p || !mapRef.current) return false;
          const coords = getProjectCoords(p);
          if (!coords) return false;

          mapRef.current.flyTo({
            center: [coords.lon, coords.lat],
            zoom: 15.5,
            essential: true,
            duration: 1000,
          });
          onSelectSitePin?.(p);
          return true;
        },
        selectProject: (projectId: string) => {
          const p = projects.find((x) => x.id === projectId);
          if (!p) return false;
          onSelectSitePin?.(p);
          return true;
        },
        finishSketch: () => true,
        undoSketchVertex: () => {},
        clearSketch: () => {},
        getSketchVertexCount: () => 0,
        captureMapPng: async () => {
          if (!mapRef.current) return null;
          try {
            return mapRef.current.getCanvas().toDataURL("image/png");
          } catch {
            return null;
          }
        },
        flyToBarangay: (area: any) => {
          if (!mapRef.current || !area) return;
          const name = typeof area === "string" ? area : area?.name;
          if (!name) return;
          const coords = lookupBarangayCoords(name) || BARANGAY_COORDINATES[name];
          if (coords) {
            mapRef.current.flyTo({
              center: [coords.lon, coords.lat],
              zoom: 15,
              duration: 1000,
            });
          }
        },
      }),
      [projects, onSelectSitePin],
    );

    return (
      <div
        className="stadia-engineer-map-wrapper"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <div
          ref={mapContainerRef}
          className="stadia-engineer-map-canvas"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "hidden",
            background: "#0d1522",
          }}
        />

        {/* ── Floating Earthquake Hazard Legend Card (matching GoogleHeatmapOverlay) ── */}
        {earthquakeEnabled && (
          <aside
            className="cesium-google-heat-legend"
            style={{ zIndex: 30 }}
            aria-label="Earthquake hazard legend"
          >
            <div className="cesium-google-heat-legend-title">ML Earthquake Prone Hazard</div>
            <p className="cesium-google-heat-legend-copy">
              AI seismic vulnerability &amp; ground shaking susceptibility
            </p>
            <div
              className="cesium-google-heat-ramp"
              role="img"
              aria-label="Low to High hazard ramp"
            />
            <div className="cesium-google-heat-legend-scale">
              <span>Low Risk</span>
              <span>High Susceptibility</span>
            </div>
          </aside>
        )}
      </div>
    );
  },
);

export default StadiaEngineerMap;
