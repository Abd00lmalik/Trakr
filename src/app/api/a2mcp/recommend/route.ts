import { NextResponse } from "next/server";
import { generateRecommendations } from "@/lib/recommendation/service";
import { recommendationRequestSchema } from "@/lib/types/opportunities";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "invalid_json",
        message: "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  const parsed = recommendationRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Request does not match the Trakr recommendation schema.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const response = await generateRecommendations(parsed.data);
  return NextResponse.json(response);
}
