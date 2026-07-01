import test from "node:test";
import assert from "node:assert/strict";
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

test("builds a generation prompt from an example and extra context", () => {
  const example = findAiresExample("service blueprint");
  const prompt = buildAiresExamplePrompt(example, "Focus on onboarding handoffs.");

  assert.match(prompt, /service blueprint/i);
  assert.match(prompt, /active call transcript/i);
  assert.match(prompt, /onboarding handoffs/i);
});
