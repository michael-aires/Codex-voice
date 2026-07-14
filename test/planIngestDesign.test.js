import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [server, web, models, sessions, checkpoint, integration] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/Models.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/SessionsView.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/ContextCheckpoint.swift", import.meta.url), "utf8"),
  readFile(new URL("../integrations/chat-with-plan/bin/chat-with-plan.mjs", import.meta.url), "utf8")
]);

test("host plan ingest is independently authenticated, loopback-only, and uses the shared context model", () => {
  assert.match(server, /app\.get\("\/api\/health"/);
  assert.match(server, /req\.path === "\/api\/ingest\/plan"/);
  assert.match(server, /if \(!isLoopbackAddress\(remoteAddress\)\)/);
  assert.match(server, /safeCompare\(bearer\?\.\[1\] \|\| "", ingestToken\)/);
  assert.match(server, /buildContextPacket\(\{/);
  assert.match(server, /source: "plan_ingest"/);
  assert.match(server, /appUrl: `cooper:\/\/sessions\//);
});

test("web consumes an imported exact-session link and keeps host-authored Realtime context", () => {
  assert.match(web, /new URLSearchParams\(window\.location\.search\)\.get\("call"\)/);
  assert.match(web, /selectedCallIdRef\.current = deepLinkedCallId/);
  assert.match(web, /setView\("library"\)/);
  assert.match(web, /authoritativeRealtimeSession/);
  assert.match(web, /liveContext\.sessionContext \|\| activeProjectContextRef\.current/);
});

test("iOS recognizes imported sessions without forking their saved-session UI", () => {
  assert.match(models, /var source = "session"/);
  assert.match(models, /var contextPacketIds: \[String\]/);
  assert.match(models, /var isImportedPlan: Bool/);
  assert.match(sessions, /accessibilityIdentifier\("imported-plan-context"\)/);
  assert.match(sessions, /model\.presentVoiceSession\(resuming: session\)/);
  assert.match(checkpoint, /accessibilityIdentifier\("inherited-context-boundary"\)/);
  assert.match(checkpoint, /New selections below form a separate current checkpoint/);
});

test("chat-with-plan can open the same record on web and a booted iOS Simulator", () => {
  assert.match(integration, /DEFAULT_BASE_URL = "http:\/\/localhost:5000"/);
  assert.match(integration, /\/api\/ingest\/plan/);
  assert.match(integration, /"simctl", "openurl", "booted"/);
  assert.match(integration, /\["web", "ios", "both"\]/);
});
