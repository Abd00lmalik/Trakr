import {
  canonicalizeUrl,
  publisherDomain,
} from "@/lib/opportunities/verification";
import type { Opportunity } from "@/lib/types/opportunities";

export type GreenhouseBoardConfig = {
  token: string;
  name: string;
  topics: string[];
};

export const greenhouseBoardConfigs: GreenhouseBoardConfig[] = [
  {
    token: "anthropic",
    name: "Anthropic",
    topics: ["AI", "research", "open source"],
  },
  {
    token: "scaleai",
    name: "Scale AI",
    topics: ["AI", "data", "research"],
  },
  {
    token: "moniepoint",
    name: "Moniepoint",
    topics: ["fintech", "financial inclusion", "Africa", "Nigeria"],
  },
  {
    token: "wavemm1",
    name: "Wave Mobile Money",
    topics: ["fintech", "financial inclusion", "Africa"],
  },
  {
    token: "oneethos",
    name: "One Ethos",
    topics: ["climate", "sustainability", "fintech"],
  },
  {
    token: "ripple",
    name: "Ripple",
    topics: ["fintech", "payments", "Web3"],
  },
  {
    token: "kivaorg",
    name: "Kiva",
    topics: ["fintech", "financial inclusion", "impact"],
  },
  {
    token: "stripe",
    name: "Stripe",
    topics: ["fintech", "payments", "developer tools"],
  },
  {
    token: "okx",
    name: "OKX",
    topics: ["fintech", "Web3", "payments"],
  },
];

type GreenhouseJob = {
  id?: number;
  title?: string;
  updated_at?: string;
  absolute_url?: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string; location?: string }>;
  content?: string;
};

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
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

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function roleCategory(title: string): Opportunity["category"] {
  const value = title.toLowerCase();
  if (/\b(fellowship|fellowships|fellow|fellows|research program)\b/.test(value)) {
    return "fellowship";
  }
  if (
    /\b(intern|internship|apprentice|graduate program|student program)\b/.test(
      value,
    )
  ) {
    return "internship";
  }
  return "remote_job";
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
    "statistics",
    "machine learning",
    "data analysis",
    "research",
    "technical writing",
    "project management",
    "financial analysis",
  ];
  const normalized = value.toLowerCase();
  return skillSignals.filter((skill) =>
    normalized.includes(skill.toLowerCase()),
  );
}

function extractEligibility(location: string, content: string) {
  const locationRestriction = (() => {
    if (
      /\b(united states|u\.s\.|us)(?:\s*-\s*|\s+)(?:remote|based)\b|\bremote[^.;]*(?:united states|u\.s\.|us)\b/i.test(
        location,
      )
    ) {
      return "United States-only eligibility based on the published job location.";
    }
    if (
      /\b(united kingdom|u\.k\.|uk)(?:\s*-\s*|\s+)(?:remote|based)\b|\bremote[^.;]*(?:united kingdom|u\.k\.|uk)\b/i.test(
        location,
      )
    ) {
      return "United Kingdom-only eligibility based on the published job location.";
    }
    if (
      /\bcanada(?:\s*-\s*|\s+)(?:remote|based)\b|\bremote[^.;]*canada\b/i.test(
        location,
      )
    ) {
      return "Canada-only eligibility based on the published job location.";
    }
    if (
      /\b(?:europe|european union|eu)(?:\s*-\s*|\s+)(?:remote|based)\b|\bremote[^.;]*(?:europe|european union|eu)\b/i.test(
        location,
      )
    ) {
      return "Europe-only eligibility based on the published job location.";
    }
    return "";
  })();
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) =>
      /\b(eligible|eligibility|must be|authorized|authorization|work in|based in|location|remote)\b/i.test(
        sentence,
      ),
    )
    .slice(0, 4);
  const genericRemoteLocation =
    /^(?:remote|remote worldwide|worldwide remote)$/i.test(location);

  return unique([
    location ? `Published location: ${location}` : "",
    locationRestriction,
    location && !genericRemoteLocation && /\b(remote|distributed|work from home)\b/i.test(location)
      ? `Published eligible locations: ${location}`
      : "",
    ...sentences,
    "Confirm employer-specific work authorization and regional eligibility on the official job page.",
  ]);
}

function greenhousePriority(job: GreenhouseJob, board: GreenhouseBoardConfig) {
  const title = cleanText(job.title);
  const content = cleanText(job.content);
  const location = cleanText(job.location?.name);
  const departments = cleanText(
    job.departments?.map((department) => department.name).join(" "),
  );
  const value = `${title} ${content} ${location} ${departments} ${board.topics.join(
    " ",
  )}`;
  let score = 0;

  if (
    /\b(intern|internship|fellow|fellowship|apprentice|graduate|entry[- ]level|junior|student)\b/i.test(
      value,
    )
  ) {
    score += 12;
  }
  if (/\b(remote|remote-friendly|distributed|work from home)\b/i.test(value)) {
    score += 8;
  }
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
    /\b(climate|sustainability|renewable|carbon|environment|energy transition|cleantech)\b/i.test(
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
    /\b(software|engineer|developer|data|product|design|security|analyst|program manager|project manager)\b/i.test(
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

export function normalizeGreenhouseJob(
  job: GreenhouseJob,
  board: GreenhouseBoardConfig,
): Opportunity | null {
  const title = cleanText(job.title);
  const sourceUrl = cleanText(job.absolute_url);
  if (!title || !sourceUrl) {
    return null;
  }

  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeUrl(sourceUrl);
  } catch {
    return null;
  }

  const content = cleanText(job.content);
  const location =
    cleanText(job.location?.name) ||
    cleanText(job.offices?.map((office) => office.name ?? office.location).join("; ")) ||
    "Location not specified";
  const departments = unique(
    (job.departments ?? []).map((department) => cleanText(department.name)),
  );
  const category = roleCategory(title);
  const remote = /\b(remote|remote-friendly|distributed|work from home)\b/i.test(
    location,
  );
  const skills = extractSkills(`${title} ${content}`);
  const summary =
    content.slice(0, 1200) ||
    `${title} at ${board.name}, published through the employer's official Greenhouse job board.`;
  const topicTags = unique([
    ...board.topics,
    ...departments,
    ...skills,
    category,
    remote ? "remote" : "",
  ]);

  return {
    id: `greenhouse-${board.token}-${String(job.id ?? canonicalUrl)}`,
    title,
    organization: board.name,
    category,
    summary,
    sourceName: `Greenhouse: ${board.name}`,
    sourceUrl: canonicalUrl,
    location,
    remote,
    deadline: null,
    requiredSkills: [],
    preferredSkills: unique([...board.topics, ...departments, ...skills]).slice(
      0,
      10,
    ),
    eligibility: extractEligibility(location, content),
    benefits: ["Official employer posting", "Review the canonical posting for compensation and benefits."],
    tags: topicTags.slice(0, 18),
    difficulty: /\b(intern|internship|apprentice|graduate|junior)\b/i.test(title)
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

async function fetchGreenhouseBoard(board: GreenhouseBoardConfig) {
  const response = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Trakr/0.1 (+https://github.com/Abd00lmalik/Trakr)",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) {
    throw new Error(`Greenhouse board ${board.name} returned ${response.status}`);
  }
  const data = (await response.json()) as { jobs?: GreenhouseJob[] };
  return (data.jobs ?? [])
    .map((job) => ({ job, priority: greenhousePriority(job, board) }))
    .filter(({ priority }) => priority >= 8)
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        Date.parse(right.job.updated_at ?? "") -
          Date.parse(left.job.updated_at ?? ""),
    )
    .slice(0, 45)
    .map(({ job }) => job)
    .map((job) => normalizeGreenhouseJob(job, board))
    .filter((job): job is Opportunity => Boolean(job));
}

export async function fetchGreenhouseOpportunities() {
  const results = await Promise.allSettled(
    greenhouseBoardConfigs.map((board) => fetchGreenhouseBoard(board)),
  );
  const opportunities = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const errors = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          result.reason instanceof Error
            ? `${greenhouseBoardConfigs[index].name}: ${result.reason.message}`
            : `${greenhouseBoardConfigs[index].name}: unknown fetch error`,
        ]
      : [],
  );
  const successfulSourceNames = results.flatMap((result, index) =>
    result.status === "fulfilled"
      ? [`Greenhouse: ${greenhouseBoardConfigs[index].name}`]
      : [],
  );

  return {
    opportunities,
    errors,
    sources: ["Greenhouse employer job boards"],
    successfulSourceNames,
  };
}
