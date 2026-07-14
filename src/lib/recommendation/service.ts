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
  Recommendation,
  RecommendationRequest,
  RecommendationResponse,
} from "@/lib/types/opportunities";

const SERVICE_VERSION = "0.1.0";

function getLimit(request: RecommendationRequest) {
  return (
    request.filters.limit ??
    Number.parseInt(process.env.RECOMMENDATION_LIMIT ?? "7", 10)
  );
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

  await logRecommendationRun(request, response).catch(() => undefined);
  return response;
}
