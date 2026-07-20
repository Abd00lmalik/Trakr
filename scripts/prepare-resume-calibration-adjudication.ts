import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  calibrationReviewSchema,
  calibrationRoot,
  loadCalibrationCases,
  type CalibrationReview,
} from "../src/lib/resume/calibration";

const reviewFiles = [
  "requirement-eligibility.json",
  "evidence-truthfulness.json",
  "quality-optimization.json",
];

function canonical(value: unknown) {
  return JSON.stringify(value, (_, item) =>
    Array.isArray(item) ? [...item].sort() : item,
  );
}

function allEqual(values: unknown[]) {
  return values.every((value) => canonical(value) === canonical(values[0]));
}

function agreement(values: unknown[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = canonical(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(...counts.values()) / values.length;
}

function reviewAgreement(reviews: CalibrationReview[]) {
  const requirementIds = reviews[0].requirements.map(
    (requirement) => requirement.requirementId,
  );
  const requirementStatusValues = requirementIds.flatMap((requirementId) => {
    const values = reviews.map(
      (review) =>
        review.requirements.find(
          (requirement) => requirement.requirementId === requirementId,
        )?.status,
    );
    return [agreement(values)];
  });
  const requirementImportanceValues = requirementIds.flatMap(
    (requirementId) => {
      const values = reviews.map(
        (review) =>
          review.requirements.find(
            (requirement) => requirement.requirementId === requirementId,
          )?.importance,
      );
      return [agreement(values)];
    },
  );
  const evidenceLinkValues = requirementIds.flatMap((requirementId) => {
    const values = reviews.map(
      (review) =>
        review.requirements.find(
          (requirement) => requirement.requirementId === requirementId,
        )?.supportingClaimIds ?? [],
    );
    return [agreement(values)];
  });
  const dimensions = Object.keys(reviews[0].dimensionBands) as Array<
    keyof CalibrationReview["dimensionBands"]
  >;
  const dimensionValues = dimensions.map((dimension) =>
    agreement(reviews.map((review) => review.dimensionBands[dimension])),
  );
  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    requirementStatus: mean(requirementStatusValues),
    requirementImportance: mean(requirementImportanceValues),
    evidenceLinks: mean(evidenceLinkValues),
    eligibilityDecision: agreement(
      reviews.map((review) => review.eligibility.decision),
    ),
    hardFailures: agreement(
      reviews.map((review) => review.eligibility.hardFailureRequirementIds),
    ),
    dimensionBands: mean(dimensionValues),
    optimizationDisposition: agreement(
      reviews.map((review) => review.recommendations.optimizeDisposition),
    ),
    injectionDetection: agreement(
      reviews.map((review) => review.injectionDetected),
    ),
    exactConsensus:
      requirementIds.every((requirementId) => {
        const requirementReviews = reviews.map((review) =>
          review.requirements.find(
            (requirement) => requirement.requirementId === requirementId,
          ),
        );
        return (
          allEqual(requirementReviews.map((item) => item?.status)) &&
          allEqual(requirementReviews.map((item) => item?.importance)) &&
          allEqual(requirementReviews.map((item) => item?.supportingClaimIds))
        );
      }) &&
      allEqual(reviews.map((review) => review.eligibility.decision)) &&
      allEqual(
        reviews.map((review) => review.eligibility.hardFailureRequirementIds),
      ) &&
      dimensions.every((dimension) =>
        allEqual(reviews.map((review) => review.dimensionBands[dimension])),
      ) &&
      allEqual(
        reviews.map((review) => review.recommendations.optimizeDisposition),
      ) &&
      allEqual(reviews.map((review) => review.injectionDetected)),
  };
}

async function main() {
  const root = calibrationRoot();
  const cases = await loadCalibrationCases();
  const reviews = await Promise.all(
    reviewFiles.map(async (file) => {
      const raw = await readFile(path.join(root, "reviews", file), "utf8");
      return z.array(calibrationReviewSchema).parse(JSON.parse(raw));
    }),
  );
  const reviewMaps = reviews.map(
    (items) => new Map(items.map((item) => [item.caseId, item])),
  );
  const outputRoot = path.join(root, "adjudication-packets");
  await mkdir(outputRoot, { recursive: true });

  const caseResults = cases.map((item) => {
    const caseReviews = reviewMaps.map((map) => {
      const review = map.get(item.caseId);
      if (!review) throw new Error(`Missing review for ${item.caseId}.`);
      return review;
    });
    return {
      caseId: item.caseId,
      agreement: reviewAgreement(caseReviews),
      case: item,
      reviews: caseReviews,
    };
  });

  const packets = Array.from({ length: 9 }, (_, index) => {
    const packetNumber = index + 1;
    return {
      packetId: `S2A-${String(packetNumber).padStart(2, "0")}`,
      protocolVersion: "service2-calibration-adjudication-v1",
      blindedToTrakr: true,
      cases: caseResults.slice(index * 17, index * 17 + 17),
    };
  });
  for (const packet of packets) {
    await writeFile(
      path.join(
        outputRoot,
        `packet-${packet.packetId.slice(-2)}.json`,
      ),
      `${JSON.stringify(packet, null, 2)}\n`,
      "utf8",
    );
  }

  const exactConsensusCases = caseResults.filter(
    (item) => item.agreement.exactConsensus,
  ).length;
  const average = (
    field: keyof Omit<
      ReturnType<typeof reviewAgreement>,
      "exactConsensus"
    >,
  ) =>
    caseResults.reduce((sum, item) => sum + item.agreement[field], 0) /
    caseResults.length;
  const summary = {
    generatedAt: new Date().toISOString(),
    corpusCases: cases.length,
    reviewerCount: reviews.length,
    reviewerModels: reviews.map((items) => ({
      role: items[0]?.reviewerRole,
      model: items[0]?.model,
      configuration: items[0]?.modelConfiguration,
    })),
    exactConsensusCases,
    adjudicationRequiredCases: cases.length - exactConsensusCases,
    averageAgreement: {
      requirementStatus: average("requirementStatus"),
      requirementImportance: average("requirementImportance"),
      evidenceLinks: average("evidenceLinks"),
      eligibilityDecision: average("eligibilityDecision"),
      hardFailures: average("hardFailures"),
      dimensionBands: average("dimensionBands"),
      optimizationDisposition: average("optimizationDisposition"),
      injectionDetection: average("injectionDetection"),
    },
  };
  await writeFile(
    path.join(root, "reviews", "agreement-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
