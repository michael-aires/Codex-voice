import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPushToTalkComputerTaskInput,
  classifyPushToTalkCommand,
  pushToTalkConfigFromEnv
} from "../server/pushToTalk.js";

test("push-to-talk classifies desktop app commands as Computer Use tasks", () => {
  const classification = classifyPushToTalkCommand("Open Spotify and wait for me.");

  assert.equal(classification.kind, "computer_task");
  assert.equal(classification.mode, "desktop_app");
  assert.equal(classification.appName, "Spotify");
});

test("push-to-talk classifies URL downloads as browser download work", () => {
  const classification = classifyPushToTalkCommand("Download https://example.com/report.pdf");

  assert.equal(classification.kind, "computer_task");
  assert.equal(classification.mode, "download");
  assert.equal(classification.targetUrl, "https://example.com/report.pdf");
  assert.deepEqual(classification.allowedDomains, ["example.com"]);
});

test("push-to-talk builds an operator task input from voice text", () => {
  const input = buildPushToTalkComputerTaskInput("Open Claude Code and help me work this task.");

  assert.equal(input.skill, "computer_use_desktop");
  assert.equal(input.title, "Computer Use: Claude Code");
  assert.equal(input.computerIntent.mode, "desktop_app");
  assert.equal(input.computerIntent.appName, "Claude Code");
  assert.equal(input.computerIntent.requestedBy, "push_to_talk");
  assert.match(input.goal, /Pause for approval/);
});

test("push-to-talk recognizes stop commands", () => {
  const classification = classifyPushToTalkCommand("Cooper, stop computer use and take hands off.");

  assert.equal(classification.kind, "stop_computer");
});

test("push-to-talk routes web search utterances to the local search tool", () => {
  const classification = classifyPushToTalkCommand("Search for AIRES requirements framework in Chrome");

  assert.equal(classification.kind, "local_tool");
  assert.equal(classification.tool, "search_web");
  assert.equal(classification.arguments.query, "AIRES requirements framework");
});

test("push-to-talk routes click result utterances to vision click", () => {
  const classification = classifyPushToTalkCommand("Click the search result for OpenAI Realtime docs");

  assert.equal(classification.kind, "local_tool");
  assert.equal(classification.tool, "click_link_with_vision");
  assert.match(classification.arguments.link_description, /OpenAI Realtime docs/);
});

test("push-to-talk config is env-driven and does not expose the token", () => {
  const config = pushToTalkConfigFromEnv({
    PORT: "6000",
    COOPER_PTT_TOKEN: "secret",
    COOPER_PTT_HOTKEY: "shift+f13"
  });

  assert.equal(config.serverUrl, "http://127.0.0.1:6000");
  assert.equal(config.tokenConfigured, true);
  assert.equal(config.defaultHotkey, "shift+f13");
  assert.equal(Object.hasOwn(config, "token"), false);
});
