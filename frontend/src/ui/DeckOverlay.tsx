import { useEffect, useMemo, useRef, useState } from "react";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { HeatPoint, WeatherSnapshot } from "../types";

type Props = {
  map: any;
  enabledHeatmap: boolean;
  heatPoints: HeatPoint[];
  enabledWeather: boolean;
  weather: WeatherSnapshot | null;
};

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
 * A lightweight “cloud feel” overlay rendered as moving dots on a canvas.
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
}: Props) {
  const overlayRef = useRef<MapboxOverlay | null>(null);

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

  const layers = useMemo(() => {
    const out: any[] = [];

    if (enabledHeatmap) {
      // Smoother, less “dotty” heat rendering:
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

    return out;
  }, [enabledHeatmap, heatPoints, pulse]);

  useEffect(() => {
    if (!map) return;

    if (!overlayRef.current) {
      overlayRef.current = new MapboxOverlay({ layers: [] });
      map.addControl(overlayRef.current as any);
    }

    overlayRef.current.setProps({ layers });
  }, [map, layers]);

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

