import test from "node:test";
import assert from "node:assert/strict";
import {
  REQUIREMENTS_SUITE_ORDER,
  buildRequirementsDraftOutline,
  recommendRequirementsArtifacts,
  requirementsSuitePlan
} from "../server/requirementsWorkshop.js";

test("recommends JTBD first when discovery context contains pain and workarounds", () => {
  const recommendations = recommendRequirementsArtifacts({
    context: "Customer discovery exposed a user pain and a manual workaround. We need to understand the desired progress before choosing a feature."
  });

  assert.equal(recommendations[0].id, "jtbd_canvas");
  assert.ok(recommendations.some((item) => item.id === "scoped_requirements_rep_velocity"));
  assert.match(recommendations[0].reason, /user job/i);
});

test("recommends a service blueprint for operational handoffs and failure points", () => {
  const recommendations = recommendRequirementsArtifacts({
    context: "The onboarding handoff crosses operations and engineering, with backstage dependencies and a failure point when the sync is late."
  });

  assert.equal(recommendations[0].id, "service_blueprint");
  assert.equal(recommendations[0].stage, "Model");
});

test("full requirements suite is complete, unique, and ordered from capture to verify", () => {
  const plan = requirementsSuitePlan();

  assert.deepEqual(plan.map((item) => item.id), REQUIREMENTS_SUITE_ORDER);
  assert.equal(new Set(plan.map((item) => item.id)).size, 9);
  assert.equal(plan[0].stage, "Capture");
  assert.equal(plan.at(-1).stage, "Verify");
});

test("draft outline preserves evidence and surfaces unanswered decision gates", () => {
  const outline = buildRequirementsDraftOutline({
    topic: "First-touch logging",
    context: "Sales representatives currently record first-touch details manually after a customer call. The source of truth is the CRM contact record."
  });

  assert.equal(outline.topic, "First-touch logging");
  assert.ok(outline.evidence.some((line) => /manually/i.test(line)));
  assert.ok(outline.sections.some((section) => /Given\/When\/Then/i.test(section)));
  assert.ok(outline.missingQuestions.some((question) => /measurable outcome/i.test(question)));
  assert.ok(outline.assumptions.every((assumption) => /assumption|prove/i.test(assumption)));
});
