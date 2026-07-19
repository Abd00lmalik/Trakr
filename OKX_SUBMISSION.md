# OKX.AI Genesis Submission Packet

## Service

- Name: Trakr
- OKX Agent ID: `#5198`
- Type: A2MCP
- Category target: Lifestyle Companion
- Pricing for first submission: Free
- Endpoint: `https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`
- Method: `POST`
- Health: `https://trakr-production-c70e.up.railway.app/api/health`
- Metadata: `https://trakr-production-c70e.up.railway.app/api/a2mcp`
- OpenAPI: `https://trakr-production-c70e.up.railway.app/api/a2mcp/openapi`
- Logo: `https://trakr-production-c70e.up.railway.app/trakr-logo.png`
- Avatar: `https://trakr-production-c70e.up.railway.app/trakr-avatar.png`
- OKX avatar: `https://static.okx.com/cdn/web3/wallet/marketplace/headimages/agent/avatar/8281fbc1-189e-4ab4-8efa-ca726d5e273e.png`
- Protected ingestion: `https://trakr-production-c70e.up.railway.app/api/ingest`
- Protected DB setup: `https://trakr-production-c70e.up.railway.app/api/admin/database`
- MCP metadata template: `.mcp.json.example`
- Paste-ready registration form: `OKX_REGISTRATION_FORM.md`
- Marketplace review status: Listed and active

## Description

Trakr is a conversational AI Opportunity Companion that helps students, developers, freelancers, creators, and builders discover relevant opportunities and act on them. It accepts structured profiles, resumes, natural-language background, or caller-scoped continuation context and returns profile guidance, ranked opportunities, match explanations, readiness analysis, grounded resume intelligence, action plans, and learning roadmaps.

## Why It Fits A2MCP

Trakr exposes a standardized API endpoint that another agent can call with a user profile and filters. The response is structured JSON designed for direct agent consumption. For Phase 1, it returns free `HTTP 200` responses. The paid upgrade path is x402 payment middleware around the recommendation route.

## Sample Request

```json
{
  "user": {
    "headline": "Frontend developer interested in Web3 public goods",
    "skills": ["React", "TypeScript", "Solidity basics", "Technical writing"],
    "experienceLevel": "early-career",
    "location": "Lagos, Nigeria",
    "goals": ["win a hackathon", "earn grant funding"],
    "interests": ["web3", "open source"]
  },
  "filters": {
    "categories": ["hackathon", "grant", "web3_bounty"],
    "remote": true,
    "limit": 3
  }
}
```

## Response Includes

- ranked `recommendations`
- `matchScore`
- AI or deterministic `reasoning`
- `missingRequirements`
- `recommendedAction`: `Apply Now`, `Prepare First`, or `Skip`
- `nextSteps`
- `actionPlan`
- `learningRoadmap`
- `agentNotes`

## Registration Checklist

1. Done: Deploy Railway service and confirm HTTPS URL.
2. Done: Configure `TRAKR_SERVICE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `DATABASE_URL`.
3. Done: Run protected DB setup through `POST /api/admin/database` with `TRAKR_ADMIN_API_KEY`.
4. Done: Run `SMOKE_BASE_URL=https://trakr-production-c70e.up.railway.app npm run smoke`.
5. Done: Configure `INGEST_API_KEY` and run `npm run ingest` with `TRAKR_SERVICE_URL`.
6. Done: Register as A2MCP in OKX.AI/Onchain OS with the endpoint above.
7. Done: Submit as free for first review.
8. Done: Listed publicly on OKX.AI.
9. Current phase: Keep the service free and preserve the registered endpoint and identity.

## OKX Registration Result

- Agent ID: `#5198`
- Registration transaction: `0x01ca3d9585c76bc5a88357d66b09cb62f7f192cb28f3d956582081e6cf93d240`
- Official avatar update transaction: `0x80a0843597fcdd25b7925bdbf36e47bb3c1134492781bdcfb4986866d093180d`
- Owner X Layer address: `0xbe116468bb544723141647608fe98c1bc0471291`
- Service: Opportunity Matching API
- Service type: A2MCP
- Fee: `0 USDT`
- Endpoint: `https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`
- Current status: Listed and active
- Pricing remains: `0 USDT`

## Manual/User-Gated Steps

The following must be done by the user if prompted by OKX:

- wallet signature
- Agentic Wallet creation or login
- accepting OKX terms
- identity verification
- marketplace final submission approval
- paid x402 configuration requiring payment credentials

## Current OKX Documentation Check

Verified on 2026-07-12 against official OKX Onchain OS docs:

- A2MCP supports a free response path where the service returns `HTTP 200`.
- Paid A2MCP uses x402 and returns `HTTP 402 Payment Required` before payment.
- ASP registration requires service name, description, price, and endpoint.
- Trakr should submit as free first, then add x402 after the endpoint is stable or if OKX requires paid calls.
