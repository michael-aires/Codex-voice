import test from "node:test";
import assert from "node:assert/strict";
import {
  canvasJobsForCall,
  detectCanvasWorkTransition
} from "../src/callCanvasState.js";

test("canvas exposes queued and running work until an artifact replaces its job tab", () => {
  const jobs = [
    { id: "job-1", callId: "call-1", status: "running" },
    { id: "job-2", callId: "call-1", status: "queued" },
    { id: "job-3", callId: "call-2", status: "running" }
  ];

  assert.deepEqual(canvasJobsForCall(jobs, [], "call-1").map((job) => job.id), ["job-1", "job-2"]);
  assert.deepEqual(
    canvasJobsForCall(jobs, [{ id: "artifact-1", callId: "call-1", jobId: "job-1" }], "call-1").map((job) => job.id),
    ["job-2"]
  );
});

test("canvas detects a voice-started job and then prioritizes its completed artifact", () => {
  const initial = detectCanvasWorkTransition(null, [], [], "call-1");
  const started = detectCanvasWorkTransition(
    initial.next,
    [{ id: "job-1", callId: "call-1", status: "queued" }],
    [],
    "call-1"
  );
  const completed = detectCanvasWorkTransition(
    started.next,
    [{ id: "job-1", callId: "call-1", status: "completed" }],
    [{ id: "artifact-1", jobId: "job-1", callId: "call-1" }],
    "call-1"
  );

  assert.equal(started.event.type, "job_started");
  assert.equal(started.event.job.id, "job-1");
  assert.equal(completed.event.type, "artifact_ready");
  assert.equal(completed.event.artifact.id, "artifact-1");
});

test("changing calls initializes canvas state without replaying old transitions", () => {
  const previous = detectCanvasWorkTransition(null, [], [], "call-1").next;
  const transition = detectCanvasWorkTransition(
    previous,
    [{ id: "job-2", callId: "call-2", status: "running" }],
    [],
    "call-2"
  );

  assert.equal(transition.event, null);
  assert.equal(transition.next.callId, "call-2");
});
