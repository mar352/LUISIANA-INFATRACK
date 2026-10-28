import pg from "pg";

const client = new pg.Client({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "king010605",
  database: "luisiana_infatrack"
});

async function main() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL luisiana_infatrack!");

    const testProject = {
      id: "lgu-proj-1793016209243",
      name: "asdsadsa",
      modelType: "office",
      type: "Municipal Project",
      department: "Engineering",
      status: "Planned",
      progress: 0,
      lifecyclePhase: "Procurement",
      lat: 14.1857,
      lon: 121.5119,
      contractor: "dadsdasd",
      budgetTotal: 23232131,
      budgetSpent: 0,
      barangay: "San Juan",
      fundingSource: "Municipal Development Fund (MDF)",
      isLguProject: true,
      engineerApproved: true,
      isPinned: true,
      siteMarkerOnly: true,
      markerColor: "#0284c7"
    };

    const sql = `
      INSERT INTO municipal_projects (
        id, name, model_type, type, department, status, progress, lifecycle_phase,
        latitude, longitude, contractor, budget_total, budget_spent, barangay,
        funding_source, is_lgu_project, engineer_approved, is_pinned, site_marker_only,
        marker_color, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        progress = EXCLUDED.progress,
        lifecycle_phase = EXCLUDED.lifecycle_phase,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        contractor = EXCLUDED.contractor,
        budget_total = EXCLUDED.budget_total,
        budget_spent = EXCLUDED.budget_spent,
        barangay = EXCLUDED.barangay,
        funding_source = EXCLUDED.funding_source,
        is_lgu_project = EXCLUDED.is_lgu_project,
        engineer_approved = EXCLUDED.engineer_approved,
        is_pinned = EXCLUDED.is_pinned,
        site_marker_only = EXCLUDED.site_marker_only,
        marker_color = EXCLUDED.marker_color,
        updated_at = NOW()
      RETURNING id, name, status, is_pinned;
    `;

    const res = await client.query(sql, [
      testProject.id,
      testProject.name,
      testProject.modelType,
      testProject.type,
      testProject.department,
      testProject.status,
      testProject.progress,
      testProject.lifecyclePhase,
      testProject.lat,
      testProject.lon,
      testProject.contractor,
      testProject.budgetTotal,
      testProject.budgetSpent,
      testProject.barangay,
      testProject.fundingSource,
      testProject.isLguProject,
      testProject.engineerApproved,
      testProject.isPinned,
      testProject.siteMarkerOnly,
      testProject.markerColor
    ]);

    console.log("Upserted project:", res.rows[0]);

    const countRes = await client.query("SELECT COUNT(*) FROM municipal_projects;");
    console.log("Total municipal_projects in luisiana_infatrack:", countRes.rows[0].count);

    await client.end();
  } catch (err) {
    console.error("Test error:", err);
  }
}

main();
