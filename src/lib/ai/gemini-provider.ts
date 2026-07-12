import { GoogleGenerativeAI } from "@google/generative-ai";
import { recommendationResponseSchema } from "@/lib/types/opportunities";
import type { AiProvider, RecommendationNarrativeInput } from "@/lib/ai/provider";

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

function buildPrompt(input: RecommendationNarrativeInput) {
  const compactCandidates = input.scoredOpportunities.map((candidate) => ({
    id: candidate.opportunity.id,
    title: candidate.opportunity.title,
    organization: candidate.opportunity.organization,
    category: candidate.opportunity.category,
    score: candidate.score,
    action: candidate.action,
    matchedSignals: candidate.matchedSignals,
    missingRequirements: candidate.missingRequirements,
    requiredSkills: candidate.opportunity.requiredSkills,
    preferredSkills: candidate.opportunity.preferredSkills,
    deadline: candidate.opportunity.deadline,
  }));

  return [
    "You are Trakr, an A2MCP opportunity recommendation service.",
    "Return only valid JSON matching the provided response draft shape.",
    "Improve reasoning, nextSteps, actionPlan, learningRoadmap, and agentNotes.",
    "Do not invent new opportunities, URLs, deadlines, organizations, or scores.",
    "Keep recommendedAction exactly one of: Apply Now, Prepare First, Skip.",
    "Make reasoning specific, concise, and useful to another AI agent.",
    "",
    "PROFILE_TEXT:",
    input.profileText,
    "",
    "SCORED_CANDIDATES:",
    JSON.stringify(compactCandidates, null, 2),
    "",
    "RESPONSE_DRAFT_TO_ENHANCE:",
    JSON.stringify(input.draftResponse, null, 2),
  ].join("\n");
}

export class GeminiProvider implements AiProvider {
  name: string;
  private modelName: string;
  private client: GoogleGenerativeAI;

  constructor(apiKey: string, modelName = "gemini-1.5-flash") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
    this.name = `gemini:${modelName}`;
  }

  async enhanceRecommendations(input: RecommendationNarrativeInput) {
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.25,
      },
    });

    const result = await model.generateContent(buildPrompt(input));
    const text = result.response.text();
    const parsed = JSON.parse(extractJson(text));

    return recommendationResponseSchema.parse({
      ...parsed,
      provider: this.name,
    });
  }
}
