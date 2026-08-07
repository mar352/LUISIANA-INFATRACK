import { useEffect, useMemo, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

type Props = {
  map: MapLibreMap | null;
};

type CameraPose = {
  bearing: number;
  pitch: number;
  fov: number;
};

const SIZE = 88;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RING_R = 36;

/**
 * Shadowmap-style 2D camera indicator: a FOV cone on a compass disc that
 * tracks map bearing, pitch, and field of view in real time.
 *
 * - Cone apex = camera (center)
 * - Cone opens toward look direction (map bearing)
 * - Pitch foreshortens the cone (steeper = longer forward wedge)
 * - Click resets bearing to north
 */
export function CameraCompass({ map }: Props) {
  const [pose, setPose] = useState<CameraPose>({ bearing: -15, pitch: 30, fov: 36 });

  useEffect(() => {
    if (!map) return;

    const sync = () => {
      const transform = map.transform as { fov?: number };
      const fov = typeof transform.fov === "number" ? transform.fov : 36;
      setPose({
        bearing: map.getBearing(),
        pitch: map.getPitch(),
        fov,
      });
    };

    sync();
    map.on("rotate", sync);
    map.on("pitch", sync);
    map.on("move", sync);
    map.on("zoom", sync);

    return () => {
      map.off("rotate", sync);
      map.off("pitch", sync);
      map.off("move", sync);
      map.off("zoom", sync);
    };
  }, [map]);

  const cone = useMemo(() => buildConePath(pose), [pose]);

  const resetNorth = () => {
    map?.easeTo({ bearing: 0, duration: 500 });
  };

  const pitchPct = Math.round(Math.min(90, Math.max(0, pose.pitch)));
  const bearingLabel = Math.round(((pose.bearing % 360) + 360) % 360);

  return (
    <button
      type="button"
      className="camera-compass"
      title={`Bearing ${bearingLabel}° · Pitch ${pitchPct}° — click to reset north`}
      aria-label={`Camera compass, bearing ${bearingLabel} degrees, pitch ${pitchPct} degrees. Click to reset north.`}
      onClick={resetNorth}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="camera-compass-svg">
        {/* Disc */}
        <circle cx={CX} cy={CY} r={RING_R} className="camera-compass-disc" />
        <circle cx={CX} cy={CY} r={RING_R} className="camera-compass-ring" fill="none" />

        {/* Cardinal ticks */}
        {[0, 90, 180, 270].map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const x1 = CX + Math.cos(rad) * (RING_R - 5);
          const y1 = CY + Math.sin(rad) * (RING_R - 5);
          const x2 = CX + Math.cos(rad) * (RING_R - 1);
          const y2 = CY + Math.sin(rad) * (RING_R - 1);
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={deg === 0 ? "camera-compass-tick-n" : "camera-compass-tick"}
            />
          );
        })}

        {/* North label (fixed — world north) */}
        <text x={CX} y={14} textAnchor="middle" className="camera-compass-n">
          N
        </text>

        {/* FOV cone — rotates with bearing */}
        <g transform={`rotate(${pose.bearing} ${CX} ${CY})`}>
          <path d={cone.d} className="camera-compass-cone" />
          <path d={cone.d} className="camera-compass-cone-stroke" fill="none" />
          {/* Look-direction arrow tip */}
          <line
            x1={CX}
            y1={CY}
            x2={CX}
            y2={CY - cone.length}
            className="camera-compass-axis"
          />
        </g>

        {/* Camera body at center */}
        <circle cx={CX} cy={CY} r={4.5} className="camera-compass-cam" />
        <circle cx={CX} cy={CY} r={2} className="camera-compass-cam-dot" />

        {/* Pitch wedge on the right rim (0° top → 90° bottom) */}
        <g className="camera-compass-pitch">
          <path
            d={pitchArcPath(CX + RING_R + 2, CY, 8, pitchPct)}
            className="camera-compass-pitch-fill"
          />
        </g>
      </svg>
      <span className="camera-compass-readout">
        {bearingLabel}° · {pitchPct}°
      </span>
    </button>
  );
}

/** Build a forward FOV wedge. Pitch stretches length; FOV sets half-angle. */
function buildConePath(pose: CameraPose): { d: string; length: number } {
  const halfFov = Math.max(12, Math.min(50, pose.fov * 0.55));
  // Pitch 0 (top-down) → short wide fan; pitch 85 → long narrow reach
  const pitch01 = Math.min(1, Math.max(0, pose.pitch / 85));
  const length = 10 + pitch01 * (RING_R - 12);
  const halfRad = (halfFov * Math.PI) / 180;

  // Wedge points up (−Y) then rotated by bearing in parent <g>
  const leftX = CX + Math.sin(-halfRad) * length;
  const leftY = CY - Math.cos(-halfRad) * length;
  const rightX = CX + Math.sin(halfRad) * length;
  const rightY = CY - Math.cos(halfRad) * length;

  // Slight arc at the far edge so it reads as a FOV frustum, not a triangle
  const bulge = 1 + (1 - pitch01) * 0.15;
  const arcX = CX;
  const arcY = CY - length * bulge;

  const d = [
    `M ${CX} ${CY}`,
    `L ${leftX.toFixed(2)} ${leftY.toFixed(2)}`,
    `Q ${arcX.toFixed(2)} ${arcY.toFixed(2)} ${rightX.toFixed(2)} ${rightY.toFixed(2)}`,
    "Z",
  ].join(" ");

  return { d, length: length * 0.92 };
}

/** Small pitch meter arc to the right of the disc. */
function pitchArcPath(cx: number, cy: number, r: number, pitchDeg: number): string {
  const start = -Math.PI / 2;
  const end = start + (Math.min(90, pitchDeg) / 90) * Math.PI;
  const x1 = cx + Math.cos(start) * r;
  const y1 = cy + Math.sin(start) * r;
  const x2 = cx + Math.cos(end) * r;
  const y2 = cy + Math.sin(end) * r;
  const large = pitchDeg > 90 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}
