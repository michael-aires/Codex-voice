import test from "node:test";
import assert from "node:assert/strict";
import {
  HTML_ARTIFACT_KINDS,
  artifactInitialMode,
  artifactOutputTypeFromMetadata,
  artifactPreviewSurface
} from "../src/artifactPresentation.js";

test("HTML artifacts recover to iframe preview even when older records lack outputType", () => {
  for (const kind of HTML_ARTIFACT_KINDS) {
    const artifact = { kind };

    assert.equal(artifactOutputTypeFromMetadata(artifact), "html", `${kind} should be treated as HTML`);
    assert.equal(artifactInitialMode(artifact), "preview", `${kind} should open on preview`);
    assert.equal(artifactPreviewSurface(artifact), "iframe", `${kind} should render in an iframe`);
  }
});

test("markdown diagram artifacts default to readable markdown rendering", () => {
  const artifact = { kind: "mermaid_diagram", extension: "md" };

  assert.equal(artifactOutputTypeFromMetadata(artifact), "markdown");
  assert.equal(artifactInitialMode(artifact), "rendered");
  assert.equal(artifactPreviewSurface(artifact), "rendered_markdown");
});

test("missing selected artifacts are safe on fresh call screens", () => {
  assert.equal(artifactOutputTypeFromMetadata(null), "markdown");
  assert.equal(artifactInitialMode(null), "rendered");
  assert.equal(artifactPreviewSurface(null), "rendered_markdown");
});

test("explicit artifact output metadata wins over inferred presentation", () => {
  assert.equal(artifactOutputTypeFromMetadata({ kind: "mermaid_diagram", outputType: "html" }), "html");
  assert.equal(artifactInitialMode({ outputType: "mcp_app" }), "app");
  assert.equal(artifactPreviewSurface({ outputType: "mcp_app" }), "mcp_app_iframe");
});
