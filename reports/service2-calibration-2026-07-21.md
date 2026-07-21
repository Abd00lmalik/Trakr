# Service 2 Calibration Release Report

Review date: July 21, 2026

Service: Resume Benchmarking & Optimization

Public endpoint:
`POST https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`

## Verdict

Calibration and production verdict: **GO**.

The calibrated rubric, cross-domain evidence repair, complete Service 2
production matrix, all seven Service 1 regression journeys, CI, A2MCP
metadata, OpenAPI, external availability, and free-access compatibility passed
on July 21, 2026. Service 3 may begin as a separate milestone.

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

The first production restart on commit `23804af` passed 19 of 20 cases.
`S2-PROD-019-strong-resume-wrong-target` failed because a fictional cloud
certification was credited toward a required accounting certification and
generic software-team leadership was credited toward audit leadership. The
root cause was cross-domain semantic concepts that were too broad. Commit
`483f73d` added domain-qualified accounting-certification and audit-leadership
rules plus regression coverage. The complete local and production sequences
were then restarted from Test 1.

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

GitHub Actions run
`https://github.com/Abd00lmalik/Trakr/actions/runs/29796270302` completed
successfully for commit `483f73d`.

## Production Validation

- Railway health returned HTTP 200 with database, pgvector, privacy logging,
  source verification, and AI configuration ready.
- The complete Service 2 production matrix passed 20 of 20 from Test 1.
- The complete Service 1 production journey set passed 7 of 7 from Test 1.
- The repaired financial-controller case reported accounting certification,
  financial reporting, and audit leadership as missing, with no unrelated
  evidence attached.
- Legacy structured discovery remained compatible.
- Benchmark-to-optimize continuation, consent denial, idempotent replay,
  idempotency conflict, prompt-injection containment, known and unknown target
  URLs, malformed JSON, and oversized input behavior passed.
- A2MCP metadata and OpenAPI remained at additive version `0.4.0`.
- The public endpoint remained
  `POST https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`.
- The Railway-hosted service responded independently of localhost, the local
  development server, and the local filesystem. Literal physical shutdown of
  the test computer was not performed.

## OKX And Free Access

An **OKX Agent Payments Protocol** quote against the public POST endpoint
returned HTTP 200 with no payment challenge, no accepted payment schemes,
`needsConfirm: false`, and amount zero. No payment was attempted. Agent #5198,
the service title `Opportunity Matching API`, A2MCP compatibility, and free
access remain unchanged.

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
- The protocol probe used integrity-verified `onchainos` CLI v4.2.6. A Windows
  file lock prevented replacing the running binary with v4.3.0; this did not
  affect the successful HTTP 200 no-payment result.

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

The Service 2 calibration milestone receives **GO** on July 21, 2026.

Service 3 may begin as a new, independently gated milestone. This decision does
not claim human validation, expert consensus, hiring prediction accuracy, or
agreement with real recruiters or selection committees.
