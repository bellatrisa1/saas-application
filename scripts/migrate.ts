import "dotenv/config";
import pg from "pg";
import { readFile } from "node:fs/promises";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(912341)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS migrations(name text PRIMARY KEY)",
  );
  if (
    !(
      await client.query("SELECT 1 FROM migrations WHERE name=$1", [
        "001_initial",
      ])
    ).rowCount
  ) {
    await client.query(await readFile("db/001_initial.sql", "utf8"));
    await client.query("INSERT INTO migrations VALUES ($1)", ["001_initial"]);
  }
  await client.query("COMMIT");
  console.log("Migrations applied");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
