# Trakr

![Trakr logo](public/trakr-logo.png)

Trakr is a conversational AI Opportunity Companion exposed as an A2MCP-style API service. Existing clients can send a structured profile or resume text and receive direct recommendations. Conversational callers can also start with a natural-language goal, progressively build a profile without a resume, explain matches, assess opportunity readiness, and benchmark or optimize application materials without fabricated experience.

## MVP Scope

- Next.js 15 App Router with TypeScript.
- Public A2MCP metadata endpoint at `GET /api/a2mcp`.
- Main recommendation endpoint at `POST /api/a2mcp/recommend`.
- OpenAPI-style contract endpoint at `GET /api/a2mcp/openapi`.
- Resume parsing endpoint at `POST /api/profile/parse-resume`.
- Protected structured ingestion endpoint at `POST /api/ingest`.
- PostgreSQL and pgvector schema for opportunity storage and future semantic matching.
- Gemini provider abstraction with deterministic local fallback when `GEMINI_API_KEY` is not configured.
- Structured opportunity source interface with a seeded catalog for Phase 1.
- Zod validation for clean agent-consumable input and output contracts.
- Stateless conversational continuation context so calling agents can conduct multi-turn journeys without unsafe shared user memory.
- Grounded readiness, ATS benchmarking, and resume-positioning capabilities that preserve factual integrity.

## Folder Structure

```text
db/schema.sql
src/app/api/a2mcp/route.ts
src/app/api/a2mcp/recommend/route.ts
src/app/api/health/route.ts
src/app/page.tsx
scripts/
src/lib/ai/
src/lib/db.ts
src/lib/opportunities/
src/lib/recommendation/
src/lib/repositories/
src/lib/types/opportunities.ts
```

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Optional database setup:

```bash
npm run db:migrate
npm run db:seed
```

Verification:

```bash
npm run verify
```

## Example Request

```json
{
  "user": {
    "name": "Amina",
    "headline": "Frontend developer interested in Web3 public goods",
    "skills": ["React", "TypeScript", "Solidity basics", "Technical writing"],
    "experienceLevel": "early-career",
    "location": "Lagos, Nigeria",
    "goals": ["win a hackathon", "earn grant funding", "find remote builder roles"],
    "interests": ["web3", "AI tools", "open source"]
  },
  "filters": {
    "categories": ["hackathon", "grant", "web3_bounty"],
    "remote": true
  }
}
```

## Conversational Request

```json
{
  "message": "I am a Nigerian computer science student with React, TypeScript, Python, and Solidity experience. I want remote AI and Web3 hackathons, grants, fellowships, and internships."
}
```

If the request is incomplete, Trakr returns `conversation.state: "needs_more_information"` with the minimum questions the calling agent should ask. When enough context is available, Trakr returns grounded recommendations and a caller-scoped `conversation.continuation` object that can be sent back for follow-up requests:

```json
{
  "message": "What am I missing for this opportunity?",
  "context": {
    "profile": {},
    "profileEvidence": [],
    "selectedOpportunityId": "returned-opportunity-id",
    "profileConfirmed": false
  }
}
```

## Response Shape

The API returns:

- `recommendations`: ranked opportunities with `matchScore`, reasoning, missing requirements, recommended action, and next steps.
- `actionPlan`: immediate, seven-day, and thirty-day guidance.
- `learningRoadmap`: focus areas, resources to find, and practice projects.
- `agentNotes`: implementation notes for downstream agents.
- `conversation`: additive state, natural-language guidance, profile provenance, missing information, and continuation context.
- `capabilityResult`: grounded explanation, readiness, resume benchmark, or resume optimization output when requested.

Complete legacy structured requests continue to use the original direct recommendation flow without conversational interruption.

## Factual Integrity

Trakr may improve wording, structure, relevance, ordering, and keyword alignment using facts the user supplied. It does not invent jobs, degrees, skills, projects, achievements, metrics, certifications, or eligibility.

## Extending Sources

Add official APIs or structured feeds by implementing `OpportunitySource` in `src/lib/opportunities/source.ts`, then combine those sources in `src/lib/recommendation/service.ts`. The seeded catalog is intentionally small and should be replaced or supplemented with live provider adapters as the service matures.

## Deployment

Railway deployment instructions are in `DEPLOYMENT.md`. OKX.AI registration details are in `OKX_SUBMISSION.md`.
