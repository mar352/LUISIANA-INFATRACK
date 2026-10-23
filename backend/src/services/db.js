import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { computeApplicationHash, hashField } from "./dataHash.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const PG_HOST = process.env.PGHOST || "localhost";
const PG_PORT = Number(process.env.PGPORT || 5432);
const PG_USER = process.env.PGUSER || "postgres";
const PG_PASSWORD = process.env.PGPASSWORD || "postgres";
const PG_DATABASE = process.env.PGDATABASE || "luisiana_infatrack";

let pool = null;
let dbConnected = false;

export function isDbConnected() {
  return dbConnected;
}

export async function query(text, params) {
  if (!pool || !dbConnected) {
    throw new Error("PostgreSQL pool is not connected.");
  }
  return pool.query(text, params);
}

/**
 * Initializes PostgreSQL:
 * 1. Checks connection to Postgres server.
 * 2. Creates `luisiana_infatrack` database if not present.
 * 3. Migrates `citizen_applications` & `application_remarks` tables.
 * 4. Imports existing records from citizen-applications.json if table is empty.
 */
export async function initDb() {
  const rootConfig = {
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: "postgres",
  };

  try {
    // 1. Check server and ensure database exists
    const rootClient = new pg.Client(rootConfig);
    await rootClient.connect();
    
    const dbCheck = await rootClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [PG_DATABASE]
    );

    if (dbCheck.rowCount === 0) {
      console.log(`[PostgreSQL] Creating database "${PG_DATABASE}"…`);
      await rootClient.query(`CREATE DATABASE "${PG_DATABASE}"`);
      console.log(`[PostgreSQL] Database "${PG_DATABASE}" created successfully.`);
    }
    await rootClient.end();

    // 2. Initialize application connection pool
    pool = new pg.Pool({
      host: PG_HOST,
      port: PG_PORT,
      user: PG_USER,
      password: PG_PASSWORD,
      database: PG_DATABASE,
      max: 10,
      idleTimeoutMillis: 30000,
    });

    // Test pool connection
    const client = await pool.connect();
    client.release();

    // 3. Create tables & Apply Unified Schema
    const schemaFile = path.resolve(__dirname, "../../sql/schema.sql");
    const seedFile = path.resolve(__dirname, "../../sql/seed.sql");

    if (fs.existsSync(schemaFile)) {
      const schemaSql = fs.readFileSync(schemaFile, "utf8");
      await pool.query(schemaSql);
      if (fs.existsSync(seedFile)) {
        const seedSql = fs.readFileSync(seedFile, "utf8");
        await pool.query(seedSql);
      }
    } else {
      // Fallback core schema
      await pool.query(`
        CREATE TABLE IF NOT EXISTS applicants (
          id VARCHAR(64) PRIMARY KEY,
          full_name VARCHAR(255) NOT NULL,
          contact_phone VARCHAR(128),
          contact_email VARCHAR(128),
          address TEXT,
          barangay VARCHAR(128) NOT NULL DEFAULT 'Poblacion',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS user_terms_consents (
          id VARCHAR(64) PRIMARY KEY,
          ip_address VARCHAR(64),
          user_agent TEXT,
          terms_version VARCHAR(32) NOT NULL DEFAULT '2026.1',
          agreed_terms BOOLEAN NOT NULL DEFAULT TRUE,
          agreed_privacy BOOLEAN NOT NULL DEFAULT TRUE,
          agreed_cookies BOOLEAN NOT NULL DEFAULT TRUE,
          consent_source VARCHAR(64) DEFAULT 'new_application_page',
          applicant_name VARCHAR(255),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS citizen_applications (
          id VARCHAR(64) PRIMARY KEY,
          tracking_number VARCHAR(64) UNIQUE NOT NULL,
          applicant_id VARCHAR(64) REFERENCES applicants(id) ON DELETE RESTRICT,
          service_type VARCHAR(64) NOT NULL DEFAULT 'zoning_certificate',
          category VARCHAR(64) NOT NULL DEFAULT 'private_infrastructure',
          status VARCHAR(64) NOT NULL DEFAULT 'submitted',
          project_title VARCHAR(255),
          estimated_cost NUMERIC(15, 2) DEFAULT 0,
          uploads JSONB DEFAULT '{}'::jsonb,
          step_progress JSONB DEFAULT '{"currentStep":1,"totalSteps":5}'::jsonb,
          responsible_officers JSONB DEFAULT '[]'::jsonb,
          sla_days INT DEFAULT 1,
          sla_minutes INT DEFAULT 12,
          fee VARCHAR(64) DEFAULT 'None (Free)',
          notes TEXT,
          data_hash VARCHAR(64),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS application_locations (
          id VARCHAR(64) PRIMARY KEY,
          application_id VARCHAR(64) UNIQUE NOT NULL REFERENCES citizen_applications(id) ON DELETE CASCADE,
          latitude DOUBLE PRECISION,
          longitude DOUBLE PRECISION,
          barangay VARCHAR(128) DEFAULT 'Poblacion',
          lot_area_sqm NUMERIC(10, 2),
          lot_location_description TEXT,
          zoning_classification VARCHAR(64) DEFAULT 'Rural Zone',
          tct_no VARCHAR(128),
          tax_dec_no VARCHAR(128),
          lot_owner VARCHAR(255),
          is_applicant_owner BOOLEAN DEFAULT FALSE,
          geo_risk JSONB DEFAULT '{}'::jsonb,
          lot_details JSONB DEFAULT '{}'::jsonb,
          agricultural_details JSONB DEFAULT '{}'::jsonb,
          municipal_details JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS application_payments (
          id VARCHAR(64) PRIMARY KEY,
          application_id VARCHAR(64) UNIQUE NOT NULL REFERENCES citizen_applications(id) ON DELETE CASCADE,
          payment_status VARCHAR(64) NOT NULL DEFAULT 'unpaid',
          order_of_payment_no VARCHAR(128),
          amount_due NUMERIC(15, 2) DEFAULT 0,
          or_number VARCHAR(128),
          amount_paid NUMERIC(15, 2) DEFAULT 0,
          payment_date TIMESTAMPTZ,
          cashier VARCHAR(255),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS engineering_reviews (
          id VARCHAR(64) PRIMARY KEY,
          application_id VARCHAR(64) UNIQUE NOT NULL REFERENCES citizen_applications(id) ON DELETE CASCADE,
          engineer_approved BOOLEAN NOT NULL DEFAULT FALSE,
          engineer_approved_at TIMESTAMPTZ,
          engineer_approved_by VARCHAR(255),
          is_pinned BOOLEAN DEFAULT FALSE,
          held_at TIMESTAMPTZ,
          held_by VARCHAR(255),
          hold_reason TEXT,
          occupancy_ready BOOLEAN DEFAULT FALSE,
          occupancy_permit_no VARCHAR(128),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS application_remarks (
          id VARCHAR(64) PRIMARY KEY,
          application_id VARCHAR(64) REFERENCES citizen_applications(id) ON DELETE CASCADE,
          tracking_number VARCHAR(64),
          from_office VARCHAR(64) NOT NULL DEFAULT 'MPDC',
          author VARCHAR(255),
          message TEXT NOT NULL,
          requires_action BOOLEAN DEFAULT FALSE,
          attached_file VARCHAR(255),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS site_inspection_photos (
          id VARCHAR(64) PRIMARY KEY,
          application_id VARCHAR(64) REFERENCES citizen_applications(id) ON DELETE CASCADE,
          tracking_number VARCHAR(64),
          photo_url TEXT NOT NULL,
          photo_type VARCHAR(50) NOT NULL DEFAULT 'street_panorama',
          stage VARCHAR(50) NOT NULL DEFAULT 'during',
          progress INTEGER DEFAULT 0,
          remarks TEXT,
          inspector VARCHAR(255),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_sip_app_id ON site_inspection_photos(application_id);
        CREATE INDEX IF NOT EXISTS idx_sip_tracking ON site_inspection_photos(tracking_number);
        CREATE INDEX IF NOT EXISTS idx_sip_stage ON site_inspection_photos(stage);
        CREATE INDEX IF NOT EXISTS idx_sip_type ON site_inspection_photos(photo_type);
        CREATE INDEX IF NOT EXISTS idx_utc_created_at ON user_terms_consents(created_at);
        CREATE INDEX IF NOT EXISTS idx_ca_tracking ON citizen_applications(tracking_number);
        CREATE INDEX IF NOT EXISTS idx_ca_applicant ON citizen_applications(applicant_id);
        CREATE INDEX IF NOT EXISTS idx_ca_data_hash ON citizen_applications(data_hash);
        CREATE INDEX IF NOT EXISTS idx_loc_app_id ON application_locations(application_id);
        CREATE INDEX IF NOT EXISTS idx_pay_app_id ON application_payments(application_id);
        CREATE INDEX IF NOT EXISTS idx_eng_app_id ON engineering_reviews(application_id);
        CREATE INDEX IF NOT EXISTS idx_ar_app_id ON application_remarks(application_id);
        CREATE INDEX IF NOT EXISTS idx_ar_tracking ON application_remarks(tracking_number);
      `);
    }

    dbConnected = true;
    console.log(`[PostgreSQL] Connected to "${PG_DATABASE}" on ${PG_HOST}:${PG_PORT}. Schema initialized.`);

    // 4. Seed migration from JSON if empty
    await seedExistingJsonApplications();

    return true;
  } catch (err) {
    dbConnected = false;
    console.warn(
      `[PostgreSQL] Connection note: ${err.message}. Backend will use local JSON fallback until PGPASSWORD in backend/.env is updated.`
    );
    return false;
  }
}

/**
 * Migrates existing applications from citizen-applications.json to PostgreSQL
 */
async function seedExistingJsonApplications() {
  if (!dbConnected) return;

  try {
    const jsonPath = path.join(__dirname, "../../data/citizen-applications.json");
    if (!fs.existsSync(jsonPath)) return;

    const raw = fs.readFileSync(jsonPath, "utf8");
    const apps = JSON.parse(raw);
    if (!Array.isArray(apps) || apps.length === 0) return;

    console.log(`[PostgreSQL] Migrating ${apps.length} existing applications from JSON…`);

    for (const a of apps) {
      const lat = Number(a.latitude ?? a.lotDetails?.lat ?? a.coordinates?.lat) || null;
      const lon = Number(a.longitude ?? a.lotDetails?.lon ?? a.coordinates?.lon) || null;
      const hashedName = hashField(a.applicant?.fullName || a.applicant_name);
      const hashedPhone = hashField(a.applicant?.contactPhone || a.contact_phone);
      const hashedEmail = hashField(a.applicant?.contactEmail || a.contact_email);
      const hashedAddress = hashField(a.applicant?.address || a.address);
      const dataHash = a.dataHash || computeApplicationHash(a);

      const applicantId = `app-user-${a.id}`;
      // 1. Insert into applicants
      await pool.query(
        `INSERT INTO applicants (id, full_name, contact_phone, contact_email, address, barangay, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           contact_phone = EXCLUDED.contact_phone,
           contact_email = EXCLUDED.contact_email,
           address = EXCLUDED.address,
           updated_at = NOW()`,
        [
          applicantId,
          hashedName || "Applicant",
          hashedPhone || "",
          hashedEmail || "",
          hashedAddress || "",
          a.applicant?.barangay || "Poblacion",
          a.createdAt || new Date().toISOString(),
          a.updatedAt || new Date().toISOString(),
        ]
      );

      // 2. Insert into citizen_applications (core)
      await pool.query(
        `INSERT INTO citizen_applications (
          id, tracking_number, applicant_id, service_type, category,
          status, project_title, estimated_cost, uploads, step_progress,
          responsible_officers, sla_days, sla_minutes, fee, notes,
          data_hash, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (tracking_number) DO UPDATE SET
          status = EXCLUDED.status,
          step_progress = EXCLUDED.step_progress,
          data_hash = EXCLUDED.data_hash,
          updated_at = NOW()`,
        [
          a.id,
          a.trackingNumber,
          applicantId,
          a.serviceType || "zoning_certificate",
          a.category || "private_infrastructure",
          a.status || "submitted",
          a.projectTitle || a.title || "",
          Number(a.estimatedCost || 0),
          JSON.stringify(a.uploads || {}),
          JSON.stringify(a.stepProgress || {}),
          JSON.stringify(a.responsibleOfficers || []),
          a.slaDays || 1,
          a.slaMinutes || 12,
          a.fee || "None (Free)",
          a.notes || "",
          dataHash,
          a.createdAt || new Date().toISOString(),
          a.updatedAt || new Date().toISOString(),
        ]
      );

      // 3. Insert into application_locations
      await pool.query(
        `INSERT INTO application_locations (
          id, application_id, latitude, longitude, barangay,
          lot_area_sqm, lot_location_description, zoning_classification,
          tct_no, tax_dec_no, lot_owner, is_applicant_owner,
          geo_risk, lot_details, agricultural_details, municipal_details
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (application_id) DO UPDATE SET
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          zoning_classification = EXCLUDED.zoning_classification,
          geo_risk = EXCLUDED.geo_risk,
          lot_details = EXCLUDED.lot_details`,
        [
          `loc-${a.id}`,
          a.id,
          lat,
          lon,
          a.applicant?.barangay || "Poblacion",
          Number(a.lotDetails?.lotAreaSqM || 0),
          a.lotDetails?.lotLocationDescription || "",
          a.zoningClassification || (/zone\s+[ivx\d]+/i.test(a.applicant?.barangay || "") ? "Urban / Commercial Zone" : "Rural Zone"),
          a.lotDetails?.tctNo || "",
          a.lotDetails?.taxDecNo || "",
          a.lotDetails?.lotOwner || "",
          Boolean(a.lotDetails?.isApplicantOwner),
          JSON.stringify(a.geoRisk || {}),
          JSON.stringify(a.lotDetails || {}),
          JSON.stringify(a.agriculturalDetails || {}),
          JSON.stringify(a.municipalDetails || {}),
        ]
      );

      // 4. Insert into application_payments
      await pool.query(
        `INSERT INTO application_payments (
          id, application_id, payment_status, order_of_payment_no,
          amount_due, or_number, amount_paid, payment_date, cashier
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (application_id) DO UPDATE SET
          payment_status = EXCLUDED.payment_status,
          or_number = EXCLUDED.or_number,
          amount_paid = EXCLUDED.amount_paid,
          payment_date = EXCLUDED.payment_date`,
        [
          `pay-${a.id}`,
          a.id,
          a.paymentStatus || a.payment?.status || "unpaid",
          a.payment?.orderOfPaymentNo || a.orderOfPaymentNo || null,
          Number(a.payment?.feeAmount || a.payment?.amount || 0),
          a.payment?.orNumber || a.payment?.or_number || a.or_number || null,
          Number(a.payment?.paidAmount || a.payment?.amount_paid || a.amount_paid || 0),
          a.payment?.payment_date || a.payment?.paidAt || a.paymentDate || null,
          a.payment?.cashier || null,
        ]
      );

      // 5. Insert into engineering_reviews
      await pool.query(
        `INSERT INTO engineering_reviews (
          id, application_id, engineer_approved, engineer_approved_at,
          engineer_approved_by, is_pinned, held_at, held_by, hold_reason,
          occupancy_ready, occupancy_permit_no
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (application_id) DO UPDATE SET
          engineer_approved = EXCLUDED.engineer_approved,
          is_pinned = EXCLUDED.is_pinned,
          held_at = EXCLUDED.held_at,
          hold_reason = EXCLUDED.hold_reason`,
        [
          `eng-${a.id}`,
          a.id,
          Boolean(a.engineerApproved),
          a.engineerApprovedAt || null,
          a.engineerApprovedBy || null,
          Boolean(a.isPinned),
          a.heldAt || null,
          a.heldBy || null,
          a.holdReason || null,
          Boolean(a.occupancyReady),
          a.occupancyPermitNo || null,
        ]
      );

      // Insert inspection photos into site_inspection_photos
      if (Array.isArray(a.inspectionPhotos)) {
        for (let i = 0; i < a.inspectionPhotos.length; i++) {
          const insp = a.inspectionPhotos[i];
          const pUrl = insp.photoUrl || insp.url;
          if (!pUrl) continue;
          const pId = insp.id || `insp-${a.id}-${i}`;
          await pool.query(
            `INSERT INTO site_inspection_photos (
              id, application_id, tracking_number, photo_url,
              photo_type, stage, progress, remarks, inspector, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (id) DO NOTHING`,
            [
              pId,
              a.id,
              a.trackingNumber,
              pUrl,
              "street_panorama",
              insp.stage || (a.progress >= 100 ? "after" : a.progress >= 50 ? "during" : "before"),
              typeof insp.progress === "number" ? insp.progress : (a.progress || 0),
              insp.remarks || "",
              insp.inspector || "Municipal Engineer",
              insp.inspectedAt ? new Date(insp.inspectedAt) : new Date(),
              new Date(),
            ]
          );
        }
      }

      // Insert side photos into site_inspection_photos
      if (Array.isArray(a.sidePhotos)) {
        for (let i = 0; i < a.sidePhotos.length; i++) {
          const sp = a.sidePhotos[i];
          const pUrl = sp.url || sp.photoUrl;
          if (!pUrl) continue;
          const pId = sp.id || `side-${a.id}-${i}`;
          await pool.query(
            `INSERT INTO site_inspection_photos (
              id, application_id, tracking_number, photo_url,
              photo_type, stage, progress, remarks, inspector, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (id) DO NOTHING`,
            [
              pId,
              a.id,
              a.trackingNumber,
              pUrl,
              "side_photo",
              sp.stage || (a.progress >= 100 ? "after" : a.progress >= 50 ? "during" : "before"),
              a.progress || 0,
              sp.caption || "",
              sp.inspector || "Municipal Engineer",
              sp.uploadedAt ? new Date(sp.uploadedAt) : new Date(),
              new Date(),
            ]
          );
        }
      }

      // Insert remarks if present
      if (Array.isArray(a.remarks)) {
        for (const rem of a.remarks) {
          await pool.query(
            `INSERT INTO application_remarks (
              id, application_id, tracking_number, from_office,
              author, message, requires_action, attached_file, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (id) DO NOTHING`,
            [
              rem.id || `rem-${a.id}-${Math.random().toString(36).substring(2, 9)}`,
              a.id,
              a.trackingNumber,
              rem.fromOffice || "MPDC",
              rem.author || "Staff",
              rem.message || "",
              Boolean(rem.requiresAction),
              rem.attachedFile || null,
              rem.createdAt ? new Date(rem.createdAt) : new Date(),
            ]
          );
        }
      }
    }

    console.log(`[PostgreSQL] Migrated ${apps.length} applications into PostgreSQL successfully.`);
  } catch (err) {
    console.warn("[PostgreSQL] Seed migration warning:", err.message);
  }
}


/**
 * Inserts or updates a photo in the site_inspection_photos PostgreSQL table
 */
export async function insertSiteInspectionPhoto({
  id,
  applicationId,
  trackingNumber,
  photoUrl,
  photoType = "street_panorama",
  stage = "during",
  progress = 0,
  remarks = "",
  inspector = "Municipal Engineer",
  createdAt = new Date(),
}) {
  if (!dbConnected || !pool) return null;
  try {
    const res = await pool.query(
      `INSERT INTO site_inspection_photos (
        id, application_id, tracking_number, photo_url,
        photo_type, stage, progress, remarks, inspector, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET
        photo_url = EXCLUDED.photo_url,
        photo_type = EXCLUDED.photo_type,
        stage = EXCLUDED.stage,
        progress = EXCLUDED.progress,
        remarks = EXCLUDED.remarks,
        inspector = EXCLUDED.inspector,
        updated_at = NOW()
      RETURNING *`,
      [
        id,
        applicationId,
        trackingNumber,
        photoUrl,
        photoType,
        stage,
        progress,
        remarks,
        inspector,
        createdAt,
        new Date(),
      ]
    );
    return res.rows[0];
  } catch (err) {
    console.warn("[PostgreSQL] insertSiteInspectionPhoto warning:", err.message);
    return null;
  }
}

/**
 * Retrieves all photos for an application from the site_inspection_photos PostgreSQL table
 */
export async function getSiteInspectionPhotosFromDb(applicationIdOrTracking, photoType = null, stage = null) {
  if (!dbConnected || !pool) return [];
  try {
    let sql = `SELECT * FROM site_inspection_photos WHERE (application_id = $1 OR tracking_number = $1)`;
    const params = [applicationIdOrTracking];

    if (photoType) {
      params.push(photoType);
      sql += ` AND photo_type = $${params.length}`;
    }
    if (stage) {
      params.push(stage);
      sql += ` AND stage = $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC`;

    const res = await pool.query(sql, params);
    return res.rows;
  } catch (err) {
    console.warn("[PostgreSQL] getSiteInspectionPhotosFromDb warning:", err.message);
    return [];
  }
}
