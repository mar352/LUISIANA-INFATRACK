BEGIN;

-- =============================================================================
-- DATABASE SCHEMA: LUISIANA INFA-TRACK (IMPACT-LUISIANA)
-- Municipality: Municipality of Luisiana, Province of Laguna (PSGC: 0403412000)
-- Target RDBMS: PostgreSQL 14+ with PostGIS & JSONB support
-- Architecture: 3rd Normal Form (3NF) Clean Relational Schema
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 0. TRIGGER FUNCTION: AUTO-UPDATE updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. SYSTEM CONFIGURATION & MASTERLISTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS barangays (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    zone VARCHAR(64) NOT NULL DEFAULT 'Rural Zone',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_config (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'master_config',
    version VARCHAR(32) NOT NULL DEFAULT '1.2.0',
    maintenance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    maintenance_message TEXT,
    maintenance_estimated_duration VARCHAR(64),
    maintenance_updated_by VARCHAR(128),
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_masterlists (
    id VARCHAR(64) PRIMARY KEY,
    category VARCHAR(64) NOT NULL,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    zone_group VARCHAR(64),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_masterlist_cat_code UNIQUE (category, code)
);

-- =============================================================================
-- 2. AUTHENTICATION, ROLES & AUDIT LOGS (RBAC)
-- =============================================================================

CREATE TABLE IF NOT EXISTS staff_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    employee_id VARCHAR(64),
    role VARCHAR(64) NOT NULL,
    department VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    iterations INT NOT NULL DEFAULT 120000,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    last_failed_at TIMESTAMPTZ,
    last_failed_ip VARCHAR(64),
    last_failed_device VARCHAR(128),
    last_failed_location VARCHAR(255),
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_staff_role CHECK (role IN (
        'Super Admin', 'MPDC', 'Engineer', 'Agriculture',
        'Treasury Office', 'Negosyo Center', 'Assessor',
        'Barangay Official', 'Private Engineer', 'Viewer'
    ))
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(128) PRIMARY KEY,
    username VARCHAR(64) NOT NULL REFERENCES staff_accounts(username) ON DELETE CASCADE,
    role VARCHAR(64) NOT NULL,
    department VARCHAR(255),
    ip_address VARCHAR(64),
    user_agent TEXT,
    device_name VARCHAR(128),
    device_type VARCHAR(32),
    location_label VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    actor_username VARCHAR(64),
    actor_role VARCHAR(64),
    action_type VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128),
    ip_address VARCHAR(64),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_quarantine_logs (
    id VARCHAR(64) PRIMARY KEY,
    original_filename VARCHAR(255) NOT NULL,
    quarantined_path TEXT NOT NULL,
    threat_type VARCHAR(128) NOT NULL,
    file_sha256 VARCHAR(64) NOT NULL,
    file_size_bytes BIGINT,
    mime_type VARCHAR(128),
    uploaded_by VARCHAR(128),
    tracking_number VARCHAR(64),
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 3. NORMALIZED CITIZEN APPLICATIONS (3NF DECOMPOSITION)
-- =============================================================================

-- 3.1 CITIZEN APPLICANT PROFILES
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

-- 3.2 PRIVACY & TERMS CONSENTS
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

-- 3.3 AUTOMATIC MIGRATION: Convert old monolithic table if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'citizen_applications' AND column_name = 'applicant_name'
    ) THEN
        -- Backup old records
        CREATE TABLE IF NOT EXISTS _old_citizen_applications AS SELECT * FROM citizen_applications;
        
        -- Migrate to applicants
        INSERT INTO applicants (id, full_name, contact_phone, contact_email, address, barangay, created_at, updated_at)
        SELECT DISTINCT
            'app-user-' || id,
            COALESCE(NULLIF(applicant_name, ''), 'Applicant'),
            contact_phone,
            contact_email,
            address,
            COALESCE(NULLIF(barangay, ''), 'Poblacion'),
            created_at,
            updated_at
        FROM _old_citizen_applications
        ON CONFLICT (id) DO NOTHING;

        -- Clean monolithic columns
        ALTER TABLE citizen_applications ADD COLUMN IF NOT EXISTS applicant_id VARCHAR(64);
        UPDATE citizen_applications SET applicant_id = 'app-user-' || id WHERE applicant_id IS NULL;
        
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS applicant_name CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS contact_phone CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS contact_email CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS address CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS barangay CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS latitude CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS longitude CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS lot_details CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS geo_risk CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS agricultural_details CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS municipal_details CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS zoning_classification CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS engineer_approved CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS engineer_approved_at CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS engineer_approved_by CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS is_pinned CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS held_at CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS held_by CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS hold_reason CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS payment_status CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS or_number CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS amount_paid CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS payment_date CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS terms_accepted CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS terms_accepted_at CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS terms_version CASCADE;
        ALTER TABLE citizen_applications DROP COLUMN IF EXISTS terms_consent_details CASCADE;
        
        DROP TABLE IF EXISTS _old_citizen_applications;
    END IF;
END $$;

-- 3.4 CORE PERMIT APPLICATIONS (Normalized Table)
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
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_app_status CHECK (status IN (
        'submitted', 'in_review', 'ocular_inspection', 'for_assessment',
        'for_payment', 'for_engineering_inspection', 'approved_for_construction',
        'approved', 'completed', 'flagged', 'returned', 'rejected', 'denied'
    ))
);

-- 3.5 PROPERTY & GIS LOCATION DETAILS
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

-- 3.6 TREASURY PAYMENTS & ASSESSMENTS
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

-- 3.7 ENGINEERING REVIEW & PERMIT VERIFICATION
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

-- 3.8 APPLICATION DOCUMENTS
CREATE TABLE IF NOT EXISTS application_documents (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL REFERENCES citizen_applications(id) ON DELETE CASCADE,
    document_type VARCHAR(64) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT,
    mime_type VARCHAR(128),
    tag VARCHAR(64),
    is_quarantined BOOLEAN DEFAULT FALSE,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.9 APPLICATION REMARKS
CREATE TABLE IF NOT EXISTS application_remarks (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL REFERENCES citizen_applications(id) ON DELETE CASCADE,
    tracking_number VARCHAR(64),
    from_office VARCHAR(64) NOT NULL DEFAULT 'MPDC',
    author VARCHAR(255),
    message TEXT NOT NULL,
    requires_action BOOLEAN DEFAULT FALSE,
    attached_file VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.10 SITE INSPECTION PHOTOS
CREATE TABLE IF NOT EXISTS site_inspection_photos (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL REFERENCES citizen_applications(id) ON DELETE CASCADE,
    tracking_number VARCHAR(64),
    photo_url TEXT NOT NULL,
    photo_type VARCHAR(50) NOT NULL DEFAULT 'street_panorama',
    stage VARCHAR(50) NOT NULL DEFAULT 'during',
    progress INT DEFAULT 0,
    remarks TEXT,
    inspector VARCHAR(255) DEFAULT 'Municipal Engineer',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 4. INFRASTRUCTURE & 3D WEBGL MAP PROJECTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS municipal_projects (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    model_type VARCHAR(64) NOT NULL DEFAULT 'office',
    type VARCHAR(64) NOT NULL DEFAULT 'Municipal Project',
    department VARCHAR(64) NOT NULL DEFAULT 'MPDC',
    status VARCHAR(64) NOT NULL DEFAULT 'Planned',
    progress INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    lifecycle_phase VARCHAR(64) NOT NULL DEFAULT 'Planning',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    rotation_yaw DOUBLE PRECISION DEFAULT 0,
    rotation_pitch DOUBLE PRECISION DEFAULT 0,
    rotation_roll DOUBLE PRECISION DEFAULT 0,
    model_scale_x DOUBLE PRECISION DEFAULT 1,
    model_scale_y DOUBLE PRECISION DEFAULT 1,
    model_scale_z DOUBLE PRECISION DEFAULT 1,
    model_height DOUBLE PRECISION DEFAULT 0,
    model_locked BOOLEAN DEFAULT FALSE,
    hide_badge BOOLEAN DEFAULT FALSE,
    site_marker_only BOOLEAN DEFAULT FALSE,
    marker_color VARCHAR(32),
    custom_model_url TEXT,
    map_shape JSONB,
    map_sketch JSONB,
    description TEXT,
    start_date DATE,
    target_end_date DATE,
    barangay VARCHAR(128),
    funding_source VARCHAR(128),
    contractor VARCHAR(255),
    budget_total NUMERIC(15, 2),
    budget_spent NUMERIC(15, 2) DEFAULT 0,
    official_url TEXT,
    is_private_application BOOLEAN DEFAULT FALSE,
    tracking_number VARCHAR(64),
    applicant_name VARCHAR(255),
    application_id VARCHAR(64) REFERENCES citizen_applications(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_proj_status CHECK (status IN ('Planned', 'Ongoing', 'Delayed', 'Completed', 'Suspended')),
    CONSTRAINT chk_proj_lifecycle CHECK (lifecycle_phase IN (
        'Planning', 'Procurement', 'Construction', 'Inspection', 'Turnover', 'Maintenance', 'Decommissioned'
    ))
);

CREATE TABLE IF NOT EXISTS project_milestones (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES municipal_projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    target_date DATE NOT NULL,
    completed_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_issues (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES municipal_projects(id) ON DELETE CASCADE,
    kind VARCHAR(32) NOT NULL DEFAULT 'issue',
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS project_photos (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES municipal_projects(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    caption TEXT,
    kind VARCHAR(32) NOT NULL DEFAULT 'progress',
    milestone_id VARCHAR(64) REFERENCES project_milestones(id) ON DELETE SET NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    inspector VARCHAR(255),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(64) NOT NULL REFERENCES municipal_projects(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 5. COLLABORATIVE PLANNING & INTER-OFFICE GOVERNANCE
-- =============================================================================

CREATE TABLE IF NOT EXISTS planning_proposals (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    department VARCHAR(64) NOT NULL,
    barangay VARCHAR(128),
    priority INT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    status VARCHAR(64) NOT NULL DEFAULT 'draft',
    request_kind VARCHAR(64) DEFAULT 'office_proposal',
    linked_project_id VARCHAR(64) REFERENCES municipal_projects(id) ON DELETE SET NULL,
    citizen_application_id VARCHAR(64) REFERENCES citizen_applications(id) ON DELETE SET NULL,
    citizen_tracking_number VARCHAR(64),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    submitter_username VARCHAR(64) NOT NULL,
    submitter_role VARCHAR(64) NOT NULL,
    assignees JSONB DEFAULT '[]'::jsonb,
    committee_id VARCHAR(64),
    needs_assessment JSONB DEFAULT '{}'::jsonb,
    recommendation_score DOUBLE PRECISION,
    recommendation_reasons JSONB DEFAULT '[]'::jsonb,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_plan_status CHECK (status IN (
        'draft', 'submitted', 'in_review', 'recommended', 'approved', 'returned', 'rejected'
    ))
);

CREATE TABLE IF NOT EXISTS proposal_comments (
    id VARCHAR(64) PRIMARY KEY,
    proposal_id VARCHAR(64) NOT NULL REFERENCES planning_proposals(id) ON DELETE CASCADE,
    author_username VARCHAR(64) NOT NULL,
    author_role VARCHAR(64) NOT NULL,
    body TEXT NOT NULL,
    anchor_kind VARCHAR(32),
    anchor_label VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposal_approvals (
    id VARCHAR(64) PRIMARY KEY,
    proposal_id VARCHAR(64) NOT NULL REFERENCES planning_proposals(id) ON DELETE CASCADE,
    username VARCHAR(64) NOT NULL,
    role VARCHAR(64) NOT NULL,
    decision VARCHAR(32) NOT NULL,
    note TEXT,
    decided_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposal_votes (
    id VARCHAR(64) PRIMARY KEY,
    proposal_id VARCHAR(64) NOT NULL REFERENCES planning_proposals(id) ON DELETE CASCADE,
    username VARCHAR(64) NOT NULL,
    role VARCHAR(64) NOT NULL,
    choice VARCHAR(32) NOT NULL,
    note TEXT,
    voted_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_proposal_user_vote UNIQUE (proposal_id, username)
);

CREATE TABLE IF NOT EXISTS planning_events (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    attendees JSONB DEFAULT '[]'::jsonb,
    proposal_ids JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planning_meetings (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    held_at TIMESTAMPTZ NOT NULL,
    attendees JSONB DEFAULT '[]'::jsonb,
    agenda TEXT,
    minutes TEXT,
    decisions JSONB DEFAULT '[]'::jsonb,
    proposal_ids JSONB DEFAULT '[]'::jsonb,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 6. MUNICIPAL DOCUMENT MANAGEMENT SYSTEM (DMS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS municipal_documents (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    description TEXT,
    year INT NOT NULL,
    barangay VARCHAR(128),
    tags JSONB DEFAULT '[]'::jsonb,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    uploaded_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_versions (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES municipal_documents(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    uploaded_by VARCHAR(255) NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_doc_version UNIQUE (document_id, version_number)
);

-- =============================================================================
-- 7. CITIZEN ENGAGEMENT & DISASTER ALERTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS citizen_engagements (
    id VARCHAR(64) PRIMARY KEY,
    kind VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'new',
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    category VARCHAR(128) NOT NULL,
    project_id VARCHAR(64) REFERENCES municipal_projects(id) ON DELETE SET NULL,
    longitude DOUBLE PRECISION,
    latitude DOUBLE PRECISION,
    barangay VARCHAR(128),
    contact_name VARCHAR(255),
    contact_email VARCHAR(128),
    contact_phone VARCHAR(128),
    staff_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disaster_hazard_alerts (
    id VARCHAR(64) PRIMARY KEY,
    alert_type VARCHAR(64) NOT NULL DEFAULT 'LANDSLIDE_RISK',
    severity VARCHAR(32) NOT NULL DEFAULT 'HIGH',
    zone_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    recommended_action TEXT,
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS disaster_backups (
    id VARCHAR(64) PRIMARY KEY,
    system_name VARCHAR(128) NOT NULL,
    lgu_name VARCHAR(128) NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    exported_at TIMESTAMPTZ NOT NULL,
    exported_by VARCHAR(64) NOT NULL,
    summary JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 8. COMPATIBILITY VIEW (Joins all normalized tables into one virtual view)
-- =============================================================================
CREATE OR REPLACE VIEW v_citizen_applications_full AS
SELECT 
    ca.id,
    ca.tracking_number,
    ca.service_type,
    ca.category,
    ca.status,
    a.id AS applicant_id,
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
    loc.lot_location_description,
    loc.tct_no,
    loc.tax_dec_no,
    loc.lot_owner,
    loc.is_applicant_owner,
    eng.engineer_approved,
    eng.engineer_approved_at,
    eng.engineer_approved_by,
    eng.is_pinned,
    eng.held_at,
    eng.held_by,
    eng.hold_reason,
    eng.occupancy_ready,
    eng.occupancy_permit_no,
    pay.payment_status,
    pay.order_of_payment_no,
    pay.amount_due,
    pay.or_number,
    pay.amount_paid,
    pay.payment_date,
    pay.cashier,
    ca.sla_days,
    ca.sla_minutes,
    ca.fee,
    ca.notes,
    ca.data_hash,
    ca.created_at,
    ca.updated_at
FROM citizen_applications ca
LEFT JOIN applicants a ON ca.applicant_id = a.id
LEFT JOIN application_locations loc ON ca.id = loc.application_id
LEFT JOIN application_payments pay ON ca.id = pay.application_id
LEFT JOIN engineering_reviews eng ON ca.id = eng.application_id;

-- =============================================================================
-- 9. PERFORMANCE INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_ca_tracking ON citizen_applications(tracking_number);
CREATE INDEX IF NOT EXISTS idx_ca_status ON citizen_applications(status);
CREATE INDEX IF NOT EXISTS idx_ca_applicant ON citizen_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_ca_data_hash ON citizen_applications(data_hash);
CREATE INDEX IF NOT EXISTS idx_ca_created_at ON citizen_applications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loc_app_id ON application_locations(application_id);
CREATE INDEX IF NOT EXISTS idx_pay_app_id ON application_payments(application_id);
CREATE INDEX IF NOT EXISTS idx_eng_app_id ON engineering_reviews(application_id);

CREATE INDEX IF NOT EXISTS idx_ar_app_id ON application_remarks(application_id);
CREATE INDEX IF NOT EXISTS idx_ar_tracking ON application_remarks(tracking_number);
CREATE INDEX IF NOT EXISTS idx_sip_app_id ON site_inspection_photos(application_id);
CREATE INDEX IF NOT EXISTS idx_sip_tracking ON site_inspection_photos(tracking_number);

CREATE INDEX IF NOT EXISTS idx_mp_status ON municipal_projects(status);
CREATE INDEX IF NOT EXISTS idx_mp_coords ON municipal_projects(latitude, longitude);

-- =============================================================================
-- 10. AUTOMATIC TIMESTAMPTZ TRIGGERS
-- =============================================================================
DROP TRIGGER IF EXISTS trg_update_applicants ON applicants;
CREATE TRIGGER trg_update_applicants BEFORE UPDATE ON applicants
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trg_update_citizen_applications ON citizen_applications;
CREATE TRIGGER trg_update_citizen_applications BEFORE UPDATE ON citizen_applications
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trg_update_application_payments ON application_payments;
CREATE TRIGGER trg_update_application_payments BEFORE UPDATE ON application_payments
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trg_update_engineering_reviews ON engineering_reviews;
CREATE TRIGGER trg_update_engineering_reviews BEFORE UPDATE ON engineering_reviews
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trg_update_municipal_projects ON municipal_projects;
CREATE TRIGGER trg_update_municipal_projects BEFORE UPDATE ON municipal_projects
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();


-- =============================================================================
-- SEED DATA
-- =============================================================================

-- =============================================================================
-- DATABASE SEED DATA: LUISIANA INFA-TRACK (IMPACT-LUISIANA)
-- Municipality of Luisiana, Laguna (PSGC 0403412000)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Official 23 Barangays of Luisiana, Laguna
-- -----------------------------------------------------------------------------
INSERT INTO barangays (id, code, name, zone, is_active, is_default) VALUES
('brgy-1',  'ZONE-1', 'Barangay Zone I (Poblacion)',   'Urban / Commercial Zone', true, true),
('brgy-2',  'ZONE-2', 'Barangay Zone II (Poblacion)',  'Urban / Commercial Zone', true, true),
('brgy-3',  'ZONE-3', 'Barangay Zone III (Poblacion)', 'Urban / Commercial Zone', true, true),
('brgy-4',  'ZONE-4', 'Barangay Zone IV (Poblacion)',  'Urban / Commercial Zone', true, true),
('brgy-5',  'ZONE-5', 'Barangay Zone V (Poblacion)',   'Urban / Commercial Zone', true, true),
('brgy-6',  'ZONE-6', 'Barangay Zone VI (Poblacion)',  'Urban / Commercial Zone', true, true),
('brgy-7',  'ZONE-7', 'Barangay Zone VII (Poblacion)', 'Urban / Commercial Zone', true, true),
('brgy-8',  'ZONE-8', 'Barangay Zone VIII (Poblacion)','Urban / Commercial Zone', true, true),
('brgy-9',  'DELAPAZ', 'De La Paz',                    'Rural Zone', true, true),
('brgy-10', 'SANANT',  'San Antonio',                  'Rural Zone', true, true),
('brgy-11', 'SANBUEN', 'San Buenaventura',             'Rural Zone', true, true),
('brgy-12', 'SANDIEG', 'San Diego',                    'Rural Zone', true, true),
('brgy-13', 'SANISID', 'San Isidro',                   'Rural Zone', true, true),
('brgy-14', 'SANJOSE', 'San Jose',                     'Rural Zone', true, true),
('brgy-15', 'SANJUAN', 'San Juan',                     'Rural Zone', true, true),
('brgy-16', 'SANLUIS', 'San Luis',                     'Rural Zone', true, true),
('brgy-17', 'SANPABL', 'San Pablo',                    'Rural Zone', true, true),
('brgy-18', 'SANPEDR', 'San Pedro',                    'Rural Zone', true, true),
('brgy-19', 'SANRAFA', 'San Rafael',                   'Rural Zone', true, true),
('brgy-20', 'SANROQU', 'San Roque',                    'Rural Zone', true, true),
('brgy-21', 'SANSALV', 'San Salvador',                 'Rural Zone', true, true),
('brgy-22', 'STODOM',  'Santo Domingo',                'Rural Zone', true, true),
('brgy-23', 'STOTOM',  'Santo Tomas',                  'Rural Zone', true, true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    zone = EXCLUDED.zone,
    is_active = EXCLUDED.is_active;

-- -----------------------------------------------------------------------------
-- 2. System Masterlists (Standard Categories)
-- -----------------------------------------------------------------------------

-- Zoning Classifications
INSERT INTO system_masterlists (id, category, code, name, description, zone_group, is_active, is_default) VALUES
('zc-1', 'zoningClassifications', 'URBAN_COMM', 'Urban / Commercial Zone', 'Poblacion zones and commercial corridors', 'Commercial', true, true),
('zc-2', 'zoningClassifications', 'RES_LOW',    'Low-Density Residential (R-1)', 'Single-family residential lots', 'Residential', true, true),
('zc-3', 'zoningClassifications', 'RES_MED',    'Medium-Density Residential (R-2)', 'Multi-family residences & townhouses', 'Residential', true, true),
('zc-4', 'zoningClassifications', 'AGRI_PROD',  'Agricultural Production Zone', 'Farmlands, rice fields, and high-value crops', 'Agricultural', true, true),
('zc-5', 'zoningClassifications', 'AGRI_AGRO',  'Agro-Industrial Zone', 'Poultry, piggeries, feed mills, and processing', 'Industrial', true, true),
('zc-6', 'zoningClassifications', 'ECO_TOUR',   'Eco-Tourism & Protected Forest', 'Forest reserves, watershed, and eco-parks', 'Conservation', true, true),
('zc-7', 'zoningClassifications', 'INST_GOV',   'Institutional / Government Zone', 'Civic centers, schools, and hospitals', 'Institutional', true, true)
ON CONFLICT (category, code) DO NOTHING;

-- Building Types
INSERT INTO system_masterlists (id, category, code, name, description, is_active, is_default) VALUES
('bt-1', 'buildingTypes', 'RESIDENTIAL',    'Single Family Residential Dwelling', '1-2 Storey residential house', true, true),
('bt-2', 'buildingTypes', 'COMMERCIAL',     'Commercial / Retail Store', 'Store, sari-sari store, eatery, commercial building', true, true),
('bt-3', 'buildingTypes', 'AGRI_STRUCTURE', 'Agricultural Facility (Poultry/Swine/Barn)', 'Farm sheds, storage, livestock houses', true, true),
('bt-4', 'buildingTypes', 'INSTITUTIONAL',  'Institutional / Barangay Facility', 'Barangay outpost, chapel, community center', true, true),
('bt-5', 'buildingTypes', 'WAREHOUSE',      'Warehouse / Light Storage', 'Storage facility and trading depot', true, true)
ON CONFLICT (category, code) DO NOTHING;

-- Permit Categories
INSERT INTO system_masterlists (id, category, code, name, description, is_active, is_default) VALUES
('pc-1', 'permitCategories', 'ZONING_CERT',     'Locational Clearance / Zoning Certificate', 'Clearance for construction and business location', true, true),
('pc-2', 'permitCategories', 'LAND_TITLING',    'Land Titling & Verification Assistance', 'Assistance for property boundaries and registry', true, true),
('pc-3', 'permitCategories', 'RESEARCH_PERMIT', 'Socio-Economic & Planning Research', 'Permit for academic, survey, or GIS research', true, true)
ON CONFLICT (category, code) DO NOTHING;

-- Funding Sources
INSERT INTO system_masterlists (id, category, code, name, description, is_active, is_default) VALUES
('fs-1', 'fundingSources', '20_DEV_FUND', '20% Municipal Development Fund (20% DF)', 'Local Government 20% annual IRA allocation', true, true),
('fs-2', 'fundingSources', 'GEN_FUND',    'General Fund (GF)', 'Internal local revenue collections', true, true),
('fs-3', 'fundingSources', 'NATL_SUBSIDY','National Government Subsidy (LGSF / DPWH / DA)', 'National department capital assistance', true, true),
('fs-4', 'fundingSources', 'CALAMITY_FUND','Local Disaster Risk Reduction & Management Fund (LDRRMF)', '5% Calamity mitigation fund', true, true),
('fs-5', 'fundingSources', 'SEF',          'Special Education Fund (SEF)', 'DepEd public school infrastructure and repairs', true, true),
('fs-6', 'fundingSources', 'PRIVATE',      'Private / Proponent Funded', 'Privately funded construction or commercial project', true, true)
ON CONFLICT (category, code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Default System Config
-- -----------------------------------------------------------------------------
INSERT INTO system_config (id, version, maintenance_enabled, maintenance_message, updated_at)
VALUES (
    'master_config',
    '1.2.0',
    false,
    'Pansamantalang inaayos ang LUISIANA INFA-TRACK system upang mapabuti ang serbisyo. Mangyaring bumalik mamaya.',
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    version = EXCLUDED.version,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- 4. Initial Staff Accounts (Matching auth.json / impact2024 seeds)
-- -----------------------------------------------------------------------------
INSERT INTO staff_accounts (
    username, name, employee_id, role, department, password_hash, password_salt, iterations, must_change_password, is_active
) VALUES
(
    'admin',
    'System Administrator',
    'ADMIN-001',
    'Super Admin',
    'ICT Office / Office of the Mayor',
    'rVCyvu5j0KtSv3skWEASD4pq0L4Gi9hBjshva6rHnHY=',
    'BXGOVE4T43tr6obYWv1Lcg==',
    120000,
    false,
    true
),
(
    'mpdc',
    'Engr. Mario S. Baldovino',
    'MPDC-001',
    'MPDC',
    'Municipal Planning & Development Coordinator',
    'InTMvGRKLGVQH5dpcuxE07e999wSRhzXiakmYLQz1xQ=',
    'TZclgInCg0j14MIgXypaSw==',
    120000,
    false,
    true
),
(
    'engineer',
    'Municipal Engineer Office',
    'ENG-001',
    'Engineer',
    'Infrastructure & Engineering Office',
    'Vks0SgJTzxoWUT2Qfd5REWm0Lk8riViiWFq4u6rLKFI=',
    'ZB0FQi3kmoWzHl3zX6Y8rg==',
    120000,
    false,
    true
),
(
    'agriculture',
    'Municipal Agriculturist',
    'AGRI-001',
    'Agriculture',
    'Municipal Agriculture Office',
    'l8wGdQAA9IGpQ/my1BvSY2EWG86+rz7W0Xgk2RvNQ98=',
    'FrrX09TAXIpY9dIzbq6PHg==',
    120000,
    false,
    true
),
(
    'treasury',
    'Municipal Treasurer',
    'TREAS-001',
    'Treasury Office',
    'Municipal Treasury Office',
    '3tTb/8M2kwXksj6pYC1Hw9EKKLfu/0GXKX+RNw9saWs=',
    'SMQm2nQEin71lqslkgkxCw==',
    120000,
    false,
    true
),
(
    'negosyo',
    'Negosyo Center Staff',
    'BPLO-001',
    'Treasury Office',
    'Municipal Treasury Office',
    '3tTb/8M2kwXksj6pYC1Hw9EKKLfu/0GXKX+RNw9saWs=',
    'SMQm2nQEin71lqslkgkxCw==',
    120000,
    false,
    true
),
(
    'assessor',
    'Municipal Assessor',
    'ASSESS-001',
    'Assessor',
    'Municipal Assessor''s Office',
    '3tTb/8M2kwXksj6pYC1Hw9EKKLfu/0GXKX+RNw9saWs=',
    'SMQm2nQEin71lqslkgkxCw==',
    120000,
    false,
    true
),
(
    'barangay',
    'Barangay Officer',
    'BRGY-001',
    'Barangay Official',
    'Barangay Hall — Luisiana',
    'qbSpIYx/SBrcPzgTcc6i6ZV6Ou6Z8sibMYXkI5jHiNw=',
    '2kcL5cjoqQR9bHDCugw7mg==',
    120000,
    false,
    true
),
(
    'pengineer',
    'Private Design Engineer',
    'PENG-001',
    'Private Engineer',
    'Private Professional / Design Engineer',
    'LYf7mmVi+zCxTMq8gq59L8n0WaV+C+mzysgr99xGgzM=',
    'sk/wHvJkc5rLmiTye3pBdA==',
    120000,
    false,
    true
)
ON CONFLICT (username) DO NOTHING;


COMMIT;
