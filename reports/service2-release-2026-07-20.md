# Service 2 Release Report

Date: July 20, 2026

Service: Resume Benchmarking & Optimization

Public endpoint: `POST https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`

Service identity: Agent #5198, Opportunity Matching API, A2MCP

## Verdict

**GO for Service 2.**

Resume Benchmarking & Optimization is available behind additive `benchmark`
and `optimize` operations. Service 3, Resume Generation, was not started.

## What Was Implemented

- Versioned deterministic rubric: `resume-rubric-2026-07-20`.
- Target-specific requirement extraction and evidence mapping.
- Separate eligibility status and hard-failure handling.
- Evidence statuses for confirmed, inferred, unverified, missing,
  contradictory, and not-met claims.
- Transparent alignment, parseability, terminology, evidence, structure, and
  accomplishment dimensions.
- Target-type context for technical, design, research, scholarship, grant,
  hackathon, academic, early-career, and senior workflows.
- Benchmark-before-optimize continuation flow.
- Benchmark compatibility fingerprints for target and session evidence.
- Canonical fingerprints that remain stable after encrypted session compaction.
- Known inventory URL resolution and safe unknown-URL handling.
- Natural-language benchmark and optimize routing.
- Consent withdrawal that purges profile, evidence, document references, and
  benchmark state.
- Shared sanitization of instruction-like resume/profile/target content before
  response and continuation construction.
- Optimization limited to explicit, confirmed evidence authorized for
  optimization; rewrites carry evidence claim IDs and confirmation flags.
- Additive A2MCP metadata/OpenAPI documentation for Service 2.
- Reusable local and deployed synthetic production smoke clients.

## Research And Rubric Foundation

The versioned research record is:

`reports/service2-rubric-research-2026-07-20.md`

It records official and high-quality guidance reviewed from USAJOBS, the UK
National Careers Service and Civil Service Careers, UC Berkeley career
guidance, NIH biosketch documentation, Europass, Microsoft Careers, Greenhouse
ATS material, W3C accessibility guidance, and Adobe PDF accessibility
guidance.

The system does not claim a universal resume template, universal ATS score, or
interview prediction. Fine-tuning was not introduced; versioned deterministic
rubrics, source-backed guidance, synthetic cases, and future expert labels are
more auditable for the current data volume.

## Inventory Improvements

The preceding inventory milestone remains closed and was revalidated after
Service 2 deployment:

- 559 records fetched and stored.
- 541 verified listings.
- 17 program directories.
- 1 inactive listing.
- 0 unverified listings.
- 0 source errors.
- Seven required external Opportunity Finding journeys passed.
- DoraHacks and Encode Club remain permission-required exploration sources.

No source, ranking authority, eligibility gate, or free-access behavior was
weakened.

## Defects Found And Fixed

1. Explicit benchmark and optimize operations were previously staged instead
   of executing.
2. URL-only target lookup returned before checking the URL.
3. Natural-language benchmark intent only recognized one word order.
4. Long target/profile values changed benchmark identity after continuation
   compaction.
5. Consent withdrawal initially allowed the withdrawal message to become
   profile evidence.
6. Natural `with React, TypeScript` background wording lost skills during
   service switching.
7. Malicious resume text was excluded from scoring but still appeared in the
   conversation profile and encrypted continuation.

Each defect received a root-cause fix, regression coverage, and a complete
relevant-suite restart. The final full local verification sequence passed after
the last fix.

## Code Commits

- `37a65e9` Implement grounded resume benchmarking and optimization.
- `3dfde7a` Contain untrusted resume content across sessions.

## Automated Tests

Final local `npm run verify`:

- 118 automated tests passed.
- Typecheck passed.
- ESLint passed with zero warnings.
- Optimized Next.js build passed.
- Production-mode local API smoke passed.
- PDF/DOCX resume parsing smoke passed.
- Existing ranking benchmark passed: Precision@3 100%, Precision@5 100%,
  NDCG@5 97.4%, Recall@5 94.4%, irrelevant result rate 0%, false Apply Now
  rate 0%.

CI:

- Commit `37a65e9`: success,
  `https://github.com/Abd00lmalik/Trakr/actions/runs/29756494077`
- Commit `3dfde7a`: success,
  `https://github.com/Abd00lmalik/Trakr/actions/runs/29757347958`

## Production Journey Results

Deployed Service 2 matrix:

- 20/20 external cases passed.
- Health, metadata, OpenAPI, and dependency readiness passed.
- Legacy structured Service 1 request remained direct and compatible.
- Resume benchmark returned target-specific evidence mappings.
- Optimize continued from the compatible benchmark.
- Natural-language benchmark routing worked.
- Known inventory URL resolved.
- Unknown URL requested pasted target evidence without scraping.
- Hard eligibility failure returned `not_met` and capped the score.
- Designer, research, scholarship, grant, non-technical, academic CV,
  wrong-target, and contradictory-timeline cases passed.
- Consent denial returned no benchmark and no resume echo.
- Prompt injection was absent from benchmark output, profile response,
  continuation, and optimization output.
- Idempotency replay returned `X-Idempotency-Status: replayed`; body conflict
  returned HTTP 409.
- Oversized and malformed requests returned structured HTTP 400 errors.

Service 1 regression matrix:

- 7/7 required external Opportunity Finding journeys passed after deployment.
- No duplicate canonical URLs, expired/inactive results, unsafe Apply Now
  actions, contact leakage, senior-role mismatch, or interior-design mismatch.
- Honest empty and limited coverage remained intact.

## External Availability

Railway served the deployed service independently of the local development
server. External checks returned:

- Health HTTP 200 and `ok: true`.
- Gemini configured.
- PostgreSQL connected.
- pgvector connected.
- A2MCP metadata version `0.4.0`.
- Service 2 status `available`.
- Public endpoint reachable from an external HTTP client.

This proves the meaningful deployment requirement: the service is hosted and
callable without a local Trakr process, local filesystem, IDE, or terminal
serving the API. Literal physical shutdown of the user's computer was not
performed and cannot be claimed from this environment.

## OKX/A2MCP Compatibility

- Public endpoint remained unchanged:
  `POST /api/a2mcp/recommend`.
- Agent #5198 listing identity remained unchanged.
- Existing valid legacy requests remained compatible.
- Service remained free.
- `onchainos payment quote` using the real endpoint and `--method POST`
  returned HTTP 200 with no payment challenge and amount 0.
- No payment was attempted or confirmed.
- No payment behavior was introduced or modified.

## Privacy And Fabrication Audit

- Session state remains encrypted, short-lived, and caller-carried.
- Resume documents are represented by references in continuation state, not raw
  document blobs.
- Unknown or malicious target URLs are not fetched automatically.
- Contact details were not returned in tested resume responses.
- Prompt-like profile and target content is removed at the shared untrusted
  content boundary.
- Optimization output uses explicit confirmed evidence authorized for
  optimization.
- Metrics, employers, titles, degrees, dates, certifications, achievements,
  and skills are not invented.
- Every rewrite carries an evidence claim ID and requires factual confirmation.

## Remaining Product Risks

- The rubric is deterministic and auditable, but still requires expert-labeled
  cases before claiming high agreement with human reviewers.
- ATS readiness remains a document heuristic; Trakr does not reproduce any
  particular employer's parser or hiring decision.
- Research, scholarship, grant, climate, and globally eligible internship
  inventory remains thinner than job inventory.
- Source eligibility often cannot establish an applicant's work authorization.
- Target URLs outside verified Trakr inventory require caller-supplied
  descriptions or dated snapshots.
- Locale guidance is evidence-backed but not a substitute for target-specific
  instructions.

## Complete Test Log

- [Service 2 test log](service2-test-log.md)
- [Service 2 rubric research](service2-rubric-research-2026-07-20.md)
- [Service 1 test log](service1-test-log.md)
- [Inventory improvement report](inventory-improvement-2026-07-20.md)

## Final Decision

**GO for Service 2.**

Do not begin Service 3 until the next milestone is explicitly authorized.
The recommended next milestone is a human-reviewed benchmark corpus and
rubric calibration pass, followed by controlled readiness and skill-gap
capabilities that consume the same target/evidence ledger.
