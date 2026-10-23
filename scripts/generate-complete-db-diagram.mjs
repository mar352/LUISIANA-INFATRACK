import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// Load env
const envPath = path.resolve(ROOT_DIR, "backend/.env");
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

  // Define logical functional modules and layout positions
  const modules = [
    {
      id: "mod_master",
      title: "1. SYSTEM MASTERLISTS & CONFIGURATION",
      color: "#059669",
      headerFill: "#065f46",
      tables: ["system_config", "barangays", "system_masterlists"],
      x: 40,
      y: 60,
      colsPerRow: 3,
      tableWidth: 260,
    },
    {
      id: "mod_auth",
      title: "2. AUTHENTICATION, RBAC & AUDIT SECURITY",
      color: "#4f46e5",
      headerFill: "#3730a3",
      tables: ["staff_accounts", "user_sessions", "audit_logs", "security_quarantine_logs"],
      x: 900,
      y: 60,
      colsPerRow: 4,
      tableWidth: 260,
    },
    {
      id: "mod_permits",
      title: "3. NORMALIZED CITIZEN APPLICATIONS & PERMITS (3NF)",
      color: "#0284c7",
      headerFill: "#0369a1",
      tables: [
        "applicants",
        "citizen_applications",
        "application_locations",
        "application_payments",
        "engineering_reviews",
        "application_documents",
        "application_remarks",
        "site_inspection_photos",
        "user_terms_consents"
      ],
      x: 40,
      y: 440,
      colsPerRow: 5,
      tableWidth: 270,
    },
    {
      id: "mod_projects",
      title: "4. MUNICIPAL INFRASTRUCTURE & 3D WEBGL PROJECTS",
      color: "#7c3aed",
      headerFill: "#5b21b6",
      tables: [
        "municipal_projects",
        "project_milestones",
        "project_issues",
        "project_photos",
        "project_activity_logs"
      ],
      x: 40,
      y: 980,
      colsPerRow: 5,
      tableWidth: 270,
    },
    {
      id: "mod_planning",
      title: "5. PARTICIPATORY URBAN PLANNING & SOCIAL CONSULTATIONS",
      color: "#d97706",
      headerFill: "#b45309",
      tables: [
        "planning_proposals",
        "proposal_votes",
        "proposal_comments",
        "proposal_approvals",
        "planning_events",
        "planning_meetings"
      ],
      x: 40,
      y: 1480,
      colsPerRow: 6,
      tableWidth: 260,
    },
    {
      id: "mod_docs_disaster",
      title: "6. MUNICIPAL DOCUMENTS, ENGAGEMENTS & DISASTER RISK RESILIENCE",
      color: "#dc2626",
      headerFill: "#991b1b",
      tables: [
        "municipal_documents",
        "document_versions",
        "citizen_engagements",
        "disaster_hazard_alerts",
        "disaster_backups"
      ],
      x: 40,
      y: 1980,
      colsPerRow: 5,
      tableWidth: 270,
    }
  ];

  // Calculate table positions and heights
  const tablePositions = {};
  const tableElements = [];
  let idCounter = 100;

  for (const mod of modules) {
    let colIdx = 0;
    let rowIdx = 0;
    let rowMaxHeight = 0;
    let currentY = mod.y + 60;

    for (const t of mod.tables) {
      if (!tableData[t]) {
        console.warn(`Table ${t} not found in database!`);
        continue;
      }
      const cols = tableData[t];
      const tableHeight = 45 + cols.length * 24 + 10;

      if (colIdx >= mod.colsPerRow) {
        colIdx = 0;
        rowIdx++;
        currentY += rowMaxHeight + 40;
        rowMaxHeight = 0;
      }

      const tableX = mod.x + colIdx * (mod.tableWidth + 40);
      const tableY = currentY;

      tablePositions[t] = {
        x: tableX,
        y: tableY,
        width: mod.tableWidth,
        height: tableHeight,
        id: `tbl_${t}`,
      };

      if (tableHeight > rowMaxHeight) {
        rowMaxHeight = tableHeight;
      }

      colIdx++;
    }
  }

  // Build Draw.io XML
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="LUISIANA-INFATRACK" version="24.7.17">
  <diagram id="luisiana_infatrack_schema" name="LUISIANA INFA-TRACK - Complete Database Schema">
    <mxGraphModel dx="1600" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="3300" pageHeight="2600" background="#121824" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Title Banner -->
        <mxCell id="title_banner" value="LUISIANA INFA-TRACK: IMPACT LUISIANA DATABASE ARCHITECTURE&#xa;Complete 32-Table Relational Schema (PostgreSQL 14+ / PostGIS) — Normalized 3NF" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#1e293b;strokeColor=#38bdf8;strokeWidth=2;fontColor=#ffffff;fontSize=20;fontStyle=1;align=center;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="10" width="2300" height="40" as="geometry" />
        </mxCell>
`;

  // Draw module background frames
  for (const mod of modules) {
    const modBoxId = `frame_${mod.id}`;
    let maxTableY = mod.y + 60;
    for (const t of mod.tables) {
      if (tablePositions[t]) {
        const bottom = tablePositions[t].y + tablePositions[t].height;
        if (bottom > maxTableY) maxTableY = bottom;
      }
    }
    const frameHeight = maxTableY - mod.y + 30;

    xml += `
        <!-- Section: ${mod.title} -->
        <mxCell id="${modBoxId}" value="${mod.title}" style="swimlane;fontStyle=1;align=left;spacingLeft=15;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=32;horizontalStack=0;resizeParent=0;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;fillColor=#1e293b;swimlaneFillColor=#0f172a;strokeColor=${mod.color};strokeWidth=2;fontColor=#ffffff;fontSize=13;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="${mod.x - 15}" y="${mod.y}" width="2300" height="${frameHeight}" as="geometry" />
        </mxCell>
`;
  }

  // Draw tables
  for (const mod of modules) {
    for (const t of mod.tables) {
      const pos = tablePositions[t];
      if (!pos) continue;
      const cols = tableData[t];

      // Table container
      xml += `
        <!-- Table: ${t} -->
        <mxCell id="${pos.id}" value="${t}" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=30;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;fillColor=${mod.headerFill};strokeColor=${mod.color};strokeWidth=2;fontColor=#ffffff;fontSize=12;shadow=1;rounded=1;" vertex="1" parent="1">
          <mxGeometry x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" as="geometry" />
        </mxCell>
`;

      // Rows
      cols.forEach((col, idx) => {
        const rowId = `${pos.id}_col_${col.name}`;
        const prefix = col.isPk ? "🔑 " : (col.isFk ? "🔗 " : "   ");
        const fontStyle = col.isPk ? "fontStyle=1;" : "";
        const rowFill = idx % 2 === 0 ? "#1e293b" : "#172033";
        const fontColor = col.isPk ? "#fbbf24" : (col.isFk ? "#38bdf8" : "#e2e8f0");
        const cellText = `${prefix}${col.name} : ${col.type}`;

        xml += `        <mxCell id="${rowId}" value="${cellText}" style="text;strokeColor=none;fillColor=${rowFill};align=left;verticalAlign=middle;spacingLeft=8;spacingRight=8;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;dropTarget=0;whiteSpace=wrap;html=1;fontSize=10;fontColor=${fontColor};${fontStyle}" vertex="1" parent="${pos.id}">
          <mxGeometry y="${30 + idx * 24}" width="${pos.width}" height="24" as="geometry" />
        </mxCell>
`;
      });
    }
  }

  // Draw foreign key relationship connectors
  let relId = 5000;
  for (const rel of relationships) {
    const srcTbl = rel.table_name;
    const tgtTbl = rel.foreign_table_name;
    const srcPos = tablePositions[srcTbl];
    const tgtPos = tablePositions[tgtTbl];

    if (!srcPos || !tgtPos) continue;

    const edgeId = `edge_${relId++}`;
    const label = `${rel.column_name} → ${rel.foreign_column_name}`;

    xml += `
        <!-- FK: ${srcTbl}.${rel.column_name} -> ${tgtTbl}.${rel.foreign_column_name} -->
        <mxCell id="${edgeId}" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#38bdf8;strokeWidth=1.8;dashed=0;endArrow=ERmany;startArrow=ERone;fontColor=#94a3b8;fontSize=9;" edge="1" parent="1" source="${srcPos.id}" target="${tgtPos.id}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
`;
  }

  xml += `      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;

  // Output files
  const completeDrawioPath = path.resolve(ROOT_DIR, "luisiana_infatrack_complete_schema.drawio");
  const completeXmlPath = path.resolve(ROOT_DIR, "luisiana_infatrack_complete_schema.xml");
  const normDrawioPath = path.resolve(ROOT_DIR, "luisiana_normalized_schema.drawio");
  const normXmlPath = path.resolve(ROOT_DIR, "luisiana_normalized_schema.xml");
  const pgXmlPath = path.resolve(ROOT_DIR, "luisiana_postgres_schema.xml");
  const pgDrawioPath = path.resolve(ROOT_DIR, "luisiana_postgres_schema.drawio");

  fs.writeFileSync(completeDrawioPath, xml, "utf8");
  fs.writeFileSync(completeXmlPath, xml, "utf8");
  fs.writeFileSync(normDrawioPath, xml, "utf8");
  fs.writeFileSync(normXmlPath, xml, "utf8");
  fs.writeFileSync(pgXmlPath, xml, "utf8");
  fs.writeFileSync(pgDrawioPath, xml, "utf8");

  console.log(`\n==================================================================`);
  console.log(`  DRAW.IO COMPLETE 32-TABLE SCHEMA GENERATED SUCCESSFULLY!`);
  console.log(`  Target files updated:`);
  console.log(`    - ${completeDrawioPath}`);
  console.log(`    - ${completeXmlPath}`);
  console.log(`    - ${normDrawioPath}`);
  console.log(`    - ${normXmlPath}`);
  console.log(`    - ${pgXmlPath}`);
  console.log(`==================================================================\n`);
}

main().catch(console.error);
