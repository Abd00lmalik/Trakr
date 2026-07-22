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

Trakr provides three conversational services through one stable A2MCP endpoint: Opportunity Finding, Resume Benchmarking & Optimization, and Resume Generation. An empty or service-declaration-only request returns a machine-readable chooser. Explicit goals route directly. Trakr accepts structured profiles, extracted resume text, supported PDF/DOCX/TXT representations, natural-language input, or caller-scoped continuation state, and can return short-lived authorized DOCX/PDF artifacts.

## Why It Fits A2MCP

Trakr exposes a standardized API endpoint that another agent can bootstrap without business parameters. The response declares the current stage, required inputs, machine-readable choices, next actions, and opaque continuation. The current service returns free `HTTP 200` responses without a payment challenge.

## Bootstrap Request

```json
{}
```

The bootstrap response presents:

1. Find opportunities
2. Resume Benchmarking & Optimization
3. Resume Generation

## Legacy Discovery Request

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
- `stage`, `status`, `requiredInputs`, `nextActions`, and `continuation`
- short-lived `artifacts` after approved optimization or resume generation

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
- Public display title proposed: Trakr Opportunity & Resume Services
- Legacy service title: Opportunity Matching API
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
