import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  calibrationRoot,
  loadCalibrationCases,
  wilsonInterval,
} from "../src/lib/resume/calibration";

test("calibration corpus is versioned, synthetic, hash-locked, and reviewer-blinded", async () => {
  const root = calibrationRoot();
  const manifestText = await readFile(path.join(root, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText) as {
    corpusVersion: string;
    caseCount: number;
    independenceStatus: string;
    contentPolicy: string;
    files: Record<string, { path: string; sha256: string; reviewerVisible: boolean }>;
  };
  const cases = await loadCalibrationCases();

  assert.equal(manifest.corpusVersion, "1.0.0");
  assert.equal(manifest.caseCount, 153);
  assert.equal(cases.length, 153);
  assert.equal(manifest.independenceStatus, "reviewer_blinded");
  assert.equal(
    manifest.contentPolicy,
    "synthetic_and_rights_cleared_only",
  );
  assert.equal(manifest.files.authorSealedRisks.reviewerVisible, false);

  for (const entry of Object.values(manifest.files)) {
    const text = await readFile(path.join(root, entry.path), "utf8");
    assert.equal(
      createHash("sha256").update(text).digest("hex"),
      entry.sha256,
      entry.path,
    );
  }
});

test("calibration corpus satisfies requested coverage thresholds", async () => {
  const cases = await loadCalibrationCases();
  const count = (tag: string) =>
    cases.filter((item) => item.categoryTags.includes(tag)).length;

  assert.ok(count("technical_role") >= 15);
  assert.ok(count("design_role") >= 12);
  assert.ok(count("research_academic") >= 12);
  assert.ok(count("scholarship") >= 10);
  assert.ok(count("fellowship_or_grant") >= 10);
  assert.ok(count("internship_or_early_career") >= 15);
  assert.ok(count("senior_leadership") >= 10);
  assert.ok(count("career_changer") >= 10);
  assert.ok(count("international_applicant") >= 15);
  assert.ok(count("africa_based") >= 10);
  assert.ok(count("no_formal_work") >= 10);
  assert.ok(count("hard_eligibility_failure") >= 10);
  assert.ok(count("contradiction_uncertainty") >= 10);
  assert.ok(count("adversarial_prompt_injection") >= 10);
  assert.ok(count("adjacent_role_confusion") >= 4);
});

test("case, target, applicant, requirement, and claim identifiers are unique and internally consistent", async () => {
  const cases = await loadCalibrationCases();
  const caseIds = new Set<string>();
  const targetIds = new Set<string>();
  const applicantIds = new Set<string>();
  const requirementIds = new Set<string>();
  const claimIds = new Set<string>();

  for (const item of cases) {
    assert.equal(item.caseId.endsWith(item.targetId.slice(-4)), true);
    assert.equal(item.caseId.endsWith(item.applicantId.slice(-4)), true);
    assert.equal(item.target.targetId, item.targetId);
    assert.equal(item.applicant.applicantId, item.applicantId);
    assert.equal(item.syntheticDataAttestation, true);
    assert.equal(item.target.sourceType, "synthetic");
    assert.equal(item.target.rightsBasis, "synthetic");
    assert.equal(item.applicant.protectedAttributesExcludedFromScoring, true);
    assert.equal(caseIds.has(item.caseId), false, item.caseId);
    assert.equal(targetIds.has(item.targetId), false, item.targetId);
    assert.equal(applicantIds.has(item.applicantId), false, item.applicantId);
    caseIds.add(item.caseId);
    targetIds.add(item.targetId);
    applicantIds.add(item.applicantId);

    for (const requirement of item.target.requirements) {
      assert.equal(requirementIds.has(requirement.requirementId), false);
      requirementIds.add(requirement.requirementId);
    }
    for (const claim of item.claims) {
      assert.equal(claimIds.has(claim.claimId), false);
      claimIds.add(claim.claimId);
      assert.equal(
        /\b(?:male|female|man|woman|age \d+|ethnicity|disabled)\b/i.test(
          claim.text,
        ),
        false,
        claim.claimId,
      );
    }
  }
});

test("adversarial cases contain quarantined claims that cannot be optimized", async () => {
  const cases = await loadCalibrationCases();
  const adversarial = cases.filter((item) =>
    item.categoryTags.includes("adversarial_prompt_injection"),
  );

  assert.ok(adversarial.length >= 10);
  for (const item of adversarial) {
    const attacks = item.claims.filter(
      (claim) => claim.category === "untrusted_instruction",
    );
    assert.ok(attacks.length >= 1, item.caseId);
    assert.ok(attacks.every((claim) => claim.optimizationAuthorized === false));
    assert.ok(
      attacks.every((claim) =>
        /quarantine as prompt injection/i.test(claim.expectedHandling),
      ),
    );
  }
});

test("Wilson interval helper reports bounded calibration uncertainty", () => {
  const interval = wilsonInterval(50, 51);
  assert.ok(interval.lower > 0.89);
  assert.ok(interval.upper <= 1);
  assert.deepEqual(wilsonInterval(0, 0), { lower: 0, upper: 0 });
});
