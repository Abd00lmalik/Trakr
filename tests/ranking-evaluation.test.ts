import assert from "node:assert/strict";
import test from "node:test";
import { evaluationPersonas } from "../evaluation/personas";
import {
  evaluateRanking,
  evaluationCatalog,
} from "../src/lib/recommendation/evaluation";
import {
  rankOpportunities,
  scoreOpportunity,
} from "../src/lib/recommendation/scoring";
import { buildRecommendationNarrative } from "../src/lib/recommendation/action-plan";
import { enforceRecommendationConsistency } from "../src/lib/recommendation/service";
import {
  opportunitySchema,
  recommendationRequestSchema,
  type Opportunity,
  type RecommendationResponse,
} from "../src/lib/types/opportunities";

test("evaluation corpus contains 50 to 100 representative personas", () => {
  assert.equal(evaluationPersonas.length, 60);
  assert.equal(
    new Set(evaluationPersonas.map((persona) => persona.archetype)).size,
    12,
  );
  for (const persona of evaluationPersonas) {
    assert.ok(persona.expected.opportunityIds.length >= 2);
    assert.ok(persona.expected.categories.length >= 1);
    assert.ok(persona.expected.signals.length >= 3);
  }
});

test("ranking benchmark produces all required metrics", () => {
  const report = evaluateRanking(evaluationPersonas);
  assert.equal(report.personaCount, 60);
  assert.equal(report.catalogSize, evaluationCatalog.length);
  assert.equal(report.personas.length, 60);

  for (const metric of [
    report.metrics.precisionAt3,
    report.metrics.precisionAt5,
    report.metrics.ndcgAt5,
    report.metrics.recall,
    report.metrics.irrelevantResultRate,
    report.metrics.falseApplyNowRate,
  ]) {
    assert.ok(metric >= 0 && metric <= 1);
  }
});

test("benchmark protects minimum ranking quality and Apply Now safety", () => {
  const report = evaluateRanking(evaluationPersonas);
  assert.ok(report.metrics.precisionAt3 >= 0.8);
  assert.ok(report.metrics.precisionAt5 >= 0.75);
  assert.ok(report.metrics.ndcgAt5 >= 0.83);
  assert.ok(report.metrics.recall >= 0.35);
  assert.ok(report.metrics.irrelevantResultRate <= 0.1);
  assert.equal(report.metrics.falseApplyNowRate, 0);
});

test("benchmark rewards honest short lists instead of requiring padding", () => {
  const report = evaluateRanking(evaluationPersonas);
  const securityPersona = report.personas.find(
    (persona) => persona.id === "security-student-core",
  );

  assert.ok(securityPersona);
  assert.equal(securityPersona.topResults.length, 2);
  assert.equal(securityPersona.precisionAt3, 1);
  assert.equal(securityPersona.ndcgAt5, 1);
});

function opportunity(
  id: string,
  title: string,
  requiredSkills: string[],
  summary = `${title} with a clear active role description and documented responsibilities for qualified applicants.`,
): Opportunity {
  return opportunitySchema.parse({
    id,
    title,
    organization: "Example Organization",
    category: "remote_job",
    summary,
    sourceName: "Official curated source",
    sourceUrl: `https://example.com/${id}`,
    location: "Remote",
    remote: true,
    deadline: "2026-12-31",
    requiredSkills,
    preferredSkills: [],
    eligibility: [],
    benefits: ["Paid remote role"],
    tags: ["remote job"],
    difficulty: "medium",
    verificationStatus: "verified",
    lastVerifiedAt: "2026-07-19T00:00:00.000Z",
    lastSeenAt: "2026-07-19T00:00:00.000Z",
    sourceStatus: "active",
    httpStatus: 200,
    canonicalUrl: `https://example.com/${id}`,
    publisherDomain: "example.com",
    isActive: true,
    verificationConfidence: 1,
  });
}

test("hard mismatch filtering excludes unrelated operational roles", () => {
  const request = recommendationRequestSchema.parse({
    user: {
      headline: "Frontend developer building AI and Web3 products",
      experienceLevel: "early-career",
      location: "Nigeria",
      skills: ["React", "TypeScript", "Python", "Solidity"],
      interests: ["AI", "Web3"],
      goals: ["Find a remote frontend role"],
    },
    filters: { remote: true },
  });
  const frontend = opportunity("frontend-role", "Frontend Developer", [
    "React",
    "TypeScript",
  ]);
  const procurement = opportunity(
    "procurement-role",
    "Procurement Specialist",
    ["supplier sourcing", "purchasing operations"],
  );
  const courier = opportunity("courier-role", "Remote Courier Coordinator", [
    "dispatch operations",
    "fleet coordination",
  ]);
  const merchandising = opportunity(
    "merchandising-role",
    "Retail Merchandiser",
    ["visual merchandising", "retail operations"],
  );
  const operator = opportunity("operator-role", "Production Operator", [
    "machine operation",
    "production line safety",
  ]);
  const ambiguousOperator = opportunity(
    "ambiguous-operator-role",
    "Exuma Operator",
    ["React"],
    "Plant operator responsible for water treatment, desalination equipment, mechanical maintenance, and hand and power tools.",
  );
  const museum = opportunity("museum-role", "Museum Specialist", [
    "remote collaboration",
  ]);
  const customerEngagement = opportunity(
    "customer-engagement-role",
    "Associate Customer Engagement",
    ["remote collaboration"],
  );
  const graphicDesigner = opportunity(
    "graphic-designer-role",
    "Graphic Designer",
    ["remote collaboration"],
  );
  const socialMedia = opportunity(
    "social-media-role",
    "Social Media Assistant Instagram",
    ["remote collaboration"],
  );
  const founderResidence = opportunity(
    "founder-residence-role",
    "Founder Residence",
    ["remote collaboration"],
  );
  const contentCreator = opportunity(
    "content-creator-role",
    "Creador de Contenido Pago por Video",
    ["remote collaboration"],
  );
  const interiorDesigner = opportunity(
    "interior-designer-role",
    "Designer de Interiores",
    ["remote collaboration"],
  );
  const medicalScheduler = opportunity(
    "medical-scheduler-role",
    "Medical Scheduler",
    ["remote collaboration"],
  );
  const gatehouseOperator = opportunity(
    "gatehouse-role",
    "Operador de Portaria Remota Recife PE",
    ["remote collaboration"],
  );
  const ambiguousRecruitingTitle = opportunity(
    "ambiguous-recruiting-role",
    "Contribute Building a Secure Nation",
    ["React"],
  );

  for (const unrelated of [
    procurement,
    courier,
    merchandising,
    operator,
    ambiguousOperator,
    museum,
    customerEngagement,
    graphicDesigner,
    socialMedia,
    founderResidence,
    contentCreator,
    interiorDesigner,
    medicalScheduler,
    gatehouseOperator,
    ambiguousRecruitingTitle,
  ]) {
    const scored = scoreOpportunity(unrelated, request);
    assert.equal(
      scored.hardMismatch,
      true,
      `${unrelated.title} should be a hard mismatch`,
    );
    assert.equal(scored.action, "Skip");
    assert.ok(scored.score <= 20);
  }

  const ranked = rankOpportunities(
    [
      procurement,
      frontend,
      courier,
      merchandising,
      operator,
      ambiguousOperator,
      museum,
      customerEngagement,
      graphicDesigner,
      socialMedia,
      founderResidence,
      contentCreator,
      interiorDesigner,
      medicalScheduler,
      gatehouseOperator,
      ambiguousRecruitingTitle,
      opportunity("short-title", "Et", ["React"]),
      opportunity("generic-role", "Create Your Own Role", ["React"]),
      opportunity("open-position", "Open Position - Dauphine", ["React"]),
    ],
    request,
  );
  assert.deepEqual(
    ranked.map((candidate) => candidate.opportunity.id),
    ["frontend-role"],
  );
});

test("post-enhancement consistency prevents negative reasoning and action promotion", () => {
  const strong = opportunity("strong-role", "Frontend Developer", [
    "React",
    "TypeScript",
  ]);
  const weak = opportunity("weak-role", "Frontend Developer Trainee", [
    "React",
  ]);
  const base: RecommendationResponse = {
    service: "trakr",
    version: "0.1.0",
    requestId: "consistency-test",
    generatedAt: "2026-07-19T00:00:00.000Z",
    provider: "deterministic-local",
    aiStatus: "fallback",
    querySummary: {
      profileSignals: [],
      filtersApplied: {},
      totalCandidates: 2,
    },
    recommendations: [
      {
        rank: 1,
        opportunity: strong,
        matchScore: 82,
        reasoning: "Strong capability alignment.",
        missingRequirements: ["portfolio evidence"],
        recommendedAction: "Prepare First",
        nextSteps: ["Verify the role.", "Prepare relevant evidence."],
      },
      {
        rank: 2,
        opportunity: weak,
        matchScore: 70,
        reasoning: "Moderate alignment.",
        missingRequirements: [],
        recommendedAction: "Prepare First",
        nextSteps: ["Verify the role.", "Prepare relevant evidence."],
      },
    ],
    actionPlan: { immediate: [], sevenDayPlan: [], thirtyDayPlan: [] },
    learningRoadmap: {
      focusAreas: [],
      resourcesToFind: [],
      practiceProjects: [],
    },
    agentNotes: [
      "Candidates are grounded in stored or structured source opportunities before AI enhancement.",
      "Scores combine category fit, skills, experience level, location, source quality, deadline urgency, and expected value.",
      "Responses are designed for direct consumption by other AI agents.",
    ],
  };
  const enhanced: RecommendationResponse = {
    ...base,
    provider: "gemini:test",
    aiStatus: "enhanced",
    agentNotes: [
      "Prioritize the first opportunity because it offers the best environment.",
      "Documentation is your biggest gap.",
    ],
    recommendations: [
      {
        ...base.recommendations[0],
        recommendedAction: "Apply Now",
        reasoning: "Strong capability alignment with a clear next step.",
      },
      {
        ...base.recommendations[1],
        matchScore: 92,
        recommendedAction: "Apply Now",
        reasoning:
          "This is unrelated to the user's background and is not a good fit.",
      },
    ],
  };

  const consistent = enforceRecommendationConsistency(enhanced, base);
  assert.deepEqual(
    consistent.recommendations.map((item) => item.opportunity.id),
    ["strong-role"],
  );
  assert.equal(
    consistent.recommendations[0].recommendedAction,
    "Prepare First",
  );
  assert.equal(consistent.recommendations[0].matchScore, 82);
  assert.equal(
    consistent.recommendations[0].reasoning,
    base.recommendations[0].reasoning,
  );
  assert.deepEqual(
    consistent.recommendations[0].missingRequirements,
    base.recommendations[0].missingRequirements,
  );
  assert.deepEqual(
    consistent.recommendations[0].nextSteps,
    base.recommendations[0].nextSteps,
  );
  assert.deepEqual(consistent.agentNotes, [
    ...base.agentNotes,
    "Gemini completed remotely; deterministic evidence guardrails control final ranking, reasoning, gaps, actions, and next steps.",
  ]);
  assert.equal(
    consistent.agentNotes.some((note) =>
      /best environment|biggest gap/i.test(note),
    ),
    false,
  );
});

test("deterministic recommendation narrative uses the correct action article", () => {
  const candidate = scoreOpportunity(
    opportunity("apply-now-role", "Frontend Developer", [
      "React",
      "TypeScript",
    ]),
    recommendationRequestSchema.parse({
      user: {
        headline: "Frontend developer",
        experienceLevel: "mid-level",
        location: "Nigeria",
        skills: ["React", "TypeScript"],
        interests: ["Frontend"],
        goals: ["Find a remote job"],
      },
      filters: { remote: true },
    }),
  );
  const applyNowCandidate = {
    ...candidate,
    action: "Apply Now" as const,
  };

  assert.match(
    buildRecommendationNarrative(applyNowCandidate),
    /is an Apply Now candidate/i,
  );
  assert.doesNotMatch(
    buildRecommendationNarrative(applyNowCandidate),
    /\ba apply now\b/i,
  );
});
