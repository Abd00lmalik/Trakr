# Trakr Ranking Evaluation

Generated: 2026-07-20T07:06:01.266Z

Evaluation date: 2026-07-16T12:00:00.000Z

## Corpus

- Personas: 60
- Opportunity fixtures: 25
- Archetypes: 12

## Metrics

| Metric | Result |
| --- | ---: |
| Precision@3 | 100.0% |
| Precision@5 | 100.0% |
| NDCG@5 | 97.4% |
| Recall@5 | 94.4% |
| Irrelevant result rate | 0.0% |
| False Apply Now rate | 0.0% |

## Baseline Comparison

| Metric | Baseline | Current | Change |
| --- | ---: | ---: | ---: |
| Precision@3 | 100.0% | 100.0% | 0.0% |
| Precision@5 | 100.0% | 100.0% | 0.0% |
| NDCG@5 | 83.3% | 97.4% | 14.1% |
| Recall@5 | 50.7% | 94.4% | 43.7% |
| Irrelevant result rate | 0.0% | 0.0% | 0.0% |
| False Apply Now rate | 0.0% | 0.0% | 0.0% |

## Weak Personas

Weak means Precision@3 below 80%, NDCG@5 below 75%, irrelevant result rate above 10%, or any false Apply Now.

| Persona | Precision@3 | NDCG@5 | Irrelevant | Top result |
| --- | ---: | ---: | ---: | --- |
| None | - | - | - | All personas met the weak-persona thresholds. |

## Method

The benchmark uses 60 fixed personas across 12 archetypes. Exact expected opportunities receive grade 3, category-and-domain matches grade 2, category-or-domain matches grade 1, and irrelevant results grade 0. Gemini is intentionally excluded because it does not reorder Trakr's deterministic ranking.
