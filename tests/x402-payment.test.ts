import assert from "node:assert/strict";
import test from "node:test";
import { newDb } from "pg-mem";
import type {
  FacilitatorClient,
} from "@okxweb3/x402-core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@okxweb3/x402-core/types";
import {
  X402_ASSET,
  X402_ATOMIC_AMOUNT,
  X402_NETWORK,
  X402_SCHEME,
  X402_TOKEN_NAME,
  X402_TOKEN_VERSION,
  X402_VERSION,
} from "../src/lib/payments/config";
import {
  createX402Server,
  createProductionFacilitatorClient,
  processX402Request,
  resetX402ServerForTests,
  setX402ServerForTests,
  settleX402Payment,
  TRAKR_X402_OUTPUT_SCHEMA,
} from "../src/lib/payments/x402";
import {
  claimPaymentCall,
  completePaymentCall,
  inspectPaymentCall,
  markPaymentCallRetryable,
  markPaymentSettled,
  markPaymentSettling,
  markSettlementFailed,
  setPaymentPoolForTests,
  markSettlementUncertain,
} from "../src/lib/payments/ledger";
import { POST } from "../src/app/api/a2mcp/recommend/route";

const payTo = "0xbe116468bb544723141647608fe98c1bc0471291";

class FakeFacilitator implements FacilitatorClient {
  verifyCalls = 0;
  settleCalls = 0;

  async getSupported(): Promise<SupportedResponse> {
    return {
      kinds: [
        {
          x402Version: X402_VERSION,
          scheme: X402_SCHEME,
          network: X402_NETWORK,
          extra: {},
        },
      ],
      extensions: [],
      signers: { "eip155:*": [payTo] },
    };
  }

  async verify(
    _paymentPayload: PaymentPayload,
    _paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    this.verifyCalls += 1;
    return { isValid: true, payer: "0x1111111111111111111111111111111111111111" };
  }

  async settle(
    _paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    this.settleCalls += 1;
    return {
      success: true,
      status: "success",
      payer: "0x1111111111111111111111111111111111111111",
      transaction:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      network: paymentRequirements.network,
      amount: paymentRequirements.amount,
    };
  }
}

class FailOnceFacilitator extends FakeFacilitator {
  override async settle(
    _paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    this.settleCalls += 1;
    if (this.settleCalls === 1) {
      return {
        success: false,
        errorReason: "facilitator_rejected",
        errorMessage: "The facilitator rejected the settlement.",
        transaction: "",
        network: paymentRequirements.network,
      };
    }
    return {
      success: true,
      status: "success",
      payer: "0x1111111111111111111111111111111111111111",
      transaction:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      network: paymentRequirements.network,
      amount: paymentRequirements.amount,
    };
  }
}

class HangingCapabilityFacilitator extends FakeFacilitator {
  supportedCalls = 0;

  override async getSupported(): Promise<SupportedResponse> {
    this.supportedCalls += 1;
    return new Promise<SupportedResponse>(() => undefined);
  }
}

class HangingVerificationFacilitator extends FakeFacilitator {
  override async verify(): Promise<VerifyResponse> {
    this.verifyCalls += 1;
    return new Promise<VerifyResponse>(() => undefined);
  }
}

function request(paymentSignature?: string) {
  return new Request(
    "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(paymentSignature
          ? { "PAYMENT-SIGNATURE": paymentSignature }
          : {}),
      },
      body: JSON.stringify({ operation: "start" }),
    },
  );
}

function decodeHeader<T>(value: string) {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as T;
}

function encodeHeader(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

function createPaymentTestPool() {
  const memory = newDb();
  memory.public.none(`
    create table x402_payment_calls (
      payment_fingerprint text primary key,
      request_hash text not null,
      idempotency_key_hash text,
      request_id_hash text,
      state text not null,
      lease_token text,
      lease_expires_at timestamptz,
      settlement_transaction text,
      settlement_status text,
      settlement_amount text,
      settlement_network text,
      settlement_payer_hash text,
      settlement_header_ciphertext text,
      response_ciphertext text,
      response_status integer,
      last_error_code text,
      expires_at timestamptz not null default (now() + interval '1 day'),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  const adapter = memory.adapters.createPg();
  return new adapter.Pool();
}

test("official OKX server emits a compliant x402 v2 exact challenge", async () => {
  process.env.TRAKR_X402_PAY_TO = payTo;
  const facilitator = new FakeFacilitator();
  const server = await createX402Server(facilitator);
  setX402ServerForTests(server);

  const result = await processX402Request(request(), { operation: "start" });
  assert.equal(result.type, "response");
  if (result.type !== "response") return;
  assert.equal(result.response.status, 402);

  const header = result.response.headers["PAYMENT-REQUIRED"];
  assert.ok(header);
  const challenge = decodeHeader<{
    x402Version: number;
    resource: { url: string };
    accepts: PaymentRequirements[];
  }>(header);
  assert.equal(challenge.x402Version, X402_VERSION);
  assert.equal(
    challenge.resource.url,
    "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
  );
  assert.equal(challenge.accepts.length, 1);
  assert.deepEqual(challenge.accepts[0], {
    scheme: X402_SCHEME,
    network: X402_NETWORK,
    asset: X402_ASSET,
    amount: X402_ATOMIC_AMOUNT,
    payTo,
    maxTimeoutSeconds: 120,
    extra: {
      name: X402_TOKEN_NAME,
      version: X402_TOKEN_VERSION,
    },
  });
  assert.equal(facilitator.verifyCalls, 0);
  resetX402ServerForTests();
});

test("production cold challenge does not wait on facilitator capability discovery", async () => {
  process.env.TRAKR_X402_PAY_TO = payTo;
  const facilitator = new HangingCapabilityFacilitator();
  const server = await createX402Server(
    createProductionFacilitatorClient(facilitator),
  );
  setX402ServerForTests(server);

  const startedAt = performance.now();
  const result = await processX402Request(request(), { operation: "start" });
  const durationMs = performance.now() - startedAt;

  assert.equal(result.type, "response");
  if (result.type === "response") {
    assert.equal(result.response.status, 402);
  }
  assert.equal(facilitator.supportedCalls, 0);
  assert.ok(
    durationMs < 500,
    `Cold challenge should be local and fast, received ${durationMs}ms`,
  );
  resetX402ServerForTests();
});

test("production payment verification returns a 402 when the facilitator stalls", async () => {
  process.env.TRAKR_X402_PAY_TO = payTo;
  process.env.TRAKR_X402_VERIFY_TIMEOUT_MS = "1000";
  const facilitator = new HangingVerificationFacilitator();
  const server = await createX402Server(
    createProductionFacilitatorClient(facilitator),
  );
  setX402ServerForTests(server);

  const unpaid = await processX402Request(request(), { operation: "start" });
  assert.equal(unpaid.type, "response");
  if (unpaid.type !== "response") return;
  const challenge = decodeHeader<{
    x402Version: number;
    resource: { url: string };
    accepts: PaymentRequirements[];
  }>(unpaid.response.headers["PAYMENT-REQUIRED"]);
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    resource: challenge.resource,
    accepted: challenge.accepts[0],
    payload: {
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to: payTo,
        value: X402_ATOMIC_AMOUNT,
        validAfter: "0",
        validBefore: "9999999999",
        nonce:
          "0x4545454545454545454545454545454545454545454545454545454545454545",
      },
      signature: "0x01",
    },
  };

  const startedAt = performance.now();
  const result = await processX402Request(
    request(encodeHeader(payload)),
    { operation: "start" },
  );
  const durationMs = performance.now() - startedAt;

  assert.equal(result.type, "response");
  if (result.type === "response") {
    assert.equal(result.response.status, 402);
    const failure = decodeHeader<{ error?: string }>(
      result.response.headers["PAYMENT-REQUIRED"],
    );
    assert.match(failure.error ?? "", /payment_verification_timeout/i);
  }
  assert.equal(facilitator.verifyCalls, 1);
  assert.ok(durationMs >= 900 && durationMs < 1_500);

  delete process.env.TRAKR_X402_VERIFY_TIMEOUT_MS;
  resetX402ServerForTests();
});

test("402 body advertises the paid POST request parameters for OKX replay", async () => {
  process.env.TRAKR_X402_PAY_TO = payTo;
  const facilitator = new FakeFacilitator();
  const server = await createX402Server(facilitator);
  setX402ServerForTests(server);

  const message =
    "Find remote Web3 hackathons for a frontend developer in Lagos";
  const result = await processX402Request(
    new Request(
      "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      },
    ),
    { message },
  );
  assert.equal(result.type, "response");
  if (result.type !== "response") return;

  assert.deepEqual(
    (result.response.body as { outputSchema?: unknown }).outputSchema,
    TRAKR_X402_OUTPUT_SCHEMA,
  );
  assert.deepEqual(TRAKR_X402_OUTPUT_SCHEMA.input.message, {
    carrier: "body",
    required: false,
    type: "string",
  });
  assert.deepEqual(TRAKR_X402_OUTPUT_SCHEMA.input.continuation, {
    carrier: "body",
    required: false,
    type: "string",
  });
  assert.deepEqual(TRAKR_X402_OUTPUT_SCHEMA.input.service, {
    carrier: "query",
    required: false,
    type: "string",
  });
  assert.equal(TRAKR_X402_OUTPUT_SCHEMA.method, "POST");
  resetX402ServerForTests();
});

test("all three marketplace service entries receive the same compliant x402 challenge", async () => {
  process.env.TRAKR_X402_ENFORCEMENT = "enforce";
  process.env.TRAKR_X402_PAY_TO = payTo;
  const facilitator = new FakeFacilitator();

  const entries = [
    {
      url: "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
      service: "opportunity_finding",
    },
    {
      url: "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend?service=resume-benchmarking-optimization",
      service: "resume_benchmarking_optimization",
    },
    {
      url: "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend?service=resume-generation",
      service: "resume_generation",
    },
  ];
  for (const [index, entry] of entries.entries()) {
    setX402ServerForTests(
      await createX402Server(facilitator, entry.url),
    );
    const response = await POST(
      new Request(entry.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": `198.51.100.${100 + index}`,
        },
        body: JSON.stringify({ service: entry.service }),
      }),
    );
    assert.equal(response.status, 402, entry.url);
    const challenge = decodeHeader<{
      x402Version: number;
      resource: { url: string };
      accepts: PaymentRequirements[];
    }>(response.headers.get("PAYMENT-REQUIRED") ?? "");
    assert.equal(challenge.x402Version, X402_VERSION);
    assert.equal(challenge.resource.url, entry.url);
    assert.equal(challenge.accepts[0].scheme, X402_SCHEME);
    assert.equal(challenge.accepts[0].network, X402_NETWORK);
    assert.equal(challenge.accepts[0].asset, X402_ASSET);
    assert.equal(challenge.accepts[0].amount, X402_ATOMIC_AMOUNT);
    assert.equal(challenge.accepts[0].payTo, payTo);
    resetX402ServerForTests();
  }

  process.env.TRAKR_X402_ENFORCEMENT = "off";
});

test("valid proof verifies and settles synchronously with PAYMENT-RESPONSE", async () => {
  process.env.TRAKR_X402_PAY_TO = payTo;
  const facilitator = new FakeFacilitator();
  const server = await createX402Server(facilitator);
  setX402ServerForTests(server);

  const unpaid = await processX402Request(request(), { operation: "start" });
  assert.equal(unpaid.type, "response");
  if (unpaid.type !== "response") return;
  const challenge = decodeHeader<{
    x402Version: number;
    resource: { url: string; description?: string; mimeType?: string };
    accepts: PaymentRequirements[];
  }>(unpaid.response.headers["PAYMENT-REQUIRED"]);
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    resource: challenge.resource,
    accepted: challenge.accepts[0],
    payload: {
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to: payTo,
        value: X402_ATOMIC_AMOUNT,
        validAfter: "0",
        validBefore: "9999999999",
        nonce:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      signature: "0x01",
    },
  };

  const paid = await processX402Request(
    request(encodeHeader(payload)),
    { operation: "start" },
  );
  assert.equal(paid.type, "verified");
  if (paid.type !== "verified") return;
  const settlement = await settleX402Payment(paid.payment, {
    requestId: "test",
  });
  assert.equal(settlement.success, true);
  assert.equal(settlement.status, "success");
  assert.equal(settlement.amount, X402_ATOMIC_AMOUNT);
  assert.ok(settlement.headers["PAYMENT-RESPONSE"]);
  assert.equal(facilitator.verifyCalls, 1);
  assert.equal(facilitator.settleCalls, 1);
  resetX402ServerForTests();
});

test("a proof for the wrong network is rejected before settlement", async () => {
  process.env.TRAKR_X402_PAY_TO = payTo;
  const facilitator = new FakeFacilitator();
  const server = await createX402Server(facilitator);
  setX402ServerForTests(server);

  const unpaid = await processX402Request(request(), { operation: "start" });
  assert.equal(unpaid.type, "response");
  if (unpaid.type !== "response") return;
  const challenge = decodeHeader<{
    x402Version: number;
    resource: { url: string };
    accepts: PaymentRequirements[];
  }>(unpaid.response.headers["PAYMENT-REQUIRED"]);
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    resource: challenge.resource,
    accepted: {
      ...challenge.accepts[0],
      network: "eip155:1",
    },
    payload: { authorization: {}, signature: "0x01" },
  };

  const result = await processX402Request(
    request(encodeHeader(payload)),
    { operation: "start" },
  );
  assert.equal(result.type, "response");
  if (result.type !== "response") return;
  assert.equal(result.response.status, 402);
  assert.equal(facilitator.verifyCalls, 0);
  assert.equal(facilitator.settleCalls, 0);
  resetX402ServerForTests();
});

test("route payment failures preserve a machine-readable rejection body", async () => {
  process.env.TRAKR_X402_ENFORCEMENT = "enforce";
  process.env.TRAKR_X402_PAY_TO = payTo;
  const facilitator = new FakeFacilitator();
  setX402ServerForTests(await createX402Server(facilitator));

  const unpaid = await POST(request());
  const challenge = decodeHeader<{
    x402Version: number;
    resource: { url: string };
    accepts: PaymentRequirements[];
  }>(unpaid.headers.get("PAYMENT-REQUIRED") ?? "");
  const wrongNetworkPayload: PaymentPayload = {
    x402Version: X402_VERSION,
    resource: challenge.resource,
    accepted: {
      ...challenge.accepts[0],
      network: "eip155:1952",
    },
    payload: { authorization: {}, signature: "0x01" },
  };

  const rejected = await POST(request(encodeHeader(wrongNetworkPayload)));
  const body = await rejected.json();
  assert.equal(rejected.status, 402);
  assert.equal(body.error, "no_matching_payment_requirements");
  assert.equal(body.code, "no_matching_payment_requirements");
  assert.match(body.message, /payment proof was rejected/i);
  assert.equal(body.retryable, true);
  assert.ok(rejected.headers.get("PAYMENT-REQUIRED"));

  resetX402ServerForTests();
  process.env.TRAKR_X402_ENFORCEMENT = "off";
});

test("a payment-ledger outage returns promptly instead of hanging the route", async () => {
  process.env.TRAKR_X402_ENFORCEMENT = "enforce";
  process.env.TRAKR_X402_PAY_TO = payTo;
  setPaymentPoolForTests({
    query: async () => {
      throw new Error("database unavailable");
    },
  });

  const startedAt = performance.now();
  const response = await POST(request("bm90LWEtdmFsaWQtcHJvb2Y="));
  const durationMs = performance.now() - startedAt;
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.code, "payment_persistence_unavailable");
  assert.equal(body.retryable, true);
  assert.ok(durationMs < 500);

  setPaymentPoolForTests(undefined);
  process.env.TRAKR_X402_ENFORCEMENT = "off";
});

test("wrong asset, amount, and recipient are rejected before settlement", async () => {
  process.env.TRAKR_X402_PAY_TO = payTo;

  for (const accepted of [
    { asset: "0x0000000000000000000000000000000000000001" },
    { amount: "4999" },
    { payTo: "0x2222222222222222222222222222222222222222" },
  ]) {
    const facilitator = new FakeFacilitator();
    const server = await createX402Server(facilitator);
    setX402ServerForTests(server);
    const unpaid = await processX402Request(request(), {
      operation: "start",
    });
    assert.equal(unpaid.type, "response");
    if (unpaid.type !== "response") continue;
    const challenge = decodeHeader<{
      x402Version: number;
      resource: { url: string };
      accepts: PaymentRequirements[];
    }>(unpaid.response.headers["PAYMENT-REQUIRED"]);
    const payload: PaymentPayload = {
      x402Version: X402_VERSION,
      resource: challenge.resource,
      accepted: {
        ...challenge.accepts[0],
        ...accepted,
      },
      payload: {
        authorization: {},
        signature: "0x01",
      },
    };

    const result = await processX402Request(
      request(encodeHeader(payload)),
      { operation: "start" },
    );
    assert.equal(result.type, "response");
    if (result.type === "response") {
      assert.equal(result.response.status, 402);
    }
    assert.equal(facilitator.verifyCalls, 0);
    assert.equal(facilitator.settleCalls, 0);
    resetX402ServerForTests();
  }
});

test("an expired authorization is rejected without settlement", async () => {
  process.env.TRAKR_X402_PAY_TO = payTo;
  class ExpiryCheckingFacilitator extends FakeFacilitator {
    override async verify(
      paymentPayload: PaymentPayload,
      _paymentRequirements: PaymentRequirements,
    ): Promise<VerifyResponse> {
      this.verifyCalls += 1;
      const authorization = (
        paymentPayload.payload as {
          authorization?: { validBefore?: string };
        }
      ).authorization;
      return Number(authorization?.validBefore ?? 0) <= Date.now() / 1000
        ? {
            isValid: false,
            invalidReason: "expired_payment",
            invalidMessage: "The payment authorization has expired.",
          }
        : { isValid: true };
    }
  }

  const facilitator = new ExpiryCheckingFacilitator();
  const server = await createX402Server(facilitator);
  setX402ServerForTests(server);
  const unpaid = await processX402Request(request(), { operation: "start" });
  assert.equal(unpaid.type, "response");
  if (unpaid.type !== "response") return;
  const challenge = decodeHeader<{
    x402Version: number;
    resource: { url: string };
    accepts: PaymentRequirements[];
  }>(unpaid.response.headers["PAYMENT-REQUIRED"]);
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    resource: challenge.resource,
    accepted: challenge.accepts[0],
    payload: {
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to: payTo,
        value: X402_ATOMIC_AMOUNT,
        validAfter: "0",
        validBefore: "1",
        nonce:
          "0x3434343434343434343434343434343434343434343434343434343434343434",
      },
      signature: "0x01",
    },
  };

  const result = await processX402Request(
    request(encodeHeader(payload)),
    { operation: "start" },
  );
  assert.equal(result.type, "response");
  if (result.type === "response") {
    assert.equal(result.response.status, 402);
  }
  assert.equal(facilitator.verifyCalls, 1);
  assert.equal(facilitator.settleCalls, 0);
  resetX402ServerForTests();
});

test("PostgreSQL ledger binds, encrypts, replays, and resumes paid calls", async () => {
  process.env.TRAKR_X402_RESULT_SECRET =
    "test-only-payment-result-secret-with-more-than-thirty-two-characters";
  const pool = createPaymentTestPool();
  setPaymentPoolForTests(pool);

  const fingerprint =
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  const requestHash =
    "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
  const first = await claimPaymentCall({
    paymentFingerprint: fingerprint,
    requestHash,
    idempotencyKey: "ledger-test-key",
    requestId: "ledger-test-request",
    alreadyVerified: true,
  });
  assert.equal(first.status, "owner");
  if (first.status !== "owner") return;
  assert.equal(first.needsSettlement, true);

  const concurrent = await inspectPaymentCall(fingerprint, requestHash);
  assert.equal(concurrent?.status, "pending");

  await markPaymentSettling(fingerprint, first.leaseToken);
  await markPaymentSettled({
    paymentFingerprint: fingerprint,
    leaseToken: first.leaseToken,
    settlementHeader: "encrypted-settlement-header",
    transaction:
      "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    status: "success",
    amount: X402_ATOMIC_AMOUNT,
    network: X402_NETWORK,
    payer: "0x1111111111111111111111111111111111111111",
  });
  await completePaymentCall({
    paymentFingerprint: fingerprint,
    leaseToken: first.leaseToken,
    response: {
      status: 200,
      body: {
        message: "private response",
        profile: { skills: ["TypeScript"] },
      },
    },
  });

  const replay = await inspectPaymentCall(fingerprint, requestHash);
  assert.equal(replay?.status, "replay");
  if (replay?.status === "replay") {
    assert.deepEqual(replay.response.body, {
      message: "private response",
      profile: { skills: ["TypeScript"] },
    });
    assert.equal(replay.settlementHeader, "encrypted-settlement-header");
  }
  const persisted = (await pool.query(
    `select response_ciphertext, settlement_header_ciphertext
       from x402_payment_calls
      where payment_fingerprint = $1`,
    [fingerprint],
  )) as {
    rows: Array<{
      response_ciphertext: string;
      settlement_header_ciphertext: string;
    }>;
  };
  assert.equal(
    persisted.rows[0].response_ciphertext.includes("TypeScript"),
    false,
  );
  assert.equal(
    persisted.rows[0].settlement_header_ciphertext.includes(
      "encrypted-settlement-header",
    ),
    false,
  );

  const conflict = await inspectPaymentCall(
    fingerprint,
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  );
  assert.equal(conflict?.status, "conflict");

  const retryFingerprint =
    "abababababababababababababababababababababababababababababababab";
  const retryClaim = await claimPaymentCall({
    paymentFingerprint: retryFingerprint,
    requestHash,
    idempotencyKey: null,
    requestId: "retryable-request",
    alreadyVerified: true,
  });
  assert.equal(retryClaim.status, "owner");
  if (retryClaim.status !== "owner") return;
  await markPaymentSettling(retryFingerprint, retryClaim.leaseToken);
  await markPaymentSettled({
    paymentFingerprint: retryFingerprint,
    leaseToken: retryClaim.leaseToken,
    settlementHeader: "retry-settlement-header",
    transaction:
      "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    status: "success",
    amount: X402_ATOMIC_AMOUNT,
    network: X402_NETWORK,
  });
  await markPaymentCallRetryable({
    paymentFingerprint: retryFingerprint,
    leaseToken: retryClaim.leaseToken,
    errorCode: "provider_unavailable",
  });
  assert.equal(
    (await inspectPaymentCall(retryFingerprint, requestHash))?.status,
    "resumable",
  );
  const resumed = await claimPaymentCall({
    paymentFingerprint: retryFingerprint,
    requestHash,
    idempotencyKey: null,
    requestId: "retryable-request-2",
    alreadyVerified: false,
  });
  assert.equal(resumed.status, "owner");
  if (resumed.status === "owner") {
    assert.equal(resumed.needsSettlement, false);
    assert.equal(resumed.settlementHeader, "retry-settlement-header");
  }

  const failedFingerprint =
    "acacacacacacacacacacacacacacacacacacacacacacacacacacacacacacacac";
  const failedClaim = await claimPaymentCall({
    paymentFingerprint: failedFingerprint,
    requestHash,
    idempotencyKey: null,
    requestId: "failed-settlement-request",
    alreadyVerified: true,
  });
  assert.equal(failedClaim.status, "owner");
  if (failedClaim.status !== "owner") return;
  await markPaymentSettling(failedFingerprint, failedClaim.leaseToken);
  await markSettlementFailed({
    paymentFingerprint: failedFingerprint,
    leaseToken: failedClaim.leaseToken,
    errorCode: "definitive_rejection",
  });
  assert.equal(
    (await inspectPaymentCall(failedFingerprint, requestHash))?.status,
    "verification_required",
  );

  await pool.end();
  setPaymentPoolForTests(undefined);
});

test("an uncertain settlement cannot be verified or settled again", async () => {
  process.env.TRAKR_X402_RESULT_SECRET =
    "test-only-payment-result-secret-with-more-than-thirty-two-characters";
  const pool = createPaymentTestPool();
  setPaymentPoolForTests(pool);

  const fingerprint =
    "9191919191919191919191919191919191919191919191919191919191919191";
  const requestHash =
    "9292929292929292929292929292929292929292929292929292929292929292";
  const claim = await claimPaymentCall({
    paymentFingerprint: fingerprint,
    requestHash,
    idempotencyKey: null,
    requestId: "uncertain-settlement-request",
    alreadyVerified: true,
  });
  assert.equal(claim.status, "owner");
  if (claim.status !== "owner") return;

  await markPaymentSettling(fingerprint, claim.leaseToken);
  await markSettlementUncertain({
    paymentFingerprint: fingerprint,
    leaseToken: claim.leaseToken,
    transaction:
      "0x9393939393939393939393939393939393939393939393939393939393939393",
    errorCode: "settlement_timeout",
  });

  assert.equal(
    (await inspectPaymentCall(fingerprint, requestHash))?.status,
    "settlement_uncertain",
  );
  assert.equal(
    (
      await claimPaymentCall({
        paymentFingerprint: fingerprint,
        requestHash,
        idempotencyKey: null,
        requestId: "uncertain-settlement-retry",
        alreadyVerified: false,
      })
    ).status,
    "settlement_uncertain",
  );

  await pool.end();
  setPaymentPoolForTests(undefined);
});

test("paid route completes 402, settlement, business logic, and durable replay", async () => {
  process.env.TRAKR_X402_ENFORCEMENT = "enforce";
  process.env.TRAKR_X402_PAY_TO = payTo;
  process.env.TRAKR_X402_RESULT_SECRET =
    "route-test-payment-result-secret-with-more-than-thirty-two-characters";

  const pool = createPaymentTestPool();
  setPaymentPoolForTests(pool);
  const facilitator = new FakeFacilitator();
  setX402ServerForTests(await createX402Server(facilitator));
  const paidBusinessPayload = {
    message:
      "I am an early-career frontend developer in Lagos with React and TypeScript skills. Find remote Web3 hackathons and jobs open globally.",
    selectedDiscoveryCategories: ["jobs", "hackathons"],
  };

  const unpaidResponse = await POST(
    new Request(
      "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.10",
        },
        body: JSON.stringify(paidBusinessPayload),
      },
    ),
  );
  assert.equal(unpaidResponse.status, 402);
  assert.equal(
    unpaidResponse.headers.get("Access-Control-Expose-Headers")?.includes(
      "PAYMENT-REQUIRED",
    ),
    true,
  );
  const challenge = decodeHeader<{
    x402Version: number;
    resource: { url: string };
    accepts: PaymentRequirements[];
  }>(unpaidResponse.headers.get("PAYMENT-REQUIRED") ?? "");
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    resource: challenge.resource,
    accepted: challenge.accepts[0],
    payload: {
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to: payTo,
        value: X402_ATOMIC_AMOUNT,
        validAfter: "0",
        validBefore: "9999999999",
        nonce:
          "0x1212121212121212121212121212121212121212121212121212121212121212",
      },
      signature: "0x01",
    },
  };
  const paidHeaders = {
    "Content-Type": "application/json",
    "PAYMENT-SIGNATURE": encodeHeader(payload),
    "Idempotency-Key": "route-payment-test-key",
    "x-forwarded-for": "198.51.100.11",
  };
  const paidResponse = await POST(
    new Request(
      "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
      {
        method: "POST",
        headers: paidHeaders,
        body: JSON.stringify(paidBusinessPayload),
      },
    ),
  );
  const paidBody = await paidResponse.json();
  assert.equal(paidResponse.status, 200);
  assert.equal(paidBody.interactionState, "recommendations");
  assert.equal(paidBody.selectedService, "opportunity_finding");
  assert.equal(paidBody.stage, "discover_completed");
  assert.ok(paidResponse.headers.get("PAYMENT-RESPONSE"));
  assert.equal(facilitator.verifyCalls, 1);
  assert.equal(facilitator.settleCalls, 1);

  const replayResponse = await POST(
    new Request(
      "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
      {
        method: "POST",
        headers: {
          ...paidHeaders,
          "x-forwarded-for": "198.51.100.12",
        },
        body: JSON.stringify(paidBusinessPayload),
      },
    ),
  );
  const replayBody = await replayResponse.json();
  assert.equal(replayResponse.status, 200);
  assert.equal(
    replayResponse.headers.get("X-Idempotency-Status"),
    "replayed",
  );
  assert.equal(
    replayBody.continuation.token,
    paidBody.continuation.token,
  );
  assert.equal(facilitator.verifyCalls, 1);
  assert.equal(facilitator.settleCalls, 1);

  const invalidResponse = await POST(
    new Request(
      "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.13",
        },
        body: JSON.stringify({ message: "x".repeat(6001) }),
      },
    ),
  );
  assert.equal(invalidResponse.status, 400);
  assert.equal(facilitator.verifyCalls, 1);
  assert.equal(facilitator.settleCalls, 1);

  await pool.end();
  setPaymentPoolForTests(undefined);
  resetX402ServerForTests();
  process.env.TRAKR_X402_ENFORCEMENT = "off";
});

test("paid route requires fresh proof after failed settlement and replays success safely", async () => {
  process.env.TRAKR_X402_ENFORCEMENT = "enforce";
  process.env.TRAKR_X402_PAY_TO = payTo;
  process.env.TRAKR_X402_RESULT_SECRET =
    "route-settlement-retry-secret-with-more-than-thirty-two-characters";

  const pool = createPaymentTestPool();
  setPaymentPoolForTests(pool);
  const facilitator = new FailOnceFacilitator();
  setX402ServerForTests(await createX402Server(facilitator));

  const unpaidResponse = await POST(
    new Request(
      "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.20",
        },
        body: JSON.stringify({ operation: "start" }),
      },
    ),
  );
  assert.equal(unpaidResponse.status, 402);
  const challenge = decodeHeader<{
    x402Version: number;
    resource: { url: string };
    accepts: PaymentRequirements[];
  }>(unpaidResponse.headers.get("PAYMENT-REQUIRED") ?? "");
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    resource: challenge.resource,
    accepted: challenge.accepts[0],
    payload: {
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to: payTo,
        value: X402_ATOMIC_AMOUNT,
        validAfter: "0",
        validBefore: "9999999999",
        nonce:
          "0x2323232323232323232323232323232323232323232323232323232323232323",
      },
      signature: "0x01",
    },
  };
  const paidHeaders = {
    "Content-Type": "application/json",
    "PAYMENT-SIGNATURE": encodeHeader(payload),
    "x-forwarded-for": "198.51.100.21",
  };

  const failedResponse = await POST(
    new Request(
      "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
      {
        method: "POST",
        headers: paidHeaders,
        body: JSON.stringify({ operation: "start" }),
      },
    ),
  );
  const failedBody = await failedResponse.json();
  assert.equal(failedResponse.status, 402);
  assert.equal(failedBody.code, "facilitator_rejected");
  assert.equal(failedBody.interactionState, undefined);
  assert.equal(facilitator.verifyCalls, 1);
  assert.equal(facilitator.settleCalls, 1);

  const rejectedRetryResponse = await POST(
    new Request(
      "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
      {
        method: "POST",
        headers: {
          ...paidHeaders,
          "x-forwarded-for": "198.51.100.22",
        },
        body: JSON.stringify({ operation: "start" }),
      },
    ),
  );
  assert.equal(rejectedRetryResponse.status, 402);

  const freshPayload: PaymentPayload = {
    ...payload,
    payload: {
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to: payTo,
        value: X402_ATOMIC_AMOUNT,
        validAfter: "0",
        validBefore: "9999999999",
        nonce:
          "0x2424242424242424242424242424242424242424242424242424242424242424",
      },
      signature: "0x02",
    },
  };
  const freshHeaders = {
    ...paidHeaders,
    "PAYMENT-SIGNATURE": encodeHeader(freshPayload),
    "x-forwarded-for": "198.51.100.23",
  };
  const retryResponse = await POST(
    new Request(
      "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
      {
        method: "POST",
        headers: freshHeaders,
        body: JSON.stringify({ operation: "start" }),
      },
    ),
  );
  const retryBody = await retryResponse.json();
  assert.equal(retryResponse.status, 200);
  assert.equal(retryBody.interactionState, "service_selection_required");
  assert.deepEqual(
    retryBody.allowedResponses.map(
      (choice: { value: string }) => choice.value,
    ),
    ["discover", "benchmark", "generate_resume"],
  );
  assert.ok(retryResponse.headers.get("PAYMENT-RESPONSE"));
  const verifyCallsAfterSuccess = facilitator.verifyCalls;
  const settleCallsAfterSuccess = facilitator.settleCalls;

  const replayResponse = await POST(
    new Request(
      "https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend",
      {
        method: "POST",
        headers: {
          ...freshHeaders,
          "x-forwarded-for": "198.51.100.24",
        },
        body: JSON.stringify({ operation: "start" }),
      },
    ),
  );
  assert.equal(replayResponse.status, 200);
  assert.equal(
    replayResponse.headers.get("X-Idempotency-Status"),
    "replayed",
  );
  assert.equal(facilitator.verifyCalls, verifyCallsAfterSuccess);
  assert.equal(facilitator.settleCalls, settleCallsAfterSuccess);

  await pool.end();
  setPaymentPoolForTests(undefined);
  resetX402ServerForTests();
  process.env.TRAKR_X402_ENFORCEMENT = "off";
});
