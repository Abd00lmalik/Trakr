import { NextResponse } from "next/server";
import { ingestOpportunities } from "@/lib/opportunities/ingestion/service";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const ingestKey = process.env.INGEST_API_KEY;
  if (!ingestKey) {
    return process.env.NODE_ENV !== "production";
  }

  const provided =
    request.headers.get("x-ingest-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return provided === ingestKey;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "A valid ingestion key is required.",
      },
      { status: 401 },
    );
  }

  try {
    const result = await ingestOpportunities();
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "ingestion_failed",
        message: error instanceof Error ? error.message : "Ingestion failed.",
      },
      { status: 500 },
    );
  }
}
