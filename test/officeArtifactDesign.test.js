import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [generatorSource, serverSource, webSource, cssSource, nativeModels, nativeModel, nativeCanvas, nativeProject] = await Promise.all([
  readFile(new URL("../server/officeArtifact.js", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/session-os.css", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/Models.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/AppModel.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/SessionCanvasView.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile.xcodeproj/project.pbxproj", import.meta.url), "utf8")
]);

test("PowerPoint recipe keeps a short audience-facing narrative with legible type", () => {
  assert.match(generatorSource, /addCoverSlide/);
  assert.match(generatorSource, /addEvidenceSlide/);
  assert.match(generatorSource, /addReadinessSlide/);
  assert.match(generatorSource, /addClosingSlide/);
  assert.match(generatorSource, /fontSize: 42/);
  assert.match(generatorSource, /fontSize: 20/);
  assert.match(generatorSource, /Open the source session before the next move/);
  assert.doesNotMatch(generatorSource, /Thank you/);
});

test("Excel recipe exposes formulas, validation, frozen headers, and source lineage", () => {
  assert.match(generatorSource, /state: "frozen", ySplit: 4/);
  assert.match(generatorSource, /CooperActionRegister/);
  assert.match(generatorSource, /COUNTIF/);
  assert.match(generatorSource, /dataValidation/);
  assert.match(generatorSource, /Source/);
  assert.match(generatorSource, /fullCalcOnLoad = true/);
});

test("shared host and web delivery recognize PowerPoint and Excel as binary Office artifacts", () => {
  assert.match(serverSource, /powerpoint_deck:[\s\S]*?outputType: "pptx"/);
  assert.match(serverSource, /excel_action_register:[\s\S]*?outputType: "xlsx"/);
  assert.match(serverSource, /\["pdf", "docx", "pptx", "xlsx"\]\.includes\(outputType\)/);
  assert.match(webSource, /\["docx", "pptx", "xlsx"\]\.includes\(outputType\)/);
  assert.match(webSource, /Download \{config\.product\} file/);
  assert.match(cssSource, /office-artifact-document\.pptx/);
  assert.match(cssSource, /office-artifact-document\.xlsx/);
});

test("native iOS advertises, bundles, routes, and previews both Office packages", () => {
  assert.match(nativeModels, /ArtifactRecipe\(kind: "powerpoint_deck"[\s\S]*?outputType: "pptx"/);
  assert.match(nativeModels, /ArtifactRecipe\(kind: "excel_action_register"[\s\S]*?outputType: "xlsx"/);
  assert.match(nativeCanvas, /CanvasBuildType\(id: "powerpoint_deck"/);
  assert.match(nativeCanvas, /CanvasBuildType\(id: "excel_action_register"/);
  assert.match(nativeModel, /Cooper-PowerPoint-Decision-Deck/);
  assert.match(nativeModel, /Cooper-Excel-Action-Register/);
  assert.match(nativeModel, /--open-preview-presentation/);
  assert.match(nativeModel, /--open-preview-workbook/);
  assert.match(nativeProject, /Cooper-PowerPoint-Decision-Deck\.pptx in Resources/);
  assert.match(nativeProject, /Cooper-Excel-Action-Register\.xlsx in Resources/);
});
