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
  confirmProfileEvidence,
} from "@/lib/profile/conversation";
import { buildRecommendationNarrative } from "@/lib/recommendation/action-plan";
import { scoreOpportunity } from "@/lib/recommendation/scoring";
import { generateRecommendations } from "@/lib/recommendation/service";
import {
  assertRenderableEvidence,
  createResumeArtifacts,
  optimizationDocument,
} from "@/lib/artifacts/render-resume";
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
  CompanionChoice,
  RequiredInput,
  DownloadableArtifact,
} from "@/lib/types/opportunities";
import { TRAKR_SERVICE_VERSION } from "@/lib/version";

const SERVICE_VERSION = TRAKR_SERVICE_VERSION;

function serviceForOperation(operation: ServiceOperation): UserFacingService {
  if (operation === "benchmark" || operation === "optimize") {
    return "resume_benchmarking_optimization";
  }
  if (operation === "generate_resume") {
    return "resume_generation";
  }
  return "opportunity_finding";
}

function serviceForSelectedValue(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (/^(1|discover|opportunity finding|find opportunities?)$/.test(normalized)) {
    return "opportunity_finding" as const;
  }
  if (
    /^(2|benchmark|optimi[sz]e|resume benchmarking(?: & optimization)?|resume benchmarking and optimization)$/.test(
      normalized,
    )
  ) {
    return "resume_benchmarking_optimization" as const;
  }
  if (/^(3|generate_resume|resume generation|generate a resume)$/.test(normalized)) {
    return "resume_generation" as const;
  }
}

function operationForService(service: UserFacingService) {
  if (service === "opportunity_finding") return "discover" as const;
  if (service === "resume_benchmarking_optimization") return "benchmark" as const;
  return "generate_resume" as const;
}

function serviceChoices(): CompanionChoice[] {
  return [
    {
      id: "opportunity_finding",
      value: "discover",
      number: 1,
      label: "Find opportunities",
      description: "Find current opportunities that fit your goals and constraints.",
    },
    {
      id: "resume_benchmarking_optimization",
      value: "benchmark",
      number: 2,
      label: "Resume Benchmarking & Optimization",
      description: "Compare your evidence with a specific target before rewriting.",
    },
    {
      id: "resume_generation",
      value: "generate_resume",
      number: 3,
      label: "Resume Generation",
      description: "Create a truthful, target-specific document from verified facts.",
    },
  ];
}

function requiredInput(
  input: Omit<RequiredInput, "required"> & { required?: boolean },
): RequiredInput {
  return { required: true, ...input };
}

function menuMessage(title: string, choices: CompanionChoice[]) {
  return [title, ...choices.map((choice) => `${choice.number}. ${choice.label}`)].join("\n");
}

function serviceSelectionFromRequest(request: OpportunityCompanionRequest) {
  const context = activeContext(request);
  const contextService = context?.service;
  if (contextService) return contextService;
  if (request.operation === "start") return undefined;
  if (request.operation !== "auto") return serviceForOperation(request.operation);
  return serviceForSelectedValue(request.message);
}

function isColdStartRequest(request: OpportunityCompanionRequest) {
  const message = request.message?.trim() ?? "";
  if (request.context || request.continuation || request.user || request.profile || request.resumeText || request.target || request.document) {
    return false;
  }
  if (request.operation === "start") return true;
  if (request.operation !== "auto") return false;
  if (!message) return true;
  if (serviceForSelectedValue(message) && !/^[1-3]$/.test(message)) {
    return false;
  }
  if (isServiceDeclarationOnly(message)) return true;
  if (detectIntent(request) !== "auto") return false;
  return /^(start|show (available )?services?|show me the services?|i want to use trakr|i(?:'d| would) like to use the service|please use .*endpoint|use the service provided by agent)/i.test(message)
    || serviceInvocation(message)
    || request.operation === "auto";
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
  if (
    /\b(find|show|search|recommend|match)\b.*\b(opportunit|job|internship|scholarship|fellowship|grant|hackathon|bount)/.test(
      message,
    ) ||
    /\b(i want|i need|looking for|seeking)\b.*\b(opportunit|job|internship|scholarship|fellowship|grant|hackathon|bount)/.test(
      message,
    )
  ) {
    return "opportunity_matching";
  }
  if (
    request.operation === "discover" ||
    activeContext(request)?.service === "opportunity_finding" ||
    activeContext(request)?.operation === "discover"
  ) {
    return "opportunity_matching";
  }
  return "auto";
}

function operationForRequest(
  request: OpportunityCompanionRequest,
  intent: CompanionIntent,
): ServiceOperation {
  const context = activeContext(request);
  if (request.operation === "start") return "start";
  if (request.operation !== "auto") {
    return request.operation;
  }
  if (context?.stage === "choose_service") {
    const selected = serviceForSelectedValue(request.message);
    return selected ? operationForService(selected) : "start";
  }
  const selectedService = serviceForSelectedValue(request.message);
  if (selectedService && !/^\s*[1-3]\s*$/.test(request.message ?? "")) {
    return operationForService(selectedService);
  }
  if (
    context?.stage === "optimize_confirmation" &&
    /^(yes|y|1|optimize|continue|proceed)\b/i.test(request.message?.trim() ?? "")
  ) {
    return "optimize";
  }
  if (intent === "resume_benchmark") return "benchmark";
  if (intent === "resume_optimization") return "optimize";
  if (intent === "resume_generation") return "generate_resume";
  if (intent === "opportunity_matching" || intent === "profile_build") {
    return "discover";
  }
  return context?.operation ?? "start";
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
      profile.contactEmail ||
      profile.contactPhone ||
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

function isStageControlMessage(request: OpportunityCompanionRequest) {
  const stage = activeContext(request)?.stage;
  const message = request.message?.trim() ?? "";
  if (!stage || !message) return false;
  if (stage === "choose_service") {
    return Boolean(serviceForSelectedValue(message)) || /^\d+$/.test(message);
  }
  if (stage === "discover_choose_input") {
    return Boolean(profileSourceChoice(message)) || /^\d+$/.test(message);
  }
  if (stage === "optimize_confirmation") {
    return /^(yes|y|no|n|1|2|optimize|continue|proceed|finish|stop|not now)\b/i.test(
      message,
    );
  }
  return false;
}

function serviceInvocation(message: string | undefined) {
  return /\b(agent\s*#?\s*5198|opportunity matching api|service type|a2mcp|public service endpoint|use the service)\b/i.test(
    message ?? "",
  );
}

function isServiceDeclarationOnly(message: string | undefined) {
  const value = message?.trim() ?? "";
  if (!serviceInvocation(value)) return false;
  return !(
    /\b(create|generate|build|write|draft|optimi[sz]e|rewrite|tailor|improve|benchmark|score|evaluate|review)\b.*\b(resume|cv)\b/i.test(
      value,
    ) ||
    /\b(find|show|search|recommend)\b.*\b(opportunit(?:y|ies)|job|internship|scholarship|fellowship|grant|hackathon|bount(?:y|ies))\b/i.test(
      value,
    ) ||
    /\b(looking for|seeking)\b.*\b(opportunit(?:y|ies)|job|internship|scholarship|fellowship|grant|hackathon|bount(?:y|ies))\b/i.test(
      value,
    )
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
  return false;
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
  artifacts?: DownloadableArtifact[],
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
    directOpportunities: [],
    explorePrograms: [],
    supportingResources: [],
    categoryCoverage: [],
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
    callerInstructions: {
      relayMessage: true,
      doNotInferMissingInputs: true,
      sendContinuationUnchanged: true,
      doNotGenerateAProfile: true,
      surfaceOfficialUrls: true,
    },
    conversation,
    capabilityResult,
    artifacts,
    stage: conversation.stage,
    status: conversation.status,
    message: conversation.message,
    selectedService: conversation.service,
    requiredInputs: conversation.requiredInputs,
    nextActions: conversation.nextActions,
    continuation: conversation.continuation,
  };
}

function profileOrigin(evidence: ProfileEvidence[]) {
  const origins = new Set(
    evidence
      .map((item) => item.origin)
      .filter((origin): origin is NonNullable<ProfileEvidence["origin"]> =>
        Boolean(origin),
      ),
  );
  if (!origins.size) return "none" as const;
  if (origins.size > 1) return "mixed" as const;
  const [origin] = [...origins];
  if (origin === "resume") return "resume" as const;
  if (origin === "user") return "user_message" as const;
  if (origin === "structured_profile") return "caller_structured" as const;
  if (origin === "context") return "continuation" as const;
  return "mixed" as const;
}

function profileConfirmationMessage(
  built: ReturnType<typeof buildConversationalProfile>,
) {
  const profile = built.profile;
  const extracted = [
    profile.fieldOfStudy ? `- Course or field: ${profile.fieldOfStudy}` : "",
    profile.currentDegreeLevel
      ? `- Current qualification: ${profile.currentDegreeLevel}`
      : "",
    profile.currentInstitution
      ? `- Institution: ${profile.currentInstitution}`
      : "",
    profile.experienceLevel
      ? `- Current stage: ${profile.experienceLevel}`
      : "",
    profile.location ? `- Location: ${profile.location}` : "",
    profile.skills.length
      ? `- Skills: ${profile.skills.slice(0, 8).join(", ")}`
      : "",
    profile.projects.length
      ? `- Projects: ${profile.projects.slice(0, 2).join("; ")}`
      : "",
  ].filter(Boolean);
  const missing = built.missingInformation
    .filter((item) => item.required)
    .map((item) => item.field);
  return [
    "I extracted this session profile:",
    ...extracted,
    missing.length
      ? `Missing before reliable matching: ${missing.join(", ")}.`
      : "No required profile fields are currently missing.",
    "Is this accurate? Confirm or correct it before matching.",
  ].join("\n");
}

function renderRecommendationMessage(
  response: Awaited<ReturnType<typeof generateRecommendations>>,
) {
  const lines: string[] = [];
  if (response.directOpportunities?.length) {
    lines.push("Verified direct opportunities:");
    for (const recommendation of response.directOpportunities) {
      lines.push(
        [
          `${recommendation.rank}. ${recommendation.opportunity.title}`,
          `Type: ${recommendation.opportunity.opportunityType ?? recommendation.opportunity.category}`,
          `Status: ${recommendation.recommendationState === "apply_now" ? "Apply Now" : "Explore"}`,
          `Deadline: ${recommendation.deadline ?? recommendation.deadlineStatus?.replaceAll("_", " ") ?? "requires confirmation"}`,
          `Eligibility: ${recommendation.eligibilitySummary ?? "Requires confirmation on the official page."}`,
          `Location: ${recommendation.geographicEligibility ?? "Geographic eligibility requires confirmation."}`,
          `Why it matches: ${recommendation.reasoning}`,
          `Official page: ${recommendation.officialUrl ?? recommendation.opportunity.canonicalUrl}`,
        ].join("\n"),
      );
    }
  } else {
    lines.push(
      "I found no verified direct matches in Trakr's current inventory for the supplied profile and constraints.",
    );
  }
  if (response.explorePrograms?.length) {
    lines.push(
      `Explore programs and official directories: ${response.explorePrograms
        .map((item) => `${item.opportunity.title} (${item.officialUrl})`)
        .join("; ")}`,
    );
  }
  if (response.supportingResources?.length) {
    lines.push(
      `Supporting resources, not application opportunities: ${response.supportingResources
        .map((item) => `${item.opportunity.title} (${item.officialUrl})`)
        .join("; ")}`,
    );
  }
  if (response.categoryCoverage?.length) {
    lines.push(
      "Coverage by requested category:",
      ...response.categoryCoverage.map(
        (item) =>
          `- ${item.category.replaceAll("_", " ")}: ${item.status}. ${item.reason}`,
      ),
    );
  }
  return lines.join("\n\n");
}

function conversationFor(
  request: OpportunityCompanionRequest,
  built: ReturnType<typeof buildConversationalProfile>,
  intent: CompanionIntent,
  operation: ServiceOperation,
  service: UserFacingService | null,
  state: CompanionConversation["state"],
  message: string,
  nextActions: string[],
  selectedOpportunityId?: string,
  options: {
    requiredAction?: string;
    choices?: Array<
      Omit<CompanionChoice, "value" | "number"> &
        Partial<Pick<CompanionChoice, "value" | "number">>
    >;
    requiredInputs?: RequiredInput[];
    status?: CompanionConversation["status"];
    profileConfirmed?: boolean;
    profileSource?: "resume" | "background" | "request";
    awaitingProfileConfirmation?: boolean;
    stage?: string;
    target?: CompanionTarget;
    lastBenchmark?: ResumeBenchmarkReference;
    optimizationApproved?: boolean;
    generationPreferences?: CompanionContext["generationPreferences"];
    clearProfileFromSession?: boolean;
  } = {},
): CompanionConversation {
  const context = activeContext(request);
  const existingDocumentReferences = context?.documentReferences ?? [];
  const suppliedDocumentReference = request.resumeText
    ? buildDocumentReference(
        request.resumeText,
        request.document?.kind ?? "resume",
        request.document?.mimeType,
      )
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
      service: service ?? context?.service,
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
      optimizationApproved:
        options.optimizationApproved ?? context?.optimizationApproved,
    },
  );
  if (options.clearProfileFromSession) {
    sessionContext.profile = undefined;
    sessionContext.profileEvidence = [];
    sessionContext.documentReferences = [];
    sessionContext.lastBenchmark = undefined;
    sessionContext.optimizationApproved = undefined;
  }

  return {
    state,
    intent,
    service,
    operation,
    profileSource: options.profileSource ?? built.profileSource,
    stage: options.stage ?? state,
    status:
      options.status ??
      (state === "recommendations" ||
      state === "resume_optimization" ||
      state === "resume_generation"
        ? "completed"
        : "needs_input"),
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
    requiredInputs: options.requiredInputs ?? [],
    choices: options.choices?.map((choice, index) => ({
      ...choice,
      value: choice.value ?? choice.id,
      number: choice.number ?? index + 1,
    })),
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
      item.source === "unknown" ||
      item.source === "inferred" ||
      item.confirmed !== true ||
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
  const selectedService = serviceSelectionFromRequest(request);
  const service =
    operation === "start"
      ? null
      : selectedService ?? serviceForOperation(operation);
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
  const built = buildConversationalProfile(
    isStageControlMessage(request)
      ? { ...request, message: undefined }
      : request,
  );
  const profileConfirmedNow = confirmedProfile(request);
  if (profileConfirmedNow) {
    built.evidence = confirmProfileEvidence(built.evidence);
  }
  if (
    activeContext(request)?.awaitingProfileConfirmation &&
    /^(no|n|incorrect|not accurate|deny|reject|start over)\b/i.test(
      request.message?.trim() ?? "",
    )
  ) {
    const clearedContext: CompanionContext = {
      profileEvidence: [],
      profileConfirmed: false,
      awaitingProfileConfirmation: false,
      unansweredQuestions: [],
      documentReferences: [],
      service: activeContext(request)?.service,
      operation: activeContext(request)?.operation,
      stage: "discover_choose_input",
      consent: activeContext(request)?.consent,
      filters: activeContext(request)?.filters,
      target: activeContext(request)?.target,
      generationPreferences: activeContext(request)?.generationPreferences,
      sessionVersion: "2",
    };
    const clearedRequest: OpportunityCompanionRequest = {
      ...request,
      user: undefined,
      profile: undefined,
      resumeText: undefined,
      message: undefined,
      context: clearedContext,
    };
    const cleared = buildConversationalProfile(clearedRequest);
    const choices = [
      {
        id: "resume",
        value: "resume",
        number: 1,
        label: "Upload a resume",
      },
      {
        id: "background",
        value: "background",
        number: 2,
        label: "Provide background information",
      },
      {
        id: "request",
        value: "request",
        number: 3,
        label: "Describe what you are looking for",
      },
    ];
    const conversation = conversationFor(
      clearedRequest,
      cleared,
      "profile_build",
      "discover",
      "opportunity_finding",
      "choose_profile_source",
      menuMessage(
        "The unconfirmed supplied profile was removed. Choose a fresh intake route:",
        choices,
      ),
      ["resume", "background", "request"],
      undefined,
      {
        requiredAction: "select_profile_source",
        choices,
        requiredInputs: [
          requiredInput({
            id: "discovery_input_method",
            type: "enum",
            prompt: "Choose a fresh intake route",
            options: choices,
          }),
        ],
        clearProfileFromSession: true,
        stage: "discover_choose_input",
      },
    );
    return emptyResponse(clearedRequest, conversation, undefined, cleared.filters);
  }
  const selectedFromServiceMenu =
    (activeContext(request)?.stage === "choose_service" &&
      Boolean(serviceForSelectedValue(request.message))) ||
    (!activeContext(request) &&
      Boolean(serviceForSelectedValue(request.message)) &&
      !/^\s*[1-3]\s*$/.test(request.message ?? ""));
  const sourceChoice = selectedFromServiceMenu
    ? undefined
    : request.intakeRoute ?? profileSourceChoice(request.message);

  if (
    isColdStartRequest(request) ||
    (activeContext(request)?.stage === "choose_service" &&
      operation === "start")
  ) {
    const choices = serviceChoices();
    const conversation = conversationFor(
      request,
      built,
      "service_selection",
      "start",
      null,
      "choose_service",
      menuMessage("Choose a service:", choices),
      ["discover", "benchmark", "generate_resume"],
      undefined,
      {
        requiredAction: "select_service",
        choices,
        requiredInputs: [
          requiredInput({
            id: "service",
            type: "enum",
            prompt: "Choose a service",
            options: choices,
          }),
        ],
        stage: "choose_service",
        status: "needs_input",
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (selectedFromServiceMenu && service === "opportunity_finding") {
    const choices: CompanionChoice[] = [
      {
        id: "resume",
        value: "resume",
        number: 1,
        label: "Upload a resume",
        description: "Provide PDF, DOCX, TXT, extracted text, or a secure document reference.",
      },
      {
        id: "background",
        value: "background",
        number: 2,
        label: "Provide background information",
        description: "Describe your goals, evidence, location, and constraints naturally.",
      },
    ];
    const conversation = conversationFor(
      request,
      built,
      "profile_build",
      "discover",
      service,
      "choose_profile_source",
      menuMessage("Choose how you would like to provide your information:", choices),
      ["resume", "background"],
      undefined,
      {
        requiredAction: "select_profile_source",
        choices,
        requiredInputs: [
          requiredInput({
            id: "discovery_input_method",
            type: "enum",
            prompt: "Choose how to provide your information",
            options: choices,
          }),
        ],
        stage: "discover_choose_input",
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (
    activeContext(request)?.stage === "optimize_confirmation" &&
    /^(no|n|2|finish|stop|not now)\b/i.test(request.message?.trim() ?? "")
  ) {
    const conversation = conversationFor(
      request,
      built,
      "resume_benchmark",
      "benchmark",
      "resume_benchmarking_optimization",
      "resume_benchmark",
      "The benchmark remains available in this trusted session. Optimization was not performed.",
      ["finish", "optimize"],
      activeContext(request)?.selectedOpportunityId,
      {
        requiredAction: "benchmark_complete",
        target: request.target ?? activeContext(request)?.target,
        lastBenchmark: activeContext(request)?.lastBenchmark,
        optimizationApproved: false,
        stage: "benchmark_completed",
        status: "completed",
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (
    selectedFromServiceMenu &&
    service === "resume_benchmarking_optimization"
  ) {
    const prompt =
      "Please provide your resume or CV and the target job or opportunity. Include the pasted description, published requirements, or a supported Trakr opportunity URL. Benchmarking comes before optimization.";
    const conversation = conversationFor(
      request,
      built,
      "resume_benchmark",
      "benchmark",
      service,
      "needs_more_information",
      prompt,
      ["benchmark"],
      undefined,
      {
        requiredAction: "provide_resume_and_target",
        requiredInputs: [
          requiredInput({
            id: "resume",
            type: "document",
            prompt: "Provide the existing resume or CV with session-only processing consent.",
            acceptedRepresentations: [
              "document.base64",
              "document.text",
              "resumeText",
              "multipart:/api/a2mcp/recommend",
              "multipart:/api/profile/parse-resume",
            ],
            acceptedMimeTypes: [
              "application/pdf",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "text/plain",
            ],
            maxBytes: 2_500_000,
          }),
          requiredInput({
            id: "target",
            type: "object",
            prompt:
              "Provide the target description, requirements, or a supported Trakr opportunity URL.",
            fields: [
              "target.role",
              "target.description",
              "target.requirements",
              "target.url",
            ],
          }),
          requiredInput({
            id: "consent",
            type: "boolean",
            prompt: "Consent to session-only processing of the supplied document.",
          }),
        ],
        stage: "benchmark_awaiting_resume_and_target",
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (selectedFromServiceMenu && service === "resume_generation") {
    const prompt =
      "Provide the purpose and target for the document, then share the verified facts you want included. A natural-language answer is welcome; include only facts you can confirm.";
    const conversation = conversationFor(
      request,
      built,
      "resume_generation",
      "generate_resume",
      service,
      "needs_more_information",
      prompt,
      ["generate_resume"],
      undefined,
      {
        requiredAction: "provide_generation_target_and_facts",
        requiredInputs: [
          requiredInput({
            id: "generation_target",
            type: "object",
            prompt: "Provide the document purpose, target role or opportunity, and requirements where available.",
            fields: [
              "target.role",
              "target.description",
              "target.requirements",
              "target.url",
              "target.locale",
            ],
          }),
          requiredInput({
            id: "verified_facts",
            type: "object",
            prompt: "Provide verified applicant facts in one natural-language message or a structured profile.",
            fields: [
              "name",
              "contact details",
              "location",
              "education",
              "work history",
              "projects",
              "skills",
              "achievements",
              "certifications",
              "volunteering",
              "leadership",
              "research",
              "publications",
              "portfolio links",
            ],
          }),
          requiredInput({
            id: "output_preferences",
            type: "object",
            required: false,
            prompt: "Optionally provide locale, document type, page limit, and output preferences.",
            fields: [
              "generationPreferences.documentType",
              "generationPreferences.locale",
              "generationPreferences.pageLimit",
              "generationPreferences.instructions",
            ],
          }),
        ],
        stage: "generate_awaiting_information",
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  const requiresProfileConfirmation =
    !profileConfirmedNow &&
    !activeContext(request)?.profileConfirmed &&
    !request.resumeText &&
    !request.document &&
    !request.target &&
    request.intakeRoute !== "target" &&
    request.intakeRoute !== "generate" &&
    operation !== "benchmark" &&
    operation !== "optimize" &&
    operation !== "generate" &&
    operation !== "generate_resume" &&
    service !== "resume_generation" &&
    service !== "resume_benchmarking" &&
    built.evidence.some((item) => item.origin === "structured_profile") &&
    !built.evidence.some(
      (item) => item.origin === "user" || item.origin === "resume",
    );
  if (requiresProfileConfirmation) {
    const suppliedByCaller = built.evidence.some(
      (item) => item.origin === "structured_profile",
    );
    const conversation = conversationFor(
      request,
      built,
      "profile_build",
      operation,
      service,
      "profile_confirmation",
      suppliedByCaller
        ? [
            "The calling agent supplied this unconfirmed profile.",
            profileConfirmationMessage(built),
            "Trakr will not use these facts until the user confirms or explicitly corrects them.",
          ].join("\n")
        : profileConfirmationMessage(built),
      [
        "Relay the extracted profile to the user without adding facts.",
        "Submit the user's confirmation or corrections with the continuation unchanged.",
      ],
      undefined,
      {
        requiredAction: "review_profile",
        requiredInputs: [
          requiredInput({
            id: "profile_confirmation",
            type: "boolean",
            prompt:
              "Confirm whether the extracted or caller-supplied profile is accurate.",
          }),
          requiredInput({
            id: "profile_corrections",
            type: "object",
            required: false,
            prompt: "Provide corrections to any inaccurate profile fields.",
            fields: built.evidence.map((item) => item.field),
          }),
        ],
        profileConfirmed: false,
        awaitingProfileConfirmation: true,
        profileSource: built.profileSource,
        stage: "profile_confirmation",
      },
    );
    return emptyResponse(request, conversation, undefined, built.filters);
  }

  if (
    operation === "generate_resume" ||
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
          requiredInputs: [
            requiredInput({
              id: "generation_target",
              type: "object",
              prompt:
                "Provide the target role, program, requirements, description, or verified Trakr opportunity.",
              fields: [
                "target.role",
                "target.description",
                "target.requirements",
                "target.url",
                "target.locale",
              ],
            }),
          ],
          target: sessionTarget,
          generationPreferences: request.generationPreferences,
          stage: "generate_missing_information",
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
          requiredInputs: [
            requiredInput({
              id: "verified_facts",
              type: "object",
              prompt:
                "Provide verified education, experience, project, research, volunteer, leadership, or achievement evidence.",
              fields: [
                "name",
                "contact details",
                "location",
                "education",
                "workHistory",
                "projects",
                "skills",
                "achievements",
                "certifications",
                "volunteerExperience",
                "leadership",
                "research",
                "publications",
                "links",
              ],
            }),
          ],
          target: sessionTarget,
          generationPreferences: request.generationPreferences,
          stage: "generate_missing_information",
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
    assertRenderableEvidence(generation, built.evidence);
    const artifacts = await createResumeArtifacts({
      document: generation,
      regenerateAction: "generate_resume",
      suffix: "generated-resume",
    });
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
        stage: "generate_completed",
        status: "completed",
      },
    );
    return emptyResponse(
      request,
      conversation,
      { resumeGeneration: generation },
      built.filters,
      artifacts,
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
          requiredInputs: [
            requiredInput({
              id: "target",
              type: "object",
              prompt:
                "Provide the target role, description, requirements, or a supported Trakr opportunity URL.",
              fields: [
                "target.role",
                "target.description",
                "target.requirements",
                "target.url",
              ],
            }),
          ],
          target: sessionTarget,
          stage: "benchmark_missing_information",
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
          requiredInputs: [
            requiredInput({
              id: "resume_or_background",
              type: "document",
              prompt:
                "Provide the resume/CV or structured verified background with session-only processing consent.",
              acceptedRepresentations: [
                "document.base64",
                "document.text",
                "resumeText",
                "multipart:/api/a2mcp/recommend",
                "multipart:/api/profile/parse-resume",
                "structured_profile",
              ],
              acceptedMimeTypes: [
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "text/plain",
              ],
              maxBytes: 2_500_000,
            }),
          ],
          target: sessionTarget,
          stage: "benchmark_missing_information",
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
      const generated = buildResumeGeneration(
        capabilityRequest,
        built.profile,
        built.evidence,
        targetOpportunity,
      );
      const optimizedDocument = optimizationDocument(
        generated,
        optimization.sectionRewrites,
      );
      assertRenderableEvidence(optimizedDocument, built.evidence);
      const artifacts = await createResumeArtifacts({
        document: optimizedDocument,
        regenerateAction: "optimize",
        suffix: "optimized-resume",
      });
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
          optimizationApproved: true,
          stage: "optimize_completed",
          status: "completed",
        },
      );
      return emptyResponse(
        request,
        conversation,
        {
          resumeOptimization: optimization,
          resumeGeneration: generated,
        },
        built.filters,
        artifacts,
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
            "Choose whether to optimize using only confirmed information.",
          ]
        : [
            "Review eligibility, requirement evidence, gaps, and priority actions.",
            "Choose whether to optimize using only confirmed information.",
          ],
      targetOpportunity?.id,
      {
        requiredAction: "confirm_optimization",
        requiredInputs: [
          requiredInput({
            id: "optimize_confirmation",
            type: "boolean",
            prompt:
              "Would you like Trakr to optimize the resume using only confirmed information?",
          }),
        ],
        target: sessionTarget,
        lastBenchmark: benchmarkReference,
        optimizationApproved: false,
        stage: "optimize_confirmation",
        status: "needs_input",
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
            value: "resume",
            number: 1,
            label: "Use my resume or CV",
            description: "Extract a session profile from supplied document text.",
          },
          {
            id: "background",
            value: "background",
            number: 2,
            label: "Tell Trakr about my background",
            description: "Describe relevant facts in natural language.",
          },
          {
            id: "request",
            value: "request",
            number: 3,
            label: "Describe what I am looking for",
            description: "Start with your goal and add only important missing details.",
          },
        ],
        requiredInputs: [
          requiredInput({
            id: "discovery_input_method",
            type: "enum",
            prompt: "Choose how to provide your information",
            options: [
              {
                id: "resume",
                value: "resume",
                number: 1,
                label: "Use my resume or CV",
                description: "Extract a session profile from supplied document text.",
              },
              {
                id: "background",
                value: "background",
                number: 2,
                label: "Tell Trakr about my background",
                description: "Describe relevant facts in natural language.",
              },
              {
                id: "request",
                value: "request",
                number: 3,
                label: "Describe what I am looking for",
                description: "Start with your goal and add only important missing details.",
              },
            ],
          }),
        ],
        stage: "discover_choose_input",
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
        requiredInputs: [
          requiredInput({
            id: "resume",
            type: "document",
            prompt: "Kindly upload your resume or provide its extracted text.",
            acceptedRepresentations: [
              "document.base64",
              "document.text",
              "resumeText",
              "multipart:/api/a2mcp/recommend",
              "multipart:/api/profile/parse-resume",
            ],
            acceptedMimeTypes: [
              "application/pdf",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "text/plain",
            ],
            maxBytes: 2_500_000,
          }),
          requiredInput({
            id: "consent",
            type: "boolean",
            prompt: "Consent to session-only resume processing.",
          }),
        ],
        profileSource: "resume",
        stage: "discover_awaiting_resume",
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
        requiredInputs: [
          requiredInput({
            id: "background",
            type: "object",
            prompt:
              "Provide opportunity types, interests, education or career stage, skills and evidence, experience level, location, work authorization constraints, and remote or onsite preferences.",
            fields: [
              "opportunity types",
              "roles or subjects",
              "education or employment stage",
              "skills",
              "projects or experience",
              "experience level",
              "country or location",
              "remote, hybrid, or onsite preference",
              "eligible regions",
              "work authorization constraints",
              "optional deadline, stipend, salary, or duration preferences",
            ],
          }),
        ],
        profileSource: "background",
        stage: "discover_awaiting_background",
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
        requiredInputs: [
          requiredInput({
            id: "opportunity_request",
            type: "text",
            prompt:
              "Describe the desired opportunity, field, location or remote preference, experience stage, and relevant skills.",
          }),
        ],
        profileSource: "request",
        stage: "discover_awaiting_background",
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
        requiredInputs: built.missingInformation
          .filter((item) => item.required)
          .map((item) =>
            requiredInput({
              id: item.field,
              type: "text",
              prompt: item.question,
            }),
          ),
        profileSource: sourceChoice ?? built.profileSource,
        stage:
          service === "opportunity_finding"
            ? "discover_missing_information"
            : service === "resume_benchmarking_optimization"
              ? "benchmark_missing_information"
              : "generate_missing_information",
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
    const conversation = conversationFor(
      request,
      built,
      intent,
      "discover",
      "opportunity_finding",
      "recommendations",
      renderRecommendationMessage(response),
      [
        "Present the ranked recommendations and coverage report.",
        "Offer to explain a recommendation or assess readiness.",
      ],
      selectedOpportunityId,
      {
        stage: "discover_completed",
        status: "completed",
      },
    );
    return {
      ...response,
      operation: "discover",
      conversation,
      stage: conversation.stage,
      status: conversation.status,
      message: conversation.message,
      selectedService: conversation.service,
      requiredInputs: conversation.requiredInputs,
      nextActions: conversation.nextActions,
      continuation: conversation.continuation,
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
