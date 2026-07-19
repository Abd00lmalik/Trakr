import { curatedOfficialOpportunities } from "@/lib/opportunities/data/curated-official-opportunities";
import { staticOpportunities } from "@/lib/opportunities/data/static-opportunities";
import { applyOpportunityFilters } from "@/lib/opportunities/source";
import { rankOpportunities } from "@/lib/recommendation/scoring";
import type {
  Opportunity,
  ScoredOpportunity,
} from "@/lib/types/opportunities";
import type { EvaluationPersona } from "../../../evaluation/personas";

const evaluationDate = new Date("2026-07-16T12:00:00.000Z");

export const evaluationCatalog: Opportunity[] = [
  ...staticOpportunities.map((opportunity) => ({
    ...opportunity,
    verificationStatus: "verified" as const,
    sourceStatus: "active" as const,
    httpStatus: 200,
    lastVerifiedAt: evaluationDate.toISOString(),
    lastSeenAt: evaluationDate.toISOString(),
    isActive: true,
    verificationConfidence: 1,
  })),
  ...curatedOfficialOpportunities,
];

function normalizedOpportunityText(opportunity: Opportunity) {
  return [
    opportunity.title,
    opportunity.organization,
    opportunity.category,
    opportunity.summary,
    ...opportunity.requiredSkills,
    ...opportunity.preferredSkills,
    ...opportunity.tags,
  ]
    .join(" ")
    .toLowerCase();
}

function relevanceGrade(
  opportunity: Opportunity,
  persona: EvaluationPersona,
) {
  if (persona.expected.opportunityIds.includes(opportunity.id)) {
    return 3;
  }

  const categoryMatch = persona.expected.categories.includes(
    opportunity.category,
  );
  const text = normalizedOpportunityText(opportunity);
  const signalMatch = persona.expected.signals.some((signal) =>
    text.includes(signal.toLowerCase()),
  );

  if (categoryMatch && signalMatch) {
    return 2;
  }

  return categoryMatch || signalMatch ? 1 : 0;
}

function precisionAt(grades: number[], k: number) {
  const results = grades.slice(0, k);
  return results.length
    ? results.filter((grade) => grade > 0).length / results.length
    : 1;
}

function discountedCumulativeGain(grades: number[]) {
  return grades.reduce(
    (total, grade, index) =>
      total + (2 ** grade - 1) / Math.log2(index + 2),
    0,
  );
}

function ndcgAt(
  grades: number[],
  idealGrades: number[],
  k: number,
) {
  const ideal = discountedCumulativeGain(idealGrades.slice(0, k));
  return ideal
    ? discountedCumulativeGain(grades.slice(0, k)) / ideal
    : 1;
}

function unsafeApplyNow(candidate: ScoredOpportunity) {
  return (
    candidate.action === "Apply Now" &&
    (candidate.opportunity.verificationStatus !== "verified" ||
      !candidate.opportunity.isActive)
  );
}

export type PersonaEvaluation = {
  id: string;
  archetype: string;
  precisionAt3: number;
  precisionAt5: number;
  ndcgAt5: number;
  recall: number;
  irrelevantResultRate: number;
  falseApplyNowRate: number;
  topResults: Array<{
    id: string;
    title: string;
    score: number;
    action: ScoredOpportunity["action"];
    relevanceGrade: number;
  }>;
};

export type RankingEvaluationReport = {
  generatedAt: string;
  evaluationDate: string;
  personaCount: number;
  catalogSize: number;
  metrics: {
    precisionAt3: number;
    precisionAt5: number;
    ndcgAt5: number;
    recall: number;
    irrelevantResultRate: number;
    falseApplyNowRate: number;
  };
  weakPersonas: PersonaEvaluation[];
  personas: PersonaEvaluation[];
};

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function evaluateRanking(
  personas: EvaluationPersona[],
): RankingEvaluationReport {
  const results = personas.map((persona): PersonaEvaluation => {
    const filtered = applyOpportunityFilters(
      evaluationCatalog,
      persona.request.filters,
    );
    const allRanked = rankOpportunities(
      filtered,
      persona.request,
      { now: evaluationDate },
    );
    const ranked = allRanked.slice(0, 5);
    const grades = ranked.map((candidate) =>
      relevanceGrade(candidate.opportunity, persona),
    );
    const idealGrades = allRanked
      .map((candidate) => relevanceGrade(candidate.opportunity, persona))
      .sort((a, b) => b - a);
    const relevantCatalogCount = idealGrades.filter((grade) => grade > 0).length;
    const relevantReturned = grades.filter((grade) => grade > 0).length;
    const applyNow = ranked.filter(
      (candidate) => candidate.action === "Apply Now",
    );
    const falseApplyNow = applyNow.filter(unsafeApplyNow).length;

    return {
      id: persona.id,
      archetype: persona.archetype,
      precisionAt3: precisionAt(grades, 3),
      precisionAt5: precisionAt(grades, 5),
      ndcgAt5: ndcgAt(grades, idealGrades, 5),
      recall: relevantCatalogCount
        ? relevantReturned / relevantCatalogCount
        : 1,
      irrelevantResultRate:
        grades.filter((grade) => grade === 0).length / Math.max(grades.length, 1),
      falseApplyNowRate: applyNow.length
        ? falseApplyNow / applyNow.length
        : 0,
      topResults: ranked.map((candidate, index) => ({
        id: candidate.opportunity.id,
        title: candidate.opportunity.title,
        score: candidate.score,
        action: candidate.action,
        relevanceGrade: grades[index],
      })),
    };
  });

  const weakPersonas = results
    .filter(
      (result) =>
        result.precisionAt3 < 0.8 ||
        result.ndcgAt5 < 0.75 ||
        result.irrelevantResultRate > 0.1 ||
        result.falseApplyNowRate > 0,
    )
    .sort(
      (a, b) =>
        a.ndcgAt5 - b.ndcgAt5 ||
        a.precisionAt3 - b.precisionAt3,
    );

  return {
    generatedAt: new Date().toISOString(),
    evaluationDate: evaluationDate.toISOString(),
    personaCount: personas.length,
    catalogSize: evaluationCatalog.length,
    metrics: {
      precisionAt3: average(results.map((result) => result.precisionAt3)),
      precisionAt5: average(results.map((result) => result.precisionAt5)),
      ndcgAt5: average(results.map((result) => result.ndcgAt5)),
      recall: average(results.map((result) => result.recall)),
      irrelevantResultRate: average(
        results.map((result) => result.irrelevantResultRate),
      ),
      falseApplyNowRate: average(
        results.map((result) => result.falseApplyNowRate),
      ),
    },
    weakPersonas,
    personas: results,
  };
}
