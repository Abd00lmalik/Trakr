import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    service: "trakr",
    version: "0.2.0",
    type: "A2MCP",
    description:
      "AI-powered Opportunity Companion for ranked, explainable opportunity recommendations.",
    endpoints: {
      recommend: {
        method: "POST",
        path: "/api/a2mcp/recommend",
        description:
          "Accepts a structured profile, resume text, natural-language background, or caller-scoped continuation context. Returns conversational guidance, ranked opportunities, explanations, readiness analysis, and grounded resume intelligence.",
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
    inputModes: [
      "structured_profile",
      "resume_text",
      "natural_language",
      "continuation_context",
    ],
    conversationalStates: [
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
      "opportunity matching and explanation",
      "eligibility and skill-gap analysis",
      "opportunity readiness assessment",
      "ATS and resume benchmarking",
      "grounded role-specific resume optimization",
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
    dataSources: [
      "Devpost API",
      "RemoteOK API with quality filters",
      "Official curated source import",
    ],
    qualityControls: [
      "low-information listings are filtered or penalized",
      "ranking combines category, skill, experience, location, quality, deadline, and expected value",
      "only verified active opportunity pages may receive Apply Now",
      "program directories and inactive listings are explicitly identified",
      "unknown profile information remains unknown rather than being invented",
      "resume optimization never fabricates jobs, degrees, projects, metrics, certifications, or skills",
      "conversation continuation context is caller-scoped and not stored as shared user memory",
      "raw AI provider errors are never returned to callers",
    ],
  });
}
