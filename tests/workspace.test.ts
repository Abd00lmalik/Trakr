import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildProfileDraftFromText,
  extractProfileFromText,
  parseResumeFile,
} from "../src/lib/resume/parser";
import { POST as parseResume } from "../src/app/api/profile/parse-resume/route";
import { GET as getOpenApi } from "../src/app/api/a2mcp/openapi/route";

const resumeText =
  "Amina Yusuf is a frontend developer and university student with React, TypeScript, JavaScript, SQL, and open source experience. Built accessible dashboards and API integrations for developer communities. Interested in hackathons, fellowships, remote work, AI, Web3, and grant-funded public goods. Portfolio https://example.com/amina";

test("profile generation creates an editable, useful draft", () => {
  const profile = buildProfileDraftFromText(resumeText);

  assert.equal(profile.headline, "Frontend Developer");
  assert.equal(profile.experienceLevel, "student");
  assert.ok(profile.bio && profile.bio.length >= 120);
  assert.deepEqual(
    profile.skills.slice(0, 4),
    ["React", "TypeScript", "JavaScript", "SQL"],
  );
  assert.ok(profile.interests.includes("hackathons"));
  assert.ok(profile.interests.includes("web3"));
  assert.ok(profile.goals.includes("Compete in hackathons"));
  assert.ok(profile.goals.includes("Find remote opportunities"));
  assert.deepEqual(profile.links, ["https://example.com/amina"]);
});

test("TXT resume parsing preserves enough context for recommendations", async () => {
  const file = new File([resumeText], "amina-resume.txt", {
    type: "text/plain",
  });
  const parsed = await parseResumeFile(file);
  assert.match(parsed, /frontend developer/i);
  assert.match(parsed, /TypeScript/);
});

test("skill detection does not match short skills inside unrelated words", () => {
  const profile = buildProfileDraftFromText(
    "Operations specialist who maintains reliable customer workflows and documents service processes.",
  );

  assert.ok(!profile.skills.includes("AI"));
});

test("resume extraction preserves evidence and separates inference from facts", () => {
  const parsed = extractProfileFromText(
    `Amina Yusuf
Frontend Developer
Location: Lagos, Nigeria

Skills:
React, TypeScript, Rust, Solidity

Experience:
Built a payment dashboard serving 12,000 monthly users.

Projects:
Open-source grant tracker with 35 contributors and automated API ingestion.

Education:
BSc Computer Science, University of Lagos

Certifications:
AWS Certified Cloud Practitioner`,
  );

  assert.equal(parsed.profile.location, "Lagos, Nigeria");
  assert.ok(parsed.profile.skills.includes("Rust"));
  assert.ok(
    parsed.profile.projects.some((project) => /35 contributors/i.test(project)),
  );
  assert.ok(
    parsed.profile.workHistory.some((entry) => /12,000 monthly users/i.test(entry)),
  );
  assert.ok(parsed.profile.education.some((entry) => /BSc Computer Science/i.test(entry)));
  assert.ok(parsed.profile.certifications.includes("AWS Certified Cloud Practitioner"));
  assert.equal(
    parsed.evidence.find((item) => item.field === "skills")?.source,
    "explicit",
  );
  assert.equal(
    parsed.evidence.find((item) => item.field === "headline")?.source,
    "inferred",
  );
});

test("resume extraction preserves natural locations and does not invent a headline", () => {
  const parsed = extractProfileFromText(
    `Jordan Okafor
Self-taught developer based in Accra, Ghana.
Skills: JavaScript, React, TypeScript.
Experience: Built a fictional community dashboard.
Goals: Seeking remote entry-level software opportunities.`,
  );

  assert.equal(parsed.profile.location, "Accra, Ghana");
  assert.equal(parsed.profile.headline, undefined);
  assert.ok(
    parsed.profile.workHistory.every(
      (entry) => !/^Goals:/i.test(entry),
    ),
  );
  assert.ok(parsed.profile.goals.includes("Find remote opportunities"));
});

test("workspace exposes the outcome-first Opportunity Finding journey", async () => {
  const workspace = await readFile(
    new URL("../src/components/opportunity-workspace.tsx", import.meta.url),
    "utf8",
  );

  for (const requirement of [
    "XMLHttpRequest",
    "Opportunity Finding",
    "Resume Benchmarking & Optimization",
    "Resume Generation",
    "Tell Trakr what you need",
    "Use my resume or CV",
    "Tell Trakr about my background",
    "Describe what I am looking for",
    "Session context is caller-carried",
    "Grounded matches",
    "No qualified matches yet",
    "Missing requirements",
    "Next actions",
    "verificationConfidence",
    "matchScore",
    "Apply now",
  ]) {
    assert.match(workspace, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("resume parser honors explicitly declined session-only consent", async () => {
  const formData = new FormData();
  formData.append(
    "resume",
    new File([resumeText], "amina-resume.txt", { type: "text/plain" }),
  );
  formData.append("consent", "false");

  const response = await parseResume(
    new Request("http://localhost/api/profile/parse-resume", {
      method: "POST",
      body: formData,
    }),
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "resume_consent_required");
});

test("resume parser requires affirmative session-only consent", async () => {
  const formData = new FormData();
  formData.append(
    "resume",
    new File([resumeText], "amina-resume.txt", { type: "text/plain" }),
  );

  const response = await parseResume(
    new Request("http://localhost/api/profile/parse-resume", {
      method: "POST",
      body: formData,
    }),
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "resume_consent_required");
});

test("OpenAPI documents additive discovery requests and required resume consent", async () => {
  const response = await getOpenApi();
  const document = await response.json();
  const recommendationSchema =
    document.paths["/api/a2mcp/recommend"].post.requestBody.content[
      "application/json"
    ].schema;
  const resumeOperation =
    document.paths["/api/profile/parse-resume"].post;
  const resumeSchema =
    resumeOperation.requestBody.content["multipart/form-data"].schema;

  assert.equal(recommendationSchema.type, "object");
  assert.equal("anyOf" in recommendationSchema, false);
  assert.match(recommendationSchema.description, /empty object/i);
  assert.deepEqual(resumeSchema.required, ["resume", "consent"]);
  assert.match(
    resumeSchema.properties.consent.description,
    /required explicit/i,
  );
  assert.ok(resumeOperation.responses["403"]);
});
