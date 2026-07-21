import type {
  DeadlineEvidence,
  EvidenceConfidence,
  FieldEvidence,
  GeographicEligibility,
  Opportunity,
  OpportunityDomain,
  OpportunityRecommendationState,
  OpportunitySourceTier,
  OpportunityType,
  RemoteScope,
  SourcePermissionStatus,
} from "@/lib/types/opportunities";

const countrySignals: Array<[RegExp, string]> = [
  [/\bnigeria\b/i, "Nigeria"],
  [/\bkenya\b/i, "Kenya"],
  [/\bghana\b/i, "Ghana"],
  [/\buganda\b/i, "Uganda"],
  [/\brwanda\b/i, "Rwanda"],
  [/\bsouth africa\b/i, "South Africa"],
  [/\bunited states|u\.s\.|usa\b/i, "United States"],
  [/\bunited kingdom|u\.k\.|\buk\b/i, "United Kingdom"],
  [/\bcanada\b/i, "Canada"],
  [/\bindia\b/i, "India"],
  [/\baustralia\b/i, "Australia"],
  [/\bgermany\b/i, "Germany"],
  [/\bfrance\b/i, "France"],
  [/\bportugal\b/i, "Portugal"],
];

const regionSignals: Array<[RegExp, string]> = [
  [/\bafrica|african union\b/i, "Africa"],
  [/\beurope|european union|\beu\b/i, "Europe"],
  [/\bmiddle east\b/i, "Middle East"],
  [/\basia[- ]pacific|\bapac\b/i, "Asia-Pacific"],
  [/\blatin america|\blatam\b/i, "Latin America"],
  [/\bnorth america\b/i, "North America"],
];

const africanCountries = new Set([
  "algeria",
  "angola",
  "benin",
  "botswana",
  "burkina faso",
  "burundi",
  "cabo verde",
  "cameroon",
  "central african republic",
  "chad",
  "comoros",
  "democratic republic of the congo",
  "republic of the congo",
  "cote d ivoire",
  "djibouti",
  "egypt",
  "equatorial guinea",
  "eritrea",
  "eswatini",
  "ethiopia",
  "gabon",
  "gambia",
  "ghana",
  "guinea",
  "guinea-bissau",
  "kenya",
  "lesotho",
  "liberia",
  "libya",
  "madagascar",
  "malawi",
  "mali",
  "mauritania",
  "mauritius",
  "morocco",
  "mozambique",
  "namibia",
  "niger",
  "nigeria",
  "rwanda",
  "sao tome and principe",
  "senegal",
  "seychelles",
  "sierra leone",
  "somalia",
  "south africa",
  "south sudan",
  "sudan",
  "tanzania",
  "togo",
  "tunisia",
  "uganda",
  "zambia",
  "zimbabwe",
]);

const domainRules: Array<{
  domain: OpportunityDomain;
  strong: RegExp;
  context?: RegExp;
}> = [
  {
    domain: "artificial_intelligence",
    strong: /\b(artificial intelligence|ai research|ai engineer|generative ai|large language model|llm)\b/i,
    context: /\bai\b/i,
  },
  {
    domain: "machine_learning",
    strong: /\b(machine learning|deep learning|pytorch|tensorflow|model training)\b/i,
  },
  {
    domain: "climate",
    strong: /\b(climate change|climate tech|climate finance|climate resilience|decarboni[sz]ation)\b/i,
    context: /\bclimate\b/i,
  },
  {
    domain: "sustainability",
    strong: /\b(sustainability|renewable energy|clean energy|carbon markets?|environmental sustainability)\b/i,
  },
  {
    domain: "fintech",
    strong: /\b(fintech|financial technology|digital payments?|financial inclusion|mobile money)\b/i,
  },
  {
    domain: "finance",
    strong: /\b(financial services|banking|accounting|investment|capital markets?)\b/i,
  },
  {
    domain: "blockchain",
    strong: /\b(blockchain|smart contracts?|solidity|ethereum)\b/i,
  },
  {
    domain: "web3",
    strong: /\b(web3|decentralized finance|defi|dao)\b/i,
  },
  {
    domain: "research",
    strong: /\b(research funding|research fellowship|research placement|scientific research|research program)\b/i,
    context: /\b(research|researcher|scientist|academic)\b/i,
  },
  {
    domain: "health",
    strong: /\b(public health|healthcare|medical research|clinical|health technology)\b/i,
  },
  {
    domain: "education",
    strong: /\b(education|learning sciences|student success|teaching|scholarship)\b/i,
  },
  {
    domain: "public_policy",
    strong: /\b(public policy|government policy|policy research|civic engagement)\b/i,
  },
  {
    domain: "design",
    strong: /\b(product design|ux design|ui design|graphic design|industrial design|interior design)\b/i,
  },
  {
    domain: "software_engineering",
    strong: /\b(software engineer|software engineering|frontend|backend|full[- ]stack|developer)\b/i,
  },
  {
    domain: "entrepreneurship",
    strong: /\b(entrepreneurship|startup accelerator|incubator|founder program|venture building)\b/i,
  },
  {
    domain: "cybersecurity",
    strong: /\b(cybersecurity|information security|security research|bug bounty|vulnerability)\b/i,
  },
  {
    domain: "open_source",
    strong: /\b(open source|open-source|oss contributor|maintainer)\b/i,
  },
  {
    domain: "social_impact",
    strong: /\b(social impact|community development|humanitarian|nonprofit|public service)\b/i,
  },
];

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function legacyOpportunityType(opportunity: Opportunity): OpportunityType {
  if (opportunity.category === "remote_job") return "job";
  if (opportunity.category === "web3_bounty") return "bounty";
  return opportunity.category;
}

function publishedText(opportunity: Opportunity) {
  return [
    opportunity.title,
    opportunity.summary,
    opportunity.location,
    ...opportunity.requiredSkills,
    ...opportunity.preferredSkills,
    ...opportunity.eligibility,
    ...opportunity.tags,
  ].join(" ");
}

function classifiedDomains(opportunity: Opportunity) {
  const text = publishedText(opportunity);
  const titleAndPurpose = `${opportunity.title} ${opportunity.summary}`;
  return domainRules
    .filter(
      (rule) =>
        rule.strong.test(titleAndPurpose) ||
        (rule.context?.test(titleAndPurpose) &&
          rule.context.test(`${opportunity.tags.join(" ")} ${opportunity.requiredSkills.join(" ")}`)),
    )
    .map((rule) => rule.domain);
}

function sourceClassification(sourceName: string): {
  tier: OpportunitySourceTier;
  permission: SourcePermissionStatus;
} {
  if (
    sourceName === "Devpost API" ||
    sourceName === "RemoteOK API" ||
    sourceName === "Grants.gov API" ||
    sourceName.startsWith("Greenhouse:") ||
    sourceName.startsWith("Ashby:")
  ) {
    return {
      tier: "tier_a_structured",
      permission:
        sourceName.startsWith("Greenhouse:") || sourceName.startsWith("Ashby:")
          ? "employer_owned_api"
          : "documented_public_api",
    };
  }
  if (sourceName === "Official curated source") {
    return {
      tier: "tier_b_official_directory",
      permission: "official_directory",
    };
  }
  return {
    tier: "tier_c_review_backed",
    permission: "manual_review_only",
  };
}

function evidence(
  opportunity: Opportunity,
  field: string,
  value: string | string[],
  confidence: EvidenceConfidence,
  basis: FieldEvidence["basis"] = "inferred",
): FieldEvidence {
  return {
    field,
    value,
    sourceUrl: opportunity.canonicalUrl || opportunity.sourceUrl,
    sourceName: opportunity.sourceName,
    capturedAt:
      opportunity.lastSeenAt ??
      opportunity.lastVerifiedAt ??
      new Date().toISOString(),
    confidence,
    basis,
  };
}

function countryMatches(text: string) {
  return unique(
    countrySignals
      .filter(([pattern]) => pattern.test(text))
      .map(([, country]) => country),
  );
}

function regionMatches(text: string) {
  return unique(
    regionSignals
      .filter(([pattern]) => pattern.test(text))
      .map(([, region]) => region),
  );
}

function remoteScope(opportunity: Opportunity, eligibilityText: string): RemoteScope {
  const location = opportunity.location;
  const combined = `${location} ${eligibilityText}`;
  if (!opportunity.remote) {
    return /\bhybrid\b/i.test(combined) ? "hybrid" : "onsite";
  }
  if (/\b(worldwide|globally remote|global remote|work from anywhere|any country)\b/i.test(combined)) {
    return "globally_remote";
  }
  if (/\b(time zones?|utc[+-]?\d|gmt[+-]?\d|working hours)\b/i.test(combined)) {
    return "remote_timezones";
  }
  if (regionMatches(combined).length) return "remote_region";
  if (countryMatches(combined).length) return "remote_country";
  return "remote_scope_unclear";
}

function geographicEligibility(opportunity: Opportunity): GeographicEligibility {
  const eligibilityText = opportunity.eligibility.join(" ");
  const combined = `${opportunity.location} ${eligibilityText}`;
  const remote = remoteScope(opportunity, eligibilityText);
  const eligibleCountries = countryMatches(combined);
  const eligibleRegions = regionMatches(combined);
  const workAuthorizationRequirements = opportunity.eligibility.filter((item) =>
    /\b(work authorization|authorized to work|work permit|right to work)\b/i.test(item),
  );
  const citizenshipRequirements = opportunity.eligibility.filter((item) =>
    /\b(citizen|citizenship|national of)\b/i.test(item),
  );
  const applicantResidencyRequirements = opportunity.eligibility.filter((item) =>
    /\b(resident|residency|reside|based in|located in)\b/i.test(item),
  );
  const timezoneRestrictions = opportunity.eligibility.filter((item) =>
    /\b(time zones?|utc[+-]?\d|gmt[+-]?\d|working hours)\b/i.test(item),
  );
  const unknownConditions: string[] = [];
  if (remote === "remote_scope_unclear") {
    unknownConditions.push(
      "The source describes remote work but does not establish global remote eligibility.",
    );
  }
  if (
    opportunity.category === "remote_job" &&
    !workAuthorizationRequirements.length
  ) {
    unknownConditions.push(
      "Employer work-authorization requirements require confirmation.",
    );
  }
  const confidence: EvidenceConfidence =
    remote === "globally_remote" ||
    eligibleCountries.length ||
    eligibleRegions.length ||
    !opportunity.remote
      ? "medium"
      : "low";

  return {
    eligibleCountries,
    excludedCountries: [],
    eligibleRegions,
    applicantResidencyRequirements,
    citizenshipRequirements,
    workAuthorizationRequirements,
    visaSponsorship: /\b(visa sponsorship available|sponsor visas?)\b/i.test(
      eligibilityText,
    )
      ? "offered"
      : /\b(no visa sponsorship|does not sponsor|cannot sponsor)\b/i.test(
            eligibilityText,
          )
        ? "not_offered"
        : opportunity.category === "remote_job"
          ? "unclear"
          : "not_applicable",
    remoteScope: remote,
    travelRequirements: opportunity.eligibility.filter((item) =>
      /\b(?:travel|required travel|travel to)\b/i.test(item),
    ),
    onsiteRequirements: opportunity.eligibility.filter((item) =>
      /\b(onsite|on-site|in person|in-person|relocat)\b/i.test(item),
    ),
    timezoneRestrictions,
    evidence: [
      evidence(
        opportunity,
        "geography",
        unique([opportunity.location, ...opportunity.eligibility]),
        confidence,
        "published",
      ),
    ],
    confidence,
    unknownConditions,
  };
}

function deadlineEvidence(
  opportunity: Opportunity,
  now = new Date(),
): DeadlineEvidence {
  const verifiedAt = opportunity.lastVerifiedAt;
  if (opportunity.deadline) {
    const passed =
      Date.parse(`${opportunity.deadline}T23:59:59Z`) < now.getTime();
    return {
      state: passed ? "passed" : "exact_future",
      date: opportunity.deadline,
      timezone: null,
      sourceUrl: opportunity.canonicalUrl || opportunity.sourceUrl,
      verifiedAt,
      confidence:
        opportunity.verificationStatus === "verified" ? "high" : "medium",
      currentCycle:
        opportunity.verificationStatus === "verified" ? "confirmed" : "unknown",
      notes: passed
        ? ["The published deadline has passed."]
        : ["The published date should still be checked before submission."],
    };
  }
  const isJob = legacyOpportunityType(opportunity) === "job";
  return {
    state: isJob ? "rolling" : "requires_confirmation",
    date: null,
    timezone: null,
    sourceUrl: opportunity.canonicalUrl || opportunity.sourceUrl,
    verifiedAt,
    confidence: isJob ? "medium" : "low",
    currentCycle: isJob ? "not_applicable" : "unknown",
    notes: [
      isJob
        ? "No fixed deadline is published; availability depends on the live employer posting."
        : "The current application deadline is not confirmed.",
    ],
  };
}

function recommendationState(
  opportunity: Opportunity,
  deadline: DeadlineEvidence,
): OpportunityRecommendationState {
  if (
    !opportunity.isActive ||
    opportunity.verificationStatus === "inactive_listing" ||
    deadline.state === "passed" ||
    deadline.state === "closed"
  ) {
    return "unavailable_or_unverified";
  }
  if (opportunity.verificationStatus === "program_directory") return "explore";
  if (opportunity.verificationStatus !== "verified") {
    return opportunity.sourceTier === "tier_b_official_directory"
      ? "research_lead"
      : "unavailable_or_unverified";
  }
  if (
    deadline.state === "requires_confirmation" ||
    deadline.state === "historical_estimate" ||
    deadline.state === "unclear"
  ) {
    return "explore";
  }
  if (
    opportunity.geography?.remoteScope === "remote_scope_unclear" ||
    opportunity.geography?.confidence === "low" ||
    opportunity.geography?.unknownConditions.length
  ) {
    return "explore";
  }
  return "apply_now";
}

export function enrichOpportunityMetadata(
  opportunity: Opportunity,
  now = new Date(),
): Opportunity {
  const source = sourceClassification(opportunity.sourceName);
  const geography =
    opportunity.geography ?? geographicEligibility(opportunity);
  const deadlineInfo =
    opportunity.deadlineInfo ?? deadlineEvidence(opportunity, now);
  const opportunityType =
    opportunity.opportunityType ?? legacyOpportunityType(opportunity);
  const domains =
    opportunity.domains?.length
      ? opportunity.domains
      : classifiedDomains(opportunity);
  const fieldEvidence = [
    ...(opportunity.fieldEvidence ?? []),
    evidence(
      opportunity,
      "opportunityType",
      opportunityType,
      "medium",
      "inferred",
    ),
    ...(domains.length
      ? [
          evidence(
            opportunity,
            "domains",
            domains,
            "medium",
            "inferred",
          ),
        ]
      : []),
  ];
  const enriched = {
    ...opportunity,
    opportunityType,
    secondaryTypes: opportunity.secondaryTypes ?? [],
    domains,
    geography,
    deadlineInfo,
    sourceTier: opportunity.sourceTier ?? source.tier,
    sourcePermission: opportunity.sourcePermission ?? source.permission,
    fieldEvidence,
  };
  return {
    ...enriched,
    recommendationState: recommendationState(enriched, deadlineInfo),
  };
}

export function isGeographicallyActionable(
  opportunity: Opportunity,
  applicantCountry: string | undefined,
  remoteOnly: boolean,
) {
  const geography = opportunity.geography;
  if (!geography) return !remoteOnly;
  if (
    remoteOnly &&
    (geography.remoteScope === "onsite" ||
      geography.remoteScope === "hybrid")
  ) {
    return false;
  }
  if (geography.remoteScope === "globally_remote") return true;
  if (!applicantCountry) {
    return remoteOnly
      ? geography.remoteScope !== "remote_scope_unclear"
      : true;
  }
  const applicant = applicantCountry.toLowerCase();
  if (
    geography.excludedCountries.some(
      (country) => country.toLowerCase() === applicant,
    )
  ) {
    return false;
  }
  if (
    geography.eligibleCountries.some(
      (country) => country.toLowerCase() === applicant,
    )
  ) {
    return true;
  }
  if (
    geography.eligibleRegions.includes("Africa") &&
    africanCountries.has(applicant)
  ) {
    return true;
  }
  if (
    geography.eligibleCountries.length ||
    geography.eligibleRegions.length
  ) {
    return false;
  }
  if (remoteOnly) {
    return [
      "remote_country",
      "remote_region",
      "remote_timezones",
    ].includes(geography.remoteScope);
  }
  // Unknown geography remains eligible for Explore/Research Lead handling;
  // recommendation state prevents it from becoming an unsafe Apply Now item.
  return true;
}
