import { mkdir, readFile, writeFile } from "node:fs/promises";
import { evaluationPersonas } from "../evaluation/personas";
import {
  evaluateRanking,
  type RankingEvaluationReport,
} from "../src/lib/recommendation/evaluation";

function percentage(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const report = evaluateRanking(evaluationPersonas);
  const baseline = await readFile(
    "reports/ranking-evaluation-baseline.json",
    "utf8",
  )
    .then((value) => JSON.parse(value) as RankingEvaluationReport)
    .catch(() => null);
  const weakRows = report.weakPersonas.length
    ? report.weakPersonas
        .slice(0, 15)
        .map(
          (persona) =>
            `| ${persona.id} | ${percentage(persona.precisionAt3)} | ${percentage(
              persona.ndcgAt5,
            )} | ${percentage(persona.irrelevantResultRate)} | ${
              persona.topResults[0]?.title ?? "No result"
            } |`,
        )
        .join("\n")
    : "| None | - | - | - | All personas met the weak-persona thresholds. |";

  const baselineComparison = baseline
    ? `## Baseline Comparison

| Metric | Baseline | Current | Change |
| --- | ---: | ---: | ---: |
| Precision@3 | ${percentage(baseline.metrics.precisionAt3)} | ${percentage(report.metrics.precisionAt3)} | ${percentage(report.metrics.precisionAt3 - baseline.metrics.precisionAt3)} |
| Precision@5 | ${percentage(baseline.metrics.precisionAt5)} | ${percentage(report.metrics.precisionAt5)} | ${percentage(report.metrics.precisionAt5 - baseline.metrics.precisionAt5)} |
| NDCG@5 | ${percentage(baseline.metrics.ndcgAt5)} | ${percentage(report.metrics.ndcgAt5)} | ${percentage(report.metrics.ndcgAt5 - baseline.metrics.ndcgAt5)} |
| Recall@5 | ${percentage(baseline.metrics.recall)} | ${percentage(report.metrics.recall)} | ${percentage(report.metrics.recall - baseline.metrics.recall)} |
| Irrelevant result rate | ${percentage(baseline.metrics.irrelevantResultRate)} | ${percentage(report.metrics.irrelevantResultRate)} | ${percentage(report.metrics.irrelevantResultRate - baseline.metrics.irrelevantResultRate)} |
| False Apply Now rate | ${percentage(baseline.metrics.falseApplyNowRate)} | ${percentage(report.metrics.falseApplyNowRate)} | ${percentage(report.metrics.falseApplyNowRate - baseline.metrics.falseApplyNowRate)} |
`
    : "";

  const markdown = `# Trakr Ranking Evaluation

Generated: ${report.generatedAt}

Evaluation date: ${report.evaluationDate}

## Corpus

- Personas: ${report.personaCount}
- Opportunity fixtures: ${report.catalogSize}
- Archetypes: ${new Set(evaluationPersonas.map((persona) => persona.archetype)).size}

## Metrics

| Metric | Result |
| --- | ---: |
| Precision@3 | ${percentage(report.metrics.precisionAt3)} |
| Precision@5 | ${percentage(report.metrics.precisionAt5)} |
| NDCG@5 | ${percentage(report.metrics.ndcgAt5)} |
| Recall@5 | ${percentage(report.metrics.recall)} |
| Irrelevant result rate | ${percentage(report.metrics.irrelevantResultRate)} |
| False Apply Now rate | ${percentage(report.metrics.falseApplyNowRate)} |

${baselineComparison}
## Weak Personas

Weak means Precision@3 below 80%, NDCG@5 below 75%, irrelevant result rate above 10%, or any false Apply Now.

| Persona | Precision@3 | NDCG@5 | Irrelevant | Top result |
| --- | ---: | ---: | ---: | --- |
${weakRows}

## Method

The benchmark uses 60 fixed personas across 12 archetypes. Exact expected opportunities receive grade 3, category-and-domain matches grade 2, category-or-domain matches grade 1, and irrelevant results grade 0. Gemini is intentionally excluded because it does not reorder Trakr's deterministic ranking.
`;

  await mkdir("reports", { recursive: true });
  await Promise.all([
    writeFile(
      "reports/ranking-evaluation.json",
      `${JSON.stringify(report, null, 2)}\n`,
    ),
    writeFile("reports/ranking-evaluation.md", markdown),
  ]);
  console.log(markdown);
}

void main();
