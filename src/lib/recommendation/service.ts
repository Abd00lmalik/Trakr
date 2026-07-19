import { nanoid } from "nanoid";
import { getAiProvider } from "@/lib/ai/factory";
import { opportunitySource } from "@/lib/opportunities/sources";
import { rankOpportunities, buildProfileText } from "@/lib/recommendation/scoring";
import {
  buildActionPlan,
  buildLearningRoadmap,
  buildNextSteps,
  buildRecommendationNarrative,
} from "@/lib/recommendation/action-plan";
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
    agentNotes: [
      "Candidates are grounded in stored or structured source opportunities before AI enhancement.",
      "Scores combine category fit, skills, experience level, location, source quality, deadline urgency, and expected value.",
      "Responses are designed for direct consumption by other AI agents.",
    ],
  };
}

export async function generateRecommendations(
  request: RecommendationRequest,
): Promise<RecommendationResponse> {
  const startedAt = Date.now();
  const aiProvider = getAiProvider();
  const source = opportunitySource;
  const opportunities = await source.fetchOpportunities(request, request.filters);
  const ranked = rankOpportunities(opportunities, request).slice(0, getLimit(request));

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
  }));

  const draftResponse = buildDraftResponse(
    request,
    aiProvider.name,
    recommendations,
    opportunities.length,
  );

  let response = draftResponse;
  if (recommendations.length) {
    try {
      response = await aiProvider.enhanceRecommendations({
        request,
        profileText: buildProfileText(request),
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

  await logRecommendationRun(request, response, Date.now() - startedAt).catch(
    () => undefined,
  );
  return response;
}
