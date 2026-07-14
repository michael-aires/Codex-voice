import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const serverPath = join(appRoot, "Resources", "Broker", "server.mjs");

const dataRoot = await mkdtemp(join(tmpdir(), "rda-smoke-store-"));
const extraRoot = await mkdtemp(join(tmpdir(), "rda-smoke-allowlist-"));
await writeFile(join(extraRoot, "allowed-note.txt"), "cooper-smoke-needle\nsecond line\n", "utf8");

let broker;
try {
  const ready = await startBroker();
  const base = ready.url.replace(/\/$/, "");

  await assertHealth(base);
  await assertDiagnostics(base);
  await assertCrashDiagnostics(base);
  await assertManifest(base);
  await assertLocalLock(base);
  await assertResponsesArtifactFallback(base);
  await assertPdfExtraction(base);
  await assertAllowlist(base);
  await assertComputerUseTools(base);
  await assertNotionGates(base);
  await assertArcadeRoutes(base);
  await assertGstackAdvisory(base);
  await assertStoreImportExport(base);
  await assertOperatorPersistence(base);
  await assertPushToTalkHelper(base);
  await assertStaticMarkers(base);

  console.log("native broker smoke passed");
} finally {
  if (broker) {
    broker.kill("SIGINT");
  }
  await rm(dataRoot, { recursive: true, force: true });
  await rm(extraRoot, { recursive: true, force: true });
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
        REALTIME_AGENT_ENABLE_CRASH_TEST: "1",
        REALTIME_AGENT_COMPUTER_USE_DRY_RUN: "1",
        COOPER_PTT_TOKEN: "cooper-smoke-ptt-token",
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

async function assertHealth(base) {
  const health = await getJson(base, "/health");
  assert(health.ok === true, "health ok");
  assert(Array.isArray(health.tools) && health.tools.includes("local.read_file"), "health exposes local.read_file");
  assert(Array.isArray(health.supportsCallModes) && health.supportsCallModes.includes("wake"), "health exposes wake call mode");
  assert(health.supportsArtifactResponses === true, "health exposes artifact Responses generation");
  assert(health.supportsPushToTalkHelper === true, "health exposes push-to-talk helper");
  assert(health.supportsGstackAdvisory === true, "health exposes GStack advisory tools");
  assert(health.supportsComputerUseExecution === true, "health exposes Computer Use execution");
  assert(health.computerUseDryRun === true, "health exposes Computer Use dry run mode");
  assert(typeof health.artifactModel === "string" && health.artifactModel.length > 0, "health exposes artifact model");
}

async function assertDiagnostics(base) {
  const diagnostics = await getJson(base, "/api/diagnostics");
  assert(diagnostics.ok === true, "diagnostics ok");
  assert(diagnostics.runtime.hasOpenAIKey === false, "diagnostics redacts OpenAI key value");
  assert(diagnostics.staticFiles["app.js"].exists, "diagnostics sees app.js");
  assert(diagnostics.security.localFileToolsUseAllowlist, "diagnostics includes security flags");
  assert(diagnostics.security.pdfExtractionUsesPDFKit, "diagnostics exposes PDFKit extraction flag");
  assert(diagnostics.security.localLockHashStoredSeparately, "diagnostics exposes separate lock hash storage");
  assert(diagnostics.security.artifactResponsesUseOpenAIResponses, "diagnostics exposes Responses artifact flag");
  assert(diagnostics.security.crashReportsRedactSecrets, "diagnostics exposes crash report redaction flag");
  assert(diagnostics.crashReports?.path?.endsWith("broker-crashes.jsonl"), "diagnostics exposes crash report path");
  assert(typeof diagnostics.runtime.artifactModel === "string" && diagnostics.runtime.artifactModel.length > 0, "diagnostics exposes artifact model");
  assert(diagnostics.manifest?.schema === "realtime-desktop-agent.capability-manifest.v1", "diagnostics summarizes manifest");
}

async function assertCrashDiagnostics(base) {
  const fakeSecret = ["sk", "proj", "SMOKESECRET1234567890"].join("-");
  const written = await postJson(base, "/api/diagnostics/crash-test", {
    message: `Synthetic smoke crash ${fakeSecret}`
  });
  assert(written.ok === true, "synthetic crash report writes");
  assert(written.report?.kind === "synthetic", "synthetic crash report kind ok");
  assert(!JSON.stringify(written).includes(fakeSecret), "synthetic crash report redacts fake key");
  assert(!JSON.stringify(written).includes("sk-"), "synthetic crash response contains no key prefix");

  const diagnostics = await getJson(base, "/api/diagnostics");
  assert(diagnostics.crashReports?.count >= 1, "diagnostics includes crash report count");
  assert(diagnostics.crashReports?.latest?.kind === "synthetic", "diagnostics includes latest synthetic report");
  assert(Array.isArray(diagnostics.crashReports?.recent), "diagnostics includes recent crash reports");
  assert(!JSON.stringify(diagnostics.crashReports).includes(fakeSecret), "diagnostics crash reports redact fake key");
  assert(!JSON.stringify(diagnostics.crashReports).includes("sk-"), "diagnostics crash reports contain no key prefix");
}

async function assertManifest(base) {
  const manifest = await getJson(base, "/api/manifest");
  assert(manifest.schema === "realtime-desktop-agent.capability-manifest.v1", "manifest schema ok");
  assert(manifest.capabilities?.artifactResponses === true, "manifest exposes artifact Responses capability");
  assert(manifest.capabilities?.gstackAdvisoryTools === true, "manifest exposes GStack advisory tools");
  assert(manifest.capabilities?.arcadeAuthorizationSurface === true, "manifest exposes Arcade authorization surface");
  assert(manifest.capabilities?.arcadeMappedToolExecution === true, "manifest exposes Arcade mapped tool execution");
  assert(manifest.capabilities?.computerUseExecution === true, "manifest exposes Computer Use execution");
  assert(manifest.capabilities?.computerUseDeterministicTools === true, "manifest exposes deterministic Computer Use tools");
  assert(manifest.capabilities?.pushToTalkHelper === true, "manifest exposes push-to-talk helper");
  assert(manifest.capabilities?.pushToTalkExecution === true, "manifest exposes approval-gated push-to-talk execution");
  assert(manifest.capabilities?.presentationRuntime === true, "manifest exposes presentation runtime");
  assert(manifest.routes?.some((route) => route.path === "/api/artifacts/generate"), "manifest includes artifact route");
  assert(manifest.routes?.some((route) => route.path === "/api/push-to-talk/utterance"), "manifest includes push-to-talk route");
  assert(manifest.routes?.some((route) => route.path === "/api/tools/arcade/status"), "manifest includes Arcade status route");
  assert(manifest.routes?.some((route) => route.path === "/api/manifest"), "manifest includes manifest route");
  assert(manifest.tools?.some((tool) => tool.toolId === "search_workspace_context" && tool.connector === "arcade"), "manifest includes Arcade tool metadata");
  assert(manifest.tools?.some((tool) => tool.toolId === "run_gstack_skill" && tool.risk === "advisory"), "manifest includes GStack advisory tool metadata");
  assert(manifest.tools?.some((tool) => tool.toolId === "open_local_app" && tool.risk === "high"), "manifest includes Computer Use tool metadata");
  assert(manifest.tools?.some((tool) => tool.toolId === "notion.search" && tool.connector === "notion"), "manifest includes Notion connector tool metadata");
  assert(manifest.connectors?.some((connector) => connector.id === "notion" && connector.risk === "medium" && connector.authMode === "env_token"), "manifest includes connector risk metadata");
  assert(manifest.connectors?.some((connector) => connector.id === "arcade" && connector.authMode === "arcade_oauth"), "manifest includes Arcade connector metadata");
  assert(manifest.security?.localLockProtectsApi === true, "manifest includes local lock security posture");
  assert(!JSON.stringify(manifest).includes("sk-"), "manifest redacts secrets");
}

async function assertLocalLock(base) {
  const initial = await getJson(base, "/api/lock");
  assert(initial.lock?.enabled === false, "local lock starts disabled");
  assert(initial.lock?.unlocked === true, "disabled local lock reports unlocked");

  const configured = await postJson(base, "/api/lock", {
    action: "configure",
    password: "cooper-smoke-lock",
    ttlMinutes: 5
  });
  assert(configured.lock?.enabled === true, "local lock config enables lock");
  assert(configured.lock?.unlocked === true, "local lock config unlocks current session");

  const locked = await postJson(base, "/api/lock", { action: "lock" });
  assert(locked.lock?.enabled === true && locked.lock?.unlocked === false, "lock action expires session");

  const blockedStore = await getJson(base, "/api/store", 423);
  assert(blockedStore.lock?.enabled === true && blockedStore.lock?.unlocked === false, "locked app blocks store access");

  const rejected = await postJson(base, "/api/lock", {
    action: "unlock",
    password: "wrong-password"
  }, 401);
  assert(rejected.ok === false, "bad lock password is rejected");

  const unlocked = await postJson(base, "/api/lock", {
    action: "unlock",
    password: "cooper-smoke-lock"
  });
  assert(unlocked.lock?.unlocked === true, "correct lock password unlocks session");

  const exported = await getJson(base, "/api/store");
  assert(!JSON.stringify(exported).includes("cooper-smoke-lock"), "store export does not include raw lock password");
  assert(!JSON.stringify(exported).includes("passwordHash"), "store export does not include lock hash");

  const disabled = await postJson(base, "/api/lock", {
    action: "disable",
    password: "cooper-smoke-lock"
  });
  assert(disabled.lock?.enabled === false, "local lock disables with current password");
}

async function assertResponsesArtifactFallback(base) {
  const response = await postJson(base, "/api/artifacts/generate", {
    kind: "markdown",
    title: "Smoke artifact",
    context: {
      subject: "Smoke",
      facts: ["One source fact"]
    }
  }, 424);
  assert(response.code === "missing_openai_key", "Responses artifact reports missing key");
  assert(response.fallbackRecommended === true, "Responses artifact recommends local fallback");
  assert(!JSON.stringify(response).includes("sk-"), "Responses fallback redacts keys");
}

async function assertPdfExtraction(base) {
  const invalid = await postJson(base, "/api/project-sources/extract-pdf", {
    fileName: "not-a-pdf.txt",
    data: Buffer.from("not a pdf").toString("base64")
  }, 400);
  assert(invalid.status === "invalid_pdf", "invalid PDF data is rejected");

  const smokeText = "Cooper PDF extraction smoke";
  const extracted = await postJson(base, "/api/project-sources/extract-pdf", {
    fileName: "source.pdf",
    data: createSmokePdf(smokeText).toString("base64")
  });
  assert(extracted.status === "ready", "valid PDF extraction returns ready");
  assert(extracted.content.includes(smokeText), "PDF text is extracted");
  assert(extracted.extractor === "macos-pdfkit", "PDF extractor is reported");
}

async function assertAllowlist(base) {
  await putJson(base, "/api/settings", {
    workspaceAllowlist: [repoRoot, extraRoot]
  });

  const search = await postJson(base, "/api/tools/execute", {
    name: "local_search_files",
    arguments: { query: "cooper-smoke-needle" }
  });
  assert(search.output?.status === "ok", "allowlist search ok");
  assert(search.output.results?.[0]?.workspaceRoot === extraRoot, "search found extra allowlist root");

  const read = await postJson(base, "/api/tools/execute", {
    name: "local_read_file",
    arguments: { path: join(extraRoot, "allowed-note.txt") }
  });
  assert(read.output?.status === "ok", "allowlist read ok");
  assert(read.output.content.includes("cooper-smoke-needle"), "read content returned");

  const blocked = await postJson(base, "/api/tools/execute", {
    name: "local_read_file",
    arguments: { path: "/etc/hosts" }
  }, 400);
  assert(blocked.output?.status === "error", "outside read blocked");
  assert(/outside the approved workspace allowlist/i.test(blocked.output.message), "blocked message explains allowlist");
}

async function assertComputerUseTools(base) {
  const web = await postJson(base, "/api/tools/execute", {
    name: "open_web_app",
    arguments: { app: "github" }
  });
  assert(web.output?.status === "completed", "Computer Use open_web_app completes");
  assert(web.output?.dryRun === true, "Computer Use open_web_app dry-runs in smoke");

  const app = await postJson(base, "/api/tools/execute", {
    name: "open_local_app",
    arguments: { app_name: "Xcode" }
  });
  assert(app.output?.status === "completed", "Computer Use open_local_app allowed app completes");

  const blockedApp = await postJson(base, "/api/tools/execute", {
    name: "open_local_app",
    arguments: { app_name: "Totally Not Allowed App" }
  });
  assert(blockedApp.output?.status === "blocked", "Computer Use blocks unallowed apps");

  const finder = await postJson(base, "/api/tools/execute", {
    name: "open_finder_location",
    arguments: { path: extraRoot }
  });
  assert(finder.output?.status === "completed", "Computer Use opens allowlisted Finder location");

  const outside = await postJson(base, "/api/tools/execute", {
    name: "open_finder_location",
    arguments: { path: "/etc" }
  });
  assert(outside.output?.status === "blocked", "Computer Use blocks outside Finder path");
}

async function assertNotionGates(base) {
  const unauthorized = await postJson(base, "/api/tools/execute", {
    name: "notion_search",
    arguments: { query: "rep velocity" }
  }, 400);
  assert(unauthorized.output?.code === "connector_not_authorized", "Notion requires connector authorization");
  assert(unauthorized.output?.connectorMeta?.risk === "medium", "Notion unauthorized error includes connector risk");
  assert(unauthorized.output?.connectorMeta?.authMode === "env_token", "Notion unauthorized error includes auth mode");

  await putJson(base, "/api/settings", {
    connectors: [
      { id: "notion", label: "Notion", status: "authorized", note: "Smoke" },
      { id: "arcade", label: "Arcade", status: "not_configured", note: "Smoke" },
      { id: "aires_requirements", label: "AIRES Requirements", status: "local_only", note: "Smoke" }
    ]
  });
  const missingToken = await postJson(base, "/api/tools/execute", {
    name: "notion.search",
    arguments: { query: "rep velocity" }
  }, 400);
  assert(missingToken.output?.code === "connector_missing_token", "Notion requires token after authorization");
}

async function assertArcadeRoutes(base) {
  const status = await getJson(base, "/api/tools/arcade/status");
  assert(status.ok === true, "Arcade status route returns ok");
  assert(status.configured === false, "Arcade status reports missing API key in smoke");
  assert(Array.isArray(status.tools) && status.tools.some((tool) => tool.name === "search_workspace_context"), "Arcade status lists mapped tool slots");
  assert(status.tools.some((tool) => tool.status === "missing_api_key"), "Arcade tools report missing key");

  const discovery = await getJson(base, "/api/tools/arcade/discovery");
  assert(discovery.ok === true, "Arcade discovery route returns ok without key");
  assert(discovery.error === "Missing ARCADE_API_KEY.", "Arcade discovery reports missing key");
  assert(Array.isArray(discovery.services) && discovery.services.some((service) => service.service === "Notion"), "Arcade discovery includes service catalog");

  const authorize = await postJson(base, "/api/tools/arcade/authorize", {
    name: "search_workspace_context"
  }, 400);
  assert(authorize.code === "arcade_mapping_required", "Arcade authorize requires mapping before key");

  const execute = await postJson(base, "/api/tools/execute", {
    name: "search_workspace_context",
    arguments: { query: "rep velocity" }
  }, 400);
  assert(execute.output?.code === "missing_arcade_api_key", "Arcade mapped tool reports missing key");
  assert(execute.output?.recoverable === true, "Arcade missing key is recoverable");
  assert(execute.output?.connectorMeta?.authMode === "arcade_oauth", "Arcade error includes connector metadata");

  const now = new Date().toISOString();
  const imported = await putJson(base, "/api/store", {
    store: {
      schemaVersion: 1,
      arcadeAuthorizations: [{
        id: "arcade-auth-smoke",
        toolName: "search_workspace_context",
        arcadeToolName: "Smoke.Search",
        userId: "michael",
        authorizationId: "auth-smoke",
        authorizationUrl: "https://example.com/auth",
        providerId: "smoke-provider",
        scopes: ["read"],
        status: "pending",
        createdAt: now,
        updatedAt: now,
        lastCheckedAt: now
      }],
      updatedAt: now
    },
    merge: true
  });
  assert(imported.store.arcadeAuthorizations?.[0]?.id === "arcade-auth-smoke", "Arcade authorizations import");

  const nextStatus = await getJson(base, "/api/tools/arcade/status");
  assert(nextStatus.authorizations?.some((item) => item.id === "arcade-auth-smoke"), "Arcade status exposes persisted non-secret authorization");
  assert(!JSON.stringify(nextStatus).includes("sk-"), "Arcade status redacts secrets");
}

async function assertGstackAdvisory(base) {
  const unknown = await postJson(base, "/api/tools/execute", {
    name: "run_gstack_skill",
    arguments: { skill: "nope", input: "Review this." }
  }, 400);
  assert(unknown.output?.code === "unknown_gstack_skill", "GStack rejects unknown skills");

  const missingKey = await postJson(base, "/api/tools/execute", {
    name: "run_gstack_skill",
    arguments: { skill: "code_review", input: "Review this small native change.", mode: "advisory" }
  }, 400);
  assert(missingKey.output?.code === "missing_openai_key", "GStack reports missing OpenAI key");
  assert(missingKey.output?.recoverable === true, "GStack missing key is recoverable");
  assert(!JSON.stringify(missingKey).includes("sk-"), "GStack missing key redacts secrets");
}

async function assertStoreImportExport(base) {
  const now = new Date().toISOString();
  const imported = await putJson(base, "/api/store", {
    store: {
      schemaVersion: 1,
      sessions: [{
        id: "session-import-smoke",
        title: "Imported smoke session",
        status: "ended",
        startedAt: now,
        endedAt: now,
        updatedAt: now,
        transcriptTurns: [{ speaker: "user", text: "import smoke", timestamp: now }],
        canvasCards: [],
        cardModes: {},
        summary: "Smoke import"
      }],
      settings: {
        workspaceAllowlist: [repoRoot],
        toolAudit: [{ id: "audit-import-smoke", kind: "settings", title: "Import smoke", detail: "Round trip", createdAt: now }]
      },
      updatedAt: now
    }
  });
  assert(imported.metadata?.storePath, "store import returns metadata");
  assert(imported.store.sessions?.[0]?.id === "session-import-smoke", "store import persists session");

  const exported = await getJson(base, "/api/store");
  assert(exported.store.sessions?.[0]?.title === "Imported smoke session", "store export returns imported session");

  const roundTrip = await putJson(base, "/api/store", exported);
  assert(roundTrip.store.settings?.toolAudit?.[0]?.id === "audit-import-smoke", "export payload imports round trip");
}

async function assertOperatorPersistence(base) {
  const now = new Date().toISOString();
  const saved = await putJson(base, "/api/store", {
    store: {
      schemaVersion: 1,
      operatorTasks: [{
        id: "operator-smoke",
        title: "Smoke operator task",
        kind: "operator",
        status: "approval_required",
        risk: "medium",
        summary: "Waiting for approval.",
        logs: [{ id: "oplog-smoke", level: "approval", message: "Queued.", createdAt: now }],
        artifacts: [],
        createdAt: now,
        updatedAt: now
      }],
      updatedAt: now
    }
  });
  assert(saved.store.operatorTasks?.[0]?.status === "approval_required", "operator task persists");
  assert(saved.store.operatorTasks?.[0]?.logs?.length === 1, "operator logs persist");
}

async function assertPushToTalkHelper(base) {
  const config = await getJson(base, "/api/push-to-talk/config");
  assert(config.ok === true, "push-to-talk config ok");
  assert(config.tokenRequired === true, "push-to-talk config reports token requirement");
  assert(config.endpoint === "/api/push-to-talk/utterance", "push-to-talk config exposes utterance endpoint");

  const rejected = await postJson(base, "/api/push-to-talk/utterance", {
    source: "smoke",
    transcript: "open xcode"
  }, 401);
  assert(rejected.code === "ptt_token_required", "push-to-talk rejects missing token");

  const queued = await postJsonWithHeaders(base, "/api/push-to-talk/utterance", {
    source: "smoke",
    transcript: "open Xcode and show the native app project"
  }, {
    "x-cooper-ptt-token": "cooper-smoke-ptt-token"
  });
  assert(queued.action === "computer_task_queued", "push-to-talk queues computer commands");
  assert(queued.taskId, "push-to-talk returns task id");

  const store = await getJson(base, "/api/store");
  const task = store.store.operatorTasks.find((item) => item.id === queued.taskId);
  assert(task?.kind === "computer_use", "push-to-talk task persists as computer_use");
  assert(task?.status === "approval_required", "push-to-talk task waits for approval");
  assert(store.store.settings?.toolAudit?.some((event) => event.title === "Push-to-talk utterance queued"), "push-to-talk audit persists");

  const merged = await putJson(base, "/api/store", {
    merge: true,
    store: {
      schemaVersion: 1,
      sessions: [{
        id: "session-ptt-merge-smoke",
        title: "PTT merge smoke",
        status: "ended",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]
    }
  });
  assert(merged.store.operatorTasks.some((item) => item.id === queued.taskId), "merge save preserves push-to-talk task");

  const stopped = await postJsonWithHeaders(base, "/api/push-to-talk/utterance", {
    source: "smoke",
    transcript: "stop computer automation"
  }, {
    "x-cooper-ptt-token": "cooper-smoke-ptt-token"
  });
  assert(stopped.action === "stop_computer", "push-to-talk stop command routes");
  assert(stopped.stopped >= 1, "push-to-talk stop stops active task");
}

async function assertStaticMarkers(base) {
  const html = await getText(base, "/index.html");
  const app = await getText(base, "/app.js");
  const css = await getText(base, "/styles.css");
  const brokerSource = await readFile(serverPath, "utf8");
  const swift = await readFile(join(appRoot, "RealtimeDesktopAgent", "WebViewContainer.swift"), "utf8");
  const appSwift = await readFile(join(appRoot, "RealtimeDesktopAgent", "RealtimeDesktopAgentApp.swift"), "utf8");
  const crashSwift = await readFile(join(appRoot, "RealtimeDesktopAgent", "NativeCrashReporter.swift"), "utf8");
  const gstackPrompt = await readFile(join(appRoot, "Resources", "Broker", "gstack-skills", "code-review.md"), "utf8");
  assert(html.includes('id="lockView"') && app.includes("configureLocalLock") && app.includes("renderLockScreen") && css.includes("lock-view"), "local lock UI markers");
  assert(html.includes('data-call-mode="wake"') && app.includes("hasWakePhrase") && brokerSource.includes("Wake phrase"), "wake phrase mode markers");
  assert(html.includes('data-nav-view="operator"'), "Operator nav marker");
  assert(app.includes("renderOperatorBody") && app.includes("exportDiagnostics"), "Operator and diagnostics client markers");
  assert(app.includes("openMeetingUrl") && app.includes("Meeting join opened") && app.includes("joinUrl"), "meeting join path markers");
  assert(app.includes("renderSessionsBody") && app.includes("sessionSearchText"), "Sessions search/detail client markers");
  assert(app.includes("exportNativeStore") && app.includes("importNativeStoreFromFile"), "store import/export client markers");
  assert(html.includes("session-sidebar") && css.includes("session-os-layout") && css.includes("session-rail-nav"), "Session OS shell markers");
  assert(app.includes("notifyNative") && swift.includes("nativeNotification") && swift.includes("UNUserNotificationCenter"), "native notification bridge markers");
  assert(app.includes("requestNativeNotificationStatus") && swift.includes("nativeNotificationStatus") && swift.includes("nativeNotificationPermission"), "native notification settings markers");
  assert(app.includes("extractPdfFile") && brokerSource.includes("/api/project-sources/extract-pdf") && brokerSource.includes("PDFKit"), "PDF extraction markers");
  assert(app.includes("buildMcpAppArtifact") && app.includes("renderMcpAppPreview") && css.includes("mcp-preview"), "MCP App artifact preview markers");
  assert(brokerSource.includes("/api/artifacts/generate") && app.includes("requestResponsesArtifact"), "Responses artifact generation markers");
  assert(brokerSource.includes("runGstackSkill") && app.includes("renderGstackSkillResult") && gstackPrompt.includes("Cooper GStack Skill"), "GStack advisory markers");
  assert(app.includes("retryResponsesJob") && app.includes("canRetryResponsesJob") && app.includes("Retry Responses"), "Responses artifact retry markers");
  assert(app.includes("artifactReaderModes") && app.includes("renderArtifactSource") && app.includes("renderArtifactMetadata") && css.includes("artifact-reader-tabs"), "artifact reader tab markers");
  assert(app.includes("startAiresFacilitation") && app.includes("buildAiresFacilitationPacket") && css.includes("aires-live-actions"), "AIRES live facilitation markers");
  assert(app.includes("startArtifactPresentation") && app.includes("artifactPresentationSlides") && css.includes("presentation-overlay"), "presentation runtime markers");
  assert(brokerSource.includes("/api/manifest") && brokerSource.includes("buildCapabilityManifest") && app.includes("hydrateManifestStatus"), "capability manifest markers");
  assert(brokerSource.includes("connectorGateMetadata") && app.includes("connectorMeta") && css.includes(".connector-row span"), "connector risk metadata markers");
  assert(app.includes("connectorApprovalPrompt") && app.includes("connectorApprovalDetail") && app.includes("Approval-gated tools"), "connector approval audit markers");
  assert(brokerSource.includes("/api/tools/arcade/status") && brokerSource.includes("loadArcadeConstructor") && app.includes("renderArcadeSettingsPanel"), "Arcade authorization markers");
  assert(app.includes("arcadeToolNames") && app.includes("renderArcadeToolResult") && css.includes(".arcade-panel"), "Arcade web UI markers");
  assert(brokerSource.includes("/api/lock") && brokerSource.includes("lockPath") && brokerSource.includes("scrypt"), "local lock broker markers");
  assert(brokerSource.includes("crashReportPath") && brokerSource.includes("recordCrashReportSync") && brokerSource.includes("crashReportsRedactSecrets"), "broker crash diagnostics markers");
  assert(appSwift.includes("NativeCrashReporter.install") && crashSwift.includes("native-crashes.jsonl") && crashSwift.includes("NSSetUncaughtExceptionHandler"), "native crash diagnostics markers");
  assert(brokerSource.includes("/api/push-to-talk/utterance") && brokerSource.includes("queuePushToTalkOperatorTask") && app.includes("merge: true"), "push-to-talk helper markers");
  assert(brokerSource.includes("executeLocalComputerTool") && app.includes("executeComputerUseOperatorTask") && app.includes("renderComputerUseResult"), "Computer Use execution markers");
  assert(app.includes("sanitizeHTML") && app.includes("blockedTags") && app.includes("allowedClasses"), "renderer sanitizer markers");
  assert(css.includes("operator-board") && css.includes("sessions-board") && css.includes("settings-panel"), "operator/sessions/settings styles markers");
}

function createSmokePdf(text) {
  const escaped = String(text).replace(/[()\\]/g, "\\$&");
  const stream = `BT\n/F1 24 Tf\n72 720 Td\n(${escaped}) Tj\nET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function getJson(base, path, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`);
  assert(response.status === expectedStatus, `${path} returned ${expectedStatus}`);
  return response.json();
}

async function getText(base, path, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`);
  assert(response.status === expectedStatus, `${path} returned ${expectedStatus}`);
  return response.text();
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

async function postJsonWithHeaders(base, path, body, headers = {}, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  assert(response.status === expectedStatus, `${path} returned ${expectedStatus}`);
  return response.json();
}

async function putJson(base, path, body, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  assert(response.status === expectedStatus, `${path} returned ${expectedStatus}`);
  return response.json();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Smoke assertion failed: ${message}`);
  }
}
