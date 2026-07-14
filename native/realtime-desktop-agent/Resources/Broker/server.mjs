import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { appendFileSync, createReadStream, mkdirSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { arch, homedir, platform, release, tmpdir, userInfo } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scryptAsync = promisify(scryptCallback);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3417);
const webRoot = resolve(process.env.WEB_ROOT || join(__dirname, "../Web"));
const approvedWorkspace = resolve(process.env.APPROVED_WORKSPACE || process.cwd());
const dataRoot = resolve(process.env.REALTIME_AGENT_DATA_DIR || join(homedir(), "Library", "Application Support", "RealtimeDesktopAgent"));
const storePath = join(dataRoot, "store.json");
const lockPath = join(dataRoot, "lock.json");
const diagnosticsRoot = join(dataRoot, "Diagnostics");
const crashReportPath = join(diagnosticsRoot, "broker-crashes.jsonl");
const maxCrashReports = 20;
const storeVersion = 1;
const manifestSchema = "realtime-desktop-agent.capability-manifest.v1";
const model = process.env.REALTIME_AGENT_MODEL || "gpt-realtime-2";
const voice = process.env.REALTIME_VOICE || "marin";
const transcriptionModel = process.env.REALTIME_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
const maxBodyBytes = 2 * 1024 * 1024;
const maxPdfBytes = 6 * 1024 * 1024;
const maxPdfRequestBytes = Math.ceil(maxPdfBytes * 1.4) + 4096;
const maxFileBytes = 1024 * 1024;
const maxPushToTalkAudioBytes = 12 * 1024 * 1024;
const maxReadChars = 18000;
const maxContextHeaderChars = 12000;
const artifactModel = process.env.REALTIME_AGENT_ARTIFACT_MODEL || process.env.COOPER_WORK_MODEL || "gpt-5.4";
const maxArtifactOutputTokens = Math.min(6000, Math.max(800, Number(process.env.REALTIME_AGENT_ARTIFACT_MAX_OUTPUT_TOKENS || 2200)));
const gstackSkillsRoot = join(__dirname, "gstack-skills");
const gstackModel = process.env.COOPER_GSTACK_MODEL || process.env.COOPER_WORK_MODEL || "gpt-5.4";
const maxGstackOutputTokens = Math.min(6000, Math.max(800, Number(process.env.COOPER_GSTACK_MAX_OUTPUT_TOKENS || 2200)));
const maxGstackInputChars = Math.min(64000, Math.max(1000, Number(process.env.COOPER_GSTACK_INPUT_MAX_CHARS || 32000)));
const maxGstackContextChars = Math.min(48000, Math.max(0, Number(process.env.COOPER_GSTACK_CONTEXT_MAX_CHARS || 24000)));
const keychainService = process.env.REALTIME_AGENT_KEYCHAIN_SERVICE || "RealtimeDesktopAgent.OPENAI_API_KEY";
const keychainAccount = process.env.REALTIME_AGENT_KEYCHAIN_ACCOUNT || userInfo().username;
const notionVersion = process.env.NOTION_VERSION || "2026-03-11";
const notionSearchLimit = Math.min(10, Math.max(1, Number(process.env.NOTION_SEARCH_LIMIT || 5)));
const notionBlockLimit = Math.min(100, Math.max(1, Number(process.env.NOTION_BLOCK_LIMIT || 50)));
const arcadeUserId = process.env.ARCADE_USER_ID || "michael";
const arcadeMcpGatewayUrl = process.env.ARCADE_MCP_GATEWAY_URL || "";
const arcadeToolMappings = Object.freeze({
  search_workspace_context: process.env.ARCADE_SEARCH_WORKSPACE_TOOL || "",
  search_notion_workspace: process.env.ARCADE_NOTION_SEARCH_TOOL || "",
  fetch_notion_page: process.env.ARCADE_NOTION_FETCH_PAGE_TOOL || "",
  get_customer_context: process.env.ARCADE_CUSTOMER_CONTEXT_TOOL || "",
  inspect_engineering_context: process.env.ARCADE_ENGINEERING_CONTEXT_TOOL || "",
  create_followup_action: process.env.ARCADE_CREATE_FOLLOWUP_TOOL || ""
});
const arcadeToolNames = Object.freeze(Object.keys(arcadeToolMappings));
const arcadeToolSet = new Set(arcadeToolNames);
const arcadeDiscoveryCatalog = Object.freeze([
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
]);
const arcadeWritesEnabled = process.env.COOPER_ENABLE_ARCADE_WRITES === "true";
const defaultLockTtlMinutes = 30;
let lockSessionExpiresAt = 0;
let arcadeSdkModule = null;
let arcadeSdkLoadAttempted = false;
let arcadeSdkLoadError = "";
let arcadeClient = null;
let arcadeDiscoveryClient = null;

process.on("uncaughtExceptionMonitor", (error, origin) => {
  recordCrashReportSync("uncaughtException", error, { fatal: true, origin });
});

process.on("unhandledRejection", (reason) => {
  const report = recordCrashReportSync("unhandledRejection", reason, { fatal: false, origin: "promise" });
  console.error(`Unhandled rejection recorded in diagnostics: ${report.id}`);
});

const toolAliases = Object.freeze({
  canvas_show_card: "canvas.show_card",
  canvas_show_table: "canvas.show_table",
  local_search_files: "local.search_files",
  local_read_file: "local.read_file",
  search_workspace_context: "search_workspace_context",
  search_notion_workspace: "search_notion_workspace",
  fetch_notion_page: "fetch_notion_page",
  get_customer_context: "get_customer_context",
  inspect_engineering_context: "inspect_engineering_context",
  create_followup_action: "create_followup_action",
  notion_search: "notion.search",
  notion_fetch_page: "notion.fetch_page",
  run_gstack_skill: "run_gstack_skill",
  open_chrome_tab: "open_chrome_tab",
  search_web: "search_web",
  click_link_with_vision: "click_link_with_vision",
  open_local_app: "open_local_app",
  open_web_app: "open_web_app",
  open_finder_location: "open_finder_location",
  open_terminal_workspace: "open_terminal_workspace",
  app_open_url: "app.open_url",
  app_copy_to_clipboard: "app.copy_to_clipboard"
});

const gstackSkillRegistry = Object.freeze({
  ceo_review: { label: "CEO Review", file: join(gstackSkillsRoot, "ceo-review.md"), source: "plan-ceo-review/SKILL.md" },
  engineering_review: { label: "Engineering Review", file: join(gstackSkillsRoot, "engineering-review.md"), source: "plan-eng-review/SKILL.md" },
  code_review: { label: "Code Review", file: join(gstackSkillsRoot, "code-review.md"), source: "review/SKILL.md" },
  qa_review: { label: "QA Review", file: join(gstackSkillsRoot, "qa-review.md"), source: "qa-only/SKILL.md" },
  spec: { label: "Spec", file: join(gstackSkillsRoot, "spec.md"), source: "spec/SKILL.md" },
  office_hours: { label: "Office Hours", file: join(gstackSkillsRoot, "office-hours.md"), source: "office-hours/SKILL.md" },
  design_review: { label: "Design Review", file: join(gstackSkillsRoot, "design-review.md"), source: "design-review/SKILL.md" }
});
const gstackSkillIds = Object.freeze(Object.keys(gstackSkillRegistry));
const gstackModes = new Set(["advisory", "structured", "voice_summary"]);
const localComputerToolNames = Object.freeze([
  "open_chrome_tab",
  "search_web",
  "click_link_with_vision",
  "open_local_app",
  "open_web_app",
  "open_finder_location",
  "open_terminal_workspace"
]);
const localComputerToolSet = new Set(localComputerToolNames);
const browserApps = Object.freeze({
  chrome: "Google Chrome",
  "google chrome": "Google Chrome",
  safari: "Safari"
});
const webApps = Object.freeze({
  gmail: "https://mail.google.com/",
  "google mail": "https://mail.google.com/",
  drive: "https://drive.google.com/",
  "google drive": "https://drive.google.com/",
  docs: "https://docs.google.com/",
  "google docs": "https://docs.google.com/",
  sheets: "https://sheets.google.com/",
  calendar: "https://calendar.google.com/",
  github: "https://github.com/",
  notion: "https://www.notion.so/",
  claude: "https://claude.ai/",
  chatgpt: "https://chatgpt.com/"
});

const capabilityRoutes = Object.freeze([
  { method: "GET", path: "/health", auth: "none", purpose: "Broker health and basic runtime flags" },
  { method: "GET", path: "/api/lock", auth: "none", purpose: "Local lock status" },
  { method: "POST", path: "/api/lock", auth: "none", purpose: "Configure, unlock, lock, or disable local lock" },
  { method: "GET", path: "/api/manifest", auth: "local_lock", purpose: "Native capability contract" },
  { method: "GET", path: "/api/diagnostics", auth: "local_lock", purpose: "User-safe diagnostics export" },
  { method: "GET", path: "/api/store", auth: "local_lock", purpose: "Export normalized native store" },
  { method: "PUT", path: "/api/store", auth: "local_lock", purpose: "Import normalized native store" },
  { method: "GET", path: "/api/settings", auth: "local_lock", purpose: "Runtime and settings state" },
  { method: "PUT", path: "/api/settings", auth: "local_lock", purpose: "Persist settings patch" },
  { method: "POST", path: "/api/settings/openai-key", auth: "local_lock", purpose: "Write or delete broker OpenAI key" },
  { method: "POST", path: "/api/project-sources/extract-pdf", auth: "local_lock", purpose: "Extract selectable PDF text" },
  { method: "POST", path: "/api/artifacts/generate", auth: "local_lock", purpose: "Generate artifact through Responses API with fallback" },
  { method: "GET", path: "/api/tools/arcade/status", auth: "local_lock", purpose: "Read Arcade configuration, mappings, and persisted non-secret authorization state" },
  { method: "GET", path: "/api/tools/arcade/discovery", auth: "local_lock", purpose: "Discover Arcade services and provider connection status when the SDK is available" },
  { method: "POST", path: "/api/tools/arcade/connect", auth: "local_lock", purpose: "Start provider-level Arcade authorization for a discovered service" },
  { method: "POST", path: "/api/tools/arcade/authorize", auth: "local_lock", purpose: "Start mapped Arcade tool pre-authorization" },
  { method: "POST", path: "/api/tools/arcade/authorize-all", auth: "local_lock", purpose: "Start pre-authorization for all mapped Arcade tools" },
  { method: "POST", path: "/api/tools/arcade/check", auth: "local_lock", purpose: "Check and persist Arcade authorization status" },
  { method: "GET", path: "/api/push-to-talk/config", auth: "none", purpose: "Expose redacted push-to-talk helper status" },
  { method: "POST", path: "/api/push-to-talk/utterance", auth: "ptt_token_or_unlocked", purpose: "Transcribe push-to-talk audio and queue visible Operator work" },
  { method: "POST", path: "/session", auth: "local_lock", purpose: "Create OpenAI Realtime call session" },
  { method: "POST", path: "/api/tools/execute", auth: "local_lock", purpose: "Execute approved local or connector tool" }
]);

const toolDefinitions = [
  {
    type: "function",
    name: "canvas_show_card",
    description: "Render canvas.show_card. Use when information should persist visually beside the call.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        markdown: { type: "string" },
        html: { type: "string" },
        content: { type: "string" },
        format: {
          type: "string",
          enum: ["markdown", "html", "mermaid", "embed"],
          description: "Canonical source format. Defaults to markdown."
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Short filter/group tags for the unified canvas stream."
        },
        type: {
          type: "string",
          description: "Card type, such as plan, diagram, embed, file, search, or note."
        },
        default_mode: {
          type: "string",
          enum: ["text", "html", "mermaid", "embed"],
          description: "Initial renderer mode. Defaults to text."
        },
        supported_render_modes: {
          type: "array",
          items: {
            type: "string",
            enum: ["text", "html", "mermaid", "embed"]
          }
        }
      },
      required: ["title"]
    }
  },
  {
    type: "function",
    name: "canvas_show_table",
    description: "Render canvas.show_table for compact structured data.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        columns: { type: "array", items: { type: "string" } },
        rows: { type: "array", items: { type: "object" } },
        tags: {
          type: "array",
          items: { type: "string" }
        },
        type: { type: "string" }
      },
      required: ["title", "columns", "rows"]
    }
  },
  {
    type: "function",
    name: "local_search_files",
    description: "Run local.search_files inside the approved workspace allowlist only. Return paths and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "local_read_file",
    description: "Run local.read_file inside the approved workspace allowlist only. Ask before reading sensitive files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" }
      },
      required: ["path"]
    }
  },
  {
    type: "function",
    name: "search_workspace_context",
    description: "Search approved Arcade-backed workspace context after Settings pre-authorization.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        sources: { type: "array", items: { type: "string" } },
        customer_or_account: { type: "string" },
        time_range: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "search_notion_workspace",
    description: "Search the Arcade Notion mapping after Settings pre-authorization.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        filter: { type: "string" },
        page_size: { type: "number" }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "fetch_notion_page",
    description: "Fetch a Notion page through the Arcade mapping after Settings pre-authorization.",
    parameters: {
      type: "object",
      properties: {
        page_id_or_url: { type: "string" },
        include_blocks: { type: "boolean" },
        max_blocks: { type: "number" }
      },
      required: ["page_id_or_url"]
    }
  },
  {
    type: "function",
    name: "get_customer_context",
    description: "Fetch customer/account context through an approved Arcade tool mapping.",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        include: { type: "array", items: { type: "string" } }
      },
      required: ["customer_name"]
    }
  },
  {
    type: "function",
    name: "inspect_engineering_context",
    description: "Inspect approved engineering context through an Arcade mapping.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        repo: { type: "string" },
        ticket_id: { type: "string" },
        include_code: { type: "boolean" }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "create_followup_action",
    description: "Create a follow-up through an approved write-capable Arcade mapping. Writes are disabled unless COOPER_ENABLE_ARCADE_WRITES=true.",
    parameters: {
      type: "object",
      properties: {
        action_type: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        owner: { type: "string" },
        due_date: { type: "string" },
        destination: { type: "string" }
      },
      required: ["action_type", "title"]
    }
  },
  {
    type: "function",
    name: "notion_search",
    description: "Search authorized Notion pages/data sources by title and return safe summaries.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        object: {
          type: "string",
          enum: ["page", "data_source", "any"],
          description: "Limit search to pages, data sources, or any shared object. Defaults to page."
        },
        page_size: {
          type: "number",
          description: "Maximum results, 1-10. Defaults to 5."
        }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "notion_fetch_page",
    description: "Fetch an authorized Notion page and return a Markdown-safe content summary.",
    parameters: {
      type: "object",
      properties: {
        page_id: { type: "string" },
        title: { type: "string" }
      },
      required: ["page_id"]
    }
  },
  {
    type: "function",
    name: "run_gstack_skill",
    description: "Run an advisory-only GStack-style review skill through the native broker. It never mutates files, deploys, or creates PRs.",
    parameters: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          enum: ["ceo_review", "engineering_review", "code_review", "qa_review", "spec", "office_hours", "design_review"]
        },
        input: {
          type: "string",
          description: "Primary content to review or transform."
        },
        context: {
          type: "string",
          description: "Optional supporting project, meeting, or constraint context."
        },
        mode: {
          type: "string",
          enum: ["advisory", "structured", "voice_summary"],
          description: "Output mode. Defaults to advisory."
        }
      },
      required: ["skill", "input"]
    }
  },
  {
    type: "function",
    name: "open_chrome_tab",
    description: "Open a URL or blank page in Google Chrome after visible approval.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "http(s) URL or about:blank. Defaults to about:blank." }
      }
    }
  },
  {
    type: "function",
    name: "search_web",
    description: "Search the web in Chrome or Safari after visible approval.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        browser: { type: "string", enum: ["chrome", "safari", "Google Chrome", "Safari"] },
        engine: { type: "string", enum: ["google", "duckduckgo"] }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "click_link_with_vision",
    description: "Use a screenshot and OpenAI vision to locate and click a visible target after visible approval.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string" },
        link_description: { type: "string" },
        min_confidence: { type: "number" }
      }
    }
  },
  {
    type: "function",
    name: "open_local_app",
    description: "Open an allowed local macOS app after visible approval.",
    parameters: {
      type: "object",
      properties: {
        app_name: { type: "string" },
        app: { type: "string" }
      }
    }
  },
  {
    type: "function",
    name: "open_web_app",
    description: "Open a known web app such as Gmail, Drive, Docs, Calendar, GitHub, Notion, Claude, or ChatGPT after visible approval.",
    parameters: {
      type: "object",
      properties: {
        app: { type: "string" },
        url: { type: "string" },
        browser: { type: "string", enum: ["chrome", "safari", "Google Chrome", "Safari"] }
      }
    }
  },
  {
    type: "function",
    name: "open_finder_location",
    description: "Open an allowlisted local folder in Finder after visible approval.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        location: { type: "string" },
        folder: { type: "string" }
      }
    }
  },
  {
    type: "function",
    name: "open_terminal_workspace",
    description: "Open Terminal at an allowlisted workspace path. Commands are prepared but not executed unless execute/confirmed is true.",
    parameters: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        path: { type: "string" },
        command: { type: "string" },
        execute: { type: "boolean" },
        confirmed: { type: "boolean" }
      }
    }
  },
  {
    type: "function",
    name: "app_open_url",
    description: "Run app.open_url. The client asks for confirmation before opening external URLs.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" }
      },
      required: ["url"]
    }
  },
  {
    type: "function",
    name: "app_copy_to_clipboard",
    description: "Run app.copy_to_clipboard for text the user asked to keep.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" }
      },
      required: ["text"]
    }
  }
];

const baseAgentInstructions = `
You are a macOS realtime desktop copilot.

Speak naturally and briefly. Prefer voice for conversational answers. Prefer the canvas when information is visual, structured, persistent, or easier to scan than hear.

Use local tools only when the user asks about files, workspace context, links, summaries, or local actions. Be transparent about what you are accessing. Ask before reading private-looking files. Never silently automate apps.

Tool mapping:
- canvas.show_card is available as function canvas_show_card.
- canvas.show_table is available as function canvas_show_table.
- local.search_files is available as function local_search_files.
- local.read_file is available as function local_read_file.
- Arcade-backed tools are available as search_workspace_context, search_notion_workspace, fetch_notion_page, get_customer_context, inspect_engineering_context, and create_followup_action only after Settings pre-authorization. The broker will return a recoverable connector error if Arcade is missing, unmapped, or unauthorized.
- notion.search is available as function notion_search when the Notion connector is authorized in Settings.
- notion.fetch_page is available as function notion_fetch_page when the Notion connector is authorized in Settings.
- run_gstack_skill is available as an advisory-only review/spec/QA/design/office-hours tool. It cannot mutate files, deploy, or create PRs.
- Computer Use tools are available for approved local actions: open_chrome_tab, search_web, click_link_with_vision, open_local_app, open_web_app, open_finder_location, and open_terminal_workspace. These always require visible user approval in the native app.
- app.open_url is available as function app_open_url.
- app.copy_to_clipboard is available as function app_copy_to_clipboard.

The local file tools are confined to the approved workspace allowlist from Settings. Primary root: ${approvedWorkspace}.

Canvas cards are a unified stream. Prefer one card with canonical source plus tags/type/render metadata instead of duplicating the same content for multiple views. Use Mermaid source when a diagram is requested, HTML only when it is useful, and embeds only for safe external URLs.
`;

function buildSessionConfig({ projectTitle = "", projectContext = "", callMode = "free" } = {}) {
  const contextBlock = projectContext
    ? `\n\nCurrent project context${projectTitle ? ` for ${projectTitle}` : ""}:\n${projectContext}\n\nUse this project context as the active working packet for this call. If a source looks stale or incomplete, say that plainly before acting on it.`
    : "";
  const normalizedMode = normalizeCallMode(callMode);
  const silentMode = normalizedMode === "manual" || normalizedMode === "wake";
  const modeInstructions = normalizedMode === "manual"
    ? "\n\nCall mode: Ask Cooper. Listen and transcribe, but do not respond after every user turn unless the client explicitly asks you to respond."
    : normalizedMode === "wake"
      ? "\n\nCall mode: Wake phrase. Stay silent by default. Listen and transcribe, but respond only when the client explicitly asks you to respond after the user says the Cooper wake phrase."
      : "\n\nCall mode: Free flow. Respond naturally after user turns when useful.";
  return {
    type: "realtime",
    model,
    instructions: `${baseAgentInstructions}${contextBlock}${modeInstructions}`,
    reasoning: { effort: "low" },
    audio: {
      input: {
        noise_reduction: { type: "far_field" },
        transcription: {
          model: transcriptionModel,
          prompt: "Desktop copilot transcript covering product, engineering, local files, summaries, and follow-up actions."
        },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "low",
          create_response: !silentMode,
          interrupt_response: true
        }
      },
      output: { voice }
    },
    tools: toolDefinitions,
    tool_choice: "auto"
  };
}

function normalizeCallMode(mode) {
  const value = cleanString(mode);
  return ["free", "manual", "wake"].includes(value) ? value : "free";
}

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        model,
        voice,
        hasApiKey: Boolean(process.env.OPENAI_API_KEY),
        workspaceRoot: approvedWorkspace,
        storePath,
        supportsProjectContext: true,
        supportsCallModes: ["free", "manual", "wake"],
        supportsPdfExtraction: platform() === "darwin",
        supportsArtifactResponses: true,
        supportsPushToTalkHelper: true,
        supportsGstackAdvisory: true,
        supportsComputerUseExecution: true,
        supportsArcadeAuthorization: true,
        arcadeConfigured: Boolean(process.env.ARCADE_API_KEY),
        arcadeMappedTools: arcadeToolNames.filter((name) => Boolean(arcadeToolMappings[name])),
        arcadeWritesEnabled,
        computerUseDryRun: computerUseDryRunEnabled(),
        artifactModel,
        gstackModel,
        supportsLocalLock: true,
        tools: Object.values(toolAliases)
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/lock") {
      sendJson(res, 200, { ok: true, lock: publicLockStatus(await loadLockConfig()) });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/lock") {
      await handleLocalLock(req, res);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/push-to-talk/config") {
      await handlePushToTalkConfig(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/push-to-talk/utterance") {
      await handlePushToTalkUtterance(req, res);
      return;
    }

    if (await isLockedRequest(requestUrl.pathname)) {
      sendJson(res, 423, {
        error: "Local app lock is enabled. Unlock Cooper to continue.",
        lock: publicLockStatus(await loadLockConfig())
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/diagnostics") {
      const store = await loadStore();
      sendJson(res, 200, await buildDiagnostics(store));
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/diagnostics/crash-test") {
      await handleCrashDiagnosticsTest(req, res);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/manifest") {
      const store = await loadStore();
      sendJson(res, 200, buildCapabilityManifest(store));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/store") {
      const store = await loadStore();
      sendJson(res, 200, { store, metadata: { storePath, schemaVersion: storeVersion } });
      return;
    }

    if (req.method === "PUT" && requestUrl.pathname === "/api/store") {
    const payload = JSON.parse(await readBody(req, maxBodyBytes * 2) || "{}");
    const incomingStore = normalizeStore(payload.store || payload);
    const store = payload.merge === true
      ? mergeStores(await loadStore(), incomingStore)
      : incomingStore;
    await saveStore(store);
    sendJson(res, 200, { store, metadata: { storePath, schemaVersion: storeVersion } });
    return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/settings") {
      const store = await loadStore();
      sendJson(res, 200, await publicSettings(store));
      return;
    }

    if (req.method === "PUT" && requestUrl.pathname === "/api/settings") {
      const payload = JSON.parse(await readBody(req, maxBodyBytes) || "{}");
      const store = await loadStore();
      const nextStore = normalizeStore({
        ...store,
        settings: {
          ...store.settings,
          ...sanitizeSettingsPatch(payload.settings || payload)
        },
        updatedAt: new Date().toISOString()
      });
      await saveStore(nextStore);
      sendJson(res, 200, await publicSettings(nextStore));
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/settings/openai-key") {
      await handleOpenAIKeySettings(req, res);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/tools/arcade/status") {
      await handleArcadeStatus(req, res);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/tools/arcade/discovery") {
      await handleArcadeDiscovery(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/tools/arcade/connect") {
      await handleArcadeConnect(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/tools/arcade/authorize") {
      await handleArcadeAuthorize(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/tools/arcade/authorize-all") {
      await handleArcadeAuthorizeAll(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/tools/arcade/check") {
      await handleArcadeCheck(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/project-sources/extract-pdf") {
      await handlePdfSourceExtraction(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/artifacts/generate") {
      await handleArtifactGeneration(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/session") {
      await handleSession(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/tools/execute") {
      await handleTool(req, res);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res, requestUrl.pathname);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    recordCrashReportSync("requestError", error, { fatal: false, method: req.method, route: req.url || "" });
    console.error(redactSecrets(error?.stack || error?.message || error));
    sendJson(res, 500, { error: "Broker request failed.", detail: redactSecrets(error?.message || error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(JSON.stringify({
    type: "ready",
    url: `http://127.0.0.1:${actualPort}/`,
    workspaceRoot: approvedWorkspace,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY)
  }));
});

async function handleSession(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendText(res, 500, "Missing OPENAI_API_KEY in the macOS app environment.");
    return;
  }

  const sdp = await readBody(req, maxBodyBytes);
  if (!sdp.trim()) {
    sendText(res, 400, "Expected raw SDP body.");
    return;
  }

  const fd = new FormData();
  const projectTitle = readHeader(req, "x-cooper-project-title").slice(0, 180);
  const projectContext = readHeader(req, "x-cooper-project-context").slice(0, maxContextHeaderChars);
  const callModeHeader = readHeader(req, "x-cooper-call-mode");
  const callMode = normalizeCallMode(callModeHeader);
  fd.set("sdp", sdp);
  fd.set("session", JSON.stringify(buildSessionConfig({ projectTitle, projectContext, callMode })));

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Safety-Identifier": "realtime-desktop-agent-local"
    },
    body: fd
  });

  const answerSdp = await response.text();
  const requestId = response.headers.get("x-request-id") || response.headers.get("openai-request-id");
  if (requestId) {
    res.setHeader("X-OpenAI-Request-ID", requestId);
  }

  if (!response.ok) {
    sendText(res, response.status, answerSdp || "Realtime session creation failed.");
    return;
  }

  const location = response.headers.get("Location");
  if (location) {
    res.setHeader("X-OpenAI-Call-Location", location);
  }
  sendText(res, 200, answerSdp, "application/sdp");
}

async function handlePushToTalkConfig(req, res) {
  const auth = await pushToTalkAuthState(req);
  const lock = publicLockStatus(await loadLockConfig());
  sendJson(res, 200, {
    ok: true,
    endpoint: "/api/push-to-talk/utterance",
    method: "POST",
    accepts: ["multipart/form-data"],
    tokenRequired: Boolean(pushToTalkToken()),
    authorized: auth.ok,
    locked: lock.enabled && !lock.unlocked,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    transcriptionModel,
    helper: {
      defaultHotkey: "control+option+space",
      action: "transcribe_and_queue_operator_task",
      approval: "required_before_execution",
      audioStored: false
    }
  });
}

async function handlePushToTalkUtterance(req, res) {
  const auth = await pushToTalkAuthState(req);
  if (!auth.ok) {
    sendJson(res, auth.status, {
      ok: false,
      code: auth.code,
      error: auth.message,
      lock: auth.lock || undefined
    });
    return;
  }

  const parsed = await parsePushToTalkRequest(req);
  if (!parsed.ok) {
    sendJson(res, 400, { ok: false, code: parsed.code, error: parsed.error });
    return;
  }

  const source = cleanString(parsed.fields.source).slice(0, 80) || "macos_hotkey";
  let transcript = cleanString(parsed.fields.transcript).slice(0, 2000);
  let requestId = "";
  if (!transcript) {
    if (!process.env.OPENAI_API_KEY) {
      sendJson(res, 424, {
        ok: false,
        code: "missing_openai_key",
        error: "OpenAI key is required to transcribe push-to-talk audio.",
        fallbackRecommended: true
      });
      return;
    }
    if (!parsed.audio?.data?.length) {
      sendJson(res, 400, { ok: false, code: "missing_audio", error: "Expected an audio file field named audio." });
      return;
    }
    try {
      const result = await transcribePushToTalkAudio(parsed.audio);
      transcript = result.text;
      requestId = result.requestId;
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        code: "transcription_failed",
        error: cleanString(error?.message || error).slice(0, 500) || "Push-to-talk transcription failed."
      });
      return;
    }
  }

  if (!transcript) {
    sendJson(res, 400, { ok: false, code: "empty_transcript", error: "Transcription produced no text." });
    return;
  }

  const action = pushToTalkActionForTranscript(transcript);
  if (action === "stop_computer") {
    const stopped = await stopPushToTalkOperatorWork(transcript, { source });
    sendJson(res, 200, {
      ok: true,
      action,
      message: stopped
        ? `Stopped ${stopped} active Operator task${stopped === 1 ? "" : "s"}.`
        : "No active Operator tasks were running.",
      stopped,
      transcript
    });
    return;
  }

  const task = await queuePushToTalkOperatorTask({
    action,
    transcript,
    source,
    requestId
  });
  sendJson(res, 200, {
    ok: true,
    action,
    message: `${operatorKindLabel(task.kind)} task queued for approval.`,
    taskId: task.id,
    transcript
  });
}

async function handleTool(req, res) {
  const payload = JSON.parse(await readBody(req, maxBodyBytes) || "{}");
  const name = normalizeToolName(payload.name);
  const args = payload.arguments && typeof payload.arguments === "object" ? payload.arguments : {};

  try {
    let output;
    const store = await loadStore();
    const settings = normalizeSettings(store.settings);
    const workspaceRoots = settings.workspaceAllowlist;
    switch (name) {
      case "local_search_files":
        output = await searchFiles(String(args.query || ""), workspaceRoots);
        break;
      case "local_read_file":
        output = await readWorkspaceFile(String(args.path || ""), workspaceRoots);
        break;
      case "search_workspace_context":
      case "search_notion_workspace":
      case "fetch_notion_page":
      case "get_customer_context":
      case "inspect_engineering_context":
      case "create_followup_action":
        output = await executeArcadeMappedTool(name, args);
        break;
      case "notion_search":
        output = await searchNotion(args, settings);
        break;
      case "notion_fetch_page":
        output = await fetchNotionPage(args, settings);
        break;
      case "run_gstack_skill":
        output = await runGstackSkill(args);
        break;
      case "open_chrome_tab":
      case "search_web":
      case "click_link_with_vision":
      case "open_local_app":
      case "open_web_app":
      case "open_finder_location":
      case "open_terminal_workspace":
        output = await executeLocalComputerTool(name, args, { workspaceRoots, env: process.env });
        break;
      case "canvas_show_card":
      case "canvas_show_table":
      case "app_open_url":
      case "app_copy_to_clipboard":
        output = { status: "client_handled", tool: toolAliases[name] };
        break;
      default:
        output = { status: "error", tool: name, message: "Unknown tool." };
    }
    sendJson(res, output.status === "error" ? 400 : 200, { output });
  } catch (error) {
    sendJson(res, 400, {
      output: {
        status: "error",
        tool: toolAliases[name] || name,
        message: String(error?.message || error)
      }
    });
  }
}

async function runGstackSkill({ skill, input, context = "", mode = "advisory" } = {}) {
  const skillId = cleanString(skill);
  const definition = gstackSkillRegistry[skillId];
  if (!definition) {
    return {
      status: "error",
      tool: "run_gstack_skill",
      code: "unknown_gstack_skill",
      message: `Unknown GStack skill: ${skillId || "(missing)"}.`,
      skills: gstackSkillIds
    };
  }

  const selectedMode = gstackModes.has(cleanString(mode)) ? cleanString(mode) : "advisory";
  const userInput = limitGstackText(input, maxGstackInputChars);
  const suppliedContext = limitGstackText(context, maxGstackContextChars);
  if (!userInput.text) {
    return {
      status: "error",
      tool: "run_gstack_skill",
      code: "missing_gstack_input",
      message: "GStack skill input is required."
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      status: "error",
      tool: "run_gstack_skill",
      code: "missing_openai_key",
      recoverable: true,
      message: "OpenAI key is required to run GStack advisory skills."
    };
  }

  const startedAt = Date.now();
  const skillPrompt = await readFile(definition.file, "utf8");
  const requestBody = buildGstackPrompt({
    skillId,
    definition,
    selectedMode,
    skillPrompt,
    input: userInput.text,
    inputTruncated: userInput.truncated,
    context: suppliedContext.text,
    contextTruncated: suppliedContext.truncated
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "realtime-desktop-agent-local"
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => "") } }));
  if (!response.ok) {
    return {
      status: "error",
      tool: "run_gstack_skill",
      code: "gstack_responses_failed",
      recoverable: true,
      message: cleanString(payload?.error?.message) || `OpenAI Responses API failed with ${response.status}.`
    };
  }

  const outputText = extractOutputText(payload);
  const parsed = parseJsonObject(outputText);
  const result = normalizeGstackResult(parsed, {
    skillId,
    fallbackText: outputText,
    inputTruncated: userInput.truncated,
    contextTruncated: suppliedContext.truncated
  });

  return {
    status: "ok",
    tool: "run_gstack_skill",
    skill: result.skill,
    mode: selectedMode,
    label: definition.label,
    model: cleanString(payload.model) || gstackModel,
    requestId: response.headers.get("x-request-id") || response.headers.get("openai-request-id") || cleanString(payload.id),
    durationMs: Date.now() - startedAt,
    advisoryOnly: true,
    result
  };
}

function buildGstackPrompt({ skillId, definition, selectedMode, skillPrompt, input, inputTruncated, context, contextTruncated }) {
  return {
    model: gstackModel,
    instructions: [
      "You are Cooper's native macOS GStack advisory skill runner.",
      "Use the supplied adapted skill prompt as the review rubric.",
      "This is advisory only. Do not execute tools, mutate files, deploy, create PRs, or claim private repo access.",
      "Return only a single valid JSON object. No markdown fences. No hidden reasoning.",
      "All array fields must be arrays of strings. Keep voice_summary concise enough to speak out loud."
    ].join("\n"),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Skill id: ${skillId}
Skill label: ${definition.label}
Mode: ${selectedMode}
Input truncated by broker: ${inputTruncated ? "yes" : "no"}
Context truncated by broker: ${contextTruncated ? "yes" : "no"}

Adapted skill prompt:
${skillPrompt}

Optional context:
${context || "(none)"}

User input to review or transform:
${input}

Return exactly this JSON shape:
{
  "skill": "${skillId}",
  "summary": "one short paragraph",
  "key_findings": ["finding 1"],
  "risks": ["risk 1"],
  "recommendations": ["recommendation 1"],
  "questions": ["at most one high-leverage clarifying question if needed"],
  "next_actions": ["next action 1"],
  "voice_summary": "brief spoken Cooper response"
}
`
          }
        ]
      }
    ],
    reasoning: { effort: selectedMode === "voice_summary" ? "low" : "medium" },
    max_output_tokens: maxGstackOutputTokens,
    text: { format: { type: "text" } }
  };
}

function normalizeGstackResult(parsed, { skillId, fallbackText, inputTruncated, contextTruncated }) {
  const result = isPlainObject(parsed) ? parsed : {};
  const summary = cleanString(result.summary) || cleanString(fallbackText).slice(0, 1200);
  const warnings = [];
  if (inputTruncated) warnings.push("Input was truncated by broker limits.");
  if (contextTruncated) warnings.push("Context was truncated by broker limits.");
  if (!isPlainObject(parsed)) warnings.push("Model response was normalized because it was not valid JSON.");
  return {
    skill: cleanString(result.skill) || skillId,
    summary,
    key_findings: normalizeGstackStringArray(result.key_findings),
    risks: [...warnings, ...normalizeGstackStringArray(result.risks)],
    recommendations: normalizeGstackStringArray(result.recommendations),
    questions: normalizeGstackStringArray(result.questions).slice(0, 1),
    next_actions: normalizeGstackStringArray(result.next_actions),
    voice_summary: cleanString(result.voice_summary) || summary.slice(0, 600)
  };
}

function parseJsonObject(value) {
  const text = cleanString(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {}
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {}
    }
  }
  return null;
}

function normalizeGstackStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(stringifyGstackListItem).filter(Boolean).slice(0, 12);
  }
  const text = stringifyGstackListItem(value);
  return text ? [text] : [];
}

function stringifyGstackListItem(value) {
  if (typeof value === "string") return cleanString(value);
  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`)
      .join("; ")
      .slice(0, 1000);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function limitGstackText(value, maxChars) {
  const text = cleanString(value);
  const limit = Math.max(0, Number(maxChars || 0));
  if (!limit || text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit).trim(), truncated: true };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function executeLocalComputerTool(name, args = {}, options = {}) {
  const cleanName = cleanString(name);
  const env = options.env || process.env;
  const workspaceRoots = Array.isArray(options.workspaceRoots) ? options.workspaceRoots : [approvedWorkspace];
  logLocalComputerTool("call", cleanName, args);

  try {
    let output;
    switch (cleanName) {
      case "open_chrome_tab":
        output = await openChromeTab(args, env);
        break;
      case "search_web":
        output = await searchWeb(args, env);
        break;
      case "click_link_with_vision":
        output = await clickLinkWithVision(args, env);
        break;
      case "open_local_app":
        output = await openLocalApp(args, env);
        break;
      case "open_web_app":
        output = await openWebApp(args, env);
        break;
      case "open_finder_location":
        output = await openFinderLocation(args, workspaceRoots, env);
        break;
      case "open_terminal_workspace":
        output = await openTerminalWorkspace(args, workspaceRoots, env);
        break;
      default:
        output = { status: "error", tool: cleanName, message: `Unknown local computer tool: ${cleanName || "(missing)"}` };
    }
    logLocalComputerTool("result", cleanName, output);
    return output;
  } catch (error) {
    const output = {
      status: "error",
      tool: cleanName,
      message: cleanString(error?.message || error) || "Local computer tool failed."
    };
    logLocalComputerTool("error", cleanName, output);
    return output;
  }
}

async function openChromeTab(args = {}, env = process.env) {
  const url = cleanString(args.url || args.target_url || args.targetUrl || "about:blank") || "about:blank";
  if (!isSafeComputerUrl(url)) {
    return { status: "error", tool: "open_chrome_tab", message: "Only http(s) URLs or about:blank are supported." };
  }
  if (!computerUseDryRunEnabled(env)) {
    await runAppleScript(chromeTabScript(url));
  }
  return {
    status: "completed",
    tool: "open_chrome_tab",
    browser: "Google Chrome",
    url,
    dryRun: computerUseDryRunEnabled(env),
    message: `Opened a new Chrome tab${url === "about:blank" ? "" : ` at ${url}`}.`
  };
}

async function searchWeb(args = {}, env = process.env) {
  const query = cleanString(args.query || args.q || args.text);
  if (!query) return { status: "error", tool: "search_web", message: "Search query is required." };
  const browser = normalizeBrowserName(args.browser || "chrome");
  const url = buildSearchUrl(query, args.engine || "google");
  if (!computerUseDryRunEnabled(env)) {
    try {
      if (browser === "Safari") {
        await runAppleScript(safariSearchScript(query));
      } else {
        await runAppleScript(chromeSearchScript(query));
      }
    } catch {
      await openUrlInBrowser(url, browser);
    }
  }
  return {
    status: "completed",
    tool: "search_web",
    browser,
    query,
    url,
    dryRun: computerUseDryRunEnabled(env),
    message: `Opened search results for "${query}" in ${browser}.`
  };
}

async function clickLinkWithVision(args = {}, env = process.env) {
  const description = cleanString(args.link_description || args.description || args.target || args.text);
  if (!description) {
    return { status: "error", tool: "click_link_with_vision", message: "Describe the link or result to click." };
  }
  if (computerUseDryRunEnabled(env)) {
    return {
      status: "completed",
      tool: "click_link_with_vision",
      description,
      dryRun: true,
      message: `Dry-run located and clicked "${description}".`
    };
  }
  if (!env.OPENAI_API_KEY) {
    return {
      status: "error",
      tool: "click_link_with_vision",
      code: "missing_openai_key",
      recoverable: true,
      message: "OpenAI key is required for vision click."
    };
  }

  const screenshot = await takeScreenshot();
  try {
    const location = await locateClickTargetWithVision(screenshot.path, description, env);
    const minConfidence = Number.isFinite(Number(args.min_confidence)) ? Number(args.min_confidence) : 0.35;
    if (location.x === null || location.y === null || location.confidence < minConfidence) {
      return {
        status: "not_found",
        tool: "click_link_with_vision",
        description,
        confidence: location.confidence,
        reason: location.reason || "The requested target was not confidently located."
      };
    }
    const point = await screenshotPixelToScreenPoint(screenshot.path, location.x, location.y);
    await clickScreenPoint(point.x, point.y);
    return {
      status: "completed",
      tool: "click_link_with_vision",
      description,
      screenshot: screenshot.summary,
      pixel: { x: location.x, y: location.y },
      point,
      confidence: location.confidence,
      reason: location.reason,
      message: `Clicked the visual target for "${description}".`
    };
  } finally {
    await rm(screenshot.dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function openLocalApp(args = {}, env = process.env) {
  const appName = cleanString(args.app_name || args.appName || args.name || args.app);
  if (!appName) return { status: "error", tool: "open_local_app", message: "App name is required." };
  const allowed = allowedComputerApps(env).find((candidate) => candidate.toLowerCase() === appName.toLowerCase());
  if (!allowed) {
    return {
      status: "blocked",
      tool: "open_local_app",
      appName,
      allowedApps: allowedComputerApps(env),
      message: `${appName} is not in COOPER_COMPUTER_USE_ALLOWED_APPS.`
    };
  }
  if (!computerUseDryRunEnabled(env)) {
    await execFileAsync("open", ["-a", allowed]);
  }
  return {
    status: "completed",
    tool: "open_local_app",
    appName: allowed,
    dryRun: computerUseDryRunEnabled(env),
    message: `Opened ${allowed}.`
  };
}

async function openWebApp(args = {}, env = process.env) {
  const name = cleanString(args.app || args.web_app || args.webApp || args.name).toLowerCase();
  const url = webApps[name] || cleanString(args.url || args.target_url || args.targetUrl);
  if (!url || !isSafeComputerUrl(url)) {
    return {
      status: "error",
      tool: "open_web_app",
      message: `Unknown or unsafe web app "${name || "(missing)"}".`
    };
  }
  const browser = normalizeBrowserName(args.browser || "chrome");
  if (!computerUseDryRunEnabled(env)) {
    await openUrlInBrowser(url, browser);
  }
  return {
    status: "completed",
    tool: "open_web_app",
    browser,
    app: name || url,
    url,
    dryRun: computerUseDryRunEnabled(env),
    message: `Opened ${name || url} in ${browser}.`
  };
}

async function openFinderLocation(args = {}, workspaceRoots = [approvedWorkspace], env = process.env) {
  const requestedPath = cleanString(args.path || args.location || args.folder) || approvedWorkspace;
  const resolved = await resolveAllowedComputerPath(requestedPath, workspaceRoots);
  if (!resolved.ok) return resolved.output;
  if (!computerUseDryRunEnabled(env)) {
    await execFileAsync("open", [resolved.path]);
  }
  return {
    status: "completed",
    tool: "open_finder_location",
    path: resolved.path,
    workspaceRoot: resolved.workspaceRoot,
    dryRun: computerUseDryRunEnabled(env),
    message: `Opened ${resolved.path} in Finder.`
  };
}

async function openTerminalWorkspace(args = {}, workspaceRoots = [approvedWorkspace], env = process.env) {
  const requestedPath = cleanString(args.cwd || args.path || args.working_directory || args.workingDirectory) || approvedWorkspace;
  const resolved = await resolveAllowedComputerPath(requestedPath, workspaceRoots);
  if (!resolved.ok) return resolved.output;
  const command = cleanString(args.command);
  const execute = args.execute === true || args.confirmed === true;
  if (!computerUseDryRunEnabled(env)) {
    await execFileAsync("open", ["-a", "Terminal", resolved.path]);
    if (command && execute) {
      await runAppleScript(terminalCommandScript(resolved.path, command));
    }
  }
  return {
    status: "completed",
    tool: "open_terminal_workspace",
    cwd: resolved.path,
    workspaceRoot: resolved.workspaceRoot,
    commandPrepared: Boolean(command),
    commandExecuted: Boolean(command && execute),
    dryRun: computerUseDryRunEnabled(env),
    message: command && !execute
      ? "Opened Terminal. Command was not executed because execute/confirmed was not true."
      : `Opened Terminal at ${resolved.path}.`
  };
}

async function resolveAllowedComputerPath(value, workspaceRoots) {
  const target = resolve(value.replace(/^~(?=$|\/)/, homedir()));
  let realTarget = target;
  try {
    realTarget = await realpath(target);
  } catch {
    // Allow non-existing terminal cwd/finder paths to fail later only if inside an approved root.
  }
  let workspaceRoot = "";
  for (const root of workspaceRoots) {
    let realRoot = resolve(root);
    try {
      realRoot = await realpath(root);
    } catch {}
    if (isInside(root, target) || isInside(root, realTarget) || isInside(realRoot, realTarget) || isInside(realRoot, target)) {
      workspaceRoot = root;
      break;
    }
  }
  if (!workspaceRoot) {
    return {
      ok: false,
      output: {
        status: "blocked",
        tool: "computer_use_path",
        path: target,
        message: "Path is outside the approved workspace allowlist."
      }
    };
  }
  return { ok: true, path: realTarget, workspaceRoot };
}

async function locateClickTargetWithVision(screenshotPath, description, env = process.env) {
  const visionModel = env.COOPER_VISION_CLICK_MODEL || env.COOPER_WORK_MODEL || artifactModel;
  const image = await readFile(screenshotPath);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "realtime-desktop-agent-local"
    },
    body: JSON.stringify({
      model: visionModel,
      instructions: "You locate clickable UI targets in screenshots. Return only JSON.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Find the clickable link, search result, button, or UI element described below.",
                "Return only JSON: {\"x\":number|null,\"y\":number|null,\"confidence\":number,\"reason\":\"short\"}.",
                "Coordinates must be screenshot pixel coordinates from the top-left corner.",
                "If the requested target is not visible, return x:null, y:null, confidence:0.",
                "",
                `Target description: ${description}`
              ].join("\n")
            },
            {
              type: "input_image",
              image_url: `data:image/png;base64,${image.toString("base64")}`
            }
          ]
        }
      ],
      max_output_tokens: 240,
      text: { format: { type: "text" } }
    })
  });
  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => "") } }));
  if (!response.ok) throw new Error(cleanString(payload?.error?.message) || `Vision click failed with ${response.status}.`);
  return parseVisionClickJson(extractOutputText(payload));
}

function parseVisionClickJson(value = "") {
  const text = String(value || "").trim();
  const json = text.match(/```json\s*([\s\S]*?)```/i)?.[1] || text.match(/\{[\s\S]*\}/)?.[0] || text;
  try {
    const parsed = JSON.parse(json);
    return {
      x: Number.isFinite(Number(parsed.x)) ? Number(parsed.x) : null,
      y: Number.isFinite(Number(parsed.y)) ? Number(parsed.y) : null,
      confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 0,
      reason: cleanString(parsed.reason)
    };
  } catch {
    return { x: null, y: null, confidence: 0, reason: "The vision model did not return parseable JSON." };
  }
}

async function takeScreenshot() {
  const dir = await mkdtemp(join(tmpdir(), "cooper-click-"));
  const path = join(dir, "screen.png");
  await execFileAsync("screencapture", ["-x", path]);
  const size = await imageSize(path);
  return { dir, path, summary: size };
}

async function screenshotPixelToScreenPoint(path, x, y) {
  const image = await imageSize(path);
  const screen = await desktopBounds();
  const scaleX = image.width && screen.width ? image.width / screen.width : 1;
  const scaleY = image.height && screen.height ? image.height / screen.height : scaleX;
  return {
    x: Math.round(Number(x) / Math.max(0.1, scaleX)),
    y: Math.round(Number(y) / Math.max(0.1, scaleY)),
    scaleX: Number(scaleX.toFixed(3)),
    scaleY: Number(scaleY.toFixed(3))
  };
}

async function imageSize(path) {
  const { stdout } = await execFileAsync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path]);
  return {
    width: Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] || 0),
    height: Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] || 0)
  };
}

async function desktopBounds() {
  try {
    const { stdout } = await runAppleScript('tell application "Finder" to get bounds of window of desktop');
    const values = stdout.split(",").map((item) => Number(item.trim())).filter(Number.isFinite);
    if (values.length >= 4) {
      return {
        width: Math.max(1, values[2] - values[0]),
        height: Math.max(1, values[3] - values[1])
      };
    }
  } catch {}
  return { width: 1, height: 1 };
}

async function clickScreenPoint(x, y) {
  await runAppleScript(`tell application "System Events" to click at {${Math.round(x)}, ${Math.round(y)}}`);
}

async function openUrlInBrowser(url, browser = "Google Chrome") {
  if (browser === "Safari") {
    await runAppleScript(safariTabScript(url));
  } else {
    await runAppleScript(chromeTabScript(url));
  }
}

function buildSearchUrl(query, engine = "google") {
  const encoded = encodeURIComponent(cleanString(query));
  if (cleanString(engine).toLowerCase() === "duckduckgo") return `https://duckduckgo.com/?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

function normalizeBrowserName(browser = "chrome") {
  return browserApps[cleanString(browser).toLowerCase()] || "Google Chrome";
}

function allowedComputerApps(env = process.env) {
  const configured = env?.COOPER_COMPUTER_USE_ALLOWED_APPS;
  const defaults = "Spotify,Claude,Claude Code,Google Chrome,Safari,Slack,Notion,Finder,Terminal,Visual Studio Code,Codex,Xcode";
  return String(configured || defaults).split(",").map(cleanString).filter(Boolean);
}

function computerUseDryRunEnabled(env = process.env) {
  return env?.REALTIME_AGENT_COMPUTER_USE_DRY_RUN === "1";
}

function isSafeComputerUrl(value) {
  const text = cleanString(value);
  if (text === "about:blank") return true;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function chromeTabScript(url) {
  return `
tell application "Google Chrome"
  activate
  if (count of windows) = 0 then make new window
  tell front window
    make new tab at end of tabs with properties {URL:${appleString(url)}}
    set active tab index to count of tabs
  end tell
end tell`;
}

function safariTabScript(url) {
  return `
tell application "Safari"
  activate
  if (count of windows) = 0 then make new document
  tell front window
    set current tab to (make new tab with properties {URL:${appleString(url)}})
  end tell
end tell`;
}

function chromeSearchScript(query) {
  return `
${chromeTabScript("about:blank")}
delay 0.25
tell application "System Events"
  keystroke ${appleString(query)}
  key code 36
end tell`;
}

function safariSearchScript(query) {
  return `
${safariTabScript("about:blank")}
delay 0.25
tell application "System Events"
  keystroke ${appleString(query)}
  key code 36
end tell`;
}

function terminalCommandScript(cwd, command) {
  const script = `cd ${shellQuote(cwd)} && ${command}`;
  return `
tell application "Terminal"
  activate
  do script ${appleString(script)}
end tell`;
}

async function runAppleScript(script) {
  return execFileAsync("osascript", ["-e", script], { timeout: 15000 });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function appleString(value) {
  return JSON.stringify(String(value || ""));
}

function logLocalComputerTool(phase, name, payload = {}) {
  console.log(`[cooper-computer:${phase}] ${name} ${JSON.stringify(redactComputerPayload(payload))}`);
}

function redactComputerPayload(payload = {}) {
  const output = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (/token|key|secret|password|authorization/i.test(key)) {
      output[key] = "[redacted]";
    } else if (typeof value === "string" && value.length > 500) {
      output[key] = `${value.slice(0, 497)}...`;
    } else {
      output[key] = value;
    }
  }
  return output;
}

async function pushToTalkAuthState(req) {
  const requiredToken = pushToTalkToken();
  if (requiredToken) {
    const providedToken = readHeader(req, "x-cooper-ptt-token");
    if (!safeTokenEqual(providedToken, requiredToken)) {
      return {
        ok: false,
        status: 401,
        code: "ptt_token_required",
        message: "Push-to-talk token is missing or invalid."
      };
    }
    return { ok: true, mode: "token" };
  }

  const lock = publicLockStatus(await loadLockConfig());
  if (lock.enabled && !lock.unlocked) {
    return {
      ok: false,
      status: 423,
      code: "local_lock_required",
      message: "Unlock Cooper or configure COOPER_PTT_TOKEN before using push-to-talk.",
      lock
    };
  }
  return { ok: true, mode: "unlocked" };
}

function pushToTalkToken() {
  return cleanString(process.env.COOPER_PTT_TOKEN);
}

function safeTokenEqual(a, b) {
  const left = Buffer.from(cleanString(a));
  const right = Buffer.from(cleanString(b));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function parsePushToTalkRequest(req) {
  const contentType = readHeader(req, "content-type").toLowerCase();
  if (contentType.includes("application/json")) {
    const payload = JSON.parse(await readBody(req, maxBodyBytes) || "{}");
    return {
      ok: true,
      fields: {
        source: cleanString(payload.source),
        transcript: cleanString(payload.transcript)
      },
      audio: null
    };
  }
  if (!contentType.includes("multipart/form-data")) {
    return {
      ok: false,
      code: "unsupported_content_type",
      error: "Expected multipart/form-data from the push-to-talk helper."
    };
  }

  const body = await readRawBody(req, maxPushToTalkAudioBytes);
  const form = parseMultipartForm(body, contentType);
  if (!form.ok) {
    return form;
  }
  return {
    ok: true,
    fields: form.fields,
    audio: form.files.audio || null
  };
}

function parseMultipartForm(body, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = cleanString(boundaryMatch?.[1] || boundaryMatch?.[2]);
  if (!boundary) {
    return { ok: false, code: "missing_boundary", error: "Multipart boundary is missing." };
  }

  const fields = {};
  const files = {};
  const raw = body.toString("latin1");
  const parts = raw.split(`--${boundary}`);
  for (let part of parts) {
    part = part.replace(/^\r?\n/, "");
    if (!part || part === "--" || part === "--\r\n") continue;
    part = part.replace(/\r?\n--$/, "").replace(/\r?\n$/, "");

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headerText = part.slice(0, headerEnd);
    const bodyText = part.slice(headerEnd + 4);
    const headers = parseMultipartHeaders(headerText);
    const disposition = headers["content-disposition"] || "";
    const name = multipartDispositionValue(disposition, "name");
    if (!name) continue;
    const filename = multipartDispositionValue(disposition, "filename");
    const data = Buffer.from(bodyText, "latin1");
    if (filename) {
      files[name] = {
        filename: safeUploadName(filename, `${name}.m4a`),
        contentType: headers["content-type"] || "application/octet-stream",
        data
      };
    } else {
      fields[name] = data.toString("utf8").trim();
    }
  }
  return { ok: true, fields, files };
}

function parseMultipartHeaders(headerText) {
  const headers = {};
  for (const line of headerText.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

function multipartDispositionValue(disposition, key) {
  const match = new RegExp(`${key}="([^"]*)"`, "i").exec(disposition);
  return cleanString(match?.[1]);
}

function safeUploadName(value, fallback) {
  const name = basename(cleanString(value) || fallback);
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || fallback;
}

async function transcribePushToTalkAudio(audio) {
  const fd = new FormData();
  fd.set("model", transcriptionModel);
  fd.set("file", new Blob([audio.data], { type: audio.contentType || "audio/mp4" }), audio.filename || "utterance.m4a");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Safety-Identifier": "realtime-desktop-agent-local"
    },
    body: fd
  });
  const requestId = response.headers.get("x-request-id") || response.headers.get("openai-request-id") || "";
  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => "") } }));
  if (!response.ok) {
    throw new Error(cleanString(payload?.error?.message) || `OpenAI transcription failed with ${response.status}.`);
  }
  return {
    text: cleanString(payload.text).slice(0, 2000),
    requestId
  };
}

async function queuePushToTalkOperatorTask({ action, transcript, source, requestId }) {
  const now = new Date().toISOString();
  const kind = action === "computer_task_queued" ? "computer_use" : "push_to_talk";
  const title = `${kind === "computer_use" ? "Computer Use" : "Push-to-talk"}: ${pushToTalkTitle(transcript)}`;
  const task = normalizeOperatorTask({
    id: `operator-ptt-${Date.now()}-${randomBytes(3).toString("hex")}`,
    title,
    kind,
    status: "approval_required",
    risk: kind === "computer_use" ? "high" : "medium",
    summary: `Transcribed from ${source}; waiting for visible approval before any action runs.`,
    logs: [
      {
        id: `oplog-ptt-${Date.now()}-${randomBytes(3).toString("hex")}`,
        level: "approval",
        message: `Queued from push-to-talk: "${transcript.slice(0, 360)}"`,
        createdAt: now
      },
      requestId ? {
        id: `oplog-ptt-${Date.now()}-${randomBytes(3).toString("hex")}`,
        level: "info",
        message: `Transcription request ${requestId}`,
        createdAt: now
      } : null
    ].filter(Boolean),
    artifacts: [],
    createdAt: now,
    updatedAt: now
  });

  const store = await loadStore();
  const settings = normalizeSettings(store.settings);
  const nextStore = normalizeStore({
    ...store,
    operatorTasks: [task, ...store.operatorTasks],
    settings: {
      ...settings,
      toolAudit: [
        {
          id: `audit-ptt-${Date.now()}-${randomBytes(3).toString("hex")}`,
          kind: "operator",
          title: "Push-to-talk utterance queued",
          detail: `${operatorKindLabel(task.kind)}: ${pushToTalkTitle(transcript)}`,
          createdAt: now
        },
        ...settings.toolAudit
      ]
    },
    updatedAt: now
  });
  await saveStore(nextStore);
  return task;
}

async function stopPushToTalkOperatorWork(transcript, { source }) {
  const store = await loadStore();
  const now = new Date().toISOString();
  let stopped = 0;
  const operatorTasks = store.operatorTasks.map((task) => {
    const stoppable = ["queued", "approval_required", "running", "blocked"].includes(task.status)
      && ["computer_use", "push_to_talk"].includes(task.kind);
    if (!stoppable) return task;
    stopped += 1;
    return normalizeOperatorTask({
      ...task,
      status: "stopped",
      stoppedAt: now,
      summary: `Stopped from push-to-talk (${source}).`,
      logs: [
        {
          id: `oplog-ptt-stop-${Date.now()}-${randomBytes(3).toString("hex")}`,
          level: "warning",
          message: `Push-to-talk stop command: "${transcript.slice(0, 360)}"`,
          createdAt: now
        },
        ...(task.logs || [])
      ],
      updatedAt: now
    });
  });

  const settings = normalizeSettings(store.settings);
  await saveStore(normalizeStore({
    ...store,
    operatorTasks,
    settings: {
      ...settings,
      toolAudit: [
        {
          id: `audit-ptt-stop-${Date.now()}-${randomBytes(3).toString("hex")}`,
          kind: "operator",
          title: "Push-to-talk stop",
          detail: `${stopped} task(s) stopped from ${source}.`,
          createdAt: now
        },
        ...settings.toolAudit
      ]
    },
    updatedAt: now
  }));
  return stopped;
}

function pushToTalkActionForTranscript(transcript) {
  const text = transcript.toLowerCase();
  if (/\b(stop|cancel|abort|halt)\b.*\b(computer|desktop|automation|operator|task|work)\b/.test(text)) {
    return "stop_computer";
  }
  if (/^(open|launch|download|click|type|press|go to|navigate|search|find|run|close|move|copy|paste)\b/.test(text)
    || /\b(on my computer|in chrome|in safari|in finder|in terminal|in xcode|desktop)\b/.test(text)) {
    return "computer_task_queued";
  }
  return "operator_task_queued";
}

function pushToTalkTitle(transcript) {
  const text = cleanString(transcript).replace(/\s+/g, " ");
  return (text || "Untitled utterance").slice(0, 96);
}

function operatorKindLabel(kind) {
  if (kind === "computer_use") return "Computer Use";
  if (kind === "push_to_talk") return "Push-to-talk";
  return "Operator";
}

async function handleOpenAIKeySettings(req, res) {
  const payload = JSON.parse(await readBody(req, maxBodyBytes) || "{}");
  const action = cleanString(payload.action);

  if (action === "delete") {
    delete process.env.OPENAI_API_KEY;
    const keychain = await deleteKeychainPassword().catch((error) => ({ ok: false, error: String(error?.message || error) }));
    sendJson(res, 200, {
      ok: true,
      hasApiKey: false,
      keychain,
      message: keychain.ok ? "OpenAI key removed from this broker and Keychain." : "OpenAI key removed from this broker. Keychain delete did not complete."
    });
    return;
  }

  if (action === "save") {
    const apiKey = cleanString(payload.apiKey);
    if (!apiKey.startsWith("sk-") || apiKey.length < 20) {
      sendJson(res, 400, { ok: false, error: "Provide a valid OpenAI API key." });
      return;
    }
    process.env.OPENAI_API_KEY = apiKey;
    const keychain = await writeKeychainPassword(apiKey).catch((error) => ({ ok: false, error: String(error?.message || error) }));
    sendJson(res, 200, {
      ok: true,
      hasApiKey: true,
      keychain,
      message: keychain.ok ? "OpenAI key saved to Keychain and this broker." : "OpenAI key loaded for this broker. Keychain save did not complete."
    });
    return;
  }

  sendJson(res, 400, { ok: false, error: "Use action save or delete." });
}

async function handleArcadeStatus(_req, res) {
  const store = await loadStore();
  sendJson(res, 200, { ok: true, ...arcadeSettingsState(store) });
}

async function handleArcadeDiscovery(_req, res) {
  try {
    sendJson(res, 200, { ok: true, ...(await arcadeDiscoveryState()) });
  } catch (error) {
    sendJson(res, arcadeErrorStatus(error, 502), {
      ok: false,
      configured: Boolean(process.env.ARCADE_API_KEY),
      userId: arcadeUserId,
      sdk: arcadeSdkStatus(),
      error: cleanString(error?.message || error) || "Could not load Arcade discovery."
    });
  }
}

async function handleArcadeConnect(req, res) {
  const payload = JSON.parse(await readBody(req, maxBodyBytes) || "{}");
  const service = cleanString(payload.service);
  if (!arcadeDiscoveryCatalog.some((item) => item.service === service)) {
    sendJson(res, 400, { ok: false, code: "unknown_arcade_service", error: `Unknown Arcade service: ${service || "(missing)"}.` });
    return;
  }
  if (!process.env.ARCADE_API_KEY) {
    sendJson(res, 424, missingArcadeKeyPayload());
    return;
  }

  try {
    const authorization = await startArcadeServiceAuthorization(service);
    sendJson(res, 200, {
      ok: true,
      service,
      authorization: publicArcadeProviderAuthorization(authorization),
      arcade: arcadeSettingsState(await loadStore())
    });
  } catch (error) {
    sendJson(res, arcadeErrorStatus(error, 502), arcadeErrorPayload(error, `Could not connect ${service} through Arcade.`));
  }
}

async function handleArcadeAuthorize(req, res) {
  const payload = JSON.parse(await readBody(req, maxBodyBytes) || "{}");
  const name = cleanString(payload.name);
  if (!arcadeToolMappings[name]) {
    sendJson(res, 400, {
      ok: false,
      code: "arcade_mapping_required",
      error: `No Arcade mapping is configured for ${name || "(missing)"}.`,
      mappingEnv: mappingEnvName(name)
    });
    return;
  }
  if (!process.env.ARCADE_API_KEY) {
    sendJson(res, 424, missingArcadeKeyPayload());
    return;
  }

  try {
    const authorization = await startArcadeAuthorization(name);
    sendJson(res, 200, {
      ok: true,
      authorization: publicArcadeAuthorization(authorization),
      arcade: arcadeSettingsState(await loadStore())
    });
  } catch (error) {
    sendJson(res, arcadeErrorStatus(error, 502), arcadeErrorPayload(error, "Could not start Arcade authorization."));
  }
}

async function handleArcadeAuthorizeAll(_req, res) {
  if (!process.env.ARCADE_API_KEY) {
    sendJson(res, 424, missingArcadeKeyPayload());
    return;
  }

  const names = arcadeToolNames.filter((name) => arcadeToolMappings[name]);
  const results = [];
  for (const name of names) {
    try {
      const authorization = await startArcadeAuthorization(name);
      results.push({ name, ok: true, authorization: publicArcadeAuthorization(authorization) });
    } catch (error) {
      results.push({
        name,
        ok: false,
        code: arcadeErrorCode(error),
        error: cleanString(error?.message || error) || "Authorization failed."
      });
    }
  }

  sendJson(res, 200, {
    ok: results.every((item) => item.ok),
    results,
    arcade: arcadeSettingsState(await loadStore())
  });
}

async function handleArcadeCheck(req, res) {
  const payload = JSON.parse(await readBody(req, maxBodyBytes) || "{}");
  const name = cleanString(payload.name);
  const store = await loadStore();
  const authorization = latestArcadeAuthorization(store, name);
  if (!authorization?.authorizationId) {
    sendJson(res, 400, {
      ok: false,
      code: "arcade_authorization_not_started",
      error: `No authorization flow has been started for ${name || "(missing)"}.`,
      arcade: arcadeSettingsState(store)
    });
    return;
  }
  if (!process.env.ARCADE_API_KEY) {
    sendJson(res, 424, missingArcadeKeyPayload());
    return;
  }

  try {
    const client = await getArcadeClient();
    const response = await client.auth.status({ id: authorization.authorizationId, wait: 1 });
    const updated = await upsertArcadeAuthorization(name, authorization.arcadeToolName, response, {
      error: null,
      lastCheckedAt: new Date().toISOString()
    });
    sendJson(res, 200, {
      ok: true,
      authorization: publicArcadeAuthorization(updated),
      arcade: arcadeSettingsState(await loadStore())
    });
  } catch (error) {
    const updated = await upsertArcadeAuthorization(name, authorization.arcadeToolName, {}, {
      status: "failed",
      error: cleanString(error?.message || error) || "Could not check Arcade authorization.",
      lastCheckedAt: new Date().toISOString()
    });
    sendJson(res, arcadeErrorStatus(error, 502), {
      ok: false,
      authorization: publicArcadeAuthorization(updated),
      arcade: arcadeSettingsState(await loadStore()),
      ...arcadeErrorPayload(error, updated.error)
    });
  }
}

async function executeArcadeMappedTool(name, args = {}) {
  const arcadeToolName = arcadeToolMappings[name];
  const connectorMeta = connectorGateMetadata({
    ...defaultConnectors().find((connector) => connector.id === "arcade"),
    status: process.env.ARCADE_API_KEY ? "pending" : "not_configured"
  }, "arcade");

  if (name === "create_followup_action" && !arcadeWritesEnabled) {
    return {
      status: "blocked",
      tool: name,
      code: "arcade_writes_disabled",
      connector: "arcade",
      connectorMeta,
      recoverable: true,
      message: "Arcade write tools are disabled. Set COOPER_ENABLE_ARCADE_WRITES=true only after reviewing the write allowlist."
    };
  }

  if (!process.env.ARCADE_API_KEY) {
    return {
      status: "error",
      tool: name,
      code: "missing_arcade_api_key",
      connector: "arcade",
      connectorMeta,
      recoverable: true,
      missing: ["ARCADE_API_KEY"],
      mappingEnv: mappingEnvName(name),
      message: "Arcade is not configured yet. Set ARCADE_API_KEY and ARCADE_USER_ID, then map this Cooper tool to an Arcade tool."
    };
  }

  if (!arcadeToolName) {
    return {
      status: "error",
      tool: name,
      code: "arcade_mapping_required",
      connector: "arcade",
      connectorMeta,
      recoverable: true,
      mappingEnv: mappingEnvName(name),
      gatewayUrl: arcadeMcpGatewayUrl || null,
      message: `No Arcade tool mapping is configured for ${name}. Set ${mappingEnvName(name)} to the Arcade qualified tool name.`
    };
  }

  const authorization = latestArcadeAuthorization(await loadStore(), name);
  if (authorization?.status !== "completed") {
    return {
      status: "error",
      tool: name,
      code: "arcade_authorization_required",
      connector: "arcade",
      connectorMeta,
      recoverable: true,
      arcadeToolName,
      authorizationUrl: authorization?.authorizationUrl || null,
      authorizationStatus: authorization?.status || "not_started",
      message: authorization?.authorizationUrl
        ? "This Arcade tool has not finished pre-authorization. Open Settings, complete the connection, then check status."
        : "This Arcade tool must be pre-authorized in Settings before Cooper can use it in a live call."
    };
  }

  let response;
  const input = sanitizeArcadeInput(name, args, arcadeToolName);
  try {
    const client = await getArcadeClient();
    response = await client.tools.execute({
      tool_name: arcadeToolName,
      input,
      user_id: arcadeUserId
    });
    const authorizationResponse = await maybeAuthorizeArcadeTool(client, arcadeToolName, response);
    if (authorizationResponse) {
      const storedAuthorization = await upsertArcadeAuthorization(name, arcadeToolName, authorizationResponse, {
        error: null,
        lastCheckedAt: new Date().toISOString()
      });
      return {
        status: "error",
        tool: name,
        code: "arcade_authorization_required",
        connector: "arcade",
        connectorMeta,
        recoverable: true,
        arcadeToolName,
        authorizationUrl: storedAuthorization.authorizationUrl || null,
        authorizationStatus: storedAuthorization.status || null,
        message: storedAuthorization.authorizationUrl
          ? "Arcade says this connection needs authorization again. Open Settings, complete the connection, then check status."
          : "Arcade says this connection needs authorization again. Open Settings and reconnect the tool."
      };
    }
  } catch (error) {
    return normalizeArcadeThrownError(name, arcadeToolName, error, connectorMeta);
  }

  if (response?.success === false || response?.output?.error) {
    return {
      status: "error",
      tool: name,
      code: response.output?.error?.kind || "arcade_tool_failed",
      connector: "arcade",
      connectorMeta,
      recoverable: Boolean(response.output?.error?.can_retry),
      arcadeToolName,
      message: response.output?.error?.message || "Arcade tool failed."
    };
  }

  return {
    status: "completed",
    tool: name,
    connector: "arcade",
    arcadeToolName,
    executionId: response?.execution_id || response?.id || null,
    durationMs: response?.duration || null,
    value: response?.output?.value ?? response?.output ?? response
  };
}

async function publicSettings(store) {
  const settings = normalizeSettings(store.settings);
  return {
    ok: true,
    runtime: {
      model,
      voice,
      transcriptionModel,
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
      keychainService,
      keychainAccount,
      workspaceRoot: approvedWorkspace,
      storePath,
      dataRoot,
      supportsProjectContext: true,
      supportsCallModes: ["free", "manual", "wake"],
      supportsPdfExtraction: platform() === "darwin",
      supportsArtifactResponses: true,
      supportsPushToTalkHelper: true,
      supportsGstackAdvisory: true,
      supportsComputerUseExecution: true,
      supportsArcadeAuthorization: true,
      arcadeConfigured: Boolean(process.env.ARCADE_API_KEY),
      arcadeUserId,
      arcadeGatewayUrl: arcadeMcpGatewayUrl || "",
      arcadeWritesEnabled,
      computerUseDryRun: computerUseDryRunEnabled(),
      artifactModel,
      gstackModel,
      supportsLocalLock: true,
      manifestSchema,
      manifestPath: "/api/manifest"
    },
    lock: publicLockStatus(await loadLockConfig()),
    settings,
    arcade: arcadeSettingsState(store)
  };
}

async function handleCrashDiagnosticsTest(req, res) {
  if (process.env.REALTIME_AGENT_ENABLE_CRASH_TEST !== "1") {
    sendJson(res, 404, { error: "Not found." });
    return;
  }
  const payload = JSON.parse(await readBody(req, maxBodyBytes) || "{}");
  const message = cleanString(payload.message) || "Synthetic broker diagnostics report.";
  const report = recordCrashReportSync("synthetic", new Error(message), {
    fatal: false,
    origin: "smoke",
    method: req.method,
    route: "/api/diagnostics/crash-test"
  });
  sendJson(res, 200, { ok: true, report });
}

async function buildDiagnostics(store) {
  const normalized = normalizeStore(store);
  const settings = normalizeSettings(normalized.settings);
  const staticFiles = await staticResourceDiagnostics();
  const lock = publicLockStatus(await loadLockConfig());
  const manifest = buildCapabilityManifest(normalized);
  const crashReports = await crashReportDiagnostics();
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      release: release(),
      model,
      artifactModel,
      gstackModel,
      voice,
      transcriptionModel,
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      hasArcadeKey: Boolean(process.env.ARCADE_API_KEY),
      arcadeUserId,
      arcadeGatewayUrl: arcadeMcpGatewayUrl || "",
      arcadeWritesEnabled,
      arcadeSdk: arcadeSdkStatus(),
      hasNotionToken: Boolean(notionToken()),
      notionVersion,
      workspaceRoot: approvedWorkspace,
      dataRoot,
      storePath,
      lockPath,
      webRoot,
      brokerPid: process.pid
    },
    store: {
      schemaVersion: normalized.schemaVersion,
      updatedAt: normalized.updatedAt,
      sessions: normalized.sessions.length,
      projects: normalized.projects.length,
      artifacts: normalized.artifacts.length,
      jobs: normalized.jobs.length,
      operatorTasks: normalized.operatorTasks.length,
      arcadeAuthorizations: normalized.arcadeAuthorizations.length,
      toolAudit: settings.toolAudit.length,
      recovery: normalized.recovery || null
    },
    settings: {
      workspaceAllowlist: settings.workspaceAllowlist,
      connectors: settings.connectors.map((connector) => ({
        id: connector.id,
        status: connector.status,
        risk: connector.risk,
        authMode: connector.authMode,
        updatedAt: connector.updatedAt
      })),
      keychainService,
      keychainAccount
    },
    staticFiles,
    crashReports,
    manifest: {
      schema: manifest.schema,
      capabilities: Object.values(manifest.capabilities).filter(Boolean).length,
      routes: manifest.routes.length,
      tools: manifest.tools.length,
      connectors: manifest.connectors.length
    },
    security: {
      localFileToolsUseAllowlist: true,
      htmlSanitizerDenyByDefault: true,
      embedsAllowlisted: true,
      connectorToolsRequireAuthorization: true,
      operatorTasksRequireApproval: true,
      pdfExtractionUsesPDFKit: platform() === "darwin",
      artifactResponsesUseOpenAIResponses: true,
      gstackAdvisoryOnly: true,
      arcadePreauthorizationRequired: true,
      arcadeSdkDynamicallyLoaded: true,
      arcadeTokensNotPersisted: true,
      computerUseRequiresApproval: true,
      computerUseAllowedApps: allowedComputerApps(),
      localLockHashStoredSeparately: true,
      crashReportsRedactSecrets: true,
      pushToTalkUsesTokenOrLocalUnlock: true,
      pushToTalkQueuesApprovalTasks: true
    },
    lock: {
      enabled: lock.enabled,
      unlocked: lock.unlocked,
      ttlMinutes: lock.ttlMinutes
    }
  };
}

function buildCapabilityManifest(store = null) {
  const settings = normalizeSettings(store?.settings || {});
  return {
    ok: true,
    schema: manifestSchema,
    generatedAt: new Date().toISOString(),
    app: {
      name: "Realtime Desktop Agent",
      platform: "macOS",
      storeVersion
    },
    runtime: {
      realtimeModel: model,
      artifactModel,
      gstackModel,
      arcadeUserId,
      arcadeGatewayUrl: arcadeMcpGatewayUrl || "",
      arcadeToolMappings: Object.fromEntries(arcadeToolNames.map((name) => [name, Boolean(arcadeToolMappings[name])])),
      arcadeWritesEnabled,
      computerUseTools: localComputerToolNames,
      voice,
      transcriptionModel,
      callModes: ["free", "manual", "wake"],
      artifactKinds: ["markdown", "html", "mermaid", "mcp_app", "aires_requirements"],
      airesRequirementModes: ["list", "explain", "workshop", "interview", "queue"],
      gstackSkills: gstackSkillIds
    },
    capabilities: {
      nativeShell: true,
      realtimeCalls: true,
      localLock: true,
      keychainSettings: platform() === "darwin",
      durableStore: true,
      sessions: true,
      projects: true,
      pdfTextExtraction: platform() === "darwin",
      canvasRenderModes: true,
      artifactLibrary: true,
      artifactResponses: true,
      gstackAdvisoryTools: true,
      arcadeAuthorizationSurface: true,
      arcadeMappedToolExecution: true,
      arcadeDiscovery: true,
      mcpAppPreview: true,
      settingsAudit: true,
      notionDirectFallback: true,
      operatorQueue: true,
      computerUseExecution: true,
      computerUseDeterministicTools: true,
      pushToTalkHelper: true,
      pushToTalkQueuesOperatorTasks: true,
      pushToTalkExecution: true,
      zoomMeetingSdk: false,
      presentationRuntime: true
    },
    routes: capabilityRoutes,
    tools: toolDefinitions.map(toolManifestEntry),
    connectors: settings.connectors.map(connectorManifestEntry),
    security: {
      localLockProtectsApi: true,
      keychainSecretWriteOnly: true,
      localFileAllowlist: true,
      htmlSanitizerDenyByDefault: true,
      embedAllowlist: true,
      connectorAuthorizationRequired: true,
      operatorApprovalRequired: true,
      pushToTalkTokenOrUnlockRequired: true,
      gstackAdvisoryOnly: true,
      arcadePreauthorizationRequired: true,
      arcadeTokensNotPersisted: true,
      computerUseApprovalRequired: true,
      computerUseAllowedAppList: true,
      scriptExecutionBlockedInPreviews: true
    }
  };
}

function toolManifestEntry(definition) {
  const name = cleanString(definition.name);
  const arcadeTool = arcadeToolSet.has(name);
  const connector = name.startsWith("notion_") ? "notion" : arcadeTool ? "arcade" : "";
  const localFileTool = name.startsWith("local_");
  const gstackTool = name === "run_gstack_skill";
  const computerTool = localComputerToolSet.has(name);
  const arcadeWriteTool = name === "create_followup_action";
  return {
    name,
    toolId: toolAliases[name] || name,
    connector,
    requiresApproval: localFileTool || name.startsWith("app_") || Boolean(connector) || gstackTool || computerTool,
    risk: computerTool ? "high" : arcadeWriteTool ? "high" : gstackTool ? "advisory" : localFileTool ? "medium" : connector ? "medium" : name.startsWith("app_") ? "low" : "low",
    resultRenderer: computerTool ? "computer_use_result_card" : gstackTool ? "gstack_advisory_card" : connector ? "connector_error_card" : name.startsWith("canvas_") ? "canvas" : "activity_log"
  };
}

function connectorManifestEntry(connector) {
  return {
    id: cleanString(connector.id),
    label: cleanString(connector.label),
    status: cleanString(connector.status),
    risk: normalizeRisk(connector.risk),
    authMode: cleanString(connector.authMode) || "not_configured",
    scopes: normalizeStringArray(connector.scopes, 12),
    toolIds: normalizeStringArray(connector.toolIds, 12),
    requiresAuthorization: connector.status !== "local_only",
    updatedAt: cleanString(connector.updatedAt),
    note: cleanString(connector.note)
  };
}

async function handleArtifactGeneration(req, res) {
  const payload = JSON.parse(await readBody(req, maxBodyBytes * 2) || "{}");
  const kind = normalizeArtifactKind(payload.kind);
  const mode = cleanString(payload.mode);
  const title = cleanString(payload.title).slice(0, 180) || artifactGenerationTitle(kind, mode, payload.context);
  const outputType = artifactOutputType(kind);

  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 424, {
      ok: false,
      code: "missing_openai_key",
      fallbackRecommended: true,
      error: "OpenAI key is required for Responses artifact generation.",
      kind,
      mode,
      title,
      outputType
    });
    return;
  }

  try {
    const prompt = buildArtifactGenerationPrompt({ ...payload, kind, mode, title, outputType });
    const response = await createArtifactResponse(prompt, { kind, outputType });
    sendJson(res, 200, {
      ok: true,
      provider: "openai_responses",
      model: response.model,
      requestId: response.requestId,
      kind,
      mode,
      title,
      outputType,
      content: normalizeGeneratedArtifactContent(response.output, outputType, title),
      usage: response.usage || null
    });
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      code: "responses_generation_failed",
      fallbackRecommended: true,
      error: cleanString(error?.message || error).slice(0, 500) || "Responses artifact generation failed.",
      kind,
      mode,
      title,
      outputType
    });
  }
}

async function createArtifactResponse(input, { kind, outputType }) {
  const instructions = outputType === "html"
    ? "You are Cooper, Michael's AIRES CTO/CPO executive assistant. Produce a complete, safe, standalone HTML artifact body or document. Use inline CSS only when useful. Do not use external scripts, external assets, hidden reasoning, markdown fences, or unsafe URLs."
    : kind === "mermaid"
      ? "You are Cooper, Michael's AIRES CTO/CPO executive assistant. Produce one high-signal Mermaid diagram inside a markdown mermaid code fence, with a brief title if helpful. Do not include hidden reasoning."
      : outputType === "json"
        ? "You are Cooper, Michael's AIRES CTO/CPO executive assistant. Produce valid JSON only. No markdown fences."
        : "You are Cooper, Michael's AIRES CTO/CPO executive assistant. Produce high-signal Markdown. Be precise, opinionated, and practical. Do not include hidden reasoning.";

  const startedAt = Date.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "realtime-desktop-agent-local"
    },
    body: JSON.stringify({
      model: artifactModel,
      instructions,
      input,
      reasoning: { effort: "medium" },
      max_output_tokens: maxArtifactOutputTokens,
      text: { format: { type: "text" } }
    })
  });
  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => "") } }));
  if (!response.ok) {
    throw new Error(cleanString(payload?.error?.message) || `OpenAI Responses API failed with ${response.status}.`);
  }
  return {
    model: cleanString(payload.model) || artifactModel,
    requestId: response.headers.get("x-request-id") || response.headers.get("openai-request-id") || cleanString(payload.id),
    output: extractOutputText(payload),
    usage: payload.usage || null,
    durationMs: Date.now() - startedAt
  };
}

function buildArtifactGenerationPrompt({ kind, mode, title, outputType, context = {}, customPrompt = "" }) {
  const safeContext = context && typeof context === "object" ? context : {};
  const facts = normalizeStringArray(safeContext.facts, 10);
  const transcriptTurns = normalizeArray(safeContext.transcriptTurns, normalizePromptTurn, 12);
  const canvasCards = normalizeArray(safeContext.canvasCards, normalizePromptCard, 8);
  return [
    `Artifact title: ${title}`,
    `Artifact kind: ${kind}`,
    mode ? `Artifact mode: ${mode}` : "",
    `Output type: ${outputType}`,
    "",
    safeContext.subject ? `Subject: ${cleanString(safeContext.subject)}` : "",
    safeContext.sourceLabel ? `Source: ${cleanString(safeContext.sourceLabel)}` : "",
    safeContext.problem ? `Problem: ${cleanString(safeContext.problem)}` : "",
    safeContext.whyNow ? `Why now: ${cleanString(safeContext.whyNow)}` : "",
    facts.length ? `Facts:\n${facts.map((fact) => `- ${fact}`).join("\n")}` : "",
    transcriptTurns.length ? `Transcript:\n${transcriptTurns.map((turn) => `- ${turn.speaker}: ${turn.text}`).join("\n")}` : "",
    canvasCards.length ? `Canvas cards:\n${canvasCards.map((card) => `- ${card.title} (${card.type}): ${card.text}`).join("\n")}` : "",
    customPrompt ? `User prompt:\n${cleanString(customPrompt)}` : "",
    "",
    artifactGenerationInstruction(kind, mode, outputType)
  ].filter(Boolean).join("\n").slice(0, 24000);
}

function artifactGenerationInstruction(kind, mode, outputType) {
  if (kind === "aires_requirements") {
    return "Create an AIRES scoped requirements artifact with problem and goal, users/stakeholders, current-to-desired state, scope boundaries, data/edge cases/constraints, MoSCoW, vertical INVEST slices, Given/When/Then criteria, Definition of Ready, and assumptions. Keep it presentable and source-grounded.";
  }
  if (kind === "html") {
    return "Create a presentable standalone HTML artifact suitable for a local preview. Keep scripts out. Prefer readable document structure over decorative UI.";
  }
  if (kind === "mermaid") {
    return "Create a Mermaid flowchart that captures the core workflow, source context, and next artifact outcome. Return markdown with exactly one mermaid fenced block.";
  }
  if (kind === "mcp_app") {
    return "Create a preview-only MCP App JSON manifest with app metadata, read-only tools, resources, and approval boundaries. It must be inert and must not claim remote execution.";
  }
  return "Create a concise Markdown artifact with summary, source-backed observations, decisions, risks, and next actions.";
}

function artifactGenerationTitle(kind, mode, context = {}) {
  const subject = cleanString(context?.subject) || "Cooper session";
  const label = kind === "aires_requirements" && mode ? `AIRES ${mode}` : artifactKindLabel(kind);
  return `${subject} ${label}`;
}

function normalizeGeneratedArtifactContent(content, outputType, title) {
  const text = cleanString(content).slice(0, maxReadChars);
  if (outputType === "html") {
    return text || `<article><h1>${escapeHtmlText(title)}</h1><p>No content returned.</p></article>`;
  }
  if (outputType === "json") {
    return text || "{}";
  }
  return text || `# ${title}\n\nNo content returned.`;
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n\n").trim();
}

function normalizePromptTurn(input) {
  if (!input || typeof input !== "object") return null;
  const text = cleanString(input.text).slice(0, 500);
  if (!text) return null;
  return {
    speaker: cleanString(input.speaker) || "Speaker",
    text
  };
}

function normalizePromptCard(input) {
  if (!input || typeof input !== "object") return null;
  return {
    title: cleanString(input.title) || "Card",
    type: cleanString(input.type) || "card",
    text: cleanString(input.text).slice(0, 500)
  };
}

function normalizeArtifactKind(kind) {
  const value = cleanString(kind);
  return ["markdown", "html", "mermaid", "mcp_app", "aires_requirements"].includes(value) ? value : "markdown";
}

function artifactOutputType(kind) {
  if (kind === "html" || kind === "aires_requirements") return "html";
  if (kind === "mcp_app") return "json";
  return "markdown";
}

function artifactKindLabel(kind) {
  const labels = {
    markdown: "Markdown",
    html: "HTML",
    mermaid: "Mermaid",
    mcp_app: "MCP App",
    aires_requirements: "AIRES Requirements"
  };
  return labels[kind] || "Artifact";
}

async function handleLocalLock(req, res) {
  const payload = JSON.parse(await readBody(req, maxBodyBytes) || "{}");
  const action = cleanString(payload.action);
  const config = await loadLockConfig();

  if (action === "unlock") {
    if (!config.enabled) {
      sendJson(res, 200, { ok: true, lock: publicLockStatus(config), message: "Local lock is disabled." });
      return;
    }
    const verified = await verifyLockPassword(cleanString(payload.password), config);
    if (!verified) {
      sendJson(res, 401, { ok: false, error: "Password did not match.", lock: publicLockStatus(config) });
      return;
    }
    lockSessionExpiresAt = Date.now() + normalizeLockTtlMinutes(config.ttlMinutes) * 60 * 1000;
    sendJson(res, 200, { ok: true, lock: publicLockStatus(config), message: "Unlocked." });
    return;
  }

  if (action === "lock") {
    lockSessionExpiresAt = 0;
    sendJson(res, 200, { ok: true, lock: publicLockStatus(config), message: "Locked." });
    return;
  }

  if (action === "disable") {
    if (config.enabled && !(await canChangeLock(config, cleanString(payload.currentPassword || payload.password)))) {
      sendJson(res, 401, { ok: false, error: "Current password is required to disable the local lock.", lock: publicLockStatus(config) });
      return;
    }
    const nextConfig = normalizeLockConfig({ enabled: false, ttlMinutes: normalizeLockTtlMinutes(config.ttlMinutes) });
    lockSessionExpiresAt = 0;
    await saveLockConfig(nextConfig);
    sendJson(res, 200, { ok: true, lock: publicLockStatus(nextConfig), message: "Local lock disabled." });
    return;
  }

  if (action === "configure") {
    if (config.enabled && !(await canChangeLock(config, cleanString(payload.currentPassword)))) {
      sendJson(res, 401, { ok: false, error: "Current password is required to update the local lock.", lock: publicLockStatus(config) });
      return;
    }
    const password = cleanString(payload.password);
    if (password.length < 6) {
      sendJson(res, 400, { ok: false, error: "Use at least 6 characters for the local lock password.", lock: publicLockStatus(config) });
      return;
    }
    const salt = randomBytes(16).toString("hex");
    const passwordHash = await hashLockPassword(password, salt);
    const nextConfig = normalizeLockConfig({
      enabled: true,
      salt,
      passwordHash,
      hashAlgorithm: "scrypt:v1",
      ttlMinutes: normalizeLockTtlMinutes(payload.ttlMinutes),
      updatedAt: new Date().toISOString()
    });
    lockSessionExpiresAt = Date.now() + nextConfig.ttlMinutes * 60 * 1000;
    await saveLockConfig(nextConfig);
    sendJson(res, 200, { ok: true, lock: publicLockStatus(nextConfig), message: "Local lock configured." });
    return;
  }

  sendJson(res, 400, { ok: false, error: "Use action configure, unlock, lock, or disable.", lock: publicLockStatus(config) });
}

async function isLockedRequest(pathname) {
  if (pathname === "/api/lock" || pathname === "/health") {
    return false;
  }
  if (!(pathname === "/session" || pathname.startsWith("/api/"))) {
    return false;
  }
  const config = await loadLockConfig();
  return config.enabled && !isLockSessionActive();
}

function isLockSessionActive() {
  return lockSessionExpiresAt > Date.now();
}

async function canChangeLock(config, password) {
  return verifyLockPassword(password, config);
}

async function hashLockPassword(password, salt) {
  const output = await scryptAsync(password, salt, 64);
  return Buffer.from(output).toString("hex");
}

async function verifyLockPassword(password, config) {
  if (!password || !config.passwordHash || !config.salt) {
    return false;
  }
  const expected = Buffer.from(config.passwordHash, "hex");
  const actual = Buffer.from(await scryptAsync(password, config.salt, expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function loadLockConfig() {
  try {
    const text = await readFile(lockPath, "utf8");
    return normalizeLockConfig(JSON.parse(text));
  } catch {
    return normalizeLockConfig({});
  }
}

async function saveLockConfig(config) {
  const safeConfig = normalizeLockConfig(config);
  await mkdir(dataRoot, { recursive: true });
  const tmpPath = join(dataRoot, `lock.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmpPath, `${JSON.stringify(safeConfig, null, 2)}\n`, "utf8");
  await rename(tmpPath, lockPath);
  return safeConfig;
}

function normalizeLockConfig(input = {}) {
  return {
    enabled: Boolean(input.enabled && input.passwordHash && input.salt),
    salt: cleanString(input.salt),
    passwordHash: cleanString(input.passwordHash),
    hashAlgorithm: cleanString(input.hashAlgorithm) || "scrypt:v1",
    ttlMinutes: normalizeLockTtlMinutes(input.ttlMinutes),
    updatedAt: cleanString(input.updatedAt) || ""
  };
}

function normalizeLockTtlMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) {
    return defaultLockTtlMinutes;
  }
  return Math.min(720, Math.max(5, Math.round(minutes)));
}

function publicLockStatus(config) {
  const safeConfig = normalizeLockConfig(config);
  const unlocked = !safeConfig.enabled || isLockSessionActive();
  return {
    enabled: safeConfig.enabled,
    unlocked,
    expiresAt: safeConfig.enabled && unlocked ? new Date(lockSessionExpiresAt).toISOString() : "",
    ttlMinutes: safeConfig.ttlMinutes,
    updatedAt: safeConfig.updatedAt
  };
}

async function handlePdfSourceExtraction(req, res) {
  if (platform() !== "darwin") {
    sendJson(res, 501, {
      ok: false,
      status: "unsupported",
      error: "PDF extraction requires macOS PDFKit."
    });
    return;
  }

  const payload = JSON.parse(await readBody(req, maxPdfRequestBytes) || "{}");
  const fileName = cleanString(payload.fileName || payload.name) || "source.pdf";
  const encoded = cleanString(payload.data || payload.base64);
  const base64 = encoded.includes(",") ? encoded.slice(encoded.indexOf(",") + 1) : encoded;
  if (!base64) {
    sendJson(res, 400, {
      ok: false,
      status: "missing_pdf",
      error: "Missing PDF data."
    });
    return;
  }

  const pdfBuffer = Buffer.from(base64.replace(/\s/g, ""), "base64");
  if (!pdfBuffer.length || !looksLikePdf(pdfBuffer)) {
    sendJson(res, 400, {
      ok: false,
      status: "invalid_pdf",
      error: "Selected file is not a readable PDF."
    });
    return;
  }
  if (pdfBuffer.byteLength > maxPdfBytes) {
    sendJson(res, 413, {
      ok: false,
      status: "too_large",
      error: `PDF is too large for native extraction. Limit is ${Math.round(maxPdfBytes / 1024 / 1024)} MB.`
    });
    return;
  }

  try {
    const rawText = await extractPdfTextWithPDFKit(pdfBuffer, fileName);
    const cleanText = cleanPdfText(rawText);
    const content = cleanText.slice(0, maxReadChars);
    sendJson(res, 200, {
      ok: true,
      status: content ? "ready" : "extraction_empty",
      fileName,
      byteLength: pdfBuffer.byteLength,
      content,
      truncated: cleanText.length > maxReadChars,
      extractor: "macos-pdfkit"
    });
  } catch (error) {
    sendJson(res, 422, {
      ok: false,
      status: "extraction_failed",
      fileName,
      byteLength: pdfBuffer.byteLength,
      error: cleanString(error?.message || error).slice(0, 500) || "PDF extraction failed."
    });
  }
}

async function extractPdfTextWithPDFKit(pdfBuffer, fileName) {
  const extractionDir = join(dataRoot || tmpdir(), "PDFExtraction");
  await mkdir(extractionDir, { recursive: true });
  const tempPath = join(extractionDir, `${Date.now()}-${process.pid}-${safeFileName(fileName, "source.pdf")}`);
  await writeFile(tempPath, pdfBuffer);
  try {
    const result = await execFileAsync("/usr/bin/osascript", [
      "-l",
      "JavaScript",
      "-e",
      pdfKitExtractionScript()
    ], {
      env: { ...process.env, PDF_PATH: tempPath },
      timeout: 15000,
      maxBuffer: maxReadChars * 8
    });
    return String(result.stdout || "");
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

function pdfKitExtractionScript() {
  return `
ObjC.import("Foundation");
ObjC.import("PDFKit");
const environment = $.NSProcessInfo.processInfo.environment;
const rawPath = ObjC.unwrap(environment.objectForKey("PDF_PATH")) || "";
if (!rawPath) {
  throw new Error("Missing PDF path.");
}
const path = $.NSString.alloc.initWithUTF8String(rawPath);
const url = $.NSURL.fileURLWithPath(path);
const document = $.PDFDocument.alloc.initWithURL(url);
if (!document) {
  throw new Error("PDFKit could not open this PDF.");
}
const pages = document.pageCount;
const output = [];
for (let index = 0; index < pages; index += 1) {
  const page = document.pageAtIndex(index);
  if (!page) continue;
  const value = page.string;
  const text = value ? ObjC.unwrap(value) : "";
  if (text && text.trim()) {
    output.push(text);
  }
}
output.join("\\n\\n");
`;
}

function looksLikePdf(buffer) {
  return buffer.slice(0, 1024).toString("latin1").includes("%PDF-");
}

function cleanPdfText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeFileName(value, fallback) {
  const name = basename(cleanString(value) || fallback);
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe || "source"}.pdf`;
}

async function staticResourceDiagnostics() {
  const files = ["index.html", "app.js", "styles.css"];
  const entries = {};
  for (const file of files) {
    const filePath = join(webRoot, file);
    try {
      const fileStat = await stat(filePath);
      entries[file] = {
        exists: fileStat.isFile(),
        bytes: fileStat.size
      };
    } catch {
      entries[file] = {
        exists: false,
        bytes: 0
      };
    }
  }
  return entries;
}

async function crashReportDiagnostics() {
  const reports = await readCrashReports();
  const recent = reports.slice(-5).reverse();
  return {
    path: crashReportPath,
    count: reports.length,
    latest: reports.at(-1) || null,
    recent
  };
}

async function readCrashReports() {
  try {
    const text = await readFile(crashReportPath, "utf8");
    return text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-maxCrashReports);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error(`Could not read broker crash diagnostics: ${redactSecrets(error?.message || error)}`);
    }
    return [];
  }
}

function recordCrashReportSync(kind, value, extra = {}) {
  const report = normalizeCrashReport(kind, value, extra);
  try {
    mkdirSync(diagnosticsRoot, { recursive: true });
    appendFileSync(crashReportPath, `${JSON.stringify(report)}\n`, "utf8");
  } catch (error) {
    console.error(`Could not write broker crash diagnostics: ${redactSecrets(error?.message || error)}`);
  }
  return report;
}

function normalizeCrashReport(kind, value, extra = {}) {
  const fallbackText = safeErrorText(value);
  const message = value instanceof Error ? value.message : fallbackText;
  const stack = value instanceof Error ? value.stack || message : fallbackText;
  return {
    id: `crash-${Date.now()}-${randomBytes(4).toString("hex")}`,
    kind: cleanString(kind) || "unknown",
    createdAt: new Date().toISOString(),
    pid: process.pid,
    fatal: Boolean(extra.fatal),
    origin: cleanString(extra.origin),
    method: cleanString(extra.method),
    route: cleanString(extra.route).slice(0, 240),
    runtime: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      release: release()
    },
    message: redactSecrets(message).slice(0, 1000),
    stack: redactSecrets(stack).slice(0, 5000)
  };
}

function safeErrorText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function writeKeychainPassword(password) {
  const result = await execFileAsync("/usr/bin/security", [
    "add-generic-password",
    "-a", keychainAccount,
    "-s", keychainService,
    "-w", password,
    "-U"
  ]);
  return { ok: true, stderr: cleanString(result.stderr) };
}

async function deleteKeychainPassword() {
  try {
    const result = await execFileAsync("/usr/bin/security", [
      "delete-generic-password",
      "-a", keychainAccount,
      "-s", keychainService
    ]);
    return { ok: true, stderr: cleanString(result.stderr) };
  } catch (error) {
    if (String(error?.stderr || error?.message || "").includes("could not be found")) {
      return { ok: true, stderr: "No existing Keychain item." };
    }
    throw error;
  }
}

async function loadStore() {
  try {
    const text = await readFile(storePath, "utf8");
    return normalizeStore(JSON.parse(text));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return defaultStore();
    }
    try {
      await mkdir(dataRoot, { recursive: true });
      await rename(storePath, join(dataRoot, `store.corrupt-${Date.now()}.json`));
    } catch {}
    return {
      ...defaultStore(),
      recovery: {
        reason: String(error?.message || error),
        recoveredAt: new Date().toISOString()
      }
    };
  }
}

async function saveStore(store) {
  const safeStore = normalizeStore(store);
  await mkdir(dataRoot, { recursive: true });
  const tmpPath = join(dataRoot, `store.${process.pid}.${Date.now()}.tmp`);
  const body = `${JSON.stringify(safeStore, null, 2)}\n`;
  await writeFile(tmpPath, body, "utf8");
  await rename(tmpPath, storePath);
  return safeStore;
}

function defaultStore() {
  return {
    schemaVersion: storeVersion,
    sessions: [],
    projects: [],
    artifacts: [],
    jobs: [],
    operatorTasks: [],
    arcadeAuthorizations: [],
    settings: defaultSettings(),
    updatedAt: new Date().toISOString()
  };
}

function defaultSettings() {
  return {
    workspaceAllowlist: [approvedWorkspace],
    connectors: defaultConnectors(),
    toolAudit: []
  };
}

function defaultConnectors() {
  return [
    {
      id: "notion",
      label: "Notion",
      status: "not_configured",
      risk: "medium",
      authMode: "env_token",
      scopes: ["search", "read_page"],
      toolIds: ["notion.search", "notion.fetch_page"],
      note: "Authorization not connected in the native app yet."
    },
    {
      id: "arcade",
      label: "Arcade",
      status: "not_configured",
      risk: "medium",
      authMode: "arcade_oauth",
      scopes: ["pre_authorization", "tool_execution"],
      toolIds: arcadeToolNames,
      note: "Authorize mapped tools from native Settings. Tokens stay with Arcade; Cooper stores only non-secret authorization metadata."
    },
    {
      id: "aires_requirements",
      label: "AIRES Requirements",
      status: "local_only",
      risk: "low",
      authMode: "local",
      scopes: ["artifact_generation"],
      toolIds: ["library.aires_requirements"],
      note: "Available once artifact/tool parity is enabled."
    }
  ];
}

function normalizeStore(input = {}) {
  const store = defaultStore();
  const sessions = Array.isArray(input.sessions) ? input.sessions : [];
  const projects = Array.isArray(input.projects) ? input.projects : [];
  const artifacts = Array.isArray(input.artifacts) ? input.artifacts : [];
  const jobs = Array.isArray(input.jobs) ? input.jobs : [];
  const operatorTasks = Array.isArray(input.operatorTasks) ? input.operatorTasks : [];
  const arcadeAuthorizations = Array.isArray(input.arcadeAuthorizations) ? input.arcadeAuthorizations : [];
  return {
    ...store,
    schemaVersion: storeVersion,
    sessions: sessions.map(normalizeSession).filter(Boolean).slice(0, 100),
    projects: projects.map(normalizeProject).filter(Boolean).slice(0, 100),
    artifacts: artifacts.map(normalizeArtifact).filter(Boolean).slice(0, 250),
    jobs: jobs.map(normalizeJob).filter(Boolean).slice(0, 250),
    operatorTasks: operatorTasks.map(normalizeOperatorTask).filter(Boolean).slice(0, 250),
    arcadeAuthorizations: arcadeAuthorizations.map(normalizeArcadeAuthorization).filter(Boolean).slice(0, 80),
    settings: normalizeSettings(input.settings),
    recovery: input.recovery && typeof input.recovery === "object" ? input.recovery : undefined,
    updatedAt: cleanString(input.updatedAt) || new Date().toISOString()
  };
}

function mergeStores(existingInput = {}, incomingInput = {}) {
  const existing = normalizeStore(existingInput);
  const incoming = normalizeStore(incomingInput);
  const settings = mergeStoreSettings(existing.settings, incoming.settings);
  return normalizeStore({
    ...incoming,
    sessions: mergeStoreList(existing.sessions, incoming.sessions, 100),
    projects: mergeStoreList(existing.projects, incoming.projects, 100),
    artifacts: mergeStoreList(existing.artifacts, incoming.artifacts, 250),
    jobs: mergeStoreList(existing.jobs, incoming.jobs, 250),
    operatorTasks: mergeStoreList(existing.operatorTasks, incoming.operatorTasks, 250),
    arcadeAuthorizations: mergeStoreList(existing.arcadeAuthorizations, incoming.arcadeAuthorizations, 80),
    settings,
    recovery: incoming.recovery || existing.recovery,
    updatedAt: maxIsoDate(existing.updatedAt, incoming.updatedAt) || new Date().toISOString()
  });
}

function mergeStoreList(existing = [], incoming = [], max = 100) {
  const byId = new Map();
  for (const item of existing) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const item of incoming) {
    if (!item?.id) continue;
    const previous = byId.get(item.id);
    if (!previous || compareStoreRecordDate(item, previous) >= 0) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((a, b) => compareStoreRecordDate(b, a)).slice(0, max);
}

function mergeStoreSettings(existing = {}, incoming = {}) {
  const previous = normalizeSettings(existing);
  const next = normalizeSettings(incoming);
  return normalizeSettings({
    workspaceAllowlist: [...previous.workspaceAllowlist, ...next.workspaceAllowlist],
    connectors: mergeConnectors([...previous.connectors, ...next.connectors]),
    toolAudit: mergeStoreList(previous.toolAudit, next.toolAudit, 200)
  });
}

function compareStoreRecordDate(a, b) {
  return String(a?.updatedAt || a?.createdAt || "").localeCompare(String(b?.updatedAt || b?.createdAt || ""));
}

function maxIsoDate(a, b) {
  return compareStoreRecordDate({ updatedAt: a }, { updatedAt: b }) >= 0 ? cleanString(a) : cleanString(b);
}

function normalizeSettings(input = {}) {
  const base = defaultSettings();
  const connectors = Array.isArray(input.connectors) ? input.connectors : base.connectors;
  return {
    workspaceAllowlist: normalizeWorkspaceAllowlist(input.workspaceAllowlist),
    connectors: mergeConnectors(connectors),
    toolAudit: normalizeArray(input.toolAudit, normalizeAuditEvent, 200)
  };
}

function sanitizeSettingsPatch(input = {}) {
  const patch = {};
  if (Array.isArray(input.workspaceAllowlist)) {
    patch.workspaceAllowlist = normalizeWorkspaceAllowlist(input.workspaceAllowlist);
  }
  if (Array.isArray(input.connectors)) {
    patch.connectors = mergeConnectors(input.connectors);
  }
  if (Array.isArray(input.toolAudit)) {
    patch.toolAudit = normalizeArray(input.toolAudit, normalizeAuditEvent, 200);
  }
  return patch;
}

function normalizeWorkspaceAllowlist(values = []) {
  const roots = [approvedWorkspace, ...values]
    .map((value) => cleanString(value))
    .filter(Boolean)
    .map((value) => resolve(value));
  return [...new Set(roots)].slice(0, 20);
}

function mergeConnectors(values = []) {
  const byId = new Map(defaultConnectors().map((connector) => [connector.id, connector]));
  for (const value of values) {
    const id = cleanString(value?.id);
    if (!id || !byId.has(id)) continue;
    byId.set(id, normalizeConnector({ ...byId.get(id), ...value }));
  }
  return [...byId.values()].map(normalizeConnector);
}

function normalizeConnector(input) {
  const status = ["not_configured", "pending", "authorized", "error", "local_only"].includes(input.status)
    ? input.status
    : "not_configured";
  return {
    id: cleanString(input.id),
    label: cleanString(input.label),
    status,
    risk: normalizeRisk(input.risk),
    authMode: cleanString(input.authMode) || "not_configured",
    scopes: normalizeStringArray(input.scopes, 12),
    toolIds: normalizeStringArray(input.toolIds, 12),
    note: cleanString(input.note).slice(0, 240),
    updatedAt: cleanString(input.updatedAt)
  };
}

function normalizeRisk(value) {
  const risk = cleanString(value);
  return ["low", "medium", "high"].includes(risk) ? risk : "medium";
}

function normalizeAuditEvent(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  return {
    id: cleanString(input.id) || `audit-${Date.now()}`,
    kind: cleanString(input.kind) || "settings",
    title: cleanString(input.title) || "Audit event",
    detail: cleanString(input.detail).slice(0, 500),
    createdAt: cleanString(input.createdAt) || new Date().toISOString()
  };
}

function normalizeArcadeAuthorization(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const now = new Date().toISOString();
  return {
    id: cleanString(input.id) || `arcade-auth-${Date.now()}`,
    toolName: cleanString(input.toolName),
    arcadeToolName: cleanString(input.arcadeToolName),
    userId: cleanString(input.userId) || arcadeUserId,
    authorizationId: cleanString(input.authorizationId),
    authorizationUrl: safeArcadeUrl(input.authorizationUrl),
    providerId: cleanString(input.providerId),
    scopes: normalizeStringArray(input.scopes, 20),
    status: cleanString(input.status) || "not_started",
    error: cleanString(input.error).slice(0, 500) || null,
    createdAt: cleanString(input.createdAt) || now,
    updatedAt: cleanString(input.updatedAt) || now,
    lastCheckedAt: cleanString(input.lastCheckedAt) || ""
  };
}

function safeArcadeUrl(value) {
  const text = cleanString(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeProject(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const now = new Date().toISOString();
  const id = cleanString(input.id) || `project-${Date.now()}`;
  const title = cleanString(input.title) || "Untitled project";
  return {
    id,
    title,
    summary: cleanString(input.summary),
    tags: normalizeStringArray(input.tags, 12),
    status: cleanString(input.status) || "active",
    createdAt: cleanString(input.createdAt) || now,
    updatedAt: cleanString(input.updatedAt) || now,
    sources: normalizeArray(input.sources, normalizeProjectSource, 80)
  };
}

function normalizeProjectSource(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const title = cleanString(input.title) || cleanString(input.name) || "Untitled source";
  return {
    id: cleanString(input.id) || `source-${Date.now()}`,
    title,
    kind: ["paste", "markdown", "txt", "pdf", "note"].includes(input.kind) ? input.kind : "note",
    status: normalizeProjectSourceStatus(input.status),
    content: cleanString(input.content).slice(0, maxReadChars),
    fileName: cleanString(input.fileName),
    byteLength: Number.isFinite(Number(input.byteLength)) ? Number(input.byteLength) : 0,
    extractor: cleanString(input.extractor).slice(0, 80),
    error: cleanString(input.error).slice(0, 500),
    truncated: Boolean(input.truncated),
    createdAt: cleanString(input.createdAt) || new Date().toISOString()
  };
}

function normalizeProjectSourceStatus(status) {
  const value = cleanString(status);
  return ["ready", "pending_pdf_extraction", "extraction_empty", "extraction_failed"].includes(value)
    ? value
    : "ready";
}

function normalizeSession(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const id = cleanString(input.id) || `session-${Date.now()}`;
  return {
    id,
    title: cleanString(input.title) || "Untitled session",
    context: cleanString(input.context) || "Free flow",
    projectId: cleanString(input.projectId),
    projectContextPacket: cleanString(input.projectContextPacket).slice(0, maxContextHeaderChars),
    callMode: normalizeCallMode(input.callMode),
    estimatedCost: cleanString(input.estimatedCost),
    status: ["active", "ended", "restored"].includes(input.status) ? input.status : "ended",
    startedAt: cleanString(input.startedAt) || new Date().toISOString(),
    endedAt: cleanString(input.endedAt),
    updatedAt: cleanString(input.updatedAt) || new Date().toISOString(),
    transcriptTurns: normalizeArray(input.transcriptTurns, normalizeTranscriptTurn, 500),
    canvasCards: normalizeArray(input.canvasCards, normalizeCanvasCard, 250),
    cardModes: input.cardModes && typeof input.cardModes === "object" && !Array.isArray(input.cardModes) ? input.cardModes : {},
    summary: cleanString(input.summary)
  };
}

function normalizeArtifact(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const now = new Date().toISOString();
  const source = input.source && typeof input.source === "object"
    ? {
      format: cleanString(input.source.format) || "markdown",
      value: cleanString(input.source.value).slice(0, maxReadChars),
      ast: input.source.ast || null
    }
    : { format: cleanString(input.kind) || "markdown", value: cleanString(input.content).slice(0, maxReadChars), ast: null };
  return {
    id: cleanString(input.id) || `artifact-${Date.now()}`,
    title: cleanString(input.title) || "Untitled artifact",
    kind: ["markdown", "html", "mermaid", "mcp_app", "aires_requirements"].includes(input.kind) ? input.kind : "markdown",
    mode: cleanString(input.mode),
    outputType: cleanString(input.outputType) || source.format,
    sessionId: cleanString(input.sessionId),
    projectId: cleanString(input.projectId),
    tags: normalizeStringArray(input.tags, 12),
    source,
    createdAt: cleanString(input.createdAt) || now,
    updatedAt: cleanString(input.updatedAt) || now,
    summary: cleanString(input.summary),
    jobId: cleanString(input.jobId),
    generationProvider: cleanString(input.generationProvider),
    responseModel: cleanString(input.responseModel),
    responseRequestId: cleanString(input.responseRequestId),
    responseUsage: input.responseUsage && typeof input.responseUsage === "object" && !Array.isArray(input.responseUsage) ? input.responseUsage : null
  };
}

function normalizeJob(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const now = new Date().toISOString();
  return {
    id: cleanString(input.id) || `job-${Date.now()}`,
    title: cleanString(input.title) || "Artifact job",
    kind: ["markdown", "html", "mermaid", "mcp_app", "aires_requirements"].includes(input.kind) ? input.kind : "markdown",
    mode: cleanString(input.mode),
    status: ["queued", "running", "completed", "failed"].includes(input.status) ? input.status : "queued",
    progress: cleanString(input.progress),
    artifactId: cleanString(input.artifactId),
    error: cleanString(input.error),
    logs: normalizeStringArray(input.logs, 20),
    provider: cleanString(input.provider),
    responseModel: cleanString(input.responseModel),
    responseRequestId: cleanString(input.responseRequestId),
    retryCount: Math.max(0, Math.min(20, Number(input.retryCount || 0))),
    createdAt: cleanString(input.createdAt) || now,
    updatedAt: cleanString(input.updatedAt) || now
  };
}

function normalizeOperatorTask(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const now = new Date().toISOString();
  return {
    id: cleanString(input.id) || `operator-${Date.now()}`,
    title: cleanString(input.title) || "Operator task",
    kind: ["operator", "computer_use", "push_to_talk"].includes(input.kind) ? input.kind : "operator",
    status: ["queued", "approval_required", "running", "blocked", "stopped", "failed", "completed"].includes(input.status) ? input.status : "approval_required",
    risk: ["low", "medium", "high"].includes(input.risk) ? input.risk : "medium",
    summary: cleanString(input.summary).slice(0, 500),
    approvedAt: cleanString(input.approvedAt),
    completedAt: cleanString(input.completedAt),
    stoppedAt: cleanString(input.stoppedAt),
    error: cleanString(input.error),
    logs: normalizeArray(input.logs, normalizeOperatorLog, 80),
    artifacts: normalizeArray(input.artifacts, normalizeOperatorArtifactRef, 20),
    createdAt: cleanString(input.createdAt) || now,
    updatedAt: cleanString(input.updatedAt) || now
  };
}

function normalizeOperatorLog(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  return {
    id: cleanString(input.id) || `oplog-${Date.now()}`,
    level: ["info", "approval", "warning", "error"].includes(input.level) ? input.level : "info",
    message: cleanString(input.message).slice(0, 500),
    createdAt: cleanString(input.createdAt) || new Date().toISOString()
  };
}

function normalizeOperatorArtifactRef(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  return {
    id: cleanString(input.id) || `opartifact-${Date.now()}`,
    title: cleanString(input.title) || "Operator artifact",
    artifactId: cleanString(input.artifactId),
    kind: cleanString(input.kind) || "note",
    createdAt: cleanString(input.createdAt) || new Date().toISOString()
  };
}

function normalizeTranscriptTurn(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const text = cleanString(input.text);
  if (!text) {
    return null;
  }
  return {
    id: cleanString(input.id) || `turn-${Date.now()}`,
    kind: cleanString(input.kind) || "assistant",
    speaker: cleanString(input.speaker) || "Agent",
    text,
    createdAt: cleanString(input.createdAt) || new Date().toISOString()
  };
}

function normalizeCanvasCard(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const source = input.source && typeof input.source === "object" ? input.source : { format: "markdown", value: cleanString(input.markdown) };
  return {
    id: cleanString(input.id) || `card-${Date.now()}`,
    title: cleanString(input.title) || "Untitled",
    tags: normalizeStringArray(input.tags, 8),
    type: cleanString(input.type) || "card",
    source,
    defaultMode: cleanString(input.defaultMode) || "text",
    supportedModes: normalizeStringArray(input.supportedModes, 8),
    lastEdited: cleanString(input.lastEdited) || new Date().toISOString()
  };
}

function normalizeArray(values, normalize, max) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map(normalize).filter(Boolean).slice(0, max);
}

function normalizeStringArray(values, max) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map(cleanString).filter(Boolean).slice(0, max);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Math.min(max, Math.max(min, Number(fallback) || min));
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function extractNotionId(value) {
  const text = cleanString(value);
  if (!text) return "";
  const compactMatches = text.replace(/-/g, "").match(/[0-9a-fA-F]{32}/g);
  const compact = compactMatches?.[compactMatches.length - 1] || "";
  if (!compact) return "";
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
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

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function redactSecrets(value) {
  return String(value ?? "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted-openai-key]")
    .replace(/OPENAI_API_KEY[^\n\r]*/gi, "OPENAI_API_KEY=[redacted]");
}

function escapeHtmlText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requested);
  const filePath = resolve(webRoot, `.${decoded}`);

  if (!isInside(webRoot, filePath)) {
    sendText(res, 403, "Forbidden.");
    return;
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    sendText(res, 404, "Not found.");
    return;
  }

  if (!fileStat.isFile()) {
    sendText(res, 404, "Not found.");
    return;
  }

  res.writeHead(200, {
    "Content-Type": mimeType(filePath),
    "Content-Length": fileStat.size,
    "Cache-Control": "no-store"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

async function searchNotion(args, settings) {
  const gate = connectorGate(settings, "notion");
  if (gate) {
    return gate;
  }

  const query = cleanString(args.query);
  if (!query) {
    return { status: "error", tool: "notion.search", message: "Missing Notion search query." };
  }

  const pageSize = Math.min(Math.max(Number(args.page_size) || 5, 1), 10);
  const object = cleanString(args.object) || "page";
  const body = {
    query,
    page_size: pageSize,
    sort: {
      direction: "descending",
      timestamp: "last_edited_time"
    }
  };
  if (object === "page" || object === "data_source") {
    body.filter = { property: "object", value: object };
  }

  const response = await notionRequest("/v1/search", {
    method: "POST",
    body: JSON.stringify(body)
  });
  if (response.status === "error") {
    return response;
  }

  return {
    status: "ok",
    tool: "notion.search",
    query,
    results: normalizeNotionSearchResults(response.results),
    hasMore: Boolean(response.has_more),
    nextCursor: cleanString(response.next_cursor)
  };
}

async function fetchNotionPage(args, settings) {
  const gate = connectorGate(settings, "notion");
  if (gate) {
    return gate;
  }

  const pageId = cleanString(args.page_id || args.pageId || args.id);
  if (!pageId) {
    return { status: "error", tool: "notion.fetch_page", message: "Missing Notion page_id." };
  }

  const page = await notionRequest(`/v1/pages/${encodeURIComponent(pageId)}`, { method: "GET" });
  if (page.status === "error") {
    return page;
  }

  const children = await notionRequest(`/v1/blocks/${encodeURIComponent(pageId)}/children?page_size=50`, { method: "GET" });
  if (children.status === "error") {
    return children;
  }

  const blocks = normalizeNotionBlocks(children.results);
  const title = notionTitle(page) || cleanString(args.title) || "Notion page";
  return {
    status: "ok",
    tool: "notion.fetch_page",
    pageId,
    title,
    url: cleanString(page.url),
    lastEditedTime: cleanString(page.last_edited_time),
    content: [`# ${title}`, "", ...blocks.map((block) => block.markdown)].filter(Boolean).join("\n").slice(0, maxReadChars),
    blocks,
    truncated: Boolean(children.has_more)
  };
}

function connectorGate(settings, connectorId) {
  const connector = (settings.connectors || []).find((item) => item.id === connectorId);
  if (!connector || connector.status !== "authorized") {
    return {
      status: "error",
      tool: connectorId,
      code: "connector_not_authorized",
      connector: connectorId,
      connectorMeta: connectorGateMetadata(connector, connectorId),
      recoverable: true,
      message: `${connectorLabel(connectorId)} must be marked authorized in native Settings before this tool can run.`
    };
  }

  if (connectorId === "notion" && !notionToken()) {
    return {
      status: "error",
      tool: "notion",
      code: "connector_missing_token",
      connector: connectorId,
      connectorMeta: connectorGateMetadata(connector, connectorId),
      recoverable: true,
      message: "Set NOTION_API_KEY or NOTION_TOKEN in the broker environment, then restart the macOS app."
    };
  }

  return null;
}

function connectorGateMetadata(connector, connectorId) {
  const normalized = normalizeConnector({
    ...defaultConnectors().find((item) => item.id === connectorId),
    ...(connector || {}),
    id: connectorId
  });
  return {
    id: normalized.id,
    label: normalized.label || connectorLabel(connectorId),
    status: normalized.status,
    risk: normalized.risk,
    authMode: normalized.authMode,
    scopes: normalized.scopes,
    toolIds: normalized.toolIds
  };
}

function connectorLabel(connectorId) {
  if (connectorId === "notion") return "Notion";
  if (connectorId === "arcade") return "Arcade";
  return connectorId;
}

function arcadeSettingsState(store = {}) {
  const normalizedStore = normalizeStore(store);
  const configured = Boolean(process.env.ARCADE_API_KEY);
  return {
    configured,
    userId: arcadeUserId,
    gatewayUrl: arcadeMcpGatewayUrl || null,
    writesEnabled: arcadeWritesEnabled,
    sdk: arcadeSdkStatus(),
    tools: arcadeToolSettings(normalizedStore),
    mappings: Object.fromEntries(arcadeToolNames.map((name) => [name, Boolean(arcadeToolMappings[name])])),
    authorizations: normalizeArray(normalizedStore.arcadeAuthorizations, normalizeArcadeAuthorization, 80).map(publicArcadeAuthorization)
  };
}

function arcadeToolSettings(store = {}) {
  return arcadeToolNames.map((name) => {
    const arcadeToolName = arcadeToolMappings[name] || "";
    const authorization = latestArcadeAuthorization(store, name);
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
      arcadeToolName,
      mappingEnv: mappingEnvName(name),
      mapped,
      configured,
      status,
      riskLevel: name === "create_followup_action" ? "high" : "medium",
      authorization: publicArcadeAuthorization(authorization)
    };
  });
}

async function arcadeDiscoveryState() {
  if (!process.env.ARCADE_API_KEY) {
    return {
      configured: false,
      userId: arcadeUserId,
      gatewayUrl: arcadeMcpGatewayUrl || null,
      sdk: arcadeSdkStatus(),
      connections: [],
      services: arcadeServiceSummaries([], []),
      catalogTools: [],
      error: "Missing ARCADE_API_KEY."
    };
  }

  const client = await getArcadeDiscoveryClient();
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
    sdk: arcadeSdkStatus(),
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
  const connections = [];
  for await (const connection of client.admin.userConnections.list({ user_id: arcadeUserId, limit: 50 })) {
    connections.push(publicArcadeConnection(connection));
    if (connections.length >= 50) break;
  }
  return connections;
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
      description: cleanString(tool.description).slice(0, 240),
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
      error: cleanString(error?.message || error) || "Tool unavailable."
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
  ].map((value) => cleanString(value).toLowerCase()).filter(Boolean);

  return connections.find((connection) => {
    const haystack = [
      connection.providerId,
      connection.providerDescription,
      connection.providerType
    ].map((value) => cleanString(value).toLowerCase()).join(" ");
    return needles.some((needle) => haystack.includes(needle.replace(/\s+/g, "")) || haystack.includes(needle));
  }) || null;
}

async function startArcadeAuthorization(name) {
  const arcadeToolName = arcadeToolMappings[name];
  if (!arcadeToolName) {
    throw Object.assign(new Error(`No Arcade tool mapping is configured for ${name}.`), { code: "arcade_mapping_required", statusCode: 400 });
  }
  const client = await getArcadeClient();
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
  const client = await getArcadeClient();
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

function latestArcadeAuthorization(store = {}, name) {
  const authorizations = normalizeArray(store.arcadeAuthorizations, normalizeArcadeAuthorization, 80);
  return authorizations
    .filter((item) => item.toolName === name && item.userId === arcadeUserId)
    .sort((a, b) => String(b.updatedAt || b.lastCheckedAt || "").localeCompare(String(a.updatedAt || a.lastCheckedAt || "")))[0] || null;
}

async function upsertArcadeAuthorization(name, arcadeToolName, response = {}, patch = {}) {
  const store = await loadStore();
  const now = new Date().toISOString();
  const authorizations = normalizeArray(store.arcadeAuthorizations, normalizeArcadeAuthorization, 80);
  const existing = authorizations.find((item) => item.toolName === name && item.userId === arcadeUserId);
  const next = normalizeArcadeAuthorization({
    ...(existing || {}),
    id: existing?.id || `arcade-auth-${Date.now()}-${randomBytes(3).toString("hex")}`,
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
  });
  const nextAuthorizations = existing
    ? authorizations.map((item) => item.id === existing.id ? next : item)
    : [next, ...authorizations];
  await saveStore(normalizeStore({
    ...store,
    arcadeAuthorizations: nextAuthorizations,
    updatedAt: now
  }));
  return next;
}

async function getArcadeClient() {
  if (!arcadeClient) {
    const Arcade = await loadArcadeConstructor();
    arcadeClient = new Arcade({ apiKey: process.env.ARCADE_API_KEY });
  }
  return arcadeClient;
}

async function getArcadeDiscoveryClient() {
  if (!arcadeDiscoveryClient) {
    const Arcade = await loadArcadeConstructor();
    arcadeDiscoveryClient = new Arcade({
      apiKey: process.env.ARCADE_API_KEY,
      timeout: 12000,
      maxRetries: 0
    });
  }
  return arcadeDiscoveryClient;
}

async function loadArcadeConstructor() {
  if (arcadeSdkModule) {
    return arcadeSdkModule.default || arcadeSdkModule.Arcade || arcadeSdkModule;
  }
  arcadeSdkLoadAttempted = true;
  try {
    arcadeSdkModule = await import("@arcadeai/arcadejs");
    arcadeSdkLoadError = "";
    return arcadeSdkModule.default || arcadeSdkModule.Arcade || arcadeSdkModule;
  } catch (error) {
    arcadeSdkLoadError = cleanString(error?.message || error) || "Could not load @arcadeai/arcadejs.";
    throw Object.assign(new Error("Arcade SDK is not available to the native broker runtime. Install or bundle @arcadeai/arcadejs to enable OAuth execution."), {
      code: "arcade_sdk_unavailable",
      statusCode: 501
    });
  }
}

function arcadeSdkStatus() {
  return {
    attempted: arcadeSdkLoadAttempted,
    available: Boolean(arcadeSdkModule),
    packageName: "@arcadeai/arcadejs",
    error: arcadeSdkLoadError ? redactSecrets(arcadeSdkLoadError).slice(0, 500) : ""
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

function publicArcadeProviderAuthorization(authorization = {}) {
  return {
    id: authorization.id || "",
    authorizationUrl: authorization.url || "",
    providerId: authorization.provider_id || "",
    scopes: Array.isArray(authorization.scopes) ? authorization.scopes : [],
    status: authorization.status || "not_started"
  };
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

function sanitizeProviderUserInfo(value) {
  if (!value || typeof value !== "object") return null;
  const source = isPlainObject(value) ? value : {};
  return {
    name: cleanString(source.name || source.display_name || source.login || source.username),
    email: cleanString(source.email),
    id: cleanString(source.id || source.sub || source.user_id)
  };
}

function sanitizeArcadeInput(name, args = {}, arcadeToolName = "") {
  const mappedName = arcadeToolBaseName(arcadeToolName);
  if (mappedName === "NotionToolkit.SearchByTitle") {
    return {
      query: cleanString(args.query || args.customer_name || args.title),
      limit: clampNumber(args.page_size || args.limit, 1, 100, notionSearchLimit),
      order_by: "descending"
    };
  }
  if (mappedName === "NotionToolkit.GetPageContentById") {
    const pageIdSource = cleanString(args.page_id || args.page_id_or_url || args.id);
    return { page_id: extractNotionId(pageIdSource) || pageIdSource };
  }
  if (mappedName === "NotionToolkit.GetPageContentByTitle") {
    return { title: cleanString(args.title || args.page_id_or_url || args.query) };
  }
  if (mappedName === "Github.GetUserOpenItems") {
    return { per_page: clampNumber(args.per_page, 1, 100, 30) };
  }
  if (mappedName === "NotionToolkit.CreatePage") {
    const description = cleanString(args.description);
    const owner = cleanString(args.owner);
    const dueDate = cleanString(args.due_date);
    const actionType = cleanString(args.action_type);
    return {
      parent_title: cleanString(args.destination) || "Cooper Follow-ups",
      title: cleanString(args.title),
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
      query: cleanString(args.query),
      sources: Array.isArray(args.sources) ? args.sources.map(cleanString).filter(Boolean) : undefined,
      customer_or_account: cleanString(args.customer_or_account) || undefined,
      time_range: cleanString(args.time_range) || undefined
    };
  }
  if (name === "get_customer_context") {
    return {
      customer_name: cleanString(args.customer_name),
      include: Array.isArray(args.include) ? args.include.map(cleanString).filter(Boolean) : undefined
    };
  }
  if (name === "search_notion_workspace") {
    return {
      query: cleanString(args.query),
      filter: cleanString(args.filter) || undefined,
      page_size: clampNumber(args.page_size, 1, 10, notionSearchLimit)
    };
  }
  if (name === "fetch_notion_page") {
    return {
      page_id_or_url: cleanString(args.page_id_or_url),
      include_blocks: args.include_blocks !== false,
      max_blocks: clampNumber(args.max_blocks, 1, 100, notionBlockLimit)
    };
  }
  if (name === "inspect_engineering_context") {
    return {
      query: cleanString(args.query),
      repo: cleanString(args.repo) || undefined,
      ticket_id: cleanString(args.ticket_id) || undefined,
      include_code: Boolean(args.include_code)
    };
  }
  if (name === "create_followup_action") {
    return {
      action_type: cleanString(args.action_type),
      title: cleanString(args.title),
      description: cleanString(args.description) || undefined,
      owner: cleanString(args.owner) || undefined,
      due_date: cleanString(args.due_date) || undefined,
      destination: cleanString(args.destination) || undefined
    };
  }
  return safeAuditObject(args);
}

function normalizeArcadeThrownError(name, arcadeToolName, error, connectorMeta) {
  const message = cleanString(error?.message || error) || "Arcade request failed.";
  const needsAuth = /authorization|authorize|auth/i.test(message);
  return {
    status: "error",
    tool: name,
    code: arcadeErrorCode(error) || (needsAuth ? "arcade_authorization_required" : "arcade_request_failed"),
    connector: "arcade",
    connectorMeta,
    recoverable: true,
    arcadeToolName,
    message: needsAuth
      ? "Arcade says this tool needs authorization. Open the Arcade connection flow for this tool and retry."
      : message
  };
}

function arcadeToolBaseName(value) {
  return cleanString(value).split("@")[0];
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
    create_followup_action: "Follow-up actions"
  }[name] || toolAliases[name] || name;
}

function missingArcadeKeyPayload() {
  return {
    ok: false,
    code: "missing_arcade_api_key",
    configured: false,
    error: "Missing ARCADE_API_KEY in the native broker environment."
  };
}

function arcadeErrorPayload(error, fallback) {
  return {
    ok: false,
    code: arcadeErrorCode(error),
    sdk: arcadeSdkStatus(),
    error: cleanString(error?.message || error) || fallback || "Arcade request failed."
  };
}

function arcadeErrorCode(error) {
  return cleanString(error?.code) || (arcadeSdkLoadError ? "arcade_sdk_unavailable" : "arcade_request_failed");
}

function arcadeErrorStatus(error, fallbackStatus = 500) {
  const status = Number(error?.statusCode || error?.status);
  return Number.isFinite(status) ? status : fallbackStatus;
}

async function withTimeout(promise, ms, timeoutMessage) {
  try {
    const value = await Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), ms))
    ]);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, value: null, error: cleanString(error?.message || error) || timeoutMessage };
  }
}

function notionToken() {
  return process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || "";
}

async function notionRequest(path, options = {}) {
  const response = await fetch(`https://api.notion.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion,
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(async () => ({ message: await response.text().catch(() => "") }));
  if (!response.ok) {
    return {
      status: "error",
      tool: "notion",
      code: cleanString(payload.code) || `http_${response.status}`,
      connector: "notion",
      recoverable: true,
      message: cleanString(payload.message) || `Notion request failed with ${response.status}.`
    };
  }
  return payload;
}

function normalizeNotionSearchResults(results = []) {
  if (!Array.isArray(results)) {
    return [];
  }
  return results.slice(0, 10).map((item) => ({
    id: cleanString(item.id),
    object: cleanString(item.object),
    title: notionTitle(item) || "Untitled",
    url: cleanString(item.url || item.public_url),
    lastEditedTime: cleanString(item.last_edited_time),
    archived: Boolean(item.archived || item.in_trash || item.is_archived),
    parent: notionParentLabel(item.parent)
  }));
}

function normalizeNotionBlocks(results = []) {
  if (!Array.isArray(results)) {
    return [];
  }
  return results.map(notionBlockToMarkdown).filter(Boolean).slice(0, 50);
}

function notionBlockToMarkdown(block) {
  const type = cleanString(block?.type);
  const value = block?.[type] || {};
  const text = richTextPlain(value.rich_text || value.caption || value.title || []);
  if (!type) {
    return null;
  }
  if (type === "heading_1") return { type, markdown: `## ${text || "Untitled heading"}` };
  if (type === "heading_2") return { type, markdown: `### ${text || "Untitled heading"}` };
  if (type === "heading_3") return { type, markdown: `#### ${text || "Untitled heading"}` };
  if (type === "bulleted_list_item") return { type, markdown: `- ${text}` };
  if (type === "numbered_list_item") return { type, markdown: `1. ${text}` };
  if (type === "to_do") return { type, markdown: `- [${value.checked ? "x" : " "}] ${text}` };
  if (type === "quote") return { type, markdown: `> ${text}` };
  if (type === "code") return { type, markdown: `\`\`\`${cleanString(value.language)}\n${text}\n\`\`\`` };
  if (type === "child_page") return { type, markdown: `- Page: ${cleanString(value.title) || "Untitled"}` };
  if (type === "child_database") return { type, markdown: `- Database: ${cleanString(value.title) || "Untitled"}` };
  if (type === "divider") return { type, markdown: "---" };
  if (text) return { type, markdown: text };
  return null;
}

function notionTitle(item) {
  if (!item || typeof item !== "object") {
    return "";
  }
  if (Array.isArray(item.title)) {
    return richTextPlain(item.title);
  }
  const properties = item.properties && typeof item.properties === "object" ? item.properties : {};
  for (const property of Object.values(properties)) {
    if (property?.type === "title") {
      return richTextPlain(property.title);
    }
  }
  return "";
}

function richTextPlain(parts = []) {
  return (Array.isArray(parts) ? parts : [])
    .map((part) => cleanString(part.plain_text || part.text?.content || part.mention?.plain_text))
    .filter(Boolean)
    .join("");
}

function notionParentLabel(parent) {
  if (!parent || typeof parent !== "object") {
    return "";
  }
  if (parent.type === "workspace") return "workspace";
  return cleanString(parent[parent.type] || parent.type);
}

async function searchFiles(query, workspaceRoots = [approvedWorkspace]) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) {
    return { status: "error", message: "Missing search query." };
  }

  const results = [];
  const skippedRoots = [];
  const seenFiles = new Set();
  const maxScanTotal = 1800;
  const maxScanPerRoot = Math.max(300, Math.ceil(maxScanTotal / Math.max(workspaceRoots.length, 1)));
  let scanned = 0;

  async function walk(root, dir, rootState) {
    if (scanned > maxScanTotal || rootState.scanned > maxScanPerRoot || results.length >= 12) {
      return;
    }

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      if (dir === root) {
        skippedRoots.push(root);
      }
      return;
    }

    for (const entry of entries) {
      if (shouldSkip(entry.name)) {
        continue;
      }

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(root, fullPath, rootState);
        continue;
      }

      if (!entry.isFile() || isProbablyBinary(entry.name)) {
        continue;
      }

      scanned += 1;
      rootState.scanned += 1;
      const fileKey = await realpath(fullPath).catch(() => fullPath);
      if (seenFiles.has(fileKey)) {
        continue;
      }
      seenFiles.add(fileKey);

      const resultPath = displayWorkspacePath(root, fullPath);
      const nameMatch = `${resultPath} ${fullPath}`.toLowerCase().includes(cleanQuery);
      let snippet = "";

      try {
        const fileStat = await stat(fullPath);
        if (fileStat.size <= maxFileBytes) {
          const text = await readFile(fullPath, "utf8");
          const lowerText = text.toLowerCase();
          const index = lowerText.indexOf(cleanQuery);
          if (index >= 0) {
            snippet = makeSnippet(text, index, cleanQuery.length);
          }
        }
      } catch {
        continue;
      }

      if (nameMatch || snippet) {
        results.push({
          name: basename(fullPath),
          path: resultPath,
          workspaceRoot: root,
          snippet: snippet || "Path match"
        });
      }

      if (results.length >= 12 || scanned > maxScanTotal || rootState.scanned > maxScanPerRoot) {
        break;
      }
    }
  }

  const searchRoots = [...workspaceRoots].sort((a, b) => {
    if (a === approvedWorkspace) return 1;
    if (b === approvedWorkspace) return -1;
    return 0;
  });
  for (const root of searchRoots) {
    if (scanned > maxScanTotal || results.length >= 12) {
      break;
    }
    await walk(root, root, { scanned: 0 });
  }
  return {
    status: "ok",
    query,
    workspaceRoot: approvedWorkspace,
    workspaceRoots,
    skippedRoots,
    results
  };
}

async function readWorkspaceFile(inputPath, workspaceRoots = [approvedWorkspace]) {
  const { fullPath, displayPath, root } = await resolveWorkspacePath(inputPath, workspaceRoots);
  const fileStat = await stat(fullPath);
  if (!fileStat.isFile()) {
    return { status: "error", message: "Path is not a file.", path: inputPath };
  }
  if (fileStat.size > maxFileBytes * 2) {
    return { status: "error", message: "File is too large for MVP read_file.", path: inputPath };
  }

  const text = await readFile(fullPath, "utf8");
  return {
    status: "ok",
    path: displayWorkspacePath(root, displayPath),
    workspaceRoot: root,
    content: text.slice(0, maxReadChars),
    truncated: text.length > maxReadChars
  };
}

async function resolveWorkspacePath(inputPath, workspaceRoots = [approvedWorkspace]) {
  const cleanPath = cleanString(inputPath);
  if (!cleanPath) {
    throw new Error("Missing file path.");
  }

  const absoluteInput = isAbsolute(cleanPath);
  const candidates = absoluteInput
    ? [{ target: resolve(cleanPath), displayPath: cleanPath }]
    : workspaceRoots.map((root) => {
      const target = resolve(root, cleanPath);
      return { target, displayPath: target };
    });

  for (const candidate of candidates) {
    const root = findWorkspaceRoot(candidate.target, workspaceRoots);
    if (!root) {
      continue;
    }

    const realTarget = await realpath(candidate.target).catch(() => candidate.target);
    const realRoot = await realpath(root).catch(() => root);
    if (!isInside(realRoot, realTarget)) {
      continue;
    }

    return { fullPath: realTarget, displayPath: candidate.displayPath, root };
  }

  throw new Error("Path is outside the approved workspace allowlist.");
}

function findWorkspaceRoot(target, workspaceRoots = [approvedWorkspace]) {
  const normalizedTarget = resolve(target);
  return [...workspaceRoots]
    .map((root) => resolve(root))
    .sort((a, b) => b.length - a.length)
    .find((root) => isInside(root, normalizedTarget)) || "";
}

function displayWorkspacePath(root, fullPath) {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(fullPath);
  if (normalizedRoot === approvedWorkspace) {
    return relative(normalizedRoot, normalizedPath) || basename(normalizedPath);
  }
  return fullPath;
}

function normalizeToolName(name) {
  const text = String(name || "");
  const map = {
    "canvas.show_card": "canvas_show_card",
    "canvas.show_table": "canvas_show_table",
    "local.search_files": "local_search_files",
    "local.read_file": "local_read_file",
    "search_workspace_context": "search_workspace_context",
    "search_notion_workspace": "search_notion_workspace",
    "fetch_notion_page": "fetch_notion_page",
    "get_customer_context": "get_customer_context",
    "inspect_engineering_context": "inspect_engineering_context",
    "create_followup_action": "create_followup_action",
    "notion.search": "notion_search",
    "notion.fetch_page": "notion_fetch_page",
    "run_gstack_skill": "run_gstack_skill",
    "open_chrome_tab": "open_chrome_tab",
    "search_web": "search_web",
    "click_link_with_vision": "click_link_with_vision",
    "open_local_app": "open_local_app",
    "open_web_app": "open_web_app",
    "open_finder_location": "open_finder_location",
    "open_terminal_workspace": "open_terminal_workspace",
    "app.open_url": "app_open_url",
    "app.copy_to_clipboard": "app_copy_to_clipboard"
  };
  return map[text] || text;
}

function readHeader(req, name) {
  const value = req.headers[name];
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return "";
  }
  try {
    return decodeURIComponent(String(raw));
  } catch {
    return String(raw);
  }
}

function isInside(root, target) {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${sep}`);
}

function shouldSkip(name) {
  return [
    ".git",
    ".build",
    ".DS_Store",
    "node_modules",
    "dist",
    "build",
    "DerivedData",
    "data"
  ].includes(name);
}

function isProbablyBinary(name) {
  return [
    ".app",
    ".avi",
    ".bin",
    ".dmg",
    ".gif",
    ".heic",
    ".icns",
    ".jpeg",
    ".jpg",
    ".mov",
    ".mp3",
    ".mp4",
    ".pdf",
    ".png",
    ".sqlite",
    ".webp",
    ".zip"
  ].includes(extname(name).toLowerCase());
}

function makeSnippet(text, index, queryLength) {
  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + queryLength + 180);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function readBody(req, limit) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readRawBody(req, limit) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function mimeType(pathname) {
  switch (extname(pathname).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
