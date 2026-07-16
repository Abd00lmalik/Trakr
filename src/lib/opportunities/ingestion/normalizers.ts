import type { Opportunity } from "@/lib/types/opportunities";
import {
  canonicalizeUrl,
  publisherDomain,
} from "@/lib/opportunities/verification";

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
const monthNumbers: Record<string, string> = {
  january: "01",
  jan: "01",
  february: "02",
  feb: "02",
  march: "03",
  mar: "03",
  april: "04",
  apr: "04",
  may: "05",
  june: "06",
  jun: "06",
  july: "07",
  jul: "07",
  august: "08",
  aug: "08",
  september: "09",
  sep: "09",
  october: "10",
  oct: "10",
  november: "11",
  nov: "11",
  december: "12",
  dec: "12",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function asDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function devpostDeadline(raw: Record<string, unknown>) {
  const explicitDeadline = asDate(raw.submission_deadline ?? raw.deadline);
  if (explicitDeadline) {
    return explicitDeadline;
  }

  const range = normalizeText(raw.submission_period_dates);
  const match = range.match(
    new RegExp(
      `^(${MONTHS})\\s+\\d{1,2}\\s*[-–]\\s*(?:(${MONTHS})\\s+)?(\\d{1,2}),\\s*(\\d{4})$`,
      "i",
    ),
  );
  if (!match) {
    return null;
  }

  const month = monthNumbers[(match[2] ?? match[1]).toLowerCase()];
  return month
    ? `${match[4]}-${month}-${String(match[3]).padStart(2, "0")}`
    : null;
}

function extractTags(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => {
      if (typeof value === "string") {
        return value;
      }

      if (value && typeof value === "object" && "name" in value) {
        return String(value.name);
      }

      return "";
    })
    .filter(Boolean)
    .slice(0, 12);
}

const devpostThemeMap: Record<string, string> = {
  "machine learning/ai": "artificial intelligence",
  "voice skills": "voice technology",
  "music/art": "creative technology",
  "open ended": "open innovation",
  "social good": "social impact",
  "low/no code": "low-code",
};

function normalizeDevpostThemes(values: unknown) {
  return extractTags(values).map((theme) => {
    const normalized = normalizeText(theme).toLowerCase();
    return devpostThemeMap[normalized] ?? normalized;
  });
}

function devpostLocation(raw: Record<string, unknown>) {
  const displayedLocation = raw.displayed_location;
  if (
    displayedLocation &&
    typeof displayedLocation === "object" &&
    "location" in displayedLocation
  ) {
    const location = normalizeText(displayedLocation.location);
    if (location) {
      return location;
    }
  }

  return normalizeText(raw.location) || "Global";
}

function isDevpostRemote(raw: Record<string, unknown>, location: string) {
  if (raw.online === true || raw.remote === true || raw.virtual === true) {
    return true;
  }

  return /\b(online|remote|virtual)\b/i.test(location);
}

function devpostBenefits(raw: Record<string, unknown>) {
  const prizeAmount = normalizeText(raw.prize_amount).replace(
    /^([$€£¥])\s+/,
    "$1",
  );
  const benefits = [
    prizeAmount ? `${prizeAmount} in listed prizes` : "Prizes",
    "Portfolio proof",
    "Community exposure",
  ];
  return benefits;
}

function devpostEligibility(raw: Record<string, unknown>) {
  if (raw.invite_only === true) {
    return [
      normalizeText(raw.eligibility_requirement_invite_only_description) ||
        "Invite-only participation. Review the official Devpost page for eligibility.",
    ];
  }

  return ["Review the official Devpost page for eligibility and rules."];
}

const blockedRemoteOkTitles = [
  /^all jobs?$/i,
  /^apply here$/i,
  /^general application$/i,
  /^expression of interest/i,
  /^open application/i,
  /^future opportunities$/i,
];

const technicalOrCreatorTags = new Set([
  "ai",
  "analytics",
  "backend",
  "content",
  "copywriting",
  "crypto",
  "css",
  "data",
  "design",
  "developer",
  "engineering",
  "figma",
  "frontend",
  "javascript",
  "marketing",
  "ml",
  "node",
  "python",
  "react",
  "security",
  "seo",
  "solidity",
  "typescript",
  "ux",
  "video",
  "web3",
  "wordpress",
]);

export function normalizeDevpostHackathon(raw: Record<string, unknown>): Opportunity | null {
  const title = normalizeText(raw.title ?? raw.name);
  const url = normalizeText(raw.url ?? raw.devpost_url);
  if (!title || !url) {
    return null;
  }

  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeUrl(url);
  } catch {
    return null;
  }

  const location = devpostLocation(raw);
  const remote = isDevpostRemote(raw, location);
  const organization = normalizeText(raw.organization_name ?? raw.organization) || "Devpost";
  const themes = normalizeDevpostThemes(raw.themes);
  const tags = [...new Set(["hackathon", ...themes])];
  const summary =
    normalizeText(raw.description ?? raw.tagline ?? raw.summary) ||
    `${title} is a ${remote ? "remote" : location} hackathon hosted by ${organization}${
      themes.length ? `, focused on ${themes.slice(0, 3).join(", ")}` : ""
    }.`;
  const stableId = normalizeText(raw.id) || slugify(canonicalUrl);

  return {
    id: `devpost-${stableId}`,
    title,
    organization,
    category: "hackathon",
    summary,
    sourceName: "Devpost API",
    sourceUrl: canonicalUrl,
    location,
    remote,
    deadline: devpostDeadline(raw),
    requiredSkills: ["project delivery", "team communication"],
    preferredSkills: themes.slice(0, 6),
    eligibility: devpostEligibility(raw),
    benefits: devpostBenefits(raw),
    tags,
    difficulty: "medium",
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

export function normalizeRemoteOkJob(raw: Record<string, unknown>): Opportunity | null {
  const position = String(raw.position ?? "").trim();
  const company = String(raw.company ?? "").trim();
  const url = String(raw.url ?? "").trim();
  if (!position || !company || !url) {
    return null;
  }

  if (blockedRemoteOkTitles.some((pattern) => pattern.test(position))) {
    return null;
  }

  const tags = extractTags(raw.tags).map((tag) => tag.toLowerCase());
  const joined = [position, company, tags.join(" ")].join(" ").toLowerCase();
  const hasRelevantSignal =
    tags.some((tag) => technicalOrCreatorTags.has(tag)) ||
    [...technicalOrCreatorTags].some((tag) => joined.includes(tag));

  if (!hasRelevantSignal) {
    return null;
  }

  const requiredSkills = tags.filter((tag) =>
    ["react", "typescript", "javascript", "python", "node", "nextjs", "solidity"].includes(
      tag,
    ),
  );

  return {
    id: `remoteok-${String(raw.id ?? slugify(`${company}-${position}`))}`,
    title: position,
    organization: company,
    category: "remote_job",
    summary: String(raw.description ?? `${position} at ${company}`).replace(/<[^>]+>/g, " ").trim(),
    sourceName: "RemoteOK API",
    sourceUrl: url,
    location: "Remote",
    remote: true,
    deadline: null,
    requiredSkills: requiredSkills.length ? requiredSkills : ["remote collaboration"],
    preferredSkills: tags.slice(0, 8),
    eligibility: ["Review the official job post for role requirements."],
    benefits: ["Paid remote role", "Professional experience"],
    tags: [...new Set(["remote", "job", ...tags])].slice(0, 12),
    difficulty: "high",
    verificationStatus: "unverified",
    lastVerifiedAt: null,
    lastSeenAt: null,
    sourceStatus: "unverified",
    httpStatus: null,
    canonicalUrl: canonicalizeUrl(url),
    publisherDomain: publisherDomain(url),
    isActive: true,
    verificationConfidence: 0,
  };
}
