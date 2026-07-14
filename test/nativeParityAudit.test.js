import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [models, voice, client, appModel, connections, settings] = await Promise.all([
  readFile(new URL("../native/ios-app/CooperMobile/Models.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/VoiceSession.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/CooperAPIClient.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/AppModel.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/ConnectionsView.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/SettingsView.swift", import.meta.url), "utf8")
]);

test("native wake gating shares the web negation boundary", () => {
  assert.match(models, /enum CooperWakePhrase/);
  assert.match(models, /cooper\\s\+should\\s\+\(not\|never\)/);
  assert.match(voice, /if CooperWakePhrase\.matches\(text\)/);
  assert.match(voice, /conversation\.item\.input_audio_transcription\.failed/);
});

test("native Connections exposes the shared authorize-all Arcade contract", () => {
  assert.match(client, /api\/tools\/arcade\/authorize-all/);
  assert.match(appModel, /prepareAllArcadeAuthorizations/);
  assert.match(connections, /Button\("Authorize all mapped tools"\)/);
  assert.match(connections, /authorize-all-arcade-tools/);
  assert.match(connections, /Complete mapped-tool authorization/);
});

test("native Settings exposes the shared tool audit trail and current delivery boundary", () => {
  assert.match(models, /struct ToolCallRecord/);
  assert.match(appModel, /toolCalls = workspace\.toolCalls/);
  assert.match(settings, /Section\("Recent tool activity"\)/);
  assert.match(settings, /Native parity audit/);
  assert.match(settings, /physical-device audio/);
});
