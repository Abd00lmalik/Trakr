import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
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

function timeoutPromise<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("AI provider timed out.")), timeoutMs);
  });

  return Promise.race([promise, timeoutResult]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
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

function candidateForPrompt(candidate: RecommendationNarrativeInput["scoredOpportunities"][number]) {
  return {
    id: candidate.opportunity.id,
    title: candidate.opportunity.title,
    organization: candidate.opportunity.organization,
    category: candidate.opportunity.category,
    sourceName: candidate.opportunity.sourceName,
    qualityScore: candidate.qualityScore,
    relevanceScore: candidate.relevanceScore,
    matchScore: candidate.score,
    preliminaryAction: candidate.action,
    matchedSignals: candidate.matchedSignals.slice(0, 8),
    missingRequirements: candidate.missingRequirements.slice(0, 8),
    requiredSkills: candidate.opportunity.requiredSkills,
    preferredSkills: candidate.opportunity.preferredSkills,
    eligibility: candidate.opportunity.eligibility,
    benefits: candidate.opportunity.benefits,
    tags: candidate.opportunity.tags,
    deadline: candidate.opportunity.deadline,
    summary: candidate.opportunity.summary.slice(0, 700),
  };
}

function buildPrompt(input: RecommendationNarrativeInput) {
  const compactCandidates = input.scoredOpportunities.map(candidateForPrompt);
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
    "Every recommendation must answer: why this, why now, what is missing, and what to do next.",
    "Reason like a knowledgeable mentor. Be specific to the user's goals, experience, skills, eligibility, deadline urgency, expected value, learning potential, and career impact.",
    "",
    "Required JSON schema:",
    JSON.stringify(
      {
        recommendations: [
          {
            id: "existing opportunity id",
            reasoning: "specific mentor-style explanation",
            missingRequirements: ["specific gap"],
            recommendedAction: "Apply Now | Prepare First | Skip",
            nextSteps: ["concrete next step"],
          },
        ],
        actionPlan: {
          immediate: ["action"],
          sevenDayPlan: ["action"],
          thirtyDayPlan: ["action"],
        },
        learningRoadmap: {
          focusAreas: ["skill or theme"],
          resourcesToFind: ["resource type"],
          practiceProjects: ["project"],
        },
        agentNotes: ["short professional grounding note"],
      },
      null,
      2,
    ),
    "",
    "USER_PROFILE:",
    input.profileText.slice(0, 6000),
    "",
    "RANKED_REAL_CANDIDATES:",
    JSON.stringify(compactCandidates, null, 2),
    "",
    "CURRENT_RESPONSE_DRAFT:",
    JSON.stringify(compactDraft, null, 2),
  ].join("\n");
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
    const attempts = Number.parseInt(process.env.GEMINI_RETRY_ATTEMPTS ?? "3", 10);
    const timeoutMs = Number.parseInt(process.env.GEMINI_TIMEOUT_MS ?? "45000", 10);
    const baseDelayMs = Number.parseInt(process.env.GEMINI_RETRY_BASE_DELAY_MS ?? "900", 10);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await timeoutPromise(
          this.client.models.generateContent({
            model: this.modelName,
            contents: buildPrompt(input),
            config: {
              responseMimeType: "application/json",
              responseJsonSchema: enhancementJsonSchema,
              temperature: 0.35,
              maxOutputTokens: 6000,
            },
          }),
          timeoutMs,
        );
        if (!result.text) {
          throw new Error("Invalid structured output: empty Gemini response.");
        }
        const parsed = enhancementSchema.parse(safeJsonParse(result.text ?? ""));
        return mergeEnhancement(input.draftResponse, parsed, this.name, attempt);
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || !isRetryableError(error)) {
          break;
        }

        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }

    throw lastError instanceof Error ? lastError : new Error("AI enhancement failed.");
  }
}
