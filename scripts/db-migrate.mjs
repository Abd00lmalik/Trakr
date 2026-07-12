import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const schemaPath = path.join(process.cwd(), "db", "schema.sql");
const schemaSql = await fs.readFile(schemaPath, "utf8");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  await pool.query(schemaSql);
  console.log("Database migration completed.");
} finally {
  await pool.end();
}
