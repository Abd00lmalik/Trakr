import { NextResponse } from "next/server";
import { opportunitySourceRegistry } from "@/lib/opportunities/source-registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    service: "trakr",
    displayTitle: "Trakr Opportunity & Resume Services",
    legacyServiceTitle: "Opportunity Matching API",
    version: "0.6.0",
    type: "A2MCP",
    description:
      "One conversational A2MCP endpoint for Opportunity Finding, Resume Benchmarking & Optimization, and Resume Generation. An empty or ambiguous bootstrap request returns a machine-readable three-service menu.",
    endpoints: {
      recommend: {
        method: "POST",
        path: "/api/a2mcp/recommend",
        description:
          "Accepts an empty bootstrap body, operation start, explicit service operations, structured profile data, supported resume representations, natural-language requests, or an opaque caller-carried continuation reference. Existing legacy structured recommendation requests remain supported.",
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
      artifactDownload: {
        method: "GET",
        path: "/api/artifacts/{id}?token={short-lived-token}",
        description:
          "Downloads a generated DOCX or PDF through the short-lived bearer URL returned by optimize or generate_resume.",
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
        status: "available",
      },
      {
        id: "resume_generation",
        label: "Resume Generation",
        operation: "generate_resume",
        status: "available",
        documentTypes: [
          "private_sector_resume",
          "internship_resume",
          "academic_cv",
          "research_cv",
          "biosketch",
          "scholarship_cv",
          "fellowship_profile",
          "grant_profile",
          "hackathon_profile",
          "technical_project_resume",
          "design_portfolio_resume",
          "team_member_profile",
          "general_professional_profile",
        ],
      },
    ],
    bootstrap: {
      operation: "start",
      accepts: [{}, { operation: "start" }, { message: "" }],
      stage: "choose_service",
      status: "needs_input",
      options: [
        { value: "discover", number: 1, label: "Find opportunities" },
        {
          value: "benchmark",
          number: 2,
          label: "Resume Benchmarking & Optimization",
        },
        { value: "generate_resume", number: 3, label: "Resume Generation" },
      ],
      rule:
        "A service declaration or legacy display title alone is ambiguous and must not route to Opportunity Finding.",
    },
    operations: [
      "start",
      "auto",
      "discover",
      "benchmark",
      "optimize",
      "generate_resume",
    ],
    inputModes: [
      "structured_profile",
      "profile_alias",
      "resume_text",
      "natural_language",
      "continuation_context",
      "continuation_alias",
      "base64_pdf_docx_txt",
      "multipart_resume_parser_then_resume_text",
    ],
    documentInput: {
      endpointRepresentations: [
        "resumeText",
        "document.representation=text",
        "document.representation=base64",
      ],
      multipartParser: "/api/profile/parse-resume",
      acceptedMimeTypes: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ],
      maxBytes: 2500000,
      remoteDocumentUrls: "not_supported",
    },
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
      "resume_generation",
    ],
    orchestrationContract: {
      authority:
        "The response stage, status, requiredInputs, nextActions, and continuation determine the next valid caller action.",
      numericChoices:
        "Numeric aliases are valid only with the continuation for the menu stage that issued them.",
      priority: [
        "valid continuation and current stage",
        "explicit operation",
        "clear natural-language intent",
        "legacy structured discovery request",
        "ambiguous cold start",
      ],
    },
    capabilities: [
      "profile building without a resume",
      "session-scoped profile evidence with explicit, inferred, and unknown facts",
      "opportunity matching and explanation",
      "eligibility and skill-gap analysis",
      "opportunity readiness assessment",
      "target-specific resume benchmarking with evidence mapping",
      "grounded resume optimization after a compatible benchmark",
      "target-specific resume and CV generation from confirmed evidence",
      "real short-lived DOCX and PDF artifacts for successful optimization and generation",
      "artifact selection across professional resumes, internship resumes, academic and research CVs, biosketches, scholarship and fellowship profiles, grant profiles, hackathon profiles, and portfolio-oriented resumes",
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
      "resume generation links every non-placeholder applicant statement to confirmed claim IDs",
      "download tokens are random, stored only as hashes, expire, and never expose local filesystem paths",
      "missing generation facts become focused questions, placeholders, or omissions",
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
