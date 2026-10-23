import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  validateFileName,
  verifyMagicBytes,
  securityCheckUploadedFile,
} from "../services/fileSecurity.js";
import { createCitizenApplication } from "../services/citizenApplications.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, "../temp_test_new_app_upload");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log("=== NEW APPLICATION FIELD-SPECIFIC FILE UPLOAD VALIDATION TEST SUITE ===\n");

// ── Test 1: Field-Specific Allowed Formats ──────────────────────────────────
console.log("Suite 1: Field-Specific Extension Policy");

const docAllowed = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
const photoAllowed = [".jpg", ".jpeg", ".png", ".webp"]; // Strictly NO PDF for photoDocs

// Documents 1-5 (Land Title, Tax Dec, RPT Receipt, Brgy Clearance, PLO Cert)
assert(validateFileName("tct_title.pdf", docAllowed).valid === true, "Accepts PDF in Land Title field");
assert(validateFileName("tax_dec.jpg", docAllowed).valid === true, "Accepts JPG in Tax Declaration field");
assert(validateFileName("rpt_receipt.png", docAllowed).valid === true, "Accepts PNG in RPT Receipt field");
assert(validateFileName("clearance.webp", docAllowed).valid === true, "Accepts WEBP in Barangay Clearance field");
assert(validateFileName("malware.exe", docAllowed).valid === false, "Rejects .exe in document fields");
assert(validateFileName("archive.zip", docAllowed).valid === false, "Rejects .zip in document fields");
assert(validateFileName("contract.docx", docAllowed).valid === false, "Rejects .docx in document fields");
assert(validateFileName("payload.php.pdf", docAllowed).valid === false, "Rejects double-extension (.php.pdf) in document fields");

// Field 6: Photo Documentation (Must strictly disallow PDF and non-images)
assert(validateFileName("site_photo1.jpg", photoAllowed).valid === true, "Accepts JPG in Photo Documentation");
assert(validateFileName("site_photo2.png", photoAllowed).valid === true, "Accepts PNG in Photo Documentation");
assert(validateFileName("site_photo3.webp", photoAllowed).valid === true, "Accepts WEBP in Photo Documentation");
assert(validateFileName("document_not_photo.pdf", photoAllowed).valid === false, "Strictly REJECTS PDF in Photo Documentation");
assert(validateFileName("site_plan.pdf", photoAllowed).valid === false, "Rejects any PDF in Photo Documentation");
assert(validateFileName("video.mp4", photoAllowed).valid === false, "Rejects non-image formats in Photo Documentation");

// ── Test 2: Magic Byte Integrity for New Application Uploads ───────────────
console.log("\nSuite 2: Magic Byte Verification (Disguised / Renamed File Defense)");

const realPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
assert(verifyMagicBytes(realPdf, ".pdf").valid === true, "Authenticates genuine PDF signature (%PDF-)");

const fakePdf = Buffer.from("MZ\x90\x00\x03\x00\x00\x00Windows Executable in Disguise");
assert(verifyMagicBytes(fakePdf, ".pdf").valid === false, "Rejects executable renamed to .pdf");

const realJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
assert(verifyMagicBytes(realJpeg, ".jpg").valid === true, "Authenticates genuine JPEG header (FF D8 FF)");

const fakeJpeg = Buffer.from("%PDF-1.4 PDF disguised as jpg");
assert(verifyMagicBytes(fakeJpeg, ".jpg").valid === false, "Rejects PDF renamed to .jpg in photo field");

const realPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
assert(verifyMagicBytes(realPng, ".png").valid === true, "Authenticates genuine PNG header");

const fakePng = Buffer.from("<script>alert(1)</script>");
assert(verifyMagicBytes(fakePng, ".png").valid === false, "Rejects HTML/JS text file disguised as .png");

// ── Test 3: Backend Security Check with Field Restrictions ─────────────────
console.log("\nSuite 3: Backend Security Check with Field Restrictions");

// A genuine PDF uploaded to Photo Documentation (allowedExtensions = photoAllowed) must be rejected
const pdfForPhotoField = path.join(tempDir, "temp_doc.pdf");
fs.writeFileSync(pdfForPhotoField, realPdf);
const photoFieldCheck = securityCheckUploadedFile(pdfForPhotoField, "my_site.pdf", "application/pdf", photoAllowed);
assert(photoFieldCheck.ok === false, "Backend security check rejects PDF uploaded to Photo Documentation field");

// A genuine JPG uploaded to Photo Documentation must be accepted
const jpgForPhotoField = path.join(tempDir, "temp_photo.jpg");
fs.writeFileSync(jpgForPhotoField, realJpeg);
const validPhotoCheck = securityCheckUploadedFile(jpgForPhotoField, "my_site.jpg", "image/jpeg", photoAllowed);
assert(validPhotoCheck.ok === true, "Backend security check accepts genuine JPG for Photo Documentation");

// Clean up temp test files
try {
  if (fs.existsSync(pdfForPhotoField)) fs.unlinkSync(pdfForPhotoField);
  if (fs.existsSync(jpgForPhotoField)) fs.unlinkSync(jpgForPhotoField);
  fs.rmdirSync(tempDir);
} catch (_) {}

// ── Test 4: Application Submission Upload Validation & Duplicate Defense ───
console.log("\nSuite 4: Application Submission Upload Validation & Duplicate Defense");

// Test 4a: Submitting duplicate file across multiple fields must throw error
let duplicateBlocked = false;
try {
  createCitizenApplication({
    serviceType: "zoning_certificate",
    applicant: { fullName: "Juan Test", contactPhone: "09171234567", barangay: "Zone I" },
    uploads: {
      tctTaxDec: [{ url: "/uploads/same_document.pdf", originalName: "document.pdf", size: 10240 }],
      taxDeclaration: [{ url: "/uploads/same_document.pdf", originalName: "document.pdf", size: 10240 }],
      rptReceipt: [{ url: "/uploads/receipt.pdf", originalName: "receipt.pdf", size: 5000 }],
      brgyClearance: [{ url: "/uploads/brgy.pdf", originalName: "brgy.pdf", size: 6000 }],
      ploCert: [{ url: "/uploads/plo.pdf", originalName: "plo.pdf", size: 7000 }],
      photoDocs: [{ url: "/uploads/photo.jpg", originalName: "photo.jpg", size: 8000 }],
    },
  });
} catch (err) {
  if (err.message.includes("Nauulit na file") || err.message.includes("Nauulit na dokumento")) {
    duplicateBlocked = true;
  }
}
assert(duplicateBlocked, "Rejects submission when identical file is used across multiple requirement fields");

// Test 4b: Submitting PDF for Photo Documentation must throw error
let photoPdfBlocked = false;
try {
  createCitizenApplication({
    serviceType: "zoning_certificate",
    applicant: { fullName: "Maria Test", contactPhone: "09181234567", barangay: "Zone I" },
    uploads: {
      tctTaxDec: [{ url: "/uploads/tct.pdf", originalName: "tct.pdf", size: 10240 }],
      taxDeclaration: [{ url: "/uploads/tax.pdf", originalName: "tax.pdf", size: 11000 }],
      rptReceipt: [{ url: "/uploads/rpt.pdf", originalName: "rpt.pdf", size: 5000 }],
      brgyClearance: [{ url: "/uploads/brgy.pdf", originalName: "brgy.pdf", size: 6000 }],
      ploCert: [{ url: "/uploads/plo.pdf", originalName: "plo.pdf", size: 7000 }],
      photoDocs: [{ url: "/uploads/site_lot.pdf", originalName: "site_lot.pdf", size: 8000 }],
    },
  });
} catch (err) {
  if (err.message.includes("Photo Documentation ay para lamang sa mga litrato")) {
    photoPdfBlocked = true;
  }
}
assert(photoPdfBlocked, "Rejects application submission when PDF is submitted for Photo Documentation");

// Test 4c: Submitting valid, distinct files for all fields must succeed
let validSubmissionSuccess = false;
try {
  const app = createCitizenApplication({
    serviceType: "zoning_certificate",
    applicant: { fullName: "Pedro Test", contactPhone: "09191234567", barangay: "Zone I" },
    uploads: {
      tctTaxDec: [{ url: "/uploads/tct_distinct.pdf", originalName: "tct_distinct.pdf", size: 10240 }],
      taxDeclaration: [{ url: "/uploads/tax_distinct.pdf", originalName: "tax_distinct.pdf", size: 11000 }],
      rptReceipt: [{ url: "/uploads/rpt_distinct.pdf", originalName: "rpt_distinct.pdf", size: 5000 }],
      brgyClearance: [{ url: "/uploads/brgy_distinct.pdf", originalName: "brgy_distinct.pdf", size: 6000 }],
      ploCert: [{ url: "/uploads/plo_distinct.pdf", originalName: "plo_distinct.pdf", size: 7000 }],
      photoDocs: [{ url: "/uploads/site_distinct.jpg", originalName: "site_distinct.jpg", size: 8000 }],
    },
  });
  if (app && app.trackingNumber) {
    validSubmissionSuccess = true;
  }
} catch (err) {
  console.error("Valid submission error:", err.message);
}
assert(validSubmissionSuccess, "Accepts application submission when all 6 fields contain valid, distinct documents");

console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
process.exit(failed > 0 ? 1 : 0);
