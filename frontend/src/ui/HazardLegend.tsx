import type { HazardLegendItem, HazardOverlayMeta } from "../lib/hazard-overlays";
import "./HazardLegend.css";

type Props = {
  hazard: HazardOverlayMeta;
  /** Compact floating card on the map vs sidebar block. */
  variant?: "panel" | "map";
};

function Swatch({ item }: { item: HazardLegendItem }) {
  const hatch =
    item.pattern === "hatch"
      ? {
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            ${item.color},
            ${item.color} 2px,
            transparent 2px,
            transparent 5px
          )`,
          backgroundColor: "rgba(255,255,255,0.35)",
        }
      : { backgroundColor: item.color };

  return (
    <span
      className="hz-legend-swatch"
      style={hatch}
      title={item.hint || item.label}
      aria-hidden
    />
  );
}

export function HazardLegend({ hazard, variant = "panel" }: Props) {
  return (
    <div className={`hz-legend hz-legend--${variant}`} role="group" aria-label={`${hazard.legendTitle} legend`}>
      <div className="hz-legend-title">{hazard.legendTitle}</div>
      <ul className="hz-legend-list">
        {hazard.legend.map((item) => (
          <li key={item.label} className="hz-legend-row">
            <Swatch item={item} />
            <div className="hz-legend-text">
              <span className="hz-legend-label">{item.label}</span>
              {item.hint && variant === "panel" && (
                <span className="hz-legend-hint">{item.hint}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="hz-legend-src">Source: {hazard.attribution}</div>
    </div>
  );
}
