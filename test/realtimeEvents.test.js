import test from "node:test";
import assert from "node:assert/strict";
import { createAudioResponseEvent } from "../src/realtimeEvents.js";

test("createAudioResponseEvent requests spoken audio", () => {
  const event = createAudioResponseEvent("typed_prompt");

  assert.equal(event.type, "response.create");
  assert.deepEqual(event.response.output_modalities, ["audio"]);
  assert.equal(event.response.metadata.response_purpose, "typed_prompt");
});

test("createAudioResponseEvent sanitizes metadata purpose", () => {
  const event = createAudioResponseEvent("typed prompt!");

  assert.equal(event.response.metadata.response_purpose, "typed_prompt_");
});

test("createAudioResponseEvent falls back to manual purpose", () => {
  const event = createAudioResponseEvent("");

  assert.equal(event.response.metadata.response_purpose, "manual");
});
