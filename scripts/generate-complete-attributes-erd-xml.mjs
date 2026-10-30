import fs from 'fs';
import path from 'path';

const schema = JSON.parse(fs.readFileSync('scripts/cleaned-attributes-schema.json', 'utf8'));

// 8 Columns configuration
const columnsConfig = [
  {
    colIndex: 0,
    x: 50,
    width: 350,
    headerColor: '#065F46',
    borderColor: '#10B981',
    tables: ['barangays', 'system_config', 'system_masterlists', 'staff_accounts']
  },
  {
    colIndex: 1,
    x: 440,
    width: 350,
    headerColor: '#4338CA',
    borderColor: '#6366F1',
    tables: ['user_sessions', 'audit_logs', 'security_quarantine_logs', 'applicants', 'user_terms_consents']
  },
  {
    colIndex: 2,
    x: 830,
    width: 360,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    tables: ['citizen_applications', 'application_documents', 'application_remarks', 'site_inspection_photos']
  },
  {
    colIndex: 3,
    x: 1230,
    width: 360,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    tables: ['application_locations', 'application_payments', 'engineering_reviews']
  },
  {
    colIndex: 4,
    x: 1630,
    width: 370,
    headerColor: '#0F766E',
    borderColor: '#14B8A6',
    tables: ['municipal_projects']
  },
  {
    colIndex: 5,
    x: 2040,
    width: 360,
    headerColor: '#0F766E',
    borderColor: '#14B8A6',
    tables: ['project_milestones', 'meo_inspection_schedules', 'project_issues', 'project_photos', 'project_activity_logs']
  },
  {
    colIndex: 6,
    x: 2440,
    width: 360,
    headerColor: '#6D28D9',
    borderColor: '#8B5CF6',
    tables: ['planning_proposals', 'proposal_comments', 'proposal_approvals', 'proposal_votes', 'planning_events', 'planning_meetings']
  },
  {
    colIndex: 7,
    x: 2840,
    width: 360,
    headerColor: '#BE123C',
    borderColor: '#F43F5E',
    tables: ['municipal_documents', 'document_versions', 'citizen_engagements', 'disaster_hazard_alerts', 'disaster_backups']
  }
];

// Relationships & Foreign Key Edges
const edges = [
  // Auth relationships
  { id: 'e_user_sess_staff', src: 'tbl_user_sessions', tgt: 'tbl_staff_accounts', lbl: 'authenticates (1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.8;', sArr: 'ERmany', eArr: 'ERone', clr: '#6366F1' },
  { id: 'e_audit_staff', src: 'tbl_audit_logs', tgt: 'tbl_staff_accounts', lbl: 'audit trail (0..1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.9;', sArr: 'ERmany', eArr: 'ERone', clr: '#6366F1' },

  // Citizen Permitting 3NF
  { id: 'e_app_to_applicant', src: 'tbl_citizen_applications', tgt: 'tbl_applicants', lbl: 'filed by (1:N)', sExit: 'exitX=0;exitY=0.2;', tEntry: 'entryX=1;entryY=0.5;', sArr: 'ERmany', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_location', src: 'tbl_application_locations', tgt: 'tbl_citizen_applications', lbl: 'cadastral lot (1:1)', sExit: 'exitX=0;exitY=0.3;', tEntry: 'entryX=1;entryY=0.2;', sArr: 'ERone', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_payment', src: 'tbl_application_payments', tgt: 'tbl_citizen_applications', lbl: 'treasury assessment (1:1)', sExit: 'exitX=0;exitY=0.4;', tEntry: 'entryX=1;entryY=0.4;', sArr: 'ERone', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_eng_rev', src: 'tbl_engineering_reviews', tgt: 'tbl_citizen_applications', lbl: 'engineer sign-off (1:1)', sExit: 'exitX=0;exitY=0.4;', tEntry: 'entryX=1;entryY=0.6;', sArr: 'ERone', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_docs', src: 'tbl_application_documents', tgt: 'tbl_citizen_applications', lbl: 'attachments (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_remarks', src: 'tbl_application_remarks', tgt: 'tbl_citizen_applications', lbl: 'remarks / notes (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#2563EB' },
  { id: 'e_app_site_photos', src: 'tbl_site_inspection_photos', tgt: 'tbl_citizen_applications', lbl: 'inspection photos (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#2563EB' },

  // Geographic references
  { id: 'e_barangay_locations', src: 'tbl_barangays', tgt: 'tbl_application_locations', lbl: 'zoning boundary (1:N)', sExit: 'exitX=1;exitY=0.5;', tEntry: 'entryX=0;entryY=0.1;', sArr: 'ERone', eArr: 'ERmany', clr: '#10B981' },
  { id: 'e_barangay_projects', src: 'tbl_barangays', tgt: 'tbl_municipal_projects', lbl: 'project jurisdiction (1:N)', sExit: 'exitX=1;exitY=0.2;', tEntry: 'entryX=0;entryY=0.1;', sArr: 'ERone', eArr: 'ERmany', clr: '#10B981' },

  // Citizen App -> Municipal Projects
  { id: 'e_app_to_proj', src: 'tbl_municipal_projects', tgt: 'tbl_citizen_applications', lbl: 'promoted permit (0..1:1)', sExit: 'exitX=0;exitY=0.3;', tEntry: 'entryX=1;entryY=0.8;', sArr: 'ERone', eArr: 'ERzeroToOne', clr: '#0D9488' },

  // Infrastructure module
  { id: 'e_proj_milestones', src: 'tbl_project_milestones', tgt: 'tbl_municipal_projects', lbl: 'milestones (1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.2;', sArr: 'ERmany', eArr: 'ERone', clr: '#0D9488' },
  { id: 'e_proj_meo_sched', src: 'tbl_meo_inspection_schedules', tgt: 'tbl_municipal_projects', lbl: 'field inspections (1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.35;', sArr: 'ERmany', eArr: 'ERone', clr: '#0D9488' },
  { id: 'e_proj_issues', src: 'tbl_project_issues', tgt: 'tbl_municipal_projects', lbl: 'bottlenecks (1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.5;', sArr: 'ERmany', eArr: 'ERone', clr: '#0D9488' },
  { id: 'e_proj_photos', src: 'tbl_project_photos', tgt: 'tbl_municipal_projects', lbl: 'progress media (1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.65;', sArr: 'ERmany', eArr: 'ERone', clr: '#0D9488' },
  { id: 'e_proj_act_logs', src: 'tbl_project_activity_logs', tgt: 'tbl_municipal_projects', lbl: 'activity feed (1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.8;', sArr: 'ERmany', eArr: 'ERone', clr: '#0D9488' },

  // Planning module
  { id: 'e_prop_comments', src: 'tbl_proposal_comments', tgt: 'tbl_planning_proposals', lbl: 'comments (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#8B5CF6' },
  { id: 'e_prop_approvals', src: 'tbl_proposal_approvals', tgt: 'tbl_planning_proposals', lbl: 'endorsements (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.7;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#8B5CF6' },
  { id: 'e_prop_votes', src: 'tbl_proposal_votes', tgt: 'tbl_planning_proposals', lbl: 'votes (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.3;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#8B5CF6' },
  { id: 'e_prop_to_proj', src: 'tbl_planning_proposals', tgt: 'tbl_municipal_projects', lbl: 'funded project (0..1:1)', sExit: 'exitX=0;exitY=0.2;', tEntry: 'entryX=1;entryY=0.1;', sArr: 'ERzeroToOne', eArr: 'ERone', clr: '#8B5CF6' },

  // DMS & Disaster
  { id: 'e_doc_versions', src: 'tbl_document_versions', tgt: 'tbl_municipal_documents', lbl: 'versions (1:N)', sExit: 'exitX=0.5;exitY=0;', tEntry: 'entryX=0.5;entryY=1;', sArr: 'ERmany', eArr: 'ERone', clr: '#F43F5E' },
  { id: 'e_citizen_eng_proj', src: 'tbl_citizen_engagements', tgt: 'tbl_municipal_projects', lbl: 'feedback (0..1:N)', sExit: 'exitX=0;exitY=0.5;', tEntry: 'entryX=1;entryY=0.9;', sArr: 'ERmany', eArr: 'ERzeroToOne', clr: '#F43F5E' }
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

function generateCompleteXmlWithAttributes() {
  const rowHeight = 22;
  const headerHeight = 28;
  const tableVerticalGap = 32;
  const startY = 130;

  let maxComputedY = 0;

  // Pre-calculate positions
  const tablePositions = {};
  for (const col of columnsConfig) {
    let currentY = startY;
    for (const tableName of col.tables) {
      const cols = schema[tableName] || [];
      const tableHeight = headerHeight + cols.length * rowHeight;
      tablePositions[tableName] = {
        id: `tbl_${tableName}`,
        name: tableName,
        x: col.x,
        y: currentY,
        width: col.width,
        height: tableHeight,
        headerColor: col.headerColor,
        borderColor: col.borderColor,
        columns: cols
      };
      currentY += tableHeight + tableVerticalGap;
      if (currentY > maxComputedY) maxComputedY = currentY;
    }
  }

  const pageWidth = 3260;
  const pageHeight = Math.max(maxComputedY + 60, 2050);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="LUISIANA-INFATRACK" version="24.7.17">
  <diagram id="luisiana_complete_attributes_erd" name="Complete PostgreSQL ERD (All Tables &amp; Attributes)">
    <mxGraphModel dx="2400" dy="1400" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" background="#F8FAFC" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Master Title Banner -->
        <mxCell id="title_banner" value="LUISIANA INFA-TRACK: COMPLETE POSTGRESQL DATABASE ARCHITECTURE (ALL 33 TABLES &amp; ATTRIBUTES)&#xa;Municipality of Luisiana, Laguna — 3rd Normal Form (3NF) Production Relational Schema with Full Attributes" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0F172A;strokeColor=#38BDF8;strokeWidth=2;fontColor=#F8FAFC;fontSize=16;fontStyle=1;align=center;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="20" width="${pageWidth - 80}" height="56" as="geometry" />
        </mxCell>

        <!-- Module Frame 1: System Masterlists, RBAC & Security -->
        <mxCell id="frame_master_rbac" value="1. MASTERLISTS &amp; AUTH SECURITY (Columns 1 - 2)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDF4;strokeColor=#BBF7D0;strokeWidth=1.5;fontColor=#166534;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="90" width="760" height="${pageHeight - 130}" as="geometry" />
        </mxCell>

        <!-- Module Frame 2: Citizen Permitting 3NF Architecture -->
        <mxCell id="frame_permits" value="2. CITIZEN PERMITTING &amp; 3NF APPLICATION LIFECYCLE (Columns 3 - 4)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EFF6FF;strokeColor=#BFDBFE;strokeWidth=1.5;fontColor=#1E3A8A;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="820" y="90" width="780" height="${pageHeight - 130}" as="geometry" />
        </mxCell>

        <!-- Module Frame 3: Municipal Infrastructure & 3D WebGL -->
        <mxCell id="frame_infra" value="3. MUNICIPAL INFRASTRUCTURE, 3D WEBGL &amp; FIELD MEO (Columns 5 - 6)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDFA;strokeColor=#99F6E4;strokeWidth=1.5;fontColor=#115E59;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="1620" y="90" width="790" height="${pageHeight - 130}" as="geometry" />
        </mxCell>

        <!-- Module Frame 4: Urban Planning Governance -->
        <mxCell id="frame_planning" value="4. URBAN PLANNING &amp; GOVERNANCE (Column 7)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FAF5FF;strokeColor=#E9D5FF;strokeWidth=1.5;fontColor=#6B21A8;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="2430" y="90" width="380" height="${pageHeight - 130}" as="geometry" />
        </mxCell>

        <!-- Module Frame 5: DMS & Disaster Risk -->
        <mxCell id="frame_docs" value="5. DMS &amp; DISASTER RESILIENCE (Column 8)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFF1F2;strokeColor=#FECDD3;strokeWidth=1.5;fontColor=#9F1239;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="2830" y="90" width="380" height="${pageHeight - 130}" as="geometry" />
        </mxCell>
`;

  // Render all 33 tables with ALL attributes
  for (const [tblName, table] of Object.entries(tablePositions)) {
    const swimlaneStyle = `swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=${headerHeight};horizontalStack=0;resizeParent=0;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;fillColor=${table.headerColor};strokeColor=${table.borderColor};strokeWidth=1.8;fontColor=#FFFFFF;fontSize=11;shadow=1;rounded=1;`;

    xml += `
        <!-- Table: ${table.name} (${table.columns.length} attributes) -->
        <mxCell id="${table.id}" value="${table.name}" style="${swimlaneStyle}" vertex="1" parent="1">
          <mxGeometry x="${table.x}" y="${table.y}" width="${table.width}" height="${table.height}" as="geometry" />
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

const completeXml = generateCompleteXmlWithAttributes();
const targetFiles = [
  'luisiana_infatrack_all_tables_erd.xml',
  'database_erd_clean_minimal.xml'
];

for (const tf of targetFiles) {
  const p = path.resolve(tf);
  fs.writeFileSync(p, completeXml, 'utf8');
  console.log(`Saved complete ERD with ALL attributes to: ${p}`);
}

