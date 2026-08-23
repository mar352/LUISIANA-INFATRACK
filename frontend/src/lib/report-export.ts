export type SheetRow = (string | number | null | undefined)[];

export type ReportSheet = {
  name: string;
  headers: string[];
  rows: SheetRow[];
};

export function reportStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: SheetRow[]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
}

export function downloadCsv(filename: string, headers: string[], rows: SheetRow[]) {
  downloadBlob(new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" }), filename);
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function excelCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return `<Cell><Data ss:Type="String"></Data></Cell>`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`;
}

/** SpreadsheetML workbook Excel / LibreOffice open as a real .xls. */
export function downloadExcel(filename: string, sheets: ReportSheet[]) {
  const worksheets = sheets
    .map((sheet) => {
      const safe = sheet.name.replace(/[\\/*?:\[\]]/g, " ").slice(0, 31) || "Sheet";
      const header = `<Row>${sheet.headers.map((h) => excelCell(h)).join("")}</Row>`;
      const body = sheet.rows.map((row) => `<Row>${row.map(excelCell).join("")}</Row>`).join("");
      return `<Worksheet ss:Name="${xmlEscape(safe)}"><Table>${header}${body}</Table></Worksheet>`;
    })
    .join("");

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${worksheets}
</Workbook>`;

  downloadBlob(new Blob([xml], { type: "application/vnd.ms-excel" }), filename);
}

/** Official LGU letterhead: Luisiana seal left, Bagong Pilipinas right. */
export function reportLetterheadHtml(kicker = "INFA-TRACK"): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const luisiana = `${origin}/logo.png`;
  const bagong = `${origin}/bagong-pilipinas.png`;
  return `<header class="rpt-brand">
      <div class="rpt-brand-left">
        <img src="${xmlEscape(luisiana)}" alt="Bayan ng Luisiana" />
        <div class="rpt-brand-text">
          <p class="line1">Republic of the Philippines</p>
          <p class="line2">Municipality of Luisiana, Laguna</p>
          <p class="line3">${xmlEscape(kicker)}</p>
        </div>
      </div>
      <div class="rpt-brand-right">
        <img src="${xmlEscape(bagong)}" alt="Bagong Pilipinas" />
      </div>
    </header>`;
}

const LETTERHEAD_CSS = `
    .rpt-brand { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 14px; border-bottom: 2px solid #151c28; margin: 0 0 18px; }
    .rpt-brand-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .rpt-brand-left img { width: 78px; height: 78px; object-fit: contain; flex-shrink: 0; }
    .rpt-brand-right img { width: 92px; height: 92px; object-fit: contain; flex-shrink: 0; }
    .rpt-brand-text { line-height: 1.28; }
    .rpt-brand-text .line1 { font-size: 0.78rem; color: #444; margin: 0; }
    .rpt-brand-text .line2 { font-size: 1.05rem; font-weight: 800; letter-spacing: 0.01em; margin: 2px 0 0; }
    .rpt-brand-text .line3 { font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; color: #555; margin: 4px 0 0; }
`;

export function printHtmlDocument(title: string, bodyHtml: string, kicker = "INFA-TRACK") {
  const win = window.open("", "_blank", "width=980,height=720");
  if (!win) return;
  win.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${xmlEscape(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #1a1a1a; margin: 28px; line-height: 1.45; }
    h1 { margin: 0 0 6px; font-size: 1.45rem; letter-spacing: -0.02em; }
    h2 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.1em; color: #151c28; border-bottom: 2px solid #151c28; padding-bottom: 5px; margin: 22px 0 10px; }
    .meta { color: #555; font-size: 0.88rem; margin-bottom: 18px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 4px; }
    .kpi { border: 1px solid #d8d2c6; padding: 8px 10px; background: #f7f3ea; }
    .kpi b { display: block; font-size: 1.15rem; }
    .kpi span { font-size: 0.7rem; letter-spacing: 0.06em; text-transform: uppercase; color: #666; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 6px; }
    th, td { border: 1px solid #d4d0c6; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #e8efe6; }
    .map-shot { width: 100%; max-height: 420px; object-fit: cover; border: 1px solid #ccc; background: #111; }
    .note { font-size: 0.8rem; color: #555; margin-top: 8px; }
    ${LETTERHEAD_CSS}
    @media print {
      body { margin: 14px; }
      .no-print { display: none !important; }
      h2, .rpt-brand { break-after: avoid; }
      table, .kpi { break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${reportLetterheadHtml(kicker)}
  ${bodyHtml}
  <script>
    function goPrint() {
      if (window.__printed) return;
      window.__printed = true;
      window.focus();
      window.print();
    }
    window.addEventListener("load", goPrint);
    setTimeout(goPrint, 2500);
  </script>
</body>
</html>`);
  win.document.close();
}
