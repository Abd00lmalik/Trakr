import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    service: "trakr",
    version: "0.1.0",
    type: "A2MCP",
    description:
      "AI-powered Opportunity Companion for ranked, explainable opportunity recommendations.",
    endpoints: {
      recommend: {
        method: "POST",
        path: "/api/a2mcp/recommend",
        description:
          "Accepts a structured profile or resume text and returns ranked opportunities, reasoning, gaps, next actions, action plan, and learning roadmap.",
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
    inputModes: ["structured_profile", "resume_text"],
    futureBilling: {
      compatibleWith: "x402",
      status: "not_enabled_in_phase_1",
    },
    submission: {
      pricing: "free",
      responseMode: "HTTP 200 JSON for Phase 1",
      paidUpgradePath: "x402 middleware on /api/a2mcp/recommend",
    },
    dataSources: [
      "Devpost API",
      "RemoteOK API with quality filters",
      "Official curated source import",
    ],
    qualityControls: [
      "low-information listings are filtered or penalized",
      "ranking combines category, skill, experience, location, quality, deadline, and expected value",
      "raw AI provider errors are never returned to callers",
    ],
  });
}
