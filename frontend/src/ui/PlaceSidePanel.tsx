import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Project, ProjectPhoto, ProjectPhotoKind } from "../types";
import { MODEL_CATALOG, PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from "../types";
import {
  isDualSummary,
  type EarthquakeDualSummary,
  type EarthquakeSiteScore,
} from "../lib/ml-earthquake";
import { backendUrl, deleteProjectPhoto, uploadProjectPhoto } from "../lib/api";
import { resolveOfficialLinks } from "../lib/infra-official-links";
import { hoverTypeLabel } from "../lib/place-name";
import { officialLabelAt, type EarthquakeLabelPoint } from "../lib/earthquake-labels";
import {
  buildLuisianaAssess,
  fetchGeoriskAssess,
  pointInLuisiana,
  type GeoRiskAssess,
  type LiveHazards,
} from "../lib/luisiana-site-assess";
import { printSiteHazardReport } from "../lib/hazard-report";
import { assetShareUrl, qrImageUrl, readGps } from "../lib/project-link";
import { formatLonLat, formatLonLatCopy } from "../lib/coords";
import {
  enqueuePhoto,
  flushPhotoQueue,
  isOfflineNetworkError,
  listQueuedPhotos,
  onPhotoQueueChange,
  removeQueuedPhoto,
  type QueuedPhoto,
} from "../lib/photo-queue";
import "./PlaceSidePanel.css";

type Tab = "overview" | "progress" | "activity" | "about";

type Props = {
  project: Project;
  map?: MapLibreMap | null;
  /** Cesium (or other) fly-to when MapLibre map is unavailable. */
  onFlyHere?: () => void;
  readOnly?: boolean;
  /** Engineer / MPDC — add & remove photos in this panel. */
  canAddPhotos?: boolean;
  /** Keep parent project list in sync after upload/delete. */
  onPhotosChange?: (projectId: string, photos: ProjectPhoto[]) => void;
  onClose: () => void;
  onEdit?: () => void;
  onRename?: (name: string) => void | Promise<void>;
  /** Street or barangay under the name — not the structure title. */
  locationLabel?: string | null;
  onToggleLock?: () => void;
  /** Engineer: convert this site pin into the Under Construction GLB. */
  canPromoteSitePin?: boolean;
  startConstructionBusy?: boolean;
  onStartConstruction?: () => void;
  earthquakeScore?: EarthquakeSiteScore | EarthquakeDualSummary | null;
};

function statusLabel(status: Project["status"]) {
  const normalized = status === "Planning" ? "Planned" : status;
  return PROJECT_STATUS_LABELS[normalized as keyof typeof PROJECT_STATUS_LABELS] ?? String(status);
}

function statusColor(status: Project["status"]) {
  const normalized = status === "Planning" ? "Planned" : status;
  return PROJECT_STATUS_COLORS[normalized as keyof typeof PROJECT_STATUS_COLORS] ?? "#9b9b9b";
}

function photoKindOf(photo: ProjectPhoto): ProjectPhotoKind {
  return photo.kind === "site" ? "site" : "progress";
}

function QueuedBlobImg({ blob, alt }: { blob: Blob; alt: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  if (!src) return null;
  return <img src={src} alt={alt} />;
}

function mergeSheetScore(
  score: EarthquakeDualSummary | null,
  sheet: EarthquakeLabelPoint | null,
): EarthquakeDualSummary | null {
  if (!sheet) return score;
  const official: EarthquakeSiteScore = {
    lon: sheet.lon,
    lat: sheet.lat,
    cls: sheet.label,
    confidence: 1,
    shakeClass: sheet.shakeClass,
    eilClass: sheet.eilClass,
    source: "nearest-label",
  };
  if (score?.official) return score;
  if (score) return { ...score, official };
  return { ...official, official, predicted: null };
}

function InfoSvg({ children }: { children: ReactNode }) {
  return (
    <span className="place-info-ico" aria-hidden>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

const IcoPin = () => (
  <InfoSvg>
    <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.2" />
  </InfoSvg>
);
const IcoLink = () => (
  <InfoSvg>
    <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" />
    <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 18.07" />
  </InfoSvg>
);
const IcoLock = () => (
  <InfoSvg>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </InfoSvg>
);
const IcoDate = () => (
  <InfoSvg>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </InfoSvg>
);
const IcoBudget = () => (
  <InfoSvg>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7v10M9.5 9.5c.6-1 1.6-1.5 2.5-1.5 1.4 0 2.5.8 2.5 2s-1.1 2-2.5 2H11c-1.4 0-2.5.8-2.5 2s1.1 2 2.5 2c.9 0 1.9-.5 2.5-1.5" />
  </InfoSvg>
);
const IcoType = () => (
  <InfoSvg>
    <path d="M4 20V9l8-5 8 5v11" />
    <path d="M9 20v-6h6v6" />
  </InfoSvg>
);
const IcoId = () => (
  <InfoSvg>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 10h4M7 14h10" />
  </InfoSvg>
);

export function PlaceSidePanel({
  project,
  map = null,
  onFlyHere,
  readOnly = false,
  canAddPhotos = false,
  onPhotosChange,
  onClose,
  onEdit,
  onRename,
  locationLabel = null,
  onToggleLock,
  canPromoteSitePin = false,
  startConstructionBusy = false,
  onStartConstruction,
  earthquakeScore = null,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);
  const [photos, setPhotos] = useState<ProjectPhoto[]>(project.photos ?? []);
  const [caption, setCaption] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadKind, setUploadKind] = useState<ProjectPhotoKind>("site");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [insideLuisiana, setInsideLuisiana] = useState(true);
  const [geoRisk, setGeoRisk] = useState<"idle" | "loading" | "error" | GeoRiskAssess>("idle");
  const [sheetLabel, setSheetLabel] = useState<EarthquakeLabelPoint | null>(null);
  const [queued, setQueued] = useState<QueuedPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const modelInfo = MODEL_CATALOG.find((m) => m.type === project.modelType);
  const displayName = project.name?.trim() || "Untitled site";
  const typeLabel = hoverTypeLabel(project);
  const milestones = project.milestones ?? [];
  const sitePhotos = photos.filter((p) => photoKindOf(p) === "site");
  const progressPhotos = photos.filter((p) => photoKindOf(p) === "progress");
  const heroPhoto = sitePhotos[0] ?? progressPhotos[0];
  const coords = formatLonLat(project.location.lat, project.location.lon);
  const coordsCopy = formatLonLatCopy(project.location.lat, project.location.lon);
  const showPhotoEdit = Boolean(canAddPhotos);
  const showStartBuild = Boolean(canPromoteSitePin && project.siteMarkerOnly && onStartConstruction);
  const canRename = Boolean(!readOnly && onRename);

  useEffect(() => {
    setRenameValue(displayName);
    setRenaming(false);
  }, [project.id, displayName]);

  useEffect(() => {
    let cancelled = false;
    void pointInLuisiana(project.location.lon, project.location.lat).then((ok) => {
      if (!cancelled) setInsideLuisiana(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [project.location.lon, project.location.lat]);

  useEffect(() => {
    if (!insideLuisiana) {
      setGeoRisk("idle");
      return;
    }
    const ctrl = new AbortController();
    setGeoRisk("loading");
    void fetchGeoriskAssess(project.location.lat, project.location.lon, ctrl.signal).then((data) => {
      if (ctrl.signal.aborted) return;
      setGeoRisk(data?.inside ? data : "error");
    });
    return () => {
      ctrl.abort();
    };
  }, [insideLuisiana, project.location.lat, project.location.lon]);

  useEffect(() => {
    let cancelled = false;
    void officialLabelAt(project.location.lon, project.location.lat).then((pt) => {
      if (!cancelled) setSheetLabel(pt);
    });
    return () => {
      cancelled = true;
    };
  }, [project.location.lon, project.location.lat]);

  async function commitRename() {
    const next = renameValue.trim();
    if (!onRename || !next) {
      setRenaming(false);
      setRenameValue(displayName);
      return;
    }
    if (next === displayName) {
      setRenaming(false);
      return;
    }
    setRenameSaving(true);
    try {
      await onRename(next);
      setRenaming(false);
    } finally {
      setRenameSaving(false);
    }
  }
  const officialLinks = resolveOfficialLinks(project);

  useEffect(() => {
    setTab("overview");
    setCopied(false);
    setCaption("");
    setMilestoneId("");
    setPhotoError(null);
    setUploadKind("site");
    setPhotos(project.photos ?? []);
  }, [project.id]);

  useEffect(() => {
    setPhotos(project.photos ?? []);
  }, [project.photos]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void listQueuedPhotos(project.id).then((rows) => {
        if (!cancelled) setQueued(rows);
      });
    };
    load();
    const stop = onPhotoQueueChange(load);
    return () => {
      cancelled = true;
      stop();
    };
  }, [project.id]);

  function applyPhotos(next: ProjectPhoto[]) {
    setPhotos(next);
    onPhotosChange?.(project.id, next);
  }

  function flyHere() {
    if (onFlyHere) {
      onFlyHere();
      return;
    }
    map?.flyTo({
      center: [project.location.lon, project.location.lat],
      zoom: Math.max(map.getZoom(), 17),
      pitch: 55,
      duration: 900,
      essential: true,
    });
  }

  async function copyCoords() {
    try {
      await navigator.clipboard.writeText(coordsCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function openFilePicker(kind: ProjectPhotoKind, camera = false) {
    setUploadKind(kind);
    setPhotoError(null);
    window.setTimeout(() => (camera ? cameraInputRef : fileInputRef).current?.click(), 0);
  }

  async function queueLocalPhoto(file: File, gps: { lat: number; lon: number } | null) {
    await enqueuePhoto({
      projectId: project.id,
      caption: caption.trim(),
      milestoneId: uploadKind === "progress" ? milestoneId || null : null,
      kind: uploadKind,
      lat: gps?.lat ?? null,
      lon: gps?.lon ?? null,
      blob: file,
      name: file.name || "photo.jpg",
      type: file.type || "image/jpeg",
    });
    setCaption("");
    setMilestoneId("");
    setTab(uploadKind === "progress" ? "progress" : "overview");
    setPhotoError("Saved on this device. Will upload when you are back online.");
    void flushPhotoQueue();
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !showPhotoEdit) return;
    setUploading(true);
    setPhotoError(null);
    try {
      const gps = await readGps();
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        await queueLocalPhoto(file, gps);
        return;
      }
      try {
        const { photo } = await uploadProjectPhoto(project.id, file, {
          caption: caption.trim() || undefined,
          milestoneId: uploadKind === "progress" ? milestoneId || null : null,
          kind: uploadKind,
          lat: gps?.lat ?? null,
          lon: gps?.lon ?? null,
        });
        applyPhotos([photo, ...photos]);
        setCaption("");
        setMilestoneId("");
        setTab(uploadKind === "progress" ? "progress" : "overview");
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          await queueLocalPhoto(file, gps);
          return;
        }
        console.error("Failed to upload photo:", err);
        setPhotoError("Upload failed. Try again.");
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!showPhotoEdit) return;
    setPhotoError(null);
    try {
      await deleteProjectPhoto(project.id, photoId);
      applyPhotos(photos.filter((p) => p.id !== photoId));
    } catch (err) {
      console.error("Failed to delete photo:", err);
      setPhotoError("Could not remove photo.");
    }
  }

  function renderPhotoGallery(
    list: ProjectPhoto[],
    kind: ProjectPhotoKind,
    opts: {
      title: string;
      empty: string;
      uploadLabel: string;
      defaultCaption: string;
      withMilestones?: boolean;
    },
  ) {
    const queuedHere = queued.filter((q) => q.kind === kind);
    return (
      <div className="place-photos-block">
        <div className="place-photos-heading">
          <span>{opts.title}</span>
          {list.length + queuedHere.length > 0 && (
            <span className="place-photos-count">{list.length + queuedHere.length}</span>
          )}
        </div>
        {list.length === 0 && queuedHere.length === 0 ? (
          <p className="place-empty">{opts.empty}</p>
        ) : (
          <div className="place-photo-grid">
            {queuedHere.map((row) => (
              <div key={row.id} className="place-photo-card is-queued">
                <div className="place-photo-card-media">
                  <QueuedBlobImg blob={row.blob} alt={row.caption || "Queued photo"} />
                </div>
                <div className="place-photo-card-meta">
                  <span>{row.caption || "Waiting to upload"}</span>
                  <span className="place-photo-card-tag">Offline queue</span>
                </div>
                {showPhotoEdit && (
                  <button
                    type="button"
                    className="place-photo-card-remove"
                    onClick={() => void removeQueuedPhoto(row.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {list.map((photo) => {
              const linkedMilestone =
                kind === "progress" && photo.milestoneId
                  ? milestones.find((m) => m.id === photo.milestoneId)
                  : undefined;
              return (
                <div key={photo.id} className="place-photo-card">
                  <a
                    href={backendUrl(photo.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="place-photo-card-media"
                    title={photo.caption || opts.defaultCaption}
                  >
                    <img
                      src={backendUrl(photo.url)}
                      alt={photo.caption || opts.defaultCaption}
                    />
                  </a>
                  <div className="place-photo-card-meta">
                    <span>{photo.caption || opts.defaultCaption}</span>
                    {linkedMilestone && (
                      <span className="place-photo-card-tag">{linkedMilestone.title}</span>
                    )}
                    {photo.uploadedAt && (
                      <span className="place-photo-card-date">
                        {new Date(photo.uploadedAt).toLocaleDateString()}
                      </span>
                    )}
                    {photo.lat != null && photo.lon != null && (
                      <span className="place-photo-card-date">
                        GPS {photo.lat.toFixed(5)}, {photo.lon.toFixed(5)}
                      </span>
                    )}
                  </div>
                  {showPhotoEdit && (
                    <button
                      type="button"
                      className="place-photo-card-remove"
                      onClick={() => void handleDeletePhoto(photo.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {showPhotoEdit && (
          <div className="place-photo-upload">
            <input
              type="text"
              className="place-photo-caption"
              placeholder="Caption (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={uploading}
            />
            {opts.withMilestones && milestones.length > 0 && (
              <select
                className="place-photo-caption"
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                disabled={uploading}
                aria-label="Link to milestone"
              >
                <option value="">Link to milestone (optional)</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            )}
            <div className="place-photo-add-row">
              <button
                type="button"
                className="place-photo-add-btn"
                disabled={uploading}
                onClick={() => openFilePicker(kind, true)}
              >
                {uploading && uploadKind === kind ? "Uploading…" : "Take photo"}
              </button>
              <button
                type="button"
                className="place-photo-add-btn"
                disabled={uploading}
                onClick={() => openFilePicker(kind, false)}
              >
                {opts.uploadLabel}
              </button>
            </div>
            {photoError && uploadKind === kind && (
              <div className="place-photo-error">{photoError}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="place-panel" aria-label={`${displayName} details`}>
      <div className="place-panel-search">
        <div className="place-panel-search-text">{displayName}</div>
        <button type="button" className="place-panel-icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="place-panel-scroll">
        <div
          className={`place-panel-hero${heroPhoto ? "" : " placeholder"}`}
          style={
            heroPhoto
              ? { backgroundImage: `url(${backendUrl(heroPhoto.url)})` }
              : undefined
          }
        >
          {!heroPhoto && (
            <div className="place-panel-hero-fallback">
              <span>{typeLabel}</span>
              <strong>{displayName}</strong>
            </div>
          )}
        </div>

        <div className="place-panel-body">
          {renaming && canRename ? (
            <form
              className="place-panel-rename"
              onSubmit={(e) => {
                e.preventDefault();
                void commitRename();
              }}
            >
              <input
                className="place-panel-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                disabled={renameSaving}
                placeholder="Structure name"
                aria-label="Rename site"
              />
              <div className="place-panel-rename-actions">
                <button type="submit" className="place-panel-rename-save" disabled={renameSaving || !renameValue.trim()}>
                  {renameSaving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="place-panel-rename-cancel"
                  disabled={renameSaving}
                  onClick={() => {
                    setRenaming(false);
                    setRenameValue(displayName);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="place-panel-title-row">
              <h1 className="place-panel-title">{displayName}</h1>
              {canRename && (
                <button
                  type="button"
                  className="place-panel-rename-btn"
                  onClick={() => {
                    setRenameValue(displayName);
                    setRenaming(true);
                  }}
                >
                  Rename
                </button>
              )}
            </div>
          )}
          {locationLabel && !renaming && (
            <p className="place-panel-autoname">{locationLabel}</p>
          )}
          {!renaming && coords && (
            <p className="place-panel-coords" title="Click Share to copy lat, lon">
              {coords}
            </p>
          )}
          <div className="place-panel-rating-row">
            <span
              className="place-panel-status"
              style={{
                borderColor: statusColor(project.status),
                color: statusColor(project.status),
              }}
            >
              {statusLabel(project.status)}
            </span>
            <span className="place-panel-meta">
              {project.progress}% · {typeLabel}
            </span>
          </div>
          <div className="place-panel-type">{project.department}</div>

          {(() => {
            let live: LiveHazards | undefined;
            if (insideLuisiana) {
              if (geoRisk === "loading" || geoRisk === "idle") {
                live = { flood: "loading", landslide: "loading" };
              } else if (geoRisk === "error") {
                live = { flood: "unavailable", landslide: "unavailable" };
              } else {
                live = {
                  flood: geoRisk.flood ?? "unavailable",
                  landslide: geoRisk.landslide ?? "unavailable",
                };
              }
            }
            const dual = mergeSheetScore(
              isDualSummary(earthquakeScore) ? earthquakeScore : null,
              sheetLabel,
            );
            const assess = buildLuisianaAssess(
              project.location.lon,
              project.location.lat,
              insideLuisiana,
              dual,
              live,
            );
            const reportReady = insideLuisiana && geoRisk !== "loading" && geoRisk !== "idle";
            return (
              <div className="place-assess">
                <div className="place-assess-title">Luisiana siting assessment</div>
                <dl className="place-assess-list">
                  {assess.rows.map((row) => (
                    <div key={row.label} className="place-assess-row">
                      <dt>{row.label}</dt>
                      <dd style={row.color ? { color: row.color } : undefined}>{row.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="place-assess-note">{assess.note}</p>
                {insideLuisiana && (
                  <button
                    type="button"
                    className="place-assess-report"
                    disabled={!reportReady}
                    onClick={() => {
                      void printSiteHazardReport({
                        name: displayName,
                        barangay: project.barangay,
                        locationLabel,
                        lat: project.location.lat,
                        lon: project.location.lon,
                        live,
                        score: dual,
                      });
                    }}
                  >
                    {reportReady ? "View report" : "Preparing report…"}
                  </button>
                )}
              </div>
            );
          })()}

          {showStartBuild && (
            <div className="place-build-confirm">
              <strong>Itatayo na ba ito?</strong>
              <p>
                Lalabas ang Under Construction model sa pin. Ikaw pa rin ang maglalagay — move,
                rotate, at scale.
              </p>
              <button
                type="button"
                className="place-build-confirm-btn"
                disabled={startConstructionBusy}
                onClick={onStartConstruction}
              >
                {startConstructionBusy ? "Sineset…" : "Oo, itayo na"}
              </button>
            </div>
          )}

          <div className="place-panel-tabs" role="tablist">
            {(
              [
                ["overview", "Overview"],
                ["progress", "Progress"],
                ["activity", "Activity"],
                ["about", "About"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`place-panel-tab${tab === id ? " active" : ""}`}
                onClick={() => {
                  setTab(id);
                  setPhotoError(null);
                }}
              >
                {label}
                {id === "progress" && progressPhotos.length > 0 ? (
                  <span className="place-panel-tab-count">{progressPhotos.length}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="place-panel-actions">
            <button type="button" className="place-action" onClick={flyHere}>
              <span className="place-action-icon primary">↗</span>
              <span>Focus</span>
            </button>
            {!readOnly && onEdit && (
              <button type="button" className="place-action" onClick={onEdit}>
                <span className="place-action-icon">✎</span>
                <span>Edit</span>
              </button>
            )}
            {!readOnly && onToggleLock && (
              <button type="button" className="place-action" onClick={onToggleLock}>
                <span className="place-action-icon">{project.modelLocked ? "Open" : "Lock"}</span>
                <span>{project.modelLocked ? "Unlock" : "Lock"}</span>
              </button>
            )}
            {showPhotoEdit && (
              <button
                type="button"
                className="place-action"
                disabled={uploading}
                onClick={() => openFilePicker(tab === "progress" ? "progress" : "site")}
              >
                <span className="place-action-icon">Photo</span>
                <span>{uploading ? "…" : "Photo"}</span>
              </button>
            )}
            <button type="button" className="place-action" onClick={() => void copyCoords()}>
              <span className="place-action-icon">Copy</span>
              <span>{copied ? "Copied" : "Share"}</span>
            </button>
          </div>

          {showPhotoEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="place-photo-file-input"
                disabled={uploading}
                onChange={(e) => void handlePhotoUpload(e)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="place-photo-file-input"
                disabled={uploading}
                onChange={(e) => void handlePhotoUpload(e)}
              />
            </>
          )}

          {tab === "overview" && (
            <div className="place-panel-section">
              <div className="place-info-row">
                <IcoPin />
                <div>
                  <div className="place-info-main">{coords}</div>
                  <div className="place-info-sub">
                    {project.barangay ? `${project.barangay}, Luisiana, Laguna` : "Luisiana, Laguna"}
                  </div>
                </div>
              </div>
              <div className="place-info-row place-qr-row">
                <img
                  className="place-qr-img"
                  src={qrImageUrl(assetShareUrl(project.id), 160)}
                  alt={`QR for ${displayName}`}
                />
                <div>
                  <div className="place-info-main">Asset QR</div>
                  <div className="place-info-sub">
                    Scan with a phone camera to open this site.
                  </div>
                  <button
                    type="button"
                    className="place-qr-copy"
                    onClick={() => {
                      void navigator.clipboard.writeText(assetShareUrl(project.id));
                    }}
                  >
                    Copy link
                  </button>
                </div>
              </div>
              {officialLinks.length > 0 &&
                officialLinks.map((link) => (
                  <div className="place-info-row" key={link.url}>
                    <IcoLink />
                    <div>
                      <a
                        className="place-info-main place-info-link"
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {link.label}
                      </a>
                      <div className="place-info-sub">Official page — opens in a new tab</div>
                    </div>
                  </div>
                ))}
              {project.budgetTotal != null && project.budgetTotal > 0 && (
                <div className="place-info-row">
                  <IcoBudget />
                  <div>
                    <div className="place-info-main">
                      {(project.budgetSpent ?? 0).toLocaleString()} /{" "}
                      {project.budgetTotal.toLocaleString()}
                    </div>
                    <div className="place-info-sub">Budget spent / total</div>
                  </div>
                </div>
              )}
              {(project.startDate || project.targetEndDate) && (
                <div className="place-info-row">
                  <IcoDate />
                  <div>
                    <div className="place-info-main">
                      {project.startDate ?? "—"} → {project.targetEndDate ?? "—"}
                    </div>
                    <div className="place-info-sub">Project timeline</div>
                  </div>
                </div>
              )}
              {project.modelLocked && (
                <div className="place-info-row">
                  <IcoLock />
                  <div>
                    <div className="place-info-main">
                      {project.siteMarkerOnly ? "Site pin on map" : "Model locked on map"}
                    </div>
                    <div className="place-info-sub">
                      {project.siteMarkerOnly
                        ? "Map marker only — no 3D model yet"
                        : "Position and scale are frozen"}
                    </div>
                  </div>
                </div>
              )}
              {project.siteMarkerOnly && !project.modelLocked && (
                <div className="place-info-row">
                  <IcoPin />
                  <div>
                    <div className="place-info-main">Site pin on map</div>
                    <div className="place-info-sub">Map marker only — no 3D model yet</div>
                  </div>
                </div>
              )}

              {renderPhotoGallery(sitePhotos, "site", {
                title: "Photos",
                empty: showPhotoEdit
                  ? "No photos yet — add any site image below."
                  : "No photos yet.",
                uploadLabel: "Upload photo",
                defaultCaption: "Site photo",
              })}
            </div>
          )}

          {tab === "progress" && (
            <div className="place-panel-section">
              {renderPhotoGallery(progressPhotos, "progress", {
                title: "Progress Photos",
                empty: showPhotoEdit
                  ? "No progress photos yet — upload construction / site progress below."
                  : "No progress photos yet.",
                uploadLabel: "Upload progress photo",
                defaultCaption: "Progress photo",
                withMilestones: true,
              })}
            </div>
          )}

          {tab === "activity" && (
            <div className="place-panel-section">
              {(project.activityLog?.length ?? 0) === 0 ? (
                <p className="place-empty">No activity logged yet.</p>
              ) : (
                <ul className="place-activity">
                  {project.activityLog.slice(0, 12).map((a, i) => (
                    <li key={`${a.at}-${i}`}>
                      <div className="place-activity-msg">{a.message}</div>
                      <div className="place-activity-at">
                        {new Date(a.at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "about" && (
            <div className="place-panel-section">
              <p className="place-about">
                {project.description ||
                  modelInfo?.description ||
                  "Municipal infrastructure asset tracked in INFA-TRACK Luisiana."}
              </p>
              <div className="place-info-row">
                <IcoType />
                <div>
                  <div className="place-info-main">{project.type}</div>
                  <div className="place-info-sub">Asset classification</div>
                </div>
              </div>
              <div className="place-info-row">
                <IcoId />
                <div>
                  <div className="place-info-main">{project.id}</div>
                  <div className="place-info-sub">
                    Updated {new Date(project.updatedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
