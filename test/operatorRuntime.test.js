import test from "node:test";
import assert from "node:assert/strict";
import { operatorToolDefinitions, operatorToolNames } from "../cooperTools.js";
import {
  OPERATOR_PRESETS,
  createOperatorTask,
  hydrateOperatorTask,
  normalizeAllowedDomains,
  operatorProgress,
  operatorRuntimeInfo,
  operatorSkillSteps,
  operatorTaskPublic,
  riskForOperatorTask
} from "../server/operatorRuntime.js";

test("operator task uses SendGrid preset defaults and protected write risk", () => {
  const task = createOperatorTask({ skill: "sendgrid_sender_auth", goal: "Configure sender auth for aires.ai" }, "2026-07-02T12:00:00.000Z");

  assert.equal(task.status, "queued");
  assert.equal(task.riskLevel, "write");
  assert.equal(task.targetUrl, "https://app.sendgrid.com/");
  assert.deepEqual(task.allowedDomains, ["app.sendgrid.com", "sendgrid.com"]);
  assert.equal(task.budgets.maxSteps, 40);
  assert.ok(task.steps.length >= 4);
});

test("operator domain normalization accepts URLs, commas, arrays, and duplicates", () => {
  assert.deepEqual(
    normalizeAllowedDomains(["https://www.github.com/org/repo", "github.com", "app.sendgrid.com:443", "not a domain"]),
    ["github.com", "app.sendgrid.com"]
  );

  assert.deepEqual(normalizeAllowedDomains("https://linear.app/foo, notion.so/path"), ["linear.app", "notion.so"]);
});

test("operator risk classification defaults read-only for GitHub and write for unknown app work", () => {
  assert.equal(riskForOperatorTask({ skill: "github_repo_debug", targetUrl: "https://github.com/aires/repo" }), "read");
  assert.equal(riskForOperatorTask({ targetUrl: "https://app.example.com/admin" }), "write");
});

test("operator hydration and public shaping recover legacy tasks", () => {
  const hydrated = hydrateOperatorTask({
    id: "task-1",
    title: "Legacy task",
    status: "running",
    logs: []
  });
  const publicTask = operatorTaskPublic(hydrated);

  assert.equal(publicTask.id, "task-1");
  assert.equal(publicTask.title, "Legacy task");
  assert.equal(publicTask.progress, operatorProgress(hydrated));
  assert.ok(publicTask.logs.length);
  assert.ok(publicTask.steps.length);
});

test("operator runtime info is local-first and overridable", () => {
  const runtime = operatorRuntimeInfo({
    HOME: "/tmp/cooper-home",
    COOPER_OPERATOR_WORKSPACE: "/tmp/operator-workspace",
    COOPER_OPERATOR_ALLOWED_DOMAINS: "github.com,app.sendgrid.com",
    COOPER_OPERATOR_COMPUTER_USE: "true",
    COOPER_OPERATOR_COMPUTER_USE_BRIDGE: "http://127.0.0.1:3111",
    COOPER_OPERATOR_CODEX_APP_SERVER: "true",
    COOPER_OPERATOR_CODEX_MCP: "true",
    COOPER_OPERATOR_AGENTS_SDK: "true",
    COOPER_OPERATOR_SANDBOX_AGENTS: "true"
  });

  assert.equal(runtime.mode, "local");
  assert.equal(runtime.visibleBrowser, true);
  assert.equal(runtime.browserLaunchEnabled, true);
  assert.equal(runtime.codexWorkspace, "/tmp/operator-workspace");
  assert.equal(runtime.browserProfile, "/tmp/cooper-home/.cooper/profiles/operator");
  assert.deepEqual(runtime.defaultAllowedDomains, ["github.com", "app.sendgrid.com"]);
  assert.equal(runtime.openaiTools.computerUse, true);
  assert.equal(runtime.openaiTools.computerUseBridge, "http://127.0.0.1:3111");
  assert.equal(runtime.openaiTools.codexAppServer, true);
  assert.equal(runtime.openaiTools.codexMcp, true);
  assert.equal(runtime.openaiTools.agentsSdk, true);
  assert.equal(runtime.openaiTools.sandboxAgents, true);
});

test("operator runtime disables browser launch in production unless explicitly enabled", () => {
  assert.equal(operatorRuntimeInfo({ HOME: "/tmp/home", NODE_ENV: "production" }).browserLaunchEnabled, false);
  assert.equal(operatorRuntimeInfo({ HOME: "/tmp/home", NODE_ENV: "production", COOPER_OPERATOR_LAUNCH_BROWSER: "true" }).browserLaunchEnabled, true);
});

test("operator skill steps are deterministic for local planning", () => {
  assert.deepEqual(operatorSkillSteps("codex_local_planning"), [
    "Create or reuse the local operator workspace.",
    "Write the task brief and acceptance criteria for the Codex worker.",
    "Run the Codex planning pass within budget limits.",
    "Return the plan, risks, and next approvals."
  ]);
});

test("operator exposes OpenAI tool stack presets", () => {
  const ids = OPERATOR_PRESETS.map((preset) => preset.id);

  assert.ok(ids.includes("computer_use_browser"));
  assert.ok(ids.includes("computer_use_desktop"));
  assert.ok(ids.includes("codex_app_server"));
  assert.ok(ids.includes("codex_mcp_agent"));
  assert.ok(ids.includes("openai_tool_stack_plan"));

  assert.equal(riskForOperatorTask({ skill: "computer_use_browser" }), "write");
  assert.equal(riskForOperatorTask({ skill: "codex_app_server" }), "write");
  assert.equal(riskForOperatorTask({ skill: "openai_tool_stack_plan" }), "read");
});

test("Computer Use and Codex bridge steps describe supervised execution", () => {
  assert.match(operatorSkillSteps("computer_use_browser").join(" "), /screenshots/i);
  assert.match(operatorSkillSteps("computer_use_browser").join(" "), /allow-listed/i);
  assert.match(operatorSkillSteps("computer_use_desktop").join(" "), /OS permissions/i);
  assert.match(operatorSkillSteps("codex_app_server").join(" "), /JSONL CLI bridge/i);
  assert.match(operatorSkillSteps("codex_mcp_agent").join(" "), /MCP/i);
  assert.match(operatorSkillSteps("openai_tool_stack_plan").join(" "), /Realtime/i);
});

test("operator exposes richer build and document presets", () => {
  const ids = OPERATOR_PRESETS.map((preset) => preset.id);

  assert.ok(ids.includes("operator_document_suite"));
  assert.ok(ids.includes("aires_template_suite"));
  assert.ok(ids.includes("landing_page"));
  assert.ok(ids.includes("mini_app"));
  assert.ok(ids.includes("large_report"));

  const suite = OPERATOR_PRESETS.find((preset) => preset.id === "operator_document_suite");
  assert.deepEqual(suite.artifactKinds, [
    "product_requirements",
    "execution_plan",
    "aires_requirements",
    "mermaid_diagram",
    "ui_wireframe",
    "html_prototype"
  ]);
});

test("operator task preserves linked Cooper work jobs and artifact kinds", () => {
  const task = createOperatorTask({
    skill: "landing_page",
    goal: "Create a landing page for Cooper Operator",
    jobIds: ["job-1"],
    relatedCallId: "call-1"
  }, "2026-07-02T12:00:00.000Z");
  const publicTask = operatorTaskPublic(task);

  assert.deepEqual(publicTask.artifactKinds, ["landing_page"]);
  assert.equal(publicTask.relatedCallId, "call-1");
  assert.deepEqual(publicTask.jobIds, ["job-1"]);
});

test("Codex tasks persist the durable app-server routing state", () => {
  const task = createOperatorTask({
    skill: "codex_app_server",
    goal: "Implement the approved voice task",
    workspacePath: "/tmp/cooper-project",
    codexModel: "gpt-5"
  }, "2026-07-16T12:00:00.000Z");
  const recovered = hydrateOperatorTask({
    ...task,
    runtime: {
      ...task.runtime,
      transportMode: "detached-socket",
      connectionStatus: "reconnecting",
      threadId: "thread-1",
      turnId: "turn-1",
      lastReconciledAt: "2026-07-16T12:01:00.000Z"
    }
  });

  assert.equal(recovered.workspacePath, "/tmp/cooper-project");
  assert.equal(recovered.codexModel, "gpt-5");
  assert.equal(recovered.runtime.adapter, "codex_app_server");
  assert.equal(recovered.runtime.transportMode, "detached-socket");
  assert.equal(recovered.runtime.connectionStatus, "reconnecting");
  assert.equal(recovered.runtime.threadId, "thread-1");
  assert.equal(recovered.runtime.turnId, "turn-1");
});

test("Cooper Operator exposes a status query tool for delegated work", () => {
  const tool = operatorToolDefinitions.find((definition) => definition.name === "get_operator_task_status");

  assert.ok(operatorToolNames.has("get_operator_task_status"));
  assert.ok(tool, "status tool should be available to Realtime Cooper Operator");
  assert.match(tool.description, /what happened/i);
  assert.equal(tool.parameters.properties.task_id.type, "string");
  assert.equal(tool.parameters.properties.include_logs.type, "boolean");
  assert.equal(tool.parameters.properties.include_artifacts.type, "boolean");

  const startTool = operatorToolDefinitions.find((definition) => definition.name === "start_operator_task");
  assert.ok(startTool.parameters.properties.skill.enum.includes("mini_app"));
  assert.ok(startTool.parameters.properties.skill.enum.includes("aires_template_suite"));
  assert.ok(startTool.parameters.properties.skill.enum.includes("computer_use_browser"));
  assert.ok(startTool.parameters.properties.skill.enum.includes("computer_use_desktop"));
  assert.ok(startTool.parameters.properties.skill.enum.includes("codex_app_server"));
  assert.ok(startTool.parameters.properties.skill.enum.includes("codex_mcp_agent"));
  assert.ok(startTool.parameters.properties.skill.enum.includes("openai_tool_stack_plan"));
  assert.equal(startTool.parameters.properties.artifact_kinds.type, "array");
});
