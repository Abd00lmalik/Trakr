import type {
  Opportunity,
  OpportunityCategory,
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
  "job",
  "jobs",
  "role",
  "work",
  "remote",
  "apply",
  "here",
  "all",
]);

const categoryIntent: Record<OpportunityCategory, string[]> = {
  hackathon: [
    "hackathon",
    "competition",
    "challenge",
    "ctf",
    "capture the flag",
    "build",
    "prototype",
    "developer",
    "student",
    "web3",
    "ai",
    "machine learning",
    "cybersecurity",
  ],
  grant: [
    "grant",
    "funding",
    "startup",
    "founder",
    "accelerator",
    "creator fund",
    "public goods",
    "research",
    "open source",
  ],
  scholarship: ["scholarship", "student", "university", "education", "learn", "tuition", "bootcamp"],
  fellowship: [
    "fellowship",
    "student",
    "early career",
    "research",
    "open source",
    "developer",
    "ambassador",
    "creator",
    "community",
  ],
  internship: ["internship", "intern", "student", "graduate", "junior", "early career"],
  remote_job: ["remote job", "job", "freelance", "contract", "employment", "developer", "designer"],
  web3_bounty: [
    "bounty",
    "bug bounty",
    "security",
    "ctf",
    "web3",
    "solidity",
    "ethereum",
    "dao",
    "defi",
    "smart contract",
  ],
};

const sourceBaseQuality: Record<string, number> = {
  "Devpost API": 82,
  "RemoteOK API": 62,
  "ETHGlobal": 86,
  "Gitcoin": 84,
  "MLH": 82,
  "Google for Developers": 78,
  "Official curated source": 86,
  "Structured partner feed": 42,
  "Structured job feed": 45,
  "Bounty board feed": 50,
};

const genericTitlePatterns = [
  /^all jobs?$/i,
  /^apply here$/i,
  /^general application$/i,
  /^expression of interest/i,
  /^open application/i,
  /^future opportunities$/i,
];

const seniorSignals = ["senior", "staff", "principal", "lead", "manager", "head of", "director"];
const beginnerSignals = ["student", "intern", "internship", "graduate", "junior", "entry", "fellowship"];

const domainSignals = {
  web3: ["web3", "solidity", "foundry", "hardhat", "ethereum", "defi", "dao", "smart contract", "blockchain"],
  ai: ["ai", "machine learning", "ml", "llm", "llms", "pytorch", "tensorflow", "langchain", "data science"],
  security: ["cybersecurity", "security", "ctf", "ctfs", "linux", "networking", "bug bounty", "vulnerability"],
  creator: ["creator", "content", "video", "community", "ambassador", "short-form", "audience"],
  founder: ["founder", "startup", "fundraising", "pitch", "accelerator", "vc", "business"],
  design: ["design", "designer", "figma", "ui", "ux", "prototyping", "product design"],
};

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

function includesPhrase(values: string[], phrases: string[]) {
  const haystack = normalize(values.join(" "));
  return phrases.some((phrase) => haystack.includes(normalize(phrase)));
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

function opportunityValues(opportunity: Opportunity) {
  return [
    opportunity.title,
    opportunity.organization,
    opportunity.category,
    opportunity.summary,
    opportunity.sourceName,
    opportunity.location,
    ...opportunity.requiredSkills,
    ...opportunity.preferredSkills,
    ...opportunity.eligibility,
    ...opportunity.benefits,
    ...opportunity.tags,
  ];
}

function overlap(profileTokens: Set<string>, candidateValues: string[]) {
  const candidateTokens = tokenize(candidateValues);
  const matches = [...candidateTokens].filter((token) => profileTokens.has(token));
  const denominator = Math.max(Math.min(candidateTokens.size, 18), 1);
  return {
    ratio: Math.min(1, matches.length / denominator),
    matches,
  };
}

function categoryScore(opportunity: Opportunity, request: RecommendationRequest) {
  if (request.filters.categories?.includes(opportunity.category)) {
    return 100;
  }

  const requestedValues = [
    ...(request.user?.interests ?? []),
    ...(request.user?.goals ?? []),
    ...(request.interests ?? []),
    ...(request.goals ?? []),
    request.user?.headline,
    request.user?.bio,
  ].filter(Boolean) as string[];

  if (!requestedValues.length) {
    return 45;
  }

  if (includesPhrase(requestedValues, categoryIntent[opportunity.category])) {
    return 92;
  }

  const requestedTokens = tokenize(requestedValues);
  const categoryTokens = tokenize([opportunity.category, ...categoryIntent[opportunity.category]]);
  const matches = [...categoryTokens].filter((token) => requestedTokens.has(token));
  return matches.length ? 72 : 20;
}

function skillScore(opportunity: Opportunity, request: RecommendationRequest) {
  const profileTokens = tokenize([
    ...profileValues(request.user, request.resumeText),
    ...(request.goals ?? []),
    ...(request.interests ?? []),
  ]);
  const required = overlap(profileTokens, opportunity.requiredSkills);
  const preferred = overlap(profileTokens, opportunity.preferredSkills);
  const tags = overlap(profileTokens, opportunity.tags);
  return {
    score: Math.round(required.ratio * 50 + preferred.ratio * 30 + tags.ratio * 20),
    matches: [
      ...required.matches.map((match) => `Required skill signal: ${match}`),
      ...preferred.matches.map((match) => `Preferred skill signal: ${match}`),
      ...tags.matches.map((match) => `Category/tag signal: ${match}`),
    ],
    missingRequirements: opportunity.requiredSkills.filter((skill) => {
      const skillTokens = tokenize([skill]);
      return ![...skillTokens].some((token) => profileTokens.has(token));
    }),
  };
}

function experienceScore(opportunity: Opportunity, request: RecommendationRequest) {
  const level = request.user?.experienceLevel;
  const values = opportunityValues(opportunity);
  const titleAndSummary = [opportunity.title, opportunity.summary, ...opportunity.tags];
  const isSenior = includesPhrase(titleAndSummary, seniorSignals);
  const isBeginnerFriendly = includesPhrase(values, beginnerSignals);

  if (level === "student" || level === "beginner" || level === "early-career") {
    if (isSenior) {
      return 15;
    }
    if (isBeginnerFriendly || ["hackathon", "scholarship", "fellowship", "internship"].includes(opportunity.category)) {
      return 92;
    }
    return 55;
  }

  if (level === "founder") {
    return ["grant", "hackathon", "web3_bounty"].includes(opportunity.category) ? 88 : 45;
  }

  if (level === "creator") {
    return includesPhrase(values, ["creator", "content", "community", "ambassador", "video", "design"])
      ? 88
      : 35;
  }

  return isSenior ? 72 : 70;
}

function locationScore(opportunity: Opportunity, request: RecommendationRequest) {
  if (request.filters.remote === true && !opportunity.remote) {
    return 15;
  }

  if (opportunity.remote) {
    return 95;
  }

  const requestedLocation = request.filters.location ?? request.user?.location;
  if (!requestedLocation) {
    return 62;
  }

  return normalize(opportunity.location).includes(normalize(requestedLocation)) ? 88 : 30;
}

function deadlineScore(deadline: string | null) {
  if (!deadline) {
    return 58;
  }

  const deadlineMs = Date.parse(`${deadline}T23:59:59Z`);
  const daysLeft = Math.ceil((deadlineMs - Date.now()) / (1000 * 60 * 60 * 24));

  if (Number.isNaN(deadlineMs) || daysLeft < 0) {
    return 0;
  }

  if (daysLeft <= 5) {
    return 56;
  }

  if (daysLeft <= 45) {
    return 92;
  }

  return 78;
}

function qualityScore(opportunity: Opportunity) {
  let score = sourceBaseQuality[opportunity.sourceName] ?? 60;

  if (genericTitlePatterns.some((pattern) => pattern.test(opportunity.title.trim()))) {
    score -= 55;
  }

  if (opportunity.sourceUrl.startsWith("https://")) {
    score += 6;
  }

  if (opportunity.deadline) {
    score += 7;
  } else if (opportunity.category !== "remote_job") {
    score -= 14;
  }

  if (opportunity.summary.length >= 160) {
    score += 8;
  } else if (opportunity.summary.length < 70) {
    score -= 12;
  }

  const metadataCount = [
    opportunity.requiredSkills.length,
    opportunity.preferredSkills.length,
    opportunity.eligibility.length,
    opportunity.benefits.length,
    opportunity.tags.length,
  ].filter((count) => count >= 2).length;
  score += metadataCount * 3;

  if (opportunity.sourceName.includes("Structured")) {
    score -= 18;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function valueScore(opportunity: Opportunity) {
  const values = [...opportunity.benefits, opportunity.summary, ...opportunity.tags];
  let score = 45;

  if (includesPhrase(values, ["paid", "funding", "grant", "prize", "bounty", "scholarship", "stipend"])) {
    score += 25;
  }

  if (includesPhrase(values, ["mentor", "mentorship", "network", "community", "portfolio", "open-source"])) {
    score += 15;
  }

  if (opportunity.difficulty === "low") {
    score += 8;
  } else if (opportunity.difficulty === "high") {
    score -= 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function domainFitScore(opportunity: Opportunity, request: RecommendationRequest) {
  const profile = profileValues(request.user, request.resumeText);
  const candidate = opportunityValues(opportunity);
  const activeDomains = Object.entries(domainSignals)
    .filter(([, signals]) => includesPhrase(profile, signals))
    .map(([domain]) => domain);

  if (!activeDomains.length) {
    return 70;
  }

  const matchedDomains = activeDomains.filter((domain) =>
    includesPhrase(candidate, domainSignals[domain as keyof typeof domainSignals]),
  );

  if (matchedDomains.length) {
    return 94;
  }

  const broadStudentProgram =
    request.user?.experienceLevel === "student" &&
    ["scholarship", "fellowship", "internship"].includes(opportunity.category) &&
    includesPhrase(candidate, ["student", "learning", "education", "developer program"]);

  if (broadStudentProgram) {
    return 58;
  }

  return 18;
}

function decideAction(score: number, missingRequirements: string[], quality: number): RecommendationAction {
  if (quality < 35 || score < 38) {
    return "Skip";
  }

  if (score >= 76 && missingRequirements.length <= 2 && quality >= 55) {
    return "Apply Now";
  }

  return "Prepare First";
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
  const skill = skillScore(opportunity, request);
  const category = categoryScore(opportunity, request);
  const experience = experienceScore(opportunity, request);
  const location = locationScore(opportunity, request);
  const deadline = deadlineScore(opportunity.deadline);
  const quality = qualityScore(opportunity);
  const value = valueScore(opportunity);
  const domain = domainFitScore(opportunity, request);

  const relevance = Math.round(
    category * 0.24 +
      skill.score * 0.24 +
      domain * 0.18 +
      experience * 0.14 +
      location * 0.08 +
      value * 0.08 +
      deadline * 0.04,
  );

  let score = Math.round(relevance * 0.72 + quality * 0.28);

  if (category < 35) {
    score -= 22;
  }

  if (quality < 35) {
    score -= 28;
  }

  if (skill.score < 15 && !["hackathon", "scholarship", "grant"].includes(opportunity.category)) {
    score -= 12;
  }

  if (domain < 30 && category < 80) {
    score -= 18;
  }

  score = Math.max(0, Math.min(100, score));
  const action = decideAction(score, skill.missingRequirements, quality);
  const matchedSignals = [
    ...skill.matches,
    `Category relevance: ${category}/100`,
    `Experience fit: ${experience}/100`,
    `Domain fit: ${domain}/100`,
    `Opportunity quality: ${quality}/100`,
    opportunity.remote ? "Remote-compatible opportunity" : "",
  ].filter(Boolean);

  return {
    opportunity,
    score,
    qualityScore: quality,
    relevanceScore: relevance,
    matchedSignals,
    missingRequirements: skill.missingRequirements,
    action,
  };
}

export function rankOpportunities(
  opportunities: Opportunity[],
  request: RecommendationRequest,
) {
  return opportunities
    .map((opportunity) => scoreOpportunity(opportunity, request))
    .filter((candidate) => candidate.qualityScore >= 40 && candidate.score >= 35)
    .sort((a, b) => {
      const actionWeight = (action: RecommendationAction) =>
        action === "Apply Now" ? 2 : action === "Prepare First" ? 1 : 0;
      return (
        actionWeight(b.action) - actionWeight(a.action) ||
        b.score - a.score ||
        b.qualityScore - a.qualityScore
      );
    });
}
