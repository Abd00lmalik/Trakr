# Architecture Decisions

## ADR 001: A2MCP First, Product UI Later

Trakr is optimized first as an OKX.AI A2MCP service. The public API surface is prioritized over a full dashboard because the hackathon submission requires a callable ASP endpoint.

## ADR 002: Free A2MCP Submission Before x402

The first OKX submission should be free and return `HTTP 200` JSON. x402 payment middleware remains the paid upgrade path after the endpoint is stable and accepted.

## ADR 003: Next.js App Router on Railway

Next.js keeps the API and future UI in one codebase. Railway is used because Trakr needs PostgreSQL/pgvector, health checks, logs, and future ingestion workers close to the API service.

## ADR 004: PostgreSQL + pgvector With Seeded Fallback

The production architecture uses PostgreSQL with pgvector for opportunity storage and future semantic matching. The runtime falls back to a seeded structured catalog when the database is not configured or empty so the ASP remains callable during setup.

## ADR 005: Gemini Provider Abstraction

Gemini is the primary AI provider. The implementation wraps it behind an `AiProvider` interface and uses deterministic local reasoning when no key is configured, which keeps development and review endpoints reliable.

## ADR 006: Resume Files Are Parsed, Not Stored

The resume parsing endpoint extracts text from PDF, DOCX, or TXT uploads and returns a draft profile. It does not persist the uploaded file, aligning with the research privacy model.

## ADR 007: Official Sources Before Scraping

The next ingestion milestone should add structured sources such as Devpost and RemoteOK before any scraping. Scraping should be used only when APIs/RSS are unavailable and terms allow it.

## ADR 008: API Guardrails Without Blocking OKX Review

The recommendation endpoint has CORS, structured errors, in-memory rate limiting, and an optional `TRAKR_API_KEY`. The API key should remain unset for free public OKX review unless OKX requires a shared secret.

## ADR 009: Protected Operator Database Setup

Railway does not always provide local CLI access to the deployed environment or a safe way to copy database URLs into local shells. Trakr includes `POST /api/admin/database`, protected by `TRAKR_ADMIN_API_KEY` or `INGEST_API_KEY`, to apply schema migrations and seed baseline opportunities from inside the deployed runtime.

This endpoint is intentionally outside the public A2MCP surface. It exists for deployment operations only and must remain protected in production.

## ADR 010: Gemini Flash Model Pin

Trakr pins Gemini to `gemini-3.5-flash` by default after verifying the current official Gemini API model naming. The provider abstraction still allows switching models or providers through environment variables without changing recommendation logic.

## ADR 011: Grounded Ranking Before AI Enhancement

Trakr ranks real, stored opportunities before calling Gemini. AI enhancement may improve reasoning, missing-skill language, next steps, action plans, and learning roadmaps, but it must not invent opportunities or reorder weak listings above stronger grounded matches.

## ADR 012: Official Curated Catalog as Quality Floor

Structured ingestion remains important, but Phase 1 requires reliable recommendations even when third-party feeds are unavailable or sparse. Trakr keeps an official curated catalog with verified source URLs across Web3, AI/data, cybersecurity, creator, founder, student, open-source, and developer programs. This catalog acts as the minimum quality floor and database fallback.

## ADR 013: Session-Scoped Profiles, Not Permanent User Records

Trakr treats every new ASP interaction as a fresh profile-building session. The caller carries the returned continuation context between requests; Trakr does not require a permanently stored personal profile. Continuation preserves supplied facts, evidence provenance, selected opportunity context, and confirmation state for the current conversation only.

Profile evidence distinguishes explicit facts, reasonable inferences, and unknown fields. A fact does not become explicit merely because it passed through continuation context.

## ADR 014: Deterministic Gates Around AI Reasoning

AI may extract, summarize, and explain, but deterministic logic owns minimum profile gates, verified opportunity records, hard role-family mismatches, score bounds, and action eligibility. AI enhancement may demote a recommendation but cannot promote it above the deterministic action or score.

If generated reasoning says an opportunity is unrelated or a poor fit, consistency enforcement lowers or removes that recommendation and rebuilds the action plan from the remaining ranked results.

## ADR 015: Capability Milestone Sequence

Trakr capabilities share one session profile, evidence model, opportunity record, and target-opportunity context.

1. Foundation: session profile building, resume evidence extraction, minimum-information gates, continuation, matching consistency, and backward compatibility.
2. Decision support: readiness analysis, skill-gap analysis, application action plans, and profile/resume benchmarking.
3. Application materials: ATS analysis, role-specific resume optimization, and resume generation grounded only in confirmed evidence and the selected opportunity.

The website and ASP should call the same capability services. External agents receive structured conversational state and operations through the existing additive A2MCP contract.
