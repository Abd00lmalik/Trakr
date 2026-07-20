import mammoth from "mammoth";
import type {
  ProfileEvidence,
  StructuredUserProfile,
} from "@/lib/types/opportunities";

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
  "Climate tech",
  "Fintech",
  "Research",
  "Statistics",
  "R",
  "Java",
  "C++",
  "Docker",
  "Kubernetes",
  "Git",
  "GitHub",
  "User research",
  "Prototyping",
  "Data visualization",
  "Grant writing",
  "Academic writing",
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
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ ]{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
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
    lower.includes("climate") ||
    lower.includes("sustainability") ||
    lower.includes("renewable")
      ? "Climate"
      : "",
    lower.includes("fintech") ||
    lower.includes("financial technology") ||
    lower.includes("payments")
      ? "Fintech"
      : "",
    lower.includes("research") || lower.includes("academic") ? "Research" : "",
    lower.includes("design") || lower.includes("figma") ? "Design" : "",
    lower.includes("cybersecurity") || lower.includes("infosec")
      ? "Cybersecurity"
      : "",
    lower.includes("open source") || lower.includes("github")
      ? "Open source"
      : "",
  ].filter(Boolean);
}

const experienceNumberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function statedYearsOfExperience(text: string) {
  const match = text
    .toLowerCase()
    .match(
      /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s+years?(?:\s+of)?(?:\s+[a-z-]+){0,4}\s+experience\b/,
    );
  if (!match) return undefined;
  return /^\d+$/.test(match[1])
    ? Number.parseInt(match[1], 10)
    : experienceNumberWords[match[1]];
}

export function inferExperienceLevelFromText(
  text: string,
): StructuredUserProfile["experienceLevel"] {
  const lower = text.toLowerCase();
  if (/\b(founder|co-founder|startup owner)\b/.test(lower)) return "founder";
  if (/\b(creator|content creator|video creator)\b/.test(lower)) return "creator";
  if (/\b(senior|staff|principal|lead engineer)\b/.test(lower)) return "senior";
  if (/\b(student|undergraduate|university|college)\b/.test(lower)) {
    return "student";
  }
  const years = statedYearsOfExperience(lower);
  if (years !== undefined && years >= 7) return "senior";
  if (
    /\b(mid-level|mid level)\b/.test(lower) ||
    (years !== undefined && years >= 3)
  ) {
    return "mid-level";
  }
  if (
    /\b(intern|internship|junior|graduate|early[- ]career)\b/.test(lower) ||
    (years !== undefined && years >= 1)
  ) {
    return "early-career";
  }
  return undefined;
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

function extractLabeledBlock(text: string, label: string, nextLabels: string[]) {
  const lines = text.split("\n");
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`^${escapedLabel}\\s*:?(?:\\s+(.*))?$`, "i");
  const nextHeadingPattern = new RegExp(
    `^(?:${nextLabels
      .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})\\s*:?(?:\\s+.*)?$`,
    "i",
  );
  const startIndex = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (startIndex >= 0) {
    const headingMatch = headingPattern.exec(lines[startIndex].trim());
    const entries = headingMatch?.[1] ? [headingMatch[1]] : [];
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (nextHeadingPattern.test(line)) break;
      entries.push(line);
    }
    const block = entries.filter(Boolean).join("\n").trim();
    if (block) return block;
  }

  const next = nextLabels
    .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const pattern = new RegExp(
    `(?:^|\\n|\\s)${escapedLabel}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${next})\\s*:|\\s+(?:${next})\\s*:|$)`,
    "i",
  );
  return pattern.exec(text)?.[1]?.trim() ?? "";
}

function extractSkills(block: string, text: string) {
  const explicitSkills = block
    .split(/\n|,|;|\||•|·/)
    .map((entry) =>
      entry
        .replace(/^[-*]\s*/, "")
        .replace(/^(?:languages|frameworks|tools|technologies)\s*:\s*/i, "")
        .trim(),
    )
    .filter(
      (entry) =>
        entry.length >= 1 &&
        entry.length <= 60 &&
        !/^(?:skills?|technical skills?)$/i.test(entry),
    );
  return [
    ...new Set([
      ...inferSkills(block || text),
      ...explicitSkills,
      ...inferSkills(text),
    ]),
  ].slice(0, 40);
}

function extractEntries(block: string) {
  if (!block) return [];
  const entries = block
    .split(/\n|(?<=\.)\s+(?=[-*])/)
    .map((entry) => entry.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  return entries.length ? entries.slice(0, 12) : [block];
}

function inferLocation(text: string) {
  const labeled = extractLabeledBlock(text, "Location", [
    "Summary",
    "Skills",
    "Experience",
    "Projects",
    "Education",
    "Certifications",
  ]);
  if (labeled) return labeled.split("\n")[0].trim();

  const match = text.match(
    /\b(?:based in|located in|living in|from|student in)\s+([A-Z][A-Za-z .'-]*?(?:,\s*[A-Z][A-Za-z .'-]*?)?)(?=[.;]|\s+(?:and|with|seeking|open|looking)\b|$)/i,
  );
  return match?.[1]?.trim().replace(/[.;]+$/, "");
}

function inferName(text: string) {
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  if (
    firstLine &&
    firstLine.length <= 80 &&
    /^[A-Za-z][A-Za-z .'-]+$/.test(firstLine) &&
    !roleSignals.some((role) => firstLine.toLowerCase().includes(role))
  ) {
    return firstLine;
  }
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

  return undefined;
}

function buildSummary(text: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24);
  const summary = sentences.slice(0, 3).join(" ");
  return (summary || text).slice(0, 480);
}

export type ProfileExtraction = {
  profile: StructuredUserProfile;
  evidence: ProfileEvidence[];
};

export function extractProfileFromText(
  text: string,
  origin: "resume" | "user" = "resume",
): ProfileExtraction {
  const cleaned = normalizeWhitespace(text);
  const allSkills = inferSkills(cleaned);
  const skillsBlock = extractLabeledBlock(cleaned, "Skills", [
    "Summary",
    "Experience",
    "Projects",
    "Education",
    "Certifications",
    "Location",
    "Goals",
  ]);
  const projects = extractEntries(
    extractLabeledBlock(cleaned, "Projects", [
      "Summary",
      "Skills",
      "Experience",
      "Education",
      "Certifications",
      "Location",
      "Goals",
    ]),
  );
  const workHistory = extractEntries(
    extractLabeledBlock(cleaned, "Experience", [
      "Summary",
      "Skills",
      "Projects",
      "Education",
      "Certifications",
      "Location",
      "Goals",
    ]),
  );
  const education = extractEntries(
    extractLabeledBlock(cleaned, "Education", [
      "Summary",
      "Skills",
      "Experience",
      "Projects",
      "Certifications",
      "Location",
      "Goals",
    ]),
  );
  const certifications = extractEntries(
    extractLabeledBlock(cleaned, "Certifications", [
      "Summary",
      "Skills",
      "Experience",
      "Projects",
      "Education",
      "Location",
      "Goals",
    ]),
  );
  const profile: StructuredUserProfile = {
    name: inferName(cleaned),
    headline: inferHeadline(cleaned, allSkills),
    bio: buildSummary(cleaned),
    location: inferLocation(cleaned),
    experienceLevel: inferExperienceLevelFromText(cleaned),
    skills: extractSkills(skillsBlock, cleaned),
    interests: inferInterests(cleaned),
    goals: inferGoals(cleaned),
    education,
    workHistory,
    projects,
    certifications,
    links: inferLinks(cleaned),
  };

  const explicitEvidenceFields = [
    "name",
    "location",
    "skills",
    "education",
    "workHistory",
    "projects",
    "certifications",
    "links",
  ];
  const evidence: ProfileEvidence[] = explicitEvidenceFields
    .filter((field) => {
      const value = profile[field as keyof StructuredUserProfile];
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    })
    .map((field) => ({
      field,
      source: "explicit" as const,
      origin,
      evidence: `Extracted from supplied ${origin === "resume" ? "resume text" : "user background"}.`,
    }));

  for (const [field, value, detail] of [
    [
      "bio",
      profile.bio,
      "Summarized from supplied text without adding new facts.",
    ],
    [
      "headline",
      profile.headline,
      "Inferred from role and skill language in supplied text.",
    ],
    [
      "experienceLevel",
      profile.experienceLevel,
      "Inferred from seniority, student, or experience language.",
    ],
    [
      "interests",
      profile.interests.length ? profile.interests : undefined,
      "Inferred from opportunity and domain language in supplied text.",
    ],
    [
      "goals",
      profile.goals.length ? profile.goals : undefined,
      "Inferred from stated opportunity preferences in supplied text.",
    ],
  ] as const) {
    if (value) {
      evidence.push({
        field,
        source: "inferred",
        origin: "inference",
        evidence: detail,
      });
    }
  }

  return { profile, evidence };
}

export function buildProfileDraftFromText(text: string): StructuredUserProfile {
  return extractProfileFromText(text).profile;
}

export function buildProfileDraftFromBackground(text: string) {
  return extractProfileFromText(text, "user");
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
