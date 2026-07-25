# Trakr Backend Orchestration Gap Analysis

Date: July 24, 2026

Endpoint: `POST https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`

Agent: `#5198`

Production version inspected: `0.7.1`

Milestone verdict at start: **NO-GO**

## Evidence Reviewed

- Repository HEAD `78d774f` and the preceding orchestration hardening commit `6fb3fc8`
- Uncommitted external-evidence report and local scratch directories
- Production health, A2MCP metadata, bootstrap response, and deployed website
- Service 1, Service 2, Service 3, orchestration, trust, workspace, and production smoke tests
- Existing release and inventory reports
- Pre-fix Antigravity transcript and generated caller script

## Aligned And Reusable

- A true empty or declaration-only bootstrap returns the three-service menu.
- The bootstrap exposes `service_selection_required`, `choose_service`, a request ID, version, required input, and encrypted continuation.
- Numeric service choices are bound to the continuation stage that issued them.
- Continuations are authenticated, encrypted, expiring, caller-carried references.
- Profile evidence distinguishes direct user input, resume extraction, inference, caller-supplied data, and unknown values.
- Caller-supplied structured profiles and resume-extracted profiles are held for confirmation before matching.
- Confirmed profile facts merge across continuation turns rather than replacing the entire profile.
- Geographic eligibility, work authorization, verification, deadline, duplicate, and ranking gates remain reusable.
- Direct opportunities, official directories, and supporting resources are separate collections.
- Direct results expose official URLs, and the human-readable result message renders those URLs.
- Service 2 benchmarks against a target before offering optimization.
- Service 2 optimization requires consent and keeps rewritten claims tied to evidence.
- Service 3 supports target-specific document types, fabrication prevention, evidence claim IDs, and deployed DOCX/PDF artifacts.
- Resume parsing supports PDF, DOCX, and TXT with size, MIME, privacy, and prompt-injection controls.
- Production artifact storage is deployed and does not require the caller's filesystem.
- HTTP 200 free access and OKX Agent Payments Protocol compatibility are already represented.
- The website calls the public A2MCP endpoint for business operations.

## Partially Aligned And Requiring Modification

- The response includes `operation`, `stage`, `status`, `message`, `requiredInputs`, `nextActions`, `continuation`, `apiVersion` through `version`, and `requestId`, but lacks first-class `allowedResponses`, `optionalInputs`, `attachmentsAccepted`, and a caller-action enum.
- Natural-language service selection works for a narrow phrase set but does not accept the full requested range of ordinary phrasing.
- Service 1 profile parsing already extracts categories and broad interests, but it uses a generic sufficiency checklist rather than category-specific adaptive intake.
- Multiple requested categories are preserved in filters, but there is no explicit ten-category selection state or merged category intake contract.
- Category coverage exists, but its schema reflects the legacy inventory categories rather than all ten user-facing discovery categories.
- Service 2 can ask only for a missing resume or target on later turns, but its first service response requests both together instead of making their independent state explicit.
- Service 3 eventually asks for a missing target before generation, but its first service response requests target and applicant facts simultaneously.
- The website uses the same endpoint, but it duplicates service and intake decisions in frontend constants instead of rendering the backend's choices and required inputs.
- OpenAPI documents the current contract but still advertises the legacy Service 1 intake routes.

## Conflicting And Requiring Replacement

- Service 1 begins with `resume`, `background`, or `request` instead of the ten opportunity categories.
- `choose_profile_source` and `discover_choose_input` are the governing first Service 1 states.
- Resume upload is visually promoted as a primary Service 1 route.
- `intakeRoute` is used as the main Service 1 UX decision.
- The website contains a separate `opportunityRoutes` product model and route cards.
- Metadata advertises `intakeRoutes: ["resume", "background", "request"]`.
- Existing Service 1 and workspace tests assert the conflicting route chooser.
- Generic mandatory background, skills, experience, and location checks can force a long form even where a broad category request has enough context for responsible discovery.

## Missing

- A server-issued ten-category Service 1 menu:
  jobs, internships, hackathons, scholarships, fellowships, grants and funding,
  bounties and freelance opportunities, accelerators and incubators,
  creator opportunities, and competitions and challenges.
- Parsing of one or many numeric choices, category names, and broad natural-language goals into the same category state.
- Category-specific minimum useful context and optional-field definitions.
- One merged follow-up for mixed-category requests.
- Explicit preservation of selected user-facing categories in continuation state.
- A first-class caller action describing whether to show a menu, ask a question, request an upload, display results, or offer an optional next action.
- First-class allowed responses, optional inputs, and accepted attachment descriptions.
- Target-first Service 3 intake.
- Website/A2MCP state and outcome parity tests.
- Complete individual and mixed tests for all ten Service 1 categories.
- Clearly labelled real-versus-simulated validation for Claude, Hermes, OpenClaw, Codex, and Antigravity.

## Implementation Boundary

The implementation should preserve the aligned trust, privacy, evidence, eligibility,
ranking, verification, continuation, artifact, and payment behavior. It should replace
the Service 1 route chooser with a backend-owned category state, add adaptive intake
on top of the existing profile/evidence merger, make Service 3 target-first, expose a
stronger response contract, and make the website render server-issued choices.

No Agent #5198 marketplace mutation is authorized. The exact current-versus-proposed
listing diff must be shown to the user and explicitly approved before any update.
