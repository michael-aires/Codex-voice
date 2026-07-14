import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCalendarEvents,
  normalizeLocalProjects,
  normalizeNotionSprintMetadata,
  normalizeNotionTaskMetadata,
  normalizePastSessions,
  sortNotionTasks,
  zonedDayBounds
} from "../server/todayFeed.js";

function richText(text) {
  return [{ plain_text: text }];
}

const sprintId = "94ac3801-9384-458a-afee-15cadaaf8026";
const sprintDatabaseId = "6772d5ef-4e05-49b4-b41b-a5286f0f4cfa";

test("normalizes the Notion-marked current sprint and its related task IDs", () => {
  const sprint = normalizeNotionSprintMetadata({
    id: sprintId,
    url: "https://notion.example/sprint",
    properties: {
      "Sprint name": { type: "title", title: richText("Jun 29th - Jul 12th 2026") },
      "Sprint status": { type: "status", status: { name: "Current" } },
      Tasks: { type: "relation", relation: [{ id: "task-1" }, { id: "task-2" }] }
    }
  });

  assert.equal(sprint.current, true);
  assert.equal(sprint.title, "Jun 29th - Jul 12th 2026");
  assert.deepEqual(sprint.taskIds, ["task-1", "task-2"]);
});

test("normalizes an unfinished Sprint Board task and preserves its Notion URL", () => {
  const task = normalizeNotionTaskMetadata({
    id: "39c5efcc-eccd-8038-a3b7-f874099756ba",
    url: "https://app.notion.com/p/Peterson-ticket",
    parent: { type: "database_id", database_id: sprintDatabaseId },
    properties: {
      "Task name": { type: "title", title: richText("Peterson: Corporate Demand Notes missing from UI Permissions page") },
      Status: { type: "status", status: { name: "In progress" } },
      Sprint: { type: "relation", relation: [{ id: sprintId }] },
      Summary: { type: "rich_text", rich_text: richText("Restore the hidden UI and permission controls.") },
      Customer: { type: "select", select: { name: "Peterson" } },
      "Due date": { type: "date", date: { start: "2026-07-14", end: null } },
      "Task ID": { type: "unique_id", unique_id: { prefix: "PDD", number: 4756 } }
    }
  }, {
    databaseId: sprintDatabaseId,
    activeSprintId: sprintId,
    sprintTitle: "Jun 29th - Jul 12th 2026"
  });

  assert.equal(task.id, "notion-39c5efcc-eccd-8038-a3b7-f874099756ba");
  assert.equal(task.status, "In progress");
  assert.equal(task.metadata.taskId, "PDD-4756");
  assert.equal(task.url, "https://app.notion.com/p/Peterson-ticket");
  assert.equal(task.metadata.dueDate, "2026-07-14");
  assert.match(task.source, /Jun 29th - Jul 12th 2026/);
});

test("filters completed and off-sprint Notion tasks while keeping QA and customer-ready work", () => {
  const metadata = (status, relation = sprintId) => ({
    id: `${status}-${relation}`,
    parent: { type: "database_id", database_id: sprintDatabaseId },
    properties: {
      "Task name": { type: "title", title: richText(status) },
      Status: { type: "status", status: { name: status } },
      Sprint: { type: "relation", relation: [{ id: relation }] }
    }
  });

  assert.equal(normalizeNotionTaskMetadata(metadata("Done"), { activeSprintId: sprintId }), null);
  assert.equal(normalizeNotionTaskMetadata(metadata("In progress", "another-sprint"), { activeSprintId: sprintId }), null);
  const tasks = ["Not started", "Ready for Customer", "QA", "In progress"]
    .map((status) => normalizeNotionTaskMetadata(metadata(status), { activeSprintId: sprintId }))
    .filter(Boolean);
  assert.deepEqual(sortNotionTasks(tasks).map((task) => task.status), ["In progress", "QA", "Ready for Customer", "Not started"]);
});

test("normalizes Calendar events, duration, Zoom details, and marks the next event", () => {
  const events = normalizeCalendarEvents({
    events: [
      {
        id: "later",
        summary: "Peterson sprint review",
        start: { dateTime: "2026-07-13T16:00:00Z" },
        end: { dateTime: "2026-07-13T16:45:00Z" },
        organizer: { displayName: "Michael" },
        attendees: [{ self: true }, { displayName: "Sarah" }],
        location: "https://zoom.us/j/123456789",
        htmlLink: "https://calendar.google.com/event?eid=later"
      },
      {
        id: "past",
        summary: "Morning check-in",
        start: { dateTime: "2026-07-13T14:00:00Z" },
        end: { dateTime: "2026-07-13T14:30:00Z" }
      }
    ]
  }, { now: new Date("2026-07-13T15:00:00Z"), timeZone: "America/Vancouver" });

  assert.equal(events[1].status, "next");
  assert.equal(events[1].duration, "45 min");
  assert.equal(events[1].conference.provider, "zoom");
  assert.equal(events[1].conference.meetingNumber, "123456789");
  assert.equal(events[1].url, "https://calendar.google.com/event?eid=later");
});

test("derives exact local-day bounds for Arcade Calendar queries", () => {
  assert.deepEqual(zonedDayBounds(new Date("2026-07-13T20:00:00Z"), "America/Vancouver"), {
    date: "2026-07-13",
    start: "2026-07-13T00:00:00-07:00",
    end: "2026-07-14T00:00:00-07:00"
  });
});

test("normalizes active projects and ended sessions for Today tabs", () => {
  const projects = normalizeLocalProjects([
    { id: "p1", title: "Current project", status: "active", updatedAt: "2026-07-13T10:00:00Z", sourceCount: 3 },
    { id: "p2", title: "Archived", status: "archived", updatedAt: "2026-07-13T11:00:00Z" }
  ]);
  const sessions = normalizePastSessions([
    { id: "c1", title: "Finished call", status: "ended", startedAt: "2026-07-13T09:00:00Z", endedAt: "2026-07-13T09:30:00Z", transcript: [{}, {}] },
    { id: "c2", title: "Still live", status: "active", startedAt: "2026-07-13T10:00:00Z" }
  ], { timeZone: "America/Vancouver" });

  assert.deepEqual(projects.map((project) => project.title), ["Current project"]);
  assert.deepEqual(sessions.map((session) => session.title), ["Finished call"]);
  assert.equal(sessions[0].targetId, "c1");
});
