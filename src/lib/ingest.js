// Pure helpers for the chat-with-plan ingest endpoint. No fs/network access so
// these stay trivially unit-testable and safe to import anywhere.

// Derive a short, human-readable title from a plan's text. Prefers the first
// markdown heading (stripping leading #'s); otherwise the first non-empty line.
// Whitespace is collapsed and the result is capped at ~80 chars. Returns "" if
// nothing usable is found.
export function deriveTitleFromPlan(plan) {
  if (typeof plan !== "string") return "";

  const lines = plan.split(/\r?\n/);

  let candidate = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const headingMatch = /^#{1,6}\s+(.*\S.*)$/.exec(trimmed);
    if (headingMatch) {
      candidate = headingMatch[1];
      break;
    }
    // A line that is only #'s (e.g. "###") carries no usable title text; skip
    // it and keep looking at later lines.
    if (/^#+$/.test(trimmed)) continue;
    // First non-empty line as a fallback when no heading appears first.
    candidate = trimmed;
    break;
  }

  if (!candidate) return "";

  const collapsed = candidate.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";

  if (collapsed.length <= 80) return collapsed;
  return collapsed.slice(0, 80).trim();
}

// Treat an address as loopback for the local ingest endpoint. We accept the
// usual loopback forms plus undefined/empty (unknown local origin in dev).
export function isLoopbackAddress(addr) {
  if (addr === undefined || addr === null || addr === "") return true;
  if (typeof addr !== "string") return false;
  const value = addr.trim().toLowerCase();
  if (value === "") return true;
  return (
    value === "127.0.0.1"
    || value === "::1"
    || value === "::ffff:127.0.0.1"
    || value === "localhost"
  );
}
