import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveSessionMemory,
  legacyViewForSessionNav,
  sessionNavKey
} from "../src/sessionModel.js";

test("Session OS navigation maps the legacy views without losing routes", () => {
  assert.equal(sessionNavKey("home"), "today");
  assert.equal(sessionNavKey("today-detail"), "today");
  assert.equal(sessionNavKey("library"), "sessions");
  assert.equal(sessionNavKey("projects"), "projects");
  assert.equal(sessionNavKey("artifacts"), "library");
  assert.equal(sessionNavKey("settings"), "settings");

  assert.equal(legacyViewForSessionNav("today"), "home");
  assert.equal(legacyViewForSessionNav("sessions"), "library");
  assert.equal(legacyViewForSessionNav("library"), "artifacts");
});

test("Session Memory derives Brief, Debate, Decision, and Build from persisted public state", () => {
  const chapters = deriveSessionMemory({
    sessionFocus: {
      title: "Post-close transaction review",
      description: "Decide how legitimate late-arriving facts update a closed deal."
    },
    transcripts: [
      { id: "t1", speaker: "Michael", text: "We need to support closing dates that arrive later.", createdAt: "2026-07-10T16:02:00.000Z" },
      { id: "t2", speaker: "Cooper", text: "The tradeoff is record integrity versus operational accuracy.", createdAt: "2026-07-10T16:12:00.000Z" },
      { id: "t3", speaker: "Michael", text: "We should allow approved operational fields with an audit trail.", createdAt: "2026-07-10T16:21:00.000Z" }
    ],
    jobs: [
      { id: "j1", title: "Product requirements", status: "completed", artifactId: "a1", updatedAt: "2026-07-10T16:30:00.000Z" }
    ],
    artifacts: [
      { id: "a1", title: "Controlled editing requirements", description: "Scoped requirements are ready.", createdAt: "2026-07-10T16:31:00.000Z" }
    ]
  });

  assert.deepEqual(chapters.map((chapter) => chapter.id), ["brief", "debate", "decision", "build"]);
  assert.equal(chapters[0].title, "Post-close transaction review");
  assert.match(chapters[2].summary, /approved operational fields/i);
  assert.equal(chapters[3].artifactId, "a1");
  assert.equal(chapters[3].status, "active");
  assert.equal(chapters.filter((chapter) => chapter.active).length, 1);
});

test("Session Memory remains useful before a realtime call or artifact exists", () => {
  const chapters = deriveSessionMemory();

  assert.equal(chapters.length, 4);
  assert.equal(chapters[0].status, "active");
  assert.equal(chapters[0].summary, "The session is ready for context.");
  assert.equal(chapters[3].summary, "Generated work will appear here.");
  assert.equal(chapters.every((chapter) => chapter.artifactId === ""), true);
});
