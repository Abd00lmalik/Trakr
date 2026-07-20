import { createHash } from "node:crypto";
import {
  buildProfileDraftFromBackground,
  extractProfileFromText,
  inferExperienceLevelFromText,
} from "@/lib/resume/parser";
import type {
  CompanionContext,
  OpportunityCategory,
  OpportunityCompanionRequest,
  ProfileEvidence,
  RecommendationFilters,
  StructuredUserProfile,
} from "@/lib/types/opportunities";

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
  "computer science student",
];

const categorySignals: Array<{
  category: OpportunityCategory;
  signals: string[];
}> = [
  { category: "hackathon", signals: ["hackathon", "competition", "challenge"] },
  { category: "grant", signals: ["grant", "funding", "accelerator"] },
  { category: "scholarship", signals: ["scholarship", "tuition"] },
  { category: "fellowship", signals: ["fellowship"] },
  { category: "internship", signals: ["internship", "intern"] },
  {
    category: "remote_job",
    signals: ["remote job", "remote role", "job", "employment", "freelance"],
  },
  {
    category: "web3_bounty",
    signals: ["bounty", "bug bounty", "smart contract security"],
  },
];

const countryDemonyms: Array<[RegExp, string]> = [
  [/\bnigerian\b/i, "Nigeria"],
  [/\bghanaian\b/i, "Ghana"],
  [/\bkenyan\b/i, "Kenya"],
  [/\bsouth african\b/i, "South Africa"],
  [/\bindian\b/i, "India"],
  [/\bcanadian\b/i, "Canada"],
  [/\bamerican\b/i, "United States"],
  [/\bbritish\b/i, "United Kingdom"],
];

const interestAliases: Array<[RegExp, string]> = [
  [/\b(ai|artificial intelligence|machine learning|llms?)\b/i, "AI"],
  [/\b(web3|blockchain|crypto|solidity|ethereum)\b/i, "Web3"],
  [/\b(climate|clean ?tech|sustainability|renewable energy)\b/i, "Climate"],
  [/\b(fintech|financial technology|payments?|banking)\b/i, "Fintech"],
  [/\b(cybersecurity|security|infosec)\b/i, "Cybersecurity"],
  [/\b(product design|ux|ui|figma|design)\b/i, "Design"],
  [/\b(research|academic|science|scientific)\b/i, "Research"],
  [/\b(open source|oss)\b/i, "Open source"],
  [/\b(healthcare|health tech|healthtech|medical)\b/i, "Healthcare"],
  [/\b(startups?|entrepreneurship|founder)\b/i, "Startups"],
];

const emptyProfile: StructuredUserProfile = {
  skills: [],
  interests: [],
  goals: [],
  education: [],
  workHistory: [],
  projects: [],
  certifications: [],
  links: [],
};

function unique(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
}

function mergeProfiles(
  ...profiles: Array<StructuredUserProfile | undefined>
): StructuredUserProfile {
  const result = { ...emptyProfile };

  for (const profile of profiles) {
    if (!profile) continue;
    if (profile.name) result.name = profile.name;
    if (profile.headline) result.headline = profile.headline;
    if (profile.bio) result.bio = profile.bio;
    if (profile.location) result.location = profile.location;
    if (profile.timezone) result.timezone = profile.timezone;
    if (profile.experienceLevel) result.experienceLevel = profile.experienceLevel;
    result.skills = unique([...result.skills, ...profile.skills]);
    result.interests = unique([...result.interests, ...profile.interests]);
    result.goals = unique([...result.goals, ...profile.goals]);
    result.education = unique([...result.education, ...profile.education]);
    result.workHistory = unique([...result.workHistory, ...profile.workHistory]);
    result.projects = unique([...result.projects, ...profile.projects]);
    result.certifications = unique([
      ...result.certifications,
      ...profile.certifications,
    ]);
    result.links = unique([...result.links, ...profile.links]);
  }

  return result;
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferHeadline(message: string) {
  const lower = message.toLowerCase();
  const role = roleSignals.find((signal) => lower.includes(signal));
  return role ? titleCase(role.replace("front-end", "frontend").replace("back-end", "backend")) : undefined;
}

function inferLocation(message: string) {
  for (const [pattern, country] of countryDemonyms) {
    if (pattern.test(message)) return country;
  }

  const match = message.match(
    /\b(?:from|based in|located in|living in|student in|applying from|remotely from)\s+([A-Z][A-Za-z .'-]*?(?:,\s*[A-Z][A-Za-z .'-]*?)?)(?=[.;]|\s+(?:with|and|who|looking|seeking|interested|want|only)\b|$)/,
  );
  return match?.[1]?.trim().replace(/[.;]+$/, "");
}

function inferPreferredLocation(message: string) {
  const match = message.match(
    /\b(?:opportunities|roles|jobs|internships?|fellowships?|scholarships?|grants?|hackathons?)\s+(?:based\s+)?in\s+([A-Z][A-Za-z .'-]{2,50}?)(?=[,.;]|\s+(?:or|and|that|which|with|for)\b|$)/,
  );
  return match?.[1]?.trim();
}

function locationWasInferredFromDemonym(message: string) {
  return countryDemonyms.some(([pattern]) => pattern.test(message));
}

function categoriesFromText(message: string) {
  const lower = message.toLowerCase();
  return categorySignals
    .filter(({ signals }) =>
      signals.some((signal) => {
        const index = lower.indexOf(signal);
        if (index < 0) return false;
        const prefix = lower.slice(Math.max(0, index - 64), index);
        return !/\b(?:not|never|exclude|excluding|without|do not|don't)\b[^.!?]{0,56}$/.test(
          prefix,
        );
      }),
    )
    .map(({ category }) => category);
}

function interestsFromText(message: string) {
  return interestAliases
    .filter(([pattern]) => pattern.test(message))
    .map(([, interest]) => interest);
}

function meaningfulMessage(message: string | undefined) {
  if (!message) return undefined;
  const cleaned = message.trim();
  const serviceInvocation =
    /\b(agent\s*#?\s*5198|opportunity matching api|service type|a2mcp|public service endpoint|use the service)\b/i.test(
      cleaned,
    );
  const personalBackground =
    /\b(i am|i'm|my (?:skills|background|experience|education|projects?)|i (?:know|use|built|created|developed|studied|worked)|student|developer|designer|engineer|founder|creator)\b/i.test(
      cleaned,
    );
  if (serviceInvocation && !personalBackground) {
    return undefined;
  }
  if (
    /^(find|show|get|give)\s+me\s+(some\s+)?opportunities[.!]?$/i.test(
      cleaned,
    )
  ) {
    return undefined;
  }
  if (/^i\s+(want|need)\s+opportunities[.!]?$/i.test(cleaned)) {
    return undefined;
  }
  if (
    /^(1|2|option\s+[12]|resume|cv|background|use my resume or cv|tell trakr about my background)[.!]?$/i.test(
      cleaned,
    )
  ) {
    return undefined;
  }
  if (
    /^(yes|correct|confirmed|looks good|that(?:'s| is) right|proceed|continue)[.!]?$/i.test(
      cleaned,
    )
  ) {
    return undefined;
  }
  return cleaned;
}

function addEvidence(
  evidence: ProfileEvidence[],
  field: string,
  source: ProfileEvidence["source"],
  detail?: string,
  origin?: ProfileEvidence["origin"],
) {
  if (
    source === "unknown" &&
    evidence.some((item) => item.field === field && item.source !== "unknown")
  ) {
    return;
  }
  const existing = evidence.find(
    (item) => item.field === field && item.origin === origin,
  );
  if (existing) {
    if (existing.source === "explicit" && source !== "explicit") return;
    existing.source = source;
    existing.evidence = detail;
    existing.origin = origin;
    return;
  }
  evidence.push({ field, source, evidence: detail, origin });
}

function enrichEvidence(
  evidence: ProfileEvidence[],
  profile: StructuredUserProfile,
) {
  return evidence.slice(-80).map((item, index) => {
    const rawValue = profile[item.field as keyof StructuredUserProfile];
    const value =
      typeof rawValue === "string" || Array.isArray(rawValue)
        ? rawValue
        : undefined;
    const claimId = createHash("sha256")
      .update(
        `${item.field}\0${item.origin ?? "unknown"}\0${JSON.stringify(value)}\0${index}`,
      )
      .digest("hex")
      .slice(0, 20);
    return {
      ...item,
      claimId: item.claimId ?? `claim_${claimId}`,
      value: item.value ?? value,
      confidence:
        item.confidence ??
        (item.source === "explicit"
          ? 1
          : item.source === "inferred"
            ? 0.65
            : 0),
      confirmed: item.confirmed ?? item.source === "explicit",
      allowedUse:
        item.allowedUse ??
        (item.source === "unknown"
          ? []
          : (["matching", "assessment"] as const)),
    };
  });
}

function contextFromRequest(
  request: OpportunityCompanionRequest,
): CompanionContext | undefined {
  const candidate = request.context ?? request.continuation;
  if (!candidate || typeof candidate === "string" || "token" in candidate) {
    return undefined;
  }
  return candidate as CompanionContext;
}

function evidenceFromProvidedProfile(
  profile: StructuredUserProfile | undefined,
  evidence: ProfileEvidence[],
  source: "explicit" | "inferred",
  origin: ProfileEvidence["origin"],
  onlyIfFieldMissing = false,
) {
  if (!profile) return;
  for (const field of [
    "headline",
    "bio",
    "location",
    "experienceLevel",
    "skills",
    "interests",
    "goals",
    "education",
    "workHistory",
    "projects",
    "certifications",
    "links",
  ] as const) {
    const value = profile[field];
    const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
    if (
      onlyIfFieldMissing &&
      evidence.some((item) => item.field === field)
    ) {
      continue;
    }
    if (hasValue) addEvidence(evidence, field, source, undefined, origin);
  }
}

function explicitSkillText(message: string) {
  const matches = [
    ...message.matchAll(
      /\b(?:skills?(?:\s+include|\s+are)?|tools?(?:\s+include|\s+are)?|i\s+(?:know|use|work with)|experience with|experienced with|proficient in|skilled in|strong in)\s*:?\s*([^.!?]+)/gi,
    ),
    ...message.matchAll(/\bwith\s+([^.!?]+?)\s+skills?\b/gi),
    ...message.matchAll(/\bwith\s+([^.!?]+?)\s+experience\b/gi),
    ...message.matchAll(
      /\b(?:experience|background)\s+(?:using|in)\s+([^.!?]+)/gi,
    ),
  ];
  return matches.map((match) => match[1]).filter(Boolean).join(", ");
}

function evidenceSentences(message: string, pattern: RegExp) {
  return message
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => pattern.test(sentence))
    .slice(0, 8);
}

function buildMissingInformation(
  profile: StructuredUserProfile,
  filters: RecommendationFilters,
) {
  const missing: Array<{
    field: string;
    question: string;
    required: boolean;
  }> = [];

  if (
    !profile.headline &&
    !profile.bio &&
    !profile.education.length &&
    !profile.workHistory.length &&
    !profile.projects.length
  ) {
    missing.push({
      field: "background",
      question: "What is your current background, role, field of study, or strongest experience?",
      required: true,
    });
  }
  if (!profile.skills.length) {
    missing.push({
      field: "skills",
      question: "What skills, tools, subjects, or strengths should I match against?",
      required: true,
    });
  }
  if (
    !profile.goals.length &&
    !filters.categories?.length
  ) {
    missing.push({
      field: "goals",
      question:
        "What are you hoping to find: jobs, internships, hackathons, grants, fellowships, scholarships, or bounties?",
      required: true,
    });
  }
  if (!profile.experienceLevel) {
    missing.push({
      field: "experienceLevel",
      question:
        "What best describes your experience level: student, beginner, early career, mid-level, senior, founder, or creator?",
      required: true,
    });
  }
  if (!profile.location && filters.remote !== true) {
    missing.push({
      field: "location",
      question: "Where are you based, or should I search only for remote opportunities?",
      required: false,
    });
  }

  return missing;
}

function completenessScore(
  profile: StructuredUserProfile,
  filters: RecommendationFilters,
) {
  const checks = [
    Boolean(
      profile.headline ||
        profile.bio ||
        profile.education.length ||
        profile.workHistory.length ||
        profile.projects.length,
    ),
    profile.skills.length > 0,
    Boolean(profile.goals.length || profile.interests.length || filters.categories?.length),
    Boolean(profile.experienceLevel),
    Boolean(profile.location || filters.remote === true),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function buildConversationalProfile(
  request: OpportunityCompanionRequest,
) {
  const context = contextFromRequest(request);
  const providedProfile = request.user ?? request.profile;
  const evidence: ProfileEvidence[] = [...(context?.profileEvidence ?? [])];
  const message = meaningfulMessage(request.message);
  const resumeExtraction = request.resumeText
    ? extractProfileFromText(request.resumeText, "resume")
    : undefined;
  const resumeProfile = resumeExtraction?.profile;
  const messageExtraction = message
    ? buildProfileDraftFromBackground(message)
    : undefined;
  const messageProfile = messageExtraction?.profile;
  const skillsFromMessage = message
    ? buildProfileDraftFromBackground(explicitSkillText(message)).profile.skills
    : [];
  const explicitMessageProfile: StructuredUserProfile | undefined = message
    ? {
        headline: inferHeadline(message),
        bio: message.length >= 40 ? message.slice(0, 480) : undefined,
        location: inferLocation(message),
        experienceLevel:
          inferExperienceLevelFromText(message) ??
          (/\b(beginner|new to|just starting)\b/i.test(message)
            ? "beginner"
            : undefined),
        skills: skillsFromMessage,
        interests: unique([
          ...(messageProfile?.interests ?? []),
          ...interestsFromText(message),
        ]),
        goals: messageProfile?.goals ?? [],
        education: /\b(studying|study at|university|college|degree|bachelor|master|bsc|msc|phd)\b/i.test(message)
          ? [message.match(/[^.!?]*(?:studying|study at|university|college|degree|bachelor|master|bsc|msc|phd)[^.!?]*/i)?.[0]?.trim() ?? ""].filter(Boolean)
          : [],
        workHistory: unique([
          ...(messageProfile?.workHistory ?? []),
          ...evidenceSentences(
            message,
            /\b(worked|employed|interned|contracted|experience at|experience as)\b/i,
          ),
        ]),
        projects: unique([
          ...(messageProfile?.projects ?? []),
          ...evidenceSentences(
            message,
            /\b(built|created|developed|shipped|launched|implemented)\b/i,
          ),
        ]),
        certifications: messageProfile?.certifications ?? [],
        links: messageProfile?.links ?? [],
      }
    : undefined;

  const profile = mergeProfiles(
    context?.profile,
    providedProfile,
    resumeProfile,
    explicitMessageProfile,
    {
      skills: [],
      interests: request.interests ?? [],
      goals: request.goals ?? [],
      education: [],
      workHistory: [],
      projects: [],
      certifications: [],
      links: [],
    },
  );

  evidenceFromProvidedProfile(
    context?.profile,
    evidence,
    "explicit",
    "context",
    true,
  );
  evidenceFromProvidedProfile(
    providedProfile,
    evidence,
    "explicit",
    "structured_profile",
  );
  if (resumeExtraction) {
    evidence.push(...resumeExtraction.evidence);
  }
  evidenceFromProvidedProfile(
    explicitMessageProfile,
    evidence,
    "explicit",
    "user",
  );
  if (
    message &&
    explicitMessageProfile?.location &&
    locationWasInferredFromDemonym(message)
  ) {
    const locationEvidence = evidence.find(
      (item) => item.field === "location" && item.origin === "user",
    );
    if (locationEvidence) {
      locationEvidence.source = "inferred";
      locationEvidence.origin = "inference";
      locationEvidence.evidence = `Inferred from "${message.match(countryDemonyms.find(([pattern]) => pattern.test(message))?.[0] ?? /$^/)?.[0] ?? "regional wording"}".`;
    }
  }

  const profilePreferenceText = [
    ...profile.goals,
    ...profile.interests,
  ].join(" ");
  const categories = unique([
    ...(context?.filters?.categories ?? []),
    ...(request.filters.categories ?? []),
    ...categoriesFromText(request.message ?? ""),
    ...categoriesFromText(profilePreferenceText),
  ]) as OpportunityCategory[];
  const filters: RecommendationFilters = {
    ...(context?.filters ?? {}),
    ...request.filters,
    categories: categories.length ? categories : request.filters.categories,
    location:
      request.filters.location ??
      inferPreferredLocation(request.message ?? "") ??
      context?.filters?.location,
    remote:
      request.filters.remote ??
      (/\bremote\b/i.test(
        `${request.message ?? ""} ${profilePreferenceText}`,
      )
        ? true
        : context?.filters?.remote),
  };

  if (
    !profile.goals.length &&
    /\b(find|looking for|seeking|want)\b/i.test(request.message ?? "") &&
    (profile.interests.length || categories.length)
  ) {
    profile.goals = ["Find relevant opportunities"];
    addEvidence(evidence, "goals", "explicit", "User asked to find opportunities.");
  }

  const missingInformation = buildMissingInformation(profile, filters);
  const unknownFields = missingInformation.map((item) => item.field);
  for (const field of unknownFields) addEvidence(evidence, field, "unknown");

  return {
    profile,
    filters,
    evidence: enrichEvidence(evidence, profile),
    missingInformation,
    unknownFields,
    completenessScore: completenessScore(profile, filters),
    sufficient: missingInformation.every((item) => !item.required),
    profileSource:
      context?.profileSource ??
      request.intakeRoute ??
      (request.resumeText ? "resume" : message ? "request" : undefined),
  };
}

export function buildContinuationContext(
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
  context: CompanionContext | undefined,
  selectedOpportunityId?: string,
  updates: Partial<
    Pick<
      CompanionContext,
      | "profileConfirmed"
      | "profileSource"
      | "awaitingProfileConfirmation"
      | "service"
      | "operation"
      | "stage"
      | "unansweredQuestions"
      | "documentReferences"
      | "consent"
      | "filters"
    >
  > = {},
): CompanionContext {
  return {
    profile,
    profileEvidence: evidence.slice(-80),
    selectedOpportunityId:
      selectedOpportunityId ?? context?.selectedOpportunityId,
    profileConfirmed: updates.profileConfirmed ?? context?.profileConfirmed ?? false,
    profileSource: updates.profileSource ?? context?.profileSource,
    awaitingProfileConfirmation:
      updates.awaitingProfileConfirmation ??
      (updates.profileConfirmed || context?.profileConfirmed
        ? false
        : context?.awaitingProfileConfirmation),
    service: updates.service ?? context?.service,
    operation: updates.operation ?? context?.operation,
    stage: updates.stage ?? context?.stage,
    unansweredQuestions:
      updates.unansweredQuestions ?? context?.unansweredQuestions ?? [],
    documentReferences:
      updates.documentReferences ?? context?.documentReferences ?? [],
    consent: updates.consent ?? context?.consent,
    filters: updates.filters ?? context?.filters,
    sessionVersion: "2",
  };
}
