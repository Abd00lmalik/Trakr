import { z } from "zod";

export const opportunityCategorySchema = z.enum([
  "hackathon",
  "grant",
  "scholarship",
  "fellowship",
  "internship",
  "remote_job",
  "web3_bounty",
]);

export const recommendationActionSchema = z.enum([
  "Apply Now",
  "Prepare First",
  "Skip",
]);

export const companionGuidanceActionSchema = z.enum([
  "apply_now",
  "prepare_first",
  "explore",
  "not_currently_recommended",
]);

export const verificationStatusSchema = z.enum([
  "verified",
  "program_directory",
  "inactive_listing",
  "unverified",
]);

export const sourceStatusSchema = z.enum([
  "active",
  "redirected",
  "blocked",
  "unreachable",
  "inactive",
  "stale",
  "unverified",
]);

export const aiStatusSchema = z.enum([
  "enhanced",
  "retrying",
  "degraded",
  "fallback",
]);

export const experienceLevelSchema = z.enum([
  "student",
  "beginner",
  "early-career",
  "mid-level",
  "senior",
  "founder",
  "creator",
]);

export const structuredUserProfileSchema = z.object({
  name: z.string().optional(),
  headline: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
  experienceLevel: experienceLevelSchema.optional(),
  skills: z.array(z.string().min(1)).default([]),
  interests: z.array(z.string().min(1)).default([]),
  goals: z.array(z.string().min(1)).default([]),
  education: z.array(z.string()).default([]),
  workHistory: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  links: z.array(z.string().url()).default([]),
});

export const profileEvidenceSourceSchema = z.enum([
  "explicit",
  "inferred",
  "unknown",
]);

export const profileEvidenceSchema = z.object({
  claimId: z.string().optional(),
  field: z.string(),
  source: profileEvidenceSourceSchema,
  value: z.union([z.string(), z.array(z.string())]).optional(),
  evidence: z.string().optional(),
  origin: z
    .enum(["user", "resume", "context", "structured_profile", "inference"])
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
  confirmed: z.boolean().optional(),
  allowedUse: z
    .array(z.enum(["matching", "assessment", "optimization", "generation"]))
    .optional(),
});

export const recommendationFiltersSchema = z.object({
  categories: z.array(opportunityCategorySchema).optional(),
  location: z.string().optional(),
  remote: z.boolean().optional(),
  deadlineAfter: z.string().date().optional(),
  deadlineBefore: z.string().date().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const recommendationRequestSchema = z
  .object({
    user: structuredUserProfileSchema.optional(),
    resumeText: z.string().min(80).max(40000).optional(),
    goals: z.array(z.string().min(1)).optional(),
    interests: z.array(z.string().min(1)).optional(),
    filters: recommendationFiltersSchema.default({}),
    requestId: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.user && !value.resumeText) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either a structured user profile or resumeText.",
        path: ["user"],
      });
    }
  });

export const companionIntentSchema = z.enum([
  "auto",
  "profile_build",
  "opportunity_matching",
  "explain_recommendation",
  "readiness_assessment",
  "resume_benchmark",
  "resume_optimization",
  "resume_generation",
]);

export const serviceOperationSchema = z.enum([
  "auto",
  "discover",
  "benchmark",
  "optimize",
  "generate_resume",
]);

export const userFacingServiceSchema = z.enum([
  "opportunity_finding",
  "resume_benchmarking_optimization",
  "resume_generation",
]);

export const opportunityIntakeRouteSchema = z.enum([
  "resume",
  "background",
  "request",
]);

export const consentSchema = z.object({
  processPersonalData: z.boolean(),
  retention: z.literal("session_only").default("session_only"),
  source: z.enum(["explicit", "implicit_legacy"]).default("explicit"),
});

export const documentReferenceSchema = z.object({
  id: z.string().min(8).max(160),
  kind: z.enum(["resume", "cv", "background"]),
  contentType: z.string().max(160).optional(),
  receivedAt: z.string().datetime(),
  retention: z.literal("session_only"),
});

export const companionContextSchema = z.object({
  profile: structuredUserProfileSchema.optional(),
  profileEvidence: z.array(profileEvidenceSchema).max(80).default([]),
  selectedOpportunityId: z.string().min(1).max(240).optional(),
  profileConfirmed: z.boolean().default(false),
  profileSource: opportunityIntakeRouteSchema.optional(),
  awaitingProfileConfirmation: z.boolean().optional(),
  service: userFacingServiceSchema.optional(),
  operation: serviceOperationSchema.optional(),
  stage: z.string().min(1).max(120).optional(),
  unansweredQuestions: z.array(z.string().max(500)).max(12).default([]),
  documentReferences: z.array(documentReferenceSchema).max(8).default([]),
  consent: consentSchema.optional(),
  filters: recommendationFiltersSchema.optional(),
  sessionVersion: z.enum(["1", "2"]).optional(),
});

export const companionSessionReferenceSchema = z.object({
  token: z.string().min(40).max(24000),
  expiresAt: z.string().datetime(),
  sessionVersion: z.literal("2"),
});

export const companionContinuationInputSchema = z.union([
  companionSessionReferenceSchema,
  z.string().min(40).max(24000),
  companionContextSchema,
]);

export const companionTargetSchema = z.object({
  opportunityId: z.string().min(1).max(240).optional(),
  opportunityTitle: z.string().min(2).max(300).optional(),
  role: z.string().min(2).max(200).optional(),
  industry: z.string().min(2).max(200).optional(),
});

export const opportunityCompanionRequestSchema = z
  .object({
    user: structuredUserProfileSchema.optional(),
    profile: structuredUserProfileSchema.optional(),
    resumeText: z.string().min(80).max(40000).optional(),
    goals: z.array(z.string().min(1)).optional(),
    interests: z.array(z.string().min(1)).optional(),
    filters: recommendationFiltersSchema.default({}),
    requestId: z.string().optional(),
    message: z.string().min(1).max(6000).optional(),
    intent: companionIntentSchema.default("auto"),
    operation: serviceOperationSchema.default("auto"),
    intakeRoute: opportunityIntakeRouteSchema.optional(),
    consent: consentSchema.optional(),
    context: companionContinuationInputSchema.optional(),
    continuation: companionContinuationInputSchema.optional(),
    target: companionTargetSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasFilters = Object.keys(value.filters).length > 0;
    if (
      !value.user &&
      !value.profile &&
      !value.resumeText &&
      !value.message &&
      !value.context &&
      !value.continuation &&
      value.operation === "auto" &&
      hasFilters
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide a structured profile, resumeText, conversational message, or continuation context.",
        path: ["message"],
      });
    }
  });

export const opportunitySchema = z.object({
  id: z.string(),
  title: z.string(),
  organization: z.string(),
  category: opportunityCategorySchema,
  summary: z.string(),
  sourceName: z.string(),
  sourceUrl: z.string().url(),
  location: z.string(),
  remote: z.boolean(),
  deadline: z.string().date().nullable(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  eligibility: z.array(z.string()),
  benefits: z.array(z.string()),
  tags: z.array(z.string()),
  difficulty: z.enum(["low", "medium", "high"]),
  verificationStatus: verificationStatusSchema,
  lastVerifiedAt: z.string().datetime().nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  sourceStatus: sourceStatusSchema,
  httpStatus: z.number().int().min(100).max(599).nullable(),
  canonicalUrl: z.string().url(),
  publisherDomain: z.string(),
  isActive: z.boolean(),
  verificationConfidence: z.number().min(0).max(1),
});

export const scoredOpportunitySchema = z.object({
  opportunity: opportunitySchema,
  score: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  relevanceScore: z.number().min(0).max(100),
  matchedSignals: z.array(z.string()),
  missingRequirements: z.array(z.string()),
  action: recommendationActionSchema,
  hardMismatch: z.boolean().optional(),
  mismatchReasons: z.array(z.string()).optional(),
});

export const recommendationSchema = z.object({
  rank: z.number().int().positive(),
  opportunity: opportunitySchema,
  matchScore: z.number().min(0).max(100),
  reasoning: z.string(),
  missingRequirements: z.array(z.string()),
  recommendedAction: recommendationActionSchema,
  nextSteps: z.array(z.string()),
  confidenceScore: z.number().min(0).max(100).optional(),
  guidanceAction: companionGuidanceActionSchema.optional(),
  eligibilityConcerns: z.array(z.string()).optional(),
  provenance: z
    .object({
      canonicalUrl: z.string().url(),
      sourceName: z.string(),
      publisherDomain: z.string(),
      verificationStatus: verificationStatusSchema,
      sourceStatus: sourceStatusSchema,
      lastVerifiedAt: z.string().datetime().nullable(),
      freshness: z.enum(["fresh", "aging", "unknown"]),
      deadlineConfidence: z.enum(["high", "medium", "rolling_or_unknown"]),
      eligibilityConfidence: z.enum([
        "high",
        "needs_confirmation",
        "unknown",
      ]),
    })
    .optional(),
});

export const actionPlanSchema = z.object({
  immediate: z.array(z.string()),
  sevenDayPlan: z.array(z.string()),
  thirtyDayPlan: z.array(z.string()),
});

export const learningRoadmapSchema = z.object({
  focusAreas: z.array(z.string()),
  resourcesToFind: z.array(z.string()),
  practiceProjects: z.array(z.string()),
});

export const recommendationResponseSchema = z.object({
  service: z.literal("trakr"),
  version: z.string(),
  requestId: z.string(),
  generatedAt: z.string().datetime(),
  provider: z.string(),
  aiStatus: aiStatusSchema,
  querySummary: z.object({
    profileSignals: z.array(z.string()),
    filtersApplied: recommendationFiltersSchema,
    totalCandidates: z.number().int().nonnegative(),
  }),
  recommendations: z.array(recommendationSchema),
  actionPlan: actionPlanSchema,
  learningRoadmap: learningRoadmapSchema,
  agentNotes: z.array(z.string()),
  operation: serviceOperationSchema.optional(),
  coverage: z
    .object({
      requestedInterests: z.array(z.string()),
      interests: z.array(
        z.object({
          interest: z.string(),
          status: z.enum(["covered", "limited", "no_qualified_matches"]),
          resultCount: z.number().int().nonnegative(),
          qualifyingCandidateCount: z.number().int().nonnegative(),
          explanation: z.string(),
        }),
      ),
      sourceCount: z.number().int().nonnegative(),
      opportunityTypeCount: z.number().int().nonnegative(),
      notes: z.array(z.string()),
    })
    .optional(),
});

export const companionStateSchema = z.enum([
  "choose_service",
  "service_pending",
  "consent_required",
  "choose_profile_source",
  "collecting_request",
  "awaiting_resume",
  "collecting_background",
  "needs_more_information",
  "profile_confirmation",
  "ready_to_recommend",
  "recommendations",
  "explanation",
  "readiness",
  "resume_benchmark",
  "resume_optimization",
]);

export const companionProfileSchema = z.object({
  draft: structuredUserProfileSchema,
  evidence: z.array(profileEvidenceSchema),
  unknownFields: z.array(z.string()),
  completenessScore: z.number().min(0).max(100),
  confirmed: z.boolean(),
});

export const companionConversationSchema = z.object({
  state: companionStateSchema,
  intent: companionIntentSchema,
  service: userFacingServiceSchema,
  operation: serviceOperationSchema,
  profileSource: opportunityIntakeRouteSchema.optional(),
  stage: z.string(),
  message: z.string(),
  profile: companionProfileSchema,
  missingInformation: z.array(
    z.object({
      field: z.string(),
      question: z.string(),
      required: z.boolean(),
    }),
  ),
  nextActions: z.array(z.string()),
  continuation: companionSessionReferenceSchema,
  requiredAction: z.string().optional(),
  choices: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

export const opportunityExplanationSchema = z.object({
  opportunityId: z.string(),
  opportunityTitle: z.string(),
  matchScore: z.number().min(0).max(100),
  confidenceScore: z.number().min(0).max(100),
  whyItMatches: z.array(z.string()),
  gaps: z.array(z.string()),
  eligibilityConcerns: z.array(z.string()),
  recommendedAction: recommendationActionSchema,
  nextSteps: z.array(z.string()),
});

export const readinessAssessmentSchema = z.object({
  opportunityId: z.string(),
  opportunityTitle: z.string(),
  readinessScore: z.number().min(0).max(100),
  readinessLevel: z.enum(["ready", "nearly_ready", "needs_preparation"]),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  eligibilityStatus: z.enum(["likely_eligible", "needs_confirmation", "concern"]),
  eligibilityConcerns: z.array(z.string()),
  evidenceAssessment: z.array(z.string()),
  nextActions: z.array(z.string()),
});

export const resumeBenchmarkSchema = z.object({
  target: z.string(),
  atsReadinessScore: z.number().min(0).max(100),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  positioningStrengths: z.array(z.string()),
  concerns: z.array(z.string()),
  factualIntegrity: z.string(),
});

export const resumeOptimizationSchema = z.object({
  target: z.string(),
  optimizedHeadline: z.string(),
  professionalSummary: z.string(),
  skillsOrder: z.array(z.string()),
  experienceGuidance: z.array(z.string()),
  keywordsToUse: z.array(z.string()),
  unsupportedClaims: z.array(z.string()),
  factualIntegrity: z.string(),
});

export const companionCapabilityResultSchema = z.object({
  explanation: opportunityExplanationSchema.optional(),
  readiness: readinessAssessmentSchema.optional(),
  resumeBenchmark: resumeBenchmarkSchema.optional(),
  resumeOptimization: resumeOptimizationSchema.optional(),
});

export const opportunityCompanionResponseSchema =
  recommendationResponseSchema.extend({
    conversation: companionConversationSchema.optional(),
    capabilityResult: companionCapabilityResultSchema.optional(),
  });

export type OpportunityCategory = z.infer<typeof opportunityCategorySchema>;
export type RecommendationAction = z.infer<typeof recommendationActionSchema>;
export type CompanionGuidanceAction = z.infer<
  typeof companionGuidanceActionSchema
>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export type AiStatus = z.infer<typeof aiStatusSchema>;
export type StructuredUserProfile = z.infer<typeof structuredUserProfileSchema>;
export type RecommendationFilters = z.infer<typeof recommendationFiltersSchema>;
export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;
export type OpportunityCompanionRequest = z.infer<
  typeof opportunityCompanionRequestSchema
>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type ScoredOpportunity = z.infer<typeof scoredOpportunitySchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;
export type CompanionIntent = z.infer<typeof companionIntentSchema>;
export type ServiceOperation = z.infer<typeof serviceOperationSchema>;
export type UserFacingService = z.infer<typeof userFacingServiceSchema>;
export type OpportunityIntakeRoute = z.infer<
  typeof opportunityIntakeRouteSchema
>;
export type CompanionContext = z.infer<typeof companionContextSchema>;
export type CompanionSessionReference = z.infer<
  typeof companionSessionReferenceSchema
>;
export type CompanionContinuationInput = z.infer<
  typeof companionContinuationInputSchema
>;
export type Consent = z.infer<typeof consentSchema>;
export type DocumentReference = z.infer<typeof documentReferenceSchema>;
export type ProfileEvidence = z.infer<typeof profileEvidenceSchema>;
export type CompanionConversation = z.infer<typeof companionConversationSchema>;
export type CompanionCapabilityResult = z.infer<
  typeof companionCapabilityResultSchema
>;
export type OpportunityCompanionResponse = z.infer<
  typeof opportunityCompanionResponseSchema
>;
