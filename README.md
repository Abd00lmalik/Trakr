# Trakr

![Trakr logo](public/trakr-logo.png)

Trakr is an AI-powered Opportunity Companion exposed as an A2MCP-style API service. It accepts a structured user profile or resume text and returns ranked opportunity recommendations with match scores, reasoning, missing requirements, recommended actions, an action plan, and a learning roadmap.

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

## Response Shape

The API returns:

- `recommendations`: ranked opportunities with `matchScore`, reasoning, missing requirements, recommended action, and next steps.
- `actionPlan`: immediate, seven-day, and thirty-day guidance.
- `learningRoadmap`: focus areas, resources to find, and practice projects.
- `agentNotes`: implementation notes for downstream agents.

## Extending Sources

Add official APIs or structured feeds by implementing `OpportunitySource` in `src/lib/opportunities/source.ts`, then combine those sources in `src/lib/recommendation/service.ts`. The seeded catalog is intentionally small and should be replaced or supplemented with live provider adapters as the service matures.

## Deployment

Railway deployment instructions are in `DEPLOYMENT.md`. OKX.AI registration details are in `OKX_SUBMISSION.md`.
