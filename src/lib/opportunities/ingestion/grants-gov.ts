import {
  canonicalizeUrl,
  publisherDomain,
} from "@/lib/opportunities/verification";
import type { Opportunity, OpportunityDomain } from "@/lib/types/opportunities";

type GrantsSearchHit = {
  id?: string | number;
  number?: string;
  title?: string;
  agency?: string;
  agencyCode?: string;
  openDate?: string;
  closeDate?: string;
  oppStatus?: string;
  docType?: string;
};

type GrantsSearchResponse = {
  data?: {
    oppHits?: GrantsSearchHit[];
  };
};

export type GrantsSearchQuery = {
  keyword: string;
  domains: OpportunityDomain[];
};

const SEARCH_URL = "https://api.grants.gov/v1/api/search2";
const DETAIL_URL = "https://www.grants.gov/search-results-detail";
const MAX_CURRENT_CYCLE_YEARS = 2;

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const usDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) {
    return new Date(
      Date.UTC(
        Number.parseInt(usDate[3], 10),
        Number.parseInt(usDate[1], 10) - 1,
        Number.parseInt(usDate[2], 10),
      ),
    );
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function asIsoDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isCurrentCycleDate(value: Date | null, now: Date) {
  if (!value) return false;
  const earliest = new Date(now);
  earliest.setFullYear(now.getFullYear() - MAX_CURRENT_CYCLE_YEARS);
  const latest = new Date(now);
  latest.setFullYear(now.getFullYear() + MAX_CURRENT_CYCLE_YEARS);
  return value >= earliest && value <= latest;
}

function currentCycleDeadline(
  closeDate: Date | null,
  openDate: Date | null,
  now: Date,
) {
  if (
    closeDate &&
    closeDate.getTime() >= now.getTime() &&
    isCurrentCycleDate(closeDate, now)
  ) {
    return asIsoDate(closeDate);
  }
  if (openDate && isCurrentCycleDate(openDate, now) && !closeDate) {
    return null;
  }
  return null;
}

function contextualDomains(
  title: string,
  requested: OpportunityDomain[],
) {
  const rules: Array<[OpportunityDomain, RegExp]> = [
    ["climate", /\b(climate|decarbon|carbon|atmosphere|weather)\b/i],
    ["sustainability", /\b(sustainab|renewable|clean energy|environment)\b/i],
    [
      "artificial_intelligence",
      /\b(artificial intelligence|generative ai|large language model)\b/i,
    ],
    ["machine_learning", /\b(machine learning|deep learning)\b/i],
    ["fintech", /\b(fintech|financial technology|digital payment)\b/i],
    ["finance", /\b(finance|financial|banking|capital market)\b/i],
    ["research", /\b(research|science|scientific|laboratory|academic)\b/i],
  ];
  return rules
    .filter(
      ([domain, pattern]) =>
        requested.includes(domain) && pattern.test(title),
    )
    .map(([domain]) => domain);
}

export function normalizeGrantsGovOpportunity(
  raw: GrantsSearchHit,
  query: GrantsSearchQuery,
  now = new Date(),
): Opportunity | null {
  const id = cleanText(raw.id);
  const title = cleanText(raw.title);
  if (!id || !title) return null;

  const openDate = parseDate(raw.openDate);
  const closeDate = parseDate(raw.closeDate);
  const status = cleanText(raw.oppStatus).toLowerCase();
  const currentDeadline = currentCycleDeadline(closeDate, openDate, now);
  const domains = contextualDomains(title, query.domains);
  const relevantTitle =
    /\b(grant|funding|research|science|scientific|climate|environment|energy|artificial intelligence|machine learning|data|financial|technology|innovation)\b/i.test(
      title,
    );

  // Search2 returns historical posted records as well as current notices.
  // A record with no current-cycle signal is not useful enough to ingest.
  if (
    (!isCurrentCycleDate(openDate, now) &&
      !isCurrentCycleDate(closeDate, now) &&
      status !== "forecasted") ||
    (status === "forecasted" && !isCurrentCycleDate(openDate, now)) ||
    (closeDate && closeDate.getTime() < now.getTime()) ||
    !relevantTitle
  ) {
    return null;
  }

  const canonicalUrl = canonicalizeUrl(`${DETAIL_URL}/${id}`);
  const forecast = status === "forecasted";
  const organization = cleanText(raw.agency) || cleanText(raw.agencyCode) || "Grants.gov";
  const summary = [
    `${title} listed in the official Grants.gov Search2 directory.`,
    cleanText(raw.number) ? `Opportunity number: ${cleanText(raw.number)}.` : "",
    forecast
      ? "This is a forecasted notice; a current application call and deadline require confirmation."
      : "Review the official notice for applicant eligibility, current instructions, and deadline details.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: `grants-gov-${id}`,
    title,
    organization,
    category: "grant",
    summary,
    sourceName: "Grants.gov API",
    sourceUrl: canonicalUrl,
    location: "Applicant geography varies by official notice",
    remote: false,
    deadline: currentDeadline,
    requiredSkills: ["proposal development"],
    preferredSkills: domains,
    eligibility: [
      forecast
        ? "Forecasted notice; eligibility and application availability are not yet confirmed."
        : "Applicant eligibility must be confirmed in the official notice.",
      "Geographic eligibility and work-authorization rules require review of the official notice.",
    ],
    benefits: ["Official funding notice"],
    tags: ["grant", "research funding", ...domains],
    difficulty: "high",
    verificationStatus: forecast ? "program_directory" : "unverified",
    lastVerifiedAt: null,
    lastSeenAt: null,
    sourceStatus: "unverified",
    httpStatus: null,
    canonicalUrl,
    publisherDomain: publisherDomain(canonicalUrl),
    isActive: true,
    verificationConfidence: 0,
    opportunityType: "grant",
    domains,
    geography: {
      eligibleCountries: [],
      excludedCountries: [],
      eligibleRegions: [],
      applicantResidencyRequirements: [],
      citizenshipRequirements: [],
      workAuthorizationRequirements: [],
      visaSponsorship: "not_applicable",
      remoteScope: "remote_scope_unclear",
      travelRequirements: [],
      onsiteRequirements: [],
      timezoneRestrictions: [],
      evidence: [
        {
          field: "geographicEligibility",
          value: "Applicant eligibility varies by official notice.",
          sourceUrl: canonicalUrl,
          sourceName: "Grants.gov API",
          capturedAt: now.toISOString(),
          confidence: "unknown",
          basis: "structured_source",
        },
      ],
      confidence: "unknown",
      unknownConditions: [
        "The Search2 result does not establish applicant-country eligibility; review the official notice.",
      ],
    },
  };
}

async function fetchJson(
  query: GrantsSearchQuery,
  fetchImpl: typeof fetch = fetch,
) {
  const body = {
    rows: 25,
    keyword: query.keyword,
    oppNum: "",
    eligibilities: "",
    agencies: "",
    oppStatuses: "forecasted|posted",
    aln: "",
    fundingCategories: "",
  };
  const response = await fetchImpl(SEARCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Trakr/0.2 (+https://github.com/Abd00lmalik/Trakr)",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Grants.gov Search2 failed: ${response.status}`);
  }
  return (await response.json()) as GrantsSearchResponse;
}

export async function fetchGrantsGovOpportunities(
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
) {
  const queries: GrantsSearchQuery[] = [
    { keyword: "climate", domains: ["climate", "sustainability"] },
    {
      keyword: "artificial intelligence",
      domains: ["artificial_intelligence", "machine_learning", "research"],
    },
    { keyword: "fintech", domains: ["fintech", "finance"] },
    { keyword: "research funding", domains: ["research"] },
  ];
  const results = await Promise.allSettled(
    queries.map((query) => fetchJson(query, fetchImpl)),
  );
  const successful = results.flatMap((result, index) =>
    result.status === "fulfilled"
      ? [{ response: result.value, query: queries[index] }]
      : [],
  );
  if (!successful.length) {
    const message = results
      .flatMap((result) =>
        result.status === "rejected"
          ? [
              result.reason instanceof Error
                ? result.reason.message
                : "Unknown Grants.gov query failure",
            ]
          : [],
      )
      .join("; ");
    throw new Error(message || "All Grants.gov Search2 queries failed.");
  }
  const seen = new Set<string>();
  return successful.flatMap(({ response, query }) =>
    (response.data?.oppHits ?? [])
      .map((hit) => normalizeGrantsGovOpportunity(hit, query, now))
      .filter((item): item is Opportunity => {
        if (!item || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }),
  );
}
