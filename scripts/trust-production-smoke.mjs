import assert from "node:assert/strict";

const baseUrl =
  process.env.SMOKE_BASE_URL ??
  "https://trakr-production-c70e.up.railway.app";
const endpoint = `${baseUrl}/api/a2mcp/recommend`;
const expectedMenu =
  "Choose a service:\n1. Find opportunities\n2. Resume Benchmarking & Optimization\n3. Resume Generation";
const forbiddenScholarshipTitles = new Set([
  "Microsoft Learn Student Hub",
  "GitHub Education Student Developer Pack",
  "Google Developer Programs",
]);
const declaration = `I'd like to use the service provided by Agent 5198:

Service title: Opportunity Matching API
Service type: A2MCP
Endpoint: https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend

Please use OKX Agent Payments Protocol to send a request to this endpoint`;

async function parseResponse(response) {
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : null,
  };
}

async function post(body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await parseResponse(
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    if (result.response.status !== 429) return result;
    const retryAfter = Number(result.response.headers.get("retry-after") ?? 1);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1, retryAfter) * 1000),
    );
  }
  throw new Error("Production rate limit did not clear after four attempts.");
}

async function runMultipartResume() {
  const formData = new FormData();
  formData.append(
    "resume",
    new File(
      [
        `AMINA FICTIONAL
Lagos, Nigeria
EDUCATION
BSc Computer Science student at Fictional University
SKILLS
Python, JavaScript, React, SQL
PROJECTS
Built a fictional study planner and data dashboard.`,
      ],
      "synthetic-resume.txt",
      { type: "text/plain" },
    ),
  );
  formData.append("consent", "true");
  formData.append("operation", "discover");
  formData.append("intakeRoute", "resume");
  formData.append("message", "Find jobs, scholarships, and internships.");
  return parseResponse(await fetch(endpoint, { method: "POST", body: formData }));
}

async function assertOfficialUrl(url) {
  const parsed = new URL(url);
  assert.equal(["localhost", "127.0.0.1"].includes(parsed.hostname), false);
  assert.equal(parsed.protocol, "https:");
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "manual",
    headers: { "User-Agent": "Trakr-Release-Verification/0.7.0" },
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(
    response.status >= 200 && response.status < 500,
    `${url} returned ${response.status}`,
  );
  return response.status;
}

const coldStarts = [];
for (let index = 0; index < 5; index += 1) {
  const result = await post({ message: declaration });
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get("x-trakr-version"), "0.7.0");
  assert.equal(result.body.stage, "choose_service");
  assert.equal(result.body.operation, "start");
  assert.equal(result.body.message, expectedMenu);
  assert.equal(result.body.selectedService, null);
  assert.ok(result.body.requestId);
  assert.ok(result.body.continuation?.token);
  coldStarts.push({
    requestId: result.body.requestId,
    stage: result.body.stage,
    version: result.body.version,
  });
}
assert.equal(new Set(coldStarts.map((item) => item.requestId)).size, 5);

const chooser = await post({ message: declaration });
const selected = await post({
  message: "1",
  continuation: chooser.body.continuation,
});
assert.equal(selected.body.stage, "discover_choose_input");
assert.equal(selected.body.recommendations.length, 0);

const callerProfile = await post({
  operation: "discover",
  user: {
    headline: "Data Science and AI",
    location: "Nigeria",
    experienceLevel: "early-career",
    skills: ["Python"],
    interests: ["AI"],
    goals: ["Find remote opportunities"],
  },
});
assert.equal(callerProfile.body.stage, "profile_confirmation");
assert.equal(callerProfile.body.profileOrigin, "caller_structured");
assert.equal(callerProfile.body.profileConfirmed, false);
assert.equal(callerProfile.body.confirmationRequired, true);
assert.equal(callerProfile.body.recommendations.length, 0);

const denied = await post({
  message: "No, that profile is incorrect. Start over.",
  continuation: callerProfile.body.continuation,
});
assert.equal(denied.body.stage, "discover_choose_input");
assert.equal(denied.body.recommendations.length, 0);
assert.equal(denied.body.conversation.profile.draft.headline, undefined);
assert.equal(denied.body.conversation.profile.draft.skills.length, 0);

const uploaded = await runMultipartResume();
assert.equal(uploaded.response.status, 200);
assert.equal(uploaded.body.stage, "profile_confirmation");
assert.equal(uploaded.body.profileOrigin, "mixed");
assert.equal(
  uploaded.body.conversation.profile.draft.fieldOfStudy,
  "Computer Science",
);
assert.equal(
  uploaded.body.conversation.profile.draft.currentDegreeLevel,
  "BSc",
);
assert.doesNotMatch(uploaded.body.continuation.token, /AMINA|React|TypeScript/i);

const confirmed = await post({
  message: "Yes, this extracted profile is accurate.",
  continuation: uploaded.body.continuation,
});
assert.equal(confirmed.body.stage, "discover_missing_information");

const completed = await post({
  message:
    "Nationality: Nigerian. Country of residence: Nigeria. Target degree level: Master's degree. Preferred study countries: United Kingdom, Germany, and Canada.",
  continuation: confirmed.body.continuation,
});
assert.equal(completed.response.status, 200);
assert.equal(completed.body.stage, "discover_completed");
assert.equal(completed.body.querySummary.filtersApplied.applicantCountry, "Nigeria");
assert.equal(
  completed.body.querySummary.filtersApplied.applicantNationality,
  "Nigerian",
);
assert.deepEqual(
  new Set(completed.body.categoryCoverage.map((item) => item.category)),
  new Set(["remote_job", "scholarship", "internship"]),
);

const directScholarships = completed.body.directOpportunities.filter(
  (item) => item.opportunity.category === "scholarship",
);
assert.ok(
  directScholarships.some(
    (item) =>
      item.opportunity.title === "Rhodes Scholarship for West Africa 2027",
  ),
);
assert.equal(
  directScholarships.some(
    (item) =>
      item.opportunity.title ===
      "Rhodes Scholarship for Southern Africa 2027",
  ),
  false,
);

for (const item of completed.body.directOpportunities) {
  assert.ok(item.officialUrl);
  assert.equal(completed.body.message.includes(item.officialUrl), true);
  assert.equal(forbiddenScholarshipTitles.has(item.opportunity.title), false);
  assert.equal(/&lt;|&gt;|<script|<style/i.test(item.eligibilitySummary), false);
  assert.ok(item.eligibilitySummary.length <= 481);
}
assert.equal(/&lt;|&gt;|<script|<style/i.test(completed.body.message), false);

for (const item of completed.body.supportingResources) {
  if (forbiddenScholarshipTitles.has(item.opportunity.title)) {
    assert.notEqual(item.opportunity.category, "scholarship");
    assert.notEqual(item.recommendationState, "apply_now");
  }
}

const scholarshipUrlChecks = [];
for (const item of directScholarships) {
  scholarshipUrlChecks.push({
    title: item.opportunity.title,
    url: item.officialUrl,
    status: await assertOfficialUrl(item.officialUrl),
  });
}

const openApi = await parseResponse(
  await fetch(`${baseUrl}/api/a2mcp/openapi`),
);
assert.equal(openApi.response.status, 200);
const responseSchema =
  openApi.body.paths["/api/a2mcp/recommend"].post.responses["200"].content[
    "application/json"
  ].schema;
assert.ok(
  responseSchema.properties.directOpportunities.items.required.includes(
    "officialUrl",
  ),
);
assert.ok(
  openApi.body.paths["/api/a2mcp/recommend"].post.requestBody.content[
    "multipart/form-data"
  ],
);

console.log(
  JSON.stringify(
    {
      ok: true,
      executedAt: new Date().toISOString(),
      baseUrl,
      endpoint,
      coldStarts,
      noInventedProfile: {
        initialStage: selected.body.stage,
        callerProfileStage: callerProfile.body.stage,
        deniedStage: denied.body.stage,
      },
      multipart: {
        profileOrigin: uploaded.body.profileOrigin,
        fieldOfStudy: uploaded.body.conversation.profile.draft.fieldOfStudy,
        finalStage: completed.body.stage,
      },
      categoryCoverage: completed.body.categoryCoverage,
      directScholarships: directScholarships.map((item) => ({
        title: item.opportunity.title,
        officialUrl: item.officialUrl,
        deadline: item.deadline,
        deadlineStatus: item.deadlineStatus,
        recommendationState: item.recommendationState,
      })),
      scholarshipUrlChecks,
      visibleMessageLength: completed.body.message.length,
      openApiOfficialUrlRequired: true,
      paymentAttempted: false,
    },
    null,
    2,
  ),
);
