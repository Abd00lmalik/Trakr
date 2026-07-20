import { nanoid } from "nanoid";
import { getAiProvider } from "@/lib/ai/factory";
import { opportunitySource } from "@/lib/opportunities/sources";
import { extractProfileFromText } from "@/lib/resume/parser";
import { diversifyRankedOpportunities } from "@/lib/recommendation/diversification";
import { rankOpportunities, buildProfileText } from "@/lib/recommendation/scoring";
import {
  buildActionPlan,
  buildLearningRoadmap,
  buildNextSteps,
  buildRecommendationNarrative,
} from "@/lib/recommendation/action-plan";
import { enforceApplyNowEligibility } from "@/lib/opportunities/verification";
import { logRecommendationRun } from "@/lib/repositories/recommendation-log";
import type {
  CompanionGuidanceAction,
  Opportunity,
  Recommendation,
  RecommendationRequest,
  RecommendationResponse,
  ScoredOpportunity,
} from "@/lib/types/opportunities";

const SERVICE_VERSION = "0.1.0";

function getLimit(request: RecommendationRequest) {
  return (
    request.filters.limit ??
    Number.parseInt(process.env.RECOMMENDATION_LIMIT ?? "10", 10)
  );
}

function profileCompleteness(request: RecommendationRequest) {
  const user = request.user;
  const checks = [
    Boolean(user?.headline || user?.bio || request.resumeText),
    Boolean(user?.skills.length),
    Boolean(user?.goals.length || request.goals?.length),
    Boolean(user?.interests.length || request.interests?.length),
    Boolean(user?.experienceLevel),
    Boolean(user?.location || request.filters.remote === true),
  ];
  return checks.filter(Boolean).length / checks.length;
}

function guidanceAction(
  opportunity: Opportunity,
  action: Recommendation["recommendedAction"],
): CompanionGuidanceAction {
  if (action === "Apply Now") return "apply_now";
  if (action === "Skip") return "not_currently_recommended";
  if (opportunity.verificationStatus === "program_directory") return "explore";
  return "prepare_first";
}

function eligibilityConcerns(candidate: ScoredOpportunity) {
  const concerns: string[] = [];
  if (candidate.opportunity.verificationStatus !== "verified") {
    concerns.push("The source is not a verified active application page.");
  }
  if (!candidate.opportunity.isActive) {
    concerns.push("The opportunity is not currently active.");
  }
  if (candidate.opportunity.eligibility.length) {
    concerns.push(
      ...candidate.opportunity.eligibility
        .slice(0, 3)
        .map((rule) => `Confirm eligibility: ${rule}`),
    );
  }
  return concerns;
}

function recommendationProvenance(opportunity: Opportunity) {
  const verifiedAt = opportunity.lastVerifiedAt
    ? Date.parse(opportunity.lastVerifiedAt)
    : Number.NaN;
  const ageDays = Number.isNaN(verifiedAt)
    ? null
    : Math.max(0, (Date.now() - verifiedAt) / (24 * 60 * 60 * 1_000));
  const freshness =
    ageDays === null
      ? ("unknown" as const)
      : ageDays <= 7
        ? ("fresh" as const)
        : ("aging" as const);
  const deadlineConfidence = opportunity.deadline
    ? opportunity.verificationStatus === "verified"
      ? ("high" as const)
      : ("medium" as const)
    : ("rolling_or_unknown" as const);
  const eligibilityConfidence = opportunity.eligibility.length
    ? ("needs_confirmation" as const)
    : ("unknown" as const);

  return {
    canonicalUrl: opportunity.canonicalUrl,
    sourceName: opportunity.sourceName,
    publisherDomain: opportunity.publisherDomain,
    verificationStatus: opportunity.verificationStatus,
    sourceStatus: opportunity.sourceStatus,
    lastVerifiedAt: opportunity.lastVerifiedAt,
    freshness,
    deadlineConfidence,
    eligibilityConfidence,
  };
}

function extractProfileSignals(request: RecommendationRequest) {
  return [
    ...(request.user?.skills ?? []).map((skill) => `skill:${skill}`),
    ...(request.user?.interests ?? request.interests ?? []).map((interest) => `interest:${interest}`),
    ...(request.user?.goals ?? request.goals ?? []).map((goal) => `goal:${goal}`),
    request.resumeText ? "resumeText:provided" : "",
    request.user?.location ? `location:${request.user.location}` : "",
  ].filter(Boolean);
}

function buildDraftResponse(
  request: RecommendationRequest,
  providerName: string,
  recommendations: Recommendation[],
  totalCandidates: number,
  coverage: RecommendationResponse["coverage"],
): RecommendationResponse {
  return {
    service: "trakr",
    version: SERVICE_VERSION,
    requestId: request.requestId ?? nanoid(),
    generatedAt: new Date().toISOString(),
    provider: providerName,
    aiStatus: providerName === "deterministic-local" ? "fallback" : "degraded",
    querySummary: {
      profileSignals: extractProfileSignals(request),
      filtersApplied: request.filters,
      totalCandidates,
    },
    recommendations,
    actionPlan: buildActionPlan(recommendations),
    learningRoadmap: buildLearningRoadmap(recommendations),
    coverage,
    agentNotes: [
      "Candidates are grounded in stored or structured source opportunities before AI enhancement.",
      "Scores combine category fit, skills, experience level, location, source quality, deadline urgency, and expected value.",
      "Responses are designed for direct consumption by other AI agents.",
    ],
  };
}

function buildGroundedAgentNotes(
  response: RecommendationResponse,
  draft: RecommendationResponse,
) {
  const notes = [...draft.agentNotes];

  if (
    response.provider.startsWith("gemini:") &&
    response.aiStatus === "enhanced"
  ) {
    notes.push(
      "Gemini completed remotely; deterministic evidence guardrails control final ranking, reasoning, gaps, actions, and next steps.",
    );
  } else if (
    response.provider.startsWith("gemini:") &&
    response.aiStatus === "fallback"
  ) {
    notes.push(
      "AI enhancement was unavailable after retry; returned grounded deterministic recommendations.",
    );
  }

  return [...new Set(notes)].slice(0, 8);
}

export function enforceRecommendationConsistency(
  response: RecommendationResponse,
  draft: RecommendationResponse,
) {
  const draftRankById = new Map(
    draft.recommendations.map((recommendation) => [
      recommendation.opportunity.id,
      recommendation.rank,
    ]),
  );

  const recommendations = draft.recommendations
    .map((deterministic) => {
      const matchScore = deterministic.matchScore;
      let recommendedAction = deterministic.recommendedAction;

      recommendedAction = enforceApplyNowEligibility(
        deterministic.opportunity,
        recommendedAction,
      );
      const consistentGuidanceAction = guidanceAction(
        deterministic.opportunity,
        recommendedAction,
      );

      return {
        ...deterministic,
        opportunity: deterministic.opportunity,
        matchScore,
        recommendedAction,
        guidanceAction: consistentGuidanceAction,
      };
    })
    .filter((recommendation) => recommendation.matchScore >= 35)
    .sort(
      (left, right) =>
        (draftRankById.get(left.opportunity.id) ?? Number.MAX_SAFE_INTEGER) -
        (draftRankById.get(right.opportunity.id) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((recommendation, index) => ({
      ...recommendation,
      rank: index + 1,
    }));

  return {
    ...response,
    service: draft.service,
    version: draft.version,
    requestId: draft.requestId,
    generatedAt: draft.generatedAt,
    querySummary: draft.querySummary,
    recommendations,
    actionPlan: buildActionPlan(recommendations),
    learningRoadmap: buildLearningRoadmap(recommendations),
    coverage: draft.coverage,
    agentNotes: buildGroundedAgentNotes(response, draft),
  };
}

export async function generateRecommendations(
  request: RecommendationRequest,
): Promise<RecommendationResponse> {
  const startedAt = Date.now();
  const groundedRequest =
    request.user || !request.resumeText
      ? request
      : {
          ...request,
          user: extractProfileFromText(request.resumeText).profile,
        };
  const aiProvider = getAiProvider();
  const source = opportunitySource;
  const opportunities = await source.fetchOpportunities(
    groundedRequest,
    groundedRequest.filters,
  );
  const baseRanked = rankOpportunities(opportunities, groundedRequest);
  const diversified = diversifyRankedOpportunities(
    baseRanked,
    groundedRequest,
    getLimit(groundedRequest),
  );
  const ranked = diversified.ranked;

  const recommendations: Recommendation[] = ranked.map((candidate, index) => ({
    rank: index + 1,
    opportunity: candidate.opportunity,
    matchScore: candidate.score,
    reasoning: buildRecommendationNarrative(candidate),
    missingRequirements: candidate.missingRequirements,
    recommendedAction: candidate.action,
    nextSteps: buildNextSteps(candidate),
    confidenceScore: Math.round(
      Math.min(
        100,
        candidate.score * 0.55 +
          candidate.qualityScore * 0.25 +
          candidate.opportunity.verificationConfidence * 100 * 0.1 +
          profileCompleteness(request) * 100 * 0.1,
      ),
    ),
    guidanceAction: guidanceAction(candidate.opportunity, candidate.action),
    eligibilityConcerns: eligibilityConcerns(candidate),
    provenance: recommendationProvenance(candidate.opportunity),
  }));

  const draftResponse = buildDraftResponse(
    groundedRequest,
    aiProvider.name,
    recommendations,
    opportunities.length,
    diversified.coverage,
  );

  let response = draftResponse;
  if (recommendations.length) {
    try {
      response = await aiProvider.enhanceRecommendations({
        request: groundedRequest,
        profileText: buildProfileText(groundedRequest),
        scoredOpportunities: ranked,
        draftResponse,
      });
    } catch (error) {
      response = {
        ...draftResponse,
        provider: aiProvider.name,
        aiStatus: "fallback",
        agentNotes: [
          ...draftResponse.agentNotes,
          "AI enhancement was unavailable after retry; returned grounded deterministic recommendations.",
        ],
      };
    }
  }
  response = enforceRecommendationConsistency(response, draftResponse);

  await logRecommendationRun(
    groundedRequest,
    response,
    Date.now() - startedAt,
  ).catch(
    () => undefined,
  );
  return response;
}
