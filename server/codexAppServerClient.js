import { EventEmitter } from "node:events";
import { execFileSync, spawn as nodeSpawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import net from "node:net";
import readline from "node:readline";
import WebSocket from "ws";

const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_START_TIMEOUT_MS = 20_000;

export class CodexAppServerClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.spawnProcess = options.spawnProcess || nodeSpawn;
    this.command = options.command || process.env.COOPER_CODEX_COMMAND || "codex";
    this.cwd = options.cwd || process.cwd();
    this.env = options.env || process.env;
    this.preferDaemon = options.preferDaemon !== false;
    this.socketPath = options.socketPath || process.env.COOPER_CODEX_SOCKET || join(homedir(), ".cooper", "codex-app-server.sock");
    this.pidPath = options.pidPath || `${this.socketPath}.pid`;
    this.WebSocketImpl = options.WebSocketImpl || WebSocket;
    this.requestTimeoutMs = Number(options.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS);
    this.startTimeoutMs = Number(options.startTimeoutMs || DEFAULT_START_TIMEOUT_MS);
    this.process = null;
    this.websocket = null;
    this.reader = null;
    this.pending = new Map();
    this.nextRequestId = 1;
    this.connectPromise = null;
    this.connected = false;
    this.transportMode = "disconnected";
    this.lastError = "";
  }

  async connect() {
    if (this.connected && (this.process || this.websocket)) return this;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.#connect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async #connect() {
    let daemonError = null;
    if (this.preferDaemon) {
      try {
        await this.#runToCompletion(["app-server", "daemon", "start"]);
        await this.#openTransport(["app-server", "proxy"], "daemon-proxy");
        return this;
      } catch (error) {
        daemonError = error;
        this.emit("warning", {
          message: `Codex daemon transport was unavailable; trying the persistent Unix socket transport. ${error.message}`
        });
      }
    }

    try {
      await this.#connectPersistentSocket();
      return this;
    } catch (error) {
      const prefix = daemonError ? `${daemonError.message}; ` : "";
      daemonError = new Error(`${prefix}persistent socket: ${error.message}`);
      this.emit("warning", {
        message: `Codex persistent socket transport was unavailable; using a direct app-server process. ${error.message}`
      });
    }

    try {
      await this.#openTransport(["app-server"], "direct-stdio");
      return this;
    } catch (error) {
      const detail = daemonError
        ? `Daemon: ${daemonError.message}; direct: ${error.message}`
        : error.message;
      this.lastError = detail;
      throw new Error(`Unable to connect to Codex app-server. ${detail}`);
    }
  }

  async #openTransport(args, mode) {
    this.#closeTransport();
    const child = this.spawnProcess(this.command, args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.process = child;
    this.transportMode = mode;
    this.reader = readline.createInterface({ input: child.stdout });
    this.reader.on("line", (line) => this.#handleLine(line));
    child.stderr?.on("data", (chunk) => {
      const message = String(chunk || "").trim();
      if (message) this.emit("stderr", { message, mode });
    });
    child.on("error", (error) => this.#handleTransportFailure(error));
    child.on("exit", (code, signal) => {
      if (this.process !== child) return;
      const exitReason = signal || (code ?? "unknown");
      this.#handleTransportFailure(new Error(`Codex ${mode} exited (${exitReason}).`));
    });

    try {
      await this.request("initialize", {
        clientInfo: {
          name: "cooper_voice",
          title: "Cooper Voice",
          version: "0.1.0"
        },
        capabilities: null
      }, { allowBeforeConnected: true, timeoutMs: this.startTimeoutMs });
      this.notify("initialized", {});
      this.connected = true;
      this.lastError = "";
      this.emit("connected", { mode });
    } catch (error) {
      this.#closeTransport();
      throw error;
    }
  }

  async #connectPersistentSocket() {
    if (existsSync(this.socketPath)) {
      try {
        await this.#openSocketTransport();
        return;
      } catch {
        this.#terminateOwnedSocketProcess();
        try {
          unlinkSync(this.socketPath);
        } catch {}
      }
    }

    this.#terminateOwnedSocketProcess();
    mkdirSync(dirname(this.socketPath), { recursive: true });
    const server = this.spawnProcess(this.command, ["app-server", "--listen", `unix://${this.socketPath}`], {
      cwd: this.cwd,
      env: this.env,
      detached: true,
      stdio: "ignore"
    });
    let spawnError = null;
    server.on?.("error", (error) => { spawnError = error; });
    server.unref?.();
    if (Number.isInteger(server.pid) && server.pid > 1) {
      try {
        writeFileSync(this.pidPath, `${server.pid}\n`, { mode: 0o600 });
      } catch {}
    }

    const startedAt = Date.now();
    while (!existsSync(this.socketPath)) {
      if (spawnError) throw spawnError;
      if (Date.now() - startedAt >= this.startTimeoutMs) {
        throw new Error(`Timed out waiting for ${this.socketPath}.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await this.#openSocketTransport();
  }

  #terminateOwnedSocketProcess() {
    if (!existsSync(this.pidPath)) return;
    try {
      const pid = Number(readFileSync(this.pidPath, "utf8").trim());
      if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return;
      const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
        encoding: "utf8",
        timeout: 1000
      }).trim();
      if (command.includes("codex app-server") && command.includes(`unix://${this.socketPath}`)) {
        process.kill(pid, "SIGTERM");
      }
    } catch {
      // The recorded process is already gone or is not inspectable.
    } finally {
      try {
        unlinkSync(this.pidPath);
      } catch {}
    }
  }

  async #openSocketTransport() {
    this.#closeTransport();
    const websocket = new this.WebSocketImpl("ws://localhost/", {
      maxPayload: 32 * 1024 * 1024,
      perMessageDeflate: false,
      createConnection: () => net.createConnection(this.socketPath)
    });
    this.websocket = websocket;
    this.transportMode = "detached-socket";

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out connecting to ${this.socketPath}.`)), this.startTimeoutMs);
      timeout.unref?.();
      const onOpen = () => {
        clearTimeout(timeout);
        websocket.off?.("error", onError);
        resolve();
      };
      const onError = (error) => {
        clearTimeout(timeout);
        websocket.off?.("open", onOpen);
        reject(error);
      };
      websocket.once("open", onOpen);
      websocket.once("error", onError);
    });

    websocket.on("message", (data) => this.#handleLine(String(data)));
    websocket.on("error", (error) => {
      if (this.websocket === websocket) this.#handleTransportFailure(error);
    });
    websocket.on("close", (code, reason) => {
      if (this.websocket !== websocket) return;
      this.#handleTransportFailure(new Error(`Codex detached socket closed (${code}: ${String(reason || "")}).`));
    });

    try {
      await this.request("initialize", {
        clientInfo: {
          name: "cooper_voice",
          title: "Cooper Voice",
          version: "0.1.0"
        },
        capabilities: null
      }, { allowBeforeConnected: true, timeoutMs: this.startTimeoutMs });
      this.notify("initialized", {});
      this.connected = true;
      this.lastError = "";
      this.emit("connected", { mode: this.transportMode });
    } catch (error) {
      this.#closeTransport();
      throw error;
    }
  }

  request(method, params = {}, options = {}) {
    if ((!this.process && !this.websocket) || (!this.connected && !options.allowBeforeConnected)) {
      return Promise.reject(new Error("Codex app-server is not connected."));
    }

    const id = this.nextRequestId++;
    const timeoutMs = Number(options.timeoutMs || this.requestTimeoutMs);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      timeout.unref?.();
      this.pending.set(id, { method, resolve, reject, timeout });
      try {
        this.#write({ method, id, params });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method, params = {}) {
    this.#write({ method, params });
  }

  respond(id, result) {
    this.#write({ id, result });
  }

  respondError(id, error) {
    this.#write({
      id,
      error: {
        code: Number(error?.code || -32000),
        message: String(error?.message || error || "Request rejected")
      }
    });
  }

  async startThread({ cwd, name, model } = {}) {
    await this.connect();
    const response = await this.request("thread/start", {
      cwd: cwd || this.cwd,
      ...(model ? { model } : {}),
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandbox: "workspace-write",
      ephemeral: false
    });
    const threadId = response?.thread?.id;
    if (threadId && name) {
      await this.request("thread/name/set", { threadId, name }).catch(() => {});
    }
    return response;
  }

  async resumeThread(threadId, { includeTurns = true } = {}) {
    await this.connect();
    return this.request("thread/resume", {
      threadId,
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandbox: "workspace-write",
      excludeTurns: !includeTurns
    });
  }

  async readThread(threadId, { includeTurns = true } = {}) {
    await this.connect();
    return this.request("thread/read", { threadId, includeTurns });
  }

  async startTurn(threadId, prompt, options = {}) {
    await this.connect();
    return this.request("turn/start", {
      threadId,
      input: [{ type: "text", text: String(prompt || ""), text_elements: [] }],
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.model ? { model: options.model } : {})
    });
  }

  async steerTurn(threadId, prompt) {
    await this.connect();
    return this.request("turn/steer", {
      threadId,
      input: [{ type: "text", text: String(prompt || ""), text_elements: [] }]
    });
  }

  async interruptTurn(threadId, turnId) {
    await this.connect();
    return this.request("turn/interrupt", { threadId, turnId });
  }

  close() {
    this.#closeTransport();
  }

  #write(message) {
    const payload = JSON.stringify(message);
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(`${payload}\n`);
      return;
    }
    if (this.websocket?.readyState === this.WebSocketImpl.OPEN) {
      this.websocket.send(payload);
      return;
    }
    throw new Error("Codex app-server transport is closed.");
  }

  #handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.emit("warning", { message: `Ignored malformed Codex message: ${String(line).slice(0, 240)}` });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(message, "id") && (message.result !== undefined || message.error)) {
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(message.id);
        if (message.error) {
          const error = new Error(message.error.message || `Codex request failed: ${pending.method}`);
          error.code = message.error.code;
          error.data = message.error.data;
          pending.reject(error);
        } else {
          pending.resolve(message.result);
        }
        return;
      }
    }

    if (Object.prototype.hasOwnProperty.call(message, "id") && message.method) {
      this.emit("request", message);
      return;
    }
    if (message.method) this.emit("notification", message);
    this.emit("message", message);
  }

  #handleTransportFailure(error) {
    if (!this.process && !this.websocket) return;
    this.lastError = error.message || String(error);
    this.#closeTransport(error);
    this.emit("disconnected", { error: this.lastError, mode: this.transportMode });
  }

  #closeTransport(error = new Error("Codex app-server transport closed.")) {
    const child = this.process;
    const websocket = this.websocket;
    this.process = null;
    this.websocket = null;
    this.connected = false;
    this.reader?.close();
    this.reader = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    if (child && !child.killed) child.kill();
    if (websocket && websocket.readyState < this.WebSocketImpl.CLOSING) websocket.close();
    if (!child && !websocket) this.transportMode = "disconnected";
  }

  #runToCompletion(args) {
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(this.command, args, {
        cwd: this.cwd,
        env: this.env,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Timed out running ${this.command} ${args.join(" ")}.`));
      }, this.startTimeoutMs);
      timeout.unref?.();
      child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("exit", (code, signal) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
          return;
        }
        reject(new Error((stderr || stdout || `${signal || code}`).trim()));
      });
    });
  }
}

export function codexApprovalFromServerRequest(message, at = new Date().toISOString()) {
  const method = String(message?.method || "");
  const params = message?.params || {};
  const command = String(params.command || "").trim();
  const reason = String(params.reason || "").trim();
  const cwd = String(params.cwd || "").trim();
  const common = {
    runtimeRequestId: message?.id,
    runtimeMethod: method,
    runtimePayload: params,
    requestedAt: at
  };

  if (method === "item/commandExecution/requestApproval") {
    return {
      ...common,
      type: "codex_command",
      title: "Codex command approval",
      description: [reason, command && `Command: ${command}`, cwd && `Workspace: ${cwd}`].filter(Boolean).join(" · ") || "Codex is asking to run a protected command."
    };
  }
  if (method === "item/fileChange/requestApproval") {
    return {
      ...common,
      type: "codex_file_change",
      title: "Codex file change approval",
      description: reason || (params.grantRoot ? `Allow writes under ${params.grantRoot}.` : "Codex is asking to apply a protected file change.")
    };
  }
  if (method === "item/permissions/requestApproval") {
    return {
      ...common,
      type: "codex_permissions",
      title: "Codex permission approval",
      description: reason || `Codex is asking for additional permissions in ${cwd || "the current workspace"}.`
    };
  }
  return null;
}

export function codexApprovalResponse(approval) {
  if (approval?.runtimeMethod === "item/permissions/requestApproval") {
    return {
      permissions: approval.runtimePayload?.permissions || {},
      scope: "turn"
    };
  }
  return { decision: "accept" };
}

export function codexTaskStatusFromThread(thread) {
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  const lastTurn = turns[turns.length - 1] || null;
  const threadStatus = thread?.status?.type;
  if (lastTurn?.status === "failed" || threadStatus === "systemError") return "failed";
  if (lastTurn?.status === "interrupted") return "cancelled";
  if (lastTurn?.status === "completed") return "completed";
  if (lastTurn?.status === "inProgress" || threadStatus === "active") return "running";
  return "running";
}

export function latestCodexAgentMessage(thread) {
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const items = Array.isArray(turns[turnIndex]?.items) ? turns[turnIndex].items : [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      if (items[itemIndex]?.type === "agentMessage" && items[itemIndex].text) return items[itemIndex].text;
    }
  }
  return "";
}
