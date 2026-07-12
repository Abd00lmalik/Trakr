import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const database = await checkDatabase();
  const aiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const status = database.configured && !database.connected ? "degraded" : "ok";

  return NextResponse.json({
    service: "trakr",
    status,
    ok: status === "ok",
    timestamp: new Date().toISOString(),
    ai: {
      provider: aiConfigured ? "gemini" : "deterministic-local",
      configured: aiConfigured,
    },
    database,
    endpoints: {
      metadata: "/api/a2mcp",
      recommend: "/api/a2mcp/recommend",
    },
  });
}
