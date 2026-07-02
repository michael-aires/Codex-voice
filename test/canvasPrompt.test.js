import test from "node:test";
import assert from "node:assert/strict";
import { buildCanvasCustomPrompt } from "../src/canvasPrompt.js";

test("typed canvas context is primary and excludes stale project context", () => {
  const prompt = buildCanvasCustomPrompt({
    request: "Build a requirements doc for daily reporting cards.",
    projectContext: "Multi-user cooper membership project should not be used.",
    transcriptEntries: [{ speaker: "Michael", text: "Focus on daily activity and weekly summaries." }],
    fallbackPrompt: "Create a diagram from the current conversation."
  });

  assert.match(prompt, /primary source of truth/);
  assert.match(prompt, /daily reporting cards/);
  assert.match(prompt, /Secondary live transcript context/);
  assert.doesNotMatch(prompt, /membership project should not be used/);
});

test("blank canvas prompt uses selected project context and transcript", () => {
  const prompt = buildCanvasCustomPrompt({
    request: "",
    projectContext: "Project source material.",
    transcriptEntries: [{ speaker: "Michael", text: "Create a service blueprint." }],
    fallbackPrompt: "Create an artifact from the current conversation."
  });

  assert.match(prompt, /Create an artifact/);
  assert.match(prompt, /Active project context/);
  assert.match(prompt, /Project source material/);
  assert.match(prompt, /Recent live transcript/);
});

test("blank canvas prompt without a project uses fallback and transcript only", () => {
  const prompt = buildCanvasCustomPrompt({
    request: "",
    projectContext: "",
    transcriptEntries: [{ speaker: "Michael", text: "Generate a daily reporting requirements doc." }],
    fallbackPrompt: "Create an AIRES requirements artifact from the current conversation."
  });

  assert.match(prompt, /Create an AIRES requirements artifact/);
  assert.match(prompt, /Generate a daily reporting requirements doc/);
  assert.doesNotMatch(prompt, /Active project context/);
});
