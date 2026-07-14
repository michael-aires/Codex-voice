import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const serverPath = join(appRoot, "Resources", "Broker", "server.mjs");
const service = `RealtimeDesktopAgent.KeychainSmoke.${process.pid}.${Date.now()}`;
const account = `keychain-smoke-${process.pid}`;
const dataRoot = await mkdtemp(join(tmpdir(), "rda-keychain-smoke-"));

let broker;
try {
  const ready = await startBroker();
  const base = ready.url.replace(/\/$/, "");

  const first = await postJson(base, "/api/settings/openai-key", {
    action: "save",
    apiKey: ["sk", "keychain", "smoke", "first"].join("-")
  });
  assert(first.ok === true && first.hasApiKey === true, "first key save accepted");
  assert(first.keychain?.ok === true, "first key save reached Keychain");

  const second = await postJson(base, "/api/settings/openai-key", {
    action: "save",
    apiKey: ["sk", "keychain", "smoke", "second"].join("-")
  });
  assert(second.ok === true && second.keychain?.ok === true, "key update reached Keychain");

  const settings = await getJson(base, "/api/settings");
  assert(settings.runtime?.hasApiKey === true, "settings reports key present");
  assert(settings.runtime?.keychainService === service, "settings reports temp Keychain service");
  assert(!JSON.stringify(settings).includes("keychain-smoke-second"), "settings does not expose key value");

  const deleted = await postJson(base, "/api/settings/openai-key", { action: "delete" });
  assert(deleted.ok === true && deleted.hasApiKey === false, "key delete accepted");
  assert(deleted.keychain?.ok === true, "key delete reached Keychain");

  const afterDelete = await getJson(base, "/api/settings");
  assert(afterDelete.runtime?.hasApiKey === false, "settings reports key absent after delete");

  console.log("native keychain smoke passed");
} finally {
  if (broker) {
    broker.kill("SIGINT");
  }
  await execFileAsync("/usr/bin/security", [
    "delete-generic-password",
    "-a", account,
    "-s", service
  ]).catch(() => {});
  await rm(dataRoot, { recursive: true, force: true });
}

function startBroker() {
  return new Promise((resolveReady, rejectReady) => {
    broker = spawn(process.execPath, [serverPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: "0",
        REALTIME_AGENT_DATA_DIR: dataRoot,
        REALTIME_AGENT_KEYCHAIN_SERVICE: service,
        REALTIME_AGENT_KEYCHAIN_ACCOUNT: account,
        APPROVED_WORKSPACE: repoRoot,
        OPENAI_API_KEY: ""
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
      process.stderr.write(chunk);
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
  assert(response.status === expectedStatus, `${path} returned ${expectedStatus}`);
  return response.json();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Keychain smoke assertion failed: ${message}`);
  }
}
