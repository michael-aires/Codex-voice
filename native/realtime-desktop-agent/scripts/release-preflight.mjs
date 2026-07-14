import { spawn } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const projectPath = join(appRoot, "RealtimeDesktopAgent.xcodeproj");
const scheme = "RealtimeDesktopAgent";
const node = process.execPath;
const shouldRunLiveResponses = Boolean(process.env.OPENAI_API_KEY) || process.env.REALTIME_AGENT_RUN_LIVE_SMOKES === "1";
const requireDistributionSigning = process.env.REALTIME_AGENT_REQUIRE_DISTRIBUTION_SIGNING === "1";

const preflightSteps = [
  ["Broker parser", node, ["--check", join(appRoot, "Resources", "Broker", "server.mjs")]],
  ["Web parser", node, ["--check", join(appRoot, "Resources", "Web", "app.js")]],
  ["Broker smoke parser", node, ["--check", join(appRoot, "scripts", "broker-smoke.mjs")]],
  ["Web UI smoke parser", node, ["--check", join(appRoot, "scripts", "web-ui-smoke.mjs")]],
  ["Keychain smoke parser", node, ["--check", join(appRoot, "scripts", "keychain-smoke.mjs")]],
  ["Responses smoke parser", node, ["--check", join(appRoot, "scripts", "responses-artifact-smoke.mjs")]],
  ["Release preflight parser", node, ["--check", join(appRoot, "scripts", "release-preflight.mjs")]],
  ["Broker/security smoke", node, [join(appRoot, "scripts", "broker-smoke.mjs")]],
  ["Static UI/design-token smoke", node, [join(appRoot, "scripts", "web-ui-smoke.mjs")]],
  ["WKWebView render smoke", "swift", [join(appRoot, "scripts", "wkwebview-smoke.swift")]],
  ["Keychain mutation smoke", node, [join(appRoot, "scripts", "keychain-smoke.mjs")]]
];

if (shouldRunLiveResponses) {
  preflightSteps.push(["Live Responses artifact smoke", node, [join(appRoot, "scripts", "responses-artifact-smoke.mjs")]]);
}

preflightSteps.push(
  ["Xcode Debug build", "xcodebuild", ["-quiet", "-project", projectPath, "-scheme", scheme, "-configuration", "Debug", "build"]],
  ["Xcode Release build", "xcodebuild", ["-quiet", "-project", projectPath, "-scheme", scheme, "-configuration", "Release", "build"]]
);

try {
  for (const [label, command, args] of preflightSteps) {
    await runStep(label, command, args);
  }

  if (!shouldRunLiveResponses) {
    console.log("[skip] Live Responses artifact smoke: set OPENAI_API_KEY or REALTIME_AGENT_RUN_LIVE_SMOKES=1 to require it.");
  }

  const release = await releaseBuildSettings();
  const appPath = join(release.TARGET_BUILD_DIR, release.FULL_PRODUCT_NAME);
  await verifyReleaseBundle(appPath);
  await runStep("Codesign verify", "codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  await verifyCodesignRuntime(appPath);
  verifySigningMode(release);

  console.log(`native release preflight passed: ${appPath}`);
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}

async function runStep(label, command, args) {
  process.stdout.write(`[run] ${label}\n`);
  await run(command, args);
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      rejectPromise(new Error(`${command} ${args.join(" ")} failed with exit code ${code}${stderr ? `\n${stderr}` : ""}`));
    });
  });
}

async function releaseBuildSettings() {
  const { stdout } = await run("xcodebuild", [
    "-project", projectPath,
    "-scheme", scheme,
    "-configuration", "Release",
    "-showBuildSettings",
    "-json"
  ], { capture: true });
  const parsed = JSON.parse(stdout);
  return parsed?.[0]?.buildSettings || {};
}

async function verifyReleaseBundle(appPath) {
  await assertDirectory(appPath, "Release app bundle");
  const requiredFiles = [
    "Contents/Info.plist",
    "Contents/MacOS/RealtimeDesktopAgent",
    "Contents/Resources/Resources/Broker/server.mjs",
    "Contents/Resources/Resources/Broker/package.json",
    "Contents/Resources/Resources/Web/index.html",
    "Contents/Resources/Resources/Web/app.js",
    "Contents/Resources/Resources/Web/styles.css",
    "Contents/Resources/Resources/Web/design-tokens.json",
    "Contents/Resources/Resources/Broker/gstack-skills/code-review.md"
  ];
  for (const relativePath of requiredFiles) {
    await assertFile(join(appPath, relativePath), relativePath);
  }
  console.log(`[ok] Release bundle resources verified: ${appPath}`);
}

async function assertDirectory(path, label) {
  const info = await stat(path).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(`${label} missing: ${path}`);
  }
}

async function assertFile(path, label) {
  try {
    await access(path);
  } catch {
    throw new Error(`Release bundle is missing ${label}: ${path}`);
  }
}

function verifySigningMode(settings) {
  const identity = settings.CODE_SIGN_IDENTITY || "";
  const developmentTeam = settings.DEVELOPMENT_TEAM || "";
  const hardenedRuntime = settings.ENABLE_HARDENED_RUNTIME || "NO";
  const localOnly = identity === "-" || !developmentTeam;
  if (hardenedRuntime !== "YES") {
    throw new Error("Release builds must enable ENABLE_HARDENED_RUNTIME=YES before distribution preflight can pass.");
  }
  if (requireDistributionSigning && localOnly) {
    throw new Error("Distribution signing is required, but the Release build is still configured for local/ad-hoc signing.");
  }
  if (localOnly) {
    console.log("[warn] Release build is locally/ad-hoc signed. Set DEVELOPMENT_TEAM and a Developer ID identity before external distribution.");
  }
}

async function verifyCodesignRuntime(appPath) {
  const result = await run("codesign", ["-d", "--verbose=4", appPath], { capture: true });
  const output = `${result.stdout}\n${result.stderr}`;
  if (!/Runtime Version/i.test(output)) {
    throw new Error("Release app signature does not report a hardened runtime.");
  }
  console.log("[ok] Codesign metadata reports hardened runtime.");
}
