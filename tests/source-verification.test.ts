import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalizeUrl,
  enforceApplyNowEligibility,
  verifyOpportunityUrl,
} from "../src/lib/opportunities/verification";
import type { Opportunity } from "../src/lib/types/opportunities";

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "test-opportunity",
    title: "Verified Builder Fellowship",
    organization: "Example Foundation",
    category: "fellowship",
    summary:
      "A specific fellowship for open-source developers shipping real projects with mentors.",
    sourceName: "Test source",
    sourceUrl: "https://example.com/apply?utm_source=test#details",
    location: "Remote",
    remote: true,
    deadline: "2026-12-31",
    requiredSkills: ["TypeScript"],
    preferredSkills: ["open source"],
    eligibility: ["Open to early-career developers"],
    benefits: ["Mentorship", "Stipend"],
    tags: ["fellowship", "developer"],
    difficulty: "medium",
    verificationStatus: "unverified",
    lastVerifiedAt: null,
    lastSeenAt: "2026-07-16T00:00:00.000Z",
    sourceStatus: "unverified",
    httpStatus: null,
    canonicalUrl: "https://example.com/apply",
    publisherDomain: "example.com",
    isActive: true,
    verificationConfidence: 0,
    ...overrides,
  };
}

function response(status: number, url: string) {
  const result = new Response(null, { status });
  Object.defineProperty(result, "url", { value: url });
  return result;
}

test("canonical URLs remove fragments, tracking parameters, and trailing slashes", () => {
  assert.equal(
    canonicalizeUrl(
      "https://WWW.Example.com/path/?utm_source=feed&keep=yes#section",
    ),
    "https://www.example.com/path?keep=yes",
  );
});

test("successful redirects are verified and retain the final canonical URL", async () => {
  const result = await verifyOpportunityUrl(opportunity(), {
    verifiedAt: new Date("2026-07-16T01:00:00.000Z"),
    fetchImpl: async () =>
      response(200, "https://apply.example.org/program/?utm_medium=feed"),
  });

  assert.equal(result.verificationStatus, "verified");
  assert.equal(result.sourceStatus, "redirected");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.canonicalUrl, "https://apply.example.org/program");
  assert.equal(result.publisherDomain, "apply.example.org");
  assert.equal(result.isActive, true);
  assert.equal(result.verificationConfidence, 0.9);
  assert.equal(result.lastVerifiedAt, "2026-07-16T01:00:00.000Z");
});

test("404 and 410 responses deactivate inactive listings", async () => {
  for (const status of [404, 410]) {
    const result = await verifyOpportunityUrl(opportunity(), {
      fetchImpl: async () => response(status, "https://example.com/gone"),
    });

    assert.equal(result.verificationStatus, "inactive_listing");
    assert.equal(result.sourceStatus, "inactive");
    assert.equal(result.isActive, false);
    assert.equal(result.verificationConfidence, 1);
  }
});

test("blocked sources stay active but cannot become verified", async () => {
  const result = await verifyOpportunityUrl(opportunity(), {
    fetchImpl: async () => response(403, "https://example.com/apply"),
  });

  assert.equal(result.verificationStatus, "unverified");
  assert.equal(result.sourceStatus, "blocked");
  assert.equal(result.isActive, true);
  assert.equal(result.verificationConfidence, 0.35);
});

test("directory classification survives a successful URL check", async () => {
  const result = await verifyOpportunityUrl(
    opportunity({ verificationStatus: "program_directory" }),
    {
      fetchImpl: async () => response(200, "https://example.com/programs"),
    },
  );

  assert.equal(result.verificationStatus, "program_directory");
  assert.equal(result.sourceStatus, "redirected");
  assert.equal(result.isActive, true);
});

test("Apply Now is restricted to verified active opportunities", () => {
  assert.equal(
    enforceApplyNowEligibility(
      opportunity({ verificationStatus: "verified", isActive: true }),
      "Apply Now",
    ),
    "Apply Now",
  );
  assert.equal(
    enforceApplyNowEligibility(
      opportunity({ verificationStatus: "program_directory", isActive: true }),
      "Apply Now",
    ),
    "Prepare First",
  );
  assert.equal(
    enforceApplyNowEligibility(
      opportunity({ verificationStatus: "verified", isActive: false }),
      "Apply Now",
    ),
    "Prepare First",
  );
});

test("database schema and repository include stale-record lifecycle support", async () => {
  const [schema, repository] = await Promise.all([
    readFile(new URL("../db/schema.sql", import.meta.url), "utf8"),
    readFile(
      new URL("../src/lib/repositories/opportunity-repository.ts", import.meta.url),
      "utf8",
    ),
  ]);

  for (const field of [
    "verification_status",
    "last_verified_at",
    "last_seen_at",
    "source_status",
    "http_status",
    "canonical_url",
    "publisher_domain",
    "is_active",
    "verification_confidence",
  ]) {
    assert.match(schema, new RegExp(`\\b${field}\\b`));
  }
  assert.match(repository, /last_seen_at is null/);
  assert.match(repository, /source_name = any\(\$1::text\[\]\)/);
  assert.match(repository, /last_seen_at < \$2/);
  assert.match(repository, /source_status = 'stale'/);
});
