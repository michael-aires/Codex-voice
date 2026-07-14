import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [serverSource, modelSource, appModelSource, librarySource] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/Models.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/AppModel.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/ArtifactLibraryView.swift", import.meta.url), "utf8")
]);

test("artifact delivery preserves binary bytes on the Cooper host", () => {
  const route = serverSource.match(/app\.get\("\/api\/artifacts\/:id\/content"[\s\S]*?\n\}\);/u)?.[0] || "";

  assert.match(route, /readFile\(join\(artifactsDir, artifactFileName\(artifact\)\)\)/);
  assert.doesNotMatch(route, /readFile\([^\n]+"utf8"/);
  assert.match(route, /res\.type\(artifactMimeType\(artifact\)\)\.send\(content\)/);
});

test("iOS exports named files and selects native document preview by metadata", () => {
  assert.match(modelSource, /var prefersNativePreview: Bool \{ !isTextArtifact \}/);
  assert.match(appModelSource, /func artifactFile\(for artifact: ArtifactRecord\)/);
  assert.match(appModelSource, /CooperArtifactExports/);
  assert.match(appModelSource, /completeFileProtectionUntilFirstUserAuthentication/);
  assert.match(librarySource, /import QuickLook/);
  assert.match(librarySource, /QuickLookArtifactView\(fileURL: fileURL\)/);
  assert.match(librarySource, /ShareLink\([\s\S]*?item: fileURL/);
  assert.match(librarySource, /SafeArtifactHTMLView\(content: content\)/);
});
