import type { Opportunity } from "@/lib/types/opportunities";
import {
  canonicalizeUrl,
  publisherDomain,
} from "@/lib/opportunities/verification";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
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
  const title = String(raw.title ?? raw.name ?? "").trim();
  const url = String(raw.url ?? raw.devpost_url ?? "").trim();
  if (!title || !url) {
    return null;
  }

  const themes = extractTags(raw.themes);
  const tags = [...new Set(["hackathon", ...themes])];
  const summary = String(raw.description ?? raw.tagline ?? raw.summary ?? title).trim();

  return {
    id: `devpost-${slugify(title)}`,
    title,
    organization: "Devpost",
    category: "hackathon",
    summary,
    sourceName: "Devpost API",
    sourceUrl: url,
    location: String(raw.location ?? "Global"),
    remote: String(raw.location ?? "").toLowerCase().includes("online") || true,
    deadline: asDate(raw.submission_deadline ?? raw.deadline),
    requiredSkills: ["project delivery", "team communication"],
    preferredSkills: themes.slice(0, 6),
    eligibility: ["Review the official Devpost page for eligibility and rules."],
    benefits: ["Prizes", "Portfolio proof", "Community exposure"],
    tags,
    difficulty: "medium",
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
