import type { SyntheticEvent } from "react";
import {
  SHAPE_CATALOG,
  type MapShapeKind,
  type ShapeCatalogItem,
  type ShapeGroup,
} from "../lib/map-shapes";
import "./ShapesPanel.css";

type Props = {
  selectedKind: MapShapeKind | null;
  onSelect: (item: ShapeCatalogItem) => void;
  onClose: () => void;
  onPointerDown?: (e: SyntheticEvent) => void;
};

const GROUPS: ShapeGroup[] = ["Roads (Low Poly)", "Volumes", "Roofs", "Trees"];

function ShapePreview({ kind }: { kind: MapShapeKind }) {
  if (kind === "road_straight") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <rect x="4" y="4" width="56" height="56" fill="#383b43" rx="2" />
        <rect x="4" y="4" width="10" height="56" fill="#8e949f" />
        <rect x="50" y="4" width="10" height="56" fill="#8e949f" />
        <line x1="32" y1="8" x2="32" y2="24" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="32" y1="40" x2="32" y2="56" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "road_cross") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <rect x="4" y="4" width="56" height="56" fill="#383b43" rx="2" />
        <rect x="4" y="4" width="12" height="12" fill="#8e949f" />
        <rect x="48" y="4" width="12" height="12" fill="#8e949f" />
        <rect x="4" y="48" width="12" height="12" fill="#8e949f" />
        <rect x="48" y="48" width="12" height="12" fill="#8e949f" />
        <line x1="32" y1="6" x2="32" y2="16" stroke="#ffffff" strokeWidth="3" />
        <line x1="32" y1="48" x2="32" y2="58" stroke="#ffffff" strokeWidth="3" />
        <line x1="6" y1="32" x2="16" y2="32" stroke="#ffffff" strokeWidth="3" />
        <line x1="48" y1="32" x2="58" y2="32" stroke="#ffffff" strokeWidth="3" />
      </svg>
    );
  }
  if (kind === "road_t") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <rect x="4" y="4" width="56" height="56" fill="#383b43" rx="2" />
        <rect x="4" y="4" width="56" height="10" fill="#8e949f" />
        <rect x="4" y="48" width="12" height="12" fill="#8e949f" />
        <rect x="48" y="48" width="12" height="12" fill="#8e949f" />
        <line x1="12" y1="30" x2="52" y2="30" stroke="#ffffff" strokeWidth="3" strokeDasharray="8 6" />
        <line x1="32" y1="34" x2="32" y2="56" stroke="#ffffff" strokeWidth="3" strokeDasharray="8 6" />
      </svg>
    );
  }
  if (kind === "road_curve") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <rect x="4" y="4" width="56" height="56" fill="#383b43" rx="2" />
        <rect x="4" y="4" width="56" height="10" fill="#8e949f" />
        <rect x="4" y="4" width="10" height="56" fill="#8e949f" />
        <rect x="48" y="48" width="12" height="12" fill="#8e949f" />
        <path d="M 6 36 A 26 26 0 0 0 36 6" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeDasharray="8 6" />
      </svg>
    );
  }
  if (kind === "road_deadend") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <rect x="4" y="4" width="56" height="56" fill="#383b43" rx="2" />
        <rect x="4" y="4" width="56" height="10" fill="#8e949f" />
        <rect x="4" y="4" width="10" height="56" fill="#8e949f" />
        <rect x="50" y="4" width="10" height="56" fill="#8e949f" />
        <line x1="32" y1="28" x2="32" y2="56" stroke="#ffffff" strokeWidth="3.5" strokeDasharray="8 6" />
      </svg>
    );
  }
  if (kind === "road_4lane") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <rect x="2" y="4" width="60" height="56" fill="#383b43" rx="2" />
        <rect x="2" y="4" width="8" height="56" fill="#8e949f" />
        <rect x="54" y="4" width="8" height="56" fill="#8e949f" />
        <line x1="31" y1="4" x2="31" y2="60" stroke="#fab005" strokeWidth="2" />
        <line x1="34" y1="4" x2="34" y2="60" stroke="#fab005" strokeWidth="2" />
        <line x1="20" y1="8" x2="20" y2="24" stroke="#ffffff" strokeWidth="2.5" />
        <line x1="20" y1="40" x2="20" y2="56" stroke="#ffffff" strokeWidth="2.5" />
        <line x1="45" y1="8" x2="45" y2="24" stroke="#ffffff" strokeWidth="2.5" />
        <line x1="45" y1="40" x2="45" y2="56" stroke="#ffffff" strokeWidth="2.5" />
      </svg>
    );
  }
  if (kind === "freeform") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M18 22 L40 16 L50 34 L34 48 L14 40 Z" fill="none" stroke="#5b6573" strokeWidth="2.2" />
        <circle cx="18" cy="22" r="4" fill="#2b3340" />
        <circle cx="40" cy="16" r="4" fill="#2b3340" />
        <circle cx="50" cy="34" r="4" fill="#2b3340" />
        <circle cx="34" cy="48" r="4" fill="#2b3340" />
        <circle cx="14" cy="40" r="4" fill="#2b3340" />
      </svg>
    );
  }
  if (kind === "box") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M16 28 L32 18 L48 28 L48 46 L32 56 L16 46 Z" fill="#cfd3d8" />
        <path d="M16 28 L32 38 L48 28" fill="none" stroke="#9aa1aa" strokeWidth="1.4" />
        <path d="M32 38 L32 56" fill="none" stroke="#9aa1aa" strokeWidth="1.4" />
        <path d="M16 28 L16 46 L32 56 L48 46 L48 28 L32 18 Z" fill="none" stroke="#8b929c" strokeWidth="1.2" />
      </svg>
    );
  }
  if (kind === "cylinder") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <ellipse cx="32" cy="20" rx="14" ry="6" fill="#d5d8de" stroke="#8b929c" strokeWidth="1.2" />
        <path d="M18 20 L18 44 C18 48 46 48 46 44 L46 20" fill="#c5c9d0" stroke="#8b929c" strokeWidth="1.2" />
        <ellipse cx="32" cy="44" rx="14" ry="6" fill="#b7bcc4" stroke="#8b929c" strokeWidth="1.2" />
      </svg>
    );
  }
  if (kind === "gable") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M12 40 L32 18 L52 40 L44 40 L44 50 L20 50 L20 40 Z" fill="#d8dbe1" stroke="#8b929c" strokeWidth="1.2" />
        <path d="M20 40 L44 40" stroke="#9aa1aa" strokeWidth="1.2" />
      </svg>
    );
  }
  if (kind === "hip") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M12 42 L24 22 L40 18 L52 38 L40 50 L20 52 Z" fill="#d4d7de" stroke="#8b929c" strokeWidth="1.2" />
        <path d="M24 22 L40 50" stroke="#9aa1aa" strokeWidth="1.1" />
        <path d="M40 18 L20 52" stroke="#9aa1aa" strokeWidth="1.1" />
      </svg>
    );
  }
  if (kind === "pyramid") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M32 14 L52 48 L12 48 Z" fill="#d6d9df" stroke="#8b929c" strokeWidth="1.2" />
        <path d="M32 14 L32 48" stroke="#9aa1aa" strokeWidth="1.1" />
      </svg>
    );
  }
  if (kind === "tree_conifer") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M32 8 L46 28 L38 28 L50 42 L14 42 L26 28 L18 28 Z" fill="#5f8f4c" />
        <rect x="29" y="42" width="6" height="10" fill="#7a5a3a" rx="1" />
      </svg>
    );
  }
  if (kind === "tree_bush") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <ellipse cx="32" cy="38" rx="18" ry="14" fill="#6a9a4e" />
        <ellipse cx="24" cy="32" rx="10" ry="9" fill="#7aad5c" />
        <ellipse cx="40" cy="32" rx="9" ry="8" fill="#5e8c45" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="32" cy="28" rx="14" ry="13" fill="#5a8f4a" />
      <ellipse cx="22" cy="34" rx="9" ry="8" fill="#6aa056" />
      <ellipse cx="42" cy="34" rx="8" ry="7" fill="#4e7c40" />
      <rect x="29" y="40" width="6" height="12" fill="#7a5a3a" rx="1" />
    </svg>
  );
}

export function ShapesPanel({ selectedKind, onSelect, onClose, onPointerDown }: Props) {
  return (
    <aside
      className="shapes-panel"
      aria-label="Shapes"
      onPointerDown={onPointerDown}
      onMouseDown={onPointerDown}
    >
      <div className="shapes-panel-head">
        <strong>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 3 L21 8 L12 13 L3 8 Z" />
            <path d="M21 8 V16 L12 21 L3 16 V8" />
          </svg>
          Shapes
        </strong>
        <span
          className="shapes-panel-info"
          title="Click a shape, then click the globe to place it. Freeform: draw a polygon, then press Finish."
        >
          i
        </span>
        <button type="button" className="shapes-panel-close" onClick={onClose} aria-label="Hide shapes">
          ×
        </button>
      </div>
      <p className="shapes-panel-hint">
        {selectedKind
          ? SHAPE_CATALOG.find((s) => s.kind === selectedKind)?.hint
          : "Pick a volume, roof, or tree, then place it on the globe."}
      </p>
      {GROUPS.map((group) => (
        <section key={group} className="shapes-group">
          <h3>{group}</h3>
          <div className="shapes-grid">
            {SHAPE_CATALOG.filter((s) => s.group === group).map((item) => {
              const on = selectedKind === item.kind;
              return (
                <button
                  key={item.kind}
                  type="button"
                  className={`shapes-tile${on ? " is-on" : ""}${item.locked ? " is-locked" : ""}`}
                  disabled={item.locked}
                  aria-pressed={on}
                  onClick={() => onSelect(item)}
                >
                  <span className="shapes-tile-art">
                    <ShapePreview kind={item.kind} />
                    {item.locked && (
                      <span className="shapes-lock" aria-hidden>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                          <rect x="5" y="11" width="14" height="10" rx="2" />
                          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                        </svg>
                      </span>
                    )}
                  </span>
                  <span className="shapes-tile-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </aside>
  );
}
