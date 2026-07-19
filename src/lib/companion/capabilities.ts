import { buildNextSteps } from "@/lib/recommendation/action-plan";
import type {
  Opportunity,
  OpportunityCompanionRequest,
  ScoredOpportunity,
  StructuredUserProfile,
} from "@/lib/types/opportunities";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ").trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function eligibilityConcerns(opportunity: Opportunity) {
  const concerns = opportunity.eligibility
    .slice(0, 4)
    .map((rule) => `Confirm eligibility: ${rule}`);
  if (opportunity.verificationStatus !== "verified") {
    concerns.unshift("The source is not a verified direct application page.");
  }
  if (!opportunity.isActive) {
    concerns.unshift("The opportunity is not currently active.");
  }
  return concerns;
}

function confidenceScore(
  candidate: ScoredOpportunity,
  completeness: number,
) {
  return Math.round(
    Math.min(
      100,
      candidate.score * 0.55 +
        candidate.qualityScore * 0.25 +
        candidate.opportunity.verificationConfidence * 10 +
        completeness * 0.1,
    ),
  );
}

export function buildOpportunityExplanation(
  candidate: ScoredOpportunity,
  completeness: number,
) {
  return {
    opportunityId: candidate.opportunity.id,
    opportunityTitle: candidate.opportunity.title,
    matchScore: candidate.score,
    confidenceScore: confidenceScore(candidate, completeness),
    whyItMatches: candidate.matchedSignals.slice(0, 6),
    gaps: candidate.missingRequirements.slice(0, 6),
    eligibilityConcerns: eligibilityConcerns(candidate.opportunity),
    recommendedAction: candidate.action,
    nextSteps: buildNextSteps(candidate),
  };
}
function evidenceAssessment(profile: StructuredUserProfile) {
  const results: string[] = [];
  if (profile.workHistory.length) {
    results.push("Work history evidence is present.");
  } else {
    results.push("No work history evidence was provided.");
  }
  if (profile.links.length) {
    results.push("Portfolio or public proof links are present.");
  } else {
    results.push("No portfolio, GitHub, or public proof link was provided.");
  }
  if (profile.education.length) {
    results.push("Education context is present.");
  }
  return results;
}

export function buildReadinessAssessment(
  candidate: ScoredOpportunity,
  profile: StructuredUserProfile,
) {
  const concerns = eligibilityConcerns(candidate.opportunity);
  const evidence = evidenceAssessment(profile);
  const evidencePenalty =
    (profile.workHistory.length ? 0 : 8) + (profile.links.length ? 0 : 8);
  const readinessScore = Math.max(
    0,
    Math.min(
      100,
      candidate.score -
        candidate.missingRequirements.length * 4 -
        evidencePenalty,
    ),
  );
  const readinessLevel =
    readinessScore >= 78
      ? ("ready" as const)
      : readinessScore >= 58
        ? ("nearly_ready" as const)
        : ("needs_preparation" as const);
  const eligibilityStatus =
    !candidate.opportunity.isActive
      ? ("concern" as const)
      : concerns.length
        ? ("needs_confirmation" as const)
        : ("likely_eligible" as const);

  return {
    opportunityId: candidate.opportunity.id,
    opportunityTitle: candidate.opportunity.title,
    readinessScore,
    readinessLevel,
    strengths: candidate.matchedSignals.slice(0, 6),
    gaps: candidate.missingRequirements.slice(0, 6),
    eligibilityStatus,
    eligibilityConcerns: concerns,
    evidenceAssessment: evidence,
    nextActions: [
      ...candidate.missingRequirements
        .slice(0, 3)
        .map((gap) => `Add truthful evidence or close the gap for ${gap}.`),
      profile.links.length
        ? "Lead with the strongest relevant portfolio proof."
        : "Add a portfolio, GitHub, project, or writing sample that proves the strongest claimed skill.",
      "Confirm every eligibility rule on the official source before applying.",
    ],
  };
}

function keywordSet(values: string[]) {
  return [
    ...new Set(
      values
        .flatMap((value) => normalize(value).split(/\s+/))
        .filter((value) => value.length > 2),
    ),
  ];
}

function resumeTarget(
  request: OpportunityCompanionRequest,
  opportunity: Opportunity | null,
) {
  return (
    opportunity?.title ??
    request.target?.role ??
    request.target?.industry ??
    "the selected opportunity"
  );
}

export function buildResumeBenchmark(
  request: OpportunityCompanionRequest,
  profile: StructuredUserProfile,
  opportunity: Opportunity | null,
) {
  const target = resumeTarget(request, opportunity);
  const targetKeywords = opportunity
    ? uniqueStrings([
        ...opportunity.requiredSkills,
        ...opportunity.preferredSkills,
        ...opportunity.tags,
      ])
    : keywordSet([request.target?.role ?? "", request.target?.industry ?? ""]);
  const profileKeywords = keywordSet([
    profile.headline ?? "",
    profile.bio ?? "",
    ...profile.skills,
    ...profile.workHistory,
    ...profile.education,
  ]);
  const matchedKeywords = targetKeywords.filter((keyword) =>
    profileKeywords.some(
      (profileKeyword) =>
        normalize(profileKeyword) === normalize(keyword) ||
        normalize(profileKeyword).includes(normalize(keyword)),
    ),
  );
  const missingKeywords = targetKeywords.filter(
    (keyword) => !matchedKeywords.includes(keyword),
  );
  const evidenceScore =
    (profile.workHistory.length ? 15 : 0) +
    (profile.links.length ? 10 : 0) +
    (profile.education.length ? 5 : 0);
  const coverage = targetKeywords.length
    ? matchedKeywords.length / targetKeywords.length
    : Math.min(profile.skills.length / 5, 1);
  const atsReadinessScore = Math.round(
    Math.min(100, 35 + coverage * 50 + evidenceScore),
  );

  return {
    target,
    atsReadinessScore,
    matchedKeywords: matchedKeywords.slice(0, 12),
    missingKeywords: missingKeywords.slice(0, 12),
    positioningStrengths: [
      profile.headline ? `Clear current positioning: ${profile.headline}.` : "",
      profile.skills.length
        ? `Relevant skills are available to prioritize: ${profile.skills.slice(0, 6).join(", ")}.`
        : "",
      profile.links.length ? "Public proof links can support the application." : "",
    ].filter(Boolean),
    concerns: [
      !profile.workHistory.length
        ? "No verified work-history entries were provided, so experience claims cannot be strengthened yet."
        : "",
      !profile.links.length
        ? "No portfolio or public proof link was provided."
        : "",
      ...missingKeywords.slice(0, 5).map(
        (keyword) =>
          `The target emphasizes ${keyword}; include it only if the user's real experience supports it.`,
      ),
    ].filter(Boolean),
    factualIntegrity:
      "This benchmark uses only supplied profile and resume facts. Missing keywords are gaps to verify, not claims to add automatically.",
  };
}

export function buildResumeOptimization(
  request: OpportunityCompanionRequest,
  profile: StructuredUserProfile,
  opportunity: Opportunity | null,
) {
  const benchmark = buildResumeBenchmark(request, profile, opportunity);
  const target = benchmark.target;
  const skillsOrder = uniqueStrings([
    ...benchmark.matchedKeywords.filter((keyword) =>
      profile.skills.some((skill) =>
        normalize(skill).includes(normalize(keyword)),
      ),
    ),
    ...profile.skills,
  ]);
  const identity =
    profile.headline ??
    (profile.experienceLevel
      ? `${profile.experienceLevel.replace("-", " ")} professional`
      : "Opportunity-seeking professional");
  const domain = uniqueStrings(profile.interests).slice(0, 3).join(", ");
  const professionalSummary = [
    identity,
    skillsOrder.length
      ? `with experience or demonstrated capability in ${skillsOrder.slice(0, 5).join(", ")}`
      : "",
    domain ? `interested in ${domain}` : "",
    `seeking to contribute to ${target}`,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .concat(".");

  return {
    target,
    optimizedHeadline: `${identity} | ${target}`,
    professionalSummary,
    skillsOrder,
    experienceGuidance: profile.workHistory.length
      ? profile.workHistory.map(
          (entry) =>
            `Keep this experience factual, then lead with the most relevant action, evidence, and outcome: ${entry}`,
        )
      : [
          "No experience bullets were generated because no verified work history was provided.",
          "Add genuine projects, coursework, volunteer work, open-source contributions, or employment before requesting bullet rewrites.",
        ],
    keywordsToUse: uniqueStrings([
      ...benchmark.matchedKeywords,
      ...benchmark.missingKeywords.filter((keyword) =>
        profile.skills.some((skill) =>
          normalize(skill).includes(normalize(keyword)),
        ),
      ),
    ]),
    unsupportedClaims: benchmark.missingKeywords.filter(
      (keyword) =>
        !profile.skills.some((skill) =>
          normalize(skill).includes(normalize(keyword)),
        ),
    ),
    factualIntegrity:
      "Use only claims supported by the verified profile, resume, portfolio, or user-confirmed experience. Do not add unsupported jobs, degrees, projects, metrics, certifications, or skills.",
  };
}
