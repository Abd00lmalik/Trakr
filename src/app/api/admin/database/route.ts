import { NextResponse } from "next/server";
import { migrateDatabase, seedDatabase } from "@/lib/db/admin";
import { checkDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const adminKey = process.env.TRAKR_ADMIN_API_KEY ?? process.env.INGEST_API_KEY;
  if (!adminKey) {
    return process.env.NODE_ENV !== "production";
  }

  const provided =
    request.headers.get("x-trakr-admin-key") ??
    request.headers.get("x-ingest-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return provided === adminKey;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthorized",
        message: "A valid Trakr admin key is required.",
      },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { seed?: boolean };
    const migration = await migrateDatabase();
    const seed = body.seed === false ? { seeded: 0 } : await seedDatabase();
    const database = await checkDatabase();

    return NextResponse.json({
      ok:
        database.connected &&
        database.pgvector &&
        database.schemaReady &&
        database.privacyLoggingReady &&
        database.sourceVerificationReady &&
        database.inventoryMetadataReady,
      migration,
      seed,
      database,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "database_admin_failed",
        message: error instanceof Error ? error.message : "Database setup failed.",
      },
      { status: 500 },
    );
  }
}
