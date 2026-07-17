import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildProfileDraftFromText,
  parseResumeFile,
} from "../src/lib/resume/parser";

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

test("workspace includes the complete milestone journey", async () => {
  const workspace = await readFile(
    new URL("../src/components/opportunity-workspace.tsx", import.meta.url),
    "utf8",
  );

  for (const requirement of [
    "XMLHttpRequest",
    "Generating profile...",
    "Review profile",
    "Profile summary",
    "Find matches",
    "Your matches",
    "Missing requirements",
    "Next actions",
    "verificationConfidence",
    "matchScore",
    "Apply now",
  ]) {
    assert.match(workspace, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
