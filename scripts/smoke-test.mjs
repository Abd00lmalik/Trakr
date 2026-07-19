import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const port = Number.parseInt(process.env.SMOKE_PORT ?? "3101", 10);
const baseUrl = process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${port}`;
const shouldStartServer = !process.env.SMOKE_BASE_URL;

// A locally spawned production server needs a stable key to exercise opaque
// continuation references. Remote smoke tests must use the deployed secret.
if (shouldStartServer && !process.env.TRAKR_SESSION_SECRET) {
  process.env.TRAKR_SESSION_SECRET =
    "smoke-test-session-secret-not-for-production";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { response, body };
}

async function createSamplePdf(filePath, text) {
  const { default: PDFDocument } = await import("pdfkit");
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", async () => {
      try {
        await fs.writeFile(filePath, Buffer.concat(chunks));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    doc.on("error", reject);
    doc.fontSize(18).text("Amina Yusuf", { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(text);
    doc.end();
  });
}

async function createSampleDocx(filePath, text) {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Amina Yusuf", bold: true })],
          }),
          new Paragraph(text),
        ],
      },
    ],
  });
  await fs.writeFile(filePath, await Packer.toBuffer(doc));
}

async function uploadResume(filePath, type) {
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append("resume", new File([bytes], path.basename(filePath), { type }));
  form.append("consent", "true");
  return requestJson("/api/profile/parse-resume", {
    method: "POST",
    body: form,
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const { response, body } = await requestJson("/api/health");
      if (response.ok && body?.service === "trakr") {
        return body;
      }
    } catch {
      // Server may still be booting.
    }

    await wait(1000);
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

let server;
if (shouldStartServer) {
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", String(port)],
    {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
}

try {
  const health = await waitForHealth();
  const metadata = await requestJson("/api/a2mcp");

  if (!metadata.response.ok || metadata.body?.type !== "A2MCP") {
    throw new Error("A2MCP metadata endpoint did not return the expected contract.");
  }

  const openapi = await requestJson("/api/a2mcp/openapi");
  if (!openapi.response.ok || openapi.body?.openapi !== "3.1.0") {
    throw new Error("OpenAPI endpoint did not return the expected document.");
  }

  const resumeText =
    "Frontend developer with React, TypeScript, JavaScript, technical writing, open source, Web3, and Solidity basics experience. Interested in hackathons, grants, internships, remote jobs, AI tools, public goods, and developer communities. Built Next.js dashboards and API integrations.";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "trakr-smoke-"));
  const pdfPath = path.join(tempDir, "amina-yusuf-resume.pdf");
  const docxPath = path.join(tempDir, "amina-yusuf-resume.docx");
  await createSamplePdf(pdfPath, resumeText);
  await createSampleDocx(docxPath, resumeText);

  const parsedPdf = await uploadResume(pdfPath, "application/pdf");
  const parsedDocx = await uploadResume(
    docxPath,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );

  if (!parsedPdf.response.ok || !parsedPdf.body?.resumeText?.includes("TypeScript")) {
    throw new Error(
      `PDF resume upload did not parse expected text: ${JSON.stringify(parsedPdf.body)}`,
    );
  }
  if (parsedPdf.response.headers.get("cache-control") !== "no-store") {
    throw new Error("Resume parsing response must be marked no-store.");
  }

  if (!parsedDocx.response.ok || !parsedDocx.body?.resumeText?.includes("TypeScript")) {
    throw new Error(
      `DOCX resume upload did not parse expected text: ${JSON.stringify(parsedDocx.body)}`,
    );
  }

  const validPayload = {
    user: {
      headline: "Frontend developer interested in Web3 public goods",
      skills: ["React", "TypeScript", "Solidity basics", "Technical writing"],
      experienceLevel: "early-career",
      location: "Lagos, Nigeria",
      goals: ["win a hackathon", "earn grant funding"],
      interests: ["web3", "open source"],
    },
    filters: {
      categories: ["hackathon", "grant", "web3_bounty"],
      remote: true,
      limit: 3,
    },
    resumeText: parsedPdf.body.resumeText,
  };

  const recommendation = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  });

  if (!recommendation.response.ok) {
    throw new Error(
      `Recommendation endpoint failed with ${recommendation.response.status}: ${JSON.stringify(
        recommendation.body,
      )}`,
    );
  }
  if (recommendation.response.headers.get("cache-control") !== "no-store") {
    throw new Error("Recommendation response must be marked no-store.");
  }

  if (
    recommendation.body?.service !== "trakr" ||
    !["enhanced", "retrying", "degraded", "fallback"].includes(recommendation.body?.aiStatus) ||
    !Array.isArray(recommendation.body?.recommendations) ||
    recommendation.body.recommendations.length === 0
  ) {
    throw new Error("Recommendation response did not match the expected A2MCP shape.");
  }

  const forbiddenTitles = [/^all jobs?$/i, /^apply here$/i, /^expression of interest/i];
  const badRecommendation = recommendation.body.recommendations.find((item) =>
    forbiddenTitles.some((pattern) => pattern.test(item.opportunity.title)),
  );
  if (badRecommendation) {
    throw new Error(`Low-quality generic listing was recommended: ${badRecommendation.opportunity.title}`);
  }

  const unsafeApplyNow = recommendation.body.recommendations.find(
    (item) =>
      item.recommendedAction === "Apply Now" &&
      (item.opportunity.verificationStatus !== "verified" ||
        item.opportunity.isActive !== true),
  );
  if (unsafeApplyNow) {
    throw new Error(
      `Unverified or inactive opportunity received Apply Now: ${unsafeApplyNow.opportunity.title}`,
    );
  }

  const rawProviderLeak = JSON.stringify(recommendation.body).match(
    /quota|generativelanguage\.googleapis\.com|GoogleGenerativeAI Error|stack trace/i,
  );
  if (rawProviderLeak) {
    throw new Error("Recommendation response leaked raw AI provider details.");
  }

  const profilelessConversation = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "I want opportunities." }),
  });
  if (
    !profilelessConversation.response.ok ||
    profilelessConversation.body?.conversation?.state !==
      "choose_profile_source" ||
    profilelessConversation.body?.conversation?.choices?.length !== 3 ||
    JSON.stringify(profilelessConversation.body?.conversation?.choices).includes(
      "service",
    )
  ) {
    throw new Error(
      `Profileless conversational request did not offer all Opportunity Finding paths: ${JSON.stringify(
        profilelessConversation.body,
      )}`,
    );
  }

  const requestChoice = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "3",
      continuation: profilelessConversation.body?.conversation?.continuation,
    }),
  });
  if (
    !requestChoice.response.ok ||
    requestChoice.body?.conversation?.state !== "collecting_request"
  ) {
    throw new Error(
      `Free-form request route did not continue correctly: ${JSON.stringify(
        requestChoice.body,
      )}`,
    );
  }

  const backgroundChoice = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "2",
      continuation:
        profilelessConversation.body?.conversation?.continuation,
    }),
  });
  if (
    !backgroundChoice.response.ok ||
    backgroundChoice.body?.conversation?.state !== "collecting_background"
  ) {
    throw new Error(
      `Background source choice did not continue correctly: ${JSON.stringify(
        backgroundChoice.body,
      )}`,
    );
  }

  const conversationalRecommendation = await requestJson(
    "/api/a2mcp/recommend",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          "I am a Nigerian computer science student with React, TypeScript, Python, and Solidity experience. I want remote AI and Web3 hackathons, grants, fellowships, and internships.",
      }),
    },
  );
  if (
    !conversationalRecommendation.response.ok ||
    conversationalRecommendation.body?.conversation?.state !==
      "recommendations" ||
    !Array.isArray(conversationalRecommendation.body?.recommendations) ||
    conversationalRecommendation.body.recommendations.length === 0 ||
    conversationalRecommendation.body.recommendations.length > 10
  ) {
    throw new Error(
      `Natural-language recommendation journey failed: ${JSON.stringify(
        conversationalRecommendation.body,
      )}`,
    );
  }

  const continuation =
    conversationalRecommendation.body?.conversation?.continuation;
  if (
    typeof continuation?.token !== "string" ||
    !continuation.token ||
    /Nigerian|React|TypeScript|Solidity/i.test(continuation.token)
  ) {
    throw new Error(
      "Conversational recommendation did not return an opaque caller-carried continuation reference.",
    );
  }

  const constrainedInitial = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Find remote AI internships for a student in Nigeria.",
    }),
  });
  if (
    !constrainedInitial.response.ok ||
    constrainedInitial.body?.conversation?.state !== "needs_more_information"
  ) {
    throw new Error(
      `Constrained discovery intake did not request the essential missing profile facts: ${JSON.stringify(
        constrainedInitial.body,
      )}`,
    );
  }

  const constrainedFollowUp = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "I use React, TypeScript, Python, and machine learning.",
      continuation: constrainedInitial.body?.conversation?.continuation,
    }),
  });
  const constrainedCategories =
    constrainedFollowUp.body?.querySummary?.filtersApplied?.categories;
  const wrongTypeRecommendation =
    constrainedFollowUp.body?.recommendations?.find(
      (item) => item.opportunity?.category !== "internship",
    );
  if (
    !constrainedFollowUp.response.ok ||
    constrainedFollowUp.body?.conversation?.state !== "recommendations" ||
    JSON.stringify(constrainedCategories) !== JSON.stringify(["internship"]) ||
    constrainedFollowUp.body?.querySummary?.filtersApplied?.remote !== true ||
    wrongTypeRecommendation
  ) {
    throw new Error(
      `Continuation lost or violated explicit discovery constraints: ${JSON.stringify(
        constrainedFollowUp.body,
      )}`,
    );
  }

  const topOpportunityId =
    conversationalRecommendation.body.recommendations[0].opportunity.id;
  const explanation = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Why did you recommend this?",
      continuation,
    }),
  });
  if (
    !explanation.response.ok ||
    explanation.body?.conversation?.state !== "explanation" ||
    explanation.body?.capabilityResult?.explanation?.opportunityId !==
      topOpportunityId
  ) {
    throw new Error(
      `Follow-up explanation journey failed: ${JSON.stringify(
        explanation.body,
      )}`,
    );
  }

  const readiness = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "What am I missing for this opportunity?",
      context: continuation,
    }),
  });
  if (
    !readiness.response.ok ||
    readiness.body?.conversation?.state !== "readiness" ||
    typeof readiness.body?.capabilityResult?.readiness?.readinessScore !==
      "number"
  ) {
    throw new Error(
      `Readiness journey failed: ${JSON.stringify(readiness.body)}`,
    );
  }

  const pendingService = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "generate_resume",
      message: "Create a fictional resume for a research fellowship.",
    }),
  });
  if (
    !pendingService.response.ok ||
    pendingService.body?.conversation?.service !== "resume_generation" ||
    pendingService.body?.conversation?.state !== "service_pending"
  ) {
    throw new Error(
      `Explicit service operation did not preserve staged capability state: ${JSON.stringify(
        pendingService.body,
      )}`,
    );
  }

  const replayBody = JSON.stringify({
    operation: "generate_resume",
    message: "Create a fictional resume for a research fellowship.",
  });
  const replayFirst = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "smoke-service1-replay",
    },
    body: replayBody,
  });
  const replaySecond = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "smoke-service1-replay",
    },
    body: replayBody,
  });
  if (
    !replayFirst.response.ok ||
    !replaySecond.response.ok ||
    replaySecond.response.headers.get("x-idempotency-status") !== "replayed"
  ) {
    throw new Error("Idempotency replay smoke test failed.");
  }

  const invalid = await requestJson("/api/a2mcp/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters: { limit: 3 } }),
  });

  if (invalid.response.status !== 400 || invalid.body?.error !== "validation_error") {
    throw new Error("Invalid input did not produce a structured 400 validation error.");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        health,
        parsedResumeTypes: ["pdf", "docx"],
        recommendationCount: recommendation.body.recommendations.length,
        conversationalRecommendationCount:
          conversationalRecommendation.body.recommendations.length,
        constrainedRecommendationCount:
          constrainedFollowUp.body.recommendations.length,
        provider: recommendation.body.provider,
        aiStatus: recommendation.body.aiStatus,
        topRecommendation: recommendation.body.recommendations[0].opportunity.title,
        conversationalState:
          conversationalRecommendation.body.conversation.state,
        onboardingStates: [
          profilelessConversation.body.conversation.state,
          requestChoice.body.conversation.state,
          backgroundChoice.body.conversation.state,
        ],
        explicitServiceState: pendingService.body.conversation.state,
        followUpStates: [
          explanation.body.conversation.state,
          readiness.body.conversation.state,
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (server) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      server.kill("SIGTERM");
    }
  }
}
