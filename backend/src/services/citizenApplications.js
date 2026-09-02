import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../../data");
const APPLICATIONS_PATH = path.join(DATA_DIR, "citizen-applications.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadApplications() {
  try {
    if (!fs.existsSync(APPLICATIONS_PATH)) {
      fs.writeFileSync(APPLICATIONS_PATH, JSON.stringify([], null, 2), "utf8");
      return [];
    }
    const raw = fs.readFileSync(APPLICATIONS_PATH, "utf8");
    return JSON.parse(raw) || [];
  } catch (err) {
    console.warn("[citizenApplications] failed to read json:", err.message);
    return [];
  }
}

function saveApplications(list) {
  try {
    fs.writeFileSync(APPLICATIONS_PATH, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.error("[citizenApplications] failed to save json:", err.message);
  }
}

let applications = loadApplications();

function generateTrackingNumber(serviceType) {
  const prefix =
    serviceType === "zoning_certificate"
      ? "LUIS-ZC"
      : serviceType === "land_titling"
      ? "LUIS-LT"
      : serviceType === "planning_research"
      ? "LUIS-RES"
      : "LUIS-APP";
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${year}-${rand}`;
}

export function listCitizenApplications() {
  return applications;
}

export function getCitizenApplicationByTracking(trackingNumber) {
  const norm = String(trackingNumber || "").trim().toUpperCase();
  return applications.find(
    (a) => a.trackingNumber?.toUpperCase() === norm || a.id === trackingNumber
  ) || null;
}

export function createCitizenApplication(data) {
  const serviceType = data.serviceType || "zoning_certificate";
  const trackingNumber = generateTrackingNumber(serviceType);
  const now = new Date().toISOString();

  const newApp = {
    id: `app-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    trackingNumber,
    serviceType,
    applicant: {
      fullName: data.applicant?.fullName || "",
      contactPhone: data.applicant?.contactPhone || "",
      contactEmail: data.applicant?.contactEmail || "",
      address: data.applicant?.address || "",
      barangay: data.applicant?.barangay || "Poblacion",
    },
    lotDetails: {
      tctNo: data.lotDetails?.tctNo || "",
      taxDecNo: data.lotDetails?.taxDecNo || "",
      lotOwner: data.lotDetails?.lotOwner || "",
      isApplicantOwner: Boolean(data.lotDetails?.isApplicantOwner),
      proposedBuildingType: data.lotDetails?.proposedBuildingType || "",
      lotAreaSqM: Number(data.lotDetails?.lotAreaSqM) || 0,
      lotLocationDescription: data.lotDetails?.lotLocationDescription || "",
    },
    uploads: {
      tctTaxDec: Array.isArray(data.uploads?.tctTaxDec) ? data.uploads.tctTaxDec : [],
      deedOrConsent: Array.isArray(data.uploads?.deedOrConsent) ? data.uploads.deedOrConsent : [],
      rptReceipt: Array.isArray(data.uploads?.rptReceipt) ? data.uploads.rptReceipt : [],
      brgyClearance: Array.isArray(data.uploads?.brgyClearance) ? data.uploads.brgyClearance : [],
      ploCert: Array.isArray(data.uploads?.ploCert) ? data.uploads.ploCert : [],
      photoDocs: Array.isArray(data.uploads?.photoDocs) ? data.uploads.photoDocs : [],
      denrLetter: Array.isArray(data.uploads?.denrLetter) ? data.uploads.denrLetter : [],
      studentIdLetter: Array.isArray(data.uploads?.studentIdLetter) ? data.uploads.studentIdLetter : [],
    },
    notes: data.notes || "",
    status: "submitted",
    stepProgress: {
      currentStep: 1,
      totalSteps: serviceType === "planning_research" ? 3 : 3,
      step1Completed: true,
      step1At: now,
      step1By: "Online Resident Submission",
      step2Completed: false,
      step2At: null,
      step2By: null,
      step3Completed: false,
      step3At: null,
      step3By: null,
    },
    responsibleOfficers:
      serviceType === "zoning_certificate"
        ? [
            { name: "Bon Ryan P. Pedron", role: "Admin Aide (Verification & Issuance)" },
            { name: "Edward B. Romulo, EnP.", role: "Zoning Officer (Review & Permit Preparation)" },
            { name: "Engr. Mario S. Baldovino", role: "MPDC (Final Approval & Signing)" },
            { name: "Randy A. Balasabas", role: "Admin Aide (Inspection & Verification)" },
          ]
        : serviceType === "land_titling"
        ? [
            { name: "Bon Ryan P. Pedron", role: "Admin Aide (Intake & Issuance)" },
            { name: "Edward B. Romulo, EnP.", role: "Zoning Officer (Review & Inspection)" },
            { name: "Randy A. Balasabas", role: "Admin Aide (Verification)" },
          ]
        : [
            { name: "Joy Anne O. Claricia", role: "Planning Officer (Inquiry & Data Release)" },
            { name: "Engr. Cher L. Zabate", role: "Planning Assistant (Data Gathering)" },
            { name: "Rosette Princess R. Dela Torre", role: "Statistician Aide" },
            { name: "Rhyn Giorvic O. Cargar", role: "Information Technology" },
          ],
    slaDays: 1,
    slaMinutes: 12,
    fee: "None (Free)",
    createdAt: now,
    updatedAt: now,
  };

  applications.unshift(newApp);
  saveApplications(applications);
  return newApp;
}

export function updateCitizenApplication(id, patch) {
  const index = applications.findIndex((a) => a.id === id || a.trackingNumber === id);
  if (index === -1) return null;

  const current = applications[index];
  const updated = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  applications[index] = updated;
  saveApplications(applications);
  return updated;
}
