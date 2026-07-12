import { PDFParse } from "pdf-parse";
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
  "AI",
  "Web3",
];

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function inferSkills(text: string) {
  const lower = text.toLowerCase();
  return knownSkills.filter((skill) => lower.includes(skill.toLowerCase()));
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
    lower.includes("ai") || lower.includes("machine learning") ? "AI" : "",
  ].filter(Boolean);
}

export function buildProfileDraftFromText(text: string): StructuredUserProfile {
  const cleaned = normalizeWhitespace(text);
  const headline = cleaned.split(/[.!?]/)[0]?.slice(0, 160);

  return {
    headline: headline || "Resume profile",
    bio: cleaned.slice(0, 800),
    skills: inferSkills(cleaned),
    interests: inferInterests(cleaned),
    goals: [],
    education: [],
    workHistory: [],
    links: [],
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
