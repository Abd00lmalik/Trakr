# A2MCP Orchestration Test Log

Date: 2026-07-22

All applicant data, resumes, targets, claims, employers, institutions, and
metrics used in automated and production tests were synthetic and fictional.

| Test ID | Service | Input Route | Expected Behavior | Actual Behavior | Environment | Pass | Defect / Fix | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ORCH-PROD-001 | Shared | Health, metadata, OpenAPI | Version 0.6.0 and artifact storage ready | HTTP 200; all readiness checks true | Railway | Pass | None | Passed |
| ORCH-PROD-002 | Shared | Empty POST and `{}` | Return the three-service chooser | `choose_service`, `needs_input`, HTTP 200 | Railway | Pass | Missing choice was previously treated as invalid; converted to conversational state | 15/15 passed |
| ORCH-PROD-003 | Shared | `operation: start` and empty text | Return chooser without business-profile questions | Three machine-readable options returned | Railway | Pass | Same bootstrap repair | 15/15 passed |
| ORCH-PROD-004 | Shared | Exact Agent #5198 declaration | Do not assume Opportunity Finding | First business response was the three-service chooser | Railway and direct HTTP | Pass | Legacy title routing bias removed | 15/15 passed |
| ORCH-PROD-005 | Service 1 | Choice `1` with continuation | Show resume and background intake routes | `discover_choose_input` then `discover_awaiting_resume` | Railway | Pass | None | Passed |
| ORCH-PROD-006 | Service 2 | Choice `2` with continuation | Request resume, target, and consent | `benchmark_awaiting_resume_and_target` | Railway | Pass | None | Passed |
| ORCH-PROD-007 | Service 3 | Choice `3` with continuation | Request target, verified facts, and preferences | `generate_awaiting_information` | Railway | Pass | None | Passed |
| ORCH-PROD-008 | Shared | Numeric choice without continuation | Do not bind the number to an unknown menu | Safe chooser restart returned | Railway | Pass | None | Passed |
| ORCH-PROD-009 | Shared | Clear natural-language requests | Route directly to the correct service | Discovery, benchmark, and generation routed correctly | Railway | Pass | None | Passed |
| ORCH-PROD-010 | Service 2 | Optimize without trusted benchmark | Benchmark before optimization | `optimize_confirmation`; no artifact yet | Railway | Pass | None | Passed |
| ORCH-PROD-011 | Service 2 | Approved optimization | Produce authorized DOCX and PDF | Both artifacts downloaded and passed integrity checks | Railway | Pass | None | Passed |
| ORCH-PROD-012 | Service 3 | Target plus verified evidence | Produce truthful DOCX and PDF | Both artifacts downloaded and passed integrity checks | Railway | Pass | None | Passed |
| ORCH-PROD-013 | Shared | Tampered continuation | Fail closed with structured error | HTTP 400 `invalid_session` | Railway | Pass | None | Passed |
| ORCH-PROD-014 | Shared | Replayed bootstrap idempotency key | Return the same trusted continuation | HTTP 200 with `replayed` status | Railway | Pass | None | Passed |
| ORCH-PROD-015 | Shared | Free OKX quote | Return HTTP 200 with no challenge | `accepts: []`, `needsConfirm: false`; no payment attempted | OKX protocol CLI | Pass | None | Passed |
| EXT-CANARY-001 | Shared | Four suites serialized on one runner | Complete independent production validation | Service 3 step failed; public stdout unavailable | GitHub Actions run 29890184911 | Fail | Exact failure was non-reproducible; single-runner coupling reduced isolation | Full sequence restarted |
| EXT-CANARY-002 | Shared | Exact 59-case serialized rerun | Reproduce any deterministic service or rate-limit defect | Orchestration 15/15, S1 7/7, S2 20/20, S3 17/17 | Direct production client | Pass | No deterministic defect reproduced | Passed |
| EXT-CANARY-003 | Shared | Four independent matrix jobs | Prove each suite independently from hosted runners | All four jobs passed | GitHub Actions run 29890731126 | Pass | Canary split by suite with fail-fast disabled | Passed |
| EXT-CI-001 | Shared | Full repository CI | Preserve all completed service gates | CI completed successfully | GitHub Actions run 29890731123 | Pass | None | Passed |

Final totals:

- Local automated tests: 156 passed.
- Final serialized production cases: 59 passed, 0 failed.
- Independent hosted production jobs: 4 passed, 0 failed.
- Final CI: passed.
- Payment challenges: 0.
- Payments attempted: 0.

Final verdict: **GO**
