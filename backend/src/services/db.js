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

    // 3. Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS citizen_applications (
        id VARCHAR(64) PRIMARY KEY,
        tracking_number VARCHAR(64) UNIQUE NOT NULL,
        service_type VARCHAR(64) NOT NULL DEFAULT 'zoning_certificate',
        applicant_name VARCHAR(255),
        contact_phone VARCHAR(128),
        contact_email VARCHAR(128),
        address TEXT,
        barangay VARCHAR(128),
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        project_title VARCHAR(255),
        category VARCHAR(64),
        estimated_cost NUMERIC(15, 2),
        geo_risk JSONB DEFAULT '{}',
        agricultural_details JSONB DEFAULT '{}',
        municipal_details JSONB DEFAULT '{}',
        lot_details JSONB DEFAULT '{}',
        uploads JSONB DEFAULT '{}',
        status VARCHAR(64) NOT NULL DEFAULT 'submitted',
        step_progress JSONB DEFAULT '{}',
        responsible_officers JSONB DEFAULT '[]',
        sla_days INT DEFAULT 1,
        sla_minutes INT DEFAULT 12,
        fee VARCHAR(64) DEFAULT 'None (Free)',
        notes TEXT,
        zoning_classification VARCHAR(64) DEFAULT 'Rural Zone',
        data_hash VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS project_title VARCHAR(255);
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS category VARCHAR(64);
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(15, 2);
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS geo_risk JSONB DEFAULT '{}';
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS agricultural_details JSONB DEFAULT '{}';
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS municipal_details JSONB DEFAULT '{}';
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS zoning_classification VARCHAR(64);
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS data_hash VARCHAR(64);
      ALTER TABLE citizen_applications ALTER COLUMN contact_phone TYPE VARCHAR(128);
      ALTER TABLE citizen_applications ALTER COLUMN contact_email TYPE VARCHAR(128);
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS engineer_approved BOOLEAN DEFAULT FALSE;
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS engineer_approved_at TIMESTAMPTZ;
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS engineer_approved_by VARCHAR(255);
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ;
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS held_by VARCHAR(255);
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS hold_reason TEXT;
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS payment_status VARCHAR(64);
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS or_number VARCHAR(128);
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15, 2);
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ;
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT TRUE;
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS terms_version VARCHAR(32) DEFAULT '2026.1';
      ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS terms_consent_details JSONB DEFAULT '{}';

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

      /* 📸 Dedicated Table for Street View Panoramas & Side Photos */
      CREATE TABLE IF NOT EXISTS site_inspection_photos (
        id VARCHAR(64) PRIMARY KEY,
        application_id VARCHAR(64) REFERENCES citizen_applications(id) ON DELETE CASCADE,
        tracking_number VARCHAR(64),
        photo_url TEXT NOT NULL,
        photo_type VARCHAR(50) NOT NULL DEFAULT 'street_panorama', -- 'street_panorama' | 'side_photo'
        stage VARCHAR(50) NOT NULL DEFAULT 'during',               -- 'before' | 'during' | 'after'
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
      CREATE INDEX IF NOT EXISTS idx_ca_data_hash ON citizen_applications(data_hash);
      CREATE INDEX IF NOT EXISTS idx_ar_app_id ON application_remarks(application_id);
      CREATE INDEX IF NOT EXISTS idx_ar_tracking ON application_remarks(tracking_number);
    `);

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

      await pool.query(
        `INSERT INTO citizen_applications (
          id, tracking_number, service_type, applicant_name,
          contact_phone, contact_email, address, barangay,
          latitude, longitude,
          lot_details, uploads, status, step_progress,
          responsible_officers, sla_days, sla_minutes, fee,
          notes, zoning_classification, data_hash, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        ON CONFLICT (tracking_number) DO UPDATE SET
          applicant_name = EXCLUDED.applicant_name,
          contact_phone = EXCLUDED.contact_phone,
          contact_email = EXCLUDED.contact_email,
          address = EXCLUDED.address,
          data_hash = EXCLUDED.data_hash,
          updated_at = NOW()`,
        [
          a.id,
          a.trackingNumber,
          a.serviceType || "zoning_certificate",
          hashedName,
          hashedPhone,
          hashedEmail,
          hashedAddress,
          a.applicant?.barangay || "Poblacion",
          lat,
          lon,
          JSON.stringify(a.lotDetails || {}),
          JSON.stringify(a.uploads || {}),
          a.status || "submitted",
          JSON.stringify(a.stepProgress || {}),
          JSON.stringify(a.responsibleOfficers || []),
          a.slaDays || 1,
          a.slaMinutes || 12,
          a.fee || "None (Free)",
          a.notes || "",
          a.zoningClassification || (/zone\s+[ivx\d]+/i.test(a.applicant?.barangay || "") ? "Urban / Commercial Zone" : "Rural Zone"),
          dataHash,
          a.createdAt || new Date().toISOString(),
          a.updatedAt || new Date().toISOString(),
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
              rem.id,
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
