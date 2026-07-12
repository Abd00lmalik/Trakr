import {
  normalizeDevpostHackathon,
  normalizeRemoteOkJob,
} from "@/lib/opportunities/ingestion/normalizers";
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

export async function fetchDevpostOpportunities(): Promise<Opportunity[]> {
  const data = await fetchJson("https://devpost.com/api/hackathons?status=open");
  const records: unknown[] =
    data && typeof data === "object" && "hackathons" in data && Array.isArray(data.hackathons)
      ? data.hackathons
      : [];
  return records
    .map((item: unknown) =>
      item && typeof item === "object"
        ? normalizeDevpostHackathon(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is Opportunity => Boolean(item))
    .slice(0, 50);
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
  const results = await Promise.allSettled([
    fetchDevpostOpportunities(),
    fetchRemoteOkOpportunities(),
  ]);

  const opportunities = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const errors = results.flatMap((result) =>
    result.status === "rejected"
      ? [result.reason instanceof Error ? result.reason.message : "Unknown fetch error"]
      : [],
  );

  return { opportunities, errors };
}
