/**
 * documentValidation.ts
 *
 * Strict, field-specific document validation for Citizen Online Applications
 * in the Office of the Municipal Planning and Development Coordinator (MPDC) - Luisiana.
 *
 * Validations:
 * 1. File existence & size constraints (Min 100 bytes, Max 15 MB).
 * 2. Whitelist file extensions & MIME types per individual field.
 * 3. Strict Photo Documentation rule: Only images (JPG, PNG, WEBP), strictly no PDFs.
 * 4. Double extension defense & blacklisted dangerous extensions.
 * 5. Magic Byte (binary file signature) verification to reject spoofed/renamed files.
 * 6. Cross-field duplicate document detection to prevent cheating mandatory charter requirements.
 */

export interface FieldDocSpec {
  key: string;
  label: string;
  shortLabel: string;
  category: "document" | "photo";
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  maxSizeMb: number;
}

export const APPLICATION_DOCUMENT_FIELDS: Record<string, FieldDocSpec> = {
  landTitle: {
    key: "landTitle",
    label: "Photocopy ng TCT (Land Title)",
    shortLabel: "Land Title (TCT/OCT)",
    category: "document",
    allowedExtensions: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maxSizeMb: 15,
  },
  taxDec: {
    key: "taxDec",
    label: "Tax Declaration",
    shortLabel: "Tax Declaration",
    category: "document",
    allowedExtensions: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maxSizeMb: 15,
  },
  rptReceipt: {
    key: "rptReceipt",
    label: "Current Real Property Tax Receipt (Amilyar)",
    shortLabel: "RPT Receipt (Amilyar)",
    category: "document",
    allowedExtensions: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maxSizeMb: 15,
  },
  brgyClearance: {
    key: "brgyClearance",
    label: "Barangay Clearance",
    shortLabel: "Barangay Clearance",
    category: "document",
    allowedExtensions: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maxSizeMb: 15,
  },
  ploCert: {
    key: "ploCert",
    label: "PLO Certification (MERALCO)",
    shortLabel: "PLO Certification",
    category: "document",
    allowedExtensions: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maxSizeMb: 15,
  },
  photoDocs: {
    key: "photoDocs",
    label: "Photo Documentation (Litrato ng Loob at Labas ng Site)",
    shortLabel: "Photo Documentation",
    category: "photo",
    allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSizeMb: 15,
  },
};

const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bash", ".php", ".phtml", ".phar",
  ".jsp", ".asp", ".aspx", ".cgi", ".pl", ".py", ".rb", ".jar",
  ".vbs", ".js", ".mjs", ".ts", ".html", ".htm", ".svg", ".dll",
  ".bin", ".scr", ".msi", ".ps1", ".lnk", ".zip", ".rar", ".7z",
  ".tar", ".gz", ".iso", ".apk"
]);

/**
 * Reads binary header (magic bytes) to verify genuine file type matching extension.
 */
export async function verifyFileMagicBytes(
  file: File,
  normalizedExt: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const slice = file.slice(0, Math.min(1024, file.size));
    const arrayBuffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.length < 4) {
      return { ok: false, error: "Masyadong maliit o walang laman ang file." };
    }

    if (normalizedExt === ".pdf") {
      // PDF specification allows header within first 1024 bytes
      const headerStr = new TextDecoder("latin1").decode(bytes);
      if (!headerStr.includes("%PDF-")) {
        return {
          ok: false,
          error: "Di-wastong format: Hindi tunay na PDF file. Walang natagpuang opisyal na PDF header (%PDF-).",
        };
      }
      return { ok: true };
    }

    if (normalizedExt === ".png") {
      const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      const isPng = bytes.length >= 8 && pngSig.every((val, idx) => bytes[idx] === val);
      if (!isPng) {
        return {
          ok: false,
          error: "Di-wastong format: Hindi tunay na PNG image ang napiling file.",
        };
      }
      return { ok: true };
    }

    if (normalizedExt === ".jpg" || normalizedExt === ".jpeg") {
      const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if (!isJpg) {
        return {
          ok: false,
          error: "Di-wastong format: Hindi tunay na JPEG image ang napiling file.",
        };
      }
      return { ok: true };
    }

    if (normalizedExt === ".webp") {
      const isRiff =
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
      const isWebp =
        bytes.length >= 12 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
      if (!isRiff || !isWebp) {
        return {
          ok: false,
          error: "Di-wastong format: Hindi tunay na WEBP image ang napiling file.",
        };
      }
      return { ok: true };
    }

    return { ok: false, error: `Hindi suportadong extension: ${normalizedExt}` };
  } catch (err: any) {
    return { ok: false, error: `Hindi ma-parse ang file: ${err?.message || "Error"}` };
  }
}

export interface AttachedDocRef {
  name: string;
  size: number;
  url?: string;
}

/**
 * Validates a file intended for a specific application requirement field.
 *
 * @param file - The file selected by the user
 * @param fieldKey - The key of the field ('landTitle', 'taxDec', 'rptReceipt', 'brgyClearance', 'ploCert', 'photoDocs')
 * @param existingDocs - Map of other currently attached documents in the form
 */
export async function validateApplicationFile(
  file: File,
  fieldKey: string,
  existingDocs?: Record<string, AttachedDocRef | null | undefined>
): Promise<{ valid: boolean; error?: string }> {
  if (!file) {
    return { valid: false, error: "Walang napiling file." };
  }

  const spec = APPLICATION_DOCUMENT_FIELDS[fieldKey];
  if (!spec) {
    return { valid: false, error: `Hindi kilalang field identifier: ${fieldKey}` };
  }

  const fileName = file.name.trim();

  // 1. Check filename for null bytes, paths, control characters
  if (fileName.includes("\0") || fileName.includes("%00") || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    return { valid: false, error: "Di-pinahihintulutan: May mga ilegal na karakter sa pangalan ng file." };
  }

  // 2. Extract and check extension
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1 || lastDot === fileName.length - 1) {
    return { valid: false, error: "Di-wastong file: Walang file extension ang dokumento." };
  }

  const ext = fileName.slice(lastDot).toLowerCase();

  // 3. Double extension check
  const parts = fileName.split(".");
  if (parts.length > 2) {
    for (let i = 1; i < parts.length - 1; i++) {
      const midExt = `.${parts[i].toLowerCase()}`;
      if (DANGEROUS_EXTENSIONS.has(midExt)) {
        return {
          valid: false,
          error: `Di-pinahihintulutan: May nakitang mapanganib na double extension (${midExt}) sa filename.`,
        };
      }
    }
  }

  // 4. Check if field is Photo Documentation and user selected a PDF
  if (spec.category === "photo" && ext === ".pdf") {
    return {
      valid: false,
      error: `⚠️ Bawal ang PDF: Ang field na "${spec.label}" ay nangangailangan ng aktwal na litrato o imahe (.jpg, .png, .webp). Hindi maaaring mag-upload ng PDF sa field na ito ayon sa Citizen's Charter.`,
    };
  }

  // 5. Allowed extension check for this field
  if (!spec.allowedExtensions.includes(ext)) {
    const allowedListStr = spec.allowedExtensions.map((e) => e.toUpperCase().replace(".", "")).join(", ");
    return {
      valid: false,
      error: `⚠️ Di-pinahihintulutang format (${ext}): Ang field na "${spec.label}" ay tumatanggap lamang ng mga file na: ${allowedListStr}.`,
    };
  }

  // 6. File size check
  const maxBytes = spec.maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `⚠️ Sobrang Laki ng File: Ang pinakamalaking sukat na pinapayagan ay ${spec.maxSizeMb}MB. Ang file na napili ay ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
    };
  }

  if (file.size < 100) {
    return {
      valid: false,
      error: "⚠️ Di-wastong File: Masyadong maliit o walang laman ang file (kukulangin sa 100 bytes).",
    };
  }

  // 7. Magic byte binary signature verification
  const magicCheck = await verifyFileMagicBytes(file, ext);
  if (!magicCheck.ok) {
    return {
      valid: false,
      error: magicCheck.error || "⚠️ Pekeng o sirang file signature ang nakita sa header ng file.",
    };
  }

  // 8. Cross-field Duplicate Check
  // Prevent citizen from uploading the exact same document across multiple requirement boxes
  if (existingDocs) {
    for (const [otherKey, otherDoc] of Object.entries(existingDocs)) {
      if (otherKey === fieldKey || !otherDoc) continue;
      const otherSpec = APPLICATION_DOCUMENT_FIELDS[otherKey];
      const otherLabel = otherSpec?.shortLabel || otherSpec?.label || otherKey;

      if (
        otherDoc.name.toLowerCase() === fileName.toLowerCase() &&
        otherDoc.size === file.size
      ) {
        return {
          valid: false,
          error: `⚠️ Nauulit na Dokumento: Ang file na "${fileName}" ay naka-attach na sa "${otherLabel}". Ang bawat field ay dapat may sariling kaukulang dokumento at hindi maaaring ulitin.`,
        };
      }
    }
  }

  return { valid: true };
}
