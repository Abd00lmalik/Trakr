import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";
import { getAiMetricsSnapshot } from "@/lib/ai/metrics";

export const runtime = "nodejs";

export async function GET() {
  const database = await checkDatabase();
  const aiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const databaseReady =
    !database.configured || (database.connected && database.pgvector && database.schemaReady);
  const status = databaseReady ? "ok" : "degraded";

  return NextResponse.json({
    service: "trakr",
    status,
    ok: status === "ok",
    timestamp: new Date().toISOString(),
    ai: {
      provider: aiConfigured ? "gemini" : "deterministic-local",
      configured: aiConfigured,
      metrics: getAiMetricsSnapshot(),
    },
    database,
    endpoints: {
      metadata: "/api/a2mcp",
      recommend: "/api/a2mcp/recommend",
    },
  });
}
