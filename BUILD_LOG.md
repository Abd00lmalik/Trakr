# Build Log

## 2026-07-21 Service 2 Calibration

- Added a 153-case independently AI-reviewed and adjudicated synthetic
  benchmark corpus with three blinded reviewer passes and separate blinded
  adjudication.
- Advanced the deterministic rubric to `resume-rubric-2026-07-21`.
- Added semantic evidence concepts, numeric experience handling, enrollment
  contradictions, hard-eligibility separation, artifact-state handling, and
  exact rewrite-to-claim provenance.
- Calibrated exact requirement-status agreement to 93.21%, hard-requirement
  agreement to 96.30%, and hard-failure recall to 100%.
- Recorded zero false ineligibility, zero fabrication, 100% contradiction
  recall, and 100% prompt-injection containment.
- Added the calibration gate to `npm run verify`.
- Final local restart passed 130 automated tests, calibration, typecheck,
  zero-warning ESLint, optimized build, PDF/DOCX parsing, and production-mode
  smoke.
- Live inventory monitoring fetched 557 records: 477 verified, 18 program
  directories, 0 inactive, and 62 unverified. No critical alert fired;
  internship, scholarship, grant, and known-deadline coverage remain limited.
- The first production restart found one cross-domain defect: cloud
  certification and generic software leadership received credit for accounting
  certification and audit leadership. Added strict finance concepts and a
  regression; the complete calibration and release sequence must restart.
- Resume Generation remains blocked pending calibration deployment and the
  complete external Service 2 and Service 1 restart.

## 2026-07-19 Session Profile and Matching Foundation

- Added profileless two-path onboarding for external agents:
  - Use a resume or CV.
  - Provide background conversationally.
- Kept profiles caller-scoped through continuation context with no permanent personal-profile requirement.
- Added additive `profile` and `continuation` aliases while preserving legacy `user` and `context` requests.
- Preserved resume sections, project metrics, work history, education, certifications, links, and evidence provenance.
- Added minimum-information gates so incomplete student or role-only profiles do not trigger weak recommendations.
- Added deterministic hard-mismatch filtering for unrelated procurement, logistics, retail, sales, administration, and operator roles.
- Added post-AI consistency enforcement so scores, reasoning, and actions cannot contradict deterministic ranking.
- Expanded automated coverage for onboarding paths, resume continuation, profile corrections, follow-up intent routing, alias compatibility, mismatch filtering, and action consistency.
- Full `npm run verify` passed locally, including production build and smoke tests.
- Pre-deployment production verification:
  - Public Railway endpoint returned `HTTP 200`.
  - No payment challenge was returned; OKX Agent Payments Protocol quote reported no payment required.
  - Gemini was configured and healthy.
  - Railway Postgres, pgvector, schema, privacy logging, and source verification were ready.
  - Agent #5198 remained active and listed.
  - `Opportunity Matching API` remained free at `0 USDT` with the unchanged endpoint.

## 2026-07-16 Source Verification and Stale Record Handling

- Added bounded-concurrency URL verification with redirect detection,
  canonical URL normalization, publisher domains, HTTP status tracking, and
  confidence metadata.
- Added verified, program-directory, inactive, blocked, unreachable, and stale
  source lifecycle handling.
- Added source-aware stale deactivation that only runs after a successful
  refresh for that source.
- Added one-time cleanup for active legacy rows with no ingestion
  `last_seen_at`, preventing old seed fixtures from remaining recommendable.
- Restricted `Apply Now` to verified active opportunities in deterministic
  ranking and after Gemini enhancement.
- Added focused source verification tests and production smoke assertions.
- Added source-verification readiness to health and database-admin success
  checks so incomplete migrations cannot be reported as production-ready.

## 2026-07-16 Privacy-Safe Recommendation Logging

- Replaced raw recommendation request and response persistence with aggregate-only analytics summaries.
- Added optional HMAC-SHA256 request correlation through `RECOMMENDATION_LOG_HASH_KEY`; raw request IDs, profile fields, resume text, reasoning, and next actions are not stored.
- Added configurable 1-365 day retention through `RECOMMENDATION_LOG_RETENTION_DAYS`, per-row expiry timestamps, and automatic expired-record pruning.
- Added an idempotent migration that removes legacy raw payload columns from `recommendation_runs`.
- Marked resume parsing and recommendation responses `Cache-Control: no-store`.
- Added focused privacy tests and smoke assertions for resume upload and recommendation caching behavior.

## 2026-07-12

- Added a protected `POST /api/admin/database` operator endpoint for Railway database migration and seed operations when direct CLI/database shell access is unavailable.
- Updated Gemini default model from `gemini-1.5-flash` to `gemini-3.5-flash` after checking the official Google AI model docs.
- Tightened `/api/health` so production only reports `ok: true` when the configured database is connected, pgvector is installed, and the schema is ready.
- Railway dashboard inspection found:
  - Public URL: `https://trakr-production-c70e.up.railway.app`
  - Application service: `Trakr`
  - Database service: `Postgres`
  - Initial app `DATABASE_URL` was still a localhost placeholder and was staged in Railway as a Postgres service reference.
  - `GEMINI_MODEL` was staged in Railway as `gemini-3.5-flash`.
- Railway production verification after deployment:
  - `POST /api/admin/database` completed migration and seeded 7 baseline opportunities.
  - `GET /api/health` returned `ok: true`.
  - Database checks returned `connected: true`, `pgvector: true`, and `schemaReady: true`.
  - Remote smoke test passed against `https://trakr-production-c70e.up.railway.app`.
  - Live provider returned `gemini:gemini-3.5-flash`.
  - Protected ingestion fetched and stored 59 opportunities from Devpost and RemoteOK.
- OKX registration:
  - Installed verified `onchainos.exe` v4.2.3 from the official OKX release after the PowerShell installer failed to parse.
  - Logged in to Agentic Wallet by email OTP.
  - Registered Trakr as ASP Agent ID `#5198`.
  - Service: `Opportunity Matching API`, A2MCP, `0 USDT`, endpoint `https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`.
  - Activated/submitted the listing for OKX review.
  - Current OKX status: listing under review; review note says AI quality review suggested pass.
- Branding update:
  - Added the official Trakr logo to the web app, favicon, Apple icon, README, MCP metadata, and OKX submission docs.
  - Updated OKX ASP Agent ID `#5198` profile photo to the official logo.
- Initialized Trakr as a Next.js 15 App Router + TypeScript A2MCP service.
- Added `POST /api/a2mcp/recommend`, `GET /api/a2mcp`, and `GET /api/health`.
- Added Gemini provider abstraction with deterministic local fallback.
- Added PostgreSQL + pgvector schema and recommendation logging.
- Added Railway deployment config and pushed the initial app to GitHub.
- Fixed Railway build config by removing the duplicate `npm ci` from the build phase.
- Added noninteractive ESLint config and `npm run verify`.
- Added DB migration and seed scripts.
- Added database-backed opportunity source with seeded fallback.
- Added PDF/DOCX/TXT resume parsing endpoint at `POST /api/profile/parse-resume`.
- Added OpenAPI-style service document at `GET /api/a2mcp/openapi`.
- Added public endpoint hardening: CORS, structured errors, optional API key, and basic rate limiting.
- Fixed production PDF parsing by copying the `pdf-parse` worker into the Next.js server output after build.
- Added protected structured ingestion from Devpost and RemoteOK, plus GitHub scheduled ingestion workflow.
- Added CI workflow and `.mcp.json.example` for agent-facing metadata.

## 2026-07-14 Quality Sprint

- Kept Gemini provider default on `gemini-3.5-flash`, matching the current official stable Gemini Flash model naming, while moving to the current `@google/genai` SDK.
- Reworked Gemini enhancement to use the current `@google/genai` SDK with structured JSON output, retries, timeout handling, and no raw provider-error leakage.
- Preserved deterministic pre-ranking order after Gemini narrative enhancement so AI text cannot promote weak/irrelevant items above stronger grounded matches.
- Added quality and domain-fit scoring stages covering category relevance, skill fit, experience level, location, deadline urgency, source quality, expected value, and domain alignment.
- Expanded the official curated catalog from 10 to 18 grounded opportunities, adding official AI/data, cybersecurity, creator, founder, and student/developer sources.
- Tightened generic/low-information listing suppression so titles like "All Jobs" and "Apply Here" cannot rank near the top.
- Local persona stress test highlights after rebuild:
  - Web3 builder: ETHGlobal, Solana Grants, DoraHacks ranked top 3.
  - AI engineer: Kaggle Competitions and Google Research Student Programs ranked top 2.
  - Cybersecurity student: CTFtime and HackerOne ranked top 2.
  - Creator: YouTube Creator Programs and TikTok Creator Academy ranked top 2.
  - Startup founder: Y Combinator and AWS Activate ranked top 2.
- Local verification passed:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npm run smoke`

Remaining production-dependent checks:

- Railway must redeploy from GitHub after this commit is pushed.
- Production smoke should be rerun against `https://trakr-production-c70e.up.railway.app`.
- Railway/GitHub environment variables should keep `GEMINI_MODEL=gemini-3.5-flash`, `TRAKR_SERVICE_URL=https://trakr-production-c70e.up.railway.app`, and `NEXT_PUBLIC_APP_URL=https://trakr-production-c70e.up.railway.app`.

## Latest Local Verification

Commands run successfully:

```bash
npm run typecheck
npm run lint
npm run build
npm run smoke
```

Smoke coverage:

- `GET /api/health`
- `GET /api/a2mcp`
- `GET /api/a2mcp/openapi`
- PDF resume upload
- DOCX resume upload
- valid recommendation generation
- invalid recommendation payload handling
- protected ingestion rejects unauthenticated calls with `401`

Known environment-dependent checks:

- `GEMINI_API_KEY` is configured in Railway and was verified through the live smoke test.
- `DATABASE_URL` is configured in Railway and was verified with Postgres, pgvector, and schema-ready health checks.
- Railway public URL is `https://trakr-production-c70e.up.railway.app`.
- `npm audit --audit-level=moderate` currently reports a transitive Next/PostCSS advisory where npm suggests a breaking downgrade. Do not run `npm audit fix --force`; monitor Next/PostCSS updates instead.
