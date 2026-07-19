# Deploying Trakr

This guide covers the first public deployment path for Trakr as a free A2MCP endpoint on Railway. x402 payment gating can be added after the free endpoint is stable and accepted by OKX.AI.

## Railway

1. Create a new Railway project from this repository.
2. Add environment variables:

```text
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_FALLBACK_MODELS=gemini-3.5-flash
TRAKR_SERVICE_URL=https://your-railway-domain
DATABASE_URL=postgresql://...
RECOMMENDATION_LIMIT=10
RATE_LIMIT_REQUESTS_PER_MINUTE=60
RECOMMENDATION_LOG_RETENTION_DAYS=30
RECOMMENDATION_LOG_HASH_KEY=generate_a_long_random_value
INGEST_API_KEY=generate_a_long_random_value
TRAKR_ADMIN_API_KEY=generate_a_long_random_value
```

3. Add a PostgreSQL service in Railway, then apply the schema:

```bash
npm run db:migrate
npm run db:seed
```

If direct Railway CLI or database shell access is unavailable, use the protected operator endpoint after setting `TRAKR_ADMIN_API_KEY`:

```bash
curl -i -X POST https://your-railway-domain/api/admin/database \
  -H "Content-Type: application/json" \
  -H "x-trakr-admin-key: $TRAKR_ADMIN_API_KEY" \
  -d '{"seed":true}'
```

4. Deploy the app. Railway should use `railway.toml`; Nixpacks runs `npm ci`, then `npm run build`, and starts with `npm run start`.

5. Verify the public endpoints:

```bash
curl -i https://your-railway-domain/api/health
curl -i https://your-railway-domain/api/a2mcp
curl -i https://your-railway-domain/api/a2mcp/openapi
curl -i -X POST https://your-railway-domain/api/a2mcp/recommend \
  -H "Content-Type: application/json" \
  -d '{"user":{"headline":"Frontend developer interested in Web3","skills":["React","TypeScript"],"goals":["win a hackathon"],"interests":["web3"]},"filters":{"remote":true,"limit":3}}'
```

Or run the automated remote smoke test:

```bash
SMOKE_BASE_URL=https://your-railway-domain npm run smoke
```

6. Refresh structured opportunity sources:

```bash
TRAKR_SERVICE_URL=https://your-railway-domain INGEST_API_KEY=your_ingest_key npm run ingest
```

Each ingestion run verifies every opportunity URL with redirect following and
records source status, HTTP status, canonical URL, publisher domain, activity,
verification confidence, and last-seen timestamps. Records that disappear from
a successfully refreshed source are deactivated. A failed source refresh does
not deactivate that source's existing records.

Only verified active opportunity pages may receive `Apply Now`. Program
directories remain discoverable but are limited to `Prepare First` or `Skip`.

## OKX.AI A2MCP Registration

For the first submission, register Trakr as a free A2MCP service:

- Service name: Trakr
- Service type: A2MCP
- Interface URL: `https://your-railway-domain/api/a2mcp/recommend`
- Method: `POST`
- Pricing: free for Phase 1 validation
- Input: structured profile, resume text, natural-language background, or caller-scoped continuation context
- Output: conversational state, ranked opportunities, explanations, readiness analysis, grounded resume intelligence, action plan, and learning roadmap

The current service remains free. This capability phase does not add payment requirements or change the registered endpoint.

After the free endpoint passes review and has stable behavior, add x402 payment middleware around `POST /api/a2mcp/recommend` and resubmit/update the listing as pay-per-call.

## Production Readiness Checks

- `GET /api/health` should return `ok: true`.
- `ai.configured` should be `true` when `GEMINI_API_KEY` is configured.
- `database.connected`, `database.pgvector`, and `database.schemaReady` should be `true` once Railway Postgres is configured and migrated.
- `database.sourceVerificationReady` should be `true` after the source verification migration.
- `POST /api/a2mcp/recommend` should return `HTTP 200` for the free OKX submission path.
- Leave `TRAKR_API_KEY` unset for public free OKX review unless OKX gives a shared secret or gateway header to enforce.
- Set `INGEST_API_KEY` before enabling scheduled ingestion.
- Set `RECOMMENDATION_LOG_HASH_KEY` to enable keyed request correlation without storing raw identifiers or resume content.
- Set `RECOMMENDATION_LOG_RETENTION_DAYS` between 1 and 365. Expired recommendation analytics are pruned during normal recommendation traffic.

## Current Railway Deployment

- Public URL: `https://trakr-production-c70e.up.railway.app`
- Railway services: `Trakr` application service and `Postgres` database service.
- Required app variables: `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `NEXT_PUBLIC_APP_URL`, `TRAKR_SERVICE_URL`, `RECOMMENDATION_LIMIT`, `RATE_LIMIT_REQUESTS_PER_MINUTE`, `INGEST_API_KEY`, and `TRAKR_ADMIN_API_KEY`.
- Optional AI resilience variable: `GEMINI_FALLBACK_MODELS`, a comma-separated list of Gemini model IDs to try when the primary model returns provider-side quota exhaustion.
- `DATABASE_URL` should be configured as a Railway reference to the attached Postgres service, not as a localhost placeholder.
- Latest verified live state on 2026-07-12:
  - `GET /api/health`: `ok: true`
  - Gemini provider: `gemini:gemini-3.1-flash-lite` or another configured Gemini model
  - Database: connected, pgvector installed, schema ready
  - Baseline seed: 7 opportunities
  - Structured ingestion: 59 opportunities stored from Devpost and RemoteOK
  - Remote smoke: passed

## Scheduled Ingestion

The repository includes `.github/workflows/ingest.yml`, which calls `POST /api/ingest` every six hours. Configure these GitHub repository secrets before enabling it:

- `TRAKR_SERVICE_URL`
- `INGEST_API_KEY`
