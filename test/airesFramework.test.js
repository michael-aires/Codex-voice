import test from "node:test";
import assert from "node:assert/strict";
import {
  AIRES_FRAMEWORK_DOCUMENTS,
  explainAiresFrameworkDocuments,
  normalizeAiresDocumentKey,
  workshopAiresFrameworkDocument
} from "../server/airesFramework.js";

test("AIRES framework catalog includes every skill document Cooper should explain", () => {
  const keys = AIRES_FRAMEWORK_DOCUMENTS.map((document) => document.key);

  assert.deepEqual(keys, [
    "skill",
    "requirements_framework",
    "pipeline",
    "design_system",
    "artifact_catalog",
    "template",
    "tokens",
    "agent_manifest"
  ]);
});

test("normalizes common AIRES document aliases", () => {
  assert.equal(normalizeAiresDocumentKey("requirements-framework.md"), "requirements_framework");
  assert.equal(normalizeAiresDocumentKey("design system"), "design_system");
  assert.equal(normalizeAiresDocumentKey("aires tokens"), "tokens");
  assert.equal(normalizeAiresDocumentKey("openai.yaml"), "agent_manifest");
});

test("explains all AIRES framework documents", async () => {
  const result = await explainAiresFrameworkDocuments({ documentKey: "all" });

  assert.equal(result.status, "completed");
  assert.equal(result.value.documents.length, 8);
  assert.ok(result.value.documents.some((document) => document.key === "pipeline"));
  assert.match(result.value.voice_summary, /eight working documents/i);
});

test("can include source excerpts for a specific AIRES document", async () => {
  const result = await explainAiresFrameworkDocuments({
    documentKey: "pipeline",
    detailLevel: "source"
  });

  assert.equal(result.status, "completed");
  assert.equal(result.value.documents.length, 1);
  assert.match(result.value.documents[0].sourceExcerpt, /Capture -> Distill -> Scope -> Slice -> Verify/);
});

test("workshops a selected AIRES document against provided context", () => {
  const result = workshopAiresFrameworkDocument({
    documentKey: "design_system",
    workshopFocus: "brand",
    sourceContext: "We need a polished mobile-first scoped requirements artifact for a sprint epic.",
    currentDraft: "<h1>Big gradient hero</h1>",
    goal: "Audit the artifact against AIRES brand rules."
  });

  assert.equal(result.status, "completed");
  assert.equal(result.value.selectedDocument.key, "design_system");
  assert.equal(result.value.sourceContextStatus, "provided");
  assert.equal(result.value.currentDraftStatus, "provided");
  assert.ok(result.value.questions.some((question) => question.includes("Volt")));
  assert.match(result.value.voice_summary, /design-system\.md/i);
});
