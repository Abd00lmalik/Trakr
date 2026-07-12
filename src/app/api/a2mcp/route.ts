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
    inputModes: ["structured_profile", "resume_text"],
    futureBilling: {
      compatibleWith: "x402",
      status: "not_enabled_in_phase_1",
    },
  });
}
