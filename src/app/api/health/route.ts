import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";
import { getAiMetricsSnapshot } from "@/lib/ai/metrics";
import { TRAKR_SERVICE_VERSION } from "@/lib/version";
import {
  isX402Enforced,
  X402_ASSET,
  X402_ATOMIC_AMOUNT,
  X402_NETWORK,
  X402_PRICE_USD,
  X402_SCHEME,
  X402_TOKEN_NAME,
  X402_TOKEN_SYMBOL,
  X402_VERSION,
} from "@/lib/payments/config";

export const runtime = "nodejs";

export async function GET() {
  const database = await checkDatabase();
  const aiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const databaseReady =
    !database.configured ||
    (database.connected &&
      database.pgvector &&
      database.schemaReady &&
      database.privacyLoggingReady &&
      database.sourceVerificationReady &&
      database.inventoryMetadataReady &&
      database.artifactStorageReady);
  const status = databaseReady ? "ok" : "degraded";
  const paymentEnforced = isX402Enforced();
  const paymentConfigured =
    !paymentEnforced ||
    Boolean(
      database.connected &&
        database.paymentPersistenceReady &&
        process.env.TRAKR_X402_PAY_TO &&
        process.env.TRAKR_X402_RESULT_SECRET &&
        process.env.TRAKR_X402_OKX_API_KEY &&
        process.env.TRAKR_X402_OKX_SECRET_KEY &&
        process.env.TRAKR_X402_OKX_PASSPHRASE,
    );
  const effectiveStatus =
    status === "ok" && paymentConfigured ? "ok" : "degraded";

  return NextResponse.json({
    service: "trakr",
    displayTitle: "Trakr Opportunity & Resume Services",
    version: TRAKR_SERVICE_VERSION,
    status: effectiveStatus,
    ok: effectiveStatus === "ok",
    timestamp: new Date().toISOString(),
    ai: {
      provider: aiConfigured ? "gemini" : "deterministic-local",
      configured: aiConfigured,
      metrics: getAiMetricsSnapshot(),
    },
    database,
    payment: {
      enforcement: paymentEnforced ? "enabled" : "disabled",
      configured: paymentConfigured,
      x402Version: X402_VERSION,
      scheme: X402_SCHEME,
      network: X402_NETWORK,
      asset: X402_ASSET,
      token: X402_TOKEN_SYMBOL,
      tokenName: X402_TOKEN_NAME,
      price: X402_PRICE_USD,
      amount: X402_ATOMIC_AMOUNT,
      settlement: "synchronous",
      replayProtection: "postgresql",
    },
    endpoints: {
      metadata: "/api/a2mcp",
      recommend: "/api/a2mcp/recommend",
    },
  });
}
