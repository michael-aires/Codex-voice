import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sessions = await readFile(
  new URL("../native/ios-app/CooperMobile/SessionsView.swift", import.meta.url),
  "utf8"
);

test("native session detail keeps its mobile header composed", () => {
  assert.match(sessions, /private var sessionHeader: some View/);
  assert.match(sessions, /\.font\(\.title2\.bold\(\)\)/);
  assert.match(sessions, /\.dynamicTypeSize\(\.\.\.DynamicTypeSize\.xxxLarge\)/);
  assert.match(sessions, /LazyVStack\(alignment: \.leading, spacing: 22\)/);
  assert.match(sessions, /private var sessionMetadata: some View/);
  assert.match(sessions, /ViewThatFits\(in: \.horizontal\)/);
});

test("native session detail preserves stable chat, voice, and canvas actions", () => {
  assert.match(sessions, /private var chatButton: some View/);
  assert.match(sessions, /private var voiceButton: some View/);
  assert.match(sessions, /frame\(maxWidth: \.infinity, minHeight: 46\)/);
  assert.match(sessions, /accessibilityIdentifier\("continue-session-chat"\)/);
  assert.match(sessions, /accessibilityIdentifier\("continue-session-voice"\)/);
  assert.match(sessions, /accessibilityIdentifier\("open-session-canvas"\)/);
});
