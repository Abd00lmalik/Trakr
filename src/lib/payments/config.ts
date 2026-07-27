import { createHash } from "node:crypto";

export const X402_VERSION = 2;
export const X402_SCHEME = "exact";
export const X402_NETWORK = "eip155:196";
export const X402_ASSET = "0x779ded0c9e1022225f8e0630b35a9b54be713736";
export const X402_TOKEN_NAME = "USD₮0";
export const X402_TOKEN_SYMBOL = "USDT";
export const X402_TOKEN_VERSION = "1";
export const X402_TOKEN_DECIMALS = 6;
export const X402_TOKEN_TRANSFER_METHOD = "eip3009";
export const X402_PRICE_USD = "0.005";
export const X402_ATOMIC_AMOUNT = "5000";
export const X402_ROUTE = "POST /api/a2mcp/recommend";
export const X402_RESOURCE_PATH = "/api/a2mcp/recommend";
export const X402_DEFAULT_PUBLIC_ORIGIN =
  "https://trakr-production-c70e.up.railway.app";
export const X402_DEFAULT_FACILITATOR_BASE_URL = "https://web3.okx.com";

export function isX402Enforced() {
  return process.env.TRAKR_X402_ENFORCEMENT?.toLowerCase() === "enforce";
}

export function hashSensitiveValue(value: string) {
  const key =
    process.env.RECOMMENDATION_LOG_HASH_KEY ??
    process.env.TRAKR_X402_RESULT_SECRET ??
    "trakr-local-payment-hash";
  return createHash("sha256").update(`${key}:${value}`).digest("hex");
}

export function getX402PayTo() {
  const value = process.env.TRAKR_X402_PAY_TO?.trim();
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(
      "TRAKR_X402_PAY_TO must be a valid X Layer recipient address when payment enforcement is enabled.",
    );
  }
  return value.toLowerCase();
}

export function getX402ResourceUrl() {
  const configuredOrigin =
    process.env.TRAKR_SERVICE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    X402_DEFAULT_PUBLIC_ORIGIN;
  const origin = new URL(configuredOrigin);
  if (
    process.env.NODE_ENV === "production" &&
    origin.protocol !== "https:"
  ) {
    throw new Error(
      "TRAKR_SERVICE_URL must use HTTPS when x402 payment enforcement is enabled in production.",
    );
  }
  return new URL(X402_RESOURCE_PATH, origin).toString();
}

export function getX402OkxCredentials() {
  const apiKey = process.env.TRAKR_X402_OKX_API_KEY?.trim();
  const secretKey = process.env.TRAKR_X402_OKX_SECRET_KEY?.trim();
  const passphrase = process.env.TRAKR_X402_OKX_PASSPHRASE?.trim();
  if (!apiKey || !secretKey || !passphrase) {
    throw new Error(
      "Synchronous x402 settlement requires TRAKR_X402_OKX_API_KEY, TRAKR_X402_OKX_SECRET_KEY, and TRAKR_X402_OKX_PASSPHRASE.",
    );
  }
  return { apiKey, secretKey, passphrase };
}

export function getX402ResultSecret() {
  const secret = process.env.TRAKR_X402_RESULT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "TRAKR_X402_RESULT_SECRET must contain at least 32 characters when payment enforcement is enabled.",
    );
  }
  return secret;
}
