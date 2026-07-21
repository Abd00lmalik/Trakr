import { nanoid } from "nanoid";
import {
  buildBenchmarkReference,
  buildOpportunityExplanation,
  buildReadinessAssessment,
  buildResumeBenchmark,
  buildResumeGeneration,
  buildResumeOptimization,
  isBenchmarkCompatible,
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
import { sanitizeUntrustedValues } from "@/lib/security/untrusted-content";
import type {
  CompanionCapabilityResult,
  CompanionContext,
  CompanionConversation,
  CompanionIntent,
  CompanionTarget,
  Opportunity,
  OpportunityCompanionRequest,
  OpportunityCompanionResponse,
  ProfileEvidence,
  RecommendationRequest,
  ServiceOperation,
  StructuredUserProfile,
  UserFacingService,
  ResumeBenchmarkReference,
  GenerationPreferences,
} from "@/lib/types/opportunities";

const SERVICE_VERSION = "0.5.0";

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
    (/\b(optimi[sz]e|rewrite|tailor|improve)\b.*\b(resume|cv)\b/.test(
      message,
    ) ||
      /\b(resume|cv)\b.*\b(optimi[sz]e|optimized|rewrite|tailor|improve)\b/.test(
        message,
      ))
  ) {
    return "resume_optimization";
  }
  if (
    (/\b(ats|benchmark|score|evaluate|review)\b.*\b(resume|cv)\b/.test(
      message,
    ) ||
      /\b(resume|cv)\b.*\b(ats|benchmark|benchmarked|score|evaluate|review)\b/.test(
        message,
      ))
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

function safeGenerationPreferences(
  preferences: GenerationPreferences | undefined,
) {
  if (!preferences) return undefined;
  return {
    ...preferences,
    locale: preferences.locale
      ? sanitizeUntrustedValues([preferences.locale])[0]
      : undefined,
    instructions: sanitizeUntrustedValues(preferences.instructions),
  };
}

function normalizedRequest(request: OpportunityCompanionRequest) {
  const suppliedContext = request.context ?? request.continuation;
  const context = resolveSessionContext(suppliedContext);
  const inferredTarget = targetFromMessage(request.message);
  const contextTarget = context?.target;
  const suppliedTarget = request.target;
  const replacementTarget = suppliedTarget ?? inferredTarget;
  const replacesContext =
    Boolean(replacementTarget) &&
    Boolean(
      replacementTarget?.opportunityId ||
        replacementTarget?.opportunityTitle ||
        replacementTarget?.url ||
        (replacementTarget?.role &&
          contextTarget?.role &&
          normalize(replacementTarget.role) !== normalize(contextTarget.role)),
    );
  return {
    ...request,
    context,
    continuation: undefined,
    target: replacementTarget
      ? {
          ...(replacesContext ? {} : contextTarget),
          ...inferredTarget,
          ...suppliedTarget,
        }
      : contextTarget,
    generationPreferences:
      safeGenerationPreferences(
        request.generationPreferences ?? context?.generationPreferences,
      ),
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
      (profile.research?.length ?? 0) ||
      (profile.publications?.length ?? 0) ||
      (profile.achievements?.length ?? 0) ||
      (profile.awards?.length ?? 0) ||
      (profile.volunteerExperience?.length ?? 0) ||
      (profile.leadership?.length ?? 0) ||
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
    target?: CompanionTarget;
    lastBenchmark?: ResumeBenchmarkReference;
    generationPreferences?: CompanionContext["generationPreferences"];
    clearProfileFromSession?: boolean;
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
      target: options.target ?? request.target ?? context?.target,
      generationPreferences:
        safeGenerationPreferences(
          options.generationPreferences ??
            request.generationPreferences ??
            context?.generationPreferences,
        ),
      lastBenchmark: options.lastBenchmark ?? context?.lastBenchmark,
    },
  );
  if (options.clearProfileFromSession) {
    sessionContext.profile = undefined;
    sessionContext.profileEvidence = [];
    sessionContext.documentReferences = [];
    sessionContext.lastBenchmark = undefined;
  }

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

function targetFromMessage(
  message: string | undefined,
): CompanionTarget | undefined {
  const value = message?.trim();
  if (!value) return undefined;
  const opportunityType = /\bhackathon|competition|challenge\b/i.test(value)
    ? ("hackathon" as const)
    : /\bscholarship\b/i.test(value)
      ? ("scholarship" as const)
      : /\bfellowship\b/i.test(value)
        ? ("fellowship" as const)
        : /\bgrant|funded program|funding opportunity\b/i.test(value)
          ? ("grant" as const)
          : /\binternship|intern\b/i.test(value)
            ? ("internship" as const)
            : /\bjob|role|position\b/i.test(value)
              ? ("remote_job" as const)
              : undefined;
  const role = value
    .match(
      /\b(?:for|against|targeting)\s+(?:an?\s+|the\s+)?([^.!?]{3,180}?)(?=\s+(?:that|which|requiring|requires|must|where|at)\b|[.!?]|$)/i,
    )?.[1]
    ?.trim()
    .replace(/\b(?:resume|cv)\b/gi, "")
    .trim();
  const requirements = value
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(
      (item) =>
        item.length >= 8 &&
        /\b(required|requires?|must|minimum|preferred|eligible|submit|portfolio|writing sample)\b/i.test(
          item,
        ),
    )
    .slice(0, 20);
  if (!role && !requirements.length) return undefined;
  return {
    role,
    opportunityType,
    description: value.length >= 20 ? value.slice(0, 12000) : undefined,
    requirements: requirements.length ? requirements : undefined,
  };
}

async function findTargetOpportunity(
  request: OpportunityCompanionRequest,
  recommendationRequest: RecommendationRequest,
) {
  const opportunityId =
    request.target?.opportunityId ?? activeContext(request)?.selectedOpportunityId;
  const opportunityTitle = request.target?.opportunityTitle;
  const opportunityUrl = request.target?.url;
  if (!opportunityId && !opportunityTitle && !opportunityUrl) return null;

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
  if (opportunityUrl) {
    const requested = normalize(opportunityUrl);
    return (
      opportunities.find(
        (item) =>
          normalize(item.canonicalUrl) === requested ||
          normalize(item.sourceUrl) === requested,
      ) ?? null
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

function targetForSession(
  target: CompanionTarget | undefined,
  opportunity: Opportunity | null,
): CompanionTarget | undefined {
  if (!target && !opportunity) return undefined;
  return {
    ...target,
    opportunityId: opportunity?.id ?? target?.opportunityId,
    opportunityTitle: opportunity?.title ?? target?.opportunityTitle,
    organization: opportunity?.organization ?? target?.organization,
    opportunityType: opportunity?.category ?? target?.opportunityType,
    description: target?.description ?? opportunity?.summary,
    requirements:
      target?.requirements ??
      (opportunity
        ? [
            ...opportunity.eligibility,
            ...opportunity.requiredSkills,
            ...opportunity.preferredSkills,
          ]
        : undefined),
    url: opportunity?.canonicalUrl ?? target?.url,
  };
}

function hasResumeEvidence(profile: StructuredUserProfile, resumeText?: string) {
  return Boolean(
    resumeText ||
      profile.workHistory.length ||
      profile.projects.length ||
      profile.education.length ||
      profile.research?.length ||
      profile.publications?.length ||
      profile.achievements?.length ||
      profile.awards?.length ||
      profile.volunteerExperience?.length ||
      profile.leadership?.length ||
      profile.certifications.length ||
      profile.links.length,
  );
}

function hasGenerationEvidence(evidence: ProfileEvidence[]) {
  const substantiveFields = new Set([
    "education",
    "workHistory",
    "projects",
    "research",
    "publications",
    "achievements",
    "awards",
    "volunteerExperience",
    "leadership",
    "certifications",
  ]);
  return evidence.some((item) => {
    if (
      !substantiveFields.has(item.field) ||
      item.source !== "explicit" ||
      item.confirmed === false ||
      !(item.allowedUse ?? []).includes("generation")
    ) {
      return false;
    }
    if (typeof item.value === "string") return Boolean(item.value.trim());
    return Array.isArray(item.value) && item.value.some((value) => value.trim());
  });
}

function hasUsableTarget(
  target: CompanionTarget | undefined,
  opportunity: Opportunity | null,
) {
  return Boolean(
    opportunity ||
      target?.description ||
      target?.requirements?.length ||
      target?.role,
  );
}

export async function handleOpportunityCompanionRequest(
  rawRequest: OpportunityCompanionRequest,
): Promise<OpportunityCompanionResponse> {
  const request = normalizedRequest(rawRequest);
  const intent = detectIntent(request);
  const operation = operationForRequest(request, intent);
  const service = serviceForOperation(operation);
  const priorConsent = activeContext(request)?.consent?.processPersonalData;
  const contextHasPersonalData = Boolean(
    activeContext(request)?.profile ||
      activeContext(request)?.profileEvidence?.length ||
      activeContext(request)?.documentReferences?.length,
  );
  if (
    request.consent?.processPersonalData === false &&
    (request.resumeText || contextHasPersonalData)
  ) {
    const withdrawnContext: CompanionContext = {
      ...(activeContext(request) ?? {}),
      profile: undefined,
      profileEvidence: [],
      profileConfirmed: false,
      awaitingProfileConfirmation: false,
      unansweredQuestions: [],
      documentReferences: [],
      consent: request.consent,
      lastBenchmark: undefined,
      target: request.target ?? activeContext(request)?.target,
      sessionVersion: "2",
    };
    const consentSafeRequest = {
      ...request,
      user: undefined,
      profile: undefined,
      resumeText: undefined,
      message: undefined,
      context: withdrawnContext,
    };
    const consentSafeProfile = buildConversationalProfile(consentSafeRequest);
    const conversation = conversationFor(
      consentSafeRequest,
      consentSafeProfile,
      intent,
      operation,
      service,
      "consent_required",
      "Consent for personal-data processing was withdrawn. I removed the current session profile, evidence, document references, and benchmark reference. Continue only with new consent or without personal application data.",
      [
        "Ask whether the user wants to grant new session-only consent.",
        "Allow the user to start a non-personal request without prior profile evidence.",
      ],
      undefined,
      {
        requiredAction: "confirm_resume_processing_consent",
        stage: "consent_withdrawn",
        target: withdrawnContext.target,
        clearProfileFromSession: true,
      },
    );
    return emptyResponse(
      consentSafeRequest,
      conversation,
      undefined,
      consentSafeProfile.filters,
    );
  }
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
    request.operation === "generate_resume" ||
    intent === "resume_generation"
  ) {
    const recommendationRequest = toRecommendationRequest(
      request,
      built.profile,
      built.filters,
    );
    const targetOpportunity = await findTargetOpportunity(
      request,
      recommendationRequest,
    );
    const sessionTarget = targetForSession(request.target, targetOpportunity);

    if (!hasUsableTarget(sessionTarget, targetOpportunity)) {
      const message = request.target?.url
        ? "I could not resolve that URL to a verified Trakr opportunity. Paste the target description or requirements so I can select and generate the correct application document."
        : "What opportunity or objective should this document support? Provide the target role, program, requirements, description, or a verified Trakr opportunity.";
      const conversation = conversationFor(
        request,
        built,
        "resume_generation",
        "generate_resume",
        "resume_generation",
        "needs_more_information",
        message,
        [message],
        targetOpportunity?.id,
        {
          requiredAction: "provide_generation_target",
          target: sessionTarget,
          generationPreferences: request.generationPreferences,
          stage: "collecting_generation_target",
        },
      );
      return emptyResponse(request, conversation, undefined, built.filters);
    }

    if (!hasGenerationEvidence(built.evidence)) {
      const message =
        "Start with the strongest verified evidence for this target: education, one relevant job or project, research, volunteer work, or another concrete contribution. A short natural-language answer is enough; I will ask the next focused question and will not invent missing history.";
      const conversation = conversationFor(
        request,
        built,
        "resume_generation",
        "generate_resume",
        "resume_generation",
        "needs_more_information",
        message,
        [message],
        targetOpportunity?.id,
        {
          requiredAction: "provide_generation_evidence",
          target: sessionTarget,
          generationPreferences: request.generationPreferences,
          stage: "collecting_generation_evidence",
        },
      );
      return emptyResponse(request, conversation, undefined, built.filters);
    }

    const capabilityRequest = {
      ...request,
      target: sessionTarget,
      generationPreferences:
        request.generationPreferences ?? activeContext(request)?.generationPreferences,
    };
    const generation = buildResumeGeneration(
      capabilityRequest,
      built.profile,
      built.evidence,
      targetOpportunity,
    );
    const conversation = conversationFor(
      request,
      built,
      "resume_generation",
      "generate_resume",
      "resume_generation",
      "resume_generation",
      `I generated a ${generation.documentType.replaceAll("_", " ")} for the target. Every applicant statement is linked to confirmed evidence; missing facts remain questions, placeholders, or omissions.`,
      [
        "Review the evidence-linked sections and placeholders.",
        "Answer any focused follow-up question before finalizing the document.",
        "Confirm every fact and target instruction before submission.",
      ],
      targetOpportunity?.id,
      {
        requiredAction: "review_generated_document",
        target: sessionTarget,
        generationPreferences: capabilityRequest.generationPreferences,
        stage: "generation_complete",
      },
    );
    return emptyResponse(
      request,
      conversation,
      { resumeGeneration: generation },
      built.filters,
    );
  }

  if (
    operation === "benchmark" ||
    operation === "optimize" ||
    intent === "resume_benchmark" ||
    intent === "resume_optimization"
  ) {
    const recommendationRequest = toRecommendationRequest(
      request,
      built.profile,
      built.filters,
    );
    const targetOpportunity = await findTargetOpportunity(
      request,
      recommendationRequest,
    );
    const sessionTarget = targetForSession(request.target, targetOpportunity);

    if (!hasUsableTarget(sessionTarget, targetOpportunity)) {
      const message = request.target?.url
        ? "I could not resolve that URL to a verified Trakr opportunity. Paste the target description or requirements so I can benchmark against stable evidence."
        : "Provide the target opportunity, role, description, or requirements. Resume benchmarking is target-specific and does not produce a universal score.";
      const conversation = conversationFor(
        request,
        built,
        intent,
        operation,
        "resume_benchmarking_optimization",
        "needs_more_information",
        message,
        [message],
        targetOpportunity?.id,
        {
          requiredAction: "provide_target_details",
          target: sessionTarget,
          stage: "collecting_target",
        },
      );
      return emptyResponse(request, conversation, undefined, built.filters);
    }

    if (!hasResumeEvidence(built.profile, request.resumeText)) {
      const message =
        "Provide a resume/CV or verified background evidence such as education, projects, work, publications, portfolio links, or certifications. I will not invent experience or missing history.";
      const conversation = conversationFor(
        request,
        built,
        intent,
        operation,
        "resume_benchmarking_optimization",
        "needs_more_information",
        message,
        [message],
        targetOpportunity?.id,
        {
          requiredAction: "provide_resume_or_verified_background",
          target: sessionTarget,
          stage: "collecting_evidence",
        },
      );
      return emptyResponse(request, conversation, undefined, built.filters);
    }

    const capabilityRequest = { ...request, target: sessionTarget };
    const benchmark = buildResumeBenchmark(
      capabilityRequest,
      built.profile,
      built.evidence,
      targetOpportunity,
    );
    const benchmarkReference = buildBenchmarkReference(
      benchmark,
      sessionTarget,
      built.profile,
    );
    const requestedOptimization =
      operation === "optimize" || intent === "resume_optimization";
    const compatibleBenchmark = isBenchmarkCompatible(
      activeContext(request)?.lastBenchmark,
      sessionTarget,
      built.profile,
    );

    if (requestedOptimization && compatibleBenchmark) {
      const optimization = buildResumeOptimization(
        capabilityRequest,
        built.profile,
        built.evidence,
        targetOpportunity,
      );
      const conversation = conversationFor(
        request,
        built,
        "resume_optimization",
        "optimize",
        "resume_benchmarking_optimization",
        "resume_optimization",
        "I created a target-specific optimization plan from the compatible benchmark. Every rewrite is tied to supplied evidence and still requires the user's factual confirmation.",
        [
          "Review prioritized changes and supported section rewrites.",
          "Confirm every rewritten claim before using it.",
        ],
        targetOpportunity?.id,
        {
          requiredAction: "review_optimization",
          target: sessionTarget,
          lastBenchmark: benchmarkReference,
          stage: "optimization_complete",
        },
      );
      return emptyResponse(
        request,
        conversation,
        { resumeOptimization: optimization },
        built.filters,
      );
    }

    const conversation = conversationFor(
      request,
      built,
      "resume_benchmark",
      requestedOptimization ? "optimize" : "benchmark",
      "resume_benchmarking_optimization",
      "resume_benchmark",
      requestedOptimization
        ? "Benchmarking comes first. I completed the diagnostic and preserved it in this session; review it, then continue with optimization."
        : "I completed a target-specific diagnostic benchmark. Scores are explained heuristics, not hiring predictions or a universal ATS score.",
      requestedOptimization
        ? [
            "Review eligibility, requirement evidence, gaps, and priority actions.",
            "Continue with optimize using the returned continuation reference.",
          ]
        : [
            "Review eligibility, requirement evidence, gaps, and priority actions.",
            "Offer optimization only after the user reviews this diagnostic.",
          ],
      targetOpportunity?.id,
      {
        requiredAction: requestedOptimization
          ? "review_benchmark_before_optimization"
          : "review_benchmark",
        target: sessionTarget,
        lastBenchmark: benchmarkReference,
        stage: "benchmark_complete",
      },
    );
    return emptyResponse(
      request,
      conversation,
      { resumeBenchmark: benchmark },
      built.filters,
    );
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
  if (!targetOpportunity) {
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
