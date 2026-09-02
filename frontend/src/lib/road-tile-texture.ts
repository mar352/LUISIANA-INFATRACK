/**
 * Procedural low-poly road tile textures (matching the modular low-poly road kit).
 * Generates canvas textures for Straight, 4-Way Cross, T-Junction, Curve, Dead-end, and 4-Lane Avenue.
 */

import type { MapShapeKind } from "./map-shapes";

const textureCache = new Map<string, string>();

export function getRoadTileTexture(kind: MapShapeKind): string {
  const cached = textureCache.get(kind);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Base asphalt background
  ctx.fillStyle = "#383b43";
  ctx.fillRect(0, 0, size, size);

  const sidewalkColor = "#8e949f";
  const sidewalkBorder = "#777c86";
  const stripeColor = "#f5f7fa";
  const sidewalkWidth = 72;

  ctx.lineWidth = 4;
  ctx.strokeStyle = sidewalkBorder;

  function drawSidewalkRect(x: number, y: number, w: number, h: number) {
    if (!ctx) return;
    ctx.fillStyle = sidewalkColor;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  function drawDashedVerticalLine(x: number, y1: number, y2: number) {
    if (!ctx) return;
    ctx.fillStyle = stripeColor;
    const dashLength = 48;
    const gap = 36;
    const dashWidth = 14;
    for (let y = y1; y < y2; y += dashLength + gap) {
      const len = Math.min(dashLength, y2 - y);
      ctx.fillRect(x - dashWidth / 2, y, dashWidth, len);
    }
  }

  function drawDashedHorizontalLine(y: number, x1: number, x2: number) {
    if (!ctx) return;
    ctx.fillStyle = stripeColor;
    const dashLength = 48;
    const gap = 36;
    const dashHeight = 14;
    for (let x = x1; x < x2; x += dashLength + gap) {
      const len = Math.min(dashLength, x2 - x);
      ctx.fillRect(x, y - dashHeight / 2, len, dashHeight);
    }
  }

  if (kind === "road_straight") {
    // Left & Right continuous sidewalks
    drawSidewalkRect(0, 0, sidewalkWidth, size);
    drawSidewalkRect(size - sidewalkWidth, 0, sidewalkWidth, size);
    // Dashed center lane
    drawDashedVerticalLine(size / 2, 10, size - 10);
  } else if (kind === "road_cross") {
    // 4 Corner sidewalks
    drawSidewalkRect(0, 0, sidewalkWidth, sidewalkWidth);
    drawSidewalkRect(size - sidewalkWidth, 0, sidewalkWidth, sidewalkWidth);
    drawSidewalkRect(0, size - sidewalkWidth, sidewalkWidth, sidewalkWidth);
    drawSidewalkRect(size - sidewalkWidth, size - sidewalkWidth, sidewalkWidth, sidewalkWidth);

    // Subtle stop lines on entry lanes
    ctx.fillStyle = stripeColor;
    // Dashed lane lines on all 4 arms
    drawDashedVerticalLine(size / 2, 10, sidewalkWidth + 10);
    drawDashedVerticalLine(size / 2, size - sidewalkWidth - 10, size - 10);
    drawDashedHorizontalLine(size / 2, 10, sidewalkWidth + 10);
    drawDashedHorizontalLine(size / 2, size - sidewalkWidth - 10, size - 10);
  } else if (kind === "road_t") {
    // T-junction: Top continuous sidewalk, 2 bottom corner sidewalks
    drawSidewalkRect(0, 0, size, sidewalkWidth);
    drawSidewalkRect(0, size - sidewalkWidth, sidewalkWidth, sidewalkWidth);
    drawSidewalkRect(size - sidewalkWidth, size - sidewalkWidth, sidewalkWidth, sidewalkWidth);

    // Center stripes
    drawDashedHorizontalLine(size / 2 + 20, sidewalkWidth + 10, size - sidewalkWidth - 10);
    drawDashedVerticalLine(size / 2, size / 2 + 20, size - 10);
  } else if (kind === "road_curve") {
    // 90-degree turn: Outer top-left corner sidewalk, inner bottom-right sidewalk
    drawSidewalkRect(0, 0, size, sidewalkWidth);
    drawSidewalkRect(0, 0, sidewalkWidth, size);
    drawSidewalkRect(size - sidewalkWidth, size - sidewalkWidth, sidewalkWidth, sidewalkWidth);

    // Curved center stripe
    ctx.strokeStyle = stripeColor;
    ctx.lineWidth = 14;
    ctx.setLineDash([48, 36]);
    ctx.beginPath();
    ctx.arc(0, 0, size / 2 + 20, 0, Math.PI / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (kind === "road_deadend") {
    // Left, Right, and Top sidewalks closing the road
    drawSidewalkRect(0, 0, sidewalkWidth, size);
    drawSidewalkRect(size - sidewalkWidth, 0, sidewalkWidth, size);
    drawSidewalkRect(0, 0, size, sidewalkWidth);

    drawDashedVerticalLine(size / 2, sidewalkWidth + 20, size - 10);
  } else if (kind === "road_4lane") {
    // 4-Lane wide boulevard with 2 dashed white lanes & yellow divider
    drawSidewalkRect(0, 0, sidewalkWidth, size);
    drawSidewalkRect(size - sidewalkWidth, 0, sidewalkWidth, size);

    // Solid yellow double center line
    ctx.fillStyle = "#e5a50a";
    ctx.fillRect(size / 2 - 8, 0, 5, size);
    ctx.fillRect(size / 2 + 3, 0, 5, size);

    // White dashed lane markings
    drawDashedVerticalLine(size * 0.32, 10, size - 10);
    drawDashedVerticalLine(size * 0.68, 10, size - 10);
  } else {
    // Generic asphalt
    drawSidewalkRect(0, 0, sidewalkWidth, size);
    drawSidewalkRect(size - sidewalkWidth, 0, sidewalkWidth, size);
    drawDashedVerticalLine(size / 2, 10, size - 10);
  }

  const dataUrl = canvas.toDataURL("image/png");
  textureCache.set(kind, dataUrl);
  return dataUrl;
}
