# Service 2 Calibration Disagreement Analysis

Date: July 21, 2026

Corpus: 153 synthetic cases, 663 adjudicated requirements

Review status: independently AI-reviewed and adjudicated synthetic benchmark
corpus. No human or expert validation is claimed.

## Final Difference Profile

Trakr differs from the blinded AI adjudication on 45 of 663 requirement-status
labels.

| Expected -> Trakr | Count |
| --- | ---: |
| Unverified -> missing | 13 |
| Missing -> unverified | 10 |
| Inferred -> confirmed | 8 |
| Confirmed -> inferred | 6 |
| Unverified -> inferred | 5 |
| Missing -> not met | 1 |
| Inferred -> missing | 1 |
| Missing -> inferred | 1 |

Thirty-nine residuals have medium adjudication confidence, four have high
confidence, and two have low confidence. Thirty-five are already in the future
qualified-human-review queue.

## Reviewer Stability

| Reviewer support for adjudication | Requirements | Trakr agreement |
| --- | ---: | ---: |
| 3 of 3 | 401 | 99.25% |
| 2 of 3 | 128 | 85.94% |
| 1 of 3 | 134 | 82.09% |

This distribution is why the implementation was not changed merely to maximize
agreement. The published target and source claim ledger remain authoritative.

## Remaining Unanimous Differences

- `S2C-0045`: the AI panel treats AWS security plus IAM policy review as direct
  proof of cloud-security engineering; Trakr conservatively labels it inferred.
- `S2C-0085`: the panel treats data-management evidence as direct proof of
  data-quality procedures; Trakr conservatively labels it inferred after
  evidence compaction.
- `S2C-0130`: the panel treats data privacy plus onboarding records as direct
  proof of confidential-data handling; Trakr conservatively labels it inferred.

These are conservative undercalls, not fabricated qualifications or hidden
eligibility failures. They remain candidates for qualified human review.

## Systemic Repairs

- Requirement extraction: broadened numeric experience classification.
- Eligibility logic: added explicit numeric, enrollment, education, location,
  citizenship, certification, admission, availability, and registration rules.
- Evidence equivalence: added bounded role and task concepts while tightening
  adjacent-role and qualifier-heavy matches.
- Contradictions: preserved reversed timelines and conflicting enrollment.
- Artifacts: separated missing from claimed-but-unverified portfolios, reels,
  case studies, CVs, and writing samples.
- Optimization: exact rewrite-to-claim provenance and source-ledger
  fabrication checks.
- Reviewer uncertainty: added consensus strata, confidence intervals, and
  disagreement-class counts.

The machine-readable differences are in
`data/resume-calibration/v1/comparisons/local-differences.json`.
