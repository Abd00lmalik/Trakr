import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { CompanionSessionError } from "@/lib/companion/session";
import { handleOpportunityCompanionRequest } from "@/lib/companion/service";
import { generateRecommendations } from "@/lib/recommendation/service";
import { parseResumeBuffer } from "@/lib/resume/parser";
import { beginIdempotentRequest } from "@/lib/security/idempotency";
import { checkRateLimit, getClientKey } from "@/lib/security/rate-limit";
import {
  opportunityCompanionRequestSchema,
  recommendationRequestSchema,
} from "@/lib/types/opportunities";
import { TRAKR_SERVICE_VERSION } from "@/lib/version";

export const runtime = "nodejs";

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Trakr-Api-Key, Idempotency-Key, X-Request-Id",
  "Access-Control-Expose-Headers":
    "X-Request-Id, X-Idempotency-Status, X-Trakr-Version",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Trakr-Version": TRAKR_SERVICE_VERSION,
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: responseHeaders,
  });
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: { ...responseHeaders, ...headers },
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
  return [
    "message",
    "intent",
    "operation",
    "intakeRoute",
    "consent",
    "context",
    "continuation",
    "target",
    "document",
  ].some((field) => Object.prototype.hasOwnProperty.call(record, field));
}

function normalizePayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const normalized = { ...(payload as Record<string, unknown>) };
  if (!normalized.user && normalized.profile) {
    normalized.user = normalized.profile;
  }
  if (!normalized.context && normalized.continuation) {
    normalized.context = normalized.continuation;
  }
  return normalized;
}

async function prepareDocumentPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const normalized = { ...(payload as Record<string, unknown>) };
  const document = normalized.document;
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return normalized;
  }
  if (normalized.resumeText) {
    throw new Error(
      "Provide either resumeText or document, not both in the same request.",
    );
  }

  const input = document as Record<string, unknown>;
  if (input.representation === "text") {
    normalized.resumeText = input.text;
    return normalized;
  }
  if (input.representation !== "base64") {
    return normalized;
  }

  const dataBase64 = typeof input.dataBase64 === "string"
    ? input.dataBase64
    : "";
  if (
    !dataBase64 ||
    dataBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)
  ) {
    throw new Error("document.dataBase64 must be canonical base64 content.");
  }
  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.toString("base64") !== dataBase64) {
    throw new Error("document.dataBase64 could not be verified.");
  }
  normalized.resumeText = await parseResumeBuffer(buffer, {
    contentType: String(input.mimeType ?? ""),
    fileName: String(input.fileName ?? ""),
  });
  return normalized;
}

function exposeConversationContract<T extends Record<string, unknown>>(
  response: T,
) {
  const conversation = response.conversation;
  if (!conversation || typeof conversation !== "object") {
    return response;
  }
  const value = conversation as Record<string, unknown>;
  const profile =
    value.profile && typeof value.profile === "object"
      ? (value.profile as Record<string, unknown>)
      : undefined;
  const evidence = Array.isArray(profile?.evidence)
    ? (profile.evidence as Array<Record<string, unknown>>)
    : [];
  const origins = [
    ...new Set(
      evidence
        .map((item) => item.origin)
        .filter((origin): origin is string => typeof origin === "string"),
    ),
  ];
  const profileOrigin =
    origins.length === 0
      ? "none"
      : origins.length > 1
        ? "mixed"
        : origins[0] === "resume"
          ? "resume"
          : origins[0] === "user"
            ? "user_message"
            : origins[0] === "structured_profile"
              ? "caller_structured"
              : origins[0] === "context"
                ? "continuation"
                : "mixed";
  return {
    ...response,
    stage: value.stage,
    status: value.status,
    message: value.message,
    selectedService: value.service,
    requiredInputs: value.requiredInputs,
    nextActions: value.nextActions,
    continuation: value.continuation,
    callerInstructions: {
      relayMessage: true,
      doNotInferMissingInputs: true,
      sendContinuationUnchanged: true,
      doNotGenerateAProfile: true,
      surfaceOfficialUrls: true,
    },
    profileOrigin,
    profileConfirmed: profile?.confirmed === true,
    evidenceSources: origins,
    inferredFields: evidence
      .filter((item) => item.source === "inferred")
      .map((item) => String(item.field)),
    confirmationRequired:
      value.state === "profile_confirmation" ||
      value.requiredAction === "review_profile",
  };
}

async function readRequestPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    const rawBody = await request.text();
    return {
      rawBody,
      payload: rawBody.trim() ? JSON.parse(rawBody) : {},
    };
  }

  const formData = await request.formData();
  const file = formData.get("resume");
  if (!(file instanceof File)) {
    throw new Error("Multipart requests must include a resume file.");
  }
  if (formData.get("consent") !== "true") {
    throw new Error(
      "Affirmative session-only resume-processing consent is required.",
    );
  }
  const resumeText = await parseResumeBuffer(
    Buffer.from(await file.arrayBuffer()),
    {
      contentType: file.type,
      fileName: file.name,
    },
  );
  const parseJsonField = (name: string) => {
    const value = formData.get(name);
    if (typeof value !== "string" || !value.trim()) return undefined;
    return JSON.parse(value);
  };
  const operation = formData.get("operation");
  const intakeRoute = formData.get("intakeRoute");
  const message = formData.get("message");
  const continuation = formData.get("continuation");
  const payload = {
    operation:
      typeof operation === "string" && operation
        ? operation
        : "discover",
    intakeRoute:
      typeof intakeRoute === "string" && intakeRoute
        ? intakeRoute
        : undefined,
    message: typeof message === "string" && message ? message : undefined,
    continuation:
      typeof continuation === "string" && continuation
        ? continuation
        : undefined,
    target: parseJsonField("target"),
    filters: parseJsonField("filters"),
    generationPreferences: parseJsonField("generationPreferences"),
    resumeText,
    consent: {
      processPersonalData: true,
      retention: "session_only",
      source: "explicit",
    },
  };
  return {
    rawBody: JSON.stringify({
      multipart: true,
      fileName: file.name,
      fileSize: file.size,
      operation: payload.operation,
      intakeRoute: payload.intakeRoute,
      message: payload.message,
      continuation: payload.continuation,
      target: payload.target,
      filters: payload.filters,
    }),
    payload,
  };
}

export async function POST(request: Request) {
  const requestId =
    request.headers.get("x-request-id")?.slice(0, 160) || nanoid();
  const requestHeaders = {
    "X-Request-Id": requestId,
    "X-Trakr-Version": TRAKR_SERVICE_VERSION,
  };

  if (!isAuthorized(request)) {
    return json(
      {
        error: "unauthorized",
        code: "unauthorized",
        message: "A valid Trakr API key is required for this deployment.",
        requestId,
        retryable: false,
      },
      401,
      requestHeaders,
    );
  }

  const clientKey = getClientKey(request);
  let rawBody: string;
  let payload: unknown;
  try {
    const parsedRequest = await readRequestPayload(request);
    rawBody = parsedRequest.rawBody;
    payload = parsedRequest.payload;
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    return json(
      {
        error: invalidJson ? "invalid_json" : "invalid_request_body",
        code: invalidJson ? "invalid_json" : "invalid_request_body",
        message:
          error instanceof SyntaxError
            ? "Request body must be valid JSON."
            : error instanceof Error
              ? error.message
              : "The request body could not be read.",
        requestId,
        retryable: false,
      },
      400,
      requestHeaders,
    );
  }

  const idempotency = beginIdempotentRequest(
    clientKey,
    request.headers.get("idempotency-key"),
    rawBody,
  );
  if (idempotency.status === "invalid") {
    return json(
      {
        error: "invalid_idempotency_key",
        code: "invalid_idempotency_key",
        message:
          "Idempotency-Key must contain 8 to 200 letters, numbers, dots, underscores, colons, or hyphens.",
        requestId,
        retryable: false,
      },
      400,
      requestHeaders,
    );
  }
  if (idempotency.status === "conflict") {
    return json(
      {
        error: "idempotency_conflict",
        code: "idempotency_conflict",
        message:
          "This Idempotency-Key was already used with a different request body.",
        requestId,
        retryable: false,
        requiredAction: "Use a new Idempotency-Key for a different request.",
      },
      409,
      requestHeaders,
    );
  }
  if (idempotency.status === "replay") {
    return json(idempotency.result.body, idempotency.result.status, {
      ...requestHeaders,
      "X-Idempotency-Status": "replayed",
    });
  }
  if (idempotency.status === "pending") {
    const result = await idempotency.pending;
    return json(result.body, result.status, {
      ...requestHeaders,
      "X-Idempotency-Status": "replayed",
    });
  }

  function complete(
    body: unknown,
    status = 200,
    extraHeaders: Record<string, string> = {},
  ) {
    if (idempotency.status === "owner") {
      idempotency.complete({ body, status });
    }
    return json(body, status, {
      ...requestHeaders,
      ...(idempotency.status === "owner"
        ? { "X-Idempotency-Status": "stored" }
        : {}),
      ...extraHeaders,
    });
  }

  const rateLimit = checkRateLimit(clientKey);
  if (!rateLimit.allowed) {
    return complete(
      {
        error: "rate_limited",
        code: "rate_limited",
        message: "Too many recommendation requests. Retry after the current window resets.",
        requestId,
        retryable: true,
        requiredAction: "Retry after the rate-limit window resets.",
        resetAt: new Date(rateLimit.resetAt).toISOString(),
      },
      429,
    );
  }

  let normalizedPayload: unknown;
  try {
    normalizedPayload = await prepareDocumentPayload(normalizePayload(payload));
  } catch (error) {
    return complete(
      {
        error: "invalid_document",
        code: "invalid_document",
        message:
          error instanceof Error
            ? error.message
            : "The supplied document could not be processed.",
        requestId,
        retryable: false,
      },
      400,
    );
  }
  const parsed = opportunityCompanionRequestSchema.safeParse(normalizedPayload);
  if (!parsed.success) {
    return complete(
      {
        error: "validation_error",
        code: "validation_error",
        message:
          "Request does not match the Trakr opportunity companion schema.",
        requestId,
        retryable: false,
        issues: parsed.error.issues,
      },
      400,
    );
  }

  try {
    const legacyRequest = hasConversationalFields(normalizedPayload)
      ? null
      : recommendationRequestSchema.safeParse(normalizedPayload);
    const response = legacyRequest?.success
      ? await generateRecommendations(legacyRequest.data)
      : await handleOpportunityCompanionRequest(parsed.data);
    return complete(exposeConversationContract({ ...response, requestId }));
  } catch (error) {
    if (error instanceof CompanionSessionError) {
      return complete(
        {
          error: error.code,
          code: error.code,
          message: error.message,
          requestId,
          retryable: error.code === "session_unavailable",
          requiredAction:
            error.code === "expired_session"
              ? "Start a fresh Trakr session with current profile information."
              : "Send a valid continuation reference or start a fresh session.",
        },
        error.code === "expired_session"
          ? 410
          : error.code === "session_unavailable"
            ? 503
            : 400,
      );
    }
    return complete(
      {
        error: "recommendation_failed",
        code: "recommendation_failed",
        message: "Trakr could not generate recommendations for this request.",
        requestId,
        retryable: true,
        detail:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : undefined,
      },
      500,
    );
  }
}
