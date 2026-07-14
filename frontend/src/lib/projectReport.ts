import type { ProjectAccomplishmentReport } from "../types";
import { backendUrl } from "./api";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;

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

  win.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(report.project.name)} — Accomplishment Report</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; color: #1a1a1a; margin: 32px; line-height: 1.5; }
    h1 { margin: 0 0 8px; font-size: 1.6rem; }
    .meta { color: #555; margin-bottom: 24px; font-size: 0.9rem; }
    section { margin-bottom: 24px; page-break-inside: avoid; }
    h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 2px solid #245C3A; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 8px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f4f4f4; }
    .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
    .photo img { width: 100%; height: 120px; object-fit: cover; border: 1px solid #ccc; }
    .photo p { font-size: 0.75rem; margin: 4px 0 0; }
    .narrative { background: #f8f8f8; padding: 12px; border-left: 4px solid #3D9B5F; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
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
</body>
</html>`);
  win.document.close();
  win.focus();
  win.print();
}
