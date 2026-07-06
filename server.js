import "dotenv/config";
import express from "express";
import multer from "multer";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Arcade from "@arcadeai/arcadejs";
import { PDFParse } from "pdf-parse";
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
  buildPushToTalkComputerTaskInput,
  classifyPushToTalkCommand,
  pushToTalkConfigFromEnv
} from "./server/pushToTalk.js";
import {
  executeLocalComputerTool,
  logLocalComputerTool,
  localComputerToolNames
} from "./server/localComputerTools.js";
import { runGstackSkill } from "./server/tools/runGstackSkill.js";
import { addResponsesApiUsage, normalizeResponsesApiUsage } from "./src/callCost.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 5000);
const dataDir = join(__dirname, "data");
const artifactsDir = join(dataDir, "artifacts");
const dbPath = join(dataDir, "cooper.json");
const workModel = process.env.COOPER_WORK_MODEL || "gpt-5.4";
const fallbackWorkModel = process.env.COOPER_FALLBACK_WORK_MODEL || "";
const jobDelayMs = Number(process.env.COOPER_JOB_DELAY_MS || 15000);
const jobMaxAttempts = Number(process.env.COOPER_JOB_MAX_ATTEMPTS || 3);
const jobMaxOutputTokens = Number(process.env.COOPER_JOB_MAX_OUTPUT_TOKENS || 9000);
const projectContextChars = Number(process.env.COOPER_PROJECT_CONTEXT_CHARS || 18000);
const projectSourceMaxChars = Number(process.env.COOPER_PROJECT_SOURCE_MAX_CHARS || 250000);
const projectUploadMaxBytes = Number(process.env.COOPER_PROJECT_UPLOAD_MAX_MB || 20) * 1024 * 1024;
const pushToTalkMaxAudioBytes = Number(process.env.COOPER_PTT_MAX_AUDIO_MB || 18) * 1024 * 1024;
const pushToTalkToken = process.env.COOPER_PTT_TOKEN || "";
const pushToTalkTranscriptionModel = process.env.COOPER_PTT_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const pushToTalkResponseMaxOutputTokens = Number(process.env.COOPER_PTT_RESPONSE_MAX_OUTPUT_TOKENS || 1200);
const workModels = [workModel, fallbackWorkModel].filter((model, index, list) => model && list.indexOf(model) === index);
const appPassword = process.env.COOPER_APP_PASSWORD || "";
const sessionSecret = process.env.COOPER_SESSION_SECRET || appPassword;
const cookieName = "cooper_session";
const sessionTtlMs = Number(process.env.COOPER_SESSION_TTL_HOURS || 168) * 60 * 60 * 1000;
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
const arcadeWritesEnabled = process.env.COOPER_ENABLE_ARCADE_WRITES === "true";
const notionVersion = process.env.NOTION_VERSION || "2026-03-11";
const notionSearchLimit = Number(process.env.NOTION_SEARCH_LIMIT || 5);
const notionBlockLimit = Number(process.env.NOTION_BLOCK_LIMIT || 50);
const mcpAppServers = parseMcpAppServers(
  process.env.COOPER_MCP_APP_SERVERS ||
    (arcadeMcpGatewayUrl ? JSON.stringify([{ type: "http", url: arcadeMcpGatewayUrl, serverId: "cooper-arcade" }]) : "")
);

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
let writeQueue = Promise.resolve();
let workerActive = false;
let lastGenerationAt = 0;
let arcadeClient = null;

app.use(express.text({ type: ["application/sdp", "text/plain"], limit: "2mb" }));
app.use(express.json({ limit: "24mb" }));

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
  if (req.path.startsWith("/api/auth/")) {
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
  const db = projectId ? await readDb() : null;
  const projectContext = db ? buildProjectContext(db, projectId) : "";

  const fd = new FormData();
  fd.set("sdp", sdp);
  fd.set("session", JSON.stringify(realtimeSession(projectContext)));

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

app.get("/api/operator/state", async (_req, res) => {
  const db = await readDb();
  res.json(publicOperatorState(db));
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
  const result = await updateDb(async (db) => {
    const task = db.operatorTasks?.find((item) => item.id === req.params.id);
    if (!task) return null;
    const approvalId = cleanText(req.body?.approvalId);
    const approval = approvalId
      ? task.approvals.find((item) => item.id === approvalId)
      : task.approvals.find((item) => item.status === "pending");
    if (!approval) return { task, error: "No pending approval found." };
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

  scheduleOperatorTask(result.task.id, 250);
  res.json({ task: operatorTaskPublic(result.task) });
});

app.post("/api/operator/tasks/:id/cancel", async (req, res) => {
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
    content
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

app.get("/api/tools/arcade/status", async (_req, res) => {
  const db = await readDb();
  res.json(arcadeSettingsState(db));
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
    const response = await startArcadeAuthorization(name, req);
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
      const authorization = await startArcadeAuthorization(name, req);
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
    const output = await executeCooperTool(name, args, { callId });
    const durationMs = Date.now() - startedAt;
    await updateToolCall(recordId, {
      status: output.status === "error" ? "failed" : output.status === "approval_required" ? "pending_approval" : "executed",
      resultSummary: summarizeToolResult(output),
      durationMs,
      error: output.status === "error" ? output.message || "Tool failed." : null
    });
    res.json({ output, recordId });
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
    res.status(500).json({ output, recordId });
  }
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

app.post("/api/calls", async (req, res) => {
  const now = new Date().toISOString();
  const requestedProjectId = cleanText(req.body?.projectId);

  const call = await updateDb((db) => {
    const project = requestedProjectId
      ? db.projects.find((item) => item.id === requestedProjectId)
      : null;
    const nextCall = {
      id: randomUUID(),
      title: cleanText(req.body?.title) || `Cooper call ${new Date().toLocaleString()}`,
      status: "active",
      startedAt: req.body?.startedAt || now,
      endedAt: null,
      durationSeconds: 0,
      projectId: project?.id || "",
      projectTitle: project?.title || "",
      projectContextSnapshot: project ? buildProjectContext(db, project.id) : "",
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
    return nextCall;
  });

  res.status(201).json({ call: publicCall(call) });
});

app.patch("/api/calls/:id", async (req, res) => {
  const result = await updateDb(async (db) => {
    const call = db.calls.find((item) => item.id === req.params.id);
    if (!call) return null;

    if (typeof req.body?.title === "string") call.title = cleanText(req.body.title) || call.title;
    if (typeof req.body?.status === "string") call.status = req.body.status;
    if (typeof req.body?.durationSeconds === "number") call.durationSeconds = req.body.durationSeconds;
    if (Array.isArray(req.body?.transcript)) call.transcript = normalizeTranscript(req.body.transcript);
    if (req.body?.realtimeUsage) call.realtimeUsage = normalizeCallUsage(req.body.realtimeUsage);
    if (req.body?.endedAt) call.endedAt = req.body.endedAt;
    call.updatedAt = new Date().toISOString();
    return call;
  });

  if (!result) {
    res.status(404).json({ error: "Call not found." });
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
    title: cleanText(req.body?.title)
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
    const content = await readFile(join(artifactsDir, artifactFileName(artifact)), "utf8");
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

  const maxOutputTokens = outputTokenBudget(recipe);
  const title = cleanText(options.title) || recipe.title;
  const queued = {
    id: randomUUID(),
    callId,
    kind,
    title,
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
      const queued = db.jobs.filter((item) => item.status === "queued");
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

      const stepPrompt = buildWorkPrompt(call, job, recipe.steps[job.stepIndex]);
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
        nextJob.apiStatus = nextJob.stepIndex >= nextJob.stepCount ? "finalizing" : "waiting_between_steps";
        nextJob.progress = nextJob.stepIndex >= nextJob.stepCount ? "Finalizing artifact file." : `Waiting before step ${nextJob.stepIndex + 1}.`;
        appendJobLog(
          nextJob,
          "step_complete",
          nextJob.stepIndex >= nextJob.stepCount
            ? "All model steps completed. Cooper is writing the Markdown file."
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
  const extension = outputType === "html" ? "html" : "md";
  const mimeType = outputType === "html" ? "text/html" : "text/markdown";
  const content = outputType === "html"
    ? normalizeHtml(extractHtmlDocument(job.draft) || prototypeFallbackHtml(safeTitle, job.draft))
    : normalizeMarkdown(`# ${safeTitle}\n\n${job.draft}`);

  await writeFile(join(artifactsDir, `${artifactId}.${extension}`), content, "utf8");

  await updateDb((db) => {
    const nextJob = db.jobs.find((item) => item.id === job.id);
    const nextCall = db.calls.find((item) => item.id === call.id);
    const artifact = {
      id: artifactId,
      callId: call.id,
      jobId: job.id,
      kind: job.kind,
      title: safeTitle,
      outputType,
      extension,
      mimeType,
      file: `data/artifacts/${artifactId}.${extension}`,
      createdAt: now
    };

    db.artifacts.push(artifact);
    if (nextJob) {
      nextJob.status = "completed";
      nextJob.apiStatus = "completed";
      nextJob.artifactId = artifactId;
      nextJob.completedAt = now;
      nextJob.progress = "Artifact ready.";
      nextJob.activeStepSummary = "";
      nextJob.draftCharCount = nextJob.draft?.length || 0;
      appendJobLog(nextJob, "completed", `${outputType === "html" ? "HTML artifact" : "Markdown artifact"} saved: ${safeTitle}.`);
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

function buildWorkPrompt(call, job, step) {
  const transcript = call.transcript
    .map((entry) => `- [${entry.at}] ${entry.speaker || "speaker"}: ${entry.text}`)
    .join("\n");
  const recipe = artifactRecipes[job.kind] || {};
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
- Use the transcript and any attached project context only as supporting context.
- If the sources conflict, follow Michael's additional instruction or pasted source context.

Primary instruction/source context from Michael:
${job.customPrompt || "(none)"}

Current draft:
${job.draft || "(none yet)"}

Current step:
${step}

Attached project context (supporting only):
${call.projectContextSnapshot || "(none attached)"}

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

  if (!callId) {
    return {
      status: "error",
      tool: "generate_aires_template_artifact",
      message: "No active call is available for AIRES template generation.",
      retryable: false
    };
  }

  const examples = requestedTemplate === "all"
    ? getAiresExampleList()
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
  for (const example of uniqueExamples) {
    const extraContext = [
      title && uniqueExamples.length === 1 ? `Requested artifact title: ${title}` : "",
      instruction.text ? `Michael's voice instruction:\n${instruction.text}` : "",
      suppliedContext.text ? `Priority context from the live call/tool request:\n${suppliedContext.text}` : ""
    ].filter(Boolean).join("\n\n");
    const customPrompt = buildAiresExamplePrompt(example, extraContext);
    const kind = artifactRecipes[example.recipeKind] ? example.recipeKind : "aires_requirements";
    const result = await enqueueArtifactJob(callId, kind, customPrompt, {
      allowEmptyTranscript: true,
      title: uniqueExamples.length === 1 && title ? title : example.title
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
      message: "Use mode list_framework, explain_documents, explain_document, workshop_document, interview, or queue_artifact.",
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

  const customPrompt = [
    artifactTitle ? `Artifact title: ${artifactTitle}` : "",
    topic ? `Topic: ${topic}` : "",
    sourceContext ? `Source context:\n${sourceContext}` : "",
    "Apply the AIRES Requirements Framework exactly: Capture -> Distill -> Scope -> Slice -> Verify. Preserve vivid user phrases, label assumptions, avoid inventing customer-specific facts, and create the thinnest useful first slice.",
    "Use the AIRES visual system: architectural, monochrome, precise, soft black, warm grey, sparse Volt accent, no gradients, no stock imagery, no emoji."
  ].filter(Boolean).join("\n\n");

  const result = await enqueueArtifactJob(callId, "aires_requirements", customPrompt, {
    allowEmptyTranscript: Boolean(customPrompt)
  });

  if (!result.ok) {
    return {
      status: "error",
      tool: "run_aires_requirements_framework",
      message: result.error || "Could not queue AIRES requirements work.",
      retryable: false
    };
  }

  return {
    status: "queued",
    tool: "run_aires_requirements_framework",
    kind: "aires_requirements",
    title: result.job.title,
    jobId: result.job.id,
    message: "AIRES scoped requirements are running in Cooper's work queue."
  };
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

  const query = cleanText(args.query);
  if (!query) {
    return {
      status: "error",
      tool: "search_notion_workspace",
      message: "A Notion search query is required.",
      retryable: false
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
  const filter = cleanText(args.filter) || "all";
  const pageSize = clampNumber(args.page_size, 1, 10, notionSearchLimit);
  const body = {
    query: cleanText(args.query),
    page_size: pageSize,
    sort: { direction: "descending", timestamp: "last_edited_time" }
  };

  if (filter === "pages") {
    body.filter = { property: "object", value: "page" };
  } else if (filter === "data_sources" || filter === "databases") {
    body.filter = { property: "object", value: notionSearchDataObject() };
  }

  const payload = await notionRequest("/search", {
    method: "POST",
    body: JSON.stringify(body)
  });

  const results = Array.isArray(payload.results) ? payload.results : [];
  return {
    query: body.query,
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
      lastEditedAt: item.last_edited_time || ""
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
    createdAt: page.created_time || "",
    lastEditedAt: page.last_edited_time || "",
    archived: Boolean(page.archived || page.is_archived),
    inTrash: Boolean(page.in_trash)
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
  const text = cleanText(value);
  if (!text) return "";
  const compactMatches = text.replace(/-/g, "").match(/[0-9a-fA-F]{32}/g);
  const compact = compactMatches?.[compactMatches.length - 1] || "";
  if (!compact) return "";
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
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

  const input = sanitizeArcadeInput(name, args);
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

async function startArcadeAuthorization(name, req) {
  const arcadeToolName = arcadeToolMappings[name];
  if (!arcadeToolName) {
    throw new Error(`No Arcade tool mapping is configured for ${name}.`);
  }

  const client = getArcadeClient();
  const origin = requestOrigin(req);
  const response = await client.tools.authorize({
    tool_name: arcadeToolName,
    user_id: arcadeUserId,
    next_uri: origin || undefined
  });

  return upsertArcadeAuthorization(name, arcadeToolName, response, {
    error: null,
    lastCheckedAt: new Date().toISOString()
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

function sanitizeArcadeInput(name, args) {
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

async function ensureDataStore() {
  await mkdir(artifactsDir, { recursive: true });
  if (!existsSync(dbPath)) {
    await writeFile(dbPath, JSON.stringify({ calls: [], artifacts: [], jobs: [], toolCalls: [], gstackRuns: [], arcadeAuthorizations: [], projects: [], projectSources: [], operatorTasks: [] }, null, 2), "utf8");
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
  return {
    calls: Array.isArray(parsed.calls) ? parsed.calls : [],
    artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
    jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [],
    gstackRuns: Array.isArray(parsed.gstackRuns) ? parsed.gstackRuns : [],
    arcadeAuthorizations: Array.isArray(parsed.arcadeAuthorizations) ? parsed.arcadeAuthorizations : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    projectSources: Array.isArray(parsed.projectSources) ? parsed.projectSources : [],
    operatorTasks: Array.isArray(parsed.operatorTasks) ? parsed.operatorTasks : []
  };
}

async function updateDb(mutator) {
  const operation = writeQueue.then(async () => {
    const db = await readDbRaw();
    const result = await mutator(db);
    await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
    broadcastEvent("state.updated", { at: new Date().toISOString() });
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
    artifacts: sortByDate(db.artifacts).map(publicArtifact),
    jobs: sortByDate(db.jobs).map(publicJob),
    toolCalls: sortByDate(db.toolCalls || []).slice(0, 20).map(publicToolCall),
    gstackRuns: sortByDate(db.gstackRuns || []).slice(0, 20).map(publicGstackRun),
    arcade: arcadeSettingsState(db),
    pushToTalk: pushToTalkConfigFromEnv(process.env),
    mcpApps: {
      servers: publicMcpAppServers()
    },
    recipes: Object.entries(artifactRecipes).map(([kind, recipe]) => ({
      kind,
      title: recipe.title,
      outputType: recipe.outputType || "markdown",
      stepCount: recipe.steps.length
    })),
    limits: {
      jobDelayMs,
      workModel,
      fallbackWorkModel,
      jobMaxAttempts,
      jobMaxOutputTokens,
      gstackModel: process.env.COOPER_GSTACK_MODEL || workModel,
      gstackMaxOutputTokens: Number(process.env.COOPER_GSTACK_MAX_OUTPUT_TOKENS || 2200)
    }
  };
}

function publicOperatorState(db) {
  const tasks = sortByDate(db.operatorTasks || []).map((task) => publicOperatorTask(task, db));
  return {
    runtime: operatorRuntimeInfo(process.env),
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

    const source = {
      id: randomUUID(),
      projectId,
      title: cleanText(input.title) || "Project context",
      sourceType: cleanText(input.sourceType) || "paste",
      mimeType: cleanText(input.mimeType),
      originalName: cleanText(input.originalName),
      text: limited.text,
      charCount: content.length,
      storedCharCount: limited.text.length,
      truncated: limited.truncated,
      createdAt: now,
      updatedAt: now
    };

    db.projectSources.push(source);
    project.updatedAt = now;
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

function publicCall(call) {
  const { projectContextSnapshot: _projectContextSnapshot, ...rest } = call;
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
    render_mcp_app: "MCP App canvas",
    present_aires_example: "AIRES example canvas",
    generate_aires_template_artifact: "AIRES template generator",
    run_aires_requirements_framework: "AIRES requirements"
  }[name] || name;
}

function requestOrigin(req) {
  const origin = cleanText(req.headers.origin);
  if (origin) return origin;
  const host = cleanText(req.headers.host);
  if (!host) return "";
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${host}`;
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
  if (artifact.outputType) return artifact.outputType;
  if (artifact.extension === "json" || artifact.file?.endsWith(".json") || artifact.kind === "mcp_app") return "mcp_app";
  if (artifact.extension === "html" || artifact.file?.endsWith(".html") || artifact.kind === "html_prototype") return "html";
  return "markdown";
}

function defaultArtifactExtension(outputType) {
  if (outputType === "html") return "html";
  if (outputType === "mcp_app") return "json";
  return "md";
}

function defaultArtifactMimeType(outputType) {
  if (outputType === "html") return "text/html";
  if (outputType === "mcp_app") return "application/json";
  return "text/markdown";
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
    if (["queued", "running"].includes(task.status)) {
      scheduleOperatorTask(task.id, 350);
    }
  }
}

async function runOperatorTaskStep(taskId) {
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
  db.operatorTasks = Array.isArray(db.operatorTasks) ? db.operatorTasks : [];
  db.calls.forEach((call) => {
    call.transcript = normalizeTranscript(call.transcript || []);
    call.projectId = cleanText(call.projectId);
    call.projectTitle = cleanText(call.projectTitle);
    call.projectContextSnapshot = cleanText(call.projectContextSnapshot);
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
  db.artifacts.forEach((artifact) => {
    artifact.outputType = artifactOutputType(artifact);
    artifact.extension = artifact.extension || defaultArtifactExtension(artifact.outputType);
    artifact.mimeType = artifact.mimeType || defaultArtifactMimeType(artifact.outputType);
    artifact.file = artifact.file || `data/artifacts/${artifact.id}.${artifact.extension}`;
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
    job.apiStatus = cleanText(job.apiStatus) || (job.status === "completed" ? "completed" : job.status === "failed" ? "failed" : "queued");
    job.activeStepSummary = cleanText(job.activeStepSummary);
    job.lastActivityAt = job.lastActivityAt || job.updatedAt || job.createdAt || new Date().toISOString();
    job.draftCharCount = Number(job.draftCharCount || job.draft?.length || 0);
    if (!Array.isArray(job.logs) || job.logs.length === 0) {
      appendJobLog(job, job.status || "state", `Recovered existing ${job.title || "job"} in ${job.status || "unknown"} state.`);
    }
    if (job.status === "running") {
      job.status = "queued";
      job.apiStatus = "queued";
      job.progress = "Recovered after restart.";
      appendJobLog(job, "recovered", "Server restarted while this job was running. Cooper queued it again.");
      job.updatedAt = new Date().toISOString();
    }
  });
  db.operatorTasks = db.operatorTasks.map((task) => {
    const hydrated = hydrateOperatorTask(task);
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
});
