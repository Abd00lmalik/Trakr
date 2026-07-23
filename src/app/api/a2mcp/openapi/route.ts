import { NextResponse } from "next/server";
import { TRAKR_SERVICE_VERSION } from "@/lib/version";

export const runtime = "nodejs";

const serviceChoices = [
  { id: "opportunity_finding", value: "discover", number: 1, label: "Find opportunities" },
  {
    id: "resume_benchmarking_optimization",
    value: "benchmark",
    number: 2,
    label: "Resume Benchmarking & Optimization",
  },
  { id: "resume_generation", value: "generate_resume", number: 3, label: "Resume Generation" },
];

const choiceSchema = {
  type: "object",
  required: ["id", "value", "label"],
  properties: {
    id: { type: "string" },
    value: { type: "string" },
    number: { type: "integer", minimum: 1 },
    label: { type: "string" },
    description: { type: "string" },
  },
};

const continuationSchema = {
  type: "object",
  description:
    "Opaque, encrypted, short-lived caller-carried state. Return it unchanged with the next answer. Numeric choices are valid only for the stage that issued this continuation.",
  required: ["token", "expiresAt", "sessionVersion"],
  properties: {
    token: { type: "string", minLength: 40 },
    expiresAt: { type: "string", format: "date-time" },
    sessionVersion: { const: "2" },
  },
};

const requiredInputSchema = {
  type: "object",
  required: ["id", "type", "required", "prompt"],
  properties: {
    id: { type: "string" },
    type: { type: "string", enum: ["enum", "boolean", "text", "document", "object"] },
    required: { type: "boolean" },
    prompt: { type: "string" },
    options: { type: "array", items: choiceSchema },
    acceptedRepresentations: { type: "array", items: { type: "string" } },
    acceptedMimeTypes: { type: "array", items: { type: "string" } },
    maxBytes: { type: "integer", minimum: 1 },
    fields: { type: "array", items: { type: "string" } },
  },
};

const artifactSchema = {
  type: "object",
  required: [
    "id",
    "type",
    "format",
    "filename",
    "mimeType",
    "downloadUrl",
    "expiresAt",
    "sizeBytes",
    "sha256",
    "regenerateAction",
  ],
  properties: {
    id: { type: "string" },
    type: { type: "string", enum: ["resume", "cv", "application_document"] },
    format: { type: "string", enum: ["docx", "pdf"] },
    filename: { type: "string" },
    mimeType: { type: "string" },
    downloadUrl: {
      type: "string",
      format: "uri",
      description: "Authorized short-lived bearer URL. Do not log, cache, or forward it.",
    },
    expiresAt: { type: "string", format: "date-time" },
    sizeBytes: { type: "integer", minimum: 0 },
    sha256: { type: "string" },
    regenerateAction: { type: "string", enum: ["optimize", "generate_resume"] },
  },
};

const recommendationSchema = {
  type: "object",
  required: [
    "rank",
    "opportunity",
    "matchScore",
    "reasoning",
    "missingRequirements",
    "recommendedAction",
    "nextSteps",
    "officialUrl",
    "canonicalUrl",
    "publisherDomain",
    "sourceName",
    "verificationStatus",
    "lastVerifiedAt",
    "deadline",
    "deadlineStatus",
    "eligibilitySummary",
    "geographicEligibility",
    "recommendationState",
  ],
  properties: {
    rank: { type: "integer", minimum: 1 },
    opportunity: {
      type: "object",
      required: ["id", "title", "organization", "category"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        organization: { type: "string" },
        category: { type: "string" },
        opportunityType: { type: "string" },
        summary: { type: "string" },
      },
    },
    matchScore: { type: "number", minimum: 0, maximum: 100 },
    reasoning: { type: "string" },
    missingRequirements: { type: "array", items: { type: "string" } },
    recommendedAction: {
      type: "string",
      enum: ["Apply Now", "Prepare First", "Skip"],
    },
    nextSteps: { type: "array", items: { type: "string" } },
    officialUrl: {
      type: "string",
      format: "uri",
      description:
        "Canonical official provider page that callers must render as a clickable link.",
    },
    applicationUrl: {
      type: ["string", "null"],
      format: "uri",
      description:
        "Direct application route when distinct and verified; null for Explore or supporting records.",
    },
    canonicalUrl: { type: "string", format: "uri" },
    publisherDomain: { type: "string" },
    sourceName: { type: "string" },
    verificationStatus: {
      type: "string",
      enum: [
        "verified",
        "program_directory",
        "inactive_listing",
        "unverified",
      ],
    },
    lastVerifiedAt: { type: ["string", "null"], format: "date-time" },
    deadline: { type: ["string", "null"], format: "date" },
    deadlineStatus: {
      type: "string",
      enum: [
        "exact_future",
        "rolling",
        "recurring",
        "historical_estimate",
        "unclear",
        "requires_confirmation",
        "passed",
        "closed",
      ],
    },
    eligibilitySummary: { type: "string" },
    geographicEligibility: { type: "string" },
    recommendationState: {
      type: "string",
      enum: [
        "apply_now",
        "explore",
        "research_lead",
        "unavailable_or_unverified",
      ],
    },
    eligibilityConcerns: { type: "array", items: { type: "string" } },
  },
};

const structuredProfileSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Confirmed heading name for generated documents." },
    contactEmail: { type: "string", format: "email", description: "Optional user-approved email to include in generated artifacts." },
    contactPhone: { type: "string", minLength: 5, maxLength: 40, description: "Optional user-approved phone number to include in generated artifacts." },
    headline: { type: "string" },
    bio: { type: "string" },
    location: { type: "string" },
    timezone: { type: "string" },
    experienceLevel: {
      type: "string",
      enum: ["student", "beginner", "early-career", "mid-level", "senior", "founder", "creator"],
    },
    skills: { type: "array", items: { type: "string" } },
    interests: { type: "array", items: { type: "string" } },
    goals: { type: "array", items: { type: "string" } },
    education: { type: "array", items: { type: "string" } },
    fieldOfStudy: { type: "string" },
    currentDegreeLevel: { type: "string" },
    targetDegreeLevel: { type: "string" },
    currentInstitution: { type: "string" },
    graduationYear: { type: "string" },
    nationality: { type: "string" },
    countryOfResidence: { type: "string" },
    preferredStudyCountries: {
      type: "array",
      items: { type: "string" },
    },
    intendedStartYear: { type: "string" },
    fundingRequirement: { type: "string" },
    languageTestStatus: { type: "string" },
    workAuthorization: { type: "string" },
    sponsorshipRequired: { type: "boolean" },
    availability: { type: "string" },
    workHistory: { type: "array", items: { type: "string" } },
    projects: { type: "array", items: { type: "string" } },
    research: { type: "array", items: { type: "string" } },
    publications: { type: "array", items: { type: "string" } },
    achievements: { type: "array", items: { type: "string" } },
    awards: { type: "array", items: { type: "string" } },
    volunteerExperience: { type: "array", items: { type: "string" } },
    leadership: { type: "array", items: { type: "string" } },
    certifications: { type: "array", items: { type: "string" } },
    links: { type: "array", items: { type: "string", format: "uri" } },
  },
};

export async function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Trakr Opportunity & Resume Services",
      version: TRAKR_SERVICE_VERSION,
      description:
        "One outcome-first, conversation-first, evidence-first A2MCP endpoint for Opportunity Finding, Resume Benchmarking & Optimization, and Resume Generation. Routing priority is: valid continuation and stage, explicit operation, clear natural-language intent, legacy structured discovery, then an ambiguous cold start. An empty or service-declaration-only request returns HTTP 200 with a machine-readable chooser and never assumes Opportunity Finding. Existing valid legacy recommendation payloads remain compatible.",
    },
    servers: [
      {
        url:
          process.env.TRAKR_SERVICE_URL ??
          process.env.NEXT_PUBLIC_APP_URL ??
          "http://localhost:3000",
      },
    ],
    paths: {
      "/api/a2mcp": {
        get: {
          summary: "Discover Trakr's three A2MCP services and orchestration rules",
          responses: { "200": { description: "A2MCP service metadata" } },
        },
      },
      "/api/a2mcp/recommend": {
        post: {
          summary: "Start or continue a Trakr opportunity or resume workflow",
          description:
            "The same endpoint supports start, discover, benchmark, optimize, and generate_resume. Bootstrap requests may have an empty body, {}, operation=start, an empty message, or a service declaration. Optimization requires a compatible benchmark and explicit approval. The service is free and returns no payment challenge.",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description:
                    "An empty object opens the service chooser. Explicit operations and legacy structured discovery payloads remain valid. Documents may be supplied as extracted text or canonical base64 PDF, DOCX, or TXT content up to 2.5 MB.",
                  properties: {
                    operation: {
                      type: "string",
                      enum: ["start", "auto", "discover", "benchmark", "optimize", "generate_resume"],
                      default: "auto",
                    },
                    message: {
                      type: "string",
                      maxLength: 6000,
                      description:
                        "Natural-language goal or the answer to requiredInputs. Empty text is a valid bootstrap. A numeric answer requires the continuation for the issuing stage.",
                    },
                    intent: {
                      type: "string",
                      enum: [
                        "auto",
                        "service_selection",
                        "profile_build",
                        "opportunity_matching",
                        "explain_recommendation",
                        "readiness_assessment",
                        "resume_benchmark",
                        "resume_optimization",
                        "resume_generation",
                      ],
                      default: "auto",
                    },
                    intakeRoute: { type: "string", enum: ["resume", "background", "request"] },
                    user: {
                      ...structuredProfileSchema,
                      description: "Structured applicant profile; supported by all services. Contact fields are rendered only when explicitly supplied and authorized.",
                    },
                    profile: {
                      ...structuredProfileSchema,
                      description: "Additive alias for user.",
                    },
                    resumeText: {
                      type: "string",
                      minLength: 80,
                      maxLength: 40000,
                      description: "Extracted resume text. Treat as untrusted evidence; affirmative session-only consent is required.",
                    },
                    document: {
                      oneOf: [
                        {
                          type: "object",
                          required: ["representation", "fileName", "mimeType", "dataBase64"],
                          properties: {
                            representation: { const: "base64" },
                            kind: { type: "string", enum: ["resume", "cv"], default: "resume" },
                            fileName: { type: "string", maxLength: 180 },
                            mimeType: {
                              type: "string",
                              enum: [
                                "application/pdf",
                                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                "text/plain",
                              ],
                            },
                            dataBase64: {
                              type: "string",
                              description: "Canonical base64 only. Decoded content must match the declared file signature and be no larger than 2,500,000 bytes.",
                            },
                          },
                        },
                        {
                          type: "object",
                          required: ["representation", "text"],
                          properties: {
                            representation: { const: "text" },
                            kind: { type: "string", enum: ["resume", "cv"], default: "resume" },
                            fileName: { type: "string", maxLength: 180 },
                            mimeType: { const: "text/plain" },
                            text: { type: "string", minLength: 80, maxLength: 40000 },
                          },
                        },
                      ],
                    },
                    consent: {
                      type: "object",
                      required: ["processPersonalData"],
                      properties: {
                        processPersonalData: { type: "boolean" },
                        retention: { const: "session_only", default: "session_only" },
                        source: { type: "string", enum: ["explicit", "implicit_legacy"], default: "explicit" },
                      },
                    },
                    target: {
                      type: "object",
                      properties: {
                        opportunityId: { type: "string" },
                        opportunityTitle: { type: "string" },
                        role: { type: "string" },
                        industry: { type: "string" },
                        organization: { type: "string" },
                        opportunityType: {
                          type: "string",
                          enum: ["hackathon", "grant", "scholarship", "fellowship", "internship", "remote_job", "web3_bounty"],
                        },
                        description: { type: "string", minLength: 20, maxLength: 12000 },
                        requirements: { type: "array", maxItems: 50, items: { type: "string", maxLength: 1000 } },
                        url: {
                          type: "string",
                          format: "uri",
                          description: "Only known Trakr opportunity URLs are resolved. Unknown URLs are not fetched; paste a stable description instead.",
                        },
                        locale: { type: "string" },
                      },
                    },
                    generationPreferences: {
                      type: "object",
                      properties: {
                        documentType: {
                          type: "string",
                          enum: [
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
                        locale: { type: "string" },
                        format: { type: "string", enum: ["plain_text", "markdown", "docx_ready"] },
                        pageLimit: { type: "integer", minimum: 1, maximum: 20 },
                        instructions: { type: "array", maxItems: 12, items: { type: "string" } },
                      },
                    },
                    context: continuationSchema,
                    continuation: {
                      oneOf: [continuationSchema, { type: "string", minLength: 40 }],
                      description: "Additive alias for context. Return the prior opaque continuation unchanged.",
                    },
                    goals: { type: "array", items: { type: "string" } },
                    interests: { type: "array", items: { type: "string" } },
                    filters: { type: "object" },
                    requestId: { type: "string" },
                  },
                },
                examples: {
                  emptyBootstrap: { summary: "Ambiguous cold start", value: {} },
                  explicitBootstrap: { summary: "Explicit cold start", value: { operation: "start" } },
                  serviceDeclaration: {
                    summary: "Legacy Agent 5198 declaration remains ambiguous",
                    value: {
                      message:
                        "I'd like to use the service provided by Agent 5198. Service title: Opportunity Matching API. Service type: A2MCP.",
                    },
                  },
                  directDiscovery: { value: { message: "Find remote AI internships for a student in Nigeria." } },
                  directBenchmark: { value: { operation: "benchmark", resumeText: "Synthetic resume text...", target: { role: "Frontend Intern" }, consent: { processPersonalData: true } } },
                  directGeneration: { value: { operation: "generate_resume", user: { headline: "Student developer" }, target: { role: "Frontend Intern" } } },
                },
              },
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["resume", "consent"],
                  properties: {
                    resume: {
                      type: "string",
                      format: "binary",
                      description:
                        "PDF, DOCX, or TXT file up to 2.5 MB. Trakr parses the file and returns an opaque continuation; callers do not need to base64-encode or resend the document.",
                    },
                    consent: {
                      type: "string",
                      enum: ["true"],
                      description:
                        "Required affirmative session-only processing consent.",
                    },
                    operation: {
                      type: "string",
                      enum: ["discover", "benchmark", "optimize", "generate_resume"],
                      default: "discover",
                    },
                    message: { type: "string", maxLength: 6000 },
                    continuation: {
                      type: "string",
                      minLength: 40,
                      description:
                        "Prior opaque continuation token, returned unchanged.",
                    },
                    filters: {
                      type: "string",
                      description: "Optional JSON-encoded recommendation filters.",
                    },
                    target: {
                      type: "string",
                      description: "Optional JSON-encoded target.",
                    },
                    generationPreferences: {
                      type: "string",
                      description:
                        "Optional JSON-encoded generation preferences.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Conversational state or a completed service result. Bootstrap returns choose_service, status needs_input, all three options, and an opaque continuation. Legacy recommendation fields remain present for compatible clients.",
              headers: {
                "X-Trakr-Version": {
                  required: true,
                  schema: { type: "string" },
                  description:
                    "Deployment contract version returned on every recommendation response.",
                },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: [
                      "service",
                      "version",
                      "requestId",
                      "generatedAt",
                      "provider",
                      "aiStatus",
                      "querySummary",
                      "recommendations",
                      "directOpportunities",
                      "explorePrograms",
                      "supportingResources",
                      "categoryCoverage",
                      "actionPlan",
                      "learningRoadmap",
                      "agentNotes",
                      "callerInstructions",
                    ],
                    properties: {
                      service: { const: "trakr" },
                      version: { type: "string" },
                      requestId: { type: "string" },
                      generatedAt: { type: "string", format: "date-time" },
                      provider: { type: "string" },
                      aiStatus: { type: "string", enum: ["enhanced", "retrying", "degraded", "fallback"] },
                      operation: { type: "string", enum: ["start", "auto", "discover", "benchmark", "optimize", "generate_resume"] },
                      stage: { type: "string" },
                      status: { type: "string", enum: ["needs_input", "in_progress", "completed"] },
                      message: { type: "string" },
                      selectedService: {
                        type: ["string", "null"],
                        enum: [null, "opportunity_finding", "resume_benchmarking_optimization", "resume_generation"],
                      },
                      requiredInputs: { type: "array", items: requiredInputSchema },
                      nextActions: { type: "array", items: { type: "string" } },
                      continuation: continuationSchema,
                      artifacts: { type: "array", items: artifactSchema },
                      querySummary: { type: "object" },
                      recommendations: {
                        type: "array",
                        items: recommendationSchema,
                        description:
                          "Legacy-compatible ranked direct and Explore records. Use the separated collections and recommendationState for rendering.",
                      },
                      directOpportunities: {
                        type: "array",
                        items: recommendationSchema,
                        description:
                          "Verified current direct opportunities only. Every item has officialUrl.",
                      },
                      explorePrograms: {
                        type: "array",
                        items: recommendationSchema,
                        description:
                          "Official directories or recurring programmes that require current-call verification.",
                      },
                      supportingResources: {
                        type: "array",
                        items: recommendationSchema,
                        description:
                          "Learning resources and student benefits that are not application opportunities.",
                      },
                      categoryCoverage: {
                        type: "array",
                        items: {
                          type: "object",
                          required: [
                            "category",
                            "status",
                            "inventoryCandidates",
                            "eligibleCandidates",
                            "selectedResults",
                            "reason",
                          ],
                          properties: {
                            category: { type: "string" },
                            status: {
                              type: "string",
                              enum: [
                                "covered",
                                "limited",
                                "no_qualified_matches",
                                "inventory_gap",
                                "directories_only",
                                "eligibility_unknown",
                              ],
                            },
                            inventoryCandidates: {
                              type: "integer",
                              minimum: 0,
                            },
                            eligibleCandidates: {
                              type: "integer",
                              minimum: 0,
                            },
                            selectedResults: {
                              type: "integer",
                              minimum: 0,
                            },
                            reason: { type: "string" },
                          },
                        },
                      },
                      callerInstructions: {
                        type: "object",
                        required: [
                          "relayMessage",
                          "doNotInferMissingInputs",
                          "sendContinuationUnchanged",
                          "doNotGenerateAProfile",
                          "surfaceOfficialUrls",
                        ],
                        properties: {
                          relayMessage: { const: true },
                          doNotInferMissingInputs: { const: true },
                          sendContinuationUnchanged: { const: true },
                          doNotGenerateAProfile: { const: true },
                          surfaceOfficialUrls: { const: true },
                        },
                      },
                      profileOrigin: {
                        type: "string",
                        enum: [
                          "none",
                          "resume",
                          "user_message",
                          "caller_structured",
                          "continuation",
                          "mixed",
                        ],
                      },
                      profileConfirmed: { type: "boolean" },
                      evidenceSources: {
                        type: "array",
                        items: { type: "string" },
                      },
                      inferredFields: {
                        type: "array",
                        items: { type: "string" },
                      },
                      confirmationRequired: { type: "boolean" },
                      actionPlan: { type: "object" },
                      learningRoadmap: { type: "object" },
                      agentNotes: { type: "array", items: { type: "string" } },
                      conversation: {
                        type: "object",
                        description: "Server-authoritative state. External agents should ask for requiredInputs and submit the user's answer with continuation.",
                        required: ["state", "intent", "service", "operation", "stage", "status", "message", "requiredInputs", "nextActions", "continuation"],
                        properties: {
                          state: { type: "string" },
                          intent: { type: "string" },
                          service: {
                            type: ["string", "null"],
                            enum: [null, "opportunity_finding", "resume_benchmarking_optimization", "resume_generation"],
                          },
                          operation: { type: "string" },
                          stage: { type: "string" },
                          status: { type: "string", enum: ["needs_input", "in_progress", "completed"] },
                          message: { type: "string" },
                          requiredAction: { type: "string" },
                          requiredInputs: { type: "array", items: requiredInputSchema },
                          choices: { type: "array", items: choiceSchema },
                          nextActions: { type: "array", items: { type: "string" } },
                          continuation: continuationSchema,
                          profile: { type: "object" },
                          missingInformation: { type: "array", items: { type: "object" } },
                        },
                      },
                      capabilityResult: {
                        type: "object",
                        description:
                          "Grounded benchmark, evidence-traceable optimization, or claim-linked generated document. Scores are transparent heuristics, not hiring predictions, interview probabilities, or a reproduction of a specific ATS.",
                        properties: {
                          resumeBenchmark: { type: "object" },
                          resumeOptimization: { type: "object" },
                          resumeGeneration: { type: "object" },
                        },
                      },
                    },
                  },
                  examples: {
                    chooser: {
                      value: {
                        requestId: "request_example",
                        operation: "start",
                        stage: "choose_service",
                        status: "needs_input",
                        message:
                          "Choose a service:\n1. Find opportunities\n2. Resume Benchmarking & Optimization\n3. Resume Generation",
                        selectedService: null,
                        requiredInputs: [
                          { id: "service", type: "enum", required: true, prompt: "Choose a service", options: serviceChoices },
                        ],
                        nextActions: ["discover", "benchmark", "generate_resume"],
                        continuation: { token: "opaque-encrypted-token-at-least-forty-characters", expiresAt: "2026-07-21T12:30:00.000Z", sessionVersion: "2" },
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "Malformed JSON, schema-invalid input, unsafe document, invalid continuation, or unsupported content" },
            "409": { description: "Idempotency key reused with different request content" },
            "410": { description: "Expired continuation; start a fresh session" },
            "429": { description: "Rate limit exceeded" },
            "503": { description: "Required session or artifact persistence is unavailable" },
          },
        },
      },
      "/api/artifacts/{id}": {
        get: {
          summary: "Download an authorized generated DOCX or PDF artifact",
          description:
            "Use the complete short-lived downloadUrl returned by optimize or generate_resume. The token is bearer authorization, stored only as a hash, and must not be logged or forwarded. Expired artifacts can be regenerated through their declared operation and trusted session.",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "token", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Attachment-only DOCX or PDF response with no-store headers and X-Artifact-SHA256",
              content: {
                "application/pdf": { schema: { type: "string", format: "binary" } },
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
            "401": { description: "Download token missing" },
            "404": { description: "Artifact not found or token invalid" },
            "410": { description: "Artifact expired" },
          },
        },
      },
      "/api/profile/parse-resume": {
        post: {
          summary: "Parse a PDF, DOCX, or TXT resume before sending extracted text",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["resume", "consent"],
                  properties: {
                    resume: { type: "string", format: "binary" },
                    consent: {
                      type: "string",
                      enum: ["true", "false"],
                      description: "Required explicit session-only resume-processing consent. Only true permits processing.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Parsed resume text and profile draft" },
            "400": { description: "Unsupported, malformed, oversized, or missing resume" },
            "403": { description: "Resume-processing consent absent or not affirmative" },
            "422": { description: "Insufficient readable text" },
          },
        },
      },
      "/api/health": {
        get: {
          summary: "Runtime and persistence readiness",
          responses: { "200": { description: "Database, inventory, and artifact-storage readiness" } },
        },
      },
      "/api/ingest": {
        post: {
          summary: "Refresh approved structured opportunity sources",
          security: [{ ingestApiKey: [] }],
          responses: {
            "200": { description: "Ingestion completed" },
            "401": { description: "Missing or invalid operator key" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ingestApiKey: { type: "apiKey", in: "header", name: "x-ingest-api-key" },
      },
    },
    "x-trakr-orchestration": {
      routingPriority: [
        "valid continuation and current stage",
        "explicit operation",
        "clear natural-language intent",
        "legacy structured discovery request",
        "ambiguous cold start",
      ],
      bootstrap: {
        status: 200,
        stage: "choose_service",
        options: serviceChoices,
      },
      payment: {
        pricing: "free",
        paymentRequired: false,
        needsConfirm: false,
        behavior: "HTTP 200 without PAYMENT-REQUIRED, WWW-Authenticate: Payment, or payment attempt",
      },
    },
  });
}
