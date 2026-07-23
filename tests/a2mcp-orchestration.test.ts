import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Document, Packer, Paragraph } from "docx";
import PDFDocument from "pdfkit";
import { GET as downloadArtifact } from "../src/app/api/artifacts/[id]/route";
import { POST } from "../src/app/api/a2mcp/recommend/route";
import { GET as getOpenApi } from "../src/app/api/a2mcp/openapi/route";
import { curatedOfficialOpportunities } from "../src/lib/opportunities/data/curated-official-opportunities";
import {
  clearLocalArtifactsForTests,
  retrieveArtifact,
  storeArtifact,
} from "../src/lib/artifacts/store";
import {
  companionContextSchema,
  type DownloadableArtifact,
} from "../src/lib/types/opportunities";
import { createSessionReference } from "../src/lib/companion/session";

const consent = {
  processPersonalData: true,
  retention: "session_only" as const,
  source: "explicit" as const,
};

const resumeText = `AMINA TESTER
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
  opportunityType: "internship" as const,
  description:
    "Fictional Labs seeks a frontend engineering intern to build accessible interfaces. React and TypeScript are required. Students enrolled in a degree program are eligible.",
  requirements: [
    "React and TypeScript are required.",
    "Applicants must be enrolled in a degree program.",
  ],
  locale: "Nigeria",
};

const profile = {
  name: "Amina Tester",
  headline: "Frontend Developer",
  location: "Lagos, Nigeria",
  experienceLevel: "student" as const,
  skills: ["React", "TypeScript", "Accessibility testing"],
  interests: ["Software", "Design"],
  goals: ["Apply for a frontend internship"],
  education: ["BSc Computer Science student at Fictional University"],
  workHistory: ["Built and maintained a fictional student dashboard."],
  projects: ["Created an accessible TypeScript study planner."],
  research: [],
  publications: [],
  achievements: [],
  awards: [],
  volunteerExperience: [],
  leadership: [],
  certifications: [],
  links: ["https://example.com/fictional-portfolio"],
};

let requestSequence = 0;

async function callRoute(
  body?: unknown,
  headers: Record<string, string> = {},
) {
  requestSequence += 1;
  const requestHeaders: Record<string, string> = {
    "x-forwarded-for": `198.51.100.${requestSequence}`,
    ...headers,
  };
  let requestBody: string | undefined;
  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    requestBody = typeof body === "string" ? body : JSON.stringify(body);
  }
  const response = await POST(
    new Request("http://localhost/api/a2mcp/recommend", {
      method: "POST",
      headers: requestHeaders,
      body: requestBody,
    }),
  );
  return { response, body: await response.json() };
}

function assertChooser(body: Record<string, any>) {
  assert.equal(body.operation, "start");
  assert.equal(body.stage, "choose_service");
  assert.equal(body.status, "needs_input");
  assert.equal(body.selectedService, null);
  assert.deepEqual(body.nextActions, [
    "discover",
    "benchmark",
    "generate_resume",
  ]);
  assert.deepEqual(
    body.requiredInputs[0].options.map(
      (option: { value: string; number: number; label: string }) => ({
        value: option.value,
        number: option.number,
        label: option.label,
      }),
    ),
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
  assert.ok(body.continuation?.token.length >= 40);
}

async function docxBuffer(text: string) {
  return Buffer.from(
    await Packer.toBuffer(
      new Document({
        sections: [{ children: [new Paragraph(text)] }],
      }),
    ),
  );
}

async function pdfBuffer(text: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument();
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.text(text);
    pdf.end();
  });
}

async function assertDownload(artifact: DownloadableArtifact) {
  const url = new URL(artifact.downloadUrl);
  const id = url.pathname.split("/").at(-1);
  assert.ok(id);
  const response = await downloadArtifact(new Request(url), {
    params: Promise.resolve({ id }),
  });
  const content = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), artifact.mimeType);
  assert.match(
    response.headers.get("content-disposition") ?? "",
    new RegExp(`attachment; filename="${artifact.filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(content.byteLength, artifact.sizeBytes);
  assert.equal(
    createHash("sha256").update(content).digest("base64url"),
    artifact.sha256,
  );
  if (artifact.format === "pdf") {
    assert.equal(content.subarray(0, 5).toString("ascii"), "%PDF-");
  } else {
    assert.equal(content.subarray(0, 2).toString("ascii"), "PK");
  }
}

test("empty and minimal cold starts return the three-service chooser with HTTP 200", async () => {
  const cases = [
    undefined,
    {},
    { operation: "start" },
    { message: "" },
    { message: "Start" },
    { message: "Show available services" },
  ];
  for (const input of cases) {
    const result = await callRoute(input);
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get("x-trakr-version"), "0.7.0");
    assertChooser(result.body);
  }
});

test("caller-supplied profiles require confirmation and denial removes them", async () => {
  const supplied = await callRoute({
    operation: "discover",
    user: {
      headline: "Data Science/AI/ML",
      experienceLevel: "early-career",
      location: "Remote",
      skills: ["Python", "Machine learning"],
      interests: ["AI"],
      goals: ["Find remote opportunities"],
    },
  });

  assert.equal(supplied.body.stage, "profile_confirmation");
  assert.equal(supplied.body.profileOrigin, "caller_structured");
  assert.equal(supplied.body.profileConfirmed, false);
  assert.equal(supplied.body.confirmationRequired, true);
  assert.equal(supplied.body.recommendations.length, 0);
  assert.equal(supplied.body.callerInstructions.doNotGenerateAProfile, true);
  assert.ok(
    supplied.body.conversation.profile.evidence.every(
      (item: { source: string; confirmed: boolean }) =>
        item.source === "caller_supplied" && item.confirmed === false,
    ),
  );

  const denied = await callRoute({
    message: "No, that profile is incorrect. Start over.",
    continuation: supplied.body.continuation,
  });
  assert.equal(denied.body.stage, "discover_choose_input");
  assert.equal(denied.body.recommendations.length, 0);
  assert.equal(denied.body.conversation.profile.draft.headline, undefined);
  assert.equal(denied.body.conversation.profile.draft.skills.length, 0);
});

test("resume scholarship intake confirms extraction before collecting scholarship gates", async () => {
  const syntheticResume = `AMINA FICTIONAL
Lagos, Nigeria
EDUCATION
BSc Computer Science student at Fictional University
SKILLS
Python, JavaScript, React, SQL
PROJECTS
Built a fictional study planner and data dashboard.`;
  const extracted = await callRoute({
    operation: "discover",
    intakeRoute: "resume",
    message: "Find jobs, scholarships, and internships.",
    resumeText: syntheticResume,
    consent,
  });

  assert.equal(extracted.body.stage, "discover_missing_information");
  assert.equal(
    extracted.body.conversation.profile.draft.fieldOfStudy,
    "Computer Science",
  );
  assert.equal(extracted.body.recommendations.length, 0);
  assert.ok(
    extracted.body.requiredInputs.some(
      (item: { id: string }) => item.id === "nationality",
    ),
  );
  assert.ok(
    extracted.body.requiredInputs.some(
      (item: { id: string }) => item.id === "targetDegreeLevel",
    ),
  );
  assert.ok(
    extracted.body.requiredInputs.some(
      (item: { id: string }) => item.id === "preferredStudyCountries",
    ),
  );

  const matched = await callRoute({
    message:
      "My nationality is Nigerian. I live in Nigeria. I am targeting a Master's degree and I am willing to study in the United Kingdom, Germany, or Canada.",
    continuation: extracted.body.continuation,
  });
  assert.equal(matched.body.stage, "discover_completed");
  assert.deepEqual(
    new Set(
      matched.body.categoryCoverage.map(
        (item: { category: string }) => item.category,
      ),
    ),
    new Set(["remote_job", "scholarship", "internship"]),
  );
  assert.ok(
    matched.body.directOpportunities.every(
      (item: { officialUrl?: string }) => Boolean(item.officialUrl),
    ),
  );
  for (const item of matched.body.directOpportunities) {
    assert.match(matched.body.message, new RegExp(item.officialUrl));
  }
  assert.match(
    matched.body.categoryCoverage
      .map((item: { reason: string }) => item.reason)
      .join(" "),
    /Trakr|verified direct|current profile/i,
  );
});

test("learning resources cannot be direct scholarships", () => {
  const expected = new Map([
    ["official-microsoft-learn-student-hub", "learning_resource"],
    ["official-github-education", "student_benefit"],
    ["official-google-developer-programs", "developer_program"],
  ]);
  for (const [id, category] of expected) {
    const opportunity = curatedOfficialOpportunities.find(
      (item) => item.id === id,
    );
    assert.ok(opportunity, id);
    assert.equal(opportunity.category, category, id);
    assert.notEqual(opportunity.category, "scholarship", id);
    assert.equal(opportunity.verificationStatus, "program_directory", id);
  }
  assert.equal(
    curatedOfficialOpportunities.some(
      (item) => item.title === "Developer Student Scholarship",
    ),
    false,
  );
});

test("multipart recommendation upload returns a confirmation continuation without echoing resume text", async () => {
  const formData = new FormData();
  formData.append(
    "resume",
    new File([resumeText], "synthetic-resume.txt", { type: "text/plain" }),
  );
  formData.append("consent", "true");
  formData.append("operation", "discover");
  formData.append("intakeRoute", "resume");
  formData.append("message", "Find internships.");

  const response = await POST(
    new Request("http://localhost/api/a2mcp/recommend", {
      method: "POST",
      headers: { "x-forwarded-for": "198.51.100.220" },
      body: formData,
    }),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.stage, "discover_completed");
  assert.equal(body.profileOrigin, "mixed");
  assert.ok(body.evidenceSources.includes("resume"));
  assert.doesNotMatch(body.continuation.token, /AMINA|React|TypeScript/i);
});

test("OpenAPI fully types visible recommendation links and separated collections", async () => {
  const response = await getOpenApi();
  const document = await response.json();
  const success =
    document.paths["/api/a2mcp/recommend"].post.responses["200"].content[
      "application/json"
    ].schema;
  const recommendation =
    success.properties.directOpportunities.items;
  assert.ok(recommendation.required.includes("officialUrl"));
  assert.equal(
    recommendation.properties.officialUrl.format,
    "uri",
  );
  assert.ok(success.required.includes("directOpportunities"));
  assert.ok(success.required.includes("explorePrograms"));
  assert.ok(success.required.includes("supportingResources"));
  assert.ok(success.required.includes("categoryCoverage"));
  assert.ok(
    document.paths["/api/a2mcp/recommend"].post.requestBody.content[
      "multipart/form-data"
    ],
  );
});

test("the exact Agent 5198 service declaration remains an ambiguous cold start", async () => {
  const message = `I'd like to use the service provided by Agent 5198:

Service title: Opportunity Matching API
Service type: A2MCP
Endpoint: https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend

Please use OKX Agent Payments Protocol to send a request to this endpoint`;
  const result = await callRoute({ message });
  assert.equal(result.response.status, 200);
  assertChooser(result.body);
  assert.equal(result.body.paymentRequired, undefined);
  assert.equal(result.response.headers.has("payment-required"), false);
  assert.equal(result.response.headers.has("www-authenticate"), false);
});

test("clear natural-language outcomes route directly to the matching service", async () => {
  const discovery = await callRoute({
    message: "Find remote AI internships for a student in Nigeria.",
  });
  assert.equal(discovery.response.status, 200);
  assert.equal(
    discovery.body.conversation?.service,
    "opportunity_finding",
  );
  assert.notEqual(discovery.body.stage, "choose_service");

  const benchmark = await callRoute({
    message: "Benchmark my resume for this frontend engineering job.",
  });
  assert.equal(
    benchmark.body.conversation?.service,
    "resume_benchmarking_optimization",
  );
  assert.equal(
    benchmark.body.conversation?.requiredAction,
    "provide_resume_or_verified_background",
  );

  const generation = await callRoute({
    message: "Create a resume for a product-design internship.",
  });
  assert.equal(generation.body.conversation?.service, "resume_generation");
  assert.equal(generation.body.conversation?.requiredAction, "provide_generation_evidence");
});

test("numeric choices are bound to the continuation stage", async () => {
  const cold = await callRoute({});
  const discovery = await callRoute({
    message: "1",
    continuation: cold.body.continuation,
  });
  assert.equal(discovery.body.stage, "discover_choose_input");
  assert.deepEqual(
    discovery.body.requiredInputs[0].options.map(
      (option: { value: string; number: number }) => [
        option.value,
        option.number,
      ],
    ),
    [
      ["resume", 1],
      ["background", 2],
    ],
  );

  const resumeRoute = await callRoute({
    message: "1",
    continuation: discovery.body.continuation,
  });
  assert.equal(resumeRoute.body.stage, "discover_awaiting_resume");
  assert.equal(resumeRoute.body.conversation?.requiredAction, "provide_resume");

  const withoutContinuation = await callRoute({ message: "1" });
  assertChooser(withoutContinuation.body);
  const invalidNumber = await callRoute({
    message: "9",
    continuation: cold.body.continuation,
  });
  assertChooser(invalidNumber.body);
});

test("each top-level service selection returns service-specific required inputs", async () => {
  const cold = await callRoute({});
  const benchmark = await callRoute({
    message: "2",
    continuation: cold.body.continuation,
  });
  assert.equal(benchmark.body.stage, "benchmark_awaiting_resume_and_target");
  assert.equal(
    benchmark.body.selectedService,
    "resume_benchmarking_optimization",
  );
  assert.deepEqual(
    benchmark.body.requiredInputs.map((input: { id: string }) => input.id),
    ["resume", "target", "consent"],
  );

  const generation = await callRoute({
    message: "3",
    continuation: cold.body.continuation,
  });
  assert.equal(generation.body.stage, "generate_awaiting_information");
  assert.equal(generation.body.selectedService, "resume_generation");
  assert.deepEqual(
    generation.body.requiredInputs.map((input: { id: string }) => input.id),
    ["generation_target", "verified_facts", "output_preferences"],
  );
});

test("TXT, DOCX, and PDF base64 documents are parsed through the public contract", async () => {
  const documents = [
    {
      fileName: "synthetic-resume.txt",
      mimeType: "text/plain",
      content: Buffer.from(resumeText, "utf8"),
    },
    {
      fileName: "synthetic-resume.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: await docxBuffer(resumeText),
    },
    {
      fileName: "synthetic-resume.pdf",
      mimeType: "application/pdf",
      content: await pdfBuffer(resumeText),
    },
  ];

  for (const document of documents) {
    const result = await callRoute({
      operation: "benchmark",
      document: {
        representation: "base64",
        kind: "resume",
        fileName: document.fileName,
        mimeType: document.mimeType,
        dataBase64: document.content.toString("base64"),
      },
      consent,
      target,
    });
    assert.equal(result.response.status, 200, document.fileName);
    assert.equal(
      result.body.stage,
      "optimize_confirmation",
      document.fileName,
    );
    assert.ok(
      result.body.capabilityResult?.resumeBenchmark,
      document.fileName,
    );
  }
});

test("unsafe, malformed, unsupported, and oversized document inputs fail structurally", async () => {
  const malformed = await callRoute({
    operation: "benchmark",
    document: {
      representation: "base64",
      kind: "resume",
      fileName: "resume.pdf",
      mimeType: "application/pdf",
      dataBase64: "not-base64",
    },
    consent,
    target,
  });
  assert.equal(malformed.response.status, 400);
  assert.equal(malformed.body.code, "invalid_document");

  const wrongSignature = await callRoute({
    operation: "benchmark",
    document: {
      representation: "base64",
      kind: "resume",
      fileName: "resume.pdf",
      mimeType: "application/pdf",
      dataBase64: Buffer.from(resumeText).toString("base64"),
    },
    consent,
    target,
  });
  assert.equal(wrongSignature.response.status, 400);
  assert.equal(wrongSignature.body.code, "invalid_document");

  const unsupported = await callRoute({
    operation: "benchmark",
    document: {
      representation: "base64",
      kind: "resume",
      fileName: "resume.rtf",
      mimeType: "application/rtf",
      dataBase64: Buffer.from(resumeText).toString("base64"),
    },
    consent,
    target,
  });
  assert.equal(unsupported.response.status, 400);
  assert.equal(unsupported.body.code, "invalid_document");

  const oversized = await callRoute({
    message: "x".repeat(6001),
  });
  assert.equal(oversized.response.status, 400);
  assert.equal(oversized.body.code, "validation_error");
});

test("benchmarking precedes optimization and explicit decline creates no artifact", async () => {
  clearLocalArtifactsForTests();
  const supplied = await callRoute({
    operation: "optimize",
    document: {
      representation: "text",
      kind: "resume",
      fileName: "synthetic-resume.txt",
      mimeType: "text/plain",
      text: resumeText,
    },
    consent,
    target,
  });
  assert.equal(supplied.body.stage, "optimize_confirmation");
  assert.equal(supplied.body.conversation?.requiredAction, "confirm_optimization");
  assert.equal(supplied.body.capabilityResult?.resumeOptimization, undefined);
  assert.equal(supplied.body.artifacts, undefined);

  const declined = await callRoute({
    message: "No, finish with the benchmark.",
    continuation: supplied.body.continuation,
  });
  assert.equal(declined.body.stage, "benchmark_completed");
  assert.equal(declined.body.status, "completed");
  assert.equal(declined.body.artifacts, undefined);
});

test("approved optimization creates authorized, evidence-linked DOCX and PDF artifacts", async () => {
  clearLocalArtifactsForTests();
  const supplied = await callRoute({
    operation: "optimize",
    resumeText,
    consent,
    target,
  });
  assert.equal(supplied.body.stage, "optimize_confirmation");
  const optimized = await callRoute({
    message: "Yes, optimize using only my confirmed information.",
    continuation: supplied.body.continuation,
  });
  assert.equal(optimized.body.stage, "optimize_completed");
  assert.equal(optimized.body.status, "completed");
  assert.equal(optimized.body.artifacts.length, 2);
  assert.deepEqual(
    optimized.body.artifacts
      .map((artifact: DownloadableArtifact) => artifact.format)
      .sort(),
    ["docx", "pdf"],
  );
  assert.equal(
    /increased revenue|managed 50 people|10,000 users/i.test(
      JSON.stringify(optimized.body.capabilityResult),
    ),
    false,
  );
  for (const artifact of optimized.body.artifacts as DownloadableArtifact[]) {
    assert.equal(artifact.regenerateAction, "optimize");
    await assertDownload(artifact);
  }
});

test("target-first generation creates real downloadable artifacts without invented claims", async () => {
  clearLocalArtifactsForTests();
  const supplied = await callRoute({
    operation: "generate_resume",
    user: profile,
    target,
    consent,
  });
  assert.equal(supplied.body.stage, "profile_confirmation");
  const generated = await callRoute({
    message: "Yes, this profile is accurate.",
    continuation: supplied.body.continuation,
  });
  assert.equal(generated.body.stage, "generate_completed");
  assert.equal(generated.body.status, "completed");
  assert.equal(generated.body.artifacts.length, 2);
  assert.equal(
    /increased revenue|managed 50 people|10,000 users/i.test(
      JSON.stringify(generated.body.capabilityResult),
    ),
    false,
  );
  for (const artifact of generated.body.artifacts as DownloadableArtifact[]) {
    assert.equal(artifact.regenerateAction, "generate_resume");
    await assertDownload(artifact);
  }
});

test("artifact bearer authorization and expiration fail closed", async () => {
  clearLocalArtifactsForTests();
  const stored = await storeArtifact({
    artifactType: "resume",
    format: "pdf",
    filename: "synthetic resume.pdf",
    mimeType: "application/pdf",
    content: Buffer.from("%PDF-1.4\nfictional\n", "ascii"),
    regenerateAction: "generate_resume",
    now: new Date("2020-01-01T00:00:00.000Z"),
  });
  const storedUrl = new URL(stored.downloadUrl);
  const id = storedUrl.pathname.split("/").at(-1);
  assert.ok(id);

  const missingToken = await downloadArtifact(
    new Request(`http://localhost/api/artifacts/${id}`),
    { params: Promise.resolve({ id }) },
  );
  assert.equal(missingToken.status, 401);
  assert.equal(missingToken.headers.get("referrer-policy"), "no-referrer");

  const wrongToken = await downloadArtifact(
    new Request(`http://localhost/api/artifacts/${id}?token=wrong-token`),
    { params: Promise.resolve({ id }) },
  );
  assert.equal(wrongToken.status, 404);

  const expired = await retrieveArtifact(
    id,
    storedUrl.searchParams.get("token") ?? "",
    new Date("2021-01-01T00:00:00.000Z"),
  );
  assert.equal(expired.status, "expired");
});

test("tampered and expired continuation references return structured errors", async () => {
  const cold = await callRoute({});
  const tamperedToken = `${cold.body.continuation.token.slice(0, -1)}${
    cold.body.continuation.token.endsWith("A") ? "B" : "A"
  }`;
  const tampered = await callRoute({
    message: "1",
    continuation: {
      ...cold.body.continuation,
      token: tamperedToken,
    },
  });
  assert.equal(tampered.response.status, 400);
  assert.equal(tampered.body.code, "invalid_session");

  const expiredReference = createSessionReference(
    companionContextSchema.parse({
      operation: "start",
      stage: "choose_service",
    }),
    new Date("2020-01-01T00:00:00.000Z"),
  );
  const expired = await callRoute({
    message: "1",
    continuation: expiredReference,
  });
  assert.equal(expired.response.status, 410);
  assert.equal(expired.body.code, "expired_session");
});

test("bootstrap idempotency replays the same chooser and rejects conflicting content", async () => {
  const key = `orchestration-${Date.now()}`;
  const first = await callRoute(
    {},
    { "Idempotency-Key": key, "x-forwarded-for": "203.0.113.200" },
  );
  const replay = await callRoute(
    {},
    { "Idempotency-Key": key, "x-forwarded-for": "203.0.113.200" },
  );
  assert.equal(first.response.status, 200);
  assert.equal(replay.response.status, 200);
  assert.equal(replay.response.headers.get("x-idempotency-status"), "replayed");
  assert.equal(replay.body.continuation.token, first.body.continuation.token);

  const conflict = await callRoute(
    { operation: "start" },
    { "Idempotency-Key": key, "x-forwarded-for": "203.0.113.200" },
  );
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.code, "idempotency_conflict");
});

test("malformed JSON remains an HTTP 400 without echoing private content", async () => {
  const result = await callRoute('{"message":"PRIVATE-FICTIONAL-MARKER"');
  assert.equal(result.response.status, 400);
  assert.equal(result.body.code, "invalid_json");
  assert.equal(JSON.stringify(result.body).includes("PRIVATE-FICTIONAL-MARKER"), false);
});
