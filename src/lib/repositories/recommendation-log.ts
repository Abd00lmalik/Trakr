import { getPool } from "@/lib/db";
import {
  buildPrivacySafeRecommendationLog,
  parseRecommendationLogRetentionDays,
} from "@/lib/privacy/recommendation-logging";
import type {
  RecommendationRequest,
  RecommendationResponse,
} from "@/lib/types/opportunities";

const PRUNE_INTERVAL_MS = 60 * 60 * 1_000;
let lastPrunedAt = 0;

async function pruneExpiredRunsIfDue() {
  if (Date.now() - lastPrunedAt < PRUNE_INTERVAL_MS) {
    return;
  }

  const db = getPool();
  if (!db) {
    return;
  }

  await db.query(
    "delete from recommendation_runs where expires_at <= now()",
  );
  lastPrunedAt = Date.now();
}

export async function logRecommendationRun(
  request: RecommendationRequest,
  response: RecommendationResponse,
  durationMs?: number,
) {
  const db = getPool();
  if (!db) {
    return;
  }

  const retentionDays = parseRecommendationLogRetentionDays(
    process.env.RECOMMENDATION_LOG_RETENTION_DAYS,
  );
  const record = buildPrivacySafeRecommendationLog(request, response, {
    durationMs,
    hashKey: process.env.RECOMMENDATION_LOG_HASH_KEY,
    retentionDays,
  });

  await pruneExpiredRunsIfDue();
  await db.query(
    `insert into recommendation_runs
      (request_id_hash, request_fingerprint, provider, ai_status,
       input_summary, output_summary, duration_ms, retention_days,
       expires_at, created_at)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
    [
      record.requestIdHash,
      record.requestFingerprint,
      record.provider,
      record.aiStatus,
      JSON.stringify(record.inputSummary),
      JSON.stringify(record.outputSummary),
      record.durationMs,
      record.retentionDays,
      record.expiresAt,
      record.createdAt,
    ],
  );
}
