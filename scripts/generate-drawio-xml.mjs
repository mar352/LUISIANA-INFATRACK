import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const citizenAppCols = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { uk: true, name: "tracking_number", type: "VARCHAR(64)" },
  { name: "service_type", type: "VARCHAR(64)" },
  { name: "category", type: "VARCHAR(64)" },
  { name: "status", type: "VARCHAR(64)" },
  { name: "applicant_name", type: "VARCHAR(255)" },
  { name: "contact_phone", type: "VARCHAR(128)" },
  { name: "contact_email", type: "VARCHAR(128)" },
  { name: "address", type: "TEXT" },
  { name: "barangay", type: "VARCHAR(128)" },
  { name: "project_title", type: "VARCHAR(255)" },
  { name: "latitude", type: "DOUBLE PRECISION" },
  { name: "longitude", type: "DOUBLE PRECISION" },
  { name: "estimated_cost", type: "NUMERIC(15,2)" },
  { name: "zoning_classification", type: "VARCHAR(64)" },
  { name: "lot_details", type: "JSONB" },
  { name: "agricultural_details", type: "JSONB" },
  { name: "municipal_details", type: "JSONB" },
  { name: "geo_risk", type: "JSONB" },
  { name: "uploads", type: "JSONB" },
  { name: "step_progress", type: "JSONB" },
  { name: "responsible_officers", type: "JSONB" },
  { name: "sla_days", type: "INT" },
  { name: "sla_minutes", type: "INT" },
  { name: "fee", type: "VARCHAR(64)" },
  { name: "notes", type: "TEXT" },
  { name: "data_hash", type: "VARCHAR(64)" },
  { name: "engineer_approved", type: "BOOLEAN" },
  { name: "is_pinned", type: "BOOLEAN" },
  { name: "engineer_approved_at", type: "TIMESTAMPTZ" },
  { name: "engineer_approved_by", type: "VARCHAR(255)" },
  { name: "held_at", type: "TIMESTAMPTZ" },
  { name: "held_by", type: "VARCHAR(255)" },
  { name: "hold_reason", type: "TEXT" },
  { name: "payment_status", type: "VARCHAR(64)" },
  { name: "or_number", type: "VARCHAR(128)" },
  { name: "amount_paid", type: "NUMERIC(15,2)" },
  { name: "payment_date", type: "TIMESTAMPTZ" },
  { name: "terms_accepted", type: "BOOLEAN" },
  { name: "terms_accepted_at", type: "TIMESTAMPTZ" },
  { name: "terms_version", type: "VARCHAR(32)" },
  { name: "terms_consent_details", type: "JSONB" },
  { name: "created_at", type: "TIMESTAMPTZ" },
  { name: "updated_at", type: "TIMESTAMPTZ" },
];

const userTermsCols = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { name: "ip_address", type: "VARCHAR(64)" },
  { name: "user_agent", type: "TEXT" },
  { name: "terms_version", type: "VARCHAR(32)" },
  { name: "agreed_terms", type: "BOOLEAN" },
  { name: "agreed_privacy", type: "BOOLEAN" },
  { name: "agreed_cookies", type: "BOOLEAN" },
  { name: "consent_source", type: "VARCHAR(64)" },
  { name: "applicant_name", type: "VARCHAR(255)" },
  { name: "created_at", type: "TIMESTAMPTZ" },
];

const remarksCols = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { fk: true, name: "application_id", type: "VARCHAR(64)" },
  { name: "tracking_number", type: "VARCHAR(64)" },
  { name: "from_office", type: "VARCHAR(64)" },
  { name: "author", type: "VARCHAR(255)" },
  { name: "message", type: "TEXT" },
  { name: "requires_action", type: "BOOLEAN" },
  { name: "attached_file", type: "VARCHAR(255)" },
  { name: "created_at", type: "TIMESTAMPTZ" },
];

const photosCols = [
  { pk: true, name: "id", type: "VARCHAR(64)" },
  { fk: true, name: "application_id", type: "VARCHAR(64)" },
  { name: "tracking_number", type: "VARCHAR(64)" },
  { name: "photo_url", type: "TEXT" },
  { name: "photo_type", type: "VARCHAR(50)" },
  { name: "stage", type: "VARCHAR(50)" },
  { name: "progress", type: "INT" },
  { name: "remarks", type: "TEXT" },
  { name: "inspector", type: "VARCHAR(255)" },
  { name: "created_at", type: "TIMESTAMPTZ" },
  { name: "updated_at", type: "TIMESTAMPTZ" },
];

function escapeXml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildTableXml({ tableId, title, x, y, width, columns, headerColor = "#0284c7", strokeColor = "#0369a1" }) {
  const rowHeight = 22;
  const startSize = 30;
  const totalHeight = startSize + columns.length * rowHeight;

  let out = `
    <!-- TABLE: ${escapeXml(title)} -->
    <mxCell id="${tableId}" value="${escapeXml(title)}" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=${startSize};horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;fillColor=${headerColor};strokeColor=${strokeColor};fontColor=#ffffff;rounded=1;arcSize=3;shadow=1;" vertex="1" parent="1">
      <mxGeometry x="${x}" y="${y}" width="${width}" height="${totalHeight}" as="geometry" />
    </mxCell>`;

  columns.forEach((col, idx) => {
    let prefix = "";
    let colorStyle = "";
    if (col.pk) {
      prefix = "&lt;b style=&quot;color:#1e40af;&quot;&gt;[PK]&lt;/b&gt; ";
      colorStyle = "background-color:#eff6ff;";
    } else if (col.fk) {
      prefix = "&lt;b style=&quot;color:#b45309;&quot;&gt;[FK]&lt;/b&gt; ";
      colorStyle = "background-color:#fefce8;";
    } else if (col.uk) {
      prefix = "&lt;b style=&quot;color:#15803d;&quot;&gt;[UK]&lt;/b&gt; ";
      colorStyle = "background-color:#f0fdf4;";
    }

    const label = `${prefix}${escapeXml(col.name)} : &lt;i style=&quot;color:#475569;&quot;&gt;${escapeXml(col.type)}&lt;/i&gt;`;
    const rowY = startSize + idx * rowHeight;

    out += `
    <mxCell id="${tableId}_col_${idx}" value="${label}" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=8;spacingRight=8;overflow=hidden;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;rotatable=0;whiteSpace=wrap;html=1;fontFamily=monospace;fontSize=10.5;${colorStyle}" vertex="1" parent="${tableId}">
      <mxGeometry y="${rowY}" width="${width}" height="${rowHeight}" as="geometry" />
    </mxCell>`;
  });

  return out;
}

const tableCaXml = buildTableXml({
  tableId: "tbl_citizen_apps",
  title: "public.citizen_applications",
  x: 60,
  y: 80,
  width: 360,
  columns: citizenAppCols,
  headerColor: "#0f766e",
  strokeColor: "#115e59",
});

const tableUtcXml = buildTableXml({
  tableId: "tbl_user_terms",
  title: "public.user_terms_consents",
  x: 480,
  y: 80,
  width: 320,
  columns: userTermsCols,
  headerColor: "#4338ca",
  strokeColor: "#3730a3",
});

const tableRemarksXml = buildTableXml({
  tableId: "tbl_app_remarks",
  title: "public.application_remarks",
  x: 860,
  y: 80,
  width: 340,
  columns: remarksCols,
  headerColor: "#0369a1",
  strokeColor: "#0284c7",
});

const tablePhotosXml = buildTableXml({
  tableId: "tbl_insp_photos",
  title: "public.site_inspection_photos",
  x: 860,
  y: 360,
  width: 340,
  columns: photosCols,
  headerColor: "#b45309",
  strokeColor: "#92400e",
});

const fullDrawioXml = `<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="Antigravity" version="21.0.0" type="device">
  <diagram id="luisiana-postgres-erd" name="PostgreSQL Active Schema">
    <mxGraphModel dx="1800" dy="1100" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1920" pageHeight="1080" background="#f8fafc" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- TITLE HEADER -->
        <mxCell id="title_banner" value="&lt;h2 style=&quot;margin:0;color:#0f172a;&quot;&gt;LUISIANA INFA-TRACK — Active PostgreSQL Schema (Landscape)&lt;/h2&gt;&lt;p style=&quot;margin:4px 0 0 0;color:#64748b;&quot;&gt;Database: luisiana_infatrack | Municipality of Luisiana, Laguna (Region IV-A)&lt;/p&gt;" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;" vertex="1" parent="1">
          <mxGeometry x="60" y="20" width="800" height="40" as="geometry" />
        </mxCell>

        ${tableCaXml}
        ${tableUtcXml}
        ${tableRemarksXml}
        ${tablePhotosXml}

        <!-- RELATIONSHIP: citizen_applications.id -> application_remarks.application_id -->
        <mxCell id="rel_ca_to_remarks" value="1 : N (application_id)" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#0284c7;strokeWidth=2;fontSize=10;fontColor:#0f172a;labelBackgroundColor=#ffffff;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" parent="1" source="tbl_citizen_apps_col_0" target="tbl_app_remarks_col_1">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="450" y="119" />
              <mxPoint x="450" y="60" />
              <mxPoint x="830" y="60" />
              <mxPoint x="830" y="141" />
            </Array>
          </mxGeometry>
        </mxCell>

        <!-- RELATIONSHIP: citizen_applications.id -> site_inspection_photos.application_id -->
        <mxCell id="rel_ca_to_photos" value="1 : N (application_id)" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#b45309;strokeWidth=2;fontSize=10;fontColor:#0f172a;labelBackgroundColor=#ffffff;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" parent="1" source="tbl_citizen_apps_col_0" target="tbl_insp_photos_col_1">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="450" y="119" />
              <mxPoint x="450" y="320" />
              <mxPoint x="830" y="320" />
              <mxPoint x="830" y="421" />
            </Array>
          </mxGeometry>
        </mxCell>

        <!-- RELATIONSHIP: citizen_applications -> user_terms_consents -->
        <mxCell id="rel_ca_to_terms" value="Consent &amp; Privacy Link" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#4338ca;strokeWidth=1.5;dashed=1;fontSize=10;fontColor:#475569;labelBackgroundColor=#ffffff;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" parent="1" source="tbl_citizen_apps_col_40" target="tbl_user_terms_col_0">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="450" y="979" />
              <mxPoint x="450" y="119" />
            </Array>
          </mxGeometry>
        </mxCell>

      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

// Write .drawio and .xml files
const drawioPath = path.join(ROOT_DIR, "luisiana_postgres_schema.drawio");
const xmlPath = path.join(ROOT_DIR, "luisiana_postgres_schema.xml");

fs.writeFileSync(drawioPath, fullDrawioXml, "utf8");
fs.writeFileSync(xmlPath, fullDrawioXml, "utf8");

console.log(`Generated Draw.io files:`);
console.log(`- ${drawioPath}`);
console.log(`- ${xmlPath}`);
