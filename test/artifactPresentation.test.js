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

test("PDF artifacts use the binary iframe preview instead of markdown decoding", () => {
  const artifact = { extension: "pdf", file: "data/artifacts/brief.pdf" };
  assert.equal(artifactOutputTypeFromMetadata(artifact), "pdf");
  assert.equal(artifactInitialMode(artifact), "preview");
  assert.equal(artifactPreviewSurface(artifact), "pdf_iframe");
});

test("Word artifacts use a binary download surface instead of text decoding", () => {
  const artifact = { extension: "docx", file: "data/artifacts/brief.docx" };
  assert.equal(artifactOutputTypeFromMetadata(artifact), "docx");
  assert.equal(artifactInitialMode(artifact), "download");
  assert.equal(artifactPreviewSurface(artifact), "office_download");
});

test("PowerPoint and Excel artifacts use the shared binary Office download surface", () => {
  for (const extension of ["pptx", "xlsx"]) {
    const artifact = { extension, file: `data/artifacts/delivery.${extension}` };
    assert.equal(artifactOutputTypeFromMetadata(artifact), extension);
    assert.equal(artifactInitialMode(artifact), "download");
    assert.equal(artifactPreviewSurface(artifact), "office_download");
  }
});
