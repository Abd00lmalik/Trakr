import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichOpportunityMetadata,
  isGeographicallyActionable,
} from "../src/lib/opportunities/metadata";
import type { Opportunity } from "../src/lib/types/opportunities";

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "metadata-fixture",
    title: "Climate Research Fellowship",
    organization: "Fictional Institute",
    category: "fellowship",
    summary: "Research climate resilience with an international cohort.",
    sourceName: "Official curated source",
    sourceUrl: "https://example.com/fellowship",
    location: "Remote",
    remote: true,
    deadline: null,
    requiredSkills: ["research"],
    preferredSkills: ["climate"],
    eligibility: ["Review the current call for country eligibility."],
    benefits: ["Stipend"],
    tags: ["climate", "research"],
    difficulty: "high",
    verificationStatus: "verified",
    lastVerifiedAt: "2026-07-21T08:00:00.000Z",
    lastSeenAt: "2026-07-21T08:00:00.000Z",
    sourceStatus: "active",
    httpStatus: 200,
    canonicalUrl: "https://example.com/fellowship",
    publisherDomain: "example.com",
    isActive: true,
    verificationConfidence: 1,
    ...overrides,
  };
}

test("type and domain are independent structured dimensions", () => {
  const enriched = enrichOpportunityMetadata(
    opportunity(),
    new Date("2026-07-21T12:00:00.000Z"),
  );

  assert.equal(enriched.opportunityType, "fellowship");
  assert.ok(enriched.domains?.includes("climate"));
  assert.ok(enriched.domains?.includes("research"));
});

test("remote without published scope is not treated as globally accessible", () => {
  const enriched = enrichOpportunityMetadata(
    opportunity(),
    new Date("2026-07-21T12:00:00.000Z"),
  );

  assert.equal(enriched.geography?.remoteScope, "remote_scope_unclear");
  assert.equal(enriched.recommendationState, "explore");
  assert.equal(
    isGeographicallyActionable(enriched, "Nigeria", true),
    false,
  );
});

test("published Africa eligibility can support an African applicant without implying global access", () => {
  const enriched = enrichOpportunityMetadata(
    opportunity({
      location: "Remote within Africa",
      eligibility: ["Applicants based in Africa may apply."],
      deadline: "2026-10-31",
    }),
    new Date("2026-07-21T12:00:00.000Z"),
  );

  assert.equal(enriched.geography?.remoteScope, "remote_region");
  assert.equal(isGeographicallyActionable(enriched, "Nigeria", true), true);
  assert.equal(isGeographicallyActionable(enriched, "Canada", true), false);
});

test("published country restrictions apply even when the user did not request remote-only work", () => {
  const enriched = enrichOpportunityMetadata(
    opportunity({
      location: "United States",
      remote: false,
      eligibility: ["Applicants must be based in the United States."],
      deadline: "2026-10-31",
    }),
    new Date("2026-07-21T12:00:00.000Z"),
  );

  assert.equal(isGeographicallyActionable(enriched, "United States", false), true);
  assert.equal(isGeographicallyActionable(enriched, "Nigeria", false), false);
  assert.equal(isGeographicallyActionable(enriched, "United States", true), false);
});

test("directories and expired records cannot become Apply Now", () => {
  const directory = enrichOpportunityMetadata(
    opportunity({
      verificationStatus: "program_directory",
      deadline: "2026-10-31",
    }),
    new Date("2026-07-21T12:00:00.000Z"),
  );
  const expired = enrichOpportunityMetadata(
    opportunity({ deadline: "2026-01-01" }),
    new Date("2026-07-21T12:00:00.000Z"),
  );

  assert.equal(directory.recommendationState, "explore");
  assert.equal(expired.recommendationState, "unavailable_or_unverified");
});
