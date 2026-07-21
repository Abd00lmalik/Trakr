# Service 3 And Inventory Hardening Test Log

Date: 2026-07-21

All applicant profiles, resumes, claims, projects, institutions, employers,
achievements, and metrics used in automated or production journeys are
synthetic and fictional.

| Test ID | Service | Input Route | Profile Type | Expected Behavior | Actual Behavior | Endpoint / Environment | Pass | Defect Found | Fix Applied | Retest Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INV-LOCAL-001 | Inventory | Metadata normalization | Mixed source records | Separate type, domain, geography, remote scope, deadline, source tier, and recommendation state | Structured metadata and provenance generated without using isolated keywords as eligibility proof | Local metadata suites | Pass | None in final run | N/A | Passed |
| INV-LOCAL-002 | Inventory | Grants.gov Search2 | Current, forecasted, historical, expired, and ambiguous grants | Keep only relevant current records; never promote unknown geography or old-cycle dates to Apply Now | Conservative normalization, canonical URLs, current-cycle checks, and Explore states passed | Local Grants.gov suite | Pass | Early implementation required production schema support | Added `inventory_metadata` persistence and readiness checks | Full suite passed |
| INV-LOCAL-003 | Inventory | Coverage matrix | All normalized inventory | Measure type, domain, geography, remote scope, deadline, verification, and intersections | Snapshot generated with source health, coverage states, and alerts | Local monitoring suite | Pass | None in final run | N/A | Passed |
| INV-LOCAL-004 | Inventory | Source failure and duplicate cases | Synthetic outage and duplicate records | Detect source anomalies without unsafe stale deactivation or duplicate promotion | Monitoring and ingestion regression cases passed | Local ingestion and monitoring suites | Pass | None in final run | N/A | Passed |
| INV-PROD-001 | Inventory | Database readiness | Railway deployment | Health must remain degraded until metadata migration exists | Health reports `inventoryMetadataReady: true` after migration | Public Railway health | Pass | Health initially ignored the new column | Added readiness field and health gate | Deployment restarted and passed |
| INV-PROD-002 | Inventory | Scheduled migration and ingestion | Railway database | Migrate before writing new metadata | GitHub Actions run `29823188451` completed migration and ingestion | GitHub Actions / Railway | Pass | Workflow initially wrote before migration | Added migration step with `seed: false` | Complete workflow passed |
| INV-PROD-003 | Inventory | Operator authorization | Migration endpoint | Accept the configured ingestion operator key without weakening protection | Migration returned success with the scheduled workflow key | Protected Railway admin endpoint | Pass | HTTP 401 when another configured key took precedence | Accept either configured operator key and add route regression | Workflow restarted and passed |
| INV-PROD-004 | Inventory | Nigeria remote-job journey | Early-career fictional developer | Expose structured metadata and avoid assuming global remote access | Generic remote record remained Explore; Nigeria-published record could be Apply Now | Public A2MCP endpoint | Pass | None | N/A | Passed |
| INV-PROD-005 | Inventory | Nigeria research-grant journey | Fictional early-career researcher | Preserve current deadlines but do not guess applicant-country eligibility | Grants.gov results carried exact deadlines and unknown geography and remained Explore | Public A2MCP endpoint | Pass | None | N/A | Passed |
| S3-LOCAL-001 | Resume Generation | Missing target | Fictional applicant evidence | Request a target before drafting | Returned `provide_generation_target` and no generated document | Local Service 3 suite | Pass | None | N/A | Passed |
| S3-LOCAL-002 | Resume Generation | Target without evidence | Empty applicant profile | Request confirmed evidence and avoid invented history | Returned `provide_generation_evidence` | Local Service 3 suite | Pass | None | N/A | Passed |
| S3-LOCAL-003 | Resume Generation | Resume plus target | Fictional student | Select internship resume and link every statement to claims | Generated evidence-linked internship draft with omissions/questions | Local Service 3 suite | Pass | None | N/A | Passed |
| S3-LOCAL-004 | Resume Generation | Structured profile plus target | Cross-artifact corpus | Select the target-appropriate document rather than a universal resume | Academic, research, biosketch, scholarship, fellowship, grant, hackathon, design, technical, and team artifacts passed | Local 15-case corpus | Pass | None | N/A | Passed |
| S3-LOCAL-005 | Resume Generation | Missing and unsupported facts | Sparse and ambiguous profiles | Ask, mark a placeholder, or omit; never fabricate | Unsupported facts were omitted and placeholders remained explicit | Local Service 3 suite | Pass | None | N/A | Passed |
| S3-LOCAL-006 | Resume Generation | Prompt injection | Malicious resume and target text | Contain instructions before profile, evidence, continuation, and generation | Injection text did not control or enter generated content | Local security and Service 3 suites | Pass | None | N/A | Passed |
| S3-LOCAL-007 | Resume Generation | Consent withdrawal | Fictional active session | Purge personal and generation state | Returned consent-required state with cleared generation context | Local companion suite | Pass | None | N/A | Passed |
| S3-LOCAL-008 | Resume Generation | Continuation and service switching | Opportunity/benchmark session | Preserve approved facts and switch service without losing provenance | Target and approved evidence survived encrypted continuation | Local companion and Service 3 suites | Pass | None | N/A | Passed |
| S3-LOCAL-009 | Shared validation | Full release sequence | All services and calibration corpus | Pass every test, calibration gate, typecheck, lint, build, parsing, and smoke | 156 tests and all release commands passed | Local `npm run verify` | Pass | Shared readiness defects were found before final run | Fixed readiness, migration ordering, and authorization | Complete sequence restarted and passed |
| S3-PROD-001 | Resume Generation | Health, metadata, OpenAPI | External agent | Report version 0.5.0 and ready dependencies | HTTP 200; database and inventory metadata ready | Railway | Pass | None after migration | N/A | Passed |
| S3-PROD-002 | Legacy compatibility | Structured discover payload | Fictional legacy user | Preserve Service 1 behavior | Returned two compatible recommendations | Railway | Pass | None | N/A | Passed |
| S3-PROD-003 | Resume Generation | Explicit operation, missing target | Empty generation request | Request target | Returned `provide_generation_target` | Railway | Pass | None | N/A | Passed |
| S3-PROD-004 | Resume Generation | Explicit operation, target only | Fictional target | Request applicant evidence | Returned `provide_generation_evidence` | Railway | Pass | None | N/A | Passed |
| S3-PROD-005 | Resume Generation | Resume intake | Fictional student | Generate internship resume from confirmed claims | Returned internship resume with nine statements | Railway | Pass | None | N/A | Passed |
| S3-PROD-006 | Resume Generation | Natural language | Fictional student | Route directly to generation | Returned internship resume | Railway | Pass | None | N/A | Passed |
| S3-PROD-007 | Resume Generation | Research fellowship target | Fictional researcher | Select fellowship profile | Returned `fellowship_profile` | Railway | Pass | None | N/A | Passed |
| S3-PROD-008 | Resume Generation | Scholarship target | Fictional applicant | Select scholarship CV | Returned `scholarship_cv` | Railway | Pass | None | N/A | Passed |
| S3-PROD-009 | Resume Generation | Grant target | Fictional researcher | Select grant-oriented profile | Returned `grant_profile` | Railway | Pass | None | N/A | Passed |
| S3-PROD-010 | Resume Generation | Hackathon team target | Fictional developer | Select team-member profile | Returned `team_member_profile` | Railway | Pass | None | N/A | Passed |
| S3-PROD-011 | Resume Generation | Private-sector target | Fictional professional | Select conventional private-sector resume | Returned `private_sector_resume` | Railway | Pass | None | N/A | Passed |
| S3-PROD-012 | Resume Generation | Service switch and continuation | Fictional opportunity user | Preserve approved evidence across services | Continued into internship generation | Railway | Pass | None | N/A | Passed |
| S3-PROD-013 | Resume Generation | Embedded instruction attack | Malicious synthetic resume | Ignore attack and preserve policy | Returned safe internship resume with no injected instruction | Railway | Pass | None | N/A | Passed |
| S3-PROD-014 | Resume Generation | Unsupported claims | Sparse fictional profile | Omit unsupported facts | Returned eight omissions and no invented claims | Railway | Pass | None | N/A | Passed |
| S3-PROD-015 | Resume Generation | Consent withdrawal | Active fictional session | Clear generation state | Returned `consent_required` | Railway | Pass | None | N/A | Passed |
| S3-PROD-016 | Resume Generation | Idempotency | Repeated and conflicting requests | Replay identical request and reject changed body | Replay status was `replayed`; conflict returned HTTP 409 | Railway | Pass | None | N/A | Passed |
| S3-PROD-017 | Resume Generation | Oversized and malformed input | Synthetic invalid payloads | Return structured errors without sensitive echo | Both returned HTTP 400 structured errors | Railway | Pass | None | N/A | Passed |
| SHARED-PROD-001 | Opportunity Finding | Seven required journeys | Students, career changer, designer, sparse multi-interest users | Preserve deterministic ranking, eligibility, privacy, and honest scarcity | 7/7 passed after final deployment | Railway | Pass | None after shared fixes | N/A | Complete sequence passed |
| SHARED-PROD-002 | Benchmark and Optimize | Twenty-case production matrix | Cross-role synthetic corpus | Preserve Service 2 calibration, truthfulness, continuation, and security | 20/20 passed after final deployment | Railway | Pass | None after shared fixes | N/A | Complete sequence passed |
| SHARED-PROD-003 | A2MCP free access | `generate_resume` quote | Agent #5198 endpoint | HTTP 200 with no payment challenge | `accepts: []`, amount 0, `needsConfirm: false`; no payment attempted | OKX Agent Payments Protocol CLI | Pass | CLI upgrade was blocked by Windows file replacement | Retained integrity-valid CLI 4.2.6; protocol quote still succeeded | Passed |
| SHARED-PROD-004 | Three-service UI | Initial page without a message | New user | Show all three services and immediate natural-language entry without layout errors | All service controls and the textbox were visible at 1280px; no horizontal overflow or console errors | Railway in-app browser | Pass | None | N/A | Passed |
| SHARED-CI-001 | Release infrastructure | Commit `d75e5d4` | Complete repository | CI must pass independently | GitHub Actions run `29821584292` passed | GitHub Actions | Pass | None | N/A | Passed |

Final production Service 3 execution:

- Executed: `2026-07-21T11:29:04.103Z`
- Passed: 17
- Failed: 0
- Endpoint: `https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`

Final verdicts:

- Inventory hardening: **GO**
- Service 3 Resume Generation: **GO**
