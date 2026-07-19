# Trakr

![Trakr logo](public/trakr-logo.png)

Trakr is an outcome-first AI Opportunity Companion exposed as an A2MCP-style API service. The product presents three visible services: Opportunity Finding, Resume Benchmarking & Optimization, and Resume Generation. They share one capability layer and the stable public endpoint, `POST /api/a2mcp/recommend`.

Service 1, Opportunity Finding, is currently production-ready in this repository. It accepts a resume, conversational background, or a free-form opportunity request. The other two services are visible and have additive operations reserved in the contract, but return an honest staged-service response until their separate release gates are complete.

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
- Encrypted, short-lived caller-carried session references so calling agents can conduct multi-turn journeys without a permanent shared user profile.
- Evidence ledger fields that distinguish explicit facts, reasonable inferences, and unknown information.
- Source provenance, deadline confidence, eligibility checks, canonical duplicate filtering, and quality-gated multi-interest coverage.

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

## Outcome-First Conversation

An empty conversational request returns the three service choices. An external agent can make the selection explicitly:

```json
{
  "operation": "discover"
}
```

For Opportunity Finding, the agent can choose a route with `intakeRoute` or let natural-language intent determine it:

```json
{
  "operation": "discover",
  "intakeRoute": "request",
  "message": "Find remote AI internships for a student in Nigeria."
}
```

## Natural-Language Request

```json
{
  "message": "I am a Nigerian computer science student with React, TypeScript, Python, and Solidity experience. I want remote AI and Web3 hackathons, grants, fellowships, and internships."
}
```

If the request is incomplete, Trakr returns `conversation.state: "needs_more_information"` with the minimum questions the calling agent should ask. When enough context is available, Trakr returns grounded recommendations and an opaque `conversation.continuation` reference that must be sent back unchanged for follow-up requests:

```json
{
  "message": "What am I missing for this opportunity?",
  "continuation": {
    "token": "returned-encrypted-session-token",
    "expiresAt": "2026-07-19T12:30:00.000Z",
    "sessionVersion": "2"
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

Complete legacy structured requests continue to use the original direct recommendation flow without conversational interruption. The endpoint remains free and does not require an OKX payment challenge in this phase.

## Factual Integrity

Trakr may improve wording, structure, relevance, ordering, and keyword alignment using facts the user supplied. It does not invent jobs, degrees, skills, projects, achievements, metrics, certifications, or eligibility.

## Extending Sources

Add official APIs or structured feeds by implementing `OpportunitySource` in `src/lib/opportunities/source.ts`, then combine those sources in `src/lib/recommendation/service.ts`. Review and document every candidate in `src/lib/opportunities/source-registry.ts` first. DoraHacks and Encode Club remain directory-only until Trakr has a documented API, feed, partner delivery, or permissioned ingestion agreement; the service does not scrape protected or undocumented interfaces.

## Deployment

Railway deployment instructions are in `DEPLOYMENT.md`. OKX.AI registration details are in `OKX_SUBMISSION.md`.
