import { createHash } from "node:crypto";

type CachedResult = {
  body: unknown;
  status: number;
};

type IdempotencyEntry = {
  requestHash: string;
  expiresAt: number;
  result?: CachedResult;
  pending: Promise<CachedResult>;
  resolve: (result: CachedResult) => void;
  reject: (error: unknown) => void;
};

type BeginResult =
  | { status: "disabled" }
  | { status: "invalid" }
  | { status: "conflict" }
  | { status: "replay"; result: CachedResult }
  | { status: "pending"; pending: Promise<CachedResult> }
  | {
      status: "owner";
      complete: (result: CachedResult) => void;
      fail: (error: unknown) => void;
    };

const DEFAULT_TTL_MS = 10 * 60 * 1_000;
const entries = new Map<string, IdempotencyEntry>();

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function prune(now: number) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) {
      entries.delete(key);
    }
  }
}

export function beginIdempotentRequest(
  namespace: string,
  key: string | null,
  requestBody: string,
  now = Date.now(),
): BeginResult {
  if (!key) {
    return { status: "disabled" };
  }
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) {
    return { status: "invalid" };
  }

  prune(now);
  const cacheKey = `${namespace}:${key}`;
  const requestHash = hash(requestBody);
  const existing = entries.get(cacheKey);
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return { status: "conflict" };
    }
    if (existing.result) {
      return { status: "replay", result: existing.result };
    }
    return { status: "pending", pending: existing.pending };
  }

  let resolve!: (result: CachedResult) => void;
  let reject!: (error: unknown) => void;
  const pending = new Promise<CachedResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  const entry: IdempotencyEntry = {
    requestHash,
    expiresAt: now + DEFAULT_TTL_MS,
    pending,
    resolve,
    reject,
  };
  entries.set(cacheKey, entry);

  return {
    status: "owner",
    complete(result) {
      entry.result = result;
      entry.resolve(result);
    },
    fail(error) {
      entries.delete(cacheKey);
      entry.reject(error);
    },
  };
}
