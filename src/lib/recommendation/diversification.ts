import type {
  Opportunity,
  RecommendationRequest,
  ScoredOpportunity,
} from "@/lib/types/opportunities";

const ignoredInterestValues = new Set([
  "opportunities",
  "remote",
  "remote work",
  "jobs",
  "job",
  "internships",
  "internship",
  "hackathons",
  "hackathon",
  "grants",
  "grant",
  "scholarships",
  "scholarship",
  "fellowships",
  "fellowship",
  "bounties",
  "bounty",
]);

const interestFacets: Array<{
  name: string;
  signals: string[];
}> = [
  {
    name: "AI",
    signals: [
      "ai",
      "artificial intelligence",
      "machine learning",
      "ml",
      "llm",
      "data science",
      "pytorch",
      "tensorflow",
    ],
  },
  {
    name: "Web3",
    signals: [
      "web3",
      "blockchain",
      "crypto",
      "solidity",
      "ethereum",
      "defi",
      "smart contract",
    ],
  },
  {
    name: "Climate",
    signals: [
      "climate",
      "climate tech",
      "cleantech",
      "sustainability",
      "renewable energy",
      "carbon",
      "environmental science",
      "environmental policy",
      "environmental sustainability",
    ],
  },
  {
    name: "Fintech",
    signals: [
      "fintech",
      "financial technology",
      "payments",
      "banking",
      "financial services",
      "financial inclusion",
    ],
  },
  {
    name: "Cybersecurity",
    signals: [
      "cybersecurity",
      "security",
      "infosec",
      "ctf",
      "penetration testing",
      "vulnerability",
    ],
  },
  {
    name: "Design",
    signals: [
      "product design",
      "designer",
      "ux",
      "ui",
      "figma",
      "user research",
      "prototyping",
      "design systems",
      "accessibility testing",
    ],
  },
  {
    name: "Research",
    signals: [
      "research",
      "academic",
      "science",
      "scientific",
      "phd",
      "laboratory",
    ],
  },
  {
    name: "Open source",
    signals: ["open source", "oss", "github", "maintainer"],
  },
  {
    name: "Healthcare",
    signals: [
      "healthcare",
      "health tech",
      "healthtech",
      "medical",
      "public health",
    ],
  },
  {
    name: "Startups",
    signals: [
      "startup",
      "founder",
      "entrepreneurship",
      "accelerator",
      "venture",
    ],
  },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesSignal(value: string, signal: string) {
  const normalizedValue = ` ${normalize(value)} `;
  const normalizedSignal = normalize(signal);
  if (normalizedSignal.length <= 3) {
    return normalizedValue.includes(` ${normalizedSignal} `);
  }
  return normalizedValue.includes(normalizedSignal);
}

function opportunityText(opportunity: Opportunity) {
  return [
    opportunity.title,
    opportunity.organization,
    opportunity.summary,
    ...opportunity.requiredSkills,
    ...opportunity.preferredSkills,
    ...opportunity.tags,
    ...opportunity.eligibility,
    ...opportunity.benefits,
  ].join(" ");
}

function canonicalInterest(value: string) {
  const normalized = normalize(value);
  if (!normalized || ignoredInterestValues.has(normalized)) {
    return null;
  }
  const facet = interestFacets.find(({ signals }) =>
    signals.some((signal) => includesSignal(normalized, signal)),
  );
  return facet?.name ?? value.trim();
}

export function extractRequestedInterests(request: RecommendationRequest) {
  const values = [
    ...(request.user?.interests ?? []),
    ...(request.interests ?? []),
  ];
  const seen = new Set<string>();
  const interests: string[] = [];

  for (const value of values) {
    const canonical = canonicalInterest(value);
    if (!canonical) continue;
    const key = normalize(canonical);
    if (seen.has(key)) continue;
    seen.add(key);
    interests.push(canonical);
  }
  return interests.slice(0, 8);
}

export function matchedInterests(
  opportunity: Opportunity,
  requestedInterests: string[],
) {
  const text = opportunityText(opportunity);
  return requestedInterests.filter((interest) => {
    const facet = interestFacets.find(
      (item) => normalize(item.name) === normalize(interest),
    );
    const signals = facet?.signals ?? [interest];
    return signals.some((signal) => includesSignal(text, signal));
  });
}

function deduplicateCandidates(candidates: ScoredOpportunity[]) {
  const seenCanonicalUrls = new Set<string>();
  const seenIdentity = new Set<string>();
  const kept: ScoredOpportunity[] = [];
  let removed = 0;

  for (const candidate of candidates) {
    const canonicalUrl = normalize(candidate.opportunity.canonicalUrl);
    const identity = normalize(
      `${candidate.opportunity.organization} ${candidate.opportunity.title}`,
    );
    if (
      seenCanonicalUrls.has(canonicalUrl) ||
      seenIdentity.has(identity)
    ) {
      removed += 1;
      continue;
    }
    seenCanonicalUrls.add(canonicalUrl);
    seenIdentity.add(identity);
    kept.push(candidate);
  }

  return { candidates: kept, removed };
}

function qualifyingForCoverage(candidate: ScoredOpportunity) {
  return (
    candidate.score >= 45 &&
    candidate.qualityScore >= 45 &&
    candidate.opportunity.isActive &&
    candidate.opportunity.verificationStatus === "verified" &&
    ["active", "redirected"].includes(candidate.opportunity.sourceStatus) &&
    candidate.opportunity.verificationConfidence >= 0.6
  );
}

function actionWeight(candidate: ScoredOpportunity) {
  if (candidate.action === "Apply Now") return 4;
  if (candidate.action === "Prepare First") return 2;
  return 0;
}

function listingConfidenceWeight(candidate: ScoredOpportunity) {
  if (
    candidate.opportunity.verificationStatus === "verified" &&
    candidate.opportunity.isActive
  ) {
    return 10;
  }
  if (candidate.opportunity.verificationStatus === "program_directory") {
    return -12;
  }
  return -6;
}

export function diversifyRankedOpportunities(
  rankedCandidates: ScoredOpportunity[],
  request: RecommendationRequest,
  limit: number,
) {
  const deduplicated = deduplicateCandidates(rankedCandidates);
  const candidates = deduplicated.candidates;
  const requestedInterests = extractRequestedInterests(request);
  const selected: ScoredOpportunity[] = [];
  const selectedIds = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const candidateInterestMatches = new Map(
    candidates.map((candidate) => [
      candidate.opportunity.id,
      matchedInterests(candidate.opportunity, requestedInterests),
    ]),
  );
  const qualifyingCandidateCounts = new Map(
    requestedInterests.map((interest) => [
      interest,
      candidates.filter(
        (candidate) =>
          qualifyingForCoverage(candidate) &&
          (candidateInterestMatches.get(candidate.opportunity.id) ?? []).includes(
            interest,
          ),
      ).length,
    ]),
  );
  const selectedQualifyingCounts = new Map(
    requestedInterests.map((interest) => [interest, 0]),
  );
  const coverageTarget = (interest: string) => {
    const available = qualifyingCandidateCounts.get(interest) ?? 0;
    return Math.min(1, available);
  };

  function add(candidate: ScoredOpportunity) {
    selected.push(candidate);
    selectedIds.add(candidate.opportunity.id);
    if (qualifyingForCoverage(candidate)) {
      for (const interest of candidateInterestMatches.get(
        candidate.opportunity.id,
      ) ?? []) {
        selectedQualifyingCounts.set(
          interest,
          (selectedQualifyingCounts.get(interest) ?? 0) + 1,
        );
      }
    }
    sourceCounts.set(
      candidate.opportunity.sourceName,
      (sourceCounts.get(candidate.opportunity.sourceName) ?? 0) + 1,
    );
    categoryCounts.set(
      candidate.opportunity.category,
      (categoryCounts.get(candidate.opportunity.category) ?? 0) + 1,
    );
  }

  while (
    selected.length < limit &&
    requestedInterests.some(
      (interest) =>
        (selectedQualifyingCounts.get(interest) ?? 0) <
        coverageTarget(interest),
    )
  ) {
    const uncovered = new Set(
      requestedInterests.filter(
        (interest) =>
          (selectedQualifyingCounts.get(interest) ?? 0) <
          coverageTarget(interest),
      ),
    );
    const eligible = candidates.filter((candidate) => {
      if (selectedIds.has(candidate.opportunity.id)) return false;
      if (!qualifyingForCoverage(candidate)) return false;
      return (candidateInterestMatches.get(candidate.opportunity.id) ?? []).some(
        (interest) => uncovered.has(interest),
      );
    });
    if (!eligible.length) break;

    eligible.sort((left, right) => {
      const utility = (candidate: ScoredOpportunity) => {
        const uncoveredGain = (
          candidateInterestMatches.get(candidate.opportunity.id) ?? []
        ).filter((interest) => uncovered.has(interest)).length;
        const newSource =
          sourceCounts.has(candidate.opportunity.sourceName) ? 0 : 5;
        const newCategory =
          categoryCounts.has(candidate.opportunity.category) ? 0 : 3;
        return (
          candidate.score +
          uncoveredGain * 18 +
          newSource +
          newCategory +
          actionWeight(candidate) +
          listingConfidenceWeight(candidate)
        );
      };
      return (
        utility(right) - utility(left) ||
        right.qualityScore - left.qualityScore
      );
    });
    add(eligible[0]);
  }

  while (selected.length < limit) {
    const remaining = candidates.filter(
      (candidate) => !selectedIds.has(candidate.opportunity.id),
    );
    if (!remaining.length) break;
    remaining.sort((left, right) => {
      const utility = (candidate: ScoredOpportunity) => {
        const sourcePenalty =
          (sourceCounts.get(candidate.opportunity.sourceName) ?? 0) * 5;
        const categoryPenalty =
          (categoryCounts.get(candidate.opportunity.category) ?? 0) * 2;
        return (
          candidate.score +
          actionWeight(candidate) -
          sourcePenalty -
          categoryPenalty +
          listingConfidenceWeight(candidate)
        );
      };
      return (
        utility(right) - utility(left) ||
        right.qualityScore - left.qualityScore
      );
    });
    add(remaining[0]);
  }

  const interestCoverage = requestedInterests.map((interest) => {
    const qualifyingCandidateCount =
      qualifyingCandidateCounts.get(interest) ?? 0;
    const resultCount = selected.filter((candidate) =>
      qualifyingForCoverage(candidate) &&
      (candidateInterestMatches.get(candidate.opportunity.id) ?? []).includes(
        interest,
      ),
    ).length;
    const target = coverageTarget(interest);
    const explorationResultCount = selected.filter(
      (candidate) =>
        candidate.opportunity.verificationStatus === "program_directory" &&
        (candidateInterestMatches.get(candidate.opportunity.id) ?? []).includes(
          interest,
        ),
    ).length;
    const status =
      qualifyingCandidateCount === 0
        ? ("no_qualified_matches" as const)
        : resultCount < target || qualifyingCandidateCount === 1
          ? ("limited" as const)
          : ("covered" as const);
    const explanation =
      status === "covered"
        ? `${resultCount} selected result${resultCount === 1 ? "" : "s"} cover this interest from ${qualifyingCandidateCount} qualifying candidate${qualifyingCandidateCount === 1 ? "" : "s"}.`
        : status === "limited"
          ? qualifyingCandidateCount === 1
            ? "Only one candidate met the current relevance, activity, and quality gates."
            : "Qualifying candidates existed, but stronger constraints limited top-result coverage."
          : explorationResultCount
            ? `No verified active listing met the relevance, activity, and quality gates. ${explorationResultCount} selected program director${explorationResultCount === 1 ? "y is" : "ies are"} included only for exploration and must be checked for current openings.`
            : "No verified active listing met the relevance, activity, and quality gates. Trakr did not pad the list with weaker results.";
    return {
      interest,
      status,
      resultCount,
      qualifyingCandidateCount,
      explanation,
    };
  });

  return {
    ranked: selected,
    coverage: {
      requestedInterests,
      interests: interestCoverage,
      sourceCount: new Set(
        selected.map((candidate) => candidate.opportunity.sourceName),
      ).size,
      opportunityTypeCount: new Set(
        selected.map((candidate) => candidate.opportunity.category),
      ).size,
      notes: [
        "Coverage targets are soft: eligibility, active status, and relevance remain hard quality gates.",
        "An opportunity may cover more than one interest when its source data supports that classification.",
        deduplicated.removed
          ? `${deduplicated.removed} canonical or title-and-organization duplicate candidate${deduplicated.removed === 1 ? " was" : "s were"} removed before selection.`
          : "No canonical duplicates were found in the ranked candidate set.",
      ],
    },
  };
}
