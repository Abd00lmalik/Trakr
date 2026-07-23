import assert from "node:assert/strict";

const baseUrl =
  process.env.SMOKE_BASE_URL ??
  "https://trakr-production-c70e.up.railway.app";
const endpoint = `${baseUrl}/api/a2mcp/recommend`;
const today = new Date().toISOString().slice(0, 10);
const results = [];

async function post(body) {
  const startedAt = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    durationMs: Date.now() - startedAt,
  };
}

function auditRecommendations(body, forbiddenValues = []) {
  const recommendations = body.recommendations ?? [];
  const canonicalUrls = recommendations.map(
    (item) => item.opportunity.canonicalUrl,
  );
  assert.equal(new Set(canonicalUrls).size, canonicalUrls.length);
  for (const item of recommendations) {
    assert.equal(item.opportunity.isActive, true);
    assert.notEqual(item.opportunity.sourceStatus, "inactive");
    if (item.opportunity.deadline) {
      assert.ok(item.opportunity.deadline >= today);
    }
    if (item.recommendedAction === "Apply Now") {
      assert.equal(item.opportunity.verificationStatus, "verified");
      assert.ok(
        ["active", "redirected"].includes(item.opportunity.sourceStatus),
      );
      assert.ok(item.opportunity.verificationConfidence >= 0.75);
    }
  }
  const serialized = JSON.stringify(body);
  for (const value of forbiddenValues) {
    assert.equal(serialized.includes(value), false);
  }
  return recommendations;
}

async function completeJourney(initial, followUp) {
  let response = await post(initial);
  assert.equal(response.status, 200);

  if (
    response.body.conversation?.state === "needs_more_information" &&
    followUp
  ) {
    response = await post({
      message: followUp,
      continuation: response.body.conversation.continuation,
    });
    assert.equal(response.status, 200);
  }
  if (response.body.conversation?.state === "profile_confirmation") {
    response = await post({
      message: "Proceed with matching.",
      continuation: response.body.conversation.continuation,
    });
    assert.equal(response.status, 200);
  }
  assert.equal(response.body.conversation?.state, "recommendations");
  return response;
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

await run("S1-PROD-RERUN-001-resume-student", async () => {
  const email = "amina.student@example.invalid";
  const response = await completeJourney({
    operation: "discover",
    intakeRoute: "resume",
    consent: {
      processPersonalData: true,
      retention: "session_only",
      source: "explicit",
    },
    resumeText: `AMINA FICTIONAL
Lagos, Nigeria | ${email}
Computer Science Student
SKILLS
Python, React, TypeScript, Git, SQL, machine learning.
PROJECTS
Built a fictional student study planner and a small image classifier.
EDUCATION
BSc Computer Science student at Fictional University.
GOAL
Seeking remote AI or software engineering internships open to students in Nigeria.`,
  });
  const recommendations = auditRecommendations(response.body, [email]);
  assert.deepEqual(response.body.querySummary.filtersApplied.categories, [
    "internship",
  ]);
  assert.equal(response.body.querySummary.filtersApplied.remote, true);
  assert.equal(response.body.conversation.profile.draft.location, "Lagos, Nigeria");
  assert.ok(
    recommendations.every(
      (item) => item.opportunity.category === "internship",
    ),
  );
  return {
    status: response.status,
    recommendations: recommendations.length,
    categories: response.body.querySummary.filtersApplied.categories,
  };
});

await run("S1-PROD-RERUN-002-resume-career-changer", async () => {
  const email = "kofi.career@example.invalid";
  const response = await completeJourney({
    operation: "discover",
    intakeRoute: "resume",
    consent: {
      processPersonalData: true,
      retention: "session_only",
      source: "explicit",
    },
    resumeText: `KOFI FICTIONAL
Accra, Ghana | ${email}
Self-taught developer with two years of project experience.
SKILLS
Solidity, JavaScript, React, TypeScript, Foundry, Git.
PROJECTS
Built a fictional token dashboard and contributed documentation to open-source repositories.
GOAL
Find blockchain hackathons, Web3 bounties, and entry-level remote software roles.`,
  });
  const recommendations = auditRecommendations(response.body, [email]);
  const categories = response.body.querySummary.filtersApplied.categories ?? [];
  assert.ok(categories.includes("hackathon"));
  assert.ok(categories.includes("web3_bounty"));
  assert.ok(categories.includes("remote_job"));
  assert.equal(response.body.conversation.profile.draft.location, "Accra, Ghana");
  assert.equal(
    recommendations.some((item) => /\bsenior|staff|principal\b/i.test(item.opportunity.title)),
    false,
  );
  return {
    status: response.status,
    recommendations: recommendations.length,
    categories,
  };
});

await run("S1-PROD-RERUN-003-background-new-graduate", async () => {
  const response = await completeJourney({
    operation: "discover",
    intakeRoute: "background",
    message:
      "I am a new graduate in Kenya and my experience level is early-career. I use React, TypeScript, Python, Git, and SQL. I built a fictional accessibility dashboard and a campus scheduling project. I want remote software internships and entry-level jobs.",
  });
  const recommendations = auditRecommendations(response.body);
  assert.equal(response.body.conversation.profile.draft.location, "Kenya");
  assert.equal(
    response.body.conversation.profile.draft.experienceLevel,
    "early-career",
  );
  return {
    status: response.status,
    recommendations: recommendations.length,
  };
});

await run("S1-PROD-RERUN-004-background-designer", async () => {
  const response = await completeJourney({
    operation: "discover",
    intakeRoute: "background",
    message:
      "I am a mid-level product designer in Portugal with three years of experience. My skills are Figma, user research, prototyping, design systems, and accessibility testing. I built fictional climate-dashboard and fintech-onboarding projects. I want remote or Europe-based climate and fintech product design jobs and competitions.",
  });
  const recommendations = auditRecommendations(response.body);
  assert.equal(response.body.conversation.profile.draft.location, "Portugal");
  assert.equal(
    recommendations.some((item) =>
      /\binterior|interiores|architecture designer\b/i.test(
        item.opportunity.title,
      ),
    ),
    false,
  );
  return {
    status: response.status,
    recommendations: recommendations.length,
    coverage: response.body.coverage?.interests,
  };
});

await run("S1-PROD-RERUN-005-background-researcher", async () => {
  const response = await completeJourney(
    {
      operation: "discover",
      intakeRoute: "background",
      message:
        "I am a mid-level public policy researcher in Uganda with four years of nonprofit research experience. My skills include qualitative interviews, survey design, academic writing, Excel, and data analysis. I supported a fictional digital-inclusion study. I want remote scholarships, fellowships, grants, and research opportunities, not software jobs.",
    },
    "Field of study: Public policy. Current degree level: Master's degree completed. Target degree level: Doctorate or PhD. Nationality: Ugandan. Country of residence: Uganda. Preferred study countries: United Kingdom and Germany.",
  );
  const recommendations = auditRecommendations(response.body);
  const categories = response.body.querySummary.filtersApplied.categories ?? [];
  assert.equal(categories.includes("remote_job"), false);
  assert.equal(
    recommendations.some((item) => item.opportunity.category === "remote_job"),
    false,
  );
  return {
    status: response.status,
    recommendations: recommendations.length,
    categories,
  };
});

await run("S1-PROD-RERUN-006-free-form-ai-internship", async () => {
  const response = await completeJourney(
    {
      message: "Find remote AI internships for a student in Nigeria.",
    },
    "I use Python, React, TypeScript, Git, SQL, and machine learning. I built a fictional classifier and student dashboard.",
  );
  const recommendations = auditRecommendations(response.body);
  assert.deepEqual(response.body.querySummary.filtersApplied.categories, [
    "internship",
  ]);
  assert.equal(response.body.querySummary.filtersApplied.remote, true);
  assert.ok(
    recommendations.every(
      (item) => item.opportunity.category === "internship",
    ),
  );
  return {
    status: response.status,
    recommendations: recommendations.length,
    coverage: response.body.coverage?.interests,
  };
});

await run("S1-PROD-RERUN-007-free-form-multi-interest", async () => {
  const response = await completeJourney(
    {
      message:
        "I want active climate, fintech, and AI opportunities that I can apply to remotely from Africa.",
    },
    "I am an early-career data analyst in Nigeria. I use Python, SQL, data analysis, statistics, and machine learning. I want jobs, internships, grants, and fellowships.",
  );
  const recommendations = auditRecommendations(response.body);
  const coverage = response.body.coverage?.interests ?? [];
  assert.ok(coverage.some((item) => item.interest === "AI"));
  assert.ok(coverage.some((item) => item.interest === "Climate"));
  assert.ok(coverage.some((item) => item.interest === "Fintech"));
  assert.ok(
    coverage.every((item) =>
      ["covered", "limited", "no_qualified_matches"].includes(item.status),
    ),
  );
  return {
    status: response.status,
    recommendations: recommendations.length,
    coverage,
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

if (failed.length) {
  process.exitCode = 1;
}
