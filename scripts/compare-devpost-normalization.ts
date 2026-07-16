import { normalizeDevpostHackathon } from "../src/lib/opportunities/ingestion/normalizers";

type RawRecord = Record<string, unknown>;

function legacySnapshot(raw: RawRecord) {
  const title = String(raw.title ?? raw.name ?? "").trim();
  const location = String(raw.location ?? "Global");
  return {
    id: `devpost-${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90)}`,
    organization: "Devpost",
    location,
    remote: true,
    deadline: null,
    url: String(raw.url ?? raw.devpost_url ?? "").trim(),
  };
}

async function main() {
  const response = await fetch("https://devpost.com/api/hackathons?status=open", {
    headers: {
      Accept: "application/json",
      "User-Agent": "Trakr/0.3 (+https://github.com/Abd00lmalik/Trakr)",
    },
  });
  if (!response.ok) {
    throw new Error(`Devpost comparison fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as { hackathons?: unknown[] };
  const records = Array.isArray(payload.hackathons)
    ? payload.hackathons.filter(
        (record): record is RawRecord =>
          Boolean(record) && typeof record === "object",
      )
    : [];

  const comparisons = records.flatMap((record) => {
    const normalized = normalizeDevpostHackathon(record);
    return normalized
      ? [
          {
            title: normalized.title,
            old: legacySnapshot(record),
            new: {
              id: normalized.id,
              organization: normalized.organization,
              location: normalized.location,
              remote: normalized.remote,
              deadline: normalized.deadline,
              url: normalized.canonicalUrl,
            },
          },
        ]
      : [];
  });

  console.log(
    JSON.stringify(
      {
        fetched: records.length,
        normalized: comparisons.length,
        correctedLocations: comparisons.filter(
          ({ old, new: current }) => old.location !== current.location,
        ).length,
        correctedOrganizations: comparisons.filter(
          ({ old, new: current }) => old.organization !== current.organization,
        ).length,
        recoveredDeadlines: comparisons.filter(
          ({ old, new: current }) => !old.deadline && current.deadline,
        ).length,
        stableSourceIds: comparisons.filter(
          ({ old, new: current }) => old.id !== current.id,
        ).length,
        records: comparisons,
      },
      null,
      2,
    ),
  );
}

void main();
