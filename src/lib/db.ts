import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
  }

  return pool;
}

export async function checkDatabase() {
  const db = getPool();
  if (!db) {
    return {
      configured: false,
      connected: false,
      pgvector: false,
      schemaReady: false,
      privacyLoggingReady: false,
      sourceVerificationReady: false,
      inventoryMetadataReady: false,
      artifactStorageReady: false,
    };
  }

  try {
    await db.query("select 1");
    const pgvector = await db.query<{ installed: boolean }>(
      "select exists(select 1 from pg_extension where extname = 'vector') as installed",
    );
    const schema = await db.query<{ ready: boolean }>(
      `select exists(
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'opportunities'
      ) as ready`,
    );
    const privacyLogging = await db.query<{ ready: boolean }>(
      `select
        exists(
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'recommendation_runs'
            and column_name = 'input_summary'
        )
        and not exists(
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'recommendation_runs'
            and column_name in ('request_payload', 'response_payload')
        ) as ready`,
    );
    const sourceVerification = await db.query<{ ready: boolean }>(
      `select count(*) = 9 as ready
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'opportunities'
         and column_name in (
           'verification_status',
           'last_verified_at',
           'last_seen_at',
           'source_status',
           'http_status',
           'canonical_url',
           'publisher_domain',
           'is_active',
           'verification_confidence'
         )`,
    );
    const inventoryMetadata = await db.query<{ ready: boolean }>(
      `select exists(
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'opportunities'
          and column_name = 'inventory_metadata'
          and data_type = 'jsonb'
      ) as ready`,
    );
    const artifactStorage = await db.query<{ ready: boolean }>(
      `select exists(
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'resume_artifacts'
      ) as ready`,
    );

    return {
      configured: true,
      connected: true,
      pgvector: pgvector.rows[0]?.installed ?? false,
      schemaReady: schema.rows[0]?.ready ?? false,
      privacyLoggingReady: privacyLogging.rows[0]?.ready ?? false,
      sourceVerificationReady: sourceVerification.rows[0]?.ready ?? false,
      inventoryMetadataReady: inventoryMetadata.rows[0]?.ready ?? false,
      artifactStorageReady: artifactStorage.rows[0]?.ready ?? false,
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      pgvector: false,
      schemaReady: false,
      privacyLoggingReady: false,
      sourceVerificationReady: false,
      inventoryMetadataReady: false,
      artifactStorageReady: false,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}
