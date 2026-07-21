# Service 3 Release Report

Date: July 21, 2026

Service: Resume Generation

Public endpoint: `POST https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`

Service identity: Agent #5198, Opportunity Matching API, A2MCP

## Verdict

**GO for Service 3.**

Resume Generation is available through the additive `generate_resume`
operation. It is target-first, selects the appropriate application artifact,
and generates only from confirmed evidence authorized for generation.

## What Was Implemented

- Target-first conversational generation.
- Focused requests for missing target or applicant evidence.
- Natural-language and explicit `generate_resume` routing.
- Artifact selection across:
  - Private-sector and internship resumes.
  - Academic and research CVs.
  - Biosketches.
  - Scholarship CVs.
  - Fellowship and grant profiles.
  - Hackathon and team-member profiles.
  - Technical-project resumes.
  - Design portfolio resumes.
  - General professional profiles.
- Locale, output format, page-limit, and sanitized target-instruction metadata.
- Claim-level provenance for every non-placeholder applicant statement.
- Questions, marked placeholders, or omissions for missing facts.
- Continuation, service switching, consent withdrawal, idempotency, and
  structured error behavior.
- Additive A2MCP metadata and OpenAPI version `0.5.0`.
- Three visible UI services with immediate natural-language entry.

## Research Foundation

Rubric version: `resume-generation-rubric-2026-07-21`

The product foundation is documented in
[service3-research-2026-07-21.md](service3-research-2026-07-21.md).

The research uses current official or authoritative guidance from Harvard FAS
career services, the UK National Careers Service, UK Civil Service Careers,
Europass, Chevening, NIH, NSF, W3C WCAG 2.2, and Section508.gov.

The published target remains the primary authority. Trakr does not claim one
universal resume format, ATS score, or certified NIH/NSF submission artifact.
Fine-tuning was not introduced; versioned rules, deterministic evidence
controls, and synthetic regression cases are more auditable for this
milestone.

## Evidence And Claim Model

Generation requires:

1. A target opportunity, objective, or application requirement.
2. Confirmed applicant evidence allowed for `generation`.
3. A document type selected from target instructions and opportunity context.

Every generated applicant statement includes supporting claim IDs unless it is
explicitly marked as a placeholder. Target requirements are not converted into
applicant history. Unconfirmed information is not silently strengthened.

The service never invents employers, titles, dates, degrees, certifications,
skills, projects, publications, awards, metrics, revenue, team sizes,
responsibilities, leadership, research findings, links, or eligibility.

## Synthetic Corpus

`evaluation/service3-generation-corpus-v1.json` contains 15 versioned,
privacy-safe cases covering:

- Students and early-career applicants.
- Private-sector, internship, scholarship, fellowship, grant, research,
  academic, hackathon, technical-project, design, and team profiles.
- Missing target and missing evidence.
- Unsupported or ambiguous claims.
- Locale and artifact selection.
- Prompt injection and contradiction handling.

All names, resumes, profiles, achievements, and metrics are synthetic.

## Defects Found And Fixed

1. Production readiness originally omitted the new inventory metadata schema.
   - Added `inventoryMetadataReady` and blocked healthy status until ready.
2. Scheduled ingestion did not migrate before writing the new metadata.
   - Added the migration step before ingestion.
3. The migration workflow initially received HTTP 401.
   - Admin migration now accepts either configured operator key.
4. The first Service 3 external attempt encountered transient Railway
   connection failures.
   - No generation defect was found.
   - The full production sequence was restarted and passed 17/17.
5. Shared readiness changes occurred after that successful run.
   - Service 3 was rerun again after migration and ingestion and passed 17/17.

## Code Commits

- `dc48170` Add inventory hardening and resume generation.
- `1aef328` Harden production inventory readiness.
- `d75e5d4` Accept ingestion key for database migration.

## Automated Validation

Final local `npm run verify`:

- 156 automated tests passed.
- Service 2 153-case calibration gate passed.
- Hard eligibility recall remained 100%.
- Hard-requirement agreement remained 96.3%.
- All-requirement agreement remained 93.21%.
- Fabrication violations remained 0.
- Prompt-injection containment remained 100%.
- Typecheck passed.
- ESLint passed with zero warnings.
- Optimized production build passed.
- PDF and DOCX parsing passed.
- Local production-mode smoke passed.

CI:

- GitHub Actions run `29821584292` passed for commit `d75e5d4`.
- Production migration and ingestion run `29823188451` passed.

## Production Journey Results

The final post-migration Railway sequence ran at
`2026-07-21T11:29:04.103Z` and passed 17/17:

- Health, metadata, OpenAPI, database, and inventory readiness.
- Legacy Service 1 compatibility.
- Missing-target and missing-evidence gates.
- Resume intake and natural-language generation.
- Research fellowship, scholarship, grant, hackathon/team, internship, and
  private-sector artifact selection.
- Service switching and encrypted continuation.
- Prompt-injection containment.
- Unsupported-claim omission.
- Consent withdrawal.
- Idempotent replay and conflict detection.
- Oversized and malformed structured errors.

Shared external regressions:

- Service 1 passed 7/7.
- Service 2 passed 20/20.
- The public endpoint and legacy contract remained unchanged.
- The deployed first screen showed all three service choices and an immediate
  natural-language textbox, with no horizontal overflow or browser console
  errors at the tested 1280px viewport.

## External Availability

Railway health returned HTTP 200 with:

- `status: ok`
- PostgreSQL connected.
- pgvector ready.
- Schema ready.
- Privacy logging ready.
- Source verification ready.
- Inventory metadata ready.

This demonstrates that Railway serves Service 3 without a local Trakr process,
local filesystem, local development server, or interactive browser state.
Literal physical shutdown of the user's computer was not performed and is not
claimed.

## OKX/A2MCP Compatibility

- Public endpoint remains `POST /api/a2mcp/recommend`.
- A2MCP metadata and OpenAPI report version `0.5.0`.
- Operations remain additive: `discover`, `benchmark`, `optimize`, and
  `generate_resume`.
- Agent #5198 and the existing service identity remain unchanged.
- The final **OKX Agent Payments Protocol** quote returned HTTP 200,
  `accepts: []`, amount 0, and `needsConfirm: false`.
- No payment challenge was returned and no payment was attempted.
- The installed CLI `4.2.6` passed integrity validation. Updating to `4.3.0`
  was attempted but Windows denied replacement of the running binary; this did
  not affect the successful quote.

## Privacy, Fabrication, And Injection Audit

- Continuation state is encrypted, opaque, short-lived, and caller-carried.
- Uploaded documents are represented by references; raw document blobs are
  not stored in continuation tokens.
- Contact data and raw resumes are not logged by the privacy-safe event path.
- Consent withdrawal clears profile, evidence, document, and generation state.
- Resume- and target-embedded instruction attacks are sanitized before profile,
  evidence, continuation, and generation construction.
- Every non-placeholder generated statement is linked to confirmed claim IDs.
- Unsupported claims are omitted instead of softened or embellished.
- The final local and production runs found zero invented applicant facts.

## Remaining Product Risks

- Generated output is an evidence-linked draft and requires user review.
- Locale support selects artifact and output metadata but does not yet provide
  a complete rendered template library for every jurisdiction.
- Trakr does not issue certified NIH, NSF, or other agency forms.
- Target URLs outside verified Trakr inventory still require caller-supplied
  descriptions or a stable snapshot.
- Rich DOCX/PDF export, layout validation, and accessibility inspection of
  final rendered documents remain future work.
- Opportunity inventory remains thin for internships, scholarships,
  fellowships, climate programs, research placements, and globally verified
  Africa-accessible opportunities.

## Complete Test Log

- [Service 3 test log](service3-test-log.md)
- [Service 3 research foundation](service3-research-2026-07-21.md)
- [Service 3 synthetic corpus](../evaluation/service3-generation-corpus-v1.json)
- [Inventory hardening release](inventory-hardening-release-2026-07-21.md)
- [Service 1 test log](service1-test-log.md)
- [Service 2 test log](service2-test-log.md)

## Final Decision

**GO for Service 3.**

The service passed its complete local, CI, production, regression, privacy,
fabrication, injection, and free-access gates. All three visible services are
now available through one additive A2MCP endpoint.
