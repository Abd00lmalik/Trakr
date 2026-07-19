import { nanoid } from "nanoid";
import {
  buildOpportunityExplanation,
  buildReadinessAssessment,
  buildResumeBenchmark,
  buildResumeOptimization,
} from "@/lib/companion/capabilities";
import { opportunitySource } from "@/lib/opportunities/sources";
import {
  buildContinuationContext,
  buildConversationalProfile,
} from "@/lib/profile/conversation";
import { buildRecommendationNarrative } from "@/lib/recommendation/action-plan";
import { scoreOpportunity } from "@/lib/recommendation/scoring";
import { generateRecommendations } from "@/lib/recommendation/service";
import type {
  CompanionCapabilityResult,
  CompanionConversation,
  CompanionIntent,
  Opportunity,
  OpportunityCompanionRequest,
  OpportunityCompanionResponse,
  RecommendationRequest,
  StructuredUserProfile,
} from "@/lib/types/opportunities";

const SERVICE_VERSION = "0.2.0";

function detectIntent(request: OpportunityCompanionRequest): CompanionIntent {
  if (request.intent !== "auto") return request.intent;
  const message = request.message?.toLowerCase() ?? "";

  if (/\b(optimi[sz]e|rewrite|tailor|improve)\b.*\b(resume|cv)\b/.test(message)) {
    return "resume_optimization";
  }
  if (/\b(ats|benchmark|score|evaluate|review)\b.*\b(resume|cv)\b/.test(message)) {
    return "resume_benchmark";
  }
  if (
    /\b(am i ready|readiness|what am i missing|what do i lack|skill gaps?)\b/.test(
      message,
    )
  ) {
    return "readiness_assessment";
  }
  if (/\bwhy\b.*\b(recommend|match|suggest)/.test(message)) {
    return "explain_recommendation";
  }
  if (/\b(build|create|review|confirm)\b.*\bprofile\b/.test(message)) {
    return "profile_build";
  }
  return "opportunity_matching";
}

function toRecommendationRequest(
  request: OpportunityCompanionRequest,
  profile: StructuredUserProfile,
  filters: OpportunityCompanionRequest["filters"],
): RecommendationRequest {
  return {
    user: profile,
    resumeText: request.resumeText,
    goals: request.goals,
    interests: request.interests,
    filters: {
      ...filters,
      limit: filters.limit ?? 10,
    },
    requestId: request.requestId,
  };
}

function emptyResponse(
  request: OpportunityCompanionRequest,
  conversation: CompanionConversation,
  capabilityResult?: CompanionCapabilityResult,
  filters: OpportunityCompanionRequest["filters"] = request.filters,
): OpportunityCompanionResponse {
  return {
    service: "trakr",
    version: SERVICE_VERSION,
    requestId: request.requestId ?? nanoid(),
    generatedAt: new Date().toISOString(),
    provider: "deterministic-local",
    aiStatus: "fallback",
    querySummary: {
      profileSignals: [],
      filtersApplied: filters,
      totalCandidates: 0,
    },
    recommendations: [],
    actionPlan: {
      immediate: [],
      sevenDayPlan: [],
      thirtyDayPlan: [],
    },
    learningRoadmap: {
      focusAreas: [],
      resourcesToFind: [],
      practiceProjects: [],
    },
    agentNotes: [
      "This response is a conversational capability state, not a completed opportunity recommendation run.",
      "Continuation context is caller-scoped and must be sent back explicitly; Trakr does not keep a shared in-memory user profile.",
    ],
    conversation,
    capabilityResult,
  };
}

function conversationFor(
  request: OpportunityCompanionRequest,
  built: ReturnType<typeof buildConversationalProfile>,
  intent: CompanionIntent,
  state: CompanionConversation["state"],
  message: string,
  nextActions: string[],
  selectedOpportunityId?: string,
): CompanionConversation {
  return {
    state,
    intent,
    message,
    profile: {
      draft: built.profile,
      evidence: built.evidence,
      unknownFields: built.unknownFields,
      completenessScore: built.completenessScore,
      confirmed: request.context?.profileConfirmed ?? false,
    },
    missingInformation: built.missingInformation,
    nextActions,
    continuation: buildContinuationContext(
      built.profile,
      built.evidence,
      request.context,
      selectedOpportunityId,
    ),
  };
}

function missingProfileMessage(
  built: ReturnType<typeof buildConversationalProfile>,
) {
  const required = built.missingInformation.filter((item) => item.required);
  if (!required.length) {
    return "I have enough information to help.";
  }

  return [
    "I can help with that, and you do not need a resume to get started.",
    "Tell me a little more so I can make useful matches:",
    ...required.map((item) => item.question),
  ].join(" ");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ").trim();
}

async function findTargetOpportunity(
  request: OpportunityCompanionRequest,
  recommendationRequest: RecommendationRequest,
) {
  const opportunityId =
    request.target?.opportunityId ?? request.context?.selectedOpportunityId;
  const opportunityTitle = request.target?.opportunityTitle;
  if (!opportunityId && !opportunityTitle) return null;

  const opportunities = await opportunitySource.fetchOpportunities(
    recommendationRequest,
    {},
  );
  if (opportunityId) {
    const exact = opportunities.find((item) => item.id === opportunityId);
    if (exact) return exact;
  }
  if (opportunityTitle) {
    const requested = normalize(opportunityTitle);
    return (
      opportunities.find((item) => normalize(item.title) === requested) ??
      opportunities.find(
        (item) =>
          normalize(item.title).includes(requested) ||
          requested.includes(normalize(item.title)),
      ) ??
      null
    );
  }
  return null;
}

function targetPrompt(intent: CompanionIntent) {
  if (intent === "explain_recommendation") {
    return "Which recommendation should I explain? Send its opportunity ID or exact title.";
  }
  if (intent === "readiness_assessment") {
    return "Which opportunity should I assess you against? Send its opportunity ID or exact title.";
  }
  return "Which opportunity or target role should I use for the resume analysis?";
}

export async function handleOpportunityCompanionRequest(
  request: OpportunityCompanionRequest,
): Promise<OpportunityCompanionResponse> {
  const intent = detectIntent(request);
  const built = buildConversationalProfile(request);

  if (!built.sufficient) {
    const conversation = conversationFor(
      request,
      built,
      intent,
      "needs_more_information",
      missingProfileMessage(built),
      built.missingInformation
        .filter((item) => item.required)
        .map((item) => `Ask the user: ${item.question}`),
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (intent === "profile_build") {
    const conversation = conversationFor(
      request,
      built,
      intent,
      "profile_confirmation",
      `Here is the profile I built from the information provided: ${built.profile.headline ?? "background captured"} with ${built.profile.skills.slice(0, 6).join(", ") || "skills still to review"}. Confirm or correct it before matching if anything is inaccurate.`,
      [
        "Ask the user to confirm or correct the profile.",
        "Send the returned continuation context back with profileConfirmed set to true.",
      ],
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  const recommendationRequest = toRecommendationRequest(
    request,
    built.profile,
    built.filters,
  );

  if (intent === "opportunity_matching") {
    const response = await generateRecommendations(recommendationRequest);
    const selectedOpportunityId =
      response.recommendations[0]?.opportunity.id;
    return {
      ...response,
      conversation: conversationFor(
        request,
        built,
        intent,
        "recommendations",
        response.recommendations.length >= 10
          ? "I found 10 grounded opportunities ranked against the profile."
          : `I found ${response.recommendations.length} suitable grounded opportunities. I did not add weaker or invented results just to reach 10.`,
        [
          "Present the ranked recommendations to the user.",
          "Offer to explain a recommendation, assess readiness, or benchmark application materials.",
        ],
        selectedOpportunityId,
      ),
    };
  }

  const targetOpportunity = await findTargetOpportunity(
    request,
    recommendationRequest,
  );
  const targetRoleAvailable = Boolean(
    request.target?.role || request.target?.industry,
  );
  if (
    !targetOpportunity &&
    !(
      ["resume_benchmark", "resume_optimization"].includes(intent) &&
      targetRoleAvailable
    )
  ) {
    const conversation = conversationFor(
      request,
      built,
      intent,
      "needs_more_information",
      targetPrompt(intent),
      [targetPrompt(intent)],
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (intent === "resume_benchmark" || intent === "resume_optimization") {
    if (!request.resumeText && !built.profile.workHistory.length && !built.profile.links.length) {
      const conversation = conversationFor(
        request,
        built,
        intent,
        "needs_more_information",
        "I can benchmark or optimize the positioning, but I need real evidence to work from. Send a resume, portfolio link, project history, or verified work and education details. I will not invent experience.",
        [
          "Ask the user for a resume, portfolio, projects, work history, or education details.",
          "Keep unknown experience unknown rather than generating unsupported claims.",
        ],
        targetOpportunity?.id,
      );
      return emptyResponse(request, conversation, undefined, built.filters);
    }

    const capabilityResult: CompanionCapabilityResult =
      intent === "resume_benchmark"
        ? {
            resumeBenchmark: buildResumeBenchmark(
              request,
              built.profile,
              targetOpportunity,
            ),
          }
        : {
            resumeOptimization: buildResumeOptimization(
              request,
              built.profile,
              targetOpportunity,
            ),
          };
    const state =
      intent === "resume_benchmark"
        ? ("resume_benchmark" as const)
        : ("resume_optimization" as const);
    const conversation = conversationFor(
      request,
      built,
      intent,
      state,
      intent === "resume_benchmark"
        ? "I benchmarked the supplied profile and resume evidence against the target without adding unsupported claims."
        : "I created a grounded optimization plan using only supplied facts. Unsupported target keywords remain flagged rather than being added as experience.",
      [
        "Review the benchmark or optimization with the user.",
        "Ask the user to verify every factual claim before using the output.",
      ],
      targetOpportunity?.id,
    );
    return emptyResponse(
      request,
      conversation,
      capabilityResult,
      built.filters,
    );
  }

  const candidate = scoreOpportunity(
    targetOpportunity as Opportunity,
    recommendationRequest,
  );
  const explanation = buildOpportunityExplanation(
    candidate,
    built.completenessScore,
  );

  if (intent === "explain_recommendation") {
    const conversation = conversationFor(
      request,
      built,
      intent,
      "explanation",
      buildRecommendationNarrative(candidate),
      [
        "Explain the strongest matched signals and the main gaps.",
        "Offer a readiness assessment for the same opportunity.",
      ],
      candidate.opportunity.id,
    );
    return emptyResponse(
      request,
      conversation,
      { explanation },
      built.filters,
    );
  }

  const readiness = buildReadinessAssessment(candidate, built.profile);
  const conversation = conversationFor(
    request,
    built,
    intent,
    "readiness",
    `Your readiness for ${candidate.opportunity.title} is ${readiness.readinessLevel.replace("_", " ")} at ${readiness.readinessScore}/100. The score is explained by matched skills, missing requirements, eligibility checks, and available evidence.`,
    [
      "Review the readiness strengths and gaps with the user.",
      "Offer a grounded resume benchmark or application action plan.",
    ],
    candidate.opportunity.id,
  );
  return emptyResponse(
    request,
    conversation,
    { readiness, explanation },
    built.filters,
  );
}
