import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [mainSource, serverSource, stylesSource, envSource] = await Promise.all([
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../src/session-os.css", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8")
]);

test("Today has a cached server aggregation route backed by read-only Arcade tools", () => {
  assert.match(serverSource, /app\.get\("\/api\/today"/);
  assert.match(serverSource, /GoogleCalendar\.ListEvents/);
  assert.match(serverSource, /NotionToolkit\.GetObjectMetadata/);
  assert.match(serverSource, /getTodayRemoteSources\(\{ force:/);
  assert.match(serverSource, /todayRemoteCache/);
  assert.match(envSource, /COOPER_NOTION_SPRINT_ANCHOR_PAGE_ID=/);
  assert.match(envSource, /COOPER_NOTION_SPRINT_DATABASE_ID=/);
});
test("Today renders live Calendar, Sprint Board, project, and session collections", () => {
  const homeView = mainSource.slice(mainSource.indexOf("function HomeView"), mainSource.indexOf("function TodaySection"));
  for (const signal of [
    "feed.meetings",
    "feed.tasks",
    "feed.projects",
    "feed.sessions",
    '["projects", "Projects"]',
    '["sessions", "Past sessions"]',
    "refreshTodayFeed({ force: true })"
  ]) {
    assert.match(mainSource, new RegExp(signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(homeView, /todayMeetings|todayTasks/);
});

test("Today keeps provider errors visible and its expanded tabs mobile-safe", () => {
  assert.match(mainSource, /function TodaySourceStatus/);
  assert.match(mainSource, /configuration_required/);
  assert.match(stylesSource, /\.today-filter-tabs[\s\S]*overflow-x:\s*auto/);
  assert.match(stylesSource, /\.today-sync-status\.error/);
  assert.match(stylesSource, /\.today-row\.resource/);
});
