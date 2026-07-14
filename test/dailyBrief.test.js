import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyBrief,
  millisecondsUntilLocalHour,
  selectAssignedTasks
} from "../server/dailyBrief.js";

function task(id, title, assignees, { status = "In progress", dueDate = "" } = {}) {
  return {
    id,
    title,
    status,
    metadata: {
      taskId: id.toUpperCase(),
      assignees,
      dueDate
    }
  };
}

test("Daily Catch Up filters the active sprint to Michael and produces four presentation slides", () => {
  const brief = buildDailyBrief({
    date: "2026-07-14",
    timeZone: "America/Vancouver",
    generatedAt: "2026-07-14T14:00:00.000Z",
    trigger: "scheduled",
    meetings: [
      { id: "meeting-1", time: "09:30", title: "Sprint review", duration: "45 min", status: "next", subtitle: "Product team" }
    ],
    tasks: [
      task("pdd-1", "Fix permissions", ["Michael Moll"], { dueDate: "2026-07-14" }),
      task("pdd-2", "Write customer notes", ["Sarah Chen"])
    ],
    sprint: { title: "Sprint 14" }
  });

  assert.equal(brief.assignment.mode, "matched");
  assert.deepEqual(brief.tasks.map((item) => item.title), ["Fix permissions"]);
  assert.equal(brief.slides.length, 4);
  assert.deepEqual(brief.slides.map((slide) => slide.id), ["overview", "calendar", "sprint", "focus"]);
  assert.deepEqual(brief.slides.map((slide) => slide.voiceCue), [
    "Good morning. Here's your daily update.",
    "On your calendar",
    "In the sprint",
    "Your focus for today"
  ]);
  assert.match(brief.summary, /1 meeting/);
  assert.match(brief.summary, /1 open ticket/);
  assert.match(brief.voicePrompt, /Good morning\. Here's your daily update\./);
  assert.match(brief.voicePrompt, /only a brief natural breath between lines/i);
  assert.equal(brief.trigger, "scheduled");
});

test("Daily Catch Up keeps sprint work visible when Notion returns only opaque assignee IDs", () => {
  const tasks = [task("pdd-3", "Opaque assignment", ["39c5efcc-eccd-8038-a3b7-f874099756ba"]), task("pdd-4", "No assignment", [])];
  const assignment = selectAssignedTasks(tasks, ["Michael Moll"]);

  assert.equal(assignment.mode, "unverified");
  assert.equal(assignment.tasks.length, 2);
  assert.match(assignment.message, /did not expose readable assignee names/i);
});

test("Daily Catch Up can return an empty matched set without leaking another person's tickets", () => {
  const assignment = selectAssignedTasks([
    task("pdd-5", "Sarah's work", ["Sarah Chen"])
  ], ["Michael Moll", "michael@aires.ai"]);

  assert.equal(assignment.mode, "matched");
  assert.deepEqual(assignment.tasks, []);
});

test("7 a.m. scheduler calculates the next local Vancouver run", () => {
  const delay = millisecondsUntilLocalHour(
    new Date("2026-07-14T13:30:00.000Z"),
    "America/Vancouver",
    7
  );
  assert.equal(delay, 30 * 60 * 1000);
});
