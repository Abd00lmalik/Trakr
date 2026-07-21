import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Trakr A2MCP API",
      version: "0.5.0",
      description:
        "Trakr is an outcome-first conversational AI Opportunity Companion. Three visible services share one capability layer behind the stable POST /api/a2mcp/recommend endpoint.",
    },
    servers: [
      {
        url: process.env.TRAKR_SERVICE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      },
    ],
    paths: {
      "/api/a2mcp": {
        get: {
          summary: "Service metadata",
          responses: {
            "200": {
              description: "A2MCP metadata",
            },
          },
        },
      },
      "/api/a2mcp/recommend": {
        post: {
          summary: "Generate opportunity recommendations",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description:
                    "An empty object opens the service chooser. Operation-only requests such as {\"operation\":\"discover\"} are valid. Legacy requests may continue to provide user or resumeText directly.",
                  properties: {
                    user: { type: "object" },
                    profile: {
                      type: "object",
                      description:
                        "Additive alias for user. Existing user requests remain supported.",
                    },
                    resumeText: {
                      type: "string",
                      description:
                        "Resume text. Additive conversational requests must include affirmative consent; legacy direct recommendation payloads remain compatible.",
                    },
                    operation: {
                      type: "string",
                      enum: [
                        "auto",
                        "discover",
                        "benchmark",
                        "optimize",
                        "generate_resume",
                      ],
                      default: "auto",
                    },
                    intakeRoute: {
                      type: "string",
                      enum: ["resume", "background", "request"],
                    },
                    message: {
                      type: "string",
                      description:
                        "Natural-language goal, background, or follow-up question.",
                    },
                    intent: {
                      type: "string",
                      enum: [
                        "auto",
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
                    context: {
                      type: "object",
                      description:
                        "Caller-scoped continuation context returned by a previous response. Trakr does not keep shared in-memory user profiles.",
                    },
                    continuation: {
                      oneOf: [
                        { type: "string", minLength: 40 },
                        {
                          type: "object",
                          properties: {
                            token: { type: "string", minLength: 40 },
                            expiresAt: { type: "string", format: "date-time" },
                            sessionVersion: { const: "2" },
                          },
                          required: ["token", "expiresAt", "sessionVersion"],
                        },
                        { type: "object" },
                      ],
                      description:
                        "Additive alias for context. Send back the opaque, encrypted, short-lived continuation returned by the previous response.",
                    },
                    consent: {
                      type: "object",
                      properties: {
                        processPersonalData: { type: "boolean" },
                        retention: { const: "session_only" },
                        source: {
                          type: "string",
                          enum: ["explicit", "implicit_legacy"],
                        },
                      },
                      required: ["processPersonalData"],
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
                          enum: [
                            "hackathon",
                            "grant",
                            "scholarship",
                            "fellowship",
                            "internship",
                            "remote_job",
                            "web3_bounty",
                          ],
                        },
                        description: {
                          type: "string",
                          maxLength: 12000,
                          description:
                            "Captured target description or dated snapshot text. Unknown URLs are not scraped automatically.",
                        },
                        requirements: {
                          type: "array",
                          maxItems: 50,
                          items: { type: "string", maxLength: 1000 },
                        },
                        url: { type: "string", format: "uri" },
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
                        format: {
                          type: "string",
                          enum: ["plain_text", "markdown", "docx_ready"],
                        },
                        pageLimit: { type: "integer", minimum: 1, maximum: 20 },
                        instructions: {
                          type: "array",
                          maxItems: 12,
                          items: { type: "string" },
                        },
                      },
                    },
                    goals: { type: "array", items: { type: "string" } },
                    interests: { type: "array", items: { type: "string" } },
                    filters: { type: "object" },
                    requestId: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Ranked recommendations with grounded opportunity records, aiStatus, reasoning, gaps, next steps, action plan, and learning roadmap.",
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
                      "actionPlan",
                      "learningRoadmap",
                      "agentNotes",
                    ],
                    properties: {
                      service: { const: "trakr" },
                      version: { type: "string" },
                      requestId: { type: "string" },
                      generatedAt: { type: "string", format: "date-time" },
                      provider: { type: "string" },
                      aiStatus: {
                        type: "string",
                        enum: ["enhanced", "retrying", "degraded", "fallback"],
                      },
                      recommendations: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            rank: { type: "integer" },
                            matchScore: { type: "number", minimum: 0, maximum: 100 },
                            reasoning: { type: "string" },
                            missingRequirements: {
                              type: "array",
                              items: { type: "string" },
                            },
                            recommendedAction: {
                              type: "string",
                              enum: ["Apply Now", "Prepare First", "Skip"],
                            },
                            confidenceScore: {
                              type: "number",
                              minimum: 0,
                              maximum: 100,
                            },
                            guidanceAction: {
                              type: "string",
                              enum: [
                                "apply_now",
                                "prepare_first",
                                "explore",
                                "not_currently_recommended",
                              ],
                            },
                            nextSteps: {
                              type: "array",
                              items: { type: "string" },
                            },
                            opportunity: {
                              type: "object",
                              properties: {
                                verificationStatus: {
                                  type: "string",
                                  enum: [
                                    "verified",
                                    "program_directory",
                                    "inactive_listing",
                                    "unverified",
                                  ],
                                },
                                lastVerifiedAt: {
                                  type: ["string", "null"],
                                  format: "date-time",
                                },
                                lastSeenAt: {
                                  type: ["string", "null"],
                                  format: "date-time",
                                },
                                sourceStatus: {
                                  type: "string",
                                  enum: [
                                    "active",
                                    "redirected",
                                    "blocked",
                                    "unreachable",
                                    "inactive",
                                    "stale",
                                    "unverified",
                                  ],
                                },
                                httpStatus: {
                                  type: ["integer", "null"],
                                },
                                canonicalUrl: {
                                  type: "string",
                                  format: "uri",
                                },
                                publisherDomain: { type: "string" },
                                isActive: { type: "boolean" },
                                verificationConfidence: {
                                  type: "number",
                                  minimum: 0,
                                  maximum: 1,
                                },
                              },
                            },
                          },
                        },
                      },
                      conversation: {
                        type: "object",
                        description:
                          "Additive conversational state for natural-language and follow-up requests.",
                        properties: {
                          state: {
                            type: "string",
                            enum: [
                              "choose_service",
                              "service_pending",
                              "consent_required",
                              "choose_profile_source",
                              "awaiting_resume",
                              "collecting_background",
                              "needs_more_information",
                              "profile_confirmation",
                              "ready_to_recommend",
                              "recommendations",
                              "explanation",
                              "readiness",
                              "resume_benchmark",
                              "resume_optimization",
                              "resume_generation",
                            ],
                          },
                          service: {
                            type: "string",
                            enum: [
                              "opportunity_finding",
                              "resume_benchmarking_optimization",
                              "resume_generation",
                            ],
                          },
                          operation: {
                            type: "string",
                            enum: [
                              "auto",
                              "discover",
                              "benchmark",
                              "optimize",
                              "generate_resume",
                            ],
                          },
                          profileSource: {
                            type: "string",
                            enum: ["resume", "background", "request"],
                            description:
                              "The active Opportunity Finding intake route for this response.",
                          },
                          stage: { type: "string" },
                          message: { type: "string" },
                          profile: { type: "object" },
                          missingInformation: {
                            type: "array",
                            items: { type: "object" },
                          },
                          nextActions: {
                            type: "array",
                            items: { type: "string" },
                          },
                          continuation: { type: "object" },
                          requiredAction: { type: "string" },
                          choices: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                id: { type: "string" },
                                label: { type: "string" },
                                description: { type: "string" },
                              },
                            },
                          },
                        },
                      },
                      capabilityResult: {
                        type: "object",
                        description:
                          "Grounded explanation, readiness, target-specific benchmark, evidence-traceable optimization, or claim-linked generated document. Benchmark scores are transparent heuristics, not hiring predictions or a universal ATS score.",
                        properties: {
                          resumeGeneration: {
                            type: "object",
                            description:
                              "Target-specific generated artifact. Every non-placeholder applicant statement includes supporting evidenceClaimIds; unsupported facts are omitted.",
                            properties: {
                              generationId: { type: "string" },
                              rubricVersion: { type: "string" },
                              documentType: { type: "string" },
                              documentTypeReason: { type: "string" },
                              target: { type: "string" },
                              locale: { type: "string" },
                              format: { type: "string" },
                              pageLimit: {
                                type: "integer",
                                nullable: true,
                                minimum: 1,
                                maximum: 20,
                              },
                              instructions: {
                                type: "array",
                                items: { type: "string" },
                              },
                              title: { type: "string" },
                              sections: { type: "array" },
                              placeholders: {
                                type: "array",
                                items: { type: "string" },
                              },
                              omittedUnsupportedClaims: {
                                type: "array",
                                items: { type: "string" },
                              },
                              followUpQuestions: {
                                type: "array",
                                items: { type: "string" },
                              },
                              verificationChecklist: {
                                type: "array",
                                items: { type: "string" },
                              },
                              factualIntegrity: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Structured validation, session, or request error",
            },
            "409": {
              description: "Idempotency key conflict",
            },
            "410": {
              description: "Expired continuation reference",
            },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/api/profile/parse-resume": {
        post: {
          summary: "Parse PDF, DOCX, or TXT resume into text and a draft profile",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["resume", "consent"],
                  properties: {
                    resume: {
                      type: "string",
                      format: "binary",
                    },
                    consent: {
                      type: "string",
                      enum: ["true", "false"],
                      description:
                        "Required explicit session-only resume-processing consent. Only the value true permits processing.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Parsed resume text and profile draft",
            },
            "400": {
              description: "Unsupported or missing resume",
            },
            "403": {
              description:
                "Resume processing consent is absent or not affirmative",
            },
            "422": {
              description: "Resume contains insufficient readable text",
            },
          },
        },
      },
      "/api/health": {
        get: {
          summary: "Runtime health",
          responses: {
            "200": {
              description: "Health and readiness details",
            },
          },
        },
      },
      "/api/ingest": {
        post: {
          summary: "Refresh structured opportunity sources",
          security: [{ ingestApiKey: [] }],
          responses: {
            "200": {
              description: "Ingestion completed",
            },
            "401": {
              description: "Missing or invalid ingestion key",
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ingestApiKey: {
          type: "apiKey",
          in: "header",
          name: "x-ingest-api-key",
        },
      },
    },
  });
}
