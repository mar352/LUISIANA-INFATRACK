import fs from 'fs';
import path from 'path';

// All 33 tables in PostgreSQL schema with clean minimal attributes
const allTables = [
  // =========================================================================
  // PILLAR 1: SYSTEM MASTERLISTS, AUTH & SECURITY (7 tables)
  // =========================================================================
  {
    id: 'tbl_barangays',
    name: 'barangays',
    pillar: 'master',
    x: 60,
    y: 130,
    width: 330,
    headerColor: '#065F46',
    borderColor: '#10B981',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'code', type: 'VARCHAR(32)' },
      { name: 'name', type: 'VARCHAR(128)' },
      { name: 'zone', type: 'VARCHAR(64)' },
      { name: 'is_active', type: 'BOOLEAN' },
      { name: 'updated_at', type: 'TIMESTAMPTZ' }
    ]
  },
  {
    id: 'tbl_system_config',
    name: 'system_config',
    pillar: 'master',
    x: 60,
    y: 315,
    width: 330,
    headerColor: '#065F46',
    borderColor: '#10B981',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'version', type: 'VARCHAR(32)' },
      { name: 'maintenance_enabled', type: 'BOOLEAN' },
      { name: 'maintenance_message', type: 'TEXT' },
      { name: 'config_json', type: 'JSONB' },
      { name: 'updated_at', type: 'TIMESTAMPTZ' }
    ]
  },
  {
    id: 'tbl_system_masterlists',
    name: 'system_masterlists',
    pillar: 'master',
    x: 60,
    y: 500,
    width: 330,
    headerColor: '#065F46',
    borderColor: '#10B981',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'category', type: 'VARCHAR(64)' },
      { name: 'code', type: 'VARCHAR(64)' },
      { name: 'name', type: 'VARCHAR(255)' },
      { name: 'zone_group', type: 'VARCHAR(64)' },
      { name: 'is_active', type: 'BOOLEAN' }
    ]
  },
  {
    id: 'tbl_staff_accounts',
    name: 'staff_accounts',
    pillar: 'auth',
    x: 60,
    y: 690,
    width: 330,
    headerColor: '#4338CA',
    borderColor: '#6366F1',
    columns: [
      { name: 'id', type: 'UUID', isPk: true },
      { name: 'username', type: 'VARCHAR(64)' },
      { name: 'name', type: 'VARCHAR(255)' },
      { name: 'role', type: 'VARCHAR(64)' },
      { name: 'department', type: 'VARCHAR(255)' },
      { name: 'is_active', type: 'BOOLEAN' },
      { name: 'last_login_at', type: 'TIMESTAMPTZ' }
    ]
  },
  {
    id: 'tbl_user_sessions',
    name: 'user_sessions',
    pillar: 'auth',
    x: 60,
    y: 895,
    width: 330,
    headerColor: '#4338CA',
    borderColor: '#6366F1',
    columns: [
      { name: 'id', type: 'VARCHAR(128)', isPk: true },
      { name: 'username', type: 'VARCHAR(64)', isFk: true, ref: 'staff_accounts.username' },
      { name: 'role', type: 'VARCHAR(64)' },
      { name: 'ip_address', type: 'VARCHAR(64)' },
      { name: 'device_name', type: 'VARCHAR(128)' },
      { name: 'expires_at', type: 'TIMESTAMPTZ' }
    ]
  },
  {
    id: 'tbl_audit_logs',
    name: 'audit_logs',
    pillar: 'auth',
    x: 60,
    y: 1080,
    width: 330,
    headerColor: '#4338CA',
    borderColor: '#6366F1',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'actor_username', type: 'VARCHAR(64)', isFk: true, ref: 'staff_accounts.username' },
      { name: 'action_type', type: 'VARCHAR(64)' },
      { name: 'resource_type', type: 'VARCHAR(64)' },
      { name: 'resource_id', type: 'VARCHAR(128)' },
      { name: 'created_at', type: 'TIMESTAMPTZ' }
    ]
  },
  {
    id: 'tbl_security_quarantine_logs',
    name: 'security_quarantine_logs',
    pillar: 'auth',
    x: 60,
    y: 1265,
    width: 330,
    headerColor: '#4338CA',
    borderColor: '#6366F1',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'original_filename', type: 'VARCHAR(255)' },
      { name: 'threat_type', type: 'VARCHAR(128)' },
      { name: 'file_sha256', type: 'VARCHAR(64)' },
      { name: 'uploaded_by', type: 'VARCHAR(128)' },
      { name: 'created_at', type: 'TIMESTAMPTZ' }
    ]
  },

  // =========================================================================
  // PILLAR 2 & 3: CITIZEN PERMITTING & 3NF APPLICATIONS (9 tables)
  // =========================================================================
  // Sub-pillar A
  {
    id: 'tbl_applicants',
    name: 'applicants',
    pillar: 'permits',
    x: 440,
    y: 130,
    width: 330,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'full_name', type: 'VARCHAR(255)' },
      { name: 'contact_phone', type: 'VARCHAR(128)' },
      { name: 'contact_email', type: 'VARCHAR(128)' },
      { name: 'address', type: 'TEXT' },
      { name: 'barangay', type: 'VARCHAR(128)' }
    ]
  },
  {
    id: 'tbl_user_terms_consents',
    name: 'user_terms_consents',
    pillar: 'permits',
    x: 440,
    y: 315,
    width: 330,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'applicant_name', type: 'VARCHAR(255)' },
      { name: 'terms_version', type: 'VARCHAR(32)' },
      { name: 'agreed_terms', type: 'BOOLEAN' },
      { name: 'agreed_privacy', type: 'BOOLEAN' },
      { name: 'created_at', type: 'TIMESTAMPTZ' }
    ]
  },
  {
    id: 'tbl_citizen_applications',
    name: 'citizen_applications',
    pillar: 'permits',
    x: 440,
    y: 500,
    width: 330,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'tracking_number', type: 'VARCHAR(64)' },
      { name: 'applicant_id', type: 'VARCHAR(64)', isFk: true, ref: 'applicants.id' },
      { name: 'service_type', type: 'VARCHAR(64)' },
      { name: 'category', type: 'VARCHAR(64)' },
      { name: 'status', type: 'VARCHAR(64)' },
      { name: 'project_title', type: 'VARCHAR(255)' },
      { name: 'estimated_cost', type: 'NUMERIC(15,2)' }
    ]
  },
  {
    id: 'tbl_application_remarks',
    name: 'application_remarks',
    pillar: 'permits',
    x: 440,
    y: 730,
    width: 330,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'application_id', type: 'VARCHAR(64)', isFk: true, ref: 'citizen_applications.id' },
      { name: 'from_office', type: 'VARCHAR(64)' },
      { name: 'author', type: 'VARCHAR(255)' },
      { name: 'message', type: 'TEXT' },
      { name: 'requires_action', type: 'BOOLEAN' }
    ]
  },

  // Sub-pillar B
  {
    id: 'tbl_application_locations',
    name: 'application_locations',
    pillar: 'permits',
    x: 820,
    y: 130,
    width: 330,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'application_id', type: 'VARCHAR(64)', isFk: true, ref: 'citizen_applications.id' },
      { name: 'barangay', type: 'VARCHAR(128)', isFk: true, ref: 'barangays.name' },
      { name: 'latitude', type: 'DOUBLE PRECISION' },
      { name: 'longitude', type: 'DOUBLE PRECISION' },
      { name: 'lot_area_sqm', type: 'NUMERIC(10,2)' },
      { name: 'zoning_classification', type: 'VARCHAR(64)' }
    ]
  },
  {
    id: 'tbl_application_payments',
    name: 'application_payments',
    pillar: 'permits',
    x: 820,
    y: 335,
    width: 330,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'application_id', type: 'VARCHAR(64)', isFk: true, ref: 'citizen_applications.id' },
      { name: 'payment_status', type: 'VARCHAR(64)' },
      { name: 'order_of_payment_no', type: 'VARCHAR(128)' },
      { name: 'amount_due', type: 'NUMERIC(15,2)' },
      { name: 'or_number', type: 'VARCHAR(128)' },
      { name: 'amount_paid', type: 'NUMERIC(15,2)' }
    ]
  },
  {
    id: 'tbl_engineering_reviews',
    name: 'engineering_reviews',
    pillar: 'permits',
    x: 820,
    y: 540,
    width: 330,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'application_id', type: 'VARCHAR(64)', isFk: true, ref: 'citizen_applications.id' },
      { name: 'engineer_approved', type: 'BOOLEAN' },
      { name: 'engineer_approved_by', type: 'VARCHAR(255)' },
      { name: 'occupancy_ready', type: 'BOOLEAN' },
      { name: 'occupancy_permit_no', type: 'VARCHAR(128)' }
    ]
  },
  {
    id: 'tbl_application_documents',
    name: 'application_documents',
    pillar: 'permits',
    x: 820,
    y: 725,
    width: 330,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'application_id', type: 'VARCHAR(64)', isFk: true, ref: 'citizen_applications.id' },
      { name: 'document_type', type: 'VARCHAR(64)' },
      { name: 'original_filename', type: 'VARCHAR(255)' },
      { name: 'file_url', type: 'TEXT' },
      { name: 'uploaded_at', type: 'TIMESTAMPTZ' }
    ]
  },
  {
    id: 'tbl_site_inspection_photos',
    name: 'site_inspection_photos',
    pillar: 'permits',
    x: 820,
    y: 910,
    width: 330,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'application_id', type: 'VARCHAR(64)', isFk: true, ref: 'citizen_applications.id' },
      { name: 'photo_url', type: 'TEXT' },
      { name: 'photo_type', type: 'VARCHAR(50)' },
      { name: 'stage', type: 'VARCHAR(50)' },
      { name: 'inspector', type: 'VARCHAR(255)' }
    ]
  },

  // =========================================================================
  // PILLAR 4 & 5: MUNICIPAL INFRASTRUCTURE & 3D ENGINEERING (6 tables)
  // =========================================================================
  // Sub-pillar A
  {
    id: 'tbl_municipal_projects',
    name: 'municipal_projects',
    pillar: 'infra',
    x: 1200,
    y: 130,
    width: 340,
    headerColor: '#0F766E',
    borderColor: '#14B8A6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'name', type: 'VARCHAR(255)' },
      { name: 'status', type: 'VARCHAR(64)' },
      { name: 'lifecycle_phase', type: 'VARCHAR(64)' },
      { name: 'latitude', type: 'DOUBLE PRECISION' },
      { name: 'longitude', type: 'DOUBLE PRECISION' },
      { name: 'barangay', type: 'VARCHAR(128)', isFk: true, ref: 'barangays.name' },
      { name: 'budget_total', type: 'NUMERIC(15,2)' },
      { name: 'application_id', type: 'VARCHAR(64)', isFk: true, ref: 'citizen_applications.id' }
    ]
  },
  {
    id: 'tbl_project_milestones',
    name: 'project_milestones',
    pillar: 'infra',
    x: 1200,
    y: 385,
    width: 340,
    headerColor: '#0F766E',
    borderColor: '#14B8A6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'project_id', type: 'VARCHAR(64)', isFk: true, ref: 'municipal_projects.id' },
      { name: 'title', type: 'VARCHAR(255)' },
      { name: 'target_date', type: 'DATE' },
      { name: 'completed_at', type: 'TIMESTAMPTZ' },
      { name: 'status', type: 'VARCHAR(32)' }
    ]
  },
  {
    id: 'tbl_meo_inspection_schedules',
    name: 'meo_inspection_schedules',
    pillar: 'infra',
    x: 1200,
    y: 570,
    width: 340,
    headerColor: '#0F766E',
    borderColor: '#14B8A6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'project_code', type: 'VARCHAR(128)', isFk: true, ref: 'municipal_projects.id' },
      { name: 'project_name', type: 'VARCHAR(512)' },
      { name: 'barangay', type: 'VARCHAR(255)', isFk: true, ref: 'barangays.name' },
      { name: 'inspection_date', type: 'DATE' },
      { name: 'assigned_inspector', type: 'VARCHAR(255)' },
      { name: 'status', type: 'VARCHAR(64)' }
    ]
  },

  // Sub-pillar B
  {
    id: 'tbl_project_issues',
    name: 'project_issues',
    pillar: 'infra',
    x: 1590,
    y: 130,
    width: 330,
    headerColor: '#0F766E',
    borderColor: '#14B8A6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'project_id', type: 'VARCHAR(64)', isFk: true, ref: 'municipal_projects.id' },
      { name: 'kind', type: 'VARCHAR(32)' },
      { name: 'title', type: 'VARCHAR(255)' },
      { name: 'description', type: 'TEXT' },
      { name: 'is_open', type: 'BOOLEAN' }
    ]
  },
  {
    id: 'tbl_project_photos',
    name: 'project_photos',
    pillar: 'infra',
    x: 1590,
    y: 315,
    width: 330,
    headerColor: '#0F766E',
    borderColor: '#14B8A6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'project_id', type: 'VARCHAR(64)', isFk: true, ref: 'municipal_projects.id' },
      { name: 'milestone_id', type: 'VARCHAR(64)', isFk: true, ref: 'project_milestones.id' },
      { name: 'photo_url', type: 'TEXT' },
      { name: 'caption', type: 'TEXT' },
      { name: 'inspector', type: 'VARCHAR(255)' }
    ]
  },
  {
    id: 'tbl_project_activity_logs',
    name: 'project_activity_logs',
    pillar: 'infra',
    x: 1590,
    y: 500,
    width: 330,
    headerColor: '#0F766E',
    borderColor: '#14B8A6',
    columns: [
      { name: 'id', type: 'UUID', isPk: true },
      { name: 'project_id', type: 'VARCHAR(64)', isFk: true, ref: 'municipal_projects.id' },
      { name: 'message', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMPTZ' }
    ]
  },

  // =========================================================================
  // PILLAR 6: URBAN PLANNING & COLLABORATIVE GOVERNANCE (6 tables)
  // =========================================================================
  {
    id: 'tbl_planning_proposals',
    name: 'planning_proposals',
    pillar: 'planning',
    x: 1970,
    y: 130,
    width: 340,
    headerColor: '#6D28D9',
    borderColor: '#8B5CF6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'title', type: 'VARCHAR(255)' },
      { name: 'department', type: 'VARCHAR(64)' },
      { name: 'priority', type: 'INT' },
      { name: 'status', type: 'VARCHAR(64)' },
      { name: 'submitter_username', type: 'VARCHAR(64)', isFk: true, ref: 'staff_accounts.username' },
      { name: 'linked_project_id', type: 'VARCHAR(64)', isFk: true, ref: 'municipal_projects.id' },
      { name: 'barangay', type: 'VARCHAR(128)', isFk: true, ref: 'barangays.name' }
    ]
  },
  {
    id: 'tbl_proposal_comments',
    name: 'proposal_comments',
    pillar: 'planning',
    x: 1970,
    y: 360,
    width: 340,
    headerColor: '#6D28D9',
    borderColor: '#8B5CF6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'proposal_id', type: 'VARCHAR(64)', isFk: true, ref: 'planning_proposals.id' },
      { name: 'author_username', type: 'VARCHAR(64)', isFk: true, ref: 'staff_accounts.username' },
      { name: 'author_role', type: 'VARCHAR(64)' },
      { name: 'body', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMPTZ' }
    ]
  },
  {
    id: 'tbl_proposal_approvals',
    name: 'proposal_approvals',
    pillar: 'planning',
    x: 1970,
    y: 545,
    width: 340,
    headerColor: '#6D28D9',
    borderColor: '#8B5CF6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'proposal_id', type: 'VARCHAR(64)', isFk: true, ref: 'planning_proposals.id' },
      { name: 'username', type: 'VARCHAR(64)', isFk: true, ref: 'staff_accounts.username' },
      { name: 'role', type: 'VARCHAR(64)' },
      { name: 'decision', type: 'VARCHAR(32)' },
      { name: 'decided_at', type: 'TIMESTAMPTZ' }
    ]
  },
  {
    id: 'tbl_proposal_votes',
    name: 'proposal_votes',
    pillar: 'planning',
    x: 1970,
    y: 730,
    width: 340,
    headerColor: '#6D28D9',
    borderColor: '#8B5CF6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'proposal_id', type: 'VARCHAR(64)', isFk: true, ref: 'planning_proposals.id' },
      { name: 'username', type: 'VARCHAR(64)', isFk: true, ref: 'staff_accounts.username' },
      { name: 'role', type: 'VARCHAR(64)' },
      { name: 'choice', type: 'VARCHAR(32)' },
      { name: 'voted_at', type: 'TIMESTAMPTZ' }
    ]
  },
  {
    id: 'tbl_planning_events',
    name: 'planning_events',
    pillar: 'planning',
    x: 1970,
    y: 915,
    width: 340,
    headerColor: '#6D28D9',
    borderColor: '#8B5CF6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'title', type: 'VARCHAR(255)' },
      { name: 'type', type: 'VARCHAR(32)' },
      { name: 'starts_at', type: 'TIMESTAMPTZ' },
      { name: 'ends_at', type: 'TIMESTAMPTZ' },
      { name: 'proposal_ids', type: 'JSONB' }
    ]
  },
  {
    id: 'tbl_planning_meetings',
    name: 'planning_meetings',
    pillar: 'planning',
    x: 1970,
    y: 1100,
    width: 340,
    headerColor: '#6D28D9',
    borderColor: '#8B5CF6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'title', type: 'VARCHAR(255)' },
      { name: 'held_at', type: 'TIMESTAMPTZ' },
      { name: 'agenda', type: 'TEXT' },
      { name: 'decisions', type: 'JSONB' },
      { name: 'proposal_ids', type: 'JSONB' }
    ]
  },

  // =========================================================================
  // PILLAR 7: DMS, CITIZEN ENGAGEMENT & DISASTER RISK (5 tables)
  // =========================================================================
  {
    id: 'tbl_municipal_documents',
    name: 'municipal_documents',
    pillar: 'docs_disaster',
    x: 2360,
    y: 130,
    width: 340,
    headerColor: '#BE123C',
    borderColor: '#F43F5E',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'title', type: 'VARCHAR(255)' },
      { name: 'category', type: 'VARCHAR(64)' },
      { name: 'year', type: 'INT' },
      { name: 'barangay', type: 'VARCHAR(128)', isFk: true, ref: 'barangays.name' },
      { name: 'file_url', type: 'TEXT' },
      { name: 'uploaded_by', type: 'VARCHAR(255)' }
    ]
  },
  {
    id: 'tbl_document_versions',
    name: 'document_versions',
    pillar: 'docs_disaster',
    x: 2360,
    y: 335,
    width: 340,
    headerColor: '#BE123C',
    borderColor: '#F43F5E',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'document_id', type: 'VARCHAR(64)', isFk: true, ref: 'municipal_documents.id' },
      { name: 'version_number', type: 'INT' },
      { name: 'file_url', type: 'TEXT' },
      { name: 'file_name', type: 'VARCHAR(255)' },
      { name: 'uploaded_at', type: 'TIMESTAMPTZ' }
    ]
  },
  {
    id: 'tbl_citizen_engagements',
    name: 'citizen_engagements',
    pillar: 'docs_disaster',
    x: 2360,
    y: 520,
    width: 340,
    headerColor: '#BE123C',
    borderColor: '#F43F5E',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'kind', type: 'VARCHAR(32)' },
      { name: 'status', type: 'VARCHAR(32)' },
      { name: 'title', type: 'VARCHAR(255)' },
      { name: 'category', type: 'VARCHAR(128)' },
      { name: 'project_id', type: 'VARCHAR(64)', isFk: true, ref: 'municipal_projects.id' },
      { name: 'barangay', type: 'VARCHAR(128)', isFk: true, ref: 'barangays.name' }
    ]
  },
  {
    id: 'tbl_disaster_hazard_alerts',
    name: 'disaster_hazard_alerts',
    pillar: 'docs_disaster',
    x: 2360,
    y: 725,
    width: 340,
    headerColor: '#BE123C',
    borderColor: '#F43F5E',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'alert_type', type: 'VARCHAR(64)' },
      { name: 'severity', type: 'VARCHAR(32)' },
      { name: 'title', type: 'VARCHAR(255)' },
      { name: 'message', type: 'TEXT' },
      { name: 'is_active', type: 'BOOLEAN' }
    ]
  },
  {
    id: 'tbl_disaster_backups',
    name: 'disaster_backups',
    pillar: 'docs_disaster',
    x: 2360,
    y: 910,
    width: 340,
    headerColor: '#BE123C',
    borderColor: '#F43F5E',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'system_name', type: 'VARCHAR(128)' },
      { name: 'lgu_name', type: 'VARCHAR(128)' },
      { name: 'checksum_sha256', type: 'VARCHAR(64)' },
      { name: 'exported_by', type: 'VARCHAR(64)' },
      { name: 'exported_at', type: 'TIMESTAMPTZ' }
    ]
  }
];

// Relationships & Foreign Key Edges
const edges = [
  // Auth relationships
  { id: 'e_user_sess_staff', src: 'tbl_user_sessions', tgt: 'tbl_staff_accounts', lbl: 'authenticates (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#6366F1' },
  { id: 'e_audit_staff', src: 'tbl_audit_logs', tgt: 'tbl_staff_accounts', lbl: 'logged by (0..1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=0;entryY=0.5;', sArr: 'ERmany', eArr: 'ERone', clr: '#6366F1' },

  // Citizen Permitting 3NF
  { id: 'e_app_to_applicant', src: 'tbl_citizen_applications', tgt: 'tbl_applicants', lbl: 'filed by (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_location', src: 'tbl_application_locations', tgt: 'tbl_citizen_applications', lbl: 'lot details (1:1)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.2;', sArr: 'ERone', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_payment', src: 'tbl_application_payments', tgt: 'tbl_citizen_applications', lbl: 'treasury assessment (1:1)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.4;', sArr: 'ERone', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_eng_rev', src: 'tbl_engineering_reviews', tgt: 'tbl_citizen_applications', lbl: 'engineer sign-off (1:1)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.6;', sArr: 'ERone', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_docs', src: 'tbl_application_documents', tgt: 'tbl_citizen_applications', lbl: 'attachments (1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.8;', sArr: 'ERmany', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_remarks', src: 'tbl_application_remarks', tgt: 'tbl_citizen_applications', lbl: 'remarks / notes (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_site_photos', src: 'tbl_site_inspection_photos', tgt: 'tbl_citizen_applications', lbl: 'inspection photos (1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=0.8;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#2563EB' },

  // Geographic references
  { id: 'e_barangay_locations', src: 'tbl_barangays', tgt: 'tbl_application_locations', lbl: 'zoning / boundary (1:N)', sExit: 'exitX=1;exitY=0.5;', tEntry: 'entryX=0;entryY=0.5;', sArr: 'ERone', eArr: 'ERmany', clr: '#10B981' },

  // Citizen App -> Municipal Projects
  { id: 'e_app_to_proj', src: 'tbl_municipal_projects', tgt: 'tbl_citizen_applications', lbl: 'promoted permit (0..1:1)', sExit: 'exitX=0;exitY=0.3;', tEntry: 'entryX=1;entryY=0.3;', sArr: 'ERone', eArr: 'ERzeroToOne', clr: '#0D9488' },

  // Infrastructure module
  { id: 'e_proj_milestones', src: 'tbl_project_milestones', tgt: 'tbl_municipal_projects', lbl: 'milestones (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#0D9488' },
  { id: 'e_proj_issues', src: 'tbl_project_issues', tgt: 'tbl_municipal_projects', lbl: 'bottlenecks (1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.2;', sArr: 'ERmany', eArr: 'ERone', clr: '#0D9488' },
  { id: 'e_proj_photos', src: 'tbl_project_photos', tgt: 'tbl_municipal_projects', lbl: 'progress media (1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.5;', sArr: 'ERmany', eArr: 'ERone', clr: '#0D9488' },
  { id: 'e_proj_act_logs', src: 'tbl_project_activity_logs', tgt: 'tbl_municipal_projects', lbl: 'activity trail (1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.8;', sArr: 'ERmany', eArr: 'ERone', clr: '#0D9488' },
  { id: 'e_proj_meo_sched', src: 'tbl_meo_inspection_schedules', tgt: 'tbl_municipal_projects', lbl: 'field inspections (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#0D9488' },

  // Planning module
  { id: 'e_prop_comments', src: 'tbl_proposal_comments', tgt: 'tbl_planning_proposals', lbl: 'comments (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#8B5CF6' },
  { id: 'e_prop_approvals', src: 'tbl_proposal_approvals', tgt: 'tbl_planning_proposals', lbl: 'endorsements (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.7;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#8B5CF6' },
  { id: 'e_prop_votes', src: 'tbl_proposal_votes', tgt: 'tbl_planning_proposals', lbl: 'votes (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.3;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#8B5CF6' },
  { id: 'e_prop_to_proj', src: 'tbl_planning_proposals', tgt: 'tbl_municipal_projects', lbl: 'linked project (0..1:1)', sExit: 'exitX=0;exitY=0.2;', tEntry: 'entryX=1;entryY=0.1;', sArr: 'ERzeroToOne', eArr: 'ERone', clr: '#8B5CF6' },

  // DMS & Disaster
  { id: 'e_doc_versions', src: 'tbl_document_versions', tgt: 'tbl_municipal_documents', lbl: 'versions (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#F43F5E' },
  { id: 'e_citizen_eng_proj', src: 'tbl_citizen_engagements', tgt: 'tbl_municipal_projects', lbl: 'public feedback (0..1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.9;', sArr: 'ERmany', eArr: 'ERzeroToOne', clr: '#F43F5E' }
];

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateFullXml() {
  const rowHeight = 22;
  const headerHeight = 28;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="LUISIANA-INFATRACK" version="24.7.17">
  <diagram id="luisiana_all_tables_erd" name="Complete PostgreSQL ERD (All 33 Tables)">
    <mxGraphModel dx="2000" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="2760" pageHeight="1480" background="#F8FAFC" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Master Title Banner -->
        <mxCell id="title_banner" value="LUISIANA INFA-TRACK: COMPLETE POSTGRESQL DATABASE ARCHITECTURE (ALL 33 TABLES)&#xa;Municipality of Luisiana, Laguna — 3rd Normal Form (3NF) Clean &amp; Minimal Production ERD" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0F172A;strokeColor=#38BDF8;strokeWidth=2;fontColor=#F8FAFC;fontSize=16;fontStyle=1;align=center;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="20" width="2680" height="56" as="geometry" />
        </mxCell>

        <!-- Pillar 1 Frame: Masterlists & RBAC -->
        <mxCell id="frame_master_rbac" value="1. MASTERLISTS &amp; AUTH SECURITY" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDF4;strokeColor=#BBF7D0;strokeWidth=1.5;fontColor=#166534;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="90" width="370" height="1360" as="geometry" />
        </mxCell>

        <!-- Pillar 2 Frame: Citizen Permitting 3NF -->
        <mxCell id="frame_permits" value="2. CITIZEN PERMITTING &amp; 3NF APPLICATION LIFECYCLE" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EFF6FF;strokeColor=#BFDBFE;strokeWidth=1.5;fontColor=#1E3A8A;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="420" y="90" width="750" height="1360" as="geometry" />
        </mxCell>

        <!-- Pillar 3 Frame: Municipal Infrastructure & 3D WebGL -->
        <mxCell id="frame_infra" value="3. MUNICIPAL INFRASTRUCTURE &amp; 3D ENGINEERING" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDFA;strokeColor=#99F6E4;strokeWidth=1.5;fontColor=#115E59;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="1180" y="90" width="760" height="1360" as="geometry" />
        </mxCell>

        <!-- Pillar 4 Frame: Urban Planning Governance -->
        <mxCell id="frame_planning" value="4. URBAN PLANNING &amp; GOVERNANCE" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FAF5FF;strokeColor=#E9D5FF;strokeWidth=1.5;fontColor=#6B21A8;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="1950" y="90" width="380" height="1360" as="geometry" />
        </mxCell>

        <!-- Pillar 5 Frame: DMS & Disaster Risk -->
        <mxCell id="frame_docs" value="5. DMS &amp; DISASTER RESILIENCE" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFF1F2;strokeColor=#FECDD3;strokeWidth=1.5;fontColor=#9F1239;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="2340" y="90" width="380" height="1360" as="geometry" />
        </mxCell>
`;

  // Render all 33 tables
  for (const table of allTables) {
    const tableHeight = headerHeight + table.columns.length * rowHeight;
    const swimlaneStyle = `swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=${headerHeight};horizontalStack=0;resizeParent=0;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;fillColor=${table.headerColor};strokeColor=${table.borderColor};strokeWidth=1.8;fontColor=#FFFFFF;fontSize=11;shadow=1;rounded=1;`;

    xml += `
        <!-- Table: ${table.name} -->
        <mxCell id="${table.id}" value="${table.name}" style="${swimlaneStyle}" vertex="1" parent="1">
          <mxGeometry x="${table.x}" y="${table.y}" width="${table.width}" height="${tableHeight}" as="geometry" />
        </mxCell>`;

    table.columns.forEach((col, index) => {
      const cellY = headerHeight + index * rowHeight;
      let icon = '   ';
      let fontColor = '#334155';
      let fontStyle = '0';
      let fillColor = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';

      if (col.isPk) {
        icon = '🔑 PK ';
        fontColor = '#92400E';
        fillColor = '#FEF3C7';
        fontStyle = '1';
      } else if (col.isFk) {
        icon = '🔗 FK ';
        fontColor = '#0369A1';
        fillColor = '#E0F2FE';
        fontStyle = '1';
      }

      const colValue = escapeXml(`${icon}${col.name} : ${col.type}`);
      const rowStyle = `text;strokeColor=none;fillColor=${fillColor};align=left;verticalAlign=middle;spacingLeft=8;spacingRight=8;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;dropTarget=0;whiteSpace=wrap;html=1;fontSize=10;fontColor=${fontColor};fontStyle=${fontStyle};`;

      xml += `
        <mxCell id="${table.id}_c${index}" value="${colValue}" style="${rowStyle}" vertex="1" parent="${table.id}">
          <mxGeometry y="${cellY}" width="${table.width}" height="${rowHeight}" as="geometry" />
        </mxCell>`;
    });
  }

  // Render Edges
  xml += `
        <!-- ================================================================= -->
        <!-- RELATIONAL EDGES & CARDINALITY (CROW'S FOOT NOTATION)              -->
        <!-- ================================================================= -->`;

  for (const edge of edges) {
    const edgeStyle = `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${edge.clr};strokeWidth=1.6;dashed=0;endArrow=${edge.eArr};startArrow=${edge.sArr};fontColor=${edge.clr};fontSize=9;fontStyle=1;labelBackgroundColor=#FFFFFF;labelBorderColor=#CBD5E1;`;
    const exitEntry = `${edge.sExit}${edge.tEntry}`;

    xml += `
        <mxCell id="${edge.id}" value="${escapeXml(edge.lbl)}" style="${edgeStyle}${exitEntry}" edge="1" parent="1" source="${edge.src}" target="${edge.tgt}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`;
  }

  xml += `
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;

  return xml;
}

const fullXml = generateFullXml();
const outPath = path.resolve('luisiana_infatrack_all_tables_erd.xml');
fs.writeFileSync(outPath, fullXml, 'utf8');

// Also update database_erd_clean_minimal.xml so both files have all tables
const cleanMinimalPath = path.resolve('database_erd_clean_minimal.xml');
fs.writeFileSync(cleanMinimalPath, fullXml, 'utf8');

console.log(`Generated complete 33-table ERD XML at: ${outPath} and ${cleanMinimalPath}`);
