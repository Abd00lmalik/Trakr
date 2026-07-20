import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  calibrationInputHash,
  calibrationReviewSchema,
  calibrationRoot,
  loadCalibrationCases,
} from "../src/lib/resume/calibration";

const reviewFiles = [
  "requirement-eligibility.json",
  "evidence-truthfulness.json",
  "quality-optimization.json",
];

async function main() {
  const cases = await loadCalibrationCases();
  const caseById = new Map(cases.map((item) => [item.caseId, item]));
  const summaries = [];

  for (const file of reviewFiles) {
    const raw = await readFile(
      path.join(calibrationRoot(), "reviews", file),
      "utf8",
    );
    const reviews = z.array(calibrationReviewSchema).parse(JSON.parse(raw));
    const seen = new Set<string>();

    for (const review of reviews) {
      if (seen.has(review.caseId)) {
        throw new Error(`${file} contains duplicate review for ${review.caseId}.`);
      }
      seen.add(review.caseId);
      const item = caseById.get(review.caseId);
      if (!item) {
        throw new Error(`${file} contains unknown case ${review.caseId}.`);
      }
      if (review.inputHash !== calibrationInputHash(item)) {
        throw new Error(`${file} input hash mismatch for ${review.caseId}.`);
      }

      const expectedRequirements = new Set(
        item.target.requirements.map((requirement) => requirement.requirementId),
      );
      const reviewedRequirements = new Set(
        review.requirements.map((requirement) => requirement.requirementId),
      );
      if (
        expectedRequirements.size !== reviewedRequirements.size ||
        [...expectedRequirements].some((id) => !reviewedRequirements.has(id))
      ) {
        throw new Error(
          `${file} did not review every published requirement for ${review.caseId}.`,
        );
      }

      const claimIds = new Set(item.claims.map((claim) => claim.claimId));
      const referencedClaimIds = [
        ...review.requirements.flatMap((requirement) => [
          ...requirement.supportingClaimIds,
          ...requirement.prohibitedClaimIds,
        ]),
        ...review.optimization.allowedClaimIds,
        ...review.optimization.confirmationRequiredClaimIds,
      ];
      const unknownClaim = referencedClaimIds.find((id) => !claimIds.has(id));
      if (unknownClaim) {
        throw new Error(
          `${file} references unknown claim ${unknownClaim} in ${review.caseId}.`,
        );
      }

      const attacks = item.claims.filter(
        (claim) => claim.category === "untrusted_instruction",
      );
      if (attacks.length && !review.injectionDetected) {
        throw new Error(
          `${file} failed to detect prompt injection in ${review.caseId}.`,
        );
      }
      if (
        attacks.some((attack) =>
          review.optimization.allowedClaimIds.includes(attack.claimId),
        )
      ) {
        throw new Error(
          `${file} authorized an injected claim in ${review.caseId}.`,
        );
      }
    }

    if (seen.size !== cases.length) {
      const missing = cases
        .filter((item) => !seen.has(item.caseId))
        .map((item) => item.caseId);
      throw new Error(
        `${file} reviewed ${seen.size}/${cases.length} cases; missing ${missing.join(", ")}.`,
      );
    }

    summaries.push({
      file,
      reviewerRole: reviews[0]?.reviewerRole,
      model: reviews[0]?.model,
      caseCount: reviews.length,
      requirementCount: reviews.reduce(
        (sum, review) => sum + review.requirements.length,
        0,
      ),
      ineligibleCount: reviews.filter(
        (review) => review.eligibility.decision === "ineligible",
      ).length,
      ambiguousCount: reviews.filter((review) => review.ambiguity).length,
      injectionCount: reviews.filter((review) => review.injectionDetected)
        .length,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        corpusCases: cases.length,
        reviewers: summaries,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
