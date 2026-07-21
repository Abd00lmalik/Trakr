import type {
  Opportunity,
  RecommendationAction,
  VerificationStatus,
} from "@/lib/types/opportunities";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type VerificationOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  verifiedAt?: Date;
};

const TRACKING_PARAMETERS = [
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "source",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
];

export function canonicalizeUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  for (const parameter of TRACKING_PARAMETERS) {
    url.searchParams.delete(parameter);
  }
  url.hostname = url.hostname.toLowerCase();

  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

export function publisherDomain(value: string) {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
}

function classifyHttpResult(
  response: Response,
  requestedUrl: string,
  existingStatus: VerificationStatus,
) {
  const canonicalUrl = canonicalizeUrl(response.url || requestedUrl);
  const redirected = canonicalUrl !== canonicalizeUrl(requestedUrl);

  if (response.ok) {
    return {
      verificationStatus:
        existingStatus === "program_directory" ? existingStatus : ("verified" as const),
      sourceStatus: redirected ? ("redirected" as const) : ("active" as const),
      isActive: true,
      verificationConfidence: redirected ? 0.9 : 1,
      canonicalUrl,
    };
  }

  if (response.status === 404 || response.status === 410) {
    return {
      verificationStatus: "inactive_listing" as const,
      sourceStatus: "inactive" as const,
      isActive: false,
      verificationConfidence: 1,
      canonicalUrl,
    };
  }

  const blocked = response.status === 401 || response.status === 403;
  return {
    verificationStatus:
      existingStatus === "program_directory" ? existingStatus : ("unverified" as const),
    sourceStatus: blocked ? ("blocked" as const) : ("unreachable" as const),
    isActive: true,
    verificationConfidence: blocked ? 0.35 : 0.2,
    canonicalUrl,
  };
}

export async function verifyOpportunityUrl(
  opportunity: Opportunity,
  options: VerificationOptions = {},
): Promise<Opportunity> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const verifiedAt = (options.verifiedAt ?? new Date()).toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    const response = await fetchImpl(opportunity.sourceUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        Range: "bytes=0-4095",
        "User-Agent": "Trakr/0.2 (+https://github.com/Abd00lmalik/Trakr)",
      },
    });
    await response.body?.cancel().catch(() => undefined);
    const result = classifyHttpResult(
      response,
      opportunity.sourceUrl,
      opportunity.verificationStatus,
    );

    return {
      ...opportunity,
      ...result,
      httpStatus: response.status,
      publisherDomain: publisherDomain(result.canonicalUrl),
      lastVerifiedAt: verifiedAt,
    };
  } catch {
    return {
      ...opportunity,
      verificationStatus:
        opportunity.verificationStatus === "program_directory"
          ? "program_directory"
          : "unverified",
      sourceStatus: "unreachable",
      httpStatus: null,
      canonicalUrl: canonicalizeUrl(opportunity.sourceUrl),
      publisherDomain: publisherDomain(opportunity.sourceUrl),
      isActive: true,
      verificationConfidence: 0.1,
      lastVerifiedAt: verifiedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyOpportunities(
  opportunities: Opportunity[],
  options: VerificationOptions & { concurrency?: number } = {},
) {
  const results: Opportunity[] = new Array(opportunities.length);
  const concurrency = Math.min(Math.max(options.concurrency ?? 6, 1), 12);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < opportunities.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await verifyOpportunityUrl(opportunities[index], options);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, opportunities.length) }, () => worker()),
  );
  return results;
}

export function canApplyNow(opportunity: Opportunity) {
  if (opportunity.recommendationState) {
    return (
      opportunity.recommendationState === "apply_now" &&
      opportunity.verificationStatus === "verified" &&
      opportunity.isActive
    );
  }
  return opportunity.verificationStatus === "verified" && opportunity.isActive;
}

export function enforceApplyNowEligibility(
  opportunity: Opportunity,
  action: RecommendationAction,
): RecommendationAction {
  return action === "Apply Now" && !canApplyNow(opportunity)
    ? "Prepare First"
    : action;
}
