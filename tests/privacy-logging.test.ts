import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPrivacySafeRecommendationLog,
  parseRecommendationLogRetentionDays,
} from "../src/lib/privacy/recommendation-logging";
import type {
  RecommendationRequest,
  RecommendationResponse,
} from "../src/lib/types/opportunities";

const sensitiveValues = [
  "Amina Yusuf",
  "amina@example.com",
  "+81 90 1234 5678",
  "https://portfolio.example.com/amina",
  "Private Employer Ltd",
];

const request: RecommendationRequest = {
  requestId: "amina@example.com",
  user: {
    name: sensitiveValues[0],
    headline: "Frontend engineer",
    bio: `Contact ${sensitiveValues[1]} or ${sensitiveValues[2]}`,
    location: "Tokyo, Japan",
    experienceLevel: "early-career",
    skills: ["React", "TypeScript"],
    interests: ["web3"],
    goals: ["Find a fellowship"],
    education: ["Private University"],
    workHistory: [sensitiveValues[4]],
    links: [sensitiveValues[3]],
  },
  resumeText: `Confidential resume for ${sensitiveValues.join(" ")}`,
  filters: {
    categories: ["fellowship"],
    remote: true,
    limit: 3,
  },
};

const response: RecommendationResponse = {
  service: "trakr",
  version: "0.1.0",
  requestId: request.requestId!,
  generatedAt: "2026-07-16T00:00:00.000Z",
  provider: "gemini:test",
  aiStatus: "enhanced",
  querySummary: {
    profileSignals: [`name:${sensitiveValues[0]}`],
    filtersApplied: request.filters,
    totalCandidates: 12,
  },
  recommendations: [
    {
      rank: 1,
      opportunity: {
        id: "safe-opportunity-id",
        title: "Example Fellowship",
        organization: "Example Foundation",
        category: "fellowship",
        summary: "A public opportunity.",
        sourceName: "official",
        sourceUrl: "https://example.com/fellowship",
        location: "Remote",
        remote: true,
        deadline: "2026-12-31",
        requiredSkills: [],
        preferredSkills: [],
        eligibility: [],
        benefits: [],
        tags: [],
        difficulty: "medium",
      },
      matchScore: 91,
      reasoning: `Strong fit for ${sensitiveValues[0]}`,
      missingRequirements: ["A private requirement"],
      recommendedAction: "Apply Now",
      nextSteps: [`Email ${sensitiveValues[1]}`],
    },
  ],
  actionPlan: {
    immediate: [],
    sevenDayPlan: [],
    thirtyDayPlan: [],
  },
  learningRoadmap: {
    focusAreas: [],
    resourcesToFind: [],
    practiceProjects: [],
  },
  agentNotes: [],
};

test("privacy-safe logs exclude raw resumes and personal information", () => {
  const record = buildPrivacySafeRecommendationLog(request, response, {
    durationMs: 1532.4,
    hashKey: "test-only-secret",
    now: new Date("2026-07-16T00:00:00.000Z"),
    retentionDays: 30,
  });
  const serialized = JSON.stringify(record);

  for (const value of sensitiveValues) {
    assert.equal(serialized.includes(value), false, `leaked ${value}`);
  }
  assert.equal(serialized.includes(request.resumeText!), false);
  assert.equal(serialized.includes(response.recommendations[0].reasoning), false);
  assert.equal(record.inputSummary.resumeProvided, true);
  assert.equal(record.inputSummary.resumeLengthBucket, "under_1k");
  assert.equal(record.inputSummary.profile.skillsCount, 2);
  assert.equal(record.outputSummary.recommendations[0].opportunityId, "safe-opportunity-id");
  assert.equal(record.outputSummary.recommendations[0].missingRequirementsCount, 1);
  assert.equal(record.durationMs, 1532);
});

test("keyed hashes are stable and disabled without a configured key", () => {
  const first = buildPrivacySafeRecommendationLog(request, response, {
    hashKey: "test-only-secret",
  });
  const second = buildPrivacySafeRecommendationLog(request, response, {
    hashKey: "test-only-secret",
  });
  const withoutKey = buildPrivacySafeRecommendationLog(request, response);

  assert.match(first.requestIdHash!, /^[a-f0-9]{64}$/);
  assert.equal(first.requestIdHash, second.requestIdHash);
  assert.equal(first.requestFingerprint, second.requestFingerprint);
  assert.equal(withoutKey.requestIdHash, null);
  assert.equal(withoutKey.requestFingerprint, null);
});

test("retention is bounded and produces an explicit expiry", () => {
  assert.equal(parseRecommendationLogRetentionDays(undefined), 30);
  assert.equal(parseRecommendationLogRetentionDays("0"), 1);
  assert.equal(parseRecommendationLogRetentionDays("45"), 45);
  assert.equal(parseRecommendationLogRetentionDays("999"), 365);

  const record = buildPrivacySafeRecommendationLog(request, response, {
    now: new Date("2026-07-16T00:00:00.000Z"),
    retentionDays: 30,
  });
  assert.equal(record.expiresAt.toISOString(), "2026-08-15T00:00:00.000Z");
});

test("database schema removes legacy raw payload columns", async () => {
  const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  const createTable = schema.match(
    /create table if not exists recommendation_runs \(([\s\S]*?)\);/,
  )?.[1];

  assert.ok(createTable);
  assert.equal(createTable.includes("request_payload"), false);
  assert.equal(createTable.includes("response_payload"), false);
  assert.match(schema, /drop column if exists request_payload/);
  assert.match(schema, /drop column if exists response_payload/);
  assert.match(schema, /recommendation_runs_expires_at_idx/);
});
