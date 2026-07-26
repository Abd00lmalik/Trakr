# Deploying Trakr

This guide covers Trakr's Railway deployment and the staged conversion of its
existing A2MCP endpoint to x402 v2 pay-per-call access.

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
TRAKR_SESSION_SECRET=generate_a_different_long_random_value
TRAKR_SESSION_TTL_MINUTES=30
TRAKR_ARTIFACT_TTL_MINUTES=30
TRAKR_X402_ENFORCEMENT=off
TRAKR_X402_PAY_TO=0xbe116468bb544723141647608fe98c1bc0471291
TRAKR_X402_RESULT_SECRET=generate_a_third_long_random_value
TRAKR_X402_OKX_API_KEY=your_okx_seller_api_key
TRAKR_X402_OKX_SECRET_KEY=your_okx_seller_api_secret
TRAKR_X402_OKX_PASSPHRASE=your_okx_seller_api_passphrase
TRAKR_X402_OKX_BASE_URL=https://web3.okx.com
TRAKR_REQUEST_BODY_TIMEOUT_MS=5000
TRAKR_DOCUMENT_PROCESSING_TIMEOUT_MS=8000
TRAKR_BUSINESS_TIMEOUT_MS=25000
TRAKR_AI_ENHANCEMENT_BUDGET_MS=7000
TRAKR_X402_VERIFY_TIMEOUT_MS=8000
TRAKR_X402_SETTLE_TIMEOUT_MS=20000
TRAKR_X402_STATUS_TIMEOUT_MS=5000
TRAKR_DB_CONNECT_TIMEOUT_MS=3000
TRAKR_DB_QUERY_TIMEOUT_MS=5000
TRAKR_DB_STATEMENT_TIMEOUT_MS=5000
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

Trakr remains one existing A2MCP service on Agent `#5198`:

- Service name: Trakr
- Service type: A2MCP
- Interface URL: `https://your-railway-domain/api/a2mcp/recommend`
- Method: `POST`
- Marketplace pricing: `0.005 USDT` per API call after coordinated cutover
- Protocol payment: `0.005 USD?0` (`5000` atomic units) on
  `eip155:196`, x402 v2 `exact`
- Input: empty bootstrap, explicit service operation, structured profile, resume text, canonical base64 PDF/DOCX/TXT, natural-language request, or caller-scoped continuation
- Output: server-authoritative conversational state, five-action goal chooser, ranked opportunities, evidence-linked resume diagnostics, application-readiness guidance, and short-lived DOCX/PDF artifacts

Deploy payment-capable code with `TRAKR_X402_ENFORCEMENT=off` first. Apply the
database migration and verify payment readiness before coordinating the listing
fee update and enforcement switch. The endpoint and Agent identity remain
unchanged.

## Production Readiness Checks

- `GET /api/health` should return `ok: true`.
- `ai.configured` should be `true` when `GEMINI_API_KEY` is configured.
- `database.connected`, `database.pgvector`, and `database.schemaReady` should be `true` once Railway Postgres is configured and migrated.
- `database.sourceVerificationReady` should be `true` after the source verification migration.
- `database.artifactStorageReady` should be `true` after the resume artifact migration.
- With payment enforcement off, `POST /api/a2mcp/recommend` should preserve the
  current `HTTP 200` contract.
- With payment enforcement enabled, malformed and schema-invalid requests should
  remain `4xx` without a charge; valid unpaid requests should return `HTTP 402`
  with `PAYMENT-REQUIRED`.
- Paid retries use PostgreSQL-backed replay protection and encrypted short-lived
  response caching. Raw resumes and profiles are not stored in payment records.
- Leave `TRAKR_API_KEY` unset for public OKX access unless OKX gives a shared
  secret or gateway header to enforce.
- Set `INGEST_API_KEY` before enabling scheduled ingestion.
- Set `RECOMMENDATION_LOG_HASH_KEY` to enable keyed request correlation without storing raw identifiers or resume content.
- Set `TRAKR_SESSION_SECRET` to a separate long random value. It encrypts opaque, short-lived caller-carried session references; do not rotate it while active sessions must remain resumable.
- `TRAKR_SESSION_TTL_MINUTES` is bounded between 5 and 120 minutes and defaults to 30.
- `TRAKR_ARTIFACT_TTL_MINUTES` is bounded between 5 and 120 minutes and defaults to 30. Download URLs are bearer credentials and must not be logged or forwarded.
- `TRAKR_X402_RESULT_SECRET` encrypts paid-response replay data and must be
  separate from `TRAKR_SESSION_SECRET`.
- The unpaid x402 challenge is generated locally from the fixed, reviewed X
  Layer payment configuration. Payment verification and settlement still use
  the official OKX facilitator and have bounded response deadlines.
- Database, request-body, document-processing, AI enhancement, verification,
  settlement, and total business-response deadlines prevent an external
  dependency from leaving an A2MCP request open indefinitely.
- Production responses include `X-Request-Id`, `X-Trakr-Duration-Ms`, and
  `Server-Timing`. Railway logs contain privacy-safe stage and duration events
  keyed by the request ID.
- `TRAKR_X402_ENFORCEMENT` must remain `off` until the marketplace fee and
  endpoint enforcement can be switched together.
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
