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
  field: z.string(),
  source: profileEvidenceSourceSchema,
  evidence: z.string().optional(),
  origin: z
    .enum(["user", "resume", "context", "structured_profile", "inference"])
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
]);

export const companionContextSchema = z.object({
  profile: structuredUserProfileSchema.optional(),
  profileEvidence: z.array(profileEvidenceSchema).max(40).default([]),
  selectedOpportunityId: z.string().min(1).max(240).optional(),
  profileConfirmed: z.boolean().default(false),
  profileSource: z.enum(["resume", "background"]).optional(),
  awaitingProfileConfirmation: z.boolean().optional(),
  sessionVersion: z.literal("1").optional(),
});

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
    context: companionContextSchema.optional(),
    continuation: companionContextSchema.optional(),
    target: companionTargetSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      !value.user &&
      !value.profile &&
      !value.resumeText &&
      !value.message &&
      !value.context?.profile &&
      !value.continuation?.profile
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
});

export const companionStateSchema = z.enum([
  "choose_profile_source",
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
  continuation: companionContextSchema,
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
export type CompanionContext = z.infer<typeof companionContextSchema>;
export type ProfileEvidence = z.infer<typeof profileEvidenceSchema>;
export type CompanionConversation = z.infer<typeof companionConversationSchema>;
export type CompanionCapabilityResult = z.infer<
  typeof companionCapabilityResultSchema
>;
export type OpportunityCompanionResponse = z.infer<
  typeof opportunityCompanionResponseSchema
>;
