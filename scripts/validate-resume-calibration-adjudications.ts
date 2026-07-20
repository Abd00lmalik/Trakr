import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  calibrationAdjudicationSchema,
  calibrationRoot,
  loadCalibrationCases,
} from "../src/lib/resume/calibration";

async function main() {
  const root = calibrationRoot();
  const cases = await loadCalibrationCases();
  const raw = await readFile(
    path.join(root, "adjudications", "final.json"),
    "utf8",
  );
  const adjudications = z
    .array(calibrationAdjudicationSchema)
    .parse(JSON.parse(raw));
  const seen = new Set<string>();
  let requirementCount = 0;
  let hardFailureCount = 0;
  let humanReviewQueueCount = 0;
  let ambiguousCount = 0;

  for (const adjudication of adjudications) {
    if (seen.has(adjudication.caseId)) {
      throw new Error(`Duplicate adjudication for ${adjudication.caseId}.`);
    }
    seen.add(adjudication.caseId);
    const item = cases.find((candidate) => candidate.caseId === adjudication.caseId);
    if (!item) {
      throw new Error(`Unknown adjudication case ${adjudication.caseId}.`);
    }
    const requirementIds = new Set(
      item.target.requirements.map((requirement) => requirement.requirementId),
    );
    const adjudicatedRequirementIds = new Set(
      adjudication.requirements.map(
        (requirement) => requirement.requirementId,
      ),
    );
    if (
      requirementIds.size !== adjudicatedRequirementIds.size ||
      [...requirementIds].some((id) => !adjudicatedRequirementIds.has(id))
    ) {
      throw new Error(
        `Adjudication did not cover every requirement for ${item.caseId}.`,
      );
    }
    const claimIds = new Set(item.claims.map((claim) => claim.claimId));
    const referencedClaims = [
      ...adjudication.requirements.flatMap((requirement) => [
        ...requirement.supportingClaimIds,
        ...requirement.prohibitedClaimIds,
      ]),
      ...adjudication.optimization.allowedClaimIds,
      ...adjudication.optimization.confirmationRequiredClaimIds,
    ];
    const unknownClaim = referencedClaims.find((id) => !claimIds.has(id));
    if (unknownClaim) {
      throw new Error(
        `Adjudication references unknown claim ${unknownClaim} in ${item.caseId}.`,
      );
    }
    const unknownFailure = adjudication.eligibility.hardFailureRequirementIds.find(
      (id) => !requirementIds.has(id),
    );
    if (unknownFailure) {
      throw new Error(
        `Adjudication references unknown hard failure ${unknownFailure} in ${item.caseId}.`,
      );
    }
    if (
      adjudication.eligibility.decision === "ineligible" &&
      adjudication.eligibility.hardFailureRequirementIds.length === 0
    ) {
      throw new Error(
        `Ineligible adjudication lacks a hard failure in ${item.caseId}.`,
      );
    }
    const attacks = item.claims.filter(
      (claim) => claim.category === "untrusted_instruction",
    );
    if (attacks.length && !adjudication.injectionDetected) {
      throw new Error(
        `Adjudication failed to detect injection in ${item.caseId}.`,
      );
    }
    if (
      attacks.some((attack) =>
        adjudication.optimization.allowedClaimIds.includes(attack.claimId),
      )
    ) {
      throw new Error(
        `Adjudication authorized an injected claim in ${item.caseId}.`,
      );
    }

    requirementCount += adjudication.requirements.length;
    hardFailureCount +=
      adjudication.eligibility.hardFailureRequirementIds.length;
    if (adjudication.humanReviewQueue) humanReviewQueueCount += 1;
    if (adjudication.ambiguity.present) ambiguousCount += 1;
  }

  if (seen.size !== cases.length) {
    const missing = cases
      .filter((item) => !seen.has(item.caseId))
      .map((item) => item.caseId);
    throw new Error(
      `Adjudicated ${seen.size}/${cases.length} cases; missing ${missing.join(", ")}.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        cases: adjudications.length,
        requirementCount,
        hardFailureCount,
        ambiguousCount,
        humanReviewQueueCount,
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
