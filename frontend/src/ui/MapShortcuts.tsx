import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { GlobeOfflineButton } from "./GlobeOfflineButton";
import { StadiaStylePicker } from "./StadiaStylePicker";
import type { StadiaMapStyleId } from "../lib/stadia";

type Props = {
  canSeeLayers: boolean;
  canSeeRisk: boolean;
  satellite?: boolean;
  projects: boolean;
  quakeHeat: boolean;
  barangays: boolean;
  coordinates?: boolean;
  labels?: boolean;
  shapes?: boolean;
  canPlaceShapes?: boolean;
  placement?: boolean;
  canPlace?: boolean;
  currentStyle?: StadiaMapStyleId;
  onSelectStyle?: (style: StadiaMapStyleId) => void;
  onSatellite?: () => void;
  onProjects: () => void;
  onBarangays: () => void;
  onCoordinates?: () => void;
  onLabels?: () => void;
  onShapes?: () => void;
  onPlacement?: () => void;
  onQuakeHeat: () => void;
  onPointerDown?: (e: SyntheticEvent) => void;
};

function IconBtn({
  label,
  title,
  active,
  onClick,
  children,
}: {
  label: string;
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`map-shortcut${active ? " is-on" : ""}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
      <span className="map-shortcut-label">{label}</span>
    </button>
  );
}

export function MapShortcuts({
  canSeeLayers,
  canSeeRisk,
  satellite,
  projects,
  quakeHeat,
  barangays,
  coordinates = true,
  labels = true,
  shapes = false,
  canPlaceShapes = false,
  placement = false,
  canPlace = false,
  currentStyle,
  onSelectStyle,
  onSatellite,
  onProjects,
  onBarangays,
  onCoordinates,
  onLabels,
  onShapes,
  onPlacement,
  onQuakeHeat,
  onPointerDown,
}: Props) {
  const [showStyles, setShowStyles] = useState(false);
  const [isDocFullscreen, setIsDocFullscreen] = useState(
    typeof document !== "undefined" ? Boolean(document.fullscreenElement) : false
  );

  useEffect(() => {
    const handleFsChange = () => {
      setIsDocFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleDocFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  if (!canSeeLayers && !canSeeRisk) return null;

  return (
    <div
      className="map-shortcuts"
      role="toolbar"
      aria-label="Map shortcuts"
      onPointerDown={onPointerDown}
      onMouseDown={onPointerDown}
    >
      {canSeeLayers && (
        <>
          <div style={{ position: "relative" }}>
            <IconBtn
              label="Styles"
              title="Change map style (Outdoors, Watercolor, Smooth, Dark, Toner, Terrain, etc.)"
              active={showStyles}
              onClick={() => setShowStyles((v) => !v)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </IconBtn>
            {showStyles && onSelectStyle && (
              <div className="stadia-style-popover">
                <div className="stadia-style-popover-title">
                  <span>Basemap Style</span>
                  <button
                    type="button"
                    onClick={() => setShowStyles(false)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      color: "var(--muted)",
                      padding: "0 4px",
                    }}
                  >
                    ✕
                  </button>
                </div>
                <StadiaStylePicker
                  currentStyle={currentStyle}
                  compact
                  onSelectStyle={(id) => {
                    onSelectStyle(id);
                    setShowStyles(false);
                  }}
                />
              </div>
            )}
          </div>
          <IconBtn
            label="Projects"
            title="Infrastructure projects"
            active={projects}
            onClick={onProjects}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.2" />
            </svg>
          </IconBtn>
          <GlobeOfflineButton />
          <IconBtn
            label="Barangays"
            title="Show barangay colors"
            active={barangays}
            onClick={onBarangays}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 7h7v10H4z" />
              <path d="M13 4h7v7h-7z" />
              <path d="M13 13h7v7h-7z" />
            </svg>
          </IconBtn>
        </>
      )}

      {canSeeLayers && canSeeRisk && <div className="map-shortcut-gap" />}

      {canSeeRisk && (
        <IconBtn
          label="Quake heat"
          title="Earthquake-prone heatmap"
          active={quakeHeat}
          onClick={onQuakeHeat}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 14c2-1 3.5-4 4-7 1 3 2 5 4 5s2.5-3 3-6c.8 3 2 6 5 8" />
            <path d="M4 19c3-2 5-2 8 0s5 2 8 0" />
          </svg>
        </IconBtn>
      )}

      <div className="map-shortcut-gap" />

      <IconBtn
        label="Fullscreen"
        title={isDocFullscreen ? "Exit fullscreen" : "View map in fullscreen"}
        active={isDocFullscreen}
        onClick={toggleDocFullscreen}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {isDocFullscreen ? (
            <path d="M4 14h6m0 0v6m0-6L3 21m17-11h-6m0 0V4m0 6 7-7M10 4v6m0 0H4m10 16v-6m0 0h6" />
          ) : (
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          )}
        </svg>
      </IconBtn>
    </div>
  );
}
