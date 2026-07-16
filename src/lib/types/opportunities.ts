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
  links: z.array(z.string().url()).default([]),
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
});

export const recommendationSchema = z.object({
  rank: z.number().int().positive(),
  opportunity: opportunitySchema,
  matchScore: z.number().min(0).max(100),
  reasoning: z.string(),
  missingRequirements: z.array(z.string()),
  recommendedAction: recommendationActionSchema,
  nextSteps: z.array(z.string()),
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

export type OpportunityCategory = z.infer<typeof opportunityCategorySchema>;
export type RecommendationAction = z.infer<typeof recommendationActionSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export type AiStatus = z.infer<typeof aiStatusSchema>;
export type StructuredUserProfile = z.infer<typeof structuredUserProfileSchema>;
export type RecommendationFilters = z.infer<typeof recommendationFiltersSchema>;
export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type ScoredOpportunity = z.infer<typeof scoredOpportunitySchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;
