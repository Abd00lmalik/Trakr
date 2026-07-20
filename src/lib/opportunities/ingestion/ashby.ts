import {
  canonicalizeUrl,
  publisherDomain,
} from "@/lib/opportunities/verification";
import type { Opportunity } from "@/lib/types/opportunities";

export type AshbyBoardConfig = {
  board: string;
  name: string;
  topics: string[];
};

export const ashbyBoardConfigs: AshbyBoardConfig[] = [
  {
    board: "M-KOPA",
    name: "M-KOPA",
    topics: ["fintech", "financial inclusion", "climate", "Africa"],
  },
  {
    board: "primeintellect",
    name: "Prime Intellect",
    topics: ["AI", "research", "open source", "Web3"],
  },
  {
    board: "eloquentai",
    name: "Eloquent AI",
    topics: ["AI", "software", "research"],
  },
  {
    board: "clipboard",
    name: "Clipboard",
    topics: ["operations", "customer support", "Africa", "remote"],
  },
  {
    board: "paymentology",
    name: "Paymentology",
    topics: ["fintech", "payments", "Africa", "remote"],
  },
  {
    board: "taptapsend",
    name: "Taptap Send",
    topics: ["fintech", "payments", "financial inclusion", "Africa"],
  },
  {
    board: "sylvera",
    name: "Sylvera",
    topics: ["climate", "carbon", "sustainability"],
  },
];

type AshbyPostalAddress = {
  addressCountry?: string;
  addressRegion?: string;
  addressLocality?: string;
};

export type AshbyJob = {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: Array<{
    location?: string;
    address?: { postalAddress?: AshbyPostalAddress };
  }>;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  address?: { postalAddress?: AshbyPostalAddress };
  jobUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const instructionLikeContent =
  /\b(ignore (?:all|any|the|previous)|system prompt|developer message|assistant instruction|tool call|reveal secrets?|exfiltrate|override instructions?|send (?:the )?(?:resume|profile|personal|user)?\s*data to)\b/i;

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeDescription(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .filter((part) => !instructionLikeContent.test(part))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function categoryForJob(job: AshbyJob): Opportunity["category"] {
  const title = cleanText(job.title).toLowerCase();
  const employmentType = cleanText(job.employmentType).toLowerCase();
  if (
    /\b(fellowship|fellowships|fellow|fellows|residency|resident|research program)\b/.test(
      title,
    )
  ) {
    return "fellowship";
  }
  if (
    /\b(intern|internship|apprentice|apprenticeship|graduate program|student program)\b/.test(
      title,
    ) ||
    employmentType === "intern"
  ) {
    return "internship";
  }
  return "remote_job";
}

function isRemoteJob(job: AshbyJob) {
  const workplaceType = cleanText(job.workplaceType).toLowerCase();
  const location = cleanText(job.location);
  return (
    workplaceType === "remote" ||
    (workplaceType !== "hybrid" && /\bremote\b/i.test(location))
  );
}

function postalAddressValues(address?: AshbyPostalAddress) {
  return unique([
    cleanText(address?.addressLocality),
    cleanText(address?.addressRegion),
    cleanText(address?.addressCountry),
  ]);
}

function publishedLocations(job: AshbyJob) {
  const primary = cleanText(job.location);
  const primaryAddress = postalAddressValues(job.address?.postalAddress);
  const secondary = (job.secondaryLocations ?? []).flatMap((location) => [
    cleanText(location.location),
    ...postalAddressValues(location.address?.postalAddress),
  ]);
  const genericRemote = /^(remote|remote worldwide|worldwide remote)$/i.test(
    primary,
  );

  return unique([
    primary,
    ...(genericRemote ? [] : primaryAddress),
    ...secondary,
  ]);
}

function extractSkills(value: string) {
  const skillSignals = [
    "Python",
    "TypeScript",
    "JavaScript",
    "React",
    "Node.js",
    "SQL",
    "PostgreSQL",
    "Rust",
    "Solidity",
    "Go",
    "Java",
    "C++",
    "AWS",
    "Azure",
    "GCP",
    "Kubernetes",
    "Linux",
    "Figma",
    "Terraform",
    "Airflow",
    "Kafka",
    "machine learning",
    "data analysis",
    "research",
    "technical writing",
    "project management",
    "financial analysis",
    "customer support",
  ];
  const normalized = value.toLowerCase();
  return skillSignals.filter((skill) =>
    normalized.includes(skill.toLowerCase()),
  );
}

function eligibilityForJob(job: AshbyJob, locations: string[]) {
  const locationText = locations.join("; ");
  const description = sanitizeDescription(
    cleanText(job.descriptionPlain ?? job.descriptionHtml),
  );
  const evidence = description
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) =>
      /\b(eligible|eligibility|must be|authorized|authorization|work permit|visa sponsorship|based in|reside|location)\b/i.test(
        sentence,
      ),
    )
    .slice(0, 4);
  const genericGlobalRemote =
    locations.length === 1 &&
    /^(remote|remote worldwide|worldwide remote)$/i.test(locations[0]);

  return unique([
    locationText ? `Published location: ${locationText}` : "",
    isRemoteJob(job) && locationText && !genericGlobalRemote
      ? `Published eligible locations: ${locationText}`
      : "",
    ...evidence,
    "Confirm employer-specific work authorization and regional eligibility on the official job page.",
  ]);
}

function ashbyPriority(job: AshbyJob, board: AshbyBoardConfig) {
  const title = cleanText(job.title);
  const description = sanitizeDescription(
    cleanText(job.descriptionPlain ?? job.descriptionHtml),
  );
  const location = publishedLocations(job).join(" ");
  const value = `${title} ${description} ${location} ${cleanText(
    job.department,
  )} ${cleanText(job.team)} ${board.topics.join(" ")}`;
  let score = 0;

  if (
    /\b(intern|internship|fellow|fellowship|resident|residency|apprentice|graduate|entry[- ]level|junior|student)\b/i.test(
      value,
    )
  ) {
    score += 12;
  }
  if (isRemoteJob(job)) score += 8;
  if (
    /\b(africa|nigeria|ghana|kenya|uganda|rwanda|senegal|cote d'ivoire|ivory coast|south africa|burkina faso|niger)\b/i.test(
      value,
    )
  ) {
    score += 10;
  }
  if (
    /\b(ai|artificial intelligence|machine learning|data science|research|scientist)\b/i.test(
      value,
    )
  ) {
    score += 8;
  }
  if (
    /\b(climate|sustainability|renewable|carbon|environmental|energy transition|cleantech)\b/i.test(
      value,
    )
  ) {
    score += 8;
  }
  if (
    /\b(fintech|payments|banking|financial inclusion|financial services|treasury|credit|risk)\b/i.test(
      value,
    )
  ) {
    score += 8;
  }
  if (
    /\b(software|engineer|developer|data|product|design|security|analyst|research|customer|operations|program manager|project manager)\b/i.test(
      value,
    )
  ) {
    score += 5;
  }
  if (
    /\b(senior|staff|principal|director|vice president|head of|chief)\b/i.test(
      title,
    )
  ) {
    score -= 7;
  }

  return score;
}

export function normalizeAshbyJob(
  job: AshbyJob,
  board: AshbyBoardConfig,
): Opportunity | null {
  const title = cleanText(job.title);
  const sourceUrl = cleanText(job.jobUrl);
  if (job.isListed === false || !title || !sourceUrl) {
    return null;
  }

  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeUrl(sourceUrl);
  } catch {
    return null;
  }

  const description = sanitizeDescription(
    cleanText(job.descriptionPlain ?? job.descriptionHtml),
  );
  const locations = publishedLocations(job);
  const location = locations.join("; ") || "Location not specified";
  const category = categoryForJob(job);
  const remote = isRemoteJob(job);
  const skills = extractSkills(`${title} ${description}`);
  const organizationSignals = unique([
    ...board.topics,
    cleanText(job.department),
    cleanText(job.team),
  ]);
  const summary =
    description.slice(0, 1200) ||
    `${title} at ${board.name}, published through the employer's official Ashby job board.`;

  return {
    id: `ashby-${board.board}-${String(job.id ?? canonicalUrl)}`,
    title,
    organization: board.name,
    category,
    summary,
    sourceName: `Ashby: ${board.name}`,
    sourceUrl: canonicalUrl,
    location,
    remote,
    deadline: null,
    requiredSkills: [],
    preferredSkills: unique([...organizationSignals, ...skills]).slice(0, 10),
    eligibility: eligibilityForJob(job, locations),
    benefits: [
      "Official employer posting",
      "Review the canonical posting for compensation and benefits.",
    ],
    tags: unique([
      ...organizationSignals,
      ...skills,
      category,
      remote ? "remote" : "",
    ]).slice(0, 18),
    difficulty:
      /\b(intern|internship|apprentice|graduate|junior|resident|residency)\b/i.test(
        title,
      )
        ? "low"
        : /\b(senior|staff|principal|lead|director|manager|head)\b/i.test(title)
          ? "high"
          : "medium",
    verificationStatus: "unverified",
    lastVerifiedAt: null,
    lastSeenAt: null,
    sourceStatus: "unverified",
    httpStatus: null,
    canonicalUrl,
    publisherDomain: publisherDomain(canonicalUrl),
    isActive: true,
    verificationConfidence: 0,
  };
}

async function fetchAshbyBoard(
  board: AshbyBoardConfig,
  fetchImpl: FetchLike,
) {
  const response = await fetchImpl(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
      board.board,
    )}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Trakr/0.1 (+https://github.com/Abd00lmalik/Trakr)",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) {
    throw new Error(`Ashby board ${board.name} returned ${response.status}`);
  }
  const data = (await response.json()) as { jobs?: AshbyJob[] };
  return (data.jobs ?? [])
    .filter((job) => job.isListed !== false)
    .map((job) => ({ job, priority: ashbyPriority(job, board) }))
    .filter(({ priority }) => priority >= 8)
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        Date.parse(right.job.publishedAt ?? "") -
          Date.parse(left.job.publishedAt ?? ""),
    )
    .slice(0, 40)
    .map(({ job }) => normalizeAshbyJob(job, board))
    .filter((job): job is Opportunity => Boolean(job));
}

export async function fetchAshbyOpportunities(options?: {
  fetchImpl?: FetchLike;
  boards?: AshbyBoardConfig[];
}) {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const boards = options?.boards ?? ashbyBoardConfigs;
  const results = await Promise.allSettled(
    boards.map((board) => fetchAshbyBoard(board, fetchImpl)),
  );
  const opportunities = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const errors = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          result.reason instanceof Error
            ? `${boards[index].name}: ${result.reason.message}`
            : `${boards[index].name}: unknown fetch error`,
        ]
      : [],
  );
  const successfulSourceNames = results.flatMap((result, index) =>
    result.status === "fulfilled" ? [`Ashby: ${boards[index].name}`] : [],
  );

  return {
    opportunities,
    errors,
    sources: ["Ashby employer job boards"],
    successfulSourceNames,
  };
}
