import test from "node:test";
import assert from "node:assert/strict";
import {
  airesTemplateToolIds,
  cooperToolDefinitions
} from "../cooperTools.js";
import {
  AIRES_EXAMPLE_DOCUMENTS,
  buildAiresExamplePrompt,
  findAiresExample,
  getAiresExampleDocument,
  getAiresExampleList,
  normalizeAiresExampleId
} from "../server/airesExamples.js";

test("AIRES example catalog exposes the expected flow ids", () => {
  assert.deepEqual(AIRES_EXAMPLE_DOCUMENTS.map((example) => example.id), [
    "client_capability_matrix",
    "context_to_product_content",
    "daily_rep_flow",
    "data_flywheel",
    "jtbd_canvas",
    "personas_manager_rep",
    "scoped_requirements_rep_velocity",
    "service_blueprint",
    "thesis_rep_velocity"
  ]);
});

test("AIRES example aliases normalize to canonical ids", () => {
  assert.equal(normalizeAiresExampleId("Jobs to be Done"), "jtbd_canvas");
  assert.equal(normalizeAiresExampleId("service-map"), "service_blueprint");
  assert.equal(normalizeAiresExampleId("aires-data-flywheel.html"), "data_flywheel");
});

test("public AIRES example list hides local filenames", () => {
  const examples = getAiresExampleList();

  assert.equal(examples.length, 9);
  assert.equal(Object.hasOwn(examples[0], "filename"), false);
  assert.ok(examples.every((example) => example.promptHint && example.recipeKind));
});

test("can load a known AIRES example HTML document", async () => {
  const example = await getAiresExampleDocument("jtbd");

  assert.equal(example.id, "jtbd_canvas");
  assert.match(example.html, /<!doctype html>/i);
  assert.match(example.title, /Jobs to be done/i);
});

test("all AIRES examples resolve to HTML template documents", async () => {
  const examples = await Promise.all(
    AIRES_EXAMPLE_DOCUMENTS.map((example) => getAiresExampleDocument(example.id))
  );

  assert.equal(examples.length, 9);
  for (const example of examples) {
    assert.match(example.html, /<!doctype html>/i, `${example.id} should be a standalone HTML document`);
    assert.match(example.html, /<html/i, `${example.id} should include an html root`);
  }
});

test("builds a generation prompt from an example and extra context", () => {
  const example = findAiresExample("service blueprint");
  const prompt = buildAiresExamplePrompt(example, "Focus on onboarding handoffs.");

  assert.match(prompt, /service blueprint/i);
  assert.match(prompt, /active call transcript/i);
  assert.match(prompt, /onboarding handoffs/i);
});

test("Realtime Cooper tool can queue every AIRES template from voice", () => {
  const tool = cooperToolDefinitions.find((definition) => definition.name === "generate_aires_template_artifact");
  const expectedIds = AIRES_EXAMPLE_DOCUMENTS.map((example) => example.id);

  assert.ok(tool, "generate_aires_template_artifact should be exposed to Realtime");
  assert.deepEqual(airesTemplateToolIds, expectedIds);
  assert.deepEqual(tool.parameters.properties.template_id.enum, [...expectedIds, "all"]);
  assert.deepEqual(tool.parameters.properties.template_ids.items.enum, expectedIds);
  assert.match(tool.description, /live call transcript/i);
});

test("Realtime requirements workshop tool supports the complete hands-free orchestration loop", () => {
  const tool = cooperToolDefinitions.find((definition) => definition.name === "run_aires_requirements_framework");
  const modes = tool.parameters.properties.mode.enum;

  assert.ok(tool);
  assert.ok(modes.includes("recommend_artifacts"));
  assert.ok(modes.includes("draft_outline"));
  assert.ok(modes.includes("queue_artifact"));
  assert.ok(modes.includes("queue_suite"));
  assert.ok(modes.includes("status"));
  assert.deepEqual(tool.parameters.properties.template_id.enum, airesTemplateToolIds);
  assert.deepEqual(tool.parameters.properties.template_ids.items.enum, airesTemplateToolIds);
  assert.match(tool.description, /while the call continues/i);
});
