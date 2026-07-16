import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateOpportunities } from "../src/lib/opportunities/ingestion/fetchers";
import { normalizeDevpostHackathon } from "../src/lib/opportunities/ingestion/normalizers";

function devpostRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 30223,
    title: "  OpenAI   Build Week  ",
    displayed_location: { icon: "globe", location: "Online" },
    url: "https://openai.devpost.com/?utm_source=feed#details",
    submission_period_dates: "Jul 13 - 21, 2026",
    themes: [
      { id: 6, name: "Machine Learning/AI" },
      { id: 2, name: "DevOps" },
    ],
    prize_amount: "$<span data-currency-value>100,000</span>",
    organization_name: "OpenAI",
    invite_only: false,
    ...overrides,
  };
}

test("normalizes current Devpost API metadata and canonical URL", () => {
  const opportunity = normalizeDevpostHackathon(devpostRecord());
  assert.ok(opportunity);
  assert.equal(opportunity.id, "devpost-30223");
  assert.equal(opportunity.title, "OpenAI Build Week");
  assert.equal(opportunity.organization, "OpenAI");
  assert.equal(opportunity.category, "hackathon");
  assert.equal(opportunity.location, "Online");
  assert.equal(opportunity.remote, true);
  assert.equal(opportunity.deadline, "2026-07-21");
  assert.equal(opportunity.sourceUrl, "https://openai.devpost.com/");
  assert.equal(opportunity.canonicalUrl, "https://openai.devpost.com/");
  assert.equal(opportunity.publisherDomain, "openai.devpost.com");
  assert.deepEqual(opportunity.preferredSkills, [
    "artificial intelligence",
    "devops",
  ]);
  assert.match(opportunity.summary, /hosted by OpenAI/);
  assert.deepEqual(opportunity.benefits, [
    "$100,000 in listed prizes",
    "Portfolio proof",
    "Community exposure",
  ]);
});

test("does not mark an in-person Devpost event as remote", () => {
  const opportunity = normalizeDevpostHackathon(
    devpostRecord({
      id: 40001,
      displayed_location: { icon: "map-marker", location: "Lagos, Nigeria" },
      url: "https://lagos-build.devpost.com/",
    }),
  );
  assert.ok(opportunity);
  assert.equal(opportunity.location, "Lagos, Nigeria");
  assert.equal(opportunity.remote, false);
});

test("parses same-month, cross-month, and explicit deadlines", () => {
  const sameMonth = normalizeDevpostHackathon(devpostRecord());
  const crossMonth = normalizeDevpostHackathon(
    devpostRecord({
      submission_period_dates: "May 19 - Aug 17, 2026",
    }),
  );
  const explicit = normalizeDevpostHackathon(
    devpostRecord({
      submission_deadline: "2026-09-03T23:59:59Z",
      submission_period_dates: "not available",
    }),
  );

  assert.equal(sameMonth?.deadline, "2026-07-21");
  assert.equal(crossMonth?.deadline, "2026-08-17");
  assert.equal(explicit?.deadline, "2026-09-03");
});

test("uses stable source IDs instead of mutable titles", () => {
  const original = normalizeDevpostHackathon(devpostRecord());
  const renamed = normalizeDevpostHackathon(
    devpostRecord({ title: "OpenAI Build Week 2026" }),
  );

  assert.equal(original?.id, renamed?.id);
});

test("rejects invalid URLs and deduplicates canonical records", () => {
  assert.equal(
    normalizeDevpostHackathon(devpostRecord({ url: "not a url" })),
    null,
  );

  const first = normalizeDevpostHackathon(devpostRecord());
  const duplicate = normalizeDevpostHackathon(
    devpostRecord({ id: 99999, title: "Duplicate listing" }),
  );
  assert.ok(first);
  assert.ok(duplicate);
  assert.deepEqual(deduplicateOpportunities([first, duplicate]), [first]);
});

test("normalizes invite-only eligibility", () => {
  const opportunity = normalizeDevpostHackathon(
    devpostRecord({
      invite_only: true,
      eligibility_requirement_invite_only_description:
        "  Invited university teams only. ",
    }),
  );
  assert.deepEqual(opportunity?.eligibility, [
    "Invited university teams only.",
  ]);
});
