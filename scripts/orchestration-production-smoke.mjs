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
        label: "Resume Benchmarking & Optimization",
      },
      { value: "generate_resume", number: 3, label: "Resume Generation" },
    ],
  );
  assert.ok(result.body.continuation?.token);
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
  assert.equal(metadata.body.version, "0.7.0");
  assert.equal(metadata.body.displayTitle, "Trakr Opportunity & Resume Services");
  assert.equal(metadata.body.submission.pricing, "free");
  assert.equal(metadata.body.submission.paymentRequired, false);
  assert.equal(openapi.body.info.version, "0.7.0");
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
  assert.equal(service.body.stage, "discover_choose_input");
  assert.deepEqual(
    service.body.requiredInputs[0].options.map((option) => option.value),
    ["resume", "background"],
  );
  const resume = await post({
    message: "1",
    continuation: service.body.continuation,
  });
  assert.equal(resume.body.stage, "discover_awaiting_resume");
  assert.equal(resume.body.conversation.requiredAction, "provide_resume");
  return {
    status: resume.response.status,
    stages: [service.body.stage, resume.body.stage],
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
  assert.equal(result.body.stage, "generate_awaiting_information");
  assert.deepEqual(
    result.body.requiredInputs.map((input) => input.id),
    ["generation_target", "verified_facts", "output_preferences"],
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

let benchmark;
await run("ORCH-PROD-011-benchmark-before-optimize", async () => {
  const result = await post({
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
  const result = await post({
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
