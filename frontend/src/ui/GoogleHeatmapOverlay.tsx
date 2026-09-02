import { useEffect, useMemo, useRef } from "react";
import * as Cesium from "cesium";
import { drawGoogleStyleHeatmap, thinHeatSites, type HeatSite } from "../lib/google-heatmap";

type Props = {
  viewer: Cesium.Viewer | null;
  sites: HeatSite[];
  title: string;
  copy: string;
  lowLabel: string;
  highLabel: string;
};

/** Paint cheaper than full retina so the heat can follow zoom/pan every frame. */
const PAINT_SCALE = 0.42;

export function GoogleHeatmapOverlay({
  viewer,
  sites,
  title,
  copy,
  lowLabel,
  highLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const toPointRef = useRef(new Cesium.Cartesian3());
  const paintSites = useMemo(() => thinHeatSites(sites), [sites]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    const scratch = scratchRef.current ?? document.createElement("canvas");
    scratchRef.current = scratch;

    let lastPaint = 0;
    let pendingRaf: number | null = null;

    const paintCanvas = () => {
      if (dead || viewer.isDestroyed()) return;
      const now = performance.now();
      if (now - lastPaint < 33) {
        if (pendingRaf == null) {
          pendingRaf = window.requestAnimationFrame(() => {
            pendingRaf = null;
            paintCanvas();
          });
        }
        return;
      }
      lastPaint = now;

      const cssW = viewer.scene.canvas.clientWidth;
      const cssH = viewer.scene.canvas.clientHeight;
      if (cssW < 2 || cssH < 2) return;
      const w = Math.max(2, Math.round(cssW * PAINT_SCALE));
      const h = Math.max(2, Math.round(cssH * PAINT_SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;

      const camPos = viewer.camera.position;
      const camDir = viewer.camera.direction;
      const pts = [];
      for (const s of paintSites) {
        const cart = Cesium.Cartesian3.fromDegrees(s.lon, s.lat);
        const toPoint = Cesium.Cartesian3.subtract(cart, camPos, toPointRef.current);
        if (Cesium.Cartesian3.dot(camDir, toPoint) <= 0) continue;
        const win = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, cart);
        if (!win) continue;
        pts.push({
          x: win.x * PAINT_SCALE,
          y: win.y * PAINT_SCALE,
          weight: s.weight,
        });
      }
      const height = viewer.camera.positionCartographic.height;
      const radius =
        Math.max(18, Math.min(86, 175000 / Math.max(height, 80))) * PAINT_SCALE;
      drawGoogleStyleHeatmap(ctx, w, h, pts, radius, scratch);
    };

    paintCanvas();
    const removeRender = viewer.scene.postRender.addEventListener(paintCanvas);
    window.addEventListener("resize", paintCanvas);

    return () => {
      dead = true;
      if (pendingRaf != null) window.cancelAnimationFrame(pendingRaf);
      if (typeof removeRender === "function") removeRender();
      window.removeEventListener("resize", paintCanvas);
    };
  }, [viewer, paintSites]);

  return (
    <div className="cesium-google-heat">
      <canvas ref={canvasRef} className="cesium-google-heat-canvas" aria-hidden />
      <aside className="cesium-google-heat-legend" aria-label={`${title} legend`}>
        <div className="cesium-google-heat-legend-title">{title}</div>
        <p className="cesium-google-heat-legend-copy">{copy}</p>
        <div
          className="cesium-google-heat-ramp"
          role="img"
          aria-label={`${lowLabel} to ${highLabel}`}
        />
        <div className="cesium-google-heat-legend-scale">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      </aside>
    </div>
  );
}
