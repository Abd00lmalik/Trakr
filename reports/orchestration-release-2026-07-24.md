# Trakr Trust And Orchestration Release Report

Date: July 24, 2026

Public endpoint:
`POST https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`

Agent: `#5198`

API version: `0.7.0`

## Verdict

**NO-GO for the complete external-orchestration milestone.**

The Trakr deployment, all three services, privacy controls, fabrication
controls, visible response contract, local release gate, Railway journeys,
GitHub CI, hosted production canaries, and free-payment compatibility pass.

Two external presentation requirements remain incomplete:

- Agent #5198's OKX service listing still says `Opportunity Matching API` and
  advertises only opportunity recommendations.
- A fresh Antigravity cold-start-to-visible-link transcript was not captured
  in the final run.

No service rollback is required. The deployed service remains operational.

## Root Causes

- Learning and developer resources were encoded as scholarships in the curated
  catalogue, so taxonomy and scoring treated them as funded opportunities.
- Recommendation URLs existed in nested records, while the visible message and
  OpenAPI contract did not require callers to display them.
- Structured caller profiles lacked field-level origin and confirmation, so an
  external agent could submit guessed facts as if the user had supplied them.
- Scholarship intake reused job-oriented profile fields and missed explicit
  education, nationality, residence, target-degree, and study-country facts.
- Broad Africa tags could override explicit country allowlists.
- Applicant nationality and residence were not consistently propagated into
  opportunity filtering.
- Encoded source markup leaked into visible eligibility summaries.
- Local and production smoke tests assumed nonempty recommendations, which
  conflicted with the product rule that honest empty inventory is preferable.
- Production smoke clients lacked bounded network timeouts and rate-limit
  retries.

## Implemented Corrections

- Added direct opportunities, explore programs, supporting resources, and
  per-category coverage as separate response collections.
- Added typed `officialUrl`, application/source metadata, deadline state,
  eligibility summary, geography summary, verification state, and
  recommendation state.
- Added official URLs to the human-readable message.
- Added `callerInstructions` requiring continuation preservation, no inferred
  profiles, and visible official links.
- Added top-level version, request ID, operation, stage, status, selected
  service, required inputs, next actions, and continuation.
- Added field-level profile provenance, confirmation state, confidence, claim
  IDs, and allowed use.
- Caller-structured profiles now require confirmation before matching.
- Resume uploads return an extracted profile confirmation step.
- Added multipart recommendation upload while preserving base64 and extracted
  text compatibility.
- Added scholarship-specific education and geographic intake parsing.
- Bound numeric choices to the continuation stage that issued them.
- Added contextual country eligibility enforcement and separated broad region
  discovery evidence from country eligibility.
- Added bounded visible eligibility summaries and decoded source markup.
- Added a dedicated production trust suite.

## Catalogue Reclassification

The following records are no longer scholarships:

| Record | Correct Type | Direct Coverage |
| --- | --- | --- |
| Microsoft Learn Student Hub | `learning_resource` | No |
| GitHub Education Student Developer Pack | `student_benefit` | No |
| Google Developer Programs | `developer_program` | No |

Catalogue review also moved generic job boards, startup support pages, and
program directories into directory/resource states where appropriate. These
records cannot receive `Apply Now` unless they represent a verified active
direct opportunity.

## Scholarship Inventory

The verified direct scholarship inventory now includes:

- `Rhodes Scholarship for West Africa 2027`
- Official provider: Rhodes Trust
- Deadline: August 27, 2026 at 23:59 GMT
- Current-cycle status: confirmed
- Country eligibility: explicit West Africa country allowlist, including
  Nigeria
- Recommendation state: `apply_now`

The Southern Africa call remains a separate record with its own explicit
country and permanent-residency rules. It is not returned to a Nigerian
applicant solely because both records mention Africa.

The final trust run found one verified matching scholarship and no qualifying
internship for the synthetic profile. This is reported as a Trakr inventory
limitation, not a global claim that no internships exist.

## Database And Ingestion

- Inventory schema preserves opportunity type, source tier, source permission,
  recommendation state, geography, deadline evidence, and provenance.
- Curated direct records require explicit `verified_direct` curation.
- Directories and resources remain `program_directory` or unverified until
  record-level evidence supports direct recommendation.
- GitHub ingestion run `30064860036` passed on `a871c31`.
- Response rendering sanitizes existing encoded records.
- Future Greenhouse and Ashby ingestion decodes encoded markup.
- A post-render manual Railway ingestion was not rerun and is not claimed.

## Profile And Upload Contract

- Course and degree level are explicit structured profile fields.
- Extracted, inferred, low-confidence, contradictory, missing, and unsupported
  fields are distinguishable.
- Caller-supplied facts use `caller_structured` provenance and require user
  confirmation.
- Denied caller facts are removed before matching.
- Multipart TXT/DOCX/PDF parsing is owned by Trakr.
- Continuations do not contain raw document blobs or raw resume text.
- Existing base64 and extracted-text inputs remain compatible.

## OpenAPI And Rendering

- Direct opportunities, explore programs, supporting resources, and category
  coverage are fully typed.
- `officialUrl` is required for visible direct opportunities.
- Human-readable recommendation messages include title, type, state, deadline,
  eligibility, geography, match reasoning, and official URL.
- Learning resources are labeled as resources rather than matched application
  opportunities.
- `X-Trakr-Version: 0.7.0` is returned by the public recommendation endpoint.

## Agent Identity

Trakr-owned metadata surfaces use:

`Trakr Opportunity & Resume Services`

and expose all three services.

The OKX Agent #5198 identity is active and listed, with a free API service at
the correct endpoint. Its marketplace service name and description remain
legacy:

- Name: `Opportunity Matching API`
- Fee: `0 USDT`
- Description: opportunity recommendations only

Changing this public identity is an external identity mutation and requires
the OKX confirmation gate. It was not silently changed.

## Defects Found And Fixed

- Explicit scholarship labels were not parsed into structured fields.
- Production harnesses bypassed the new confirmation stage.
- Africa region evidence overrode country-specific eligibility.
- Applicant nationality and residence were omitted from filters.
- Visible eligibility text contained encoded HTML.
- The trust-suite URL check treated `?` as regular-expression syntax.
- Local smoke required nonempty recommendations.
- Service 2 production fetches could hang indefinitely.
- Service 3 production tests did not recover from HTTP 429.

All code and harness defects above have regression coverage.

## Commits

- `29576f6` Fix profile confirmation, taxonomy, URL contract, and version 0.7.0.
- `d5b88a2` Require confirmed profile evidence across resume services.
- `cafc482` Parse explicit scholarship intake fields.
- `a47826a` Enforce country-specific opportunity eligibility.
- `55ac1e9` Sanitize visible eligibility summaries.
- `a871c31` Add production trust regression suite.
- `d24e9e5` Bound production smoke network retries.

## Validation

- Local automated tests: 179/179.
- Calibration corpus: 153 cases; gate passed.
- Typecheck: passed.
- ESLint: passed with zero warnings.
- Production build: passed.
- Local production-mode smoke: passed.
- Railway orchestration: 15/15.
- Railway Service 1: 7/7.
- Railway Service 2 restarted sequence: 20/20.
- Railway Service 3 restarted sequence: 17/17.
- Core Railway total: 59/59.
- Production trust suite: passed.
- GitHub CI `30066141518`: passed.
- GitHub production smoke `30066141482`: passed.

## Privacy, Fabrication, And Injection

- Fabrication violations: 0.
- Every generated or optimized claim remains linked to supplied evidence.
- Unsupported rewrites are rejected or require confirmation.
- Resume and target prompt injection remain contained.
- Raw resumes, contact details, and document blobs are excluded from logs and
  continuations.
- Caller-supplied profiles cannot silently become user-confirmed profiles.
- Consent withdrawal clears personal capability state.

## OKX And A2MCP

One final payment quote returned:

- HTTP 200.
- `accepts: []`.
- `needsConfirm: false`.
- No payment challenge.
- No wallet operation.
- No payment attempt.

The service remains free and compatible with the public A2MCP endpoint.

## Remaining Risks

- True scholarship and internship inventory remains thin.
- Deadline coverage and geographic certainty remain uneven outside manually
  verified records.
- Employer job sources still dominate total inventory.
- External callers control their own prose and may fail to display fields even
  when Trakr provides a strict rendering contract.
- The OKX marketplace title and description remain stale.
- A fresh Antigravity visible-link journey remains outstanding.
- Ninety-five Service 2 calibration cases remain queued for future qualified
  human review; the corpus is independently AI-reviewed, not human-certified.

## Complete Test Log

[Trust and orchestration test log](orchestration-test-log-2026-07-24.md)

## Final Decision

**NO-GO for closing the external-orchestration milestone on July 24, 2026.**

The code and deployment are release-quality. Closure requires the public Agent
#5198 listing update and a fresh Antigravity visible-output transcript.
