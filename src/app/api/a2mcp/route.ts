import { NextResponse } from "next/server";
import { opportunitySourceRegistry } from "@/lib/opportunities/source-registry";
import { TRAKR_SERVICE_VERSION } from "@/lib/version";
import { discoveryCategoryDefinitions } from "@/lib/opportunities/discovery-categories";
import {
  isX402Enforced,
  X402_ASSET,
  X402_ATOMIC_AMOUNT,
  X402_NETWORK,
  X402_PRICE_USD,
  X402_SCHEME,
  X402_TOKEN_DECIMALS,
  X402_TOKEN_NAME,
  X402_VERSION,
} from "@/lib/payments/config";

export const runtime = "nodejs";

export async function GET() {
  const paymentRequired = isX402Enforced();
  return NextResponse.json({
    service: "trakr",
    displayTitle: "Trakr Opportunity & Resume Services",
    legacyServiceTitle: "Opportunity Matching API",
    version: TRAKR_SERVICE_VERSION,
    type: "A2MCP",
    description:
      "One server-authoritative conversational A2MCP endpoint exposing five goal-directed actions: opportunity discovery, resume benchmarking, resume optimization, resume generation, and application-readiness guidance.",
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
      "learning_resource",
      "student_benefit",
      "developer_program",
      "official_directory",
      "research_lead",
    ],
    discoveryCategories: discoveryCategoryDefinitions.map(
      ({ id, number, label, description }) => ({
        id,
        number,
        label,
        description,
      }),
    ),
    actions: ["Apply Now", "Prepare First", "Skip"],
    aiStatus: ["enhanced", "retrying", "degraded", "fallback"],
    services: [
      {
        id: "opportunity_finding",
        label: "Opportunity Finding",
        operation: "discover",
        status: "available",
        firstStage: "choose_opportunity_categories",
        resumeOptional: true,
        categories: discoveryCategoryDefinitions.map(({ id }) => id),
      },
      {
        id: "resume_benchmarking",
        label: "Resume Benchmarking and Analysis",
        operation: "benchmark",
        status: "available",
      },
      {
        id: "resume_optimization",
        label: "Target-Specific Resume Optimization",
        operation: "optimize",
        prerequisite: "compatible target-specific benchmark",
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
      {
        id: "application_readiness",
        label: "Application and Readiness Guidance",
        operation: "readiness",
        routes: [
          "assess a known Trakr opportunity",
          "benchmark a resume against a target",
          "find a suitable opportunity first",
        ],
        status: "available",
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
          label: "Benchmark or analyze my resume",
        },
        {
          value: "optimize",
          number: 3,
          label: "Optimize my resume for a target",
        },
        {
          value: "generate_resume",
          number: 4,
          label: "Generate a resume",
        },
        {
          value: "readiness",
          number: 5,
          label: "Help me with my application or readiness",
        },
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
      "readiness",
    ],
    inputModes: [
      "structured_profile",
      "profile_alias",
      "resume_text",
      "natural_language",
      "continuation_context",
      "continuation_alias",
      "base64_pdf_docx_txt",
      "multipart_resume_direct_to_recommend",
      "multipart_resume_parser_then_resume_text_legacy",
    ],
    documentInput: {
      endpointRepresentations: [
        "resumeText",
        "document.representation=text",
        "document.representation=base64",
        "multipart/form-data directly to /api/a2mcp/recommend",
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
      "choose_opportunity_categories",
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
      "readiness_choose_route",
      "resume_benchmark",
      "resume_optimization",
      "resume_generation",
    ],
    orchestrationContract: {
      authority:
        "The response callerAction, stage, status, requiredInputs, optionalInputs, allowedResponses, attachmentsAccepted, nextActions, and continuation determine the next valid caller action.",
      numericChoices:
        "Numeric aliases are valid only with the continuation for the menu stage that issued them.",
      callerInstructions: {
        relayMessage: true,
        doNotInferMissingInputs: true,
        sendContinuationUnchanged: true,
        doNotGenerateAProfile: true,
        surfaceOfficialUrls: true,
        doNotSelectService: true,
        askUserForRequiredInputs: true,
        doNotReplaceTrakrMatching: true,
        treatHttp200AsBusinessResponse: true,
        doNotExposeProtocolWorkWhenFree: !paymentRequired,
      },
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
      "ten-category, broad-first Opportunity Finding with adaptive merged intake",
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
    payment: {
      protocol: "x402",
      x402Version: X402_VERSION,
      scheme: X402_SCHEME,
      network: X402_NETWORK,
      asset: X402_ASSET,
      token: X402_TOKEN_NAME,
      tokenDecimals: X402_TOKEN_DECIMALS,
      price: X402_PRICE_USD,
      amount: X402_ATOMIC_AMOUNT,
      unit: "per_valid_api_call",
      enforcement: paymentRequired ? "enabled" : "disabled",
    },
    submission: {
      pricing: paymentRequired
        ? `${X402_PRICE_USD} ${X402_TOKEN_NAME} per valid API call`
        : "free",
      responseMode: paymentRequired
        ? "HTTP 402 x402 v2 challenge, then paid HTTP response"
        : "HTTP 200 JSON",
      paymentRequired,
    },
    dataSources: opportunitySourceRegistry,
    qualityControls: [
      "low-information listings are filtered or penalized",
      "ranking combines category, skill, experience, location, quality, deadline, and expected value",
      "only verified active opportunity pages may receive Apply Now",
      "direct opportunities, official directories, and supporting resources are returned in separate collections",
      "every visible direct opportunity includes one canonical officialUrl and the human-readable message includes that URL",
      "caller-supplied and resume-extracted profiles require user confirmation before matching",
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
      "PAYMENT-SIGNATURE":
        "Required x402 v2 payment proof when payment enforcement is enabled.",
    },
  });
}
