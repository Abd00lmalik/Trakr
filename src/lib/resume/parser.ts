import mammoth from "mammoth";
import type {
  ProfileEvidence,
  StructuredUserProfile,
} from "@/lib/types/opportunities";
import { sanitizeUntrustedProfile } from "@/lib/security/untrusted-content";

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

const goalSectionLabels = [
  "Goal",
  "Goals",
  "Objective",
  "Objectives",
  "Career Objective",
];

const extendedEvidenceSectionLabels = [
  "Research",
  "Research Experience",
  "Publications",
  "Selected Publications",
  "Achievements",
  "Awards",
  "Honors",
  "Volunteer Experience",
  "Volunteering",
  "Leadership",
  "Leadership Experience",
];

const recognizedSectionLabels = [
  "Summary",
  "Profile",
  "Skills",
  "Technical Skills",
  "Experience",
  "Work Experience",
  "Employment",
  "Projects",
  "Education",
  "Certifications",
  "Location",
  "Interests",
  ...extendedEvidenceSectionLabels,
  ...goalSectionLabels,
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

function escapedAlternatives(values: string[]) {
  return values
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

function withoutAspirationalSections(text: string) {
  const goalHeadingPattern = new RegExp(
    `^(?:${escapedAlternatives(goalSectionLabels)})\\s*:?(?:\\s+.*)?$`,
    "i",
  );
  const sectionHeadingPattern = new RegExp(
    `^(?:${escapedAlternatives(recognizedSectionLabels)})\\s*:?(?:\\s+.*)?$`,
    "i",
  );
  let excluding = false;

  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (goalHeadingPattern.test(trimmed)) {
        excluding = true;
        return false;
      }
      if (sectionHeadingPattern.test(trimmed)) {
        excluding = false;
      }
      return !excluding;
    })
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

function hasNonNegatedPhrase(text: string, phrases: string[]) {
  const lower = text.toLowerCase();
  return phrases.some((phrase) => {
    const normalizedPhrase = phrase.toLowerCase();
    let startIndex = 0;
    while (startIndex < lower.length) {
      const index = lower.indexOf(normalizedPhrase, startIndex);
      if (index < 0) return false;
      const before = lower[index - 1] ?? " ";
      const after = lower[index + normalizedPhrase.length] ?? " ";
      const hasShortTokenBoundary =
        normalizedPhrase.length > 3 ||
        (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after));
      const prefix = lower.slice(Math.max(0, index - 64), index);
      if (
        hasShortTokenBoundary &&
        !/\b(?:not|never|exclude|excluding|without|do not|don't|no)\b[^.!?]{0,56}$/.test(
          prefix,
        )
      ) {
        return true;
      }
      startIndex = index + normalizedPhrase.length;
    }
    return false;
  });
}

function inferSkills(text: string) {
  const lower = text.toLowerCase();
  return knownSkills
    .map((skill) => ({
      skill,
      index: findSkillIndex(
        skill === "Research"
          ? lower.replace(/\buser research\b/g, "")
          : lower,
        skill,
      ),
    }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index)
    .map(({ skill }) => skill);
}

function inferInterests(text: string) {
  const researchText = text.replace(
    /\b(?:user|qualitative|market|applied|academic) research\b/gi,
    "",
  );
  return [
    hasNonNegatedPhrase(text, ["hackathon", "hackathons"])
      ? "hackathons"
      : "",
    hasNonNegatedPhrase(text, ["bounty", "bounties"]) ? "bounties" : "",
    hasNonNegatedPhrase(text, ["grant", "grants"]) ? "grants" : "",
    hasNonNegatedPhrase(text, ["scholarship", "scholarships"])
      ? "scholarships"
      : "",
    hasNonNegatedPhrase(text, ["fellowship", "fellowships"])
      ? "fellowships"
      : "",
    hasNonNegatedPhrase(text, ["internship", "internships"])
      ? "internships"
      : "",
    hasNonNegatedPhrase(text, ["remote"]) ? "remote work" : "",
    hasNonNegatedPhrase(text, ["web3", "blockchain"]) ? "web3" : "",
    hasNonNegatedPhrase(text, ["ai", "machine learning"]) ? "AI" : "",
    hasNonNegatedPhrase(text, [
      "climate",
      "sustainability",
      "renewable",
    ])
      ? "Climate"
      : "",
    hasNonNegatedPhrase(text, [
      "fintech",
      "financial technology",
      "payments",
    ])
      ? "Fintech"
      : "",
    hasNonNegatedPhrase(researchText, ["research", "researcher", "academic"])
      ? "Research"
      : "",
    hasNonNegatedPhrase(text, [
      "product design",
      "product designer",
      "ux",
      "ui",
      "figma",
      "design system",
      "design systems",
      "accessibility testing",
    ])
      ? "Design"
      : "",
    hasNonNegatedPhrase(text, ["cybersecurity", "infosec"])
      ? "Cybersecurity"
      : "",
    hasNonNegatedPhrase(text, ["open source", "github"])
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
      /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s+years?(?:(?:\s+of)?(?:\s+[a-z-]+){0,4}\s+experience|\s+(?:working\s+)?(?:in|as)\s+[a-z][^.;\n]{1,60})\b/,
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
  return [
    hasNonNegatedPhrase(text, ["hackathon", "hackathons"])
      ? "Compete in hackathons"
      : "",
    hasNonNegatedPhrase(text, ["bounty", "bounties"])
      ? "Find a Web3 bounty"
      : "",
    hasNonNegatedPhrase(text, ["grant", "grants", "funding"])
      ? "Find grant funding"
      : "",
    hasNonNegatedPhrase(text, ["fellowship", "fellowships"])
      ? "Join a fellowship"
      : "",
    hasNonNegatedPhrase(text, ["internship", "internships"])
      ? "Find an internship"
      : "",
    hasNonNegatedPhrase(text, [
      "job",
      "jobs",
      "role",
      "roles",
      "employment",
      "developer opportunities",
      "career opportunities",
    ])
      ? "Find a job"
      : "",
    hasNonNegatedPhrase(text, ["remote"]) ? "Find remote opportunities" : "",
    hasNonNegatedPhrase(text, ["open source"])
      ? "Grow through open source"
      : "",
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
  const headingPattern = new RegExp(
    `^${escapedLabel}(?:\\s*:\\s*(.*))?$`,
    "i",
  );
  const nextHeadingPattern = new RegExp(
    `^(?:${nextLabels
      .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})(?:\\s*:\\s*.*)?$`,
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

  const standaloneLocation = text
    .split("\n")
    .slice(0, 6)
    .map((line) =>
      line.match(
        /^([A-Z][A-Za-z .'-]{1,50},\s*[A-Z][A-Za-z .'-]{1,50})\s*$/,
      ),
    )
    .find(
      (match) =>
        match &&
        !inferSkills(match[1]).length &&
        !/\b(?:based|located|living|from|student|undergraduate|graduate|designer|developer|researcher|applicant|in)\b/i.test(
          match[1],
        ),
    )?.[1];
  if (standaloneLocation) return standaloneLocation.trim();

  const contactLineLocation = text
    .split("\n")
    .slice(0, 6)
    .map((line) =>
      line.match(
        /^([A-Z][A-Za-z .'-]{1,50},\s*[A-Z][A-Za-z .'-]{1,50})(?=\s*[|•·])/,
      ),
    )
    .find(Boolean)?.[1];
  if (contactLineLocation) return contactLineLocation.trim();

  const match = text.match(
    /\b(?:based in|located in|living in|from|student in|undergraduate in|graduate in|designer in|developer in|engineer in|researcher in|applicant in)\s+([A-Z][A-Za-z .'-]*?(?:,\s*[A-Z][A-Za-z .'-]*?)?)(?=[.;]|\s+(?:and|with|seeking|open|looking)\b|$)/i,
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

function inferHeadline(text: string) {
  const segments = text
    .split(/\n|(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const role of roleSignals) {
    const escapedRole = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const standaloneRole = new RegExp(`^${escapedRole}$`, "i");
    const currentRole = new RegExp(
      `\\b(?:i am|i'm|is|currently|work(?:ing)? as|works? as|serve(?:s|d)? as|role\\s*:|headline\\s*:)\\s+(?:an?\\s+)?${escapedRole}\\b`,
      "i",
    );
    if (
      segments.some(
        (segment) =>
          standaloneRole.test(segment) || currentRole.test(segment),
      )
    ) {
      return role
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }
  }

  return undefined;
}

function redactContactDetails(text: string) {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "")
    .replace(/https?:\/\/[^\s,;]+/gi, "")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "")
    .replace(/\s*[|•·]\s*$/g, "")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function buildSummary(text: string) {
  const sectionHeadingPattern = new RegExp(
    `^(?:${escapedAlternatives(recognizedSectionLabels)})\\s*:?$`,
    "i",
  );
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(redactContactDetails)
    .filter(
      (sentence) =>
        sentence.length >= 24 && !sectionHeadingPattern.test(sentence),
    );
  const summary = sentences.slice(0, 3).join(" ");
  return (summary || redactContactDetails(text)).slice(0, 480);
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
  const evidenceText = withoutAspirationalSections(cleaned);
  const goalText =
    goalSectionLabels
      .map((label) =>
        extractLabeledBlock(
          cleaned,
          label,
          recognizedSectionLabels.filter((item) => item !== label),
        ),
      )
      .find(Boolean) ?? cleaned;
  const skillsBlock = extractLabeledBlock(cleaned, "Skills", [
    "Summary",
    "Experience",
    "Projects",
    "Education",
    "Certifications",
    "Location",
    ...extendedEvidenceSectionLabels,
    ...goalSectionLabels,
  ]);
  const projects = extractEntries(
    extractLabeledBlock(cleaned, "Projects", [
      "Summary",
      "Skills",
      "Experience",
      "Education",
      "Certifications",
      "Location",
      ...extendedEvidenceSectionLabels,
      ...goalSectionLabels,
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
      ...extendedEvidenceSectionLabels,
      ...goalSectionLabels,
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
      ...extendedEvidenceSectionLabels,
      ...goalSectionLabels,
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
      ...extendedEvidenceSectionLabels,
      ...goalSectionLabels,
    ]),
  );
  const sectionEntries = (...labels: string[]) =>
    labels.flatMap((label) =>
      extractEntries(
        extractLabeledBlock(
          cleaned,
          label,
          recognizedSectionLabels.filter(
            (recognized) =>
              !labels.some(
                (candidate) =>
                  candidate.toLowerCase() === recognized.toLowerCase(),
              ),
          ),
        ),
      ),
    );
  const research = sectionEntries("Research", "Research Experience");
  const publications = sectionEntries(
    "Publications",
    "Selected Publications",
  );
  const achievements = sectionEntries("Achievements");
  const awards = sectionEntries("Awards", "Honors");
  const volunteerExperience = sectionEntries(
    "Volunteer Experience",
    "Volunteering",
  );
  const leadership = sectionEntries("Leadership", "Leadership Experience");
  const profile = sanitizeUntrustedProfile({
    name: inferName(cleaned),
    headline: inferHeadline(evidenceText),
    bio: buildSummary(evidenceText),
    location: inferLocation(cleaned),
    experienceLevel: inferExperienceLevelFromText(evidenceText),
    skills: extractSkills(skillsBlock, evidenceText),
    interests: inferInterests(cleaned),
    goals: inferGoals(goalText),
    education,
    workHistory,
    projects,
    research,
    publications,
    achievements,
    awards,
    volunteerExperience,
    leadership,
    certifications,
    links: inferLinks(cleaned),
  }) as StructuredUserProfile;

  const explicitEvidenceFields = [
    "name",
    "location",
    "skills",
    "education",
    "workHistory",
    "projects",
    "research",
    "publications",
    "achievements",
    "awards",
    "volunteerExperience",
    "leadership",
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
      value: profile[field as keyof StructuredUserProfile] as
        | string
        | string[],
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
        value: value as string | string[],
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

function validateResumeSignature(
  buffer: Buffer,
  contentType: string,
  lowerName: string,
) {
  if (buffer.byteLength > 2_500_000) {
    throw new Error("Resume file is too large. Maximum supported size is 2.5 MB.");
  }

  const isPdf =
    contentType === "application/pdf" || lowerName.endsWith(".pdf");
  const isDocx =
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx");
  const isText = contentType === "text/plain" || lowerName.endsWith(".txt");

  if (isPdf && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("The supplied PDF does not have a valid PDF signature.");
  }
  if (
    isDocx &&
    !buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  ) {
    throw new Error("The supplied DOCX does not have a valid ZIP document signature.");
  }
  if (
    isText &&
    buffer.subarray(0, 2).some((value) => value === 0) &&
    !buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe])) &&
    !buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))
  ) {
    throw new Error("The supplied text document appears to contain binary content.");
  }

  if (!isPdf && !isDocx && !isText) {
    throw new Error("Unsupported resume type. Upload a PDF, DOCX, or TXT file.");
  }

  return { isPdf, isDocx, isText };
}

export async function parseResumeBuffer(
  buffer: Buffer,
  options: {
    contentType: string;
    fileName: string;
  },
) {
  const contentType = options.contentType;
  const lowerName = options.fileName.toLowerCase();
  const kind = validateResumeSignature(buffer, contentType, lowerName);

  if (kind.isPdf) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return normalizeWhitespace(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (kind.isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeWhitespace(result.value);
  }

  if (kind.isText) {
    return normalizeWhitespace(buffer.toString("utf8"));
  }

  throw new Error("Unsupported resume type. Upload a PDF, DOCX, or TXT file.");
}

export async function parseResumeFile(file: File) {
  return parseResumeBuffer(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    fileName: file.name,
  });
}
