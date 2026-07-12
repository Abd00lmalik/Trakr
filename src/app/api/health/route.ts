import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const database = await checkDatabase();

  return NextResponse.json({
    service: "trakr",
    ok: true,
    timestamp: new Date().toISOString(),
    ai: {
      provider: process.env.GEMINI_API_KEY ? "gemini" : "deterministic-local",
      configured: Boolean(process.env.GEMINI_API_KEY),
    },
    database,
  });
}
