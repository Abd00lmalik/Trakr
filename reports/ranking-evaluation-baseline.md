# Trakr Ranking Evaluation

Generated: 2026-07-16T18:23:32.579Z

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
| NDCG@5 | 83.3% |
| Recall@5 | 50.7% |
| Irrelevant result rate | 0.0% |
| False Apply Now rate | 0.0% |

## Weak Personas

Weak means Precision@3 below 80%, NDCG@5 below 75%, irrelevant result rate above 10%, or any false Apply Now.

| Persona | Precision@3 | NDCG@5 | Irrelevant | Top result |
| --- | ---: | ---: | ---: | --- |
| ai-engineer-core | 100.0% | 58.1% | 0.0% | MLH Open Source Fellowship |
| startup-founder-core | 100.0% | 58.4% | 0.0% | ETHGlobal Online Buildathon |
| startup-founder-portfolio | 100.0% | 58.4% | 0.0% | ETHGlobal Online Buildathon |
| startup-founder-technical | 100.0% | 58.4% | 0.0% | ETHGlobal Online Buildathon |
| startup-founder-career | 100.0% | 58.4% | 0.0% | ETHGlobal Online Buildathon |
| startup-founder-community | 100.0% | 70.4% | 0.0% | Public Goods Builder Grant |
| creator-career | 100.0% | 72.3% | 0.0% | Developer Student Scholarship |
| ml-researcher-core | 100.0% | 74.4% | 0.0% | MLH Open Source Fellowship |

## Method

The benchmark uses 60 fixed personas across 12 archetypes. Exact expected opportunities receive grade 3, category-and-domain matches grade 2, category-or-domain matches grade 1, and irrelevant results grade 0. Gemini is intentionally excluded because it does not reorder Trakr's deterministic ranking.
