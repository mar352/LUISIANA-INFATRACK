import { useEffect, useRef, useMemo, useState } from "react";
import { CesiumMap, type CesiumMapHandle } from "./CesiumMap";
import type { Project } from "../types";
import { DEFAULT_MAP_SETTINGS, type MapSettings } from "../lib/map-settings";
import type { StadiaMapStyleId } from "../lib/stadia";
import { loadLuisianaRing, isInsideLuisiana, type LonLat } from "../lib/luisiana-polygon";
import {
  loadBarangayAreas,
  getNearestBarangay,
  type BarangayArea,
} from "../lib/barangay-overlay";
import { fetchGeoriskAssess, type GeoRiskAssess } from "../lib/luisiana-site-assess";
import { earthquakeProneModel, type EarthquakeGridCell } from "../lib/ml-earthquake";
import { getClupZone, normalizeBarangayName, type ClupZoneInfo } from "../lib/clup-zones";
import "./PinpointMapPicker.css";

/* ── Verified Centroids for All 23 Luisiana Barangays (100% Polygon-Conforming) ── */
export const BARANGAY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  "Barangay Zone I (Poblacion)": { lat: 14.1837, lon: 121.5089 },
  "Barangay Zone II (Poblacion)": { lat: 14.1839, lon: 121.5105 },
  "Barangay Zone III (Poblacion)": { lat: 14.1833, lon: 121.5114 },
  "Barangay Zone IV (Poblacion)": { lat: 14.1815, lon: 121.5145 },
  "Barangay Zone V (Poblacion)": { lat: 14.1854, lon: 121.5142 },
  "Barangay Zone VI (Poblacion)": { lat: 14.1860, lon: 121.5122 },
  "Barangay Zone VII (Poblacion)": { lat: 14.1860, lon: 121.5112 },
  "Barangay Zone VIII (Poblacion)": { lat: 14.1868, lon: 121.5098 },
  "De La Paz": { lat: 14.1835, lon: 121.5440 },
  "San Antonio": { lat: 14.1885, lon: 121.4910 },
  "San Buenaventura": { lat: 14.1850, lon: 121.5810 },
  "San Diego": { lat: 14.1810, lon: 121.4990 },
  "San Isidro": { lat: 14.1785, lon: 121.5110 },
  "San Jose": { lat: 14.2005, lon: 121.5130 },
  "San Juan": { lat: 14.2010, lon: 121.5220 },
  "San Luis": { lat: 14.1710, lon: 121.5020 },
  "San Pablo": { lat: 14.1915, lon: 121.5285 },
  "San Pedro": { lat: 14.1740, lon: 121.5255 },
  "San Rafael": { lat: 14.1585, lon: 121.5210 },
  "San Roque": { lat: 14.1580, lon: 121.5070 },
  "San Salvador": { lat: 14.2080, lon: 121.4860 },
  "Santo Domingo": { lat: 14.2070, lon: 121.5400 },
  "Santo Tomas": { lat: 14.1845, lon: 121.5185 },
};

/**
 * Robust barangay reverse-geocoding:
 * Uses polygon point-in-polygon if areas are ready, or falls back instantly
 * to the nearest verified centroid so reverse geocoding is never blocked!
 */
export function detectBarangayFromCoords(
  lon: number,
  lat: number,
  areas?: BarangayArea[] | null,
): string {
  if (areas && areas.length > 0) {
    const match = getNearestBarangay(lon, lat, areas);
    if (match) return match;
  }
  let best = "Barangay Zone I (Poblacion)";
  let minDist = Infinity;
  for (const [name, coords] of Object.entries(BARANGAY_COORDINATES)) {
    const d = (coords.lon - lon) ** 2 + (coords.lat - lat) ** 2;
    if (d < minDist) {
      minDist = d;
      best = name;
    }
  }
  return best;
}

/* Vector SVG Icons */
const IconPin = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconCenter = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="22" y1="12" x2="18" y2="12" />
    <line x1="6" y1="12" x2="2" y2="12" />
    <line x1="12" y1="6" x2="12" y2="2" />
    <line x1="12" y1="22" x2="12" y2="18" />
  </svg>
);

const IconLayers = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const IconMapStyle = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

const IconCheck = ({ size = 13, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconWarning = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconAlertCircle = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconShieldCheck = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const IconBuilding = ({ size = 15, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="9" y1="22" x2="9" y2="22.01" />
    <line x1="15" y1="22" x2="15" y2="22.01" />
    <line x1="9" y1="6" x2="9" y2="6.01" />
    <line x1="15" y1="6" x2="15" y2="6.01" />
    <line x1="9" y1="10" x2="9" y2="10.01" />
    <line x1="15" y1="10" x2="15" y2="10.01" />
    <line x1="9" y1="14" x2="9" y2="14.01" />
    <line x1="15" y1="14" x2="15" y2="14.01" />
    <line x1="9" y1="18" x2="9" y2="18.01" />
    <line x1="15" y1="18" x2="15" y2="18.01" />
  </svg>
);

const IconRefresh = ({ size = 15, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const IconQuakeWave = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 14c2-1 3.5-4 4-7 1 3 2 5 4 5s2.5-3 3-6c.8 3 2 6 5 8" />
    <path d="M4 19c3-2 5-2 8 0s5 2 8 0" />
  </svg>
);

const IconMaximize = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

const IconMinimize = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 14h6m0 0v6m0-6L3 21m17-11h-6m0 0V4m0 6 7-7M10 4v6m0 0H4m10 16v-6m0 0h6" />
  </svg>
);

type Props = {
  lon: number;
  lat: number;
  selectedBarangay: string;
  onLocationChange?: (coords: { lon: number; lat: number }) => void;
  onBarangayChange?: (barangay: string) => void;
  height?: number | string;
  showHazardToggles?: boolean;
  readOnly?: boolean;
  allowFullscreen?: boolean;
};

type StyleChoice = "outdoors" | "satellite" | "alidade_smooth" | "alidade_smooth_dark" | "stamen_watercolor" | "stamen_terrain" | "stamen_toner";

const STYLE_OPTIONS: { id: StyleChoice; label: string; desc: string }[] = [
  { id: "outdoors", label: "Outdoors", desc: "Topographic & lush terrain" },
  { id: "satellite", label: "Satellite", desc: "HD aerial photo imagery" },
  { id: "alidade_smooth", label: "Alidade Smooth", desc: "Clean, minimal modern light" },
  { id: "alidade_smooth_dark", label: "Smooth Dark", desc: "Sleek night & dark mode" },
  { id: "stamen_watercolor", label: "Watercolor", desc: "Artistic hand-painted style" },
  { id: "stamen_terrain", label: "Stamen Terrain", desc: "Hillshaded natural relief" },
  { id: "stamen_toner", label: "Stamen Toner", desc: "High-contrast bold B&W" },
];

export default function PinpointMapPicker({
  lon,
  lat,
  selectedBarangay,
  onLocationChange,
  onBarangayChange,
  height,
  showHazardToggles = false,
  readOnly = false,
  allowFullscreen = true,
}: Props) {
  const cesiumRef = useRef<CesiumMapHandle | null>(null);
  const ringRef = useRef<LonLat[] | null>(null);
  const areasRef = useRef<BarangayArea[] | null>(null);
  const isPinClickRef = useRef(false);
  const [boundaryWarning, setBoundaryWarning] = useState(false);
  const warningTimerRef = useRef<any>(null);

  // Fullscreen State & Trigger
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => {
      const next = !prev;
      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 50);
      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 250);
      return next;
    });
  };

  // Close fullscreen on ESC key
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
        }, 80);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // PHIVOLCS Geohazard Layer Toggles
  const [eil2010, setEil2010] = useState(false);
  const [eq2014, setEq2014] = useState(false);
  const [gsh2014, setGsh2014] = useState(false);
  const [hazardMenuOpen, setHazardMenuOpen] = useState(false);
  const hazardMenuRef = useRef<HTMLDivElement>(null);

  // Earthquake ML Heatmap Layer
  const [quakeHeat, setQuakeHeat] = useState(false);
  const [quakeGrid, setQuakeGrid] = useState<EarthquakeGridCell[]>([]);
  const [loadingQuake, setLoadingQuake] = useState(false);

  useEffect(() => {
    if (!quakeHeat) return;
    if (quakeGrid.length > 0) return;
    let cancelled = false;
    setLoadingQuake(true);
    earthquakeProneModel
      .ensureReady()
      .then(() => earthquakeProneModel.buildMapLayer())
      .then((cells) => {
        if (!cancelled) {
          setQuakeGrid(cells);
          setLoadingQuake(false);
        }
      })
      .catch((err) => {
        console.warn("[PinpointMapPicker] Earthquake model failed:", err);
        if (!cancelled) setLoadingQuake(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quakeHeat, quakeGrid.length]);

  // Load official boundary ring & barangay areas for spatial validation & reverse-geocoding
  useEffect(() => {
    loadLuisianaRing()
      .then((ring) => {
        ringRef.current = ring;
      })
      .catch((err) => {
        console.warn("[PinpointMapPicker] Failed to load Luisiana boundary ring:", err);
      });

    loadBarangayAreas()
      .then((areas) => {
        areasRef.current = areas;
      })
      .catch((err) => {
        console.warn("[PinpointMapPicker] Failed to load barangay areas:", err);
      });
  }, []);

  // Live Hazard Assessment on the plotted pin
  const [geoRisk, setGeoRisk] = useState<GeoRiskAssess | null>(null);
  const [loadingHazard, setLoadingHazard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingHazard(true);
    fetchGeoriskAssess(lat, lon)
      .then((res) => {
        if (!cancelled) {
          setGeoRisk(res);
          setLoadingHazard(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingHazard(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  const hazardStatus = useMemo(() => {
    if (loadingHazard) {
      return {
        type: "checking" as const,
        icon: <IconRefresh size={15} color="#38bdf8" />,
        tag: "System Check",
        text: "Analyzing terrain slope, landslide susceptibility, and flood layers…",
      };
    }

    const ls = geoRisk?.landslide?.value?.toLowerCase() || "";
    const fl = geoRisk?.flood?.value?.toLowerCase() || "";

    const isHigh =
      ls.includes("high") ||
      ls.includes("very high") ||
      ls.includes("debris") ||
      fl.includes("high") ||
      fl.includes("very high");

    const isModerate =
      ls.includes("moderate") ||
      ls.includes("medium") ||
      fl.includes("moderate") ||
      fl.includes("medium");

    if (isHigh) {
      const detail = geoRisk?.landslide?.value || geoRisk?.flood?.value || "High Susceptibility";
      return {
        type: "alert" as const,
        icon: <IconWarning size={16} color="#ef4444" />,
        tag: "System Alert",
        text: `System Alert: Location falls under a high-slope terrain (${detail}).`,
      };
    }

    if (isModerate) {
      const detail = geoRisk?.landslide?.value || geoRisk?.flood?.value || "Moderate Hazard";
      return {
        type: "moderate" as const,
        icon: <IconAlertCircle size={16} color="#f59e0b" />,
        tag: "Caution",
        text: `Caution: Location falls under a moderate-slope terrain (${detail}).`,
      };
    }

    return {
      type: "safe" as const,
      icon: <IconShieldCheck size={16} color="#10b981" />,
      tag: "Safe Zone",
      text: "Safe Zone: Landslide and Flood Hazard Assessment Low.",
    };
  }, [loadingHazard, geoRisk]);

  // Active/Detected barangay state (initialized to normalized selectedBarangay, but updates immediately on map clicks)
  const [activeBarangay, setActiveBarangay] = useState<string>(() => normalizeBarangayName(selectedBarangay));

  useEffect(() => {
    if (selectedBarangay) {
      setActiveBarangay(normalizeBarangayName(selectedBarangay));
    }
  }, [selectedBarangay]);

  // CLUP Zoning Classification for the currently selected/pinned barangay
  const zoningInfo = useMemo<ClupZoneInfo>(() => getClupZone(activeBarangay), [activeBarangay]);

  // Map Layer Toggles (Barangay overlay OFF by default)
  const [barangaysVisible, setBarangaysVisible] = useState(false);
  const [activeStyle, setActiveStyle] = useState<StyleChoice>("outdoors");
  const [isStyleLoading, setIsStyleLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [brgyMenuOpen, setBrgyMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const brgyMenuRef = useRef<HTMLDivElement>(null);

  // Preload map styles into browser HTTP cache so switching styles is already loaded
  useEffect(() => {
    const styles = [
      "outdoors",
      "alidade_smooth",
      "alidade_smooth_dark",
      "stamen_terrain",
      "stamen_watercolor",
      "stamen_toner",
    ];
    styles.forEach((s) => {
      const img = new Image();
      img.src = `https://tiles.stadiamaps.com/tiles/${s}/14/13715/7603.png`;
    });
  }, []);

  const handleSelectStyle = (id: StyleChoice) => {
    if (id === activeStyle) {
      setMenuOpen(false);
      return;
    }
    setIsStyleLoading(true);
    setActiveStyle(id);
    setMenuOpen(false);
    setTimeout(() => {
      setIsStyleLoading(false);
    }, 850);
  };

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (brgyMenuRef.current && !brgyMenuRef.current.contains(target)) {
        setBrgyMenuOpen(false);
      }
      if (hazardMenuRef.current && !hazardMenuRef.current.contains(target)) {
        setHazardMenuOpen(false);
      }
    };
    if (menuOpen || brgyMenuOpen || hazardMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen, brgyMenuOpen, hazardMenuOpen]);

  // Representation of the pinned site on the Cesium globe
  const pinnedProjects = useMemo<Project[]>(() => {
    return [
      {
        id: "pinpoint_site_pin",
        name: "Lokasyon ng Proyekto",
        type: "Private Building",
        category: "Building",
        status: "Planned",
        progress: 0,
        budget: 0,
        spent: 0,
        department: "MPDC",
        siteMarkerOnly: true,
        isPrivateApplication: true,
        isPickerPin: true,
        markerColor: "#ea4335", // Classic red pin matching user photo
        location: {
          lon,
          lat,
          barangay: activeBarangay,
        },
      } as unknown as Project,
    ];
  }, [lon, lat, activeBarangay]);

  // When barangay changes from external selector, fly to its centroid (in editable mode only)
  useEffect(() => {
    if (readOnly) return;
    if (isPinClickRef.current) {
      isPinClickRef.current = false;
      return;
    }
    const norm = normalizeBarangayName(selectedBarangay);
    const coords = BARANGAY_COORDINATES[norm] || BARANGAY_COORDINATES[selectedBarangay];
    if (coords && cesiumRef.current) {
      cesiumRef.current.flyToLonLat(coords.lon, coords.lat, 2200);
      onLocationChange?.({ lon: coords.lon, lat: coords.lat });
    }
  }, [selectedBarangay, readOnly]);

  const handleZoomIn = () => {
    cesiumRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    cesiumRef.current?.zoomOut();
  };

  const handleRecenter = () => {
    if (readOnly && lat && lon) {
      cesiumRef.current?.flyToLonLat(lon, lat, 2200);
      return;
    }
    const target =
      BARANGAY_COORDINATES[activeBarangay] ||
      BARANGAY_COORDINATES[selectedBarangay] || { lon: 121.5089, lat: 14.1837 };
    cesiumRef.current?.flyToLonLat(target.lon, target.lat, 2400);
  };

  const isSatellite = activeStyle === "satellite";
  const basemapStyleId = (isSatellite ? "outdoors" : activeStyle) as StadiaMapStyleId;

  const mapSettings = useMemo<MapSettings>(() => {
    return {
      ...DEFAULT_MAP_SETTINGS,
      basemapStyle: basemapStyleId,
      shadowsEnabled: false,
      shadowQuality: "low",
      terrainQuality: "low",
      motionBlur: 0,
      targetFps: 60,
    };
  }, [basemapStyleId]);

  return (
    <div className={`pinpoint-map-wrapper${isFullscreen ? " pinpoint-map-wrapper--fullscreen" : ""}`}>
      {/* Map Header with Toggles */}
      <div className="pinpoint-map-header">
        <div className="pinpoint-map-title">
          <IconPin size={16} color="#38bdf8" />
          <span>Interactive Cesium Map (May Border ng Luisiana)</span>
        </div>

        {/* Toggles Bar: Barangays, Roads & Map Styles */}
        <div className="pinpoint-toggles-bar">
          {/* Fullscreen Toggle Button */}
          {allowFullscreen && (
            <button
              type="button"
              className={`pinpoint-toggle-btn ${isFullscreen ? "active" : ""}`}
              onClick={toggleFullscreen}
              title={isFullscreen ? "I-exit ang Fullscreen (ESC)" : "I-fullscreen ang Mapa"}
            >
              {isFullscreen ? <IconMinimize size={13} /> : <IconMaximize size={13} />}
              <span>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</span>
            </button>
          )}

          {/* Real-time CLUP Urban Commercial / Rural Status Pill */}
          <div
            className={`pinpoint-zone-pill ${zoningInfo.isCommercial ? "is-commercial" : "is-outlying"}`}
            title={zoningInfo.desc}
          >
            <IconBuilding size={13} color={zoningInfo.badgeColor} />
            <span>
              Sona: <strong style={{ color: zoningInfo.badgeColor }}>{zoningInfo.name}</strong>
            </span>
          </div>

          {/* Barangay Dropdown */}
          <div className="pinpoint-dropdown-wrap" ref={brgyMenuRef}>
            <button
              type="button"
              className={`pinpoint-toggle-btn ${barangaysVisible ? "active" : ""}`}
              onClick={() => {
                setBrgyMenuOpen((o) => !o);
                setMenuOpen(false);
              }}
              title="Pumili ng barangay o i-toggle ang overlay"
            >
              <IconLayers size={13} />
              <span>Barangay: {barangaysVisible ? activeBarangay.replace(" (Poblacion)", "") : "OFF"}</span>
              <span style={{ fontSize: 9 }}>▼</span>
            </button>

            {brgyMenuOpen && (
              <div className="pinpoint-menu-popover pinpoint-menu-popover--scrollable">
                <div className="pinpoint-menu-section-header">Overlay Visibility</div>
                <button
                  type="button"
                  className={`pinpoint-menu-item ${barangaysVisible ? "active" : ""}`}
                  onClick={() => {
                    setBarangaysVisible(true);
                    setBrgyMenuOpen(false);
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>Ipakita ang Lahat ng Barangay</div>
                    <div style={{ fontSize: 10.5, opacity: 0.65 }}>Colored overlays ON</div>
                  </div>
                  {barangaysVisible && <IconCheck color="#fff" size={14} />}
                </button>

                <button
                  type="button"
                  className={`pinpoint-menu-item ${!barangaysVisible ? "active" : ""}`}
                  onClick={() => {
                    setBarangaysVisible(false);
                    setBrgyMenuOpen(false);
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>Itago ang mga Barangay</div>
                    <div style={{ fontSize: 10.5, opacity: 0.65 }}>Outer border lang ng Luisiana</div>
                  </div>
                  {!barangaysVisible && <IconCheck color="#fff" size={14} />}
                </button>

                <div className="pinpoint-menu-divider" />
                <div className="pinpoint-menu-section-header">Pumili ng Barangay</div>

                {Object.keys(BARANGAY_COORDINATES).map((bName) => {
                  const isSelected = activeBarangay === bName;
                  const bZone = getClupZone(bName);
                  return (
                    <button
                      key={bName}
                      type="button"
                      className={`pinpoint-menu-item ${isSelected && barangaysVisible ? "active" : ""}`}
                      onClick={() => {
                        setBarangaysVisible(true);
                        setActiveBarangay(bName);
                        const coords = BARANGAY_COORDINATES[bName];
                        if (coords) {
                          cesiumRef.current?.flyToLonLat(coords.lon, coords.lat, 2200);
                          if (!readOnly && onLocationChange) {
                            onLocationChange({ lon: coords.lon, lat: coords.lat });
                          }
                        }
                        if (!readOnly && onBarangayChange) {
                          onBarangayChange(bName);
                        }
                        setBrgyMenuOpen(false);
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                        <div style={{ fontWeight: isSelected ? 700 : 500, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <span>{bName}</span>
                          <span className={`pinpoint-menu-zone-badge ${bZone.isCommercial ? "is-comm" : "is-outlying"}`}>
                            {bZone.isCommercial ? "URBAN / COMMERCIAL" : "RURAL ZONE"}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: bZone.badgeColor,
                            opacity: 0.85,
                            marginTop: 1,
                          }}
                        >
                          {bZone.name}
                        </div>
                      </div>
                      {isSelected && <IconCheck color="#fff" size={13} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Map Style Selector Dropdown */}
          <div className="pinpoint-dropdown-wrap" ref={menuRef}>
            <button
              type="button"
              className="pinpoint-toggle-btn active"
              onClick={() => setMenuOpen((o) => !o)}
              title="Pumili ng map style layer"
            >
              <IconMapStyle size={13} />
              <span>Style: {STYLE_OPTIONS.find((s) => s.id === activeStyle)?.label || "Outdoors"}</span>
              {isStyleLoading && <span className="pinpoint-style-spinner" title="Loading tiles…" />}
              <span style={{ fontSize: 9 }}>▼</span>
            </button>

            {menuOpen && (
              <div className="pinpoint-menu-popover">
                {STYLE_OPTIONS.map((opt) => {
                  const isSelected = activeStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`pinpoint-menu-item ${isSelected ? "active" : ""}`}
                      onClick={() => handleSelectStyle(opt.id)}
                    >
                      <div>
                        <div style={{ fontWeight: isSelected ? 700 : 600 }}>{opt.label}</div>
                        <div style={{ fontSize: 10.5, opacity: 0.65 }}>{opt.desc}</div>
                      </div>
                      {isSelected && <IconCheck color="#fff" size={14} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Geohazard & Quake Heatmap Toggles */}
          {showHazardToggles && (
            <>
              {/* Dedicated Quake Heatmap Toggle Button */}
              <button
                type="button"
                className={`pinpoint-toggle-btn ${quakeHeat ? "active" : ""}`}
                onClick={() => setQuakeHeat((v) => !v)}
                title="I-toggle ang Earthquake-Prone Heatmap (ML Model + PHIVOLCS EIL 2014)"
              >
                <IconQuakeWave size={13} />
                <span>Quake Heat{loadingQuake ? "…" : ""}</span>
              </button>

              <div className="pinpoint-dropdown-wrap" ref={hazardMenuRef}>
                <button
                  type="button"
                  className={`pinpoint-toggle-btn ${eil2010 || eq2014 || gsh2014 || quakeHeat ? "active" : ""}`}
                  onClick={() => {
                    setHazardMenuOpen((o) => !o);
                    setMenuOpen(false);
                    setBrgyMenuOpen(false);
                  }}
                  title="I-toggle ang PHIVOLCS Geohazard layers"
                >
                  <IconLayers size={13} />
                  <span>
                    Hazards:{" "}
                    {eil2010 || eq2014 || gsh2014 || quakeHeat
                      ? [eil2010 ? "EIL" : "", eq2014 ? "EQ" : "", gsh2014 ? "GSH" : "", quakeHeat ? "HEAT" : ""]
                          .filter(Boolean)
                          .join("+")
                      : "OFF"}
                  </span>
                  <span style={{ fontSize: 9 }}>▼</span>
                </button>

                {hazardMenuOpen && (
                  <div className="pinpoint-menu-popover">
                    <div className="pinpoint-menu-section-header">PHIVOLCS Geohazards</div>
                    <button
                      type="button"
                      className={`pinpoint-menu-item ${eil2010 ? "active" : ""}`}
                      onClick={() => setEil2010((v) => !v)}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>EIL Landslide (2010)</div>
                        <div style={{ fontSize: 10.5, opacity: 0.65 }}>Earthquake-induced landslide hazard</div>
                      </div>
                      {eil2010 && <IconCheck color="#fff" size={14} />}
                    </button>
                    <button
                      type="button"
                      className={`pinpoint-menu-item ${gsh2014 ? "active" : ""}`}
                      onClick={() => setGsh2014((v) => !v)}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>Ground Shaking (GSH 2014)</div>
                        <div style={{ fontSize: 10.5, opacity: 0.65 }}>PEIS ground shaking intensity map</div>
                      </div>
                      {gsh2014 && <IconCheck color="#fff" size={14} />}
                    </button>
                    <button
                      type="button"
                      className={`pinpoint-menu-item ${eq2014 ? "active" : ""}`}
                      onClick={() => setEq2014((v) => !v)}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>Active Fault &amp; EQ (2014)</div>
                        <div style={{ fontSize: 10.5, opacity: 0.65 }}>Seismic source &amp; faultlines</div>
                      </div>
                      {eq2014 && <IconCheck color="#fff" size={14} />}
                    </button>

                    <div className="pinpoint-menu-divider" />
                    <div className="pinpoint-menu-section-header">ML Hazard Assessment</div>
                    <button
                      type="button"
                      className={`pinpoint-menu-item ${quakeHeat ? "active" : ""}`}
                      onClick={() => setQuakeHeat((v) => !v)}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>Earthquake-Prone Heatmap</div>
                        <div style={{ fontSize: 10.5, opacity: 0.65 }}>
                          {loadingQuake ? "Loading model…" : "ML model + PHIVOLCS EIL 2014 heatmap"}
                        </div>
                      </div>
                      {quakeHeat && <IconCheck color="#fff" size={14} />}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cesium Globe Canvas */}
      <div className="pinpoint-map-container" style={height ? { height } : undefined}>
        <CesiumMap
          ref={cesiumRef}
          projects={pinnedProjects}
          visible={true}
          paused={false}
          barangaysVisible={barangaysVisible}
          focusedBarangay={barangaysVisible ? selectedBarangay : null}
          satellite={isSatellite}
          terrainEnabled={isSatellite}
          clusteringEnabled={false}
          hazardOverlays={showHazardToggles ? { eil2010, eq2014, gsh2014 } : undefined}
          earthquakeEnabled={quakeHeat}
          earthquakeGrid={quakeGrid}
          mapSettings={mapSettings}
          placementMode={!readOnly}
          placementTool={readOnly ? undefined : "pin"}
          readOnly={readOnly}
          onPlaceClick={
            readOnly
              ? undefined
              : (pos) => {
                  const clickedLon = Number(pos.lng.toFixed(6));
                  const clickedLat = Number(pos.lat.toFixed(6));

                  // Boundary validation: cannot pinpoint outside Luisiana border!
                  if (ringRef.current && !isInsideLuisiana(clickedLon, clickedLat, ringRef.current)) {
                    setBoundaryWarning(true);
                    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
                    warningTimerRef.current = setTimeout(() => {
                      setBoundaryWarning(false);
                    }, 4000);
                    return;
                  }

                  setBoundaryWarning(false);
                  isPinClickRef.current = true;

                  // Auto-detect which barangay the pinned point falls inside!
                  const detected = detectBarangayFromCoords(clickedLon, clickedLat, areasRef.current);
                  if (detected) {
                    setActiveBarangay(detected);
                    onBarangayChange?.(detected);
                  }

                  if (onLocationChange) {
                    onLocationChange({
                      lon: clickedLon,
                      lat: clickedLat,
                    });
                  }
                }
          }
        />

        {/* Boundary Alert Toast */}
        {boundaryWarning && (
          <div className="pinpoint-boundary-alert">
            <IconWarning size={16} color="#ffffff" />
            <span>Bawal mag-pinpoint sa labas ng border ng Bayan ng Luisiana!</span>
          </div>
        )}

        {/* Floating Controls */}
        <div className="pinpoint-controls">
          {allowFullscreen && (
            <button
              type="button"
              className={`pinpoint-btn ${isFullscreen ? "active" : ""}`}
              onClick={toggleFullscreen}
              title={isFullscreen ? "I-exit ang Fullscreen (ESC)" : "I-fullscreen ang Mapa"}
            >
              {isFullscreen ? <IconMinimize size={15} /> : <IconMaximize size={15} />}
            </button>
          )}
          <button type="button" className="pinpoint-btn" onClick={handleZoomIn} title="Zoom In">
            +
          </button>
          <button type="button" className="pinpoint-btn" onClick={handleZoomOut} title="Zoom Out">
            -
          </button>
          <button type="button" className="pinpoint-btn" onClick={handleRecenter} title="I-center sa Barangay">
            <IconCenter />
          </button>
        </div>

        {/* Floating Fullscreen Exit Pill for fast exit */}
        {isFullscreen && (
          <button
            type="button"
            className="pinpoint-fullscreen-exit-pill"
            onClick={toggleFullscreen}
            title="I-exit ang Fullscreen (Pindutin ang ESC o i-click ito)"
          >
            <IconMinimize size={14} />
            <span>I-exit ang Fullscreen (ESC)</span>
          </button>
        )}

        {/* Real-time Coordinates & CLUP Zoning Classification Badge */}
        <div className="pinpoint-coords-badge">
          <div className="pinpoint-coords-label">
            {readOnly ? "Naka-pin na Lokasyon ng Lote:" : "Nai-pinpoint na Coordinate:"}
          </div>
          <div className="pinpoint-coords-val">
            {lat.toFixed(6)}° N, {lon.toFixed(6)}° E
          </div>
          <div className="pinpoint-coords-brgy">
            {activeBarangay}
          </div>
          <div
            className={`pinpoint-coords-zone-pill ${zoningInfo.isCommercial ? "is-commercial" : "is-outlying"}`}
            style={{
              color: zoningInfo.badgeColor,
              background: zoningInfo.badgeBg,
              borderColor: zoningInfo.borderColor,
            }}
          >
            <IconBuilding size={12} color={zoningInfo.badgeColor} />
            <span>
              <strong>{zoningInfo.name}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Live Hazard & Zoning Banner directly below the Map */}
      <div className={`pinpoint-hazard-banner ${hazardStatus.type}`}>
        <div className="pinpoint-hazard-banner-content">
          <span className="pinpoint-hazard-banner-icon">{hazardStatus.icon}</span>
          <span className="pinpoint-hazard-banner-text">{hazardStatus.text}</span>
        </div>
        <div className="pinpoint-hazard-banner-tags">
          <span
            className={`pinpoint-banner-zone-tag ${zoningInfo.isCommercial ? "is-commercial" : "is-outlying"}`}
            style={{
              color: zoningInfo.badgeColor,
              background: zoningInfo.badgeBg,
              border: `1px solid ${zoningInfo.borderColor}`,
            }}
          >
            {zoningInfo.name}
          </span>
          <span className="pinpoint-hazard-banner-tag">{hazardStatus.tag}</span>
        </div>
      </div>
    </div>
  );
}
