import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { CompanionSessionError } from "@/lib/companion/session";
import { resolveSessionContext } from "@/lib/companion/session";
import { handleOpportunityCompanionRequest } from "@/lib/companion/service";
import {
  operationBelongsToMarketplaceService,
  parseMarketplaceService,
} from "@/lib/companion/marketplace-services";
import { generateRecommendations } from "@/lib/recommendation/service";
import { parseResumeBuffer } from "@/lib/resume/parser";
import { beginIdempotentRequest } from "@/lib/security/idempotency";
import { checkRateLimit, getClientKey } from "@/lib/security/rate-limit";
import {
  claimPaymentCall,
  completePaymentCall,
  inspectPaymentCall,
  markPaymentCallRetryable,
  markPaymentSettled,
  markPaymentSettling,
  markSettlementFailed,
  markSettlementUncertain,
  type PaymentCallClaim,
} from "@/lib/payments/ledger";
import { isX402Enforced } from "@/lib/payments/config";
import {
  paymentFingerprint,
  processX402Request,
  settleX402Payment,
  type VerifiedX402Payment,
} from "@/lib/payments/x402";
import {
  opportunityCompanionRequestSchema,
  recommendationRequestSchema,
} from "@/lib/types/opportunities";
import { TRAKR_SERVICE_VERSION } from "@/lib/version";
import { RequestTiming } from "@/lib/observability/request-timing";
import {
  OperationTimeoutError,
  timeoutFromEnv,
  withTimeout,
} from "@/lib/runtime/timeout";

export const runtime = "nodejs";

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Trakr-Api-Key, X-Trakr-Service, Idempotency-Key, X-Request-Id, PAYMENT-SIGNATURE",
  "Access-Control-Expose-Headers":
    "X-Request-Id, X-Idempotency-Status, X-Trakr-Version, X-Trakr-Duration-Ms, Server-Timing, PAYMENT-REQUIRED, PAYMENT-RESPONSE",
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
    "service",
    "intakeRoute",
    "selectedDiscoveryCategories",
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
  if (!normalized.service && normalized.serviceEntry) {
    normalized.service = normalized.serviceEntry;
  }
  if (!normalized.service && normalized.capability) {
    normalized.service = normalized.capability;
  }
  return normalized;
}

function normalizeMarketplaceServiceRequest(
  request: Request,
  payload: unknown,
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const normalized = { ...(payload as Record<string, unknown>) };
  const url = new URL(request.url);
  const rawSelectors = [
    normalized.service,
    normalized.serviceEntry,
    normalized.capability,
    url.searchParams.get("service"),
    url.searchParams.get("serviceEntry"),
    url.searchParams.get("capability"),
    request.headers.get("x-trakr-service"),
  ].filter(
    (value): value is string =>
      typeof value === "string" && Boolean(value.trim()),
  );
  const parsedSelectors = rawSelectors.map((value) => ({
    raw: value,
    service: parseMarketplaceService(value),
  }));
  const invalid = parsedSelectors.find((item) => !item.service);
  if (invalid) {
    throw new Error(
      `Unsupported Trakr marketplace service selector: ${invalid.raw}`,
    );
  }
  const services = [
    ...new Set(
      parsedSelectors
        .map((item) => item.service)
        .filter((service) => service !== undefined),
    ),
  ];
  if (services.length > 1) {
    throw new Error(
      "Conflicting Trakr marketplace service selectors were supplied.",
    );
  }

  const explicitOperation =
    typeof normalized.operation === "string"
      ? normalized.operation
      : undefined;
  const message =
    typeof normalized.message === "string"
      ? normalized.message.trim()
      : "";
  const explicitLegacyBootstrap =
    !services.length &&
    !explicitOperation &&
    /^(start|show (available )?services?|show me the services?)$/i.test(
      message,
    );
  if (explicitLegacyBootstrap) {
    normalized.operation = "start";
  }
  const legacyRequest =
    !hasConversationalFields(normalized) &&
    recommendationRequestSchema.safeParse(normalized).success;
  const bareOpportunityEntry =
    !message ||
    /^\d+$/.test(message) ||
    /\b(agent\s*#?\s*5198|opportunity matching api)\b/i.test(message);
  const selectedService =
    services[0] ??
    (!legacyRequest &&
    !normalized.context &&
    !normalized.continuation &&
    !explicitLegacyBootstrap &&
    (!explicitOperation || explicitOperation === "auto") &&
    bareOpportunityEntry
      ? "opportunity_finding"
      : undefined);
  if (selectedService) {
    normalized.service = selectedService;
  }
  delete normalized.serviceEntry;
  delete normalized.capability;
  return normalized;
}

function validateServiceContinuation(
  payload: Parameters<typeof handleOpportunityCompanionRequest>[0],
) {
  if (!payload.service) return;
  if (
    !operationBelongsToMarketplaceService(payload.operation, payload.service)
  ) {
    throw new Error(
      "The requested operation does not belong to the selected Trakr marketplace service.",
    );
  }
  const suppliedContext = payload.context ?? payload.continuation;
  if (!suppliedContext) return;
  const context = resolveSessionContext(suppliedContext);
  if (context?.service && context.service !== payload.service) {
    throw new Error(
      "This continuation belongs to a different Trakr marketplace service.",
    );
  }
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
    interactionState:
      value.state === "choose_service"
        ? "service_selection_required"
        : value.state === "choose_opportunity_categories"
          ? "opportunity_category_selection_required"
        : value.state,
    apiVersion: response.version,
    stage: value.stage,
    status: value.status,
    message: value.message,
    selectedService: value.service,
    requiredInputs: value.requiredInputs,
    optionalInputs: value.optionalInputs,
    allowedResponses: value.allowedResponses,
    attachmentsAccepted: value.attachmentsAccepted,
    callerAction: value.callerAction,
    nextActions: value.nextActions,
    continuation: value.continuation,
    callerInstructions: {
      relayMessage: true,
      doNotInferMissingInputs: true,
      sendContinuationUnchanged: true,
      doNotGenerateAProfile: true,
      surfaceOfficialUrls: true,
      doNotSelectService: true,
      askUserForRequiredInputs: true,
      doNotReplaceTrakrMatching: true,
      treatHttp200AsBusinessResponse: true,
      doNotExposeProtocolWorkWhenFree: !isX402Enforced(),
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
    const rawBody = await withTimeout(
      request.text(),
      timeoutFromEnv("TRAKR_REQUEST_BODY_TIMEOUT_MS", 5_000, 1_000, 10_000),
      "request_body_timeout",
    );
    return {
      rawBody,
      payload: rawBody.trim() ? JSON.parse(rawBody) : {},
    };
  }

  const formData = await withTimeout(
    request.formData(),
    timeoutFromEnv("TRAKR_REQUEST_BODY_TIMEOUT_MS", 5_000, 1_000, 10_000),
    "request_body_timeout",
  );
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
        : undefined,
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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function requestHash(payload: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

function paymentInstructionResponse(
  instructions: {
    status: number;
    headers: Record<string, string>;
    body?: unknown;
  },
  requestHeaders: Record<string, string>,
) {
  const providedBody =
    instructions.body &&
    typeof instructions.body === "object" &&
    !Array.isArray(instructions.body)
      ? (instructions.body as Record<string, unknown>)
      : {};
  let challengeError: string | undefined;
  const paymentRequiredHeader =
    instructions.headers["PAYMENT-REQUIRED"] ??
    instructions.headers["payment-required"];
  if (paymentRequiredHeader) {
    try {
      const decoded = JSON.parse(
        Buffer.from(paymentRequiredHeader, "base64").toString("utf8"),
      ) as { error?: unknown };
      if (typeof decoded.error === "string" && decoded.error.trim()) {
        challengeError = decoded.error.trim();
      }
    } catch {
      // Preserve the SDK response even if an upstream header is malformed.
    }
  }
  const normalizedChallengeCode = challengeError
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const code =
    typeof providedBody.code === "string"
      ? providedBody.code
      : normalizedChallengeCode || "payment_required";
  const message =
    typeof providedBody.message === "string"
      ? providedBody.message
      : code === "payment_required"
        ? "Payment is required for this Trakr API call."
        : `The payment proof was rejected (${code}). Obtain a fresh payment requirement and retry.`;
  const body = {
    error:
      typeof providedBody.error === "string" ? providedBody.error : code,
    code,
    message,
    retryable:
      typeof providedBody.retryable === "boolean"
        ? providedBody.retryable
        : true,
    ...providedBody,
    requestId: requestHeaders["X-Request-Id"],
  };
  return json(body, instructions.status, {
    ...requestHeaders,
    ...instructions.headers,
  });
}

export async function GET(request: Request) {
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

  if (!isX402Enforced()) {
    return json(
      {
        error: "method_not_allowed",
        code: "method_not_allowed",
        message: "Use POST for Trakr business requests.",
        requestId,
        retryable: false,
      },
      405,
      {
        ...requestHeaders,
        Allow: "POST, OPTIONS",
      },
    );
  }

  if (request.headers.has("payment-signature")) {
    return json(
      {
        error: "paid_replay_requires_post",
        code: "paid_replay_requires_post",
        message:
          "The payment challenge declares a POST business request. Replay the paid request with POST and the required body.",
        requestId,
        retryable: true,
      },
      405,
      {
        ...requestHeaders,
        Allow: "POST, OPTIONS",
      },
    );
  }

  let normalizedPayload: unknown;
  try {
    normalizedPayload = normalizeMarketplaceServiceRequest(request, {});
  } catch (error) {
    return json(
      {
        error: "service_boundary_conflict",
        code: "service_boundary_conflict",
        message:
          error instanceof Error
            ? error.message
            : "The request conflicts with the selected Trakr marketplace service.",
        requestId,
        retryable: false,
      },
      409,
      requestHeaders,
    );
  }

  const parsed = opportunityCompanionRequestSchema.safeParse(
    normalizedPayload,
  );
  if (!parsed.success) {
    return json(
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
      requestHeaders,
    );
  }

  try {
    const negotiationRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers,
    });
    const paymentResult = await processX402Request(
      negotiationRequest,
      parsed.data,
    );
    if (paymentResult.type === "response") {
      return paymentInstructionResponse(
        paymentResult.response,
        requestHeaders,
      );
    }
  } catch (error) {
    return json(
      {
        error: "payment_service_unavailable",
        code: "payment_service_unavailable",
        message:
          "Trakr could not initialize the payment service for this request.",
        requestId,
        retryable: true,
        detail:
          process.env.NODE_ENV === "development" &&
          error instanceof Error
            ? error.message
            : undefined,
      },
      503,
      requestHeaders,
    );
  }

  return json(
    {
      error: "paid_replay_requires_post",
      code: "paid_replay_requires_post",
      message:
        "The payment challenge declares a POST business request. Replay the paid request with POST and the required body.",
      requestId,
      retryable: true,
    },
    405,
    {
      ...requestHeaders,
      Allow: "POST, OPTIONS",
    },
  );
}

async function executeBusinessRequest(
  normalizedPayload: unknown,
  parsedPayload: Parameters<typeof handleOpportunityCompanionRequest>[0],
  requestId: string,
) {
  try {
    const legacyRequest = hasConversationalFields(normalizedPayload)
      ? null
      : recommendationRequestSchema.safeParse(normalizedPayload);
    const businessPromise = legacyRequest?.success
      ? generateRecommendations(legacyRequest.data)
      : handleOpportunityCompanionRequest(parsedPayload);
    const response = await withTimeout(
      businessPromise,
      timeoutFromEnv(
        "TRAKR_BUSINESS_TIMEOUT_MS",
        25_000,
        5_000,
        45_000,
      ),
      "business_response_timeout",
    );
    return {
      body: exposeConversationContract({ ...response, requestId }),
      status: 200,
    };
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      return {
        body: {
          error: "service_timeout",
          code: error.code,
          message:
            "Trakr could not complete this call within the response deadline. Retry the identical paid request with the same payment proof.",
          requestId,
          retryable: true,
        },
        status: 504,
      };
    }
    if (error instanceof CompanionSessionError) {
      return {
        body: {
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
        status:
          error.code === "expired_session"
            ? 410
            : error.code === "session_unavailable"
              ? 503
              : 400,
      };
    }
    return {
      body: {
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
      status: 500,
    };
  }
}

function claimErrorResponse(
  claim: Exclude<PaymentCallClaim, { status: "owner" | "replay" }>,
  requestId: string,
) {
  if (claim.status === "conflict") {
    return {
      status: 409,
      body: {
        error: "payment_proof_conflict",
        code: "payment_proof_conflict",
        message:
          "This payment proof is already bound to a different Trakr request.",
        requestId,
        retryable: false,
      },
    };
  }
  if (claim.status === "settlement_uncertain") {
    return {
      status: 503,
      body: {
        error: "payment_settlement_uncertain",
        code: "payment_settlement_uncertain",
        message:
          "Settlement may still be completing. Retry this identical request shortly with the same payment proof.",
        requestId,
        retryable: true,
      },
    };
  }
  return {
    status: claim.status === "unavailable" ? 503 : 409,
    body: {
      error:
        claim.status === "unavailable"
          ? "payment_persistence_unavailable"
          : "payment_request_in_progress",
      code:
        claim.status === "unavailable"
          ? "payment_persistence_unavailable"
          : "payment_request_in_progress",
      message:
        claim.status === "unavailable"
          ? "Durable payment replay protection is unavailable."
          : "This paid request is already being processed. Retry the identical request shortly.",
      requestId,
      retryable: true,
    },
  };
}

export async function POST(request: Request) {
  const requestId =
    request.headers.get("x-request-id")?.slice(0, 160) || nanoid();
  const requestHeaders = {
    "X-Request-Id": requestId,
    "X-Trakr-Version": TRAKR_SERVICE_VERSION,
  };
  const timing = new RequestTiming(requestId);
  timing.mark("request", "started", {
    method: request.method,
    hasPayment: request.headers.has("payment-signature"),
  });
  const respond = (
    body: unknown,
    status = 200,
    extraHeaders: Record<string, string> = {},
    stage = "response",
  ) => {
    timing.mark(
      stage,
      status >= 500 ? "failed" : status >= 400 ? "rejected" : "completed",
      { status },
    );
    return json(body, status, {
      ...requestHeaders,
      ...timing.headers(),
      ...extraHeaders,
    });
  };

  if (!isAuthorized(request)) {
    return respond(
      {
        error: "unauthorized",
        code: "unauthorized",
        message: "A valid Trakr API key is required for this deployment.",
        requestId,
        retryable: false,
      },
      401,
      {},
      "authorization",
    );
  }

  const clientKey = getClientKey(request);
  const paymentEnforced = isX402Enforced();
  let rawBody: string;
  let payload: unknown;
  try {
    const parsedRequest = await readRequestPayload(request);
    rawBody = parsedRequest.rawBody;
    payload = parsedRequest.payload;
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    const timedOut = error instanceof OperationTimeoutError;
    return respond(
      {
        error: timedOut
          ? "request_timeout"
          : invalidJson
            ? "invalid_json"
            : "invalid_request_body",
        code: timedOut
          ? error.code
          : invalidJson
            ? "invalid_json"
            : "invalid_request_body",
        message:
          timedOut
            ? "The request body was not received within the allowed time."
            : error instanceof SyntaxError
            ? "Request body must be valid JSON."
            : error instanceof Error
              ? error.message
              : "The request body could not be read.",
        requestId,
        retryable: false,
      },
      timedOut ? 408 : 400,
      {},
      "request_body",
    );
  }

  const idempotency = beginIdempotentRequest(
    clientKey,
    paymentEnforced ? null : request.headers.get("idempotency-key"),
    rawBody,
  );
  if (idempotency.status === "invalid") {
    return respond(
      {
        error: "invalid_idempotency_key",
        code: "invalid_idempotency_key",
        message:
          "Idempotency-Key must contain 8 to 200 letters, numbers, dots, underscores, colons, or hyphens.",
        requestId,
        retryable: false,
      },
      400,
      {},
      "idempotency",
    );
  }
  if (idempotency.status === "conflict") {
    return respond(
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
      {},
      "idempotency",
    );
  }
  if (idempotency.status === "replay") {
    return respond(idempotency.result.body, idempotency.result.status, {
      "X-Idempotency-Status": "replayed",
    }, "idempotency_replay");
  }
  if (idempotency.status === "pending") {
    const result = await idempotency.pending;
    return respond(result.body, result.status, {
      "X-Idempotency-Status": "replayed",
    }, "idempotency_pending_replay");
  }

  function complete(
    body: unknown,
    status = 200,
    extraHeaders: Record<string, string> = {},
  ) {
    if (idempotency.status === "owner") {
      idempotency.complete({ body, status });
    }
    return respond(body, status, {
      ...(idempotency.status === "owner"
        ? { "X-Idempotency-Status": "stored" }
        : {}),
      ...extraHeaders,
    }, "business_response");
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
    normalizedPayload = await withTimeout(
      prepareDocumentPayload(
        normalizeMarketplaceServiceRequest(
          request,
          normalizePayload(payload),
        ),
      ),
      timeoutFromEnv(
        "TRAKR_DOCUMENT_PROCESSING_TIMEOUT_MS",
        8_000,
        2_000,
        20_000,
      ),
      "document_processing_timeout",
    );
  } catch (error) {
    return complete(
      {
        error: "invalid_document",
        code: "invalid_document",
        message:
          error instanceof OperationTimeoutError
            ? "The supplied document could not be processed within the allowed time."
            : error instanceof Error
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
    validateServiceContinuation(parsed.data);
  } catch (error) {
    if (error instanceof CompanionSessionError) {
      return complete(
        {
          error: error.code,
          code: error.code,
          message: error.message,
          requestId,
          retryable: error.code === "session_unavailable",
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
        error: "service_boundary_conflict",
        code: "service_boundary_conflict",
        message:
          error instanceof Error
            ? error.message
            : "The request conflicts with the selected Trakr marketplace service.",
        requestId,
        retryable: false,
      },
      409,
    );
  }

  if (!paymentEnforced) {
    const result = await executeBusinessRequest(
      normalizedPayload,
      parsed.data,
      requestId,
    );
    return complete(result.body, result.status);
  }

  const paidRequestHash = requestHash(normalizedPayload);
  const paymentHeader = request.headers.get("payment-signature");
  let claim: PaymentCallClaim | undefined;
  let verifiedPayment: VerifiedX402Payment | undefined;
  let fingerprint: string | undefined;

  if (paymentHeader) {
    fingerprint = paymentFingerprint(paymentHeader);
    let existing;
    try {
      existing = await inspectPaymentCall(fingerprint, paidRequestHash);
    } catch {
      return respond(
        {
          error: "payment_persistence_unavailable",
          code: "payment_persistence_unavailable",
          message: "Durable payment replay protection is unavailable.",
          requestId,
          retryable: true,
        },
        503,
        {},
        "payment_ledger",
      );
    }
    if (existing?.status === "replay") {
      return respond(existing.response.body, existing.response.status, {
        "PAYMENT-RESPONSE": existing.settlementHeader,
        "X-Idempotency-Status": "replayed",
      }, "payment_replay");
    }
    if (
      existing &&
      existing.status !== "resumable" &&
      existing.status !== "verification_required"
    ) {
      const error = claimErrorResponse(existing, requestId);
      return respond(error.body, error.status, {}, "payment_claim");
    }
    if (existing?.status === "resumable") {
      try {
        claim = await claimPaymentCall({
          paymentFingerprint: fingerprint,
          requestHash: paidRequestHash,
          idempotencyKey: request.headers.get("idempotency-key"),
          requestId,
          alreadyVerified: false,
        });
      } catch {
        return respond(
          {
            error: "payment_persistence_unavailable",
            code: "payment_persistence_unavailable",
            message: "Durable payment replay protection is unavailable.",
            requestId,
            retryable: true,
          },
          503,
          {},
          "payment_ledger",
        );
      }
    }
  }

  if (!claim) {
    let paymentResult;
    try {
      paymentResult = await processX402Request(request, normalizedPayload);
    } catch (error) {
      return respond(
        {
          error: "payment_service_unavailable",
          code: "payment_service_unavailable",
          message:
            "Trakr could not initialize the payment service for this request.",
          requestId,
          retryable: true,
          detail:
            process.env.NODE_ENV === "development" && error instanceof Error
              ? error.message
              : undefined,
        },
        503,
        {},
        "payment_initialization",
      );
    }
    if (paymentResult.type === "response") {
      timing.mark("payment_challenge", "completed", {
        status: paymentResult.response.status,
      });
      return paymentInstructionResponse(
        paymentResult.response,
        { ...requestHeaders, ...timing.headers() },
      );
    }
    verifiedPayment = paymentResult.payment;
    const verifiedHeader = paymentHeader ?? request.headers.get("payment-signature");
    if (!verifiedHeader) {
      return respond(
        {
          error: "payment_proof_missing",
          code: "payment_proof_missing",
          message: "A verified payment proof was not present.",
          requestId,
          retryable: true,
        },
        402,
        {},
        "payment_verification",
      );
    }
    fingerprint = paymentFingerprint(verifiedHeader);
    try {
      claim = await claimPaymentCall({
        paymentFingerprint: fingerprint,
        requestHash: paidRequestHash,
        idempotencyKey: request.headers.get("idempotency-key"),
        requestId,
        alreadyVerified: true,
      });
    } catch {
      return respond(
        {
          error: "payment_persistence_unavailable",
          code: "payment_persistence_unavailable",
          message: "Durable payment replay protection is unavailable.",
          requestId,
          retryable: true,
        },
        503,
        {},
        "payment_ledger",
      );
    }
  }

  if (claim.status === "replay") {
    return respond(claim.response.body, claim.response.status, {
      "PAYMENT-RESPONSE": claim.settlementHeader,
      "X-Idempotency-Status": "replayed",
    }, "payment_replay");
  }
  if (claim.status !== "owner") {
    const error = claimErrorResponse(claim, requestId);
    return respond(error.body, error.status, {}, "payment_claim");
  }
  if (!fingerprint) {
    return respond(
      {
        error: "payment_verification_state_lost",
        code: "payment_verification_state_lost",
        message: "Obtain a fresh payment requirement and retry.",
        requestId,
        retryable: true,
      },
      503,
      {},
      "payment_state",
    );
  }

  let settlementHeader = claim.settlementHeader;
  if (claim.needsSettlement) {
    if (!verifiedPayment) {
      return respond(
        {
          error: "payment_verification_state_lost",
          code: "payment_verification_state_lost",
          message: "Obtain a fresh payment requirement and retry.",
          requestId,
          retryable: true,
        },
        503,
        {},
        "payment_state",
      );
    }
    try {
      await markPaymentSettling(fingerprint, claim.leaseToken);
      const settlement = await settleX402Payment(verifiedPayment, {
        requestId,
        requestHash: paidRequestHash,
      });
      if (!settlement.success || settlement.status === "pending") {
        const settlementCode =
          settlement.errorReason ??
          (settlement.status === "pending"
            ? "asynchronous_settlement_not_accepted"
            : "payment_settlement_failed");
        if (
          settlement.status === "pending" ||
          settlement.status === "timeout" ||
          settlement.transaction
        ) {
          await markSettlementUncertain({
            paymentFingerprint: fingerprint,
            leaseToken: claim.leaseToken,
            transaction: settlement.transaction,
            errorCode: settlementCode,
          });
        } else {
          await markSettlementFailed({
            paymentFingerprint: fingerprint,
            leaseToken: claim.leaseToken,
            errorCode: settlementCode,
          });
        }
        if ("response" in settlement) {
          timing.mark("payment_settlement", "rejected", {
            status: settlement.response.status,
          });
          return paymentInstructionResponse(
            settlement.response,
            { ...requestHeaders, ...timing.headers() },
          );
        }
        return respond(
          {
            error: "payment_settlement_failed",
            code:
              settlement.errorReason ?? "payment_settlement_failed",
            message:
              settlement.errorMessage ??
              "The payment could not be settled synchronously.",
            requestId,
            retryable: true,
          },
          402,
          settlement.headers,
          "payment_settlement",
        );
      }
      settlementHeader = settlement.headers["PAYMENT-RESPONSE"];
      if (!settlementHeader) {
        throw new Error("The facilitator omitted PAYMENT-RESPONSE.");
      }
      await markPaymentSettled({
        paymentFingerprint: fingerprint,
        leaseToken: claim.leaseToken,
        settlementHeader,
        transaction: settlement.transaction,
        status: settlement.status,
        amount: settlement.amount,
        network: settlement.network,
        payer: settlement.payer,
      });
      timing.mark("payment_settlement", "completed", {
        status: settlement.status ?? "success",
      });
    } catch (error) {
      await markSettlementUncertain({
        paymentFingerprint: fingerprint,
        leaseToken: claim.leaseToken,
        errorCode:
          error instanceof Error ? error.message : "payment_settlement_failed",
      });
      return respond(
        {
          error: "payment_settlement_failed",
          code: "payment_settlement_failed",
          message:
            "The payment could not be settled synchronously. Obtain a fresh payment requirement before retrying.",
          requestId,
          retryable: true,
        },
        402,
        {},
        "payment_settlement",
      );
    }
  }

  if (!settlementHeader) {
    const error = claimErrorResponse(
      { status: "settlement_uncertain" },
      requestId,
    );
    return respond(error.body, error.status, {}, "payment_state");
  }

  const result = await executeBusinessRequest(
    normalizedPayload,
    parsed.data,
    requestId,
  );
  timing.mark(
    "business_logic",
    result.status >= 500 ? "failed" : "completed",
    { status: result.status },
  );
  if (result.status >= 500) {
    await markPaymentCallRetryable({
      paymentFingerprint: fingerprint,
      leaseToken: claim.leaseToken,
      errorCode:
        typeof result.body === "object" &&
        result.body &&
        "code" in result.body
          ? String((result.body as { code: unknown }).code)
          : "paid_call_failed",
    });
    return respond(result.body, result.status, {
      "PAYMENT-RESPONSE": settlementHeader,
      "X-Idempotency-Status": "retryable",
    }, "business_response");
  }

  try {
    await completePaymentCall({
      paymentFingerprint: fingerprint,
      leaseToken: claim.leaseToken,
      response: result,
    });
  } catch {
    await markPaymentCallRetryable({
      paymentFingerprint: fingerprint,
      leaseToken: claim.leaseToken,
      errorCode: "paid_response_persistence_failed",
    });
    return respond(
      {
        error: "paid_response_persistence_failed",
        code: "paid_response_persistence_failed",
        message:
          "Payment settled, but Trakr could not persist replay protection. Retry the identical request with the same payment proof.",
        requestId,
        retryable: true,
      },
      503,
      { "PAYMENT-RESPONSE": settlementHeader },
      "payment_ledger",
    );
  }

  return respond(result.body, result.status, {
    "PAYMENT-RESPONSE": settlementHeader,
    "X-Idempotency-Status": "stored",
  }, "business_response");
}
