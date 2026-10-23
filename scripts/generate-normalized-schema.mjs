import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// 1. GENERATE NORMALIZED SQL (3NF)
// ---------------------------------------------------------------------------
const normalizedSql = `-- =============================================================================
-- NORMALIZED 3NF DATABASE SCHEMA: CITIZEN PERMITS & LICENSING
-- Municipality of Luisiana, Province of Laguna (PSGC: 0403412000)
-- Target RDBMS: PostgreSQL 14+
-- Normalization: 3rd Normal Form (3NF) - No God Tables, No Duplication
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Auto-update updated_at timestamp function
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. CITIZEN PROFILES / APPLICANTS (Hiwalay ang Personal Info)
CREATE TABLE IF NOT EXISTS applicants (
    id VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(128),
    contact_email VARCHAR(128),
    address TEXT,
    barangay VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CORE PERMIT APPLICATIONS (Core Workflow Only)
CREATE TABLE IF NOT EXISTS citizen_applications (
    id VARCHAR(64) PRIMARY KEY,
    tracking_number VARCHAR(64) UNIQUE NOT NULL,
    applicant_id VARCHAR(64) NOT NULL REFERENCES applicants(id) ON DELETE RESTRICT,
    service_type VARCHAR(64) NOT NULL DEFAULT 'zoning_certificate',
    category VARCHAR(64) NOT NULL DEFAULT 'private_infrastructure',
    status VARCHAR(64) NOT NULL DEFAULT 'submitted',
    project_title VARCHAR(255),
    estimated_cost NUMERIC(15, 2) DEFAULT 0,
    sla_days INT DEFAULT 1,
    sla_minutes INT DEFAULT 12,
    fee_category VARCHAR(64) DEFAULT 'None (Free)',
    notes TEXT,
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_app_status CHECK (status IN (
        'submitted', 'in_review', 'ocular_inspection', 'for_assessment',
        'for_payment', 'for_engineering_inspection', 'approved_for_construction',
        'approved', 'completed', 'flagged', 'returned', 'rejected', 'denied'
    ))
);

-- 3. PROPERTY & GIS LOCATION DETAILS (Hiwalay ang Lupa at GIS)
CREATE TABLE IF NOT EXISTS application_locations (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) UNIQUE NOT NULL REFERENCES citizen_applications(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    barangay VARCHAR(128),
    lot_area_sqm NUMERIC(10, 2),
    lot_location_description TEXT,
    zoning_classification VARCHAR(64) DEFAULT 'Rural Zone',
    tct_no VARCHAR(128),
    tax_dec_no VARCHAR(128),
    lot_owner VARCHAR(255),
    is_applicant_owner BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TREASURY PAYMENTS & ASSESSMENTS (Hiwalay ang Resibo at Kwenta)
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

-- 5. ENGINEERING REVIEW & PERMIT VERIFICATION (Hiwalay ang Pirma ng Engineer)
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

-- 6. UPLOADED ATTACHMENTS & CLEARANCES
CREATE TABLE IF NOT EXISTS application_documents (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL REFERENCES citizen_applications(id) ON DELETE CASCADE,
    document_type VARCHAR(64) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT,
    mime_type VARCHAR(128),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. OCULAR SITE INSPECTION & STREET VIEW PHOTOS
CREATE TABLE IF NOT EXISTS site_inspection_photos (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL REFERENCES citizen_applications(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    photo_type VARCHAR(50) DEFAULT 'street_panorama',
    stage VARCHAR(50) DEFAULT 'during',
    progress INT DEFAULT 0,
    remarks TEXT,
    inspector VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. INTER-OFFICE STAFF REMARKS & APPLICANT NOTICES
CREATE TABLE IF NOT EXISTS application_remarks (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL REFERENCES citizen_applications(id) ON DELETE CASCADE,
    from_office VARCHAR(64) DEFAULT 'MPDC',
    author VARCHAR(255),
    message TEXT NOT NULL,
    requires_action BOOLEAN DEFAULT FALSE,
    attached_file VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. USER PRIVACY & TERMS CONSENTS
CREATE TABLE IF NOT EXISTS user_terms_consents (
    id VARCHAR(64) PRIMARY KEY,
    ip_address VARCHAR(64),
    user_agent TEXT,
    terms_version VARCHAR(32) DEFAULT '2026.1',
    agreed_terms BOOLEAN DEFAULT TRUE,
    agreed_privacy BOOLEAN DEFAULT TRUE,
    agreed_cookies BOOLEAN DEFAULT TRUE,
    applicant_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_norm_ca_tracking ON citizen_applications(tracking_number);
CREATE INDEX IF NOT EXISTS idx_norm_ca_status ON citizen_applications(status);
CREATE INDEX IF NOT EXISTS idx_norm_ca_applicant ON citizen_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_norm_loc_app ON application_locations(application_id);
CREATE INDEX IF NOT EXISTS idx_norm_pay_app ON application_payments(application_id);
CREATE INDEX IF NOT EXISTS idx_norm_eng_app ON engineering_reviews(application_id);

-- TRIGGERS
DROP TRIGGER IF EXISTS trg_update_applicants ON applicants;
CREATE TRIGGER trg_update_applicants BEFORE UPDATE ON applicants
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trg_update_norm_ca ON citizen_applications;
CREATE TRIGGER trg_update_norm_ca BEFORE UPDATE ON citizen_applications
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- BACKWARD-COMPATIBILITY VIEW (Pagsasama-samahin pa rin via SQL VIEW kung may lumang query)
CREATE OR REPLACE VIEW v_citizen_applications_full AS
SELECT 
    ca.id,
    ca.tracking_number,
    ca.service_type,
    ca.category,
    ca.status,
    a.full_name AS applicant_name,
    a.contact_phone,
    a.contact_email,
    a.address,
    a.barangay,
    ca.project_title,
    loc.latitude,
    loc.longitude,
    ca.estimated_cost,
    loc.zoning_classification,
    loc.lot_area_sqm,
    loc.tct_no,
    loc.tax_dec_no,
    eng.engineer_approved,
    eng.engineer_approved_at,
    eng.engineer_approved_by,
    eng.held_at,
    eng.hold_reason,
    pay.payment_status,
    pay.or_number,
    pay.amount_paid,
    pay.payment_date,
    ca.data_hash,
    ca.created_at,
    ca.updated_at
FROM citizen_applications ca
LEFT JOIN applicants a ON ca.applicant_id = a.id
LEFT JOIN application_locations loc ON ca.id = loc.application_id
LEFT JOIN application_payments pay ON ca.id = pay.application_id
LEFT JOIN engineering_reviews eng ON ca.id = eng.application_id;

COMMIT;
`;

fs.writeFileSync(path.join(ROOT_DIR, "luisiana_normalized_schema.sql"), normalizedSql, "utf8");

// ---------------------------------------------------------------------------
// 2. GENERATE NORMALIZED DRAW.IO XML (LANDSCAPE, BALANCED)
// ---------------------------------------------------------------------------

function escapeXml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildTableXml({ tableId, title, x, y, width, columns, headerColor = "#0284c7", strokeColor = "#0369a1" }) {
  const rowHeight = 22;
  const startSize = 28;
  const totalHeight = startSize + columns.length * rowHeight;

  let out = `
    <!-- TABLE: ${escapeXml(title)} -->
    <mxCell id="${tableId}" value="${escapeXml(title)}" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=${startSize};horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;fillColor=${headerColor};strokeColor=${strokeColor};fontColor=#ffffff;rounded=1;arcSize=3;shadow=1;" vertex="1" parent="1">
      <mxGeometry x="${x}" y="${y}" width="${width}" height="${totalHeight}" as="geometry" />
    </mxCell>`;

  columns.forEach((col, idx) => {
    let prefix = "";
    let colorStyle = "";
    if (col.pk) {
      prefix = "&lt;b style=&quot;color:#1e40af;&quot;&gt;[PK]&lt;/b&gt; ";
      colorStyle = "background-color:#eff6ff;";
    } else if (col.fk) {
      prefix = "&lt;b style=&quot;color:#b45309;&quot;&gt;[FK]&lt;/b&gt; ";
      colorStyle = "background-color:#fefce8;";
    } else if (col.uk) {
      prefix = "&lt;b style=&quot;color:#15803d;&quot;&gt;[UK]&lt;/b&gt; ";
      colorStyle = "background-color:#f0fdf4;";
    }

    const label = `${prefix}${escapeXml(col.name)} : &lt;i style=&quot;color:#475569;&quot;&gt;${escapeXml(col.type)}&lt;/i&gt;`;
    const rowY = startSize + idx * rowHeight;

    out += `
    <mxCell id="${tableId}_col_${idx}" value="${label}" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=8;spacingRight=8;overflow=hidden;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;rotatable=0;whiteSpace=wrap;html=1;fontFamily=monospace;fontSize=10;${colorStyle}" vertex="1" parent="${tableId}">
      <mxGeometry y="${rowY}" width="${width}" height="${rowHeight}" as="geometry" />
    </mxCell>`;
  });

  return out;
}

// Table Definitions
const tApplicants = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { name: "full_name", type: "VARCHAR(255)" },
  { name: "contact_phone", type: "VARCHAR(128)" },
  { name: "contact_email", type: "VARCHAR(128)" },
  { name: "address", type: "TEXT" },
  { name: "barangay", type: "VARCHAR(128)" },
  { name: "created_at", type: "TIMESTAMPTZ" },
];

const tApplications = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { uk: true, name: "tracking_number", type: "VARCHAR(64)" },
  { fk: true, name: "applicant_id", type: "VARCHAR(64)" },
  { name: "service_type", type: "VARCHAR(64)" },
  { name: "category", type: "VARCHAR(64)" },
  { name: "status", type: "VARCHAR(64)" },
  { name: "project_title", type: "VARCHAR(255)" },
  { name: "estimated_cost", type: "NUMERIC(15,2)" },
  { name: "sla_days", type: "INT" },
  { name: "data_hash", type: "VARCHAR(64)" },
  { name: "created_at", type: "TIMESTAMPTZ" },
];

const tLocations = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { fk: true, name: "application_id", type: "VARCHAR(64)" },
  { name: "latitude", type: "DOUBLE PRECISION" },
  { name: "longitude", type: "DOUBLE PRECISION" },
  { name: "lot_area_sqm", type: "NUMERIC(10,2)" },
  { name: "zoning_classification", type: "VARCHAR(64)" },
  { name: "tct_no", type: "VARCHAR(128)" },
  { name: "tax_dec_no", type: "VARCHAR(128)" },
  { name: "lot_owner", type: "VARCHAR(255)" },
];

const tPayments = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { fk: true, name: "application_id", type: "VARCHAR(64)" },
  { name: "payment_status", type: "VARCHAR(64)" },
  { name: "order_of_payment_no", type: "VARCHAR(128)" },
  { name: "amount_due", type: "NUMERIC(15,2)" },
  { name: "or_number", type: "VARCHAR(128)" },
  { name: "amount_paid", type: "NUMERIC(15,2)" },
  { name: "payment_date", type: "TIMESTAMPTZ" },
  { name: "cashier", type: "VARCHAR(255)" },
];

const tReviews = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { fk: true, name: "application_id", type: "VARCHAR(64)" },
  { name: "engineer_approved", type: "BOOLEAN" },
  { name: "engineer_approved_at", type: "TIMESTAMPTZ" },
  { name: "engineer_approved_by", type: "VARCHAR(255)" },
  { name: "is_pinned", type: "BOOLEAN" },
  { name: "held_at", type: "TIMESTAMPTZ" },
  { name: "hold_reason", type: "TEXT" },
  { name: "occupancy_ready", type: "BOOLEAN" },
];

const tPhotos = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { fk: true, name: "application_id", type: "VARCHAR(64)" },
  { name: "photo_url", type: "TEXT" },
  { name: "photo_type", type: "VARCHAR(50)" },
  { name: "stage", type: "VARCHAR(50)" },
  { name: "progress", type: "INT" },
  { name: "inspector", type: "VARCHAR(255)" },
  { name: "created_at", type: "TIMESTAMPTZ" },
];

const tRemarks = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { fk: true, name: "application_id", type: "VARCHAR(64)" },
  { name: "from_office", type: "VARCHAR(64)" },
  { name: "author", type: "VARCHAR(255)" },
  { name: "message", type: "TEXT" },
  { name: "requires_action", type: "BOOLEAN" },
  { name: "created_at", type: "TIMESTAMPTZ" },
];

const tDocuments = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { fk: true, name: "application_id", type: "VARCHAR(64)" },
  { name: "document_type", type: "VARCHAR(64)" },
  { name: "original_filename", type: "VARCHAR(255)" },
  { name: "file_url", type: "TEXT" },
  { name: "uploaded_at", type: "TIMESTAMPTZ" },
];

// Layout Positioning (3 Rows x 3 Columns - Landscape Elegance)
const xmlApplicants = buildTableXml({
  tableId: "tbl_applicants",
  title: "1. applicants (Profiles)",
  x: 60,
  y: 80,
  width: 290,
  columns: tApplicants,
  headerColor: "#4338ca",
  strokeColor: "#3730a3",
});

const xmlApplications = buildTableXml({
  tableId: "tbl_applications",
  title: "2. citizen_applications (Core)",
  x: 420,
  y: 80,
  width: 320,
  columns: tApplications,
  headerColor: "#0f766e",
  strokeColor: "#115e59",
});

const xmlLocations = buildTableXml({
  tableId: "tbl_locations",
  title: "3. application_locations (GIS)",
  x: 810,
  y: 80,
  width: 310,
  columns: tLocations,
  headerColor: "#0284c7",
  strokeColor: "#0369a1",
});

const xmlPayments = buildTableXml({
  tableId: "tbl_payments",
  title: "4. application_payments (Treasury)",
  x: 60,
  y: 380,
  width: 310,
  columns: tPayments,
  headerColor: "#15803d",
  strokeColor: "#166534",
});

const xmlReviews = buildTableXml({
  tableId: "tbl_reviews",
  title: "5. engineering_reviews (Evaluation)",
  x: 420,
  y: 420,
  width: 320,
  columns: tReviews,
  headerColor: "#b45309",
  strokeColor: "#92400e",
});

const xmlPhotos = buildTableXml({
  tableId: "tbl_photos",
  title: "6. site_inspection_photos (Photos)",
  x: 810,
  y: 380,
  width: 310,
  columns: tPhotos,
  headerColor: "#b91c1c",
  strokeColor: "#991b1b",
});

const xmlRemarks = buildTableXml({
  tableId: "tbl_remarks",
  title: "7. application_remarks (Notes)",
  x: 1190,
  y: 80,
  width: 300,
  columns: tRemarks,
  headerColor: "#475569",
  strokeColor: "#334155",
});

const xmlDocuments = buildTableXml({
  tableId: "tbl_documents",
  title: "8. application_documents (Files)",
  x: 1190,
  y: 380,
  width: 300,
  columns: tDocuments,
  headerColor: "#6b21a8",
  strokeColor: "#581c87",
});

const drawioXml = `<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="Antigravity" version="21.0.0" type="device">
  <diagram id="normalized-schema" name="3NF Normalized Relational Schema">
    <mxGraphModel dx="1800" dy="1100" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1920" pageHeight="1080" background="#f8fafc" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- BANNER -->
        <mxCell id="title_banner" value="&lt;h2 style=&quot;margin:0;color:#0f172a;&quot;&gt;LUISIANA INFA-TRACK — Normalized Relational Database Architecture (3NF)&lt;/h2&gt;&lt;p style=&quot;margin:4px 0 0 0;color:#0284c7;font-weight:600;&quot;&gt;Clean Relational Separation: Citizen Profiles ➔ Applications ➔ GIS Lots ➔ Treasury Payments ➔ Engineering Reviews&lt;/p&gt;" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;" vertex="1" parent="1">
          <mxGeometry x="60" y="20" width="1200" height="40" as="geometry" />
        </mxCell>

        ${xmlApplicants}
        ${xmlApplications}
        ${xmlLocations}
        ${xmlPayments}
        ${xmlReviews}
        ${xmlPhotos}
        ${xmlRemarks}
        ${xmlDocuments}

        <!-- 1. applicants -> citizen_applications -->
        <mxCell id="rel_app_to_ca" value="1 : N" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#4338ca;strokeWidth=2;fontSize=10;fontColor:#1e1b4b;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="tbl_applicants_col_0" target="tbl_applications_col_2">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- 2. citizen_applications -> application_locations -->
        <mxCell id="rel_ca_to_loc" value="1 : 1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#0284c7;strokeWidth=2;fontSize=10;fontColor:#082f49;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="tbl_applications_col_0" target="tbl_locations_col_1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- 3. citizen_applications -> application_payments -->
        <mxCell id="rel_ca_to_pay" value="1 : 1 / N" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#15803d;strokeWidth=2;fontSize=10;fontColor:#052e16;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="tbl_applications_col_0" target="tbl_payments_col_1">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="400" y="108" />
              <mxPoint x="400" y="430" />
            </Array>
          </mxGeometry>
        </mxCell>

        <!-- 4. citizen_applications -> engineering_reviews -->
        <mxCell id="rel_ca_to_eng" value="1 : 1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#b45309;strokeWidth=2;fontSize=10;fontColor:#451a03;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="tbl_applications_col_0" target="tbl_reviews_col_1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- 5. citizen_applications -> site_inspection_photos -->
        <mxCell id="rel_ca_to_photos" value="1 : N" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#b91c1c;strokeWidth=2;fontSize=10;fontColor:#450a0a;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="tbl_applications_col_0" target="tbl_photos_col_1">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="760" y="108" />
              <mxPoint x="760" y="430" />
            </Array>
          </mxGeometry>
        </mxCell>

        <!-- 6. citizen_applications -> application_remarks -->
        <mxCell id="rel_ca_to_rem" value="1 : N" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#475569;strokeWidth=2;fontSize=10;fontColor:#0f172a;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="tbl_applications_col_0" target="tbl_remarks_col_1">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="770" y="108" />
              <mxPoint x="770" y="60" />
              <mxPoint x="1160" y="60" />
              <mxPoint x="1160" y="130" />
            </Array>
          </mxGeometry>
        </mxCell>

        <!-- 7. citizen_applications -> application_documents -->
        <mxCell id="rel_ca_to_docs" value="1 : N" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#6b21a8;strokeWidth=2;fontSize=10;fontColor:#3b0764;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="tbl_applications_col_0" target="tbl_documents_col_1">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="770" y="108" />
              <mxPoint x="770" y="360" />
              <mxPoint x="1160" y="360" />
              <mxPoint x="1160" y="430" />
            </Array>
          </mxGeometry>
        </mxCell>

      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

fs.writeFileSync(path.join(ROOT_DIR, "luisiana_normalized_schema.drawio"), drawioXml, "utf8");
fs.writeFileSync(path.join(ROOT_DIR, "luisiana_normalized_schema.xml"), drawioXml, "utf8");

console.log("Successfully generated:");
console.log("- luisiana_normalized_schema.sql");
console.log("- luisiana_normalized_schema.drawio");
console.log("- luisiana_normalized_schema.xml");
