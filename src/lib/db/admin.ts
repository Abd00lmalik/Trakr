import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPool } from "@/lib/db";
import { staticOpportunities } from "@/lib/opportunities/data/static-opportunities";
import { upsertOpportunities } from "@/lib/repositories/opportunity-repository";

export async function migrateDatabase() {
  const db = getPool();
  if (!db) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const schemaSql = await readFile(join(process.cwd(), "db", "schema.sql"), "utf8");
  await db.query(schemaSql);

  return {
    migrated: true,
  };
}

export async function seedDatabase() {
  const seeded = await upsertOpportunities(staticOpportunities);

  return {
    seeded,
  };
}
