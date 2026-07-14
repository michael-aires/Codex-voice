const DEFAULT_MAX_PLAN_CHARS = 120_000;

export function derivePlanTitle(plan) {
  if (typeof plan !== "string") return "";
  const lines = plan.split(/\r?\n/);
  let fallback = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^#+$/.test(trimmed)) continue;
    const heading = /^#{1,6}\s+(.+)$/.exec(trimmed);
    if (heading) return boundedLabel(heading[1]);
    if (!fallback) fallback = trimmed;
  }

  return boundedLabel(fallback);
}

export function isLoopbackAddress(address) {
  if (typeof address !== "string") return false;
  const value = address.trim().toLowerCase();
  return value === "127.0.0.1"
    || value === "::1"
    || value === "::ffff:127.0.0.1"
    || value === "localhost";
}

export function normalizePlanIngest(input = {}, options = {}) {
  const maxChars = boundedInteger(options.maxChars, 1_200, 500_000, DEFAULT_MAX_PLAN_CHARS);
  const rawPlan = typeof input.plan === "string" ? input.plan.trim() : "";
  if (!rawPlan) return { error: "plan is required." };

  const plan = rawPlan.slice(0, maxChars);
  const repo = boundedLabel(input.repo, 120);
  const source = boundedLabel(input.source, 120) || "chat-with-plan";
  const title = boundedLabel(input.title) || derivePlanTitle(plan) || "Imported Cooper plan";

  return {
    plan,
    title,
    repo,
    source,
    truncated: rawPlan.length > plan.length,
    originalChars: rawPlan.length,
    storedChars: plan.length
  };
}

function boundedLabel(value, maxChars = 80) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars)
    .trim();
}

function boundedInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}
