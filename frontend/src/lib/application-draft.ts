/**
 * application-draft.ts
 * Manages auto-saving, local persistence, and restoring of in-progress
 * citizen application forms across browser refreshes and tab reloads.
 */

import type {
  ApplicationCategory,
  AgriculturalFarmType,
  MunicipalFundingSource,
} from "../types";

export const DRAFT_STORAGE_KEY = "infatrack_application_draft_v1";

export interface AttachedDocDraft {
  name: string;
  url?: string;
  size: number;
}

export interface ApplicationDraft {
  step: 1 | 2 | 3;
  category: ApplicationCategory;
  title: string;
  applicantName: string;
  contactPhone: string;
  contactEmail: string;
  barangay: string;
  locationDescription: string;
  lotAreaSqM: number | "";
  estimatedCostPhp: number | "";
  // Private Infrastructure fields
  tctNo: string;
  taxDecNo: string;
  buildingType: string;
  isOwner: boolean;
  // Agricultural fields
  farmType: AgriculturalFarmType;
  headCapacity: number | "";
  wasteManagement: string;
  bufferComplianceConfirmed: boolean;
  // Municipal fields
  implementingDepartment: string;
  fundingSource: MunicipalFundingSource;
  cipCode: string;
  targetBeneficiaries: string;
  notes: string;
  // Coordinates
  pinnedCoords: { lon: number; lat: number };
  // Attached Documents metadata
  attachedDocs: {
    landTitle?: AttachedDocDraft | null;
    taxDec?: AttachedDocDraft | null;
    rptReceipt?: AttachedDocDraft | null;
    brgyClearance?: AttachedDocDraft | null;
    ploCert?: AttachedDocDraft | null;
    photoDocs?: AttachedDocDraft | null;
  };
  savedAt: string;
}

/**
 * Reads and parses the active application draft from localStorage.
 * Returns null if no draft exists or if the data is corrupt/empty.
 */
export function loadApplicationDraft(): ApplicationDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    // Verify it contains meaningful data
    const hasProgress =
      parsed.step > 1 ||
      Boolean(parsed.applicantName?.trim()) ||
      Boolean(parsed.contactPhone?.trim()) ||
      Boolean(parsed.title?.trim()) ||
      Boolean(parsed.tctNo?.trim()) ||
      Boolean(parsed.taxDecNo?.trim()) ||
      Boolean(parsed.locationDescription?.trim()) ||
      Boolean(parsed.lotAreaSqM) ||
      Boolean(parsed.estimatedCostPhp);

    if (!hasProgress) return null;
    return parsed as ApplicationDraft;
  } catch {
    return null;
  }
}

/**
 * Saves the current draft to localStorage.
 */
export function saveApplicationDraft(draft: ApplicationDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Clears the stored draft from localStorage upon successful application submission
 * or when the user explicitly requests to start over fresh.
 */
export function clearApplicationDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Checks if a valid draft exists in localStorage.
 */
export function hasApplicationDraft(): boolean {
  return loadApplicationDraft() !== null;
}
