import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Landmark, X } from "lucide-react";
import type { Project } from "../types";
import type { SessionUser } from "../services/auth";
import { AddLguProjectForm, type ProjectStatusOption } from "./AddLguProjectForm";
import "./AddLguProjectModal.css";

export type { ProjectStatusOption };
export { AddLguProjectForm };

export interface AddLguProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newProject: Project) => void;
  currentSession?: SessionUser | null;
  currentRole?: string | null;
  isModal?: boolean;
}

export const AddLguProjectModal: React.FC<AddLguProjectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentSession,
  currentRole,
  isModal = true,
}) => {
  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className={`lgu-modal-backdrop ${isModal ? "active" : "inline"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lgu-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="lgu-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="lgu-modal-header">
          <div className="lgu-header-badge-row">
            <span className="lgu-seal-badge">
              <Landmark size={14} />
              <span>Municipality of Luisiana</span>
            </span>
            <span className="lgu-portal-tag">INFA-TRACK · Internal Staff</span>
          </div>
          <div className="lgu-header-title-row">
            <div>
              <h2 id="lgu-modal-title" className="lgu-modal-title">Add LGU Project</h2>
              <p className="lgu-modal-subtitle">
                Encode municipal infrastructure projects for 2D/3D map pinning, procurement compliance, and public transparency.
              </p>
            </div>
            <button
              type="button"
              className="lgu-modal-close-btn"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body / Embedded Form Component */}
        <AddLguProjectForm
          onCancel={onClose}
          onSuccess={(newProject) => {
            onSuccess?.(newProject);
            onClose();
          }}
          currentSession={currentSession}
          currentRole={currentRole}
        />
      </div>
    </div>
  );

  if (isModal && typeof document !== "undefined") {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

export default AddLguProjectModal;
