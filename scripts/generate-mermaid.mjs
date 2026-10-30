import fs from 'fs';

const schema = JSON.parse(fs.readFileSync('scripts/cleaned-attributes-schema.json', 'utf8'));

function formatType(t) {
  t = t.toLowerCase().trim();
  if (t.startsWith('varchar')) return 'varchar';
  if (t.startsWith('numeric')) return 'numeric';
  if (t.startsWith('double')) return 'double';
  if (t.startsWith('int')) return 'int';
  if (t.startsWith('bool')) return 'boolean';
  if (t.startsWith('timestamp')) return 'timestamptz';
  if (t.startsWith('json')) return 'jsonb';
  if (t.startsWith('uuid')) return 'uuid';
  if (t.startsWith('date')) return 'date';
  if (t.startsWith('text')) return 'text';
  if (t.startsWith('bigint')) return 'bigint';
  return 'text';
}

function generateMermaid() {
  let out = 'erDiagram\n';

  // 1. All entities and their attributes
  for (const [tblName, cols] of Object.entries(schema)) {
    out += `    ${tblName} {\n`;
    for (const c of cols) {
      const type = formatType(c.type);
      let key = '';
      if (c.isPk) key = ' PK';
      else if (c.isFk) key = ' FK';
      out += `        ${type} ${c.name}${key}\n`;
    }
    out += `    }\n\n`;
  }

  // 2. All relationships
  out += `    %% ---------------------------------------------------------\n`;
  out += `    %% PILLAR 1: MASTERLISTS & AUTH SECURITY\n`;
  out += `    %% ---------------------------------------------------------\n`;
  out += `    barangays ||--o{ application_locations : "zoning (1:N)"\n`;
  out += `    barangays ||--o{ municipal_projects : "jurisdiction (1:N)"\n`;
  out += `    barangays ||--o{ planning_proposals : "territory (1:N)"\n`;
  out += `    barangays ||--o{ municipal_documents : "categorizes (1:N)"\n`;
  out += `    staff_accounts ||--o{ user_sessions : "authenticates (1:N)"\n`;
  out += `    staff_accounts ||--o{ audit_logs : "logged_by (0..1:N)"\n`;
  out += `    staff_accounts ||--o{ planning_proposals : "submits (1:N)"\n`;
  out += `    staff_accounts ||--o{ proposal_comments : "authors (1:N)"\n`;
  out += `    staff_accounts ||--o{ proposal_approvals : "decides (1:N)"\n`;
  out += `    staff_accounts ||--o{ proposal_votes : "votes (1:N)"\n\n`;

  out += `    %% ---------------------------------------------------------\n`;
  out += `    %% PILLAR 2: CITIZEN PERMITTING & 3NF APPLICATION LIFECYCLE\n`;
  out += `    %% ---------------------------------------------------------\n`;
  out += `    applicants ||--o{ citizen_applications : "submits (1:N)"\n`;
  out += `    citizen_applications ||--|| application_locations : "lot_details (1:1)"\n`;
  out += `    citizen_applications ||--|| application_payments : "assessed_fees (1:1)"\n`;
  out += `    citizen_applications ||--|| engineering_reviews : "engineer_signoff (1:1)"\n`;
  out += `    citizen_applications ||--o{ application_documents : "attachments (1:N)"\n`;
  out += `    citizen_applications ||--o{ application_remarks : "notes (1:N)"\n`;
  out += `    citizen_applications ||--o{ site_inspection_photos : "ocular_photos (1:N)"\n`;
  out += `    citizen_applications |o--o| municipal_projects : "promoted_permit (0..1:1)"\n\n`;

  out += `    %% ---------------------------------------------------------\n`;
  out += `    %% PILLAR 3: MUNICIPAL INFRASTRUCTURE & 3D WEBGL\n`;
  out += `    %% ---------------------------------------------------------\n`;
  out += `    municipal_projects ||--o{ project_milestones : "milestones (1:N)"\n`;
  out += `    municipal_projects ||--o{ project_issues : "bottlenecks (1:N)"\n`;
  out += `    municipal_projects ||--o{ project_photos : "progress_photos (1:N)"\n`;
  out += `    municipal_projects ||--o{ project_activity_logs : "logs (1:N)"\n`;
  out += `    municipal_projects ||--o{ meo_inspection_schedules : "inspections (1:N)"\n`;
  out += `    project_milestones |o--o{ project_photos : "tags (0..1:N)"\n\n`;

  out += `    %% ---------------------------------------------------------\n`;
  out += `    %% PILLAR 4: URBAN PLANNING & COLLABORATIVE GOVERNANCE\n`;
  out += `    %% ---------------------------------------------------------\n`;
  out += `    planning_proposals ||--o{ proposal_comments : "comments (1:N)"\n`;
  out += `    planning_proposals ||--o{ proposal_approvals : "endorsements (1:N)"\n`;
  out += `    planning_proposals ||--o{ proposal_votes : "tallies (1:N)"\n`;
  out += `    planning_proposals |o--o| municipal_projects : "approved_project (0..1:1)"\n\n`;

  out += `    %% ---------------------------------------------------------\n`;
  out += `    %% PILLAR 5: DMS, CITIZEN ENGAGEMENT & DISASTER RESILIENCE\n`;
  out += `    %% ---------------------------------------------------------\n`;
  out += `    municipal_documents ||--o{ document_versions : "versions (1:N)"\n`;
  out += `    municipal_projects |o--o{ citizen_engagements : "feedback (0..1:N)"\n`;

  return out;
}

const mermaidCode = generateMermaid();
fs.writeFileSync('scripts/mermaid-erd.txt', mermaidCode, 'utf8');

const mdDoc = `# LUISIANA INFA-TRACK — Comprehensive ERD Database Schema
This document contains the complete Entity-Relationship Diagram (ERD) with all 33 PostgreSQL tables and their attributes.

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;
fs.writeFileSync('ERD_DATABASE_SCHEMA.md', mdDoc, 'utf8');
console.log('Successfully generated Mermaid ERD and saved to ERD_DATABASE_SCHEMA.md');

