import mammoth from "mammoth";
import type { StructuredUserProfile } from "@/lib/types/opportunities";

const knownSkills = [
  "React",
  "TypeScript",
  "JavaScript",
  "Python",
  "Solidity",
  "Next.js",
  "Node.js",
  "PostgreSQL",
  "GraphQL",
  "API design",
  "Technical writing",
  "Open source",
  "Product management",
  "Data analysis",
  "Machine learning",
  "PyTorch",
  "TensorFlow",
  "SQL",
  "AWS",
  "Azure",
  "Figma",
  "Linux",
  "Cybersecurity",
  "AI",
  "Web3",
];

const roleSignals = [
  "machine learning engineer",
  "software engineer",
  "frontend developer",
  "front-end developer",
  "backend developer",
  "back-end developer",
  "full-stack developer",
  "full stack developer",
  "data scientist",
  "data engineer",
  "product designer",
  "product manager",
  "security engineer",
  "cybersecurity analyst",
  "content creator",
  "startup founder",
];

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function findSkillIndex(text: string, skill: string) {
  const escaped = skill
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`,
  ).exec(text);
  return match ? match.index + match[1].length : -1;
}

function inferSkills(text: string) {
  const lower = text.toLowerCase();
  return knownSkills
    .map((skill) => ({
      skill,
      index: findSkillIndex(lower, skill),
    }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index)
    .map(({ skill }) => skill);
}

function inferInterests(text: string) {
  const lower = text.toLowerCase();
  return [
    lower.includes("hackathon") ? "hackathons" : "",
    lower.includes("grant") ? "grants" : "",
    lower.includes("scholarship") ? "scholarships" : "",
    lower.includes("fellowship") ? "fellowships" : "",
    lower.includes("internship") ? "internships" : "",
    lower.includes("remote") ? "remote work" : "",
    lower.includes("web3") || lower.includes("blockchain") ? "web3" : "",
    /\bai\b/.test(lower) || lower.includes("machine learning") ? "AI" : "",
  ].filter(Boolean);
}

function inferExperienceLevel(
  text: string,
): StructuredUserProfile["experienceLevel"] {
  const lower = text.toLowerCase();
  if (/\b(founder|co-founder|startup owner)\b/.test(lower)) {
    return "founder";
  }
  if (/\b(creator|content creator|video creator)\b/.test(lower)) {
    return "creator";
  }
  if (/\b(senior|staff|principal|lead engineer)\b/.test(lower)) {
    return "senior";
  }
  if (/\b(student|undergraduate|university|college)\b/.test(lower)) {
    return "student";
  }
  if (/\b(mid-level|mid level|[3-6]\+? years)\b/.test(lower)) {
    return "mid-level";
  }
  if (/\b(intern|internship|junior|graduate|early career)\b/.test(lower)) {
    return "early-career";
  }
  return "early-career";
}

function inferGoals(text: string) {
  const lower = text.toLowerCase();
  return [
    lower.includes("hackathon") ? "Compete in hackathons" : "",
    lower.includes("grant") || lower.includes("funding")
      ? "Find grant funding"
      : "",
    lower.includes("fellowship") ? "Join a fellowship" : "",
    lower.includes("internship") ? "Find an internship" : "",
    lower.includes("remote") ? "Find remote opportunities" : "",
    lower.includes("open source") ? "Grow through open source" : "",
  ].filter(Boolean);
}

function inferLinks(text: string) {
  return [
    ...new Set(
      text.match(/https?:\/\/[^\s,;]+/gi)?.map((link) =>
        link.replace(/[.)]+$/, ""),
      ) ?? [],
    ),
  ].slice(0, 8);
}

function inferHeadline(text: string, skills: string[]) {
  const lower = text.toLowerCase();
  const role = roleSignals.find((signal) => lower.includes(signal));
  if (role) {
    return role
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  return skills.length
    ? `${skills.slice(0, 3).join(", ")} professional`
    : "Opportunity-seeking professional";
}

function buildSummary(text: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24);
  const summary = sentences.slice(0, 3).join(" ");
  return (summary || text).slice(0, 480);
}

export function buildProfileDraftFromText(text: string): StructuredUserProfile {
  const cleaned = normalizeWhitespace(text);
  const skills = inferSkills(cleaned);

  return {
    headline: inferHeadline(cleaned, skills),
    bio: buildSummary(cleaned),
    experienceLevel: inferExperienceLevel(cleaned),
    skills,
    interests: inferInterests(cleaned),
    goals: inferGoals(cleaned),
    education: [],
    workHistory: [],
    links: inferLinks(cleaned),
  };
}

export async function parseResumeFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type;
  const lowerName = file.name.toLowerCase();

  if (buffer.byteLength > 2_500_000) {
    throw new Error("Resume file is too large. Maximum supported size is 2.5 MB.");
  }

  if (contentType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return normalizeWhitespace(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeWhitespace(result.value);
  }

  if (contentType === "text/plain" || lowerName.endsWith(".txt")) {
    return normalizeWhitespace(buffer.toString("utf8"));
  }

  throw new Error("Unsupported resume type. Upload a PDF, DOCX, or TXT file.");
}
