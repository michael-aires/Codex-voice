import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cooperToolDefinitions, cooperToolNames } from "../cooperTools.js";

const [serverSource, mainSource, promptSource, envSource] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../cooperPrompt.js", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8")
]);

test("voice and typed Cooper sessions expose a first-class document generator", () => {
  const tool = cooperToolDefinitions.find((definition) => definition.name === "create_document_artifact");
  assert.ok(tool);
  assert.equal(cooperToolNames.has("create_document_artifact"), true);
  assert.ok(tool.parameters.properties.kind.enum.includes("architecture_decision_record"));
  assert.ok(tool.parameters.properties.kind.enum.includes("sprint_recap"));
  assert.match(promptSource, /Use create_document_artifact for durable non-template documentation/);
  assert.match(serverSource, /executeDocumentArtifactTool/);
});

test("server artifacts preserve source, quality, version, and pipeline lineage", () => {
  assert.match(serverSource, /sourceManifest:/);
  assert.match(serverSource, /qualityReportForArtifact/);
  assert.match(serverSource, /qualityRepairInstruction/);
  assert.match(serverSource, /version,/);
  assert.match(serverSource, /supersedesArtifactId/);
  assert.match(serverSource, /pipelineStage = "validate"/);
  assert.match(serverSource, /pipelineStage = "publish"/);
});

test("background jobs are controllable and revisions remain asynchronous", () => {
  assert.match(serverSource, /\/api\/jobs\/:id\/:action\(pause\|resume\|cancel\)/);
  assert.match(serverSource, /\/api\/artifacts\/:id\/revise/);
  assert.match(mainSource, /Create next version/);
  assert.match(mainSource, /\/api\/jobs\/\$\{jobId\}\/\$\{action\}/);
});

test("quality gate behavior is explicit and configurable", () => {
  assert.match(envSource, /COOPER_JOB_QUALITY_GATE=true/);
  assert.match(envSource, /COOPER_JOB_QUALITY_MIN_SCORE=80/);
  assert.match(envSource, /COOPER_JOB_QUALITY_REPAIR_ATTEMPTS=1/);
});
