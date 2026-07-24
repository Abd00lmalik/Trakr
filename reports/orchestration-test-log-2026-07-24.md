# Trakr Trust And Orchestration Test Log

Date: 2026-07-24

Public endpoint:
`POST https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`

Release version: `0.7.0`

All applicant profiles, resumes, targets, employers, institutions, projects,
and claims used in these tests were synthetic and fictional.

## Local Release Gate

Command: `npm run verify`

Result:

- 179 automated tests passed.
- Service 2 calibration corpus: 153 cases.
- Hard eligibility recall: 100% across 36 labeled hard failures.
- False ineligibility rate: 0%.
- Hard requirement-status agreement: 96.3%.
- Overall requirement-status agreement: 92.16%.
- Fabrication violations: 0.
- Prompt-injection containment: 100%.
- Typecheck: passed.
- ESLint: passed with zero warnings.
- Production build: passed.
- Local production-mode smoke: passed.

The local smoke now accepts a truthful empty result only when the response
still reaches `recommendations`, reports every requested category, and states
that no verified direct match exists in Trakr's current inventory. Explanation
and readiness coverage use a separate fully evidenced scholarship profile.

## Production Results

| Sequence | Result | Completed At |
| --- | ---: | --- |
| Orchestration | 15/15 | 2026-07-23T22:10:49Z |
| Service 1 | 7/7 | 2026-07-23T22:33:14Z |
| Service 2 restarted sequence | 20/20 | 2026-07-24T04:08:03Z |
| Service 3 restarted sequence | 17/17 | 2026-07-24T04:10:45Z |
| Core production total | 59/59 | 2026-07-24 |
| Trust and visible-contract suite | Pass | 2026-07-24T04:11:06Z |

## Trust Suite

The trust suite confirmed:

- Five independent cold starts returned HTTP 200, `choose_service`, version
  `0.7.0`, and unique request IDs.
- A numeric Service 1 selection returned intake choices and no recommendations
  before profile evidence was supplied.
- An external caller-supplied Data Science profile entered
  `profile_confirmation` and was not used for matching.
- Denying that profile removed its headline, skills, and matching authority.
- Multipart TXT upload reached profile confirmation without exposing raw
  document text in the continuation.
- Resume extraction found `Computer Science` and `BSc`.
- Jobs, scholarships, and internships received separate category coverage.
- `Rhodes Scholarship for West Africa 2027` was returned for the synthetic
  Nigerian applicant.
- `Rhodes Scholarship for Southern Africa 2027` was excluded.
- Microsoft Learn Student Hub, GitHub Education Student Developer Pack, and
  Google Developer Programs were never returned as direct scholarships.
- Every direct result had `officialUrl`, and every URL was included in the
  human-readable message.
- The Rhodes official URL resolved with HTTP 301 to the official provider.
- OpenAPI requires `officialUrl` for direct opportunities.
- No local path appeared in the response.
- No payment was attempted.

Observed category coverage in the final trust run:

| Category | Status | Inventory | Eligible | Selected |
| --- | --- | ---: | ---: | ---: |
| Scholarship | Limited | 1 | 1 | 1 |
| Internship | No qualified matches | 1 | 0 | 0 |
| Remote job | Covered | 188 | 7 | 7 |

## Failure And Restart Log

### Service 2 Harness Stall

The first July 24 Service 2 rerun passed cases 1 through 6. The injection case
then encountered a network request that remained unresolved for more than two
hours. Later requests failed immediately because the local network path had
collapsed. No Trakr assertion failure was recorded.

Root cause: the production harness used unbounded `fetch` calls and had no
transient retry behavior.

Fix: `d24e9e5` added a 90-second request timeout and bounded retry handling for
network errors, HTTP 429, and HTTP 5xx responses.

Retest: the full Service 2 sequence restarted from Test 1 and passed 20/20.

### Service 3 Rate Limit

The first Service 3 rerun passed 14 cases. Cases 15 through 17 received HTTP
429 after the preceding Service 2 load.

Root cause: the Service 3 harness did not respect transient rate-limit
responses.

Fix: `d24e9e5` added the same bounded timeout and retry behavior.

Retest: the full Service 3 sequence restarted from Test 1 and passed 17/17.

## CI And External Execution

- GitHub CI for `a871c31`: passed.
- GitHub production smoke for `a871c31`: passed.
- GitHub ingestion for `a871c31`: passed.
- GitHub CI for `d24e9e5`: passed:
  https://github.com/Abd00lmalik/Trakr/actions/runs/30066141518
- GitHub four-job production smoke for `d24e9e5`: passed:
  https://github.com/Abd00lmalik/Trakr/actions/runs/30066141482

These hosted runs executed independently of localhost.

## Payment Compatibility

One final OKX Agent Payments Protocol quote was issued with HTTP POST.

Result:

- Endpoint returned HTTP 200.
- `accepts: []`.
- `needsConfirm: false`.
- Summary: no payment required.
- No wallet check.
- No payment challenge.
- No payment attempt.

The local OKX CLI passed integrity validation at `4.2.6`. A required upgrade to
`4.3.0` downloaded and verified, but Windows denied replacing the running
binary. The existing CLI successfully completed the metadata and quote checks.

## External Caller Evidence

- Direct HTTP and A2MCP production clients: passed.
- Codex/OKX protocol invocation: returned the three-service menu and no payment
  challenge.
- Antigravity: the existing `Trakr AI Service Audit` transcript visibly states
  that its patched resume-flow and profile-denial tests passed. A new complete
  cold-start-to-visible-link transcript was not captured in this final run.

## Result

Code, local, CI, Railway, direct-client, and payment gates passed.

The complete orchestration milestone remains **NO-GO** pending:

1. Updating Agent #5198's public service listing from the legacy title and
   Service-1-only description.
2. Capturing a fresh Antigravity conversation that visibly renders official
   recommendation links.
