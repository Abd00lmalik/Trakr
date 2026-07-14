import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  recordAiMetric,
  type AiErrorCategory,
  type AiErrorOrigin,
} from "@/lib/ai/metrics";
import { recommendationResponseSchema } from "@/lib/types/opportunities";
import type { AiProvider, RecommendationNarrativeInput } from "@/lib/ai/provider";
import type { Recommendation, RecommendationResponse } from "@/lib/types/opportunities";

const enhancedRecommendationSchema = z.object({
  id: z.string(),
  reasoning: z.string().min(40).max(1200),
  missingRequirements: z.array(z.string()).max(8),
  recommendedAction: z.enum(["Apply Now", "Prepare First", "Skip"]),
  nextSteps: z.array(z.string().min(8)).min(2).max(5),
});

const enhancementSchema = z.object({
  recommendations: z.array(enhancedRecommendationSchema),
  actionPlan: recommendationResponseSchema.shape.actionPlan,
  learningRoadmap: recommendationResponseSchema.shape.learningRoadmap,
  agentNotes: z.array(z.string().min(8).max(220)).max(6),
});

type Enhancement = z.infer<typeof enhancementSchema>;

type CachedEnhancement = {
  enhancement: Enhancement;
  outputChars: number;
  expiresAt: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const DEFAULT_MODEL = "gemini-3.5-flash";
const DEFAULT_FALLBACK_MODELS = ["gemini-3.1-flash-lite"];
const enhancementCache = new Map<string, CachedEnhancement>();

const enhancementJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          reasoning: { type: "string" },
          missingRequirements: {
            type: "array",
            items: { type: "string" },
            maxItems: 8,
          },
          recommendedAction: {
            type: "string",
            enum: ["Apply Now", "Prepare First", "Skip"],
          },
          nextSteps: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 5,
          },
        },
        required: [
          "id",
          "reasoning",
          "missingRequirements",
          "recommendedAction",
          "nextSteps",
        ],
      },
    },
    actionPlan: {
      type: "object",
      additionalProperties: false,
      properties: {
        immediate: { type: "array", items: { type: "string" } },
        sevenDayPlan: { type: "array", items: { type: "string" } },
        thirtyDayPlan: { type: "array", items: { type: "string" } },
      },
      required: ["immediate", "sevenDayPlan", "thirtyDayPlan"],
    },
    learningRoadmap: {
      type: "object",
      additionalProperties: false,
      properties: {
        focusAreas: { type: "array", items: { type: "string" } },
        resourcesToFind: { type: "array", items: { type: "string" } },
        practiceProjects: { type: "array", items: { type: "string" } },
      },
      required: ["focusAreas", "resourcesToFind", "practiceProjects"],
    },
    agentNotes: {
      type: "array",
      items: { type: "string" },
      maxItems: 6,
    },
  },
  required: ["recommendations", "actionPlan", "learningRoadmap", "agentNotes"],
};

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAbortSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function isRetryableError(error: unknown) {
  if (error instanceof SyntaxError || error instanceof z.ZodError) {
    return true;
  }

  const details = getProviderErrorDetails(error);
  if (details.status) {
    return [408, 409, 429, 500, 502, 503, 504].includes(details.status);
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    /\b429\b/.test(message) ||
    /\b503\b/.test(message) ||
    /\b500\b/.test(message) ||
    message.includes("timeout") ||
    message.includes("overloaded") ||
    message.includes("unavailable") ||
    message.includes("fetch failed") ||
    message.includes("invalid json") ||
    message.includes("invalid structured output")
  );
}

function safeJsonParse(text: string) {
  return JSON.parse(extractJson(text)) as unknown;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getNestedRecord(value: unknown, key: string) {
  const record = getRecord(value);
  return record ? getRecord(record[key]) : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function getProviderErrorDetails(error: unknown) {
  const record = getRecord(error);
  const errorRecord = getNestedRecord(error, "error");
  const headersRecord = getNestedRecord(error, "headers");
  const providerStatus =
    typeof record?.status === "number"
      ? record.status
      : typeof record?.statusCode === "number"
        ? record.statusCode
        : null;
  const providerErrorCode = firstString(
    errorRecord?.status,
    errorRecord?.code,
    record?.code,
    headersRecord?.["x-goog-api-error-code"],
  );
  const message =
    error instanceof Error
      ? error.message
      : firstString(errorRecord?.message, record?.message) ?? String(error);

  return {
    message,
    status: providerStatus,
    code: providerErrorCode,
  };
}

function errorOrigin(error: unknown): AiErrorOrigin {
  if (error instanceof SyntaxError || error instanceof z.ZodError) {
    return "app";
  }

  const details = getProviderErrorDetails(error);
  if (details.status !== null) {
    return "gemini_api";
  }

  const message = details.message.toLowerCase();
  if (message.includes("fetch") || message.includes("network")) {
    return "network";
  }
  if (
    message.includes("invalid structured output") ||
    message.includes("empty gemini response") ||
    message.includes("json")
  ) {
    return "app";
  }

  return "sdk";
}

function errorCategory(error: unknown): AiErrorCategory {
  const details = getProviderErrorDetails(error);
  if (details.status === 400) {
    return "bad_request";
  }
  if (details.status === 401 || details.status === 403) {
    return "auth";
  }
  if (details.status === 408 || details.status === 504) {
    return "timeout";
  }
  if (details.status === 429) {
    return "rate_limit";
  }
  if (details.status && details.status >= 500) {
    return "provider_unavailable";
  }

  const providerCode = details.code?.toLowerCase();
  if (providerCode === "resource_exhausted") {
    return "rate_limit";
  }
  if (providerCode === "unauthenticated" || providerCode === "permission_denied") {
    return "auth";
  }
  if (providerCode === "invalid_argument" || providerCode === "failed_precondition") {
    return "bad_request";
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("abort") || message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  if (/\b429\b/.test(message) || /\bquota\b/.test(message) || /\brate limit(ed|ing)?\b/.test(message)) {
    return "rate_limit";
  }
  if (/\b503\b/.test(message) || /\b500\b/.test(message) || message.includes("unavailable") || message.includes("overloaded")) {
    return "provider_unavailable";
  }
  if (error instanceof SyntaxError || error instanceof z.ZodError || message.includes("json")) {
    return "invalid_output";
  }
  if (message.includes("fetch") || message.includes("network")) {
    return "network";
  }
  return "unknown";
}

function nowMs() {
  return performance.now();
}

function candidateForPrompt(candidate: RecommendationNarrativeInput["scoredOpportunities"][number]) {
  return {
    id: candidate.opportunity.id,
    title: candidate.opportunity.title,
    organization: candidate.opportunity.organization,
    category: candidate.opportunity.category,
    score: candidate.score,
    matchScore: candidate.score,
    preliminaryAction: candidate.action,
    matchedSignals: candidate.matchedSignals.slice(0, 4),
    missingRequirements: candidate.missingRequirements.slice(0, 4),
    requiredSkills: candidate.opportunity.requiredSkills.slice(0, 5),
    preferredSkills: candidate.opportunity.preferredSkills.slice(0, 5),
    eligibility: candidate.opportunity.eligibility.slice(0, 3),
    benefits: candidate.opportunity.benefits.slice(0, 3),
    deadline: candidate.opportunity.deadline,
    summary: candidate.opportunity.summary.slice(0, 240),
  };
}

function buildPrompt(input: RecommendationNarrativeInput) {
  const candidateLimit = Math.min(input.scoredOpportunities.length, 4);
  const compactCandidates = input.scoredOpportunities.slice(0, candidateLimit).map(candidateForPrompt);
  const compactDraft = {
    recommendations: input.draftResponse.recommendations.map((recommendation) => ({
      rank: recommendation.rank,
      id: recommendation.opportunity.id,
      title: recommendation.opportunity.title,
      matchScore: recommendation.matchScore,
      recommendedAction: recommendation.recommendedAction,
    })),
    actionPlan: input.draftResponse.actionPlan,
    learningRoadmap: input.draftResponse.learningRoadmap,
  };

  return [
    "You are Trakr, an AI Opportunity Companion used by other agents through A2MCP.",
    "Return only valid JSON. Do not wrap JSON in markdown.",
    "Enhance only the narrative fields for the already-ranked real opportunities.",
    "Never invent opportunities, URLs, deadlines, organizations, scores, or eligibility requirements.",
    "If an opportunity is weak, explain the concern and use Prepare First or Skip.",
    "Keep reasoning specific and concise: why this, main gap, and next move.",
    "",
    "USER_PROFILE:",
    input.profileText.slice(0, 1200),
    "",
    "RANKED_REAL_CANDIDATES:",
    JSON.stringify(compactCandidates),
    "",
    "CURRENT_RESPONSE_DRAFT:",
    JSON.stringify(compactDraft),
  ].join("\n");
}

function cacheKey(modelName: string, prompt: string) {
  return createHash("sha256").update(modelName).update("\0").update(prompt).digest("hex");
}

function getCachedEnhancement(key: string) {
  const cached = enhancementCache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt < Date.now()) {
    enhancementCache.delete(key);
    return null;
  }

  enhancementCache.delete(key);
  enhancementCache.set(key, cached);
  return cached;
}

function setCachedEnhancement(key: string, enhancement: Enhancement, outputChars: number) {
  enhancementCache.set(key, {
    enhancement,
    outputChars,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  while (enhancementCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = enhancementCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    enhancementCache.delete(oldestKey);
  }
}

function mergeEnhancement(
  draft: RecommendationResponse,
  enhancement: Enhancement,
  providerName: string,
  attempt: number,
) {
  const byId = new Map(enhancement.recommendations.map((item) => [item.id, item]));
  const recommendations: Recommendation[] = draft.recommendations
    .map((recommendation) => {
      const enhanced = byId.get(recommendation.opportunity.id);
      if (!enhanced) {
        return recommendation;
      }

      const recommendedAction =
        recommendation.recommendedAction === "Apply Now" && enhanced.recommendedAction === "Skip"
          ? recommendation.recommendedAction
          : enhanced.recommendedAction;

      return {
        ...recommendation,
        reasoning: enhanced.reasoning,
        missingRequirements: enhanced.missingRequirements,
        recommendedAction,
        nextSteps: enhanced.nextSteps,
      };
    })
    .map((recommendation, index) => ({
      ...recommendation,
      rank: index + 1,
    }));

  return recommendationResponseSchema.parse({
    ...draft,
    provider: providerName,
    aiStatus: "enhanced",
    recommendations,
    actionPlan: enhancement.actionPlan,
    learningRoadmap: enhancement.learningRoadmap,
    agentNotes: [
      "Gemini enhanced the recommendation reasoning from grounded, pre-ranked opportunities.",
      attempt > 1 ? `Gemini enhancement succeeded after ${attempt} attempts.` : "",
      ...enhancement.agentNotes,
    ].filter(Boolean).slice(0, 8),
  });
}

export class GeminiProvider implements AiProvider {
  name: string;
  private modelName: string;
  private fallbackModelNames: string[];
  private client: GoogleGenAI;

  constructor(apiKey: string, modelName = process.env.GEMINI_MODEL ?? DEFAULT_MODEL) {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
    this.fallbackModelNames = (
      process.env.GEMINI_FALLBACK_MODELS?.split(",").map((item) => item.trim()).filter(Boolean) ??
      DEFAULT_FALLBACK_MODELS
    ).filter((fallbackModel) => fallbackModel !== modelName);
    this.name = `gemini:${modelName}`;
  }

  private getModelSequence() {
    return [this.modelName, ...this.fallbackModelNames];
  }

  async enhanceRecommendations(input: RecommendationNarrativeInput) {
    const startedAt = nowMs();
    const buildStartedAt = nowMs();
    const prompt = buildPrompt(input);
    const requestBuildMs = Math.round(nowMs() - buildStartedAt);
    const modelSequence = this.getModelSequence();

    for (const modelName of modelSequence) {
      const key = cacheKey(modelName, prompt);
      const cached = getCachedEnhancement(key);

      if (cached) {
        const totalMs = Math.round(nowMs() - startedAt);
        const providerName = `gemini:${modelName}`;
        recordAiMetric({
          status: "cache_hit",
          provider: providerName,
          model: modelName,
          attempts: 0,
          errorCategory: "none",
          errorOrigin: "none",
          providerStatus: null,
          providerErrorCode: null,
          timings: { requestBuildMs, networkMs: 0, parseMs: 0, totalMs },
          promptChars: prompt.length,
          outputChars: cached.outputChars,
        });
        return mergeEnhancement(input.draftResponse, cached.enhancement, providerName, 1);
      }
    }

    const configuredAttempts = Number.parseInt(process.env.GEMINI_RETRY_ATTEMPTS ?? "2", 10);
    const configuredTimeoutMs = Number.parseInt(process.env.GEMINI_TIMEOUT_MS ?? "8000", 10);
    const attempts = Math.min(Math.max(configuredAttempts, 1), 3);
    const timeoutMs = Math.min(Math.max(configuredTimeoutMs, 1000), 15000);
    const baseDelayMs = Number.parseInt(process.env.GEMINI_RETRY_BASE_DELAY_MS ?? "900", 10);
    let lastError: unknown;
    let networkMs = 0;
    let parseMs = 0;
    let outputChars = 0;
    let lastModelName = this.modelName;

    for (const modelName of modelSequence) {
      lastModelName = modelName;
      const key = cacheKey(modelName, prompt);

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const abort = buildAbortSignal(timeoutMs);
        const networkStartedAt = nowMs();
        let recordedAttemptNetworkMs = false;
        try {
          const result = await this.client.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              abortSignal: abort.signal,
              responseMimeType: "application/json",
              responseJsonSchema: enhancementJsonSchema,
              temperature: 0.35,
              maxOutputTokens: 1600,
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.MINIMAL,
                includeThoughts: false,
              },
            },
          });
          networkMs += Math.round(nowMs() - networkStartedAt);
          recordedAttemptNetworkMs = true;
          if (!result.text) {
            throw new Error("Invalid structured output: empty Gemini response.");
          }
          outputChars = result.text.length;
          const parseStartedAt = nowMs();
          const parsed = enhancementSchema.parse(safeJsonParse(result.text));
          parseMs += Math.round(nowMs() - parseStartedAt);
          setCachedEnhancement(key, parsed, outputChars);
          const providerName = `gemini:${modelName}`;
          recordAiMetric({
            status: "enhanced",
            provider: providerName,
            model: modelName,
            attempts: attempt,
            errorCategory: "none",
            errorOrigin: "none",
            providerStatus: null,
            providerErrorCode: null,
            timings: {
              requestBuildMs,
              networkMs,
              parseMs,
              totalMs: Math.round(nowMs() - startedAt),
            },
            promptChars: prompt.length,
            outputChars,
          });
          return mergeEnhancement(input.draftResponse, parsed, providerName, attempt);
        } catch (error) {
          if (!recordedAttemptNetworkMs) {
            networkMs += Math.round(nowMs() - networkStartedAt);
          }
          lastError = error;
          if (attempt >= attempts || !isRetryableError(error)) {
            break;
          }

          await sleep(baseDelayMs * 2 ** (attempt - 1));
        } finally {
          abort.clear();
        }
      }

      if (errorCategory(lastError) !== "rate_limit") {
        break;
      }
    }

    const providerDetails = getProviderErrorDetails(lastError);
    recordAiMetric({
      status: errorCategory(lastError) === "timeout" ? "timeout" : "error",
      provider: `gemini:${lastModelName}`,
      model: lastModelName,
      attempts,
      errorCategory: errorCategory(lastError),
      errorOrigin: errorOrigin(lastError),
      providerStatus: providerDetails.status,
      providerErrorCode: providerDetails.code,
      timings: {
        requestBuildMs,
        networkMs,
        parseMs,
        totalMs: Math.round(nowMs() - startedAt),
      },
      promptChars: prompt.length,
      outputChars,
    });
    throw lastError instanceof Error ? lastError : new Error("AI enhancement failed.");
  }
}
