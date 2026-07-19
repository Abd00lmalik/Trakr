import assert from "node:assert/strict";
import test from "node:test";
import { handleOpportunityCompanionRequest } from "../src/lib/companion/service";
import { resolveSessionContext } from "../src/lib/companion/session";
import {
  opportunityCompanionRequestSchema,
  opportunityCompanionResponseSchema,
  recommendationRequestSchema,
  recommendationResponseSchema,
} from "../src/lib/types/opportunities";
import { generateRecommendations } from "../src/lib/recommendation/service";
import { POST } from "../src/app/api/a2mcp/recommend/route";

test("profileless first contact offers all Opportunity Finding intake paths", async () => {
  const request = opportunityCompanionRequestSchema.parse({
    message: "I want opportunities.",
  });
  const response = await handleOpportunityCompanionRequest(request);

  assert.doesNotThrow(() => opportunityCompanionResponseSchema.parse(response));
  assert.equal(response.conversation?.state, "choose_profile_source");
  assert.equal(response.recommendations.length, 0);
  assert.match(
    response.conversation?.message ?? "",
    /without requiring a resume/i,
  );
  assert.deepEqual(
    response.conversation?.choices?.map((choice) => choice.id),
    ["resume", "background", "request"],
  );
});

test("source choice continues into background collection without requiring a resume", async () => {
  const initial = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message:
        "I want to use Agent #5198, the Opportunity Matching API, through its A2MCP endpoint.",
    }),
  );
  assert.equal(initial.conversation?.state, "choose_profile_source");

  const collecting = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "2",
      continuation: initial.conversation?.continuation,
    }),
  );
  assert.equal(collecting.conversation?.state, "collecting_background");
  assert.equal(collecting.conversation?.requiredAction, "provide_background");

  const matched = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message:
        "I am a Nigerian computer science student. I use React, TypeScript, Python, and Solidity. I have built two small web apps and want remote AI and Web3 hackathons or internships.",
      continuation: collecting.conversation?.continuation,
    }),
  );
  assert.equal(matched.conversation?.state, "recommendations");
  assert.ok(matched.recommendations.length > 0);
});

test("resume path preserves extracted evidence and continues within the session", async () => {
  const initial = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "Use the Opportunity Matching API from Agent #5198.",
    }),
  );
  const awaitingResume = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "1",
      continuation: initial.conversation?.continuation,
    }),
  );
  assert.equal(awaitingResume.conversation?.state, "awaiting_resume");

  const response = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      resumeText: `Amina Yusuf
Frontend Developer
Location: Lagos, Nigeria
Skills: React, TypeScript, Python, Solidity
Experience: Built and maintained a React dashboard for 2,500 users.
Projects: Created an open-source Web3 opportunity tracker with API ingestion.
Education: Computer Science student at University of Lagos.
Goals: Seeking remote AI and Web3 internships and hackathons.`,
      consent: {
        processPersonalData: true,
        retention: "session_only",
        source: "explicit",
      },
      continuation: awaitingResume.conversation?.continuation,
    }),
  );

  assert.equal(response.conversation?.state, "recommendations");
  assert.equal(
    resolveSessionContext(response.conversation?.continuation)?.profileSource,
    "resume",
  );
  assert.ok(response.conversation?.profile.draft.projects.length);
  assert.equal(
    response.conversation?.profile.evidence.find(
      (item) => item.field === "projects",
    )?.origin,
    "resume",
  );
  const headlineEvidence = response.conversation?.profile.evidence.find(
    (item) => item.field === "headline" && item.origin === "inference",
  );
  assert.equal(headlineEvidence?.source, "inferred");

  const followUp = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "What am I missing for the top opportunity?",
      continuation: response.conversation?.continuation,
    }),
  );
  assert.equal(
    followUp.conversation?.profile.evidence.find(
      (item) => item.field === "headline" && item.origin === "inference",
    )?.source,
    "inferred",
  );
});

test("minimal student input asks for gates instead of making weak recommendations", async () => {
  const response = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "I am a student interested in AI and Web3.",
    }),
  );

  assert.equal(response.conversation?.state, "needs_more_information");
  assert.equal(response.recommendations.length, 0);
  assert.ok(
    response.conversation?.missingInformation.some(
      (item) => item.field === "skills" && item.required,
    ),
  );
  assert.ok(
    response.conversation?.missingInformation.some(
      (item) => item.field === "goals" && item.required,
    ),
  );
});

test("natural-language background builds a grounded profile and recommendations", async () => {
  const request = opportunityCompanionRequestSchema.parse({
    message:
      "I am a Nigerian computer science student. I know React, TypeScript, Python, and some Solidity. I want remote AI and Web3 hackathons, grants, fellowships, and internships.",
  });
  const response = await handleOpportunityCompanionRequest(request);

  assert.doesNotThrow(() => opportunityCompanionResponseSchema.parse(response));
  assert.equal(response.conversation?.state, "recommendations");
  assert.equal(response.conversation?.profile.draft.location, "Nigeria");
  assert.equal(
    response.conversation?.profile.evidence.find(
      (item) => item.field === "location",
    )?.source,
    "inferred",
  );
  assert.equal(
    response.conversation?.profile.draft.experienceLevel,
    "student",
  );
  assert.deepEqual(
    response.conversation?.profile.draft.skills.slice(0, 4),
    ["React", "TypeScript", "Python", "Solidity"],
  );
  assert.ok(response.recommendations.length > 0);
  assert.ok(response.recommendations.length <= 10);
  assert.ok(
    response.recommendations.every(
      (item) =>
        typeof item.confidenceScore === "number" &&
        Boolean(item.guidanceAction),
    ),
  );
});

test("natural skill phrasing ending in experience clears the skill gate", async () => {
  const response = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message:
        "I am a Nigerian computer science student with React, TypeScript, Python, and Solidity experience. I want remote AI and Web3 hackathons, grants, fellowships, and internships.",
    }),
  );

  assert.equal(response.conversation?.state, "recommendations");
  assert.deepEqual(
    response.conversation?.profile.draft.skills.slice(0, 4),
    ["React", "TypeScript", "Python", "Solidity"],
  );
});

test("legacy structured requests preserve the original direct contract", async () => {
  const request = recommendationRequestSchema.parse({
    user: {
      headline: "Frontend developer interested in Web3 public goods",
      skills: ["React", "TypeScript", "Technical writing"],
      experienceLevel: "early-career",
      location: "Lagos, Nigeria",
      goals: ["Find a hackathon"],
      interests: ["web3", "open source"],
    },
    filters: {
      categories: ["hackathon", "grant"],
      remote: true,
      limit: 3,
    },
  });
  const response = await generateRecommendations(request);

  assert.doesNotThrow(() => recommendationResponseSchema.parse(response));
  assert.equal("conversation" in response, false);
  assert.ok(response.recommendations.length > 0);
  assert.ok(response.recommendations.length <= 3);
});

test("follow-up explanation and readiness use caller-scoped continuation context", async () => {
  const initial = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message:
        "I am a Nigerian computer science student with React, TypeScript, Python, and Solidity skills. I want remote AI and Web3 hackathons and grants.",
    }),
  );
  const context = initial.conversation?.continuation;
  const resolvedContext = resolveSessionContext(context);
  assert.ok(resolvedContext?.selectedOpportunityId);

  const explanation = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "Why did you recommend this?",
      context,
    }),
  );
  assert.equal(explanation.conversation?.state, "explanation");
  assert.doesNotThrow(() =>
    opportunityCompanionResponseSchema.parse(explanation),
  );
  assert.equal(
    explanation.capabilityResult?.explanation?.opportunityId,
    resolvedContext?.selectedOpportunityId,
  );
  assert.ok(
    explanation.capabilityResult?.explanation?.whyItMatches.length,
  );

  const readiness = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "What am I missing for this opportunity?",
      context,
    }),
  );
  assert.equal(readiness.conversation?.state, "readiness");
  assert.doesNotThrow(() => opportunityCompanionResponseSchema.parse(readiness));
  assert.equal(
    readiness.capabilityResult?.readiness?.opportunityId,
    resolvedContext?.selectedOpportunityId,
  );
  assert.ok(
    readiness.capabilityResult?.readiness?.evidenceAssessment.some((item) =>
      /No work history evidence/i.test(item),
    ),
  );
});

test("resume optimization refuses to invent missing experience", async () => {
  const withoutEvidence = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message:
        "I am an early career frontend developer with React and TypeScript skills. I want a remote frontend role. Optimize my resume for a frontend engineer role.",
      target: {
        role: "Frontend Engineer",
      },
    }),
  );
  assert.equal(
    withoutEvidence.conversation?.state,
    "needs_more_information",
  );
  assert.match(
    withoutEvidence.conversation?.message ?? "",
    /will not invent experience/i,
  );

  const withEvidence = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "Optimize my resume for a frontend engineer role.",
      target: {
        role: "Frontend Engineer",
      },
      context: {
        profile: {
          headline: "Frontend Developer",
          experienceLevel: "early-career",
          location: "Nigeria",
          skills: ["React", "TypeScript", "JavaScript"],
          interests: ["AI"],
          goals: ["Find a remote role"],
          education: ["Computer Science student"],
          workHistory: [
            "Built a React dashboard for a student developer community.",
          ],
          links: ["https://example.com/portfolio"],
        },
        profileConfirmed: true,
      },
    }),
  );

  assert.equal(
    withEvidence.conversation?.state,
    "resume_optimization",
  );
  assert.doesNotThrow(() =>
    opportunityCompanionResponseSchema.parse(withEvidence),
  );
  const optimization =
    withEvidence.capabilityResult?.resumeOptimization;
  assert.ok(optimization);
  assert.match(optimization.factualIntegrity, /Do not add unsupported/i);
  assert.ok(
    optimization.experienceGuidance[0].includes(
      "Built a React dashboard",
    ),
  );
});

test("mixed structured and conversational input does not ignore the requested intent", async () => {
  const request = new Request("http://localhost/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Optimize my resume for a frontend engineer role.",
      intent: "resume_optimization",
      user: {
        headline: "Frontend Developer",
        experienceLevel: "early-career",
        location: "Nigeria",
        skills: ["React", "TypeScript", "JavaScript"],
        interests: ["AI"],
        goals: ["Find a remote role"],
        education: ["Computer Science student"],
        workHistory: [
          "Built a React dashboard for a student developer community.",
        ],
        links: ["https://example.com/portfolio"],
      },
      target: { role: "Frontend Engineer" },
    }),
  });
  const response = await POST(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.conversation?.state, "resume_optimization");
  assert.ok(body.capabilityResult?.resumeOptimization);
});

test("profile and continuation aliases remain compatible at the API boundary", async () => {
  const legacyAlias = await POST(
    new Request("http://localhost/api/a2mcp/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: {
          headline: "Frontend developer",
          experienceLevel: "early-career",
          location: "Nigeria",
          skills: ["React", "TypeScript"],
          interests: ["Web3"],
          goals: ["Find a remote role"],
          education: [],
          workHistory: [],
          projects: [],
          certifications: [],
          links: [],
        },
        filters: { remote: true, limit: 2 },
      }),
    }),
  );
  const legacyBody = await legacyAlias.json();
  assert.equal(legacyAlias.status, 200);
  assert.equal("conversation" in legacyBody, false);
  assert.ok(Array.isArray(legacyBody.recommendations));

  const initial = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message:
        "I am a Nigerian student with React, TypeScript, Python, and Solidity skills looking for remote AI and Web3 opportunities.",
    }),
  );
  const continuationAlias = await POST(
    new Request("http://localhost/api/a2mcp/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Why is this a good fit?",
        continuation: initial.conversation?.continuation,
      }),
    }),
  );
  const continuationBody = await continuationAlias.json();
  assert.equal(continuationAlias.status, 200);
  assert.equal(continuationBody.conversation?.state, "explanation");
});

test("profile confirmation and corrections preserve session facts", async () => {
  const draft = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      intent: "profile_build",
      message:
        "I am an early career frontend developer in Nigeria. I know React and TypeScript. I want a remote frontend job.",
    }),
  );
  assert.equal(draft.conversation?.state, "profile_confirmation");
  const originalBio = draft.conversation?.profile.draft.bio;

  const confirmed = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "Yes, looks good.",
      continuation: draft.conversation?.continuation,
    }),
  );
  assert.equal(confirmed.conversation?.state, "recommendations");
  assert.equal(confirmed.conversation?.profile.draft.bio, originalBio);
  const confirmedContext = resolveSessionContext(
    confirmed.conversation?.continuation,
  );
  assert.equal(confirmedContext?.profileConfirmed, true);
  assert.equal(
    confirmedContext?.awaitingProfileConfirmation,
    false,
  );

  const corrected = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message:
        "I am now based in Ghana and I am a mid-level frontend developer.",
      continuation: confirmed.conversation?.continuation,
    }),
  );
  assert.equal(corrected.conversation?.profile.draft.location, "Ghana");
  assert.equal(
    corrected.conversation?.profile.draft.experienceLevel,
    "mid-level",
  );
  assert.ok(corrected.conversation?.profile.draft.skills.includes("React"));
});
