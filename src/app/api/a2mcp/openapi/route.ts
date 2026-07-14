import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Trakr A2MCP API",
      version: "0.1.0",
      description:
        "Trakr recommends relevant opportunities with match scores, reasoning, missing requirements, action guidance, and a learning roadmap.",
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
                  properties: {
                    user: { type: "object" },
                    resumeText: { type: "string" },
                    goals: { type: "array", items: { type: "string" } },
                    interests: { type: "array", items: { type: "string" } },
                    filters: { type: "object" },
                    requestId: { type: "string" },
                  },
                  anyOf: [{ required: ["user"] }, { required: ["resumeText"] }],
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
                            nextSteps: {
                              type: "array",
                              items: { type: "string" },
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
              description: "Structured validation error",
            },
            "429": {
              description: "Rate limit exceeded",
            },
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
                  required: ["resume"],
                  properties: {
                    resume: {
                      type: "string",
                      format: "binary",
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
