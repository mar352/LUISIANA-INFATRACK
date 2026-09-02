import type { SyntheticEvent } from "react";
import type { BarangayArea } from "../lib/barangay-overlay";
import "./BarangayLegend.css";

type Props = {
  areas: BarangayArea[];
  selectedName?: string | null;
  onSelect: (area: BarangayArea) => void;
  onClose: () => void;
  onPointerDown?: (e: SyntheticEvent) => void;
};

export function BarangayLegend({ areas, selectedName, onSelect, onClose, onPointerDown }: Props) {
  return (
    <aside
      className="brgy-legend"
      aria-label="Barangay colors"
      onPointerDown={onPointerDown}
      onMouseDown={onPointerDown}
    >
      <div className="brgy-legend-head">
        <strong>Barangays</strong>
        <button type="button" className="brgy-legend-close" onClick={onClose} aria-label="Hide barangays">
          ×
        </button>
      </div>
      <p className="brgy-legend-hint">Click a barangay to fly to it on the globe.</p>
      <ul className="brgy-legend-list">
        {areas.map((a) => {
          const on = selectedName === a.name;
          return (
            <li key={a.name}>
              <button
                type="button"
                className={`brgy-legend-item${on ? " is-on" : ""}`}
                aria-current={on ? "true" : undefined}
                onClick={() => onSelect(a)}
              >
                <span className="brgy-legend-swatch" style={{ background: a.color }} />
                <span>{a.name.replace(/^Barangay\s+/i, "")}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
