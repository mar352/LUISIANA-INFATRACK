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

export const DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours TTL

/**
 * Checks whether an ApplicationDraft object contains actual user-entered data
 * (excluding wizard step navigation and default system choices).
 */
export function hasMeaningfulDraftData(draft: Partial<ApplicationDraft> | null | undefined): boolean {
  if (!draft || typeof draft !== "object") return false;

  const hasText = (val?: unknown) => typeof val === "string" && val.trim().length > 0;
  const hasPositiveNumber = (val?: unknown) => typeof val === "number" && !isNaN(val) && val > 0;
  const hasDoc = (doc?: AttachedDocDraft | null) => Boolean(doc && doc.name && doc.name.trim().length > 0);

  // User-entered text fields
  if (
    hasText(draft.title) ||
    hasText(draft.applicantName) ||
    hasText(draft.contactPhone) ||
    hasText(draft.contactEmail) ||
    hasText(draft.locationDescription) ||
    hasText(draft.tctNo) ||
    hasText(draft.taxDecNo) ||
    hasText(draft.cipCode) ||
    hasText(draft.notes)
  ) {
    return true;
  }

  // Meaningful numeric entries
  if (hasPositiveNumber(draft.lotAreaSqM) || hasPositiveNumber(draft.estimatedCostPhp)) {
    return true;
  }

  // Any attached documents
  if (draft.attachedDocs && typeof draft.attachedDocs === "object") {
    const docs = draft.attachedDocs;
    if (
      hasDoc(docs.landTitle) ||
      hasDoc(docs.taxDec) ||
      hasDoc(docs.rptReceipt) ||
      hasDoc(docs.brgyClearance) ||
      hasDoc(docs.ploCert) ||
      hasDoc(docs.photoDocs)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Reads and parses the active application draft from localStorage.
 * Returns null if no draft exists, if the data is corrupt/empty, or if expired.
 * Automatically cleans up invalid or empty draft artifacts from localStorage.
 */
export function loadApplicationDraft(): ApplicationDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      clearApplicationDraft();
      return null;
    }

    // Verify it contains meaningful user-entered data (not just empty steps or blank defaults)
    if (!hasMeaningfulDraftData(parsed)) {
      clearApplicationDraft();
      return null;
    }

    // Check expiration (48 hours)
    if (parsed.savedAt) {
      const savedTime = new Date(parsed.savedAt).getTime();
      if (!isNaN(savedTime) && Date.now() - savedTime > DRAFT_MAX_AGE_MS) {
        clearApplicationDraft();
        return null;
      }
    }

    return parsed as ApplicationDraft;
  } catch {
    clearApplicationDraft();
    return null;
  }
}

/**
 * Saves the current draft to localStorage only if it contains meaningful data.
 * If user cleared all inputs, removes the draft to avoid keeping empty records.
 */
export function saveApplicationDraft(draft: ApplicationDraft): void {
  if (typeof window === "undefined") return;
  try {
    if (!hasMeaningfulDraftData(draft)) {
      clearApplicationDraft();
      return;
    }
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
