/**
 * mpdc-charter.ts
 *
 * Official Citizen's Charter Specifications for the Office of the
 * Municipal Planning and Development Coordinator (MPDC) - Luisiana, Laguna.
 */

import type { CitizenServiceType } from "../types";

export type CharterRequirementSpec = {
  id: string;
  label: string;
  whereToSecure: string;
  required: boolean;
  multiple: boolean;
  notes?: string;
  acceptTypes: string; // "pdf,image/*"
  maxSizeMb: number;
};

export type CharterAgencyStep = {
  stepNumber: number;
  clientStep: string;
  agencyAction: string[];
  fees: string;
  processingTime: string;
  personsResponsible: { name: string; title: string }[];
};

export type MPDCCharterService = {
  id: CitizenServiceType;
  number: number;
  title: string;
  shortTitle: string;
  description: string;
  office: string;
  classification: "Simple" | "Complex" | "Highly Technical";
  transactionType: "G2C – Government to Citizen" | "G2B" | "G2G";
  whoMayAvail: string;
  totalTime: string;
  totalFees: string;
  requirements: CharterRequirementSpec[];
  steps: CharterAgencyStep[];
};

export const MPDC_CHARTER_SERVICES: Record<CitizenServiceType, MPDCCharterService> = {
  zoning_certificate: {
    id: "zoning_certificate",
    number: 2,
    title: "Securing Zoning Certificate for Building Construction (Exemption)",
    shortTitle: "Zoning Certificate",
    description:
      "Zoning Certification is required to be completed before conducting any activity or construction in a specific area as to define/delineate in the map zone boundaries where the property is located, to identify activities which shall be allowed within each zone to ensure that objectives of the Comprehensive Land Use Plan (CLUP), and Zoning Ordinance are achieved.",
    office: "Office of the Municipal Planning and Development (MPDC)",
    classification: "Simple",
    transactionType: "G2C – Government to Citizen",
    whoMayAvail: "Anybody who wishes to Establish Building(s) or Develop a Particular Area",
    totalTime: "1 Day 12 Minutes",
    totalFees: "None (Free)",
    requirements: [
      {
        id: "tct_tax_dec",
        label: "Photocopy of TCT / Tax Declaration",
        whereToSecure: "Municipal Assessor's Office",
        required: true,
        multiple: false,
        notes: "TCT: 1 Original, 1 Photocopy · Tax Dec: 1 Original, 4 Photocopies",
        acceptTypes: ".pdf,.jpg,.jpeg,.png,.webp",
        maxSizeMb: 15,
      },
      {
        id: "deed_consent",
        label: "Deed of Sale / Lease / Donation / Affidavit of Consent",
        whereToSecure: "Notarized Document (if lot is not in applicant's name)",
        required: false,
        multiple: false,
        notes: "Required ONLY if the property/tax declaration is not registered under the applicant's name.",
        acceptTypes: ".pdf,.jpg,.jpeg,.png,.webp",
        maxSizeMb: 15,
      },
      {
        id: "rpt_receipt",
        label: "Current Real Property Tax (RPT) Receipt",
        whereToSecure: "Municipal Treasurer's Office",
        required: true,
        multiple: false,
        notes: "Official receipt of the latest annual real property tax payment.",
        acceptTypes: ".pdf,.jpg,.jpeg,.png,.webp",
        maxSizeMb: 15,
      },
      {
        id: "brgy_clearance",
        label: "Barangay Clearance for Construction",
        whereToSecure: "Barangay Hall / Barangay Level",
        required: true,
        multiple: false,
        notes: "Original copy issued by the Punong Barangay of the project site.",
        acceptTypes: ".pdf,.jpg,.jpeg,.png,.webp",
        maxSizeMb: 15,
      },
      {
        id: "plo_cert",
        label: "Power Line Operator (PLO) Certification",
        whereToSecure: "MERALCO",
        required: true,
        multiple: false,
        notes: "2 copies clearance from power line proximity hazard.",
        acceptTypes: ".pdf,.jpg,.jpeg,.png,.webp",
        maxSizeMb: 15,
      },
      {
        id: "photo_doc",
        label: "Photo Documentation (Inside, Outside, and Toilet)",
        whereToSecure: "Accountability by the owner / Applicant",
        required: true,
        multiple: true,
        notes: "Clear photographic captures showing existing lot structure, exterior facade, and sanitation facility/toilet.",
        acceptTypes: ".jpg,.jpeg,.png,.webp",
        maxSizeMb: 15,
      },
    ],
    steps: [
      {
        stepNumber: 1,
        clientStep: "Accomplishment of Requirements & Online Submission",
        agencyAction: [
          "1.1. Accomplished necessary requirements for the application.",
          "1.2. Verify the completeness of the submitted requirements.",
        ],
        fees: "None",
        processingTime: "10 minutes",
        personsResponsible: [{ name: "Bon Ryan P. Pedron", title: "Admin Aide / Intake Officer" }],
      },
      {
        stepNumber: 2,
        clientStep: "Preparation of Zoning Certificate & Ocular Inspection",
        agencyAction: [
          "2.1. Leave the requirements for review, verification, permit preparation and signing.",
          "2.2. Conduct ocular inspection of the site if applicable.",
        ],
        fees: "None",
        processingTime: "1 day",
        personsResponsible: [
          { name: "Engr. Mario S. Baldovino", title: "Municipal Planning & Development Coordinator (MPDC)" },
          { name: "Edward B. Romulo, EnP.", title: "Zoning Officer" },
          { name: "Randy A. Balasabas", title: "Admin Aide" },
        ],
      },
      {
        stepNumber: 3,
        clientStep: "Issuance of Zoning Certificate",
        agencyAction: [
          "3.1. Releasing and claiming of approved Zoning Certificate / Digital Location Clearance.",
        ],
        fees: "None",
        processingTime: "2 minutes",
        personsResponsible: [{ name: "Bon Ryan P. Pedron", title: "Admin Aide / Releasing Officer" }],
      },
    ],
  },
  land_titling: {
    id: "land_titling",
    number: 4,
    title: "Securing MPDC Certification (Application for Land Titling)",
    shortTitle: "Land Titling Certification",
    description:
      "Locational clearance and municipal zoning certification required for endorsing land titling and cadastral applications to the Department of Environment and Natural Resources (DENR-CENRO).",
    office: "Office of the Municipal Planning and Development (MPDC)",
    classification: "Simple",
    transactionType: "G2C – Government to Citizen",
    whoMayAvail: "Individuals or entities applying for Land Titling with DENR",
    totalTime: "1 Day 12 Minutes",
    totalFees: "None (Free)",
    requirements: [
      {
        id: "denr_letter",
        label: "Request Letter for Titling from DENR / CENRO",
        whereToSecure: "Community and Natural Resources Office (DENR)",
        required: true,
        multiple: false,
        notes: "Official endorsement / request letter from DENR-CENRO.",
        acceptTypes: ".pdf,.jpg,.jpeg,.png,.webp",
        maxSizeMb: 15,
      },
      {
        id: "tax_dec",
        label: "Tax Declaration & Sketch Plan",
        whereToSecure: "Municipal Assessor's Office / Geodetic Engineer",
        required: true,
        multiple: false,
        notes: "Copy of current Tax Declaration and approved subdivision/boundary sketch plan.",
        acceptTypes: ".pdf,.jpg,.jpeg,.png,.webp",
        maxSizeMb: 15,
      },
      {
        id: "brgy_clearance",
        label: "Barangay Clearance for Land Titling",
        whereToSecure: "Barangay Level",
        required: true,
        multiple: false,
        notes: "Certificate of no pending land dispute from the Barangay Agrarian/Lupon.",
        acceptTypes: ".pdf,.jpg,.jpeg,.png,.webp",
        maxSizeMb: 15,
      },
    ],
    steps: [
      {
        stepNumber: 1,
        clientStep: "Accomplishment & Submission of Completed Requirements",
        agencyAction: [
          "1.1. Intake and completeness check of the titling request and attachments.",
        ],
        fees: "None",
        processingTime: "10 minutes",
        personsResponsible: [{ name: "Bon Ryan P. Pedron", title: "Admin Aide / Intake Officer" }],
      },
      {
        stepNumber: 2,
        clientStep: "Review, Verification & Signing (Ocular Inspection for Special Cases)",
        agencyAction: [
          "2.1. Review of boundary and zoning conformity with the CLUP.",
          "2.2. Ocular site inspection for special or environmentally critical cases.",
        ],
        fees: "None",
        processingTime: "1 day",
        personsResponsible: [
          { name: "Edward B. Romulo, EnP.", title: "Zoning Officer" },
          { name: "Randy A. Balasabas", title: "Admin Aide" },
        ],
      },
      {
        stepNumber: 3,
        clientStep: "Issuance of Location Clearance / Certification",
        agencyAction: [
          "3.1. Releasing of Location Clearance for non-critical projects (immediate) or after 1 day for critical sites.",
        ],
        fees: "None",
        processingTime: "2 minutes",
        personsResponsible: [{ name: "Bon Ryan P. Pedron", title: "Admin Aide / Releasing Officer" }],
      },
    ],
  },
  planning_research: {
    id: "planning_research",
    number: 3,
    title: "Researching Planning and Development Information",
    shortTitle: "Research & Development Data",
    description:
      "Public access for students, researchers, academic institutions, and development organizations to the Comprehensive Land Use Plan (CLUP), Socio-Economic Profile, GIS zoning maps, and statistical development data.",
    office: "Office of the Municipal Planning and Development (MPDC)",
    classification: "Simple",
    transactionType: "G2C – Government to Citizen",
    whoMayAvail: "Students / Academic Researchers / Non-Government Organizations",
    totalTime: "1 Hour 2 Minutes",
    totalFees: "None (Free)",
    requirements: [
      {
        id: "student_id_letter",
        label: "Identification Card and/or Formal Request Letter",
        whereToSecure: "School / University / Research Organization",
        required: true,
        multiple: false,
        notes: "Scanned copy of School/Government ID or Signed Institutional Request Letter specifying research topics.",
        acceptTypes: ".pdf,.jpg,.jpeg,.png,.webp",
        maxSizeMb: 15,
      },
    ],
    steps: [
      {
        stepNumber: 1,
        clientStep: "Inquiry & Research Registration",
        agencyAction: [
          "1.1. Approach frontline personnel, provide request letter, and log research objective.",
        ],
        fees: "None",
        processingTime: "2 minutes",
        personsResponsible: [
          { name: "Joy Anne O. Claricia", title: "Planning Officer" },
          { name: "Engr. Cher L. Zabate", title: "Planning Assistant" },
          { name: "Rosette Princess R. Dela Torre", title: "Statistician Aide" },
          { name: "Randy A. Balasabas", title: "Admin Aide" },
        ],
      },
      {
        stepNumber: 2,
        clientStep: "Access Information & Data Gathering",
        agencyAction: [
          "2.1. Conduct data consultation, GIS spatial briefing, and interview if necessary.",
        ],
        fees: "None",
        processingTime: "1 hour",
        personsResponsible: [
          { name: "Engr. Mario S. Baldovino", title: "MPDC" },
          { name: "Joy Anne O. Claricia", title: "Planning Officer" },
          { name: "Engr. Cher L. Zabate", title: "Planning Assistant" },
          { name: "Rosette Princess R. Dela Torre", title: "Statistician Aide" },
          { name: "Rhyn Giorvic O. Cargar", title: "Information Technology" },
        ],
      },
      {
        stepNumber: 3,
        clientStep: "Releasing of Materials & Digital Data Access",
        agencyAction: [
          "3.1. Releasing of electronic/printed data, maps, and statistical references.",
        ],
        fees: "None",
        processingTime: "Immediate",
        personsResponsible: [
          { name: "Joy Anne O. Claricia", title: "Planning Officer" },
          { name: "Engr. Cher L. Zabate", title: "Planning Assistant" },
          { name: "Rosette Princess R. Dela Torre", title: "Statistician Aide" },
          { name: "Rhyn Giorvic O. Cargar", title: "Information Technology" },
        ],
      },
    ],
  },
};

export function getCharterService(type: CitizenServiceType): MPDCCharterService {
  return MPDC_CHARTER_SERVICES[type] || MPDC_CHARTER_SERVICES.zoning_certificate;
}

export function validateFileSizeAndFormat(
  file: File,
  spec: CharterRequirementSpec
): { valid: boolean; error?: string } {
  const maxBytes = spec.maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File exceeds maximum allowed size of ${spec.maxSizeMb}MB (${(file.size / (1024 * 1024)).toFixed(1)}MB uploaded).`,
    };
  }

  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const allowed = spec.acceptTypes.split(",").map((s) => s.trim().toLowerCase());
  const isImage = file.type.startsWith("image/") && allowed.some((a) => a === "image/*" || a.includes(ext));
  const isPdf = file.type === "application/pdf" || ext === ".pdf";

  if (!isImage && !isPdf && !allowed.includes(ext)) {
    return {
      valid: false,
      error: `Invalid file format "${ext}". Allowed: PDF, JPG, PNG, WEBP.`,
    };
  }

  return { valid: true };
}
