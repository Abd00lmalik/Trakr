import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const baseUrl =
  process.env.SMOKE_BASE_URL ??
  "https://trakr-production-c70e.up.railway.app";
const endpoint = `${baseUrl}/api/a2mcp/recommend`;
const results = [];

async function request(path, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body, durationMs: Date.now() - startedAt };
}

async function post(body, headers = {}) {
  return request("/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function confirmProfile(result) {
  if (result.body?.stage !== "profile_confirmation") return result;
  return post({
    message: "Yes, this extracted or supplied profile is accurate.",
    continuation: result.body.continuation,
  });
}

async function postWithProfileConfirmation(body, headers = {}) {
  return confirmProfile(await post(body, headers));
}

async function run(id, operation) {
  const startedAt = Date.now();
  try {
    const detail = await operation();
    results.push({
      id,
      pass: true,
      durationMs: Date.now() - startedAt,
      ...detail,
    });
  } catch (error) {
    results.push({
      id,
      pass: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function assertChooser(result) {
  assert.equal(result.response.status, 200);
  assert.equal(result.body.operation, "start");
  assert.equal(result.body.interactionState, "service_selection_required");
  assert.equal(result.body.stage, "choose_service");
  assert.equal(result.body.status, "needs_input");
  assert.equal(result.body.selectedService, null);
  assert.deepEqual(result.body.nextActions, [
    "discover",
    "benchmark",
    "generate_resume",
  ]);
  assert.deepEqual(
    result.body.requiredInputs[0].options.map((option) => ({
      value: option.value,
      number: option.number,
      label: option.label,
    })),
    [
      { value: "discover", number: 1, label: "Find opportunities" },
      {
        value: "benchmark",
        number: 2,
        label: "Resume Benchmarking and Optimization",
      },
      { value: "generate_resume", number: 3, label: "Resume Generation" },
    ],
  );
  assert.ok(result.body.continuation?.token);
  assert.deepEqual(result.body.conversation.missingInformation, []);
  assert.deepEqual(result.body.conversation.profile.unknownFields, []);
  assert.deepEqual(result.body.conversation.profile.evidence, []);
  assert.deepEqual(result.body.conversation.profile.draft.skills, []);
  assert.deepEqual(result.body.conversation.profile.draft.goals, []);
  assert.equal(result.response.headers.has("payment-required"), false);
  assert.equal(result.response.headers.has("www-authenticate"), false);
}

async function assertArtifacts(artifacts, regenerateAction) {
  assert.equal(artifacts?.length, 2);
  assert.deepEqual(
    artifacts.map((artifact) => artifact.format).sort(),
    ["docx", "pdf"],
  );
  for (const artifact of artifacts) {
    assert.equal(artifact.regenerateAction, regenerateAction);
    const response = await fetch(artifact.downloadUrl, { redirect: "error" });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), artifact.mimeType);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(bytes.byteLength, artifact.sizeBytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("base64url"),
      artifact.sha256,
    );
    assert.equal(
      artifact.format === "pdf"
        ? bytes.subarray(0, 5).toString("ascii")
        : bytes.subarray(0, 2).toString("ascii"),
      artifact.format === "pdf" ? "%PDF-" : "PK",
    );
  }
}

const declaration = `I'd like to use the service provided by Agent 5198:

Service title: Opportunity Matching API
Service type: A2MCP
Endpoint: https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend

Please use OKX Agent Payments Protocol to send a request to this endpoint`;

const consent = {
  processPersonalData: true,
  retention: "session_only",
  source: "explicit",
};

const resumeText = `AMINA FICTIONAL
Lagos, Nigeria
Frontend Developer
SKILLS
React, TypeScript, JavaScript, HTML, CSS, Git.
EXPERIENCE
Built and maintained a fictional React dashboard used by 2,500 students.
PROJECTS
Created an accessible TypeScript study planner and documented component tests.
EDUCATION
BSc Computer Science student at Fictional University.`;

const target = {
  role: "Frontend Engineer Intern",
  organization: "Fictional Labs",
  opportunityType: "internship",
  description:
    "Fictional Labs seeks a frontend engineering intern to build accessible interfaces. React and TypeScript are required. Students enrolled in a degree program are eligible.",
  requirements: [
    "React and TypeScript are required.",
    "Applicants must be enrolled in a degree program.",
  ],
  locale: "Nigeria",
};

await run("ORCH-PROD-001-metadata-readiness", async () => {
  const [health, metadata, openapi] = await Promise.all([
    request("/api/health"),
    request("/api/a2mcp"),
    request("/api/a2mcp/openapi"),
  ]);
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.database.artifactStorageReady, true);
  assert.equal(metadata.body.version, "0.8.0");
  assert.equal(metadata.body.displayTitle, "Trakr Opportunity & Resume Services");
  assert.equal(metadata.body.submission.pricing, "free");
  assert.equal(metadata.body.submission.paymentRequired, false);
  assert.equal(openapi.body.info.version, "0.8.0");
  assert.ok(openapi.body.paths["/api/artifacts/{id}"]);
  return {
    status: 200,
    version: metadata.body.version,
    artifactStorageReady: health.body.database.artifactStorageReady,
  };
});

let chooser;
await run("ORCH-PROD-002-empty-post", async () => {
  const result = await request("/api/a2mcp/recommend", { method: "POST" });
  assertChooser(result);
  return { status: result.response.status, stage: result.body.stage };
});

await run("ORCH-PROD-003-empty-object", async () => {
  const result = await post({});
  assertChooser(result);
  return { status: result.response.status, stage: result.body.stage };
});

await run("ORCH-PROD-004-operation-start", async () => {
  const result = await post({ operation: "start" });
  assertChooser(result);
  return { status: result.response.status, stage: result.body.stage };
});

await run("ORCH-PROD-005-exact-agent-declaration", async () => {
  const result = await post({ message: declaration });
  assertChooser(result);
  chooser = result.body;
  return {
    status: result.response.status,
    stage: result.body.stage,
    firstBusinessMessage: result.body.message,
  };
});

await run("ORCH-PROD-006-service1-menu-binding", async () => {
  const service = await post({
    message: "1",
    continuation: chooser.continuation,
  });
  assert.equal(service.body.stage, "choose_opportunity_categories");
  assert.deepEqual(
    service.body.requiredInputs[0].options.map((option) => option.value),
    [
      "jobs",
      "internships",
      "hackathons",
      "scholarships",
      "fellowships",
      "grants_funding",
      "bounties_freelance",
      "accelerators_incubators",
      "creator_opportunities",
      "competitions_challenges",
    ],
  );
  const categories = await post({
    message: "1 and 3",
    continuation: service.body.continuation,
  });
  assert.equal(categories.body.stage, "discover_collecting_context");
  assert.equal(
    categories.body.conversation.requiredAction,
    "provide_opportunity_context",
  );
  return {
    status: categories.response.status,
    stages: [service.body.stage, categories.body.stage],
  };
});

await run("ORCH-PROD-007-service2-selection", async () => {
  const result = await post({
    message: "2",
    continuation: chooser.continuation,
  });
  assert.equal(result.body.stage, "benchmark_awaiting_resume_and_target");
  assert.deepEqual(
    result.body.requiredInputs.map((input) => input.id),
    ["resume", "target", "consent"],
  );
  return { status: result.response.status, stage: result.body.stage };
});

await run("ORCH-PROD-008-service3-selection", async () => {
  const result = await post({
    message: "3",
    continuation: chooser.continuation,
  });
  assert.equal(result.body.stage, "generate_awaiting_target");
  assert.deepEqual(
    result.body.requiredInputs.map((input) => input.id),
    ["generation_target"],
  );
  assert.deepEqual(
    result.body.optionalInputs.map((input) => input.id),
    ["output_preferences"],
  );
  return { status: result.response.status, stage: result.body.stage };
});

await run("ORCH-PROD-009-stage-less-number", async () => {
  const result = await post({ message: "1" });
  assertChooser(result);
  return { status: result.response.status, stage: result.body.stage };
});

await run("ORCH-PROD-010-clear-natural-routing", async () => {
  const [discover, benchmark, generate] = await Promise.all([
    post({ message: "Find remote AI internships for a student in Nigeria." }),
    post({ message: "Benchmark my resume for this frontend engineering job." }),
    post({ message: "Create a resume for a product-design internship." }),
  ]);
  assert.equal(discover.body.selectedService, "opportunity_finding");
  assert.equal(
    benchmark.body.selectedService,
    "resume_benchmarking_optimization",
  );
  assert.equal(generate.body.selectedService, "resume_generation");
  return {
    status: 200,
    stages: [
      discover.body.stage,
      benchmark.body.stage,
      generate.body.stage,
    ],
  };
});

await run("ORCH-PROD-010A-caller-built-profile-confirmation", async () => {
  const first = await post({
    operation: "discover",
    intent: "opportunity_matching",
    message:
      "Find open high-value engineering opportunities, hackathons, grants, and Web3 bounties.",
  });
  assert.equal(first.body.recommendations.length, 0);

  const fabricated = await post({
    operation: "discover",
    intent: "opportunity_matching",
    continuation: first.body.continuation,
    message:
      "I am a senior full-stack Web3 and AI engineer skilled in TypeScript, React, Node.js, Python, Smart Contracts, and Autonomous AI Agents. I am seeking remote developer jobs, hackathons, Web3 bounties, and grants.",
    goals: ["remote jobs", "hackathons", "bounties", "grants"],
    interests: ["TypeScript", "Python", "Solidity", "AI Agents"],
  });
  assert.equal(fabricated.body.stage, "profile_confirmation");
  assert.equal(fabricated.body.confirmationRequired, true);
  assert.equal(fabricated.body.recommendations.length, 0);
  assert.equal(fabricated.body.callerInstructions.doNotSelectService, true);
  assert.equal(
    fabricated.body.callerInstructions.askUserForRequiredInputs,
    true,
  );
  return {
    status: fabricated.response.status,
    stage: fabricated.body.stage,
    recommendationCount: fabricated.body.recommendations.length,
  };
});

let benchmark;
await run("ORCH-PROD-011-benchmark-before-optimize", async () => {
  const result = await postWithProfileConfirmation({
    operation: "optimize",
    resumeText,
    consent,
    target,
  });
  assert.equal(result.body.stage, "optimize_confirmation");
  assert.equal(result.body.conversation.requiredAction, "confirm_optimization");
  assert.equal(result.body.capabilityResult.resumeOptimization, undefined);
  assert.equal(result.body.artifacts, undefined);
  benchmark = result.body;
  return { status: result.response.status, stage: result.body.stage };
});

await run("ORCH-PROD-012-approved-optimization-artifacts", async () => {
  const result = await post({
    message: "Yes, optimize using only my confirmed information.",
    continuation: benchmark.continuation,
  });
  assert.equal(result.body.stage, "optimize_completed");
  await assertArtifacts(result.body.artifacts, "optimize");
  return {
    status: result.response.status,
    stage: result.body.stage,
    artifacts: result.body.artifacts.map((artifact) => artifact.format),
  };
});

await run("ORCH-PROD-013-generation-artifacts", async () => {
  const result = await postWithProfileConfirmation({
    operation: "generate_resume",
    user: {
      name: "Amina Fictional",
      headline: "Frontend Developer",
      location: "Lagos, Nigeria",
      experienceLevel: "student",
      skills: ["React", "TypeScript", "Accessibility testing"],
      goals: ["Apply for a frontend internship"],
      education: ["BSc Computer Science student at Fictional University"],
      projects: ["Created an accessible TypeScript study planner."],
    },
    target,
    consent,
  });
  assert.equal(result.body.stage, "generate_completed");
  await assertArtifacts(result.body.artifacts, "generate_resume");
  return {
    status: result.response.status,
    stage: result.body.stage,
    artifacts: result.body.artifacts.map((artifact) => artifact.format),
  };
});

await run("ORCH-PROD-014-tampered-continuation", async () => {
  const token = chooser.continuation.token;
  const result = await post({
    message: "1",
    continuation: {
      ...chooser.continuation,
      token: `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`,
    },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.code, "invalid_session");
  return { status: result.response.status, code: result.body.code };
});

await run("ORCH-PROD-015-idempotent-bootstrap", async () => {
  const key = `orchestration-production-${Date.now()}`;
  const first = await post({}, { "Idempotency-Key": key });
  const replay = await post({}, { "Idempotency-Key": key });
  assert.equal(first.response.status, 200);
  assert.equal(replay.response.status, 200);
  assert.equal(replay.response.headers.get("x-idempotency-status"), "replayed");
  assert.equal(first.body.continuation.token, replay.body.continuation.token);
  return {
    status: replay.response.status,
    idempotencyStatus: replay.response.headers.get("x-idempotency-status"),
  };
});

const failed = results.filter((result) => !result.pass);
console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      baseUrl,
      endpoint,
      executedAt: new Date().toISOString(),
      passed: results.length - failed.length,
      failed: failed.length,
      results,
    },
    null,
    2,
  ),
);

if (failed.length) process.exitCode = 1;
