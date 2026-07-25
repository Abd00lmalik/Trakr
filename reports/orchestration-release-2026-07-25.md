# Trakr Server-Authoritative Orchestration Release Report

Date: July 25, 2026

Agent: `#5198`

Endpoint: `POST https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`

Deployed version: `0.8.0`

Commits:

- `2010c5b` - Make Trakr orchestration server authoritative.
- `41c5546` - Handle negated discovery categories.

Final verdict: **NO-GO for the cross-agent orchestration milestone.**

The backend, website, local suites, and Railway suites pass. The milestone remains
NO-GO because a fresh Codex task did not reach the endpoint and a fresh Antigravity
message could not be submitted without the required desktop action confirmation.
No real Claude, Hermes, or OpenClaw journey was available in this environment.

## Gap Analysis

### Aligned And Reused

- Encrypted, expiring, caller-carried continuations.
- Profile provenance and confirmation for resume-extracted and caller-supplied facts.
- Deterministic eligibility, verification, freshness, duplicate, and ranking gates.
- Direct opportunity, Explore program, and supporting-resource separation.
- Visible official URLs and typed recommendation fields.
- Service 2 benchmark-before-optimization and explicit rewrite consent.
- Service 3 claim provenance, fabrication prevention, and deployed DOCX/PDF artifacts.
- Resume parsing, privacy logging, prompt-injection containment, and free HTTP 200 behavior.

### Replaced Or Modified

- Replaced Service 1's resume/background/request chooser with ten broad categories.
- Replaced generic Service 1 sufficiency checks with merged category-specific intake.
- Removed frontend-owned orchestration choices in favor of server-issued choices.
- Made Service 3 target-first.
- Added first-class `callerAction`, `allowedResponses`, `optionalInputs`,
  `attachmentsAccepted`, and `apiVersion`.
- Added category-level coverage for all selected discovery categories.
- Added negation-aware category parsing so "not software jobs" does not select Jobs.

## Root Causes

1. Service 1's legacy profile-source chooser conflicted with broad-first discovery.
2. Frontend constants duplicated backend product decisions and could drift.
3. The response contract lacked enough explicit relay instructions for thin callers.
4. Service 3 requested target and applicant facts together instead of sequencing them.
5. Discovery aliases originally matched category nouns inside explicit negations.
6. Production harnesses retained old stage names and were initially run concurrently,
   causing Railway rate-limit responses unrelated to product behavior.
7. The fresh Codex caller invoked local OKX CLI maintenance before sending the free
   business request. The CLI could not replace its running binary on Windows.
8. Historical Antigravity behavior constructed business parameters and invented a
   profile instead of relaying Trakr's server-issued question.

## UX And Contract Changes

- True cold starts return only:
  1. Find opportunities
  2. Resume Benchmarking and Optimization
  3. Resume Generation
- Service 1 then returns all ten category choices.
- Numeric, named, multiple, and natural-language category answers are accepted.
- Mixed categories produce one merged follow-up and preserve every selected category.
- A resume is optional for Opportunity Finding.
- Service 3 requests the target before applicant evidence.
- Incomplete responses explicitly tell callers to relay the question, preserve the
  continuation, avoid inference, avoid profile generation, and avoid payment work
  after a free HTTP 200 response.
- Website and external callers consume the same A2MCP state machine.

## Local Validation

`npm run verify` passed from Test 1 after the final product fix:

- 188 automated tests passed.
- 153-case calibration gate passed.
- Typecheck passed.
- Lint passed.
- Optimized production build passed.
- Local production-mode smoke passed.
- No calibration metric changed; timestamp-only generated churn was removed.

## Railway Validation

Railway serves version `0.8.0` with database, pgvector, privacy logging, source
verification, inventory metadata, and artifact storage ready.

- Orchestration production: `16/16`.
- Service 1 production: `7/7`.
- Service 2 production: `20/20`.
- Service 3 production: `17/17`.
- Trust production: passed, including five distinct cold starts.
- Every cold start returned `choose_service`.
- Caller-supplied profile denial removed the supplied facts.
- Multipart resume parsing produced a confirmation stage without exposing resume text.
- A verified direct scholarship exposed its official URL and current deadline.
- Payment attempted: `false`.

## Website Parity

Real in-app browser validation against Railway confirmed:

- The initial visible conversation shows the same three-service menu.
- Selecting Opportunity Finding shows all ten server-issued categories.
- "jobs, scholarships and grants" produces one merged adaptive intake.
- The intake visibly states that a resume is optional.
- Selecting Resume Generation asks for the target first.
- The tested narrow viewport had no horizontal document overflow.

## External Agent Evidence

### Codex

A genuinely fresh Codex task was created with the exact Agent #5198 declaration.
Codex began OKX payment-skill preflight, attempted to upgrade the local CLI, and
remained blocked on Windows binary replacement. It never sent the Trakr request.
This is a real caller-side failure and therefore does not prove the visible Codex
business journey.

### Antigravity

The running Antigravity app was opened to a blank New Conversation screen. The
exact declaration was not submitted because desktop automation requires action-time
confirmation before sending an external message. Historical pre-fix evidence remains
release-blocking until a fresh post-fix transcript is captured.

### Claude, Hermes, And OpenClaw

No real accessible client was available. Shared A2MCP contract tests passed, but
those are protocol-level evidence and are not claimed as real platform passes.

## Inventory Limitations

- Jobs remain the dominant inventory category.
- The trust journey found one verified direct scholarship and no qualified internship.
- Several broad and specialist categories still return honest zero-result coverage.
- Sparse inventory is reported as a Trakr inventory limitation, not a global claim.
- No relevance, verification, deadline, or eligibility threshold was lowered.

## Marketplace Research

Authoritative installed OKX identity guidance states:

- An update targets the existing agent ID; a new Agent ID is not required.
- Rejected listings are fixed by updating the same agent, not creating a replacement.
- Agent-level fields and service fields can be changed independently.
- Service updates are deltas. Omitted services remain unchanged.
- Updating an existing service requires its service ID.
- ASP name, description, or service changes trigger listing QA.
- When the returned approval status is under review, the update goes live
  automatically after approval.
- A previously rejected listing may require an explicit activate/resubmission step.
- The guidance does not conclusively state whether the currently approved revision
  remains visible throughout review. Downtime risk must therefore be treated as
  unresolved rather than assumed away.

The local OKX CLI preflight attempted to update from `4.2.6` to `4.4.0`, but Windows
denied replacement of the running binary. No identity mutation was attempted.

Current listing state last verified in the repository evidence on July 24, 2026:

- Agent: `#5198`
- Status: active and listed
- Service ID: `32470`
- Service name: `Opportunity Matching API`
- Type: A2MCP
- Fee: `0 USDT`
- Endpoint: unchanged production recommendation endpoint

## Proposed Listing Diff - Not Applied

| Field | Current | Proposed |
|---|---|---|
| Agent ID | `#5198` | `(unchanged)` |
| Service ID | `32470` | `(unchanged)` |
| Service name | `Opportunity Matching API` | **`Trakr Opportunity & Resume`** |
| Service description | Opportunity recommendations only | **Find verified opportunities, benchmark and optimize resumes, and generate truthful target-specific resumes through one server-authoritative workflow.\nProvide a service choice, opportunity goal or target, and only the applicant evidence Trakr requests.** |
| Service type | A2MCP | `(unchanged)` |
| Fee | `0 USDT` | `(unchanged)` |
| Endpoint | `https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend` | `(unchanged)` |

No marketplace mutation, activation, deactivation, or resubmission was performed.
The diff still requires explicit user confirmation through the OKX update gate.

## Remaining Release Blockers

1. Capture a fresh Codex transcript that reaches Trakr and visibly relays the menu.
2. Capture a fresh Antigravity transcript using the same exact declaration.
3. Run real Claude, Hermes, and OpenClaw journeys where those clients are accessible.
4. Resolve or bypass the caller-side OKX CLI upgrade failure without changing Trakr.
5. Re-fetch Agent #5198's live listing after the CLI is repaired, then present the
   final marketplace diff for explicit confirmation.

