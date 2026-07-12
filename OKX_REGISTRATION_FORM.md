# OKX.AI A2MCP Registration Form

Use these values when registering Trakr in OKX.AI / Onchain OS.

## Service Details

- Service name: Trakr
- OKX Agent ID: #5198
- Service type: A2MCP
- Category: Lifestyle Companion
- Pricing: Free
- Method: POST
- Endpoint: https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend
- Health URL: https://trakr-production-c70e.up.railway.app/api/health
- Metadata URL: https://trakr-production-c70e.up.railway.app/api/a2mcp
- OpenAPI URL: https://trakr-production-c70e.up.railway.app/api/a2mcp/openapi
- Logo URL: https://trakr-production-c70e.up.railway.app/trakr-logo.png
- Avatar URL: https://trakr-production-c70e.up.railway.app/trakr-avatar.png
- OKX avatar URL: https://static.okx.com/cdn/web3/wallet/marketplace/headimages/agent/avatar/8281fbc1-189e-4ab4-8efa-ca726d5e273e.png

## Short Description

Trakr is an AI-powered Opportunity Companion that returns ranked, explainable opportunity recommendations for students, developers, freelancers, creators, and builders.

## Full Description

Trakr accepts a structured user profile or resume text and matches the user against hackathons, grants, scholarships, fellowships, internships, remote jobs, and Web3 bounties. It returns ranked recommendations with match scores, AI reasoning, missing requirements, recommended action, next steps, a personalized action plan, and a learning roadmap.

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

Latest verification on 2026-07-12:

- OKX ASP identity: Registered
- OKX marketplace listing: Under review
- OKX review note: AI quality review suggested pass
- OKX avatar: Updated to official Trakr logo
- Health endpoint: OK
- Railway deployment: Online
- PostgreSQL: Connected
- pgvector: Installed
- Schema: Ready
- AI provider: Gemini Flash
- Recommendation endpoint: OK
- OpenAPI endpoint: OK
- PDF and DOCX resume parsing: OK
