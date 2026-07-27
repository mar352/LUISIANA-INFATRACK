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
      canManageCalendar: false,
      canManageMeetings: false,
    };
  }

  const isViewer = role === "Viewer";
  const isMpdC = role === "MPDC";
  const isCommittee = role === "MPDC" || role === "Engineer" || role === "Agriculture";

  return {
    canView: true,
    canCreate: !isViewer,
    canComment: !isViewer,
    canSetPriority: isMpdC,
    canAssign: isMpdC,
    canRecommend: isCommittee,
    canApprove: isMpdC,
    canManageCalendar: !isViewer,
    canManageMeetings: isMpdC || role === "Engineer",
  };
}

/** Allowed next statuses from current status for a given role. */
export function allowedStatusTransitions(
  status: PlanningProposalStatus,
  role: UserRole | null,
): PlanningProposalStatus[] {
  if (!role || role === "Viewer") return [];

  const perms = getPlanningPermissions(role);
  const next: PlanningProposalStatus[] = [];

  switch (status) {
    case "draft":
      if (perms.canCreate) next.push("submitted");
      break;
    case "submitted":
      if (perms.canAssign || perms.canRecommend) next.push("in_review");
      break;
    case "in_review":
      if (perms.canRecommend) {
        next.push("recommended", "returned");
      }
      if (perms.canApprove) next.push("rejected");
      break;
    case "recommended":
      if (perms.canApprove) next.push("approved", "rejected", "returned");
      break;
    case "returned":
      if (perms.canCreate) next.push("submitted");
      break;
    default:
      break;
  }

  return next;
}

export function departmentForRole(role: UserRole): "MPDC" | "Engineering" | "Agriculture" | "Negosyo Center" {
  if (role === "Engineer") return "Engineering";
  if (role === "Agriculture") return "Agriculture";
  if (role === "Negosyo Center") return "Negosyo Center";
  return "MPDC";
}
