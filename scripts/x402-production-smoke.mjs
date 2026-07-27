import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const baseUrl =
  process.env.SMOKE_BASE_URL ??
  "https://trakr-production-c70e.up.railway.app";
const servicePath =
  process.env.TRAKR_SMOKE_SERVICE_PATH ?? "/api/a2mcp/recommend";
const endpoint = new URL(servicePath, baseUrl).toString();
const trailingSlashEndpoint = endpoint.endsWith("/")
  ? endpoint
  : `${endpoint}/`;
const expectedVersion = (
  await readFile(new URL("../src/lib/version.ts", import.meta.url), "utf8")
).match(/TRAKR_SERVICE_VERSION\s*=\s*"([^"]+)"/)?.[1];

assert.ok(expectedVersion, "Could not read the expected Trakr service version.");

const requestTimeoutMs = 30_000;
const deploymentDeadline = Date.now() + 8 * 60_000;

async function fetchBounded(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function waitForDeployment() {
  let last;
  while (Date.now() < deploymentDeadline) {
    try {
      const response = await fetchBounded(`${baseUrl}/api/health`, {
        cache: "no-store",
      });
      const body = await readJson(response);
      last = { status: response.status, body };
      if (
        response.status === 200 &&
        body?.ok === true &&
        body?.version === expectedVersion
      ) {
        return body;
      }
    } catch (error) {
      last = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(
    `Railway did not publish Trakr ${expectedVersion}: ${JSON.stringify(last)}`,
  );
}

function decodePaymentHeader(value) {
  assert.ok(value, "PAYMENT-REQUIRED header is missing.");
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

const health = await waitForDeployment();
assert.equal(health.payment?.enforcement, "enabled");
assert.equal(health.payment?.x402Version, 2);
assert.equal(health.payment?.scheme, "exact");
assert.equal(health.payment?.network, "eip155:196");
assert.equal(health.payment?.amount, "5000");
assert.equal(health.database?.paymentPersistenceReady, true);

const [metadataResponse, openApiResponse] = await Promise.all([
  fetchBounded(`${baseUrl}/api/a2mcp`, { cache: "no-store" }),
  fetchBounded(`${baseUrl}/api/a2mcp/openapi`, { cache: "no-store" }),
]);
const metadata = await readJson(metadataResponse);
const openApi = await readJson(openApiResponse);
assert.equal(metadataResponse.status, 200);
assert.equal(openApiResponse.status, 200);
assert.equal(metadata.version, expectedVersion);
assert.equal(openApi.info?.version, expectedVersion);
assert.equal(metadata.marketplaceServices?.length, 3);

const invalidStartedAt = Date.now();
const invalidResponse = await fetchBounded(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: '{"message":',
});
const invalidDurationMs = Date.now() - invalidStartedAt;
const invalidBody = await readJson(invalidResponse);
assert.equal(invalidResponse.status, 400);
assert.equal(invalidBody?.code, "invalid_json");
assert.equal(invalidResponse.headers.has("payment-required"), false);
assert.ok(invalidDurationMs < 10_000);

const challengeStartedAt = Date.now();
const challengeResponse = await fetchBounded(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
const challengeDurationMs = Date.now() - challengeStartedAt;
const challengeBody = await readJson(challengeResponse);
const challenge = decodePaymentHeader(
  challengeResponse.headers.get("payment-required"),
);
const accepted = challenge.accepts?.[0];

assert.equal(challengeResponse.status, 402);
assert.ok(challengeDurationMs < 10_000);
assert.equal(challenge.x402Version, 2);
assert.equal(challenge.resource?.url, endpoint);
assert.equal(accepted?.scheme, "exact");
assert.equal(accepted?.network, "eip155:196");
assert.equal(accepted?.asset, health.payment.asset);
assert.equal(accepted?.amount, "5000");
assert.equal(accepted?.payTo, "0xbe116468bb544723141647608fe98c1bc0471291");
assert.equal(challengeBody?.code, "payment_required");
assert.equal(challengeBody?.outputSchema?.method, "POST");
assert.equal(
  challengeBody?.outputSchema?.input?.service?.carrier,
  "query",
);
assert.match(
  challengeResponse.headers.get("access-control-expose-headers") ?? "",
  /PAYMENT-REQUIRED/i,
);
assert.match(
  challengeResponse.headers.get("access-control-expose-headers") ?? "",
  /PAYMENT-RESPONSE/i,
);

const optionsResponse = await fetchBounded(endpoint, {
  method: "OPTIONS",
  headers: {
    Origin: "https://www.okx.com",
    "Access-Control-Request-Method": "HEAD",
  },
});
assert.equal(optionsResponse.status, 204);
assert.match(
  optionsResponse.headers.get("access-control-allow-methods") ?? "",
  /\bHEAD\b/i,
);

const trailingSlashResponse = await fetchBounded(trailingSlashEndpoint, {
  method: "GET",
  redirect: "manual",
});
const trailingSlashChallenge = decodePaymentHeader(
  trailingSlashResponse.headers.get("payment-required"),
);
assert.equal(trailingSlashResponse.status, 402);
assert.equal(trailingSlashResponse.headers.get("location"), null);
assert.equal(trailingSlashChallenge.x402Version, 2);
assert.equal(trailingSlashChallenge.accepts?.[0]?.amount, "5000");

console.log(
  JSON.stringify(
    {
      ok: true,
      version: expectedVersion,
      endpoint,
      invalidRequest: {
        status: invalidResponse.status,
        durationMs: invalidDurationMs,
      },
      paymentChallenge: {
        status: challengeResponse.status,
        durationMs: challengeDurationMs,
        x402Version: challenge.x402Version,
        resource: challenge.resource?.url,
        scheme: accepted?.scheme,
        network: accepted?.network,
        asset: accepted?.asset,
        amount: accepted?.amount,
        payTo: accepted?.payTo,
      },
      compatibility: {
        headCorsAllowed: true,
        trailingSlashStatus: trailingSlashResponse.status,
      },
    },
    null,
    2,
  ),
);
