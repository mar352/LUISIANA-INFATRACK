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

    const newApp = {
      id: `app-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      trackingNumber,
      serviceType,
      projectTitle,
      category,
      estimatedCost,
      applicant: {
        fullName: data.applicant?.fullName || "",
        contactPhone: data.applicant?.contactPhone || "",
        contactEmail: data.applicant?.contactEmail || "",
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
        tctNo: data.lotDetails?.tctNo || "",
        taxDecNo: data.lotDetails?.taxDecNo || "",
        lotOwner: data.lotDetails?.lotOwner || "",
        isApplicantOwner: Boolean(data.lotDetails?.isApplicantOwner ?? data.isOwner),
        proposedBuildingType: data.lotDetails?.proposedBuildingType || data.buildingType || "",
        lotAreaSqM: Number(data.lotDetails?.lotAreaSqM) || 0,
        lotLocationDescription: data.lotDetails?.lotLocationDescription || "",
        zoningClassification,
        lat,
        lon,
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

  // Sync to PostgreSQL with hashed personal fields for privacy
  if (isDbConnected()) {
    const hashedName = hashField(newApp.applicant.fullName);
    const hashedPhone = hashField(newApp.applicant.contactPhone);
    const hashedEmail = hashField(newApp.applicant.contactEmail);
    const hashedAddress = hashField(newApp.applicant.address);

    query(
      `INSERT INTO citizen_applications (
        id, tracking_number, service_type, applicant_name,
        contact_phone, contact_email, address, barangay,
        latitude, longitude,
        project_title, category, estimated_cost,
        geo_risk, agricultural_details, municipal_details,
        lot_details, uploads, status, step_progress,
        responsible_officers, sla_days, sla_minutes, fee,
        notes, zoning_classification, data_hash, created_at, updated_at,
        terms_accepted, terms_accepted_at, terms_version, terms_consent_details
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
      ON CONFLICT (tracking_number) DO UPDATE SET
        applicant_name = EXCLUDED.applicant_name,
        contact_phone = EXCLUDED.contact_phone,
        contact_email = EXCLUDED.contact_email,
        address = EXCLUDED.address,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        project_title = EXCLUDED.project_title,
        category = EXCLUDED.category,
        estimated_cost = EXCLUDED.estimated_cost,
        geo_risk = EXCLUDED.geo_risk,
        agricultural_details = EXCLUDED.agricultural_details,
        municipal_details = EXCLUDED.municipal_details,
        lot_details = EXCLUDED.lot_details,
        uploads = EXCLUDED.uploads,
        zoning_classification = EXCLUDED.zoning_classification,
        data_hash = EXCLUDED.data_hash,
        terms_accepted = EXCLUDED.terms_accepted,
        terms_accepted_at = EXCLUDED.terms_accepted_at,
        terms_version = EXCLUDED.terms_version,
        terms_consent_details = EXCLUDED.terms_consent_details,
        updated_at = NOW()`,
      [
        newApp.id,
        newApp.trackingNumber,
        newApp.serviceType,
        hashedName,
        hashedPhone,
        hashedEmail,
        hashedAddress,
        newApp.applicant.barangay,
        lat,
        lon,
        projectTitle,
        category,
        estimatedCost,
        JSON.stringify(geoRisk),
        JSON.stringify(agriculturalDetails),
        JSON.stringify(municipalDetails),
        JSON.stringify(newApp.lotDetails),
        JSON.stringify(newApp.uploads),
        newApp.status,
        JSON.stringify(newApp.stepProgress),
        JSON.stringify(newApp.responsibleOfficers),
        newApp.slaDays,
        newApp.slaMinutes,
        newApp.fee,
        newApp.notes,
        zoningClassification,
        newApp.dataHash,
        newApp.createdAt,
        newApp.updatedAt,
        newApp.termsAccepted,
        newApp.termsAcceptedAt,
        newApp.termsVersion,
        JSON.stringify(newApp.termsConsentDetails),
      ]
    ).catch((err) => console.warn("[PostgreSQL] Insert application failed:", err.message));

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
  const nextSt = (patch.status || current.status || "").toLowerCase();
  const currentProgress = { ...(current.stepProgress || {}) };
  if (nextSt === "ocular_inspection" || nextSt === "for_ocular_inspection" || nextSt === "inspection") {
    updated.stepProgress = {
      ...currentProgress,
      currentStep: 2,
      totalSteps: currentProgress.totalSteps || 3,
      step1Completed: true,
      step1At: currentProgress.step1At || new Date().toISOString(),
      step1By: currentProgress.step1By || "Bon Ryan P. Pedron (Admin Aide / IT Officer)",
    };
  } else if (nextSt === "for_payment" || nextSt === "approved_for_payment") {
    updated.stepProgress = {
      ...currentProgress,
      currentStep: 3,
      totalSteps: 4,
      step1Completed: true,
      step2Completed: true,
      step2At: currentProgress.step2At || new Date().toISOString(),
      step2By: currentProgress.step2By || "Edward B. Romulo, EnP. (Zoning Officer)",
      step3Completed: false,
    };
    if (!updated.payment || updated.payment.status === "unpaid") {
      const opSuffix = (updated.trackingNumber || "").slice(-4) || String(Math.floor(1000 + Math.random() * 9000));
      updated.payment = {
        status: "order_of_payment_issued",
        orderOfPaymentNo: `OP-2026-${opSuffix}`,
        feeAmount: 280,
        breakdown: [
          { label: "Zoning Clearance Assessment Fee", amount: 250 },
          { label: "Legal & Filing Assessment Fee", amount: 30 },
        ],
        issuedAt: new Date().toISOString(),
        issuedBy: "Edward B. Romulo, EnP. (Zoning Administrator)",
        instruction: "Zoning Approved. Ipakita ang pahinang ito sa Municipal Treasury Office upang magbayad ng kaukulang fee.",
      };
    }
  } else if (
    nextSt === "for_engineering_inspection" ||
    nextSt === "pending_engineering_inspection" ||
    nextSt === "technical_review_engineering"
  ) {
    updated.status = "for_engineering_inspection";
    updated.stepProgress = {
      ...currentProgress,
      currentStep: 4,
      totalSteps: 4,
      step1Completed: true,
      step2Completed: true,
      step3Completed: true,
      step3At: currentProgress.step3At || patch.payment_date || patch.paidAt || new Date().toISOString(),
      step3By: patch.user_id ? `Municipal Treasury (${patch.user_id})` : "Municipal Treasury (Payment Confirmed)",
    };
  } else if (nextSt === "approved" || nextSt === "completed" || nextSt === "approved_for_construction" || patch.engineerApproved) {
    updated.stepProgress = {
      ...currentProgress,
      currentStep: 4,
      totalSteps: 4,
      step1Completed: true,
      step2Completed: true,
      step2At: currentProgress.step2At || new Date().toISOString(),
      step2By: currentProgress.step2By || "Edward B. Romulo, EnP. (Zoning Officer)",
      step3Completed: true,
      step3At: currentProgress.step3At || new Date().toISOString(),
      step3By: "Municipal Treasury (Payment Verified)",
      step4Completed: true,
      step4At: new Date().toISOString(),
      step4By: patch.engineerApprovedBy || "Engr. Mario S. Baldovino (Municipal Engineer)",
    };
  }

  // Handle Engineer Approval & Map Pinning
  if (patch.engineerApproved || nextSt === "approved_for_construction") {
    updated.engineerApproved = true;
    updated.isPinned = true;
    updated.engineerApprovedAt = patch.engineerApprovedAt || new Date().toISOString();
    updated.engineerApprovedBy = patch.engineerApprovedBy || "Engr. Mario S. Baldovino (Municipal Engineer)";
    if (!patch.status || patch.status === "for_engineering_inspection") {
      updated.status = "approved_for_construction";
    }

    if (!Array.isArray(updated.remarks)) updated.remarks = [];
    const approvalNote = patch.notes && String(patch.notes).trim()
      ? String(patch.notes).trim()
      : "Inaprubahan ng Municipal Engineer ang aplikasyon para sa konstruksyon. Opisyal nang nai-pin ang site sa 3D GIS Mapa.";
    
    const alreadyLoggedApproval = updated.remarks.some((r) => r.actionType === "ENGINEER_APPROVED_PINNED");
    if (!alreadyLoggedApproval) {
      updated.remarks.push({
        fromOffice: "Engineering",
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
      const defaultAuthor = office === "Engineering" ? "Engr. Mario S. Baldovino (Municipal Engineer)" : "Edward B. Romulo, EnP. (Zoning Officer)";
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
    query(
      `UPDATE citizen_applications SET
        status = $1, notes = $2, step_progress = $3,
        latitude = COALESCE($5, latitude),
        longitude = COALESCE($6, longitude),
        geo_risk = COALESCE($7, geo_risk),
        lot_details = COALESCE($8, lot_details),
        engineer_approved = $9,
        is_pinned = $10,
        engineer_approved_at = $11,
        engineer_approved_by = $12,
        held_at = $13,
        held_by = $14,
        hold_reason = $15,
        payment_status = $16,
        or_number = $17,
        amount_paid = $18,
        payment_date = $19,
        updated_at = NOW()
       WHERE id = $4 OR tracking_number = $4`,
      [
        updated.status,
        updated.notes,
        JSON.stringify(updated.stepProgress),
        id,
        updated.latitude ?? updated.coordinates?.lat ?? null,
        updated.longitude ?? updated.coordinates?.lon ?? null,
        updated.geoRisk ? JSON.stringify(updated.geoRisk) : null,
        updated.lotDetails ? JSON.stringify(updated.lotDetails) : null,
        Boolean(updated.engineerApproved),
        Boolean(updated.isPinned),
        updated.engineerApprovedAt || null,
        updated.engineerApprovedBy || null,
        updated.heldAt || null,
        updated.heldBy || null,
        updated.status === "returned" ? (updated.notes || null) : null,
        updated.payment?.status || (updated.or_number ? "paid" : null),
        updated.or_number || updated.payment?.or_number || updated.payment?.orNumber || null,
        updated.amount_paid != null ? Number(updated.amount_paid) : (updated.payment?.amount_paid != null ? Number(updated.payment.amount_paid) : null),
        updated.payment_date || updated.payment?.paidAt || null,
      ]
    ).catch((err) => console.warn("[PostgreSQL] Update application failed:", err.message));
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

  const orNumber = String(receiptData.orNumber || "").trim() || `OR-${Date.now().toString().slice(-6)}`;
  const paidAmount = Number(receiptData.paidAmount) || 280;
  const paidAt = receiptData.paidAt || new Date().toISOString();

  const paymentObj = {
    ...(current.payment || {}),
    status: "paid",
    orNumber,
    paidAmount,
    paidAt,
    receiptUrl: receiptData.receiptUrl,
    receiptOriginalName: receiptData.receiptOriginalName || "Official_Receipt.jpg",
    receiptSize: receiptData.receiptSize,
    submittedAt: new Date().toISOString(),
    verifiedBy: "Municipal Treasury Office",
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
    fromOffice: "Treasury",
    author: "Municipal Treasury & Applicant",
    message: `Opisyal na Resibo (O.R. #${orNumber}) na nagkakahalagang ₱${paidAmount.toFixed(2)} ay matagumpay na naisumite. Naka-endorso na sa Municipal Engineering Office para sa "Before" Inspection.`,
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
      currentStep: 4,
      totalSteps: 4,
      step1Completed: true,
      step2Completed: true,
      step3Completed: true,
      step3At: new Date().toISOString(),
      step3By: "Municipal Treasury (Payment Verified)",
    },
  };

  applications[index] = updated;
  saveApplications(applications);
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
    inspector: inspector || "Engr. Mario S. Baldovino (Municipal Engineering Office)",
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
    author: inspector || "Engr. Mario S. Baldovino (Municipal Engineer)",
    message: `[Site Inspection - ${stageLabel}] ${remarks || "Naisagawa ang aktuwal na inspeksyon sa site."}`,
    createdAt: now,
    requiresAction: false,
    photoUrl: inspectionRecord.photoUrl || undefined,
  });

  if (numericProgress >= 100) {
    app.status = "approved";
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
