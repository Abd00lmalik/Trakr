import { createHash } from "node:crypto";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import {
  type FacilitatorClient,
  type HTTPAdapter,
  type HTTPProcessResult,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@okxweb3/x402-core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
} from "@okxweb3/x402-core/types";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import {
  getX402OkxCredentials,
  getX402PayTo,
  X402_ASSET,
  X402_ATOMIC_AMOUNT,
  X402_DEFAULT_FACILITATOR_BASE_URL,
  X402_NETWORK,
  X402_PRICE_USD,
  X402_ROUTE,
  X402_SCHEME,
  X402_TOKEN_DECIMALS,
  X402_TOKEN_NAME,
  X402_TOKEN_VERSION,
  X402_VERSION,
} from "@/lib/payments/config";

class WebRequestAdapter implements HTTPAdapter {
  constructor(
    private readonly request: Request,
    private readonly body: unknown,
  ) {}

  getHeader(name: string) {
    return this.request.headers.get(name) ?? undefined;
  }

  getMethod() {
    return this.request.method;
  }

  getPath() {
    return new URL(this.request.url).pathname;
  }

  getUrl() {
    return this.request.url;
  }

  getAcceptHeader() {
    return this.request.headers.get("accept") ?? "";
  }

  getUserAgent() {
    return this.request.headers.get("user-agent") ?? "";
  }

  getQueryParams() {
    const entries: Record<string, string | string[]> = {};
    for (const [key, value] of new URL(this.request.url).searchParams) {
      const existing = entries[key];
      entries[key] =
        existing === undefined
          ? value
          : Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
    }
    return entries;
  }

  getQueryParam(name: string) {
    return this.getQueryParams()[name];
  }

  getBody() {
    return this.body;
  }
}

export type VerifiedX402Payment = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  declaredExtensions?: Record<string, unknown>;
  context: {
    adapter: HTTPAdapter;
    path: string;
    method: string;
    paymentHeader?: string;
    routePattern?: string;
  };
};

type X402InputType = "array" | "object" | "string";

function bodyInput(type: X402InputType) {
  return {
    carrier: "body",
    required: false,
    type,
  };
}

export const TRAKR_X402_OUTPUT_SCHEMA = {
  method: "POST",
  input: {
    operation: bodyInput("string"),
    message: bodyInput("string"),
    intent: bodyInput("string"),
    intakeRoute: bodyInput("string"),
    selectedDiscoveryCategories: bodyInput("array"),
    user: bodyInput("object"),
    profile: bodyInput("object"),
    resumeText: bodyInput("string"),
    document: bodyInput("object"),
    consent: bodyInput("object"),
    target: bodyInput("object"),
    generationPreferences: bodyInput("object"),
    context: bodyInput("object"),
    continuation: bodyInput("string"),
    goals: bodyInput("array"),
    interests: bodyInput("array"),
    filters: bodyInput("object"),
    requestId: bodyInput("string"),
  },
} as const;

let serverPromise: Promise<x402HTTPResourceServer> | undefined;

export async function createX402Server(facilitator: FacilitatorClient) {
  const resourceServer = new x402ResourceServer(facilitator).register(
    X402_NETWORK,
    new ExactEvmScheme(),
  );
  const httpServer = new x402HTTPResourceServer(resourceServer, {
    [X402_ROUTE]: {
      accepts: {
        scheme: X402_SCHEME,
        network: X402_NETWORK,
        payTo: getX402PayTo(),
        price: `$${X402_PRICE_USD}`,
        maxTimeoutSeconds: 120,
      },
      resource: "/api/a2mcp/recommend",
      description:
        "One paid Trakr API call for opportunity discovery, career readiness, or resume support.",
      mimeType: "application/json",
      unpaidResponseBody: () => ({
        contentType: "application/json",
        body: {
          error: "payment_required",
          code: "payment_required",
          message: `This valid Trakr API call requires ${X402_PRICE_USD} ${X402_TOKEN_NAME} on X Layer.`,
          retryable: true,
          outputSchema: TRAKR_X402_OUTPUT_SCHEMA,
          payment: {
            x402Version: X402_VERSION,
            scheme: X402_SCHEME,
            network: X402_NETWORK,
            asset: X402_ASSET,
            amount: X402_ATOMIC_AMOUNT,
            token: X402_TOKEN_NAME,
            tokenVersion: X402_TOKEN_VERSION,
            tokenDecimals: X402_TOKEN_DECIMALS,
          },
        },
      }),
      settlementFailedResponseBody: (_context, result) => ({
        contentType: "application/json",
        body: {
          error: "payment_settlement_failed",
          code: result.errorReason || "payment_settlement_failed",
          message:
            result.errorMessage ||
            "The payment could not be settled. Obtain a fresh payment requirement before retrying.",
          retryable: true,
        },
      }),
    },
  });
  httpServer.setPollDeadline(15_000);
  await httpServer.initialize();
  return httpServer;
}

async function createServer() {
  const credentials = getX402OkxCredentials();
  const facilitator = new OKXFacilitatorClient({
    ...credentials,
    baseUrl:
      process.env.TRAKR_X402_OKX_BASE_URL?.trim() ||
      X402_DEFAULT_FACILITATOR_BASE_URL,
    syncSettle: true,
  });
  return createX402Server(facilitator);
}

export function resetX402ServerForTests() {
  serverPromise = undefined;
}

export function setX402ServerForTests(server: x402HTTPResourceServer) {
  serverPromise = Promise.resolve(server);
}

async function getServer() {
  serverPromise ??= createServer();
  return serverPromise;
}

export function paymentFingerprint(paymentHeader: string) {
  return createHash("sha256").update(paymentHeader).digest("hex");
}

export async function processX402Request(
  request: Request,
  body: unknown,
): Promise<
  | { type: "response"; response: Extract<HTTPProcessResult, { type: "payment-error" }>["response"] }
  | { type: "verified"; payment: VerifiedX402Payment }
> {
  const server = await getServer();
  const adapter = new WebRequestAdapter(request, body);
  const context = {
    adapter,
    path: adapter.getPath(),
    method: adapter.getMethod(),
    paymentHeader: adapter.getHeader("PAYMENT-SIGNATURE"),
    routePattern: X402_ROUTE,
  };
  const result = await server.processHTTPRequest(context);
  if (result.type === "payment-error") {
    return { type: "response", response: result.response };
  }
  if (result.type !== "payment-verified") {
    throw new Error("The paid Trakr route was not recognized by x402.");
  }
  return {
    type: "verified",
    payment: {
      paymentPayload: result.paymentPayload,
      paymentRequirements: result.paymentRequirements,
      declaredExtensions: result.declaredExtensions,
      context,
    },
  };
}

export async function settleX402Payment(
  payment: VerifiedX402Payment,
  responseBody: unknown,
) {
  const server = await getServer();
  return server.processSettlement(
    payment.paymentPayload,
    payment.paymentRequirements,
    payment.declaredExtensions,
    {
      request: payment.context,
      responseBody: Buffer.from(JSON.stringify(responseBody)),
      responseHeaders: { "Content-Type": "application/json" },
    },
  );
}
