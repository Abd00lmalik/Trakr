import { createHmac } from "node:crypto";
import type {
  RecommendationRequest,
  RecommendationResponse,
} from "@/lib/types/opportunities";

const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;

type PrivacyLogOptions = {
  durationMs?: number;
  hashKey?: string;
  now?: Date;
  retentionDays?: number;
};

function count(values: string[] | undefined) {
  return values?.length ?? 0;
}

function resumeLengthBucket(resumeText: string | undefined) {
  const length = resumeText?.length ?? 0;
  if (!length) return "none";
  if (length < 1_000) return "under_1k";
  if (length < 5_000) return "1k_to_5k";
  if (length < 15_000) return "5k_to_15k";
  return "15k_plus";
}

function inputMode(request: RecommendationRequest) {
  if (request.user && request.resumeText) return "hybrid";
  if (request.resumeText) return "resume_text";
  return "structured_profile";
}

function hmac(value: unknown, hashKey: string | undefined) {
  if (!hashKey) {
    return null;
  }

  return createHmac("sha256", hashKey)
    .update(JSON.stringify(value))
    .digest("hex");
}

export function parseRecommendationLogRetentionDays(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_RETENTION_DAYS;
  }

  return Math.min(Math.max(parsed, MIN_RETENTION_DAYS), MAX_RETENTION_DAYS);
}

export function buildPrivacySafeRecommendationLog(
  request: RecommendationRequest,
  response: RecommendationResponse,
  options: PrivacyLogOptions = {},
) {
  const now = options.now ?? new Date();
  const retentionDays =
    options.retentionDays ??
    parseRecommendationLogRetentionDays(
      process.env.RECOMMENDATION_LOG_RETENTION_DAYS,
    );
  const expiresAt = new Date(
    now.getTime() + retentionDays * 24 * 60 * 60 * 1_000,
  );
  const profile = request.user;

  return {
    requestIdHash: hmac(response.requestId, options.hashKey),
    requestFingerprint: hmac(request, options.hashKey),
    provider: response.provider,
    aiStatus: response.aiStatus,
    inputSummary: {
      schemaVersion: 1,
      inputMode: inputMode(request),
      resumeProvided: Boolean(request.resumeText),
      resumeLengthBucket: resumeLengthBucket(request.resumeText),
      profile: {
        experienceLevel: profile?.experienceLevel ?? null,
        hasLocation: Boolean(profile?.location),
        skillsCount: count(profile?.skills),
        interestsCount: count(profile?.interests ?? request.interests),
        goalsCount: count(profile?.goals ?? request.goals),
        educationCount: count(profile?.education),
        workHistoryCount: count(profile?.workHistory),
        linksCount: count(profile?.links),
      },
      filters: {
        categories: request.filters.categories ?? [],
        hasLocationFilter: Boolean(request.filters.location),
        remote: request.filters.remote ?? null,
        hasDeadlineAfter: Boolean(request.filters.deadlineAfter),
        hasDeadlineBefore: Boolean(request.filters.deadlineBefore),
        limit: request.filters.limit ?? null,
      },
    },
    outputSummary: {
      schemaVersion: 1,
      recommendationCount: response.recommendations.length,
      totalCandidates: response.querySummary.totalCandidates,
      recommendations: response.recommendations.map((recommendation) => ({
        opportunityId: recommendation.opportunity.id,
        rank: recommendation.rank,
        matchScore: recommendation.matchScore,
        action: recommendation.recommendedAction,
        missingRequirementsCount: recommendation.missingRequirements.length,
      })),
    },
    durationMs:
      options.durationMs === undefined
        ? null
        : Math.max(0, Math.round(options.durationMs)),
    retentionDays,
    expiresAt,
    createdAt: now,
  };
}
