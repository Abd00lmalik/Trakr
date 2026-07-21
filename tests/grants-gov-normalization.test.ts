import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGrantsGovOpportunity } from "../src/lib/opportunities/ingestion/grants-gov";
import { enrichOpportunityMetadata } from "../src/lib/opportunities/metadata";

const query = {
  keyword: "climate",
  domains: ["climate", "sustainability"] as const,
};

test("current official grant records retain deadlines but not guessed geography", () => {
  const normalized = normalizeGrantsGovOpportunity(
    {
      id: "123",
      number: "TEST-2026",
      title: "Climate Resilience Research Grant",
      agency: "Fictional Federal Agency",
      openDate: "07/01/2026",
      closeDate: "10/31/2026",
      oppStatus: "posted",
    },
    { ...query, domains: [...query.domains] },
    new Date("2026-07-21T12:00:00.000Z"),
  );

  assert.ok(normalized);
  assert.equal(normalized.deadline, "2026-10-31");
  assert.deepEqual(normalized.domains, ["climate"]);
  const enriched = enrichOpportunityMetadata(
    normalized,
    new Date("2026-07-21T12:00:00.000Z"),
  );
  assert.notEqual(enriched.recommendationState, "apply_now");
  assert.ok(enriched.geography?.unknownConditions.length);
});

test("expired, old-cycle, and irrelevant search hits are discarded", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");
  for (const raw of [
    {
      id: "expired",
      title: "Climate Grant",
      openDate: "01/01/2026",
      closeDate: "02/01/2026",
      oppStatus: "posted",
    },
    {
      id: "old",
      title: "Climate Grant",
      openDate: "01/01/2012",
      closeDate: "",
      oppStatus: "posted",
    },
    {
      id: "irrelevant",
      title: "Annual Program Statement",
      openDate: "07/01/2026",
      closeDate: "10/31/2026",
      oppStatus: "posted",
    },
  ]) {
    assert.equal(
      normalizeGrantsGovOpportunity(
        raw,
        { ...query, domains: [...query.domains] },
        now,
      ),
      null,
    );
  }
});

test("forecasted notices remain exploration records", () => {
  const normalized = normalizeGrantsGovOpportunity(
    {
      id: "forecast",
      title: "Future Climate Research Funding",
      openDate: "11/01/2026",
      closeDate: "",
      oppStatus: "forecasted",
    },
    { ...query, domains: [...query.domains] },
    new Date("2026-07-21T12:00:00.000Z"),
  );

  assert.ok(normalized);
  assert.equal(normalized.verificationStatus, "program_directory");
  assert.equal(
    enrichOpportunityMetadata(
      normalized,
      new Date("2026-07-21T12:00:00.000Z"),
    ).recommendationState,
    "explore",
  );
});
