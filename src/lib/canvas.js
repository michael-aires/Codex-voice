// Pure, side-effect-free helpers shared between the server and tests.

const MERMAID_KEYWORDS = [
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "mindmap",
  "timeline"
];

function trim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHtml(value) {
  return `${trim(value)}\n`;
}

// Strip "<!-- Cooper step N: ... -->" draft markers and any other HTML comments
// that the multi-step draft accumulator injects, so they cannot confuse scanning.
function stripCooperMarkers(value) {
  return String(value || "").replace(/<!--\s*Cooper step[\s\S]*?-->/gi, "");
}

// Extract a complete standalone HTML document from arbitrary model output.
// Handles: clean doctype docs, fenced ```html blocks, drafts containing
// "<!-- Cooper step N -->" markers plus a doctype, and returns "" for prose only.
export function extractHtmlDocument(value) {
  const raw = trim(value);
  if (!raw) return "";

  const text = trim(stripCooperMarkers(raw));
  if (!text) return "";

  const fenced = [...text.matchAll(/```(?:html)?\s*([\s\S]*?)```/gi)]
    .map((match) => trim(match[1]))
    .filter((candidate) => /<html[\s>]|<!doctype html/i.test(candidate));
  if (fenced.length) return normalizeHtml(fenced[fenced.length - 1]);

  const lower = text.toLowerCase();
  const doctypeIndex = lower.lastIndexOf("<!doctype html");
  if (doctypeIndex >= 0) return normalizeHtml(text.slice(doctypeIndex));

  const htmlIndex = lower.lastIndexOf("<html");
  if (htmlIndex >= 0) return normalizeHtml(`<!doctype html>\n${text.slice(htmlIndex)}`);

  return "";
}

// Strip markdown code fences (optionally tagged "mermaid") and trim.
export function sanitizeMermaid(value) {
  let text = trim(value);
  if (!text) return "";

  const fenceMatch = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = trim(fenceMatch[1]);
  } else {
    // Remove any stray leading/trailing fence lines.
    text = text
      .replace(/^```(?:mermaid)?\s*/i, "")
      .replace(/```\s*$/i, "");
    text = trim(text);
  }

  return text;
}

// True when the (already sanitized) text begins with a known mermaid keyword.
export function isValidMermaid(value) {
  const text = trim(value);
  if (!text) return false;
  const firstLine = text.split(/\r?\n/).find((line) => trim(line).length > 0) || "";
  const head = trim(firstLine);
  return MERMAID_KEYWORDS.some((keyword) => {
    const re = new RegExp(`^${keyword}\\b`, "i");
    return re.test(head);
  });
}

// Decide which worker lane a canvas job should run on based on the speed hint.
// "fast" and undefined route to the fast worker lane; "quality" routes to the
// paced quality lane (the post-call worker / createResponse with workModel).
export function pickCanvasLane(speed) {
  return speed === "quality" ? "quality" : "fast";
}

// Build a prompt that asks the model to apply a change to existing canvas
// content and return the full updated artifact only. Pure string builder.
export function buildUpdatePrompt(type, existingContent, instruction) {
  const safeType = trim(type) || "artifact";
  const change = trim(instruction);
  const current = typeof existingContent === "string" ? existingContent : "";
  return `Here is the current ${safeType}. Apply this change and return the full updated ${safeType} only: ${change}\n\nCURRENT:\n${current}`;
}

// Turn a title into a safe filename slug. Lowercases, strips unsafe characters,
// collapses whitespace/separators to single hyphens, and trims hyphens.
function slugify(value) {
  const base = trim(value).toLowerCase();
  const slug = base
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "canvas-item";
}

// Compute the download filename + mime type for a canvas item. Pure.
// mermaid -> .mmd/text/plain, html|wireframe -> .html/text/html,
// markdown -> .md/text/markdown. Falls back to .txt/text/plain.
export function canvasItemDownload(item) {
  const type = trim(item?.type);
  const slug = slugify(item?.title || type || "canvas-item");
  if (type === "mermaid") {
    return { filename: `${slug}.mmd`, mimeType: "text/plain" };
  }
  if (type === "html" || type === "wireframe") {
    return { filename: `${slug}.html`, mimeType: "text/html" };
  }
  if (type === "markdown") {
    return { filename: `${slug}.md`, mimeType: "text/markdown" };
  }
  return { filename: `${slug}.txt`, mimeType: "text/plain" };
}
