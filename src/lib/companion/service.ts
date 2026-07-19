import { nanoid } from "nanoid";
import {
  buildOpportunityExplanation,
  buildReadinessAssessment,
  buildResumeBenchmark,
  buildResumeOptimization,
} from "@/lib/companion/capabilities";
import {
  buildDocumentReference,
  createSessionReference,
  resolveSessionContext,
} from "@/lib/companion/session";
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
  CompanionContext,
  CompanionConversation,
  CompanionIntent,
  Opportunity,
  OpportunityCompanionRequest,
  OpportunityCompanionResponse,
  RecommendationRequest,
  ServiceOperation,
  StructuredUserProfile,
  UserFacingService,
} from "@/lib/types/opportunities";

const SERVICE_VERSION = "0.3.0";

function serviceForOperation(operation: ServiceOperation): UserFacingService {
  if (operation === "benchmark" || operation === "optimize") {
    return "resume_benchmarking_optimization";
  }
  if (operation === "generate_resume") {
    return "resume_generation";
  }
  return "opportunity_finding";
}

function detectIntent(request: OpportunityCompanionRequest): CompanionIntent {
  if (request.intent !== "auto") return request.intent;
  const message = request.message?.toLowerCase() ?? "";

  if (
    /\b(create|generate|build|write|draft)\b.*\b(resume|cv)\b/.test(
      message,
    )
  ) {
    return "resume_generation";
  }
  if (
    /\b(optimi[sz]e|rewrite|tailor|improve)\b.*\b(resume|cv)\b/.test(
      message,
    )
  ) {
    return "resume_optimization";
  }
  if (
    /\b(ats|benchmark|score|evaluate|review)\b.*\b(resume|cv)\b/.test(
      message,
    )
  ) {
    return "resume_benchmark";
  }
  if (
    /\b(am i ready|readiness|what am i missing|what do i lack|skill gaps?|what should i do first|what should i improve|improve before applying|ready to apply)\b/.test(
      message,
    )
  ) {
    return "readiness_assessment";
  }
  if (
    /\bwhy\b.*\b(recommend|match|suggest|fit)\b/.test(message) ||
    /\b(good fit|fit for me|which opportunity should i prioritize|which should i prioritize|best opportunity)\b/.test(
      message,
    )
  ) {
    return "explain_recommendation";
  }
  if (/\b(build|create|review|confirm)\b.*\bprofile\b/.test(message)) {
    return "profile_build";
  }
  return "opportunity_matching";
}

function operationForRequest(
  request: OpportunityCompanionRequest,
  intent: CompanionIntent,
): ServiceOperation {
  if (request.operation !== "auto") {
    return request.operation;
  }
  if (intent === "resume_benchmark") return "benchmark";
  if (intent === "resume_optimization") return "optimize";
  if (intent === "resume_generation") return "generate_resume";
  return "discover";
}

function activeContext(request: OpportunityCompanionRequest) {
  return request.context as CompanionContext | undefined;
}

function normalizedRequest(request: OpportunityCompanionRequest) {
  const suppliedContext = request.context ?? request.continuation;
  const context = resolveSessionContext(suppliedContext);
  return {
    ...request,
    context,
    continuation: undefined,
  };
}

function hasMeaningfulProfile(profile: StructuredUserProfile | undefined) {
  if (!profile) return false;
  return Boolean(
    profile.name ||
      profile.headline ||
      profile.bio ||
      profile.location ||
      profile.timezone ||
      profile.experienceLevel ||
      profile.skills.length ||
      profile.interests.length ||
      profile.goals.length ||
      profile.education.length ||
      profile.workHistory.length ||
      profile.projects.length ||
      profile.certifications.length ||
      profile.links.length,
  );
}

function profileSourceChoice(message: string | undefined) {
  const normalized = message?.trim().toLowerCase() ?? "";
  if (
    /^(1|option 1|resume|cv)$/.test(normalized) ||
    /\b(use|upload|attach|paste|provide)\b.*\b(resume|cv)\b/.test(
      normalized,
    )
  ) {
    return "resume" as const;
  }
  if (
    /^(2|option 2|background)$/.test(normalized) ||
    /\b(tell|provide|describe|share)\b.*\b(background|experience|profile)\b/.test(
      normalized,
    ) ||
    /\b(don't|do not|no|without)\b.*\b(resume|cv)\b/.test(normalized)
  ) {
    return "background" as const;
  }
  if (
    /^(3|option 3|request|what i(?:'m| am) looking for)$/.test(normalized) ||
    /\b(describe|tell you)\b.*\b(looking for|want|need)\b/.test(normalized)
  ) {
    return "request" as const;
  }
}

function serviceInvocation(message: string | undefined) {
  return /\b(agent\s*#?\s*5198|opportunity matching api|service type|a2mcp|public service endpoint|use the service)\b/i.test(
    message ?? "",
  );
}

function isGenericOpportunityRequest(message: string | undefined) {
  const normalized = message?.trim().toLowerCase() ?? "";
  return (
    !normalized ||
    /^(find|show|get|give)\s+me\s+(some\s+)?opportunities[.!]?$/.test(
      normalized,
    ) ||
    /^i\s+(want|need)\s+opportunities[.!]?$/.test(normalized)
  );
}

function isRequestRouteSelection(message: string | undefined) {
  return /^(3|option 3|request|what i(?:'m| am) looking for)[.!]?$/i.test(
    message?.trim() ?? "",
  );
}

function shouldOfferProfileSource(
  request: OpportunityCompanionRequest,
  built: ReturnType<typeof buildConversationalProfile>,
) {
  if (
    hasMeaningfulProfile(activeContext(request)?.profile) ||
    request.user ||
    request.profile ||
    request.resumeText
  ) {
    return false;
  }
  if (
    (request.operation === "auto" || request.operation === "discover") &&
    isGenericOpportunityRequest(request.message)
  ) {
    return true;
  }
  return serviceInvocation(request.message);
}

function confirmedProfile(request: OpportunityCompanionRequest) {
  const context = activeContext(request);
  if (context?.profileConfirmed) return true;
  if (!context?.awaitingProfileConfirmation) return false;
  return /^(yes|correct|confirmed|looks good|that's right|that is right|proceed|continue)\b/i.test(
    request.message?.trim() ?? "",
  );
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
    operation: conversation.operation,
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
      "Continuation is an encrypted, caller-carried session reference with a short lifetime; Trakr does not keep a shared personal profile.",
    ],
    conversation,
    capabilityResult,
  };
}

function conversationFor(
  request: OpportunityCompanionRequest,
  built: ReturnType<typeof buildConversationalProfile>,
  intent: CompanionIntent,
  operation: ServiceOperation,
  service: UserFacingService,
  state: CompanionConversation["state"],
  message: string,
  nextActions: string[],
  selectedOpportunityId?: string,
  options: {
    requiredAction?: string;
    choices?: CompanionConversation["choices"];
    profileConfirmed?: boolean;
    profileSource?: "resume" | "background" | "request";
    awaitingProfileConfirmation?: boolean;
    stage?: string;
  } = {},
): CompanionConversation {
  const context = activeContext(request);
  const existingDocumentReferences = context?.documentReferences ?? [];
  const suppliedDocumentReference = request.resumeText
    ? buildDocumentReference(request.resumeText)
    : undefined;
  const documentReferences = suppliedDocumentReference
    ? [
        ...existingDocumentReferences.filter(
          (item) => item.id !== suppliedDocumentReference.id,
        ),
        suppliedDocumentReference,
      ]
    : existingDocumentReferences;
  const sessionContext = buildContinuationContext(
    built.profile,
    built.evidence,
    context,
    selectedOpportunityId,
    {
      profileConfirmed:
        options.profileConfirmed ?? confirmedProfile(request),
      profileSource: options.profileSource ?? built.profileSource,
      awaitingProfileConfirmation: options.awaitingProfileConfirmation,
      service,
      operation,
      stage: options.stage ?? state,
      unansweredQuestions: built.missingInformation
        .filter((item) => item.required)
        .map((item) => item.question),
      documentReferences,
      consent: request.consent ?? context?.consent ?? {
        processPersonalData: Boolean(request.resumeText || hasMeaningfulProfile(built.profile)),
        retention: "session_only",
        source: request.consent ? "explicit" : "implicit_legacy",
      },
      filters: built.filters,
    },
  );

  return {
    state,
    intent,
    service,
    operation,
    profileSource: options.profileSource ?? built.profileSource,
    stage: options.stage ?? state,
    message,
    profile: {
      draft: built.profile,
      evidence: built.evidence,
      unknownFields: built.unknownFields,
      completenessScore: built.completenessScore,
      confirmed: options.profileConfirmed ?? confirmedProfile(request),
    },
    missingInformation: built.missingInformation,
    nextActions,
    continuation: createSessionReference(sessionContext),
    requiredAction: options.requiredAction,
    choices: options.choices,
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
    "Tell me only what is still important for a reliable match:",
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
    request.target?.opportunityId ?? activeContext(request)?.selectedOpportunityId;
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
  rawRequest: OpportunityCompanionRequest,
): Promise<OpportunityCompanionResponse> {
  const request = normalizedRequest(rawRequest);
  const intent = detectIntent(request);
  const operation = operationForRequest(request, intent);
  const service = serviceForOperation(operation);
  const priorConsent = activeContext(request)?.consent?.processPersonalData;
  const resumeConsentGranted =
    request.consent?.processPersonalData === true ||
    (request.consent === undefined && priorConsent === true);
  if (request.resumeText && !resumeConsentGranted) {
    const consentSafeRequest = {
      ...request,
      resumeText: undefined,
    };
    const consentSafeProfile = buildConversationalProfile(consentSafeRequest);
    const conversation = conversationFor(
      consentSafeRequest,
      consentSafeProfile,
      intent,
      operation,
      service,
      "consent_required",
      request.consent?.processPersonalData === false
        ? "I have not processed the supplied resume because consent to process personal data is disabled. Confirm session-only processing or continue without the document."
        : "I have not processed the supplied resume because affirmative session-only processing consent is required. Confirm consent or continue without the document.",
      [
        "Ask the user to consent to session-only resume processing.",
        "Offer the background or free-form request route instead.",
      ],
      undefined,
      {
        requiredAction: "confirm_resume_processing_consent",
        profileSource: "resume",
        stage: "consent_required",
      },
    );
    return emptyResponse(
      consentSafeRequest,
      conversation,
      undefined,
      consentSafeProfile.filters,
    );
  }
  const built = buildConversationalProfile(request);
  const sourceChoice =
    request.intakeRoute ?? profileSourceChoice(request.message);

  if (
    request.operation === "auto" &&
    !request.user &&
    !request.profile &&
    !request.resumeText &&
    !request.context &&
    !request.message
  ) {
    const conversation = conversationFor(
      request,
      built,
      "profile_build",
      "auto",
      "opportunity_finding",
      "choose_service",
      "What would you like to do?",
      [
        "Choose Opportunity Finding, Resume Benchmarking & Optimization, or Resume Generation.",
      ],
      undefined,
      {
        requiredAction: "select_service",
        choices: [
          {
            id: "opportunity_finding",
            label: "Opportunity Finding",
            description: "Find current opportunities that fit your goals.",
          },
          {
            id: "resume_benchmarking_optimization",
            label: "Resume Benchmarking & Optimization",
            description: "Compare application material with a specific target.",
          },
          {
            id: "resume_generation",
            label: "Resume Generation",
            description: "Create a truthful document from verified facts.",
          },
        ],
        stage: "service_selection",
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (
    request.operation === "benchmark" ||
    request.operation === "optimize" ||
    request.operation === "generate_resume" ||
    intent === "resume_generation"
  ) {
    const conversation = conversationFor(
      request,
      built,
      intent,
      operation,
      service,
      "service_pending",
      "This service is visible in Trakr's product flow, but this release is validating Opportunity Finding first. Your request is preserved for the next capability milestone.",
      [
        "Keep the service choice and continue with the same session when Resume Benchmarking & Optimization or Resume Generation is enabled.",
      ],
      undefined,
      {
        requiredAction: "await_next_capability_release",
        stage: "service_pending",
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (shouldOfferProfileSource(request, built) && !sourceChoice) {
    const conversation = conversationFor(
      request,
      built,
      "profile_build",
      operation,
      "opportunity_finding",
      "choose_profile_source",
      "I can find current opportunities without requiring a resume. Choose a starting point: 1. Use my resume or CV. 2. Tell Trakr about my background. 3. Describe what you are looking for first.",
      [
        "Ask the user to choose a resume, background, or free-form request route.",
      ],
      undefined,
      {
        requiredAction: "select_profile_source",
        choices: [
          {
            id: "resume",
            label: "Use my resume or CV",
            description: "Extract a session profile from supplied document text.",
          },
          {
            id: "background",
            label: "Tell Trakr about my background",
            description: "Describe relevant facts in natural language.",
          },
          {
            id: "request",
            label: "Describe what I am looking for",
            description: "Start with your goal and add only important missing details.",
          },
        ],
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (sourceChoice === "resume" && !request.resumeText) {
    const conversation = conversationFor(
      request,
      built,
      "profile_build",
      operation,
      "opportunity_finding",
      "awaiting_resume",
      "Attach your resume or CV, or paste its text. I will keep explicit facts, inferences, and unknowns separate and ask only for missing information that affects eligibility or fit.",
      ["Ask the user or calling agent to provide resume text for this session."],
      undefined,
      {
        requiredAction: "provide_resume",
        profileSource: "resume",
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (
    sourceChoice === "background" &&
    !hasMeaningfulProfile(activeContext(request)?.profile) &&
    built.completenessScore === 0
  ) {
    const conversation = conversationFor(
      request,
      built,
      "profile_build",
      operation,
      "opportunity_finding",
      "collecting_background",
      "Tell me about your current role or field of study, skills and tools you can actually use, experience level, supporting projects or work, target opportunity types and fields, location or remote preference, and immediate goal. One natural message is enough; optional details can come later.",
      ["Ask the user for one natural-language background message."],
      undefined,
      {
        requiredAction: "provide_background",
        profileSource: "background",
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (
    sourceChoice === "request" &&
    (isGenericOpportunityRequest(request.message) ||
      isRequestRouteSelection(request.message))
  ) {
    const conversation = conversationFor(
      request,
      built,
      "opportunity_matching",
      operation,
      "opportunity_finding",
      "collecting_request",
      "What kind of opportunity are you looking for? Start with the goal, field, location or remote preference, and experience stage. Add skills if you have them.",
      ["Ask the user to describe the desired opportunity in natural language."],
      undefined,
      {
        requiredAction: "provide_opportunity_request",
        profileSource: "request",
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (!built.sufficient) {
    const conversation = conversationFor(
      request,
      built,
      intent,
      operation,
      service,
      "needs_more_information",
      missingProfileMessage(built),
      built.missingInformation
        .filter((item) => item.required)
        .map((item) => `Ask the user: ${item.question}`),
      undefined,
      {
        requiredAction: "provide_missing_profile_information",
        profileSource: sourceChoice ?? built.profileSource,
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (intent === "profile_build") {
    const conversation = conversationFor(
      request,
      built,
      intent,
      operation,
      service,
      "profile_confirmation",
      `Here is the session profile I built: ${built.profile.headline ?? "background captured"} with ${built.profile.skills.slice(0, 6).join(", ") || "skills still to review"}. Confirm or correct it before matching if anything is inaccurate.`,
      [
        "Ask the user to confirm or correct the profile.",
        "Send the returned continuation reference back unchanged.",
      ],
      undefined,
      {
        requiredAction: "review_profile",
        profileConfirmed: false,
        awaitingProfileConfirmation: true,
      },
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
      operation: "discover",
      conversation: conversationFor(
        request,
        built,
        intent,
        "discover",
        "opportunity_finding",
        "recommendations",
        response.recommendations.length >= 10
          ? "I found 10 grounded opportunities ranked against the profile."
          : `I found ${response.recommendations.length} suitable grounded opportunities. I did not add weaker or invented results just to reach 10.`,
        [
          "Present the ranked recommendations and coverage report.",
          "Offer to explain a recommendation or assess readiness.",
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
      operation,
      service,
      "needs_more_information",
      targetPrompt(intent),
      [targetPrompt(intent)],
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (intent === "resume_benchmark" || intent === "resume_optimization") {
    if (
      !request.resumeText &&
      !built.profile.workHistory.length &&
      !built.profile.links.length
    ) {
      const conversation = conversationFor(
        request,
        built,
        intent,
        operation,
        service,
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
      operation,
      service,
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
      "discover",
      "opportunity_finding",
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
    "discover",
    "opportunity_finding",
    "readiness",
    `Your readiness for ${candidate.opportunity.title} is ${readiness.readinessLevel.replace("_", " ")} at ${readiness.readinessScore}/100. The score is explained by matched skills, missing requirements, eligibility checks, and available evidence.`,
    [
      "Review the readiness strengths and gaps with the user.",
      "Offer a grounded application action plan.",
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
