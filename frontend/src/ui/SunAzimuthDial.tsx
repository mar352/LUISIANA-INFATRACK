/**
 * Interactive sun azimuth / bearing dial (Shadowmap-style).
 * 0° = North, 90° = East, clockwise. Drag the outer ring to rotate.
 */

import { useCallback, useEffect, useId, useRef } from "react";

type Props = {
  /** Compass bearing degrees 0–360 (N→E→S→W). */
  value: number;
  onChange: (bearingDeg: number) => void;
  disabled?: boolean;
  className?: string;
  size?: number;
  /** Called when dial drag starts/ends (e.g. freeze Cesium camera inputs). */
  onDragStateChange?: (dragging: boolean) => void;
};

function normalizeDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

function angleFromPointer(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  // atan2(dx, -dy): 0 at north, clockwise positive
  const rad = Math.atan2(dx, -dy);
  return normalizeDeg((rad * 180) / Math.PI);
}

export function SunAzimuthDial({
  value,
  onChange,
  disabled = false,
  className = "",
  size = 112,
  onDragStateChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onDragStateChangeRef = useRef(onDragStateChange);
  const labelId = useId();
  const bearing = normalizeDeg(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onDragStateChangeRef.current = onDragStateChange;
  }, [onDragStateChange]);

  const setFromEvent = useCallback((clientX: number, clientY: number) => {
    const el = rootRef.current;
    if (!el) return;
    const next = angleFromPointer(clientX, clientY, el.getBoundingClientRect());
    onChangeRef.current(next);
  }, []);

  useEffect(() => {
    if (disabled) return;

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setFromEvent(e.clientX, e.clientY);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      onDragStateChangeRef.current?.(false);
    };

    window.addEventListener("pointermove", onMove, { passive: false, capture: true });
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      if (draggingRef.current) {
        draggingRef.current = false;
        onDragStateChangeRef.current?.(false);
      }
    };
  }, [disabled, setFromEvent]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    onDragStateChangeRef.current?.(true);
    setFromEvent(e.clientX, e.clientY);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 15 : 5;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(normalizeDeg(bearing - step));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(normalizeDeg(bearing + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(0);
    }
  };

  const r = size / 2;
  const ringR = r - 8;
  const sunR = ringR - 14;
  const rad = (bearing * Math.PI) / 180;
  const sunX = r + Math.sin(rad) * sunR;
  const sunY = r - Math.cos(rad) * sunR;
  const hubX = r;
  const hubY = r;

  return (
    <div
      ref={rootRef}
      className={`sun-azimuth-dial ${className}`.trim()}
      style={{ width: size, height: size }}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-labelledby={labelId}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(bearing)}
      aria-valuetext={`${Math.round(bearing)} degrees from north`}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <span id={labelId} className="sun-azimuth-dial-sr">
        Sun bearing
      </span>
      <svg
        className="sun-azimuth-dial-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <circle className="sun-azimuth-dial-disc" cx={r} cy={r} r={ringR} />
        <circle className="sun-azimuth-dial-ring" cx={r} cy={r} r={ringR} fill="none" />

        {/* Cardinal ticks */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const a = (deg * Math.PI) / 180;
          const major = deg % 90 === 0;
          const inner = ringR - (major ? 10 : 6);
          const outer = ringR - 1;
          return (
            <line
              key={deg}
              className={major ? "sun-azimuth-dial-tick-major" : "sun-azimuth-dial-tick"}
              x1={r + Math.sin(a) * inner}
              y1={r - Math.cos(a) * inner}
              x2={r + Math.sin(a) * outer}
              y2={r - Math.cos(a) * outer}
            />
          );
        })}

        <text className="sun-azimuth-dial-cardinal sun-azimuth-dial-n" x={r} y={18} textAnchor="middle">
          N
        </text>
        <text className="sun-azimuth-dial-cardinal" x={size - 12} y={r + 4} textAnchor="middle">
          E
        </text>
        <text className="sun-azimuth-dial-cardinal" x={r} y={size - 8} textAnchor="middle">
          S
        </text>
        <text className="sun-azimuth-dial-cardinal" x={12} y={r + 4} textAnchor="middle">
          W
        </text>

        {/* Beam from center toward sun */}
        <line
          className="sun-azimuth-dial-beam"
          x1={hubX}
          y1={hubY}
          x2={sunX}
          y2={sunY}
        />

        {/* Center target */}
        <circle className="sun-azimuth-dial-hub" cx={hubX} cy={hubY} r={4} />

        {/* Sun knob on outer ring */}
        <circle className="sun-azimuth-dial-sun" cx={sunX} cy={sunY} r={9} />
        <circle className="sun-azimuth-dial-sun-core" cx={sunX} cy={sunY} r={3.5} />
      </svg>
      <div className="sun-azimuth-dial-readout" aria-hidden>
        {Math.round(bearing)}°
      </div>
    </div>
  );
}
