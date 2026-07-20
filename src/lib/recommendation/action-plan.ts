import type { Recommendation, ScoredOpportunity } from "@/lib/types/opportunities";

export function buildRecommendationNarrative(candidate: ScoredOpportunity): string {
  const { opportunity, matchedSignals, missingRequirements, action } = candidate;
  const strengths = matchedSignals.length
    ? matchedSignals.slice(0, 4).join("; ")
    : "The opportunity has topical alignment with the user's goals.";
  const gaps = missingRequirements.length
    ? `Main gaps: ${missingRequirements.slice(0, 3).join(", ")}.`
    : "No major required-skill gaps detected.";
  const actionArticle = action === "Apply Now" ? "an" : "a";

  return `${opportunity.title} is ${actionArticle} ${action} candidate because ${strengths}. Trakr rated source quality at ${candidate.qualityScore}/100 and personal relevance at ${candidate.relevanceScore}/100. ${gaps}`;
}

export function buildNextSteps(candidate: ScoredOpportunity) {
  if (candidate.action === "Apply Now") {
    return [
      "Review the official opportunity page and confirm eligibility.",
      "Tailor the profile, portfolio, or proposal around the strongest matched signals and expected value.",
      "Submit before the deadline and track follow-up requirements.",
    ];
  }

  if (candidate.action === "Prepare First") {
    return [
      `Close the top gaps: ${candidate.missingRequirements.slice(0, 3).join(", ") || "portfolio proof"}.`,
      "Create one small proof-of-work artifact aligned with the opportunity's source and category.",
      "Re-check fit after preparation and apply if the deadline still allows.",
    ];
  }

  return [
    "Do not prioritize this opportunity right now.",
    "Save the source for future monitoring if the category remains relevant.",
    "Focus effort on higher-scoring matches first.",
  ];
}

export function buildActionPlan(recommendations: Recommendation[]) {
  if (!recommendations.length) {
    return {
      immediate: [],
      sevenDayPlan: [],
      thirtyDayPlan: [],
    };
  }

  const applyNow = recommendations.filter((item) => item.recommendedAction === "Apply Now");
  const prepare = recommendations.filter((item) => item.recommendedAction === "Prepare First");

  return {
    immediate: [
      applyNow[0]
        ? `Start the ${applyNow[0].opportunity.title} application first.`
        : "Pick the highest-ranked recommendation and verify eligibility.",
      "Collect portfolio links, resume proof, and one concise statement of fit.",
      "Create a simple tracker with deadline, owner, status, and next action.",
    ],
    sevenDayPlan: [
      prepare[0]
        ? `Spend focused practice time on ${prepare[0].missingRequirements[0] ?? "the highest-value missing requirement"}.`
        : "Refine application materials around the top two opportunity categories.",
      "Ask for one review from a peer, mentor, or community member.",
      "Submit at least one strong application or bounty attempt.",
    ],
    thirtyDayPlan: [
      "Build one reusable proof-of-work project that supports multiple applications.",
      "Add new structured opportunity feeds and refresh recommendations weekly.",
      "Measure outcomes: applications sent, interviews or reviews earned, bounties attempted, and skills closed.",
    ],
  };
}

export function buildLearningRoadmap(recommendations: Recommendation[]) {
  if (!recommendations.length) {
    return {
      focusAreas: [],
      resourcesToFind: [],
      practiceProjects: [],
    };
  }

  const missing = recommendations.flatMap((item) => item.missingRequirements);
  const uniqueMissing = [...new Set(missing)].slice(0, 6);
  const topCategories = [...new Set(recommendations.map((item) => item.opportunity.category))].slice(0, 3);

  return {
    focusAreas: uniqueMissing.length
      ? uniqueMissing
      : ["portfolio storytelling", "application quality", "opportunity research"],
    resourcesToFind: [
      ...uniqueMissing.slice(0, 3).map((skill) => `Practical ${skill} guide with exercises`),
      "Recent winning applications, proposals, or bounty submissions in the target category",
    ],
    practiceProjects: topCategories.map((category) => `Ship a compact proof-of-work project for ${category}.`),
  };
}
