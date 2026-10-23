import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { listCitizenApplications } from "./citizenApplications.js";
import { listAllAccounts } from "./auth.js";
import { getSystemConfig } from "./systemConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../../data");

function readJsonSafe(filename, fallback = []) {
  try {
    const fullPath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(fullPath)) return fallback;
    const raw = fs.readFileSync(fullPath, "utf8");
    return JSON.parse(raw) || fallback;
  } catch {
    return fallback;
  }
}

function escapeSqlString(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return isFinite(val) ? String(val) : "NULL";
  if (typeof val === "object") {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Builds the comprehensive disaster recovery data bundle
 */
export function buildBackupBundle(author = "Super Admin") {
  const applications = listCitizenApplications();
  const accounts = listAllAccounts().map((u) => ({
    username: u.username,
    name: u.name || u.username,
    employeeId: u.employeeId || "",
    role: u.role,
    department: u.department || "",
    isActive: u.isActive !== false,
    createdAt: u.createdAt || "",
  }));
  const projects = readJsonSafe("projects.json", []);
  const termsConsents = readJsonSafe("user-terms-consents.json", []);
  const engagement = readJsonSafe("engagement.json", []);
  const systemConfig = getSystemConfig();

  const bundleData = {
    citizenApplications: applications,
    projects,
    accounts,
    systemConfig,
    termsConsents,
    engagement,
  };

  const jsonStr = JSON.stringify(bundleData);
  const checksumSha256 = crypto.createHash("sha256").update(jsonStr).digest("hex");

  const metadata = {
    system: "LUISIANA INFA-TRACK Disaster Recovery Backup",
    municipality: "Municipality of Luisiana, Province of Laguna",
    psgc: "0403412000",
    version: "1.2.0",
    exportedAt: new Date().toISOString(),
    exportedBy: author,
    checksumSha256,
    summary: {
      totalApplications: applications.length,
      totalProjects: Array.isArray(projects) ? projects.length : 0,
      totalAccounts: accounts.length,
      totalTermsConsents: termsConsents.length,
      totalMasterlistItems:
        (systemConfig.masterlists?.barangays?.length || 0) +
        (systemConfig.masterlists?.buildingTypes?.length || 0) +
        (systemConfig.masterlists?.zoningClassifications?.length || 0) +
        (systemConfig.masterlists?.permitCategories?.length || 0),
    },
  };

  return {
    metadata,
    data: bundleData,
  };
}

/**
 * Generates formatted JSON disaster recovery package
 */
export function generateJsonBackup(author = "Super Admin") {
  const bundle = buildBackupBundle(author);
  return JSON.stringify(bundle, null, 2);
}

/**
 * Generates standard PostgreSQL / SQLite compatible SQL dump
 */
export function generateSqlBackup(author = "Super Admin") {
  const bundle = buildBackupBundle(author);
  const { metadata, data } = bundle;

  let sql = "";
  sql += `-- =============================================================================\n`;
  sql += `-- LUISIANA INFA-TRACK DISASTER RECOVERY DATABASE BACKUP\n`;
  sql += `-- LGU: Municipality of Luisiana, Laguna (PSGC 0403412000)\n`;
  sql += `-- Generated At: ${metadata.exportedAt}\n`;
  sql += `-- Exported By: ${metadata.exportedBy}\n`;
  sql += `-- SHA-256 Checksum: ${metadata.checksumSha256}\n`;
  sql += `-- Records: ${metadata.summary.totalApplications} Applications | ${metadata.summary.totalProjects} Projects | ${metadata.summary.totalAccounts} Staff Accounts\n`;
  sql += `-- =============================================================================\n\n`;

  sql += `BEGIN;\n\n`;

  // 1. Metadata table
  sql += `-- 1. System Metadata\n`;
  sql += `CREATE TABLE IF NOT EXISTS infatrack_backup_meta (\n`;
  sql += `  id VARCHAR(64) PRIMARY KEY,\n`;
  sql += `  system_name VARCHAR(128),\n`;
  sql += `  lgu_name VARCHAR(128),\n`;
  sql += `  checksum_sha256 VARCHAR(64),\n`;
  sql += `  exported_at TIMESTAMP,\n`;
  sql += `  exported_by VARCHAR(64),\n`;
  sql += `  summary_json TEXT\n`;
  sql += `);\n\n`;

  sql += `INSERT INTO infatrack_backup_meta (id, system_name, lgu_name, checksum_sha256, exported_at, exported_by, summary_json)\n`;
  sql += `VALUES (\n`;
  sql += `  ${escapeSqlString("meta-" + Date.now())},\n`;
  sql += `  ${escapeSqlString(metadata.system)},\n`;
  sql += `  ${escapeSqlString(metadata.municipality)},\n`;
  sql += `  ${escapeSqlString(metadata.checksumSha256)},\n`;
  sql += `  ${escapeSqlString(metadata.exportedAt)},\n`;
  sql += `  ${escapeSqlString(metadata.exportedBy)},\n`;
  sql += `  ${escapeSqlString(metadata.summary)}\n`;
  sql += `);\n\n`;

  // 2. Staff Accounts table
  sql += `-- 2. Staff Accounts\n`;
  sql += `CREATE TABLE IF NOT EXISTS staff_accounts (\n`;
  sql += `  username VARCHAR(64) PRIMARY KEY,\n`;
  sql += `  name VARCHAR(128),\n`;
  sql += `  employee_id VARCHAR(64),\n`;
  sql += `  role VARCHAR(64),\n`;
  sql += `  department VARCHAR(128),\n`;
  sql += `  is_active BOOLEAN DEFAULT TRUE,\n`;
  sql += `  created_at TIMESTAMP\n`;
  sql += `);\n\n`;

  for (const acc of data.accounts) {
    sql += `INSERT INTO staff_accounts (username, name, employee_id, role, department, is_active, created_at)\n`;
    sql += `VALUES (${escapeSqlString(acc.username)}, ${escapeSqlString(acc.name)}, ${escapeSqlString(acc.employeeId)}, ${escapeSqlString(acc.role)}, ${escapeSqlString(acc.department)}, ${acc.isActive ? "TRUE" : "FALSE"}, ${escapeSqlString(acc.createdAt || new Date().toISOString())})\n`;
    sql += `ON CONFLICT (username) DO UPDATE SET\n`;
    sql += `  name = EXCLUDED.name, role = EXCLUDED.role, department = EXCLUDED.department, is_active = EXCLUDED.is_active;\n`;
  }
  sql += `\n`;

  // 3. Citizen Applications & Normalized Tables
  sql += `-- 3. Applicants & Normalized Citizen Applications\n`;
  sql += `CREATE TABLE IF NOT EXISTS applicants (\n`;
  sql += `  id VARCHAR(64) PRIMARY KEY,\n`;
  sql += `  full_name VARCHAR(255) NOT NULL,\n`;
  sql += `  contact_phone VARCHAR(128),\n`;
  sql += `  contact_email VARCHAR(128),\n`;
  sql += `  address TEXT,\n`;
  sql += `  barangay VARCHAR(128) NOT NULL DEFAULT 'Poblacion',\n`;
  sql += `  created_at TIMESTAMPTZ DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMPTZ DEFAULT NOW()\n`;
  sql += `);\n\n`;

  sql += `CREATE TABLE IF NOT EXISTS citizen_applications (\n`;
  sql += `  id VARCHAR(64) PRIMARY KEY,\n`;
  sql += `  tracking_number VARCHAR(64) UNIQUE,\n`;
  sql += `  applicant_id VARCHAR(64) REFERENCES applicants(id),\n`;
  sql += `  service_type VARCHAR(64),\n`;
  sql += `  project_title VARCHAR(256),\n`;
  sql += `  category VARCHAR(64),\n`;
  sql += `  status VARCHAR(64),\n`;
  sql += `  estimated_cost NUMERIC,\n`;
  sql += `  data_hash VARCHAR(128),\n`;
  sql += `  created_at TIMESTAMPTZ\n`;
  sql += `);\n\n`;

  sql += `CREATE TABLE IF NOT EXISTS application_locations (\n`;
  sql += `  id VARCHAR(64) PRIMARY KEY,\n`;
  sql += `  application_id VARCHAR(64) REFERENCES citizen_applications(id),\n`;
  sql += `  latitude NUMERIC,\n`;
  sql += `  longitude NUMERIC,\n`;
  sql += `  barangay VARCHAR(128),\n`;
  sql += `  full_details_json TEXT\n`;
  sql += `);\n\n`;

  for (const app of data.citizenApplications) {
    const lat = Number(app.latitude || app.lotDetails?.lat) || null;
    const lon = Number(app.longitude || app.lotDetails?.lon) || null;
    const applicantId = `app-user-${app.id}`;

    sql += `INSERT INTO applicants (id, full_name, contact_phone, contact_email, address, barangay, created_at)\n`;
    sql += `VALUES (${escapeSqlString(applicantId)}, ${escapeSqlString(app.applicant?.fullName || 'Applicant')}, ${escapeSqlString(app.applicant?.contactPhone || '')}, ${escapeSqlString(app.applicant?.contactEmail || '')}, ${escapeSqlString(app.applicant?.address || '')}, ${escapeSqlString(app.applicant?.barangay || 'Poblacion')}, ${escapeSqlString(app.createdAt || new Date().toISOString())})\n`;
    sql += `ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;\n`;

    sql += `INSERT INTO citizen_applications (id, tracking_number, applicant_id, service_type, project_title, category, status, estimated_cost, data_hash, created_at)\n`;
    sql += `VALUES (${escapeSqlString(app.id)}, ${escapeSqlString(app.trackingNumber)}, ${escapeSqlString(applicantId)}, ${escapeSqlString(app.serviceType)}, ${escapeSqlString(app.projectTitle)}, ${escapeSqlString(app.category)}, ${escapeSqlString(app.status)}, ${escapeSqlString(app.estimatedCost)}, ${escapeSqlString(app.dataHash)}, ${escapeSqlString(app.createdAt || app.stepProgress?.step1At || new Date().toISOString())})\n`;
    sql += `ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data_hash = EXCLUDED.data_hash;\n`;

    sql += `INSERT INTO application_locations (id, application_id, latitude, longitude, barangay, full_details_json)\n`;
    sql += `VALUES (${escapeSqlString('loc-' + app.id)}, ${escapeSqlString(app.id)}, ${lat !== null ? lat : "NULL"}, ${lon !== null ? lon : "NULL"}, ${escapeSqlString(app.applicant?.barangay || 'Poblacion')}, ${escapeSqlString(app)})\n`;
    sql += `ON CONFLICT (id) DO NOTHING;\n`;
  }
  sql += `\n`;

  // 4. Municipal Projects table
  sql += `-- 4. Infrastructure Projects Mirror\n`;
  sql += `CREATE TABLE IF NOT EXISTS municipal_projects (\n`;
  sql += `  id VARCHAR(64) PRIMARY KEY,\n`;
  sql += `  name VARCHAR(256),\n`;
  sql += `  type VARCHAR(64),\n`;
  sql += `  status VARCHAR(64),\n`;
  sql += `  barangay VARCHAR(128),\n`;
  sql += `  budget NUMERIC,\n`;
  sql += `  details_json TEXT\n`;
  sql += `);\n\n`;

  if (Array.isArray(data.projects)) {
    for (const p of data.projects) {
      sql += `INSERT INTO municipal_projects (id, name, type, status, barangay, budget, details_json)\n`;
      sql += `VALUES (${escapeSqlString(p.id)}, ${escapeSqlString(p.name)}, ${escapeSqlString(p.type)}, ${escapeSqlString(p.status)}, ${escapeSqlString(p.barangay)}, ${escapeSqlString(p.budget || p.cost || 0)}, ${escapeSqlString(p)})\n`;
      sql += `ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, details_json = EXCLUDED.details_json;\n`;
    }
  }
  sql += `\n`;

  // 5. System Configuration table
  sql += `-- 5. System Configuration Masterlists\n`;
  sql += `CREATE TABLE IF NOT EXISTS system_config (\n`;
  sql += `  id VARCHAR(64) PRIMARY KEY,\n`;
  sql += `  config_json TEXT,\n`;
  sql += `  updated_at TIMESTAMP\n`;
  sql += `);\n\n`;
  sql += `INSERT INTO system_config (id, config_json, updated_at)\n`;
  sql += `VALUES ('master_config', ${escapeSqlString(data.systemConfig)}, ${escapeSqlString(data.systemConfig?.lastUpdated || new Date().toISOString())})\n`;
  sql += `ON CONFLICT (id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = EXCLUDED.updated_at;\n\n`;

  sql += `COMMIT;\n`;
  sql += `-- END OF BACKUP --\n`;

  return sql;
}
