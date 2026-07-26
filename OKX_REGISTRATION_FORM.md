# OKX.AI A2MCP Registration Form

Use these values when registering Trakr in OKX.AI / Onchain OS.

## Agent Details

- OKX Agent ID: #5198
- Category: Lifestyle Companion
- Health URL: https://trakr-production-c70e.up.railway.app/api/health
- Metadata URL: https://trakr-production-c70e.up.railway.app/api/a2mcp
- OpenAPI URL: https://trakr-production-c70e.up.railway.app/api/a2mcp/openapi
- Logo URL: https://trakr-production-c70e.up.railway.app/trakr-logo.png
- Avatar URL: https://trakr-production-c70e.up.railway.app/trakr-avatar.png
- OKX avatar URL: https://static.okx.com/cdn/web3/wallet/marketplace/headimages/agent/avatar/8281fbc1-189e-4ab4-8efa-ca726d5e273e.png

## Marketplace Services

All services are A2MCP, use `POST`, and cost `0.005 USDT` per valid API call.

1. Opportunity Discovery
   - Endpoint: https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend
2. Resume Benchmarking & Optimization
   - Endpoint: https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend?service=resume-benchmarking-optimization
3. Resume Generation
   - Endpoint: https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend?service=resume-generation

Each marketplace service enters only its corresponding Trakr workflow. The
backend rejects conflicting operations and continuations from another service.

## Input Summary

The endpoint accepts JSON containing:

- `user`: name, headline, skills, goals, interests, location, experience level, or resume text
- `filters`: category, remote preference, location, deadline, and result limit

## Output Summary

The endpoint returns JSON containing:

- ranked `recommendations`
- `matchScore`
- `reasoning`
- `missingRequirements`
- `recommendedAction`: Apply Now, Prepare First, or Skip
- `nextSteps`
- `actionPlan`
- `learningRoadmap`
- `agentNotes`

## Sample Request

```json
{
  "user": {
    "name": "Amina",
    "headline": "Frontend developer interested in Web3 public goods",
    "skills": ["React", "TypeScript", "Git", "Technical writing"],
    "goals": ["win a hackathon", "earn grant funding"],
    "interests": ["web3", "open source", "AI tools"],
    "location": "Lagos, Nigeria",
    "experienceLevel": "early-career"
  },
  "filters": {
    "remote": true,
    "limit": 3,
    "categories": ["hackathon", "grant", "web3_bounty"]
  }
}
```

## Verification

Latest local verification on 2026-07-26:

- OKX ASP identity: Registered
- OKX marketplace listing: Requires resubmission after deployment verification
- OKX avatar: Updated to official Trakr logo
- Three independent service entries: Locally verified
- x402 payment challenge and durable replay: Locally verified
- Production deployment and external service-entry verification: Pending
