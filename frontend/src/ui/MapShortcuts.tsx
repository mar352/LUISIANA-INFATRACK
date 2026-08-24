import type { ReactNode, SyntheticEvent } from "react";
import { GlobeOfflineButton } from "./GlobeOfflineButton";

type Props = {
  canSeeLayers: boolean;
  canSeeRisk: boolean;
  canSeeClimate: boolean;
  satellite: boolean;
  buildingBlocks: boolean;
  projects: boolean;
  quakeHeat: boolean;
  climateReadings: boolean;
  tropical: boolean;
  barangays: boolean;
  onSatellite: () => void;
  onBuildingBlocks: () => void;
  onProjects: () => void;
  onBarangays: () => void;
  onQuakeHeat: () => void;
  onClimateReadings: () => void;
  onTropical: () => void;
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
  canSeeClimate,
  satellite,
  buildingBlocks,
  projects,
  quakeHeat,
  climateReadings,
  tropical,
  barangays,
  onSatellite,
  onBuildingBlocks,
  onProjects,
  onBarangays,
  onQuakeHeat,
  onClimateReadings,
  onTropical,
  onPointerDown,
}: Props) {
  if (!canSeeLayers && !canSeeRisk && !canSeeClimate) return null;

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
          <IconBtn
            label="Satellite"
            title="Satellite + terrain"
            active={satellite}
            onClick={onSatellite}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3a14 14 0 0 1 0 18" />
              <path d="M12 3a14 14 0 0 0 0 18" />
            </svg>
          </IconBtn>
          <IconBtn
            label="3D blocks"
            title="3D building blocks"
            active={buildingBlocks}
            onClick={onBuildingBlocks}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="10" width="7" height="11" />
              <rect x="14" y="6" width="7" height="15" />
              <path d="M6.5 10V7" />
              <path d="M17.5 6V3" />
            </svg>
          </IconBtn>
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

      {canSeeLayers && (canSeeRisk || canSeeClimate) && <div className="map-shortcut-gap" />}

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

      {canSeeRisk && canSeeClimate && <div className="map-shortcut-gap" />}

      {canSeeClimate && (
        <>
        <IconBtn
          label="Climate"
          title="Climate readings"
          active={climateReadings}
          onClick={onClimateReadings}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v2" />
            <path d="M12 19v2" />
            <path d="M5 8h3" />
            <path d="M16 8h3" />
            <path d="M6.2 18.2l1.8-1.8" />
            <path d="M16 16.4l1.8 1.8" />
            <circle cx="12" cy="12" r="4" />
            <path d="M8 12h8" />
          </svg>
        </IconBtn>
        <IconBtn
          label="Tropical"
          title="Tropical tracking (Invest / TC)"
          active={tropical}
          onClick={onTropical}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 12c3-3 7-3 9 0-2 4-6 6-9 6-5 0-8-3-8-7 0-3 2-5 5-5 2 0 3 1 3 3 0 2-1 3-3 3" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        </IconBtn>
        </>
      )}
    </div>
  );
}
