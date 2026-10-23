import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

// Load env
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const client = new pg.Client({
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "luisiana_infatrack",
  password: process.env.PGPASSWORD,
  port: Number(process.env.PGPORT || 5432),
});

async function main() {
  await client.connect();
  console.log("Connected to PostgreSQL: fetching tables, columns, and foreign keys...");

  // 1. Fetch tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Found ${tables.length} tables in PostgreSQL.`);

  // 2. Fetch columns
  const colsRes = await client.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default, character_maximum_length
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  // 3. Fetch primary keys
  const pkRes = await client.query(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
  `);
  const pkMap = new Set(pkRes.rows.map(r => `${r.table_name}.${r.column_name}`));

  // 4. Fetch foreign keys
  const fkRes = await client.query(`
    SELECT 
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu 
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  `);
  const fkMap = new Set(fkRes.rows.map(r => `${r.table_name}.${r.column_name}`));
  const relationships = fkRes.rows;

  await client.end();

  // Group columns by table
  const tableData = {};
  for (const t of tables) {
    const cols = colsRes.rows.filter(c => c.table_name === t);
    tableData[t] = cols.map(c => {
      let typeStr = c.data_type;
      if (typeStr === "character varying") {
        typeStr = c.character_maximum_length ? `varchar(${c.character_maximum_length})` : "varchar";
      } else if (typeStr === "timestamp with time zone") {
        typeStr = "timestamptz";
      } else if (typeStr === "double precision") {
        typeStr = "double";
      } else if (typeStr === "integer") {
        typeStr = "int";
      }
      const isPk = pkMap.has(`${t}.${c.column_name}`);
      const isFk = fkMap.has(`${t}.${c.column_name}`);
      return {
        name: c.column_name,
        type: typeStr,
        isPk,
        isFk,
      };
    });
  }

  const ROW_H = 24;
  const HEADER_H = 30;
  function calcTableHeight(tblName) {
    const count = (tableData[tblName] || []).length;
    return HEADER_H + count * ROW_H + 6;
  }

  // Module themes & configs
  const modulesDef = [
    {
      id: "mod_master",
      title: "1. SYSTEM MASTERLISTS & CONFIGURATION",
      theme: { headerFill: "#065f46", border: "#10b981", accent: "#34d399", fill: "#022c22" },
      // Vertical placement within module
      columns: [
        ["system_config", "barangays", "system_masterlists"]
      ],
      colWidth: 300,
    },
    {
      id: "mod_auth",
      title: "2. AUTHENTICATION, RBAC & AUDIT SECURITY",
      theme: { headerFill: "#3730a3", border: "#6366f1", accent: "#818cf8", fill: "#1e1b4b" },
      // 2 columns within module
      columns: [
        ["staff_accounts"],
        ["user_sessions", "audit_logs", "security_quarantine_logs"]
      ],
      colWidth: 300,
    },
    {
      id: "mod_permits",
      title: "3. NORMALIZED CITIZEN APPLICATIONS & PERMITS (3NF)",
      theme: { headerFill: "#0369a1", border: "#0284c7", accent: "#38bdf8", fill: "#082f49" },
      // 2 columns within module (Core permit flow on left, Supporting on right)
      columns: [
        ["applicants", "citizen_applications", "application_locations", "application_payments", "engineering_reviews"],
        ["application_documents", "application_remarks", "site_inspection_photos", "user_terms_consents"]
      ],
      colWidth: 310,
    },
    {
      id: "mod_projects",
      title: "4. MUNICIPAL INFRASTRUCTURE & 3D WEBGL PROJECTS",
      theme: { headerFill: "#6b21a8", border: "#a855f7", accent: "#c084fc", fill: "#3b0764" },
      columns: [
        ["municipal_projects"],
        ["project_milestones", "project_issues", "project_photos", "project_activity_logs"]
      ],
      colWidth: 310,
    },
    {
      id: "mod_planning",
      title: "5. PARTICIPATORY URBAN PLANNING & SOCIAL CONSULTATIONS",
      theme: { headerFill: "#92400e", border: "#f59e0b", accent: "#fbbf24", fill: "#451a03" },
      columns: [
        ["planning_proposals"],
        ["proposal_votes", "proposal_comments", "proposal_approvals", "planning_events", "planning_meetings"]
      ],
      colWidth: 300,
    },
    {
      id: "mod_docs_disaster",
      title: "6. MUNICIPAL DOCUMENTS & DISASTER RISK RESILIENCE",
      theme: { headerFill: "#9f1239", border: "#f43f5e", accent: "#fb7185", fill: "#4c0519" },
      columns: [
        ["municipal_documents", "document_versions"],
        ["citizen_engagements", "disaster_hazard_alerts", "disaster_backups"]
      ],
      colWidth: 300,
    },
  ];

  // Helper to layout tables within a module given an origin (startX, startY)
  function layoutModule(mod, startX, startY) {
    const GAP_X = 35;
    const GAP_Y = 30;
    const positions = {};
    let currentX = startX + 30;
    let maxModY = startY + 50;

    mod.columns.forEach((colTables, colIdx) => {
      let currentY = startY + 50;
      colTables.forEach((tbl) => {
        const th = calcTableHeight(tbl);
        positions[tbl] = {
          x: currentX,
          y: currentY,
          width: mod.colWidth,
          height: th,
          id: `tbl_${tbl}`,
          mod: mod.id,
        };
        currentY += th + GAP_Y;
      });
      if (currentY > maxModY) maxModY = currentY;
      currentX += mod.colWidth + GAP_X;
    });

    const totalW = (currentX - startX) + 10;
    const totalH = (maxModY - startY) + 15;

    return {
      positions,
      frame: {
        id: `frame_${mod.id}`,
        title: mod.title,
        theme: mod.theme,
        x: startX,
        y: startY,
        width: totalW,
        height: totalH,
      }
    };
  }

  // Function to generate XML cells for a set of table positions and relationships
  function generateCells(tablePositionsMap, frameList, isDedicatedPage = false) {
    let xml = "";

    // 1. Frames
    for (const f of frameList) {
      xml += `
        <!-- Section Frame: ${f.title} -->
        <mxCell id="${f.id}" value="${f.title}" style="swimlane;fontStyle=1;align=left;spacingLeft=15;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=32;horizontalStack=0;resizeParent=0;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;fillColor=#111827;swimlaneFillColor=${f.theme.fill};strokeColor=${f.theme.border};strokeWidth=2;fontColor=#ffffff;fontSize=13;shadow=1;rounded=1;" vertex="1" parent="1">
          <mxGeometry x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" as="geometry" />
        </mxCell>
`;
    }

    // 2. Tables & Columns
    for (const [tblName, pos] of Object.entries(tablePositionsMap)) {
      const cols = tableData[tblName] || [];
      const modDef = modulesDef.find(m => m.id === pos.mod) || modulesDef[0];
      const theme = modDef.theme;

      // Table container
      xml += `
        <!-- Table: ${tblName} -->
        <mxCell id="${pos.id}" value="${tblName}" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=28;horizontalStack=0;resizeParent=0;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;fillColor=${theme.headerFill};strokeColor=${theme.border};strokeWidth=1.8;fontColor=#ffffff;fontSize=12;shadow=1;rounded=1;" vertex="1" parent="1">
          <mxGeometry x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" as="geometry" />
        </mxCell>
`;

      // Columns
      cols.forEach((col, idx) => {
        const rowId = `${pos.id}_col_${col.name}`;
        const prefix = col.isPk ? "🔑 " : (col.isFk ? "🔗 " : "   ");
        const fontStyle = col.isPk ? "fontStyle=1;" : "";
        const rowFill = idx % 2 === 0 ? "#1e293b" : "#131d2e";
        const fontColor = col.isPk ? "#fbbf24" : (col.isFk ? "#38bdf8" : "#cbd5e1");
        const cellText = `${prefix}${col.name} : ${col.type}`;

        xml += `        <mxCell id="${rowId}" value="${cellText}" style="text;strokeColor=none;fillColor=${rowFill};align=left;verticalAlign=middle;spacingLeft=8;spacingRight=8;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;dropTarget=0;whiteSpace=wrap;html=1;fontSize=10;fontColor=${fontColor};${fontStyle}" vertex="1" parent="${pos.id}">
          <mxGeometry y="${28 + idx * ROW_H}" width="${pos.width}" height="${ROW_H}" as="geometry" />
        </mxCell>
`;
      });
    }

    // 3. Relationships
    let relId = 10000;
    for (const rel of relationships) {
      const srcTbl = rel.table_name;
      const tgtTbl = rel.foreign_table_name;
      const srcPos = tablePositionsMap[srcTbl];
      const tgtPos = tablePositionsMap[tgtTbl];

      if (!srcPos || !tgtPos) continue;

      const edgeId = `edge_${relId++}_${isDedicatedPage ? 'd' : 'm'}`;
      const modDef = modulesDef.find(m => m.id === srcPos.mod) || modulesDef[0];

      xml += `
        <!-- FK: ${srcTbl}.${rel.column_name} -> ${tgtTbl}.${rel.foreign_column_name} -->
        <mxCell id="${edgeId}" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${modDef.theme.accent};strokeWidth=1.8;dashed=0;endArrow=ERmany;startArrow=ERone;fontColor=#94a3b8;fontSize=9;" edge="1" parent="1" source="${srcPos.id}" target="${tgtPos.id}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
`;
    }

    return xml;
  }

  // ---------------------------------------------------------------------------
  // PAGE 1: ALL MODULES (Side-by-side Vertical Pillars - "Patayo per Color")
  // ---------------------------------------------------------------------------
  let pillarX = 40;
  const PILLAR_Y = 80;
  const PILLAR_GAP = 40;
  const allTablePositions = {};
  const allFrameBoxes = [];

  modulesDef.forEach((mod) => {
    const res = layoutModule(mod, pillarX, PILLAR_Y);
    Object.assign(allTablePositions, res.positions);
    allFrameBoxes.push(res.frame);
    pillarX += res.frame.width + PILLAR_GAP;
  });

  const ALL_CANVAS_W = pillarX + 20;
  let maxPillarH = 0;
  allFrameBoxes.forEach(f => {
    if (f.height > maxPillarH) maxPillarH = f.height;
  });
  const ALL_CANVAS_H = PILLAR_Y + maxPillarH + 60;

  console.log(`Page 1 (All Modules Pillars): Width ${ALL_CANVAS_W} x Height ${ALL_CANVAS_H}`);

  // Build Multi-Page Draw.io XML
  let fullXml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="LUISIANA-INFATRACK" version="24.7.17">
  <!-- ===================================================================== -->
  <!-- TAB 1: OVERVIEW - ALL 6 MODULES (VERTICAL PILLARS PER COLOR)           -->
  <!-- ===================================================================== -->
  <diagram id="diag_all" name="ALL MODULES (Vertical Pillars)">
    <mxGraphModel dx="1600" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${ALL_CANVAS_W}" pageHeight="${ALL_CANVAS_H}" background="#0b1120" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Master Title Banner -->
        <mxCell id="title_banner_all" value="LUISIANA INFA-TRACK: COMPLETE POSTGRESQL DATABASE ARCHITECTURE&#xa;32 Production Relational Tables — Vertical Pillar View per Module (Zero Overlaps / 100% Normalized)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#1e293b;strokeColor=#38bdf8;strokeWidth=2;fontColor=#ffffff;fontSize=18;fontStyle=1;align=center;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="16" width="${ALL_CANVAS_W - 80}" height="46" as="geometry" />
        </mxCell>
${generateCells(allTablePositions, allFrameBoxes, false)}
      </root>
    </mxGraphModel>
  </diagram>
`;

  // ---------------------------------------------------------------------------
  // TABS 2-7: DEDICATED VERTICAL SCREENSHOT PAGES FOR EACH MODULE
  // ---------------------------------------------------------------------------
  modulesDef.forEach((mod, idx) => {
    const res = layoutModule(mod, 40, 80);
    const pageW = res.frame.width + 80;
    const pageH = res.frame.height + 120;
    const tabName = `${idx + 1}. ${mod.title.split('.')[1]?.trim() || mod.title}`;

    fullXml += `
  <!-- ===================================================================== -->
  <!-- TAB ${idx + 2}: ${mod.title}                                            -->
  <!-- ===================================================================== -->
  <diagram id="diag_${mod.id}" name="${tabName}">
    <mxGraphModel dx="1600" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" background="#0b1120" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Banner -->
        <mxCell id="banner_${mod.id}" value="${mod.title}&#xa;LUISIANA INFA-TRACK System Architecture — High-Resolution Vertical Screenshot View" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#1e293b;strokeColor=${mod.theme.border};strokeWidth=2;fontColor=#ffffff;fontSize=16;fontStyle=1;align=center;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="16" width="${res.frame.width}" height="46" as="geometry" />
        </mxCell>
${generateCells(res.positions, [res.frame], true)}
      </root>
    </mxGraphModel>
  </diagram>
`;
  });

  fullXml += `</mxfile>
`;

  // Save to all target files
  const filesToSave = [
    path.resolve(ROOT_DIR, "luisiana_infatrack_complete_schema.drawio"),
    path.resolve(ROOT_DIR, "luisiana_infatrack_complete_schema.xml"),
    path.resolve(ROOT_DIR, "luisiana_normalized_schema.drawio"),
    path.resolve(ROOT_DIR, "luisiana_normalized_schema.xml"),
    path.resolve(ROOT_DIR, "luisiana_postgres_schema.drawio"),
    path.resolve(ROOT_DIR, "luisiana_postgres_schema.xml"),
  ];

  for (const fp of filesToSave) {
    fs.writeFileSync(fp, fullXml, "utf8");
    console.log(`Saved: ${fp}`);
  }

  console.log(`\n==================================================================`);
  console.log(`  MULTI-TAB VERTICAL SCREENSHOT DRAW.IO FILE GENERATED!`);
  console.log(`  Features:`);
  console.log(`    - Tab 1: All 6 Modules side-by-side as vertical pillars`);
  console.log(`    - Tabs 2-7: Individual dedicated pages per color/module`);
  console.log(`    - Formatted patayo (vertical), zero overlaps, crystal clear!`);
  console.log(`==================================================================\n`);
}

main().catch(console.error);
