export const computerUseSkillIds = Object.freeze([
  "computer_use_desktop",
  "computer_use_browser",
  "codex_app_server"
]);

export const computerUseModes = Object.freeze([
  "desktop_app",
  "browser",
  "open_url",
  "download",
  "codex_desktop",
  "codex_bridge"
]);

export function isComputerUseTask(task = {}) {
  return computerUseSkillIds.includes(clean(task.skill));
}

export function mapComputerUseModeToSkill(mode = "", targetUrl = "") {
  const cleanMode = clean(mode);
  if (cleanMode === "codex_bridge") return "codex_app_server";
  if (["browser", "open_url", "download"].includes(cleanMode)) return "computer_use_browser";
  if (targetUrl && /^https?:\/\//i.test(targetUrl)) return "computer_use_browser";
  return "computer_use_desktop";
}

export function buildComputerUseTaskInput(args = {}) {
  const mode = clean(args.mode || args.action_type || args.actionType || "desktop_app");
  const targetUrl = clean(args.target_url || args.targetUrl);
  const appName = clean(args.app_name || args.appName);
  const target = clean(args.target || args.file_name || args.fileName);
  const goal = clean(args.goal || args.request || args.command);
  const skill = mapComputerUseModeToSkill(mode, targetUrl);
  const allowedDomains = Array.isArray(args.allowed_domains || args.allowedDomains)
    ? (args.allowed_domains || args.allowedDomains).map(clean).filter(Boolean)
    : splitDomains(args.allowed_domains || args.allowedDomains);
  const title = taskTitle({ mode, appName, targetUrl, target, skill });
  const fullGoal = [
    goal || "Run a supervised Computer Use task.",
    appName ? `Desktop app: ${appName}` : "",
    target ? `Target: ${target}` : "",
    targetUrl ? `Target URL: ${targetUrl}` : "",
    `Requested mode: ${mode || "desktop_app"}`,
    "Pause for approval before login, purchase, external communication, destructive changes, production-impacting changes, commits, pushes, or downloads from unknown sources."
  ].filter(Boolean).join("\n");

  return {
    skill,
    title,
    goal: fullGoal,
    targetUrl,
    allowedDomains,
    computerIntent: {
      mode: mode || "desktop_app",
      appName,
      target,
      targetUrl,
      requestedBy: clean(args.requested_by || args.requestedBy || "voice")
    }
  };
}

function taskTitle({ mode, appName, targetUrl, target, skill }) {
  if (appName) return `Computer Use: ${appName}`;
  if (targetUrl) return `Computer Use: ${URLSafe(targetUrl).host || "browser task"}`;
  if (target) return `Computer Use: ${target}`;
  if (skill === "codex_app_server") return "Computer Use: Codex bridge";
  if (["browser", "open_url", "download"].includes(clean(mode))) return "Computer Use browser task";
  return "Computer Use desktop task";
}

function splitDomains(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map(clean)
    .filter(Boolean);
}

function URLSafe(value) {
  try {
    return new URL(value);
  } catch {
    return { host: "" };
  }
}

function clean(value) {
  return String(value || "").trim();
}
