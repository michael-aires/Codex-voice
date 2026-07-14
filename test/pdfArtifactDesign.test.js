import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [server, web, planner, presentation, nativeCanvas, nativeModels] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/canvasBuildPlanner.js", import.meta.url), "utf8"),
  readFile(new URL("../src/artifactPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/SessionCanvasView.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/Models.swift", import.meta.url), "utf8")
]);

test("shared artifact worker advertises and persists a real PDF recipe", () => {
  assert.match(server, /pdf_brief:\s*\{/);
  assert.match(server, /outputType: "pdf"/);
  assert.match(server, /await renderArtifactPdf\(\{ title: safeTitle, content: sourceContent, createdAt: now \}\)/);
  assert.match(server, /if \(outputType === "pdf"\) return "pdf"/);
  assert.match(server, /if \(outputType === "pdf"\) return "application\/pdf"/);
});

test("web and iOS expose the same PDF brief and use binary-safe readers", () => {
  assert.match(planner, /id: "pdf_brief"/);
  assert.match(nativeCanvas, /CanvasBuildType\(id: "pdf_brief"/);
  assert.match(nativeModels, /ArtifactRecipe\(kind: "pdf_brief"/);
  assert.match(presentation, /outputType === "pdf"/);
  assert.match(web, /function PdfArtifactDocument/);
  assert.match(web, /<iframe src=\{source\} title=\{`\$\{title\} PDF`\}/);
  assert.match(web, /!\["markdown", "html", "mcp_app"\]\.includes\(selectedArtifactContentType\)/);
});
