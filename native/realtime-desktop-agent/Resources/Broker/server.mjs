import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3417);
const webRoot = resolve(process.env.WEB_ROOT || join(__dirname, "../Web"));
const approvedWorkspace = resolve(process.env.APPROVED_WORKSPACE || process.cwd());
const model = process.env.REALTIME_AGENT_MODEL || "gpt-realtime-2";
const voice = process.env.REALTIME_VOICE || "marin";
const transcriptionModel = process.env.REALTIME_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
const maxBodyBytes = 2 * 1024 * 1024;
const maxFileBytes = 1024 * 1024;
const maxReadChars = 18000;

const toolAliases = Object.freeze({
  canvas_show_card: "canvas.show_card",
  canvas_show_table: "canvas.show_table",
  local_search_files: "local.search_files",
  local_read_file: "local.read_file",
  app_open_url: "app.open_url",
  app_copy_to_clipboard: "app.copy_to_clipboard"
});

const toolDefinitions = [
  {
    type: "function",
    name: "canvas_show_card",
    description: "Render canvas.show_card. Use when information should persist visually beside the call.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        markdown: { type: "string" }
      },
      required: ["title", "markdown"]
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
        rows: { type: "array", items: { type: "object" } }
      },
      required: ["title", "columns", "rows"]
    }
  },
  {
    type: "function",
    name: "local_search_files",
    description: `Run local.search_files inside the approved workspace only: ${approvedWorkspace}. Return paths and snippets.`,
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
    description: `Run local.read_file inside the approved workspace only: ${approvedWorkspace}. Ask before reading sensitive files.`,
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

const agentInstructions = `
You are a macOS realtime desktop copilot.

Speak naturally and briefly. Prefer voice for conversational answers. Prefer the canvas when information is visual, structured, persistent, or easier to scan than hear.

Use local tools only when the user asks about files, workspace context, links, summaries, or local actions. Be transparent about what you are accessing. Ask before reading private-looking files. Never silently automate apps.

Tool mapping:
- canvas.show_card is available as function canvas_show_card.
- canvas.show_table is available as function canvas_show_table.
- local.search_files is available as function local_search_files.
- local.read_file is available as function local_read_file.
- app.open_url is available as function app_open_url.
- app.copy_to_clipboard is available as function app_copy_to_clipboard.

The local file tools are confined to the approved workspace: ${approvedWorkspace}.
`;

const sessionConfig = {
  type: "realtime",
  model,
  instructions: agentInstructions,
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
        create_response: true,
        interrupt_response: true
      }
    },
    output: { voice }
  },
  tools: toolDefinitions,
  tool_choice: "auto"
};

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
        tools: Object.values(toolAliases)
      });
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
    console.error(error);
    sendJson(res, 500, { error: "Broker request failed.", detail: String(error?.message || error) });
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
  fd.set("sdp", sdp);
  fd.set("session", JSON.stringify(sessionConfig));

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

async function handleTool(req, res) {
  const payload = JSON.parse(await readBody(req, maxBodyBytes) || "{}");
  const name = normalizeToolName(payload.name);
  const args = payload.arguments && typeof payload.arguments === "object" ? payload.arguments : {};

  try {
    let output;
    switch (name) {
      case "local_search_files":
        output = await searchFiles(String(args.query || ""));
        break;
      case "local_read_file":
        output = await readWorkspaceFile(String(args.path || ""));
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

async function searchFiles(query) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) {
    return { status: "error", message: "Missing search query." };
  }

  const results = [];
  let scanned = 0;

  async function walk(dir) {
    if (scanned > 1800 || results.length >= 12) {
      return;
    }

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldSkip(entry.name)) {
        continue;
      }

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile() || isProbablyBinary(entry.name)) {
        continue;
      }

      scanned += 1;
      const relativePath = relative(approvedWorkspace, fullPath);
      const nameMatch = relativePath.toLowerCase().includes(cleanQuery);
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
          path: relativePath,
          snippet: snippet || "Path match"
        });
      }

      if (results.length >= 12 || scanned > 1800) {
        break;
      }
    }
  }

  await walk(approvedWorkspace);
  return {
    status: "ok",
    query,
    workspaceRoot: approvedWorkspace,
    results
  };
}

async function readWorkspaceFile(inputPath) {
  const fullPath = resolveWorkspacePath(inputPath);
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
    path: relative(approvedWorkspace, fullPath),
    content: text.slice(0, maxReadChars),
    truncated: text.length > maxReadChars
  };
}

function resolveWorkspacePath(inputPath) {
  const target = resolve(approvedWorkspace, inputPath);
  if (!isInside(approvedWorkspace, target)) {
    throw new Error("Path is outside the approved workspace.");
  }
  return target;
}

function normalizeToolName(name) {
  const text = String(name || "");
  const map = {
    "canvas.show_card": "canvas_show_card",
    "canvas.show_table": "canvas_show_table",
    "local.search_files": "local_search_files",
    "local.read_file": "local_read_file",
    "app.open_url": "app_open_url",
    "app.copy_to_clipboard": "app_copy_to_clipboard"
  };
  return map[text] || text;
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
