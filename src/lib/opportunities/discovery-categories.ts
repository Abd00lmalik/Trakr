import type {
  CompanionChoice,
  DiscoveryCategory,
  Opportunity,
} from "@/lib/types/opportunities";

type DiscoveryCategoryDefinition = {
  id: DiscoveryCategory;
  number: number;
  label: string;
  description: string;
  aliases: RegExp[];
};

export const discoveryCategoryDefinitions: DiscoveryCategoryDefinition[] = [
  {
    id: "jobs",
    number: 1,
    label: "Jobs",
    description: "Full-time, part-time, contract, and verified remote roles.",
    aliases: [/\bjobs?\b/i, /\bemployment\b/i, /\broles?\b/i],
  },
  {
    id: "internships",
    number: 2,
    label: "Internships",
    description: "Student, graduate, research, and industry internships.",
    aliases: [/\binternships?\b/i, /\bintern roles?\b/i],
  },
  {
    id: "hackathons",
    number: 3,
    label: "Hackathons",
    description: "Verified online and in-person build events.",
    aliases: [/\bhackathons?\b/i],
  },
  {
    id: "scholarships",
    number: 4,
    label: "Scholarships",
    description: "Specific scholarship calls and current funding programs.",
    aliases: [/\bscholarships?\b/i, /\btuition funding\b/i],
  },
  {
    id: "fellowships",
    number: 5,
    label: "Fellowships",
    description: "Professional, academic, research, and public-interest fellowships.",
    aliases: [/\bfellowships?\b/i],
  },
  {
    id: "grants_funding",
    number: 6,
    label: "Grants & Funding",
    description: "Project grants, research funding, and other direct funding calls.",
    aliases: [/\bgrants?\b/i, /\bresearch funding\b/i, /\bproject funding\b/i],
  },
  {
    id: "bounties_freelance",
    number: 7,
    label: "Bounties & Freelance Opportunities",
    description: "Bounties, paid tasks, freelance work, and scoped contract opportunities.",
    aliases: [/\bbount(?:y|ies)\b/i, /\bfreelanc(?:e|ing)\b/i, /\bpaid tasks?\b/i],
  },
  {
    id: "accelerators_incubators",
    number: 8,
    label: "Accelerators & Incubators",
    description: "Startup accelerators, incubators, and venture-building programs.",
    aliases: [/\baccelerators?\b/i, /\bincubators?\b/i],
  },
  {
    id: "creator_opportunities",
    number: 9,
    label: "Creator Opportunities",
    description: "Creator funds, residencies, partnerships, commissions, and programs.",
    aliases: [/\bcreator opportunities\b/i, /\bcreator funds?\b/i, /\bcommissions?\b/i],
  },
  {
    id: "competitions_challenges",
    number: 10,
    label: "Competitions & Challenges",
    description: "Competitions, prizes, challenges, and calls for submissions.",
    aliases: [/\bcompetitions?\b/i, /\bchallenges?\b/i, /\bprizes?\b/i],
  },
];

export function discoveryCategoryChoices(): CompanionChoice[] {
  return discoveryCategoryDefinitions.map(({ id, number, label, description }) => ({
    id,
    value: id,
    number,
    label,
    description,
  }));
}

export function parseDiscoveryCategories(message: string | undefined) {
  const value = message?.trim() ?? "";
  if (!value) return [];

  const selected = new Set<DiscoveryCategory>();
  const numberMatches = value.match(/\b(?:10|[1-9])\b/g) ?? [];
  for (const numberText of numberMatches) {
    const definition = discoveryCategoryDefinitions.find(
      (item) => item.number === Number(numberText),
    );
    if (definition) selected.add(definition.id);
  }

  for (const definition of discoveryCategoryDefinitions) {
    if (definition.aliases.some((pattern) => hasPositiveMatch(value, pattern))) {
      selected.add(definition.id);
    }
  }

  if (
    selected.size === 0 &&
    /\b(remote|onsite|hybrid)\b/i.test(value) &&
    /\b(opportunit(?:y|ies)|work)\b/i.test(value)
  ) {
    selected.add("jobs");
  }

  return discoveryCategoryDefinitions
    .filter((definition) => selected.has(definition.id))
    .map((definition) => definition.id);
}

function hasPositiveMatch(value: string, pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  for (const match of value.matchAll(matcher)) {
    const prefix = value.slice(Math.max(0, (match.index ?? 0) - 64), match.index);
    if (/\bnot only(?:\s+\w+){0,5}\s*$/i.test(prefix)) return true;
    if (
      !/\b(?:no|not|without|excluding?|except|avoid(?:ing)?|do not want|don't want)(?:\s+\w+){0,5}\s*$/i.test(
        prefix,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function discoveryCategoryMatchesOpportunity(
  category: DiscoveryCategory,
  opportunity: Opportunity,
) {
  const types = new Set([
    opportunity.opportunityType,
    ...(opportunity.secondaryTypes ?? []),
  ]);

  switch (category) {
    case "jobs":
      return opportunity.category === "remote_job" || types.has("job");
    case "internships":
      return opportunity.category === "internship" || types.has("internship");
    case "hackathons":
      return opportunity.category === "hackathon" || types.has("hackathon");
    case "scholarships":
      return opportunity.category === "scholarship" || types.has("scholarship");
    case "fellowships":
      return opportunity.category === "fellowship" || types.has("fellowship");
    case "grants_funding":
      return (
        opportunity.category === "grant" ||
        types.has("grant") ||
        types.has("research_funding")
      );
    case "bounties_freelance":
      return opportunity.category === "web3_bounty" || types.has("bounty");
    case "accelerators_incubators":
      return types.has("accelerator") || types.has("incubator");
    case "creator_opportunities":
      return (
        opportunity.tags.some((tag) => /\bcreator|creative|artist|writer|design\b/i.test(tag)) ||
        opportunity.domains?.includes("design") === true
      );
    case "competitions_challenges":
      return types.has("competition");
  }
}

export function discoveryCategoryLabel(category: DiscoveryCategory) {
  return (
    discoveryCategoryDefinitions.find((definition) => definition.id === category)
      ?.label ?? category.replaceAll("_", " ")
  );
}
