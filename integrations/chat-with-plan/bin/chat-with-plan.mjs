#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_BASE_URL = "http://localhost:5000";
const CONFIG_DIR = path.join(os.homedir(), ".config", "chat-with-plan");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function parseArgs(values) {
  const args = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function readEnvToken(voiceDir) {
  if (process.env.COOPER_INGEST_TOKEN) return process.env.COOPER_INGEST_TOKEN;
  const envPath = path.join(voiceDir, ".env");
  if (!fs.existsSync(envPath)) return "";
  const line = fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith("COOPER_INGEST_TOKEN="));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "") : "";
}

function ensureEnvToken(voiceDir) {
  const existing = readEnvToken(voiceDir);
  if (existing) return existing;
  const envPath = path.join(voiceDir, ".env");
  const token = randomBytes(32).toString("hex");
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(envPath, `${prefix}COOPER_INGEST_TOKEN=${token}\n`, { mode: 0o600 });
  return token;
}

async function isHealthy(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer(config) {
  if (await isHealthy(config.baseUrl)) return;
  const logPath = path.join(os.tmpdir(), `chat-with-plan-${Date.now()}.log`);
  const output = fs.openSync(logPath, "a");
  const child = spawn("npm", ["run", "dev"], {
    cwd: config.voiceDir,
    detached: true,
    stdio: ["ignore", output, output]
  });
  child.unref();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    if (await isHealthy(config.baseUrl)) return;
  }
  fail(`Cooper did not become ready. Inspect ${logPath}`);
}

function runDetached(command, args) {
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function openDestinations(payload, baseUrl, target) {
  const web = new URL(payload.webUrl || payload.url, baseUrl).toString();
  const app = payload.appUrl;
  if ((target === "ios" || target === "both") && process.platform === "darwin" && app) {
    runDetached("xcrun", ["simctl", "openurl", "booted", app]);
  }
  if (target === "web" || target === "both") {
    if (process.platform === "darwin") runDetached("open", [web]);
    else if (process.platform === "win32") runDetached("cmd", ["/c", "start", "", web]);
    else runDetached("xdg-open", [web]);
  }
  return web;
}

async function setup(args) {
  const voiceDir = typeof args["voice-dir"] === "string" ? path.resolve(args["voice-dir"]) : "";
  if (!voiceDir || !fs.existsSync(path.join(voiceDir, "package.json"))) {
    fail("Provide --voice-dir pointing to the Codex-voice checkout.");
  }
  const baseUrl = typeof args["base-url"] === "string" ? args["base-url"] : DEFAULT_BASE_URL;
  ensureEnvToken(voiceDir);
  writeConfig({ voiceDir, baseUrl });
  console.log(`chat-with-plan configured for ${baseUrl}`);
}

async function send(args) {
  const config = readConfig();
  if (!config?.voiceDir) {
    fail("chat-with-plan is not configured. Run setup --voice-dir <path-to-Codex-voice>.");
  }
  const planFile = typeof args["plan-file"] === "string" ? path.resolve(args["plan-file"]) : "";
  if (!planFile || !fs.existsSync(planFile)) fail("Provide an existing --plan-file.");
  const plan = fs.readFileSync(planFile, "utf8");
  if (!plan.trim()) fail("The plan file is empty.");
  const token = readEnvToken(config.voiceDir);
  if (!token) fail("COOPER_INGEST_TOKEN is missing. Run setup again.");
  const target = ["web", "ios", "both"].includes(args.target) ? args.target : "web";

  await ensureServer(config);
  const response = await fetch(`${config.baseUrl}/api/ingest/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      plan,
      title: typeof args.title === "string" ? args.title : "",
      repo: typeof args.repo === "string" ? args.repo : "",
      source: "claude-code/chat-with-plan"
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) fail(payload.error || `Plan ingest failed with HTTP ${response.status}.`);
  const web = openDestinations(payload, config.baseUrl, target);
  console.log(web);
  if (payload.appUrl) console.log(payload.appUrl);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
if (command === "setup") await setup(args);
else if (command === "send") await send(args);
else fail("Usage: chat-with-plan.mjs setup|send [options]");
