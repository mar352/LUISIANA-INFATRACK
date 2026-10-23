import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

const PG_HOST = process.env.PGHOST || "localhost";
const PG_PORT = Number(process.env.PGPORT || 5432);
const PG_USER = process.env.PGUSER || "postgres";
const PG_PASSWORD = process.env.PGPASSWORD || "postgres";
const PG_DATABASE = process.env.PGDATABASE || "luisiana_infatrack";

async function runMigration() {
  console.log("==================================================================");
  console.log("  LUISIANA INFA-TRACK - PostgreSQL Database Migration & Setup");
  console.log(`  Target: ${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}`);
  console.log("==================================================================\n");

  const rootConfig = {
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: "postgres",
  };

  try {
    // 1. Check server and create database if not exists
    console.log("[1/5] Checking PostgreSQL server connection…");
    const rootClient = new pg.Client(rootConfig);
    await rootClient.connect();

    const dbCheck = await rootClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [PG_DATABASE]
    );

    if (dbCheck.rowCount === 0) {
      console.log(`      Creating database "${PG_DATABASE}"…`);
      await rootClient.query(`CREATE DATABASE "${PG_DATABASE}"`);
      console.log(`      Database "${PG_DATABASE}" created successfully.`);
    } else {
      console.log(`      Database "${PG_DATABASE}" already exists.`);
    }
    await rootClient.end();

    // 2. Connect to application database
    console.log("\n[2/5] Connecting to application database…");
    const client = new pg.Client({
      host: PG_HOST,
      port: PG_PORT,
      user: PG_USER,
      password: PG_PASSWORD,
      database: PG_DATABASE,
    });
    await client.connect();

    // 3. Execute schema.sql
    console.log("\n[3/5] Executing schema.sql (Tables, Constraints, Indexes, Triggers)…");
    const schemaPath = path.join(__dirname, "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    await client.query(schemaSql);
    console.log("      Schema successfully applied.");

    // 4. Execute seed.sql
    console.log("\n[4/5] Executing seed.sql (Barangays, Masterlists, System Config, Staff Accounts)…");
    const seedPath = path.join(__dirname, "seed.sql");
    const seedSql = fs.readFileSync(seedPath, "utf8");
    await client.query(seedSql);
    console.log("      Seed data successfully applied.");

    // 5. Verification & Summary
    console.log("\n[5/5] Verifying database structure & row counts…");
    const tables = [
      "barangays",
      "system_config",
      "system_masterlists",
      "staff_accounts",
      "applicants",
      "citizen_applications",
      "application_locations",
      "application_payments",
      "engineering_reviews",
      "application_documents",
      "application_remarks",
      "site_inspection_photos",
      "user_terms_consents",
      "municipal_projects",
      "project_milestones",
      "project_issues",
      "project_photos",
      "planning_proposals",
      "planning_events",
      "planning_meetings",
      "municipal_documents",
      "citizen_engagements",
      "disaster_hazard_alerts"
    ];

    for (const tbl of tables) {
      try {
        const res = await client.query(`SELECT COUNT(*)::int AS count FROM ${tbl}`);
        console.log(`      ✓ ${tbl.padEnd(26)} : ${res.rows[0].count} records`);
      } catch (err) {
        console.warn(`      ✗ ${tbl.padEnd(26)} : ${err.message}`);
      }
    }

    await client.end();
    console.log("\n==================================================================");
    console.log("  MIGRATION COMPLETE! Database is ready for LUISIANA INFA-TRACK.");
    console.log("==================================================================\n");
    process.exit(0);
  } catch (err) {
    console.error("\n[MIGRATION ERROR]:", err.message);
    console.error("Please verify that your PostgreSQL service is running and credentials in backend/.env are correct.\n");
    process.exit(1);
  }
}

runMigration();
