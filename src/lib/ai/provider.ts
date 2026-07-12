import type {
  RecommendationRequest,
  RecommendationResponse,
  ScoredOpportunity,
} from "@/lib/types/opportunities";

export type RecommendationNarrativeInput = {
  request: RecommendationRequest;
  profileText: string;
  scoredOpportunities: ScoredOpportunity[];
  draftResponse: RecommendationResponse;
};

export interface AiProvider {
  name: string;
  enhanceRecommendations(
    input: RecommendationNarrativeInput,
  ): Promise<RecommendationResponse>;
}

export class DeterministicAiProvider implements AiProvider {
  name = "deterministic-local";

  async enhanceRecommendations(input: RecommendationNarrativeInput) {
    return input.draftResponse;
  }
}
