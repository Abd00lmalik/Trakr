import { createHash } from "node:crypto";
import { buildNextSteps } from "@/lib/recommendation/action-plan";
import {
  compactProfileForSession,
  compactTargetForSession,
} from "@/lib/companion/session";
import type {
  CompanionTarget,
  Opportunity,
  OpportunityCompanionRequest,
  ProfileEvidence,
  ResumeBenchmarkReference,
  ScoredOpportunity,
  StructuredUserProfile,
} from "@/lib/types/opportunities";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ").trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

const instructionLikeContent =
  /\b(ignore (?:all |any )?(?:previous|prior|system) instructions?|system prompt|developer message|override (?:the )?(?:rules|instructions)|exfiltrat(?:e|ion)|reveal (?:the )?(?:system|hidden|private)|send (?:the )?(?:user|resume|cv|profile|personal) (?:data|information|details)|upload (?:the )?(?:user|resume|cv|profile)|leak (?:the )?(?:user|resume|cv|profile))\b/i;

function safeEvidenceValues(values: string[]) {
  return values.filter((value) => !instructionLikeContent.test(value));
}

function safeTargetText(value: string) {
  return instructionLikeContent.test(value) ? "" : value;
}

function eligibilityConcerns(opportunity: Opportunity) {
  const concerns = opportunity.eligibility
    .slice(0, 4)
    .map((rule) => `Confirm eligibility: ${rule}`);
  if (opportunity.verificationStatus !== "verified") {
    concerns.unshift("The source is not a verified direct application page.");
  }
  if (!opportunity.isActive) {
    concerns.unshift("The opportunity is not currently active.");
  }
  return concerns;
}

function confidenceScore(
  candidate: ScoredOpportunity,
  completeness: number,
) {
  return Math.round(
    Math.min(
      100,
      candidate.score * 0.55 +
        candidate.qualityScore * 0.25 +
        candidate.opportunity.verificationConfidence * 10 +
        completeness * 0.1,
    ),
  );
}

export function buildOpportunityExplanation(
  candidate: ScoredOpportunity,
  completeness: number,
) {
  return {
    opportunityId: candidate.opportunity.id,
    opportunityTitle: candidate.opportunity.title,
    matchScore: candidate.score,
    confidenceScore: confidenceScore(candidate, completeness),
    whyItMatches: candidate.matchedSignals.slice(0, 6),
    gaps: candidate.missingRequirements.slice(0, 6),
    eligibilityConcerns: eligibilityConcerns(candidate.opportunity),
    recommendedAction: candidate.action,
    nextSteps: buildNextSteps(candidate),
  };
}
function evidenceAssessment(profile: StructuredUserProfile) {
  const results: string[] = [];
  if (profile.workHistory.length) {
    results.push("Work history evidence is present.");
  } else {
    results.push("No work history evidence was provided.");
  }
  if (profile.projects.length) {
    results.push("Project evidence is present.");
  } else {
    results.push("No project evidence was provided.");
  }
  if (profile.links.length) {
    results.push("Portfolio or public proof links are present.");
  } else {
    results.push("No portfolio, GitHub, or public proof link was provided.");
  }
  if (profile.education.length) {
    results.push("Education context is present.");
  }
  return results;
}

export function buildReadinessAssessment(
  candidate: ScoredOpportunity,
  profile: StructuredUserProfile,
) {
  const concerns = eligibilityConcerns(candidate.opportunity);
  const evidence = evidenceAssessment(profile);
  const evidencePenalty =
    (profile.workHistory.length ? 0 : 8) + (profile.links.length ? 0 : 8);
  const readinessScore = Math.max(
    0,
    Math.min(
      100,
      candidate.score -
        candidate.missingRequirements.length * 4 -
        evidencePenalty,
    ),
  );
  const readinessLevel =
    readinessScore >= 78
      ? ("ready" as const)
      : readinessScore >= 58
        ? ("nearly_ready" as const)
        : ("needs_preparation" as const);
  const eligibilityStatus =
    !candidate.opportunity.isActive
      ? ("concern" as const)
      : concerns.length
        ? ("needs_confirmation" as const)
        : ("likely_eligible" as const);

  return {
    opportunityId: candidate.opportunity.id,
    opportunityTitle: candidate.opportunity.title,
    readinessScore,
    readinessLevel,
    strengths: candidate.matchedSignals.slice(0, 6),
    gaps: candidate.missingRequirements.slice(0, 6),
    eligibilityStatus,
    eligibilityConcerns: concerns,
    evidenceAssessment: evidence,
    nextActions: [
      ...candidate.missingRequirements
        .slice(0, 3)
        .map((gap) => `Add truthful evidence or close the gap for ${gap}.`),
      profile.links.length
        ? "Lead with the strongest relevant portfolio proof."
        : "Add a portfolio, GitHub, project, or writing sample that proves the strongest claimed skill.",
      "Confirm every eligibility rule on the official source before applying.",
    ],
  };
}

function keywordSet(values: string[]) {
  return [
    ...new Set(
      values
        .flatMap((value) => normalize(value).split(/\s+/))
        .filter((value) => value.length > 2),
    ),
  ];
}

export const RESUME_RUBRIC_VERSION = "resume-rubric-2026-07-20";

type RequirementImportance = "required" | "preferred" | "instruction" | "context";
type RequirementCategory =
  | "eligibility"
  | "skill"
  | "experience"
  | "education"
  | "portfolio"
  | "achievement"
  | "instruction"
  | "other";

type TargetRequirement = {
  id: string;
  text: string;
  importance: RequirementImportance;
  category: RequirementCategory;
};

function fingerprint(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("base64url")
    .slice(0, 32);
}

function resumeTarget(
  request: OpportunityCompanionRequest,
  opportunity: Opportunity | null,
) {
  return (
    opportunity?.title ??
    request.target?.role ??
    request.target?.industry ??
    "the selected opportunity"
  );
}

function targetType(
  request: OpportunityCompanionRequest,
  opportunity: Opportunity | null,
) {
  return (
    opportunity?.category ??
    request.target?.opportunityType ??
    (request.target?.role ? "role" : "general_goal")
  );
}

function targetConfidence(
  request: OpportunityCompanionRequest,
  opportunity: Opportunity | null,
) {
  if (opportunity || (request.target?.description && request.target.requirements?.length)) {
    return "high" as const;
  }
  if (
    request.target?.description ||
    request.target?.requirements?.length ||
    (request.target?.role && request.target?.industry)
  ) {
    return "medium" as const;
  }
  return "low" as const;
}

function requirementCategory(text: string): RequirementCategory {
  const value = normalize(text);
  if (
    /\b(eligible|eligibility|citizen|citizenship|resident|residency|visa|work authorization|located|based in|age|enrolled)\b/.test(
      value,
    )
  ) {
    return "eligibility";
  }
  if (/\b(degree|bachelor|master|phd|education|gpa|student)\b/.test(value)) {
    return "education";
  }
  if (/\b(years? of experience|senior|lead|manager|professional experience)\b/.test(value)) {
    return "experience";
  }
  if (/\b(submit|format|page|deadline|file|pdf|cover letter|statement)\b/.test(value)) {
    return "instruction";
  }
  if (/\b(portfolio|github|publication|writing sample|work sample)\b/.test(value)) {
    return "portfolio";
  }
  if (/\b(achievement|impact|metric|outcome|award|publication)\b/.test(value)) {
    return "achievement";
  }
  if (keywordSet([text]).length <= 5) return "skill";
  return "other";
}

function requirementImportance(text: string): RequirementImportance {
  const value = normalize(text);
  if (/\b(preferred|nice to have|bonus|desirable)\b/.test(value)) {
    return "preferred";
  }
  if (requirementCategory(text) === "instruction") return "instruction";
  if (/\b(required|must|minimum|need to|eligible|only)\b/.test(value)) {
    return "required";
  }
  return "context";
}

function requirementList(
  request: OpportunityCompanionRequest,
  opportunity: Opportunity | null,
) {
  const values: Array<{ text: string; importance?: RequirementImportance; category?: RequirementCategory }> = [];
  if (opportunity) {
    values.push(
      ...opportunity.eligibility.map((text) => ({
        text,
        importance: "required" as const,
        category: "eligibility" as const,
      })),
      ...opportunity.requiredSkills.map((text) => ({
        text,
        importance: "required" as const,
        category: "skill" as const,
      })),
      ...opportunity.preferredSkills.map((text) => ({
        text,
        importance: "preferred" as const,
        category: "skill" as const,
      })),
    );
  }
  values.push(
    ...(request.target?.requirements ?? [])
      .map(safeTargetText)
      .filter(Boolean)
      .map((text) => ({ text })),
  );
  const description = request.target?.description;
  if (description) {
    values.push(
      ...safeTargetText(description)
        .split(/\r?\n|(?<=[.!?])\s+/)
        .map((text) => text.replace(/^[-*]\s*/, "").trim())
        .filter(
          (text) =>
            text.length >= 8 &&
            /\b(required|must|minimum|preferred|eligible|experience|degree|skills?|portfolio|submit|application)\b/i.test(
              text,
            ),
        )
        .slice(0, 24)
        .map((text) => ({ text })),
    );
  }
  const targetText = normalize(
    [
      request.target?.role,
      request.target?.industry,
      request.target?.opportunityType,
      opportunity?.title,
      opportunity?.category,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const contextualExpectations: string[] = [];
  if (/\b(design|ux|ui|graphic|creative)\b/.test(targetText)) {
    contextualExpectations.push(
      "Target-relevant portfolio or work-sample evidence where appropriate.",
    );
  }
  if (/\b(research|academic|phd|fellowship|grant)\b/.test(targetText)) {
    contextualExpectations.push(
      "Relevant research methods, outputs, publications, writing, or funded-project evidence where appropriate.",
    );
  }
  if (/\b(scholarship|fellowship)\b/.test(targetText)) {
    contextualExpectations.push(
      "Evidence connected to the published academic, leadership, service, or mission criteria.",
    );
  }
  if (/\b(hackathon|competition|challenge)\b/.test(targetText)) {
    contextualExpectations.push(
      "Relevant project, prototype, team, or technical evidence for the challenge.",
    );
  }
  if (/\b(senior|staff|principal|lead|director|head)\b/.test(targetText)) {
    contextualExpectations.push(
      "Evidence of scope, leadership, decision-making, and outcomes appropriate to seniority.",
    );
  }
  values.push(
    ...contextualExpectations.map((text) => ({
      text,
      importance: "context" as const,
      category: requirementCategory(text),
    })),
  );
  if (!values.length) {
    values.push(
      ...keywordSet([
        request.target?.role ?? "",
        request.target?.industry ?? "",
      ]).map((text) => ({
        text,
        importance: "context" as const,
        category: "skill" as const,
      })),
    );
  }

  const seen = new Set<string>();
  return values
    .filter(({ text }) => {
      const key = normalize(text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40)
    .map<TargetRequirement>(({ text, importance, category }, index) => ({
      id: `req_${index + 1}_${fingerprint(text).slice(0, 8)}`,
      text,
      importance: importance ?? requirementImportance(text),
      category: category ?? requirementCategory(text),
    }));
}

function profileEvidenceEntries(
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
) {
  const entries: Array<{
    field: string;
    value: string;
    claimId?: string;
    source: ProfileEvidence["source"];
  }> = [];
  const profileFields = [
    "headline",
    "bio",
    "skills",
    "education",
    "workHistory",
    "projects",
    "certifications",
    "links",
    "location",
    "experienceLevel",
  ];

  for (const item of evidence) {
    if (
      !profileFields.includes(item.field) ||
      !(item.allowedUse ?? []).includes("assessment")
    ) {
      continue;
    }
    const rawValue =
      item.value ??
      profile[item.field as keyof StructuredUserProfile];
    const values =
      typeof rawValue === "string"
        ? [rawValue]
        : Array.isArray(rawValue)
          ? rawValue
          : [];
    for (const value of safeEvidenceValues(values)) {
      entries.push({
        field: item.field,
        value,
        claimId: item.claimId,
        source: item.source,
      });
    }
  }

  return entries;
}

function statedYears(values: string[]) {
  const match = values
    .join(" ")
    .match(/\b(\d{1,2})\+?\s+years?(?:\s+of)?\s+(?:relevant\s+)?experience\b/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function evidenceContradictions(
  entries: ReturnType<typeof profileEvidenceEntries>,
) {
  const contradictions = new Map<string, string>();
  for (const field of ["location", "experienceLevel"] as const) {
    const values = uniqueStrings(
      entries
        .filter(
          (entry) => entry.field === field && entry.source === "explicit",
        )
        .map((entry) => entry.value),
    );
    if (values.length > 1) {
      contradictions.set(
        field,
        `Conflicting ${field === "experienceLevel" ? "experience-level" : field} evidence was supplied: ${values.join(" versus ")}.`,
      );
    }
  }
  const reversedDate = entries.find(
    (entry) =>
      ["workHistory", "projects", "education"].includes(entry.field) &&
      /\b(20\d{2}|19\d{2})\s*[-–]\s*(20\d{2}|19\d{2})\b/.test(entry.value) &&
      (() => {
        const match = entry.value.match(
          /\b(20\d{2}|19\d{2})\s*[-–]\s*(20\d{2}|19\d{2})\b/,
        );
        return Boolean(match && Number(match[1]) > Number(match[2]));
      })(),
  );
  if (reversedDate) {
    contradictions.set(
      "timeline",
      `A supplied timeline appears reversed or contradictory: ${reversedDate.value}`,
    );
  }
  return contradictions;
}

function explicitEligibilityFailure(
  requirement: TargetRequirement,
  profile: StructuredUserProfile,
  profileValues: string[],
) {
  const text = normalize(requirement.text);
  const yearsRequired = text.match(/\b(\d{1,2})\+?\s+years?/);
  const suppliedYears = statedYears(profileValues);
  if (
    yearsRequired &&
    suppliedYears !== undefined &&
    suppliedYears < Number.parseInt(yearsRequired[1], 10)
  ) {
    return `The target requires ${yearsRequired[1]} years, while the supplied evidence states ${suppliedYears}.`;
  }
  if (
    /\b(senior|staff|principal|lead)\b/.test(text) &&
    ["student", "beginner", "early-career"].includes(
      profile.experienceLevel ?? "",
    )
  ) {
    return "The target explicitly requires senior scope, while the supplied experience stage is early career.";
  }
  const locationRules = [
    ["united states", /\b(united states|usa|u\.s\.)\b/i],
    ["united kingdom", /\b(united kingdom|uk|u\.k\.)\b/i],
    ["canada", /\bcanada\b/i],
    ["nigeria", /\bnigeria\b/i],
  ] as const;
  if (profile.location && /\b(only|must be based|resident|residents)\b/.test(text)) {
    for (const [label, pattern] of locationRules) {
      if (pattern.test(requirement.text) && !pattern.test(profile.location)) {
        return `The target is restricted to ${label}, while the supplied location is ${profile.location}.`;
      }
    }
  }
  return undefined;
}

function requirementAssessment(
  requirement: TargetRequirement,
  profile: StructuredUserProfile,
  entries: ReturnType<typeof profileEvidenceEntries>,
  contradictions: Map<string, string>,
) {
  const allValues = entries.map((entry) => entry.value);
  const contradiction =
    requirement.category === "eligibility"
      ? contradictions.get("location") ??
        contradictions.get("experienceLevel")
      : requirement.category === "experience"
        ? contradictions.get("experienceLevel") ??
          contradictions.get("timeline")
        : undefined;
  if (contradiction) {
    return {
      id: requirement.id,
      requirement: requirement.text,
      importance: requirement.importance,
      category: requirement.category,
      status: "contradictory" as const,
      evidence: [],
      evidenceClaimIds: [],
      confidence: 0.9,
      score: 20,
      explanation: contradiction,
      actions: [
        "Resolve the conflicting facts before presenting this requirement as satisfied.",
      ],
    };
  }
  const failure = explicitEligibilityFailure(requirement, profile, allValues);
  if (failure) {
    return {
      id: requirement.id,
      requirement: requirement.text,
      importance: requirement.importance,
      category: requirement.category,
      status: "not_met" as const,
      evidence: [],
      evidenceClaimIds: [],
      confidence: 0.95,
      score: 0,
      explanation: failure,
      actions: ["Do not imply that this requirement is met. Confirm whether the target permits an exception or choose a compatible target."],
    };
  }
  const requirementTokens = keywordSet([requirement.text]).filter(
    (token) =>
      !["required", "preferred", "experience", "candidate", "applicant", "ability", "skills"].includes(token),
  );
  const matches = entries.flatMap((entry) =>
    [entry]
      .filter(({ value }) => {
        const normalized = normalize(value);
        const tokenMatches = requirementTokens.filter((token) =>
          normalized.includes(token),
        );
        return (
          normalized.includes(normalize(requirement.text)) ||
          tokenMatches.length >= Math.min(2, Math.max(1, requirementTokens.length))
        );
      })
      .map((item) => ({
        value: item.value,
        claimIds: item.claimId ? [item.claimId] : [],
        source: item.source,
      })),
  );
  if (matches.length) {
    const source =
      matches.some((item) => item.source === "explicit")
        ? ("confirmed" as const)
        : matches.some((item) => item.source === "inferred")
          ? ("inferred" as const)
          : ("unverified" as const);
    return {
      id: requirement.id,
      requirement: requirement.text,
      importance: requirement.importance,
      category: requirement.category,
      status: source,
      evidence: uniqueStrings(matches.map((item) => item.value)).slice(0, 4),
      evidenceClaimIds: uniqueStrings(matches.flatMap((item) => item.claimIds)),
      confidence: 0.9,
      score: 100,
      explanation: "Supplied profile or resume evidence directly supports this requirement.",
      actions: ["Keep the strongest relevant evidence close to this requirement in the application document."],
    };
  }
  const status =
    requirement.importance === "required" ? ("missing" as const) : ("unverified" as const);
  return {
    id: requirement.id,
    requirement: requirement.text,
    importance: requirement.importance,
    category: requirement.category,
    status,
    evidence: [],
    evidenceClaimIds: [],
    confidence: 0.8,
    score: status === "missing" ? 0 : 35,
    explanation:
      status === "missing"
        ? "No supplied evidence demonstrates this required item."
        : "The supplied evidence does not confirm this item.",
    actions: [
      `Add this only if the user can provide genuine evidence: ${requirement.text}`,
    ],
  };
}

function average(values: number[], fallback = 50) {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : fallback;
}

function claimIdsFor(evidence: ProfileEvidence[], fields: string[]) {
  return uniqueStrings(
    evidence
      .filter((item) => fields.includes(item.field))
      .map((item) => item.claimId)
      .filter((value): value is string => Boolean(value)),
  );
}

function optimizationValues(
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
  field: keyof StructuredUserProfile,
) {
  const values = evidence
    .filter(
      (item) =>
        item.field === field &&
        item.source === "explicit" &&
        item.confirmed !== false &&
        (item.allowedUse ?? []).includes("optimization"),
    )
    .flatMap((item) => {
      const value = item.value ?? profile[field];
      return typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value
          : [];
    });
  return safeEvidenceValues(uniqueStrings(values));
}

function optimizationProfile(
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
): StructuredUserProfile {
  const scalar = (
    field: "headline" | "bio" | "location" | "timezone",
  ) => optimizationValues(profile, evidence, field).at(-1);
  return {
    name: optimizationValues(profile, evidence, "name").at(-1),
    headline: scalar("headline"),
    bio: scalar("bio"),
    location: scalar("location"),
    timezone: scalar("timezone"),
    experienceLevel: profile.experienceLevel,
    skills: optimizationValues(profile, evidence, "skills"),
    interests: optimizationValues(profile, evidence, "interests"),
    goals: optimizationValues(profile, evidence, "goals"),
    education: optimizationValues(profile, evidence, "education"),
    workHistory: optimizationValues(profile, evidence, "workHistory"),
    projects: optimizationValues(profile, evidence, "projects"),
    certifications: optimizationValues(profile, evidence, "certifications"),
    links: optimizationValues(profile, evidence, "links"),
  };
}

function optimizationClaimIds(evidence: ProfileEvidence[], fields: string[]) {
  return uniqueStrings(
    evidence
      .filter(
        (item) =>
          fields.includes(item.field) &&
          item.source === "explicit" &&
          item.confirmed !== false &&
          (item.allowedUse ?? []).includes("optimization"),
      )
      .map((item) => item.claimId)
      .filter((value): value is string => Boolean(value)),
  );
}

function parseabilityScore(profile: StructuredUserProfile) {
  return Math.min(
    100,
    35 +
      (profile.headline ? 10 : 0) +
      (profile.skills.length ? 15 : 0) +
      (profile.workHistory.length ? 15 : 0) +
      (profile.projects.length ? 10 : 0) +
      (profile.education.length ? 10 : 0) +
      (profile.links.length ? 5 : 0),
  );
}

export function buildResumeBenchmark(
  request: OpportunityCompanionRequest,
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
  opportunity: Opportunity | null,
) {
  const target = resumeTarget(request, opportunity);
  const requirements = requirementList(request, opportunity);
  const entries = profileEvidenceEntries(profile, evidence);
  const contradictions = evidenceContradictions(entries);
  const assessments = requirements.map((requirement) =>
    requirementAssessment(requirement, profile, entries, contradictions),
  );
  const required = assessments.filter((item) => item.importance === "required");
  const preferred = assessments.filter((item) => item.importance === "preferred");
  const failures = assessments
    .filter((item) => item.status === "not_met")
    .map((item) => item.explanation);
  const unknowns = assessments
    .filter((item) =>
      ["missing", "unverified", "inferred", "contradictory"].includes(
        item.status,
      ),
    )
    .map((item) => item.requirement);
  const requiredScore = average(required.map((item) => item.score), 65);
  const preferredScore = average(preferred.map((item) => item.score), 60);
  const evidenceStrength = Math.min(
    100,
    (profile.workHistory.length ? 30 : 0) +
      (profile.projects.length ? 25 : 0) +
      (profile.links.length ? 15 : 0) +
      (profile.education.length ? 15 : 0) +
      (profile.certifications.length ? 10 : 0),
  );
  const accomplishmentScore = Math.min(
    100,
    [...profile.workHistory, ...profile.projects].filter((item) =>
      /\b(\d+|%|increased|reduced|improved|built|launched|published|led|delivered)\b/i.test(
        item,
      ),
    ).length * 20,
  );
  const parseability = parseabilityScore(profile);
  const terminologyScore = average(
    assessments
      .filter((item) => item.category === "skill")
      .map((item) => item.score),
    55,
  );
  const instructionScore = average(
    assessments
      .filter((item) => item.importance === "instruction")
      .map((item) => item.score),
    70,
  );
  let overallAlignmentScore = Math.round(
    requiredScore * 0.35 +
      preferredScore * 0.1 +
      evidenceStrength * 0.2 +
      accomplishmentScore * 0.1 +
      parseability * 0.1 +
      terminologyScore * 0.1 +
      instructionScore * 0.05,
  );
  if (failures.length) overallAlignmentScore = Math.min(overallAlignmentScore, 45);
  const matchedKeywords = uniqueStrings(
    assessments
      .filter((item) => item.status === "confirmed")
      .map((item) => item.requirement),
  );
  const missingKeywords = uniqueStrings(
    assessments
      .filter((item) => item.status !== "confirmed")
      .map((item) => item.requirement),
  );
  const benchmarkId = `bench_${fingerprint({
    requirements: assessments.map((item) => [item.requirement, item.status]),
    profile: compactProfileForSession(profile),
    rubric: RESUME_RUBRIC_VERSION,
    canonicalTarget: compactTargetForSession(request.target),
  })}`;
  const dimensions = [
    {
      id: "eligibility",
      label: "Basic eligibility",
      score: failures.length ? 0 : unknowns.length ? 60 : 100,
      confidence: failures.length ? 0.95 : 0.75,
      explanation: failures.length
        ? "At least one explicit eligibility or experience requirement is not met."
        : unknowns.length
          ? "No hard failure is proven, but some requirements remain unverified."
          : "Supplied evidence supports the evaluated eligibility requirements.",
      requirementIds: assessments
        .filter((item) => item.category === "eligibility")
        .map((item) => item.id),
      evidenceClaimIds: claimIdsFor(evidence, ["location", "experienceLevel", "education"]),
      actions: failures.length
        ? ["Do not hide the eligibility failure inside the average score."]
        : ["Confirm all eligibility rules on the official target page."],
    },
    {
      id: "required_alignment",
      label: "Required qualification alignment",
      score: requiredScore,
      confidence: required.length ? 0.85 : 0.5,
      explanation: `${required.filter((item) => item.status === "confirmed").length} of ${required.length} required items have supplied supporting evidence.`,
      requirementIds: required.map((item) => item.id),
      evidenceClaimIds: uniqueStrings(required.flatMap((item) => item.evidenceClaimIds)),
      actions: required
        .filter((item) => item.status !== "confirmed")
        .slice(0, 3)
        .map((item) => `Verify or address: ${item.requirement}`),
    },
    {
      id: "evidence_strength",
      label: "Strength of evidence",
      score: evidenceStrength,
      confidence: 0.9,
      explanation: "Measures whether claims are supported by work, projects, education, certifications, and public proof.",
      requirementIds: [],
      evidenceClaimIds: claimIdsFor(evidence, ["workHistory", "projects", "education", "certifications", "links"]),
      actions: profile.links.length
        ? ["Prioritize the strongest target-relevant proof."]
        : ["Add a genuine portfolio, publication, GitHub, writing sample, or project link when relevant."],
    },
    {
      id: "accomplishments",
      label: "Accomplishments and demonstrated outcomes",
      score: accomplishmentScore,
      confidence: 0.8,
      explanation: "Rewards supplied action and outcome evidence; missing metrics are not invented.",
      requirementIds: [],
      evidenceClaimIds: claimIdsFor(evidence, ["workHistory", "projects"]),
      actions: ["Add real scope, outcome, or metric only when the user can verify it."],
    },
    {
      id: "structure",
      label: "Structure and machine readability",
      score: parseability,
      confidence: 0.75,
      explanation: "A transparent document-structure heuristic, not a prediction about any ATS or employer.",
      requirementIds: [],
      evidenceClaimIds: [],
      actions: ["Use clear section headings, conventional chronology, readable text, and the target's requested file format."],
    },
    {
      id: "terminology",
      label: "Target terminology alignment",
      score: terminologyScore,
      confidence: requirements.length ? 0.8 : 0.45,
      explanation: "Checks whether supported target terminology appears in supplied evidence without keyword stuffing.",
      requirementIds: assessments
        .filter((item) => item.category === "skill")
        .map((item) => item.id),
      evidenceClaimIds: claimIdsFor(evidence, ["skills", "workHistory", "projects"]),
      actions: ["Use target terminology only where the underlying fact is true."],
    },
  ];

  return {
    benchmarkId,
    rubricVersion: RESUME_RUBRIC_VERSION,
    target,
    targetType: targetType(request, opportunity),
    targetConfidence: targetConfidence(request, opportunity),
    scoreMeaning:
      "Scores are transparent application-document heuristics, not hiring predictions and not a universal ATS score.",
    overallAlignmentScore,
    atsReadinessScore: Math.round((parseability + terminologyScore) / 2),
    parseabilityScore: parseability,
    eligibility: {
      status: failures.length
        ? ("not_met" as const)
        : unknowns.length
          ? ("unclear" as const)
          : required.length
            ? ("meets" as const)
            : ("likely" as const),
      failures,
      unknowns: unknowns.slice(0, 10),
    },
    requirements: assessments,
    dimensions,
    matchedKeywords: matchedKeywords.slice(0, 12),
    missingKeywords: missingKeywords.slice(0, 12),
    positioningStrengths: [
      profile.headline ? `Clear current positioning: ${profile.headline}.` : "",
      profile.skills.length
        ? `Relevant skills are available to prioritize: ${profile.skills.slice(0, 6).join(", ")}.`
        : "",
      profile.links.length ? "Public proof links can support the application." : "",
      profile.projects.length
        ? "Project evidence can support capability claims."
        : "",
    ].filter(Boolean),
    concerns: [
      ...contradictions.values(),
      !profile.workHistory.length
        ? "No verified work-history entries were provided, so experience claims cannot be strengthened yet."
        : "",
      !profile.links.length
        ? "No portfolio or public proof link was provided."
        : "",
      ...missingKeywords.slice(0, 5).map(
        (keyword) =>
          `The target emphasizes ${keyword}; include it only if the user's real experience supports it.`,
      ),
    ].filter(Boolean),
    priorityActions: [
      ...failures.map((failure) => `Resolve or acknowledge eligibility: ${failure}`),
      ...assessments
        .filter((item) => item.importance === "required" && item.status !== "confirmed")
        .slice(0, 4)
        .map((item) => item.actions[0]),
      ...(profile.workHistory.length || profile.projects.length
        ? ["Move the strongest target-relevant evidence earlier in the document."]
        : ["Supply genuine work, project, coursework, volunteer, or research evidence before optimization."]),
    ].filter(Boolean),
    limitations: [
      targetConfidence(request, opportunity) === "low"
        ? "The target is underspecified, so this benchmark is necessarily generic."
        : "",
      "Trakr cannot know how a specific employer configures its ATS or hiring process.",
      "Unknown information remains unknown and does not count as confirmed evidence.",
    ].filter(Boolean),
    factualIntegrity:
      "This benchmark uses only supplied profile and resume facts. Missing keywords are gaps to verify, not claims to add automatically.",
  };
}

export function buildResumeOptimization(
  request: OpportunityCompanionRequest,
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
  opportunity: Opportunity | null,
) {
  const benchmark = buildResumeBenchmark(request, profile, evidence, opportunity);
  const supported = optimizationProfile(profile, evidence);
  const target = benchmark.target;
  const skillsOrder = uniqueStrings([
    ...benchmark.matchedKeywords.filter((keyword) =>
      supported.skills.some((skill) =>
        normalize(skill).includes(normalize(keyword)),
      ),
    ),
    ...supported.skills,
  ]);
  const identity =
    supported.headline ??
    (skillsOrder.length
      ? `${skillsOrder.slice(0, 2).join(" and ")} profile`
      : "Application profile");
  const domain = uniqueStrings(supported.interests).slice(0, 3).join(", ");
  const professionalSummary = [
    identity,
    skillsOrder.length
      ? `with supplied skills including ${skillsOrder.slice(0, 5).join(", ")}`
      : "",
    domain ? `interested in ${domain}` : "",
    `seeking to contribute to ${target}`,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .concat(".");

  return {
    benchmarkId: benchmark.benchmarkId,
    rubricVersion: benchmark.rubricVersion,
    target,
    optimizedHeadline: [
      identity,
      ...skillsOrder.slice(0, 3).filter(
        (skill) => !normalize(identity).includes(normalize(skill)),
      ),
    ].join(" | "),
    professionalSummary,
    skillsOrder,
    experienceGuidance:
      [...supported.workHistory, ...supported.projects].length
      ? [...supported.workHistory, ...supported.projects].map(
          (entry) =>
            `Keep this experience factual, then lead with the most relevant action, evidence, and outcome: ${entry}`,
        )
      : [
          "No experience bullets were generated because no verified work history was provided.",
          "Add genuine projects, coursework, volunteer work, open-source contributions, or employment before requesting bullet rewrites.",
        ],
    prioritizedChanges: benchmark.priorityActions.slice(0, 8).map(
      (recommendation, index) => ({
        priority:
          index === 0 && benchmark.eligibility.failures.length
            ? ("critical" as const)
            : index < 3
              ? ("high" as const)
              : ("medium" as const),
        section:
          benchmark.eligibility.failures.length && index === 0
            ? "Eligibility"
            : "Resume content",
        recommendation,
        reason:
          "This change follows from the target-specific benchmark and supplied evidence.",
        evidenceClaimIds: optimizationClaimIds(evidence, [
          "skills",
          "workHistory",
          "projects",
          "education",
        ]),
      }),
    ),
    sectionRewrites: [
      ...supported.workHistory.map((entry) => ({
        section: "Work history",
        original: entry,
        suggested: entry
          .replace(/^I\s+/i, "")
          .replace(/^Worked on\b/i, "Contributed to")
          .replace(/^Helped with\b/i, "Supported")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/[.;]?$/, "."),
        evidenceClaimIds: optimizationClaimIds(evidence, ["workHistory"]),
        requiresConfirmation: true,
      })),
      ...supported.projects.map((entry) => ({
        section: "Projects",
        original: entry,
        suggested: entry
          .replace(/^I\s+/i, "")
          .replace(/^Worked on\b/i, "Built")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/[.;]?$/, "."),
        evidenceClaimIds: optimizationClaimIds(evidence, ["projects"]),
        requiresConfirmation: true,
      })),
    ].slice(0, 12),
    keywordsToUse: uniqueStrings([
      ...benchmark.matchedKeywords,
      ...benchmark.missingKeywords.filter((keyword) =>
        supported.skills.some((skill) =>
          normalize(skill).includes(normalize(keyword)),
        ),
      ),
    ]),
    unsupportedClaims: benchmark.missingKeywords.filter(
      (keyword) =>
        !supported.skills.some((skill) =>
          normalize(skill).includes(normalize(keyword)),
        ),
    ),
    verificationChecklist: [
      "Confirm every rewritten line accurately describes work the user actually performed.",
      "Confirm all dates, titles, employers, degrees, certifications, links, and locations.",
      "Add metrics only when the user can provide a real, supportable figure.",
      "Follow the target's explicit document and submission instructions.",
    ],
    factualIntegrity:
      "Use only claims supported by the verified profile, resume, portfolio, or user-confirmed experience. Do not add unsupported jobs, degrees, projects, metrics, certifications, or skills.",
  };
}

export function buildBenchmarkReference(
  benchmark: ReturnType<typeof buildResumeBenchmark>,
  target: CompanionTarget | undefined,
  profile: StructuredUserProfile,
): ResumeBenchmarkReference {
  const canonicalTarget = compactTargetForSession(target);
  const canonicalProfile = compactProfileForSession(profile);
  return {
    benchmarkId: benchmark.benchmarkId,
    rubricVersion: benchmark.rubricVersion,
    targetFingerprint: fingerprint(canonicalTarget ?? benchmark.target),
    evidenceFingerprint: fingerprint(canonicalProfile),
    completedAt: new Date().toISOString(),
  };
}

export function isBenchmarkCompatible(
  reference: ResumeBenchmarkReference | undefined,
  target: CompanionTarget | undefined,
  profile: StructuredUserProfile,
) {
  const canonicalTarget = compactTargetForSession(target);
  const canonicalProfile = compactProfileForSession(profile);
  return Boolean(
    reference &&
      reference.rubricVersion === RESUME_RUBRIC_VERSION &&
      reference.targetFingerprint === fingerprint(canonicalTarget) &&
      reference.evidenceFingerprint === fingerprint(canonicalProfile),
  );
}
