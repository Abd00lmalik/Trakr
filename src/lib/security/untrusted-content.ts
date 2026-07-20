import type {
  ProfileEvidence,
  StructuredUserProfile,
} from "@/lib/types/opportunities";

const instructionLikeContent =
  /\b(ignore (?:all |any )?(?:previous|prior|system) instructions?|system prompt|developer message|override (?:the )?(?:rules|instructions)|exfiltrat(?:e|ion)|reveal (?:the )?(?:system|hidden|private)|send (?:the )?(?:user|resume|cv|profile|personal) (?:data|information|details)|upload (?:the )?(?:user|resume|cv|profile)|leak (?:the )?(?:user|resume|cv|profile))\b/i;

export function isInstructionLikeContent(value: string) {
  return instructionLikeContent.test(value);
}

export function sanitizeUntrustedValues(values: string[]) {
  return values.filter((value) => !isInstructionLikeContent(value));
}

export function sanitizeUntrustedProfile(
  profile: StructuredUserProfile | undefined,
): StructuredUserProfile | undefined {
  if (!profile) return undefined;
  const scalar = (value: string | undefined) =>
    value && !isInstructionLikeContent(value) ? value : undefined;
  return {
    name: scalar(profile.name),
    headline: scalar(profile.headline),
    bio: scalar(profile.bio),
    location: scalar(profile.location),
    timezone: scalar(profile.timezone),
    experienceLevel: profile.experienceLevel,
    skills: sanitizeUntrustedValues(profile.skills),
    interests: sanitizeUntrustedValues(profile.interests),
    goals: sanitizeUntrustedValues(profile.goals),
    education: sanitizeUntrustedValues(profile.education),
    workHistory: sanitizeUntrustedValues(profile.workHistory),
    projects: sanitizeUntrustedValues(profile.projects),
    certifications: sanitizeUntrustedValues(profile.certifications),
    links: sanitizeUntrustedValues(profile.links),
  };
}

export function sanitizeProfileEvidence(
  evidence: ProfileEvidence[],
): ProfileEvidence[] {
  return evidence.flatMap((item) => {
    const value =
      typeof item.value === "string"
        ? isInstructionLikeContent(item.value)
          ? undefined
          : item.value
        : Array.isArray(item.value)
          ? sanitizeUntrustedValues(item.value)
          : undefined;
    if (
      (typeof item.value === "string" && value === undefined) ||
      (Array.isArray(item.value) && !value?.length)
    ) {
      return [];
    }
    return [{ ...item, value }];
  });
}
