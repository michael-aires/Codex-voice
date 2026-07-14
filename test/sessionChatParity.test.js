import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [server, web, api, appModel, shell, checkpoint, chat, voice] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/CooperAPIClient.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/AppModel.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/AppShellView.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/ContextCheckpoint.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/SessionChatView.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/VoiceSession.swift", import.meta.url), "utf8")
]);

test("the host streams typed turns through the same recorded Cooper tool executor", () => {
  assert.match(server, /app\.post\("\/api\/calls\/:id\/chat"/);
  assert.match(server, /"Content-Type": "text\/event-stream; charset=utf-8"/);
  assert.match(server, /responsesChatTools\(cooperToolDefinitions\)/);
  assert.match(server, /executeRecordedCooperTool\([\s\S]*functionCall\.name/);
  assert.match(server, /type: "function_call_output"/);
  assert.match(server, /source: "typed_chat"/);
  assert.match(server, /recordSessionChatUsage\(callId, completedResponse\)/);
});

test("typed transcript becomes authoritative context when voice joins the active call", () => {
  assert.match(server, /formatActiveCallTranscript\(call\)/);
  assert.match(server, /# Current session transcript/);
  assert.match(server, /Continue from them across chat and voice/);
  assert.match(voice, /transcript = call\.transcript/);
  assert.match(voice, /accessibilityIdentifier\("handoff-voice-to-chat"\)/);
  assert.match(appModel, /func handoffVoiceToChat/);
});

test("web chat works before microphone connection and streams inline activity", () => {
  assert.match(web, /fetch\(`\/api\/calls\/\$\{call\.id\}\/chat`/);
  assert.match(web, /for await \(const chatEvent of jsonSseEvents\(response\.body\)\)/);
  assert.match(web, /placeholder=\{chatStreaming \? "Cooper is responding\.\.\."/);
  assert.match(web, /disabled=\{chatStreaming \|\| !prompt\.trim\(\)\}/);
  assert.match(web, /chatActivities\.map\(\(activity\)/);
  assert.match(web, /<CallScreen[\s\S]*chatActivities=\{chatActivities\}/);
  assert.match(web, /Add voice/);
});

test("iOS exposes chat at the checkpoint and streams it without requesting microphone access", () => {
  assert.match(checkpoint, /enum SessionLaunchMode/);
  assert.match(checkpoint, /case chat/);
  assert.match(checkpoint, /accessibilityIdentifier\("session-launch-mode"\)/);
  assert.match(shell, /SessionChatView\(seed: seed\)/);
  assert.match(api, /session\.bytes\(for: request\)/);
  assert.match(api, /api\/calls\/\\\(callId\)\/chat/);
  assert.match(chat, /safeAreaInset\(edge: \.bottom\)/);
  assert.match(chat, /accessibilityIdentifier\("send-session-chat"\)/);
  assert.match(chat, /handoffChatToVoice/);
  assert.doesNotMatch(chat, /AVAudioSession|requestRecordPermission|WKWebView/);
  assert.match(appModel, /preferredLaunchMode: \.chat/);
});
