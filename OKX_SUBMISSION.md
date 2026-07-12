# OKX.AI Genesis Submission Packet

## Service

- Name: Trakr
- Type: A2MCP
- Category target: Lifestyle Companion
- Pricing for first submission: Free
- Endpoint: `https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`
- Method: `POST`
- Health: `https://trakr-production-c70e.up.railway.app/api/health`
- Metadata: `https://trakr-production-c70e.up.railway.app/api/a2mcp`
- OpenAPI: `https://trakr-production-c70e.up.railway.app/api/a2mcp/openapi`
- Protected ingestion: `https://trakr-production-c70e.up.railway.app/api/ingest`
- Protected DB setup: `https://trakr-production-c70e.up.railway.app/api/admin/database`
- MCP metadata template: `.mcp.json.example`

## Description

Trakr is an AI-powered Opportunity Companion that helps students, developers, freelancers, creators, and builders discover relevant opportunities and act on them. It accepts a structured profile or resume text and returns ranked opportunities, match scores, explainable reasoning, missing requirements, recommended actions, an action plan, and a learning roadmap.

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
6. Remaining: Register as A2MCP in OKX.AI/Onchain OS with the endpoint above.
7. Remaining: Submit as free for first review.
8. Later: Add x402 only after free endpoint stability is proven or OKX requires paid calls.

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
