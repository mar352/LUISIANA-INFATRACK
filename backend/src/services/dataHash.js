import crypto from "crypto";

/**
 * Computes a deterministic SHA-256 cryptographic hash of a citizen application's
 * core intake payload for tamper-proof data integrity verification in PostgreSQL.
 *
 * @param {object} app
 * @returns {string} 64-character lowercase hexadecimal SHA-256 hash
 */
export function computeApplicationHash(app) {
  if (!app) return "";

  const payload = {
    id: String(app.id || "").trim(),
    trackingNumber: String(app.trackingNumber || "").trim().toUpperCase(),
    serviceType: String(app.serviceType || "zoning_certificate").trim(),
    applicant: {
      fullName: String(app.applicant?.fullName || app.applicant_name || "").trim(),
      contactPhone: String(app.applicant?.contactPhone || app.contact_phone || "").trim(),
      contactEmail: String(app.applicant?.contactEmail || app.contact_email || "").trim(),
      address: String(app.applicant?.address || app.address || "").trim(),
      barangay: String(app.applicant?.barangay || app.barangay || "").trim(),
    },
    projectTitle: String(app.projectTitle || app.project_title || app.title || "").trim(),
    category: String(app.category || "").trim(),
    estimatedCost: Number(app.estimatedCost ?? app.estimated_cost ?? app.estimatedCostPhp ?? 0),
    latitude: Number(app.latitude ?? app.lotDetails?.lat ?? app.coordinates?.lat ?? 0) || null,
    longitude: Number(app.longitude ?? app.lotDetails?.lon ?? app.coordinates?.lon ?? 0) || null,
    lotDetails: {
      tctNo: String(app.lotDetails?.tctNo || "").trim(),
      taxDecNo: String(app.lotDetails?.taxDecNo || "").trim(),
      isApplicantOwner: Boolean(app.lotDetails?.isApplicantOwner ?? app.isOwner),
      proposedBuildingType: String(app.lotDetails?.proposedBuildingType || app.buildingType || "").trim(),
      lotAreaSqM: Number(app.lotDetails?.lotAreaSqM ?? app.lotAreaSqM ?? 0),
    },
    createdAt: String(app.createdAt || app.created_at || "").trim(),
  };

  const serialized = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash("sha256").update(serialized, "utf8").digest("hex");
}

/**
 * Hashes a string field using SHA-256 for database storage privacy and anonymization.
 * If already hashed (64-char hex), returns as-is.
 *
 * @param {string} value
 * @returns {string} 64-char hex SHA-256 hash or empty string
 */
export function hashField(value) {
  if (value === undefined || value === null) return "";
  const str = String(value).trim();
  if (!str) return "";
  if (/^[a-f0-9]{64}$/i.test(str)) return str.toLowerCase();
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

