-- =============================================================================
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
