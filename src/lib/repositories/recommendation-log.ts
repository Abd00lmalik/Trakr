import { getPool } from "@/lib/db";
import type {
  RecommendationRequest,
  RecommendationResponse,
} from "@/lib/types/opportunities";

export async function logRecommendationRun(
  request: RecommendationRequest,
  response: RecommendationResponse,
) {
  const db = getPool();
  if (!db) {
    return;
  }

  await db.query(
    `insert into recommendation_runs
      (request_id, provider, request_payload, response_payload, created_at)
     values ($1, $2, $3::jsonb, $4::jsonb, now())`,
    [
      response.requestId,
      response.provider,
      JSON.stringify(request),
      JSON.stringify(response),
    ],
  );
}
