import assert from "node:assert/strict";
import test from "node:test";
import {
  DOCUMENT_PIPELINE_STAGES,
  applyDocumentJobControl,
  nextArtifactVersion,
  pipelineStageForJob,
  qualityRepairInstruction,
  qualityReportForArtifact,
  sortDocumentQueue
} from "../server/documentPipeline.js";

test("document pipelines expose capture through publish stages", () => {
  assert.deepEqual(
    DOCUMENT_PIPELINE_STAGES.map((stage) => stage.id),
    ["capture", "shape", "generate", "validate", "publish"]
  );
  assert.equal(pipelineStageForJob({ status: "queued", stepIndex: 0, stepCount: 3 }), "capture");
  assert.equal(pipelineStageForJob({ status: "running", stepIndex: 1, stepCount: 3 }), "shape");
  assert.equal(pipelineStageForJob({ status: "running", stepIndex: 2, stepCount: 3 }), "generate");
  assert.equal(pipelineStageForJob({ status: "running", apiStatus: "validating" }), "validate");
  assert.equal(pipelineStageForJob({ status: "completed" }), "publish");
});

test("queue ordering honors priority, suite sequence, and age", () => {
  const jobs = [
    { id: "normal", priority: "normal", sequence: 1, createdAt: "2026-07-14T10:00:00Z" },
    { id: "urgent-later", priority: "urgent", sequence: 2, createdAt: "2026-07-14T09:00:00Z" },
    { id: "urgent-first", priority: "urgent", sequence: 1, createdAt: "2026-07-14T11:00:00Z" }
  ];
  assert.deepEqual(sortDocumentQueue(jobs).map((job) => job.id), ["urgent-first", "urgent-later", "normal"]);
});

test("active document work can pause, resume, and cancel safely", () => {
  const pausing = applyDocumentJobControl({ status: "running", stepIndex: 1 }, "pause", "2026-07-14T10:00:00Z");
  assert.equal(pausing.ok, true);
  assert.equal(pausing.job.status, "pausing");
  assert.equal(pausing.job.pauseRequested, true);

  const resumed = applyDocumentJobControl({ status: "paused", stepIndex: 1 }, "resume", "2026-07-14T10:01:00Z");
  assert.equal(resumed.job.status, "queued");
  assert.match(resumed.job.progress, /step 2/i);

  const canceled = applyDocumentJobControl({ status: "queued" }, "cancel", "2026-07-14T10:02:00Z");
  assert.equal(canceled.job.status, "canceled");
  assert.equal(canceled.job.canceledAt, "2026-07-14T10:02:00Z");

  assert.equal(applyDocumentJobControl({ status: "completed" }, "pause").ok, false);
});

test("requirements quality gate checks source fidelity, structure, and standalone HTML", () => {
  const html = `<!doctype html>
    <html><head><style>body { color: #181916; }</style></head><body>
      <h1>Scoped requirements</h1>
      <section><h2>Problem and current state</h2><p>The workflow is fragmented and slow for the target user.</p></section>
      <section><h2>Goal and desired state</h2><p>Deliver a bounded workflow with measurable completion.</p></section>
      <section><h2>In scope</h2><p>The first vertical workflow.</p><h3>Out of scope</h3><p>Unrelated automation.</p></section>
      <section><h2>MoSCoW</h2><p>Must have the core flow. Won't include migration.</p></section>
      <section><h2>Acceptance criteria</h2><p>Given a valid user, when the action completes, then the result is visible.</p></section>
      <section><h2>Definition of Ready</h2><p>Owner, evidence, test data, and dependencies are confirmed.</p></section>
    </body></html>`;
  const report = qualityReportForArtifact({
    kind: "aires_requirements",
    outputType: "html",
    content: html,
    sourceManifest: { transcriptTurnCount: 4 }
  });
  assert.equal(report.status, "passed");
  assert.ok(report.score >= 80);
  assert.deepEqual(report.warnings, []);
});

test("quality failures produce a bounded public repair instruction", () => {
  const report = qualityReportForArtifact({
    kind: "architecture_decision_record",
    content: "# Draft\n\nA short note.",
    sourceManifest: { instructionCharCount: 20 }
  });
  assert.equal(report.status, "needs_review");
  assert.ok(report.warnings.length > 0);
  const instruction = qualityRepairInstruction(report, { kind: "architecture_decision_record" });
  assert.match(instruction, /Revise the current architecture_decision_record artifact/);
  assert.doesNotMatch(instruction, /chain of thought/i);
});

test("artifact versions increment within a call and kind", () => {
  const artifacts = [
    { callId: "call-1", kind: "product_requirements", version: 1 },
    { callId: "call-1", kind: "product_requirements", version: 3 },
    { callId: "call-2", kind: "product_requirements", version: 9 }
  ];
  assert.equal(nextArtifactVersion(artifacts, { callId: "call-1", kind: "product_requirements" }), 4);
});
