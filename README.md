# Trakr

![Trakr logo](public/trakr-logo.png)

Trakr is an outcome-first AI Opportunity Companion exposed as an A2MCP-style API service. The product presents three visible services: Opportunity Finding, Resume Benchmarking & Optimization, and Resume Generation. They share one capability layer and the stable public endpoint, `POST /api/a2mcp/recommend`.

Service 1, Opportunity Finding, and Service 2, Resume Benchmarking & Optimization, are production-ready in this repository. Service 2 has also passed a 153-case independently AI-reviewed and adjudicated synthetic calibration gate. Service 3, Resume Generation, is implemented behind the same additive endpoint and generates target-specific documents only from confirmed, claim-linked evidence.

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
- Structured opportunity type, domain, remote scope, geographic eligibility, deadline evidence, source tier, recommendation state, and multidimensional inventory monitoring.
- Target-specific resume and CV generation with claim IDs, placeholders, omissions, locale/format preferences, and prompt-injection containment.

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

## Resume Benchmarking And Optimization

Benchmarking is target-specific and comes before optimization:

```json
{
  "operation": "benchmark",
  "resumeText": "Synthetic resume text with at least 80 characters...",
  "consent": {
    "processPersonalData": true,
    "retention": "session_only",
    "source": "explicit"
  },
  "target": {
    "role": "Frontend Engineer Intern",
    "organization": "Example Labs",
    "opportunityType": "internship",
    "description": "The dated target description...",
    "requirements": [
      "React and TypeScript are required.",
      "Students may apply."
    ],
    "locale": "Nigeria"
  }
}
```

The response contains an evidence-linked `resumeBenchmark` and an opaque
continuation reference. Sending `operation: "optimize"` with that continuation
returns grounded edits only when the target and profile still match the stored
benchmark. Changed evidence or a changed target triggers a fresh benchmark.
Unknown target URLs are not scraped automatically; callers should provide a
dated description or requirements when the URL is not already in verified
Trakr inventory.

## Resume Generation

Generation is target-first and uses only explicit, confirmed evidence:

```json
{
  "operation": "generate_resume",
  "user": {
    "name": "Amina Fictional",
    "headline": "Frontend developer",
    "skills": ["React", "TypeScript"],
    "education": ["BSc Computer Science student at Fictional University"],
    "projects": ["Built an accessible TypeScript study planner."]
  },
  "target": {
    "role": "Frontend Engineering Internship",
    "opportunityType": "internship",
    "description": "Students may apply. React and TypeScript are required.",
    "requirements": ["Current enrollment is required."]
  },
  "generationPreferences": {
    "locale": "Nigeria",
    "format": "markdown",
    "pageLimit": 2,
    "instructions": ["Keep the document concise."]
  },
  "consent": {
    "processPersonalData": true,
    "retention": "session_only",
    "source": "explicit"
  }
}
```

Every non-placeholder applicant statement in `resumeGeneration.sections` has
supporting `evidenceClaimIds`. Missing facts become focused questions,
placeholders, or `omittedUnsupportedClaims`; target requirements never become
applicant history.

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
- `capabilityResult`: grounded explanation, readiness, resume benchmark, resume optimization, or claim-linked resume generation output when requested.

Complete legacy structured requests continue to use the original direct recommendation flow without conversational interruption. The endpoint remains free and does not require an OKX payment challenge in this phase.

## Factual Integrity

Trakr may improve wording, structure, relevance, ordering, and keyword alignment using facts the user supplied. It does not invent jobs, degrees, skills, projects, achievements, metrics, certifications, or eligibility.

Benchmark scores are transparent application-document heuristics. They are not
hiring predictions and do not claim to reproduce a specific employer's ATS.
The versioned Service 2 research record is in
`reports/service2-rubric-research-2026-07-20.md`. The independent synthetic
calibration report is in `reports/service2-calibration-2026-07-21.md`.

## Extending Sources

Add official APIs or structured feeds by implementing `OpportunitySource` in `src/lib/opportunities/source.ts`, then combine those sources in `src/lib/recommendation/service.ts`. Review and document every candidate in `src/lib/opportunities/source-registry.ts` first. DoraHacks and Encode Club remain directory-only until Trakr has a documented API, feed, partner delivery, or permissioned ingestion agreement; the service does not scrape protected or undocumented interfaces.

Inventory records distinguish `apply_now`, `explore`, `research_lead`, and
`unavailable_or_unverified`. Remote scope and Africa-related evidence do not
establish global or country eligibility without published support. The current
coverage and source-health snapshot is in
`reports/inventory-monitoring-2026-07-21.json`.

## Deployment

Railway deployment instructions are in `DEPLOYMENT.md`. OKX.AI registration details are in `OKX_SUBMISSION.md`.
