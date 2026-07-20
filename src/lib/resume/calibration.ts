import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const calibrationRequirementStatusSchema = z.enum([
  "confirmed",
  "inferred",
  "unverified",
  "missing",
  "contradictory",
  "not_met",
  "not_applicable",
]);

export const calibrationEligibilityDecisionSchema = z.enum([
  "eligible",
  "likely_eligible",
  "uncertain",
  "ineligible",
]);

export const calibrationCaseSchema = z.object({
  caseId: z.string().regex(/^S2C-\d{4}$/),
  caseVersion: z.number().int().positive(),
  targetId: z.string().regex(/^S2T-\d{4}$/),
  applicantId: z.string().regex(/^S2A-\d{4}$/),
  status: z.literal("active"),
  corpusVersion: z.string(),
  rubricVersion: z.string(),
  inputRoute: z.enum([
    "resume_plus_target",
    "structured_profile_plus_target",
  ]),
  requestedOperations: z.array(z.enum(["benchmark", "optimize"])).min(1),
  categoryTags: z.array(z.string()).min(2),
  difficulty: z.enum(["routine", "complex", "adversarial"]),
  ambiguityExpected: z.boolean(),
  syntheticDataAttestation: z.literal(true),
  target: z.object({
    targetId: z.string().regex(/^S2T-\d{4}$/),
    title: z.string().min(2),
    organization: z.string().min(2),
    opportunityType: z.enum([
      "job",
      "internship",
      "scholarship",
      "fellowship",
      "grant",
      "research",
      "hackathon",
      "competition",
    ]),
    sourceType: z.literal("synthetic"),
    sourceCaptureDate: z.string().date(),
    rightsBasis: z.literal("synthetic"),
    location: z.string().min(2),
    remotePolicy: z.enum([
      "onsite",
      "hybrid",
      "remote_restricted",
      "remote_global",
      "unknown",
    ]),
    locale: z.string().min(2),
    deadline: z.object({
      value: z.string().date().nullable(),
      confidence: z.enum(["high", "medium", "low"]),
    }),
    requiredDocumentType: z.enum([
      "resume",
      "cv",
      "academic_cv",
      "biosketch",
      "profile",
      "portfolio",
    ]),
    targetConfidence: z.enum(["high", "medium", "low"]),
    requirements: z
      .array(
        z.object({
          requirementId: z.string(),
          text: z.string().min(4),
          publishedImportance: z.enum([
            "required",
            "preferred",
            "instruction",
          ]),
        }),
      )
      .min(3),
    description: z.string().min(40),
  }),
  applicant: z.object({
    applicantId: z.string().regex(/^S2A-\d{4}$/),
    presentation: z.enum(["resume", "structured_profile"]),
    locale: z.string(),
    region: z.string(),
    experienceStage: z.string(),
    protectedAttributesExcludedFromScoring: z.literal(true),
    parsingFeatures: z.array(z.string()),
    adversarialFeatures: z.array(z.string()),
    resumeText: z.string().min(80),
    structuredProfile: z.object({
      headline: z.string(),
      location: z.string(),
      experienceLevel: z.string(),
      skills: z.array(z.string()),
      interests: z.array(z.string()),
      goals: z.array(z.string()),
      education: z.array(z.string()),
      workHistory: z.array(z.string()),
      projects: z.array(z.string()),
      certifications: z.array(z.string()),
      links: z.array(z.string().url()),
    }),
  }),
  claims: z
    .array(
      z.object({
        claimId: z.string(),
        text: z.string().min(2),
        category: z.string(),
        source: z.enum(["resume", "structured_profile"]),
        explicitness: z.enum(["explicit", "ambiguous"]),
        confirmationStatus: z.enum(["confirmed", "unconfirmed"]),
        optimizationAuthorized: z.boolean(),
        contradictions: z.array(z.string()),
        sensitiveClass: z.enum(["none", "location"]),
        expectedHandling: z.string().min(10),
      }),
    )
    .min(4),
});

export const calibrationReviewSchema = z.object({
  reviewId: z.string(),
  caseId: z.string().regex(/^S2C-\d{4}$/),
  reviewerRole: z.enum([
    "requirement_eligibility",
    "evidence_truthfulness",
    "quality_optimization",
  ]),
  reviewerType: z.literal("AI"),
  provider: z.string(),
  model: z.string(),
  modelConfiguration: z.string(),
  promptVersion: z.string(),
  rubricVersion: z.string(),
  independentContextAttestation: z.literal(true),
  blindedToTrakr: z.literal(true),
  blindedToOtherReviewers: z.literal(true),
  inputHash: z.string().length(64),
  requirements: z.array(
    z.object({
      requirementId: z.string(),
      importance: z.enum([
        "hard_eligibility",
        "required",
        "preferred",
        "instruction",
        "contextual",
        "irrelevant",
      ]),
      status: calibrationRequirementStatusSchema,
      supportingClaimIds: z.array(z.string()),
      prohibitedClaimIds: z.array(z.string()).default([]),
      confidence: z.enum(["high", "medium", "low"]),
      rationale: z.string().min(8),
    }),
  ),
  eligibility: z.object({
    decision: calibrationEligibilityDecisionSchema,
    hardFailureRequirementIds: z.array(z.string()),
    unknownRequirementIds: z.array(z.string()),
    confidence: z.enum(["high", "medium", "low"]),
    rationale: z.string().min(8),
  }),
  dimensionBands: z.object({
    requiredQualificationAlignment: z.enum([
      "weak",
      "partial",
      "adequate",
      "strong",
    ]),
    preferredQualificationAlignment: z.enum([
      "weak",
      "partial",
      "adequate",
      "strong",
    ]),
    evidenceStrength: z.enum(["weak", "partial", "adequate", "strong"]),
    experienceRelevance: z.enum(["weak", "partial", "adequate", "strong"]),
    accomplishments: z.enum(["weak", "partial", "adequate", "strong"]),
    structureReadability: z.enum(["weak", "partial", "adequate", "strong"]),
    machineParseability: z.enum(["weak", "partial", "adequate", "strong"]),
    terminologyAlignment: z.enum(["weak", "partial", "adequate", "strong"]),
    targetInstructionCompliance: z.enum([
      "weak",
      "partial",
      "adequate",
      "strong",
    ]),
    overallAlignment: z.enum(["weak", "partial", "adequate", "strong"]),
  }),
  recommendations: z.object({
    requiredActions: z.array(z.string()),
    prohibitedActions: z.array(z.string()),
    optimizeDisposition: z.enum([
      "optimize",
      "clarify_first",
      "do_not_optimize",
    ]),
  }),
  optimization: z.object({
    allowedClaimIds: z.array(z.string()),
    confirmationRequiredClaimIds: z.array(z.string()),
    forbiddenTransformations: z.array(
      z.enum([
        "invent_metric",
        "inflate_seniority",
        "imply_missing_qualification",
        "convert_participation_to_leadership",
        "remove_uncertainty",
        "invent_employer_or_credential",
      ]),
    ),
  }),
  injectionDetected: z.boolean(),
  ambiguity: z.boolean(),
  overallConfidence: z.enum(["high", "medium", "low"]),
});

export const calibrationAdjudicationSchema = z.object({
  adjudicationId: z.string(),
  caseId: z.string().regex(/^S2C-\d{4}$/),
  adjudicatorType: z.literal("AI"),
  blindedToTrakr: z.literal(true),
  reviewerAgreement: z.object({
    requirementStatus: z.number().min(0).max(1),
    eligibilityDecision: z.number().min(0).max(1),
    optimizationDisposition: z.number().min(0).max(1),
  }),
  requirements: calibrationReviewSchema.shape.requirements,
  eligibility: calibrationReviewSchema.shape.eligibility,
  dimensionBands: calibrationReviewSchema.shape.dimensionBands,
  recommendations: calibrationReviewSchema.shape.recommendations,
  optimization: calibrationReviewSchema.shape.optimization,
  injectionDetected: z.boolean(),
  ambiguity: z.object({
    present: z.boolean(),
    reason: z.string().optional(),
    acceptedAlternatives: z.array(z.string()),
  }),
  disagreementClasses: z.array(
    z.enum([
      "requirement_extraction_defect",
      "requirement_importance_defect",
      "role_family_classification_defect",
      "eligibility_logic_defect",
      "evidence_extraction_defect",
      "evidence_equivalence_defect",
      "contradiction_detection_defect",
      "scoring_weight_defect",
      "recommendation_defect",
      "optimization_fabrication",
      "optimization_exaggeration",
      "locale_handling_defect",
      "target_type_defect",
      "parsing_defect",
      "prompt_injection_defect",
      "reviewer_disagreement",
      "genuinely_ambiguous_case",
    ]),
  ),
  confidence: z.enum(["high", "medium", "low"]),
  rationale: z.string().min(8),
  humanReviewQueue: z.boolean(),
});

export type CalibrationCase = z.infer<typeof calibrationCaseSchema>;
export type CalibrationReview = z.infer<typeof calibrationReviewSchema>;
export type CalibrationAdjudication = z.infer<
  typeof calibrationAdjudicationSchema
>;

export function calibrationRoot() {
  return path.resolve("data", "resume-calibration", "v1");
}

export async function loadCalibrationCases() {
  const raw = await readFile(
    path.join(calibrationRoot(), "cases.json"),
    "utf8",
  );
  return z.array(calibrationCaseSchema).parse(JSON.parse(raw));
}

export function calibrationInputHash(item: CalibrationCase) {
  return createHash("sha256").update(JSON.stringify(item)).digest("hex");
}

export function wilsonInterval(successes: number, total: number, z = 1.96) {
  if (!total) return { lower: 0, upper: 0 };
  const proportion = successes / total;
  const denominator = 1 + (z ** 2) / total;
  const center =
    (proportion + (z ** 2) / (2 * total)) / denominator;
  const margin =
    (z *
      Math.sqrt(
        (proportion * (1 - proportion)) / total +
          (z ** 2) / (4 * total ** 2),
      )) /
    denominator;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}
