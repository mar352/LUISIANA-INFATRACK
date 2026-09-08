import React, { useState, useMemo } from "react";
import type { Project } from "../types";
import "./InspectionTaskQueue.css";

interface InspectionTaskQueueProps {
  projects: Project[];
  onLocateProject: (project: Project) => void;
  onInspectProject: (project: Project) => void;
  selectedProjectId?: string | null;
  embedded?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}

// SVG Vector Icons (Strictly no emojis)
const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconClose = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconUser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconMapPin = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconCategory = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <path d="M9 22v-4h6v4" />
    <line x1="8" y1="6" x2="16" y2="6" />
    <line x1="8" y1="10" x2="16" y2="10" />
    <line x1="8" y1="14" x2="16" y2="14" />
  </svg>
);

const IconArrowRight = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const IconClipboard = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);

export const InspectionTaskQueue: React.FC<InspectionTaskQueueProps> = ({
  projects,
  onLocateProject,
  onInspectProject,
  selectedProjectId,
  embedded = false,
  isOpen = true,
  onToggle,
}) => {
  const [search, setSearch] = useState("");

  // Filter tasks that belong to private infra applications or need inspection
  const inspectionTasks = useMemo(() => {
    return projects.filter((p) => {
      // Must be a pinned site application or marked as private application
      const isCandidate =
        p.isPrivateApplication ||
        p.siteMarkerOnly ||
        (p.id && p.id.startsWith("infra-app-"));

      if (!isCandidate) return false;

      if (!search.trim()) return true;
      const query = search.toLowerCase();
      const tracking = ((p as any).trackingNumber || p.id).toLowerCase();
      const name = (p.name || "").toLowerCase();
      const applicant = ((p as any).applicantName || "").toLowerCase();
      const brgy = (p.barangay || "").toLowerCase();

      return (
        tracking.includes(query) ||
        name.includes(query) ||
        applicant.includes(query) ||
        brgy.includes(query)
      );
    });
  }, [projects, search]);

  const taskListContent = (
    <>
      {/* Search Filter */}
      <div className="itq-search-wrap">
        <span className="itq-search-icon" aria-hidden>
          <IconSearch />
        </span>
        <input
          type="text"
          className="itq-search-input"
          placeholder="Maghanap ayon sa Pangalan, Tracking #, o Barangay..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            className="itq-search-clear"
            onClick={() => setSearch("")}
            title="I-clear ang paghahanap"
          >
            <IconClose />
          </button>
        )}
      </div>

      {/* List of Tasks */}
      <div className="itq-list">
        {inspectionTasks.length === 0 ? (
          <div className="itq-empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <strong style={{ display: "block", color: "#e2e8f0", marginBottom: 4 }}>
                Walang Nakabinbing Inspeksyon
              </strong>
              <span style={{ fontSize: 11.5 }}>
                Lahat ng binayarang aplikasyon ay na-inspeksyon o walang tumutugma sa iyong paghahanap.
              </span>
            </div>
          </div>
        ) : (
          inspectionTasks.map((project) => {
            const numericProgress =
              (project as any).numericProgress ?? project.progress ?? 0;
            const stage =
              (project as any).stage ||
              (project as any).inspectionStage ||
              (project as any).latestInspection?.stage ||
              (numericProgress >= 100
                ? "completed"
                : numericProgress >= 50
                ? "during"
                : "before");

            let pillClass = "stage-before";
            let pillLabel = "0% Bago";
            let dotColor = "#ef4444";

            if (numericProgress >= 100 || stage === "completed" || stage === "after") {
              pillClass = "stage-after";
              pillLabel = "100% Tapos";
              dotColor = "#22c55e";
            } else if (numericProgress >= 50 || stage === "during") {
              pillClass = "stage-during";
              pillLabel = "50% Ginagawa";
              dotColor = "#eab308";
            }

            const trackingNumber =
              (project as any).trackingNumber ||
              (project.id.startsWith("infra-app-")
                ? project.id.replace("infra-app-", "")
                : project.id);

            const applicantName = (project as any).applicantName || "";
            const isSelected = selectedProjectId === project.id;

            return (
              <div
                key={project.id}
                className={`itq-card${isSelected ? " is-selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => onLocateProject(project)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onLocateProject(project);
                  }
                }}
                title="I-click para puntahan ang lokasyon sa mapa"
              >
                <div className="itq-card-top">
                  <span className="itq-card-tracking">
                    <span className="itq-tracking-hash">#</span>
                    {trackingNumber}
                  </span>
                  <span className={`itq-stage-pill ${pillClass}`}>
                    <span
                      className="itq-stage-dot-circle"
                      style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}80` }}
                    />
                    <span>{pillLabel}</span>
                  </span>
                </div>

                <div className="itq-card-project-name">{project.name}</div>

                <div className="itq-card-meta-row">
                  {applicantName ? (
                    <span className="itq-meta-item" title="Aplikante">
                      <IconUser />
                      <span>{applicantName}</span>
                    </span>
                  ) : null}
                  {project.barangay ? (
                    <span className="itq-meta-item" title="Barangay">
                      <IconMapPin />
                      <span>{project.barangay}</span>
                    </span>
                  ) : null}
                  {(project as any).category ? (
                    <span className="itq-meta-item" title="Kategorya">
                      <IconCategory />
                      <span>{(project as any).category}</span>
                    </span>
                  ) : null}
                </div>

                <div className="itq-card-footer">
                  <span className="itq-card-locate-hint">
                    <span>Puntahan sa Mapa</span>
                    <span className="itq-arrow">
                      <IconArrowRight />
                    </span>
                  </span>
                  <button
                    type="button"
                    className="itq-btn-inspect"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectProject(project);
                    }}
                    title="I-update ang Progress ng Site"
                  >
                    <IconEdit />
                    <span>I-update</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="itq-embedded">
        <div className="itq-header">
          <div>
            <div className="itq-title">
              <span className="itq-title-icon">
                <IconClipboard size={16} />
              </span>
              <span>Inspection Task Queue</span>
              {inspectionTasks.length > 0 && (
                <span
                  style={{
                    background: "#ef4444",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "1px 6px",
                    borderRadius: 999,
                    marginLeft: 4,
                  }}
                >
                  {inspectionTasks.length}
                </span>
              )}
            </div>
            <p className="itq-subtitle">
              Mga bayad na aplikasyon na kailangang bisitahin sa site
            </p>
          </div>
        </div>
        {taskListContent}
      </div>
    );
  }

  return (
    <aside className={`itq-drawer ${isOpen ? "" : "is-collapsed"}`} aria-label="Inspection Task Queue">
      {/* External Handle Tab */}
      <button
        type="button"
        className="itq-toggle-tab"
        onClick={onToggle}
        title={isOpen ? "Itago ang Inspection Queue" : "Buksan ang Inspection Queue"}
        aria-label="Toggle Inspection Queue"
      >
        <span className="itq-tab-icon-wrap">
          <IconClipboard size={22} />
        </span>
        {inspectionTasks.length > 0 && (
          <span className="itq-badge-count">{inspectionTasks.length}</span>
        )}
      </button>

      {/* Drawer Header */}
      <div className="itq-header">
        <div>
          <h2 className="itq-title">
            <span className="itq-title-icon">
              <IconClipboard size={18} />
            </span>
            <span>Inspection Task Queue</span>
          </h2>
          <p className="itq-subtitle">
            Mga bayad na aplikasyon na kailangang bisitahin at i-update sa mapa
          </p>
        </div>
        {onToggle && (
          <button
            type="button"
            className="itq-close-btn"
            onClick={onToggle}
            title="Isara"
            aria-label="Isara ang listahan"
          >
            <IconClose />
          </button>
        )}
      </div>

      {taskListContent}
    </aside>
  );
};
