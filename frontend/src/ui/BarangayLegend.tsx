import type { SyntheticEvent } from "react";
import type { BarangayArea } from "../lib/barangay-overlay";
import "./BarangayLegend.css";

type Props = {
  areas: BarangayArea[];
  onClose: () => void;
  onPointerDown?: (e: SyntheticEvent) => void;
};

export function BarangayLegend({ areas, onClose, onPointerDown }: Props) {
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
      <p className="brgy-legend-hint">Color-coded areas so you can see each barangay on the map.</p>
      <ul className="brgy-legend-list">
        {areas.map((a) => (
          <li key={a.name}>
            <span className="brgy-legend-swatch" style={{ background: a.color }} />
            <span>{a.name.replace(/^Barangay\s+/i, "")}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
