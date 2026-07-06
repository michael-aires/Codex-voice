import { buildComputerUseTaskInput } from "../src/computerUseTasks.js";

const desktopApps = [
  ["claude code", "Claude Code"],
  ["visual studio code", "Visual Studio Code"],
  ["vs code", "Visual Studio Code"],
  ["google chrome", "Google Chrome"],
  ["chrome", "Google Chrome"],
  ["spotify", "Spotify"],
  ["claude", "Claude"],
  ["safari", "Safari"],
  ["slack", "Slack"],
  ["notion", "Notion"],
  ["finder", "Finder"],
  ["terminal", "Terminal"],
  ["codex", "Codex"]
];

export function classifyPushToTalkCommand(text = "") {
  const clean = normalizeText(text);
  if (!clean) return { kind: "empty" };

  if (/\b(stop|cancel|pause|hands off|take hands off|kill it|stop computer|stop control)\b/i.test(clean)) {
    return { kind: "stop_computer" };
  }

  const clickTarget = extractClickTarget(clean);
  if (clickTarget) {
    return {
      kind: "local_tool",
      tool: "click_link_with_vision",
      arguments: {
        link_description: clickTarget
      }
    };
  }

  const searchQuery = extractSearchQuery(clean);
  if (searchQuery) {
    return {
      kind: "local_tool",
      tool: "search_web",
      arguments: {
        query: searchQuery,
        browser: "chrome"
      }
    };
  }

  if (/\b(open|new)\s+(chrome|google chrome)\s+(tab|window)\b/i.test(clean)) {
    return {
      kind: "local_tool",
      tool: "open_chrome_tab",
      arguments: {
        url: extractUrl(clean) || "about:blank"
      }
    };
  }

  const url = extractUrl(clean);
  const appName = extractAppName(clean);
  const wantsComputer =
    /\b(open|launch|download|control|click|browse|go to|pull up|show me|work in|use my computer|computer use)\b/i.test(clean) ||
    Boolean(url) ||
    Boolean(appName);

  if (wantsComputer) {
    return {
      kind: "computer_task",
      mode: modeForCommand(clean, { url, appName }),
      appName,
      targetUrl: url,
      allowedDomains: url ? [domainFromUrl(url)].filter(Boolean) : []
    };
  }

  return { kind: "cooper_response" };
}

export function buildPushToTalkComputerTaskInput(text = "", overrides = {}) {
  const classification = classifyPushToTalkCommand(text);
  const mode = overrides.mode || classification.mode || "desktop_app";
  const targetUrl = overrides.targetUrl || classification.targetUrl || "";
  const appName = overrides.appName || classification.appName || "";
  const allowedDomains = overrides.allowedDomains || classification.allowedDomains || [];

  return buildComputerUseTaskInput({
    mode,
    goal: text,
    app_name: appName,
    target_url: targetUrl,
    allowed_domains: allowedDomains,
    requested_by: overrides.requestedBy || "push_to_talk"
  });
}

export function pushToTalkConfigFromEnv(env = process.env) {
  return {
    enabled: true,
    serverUrl: env.COOPER_PTT_SERVER_URL || `http://127.0.0.1:${env.PORT || 5000}`,
    tokenConfigured: Boolean(env.COOPER_PTT_TOKEN),
    defaultHotkey: env.COOPER_PTT_HOTKEY || "control+option+space",
    helperConfigPath: "~/.cooper/push-to-talk.json",
    helperBinary: "native/push-to-talk/cooper-ptt"
  };
}

function modeForCommand(text, { url, appName }) {
  if (/\b(download|save this|grab this file)\b/i.test(text)) return "download";
  if (/\bcodex bridge\b/i.test(text)) return "codex_bridge";
  if (/\bcodex\b/i.test(text) && !appName) return "codex_bridge";
  if (url) return "open_url";
  return "desktop_app";
}

function extractAppName(text) {
  const lower = text.toLowerCase();
  const match = desktopApps.find(([needle]) => lower.includes(needle));
  return match?.[1] || "";
}

function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0]?.replace(/[.,!?)]$/, "") || "";
}

function extractSearchQuery(text) {
  const match = text.match(/\b(?:search|google|look up|find)\s+(?:for\s+)?(.+)/i);
  if (!match) return "";
  return normalizeText(match[1])
    .replace(/\b(?:in chrome|on google|on the web|please)$/i, "")
    .trim();
}

function extractClickTarget(text) {
  const match = text.match(/\b(?:click|open|choose|select)\s+(?:the\s+)?(?:link|result|search result|page|button)?\s*(?:for|called|named|that says)?\s*(.+)/i);
  if (!match || !/\b(click|choose|select)\b/i.test(text)) return "";
  return normalizeText(match[1])
    .replace(/\b(?:please|on the page|in chrome|in safari)$/i, "")
    .trim();
}

function domainFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}
