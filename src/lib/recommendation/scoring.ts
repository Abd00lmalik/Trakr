import type {
  Opportunity,
  OpportunityCategory,
  RecommendationAction,
  RecommendationRequest,
  ScoredOpportunity,
  StructuredUserProfile,
} from "@/lib/types/opportunities";
import { canApplyNow } from "@/lib/opportunities/verification";

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
  scholarship: ["scholarship", "tuition funding", "study funding", "financial award"],
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
  learning_resource: ["learning resource", "training", "course", "education"],
  student_benefit: ["student benefit", "student tools", "developer pack"],
  developer_program: ["developer program", "developer community", "training"],
  official_directory: ["directory", "catalogue", "program list", "job board"],
  research_lead: ["research lead", "research organization", "potential funder"],
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
  /^open position\b/i,
  /^create your own role$/i,
  /^future opportunities$/i,
];

const seniorSignals = ["senior", "staff", "principal", "lead", "manager", "head of", "director"];
const beginnerSignals = ["student", "intern", "internship", "graduate", "junior", "entry", "fellowship"];

const domainSignals = {
  web3: ["web3", "solidity", "foundry", "hardhat", "ethereum", "defi", "dao", "smart contract", "blockchain"],
  ai: ["ai", "machine learning", "ml", "llm", "llms", "pytorch", "tensorflow", "langchain", "data science"],
  security: ["cybersecurity", "security", "ctf", "ctfs", "linux", "networking", "bug bounty", "vulnerability"],
  creator: ["creator", "content creator", "video creator", "ambassador", "short-form", "audience growth", "creator economy"],
  founder: ["founder", "co-founder", "startup", "fundraising", "pitching", "accelerator", "venture capital"],
  design: [
    "designer",
    "figma",
    "ui",
    "ux",
    "prototyping",
    "product design",
    "user research",
    "design systems",
    "accessibility testing",
  ],
  climate: [
    "climate",
    "climate tech",
    "cleantech",
    "sustainability",
    "renewable energy",
    "carbon",
    "environmental",
  ],
  fintech: [
    "fintech",
    "financial technology",
    "payments",
    "banking",
    "financial services",
    "financial inclusion",
  ],
};

const roleFamilies = {
  software: [
    "frontend",
    "front-end",
    "backend",
    "back-end",
    "full stack",
    "full-stack",
    "software developer",
    "software engineer",
    "web developer",
    "mobile developer",
    "developer",
    "software",
    "programmer",
    "engineer",
    "devops",
    "site reliability",
    "cloud engineer",
    "qa engineer",
    "test engineer",
    "react",
    "typescript",
    "javascript",
    "node.js",
  ],
  ai_data: [
    "artificial intelligence",
    "machine learning",
    "ai engineer",
    "ml engineer",
    "data scientist",
    "data engineer",
    "data analyst",
    "python",
    "pytorch",
    "tensorflow",
  ],
  web3: [
    "web3",
    "blockchain",
    "solidity",
    "smart contract",
    "ethereum",
    "defi",
  ],
  security: [
    "cybersecurity",
    "security engineer",
    "security analyst",
    "penetration testing",
    "bug bounty",
    "vulnerability",
  ],
  design: [
    "product designer",
    "graphic designer",
    "ux designer",
    "ui designer",
    "figma",
    "user experience",
    "user interface",
  ],
  interior_design: [
    "interior designer",
    "interior design",
    "designer de interiores",
    "design de interiores",
    "space planning",
  ],
  product: [
    "product manager",
    "product management",
    "product owner",
    "product operations",
  ],
  research: [
    "researcher",
    "research associate",
    "research scientist",
    "research engineer",
    "research fellow",
    "scientist",
    "academic research",
    "laboratory",
    "phd",
  ],
  legal: [
    "legal counsel",
    "counsel",
    "attorney",
    "lawyer",
    "legal operations",
    "compliance officer",
  ],
  finance: [
    "accountant",
    "accounting",
    "financial analyst",
    "finance analyst",
    "finance manager",
    "controller",
    "tax lead",
    "treasury analyst",
  ],
  policy: [
    "policy analyst",
    "public policy",
    "government affairs",
    "regulatory policy",
    "policy researcher",
  ],
  people_hr: [
    "recruiter",
    "recruiting",
    "talent acquisition",
    "human resources",
    "people partner",
    "people operations",
  ],
  founder: [
    "founder",
    "co-founder",
    "founder in residence",
    "founder residence",
  ],
  marketing_content: [
    "content creator",
    "creador de contenido",
    "criador de conteúdo",
    "content marketing",
    "digital marketing",
    "social media",
    "instagram",
    "marketing assistant",
    "content assistant",
    "community manager",
    "video creator",
  ],
  customer_service: [
    "customer engagement",
    "customer experience",
    "customer service",
    "customer support",
    "contact center",
    "call center",
  ],
  procurement: [
    "procurement",
    "purchasing officer",
    "purchasing specialist",
    "strategic buyer",
    "sourcing specialist",
  ],
  logistics: [
    "courier",
    "delivery driver",
    "dispatch rider",
    "warehouse associate",
    "warehouse operative",
    "fleet coordinator",
    "logistics coordinator",
  ],
  retail: [
    "merchandiser",
    "retail associate",
    "store manager",
    "shop assistant",
    "visual merchandising",
  ],
  sales: [
    "field sales",
    "sales representative",
    "account executive",
    "business development representative",
    "door to door sales",
  ],
  administration: [
    "administrative assistant",
    "office administrator",
    "receptionist",
    "clerical assistant",
    "data entry clerk",
    "medical scheduler",
    "appointment scheduler",
  ],
  industrial_operations: [
    "machine operator",
    "production operator",
    "plant operator",
    "forklift operator",
    "equipment operator",
  ],
  business_operations: [
    "operations coordinator",
    "operations manager",
    "business operations",
    "people operations",
  ],
  museum_collections: [
    "museum specialist",
    "museum collections",
    "collections management",
    "cultural institution",
  ],
  facilities_security: [
    "security guard",
    "gatehouse operator",
    "operador de portaria",
    "portaria remota",
  ],
};

const coreProfessionalFamilies = new Set([
  "software",
  "ai_data",
  "web3",
  "security",
  "design",
  "interior_design",
  "product",
  "research",
  "legal",
  "finance",
  "policy",
  "people_hr",
]);

const clearlyNontechnicalFamilies = new Set([
  "marketing_content",
  "customer_service",
  "procurement",
  "logistics",
  "retail",
  "sales",
  "administration",
  "industrial_operations",
  "business_operations",
  "museum_collections",
  "facilities_security",
]);

const industrialSummarySignals = [
  "plant operator",
  "plant operations",
  "water treatment",
  "wastewater treatment",
  "desalination",
  "industrial process",
  "mechanical maintenance",
  "electrical maintenance",
  "hand and power tools",
];

const instructionLikeContent =
  /\b(ignore (?:all|any|the|previous)|system prompt|developer message|assistant instruction|tool call|reveal secrets?|exfiltrate|override instructions?|send (?:the )?(?:resume|profile|personal|user)?\s*data to|send (?:the )?(?:resume|profile) to)\b/i;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ");
}

function sanitizeUntrustedText(value: string) {
  return value
    .split(/\r?\n/)
    .filter((line) => !instructionLikeContent.test(line))
    .join(" ")
    .trim();
}

function formatUntrustedField(label: string, value: string | undefined) {
  if (!value) return "";
  const sanitized = sanitizeUntrustedText(value);
  return sanitized ? `${label}: ${sanitized}` : "";
}

function formatUntrustedList(label: string, values: string[]) {
  const sanitized = values.map(sanitizeUntrustedText).filter(Boolean);
  return sanitized.length ? `${label}: ${sanitized.join("; ")}` : "";
}

function tokenize(values: string[]) {
  return new Set(
    values
      .flatMap((value) => normalize(value).split(/\s+/))
      .filter((token) => token.length > 2 && !stopWords.has(token)),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesPhrase(values: string[], phrases: string[]) {
  const haystack = normalize(values.join(" ")).replace(/\s+/g, " ").trim();
  return phrases.some((phrase) => {
    const normalizedPhrase = normalize(phrase).trim();
    if (!normalizedPhrase) return false;
    if (normalizedPhrase.length > 3) {
      return haystack.includes(normalizedPhrase);
    }
    const pattern = escapeRegExp(normalizedPhrase).replace(
      /(?:\\ |\\-|\s|-)+/g,
      "[\\s-]+",
    );
    return new RegExp(
      `(^|[^a-z0-9+#.])${pattern}(?=$|[^a-z0-9+#.])`,
      "i",
    ).test(haystack);
  });
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
    ...(user?.projects ?? []),
    ...(user?.certifications ?? []),
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

function opportunityDomainValues(opportunity: Opportunity) {
  return [
    opportunity.title,
    opportunity.organization,
    opportunity.summary,
    ...opportunity.requiredSkills,
    ...opportunity.preferredSkills,
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
  const requestedTypes = new Set<string>(
    (request.filters.categories ?? []).map((category) =>
      category === "remote_job"
        ? "job"
        : category === "web3_bounty"
          ? "bounty"
          : category,
    ),
  );
  if (
    request.filters.categories?.includes(opportunity.category) ||
    opportunity.secondaryTypes?.some((type) => requestedTypes.has(type))
  ) {
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
  const secondaryCategorySignals = (opportunity.secondaryTypes ?? []).flatMap(
    (type) => {
      const category =
        type === "job"
          ? "remote_job"
          : type === "bounty"
            ? "web3_bounty"
            : type;
      return category in categoryIntent
        ? categoryIntent[category as OpportunityCategory]
        : [];
    },
  );
  if (
    secondaryCategorySignals.length &&
    includesPhrase(requestedValues, secondaryCategorySignals)
  ) {
    return 90;
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
    requiredMatchCount: required.matches.length,
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

function explicitlyRequestsJuniorScope(request: RecommendationRequest) {
  const values = [
    request.user?.bio,
    ...(request.user?.goals ?? []),
    ...(request.goals ?? []),
    request.resumeText,
  ].filter((value): value is string => Boolean(value));

  return includesPhrase(values, [
    "junior",
    "entry-level",
    "entry level",
    "early-career",
    "early career",
    "graduate role",
  ]);
}

function experienceScore(opportunity: Opportunity, request: RecommendationRequest) {
  const level = request.user?.experienceLevel;
  const values = opportunityValues(opportunity);
  const titleAndSummary = [opportunity.title, opportunity.summary, ...opportunity.tags];
  const isSenior = includesPhrase(titleAndSummary, seniorSignals);
  const isBeginnerFriendly = includesPhrase(values, beginnerSignals);

  if (
    level === "student" ||
    level === "beginner" ||
    level === "early-career" ||
    explicitlyRequestsJuniorScope(request)
  ) {
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

type RankingOptions = {
  now?: Date;
};

const locationEligibilityRules: Array<{
  pattern: RegExp;
  allowedLocations: RegExp;
  label: string;
}> = [
  {
    pattern:
      /\b(?:united states|u\.s\.|us)[ -]?(?:only|based|residents?|citizens?)\b|\bmust (?:be|reside) in (?:the )?(?:united states|u\.s\.|us)\b/i,
    allowedLocations: /\b(united states|usa|u\.s\.|america)\b/i,
    label: "United States-only eligibility",
  },
  {
    pattern:
      /\b(?:united kingdom|u\.k\.|uk)[ -]?(?:only|based|residents?|citizens?)\b|\bmust (?:be|reside) in (?:the )?(?:united kingdom|u\.k\.|uk)\b/i,
    allowedLocations: /\b(united kingdom|uk|england|scotland|wales)\b/i,
    label: "United Kingdom-only eligibility",
  },
  {
    pattern:
      /\b(?:canada|canadian)[ -]?(?:only|based|residents?|citizens?)\b|\bmust (?:be|reside) in canada\b/i,
    allowedLocations: /\bcanada\b/i,
    label: "Canada-only eligibility",
  },
  {
    pattern:
      /\b(?:europe|european union|eu)[ -]?(?:only|based|residents?)\b|\bmust (?:be|reside) in (?:europe|the european union|the eu)\b/i,
    allowedLocations:
      /\b(europe|european union|eu|ireland|france|germany|spain|italy|netherlands|belgium|portugal|poland|sweden|finland|denmark|norway|austria|switzerland)\b/i,
    label: "Europe-only eligibility",
  },
];

function deadlineScore(deadline: string | null, now = new Date()) {
  if (!deadline) {
    return 58;
  }

  const deadlineMs = Date.parse(`${deadline}T23:59:59Z`);
  const daysLeft = Math.ceil(
    (deadlineMs - now.getTime()) / (1000 * 60 * 60 * 24),
  );

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

const africanLocations =
  /\b(africa|algeria|angola|benin|botswana|burkina faso|burundi|cabo verde|cameroon|central african republic|chad|comoros|congo|cote d ivoire|djibouti|egypt|equatorial guinea|eritrea|eswatini|ethiopia|gabon|gambia|ghana|guinea|guinea bissau|kenya|lesotho|liberia|libya|madagascar|malawi|mali|mauritania|mauritius|morocco|mozambique|namibia|niger|nigeria|rwanda|sao tome|senegal|seychelles|sierra leone|somalia|south africa|south sudan|sudan|tanzania|togo|tunisia|uganda|zambia|zimbabwe)\b/i;

const europeanLocations =
  /\b(europe|european union|eu|albania|andorra|austria|belarus|belgium|bosnia|bulgaria|croatia|cyprus|czech|denmark|estonia|finland|france|germany|greece|hungary|iceland|ireland|italy|kosovo|latvia|liechtenstein|lithuania|luxembourg|malta|moldova|monaco|montenegro|netherlands|north macedonia|norway|poland|portugal|romania|san marino|serbia|slovakia|slovenia|spain|sweden|switzerland|ukraine|united kingdom|uk)\b/i;

function matchesPublishedLocation(userLocation: string, published: string) {
  const user = normalize(userLocation);
  const eligible = normalize(published);
  const regionListed = (region: string) =>
    new RegExp(
      `(?:^|[;|(])\\s*(?:remote\\s*)?\\(?${region}(?:\\b|[,;|)])`,
      "i",
    ).test(published);
  if (
    /\b(worldwide|global|anywhere)\b/.test(eligible) ||
    eligible === "remote"
  ) {
    return true;
  }
  if (/\bnon us\b/.test(eligible) && !/\b(united states|usa|u s)\b/.test(user)) {
    return true;
  }
  if (regionListed("africa") && africanLocations.test(userLocation)) {
    return true;
  }
  if (regionListed("europe") && europeanLocations.test(userLocation)) {
    return true;
  }

  const segments = published
    .split(/[;|]/)
    .map((segment) =>
      normalize(segment)
        .replace(/\b(remote|hybrid|on site)\b/g, " ")
        .trim(),
    )
    .filter((segment) => segment.length >= 3);
  return segments.some(
    (segment) => user.includes(segment) || segment.includes(user),
  );
}

function publishedLocationMismatch(
  opportunity: Opportunity,
  userLocation: string,
) {
  const marker = opportunity.eligibility.find((item) =>
    item.startsWith("Published eligible locations:"),
  );
  if (!marker) return false;
  const published = marker.slice("Published eligible locations:".length).trim();
  return published.length > 0 && !matchesPublishedLocation(userLocation, published);
}

function qualityScore(opportunity: Opportunity) {
  let score =
    sourceBaseQuality[opportunity.sourceName] ??
    (opportunity.sourceName.startsWith("Greenhouse:") ||
    opportunity.sourceName.startsWith("Ashby:")
      ? 82
      : 60);

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

function hasGenericTitle(opportunity: Opportunity) {
  const title = opportunity.title.trim();
  return (
    normalize(title).replace(/\s+/g, "").length <= 3 ||
    genericTitlePatterns.some((pattern) => pattern.test(title))
  );
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

function domainFitAssessment(
  opportunity: Opportunity,
  request: RecommendationRequest,
) {
  const profile = profileValues(request.user, request.resumeText);
  const candidate = opportunityDomainValues(opportunity);
  const targetValues = [
    ...(request.user?.goals ?? []),
    ...(request.goals ?? []),
  ];
  const requestedDomains = Object.entries(domainSignals)
    .filter(([, signals]) => includesPhrase(targetValues, signals))
    .map(([domain]) => domain);
  const targetSectorDomains = requestedDomains.filter((domain) =>
    ["ai", "web3", "security", "creator", "founder", "climate", "fintech"].includes(
      domain,
    ),
  );
  const activeDomains = Object.entries(domainSignals)
    .filter(([, signals]) => includesPhrase(profile, signals))
    .map(([domain]) => domain);

  if (!activeDomains.length) {
    return {
      score: 70,
      hasMatchedDomain: false,
      requestedDomainMismatch: false,
    };
  }

  const matchedDomains = activeDomains.filter((domain) =>
    includesPhrase(candidate, domainSignals[domain as keyof typeof domainSignals]),
  );
  const matchedRequestedDomains = targetSectorDomains.filter((domain) =>
    includesPhrase(candidate, domainSignals[domain as keyof typeof domainSignals]),
  );

  if (targetSectorDomains.length === 1 && !matchedRequestedDomains.length) {
    return {
      score: 18,
      hasMatchedDomain: false,
      requestedDomainMismatch: true,
    };
  }

  if (matchedDomains.length) {
    return {
      score: 94,
      hasMatchedDomain: true,
      requestedDomainMismatch: false,
    };
  }

  const broadStudentProgram =
    request.user?.experienceLevel === "student" &&
    ["scholarship", "fellowship", "internship"].includes(opportunity.category) &&
    includesPhrase(candidate, ["student", "learning", "education", "developer program"]);

  if (broadStudentProgram) {
    return {
      score: 58,
      hasMatchedDomain: false,
      requestedDomainMismatch: false,
    };
  }

  return {
    score: 18,
    hasMatchedDomain: false,
    requestedDomainMismatch: false,
  };
}

function matchingFamilies(
  values: string[],
  families: Record<string, string[]>,
) {
  return Object.entries(families)
    .filter(([, signals]) => includesPhrase(values, signals))
    .map(([family]) => family);
}

function hardMismatchAssessment(
  opportunity: Opportunity,
  request: RecommendationRequest,
  now = new Date(),
) {
  const generalReasons: string[] = [];
  if (
    !opportunity.isActive ||
    opportunity.verificationStatus === "inactive_listing" ||
    opportunity.sourceStatus === "inactive" ||
    opportunity.sourceStatus === "stale"
  ) {
    generalReasons.push("The source record is inactive or stale.");
  }
  if (
    opportunity.deadline &&
    Date.parse(`${opportunity.deadline}T23:59:59Z`) < now.getTime()
  ) {
    generalReasons.push("The application deadline has passed.");
  }
  if (
    request.filters.categories?.length &&
    !request.filters.categories.includes(opportunity.category) &&
    !opportunity.secondaryTypes?.some((type) =>
      new Set<string>(
        request.filters.categories?.map((category) =>
          category === "remote_job"
            ? "job"
            : category === "web3_bounty"
              ? "bounty"
              : category,
        ),
      ).has(type),
    )
  ) {
    generalReasons.push(
      "The opportunity type does not match the requested categories.",
    );
  }
  if (request.filters.remote === true && !opportunity.remote) {
    generalReasons.push("The user requested remote-only opportunities.");
  }
  const userLocation = request.user?.location;
  if (userLocation) {
    const eligibilityText = opportunity.eligibility.join(" ");
    for (const rule of locationEligibilityRules) {
      if (
        rule.pattern.test(eligibilityText) &&
        !rule.allowedLocations.test(userLocation)
      ) {
        generalReasons.push(
          `${rule.label} conflicts with the supplied location.`,
        );
      }
    }
    if (publishedLocationMismatch(opportunity, userLocation)) {
      generalReasons.push(
        "The supplied location is not included in the employer's published eligible locations.",
      );
    }
  }
  if (generalReasons.length) {
    return { hardMismatch: true, reasons: generalReasons };
  }

  if (
    opportunity.verificationStatus === "program_directory" ||
    [
      "hackathon",
      "grant",
      "scholarship",
      "web3_bounty",
      "learning_resource",
      "student_benefit",
      "developer_program",
      "official_directory",
      "research_lead",
    ].includes(
      opportunity.category,
    )
  ) {
    return { hardMismatch: false, reasons: [] };
  }

  const profile = profileValues(request.user, request.resumeText);
  const profileRoleFamilies = matchingFamilies(profile, roleFamilies);
  if (!profileRoleFamilies.length) {
    return { hardMismatch: false, reasons: [] };
  }

  const candidateRoleFamilies = matchingFamilies(
    [opportunity.title],
    roleFamilies,
  );
  if (
    (["student", "beginner", "early-career"].includes(
      request.user?.experienceLevel ?? "",
    ) ||
      explicitlyRequestsJuniorScope(request)) &&
    includesPhrase(
      [opportunity.title, opportunity.summary],
      seniorSignals,
    )
  ) {
    return {
      hardMismatch: true,
      reasons: [
        "Experience-level mismatch: the role explicitly requires senior, lead, staff, principal, manager, head, or director scope.",
      ],
    };
  }
  if (
    normalize(opportunity.title).includes("operator") &&
    includesPhrase([opportunity.summary], industrialSummarySignals) &&
    !candidateRoleFamilies.includes("industrial_operations")
  ) {
    candidateRoleFamilies.push("industrial_operations");
  }
  const profileHasCoreProfessionalRole = profileRoleFamilies.some((family) =>
    coreProfessionalFamilies.has(family),
  );
  if (!candidateRoleFamilies.length && profileHasCoreProfessionalRole) {
    return {
      hardMismatch: true,
      reasons: [
        "Role-family mismatch: the individual job title does not establish a compatible professional role.",
      ],
    };
  }

  const supportedFamilies = candidateRoleFamilies.filter((family) =>
    profileRoleFamilies.includes(family),
  );
  const unsupportedNontechnicalFamilies = candidateRoleFamilies.filter(
    (family) =>
      clearlyNontechnicalFamilies.has(family) &&
      !profileRoleFamilies.includes(family),
  );
  if (unsupportedNontechnicalFamilies.length) {
    return {
      hardMismatch: true,
      reasons: [
        `Role-family mismatch: the opportunity is primarily ${unsupportedNontechnicalFamilies.join(
          "/",
        )}, while the supplied evidence is concentrated in ${profileRoleFamilies.join(
          "/",
        )}.`,
      ],
    };
  }
  if (supportedFamilies.length) {
    return { hardMismatch: false, reasons: [] };
  }

  return {
    hardMismatch: true,
    reasons: [
      `Role-family mismatch: the opportunity is primarily ${candidateRoleFamilies.join(
        "/",
      )}, while the supplied evidence is concentrated in ${profileRoleFamilies.join(
        "/",
      )}.`,
    ],
  };
}

function decideAction(
  opportunity: Opportunity,
  score: number,
  missingRequirements: string[],
  quality: number,
): RecommendationAction {
  if (quality < 35 || score < 38) {
    return "Skip";
  }

  if (
    canApplyNow(opportunity) &&
    score >= 76 &&
    missingRequirements.length <= 2 &&
    quality >= 55
  ) {
    return "Apply Now";
  }

  return "Prepare First";
}

export function buildProfileText(request: RecommendationRequest) {
  const user = request.user;
  const structured = user
    ? [
        formatUntrustedField("Name", user.name),
        formatUntrustedField("Headline", user.headline),
        formatUntrustedField("Bio", user.bio),
        formatUntrustedField("Location", user.location),
        user.experienceLevel && `Experience level: ${user.experienceLevel}`,
        formatUntrustedList("Skills", user.skills),
        formatUntrustedList("Interests", user.interests),
        formatUntrustedList("Goals", user.goals),
        formatUntrustedList("Education", user.education),
        formatUntrustedList("Work history", user.workHistory),
        formatUntrustedList("Projects", user.projects),
        formatUntrustedList("Certifications", user.certifications),
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const unstructured =
    !user && request.resumeText
      ? request.resumeText
          .split(/\r?\n/)
          .filter((line) => !instructionLikeContent.test(line))
          .join("\n")
          .slice(0, 1200)
      : "";

  return [structured, unstructured, request.goals?.join(", "), request.interests?.join(", ")]
    .filter(Boolean)
    .join("\n\n");
}

export function scoreOpportunity(
  opportunity: Opportunity,
  request: RecommendationRequest,
  options: RankingOptions = {},
): ScoredOpportunity {
  const skill = skillScore(opportunity, request);
  const category = categoryScore(opportunity, request);
  const experience = experienceScore(opportunity, request);
  const location = locationScore(opportunity, request);
  const deadline = deadlineScore(opportunity.deadline, options.now);
  const quality = qualityScore(opportunity);
  const value = valueScore(opportunity);
  const domain = domainFitAssessment(opportunity, request);
  const meaningfulCapabilityOverlap =
    skill.requiredMatchCount >= 2 || skill.score >= 45;
  const baseMismatch = hardMismatchAssessment(
    opportunity,
    request,
    options.now,
  );
  const lacksDirectoryFit =
    opportunity.verificationStatus === "program_directory" &&
    !domain.hasMatchedDomain &&
    !meaningfulCapabilityOverlap;
  const lacksVerifiedOpportunityFit =
    opportunity.verificationStatus !== "program_directory" &&
    domain.score < 30 &&
    !meaningfulCapabilityOverlap;
  const mismatch =
    !baseMismatch.hardMismatch &&
    (domain.requestedDomainMismatch ||
      lacksDirectoryFit ||
      lacksVerifiedOpportunityFit)
      ? {
          hardMismatch: true,
          reasons: [
            opportunity.verificationStatus === "program_directory" &&
            lacksDirectoryFit
              ? "The program directory does not match a supported target domain and lacks meaningful capability overlap."
              : domain.requestedDomainMismatch
                ? "The opportunity does not match any explicitly requested target domain."
              : "The opportunity does not match a supported target domain and lacks strong capability overlap.",
          ],
        }
      : baseMismatch;

  const relevance = Math.round(
    category * 0.24 +
      skill.score * 0.24 +
      domain.score * 0.18 +
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

  if (
    skill.score < 15 &&
    ![
      "hackathon",
      "scholarship",
      "grant",
      "learning_resource",
      "student_benefit",
      "developer_program",
      "official_directory",
      "research_lead",
    ].includes(opportunity.category)
  ) {
    score -= 12;
  }

  if (domain.score < 30) {
    score -= 24;
  }

  score = Math.max(0, Math.min(100, score));
  if (mismatch.hardMismatch) {
    score = Math.min(score, 20);
  }
  const action = mismatch.hardMismatch
    ? "Skip"
    : decideAction(opportunity, score, skill.missingRequirements, quality);
  const matchedSignals = [
    ...skill.matches,
    `Category relevance: ${category}/100`,
    `Experience fit: ${experience}/100`,
    `Domain fit: ${domain.score}/100`,
    `Opportunity quality: ${quality}/100`,
    opportunity.remote ? "Remote-compatible opportunity" : "",
    ...mismatch.reasons,
  ].filter(Boolean);

  return {
    opportunity,
    score,
    qualityScore: quality,
    relevanceScore: relevance,
    matchedSignals,
    missingRequirements: skill.missingRequirements,
    action,
    hardMismatch: mismatch.hardMismatch,
    mismatchReasons: mismatch.reasons,
  };
}

export function rankOpportunities(
  opportunities: Opportunity[],
  request: RecommendationRequest,
  options: RankingOptions = {},
) {
  return opportunities
    .map((opportunity) => scoreOpportunity(opportunity, request, options))
    .filter(
      (candidate) =>
        !candidate.hardMismatch &&
        !hasGenericTitle(candidate.opportunity) &&
        candidate.qualityScore >= 40 &&
        candidate.score >= 35,
    )
    .sort((a, b) => {
      const actionWeight = (action: RecommendationAction) =>
        action === "Apply Now" ? 2 : action === "Prepare First" ? 1 : 0;
      return (
        b.score - a.score ||
        actionWeight(b.action) - actionWeight(a.action) ||
        b.qualityScore - a.qualityScore
      );
    });
}
