import type { Project } from "../types";
import { MODEL_CATALOG } from "../types";
import {
  computeBarangayCompare,
  computeBudgetRollup,
  computeInfraAnalytics,
  computeInfraGaps,
  formatPesoCompact,
} from "./infra-analytics";
import { computePlanningInsights } from "./planning-insights";
import { criticalTypeLabel, listCriticalProjects } from "./critical-infra";
import { printHtmlDocument, reportStamp, type ReportSheet } from "./report-export";

function modelLabel(type: string): string {
  return MODEL_CATALOG.find((m) => m.type === type)?.label || type || "—";
}

function peso(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `PHP ${Math.round(n).toLocaleString()}`;
}

export function projectRows(projects: Project[]): ReportSheet {
  return {
    name: "Projects",
    headers: [
      "Name",
      "Barangay",
      "Department",
      "Type",
      "Facility",
      "Status",
      "Progress %",
      "Budget total",
      "Budget spent",
      "Funding",
      "Contractor",
      "Start",
      "Target end",
      "Lat",
      "Lon",
    ],
    rows: (projects || []).map((p) => [
      p.name,
      p.barangay || "",
      p.department,
      p.type,
      modelLabel(p.modelType),
      p.status,
      p.progress ?? 0,
      p.budgetTotal ?? "",
      p.budgetSpent ?? 0,
      p.fundingSource || "",
      p.contractor || "",
      p.startDate || "",
      p.targetEndDate || "",
      p.location?.lat ?? "",
      p.location?.lon ?? "",
    ]),
  };
}

export function buildMunicipalSheets(projects: Project[]): ReportSheet[] {
  const list = Array.isArray(projects) ? projects : [];
  const stats = computeInfraAnalytics(list);
  const barangays = computeBarangayCompare(list);
  const budget = computeBudgetRollup(list);
  const gaps = computeInfraGaps(list);
  const insights = computePlanningInsights(list);

  return [
    {
      name: "Summary",
      headers: ["Indicator", "Value"],
      rows: [
        ["Generated", new Date().toLocaleString()],
        ["Total projects", stats.total],
        ["Ongoing", stats.ongoing],
        ["Completed", stats.completed],
        ["Delayed", stats.delayed],
        ["Planned", stats.planned],
        ["Suspended", stats.suspended],
        ["Average progress %", stats.avgProgress],
        ["Budget programmed (PHP)", budget.total],
        ["Budget spent (PHP)", budget.spent],
        ["Budget utilized %", budget.utilPct],
        ["Projects with budget", budget.withBudget],
      ],
    },
    projectRows(list),
    {
      name: "Barangay",
      headers: [
        "Barangay",
        "Projects",
        "Completed",
        "Ongoing",
        "Planned",
        "Delayed",
        "Avg progress %",
        "Budget total",
        "Budget spent",
      ],
      rows: barangays.map((b) => [
        b.name,
        b.count,
        b.completed,
        b.ongoing,
        b.planned,
        b.delayed,
        b.avgProgress,
        b.budgetTotal,
        b.budgetSpent,
      ]),
    },
    {
      name: "Budget by office",
      headers: ["Office", "Programmed", "Spent", "Utilized %"],
      rows: budget.byDepartment.map((r) => [
        r.name,
        r.total,
        r.spent,
        r.total > 0 ? Math.round((r.spent / r.total) * 100) : 0,
      ]),
    },
    {
      name: "Budget by barangay",
      headers: ["Barangay", "Programmed", "Spent", "Utilized %"],
      rows: budget.byBarangay.map((r) => [
        r.name,
        r.total,
        r.spent,
        r.total > 0 ? Math.round((r.spent / r.total) * 100) : 0,
      ]),
    },
    {
      name: "Infra gaps",
      headers: ["Barangay", "Projects", "Present", "Missing"],
      rows: gaps.map((g) => [
        g.barangay,
        g.projectCount,
        g.present.join("; ") || "—",
        g.missing.join("; ") || "None",
      ]),
    },
    {
      name: "Recommendations",
      headers: ["Score", "Action", "Barangay", "Reasons"],
      rows: insights.nextBuilds.map((r) => [
        r.needScore,
        `Build ${r.facility}`,
        r.barangay,
        r.reasons.join("; "),
      ]),
    },
    {
      name: "Critical infra",
      headers: ["Name", "Type", "Barangay", "Status", "Lat", "Lon"],
      rows: listCriticalProjects(list).map((p) => [
        p.name,
        criticalTypeLabel(p.modelType),
        p.barangay || "",
        p.status,
        p.location?.lat ?? "",
        p.location?.lon ?? "",
      ]),
    },
  ];
}

function tableHtml(headers: string[], rows: ReportSheet["rows"]): string {
  const head = headers.map((h) => `<th>${escape(h)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((c) => `<td>${escape(c == null ? "" : String(c))}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${headers.length}">None</td></tr>`}</tbody></table>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printMunicipalReport(projects: Project[], mapPng?: string | null) {
  const list = Array.isArray(projects) ? projects : [];
  const stats = computeInfraAnalytics(list);
  const barangays = computeBarangayCompare(list);
  const budget = computeBudgetRollup(list);
  const gaps = computeInfraGaps(list);
  const insights = computePlanningInsights(list);
  const stamp = reportStamp();

  const mapBlock = mapPng
    ? `<h2>Printable map</h2><img class="map-shot" src="${mapPng}" alt="Luisiana infrastructure map" /><p class="note">Captured from the live Cesium globe at report time.</p>`
    : "";

  const body = `
    <h1>INFA-TRACK Luisiana — Municipal infrastructure report</h1>
    <div class="meta">Live project data · generated ${escape(new Date().toLocaleString())} · ${stamp}</div>
    <div class="kpis">
      <div class="kpi"><span>Projects</span><b>${stats.total}</b></div>
      <div class="kpi"><span>Ongoing</span><b>${stats.ongoing}</b></div>
      <div class="kpi"><span>Completed</span><b>${stats.completed}</b></div>
      <div class="kpi"><span>Delayed</span><b>${stats.delayed}</b></div>
      <div class="kpi"><span>Avg progress</span><b>${stats.avgProgress}%</b></div>
      <div class="kpi"><span>Programmed</span><b>${escape(formatPesoCompact(budget.total))}</b></div>
      <div class="kpi"><span>Spent</span><b>${escape(formatPesoCompact(budget.spent))}</b></div>
      <div class="kpi"><span>Utilized</span><b>${budget.utilPct}%</b></div>
    </div>
    ${mapBlock}
    <h2>Barangay infrastructure summary</h2>
    ${tableHtml(
      ["Barangay", "Projects", "Completed", "Ongoing", "Planned", "Delayed", "Avg %", "Budget"],
      barangays.map((b) => [
        b.name,
        b.count,
        b.completed,
        b.ongoing,
        b.planned,
        b.delayed,
        b.avgProgress,
        peso(b.budgetTotal),
      ]),
    )}
    <h2>Budget and expenditure</h2>
    <p>Programmed ${escape(peso(budget.total))} · spent ${escape(peso(budget.spent))} · ${budget.utilPct}% utilized · ${budget.withBudget} project(s) with a budget line.</p>
    <h3 style="font-size:13px;margin:12px 0 4px">By office</h3>
    ${tableHtml(
      ["Office", "Programmed", "Spent"],
      budget.byDepartment.map((r) => [r.name, peso(r.total), peso(r.spent)]),
    )}
    <h3 style="font-size:13px;margin:12px 0 4px">By barangay</h3>
    ${tableHtml(
      ["Barangay", "Programmed", "Spent"],
      budget.byBarangay.map((r) => [r.name, peso(r.total), peso(r.spent)]),
    )}
    <h2>Predictive outlook</h2>
    <p>${escape(insights.outlook.note)}</p>
    <h2>Recommended next builds</h2>
    ${tableHtml(
      ["Score", "Build", "Barangay", "Why"],
      insights.nextBuilds.slice(0, 8).map((r) => [
        r.needScore,
        r.facility,
        r.barangay,
        r.reasons.slice(0, 2).join("; "),
      ]),
    )}
    <h2>Infrastructure gaps</h2>
    ${tableHtml(
      ["Barangay", "Projects", "Present", "Missing"],
      gaps.map((g) => [g.barangay, g.projectCount, g.present.join(", ") || "—", g.missing.join(", ") || "None"]),
    )}
    <h2>Critical infrastructure</h2>
    ${tableHtml(
      ["Name", "Type", "Barangay", "Status"],
      listCriticalProjects(list).map((p) => [
        p.name,
        criticalTypeLabel(p.modelType),
        p.barangay || "—",
        p.status,
      ]),
    )}
    <h2>Project register</h2>
    ${tableHtml(
      ["Name", "Barangay", "Office", "Status", "%", "Budget"],
      list.map((p) => [p.name, p.barangay || "—", p.department, p.status, p.progress ?? 0, peso(p.budgetTotal)]),
    )}
  `;

  printHtmlDocument("INFA-TRACK municipal infrastructure report", body, "INFA-TRACK · Municipal report");
}

export function printMapSheet(opts: {
  mapPng: string | null;
  projects: Project[];
}) {
  const list = Array.isArray(opts.projects) ? opts.projects : [];
  const img = opts.mapPng
    ? `<img class="map-shot" src="${opts.mapPng}" alt="Luisiana map" />`
    : `<p class="note">Map image could not be captured. Keep the globe open, then try again.</p>`;

  const body = `
    <h1>INFA-TRACK Luisiana — Printable map</h1>
    <div class="meta">${escape(new Date().toLocaleString())} · ${list.length} project${list.length === 1 ? "" : "s"} on the live globe</div>
    ${img}
    <h2>Projects on this map</h2>
    ${tableHtml(
      ["Name", "Barangay", "Status", "Office"],
      list.map((p) => [p.name, p.barangay || "—", p.status, p.department]),
    )}
  `;
  printHtmlDocument("INFA-TRACK printable map", body, "INFA-TRACK · Printable map");
}
