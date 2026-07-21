import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  calibrationAdjudicationSchema,
  calibrationRoot,
  loadCalibrationCases,
} from "../src/lib/resume/calibration";

const partFiles = [
  "part-01.json",
  "part-02a.json",
  "part-02b.json",
  "part-02c.json",
  "part-03.json",
];

async function main() {
  const root = calibrationRoot();
  const adjudicationRoot = path.join(root, "adjudications");
  const cases = await loadCalibrationCases();
  const parts = await Promise.all(
    partFiles.map(async (file) => {
      const raw = await readFile(path.join(adjudicationRoot, file), "utf8");
      return z.array(calibrationAdjudicationSchema).parse(JSON.parse(raw));
    }),
  );
  const adjudications = parts.flat().sort((left, right) =>
    left.caseId.localeCompare(right.caseId),
  );
  const seen = new Set<string>();
  for (const item of adjudications) {
    if (seen.has(item.caseId)) {
      throw new Error(`Duplicate adjudication for ${item.caseId}.`);
    }
    seen.add(item.caseId);
  }
  const expectedIds = cases.map((item) => item.caseId);
  const actualIds = adjudications.map((item) => item.caseId);
  if (
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id, index) => id !== actualIds[index])
  ) {
    throw new Error(
      `Adjudication parts do not exactly cover the corpus: expected ${expectedIds.length}, received ${actualIds.length}.`,
    );
  }

  await mkdir(adjudicationRoot, { recursive: true });
  await writeFile(
    path.join(adjudicationRoot, "final.json"),
    `${JSON.stringify(adjudications, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        cases: adjudications.length,
        ambiguityCount: adjudications.filter(
          (item) => item.ambiguity.present,
        ).length,
        humanReviewQueueCount: adjudications.filter(
          (item) => item.humanReviewQueue,
        ).length,
        ineligibleCount: adjudications.filter(
          (item) => item.eligibility.decision === "ineligible",
        ).length,
        hardFailureCount: adjudications.reduce(
          (sum, item) =>
            sum + item.eligibility.hardFailureRequirementIds.length,
          0,
        ),
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
