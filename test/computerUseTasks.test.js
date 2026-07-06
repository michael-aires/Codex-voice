import test from "node:test";
import assert from "node:assert/strict";
import { computerUseToolDefinitions, computerUseToolNames } from "../cooperTools.js";
import {
  buildComputerUseTaskInput,
  isComputerUseTask,
  mapComputerUseModeToSkill
} from "../src/computerUseTasks.js";
import { createOperatorTask, operatorTaskPublic } from "../server/operatorRuntime.js";

test("computer use modes map to supervised operator skills", () => {
  assert.equal(mapComputerUseModeToSkill("desktop_app"), "computer_use_desktop");
  assert.equal(mapComputerUseModeToSkill("browser"), "computer_use_browser");
  assert.equal(mapComputerUseModeToSkill("open_url"), "computer_use_browser");
  assert.equal(mapComputerUseModeToSkill("download"), "computer_use_browser");
  assert.equal(mapComputerUseModeToSkill("codex_bridge"), "codex_app_server");
  assert.equal(mapComputerUseModeToSkill("", "https://claude.ai/"), "computer_use_browser");
});

test("computer use task input preserves voice command intent", () => {
  const input = buildComputerUseTaskInput({
    mode: "desktop_app",
    goal: "Open Spotify and wait for the next instruction.",
    app_name: "Spotify",
    allowed_domains: "spotify.com, open.spotify.com",
    requested_by: "voice"
  });

  assert.equal(input.skill, "computer_use_desktop");
  assert.equal(input.title, "Computer Use: Spotify");
  assert.match(input.goal, /Open Spotify/);
  assert.match(input.goal, /Pause for approval/);
  assert.deepEqual(input.allowedDomains, ["spotify.com", "open.spotify.com"]);
  assert.deepEqual(input.computerIntent, {
    mode: "desktop_app",
    appName: "Spotify",
    target: "",
    targetUrl: "",
    requestedBy: "voice"
  });
});

test("computer use tool definitions expose start, stop, cancel, and status commands", () => {
  assert.ok(computerUseToolNames.has("start_computer_use_task"));
  assert.ok(computerUseToolNames.has("stop_computer_use_tasks"));
  assert.ok(computerUseToolNames.has("cancel_computer_use_task"));
  assert.ok(computerUseToolNames.has("get_computer_use_status"));

  const startTool = computerUseToolDefinitions.find((tool) => tool.name === "start_computer_use_task");
  assert.ok(startTool);
  assert.deepEqual(startTool.parameters.required, ["mode", "goal"]);
  assert.ok(startTool.parameters.properties.mode.enum.includes("desktop_app"));
  assert.ok(startTool.parameters.properties.mode.enum.includes("codex_bridge"));
});

test("operator task persists computer use intent for status and desktop launch", () => {
  const input = buildComputerUseTaskInput({
    mode: "open_url",
    goal: "Open the Westward project page.",
    target_url: "https://app.example.com/projects/westward",
    requested_by: "manual_form"
  });
  const task = createOperatorTask(input, "2026-07-03T12:00:00.000Z");
  const publicTask = operatorTaskPublic(task);

  assert.equal(isComputerUseTask(task), true);
  assert.equal(task.skill, "computer_use_browser");
  assert.equal(task.targetUrl, "https://app.example.com/projects/westward");
  assert.equal(task.computerIntent.mode, "open_url");
  assert.equal(task.computerIntent.targetUrl, "https://app.example.com/projects/westward");
  assert.equal(publicTask.computerIntent.requestedBy, "manual_form");
});
