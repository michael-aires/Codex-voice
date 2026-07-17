import "dotenv/config";
import express from "express";
import multer from "multer";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import Arcade from "@arcadeai/arcadejs";
import { PDFParse } from "pdf-parse";
import { renderArtifactDocx } from "./server/docxArtifact.js";
import { renderArtifactPptx, renderArtifactXlsx } from "./server/officeArtifact.js";
import { renderArtifactPdf } from "./server/pdfArtifact.js";
import {
  DOCUMENT_PIPELINE_STAGES,
  applyDocumentJobControl,
  nextArtifactVersion,
  normalizeJobPriority,
  pipelineStageForJob,
  qualityRepairInstruction,
  qualityReportForArtifact,
  sortDocumentQueue
} from "./server/documentPipeline.js";
import { cooperInstructions } from "./cooperPrompt.js";
import { cooperToolDefinitions, cooperToolNames } from "./cooperTools.js";
import {
  explainAiresFrameworkDocuments,
  workshopAiresFrameworkDocument
} from "./server/airesFramework.js";
import {
  buildAiresExamplePrompt,
  findAiresExample,
  getAiresExampleDocument,
  getAiresExampleList
} from "./server/airesExamples.js";
import {
  buildRequirementsDraftOutline,
  isRequirementsWorkshopJob,
  recommendRequirementsArtifacts,
  requirementsSuitePlan
} from "./server/requirementsWorkshop.js";
import {
  OPERATOR_PRESETS,
  createOperatorApproval,
  createOperatorArtifact,
  createOperatorLog,
  createOperatorTask,
  hydrateOperatorTask,
  isOperatorTaskActive,
  operatorRuntimeInfo,
  operatorTaskPublic
} from "./server/operatorRuntime.js";
import {
  CodexAppServerClient,
  codexApprovalFromServerRequest,
  codexApprovalResponse,
  codexTaskStatusFromThread,
  latestCodexAgentMessage
} from "./server/codexAppServerClient.js";
import {
  buildPushToTalkComputerTaskInput,
  classifyPushToTalkCommand,
  pushToTalkConfigFromEnv
} from "./server/pushToTalk.js";
import {
  cooperRouteFromOpenPath,
  enqueueMobilePushEvents,
  mobilePushConfigFromEnv,
  mobilePushEvents,
  mobilePushSnapshot,
  registerMobilePushDevice,
  sendMobilePush,
  unregisterMobilePushDevice
} from "./server/mobilePush.js";
import {
  executeLocalComputerTool,
  logLocalComputerTool,
  localComputerToolNames
} from "./server/localComputerTools.js";
import { runGstackSkill } from "./server/tools/runGstackSkill.js";
import {
  generateZoomMeetingSdkSignature,
  normalizeZoomMeetingNumber
} from "./server/zoomMeetingSdk.js";
import {
  buildSessionResumePacket,
  formatSessionResumeContext
} from "./server/sessionResume.js";
import { addResponsesApiUsage, normalizeResponsesApiUsage } from "./src/callCost.js";
import { artifactOutputTypeFromMetadata } from "./src/artifactPresentation.js";
import {
  boundedSessionChatInput,
  jsonSseEvents,
  normalizeSessionChatPrompt,
  parseFunctionArguments,
  responseFunctionCalls,
  responseOutputText,
  responsesChatTools
} from "./src/sessionChatProtocol.js";
import {
  buildContextPacket,
  composeRealtimeSessionContext,
  extractNotionObjectId,
  filterContextRecords,
  formatNotionMetadataContext,
  formatNotionResolvedContext,
  normalizeContextProvider,
  normalizeContextSearchResults,
  normalizeSelectedContextSource,
  publicContextPacket
} from "./server/contextCheckpoint.js";
import {
  arcadeOutputValue,
  normalizeCalendarEvents,
  normalizeLocalProjects,
  normalizeNotionSprintMetadata,
  normalizeNotionTaskMetadata,
  normalizePastSessions,
  notionPropertyValue,
  sortNotionTasks,
  zonedDayBounds
} from "./server/todayFeed.js";
import {
  buildDailyBrief,
  millisecondsUntilLocalHour
} from "./server/dailyBrief.js";
import {
  isLoopbackAddress,
  normalizePlanIngest
} from "./server/planIngest.js";
import {
  boundedContextPacketContext,
  contextPacketIdsForCall,
  contextPacketsForCall,
  contextSourceCountForCall
} from "./server/sessionContextLineage.js";
import {
  activeKnowledgeIndexRecord,
  addKnowledgeMessage,
  createKnowledgeIndexRecord,
  createStoredKnowledgeDocument,
  findKnowledgeDocument,
  hydrateKnowledgeState,
  knowledgeLibrary,
  publicKnowledgeDocument,
  restoreStoredKnowledgeVersion,
  setKnowledgeSession,
  setKnowledgeSessionResponse,
  updateKnowledgeIndexRecord,
  updateStoredKnowledgeDocument
} from "./server/knowledgeStore.js";
import { createKnowledgeOpenAIClient, KnowledgeOpenAIError } from "./server/knowledgeOpenAI.js";
import { canRetrieveKnowledgeDocument } from "./src/knowledgeStudioModel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 5000);
const dataDir = process.env.COOPER_DATA_DIR
  ? resolve(process.env.COOPER_DATA_DIR)
  : join(__dirname, "data");
const artifactsDir = join(dataDir, "artifacts");
const dbPath = join(dataDir, "cooper.json");
const workModel = process.env.COOPER_WORK_MODEL || "gpt-5.4";
const fallbackWorkModel = process.env.COOPER_FALLBACK_WORK_MODEL || "";
const jobDelayMs = Number(process.env.COOPER_JOB_DELAY_MS || 15000);
const jobMaxAttempts = Number(process.env.COOPER_JOB_MAX_ATTEMPTS || 3);
const jobMaxOutputTokens = Number(process.env.COOPER_JOB_MAX_OUTPUT_TOKENS || 9000);
const jobQualityGateEnabled = process.env.COOPER_JOB_QUALITY_GATE !== "false";
const jobQualityMinimumScore = Math.max(0, Math.min(100, Number(process.env.COOPER_JOB_QUALITY_MIN_SCORE || 80)));
const jobQualityRepairAttempts = Math.max(0, Math.min(2, Number(process.env.COOPER_JOB_QUALITY_REPAIR_ATTEMPTS || 1)));
const chatModel = process.env.COOPER_CHAT_MODEL || workModel;
const chatMaxOutputTokens = Number(process.env.COOPER_CHAT_MAX_OUTPUT_TOKENS || 1800);
const chatMaxToolRounds = Math.max(1, Number(process.env.COOPER_CHAT_MAX_TOOL_ROUNDS || 8));
const projectContextChars = Number(process.env.COOPER_PROJECT_CONTEXT_CHARS || 18000);
const projectSourceMaxChars = Number(process.env.COOPER_PROJECT_SOURCE_MAX_CHARS || 250000);
const projectUploadMaxBytes = Number(process.env.COOPER_PROJECT_UPLOAD_MAX_MB || 20) * 1024 * 1024;
const contextPacketMaxChars = Number(process.env.COOPER_CONTEXT_PACKET_MAX_CHARS || 36000);
const contextSearchLimit = Number(process.env.COOPER_CONTEXT_SEARCH_LIMIT || 50);
const pushToTalkMaxAudioBytes = Number(process.env.COOPER_PTT_MAX_AUDIO_MB || 18) * 1024 * 1024;
const pushToTalkToken = process.env.COOPER_PTT_TOKEN || "";
const pushToTalkTranscriptionModel = process.env.COOPER_PTT_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const pushToTalkResponseMaxOutputTokens = Number(process.env.COOPER_PTT_RESPONSE_MAX_OUTPUT_TOKENS || 1200);
const workModels = [workModel, fallbackWorkModel].filter((model, index, list) => model && list.indexOf(model) === index);
const appPassword = process.env.COOPER_APP_PASSWORD || "";
const sessionSecret = process.env.COOPER_SESSION_SECRET || appPassword;
const cookieName = "cooper_session";
const sessionTtlMs = Number(process.env.COOPER_SESSION_TTL_HOURS || 168) * 60 * 60 * 1000;
const ingestToken = process.env.COOPER_INGEST_TOKEN || "";
const planIngestMaxChars = Number(process.env.COOPER_PLAN_INGEST_MAX_CHARS || 120000);
const mobilePushConfig = mobilePushConfigFromEnv(process.env);
const iosAssociatedAppId = cleanText(process.env.COOPER_IOS_ASSOCIATED_APP_ID || "");
const arcadeUserId = process.env.ARCADE_USER_ID || "michael";
const arcadeMcpGatewayUrl = process.env.ARCADE_MCP_GATEWAY_URL || "";
const arcadeToolMappings = {
  search_workspace_context: process.env.ARCADE_SEARCH_WORKSPACE_TOOL || "",
  search_notion_workspace: process.env.ARCADE_NOTION_SEARCH_TOOL || "",
  fetch_notion_page: process.env.ARCADE_NOTION_FETCH_PAGE_TOOL || "",
  get_customer_context: process.env.ARCADE_CUSTOMER_CONTEXT_TOOL || "",
  inspect_engineering_context: process.env.ARCADE_ENGINEERING_CONTEXT_TOOL || "",
  create_followup_action: process.env.ARCADE_CREATE_FOLLOWUP_TOOL || ""
};
const todayTimeZone = process.env.COOPER_TIME_ZONE || "America/Vancouver";
const todayCacheMs = Math.max(30000, Number(process.env.COOPER_TODAY_CACHE_SECONDS || 120) * 1000);
const todayCalendarTool = process.env.ARCADE_CALENDAR_EVENTS_TOOL || "GoogleCalendar.ListEvents";
const todayNotionMetadataTool = process.env.ARCADE_NOTION_METADATA_TOOL || "NotionToolkit.GetObjectMetadata";
const todayNotionSprintAnchorPageId = extractNotionId(
  process.env.COOPER_NOTION_SPRINT_ANCHOR_PAGE_ID
    || process.env.COOPER_NOTION_SPRINT_ANCHOR_URL
    || "39c5efcc-eccd-8038-a3b7-f874099756ba"
);
const todayNotionSprintDatabaseId = extractNotionId(
  process.env.COOPER_NOTION_SPRINT_DATABASE_ID || "6772d5ef-4e05-49b4-b41b-a5286f0f4cfa"
);
const todayNotionActiveSprintId = extractNotionId(process.env.COOPER_NOTION_ACTIVE_SPRINT_ID || "");
const dailyBriefHour = Math.min(23, Math.max(0, Number(process.env.COOPER_DAILY_BRIEF_HOUR || 7)));
const dailyBriefAssignees = String(process.env.COOPER_DAILY_BRIEF_ASSIGNEES || "Michael Moll,michael@aires.ai,michael")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const arcadeDiscoveryCatalog = [
  { service: "Notion", toolkit: "NotionToolkit", toolName: "NotionToolkit.SearchByTitle", capability: "Search pages and databases", kind: "read" },
  { service: "Notion", toolkit: "NotionToolkit", toolName: "NotionToolkit.GetPageContentById", capability: "Load page content", kind: "read" },
  { service: "Notion", toolkit: "NotionToolkit", toolName: "NotionToolkit.CreatePage", capability: "Create follow-up pages", kind: "write" },
  { service: "Google Calendar", toolkit: "GoogleCalendar", toolName: "GoogleCalendar.ListEvents", capability: "Read meetings", kind: "read" },
  { service: "Google Calendar", toolkit: "GoogleCalendar", toolName: "GoogleCalendar.CreateEvent", capability: "Create events", kind: "write" },
  { service: "Google Drive", toolkit: "GoogleDrive", toolName: "GoogleDrive.SearchFiles", capability: "Search files", kind: "read" },
  { service: "Google Docs", toolkit: "GoogleDocs", toolName: "GoogleDocs.SearchDocuments", capability: "Search docs", kind: "read" },
  { service: "GitHub", toolkit: "Github", toolName: "Github.GetUserOpenItems", capability: "Read assigned issues and PRs", kind: "read" },
  { service: "GitHub", toolkit: "Github", toolName: "Github.GetFileContents", capability: "Read repository files", kind: "read" },
  { service: "Slack", toolkit: "Slack", toolName: "Slack.ListConversations", capability: "List channels", kind: "read" },
  { service: "Slack", toolkit: "Slack", toolName: "Slack.GetMessages", capability: "Read messages", kind: "read" },
  { service: "Slack", toolkit: "Slack", toolName: "Slack.SendMessage", capability: "Send approved messages", kind: "write" },
  { service: "Linear", toolkit: "Linear", toolName: "Linear.GetRecentActivity", capability: "Read assigned work", kind: "read" },
  { service: "Linear", toolkit: "Linear", toolName: "Linear.CreateIssue", capability: "Create approved issues", kind: "write" }
];
const arcadeWritesEnabled = process.env.COOPER_ENABLE_ARCADE_WRITES === "true";
const notionVersion = process.env.NOTION_VERSION || "2026-03-11";
const notionSearchLimit = Number(process.env.NOTION_SEARCH_LIMIT || 5);
const notionBlockLimit = Number(process.env.NOTION_BLOCK_LIMIT || 50);
const mcpAppServers = parseMcpAppServers(
  process.env.COOPER_MCP_APP_SERVERS ||
    (arcadeMcpGatewayUrl ? JSON.stringify([{ type: "http", url: arcadeMcpGatewayUrl, serverId: "cooper-arcade" }]) : "")
);
const zoomSdkKey = process.env.ZOOM_SDK_KEY || process.env.ZOOM_CLIENT_ID || process.env.ZOOM_MEETING_SDK_KEY || "";
const zoomSdkSecret = process.env.ZOOM_SDK_SECRET || process.env.ZOOM_CLIENT_SECRET || process.env.ZOOM_MEETING_SDK_SECRET || "";
const zoomHostRoleEnabled = process.env.ZOOM_ENABLE_HOST_ROLE === "true";
const knowledgeOpenAI = createKnowledgeOpenAIClient();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: projectUploadMaxBytes }
});
const pushToTalkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: pushToTalkMaxAudioBytes }
});
const eventClients = new Set();
const operatorTimers = new Map();
const codexTaskLaunches = new Map();
const codexClient = new CodexAppServerClient({
  cwd: process.cwd(),
  preferDaemon: process.env.COOPER_CODEX_DAEMON !== "false"
});
const activeSessionChats = new Set();
let writeQueue = Promise.resolve();
let workerActive = false;
let lastGenerationAt = 0;
let arcadeClient = null;
let arcadeDiscoveryClient = null;
let todayRemoteCache = null;
let todayRemoteRefresh = null;
let dailyBriefRefresh = null;
let dailyBriefTimer = null;
let mobilePushTimer = null;
let mobilePushWorkerActive = false;
let codexReconnectPromise = null;
let codexReconnectTimer = null;

codexClient.on("request", (message) => {
  void handleCodexServerRequest(message).catch((error) => {
    console.error("Codex approval routing failed:", error);
  });
});
codexClient.on("notification", (message) => {
  void handleCodexNotification(message).catch((error) => {
    console.error("Codex event persistence failed:", error);
  });
});
codexClient.on("disconnected", ({ error }) => {
  void markCodexTasksDisconnected(error).finally(() => {
    scheduleCodexReconnect(1500);
  });
});

app.use(express.text({ type: ["application/sdp", "text/plain"], limit: "2mb" }));
app.use(express.json({ limit: "24mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "cooper" });
});

app.get("/api/auth/session", (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.post("/api/auth/login", (req, res) => {
  if (!appPassword) {
    res.status(500).json({ error: "Missing COOPER_APP_PASSWORD on the server." });
    return;
  }

  if (!safeCompare(cleanText(req.body?.password), appPassword)) {
    res.status(401).json({ error: "Invalid password." });
    return;
  }

  const expiresAt = Date.now() + sessionTtlMs;
  const token = signSession(expiresAt);
  res.setHeader("Set-Cookie", serializeCookie(cookieName, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isProduction,
    path: "/",
    maxAge: Math.floor(sessionTtlMs / 1000)
  }));
  res.json({ authenticated: true });
});

app.post("/api/auth/logout", (_req, res) => {
  res.setHeader("Set-Cookie", serializeCookie(cookieName, "", {
    httpOnly: true,
    sameSite: "Lax",
    secure: isProduction,
    path: "/",
    maxAge: 0
  }));
  res.json({ authenticated: false });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/auth/") || req.path === "/api/ingest/plan") {
    next();
    return;
  }

  if (req.path.startsWith("/api/push-to-talk/")) {
    if (isAuthenticated(req) || isPushToTalkAuthenticated(req)) {
      next();
      return;
    }
    res.status(401).json({ error: "Authentication required for push-to-talk bridge." });
    return;
  }

  if (req.path === "/session" || req.path.startsWith("/api/")) {
    if (!appPassword) {
      res.status(500).json({ error: "Missing COOPER_APP_PASSWORD on the server." });
      return;
    }

    if (!isAuthenticated(req)) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
  }

  next();
});

app.get("/.well-known/apple-app-site-association", (_req, res) => {
  if (!iosAssociatedAppId) {
    res.status(404).json({ error: "Set COOPER_IOS_ASSOCIATED_APP_ID before enabling universal links." });
    return;
  }
  res.type("application/json").send({
    applinks: {
      apps: [],
      details: [{
        appIDs: [iosAssociatedAppId],
        components: [{ "/": "/open/*", comment: "Open Cooper iOS workspace destinations." }]
      }]
    }
  });
});

app.get("/open/*", (req, res) => {
  const route = cooperRouteFromOpenPath(req.path, req.query?.approval);
  res.type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open Cooper</title><style>body{margin:0;background:#f7f7f2;color:#181916;font:17px -apple-system,BlinkMacSystemFont,sans-serif;display:grid;min-height:100vh;place-items:center}.card{max-width:32rem;padding:2rem}h1{font-size:2rem}a{display:inline-block;background:#f9df27;color:#181916;text-decoration:none;font-weight:700;padding:.9rem 1.2rem;border-radius:.7rem}</style></head><body><main class="card"><p>COOPER · AIRES SESSION OS</p><h1>Continue in Cooper</h1><p>This link opens the exact workspace destination in the iOS app. If universal links are not configured for this host yet, use the button below.</p><a href="${escapeHtml(route)}">Open Cooper</a></main></body></html>`);
});

app.get("/prototypes/session-context-overview", (_req, res) => {
  res.sendFile(join(__dirname, "docs", "cooper-session-context-overview-prototype.html"));
});

app.get("/prototypes/session-preparation-flow", (_req, res) => {
  res.sendFile(join(__dirname, "docs", "cooper-session-preparation-flow-prototype.html"));
});

app.get("/prototypes/chat-micro-ui", (_req, res) => {
  res.sendFile(join(__dirname, "docs", "cooper-chat-micro-ui-prototype.html"));
});

const baseSession = {
  type: "realtime",
  model: "gpt-realtime-2",
  instructions: cooperInstructions,
  reasoning: { effort: "low" },
  audio: {
    input: {
      noise_reduction: { type: "far_field" },
      transcription: {
        model: "gpt-4o-mini-transcribe",
        prompt: "Meeting transcript for Cooper, AIRES, CTO, CPO, product, engineering, software delivery, roadmap, calendar."
      },
      turn_detection: {
        type: "semantic_vad",
        eagerness: "low",
        create_response: false,
        interrupt_response: false
      }
    },
    output: {
      voice: "cedar"
    }
  },
  tools: cooperToolDefinitions,
  tool_choice: "auto"
};

function realtimeSession(projectContext = "") {
  return {
    ...baseSession,
    instructions: projectContext
      ? `${cooperInstructions}\n\n${projectContext}`
      : cooperInstructions
  };
}

const artifactRecipes = {
  post_call_kit: {
    title: "Post-call kit",
    outputType: "markdown",
    steps: [
      "Extract the executive signal from the transcript: decision points, risks, follow-ups, product implications, engineering implications, and unresolved questions.",
      "Turn the signal into a concise Markdown operating brief for Michael as AIRES CTO/CPO. Include sections for Summary, Decisions, Risks, Actions, Owners, Product Notes, Engineering Notes, and Calendar Follow-up.",
      "Add a final Cooper Recommendation section with the next three moves and where Cooper should ask permission before acting."
    ]
  },
  execution_plan: {
    title: "Execution plan",
    outputType: "markdown",
    steps: [
      "Identify the highest-leverage initiative or problem implied by the transcript and state the goal in one paragraph.",
      "Write a pragmatic SDLC execution plan in Markdown with phases, milestones, acceptance criteria, dependencies, risks, and review cadence. Break out any prototype, PRD, design, implementation, and validation work into concrete tasks.",
      "Add suggested Cooper follow-up work Michael can approve, including PRD creation, HTML prototype creation, and code sketch work when those are relevant."
    ]
  },
  qa_checklist: {
    title: "QA checklist",
    outputType: "markdown",
    steps: [
      "Extract the user-visible behavior, permissions, data rules, edge cases, integrations, and unresolved assumptions from the selected session context.",
      "Write a concise Markdown QA plan with acceptance checks, regression coverage, test data, role and permission scenarios, failure states, and a screenshot or evidence contract. Use Given/When/Then where it makes the expected result clearer, and mark any requirement that still needs a product decision."
    ]
  },
  follow_up: {
    title: "Follow-up summary",
    outputType: "markdown",
    steps: [
      "Summarize the meeting in a short executive memo with clear decisions and commitments.",
      "Draft follow-up bullets suitable for sending after the meeting. Keep the tone precise and executive.",
      "Add a checklist of private next actions for Michael and Cooper."
    ]
  },
  code_sketch: {
    title: "Code sketch",
    outputType: "markdown",
    steps: [
      "Find any software requirements, integration needs, architecture decisions, or automation ideas in the transcript.",
      "Write a technical implementation sketch in Markdown with data flow, components, API surfaces, risks, and test strategy.",
      "If useful, include small illustrative code snippets. Keep them scoped and label them as draft snippets."
    ]
  },
  product_requirements: {
    title: "Product requirements doc",
    outputType: "markdown",
    steps: [
      "Extract the product opportunity, target user, problem statement, success criteria, and open questions from the transcript.",
      "Write a practical PRD in Markdown with Background, Goals, Non-goals, User Stories, Functional Requirements, Edge Cases, Data/Integration Needs, Analytics, Rollout, and Acceptance Criteria.",
      "Add a prototype brief section that Cooper can use to produce a mobile-first HTML prototype, including screens, states, content hierarchy, and interaction notes."
    ]
  },
  architecture_decision_record: {
    title: "Architecture decision record",
    outputType: "markdown",
    steps: [
      "Extract the architectural decision, forces, constraints, systems, data boundaries, security concerns, and unresolved technical questions from the selected evidence. Separate sourced facts from assumptions.",
      "Compare the credible options with tradeoffs across delivery speed, maintainability, reliability, security, cost, operability, migration risk, and developer experience. Recommend one option and state what evidence could reverse it.",
      "Write a durable Markdown ADR with Status, Context, Decision Drivers, Options Considered, Decision, Consequences, Risks, Validation Plan, Rollback or Revisit Trigger, and References. Never invent measurements, owners, or commitments."
    ]
  },
  sprint_recap: {
    title: "Sprint recap",
    outputType: "markdown",
    steps: [
      "Distill sprint evidence from the meeting, selected Notion or GitHub context, completed work, active work, blockers, customer signal, and QA outcomes. Clearly distinguish observed evidence from missing data.",
      "Analyze outcomes against intended sprint goals. Identify shipped value, carryover, scope movement, quality signals, decisions, operational debt, and the highest-leverage learning.",
      "Write an executive Markdown sprint recap with Goals, Outcomes, Shipped, In Progress, Carryover, Quality and Evidence, Decisions, Risks, Learnings, and Recommended Next Sprint Focus. Include source notes and do not invent ticket state."
    ]
  },
  decision_log: {
    title: "Decision log",
    outputType: "markdown",
    steps: [
      "Extract every explicit or strongly implied decision from the selected evidence. For each, capture the decision, rationale, alternatives mentioned, owner if named, date if known, dependencies, and unresolved follow-up without inventing facts.",
      "Write a concise Markdown decision log ordered by impact. Separate Confirmed Decisions, Proposed Decisions, Revisit Triggers, and Open Questions. Add source notes so a future session can recover why each decision was made."
    ]
  },
  release_brief: {
    title: "Release brief",
    outputType: "markdown",
    steps: [
      "Extract the release scope, user-visible change, affected personas, dependencies, migrations, permissions, data behavior, risks, rollout constraints, support implications, and known gaps from the selected evidence.",
      "Build a release-readiness view covering acceptance evidence, QA status, observability, rollback, communications, ownership, and go/no-go questions. Mark missing proof explicitly.",
      "Write a practical Markdown release brief with Summary, User Impact, Scope, Readiness, QA Evidence, Rollout, Rollback, Monitoring, Support Notes, Known Issues, and Go/No-Go Checklist."
    ]
  },
  pdf_brief: {
    title: "PDF brief",
    outputType: "pdf",
    steps: [
      "Distill the selected session evidence into a concise executive brief. Preserve decisions, evidence, constraints, risks, open questions, owners, and next actions without inventing facts.",
      "Return polished Markdown for a portrait PDF. Use a short executive summary, clear section headings, concise paragraphs, and bounded bullet lists. Avoid wide tables, HTML, external assets, emoji, and markdown fences."
    ]
  },
  word_brief: {
    title: "Word brief",
    outputType: "docx",
    steps: [
      "Distill the selected session evidence into a concise executive brief. Preserve decisions, evidence, constraints, risks, open questions, owners, and next actions without inventing facts.",
      "Return polished Markdown for an editable Word brief. Use a short executive summary, clear section headings, concise paragraphs, real numbered or bulleted lists, and bounded checklists. Avoid wide tables, HTML, external assets, emoji, and markdown fences."
    ]
  },
  powerpoint_deck: {
    title: "PowerPoint decision deck",
    outputType: "pptx",
    steps: [
      "Distill the selected session evidence into a short audience-facing narrative. Preserve the outcome, decisions, evidence, constraints, readiness signals, and next action without inventing facts.",
      "Return polished Markdown for a four-slide PowerPoint decision deck. Use a concise executive summary, three to five clearly named evidence sections, bounded checklist items, and one decisive next move. Avoid tables, HTML, external assets, emoji, speaker notes, and markdown fences."
    ]
  },
  excel_action_register: {
    title: "Excel action register",
    outputType: "xlsx",
    steps: [
      "Extract concrete decisions, commitments, owners, priorities, due dates, open questions, and readiness checks from the selected session evidence. Never invent an owner or date.",
      "Return structured Markdown for an editable Excel action register. Use clear section headings and one concise list item per decision, action, risk, or open question. Add owner, priority, or YYYY-MM-DD due dates inline only when the source supplied them. Avoid HTML, wide tables, external assets, emoji, and markdown fences."
    ]
  },
  html_prototype: {
    title: "HTML prototype",
    outputType: "html",
    maxOutputTokens: 12000,
    steps: [
      "Extract the prototype request from the transcript and any additional instruction. Define the product concept, audience, primary workflow, required screens, content hierarchy, states, and mobile-first constraints.",
      "Turn the prototype brief into an implementation-ready interaction plan. Include mobile defaults, desktop expansion behavior, sample data, key UI states, and any lightweight JavaScript interactions needed for a believable prototype.",
      "Build the prototype as a complete standalone HTML document with inline CSS and small inline JavaScript. Default the design for a mobile viewport and include responsive desktop rules. Use no external assets, no external scripts, and no markdown fences. Return only the full HTML document starting with <!doctype html>."
    ]
  },
  landing_page: {
    title: "Landing page",
    outputType: "html",
    maxOutputTokens: 12000,
    steps: [
      "Extract the offer, audience, product promise, proof points, objections, CTA, and required sections from Michael's request and context. If details are missing, make conservative assumptions and label them in the copy.",
      "Create a concise page strategy: headline, supporting copy, narrative flow, feature/proof sections, CTA hierarchy, mobile-first layout, desktop expansion, and any simple interactive behavior.",
      "Build a polished standalone landing page as complete HTML with inline CSS and minimal inline JavaScript. Use a professional AIRES-adjacent visual style, responsive layout, real copy, no external assets, no external scripts, no gradients as the main design crutch, no markdown fences, and return only <!doctype html>..."
    ]
  },
  mini_app: {
    title: "Mini application prototype",
    outputType: "html",
    maxOutputTokens: 14000,
    steps: [
      "Extract the app concept, target user, primary workflow, required inputs, outputs, data states, controls, and success criteria from Michael's request and context.",
      "Design the app behavior as a small complete single-file experience: screens, state model, interactions, sample data, validation, empty/loading/error states, and responsive behavior.",
      "Build a complete standalone HTML/CSS/JS mini app with inline CSS and inline JavaScript only. Include realistic sample data, working controls, mobile-first layout, desktop layout, no external assets, no external scripts, no markdown fences, and return only <!doctype html>..."
    ]
  },
  executive_report: {
    title: "Executive report",
    outputType: "html",
    maxOutputTokens: 14000,
    steps: [
      "Distill the source context into the executive story: situation, stakes, decision points, evidence, product implications, engineering implications, risks, open questions, and recommended next moves.",
      "Structure a board-quality report with executive summary, context, findings, recommendations, roadmap, risks, decision log, action plan, and appendix/source notes. Keep assumptions clearly labeled.",
      "Build a complete standalone HTML report with inline CSS, print-friendly layout, table/card sections, clear hierarchy, professional AIRES-style typography, Export PDF button wired to window.print(), no external scripts, no stock imagery, no markdown fences, and return only <!doctype html>..."
    ]
  },
  mermaid_diagram: {
    title: "Mermaid diagram",
    outputType: "markdown",
    steps: [
      "Extract the system, workflow, architecture, user journey, or decision process that Michael wants visualized. Choose the most useful Mermaid diagram type: flowchart, sequenceDiagram, stateDiagram-v2, journey, or classDiagram.",
      "Return a concise Markdown artifact with a short title, a one-paragraph explanation, and one valid fenced Mermaid block. The Mermaid block must be syntactically valid and readable on mobile. Add a short 'How to read this' section after the diagram."
    ]
  },
  ui_wireframe: {
    title: "UI wireframe",
    outputType: "html",
    maxOutputTokens: 10000,
    steps: [
      "Extract the interface, workflow, or prototype idea Michael wants to visualize. Define the target user, primary job, core screens, content hierarchy, states, and mobile-first constraints.",
      "Build a complete standalone HTML wireframe with inline CSS and small inline JavaScript if useful. Default to a mobile viewport, use a deliberate low-fidelity grayscale wireframe style, include realistic labels/content, and add responsive desktop rules. Use no external assets, no external scripts, and no markdown fences. Return only the full HTML document starting with <!doctype html>."
    ]
  },
  aires_requirements: {
    title: "AIRES scoped requirements",
    outputType: "html",
    maxOutputTokens: 14000,
    steps: [
      "Capture and distill the source context using the AIRES Requirements Framework. Preserve vivid user phrases, identify the core problem, goal, stakeholders, current state, desired state, constraints, source material, success metric, and a short 5-whys check. Mark assumptions clearly.",
      "Scope and slice the work. Produce in scope, out of scope now, and non-goals; data, edge cases, failure modes, constraints, and non-functionals; MoSCoW prioritization with real Won't/deferred boundaries; vertical INVEST slices that are small, valuable, and testable; Given/When/Then acceptance criteria; and a Definition of Ready checklist.",
      "Return a complete standalone AIRES-branded HTML scoped requirements artifact starting with <!doctype html>. Use inline CSS only. Follow the AIRES design system: warm grey page, white portrait document around 900px, soft-black header with a 3px Volt rule, Converge mark SVG, Aires wordmark, Export PDF button wired to window.print(), footer with © Aires Technology Inc., section kickers, scope cards, MoSCoW pills, slice table, Given/When/Then blocks, and Definition of Ready checklist. Use Urbanist/Inter/IBM Plex Mono fallbacks, no gradients, no stock imagery, no emoji, no pure black, no markdown fences, no external scripts."
    ]
  }
};

app.post("/session", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).type("text/plain").send("Missing OPENAI_API_KEY on the server.");
    return;
  }

  const sdp = req.body;
  if (!sdp || typeof sdp !== "string") {
    res.status(400).type("text/plain").send("Expected raw SDP body.");
    return;
  }

  const projectId = cleanText(req.query?.projectId);
  const callId = cleanText(req.query?.callId);
  const db = projectId || callId ? await readDb() : null;
  const call = db && callId ? db.calls.find((item) => item.id === callId) : null;
  const resolvedProjectId = projectId || call?.projectId || "";
  const sessionContext = call
    ? buildLiveCallContext(db, call).sessionContext
    : composeRealtimeSessionContext(db && resolvedProjectId ? buildProjectContext(db, resolvedProjectId) : "");

  const fd = new FormData();
  fd.set("sdp", sdp);
  fd.set("session", JSON.stringify(realtimeSession(sessionContext)));

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Safety-Identifier": "cooper-local-dev"
      },
      body: fd
    });

    const answerSdp = await response.text();

    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      const requestId = response.headers.get("x-request-id") || response.headers.get("openai-request-id");
      if (retryAfter) res.setHeader("Retry-After", retryAfter);
      if (requestId) res.setHeader("X-OpenAI-Request-ID", requestId);
      res.status(response.status).type("text/plain").send(answerSdp);
      return;
    }

    const location = response.headers.get("Location");
    if (location) {
      res.setHeader("X-OpenAI-Call-Location", location);
    }

    res.type("application/sdp").send(answerSdp);
  } catch (error) {
    console.error("Realtime session error:", error);
    res.status(500).type("text/plain").send("Failed to create Realtime session.");
  }
});

app.get("/api/state", async (_req, res) => {
  const db = await readDb();
  res.json(publicState(db));
});

app.get("/api/knowledge/documents", async (req, res) => {
  const db = await readDb();
  res.json({
    documents: knowledgeLibrary(db, {
      query: cleanText(req.query.query),
      filter: cleanText(req.query.filter) || "all",
      sort: cleanText(req.query.sort) || "updated"
    }),
    retrieval: {
      configured: knowledgeOpenAI.configured,
      vectorStoreConfigured: Boolean(db.knowledgeConfig?.vectorStoreId || knowledgeOpenAI.vectorStoreId),
      model: knowledgeOpenAI.model
    }
  });
});

app.post("/api/knowledge/documents", async (req, res) => {
  const document = await updateDb((db) => createStoredKnowledgeDocument(db, {
    templateId: cleanText(req.body?.templateId),
    type: cleanText(req.body?.type),
    title: cleanText(req.body?.title),
    project: cleanText(req.body?.project) || "Personal",
    owner: "You"
  }));
  res.status(201).json({ document });
});

app.get("/api/knowledge/documents/:id", async (req, res) => {
  const db = await readDb();
  const document = findKnowledgeDocument(db, req.params.id);
  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  res.json({ document: publicKnowledgeDocument(db, document) });
});

app.patch("/api/knowledge/documents/:id", async (req, res) => {
  const patch = knowledgeDocumentPatch(req.body);
  let conflict = null;
  const expectedVersionId = cleanText(req.body?.expectedVersionId);
  const document = await updateDb((db) => {
    const current = findKnowledgeDocument(db, req.params.id);
    if (current && expectedVersionId && current.currentVersionId !== expectedVersionId) {
      conflict = publicKnowledgeDocument(db, current);
      return null;
    }
    return updateStoredKnowledgeDocument(db, req.params.id, patch, {
      actor: "You",
      saveVersion: req.body?.saveVersion !== false
    });
  });
  if (conflict) {
    res.status(409).json({ error: "This document changed in another tab. Reloaded the newest saved version.", document: conflict });
    return;
  }
  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  res.json({ document });
});

app.delete("/api/knowledge/documents/:id", async (req, res) => {
  const before = await readDb();
  const current = findKnowledgeDocument(before, req.params.id);
  const record = current ? activeKnowledgeIndexRecord(before, current.id) : null;
  const document = await updateDb((db) => updateStoredKnowledgeDocument(db, req.params.id, {
    lifecycle: "archived",
    visibility: "private",
    sessionId: "",
    indexStatus: record ? "removing" : "not-indexed",
    indexError: ""
  }, { actor: "You", saveVersion: true }));
  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  if (!record) {
    res.json({ document });
    return;
  }
  try {
    await knowledgeOpenAI.removeIndexedVersion({ record, currentVectorStoreId: before.knowledgeConfig?.vectorStoreId || "" });
    const updated = await updateDb((db) => {
      createKnowledgeIndexRecord(db, { ...record, documentId: req.params.id, versionId: record.versionId, status: "removed" });
      return publicKnowledgeDocument(db, findKnowledgeDocument(db, req.params.id));
    });
    res.json({ document: updated });
  } catch (error) {
    const updated = await updateDb((db) => {
      createKnowledgeIndexRecord(db, { ...record, documentId: req.params.id, versionId: record.versionId, status: "remove-failed", error: error.message });
      return publicKnowledgeDocument(db, findKnowledgeDocument(db, req.params.id));
    });
    res.status(202).json({ document: updated, warning: "The document is archived and blocked from retrieval; provider cleanup will need retrying." });
  }
});

app.post("/api/knowledge/documents/:id/versions/:versionId/restore", async (req, res) => {
  const document = await updateDb((db) => restoreStoredKnowledgeVersion(db, req.params.id, req.params.versionId, { actor: "You" }));
  if (!document) {
    res.status(404).json({ error: "Document or version not found." });
    return;
  }
  res.json({ document });
});

app.post("/api/knowledge/documents/:id/session", async (req, res) => {
  const active = req.body?.active !== false;
  const document = await updateDb((db) => setKnowledgeSession(db, req.params.id, active));
  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  res.json({ document });
});

app.post("/api/knowledge/documents/:id/chat", async (req, res) => {
  const message = cleanText(req.body?.message).slice(0, 12_000);
  if (!message) {
    res.status(400).json({ error: "A message is required." });
    return;
  }
  const db = await readDb();
  const document = findKnowledgeDocument(db, req.params.id);
  const session = document && db.knowledgeSessions.find((item) => item.id === document.sessionId && item.status === "active");
  const version = document && db.knowledgeVersions.find((item) => item.id === document.currentVersionId);
  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  if (!session) {
    res.status(409).json({ error: "Start Cooper with this document before sending a message." });
    return;
  }
  await updateDb((nextDb) => addKnowledgeMessage(nextDb, {
    documentId: document.id,
    sessionId: session.id,
    role: "user",
    text: message
  }));
  try {
    const response = await knowledgeOpenAI.chat({
      document,
      version,
      message,
      previousResponseId: session.previousResponseId,
      currentVectorStoreId: db.knowledgeConfig?.vectorStoreId || "",
      authorizedDocumentIds: db.knowledgeDocuments.filter(canRetrieveKnowledgeDocument).map((item) => item.id)
    });
    const updated = await updateDb((nextDb) => {
      addKnowledgeMessage(nextDb, {
        documentId: document.id,
        sessionId: session.id,
        role: "assistant",
        text: response.text,
        citations: response.citations,
        responseId: response.id
      });
      setKnowledgeSessionResponse(nextDb, session.id, response.id);
      return publicKnowledgeDocument(nextDb, findKnowledgeDocument(nextDb, document.id));
    });
    res.json({ document: updated, response: { id: response.id, text: response.text, citations: response.citations } });
  } catch (error) {
    const status = error instanceof KnowledgeOpenAIError ? error.status : 500;
    res.status(status).json({ error: error.message || "Cooper could not respond to this document." });
  }
});

app.post("/api/knowledge/documents/:id/publish", async (req, res) => {
  const publishing = req.body?.published !== false;
  const before = await readDb();
  const current = findKnowledgeDocument(before, req.params.id);
  if (!current) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  if (!publishing) {
    const record = activeKnowledgeIndexRecord(before, current.id);
    const document = await updateDb((db) => updateStoredKnowledgeDocument(db, current.id, {
      lifecycle: req.body?.visibility === "private" ? "private" : "shared",
      visibility: ["private", "team", "workspace"].includes(req.body?.visibility) ? req.body.visibility : "team",
      indexStatus: record ? "removing" : "not-indexed",
      indexError: "",
      indexRecordId: record?.id || ""
    }, { actor: "You", saveVersion: true }));
    try {
      if (record) await knowledgeOpenAI.removeIndexedVersion({
        record,
        currentVectorStoreId: before.knowledgeConfig?.vectorStoreId || ""
      });
      const updated = await updateDb((db) => {
        const next = updateStoredKnowledgeDocument(db, current.id, { indexStatus: "not-indexed", indexError: "", indexRecordId: "" }, { actor: "You", saveVersion: false });
        if (record) createKnowledgeIndexRecord(db, {
          documentId: current.id,
          versionId: current.currentVersionId,
          status: "removed",
          vectorStoreId: before.knowledgeConfig?.vectorStoreId || "",
          fileId: record.fileId,
          vectorStoreFileId: record.vectorStoreFileId
        });
        return next;
      });
      res.json({ document: updated });
    } catch (error) {
      const updated = await updateDb((db) => updateStoredKnowledgeDocument(db, current.id, { indexStatus: "remove-failed", indexError: error.message }, { actor: "You", saveVersion: false }));
      res.status(202).json({ document: updated || document, warning: "The document is already blocked from retrieval; provider cleanup will need retrying." });
    }
    return;
  }

  const prepared = await updateDb((db) => updateStoredKnowledgeDocument(db, current.id, {
    lifecycle: "published",
    visibility: ["team", "workspace"].includes(req.body?.visibility) ? req.body.visibility : "workspace",
    indexStatus: knowledgeOpenAI.configured ? "indexing" : "not-configured",
    indexError: ""
  }, { actor: "You", saveVersion: true }));
  const indexDb = await readDb();
  const source = findKnowledgeDocument(indexDb, current.id);
  const version = indexDb.knowledgeVersions.find((item) => item.id === source.currentVersionId);
  try {
    const result = await knowledgeOpenAI.indexVersion({
      document: source,
      version,
      currentVectorStoreId: indexDb.knowledgeConfig?.vectorStoreId || ""
    });
    const document = await updateDb((db) => {
      createKnowledgeIndexRecord(db, {
        documentId: source.id,
        versionId: version.id,
        status: result.status,
        vectorStoreId: result.vectorStoreId,
        fileId: result.fileId,
        vectorStoreFileId: result.vectorStoreFileId
      });
      return publicKnowledgeDocument(db, findKnowledgeDocument(db, source.id));
    });
    res.json({ document });
  } catch (error) {
    const document = await updateDb((db) => {
      createKnowledgeIndexRecord(db, {
        documentId: source.id,
        versionId: version.id,
        status: "failed",
        vectorStoreId: indexDb.knowledgeConfig?.vectorStoreId || "",
        error: error.message
      });
      return publicKnowledgeDocument(db, findKnowledgeDocument(db, source.id));
    });
    res.status(502).json({ error: error.message || "Could not index the published document.", document });
  }
});

app.get("/api/knowledge/documents/:id/index-status", async (req, res) => {
  const before = await readDb();
  const current = findKnowledgeDocument(before, req.params.id);
  if (!current) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  const record = activeKnowledgeIndexRecord(before, current.id);
  if (current.lifecycle !== "published" || !record || record.status !== "indexing") {
    res.json({ document: publicKnowledgeDocument(before, current) });
    return;
  }
  try {
    const result = await knowledgeOpenAI.getIndexStatus({
      record,
      currentVectorStoreId: before.knowledgeConfig?.vectorStoreId || ""
    });
    const document = await updateDb((db) => updateKnowledgeIndexRecord(db, record.id, result));
    res.json({ document: document || publicKnowledgeDocument(before, current) });
  } catch (error) {
    const document = await updateDb((db) => updateKnowledgeIndexRecord(db, record.id, { status: "failed", error: error.message }));
    res.status(502).json({ error: error.message || "Could not refresh retrieval status.", document });
  }
});

app.get("/api/knowledge/documents/:id/export", async (req, res) => {
  const db = await readDb();
  const document = findKnowledgeDocument(db, req.params.id);
  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  const format = cleanText(req.query.format) || "markdown";
  const filename = `${document.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "document"}`;
  if (format === "html" && document.type === "document") {
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}.html\"`);
    res.type("html").send(`<!doctype html><html><head><meta charset=\"utf-8\"><title>${escapeHtml(document.title)}</title></head><body>${document.html}</body></html>`);
    return;
  }
  if (format === "pdf") {
    try {
      const buffer = await renderArtifactPdf({
        title: document.title,
        content: document.markdown,
        createdAt: document.updatedAt,
        label: "KNOWLEDGE DOCUMENT",
        subject: "Exported Cooper knowledge document"
      });
      res.setHeader("Content-Disposition", `attachment; filename=\"${filename}.pdf\"`);
      res.type("application/pdf").send(buffer);
    } catch (error) {
      console.error("Knowledge PDF export failed:", error);
      res.status(500).json({ error: "Could not export this document as PDF." });
    }
    return;
  }
  if (format === "text") {
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}.txt\"`);
    res.type("text/plain").send(document.plainText);
    return;
  }
  res.setHeader("Content-Disposition", `attachment; filename=\"${filename}.md\"`);
  res.type("text/markdown").send(document.markdown);
});

app.get("/api/today", async (req, res) => {
  try {
    const db = await readDb();
    const remote = await getTodayRemoteSources({ force: req.query.refresh === "1" });
    const projects = normalizeLocalProjects(
      db.projects.map((project) => publicProject(
        project,
        db.projectSources.filter((source) => source.projectId === project.id)
      ))
    ).slice(0, 10);
    const sessions = normalizePastSessions(db.calls, { limit: 8, timeZone: todayTimeZone });

    res.json({
      updatedAt: remote.updatedAt,
      expiresAt: remote.expiresAt,
      timeZone: todayTimeZone,
      date: remote.date,
      meetings: remote.calendar.items,
      tasks: remote.notion.items,
      projects,
      sessions,
      sprint: remote.notion.sprint || null,
      sources: {
        calendar: remote.calendar.source,
        notion: remote.notion.source,
        projects: {
          status: "connected",
          label: "Cooper projects",
          count: projects.length,
          message: projects.length ? "Saved project context is available." : "No active projects yet."
        },
        sessions: {
          status: "connected",
          label: "Cooper sessions",
          count: sessions.length,
          message: sessions.length ? "Saved sessions are available to resume." : "No ended sessions yet."
        }
      }
    });
  } catch (error) {
    console.error("Today feed error:", error);
    res.status(500).json({ error: error.message || "Could not load Today." });
  }
});

app.get("/api/daily-brief", async (req, res) => {
  try {
    const force = req.query.refresh === "1";
    const date = zonedDayBounds(new Date(), todayTimeZone).date;
    const db = await readDb();
    const saved = db.dailyBriefs.find((brief) => brief.date === date);
    const brief = force || !saved
      ? await refreshDailyBrief({ trigger: force ? "manual" : "on_demand", force: true })
      : saved;
    res.json({ brief });
  } catch (error) {
    console.error("Daily brief error:", error);
    res.status(500).json({ error: error.message || "Could not load the daily brief." });
  }
});

app.post("/api/daily-brief/refresh", async (_req, res) => {
  try {
    const brief = await refreshDailyBrief({ trigger: "manual", force: true });
    res.json({ brief });
  } catch (error) {
    console.error("Daily brief refresh error:", error);
    res.status(500).json({ error: error.message || "Could not refresh the daily brief." });
  }
});

app.get("/api/zoom/config", (_req, res) => {
  res.json({
    configured: Boolean(zoomSdkKey && zoomSdkSecret),
    sdkKey: zoomSdkKey || "",
    hostRoleEnabled: zoomHostRoleEnabled
  });
});

app.post("/api/zoom/signature", (req, res) => {
  if (!zoomSdkKey || !zoomSdkSecret) {
    res.status(500).json({ error: "Missing ZOOM_SDK_KEY and ZOOM_SDK_SECRET on the server." });
    return;
  }

  const meetingNumber = normalizeZoomMeetingNumber(req.body?.meetingNumber);
  const role = Number(req.body?.role || 0) === 1 ? 1 : 0;

  if (!meetingNumber) {
    res.status(400).json({ error: "A Zoom meeting number is required." });
    return;
  }

  if (role === 1 && !zoomHostRoleEnabled) {
    res.status(403).json({ error: "Starting as host is disabled. Join as participant or enable ZOOM_ENABLE_HOST_ROLE with a ZAK flow." });
    return;
  }

  res.json({
    sdkKey: zoomSdkKey,
    meetingNumber,
    role,
    signature: generateZoomMeetingSdkSignature({
      meetingNumber,
      role,
      sdkKey: zoomSdkKey,
      sdkSecret: zoomSdkSecret
    })
  });
});

app.get("/api/operator/state", async (_req, res) => {
  const db = await readDb();
  res.json(publicOperatorState(db));
});

app.get("/api/mobile-push/status", async (_req, res) => {
  const db = await readDb();
  res.json({ mobilePush: publicMobilePushStatus(db) });
});

app.get("/api/mobile-readiness", async (_req, res) => {
  const db = await readDb();
  res.json({ readiness: publicMobileReadiness(db) });
});

app.post("/api/mobile-push/devices", async (req, res) => {
  const result = await updateDb((db) => {
    const registration = registerMobilePushDevice(db.mobilePushDevices, req.body || {});
    if (registration.error) return registration;
    db.mobilePushDevices = registration.devices;
    return registration;
  });
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  scheduleMobilePushWorker(100);
  const db = await readDb();
  res.status(201).json({ device: publicMobilePushDevice(result.device), mobilePush: publicMobilePushStatus(db) });
});

app.post("/api/mobile-push/devices/unregister", async (req, res) => {
  const result = await updateDb((db) => {
    const removal = unregisterMobilePushDevice(db.mobilePushDevices, req.body || {});
    db.mobilePushDevices = removal.devices;
    return removal;
  });
  res.json({ removed: result.removed, mobilePush: publicMobilePushStatus(await readDb()) });
});

app.post("/api/operator/tasks", async (req, res) => {
  const task = createOperatorTask({
    skill: req.body?.skill,
    title: req.body?.title,
    goal: req.body?.goal,
    targetUrl: req.body?.targetUrl,
    allowedDomains: req.body?.allowedDomains,
    artifactKinds: req.body?.artifactKinds,
    templateIds: req.body?.templateIds,
    computerIntent: req.body?.computerIntent,
    workspacePath: req.body?.workspacePath || req.body?.workspace_path,
    codexModel: req.body?.codexModel || req.body?.codex_model,
    budgets: req.body?.budgets
  });

  await updateDb((db) => {
    db.operatorTasks = Array.isArray(db.operatorTasks) ? db.operatorTasks : [];
    db.operatorTasks.push(task);
  });
  scheduleOperatorTask(task.id, 250);

  res.status(202).json({ task: operatorTaskPublic(task) });
});

app.post("/api/operator/tasks/:id/approve", async (req, res) => {
  const approvalId = cleanText(req.body?.approvalId);
  const snapshot = await readDb();
  const snapshotTask = snapshot.operatorTasks?.find((item) => item.id === req.params.id);
  if (!snapshotTask) {
    res.status(404).json({ error: "Operator task not found." });
    return;
  }
  const snapshotApproval = approvalId
    ? snapshotTask.approvals.find((item) => item.id === approvalId)
    : snapshotTask.approvals.find((item) => item.status === "pending");
  if (!snapshotApproval) {
    res.status(400).json({ error: "No pending approval found.", task: operatorTaskPublic(snapshotTask) });
    return;
  }

  if (snapshotApproval.runtimeMethod && (snapshotApproval.runtimeRequestId === null || snapshotApproval.runtimeRequestId === undefined)) {
    res.status(409).json({
      error: "Codex is reconnecting this approval request. Try again when the task connection is restored.",
      task: operatorTaskPublic(snapshotTask)
    });
    return;
  }

  if (snapshotApproval.runtimeRequestId !== null && snapshotApproval.runtimeRequestId !== undefined) {
    try {
      await codexClient.connect();
      codexClient.respond(snapshotApproval.runtimeRequestId, codexApprovalResponse(snapshotApproval));
    } catch (error) {
      res.status(502).json({
        error: `Codex approval could not be delivered yet: ${error.message}`,
        task: operatorTaskPublic(snapshotTask)
      });
      return;
    }
  }

  const result = await updateDb((db) => {
    const task = db.operatorTasks?.find((item) => item.id === req.params.id);
    if (!task) return null;
    const approval = approvalId
      ? task.approvals.find((item) => item.id === approvalId)
      : task.approvals.find((item) => item.status === "pending");
    if (!approval || approval.status !== "pending") return { task, error: "No pending approval found." };
    const now = new Date().toISOString();
    approval.status = "approved";
    approval.resolvedAt = now;
    task.status = "running";
    task.updatedAt = now;
    task.logs.push(createOperatorLog("approval.approved", "Approval granted", approval.title, now));
    return { task };
  });

  if (!result) {
    res.status(404).json({ error: "Operator task not found." });
    return;
  }
  if (result.error) {
    res.status(400).json({ error: result.error, task: operatorTaskPublic(result.task) });
    return;
  }

  if (!snapshotApproval.runtimeMethod) scheduleOperatorTask(result.task.id, 250);
  res.json({ task: operatorTaskPublic(result.task) });
});

app.post("/api/operator/tasks/:id/cancel", async (req, res) => {
  const cancelSnapshot = await readDb();
  const cancelTask = cancelSnapshot.operatorTasks?.find((item) => item.id === req.params.id);
  if (cancelTask?.skill === "codex_app_server") {
    await interruptCodexTask(cancelTask).catch((error) => {
      console.warn("Codex interrupt failed during task cancellation:", error.message);
    });
  }
  const task = await updateDb((db) => {
    const item = db.operatorTasks?.find((candidate) => candidate.id === req.params.id);
    if (!item) return null;
    const now = new Date().toISOString();
    item.status = "cancelled";
    item.stoppedAt = now;
    item.updatedAt = now;
    item.logs.push(createOperatorLog("cancelled", "Task cancelled", "Michael cancelled this local Operator task.", now));
    item.approvals.forEach((approval) => {
      if (approval.status === "pending") {
        approval.status = "cancelled";
        approval.resolvedAt = now;
      }
    });
    return item;
  });

  if (!task) {
    res.status(404).json({ error: "Operator task not found." });
    return;
  }

  clearOperatorTimer(task.id);
  res.json({ task: operatorTaskPublic(task) });
});

app.post("/api/operator/stop-all", async (_req, res) => {
  const stopSnapshot = await readDb();
  const codexTasks = (stopSnapshot.operatorTasks || [])
    .filter((task) => task.skill === "codex_app_server" && isOperatorTaskActive(task));
  await Promise.all(codexTasks.map((task) => interruptCodexTask(task).catch(() => null)));
  const stopped = await updateDb((db) => {
    const now = new Date().toISOString();
    const tasks = (db.operatorTasks || []).filter(isOperatorTaskActive);
    tasks.forEach((task) => {
      task.status = "stopped";
      task.stoppedAt = now;
      task.updatedAt = now;
      task.logs.push(createOperatorLog("stopped", "STOP ALL pressed", "All active local Operator work was stopped immediately.", now));
      task.approvals.forEach((approval) => {
        if (approval.status === "pending") {
          approval.status = "cancelled";
          approval.resolvedAt = now;
        }
      });
      clearOperatorTimer(task.id);
    });
    return tasks;
  });

  res.json({ stopped: stopped.map(operatorTaskPublic) });
});

app.get("/api/codex/runtime", async (_req, res) => {
  if (!codexClient.connected) {
    await codexClient.connect().catch(() => null);
  }
  const db = await readDb();
  const tasks = sortByDate(db.operatorTasks || [])
    .filter((task) => task.skill === "codex_app_server")
    .map((task) => publicOperatorTask(task, db));
  res.json({
    connected: codexClient.connected,
    transportMode: codexClient.transportMode,
    lastError: codexClient.lastError,
    durableDaemon: ["daemon-proxy", "detached-socket"].includes(codexClient.transportMode),
    tasks
  });
});

app.post("/api/codex/tasks/:id/continue", async (req, res) => {
  const prompt = cleanText(req.body?.prompt);
  if (!prompt) {
    res.status(400).json({ error: "A follow-up prompt is required." });
    return;
  }
  const db = await readDb();
  const task = db.operatorTasks?.find((item) => item.id === req.params.id && item.skill === "codex_app_server");
  if (!task) {
    res.status(404).json({ error: "Codex task not found." });
    return;
  }
  if (!task.runtime?.threadId) {
    res.status(409).json({ error: "This Codex task does not have a thread yet." });
    return;
  }

  try {
    await codexClient.resumeThread(task.runtime.threadId, { includeTurns: false });
    const turn = await codexClient.startTurn(task.runtime.threadId, prompt, {
      cwd: task.workspacePath || task.runtime.cwd || resolveCodexWorkspace(""),
      model: task.codexModel || task.runtime.model || undefined
    });
    const updated = await updateDb((nextDb) => {
      const item = nextDb.operatorTasks?.find((candidate) => candidate.id === task.id);
      if (!item) return null;
      const now = new Date().toISOString();
      item.status = "running";
      item.completedAt = null;
      item.error = "";
      item.runtime.turnId = cleanText(turn?.turn?.id);
      item.runtime.threadStatus = "active";
      item.runtime.connectionStatus = "connected";
      item.runtime.lastEventAt = now;
      item.updatedAt = now;
      item.logs.push(createOperatorLog("codex.turn.started", "Codex follow-up started", prompt, now));
      return item;
    });
    res.status(202).json({ task: operatorTaskPublic(updated) });
  } catch (error) {
    res.status(502).json({ error: `Could not continue Codex task: ${error.message}` });
  }
});

app.post("/api/computer-use/tool-log", (req, res) => {
  logLocalComputerTool(cleanText(req.body?.phase) || "realtime", cleanText(req.body?.name), req.body?.arguments || {});
  res.json({ ok: true });
});

app.post("/api/computer-use/tool", async (req, res) => {
  const name = cleanText(req.body?.name);
  if (!localComputerToolNames.includes(name)) {
    res.status(400).json({ error: `Unknown local computer tool: ${name || "(missing)"}` });
    return;
  }

  const output = await executeLocalComputerTool(name, isPlainObject(req.body?.arguments) ? req.body.arguments : {}, {
    env: process.env
  });
  res.status(output.status === "error" ? 500 : 200).json({ output });
});

app.get("/api/push-to-talk/config", (_req, res) => {
  res.json({ pushToTalk: pushToTalkConfigFromEnv(process.env) });
});

app.post("/api/push-to-talk/utterance", pushToTalkUpload.single("audio"), async (req, res) => {
  if (!req.file?.buffer?.length) {
    res.status(400).json({ error: "Upload an audio file in the multipart field named audio." });
    return;
  }

  try {
    const transcript = await transcribePushToTalkAudio(req.file);
    const result = await routePushToTalkTranscript(transcript, {
      workspace: cleanText(req.body?.workspace),
      source: cleanText(req.body?.source) || "macos_hotkey"
    });
    const payload = {
      status: "completed",
      transcript,
      ...result
    };
    broadcastEvent("push-to-talk.completed", payload);
    res.json(payload);
  } catch (error) {
    const payload = {
      status: "error",
      message: error.message || "Push-to-talk failed."
    };
    broadcastEvent("push-to-talk.completed", payload);
    res.status(500).json(payload);
  }
});

app.get("/api/aires/examples", (_req, res) => {
  res.json({ examples: getAiresExampleList() });
});

app.get("/api/aires/examples/:id", async (req, res) => {
  try {
    const example = await getAiresExampleDocument(req.params.id);
    if (!example) {
      res.status(404).json({ error: "AIRES example not found." });
      return;
    }
    res.json({ example });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load AIRES example." });
  }
});

app.post("/api/projects", async (req, res) => {
  const title = cleanText(req.body?.title);
  if (!title) {
    res.status(400).json({ error: "Project title is required." });
    return;
  }

  const now = new Date().toISOString();
  const project = {
    id: randomUUID(),
    title,
    description: cleanText(req.body?.description),
    status: "active",
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null
  };

  await updateDb((db) => {
    db.projects.push(project);
  });

  res.status(201).json({ project: publicProject(project, []) });
});

app.patch("/api/projects/:id", async (req, res) => {
  const project = await updateDb((db) => {
    const item = db.projects.find((candidate) => candidate.id === req.params.id);
    if (!item) return null;
    if (typeof req.body?.title === "string") item.title = cleanText(req.body.title) || item.title;
    if (typeof req.body?.description === "string") item.description = cleanText(req.body.description);
    if (typeof req.body?.status === "string") item.status = cleanText(req.body.status) || item.status;
    item.updatedAt = new Date().toISOString();
    return item;
  });

  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const db = await readDb();
  res.json({ project: publicProject(project, db.projectSources.filter((source) => source.projectId === project.id)) });
});

app.get("/api/projects/:id/context", async (req, res) => {
  const db = await readDb();
  const project = db.projects.find((item) => item.id === req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.json({ context: buildProjectContext(db, project.id), project: publicProject(project, db.projectSources.filter((source) => source.projectId === project.id)) });
});

app.post("/api/projects/:id/sources", async (req, res) => {
  const content = cleanText(req.body?.content);
  if (!content) {
    res.status(400).json({ error: "Project source content is required." });
    return;
  }

  const source = await addProjectSource(req.params.id, {
    title: cleanText(req.body?.title) || "Pasted agent output",
    sourceType: cleanText(req.body?.sourceType) || "paste",
    mimeType: "text/plain",
    originalName: "",
    content,
    externalId: cleanText(req.body?.externalId)
  });

  if (!source) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  res.status(201).json({ source: publicProjectSource(source) });
});

app.post("/api/projects/:id/uploads", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Upload a Markdown, text, or PDF file." });
    return;
  }

  try {
    const extracted = await extractProjectUpload(file);
    const source = await addProjectSource(req.params.id, {
      title: cleanText(req.body?.title) || extracted.title,
      sourceType: extracted.sourceType,
      mimeType: file.mimetype || extracted.mimeType,
      originalName: file.originalname || extracted.title,
      content: extracted.content
    });

    if (!source) {
      res.status(404).json({ error: "Project not found." });
      return;
    }

    res.status(201).json({ source: publicProjectSource(source) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not ingest uploaded file." });
  }
});

app.get("/api/context-sources/search", async (req, res) => {
  const provider = normalizeContextProvider(req.query?.provider);
  if (!["notion", "github", "meeting"].includes(provider)) {
    res.status(400).json({ error: "Choose Notion, GitHub, or meeting notes as the context provider." });
    return;
  }

  const requestedLimit = Number(req.query?.limit);
  const options = {
    query: cleanText(req.query?.query),
    type: cleanText(req.query?.type) || "all",
    repository: cleanText(req.query?.repository) || "all",
    databaseId: extractNotionId(req.query?.databaseId || ""),
    limit: provider === "notion" && requestedLimit === -1
      ? -1
      : clampNumber(req.query?.limit, 1, 100, contextSearchLimit)
  };

  try {
    const result = await searchContextSources(provider, options);
    if (result.status !== "completed") {
      res.status(contextSourceFailureStatus(result.status)).json({
        provider,
        status: result.status,
        message: result.message || "This context provider is not ready.",
        authorizationUrl: result.authorizationUrl || null,
        mappingEnv: result.mappingEnv || null,
        results: []
      });
      return;
    }

    res.json({
      provider,
      query: options.query,
      source: result.source || "local",
      results: result.results,
      repositories: [...new Set(result.results.map((item) => item.repository).filter(Boolean))].sort()
    });
  } catch (error) {
    res.status(500).json({ provider, error: error.message || "Context search failed.", results: [] });
  }
});

app.post("/api/context-packets", async (req, res) => {
  const selected = (Array.isArray(req.body?.sources) ? req.body.sources : [])
    .map(normalizeSelectedContextSource)
    .filter(Boolean)
    .slice(0, 20);
  const db = await readDb();
  const resolvedSources = [];

  for (const source of selected) {
    resolvedSources.push(await resolveContextPacketSource(source, db));
  }

  const now = new Date().toISOString();
  const packet = buildContextPacket({
    id: randomUUID(),
    meeting: req.body?.meeting,
    intent: cleanText(req.body?.intent),
    sources: resolvedSources,
    createdAt: now,
    updatedAt: now
  }, { maxChars: contextPacketMaxChars });

  await updateDb((nextDb) => {
    nextDb.contextPackets.push(packet);
  });

  res.status(201).json({
    packet: publicContextPacket(packet),
    sessionContext: packet.context
  });
});

app.get("/api/context-packets/:id", async (req, res) => {
  const db = await readDb();
  const packet = db.contextPackets.find((item) => item.id === req.params.id);
  if (!packet) {
    res.status(404).json({ error: "Context packet not found." });
    return;
  }
  res.json({ packet: publicContextPacket(packet), sessionContext: packet.context });
});

app.post("/api/context-packets/:id/uploads", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Upload a Markdown, text, or PDF file." });
    return;
  }

  try {
    const extracted = await extractProjectUpload(req.file);
    const now = new Date().toISOString();
    const result = await updateDb((db) => {
      const index = db.contextPackets.findIndex((item) => item.id === req.params.id);
      if (index < 0) return null;
      const current = db.contextPackets[index];
      const uploadedSource = {
        id: randomUUID(),
        provider: "file",
        type: "file",
        title: cleanText(req.body?.title) || extracted.title,
        meta: `${extracted.sourceType.toUpperCase()} upload`,
        content: extracted.content,
        updatedAt: now,
        resolutionStatus: "completed"
      };
      const next = buildContextPacket({
        ...current,
        sources: [...(current.sources || []), uploadedSource],
        updatedAt: now
      }, { maxChars: contextPacketMaxChars });
      db.contextPackets[index] = next;
      return next;
    });

    if (!result) {
      res.status(404).json({ error: "Context packet not found." });
      return;
    }

    res.status(201).json({ packet: publicContextPacket(result), sessionContext: result.context });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not ingest uploaded context." });
  }
});

app.get("/api/tools/arcade/status", async (_req, res) => {
  const db = await readDb();
  res.json(arcadeSettingsState(db));
});

app.get("/api/tools/arcade/discovery", async (_req, res) => {
  try {
    res.json(await arcadeDiscoveryState());
  } catch (error) {
    res.status(500).json({
      configured: Boolean(process.env.ARCADE_API_KEY),
      userId: arcadeUserId,
      error: error.message || "Could not load Arcade discovery."
    });
  }
});

app.post("/api/tools/arcade/connect", async (req, res) => {
  const service = cleanText(req.body?.service);
  if (!arcadeDiscoveryCatalog.some((item) => item.service === service)) {
    res.status(400).json({ error: `Unknown Arcade service: ${service || "(missing)"}.` });
    return;
  }

  if (!process.env.ARCADE_API_KEY) {
    res.status(400).json({ error: "Missing ARCADE_API_KEY on the server." });
    return;
  }

  try {
    const authorization = await startArcadeServiceAuthorization(service);
    res.json({ service, authorization: publicArcadeProviderAuthorization(authorization) });
  } catch (error) {
    res.status(500).json({ error: error.message || `Could not connect ${service} through Arcade.` });
  }
});

app.post("/api/tools/arcade/authorize", async (req, res) => {
  const name = cleanText(req.body?.name);
  if (!arcadeToolMappings[name]) {
    res.status(400).json({ error: `No Arcade mapping is configured for ${name || "(missing)"}.` });
    return;
  }

  if (!process.env.ARCADE_API_KEY) {
    res.status(400).json({ error: "Missing ARCADE_API_KEY on the server." });
    return;
  }

  try {
    const response = await startArcadeAuthorization(name);
    const db = await readDb();
    res.json({ authorization: publicArcadeAuthorization(response), arcade: arcadeSettingsState(db) });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not start Arcade authorization." });
  }
});

app.post("/api/tools/arcade/authorize-all", async (req, res) => {
  if (!process.env.ARCADE_API_KEY) {
    res.status(400).json({ error: "Missing ARCADE_API_KEY on the server." });
    return;
  }

  const names = Object.keys(arcadeToolMappings).filter((name) => arcadeToolMappings[name]);
  const results = [];
  for (const name of names) {
    try {
      const authorization = await startArcadeAuthorization(name);
      results.push({ name, ok: true, authorization: publicArcadeAuthorization(authorization) });
    } catch (error) {
      results.push({ name, ok: false, error: error.message || "Authorization failed." });
    }
  }

  const db = await readDb();
  res.json({ results, arcade: arcadeSettingsState(db) });
});

app.post("/api/tools/arcade/check", async (req, res) => {
  const name = cleanText(req.body?.name);
  const db = await readDb();
  const authorization = latestArcadeAuthorization(db, name);
  if (!authorization?.authorizationId) {
    res.status(400).json({ error: `No authorization flow has been started for ${name || "(missing)"}.` });
    return;
  }

  if (!process.env.ARCADE_API_KEY) {
    res.status(400).json({ error: "Missing ARCADE_API_KEY on the server." });
    return;
  }

  try {
    const client = getArcadeClient();
    const response = await client.auth.status({ id: authorization.authorizationId, wait: 1 });
    const updated = await upsertArcadeAuthorization(name, authorization.arcadeToolName, response, {
      error: null,
      lastCheckedAt: new Date().toISOString()
    });
    const nextDb = await readDb();
    res.json({ authorization: publicArcadeAuthorization(updated), arcade: arcadeSettingsState(nextDb) });
  } catch (error) {
    const updated = await upsertArcadeAuthorization(name, authorization.arcadeToolName, {}, {
      status: "failed",
      error: error.message || "Could not check Arcade authorization.",
      lastCheckedAt: new Date().toISOString()
    });
    const nextDb = await readDb();
    res.status(500).json({ authorization: publicArcadeAuthorization(updated), arcade: arcadeSettingsState(nextDb), error: updated.error });
  }
});

app.post("/api/tools/execute", async (req, res) => {
  const name = cleanText(req.body?.name);
  const callId = cleanText(req.body?.callId);
  const args = isPlainObject(req.body?.arguments) ? req.body.arguments : {};

  if (!cooperToolNames.has(name)) {
    res.status(400).json({ error: `Unknown Cooper tool: ${name || "(missing)"}` });
    return;
  }

  const result = await executeRecordedCooperTool(name, args, { callId });
  res.status(result.statusCode).json({ output: result.output, recordId: result.recordId });
});

app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  eventClients.add(res);

  req.on("close", () => {
    eventClients.delete(res);
  });
});

app.get("/api/calls", async (_req, res) => {
  const db = await readDb();
  res.json({ calls: sortByDate(db.calls).map(publicCall) });
});

app.get("/api/calls/:id", async (req, res) => {
  const db = await readDb();
  const call = db.calls.find((item) => item.id === req.params.id);
  if (!call) {
    res.status(404).json({ error: "Call not found." });
    return;
  }
  res.json({ call: publicCall(call), artifacts: db.artifacts.filter((item) => item.callId === call.id).map(publicArtifact) });
});

app.get("/api/calls/:id/resume", async (req, res) => {
  const db = await readDb();
  const call = db.calls.find((item) => item.id === req.params.id);
  if (!call) {
    res.status(404).json({ error: "Call not found." });
    return;
  }

  res.json({ call: publicCall(call), resumePacket: buildCallResumePacket(db, call) });
});

app.get("/api/calls/:id/live-context", async (req, res) => {
  const db = await readDb();
  const call = db.calls.find((item) => item.id === req.params.id);
  if (!call) {
    res.status(404).json({ error: "Call not found." });
    return;
  }

  const liveContext = buildLiveCallContext(db, call);
  res.json({
    call: publicCall(call),
    project: liveContext.project
      ? publicProject(
          liveContext.project,
          db.projectSources.filter((source) => source.projectId === liveContext.project.id)
        )
      : null,
    projectContext: liveContext.projectContext,
    sessionContext: liveContext.sessionContext,
    realtimeSession: realtimeSession(liveContext.sessionContext)
  });
});

app.post("/api/calls", async (req, res) => {
  const result = await updateDb((db) => createCallInDb(db, req.body));

  if (result.error) {
    res.status(404).json({ error: result.error });
    return;
  }

  res.status(201).json({ call: publicCall(result.call) });
});

app.post("/api/ingest/plan", async (req, res) => {
  if (!ingestToken) {
    res.status(503).json({ error: "Plan ingest is disabled. Set COOPER_INGEST_TOKEN on the Cooper host." });
    return;
  }

  const remoteAddress = req.ip || req.socket?.remoteAddress || "";
  if (!isLoopbackAddress(remoteAddress)) {
    res.status(403).json({ error: "Plan ingest is only available from the Cooper host." });
    return;
  }

  const bearer = /^Bearer\s+(.+)$/i.exec(cleanText(req.headers.authorization));
  if (!safeCompare(bearer?.[1] || "", ingestToken)) {
    res.status(401).json({ error: "Invalid plan-ingest token." });
    return;
  }

  const input = normalizePlanIngest(req.body, { maxChars: planIngestMaxChars });
  if (input.error) {
    res.status(400).json({ error: input.error });
    return;
  }

  const result = await updateDb((db) => {
    const now = new Date().toISOString();
    const packet = buildContextPacket({
      id: randomUUID(),
      intent: `Review and discuss the imported plan${input.repo ? ` for ${input.repo}` : ""}.`,
      sources: [{
        id: randomUUID(),
        provider: "paste",
        type: "plan",
        title: input.repo ? `Plan · ${input.repo}` : "Imported plan",
        meta: [input.source, input.truncated ? `Stored ${input.storedChars} of ${input.originalChars} characters` : ""].filter(Boolean).join(" · "),
        content: input.plan,
        resolutionStatus: "completed",
        primary: true,
        locked: true,
        updatedAt: now
      }],
      createdAt: now,
      updatedAt: now
    }, { maxChars: contextPacketMaxChars });
    db.contextPackets.push(packet);

    return createCallInDb(db, {
      title: input.title,
      contextPacketId: packet.id,
      source: "plan_ingest",
      sourceLabel: input.repo ? `Imported plan · ${input.repo}` : "Imported plan",
      sourceDetail: input.source,
      startedAt: now
    }, now);
  });

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  const callId = result.call.id;
  res.status(201).json({
    callId,
    contextPacketId: result.call.contextPacketId,
    url: `/?call=${encodeURIComponent(callId)}`,
    webUrl: `/?call=${encodeURIComponent(callId)}`,
    universalUrl: `/open/sessions/${encodeURIComponent(callId)}`,
    appUrl: `cooper://sessions/${encodeURIComponent(callId)}`,
    truncated: input.truncated
  });
});

function createCallInDb(db, input = {}, now = new Date().toISOString()) {
  const requestedProjectId = cleanText(input.projectId);
  const resumedFromCallId = cleanText(input.resumedFromCallId);
  const requestedContextPacketId = cleanText(input.contextPacketId);
  const sourceCall = resumedFromCallId
    ? db.calls.find((item) => item.id === resumedFromCallId)
    : null;
  if (resumedFromCallId && !sourceCall) return { error: "Session to resume was not found." };

  const inheritedContextPacketIds = sourceCall ? contextPacketIdsForCall(sourceCall) : [];
  const contextPacketIds = [...new Set([...inheritedContextPacketIds, requestedContextPacketId].filter(Boolean))].slice(-6);
  const requestedContextPacket = requestedContextPacketId
    ? db.contextPackets.find((item) => item.id === requestedContextPacketId)
    : null;
  if (requestedContextPacketId && !requestedContextPacket) {
    return { error: "Selected context packet was not found." };
  }
  const availableContextPackets = contextPacketIds
    .map((id) => db.contextPackets.find((item) => item.id === id))
    .filter(Boolean);

  const projectId = requestedProjectId || sourceCall?.projectId || "";
  const project = projectId ? db.projects.find((item) => item.id === projectId) : null;
  if (projectId && !project) return { error: "Selected project was not found." };

  const resumePacket = sourceCall ? buildCallResumePacket(db, sourceCall) : null;
  if (sourceCall) sourceCall.resumePacket = resumePacket;
  const callId = randomUUID();
  const contextPacketId = requestedContextPacket?.id
    || sourceCall?.contextPacketId
    || contextPacketIds.at(-1)
    || "";
  const nextCall = {
    id: callId,
    title: cleanText(input.title) || (sourceCall ? `Continue: ${sourceCall.title}` : `Cooper call ${new Date().toLocaleString()}`),
    status: "active",
    source: cleanText(input.source) || (sourceCall?.source ? "continuation" : "session"),
    sourceLabel: cleanText(input.sourceLabel) || cleanText(sourceCall?.sourceLabel),
    sourceDetail: cleanText(input.sourceDetail) || cleanText(sourceCall?.sourceDetail),
    startedAt: input.startedAt || now,
    endedAt: null,
    durationSeconds: 0,
    projectId: project?.id || "",
    projectTitle: project?.title || "",
    projectContextSnapshot: project
      ? buildProjectContext(db, project.id)
      : sourceCall?.projectContextSnapshot || "",
    contextPacketId,
    contextPacketIds,
    contextSourceCount: availableContextPackets.reduce((total, packet) => total + Number(packet.sourceCount || 0), 0),
    resumedFromCallId: sourceCall?.id || "",
    threadId: sourceCall?.threadId || sourceCall?.id || callId,
    continuationIndex: sourceCall ? Number(sourceCall.continuationIndex || 0) + 1 : 0,
    resumePacket,
    resumeSourcePacket: resumePacket,
    transcript: [],
    suggestions: defaultSuggestions(),
    createdAt: now,
    updatedAt: now
  };
  if (project) {
    project.lastUsedAt = now;
    project.updatedAt = now;
  }
  db.calls.push(nextCall);
  return { call: nextCall };
}

app.patch("/api/calls/:id", async (req, res) => {
  const result = await updateDb((db) => {
    const call = db.calls.find((item) => item.id === req.params.id);
    if (!call) return null;

    if (typeof req.body?.title === "string") call.title = cleanText(req.body.title) || call.title;
    if (typeof req.body?.status === "string") call.status = req.body.status;
    if (typeof req.body?.durationSeconds === "number") call.durationSeconds = req.body.durationSeconds;
    if (Array.isArray(req.body?.transcript)) call.transcript = normalizeTranscript(req.body.transcript);
    if (req.body?.realtimeUsage) call.realtimeUsage = normalizeCallUsage(req.body.realtimeUsage);
    if (req.body?.endedAt) call.endedAt = req.body.endedAt;
    if (typeof req.body?.projectId === "string") {
      const projectId = cleanText(req.body.projectId);
      const project = projectId
        ? db.projects.find((item) => item.id === projectId)
        : null;
      if (projectId && !project) return { error: "Selected project was not found." };
      call.projectId = project?.id || "";
      syncCallProjectContext(db, call, new Date().toISOString());
      if (project) {
        project.lastUsedAt = new Date().toISOString();
        project.updatedAt = project.lastUsedAt;
      }
    }
    call.updatedAt = new Date().toISOString();
    return call;
  });

  if (!result) {
    res.status(404).json({ error: "Call not found." });
    return;
  }
  if (result.error) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json({ call: publicCall(result) });
});

app.post("/api/calls/:id/transcript", async (req, res) => {
  const entry = normalizeTranscript([req.body])[0];

  if (!entry?.text) {
    res.status(400).json({ error: "Transcript text is required." });
    return;
  }

  const result = await updateDb((db) => {
    const call = db.calls.find((item) => item.id === req.params.id);
    if (!call) return null;
    const existingIndex = call.transcript.findIndex((item) => sameTranscriptTurn(item, entry));
    if (existingIndex >= 0) {
      call.transcript[existingIndex] = { ...call.transcript[existingIndex], ...entry };
    } else {
      call.transcript.push(entry);
    }
    call.updatedAt = new Date().toISOString();
    return call;
  });

  if (!result) {
    res.status(404).json({ error: "Call not found." });
    return;
  }
  res.status(201).json({ entry, call: publicCall(result) });
});

app.post("/api/calls/:id/chat", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "Missing OPENAI_API_KEY on the server." });
    return;
  }

  const normalized = normalizeSessionChatPrompt(req.body?.message);
  if (normalized.error) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  const callId = cleanText(req.params.id);
  const messageId = cleanText(req.body?.messageId) || randomUUID();
  const initialDb = await readDb();
  const initialCall = initialDb.calls.find((item) => item.id === callId);
  if (!initialCall) {
    res.status(404).json({ error: "Call not found." });
    return;
  }
  if (initialCall.status !== "active") {
    res.status(409).json({ error: "Resume this ended session before sending another message." });
    return;
  }
  if (activeSessionChats.has(callId)) {
    res.status(409).json({ error: "Cooper is already responding in this session." });
    return;
  }

  activeSessionChats.add(callId);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  try {
    const userEntry = normalizeTranscript([{
      id: messageId,
      at: new Date().toISOString(),
      speaker: "Michael",
      text: normalized.prompt,
      source: "typed_chat"
    }])[0];
    const accepted = await appendTranscriptToCall(callId, userEntry);
    if (!accepted) throw new Error("The session disappeared before the message could be saved.");
    writeSessionChatEvent(res, { type: "message.accepted", entry: userEntry, call: publicCall(accepted) });

    const db = await readDb();
    const call = db.calls.find((item) => item.id === callId);
    const sessionContext = call ? buildLiveCallContext(db, call, { includeActiveTranscript: false }).sessionContext : "";
    const instructions = [
      cooperInstructions,
      sessionContext,
      "# Typed session channel",
      "This is a first-class typed turn inside the same durable Cooper session used by voice. Reply with concise public-facing text only. Never expose hidden reasoning. Use the supplied Cooper tools whenever the request needs workspace data, calendar or Notion access, background artifacts, approvals, or other session actions. Preserve all write-confirmation gates."
    ].filter(Boolean).join("\n\n");
    let input = boundedSessionChatInput(accepted.transcript);
    let previousResponseId = "";
    let latestResponseId = "";
    const assistantParts = [];

    for (let round = 0; round < chatMaxToolRounds; round += 1) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": "cooper-session-chat"
        },
        body: JSON.stringify({
          model: chatModel,
          instructions,
          input,
          ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
          tools: responsesChatTools(cooperToolDefinitions),
          tool_choice: "auto",
          parallel_tool_calls: true,
          reasoning: { effort: "low" },
          max_output_tokens: chatMaxOutputTokens,
          text: { format: { type: "text" } },
          stream: true,
          store: true
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || `OpenAI Responses API failed with ${response.status}.`);
      }

      let completedResponse = null;
      for await (const event of jsonSseEvents(response.body)) {
        if (event.type === "response.output_text.delta" && event.delta) {
          writeSessionChatEvent(res, {
            type: "message.delta",
            messageId,
            responseId: event.response_id || latestResponseId,
            delta: event.delta
          });
        } else if (event.type === "response.completed") {
          completedResponse = event.response;
        } else if (event.type === "response.failed") {
          throw new Error(event.response?.error?.message || "Cooper could not complete this response.");
        } else if (event.type === "error") {
          throw new Error(event.message || event.error?.message || "The chat stream failed.");
        }
      }

      if (!completedResponse) throw new Error("The chat stream ended before Cooper completed the response.");
      latestResponseId = cleanText(completedResponse.id) || latestResponseId;
      previousResponseId = latestResponseId;
      const responseText = responseOutputText(completedResponse);
      if (responseText) assistantParts.push(responseText);
      await recordSessionChatUsage(callId, completedResponse);

      const functionCalls = responseFunctionCalls(completedResponse);
      if (!functionCalls.length) break;
      if (round === chatMaxToolRounds - 1) {
        throw new Error("Cooper reached the tool-call limit for this turn. Narrow the request and retry.");
      }

      const outputs = [];
      for (const functionCall of functionCalls) {
        writeSessionChatEvent(res, {
          type: "activity.started",
          activity: {
            id: functionCall.call_id,
            name: functionCall.name,
            status: "running",
            label: toolLabel(functionCall.name)
          }
        });
        const result = await executeRecordedCooperTool(
          functionCall.name,
          parseFunctionArguments(functionCall.arguments),
          { callId }
        );
        writeSessionChatEvent(res, {
          type: "activity.completed",
          activity: {
            id: functionCall.call_id,
            name: functionCall.name,
            status: result.output?.status || (result.statusCode >= 400 ? "error" : "completed"),
            label: toolLabel(functionCall.name),
            message: cleanText(result.output?.message || result.output?.value || result.output?.status),
            recordId: result.recordId
          }
        });
        outputs.push({
          type: "function_call_output",
          call_id: functionCall.call_id,
          output: JSON.stringify(result.output)
        });
      }
      input = outputs;
    }

    const assistantText = assistantParts.join("\n\n").trim();
    if (!assistantText) throw new Error("Cooper completed the turn without a public response.");
    const assistantEntry = normalizeTranscript([{
      id: randomUUID(),
      at: new Date().toISOString(),
      speaker: "Cooper",
      text: assistantText,
      source: "typed_chat",
      responseId: latestResponseId
    }])[0];
    const completedCall = await appendTranscriptToCall(callId, assistantEntry);
    writeSessionChatEvent(res, { type: "message.completed", entry: assistantEntry, call: publicCall(completedCall) });

    const finalDb = await readDb();
    writeSessionChatEvent(res, {
      type: "session.snapshot",
      call: publicCall(finalDb.calls.find((item) => item.id === callId)),
      jobs: finalDb.jobs.filter((item) => item.callId === callId).map(publicJob),
      artifacts: finalDb.artifacts.filter((item) => item.callId === callId).map(publicArtifact)
    });
    writeSessionChatEvent(res, { type: "done" });
    res.end();
  } catch (error) {
    writeSessionChatEvent(res, { type: "error", error: error.message || "Cooper chat failed.", retryable: true });
    res.end();
  } finally {
    activeSessionChats.delete(callId);
  }
});

app.post("/api/calls/:id/end", async (req, res) => {
  const result = await updateDb((db) => {
    const call = db.calls.find((item) => item.id === req.params.id);
    if (!call) return null;
    if (Array.isArray(req.body?.transcript)) call.transcript = normalizeTranscript(req.body.transcript);
    call.status = "ended";
    call.endedAt = req.body?.endedAt || new Date().toISOString();
    call.durationSeconds = Number(req.body?.durationSeconds || call.durationSeconds || 0);
    if (req.body?.realtimeUsage) call.realtimeUsage = normalizeCallUsage(req.body.realtimeUsage);
    call.suggestions = defaultSuggestions(call.transcript.length > 0);
    call.resumePacket = buildCallResumePacket(db, call);
    call.updatedAt = new Date().toISOString();
    return call;
  });

  if (!result) {
    res.status(404).json({ error: "Call not found." });
    return;
  }
  res.json({ call: publicCall(result) });
});

app.post("/api/calls/:id/artifacts", async (req, res) => {
  const kind = artifactRecipes[req.body?.kind] ? req.body.kind : "post_call_kit";
  const customPrompt = cleanText(req.body?.customPrompt || "");
  const result = await enqueueArtifactJob(req.params.id, kind, customPrompt, {
    title: cleanText(req.body?.title),
    workstream: cleanText(req.body?.workstream),
    priority: cleanText(req.body?.priority),
    pipelineId: cleanText(req.body?.pipelineId)
  });

  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }

  res.status(202).json({ job: publicJob(result.job) });
});

app.post("/api/artifacts/:id/revise", async (req, res) => {
  const db = await readDb();
  const artifact = db.artifacts.find((item) => item.id === req.params.id);
  if (!artifact) {
    res.status(404).json({ error: "Artifact not found." });
    return;
  }

  const sourceJob = db.jobs.find((item) => item.id === artifact.jobId);
  const instruction = cleanText(req.body?.instruction);
  if (!instruction) {
    res.status(400).json({ error: "A revision instruction is required." });
    return;
  }

  const priorDraft = cleanText(sourceJob?.draft).slice(-120000);
  const result = await enqueueArtifactJob(artifact.callId, artifact.kind, [
    `Revision requested for ${artifact.title} version ${Number(artifact.version || 1)}:\n${instruction}`,
    priorDraft ? `Existing artifact source to revise:\n${priorDraft}` : ""
  ].filter(Boolean).join("\n\n"), {
    allowEmptyTranscript: true,
    title: cleanText(req.body?.title) || artifact.title,
    priority: cleanText(req.body?.priority) || "high",
    workstream: "artifact_revision",
    supersedesArtifactId: artifact.id
  });

  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }

  res.status(202).json({ job: publicJob(result.job) });
});

app.get("/api/artifacts/:id/content", async (req, res) => {
  const db = await readDb();
  const artifact = db.artifacts.find((item) => item.id === req.params.id);
  if (!artifact) {
    res.status(404).type("text/plain").send("Artifact not found.");
    return;
  }

  try {
    const content = await readFile(join(artifactsDir, artifactFileName(artifact)));
    res.type(artifactMimeType(artifact)).send(content);
  } catch {
    res.status(404).type("text/plain").send("Artifact file not found.");
  }
});

app.post("/api/jobs/:id/retry", async (req, res) => {
  const result = await updateDb((db) => {
    const job = db.jobs.find((item) => item.id === req.params.id);
    if (!job) return null;
    if (job.status !== "failed") return job;
    job.status = "queued";
    job.error = null;
    job.retryAt = null;
    job.attempts = 0;
    job.failures = 0;
    job.progress = "Queued for retry.";
    appendJobLog(job, "retry", "Manual retry queued.");
    job.updatedAt = new Date().toISOString();
    return job;
  });

  if (!result) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  queueWorker();
  res.json({ job: publicJob(result) });
});

app.get("/api/jobs/:id", async (req, res) => {
  const db = await readDb();
  const job = db.jobs.find((item) => item.id === req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  res.json({ job: publicJob(job) });
});

app.post("/api/jobs/:id/:action(pause|resume|cancel)", async (req, res) => {
  const action = cleanText(req.params.action);
  const result = await updateDb((db) => {
    const job = db.jobs.find((item) => item.id === req.params.id);
    if (!job) return null;
    const transition = applyDocumentJobControl(job, action);
    if (!transition.ok) return { error: transition.message, status: 409, job };
    Object.assign(job, transition.job, { updatedAt: new Date().toISOString() });
    appendJobLog(job, action, transition.message);
    return { job };
  });

  if (!result) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  if (result.error) {
    res.status(result.status || 409).json({ error: result.error, job: publicJob(result.job) });
    return;
  }
  if (action === "resume") queueWorker();
  res.json({ job: publicJob(result.job) });
});

async function enqueueArtifactJob(callId, kind, customPrompt = "", options = {}) {
  const now = new Date().toISOString();
  const recipe = artifactRecipes[kind];

  const job = await updateDb((db) => {
    const call = db.calls.find((item) => item.id === callId);
    if (!call) return { error: "Call not found.", status: 404 };
    if (!call.transcript.length && !options.allowEmptyTranscript && !cleanText(customPrompt)) {
      return { error: "A transcript or canvas prompt is required before Cooper can generate artifacts.", status: 400 };
    }

    return enqueueArtifactJobInDb(db, callId, kind, customPrompt, options, now);
  });

  if (job?.error) {
    return { ok: false, error: job.error, status: job.status };
  }

  queueWorker();
  return { ok: true, job };
}

function enqueueArtifactJobInDb(db, callId, kind, customPrompt = "", options = {}, now = new Date().toISOString()) {
  const recipe = artifactRecipes[kind];
  if (!recipe) return { error: "Unknown artifact kind.", status: 400 };

  const call = db.calls.find((item) => item.id === callId) || {};
  const jobId = randomUUID();
  const maxOutputTokens = outputTokenBudget(recipe);
  const title = cleanText(options.title) || recipe.title;
  const queued = {
    id: jobId,
    callId,
    kind,
    title,
    workstream: cleanText(options.workstream) || null,
    pipelineId: cleanText(options.pipelineId) || cleanText(options.requirementsRunId) || jobId,
    requirementsRunId: cleanText(options.requirementsRunId) || null,
    templateId: cleanText(options.templateId) || null,
    requirementsStage: cleanText(options.requirementsStage) || null,
    sequence: Number(options.sequence || 0) || null,
    priority: normalizeJobPriority(options.priority),
    pipelineStage: "capture",
    pipeline: DOCUMENT_PIPELINE_STAGES,
    status: "queued",
    customPrompt,
    stepIndex: 0,
    stepCount: recipe.steps.length,
    attempts: 0,
    failures: 0,
    maxAttempts: jobMaxAttempts,
    model: workModel,
    fallbackModel: fallbackWorkModel,
    maxOutputTokens,
    reasoningEffort: "medium",
    apiStatus: "queued",
    activeStepSummary: "",
    lastActivityAt: now,
    lastApiStartedAt: null,
    lastApiCompletedAt: null,
    lastApiDurationMs: null,
    lastOutputChars: 0,
    draftCharCount: 0,
    draft: "",
    artifactId: null,
    supersedesArtifactId: cleanText(options.supersedesArtifactId) || null,
    sourceManifest: {
      capturedAt: now,
      callId,
      projectId: cleanText(call.projectId) || null,
      transcriptTurnCount: Array.isArray(call.transcript) ? call.transcript.length : 0,
      contextPacketIds: contextPacketIdsForCall(call),
      contextSourceCount: contextSourceCountForCall(db, call),
      instructionCharCount: cleanText(customPrompt).length
    },
    quality: {
      status: "pending",
      score: 0,
      minimumScore: jobQualityMinimumScore,
      checks: [],
      warnings: [],
      summary: "Quality validation has not run yet."
    },
    qualityRepairAttempts: 0,
    error: null,
    retryAt: null,
    progress: "Queued.",
    logs: [
      {
        id: randomUUID(),
        at: now,
        type: "queued",
        message: `${title} queued with ${recipe.steps.length} execution steps.`
      }
    ],
    createdAt: now,
    updatedAt: now
  };
  db.jobs.push(queued);
  return queued;
}

function queueWorker() {
  if (!workerActive) {
    setTimeout(processQueue, 0);
  }
}

async function processQueue() {
  if (workerActive) return;
  workerActive = true;

  try {
    while (true) {
      const db = await readDb();
      const queued = sortDocumentQueue(db.jobs.filter((item) => item.status === "queued"));
      const now = Date.now();
      const job = queued.find((item) => !item.retryAt || new Date(item.retryAt).getTime() <= now);
      const nextRetryAt = queued
        .map((item) => item.retryAt ? new Date(item.retryAt).getTime() : null)
        .filter((value) => value && value > now)
        .sort((a, b) => a - b)[0];

      if (!job && nextRetryAt) {
        workerActive = false;
        setTimeout(processQueue, Math.max(0, nextRetryAt - now));
        return;
      }

      if (!job) break;

      const waitMs = Math.max(0, lastGenerationAt + jobDelayMs - Date.now());
      if (waitMs > 0) {
        workerActive = false;
        setTimeout(processQueue, waitMs);
        return;
      }

      await runJob(job.id);
    }
  } finally {
    workerActive = false;
  }
}

async function runJob(jobId) {
  await updateDb((db) => {
    const job = db.jobs.find((item) => item.id === jobId);
    if (job) {
      job.status = "running";
      job.progress = "Starting.";
      job.pipelineStage = pipelineStageForJob(job, artifactRecipes[job.kind]);
      appendJobLog(job, "start", "Cooper picked up the job.");
      job.updatedAt = new Date().toISOString();
    }
  });

  try {
    while (true) {
      const db = await readDb();
      const job = db.jobs.find((item) => item.id === jobId);
      const call = db.calls.find((item) => item.id === job?.callId);
      const recipe = artifactRecipes[job?.kind];

      if (!job || !call || !recipe) {
        throw new Error("Job context disappeared.");
      }

      if (job.cancelRequested || job.status === "canceling") {
        await updateDb((nextDb) => {
          const nextJob = nextDb.jobs.find((item) => item.id === jobId);
          if (!nextJob) return;
          nextJob.status = "canceled";
          nextJob.apiStatus = "canceled";
          nextJob.cancelRequested = false;
          nextJob.canceledAt = new Date().toISOString();
          nextJob.progress = "Canceled after the last safe checkpoint.";
          appendJobLog(nextJob, "canceled", "Cooper stopped at a safe checkpoint. No additional model step will run.");
          nextJob.updatedAt = new Date().toISOString();
        });
        break;
      }

      if (job.pauseRequested || job.status === "pausing") {
        await updateDb((nextDb) => {
          const nextJob = nextDb.jobs.find((item) => item.id === jobId);
          if (!nextJob) return;
          nextJob.status = "paused";
          nextJob.apiStatus = "paused";
          nextJob.pauseRequested = false;
          nextJob.pausedAt = new Date().toISOString();
          nextJob.progress = `Paused before step ${Number(nextJob.stepIndex || 0) + 1}.`;
          appendJobLog(nextJob, "paused", "Cooper paused at a safe checkpoint. Resume will continue from the saved draft.");
          nextJob.updatedAt = new Date().toISOString();
        });
        break;
      }

      if (["paused", "canceled"].includes(job.status)) break;

      if (job.stepIndex >= recipe.steps.length) {
        await completeArtifact(job, call);
        break;
      }

      const attempt = Number(job.attempts || 0) + 1;
      await updateDb((nextDb) => {
        const nextJob = nextDb.jobs.find((item) => item.id === jobId);
        if (!nextJob) return;
        const stepSummary = summarizeStep(recipe.steps[nextJob.stepIndex]);
        nextJob.attempts = attempt;
        nextJob.pipelineStage = pipelineStageForJob(nextJob, recipe);
        nextJob.progress = `Running step ${nextJob.stepIndex + 1} of ${nextJob.stepCount}.`;
        nextJob.apiStatus = "preparing_request";
        nextJob.activeStepSummary = stepSummary;
        nextJob.lastStartedAt = new Date().toISOString();
        appendJobLog(
          nextJob,
          "step_start",
          `Step ${nextJob.stepIndex + 1}/${nextJob.stepCount}: ${stepSummary}`
        );
        nextJob.updatedAt = new Date().toISOString();
      });

      const stepPrompt = buildWorkPrompt(db, call, job, recipe.steps[job.stepIndex]);
      const requestStartedAt = new Date().toISOString();
      const model = modelForAttempt(attempt);
      const maxOutputTokens = outputTokenBudget(recipe);
      await updateDb((nextDb) => {
        const nextJob = nextDb.jobs.find((item) => item.id === jobId);
        if (!nextJob) return;
        nextJob.model = model;
        nextJob.maxOutputTokens = maxOutputTokens;
        nextJob.apiStatus = "waiting_for_openai";
        nextJob.lastApiStartedAt = requestStartedAt;
        nextJob.requestInputChars = JSON.stringify(stepPrompt).length;
        nextJob.progress = `Waiting on OpenAI for step ${nextJob.stepIndex + 1} of ${nextJob.stepCount}.`;
        appendJobLog(
          nextJob,
          "api_request",
          `OpenAI request sent to ${model} with ${maxOutputTokens.toLocaleString()} output tokens.`
        );
        nextJob.updatedAt = requestStartedAt;
      });
      const responseResult = await createResponse(stepPrompt, {
        attempt,
        outputType: recipe.outputType || "markdown",
        maxOutputTokens
      });
      const output = responseResult.output;
      lastGenerationAt = Date.now();

      await updateDb((nextDb) => {
        const nextJob = nextDb.jobs.find((item) => item.id === jobId);
        if (!nextJob) return;
        if (responseResult.usage) {
          nextJob.responseUsage = addResponsesApiUsage(nextJob.responseUsage, responseResult.usage, {
            model: responseResult.model,
            at: responseResult.completedAt
          });
          nextJob.outputTokens = nextJob.responseUsage.outputTokens;
          nextJob.costUsd = nextJob.responseUsage.costUsd;
        }
        nextJob.apiStatus = "response_received";
        nextJob.lastApiCompletedAt = responseResult.completedAt;
        nextJob.lastApiDurationMs = responseResult.durationMs;
        nextJob.lastOutputChars = output.length;
        nextJob.draft = [
          nextJob.draft,
          `\n\n<!-- Cooper step ${nextJob.stepIndex + 1}: ${new Date().toISOString()} -->\n\n${output}`
        ].join("").trim();
        nextJob.draftCharCount = nextJob.draft.length;
        appendJobLog(
          nextJob,
          "api_response",
          `OpenAI response received in ${formatRetryDelay(responseResult.durationMs)} with ${output.length.toLocaleString()} characters${responseResult.usage ? `, ${responseResult.usage.totalTokens.toLocaleString()} tokens, $${responseResult.usage.costUsd.toFixed(4)}` : ""}.`
        );
        nextJob.stepIndex += 1;
        nextJob.pipelineStage = pipelineStageForJob(nextJob, recipe);
        nextJob.apiStatus = nextJob.stepIndex >= nextJob.stepCount ? "finalizing" : "waiting_between_steps";
        nextJob.progress = nextJob.stepIndex >= nextJob.stepCount ? "Finalizing artifact file." : `Waiting before step ${nextJob.stepIndex + 1}.`;
        appendJobLog(
          nextJob,
          "step_complete",
          nextJob.stepIndex >= nextJob.stepCount
            ? `All model steps completed. Cooper is writing the ${artifactOutputLabel(recipe.outputType || "markdown")}.`
            : `Step complete. Waiting ${formatRetryDelay(jobDelayMs)} before the next model call.`
        );
        nextJob.updatedAt = new Date().toISOString();
      });

      const current = await readDb();
      const nextJob = current.jobs.find((item) => item.id === jobId);
      if (!nextJob || nextJob.stepIndex >= recipe.steps.length) {
        continue;
      }
      await wait(jobDelayMs);
    }
  } catch (error) {
    await updateDb((db) => {
      const job = db.jobs.find((item) => item.id === jobId);
      if (job) {
        if (["paused", "pausing", "canceled", "canceling"].includes(job.status)) {
          appendJobLog(job, "checkpoint", `Worker stopped while the job was ${job.status}.`);
          job.updatedAt = new Date().toISOString();
          return;
        }
        job.error = error.message;
        job.failures = Number(job.failures || 0) + 1;
        if (error.retryable && Number(job.failures || 0) < Number(job.maxAttempts || jobMaxAttempts)) {
          const retryAt = new Date(Date.now() + (error.retryAfterMs || jobDelayMs * 2)).toISOString();
          job.status = "queued";
          job.retryAt = retryAt;
          job.apiStatus = "retry_scheduled";
          job.progress = `Retrying after ${formatRetryDelay(error.retryAfterMs || jobDelayMs * 2)}.`;
          appendJobLog(job, "retry", `${error.message} Retrying at ${new Date(retryAt).toLocaleTimeString()}.`);
        } else {
          job.status = "failed";
          job.apiStatus = "failed";
          job.progress = "Failed. Manual retry is available.";
          job.failedAt = new Date().toISOString();
          appendJobLog(job, "failed", error.message);
        }
        job.updatedAt = new Date().toISOString();
      }
    });
    queueWorker();
  }
}

async function completeArtifact(job, call) {
  const artifactId = randomUUID();
  const now = new Date().toISOString();
  const recipe = artifactRecipes[job.kind] || {};
  const safeTitle = cleanText(job.title) || recipe.title || "Cooper artifact";
  const outputType = recipe.outputType || "markdown";
  const extension = defaultArtifactExtension(outputType);
  const mimeType = defaultArtifactMimeType(outputType);
  let sourceContent = outputType === "html"
    ? normalizeHtml(extractHtmlDocument(job.draft) || prototypeFallbackHtml(safeTitle, job.draft))
    : normalizeMarkdown(`# ${safeTitle}\n\n${job.draft}`);

  await updateDb((db) => {
    const nextJob = db.jobs.find((item) => item.id === job.id);
    if (!nextJob) return;
    nextJob.pipelineStage = "validate";
    nextJob.apiStatus = "validating";
    nextJob.progress = "Running artifact quality checks.";
    appendJobLog(nextJob, "quality_check", "Cooper is checking structure, source lineage, completeness, and output safety.");
    nextJob.updatedAt = new Date().toISOString();
  });

  let quality = qualityReportForArtifact({
    kind: job.kind,
    outputType,
    content: sourceContent,
    sourceManifest: job.sourceManifest,
    minimumScore: jobQualityMinimumScore
  });

  let repairAttempts = Number(job.qualityRepairAttempts || 0);
  while (
    jobQualityGateEnabled
    && quality.status === "needs_review"
    && quality.repairable
    && repairAttempts < jobQualityRepairAttempts
  ) {
    repairAttempts += 1;
    await updateDb((db) => {
      const nextJob = db.jobs.find((item) => item.id === job.id);
      if (!nextJob) return;
      nextJob.apiStatus = "repairing";
      nextJob.quality = quality;
      nextJob.qualityRepairAttempts = repairAttempts;
      nextJob.progress = `Repairing quality issues (${repairAttempts}/${jobQualityRepairAttempts}).`;
      appendJobLog(nextJob, "quality_repair", quality.summary);
      nextJob.updatedAt = new Date().toISOString();
    });

    const repairInstruction = qualityRepairInstruction(quality, { kind: job.kind, outputType });
    const repairResult = await createResponse([{
      role: "user",
      content: [{
        type: "input_text",
        text: `${repairInstruction}\n\nCurrent artifact:\n${sourceContent}`
      }]
    }], {
      attempt: Math.max(1, Number(job.attempts || 1)),
      outputType,
      maxOutputTokens: outputTokenBudget(recipe)
    });
    const repairedContent = outputType === "html"
      ? extractHtmlDocument(repairResult.output)
      : repairResult.output;
    if (cleanText(repairedContent)) {
      sourceContent = outputType === "html"
        ? normalizeHtml(repairedContent)
        : normalizeMarkdown(repairedContent);
    }
    quality = qualityReportForArtifact({
      kind: job.kind,
      outputType,
      content: sourceContent,
      sourceManifest: job.sourceManifest,
      minimumScore: jobQualityMinimumScore
    });

    await updateDb((db) => {
      const nextJob = db.jobs.find((item) => item.id === job.id);
      if (!nextJob) return;
      nextJob.draft = [
        nextJob.draft,
        `\n\n<!-- Cooper quality repair ${repairAttempts}: ${new Date().toISOString()} -->\n\n${repairResult.output}`
      ].join("").trim();
      nextJob.draftCharCount = nextJob.draft.length;
      nextJob.quality = quality;
      nextJob.qualityRepairAttempts = repairAttempts;
      if (repairResult.usage) {
        nextJob.responseUsage = addResponsesApiUsage(nextJob.responseUsage, repairResult.usage, {
          model: repairResult.model,
          at: repairResult.completedAt
        });
        nextJob.outputTokens = nextJob.responseUsage.outputTokens;
        nextJob.costUsd = nextJob.responseUsage.costUsd;
      }
      appendJobLog(nextJob, "quality_result", quality.summary);
      nextJob.updatedAt = new Date().toISOString();
    });
  }

  const prePublishDb = await readDb();
  const version = nextArtifactVersion(prePublishDb.artifacts, job);
  const content = outputType === "pdf"
    ? await renderArtifactPdf({ title: safeTitle, content: sourceContent, createdAt: now })
    : outputType === "docx"
      ? await renderArtifactDocx({ title: safeTitle, content: sourceContent, createdAt: now })
      : outputType === "pptx"
        ? await renderArtifactPptx({ title: safeTitle, content: sourceContent, createdAt: now })
        : outputType === "xlsx"
          ? await renderArtifactXlsx({ title: safeTitle, content: sourceContent, createdAt: now })
          : sourceContent;

  await writeFile(
    join(artifactsDir, `${artifactId}.${extension}`),
    content,
    ["pdf", "docx", "pptx", "xlsx"].includes(outputType) ? undefined : "utf8"
  );

  await updateDb((db) => {
    const nextJob = db.jobs.find((item) => item.id === job.id);
    const nextCall = db.calls.find((item) => item.id === call.id);
    const artifact = {
      id: artifactId,
      callId: call.id,
      jobId: job.id,
      kind: job.kind,
      title: safeTitle,
      workstream: job.workstream || null,
      requirementsRunId: job.requirementsRunId || null,
      templateId: job.templateId || null,
      requirementsStage: job.requirementsStage || null,
      pipelineId: job.pipelineId || job.id,
      version,
      supersedesArtifactId: job.supersedesArtifactId || null,
      sourceManifest: job.sourceManifest || null,
      quality,
      outputType,
      extension,
      mimeType,
      file: `data/artifacts/${artifactId}.${extension}`,
      createdAt: now
    };

    db.artifacts.push(artifact);
    if (artifact.supersedesArtifactId) {
      const previousArtifact = db.artifacts.find((item) => item.id === artifact.supersedesArtifactId);
      if (previousArtifact) previousArtifact.supersededByArtifactId = artifact.id;
    }
    if (nextJob) {
      nextJob.status = "completed";
      nextJob.apiStatus = "completed";
      nextJob.pipelineStage = "publish";
      nextJob.artifactId = artifactId;
      nextJob.quality = quality;
      nextJob.qualityRepairAttempts = repairAttempts;
      nextJob.completedAt = now;
      nextJob.progress = quality.status === "passed" ? "Artifact ready and quality checked." : "Artifact ready with quality warnings.";
      nextJob.activeStepSummary = "";
      nextJob.draftCharCount = nextJob.draft?.length || 0;
      appendJobLog(nextJob, "published", `${artifactOutputLabel(outputType)} version ${version} saved: ${safeTitle}. ${quality.summary}`);
      nextJob.updatedAt = now;
    }
    if (nextCall) {
      nextCall.updatedAt = now;
    }
  });
}

async function createMcpAppArtifact(callId, payload) {
  const artifactId = randomUUID();
  const now = new Date().toISOString();
  const title = cleanText(payload.title) || "MCP App";
  const content = `${JSON.stringify(payload, null, 2)}\n`;

  await writeFile(join(artifactsDir, `${artifactId}.json`), content, "utf8");

  return updateDb((db) => {
    const call = db.calls.find((item) => item.id === callId);
    const artifact = {
      id: artifactId,
      callId,
      jobId: null,
      kind: "mcp_app",
      title,
      outputType: "mcp_app",
      extension: "json",
      mimeType: "application/json",
      file: `data/artifacts/${artifactId}.json`,
      createdAt: now
    };

    db.artifacts.push(artifact);
    if (call) {
      call.updatedAt = now;
    }
    return artifact;
  });
}

async function createResponse(input, { attempt = 1, outputType = "markdown", maxOutputTokens = jobMaxOutputTokens } = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY on the server.");
  }

  const model = modelForAttempt(attempt);
  const startedAt = Date.now();
  const instructions = outputType === "html"
    ? "You are Cooper, Michael's AIRES CTO/CPO executive assistant. Produce implementation-grade planning and, when asked for a prototype, a complete standalone HTML document with inline CSS and small inline JavaScript. Use no external assets, external scripts, hidden reasoning, or markdown fences for final HTML."
    : "You are Cooper, Michael's AIRES CTO/CPO executive assistant. Produce high-signal Markdown. Be precise, opinionated, and practical.";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "cooper-local-dev"
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      reasoning: { effort: "medium" },
      max_output_tokens: maxOutputTokens,
      text: { format: { type: "text" } }
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    if ([408, 409, 429, 500, 502, 503, 504].includes(response.status)) {
      throw new RetryableJobError(
        payload?.error?.message || `OpenAI Responses API failed with ${response.status}.`,
        retryAfter > 0 ? retryAfter * 1000 : undefined
      );
    }
    throw new Error(payload?.error?.message || `OpenAI Responses API failed with ${response.status}.`);
  }

  const output = extractOutputText(payload);
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAt;
  if (payload?.status === "incomplete") {
    const reason = payload?.incomplete_details?.reason || "unknown";
    return {
      output: `${output}\n\n> Cooper note: this step ended incomplete (${reason}). Raise COOPER_JOB_MAX_OUTPUT_TOKENS or narrow the artifact request if this happens repeatedly.`,
      model,
      maxOutputTokens,
      usage: normalizeResponseUsagePayload(payload?.usage, model, completedAt),
      completedAt,
      durationMs,
      status: payload?.status || "incomplete",
      incompleteReason: reason
    };
  }
  return {
    output,
    model,
    maxOutputTokens,
    usage: normalizeResponseUsagePayload(payload?.usage, model, completedAt),
    completedAt,
    durationMs,
    status: payload?.status || "completed",
    incompleteReason: ""
  };
}

async function transcribePushToTalkAudio(file) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY on the server.");
  }

  const fd = new FormData();
  fd.set("model", pushToTalkTranscriptionModel);
  fd.set("prompt", "Push-to-talk command for Cooper, AIRES, Operator, Computer Use, Codex, browser, desktop apps, downloads, meetings, product and engineering work.");
  fd.set("file", new Blob([file.buffer], { type: file.mimetype || "audio/mp4" }), file.originalname || "cooper-push-to-talk.m4a");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Safety-Identifier": "cooper-local-ptt"
    },
    body: fd
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI transcription failed with ${response.status}.`);
  }

  return cleanText(payload?.text);
}

async function routePushToTalkTranscript(transcript, meta = {}) {
  const text = cleanText(transcript);
  if (!text) {
    return {
      action: "ignored",
      message: "No speech was detected."
    };
  }

  const classification = classifyPushToTalkCommand(text);
  if (classification.kind === "stop_computer") {
    const stopped = await stopActiveComputerUseTasks("Push-to-talk stop command.");
    return {
      action: "stop_computer",
      stopped: stopped.map(operatorTaskPublic),
      message: stopped.length ? `Stopped ${stopped.length} active Computer Use task${stopped.length === 1 ? "" : "s"}.` : "No active Computer Use tasks were running."
    };
  }

  if (classification.kind === "local_tool") {
    const output = await executeLocalComputerTool(classification.tool, classification.arguments || {}, {
      env: process.env
    });
    return {
      action: "local_tool",
      tool: classification.tool,
      output,
      message: output.message || `${classification.tool} finished.`
    };
  }

  if (classification.kind === "computer_task") {
    const input = buildPushToTalkComputerTaskInput(text, { requestedBy: meta.source || "push_to_talk" });
    const task = createOperatorTask(input);
    await updateDb((db) => {
      db.operatorTasks = Array.isArray(db.operatorTasks) ? db.operatorTasks : [];
      db.operatorTasks.push(task);
    });
    scheduleOperatorTask(task.id, 250);
    return {
      action: "computer_task_queued",
      task: operatorTaskPublic(task),
      message: `${task.title} is queued in Cooper Computer Use.`
    };
  }

  const response = await createResponse([
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "Michael used push-to-talk. Answer as Cooper, concise and practical.",
            "If this should be a Computer Use or Operator task, say what task should be started rather than claiming it is already running.",
            "",
            `Utterance: ${text}`
          ].join("\n")
        }
      ]
    }
  ], {
    outputType: "markdown",
    maxOutputTokens: pushToTalkResponseMaxOutputTokens
  });

  return {
    action: "cooper_response",
    response: response.output,
    model: response.model,
    usage: response.usage,
    message: "Cooper responded to the push-to-talk request."
  };
}

async function stopActiveComputerUseTasks(reason) {
  return updateDb((db) => {
    const now = new Date().toISOString();
    const tasks = (db.operatorTasks || []).filter((task) =>
      ["computer_use_browser", "computer_use_desktop", "codex_app_server"].includes(task.skill) &&
      isOperatorTaskActive(task)
    );
    tasks.forEach((task) => {
      task.status = "stopped";
      task.stoppedAt = now;
      task.updatedAt = now;
      task.logs.push(createOperatorLog("stopped", "Push-to-talk stop", reason, now));
      task.approvals.forEach((approval) => {
        if (approval.status === "pending") {
          approval.status = "cancelled";
          approval.resolvedAt = now;
        }
      });
      clearOperatorTimer(task.id);
    });
    return tasks;
  });
}

function normalizeResponseUsagePayload(usage, model, completedAt) {
  const summary = addResponsesApiUsage(null, usage, { model, at: completedAt });
  return summary?.calls?.[0] || null;
}

function modelForAttempt(attempt = 1) {
  return workModels[Math.min(Number(attempt || 1) - 1, workModels.length - 1)] || workModel;
}

function outputTokenBudget(recipe = {}) {
  return Math.max(jobMaxOutputTokens, Number(recipe.maxOutputTokens || 0) || 0);
}

function buildWorkPrompt(db, call, job, step) {
  const transcript = call.transcript
    .map((entry) => `- [${entry.at}] ${entry.speaker || "speaker"}: ${entry.text}`)
    .join("\n");
  const recipe = artifactRecipes[job.kind] || {};
  const sessionEvidence = buildLiveCallContext(db, call).sessionContext;
  const finalInstruction = job.kind === "aires_requirements"
    ? "Return only the content requested for this step. If this step asks for the final artifact, return a complete standalone AIRES-branded HTML document starting with <!doctype html>, with inline CSS and a simple window.print() Export PDF button, no external scripts, no stock imagery, no gradients, no emoji, and no markdown fences."
    : recipe.outputType === "html"
      ? "Return only the content requested for this step. If this step asks for the prototype, return a complete standalone HTML document starting with <!doctype html>, with inline CSS and inline JavaScript only, and no markdown fences."
      : "Return only the Markdown content for this step. Do not mention hidden reasoning.";

  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `
Call title: ${call.title}
Started: ${call.startedAt}
Ended: ${call.endedAt || "unknown"}
Artifact title: ${cleanText(job.title) || recipe.title || job.kind}
Artifact recipe: ${recipe.title || job.kind}
Output type: ${recipe.outputType || "markdown"}

Source priority:
- If Michael provided an additional instruction or pasted source context, treat it as the primary source of truth for this artifact.
- Use the transcript and attached session evidence only as supporting context.
- If the sources conflict, follow Michael's additional instruction or pasted source context.
- Never invent owners, dates, metrics, customer claims, ticket state, code behavior, or approvals. Mark consequential gaps as assumptions or open questions.
- Preserve decisions and vivid source phrases, but do not expose private model reasoning.

Captured source manifest:
${JSON.stringify(job.sourceManifest || {}, null, 2)}

Primary instruction/source context from Michael:
${job.customPrompt || "(none)"}

Current draft:
${job.draft || "(none yet)"}

Current step:
${step}

Attached session evidence (supporting only):
${sessionEvidence || "(none attached)"}

Transcript:
${transcript}

${finalInstruction}
`
        }
      ]
    }
  ];
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n\n").trim() || "No content returned.";
}

async function executeCooperTool(name, args, context = {}) {
  if (name === "check_calendar") {
    return {
      status: "completed",
      tool: name,
      source: "local sample calendar",
      value: checkCalendar(args.date, args.time)
    };
  }

  if (name === "run_gstack_skill") {
    return executeGstackSkillTool(args);
  }

  if (name === "create_canvas_artifact") {
    return executeCanvasArtifactTool(args, context);
  }

  if (name === "create_document_artifact") {
    return executeDocumentArtifactTool(args, context);
  }

  if (name === "render_mcp_app") {
    return executeMcpAppTool(args, context);
  }

  if (name === "present_aires_example") {
    return executePresentAiresExampleTool(args, context);
  }

  if (name === "generate_aires_template_artifact") {
    return executeGenerateAiresTemplateArtifactTool(args, context);
  }

  if (name === "run_aires_requirements_framework") {
    return executeAiresRequirementsTool(args, context);
  }

  if (name === "search_notion_workspace") {
    return executeNotionSearchTool(args);
  }

  if (name === "fetch_notion_page") {
    return executeNotionFetchPageTool(args);
  }

  if (name === "create_followup_action") {
    const confirmed = args.confirmed_by_michael === true;
    if (!confirmed || !arcadeWritesEnabled) {
      return {
        status: "approval_required",
        tool: name,
        riskLevel: "write",
        message: "This is a write action. Ask Michael to confirm the exact destination, title, owner, due date, and content before executing.",
        requestedAction: {
          action_type: cleanText(args.action_type),
          title: cleanText(args.title),
          owner: cleanText(args.owner),
          due_date: cleanText(args.due_date),
          destination: cleanText(args.destination),
          description: cleanText(args.description)
        },
        configuredForWrites: arcadeWritesEnabled
      };
    }
  }

  return executeArcadeMappedTool(name, args);
}

async function executeRecordedCooperTool(name, args, { callId = "" } = {}) {
  const recordId = randomUUID();
  const startedAt = Date.now();
  await updateDb((db) => {
    db.toolCalls.push({
      id: recordId,
      callId,
      userId: arcadeUserId,
      toolName: name,
      arcadeToolName: arcadeToolMappings[name] || null,
      arguments: safeToolArguments(name, args),
      riskLevel: toolRiskLevel(name),
      status: "pending",
      resultSummary: "",
      error: null,
      durationMs: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  try {
    const output = cooperToolNames.has(name)
      ? await executeCooperTool(name, args, { callId })
      : { status: "error", tool: name, message: `Unknown Cooper tool: ${name || "(missing)"}`, retryable: false };
    await updateToolCall(recordId, {
      status: output.status === "error" ? "failed" : output.status === "approval_required" ? "pending_approval" : "executed",
      resultSummary: summarizeToolResult(output),
      durationMs: Date.now() - startedAt,
      error: output.status === "error" ? output.message || "Tool failed." : null
    });
    return { output, recordId, statusCode: output.status === "error" ? 500 : 200 };
  } catch (error) {
    const output = {
      status: "error",
      tool: name,
      message: error.message || "Cooper tool execution failed.",
      retryable: false
    };
    await updateToolCall(recordId, {
      status: "failed",
      resultSummary: summarizeToolResult(output),
      durationMs: Date.now() - startedAt,
      error: output.message
    });
    return { output, recordId, statusCode: 500 };
  }
}

async function executeCanvasArtifactTool(args, context = {}) {
  const callId = cleanText(context.callId);
  const kind = artifactRecipes[cleanText(args.kind)] ? cleanText(args.kind) : "mermaid_diagram";
  const title = cleanText(args.title);
  const prompt = cleanText(args.prompt);
  const supportingContext = cleanText(args.context);

  if (!callId) {
    return {
      status: "error",
      tool: "create_canvas_artifact",
      message: "No active call is available for the canvas artifact.",
      retryable: false
    };
  }

  const customPrompt = [
    title ? `Canvas title: ${title}` : "",
    prompt ? `Canvas request: ${prompt}` : "",
    supportingContext ? `Supporting context:\n${supportingContext}` : ""
  ].filter(Boolean).join("\n\n");

  const result = await enqueueArtifactJob(callId, kind, customPrompt, { allowEmptyTranscript: Boolean(customPrompt) });
  if (!result.ok) {
    return {
      status: "error",
      tool: "create_canvas_artifact",
      message: result.error || "Could not queue canvas work.",
      retryable: false
    };
  }

  return {
    status: "queued",
    tool: "create_canvas_artifact",
    kind,
    title: result.job.title,
    jobId: result.job.id,
    message: `${result.job.title} is running in Cooper's canvas.`
  };
}

async function executeDocumentArtifactTool(args, context = {}) {
  const callId = cleanText(context.callId);
  const requestedKind = cleanText(args.kind);
  const kind = artifactRecipes[requestedKind] ? requestedKind : "post_call_kit";
  const title = cleanText(args.title);
  const instruction = cleanText(args.instruction);
  const supportingContext = cleanText(args.context);
  const priority = cleanText(args.priority) || "normal";

  if (!callId) {
    return {
      status: "error",
      tool: "create_document_artifact",
      message: "No active session is available for the document pipeline.",
      retryable: false
    };
  }

  const customPrompt = [
    instruction ? `Document outcome requested by Michael:\n${instruction}` : "",
    supportingContext ? `Priority source context:\n${supportingContext}` : ""
  ].filter(Boolean).join("\n\n");
  const result = await enqueueArtifactJob(callId, kind, customPrompt, {
    allowEmptyTranscript: Boolean(customPrompt),
    title,
    priority,
    workstream: "document_pipeline"
  });

  if (!result.ok) {
    return {
      status: "error",
      tool: "create_document_artifact",
      message: result.error || "Could not queue document generation.",
      retryable: false
    };
  }

  return {
    status: "queued",
    tool: "create_document_artifact",
    kind,
    title: result.job.title,
    jobId: result.job.id,
    pipeline: DOCUMENT_PIPELINE_STAGES,
    message: `${result.job.title} is running in Cooper's document pipeline.`,
    voice_summary: `I started ${result.job.title}. Capture, generation, quality validation, and publishing will continue in the background while we talk.`
  };
}

async function executeMcpAppTool(args, context = {}) {
  const callId = cleanText(context.callId);
  const title = cleanText(args.title) || "MCP App";
  const description = cleanText(args.description);
  const serverId = cleanText(args.server_id);
  const resourceUri = cleanText(args.resource_uri);
  const toolName = cleanText(args.tool_name);
  const state = isPlainObject(args.state) ? safeAuditObject(args.state) : {};
  const htmlInput = limitText(args.html, 120000);
  const server = findMcpAppServer(serverId);
  const messages = [];
  let html = htmlInput.text;
  let source = html ? "inline_html" : "placeholder";
  let resourceStatus = htmlInput.truncated ? "inline_html_truncated" : "inline_html";
  let mimeType = "text/html";

  if (!callId) {
    return {
      status: "error",
      tool: "render_mcp_app",
      message: "No active call is available for the MCP App canvas.",
      retryable: false
    };
  }

  if (!html && resourceUri && server) {
    try {
      const resource = await fetchMcpAppResource(server, resourceUri);
      html = resource.html;
      mimeType = resource.mimeType || mimeType;
      source = "mcp_resource";
      resourceStatus = "resource_loaded";
      messages.push(`Loaded ${resourceUri} from ${server.serverId}.`);
    } catch (error) {
      resourceStatus = "resource_unavailable";
      messages.push(error.message || "MCP App resource could not be loaded.");
    }
  } else if (!html && resourceUri && !server) {
    resourceStatus = "server_not_configured";
    messages.push(serverId
      ? `MCP App server "${serverId}" is not configured.`
      : "No MCP App server id was provided for this resource.");
  } else if (!html) {
    resourceStatus = "placeholder";
    messages.push("No MCP App resource URI or inline HTML was provided, so Cooper created a placeholder canvas surface.");
  }

  if (!html) {
    html = mcpAppPlaceholderHtml({
      title,
      description,
      serverId: server?.serverId || serverId,
      resourceUri,
      toolName,
      state,
      messages
    });
  }

  const payload = {
    version: "cooper-mcp-app-1",
    title,
    description,
    serverId: server?.serverId || serverId || "",
    transport: server?.type || "",
    resourceUri,
    toolName,
    source,
    resourceStatus,
    state,
    html: normalizeHtml(html),
    htmlMimeType: mimeType,
    aguiEvents: [
      {
        type: "TOOL_CALL_START",
        toolCallId: `cooper-${randomUUID()}`,
        toolCallName: toolName || "render_mcp_app",
        at: new Date().toISOString()
      },
      {
        type: "STATE_SNAPSHOT",
        snapshot: {
          status: resourceStatus === "resource_loaded" || source === "inline_html" ? "ready" : resourceStatus,
          title,
          resourceUri: resourceUri || null,
          source
        },
        at: new Date().toISOString()
      }
    ],
    messages,
    createdAt: new Date().toISOString()
  };

  const artifact = await createMcpAppArtifact(callId, payload);

  return {
    status: "completed",
    tool: "render_mcp_app",
    riskLevel: "advisory",
    artifactId: artifact.id,
    title: artifact.title,
    source,
    resourceStatus,
    message: `${title} is on Cooper's canvas as an MCP App surface.`
  };
}

async function executePresentAiresExampleTool(args, context = {}) {
  const callId = cleanText(context.callId);
  const exampleId = cleanText(args.example_id || args.example || args.document_key || args.topic);
  const mode = cleanText(args.mode) || "educate";
  const reason = cleanText(args.reason);
  const suppliedContext = limitText(args.context, 3000);

  if (!callId) {
    return {
      status: "error",
      tool: "present_aires_example",
      message: "No active call is available for the AIRES example canvas.",
      retryable: false
    };
  }

  const example = await getAiresExampleDocument(exampleId);
  if (!example) {
    return {
      status: "not_found",
      tool: "present_aires_example",
      message: "I could not find that AIRES example. Ask for Jobs to be Done, service blueprint, data flywheel, capability matrix, personas, daily rep flow, context-to-product-content, product thesis, or scoped requirements.",
      availableExamples: getAiresExampleList().map((item) => ({
        id: item.id,
        title: item.title,
        category: item.category
      }))
    };
  }

  const payload = {
    version: "cooper-mcp-app-1",
    title: example.title,
    description: reason || example.description,
    serverId: "cooper-local",
    transport: "local",
    resourceUri: `aires-example://${example.id}`,
    toolName: "present_aires_example",
    source: "aires_example",
    resourceStatus: "ready",
    state: {
      exampleId: example.id,
      category: example.category,
      flow: example.flow,
      mode,
      contextIncluded: Boolean(suppliedContext.text),
      contextTruncated: suppliedContext.truncated
    },
    html: normalizeHtml(example.html),
    htmlMimeType: "text/html",
    aguiEvents: [
      {
        type: "TOOL_CALL_START",
        toolCallId: `cooper-${randomUUID()}`,
        toolCallName: "present_aires_example",
        at: new Date().toISOString()
      },
      {
        type: "STATE_SNAPSHOT",
        snapshot: {
          status: "ready",
          exampleId: example.id,
          title: example.title,
          mode
        },
        at: new Date().toISOString()
      }
    ],
    messages: [
      `Presented ${example.title} from the AIRES example library.`,
      suppliedContext.text ? "Connected this example to the active meeting context." : "No additional context was provided with the presentation request."
    ],
    createdAt: new Date().toISOString()
  };

  const artifact = await createMcpAppArtifact(callId, payload);

  return {
    status: "completed",
    tool: "present_aires_example",
    riskLevel: "advisory",
    artifactId: artifact.id,
    exampleId: example.id,
    title: artifact.title,
    mode,
    message: `${example.title} is on Cooper's canvas.`,
    voice_summary: `${example.title} is now on the canvas. It is useful when you need to ${example.flow.toLowerCase()}`
  };
}

async function executeGenerateAiresTemplateArtifactTool(args, context = {}) {
  const callId = cleanText(context.callId);
  const requestedTemplate = cleanText(args.template_id || args.example_id || args.document_key || args.topic);
  const requestedTemplates = Array.isArray(args.template_ids)
    ? args.template_ids.map((item) => cleanText(item)).filter(Boolean)
    : [];
  const title = cleanText(args.title);
  const instruction = limitText(args.instruction, 4000);
  const suppliedContext = limitText(args.context, 8000);
  const requirementsRunId = cleanText(context.requirementsRunId) || randomUUID();

  if (!callId) {
    return {
      status: "error",
      tool: "generate_aires_template_artifact",
      message: "No active call is available for AIRES template generation.",
      retryable: false
    };
  }

  const examples = requestedTemplate === "all"
    ? requirementsSuitePlan().map((item) => findAiresExample(item.id)).filter(Boolean)
    : requestedTemplates.length
      ? requestedTemplates.map((id) => findAiresExample(id)).filter(Boolean)
      : [findAiresExample(requestedTemplate)].filter(Boolean);

  const uniqueExamples = Array.from(new Map(examples.map((example) => [example.id, example])).values());
  if (!uniqueExamples.length) {
    return {
      status: "not_found",
      tool: "generate_aires_template_artifact",
      message: "I could not find that AIRES template. Ask for Jobs to be Done, service blueprint, data flywheel, capability matrix, personas, daily rep flow, context-to-product-content, product thesis, scoped requirements, or all.",
      availableExamples: getAiresExampleList().map((item) => ({
        id: item.id,
        title: item.title,
        category: item.category,
        recipeKind: item.recipeKind
      }))
    };
  }

  const queued = [];
  const failures = [];
  for (const [sequence, example] of uniqueExamples.entries()) {
    const extraContext = [
      title && uniqueExamples.length === 1 ? `Requested artifact title: ${title}` : "",
      instruction.text ? `Michael's voice instruction:\n${instruction.text}` : "",
      suppliedContext.text ? `Priority context from the live call/tool request:\n${suppliedContext.text}` : ""
    ].filter(Boolean).join("\n\n");
    const customPrompt = buildAiresExamplePrompt(example, extraContext);
    const kind = artifactRecipes[example.recipeKind] ? example.recipeKind : "aires_requirements";
    const result = await enqueueArtifactJob(callId, kind, customPrompt, {
      allowEmptyTranscript: true,
      title: uniqueExamples.length === 1 && title ? title : example.title,
      workstream: "aires_requirements",
      requirementsRunId,
      templateId: example.id,
      requirementsStage: requirementsSuitePlan([example.id])[0]?.stage || "Scope",
      sequence: sequence + 1
    });

    if (result.ok) {
      queued.push({
        jobId: result.job.id,
        templateId: example.id,
        title: result.job.title,
        kind,
        category: example.category
      });
    } else {
      failures.push({
        templateId: example.id,
        title: example.title,
        error: result.error || "Could not queue template work."
      });
    }
  }

  if (!queued.length) {
    return {
      status: "error",
      tool: "generate_aires_template_artifact",
      message: failures[0]?.error || "Could not queue AIRES template work.",
      failures,
      retryable: false
    };
  }

  const queuedTitles = queued.map((item) => item.title).join(", ");
  return {
    status: failures.length ? "partial" : "queued",
    tool: "generate_aires_template_artifact",
    riskLevel: "advisory",
    runId: requirementsRunId,
    jobId: queued[0]?.jobId || "",
    jobs: queued,
    failures,
    message: queued.length === 1
      ? `${queued[0].title} is running in Cooper's work queue from the live conversation.`
      : `${queued.length} AIRES templates are running in Cooper's work queue: ${queuedTitles}.`,
    voice_summary: queued.length === 1
      ? `I started ${queued[0].title}. It will appear on the canvas when it is ready.`
      : `I started ${queued.length} AIRES documents. They will appear in the work queue and canvas as they finish.`
  };
}

async function executeAiresRequirementsTool(args, context = {}) {
  const mode = cleanText(args.mode) || "list_framework";
  const topic = cleanText(args.topic);
  const sourceContext = cleanText(args.source_context);
  const artifactTitle = cleanText(args.artifact_title);
  const focus = cleanText(args.interview_focus) || "problem";
  const documentKey = cleanText(args.document_key) || "all";
  const detailLevel = cleanText(args.detail_level) || "summary";
  const workshopFocus = cleanText(args.workshop_focus) || "shape";
  const currentDraft = cleanText(args.current_draft);
  const goal = cleanText(args.goal);
  const requestedOutput = cleanText(args.requested_output);
  const templateId = cleanText(args.template_id);
  const templateIds = Array.isArray(args.template_ids)
    ? args.template_ids.map((item) => cleanText(item)).filter(Boolean)
    : [];
  const runId = cleanText(args.run_id);

  if (mode === "recommend_artifacts") {
    const recommendations = recommendRequirementsArtifacts({
      context: sourceContext || topic,
      maxRecommendations: args.max_recommendations
    });
    return {
      status: "completed",
      tool: "run_aires_requirements_framework",
      riskLevel: "advisory",
      value: {
        topic: topic || "current discussion",
        recommendations,
        suggestedSequence: recommendations.map((item) => item.id),
        voice_summary: recommendations.length
          ? `I recommend starting with ${recommendations[0].title}. ${recommendations[0].reason}`
          : "I need a little more context before recommending the right requirements artifact."
      }
    };
  }

  if (mode === "draft_outline") {
    const outline = buildRequirementsDraftOutline({
      topic,
      context: sourceContext,
      documentId: templateId
    });
    return {
      status: "completed",
      tool: "run_aires_requirements_framework",
      riskLevel: "advisory",
      value: {
        ...outline,
        voice_summary: `${outline.gist} I would use ${outline.recommendedDocument?.title || "scoped requirements"} and confirm ${outline.missingQuestions[0] || "the first validation slice"}.`
      }
    };
  }

  if (mode === "queue_suite") {
    return executeGenerateAiresTemplateArtifactTool({
      template_id: templateIds.length ? "" : "all",
      template_ids: templateIds,
      title: artifactTitle,
      instruction: requestedOutput || goal || `Generate the AIRES requirements suite for ${topic || "the current discussion"}.`,
      context: sourceContext
    }, {
      ...context,
      requirementsRunId: runId || randomUUID()
    });
  }

  if (mode === "status") {
    const callId = cleanText(context.callId);
    const db = await readDb();
    const relevantJobs = sortByDate((db.jobs || []).filter((job) => (
      job.callId === callId && isRequirementsWorkshopJob(job)
    )));
    const selectedRunId = runId || relevantJobs.find((job) => job.requirementsRunId)?.requirementsRunId || "";
    const selectedJobs = selectedRunId
      ? relevantJobs.filter((job) => job.requirementsRunId === selectedRunId)
      : relevantJobs;
    const counts = selectedJobs.reduce((summary, job) => {
      summary[job.status] = Number(summary[job.status] || 0) + 1;
      return summary;
    }, {});
    const active = Number(counts.queued || 0) + Number(counts.running || 0);
    const failed = Number(counts.failed || 0);
    return {
      status: "completed",
      tool: "run_aires_requirements_framework",
      riskLevel: "advisory",
      value: {
        runId: selectedRunId,
        counts,
        jobs: selectedJobs.map((job) => ({
          id: job.id,
          title: job.title,
          templateId: job.templateId || "",
          stage: job.requirementsStage || "",
          status: job.status,
          progress: job.progress,
          artifactId: job.artifactId || ""
        })),
        voice_summary: !selectedJobs.length
          ? "There is no requirements work running for this call yet."
          : active
            ? `${active} requirements document${active === 1 ? " is" : "s are"} still running, with ${Number(counts.completed || 0)} complete.`
            : failed
              ? `${Number(counts.completed || 0)} requirements documents completed and ${failed} need attention.`
              : `The requirements run is complete with ${Number(counts.completed || 0)} artifacts ready on the canvas.`
      }
    };
  }

  if (mode === "explain_documents" || mode === "explain_document") {
    return explainAiresFrameworkDocuments({
      documentKey: mode === "explain_document" ? documentKey : documentKey || "all",
      detailLevel
    });
  }

  if (mode === "workshop_document") {
    return workshopAiresFrameworkDocument({
      documentKey: documentKey === "all" ? "requirements_framework" : documentKey,
      sourceContext,
      currentDraft,
      goal: goal || topic,
      requestedOutput,
      workshopFocus
    });
  }

  if (mode === "list_framework") {
    const documents = await explainAiresFrameworkDocuments({ documentKey: "all", detailLevel: "summary" });
    return {
      status: "completed",
      tool: "run_aires_requirements_framework",
      riskLevel: "advisory",
      value: {
        name: "AIRES Requirements Framework",
        defaultArtifact: "Scoped requirements",
        flow: ["Capture", "Distill", "Scope", "Slice", "Verify"],
        sections: [
          "Problem and goal with success metrics and 5-whys check",
          "Users and stakeholders",
          "Current state to desired state",
          "Scope: in scope, out of scope now, and non-goals",
          "Data, edge cases, failure modes, constraints, and non-functionals",
          "MoSCoW prioritization",
          "Vertical INVEST slices",
          "Given/When/Then acceptance criteria",
          "Definition of Ready"
        ],
        slicePatterns: [
          "De-risk the unknown first",
          "Workflow step",
          "Persona slice",
          "Rule variation",
          "Data/input variation",
          "Integration seam",
          "Failure mode",
          "Deferred non-functional"
        ],
        documents: documents.value?.documents || [],
        workshopModes: documents.value?.workshopModes || [],
        orchestrationModes: [
          "Recommend the right next artifacts",
          "Explain a spoken draft before generating",
          "Interview for missing requirements context",
          "Generate one document or the full suite in the background",
          "Report grouped run status while the call continues"
        ],
        voice_summary: "The AIRES framework moves messy context through Capture, Distill, Scope, Slice, and Verify, then turns it into scoped requirements with MoSCoW, INVEST slices, acceptance criteria, and a Definition of Ready."
      }
    };
  }

  if (mode === "interview") {
    return {
      status: "completed",
      tool: "run_aires_requirements_framework",
      riskLevel: "advisory",
      value: {
        topic: topic || "current feature idea",
        focus,
        questions: requirementsInterviewQuestions(focus),
        voice_summary: requirementsInterviewVoiceSummary(focus)
      }
    };
  }

  if (mode !== "queue_artifact") {
    return {
      status: "error",
      tool: "run_aires_requirements_framework",
      message: "Use mode list_framework, explain_documents, explain_document, workshop_document, interview, recommend_artifacts, draft_outline, queue_artifact, queue_suite, or status.",
      retryable: false
    };
  }

  const callId = cleanText(context.callId);
  if (!callId) {
    return {
      status: "error",
      tool: "run_aires_requirements_framework",
      message: "No active call is available for the AIRES requirements artifact.",
      retryable: false
    };
  }

  return executeGenerateAiresTemplateArtifactTool({
    template_id: templateId || "scoped_requirements_rep_velocity",
    title: artifactTitle,
    instruction: requestedOutput || goal || `Apply Capture -> Distill -> Scope -> Slice -> Verify to ${topic || "the current discussion"}.`,
    context: sourceContext
  }, {
    ...context,
    requirementsRunId: runId || randomUUID()
  });
}

async function searchContextSources(provider, options) {
  if (provider === "meeting") {
    const db = await readDb();
    const records = normalizeContextSearchResults("meeting", sortByDate(db.calls));
    return {
      status: "completed",
      source: "Cooper call library",
      results: filterContextRecords(records, options)
    };
  }

  if (!options.query && provider !== "notion") {
    return { status: "completed", source: provider === "notion" ? "Notion" : "GitHub", results: [] };
  }

  let execution;
  if (provider === "notion") {
    const select = options.databaseId
      ? "page"
      : options.type === "database"
        ? "database"
        : options.type === "page" || options.type === "ticket"
          ? "page"
          : undefined;
    execution = await executeNotionSearchTool({
      query: options.query || undefined,
      select,
      page_size: options.limit
    });
  } else {
    execution = await executeArcadeMappedTool("inspect_engineering_context", {
      query: options.query,
      repo: options.repository === "all" ? undefined : options.repository,
      include_code: false,
      per_page: options.limit
    });
    if (execution.status === "mapping_required" && arcadeToolMappings.search_workspace_context) {
      execution = await executeArcadeMappedTool("search_workspace_context", {
        query: options.query,
        sources: ["github"]
      });
    }
  }

  if (execution.status !== "completed") return execution;
  const records = normalizeContextSearchResults(provider, execution.value);
  return {
    status: "completed",
    source: execution.source || `Arcade ${provider}`,
    results: filterContextRecords(records, { ...options, parentId: options.databaseId })
  };
}

async function resolveContextPacketSource(source, db) {
  if (source.provider === "paste") {
    return { ...source, resolutionStatus: "completed" };
  }

  if (source.provider === "meeting") {
    const call = db.calls.find((item) => item.id === source.id);
    if (!call) return unresolvedContextSource(source, "Meeting notes were not found in Cooper's call library.");
    return {
      ...source,
      content: formatContextMeeting(call),
      updatedAt: call.updatedAt || call.endedAt || call.startedAt || source.updatedAt,
      resolutionStatus: "completed"
    };
  }

  let execution;
  if (source.provider === "notion") {
    execution = await executeNotionFetchPageTool({
      page_id_or_url: source.url || source.id,
      include_blocks: true,
      max_blocks: notionBlockLimit
    });
    if (execution.status !== "completed") {
      const objectId = extractNotionId(source.url || source.id);
      if (objectId) {
        try {
          const metadata = await fetchNotionObjectMetadata(objectId, source.type === "database" ? "database" : "page");
          const metadataContext = formatNotionMetadataContext(metadata);
          if (metadataContext) {
            return {
              ...source,
              content: metadataContext,
              updatedAt: metadata.last_edited_time || metadata.updatedAt || source.updatedAt,
              resolutionStatus: "completed",
              resolutionMessage: "Page blocks were unavailable; loaded Notion database metadata instead."
            };
          }
        } catch (metadataError) {
          execution = {
            ...execution,
            message: [execution.message, metadataError.message].filter(Boolean).join(" Metadata fallback also failed: ")
          };
        }
      }
    }
  } else if (source.provider === "github") {
    execution = await executeArcadeMappedTool("inspect_engineering_context", {
      query: `Load the selected ${source.type.replaceAll("_", " ")} and its code context: ${source.title}`,
      repo: source.repository || undefined,
      ticket_id: source.id,
      include_code: true
    });
    if (execution.status === "mapping_required" && arcadeToolMappings.search_workspace_context) {
      execution = await executeArcadeMappedTool("search_workspace_context", {
        query: `${source.title} ${source.repository}`.trim(),
        sources: ["github"]
      });
    }
  }

  if (!execution || execution.status !== "completed") {
    return unresolvedContextSource(source, execution?.message || "The connected provider could not resolve this source.", execution?.status);
  }

  return {
    ...source,
    content: source.provider === "notion"
      ? limitText(formatNotionResolvedContext(execution.value, source), projectSourceMaxChars).text
      : contextResultText(execution.value),
    resolutionStatus: "completed",
    resolutionMessage: ""
  };
}

function unresolvedContextSource(source, message, status = "unavailable") {
  return {
    ...source,
    content: source.meta || "",
    resolutionStatus: cleanText(status) || "unavailable",
    resolutionMessage: cleanText(message)
  };
}

function contextResultText(value) {
  if (typeof value === "string") return limitText(value, projectSourceMaxChars).text;
  if (!value || typeof value !== "object") return cleanText(String(value || ""));
  for (const key of ["markdown", "content", "text", "body", "page_content", "file_content", "diff", "patch"]) {
    if (typeof value[key] === "string" && cleanText(value[key])) {
      return limitText(value[key], projectSourceMaxChars).text;
    }
  }
  try {
    return limitText(JSON.stringify(value, null, 2), projectSourceMaxChars).text;
  } catch {
    return "Provider returned structured context that could not be serialized.";
  }
}

function formatContextMeeting(call) {
  const transcript = normalizeTranscript(call.transcript || []);
  return [
    `# ${call.title || "Cooper call"}`,
    call.startedAt ? `Started: ${call.startedAt}` : "",
    call.endedAt ? `Ended: ${call.endedAt}` : "",
    "",
    "## Transcript",
    ...transcript.map((entry) => `${entry.speaker || entry.role || "Participant"}: ${entry.text}`)
  ].filter(Boolean).join("\n");
}

function contextSourceFailureStatus(status) {
  if (["configuration_required", "mapping_required", "authorization_required"].includes(status)) return 409;
  if (status === "error") return 502;
  return 400;
}

async function executeNotionSearchTool(args) {
  if (process.env.ARCADE_API_KEY && arcadeToolMappings.search_notion_workspace) {
    return executeArcadeMappedTool("search_notion_workspace", args);
  }

  if (!process.env.NOTION_API_KEY) {
    return {
      status: "configuration_required",
      tool: "search_notion_workspace",
      message: "Notion is not configured. Either map ARCADE_NOTION_SEARCH_TOOL and pre-authorize it in Settings, or set NOTION_API_KEY for direct read-only Notion API access.",
      missing: ["ARCADE_NOTION_SEARCH_TOOL or NOTION_API_KEY"],
      directEnv: "NOTION_API_KEY",
      arcadeEnv: "ARCADE_NOTION_SEARCH_TOOL"
    };
  }

  const value = await searchNotionDirect(args);
  return {
    status: "completed",
    tool: "search_notion_workspace",
    source: "direct Notion API",
    value
  };
}

async function executeNotionFetchPageTool(args) {
  if (process.env.ARCADE_API_KEY && arcadeToolMappings.fetch_notion_page) {
    return executeArcadeMappedTool("fetch_notion_page", args);
  }

  if (!process.env.NOTION_API_KEY) {
    return {
      status: "configuration_required",
      tool: "fetch_notion_page",
      message: "Notion is not configured. Either map ARCADE_NOTION_FETCH_PAGE_TOOL and pre-authorize it in Settings, or set NOTION_API_KEY for direct read-only Notion API access.",
      missing: ["ARCADE_NOTION_FETCH_PAGE_TOOL or NOTION_API_KEY"],
      directEnv: "NOTION_API_KEY",
      arcadeEnv: "ARCADE_NOTION_FETCH_PAGE_TOOL"
    };
  }

  const pageId = extractNotionId(args.page_id_or_url);
  if (!pageId) {
    return {
      status: "error",
      tool: "fetch_notion_page",
      message: "Provide a valid Notion page URL or page ID.",
      retryable: false
    };
  }

  const value = await fetchNotionPageDirect(pageId, args);
  return {
    status: "completed",
    tool: "fetch_notion_page",
    source: "direct Notion API",
    value
  };
}

async function executeGstackSkillTool(args) {
  const startedAt = Date.now();
  const skill = cleanText(args.skill);
  const mode = cleanText(args.mode) || "advisory";
  const input = cleanText(args.input);
  const context = cleanText(args.context);

  try {
    const result = await runGstackSkill({ skill, mode, input, context });
    const durationMs = Date.now() - startedAt;
    await recordGstackRun({
      skill,
      mode,
      input,
      context,
      result,
      durationMs,
      status: "completed"
    });

    return {
      status: "completed",
      tool: "run_gstack_skill",
      riskLevel: "advisory",
      value: result
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    await recordGstackRun({
      skill,
      mode,
      input,
      context,
      durationMs,
      status: "failed",
      error: error.message || "GStack skill failed."
    });
    throw error;
  }
}

function requirementsInterviewQuestions(focus = "problem") {
  const shared = {
    problem: [
      "What is the real user or business problem underneath the requested solution?",
      "Who feels the pain most acutely today?",
      "What metric or observable behavior should move if this works?"
    ],
    stakeholders: [
      "Who is the primary user, who approves done, and who verifies quality?",
      "Whose workflow or data changes downstream?",
      "Who needs to be consulted before scope is locked?"
    ],
    scope: [
      "What is the smallest useful version we should include in this pass?",
      "What valuable work should be explicitly out of scope now?",
      "What is a non-goal so the feature does not sprawl?"
    ],
    data: [
      "What is the source of truth for the data this work touches?",
      "What are the likely edge cases: duplicates, permissions, stale records, retries, or empty states?",
      "Are there security, compliance, tenancy, observability, or performance constraints?"
    ],
    slices: [
      "What is the thinnest vertical slice that delivers observable value end-to-end?",
      "Which uncertainty should we de-risk first?",
      "Can each slice be completed and tested in roughly one to two days?"
    ],
    acceptance: [
      "What user action or system event should each acceptance criterion start from?",
      "What observable outcome proves the behavior works?",
      "What failure mode needs a Given/When/Then test?"
    ],
    ready: [
      "Is the problem, goal, and success metric written down?",
      "Are in scope, out of scope now, and non-goals explicit?",
      "Are the slices vertical, INVEST, and small enough to pull?"
    ]
  };
  return shared[focus] || shared.problem;
}

function requirementsInterviewVoiceSummary(focus = "problem") {
  return {
    problem: "Let's start problem-first: who has the pain, what outcome do we want, and what metric tells us it worked?",
    stakeholders: "I would lock the people map next: primary user, sign-off owner, verifier, and downstream teams affected by the change.",
    scope: "Let's draw the boundary clearly: what ships now, what waits, and what this work explicitly will not become.",
    data: "The requirements will get sharper if we clarify source of truth, edge cases, failure modes, and non-functional constraints.",
    slices: "I would turn this into thin vertical slices next, starting with the riskiest assumption or the smallest observable workflow step.",
    acceptance: "Let's make the behavior testable with Given/When/Then criteria tied to user actions, system events, and visible outcomes.",
    ready: "The ready gate is simple: problem, owner, scope, data, constraints, acceptance criteria, and a vertical slice the team can actually pull."
  }[focus] || "Let's gather the missing requirements context, then turn it into scoped, sliceable work.";
}

function checkCalendar(date, time) {
  const busyBlocks = [
    { date: "2026-05-12", start: "09:00", end: "10:30" },
    { date: "2026-05-12", start: "14:00", end: "15:00" },
    { date: "2026-05-13", start: "11:00", end: "12:00" }
  ];
  const normalizedTime = normalizeTime(time);
  const isBusy = busyBlocks.some((block) => block.date === date && normalizedTime >= block.start && normalizedTime < block.end);

  return {
    date,
    time,
    available: !isBusy,
    message: isBusy ? "That slot is currently blocked on the sample calendar." : "That slot is available on the sample calendar.",
    source: "local sample calendar"
  };
}

async function searchNotionDirect(args) {
  const filter = cleanText(args.select || args.filter) || "all";
  const fetchAll = Number(args.page_size) === -1;
  const pageSize = fetchAll ? 100 : clampNumber(args.page_size, 1, 100, notionSearchLimit);
  const body = { page_size: pageSize, sort: { direction: "descending", timestamp: "last_edited_time" } };
  const query = cleanText(args.query);
  if (query) body.query = query;

  if (filter === "page" || filter === "pages") {
    body.filter = { property: "object", value: "page" };
  } else if (filter === "database" || filter === "data_sources" || filter === "databases") {
    body.filter = { property: "object", value: notionSearchDataObject() };
  }

  const results = [];
  const seenCursors = new Set();
  let startCursor = "";
  while (true) {
    const payload = await notionRequest("/search", {
      method: "POST",
      body: JSON.stringify({ ...body, ...(startCursor ? { start_cursor: startCursor } : {}) })
    });
    results.push(...(Array.isArray(payload.results) ? payload.results : []));
    if (!fetchAll || !payload.has_more || !payload.next_cursor || seenCursors.has(payload.next_cursor)) break;
    seenCursors.add(payload.next_cursor);
    startCursor = payload.next_cursor;
  }

  return {
    query,
    filter,
    count: results.length,
    results: results.map(notionSearchResultSummary)
  };
}

async function fetchNotionPageDirect(pageId, args) {
  const includeBlocks = args.include_blocks !== false;
  const maxBlocks = clampNumber(args.max_blocks, 1, 100, notionBlockLimit);
  const page = await notionRequest(`/pages/${pageId}`);
  const blocks = includeBlocks ? await fetchNotionBlocks(pageId, maxBlocks) : [];
  const markdown = limitText(blocks.map(notionBlockToMarkdown).filter(Boolean).join("\n"), 16000);

  return {
    page: notionPageSummary(page),
    includeBlocks,
    blockCount: blocks.length,
    content: markdown.text,
    truncated: markdown.truncated
  };
}

async function fetchNotionBlocks(blockId, maxBlocks) {
  const blocks = [];
  let startCursor = "";

  while (blocks.length < maxBlocks) {
    const limit = Math.min(100, maxBlocks - blocks.length);
    const query = new URLSearchParams({ page_size: String(limit) });
    if (startCursor) query.set("start_cursor", startCursor);
    const payload = await notionRequest(`/blocks/${blockId}/children?${query.toString()}`);
    blocks.push(...(Array.isArray(payload.results) ? payload.results : []));
    if (!payload.has_more || !payload.next_cursor) break;
    startCursor = payload.next_cursor;
  }

  return blocks;
}

async function notionRequest(path, options = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `Notion API failed with ${response.status}.`);
  }
  return payload;
}

function notionSearchResultSummary(item) {
  if (item.object === "database" || item.object === "data_source") {
    return {
      id: item.id || "",
      object: item.object,
      title: notionDataSourceTitle(item),
      url: item.url || "",
      lastEditedAt: item.last_edited_time || "",
      parentId: item.parent?.page_id || "",
      parentType: item.parent?.type || ""
    };
  }

  return notionPageSummary(item);
}

function notionSearchDataObject() {
  return notionVersion >= "2025-09-03" ? "data_source" : "database";
}

function notionDataSourceTitle(item) {
  return notionRichText(item.title) || cleanText(item.name) || "Untitled Notion data source";
}

function notionPageSummary(page) {
  return {
    id: page.id || "",
    object: page.object || "page",
    title: notionPageTitle(page),
    url: page.url || "",
    parentId: page.parent?.database_id || page.parent?.data_source_id || page.parent?.page_id || "",
    parentType: page.parent?.type || "",
    createdAt: page.created_time || "",
    lastEditedAt: page.last_edited_time || "",
    archived: Boolean(page.archived || page.is_archived),
    inTrash: Boolean(page.in_trash),
    properties: isPlainObject(page.properties) ? page.properties : {}
  };
}

function notionPageTitle(page) {
  const properties = isPlainObject(page.properties) ? page.properties : {};
  for (const property of Object.values(properties)) {
    if (property?.type === "title") {
      return notionRichText(property.title);
    }
  }
  return notionRichText(page.title) || "Untitled Notion page";
}

function notionBlockToMarkdown(block) {
  const type = block?.type;
  const value = block?.[type] || {};
  const text = notionRichText(value.rich_text);

  switch (type) {
    case "heading_1":
      return text ? `# ${text}` : "";
    case "heading_2":
      return text ? `## ${text}` : "";
    case "heading_3":
      return text ? `### ${text}` : "";
    case "paragraph":
      return text ? `${text}\n` : "";
    case "bulleted_list_item":
      return text ? `- ${text}` : "";
    case "numbered_list_item":
      return text ? `1. ${text}` : "";
    case "to_do":
      return text ? `- [${value.checked ? "x" : " "}] ${text}` : "";
    case "quote":
      return text ? `> ${text}` : "";
    case "callout":
      return text ? `> ${text}` : "";
    case "toggle":
      return text ? `<details><summary>${escapeHtml(text)}</summary></details>` : "";
    case "code":
      return `\`\`\`${cleanText(value.language)}\n${text}\n\`\`\``;
    case "child_page":
      return value.title ? `- Child page: ${value.title}` : "";
    case "divider":
      return "---";
    default:
      return text;
  }
}

function notionRichText(items) {
  if (!Array.isArray(items)) return "";
  return items
    .map((item) => cleanText(item.plain_text || item.text?.content || ""))
    .filter(Boolean)
    .join("");
}

function extractNotionId(value) {
  return extractNotionObjectId(value);
}

async function executeArcadeMappedTool(name, args) {
  const arcadeToolName = arcadeToolMappings[name];
  if (!process.env.ARCADE_API_KEY) {
    return {
      status: "configuration_required",
      tool: name,
      message: "Arcade is not configured yet. Set ARCADE_API_KEY and ARCADE_USER_ID in .env, then map this Cooper tool to an Arcade tool.",
      missing: ["ARCADE_API_KEY"],
      mappingEnv: mappingEnvName(name)
    };
  }

  if (!arcadeToolName) {
    return {
      status: "mapping_required",
      tool: name,
      message: `No Arcade tool mapping is configured for ${name}. Set ${mappingEnvName(name)} to the Arcade qualified tool name.`,
      mappingEnv: mappingEnvName(name),
      gatewayUrl: arcadeMcpGatewayUrl || null
    };
  }

  const authorization = await getArcadeAuthorizationForTool(name);
  if (authorization?.status !== "completed") {
    return {
      status: "authorization_required",
      tool: name,
      arcadeToolName,
      authorizationUrl: authorization?.authorizationUrl || null,
      authorizationStatus: authorization?.status || "not_started",
      message: authorization?.authorizationUrl
        ? "This Arcade tool has not finished pre-authorization. Open Settings, complete the connection, then check status."
        : "This Arcade tool must be pre-authorized in Settings before Cooper can use it in a live call."
    };
  }

  const input = sanitizeArcadeInput(name, args, arcadeToolName);
  const client = getArcadeClient();
  let response;

  try {
    response = await client.tools.execute({
      tool_name: arcadeToolName,
      input,
      user_id: arcadeUserId
    });
  } catch (error) {
    return normalizeArcadeThrownError(name, arcadeToolName, error);
  }

  if (response?.success === false || response?.output?.error) {
    const authorization = await maybeAuthorizeArcadeTool(client, arcadeToolName, response);
    if (authorization) {
      const storedAuthorization = await upsertArcadeAuthorization(name, arcadeToolName, authorization, {
        error: null,
        lastCheckedAt: new Date().toISOString()
      });
      return {
        status: "authorization_required",
        tool: name,
        arcadeToolName,
        authorizationUrl: storedAuthorization.authorizationUrl || null,
        authorizationStatus: storedAuthorization.status || null,
        message: authorization.url
          ? "Arcade says this connection needs authorization again. Open Settings, complete the connection, then check status."
          : "Arcade says this connection needs authorization again. Open Settings and reconnect the tool."
      };
    }

    return {
      status: "error",
      tool: name,
      arcadeToolName,
      message: response.output?.error?.message || "Arcade tool failed.",
      errorKind: response.output?.error?.kind || "UNKNOWN",
      retryable: Boolean(response.output?.error?.can_retry)
    };
  }

  if (response?.output?.authorization) {
    const storedAuthorization = await upsertArcadeAuthorization(name, arcadeToolName, response.output.authorization, {
      error: null,
      lastCheckedAt: new Date().toISOString()
    });
    return {
      status: "authorization_required",
      tool: name,
      arcadeToolName,
      authorizationUrl: storedAuthorization.authorizationUrl || null,
      authorizationStatus: storedAuthorization.status || null,
      message: storedAuthorization.authorizationUrl
        ? "Arcade says this connection needs authorization again. Open Settings, complete the connection, then check status."
        : "Arcade says this connection needs authorization again. Open Settings and reconnect the tool."
    };
  }

  return {
    status: "completed",
    tool: name,
    arcadeToolName,
    executionId: response?.execution_id || response?.id || null,
    durationMs: response?.duration || null,
    value: response?.output?.value ?? response?.output ?? response
  };
}

async function startArcadeAuthorization(name) {
  const arcadeToolName = arcadeToolMappings[name];
  if (!arcadeToolName) {
    throw new Error(`No Arcade tool mapping is configured for ${name}.`);
  }

  const client = getArcadeClient();
  const response = await client.tools.authorize({
    tool_name: arcadeToolName,
    user_id: arcadeUserId
  });

  return upsertArcadeAuthorization(name, arcadeToolName, response, {
    error: null,
    lastCheckedAt: new Date().toISOString()
  });
}

async function startArcadeServiceAuthorization(service) {
  const client = getArcadeClient();
  const catalogItems = arcadeDiscoveryCatalog.filter((item) => (
    item.service === service && (arcadeWritesEnabled || item.kind !== "write")
  ));
  const tools = await Promise.all(catalogItems.map((item) => getArcadeCatalogTool(client, item)));
  const availableTools = tools.filter((tool) => tool.available && tool.authorization?.providerId);
  const authorization = availableTools[0]?.authorization;

  if (!authorization?.providerId) {
    const detail = tools.find((tool) => tool.error)?.error;
    throw new Error(detail || `Arcade did not report an authorization provider for ${service}.`);
  }

  const scopes = [...new Set(availableTools.flatMap((tool) => tool.authorization?.scopes || []))];
  return client.auth.authorize({
    auth_requirement: {
      provider_id: authorization.providerId,
      provider_type: authorization.providerType || "oauth2",
      oauth2: { scopes }
    },
    user_id: arcadeUserId
  });
}

async function getArcadeAuthorizationForTool(name) {
  const db = await readDb();
  return latestArcadeAuthorization(db, name);
}

function latestArcadeAuthorization(db, name) {
  return sortByDate(db.arcadeAuthorizations || [])
    .find((item) => item.toolName === name && item.userId === arcadeUserId) || null;
}

async function upsertArcadeAuthorization(name, arcadeToolName, response = {}, patch = {}) {
  return updateDb((db) => {
    const now = new Date().toISOString();
    db.arcadeAuthorizations = Array.isArray(db.arcadeAuthorizations) ? db.arcadeAuthorizations : [];
    const existing = db.arcadeAuthorizations.find((item) => item.toolName === name && item.userId === arcadeUserId);
    const next = {
      id: existing?.id || randomUUID(),
      toolName: name,
      arcadeToolName,
      userId: arcadeUserId,
      authorizationId: response.id || existing?.authorizationId || "",
      authorizationUrl: response.url || existing?.authorizationUrl || "",
      providerId: response.provider_id || existing?.providerId || "",
      scopes: Array.isArray(response.scopes) ? response.scopes : existing?.scopes || [],
      status: response.status || patch.status || existing?.status || "not_started",
      error: patch.error ?? existing?.error ?? null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastCheckedAt: patch.lastCheckedAt || existing?.lastCheckedAt || now
    };

    if (existing) {
      Object.assign(existing, next);
      return existing;
    }

    db.arcadeAuthorizations.push(next);
    return next;
  });
}

function getArcadeClient() {
  if (!arcadeClient) {
    arcadeClient = new Arcade({ apiKey: process.env.ARCADE_API_KEY });
  }
  return arcadeClient;
}

function getArcadeDiscoveryClient() {
  if (!arcadeDiscoveryClient) {
    arcadeDiscoveryClient = new Arcade({
      apiKey: process.env.ARCADE_API_KEY,
      timeout: 12000,
      maxRetries: 0
    });
  }
  return arcadeDiscoveryClient;
}

async function getTodayRemoteSources({ force = false } = {}) {
  const now = Date.now();
  if (!force && todayRemoteCache?.expiresAtMs > now) return todayRemoteCache.value;
  if (todayRemoteRefresh) return todayRemoteRefresh;

  todayRemoteRefresh = (async () => {
    const bounds = zonedDayBounds(new Date(), todayTimeZone);
    const [calendarResult, notionResult] = await Promise.allSettled([
      loadTodayCalendar(bounds),
      loadTodayNotionSprint()
    ]);
    const updatedAt = new Date().toISOString();
    const expiresAtMs = Date.now() + todayCacheMs;
    const value = {
      date: bounds.date,
      updatedAt,
      expiresAt: new Date(expiresAtMs).toISOString(),
      calendar: calendarResult.status === "fulfilled"
        ? calendarResult.value
        : failedTodaySource("Google Calendar", calendarResult.reason),
      notion: notionResult.status === "fulfilled"
        ? notionResult.value
        : failedTodaySource("Notion Sprint Board", notionResult.reason)
    };
    todayRemoteCache = { expiresAtMs, value };
    return value;
  })();

  try {
    return await todayRemoteRefresh;
  } finally {
    todayRemoteRefresh = null;
  }
}

async function refreshDailyBrief({ trigger = "manual", force = true } = {}) {
  if (dailyBriefRefresh) return dailyBriefRefresh;
  dailyBriefRefresh = (async () => {
    const remote = await getTodayRemoteSources({ force });
    const brief = buildDailyBrief({
      date: remote.date,
      timeZone: todayTimeZone,
      meetings: remote.calendar.items,
      tasks: remote.notion.items,
      sprint: remote.notion.sprint || null,
      sources: {
        calendar: remote.calendar.source,
        notion: remote.notion.source
      },
      assigneeSelectors: dailyBriefAssignees,
      generatedAt: new Date().toISOString(),
      trigger
    });
    await updateDb((db) => {
      db.dailyBriefs = Array.isArray(db.dailyBriefs) ? db.dailyBriefs : [];
      db.dailyBriefs = [brief, ...db.dailyBriefs.filter((item) => item.date !== brief.date)].slice(0, 30);
    });
    return brief;
  })();

  try {
    return await dailyBriefRefresh;
  } finally {
    dailyBriefRefresh = null;
  }
}

function scheduleDailyBrief() {
  if (dailyBriefTimer) clearTimeout(dailyBriefTimer);
  const delay = millisecondsUntilLocalHour(new Date(), todayTimeZone, dailyBriefHour);
  dailyBriefTimer = setTimeout(async () => {
    try {
      await refreshDailyBrief({ trigger: "scheduled", force: true });
      console.log(`[Daily Brief] Refreshed at ${dailyBriefHour}:00 ${todayTimeZone}.`);
    } catch (error) {
      console.error("[Daily Brief] Scheduled refresh failed:", error.message);
    } finally {
      scheduleDailyBrief();
    }
  }, delay);
}

async function loadTodayCalendar(bounds) {
  const payload = await executeArcadeReadTool(todayCalendarTool, {
    min_end_datetime: bounds.start,
    max_start_datetime: bounds.end,
    max_results: 50
  });
  const items = normalizeCalendarEvents(payload, {
    now: new Date(),
    timeZone: todayTimeZone
  });
  return {
    items,
    source: {
      status: "connected",
      label: "Google Calendar",
      count: items.length,
      message: items.length ? `${items.length} calendar event${items.length === 1 ? "" : "s"} loaded for today.` : "No calendar events today."
    }
  };
}

async function loadTodayNotionSprint() {
  if (!todayNotionSprintAnchorPageId && !todayNotionActiveSprintId) {
    throw new Error("Set COOPER_NOTION_SPRINT_ANCHOR_PAGE_ID or COOPER_NOTION_ACTIVE_SPRINT_ID.");
  }

  let anchorMetadata = null;
  let activeSprintId = todayNotionActiveSprintId;
  let databaseId = todayNotionSprintDatabaseId;
  if (todayNotionSprintAnchorPageId) {
    anchorMetadata = await fetchNotionObjectMetadata(todayNotionSprintAnchorPageId);
    databaseId = databaseId || anchorMetadata?.parent?.database_id || "";
    activeSprintId = activeSprintId
      || (notionPropertyValue(anchorMetadata?.properties || {}, ["Sprint", "Sprints"]) || [])[0]
      || "";
  }
  if (!activeSprintId) {
    throw new Error("The configured Notion anchor task is not related to a sprint.");
  }

  const sprintMetadata = await fetchNotionObjectMetadata(activeSprintId);
  const sprint = normalizeNotionSprintMetadata(sprintMetadata);
  if (!sprint.current && !todayNotionActiveSprintId) {
    throw new Error(`The anchor task points to ${sprint.title}, but Notion does not mark that sprint as Current.`);
  }

  const taskIds = [...new Set([
    ...sprint.taskIds,
    todayNotionSprintAnchorPageId
  ].filter(Boolean))];
  const metadataResults = await mapWithConcurrency(taskIds, 5, async (taskId) => {
    try {
      return await fetchNotionObjectMetadata(taskId);
    } catch (error) {
      console.warn(`Could not load Notion Sprint Board task ${taskId}:`, error.message);
      return null;
    }
  });
  const items = sortNotionTasks(metadataResults
    .map((metadata) => normalizeNotionTaskMetadata(metadata, {
      databaseId,
      activeSprintId,
      sprintTitle: sprint.title
    }))
    .filter(Boolean));

  return {
    items,
    sprint: {
      id: sprint.id,
      title: sprint.title,
      status: sprint.status,
      dates: sprint.dates,
      url: sprint.url,
      totalTasks: sprint.taskIds.length,
      visibleTasks: items.length,
      databaseId
    },
    source: {
      status: metadataResults.some(Boolean) ? "connected" : "error",
      label: "Notion Sprint Board",
      count: items.length,
      message: `${items.length} unfinished task${items.length === 1 ? "" : "s"} loaded from ${sprint.title}.`
    }
  };
}

async function fetchNotionObjectMetadata(objectId, objectType = "page") {
  return executeArcadeReadTool(todayNotionMetadataTool, {
    object_id: objectId,
    object_type: objectType
  });
}

async function executeArcadeReadTool(toolName, input) {
  if (!process.env.ARCADE_API_KEY) {
    throw new Error("Arcade is not configured. Add ARCADE_API_KEY in Settings and connect the provider in Arcade.");
  }
  if (!toolName) throw new Error("The Arcade read tool is not configured.");

  console.log(`[Arcade Today] ${toolName}`, JSON.stringify(input));
  let response;
  try {
    response = await getArcadeClient().tools.execute({
      tool_name: toolName,
      input,
      user_id: arcadeUserId
    });
  } catch (error) {
    throw new Error(error.message || `${toolName} could not run.`);
  }

  const outputError = response?.output?.error;
  if (outputError) {
    const requirement = ["TOOL_REQUIREMENTS_NOT_MET", "UPSTREAM_RUNTIME_AUTH_ERROR"].includes(outputError.kind)
      ? " Reconnect this provider in Settings."
      : "";
    throw new Error(`${outputError.message || `${toolName} failed.`}${requirement}`);
  }
  if (response?.success === false) {
    throw new Error(`${toolName} failed. Reconnect this provider in Settings.`);
  }
  return arcadeOutputValue(response);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function failedTodaySource(label, error) {
  return {
    items: [],
    sprint: null,
    source: {
      status: /not configured|missing|set COOPER_/i.test(error?.message || "") ? "configuration_required" : "error",
      label,
      count: 0,
      message: error?.message || `${label} could not be loaded.`
    }
  };
}

async function maybeAuthorizeArcadeTool(client, arcadeToolName, response) {
  const errorKind = response?.output?.error?.kind || "";
  if (!["TOOL_REQUIREMENTS_NOT_MET", "UPSTREAM_RUNTIME_AUTH_ERROR"].includes(errorKind)) {
    return null;
  }

  try {
    return client.tools.authorize({
      tool_name: arcadeToolName,
      user_id: arcadeUserId
    });
  } catch {
    return null;
  }
}

function arcadeSettingsState(db) {
  return {
    configured: Boolean(process.env.ARCADE_API_KEY),
    userId: arcadeUserId,
    gatewayUrl: arcadeMcpGatewayUrl || null,
    writesEnabled: arcadeWritesEnabled,
    tools: arcadeToolSettings(db),
    mappings: Object.fromEntries(
      Object.entries(arcadeToolMappings).map(([name, mappedTool]) => [name, Boolean(mappedTool)])
    ),
    recentToolCalls: sortByDate(db.toolCalls || []).slice(0, 12).map(publicToolCall)
  };
}

async function arcadeDiscoveryState() {
  if (!process.env.ARCADE_API_KEY) {
    return {
      configured: false,
      userId: arcadeUserId,
      gatewayUrl: arcadeMcpGatewayUrl || null,
      connections: [],
      services: arcadeServiceSummaries([], []),
      catalogTools: [],
      error: "Missing ARCADE_API_KEY."
    };
  }

  const client = getArcadeDiscoveryClient();
  const [connectionsResult, toolsResult] = await Promise.all([
    withTimeout(listArcadeConnections(client), 12000, "Arcade connection list timed out."),
    withTimeout(listArcadeCatalogTools(client), 16000, "Arcade tool discovery timed out.")
  ]);
  const connections = connectionsResult.ok ? connectionsResult.value : [];
  const catalogTools = toolsResult.ok ? toolsResult.value : [];

  return {
    configured: true,
    userId: arcadeUserId,
    gatewayUrl: arcadeMcpGatewayUrl || null,
    connections,
    services: arcadeServiceSummaries(connections, catalogTools),
    catalogTools,
    errors: [
      connectionsResult.ok ? "" : connectionsResult.error,
      toolsResult.ok ? "" : toolsResult.error
    ].filter(Boolean)
  };
}

async function listArcadeConnections(client) {
  try {
    const connections = [];
    for await (const connection of client.admin.userConnections.list({ user_id: arcadeUserId, limit: 50 })) {
      connections.push(publicArcadeConnection(connection));
      if (connections.length >= 50) break;
    }
    return connections;
  } catch (error) {
    throw new Error(error.message || "Could not list Arcade user connections.");
  }
}

async function listArcadeCatalogTools(client) {
  return Promise.all(arcadeDiscoveryCatalog.map((item) => getArcadeCatalogTool(client, item)));
}

async function getArcadeCatalogTool(client, item) {
  try {
    const tool = await client.tools.get(item.toolName, { user_id: arcadeUserId });
    return {
      ...item,
      available: true,
      fullName: tool.fully_qualified_name || tool.qualified_name || item.toolName,
      description: cleanText(tool.description).slice(0, 240),
      readOnly: Boolean(tool.metadata?.behavior?.read_only),
      operations: Array.isArray(tool.metadata?.behavior?.operations) ? tool.metadata.behavior.operations : [],
      authorization: publicArcadeToolRequirement(tool.requirements?.authorization)
    };
  } catch (error) {
    return {
      ...item,
      available: false,
      fullName: item.toolName,
      description: "",
      error: error.message || "Tool unavailable."
    };
  }
}

function arcadeServiceSummaries(connections, catalogTools) {
  return [...new Set(arcadeDiscoveryCatalog.map((item) => item.service))].map((service) => {
    const tools = catalogTools.filter((tool) => tool.service === service);
    const connection = findArcadeServiceConnection(service, connections, tools);
    const availableTools = tools.filter((tool) => tool.available);
    const writeTools = availableTools.filter((tool) => tool.kind === "write");
    const authorization = availableTools.map((tool) => tool.authorization).find((item) => item?.providerId) || null;
    const scopes = [...new Set(availableTools.flatMap((tool) => tool.authorization?.scopes || []))];
    const toolAuthorizationStatuses = availableTools
      .map((tool) => tool.authorization?.status)
      .filter(Boolean);
    const connectionActive = Boolean(connection && !/inactive|failed|revoked|expired/i.test(connection.status));
    const connected = toolAuthorizationStatuses.length
      ? toolAuthorizationStatuses.some((status) => ["active", "completed"].includes(status))
      : connectionActive;
    return {
      service,
      connected,
      status: connected ? "completed" : connection?.status || "not_connected",
      providerId: connection?.providerId || authorization?.providerId || "",
      providerType: connection?.providerType || authorization?.providerType || "oauth2",
      scopes,
      connectable: Boolean(connection?.providerId || authorization?.providerId),
      providerUser: connection?.providerUser || null,
      toolCount: availableTools.length,
      writeToolCount: writeTools.length,
      capabilities: availableTools.map((tool) => ({
        capability: tool.capability,
        kind: tool.kind,
        toolName: tool.fullName || tool.toolName,
        authorizationStatus: tool.authorization?.status || ""
      }))
    };
  });
}

function findArcadeServiceConnection(service, connections, tools) {
  const needles = [
    service,
    ...tools.map((tool) => tool.toolkit),
    ...tools.map((tool) => tool.authorization?.providerId || "")
  ].map((value) => cleanText(value).toLowerCase()).filter(Boolean);

  return connections.find((connection) => {
    const haystack = [
      connection.providerId,
      connection.providerDescription,
      connection.providerType
    ].map((value) => cleanText(value).toLowerCase()).join(" ");
    return needles.some((needle) => haystack.includes(needle.replace(/\s+/g, "")) || haystack.includes(needle));
  }) || null;
}

function publicArcadeConnection(connection = {}) {
  return {
    id: connection.id || connection.connection_id || "",
    connectionId: connection.connection_id || connection.id || "",
    status: connection.connection_status || "unknown",
    providerId: connection.provider_id || "",
    providerDescription: connection.provider_description || "",
    providerType: connection.provider_type || "",
    providerUser: sanitizeProviderUserInfo(connection.provider_user_info),
    scopes: Array.isArray(connection.scopes) ? connection.scopes : [],
    userId: connection.user_id || ""
  };
}

function publicArcadeToolRequirement(authorization = {}) {
  if (!authorization || typeof authorization !== "object") return null;
  return {
    providerId: authorization.provider_id || authorization.id || "",
    providerType: authorization.provider_type || "",
    status: authorization.token_status || authorization.status || "",
    statusReason: authorization.status_reason || "",
    scopes: Array.isArray(authorization.oauth2?.scopes) ? authorization.oauth2.scopes : []
  };
}

function publicArcadeProviderAuthorization(authorization = {}) {
  return {
    id: authorization.id || "",
    authorizationUrl: authorization.url || "",
    providerId: authorization.provider_id || "",
    scopes: Array.isArray(authorization.scopes) ? authorization.scopes : [],
    status: authorization.status || "not_started"
  };
}

function sanitizeProviderUserInfo(value) {
  if (!value || typeof value !== "object") return null;
  const source = isPlainObject(value) ? value : {};
  return {
    name: cleanText(source.name || source.display_name || source.login || source.username),
    email: cleanText(source.email),
    id: cleanText(source.id || source.sub || source.user_id)
  };
}

async function withTimeout(promise, ms, timeoutMessage) {
  try {
    const value = await Promise.race([
      promise,
      wait(ms).then(() => {
        throw new Error(timeoutMessage);
      })
    ]);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, value: null, error: error.message || timeoutMessage };
  }
}

function arcadeToolSettings(db) {
  return Object.entries(arcadeToolMappings).map(([name, arcadeToolName]) => {
    const definition = cooperToolDefinitions.find((tool) => tool.name === name);
    const authorization = latestArcadeAuthorization(db, name);
    const configured = Boolean(process.env.ARCADE_API_KEY);
    const mapped = Boolean(arcadeToolName);
    const status = !configured
      ? "missing_api_key"
      : !mapped
        ? "missing_mapping"
        : authorization?.status || "not_started";

    return {
      name,
      label: toolLabel(name),
      description: definition?.description || "",
      arcadeToolName: arcadeToolName || "",
      mappingEnv: mappingEnvName(name),
      mapped,
      configured,
      status,
      riskLevel: toolRiskLevel(name),
      authorization: publicArcadeAuthorization(authorization)
    };
  });
}

function publicArcadeAuthorization(authorization) {
  if (!authorization) return null;
  return {
    id: authorization.id || "",
    toolName: authorization.toolName || "",
    arcadeToolName: authorization.arcadeToolName || "",
    userId: authorization.userId || "",
    authorizationId: authorization.authorizationId || "",
    authorizationUrl: authorization.authorizationUrl || "",
    providerId: authorization.providerId || "",
    scopes: Array.isArray(authorization.scopes) ? authorization.scopes : [],
    status: authorization.status || "not_started",
    error: authorization.error || null,
    lastCheckedAt: authorization.lastCheckedAt || "",
    updatedAt: authorization.updatedAt || ""
  };
}

function normalizeArcadeThrownError(name, arcadeToolName, error) {
  const message = error?.message || "Arcade request failed.";
  const needsAuth = /authorization|authorize|auth/i.test(message);
  return {
    status: needsAuth ? "authorization_required" : "error",
    tool: name,
    arcadeToolName,
    message: needsAuth
      ? "Arcade says this tool needs authorization. Open the Arcade connection flow for this tool and retry."
      : message,
    retryable: !needsAuth
  };
}

function sanitizeArcadeInput(name, args, arcadeToolName = "") {
  const mappedName = arcadeToolBaseName(arcadeToolName);

  if (mappedName === "NotionToolkit.SearchByTitle") {
    const requestedLimit = Number(args.page_size || args.limit);
    const input = {
      limit: requestedLimit === -1 ? -1 : clampNumber(requestedLimit, 1, 100, notionSearchLimit),
      order_by: "descending"
    };
    const query = cleanText(args.query || args.customer_name || args.title);
    const select = cleanText(args.select || args.filter);
    if (query) input.query = query;
    if (["page", "database"].includes(select)) input.select = select;
    return input;
  }

  if (mappedName === "NotionToolkit.GetPageContentById") {
    const pageIdSource = cleanText(args.page_id || args.page_id_or_url || args.id);
    return {
      page_id: extractNotionId(pageIdSource) || pageIdSource
    };
  }

  if (mappedName === "NotionToolkit.GetPageContentByTitle") {
    return {
      title: cleanText(args.title || args.page_id_or_url || args.query)
    };
  }

  if (mappedName === "Github.GetUserOpenItems") {
    return {
      per_page: clampNumber(args.per_page, 1, 100, 30)
    };
  }

  if (mappedName === "NotionToolkit.CreatePage") {
    const description = cleanText(args.description);
    const owner = cleanText(args.owner);
    const dueDate = cleanText(args.due_date);
    const actionType = cleanText(args.action_type);
    return {
      parent_title: cleanText(args.destination) || "Cooper Follow-ups",
      title: cleanText(args.title),
      content: [
        description,
        actionType ? `\n\nAction type: ${actionType}` : "",
        owner ? `\nOwner: ${owner}` : "",
        dueDate ? `\nDue date: ${dueDate}` : ""
      ].filter(Boolean).join("")
    };
  }

  if (name === "search_workspace_context") {
    return {
      query: cleanText(args.query),
      sources: Array.isArray(args.sources) ? args.sources.map(cleanText).filter(Boolean) : undefined,
      customer_or_account: cleanText(args.customer_or_account) || undefined,
      time_range: cleanText(args.time_range) || undefined
    };
  }

  if (name === "get_customer_context") {
    return {
      customer_name: cleanText(args.customer_name),
      include: Array.isArray(args.include) ? args.include.map(cleanText).filter(Boolean) : undefined
    };
  }

  if (name === "search_notion_workspace") {
    return {
      query: cleanText(args.query),
      filter: cleanText(args.filter) || undefined,
      page_size: clampNumber(args.page_size, 1, 10, notionSearchLimit)
    };
  }

  if (name === "fetch_notion_page") {
    return {
      page_id_or_url: cleanText(args.page_id_or_url),
      include_blocks: args.include_blocks !== false,
      max_blocks: clampNumber(args.max_blocks, 1, 100, notionBlockLimit)
    };
  }

  if (name === "inspect_engineering_context") {
    return {
      query: cleanText(args.query),
      repo: cleanText(args.repo) || undefined,
      ticket_id: cleanText(args.ticket_id) || undefined,
      include_code: Boolean(args.include_code)
    };
  }

  if (name === "create_followup_action") {
    return {
      action_type: cleanText(args.action_type),
      title: cleanText(args.title),
      description: cleanText(args.description) || undefined,
      owner: cleanText(args.owner) || undefined,
      due_date: cleanText(args.due_date) || undefined,
      destination: cleanText(args.destination) || undefined
    };
  }

  return safeAuditObject(args);
}

function arcadeToolBaseName(value) {
  return cleanText(value).split("@")[0];
}

async function ensureDataStore() {
  await mkdir(artifactsDir, { recursive: true });
  if (!existsSync(dbPath)) {
    const initial = { calls: [], artifacts: [], jobs: [], toolCalls: [], gstackRuns: [], arcadeAuthorizations: [], projects: [], projectSources: [], contextPackets: [], operatorTasks: [], dailyBriefs: [], mobilePushDevices: [], mobilePushEvents: [] };
    hydrateKnowledgeState(initial);
    await writeFile(dbPath, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readDb() {
  await writeQueue;
  return readDbRaw();
}

async function readDbRaw() {
  await ensureDataStore();
  const raw = await readFile(dbPath, "utf8");
  const parsed = JSON.parse(raw || "{}");
  const needsKnowledgeMigration = !Array.isArray(parsed.knowledgeDocuments) || !Array.isArray(parsed.knowledgeVersions);
  const db = {
    calls: Array.isArray(parsed.calls) ? parsed.calls : [],
    artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
    jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [],
    gstackRuns: Array.isArray(parsed.gstackRuns) ? parsed.gstackRuns : [],
    arcadeAuthorizations: Array.isArray(parsed.arcadeAuthorizations) ? parsed.arcadeAuthorizations : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    projectSources: Array.isArray(parsed.projectSources) ? parsed.projectSources : [],
    contextPackets: Array.isArray(parsed.contextPackets) ? parsed.contextPackets : [],
    operatorTasks: Array.isArray(parsed.operatorTasks) ? parsed.operatorTasks : [],
    dailyBriefs: Array.isArray(parsed.dailyBriefs) ? parsed.dailyBriefs : [],
    mobilePushDevices: Array.isArray(parsed.mobilePushDevices) ? parsed.mobilePushDevices : [],
    mobilePushEvents: Array.isArray(parsed.mobilePushEvents) ? parsed.mobilePushEvents : [],
    knowledgeDocuments: Array.isArray(parsed.knowledgeDocuments) ? parsed.knowledgeDocuments : [],
    knowledgeVersions: Array.isArray(parsed.knowledgeVersions) ? parsed.knowledgeVersions : [],
    knowledgeSessions: Array.isArray(parsed.knowledgeSessions) ? parsed.knowledgeSessions : [],
    knowledgeMessages: Array.isArray(parsed.knowledgeMessages) ? parsed.knowledgeMessages : [],
    knowledgeIndexRecords: Array.isArray(parsed.knowledgeIndexRecords) ? parsed.knowledgeIndexRecords : [],
    knowledgeConfig: parsed.knowledgeConfig && typeof parsed.knowledgeConfig === "object" ? parsed.knowledgeConfig : {}
  };
  hydrateKnowledgeState(db);
  if (needsKnowledgeMigration) await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
  return db;
}

async function updateDb(mutator) {
  const operation = writeQueue.then(async () => {
    const db = await readDbRaw();
    const mobilePushBefore = mobilePushSnapshot(db);
    const result = await mutator(db);
    db.mobilePushEvents = enqueueMobilePushEvents(
      mobilePushEvents(mobilePushBefore, db),
      db.mobilePushEvents
    );
    await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
    broadcastEvent("state.updated", { at: new Date().toISOString() });
    scheduleMobilePushWorker(100);
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function publicState(db) {
  return {
    calls: sortByDate(db.calls).map(publicCall),
    projects: sortByDate(db.projects).map((project) =>
      publicProject(project, db.projectSources.filter((source) => source.projectId === project.id))
    ),
    contextPackets: sortByDate(db.contextPackets || []).slice(0, 20).map(publicContextPacket),
    artifacts: sortByDate(db.artifacts).map(publicArtifact),
    jobs: sortByDate(db.jobs).map(publicJob),
    toolCalls: sortByDate(db.toolCalls || []).slice(0, 20).map(publicToolCall),
    gstackRuns: sortByDate(db.gstackRuns || []).slice(0, 20).map(publicGstackRun),
    arcade: arcadeSettingsState(db),
    pushToTalk: pushToTalkConfigFromEnv(process.env),
    mobilePush: publicMobilePushStatus(db),
    mcpApps: {
      servers: publicMcpAppServers()
    },
    recipes: Object.entries(artifactRecipes).map(([kind, recipe]) => ({
      kind,
      title: recipe.title,
      outputType: recipe.outputType || "markdown",
      stepCount: recipe.steps.length,
      pipeline: DOCUMENT_PIPELINE_STAGES
    })),
    limits: {
      jobDelayMs,
      workModel,
      fallbackWorkModel,
      jobMaxAttempts,
      jobMaxOutputTokens,
      jobQualityGateEnabled,
      jobQualityMinimumScore,
      jobQualityRepairAttempts,
      gstackModel: process.env.COOPER_GSTACK_MODEL || workModel,
      gstackMaxOutputTokens: Number(process.env.COOPER_GSTACK_MAX_OUTPUT_TOKENS || 2200)
    }
  };
}

function publicMobilePushStatus(db) {
  const devices = (db.mobilePushDevices || []).filter((device) => device.enabled !== false);
  const events = sortByDate(db.mobilePushEvents || []).slice(0, 12);
  return {
    configured: mobilePushConfig.configured,
    environment: mobilePushConfig.environment,
    bundleId: mobilePushConfig.bundleId,
    missing: mobilePushConfig.missing,
    associatedAppId: iosAssociatedAppId,
    registeredDevices: devices.length,
    pendingEvents: events.filter((event) => event.status === "pending").length,
    lastEvent: events[0] ? publicMobilePushEvent(events[0]) : null
  };
}

function publicMobileReadiness(db) {
  return {
    generatedAt: new Date().toISOString(),
    host: {
      authenticated: true,
      openAIConfigured: Boolean(process.env.OPENAI_API_KEY)
    },
    apns: publicMobilePushStatus(db),
    universalLinks: {
      hostAssociationConfigured: Boolean(iosAssociatedAppId),
      associatedAppId: iosAssociatedAppId
    },
    meetings: {
      calendarHandoffMode: "external_url",
      webZoomSDKConfigured: Boolean(zoomSdkKey && zoomSdkSecret),
      hostRoleEnabled: zoomHostRoleEnabled,
      nativeEmbeddedSDKConfigured: false
    }
  };
}

function publicMobilePushDevice(device) {
  return {
    id: device.id,
    installationId: device.installationId,
    tokenHash: device.tokenHash,
    platform: device.platform,
    environment: device.environment,
    bundleId: device.bundleId,
    deviceName: device.deviceName,
    locale: device.locale,
    enabled: device.enabled !== false,
    updatedAt: device.updatedAt,
    lastDeliveryAt: device.lastDeliveryAt || null,
    lastError: device.lastError || ""
  };
}

function publicMobilePushEvent(event) {
  return {
    id: event.id,
    kind: event.kind,
    title: event.title,
    route: event.route,
    status: event.status,
    attempts: Number(event.attempts || 0),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt
  };
}

function publicOperatorState(db) {
  const tasks = sortByDate(db.operatorTasks || []).map((task) => publicOperatorTask(task, db));
  const runtime = operatorRuntimeInfo(process.env);
  return {
    runtime: {
      ...runtime,
      codexConnection: {
        connected: codexClient.connected,
        transportMode: codexClient.transportMode,
        durableDaemon: ["daemon-proxy", "detached-socket"].includes(codexClient.transportMode),
        lastError: codexClient.lastError
      }
    },
    presets: OPERATOR_PRESETS,
    tasks,
    activeTask: tasks.find(isOperatorTaskActive) || tasks[0] || null,
    limits: {
      activeTasks: tasks.filter(isOperatorTaskActive).length,
      approvalQueue: tasks.reduce((count, task) => count + task.approvals.filter((approval) => approval.status === "pending").length, 0)
    }
  };
}

function publicOperatorTask(task, db) {
  const shaped = operatorTaskPublic(task);
  const jobIds = new Set(shaped.jobIds || []);
  const generatedJobs = sortByDate((db.jobs || []).filter((job) => jobIds.has(job.id))).map(publicJob);
  const generatedArtifacts = sortByDate((db.artifacts || []).filter((artifact) => jobIds.has(artifact.jobId))).map(publicArtifact);
  return {
    ...shaped,
    generatedJobs,
    generatedArtifacts
  };
}

async function addProjectSource(projectId, input) {
  const content = cleanText(input.content);
  if (!content) return null;

  const now = new Date().toISOString();
  const limited = limitText(content, projectSourceMaxChars);
  return updateDb((db) => {
    const project = db.projects.find((item) => item.id === projectId);
    if (!project) return null;

    const externalId = cleanText(input.externalId);
    const existing = externalId
      ? db.projectSources.find((item) => item.projectId === projectId && item.externalId === externalId)
      : null;
    const source = existing || {
      id: randomUUID(),
      projectId,
      createdAt: now,
      updatedAt: now
    };
    Object.assign(source, {
      title: cleanText(input.title) || "Project context",
      sourceType: cleanText(input.sourceType) || "paste",
      mimeType: cleanText(input.mimeType),
      originalName: cleanText(input.originalName),
      externalId,
      text: limited.text,
      charCount: content.length,
      storedCharCount: limited.text.length,
      truncated: limited.truncated,
      updatedAt: now
    });

    if (!existing) db.projectSources.push(source);
    project.updatedAt = now;
    for (const call of db.calls.filter((item) => item.status === "active" && item.projectId === projectId)) {
      syncCallProjectContext(db, call, now);
    }
    return source;
  });
}

async function extractProjectUpload(file) {
  const name = cleanText(file.originalname) || "Uploaded context";
  const lower = name.toLowerCase();
  const mimeType = cleanText(file.mimetype);

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      const content = cleanText(result.text);
      if (!content) throw new Error("No extractable text was found in that PDF.");
      return {
        title: name,
        sourceType: "pdf",
        mimeType: "application/pdf",
        content
      };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (
    mimeType.startsWith("text/") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".txt")
  ) {
    const content = cleanText(file.buffer.toString("utf8"));
    if (!content) throw new Error("That file did not contain readable text.");
    return {
      title: name,
      sourceType: lower.endsWith(".md") || lower.endsWith(".markdown") ? "markdown" : "text",
      mimeType: mimeType || "text/plain",
      content
    };
  }

  throw new Error("Unsupported file type. Upload Markdown, plain text, or PDF.");
}

function buildProjectContext(db, projectId, maxChars = projectContextChars) {
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) return "";

  const sources = sortByDate(db.projectSources.filter((source) => source.projectId === project.id));
  const lines = [
    "# Active Project Context",
    "",
    `Project: ${project.title}`,
    project.description ? `Description: ${project.description}` : "",
    `Sources loaded: ${sources.length}`,
    "",
    "Cooper should use this project context as background for sprint tickets, feature epics, agent-generated plans, product requirements, implementation notes, and prioritization discussions. Treat it as local working context, ask clarifying questions when content conflicts, and do not invent facts outside it."
  ].filter(Boolean);

  let remaining = Math.max(0, maxChars - lines.join("\n").length);
  for (const source of sources.slice(0, 8)) {
    if (remaining <= 200) break;
    const header = `\n\n## Source: ${source.title}\nType: ${source.sourceType || "text"}${source.originalName ? `\nFile: ${source.originalName}` : ""}\n`;
    const bodyBudget = Math.max(0, remaining - header.length - 40);
    const body = limitText(source.text || "", bodyBudget);
    lines.push(`${header}${body.text}${body.truncated ? "\n[Source truncated for live call context.]" : ""}`);
    remaining = maxChars - lines.join("\n").length;
  }

  return limitText(lines.join("\n").trim(), maxChars).text;
}

function syncCallProjectContext(db, call, now = new Date().toISOString()) {
  const project = call.projectId
    ? db.projects.find((item) => item.id === call.projectId)
    : null;
  call.projectId = project?.id || "";
  call.projectTitle = project?.title || "";
  call.projectContextSnapshot = project ? buildProjectContext(db, project.id) : "";
  call.updatedAt = now;
  return project;
}

function buildLiveCallContext(db, call, { includeActiveTranscript = true } = {}) {
  const project = call.projectId
    ? db.projects.find((item) => item.id === call.projectId)
    : null;
  const projectContext = call.status === "active" && project
    ? buildProjectContext(db, project.id)
    : call.projectContextSnapshot || (project ? buildProjectContext(db, project.id) : "");
  const resumeContext = call.resumePacket ? formatSessionResumeContext(call.resumePacket) : "";
  const contextPacketContext = boundedContextPacketContext(
    contextPacketsForCall(db, call),
    contextPacketMaxChars
  );
  const activeTranscriptContext = includeActiveTranscript ? formatActiveCallTranscript(call) : "";
  return {
    project,
    projectContext,
    sessionContext: composeRealtimeSessionContext(
      projectContext,
      resumeContext,
      contextPacketContext,
      activeTranscriptContext
    )
  };
}

function formatActiveCallTranscript(call, { maxTurns = 16, maxChars = 14_000 } = {}) {
  const turns = Array.isArray(call?.transcript) ? call.transcript.slice(-maxTurns) : [];
  if (!turns.length) return "";
  const lines = turns
    .map((entry) => `${normalizeSpeaker(entry.speaker)}: ${cleanText(entry.text)}`)
    .filter((line) => !line.endsWith(": "));
  if (!lines.length) return "";
  return limitText([
    "# Current session transcript",
    "These public turns already happened in this same durable session. Continue from them across chat and voice without asking Michael to repeat himself.",
    ...lines
  ].join("\n"), maxChars).text;
}

function buildCallResumePacket(db, call) {
  return buildSessionResumePacket({
    call,
    artifacts: db.artifacts.filter((artifact) => artifact.callId === call.id),
    jobs: db.jobs.filter((job) => job.callId === call.id),
    priorPacket: call.resumeSourcePacket || null
  });
}

function publicCall(call) {
  const {
    projectContextSnapshot: _projectContextSnapshot,
    resumeSourcePacket: _resumeSourcePacket,
    ...rest
  } = call;
  return {
    ...rest,
    projectId: rest.projectId || "",
    projectTitle: rest.projectTitle || ""
  };
}

function publicProject(project, sources = []) {
  const sortedSources = sortByDate(sources).map(publicProjectSource);
  return {
    id: project.id,
    title: project.title || "Untitled project",
    description: project.description || "",
    status: project.status || "active",
    sourceCount: sortedSources.length,
    totalChars: sources.reduce((sum, source) => sum + Number(source.storedCharCount || source.text?.length || 0), 0),
    sources: sortedSources,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastUsedAt: project.lastUsedAt || null
  };
}

function publicProjectSource(source) {
  return {
    id: source.id,
    projectId: source.projectId,
    title: source.title || "Project context",
    sourceType: source.sourceType || "text",
    mimeType: source.mimeType || "",
    originalName: source.originalName || "",
    charCount: Number(source.charCount || source.text?.length || 0),
    storedCharCount: Number(source.storedCharCount || source.text?.length || 0),
    truncated: Boolean(source.truncated),
    preview: sourcePreview(source.text),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  };
}

function publicJob(job) {
  const { draft: _draft, ...rest } = job;
  return {
    ...rest,
    draftCharCount: Number(rest.draftCharCount || _draft?.length || 0),
    logs: Array.isArray(rest.logs) ? rest.logs.slice(-40) : []
  };
}

function publicToolCall(toolCall) {
  return {
    id: toolCall.id,
    callId: toolCall.callId || "",
    userId: toolCall.userId || "",
    toolName: toolCall.toolName || "",
    arcadeToolName: toolCall.arcadeToolName || null,
    riskLevel: toolCall.riskLevel || "read",
    status: toolCall.status || "unknown",
    resultSummary: toolCall.resultSummary || "",
    error: toolCall.error || null,
    durationMs: toolCall.durationMs || null,
    createdAt: toolCall.createdAt,
    updatedAt: toolCall.updatedAt
  };
}

function publicGstackRun(run) {
  return {
    id: run.id,
    skill: run.skill || "",
    mode: run.mode || "advisory",
    status: run.status || "unknown",
    inputLength: Number(run.inputLength || 0),
    contextLength: Number(run.contextLength || 0),
    resultLength: Number(run.resultLength || 0),
    inputRedacted: Boolean(run.inputRedacted),
    durationMs: run.durationMs || null,
    error: run.error || null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  };
}

function publicArtifact(artifact) {
  const outputType = artifactOutputType(artifact);
  return {
    ...artifact,
    outputType,
    extension: artifact.extension || defaultArtifactExtension(outputType),
    mimeType: artifact.mimeType || defaultArtifactMimeType(outputType)
  };
}

function sortByDate(items) {
  return [...items].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

async function updateToolCall(id, patch) {
  return updateDb((db) => {
    const toolCall = db.toolCalls.find((item) => item.id === id);
    if (!toolCall) return null;
    Object.assign(toolCall, patch, { updatedAt: new Date().toISOString() });
    return toolCall;
  });
}

async function appendTranscriptToCall(callId, entry) {
  return updateDb((db) => {
    const call = db.calls.find((item) => item.id === callId);
    if (!call) return null;
    const existingIndex = call.transcript.findIndex((item) => sameTranscriptTurn(item, entry));
    if (existingIndex >= 0) {
      call.transcript[existingIndex] = { ...call.transcript[existingIndex], ...entry };
    } else {
      call.transcript.push(entry);
    }
    call.updatedAt = new Date().toISOString();
    return call;
  });
}

async function recordSessionChatUsage(callId, response) {
  if (!response?.usage) return;
  await updateDb((db) => {
    const call = db.calls.find((item) => item.id === callId);
    if (!call) return null;
    call.chatUsage = addResponsesApiUsage(call.chatUsage, response.usage, {
      model: response.model || chatModel,
      at: new Date().toISOString()
    });
    call.updatedAt = new Date().toISOString();
    return call;
  });
}

function writeSessionChatEvent(res, payload) {
  if (res.writableEnded || res.destroyed) return;
  const type = cleanText(payload?.type) || "message";
  res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function recordGstackRun({ skill, mode, input = "", context = "", result = null, durationMs = null, status = "completed", error = null }) {
  const now = new Date().toISOString();
  const inputText = cleanText(input);
  const contextText = cleanText(context);
  const resultLength = result ? JSON.stringify(result).length : 0;
  const inputRedacted = containsSensitiveText(inputText) || containsSensitiveText(contextText);

  console.info("GStack skill run", {
    skill,
    mode,
    status,
    inputLength: inputText.length,
    contextLength: contextText.length,
    resultLength,
    durationMs,
    inputRedacted
  });

  return updateDb((db) => {
    db.gstackRuns = Array.isArray(db.gstackRuns) ? db.gstackRuns : [];
    db.gstackRuns.push({
      id: randomUUID(),
      skill,
      mode,
      status,
      inputLength: inputText.length,
      contextLength: contextText.length,
      resultLength,
      inputRedacted,
      durationMs,
      error: error ? cleanText(error).slice(0, 500) : null,
      createdAt: now,
      updatedAt: now
    });
    db.gstackRuns = sortByDate(db.gstackRuns).slice(0, 200);
  });
}

function defaultSuggestions(enabled = false) {
  return [
    { kind: "post_call_kit", label: "Post-call kit", enabled },
    { kind: "execution_plan", label: "Execution plan", enabled },
    { kind: "product_requirements", label: "PRD", enabled },
    { kind: "aires_requirements", label: "AIRES requirements", enabled },
    { kind: "mermaid_diagram", label: "Mermaid diagram", enabled },
    { kind: "ui_wireframe", label: "UI wireframe", enabled },
    { kind: "html_prototype", label: "HTML prototype", enabled },
    { kind: "follow_up", label: "Follow-up summary", enabled },
    { kind: "code_sketch", label: "Code sketch", enabled }
  ];
}

function normalizeTranscript(transcript) {
  return transcript
    .map((entry) => ({
      id: entry.id || randomUUID(),
      at: entry.at || new Date().toISOString(),
      speaker: normalizeSpeaker(entry.speaker),
      text: cleanText(entry.text),
      source: cleanText(entry.source),
      responseId: cleanText(entry.responseId),
      itemId: cleanText(entry.itemId)
    }))
    .filter((entry) => entry.text);
}

function normalizeCallUsage(value) {
  if (!value || typeof value !== "object") return null;
  return {
    model: cleanText(value.model) || "gpt-realtime-2",
    transcriptionModel: cleanText(value.transcriptionModel) || "gpt-4o-mini-transcribe",
    startedAt: cleanText(value.startedAt),
    updatedAt: cleanText(value.updatedAt) || new Date().toISOString(),
    responses: positiveInteger(value.responses),
    transcriptionEvents: positiveInteger(value.transcriptionEvents),
    response: normalizeUsageTotals(value.response),
    transcription: normalizeUsageTotals(value.transcription),
    costUsd: positiveMoney(value.costUsd),
    costSource: cleanText(value.costSource) || "actual_usage",
    costBreakdown: {
      realtimeUsd: positiveMoney(value.costBreakdown?.realtimeUsd),
      transcriptionUsd: positiveMoney(value.costBreakdown?.transcriptionUsd)
    }
  };
}

function normalizeUsageTotals(value = {}) {
  return {
    totalTokens: positiveInteger(value.totalTokens),
    inputTokens: positiveInteger(value.inputTokens),
    outputTokens: positiveInteger(value.outputTokens),
    inputTextTokens: positiveInteger(value.inputTextTokens),
    inputAudioTokens: positiveInteger(value.inputAudioTokens),
    inputImageTokens: positiveInteger(value.inputImageTokens),
    cachedTokens: positiveInteger(value.cachedTokens),
    cachedTextTokens: positiveInteger(value.cachedTextTokens),
    cachedAudioTokens: positiveInteger(value.cachedAudioTokens),
    cachedImageTokens: positiveInteger(value.cachedImageTokens),
    outputTextTokens: positiveInteger(value.outputTextTokens),
    outputAudioTokens: positiveInteger(value.outputAudioTokens)
  };
}

function positiveInteger(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function positiveMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 1_000_000) / 1_000_000 : 0;
}

function normalizeSpeaker(value) {
  const speaker = cleanText(value);
  if (!speaker || speaker === "speaker") return "Michael";
  if (speaker.toLowerCase() === "assistant") return "Cooper";
  if (speaker.toLowerCase() === "user") return "Michael";
  return speaker;
}

function sameTranscriptTurn(left, right) {
  if (left.id && right.id && left.id === right.id) return true;
  if (left.responseId && right.responseId && left.responseId === right.responseId && left.speaker === right.speaker) return true;
  if (left.itemId && right.itemId && left.itemId === right.itemId && left.speaker === right.speaker) return true;
  return false;
}

function toolRiskLevel(name) {
  if (name === "create_followup_action") return "write";
  if (name === "create_canvas_artifact") return "advisory";
  if (name === "create_document_artifact") return "advisory";
  if (name === "render_mcp_app") return "advisory";
  if (name === "present_aires_example") return "advisory";
  if (name === "generate_aires_template_artifact") return "advisory";
  if (name === "run_aires_requirements_framework") return "advisory";
  return "read";
}

function mappingEnvName(name) {
  return {
    search_workspace_context: "ARCADE_SEARCH_WORKSPACE_TOOL",
    search_notion_workspace: "ARCADE_NOTION_SEARCH_TOOL",
    fetch_notion_page: "ARCADE_NOTION_FETCH_PAGE_TOOL",
    get_customer_context: "ARCADE_CUSTOMER_CONTEXT_TOOL",
    inspect_engineering_context: "ARCADE_ENGINEERING_CONTEXT_TOOL",
    create_followup_action: "ARCADE_CREATE_FOLLOWUP_TOOL"
  }[name] || "";
}

function toolLabel(name) {
  return {
    search_workspace_context: "Workspace context",
    search_notion_workspace: "Notion search",
    fetch_notion_page: "Notion page",
    get_customer_context: "Customer context",
    inspect_engineering_context: "Engineering context",
    create_followup_action: "Follow-up actions",
    create_document_artifact: "Document pipeline",
    render_mcp_app: "MCP App canvas",
    present_aires_example: "AIRES example canvas",
    generate_aires_template_artifact: "AIRES template generator",
    run_aires_requirements_framework: "AIRES requirements"
  }[name] || name;
}

function parseMcpAppServers(value) {
  const text = cleanText(value);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    const sourceServers = Array.isArray(parsed)
      ? parsed
      : isPlainObject(parsed?.mcpServers)
        ? Object.entries(parsed.mcpServers).map(([id, config]) => ({
          ...(isPlainObject(config) ? config : {}),
          serverId: config?.serverId || config?.id || id
        }))
        : [];

    return sourceServers
      .map((server, index) => {
        const type = cleanText(server.type).toLowerCase() === "sse" ? "sse" : "http";
        const headers = isPlainObject(server.headers)
          ? Object.fromEntries(
            Object.entries(server.headers)
              .map(([key, headerValue]) => [cleanText(key), cleanText(headerValue)])
              .filter(([key, headerValue]) => key && headerValue)
          )
          : {};
        return {
          type,
          url: cleanText(server.url),
          serverId: cleanText(server.serverId || server.id || server.name) || `mcp-app-${index + 1}`,
          headers
        };
      })
      .filter((server) => server.url);
  } catch (error) {
    console.warn("Could not parse COOPER_MCP_APP_SERVERS:", error.message);
    return [];
  }
}

function findMcpAppServer(serverId) {
  if (!mcpAppServers.length) return null;
  const requested = cleanText(serverId);
  if (!requested) return mcpAppServers[0];
  return mcpAppServers.find((server) => server.serverId === requested) || null;
}

function publicMcpAppServers() {
  return mcpAppServers.map((server) => ({
    serverId: server.serverId,
    type: server.type,
    configured: Boolean(server.url)
  }));
}

async function fetchMcpAppResource(server, resourceUri) {
  if (server.type !== "http") {
    throw new Error(`MCP App server "${server.serverId}" uses ${server.type}; only HTTP resource reads are supported in this local host.`);
  }

  const headers = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    ...server.headers
  };
  if (!headers.Authorization && process.env.ARCADE_API_KEY && /arcade\.dev/i.test(server.url)) {
    headers.Authorization = `Bearer ${process.env.ARCADE_API_KEY}`;
  }

  const response = await fetch(server.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "resources/read",
      params: { uri: resourceUri }
    })
  });
  const payload = await readMcpJsonRpcResponse(response);

  if (!response.ok) {
    throw new Error(payload?.error?.message || `MCP resource read failed with ${response.status}.`);
  }
  if (payload?.error) {
    throw new Error(payload.error.message || "MCP resource read returned an error.");
  }

  const resource = extractMcpResourceHtml(payload);
  if (!resource.html) {
    throw new Error(`MCP resource ${resourceUri} did not include text/html content.`);
  }
  return resource;
}

async function readMcpJsonRpcResponse(response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    const dataLines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");

    for (const line of dataLines.reverse()) {
      try {
        return JSON.parse(line);
      } catch {
        // Continue looking for the final JSON-RPC data event.
      }
    }
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractMcpResourceHtml(payload) {
  const contents = Array.isArray(payload?.result?.contents)
    ? payload.result.contents
    : Array.isArray(payload?.contents)
      ? payload.contents
      : [];

  for (const content of contents) {
    const mimeType = cleanText(content.mimeType || content.mime_type);
    if (content.text && /html/i.test(mimeType)) {
      return { html: normalizeHtml(content.text), mimeType };
    }
    if (content.blob && /html/i.test(mimeType)) {
      return { html: normalizeHtml(Buffer.from(content.blob, "base64").toString("utf8")), mimeType };
    }
  }

  const textContent = contents.find((content) => cleanText(content.text));
  if (textContent) {
    return {
      html: mcpAppPlaceholderHtml({
        title: "MCP Resource",
        description: "The MCP resource returned text content instead of an HTML app.",
        state: { mimeType: textContent.mimeType || "text/plain" },
        messages: [cleanText(textContent.text).slice(0, 2000)]
      }),
      mimeType: textContent.mimeType || "text/plain"
    };
  }

  return { html: "", mimeType: "" };
}

function mcpAppPlaceholderHtml({ title, description = "", serverId = "", resourceUri = "", toolName = "", state = {}, messages = [] }) {
  const stateJson = JSON.stringify(state || {}, null, 2);
  const messageHtml = messages.length
    ? messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")
    : "<li>Waiting for an MCP App resource or inline preview.</li>";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --black: #1b2421; --ink: #26302c; --muted: #66736c; --line: #dce2dc; --bg: #f4f5f1; --volt: #f0de4a; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
    main { display: grid; gap: 18px; max-width: 880px; margin: 0 auto; padding: clamp(18px, 4vw, 42px); }
    header { border-left: 4px solid var(--volt); padding-left: 16px; }
    p, li { line-height: 1.55; }
    .eyebrow { margin: 0 0 8px; color: var(--muted); font-size: 0.75rem; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; }
    h1 { margin: 0; color: var(--black); font-size: clamp(1.7rem, 5vw, 3.2rem); line-height: 1.02; }
    section { padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    dl { display: grid; grid-template-columns: minmax(96px, auto) 1fr; gap: 8px 14px; margin: 0; }
    dt { color: var(--muted); font-weight: 800; }
    dd { margin: 0; overflow-wrap: anywhere; }
    pre { max-height: 260px; margin: 0; overflow: auto; white-space: pre-wrap; font: 0.85rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">AG-UI / MCP App Surface</p>
      <h1>${escapeHtml(title)}</h1>
      ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    </header>
    <section>
      <dl>
        <dt>Server</dt><dd>${escapeHtml(serverId || "Not configured")}</dd>
        <dt>Resource</dt><dd>${escapeHtml(resourceUri || "Inline or pending")}</dd>
        <dt>Tool</dt><dd>${escapeHtml(toolName || "render_mcp_app")}</dd>
      </dl>
    </section>
    <section>
      <p class="eyebrow">State Snapshot</p>
      <pre>${escapeHtml(stateJson)}</pre>
    </section>
    <section>
      <p class="eyebrow">Activity</p>
      <ul>${messageHtml}</ul>
    </section>
  </main>
  <script>
    window.parent.postMessage({
      source: "cooper-mcp-app",
      type: "STATE_SNAPSHOT",
      snapshot: ${JSON.stringify(state || {})}
    }, "*");
  </script>
</body>
</html>`;
}

function summarizeToolResult(output) {
  const text = JSON.stringify(output);
  return text.length > 900 ? `${text.slice(0, 897)}...` : text;
}

function limitText(value, maxChars) {
  const text = cleanText(value);
  const limit = Math.max(0, Number(maxChars || 0));
  if (!limit || text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit).trim(), truncated: true };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Math.min(max, Math.max(min, Number(fallback) || min));
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function sourcePreview(value) {
  const text = cleanText(value).replace(/\s+/g, " ");
  return text.length > 280 ? `${text.slice(0, 277)}...` : text;
}

function safeToolArguments(name, args) {
  if (name === "run_gstack_skill") {
    const input = cleanText(args.input);
    const context = cleanText(args.context);
    return {
      skill: cleanText(args.skill),
      mode: cleanText(args.mode) || "advisory",
      inputLength: input.length,
      contextLength: context.length,
      inputRedacted: containsSensitiveText(input) || containsSensitiveText(context)
    };
  }

  if (name === "create_canvas_artifact") {
    const prompt = cleanText(args.prompt);
    const context = cleanText(args.context);
    return {
      kind: cleanText(args.kind),
      title: cleanText(args.title),
      promptLength: prompt.length,
      contextLength: context.length,
      inputRedacted: containsSensitiveText(prompt) || containsSensitiveText(context)
    };
  }

  if (name === "create_document_artifact") {
    const instruction = cleanText(args.instruction);
    const context = cleanText(args.context);
    return {
      kind: cleanText(args.kind),
      title: cleanText(args.title),
      priority: cleanText(args.priority) || "normal",
      instructionLength: instruction.length,
      contextLength: context.length,
      inputRedacted: containsSensitiveText(instruction) || containsSensitiveText(context)
    };
  }

  if (name === "render_mcp_app") {
    const html = cleanText(args.html);
    return {
      title: cleanText(args.title),
      serverId: cleanText(args.server_id),
      resourceUri: cleanText(args.resource_uri),
      toolName: cleanText(args.tool_name),
      hasInlineHtml: Boolean(html),
      htmlLength: html.length,
      stateKeys: isPlainObject(args.state) ? Object.keys(args.state).slice(0, 20) : [],
      inputRedacted: containsSensitiveText(html) || containsSensitiveText(JSON.stringify(args.state || {}))
    };
  }

  if (name === "present_aires_example") {
    const context = cleanText(args.context);
    return {
      exampleId: cleanText(args.example_id),
      mode: cleanText(args.mode) || "educate",
      reason: cleanText(args.reason),
      contextLength: context.length,
      inputRedacted: containsSensitiveText(context)
    };
  }

  if (name === "generate_aires_template_artifact") {
    const instruction = cleanText(args.instruction);
    const context = cleanText(args.context);
    return {
      templateId: cleanText(args.template_id),
      templateIds: Array.isArray(args.template_ids) ? args.template_ids.map(cleanText).filter(Boolean).slice(0, 12) : [],
      title: cleanText(args.title),
      instructionLength: instruction.length,
      contextLength: context.length,
      inputRedacted: containsSensitiveText(instruction) || containsSensitiveText(context)
    };
  }

  if (name === "run_aires_requirements_framework") {
    const sourceContext = cleanText(args.source_context);
    return {
      mode: cleanText(args.mode),
      topic: cleanText(args.topic),
      artifactTitle: cleanText(args.artifact_title),
      interviewFocus: cleanText(args.interview_focus),
      sourceContextLength: sourceContext.length,
      inputRedacted: containsSensitiveText(sourceContext)
    };
  }

  if (name === "search_notion_workspace") {
    const query = cleanText(args.query);
    return {
      queryLength: query.length,
      filter: cleanText(args.filter) || "all",
      pageSize: clampNumber(args.page_size, 1, 10, notionSearchLimit),
      inputRedacted: containsSensitiveText(query)
    };
  }

  if (name === "fetch_notion_page") {
    return {
      pageIdOrUrlProvided: Boolean(cleanText(args.page_id_or_url)),
      includeBlocks: args.include_blocks !== false,
      maxBlocks: clampNumber(args.max_blocks, 1, 100, notionBlockLimit)
    };
  }

  return safeAuditObject(args);
}

function safeAuditObject(value) {
  if (!isPlainObject(value)) return {};
  const blocked = new Set(["password", "token", "secret", "api_key", "apikey", "authorization"]);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      blocked.has(key.toLowerCase()) ? "[redacted]" : safeAuditValue(item)
    ])
  );
}

function safeAuditValue(value) {
  if (Array.isArray(value)) return value.map(safeAuditValue);
  if (isPlainObject(value)) return safeAuditObject(value);
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 497)}...` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return String(value || "");
}

function containsSensitiveText(value) {
  const text = cleanText(value);
  if (!text) return false;
  return [
    /\bsk-[A-Za-z0-9_-]{12,}\b/,
    /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
    /(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*[:=]/i,
    /bearer\s+[A-Za-z0-9._-]{12,}/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
  ].some((pattern) => pattern.test(text));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function artifactFileName(artifact) {
  if (artifact.file) {
    return artifact.file.split(/[\\/]/).pop();
  }
  const outputType = artifactOutputType(artifact);
  return `${artifact.id}.${artifact.extension || defaultArtifactExtension(outputType)}`;
}

function artifactMimeType(artifact) {
  if (artifact.mimeType) return artifact.mimeType;
  return defaultArtifactMimeType(artifactOutputType(artifact));
}

function artifactOutputType(artifact) {
  return artifactOutputTypeFromMetadata(artifact);
}

function defaultArtifactExtension(outputType) {
  if (outputType === "pdf") return "pdf";
  if (outputType === "docx") return "docx";
  if (outputType === "pptx") return "pptx";
  if (outputType === "xlsx") return "xlsx";
  if (outputType === "html") return "html";
  if (outputType === "mcp_app") return "json";
  return "md";
}

function defaultArtifactMimeType(outputType) {
  if (outputType === "pdf") return "application/pdf";
  if (outputType === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (outputType === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (outputType === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (outputType === "html") return "text/html";
  if (outputType === "mcp_app") return "application/json";
  return "text/markdown";
}

function artifactOutputLabel(outputType) {
  if (outputType === "pdf") return "PDF artifact";
  if (outputType === "docx") return "Word artifact";
  if (outputType === "pptx") return "PowerPoint artifact";
  if (outputType === "xlsx") return "Excel artifact";
  if (outputType === "html") return "HTML artifact";
  if (outputType === "mcp_app") return "MCP App artifact";
  return "Markdown artifact";
}

function normalizeMarkdown(value) {
  return `${value.trim()}\n`;
}

function normalizeHtml(value) {
  return `${value.trim()}\n`;
}

function extractHtmlDocument(value) {
  const text = cleanText(value);
  if (!text) return "";

  const fenced = [...text.matchAll(/```(?:html)?\s*([\s\S]*?)```/gi)]
    .map((match) => cleanText(match[1]))
    .filter((candidate) => /<html[\s>]|<!doctype html/i.test(candidate));
  if (fenced.length) return normalizeHtml(fenced[fenced.length - 1]);

  const lower = text.toLowerCase();
  const doctypeIndex = lower.lastIndexOf("<!doctype html");
  if (doctypeIndex >= 0) return normalizeHtml(text.slice(doctypeIndex));

  const htmlIndex = lower.lastIndexOf("<html");
  if (htmlIndex >= 0) return normalizeHtml(`<!doctype html>\n${text.slice(htmlIndex)}`);

  return "";
}

function prototypeFallbackHtml(title, draft) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #f3f4ef; color: #171b1a; }
    main { max-width: 720px; margin: 0 auto; padding: 24px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 16px; border: 1px solid #dce2dc; border-radius: 8px; background: #fff; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>Cooper could not isolate a complete HTML document, so the prototype draft is shown below.</p>
    <pre>${escapeHtml(draft)}</pre>
  </main>
</body>
</html>`;
}

function knowledgeDocumentPatch(value = {}) {
  const patch = {};
  if (typeof value.title === "string") patch.title = value.title;
  if (typeof value.html === "string") patch.html = value.html;
  if (value.graph && typeof value.graph === "object") patch.graph = value.graph;
  if (["document", "diagram"].includes(value.type)) patch.type = value.type;
  if (["private", "session-only", "shared", "published", "archived"].includes(value.lifecycle)) patch.lifecycle = value.lifecycle;
  if (["private", "team", "workspace"].includes(value.visibility)) patch.visibility = value.visibility;
  if (typeof value.project === "string") patch.project = value.project;
  if (typeof value.excerpt === "string") patch.excerpt = value.excerpt;
  return patch;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTime(value = "") {
  const clean = String(value).trim().toLowerCase();
  const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return clean;

  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const suffix = match[3];

  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAuthenticated(req) {
  if (!appPassword || !sessionSecret) return false;
  const token = parseCookies(req.headers.cookie || "")[cookieName];
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeCompare(signature, signPayload(payload))) {
    return false;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(session.exp || 0) > Date.now();
  } catch {
    return false;
  }
}

function isPushToTalkAuthenticated(req) {
  if (!pushToTalkToken) return false;
  const headerToken = cleanText(req.headers["x-cooper-ptt-token"]);
  const bearerToken = cleanText(req.headers.authorization).replace(/^Bearer\s+/i, "");
  return safeCompare(headerToken, pushToTalkToken) || safeCompare(bearerToken, pushToTalkToken);
}

function signSession(expiresAt) {
  const payload = Buffer.from(JSON.stringify({
    exp: expiresAt,
    nonce: randomBytes(18).toString("base64url")
  })).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

function signPayload(payload) {
  return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (!leftBuffer.length || !rightBuffer.length || leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return cookies;
      const name = part.slice(0, separator);
      const value = part.slice(separator + 1);
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
      return cookies;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Number(options.maxAge) || 0)}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendJobLog(job, type, message) {
  if (!job.logs) job.logs = [];
  const at = new Date().toISOString();
  job.logs.push({
    id: randomUUID(),
    at,
    type,
    message
  });
  job.lastActivityAt = at;
  job.logs = job.logs.slice(-80);
}

function summarizeStep(step) {
  const clean = cleanText(step);
  return clean.length > 110 ? `${clean.slice(0, 107)}...` : clean;
}

function broadcastEvent(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of eventClients) {
    client.write(message);
  }
}

function scheduleOperatorTask(taskId, delayMs = 1200) {
  clearOperatorTimer(taskId);
  const timer = setTimeout(() => {
    operatorTimers.delete(taskId);
    runOperatorTaskStep(taskId).catch((error) => {
      console.error("Operator task failed:", error);
    });
  }, Math.max(0, delayMs));
  operatorTimers.set(taskId, timer);
}

function clearOperatorTimer(taskId) {
  const timer = operatorTimers.get(taskId);
  if (timer) clearTimeout(timer);
  operatorTimers.delete(taskId);
}

async function queueOperatorWorker() {
  const db = await readDb();
  for (const task of db.operatorTasks || []) {
    if (task.status === "queued" || (task.status === "running" && task.skill !== "codex_app_server")) {
      scheduleOperatorTask(task.id, 350);
    }
  }
}

function scheduleMobilePushWorker(delayMs = 250) {
  if (!mobilePushConfig.configured || mobilePushWorkerActive || mobilePushTimer) return;
  mobilePushTimer = setTimeout(() => {
    mobilePushTimer = null;
    processMobilePushOutbox().catch((error) => {
      console.error("Mobile push worker failed:", error);
      scheduleMobilePushWorker(60000);
    });
  }, Math.max(0, delayMs));
  mobilePushTimer.unref?.();
}

async function processMobilePushOutbox() {
  if (mobilePushWorkerActive || !mobilePushConfig.configured) return;
  mobilePushWorkerActive = true;
  let shouldRetry = false;
  try {
    const db = await readDb();
    const devices = (db.mobilePushDevices || []).filter((device) => device.enabled !== false);
    const events = (db.mobilePushEvents || [])
      .filter((event) => event.status === "pending" && Number(event.attempts || 0) < 5)
      .slice(0, 12);

    for (const event of events) {
      const candidates = devices.filter((device) => {
        const registeredAt = Date.parse(device.createdAt || 0);
        const eventAt = Date.parse(event.createdAt || 0);
        return !Number.isFinite(registeredAt) || !Number.isFinite(eventAt) || registeredAt <= eventAt;
      });
      if (!candidates.length) continue;

      const existing = new Map((event.deliveries || []).map((delivery) => [delivery.tokenHash, delivery]));
      const results = [];
      for (const device of candidates) {
        if (existing.get(device.tokenHash)?.ok) continue;
        let delivery;
        try {
          delivery = await sendMobilePush({ device, event, config: mobilePushConfig });
        } catch (error) {
          delivery = { ok: false, retryable: true, status: 0, reason: error.message || "APNs delivery failed." };
        }
        results.push({
          tokenHash: device.tokenHash,
          deviceId: device.id,
          ok: Boolean(delivery.ok),
          retryable: Boolean(delivery.retryable),
          invalidateDevice: Boolean(delivery.invalidateDevice),
          status: Number(delivery.status || 0),
          reason: cleanText(delivery.reason),
          attemptedAt: new Date().toISOString()
        });
      }
      if (!results.length) continue;

      await updateDb((nextDb) => {
        const nextEvent = (nextDb.mobilePushEvents || []).find((item) => item.id === event.id);
        if (!nextEvent) return;
        const deliveries = new Map((nextEvent.deliveries || []).map((delivery) => [delivery.tokenHash, delivery]));
        results.forEach((delivery) => deliveries.set(delivery.tokenHash, delivery));
        nextEvent.deliveries = [...deliveries.values()];
        nextEvent.attempts = Number(nextEvent.attempts || 0) + 1;
        nextEvent.updatedAt = new Date().toISOString();

        const relevant = candidates.map((device) => deliveries.get(device.tokenHash)).filter(Boolean);
        const retryable = relevant.some((delivery) => !delivery.ok && delivery.retryable);
        const delivered = relevant.some((delivery) => delivery.ok);
        nextEvent.status = retryable ? "pending" : delivered ? "delivered" : "failed";
        if (retryable && nextEvent.attempts < 5) shouldRetry = true;

        const invalidHashes = new Set(relevant.filter((delivery) => delivery.invalidateDevice).map((delivery) => delivery.tokenHash));
        nextDb.mobilePushDevices = (nextDb.mobilePushDevices || [])
          .filter((device) => !invalidHashes.has(device.tokenHash))
          .map((device) => {
            const delivery = deliveries.get(device.tokenHash);
            if (!delivery) return device;
            return {
              ...device,
              lastDeliveryAt: delivery.ok ? delivery.attemptedAt : device.lastDeliveryAt || null,
              lastError: delivery.ok ? "" : delivery.reason,
              updatedAt: delivery.attemptedAt
            };
          });
      });
    }
  } finally {
    mobilePushWorkerActive = false;
  }
  if (shouldRetry) scheduleMobilePushWorker(60000);
}

async function runCodexOperatorTask(taskId) {
  if (codexTaskLaunches.has(taskId)) return codexTaskLaunches.get(taskId);
  const launch = launchCodexOperatorTask(taskId).finally(() => {
    codexTaskLaunches.delete(taskId);
  });
  codexTaskLaunches.set(taskId, launch);
  return launch;
}

async function launchCodexOperatorTask(taskId) {
  const db = await readDb();
  const task = db.operatorTasks?.find((item) => item.id === taskId);
  if (!task || !["queued", "running", "waiting_approval"].includes(task.status)) return;

  const bridgeApproval = task.approvals?.find((approval) => approval.type === "local_bridge");
  if (!bridgeApproval) {
    await updateDb((nextDb) => {
      const item = nextDb.operatorTasks?.find((candidate) => candidate.id === taskId);
      if (!item || !["queued", "running"].includes(item.status)) return;
      const now = new Date().toISOString();
      const approval = createOperatorApproval({
        type: "local_bridge",
        title: "Start durable Codex session",
        description: "Approve starting the persistent local Codex app-server. The Codex thread will survive Cooper restarts, and Cooper will reconnect to it when the app returns."
      }, now);
      item.status = "waiting_approval";
      item.approvals.push(approval);
      item.runtime = item.runtime || {};
      item.runtime.adapter = "codex_app_server";
      item.runtime.connectionStatus = "disconnected";
      item.updatedAt = now;
      item.logs.push(createOperatorLog("approval.required", approval.title, approval.description, now));
    });
    return;
  }
  if (bridgeApproval.status !== "approved") return;

  if (task.runtime?.threadId) {
    await reconcileCodexTask(taskId);
    return;
  }

  const workspace = resolveCodexWorkspace(task.workspacePath || task.runtime?.cwd);
  await mkdir(workspace, { recursive: true });
  await updateDb((nextDb) => {
    const item = nextDb.operatorTasks?.find((candidate) => candidate.id === taskId);
    if (!item) return;
    const now = new Date().toISOString();
    item.status = "running";
    item.startedAt = item.startedAt || now;
    item.stepIndex = 1;
    item.runtime = item.runtime || {};
    Object.assign(item.runtime, {
      adapter: "codex_app_server",
      connectionStatus: "connecting",
      cwd: workspace,
      model: item.codexModel || "",
      error: ""
    });
    item.updatedAt = now;
    item.logs.push(createOperatorLog("codex.connecting", "Connecting to Codex", `Preparing a durable app-server session in ${workspace}.`, now));
  });

  try {
    const threadResponse = await codexClient.startThread({
      cwd: workspace,
      name: task.title,
      model: task.codexModel || undefined
    });
    const threadId = cleanText(threadResponse?.thread?.id);
    if (!threadId) throw new Error("Codex did not return a thread ID.");

    await updateDb((nextDb) => {
      const item = nextDb.operatorTasks?.find((candidate) => candidate.id === taskId);
      if (!item) return;
      const now = new Date().toISOString();
      item.runtime = item.runtime || {};
      Object.assign(item.runtime, {
        threadId,
        transportMode: codexClient.transportMode,
        connectionStatus: "connected",
        threadStatus: threadResponse.thread?.status?.type || "idle",
        cwd: workspace,
        model: cleanText(threadResponse?.model || item.codexModel),
        lastEventAt: now,
        error: ""
      });
      item.codexInvocations = Number(item.codexInvocations || 0) + 1;
      item.updatedAt = now;
      item.logs.push(createOperatorLog("codex.thread.started", "Codex thread started", `Thread ${threadId} is persisted by the local Codex runtime.`, now));
    });

    const turnResponse = await codexClient.startTurn(threadId, codexTaskPrompt(task, workspace), {
      cwd: workspace,
      model: task.codexModel || undefined
    });
    const turnId = cleanText(turnResponse?.turn?.id);
    await updateDb((nextDb) => {
      const item = nextDb.operatorTasks?.find((candidate) => candidate.id === taskId);
      if (!item) return;
      const now = new Date().toISOString();
      item.status = "running";
      item.stepIndex = 2;
      item.runtime = item.runtime || {};
      Object.assign(item.runtime, {
        turnId,
        threadStatus: "active",
        connectionStatus: "connected",
        transportMode: codexClient.transportMode,
        lastEventAt: now
      });
      item.updatedAt = now;
      item.logs.push(createOperatorLog("codex.turn.started", "Codex work started", `Turn ${turnId || "started"}. Cooper will keep this thread address across restarts.`, now));
    });
  } catch (error) {
    await updateDb((nextDb) => {
      const item = nextDb.operatorTasks?.find((candidate) => candidate.id === taskId);
      if (!item) return;
      const now = new Date().toISOString();
      item.status = "failed";
      item.error = cleanText(error.message) || "Codex app-server failed.";
      item.runtime = item.runtime || {};
      item.runtime.connectionStatus = "disconnected";
      item.runtime.error = item.error;
      item.updatedAt = now;
      item.logs.push(createOperatorLog("codex.failed", "Codex session failed", item.error, now));
    });
  }
}

async function reconcileCodexTask(taskId) {
  const db = await readDb();
  const task = db.operatorTasks?.find((item) => item.id === taskId);
  const threadId = cleanText(task?.runtime?.threadId);
  if (!task || !threadId) return;

  await updateDb((nextDb) => {
    const item = nextDb.operatorTasks?.find((candidate) => candidate.id === taskId);
    if (!item) return;
    item.runtime = item.runtime || {};
    item.runtime.connectionStatus = "reconnecting";
    item.updatedAt = new Date().toISOString();
  });

  try {
    const response = await codexClient.resumeThread(threadId, { includeTurns: true });
    const thread = response?.thread || {};
    const reconciledStatus = codexTaskStatusFromThread(thread);
    const turns = Array.isArray(thread.turns) ? thread.turns : [];
    const lastTurn = turns[turns.length - 1] || null;
    const lastMessage = latestCodexAgentMessage(thread);
    await updateDb((nextDb) => {
      const item = nextDb.operatorTasks?.find((candidate) => candidate.id === taskId);
      if (!item) return;
      const now = new Date().toISOString();
      const hasPendingApproval = item.approvals?.some((approval) => approval.status === "pending" && approval.runtimeMethod);
      item.status = hasPendingApproval ? "waiting_approval" : reconciledStatus;
      item.runtime = item.runtime || {};
      Object.assign(item.runtime, {
        transportMode: codexClient.transportMode,
        connectionStatus: "connected",
        threadStatus: thread.status?.type || "idle",
        turnId: cleanText(lastTurn?.id || item.runtime.turnId),
        model: cleanText(response?.model || item.runtime.model),
        lastMessage: cleanText(lastMessage || item.runtime.lastMessage),
        lastReconciledAt: now,
        lastEventAt: now,
        error: ""
      });
      item.updatedAt = now;
      if (reconciledStatus === "completed") {
        completeCodexTaskRecord(item, lastMessage, now);
      } else if (reconciledStatus === "failed") {
        item.error = cleanText(lastTurn?.error?.message) || "The Codex turn failed.";
      }
      item.logs.push(createOperatorLog("codex.reconnected", "Codex session reconnected", `Recovered thread ${threadId} with status ${item.status}.`, now));
      item.logs = item.logs.slice(-200);
    });
  } catch (error) {
    await updateDb((nextDb) => {
      const item = nextDb.operatorTasks?.find((candidate) => candidate.id === taskId);
      if (!item) return;
      const now = new Date().toISOString();
      item.runtime = item.runtime || {};
      item.runtime.connectionStatus = "disconnected";
      item.runtime.error = cleanText(error.message);
      item.updatedAt = now;
      item.logs.push(createOperatorLog("codex.reconnect_failed", "Codex reconnect pending", error.message, now));
      item.logs = item.logs.slice(-200);
    });
  }
}

async function reconnectCodexTasks() {
  if (codexReconnectPromise) return codexReconnectPromise;
  codexReconnectPromise = (async () => {
    const db = await readDb();
    const taskIds = (db.operatorTasks || [])
      .filter((task) => task.skill === "codex_app_server" && task.runtime?.threadId && isOperatorTaskActive(task))
      .map((task) => task.id);
    for (const taskId of taskIds) await reconcileCodexTask(taskId);
  })().finally(() => {
    codexReconnectPromise = null;
  });
  return codexReconnectPromise;
}

function scheduleCodexReconnect(delayMs = 5000) {
  if (codexReconnectTimer) return;
  codexReconnectTimer = setTimeout(async () => {
    codexReconnectTimer = null;
    const db = await readDb().catch(() => null);
    const needsReconnect = (db?.operatorTasks || []).some((task) => (
      task.skill === "codex_app_server" &&
      task.runtime?.threadId &&
      task.runtime?.connectionStatus !== "connected" &&
      isOperatorTaskActive(task)
    ));
    if (!needsReconnect) return;

    await reconnectCodexTasks().catch((error) => {
      console.warn("Codex reconnect attempt failed:", error.message);
    });
    const refreshed = await readDb().catch(() => null);
    const stillDisconnected = (refreshed?.operatorTasks || []).some((task) => (
      task.skill === "codex_app_server" &&
      task.runtime?.threadId &&
      task.runtime?.connectionStatus !== "connected" &&
      isOperatorTaskActive(task)
    ));
    if (stillDisconnected) scheduleCodexReconnect(Math.min(Math.max(delayMs * 2, 5000), 30000));
  }, Math.max(0, delayMs));
  codexReconnectTimer.unref?.();
}

async function handleCodexServerRequest(message) {
  const mapped = codexApprovalFromServerRequest(message);
  if (!mapped) return;
  await updateDb((db) => {
    const task = (db.operatorTasks || []).find((item) => item.runtime?.threadId === mapped.runtimePayload?.threadId);
    if (!task) return;
    const now = new Date().toISOString();
    const itemId = cleanText(mapped.runtimePayload?.itemId);
    const existing = task.approvals?.find((approval) => (
      approval.status === "pending" &&
      approval.runtimeMethod === mapped.runtimeMethod &&
      cleanText(approval.runtimePayload?.itemId) === itemId
    ));
    if (existing) {
      existing.runtimeRequestId = mapped.runtimeRequestId;
      existing.runtimePayload = mapped.runtimePayload;
      existing.description = mapped.description;
      existing.requestedAt = now;
    } else {
      task.approvals.push(createOperatorApproval(mapped, now));
    }
    task.status = "waiting_approval";
    task.runtime.turnId = cleanText(mapped.runtimePayload?.turnId || task.runtime.turnId);
    task.runtime.lastEventAt = now;
    task.updatedAt = now;
    task.logs.push(createOperatorLog("codex.approval.required", mapped.title, mapped.description, now));
    task.logs = task.logs.slice(-200);
  });
}

async function handleCodexNotification(message) {
  const method = cleanText(message?.method);
  const params = message?.params || {};
  const threadId = cleanText(params.threadId);
  if (!threadId) return;
  if (!["thread/status/changed", "turn/started", "turn/completed", "item/started", "item/completed", "error"].includes(method)) return;

  await updateDb((db) => {
    const task = (db.operatorTasks || []).find((item) => item.runtime?.threadId === threadId);
    if (!task) return;
    const now = new Date().toISOString();
    task.runtime = task.runtime || {};
    task.runtime.connectionStatus = "connected";
    task.runtime.transportMode = codexClient.transportMode;
    task.runtime.lastEventAt = now;
    task.updatedAt = now;

    if (method === "thread/status/changed") {
      task.runtime.threadStatus = cleanText(params.status?.type);
      return;
    }
    if (method === "turn/started") {
      task.status = "running";
      task.runtime.turnId = cleanText(params.turn?.id);
      task.runtime.threadStatus = "active";
      task.logs.push(createOperatorLog("codex.turn.started", "Codex turn started", `Turn ${task.runtime.turnId || "active"}.`, now));
    }
    if (method === "item/started") {
      const item = params.item || {};
      const summary = codexItemSummary(item, true);
      if (summary) task.logs.push(createOperatorLog(`codex.${item.type}.started`, summary.title, summary.detail, now));
    }
    if (method === "item/completed") {
      const item = params.item || {};
      const summary = codexItemSummary(item, false);
      if (summary) task.logs.push(createOperatorLog(`codex.${item.type}.completed`, summary.title, summary.detail, now));
      if (item.type === "agentMessage" && item.text) task.runtime.lastMessage = cleanText(item.text);
    }
    if (method === "turn/completed") {
      const turn = params.turn || {};
      task.runtime.turnId = cleanText(turn.id || task.runtime.turnId);
      task.runtime.threadStatus = "idle";
      if (turn.status === "completed") {
        const finalMessage = latestCodexAgentMessage({ turns: [turn] }) || task.runtime.lastMessage;
        completeCodexTaskRecord(task, finalMessage, now);
      } else if (turn.status === "interrupted") {
        if (!['cancelled', 'stopped'].includes(task.status)) task.status = "cancelled";
        task.stoppedAt = task.stoppedAt || now;
        task.logs.push(createOperatorLog("codex.turn.interrupted", "Codex turn interrupted", `Turn ${task.runtime.turnId} stopped safely.`, now));
      } else if (turn.status === "failed") {
        task.status = "failed";
        task.error = cleanText(turn.error?.message) || "The Codex turn failed.";
        task.logs.push(createOperatorLog("codex.turn.failed", "Codex turn failed", task.error, now));
      }
    }
    task.logs = task.logs.slice(-200);
  });
}

async function markCodexTasksDisconnected(error) {
  const db = await readDb();
  if (!(db.operatorTasks || []).some((task) => task.skill === "codex_app_server" && isOperatorTaskActive(task))) return;
  await updateDb((nextDb) => {
    const now = new Date().toISOString();
    (nextDb.operatorTasks || [])
      .filter((task) => task.skill === "codex_app_server" && isOperatorTaskActive(task))
      .forEach((task) => {
        task.runtime = task.runtime || {};
        if (task.runtime.connectionStatus !== "reconnecting") {
          task.logs.push(createOperatorLog("codex.disconnected", "Codex connection interrupted", "The durable thread remains addressable; Cooper will reconnect automatically.", now));
        }
        task.runtime.connectionStatus = "reconnecting";
        task.runtime.error = cleanText(error);
        task.updatedAt = now;
        task.logs = task.logs.slice(-200);
      });
  });
}

async function interruptCodexTask(task) {
  const threadId = cleanText(task?.runtime?.threadId);
  const turnId = cleanText(task?.runtime?.turnId);
  if (!threadId || !turnId) return;
  await codexClient.connect();
  await codexClient.resumeThread(threadId, { includeTurns: false }).catch(() => null);
  await codexClient.interruptTurn(threadId, turnId);
}

function completeCodexTaskRecord(task, finalMessage, now) {
  task.status = "completed";
  task.stepIndex = task.steps?.length || 5;
  task.completedAt = task.completedAt || now;
  task.error = "";
  task.runtime.lastMessage = cleanText(finalMessage || task.runtime.lastMessage);
  const hasSummary = task.artifacts?.some((artifact) => artifact.type === "codex_summary");
  if (!hasSummary && task.runtime.lastMessage) {
    task.artifacts.push(createOperatorArtifact({
      type: "codex_summary",
      title: `${task.title} · Codex result`,
      content: task.runtime.lastMessage
    }, now));
  }
  task.logs.push(createOperatorLog("codex.turn.completed", "Codex task completed", task.runtime.lastMessage || "The Codex turn completed.", now));
}

function codexItemSummary(item, starting) {
  if (item.type === "commandExecution") {
    return {
      title: starting ? "Command started" : `Command ${item.status || "completed"}`,
      detail: limitCodexText([item.command, item.aggregatedOutput].filter(Boolean).join(" · "), 700)
    };
  }
  if (item.type === "fileChange") {
    const paths = (item.changes || []).map((change) => change.path).filter(Boolean).join(", ");
    return { title: starting ? "File change started" : "File change completed", detail: limitCodexText(paths || item.status, 700) };
  }
  if (item.type === "mcpToolCall") {
    return { title: `${item.server || "MCP"} · ${item.tool || "tool"}`, detail: item.status || (starting ? "started" : "completed") };
  }
  if (!starting && item.type === "agentMessage") {
    return { title: "Codex update", detail: limitCodexText(item.text, 700) };
  }
  if (!starting && item.type === "plan") {
    return { title: "Codex plan updated", detail: limitCodexText(item.text, 700) };
  }
  return null;
}

function codexTaskPrompt(task, workspace) {
  return [
    task.goal,
    "",
    `Work in: ${workspace}`,
    "",
    "Complete the requested outcome end to end. Keep progress observable through plans, tool calls, command output, and a concise final summary. Ask for approval through the Codex approval system before any action that crosses the configured sandbox or approval policy. Do not push, publish, deploy, send external messages, or perform destructive actions without explicit user approval. Verify the result proportionally before finishing."
  ].join("\n");
}

function resolveCodexWorkspace(value) {
  const configured = cleanText(value || process.env.COOPER_OPERATOR_WORKSPACE || process.cwd());
  if (configured === "~") return homedir();
  if (configured.startsWith("~/")) return resolve(homedir(), configured.slice(2));
  return resolve(configured);
}

function limitCodexText(value, max = 700) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

async function runOperatorTaskStep(taskId) {
  const snapshot = await readDb();
  const snapshotTask = snapshot.operatorTasks?.find((item) => item.id === taskId);
  if (snapshotTask?.skill === "codex_app_server") {
    await runCodexOperatorTask(taskId);
    return;
  }

  const result = await updateDb(async (db) => {
    const task = db.operatorTasks?.find((item) => item.id === taskId);
    if (!task || !["queued", "running"].includes(task.status)) {
      return { status: task?.status || "missing" };
    }

    const now = new Date().toISOString();
    const hydrated = hydrateOperatorTask(task);
    Object.assign(task, hydrated);

    if (exceedsOperatorBudget(task, now)) {
      task.status = "failed";
      task.error = "Operator budget exceeded.";
      task.updatedAt = now;
      task.logs.push(createOperatorLog("budget.exceeded", "Budget exceeded", "The local Operator task hit its wall-clock or step budget and paused safely.", now));
      return { status: task.status };
    }

    if (task.status === "queued") {
      task.status = "running";
      task.startedAt = now;
      task.updatedAt = now;
      task.logs.push(createOperatorLog("runner.started", "Local runner started", operatorRuntimeLine(), now));
      task.logs.push(createOperatorLog("step.started", `Step ${task.stepIndex + 1} started`, currentOperatorStep(task), now));
      return { status: task.status };
    }

    if (operatorTaskProducesArtifacts(task)) {
      return runOperatorArtifactTaskInDb(db, task, now);
    }

    const approval = nextOperatorApproval(task, now);
    if (approval) {
      task.status = "waiting_approval";
      task.approvals.push(approval);
      task.updatedAt = now;
      task.logs.push(createOperatorLog("approval.required", approval.title, approval.description, now));
      return { status: task.status };
    }

    if (task.stepIndex === 1 && hasApprovedOperatorApproval(task, "browser_launch") && !task.browserLaunchedAt) {
      const launchResult = await launchOperatorBrowser(task);
      task.browserLaunchedAt = now;
      task.logs.push(createOperatorLog(launchResult.ok ? "browser.opened" : "browser.skipped", launchResult.title, launchResult.detail, now));
    }

    if (task.stepIndex === 1 && task.skill === "computer_use_desktop" && hasApprovedOperatorApproval(task, "local_bridge") && !task.localBridgeStartedAt) {
      const launchResult = await launchComputerUseDesktop(task);
      task.localBridgeStartedAt = now;
      task.logs.push(createOperatorLog(launchResult.ok ? "desktop.opened" : "desktop.skipped", launchResult.title, launchResult.detail, now));
    }

    const completedStep = currentOperatorStep(task);
    task.logs.push(createOperatorLog("step.completed", `Step ${task.stepIndex + 1} completed`, completedStep, now));
    task.stepIndex += 1;
    task.updatedAt = now;

    if (task.stepIndex >= task.steps.length) {
      task.status = "completed";
      task.completedAt = now;
      task.artifacts.push(createOperatorArtifact({
        type: "summary",
        title: `${task.title} summary`,
        content: operatorSummaryMarkdown(task)
      }, now));
      task.logs.push(createOperatorLog("artifact.ready", "Operator artifact ready", "A replayable local run summary is ready in the Operator workspace.", now));
      return { status: task.status };
    }

    task.logs.push(createOperatorLog("step.started", `Step ${task.stepIndex + 1} started`, currentOperatorStep(task), now));
    return { status: task.status };
  });

  if (result.queuedWork) {
    queueWorker();
  }

  if (result.status === "running" || result.status === "queued") {
    scheduleOperatorTask(taskId, 1700);
  }
}

function operatorTaskProducesArtifacts(task) {
  return Boolean(task?.artifactKinds?.length || task?.templateIds?.length);
}

function runOperatorArtifactTaskInDb(db, task, now) {
  if (!task.jobsQueuedAt) {
    const queued = queueOperatorGeneratedJobsInDb(db, task, now);
    task.stepIndex = Math.min(1, task.steps.length - 1);
    task.jobsQueuedAt = now;
    task.updatedAt = now;
    if (!queued.length) {
      task.status = "failed";
      task.error = "No artifact jobs could be queued for this Operator skill.";
      task.logs.push(createOperatorLog("artifact.failed", "No jobs queued", task.error, now));
      return { status: task.status };
    }
    task.logs.push(createOperatorLog(
      "artifact.jobs_queued",
      "Real work queued",
      queued.length === 1
        ? `${queued[0].title} is now running in Cooper's work queue.`
        : `${queued.length} Cooper work jobs are now running in the background.`,
      now
    ));
    return { status: task.status, queuedWork: true };
  }

  const jobs = (db.jobs || []).filter((job) => task.jobIds.includes(job.id));
  const artifacts = (db.artifacts || []).filter((artifact) => task.jobIds.includes(artifact.jobId));
  const active = jobs.filter((job) => ["queued", "running"].includes(job.status));
  const failed = jobs.filter((job) => job.status === "failed");
  const completed = jobs.filter((job) => job.status === "completed");
  const signature = jobs.map((job) => `${job.id}:${job.status}:${job.stepIndex}:${job.apiStatus}:${job.artifactId || ""}`).join("|");

  if (task.lastJobStatusSignature !== signature) {
    task.lastJobStatusSignature = signature;
    task.logs.push(createOperatorLog(
      "artifact.monitor",
      "Watching Cooper jobs",
      operatorJobStatusLine(jobs),
      now
    ));
  }

  task.stepIndex = active.length ? Math.min(2, task.steps.length - 1) : Math.min(3, task.steps.length - 1);
  task.updatedAt = now;

  if (failed.length) {
    task.status = "failed";
    task.error = failed.map((job) => `${job.title}: ${job.error || job.progress || "failed"}`).join(" | ");
    task.logs.push(createOperatorLog("artifact.failed", "Generated work failed", task.error, now));
    return { status: task.status };
  }

  if (jobs.length && completed.length === jobs.length) {
    task.status = "completed";
    task.stepIndex = task.steps.length;
    task.completedAt = now;
    task.artifacts = [
      ...task.artifacts,
      createOperatorArtifact({
        type: "generated_work_summary",
        title: `${task.title} generated artifacts`,
        content: operatorGeneratedArtifactSummary(jobs, artifacts)
      }, now)
    ];
    task.logs.push(createOperatorLog(
      "artifact.ready",
      "Generated artifacts ready",
      `${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"} finished and are available from the Operator task and Work library.`,
      now
    ));
    return { status: task.status };
  }

  return { status: task.status };
}

function queueOperatorGeneratedJobsInDb(db, task, now) {
  const callId = ensureOperatorWorkCallInDb(db, task, now);
  const queued = [];

  const templateIds = Array.isArray(task.templateIds) ? task.templateIds.filter(Boolean) : [];
  if (templateIds.length) {
    const examples = templateIds.includes("all")
      ? getAiresExampleList()
      : templateIds.map((id) => findAiresExample(id)).filter(Boolean);
    const uniqueExamples = Array.from(new Map(examples.map((example) => [example.id, example])).values());
    for (const example of uniqueExamples) {
      const customPrompt = buildAiresExamplePrompt(example, operatorTaskPromptContext(task));
      const kind = artifactRecipes[example.recipeKind] ? example.recipeKind : "aires_requirements";
      const job = enqueueArtifactJobInDb(db, callId, kind, customPrompt, {
        allowEmptyTranscript: true,
        title: example.title
      }, now);
      if (!job.error) queued.push(job);
    }
  }

  for (const kind of task.artifactKinds || []) {
    if (!artifactRecipes[kind]) continue;
    const job = enqueueArtifactJobInDb(db, callId, kind, operatorTaskPromptContext(task), {
      allowEmptyTranscript: true,
      title: task.artifactKinds.length === 1 ? task.title : artifactRecipes[kind].title
    }, now);
    if (!job.error) queued.push(job);
  }

  task.relatedCallId = callId;
  task.jobIds = Array.from(new Set([...(task.jobIds || []), ...queued.map((job) => job.id)]));
  return queued;
}

function ensureOperatorWorkCallInDb(db, task, now) {
  if (task.relatedCallId && db.calls.some((call) => call.id === task.relatedCallId)) {
    return task.relatedCallId;
  }

  const callId = randomUUID();
  db.calls.push({
    id: callId,
    title: `Operator: ${task.title}`,
    status: "operator",
    source: "operator",
    startedAt: task.startedAt || now,
    endedAt: null,
    durationSeconds: 0,
    projectId: "",
    projectTitle: "",
    projectContextSnapshot: "",
    transcript: [
      {
        id: randomUUID(),
        at: now,
        speaker: "Michael",
        text: task.goal
      },
      {
        id: randomUUID(),
        at: now,
        speaker: "Cooper Operator",
        text: `Run skill ${task.skill} and produce: ${[
          ...(task.artifactKinds || []),
          ...(task.templateIds || [])
        ].join(", ") || "operator output"}.`
      }
    ],
    suggestions: defaultSuggestions(true),
    createdAt: now,
    updatedAt: now
  });
  return callId;
}

function operatorTaskPromptContext(task) {
  return [
    `Operator task: ${task.title}`,
    `Skill: ${task.skill}`,
    `Michael's requested outcome:\n${task.goal}`,
    task.targetUrl ? `Target URL: ${task.targetUrl}` : "",
    task.allowedDomains?.length ? `Allowed domains: ${task.allowedDomains.join(", ")}` : "",
    "This was started from the Cooper Operator voice workspace. Produce a finished artifact Michael can inspect while the conversation continues.",
    "If implementation details are missing, make conservative assumptions, label them, and produce a useful first pass rather than stopping."
  ].filter(Boolean).join("\n\n");
}

function operatorJobStatusLine(jobs) {
  if (!jobs.length) return "No Cooper work jobs have been linked yet.";
  const counts = jobs.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([status, count]) => `${count} ${status}`)
    .join(", ");
}

function operatorGeneratedArtifactSummary(jobs, artifacts) {
  const artifactLines = artifacts.length
    ? artifacts.map((artifact) => `- ${artifact.title} (${artifact.kind}, artifact ${artifact.id})`)
    : ["- No artifact records were found yet."];
  const jobLines = jobs.map((job) => `- ${job.title}: ${job.status}${job.artifactId ? ` -> ${job.artifactId}` : ""}`);
  return [
    "## Generated artifacts",
    ...artifactLines,
    "",
    "## Linked Cooper jobs",
    ...jobLines,
    "",
    "These were generated by the normal Cooper background work queue, so they also appear in the Work library."
  ].join("\n");
}

function nextOperatorApproval(task, now) {
  if (task.targetUrl && task.stepIndex === 1 && !hasOperatorApproval(task, "browser_launch")) {
    return createOperatorApproval({
      type: "browser_launch",
      title: "Open visible local browser",
      description: `Approve opening the dedicated Operator browser profile for ${task.targetUrl}. Allowed domains: ${task.allowedDomains.join(", ") || "none listed"}.`
    }, now);
  }

  if (["computer_use_desktop", "codex_app_server", "codex_mcp_agent"].includes(task.skill) && task.stepIndex === 1 && !hasOperatorApproval(task, "local_bridge")) {
    const bridgeLabel = task.skill === "computer_use_desktop"
      ? "Computer Use desktop bridge"
      : task.skill === "codex_mcp_agent"
        ? "Codex MCP agent bridge"
        : "Codex app-server bridge";
    return createOperatorApproval({
      type: "local_bridge",
      title: `Start ${bridgeLabel}`,
      description: `Approve starting the supervised local ${bridgeLabel}. Operator will stream status and pause again before writes, external messages, destructive actions, commits, or pushes.`
    }, now);
  }

  if (task.riskLevel !== "read" && task.stepIndex === 3 && !hasOperatorApproval(task, "write_checkpoint")) {
    return createOperatorApproval({
      type: "write_checkpoint",
      title: "Continue protected write step",
      description: "Approve the next supervised step before Operator changes account settings, drafts external content, or prepares a production update."
    }, now);
  }

  return null;
}

function hasOperatorApproval(task, type) {
  return task.approvals.some((approval) => approval.type === type);
}

function hasApprovedOperatorApproval(task, type) {
  return task.approvals.some((approval) => approval.type === type && approval.status === "approved");
}

async function launchOperatorBrowser(task) {
  const runtime = operatorRuntimeInfo(process.env);
  if (!runtime.browserLaunchEnabled) {
    return {
      ok: false,
      title: "Browser launch disabled",
      detail: "Set COOPER_OPERATOR_LAUNCH_BROWSER=true on a local machine to open the dedicated Operator browser profile."
    };
  }

  await mkdir(runtime.browserProfile, { recursive: true });
  const target = task.targetUrl || "about:blank";

  if (process.platform === "darwin") {
    const args = [
      "-na",
      process.env.COOPER_OPERATOR_BROWSER_APP || "Google Chrome",
      "--args",
      `--user-data-dir=${runtime.browserProfile}`,
      "--no-first-run",
      "--new-window",
      target
    ];
    spawn("open", args, { detached: true, stdio: "ignore" }).unref();
    return {
      ok: true,
      title: "Local browser opened",
      detail: `Opened ${target} with dedicated profile ${runtime.browserProfile}.`
    };
  }

  if (process.platform === "linux") {
    const browserBin = process.env.COOPER_OPERATOR_BROWSER_BIN || "google-chrome";
    spawn(browserBin, [`--user-data-dir=${runtime.browserProfile}`, "--no-first-run", "--new-window", target], {
      detached: true,
      stdio: "ignore"
    }).unref();
    return {
      ok: true,
      title: "Local browser opened",
      detail: `Opened ${target} with ${browserBin} and dedicated profile ${runtime.browserProfile}.`
    };
  }

  return {
    ok: false,
    title: "Browser platform unsupported",
    detail: `Automatic browser launch is not configured for ${process.platform}. Open ${target} manually with profile ${runtime.browserProfile}.`
  };
}

async function launchComputerUseDesktop(task) {
  const intent = task.computerIntent || {};
  const appName = cleanText(intent.appName || extractDesktopAppName(task.goal));
  const targetUrl = cleanText(intent.targetUrl || task.targetUrl);
  const allowedApps = desktopAllowList();

  if (targetUrl) {
    return launchDesktopTarget(targetUrl, `Opened ${targetUrl} on the local desktop.`);
  }

  if (!appName) {
    return {
      ok: false,
      title: "No desktop target",
      detail: "Computer Use desktop task needs an app name or URL before it can open anything."
    };
  }

  const allowed = allowedApps.find((candidate) => candidate.toLowerCase() === appName.toLowerCase());
  if (!allowed) {
    return {
      ok: false,
      title: "App not allow-listed",
      detail: `${appName} is not in COOPER_COMPUTER_USE_ALLOWED_APPS. Allowed apps: ${allowedApps.join(", ") || "none"}.`
    };
  }

  if (process.platform !== "darwin") {
    return {
      ok: false,
      title: "Desktop launch unavailable",
      detail: `Automatic desktop app launch is currently implemented for macOS only. Open ${allowed} manually.`
    };
  }

  spawn("open", ["-a", allowed], { detached: true, stdio: "ignore" }).unref();
  return {
    ok: true,
    title: "Desktop app opened",
    detail: `Opened ${allowed}. Computer Use will still pause before sensitive or write actions.`
  };
}

function launchDesktopTarget(target, detail) {
  if (process.platform !== "darwin") {
    return {
      ok: false,
      title: "Desktop URL launch unavailable",
      detail: `Automatic URL launch is currently implemented for macOS only. Open ${target} manually.`
    };
  }
  spawn("open", [target], { detached: true, stdio: "ignore" }).unref();
  return {
    ok: true,
    title: "Desktop target opened",
    detail
  };
}

function desktopAllowList() {
  const configured = process.env.COOPER_COMPUTER_USE_ALLOWED_APPS;
  const defaults = "Spotify,Claude,Claude Code,Google Chrome,Safari,Slack,Notion,Finder,Terminal,Visual Studio Code";
  return String(configured || defaults)
    .split(",")
    .map(cleanText)
    .filter(Boolean);
}

function extractDesktopAppName(goal = "") {
  const text = cleanText(goal);
  const match = text.match(/\b(?:open|launch|start|use|work in|work with)\s+([A-Za-z][A-Za-z0-9 ._-]{1,40})/i);
  if (!match) return "";
  return match[1]
    .replace(/\b(?:and|then|to|for|please|app|application)\b.*$/i, "")
    .trim();
}

function currentOperatorStep(task) {
  return task.steps[Math.min(task.stepIndex, task.steps.length - 1)] || "Run local Operator step.";
}

function exceedsOperatorBudget(task, now) {
  const started = task.startedAt ? Date.parse(task.startedAt) : Date.parse(now);
  const elapsed = Number.isFinite(started) ? Date.parse(now) - started : 0;
  return task.stepIndex > task.budgets.maxSteps || elapsed > task.budgets.maxWallClockMs || task.codexInvocations > task.budgets.maxCodexInvocations;
}

function operatorRuntimeLine() {
  const runtime = operatorRuntimeInfo(process.env);
  return `Mode: ${runtime.mode}. Browser profile: ${runtime.browserProfile}. Codex workspace: ${runtime.codexWorkspace}. Computer Use: ${runtime.openaiTools?.computerUse ? "enabled" : "disabled"}. Codex bridge: ${runtime.openaiTools?.codexAppServer || runtime.openaiTools?.codexMcp ? "enabled" : "disabled"}.`;
}

function operatorSummaryMarkdown(task) {
  return [
    `# ${task.title}`,
    "",
    `Goal: ${task.goal}`,
    `Skill: ${task.skill}`,
    `Target URL: ${task.targetUrl || "none"}`,
    `Risk level: ${task.riskLevel}`,
    "",
    "## Completed steps",
    ...task.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Approvals",
    ...(task.approvals.length
      ? task.approvals.map((approval) => `- ${approval.title}: ${approval.status}`)
      : ["- No approvals were required."]),
    "",
    "## Result",
    "Operator captured the supervised run contract, step checkpoints, approval history, allowed domains, and final replay summary. If Michael wants deeper execution, use this same task contract to attach the real Playwright browser worker or Codex worker while preserving approvals, budgets, and artifacts."
  ].join("\n");
}

function formatRetryDelay(ms) {
  const seconds = Math.ceil(ms / 1000);
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
}

class RetryableJobError extends Error {
  constructor(message, retryAfterMs = jobDelayMs * 2) {
    super(message);
    this.name = "RetryableJobError";
    this.retryable = true;
    this.retryAfterMs = retryAfterMs;
  }
}

await ensureDataStore();
await updateDb((db) => {
  db.toolCalls = Array.isArray(db.toolCalls) ? db.toolCalls : [];
  db.gstackRuns = Array.isArray(db.gstackRuns) ? db.gstackRuns : [];
  db.arcadeAuthorizations = Array.isArray(db.arcadeAuthorizations) ? db.arcadeAuthorizations : [];
  db.projects = Array.isArray(db.projects) ? db.projects : [];
  db.projectSources = Array.isArray(db.projectSources) ? db.projectSources : [];
  db.contextPackets = Array.isArray(db.contextPackets) ? db.contextPackets : [];
  db.operatorTasks = Array.isArray(db.operatorTasks) ? db.operatorTasks : [];
  db.dailyBriefs = Array.isArray(db.dailyBriefs) ? db.dailyBriefs : [];
  db.mobilePushDevices = Array.isArray(db.mobilePushDevices) ? db.mobilePushDevices : [];
  db.mobilePushEvents = Array.isArray(db.mobilePushEvents) ? db.mobilePushEvents : [];
  db.calls.forEach((call) => {
    call.transcript = normalizeTranscript(call.transcript || []);
    call.projectId = cleanText(call.projectId);
    call.projectTitle = cleanText(call.projectTitle);
    call.projectContextSnapshot = cleanText(call.projectContextSnapshot);
    call.contextPacketId = cleanText(call.contextPacketId);
    call.contextPacketIds = contextPacketIdsForCall(call);
    call.contextSourceCount = contextSourceCountForCall(db, call);
    call.source = cleanText(call.source) || "session";
    call.sourceLabel = cleanText(call.sourceLabel);
    call.sourceDetail = cleanText(call.sourceDetail);
    call.realtimeUsage = normalizeCallUsage(call.realtimeUsage);
    const existingSuggestions = new Map((call.suggestions || []).map((suggestion) => [suggestion.kind, suggestion]));
    call.suggestions = defaultSuggestions(call.transcript.length > 0).map((suggestion) => ({
      ...suggestion,
      enabled: existingSuggestions.get(suggestion.kind)?.enabled ?? suggestion.enabled
    }));
  });
  db.projects.forEach((project) => {
    project.title = cleanText(project.title) || "Untitled project";
    project.description = cleanText(project.description);
    project.status = cleanText(project.status) || "active";
    project.createdAt = project.createdAt || new Date().toISOString();
    project.updatedAt = project.updatedAt || project.createdAt;
  });
  db.projectSources.forEach((source) => {
    source.title = cleanText(source.title) || "Project context";
    source.text = cleanText(source.text);
    source.sourceType = cleanText(source.sourceType) || "text";
    source.charCount = Number(source.charCount || source.text.length);
    source.storedCharCount = Number(source.storedCharCount || source.text.length);
    source.createdAt = source.createdAt || new Date().toISOString();
    source.updatedAt = source.updatedAt || source.createdAt;
  });
  db.contextPackets = db.contextPackets.map((packet) => buildContextPacket({
    ...packet,
    id: cleanText(packet.id) || randomUUID(),
    createdAt: packet.createdAt || new Date().toISOString(),
    updatedAt: packet.updatedAt || packet.createdAt || new Date().toISOString()
  }, { maxChars: contextPacketMaxChars }));
  db.artifacts.forEach((artifact) => {
    artifact.outputType = artifactOutputType(artifact);
    artifact.extension = artifact.extension || defaultArtifactExtension(artifact.outputType);
    artifact.mimeType = artifact.mimeType || defaultArtifactMimeType(artifact.outputType);
    artifact.file = artifact.file || `data/artifacts/${artifact.id}.${artifact.extension}`;
    artifact.version = Math.max(1, Number(artifact.version || 1));
    artifact.quality = artifact.quality || null;
    artifact.sourceManifest = artifact.sourceManifest || null;
  });
  db.jobs.forEach((job) => {
    const recipe = artifactRecipes[job.kind] || {};
    job.model = cleanText(job.model) || workModel;
    job.fallbackModel = cleanText(job.fallbackModel) || fallbackWorkModel;
    job.maxOutputTokens = Number(job.maxOutputTokens || outputTokenBudget(recipe));
    job.responseUsage = normalizeResponsesApiUsage(job.responseUsage);
    job.outputTokens = Number(job.outputTokens || job.responseUsage?.outputTokens || 0);
    job.costUsd = Number(job.costUsd || job.responseUsage?.costUsd || 0);
    job.reasoningEffort = cleanText(job.reasoningEffort) || "medium";
    job.priority = normalizeJobPriority(job.priority);
    job.pipelineId = cleanText(job.pipelineId) || cleanText(job.requirementsRunId) || job.id;
    job.pipeline = DOCUMENT_PIPELINE_STAGES;
    job.pipelineStage = cleanText(job.pipelineStage) || pipelineStageForJob(job, recipe);
    job.sourceManifest = job.sourceManifest || {
      capturedAt: job.createdAt || new Date().toISOString(),
      callId: job.callId,
      transcriptTurnCount: 0,
      contextPacketIds: [],
      contextSourceCount: 0,
      instructionCharCount: cleanText(job.customPrompt).length
    };
    job.quality = job.quality || {
      status: job.status === "completed" ? "not_scored" : "pending",
      score: 0,
      minimumScore: jobQualityMinimumScore,
      checks: [],
      warnings: [],
      summary: job.status === "completed" ? "Created before document quality scoring was enabled." : "Quality validation has not run yet."
    };
    job.qualityRepairAttempts = Number(job.qualityRepairAttempts || 0);
    job.apiStatus = cleanText(job.apiStatus) || (job.status === "completed" ? "completed" : job.status === "failed" ? "failed" : "queued");
    job.activeStepSummary = cleanText(job.activeStepSummary);
    job.lastActivityAt = job.lastActivityAt || job.updatedAt || job.createdAt || new Date().toISOString();
    job.draftCharCount = Number(job.draftCharCount || job.draft?.length || 0);
    if (!Array.isArray(job.logs) || job.logs.length === 0) {
      appendJobLog(job, job.status || "state", `Recovered existing ${job.title || "job"} in ${job.status || "unknown"} state.`);
    }
    if (["running", "validating", "repairing"].includes(job.status) || ["validating", "repairing"].includes(job.apiStatus)) {
      job.status = "queued";
      job.apiStatus = "queued";
      job.progress = "Recovered after restart.";
      appendJobLog(job, "recovered", "Server restarted while this job was running. Cooper queued it again.");
      job.updatedAt = new Date().toISOString();
    } else if (job.status === "pausing") {
      job.status = "paused";
      job.apiStatus = "paused";
      job.pauseRequested = false;
      job.progress = "Paused safely after restart.";
      appendJobLog(job, "recovered", "Server restarted while a pause was pending. The job is now paused safely.");
    } else if (job.status === "canceling") {
      job.status = "canceled";
      job.apiStatus = "canceled";
      job.cancelRequested = false;
      job.progress = "Canceled safely after restart.";
      appendJobLog(job, "recovered", "Server restarted while canceling. No additional model step will run.");
    }
  });
  db.operatorTasks = db.operatorTasks.map((task) => {
    const hydrated = hydrateOperatorTask(task);
    if (hydrated.skill === "codex_app_server" && hydrated.runtime.threadId) {
      hydrated.runtime.connectionStatus = isOperatorTaskActive(hydrated) ? "reconnecting" : "disconnected";
      if (isOperatorTaskActive(hydrated)) {
        hydrated.approvals.forEach((approval) => {
          if (approval.status === "pending" && approval.runtimeMethod) approval.runtimeRequestId = null;
        });
        hydrated.logs.push(createOperatorLog("recovered", "Recovering durable Codex session", `Cooper will reconnect to thread ${hydrated.runtime.threadId}.`, new Date().toISOString()));
        hydrated.updatedAt = new Date().toISOString();
        return hydrated;
      }
    }
    if (hydrated.status === "running") {
      hydrated.status = "queued";
      hydrated.logs.push(createOperatorLog("recovered", "Task recovered after restart", "Server restarted while this local Operator task was running. It was queued safely.", new Date().toISOString()));
      hydrated.updatedAt = new Date().toISOString();
    }
    return hydrated;
  });
});
queueWorker();
await queueOperatorWorker();
await reconnectCodexTasks();
scheduleCodexReconnect();
scheduleMobilePushWorker(500);

if (isProduction) {
  app.use(express.static(join(__dirname, "dist")));
  app.get("*", (_req, res) => {
    res.sendFile(join(__dirname, "dist", "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

const server = createServer(app);
server.listen(port, () => {
  console.log(`Cooper is ready at http://localhost:${port}`);
  void refreshDailyBrief({ trigger: "startup", force: true })
    .then((brief) => console.log(`[Daily Brief] ${brief.date} is ready.`))
    .catch((error) => console.error("[Daily Brief] Startup refresh failed:", error.message));
  scheduleDailyBrief();
});
