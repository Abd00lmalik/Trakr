import assert from "node:assert/strict";
import test from "node:test";
import { evaluationPersonas } from "../evaluation/personas";
import {
  evaluateRanking,
  evaluationCatalog,
} from "../src/lib/recommendation/evaluation";

test("evaluation corpus contains 50 to 100 representative personas", () => {
  assert.equal(evaluationPersonas.length, 60);
  assert.equal(
    new Set(evaluationPersonas.map((persona) => persona.archetype)).size,
    12,
  );
  for (const persona of evaluationPersonas) {
    assert.ok(persona.expected.opportunityIds.length >= 5);
    assert.ok(persona.expected.categories.length >= 1);
    assert.ok(persona.expected.signals.length >= 3);
  }
});

test("ranking benchmark produces all required metrics", () => {
  const report = evaluateRanking(evaluationPersonas);
  assert.equal(report.personaCount, 60);
  assert.equal(report.catalogSize, evaluationCatalog.length);
  assert.equal(report.personas.length, 60);

  for (const metric of [
    report.metrics.precisionAt3,
    report.metrics.precisionAt5,
    report.metrics.ndcgAt5,
    report.metrics.recall,
    report.metrics.irrelevantResultRate,
    report.metrics.falseApplyNowRate,
  ]) {
    assert.ok(metric >= 0 && metric <= 1);
  }
});

test("benchmark protects minimum ranking quality and Apply Now safety", () => {
  const report = evaluateRanking(evaluationPersonas);
  assert.ok(report.metrics.precisionAt3 >= 0.8);
  assert.ok(report.metrics.precisionAt5 >= 0.75);
  assert.ok(report.metrics.ndcgAt5 >= 0.83);
  assert.ok(report.metrics.recall >= 0.35);
  assert.ok(report.metrics.irrelevantResultRate <= 0.1);
  assert.equal(report.metrics.falseApplyNowRate, 0);
});
