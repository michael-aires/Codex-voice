import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import {
  CodexAppServerClient,
  codexApprovalFromServerRequest,
  codexApprovalResponse,
  codexTaskStatusFromThread,
  latestCodexAgentMessage
} from "../server/codexAppServerClient.js";

function fakeProcess(onWrite = () => {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      onWrite(String(chunk));
      callback();
    }
  });
  child.kill = () => { child.killed = true; };
  child.killed = false;
  return child;
}

test("Codex client handshakes and sends thread and turn requests over JSONL", async () => {
  const messages = [];
  const calls = [];
  const spawnProcess = (_command, args) => {
    calls.push(args);
    if (args.includes("start")) {
      const child = fakeProcess();
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    }
    const child = fakeProcess((chunk) => {
      for (const line of chunk.trim().split("\n")) {
        const message = JSON.parse(line);
        messages.push(message);
        if (message.method === "initialize") {
          queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: message.id, result: { userAgent: "test" } })}\n`));
        }
        if (message.method === "thread/start") {
          queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: message.id, result: { thread: { id: "thread-1" } } })}\n`));
        }
        if (message.method === "thread/name/set") {
          queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`));
        }
        if (message.method === "turn/start") {
          queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: message.id, result: { turn: { id: "turn-1" } } })}\n`));
        }
      }
    });
    return child;
  };

  const client = new CodexAppServerClient({ spawnProcess, startTimeoutMs: 500 });
  const thread = await client.startThread({ cwd: "/tmp/project", name: "Voice task" });
  const turn = await client.startTurn(thread.thread.id, "Implement the approved task.");

  assert.deepEqual(calls[0], ["app-server", "daemon", "start"]);
  assert.deepEqual(calls[1], ["app-server", "proxy"]);
  assert.equal(client.transportMode, "daemon-proxy");
  assert.equal(thread.thread.id, "thread-1");
  assert.equal(turn.turn.id, "turn-1");
  assert.ok(messages.some((message) => message.method === "initialized"));
  assert.deepEqual(messages.find((message) => message.method === "turn/start").params.input, [
    { type: "text", text: "Implement the approved task.", text_elements: [] }
  ]);
  client.close();
});

test("Codex approval mapper preserves the app-server request routing contract", () => {
  const approval = codexApprovalFromServerRequest({
    id: 42,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      command: "npm test",
      cwd: "/tmp/project",
      reason: "Run verification"
    }
  }, "2026-07-16T12:00:00.000Z");

  assert.equal(approval.runtimeRequestId, 42);
  assert.equal(approval.type, "codex_command");
  assert.match(approval.description, /npm test/);
  assert.deepEqual(codexApprovalResponse(approval), { decision: "accept" });

  const permissionApproval = codexApprovalFromServerRequest({
    id: 43,
    method: "item/permissions/requestApproval",
    params: { permissions: { network: { enabled: true } } }
  });
  assert.deepEqual(codexApprovalResponse(permissionApproval), {
    permissions: { network: { enabled: true } },
    scope: "turn"
  });
});

test("Codex thread reconciliation derives durable task status and final message", () => {
  const thread = {
    status: { type: "idle" },
    turns: [{
      status: "completed",
      items: [
        { type: "userMessage", content: [] },
        { type: "agentMessage", text: "Implemented and verified the change." }
      ]
    }]
  };

  assert.equal(codexTaskStatusFromThread(thread), "completed");
  assert.equal(latestCodexAgentMessage(thread), "Implemented and verified the change.");
  assert.equal(codexTaskStatusFromThread({ status: { type: "active" }, turns: [] }), "running");
  assert.equal(codexTaskStatusFromThread({ status: { type: "idle" }, turns: [{ status: "failed" }] }), "failed");
});
