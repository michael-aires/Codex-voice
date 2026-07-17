import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [mainSource, checkpointSource, componentSource, flowSource, stylesSource, redesignStylesSource, serverSource] = await Promise.all([
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/contextCheckpoint.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/preparedSession.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/sessionPreparationFlow.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/session-os.css", import.meta.url), "utf8"),
  readFile(new URL("../src/aires-redesign.css", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8")
]);

test("the checkpoint offers prepared and immediate entry paths", () => {
  assert.match(checkpointSource, /Prepare before entering/);
  assert.match(checkpointSource, /Create and prepare session/);
  assert.match(checkpointSource, /Enter without prep/);
  assert.match(checkpointSource, /Let Cooper decide/);
  assert.match(checkpointSource, /Choose documents/);
  assert.match(checkpointSource, /preparationKinds/);
  assert.match(checkpointSource, /context-compact-launch/);
  assert.match(stylesSource, /@media \(max-width: 980px\)[\s\S]*?\.context-compact-launch \{[\s\S]*?display: grid;/);
});

test("prepared sessions queue real background artifacts and reuse the workspace call", () => {
  assert.match(mainSource, /prepareContextCheckpointSession/);
  assert.match(mainSource, /workstream: "session_preparation"/);
  assert.match(mainSource, /ensureActiveSessionCall\(projectId/);
  assert.match(mainSource, /activeCallCreationRef\.current/);
  assert.match(serverSource, /qa_checklist:/);
  assert.match(serverSource, /workstream: cleanText\(req\.body\?\.workstream\)/);
});

test("an explicit no-document plan still creates one durable session", () => {
  const handlerStart = mainSource.indexOf("async function prepareContextCheckpointSession");
  const handlerEnd = mainSource.indexOf("function openCallWorkspace", handlerStart);
  const handler = mainSource.slice(handlerStart, handlerEnd);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.doesNotMatch(handler, /if \(!kinds\.length \|\|/);
  assert.ok(handler.indexOf("ensureActiveSessionCall(projectId") < handler.indexOf("if (!kinds.length)"));
  assert.match(handler, /Durable session created\. No documents were requested before entry\./);
  assert.match(handler, /return call;/);
});

test("prepared work opens a durable interstitial and supports early entry", () => {
  const handlerStart = mainSource.indexOf("async function startContextCheckpointSession");
  const handlerEnd = mainSource.indexOf("async function prepareContextCheckpointSession", handlerStart);
  const handler = mainSource.slice(handlerStart, handlerEnd);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.ok(handler.indexOf("openCallWorkspace(meeting, contextPacket, { preservePreparation: true })") < handler.indexOf("void prepareContextCheckpointSession"));
  assert.match(handler, /void prepareContextCheckpointSession\([\s\S]*?\.catch\(\(error\) =>/);
  assert.match(handler, /setChatError\(message\)/);
  assert.match(mainSource, /<SessionPreparationFlow/);
  assert.match(flowSource, /Enter session now/);
  assert.match(flowSource, /Entering now does not cancel or restart any background document/);
  assert.match(flowSource, /Recommended by Cooper/);
  assert.match(redesignStylesSource, /\.session-preparation-layout/);
});

test("voice transport failures preserve the durable call and reconnect", () => {
  const connectStart = mainSource.indexOf("async function connectRealtime");
  const connectEnd = mainSource.indexOf("function startBlankCall", connectStart);
  const handler = mainSource.slice(connectStart, connectEnd);
  assert.match(mainSource, /connectPromiseRef/);
  assert.match(mainSource, /scheduleRealtimeReconnect/);
  assert.match(mainSource, /cleanupRealtimeTransport/);
  assert.doesNotMatch(handler, /endCall\(\{ failed: true \}\)/);
  assert.match(handler, /scheduleRealtimeReconnect\(error, generation\)/);
});

test("the call canvas contains the approved prepared-session overview", () => {
  assert.match(componentSource, /Session overview/);
  assert.match(componentSource, /What Cooper knows/);
  assert.match(componentSource, /Shared understanding/);
  assert.match(componentSource, /Questions for the room/);
  assert.match(componentSource, /Ready to review/);
  assert.match(componentSource, /Documents/);
  assert.match(componentSource, /Sources/);
  assert.match(componentSource, /Activity/);
  assert.match(stylesSource, /\.prepared-session-overview/);
  assert.match(stylesSource, /\.call-workbench \.call-canvas \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(stylesSource, /\.prepared-session-canvas \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0;/);
  assert.match(stylesSource, /\.prepared-session-shell \{[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: hidden;/);
  assert.match(stylesSource, /@media \(max-width: 820px\)/);
});

test("presentation is the default call canvas and overview remains secondary", () => {
  assert.match(mainSource, /React\.useState\("presentation"\)/);
  assert.match(mainSource, />Presentation<\/button>/);
  assert.match(mainSource, /activeTab === "presentation"/);
  assert.match(mainSource, />Overview<\/button>/);
  assert.match(mainSource, /createSessionPresentation/);
  assert.match(mainSource, /buildSessionPresentationVoicePrompt/);
});
