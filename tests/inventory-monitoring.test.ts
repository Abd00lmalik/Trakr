import assert from "node:assert/strict";
import test from "node:test";
import { buildInventoryMonitoringSnapshot } from "../src/lib/opportunities/inventory-monitoring";
import type { Opportunity } from "../src/lib/types/opportunities";

function opportunity(
  overrides: Partial<Opportunity> & Pick<Opportunity, "id" | "canonicalUrl">,
): Opportunity {
  const { id, canonicalUrl, ...rest } = overrides;
  return {
    id,
    title: "Fictional opportunity",
    organization: "Fictional organization",
    category: "remote_job",
    summary: "Synthetic monitoring fixture.",
    sourceName: "Source A",
    sourceUrl: "https://example.com/source",
    location: "Remote",
    remote: true,
    deadline: "2026-12-31",
    requiredSkills: [],
    preferredSkills: [],
    eligibility: ["Global applicants may apply."],
    benefits: [],
    tags: [],
    difficulty: "medium",
    verificationStatus: "verified",
    lastVerifiedAt: "2026-07-20T08:00:00.000Z",
    lastSeenAt: "2026-07-20T08:00:00.000Z",
    sourceStatus: "active",
    httpStatus: 200,
    canonicalUrl,
    publisherDomain: "example.com",
    isActive: true,
    verificationConfidence: 1,
    ...rest,
  };
}

test("inventory monitoring reports healthy source and coverage counts", () => {
  const records = Array.from({ length: 12 }, (_, index) =>
    opportunity({
      id: `item-${index}`,
      canonicalUrl: `https://example.com/${index}`,
      category: index < 10 ? "internship" : "fellowship",
      sourceName: index < 6 ? "Source A" : "Source B",
      location: index < 4 ? "Nigeria or remote" : "Remote",
    }),
  );
  const snapshot = buildInventoryMonitoringSnapshot({
    opportunities: records,
    expectedSources: ["Source A", "Source B"],
    sourceGroupCounts: {
      "Source A": 6,
      "Source B": 6,
    },
    now: new Date("2026-07-20T10:00:00.000Z"),
  });

  assert.equal(snapshot.totalRecords, 12);
  assert.equal(snapshot.verifiedRecords, 12);
  assert.equal(snapshot.verificationRate, 1);
  assert.equal(snapshot.duplicateRate, 0);
  assert.equal(snapshot.sourceCounts["Source A"], 6);
  assert.equal(snapshot.categoryCounts.internship, 10);
  assert.equal(
    snapshot.alerts.some((alert) => alert.code === "source_zero_records"),
    false,
  );
});

test("inventory monitoring surfaces source, verification, stale, duplicate, and coverage anomalies", () => {
  const records = [
    opportunity({
      id: "stale-1",
      canonicalUrl: "https://example.com/duplicate",
      verificationStatus: "unverified",
      lastVerifiedAt: "2026-07-10T00:00:00.000Z",
      lastSeenAt: "2026-07-10T00:00:00.000Z",
      remote: false,
      location: "United States",
      deadline: null,
    }),
    opportunity({
      id: "stale-2",
      canonicalUrl: "https://example.com/duplicate",
      verificationStatus: "unverified",
      lastVerifiedAt: null,
      lastSeenAt: null,
      remote: false,
      location: "United States",
      deadline: null,
    }),
  ];
  const snapshot = buildInventoryMonitoringSnapshot({
    opportunities: records,
    expectedSources: ["Source A", "Source B"],
    failedSources: ["Source C"],
    previous: {
      generatedAt: "2026-07-19T00:00:00.000Z",
      totalRecords: 20,
      activeRecords: 20,
      verifiedRecords: 20,
      verificationRate: 1,
      duplicateRate: 0,
      staleRecordCount: 0,
      remoteRecordCount: 20,
      africaEvidenceCount: 10,
      knownDeadlineCount: 20,
      sourceCounts: {},
      sourceGroupCounts: {},
      categoryCounts: {},
      alerts: [],
    },
    now: new Date("2026-07-20T10:00:00.000Z"),
  });
  const codes = new Set(snapshot.alerts.map((alert) => alert.code));

  assert.ok(codes.has("source_zero_records"));
  assert.ok(codes.has("source_fetch_failure"));
  assert.ok(codes.has("record_count_anomaly"));
  assert.ok(codes.has("verification_rate_low"));
  assert.ok(codes.has("stale_inventory"));
  assert.ok(codes.has("duplicate_rate_high"));
  assert.ok(codes.has("category_shortage"));
  assert.ok(codes.has("africa_coverage_low"));
  assert.ok(codes.has("remote_global_coverage_low"));
  assert.ok(codes.has("deadline_confidence_low"));
});
