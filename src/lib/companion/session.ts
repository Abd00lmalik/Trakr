import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  companionContextSchema,
  companionSessionReferenceSchema,
  type CompanionContext,
  type CompanionContinuationInput,
  type CompanionSessionReference,
  type CompanionTarget,
  type DocumentReference,
  type ProfileEvidence,
  type StructuredUserProfile,
} from "@/lib/types/opportunities";

const SESSION_VERSION = "2";
const SESSION_AAD = Buffer.from("trakr-session-v2", "utf8");
const DEFAULT_TTL_MINUTES = 30;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 120;
const fallbackDevelopmentSecret = randomBytes(32).toString("hex");

type SessionEnvelope = {
  version: typeof SESSION_VERSION;
  issuedAt: string;
  expiresAt: string;
  context: CompanionContext;
};

export class CompanionSessionError extends Error {
  code: "invalid_session" | "expired_session" | "session_unavailable";

  constructor(
    code: CompanionSessionError["code"],
    message: string,
  ) {
    super(message);
    this.name = "CompanionSessionError";
    this.code = code;
  }
}

function sessionTtlMinutes() {
  const configured = Number.parseInt(
    process.env.TRAKR_SESSION_TTL_MINUTES ?? "",
    10,
  );
  if (!Number.isFinite(configured)) {
    return DEFAULT_TTL_MINUTES;
  }
  return Math.min(
    Math.max(configured, MIN_TTL_MINUTES),
    MAX_TTL_MINUTES,
  );
}

function sessionSecret() {
  const configured =
    process.env.TRAKR_SESSION_SECRET ??
    process.env.RECOMMENDATION_LOG_HASH_KEY;
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new CompanionSessionError(
      "session_unavailable",
      "Session continuation is temporarily unavailable.",
    );
  }
  return fallbackDevelopmentSecret;
}

function sessionKey() {
  return createHash("sha256").update(sessionSecret()).digest();
}

function compactText(value: string | undefined, maxLength: number) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function compactList(
  values: string[],
  options: {
    maxItems: number;
    maxItemLength: number;
    maxTotalLength: number;
  },
) {
  const compacted: string[] = [];
  let remaining = options.maxTotalLength;

  for (const value of values) {
    if (compacted.length >= options.maxItems || remaining < 8) break;
    const item = compactText(
      value,
      Math.min(options.maxItemLength, remaining),
    );
    if (!item) continue;
    compacted.push(item);
    remaining -= item.length;
  }

  return compacted;
}

export function compactProfileForSession(
  profile: StructuredUserProfile | undefined,
): StructuredUserProfile | undefined {
  if (!profile) return undefined;

  return {
    name: compactText(profile.name, 160),
    headline: compactText(profile.headline, 240),
    bio: compactText(profile.bio, 480),
    location: compactText(profile.location, 160),
    timezone: compactText(profile.timezone, 80),
    experienceLevel: profile.experienceLevel,
    skills: compactList(profile.skills, {
      maxItems: 40,
      maxItemLength: 100,
      maxTotalLength: 1600,
    }),
    interests: compactList(profile.interests, {
      maxItems: 20,
      maxItemLength: 100,
      maxTotalLength: 800,
    }),
    goals: compactList(profile.goals, {
      maxItems: 16,
      maxItemLength: 180,
      maxTotalLength: 1200,
    }),
    education: compactList(profile.education, {
      maxItems: 8,
      maxItemLength: 360,
      maxTotalLength: 1200,
    }),
    workHistory: compactList(profile.workHistory, {
      maxItems: 10,
      maxItemLength: 480,
      maxTotalLength: 2400,
    }),
    projects: compactList(profile.projects, {
      maxItems: 10,
      maxItemLength: 480,
      maxTotalLength: 2400,
    }),
    certifications: compactList(profile.certifications, {
      maxItems: 12,
      maxItemLength: 240,
      maxTotalLength: 800,
    }),
    links: compactList(profile.links, {
      maxItems: 8,
      maxItemLength: 500,
      maxTotalLength: 1600,
    }).filter((value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }),
  };
}

function compactEvidenceValue(value: ProfileEvidence["value"]) {
  if (typeof value === "string") return compactText(value, 480);
  if (Array.isArray(value)) {
    return compactList(value, {
      maxItems: 20,
      maxItemLength: 240,
      maxTotalLength: 1800,
    });
  }
  return undefined;
}

function compactEvidence(evidence: ProfileEvidence[]) {
  const seen = new Set<string>();
  const compacted: ProfileEvidence[] = [];

  for (const item of [...evidence].reverse()) {
    const key =
      item.claimId ??
      `${item.field}\0${item.source}\0${item.origin ?? "unknown"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    compacted.push({
      claimId: item.claimId,
      field: compactText(item.field, 120) ?? "unknown",
      value: compactEvidenceValue(item.value),
      source: item.source,
      evidence: compactText(item.evidence, 240),
      origin: item.origin,
      confidence: item.confidence,
      confirmed: item.confirmed,
      allowedUse: item.allowedUse,
    });
    if (compacted.length >= 24) break;
  }

  return compacted.reverse();
}

export function compactTargetForSession(
  target: CompanionTarget | undefined,
): CompanionTarget | undefined {
  if (!target) return undefined;
  return {
    opportunityId: compactText(target.opportunityId, 240),
    opportunityTitle: compactText(target.opportunityTitle, 300),
    role: compactText(target.role, 200),
    industry: compactText(target.industry, 200),
    organization: compactText(target.organization, 240),
    opportunityType: target.opportunityType,
    description: compactText(target.description, 2400),
    requirements: target.requirements
      ? compactList(target.requirements, {
          maxItems: 24,
          maxItemLength: 320,
          maxTotalLength: 4200,
        })
      : undefined,
    url: compactText(target.url, 1000),
    locale: compactText(target.locale, 80),
  };
}

function toBase64Url(value: Buffer) {
  return value.toString("base64url");
}

function fromBase64Url(value: string) {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error("Non-canonical base64url value.");
  }
  return decoded;
}

function normalizedContext(context: CompanionContext): CompanionContext {
  return companionContextSchema.parse({
    ...context,
    profile: compactProfileForSession(context.profile),
    profileEvidence: compactEvidence(context.profileEvidence ?? []),
    target: compactTargetForSession(context.target),
    unansweredQuestions: compactList(context.unansweredQuestions ?? [], {
      maxItems: 12,
      maxItemLength: 500,
      maxTotalLength: 1500,
    }),
    documentReferences: (context.documentReferences ?? []).slice(-8),
    sessionVersion: SESSION_VERSION,
  });
}

export function createSessionReference(
  context: CompanionContext,
  now = new Date(),
): CompanionSessionReference {
  const expiresAt = new Date(
    now.getTime() + sessionTtlMinutes() * 60 * 1_000,
  );
  const envelope: SessionEnvelope = {
    version: SESSION_VERSION,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    context: normalizedContext(context),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  cipher.setAAD(SESSION_AAD);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(envelope), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return companionSessionReferenceSchema.parse({
    token: [
      SESSION_VERSION,
      toBase64Url(iv),
      toBase64Url(encrypted),
      toBase64Url(tag),
    ].join("."),
    expiresAt: envelope.expiresAt,
    sessionVersion: SESSION_VERSION,
  });
}

function openSessionToken(token: string, now = new Date()) {
  const [version, ivValue, encryptedValue, tagValue] = token.split(".");
  if (
    version !== SESSION_VERSION ||
    !ivValue ||
    !encryptedValue ||
    !tagValue
  ) {
    throw new CompanionSessionError(
      "invalid_session",
      "The continuation reference is invalid.",
    );
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      sessionKey(),
      fromBase64Url(ivValue),
    );
    decipher.setAAD(SESSION_AAD);
    decipher.setAuthTag(fromBase64Url(tagValue));
    const decrypted = Buffer.concat([
      decipher.update(fromBase64Url(encryptedValue)),
      decipher.final(),
    ]);
    const envelope = JSON.parse(decrypted.toString("utf8")) as SessionEnvelope;

    if (
      envelope.version !== SESSION_VERSION ||
      !envelope.expiresAt ||
      !envelope.context
    ) {
      throw new Error("Invalid envelope.");
    }
    if (Date.parse(envelope.expiresAt) <= now.getTime()) {
      throw new CompanionSessionError(
        "expired_session",
        "This Trakr session has expired. Start a fresh session with current information.",
      );
    }
    return normalizedContext(envelope.context);
  } catch (error) {
    if (error instanceof CompanionSessionError) {
      throw error;
    }
    throw new CompanionSessionError(
      "invalid_session",
      "The continuation reference could not be verified.",
    );
  }
}

export function resolveSessionContext(
  input: CompanionContinuationInput | undefined,
  now = new Date(),
) {
  if (!input) {
    return undefined;
  }
  if (typeof input === "string") {
    return openSessionToken(input, now);
  }
  if ("token" in input) {
    return openSessionToken(input.token, now);
  }
  return normalizedContext(input);
}

export function buildDocumentReference(
  text: string,
  kind: DocumentReference["kind"] = "resume",
  contentType?: string,
  now = new Date(),
): DocumentReference {
  const digest = createHash("sha256")
    .update(kind)
    .update("\0")
    .update(text)
    .digest("base64url")
    .slice(0, 32);

  return {
    id: `doc_${digest}`,
    kind,
    contentType,
    receivedAt: now.toISOString(),
    retention: "session_only",
  };
}
