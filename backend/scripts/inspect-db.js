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
    console.log("SUCCESS: Connected to PostgreSQL luisiana_infatrack!");

    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    console.log("Tables in luisiana_infatrack:", tables.rows.map(r => r.table_name));

    if (tables.rows.some(r => r.table_name === "municipal_projects")) {
      const proj = await client.query("SELECT id, name, barangay, status, is_pinned FROM municipal_projects;");
      console.log("municipal_projects rows:", proj.rowCount);
      console.log(JSON.stringify(proj.rows, null, 2));
    }

    if (tables.rows.some(r => r.table_name === "citizen_applications")) {
      const apps = await client.query("SELECT tracking_number, status FROM citizen_applications LIMIT 5;");
      console.log("citizen_applications sample:", apps.rows);
    }
    
    await client.end();
  } catch (err) {
    console.error("DB Error:", err.message);
  }
}

main();
