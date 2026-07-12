import type {
  Opportunity,
  RecommendationAction,
  RecommendationRequest,
  ScoredOpportunity,
  StructuredUserProfile,
} from "@/lib/types/opportunities";

const stopWords = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "your",
  "you",
  "are",
  "can",
  "will",
  "has",
  "have",
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ");
}

function tokenize(values: string[]) {
  return new Set(
    values
      .flatMap((value) => normalize(value).split(/\s+/))
      .filter((token) => token.length > 2 && !stopWords.has(token)),
  );
}

function profileValues(user?: StructuredUserProfile, resumeText?: string) {
  return [
    user?.headline,
    user?.bio,
    user?.location,
    user?.experienceLevel,
    ...(user?.skills ?? []),
    ...(user?.interests ?? []),
    ...(user?.goals ?? []),
    ...(user?.education ?? []),
    ...(user?.workHistory ?? []),
    resumeText,
  ].filter(Boolean) as string[];
}

function overlapScore(profileTokens: Set<string>, candidateValues: string[], weight: number) {
  const candidateTokens = tokenize(candidateValues);
  const matches = [...candidateTokens].filter((token) => profileTokens.has(token));
  const denominator = Math.max(candidateTokens.size, 1);
  return {
    score: Math.min(weight, (matches.length / denominator) * weight * 2),
    matches,
  };
}

function deadlineScore(deadline: string | null) {
  if (!deadline) {
    return 6;
  }

  const deadlineMs = Date.parse(`${deadline}T23:59:59Z`);
  const daysLeft = Math.ceil((deadlineMs - Date.now()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return -30;
  }

  if (daysLeft <= 7) {
    return 4;
  }

  if (daysLeft <= 30) {
    return 10;
  }

  return 7;
}

function decideAction(score: number, missingRequirements: string[]): RecommendationAction {
  if (score >= 78 && missingRequirements.length <= 1) {
    return "Apply Now";
  }

  if (score >= 45) {
    return "Prepare First";
  }

  return "Skip";
}

export function buildProfileText(request: RecommendationRequest) {
  const user = request.user;
  const structured = user
    ? [
        user.name && `Name: ${user.name}`,
        user.headline && `Headline: ${user.headline}`,
        user.bio && `Bio: ${user.bio}`,
        user.location && `Location: ${user.location}`,
        user.experienceLevel && `Experience level: ${user.experienceLevel}`,
        user.skills.length && `Skills: ${user.skills.join(", ")}`,
        user.interests.length && `Interests: ${user.interests.join(", ")}`,
        user.goals.length && `Goals: ${user.goals.join(", ")}`,
        user.education.length && `Education: ${user.education.join("; ")}`,
        user.workHistory.length && `Work history: ${user.workHistory.join("; ")}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return [structured, request.resumeText, request.goals?.join(", "), request.interests?.join(", ")]
    .filter(Boolean)
    .join("\n\n");
}

export function scoreOpportunity(
  opportunity: Opportunity,
  request: RecommendationRequest,
): ScoredOpportunity {
  const profileTokens = tokenize([
    ...profileValues(request.user, request.resumeText),
    ...(request.goals ?? []),
    ...(request.interests ?? []),
  ]);
  const requestedGoals = request.goals ?? request.user?.goals ?? [];
  const requestedInterests = request.interests ?? request.user?.interests ?? [];
  const opportunityContext = [
    opportunity.title,
    opportunity.summary,
    opportunity.category,
    ...opportunity.tags,
    ...opportunity.benefits,
  ];

  const required = overlapScore(profileTokens, opportunity.requiredSkills, 34);
  const preferred = overlapScore(profileTokens, opportunity.preferredSkills, 18);
  const tags = overlapScore(profileTokens, opportunity.tags, 18);
  const goals = overlapScore(tokenize(requestedGoals), opportunityContext, 10);
  const interests = overlapScore(tokenize(requestedInterests), opportunityContext, 10);
  const locationBoost = opportunity.remote || !request.user?.location ? 4 : 0;
  const rawScore =
    required.score +
    preferred.score +
    tags.score +
    goals.score +
    interests.score +
    locationBoost +
    deadlineScore(opportunity.deadline);

  const missingRequirements = opportunity.requiredSkills.filter((skill) => {
    const skillTokens = tokenize([skill]);
    return ![...skillTokens].some((token) => profileTokens.has(token));
  });

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const matchedSignals = [
    ...required.matches.map((match) => `Required skill signal: ${match}`),
    ...preferred.matches.map((match) => `Preferred skill signal: ${match}`),
    ...tags.matches.map((match) => `Category/tag signal: ${match}`),
    opportunity.remote ? "Remote-friendly opportunity" : "",
  ].filter(Boolean);

  return {
    opportunity,
    score,
    matchedSignals,
    missingRequirements,
    action: decideAction(score, missingRequirements),
  };
}

export function rankOpportunities(
  opportunities: Opportunity[],
  request: RecommendationRequest,
) {
  return opportunities
    .map((opportunity) => scoreOpportunity(opportunity, request))
    .sort((a, b) => b.score - a.score);
}
