import assert from "node:assert/strict";
import test from "node:test";
import {
  boundedSessionChatInput,
  consumeJsonSseFrames,
  normalizeSessionChatPrompt,
  parseFunctionArguments,
  responseFunctionCalls,
  responseOutputText,
  responsesChatTools
} from "../src/sessionChatProtocol.js";

test("session chat validates messages and keeps the newest bounded transcript turns", () => {
  assert.match(normalizeSessionChatPrompt("   ").error, /required/);
  assert.equal(normalizeSessionChatPrompt("  Ship it  ").prompt, "Ship it");
  assert.match(normalizeSessionChatPrompt("abcd", 3).error, /limited/);

  const input = boundedSessionChatInput([
    { speaker: "Michael", text: "old context" },
    { speaker: "Cooper", text: "middle" },
    { speaker: "Michael", text: "new request" }
  ], { maxChars: 17, maxTurns: 3 });
  assert.deepEqual(input, [
    { role: "assistant", content: "middle" },
    { role: "user", content: "new request" }
  ]);
});

test("session chat converts shared tools for Responses without changing their schemas", () => {
  const tools = responsesChatTools([{ type: "function", name: "check_calendar", parameters: { type: "object" } }]);
  assert.deepEqual(tools, [{ type: "function", name: "check_calendar", parameters: { type: "object" }, strict: false }]);
});

test("session chat extracts public text and every completed function call", () => {
  const response = {
    output: [
      { type: "reasoning", summary: [] },
      { type: "function_call", call_id: "call-1", name: "check_calendar", arguments: "{\"date\":\"2026-07-14\"}" },
      { type: "message", content: [{ type: "output_text", text: "Calendar checked." }] }
    ]
  };
  assert.equal(responseOutputText(response), "Calendar checked.");
  assert.equal(responseFunctionCalls(response).length, 1);
  assert.deepEqual(parseFunctionArguments(response.output[1].arguments), { date: "2026-07-14" });
  assert.deepEqual(parseFunctionArguments("not-json"), {});
});

test("session chat decodes split SSE frames and ignores the terminal marker", () => {
  const first = consumeJsonSseFrames('event: message.delta\ndata: {"type":"message.delta","delta":"Hel');
  assert.deepEqual(first.events, []);
  const second = consumeJsonSseFrames(`${first.remainder}lo"}\n\ndata: [DONE]\n\n`);
  assert.deepEqual(second.events, [{ type: "message.delta", delta: "Hello" }]);
  assert.equal(second.remainder, "");
});
