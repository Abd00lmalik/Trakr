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

- `GEMINI_API_KEY` must be configured to verify live Gemini reasoning.
- `DATABASE_URL` must be configured and migrated to verify Railway Postgres, pgvector, and stored opportunity reads.
- Railway public URL must be supplied or discovered from the authenticated dashboard before remote smoke testing.
- `npm audit --audit-level=moderate` currently reports a transitive Next/PostCSS advisory where npm suggests a breaking downgrade. Do not run `npm audit fix --force`; monitor Next/PostCSS updates instead.
