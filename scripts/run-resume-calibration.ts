import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { handleOpportunityCompanionRequest } from "../src/lib/companion/service";
import {
  authoritativeOptimizationClaimIds,
  calibrationAdjudicationSchema,
  calibrationReviewSchema,
  calibrationRoot,
  loadCalibrationCases,
  wilsonInterval,
  type CalibrationCase,
} from "../src/lib/resume/calibration";
import {
  opportunityCompanionRequestSchema,
  type CompanionContext,
  type OpportunityCategory,
  type ProfileEvidence,
  type StructuredUserProfile,
} from "../src/lib/types/opportunities";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function opportunityType(value: string): OpportunityCategory {
  if (
    [
      "internship",
      "scholarship",
      "fellowship",
      "grant",
      "hackathon",
    ].includes(value)
  ) {
    return value as OpportunityCategory;
  }
  if (value === "competition") return "hackathon";
  return "remote_job";
}

function experienceLevel(value: string): StructuredUserProfile["experienceLevel"] {
  if (value === "student") return "student";
  if (value === "senior") return "senior";
  if (value === "mid") return "mid-level";
  if (value === "career_changer") return "early-career";
  return "beginner";
}

function evidenceField(claim: CalibrationCase["claims"][number]) {
  if (claim.category === "skill") return "skills";
  if (claim.category === "education") return "education";
  if (claim.category === "project") return "projects";
  if (claim.category === "eligibility" && /^based in /i.test(claim.text)) {
    return "location";
  }
  return "workHistory";
}

function buildContext(item: CalibrationCase): CompanionContext {
  const profile: StructuredUserProfile = {
    ...item.applicant.structuredProfile,
    experienceLevel: experienceLevel(item.applicant.experienceStage),
  };
  const evidence: ProfileEvidence[] = item.claims.map((claim) => ({
    claimId: claim.claimId,
    field: evidenceField(claim),
    source:
      claim.confirmationStatus === "confirmed" &&
      claim.explicitness === "explicit"
        ? "explicit"
        : claim.explicitness === "ambiguous"
          ? "inferred"
          : "unknown",
    value: claim.text,
    evidence: `Synthetic calibration claim from ${claim.source}.`,
    origin:
      claim.source === "resume" ? "resume" : "structured_profile",
    confidence:
      claim.confirmationStatus === "confirmed"
        ? claim.explicitness === "explicit"
          ? 1
          : 0.6
        : 0.35,
    confirmed: claim.confirmationStatus === "confirmed",
    allowedUse: [
      "assessment",
      ...(claim.optimizationAuthorized &&
      claim.confirmationStatus === "confirmed"
        ? (["optimization"] as const)
        : []),
    ],
  }));
  return {
    profile,
    profileEvidence: evidence,
    profileConfirmed: true,
    profileSource:
      item.inputRoute === "resume_plus_target" ? "resume" : "background",
    unansweredQuestions: [],
    documentReferences: [],
    consent: {
      processPersonalData: true,
      retention: "session_only",
      source: "explicit",
    },
    service: "resume_benchmarking_optimization",
    operation: "benchmark",
    sessionVersion: "2",
  };
}

function targetFor(item: CalibrationCase) {
  return {
    role: item.target.title,
    organization: item.target.organization,
    opportunityType: opportunityType(item.target.opportunityType),
    description: item.target.description,
    requirements: item.target.requirements.map(
      (requirement) => requirement.text,
    ),
    locale: item.target.locale,
  };
}

function band(score: number) {
  if (score < 40) return "weak";
  if (score < 65) return "partial";
  if (score < 80) return "adequate";
  return "strong";
}

function percent(value: number) {
  return Math.round(value * 10_000) / 100;
}

function intersection(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

async function main() {
  const gate = process.argv.includes("--gate");
  const root = calibrationRoot();
  const cases = await loadCalibrationCases();
  const adjudicationText = await readFile(
    path.join(root, "adjudications", "final.json"),
    "utf8",
  );
  const adjudications = z
    .array(calibrationAdjudicationSchema)
    .parse(JSON.parse(adjudicationText));
  const adjudicationById = new Map(
    adjudications.map((item) => [item.caseId, item]),
  );
  const reviewFiles = [
    "requirement-eligibility.json",
    "evidence-truthfulness.json",
    "quality-optimization.json",
  ];
  const reviewSets = await Promise.all(
    reviewFiles.map(async (file) => {
      const raw = await readFile(path.join(root, "reviews", file), "utf8");
      return z.array(calibrationReviewSchema).parse(JSON.parse(raw));
    }),
  );
  const reviewsByCase = new Map(
    cases.map((item) => [
      item.caseId,
      reviewSets
        .map((reviews) => reviews.find((review) => review.caseId === item.caseId))
        .filter((review) => Boolean(review)),
    ]),
  );
  if (adjudications.length !== cases.length) {
    throw new Error(
      `Expected ${cases.length} adjudications, received ${adjudications.length}.`,
    );
  }

  const systemRuns = [];
  for (const item of cases) {
    const request = opportunityCompanionRequestSchema.parse({
      operation: "benchmark",
      context: buildContext(item),
      target: targetFor(item),
    });
    const response = await handleOpportunityCompanionRequest(request);
    const benchmark = response.capabilityResult?.resumeBenchmark;
    if (!benchmark) {
      throw new Error(`${item.caseId} did not return a benchmark.`);
    }

    let optimization;
    if (item.requestedOperations.includes("optimize")) {
      const optimizedResponse = await handleOpportunityCompanionRequest(
        opportunityCompanionRequestSchema.parse({
          operation: "optimize",
          continuation: response.conversation?.continuation,
          message: "Continue with optimization.",
        }),
      );
      optimization = optimizedResponse.capabilityResult?.resumeOptimization;
      if (!optimization) {
        throw new Error(`${item.caseId} did not return optimization output.`);
      }
    }
    systemRuns.push({
      caseId: item.caseId,
      benchmark,
      optimization,
    });
  }

  let hardFailureTotal = 0;
  let hardFailureDetected = 0;
  let falseIneligible = 0;
  let eligibleExpected = 0;
  let requirementTotal = 0;
  let requirementAgreement = 0;
  let hardRequirementTotal = 0;
  let hardRequirementAgreement = 0;
  let evidenceExpected = 0;
  let evidenceLinked = 0;
  let evidenceReturned = 0;
  let evidenceSupported = 0;
  let contradictionTotal = 0;
  let contradictionDetected = 0;
  let optimizationRewriteCount = 0;
  let rewriteClaimLinked = 0;
  let fabricationViolations = 0;
  let adjudicatorAllowlistDisagreements = 0;
  let injectionTotal = 0;
  let injectionContained = 0;
  let scoreBandTotal = 0;
  let scoreBandAgreement = 0;
  const consensusStrata = {
    unanimous: { total: 0, agreement: 0 },
    majority: { total: 0, agreement: 0 },
    minority: { total: 0, agreement: 0 },
  };
  const disagreementClassCounts = new Map<string, number>();
  const differences: Array<Record<string, unknown>> = [];

  for (const run of systemRuns) {
    const item = cases.find((candidate) => candidate.caseId === run.caseId);
    const adjudication = adjudicationById.get(run.caseId);
    if (!item || !adjudication) throw new Error(`Missing case data for ${run.caseId}.`);
    const benchmarkRequirements = new Map(
      run.benchmark.requirements.map((requirement) => [
        normalize(requirement.requirement),
        requirement,
      ]),
    );
    const caseReviews = reviewsByCase.get(item.caseId) ?? [];

    for (const expected of adjudication.requirements) {
      const sourceRequirement = item.target.requirements.find(
        (requirement) => requirement.requirementId === expected.requirementId,
      );
      const actual = sourceRequirement
        ? benchmarkRequirements.get(normalize(sourceRequirement.text))
        : undefined;
      const reviewerVotes = caseReviews.map(
        (review) =>
          review?.requirements.find(
            (requirement) =>
              requirement.requirementId === expected.requirementId,
          )?.status ?? "missing_review",
      );
      const adjudicationSupport = reviewerVotes.filter(
        (status) => status === expected.status,
      ).length;
      const stratum =
        adjudicationSupport === 3
          ? "unanimous"
          : adjudicationSupport === 2
            ? "majority"
            : "minority";
      consensusStrata[stratum].total += 1;
      requirementTotal += 1;
      if (actual?.status === expected.status) {
        requirementAgreement += 1;
        consensusStrata[stratum].agreement += 1;
      }
      if (expected.importance === "hard_eligibility") {
        hardRequirementTotal += 1;
        if (actual?.status === expected.status) hardRequirementAgreement += 1;
      }
      evidenceExpected += expected.supportingClaimIds.length;
      evidenceReturned += actual?.evidenceClaimIds.length ?? 0;
      evidenceLinked += intersection(
        expected.supportingClaimIds,
        actual?.evidenceClaimIds ?? [],
      ).length;
      evidenceSupported += intersection(
        actual?.evidenceClaimIds ?? [],
        expected.supportingClaimIds,
      ).length;
      if (actual?.status !== expected.status) {
        differences.push({
          caseId: item.caseId,
          type: "requirement_status",
          requirementId: expected.requirementId,
          expected: expected.status,
          actual: actual?.status ?? "not_extracted",
          reviewerVotes,
          adjudicationSupport,
          adjudicationConfidence: adjudication.confidence,
          humanReviewQueue: adjudication.humanReviewQueue,
          disagreementClasses: adjudication.disagreementClasses,
        });
        for (const disagreementClass of adjudication.disagreementClasses) {
          disagreementClassCounts.set(
            disagreementClass,
            (disagreementClassCounts.get(disagreementClass) ?? 0) + 1,
          );
        }
      }
    }

    hardFailureTotal += adjudication.eligibility.hardFailureRequirementIds.length;
    for (const requirementId of adjudication.eligibility.hardFailureRequirementIds) {
      const sourceRequirement = item.target.requirements.find(
        (requirement) => requirement.requirementId === requirementId,
      );
      const actual = sourceRequirement
        ? benchmarkRequirements.get(normalize(sourceRequirement.text))
        : undefined;
      if (actual?.status === "not_met") hardFailureDetected += 1;
    }
    if (adjudication.eligibility.decision !== "ineligible") {
      eligibleExpected += 1;
      if (run.benchmark.eligibility.status === "not_met") falseIneligible += 1;
    }

    const contradictory = adjudication.requirements.some(
      (requirement) => requirement.status === "contradictory",
    );
    if (contradictory) {
      contradictionTotal += 1;
      if (
        run.benchmark.requirements.some(
          (requirement) => requirement.status === "contradictory",
        )
      ) {
        contradictionDetected += 1;
      }
    }

    const actualOverallBand = band(run.benchmark.overallAlignmentScore);
    scoreBandTotal += 1;
    if (
      actualOverallBand === adjudication.dimensionBands.overallAlignment
    ) {
      scoreBandAgreement += 1;
    }

    if (run.optimization) {
      const authoritativeAllowed = new Set(
        authoritativeOptimizationClaimIds(item),
      );
      const adjudicatorAllowed = new Set(
        adjudication.optimization.allowedClaimIds,
      );
      for (const rewrite of run.optimization.sectionRewrites) {
        optimizationRewriteCount += 1;
        if (rewrite.evidenceClaimIds.length) rewriteClaimLinked += 1;
        if (
          !rewrite.evidenceClaimIds.length ||
          rewrite.evidenceClaimIds.some(
            (claimId) => !authoritativeAllowed.has(claimId),
          )
        ) {
          fabricationViolations += 1;
        }
        if (
          rewrite.evidenceClaimIds.some(
            (claimId) =>
              authoritativeAllowed.has(claimId) &&
              !adjudicatorAllowed.has(claimId),
          )
        ) {
          adjudicatorAllowlistDisagreements += 1;
        }
      }
    }

    const injectionClaims = item.claims.filter(
      (claim) => claim.category === "untrusted_instruction",
    );
    if (injectionClaims.length) {
      injectionTotal += 1;
      const serialized = JSON.stringify(run);
      if (
        injectionClaims.every((claim) => !serialized.includes(claim.text))
      ) {
        injectionContained += 1;
      }
    }
  }

  const hardFailureRecall = hardFailureTotal
    ? hardFailureDetected / hardFailureTotal
    : 1;
  const falseIneligibilityRate = eligibleExpected
    ? falseIneligible / eligibleExpected
    : 0;
  const allRequirementAgreement = requirementTotal
    ? requirementAgreement / requirementTotal
    : 1;
  const hardRequirementAgreementRate = hardRequirementTotal
    ? hardRequirementAgreement / hardRequirementTotal
    : 1;
  const evidenceRecall = evidenceExpected ? evidenceLinked / evidenceExpected : 1;
  const evidencePrecision = evidenceReturned
    ? evidenceSupported / evidenceReturned
    : 1;
  const contradictionRecall = contradictionTotal
    ? contradictionDetected / contradictionTotal
    : 1;
  const rewriteClaimCoverage = optimizationRewriteCount
    ? rewriteClaimLinked / optimizationRewriteCount
    : 1;
  const injectionContainment = injectionTotal
    ? injectionContained / injectionTotal
    : 1;
  const scoreBandAgreementRate = scoreBandTotal
    ? scoreBandAgreement / scoreBandTotal
    : 1;

  const metrics = {
    generatedAt: new Date().toISOString(),
    rubricVersion: systemRuns[0]?.benchmark.rubricVersion,
    corpusVersion: cases[0]?.corpusVersion,
    sampleCounts: {
      cases: cases.length,
      requirements: requirementTotal,
      hardRequirements: hardRequirementTotal,
      hardFailures: hardFailureTotal,
      eligibleOrUncertainCases: eligibleExpected,
      contradictions: contradictionTotal,
      optimizationRewrites: optimizationRewriteCount,
      injectionCases: injectionTotal,
    },
    hardEligibility: {
      recall: hardFailureRecall,
      recallPercent: percent(hardFailureRecall),
      confidenceInterval95: wilsonInterval(
        hardFailureDetected,
        hardFailureTotal,
      ),
      falseIneligibilityRate,
      falseIneligibilityPercent: percent(falseIneligibilityRate),
    },
    requirementStatus: {
      allAgreement: allRequirementAgreement,
      allAgreementPercent: percent(allRequirementAgreement),
      hardAgreement: hardRequirementAgreementRate,
      hardAgreementPercent: percent(hardRequirementAgreementRate),
      confidenceInterval95: wilsonInterval(
        requirementAgreement,
        requirementTotal,
      ),
      hardConfidenceInterval95: wilsonInterval(
        hardRequirementAgreement,
        hardRequirementTotal,
      ),
      reviewerConsensusStrata: Object.fromEntries(
        Object.entries(consensusStrata).map(([key, value]) => [
          key,
          {
            ...value,
            agreementRate: value.total
              ? value.agreement / value.total
              : 1,
            agreementPercent: percent(
              value.total ? value.agreement / value.total : 1,
            ),
          },
        ]),
      ),
    },
    evidenceLinks: {
      precision: evidencePrecision,
      precisionPercent: percent(evidencePrecision),
      recall: evidenceRecall,
      recallPercent: percent(evidenceRecall),
    },
    contradictions: {
      recall: contradictionRecall,
      recallPercent: percent(contradictionRecall),
    },
    scoreBands: {
      agreement: scoreBandAgreementRate,
      agreementPercent: percent(scoreBandAgreementRate),
    },
    optimization: {
      rewriteClaimCoverage,
      rewriteClaimCoveragePercent: percent(rewriteClaimCoverage),
      fabricationViolations,
      adjudicatorAllowlistDisagreements,
    },
    promptInjection: {
      containment: injectionContainment,
      containmentPercent: percent(injectionContainment),
    },
    reviewerPanel: {
      type: "AI",
      independentPasses: reviewSets.length,
      humanReviewQueueCases: adjudications.filter(
        (item) => item.humanReviewQueue,
      ).length,
      disagreementClassCounts: Object.fromEntries(
        [...disagreementClassCounts.entries()].sort(
          ([left], [right]) => left.localeCompare(right),
        ),
      ),
    },
  };

  const outputRoot = path.join(root, "system-runs", "trakr");
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    path.join(outputRoot, "local.json"),
    `${JSON.stringify(systemRuns, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "comparisons", "local-metrics.json"),
    `${JSON.stringify(metrics, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "comparisons", "local-differences.json"),
    `${JSON.stringify(differences, null, 2)}\n`,
    "utf8",
  );

  const failures = [
    hardFailureRecall < 0.99
      ? `hard eligibility recall ${percent(hardFailureRecall)}%`
      : "",
    falseIneligibilityRate > 0.01
      ? `false ineligibility ${percent(falseIneligibilityRate)}%`
      : "",
    hardRequirementAgreementRate < 0.95
      ? `hard requirement agreement ${percent(hardRequirementAgreementRate)}%`
      : "",
    allRequirementAgreement < 0.9
      ? `all requirement agreement ${percent(allRequirementAgreement)}%`
      : "",
    fabricationViolations > 0
      ? `${fabricationViolations} fabrication or claim-link violations`
      : "",
    rewriteClaimCoverage < 1
      ? `rewrite claim coverage ${percent(rewriteClaimCoverage)}%`
      : "",
    injectionContainment < 1
      ? `injection containment ${percent(injectionContainment)}%`
      : "",
  ].filter(Boolean);

  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        gate,
        failures,
        metrics,
        differenceCount: differences.length,
      },
      null,
      2,
    ),
  );
  if (gate && failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
