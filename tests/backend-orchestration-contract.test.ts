import assert from "node:assert/strict";
import test from "node:test";
import { handleOpportunityCompanionRequest } from "../src/lib/companion/service";
import { resolveSessionContext } from "../src/lib/companion/session";
import {
  discoveryCategorySchema,
  opportunityCompanionRequestSchema,
  opportunityCompanionResponseSchema,
  type DiscoveryCategory,
} from "../src/lib/types/opportunities";
import { parseDiscoveryCategories } from "../src/lib/opportunities/discovery-categories";

const categories: Array<[number, DiscoveryCategory]> = [
  [1, "jobs"],
  [2, "internships"],
  [3, "hackathons"],
  [4, "scholarships"],
  [5, "fellowships"],
  [6, "grants_funding"],
  [7, "bounties_freelance"],
  [8, "accelerators_incubators"],
  [9, "creator_opportunities"],
  [10, "competitions_challenges"],
];

async function bootstrap() {
  return handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({}),
  );
}

async function startOpportunityFinding() {
  const cold = await bootstrap();
  return handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "1",
      continuation: cold.continuation,
    }),
  );
}

test("every Service 1 category is server-issued and persists in continuation", async () => {
  for (const [number, category] of categories) {
    const service = await startOpportunityFinding();
    assert.equal(service.stage, "choose_opportunity_categories");
    assert.equal(service.callerAction, "show_selection_menu");
    assert.equal(service.allowedResponses?.length, 10);
    assert.equal(service.attachmentsAccepted?.length, 0);

    const selected = await handleOpportunityCompanionRequest(
      opportunityCompanionRequestSchema.parse({
        message: String(number),
        continuation: service.continuation,
      }),
    );
    assert.doesNotThrow(() =>
      opportunityCompanionResponseSchema.parse(selected),
    );
    assert.deepEqual(
      resolveSessionContext(selected.continuation)?.selectedDiscoveryCategories,
      [category],
    );
    assert.equal(selected.recommendations.length, 0);
    assert.notEqual(selected.stage, "choose_profile_source");
  }
});

test("multiple numbers, names, and broad natural language share one category state", async () => {
  const service = await startOpportunityFinding();
  const selected = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "jobs, scholarships and grants",
      continuation: service.continuation,
    }),
  );
  assert.deepEqual(
    resolveSessionContext(selected.continuation)?.selectedDiscoveryCategories,
    ["jobs", "scholarships", "grants_funding"],
  );
  assert.equal(selected.requiredInputs?.length, 1);
  assert.equal(selected.requiredInputs?.[0]?.id, "opportunity_context");

  const remote = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      operation: "discover",
      message: "I want remote AI and Web3 opportunities.",
    }),
  );
  assert.deepEqual(
    resolveSessionContext(remote.continuation)?.selectedDiscoveryCategories,
    ["jobs"],
  );
});

test("explicitly negated opportunity categories are not selected", () => {
  assert.deepEqual(
    parseDiscoveryCategories(
      "I want scholarships, fellowships, grants, and research opportunities, not software jobs.",
    ),
    ["scholarships", "fellowships", "grants_funding"],
  );
});

test("adaptive mixed-category intake asks once and preserves every category", async () => {
  const service = await startOpportunityFinding();
  const selected = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "1, 2, 3 and 4",
      continuation: service.continuation,
    }),
  );
  assert.equal(selected.stage, "discover_collecting_context");
  assert.equal(selected.requiredInputs?.length, 1);
  assert.equal(selected.requiredInputs?.[0]?.type, "object");

  const completed = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message:
        "I am a BSc Computer Science student in Nigeria. I use Python, JavaScript, React, and SQL. I want remote or online options and I am open to software engineering and AI.",
      continuation: selected.continuation,
    }),
  );
  assert.equal(completed.stage, "discover_completed");
  assert.deepEqual(
    new Set(
      completed.categoryCoverage?.map((item) =>
        discoveryCategorySchema.parse(item.category),
      ),
    ),
    new Set(["jobs", "internships", "hackathons", "scholarships"]),
  );
});

test("the incomplete-response contract explicitly tells callers what to do", async () => {
  const cold = await bootstrap();
  assert.equal(cold.apiVersion, cold.version);
  assert.equal(cold.callerAction, "show_selection_menu");
  assert.equal(cold.status, "needs_input");
  assert.equal(cold.requiredInputs?.[0]?.id, "service");
  assert.deepEqual(cold.optionalInputs, []);
  assert.equal(cold.allowedResponses?.length, 5);
  assert.deepEqual(cold.attachmentsAccepted, []);
  assert.equal(cold.callerInstructions?.relayMessage, true);
  assert.equal(cold.callerInstructions?.doNotSelectService, true);
  assert.equal(cold.callerInstructions?.doNotGenerateAProfile, true);
  assert.equal(
    cold.callerInstructions?.doNotExposeProtocolWorkWhenFree,
    true,
  );
});

test("Service 3 requests the target before applicant evidence", async () => {
  const cold = await bootstrap();
  const generation = await handleOpportunityCompanionRequest(
    opportunityCompanionRequestSchema.parse({
      message: "Resume Generation",
      continuation: cold.continuation,
    }),
  );
  assert.equal(generation.stage, "generate_awaiting_target");
  assert.deepEqual(
    generation.requiredInputs?.map((input) => input.id),
    ["generation_target"],
  );
  assert.deepEqual(
    generation.optionalInputs?.map((input) => input.id),
    ["output_preferences"],
  );
});
