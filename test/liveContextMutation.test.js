import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [serverSource, webSource, appModelSource, apiSource, voiceSource, canvasSource] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/AppModel.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/CooperAPIClient.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/VoiceSession.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/SessionCanvasView.swift", import.meta.url), "utf8")
]);

test("the host attaches live context to the durable call and rebuilds active snapshots", () => {
  assert.match(serverSource, /app\.get\("\/api\/calls\/:id\/live-context"/);
  assert.match(serverSource, /typeof req\.body\?\.projectId === "string"/);
  assert.match(serverSource, /syncCallProjectContext\(db, call/);
  assert.match(serverSource, /item\.status === "active" && item\.projectId === projectId/);
  assert.match(serverSource, /realtimeSession: realtimeSession\(liveContext\.sessionContext\)/);
  assert.match(serverSource, /buildWorkPrompt\(db, call, job/);
  assert.match(serverSource, /const sessionEvidence = buildLiveCallContext\(db, call\)\.sessionContext/);
  assert.match(serverSource, /call\.status === "active" && project/);
  assert.doesNotMatch(
    serverSource,
    /projectContextSnapshot:\s*\[\s*project \? buildProjectContext[\s\S]{0,180}contextPacket\?\.context/
  );
});

test("web live context uses the same durable call and host-generated Realtime session", () => {
  assert.match(webSource, /body: JSON\.stringify\(\{ projectId: payload\.project\.id \}\)/);
  assert.match(webSource, /`\/api\/calls\/\$\{activeCall\.id\}\/live-context`/);
  assert.match(webSource, /\{ type: "session\.update", session: payload\.realtimeSession \}/);
});

test("iOS can paste or upload live evidence without creating a second session", () => {
  assert.match(apiSource, /func attachProject\(callId: String, projectId: String\)/);
  assert.match(apiSource, /func liveSessionContext\(callId: String\)/);
  assert.match(appModelSource, /func addLiveContext\(/);
  assert.match(appModelSource, /sourceType: "live_call"/);
  assert.match(appModelSource, /func uploadLiveContext\(/);
  assert.match(voiceSource, /func updateRealtimeSession\(_ session: JSONValue\)/);
  assert.match(voiceSource, /"type": "session\.update"/);
  assert.match(canvasSource, /accessibilityIdentifier\("add-live-context"\)/);
  assert.match(canvasSource, /accessibilityIdentifier\("upload-live-context"\)/);
  assert.match(canvasSource, /New context is stored on the Cooper host, attached to this session/);
  assert.match(appModelSource, /--open-preview-live-context/);
});
