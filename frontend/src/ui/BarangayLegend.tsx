import { useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
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
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? areas.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase().trim())
      )
    : areas;

  const content = (
    <>
      <button
        type="button"
        className="brgy-legend-backdrop"
        aria-label="Close barangay list"
        onClick={onClose}
      />
      <aside
        className="brgy-legend"
        role="dialog"
        aria-modal="false"
        aria-label="Barangays of Luisiana"
        onPointerDown={onPointerDown}
        onMouseDown={onPointerDown}
      >
        <div className="brgy-legend-head">
          <div className="brgy-legend-title">
            <span>Barangays</span>
            <span className="brgy-legend-count">{areas.length}</span>
          </div>
          <button
            type="button"
            className="brgy-legend-close"
            onClick={onClose}
            aria-label="Close barangay list"
            title="Close"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p className="brgy-legend-hint">Click a barangay to fly to it on the globe.</p>
        <ul className="brgy-legend-list">
          {filtered.map((a) => {
            const on = selectedName === a.name;
            const displayName = a.name.replace(/^Barangay\s+/i, "");
            return (
              <li key={a.name}>
                <button
                  type="button"
                  className={`brgy-legend-item${on ? " is-on" : ""}`}
                  aria-current={on ? "true" : undefined}
                  onClick={() => onSelect(a)}
                  title={`Fly to ${displayName}`}
                >
                  <span className="brgy-legend-swatch" style={{ background: a.color }} />
                  <span className="brgy-legend-name">{displayName}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
