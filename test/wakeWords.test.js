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

test("wakes on broad Cooper mentions so live meetings do not require exact recipes", () => {
  [
    "The Cooper app is listening.",
    "We mentioned Cooper earlier.",
    "Someone named Cooper joined the meeting.",
    "This is for Cooper later, but keep going.",
    "The Cooper transcript needs to include all speakers.",
    "I was talking about Cooper's wake word.",
    "Michael said the word Cooper in a sentence.",
    "Thanks Cooper.",
    "About Cooper, can we make the canvas better?"
  ].forEach((phrase) => {
    assert.equal(isCooperWakePhrase(phrase), true, phrase);
  });
});

test("does not wake without Cooper or when explicitly suppressed", () => {
  [
    "",
    "Can someone summarize this?",
    "Not Cooper, the other tool.",
    "Let's not ask Cooper yet.",
    "Do not ask Cooper yet.",
    "Don't wake Cooper yet.",
    "Do not call Cooper for this.",
    "Cooper should not interrupt here.",
    "Cooper never respond to this."
  ].forEach((phrase) => {
    assert.equal(isCooperWakePhrase(phrase), false, phrase);
  });
});

test("short Cooper mentions wake unless negated", () => {
  assert.equal(isCooperWakePhrase("hey Cooper"), true);
  assert.equal(isCooperWakePhrase("thanks Cooper"), true);
  assert.equal(isCooperWakePhrase("about Cooper"), true);
  assert.equal(isCooperWakePhrase("not Cooper"), false);
});
