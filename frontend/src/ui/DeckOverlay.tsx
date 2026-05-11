import { useEffect, useMemo, useRef, useState } from "react";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { PolygonLayer, ColumnLayer, ScatterplotLayer } from "@deck.gl/layers";
import { AmbientLight, DirectionalLight, LightingEffect } from "@deck.gl/core";
import type { HeatPoint, WeatherSnapshot } from "../types";
import { generateSolarGrid, getSolarColor, type SolarDataPoint } from "../lib/solar";
import { generateSlopeGrid, type SlopePoint } from "../lib/slope";

type Props = {
  map: any;
  enabledHeatmap: boolean;
  heatPoints: HeatPoint[];
  enabledWeather: boolean;
  weather: WeatherSnapshot | null;
  sunLightPosition?: [number, number, number];
  shadowsEnabled?: boolean;
  enabledSolar?: boolean;
  solarHour?: number;
  enabledSlope?: boolean;
};

type DeckBuilding = {
  polygon: [number, number][];
  height: number;
  base: number;
};

const LUISIANA_BOUNDS = {
  west: 121.44,
  south: 14.12,
  east: 121.58,
  north: 14.27,
};
const LUISIANA_FLOOR_RING: [number, number][] = [
  [LUISIANA_BOUNDS.west, LUISIANA_BOUNDS.south],
  [LUISIANA_BOUNDS.east, LUISIANA_BOUNDS.south],
  [LUISIANA_BOUNDS.east, LUISIANA_BOUNDS.north],
  [LUISIANA_BOUNDS.west, LUISIANA_BOUNDS.north],
  [LUISIANA_BOUNDS.west, LUISIANA_BOUNDS.south],
];

const MAX_BUILDINGS = 900;

function insideLuisianaBounds(lon: number, lat: number) {
  return (
    lon >= LUISIANA_BOUNDS.west &&
    lon <= LUISIANA_BOUNDS.east &&
    lat >= LUISIANA_BOUNDS.south &&
    lat <= LUISIANA_BOUNDS.north
  );
}

function firstRingFromGeometry(geometry: any): [number, number][] | null {
  if (!geometry?.type) return null;
  if (geometry.type === "Polygon") {
    return Array.isArray(geometry.coordinates?.[0]) ? (geometry.coordinates[0] as [number, number][]) : null;
  }
  if (geometry.type === "MultiPolygon") {
    return Array.isArray(geometry.coordinates?.[0]?.[0]) ? (geometry.coordinates[0][0] as [number, number][]) : null;
  }
  return null;
}

function colorRange() {
  // Blue -> Yellow -> Red (Zoom Earth style)
  return [
    [15, 55, 255, 0],
    [15, 55, 255, 120],
    [50, 160, 255, 170],
    [255, 220, 90, 200],
    [255, 140, 60, 215],
    [255, 77, 79, 230],
  ] as number[][];
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/**
 * A lightweight "cloud feel" overlay rendered as moving dots on a canvas.
 * This keeps the map-first UX (weather appears on the map) without requiring
 * heavy raster tile providers for the demo.
 */
function WeatherCanvasOverlay({ enabled, weather }: { enabled: boolean; weather: WeatherSnapshot | null }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(1, Math.floor(rect.width)), h: Math.max(1, Math.floor(rect.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = size.w;
    canvas.height = size.h;

    let raf = 0;
    let t0 = performance.now();

    const render = (t: number) => {
      raf = requestAnimationFrame(render);
      if (!enabled) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const dt = (t - t0) / 1000;
      t0 = t;
      const cloudiness = clamp01((weather?.cloudinessPct ?? 40) / 100);
      const rain = clamp01(weather?.rainfallIntensity ?? 0.25);
      const wind = clamp01((weather?.windSpeedMps ?? 2) / 12);

      // Full clear each frame so weather overlay never darkens/hides the map.
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const count = Math.floor(120 + cloudiness * 420);
      const speed = 10 + wind * 55;

      for (let i = 0; i < count; i++) {
        const x = ((i * 97.3 + t * speed * (0.3 + wind)) % canvas.width + canvas.width) % canvas.width;
        const y = ((i * 41.7 + t * speed * 0.12) % canvas.height + canvas.height) % canvas.height;
        const a = 0.05 + cloudiness * 0.14;

        ctx.beginPath();
        ctx.fillStyle = `rgba(200, 235, 255, ${a})`;
        ctx.arc(x, y, 1 + cloudiness * 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Light rain streaks when rainfall is high.
        if (rain > 0.35 && (i % 7 === 0)) {
          ctx.strokeStyle = `rgba(120, 200, 255, ${0.08 + rain * 0.12})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + wind * 6, y + 10 + rain * 18);
          ctx.stroke();
        }
      }

      // keep dt used (prevents unused lint complaints if strict settings change)
      void dt;
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [enabled, weather, size.h, size.w]);

  return (
    <canvas
      ref={ref}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: enabled ? 0.38 : 0,
        transition: "opacity 120ms ease",
        mixBlendMode: "normal",
      }}
    />
  );
}

export function DeckGLOverlay({
  map,
  enabledHeatmap,
  heatPoints,
  enabledWeather,
  weather,
  sunLightPosition,
  shadowsEnabled = true,
  enabledSolar = false,
  solarHour = 12,
  enabledSlope = false,
}: Props) {
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [deckBuildings, setDeckBuildings] = useState<DeckBuilding[]>([]);

  // Animate heatmap slightly by modulating intensity based on time.
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      setPulse((Math.sin(t / 700) + 1) / 2);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Generate solar data grid
  const solarData = useMemo(() => {
    if (!enabledSolar) return [];
    return generateSolarGrid(20, solarHour);
  }, [enabledSolar, solarHour]);

  // Generate slope analysis grid
  const slopeData = useMemo(() => {
    if (!enabledSlope) return [];
    return generateSlopeGrid(30); // 30x30 grid for detailed slope analysis
  }, [enabledSlope]);

  useEffect(() => {
    if (!map) return;

    const syncDeckBuildings = () => {
      if (!map.isStyleLoaded?.()) return;

      let srcFeatures: any[] = [];
      try {
        srcFeatures = map.querySourceFeatures("openmaptiles", { sourceLayer: "building" }) || [];
      } catch {
        setDeckBuildings([]);
        return;
      }

      const next: DeckBuilding[] = [];
      for (const feat of srcFeatures) {
        if (next.length >= MAX_BUILDINGS) break;
        const ring = firstRingFromGeometry(feat?.geometry);
        if (!ring || ring.length < 4) continue;
        const [lon, lat] = ring[0] ?? [];
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        if (!insideLuisianaBounds(lon, lat)) continue;

        const rawHeight = Number(feat?.properties?.render_height ?? feat?.properties?.height ?? 8);
        const rawBase = Number(feat?.properties?.render_min_height ?? feat?.properties?.min_height ?? 0);
        next.push({
          polygon: ring,
          height: Number.isFinite(rawHeight) ? Math.max(2, Math.min(260, rawHeight)) : 8,
          base: Number.isFinite(rawBase) ? Math.max(0, Math.min(120, rawBase)) : 0,
        });
      }

      setDeckBuildings(next);
    };

    if (map.isStyleLoaded?.()) syncDeckBuildings();
    else map.once("style.load", syncDeckBuildings);

    map.on("moveend", syncDeckBuildings);
    map.on("zoomend", syncDeckBuildings);
    map.on("style.load", syncDeckBuildings);

    return () => {
      map.off("moveend", syncDeckBuildings);
      map.off("zoomend", syncDeckBuildings);
      map.off("style.load", syncDeckBuildings);
    };
  }, [map]);

  const lightingEffect = useMemo(() => {
    if (!shadowsEnabled) return undefined;
    const [sx, sy, sz] = sunLightPosition ?? [0, -70, 100];
    const ambient = new AmbientLight({ color: [255, 255, 255], intensity: 0.45 });
    const sun = new DirectionalLight({
      color: [255, 244, 224],
      intensity: 1.8,
      direction: [-sx, -sy, -Math.max(15, sz)],
      // deck.gl shadow-map pass for non-raytraced dynamic shadows
      _shadow: true,
    } as any);
    return new LightingEffect({ ambientLight: ambient, sunlight: sun });
  }, [sunLightPosition, shadowsEnabled]);

  const buildingMaterial = useMemo(
    () => ({
      ambient: 0.22,
      diffuse: 0.68,
      shininess: 12,
      specularColor: [30, 30, 30],
    }),
    []
  );

  const layers = useMemo(() => {
    const out: any[] = [];

    // Slope Visualization Layer - Shows actual slope angles with color coding
    if (enabledSlope && slopeData.length > 0) {
      out.push(
        new ScatterplotLayer<SlopePoint>({
          id: "slope-visualization",
          data: slopeData,
          pickable: true,
          opacity: 0.7,
          stroked: true,
          filled: true,
          radiusScale: 1,
          radiusMinPixels: 3,
          radiusMaxPixels: 15,
          lineWidthMinPixels: 1,
          getPosition: (d) => [...d.position, d.elevation],
          getRadius: (d) => 600 + d.slope * 20, // Larger circles for steeper slopes
          getFillColor: (d) => d.color,
          getLineColor: [255, 255, 255, 100],
          updateTriggers: {
            getPosition: [slopeData.length],
            getRadius: [slopeData.length],
            getFillColor: [slopeData.length],
          },
        })
      );
    }

    // 3D Solar Radiation Layer
    if (enabledSolar && solarData.length > 0) {
      out.push(
        new ColumnLayer<SolarDataPoint>({
          id: "solar-radiation-3d",
          data: solarData,
          diskResolution: 12,
          radius: 800, // column radius in meters
          extruded: true,
          pickable: true,
          elevationScale: 1,
          getPosition: (d) => [...d.position, 0],
          getElevation: (d) => d.elevation,
          getFillColor: (d) => getSolarColor(d.intensity),
          material: {
            ambient: 0.5,
            diffuse: 0.8,
            shininess: 32,
            specularColor: [255, 200, 100],
          },
          opacity: 0.75,
          updateTriggers: {
            getElevation: [solarHour],
            getFillColor: [solarHour],
          },
        })
      );
    }

    if (enabledHeatmap) {
      // Smoother, less "dotty" heat rendering:
      // - larger radius blends neighboring samples
      // - slightly lower intensity avoids exaggerated hotspots
      const baseIntensity = 0.42 + pulse * 0.12;
      out.push(
        new HeatmapLayer<HeatPoint>({
          id: "impact-heatmap",
          data: heatPoints,
          getPosition: (d) => [d[0], d[1]],
          getWeight: (d) => d[2],
          radiusPixels: 160,
          intensity: baseIntensity,
          threshold: 0.06,
          colorRange: colorRange() as any,
          aggregation: "SUM",
        })
      );
    }

    if (shadowsEnabled) {
      out.push(
        new PolygonLayer<{ polygon: [number, number][] }>({
          id: "luisiana-shadow-receiver",
          data: [{ polygon: LUISIANA_FLOOR_RING }],
          pickable: false,
          stroked: false,
          filled: true,
          extruded: false,
          wireframe: false,
          getPolygon: (d) => d.polygon,
          // Extremely subtle receiver so basemap stays visible.
          getFillColor: [255, 255, 255, 16],
          material: {
            ambient: 0.65,
            diffuse: 0.35,
            shininess: 2,
            specularColor: [0, 0, 0],
          },
          shadowEnabled: true as any,
          parameters: {
            depthTest: true,
            cull: false,
          },
        } as any)
      );
    }

    if (shadowsEnabled && deckBuildings.length > 0) {
      out.push(
        new PolygonLayer<DeckBuilding>({
          id: "luisiana-deck-buildings-light",
          data: deckBuildings,
          pickable: false,
          stroked: false,
          filled: true,
          extruded: true,
          wireframe: false,
          getPolygon: (d) => d.polygon,
          getElevation: (d) => d.height,
          getFillColor: [229, 219, 198, 232],
          getLineColor: [208, 197, 174, 150],
          getLineWidth: 0.5,
          material: buildingMaterial,
          shadowEnabled: true as any,
          elevationScale: 1,
          parameters: {
            depthTest: true,
            cull: true,
          },
          updateTriggers: {
            getElevation: [deckBuildings.length],
          },
        })
      );
    }

    return out;
  }, [enabledHeatmap, heatPoints, pulse, shadowsEnabled, deckBuildings, buildingMaterial, enabledSolar, solarData, solarHour, enabledSlope, slopeData]);

  useEffect(() => {
    if (!map) return;

    if (!overlayRef.current) {
      overlayRef.current = new MapboxOverlay({ layers: [] });
      map.addControl(overlayRef.current as any);
    }

    overlayRef.current.setProps({ layers, effects: lightingEffect ? [lightingEffect] : [] });
  }, [map, layers, lightingEffect]);

  useEffect(() => {
    return () => {
      if (map && overlayRef.current) {
        map.removeControl(overlayRef.current as any);
        overlayRef.current = null;
      }
    };
  }, [map]);

  return <WeatherCanvasOverlay enabled={enabledWeather} weather={weather} />;
}
