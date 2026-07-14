import assert from "node:assert/strict";
import test from "node:test";
import {
  derivePlanTitle,
  isLoopbackAddress,
  normalizePlanIngest
} from "../server/planIngest.js";
import { buildContextPacket, publicContextPacket } from "../server/contextCheckpoint.js";

test("plan ingest derives a bounded title from the first useful heading", () => {
  assert.equal(derivePlanTitle("###\n\n# Build shared session chat\n\nDetails"), "Build shared session chat");
  assert.equal(derivePlanTitle("Ship the continuation fix\nThen verify it"), "Ship the continuation fix");
  assert.equal(derivePlanTitle("# " + "x".repeat(120)).length, 80);
});

test("plan ingest accepts only explicit loopback peers", () => {
  for (const value of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]) {
    assert.equal(isLoopbackAddress(value), true);
  }
  for (const value of ["", undefined, "192.168.1.10", "8.8.8.8"]) {
    assert.equal(isLoopbackAddress(value), false);
  }
});

test("plan ingest preserves markdown, records truncation, and bounds metadata", () => {
  const result = normalizePlanIngest({
    plan: "# Plan\n\n- first\n- second\n" + "z".repeat(2_000),
    repo: "  Codex-voice  ",
    source: "claude-code/chat-with-plan"
  }, { maxChars: 1_200 });

  assert.equal(result.title, "Plan");
  assert.equal(result.repo, "Codex-voice");
  assert.equal(result.source, "claude-code/chat-with-plan");
  assert.match(result.plan, /^# Plan\n\n- first/);
  assert.equal(result.storedChars, 1_200);
  assert.equal(result.truncated, true);
});

test("context packets preserve explicit primary and locked evidence boundaries", () => {
  const packet = buildContextPacket({
    id: "packet-plan",
    sources: [{
      id: "source-plan",
      provider: "paste",
      type: "plan",
      title: "Imported plan",
      content: "# Plan",
      primary: true,
      locked: true
    }]
  });
  assert.equal(packet.sources[0].type, "plan");
  assert.equal(packet.sources[0].primary, true);
  assert.equal(packet.sources[0].locked, true);
  assert.equal(publicContextPacket(packet).sources[0].locked, true);
});
