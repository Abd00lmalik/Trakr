import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { nanoid } from "nanoid";
import type { Pool } from "pg";
import { getPool } from "@/lib/db";
import {
  getX402ResultSecret,
  hashSensitiveValue,
} from "@/lib/payments/config";

type StoredResponse = {
  body: unknown;
  status: number;
};

type PaymentCallRow = {
  payment_fingerprint: string;
  request_hash: string;
  state:
    | "verified"
    | "settling"
    | "settlement_uncertain"
    | "settled"
    | "processing"
    | "retryable"
    | "completed"
    | "settlement_failed";
  lease_token: string | null;
  lease_expires_at: Date | null;
  settlement_header_ciphertext: string | null;
  response_ciphertext: string | null;
  response_status: number | null;
  last_error_code: string | null;
};

export type PaymentCallClaim =
  | {
      status: "owner";
      leaseToken: string;
      needsSettlement: boolean;
      settlementHeader?: string;
    }
  | {
      status: "replay";
      response: StoredResponse;
      settlementHeader: string;
    }
  | { status: "resumable" }
  | { status: "verification_required" }
  | { status: "conflict" }
  | { status: "pending" }
  | { status: "settlement_uncertain" }
  | { status: "unavailable" };

export type PaymentCallInspection = Exclude<
  PaymentCallClaim,
  { status: "owner" }
>;

const LEASE_MS = 120_000;
let paymentPoolForTests: Pick<Pool, "query"> | undefined;

function paymentPool() {
  return paymentPoolForTests ?? getPool();
}

export function setPaymentPoolForTests(
  pool: Pick<Pool, "query"> | undefined,
) {
  paymentPoolForTests = pool;
}

function encryptionKey() {
  return createHash("sha256").update(getX402ResultSecret()).digest();
}

function encryptJson(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function decryptJson<T>(value: string): T {
  const packed = Buffer.from(value, "base64url");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    ),
  ) as T;
}

async function readRow(paymentFingerprint: string) {
  const db = paymentPool();
  if (!db) return null;
  const result = await db.query<PaymentCallRow>(
    `select payment_fingerprint, request_hash, state, lease_token,
            lease_expires_at, settlement_header_ciphertext,
            response_ciphertext, response_status, last_error_code
       from x402_payment_calls
      where payment_fingerprint = $1
        and expires_at > now()`,
    [paymentFingerprint],
  );
  return result.rows[0] ?? null;
}

function replayFromRow(row: PaymentCallRow): PaymentCallInspection {
  if (
    row.state !== "completed" ||
    !row.response_ciphertext ||
    !row.settlement_header_ciphertext ||
    !row.response_status
  ) {
    return { status: "pending" };
  }
  return {
    status: "replay",
    response: {
      body: decryptJson(row.response_ciphertext),
      status: row.response_status,
    },
    settlementHeader: decryptJson<string>(
      row.settlement_header_ciphertext,
    ),
  };
}

export async function inspectPaymentCall(
  paymentFingerprint: string,
  requestHash: string,
): Promise<PaymentCallInspection | null> {
  const row = await readRow(paymentFingerprint);
  if (!row) return null;
  if (row.request_hash !== requestHash) return { status: "conflict" };
  if (row.state === "completed") return replayFromRow(row);
  if (
    row.state === "settling" ||
    row.state === "settlement_uncertain"
  ) {
    return { status: "settlement_uncertain" };
  }
  if (
    row.lease_expires_at &&
    row.lease_expires_at.getTime() > Date.now() &&
    (row.state === "processing" || row.state === "verified")
  ) {
    return { status: "pending" };
  }
  if (
    row.state === "settled" ||
    row.state === "retryable" ||
    row.state === "verified" ||
    row.state === "processing"
  ) {
    return { status: "resumable" };
  }
  if (row.state === "settlement_failed") {
    return { status: "verification_required" };
  }
  return null;
}

export async function claimPaymentCall(input: {
  paymentFingerprint: string;
  requestHash: string;
  idempotencyKey: string | null;
  requestId: string;
  alreadyVerified: boolean;
}): Promise<PaymentCallClaim> {
  const db = paymentPool();
  if (!db) return { status: "unavailable" };

  const leaseToken = nanoid();
  const leaseExpiresAt = new Date(Date.now() + LEASE_MS);
  if (input.alreadyVerified) {
    const inserted = await db.query<PaymentCallRow>(
      `insert into x402_payment_calls (
         payment_fingerprint, request_hash, idempotency_key_hash,
         request_id_hash, state, lease_token, lease_expires_at
       )
       values ($1, $2, $3, $4, 'verified', $5, $6)
       on conflict (payment_fingerprint) do nothing
       returning payment_fingerprint, request_hash, state, lease_token,
                 lease_expires_at, settlement_header_ciphertext,
                 response_ciphertext, response_status, last_error_code`,
      [
        input.paymentFingerprint,
        input.requestHash,
        input.idempotencyKey
          ? hashSensitiveValue(input.idempotencyKey)
          : null,
        hashSensitiveValue(input.requestId),
        leaseToken,
        leaseExpiresAt,
      ],
    );
    if (inserted.rows[0]) {
      return {
        status: "owner",
        leaseToken,
        needsSettlement: true,
      };
    }
  }

  const row = await readRow(input.paymentFingerprint);
  if (!row) return { status: "unavailable" };
  if (row.request_hash !== input.requestHash) return { status: "conflict" };
  if (row.state === "completed") return replayFromRow(row);
  if (
    row.state === "settling" ||
    row.state === "settlement_uncertain"
  ) {
    return { status: "settlement_uncertain" };
  }

  const canResume =
    row.state === "settled" ||
    row.state === "retryable" ||
    (input.alreadyVerified && row.state === "settlement_failed") ||
    ((row.state === "verified" || row.state === "processing") &&
      (!row.lease_expires_at ||
        row.lease_expires_at.getTime() <= Date.now()));
  if (!canResume) return { status: "pending" };

  const claimed = await db.query<PaymentCallRow>(
    `update x402_payment_calls
        set state = case
              when state in ('settled', 'retryable') then 'processing'
              when state = 'settlement_failed' then 'verified'
              else state
            end,
            lease_token = $2,
            lease_expires_at = $3,
            updated_at = now()
      where payment_fingerprint = $1
        and request_hash = $4
        and (
          state in ('settled', 'retryable')
          or ($5 = true and state = 'settlement_failed')
          or (
            state in ('verified', 'processing')
            and (lease_expires_at is null or lease_expires_at <= now())
          )
        )
      returning payment_fingerprint, request_hash, state, lease_token,
                lease_expires_at, settlement_header_ciphertext,
                response_ciphertext, response_status, last_error_code`,
    [
      input.paymentFingerprint,
      leaseToken,
      leaseExpiresAt,
      input.requestHash,
      input.alreadyVerified,
    ],
  );
  const acquired = claimed.rows[0];
  if (!acquired) return { status: "pending" };

  const settlementHeader = acquired.settlement_header_ciphertext
    ? decryptJson<string>(acquired.settlement_header_ciphertext)
    : undefined;
  return {
    status: "owner",
    leaseToken,
    needsSettlement:
      acquired.state === "verified" && input.alreadyVerified,
    settlementHeader,
  };
}

export async function markPaymentSettling(
  paymentFingerprint: string,
  leaseToken: string,
) {
  const db = paymentPool();
  if (!db) throw new Error("Payment persistence is unavailable.");
  const result = await db.query(
    `update x402_payment_calls
        set state = 'settling', updated_at = now()
      where payment_fingerprint = $1
        and lease_token = $2
        and state = 'verified'`,
    [paymentFingerprint, leaseToken],
  );
  if (result.rowCount !== 1) {
    throw new Error("Payment settlement ownership was lost.");
  }
}

export async function markPaymentSettled(input: {
  paymentFingerprint: string;
  leaseToken: string;
  settlementHeader: string;
  transaction: string;
  status?: string;
  amount?: string;
  network: string;
  payer?: string;
}) {
  const db = paymentPool();
  if (!db) throw new Error("Payment persistence is unavailable.");
  const result = await db.query(
    `update x402_payment_calls
        set state = 'processing',
            settlement_transaction = $3,
            settlement_status = $4,
            settlement_amount = $5,
            settlement_network = $6,
            settlement_payer_hash = $7,
            settlement_header_ciphertext = $8,
            lease_expires_at = $9,
            updated_at = now()
      where payment_fingerprint = $1
        and lease_token = $2
        and state = 'settling'`,
    [
      input.paymentFingerprint,
      input.leaseToken,
      input.transaction,
      input.status ?? "success",
      input.amount ?? null,
      input.network,
      input.payer ? hashSensitiveValue(input.payer.toLowerCase()) : null,
      encryptJson(input.settlementHeader),
      new Date(Date.now() + LEASE_MS),
    ],
  );
  if (result.rowCount !== 1) {
    throw new Error("Settled payment could not be persisted.");
  }
}

export async function markSettlementFailed(input: {
  paymentFingerprint: string;
  leaseToken: string;
  errorCode: string;
}) {
  const db = paymentPool();
  if (!db) return;
  await db.query(
    `update x402_payment_calls
        set state = 'settlement_failed',
            last_error_code = $3,
            lease_token = null,
            lease_expires_at = null,
            updated_at = now()
      where payment_fingerprint = $1
        and lease_token = $2`,
    [input.paymentFingerprint, input.leaseToken, input.errorCode.slice(0, 160)],
  );
}

export async function markSettlementUncertain(input: {
  paymentFingerprint: string;
  leaseToken: string;
  transaction?: string;
  errorCode: string;
}) {
  const db = paymentPool();
  if (!db) return;
  await db.query(
    `update x402_payment_calls
        set state = 'settlement_uncertain',
            settlement_transaction = coalesce($3, settlement_transaction),
            last_error_code = $4,
            lease_token = null,
            lease_expires_at = null,
            updated_at = now()
      where payment_fingerprint = $1
        and lease_token = $2
        and state = 'settling'`,
    [
      input.paymentFingerprint,
      input.leaseToken,
      input.transaction || null,
      input.errorCode.slice(0, 160),
    ],
  );
}

export async function completePaymentCall(input: {
  paymentFingerprint: string;
  leaseToken: string;
  response: StoredResponse;
}) {
  const db = paymentPool();
  if (!db) throw new Error("Payment persistence is unavailable.");
  const result = await db.query(
    `update x402_payment_calls
        set state = 'completed',
            response_ciphertext = $3,
            response_status = $4,
            lease_token = null,
            lease_expires_at = null,
            last_error_code = null,
            updated_at = now()
      where payment_fingerprint = $1
        and lease_token = $2
        and state = 'processing'`,
    [
      input.paymentFingerprint,
      input.leaseToken,
      encryptJson(input.response.body),
      input.response.status,
    ],
  );
  if (result.rowCount !== 1) {
    throw new Error("Paid response could not be persisted.");
  }
}

export async function markPaymentCallRetryable(input: {
  paymentFingerprint: string;
  leaseToken: string;
  errorCode: string;
}) {
  const db = paymentPool();
  if (!db) return;
  await db.query(
    `update x402_payment_calls
        set state = 'retryable',
            last_error_code = $3,
            lease_token = null,
            lease_expires_at = null,
            updated_at = now()
      where payment_fingerprint = $1
        and lease_token = $2
        and state = 'processing'`,
    [input.paymentFingerprint, input.leaseToken, input.errorCode.slice(0, 160)],
  );
}
