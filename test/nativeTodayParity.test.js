import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [models, shell, today, projects] = await Promise.all([
  readFile(new URL("../native/ios-app/CooperMobile/Models.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/AppShellView.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/TodayView.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/ProjectsView.swift", import.meta.url), "utf8")
]);

test("native Today preserves Calendar conference metadata and honest handoff actions", () => {
  assert.match(models, /var conference = TodayConference\(\)/);
  assert.match(models, /var joinURL: URL\?/);
  assert.match(today, /Label\(meeting\.conference\.joinLabel, systemImage: "video"\)/);
  assert.match(today, /Button\("Start with Cooper"/);
  assert.match(today, /Label\("Open in Notion", systemImage: "arrow\.up\.right"\)/);
});

test("native Today exposes projects and resumable sessions through typed destinations", () => {
  assert.match(today, /private var projectsSection/);
  assert.match(today, /model\.open\(\.project\(project\.targetId\)\)/);
  assert.match(today, /model\.open\(\.session\(session\.targetId\)\)/);
  assert.match(today, /model\.presentVoiceSession\(resuming: saved\)/);
  assert.match(shell, /case \.project\(let id\):/);
  assert.match(shell, /projectPath\.append\(project\)/);
  assert.match(projects, /NavigationLink\(value: project\)/);
});
