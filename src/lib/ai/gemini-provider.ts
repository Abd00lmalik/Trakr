import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { createHash } from "node:crypto";
import { z } from "zod";
import { recordAiMetric, type AiErrorCategory } from "@/lib/ai/metrics";
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

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("503") ||
    message.includes("500") ||
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

function errorCategory(error: unknown): AiErrorCategory {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("abort") || message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  if (message.includes("429") || message.includes("quota") || message.includes("rate")) {
    return "rate_limit";
  }
  if (message.includes("503") || message.includes("500") || message.includes("unavailable") || message.includes("overloaded")) {
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
    matchedSignals: candidate.matchedSignals.slice(0, 5),
    missingRequirements: candidate.missingRequirements.slice(0, 5),
    requiredSkills: candidate.opportunity.requiredSkills.slice(0, 6),
    preferredSkills: candidate.opportunity.preferredSkills.slice(0, 6),
    eligibility: candidate.opportunity.eligibility.slice(0, 4),
    benefits: candidate.opportunity.benefits.slice(0, 4),
    deadline: candidate.opportunity.deadline,
    summary: candidate.opportunity.summary.slice(0, 320),
  };
}

function buildPrompt(input: RecommendationNarrativeInput) {
  const candidateLimit = Math.min(input.scoredOpportunities.length, 5);
  const compactCandidates = input.scoredOpportunities.slice(0, candidateLimit).map(candidateForPrompt);
  const compactDraft = {
    requestId: input.draftResponse.requestId,
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
    input.profileText.slice(0, 1800),
    "",
    "RANKED_REAL_CANDIDATES:",
    JSON.stringify(compactCandidates, null, 2),
    "",
    "CURRENT_RESPONSE_DRAFT:",
    JSON.stringify(compactDraft, null, 2),
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
  private client: GoogleGenAI;

  constructor(apiKey: string, modelName = process.env.GEMINI_MODEL ?? "gemini-3.5-flash") {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
    this.name = `gemini:${modelName}`;
  }

  async enhanceRecommendations(input: RecommendationNarrativeInput) {
    const startedAt = nowMs();
    const buildStartedAt = nowMs();
    const prompt = buildPrompt(input);
    const requestBuildMs = Math.round(nowMs() - buildStartedAt);
    const key = cacheKey(this.modelName, prompt);
    const cached = getCachedEnhancement(key);

    if (cached) {
      const totalMs = Math.round(nowMs() - startedAt);
      recordAiMetric({
        status: "cache_hit",
        provider: this.name,
        model: this.modelName,
        attempts: 0,
        errorCategory: "none",
        timings: { requestBuildMs, networkMs: 0, parseMs: 0, totalMs },
        promptChars: prompt.length,
        outputChars: cached.outputChars,
      });
      return mergeEnhancement(input.draftResponse, cached.enhancement, this.name, 1);
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

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const abort = buildAbortSignal(timeoutMs);
      try {
        const networkStartedAt = nowMs();
        const result = await this.client.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: {
            abortSignal: abort.signal,
            responseMimeType: "application/json",
            responseJsonSchema: enhancementJsonSchema,
            temperature: 0.35,
            maxOutputTokens: 2200,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.MINIMAL,
              includeThoughts: false,
            },
          },
        });
        networkMs += Math.round(nowMs() - networkStartedAt);
        if (!result.text) {
          throw new Error("Invalid structured output: empty Gemini response.");
        }
        outputChars = result.text.length;
        const parseStartedAt = nowMs();
        const parsed = enhancementSchema.parse(safeJsonParse(result.text));
        parseMs += Math.round(nowMs() - parseStartedAt);
        setCachedEnhancement(key, parsed, outputChars);
        recordAiMetric({
          status: "enhanced",
          provider: this.name,
          model: this.modelName,
          attempts: attempt,
          errorCategory: "none",
          timings: {
            requestBuildMs,
            networkMs,
            parseMs,
            totalMs: Math.round(nowMs() - startedAt),
          },
          promptChars: prompt.length,
          outputChars,
        });
        return mergeEnhancement(input.draftResponse, parsed, this.name, attempt);
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || !isRetryableError(error)) {
          break;
        }

        await sleep(baseDelayMs * 2 ** (attempt - 1));
      } finally {
        abort.clear();
      }
    }

    recordAiMetric({
      status: errorCategory(lastError) === "timeout" ? "timeout" : "error",
      provider: this.name,
      model: this.modelName,
      attempts,
      errorCategory: errorCategory(lastError),
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
