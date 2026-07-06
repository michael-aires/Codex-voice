import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const localComputerToolNames = Object.freeze([
  "open_chrome_tab",
  "search_web",
  "click_link_with_vision",
  "open_local_app",
  "open_web_app",
  "open_finder_location",
  "open_terminal_workspace"
]);

const browserApps = {
  chrome: "Google Chrome",
  "google chrome": "Google Chrome",
  safari: "Safari"
};

const webApps = {
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
};

export function localComputerToolDefinitions() {
  return localComputerToolNames.map((name) => ({ name }));
}

export async function executeLocalComputerTool(name, args = {}, options = {}) {
  const cleanName = clean(name);
  logLocalComputerTool("call", cleanName, args);

  try {
    let result;
    switch (cleanName) {
      case "open_chrome_tab":
        result = await openChromeTab(args);
        break;
      case "search_web":
        result = await searchWeb(args);
        break;
      case "click_link_with_vision":
        result = await clickLinkWithVision(args, options);
        break;
      case "open_local_app":
        result = await openLocalApp(args, options);
        break;
      case "open_web_app":
        result = await openWebApp(args);
        break;
      case "open_finder_location":
        result = await openFinderLocation(args);
        break;
      case "open_terminal_workspace":
        result = await openTerminalWorkspace(args);
        break;
      default:
        result = {
          status: "error",
          tool: cleanName,
          message: `Unknown local computer tool: ${cleanName || "(missing)"}`
        };
    }
    logLocalComputerTool("result", cleanName, result);
    return result;
  } catch (error) {
    const result = {
      status: "error",
      tool: cleanName,
      message: error.message || "Local computer tool failed."
    };
    logLocalComputerTool("error", cleanName, result);
    return result;
  }
}

export function logLocalComputerTool(phase, name, payload = {}) {
  const safePayload = redactLargePayload(payload);
  console.log(`[cooper-tool:${phase}] ${name} ${JSON.stringify(safePayload)}`);
}

export function buildSearchUrl(query, engine = "google") {
  const cleanQuery = clean(query);
  const encoded = encodeURIComponent(cleanQuery);
  if (clean(engine).toLowerCase() === "duckduckgo") return `https://duckduckgo.com/?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

export function normalizeBrowserName(browser = "chrome") {
  return browserApps[clean(browser).toLowerCase()] || "Google Chrome";
}

export function parseVisionClickJson(value = "") {
  const text = String(value || "").trim();
  const json = text.match(/```json\s*([\s\S]*?)```/i)?.[1] || text.match(/\{[\s\S]*\}/)?.[0] || text;
  try {
    const parsed = JSON.parse(json);
    return {
      x: Number.isFinite(Number(parsed.x)) ? Number(parsed.x) : null,
      y: Number.isFinite(Number(parsed.y)) ? Number(parsed.y) : null,
      confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 0,
      reason: clean(parsed.reason)
    };
  } catch {
    return { x: null, y: null, confidence: 0, reason: "The vision model did not return parseable JSON." };
  }
}

async function openChromeTab(args = {}) {
  const url = clean(args.url || args.target_url || args.targetUrl || "about:blank") || "about:blank";
  await runAppleScript(chromeTabScript(url));
  return {
    status: "completed",
    tool: "open_chrome_tab",
    browser: "Google Chrome",
    url,
    message: `Opened a new Chrome tab${url === "about:blank" ? "" : ` at ${url}`}.`
  };
}

async function searchWeb(args = {}) {
  const query = clean(args.query || args.q || args.text);
  if (!query) return { status: "error", tool: "search_web", message: "Search query is required." };

  const browser = normalizeBrowserName(args.browser || "chrome");
  const url = buildSearchUrl(query, args.engine || "google");

  try {
    if (browser === "Safari") {
      await runAppleScript(safariSearchScript(query));
    } else {
      await runAppleScript(chromeSearchScript(query));
    }
  } catch (error) {
    await openUrlInBrowser(url, browser);
    return {
      status: "completed",
      tool: "search_web",
      browser,
      query,
      url,
      fallback: true,
      message: `Opened search results for "${query}" by URL because typed search was unavailable: ${error.message}`
    };
  }

  return {
    status: "completed",
    tool: "search_web",
    browser,
    query,
    url,
    message: `Typed "${query}" into ${browser} and pressed Enter.`
  };
}

async function clickLinkWithVision(args = {}, options = {}) {
  const description = clean(args.link_description || args.description || args.target || args.text);
  if (!description) {
    return { status: "error", tool: "click_link_with_vision", message: "Describe the link or result to click." };
  }

  const screenshot = await takeScreenshot();
  try {
    const location = await locateClickTargetWithVision(screenshot.path, description, options);
    if (location.x === null || location.y === null || location.confidence < Number(args.min_confidence || 0.35)) {
      return {
        status: "not_found",
        tool: "click_link_with_vision",
        description,
        confidence: location.confidence,
        reason: location.reason || "The requested link was not confidently located."
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

async function openLocalApp(args = {}, options = {}) {
  const appName = clean(args.app_name || args.appName || args.name || args.app);
  if (!appName) return { status: "error", tool: "open_local_app", message: "App name is required." };

  const allowed = allowedApps(options.env).find((candidate) => candidate.toLowerCase() === appName.toLowerCase());
  if (!allowed) {
    return {
      status: "blocked",
      tool: "open_local_app",
      appName,
      message: `${appName} is not in COOPER_COMPUTER_USE_ALLOWED_APPS.`
    };
  }

  await execFileAsync("open", ["-a", allowed]);
  return {
    status: "completed",
    tool: "open_local_app",
    appName: allowed,
    message: `Opened ${allowed}.`
  };
}

async function openWebApp(args = {}) {
  const name = clean(args.app || args.web_app || args.webApp || args.name).toLowerCase();
  const url = webApps[name] || clean(args.url || args.target_url || args.targetUrl);
  if (!url) {
    return {
      status: "error",
      tool: "open_web_app",
      message: `Unknown web app "${name || "(missing)"}".`
    };
  }
  const browser = normalizeBrowserName(args.browser || "chrome");
  await openUrlInBrowser(url, browser);
  return {
    status: "completed",
    tool: "open_web_app",
    browser,
    app: name || url,
    url,
    message: `Opened ${name || url} in ${browser}.`
  };
}

async function openFinderLocation(args = {}) {
  const path = clean(args.path || args.location || args.folder) || process.env.HOME || ".";
  await execFileAsync("open", [path]);
  return {
    status: "completed",
    tool: "open_finder_location",
    path,
    message: `Opened ${path} in Finder.`
  };
}

async function openTerminalWorkspace(args = {}) {
  const cwd = clean(args.cwd || args.path || args.working_directory || args.workingDirectory) || process.env.HOME || ".";
  const command = clean(args.command);
  const execute = args.execute === true || args.confirmed === true;

  await execFileAsync("open", ["-a", "Terminal", cwd]);
  if (command && execute) {
    await runAppleScript(terminalCommandScript(cwd, command));
  }

  return {
    status: "completed",
    tool: "open_terminal_workspace",
    cwd,
    commandPrepared: Boolean(command),
    commandExecuted: Boolean(command && execute),
    message: command && !execute
      ? "Opened Terminal. Command was not executed because execute/confirmed was not true."
      : `Opened Terminal at ${cwd}.`
  };
}

async function locateClickTargetWithVision(screenshotPath, description, options = {}) {
  const env = options.env || process.env;
  if (!env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY for vision click.");

  const model = env.COOPER_VISION_CLICK_MODEL || env.COOPER_WORK_MODEL || "gpt-5.4";
  const image = await readFile(screenshotPath);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "cooper-local-vision-click"
    },
    body: JSON.stringify({
      model,
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

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `Vision click failed with ${response.status}.`);
  return parseVisionClickJson(extractOutputText(payload));
}

async function takeScreenshot() {
  const dir = await mkdtemp(join(tmpdir(), "cooper-click-"));
  const path = join(dir, "screen.png");
  await execFileAsync("screencapture", ["-x", path]);
  const size = await imageSize(path);
  return {
    dir,
    path,
    summary: size
  };
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
  } catch {
    // Fall through to screenshot points when desktop bounds are unavailable.
  }
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

function allowedApps(env = process.env) {
  const configured = env?.COOPER_COMPUTER_USE_ALLOWED_APPS;
  const defaults = "Spotify,Claude,Claude Code,Google Chrome,Safari,Slack,Notion,Finder,Terminal,Visual Studio Code,Codex";
  return String(configured || defaults).split(",").map(clean).filter(Boolean);
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function redactLargePayload(payload = {}) {
  const clone = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (/token|key|secret|password|authorization/i.test(key)) {
      clone[key] = "[redacted]";
    } else if (typeof value === "string" && value.length > 500) {
      clone[key] = `${value.slice(0, 497)}...`;
    } else {
      clone[key] = value;
    }
  }
  return clone;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function appleString(value) {
  return JSON.stringify(String(value || ""));
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
