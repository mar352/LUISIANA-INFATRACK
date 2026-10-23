import fs from "fs";
import path from "path";

/**
 * File Security Service for LUISIANA INFA-TRACK
 * 
 * Performs multi-layer security enforcement:
 * 1. Filename sanitization & double-extension defense.
 * 2. Magic byte (binary file signature) verification.
 * 3. Deep PDF script, action dictionary, and hook scanning.
 * 4. Image polyglot / HTML embedded script scanning.
 * 5. Automatic disk quarantine and audit alerting.
 */

// Known magic byte signatures for allowed file formats
const MAGIC_SIGNATURES = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // \x89PNG\r\n\x1a\n
  jpg: [0xff, 0xd8, 0xff], // JPEG SOI marker
  webp_riff: [0x52, 0x49, 0x46, 0x46], // RIFF
  webp_type: [0x57, 0x45, 0x42, 0x50], // WEBP at offset 8
};

// Blacklisted dangerous file extensions for double-extension evasion
const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bash", ".php", ".phtml", ".php3", ".php4", ".php5",
  ".phps", ".phar", ".jsp", ".jspx", ".asp", ".aspx", ".cer", ".asa", ".asax",
  ".cgi", ".pl", ".py", ".rb", ".jar", ".vbs", ".js", ".mjs", ".ts", ".html",
  ".htm", ".xhtml", ".svg", ".dll", ".so", ".bin", ".scr", ".msi", ".com",
  ".wsf", ".vbe", ".jse", ".ps1", ".psm1", ".lnk", ".hta", ".inf"
]);

/**
 * Suspicious PDF dictionary keys, action hooks, and script indicators.
 * PDF specification (ISO 32000-1) allows actions, but official government forms
 * and uploaded civilian attachments must be inert static documents.
 */
const DANGEROUS_PDF_PATTERNS = [
  {
    regex: /\/JavaScript\b/i,
    label: "Embedded Acrobat JavaScript (/JavaScript)",
  },
  {
    regex: /\/JS\b/i,
    label: "Embedded JavaScript Stream (/JS)",
  },
  {
    regex: /\/Launch\b/i,
    label: "External Application / Command Execution (/Launch)",
  },
  {
    regex: /\/EmbeddedFiles\b/i,
    label: "Hidden Embedded Payloads / Files (/EmbeddedFiles)",
  },
  {
    regex: /\/SubmitForm\b/i,
    label: "Automatic Form / Credential Submission (/SubmitForm)",
  },
  {
    regex: /\/ImportData\b/i,
    label: "Dynamic Remote Data Inclusion (/ImportData)",
  },
  {
    regex: /\/RichMedia\b/i,
    label: "Embedded Executable Rich Media Object (/RichMedia)",
  },
  {
    regex: /\/XFA\b/i,
    label: "XML Forms Architecture Dynamic Scripting (/XFA)",
  },
  {
    regex: /\/URI\s*\([^\)]*javascript:/i,
    label: "JavaScript URI Action (/URI javascript:)",
  },
  {
    regex: /\/OpenAction\s*<<[^\>]*\/(?:JavaScript|JS|Launch|RichMedia|SubmitForm)/i,
    label: "Automatic Action Execution on Document Open (/OpenAction with Script)",
  },
  {
    regex: /\/AA\s*<<[^\>]*\/(?:JavaScript|JS|Launch|RichMedia|SubmitForm)/i,
    label: "Additional Action Trigger on View/Hover (/AA with Script)",
  },
  {
    regex: /<script\b[^>]*>([\s\S]*?)<\/script>/i,
    label: "HTML <script> Tag Disguised Inside Document",
  },
  {
    regex: /\b(onload|onerror|onclick)\s*=/i,
    label: "HTML DOM Event Handler Attribute",
  },
];

/**
 * Checks for HTML / script polyglot payloads inside image buffers.
 */
const DANGEROUS_IMAGE_PATTERNS = [
  { regex: /<script\b/i, label: "HTML <script> tag inside image" },
  { regex: /<svg\b/i, label: "Embedded SVG payload inside image" },
  { regex: /javascript:/i, label: "javascript: pseudo-protocol inside image" },
  { regex: /<html\b/i, label: "HTML document wrapper inside image" },
  { regex: /\b(onload|onerror)\s*=/i, label: "HTML event handler inside image" },
];

/**
 * Validates the filename to protect against path traversal, control characters,
 * and dangerous double extensions (e.g., `document.php.pdf`, `report.exe.jpg`).
 *
 * @param {string} originalName - Filename provided by user/client
 * @param {string[]} [allowedExtensions] - Optional list of permitted extensions (e.g. ['.pdf', '.jpg'])
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFileName(originalName, allowedExtensions = null) {
  if (!originalName || typeof originalName !== "string") {
    return { valid: false, error: "Walang wastong pangalan ang file." };
  }

  const trimmed = originalName.trim();
  if (!trimmed) {
    return { valid: false, error: "Walang laman ang pangalan ng file." };
  }

  // 1. Path traversal and null byte checks
  if (trimmed.includes("\0") || trimmed.includes("%00")) {
    return { valid: false, error: "Di-pinahihintulutan: May nakitang null byte sa pangalan ng file." };
  }
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    return { valid: false, error: "Di-pinahihintulutan: May nakitang path traversal character sa filename." };
  }
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return { valid: false, error: "Di-pinahihintulutan: May mga non-printable control character ang filename." };
  }

  // 2. Extension check
  const ext = path.extname(trimmed).toLowerCase();
  if (!ext) {
    return { valid: false, error: "Di-wastong format: Walang file extension ang dokumento." };
  }

  if (allowedExtensions && Array.isArray(allowedExtensions)) {
    const normalizedAllowed = allowedExtensions.map((e) => e.toLowerCase());
    if (!normalizedAllowed.includes(ext)) {
      return {
        valid: false,
        error: `Di-pinahihintulutang file type (${ext}). Ang mga pinapayagan lamang: ${normalizedAllowed.join(", ")}`,
      };
    }
  }

  // 3. Double extension check
  const parts = trimmed.split(".");
  if (parts.length > 2) {
    // Check intermediate extensions before final extension
    for (let i = 1; i < parts.length - 1; i++) {
      const intermediateExt = `.${parts[i].toLowerCase()}`;
      if (DANGEROUS_EXTENSIONS.has(intermediateExt)) {
        return {
          valid: false,
          error: `Di-pinahihintulutan: May nakitang mapanganib na double extension (${intermediateExt}) sa filename.`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validates the binary header (magic bytes) to ensure the file contents
 * actually match its purported extension (preventing renamed HTML/SVG/executables).
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} ext - Normalized file extension (e.g. '.pdf', '.png')
 * @returns {{ valid: boolean, detectedType?: string, error?: string }}
 */
export function verifyMagicBytes(buffer, ext) {
  if (!buffer || buffer.length < 8) {
    return { valid: false, error: "File buffer is too small or empty." };
  }

  const normalizedExt = ext.toLowerCase();

  if (normalizedExt === ".pdf") {
    // Check first 1024 bytes for %PDF- (spec allows header within first 1024 bytes)
    const headerSlice = buffer.subarray(0, Math.min(1024, buffer.length)).toString("latin1");
    if (!headerSlice.includes("%PDF-")) {
      return {
        valid: false,
        error: "Di-wastong format: Ang file ay walang opisyal na PDF header (%PDF-).",
      };
    }
    return { valid: true, detectedType: "pdf" };
  }

  if (normalizedExt === ".png") {
    const isPng = MAGIC_SIGNATURES.png.every((b, i) => buffer[i] === b);
    if (!isPng) {
      return {
        valid: false,
        error: "Di-wastong format: Hindi tunay na PNG image ang na-upload na file.",
      };
    }
    return { valid: true, detectedType: "png" };
  }

  if (normalizedExt === ".jpg" || normalizedExt === ".jpeg") {
    const isJpg = MAGIC_SIGNATURES.jpg.every((b, i) => buffer[i] === b);
    if (!isJpg) {
      return {
        valid: false,
        error: "Di-wastong format: Hindi tunay na JPEG image ang na-upload na file.",
      };
    }
    return { valid: true, detectedType: "jpeg" };
  }

  if (normalizedExt === ".webp") {
    const isRiff = MAGIC_SIGNATURES.webp_riff.every((b, i) => buffer[i] === b);
    const isWebp =
      buffer.length >= 12 &&
      MAGIC_SIGNATURES.webp_type.every((b, i) => buffer[8 + i] === b);
    if (!isRiff || !isWebp) {
      return {
        valid: false,
        error: "Di-wastong format: Hindi tunay na WEBP image ang na-upload na file.",
      };
    }
    return { valid: true, detectedType: "webp" };
  }

  if (normalizedExt === ".docx" || normalizedExt === ".doc") {
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
    if (!isZip && !isOle) {
      return { valid: false, error: "Di-wastong Word document format." };
    }
    return { valid: true, detectedType: "doc" };
  }

  return { valid: true, detectedType: "unknown" };
}

/**
 * Scans a PDF buffer for dangerous script hooks, command triggers, or disguised active content.
 *
 * @param {Buffer} buffer - Raw file buffer
 * @returns {{ safe: boolean, flaggedPatterns?: string[], reason?: string }}
 */
export function scanPdfForScripts(buffer) {
  const content = buffer.toString("latin1");
  const flagged = [];

  for (const pattern of DANGEROUS_PDF_PATTERNS) {
    if (pattern.regex.test(content)) {
      flagged.push(pattern.label);
    }
  }

  // Also check for hex-encoded suspicious PDF names (e.g. /#4a#61#76#61#53#63#72#69#70#74 for /JavaScript)
  const normalizedHex = content.replace(/#([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  if (normalizedHex !== content) {
    for (const pattern of DANGEROUS_PDF_PATTERNS) {
      if (pattern.regex.test(normalizedHex) && !flagged.includes(pattern.label)) {
        flagged.push(`${pattern.label} (Hex-Obfuscated)`);
      }
    }
  }

  if (flagged.length > 0) {
    return {
      safe: false,
      flaggedPatterns: flagged,
      reason: `May nakitang aktibong script o di-pinahihintulutang aksyon sa dokumento: ${flagged.join(", ")}. Mangyaring mag-upload ng malinis o na-print na PDF (flat PDF).`,
    };
  }

  return { safe: true };
}

/**
 * Scans image files for polyglot embedded HTML or script attacks.
 *
 * @param {Buffer} buffer - Raw image buffer
 * @returns {{ safe: boolean, flaggedPatterns?: string[], reason?: string }}
 */
export function scanImageForActiveContent(buffer) {
  // Read first 8KB and last 8KB of image where injected script polyglots usually reside
  const sampleLength = Math.min(buffer.length, 8192);
  const headStr = buffer.subarray(0, sampleLength).toString("latin1");
  const tailStr = buffer.subarray(Math.max(0, buffer.length - sampleLength)).toString("latin1");
  const combined = headStr + "\n" + tailStr;

  const flagged = [];
  for (const p of DANGEROUS_IMAGE_PATTERNS) {
    if (p.regex.test(combined)) {
      flagged.push(p.label);
    }
  }

  if (flagged.length > 0) {
    return {
      safe: false,
      flaggedPatterns: flagged,
      reason: `May nakitang di-pinahihintulutang script o HTML code sa loob ng larawan: ${flagged.join(", ")}.`,
    };
  }

  return { safe: true };
}

/**
 * Full security verification for an uploaded file on disk.
 * If file violates security checks, it is immediately deleted from disk.
 *
 * @param {string} filePath - Absolute path to uploaded file on disk
 * @param {string} originalName - Original filename submitted by client
 * @param {string} [mimeType] - Mime type reported by client
 * @param {string[]} [allowedExtensions] - List of allowed extensions (e.g. ['.pdf', '.jpg', '.png'])
 * @returns {{ ok: boolean, error?: string, code?: string, flagged?: string[] }}
 */
export function securityCheckUploadedFile(filePath, originalName, mimeType = "", allowedExtensions = null) {
  try {
    // 1. Filename & Extension Policy Check
    const nameCheck = validateFileName(originalName || path.basename(filePath), allowedExtensions);
    if (!nameCheck.valid) {
      cleanupFile(filePath);
      return {
        ok: false,
        error: nameCheck.error,
        code: "INVALID_FILENAME",
      };
    }

    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "Hindi natagpuan ang file sa imbakan.", code: "FILE_NOT_FOUND" };
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      cleanupFile(filePath);
      return { ok: false, error: "Walang laman ang na-upload na file (0 bytes).", code: "EMPTY_FILE" };
    }

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(originalName || filePath).toLowerCase();

    // 2. Magic Bytes / Header Signature Check
    const magicResult = verifyMagicBytes(buffer, ext);
    if (!magicResult.valid) {
      cleanupFile(filePath);
      return {
        ok: false,
        error: magicResult.error || "Hindi tugma ang nilalaman ng file sa extension nito.",
        code: "INVALID_FILE_SIGNATURE",
      };
    }

    // 3. Deep PDF Active Script Scan
    if (ext === ".pdf") {
      const scanResult = scanPdfForScripts(buffer);
      if (!scanResult.safe) {
        cleanupFile(filePath);
        return {
          ok: false,
          error: scanResult.reason,
          code: "FILE_SECURITY_VIOLATION",
          flagged: scanResult.flaggedPatterns,
        };
      }
    }

    // 4. Image Polyglot / Script Scan
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      const imgScan = scanImageForActiveContent(buffer);
      if (!imgScan.safe) {
        cleanupFile(filePath);
        return {
          ok: false,
          error: imgScan.reason,
          code: "FILE_SECURITY_VIOLATION",
          flagged: imgScan.flaggedPatterns,
        };
      }
    }

    return { ok: true };
  } catch (err) {
    console.error("[FileSecurity] Error during security check:", err);
    cleanupFile(filePath);
    return {
      ok: false,
      error: "Nabigo ang security validation ng na-upload na file.",
      code: "SECURITY_CHECK_ERROR",
    };
  }
}

/**
 * Safely removes a file from disk and logs the quarantine action.
 */
function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(`[FileSecurity] Failed to unlink flagged file ${filePath}:`, err.message);
  }
}

/**
 * Logs a structured security event for administrative audit.
 */
export function logSecurityEvent({
  ip = "unknown",
  filename = "unknown",
  reason = "",
  code = "SECURITY_ALERT",
  userAgent = "",
  trackingNumber = "",
}) {
  const timestamp = new Date().toISOString();
  console.warn(`\n🚨 [SECURITY ALERT ${code}] ──────────────────────────────────`);
  console.warn(`  Timestamp:       ${timestamp}`);
  console.warn(`  Client IP:       ${ip}`);
  console.warn(`  Filename:        ${filename}`);
  if (trackingNumber) console.warn(`  Tracking No:     ${trackingNumber}`);
  console.warn(`  Reason:          ${reason}`);
  console.warn(`  User-Agent:      ${userAgent || "N/A"}`);
  console.warn(`  Action Taken:    File immediately quarantined & erased from server.`);
  console.warn(`─────────────────────────────────────────────────────────────\n`);
}
