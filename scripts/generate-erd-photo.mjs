import fs from 'fs';
import path from 'path';
import { Resvg } from '../backend/node_modules/@resvg/resvg-js/index.js';

const schema = JSON.parse(fs.readFileSync('scripts/cleaned-attributes-schema.json', 'utf8'));

// 8-column layout configuration
const columnsConfig = [
  {
    colIndex: 0,
    x: 60,
    width: 350,
    headerColor: '#065F46',
    borderColor: '#10B981',
    tables: ['barangays', 'system_config', 'system_masterlists', 'staff_accounts']
  },
  {
    colIndex: 1,
    x: 450,
    width: 350,
    headerColor: '#4338CA',
    borderColor: '#6366F1',
    tables: ['user_sessions', 'audit_logs', 'security_quarantine_logs', 'applicants', 'user_terms_consents']
  },
  {
    colIndex: 2,
    x: 840,
    width: 360,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    tables: ['citizen_applications', 'application_documents', 'application_remarks', 'site_inspection_photos']
  },
  {
    colIndex: 3,
    x: 1240,
    width: 360,
    headerColor: '#1E40AF',
    borderColor: '#3B82F6',
    tables: ['application_locations', 'application_payments', 'engineering_reviews']
  },
  {
    colIndex: 4,
    x: 1640,
    width: 370,
    headerColor: '#0F766E',
    borderColor: '#14B8A6',
    tables: ['municipal_projects']
  },
  {
    colIndex: 5,
    x: 2050,
    width: 360,
    headerColor: '#0F766E',
    borderColor: '#14B8A6',
    tables: ['project_milestones', 'meo_inspection_schedules', 'project_issues', 'project_photos', 'project_activity_logs']
  },
  {
    colIndex: 6,
    x: 2450,
    width: 360,
    headerColor: '#6D28D9',
    borderColor: '#8B5CF6',
    tables: ['planning_proposals', 'proposal_comments', 'proposal_approvals', 'proposal_votes', 'planning_events', 'planning_meetings']
  },
  {
    colIndex: 7,
    x: 2850,
    width: 360,
    headerColor: '#BE123C',
    borderColor: '#F43F5E',
    tables: ['municipal_documents', 'document_versions', 'citizen_engagements', 'disaster_hazard_alerts', 'disaster_backups']
  }
];

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSvg() {
  const rowHeight = 22;
  const headerHeight = 28;
  const tableVerticalGap = 30;
  const startY = 140;

  let maxComputedY = 0;
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

  const pageWidth = 3280;
  const pageHeight = Math.max(maxComputedY + 60, 2100);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidth} ${pageHeight}" width="${pageWidth}" height="${pageHeight}">
  <defs>
    <style>
      .font-sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
      .shadow { filter: drop-shadow(0 2px 4px rgba(0,0,0,0.06)); }
    </style>
  </defs>

  <!-- Background Canvas -->
  <rect width="${pageWidth}" height="${pageHeight}" fill="#F8FAFC" />

  <!-- Master Title Banner -->
  <g class="font-sans shadow">
    <rect x="40" y="24" width="${pageWidth - 80}" height="76" rx="8" fill="#0F172A" stroke="#38BDF8" stroke-width="2" />
    <text x="${pageWidth / 2}" y="56" fill="#F8FAFC" font-size="20" font-weight="bold" text-anchor="middle">LUISIANA INFA-TRACK — COMPLETE POSTGRESQL DATABASE ARCHITECTURE (ERD)</text>
    <text x="${pageWidth / 2}" y="82" fill="#94A3B8" font-size="13" text-anchor="middle">Municipality of Luisiana, Laguna • 33 Production Relational Tables • 401 Attributes • 3rd Normal Form (3NF) Relational Schema</text>
  </g>

  <!-- Module Background Frames -->
  <!-- Frame 1: Masterlists & RBAC -->
  <rect x="45" y="115" width="770" height="${pageHeight - 145}" rx="8" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="1.5" stroke-dasharray="6 4" />
  <text x="60" y="132" class="font-sans" font-size="12" font-weight="bold" fill="#166534">1. MASTERLISTS &amp; AUTH SECURITY (Columns 1 - 2)</text>

  <!-- Frame 2: Citizen Permitting 3NF -->
  <rect x="825" y="115" width="790" height="${pageHeight - 145}" rx="8" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="1.5" stroke-dasharray="6 4" />
  <text x="840" y="132" class="font-sans" font-size="12" font-weight="bold" fill="#1E3A8A">2. CITIZEN PERMITTING &amp; 3NF APPLICATION LIFECYCLE (Columns 3 - 4)</text>

  <!-- Frame 3: Municipal Infrastructure & 3D WebGL -->
  <rect x="1625" y="115" width="795" height="${pageHeight - 145}" rx="8" fill="#F0FDFA" stroke="#99F6E4" stroke-width="1.5" stroke-dasharray="6 4" />
  <text x="1640" y="132" class="font-sans" font-size="12" font-weight="bold" fill="#115E59">3. MUNICIPAL INFRASTRUCTURE, 3D WEBGL &amp; FIELD INSPECTIONS (Columns 5 - 6)</text>

  <!-- Frame 4: Planning & Governance -->
  <rect x="2430" y="115" width="390" height="${pageHeight - 145}" rx="8" fill="#FAF5FF" stroke="#E9D5FF" stroke-width="1.5" stroke-dasharray="6 4" />
  <text x="2445" y="132" class="font-sans" font-size="12" font-weight="bold" fill="#6B21A8">4. URBAN PLANNING &amp; GOVERNANCE (Col 7)</text>

  <!-- Frame 5: DMS & Disaster Risk -->
  <rect x="2830" y="115" width="400" height="${pageHeight - 145}" rx="8" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1.5" stroke-dasharray="6 4" />
  <text x="2845" y="132" class="font-sans" font-size="12" font-weight="bold" fill="#9F1239">5. DMS &amp; DISASTER RESILIENCE (Col 8)</text>
`;

  // Render Table Cards
  for (const [tblName, table] of Object.entries(tablePositions)) {
    svg += `
  <!-- Table: ${table.name} -->
  <g class="font-sans shadow" id="${table.id}">
    <!-- Table Outer Box -->
    <rect x="${table.x}" y="${table.y}" width="${table.width}" height="${table.height}" rx="6" fill="#FFFFFF" stroke="${table.borderColor}" stroke-width="1.8" />
    
    <!-- Table Header -->
    <path d="M ${table.x} ${table.y + 6} Q ${table.x} ${table.y} ${table.x + 6} ${table.y} L ${table.x + table.width - 6} ${table.y} Q ${table.x + table.width} ${table.y} ${table.x + table.width} ${table.y + 6} L ${table.x + table.width} ${table.y + headerHeight} L ${table.x} ${table.y + headerHeight} Z" fill="${table.headerColor}" />
    <text x="${table.x + table.width / 2}" y="${table.y + 19}" fill="#FFFFFF" font-size="12" font-weight="bold" text-anchor="middle">${escapeHtml(table.name)}</text>
`;

    table.columns.forEach((col, index) => {
      const rowY = table.y + headerHeight + index * rowHeight;
      let rowBg = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      let fontColor = '#334155';
      let fontWeight = 'normal';
      let badge = '';

      if (col.isPk) {
        rowBg = '#FEF3C7';
        fontColor = '#92400E';
        fontWeight = 'bold';
        badge = 'PK ';
      } else if (col.isFk) {
        rowBg = '#E0F2FE';
        fontColor = '#0369A1';
        fontWeight = 'bold';
        badge = 'FK ';
      }

      svg += `    <!-- Row ${index}: ${col.name} -->
    <rect x="${table.x}" y="${rowY}" width="${table.width}" height="${rowHeight}" fill="${rowBg}" />
    <text x="${table.x + 10}" y="${rowY + 15}" fill="${fontColor}" font-size="10.5" font-weight="${fontWeight}">${escapeHtml(badge + col.name)} <tspan fill="#64748B" font-weight="normal">: ${escapeHtml(col.type)}</tspan></text>
`;
    });

    svg += `  </g>\n`;
  }

  // Draw Relational Connector Lines
  // Define key visual connectors between related tables
  const connections = [
    // applicants -> citizen_applications
    { from: 'applicants', to: 'citizen_applications', color: '#2563EB', label: 'submits (1:N)' },
    // citizen_applications -> application_locations
    { from: 'citizen_applications', to: 'application_locations', color: '#2563EB', label: 'lot details (1:1)' },
    // citizen_applications -> application_payments
    { from: 'citizen_applications', to: 'application_payments', color: '#2563EB', label: 'treasury (1:1)' },
    // citizen_applications -> engineering_reviews
    { from: 'citizen_applications', to: 'engineering_reviews', color: '#2563EB', label: 'engineer review (1:1)' },
    // citizen_applications -> municipal_projects
    { from: 'citizen_applications', to: 'municipal_projects', color: '#0D9488', label: 'promoted project (0..1:1)' },
    // municipal_projects -> project_milestones
    { from: 'municipal_projects', to: 'project_milestones', color: '#0D9488', label: 'milestones (1:N)' },
    // municipal_projects -> meo_inspection_schedules
    { from: 'municipal_projects', to: 'meo_inspection_schedules', color: '#0D9488', label: 'inspections (1:N)' },
    // planning_proposals -> municipal_projects
    { from: 'planning_proposals', to: 'municipal_projects', color: '#8B5CF6', label: 'allocates (0..1:1)' },
    // municipal_documents -> document_versions
    { from: 'municipal_documents', to: 'document_versions', color: '#F43F5E', label: 'versions (1:N)' }
  ];

  svg += `  <!-- Relational Connectors -->\n`;
  for (const conn of connections) {
    const tFrom = tablePositions[conn.from];
    const tTo = tablePositions[conn.to];
    if (!tFrom || !tTo) continue;

    const x1 = tFrom.x + tFrom.width;
    const y1 = tFrom.y + 35;
    const x2 = tTo.x;
    const y2 = tTo.y + 35;
    const midX = (x1 + x2) / 2;

    svg += `  <g class="font-sans">
    <path d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" fill="none" stroke="${conn.color}" stroke-width="2" stroke-linecap="round" />
    <circle cx="${x1}" cy="${y1}" r="3" fill="${conn.color}" />
    <polygon points="${x2},${y2} ${x2 - 6},${y2 - 3} ${x2 - 6},${y2 + 3}" fill="${conn.color}" />
    <rect x="${midX - 45}" y="${(y1 + y2) / 2 - 9}" width="90" height="18" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" />
    <text x="${midX}" y="${(y1 + y2) / 2 + 3}" fill="${conn.color}" font-size="8.5" font-weight="bold" text-anchor="middle">${conn.label}</text>
  </g>\n`;
  }

  svg += `</svg>`;
  return svg;
}

const svgContent = buildSvg();
const svgPath = path.resolve('luisiana_infatrack_database_erd.svg');
fs.writeFileSync(svgPath, svgContent, 'utf8');
console.log('Successfully saved SVG image at:', svgPath);

// Render SVG to PNG using resvg
console.log('Rendering high-resolution PNG photo...');
const resvg = new Resvg(svgContent, {
  fitTo: {
    mode: 'zoom',
    value: 1.0
  }
});
const pngData = resvg.render();
const pngBuffer = pngData.asPng();

const pngPath = path.resolve('luisiana_infatrack_database_erd.png');
fs.writeFileSync(pngPath, pngBuffer);
console.log('Successfully generated PNG photo at:', pngPath, 'Size:', pngBuffer.length, 'bytes');

// Also copy to brain artifact directory for in-chat display
const brainDir = 'C:\\Users\\kingking\\.gemini\\antigravity\\brain\\33794413-f5ea-4558-9928-1c28770a996a';
if (fs.existsSync(brainDir)) {
  const artifactPng = path.join(brainDir, 'luisiana_infatrack_database_erd.png');
  fs.writeFileSync(artifactPng, pngBuffer);
  console.log('Successfully copied PNG to brain artifact directory:', artifactPng);
}

