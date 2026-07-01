import test from "node:test";
import assert from "node:assert/strict";
import { isCooperWakePhrase, normalizeWakeText } from "../src/wakeWords.js";

test("normalizes punctuation, casing, and curly apostrophes", () => {
  assert.equal(normalizeWakeText("Let’s ask Cooper, please."), "let's ask cooper please");
  assert.equal(normalizeWakeText("HEY, COOPER — analyze this."), "hey cooper analyze this");
});

test("wakes on direct Cooper invocations", () => {
  [
    "Cooper",
    "Cooper?",
    "Hey Cooper",
    "Hey Cooper, what do you think?",
    "Okay Cooper, analyze this.",
    "Hi Cooper, can you hear me?",
    "Let's ask Cooper",
    "Let’s ask Cooper",
    "Ask Cooper",
    "What do you think, Cooper?",
    "Cooper, what do you think?",
    "Cooper, give me your take",
    "Cooper, what are we missing?",
    "Cooper, help me think through this",
    "Cooper, jump in",
    "Cooper, summarize this",
    "Cooper, it's time for you",
    "Cooper, can you draw me a mermaid diagram?",
    "Cooper, could you build a prototype?",
    "Cooper, would you draft the follow-up?",
    "Cooper, will you check the calendar?",
    "Cooper, are you there?",
    "Cooper, should we split this into two tickets?",
    "Cooper, review this architecture",
    "Cooper, make a wireframe",
    "Cooper, render the MCP app",
    "Cooper, search Notion for the sprint epic"
  ].forEach((phrase) => {
    assert.equal(isCooperWakePhrase(phrase), true, phrase);
  });
});

test("does not wake when Cooper is only mentioned casually", () => {
  [
    "",
    "Can someone summarize this?",
    "The Cooper app is listening.",
    "We mentioned Cooper earlier.",
    "I don't think Cooper should speak yet.",
    "Not Cooper, the other tool.",
    "Someone named Cooper joined the meeting.",
    "This is for Cooper later, but keep going.",
    "The Cooper transcript needs to include all speakers.",
    "I was talking about Cooper's wake word.",
    "Michael said the word Cooper in a sentence.",
    "Let's not ask Cooper yet.",
    "Do not ask Cooper yet.",
    "Cooper should not interrupt here.",
    "The Cooper canvas has a diagram.",
    "We need Cooper access in settings."
  ].forEach((phrase) => {
    assert.equal(isCooperWakePhrase(phrase), false, phrase);
  });
});

test("requires direct intent even for short Cooper mentions", () => {
  assert.equal(isCooperWakePhrase("hey Cooper"), true);
  assert.equal(isCooperWakePhrase("thanks Cooper"), false);
  assert.equal(isCooperWakePhrase("about Cooper"), false);
  assert.equal(isCooperWakePhrase("not Cooper"), false);
});
