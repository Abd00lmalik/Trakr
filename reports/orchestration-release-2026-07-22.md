# A2MCP Orchestration Release Report

Date: July 22, 2026

Public endpoint: `POST https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`

Service identity: Agent #5198, A2MCP

API version: `0.6.0`

## Verdict

**GO.**

The public endpoint now exposes all three Trakr services through a
server-authoritative cold-start contract while preserving direct
natural-language routing and legacy Opportunity Finding requests.

## Root Cause

The original external-agent defect was caused by treating a missing service
choice as malformed business input. The legacy title, "Opportunity Matching
API", also biased external callers toward Service 1 before Trakr had returned
its own service-selection state.

The repair makes service selection a valid conversational `needs_input` state.
An empty or ambiguous bootstrap returns HTTP 200 and the three-service chooser.

The first independent GitHub production canary later reported a Service 3
failure after the other suites passed. Public GitHub metadata did not expose
the failing assertion, and the exact serialized 59-case sequence passed when
rerun. No deterministic Service 3 or request-count defect was reproduced.
The canary itself coupled all suites to one runner and provided poor failure
isolation. It was changed to four independent jobs with fail-fast disabled.
The complete independent rerun passed.

## Implemented Contract

- Empty POST, `{}`, `operation: start`, empty text, and service-declaration-only
  requests return `choose_service` with HTTP 200.
- The response exposes stable values, numeric aliases, labels,
  `requiredInputs`, `nextActions`, and an opaque short-lived continuation.
- Clear requests still route directly to `discover`, `benchmark`,
  `optimize`, or `generate_resume`.
- Numeric choices are interpreted only against the trusted continuation stage.
- Service 1 exposes resume and background intake routes.
- Service 2 requires resume evidence and a target, benchmarks before
  optimization, and requires explicit optimization approval.
- Service 3 requires a target and verified facts before generation.
- Optimization and generation return authorized, expiring DOCX and PDF
  artifacts with MIME type, size, SHA-256, and regeneration metadata.
- Legacy structured discovery payloads remain compatible.

## Metadata And Document Input

- Public display title: `Trakr Opportunity & Resume Services`.
- A2MCP metadata and OpenAPI describe all three visible services.
- Supported document representations are:
  - Extracted `resumeText`.
  - Canonical base64 PDF, DOCX, or TXT up to 2.5 MB.
  - Multipart parsing through `/api/profile/parse-resume`, followed by
    `resumeText`.
- Unsupported types, malformed files, oversized content, invalid signatures,
  and non-canonical base64 fail with structured errors.
- Document text is treated as untrusted content.

## Commits

- `332a3ba` Repair A2MCP cold-start orchestration.
- `b589b85` Keep production deadline smoke current.
- `1a57c6d` Add external production smoke canary.
- `0313639` Isolate production smoke suites.

## Validation

Local canonical release validation completed before the workflow-only canary
change:

- 156 automated tests passed.
- Service 2 calibration gate passed.
- Typecheck passed.
- ESLint passed with zero warnings.
- Production build passed.
- Local production-mode smoke passed.

Final serialized Railway validation:

- Orchestration: 15/15.
- Service 1: 7/7.
- Service 2: 20/20.
- Service 3: 17/17.
- Total: 59/59.

Independent GitHub-hosted validation:

- Production smoke run
  [29890731126](https://github.com/Abd00lmalik/Trakr/actions/runs/29890731126)
  passed.
- `production-smoke (orchestration)` passed.
- `production-smoke (service-1)` passed.
- `production-smoke (service-2)` passed.
- `production-smoke (service-3)` passed.
- CI run
  [29890731123](https://github.com/Abd00lmalik/Trakr/actions/runs/29890731123)
  passed.

## Exact Cold Start

The exact Agent #5198 declaration returned HTTP 200 with:

```text
Choose a service:
1. Find opportunities
2. Resume Benchmarking & Optimization
3. Resume Generation
```

The structured response reported:

- `operation: start`
- `stage: choose_service`
- `status: needs_input`
- `nextActions: discover, benchmark, generate_resume`
- A valid opaque continuation
- No payment headers

## External Availability

Railway health returned HTTP 200 with PostgreSQL connected and
`artifactStorageReady: true`. GitHub Actions invoked the production endpoint
from hosted runners, independently of localhost, the local filesystem, a local
development server, or an interactive browser.

Literal physical shutdown of the user's computer was not performed and is not
claimed. The independent hosted-runner result proves the meaningful
availability requirement.

## OKX/A2MCP Compatibility

The final **OKX Agent Payments Protocol** quote returned:

- HTTP 200.
- `accepts: []`.
- `needsConfirm: false`.
- Summary: endpoint returned 200 and no payment was required.
- No payment challenge and no payment attempt.

The local CLI remained integrity-valid at `4.2.6`. Its update to `4.3.0` was
attempted twice, but Windows denied replacement of the running executable.
This did not affect the successful protocol quote.

## Privacy And Fabrication Audit

- Continuations are opaque, encrypted, caller-carried, and short-lived.
- Raw document blobs are not placed in continuations.
- Contact details and resume content are excluded from privacy-safe logs.
- Consent withdrawal clears personal capability state.
- Prompt injection in resumes and targets remains contained.
- Generated and optimized claims remain linked to supplied evidence.
- The final production suites found no invented applicant facts.

## Remaining Limitations

- Agent #5198's external listing title was not changed; the broader capability
  title and three-service description are exposed through Trakr metadata.
- Third-party agents control their own final wording. Trakr can provide
  authoritative structured state but cannot force an external client's prose.
- Public signed-out GitHub pages do not expose full job stdout. The initial
  canary failure's exact assertion therefore remains unknown and is documented
  as non-reproducible rather than assigned a speculative cause.
- Native PDFs passed visual inspection across six synthetic layouts. DOCX
  package integrity passed, but Word COM conversion repeatedly hung, so a
  complete Microsoft Word render comparison is not claimed.

## Complete Test Log

- [Orchestration test log](orchestration-test-log-2026-07-22.md)
- [Service 1 test log](service1-test-log.md)
- [Service 2 test log](service2-test-log.md)
- [Service 3 test log](service3-test-log.md)

## Final Decision

**GO.**

The cold-start orchestration repair, all three services, legacy compatibility,
downloadable artifacts, external availability, and free A2MCP behavior passed
their final release gates.
