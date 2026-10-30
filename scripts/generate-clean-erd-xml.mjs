import fs from 'fs';
import path from 'path';

// Definition of Tables for Clean and Minimal ERD
const tables = [
  // ZONE 1: Citizen Permitting & 3NF Applications
  {
    id: 'tbl_applicants',
    name: 'applicants',
    domain: 'citizens',
    x: 450,
    y: 130,
    width: 310,
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
    id: 'tbl_citizen_applications',
    name: 'citizen_applications',
    domain: 'citizens',
    x: 450,
    y: 370,
    width: 310,
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
    id: 'tbl_application_documents',
    name: 'application_documents',
    domain: 'citizens',
    x: 70,
    y: 130,
    width: 310,
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
    id: 'tbl_application_locations',
    name: 'application_locations',
    domain: 'citizens',
    x: 70,
    y: 350,
    width: 310,
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
    domain: 'citizens',
    x: 70,
    y: 590,
    width: 310,
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
    domain: 'citizens',
    x: 70,
    y: 830,
    width: 310,
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

  // ZONE 2: Infrastructure & Engineering
  {
    id: 'tbl_municipal_projects',
    name: 'municipal_projects',
    domain: 'infra',
    x: 450,
    y: 700,
    width: 310,
    headerColor: '#065F46',
    borderColor: '#10B981',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'name', type: 'VARCHAR(255)' },
      { name: 'status', type: 'VARCHAR(64)' },
      { name: 'lifecycle_phase', type: 'VARCHAR(64)' },
      { name: 'budget_total', type: 'NUMERIC(15,2)' },
      { name: 'latitude', type: 'DOUBLE PRECISION' },
      { name: 'longitude', type: 'DOUBLE PRECISION' },
      { name: 'barangay', type: 'VARCHAR(128)', isFk: true, ref: 'barangays.name' },
      { name: 'application_id', type: 'VARCHAR(64)', isFk: true, ref: 'citizen_applications.id' }
    ]
  },
  {
    id: 'tbl_project_milestones',
    name: 'project_milestones',
    domain: 'infra',
    x: 840,
    y: 700,
    width: 300,
    headerColor: '#065F46',
    borderColor: '#10B981',
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
    domain: 'infra',
    x: 1210,
    y: 700,
    width: 310,
    headerColor: '#065F46',
    borderColor: '#10B981',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'project_code', type: 'VARCHAR(128)', isFk: true, ref: 'municipal_projects.id' },
      { name: 'project_name', type: 'VARCHAR(512)' },
      { name: 'barangay', type: 'VARCHAR(255)', isFk: true, ref: 'barangays.name' },
      { name: 'inspection_date', type: 'DATE' },
      { name: 'inspection_time', type: 'VARCHAR(32)' },
      { name: 'assigned_inspector', type: 'VARCHAR(255)' },
      { name: 'status', type: 'VARCHAR(64)' }
    ]
  },

  // ZONE 3: Governance, RBAC & Geography
  {
    id: 'tbl_barangays',
    name: 'barangays',
    domain: 'gov',
    x: 840,
    y: 130,
    width: 300,
    headerColor: '#4C1D95',
    borderColor: '#8B5CF6',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', isPk: true },
      { name: 'code', type: 'VARCHAR(32)' },
      { name: 'name', type: 'VARCHAR(128)' },
      { name: 'zone', type: 'VARCHAR(64)' },
      { name: 'is_active', type: 'BOOLEAN' }
    ]
  },
  {
    id: 'tbl_staff_accounts',
    name: 'staff_accounts',
    domain: 'gov',
    x: 1210,
    y: 130,
    width: 310,
    headerColor: '#4C1D95',
    borderColor: '#8B5CF6',
    columns: [
      { name: 'id', type: 'UUID', isPk: true },
      { name: 'username', type: 'VARCHAR(64)' },
      { name: 'name', type: 'VARCHAR(255)' },
      { name: 'role', type: 'VARCHAR(64)' },
      { name: 'department', type: 'VARCHAR(255)' },
      { name: 'is_active', type: 'BOOLEAN' }
    ]
  },
  {
    id: 'tbl_planning_proposals',
    name: 'planning_proposals',
    domain: 'gov',
    x: 1020,
    y: 370,
    width: 330,
    headerColor: '#4C1D95',
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
  }
];

// Relationships / Foreign Key Edges
const edges = [
  {
    id: 'edge_applicants_app',
    source: 'tbl_applicants',
    target: 'tbl_citizen_applications',
    label: 'submits (1:N)',
    sourceExit: 'exitX=0.5;exitY=1;exitDx=0;exitDy=0;',
    targetEntry: 'entryX=0.5;entryY=0;entryDx=0;entryDy=0;',
    startArrow: 'ERone',
    endArrow: 'ERmany',
    color: '#2563EB'
  },
  {
    id: 'edge_app_docs',
    source: 'tbl_citizen_applications',
    target: 'tbl_application_documents',
    label: 'has documents (1:N)',
    sourceExit: 'exitX=0;exitY=0.15;exitDx=0;exitDy=0;',
    targetEntry: 'entryX=1;entryY=0.5;entryDx=0;entryDy=0;',
    startArrow: 'ERone',
    endArrow: 'ERmany',
    color: '#2563EB'
  },
  {
    id: 'edge_app_location',
    source: 'tbl_citizen_applications',
    target: 'tbl_application_locations',
    label: 'located at (1:1)',
    sourceExit: 'exitX=0;exitY=0.45;exitDx=0;exitDy=0;',
    targetEntry: 'entryX=1;entryY=0.5;entryDx=0;entryDy=0;',
    startArrow: 'ERone',
    endArrow: 'ERone',
    color: '#2563EB'
  },
  {
    id: 'edge_app_payment',
    source: 'tbl_citizen_applications',
    target: 'tbl_application_payments',
    label: 'assessed fees (1:1)',
    sourceExit: 'exitX=0;exitY=0.75;exitDx=0;exitDy=0;',
    targetEntry: 'entryX=1;entryY=0.5;entryDx=0;entryDy=0;',
    startArrow: 'ERone',
    endArrow: 'ERone',
    color: '#2563EB'
  },
  {
    id: 'edge_app_review',
    source: 'tbl_citizen_applications',
    target: 'tbl_engineering_reviews',
    label: 'evaluated by (1:1)',
    sourceExit: 'exitX=0;exitY=0.95;exitDx=0;exitDy=0;',
    targetEntry: 'entryX=1;entryY=0.5;entryDx=0;entryDy=0;',
    startArrow: 'ERone',
    endArrow: 'ERone',
    color: '#2563EB'
  },
  {
    id: 'edge_app_to_proj',
    source: 'tbl_citizen_applications',
    target: 'tbl_municipal_projects',
    label: 'promoted to GIS (0..1:1)',
    sourceExit: 'exitX=0.5;exitY=1;exitDx=0;exitDy=0;',
    targetEntry: 'entryX=0.5;entryY=0;entryDx=0;entryDy=0;',
    startArrow: 'ERzeroToOne',
    endArrow: 'ERone',
    color: '#059669'
  },
  {
    id: 'edge_proj_milestones',
    source: 'tbl_municipal_projects',
    target: 'tbl_project_milestones',
    label: 'milestones (1:N)',
    sourceExit: 'exitX=1;exitY=0.35;exitDx=0;exitDy=0;',
    targetEntry: 'entryX=0;entryY=0.5;entryDx=0;entryDy=0;',
    startArrow: 'ERone',
    endArrow: 'ERmany',
    color: '#059669'
  },
  {
    id: 'edge_proj_inspections',
    source: 'tbl_project_milestones',
    target: 'tbl_meo_inspection_schedules',
    label: 'schedules ocular (1:N)',
    sourceExit: 'exitX=1;exitY=0.5;exitDx=0;exitDy=0;',
    targetEntry: 'entryX=0;entryY=0.5;entryDx=0;entryDy=0;',
    startArrow: 'ERone',
    endArrow: 'ERmany',
    color: '#059669'
  },
  {
    id: 'edge_staff_proposals',
    source: 'tbl_staff_accounts',
    target: 'tbl_planning_proposals',
    label: 'submits / reviews (1:N)',
    sourceExit: 'exitX=0.5;exitY=1;exitDx=0;exitDy=0;',
    targetEntry: 'entryX=0.8;entryY=0;entryDx=0;entryDy=0;',
    startArrow: 'ERone',
    endArrow: 'ERmany',
    color: '#7C3AED'
  },
  {
    id: 'edge_barangays_proposals',
    source: 'tbl_barangays',
    target: 'tbl_planning_proposals',
    label: 'jurisdiction (1:N)',
    sourceExit: 'exitX=0.5;exitY=1;exitDx=0;exitDy=0;',
    targetEntry: 'entryX=0.25;entryY=0;entryDx=0;entryDy=0;',
    startArrow: 'ERone',
    endArrow: 'ERmany',
    color: '#7C3AED'
  },
  {
    id: 'edge_proposal_to_project',
    source: 'tbl_planning_proposals',
    target: 'tbl_municipal_projects',
    label: 'approved into project (0..1:1)',
    sourceExit: 'exitX=0.1;exitY=1;exitDx=0;exitDy=0;',
    targetEntry: 'entryX=0.9;entryY=0;entryDx=0;entryDy=0;',
    startArrow: 'ERzeroToOne',
    endArrow: 'ERone',
    color: '#0D9488'
  }
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

function generateXml() {
  const rowHeight = 24;
  const headerHeight = 28;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="LUISIANA-INFATRACK" version="24.7.17">
  <diagram id="luisiana_erd_minimal" name="Clean &amp; Minimal ERD">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1060" background="#F8FAFC" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Master Title Banner -->
        <mxCell id="title_banner" value="LUISIANA INFA-TRACK: CORE RELATIONAL DATABASE SCHEMA (ERD)&#xa;Municipality of Luisiana, Laguna — Clean 3NF Normalized Domain Model (12 Core Entities)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0F172A;strokeColor=#38BDF8;strokeWidth=2;fontColor=#F8FAFC;fontSize=15;fontStyle=1;align=center;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="20" width="1520" height="52" as="geometry" />
        </mxCell>

        <!-- Module Group 1: Citizen Permitting & 3NF Applications -->
        <mxCell id="group_citizens" value="1. CITIZEN PERMITTING &amp; 3NF APPLICATION LIFECYCLE" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EFF6FF;strokeColor=#BFDBFE;strokeWidth=1.5;fontColor=#1E3A8A;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="90" width="750" height="940" as="geometry" />
        </mxCell>

        <!-- Module Group 2: Geography & LGU Governance -->
        <mxCell id="group_gov" value="2. LGU GOVERNANCE, RBAC &amp; GEOGRAPHIC MASTER" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FAF5FF;strokeColor=#E9D5FF;strokeWidth=1.5;fontColor=#581C87;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="810" y="90" width="750" height="530" as="geometry" />
        </mxCell>

        <!-- Module Group 3: Infrastructure & Field Inspection -->
        <mxCell id="group_infra" value="3. MUNICIPAL INFRASTRUCTURE, 3D WEBGL &amp; FIELD INSPECTION" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ECFDF5;strokeColor=#A7F3D0;strokeWidth=1.5;fontColor=#064E3B;fontSize=12;fontStyle=1;align=left;verticalAlign=top;spacingLeft=15;spacingTop=8;dashed=1;" vertex="1" parent="1">
          <mxGeometry x="810" y="640" width="750" height="390" as="geometry" />
        </mxCell>
`;

  // Generate Table Swimlanes and Rows
  for (const table of tables) {
    const tableHeight = headerHeight + table.columns.length * rowHeight;
    const swimlaneStyle = `swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=${headerHeight};horizontalStack=0;resizeParent=0;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;fillColor=${table.headerColor};strokeColor=${table.borderColor};strokeWidth=2;fontColor=#FFFFFF;fontSize=12;shadow=1;rounded=1;`;

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

  // Generate Edges
  xml += `
        <!-- ================================================================= -->
        <!-- RELATIONSHIPS & CARDINALITY (CROW'S FOOT ER NOTATION)              -->
        <!-- ================================================================= -->`;

  for (const edge of edges) {
    const edgeStyle = `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${edge.color};strokeWidth=1.8;dashed=0;endArrow=${edge.endArrow};startArrow=${edge.startArrow};fontColor=${edge.color};fontSize=10;fontStyle=1;labelBackgroundColor=#FFFFFF;labelBorderColor=#CBD5E1;`;
    const exitEntry = `${edge.sourceExit}${edge.targetEntry}`;

    xml += `
        <mxCell id="${edge.id}" value="${escapeXml(edge.label)}" style="${edgeStyle}${exitEntry}" edge="1" parent="1" source="${edge.source}" target="${edge.target}">
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

const xmlContent = generateXml();
const outputPath = path.resolve('database_erd_clean_minimal.xml');
fs.writeFileSync(outputPath, xmlContent, 'utf8');
console.log(`Successfully generated clean ERD XML at: ${outputPath}`);

