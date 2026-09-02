import type { UserRole } from "../ui/Landing";
import type { PlanningProposalStatus } from "../types";

export type PlanningPermissions = {
  canView: boolean;
  canCreate: boolean;
  canComment: boolean;
  canSetPriority: boolean;
  canAssign: boolean;
  canRecommend: boolean;
  canApprove: boolean;
  canChangeStatus: boolean;
  canVote: boolean;
  canManageCalendar: boolean;
  canManageMeetings: boolean;
};

export function getPlanningPermissions(role: UserRole | null): PlanningPermissions {
  if (!role) {
    return {
      canView: false,
      canCreate: false,
      canComment: false,
      canSetPriority: false,
      canAssign: false,
      canRecommend: false,
      canApprove: false,
      canChangeStatus: false,
      canVote: false,
      canManageCalendar: false,
      canManageMeetings: false,
    };
  }

  const isViewer = role === "Viewer";
  const isBarangay = role === "Barangay Official";
  const isMpdC = role === "MPDC";
  const isNegosyo = role === "Negosyo Center";

  return {
    canView: !isViewer && !isNegosyo,
    canCreate: !isViewer && !isNegosyo,
    canComment: !isViewer && !isNegosyo,
    canSetPriority: isMpdC,
    canAssign: isMpdC,
    canRecommend: isMpdC,
    canApprove: isMpdC,
    canChangeStatus: isMpdC,
    canVote: !isViewer && !isBarangay && !isNegosyo,
    canManageCalendar: !isViewer && !isBarangay && !isNegosyo,
    canManageMeetings: (isMpdC || role === "Engineer") && !isBarangay && !isNegosyo,
  };
}

/** Allowed next statuses from current status for a given role. */
export function allowedStatusTransitions(
  status: PlanningProposalStatus,
  role: UserRole | null,
): PlanningProposalStatus[] {
  if (!role || role === "Viewer" || role === "Negosyo Center") return [];

  // Submitters may only file / resubmit. MPDC owns the review pipeline.
  if (role !== "MPDC") {
    if (status === "draft" || status === "returned") return ["submitted"];
    return [];
  }

  const next: PlanningProposalStatus[] = [];
  switch (status) {
    case "draft":
      next.push("submitted");
      break;
    case "submitted":
      next.push("in_review", "returned", "rejected");
      break;
    case "in_review":
      next.push("recommended", "returned", "rejected");
      break;
    case "recommended":
      next.push("approved", "returned", "rejected");
      break;
    case "returned":
      next.push("submitted", "rejected");
      break;
    default:
      break;
  }
  return next;
}

export function departmentForRole(role: UserRole): "MPDC" | "Engineering" | "Agriculture" {
  if (role === "Engineer") return "Engineering";
  if (role === "Agriculture") return "Agriculture";
  return "MPDC";
}
