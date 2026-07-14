import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [mainSource, serverSource, stylesSource, envSource] = await Promise.all([
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../src/session-os.css", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8")
]);

test("server persists and refreshes Daily Catch Up on startup, schedule, and demand", () => {
  assert.match(serverSource, /app\.get\("\/api\/daily-brief"/);
  assert.match(serverSource, /app\.post\("\/api\/daily-brief\/refresh"/);
  assert.match(serverSource, /refreshDailyBrief\(\{ trigger: "startup", force: true \}\)/);
  assert.match(serverSource, /refreshDailyBrief\(\{ trigger: "scheduled", force: true \}\)/);
  assert.match(serverSource, /db\.dailyBriefs/);
  assert.match(envSource, /COOPER_DAILY_BRIEF_HOUR=7/);
  assert.match(envSource, /COOPER_DAILY_BRIEF_ASSIGNEES=/);
});

test("Today exposes a refreshable briefing deck and hands it to Cooper after Realtime is online", () => {
  assert.match(mainSource, /function DailyBriefDialog/);
  assert.match(mainSource, /function DailyBriefDeck/);
  assert.match(mainSource, /Present with Cooper/);
  assert.match(mainSource, /pendingSessionOpeningPromptRef/);
  assert.match(mainSource, /event\.type === "session\.updated"/);
  assert.match(mainSource, /requestCooper\(openingPrompt, "session_presentation"\)/);
  assert.match(mainSource, /dailyBriefSlideIndexFromTranscript/);
  assert.doesNotMatch(mainSource, /}, 9000\)/);
  assert.match(mainSource, /sessionFocus\?\.type === "daily_brief"/);
  assert.match(mainSource, /React\.useState\("presentation"\)/);
});

test("Daily Catch Up presentation is responsive and supports an embedded call canvas", () => {
  assert.match(stylesSource, /\.daily-brief-dialog-backdrop/);
  assert.match(stylesSource, /\.daily-brief-slide/);
  assert.match(stylesSource, /\.daily-brief-deck\.embedded/);
  assert.match(stylesSource, /height:\s*100dvh/);
});
