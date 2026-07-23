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
import { enrichOpportunityMetadata } from "@/lib/opportunities/metadata";
import { logRecommendationRun } from "@/lib/repositories/recommendation-log";
import type {
  CompanionGuidanceAction,
  Opportunity,
  Recommendation,
  OpportunityCategory,
  RecommendationRequest,
  RecommendationResponse,
  ScoredOpportunity,
} from "@/lib/types/opportunities";
import { TRAKR_SERVICE_VERSION } from "@/lib/version";

const SERVICE_VERSION = TRAKR_SERVICE_VERSION;
const supportingCategories = new Set<OpportunityCategory>([
  "learning_resource",
  "student_benefit",
  "developer_program",
]);

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
  if (candidate.opportunity.recommendationState === "explore") {
    concerns.push(
      "This record is useful for exploration, but current-cycle application or material eligibility evidence still requires confirmation.",
    );
  }
  if (candidate.opportunity.geography?.unknownConditions.length) {
    concerns.push(...candidate.opportunity.geography.unknownConditions.slice(0, 2));
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
  const deadlineConfidence = opportunity.deadlineInfo
    ? opportunity.deadlineInfo.confidence === "high" &&
      opportunity.deadlineInfo.currentCycle === "confirmed"
      ? ("high" as const)
      : opportunity.deadlineInfo.state === "rolling"
        ? ("rolling_or_unknown" as const)
        : ("medium" as const)
    : opportunity.deadline
      ? opportunity.verificationStatus === "verified"
        ? ("high" as const)
        : ("medium" as const)
      : ("rolling_or_unknown" as const);
  const eligibilityConfidence = opportunity.geography
    ? opportunity.geography.confidence === "high"
      ? ("high" as const)
      : opportunity.geography.confidence === "unknown" ||
          opportunity.geography.confidence === "low"
        ? ("unknown" as const)
        : ("needs_confirmation" as const)
    : opportunity.eligibility.length
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

function eligibilitySummary(opportunity: Opportunity) {
  if (opportunity.eligibility.length) {
    return opportunity.eligibility.slice(0, 2).join(" ");
  }
  return "The official source does not publish enough eligibility detail in Trakr's current record.";
}

function geographicEligibilitySummary(opportunity: Opportunity) {
  const geography = opportunity.geography;
  if (!geography) {
    return "Geographic eligibility is unknown and must be confirmed on the official page.";
  }
  if (geography.eligibleCountries.length) {
    return `Published eligible countries: ${geography.eligibleCountries.join(", ")}.`;
  }
  if (geography.eligibleRegions.length) {
    return `Published eligible regions: ${geography.eligibleRegions.join(", ")}.`;
  }
  if (geography.remoteScope === "globally_remote") {
    return "The source supports globally remote participation.";
  }
  if (geography.remoteScope === "remote_country") {
    return "Remote participation is limited to a named country; confirm the official restrictions.";
  }
  if (geography.remoteScope === "remote_region") {
    return "Remote participation is limited to a named region; confirm the official restrictions.";
  }
  if (geography.remoteScope === "remote_timezones") {
    return "Remote participation has time-zone restrictions.";
  }
  if (geography.remoteScope === "onsite" || geography.remoteScope === "hybrid") {
    return `The opportunity is ${geography.remoteScope}.`;
  }
  return "The listing is remote, but global eligibility is not established.";
}

function toRecommendation(
  candidate: ScoredOpportunity,
  rank: number,
  request: RecommendationRequest,
): Recommendation {
  const opportunity = candidate.opportunity;
  const recommendationState =
    opportunity.recommendationState ?? "unavailable_or_unverified";
  const officialUrl = opportunity.canonicalUrl || opportunity.sourceUrl;
  return {
    rank,
    opportunity,
    matchScore: candidate.score,
    reasoning: buildRecommendationNarrative(candidate),
    missingRequirements: candidate.missingRequirements,
    recommendedAction: enforceApplyNowEligibility(
      opportunity,
      candidate.action,
    ),
    nextSteps: buildNextSteps(candidate),
    confidenceScore: Math.round(
      Math.min(
        100,
        candidate.score * 0.55 +
          candidate.qualityScore * 0.25 +
          opportunity.verificationConfidence * 100 * 0.1 +
          profileCompleteness(request) * 100 * 0.1,
      ),
    ),
    guidanceAction: guidanceAction(opportunity, candidate.action),
    recommendationState,
    officialUrl,
    applicationUrl:
      recommendationState === "apply_now" ? officialUrl : null,
    canonicalUrl: officialUrl,
    publisherDomain: opportunity.publisherDomain,
    sourceName: opportunity.sourceName,
    verificationStatus: opportunity.verificationStatus,
    lastVerifiedAt: opportunity.lastVerifiedAt,
    deadline: opportunity.deadline,
    deadlineStatus:
      opportunity.deadlineInfo?.state ??
      (opportunity.deadline ? "exact_future" : "requires_confirmation"),
    eligibilitySummary: eligibilitySummary(opportunity),
    geographicEligibility: geographicEligibilitySummary(opportunity),
    eligibilityConcerns: eligibilityConcerns(candidate),
    provenance: recommendationProvenance(opportunity),
  };
}

function isDirectCandidate(candidate: ScoredOpportunity) {
  return (
    candidate.opportunity.recommendationState === "apply_now" &&
    candidate.opportunity.verificationStatus === "verified" &&
    candidate.opportunity.isActive &&
    !supportingCategories.has(candidate.opportunity.category) &&
    candidate.opportunity.category !== "official_directory" &&
    candidate.opportunity.category !== "research_lead"
  );
}

function isExploreCandidate(candidate: ScoredOpportunity) {
  return (
    !supportingCategories.has(candidate.opportunity.category) &&
    (candidate.opportunity.category === "official_directory" ||
      candidate.opportunity.category === "research_lead" ||
      candidate.opportunity.recommendationState === "explore" ||
      candidate.opportunity.recommendationState === "research_lead")
  );
}

function categoryMatches(
  opportunity: Opportunity,
  category: OpportunityCategory,
) {
  if (opportunity.category === category) return true;
  const type =
    category === "remote_job"
      ? "job"
      : category === "web3_bounty"
        ? "bounty"
        : category;
  return opportunity.secondaryTypes?.includes(type) ?? false;
}

function buildCategoryCoverage(
  request: RecommendationRequest,
  opportunities: Opportunity[],
  scored: ScoredOpportunity[],
  selected: Recommendation[],
): RecommendationResponse["categoryCoverage"] {
  return (request.filters.categories ?? []).map((category) => {
    const inventory = opportunities.filter((opportunity) =>
      categoryMatches(opportunity, category),
    );
    const eligible = scored.filter(
      (candidate) =>
        categoryMatches(candidate.opportunity, category) &&
        isDirectCandidate(candidate),
    );
    const selectedResults = selected.filter((recommendation) =>
      categoryMatches(recommendation.opportunity, category),
    ).length;
    const directories = scored.filter(
      (candidate) =>
        categoryMatches(candidate.opportunity, category) &&
        isExploreCandidate(candidate),
    ).length;
    const unknownEligibility = inventory.filter(
      (opportunity) =>
        opportunity.geography?.confidence === "low" ||
        opportunity.geography?.confidence === "unknown" ||
        opportunity.geography?.unknownConditions.length,
    ).length;

    if (!inventory.length) {
      return {
        category,
        status: "inventory_gap" as const,
        inventoryCandidates: 0,
        eligibleCandidates: 0,
        selectedResults: 0,
        reason: `Trakr currently has no current records for ${category.replaceAll("_", " ")} in its inventory. This is an inventory limitation, not a claim that no such opportunities exist.`,
      };
    }
    if (!eligible.length && directories) {
      return {
        category,
        status: "directories_only" as const,
        inventoryCandidates: inventory.length,
        eligibleCandidates: 0,
        selectedResults: 0,
        reason: `Trakr found official directories or recurring programs for ${category.replaceAll("_", " ")}, but no verified direct opportunity passed the current application, eligibility, and evidence gates.`,
      };
    }
    if (!eligible.length && unknownEligibility) {
      return {
        category,
        status: "eligibility_unknown" as const,
        inventoryCandidates: inventory.length,
        eligibleCandidates: 0,
        selectedResults: 0,
        reason: `Trakr found ${category.replaceAll("_", " ")} records, but material geographic or eligibility conditions remain unknown.`,
      };
    }
    if (!eligible.length || !selectedResults) {
      return {
        category,
        status: "no_qualified_matches" as const,
        inventoryCandidates: inventory.length,
        eligibleCandidates: eligible.length,
        selectedResults: 0,
        reason: `No current ${category.replaceAll("_", " ")} record passed Trakr's relevance, activity, eligibility, and verification gates for the supplied profile.`,
      };
    }
    return {
      category,
      status: eligible.length === 1 || selectedResults === 1
        ? ("limited" as const)
        : ("covered" as const),
      inventoryCandidates: inventory.length,
      eligibleCandidates: eligible.length,
      selectedResults,
      reason:
        eligible.length === 1 || selectedResults === 1
          ? `Only one verified direct ${category.replaceAll("_", " ")} matched the current profile and safety gates.`
          : `${selectedResults} verified direct ${category.replaceAll("_", " ")} results matched the current profile and safety gates.`,
    };
  });
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
    directOpportunities: [],
    explorePrograms: [],
    supportingResources: [],
    categoryCoverage: [],
    actionPlan: buildActionPlan(recommendations),
    learningRoadmap: buildLearningRoadmap(recommendations),
    coverage,
    agentNotes: [
      "Candidates are grounded in stored or structured source opportunities before AI enhancement.",
      "Scores combine category fit, skills, experience level, location, source quality, deadline urgency, and expected value.",
      "Responses are designed for direct consumption by other AI agents.",
    ],
    callerInstructions: {
      relayMessage: true,
      doNotInferMissingInputs: true,
      sendContinuationUnchanged: true,
      doNotGenerateAProfile: true,
      surfaceOfficialUrls: true,
    },
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
    directOpportunities: draft.directOpportunities ?? [],
    explorePrograms: draft.explorePrograms ?? [],
    supportingResources: draft.supportingResources ?? [],
    categoryCoverage: draft.categoryCoverage ?? [],
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
  const opportunities = (
    await source.fetchOpportunities(
      groundedRequest,
      groundedRequest.filters,
    )
  ).map((opportunity) => enrichOpportunityMetadata(opportunity));
  const baseRanked = rankOpportunities(opportunities, groundedRequest);
  const directCandidates = baseRanked.filter(isDirectCandidate);
  const exploreCandidates = baseRanked.filter(isExploreCandidate);
  const supportingCandidates = baseRanked.filter((candidate) =>
    supportingCategories.has(candidate.opportunity.category),
  );
  const diversified = diversifyRankedOpportunities(
    directCandidates,
    groundedRequest,
    getLimit(groundedRequest),
  );
  const ranked = diversified.ranked;

  const directOpportunities = ranked.map((candidate, index) =>
    toRecommendation(candidate, index + 1, groundedRequest),
  );
  const explorePrograms = exploreCandidates
    .slice(0, getLimit(groundedRequest))
    .map((candidate, index) =>
      toRecommendation(candidate, index + 1, groundedRequest),
    );
  const supportingResources = supportingCandidates
    .slice(0, 5)
    .map((candidate, index) =>
      toRecommendation(candidate, index + 1, groundedRequest),
    );
  const recommendations = [
    ...directOpportunities,
    ...explorePrograms,
  ]
    .slice(0, getLimit(groundedRequest))
    .map((recommendation, index) => ({
      ...recommendation,
      rank: index + 1,
    }));
  const categoryCoverage = buildCategoryCoverage(
    groundedRequest,
    opportunities,
    baseRanked,
    directOpportunities,
  );

  const draftResponse = buildDraftResponse(
    groundedRequest,
    aiProvider.name,
    recommendations,
    opportunities.length,
    diversified.coverage,
  );
  draftResponse.directOpportunities = directOpportunities;
  draftResponse.explorePrograms = explorePrograms;
  draftResponse.supportingResources = supportingResources;
  draftResponse.categoryCoverage = categoryCoverage;
  draftResponse.coverage = draftResponse.coverage
    ? {
        ...draftResponse.coverage,
        actionableCount: directOpportunities.length,
        exploreCount: explorePrograms.length,
        researchLeadCount: supportingResources.length,
      }
    : draftResponse.coverage;

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
