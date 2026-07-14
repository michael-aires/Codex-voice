import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [server, web, planner, presentation, nativeCanvas, nativeModels, nativeModel, project] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/canvasBuildPlanner.js", import.meta.url), "utf8"),
  readFile(new URL("../src/artifactPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/SessionCanvasView.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/Models.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/AppModel.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile.xcodeproj/project.pbxproj", import.meta.url), "utf8")
]);

test("shared artifact worker advertises and persists a real Word recipe", () => {
  assert.match(server, /word_brief:\s*\{/);
  assert.match(server, /outputType: "docx"/);
  assert.match(server, /await renderArtifactDocx\(\{ title: safeTitle, content: sourceContent, createdAt: now \}\)/);
  assert.match(server, /if \(outputType === "docx"\) return "docx"/);
  assert.match(server, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(server, /\["pdf", "docx", "pptx", "xlsx"\]\.includes\(outputType\)/);
});

test("web and iOS expose the same Word brief through binary-safe readers", () => {
  assert.match(planner, /id: "word_brief"/);
  assert.match(nativeCanvas, /CanvasBuildType\(id: "word_brief"/);
  assert.match(nativeModels, /ArtifactRecipe\(kind: "word_brief"/);
  assert.match(presentation, /\["docx", "pptx", "xlsx"\]\.includes\(outputType\)/);
  assert.match(web, /function OfficeArtifactDocument/);
  assert.match(web, /download=\{`\$\{title\}\.\$\{config\.extension\}`\}/);
  assert.match(web, /!\["markdown", "html", "mcp_app"\]\.includes\(selectedArtifactContentType\)/);
  assert.match(nativeModel, /Bundle\.main\.url\(forResource: "Cooper-Word-Brief", withExtension: "docx"\)/);
  assert.match(project, /Cooper-Word-Brief\.docx in Resources/);
});
