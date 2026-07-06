import test from "node:test";
import assert from "node:assert/strict";
import {
  addRealtimeResponseUsage,
  addRealtimeTranscriptionUsage,
  addResponsesApiUsage,
  callCostSummary,
  callUsageTokens,
  createEmptyRealtimeUsage,
  summarizeRealtimeUsage
} from "../src/callCost.js";

test("Realtime response usage cost separates cached, text, and audio tokens", () => {
  const usage = addRealtimeResponseUsage(createEmptyRealtimeUsage({ startedAt: "2026-07-03T00:00:00.000Z" }), {
    total_tokens: 253,
    input_tokens: 132,
    output_tokens: 121,
    input_token_details: {
      text_tokens: 119,
      audio_tokens: 13,
      image_tokens: 0,
      cached_tokens: 64,
      cached_tokens_details: {
        text_tokens: 64,
        audio_tokens: 0,
        image_tokens: 0
      }
    },
    output_token_details: {
      text_tokens: 30,
      audio_tokens: 91
    }
  }, "2026-07-03T00:01:00.000Z");

  assert.equal(usage.responses, 1);
  assert.equal(usage.response.totalTokens, 253);
  assert.equal(usage.response.cachedTextTokens, 64);
  assert.equal(usage.response.outputAudioTokens, 91);
  assert.equal(callUsageTokens(usage), 253);
  assert.equal(usage.costUsd, 0.007206);
});

test("Realtime transcription usage is included in call cost", () => {
  let usage = createEmptyRealtimeUsage({ startedAt: "2026-07-03T00:00:00.000Z" });
  usage = addRealtimeTranscriptionUsage(usage, {
    type: "tokens",
    total_tokens: 26,
    input_tokens: 17,
    input_token_details: {
      text_tokens: 0,
      audio_tokens: 17
    },
    output_tokens: 9
  }, "2026-07-03T00:02:00.000Z");

  assert.equal(usage.transcriptionEvents, 1);
  assert.equal(usage.transcription.inputAudioTokens, 17);
  assert.equal(usage.transcription.outputTokens, 9);
  assert.equal(usage.costUsd, 0.000066);
});

test("Call cost summary uses actual usage before estimating legacy calls", () => {
  const realtimeUsage = summarizeRealtimeUsage({
    responses: 1,
    response: {
      totalTokens: 1000,
      inputTokens: 500,
      outputTokens: 500,
      inputAudioTokens: 500,
      outputAudioTokens: 500
    }
  }, "2026-07-03T00:03:00.000Z");

  const summary = callCostSummary({ realtimeUsage }, [{ maxOutputTokens: 14000 }]);

  assert.equal(summary.source, "actual");
  assert.equal(summary.tokenLabel, "1.0k");
  assert.equal(summary.costLabel, "Cost");
  assert.equal(summary.costValue, "$0.05");
});

test("Responses API artifact usage is included in call cost", () => {
  const responseUsage = addResponsesApiUsage(null, {
    total_tokens: 1500,
    input_tokens: 1000,
    input_tokens_details: {
      cached_tokens: 200
    },
    output_tokens: 500
  }, { model: "gpt-5.4", at: "2026-07-03T00:04:00.000Z" });

  assert.equal(responseUsage.calls.length, 1);
  assert.equal(responseUsage.totalTokens, 1500);
  assert.equal(responseUsage.costUsd, 0.00955);

  const summary = callCostSummary({}, [{ responseUsage }]);
  assert.equal(summary.source, "actual");
  assert.equal(summary.model, "gpt-5.4");
  assert.equal(summary.tokenLabel, "1.5k");
  assert.equal(summary.costValue, "$0.0095");
});

test("Call cost summary combines Realtime and generated artifact usage", () => {
  const realtimeUsage = summarizeRealtimeUsage({
    responses: 1,
    response: {
      totalTokens: 1000,
      inputTokens: 500,
      outputTokens: 500,
      inputAudioTokens: 500,
      outputAudioTokens: 500
    }
  }, "2026-07-03T00:03:00.000Z");
  const responseUsage = addResponsesApiUsage(null, {
    total_tokens: 1500,
    input_tokens: 1000,
    input_tokens_details: { cached_tokens: 200 },
    output_tokens: 500
  }, { model: "gpt-5.4", at: "2026-07-03T00:04:00.000Z" });

  const summary = callCostSummary({ realtimeUsage }, [{ responseUsage }]);

  assert.equal(summary.source, "actual");
  assert.equal(summary.model, "mixed");
  assert.equal(summary.tokenLabel, "2.5k");
  assert.equal(summary.costValue, "$0.06");
});

test("Legacy calls show an estimated fallback instead of fake exact cost", () => {
  const summary = callCostSummary({
    durationSeconds: 120,
    transcript: [
      { speaker: "Michael", text: "Cooper walk me through the definition of done." },
      { speaker: "Cooper", text: "The practical move is to turn the checklist into workflow." }
    ]
  });

  assert.equal(summary.source, "estimate");
  assert.equal(summary.costLabel, "Est. cost");
  assert.match(summary.costValue, /^~\$/);
  assert.match(summary.tokenLabel, /^~/);
});
