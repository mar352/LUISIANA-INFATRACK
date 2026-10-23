import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

// Load environment variables
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

  // ---------------------------------------------------------------------------
  // 16:9 WIDESCREEN GEOMETRY ENGINE
  // Canvas Width: 4160px | Canvas Height: 2340px (Exactly 16:9 aspect ratio)
  // ---------------------------------------------------------------------------
  const CANVAS_W = 4160;
  const CANVAS_H = 2340;
  const ROW_H = 22;
  const HEADER_H = 28;

  function calcTableHeight(tblName) {
    const count = (tableData[tblName] || []).length;
    return HEADER_H + count * ROW_H + 6;
  }

  const tablePositions = {};
  const frameBoxes = [];

  // Theme definition
  const themeColors = {
    mod_master: { headerFill: "#065f46", border: "#10b981", accent: "#34d399", fill: "#022c22" },
    mod_auth: { headerFill: "#3730a3", border: "#6366f1", accent: "#818cf8", fill: "#1e1b4b" },
    mod_permits: { headerFill: "#0369a1", border: "#0284c7", accent: "#38bdf8", fill: "#082f49" },
    mod_projects: { headerFill: "#6b21a8", border: "#a855f7", accent: "#c084fc", fill: "#3b0764" },
    mod_planning: { headerFill: "#92400e", border: "#f59e0b", accent: "#fbbf24", fill: "#451a03" },
    mod_docs_disaster: { headerFill: "#9f1239", border: "#f43f5e", accent: "#fb7185", fill: "#4c0519" },
  };

  // ---------------------------------------------------------------------------
  // BAND 1 (TOP): 3 Modules side-by-side
  // Y: 75px to 680px (Height: 605px)
  // ---------------------------------------------------------------------------
  const BAND1_Y = 75;
  const BAND1_H = 605;

  // 1. Module 1: Masterlists & Config (3 tables)
  // Width: 900px (x: 50 to 950)
  const mod1Tables = ["system_config", "barangays", "system_masterlists"];
  const MOD1_X = 50;
  const MOD1_W = 900;
  const MOD1_TBL_W = 265;
  const MOD1_GAP = 25;
  mod1Tables.forEach((t, i) => {
    const th = calcTableHeight(t);
    const tx = MOD1_X + 25 + i * (MOD1_TBL_W + MOD1_GAP);
    const ty = BAND1_Y + 45;
    tablePositions[t] = { x: tx, y: ty, width: MOD1_TBL_W, height: th, id: `tbl_${t}`, mod: "mod_master" };
  });
  frameBoxes.push({
    id: "frame_mod_master",
    title: "1. SYSTEM MASTERLISTS & CONFIGURATION",
    theme: themeColors.mod_master,
    x: MOD1_X,
    y: BAND1_Y,
    width: MOD1_W,
    height: BAND1_H,
  });

  // 2. Module 2: Authentication, RBAC & Security (4 tables)
  // Width: 1220px (x: 980 to 2200)
  const mod2Tables = ["staff_accounts", "user_sessions", "audit_logs", "security_quarantine_logs"];
  const MOD2_X = 980;
  const MOD2_W = 1220;
  const MOD2_TBL_W = 270;
  const MOD2_GAP = 25;
  mod2Tables.forEach((t, i) => {
    const th = calcTableHeight(t);
    const tx = MOD2_X + 25 + i * (MOD2_TBL_W + MOD2_GAP);
    const ty = BAND1_Y + 45;
    tablePositions[t] = { x: tx, y: ty, width: MOD2_TBL_W, height: th, id: `tbl_${t}`, mod: "mod_auth" };
  });
  frameBoxes.push({
    id: "frame_mod_auth",
    title: "2. AUTHENTICATION, RBAC & AUDIT SECURITY",
    theme: themeColors.mod_auth,
    x: MOD2_X,
    y: BAND1_Y,
    width: MOD2_W,
    height: BAND1_H,
  });

  // 3. Module 6: Municipal Documents, Citizen Engagements & Disaster (5 tables)
  // Width: 1840px (x: 2230 to 4070)
  const mod6Tables = ["municipal_documents", "document_versions", "citizen_engagements", "disaster_hazard_alerts", "disaster_backups"];
  const MOD6_X = 2230;
  const MOD6_W = 1880;
  const MOD6_TBL_W = 275;
  const MOD6_GAP = 30;
  mod6Tables.forEach((t, i) => {
    const th = calcTableHeight(t);
    const tx = MOD6_X + 30 + i * (MOD6_TBL_W + MOD6_GAP);
    const ty = BAND1_Y + 45;
    tablePositions[t] = { x: tx, y: ty, width: MOD6_TBL_W, height: th, id: `tbl_${t}`, mod: "mod_docs_disaster" };
  });
  frameBoxes.push({
    id: "frame_mod_docs_disaster",
    title: "6. MUNICIPAL DOCUMENTS, CITIZEN ENGAGEMENTS & DISASTER RISK RESILIENCE",
    theme: themeColors.mod_docs_disaster,
    x: MOD6_X,
    y: BAND1_Y,
    width: MOD6_W,
    height: BAND1_H,
  });

  // ---------------------------------------------------------------------------
  // BAND 2 (MIDDLE): Module 3 - Normalized Citizen Permits (3NF)
  // Spans full 4060px width with all 9 tables in one streamlined horizontal row!
  // Y: 710px to 1340px (Height: 630px)
  // ---------------------------------------------------------------------------
  const BAND2_Y = 710;
  const BAND2_H = 630;
  const MOD3_X = 50;
  const MOD3_W = 4060;

  // 9 Tables: 5 core on the left, 4 supporting on the right
  const mod3Core = ["applicants", "citizen_applications", "application_locations", "application_payments", "engineering_reviews"];
  const mod3Supp = ["application_documents", "application_remarks", "site_inspection_photos", "user_terms_consents"];

  const MOD3_TBL_W = 275;
  const MOD3_GAP_CORE = 35;
  const CORE_START_X = MOD3_X + 30;
  mod3Core.forEach((t, i) => {
    const th = calcTableHeight(t);
    const tx = CORE_START_X + i * (MOD3_TBL_W + MOD3_GAP_CORE);
    const ty = BAND2_Y + 45;
    tablePositions[t] = { x: tx, y: ty, width: MOD3_TBL_W, height: th, id: `tbl_${t}`, mod: "mod_permits" };
  });

  // Divider spacing of 100px between core permit flow and supporting docs/logs
  const SUPP_START_X = CORE_START_X + mod3Core.length * (MOD3_TBL_W + MOD3_GAP_CORE) + 70;
  const MOD3_GAP_SUPP = 35;
  mod3Supp.forEach((t, i) => {
    const th = calcTableHeight(t);
    const tx = SUPP_START_X + i * (MOD3_TBL_W + MOD3_GAP_SUPP);
    const ty = BAND2_Y + 45;
    tablePositions[t] = { x: tx, y: ty, width: MOD3_TBL_W, height: th, id: `tbl_${t}`, mod: "mod_permits" };
  });

  frameBoxes.push({
    id: "frame_mod_permits",
    title: "3. NORMALIZED CITIZEN APPLICATIONS & PERMITS (3NF) — [LEFT: CORE APPLICATION WORKFLOW  |  RIGHT: VERIFICATION & COMPLIANCE]",
    theme: themeColors.mod_permits,
    x: MOD3_X,
    y: BAND2_Y,
    width: MOD3_W,
    height: BAND2_H,
  });

  // ---------------------------------------------------------------------------
  // BAND 3 (BOTTOM): Modules 4 & 5 side-by-side
  // Y: 1370px to 2290px (Height: 920px)
  // ---------------------------------------------------------------------------
  const BAND3_Y = 1370;
  const BAND3_H = 920;

  // Module 4: Infrastructure & 3D WebGL Projects (5 tables)
  // Width: 1680px (x: 50 to 1730)
  const mod4Tables = ["municipal_projects", "project_milestones", "project_issues", "project_photos", "project_activity_logs"];
  const MOD4_X = 50;
  const MOD4_W = 1680;
  const MOD4_TBL_W = 280;
  const MOD4_GAP = 35;
  mod4Tables.forEach((t, i) => {
    const th = calcTableHeight(t);
    const tx = MOD4_X + 30 + i * (MOD4_TBL_W + MOD4_GAP);
    const ty = BAND3_Y + 45;
    tablePositions[t] = { x: tx, y: ty, width: MOD4_TBL_W, height: th, id: `tbl_${t}`, mod: "mod_projects" };
  });
  frameBoxes.push({
    id: "frame_mod_projects",
    title: "4. MUNICIPAL INFRASTRUCTURE & 3D WEBGL PROJECTS",
    theme: themeColors.mod_projects,
    x: MOD4_X,
    y: BAND3_Y,
    width: MOD4_W,
    height: BAND3_H,
  });

  // Module 5: Participatory Urban Planning & Public Consultations (6 tables)
  // Width: 2350px (x: 1760 to 4110)
  const mod5Tables = ["planning_proposals", "proposal_votes", "proposal_comments", "proposal_approvals", "planning_events", "planning_meetings"];
  const MOD5_X = 1760;
  const MOD5_W = 2350;
  const MOD5_TBL_W = 275;
  const MOD5_GAP = 30;
  mod5Tables.forEach((t, i) => {
    const th = calcTableHeight(t);
    const tx = MOD5_X + 30 + i * (MOD5_TBL_W + MOD5_GAP);
    const ty = BAND3_Y + 45;
    tablePositions[t] = { x: tx, y: ty, width: MOD5_TBL_W, height: th, id: `tbl_${t}`, mod: "mod_planning" };
  });
  frameBoxes.push({
    id: "frame_mod_planning",
    title: "5. PARTICIPATORY URBAN PLANNING & SOCIAL CONSULTATIONS",
    theme: themeColors.mod_planning,
    x: MOD5_X,
    y: BAND3_Y,
    width: MOD5_W,
    height: BAND3_H,
  });

  console.log(`16:9 Canvas Configured: ${CANVAS_W} x ${CANVAS_H} (Ratio: ${(CANVAS_W/CANVAS_H).toFixed(4)} = 16:9)`);

  // Build Draw.io XML
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="LUISIANA-INFATRACK" version="24.7.17">
  <diagram id="luisiana_infatrack_16_9" name="LUISIANA INFA-TRACK - 16:9 Database Architecture">
    <mxGraphModel dx="1600" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${CANVAS_W}" pageHeight="${CANVAS_H}" background="#0b1120" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Master Title Banner (16:9 Widescreen) -->
        <mxCell id="title_banner" value="LUISIANA INFA-TRACK: COMPLETE POSTGRESQL DATABASE ARCHITECTURE (16:9 WIDESCREEN)&#xa;Complete 32 Production Relational Tables (PostgreSQL 14+ / PostGIS) — 1:1 pgAdmin Mirror (Normalized 3NF)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#1e293b;strokeColor=#38bdf8;strokeWidth=2;fontColor=#ffffff;fontSize=18;fontStyle=1;align=center;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="50" y="16" width="${CANVAS_W - 100}" height="44" as="geometry" />
        </mxCell>
`;

  // Render Module Frames
  for (const f of frameBoxes) {
    xml += `
        <!-- Section: ${f.title} -->
        <mxCell id="${f.id}" value="${f.title}" style="swimlane;fontStyle=1;align=left;spacingLeft=15;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=30;horizontalStack=0;resizeParent=0;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;fillColor=#111827;swimlaneFillColor=${f.theme.fill};strokeColor=${f.theme.border};strokeWidth=2;fontColor=#ffffff;fontSize=12;shadow=1;rounded=1;" vertex="1" parent="1">
          <mxGeometry x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" as="geometry" />
        </mxCell>
`;
  }

  // Render Tables & Columns
  for (const t of tables) {
    const pos = tablePositions[t];
    if (!pos) continue;
    const cols = tableData[t] || [];
    const theme = themeColors[pos.mod] || { headerFill: "#1e293b", border: "#64748b", accent: "#94a3b8" };

    // Table Container
    xml += `
        <!-- Table: ${t} -->
        <mxCell id="${pos.id}" value="${t}" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=0;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;fillColor=${theme.headerFill};strokeColor=${theme.border};strokeWidth=1.8;fontColor=#ffffff;fontSize=11;shadow=1;rounded=1;" vertex="1" parent="1">
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
          <mxGeometry y="${26 + idx * ROW_H}" width="${pos.width}" height="${ROW_H}" as="geometry" />
        </mxCell>
`;
    });
  }

  // Render Relationship Connectors
  let relId = 9000;
  for (const rel of relationships) {
    const srcTbl = rel.table_name;
    const tgtTbl = rel.foreign_table_name;
    const srcPos = tablePositions[srcTbl];
    const tgtPos = tablePositions[tgtTbl];

    if (!srcPos || !tgtPos) continue;

    const edgeId = `edge_${relId++}`;
    const srcTheme = themeColors[srcPos.mod] || { accent: "#38bdf8" };

    xml += `
        <!-- FK: ${srcTbl}.${rel.column_name} -> ${tgtTbl}.${rel.foreign_column_name} -->
        <mxCell id="${edgeId}" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${srcTheme.accent};strokeWidth=1.6;dashed=0;endArrow=ERmany;startArrow=ERone;fontColor=#94a3b8;fontSize=9;" edge="1" parent="1" source="${srcPos.id}" target="${tgtPos.id}">
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
  const filesToSave = [
    path.resolve(ROOT_DIR, "luisiana_infatrack_complete_schema.drawio"),
    path.resolve(ROOT_DIR, "luisiana_infatrack_complete_schema.xml"),
    path.resolve(ROOT_DIR, "luisiana_normalized_schema.drawio"),
    path.resolve(ROOT_DIR, "luisiana_normalized_schema.xml"),
    path.resolve(ROOT_DIR, "luisiana_postgres_schema.drawio"),
    path.resolve(ROOT_DIR, "luisiana_postgres_schema.xml"),
  ];

  for (const fp of filesToSave) {
    fs.writeFileSync(fp, xml, "utf8");
    console.log(`Saved: ${fp}`);
  }

  console.log(`\n==================================================================`);
  console.log(`  PERFECT 16:9 WIDESCREEN 32-TABLE DRAW.IO ERD GENERATED!`);
  console.log(`  Dimensions: ${CANVAS_W} x ${CANVAS_H} px (16:9 Aspect Ratio)`);
  console.log(`==================================================================\n`);
}

main().catch(console.error);
