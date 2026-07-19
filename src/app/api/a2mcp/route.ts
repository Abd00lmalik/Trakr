import { NextResponse } from "next/server";
import { opportunitySourceRegistry } from "@/lib/opportunities/source-registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    service: "trakr",
    version: "0.3.0",
    type: "A2MCP",
    description:
      "Outcome-first AI Opportunity Companion with three user-facing services and one additive A2MCP endpoint.",
    endpoints: {
      recommend: {
        method: "POST",
        path: "/api/a2mcp/recommend",
        description:
          "Accepts explicit operations, structured profile data, resume text, natural-language requests, or an opaque caller-carried continuation reference. Existing legacy structured recommendation requests remain supported.",
      },
      health: {
        method: "GET",
        path: "/api/health",
      },
      openapi: {
        method: "GET",
        path: "/api/a2mcp/openapi",
      },
      parseResume: {
        method: "POST",
        path: "/api/profile/parse-resume",
      },
      ingest: {
        method: "POST",
        path: "/api/ingest",
        description: "Protected operator endpoint for refreshing structured opportunity sources.",
      },
    },
    categories: [
      "hackathon",
      "grant",
      "scholarship",
      "fellowship",
      "internship",
      "remote_job",
      "web3_bounty",
    ],
    actions: ["Apply Now", "Prepare First", "Skip"],
    aiStatus: ["enhanced", "retrying", "degraded", "fallback"],
    services: [
      {
        id: "opportunity_finding",
        label: "Opportunity Finding",
        operation: "discover",
        status: "available",
        intakeRoutes: ["resume", "background", "request"],
      },
      {
        id: "resume_benchmarking_optimization",
        label: "Resume Benchmarking & Optimization",
        operations: ["benchmark", "optimize"],
        status: "service_selection_and_legacy_compatibility",
      },
      {
        id: "resume_generation",
        label: "Resume Generation",
        operation: "generate_resume",
        status: "service_selection_only_until_phase_3",
      },
    ],
    operations: ["auto", "discover", "benchmark", "optimize", "generate_resume"],
    inputModes: [
      "structured_profile",
      "profile_alias",
      "resume_text",
      "natural_language",
      "continuation_context",
      "continuation_alias",
    ],
    conversationalStates: [
      "choose_service",
      "service_pending",
      "consent_required",
      "choose_profile_source",
      "awaiting_resume",
      "collecting_background",
      "needs_more_information",
      "profile_confirmation",
      "recommendations",
      "explanation",
      "readiness",
      "resume_benchmark",
      "resume_optimization",
    ],
    capabilities: [
      "profile building without a resume",
      "session-scoped profile evidence with explicit, inferred, and unknown facts",
      "opportunity matching and explanation",
      "eligibility and skill-gap analysis",
      "opportunity readiness assessment",
      "resume benchmarking and optimization compatibility path",
      "resume generation service selection",
    ],
    futureBilling: {
      compatibleWith: "x402",
      status: "not_enabled_in_phase_1",
    },
    submission: {
      pricing: "free",
      responseMode: "HTTP 200 JSON for Phase 1",
      paymentRequired: false,
    },
    dataSources: opportunitySourceRegistry,
    qualityControls: [
      "low-information listings are filtered or penalized",
      "ranking combines category, skill, experience, location, quality, deadline, and expected value",
      "only verified active opportunity pages may receive Apply Now",
      "program directories and inactive listings are explicitly identified",
      "unknown profile information remains unknown rather than being invented",
      "resume optimization never fabricates jobs, degrees, projects, metrics, certifications, or skills",
      "conversation continuation context is caller-scoped and not stored as shared user memory",
      "raw AI provider errors are never returned to callers",
      "DoraHacks and Encode Club are explore-only until a documented API, feed, partnership, or permissioned ingestion path is approved",
    ],
    requestHeaders: {
      "Idempotency-Key":
        "Optional caller key for replay-safe requests within the deployment window.",
      "X-Request-Id":
        "Optional caller correlation value; response always includes X-Request-Id.",
    },
  });
}
