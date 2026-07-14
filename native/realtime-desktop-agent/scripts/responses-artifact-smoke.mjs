import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const serverPath = join(appRoot, "Resources", "Broker", "server.mjs");
const service = process.env.REALTIME_AGENT_KEYCHAIN_SERVICE || "RealtimeDesktopAgent.OPENAI_API_KEY";
const account = process.env.REALTIME_AGENT_KEYCHAIN_ACCOUNT || userInfo().username;
const apiKey = await loadOpenAIKey();
const dataRoot = await mkdtemp(join(tmpdir(), "rda-responses-smoke-"));

let broker;
try {
  if (!apiKey) {
    console.log("native responses artifact live smoke skipped: missing OPENAI_API_KEY or Keychain item");
    process.exitCode = 0;
  } else {
    const ready = await startBroker();
    const base = ready.url.replace(/\/$/, "");

    const health = await getJson(base, "/health");
    assert(health.hasApiKey === true, "broker sees OpenAI key");
    assert(typeof health.artifactModel === "string" && health.artifactModel.length > 0, "broker reports artifact model");

    const generated = await postJson(base, "/api/artifacts/generate", {
      kind: "markdown",
      title: "Responses live smoke artifact",
      context: {
        subject: "Responses live smoke",
        facts: ["The native broker must return a durable markdown artifact body."]
      },
      customPrompt: "Return exactly two short markdown bullets. Do not include secrets."
    });

    assert(generated.ok === true, "Responses artifact generation ok");
    assert(generated.provider === "openai_responses", "Responses provider reported");
    assert(generated.outputType === "markdown", "Markdown output type reported");
    assert(typeof generated.content === "string" && generated.content.trim().length > 0, "Generated artifact content returned");
    assert(typeof generated.requestId === "string" && generated.requestId.length > 0, "Responses request id returned");
    assert(!JSON.stringify(generated).includes("sk-"), "Responses artifact payload does not expose API keys");

    console.log(`native responses artifact live smoke passed using ${generated.model || health.artifactModel}`);
  }
} finally {
  if (broker) {
    broker.kill("SIGINT");
  }
  await rm(dataRoot, { recursive: true, force: true });
}

async function loadOpenAIKey() {
  const envKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (envKey) {
    return envKey;
  }
  try {
    const result = await execFileAsync("/usr/bin/security", [
      "find-generic-password",
      "-a", account,
      "-s", service,
      "-w"
    ]);
    return String(result.stdout || "").trim();
  } catch {}
  try {
    const result = await execFileAsync("/usr/bin/security", [
      "find-generic-password",
      "-s", service,
      "-w"
    ]);
    return String(result.stdout || "").trim();
  } catch {}
  return "";
}

function startBroker() {
  return new Promise((resolveReady, rejectReady) => {
    broker = spawn(process.execPath, [serverPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: "0",
        REALTIME_AGENT_DATA_DIR: dataRoot,
        APPROVED_WORKSPACE: repoRoot,
        OPENAI_API_KEY: apiKey
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        rejectReady(new Error("Broker did not become ready."));
      }
    }, 8000);

    broker.stdout.on("data", (chunk) => {
      for (const line of String(chunk).trim().split(/\n+/)) {
        try {
          const payload = JSON.parse(line);
          if (payload.type === "ready" && payload.url && !settled) {
            settled = true;
            clearTimeout(timer);
            resolveReady(payload);
          }
        } catch {
          // Ignore non-JSON broker logs.
        }
      }
    });

    broker.stderr.on("data", (chunk) => {
      process.stderr.write(redact(String(chunk)));
    });

    broker.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        rejectReady(new Error(`Broker exited before ready: ${code}`));
      }
    });
  });
}

async function getJson(base, path, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`);
  assert(response.status === expectedStatus, `${path} returned ${expectedStatus}`);
  return response.json();
}

async function postJson(base, path, body, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.status === expectedStatus, `${path} returned ${expectedStatus}: ${redact(payload.error || "")}`);
  return payload;
}

function redact(value) {
  return String(value || "").replace(/sk-[A-Za-z0-9_\-]{12,}/g, "[redacted-openai-key]");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Responses artifact smoke assertion failed: ${message}`);
  }
}
