import assert from "node:assert/strict";
import test from "node:test";
import {
  greenhouseBoardConfigs,
  normalizeGreenhouseJob,
} from "../src/lib/opportunities/ingestion/greenhouse";
import { matchedInterests } from "../src/lib/recommendation/diversification";
import { scoreOpportunity } from "../src/lib/recommendation/scoring";
import { recommendationRequestSchema } from "../src/lib/types/opportunities";

const oneEthos =
  greenhouseBoardConfigs.find((board) => board.token === "oneethos") ??
  greenhouseBoardConfigs[0];
const moniepoint =
  greenhouseBoardConfigs.find((board) => board.token === "moniepoint") ??
  greenhouseBoardConfigs[0];

test("normalizes employer-owned Greenhouse internships with provenance", () => {
  const opportunity = normalizeGreenhouseJob(
    {
      id: 123,
      title: "Product Management Intern",
      absolute_url:
        "https://job-boards.greenhouse.io/oneethos/jobs/123?utm_source=test",
      updated_at: "2026-07-19T12:00:00Z",
      location: { name: "United States - Remote" },
      departments: [{ name: "Technology" }],
      content:
        "<p>Work on climate fintech products with product managers and engineers. Experience with Figma and data analysis is helpful.</p>",
    },
    oneEthos,
  );

  assert.ok(opportunity);
  assert.equal(opportunity.category, "internship");
  assert.equal(opportunity.remote, true);
  assert.equal(opportunity.organization, "One Ethos");
  assert.equal(opportunity.sourceName, "Greenhouse: One Ethos");
  assert.equal(
    opportunity.canonicalUrl,
    "https://job-boards.greenhouse.io/oneethos/jobs/123",
  );
  assert.ok(opportunity.tags.includes("climate"));
  assert.ok(opportunity.tags.includes("fintech"));
  assert.ok(
    opportunity.eligibility.some((item) =>
      /United States-only eligibility/i.test(item),
    ),
  );
});

test("Greenhouse regional restrictions remain hard eligibility gates", () => {
  const opportunity = normalizeGreenhouseJob(
    {
      id: 456,
      title: "AI Research Intern",
      absolute_url: "https://job-boards.greenhouse.io/example/jobs/456",
      location: { name: "United States Remote" },
      content:
        "Research machine learning systems with Python. Applicants must be authorized to work in the United States.",
    },
    oneEthos,
  );
  assert.ok(opportunity);

  const request = recommendationRequestSchema.parse({
    user: {
      headline: "Computer science student",
      location: "Lagos, Nigeria",
      experienceLevel: "student",
      skills: ["Python", "machine learning"],
      interests: ["AI"],
      goals: ["Find remote AI internships"],
    },
    filters: { categories: ["internship"], remote: true },
  });

  const score = scoreOpportunity(opportunity, request, {
    now: new Date("2026-07-20T00:00:00Z"),
  });
  assert.equal(score.hardMismatch, true);
  assert.ok(
    (score.mismatchReasons ?? []).some((reason) =>
      /United States-only eligibility/i.test(reason),
    ),
  );
});

test("remote Greenhouse country locations remain hard eligibility gates", () => {
  const opportunity = normalizeGreenhouseJob(
    {
      id: 457,
      title: "Site Reliability Engineer",
      absolute_url: "https://job-boards.greenhouse.io/example/jobs/457",
      location: { name: "Remote, South Africa" },
      content: "Operate reliable fintech infrastructure with Python and AWS.",
    },
    moniepoint,
  );
  assert.ok(opportunity);
  assert.ok(
    opportunity.eligibility.some((item) =>
      item.startsWith("Published eligible locations:"),
    ),
  );

  const request = recommendationRequestSchema.parse({
    user: {
      headline: "Frontend developer",
      location: "Accra, Ghana",
      experienceLevel: "early-career",
      skills: ["JavaScript", "React"],
      interests: ["Web3"],
      goals: ["Find remote software roles"],
    },
    filters: { categories: ["remote_job"], remote: true },
  });
  const score = scoreOpportunity(opportunity, request);
  assert.equal(score.hardMismatch, true);
  assert.ok(
    score.mismatchReasons?.some((reason) =>
      /published eligible locations/i.test(reason),
    ),
  );
});

test("African employer postings preserve regional location evidence", () => {
  const opportunity = normalizeGreenhouseJob(
    {
      id: 789,
      title: "Application Security Engineer",
      absolute_url:
        "https://job-boards.greenhouse.io/moniepoint/jobs/789",
      location: { name: "Remote, Nigeria" },
      departments: [{ name: "Financial Technology" }],
      content:
        "Build secure fintech services using Python, Linux, and cloud infrastructure.",
    },
    moniepoint,
  );

  assert.ok(opportunity);
  assert.equal(opportunity.location, "Remote, Nigeria");
  assert.equal(opportunity.remote, true);
  assert.ok(opportunity.tags.includes("Africa"));
  assert.ok(opportunity.tags.includes("fintech"));
  assert.ok(opportunity.eligibility.includes("Published location: Remote, Nigeria"));
});

test("missing Greenhouse identifiers are rejected", () => {
  assert.equal(
    normalizeGreenhouseJob(
      {
        title: "AI Intern",
        content: "Python",
      },
      oneEthos,
    ),
    null,
  );
});

test("description mentions do not misclassify a normal job as an internship", () => {
  const opportunity = normalizeGreenhouseJob(
    {
      id: 901,
      title: "Software Engineer",
      absolute_url: "https://job-boards.greenhouse.io/example/jobs/901",
      location: { name: "Remote, Nigeria" },
      content:
        "Build payment systems and mentor interns who join the company fellowship program.",
    },
    moniepoint,
  );

  assert.ok(opportunity);
  assert.equal(opportunity.category, "remote_job");
});

test("Greenhouse title and location remain authoritative over boilerplate", () => {
  const opportunity = normalizeGreenhouseJob(
    {
      id: 903,
      title: "Anthropic Fellows Program",
      absolute_url: "https://job-boards.greenhouse.io/anthropic/jobs/903",
      location: { name: "San Francisco, CA" },
      content:
        "The company supports remote employees. Fellows research machine learning systems using Python and Rust.",
    },
    greenhouseBoardConfigs[0],
  );

  assert.ok(opportunity);
  assert.equal(opportunity.category, "fellowship");
  assert.equal(opportunity.remote, false);
  assert.deepEqual(opportunity.requiredSkills, []);
  assert.ok(opportunity.preferredSkills.includes("Python"));
});

test("generic work environment language does not create Climate coverage", () => {
  const opportunity = normalizeGreenhouseJob(
    {
      id: 902,
      title: "Financial Operations Analyst",
      absolute_url: "https://job-boards.greenhouse.io/example/jobs/902",
      location: { name: "Remote, Nigeria" },
      content:
        "Work in a collaborative environment supporting payment operations.",
    },
    moniepoint,
  );

  assert.ok(opportunity);
  assert.deepEqual(matchedInterests(opportunity, ["Climate"]), []);
});
