import test from "node:test";
import assert from "node:assert/strict";
import {
  collectJobLogs,
  formatDurationMs,
  jobApiLine,
  jobStatusLine,
  progressPercent
} from "../src/jobTelemetry.js";

test("progressPercent reserves visible progress for active running jobs", () => {
  assert.equal(progressPercent({ status: "queued", stepIndex: 0, stepCount: 3 }), 8);
  assert.equal(progressPercent({ status: "running", stepIndex: 0, stepCount: 3 }), 8);
  assert.equal(progressPercent({ status: "running", stepIndex: 1, stepCount: 3 }), 39);
  assert.equal(progressPercent({ status: "completed", stepIndex: 3, stepCount: 3 }), 100);
});

test("formatDurationMs renders compact elapsed time", () => {
  assert.equal(formatDurationMs(900), "0s");
  assert.equal(formatDurationMs(12_300), "12s");
  assert.equal(formatDurationMs(72_000), "1m 12s");
});

test("jobStatusLine includes model, token budget, retries, and wait state", () => {
  const now = new Date("2026-07-01T22:00:30.000Z").getTime();
  const line = jobStatusLine({
    status: "running",
    stepIndex: 0,
    stepCount: 3,
    attempts: 1,
    failures: 0,
    maxAttempts: 3,
    model: "gpt-5.4",
    maxOutputTokens: 14000,
    apiStatus: "waiting_for_openai",
    lastApiStartedAt: "2026-07-01T22:00:00.000Z"
  }, now);

  assert.match(line, /running - step 1\/3/);
  assert.match(line, /calls 1/);
  assert.match(line, /retries 0\/3/);
  assert.match(line, /model gpt-5\.4/);
  assert.match(line, /14000 output tokens/);
  assert.match(line, /30s waiting/);
});

test("jobApiLine describes waiting and response-received states", () => {
  const now = new Date("2026-07-01T22:00:45.000Z").getTime();

  assert.equal(
    jobApiLine({
      apiStatus: "waiting_for_openai",
      lastApiStartedAt: "2026-07-01T22:00:00.000Z"
    }, now),
    "API: waiting on OpenAI response for 45s."
  );

  assert.equal(
    jobApiLine({
      apiStatus: "response_received",
      lastApiDurationMs: 2300,
      lastOutputChars: 4200
    }, now),
    "API: response received in 2s, 4,200 chars."
  );
});

test("collectJobLogs flattens logs newest-first with job titles", () => {
  const logs = collectJobLogs([
    {
      id: "a",
      title: "First job",
      logs: [{ id: "1", at: "2026-07-01T22:00:00Z", type: "queued", message: "Queued." }]
    },
    {
      id: "b",
      title: "Second job",
      logs: [{ id: "2", at: "2026-07-01T22:01:00Z", type: "api_request", message: "Sent." }]
    }
  ]);

  assert.equal(logs[0].jobId, "b");
  assert.equal(logs[0].jobTitle, "Second job");
  assert.equal(logs[1].jobId, "a");
});
