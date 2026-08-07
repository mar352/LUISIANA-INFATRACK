import type { UserRole } from "../ui/Landing";

export type DocumentPermissions = {
  canView: boolean;
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

/** Offices can manage the repository; Viewer is read-only. */
export function getDocumentPermissions(role: UserRole | null): DocumentPermissions {
  if (!role) {
    return { canView: false, canUpload: false, canEdit: false, canDelete: false };
  }
  const isViewer = role === "Viewer";
  return {
    canView: true,
    canUpload: !isViewer,
    canEdit: !isViewer,
    canDelete: !isViewer,
  };
}
