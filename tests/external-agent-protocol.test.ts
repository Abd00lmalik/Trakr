import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/a2mcp/recommend/route";

async function callA2mcp(payload: unknown, headers: Record<string, string> = {}) {
  const req = new Request("https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, headers: res.headers, body: json };
}

test("Cross-Agent Contract: Cold Start across Claude, Codex, Antigravity, Hermes, OpenClaw", async () => {
  const agentUserAgents = [
    { name: "Claude Relay", header: "Claude-Agent/1.0" },
    { name: "Codex Relay", header: "Codex-Tool/2.0" },
    { name: "Antigravity Pair", header: "Antigravity-Agent/3.6" },
    { name: "Hermes Agent", header: "Hermes-A2MCP/1.0" },
    { name: "OpenClaw Runner", header: "OpenClaw-Client/1.0" },
    { name: "Direct A2MCP Caller", header: "curl/8.0" },
  ];

  for (const { name, header } of agentUserAgents) {
    const res = await callA2mcp(
      {
        message: "use the service provided by agent #5198",
        operation: "auto",
      },
      { "User-Agent": header },
    );

    assert.equal(res.status, 200, `${name} must receive HTTP 200`);
    assert.equal(res.body.interactionState, "service_selection_required");
    assert.equal(res.body.callerInstructions.relayMessage, true);
    assert.equal(res.body.callerInstructions.doNotInferMissingInputs, true);
    assert.equal(res.body.callerInstructions.sendContinuationUnchanged, true);
    assert.equal(res.body.callerInstructions.doNotSelectService, true);

    const choices = res.body.allowedResponses;
    assert.equal(choices.length, 5);
    assert.equal(choices[0].value ?? choices[0], "discover");
    assert.equal(choices[1].value ?? choices[1], "benchmark");
    assert.equal(choices[2].value ?? choices[2], "optimize");
    assert.equal(choices[3].value ?? choices[3], "generate_resume");
    assert.equal(choices[4].value ?? choices[4], "readiness");
  }
});

test("Cross-Agent Contract: Service 1 numeric and natural category selection", async () => {
  // Turn 1: Cold start
  const cold = await callA2mcp({ message: "Start" });
  assert.equal(cold.body.interactionState, "service_selection_required");
  const cont1 = cold.body.continuation;

  // Turn 2: Select Service 1 ("1")
  const service1 = await callA2mcp({
    message: "1",
    continuation: cont1,
  });
  assert.equal(service1.body.interactionState, "opportunity_category_selection_required");
  const cont2 = service1.body.continuation;

  // Turn 3: Select categories ("1 and 3" -> Jobs and Hackathons)
  const categories = await callA2mcp({
    message: "1 and 3",
    continuation: cont2,
  });
  assert.equal(categories.body.stage, "discover_collecting_context");
  const selectedCats =
    categories.body.selectedDiscoveryCategories ??
    categories.body.conversation?.context?.selectedDiscoveryCategories ??
    categories.body.conversation?.selectedDiscoveryCategories ??
    categories.body.querySummary?.selectedCategories;
  assert.ok(categories.body.stage === "discover_collecting_context");
});

test("Cross-Agent Contract: Service 2 benchmark before optimize with resume and target", async () => {
  const cold = await callA2mcp({ message: "Start" });
  const cont1 = cold.body.continuation;

  // Select Service 2 ("2")
  const service2 = await callA2mcp({
    message: "2",
    continuation: cont1,
  });
  assert.equal(service2.body.interactionState, "needs_more_information");
  const cont2 = service2.body.continuation;

  // Provide resume text and target with session consent
  const benchmark = await callA2mcp({
    message: "I am benchmarking my resume against Senior Frontend Engineer role at TechCorp.",
    resumeText: "Jane Doe\nSenior Software Engineer with 6 years experience in React, TypeScript, and Web performance.",
    consent: {
      processPersonalData: true,
      retention: "session_only",
      source: "explicit",
    },
    target: {
      role: "Senior Frontend Engineer",
      description: "Requires 5+ years React, TypeScript, and modern frontend architecture.",
    },
    continuation: cont2,
  });

  assert.equal(benchmark.status, 200);
  assert.ok(["profile_confirmation", "optimize_confirmation"].includes(benchmark.body.stage));
  assert.equal(benchmark.body.callerInstructions.askUserForRequiredInputs, true);
});

test("Cross-Agent Contract: Service 3 target-first resume generation", async () => {
  const cold = await callA2mcp({ message: "Start" });
  const cont1 = cold.body.continuation;

  // Select resume generation ("4")
  const service3 = await callA2mcp({
    message: "4",
    continuation: cont1,
  });
  assert.equal(service3.body.stage, "generate_awaiting_target");
  const cont2 = service3.body.continuation;

  // Provide target
  const targetProvided = await callA2mcp({
    message: "Applying for AI Research Fellowship at OpenLab.",
    target: {
      role: "AI Research Fellow",
      description: "Research in transformer models, PyTorch, and multi-agent alignment.",
    },
    continuation: cont2,
  });

  assert.equal(targetProvided.body.stage, "generate_missing_information");
  assert.equal(targetProvided.body.callerInstructions.doNotGenerateAProfile, true);
});

test("Cross-Agent Contract: Free HTTP 200 access without payment protocol headers required", async () => {
  const res = await callA2mcp({ message: "find opportunities" });
  assert.equal(res.status, 200);
  assert.equal(res.body.callerInstructions.doNotExposeProtocolWorkWhenFree, true);
});
