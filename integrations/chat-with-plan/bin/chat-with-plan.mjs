#!/usr/bin/env node
// chat-with-plan: send the current plan to the local Codex-voice app and open
// a voice call pre-seeded with that plan as context.
//
// Node 18+ ESM, Node built-ins only (global fetch, node:child_process,
// node:fs, node:os, node:path, node:crypto).
//
// Commands:
//   setup --voice-dir <path> [--base-url <url>]
//   send  --plan-file <path> [--title <t>] [--repo <r>]

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_BASE_URL = "http://localhost:3000";
const CONFIG_DIR = path.join(os.homedir(), ".config", "chat-with-plan");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function configDirHint() {
  return CONFIG_PATH;
}

function setupCommandHint() {
  return "node ~/.claude/skills/chat-with-plan/bin/chat-with-plan.mjs setup --voice-dir <path-to-Codex-voice>";
}

// ---- tiny arg parser -------------------------------------------------------
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

// ---- config ----------------------------------------------------------------
function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}

// ---- .env token handling ---------------------------------------------------
function readEnvToken(voiceDir) {
  // process.env wins if present (lets a session override without editing .env)
  if (process.env.COOPER_INGEST_TOKEN) return process.env.COOPER_INGEST_TOKEN;
  const envPath = path.join(voiceDir, ".env");
  if (!fs.existsSync(envPath)) return "";
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key !== "COOPER_INGEST_TOKEN") continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    return val;
  }
  return "";
}

function ensureEnvToken(voiceDir) {
  const envPath = path.join(voiceDir, ".env");
  const existing = (() => {
    if (!fs.existsSync(envPath)) return "";
    const text = fs.readFileSync(envPath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("COOPER_INGEST_TOKEN=")) {
        return line.slice("COOPER_INGEST_TOKEN=".length).trim();
      }
    }
    return "";
  })();
  if (existing) return existing;

  const token = randomBytes(24).toString("hex");
  let prefix = "";
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    if (text.length && !text.endsWith("\n")) prefix = "\n";
  }
  fs.appendFileSync(envPath, `${prefix}COOPER_INGEST_TOKEN=${token}\n`, "utf8");
  return token;
}

// ---- health + dev server ---------------------------------------------------
async function checkHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => ({}));
    return body && body.ok === true;
  } catch {
    return false;
  }
}

function startDevServer(voiceDir) {
  const logPath = path.join(
    os.tmpdir(),
    `chat-with-plan-dev-${Date.now()}.log`,
  );
  const out = fs.openSync(logPath, "a");
  const err = fs.openSync(logPath, "a");
  const child = spawn("npm", ["run", "dev"], {
    cwd: voiceDir,
    detached: true,
    stdio: ["ignore", out, err],
  });
  child.unref();
  return logPath;
}

async function waitForHealth(baseUrl, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkHealth(baseUrl)) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

// ---- open browser ----------------------------------------------------------
function openBrowser(url) {
  let cmd;
  let args;
  if (process.platform === "darwin") {
    cmd = "open";
    args = [url];
  } else if (process.platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // non-fatal: URL is still printed for the user
  }
}

// ---- commands --------------------------------------------------------------
function cmdSetup(args) {
  const voiceDir = args["voice-dir"];
  if (!voiceDir || voiceDir === true) {
    fail(
      `Missing --voice-dir.\nUsage: ${setupCommandHint()} [--base-url <url>]`,
    );
  }
  const resolvedVoiceDir = path.resolve(voiceDir);
  if (!fs.existsSync(resolvedVoiceDir)) {
    fail(`Voice dir does not exist: ${resolvedVoiceDir}`);
  }

  const baseUrl =
    typeof args["base-url"] === "string" ? args["base-url"] : DEFAULT_BASE_URL;

  writeConfig({ voiceDir: resolvedVoiceDir, baseUrl });
  const token = ensureEnvToken(resolvedVoiceDir);

  console.log("chat-with-plan configured.");
  console.log(`  config:   ${configDirHint()}`);
  console.log(`  voiceDir: ${resolvedVoiceDir}`);
  console.log(`  baseUrl:  ${baseUrl}`);
  console.log(
    `  token:    COOPER_INGEST_TOKEN present in ${path.join(resolvedVoiceDir, ".env")} (…${token.slice(-6)})`,
  );
  console.log("\nYou can now run: /chat-with-plan after making a plan.");
}

async function cmdSend(args) {
  const cfg = readConfig();
  if (!cfg || !cfg.voiceDir) {
    fail(
      `chat-with-plan is not configured.\nRun:\n  ${setupCommandHint()}`,
    );
  }
  const voiceDir = cfg.voiceDir;
  const baseUrl = cfg.baseUrl || DEFAULT_BASE_URL;

  const planFile = args["plan-file"];
  if (!planFile || planFile === true) {
    fail("Missing --plan-file <path>.");
  }
  if (!fs.existsSync(planFile)) {
    fail(`Plan file not found: ${planFile}`);
  }
  const plan = fs.readFileSync(planFile, "utf8");
  if (!plan.trim()) {
    fail("Plan file is empty.");
  }

  const token = readEnvToken(voiceDir);
  if (!token) {
    fail(
      `No COOPER_INGEST_TOKEN found in ${path.join(voiceDir, ".env")} (or env).\nRe-run setup to generate one:\n  ${setupCommandHint()}`,
    );
  }

  // Health check; auto-start the dev server if down.
  let healthy = await checkHealth(baseUrl);
  if (!healthy) {
    console.error(`Codex-voice not responding at ${baseUrl}; starting dev server…`);
    const logPath = startDevServer(voiceDir);
    console.error(`  dev server log: ${logPath}`);
    healthy = await waitForHealth(baseUrl, 60000);
    if (!healthy) {
      fail(
        `Dev server did not become healthy within 60s.\nCheck the log above and that "npm run dev" works in ${voiceDir}.`,
      );
    }
  }

  const title = typeof args.title === "string" ? args.title : undefined;
  const repo = typeof args.repo === "string" ? args.repo : undefined;

  let res;
  try {
    res = await fetch(`${baseUrl}/api/ingest/plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        plan,
        title,
        repo,
        source: "claude-code/chat-with-plan",
      }),
    });
  } catch (e) {
    fail(`Failed to reach ${baseUrl}/api/ingest/plan: ${e.message}`);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body && body.error ? ` - ${body.error}` : "";
    } catch {
      detail = "";
    }
    fail(`Ingest failed (HTTP ${res.status})${detail}.`);
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    fail("Ingest succeeded but response was not JSON.");
  }
  if (!payload || !payload.url) {
    fail("Ingest response missing url.");
  }

  const fullUrl = `${baseUrl}${payload.url}`;
  console.log(fullUrl);
  openBrowser(fullUrl);
}

// ---- main ------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (command === "setup") {
    cmdSetup(args);
    return;
  }
  if (command === "send") {
    await cmdSend(args);
    return;
  }

  console.error("chat-with-plan");
  console.error("Usage:");
  console.error(`  ${setupCommandHint()} [--base-url <url>]`);
  console.error(
    "  node ~/.claude/skills/chat-with-plan/bin/chat-with-plan.mjs send --plan-file <path> [--title <t>] [--repo <r>]",
  );
  process.exit(command ? 1 : 0);
}

main().catch((e) => {
  fail(e && e.stack ? e.stack : String(e));
});
