# Build Log

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
