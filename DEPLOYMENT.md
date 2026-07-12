# Deploying Trakr

This guide covers the first public deployment path for Trakr as a free A2MCP endpoint on Railway. x402 payment gating can be added after the free endpoint is stable and accepted by OKX.AI.

## Railway

1. Create a new Railway project from this repository.
2. Add environment variables:

```text
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-1.5-flash
TRAKR_SERVICE_URL=https://your-railway-domain
DATABASE_URL=postgresql://...
RECOMMENDATION_LIMIT=7
```

3. Add a PostgreSQL service in Railway, then apply the schema:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

4. Deploy the app. Railway should use `railway.toml`, run `npm ci && npm run build`, and start with `npm run start`.

5. Verify the public endpoints:

```bash
curl -i https://your-railway-domain/api/health
curl -i https://your-railway-domain/api/a2mcp
curl -i -X POST https://your-railway-domain/api/a2mcp/recommend \
  -H "Content-Type: application/json" \
  -d '{"user":{"headline":"Frontend developer interested in Web3","skills":["React","TypeScript"],"goals":["win a hackathon"],"interests":["web3"]},"filters":{"remote":true,"limit":3}}'
```

## OKX.AI A2MCP Registration

For the first submission, register Trakr as a free A2MCP service:

- Service name: Trakr
- Service type: A2MCP
- Interface URL: `https://your-railway-domain/api/a2mcp/recommend`
- Method: `POST`
- Pricing: free for Phase 1 validation
- Input: structured profile or resume text with optional filters
- Output: ranked opportunities, match scores, reasoning, missing requirements, recommended actions, action plan, and learning roadmap

After the free endpoint passes review and has stable behavior, add x402 payment middleware around `POST /api/a2mcp/recommend` and resubmit/update the listing as pay-per-call.
