import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_PDF = path.join(ROOT_DIR, "LUISIANA_INFATRACK_DATABASE_SCHEMA.pdf");
const TEMP_HTML = path.join(ROOT_DIR, "temp_schema_render.html");
const IMAGE_PATH = "C:/Users/kingking/.gemini/antigravity-ide/brain/11b97c1b-a874-4803-93e4-cc088c2be458/db_schema_diagram_1790595688980.jpg";

let imageBase64 = "";
if (fs.existsSync(IMAGE_PATH)) {
  const buf = fs.readFileSync(IMAGE_PATH);
  imageBase64 = `data:image/jpeg;base64,${buf.toString("base64")}`;
}

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>LUISIANA INFA-TRACK - Database Schema Specification</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 14mm 16mm 14mm;
      @bottom-right {
        content: counter(page);
      }
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      background: #ffffff;
      line-height: 1.45;
      font-size: 11px;
      margin: 0;
      padding: 0;
    }
    .header-bar {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header-bar .titles h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    .header-bar .titles h2 {
      margin: 3px 0 0 0;
      font-size: 12px;
      font-weight: 600;
      color: #0284c7;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .header-bar .meta {
      text-align: right;
      font-size: 10px;
      color: #64748b;
    }
    .cover-card {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #ffffff;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .cover-card h2 {
      margin: 0 0 8px 0;
      font-size: 16px;
      color: #38bdf8;
    }
    .cover-card p {
      margin: 0 0 12px 0;
      font-size: 11px;
      color: #cbd5e1;
      max-width: 90%;
    }
    .badge-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.1);
      color: #f1f5f9;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .badge.cyan { background: rgba(56, 189, 248, 0.2); color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); }
    .badge.gold { background: rgba(251, 191, 36, 0.2); color: #fbbf24; border-color: rgba(251, 191, 36, 0.4); }
    .badge.green { background: rgba(34, 197, 94, 0.2); color: #4ade80; border-color: rgba(34, 197, 94, 0.4); }

    .diagram-section {
      page-break-after: always;
      margin-bottom: 20px;
    }
    .diagram-frame {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      background: #0b1120;
    }
    .diagram-frame img {
      width: 100%;
      height: auto;
      display: block;
    }

    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      border-left: 4px solid #0284c7;
      padding-left: 8px;
      margin: 20px 0 10px 0;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .table-container {
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    .table-header-bar {
      background: #f1f5f9;
      padding: 6px 10px;
      border-top-left-radius: 6px;
      border-top-right-radius: 6px;
      border: 1px solid #cbd5e1;
      border-bottom: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .table-header-bar h3 {
      margin: 0;
      font-size: 11.5px;
      font-weight: 700;
      color: #0f172a;
      font-family: monospace;
    }
    .table-header-bar .desc {
      font-size: 10px;
      color: #64748b;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #cbd5e1;
      border-radius: 0 0 6px 6px;
      overflow: hidden;
    }
    th, td {
      padding: 5px 8px;
      text-align: left;
      font-size: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      background: #f8fafc;
      color: #475569;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 8.5px;
      letter-spacing: 0.05em;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:nth-child(even) td {
      background: #fafafa;
    }

    .pill-pk {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 700;
      display: inline-block;
      margin-right: 3px;
    }
    .pill-fk {
      background: #fefce8;
      color: #a16207;
      border: 1px solid #fef08a;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 700;
      display: inline-block;
      margin-right: 3px;
    }
    .pill-uk {
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #bbf7d0;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 700;
      display: inline-block;
      margin-right: 3px;
    }
    .type-code {
      font-family: monospace;
      color: #0369a1;
      font-size: 9.5px;
    }
    .page-break {
      page-break-after: always;
    }
    .footer-note {
      margin-top: 25px;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
      font-size: 9px;
      color: #94a3b8;
      text-align: center;
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header-bar">
    <div class="titles">
      <h1>LUISIANA INFA-TRACK</h1>
      <h2>Database Architecture & Schema Specification</h2>
    </div>
    <div class="meta">
      <div><strong>Municipality of Luisiana, Laguna</strong></div>
      <div>PSGC: 0403412000 | Region IV-A (CALABARZON)</div>
      <div>Target: PostgreSQL 14+ Relational & Spatial</div>
    </div>
  </div>

  <!-- COVER CARD -->
  <div class="cover-card">
    <h2>Municipal Enterprise Database Architecture</h2>
    <p>
      Unified relational database design powering real-time GIS infrastructure tracking, 3D WebGL model transforms,
      Citizen's Charter zoning certificates, inter-office collaborative planning (MPDC, Engineering, Agriculture, Treasury),
      and multi-layered security audit trails.
    </p>
    <div class="badge-row">
      <span class="badge cyan">PostgreSQL 14+ / 16+</span>
      <span class="badge cyan">PostGIS Geospatial Ready</span>
      <span class="badge gold">18 Core Tables</span>
      <span class="badge green">23 Barangays (PSGC)</span>
      <span class="badge">Cryptographic Data Hash</span>
      <span class="badge">RBAC Access Control</span>
    </div>
  </div>

  <!-- SECTION 1: VISUAL DIAGRAM POSTER -->
  <div class="diagram-section">
    <div class="section-title">1. Visual Database Architecture Diagram</div>
    <div class="diagram-frame">
      ${imageBase64 ? `<img src="${imageBase64}" alt="Database Architecture Diagram" />` : `<p style="color:#fff;padding:20px;">[Visual Diagram Graphic]</p>`}
    </div>
  </div>

  <!-- SECTION 2: SYSTEM CONFIG & MASTERLISTS -->
  <div class="section-title">2. System Configuration & Geographic Masterlists</div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>barangays</h3>
      <span class="desc">Official 23 Barangays of Luisiana, Laguna</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">VARCHAR(64)</td><td>PRIMARY KEY</td><td>Unique identifier (e.g. 'brgy-1')</td></tr>
        <tr><td>code</td><td class="type-code">VARCHAR(32)</td><td>UNIQUE, NOT NULL</td><td>Barangay code (e.g. 'ZONE-1', 'DELAPAZ')</td></tr>
        <tr><td>name</td><td class="type-code">VARCHAR(128)</td><td>NOT NULL</td><td>Full official name (e.g. 'Barangay Zone I (Poblacion)')</td></tr>
        <tr><td>zone</td><td class="type-code">VARCHAR(64)</td><td>DEFAULT 'Rural Zone'</td><td>Zoning classification ('Urban / Commercial Zone', 'Rural')</td></tr>
        <tr><td>is_active</td><td class="type-code">BOOLEAN</td><td>DEFAULT TRUE</td><td>Active status in drop-downs and GIS filters</td></tr>
        <tr><td>created_at / updated_at</td><td class="type-code">TIMESTAMPTZ</td><td>DEFAULT NOW()</td><td>Auto-managed timestamp</td></tr>
      </tbody>
    </table>
  </div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>system_config</h3>
      <span class="desc">System maintenance mode, parameters, and metadata</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">VARCHAR(64)</td><td>PRIMARY KEY</td><td>Default 'master_config'</td></tr>
        <tr><td>version</td><td class="type-code">VARCHAR(32)</td><td>NOT NULL</td><td>Software version release (e.g. '1.2.0')</td></tr>
        <tr><td>maintenance_enabled</td><td class="type-code">BOOLEAN</td><td>DEFAULT FALSE</td><td>Maintenance barrier toggle for public portal</td></tr>
        <tr><td>maintenance_message</td><td class="type-code">TEXT</td><td>NULL</td><td>Notice message displayed to public users</td></tr>
        <tr><td>config_json</td><td class="type-code">JSONB</td><td>DEFAULT '{}'</td><td>Extended key-value system configuration</td></tr>
        <tr><td>updated_at</td><td class="type-code">TIMESTAMPTZ</td><td>DEFAULT NOW()</td><td>Timestamp of last modification</td></tr>
      </tbody>
    </table>
  </div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>system_masterlists</h3>
      <span class="desc">Zoning types, building classifications, and funding sources</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">VARCHAR(64)</td><td>PRIMARY KEY</td><td>Unique item ID (e.g. 'zc-1', 'bt-1')</td></tr>
        <tr><td>category</td><td class="type-code">VARCHAR(64)</td><td>NOT NULL</td><td>Category: buildingTypes, zoningClassifications, permitCategories</td></tr>
        <tr><td>code</td><td class="type-code">VARCHAR(64)</td><td>NOT NULL</td><td>Unique slug within category (e.g. 'URBAN_COMM')</td></tr>
        <tr><td>name</td><td class="type-code">VARCHAR(255)</td><td>NOT NULL</td><td>Human-readable label</td></tr>
        <tr><td>zone_group</td><td class="type-code">VARCHAR(64)</td><td>NULL</td><td>High-level group (Commercial, Residential, Agricultural)</td></tr>
        <tr><td>is_active</td><td class="type-code">BOOLEAN</td><td>DEFAULT TRUE</td><td>Whether selectable in application intake</td></tr>
      </tbody>
    </table>
  </div>

  <div class="page-break"></div>

  <!-- SECTION 3: AUTHENTICATION, ROLES & SECURITY -->
  <div class="section-title">3. Authentication, RBAC & Security Audit Logs</div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>staff_accounts</h3>
      <span class="desc">LGU Staff & Official user profiles (PBKDF2 secured)</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">UUID</td><td>PRIMARY KEY</td><td>Default uuid_generate_v4()</td></tr>
        <tr><td><span class="pill-uk">UK</span>username</td><td class="type-code">VARCHAR(64)</td><td>UNIQUE, NOT NULL</td><td>Login username ('mpdc', 'engineer', 'agriculture', etc.)</td></tr>
        <tr><td>name</td><td class="type-code">VARCHAR(255)</td><td>NOT NULL</td><td>Full name / designation of employee</td></tr>
        <tr><td>employee_id</td><td class="type-code">VARCHAR(64)</td><td>NULL</td><td>LGU Employee ID (e.g. 'MPDC-001')</td></tr>
        <tr><td>role</td><td class="type-code">VARCHAR(64)</td><td>CHECK (role IN ...)</td><td>RBAC role (Super Admin, MPDC, Engineer, Treasury, Assessor)</td></tr>
        <tr><td>department</td><td class="type-code">VARCHAR(255)</td><td>NOT NULL</td><td>Department or municipal office name</td></tr>
        <tr><td>password_hash</td><td class="type-code">TEXT</td><td>NOT NULL</td><td>PBKDF2-SHA256 password hash</td></tr>
        <tr><td>password_salt</td><td class="type-code">TEXT</td><td>NOT NULL</td><td>Cryptographic salt (base64)</td></tr>
        <tr><td>iterations</td><td class="type-code">INT</td><td>DEFAULT 120000</td><td>PBKDF2 iteration count</td></tr>
        <tr><td>failed_attempts</td><td class="type-code">INT</td><td>DEFAULT 0</td><td>Failed login counter for brute-force lockout</td></tr>
        <tr><td>locked_until</td><td class="type-code">TIMESTAMPTZ</td><td>NULL</td><td>Lockout expiration timestamp</td></tr>
        <tr><td>must_change_password</td><td class="type-code">BOOLEAN</td><td>DEFAULT FALSE</td><td>Enforces password change upon initial login</td></tr>
        <tr><td>is_active</td><td class="type-code">BOOLEAN</td><td>DEFAULT TRUE</td><td>Account enablement toggle</td></tr>
      </tbody>
    </table>
  </div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>user_sessions</h3>
      <span class="desc">Active staff sessions with network IP and device fingerprinting</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">VARCHAR(128)</td><td>PRIMARY KEY</td><td>Session ID / Bearer token</td></tr>
        <tr><td><span class="pill-fk">FK</span>username</td><td class="type-code">VARCHAR(64)</td><td>REFERENCES staff_accounts</td><td>User associated with session</td></tr>
        <tr><td>ip_address</td><td class="type-code">VARCHAR(64)</td><td>NULL</td><td>Client IP address (resolved to LGU Intranet)</td></tr>
        <tr><td>device_name</td><td class="type-code">VARCHAR(128)</td><td>NULL</td><td>Friendly device name (e.g. 'Windows PC (Chrome)')</td></tr>
        <tr><td>device_type</td><td class="type-code">VARCHAR(32)</td><td>NULL</td><td>Form factor: desktop, mobile, tablet</td></tr>
        <tr><td>location_label</td><td class="type-code">VARCHAR(255)</td><td>NULL</td><td>Resolved physical network (e.g. 'Munisipyo ng Luisiana')</td></tr>
        <tr><td>expires_at</td><td class="type-code">TIMESTAMPTZ</td><td>NOT NULL</td><td>Session expiration timestamp (8-hour TTL)</td></tr>
      </tbody>
    </table>
  </div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>audit_logs & security_quarantine_logs</h3>
      <span class="desc">System activity audit trail & anti-malware quarantine</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">VARCHAR(64)</td><td>PRIMARY KEY</td><td>Log event ID</td></tr>
        <tr><td>actor_username</td><td class="type-code">VARCHAR(64)</td><td>NULL</td><td>User or service responsible for action</td></tr>
        <tr><td>action_type</td><td class="type-code">VARCHAR(64)</td><td>NOT NULL</td><td>Action type (LOGIN, CREATE, UPDATE, APPROVE, QUARANTINE)</td></tr>
        <tr><td>resource_type</td><td class="type-code">VARCHAR(64)</td><td>NOT NULL</td><td>Entity (APPLICATION, PROJECT, PROPOSAL, AUTH)</td></tr>
        <tr><td>details</td><td class="type-code">JSONB</td><td>DEFAULT '{}'</td><td>Structured payload diff / inspection details</td></tr>
        <tr><td>threat_type</td><td class="type-code">VARCHAR(128)</td><td>quarantine only</td><td>PDF_JAVASCRIPT, POLYGLOT, EXECUTABLE_ATTACHMENT</td></tr>
        <tr><td>created_at</td><td class="type-code">TIMESTAMPTZ</td><td>DEFAULT NOW()</td><td>Timestamp of event</td></tr>
      </tbody>
    </table>
  </div>

  <div class="page-break"></div>

  <!-- SECTION 4: CITIZEN APPLICATIONS & PERMITTING -->
  <div class="section-title">4. Citizen Applications & Permitting (Citizen's Charter)</div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>citizen_applications</h3>
      <span class="desc">Online zoning, land titling, and research permit applications</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">VARCHAR(64)</td><td>PRIMARY KEY</td><td>Unique system application ID</td></tr>
        <tr><td><span class="pill-uk">UK</span>tracking_number</td><td class="type-code">VARCHAR(64)</td><td>UNIQUE, NOT NULL</td><td>Public tracking number (e.g. 'LUIS-ZC-2026-9559')</td></tr>
        <tr><td>service_type</td><td class="type-code">VARCHAR(64)</td><td>NOT NULL</td><td>zoning_certificate, land_titling, planning_research</td></tr>
        <tr><td>category</td><td class="type-code">VARCHAR(64)</td><td>NOT NULL</td><td>private_infrastructure, agricultural, municipal_project</td></tr>
        <tr><td>status</td><td class="type-code">VARCHAR(64)</td><td>CHECK (status IN ...)</td><td>submitted, in_review, ocular_inspection, approved, etc.</td></tr>
        <tr><td>applicant_name</td><td class="type-code">VARCHAR(255)</td><td>NULL</td><td>Proponent / property owner name</td></tr>
        <tr><td>contact_phone / email</td><td class="type-code">VARCHAR(128)</td><td>NULL</td><td>Contact details for SMS / email notifications</td></tr>
        <tr><td>barangay</td><td class="type-code">VARCHAR(128)</td><td>NULL</td><td>Barangay where property is located</td></tr>
        <tr><td>latitude / longitude</td><td class="type-code">DOUBLE PRECISION</td><td>NULL</td><td>WGS84 GIS coordinates for spatial pinpointing</td></tr>
        <tr><td>estimated_cost</td><td class="type-code">NUMERIC(15,2)</td><td>DEFAULT 0</td><td>Estimated project / construction cost (PHP)</td></tr>
        <tr><td>lot_details</td><td class="type-code">JSONB</td><td>DEFAULT '{}'</td><td>TCT No., Tax Dec No., lot area sq.m., building type</td></tr>
        <tr><td>step_progress</td><td class="type-code">JSONB</td><td>DEFAULT '{}'</td><td>Citizen charter 5-step milestone tracking</td></tr>
        <tr><td>engineer_approved</td><td class="type-code">BOOLEAN</td><td>DEFAULT FALSE</td><td>Municipal Engineer verification flag for map pinning</td></tr>
        <tr><td>payment_status</td><td class="type-code">VARCHAR(64)</td><td>DEFAULT 'unpaid'</td><td>unpaid, order_of_payment_issued, paid</td></tr>
        <tr><td>or_number</td><td class="type-code">VARCHAR(128)</td><td>NULL</td><td>Official Receipt (O.R.) number from Municipal Treasury</td></tr>
        <tr><td>data_hash</td><td class="type-code">VARCHAR(64)</td><td>NULL</td><td>SHA-256 tamper-evident digital fingerprint</td></tr>
      </tbody>
    </table>
  </div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>site_inspection_photos & application_remarks</h3>
      <span class="desc">360° Street panoramas, side inspection photos, and staff remarks</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">VARCHAR(64)</td><td>PRIMARY KEY</td><td>Unique record ID</td></tr>
        <tr><td><span class="pill-fk">FK</span>application_id</td><td class="type-code">VARCHAR(64)</td><td>REFERENCES citizen_applications</td><td>Parent application foreign key (CASCADE delete)</td></tr>
        <tr><td>tracking_number</td><td class="type-code">VARCHAR(64)</td><td>NULL</td><td>Denormalized tracking number for indexed queries</td></tr>
        <tr><td>photo_url</td><td class="type-code">TEXT</td><td>photo table</td><td>File URL or storage path of site panorama</td></tr>
        <tr><td>photo_type</td><td class="type-code">VARCHAR(50)</td><td>photo table</td><td>'street_panorama' (360 view) or 'side_photo'</td></tr>
        <tr><td>stage</td><td class="type-code">VARCHAR(50)</td><td>photo table</td><td>Inspection stage: 'before', 'during', 'after'</td></tr>
        <tr><td>progress</td><td class="type-code">INT</td><td>photo table</td><td>Observed construction completion percentage (0-100)</td></tr>
        <tr><td>from_office</td><td class="type-code">VARCHAR(64)</td><td>remarks table</td><td>Office authoring remark: MPDC, Engineer, Treasury</td></tr>
        <tr><td>message</td><td class="type-code">TEXT</td><td>remarks table</td><td>Official message, deficiency note, or feedback</td></tr>
      </tbody>
    </table>
  </div>

  <div class="page-break"></div>

  <!-- SECTION 5: MUNICIPAL PROJECTS & 3D WEBGL -->
  <div class="section-title">5. Municipal Infrastructure Projects & 3D WebGL Visualization</div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>municipal_projects</h3>
      <span class="desc">Infrastructure, buildings, and spatial assets rendered on the 3D map</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">VARCHAR(64)</td><td>PRIMARY KEY</td><td>Project ID (e.g. 'PRJ-101', 'app-179007...')</td></tr>
        <tr><td>name</td><td class="type-code">VARCHAR(255)</td><td>NOT NULL</td><td>Project title (e.g. 'Luisiana RHU Expansion')</td></tr>
        <tr><td>model_type</td><td class="type-code">VARCHAR(64)</td><td>NOT NULL</td><td>3D Model: municipal_hall, rhu, school, road, bridge, barn</td></tr>
        <tr><td>type</td><td class="type-code">VARCHAR(64)</td><td>DEFAULT 'Municipal Project'</td><td>Classification: Municipal Project, Private Building, Agri</td></tr>
        <tr><td>department</td><td class="type-code">VARCHAR(64)</td><td>NOT NULL</td><td>Responsible department: MPDC, Engineering, Agriculture</td></tr>
        <tr><td>status</td><td class="type-code">VARCHAR(64)</td><td>CHECK (status IN ...)</td><td>Planned, Ongoing, Delayed, Completed, Suspended</td></tr>
        <tr><td>progress</td><td class="type-code">INT</td><td>0 - 100</td><td>Overall construction / execution progress %</td></tr>
        <tr><td>latitude / longitude</td><td class="type-code">DOUBLE PRECISION</td><td>NOT NULL</td><td>WGS84 coordinates of 3D asset anchor point</td></tr>
        <tr><td>rotation_yaw/pitch/roll</td><td class="type-code">DOUBLE PRECISION</td><td>DEFAULT 0</td><td>3D spatial rotations in degrees for Three.js alignment</td></tr>
        <tr><td>model_scale_x/y/z</td><td class="type-code">DOUBLE PRECISION</td><td>DEFAULT 1</td><td>World-space dimensions & scale multipliers</td></tr>
        <tr><td>model_height</td><td class="type-code">DOUBLE PRECISION</td><td>DEFAULT 0</td><td>Height offset above terrain in meters (0 = ground clamped)</td></tr>
        <tr><td>map_shape / map_sketch</td><td class="type-code">JSONB</td><td>NULL</td><td>Procedural shape footprints (polygons, lines, pins)</td></tr>
        <tr><td>budget_total / spent</td><td class="type-code">NUMERIC(15,2)</td><td>NULL</td><td>Allocated budget vs actual spent (PHP)</td></tr>
        <tr><td>contractor / funding</td><td class="type-code">VARCHAR(255)</td><td>NULL</td><td>Awarded contractor & funding source (20% DF, GenFund)</td></tr>
      </tbody>
    </table>
  </div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>project_milestones, project_issues, & project_photos</h3>
      <span class="desc">Milestone schedules, contractor delays, and drone progress photos</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">VARCHAR(64)</td><td>PRIMARY KEY</td><td>Record ID</td></tr>
        <tr><td><span class="pill-fk">FK</span>project_id</td><td class="type-code">VARCHAR(64)</td><td>REFERENCES municipal_projects</td><td>Parent project foreign key (CASCADE delete)</td></tr>
        <tr><td>title</td><td class="type-code">VARCHAR(255)</td><td>milestones / issues</td><td>Milestone name or bottleneck description</td></tr>
        <tr><td>target_date / completed_at</td><td class="type-code">DATE / TIMESTAMPTZ</td><td>milestones</td><td>Target delivery date & actual completion timestamp</td></tr>
        <tr><td>kind</td><td class="type-code">VARCHAR(32)</td><td>issues / photos</td><td>'delay' / 'issue' OR photo kind: 'site' / 'progress'</td></tr>
        <tr><td>photo_url</td><td class="type-code">TEXT</td><td>photos</td><td>Image asset storage path</td></tr>
        <tr><td>latitude / longitude</td><td class="type-code">DOUBLE PRECISION</td><td>photos</td><td>Inspector GPS position when photo was captured</td></tr>
      </tbody>
    </table>
  </div>

  <div class="page-break"></div>

  <!-- SECTION 6: COLLABORATIVE PLANNING & DOCUMENTS -->
  <div class="section-title">6. Collaborative Planning, DMS & Citizen Engagement</div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>planning_proposals, comments, & approvals</h3>
      <span class="desc">Inter-office project proposals, committee reviews, and voting</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">VARCHAR(64)</td><td>PRIMARY KEY</td><td>Proposal ID (e.g. 'prop-101')</td></tr>
        <tr><td>title</td><td class="type-code">VARCHAR(255)</td><td>NOT NULL</td><td>Proposal title</td></tr>
        <tr><td>priority</td><td class="type-code">INT</td><td>CHECK (1 - 5)</td><td>Priority rating: 1 (Lowest) to 5 (Critical Emergency)</td></tr>
        <tr><td>status</td><td class="type-code">VARCHAR(64)</td><td>CHECK (status IN ...)</td><td>draft, submitted, in_review, recommended, approved, rejected</td></tr>
        <tr><td>request_kind</td><td class="type-code">VARCHAR(64)</td><td>DEFAULT 'office_proposal'</td><td>barangay_request, office_proposal, zoning_certificate</td></tr>
        <tr><td><span class="pill-fk">FK</span>submitter_username</td><td class="type-code">VARCHAR(64)</td><td>NOT NULL</td><td>Author staff account username</td></tr>
        <tr><td>needs_assessment</td><td class="type-code">JSONB</td><td>DEFAULT '{}'</td><td>Population served, hazard exposure, urgency notes</td></tr>
        <tr><td>recommendation_score</td><td class="type-code">DOUBLE PRECISION</td><td>NULL</td><td>AI / committee calculated multi-criteria score</td></tr>
      </tbody>
    </table>
  </div>

  <div class="table-container">
    <div class="table-header-bar">
      <h3>municipal_documents & citizen_engagements</h3>
      <span class="desc">Official DMS records (CLUP, AIP) and public feedback</span>
    </div>
    <table>
      <thead>
        <tr><th>Column</th><th>Data Type</th><th>Constraints</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="pill-pk">PK</span>id</td><td class="type-code">VARCHAR(64)</td><td>PRIMARY KEY</td><td>Document or Engagement submission ID</td></tr>
        <tr><td>category</td><td class="type-code">VARCHAR(64)</td><td>NOT NULL</td><td>CLUP, CDP, LDIP, AIP, engineering_drawing, permit</td></tr>
        <tr><td>file_url / file_name</td><td class="type-code">TEXT / VARCHAR</td><td>documents</td><td>Secure file download path and filename</td></tr>
        <tr><td>version</td><td class="type-code">INT</td><td>DEFAULT 1</td><td>Revision version number with version history table</td></tr>
        <tr><td>kind</td><td class="type-code">VARCHAR(32)</td><td>engagements</td><td>Public submission kind: 'feedback', 'issue', 'suggestion'</td></tr>
        <tr><td>status</td><td class="type-code">VARCHAR(32)</td><td>engagements</td><td>Review state: 'new', 'reviewing', 'resolved', 'dismissed'</td></tr>
        <tr><td>staff_note</td><td class="type-code">TEXT</td><td>engagements</td><td>Official internal LGU response notes</td></tr>
      </tbody>
    </table>
  </div>

  <div class="footer-note">
    Document Generated Automatically for the Municipality of Luisiana, Laguna • LUISIANA INFA-TRACK v1.2.0 • PostgreSQL Enterprise Schema
  </div>

</body>
</html>
`;

async function generatePdf() {
  console.log("Writing temporary HTML rendering file...");
  fs.writeFileSync(TEMP_HTML, htmlContent, "utf8");

  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const fileUrl = "file:///" + TEMP_HTML.replace(/\\/g, "/");

  console.log(`Generating PDF at: ${OUTPUT_PDF}`);

  const proc = spawn(edgePath, [
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${OUTPUT_PDF}`,
    fileUrl,
  ]);

  proc.on("close", (code) => {
    if (fs.existsSync(TEMP_HTML)) {
      fs.unlinkSync(TEMP_HTML);
    }

    if (code === 0 && fs.existsSync(OUTPUT_PDF)) {
      const stats = fs.statSync(OUTPUT_PDF);
      console.log(`\n==================================================================`);
      console.log(`  PDF GENERATED SUCCESSFULLY!`);
      console.log(`  File: ${OUTPUT_PDF}`);
      console.log(`  Size: ${(stats.size / 1024).toFixed(1)} KB`);
      console.log(`==================================================================\n`);
      process.exit(0);
    } else {
      console.error(`Failed to generate PDF. Exit code: ${code}`);
      process.exit(1);
    }
  });
}

generatePdf();
