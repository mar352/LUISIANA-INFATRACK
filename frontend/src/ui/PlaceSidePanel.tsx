import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Project, ProjectPhoto } from "../types";
import { MODEL_CATALOG, PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from "../types";
import { backendUrl, deleteProjectPhoto, uploadProjectPhoto } from "../lib/api";
import "./PlaceSidePanel.css";

type Tab = "overview" | "activity" | "about";

type Props = {
  project: Project;
  map: MapLibreMap | null;
  readOnly?: boolean;
  /** Engineer / MPDC — add & remove progress photos in this panel. */
  canAddPhotos?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onToggleLock?: () => void;
};

function statusLabel(status: Project["status"]) {
  const normalized = status === "Planning" ? "Planned" : status;
  return PROJECT_STATUS_LABELS[normalized as keyof typeof PROJECT_STATUS_LABELS] ?? String(status);
}

function statusColor(status: Project["status"]) {
  const normalized = status === "Planning" ? "Planned" : status;
  return PROJECT_STATUS_COLORS[normalized as keyof typeof PROJECT_STATUS_COLORS] ?? "#9b9b9b";
}

export function PlaceSidePanel({
  project,
  map,
  readOnly = false,
  canAddPhotos = false,
  onClose,
  onEdit,
  onToggleLock,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);
  const [photos, setPhotos] = useState<ProjectPhoto[]>(project.photos ?? []);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const modelInfo = MODEL_CATALOG.find((m) => m.type === project.modelType);
  const heroPhoto = photos[0];
  const coords = `${project.location.lat.toFixed(5)}, ${project.location.lon.toFixed(5)}`;
  const showPhotoEdit = canAddPhotos && !readOnly;

  useEffect(() => {
    setTab("overview");
    setCopied(false);
    setCaption("");
    setPhotoError(null);
    setPhotos(project.photos ?? []);
  }, [project.id]);

  useEffect(() => {
    setPhotos(project.photos ?? []);
  }, [project.photos]);

  function flyHere() {
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
      await navigator.clipboard.writeText(coords);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !showPhotoEdit) return;
    setUploading(true);
    setPhotoError(null);
    try {
      const { photo } = await uploadProjectPhoto(project.id, file, {
        caption: caption.trim() || undefined,
      });
      setPhotos((prev) => [...prev, photo]);
      setCaption("");
      setTab("overview");
    } catch (err) {
      console.error("Failed to upload photo:", err);
      setPhotoError("Upload failed. Try again.");
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
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (err) {
      console.error("Failed to delete photo:", err);
      setPhotoError("Could not remove photo.");
    }
  }

  return (
    <aside className="place-panel" aria-label={`${project.name} details`}>
      <div className="place-panel-search">
        <div className="place-panel-search-text">{project.name}</div>
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
              <span>{modelInfo?.label || "Infrastructure"}</span>
              <strong>{project.name}</strong>
            </div>
          )}
        </div>

        <div className="place-panel-body">
          <h1 className="place-panel-title">{project.name}</h1>
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
              {project.progress}% · {modelInfo?.label || project.modelType}
            </span>
          </div>
          <div className="place-panel-type">{project.department}</div>

          <div className="place-panel-tabs" role="tablist">
            {(
              [
                ["overview", "Overview"],
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
                onClick={() => setTab(id)}
              >
                {label}
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
                onClick={() => fileInputRef.current?.click()}
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="place-photo-file-input"
              disabled={uploading}
              onChange={(e) => void handlePhotoUpload(e)}
            />
          )}

          {tab === "overview" && (
            <div className="place-panel-section">
              <div className="place-info-row">
                <span className="place-info-ico" aria-hidden>
                  Pin
                </span>
                <div>
                  <div className="place-info-main">{coords}</div>
                  <div className="place-info-sub">
                    {project.barangay ? `${project.barangay}, Luisiana, Laguna` : "Luisiana, Laguna"}
                  </div>
                </div>
              </div>
              {(project.budgetTotal != null && project.budgetTotal > 0) && (
                <div className="place-info-row">
                  <span className="place-info-ico" aria-hidden>
                    ₱
                  </span>
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
                  <span className="place-info-ico" aria-hidden>
                    Date
                  </span>
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
                  <span className="place-info-ico" aria-hidden>
                    Lock
                  </span>
                  <div>
                    <div className="place-info-main">Model locked on map</div>
                    <div className="place-info-sub">Position and scale are frozen</div>
                  </div>
                </div>
              )}

              <div className="place-photos-block">
                <div className="place-photos-heading">
                  <span>Photos</span>
                  {photos.length > 0 && <span className="place-photos-count">{photos.length}</span>}
                </div>
                {photos.length === 0 ? (
                  <p className="place-empty">
                    {showPhotoEdit ? "No photos yet — add a site photo below." : "No photos yet."}
                  </p>
                ) : (
                  <div className="place-photo-strip">
                    {photos.map((photo) => (
                      <div key={photo.id} className="place-photo-item">
                        <a
                          href={backendUrl(photo.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="place-photo-thumb"
                          title={photo.caption || "Photo"}
                        >
                          <img src={backendUrl(photo.url)} alt={photo.caption || "Photo"} />
                        </a>
                        {showPhotoEdit && (
                          <button
                            type="button"
                            className="place-photo-remove"
                            aria-label="Remove photo"
                            onClick={() => void handleDeletePhoto(photo.id)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
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
                    <button
                      type="button"
                      className="place-photo-add-btn"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? "Uploading…" : "Add photo"}
                    </button>
                    {photoError && <div className="place-photo-error">{photoError}</div>}
                  </div>
                )}
              </div>
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
                <span className="place-info-ico" aria-hidden>
                  ▣
                </span>
                <div>
                  <div className="place-info-main">{project.type}</div>
                  <div className="place-info-sub">Asset classification</div>
                </div>
              </div>
              <div className="place-info-row">
                <span className="place-info-ico" aria-hidden>
                  ID
                </span>
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
