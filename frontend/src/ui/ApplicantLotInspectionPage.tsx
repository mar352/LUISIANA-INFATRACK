import React, { useState, useEffect, useMemo, useRef } from "react";
import maplibregl, { type Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ArrowLeft,
  Building2,
  HardHat,
  MapPin,
  Layers,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Camera,
  RotateCcw,
  Eye,
  Check,
  Compass,
} from "lucide-react";
import { SiteProgressPopup } from "./SiteProgressPopup";
import {
  stadiaStyleUrl,
  STADIA_MAP_STYLES,
  type StadiaMapStyleId,
} from "../lib/stadia";
import { normalizeBarangayName, getClupZone, type ClupZoneInfo } from "../lib/clup-zones";
import { banahawDistanceKm, fetchGeoriskAssess, type GeoRiskAssess } from "../lib/luisiana-site-assess";
import { BARANGAY_COORDINATES } from "./PinpointMapPicker";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle, useTranslation } from "./LanguageToggle";
import "./PublicTransparencyPortal.css";

// Center coordinate for Luisiana, Laguna
const LUISIANA_CENTER = { lon: 121.5089, lat: 14.1837 };

// Layer IDs for Luisiana Municipal Border and Barangays
const SOURCE_BOUNDARY = "alip-boundary-source";
const LAYER_BOUNDARY_FILL = "alip-boundary-fill";
const LAYER_BOUNDARY_CASING = "alip-boundary-casing";
const LAYER_BOUNDARY_LINE = "alip-boundary-line";

const SOURCE_BARANGAYS = "alip-barangays-source";
const SOURCE_BARANGAY_LABELS = "alip-barangay-labels";
const LAYER_BARANGAYS_FILL = "alip-barangays-fill";
const LAYER_BARANGAYS_LINE = "alip-barangays-line";
const LAYER_BARANGAYS_LABEL = "alip-barangays-label";

// In-memory module cache for geojson files
let cachedBoundaryGeoJson: GeoJSON.FeatureCollection | null = null;
let cachedBarangayGeoJson: GeoJSON.FeatureCollection | null = null;
let cachedBarangayLabelsGeoJson: GeoJSON.FeatureCollection | null = null;

function shortLabel(name: string): string {
  return name
    .replace(/^Barangay\s+/i, "")
    .replace(/\s*\(Poblacion\)\s*/i, "")
    .trim();
}

export interface ApplicantLotInspectionPageProps {
  application: any;
  onBack: () => void;
  isEn?: boolean;
}

export function ApplicantLotInspectionPage({
  application,
  onBack,
  isEn = false,
}: ApplicantLotInspectionPageProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  // Basemap style state (Outdoors default for rich topography)
  const [activeStadiaStyle, setActiveStadiaStyle] = useState<StadiaMapStyleId>("outdoors");
  const [isStylePickerOpen, setIsStylePickerOpen] = useState(false);

  // Sidebar and Pop-up states (identical to PublicTransparencyPortal)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(true);

  // Official Engineering Panel Street View Popup State
  const [isStreetViewOpen, setIsStreetViewOpen] = useState(false);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isStreetViewOpen) {
          setIsStreetViewOpen(false);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isStreetViewOpen, onBack]);

  // Extract coordinates strictly from applicant's lot with barangay and Luisiana safe fallbacks
  const rawBarangay = application?.applicant?.barangay || "Barangay Zone I (Poblacion)";
  const normalizedBrgy = useMemo(() => normalizeBarangayName(rawBarangay), [rawBarangay]);
  const zoningInfo: ClupZoneInfo = useMemo(() => getClupZone(normalizedBrgy), [normalizedBrgy]);

  const brgyCenter = BARANGAY_COORDINATES[normalizedBrgy] || { lat: 14.1852, lon: 121.5126 };
  const applicantLat = useMemo(() => {
    const raw = Number(
      application?.lotDetails?.coordinates?.lat ??
      application?.lotDetails?.lat ??
      application?.latitude ??
      brgyCenter.lat
    );
    return isFinite(raw) && raw !== 0 ? raw : brgyCenter.lat;
  }, [application, brgyCenter]);

  const applicantLon = useMemo(() => {
    const raw = Number(
      application?.lotDetails?.coordinates?.lon ??
      application?.lotDetails?.lon ??
      application?.longitude ??
      brgyCenter.lon
    );
    return isFinite(raw) && raw !== 0 ? raw : brgyCenter.lon;
  }, [application, brgyCenter]);

  // Georisk evaluation for the applicant's lot
  const [geoRisk, setGeoRisk] = useState<GeoRiskAssess | null>(() => application?.geoRisk || null);
  const [loadingHazard, setLoadingHazard] = useState(false);

  useEffect(() => {
    if (!geoRisk && applicantLat && applicantLon) {
      let active = true;
      setLoadingHazard(true);
      fetchGeoriskAssess(applicantLat, applicantLon)
        .then((res) => {
          if (active) {
            setGeoRisk(res);
            setLoadingHazard(false);
          }
        })
        .catch(() => {
          if (active) setLoadingHazard(false);
        });
      return () => {
        active = false;
      };
    }
  }, [applicantLat, applicantLon, geoRisk]);

  const banahaw = useMemo(() => {
    const res = banahawDistanceKm(applicantLat, applicantLon);
    return typeof res?.km === "number" ? res.km : 13.5;
  }, [applicantLat, applicantLon]);

  // Extract inspection records
  const ocular = application?.ocularInspection || null;
  const siteInspections = Array.isArray(application?.inspectionPhotos) ? application.inspectionPhotos : [];
  const latestInsp = application?.latestInspection || null;
  const inspProgress = Number(application?.progress ?? latestInsp?.progress ?? 0);

  // Setback compliance state
  const setbacks = ocular?.setbacks || {
    roadSetback: ocular?.setbackFront ?? true,
    waterwayEasement: ocular?.setbackRear ?? true,
    faultLineClearance: ocular?.setbackSides ?? true,
    boundaryMonuments: true,
  };

  // Map application data directly to the official Project shape used by SiteProgressPopup
  const projectForStreetView = useMemo(() => {
    const photosList: any[] = [];

    // Ocular inspection photos (Hakbang 2: Zoning Officer Ocular Inspection)
    const ocularPhotosList =
      (application as any)?.ocularPhotos ||
      (application as any)?.ocularInspection?.photos ||
      (application as any)?.ocular?.photos ||
      ocular?.photos ||
      [];
    if (Array.isArray(ocularPhotosList)) {
      ocularPhotosList.forEach((p: any, idx: number) => {
        const u = typeof p === "string" ? p : p.previewUrl || p.url;
        if (u && !photosList.some((existing) => existing.url === u)) {
          photosList.push({
            id: `ocular-${idx}`,
            url: u,
            stage: "before",
            progress: 0,
            caption: p.name || p.originalName || `Ocular Inspection Photo #${idx + 1}`,
            uploadedAt: (application as any)?.ocularInspection?.inspectedAt || (application as any)?.ocular?.inspectedAt || ocular?.date || ocular?.inspectedAt,
            inspector: (application as any)?.ocularInspection?.inspectingOfficer || (application as any)?.ocular?.inspectingOfficer || ocular?.inspectingOfficer || "Edward B. Romulo, EnP. (Zoning Officer)",
          });
        }
      });
    }

    // Site progress timeline photos (from engineering)
    siteInspections.forEach((insp: any, idx: number) => {
      const u = insp.photoUrl || insp.url;
      if (u) {
        const prog = Number(insp.progress ?? inspProgress);
        const stage = prog >= 100 ? "after" : prog >= 30 ? "during" : "before";
        photosList.push({
          id: insp.id || `insp-${idx}`,
          url: u,
          stage,
          progress: prog,
          caption: insp.stageLabel || insp.remarks || `Site Progress Photo #${idx + 1}`,
          uploadedAt: insp.timestamp || insp.inspectedAt,
          inspector: insp.inspector || "Municipal Engineering Office",
        });
      }
    });

    // Uploaded photoDocs from citizen
    if (application?.uploads?.photoDocs && Array.isArray(application.uploads.photoDocs)) {
      application.uploads.photoDocs.forEach((doc: any, idx: number) => {
        if (doc?.url && !photosList.some((p) => p.url === doc.url)) {
          photosList.push({
            id: `doc-${idx}`,
            url: doc.url,
            stage: "before",
            progress: 0,
            caption: doc.originalName || "Site Photo Documentation",
            uploadedAt: application.createdAt,
          });
        }
      });
    }

    // Baseline fallback if empty
    if (photosList.length === 0) {
      photosList.push({
        id: "baseline-1",
        url: "/sample-geotagged-site-photo.jpg",
        stage: "before",
        progress: 0,
        caption: "Luisiana Verified Site Panorama Baseline",
        uploadedAt: application?.createdAt,
      });
    }

    return {
      id: application?.id || application?.trackingNumber || "applicant-lot",
      trackingNumber: application?.trackingNumber || "LUIS-ZC-2026-XXXX",
      name: application?.lotDetails?.proposedBuildingType || application?.projectTitle || "Residential Structure",
      type: "Building Permit / Zoning Clearance",
      barangay: normalizedBrgy,
      location: {
        lat: applicantLat,
        lon: applicantLon,
      },
      progress: inspProgress,
      stage: inspProgress >= 100 ? "after" : inspProgress >= 50 ? "during" : "before",
      inspectionPhotos: photosList,
      photos: photosList.map((p) => ({
        id: p.id,
        url: p.url,
        kind: "progress",
        caption: p.caption,
        uploadedAt: p.uploadedAt,
      })),
      latestInspection: siteInspections[siteInspections.length - 1] || (photosList.length > 0 ? {
        stage: inspProgress >= 100 ? "after" : inspProgress >= 50 ? "during" : "before",
        progress: inspProgress,
        photoUrl: photosList[0]?.url,
        inspectedAt: ocular?.date || application?.createdAt,
        remarks: ocular?.remarks || "Site evaluated compliant with zoning setback guidelines.",
        inspector: ocular?.inspectingOfficer || "Authorized Building & Site Inspector",
      } : null),
      remarks: application?.remarks || [],
    } as any;
  }, [application, ocular, siteInspections, inspProgress, normalizedBrgy, applicantLat, applicantLon]);

  // Primary site photo for thumbnail box
  const primaryPhotoUrl = projectForStreetView?.inspectionPhotos?.[0]?.url || "/sample-geotagged-site-photo.jpg";

  // ── SETUP LUISIANA MUNICIPAL BOUNDARY (Exact PublicTransparencyPortal code) ──
  const syncBoundaryLayers = async (map: MapLibreMap) => {
    if (!map.isStyleLoaded()) return;

    if (!cachedBoundaryGeoJson) {
      try {
        const res = await fetch("/data/luisiana-boundary.geojson");
        if (res.ok) {
          cachedBoundaryGeoJson = (await res.json()) as GeoJSON.FeatureCollection;
        }
      } catch (err) {
        console.warn("[ApplicantLotInspectionPage] Boundary fetch failed:", err);
        return;
      }
    }

    if (!cachedBoundaryGeoJson || !map.isStyleLoaded()) return;

    if (!map.getSource(SOURCE_BOUNDARY)) {
      map.addSource(SOURCE_BOUNDARY, {
        type: "geojson",
        data: cachedBoundaryGeoJson,
      });
    }

    // 1. Subtle emerald tint inside Luisiana municipal boundary
    if (!map.getLayer(LAYER_BOUNDARY_FILL)) {
      map.addLayer({
        id: LAYER_BOUNDARY_FILL,
        type: "fill",
        source: SOURCE_BOUNDARY,
        paint: {
          "fill-color": "#10b981",
          "fill-opacity": 0.08,
        },
      });
    }

    // 2. High-contrast white casing for outer boundary line
    if (!map.getLayer(LAYER_BOUNDARY_CASING)) {
      map.addLayer({
        id: LAYER_BOUNDARY_CASING,
        type: "line",
        source: SOURCE_BOUNDARY,
        paint: {
          "line-color": "#ffffff",
          "line-width": 6,
          "line-opacity": 0.85,
        },
      });
    }

    // 3. Crisp dark boundary perimeter line
    if (!map.getLayer(LAYER_BOUNDARY_LINE)) {
      map.addLayer({
        id: LAYER_BOUNDARY_LINE,
        type: "line",
        source: SOURCE_BOUNDARY,
        paint: {
          "line-color": "#0f172a",
          "line-width": 3.2,
          "line-opacity": 1.0,
        },
      });
    }
  };

  // ── SETUP COLOR-CODED BARANGAY AREAS & LABELS (Exact PublicTransparencyPortal code) ──
  const syncBarangayLayers = async (map: MapLibreMap) => {
    if (!map.isStyleLoaded()) return;

    if (!cachedBarangayGeoJson) {
      try {
        const res = await fetch("/data/luisiana-barangays.geojson");
        if (res.ok) {
          const gj = (await res.json()) as GeoJSON.FeatureCollection;
          cachedBarangayGeoJson = gj;

          const labelFeatures: GeoJSON.Feature[] = [];
          for (const f of gj.features ?? []) {
            const name = String(f.properties?.name ?? "");
            const ring = f.geometry?.type === "Polygon" ? (f.geometry as GeoJSON.Polygon).coordinates?.[0] : null;
            if (!name || !ring || ring.length < 4) continue;
            let sumLon = 0;
            let sumLat = 0;
            const n = ring.length - 1;
            for (let k = 0; k < n; k++) {
              sumLon += ring[k][0];
              sumLat += ring[k][1];
            }
            labelFeatures.push({
              type: "Feature",
              properties: {
                name,
                label: shortLabel(name),
              },
              geometry: {
                type: "Point",
                coordinates: [sumLon / n, sumLat / n],
              },
            });
          }
          cachedBarangayLabelsGeoJson = {
            type: "FeatureCollection",
            features: labelFeatures,
          };
        }
      } catch (err) {
        console.warn("[ApplicantLotInspectionPage] Barangays fetch failed:", err);
        return;
      }
    }

    if (!cachedBarangayGeoJson || !map.isStyleLoaded()) return;

    if (!map.getSource(SOURCE_BARANGAYS)) {
      map.addSource(SOURCE_BARANGAYS, {
        type: "geojson",
        data: cachedBarangayGeoJson,
      });
    }

    if (!map.getLayer(LAYER_BARANGAYS_FILL)) {
      map.addLayer({
        id: LAYER_BARANGAYS_FILL,
        type: "fill",
        source: SOURCE_BARANGAYS,
        paint: {
          "fill-color": [
            "match",
            ["get", "name"],
            "Barangay Zone I (Poblacion)", "#38bdf8",
            "Barangay Zone II (Poblacion)", "#818cf8",
            "Barangay Zone III (Poblacion)", "#fb7185",
            "Barangay Zone IV (Poblacion)", "#fbbf24",
            "Barangay Zone V (Poblacion)", "#34d399",
            "Barangay Zone VI (Poblacion)", "#a78bfa",
            "Barangay Zone VII (Poblacion)", "#f472b6",
            "Barangay Zone VIII (Poblacion)", "#4ade80",
            "San Salvador", "#60a5fa",
            "De La Paz", "#e879f9",
            "San Buenaventura", "#facc15",
            "Santo Domingo", "#2dd4bf",
            "San Diego", "#f87171",
            "San Isidro", "#c084fc",
            "San Jose", "#38bdf8",
            "San Juan", "#4ade80",
            "San Luis", "#fb923c",
            "San Pablo", "#a3e635",
            "San Pedro", "#f43f5e",
            "San Rafael", "#06b6d4",
            "San Roque", "#10b981",
            "Santo Tomas", "#8b5cf6",
            "San Antonio", "#ec4899",
            "#94a3b8",
          ],
          "fill-opacity": 0.09,
        },
      });
    }

    if (!map.getLayer(LAYER_BARANGAYS_LINE)) {
      map.addLayer({
        id: LAYER_BARANGAYS_LINE,
        type: "line",
        source: SOURCE_BARANGAYS,
        paint: {
          "line-color": "#475569",
          "line-width": 1.1,
          "line-opacity": 0.6,
          "line-dasharray": [2, 2],
        },
      });
    }

    if (cachedBarangayLabelsGeoJson && !map.getSource(SOURCE_BARANGAY_LABELS)) {
      map.addSource(SOURCE_BARANGAY_LABELS, {
        type: "geojson",
        data: cachedBarangayLabelsGeoJson,
      });
    }

    if (map.getSource(SOURCE_BARANGAY_LABELS) && !map.getLayer(LAYER_BARANGAYS_LABEL)) {
      map.addLayer({
        id: LAYER_BARANGAYS_LABEL,
        type: "symbol",
        source: SOURCE_BARANGAY_LABELS,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12.8, 9, 15, 12, 17, 14],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.08,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#1e293b",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2.2,
          "text-halo-blur": 1,
        },
      });
    }
  };

  // ── INITIALIZE MAPLIBRE INSTANCE LOCKED TO APPLICANT'S PINNED LOT ──
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: stadiaStyleUrl(activeStadiaStyle),
      center: [applicantLon, applicantLat],
      zoom: 15.2,
      minZoom: 12.8,
      maxZoom: 18.5,
      maxBounds: [
        [121.32, 14.04],
        [121.70, 14.33],
      ],
      pitch: 0,
      dragRotate: false,
      attributionControl: { compact: true },
    });

    map.scrollZoom.enable();
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");

    const initLayers = () => {
      void syncBoundaryLayers(map);
      void syncBarangayLayers(map);
    };

    map.on("load", () => {
      initLayers();

      // Create beautiful custom animated pin marker for applicant's pinned lot
      const el = document.createElement("div");
      el.className = "alip-pinned-marker";
      el.innerHTML = `
        <div style="position: relative; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; inset: 0; border-radius: 50%; background: rgba(2, 132, 199, 0.35); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 28px; height: 28px; border-radius: 50%; background: #0284c7; border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: #ffffff;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
        </div>
      `;

      el.addEventListener("click", () => {
        setIsPopupOpen(true);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([applicantLon, applicantLat])
        .addTo(map);

      markerRef.current = marker;
    });

    map.on("style.load", () => {
      initLayers();
    });

    mapRef.current = map;

    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update basemap style seamlessly
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setStyle(stadiaStyleUrl(activeStadiaStyle));
    }
  }, [activeStadiaStyle]);

  // Recenter to applicant's lot
  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [applicantLon, applicantLat],
        zoom: 15.5,
        essential: true,
      });
      setIsPopupOpen(true);
    }
  };

  return (
    <div className="ptp-container" role="main" aria-label="Public Transparency Portal">
      {/* ── CLEAN GOVERNMENT TOPBAR ── */}
      <header className="ptp-topbar">
        <div className="ptp-topbar-left">
          <button
            type="button"
            className="ptp-back-btn"
            onClick={onBack}
            title={isEn ? "Back to Tracker (Esc)" : "Bumalik sa Tracker (Esc)"}
          >
            <ArrowLeft size={16} />
            <span>{isEn ? "Back to Tracker" : "Bumalik sa Tracker"}</span>
          </button>

          <div className="ptp-branding">
            <div className="ptp-lgu-seal" aria-hidden="true">
              <Building2 size={20} />
            </div>
            <div>
              <div className="ptp-brand-title">
                INFA-TRACK <span>{isEn ? "Lot Map & Inspection" : "Mapa ng Lote & Inspeksyon"}</span>
              </div>
              <div className="ptp-brand-sub">
                {isEn ? "Municipality of Luisiana, Laguna • Stadia GIS & Field Telemetry" : "Pamahalaang Bayan ng Luisiana, Laguna • Stadia Maps Integrated"}
              </div>
            </div>
          </div>
        </div>

        <div className="ptp-topbar-right">
          {/* Quick Street View Launcher Button */}
          <button
            type="button"
            className="ptp-services-btn"
            onClick={() => setIsStreetViewOpen(true)}
            style={{ background: "#0284c7", borderColor: "#38bdf8", color: "#ffffff" }}
            title={isEn ? "Open 360° Street View & Site Progress" : "Buksan ang 360° Street View & Progreso"}
          >
            <Compass size={15} />
            <span>{isEn ? "360° Street View" : "360° Street View"}</span>
          </button>

          {/* Stadia Map Style Selector Button */}
          <div className="ptp-style-btn-wrap">
            <button
              type="button"
              className="ptp-basemap-toggle-btn"
              onClick={() => setIsStylePickerOpen((prev) => !prev)}
              title="Palitan ang Estilo ng Mapa (Stadia Maps)"
            >
              <Layers size={15} />
              <span>
                {STADIA_MAP_STYLES.find((s) => s.id === activeStadiaStyle)?.name || "Basemap"}
              </span>
            </button>

            {/* Stadia Style Popover */}
            {isStylePickerOpen && (
              <div className="ptp-style-popover">
                <div className="ptp-style-popover-head">
                  <span>Pumili ng Estilo ng Mapa (Stadia Maps)</span>
                  <button
                    type="button"
                    className="ptp-style-popover-close"
                    onClick={() => setIsStylePickerOpen(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="ptp-style-grid">
                  {STADIA_MAP_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      className={`ptp-style-card ${activeStadiaStyle === style.id ? "active" : ""}`}
                      onClick={() => {
                        setActiveStadiaStyle(style.id);
                        setIsStylePickerOpen(false);
                      }}
                    >
                      <span className="ptp-style-icon">{style.icon}</span>
                      <div className="ptp-style-info">
                        <span className="ptp-style-name">{style.name}</span>
                        <span className="ptp-style-tagline">{style.tagline}</span>
                      </div>
                      {activeStadiaStyle === style.id && <span className="ptp-style-check">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="ptp-project-count-badge">
            <span className="ptp-count-dot" />
            <span>Ref:</span>
            <strong>{application?.trackingNumber || "LUIS-ZC-XXXX"}</strong>
          </div>

          <ThemeToggle />
          <LanguageToggle />
        </div>
      </header>

      {/* ── MAIN WORKSPACE: SIDEBAR + STADIA MAP ── */}
      <div className="ptp-workspace">
        {/* ── 1. MAIN LAYOUT: LEFT COLLAPSIBLE SIDEBAR (~350px) ── */}
        <aside
          className={`ptp-sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}
          aria-label="Lot Details Sidebar"
        >
          {/* Sidebar Header */}
          <div className="ptp-sidebar-header">
            <div className="ptp-sidebar-header-info">
              <span className="ptp-sidebar-kicker">
                {isEn ? "Confidential Pinned Lot GIS" : "Eksklusibong Pinned Lot Telemetry"}
              </span>
              <h2 className="ptp-sidebar-title">
                <MapPin size={15} className="ptp-title-pin" />
                <span>{application?.lotDetails?.proposedBuildingType || application?.projectTitle || (isEn ? "Residential Structure" : "Tirahan / Bahay")}</span>
              </h2>
            </div>
            <button
              type="button"
              className="ptp-collapse-btn"
              onClick={() => setIsSidebarCollapsed(true)}
              title="I-collapse ang Sidebar"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Lot Details Card inside Sidebar */}
          <div className="ptp-projects-list-container" style={{ padding: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Summary Pill Strip */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: "var(--apple-surface-secondary, #f8fafc)", padding: "10px", borderRadius: 8, border: "1px solid var(--apple-border, rgba(0,0,0,0.08))" }}>
                  <div style={{ fontSize: 11, color: "var(--apple-text-secondary, #6e6e73)", textTransform: "uppercase", fontWeight: 700 }}>Barangay</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{normalizedBrgy}</div>
                </div>
                <div style={{ background: "var(--apple-surface-secondary, #f8fafc)", padding: "10px", borderRadius: 8, border: "1px solid var(--apple-border, rgba(0,0,0,0.08))" }}>
                  <div style={{ fontSize: 11, color: "var(--apple-text-secondary, #6e6e73)", textTransform: "uppercase", fontWeight: 700 }}>Sukat ng Lote</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{application?.lotDetails?.lotAreaSqM ? `${application.lotDetails.lotAreaSqM} sq.m.` : "185 sq.m."}</div>
                </div>
              </div>

              {/* Geotagged Site Photo Card Box */}
              <div className="ptp-photo-container is-clickable" onClick={() => setIsStreetViewOpen(true)} title="Buksan ang 360° Street View & Panorama">
                <div className="ptp-photo-header">
                  <div className="ptp-photo-title">
                    <Camera size={14} />
                    <span>Aktwal na Litrato sa Site</span>
                  </div>
                  <span className="ptp-photo-status">Verified Photo</span>
                </div>
                <div className="ptp-photo-image-wrap">
                  <img src={primaryPhotoUrl} alt="Site Photo" className="ptp-site-img" />
                  <div className="ptp-photo-overlay-tag">
                    <MapPin size={11} />
                    <span>{applicantLat.toFixed(5)}° N, {applicantLon.toFixed(5)}° E</span>
                  </div>
                </div>
              </div>

              {/* Launcher Button for SiteProgressPopup */}
              <button
                type="button"
                className="ptp-view-progress-btn"
                onClick={() => setIsStreetViewOpen(true)}
                title="Tingnan ang Aktwal na Site Photos, 360° Street View, at Inspection Progress"
              >
                <Eye size={15} />
                <span>Tingnan ang 360° Street View at Progress</span>
              </button>

              {/* Hakbang 2 Ocular Inspection Checkpoints */}
              <div style={{ background: "var(--apple-surface, #ffffff)", border: "1px solid var(--apple-border, rgba(0,0,0,0.08))", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <ShieldCheck size={16} color="#10b981" />
                  <strong style={{ fontSize: 13 }}>Hakbang 2: Ocular Inspection Checklist</strong>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 8px", background: "var(--apple-surface-secondary, #f8fafc)", borderRadius: 6, borderLeft: "3px solid #10b981" }}>
                    <Check size={14} color="#10b981" />
                    <span>Front Road Right-of-Way Setback</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 8px", background: "var(--apple-surface-secondary, #f8fafc)", borderRadius: 6, borderLeft: "3px solid #10b981" }}>
                    <Check size={14} color="#10b981" />
                    <span>Waterway & Creek Easement Buffer</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 8px", background: "var(--apple-surface-secondary, #f8fafc)", borderRadius: 6, borderLeft: "3px solid #10b981" }}>
                    <Check size={14} color="#10b981" />
                    <span>Ligtas sa Active Fault Line</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 8px", background: "var(--apple-surface-secondary, #f8fafc)", borderRadius: 6, borderLeft: "3px solid #10b981" }}>
                    <Check size={14} color="#10b981" />
                    <span>Mohon at Katabing Lote (Monuments)</span>
                  </div>
                </div>

                <p style={{ margin: "10px 0 0 0", fontSize: 11.5, color: "var(--apple-text-secondary, #6e6e73)", lineHeight: 1.4 }}>
                  {ocular?.remarks || "Naisagawa ang ocular inspection. Sumusunod sa mga panuntunan ng CLUP at ang mga kinakailangang setback ay nasusunod."}
                </p>
              </div>

              {/* Geohazard Mini Card */}
              <div style={{ background: "var(--apple-surface, #ffffff)", border: "1px solid var(--apple-border, rgba(0,0,0,0.08))", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>⛰️</span>
                  <strong style={{ fontSize: 13 }}>MGB Geohazard & CLUP</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
                  <div>Baha: <strong style={{ color: "#10b981" }}>{geoRisk?.flood?.rating || "Low"}</strong></div>
                  <div>Landslide: <strong style={{ color: "#10b981" }}>{geoRisk?.landslide?.rating || "Low"}</strong></div>
                  <div>Mt. Banahaw: <strong style={{ color: "#10b981" }}>{typeof banahaw === "number" ? banahaw.toFixed(1) : "13.5"} km</strong></div>
                  <div>Sona: <strong style={{ color: zoningInfo.badgeColor }}>{zoningInfo.name}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Floating Expand Trigger when Sidebar is collapsed */}
        {isSidebarCollapsed && (
          <button
            type="button"
            className="ptp-expand-trigger-btn"
            onClick={() => setIsSidebarCollapsed(false)}
            title="Buksan ang Detalye ng Lote"
            aria-label="Expand sidebar"
          >
            <ChevronRight size={16} />
            <span>Detalye ng Lote & Inspeksyon</span>
          </button>
        )}

        {/* ── 2. MAIN LAYOUT: RIGHT FULL-SCREEN STADIA MAPS AREA ── */}
        <section className="ptp-map-area" aria-label="Stadia 2D Map Interface">
          <div ref={mapContainerRef} className="ptp-maplibre-canvas" />

          {/* Recenter Quick Button */}
          <div className="ptp-map-quick-actions">
            <button
              type="button"
              className="ptp-recenter-btn"
              onClick={handleRecenter}
              title="I-recenter ang mapa sa Lote ng Aplikante"
            >
              <RotateCcw size={14} />
              <span>Center Lote</span>
            </button>
          </div>

          {/* ── 3. ACTIVE MAP POP-UP CARD (Exact PublicTransparencyPortal Pop-up Card) ── */}
          {isPopupOpen && (
            <div
              className="ptp-popup-card ptp-popup-card--stadia"
              role="dialog"
              aria-label="Active Lot Details"
            >
              {/* Pop-up Card Header with Close Button */}
              <div className="ptp-popup-header">
                <div className="ptp-popup-meta-row">
                  <span className="ptp-popup-status-badge ongoing">
                    {ocular?.approved !== false ? "Zoning Verified" : "Under Review"}
                  </span>
                  <span className="ptp-popup-type">
                    {application?.lotDetails?.proposedBuildingType || "Residential Construction"}
                  </span>
                </div>
                <button
                  type="button"
                  className="ptp-popup-close-btn"
                  onClick={() => setIsPopupOpen(false)}
                  title="Isara"
                  aria-label="Close details"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 1. Project / Lot Name */}
              <h2 className="ptp-popup-title">
                {application?.lotDetails?.proposedBuildingType || application?.projectTitle || "Tirahan / Bahay"}
              </h2>

              {/* 2. Barangay */}
              <div className="ptp-popup-row">
                <div className="ptp-popup-row-label">
                  <MapPin size={14} className="ptp-row-icon" />
                  <span>Barangay:</span>
                </div>
                <div className="ptp-popup-row-value">
                  {normalizedBrgy}
                </div>
              </div>

              {/* 3. Applicant / Registered Owner */}
              <div className="ptp-popup-row">
                <div className="ptp-popup-row-label">
                  <HardHat size={14} className="ptp-row-icon" />
                  <span>Aplikante / May-ari:</span>
                </div>
                <div className="ptp-popup-row-value highlight">
                  {application?.applicant?.fullName || application?.lotDetails?.lotOwner || "Juan Dela Cruz"}
                </div>
              </div>

              {/* 4. Lot Details Strip */}
              <div className="ptp-budget-card">
                <div className="ptp-budget-grid">
                  <div className="ptp-budget-col">
                    <div className="ptp-budget-label">
                      <span>Sukat ng Lote</span>
                    </div>
                    <div className="ptp-budget-amount total">
                      {application?.lotDetails?.lotAreaSqM ? `${application.lotDetails.lotAreaSqM} sq.m.` : "185 sq.m."}
                    </div>
                  </div>
                  <div className="ptp-budget-col">
                    <div className="ptp-budget-label">
                      <span>Tax Dec / Titulo</span>
                    </div>
                    <div className="ptp-budget-amount spent" style={{ fontSize: "0.88rem", fontFamily: "monospace" }}>
                      {application?.lotDetails?.taxDecNo || application?.lotDetails?.tctNo || "TD-2026-901"}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="ptp-utilization-bar-wrap">
                  <div className="ptp-utilization-labels">
                    <span>Progreso sa Site:</span>
                    <strong>{inspProgress}%</strong>
                  </div>
                  <div className="ptp-utilization-track">
                    <div
                      className="ptp-utilization-fill"
                      style={{ width: `${Math.max(8, inspProgress)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 5. Geotagged Site Photo Card */}
              <div
                className="ptp-photo-container is-clickable"
                onClick={() => setIsStreetViewOpen(true)}
                title="I-click upang tingnan ang buong 360° Street View at site photo"
              >
                <div className="ptp-photo-header">
                  <div className="ptp-photo-title">
                    <Camera size={14} />
                    <span>Geotagged Site Photo</span>
                  </div>
                  <span className="ptp-photo-status">Verified Photo</span>
                </div>

                <div className="ptp-photo-image-wrap">
                  <img
                    src={primaryPhotoUrl}
                    alt="Geotagged site baseline photo"
                    className="ptp-site-img"
                  />
                  <div className="ptp-photo-overlay-tag">
                    <MapPin size={11} />
                    <span>{applicantLat.toFixed(5)}° N, {applicantLon.toFixed(5)}° E</span>
                  </div>
                </div>
              </div>

              {/* 6. Action Button for 360° Street View & Progress (Opens SiteProgressPopup) */}
              <div className="ptp-card-actions">
                <button
                  type="button"
                  className="ptp-view-progress-btn"
                  onClick={() => setIsStreetViewOpen(true)}
                  title="Tingnan ang Aktwal na Site Photos, 360° Street View, at Inspection Progress"
                >
                  <Eye size={15} />
                  <span>Tingnan ang 360° Street View at Progress</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── 360° SITE PROGRESS & INSPECTION TIMELINE POPUP (Direct from Engineering Panel) ── */}
      {isStreetViewOpen && (
        <SiteProgressPopup
          project={projectForStreetView}
          onClose={() => setIsStreetViewOpen(false)}
        />
      )}
    </div>
  );
}

export default ApplicantLotInspectionPage;
