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

export const opportunityTypeSchema = z.enum([
  "job",
  "internship",
  "scholarship",
  "fellowship",
  "grant",
  "research_funding",
  "research_placement",
  "hackathon",
  "competition",
  "bounty",
  "accelerator",
  "incubator",
  "volunteer_program",
  "academic_program",
  "training_program",
]);

export const opportunityDomainSchema = z.enum([
  "artificial_intelligence",
  "machine_learning",
  "climate",
  "sustainability",
  "fintech",
  "finance",
  "blockchain",
  "web3",
  "research",
  "health",
  "education",
  "public_policy",
  "design",
  "software_engineering",
  "entrepreneurship",
  "cybersecurity",
  "open_source",
  "social_impact",
]);

export const remoteScopeSchema = z.enum([
  "globally_remote",
  "remote_country",
  "remote_region",
  "remote_timezones",
  "hybrid",
  "onsite",
  "remote_scope_unclear",
]);

export const deadlineStateSchema = z.enum([
  "exact_future",
  "rolling",
  "recurring",
  "historical_estimate",
  "unclear",
  "requires_confirmation",
  "passed",
  "closed",
]);

export const evidenceConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
  "unknown",
]);

export const opportunitySourceTierSchema = z.enum([
  "tier_a_structured",
  "tier_b_official_directory",
  "tier_c_review_backed",
  "tier_d_exploration",
]);

export const sourcePermissionStatusSchema = z.enum([
  "documented_public_api",
  "official_feed",
  "employer_owned_api",
  "permissioned_partner",
  "official_directory",
  "manual_review_only",
  "permission_required",
  "not_approved",
]);

export const opportunityRecommendationStateSchema = z.enum([
  "apply_now",
  "explore",
  "research_lead",
  "unavailable_or_unverified",
]);

export const fieldEvidenceSchema = z.object({
  field: z.string(),
  value: z.union([z.string(), z.array(z.string())]).optional(),
  sourceUrl: z.string().url(),
  sourceName: z.string(),
  capturedAt: z.string().datetime(),
  confidence: evidenceConfidenceSchema,
  basis: z.enum(["published", "structured_source", "inferred", "manual_review"]),
});

export const geographicEligibilitySchema = z.object({
  eligibleCountries: z.array(z.string()).default([]),
  excludedCountries: z.array(z.string()).default([]),
  eligibleRegions: z.array(z.string()).default([]),
  applicantResidencyRequirements: z.array(z.string()).default([]),
  citizenshipRequirements: z.array(z.string()).default([]),
  workAuthorizationRequirements: z.array(z.string()).default([]),
  visaSponsorship: z.enum(["offered", "not_offered", "unclear", "not_applicable"]),
  remoteScope: remoteScopeSchema,
  travelRequirements: z.array(z.string()).default([]),
  onsiteRequirements: z.array(z.string()).default([]),
  timezoneRestrictions: z.array(z.string()).default([]),
  evidence: z.array(fieldEvidenceSchema).default([]),
  confidence: evidenceConfidenceSchema,
  unknownConditions: z.array(z.string()).default([]),
});

export const deadlineEvidenceSchema = z.object({
  state: deadlineStateSchema,
  date: z.string().date().nullable(),
  timezone: z.string().nullable(),
  sourceUrl: z.string().url(),
  verifiedAt: z.string().datetime().nullable(),
  confidence: evidenceConfidenceSchema,
  currentCycle: z.enum(["confirmed", "unknown", "not_applicable"]),
  notes: z.array(z.string()).default([]),
});

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
  contactEmail: z.string().email().max(254).optional(),
  contactPhone: z.string().min(5).max(40).optional(),
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
  research: z.array(z.string()).optional(),
  publications: z.array(z.string()).optional(),
  achievements: z.array(z.string()).optional(),
  awards: z.array(z.string()).optional(),
  volunteerExperience: z.array(z.string()).optional(),
  leadership: z.array(z.string()).optional(),
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
  opportunityTypes: z.array(opportunityTypeSchema).optional(),
  domains: z.array(opportunityDomainSchema).optional(),
  location: z.string().optional(),
  remote: z.boolean().optional(),
  remoteScopes: z.array(remoteScopeSchema).optional(),
  applicantCountry: z.string().optional(),
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
  "service_selection",
  "profile_build",
  "opportunity_matching",
  "explain_recommendation",
  "readiness_assessment",
  "resume_benchmark",
  "resume_optimization",
  "resume_generation",
]);

export const serviceOperationSchema = z.enum([
  "start",
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

export const companionTargetSchema = z.object({
  opportunityId: z.string().min(1).max(240).optional(),
  opportunityTitle: z.string().min(2).max(300).optional(),
  role: z.string().min(2).max(200).optional(),
  industry: z.string().min(2).max(200).optional(),
  organization: z.string().min(2).max(240).optional(),
  opportunityType: opportunityCategorySchema.optional(),
  description: z.string().min(20).max(12000).optional(),
  requirements: z.array(z.string().min(2).max(1000)).max(50).optional(),
  url: z.string().url().optional(),
  locale: z.string().min(2).max(80).optional(),
});

export const generatedDocumentTypeSchema = z.enum([
  "private_sector_resume",
  "internship_resume",
  "academic_cv",
  "research_cv",
  "biosketch",
  "scholarship_cv",
  "fellowship_profile",
  "grant_profile",
  "hackathon_profile",
  "technical_project_resume",
  "design_portfolio_resume",
  "team_member_profile",
  "general_professional_profile",
]);

export const generationPreferencesSchema = z.object({
  documentType: generatedDocumentTypeSchema.optional(),
  locale: z.string().min(2).max(80).optional(),
  format: z.enum(["plain_text", "markdown", "docx_ready"]).default("markdown"),
  pageLimit: z.number().int().min(1).max(20).optional(),
  instructions: z.array(z.string().min(2).max(500)).max(12).default([]),
});

export const resumeBenchmarkReferenceSchema = z.object({
  benchmarkId: z.string().min(12).max(120),
  rubricVersion: z.string().min(1).max(80),
  targetFingerprint: z.string().min(16).max(120),
  evidenceFingerprint: z.string().min(16).max(120),
  completedAt: z.string().datetime(),
});

export const documentReferenceSchema = z.object({
  id: z.string().min(8).max(160),
  kind: z.enum(["resume", "cv", "background"]),
  contentType: z.string().max(160).optional(),
  receivedAt: z.string().datetime(),
  retention: z.literal("session_only"),
});

export const documentInputSchema = z.discriminatedUnion("representation", [
  z.object({
    representation: z.literal("base64"),
    kind: z.enum(["resume", "cv"]).default("resume"),
    fileName: z.string().min(1).max(180),
    mimeType: z.enum([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ]),
    dataBase64: z.string().min(4).max(3_500_000),
  }),
  z.object({
    representation: z.literal("text"),
    kind: z.enum(["resume", "cv"]).default("resume"),
    fileName: z.string().min(1).max(180).optional(),
    mimeType: z.literal("text/plain").default("text/plain"),
    text: z.string().min(80).max(40000),
  }),
]);

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
  target: companionTargetSchema.optional(),
  generationPreferences: generationPreferencesSchema.optional(),
  lastBenchmark: resumeBenchmarkReferenceSchema.optional(),
  optimizationApproved: z.boolean().optional(),
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

export const opportunityCompanionRequestSchema = z
  .object({
    user: structuredUserProfileSchema.optional(),
    profile: structuredUserProfileSchema.optional(),
    resumeText: z.string().min(80).max(40000).optional(),
    goals: z.array(z.string().min(1)).optional(),
    interests: z.array(z.string().min(1)).optional(),
    filters: recommendationFiltersSchema.default({}),
    requestId: z.string().optional(),
    message: z.string().max(6000).optional(),
    intent: companionIntentSchema.default("auto"),
    operation: serviceOperationSchema.default("auto"),
    intakeRoute: opportunityIntakeRouteSchema.optional(),
    consent: consentSchema.optional(),
    context: companionContinuationInputSchema.optional(),
    continuation: companionContinuationInputSchema.optional(),
    target: companionTargetSchema.optional(),
    generationPreferences: generationPreferencesSchema.optional(),
    document: documentInputSchema.optional(),
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
  opportunityType: opportunityTypeSchema.optional(),
  secondaryTypes: z.array(opportunityTypeSchema).optional(),
  domains: z.array(opportunityDomainSchema).optional(),
  geography: geographicEligibilitySchema.optional(),
  deadlineInfo: deadlineEvidenceSchema.optional(),
  sourceTier: opportunitySourceTierSchema.optional(),
  sourcePermission: sourcePermissionStatusSchema.optional(),
  fieldEvidence: z.array(fieldEvidenceSchema).optional(),
  recommendationState: opportunityRecommendationStateSchema.optional(),
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
  recommendationState: opportunityRecommendationStateSchema.optional(),
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
      actionableCount: z.number().int().nonnegative().optional(),
      exploreCount: z.number().int().nonnegative().optional(),
      researchLeadCount: z.number().int().nonnegative().optional(),
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
  "resume_generation",
]);

export const companionStatusSchema = z.enum([
  "needs_input",
  "in_progress",
  "completed",
]);

export const companionChoiceSchema = z.object({
  id: z.string(),
  value: z.string(),
  number: z.number().int().positive().optional(),
  label: z.string(),
  description: z.string().optional(),
});

export const requiredInputSchema = z.object({
  id: z.string(),
  type: z.enum(["enum", "boolean", "text", "document", "object"]),
  required: z.boolean(),
  prompt: z.string(),
  options: z.array(companionChoiceSchema).optional(),
  acceptedRepresentations: z.array(z.string()).optional(),
  acceptedMimeTypes: z.array(z.string()).optional(),
  maxBytes: z.number().int().positive().optional(),
  fields: z.array(z.string()).optional(),
});

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
  service: userFacingServiceSchema.nullable(),
  operation: serviceOperationSchema,
  profileSource: opportunityIntakeRouteSchema.optional(),
  stage: z.string(),
  status: companionStatusSchema,
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
  requiredInputs: z.array(requiredInputSchema).default([]),
  choices: z.array(companionChoiceSchema).optional(),
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
  benchmarkId: z.string(),
  rubricVersion: z.string(),
  target: z.string(),
  targetType: z.string(),
  targetConfidence: z.enum(["high", "medium", "low"]),
  scoreMeaning: z.string(),
  overallAlignmentScore: z.number().min(0).max(100),
  atsReadinessScore: z.number().min(0).max(100),
  parseabilityScore: z.number().min(0).max(100),
  eligibility: z.object({
    status: z.enum(["meets", "likely", "unclear", "not_met"]),
    failures: z.array(z.string()),
    unknowns: z.array(z.string()),
  }),
  requirements: z.array(
    z.object({
      id: z.string(),
      requirement: z.string(),
      importance: z.enum(["required", "preferred", "instruction", "context"]),
      category: z.enum([
        "eligibility",
        "skill",
        "experience",
        "education",
        "portfolio",
        "achievement",
        "instruction",
        "other",
      ]),
      status: z.enum([
        "confirmed",
        "inferred",
        "unverified",
        "missing",
        "contradictory",
        "not_met",
      ]),
      evidence: z.array(z.string()),
      evidenceClaimIds: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      score: z.number().min(0).max(100),
      explanation: z.string(),
      actions: z.array(z.string()),
    }),
  ),
  dimensions: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      score: z.number().min(0).max(100),
      confidence: z.number().min(0).max(1),
      explanation: z.string(),
      requirementIds: z.array(z.string()),
      evidenceClaimIds: z.array(z.string()),
      actions: z.array(z.string()),
    }),
  ),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  positioningStrengths: z.array(z.string()),
  concerns: z.array(z.string()),
  priorityActions: z.array(z.string()),
  limitations: z.array(z.string()),
  factualIntegrity: z.string(),
});

export const resumeOptimizationSchema = z.object({
  benchmarkId: z.string(),
  rubricVersion: z.string(),
  target: z.string(),
  optimizedHeadline: z.string(),
  professionalSummary: z.string(),
  skillsOrder: z.array(z.string()),
  experienceGuidance: z.array(z.string()),
  prioritizedChanges: z.array(
    z.object({
      priority: z.enum(["critical", "high", "medium", "low"]),
      section: z.string(),
      recommendation: z.string(),
      reason: z.string(),
      evidenceClaimIds: z.array(z.string()),
    }),
  ),
  sectionRewrites: z.array(
    z.object({
      section: z.string(),
      original: z.string(),
      suggested: z.string(),
      evidenceClaimIds: z.array(z.string()),
      requiresConfirmation: z.boolean(),
    }),
  ),
  keywordsToUse: z.array(z.string()),
  unsupportedClaims: z.array(z.string()),
  verificationChecklist: z.array(z.string()),
  factualIntegrity: z.string(),
});

export const generatedDocumentItemSchema = z.object({
  text: z.string(),
  evidenceClaimIds: z.array(z.string()),
  placeholder: z.boolean(),
  requiresConfirmation: z.boolean(),
});

export const generatedDocumentSectionSchema = z.object({
  id: z.string(),
  heading: z.string(),
  items: z.array(generatedDocumentItemSchema),
});

export const resumeGenerationSchema = z.object({
  generationId: z.string(),
  rubricVersion: z.string(),
  documentType: generatedDocumentTypeSchema,
  documentTypeReason: z.string(),
  target: z.string(),
  locale: z.string(),
  format: z.enum(["plain_text", "markdown", "docx_ready"]),
  pageLimit: z.number().int().min(1).max(20).nullable(),
  instructions: z.array(z.string()),
  title: z.string(),
  sections: z.array(generatedDocumentSectionSchema),
  placeholders: z.array(z.string()),
  omittedUnsupportedClaims: z.array(z.string()),
  followUpQuestions: z.array(z.string()),
  verificationChecklist: z.array(z.string()),
  factualIntegrity: z.string(),
});

export const downloadableArtifactSchema = z.object({
  id: z.string(),
  type: z.enum(["resume", "cv", "application_document"]),
  format: z.enum(["docx", "pdf"]),
  filename: z.string(),
  mimeType: z.string(),
  downloadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string(),
  regenerateAction: z.enum(["optimize", "generate_resume"]),
});

export const companionCapabilityResultSchema = z.object({
  explanation: opportunityExplanationSchema.optional(),
  readiness: readinessAssessmentSchema.optional(),
  resumeBenchmark: resumeBenchmarkSchema.optional(),
  resumeOptimization: resumeOptimizationSchema.optional(),
  resumeGeneration: resumeGenerationSchema.optional(),
});

export const opportunityCompanionResponseSchema =
  recommendationResponseSchema.extend({
    conversation: companionConversationSchema.optional(),
    capabilityResult: companionCapabilityResultSchema.optional(),
    stage: z.string().optional(),
    status: companionStatusSchema.optional(),
    message: z.string().optional(),
    selectedService: userFacingServiceSchema.nullable().optional(),
    requiredInputs: z.array(requiredInputSchema).optional(),
    nextActions: z.array(z.string()).optional(),
    continuation: companionSessionReferenceSchema.optional(),
    artifacts: z.array(downloadableArtifactSchema).optional(),
  });

export type OpportunityCategory = z.infer<typeof opportunityCategorySchema>;
export type OpportunityType = z.infer<typeof opportunityTypeSchema>;
export type OpportunityDomain = z.infer<typeof opportunityDomainSchema>;
export type RemoteScope = z.infer<typeof remoteScopeSchema>;
export type DeadlineState = z.infer<typeof deadlineStateSchema>;
export type EvidenceConfidence = z.infer<typeof evidenceConfidenceSchema>;
export type OpportunitySourceTier = z.infer<typeof opportunitySourceTierSchema>;
export type SourcePermissionStatus = z.infer<
  typeof sourcePermissionStatusSchema
>;
export type OpportunityRecommendationState = z.infer<
  typeof opportunityRecommendationStateSchema
>;
export type GeographicEligibility = z.infer<
  typeof geographicEligibilitySchema
>;
export type DeadlineEvidence = z.infer<typeof deadlineEvidenceSchema>;
export type FieldEvidence = z.infer<typeof fieldEvidenceSchema>;
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
export type CompanionTarget = z.infer<typeof companionTargetSchema>;
export type ResumeBenchmarkReference = z.infer<
  typeof resumeBenchmarkReferenceSchema
>;
export type GenerationPreferences = z.infer<
  typeof generationPreferencesSchema
>;
export type DocumentInput = z.infer<typeof documentInputSchema>;
export type GeneratedDocumentType = z.infer<
  typeof generatedDocumentTypeSchema
>;
export type DocumentReference = z.infer<typeof documentReferenceSchema>;
export type ProfileEvidence = z.infer<typeof profileEvidenceSchema>;
export type CompanionConversation = z.infer<typeof companionConversationSchema>;
export type CompanionChoice = z.infer<typeof companionChoiceSchema>;
export type RequiredInput = z.infer<typeof requiredInputSchema>;
export type DownloadableArtifact = z.infer<typeof downloadableArtifactSchema>;
export type CompanionCapabilityResult = z.infer<
  typeof companionCapabilityResultSchema
>;
export type OpportunityCompanionResponse = z.infer<
  typeof opportunityCompanionResponseSchema
>;
