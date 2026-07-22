import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { getPool } from "@/lib/db";
import type { DownloadableArtifact } from "@/lib/types/opportunities";

const DEFAULT_TTL_MINUTES = 30;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 120;

type StoredArtifact = {
  id: string;
  tokenHash: string;
  artifactType: DownloadableArtifact["type"];
  format: DownloadableArtifact["format"];
  filename: string;
  mimeType: string;
  content: Buffer;
  sizeBytes: number;
  sha256: string;
  regenerateAction: DownloadableArtifact["regenerateAction"];
  expiresAt: string;
};

const localArtifacts = new Map<string, StoredArtifact>();

function allowInMemoryStorage() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.TRAKR_ALLOW_IN_MEMORY_ARTIFACTS === "true"
  );
}

function artifactTtlMinutes() {
  const configured = Number.parseInt(
    process.env.TRAKR_ARTIFACT_TTL_MINUTES ?? "",
    10,
  );
  if (!Number.isFinite(configured)) return DEFAULT_TTL_MINUTES;
  return Math.min(Math.max(configured, MIN_TTL_MINUTES), MAX_TTL_MINUTES);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function safeFilename(value: string, format: "docx" | "pdf") {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  const withoutExtension = normalized.replace(/\.(docx|pdf)$/i, "");
  return `${withoutExtension || "trakr-resume"}.${format}`;
}

function baseUrl() {
  return (
    process.env.TRAKR_SERVICE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function storeArtifact(input: {
  artifactType: DownloadableArtifact["type"];
  format: DownloadableArtifact["format"];
  filename: string;
  mimeType: string;
  content: Buffer;
  regenerateAction: DownloadableArtifact["regenerateAction"];
  now?: Date;
}): Promise<DownloadableArtifact> {
  const now = input.now ?? new Date();
  const id = `artifact_${nanoid(24)}`;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    now.getTime() + artifactTtlMinutes() * 60 * 1_000,
  ).toISOString();
  const filename = safeFilename(input.filename, input.format);
  const sha256 = createHash("sha256")
    .update(input.content)
    .digest("base64url");
  const stored: StoredArtifact = {
    id,
    tokenHash: tokenHash(token),
    artifactType: input.artifactType,
    format: input.format,
    filename,
    mimeType: input.mimeType,
    content: input.content,
    sizeBytes: input.content.byteLength,
    sha256,
    regenerateAction: input.regenerateAction,
    expiresAt,
  };
  const db = getPool();
  if (db) {
    await db.query(
      `insert into resume_artifacts (
        id, token_hash, artifact_type, format, filename, mime_type,
        content, size_bytes, sha256, regenerate_action, expires_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        stored.id,
        stored.tokenHash,
        stored.artifactType,
        stored.format,
        stored.filename,
        stored.mimeType,
        stored.content,
        stored.sizeBytes,
        stored.sha256,
        stored.regenerateAction,
        stored.expiresAt,
      ],
    );
    void db
      .query("delete from resume_artifacts where expires_at <= now()")
      .catch(() => undefined);
  } else if (!allowInMemoryStorage()) {
    throw new Error("Artifact storage is temporarily unavailable.");
  } else {
    localArtifacts.set(stored.tokenHash, stored);
  }

  return {
    id,
    type: stored.artifactType,
    format: stored.format,
    filename,
    mimeType: stored.mimeType,
    downloadUrl: `${baseUrl()}/api/artifacts/${id}?token=${encodeURIComponent(token)}`,
    expiresAt,
    sizeBytes: stored.sizeBytes,
    sha256,
    regenerateAction: stored.regenerateAction,
  };
}

export async function retrieveArtifact(
  id: string,
  token: string,
  now = new Date(),
) {
  const hash = tokenHash(token);
  const db = getPool();
  let artifact: StoredArtifact | undefined;

  if (db) {
    const result = await db.query<{
      id: string;
      token_hash: string;
      artifact_type: DownloadableArtifact["type"];
      format: DownloadableArtifact["format"];
      filename: string;
      mime_type: string;
      content: Buffer;
      size_bytes: number;
      sha256: string;
      regenerate_action: DownloadableArtifact["regenerateAction"];
      expires_at: Date;
    }>(
      `select id, token_hash, artifact_type, format, filename, mime_type,
        content, size_bytes, sha256, regenerate_action, expires_at
       from resume_artifacts
       where id = $1 and token_hash = $2`,
      [id, hash],
    );
    const row = result.rows[0];
    if (row) {
      artifact = {
        id: row.id,
        tokenHash: row.token_hash,
        artifactType: row.artifact_type,
        format: row.format,
        filename: row.filename,
        mimeType: row.mime_type,
        content: row.content,
        sizeBytes: row.size_bytes,
        sha256: row.sha256,
        regenerateAction: row.regenerate_action,
        expiresAt: row.expires_at.toISOString(),
      };
    }
  } else {
    artifact = localArtifacts.get(hash);
    if (artifact?.id !== id) artifact = undefined;
  }

  if (!artifact) return { status: "not_found" as const };
  if (Date.parse(artifact.expiresAt) <= now.getTime()) {
    localArtifacts.delete(hash);
    return { status: "expired" as const };
  }
  return { status: "ok" as const, artifact };
}

export function clearLocalArtifactsForTests() {
  localArtifacts.clear();
}
