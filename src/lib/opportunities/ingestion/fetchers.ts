import {
  normalizeDevpostHackathon,
  normalizeRemoteOkJob,
} from "@/lib/opportunities/ingestion/normalizers";
import { curatedOfficialOpportunities } from "@/lib/opportunities/data/curated-official-opportunities";
import { fetchAshbyOpportunities } from "@/lib/opportunities/ingestion/ashby";
import { fetchGreenhouseOpportunities } from "@/lib/opportunities/ingestion/greenhouse";
import type { Opportunity } from "@/lib/types/opportunities";

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "Trakr/0.1 (+https://github.com/Abd00lmalik/Trakr)",
      Accept: "application/json",
      ...init?.headers,
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status}`);
  }

  return response.json();
}

export function deduplicateOpportunities(opportunities: Opportunity[]) {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();

  return opportunities.filter((opportunity) => {
    if (
      seenIds.has(opportunity.id) ||
      seenUrls.has(opportunity.canonicalUrl)
    ) {
      return false;
    }

    seenIds.add(opportunity.id);
    seenUrls.add(opportunity.canonicalUrl);
    return true;
  });
}

export async function fetchDevpostOpportunities(): Promise<Opportunity[]> {
  const data = await fetchJson("https://devpost.com/api/hackathons?status=open");
  const records: unknown[] =
    data && typeof data === "object" && "hackathons" in data && Array.isArray(data.hackathons)
      ? data.hackathons
      : [];
  return deduplicateOpportunities(
    records
      .map((item: unknown) =>
        item && typeof item === "object"
          ? normalizeDevpostHackathon(item as Record<string, unknown>)
          : null,
      )
      .filter((item): item is Opportunity => Boolean(item)),
  ).slice(0, 50);
}

export async function fetchRemoteOkOpportunities(): Promise<Opportunity[]> {
  const data = await fetchJson("https://remoteok.com/api");
  const records = Array.isArray(data) ? data.slice(1) : [];
  return records
    .map((item: unknown) =>
      item && typeof item === "object"
        ? normalizeRemoteOkJob(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is Opportunity => Boolean(item))
    .slice(0, 50);
}

export async function fetchStructuredOpportunities() {
  const sourceFetches = [
    {
      sourceName: "Devpost API",
      publicName: "Devpost API",
      promise: fetchDevpostOpportunities(),
    },
    {
      sourceName: "RemoteOK API",
      publicName: "RemoteOK API",
      promise: fetchRemoteOkOpportunities(),
    },
    {
      sourceName: "Greenhouse employer job boards",
      publicName: "Greenhouse employer job boards",
      promise: fetchGreenhouseOpportunities(),
    },
    {
      sourceName: "Ashby employer job boards",
      publicName: "Ashby employer job boards",
      promise: fetchAshbyOpportunities(),
    },
  ];
  const results = await Promise.allSettled(sourceFetches.map((source) => source.promise));

  const opportunities = results.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    if (Array.isArray(result.value)) return result.value;
    return result.value.opportunities;
  });
  const errors = results.flatMap((result) =>
    result.status === "rejected"
      ? [
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown fetch error",
        ]
      : Array.isArray(result.value)
        ? []
        : result.value.errors,
  );
  const successfulSourceNames = results.flatMap((result, index) =>
    result.status === "fulfilled"
      ? Array.isArray(result.value)
        ? [sourceFetches[index].sourceName]
        : result.value.successfulSourceNames
      : [],
  );
  const failedSourceNames = results.flatMap((result, index) =>
    result.status === "rejected" ? [sourceFetches[index].sourceName] : [],
  );

  return {
    opportunities: [...opportunities, ...curatedOfficialOpportunities],
    errors,
    sources: [
      ...sourceFetches.map((source) => source.publicName),
      "Official curated source import",
    ],
    successfulSourceNames: [...successfulSourceNames, "Official curated source"],
    failedSourceNames,
  };
}
