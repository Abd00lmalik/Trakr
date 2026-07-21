# Service 2 Calibration Release Report

Review date: July 21, 2026

Service: Resume Benchmarking & Optimization

Public endpoint:
`POST https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`

## Verdict

Local calibration verdict: **GO**.

Production deployment verdict: pending the post-commit Railway deployment and
complete external restart. Service 3 remains blocked until that external gate
passes.

## Corpus And Review Panel

- 153 complete synthetic cases, corpus version `1.0.0`.
- Description: independently AI-reviewed and adjudicated synthetic benchmark
  corpus.
- Three independent blinded AI reviewer passes:
  - requirement and eligibility: `gpt-5.6-sol`, high reasoning;
  - evidence and truthfulness: `gpt-5.6-terra`, xhigh reasoning;
  - resume quality and optimization: `gpt-5.5`, xhigh reasoning.
- Separate blinded AI adjudication for every case.
- Reviewers did not see Trakr output, other reviewer decisions, or author-sealed
  expected risks.
- No human, recruiter, scholarship-panel, grant-panel, or expert validation is
  claimed.

## Research Foundation

The target snapshot remains the primary authority. The approved hierarchy then
uses official program rules, locale and document guidance, role-family
guidance, general career guidance, and finally social-media hypotheses.

The source record covers official employer guidance, government career
services, university career centers, public-sector systems, scholarship and
fellowship providers, grant organizations, NIH and NSF document rules, ATS
vendor documentation, accessibility guidance, and regional conventions.
Social-media findings are retained only as hypotheses and paired-test ideas.

Research files:

- `reports/service2-calibration-authoritative-research-2026-07-20.md`
- `reports/service2-calibration-social-research-2026-07-20.md`

## Calibration Results

| Metric | Result |
| --- | ---: |
| Cases | 153 |
| Requirements | 663 |
| Hard requirements | 108 |
| Labeled hard failures | 36 |
| Hard-failure recall | 100% |
| 95% Wilson interval | 90.36%-100% |
| False ineligibility | 0% |
| Hard-requirement agreement | 96.30% |
| All requirement-status agreement | 93.21% |
| 95% interval for all-status agreement | 91.04%-94.89% |
| Unanimous-label agreement | 99.25% |
| Evidence-link precision | 77.99% |
| Evidence-link recall | 69.76% |
| Contradiction recall | 100% |
| Rewrite claim coverage | 100% |
| Fabrication violations | 0 |
| Prompt-injection containment | 100% |

Score-band agreement is 52.29%. This is retained as a research metric, not a
release prediction metric, because reviewer score bands were less stable than
requirement and eligibility labels.

## Repairs

- Advanced the rubric from `resume-rubric-2026-07-20` to
  `resume-rubric-2026-07-21`.
- Replaced broad lexical overlap with bounded semantic concept matching.
- Added numeric experience, negative enrollment, enrollment contradiction,
  GPA, degree, doctorate, location, citizenship, certification, graduate
  admission, availability, and organization-registration handling.
- Separated hard eligibility from document-format noncompliance.
- Tightened qualifier-heavy and adjacent-role evidence.
- Rejected cross-domain certification and leadership equivalence after the
  first production matrix exposed cloud-certification/accounting-certification
  and software-leadership/audit-leadership confusion.
- Distinguished missing from claimed-but-unverified application artifacts.
- Preserved structured-background uncertainty.
- Linked each optimization rewrite only to its exact authorized source claim.
- Measured fabrication against the authoritative source claim ledger.
- Reported the one AI-adjudicator allowlist disagreement separately rather
  than misclassifying it as fabrication.

## Local Validation

Final local restart:

- 130 automated tests passed.
- Calibration gate passed.
- Typecheck passed.
- ESLint passed with zero warnings.
- Optimized Next.js build passed.
- PDF and DOCX parsing passed.
- Production-mode local smoke passed.
- Service 1 privacy, inventory, source verification, ranking, continuation,
  legacy compatibility, and contract tests passed.

## Inventory Monitoring

The non-blocking July 21 inventory snapshot fetched 557 records:

- 477 verified listings;
- 18 program directories;
- 0 inactive listings;
- 62 unverified listings;
- no critical monitoring alerts.

Warnings remain for 9 internships against a floor of 10, 3 scholarships
against a floor of 5, 4 grants against a floor of 5, and low known-deadline
coverage. Unverified records remain excluded from trusted Apply Now behavior.
DoraHacks and Encode Club remain exploration-only pending an official API,
feed, permission, partnership, or similarly reliable access method.

## Privacy And Fabrication Audit

- All corpus data is fictional and synthetic.
- No private resumes or personal social-media data were collected.
- Resume and target prompt injections remain quarantined.
- No invented employer, title, degree, date, certification, skill, project,
  award, publication, responsibility, or metric appeared in optimization.
- Every rewrite has an evidence claim ID.
- The caller-carried continuation remains opaque, encrypted, short-lived, and
  session-only.

## Remaining Risks

- Ninety-five cases remain queued for future qualified human review.
- Evidence-link agreement remains materially lower than eligibility agreement.
- Three unanimous residuals are conservative undercalls.
- AI reviewers cannot establish real recruiter, committee, or hiring-manager
  agreement.
- Score-band labels are not stable enough to support hiring or interview
  predictions.
- Opportunity inventory remains thinner for globally eligible internships,
  scholarships, grants, research funding, climate, and Africa-accessible roles.

## Artifacts

- Corpus manifest: `data/resume-calibration/v1/manifest.json`
- Synthetic cases and claim ledgers:
  `data/resume-calibration/v1/cases.json`
- Reviewer outputs: `data/resume-calibration/v1/reviews/`
- Adjudications: `data/resume-calibration/v1/adjudications/final.json`
- Trakr run: `data/resume-calibration/v1/system-runs/trakr/local.json`
- Metrics:
  `data/resume-calibration/v1/comparisons/local-metrics.json`
- Differences:
  `data/resume-calibration/v1/comparisons/local-differences.json`
- Rubric changelog: `reports/service2-rubric-changelog.md`
- Disagreement analysis:
  `reports/service2-calibration-disagreements-2026-07-21.md`
- Complete test log: `reports/service2-test-log.md`
- Inventory snapshot: `reports/inventory-monitoring-2026-07-21.json`

## Decision

The calibrated local capability receives **GO**.

Service 3 may begin only after this exact rubric is deployed, the complete
Service 2 production matrix passes from Test 1, all seven Service 1 journeys
pass, A2MCP metadata and free access remain compatible, and the final report is
updated with an external **GO**.
