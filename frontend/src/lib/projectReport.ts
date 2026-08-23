import type { ProjectAccomplishmentReport } from "../types";
import { backendUrl } from "./api";
import { downloadCsv, downloadExcel, printHtmlDocument, reportStamp } from "./report-export";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadAccomplishmentCsv(report: ProjectAccomplishmentReport, projectName: string) {
  const slug = projectName.replace(/\s+/g, "-").toLowerCase();
  downloadCsv(`${slug}-accomplishment-${reportStamp()}.csv`, ["Field", "Value"], [
    ["Generated", report.generatedAt],
    ["Project", report.project.name],
    ["Department", report.project.department],
    ["Type", report.project.type],
    ["Status", report.project.status],
    ["Progress %", report.project.progress],
    ["Start", report.timeline.startDate],
    ["Target end", report.timeline.targetEndDate],
    ["Milestones done", report.timeline.milestonesDone],
    ["Milestones total", report.timeline.milestonesTotal],
    ["Milestones missed", report.timeline.milestonesMissed],
    ["Budget total", report.budget.total],
    ["Budget spent", report.budget.spent],
    ["Utilization %", report.budget.utilizationPct],
    ["Open delays", report.issues.openDelays],
    ["Open issues", report.issues.openIssues],
    ["Resolved issues", report.issues.resolved],
    ["Progress photos", report.photos.count],
    ["Narrative", report.narrative],
  ]);
}

export function downloadAccomplishmentExcel(report: ProjectAccomplishmentReport, projectName: string) {
  const slug = projectName.replace(/\s+/g, "-").toLowerCase();
  downloadExcel(`${slug}-accomplishment-${reportStamp()}.xls`, [
    {
      name: "Summary",
      headers: ["Field", "Value"],
      rows: [
        ["Generated", report.generatedAt],
        ["Project", report.project.name],
        ["Department", report.project.department],
        ["Status", report.project.status],
        ["Progress %", report.project.progress],
        ["Budget total", report.budget.total],
        ["Budget spent", report.budget.spent],
        ["Utilization %", report.budget.utilizationPct],
        ["Narrative", report.narrative],
      ],
    },
    {
      name: "Milestones",
      headers: ["Title", "Target", "Status"],
      rows: report.timeline.milestones.map((m) => [m.title, m.targetDate, m.status]),
    },
    {
      name: "Issues",
      headers: ["Kind", "Title", "State"],
      rows: report.issues.items.map((i) => [i.kind, i.title, i.resolvedAt ? "Resolved" : "Open"]),
    },
  ]);
}

export function downloadReportJson(report: ProjectAccomplishmentReport, projectName: string) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-accomplishment-report.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printAccomplishmentReport(report: ProjectAccomplishmentReport) {
  const milestoneRows = report.timeline.milestones
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.title)}</td><td>${escapeHtml(m.targetDate)}</td><td>${escapeHtml(m.status)}</td></tr>`
    )
    .join("");

  const issueRows = report.issues.items
    .slice(0, 10)
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.kind)}</td><td>${escapeHtml(i.title)}</td><td>${i.resolvedAt ? "Resolved" : "Open"}</td></tr>`
    )
    .join("");

  const photoRows = report.photos.items
    .slice(0, 6)
    .map(
      (p) =>
        `<div class="photo"><img src="${escapeHtml(backendUrl(p.url))}" alt="${escapeHtml(p.caption || "Progress photo")}" /><p>${escapeHtml(p.caption || "Progress photo")}</p></div>`
    )
    .join("");

  const body = `
    <style>
      section { margin-bottom: 24px; page-break-inside: avoid; }
      .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
      .photo img { width: 100%; height: 120px; object-fit: cover; border: 1px solid #ccc; }
      .photo p { font-size: 0.75rem; margin: 4px 0 0; }
      .narrative { background: #f4f6f9; padding: 12px; border: 1px solid #151c28; }
    </style>
    <h1>${escapeHtml(report.project.name)}</h1>
    <div class="meta">
      ${escapeHtml(report.project.department)} · ${escapeHtml(report.project.status)} · ${report.project.progress}% complete<br />
      Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())}
    </div>
    <section>
      <h2>Executive Summary</h2>
      <div class="narrative">${escapeHtml(report.narrative)}</div>
    </section>
    <section>
      <h2>Timeline & Milestones</h2>
      <p>Start: ${escapeHtml(report.timeline.startDate || "—")} · Target end: ${escapeHtml(report.timeline.targetEndDate || "—")}</p>
      <p>Done ${report.timeline.milestonesDone} / ${report.timeline.milestonesTotal} · Missed ${report.timeline.milestonesMissed}</p>
      <table>
        <thead><tr><th>Milestone</th><th>Target</th><th>Status</th></tr></thead>
        <tbody>${milestoneRows || "<tr><td colspan='3'>No milestones</td></tr>"}</tbody>
      </table>
    </section>
    <section>
      <h2>Budget</h2>
      <p>Spent: PHP ${report.budget.spent.toLocaleString()} · Total: ${report.budget.total != null ? `PHP ${report.budget.total.toLocaleString()}` : "—"} · Utilization: ${report.budget.utilizationPct ?? "—"}%</p>
    </section>
    <section>
      <h2>Delays & Issues</h2>
      <p>Open delays: ${report.issues.openDelays} · Open issues: ${report.issues.openIssues} · Resolved: ${report.issues.resolved}</p>
      <table>
        <thead><tr><th>Type</th><th>Title</th><th>State</th></tr></thead>
        <tbody>${issueRows || "<tr><td colspan='3'>No issues recorded</td></tr>"}</tbody>
      </table>
    </section>
    <section>
      <h2>Progress Photos (${report.photos.count})</h2>
      <div class="photos">${photoRows || "<p>No photos uploaded.</p>"}</div>
    </section>
  `;
  printHtmlDocument(
    `${report.project.name} — Accomplishment Report`,
    body,
    "INFA-TRACK · Accomplishment report",
  );
}
