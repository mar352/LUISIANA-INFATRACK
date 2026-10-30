import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query, isDbConnected, insertSiteInspectionPhoto, getSiteInspectionPhotosFromDb } from "./db.js";
import { computeApplicationHash, hashField } from "./dataHash.js";
import { recordTermsConsent } from "./termsConsent.js";

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
    const list = JSON.parse(raw) || [];
    let updatedAny = false;
    for (const app of list) {
      if (app.applicant) {
        if (!app.applicant.email && app.applicant.contactEmail) {
          app.applicant.email = app.applicant.contactEmail;
        }
        if (!app.applicant.contactEmail && app.applicant.email) {
          app.applicant.contactEmail = app.applicant.email;
        }
      }
      if (app.lotDetails) {
        if (!app.property) {
          app.property = {
            tctNo: app.lotDetails.tctNo || "",
            taxDecNo: app.lotDetails.taxDecNo || "",
            isRegisteredOwner: Boolean(app.lotDetails.isApplicantOwner ?? app.isOwner),
            proposedBuildingType: app.lotDetails.proposedBuildingType || app.buildingType || "Residential",
            lotAreaSqM: Number(app.lotDetails.lotAreaSqM) || 0,
            locationDescription: app.lotDetails.lotLocationDescription || app.applicant?.address || "",
          };
        } else {
          if (!app.property.tctNo && app.lotDetails.tctNo) app.property.tctNo = app.lotDetails.tctNo;
          if (!app.property.taxDecNo && app.lotDetails.taxDecNo) app.property.taxDecNo = app.lotDetails.taxDecNo;
          if (app.property.isRegisteredOwner === undefined && app.lotDetails.isApplicantOwner !== undefined) {
            app.property.isRegisteredOwner = Boolean(app.lotDetails.isApplicantOwner);
          }
          if (!app.property.proposedBuildingType && app.lotDetails.proposedBuildingType) {
            app.property.proposedBuildingType = app.lotDetails.proposedBuildingType;
          }
          if (!app.property.lotAreaSqM && app.lotDetails.lotAreaSqM) {
            app.property.lotAreaSqM = Number(app.lotDetails.lotAreaSqM);
          }
          if (!app.property.locationDescription && (app.lotDetails.lotLocationDescription || app.applicant?.address)) {
            app.property.locationDescription = app.lotDetails.lotLocationDescription || app.applicant?.address;
          }
        }
      } else if (app.property) {
        app.lotDetails = {
          tctNo: app.property.tctNo || "",
          taxDecNo: app.property.taxDecNo || "",
          lotOwner: "",
          isApplicantOwner: Boolean(app.property.isRegisteredOwner),
          proposedBuildingType: app.property.proposedBuildingType || "Residential",
          lotAreaSqM: Number(app.property.lotAreaSqM) || 0,
          lotLocationDescription: app.property.locationDescription || app.applicant?.address || "",
          zoningClassification: app.zoningClassification || "Urban / Commercial Zone",
          lat: app.latitude || null,
          lon: app.longitude || null,
        };
      }
      if (!app.dataHash) {
        app.dataHash = computeApplicationHash(app);
        updatedAny = true;
      }
    }
    if (updatedAny) {
      saveApplications(list);
    }
    return list;
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
  applications = loadApplications();
  return applications;
}

export function getCitizenApplicationByTracking(trackingNumber) {
  applications = loadApplications();
  const norm = String(trackingNumber || "").trim().toUpperCase();
  return (
    applications.find(
      (a) =>
        a.trackingNumber?.toUpperCase() === norm ||
        a.id === trackingNumber ||
        a.payment?.orderOfPaymentNo?.toUpperCase() === norm ||
        a.orderOfPaymentNo?.toUpperCase() === norm ||
        a.payment?.orNumber?.toUpperCase() === norm ||
        a.payment?.or_number?.toUpperCase() === norm ||
        a.or_number?.toUpperCase() === norm
    ) || null
  );
}

export function createCitizenApplication(data) {
  const serviceType = data.serviceType || "zoning_certificate";
  const trackingNumber = generateTrackingNumber(serviceType);
  const now = new Date().toISOString();

  const lat = Number(data.lotDetails?.lat ?? data.coordinates?.lat ?? data.lat) || null;
  const lon = Number(data.lotDetails?.lon ?? data.coordinates?.lon ?? data.lon) || null;
  const projectTitle = data.projectTitle || data.title || "";
  const category = data.category || "private_infrastructure";
  const estimatedCost = Number(data.estimatedCost ?? data.estimatedCostPhp) || 0;
  const geoRisk = data.geoRisk || {};
  const agriculturalDetails = data.agriculturalDetails || {
    farmType: data.farmType || "",
    headCapacity: Number(data.headCapacity) || 0,
    wasteManagement: data.wasteManagement || "",
    bufferComplianceConfirmed: Boolean(data.bufferComplianceConfirmed),
  };
  const municipalDetails = data.municipalDetails || {
    implementingDepartment: data.implementingDepartment || "",
    fundingSource: data.fundingSource || "",
    cipCode: data.cipCode || "",
    targetBeneficiaries: data.targetBeneficiaries || "",
  };

    const isUrban =
      /zone\s+[ivx\d]+/i.test(data.applicant?.barangay || "") ||
      /poblacion/i.test(data.applicant?.barangay || "");
    const zoningClassification =
      data.zoningClassification || (isUrban ? "Urban / Commercial Zone" : "Rural Zone");

  // Validate mandatory document uploads when submitted via citizen application
  if (data.uploads && typeof data.uploads === "object") {
    // 1. Photo documentation must not be a PDF
    if (Array.isArray(data.uploads.photoDocs)) {
      for (const doc of data.uploads.photoDocs) {
        const name = (doc.originalName || doc.url || "").toLowerCase();
        if (name.endsWith(".pdf")) {
          throw new Error("Di-pinahihintulutan: Ang Photo Documentation ay para lamang sa mga litrato (JPG, PNG, WEBP). Hindi pinapayagan ang PDF sa field na ito.");
        }
      }
    }

    // 2. Cross-field duplicate file detection (ensure distinct documents across mandatory fields)
    const checkedFields = ["tctTaxDec", "taxDeclaration", "rptReceipt", "brgyClearance", "ploCert", "photoDocs"];
    const seenUrls = new Map();
    const seenNames = new Map();

    for (const field of checkedFields) {
      const items = Array.isArray(data.uploads[field]) ? data.uploads[field] : [];
      for (const item of items) {
        if (item.url) {
          const normUrl = item.url.trim().toLowerCase();
          if (seenUrls.has(normUrl)) {
            throw new Error(`Nauulit na file sa aplikasyon: Ang dokumento sa "${field}" ay katulad ng sa "${seenUrls.get(normUrl)}". Ang bawat requirement ay dapat may sariling kaukulang dokumento.`);
          }
          seenUrls.set(normUrl, field);
        }
        if (item.originalName && item.size) {
          const sig = `${item.originalName.trim().toLowerCase()}-${item.size}`;
          if (seenNames.has(sig)) {
            throw new Error(`Nauulit na dokumento: Ang file na "${item.originalName}" ay ginamit na sa "${seenNames.get(sig)}".`);
          }
          seenNames.set(sig, field);
        }
      }
    }
  }

  const newApp = {
    id: `app-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      trackingNumber,
      serviceType,
      projectTitle,
      category,
      estimatedCost,
      applicant: {
        fullName: data.applicant?.fullName || "",
        contactPhone: data.applicant?.contactPhone || data.applicant?.phone || "",
        contactEmail: data.applicant?.contactEmail || data.applicant?.email || "",
        email: data.applicant?.contactEmail || data.applicant?.email || "",
        address: data.applicant?.address || "",
        barangay: data.applicant?.barangay || "Poblacion",
      },
      latitude: lat,
      longitude: lon,
      geoRisk,
      agriculturalDetails,
      municipalDetails,
      zoningClassification,
      lotDetails: {
        tctNo: data.lotDetails?.tctNo || data.tctNo || "",
        taxDecNo: data.lotDetails?.taxDecNo || data.taxDecNo || "",
        lotOwner: data.lotDetails?.lotOwner || "",
        isApplicantOwner: Boolean(data.lotDetails?.isApplicantOwner ?? data.isOwner),
        proposedBuildingType: data.lotDetails?.proposedBuildingType || data.buildingType || "Residential",
        lotAreaSqM: Number(data.lotDetails?.lotAreaSqM || data.lotAreaSqM) || 0,
        lotLocationDescription: data.lotDetails?.lotLocationDescription || data.locationDescription || data.applicant?.address || "",
        zoningClassification,
        lat,
        lon,
      },
      property: {
        tctNo: data.lotDetails?.tctNo || data.tctNo || "",
        taxDecNo: data.lotDetails?.taxDecNo || data.taxDecNo || "",
        isRegisteredOwner: Boolean(data.lotDetails?.isApplicantOwner ?? data.isOwner),
        proposedBuildingType: data.lotDetails?.proposedBuildingType || data.buildingType || "Residential",
        lotAreaSqM: Number(data.lotDetails?.lotAreaSqM || data.lotAreaSqM) || 0,
        locationDescription: data.lotDetails?.lotLocationDescription || data.locationDescription || data.applicant?.address || "",
      },
    uploads: {
      tctTaxDec: Array.isArray(data.uploads?.tctTaxDec) ? data.uploads.tctTaxDec : [],
      taxDeclaration: Array.isArray(data.uploads?.taxDeclaration) ? data.uploads.taxDeclaration : [],
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
    remarks: [
      {
        id: `rem-init-${Date.now()}`,
        fromOffice: "System Notice",
        author: "MPDC Automated Intake",
        message: "Application submitted online. Initial document integrity check verified.",
        createdAt: now,
        requiresAction: false,
      },
    ],
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
            { name: "Municipal Planning & Development Coordinator", role: "MPDC (Final Approval & Signing)" },
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
    termsAccepted: data.termsAccepted !== undefined ? Boolean(data.termsAccepted) : true,
    termsAcceptedAt: data.termsAcceptedAt || now,
    termsVersion: data.termsVersion || "2026.1",
    clientIp: data.clientIp || data.termsConsentDetails?.ipAddress || "",
    termsConsentDetails: {
      agreedToTerms: data.termsConsentDetails?.agreedToTerms !== false,
      agreedToPrivacyAct: data.termsConsentDetails?.agreedToPrivacyAct !== false,
      agreedToClup: data.termsConsentDetails?.agreedToClup !== false,
      agreedToCookies: data.termsConsentDetails?.agreedToCookies !== false,
      acceptedAt: data.termsAcceptedAt || data.termsConsentDetails?.acceptedAt || now,
      termsVersion: data.termsVersion || data.termsConsentDetails?.termsVersion || "2026.1",
      ipAddress: data.clientIp || data.termsConsentDetails?.ipAddress || "",
    },
    createdAt: now,
    updatedAt: now,
  };

  // Compute SHA-256 tamper-proof data integrity hash
  newApp.dataHash = computeApplicationHash(newApp);

  applications.unshift(newApp);
  saveApplications(applications);

  // Also dual-write consent tracking with resolved public IP
  if (newApp.termsAccepted !== false) {
    recordTermsConsent({
      ipAddress: newApp.clientIp || newApp.termsConsentDetails?.ipAddress || "",
      userAgent: data.userAgent || "",
      termsVersion: newApp.termsVersion || "2026.1",
      agreedTerms: true,
      agreedPrivacy: true,
      agreedCookies: true,
      consentSource: "citizen_application_submission",
      applicantName: newApp.applicant?.fullName || "",
    }).catch(() => {});
  }

  // Sync to PostgreSQL normalized schema (3NF)
  if (isDbConnected()) {
    const hashedName = hashField(newApp.applicant?.fullName || "");
    const hashedPhone = hashField(newApp.applicant?.contactPhone || "");
    const hashedEmail = hashField(newApp.applicant?.contactEmail || "");
    const hashedAddress = hashField(newApp.applicant?.address || "");
    const applicantId = `app-user-${newApp.id}`;

    // 1. Insert/Update applicant profile
    query(
      `INSERT INTO applicants (id, full_name, contact_phone, contact_email, address, barangay, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         contact_phone = EXCLUDED.contact_phone,
         contact_email = EXCLUDED.contact_email,
         address = EXCLUDED.address,
         barangay = EXCLUDED.barangay,
         updated_at = NOW()`,
      [
        applicantId,
        hashedName || "Applicant",
        hashedPhone || "",
        hashedEmail || "",
        hashedAddress || "",
        newApp.applicant?.barangay || "Poblacion",
        newApp.createdAt || new Date().toISOString(),
        newApp.updatedAt || new Date().toISOString(),
      ]
    ).catch((err) => console.warn("[PostgreSQL] Insert applicant failed:", err.message));

    // 2. Insert/Update core citizen permit application
    query(
      `INSERT INTO citizen_applications (
        id, tracking_number, applicant_id, service_type, category,
        status, project_title, estimated_cost, uploads, step_progress,
        responsible_officers, sla_days, sla_minutes, fee, notes,
        data_hash, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (tracking_number) DO UPDATE SET
        applicant_id = EXCLUDED.applicant_id,
        service_type = EXCLUDED.service_type,
        category = EXCLUDED.category,
        status = EXCLUDED.status,
        project_title = EXCLUDED.project_title,
        estimated_cost = EXCLUDED.estimated_cost,
        uploads = EXCLUDED.uploads,
        step_progress = EXCLUDED.step_progress,
        responsible_officers = EXCLUDED.responsible_officers,
        sla_days = EXCLUDED.sla_days,
        sla_minutes = EXCLUDED.sla_minutes,
        fee = EXCLUDED.fee,
        notes = EXCLUDED.notes,
        data_hash = EXCLUDED.data_hash,
        updated_at = NOW()`,
      [
        newApp.id,
        newApp.trackingNumber,
        applicantId,
        newApp.serviceType,
        category,
        newApp.status,
        projectTitle,
        estimatedCost,
        JSON.stringify(newApp.uploads || {}),
        JSON.stringify(newApp.stepProgress || {}),
        JSON.stringify(newApp.responsibleOfficers || []),
        newApp.slaDays || 1,
        newApp.slaMinutes || 12,
        newApp.fee || "None (Free)",
        newApp.notes || "",
        newApp.dataHash,
        newApp.createdAt,
        newApp.updatedAt,
      ]
    ).catch((err) => console.warn("[PostgreSQL] Insert application failed:", err.message));

    // 3. Insert/Update location and zoning details
    query(
      `INSERT INTO application_locations (
        id, application_id, latitude, longitude, barangay,
        lot_area_sqm, lot_location_description, zoning_classification,
        tct_no, tax_dec_no, lot_owner, is_applicant_owner,
        geo_risk, lot_details, agricultural_details, municipal_details
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (application_id) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        barangay = EXCLUDED.barangay,
        zoning_classification = EXCLUDED.zoning_classification,
        geo_risk = EXCLUDED.geo_risk,
        lot_details = EXCLUDED.lot_details,
        agricultural_details = EXCLUDED.agricultural_details,
        municipal_details = EXCLUDED.municipal_details`,
      [
        `loc-${newApp.id}`,
        newApp.id,
        lat,
        lon,
        newApp.applicant?.barangay || "Poblacion",
        Number(newApp.lotDetails?.lotAreaSqM || 0),
        newApp.lotDetails?.lotLocationDescription || "",
        zoningClassification,
        newApp.lotDetails?.tctNo || "",
        newApp.lotDetails?.taxDecNo || "",
        newApp.lotDetails?.lotOwner || "",
        Boolean(newApp.lotDetails?.isApplicantOwner),
        JSON.stringify(geoRisk || {}),
        JSON.stringify(newApp.lotDetails || {}),
        JSON.stringify(agriculturalDetails || {}),
        JSON.stringify(municipalDetails || {}),
      ]
    ).catch((err) => console.warn("[PostgreSQL] Insert application location failed:", err.message));

    // 4. Insert/Update treasury payment record
    query(
      `INSERT INTO application_payments (
        id, application_id, payment_status, order_of_payment_no,
        amount_due, or_number, amount_paid, payment_date, cashier
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (application_id) DO UPDATE SET
        payment_status = EXCLUDED.payment_status,
        amount_due = EXCLUDED.amount_due,
        or_number = EXCLUDED.or_number,
        amount_paid = EXCLUDED.amount_paid,
        payment_date = EXCLUDED.payment_date`,
      [
        `pay-${newApp.id}`,
        newApp.id,
        newApp.payment?.status || "unpaid",
        newApp.payment?.orderOfPaymentNo || null,
        Number(newApp.payment?.feeAmount || 0),
        newApp.payment?.orNumber || null,
        Number(newApp.payment?.paidAmount || 0),
        newApp.payment?.paidAt || null,
        newApp.payment?.cashier || null,
      ]
    ).catch((err) => console.warn("[PostgreSQL] Insert application payment failed:", err.message));

    // 5. Insert/Update engineering review record
    query(
      `INSERT INTO engineering_reviews (
        id, application_id, engineer_approved, engineer_approved_at,
        engineer_approved_by, is_pinned, held_at, held_by, hold_reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (application_id) DO UPDATE SET
        engineer_approved = EXCLUDED.engineer_approved,
        engineer_approved_at = EXCLUDED.engineer_approved_at,
        engineer_approved_by = EXCLUDED.engineer_approved_by,
        is_pinned = EXCLUDED.is_pinned,
        held_at = EXCLUDED.held_at,
        held_by = EXCLUDED.held_by,
        hold_reason = EXCLUDED.hold_reason`,
      [
        `eng-${newApp.id}`,
        newApp.id,
        Boolean(newApp.engineerApproved),
        newApp.engineerApprovedAt || null,
        newApp.engineerApprovedBy || null,
        Boolean(newApp.isPinned),
        newApp.heldAt || null,
        newApp.heldBy || null,
        newApp.holdReason || null,
      ]
    ).catch((err) => console.warn("[PostgreSQL] Insert engineering review failed:", err.message));

    if (newApp.remarks && newApp.remarks.length > 0) {
      query(
        `INSERT INTO application_remarks (
          id, application_id, tracking_number, from_office, author, message, requires_action, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING`,
        [
          newApp.remarks[0].id,
          newApp.id,
          newApp.trackingNumber,
          newApp.remarks[0].fromOffice,
          newApp.remarks[0].author,
          newApp.remarks[0].message,
          newApp.remarks[0].requiresAction,
          newApp.remarks[0].createdAt,
        ]
      ).catch((err) => console.warn("[PostgreSQL] Insert initial remark failed:", err.message));
    }
  }

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

  // Sync stepProgress according to Citizen's Charter workflow stages
  // Sync stepProgress according to 5-Stage Citizen's Charter workflow
  const nextSt = (patch.status || current.status || "").toLowerCase();
  const currentProgress = { ...(current.stepProgress || {}) };

  if (nextSt === "for_assessment" || nextSt === "assessor_review" || nextSt === "pending_assessment") {
    updated.status = "for_assessment";
    updated.stepProgress = {
      ...currentProgress,
      currentStep: 2,
      totalSteps: 5,
      step1Completed: true,
      step1At: currentProgress.step1At || new Date().toISOString(),
      step1By: currentProgress.step1By || patch.author || "Edward B. Romulo, EnP. (MPDC Zoning Officer)",
      step2Completed: false,
    };
  } else if (nextSt === "ocular_inspection" || nextSt === "for_ocular_inspection" || nextSt === "inspection") {
    updated.stepProgress = {
      ...currentProgress,
      currentStep: 1,
      totalSteps: 5,
      step1Completed: false,
    };
  } else if (nextSt === "for_payment" || nextSt === "approved_for_payment") {
    updated.status = "for_payment";
    updated.stepProgress = {
      ...currentProgress,
      currentStep: 3,
      totalSteps: 5,
      step1Completed: true,
      step2Completed: true,
      step2At: currentProgress.step2At || new Date().toISOString(),
      step2By: patch.assessedBy || patch.author || currentProgress.step2By || "Municipal Assessor's Office (Fee Assessment)",
      step3Completed: false,
    };

    const opSuffix = (updated.trackingNumber || "").slice(-4) || String(Math.floor(1000 + Math.random() * 9000));
    const feeAmt = Number(
      patch.feeAmount ??
      patch.amount ??
      patch.payment?.feeAmount ??
      patch.payment?.amount ??
      updated.payment?.feeAmount ??
      updated.payment?.amount ??
      280
    );
    const breakdown = patch.breakdown || patch.payment?.breakdown || updated.payment?.breakdown || [
      { label: "Zoning Clearance Assessment Fee", amount: 250 },
      { label: "Legal & Filing Assessment Fee", amount: 30 },
    ];

    updated.payment = {
      ...(updated.payment || {}),
      status: "order_of_payment_issued",
      orderOfPaymentNo: patch.orderOfPaymentNo || updated.payment?.orderOfPaymentNo || `OP-2026-${opSuffix}`,
      feeAmount: feeAmt,
      amount: feeAmt,
      breakdown,
      assessedAt: new Date().toISOString(),
      assessedBy: patch.assessedBy || patch.author || "Municipal Assessor's Office",
      issuedAt: new Date().toISOString(),
      issuedBy: patch.assessedBy ? `Municipal Assessor's Office (${patch.assessedBy})` : "Municipal Assessor's Office",
      instruction: "Assessor Fee Computed. Ipakita ang pahinang ito sa Municipal Treasury Office upang magbayad ng kaukulang fee.",
      notes: patch.assessorNotes || patch.notes || updated.payment?.notes || "",
    };
  } else if (
    nextSt === "for_engineering_inspection" ||
    nextSt === "pending_engineering_inspection" ||
    nextSt === "technical_review_engineering"
  ) {
    updated.status = "for_engineering_inspection";
    updated.stepProgress = {
      ...currentProgress,
      currentStep: 4,
      totalSteps: 5,
      step1Completed: true,
      step2Completed: true,
      step3Completed: true,
      step3At: currentProgress.step3At || patch.payment_date || patch.paidAt || new Date().toISOString(),
      step3By: patch.user_id ? `Municipal Treasury (${patch.user_id})` : "Municipal Treasury (Payment Confirmed)",
      step4Completed: false,
    };
  } else if (
    nextSt === "approved" ||
    nextSt === "completed" ||
    nextSt === "approved_for_occupancy" ||
    nextSt === "occupancy_ready" ||
    (patch.progress != null && Number(patch.progress) >= 100)
  ) {
    updated.occupancyReady = true;
    const opSuffix = (updated.trackingNumber || "").slice(-4) || String(Math.floor(1000 + Math.random() * 9000));
    updated.occupancyPermitNo = updated.occupancyPermitNo || `OCC-2026-${opSuffix}`;
    updated.stepProgress = {
      ...currentProgress,
      currentStep: 5,
      totalSteps: 5,
      step1Completed: true,
      step2Completed: true,
      step3Completed: true,
      step4Completed: true,
      step4At: currentProgress.step4At || new Date().toISOString(),
      step4By: currentProgress.step4By || patch.engineerApprovedBy || "Municipal Engineer",
      step5Completed: true,
      step5At: new Date().toISOString(),
      step5By: "Municipal Building Official & Assessor's Office",
    };
  }

  // Handle Post-Occupancy Assessor Cycle (New Tax Declaration for Amilyar)
  if (patch.newTaxDecNo || patch.propertyIndexNo || patch.assessorPostTaxDec) {
    updated.assessorPostAssessment = {
      newTaxDecNo: patch.newTaxDecNo || updated.assessorPostAssessment?.newTaxDecNo || "",
      propertyIndexNo: patch.propertyIndexNo || updated.assessorPostAssessment?.propertyIndexNo || "",
      assessedValue: Number(patch.assessedValue ?? updated.assessorPostAssessment?.assessedValue ?? 0),
      marketValue: Number(patch.marketValue ?? updated.assessorPostAssessment?.marketValue ?? 0),
      assessedAt: new Date().toISOString(),
      assessedBy: patch.assessedBy || "Municipal Assessor's Office",
      notes: patch.postAssessmentNotes || patch.notes || "",
    };

    if (!Array.isArray(updated.remarks)) updated.remarks = [];
    updated.remarks.push({
      id: `rem-assessor-post-${Date.now()}`,
      fromOffice: "Assessor",
      author: patch.assessedBy || "Municipal Assessor's Office",
      message: `Nai-assess ang bagong tayong gusali para sa Amilyar. Bagong Tax Declaration No: ${patch.newTaxDecNo || "N/A"} (Property Index No: ${patch.propertyIndexNo || "N/A"}). Handa na para sa Real Property Tax sa susunod na taon.`,
      createdAt: new Date().toISOString(),
      requiresAction: false,
    });
  }

  // Handle Official Receipt Picture Review & Verification by Municipal Engineer
  if (patch.orVerified !== undefined) {
    const isVerified = Boolean(patch.orVerified);
    const verifier = patch.orVerifiedBy || "Municipal Engineer";
    const verAt = patch.orVerifiedAt || new Date().toISOString();
    
    updated.payment = {
      ...(updated.payment || {}),
      orVerified: isVerified,
      orVerifiedAt: verAt,
      orVerifiedBy: verifier,
      orVerificationNotes: patch.orVerificationNotes || "",
      orRejected: false,
    };
    updated.orVerified = isVerified;

    if (isVerified) {
      if (!Array.isArray(updated.remarks)) updated.remarks = [];
      const orNum = updated.payment?.orNumber || updated.payment?.or_number || updated.or_number || "O.R.";
      const alreadyVerified = updated.remarks.some((r) => r.actionType === "OR_PICTURE_VERIFIED");
      if (!alreadyVerified) {
        const verRemark = {
          id: `rem-or-ver-${Date.now()}`,
          fromOffice: "Engineering",
          author: verifier,
          message: `Nasuri at napatunayan ang litrato ng Official Receipt (${orNum}). Kumpirmado ang kabayaran mula sa Assessor / Treasury at handa na para sa Site Inspection at 3D Map Pinning.`,
          createdAt: verAt,
          actionType: "OR_PICTURE_VERIFIED",
          requiresAction: false,
        };
        updated.remarks.push(verRemark);

        if (isDbConnected()) {
          query(
            `INSERT INTO application_remarks (
              id, application_id, tracking_number, from_office, author, message, requires_action, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (id) DO NOTHING`,
            [
              verRemark.id,
              updated.id,
              updated.trackingNumber,
              verRemark.fromOffice,
              verRemark.author,
              verRemark.message,
              verRemark.requiresAction,
              verRemark.createdAt,
            ]
          ).catch((err) => console.warn("[PostgreSQL] Insert OR verified remark failed:", err.message));
        }
      }
    }
  }

  // Handle Official Receipt Picture Rejection (Requesting Citizen Re-upload)
  if (patch.orRejected) {
    const rejReason = patch.orRejectReason || "Hindi malinaw o hindi mabasa ang isinumiteng litrato ng Official Receipt.";
    const rejecter = patch.orRejectedBy || "Municipal Engineer";
    const rejAt = patch.orRejectedAt || new Date().toISOString();

    updated.status = "returned";
    updated.holdReason = rejReason;
    updated.payment = {
      ...(updated.payment || {}),
      orVerified: false,
      orRejected: true,
      orRejectReason: rejReason,
      orRejectedAt: rejAt,
      orRejectedBy: rejecter,
    };
    updated.orVerified = false;

    if (!Array.isArray(updated.remarks)) updated.remarks = [];
    const rejRemark = {
      id: `rem-or-rej-${Date.now()}`,
      fromOffice: "Engineering",
      author: rejecter,
      message: `Hindi naaprubahan ang litrato ng Official Receipt: ${rejReason}. Mangyaring mag-upload muli ng malinaw at lehitimong kopya upang makapagpatuloy sa site inspection.`,
      createdAt: rejAt,
      actionType: "OR_PICTURE_REJECTED",
      requiresAction: true,
    };
    updated.remarks.push(rejRemark);

    if (isDbConnected()) {
      query(
        `INSERT INTO application_remarks (
          id, application_id, tracking_number, from_office, author, message, requires_action, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING`,
        [
          rejRemark.id,
          updated.id,
          updated.trackingNumber,
          rejRemark.fromOffice,
          rejRemark.author,
          rejRemark.message,
          rejRemark.requiresAction,
          rejRemark.createdAt,
        ]
      ).catch((err) => console.warn("[PostgreSQL] Insert OR rejected remark failed:", err.message));
    }
  }

  // Handle Engineer Approval & Map Pinning
  if (patch.engineerApproved || nextSt === "approved_for_construction") {
    updated.engineerApproved = true;
    updated.isPinned = true;
    updated.engineerApprovedAt = patch.engineerApprovedAt || new Date().toISOString();
    updated.engineerApprovedBy = patch.engineerApprovedBy || "Building Official";
    if (!patch.status || patch.status === "for_engineering_inspection") {
      updated.status = "approved_for_construction";
    }
    updated.payment = {
      ...(updated.payment || {}),
      orVerified: true,
      orVerifiedAt: updated.engineerApprovedAt,
      orVerifiedBy: updated.engineerApprovedBy,
    };
    updated.orVerified = true;

    if (!Array.isArray(updated.remarks)) updated.remarks = [];
    const approvalNote = patch.notes && String(patch.notes).trim()
      ? String(patch.notes).trim()
      : "Inaprubahan ng Building Official (OBO) ang aplikasyon para sa konstruksyon. Opisyal nang nai-pin ang site sa 3D GIS Mapa.";
    
    const alreadyLoggedApproval = updated.remarks.some((r) => r.actionType === "ENGINEER_APPROVED_PINNED");
    if (!alreadyLoggedApproval) {
      updated.remarks.push({
        fromOffice: "OBO",
        author: updated.engineerApprovedBy,
        message: approvalNote,
        timestamp: new Date().toISOString(),
        actionType: "ENGINEER_APPROVED_PINNED",
      });
    }
  }

  // Handle Treasury Payment fields (or_number, amount_paid, payment_date, user_id)
  if (patch.or_number || patch.orNumber || patch.amount_paid || patch.payment) {
    const payObj = patch.payment || {};
    const orNum = patch.or_number || patch.orNumber || payObj.or_number || payObj.orNumber || "";
    const amt = patch.amount_paid ?? patch.amount ?? payObj.amount_paid ?? payObj.amount ?? payObj.feeAmount ?? 280;
    const payDate = patch.payment_date || patch.paidAt || payObj.payment_date || payObj.paidAt || new Date().toISOString();
    const uId = patch.user_id || payObj.user_id || payObj.cashier || "Treasury Teller";

    updated.or_number = orNum;
    updated.amount_paid = Number(amt);
    updated.payment_date = payDate;
    updated.user_id = uId;

    updated.payment = {
      ...(current.payment || {}),
      ...payObj,
      status: "paid",
      or_number: orNum,
      orNumber: orNum,
      amount_paid: Number(amt),
      amount: Number(amt),
      feeAmount: Number(amt),
      payment_date: payDate,
      paidAt: payDate,
      user_id: uId,
      cashier: uId,
      issuedBy: `Municipal Treasury Office (${uId})`,
    };

    // Automatically append official Treasury payment remark
    if (orNum) {
      if (!Array.isArray(updated.remarks)) updated.remarks = [];
      const isAlreadyLogged = updated.remarks.some((r) => r.message && r.message.includes(orNum));
      if (!isAlreadyLogged) {
        const treasuryRemark = {
          id: `rem-treasury-${Date.now()}`,
          fromOffice: "Treasury",
          author: `Municipal Treasury Office (${uId})`,
          message: `Opisyal na natanggap ang bayad (Official Receipt #${orNum}, Halaga: ₱${Number(amt).toFixed(2)}). Ang aplikasyon ay awtomatikong inendorso sa Municipal Engineering Office para sa "Before" Inspection.`,
          createdAt: new Date().toISOString(),
          requiresAction: false,
        };
        updated.remarks.push(treasuryRemark);

        if (isDbConnected()) {
          query(
            `INSERT INTO application_remarks (
              id, application_id, tracking_number, from_office, author, message, requires_action, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (id) DO NOTHING`,
            [
              treasuryRemark.id,
              updated.id,
              updated.trackingNumber,
              treasuryRemark.fromOffice,
              treasuryRemark.author,
              treasuryRemark.message,
              treasuryRemark.requiresAction,
              treasuryRemark.createdAt,
            ]
          ).catch((err) => console.warn("[PostgreSQL] Insert treasury remark failed:", err.message));
        }
      }
    }
  }

  // If reviewer notes were provided by staff, append as an official remark
  if (patch.notes && String(patch.notes).trim()) {
    if (!Array.isArray(updated.remarks)) updated.remarks = [];
    const noteText = String(patch.notes).trim();
    const isDup = updated.remarks.some((r) => r.message === noteText);
    if (!isDup) {
      const office = patch.fromOffice || (patch.status === "ocular_inspection" || patch.status === "engineering" || patch.status === "returned" ? "Engineering" : "MPDC");
      const defaultAuthor = office === "Engineering" ? "Municipal Engineer" : "Zoning Officer (MPDC)";
      const staffRemark = {
        id: `rem-${Date.now()}`,
        fromOffice: office,
        author: patch.author || patch.engineerApprovedBy || defaultAuthor,
        message: noteText,
        createdAt: new Date().toISOString(),
        requiresAction: patch.status === "returned" || Boolean(patch.requiresAction),
      };
      updated.remarks.push(staffRemark);

      if (isDbConnected()) {
        query(
          `INSERT INTO application_remarks (
            id, application_id, tracking_number, from_office, author, message, requires_action, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (id) DO NOTHING`,
          [
            staffRemark.id,
            updated.id,
            updated.trackingNumber,
            staffRemark.fromOffice,
            staffRemark.author,
            staffRemark.message,
            staffRemark.requiresAction,
            staffRemark.createdAt,
          ]
        ).catch((err) => console.warn("[PostgreSQL] Insert staff remark failed:", err.message));
      }
    }
  }

  applications[index] = updated;
  saveApplications(applications);

  if (isDbConnected()) {
    // 1. Update core application table
    query(
      `UPDATE citizen_applications SET
        status = $1,
        notes = $2,
        step_progress = $3,
        updated_at = NOW()
       WHERE id = $4 OR tracking_number = $4`,
      [
        updated.status,
        updated.notes,
        JSON.stringify(updated.stepProgress),
        id,
      ]
    ).catch((err) => console.warn("[PostgreSQL] Update application core failed:", err.message));

    // 2. Update location & GIS attributes
    query(
      `UPDATE application_locations SET
        latitude = COALESCE($2, latitude),
        longitude = COALESCE($3, longitude),
        geo_risk = COALESCE($4, geo_risk),
        lot_details = COALESCE($5, lot_details)
       WHERE application_id = (SELECT id FROM citizen_applications WHERE id = $1 OR tracking_number = $1 LIMIT 1)`,
      [
        id,
        updated.latitude ?? updated.coordinates?.lat ?? null,
        updated.longitude ?? updated.coordinates?.lon ?? null,
        updated.geoRisk ? JSON.stringify(updated.geoRisk) : null,
        updated.lotDetails ? JSON.stringify(updated.lotDetails) : null,
      ]
    ).catch((err) => console.warn("[PostgreSQL] Update application location failed:", err.message));

    // 3. Update engineering reviews
    query(
      `UPDATE engineering_reviews SET
        engineer_approved = $2,
        is_pinned = $3,
        engineer_approved_at = $4,
        engineer_approved_by = $5,
        held_at = $6,
        held_by = $7,
        hold_reason = $8,
        updated_at = NOW()
       WHERE application_id = (SELECT id FROM citizen_applications WHERE id = $1 OR tracking_number = $1 LIMIT 1)`,
      [
        id,
        Boolean(updated.engineerApproved),
        Boolean(updated.isPinned),
        updated.engineerApprovedAt || null,
        updated.engineerApprovedBy || null,
        updated.heldAt || null,
        updated.heldBy || null,
        updated.status === "returned" ? (updated.notes || null) : null,
      ]
    ).catch((err) => console.warn("[PostgreSQL] Update engineering review failed:", err.message));

    // 4. Update payments
    const payStatus = updated.payment?.status || (updated.or_number ? "paid" : null);
    const orNum = updated.or_number || updated.payment?.or_number || updated.payment?.orNumber || null;
    const amtPaid = updated.amount_paid != null ? Number(updated.amount_paid) : (updated.payment?.amount_paid != null ? Number(updated.payment.amount_paid) : null);
    const payDate = updated.payment_date || updated.payment?.paidAt || null;

    if (payStatus || orNum || amtPaid != null || payDate) {
      query(
        `UPDATE application_payments SET
          payment_status = COALESCE($2, payment_status),
          or_number = COALESCE($3, or_number),
          amount_paid = COALESCE($4, amount_paid),
          payment_date = COALESCE($5, payment_date),
          updated_at = NOW()
         WHERE application_id = (SELECT id FROM citizen_applications WHERE id = $1 OR tracking_number = $1 LIMIT 1)`,
        [
          id,
          payStatus,
          orNum,
          amtPaid,
          payDate,
        ]
      ).catch((err) => console.warn("[PostgreSQL] Update payment failed:", err.message));
    }
  }

  return updated;
}

export function addCitizenApplicationRemark(idOrTracking, remark) {
  const index = applications.findIndex(
    (a) => a.id === idOrTracking || a.trackingNumber?.toUpperCase() === String(idOrTracking).toUpperCase()
  );
  if (index === -1) return null;

  const app = applications[index];
  if (!Array.isArray(app.remarks)) {
    app.remarks = [];
  }

  const newRemark = {
    id: `rem-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    fromOffice: remark.fromOffice || "Applicant",
    author: remark.author || "Applicant",
    message: String(remark.message || "").trim(),
    createdAt: new Date().toISOString(),
    requiresAction: Boolean(remark.requiresAction),
    attachedFile: remark.attachedFile || null,
  };

  app.remarks.push(newRemark);
  app.updatedAt = new Date().toISOString();
  applications[index] = app;
  saveApplications(applications);

  if (isDbConnected()) {
    query(
      `INSERT INTO application_remarks (
        id, application_id, tracking_number, from_office, author, message, requires_action, attached_file, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
      [
        newRemark.id,
        app.id,
        app.trackingNumber,
        newRemark.fromOffice,
        newRemark.author,
        newRemark.message,
        newRemark.requiresAction,
        newRemark.attachedFile || null,
        newRemark.createdAt,
      ]
    ).catch((err) => console.warn("[PostgreSQL] Insert citizen remark failed:", err.message));
  }

  return newRemark;
}

export function submitOfficialReceipt(trackingNumber, receiptData) {
  const index = applications.findIndex(
    (a) => a.trackingNumber === trackingNumber || a.id === trackingNumber
  );
  if (index === -1) return null;
  const current = applications[index];

  const orNumber = String(receiptData.orNumber || "").trim() || (current.trackingNumber ? `OR-ASSESSOR-${current.trackingNumber.replace(/^LUIS-ZC-/, "")}` : `OR-${Date.now().toString().slice(-6)}`);
  const rawAmt = receiptData.paidAmount !== undefined && receiptData.paidAmount !== null && String(receiptData.paidAmount).trim() !== ""
    ? Number(receiptData.paidAmount)
    : null;
  const paidAmount = Number.isFinite(rawAmt) && rawAmt > 0 ? rawAmt : null;
  const paidAt = receiptData.paidAt || new Date().toISOString();

  const paymentObj = {
    ...(current.payment || {}),
    status: "paid",
    orNumber,
    paidAmount: paidAmount || undefined,
    paidAt,
    receiptUrl: receiptData.receiptUrl,
    receiptOriginalName: receiptData.receiptOriginalName || "Official_Receipt.jpg",
    receiptSize: receiptData.receiptSize,
    submittedAt: new Date().toISOString(),
    verifiedBy: "Applicant Upload (Assessor Receipt)",
  };

  const receiptFile = {
    url: receiptData.receiptUrl,
    originalName: receiptData.receiptOriginalName || `OR_${orNumber}.jpg`,
    size: receiptData.receiptSize || 0,
    orNumber,
    paidAmount,
    paidAt,
  };

  const updatedUploads = {
    ...(current.uploads || {}),
    officialReceipt: [receiptFile],
  };

  const receiptRemark = {
    id: `rem-receipt-${Date.now()}`,
    fromOffice: "Applicant",
    author: "Applicant (Proof of Payment)",
    message: `Opisyal na Resibo mula sa Assessor (${receiptFile.originalName}) ay matagumpay na naisumite. Naka-endorso na sa Municipal Engineering Office para sa Site Inspection.`,
    createdAt: new Date().toISOString(),
    requiresAction: false,
    attachedFile: receiptFile.originalName,
  };

  const updated = {
    ...current,
    status: "for_engineering_inspection",
    payment: paymentObj,
    uploads: updatedUploads,
    remarks: [...(current.remarks || []), receiptRemark],
    updatedAt: new Date().toISOString(),
    stepProgress: {
      ...(current.stepProgress || {}),
      currentStep: 3,
      totalSteps: 3,
      step1Completed: true,
      step2Completed: true,
      step2At: new Date().toISOString(),
      step2By: "Applicant (Official Receipt Uploaded)",
      step3Completed: false,
    },
  };
  applications[index] = updated;
  saveApplications(applications);

  if (isDbConnected()) {
    query(
      `UPDATE citizen_applications SET
        status = $1,
        uploads = $2,
        step_progress = $3,
        updated_at = NOW()
       WHERE id = $4 OR tracking_number = $4`,
      [
        updated.status,
        JSON.stringify(updated.uploads),
        JSON.stringify(updated.stepProgress),
        current.id,
      ]
    ).catch((err) => console.warn("[PostgreSQL] Update application for receipt failed:", err.message));

    query(
      `UPDATE application_payments SET
        payment_status = 'paid',
        or_number = $1,
        amount_paid = $2,
        payment_date = $3,
        updated_at = NOW()
       WHERE application_id = $4`,
      [orNumber, paidAmount, paidAt, current.id]
    ).catch((err) => console.warn("[PostgreSQL] Update payment for receipt failed:", err.message));

    query(
      `INSERT INTO application_remarks (
        id, application_id, tracking_number, from_office, author, message, requires_action, attached_file, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
      [
        receiptRemark.id,
        current.id,
        current.trackingNumber,
        receiptRemark.fromOffice,
        receiptRemark.author,
        receiptRemark.message,
        receiptRemark.requiresAction,
        receiptRemark.attachedFile,
        receiptRemark.createdAt,
      ]
    ).catch((err) => console.warn("[PostgreSQL] Insert receipt remark failed:", err.message));
  }

  return updated;
}

export function reuploadCitizenDocument(trackingNumber, { docKey, docTitle, file }) {
  const index = applications.findIndex(
    (a) => a.trackingNumber === trackingNumber || a.id === trackingNumber
  );
  if (index === -1) return null;
  const current = applications[index];

  const keyMap = {
    tct: "tctTaxDec",
    tax_dec: "taxDeclaration",
    rpt_receipt: "rptReceipt",
    brgy_clearance: "brgyClearance",
    plo_cert: "ploCert",
    photo_docs: "photoDocs",
  };
  const resolvedKey = keyMap[docKey] || docKey;

  const currentUploads = { ...(current.uploads || {}) };
  const currentRejectedDocs = { ...(current.rejectedDocs || {}) };

  currentUploads[resolvedKey] = [file];
  if (resolvedKey !== docKey) {
    currentUploads[docKey] = [file];
  }

  delete currentRejectedDocs[docKey];
  delete currentRejectedDocs[resolvedKey];

  const updated = {
    ...current,
    uploads: currentUploads,
    rejectedDocs: currentRejectedDocs,
    updatedAt: new Date().toISOString(),
  };

  const remainingRejections = Object.keys(currentRejectedDocs).length;
  if (remainingRejections === 0 && (updated.status === "flagged" || updated.status === "rejected" || updated.status === "returned")) {
    updated.status = "in_review";
  }

  if (!Array.isArray(updated.remarks)) {
    updated.remarks = [];
  }
  const confirmRemark = {
    id: `rem-reup-${Date.now()}`,
    fromOffice: "Applicant",
    author: current.applicant?.fullName || "Aplikante",
    message: `Muling nag-upload ang aplikante ng bagong kopya para sa "${docTitle || resolvedKey}": "${file.originalName || file.filename}". Handa na ito para sa muling pagsusuri ng MPDC.`,
    createdAt: new Date().toISOString(),
    requiresAction: false,
    attachedFile: file.originalName || file.filename,
  };
  updated.remarks.push(confirmRemark);

  applications[index] = updated;
  saveApplications(applications);

  if (isDbConnected()) {
    query(
      `UPDATE citizen_applications SET
        uploads = $1, status = $2, updated_at = NOW()
       WHERE id = $3 OR tracking_number = $3`,
      [JSON.stringify(updated.uploads), updated.status, current.id]
    ).catch((err) => console.warn("[PostgreSQL] Update application uploads failed:", err.message));

    query(
      `INSERT INTO application_remarks (
        id, application_id, tracking_number, from_office, author, message, requires_action, attached_file, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
      [
        confirmRemark.id,
        current.id,
        current.trackingNumber,
        confirmRemark.fromOffice,
        confirmRemark.author,
        confirmRemark.message,
        confirmRemark.requiresAction,
        confirmRemark.attachedFile,
        confirmRemark.createdAt,
      ]
    ).catch((err) => console.warn("[PostgreSQL] Insert reupload remark failed:", err.message));
  }

  return updated;
}

export function updateSiteInspection(idOrTracking, { stage, progress, photoUrl, remarks, inspector }) {
  applications = loadApplications();
  const norm = String(idOrTracking || "").trim().toUpperCase();
  const index = applications.findIndex(
    (a) => a.id === idOrTracking || a.trackingNumber?.toUpperCase() === norm
  );
  if (index === -1) return null;

  const app = applications[index];
  const now = new Date().toISOString();
  const numericProgress = Number(progress) != null && !isNaN(Number(progress))
    ? Number(progress)
    : (stage === "after" || stage === "after_construction")
    ? 100
    : (stage === "during" || stage === "during_construction")
    ? 50
    : 0;

  const stageLabel =
    (stage === "after" || stage === "after_construction" || numericProgress >= 100)
      ? "After Construction (100% - Occupancy Ready)"
      : (stage === "during" || stage === "during_construction" || numericProgress >= 50)
      ? "During Construction (50% - Structure In-Progress)"
      : "Before Construction (0% - Vacant Lot Pre-Excavation)";

  const inspectionRecord = {
    id: `insp-${Date.now()}`,
    stage: stage || (numericProgress >= 100 ? "after" : numericProgress >= 50 ? "during" : "before"),
    stageLabel,
    progress: numericProgress,
    photoUrl: photoUrl || app.latestInspection?.photoUrl || "",
    timestamp: now,
    inspectedAt: now,
    remarks: remarks || "",
    inspector: inspector || "Municipal Engineering Office",
  };

  if (!Array.isArray(app.inspectionPhotos)) {
    app.inspectionPhotos = [];
  }
  if (inspectionRecord.photoUrl) {
    app.inspectionPhotos.unshift(inspectionRecord);
    // Asynchronously insert row into PostgreSQL site_inspection_photos table
    insertSiteInspectionPhoto({
      id: inspectionRecord.id || `insp-${app.id}-${Date.now()}`,
      applicationId: app.id,
      trackingNumber: app.trackingNumber,
      photoUrl: inspectionRecord.photoUrl,
      photoType: "street_panorama",
      stage: inspectionRecord.stage,
      progress: numericProgress,
      remarks: remarks || "",
      inspector: inspector || "Municipal Engineer",
      createdAt: now,
    }).catch((err) => console.warn("[PostgreSQL] Failed to insert inspection photo:", err.message));
  }

  app.latestInspection = inspectionRecord;
  app.inspectionStage = inspectionRecord.stage;
  app.progress = numericProgress;
  app.updatedAt = now;

  // Add official remark in application history
  if (!Array.isArray(app.remarks)) app.remarks = [];
  app.remarks.unshift({
    id: `rem-insp-${Date.now()}`,
    fromOffice: "Engineering",
    author: inspector || "Municipal Engineer",
    message: `[Site Inspection - ${stageLabel}] ${remarks || "Naisagawa ang aktuwal na inspeksyon sa site."}`,
    createdAt: now,
    requiresAction: false,
    photoUrl: inspectionRecord.photoUrl || undefined,
  });

  if (numericProgress >= 100) {
    app.status = "approved";
    app.occupancyReady = true;
    const opSuffix = (app.trackingNumber || "").slice(-4) || String(Math.floor(1000 + Math.random() * 9000));
    app.occupancyPermitNo = app.occupancyPermitNo || `OCC-2026-${opSuffix}`;
    if (!app.stepProgress) app.stepProgress = {};
    app.stepProgress.currentStep = 3;
    app.stepProgress.totalSteps = 3;
    app.stepProgress.step1Completed = true;
    app.stepProgress.step2Completed = true;
    app.stepProgress.step3Completed = true;
    app.stepProgress.step3At = now;
    app.stepProgress.step3By = inspector || "Municipal Engineer";
  } else if (app.status === "for_engineering_inspection" || app.status === "paid") {
    app.status = "in_review";
  }

  applications[index] = app;
  saveApplications(applications);

  return app;
}


export function addApplicationSidePhoto(idOrTracking, { photoUrl, stage, caption, inspector }) {
  const applications = loadApplications();
  const index = applications.findIndex(
    (a) => a.id === idOrTracking || a.trackingNumber === idOrTracking
  );
  if (index === -1) return null;

  const app = applications[index];
  if (!Array.isArray(app.sidePhotos)) {
    app.sidePhotos = [];
  }

  const newSidePhoto = {
    id: `side-${Date.now()}`,
    url: photoUrl,
    stage: stage || (app.progress >= 100 ? "after" : app.progress >= 50 ? "during" : "before"),
    caption: caption || "Side Inspection Photo",
    uploadedAt: new Date().toISOString(),
    inspector: inspector || "Municipal Engineer",
  };

  app.sidePhotos.unshift(newSidePhoto);
  app.updatedAt = new Date().toISOString();

  // Asynchronously insert row into PostgreSQL site_inspection_photos table
  insertSiteInspectionPhoto({
    id: newSidePhoto.id,
    applicationId: app.id,
    trackingNumber: app.trackingNumber,
    photoUrl: newSidePhoto.url,
    photoType: "side_photo",
    stage: newSidePhoto.stage,
    progress: app.progress || 0,
    remarks: caption || "",
    inspector: inspector || "Municipal Engineer",
    createdAt: newSidePhoto.uploadedAt,
  }).catch((err) => console.warn("[PostgreSQL] Failed to insert side photo:", err.message));

  applications[index] = app;
  saveApplications(applications);
  return { app, sidePhoto: newSidePhoto };
}


export async function getApplicationPhotos(idOrTracking, photoType = null, stage = null) {
  const photosFromDb = await getSiteInspectionPhotosFromDb(idOrTracking, photoType, stage);
  if (photosFromDb && photosFromDb.length > 0) {
    return photosFromDb;
  }
  const app = getApplicationByIdOrTracking(idOrTracking);
  if (!app) return [];
  const list = [];
  if ((!photoType || photoType === "street_panorama") && Array.isArray(app.inspectionPhotos)) {
    app.inspectionPhotos.forEach(p => list.push({ ...p, photo_type: "street_panorama", photo_url: p.photoUrl || p.url }));
  }
  if ((!photoType || photoType === "side_photo") && Array.isArray(app.sidePhotos)) {
    app.sidePhotos.forEach(p => list.push({ ...p, photo_type: "side_photo", photo_url: p.url || p.photoUrl }));
  }
  return list;
}
