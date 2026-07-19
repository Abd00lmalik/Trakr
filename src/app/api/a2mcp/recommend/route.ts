import { NextResponse } from "next/server";
import { handleOpportunityCompanionRequest } from "@/lib/companion/service";
import { generateRecommendations } from "@/lib/recommendation/service";
import { checkRateLimit, getClientKey } from "@/lib/security/rate-limit";
import {
  opportunityCompanionRequestSchema,
  recommendationRequestSchema,
} from "@/lib/types/opportunities";

export const runtime = "nodejs";

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Trakr-Api-Key",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: responseHeaders,
  });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: responseHeaders,
  });
}

function isAuthorized(request: Request) {
  const requiredKey = process.env.TRAKR_API_KEY;
  if (!requiredKey) {
    return true;
  }

  const providedKey =
    request.headers.get("x-trakr-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return providedKey === requiredKey;
}

function hasConversationalFields(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return ["message", "intent", "context", "target"].some((field) =>
    Object.prototype.hasOwnProperty.call(record, field),
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return json(
      {
        error: "unauthorized",
        message: "A valid Trakr API key is required for this deployment.",
      },
      401,
    );
  }

  const rateLimit = checkRateLimit(getClientKey(request));
  if (!rateLimit.allowed) {
    return json(
      {
        error: "rate_limited",
        message: "Too many recommendation requests. Retry after the current window resets.",
        resetAt: new Date(rateLimit.resetAt).toISOString(),
      },
      429,
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json(
      {
        error: "invalid_json",
        message: "Request body must be valid JSON.",
      },
      400,
    );
  }

  const parsed = opportunityCompanionRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return json(
      {
        error: "validation_error",
        message:
          "Request does not match the Trakr opportunity companion schema.",
        issues: parsed.error.issues,
      },
      400,
    );
  }

  try {
    const legacyRequest = hasConversationalFields(payload)
      ? null
      : recommendationRequestSchema.safeParse(payload);
    const response = legacyRequest?.success
      ? await generateRecommendations(legacyRequest.data)
      : await handleOpportunityCompanionRequest(parsed.data);
    return json(response);
  } catch (error) {
    return json(
      {
        error: "recommendation_failed",
        message: "Trakr could not generate recommendations for this request.",
        detail:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : undefined,
      },
      500,
    );
  }
}
